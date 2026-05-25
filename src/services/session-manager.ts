import { spawn, ChildProcess, execSync } from 'child_process';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { v4 as uuid } from 'uuid';
import { getDb } from '../db';
import { broadcast } from '../broadcast';
import type { Task, Project } from '../types';

function getManagerPort(): number {
  return parseInt(process.env.CLAUDE_KANBAN_PORT || '14567', 10);
}
const WORKTREE_PREFIX = 'kanban-';

const runningProcesses = new Map<string, ChildProcess>();
const recentOutput = new Map<string, string>();
const stopRequests = new Map<string, Promise<boolean>>();

interface DecisionOption {
  label: string;
  description?: string;
}

interface ParsedRunOutput {
  resultText: string | null;
  lastAssistantText: string | null;
}

type ExitOutcome =
  | { kind: 'reviewing' }
  | { kind: 'needs_decision'; question: string; options: DecisionOption[]; context: string };

export function getRecentOutput(taskId: string): string {
  return recentOutput.get(taskId) || '';
}

function getDataDir(): string {
  return process.env.CLAUDE_KANBAN_DATA_DIR || path.join(os.homedir(), '.claude-kanban');
}

async function checkClaudeAvailable(): Promise<boolean> {
  return new Promise((resolve) => {
    const proc = spawn('which', ['claude'], { shell: true, stdio: 'ignore' });
    proc.on('close', (code) => resolve(code === 0));
    proc.on('error', () => resolve(false));
  });
}

function getWorktreeName(taskId: string): string {
  return `${WORKTREE_PREFIX}${taskId}`;
}

