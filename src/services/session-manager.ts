import { spawn, ChildProcess } from 'child_process';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { v4 as uuid } from 'uuid';
import { getDb } from '../db';
import { broadcast } from '../broadcast';
import type { Task, Project } from '../types';

const MANAGER_PORT = parseInt(process.env.PORT || '14567', 10);
const MAX_CONCURRENT = 3;

const runningProcesses = new Map<string, ChildProcess>();
const pendingQueue: string[] = [];

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

export function getPendingQueueLength(): number {
  return pendingQueue.length;
}

export function getRunningCount(): number {
  return runningProcesses.size;
}

export function stopSessionManager(taskId: string): void {
  const proc = runningProcesses.get(taskId);
  if (proc) {
    proc.kill('SIGTERM');
    runningProcesses.delete(taskId);
  }
  const idx = pendingQueue.indexOf(taskId);
  if (idx >= 0) pendingQueue.splice(idx, 1);
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

  if (runningProcesses.size >= MAX_CONCURRENT) {
    pendingQueue.push(taskId);
    return;
  }

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

  db.prepare(`UPDATE tasks SET status = 'running', session_id = ?, updated_at = datetime('now') WHERE id = ?`)
    .run(sessionId, task.id);

  const env = {
    ...process.env,
    PATH: process.env.PATH,
  };

  const args = [
    '-p', task.description,
    '--session-id', sessionId,
    '--output-format', 'stream-json',
    '--verbose',
    '--permission-mode', 'bypassPermissions',
    '--settings', hooksConfigPath,
    '--mcp-config', mcpConfigPath,
    '--strict-mcp-config',
    '--max-turns', String(task.max_turns),
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
    }
    if (stdoutText) {
      broadcast({
        type: 'task_output',
        payload: { taskId: task.id, text: stdoutText, stream: 'stdout', seq: seqCounter++ },
      });
    }
  }

  proc.stdout?.on('data', (chunk: Buffer) => {
    const text = chunk.toString();
    stdout += text;
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

    try {
      const lines = stdout.trim().split('\n');
      for (let i = lines.length - 1; i >= 0; i--) {
        const obj = JSON.parse(lines[i]);
        if (obj.type === 'result') {
          const cost = obj.total_cost_usd || 0;
          const turnCount = obj.num_turns || 0;
          db.prepare(`UPDATE tasks SET total_cost_usd = total_cost_usd + ?, current_turn = current_turn + ?, updated_at = datetime('now') WHERE id = ?`)
            .run(cost, turnCount, task.id);
          break;
        }
      }
    } catch {
      // Non-JSON output
    }

    checkAndHandleCompletion(task.id, stdout).catch(console.error);

    try { fs.unlinkSync(hooksConfigPath); } catch {}
    try { fs.unlinkSync(protocolPath); } catch {}
    try { fs.unlinkSync(mcpConfigPath); } catch {}

    processQueue();
  });

  proc.on('error', (err) => {
    console.error(`[SessionManager] Task ${task.id} error:`, err.message);
    runningProcesses.delete(task.id);
    db.prepare(`UPDATE tasks SET status = 'pending', updated_at = datetime('now') WHERE id = ?`).run(task.id);
    processQueue();
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

  if (task.status === 'deciding' || task.status === 'reviewing' || task.status === 'done' || task.status === 'pending') return;

  const summary = extractSummary(stdout);
  console.log(`[SessionManager] Task ${taskId} exited without signal — marking as reviewing, stdout=${stdout.length}B, summary="${summary.slice(0, 80)}"`);
  db.prepare(`UPDATE tasks SET status = 'reviewing', summary = ?, updated_at = datetime('now') WHERE id = ?`)
    .run(summary, taskId);

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
    '--max-turns', String(task.max_turns),
    '--append-system-prompt-file', protocolPath,
  ];

  console.log(`[SessionManager] Resuming: claude ${args.join(' ')}`);

  const proc = spawn('claude', args, {
    cwd: workingDir,
    stdio: 'pipe',
  });

  runningProcesses.set(taskId, proc);

  let resumeStdout = '';
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
    }
    if (stdoutText) {
      broadcast({
        type: 'task_output',
        payload: { taskId, text: stdoutText, stream: 'stdout', seq: resumeSeqCounter++ },
      });
    }
  }

  proc.stdout?.on('data', (chunk: Buffer) => {
    const text = chunk.toString();
    resumeStdout += text;
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
    checkAndHandleCompletion(taskId, resumeStdout).catch(console.error);
    try { fs.unlinkSync(hooksConfigPath); } catch {}
    try { fs.unlinkSync(protocolPath); } catch {}
    try { fs.unlinkSync(mcpConfigPath); } catch {}
  });
}

function processQueue(): void {
  if (pendingQueue.length > 0 && runningProcesses.size < MAX_CONCURRENT) {
    const taskId = pendingQueue.shift()!;
    const db = getDb();
    const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(taskId) as Task | undefined;
    const project = task ? db.prepare('SELECT * FROM projects WHERE id = ?').get(task.project_id) as Project | undefined : null;
    if (task && project) launchSession(task, project.working_dir);
  }
}

function generateSessionId(_taskId: string): string {
  return uuid();
}

function writeHooksConfig(filePath: string, taskId: string): void {
  const hookUrl = `http://localhost:${MANAGER_PORT}/api/hooks/${taskId}`;

  const config = {
    allowedHttpHookUrls: [`http://localhost:${MANAGER_PORT}/*`],
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

## Permission Protocol
- Permissions are handled automatically. Do not ask for permission approval.
- If a tool is blocked, report it in your summary instead.

## Important
- At the end of EACH turn, either you are asking a question (via AskUserQuestion) OR you are done (via mcp__manager__mark_complete).
- There is NO third option. Do not stop mid-work without one of these signals.
`;
  fs.writeFileSync(filePath, protocol);
}

function writeMcpConfig(filePath: string): void {
  const config = {
    mcpServers: {
      manager: {
        type: 'http' as const,
        url: `http://localhost:${MANAGER_PORT}/mcp/sse`,
      },
    },
  };
  fs.writeFileSync(filePath, JSON.stringify(config, null, 2));
}
