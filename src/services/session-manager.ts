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

function findWorktreeByTask(workingDir: string, taskId: string): { path: string; branch: string } | null {
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

export function stopSessionManager(taskId: string): void {
  const proc = runningProcesses.get(taskId);
  if (!proc) return;

  proc.kill('SIGINT');

  const forceKillTimer = setTimeout(() => {
    if (runningProcesses.has(taskId)) {
      console.log(`[SessionManager] Task ${taskId} did not exit gracefully after ${GRACEFUL_SHUTDOWN_MS}ms, sending SIGKILL`);
      proc.kill('SIGKILL');
    }
  }, GRACEFUL_SHUTDOWN_MS);

  proc.once('exit', () => clearTimeout(forceKillTimer));
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
    if (currentTask?.status === 'stopped') {
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

  const task_ = db.prepare('SELECT * FROM tasks WHERE id = ?').get(task.id);
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

async function checkAndHandleCompletion(taskId: string, stdout: string): Promise<void> {
  const db = getDb();
  const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(taskId) as Task | undefined;
  if (!task) return;

  if (task.status === 'deciding' || task.status === 'reviewing' || task.status === 'done' || task.status === 'pending' || task.status === 'stopped') return;

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
    if (currentTask?.status === 'stopped') {
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