function isGitRepo(dir: string): boolean {
  try {
    execSync(`git -C "${dir}" rev-parse --git-dir`, { stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

export function findWorktreeByTask(workingDir: string, taskId: string): { path: string; branch: string } | null {
  try {
    const output = execSync(`git -C "${workingDir}" worktree list --porcelain`, { stdio: 'pipe' }).toString();
    const blocks = output.split('\n\n');
    for (const block of blocks) {
      const lines = block.trim().split('\n');
      let wtPath = '';
      let branch = '';
      for (const line of lines) {
        if (line.startsWith('worktree ')) wtPath = line.slice('worktree '.length);
        if (line.startsWith('branch ')) branch = line.slice('branch '.length).replace('refs/heads/', '');
      }
      if (matchesTask(wtPath, taskId) || matchesTask(branch, taskId)) {
        return { path: wtPath, branch };
      }
    }
    return null;
  } catch {
    return null;
  }
}

function matchesTask(text: string, taskId: string): boolean {
  const idx = text.lastIndexOf(WORKTREE_PREFIX);
  if (idx === -1) return false;
  const suffix = text.slice(idx + WORKTREE_PREFIX.length);
  return taskId.startsWith(suffix) || suffix.startsWith(taskId);
}

export function cleanupWorktree(workingDir: string, taskId: string, keepBranch = false): void {
  try {
    const entry = findWorktreeByTask(workingDir, taskId);
    if (entry) {
      execSync(`git -C "${workingDir}" worktree remove "${entry.path}" --force`, { stdio: 'pipe' });
      if (!keepBranch) {
        execSync(`git -C "${workingDir}" branch -D "${entry.branch}"`, { stdio: 'pipe' });
      }
    }
  } catch (e) {
    console.error(`[SessionManager] Failed to cleanup worktree for task ${taskId}:`, (e as Error).message);
  }
}

function findBranchByTask(workingDir: string, taskId: string): string | null {
  try {
    const output = execSync(`git -C "${workingDir}" branch --list`, { stdio: 'pipe' }).toString();
    const lines = output.split('\n');
    for (const line of lines) {
      const name = line.replace(/^[* ]\s*/, '');
      if (matchesTask(name, taskId)) return name;
    }
    return null;
  } catch {
    return null;
  }
}

function ensureWorktree(workingDir: string, taskId: string): string | null {
  const existing = findWorktreeByTask(workingDir, taskId);
  if (existing) return existing.path;

  const branch = findBranchByTask(workingDir, taskId);
  if (!branch) return null;

  const wtPath = path.join(workingDir, '.claude/worktrees', branch.replace(/^worktree-/, ''));
  try {
    execSync(`git -C "${workingDir}" worktree add "${wtPath}" "${branch}"`, { stdio: 'pipe' });
    return wtPath;
  } catch (e) {
    console.error(`[SessionManager] Failed to recreate worktree from branch ${branch}:`, (e as Error).message);
    return null;
  }
}

export function getRunningCount(): number {
  return runningProcesses.size;
}

const GRACEFUL_SHUTDOWN_MS = 5000;

export function isSessionActive(taskId: string): boolean {
  return runningProcesses.has(taskId);
}

function isStopRequested(taskId: string): boolean {
  return stopRequests.has(taskId);
}

export function stopSessionManager(taskId: string): Promise<boolean> {
  const existingStop = stopRequests.get(taskId);
  if (existingStop) return existingStop;

  const proc = runningProcesses.get(taskId);
  if (!proc) return Promise.resolve(false);

  let forceKillTimer: NodeJS.Timeout | null = null;
  let forceCleanupTimer: NodeJS.Timeout | null = null;

  const stopPromise = new Promise<boolean>((resolve) => {
    let settled = false;
    const cleanup = () => {
      if (settled) return;
      settled = true;
      if (forceKillTimer) clearTimeout(forceKillTimer);
      if (forceCleanupTimer) clearTimeout(forceCleanupTimer);
      proc.removeListener('close', cleanup);
      proc.removeListener('exit', cleanup);
      proc.removeListener('error', cleanup);
      resolve(true);
    };

    proc.once('close', cleanup);
    proc.once('exit', cleanup);
    proc.once('error', cleanup);

    try {
      const signaled = proc.kill('SIGINT');
      if (!signaled) {
        console.log(`[SessionManager] SIGINT was not delivered for task ${taskId}; waiting for process cleanup`);
      }
    } catch (e) {
      console.error(`[SessionManager] Failed to send SIGINT for task ${taskId}:`, (e as Error).message);
      cleanup();
      return;
    }

    forceKillTimer = setTimeout(() => {
      if (runningProcesses.get(taskId) === proc) {
        console.log(`[SessionManager] Task ${taskId} did not exit gracefully after ${GRACEFUL_SHUTDOWN_MS}ms, sending SIGKILL`);
        proc.kill('SIGKILL');
      }

      forceCleanupTimer = setTimeout(() => {
        if (runningProcesses.get(taskId) === proc) {
          runningProcesses.delete(taskId);
          cleanup();
        }
      }, 1000);
    }, GRACEFUL_SHUTDOWN_MS);
  });

  stopRequests.set(taskId, stopPromise);
  stopPromise.finally(() => {
    if (stopRequests.get(taskId) === stopPromise) stopRequests.delete(taskId);
  }).catch(() => {});

  return stopPromise;
}

export async function startTask(taskId: string): Promise<void> {
  const available = await checkClaudeAvailable();
  if (!available) {
    throw new Error(
      'claude CLI not found. Install it first:\n' +
      '  npm install -g @anthropic-ai/claude-code\n' +
      'See: https://docs.anthropic.com/en/docs/claude-code/overview'
    );
  }

  const db = getDb();
  const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(taskId) as Task | undefined;
  if (!task) throw new Error('Task not found');
  if (runningProcesses.has(taskId)) throw new Error('Task is already running');

  const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(task.project_id) as Project | undefined;
  if (!project) throw new Error('Project not found');

  return launchSession(task, project.working_dir);
}

async function launchSession(task: Task, workingDir: string): Promise<void> {
  const db = getDb();
  const sessionId = task.session_id || generateSessionId(task.id);

  const hooksDir = path.join(getDataDir(), 'hooks');
  if (!fs.existsSync(hooksDir)) fs.mkdirSync(hooksDir, { recursive: true });

  const hooksConfigPath = path.join(hooksDir, `${task.id}.json`);
  const protocolPath = path.join(hooksDir, `${task.id}-protocol.md`);
  const mcpConfigPath = path.join(hooksDir, `${task.id}-mcp.json`);

  writeHooksConfig(hooksConfigPath, task.id);
  writeProtocolFile(protocolPath);
  writeMcpConfig(mcpConfigPath);

  const useWorktree = !!task.use_worktree && isGitRepo(workingDir);
  if (useWorktree) {
    cleanupWorktree(workingDir, task.id);
  }

  // Capture initial git commit before Claude starts working
  let initialCommit: string | null = null;
  if (useWorktree) {
    try {
      initialCommit = execSync(`git -C "${workingDir}" rev-parse HEAD`, { stdio: 'pipe' }).toString().trim();
    } catch (e) {
      console.error(`[SessionManager] Failed to capture initial commit for task ${task.id}:`, (e as Error).message);
    }
  }

  db.prepare(`UPDATE tasks SET status = 'running', session_id = ?, initial_commit = ?, checkpoint_commit = NULL, summary = NULL, updated_at = datetime('now') WHERE id = ?`)
    .run(sessionId, initialCommit, task.id);

  const env = {
    ...process.env,
    PATH: process.env.PATH,
  };

  const args = [
    '-p', task.description,
    '--session-id', sessionId,
    ...(useWorktree ? ['-w', getWorktreeName(task.id)] : []),
    '--output-format', 'stream-json',
    '--verbose',
    '--permission-mode', 'bypassPermissions',
    '--settings', hooksConfigPath,
    '--mcp-config', mcpConfigPath,
    '--strict-mcp-config',
    '--append-system-prompt-file', protocolPath,
  ];

  console.log(`[SessionManager] Starting: claude ${args.join(' ')}`);

  const proc = spawn('claude', args, {
    cwd: workingDir,
    env,
    stdio: ['pipe', 'pipe', 'pipe'],
  });

  runningProcesses.set(task.id, proc);

  let stdout = '';
  let stderr = '';
  let seqCounter = 0;
  const logsDir = path.join(getDataDir(), 'logs');
  if (!fs.existsSync(logsDir)) fs.mkdirSync(logsDir, { recursive: true });
  const logFile = path.join(logsDir, `${task.id}.log`);

  let pendingChunks: { stream: 'stdout' | 'stderr'; text: string }[] = [];
  let flushTimer: NodeJS.Timeout | null = null;

  function flushChunks(): void {
    if (pendingChunks.length === 0) return;
    const batches = pendingChunks;
    pendingChunks = [];

    const stderrText = batches.filter(c => c.stream === 'stderr').map(c => c.text).join('');
    const stdoutText = batches.filter(c => c.stream === 'stdout').map(c => c.text).join('');

    if (stderrText) {
      broadcast({
        type: 'task_output',
        payload: { taskId: task.id, text: stderrText, stream: 'stderr', seq: seqCounter++ },
      });
      fs.appendFileSync(logFile, stderrText);
    }
    if (stdoutText) {
      broadcast({
        type: 'task_output',
        payload: { taskId: task.id, text: stdoutText, stream: 'stdout', seq: seqCounter++ },
      });
      fs.appendFileSync(logFile, stdoutText);
    }
  }

  proc.stdout?.on('data', (chunk: Buffer) => {
    const text = chunk.toString();
    stdout += text;
    recentOutput.set(task.id, stdout.slice(-5000));
    pendingChunks.push({ stream: 'stdout', text });
    if (!flushTimer) flushTimer = setTimeout(() => { flushTimer = null; flushChunks(); }, 100);
  });

  proc.stderr?.on('data', (chunk: Buffer) => {
    const text = chunk.toString();
    stderr += text;
    pendingChunks.push({ stream: 'stderr', text });
    if (!flushTimer) flushTimer = setTimeout(() => { flushTimer = null; flushChunks(); }, 100);
  });

  proc.on('close', (code) => {
    console.log(`[SessionManager] Task ${task.id} exited with code ${code}`);

    if (flushTimer) { clearTimeout(flushTimer); flushTimer = null; }
    flushChunks();

    runningProcesses.delete(task.id);
    recentOutput.delete(task.id);

    const currentTask = db.prepare('SELECT status FROM tasks WHERE id = ?').get(task.id) as { status: string } | undefined;
    if (currentTask?.status === 'stopped' || isStopRequested(task.id)) {
      console.log(`[SessionManager] Task ${task.id} was stopped by user, skipping completion check`);
    } else {
      checkAndHandleCompletion(task.id, stdout).catch(console.error);
    }

    try { fs.unlinkSync(hooksConfigPath); } catch {}
    try { fs.unlinkSync(protocolPath); } catch {}
    try { fs.unlinkSync(mcpConfigPath); } catch {}
  });

  proc.on('error', (err) => {
    console.error(`[SessionManager] Task ${task.id} error:`, err.message);
    runningProcesses.delete(task.id);
    db.prepare(`UPDATE tasks SET status = 'pending', updated_at = datetime('now') WHERE id = ?`).run(task.id);
  });

  const task_ = db.prepare('SELECT * FROM tasks WHERE id = ?').get(task.id) as any;
  if (useWorktree) task_._worktree = getWorktreeName(task.id);
  broadcast({ type: 'task_updated', payload: task_ });
}

function extractSummary(stdout: string): string {
  if (!stdout.trim()) return '[Claude 未输出内容，请查看会话历史]';
  try {
    const obj = JSON.parse(stdout.trim());
    if (obj.result && typeof obj.result === 'string') return obj.result.trim();
  } catch {
    const lines = stdout.trim().split('\n');
    let lastText = '';
    for (const line of lines) {
      try {
        const obj = JSON.parse(line);
        if (obj.type === 'result' && obj.result) lastText = obj.result;
      } catch { /* skip */ }
    }
    if (lastText) return lastText.trim();
  }
  return '[无法解析 Claude 输出，请查看会话历史]';
}

function parseRunOutput(stdout: string): ParsedRunOutput {
  let resultText: string | null = null;
  let lastAssistantText: string | null = null;
  let activeTextBlock: string | null = null;

  function captureText(text: unknown): void {
    if (typeof text !== 'string') return;
    const trimmed = text.trim();
    if (trimmed) lastAssistantText = trimmed;
  }

  for (const line of stdout.split('\n')) {
    if (!line.trim()) continue;

    try {
      const obj = JSON.parse(line) as any;

      if (obj.type === 'stream_event') {
        const ev = obj.event;
        if (!ev) continue;

        if (ev.type === 'content_block_start') {
          if (activeTextBlock !== null) captureText(activeTextBlock);
          activeTextBlock = ev.content_block?.type === 'text' ? '' : null;
          captureText(ev.content_block?.text);
        } else if (ev.type === 'content_block_delta') {
          const delta = ev.delta;
          if (activeTextBlock !== null && delta?.type === 'text_delta' && typeof delta.text === 'string') {
            activeTextBlock += delta.text;
          }
        } else if (ev.type === 'content_block_stop') {
          if (activeTextBlock !== null) captureText(activeTextBlock);
          activeTextBlock = null;
        }
        continue;
      }

      if (obj.type === 'assistant') {
        const contents = obj.message?.content || [];
        for (const c of contents) {
          if (c?.type === 'text') captureText(c.text);
        }
        continue;
      }

      if (obj.type === 'result' && typeof obj.result === 'string') {
        resultText = obj.result.trim();
      }
    } catch {
      // Ignore non-JSON warnings emitted alongside stream-json output.
    }
  }

  if (activeTextBlock !== null) captureText(activeTextBlock);
  return { resultText, lastAssistantText };
}

function normalizeText(text: string): string {
  return text.replace(/\r/g, '').replace(/[ \t]+/g, ' ').trim();
}

function extractQuestionText(text: string): string {
  const chunks = text
    .split(/\n{2,}/)
    .map(chunk => chunk.trim())
    .filter(Boolean);

  for (let i = chunks.length - 1; i >= 0; i--) {
    if (looksLikeDecisionRequest(chunks[i], false)) return chunks[i];
  }

  return text.trim();
}

function extractDecisionOptions(text: string): DecisionOption[] {
  const options: DecisionOption[] = [];
  const seen = new Set<string>();

  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    const match = trimmed.match(/^(?:[-*]\s*)?(?:\d+[\).、]|[A-Da-d][\).、]|方案\s*[A-Da-d一二三四五六]?[:：、.]?|选项\s*[A-Da-d一二三四五六]?[:：、.]?)\s*(.+)$/);
    if (!match) continue;

    const label = match[1].trim().replace(/\s+/g, ' ');
    if (label.length < 1 || label.length > 120 || seen.has(label)) continue;

    seen.add(label);
    options.push({ label });
  }

  if (options.length >= 2 && options.length <= 8) return options;

  if (/(是否|要不要|能否|可否|是否需要|do you want|would you like|should i)/i.test(text)) {
    return [{ label: '是' }, { label: '否' }];
  }

  return [];
}

function looksCompletionLike(text: string): boolean {
  return [
    /(^|\s)(done|completed|finished|ready for review|summary)\b/i,
    /(已完成|完成了|任务完成|可以验收|请验收|测试通过|构建通过|实现完成|修改完成|处理完毕)/,
  ].some(pattern => pattern.test(text));
}

function looksLikeReviewConfirmation(text: string): boolean {
  return [
    /(请确认|请检查|是否).{0,30}(验收|满意|通过|符合|完成|可以)/,
    /(please\s+(review|verify|confirm)|ready for review)/i,
  ].some(pattern => pattern.test(text));
}

function looksLikeDecisionRequest(text: string, suppressCompletion = true): boolean {
  const normalized = normalizeText(text);
  if (!normalized) return false;

  const hasQuestionMark = /[?？]/.test(normalized);
  const options = extractDecisionOptions(normalized);
  const hasOptions = options.length >= 2;
  const hasExplicitRequest = [
    /(请选择|请确认|请决定|请提供|请补充|请回复|请告诉我|需要你|麻烦你|等待你)/,
    /(please\s+(choose|confirm|decide|provide|select|reply)|waiting for you)/i,
  ].some(pattern => pattern.test(normalized));
  const hasDecisionTopic = [
    /(选择|确认|决定|提供|补充|回复|输入|采用哪个|选哪个|是否|要不要|能否|可否)/,
    /(choose|confirm|decide|provide|select|which|should i|do you want|would you like)/i,
  ].some(pattern => pattern.test(normalized));
  const hasContinueSignal = /(继续前|为了继续|下一步|才能继续|awaiting|before continuing|to continue)/i.test(normalized);

  if (suppressCompletion && looksCompletionLike(normalized) && !hasOptions && !hasContinueSignal && looksLikeReviewConfirmation(normalized)) {
    return false;
  }

  if (suppressCompletion && looksCompletionLike(normalized) && !hasExplicitRequest && !hasContinueSignal) {
    return false;
  }

  return (hasOptions && (hasExplicitRequest || hasQuestionMark || hasContinueSignal))
    || (hasQuestionMark && (hasExplicitRequest || hasDecisionTopic))
    || (hasContinueSignal && (hasExplicitRequest || hasDecisionTopic));
}

function classifyExitOutcome(stdout: string): ExitOutcome {
  const parsed = parseRunOutput(stdout);
  const candidate = parsed.resultText || parsed.lastAssistantText || '';
  const context = normalizeText(candidate).slice(-4000);

  if (!looksLikeDecisionRequest(context)) return { kind: 'reviewing' };

  const question = extractQuestionText(context).slice(-2000);
  return {
    kind: 'needs_decision',
    question,
    options: extractDecisionOptions(question),
    context,
  };
}

function createFallbackDecision(taskId: string, outcome: Extract<ExitOutcome, { kind: 'needs_decision' }>): void {
  const db = getDb();
  db.prepare(`INSERT INTO decisions (id, task_id, context, question, options)
    VALUES (?, ?, ?, ?, ?)`).run(
    uuid(),
    taskId,
    outcome.context,
    outcome.question,
    JSON.stringify(outcome.options)
  );

  db.prepare(`UPDATE tasks SET status = 'deciding', updated_at = datetime('now') WHERE id = ?`).run(taskId);

  const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(taskId);
  const decision = db.prepare('SELECT * FROM decisions WHERE task_id = ? AND answer IS NULL ORDER BY created_at DESC LIMIT 1').get(taskId);
  broadcast({ type: 'decision_created', payload: { task, decision } });
}

async function checkAndHandleCompletion(taskId: string, stdout: string): Promise<void> {
  const db = getDb();
  const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(taskId) as Task | undefined;
  if (!task) return;

  if (task.status === 'deciding' || task.status === 'reviewing' || task.status === 'done' || task.status === 'pending' || task.status === 'stopped') return;

  const outcome = classifyExitOutcome(stdout);
  if (outcome.kind === 'needs_decision') {
    console.log(`[SessionManager] Task ${taskId} exited with an unstructured question — marking as deciding`);
    createFallbackDecision(taskId, outcome);
    return;
  }

  const summary = extractSummary(stdout);

  // Capture git HEAD commit in the task's worktree
  let checkpointCommit: string | null = null;
  try {
    const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(task.project_id) as Project | undefined;
    if (project) {
      const wt = findWorktreeByTask(project.working_dir, taskId);
      if (wt) {
        checkpointCommit = execSync(`git -C "${wt.path}" rev-parse HEAD`, { stdio: 'pipe' }).toString().trim();
      } else {
        checkpointCommit = execSync(`git -C "${project.working_dir}" rev-parse HEAD`, { stdio: 'pipe' }).toString().trim();
      }
    }
  } catch (e) {
    console.error(`[SessionManager] Failed to capture checkpoint commit for task ${taskId}:`, (e as Error).message);
  }

  console.log(`[SessionManager] Task ${taskId} exited without signal — marking as reviewing, stdout=${stdout.length}B, summary="${summary.slice(0, 80)}", commit=${checkpointCommit?.slice(0, 8)}`);
  db.prepare(`UPDATE tasks SET status = 'reviewing', summary = ?, checkpoint_commit = ?, updated_at = datetime('now') WHERE id = ?`)
    .run(summary, checkpointCommit, taskId);

  const updated = db.prepare('SELECT * FROM tasks WHERE id = ?').get(taskId);
  broadcast({ type: 'task_updated', payload: updated });
}

export async function resumeSession(taskId: string, workingDir: string, injectMessage: string): Promise<void> {
  const db = getDb();
  const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(taskId) as Task | undefined;
  if (!task) throw new Error('Task not found');
  if (runningProcesses.has(taskId)) throw new Error('Task is already running');

  const hooksDir = path.join(getDataDir(), 'hooks');
  if (!fs.existsSync(hooksDir)) fs.mkdirSync(hooksDir, { recursive: true });

  const hooksConfigPath = path.join(hooksDir, `${task.id}.json`);
  const protocolPath = path.join(hooksDir, `${task.id}-protocol.md`);
  const mcpConfigPath = path.join(hooksDir, `${task.id}-mcp.json`);

  writeHooksConfig(hooksConfigPath, task.id);
  writeProtocolFile(protocolPath);
  writeMcpConfig(mcpConfigPath);

  const args = [
    '-p', injectMessage,
    '--resume', task.session_id || '',
    '--output-format', 'stream-json',
    '--verbose',
    '--permission-mode', 'bypassPermissions',
    '--settings', hooksConfigPath,
    '--mcp-config', mcpConfigPath,
    '--strict-mcp-config',
    '--append-system-prompt-file', protocolPath,
  ];

  const resumeCwd = ensureWorktree(workingDir, task.id) || workingDir;

  console.log(`[SessionManager] Resuming: claude ${args.join(' ')} (cwd=${resumeCwd})`);

  const proc = spawn('claude', args, {
    cwd: resumeCwd,
    stdio: 'pipe',
  });

  runningProcesses.set(taskId, proc);

  let resumeStdout = '';
  const logsDir = path.join(getDataDir(), 'logs');
  if (!fs.existsSync(logsDir)) fs.mkdirSync(logsDir, { recursive: true });
  const logFile = path.join(logsDir, `${taskId}.log`);

  let resumeSeqCounter = 0;
  let pendingChunks: { stream: 'stdout' | 'stderr'; text: string }[] = [];
  let flushTimer: NodeJS.Timeout | null = null;

  function flushChunks(): void {
    if (pendingChunks.length === 0) return;
    const batches = pendingChunks;
    pendingChunks = [];

    const stderrText = batches.filter(c => c.stream === 'stderr').map(c => c.text).join('');
    const stdoutText = batches.filter(c => c.stream === 'stdout').map(c => c.text).join('');

    if (stderrText) {
      broadcast({
        type: 'task_output',
        payload: { taskId, text: stderrText, stream: 'stderr', seq: resumeSeqCounter++ },
      });
      fs.appendFileSync(logFile, stderrText);
    }
    if (stdoutText) {
      broadcast({
        type: 'task_output',
        payload: { taskId, text: stdoutText, stream: 'stdout', seq: resumeSeqCounter++ },
      });
      fs.appendFileSync(logFile, stdoutText);
    }
  }

  proc.stdout?.on('data', (chunk: Buffer) => {
    const text = chunk.toString();
    resumeStdout += text;
    recentOutput.set(taskId, resumeStdout.slice(-5000));
    pendingChunks.push({ stream: 'stdout', text });
    if (!flushTimer) flushTimer = setTimeout(() => { flushTimer = null; flushChunks(); }, 100);
  });

  proc.stderr?.on('data', (chunk: Buffer) => {
    const text = chunk.toString();
    pendingChunks.push({ stream: 'stderr', text });
    if (!flushTimer) flushTimer = setTimeout(() => { flushTimer = null; flushChunks(); }, 100);
  });

  proc.on('close', (code) => {
    console.log(`[SessionManager] Resume for task ${taskId} exited with code ${code}`);
    if (flushTimer) { clearTimeout(flushTimer); flushTimer = null; }
    flushChunks();
    runningProcesses.delete(taskId);
    recentOutput.delete(taskId);

    const currentTask = db.prepare('SELECT status FROM tasks WHERE id = ?').get(taskId) as { status: string } | undefined;
    if (currentTask?.status === 'stopped' || isStopRequested(taskId)) {
      console.log(`[SessionManager] Task ${taskId} was stopped by user during resume, skipping completion check`);
    } else {
      checkAndHandleCompletion(taskId, resumeStdout).catch(console.error);
    }

    try { fs.unlinkSync(hooksConfigPath); } catch {}
    try { fs.unlinkSync(protocolPath); } catch {}
    try { fs.unlinkSync(mcpConfigPath); } catch {}
  });
}

function generateSessionId(_taskId: string): string {
  return uuid();
}

function writeHooksConfig(filePath: string, taskId: string): void {
  const hookUrl = `http://localhost:${getManagerPort()}/api/hooks/${taskId}`;

  const config = {
    allowedHttpHookUrls: [`http://localhost:${getManagerPort()}/*`],
    hooks: {
      PreToolUse: [
        {
          matcher: 'AskUserQuestion',
          hooks: [{
            type: 'http' as const,
            url: hookUrl,
            timeout: 10000,
          }],
        },
        {
          matcher: 'mcp__manager__mark_complete',
          hooks: [{
            type: 'http' as const,
            url: hookUrl,
            timeout: 10000,
          }],
        },
      ],
      PermissionRequest: [
        {
          matcher: '*',
          hooks: [{
            type: 'http' as const,
            url: hookUrl,
            timeout: 10000,
          }],
        },
      ],
    },
  };

  fs.writeFileSync(filePath, JSON.stringify(config, null, 2));
}

function writeProtocolFile(filePath: string): void {
  const protocol = `# Task Protocol

You are working on a task managed by Claude Kanban. Follow these critical rules:

## Decision Protocol
- When you need the user to make a choice or answer a question, you **MUST** use the **AskUserQuestion** tool.
- **NEVER** output a question as plain text and stop. Always use AskUserQuestion.
- If you output text before the question (analysis, options, reasoning), that is fine — it will be shown to the user as context before they answer.

## Completion Protocol
- When the task is complete, you **MUST call** the MCP tool: **mcp__manager__mark_complete(summary)**
- **NEVER** just output text saying you're done. Always call mcp__manager__mark_complete.
- The summary should concisely describe what was accomplished.

## Stop Protocol
- You may receive SIGINT (external stop) at any time. When this happens, your session state is automatically saved.
- The session can be resumed later via --resume, so do not worry about losing work.
- If you are in the middle of a tool call when stopped, the tool's partial output may be lost. Re-execute if needed after resume.

## Permission Protocol
- Permissions are handled automatically. Do not ask for permission approval.
- If a tool is blocked, report it in your summary instead.

## Important
- At the end of EACH turn, either you are asking a question (via AskUserQuestion), you are done (via mcp__manager__mark_complete), or you may be stopped externally (SIGINT).
`;
  fs.writeFileSync(filePath, protocol);
}

function writeMcpConfig(filePath: string): void {
  const config = {
    mcpServers: {
      manager: {
        type: 'http' as const,
        url: `http://localhost:${getManagerPort()}/mcp/sse`,
      },
    },
  };
  fs.writeFileSync(filePath, JSON.stringify(config, null, 2));
}
