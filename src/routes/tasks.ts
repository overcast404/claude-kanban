import { Router, Request, Response } from 'express';
import { v4 as uuid } from 'uuid';
import { execSync } from 'child_process';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { getDb } from '../db';
import { broadcast } from '../broadcast';
import { Task, TaskCreateInput, Decision } from '../types';
import { startTask, resumeSession, stopSessionManager, getRunningCount, cleanupWorktree, findWorktreeByTask, isSessionActive } from '../services/session-manager';
import {
  MAX_GIT_OUTPUT_BYTES,
  captureWorkingTree,
  getParentCommit,
  isGitRepo as isGitRepoPath,
  resolveCommit,
  resolveTree,
  runGit,
} from '../services/git-snapshot';

function getDataDir(): string {
  return process.env.CLAUDE_KANBAN_DATA_DIR || path.join(os.homedir(), '.claude-kanban');
}

export const tasksRouter = Router();

const MAX_REVIEW_FILE_BYTES = 1024 * 256;

interface ReviewDiffContext {
  cwd: string;
  baseRef: string | null;
  compareRef: string | null;
  headLabel: string;
  worktreePath: string | null;
}

interface ReviewFileChange {
  path: string;
  previousPath?: string;
  status: string;
  additions: number;
  deletions: number;
  binary: boolean;
}

function enrichWorktree(task: Task, workingDir: string): Task {
  if (task.status !== 'running') return task;
  const wt = findWorktreeByTask(workingDir, task.id);
  return { ...task, _worktree: wt ? wt.branch : null };
}

function refExists(cwd: string, ref: string): boolean {
  return !!resolveTree(cwd, ref) || !!resolveCommit(cwd, ref);
}

function matchesKanbanTaskRef(text: string, taskId: string): boolean {
  const idx = text.lastIndexOf('kanban-');
  if (idx === -1) return false;
  const suffix = text.slice(idx + 'kanban-'.length);
  return taskId.startsWith(suffix) || suffix.startsWith(taskId);
}

function findBranchByTask(workingDir: string, taskId: string): string | null {
  try {
    const output = runGit(workingDir, ['branch', '--list'], 1024 * 1024);
    for (const line of output.split('\n')) {
      const name = line.replace(/^[* ]\s*/, '').trim();
      if (matchesKanbanTaskRef(name, taskId)) return name;
    }
  } catch {
    return null;
  }
  return null;
}

function safeRelativePath(value: unknown): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error('file path required');
  }
  const filePath = value.trim();
  if (path.isAbsolute(filePath) || filePath.split(/[\\/]/).includes('..')) {
    throw new Error('invalid file path');
  }
  return filePath;
}

function assertInsideDir(rootDir: string, relativePath: string): string {
  const root = path.resolve(rootDir);
  const absolutePath = path.resolve(rootDir, relativePath);
  if (absolutePath !== root && !absolutePath.startsWith(root + path.sep)) {
    throw new Error('invalid file path');
  }
  return absolutePath;
}

function buildDiffArgs(ctx: ReviewDiffContext, options: string[] = [], filePath?: string): string[] {
  const refs = ctx.baseRef
    ? (ctx.compareRef ? [ctx.baseRef, ctx.compareRef] : [ctx.baseRef])
    : ['HEAD'];
  return ['diff', '--find-renames', ...options, ...refs, '--', ...(filePath ? [filePath] : [])];
}

function parseNameStatus(output: string): Array<{ status: string; path: string; previousPath?: string }> {
  const tokens = output.split('\0').filter(Boolean);
  const entries: Array<{ status: string; path: string; previousPath?: string }> = [];

  for (let i = 0; i < tokens.length;) {
    const rawStatus = tokens[i++];
    if (!rawStatus) break;
    const status = rawStatus[0];

    if (status === 'R' || status === 'C') {
      const previousPath = tokens[i++];
      const nextPath = tokens[i++];
      if (nextPath) entries.push({ status, path: nextPath, previousPath });
    } else {
      const filePath = tokens[i++];
      if (filePath) entries.push({ status, path: filePath });
    }
  }

  return entries;
}

function readFileStats(ctx: ReviewDiffContext, filePath: string): Pick<ReviewFileChange, 'additions' | 'deletions' | 'binary'> {
  const output = runGit(ctx.cwd, buildDiffArgs(ctx, ['--numstat'], filePath), 1024 * 1024).trim();
  let additions = 0;
  let deletions = 0;
  let binary = false;

  for (const line of output.split('\n')) {
    if (!line.trim()) continue;
    const [added, deleted] = line.split('\t');
    if (added === '-' || deleted === '-') {
      binary = true;
      continue;
    }
    additions += Number.parseInt(added, 10) || 0;
    deletions += Number.parseInt(deleted, 10) || 0;
  }

  return { additions, deletions, binary };
}

function resolveBaseRef(task: Task, cwd: string, compareRef: string | null, useLiveWorktree: boolean): string | null {
  const savedBaseTree = resolveTree(cwd, task.base_tree);
  if (savedBaseTree) return savedBaseTree;

  const initialTree = resolveTree(cwd, task.initial_commit);
  if (initialTree) return initialTree;

  if (useLiveWorktree || !task.use_worktree) {
    const headTree = resolveTree(cwd, 'HEAD');
    if (headTree) return headTree;
  }

  const compareParent = getParentCommit(cwd, compareRef);
  if (compareParent) return compareParent;

  return resolveTree(cwd, 'HEAD');
}

function resolveReviewDiffContext(task: Task, project: { working_dir: string }, messageId?: string): ReviewDiffContext {
  const db = getDb();
  const foundWorktree = findWorktreeByTask(project.working_dir, task.id);
  const wt = foundWorktree && fs.existsSync(foundWorktree.path) ? foundWorktree : null;
  const branch = wt ? null : findBranchByTask(project.working_dir, task.id);
  const cwd = wt?.path || project.working_dir;

  if (!isGitRepoPath(cwd)) {
    throw new Error('Project is not a git repository');
  }

  const reviewMsg = messageId
    ? db.prepare(`
        SELECT id, checkpoint_commit, timestamp FROM chat_messages
        WHERE id = ? AND task_id = ? AND type = 'ai_review'
      `).get(messageId, task.id) as { id: string; checkpoint_commit: string | null; timestamp: string } | undefined
    : undefined;

  const checkpointCommit = reviewMsg?.checkpoint_commit || task.checkpoint_commit;
  let compareRef: string | null = null;
  let headLabel = '工作区';
  const useLiveWorktree = !!wt || !task.use_worktree;

  if (useLiveWorktree) {
    compareRef = captureWorkingTree(cwd);
  }

  if (!compareRef) {
    if (checkpointCommit && refExists(cwd, checkpointCommit)) {
      compareRef = checkpointCommit;
      headLabel = checkpointCommit.slice(0, 8);
    } else if (branch && refExists(cwd, branch)) {
      compareRef = branch;
      headLabel = branch;
    } else {
      compareRef = captureWorkingTree(cwd);
      headLabel = '工作区';
    }
  }

  const baseRef = resolveBaseRef(task, cwd, compareRef, useLiveWorktree);

  return {
    cwd,
    baseRef,
    compareRef,
    headLabel,
    worktreePath: wt?.path || null,
  };
}

function listReviewChanges(ctx: ReviewDiffContext): ReviewFileChange[] {
  const output = runGit(ctx.cwd, buildDiffArgs(ctx, ['--name-status', '-z']));
  const entries = parseNameStatus(output);

  return entries.map(entry => {
    const stats = readFileStats(ctx, entry.path);
    return {
      ...entry,
      ...stats,
    };
  });
}

function readReviewFileContent(ctx: ReviewDiffContext, filePath: string): { content: string; source: string; truncated: boolean } {
  const currentPath = assertInsideDir(ctx.cwd, filePath);
  let content: string;
  let source = ctx.headLabel;

  if (ctx.compareRef) {
    try {
      content = runGit(ctx.cwd, ['show', `${ctx.compareRef}:${filePath}`], MAX_REVIEW_FILE_BYTES + 1024);
    } catch {
      if (!ctx.baseRef) throw new Error('File not found');
      content = runGit(ctx.cwd, ['show', `${ctx.baseRef}:${filePath}`], MAX_REVIEW_FILE_BYTES + 1024);
      source = `${ctx.baseRef.slice(0, 8)}（已删除）`;
    }
  } else if (fs.existsSync(currentPath) && fs.statSync(currentPath).isFile()) {
    content = fs.readFileSync(currentPath, 'utf8');
    source = '工作区';
  } else if (ctx.baseRef) {
    content = runGit(ctx.cwd, ['show', `${ctx.baseRef}:${filePath}`], MAX_REVIEW_FILE_BYTES + 1024);
    source = `${ctx.baseRef.slice(0, 8)}（已删除）`;
  } else {
    throw new Error('File not found');
  }

  const truncated = Buffer.byteLength(content, 'utf8') > MAX_REVIEW_FILE_BYTES;
  return {
    content: truncated ? content.slice(0, MAX_REVIEW_FILE_BYTES) : content,
    source,
    truncated,
  };
}

// List tasks for a project (query: ?projectId=...)
tasksRouter.get('/', (req: Request, res: Response) => {
  const db = getDb();
  const { projectId } = req.query;
  if (!projectId) return res.status(400).json({ error: 'projectId query required' });

  const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(projectId as string) as any;
  const tasks = db.prepare(`
    SELECT * FROM tasks WHERE project_id = ? ORDER BY created_at DESC
  `).all(projectId as string) as Task[];

  if (project) {
    res.json(tasks.map(t => enrichWorktree(t, project.working_dir)));
  } else {
    res.json(tasks);
  }
});

// Get system status (must be before /:id routes)
tasksRouter.get('/status/system', (_req: Request, res: Response) => {
  res.json({
    running: getRunningCount(),
  });
});

// Get task with pending decision if in deciding status
tasksRouter.get('/:id', (req: Request, res: Response) => {
  const db = getDb();
  const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(req.params.id) as Task | undefined;
  if (!task) return res.status(404).json({ error: 'Task not found' });

  const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(task.project_id) as any;

  let pendingDecision: Decision | null = null;
  if (task.status === 'deciding') {
    pendingDecision = db.prepare(
      'SELECT * FROM decisions WHERE task_id = ? AND answer IS NULL ORDER BY created_at DESC LIMIT 1'
    ).get(task.id) as Decision | null;
  }

  res.json({ task: project ? enrichWorktree(task, project.working_dir) : task, pendingDecision });
});

// Get task output logs (byte-offset based)
tasksRouter.get('/:id/logs', (req: Request, res: Response) => {
  const logFile = path.join(getDataDir(), 'logs', `${req.params.id}.log`);
  if (!fs.existsSync(logFile)) return res.json({ text: '', offset: 0, eof: true });

  const offset = parseInt(req.query.offset as string) || 0;
  const stat = fs.statSync(logFile);
  if (offset >= stat.size) return res.json({ text: '', offset, eof: false });

  const buffer = Buffer.alloc(Math.min(stat.size - offset, 1024 * 1024));
  const fd = fs.openSync(logFile, 'r');
  fs.readSync(fd, buffer, 0, buffer.length, offset);
  fs.closeSync(fd);

  res.json({
    text: buffer.toString('utf-8'),
    offset: offset + buffer.length,
    eof: offset + buffer.length >= stat.size,
  });
});

// Get review change summary for the latest/referenced review bubble
tasksRouter.get('/:id/review-changes', (req: Request, res: Response) => {
  try {
    const db = getDb();
    const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(req.params.id) as Task | undefined;
    if (!task) return res.status(404).json({ error: 'Task not found' });

    const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(task.project_id) as { working_dir: string } | undefined;
    if (!project) return res.status(404).json({ error: 'Project not found' });

    const ctx = resolveReviewDiffContext(task, project, req.query.messageId as string | undefined);
    const files = listReviewChanges(ctx);
    const summary = files.reduce(
      (acc, file) => ({
        files: acc.files + 1,
        additions: acc.additions + file.additions,
        deletions: acc.deletions + file.deletions,
      }),
      { files: 0, additions: 0, deletions: 0 }
    );

    res.json({
      taskId: task.id,
      baseRef: ctx.baseRef,
      headRef: ctx.headLabel,
      worktreePath: ctx.worktreePath,
      summary,
      files,
    });
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

// Get a single changed file's diff or current content
tasksRouter.get('/:id/review-changes/file', (req: Request, res: Response) => {
  try {
    const db = getDb();
    const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(req.params.id) as Task | undefined;
    if (!task) return res.status(404).json({ error: 'Task not found' });

    const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(task.project_id) as { working_dir: string } | undefined;
    if (!project) return res.status(404).json({ error: 'Project not found' });

    const filePath = safeRelativePath(req.query.path);
    const mode = req.query.mode === 'content' ? 'content' : 'diff';
    const ctx = resolveReviewDiffContext(task, project, req.query.messageId as string | undefined);

    if (mode === 'content') {
      const file = readReviewFileContent(ctx, filePath);
      res.json({
        path: filePath,
        mode,
        content: file.content,
        source: file.source,
        truncated: file.truncated,
      });
      return;
    }

    const diff = runGit(
      ctx.cwd,
      buildDiffArgs(ctx, ['--no-ext-diff', '--src-prefix=a/', '--dst-prefix=b/'], filePath),
      MAX_REVIEW_FILE_BYTES + 1024
    );
    const truncated = Buffer.byteLength(diff, 'utf8') > MAX_REVIEW_FILE_BYTES;
    res.json({
      path: filePath,
      mode,
      content: truncated ? diff.slice(0, MAX_REVIEW_FILE_BYTES) : diff,
      source: `${ctx.baseRef?.slice(0, 8) || 'HEAD'} -> ${ctx.headLabel}`,
      truncated,
    });
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

// Create task
tasksRouter.post('/', (req: Request, res: Response) => {
  const { projectId } = req.query;
  if (!projectId) return res.status(400).json({ error: 'projectId query required' });

  const { title, description, use_worktree }: TaskCreateInput = req.body;
  if (!title) return res.status(400).json({ error: 'title required' });

  const db = getDb();
  const id = uuid();
  db.prepare(`
    INSERT INTO tasks (id, project_id, title, description, use_worktree)
    VALUES (?, ?, ?, ?, ?)
  `).run(id, projectId, title, description || '', use_worktree !== false ? 1 : 0);

  const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(id);
  broadcast({ type: 'task_created', payload: task });
  res.status(201).json(task);
});

// Update task status manually
tasksRouter.patch('/:id/status', (req: Request, res: Response) => {
  const { status } = req.body;
  const validStatuses = ['pending', 'running', 'deciding', 'reviewing', 'done', 'stopped'];
  if (!validStatuses.includes(status)) return res.status(400).json({ error: 'Invalid status' });

  const db = getDb();
  db.prepare('UPDATE tasks SET status = ?, updated_at = datetime(\'now\') WHERE id = ?')
    .run(status, req.params.id);

  const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(req.params.id);
  broadcast({ type: 'task_updated', payload: task });
  res.json(task);
});

// Get pending decision for a task
tasksRouter.get('/:id/decision', (req: Request, res: Response) => {
  const db = getDb();
  const decision = db.prepare(
    'SELECT * FROM decisions WHERE task_id = ? AND answer IS NULL ORDER BY created_at DESC LIMIT 1'
  ).get(req.params.id);
  if (!decision) return res.status(404).json({ error: 'No pending decision' });
  res.json(decision);
});

// Submit decision answer
tasksRouter.post('/:id/decide', (req: Request, res: Response) => {
  const { answer } = req.body;
  if (!answer) return res.status(400).json({ error: 'answer required' });

  const db = getDb();
  const decision = db.prepare(
    'SELECT * FROM decisions WHERE task_id = ? AND answer IS NULL ORDER BY created_at DESC LIMIT 1'
  ).get(req.params.id) as Decision | undefined;
  if (!decision) return res.status(404).json({ error: 'No pending decision' });

  db.prepare('UPDATE decisions SET answer = ?, resolved_at = datetime(\'now\') WHERE id = ?')
    .run(answer, decision.id);
  db.prepare('UPDATE tasks SET status = \'running\', updated_at = datetime(\'now\') WHERE id = ?')
    .run(req.params.id);

  const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(req.params.id);
  broadcast({ type: 'decision_resolved', payload: { task, answer } });

  const project = db.prepare('SELECT * FROM projects WHERE id = ?').get((task as Task).project_id) as any;
  if (project) {
    resumeSession(req.params.id, project.working_dir, answer).catch(console.error);
  }

  res.json({ task, answer });
});

// Approve task (reviewing -> done)
tasksRouter.post('/:id/approve', (req: Request, res: Response) => {
  const db = getDb();
  const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(req.params.id) as Task | undefined;
  if (!task) return res.status(404).json({ error: 'Task not found' });

  const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(task.project_id) as any;
  if (project) {
    cleanupWorktree(project.working_dir, task.id, true);
  }

  db.prepare('UPDATE tasks SET status = \'done\', updated_at = datetime(\'now\') WHERE id = ?')
    .run(req.params.id);
  const updated = db.prepare('SELECT * FROM tasks WHERE id = ?').get(req.params.id);
  broadcast({ type: 'task_updated', payload: updated });
  res.json(updated);
});

// Rewind code to a user_message (revert git state, trim conversation)
tasksRouter.post('/:id/rewind', (req: Request, res: Response) => {
  const { messageId } = req.body;
  if (!messageId) return res.status(400).json({ error: 'messageId required' });

  const db = getDb();
  const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(req.params.id) as Task | undefined;
  if (!task) return res.status(404).json({ error: 'Task not found' });
  if (task.status === 'done') return res.status(400).json({ error: 'Cannot rewind a done task' });

  // Find the user_message
  const userMsg = db.prepare(
    'SELECT * FROM chat_messages WHERE id = ? AND task_id = ? AND type = ?'
  ).get(messageId, req.params.id, 'user_message') as { id: string; content: string; timestamp: string; round: number } | undefined;
  if (!userMsg) return res.status(404).json({ error: 'User message not found' });

  // Find the target commit: the most recent ai_review BEFORE this user message
  const prevReview = db.prepare(`
    SELECT checkpoint_commit FROM chat_messages
    WHERE task_id = ? AND type = 'ai_review' AND timestamp < ?
    ORDER BY timestamp DESC LIMIT 1
  `).get(req.params.id, userMsg.timestamp) as { checkpoint_commit: string | null } | undefined;

  const targetCommit = prevReview?.checkpoint_commit || task.initial_commit;
  if (!targetCommit) return res.status(400).json({ error: 'No checkpoint commit found for rewind target' });

  // Stop any running Claude process
  stopSessionManager(req.params.id);

  // Reset git worktree to target commit
  const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(task.project_id) as any;
  if (project) {
    try {
      const useWorktree = (() => {
        try { execSync(`git -C "${project.working_dir}" rev-parse --git-dir`, { stdio: 'pipe' }); return true; } catch { return false; }
      })();
      if (useWorktree) {
        const wtList = execSync(`git -C "${project.working_dir}" worktree list --porcelain`, { stdio: 'pipe' }).toString();
        let wtPath = '';
        for (const block of wtList.split('\n\n')) {
          if (block.includes(task.id)) {
            for (const line of block.split('\n')) {
              if (line.startsWith('worktree ')) wtPath = line.slice('worktree '.length);
            }
            break;
          }
        }
        const cwd = wtPath || project.working_dir;
        execSync(`git -C "${cwd}" reset --hard "${targetCommit}"`, { stdio: 'pipe' });
      }
    } catch (e) {
      return res.status(500).json({ error: `Git reset failed: ${(e as Error).message}` });
    }
  }

  // Delete chat messages after this user_message
  db.prepare('DELETE FROM chat_messages WHERE task_id = ? AND timestamp > ?')
    .run(req.params.id, userMsg.timestamp);

  // Insert a system rewind marker
  const markerId = uuid();
  db.prepare(`
    INSERT INTO chat_messages (id, task_id, project_id, project_name, type, content, quote_message_id, round, timestamp)
    VALUES (?, ?, ?, ?, 'system', ?, ?, ?, datetime('now'))
  `).run(markerId, task.id, task.project_id, '', `⏪ 代码已回退到 ${userMsg.content.slice(0, 40)} 之前的状态`, messageId, userMsg.round);

  // Reset task to pending so user can restart
  db.prepare(`UPDATE tasks SET status = 'pending', updated_at = datetime('now') WHERE id = ?`).run(req.params.id);
  const updated = db.prepare('SELECT * FROM tasks WHERE id = ?').get(req.params.id);
  broadcast({ type: 'task_updated', payload: updated });

  res.json({ task: updated, rewindTarget: targetCommit.slice(0, 8) });
});

// Fork a new task from a user_message checkpoint
tasksRouter.post('/:id/fork', (req: Request, res: Response) => {
  const { messageId, mode } = req.body; // mode: 'fork' | 'fork-rewind'
  if (!messageId) return res.status(400).json({ error: 'messageId required' });

  const db = getDb();
  const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(req.params.id) as Task | undefined;
  if (!task) return res.status(404).json({ error: 'Task not found' });

  const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(task.project_id) as any;
  if (!project) return res.status(404).json({ error: 'Project not found' });

  // Find the user_message
  const userMsg = db.prepare(
    'SELECT * FROM chat_messages WHERE id = ? AND task_id = ? AND type = ?'
  ).get(messageId, req.params.id, 'user_message') as { id: string; content: string; timestamp: string; round: number } | undefined;
  if (!userMsg) return res.status(404).json({ error: 'User message not found' });

  // Find the target commit
  const prevReview = db.prepare(`
    SELECT checkpoint_commit FROM chat_messages
    WHERE task_id = ? AND type = 'ai_review' AND timestamp < ?
    ORDER BY timestamp DESC LIMIT 1
  `).get(req.params.id, userMsg.timestamp) as { checkpoint_commit: string | null } | undefined;

  const targetCommit = prevReview?.checkpoint_commit || task.initial_commit;

  // Create new task
  const newTaskId = uuid();
  db.prepare(`
    INSERT INTO tasks (id, project_id, title, description, status, use_worktree, created_at)
    VALUES (?, ?, ?, ?, 'pending', ?, datetime('now'))
  `).run(newTaskId, task.project_id, task.title, `${userMsg.content}（从任务分叉）`, task.use_worktree ? 1 : 0);

  // Copy chat messages up to and including the user_message
  const messages = db.prepare(`
    SELECT * FROM chat_messages WHERE task_id = ? AND timestamp <= ? ORDER BY timestamp ASC
  `).all(req.params.id, userMsg.timestamp) as any[];

  const insertStmt = db.prepare(`
    INSERT OR REPLACE INTO chat_messages (id, task_id, project_id, project_name, type, content, quote_message_id, decision_json, round, checkpoint_commit, timestamp)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  for (const msg of messages) {
    insertStmt.run(
      msg.id, newTaskId, msg.project_id, msg.project_name, msg.type,
      msg.content, msg.quote_message_id, msg.decision_json, msg.round, msg.checkpoint_commit, msg.timestamp
    );
  }

  // For fork-rewind: pre-create a git branch from the checkpoint commit
  if (mode === 'fork-rewind' && targetCommit && project.working_dir) {
    try {
      execSync(`git -C "${project.working_dir}" branch kanban-${newTaskId} "${targetCommit}"`, { stdio: 'pipe' });
    } catch (e) {
      console.error(`[Fork] Failed to create branch from checkpoint:`, (e as Error).message);
    }
  }

  const newTask = db.prepare('SELECT * FROM tasks WHERE id = ?').get(newTaskId);
  broadcast({ type: 'task_created', payload: newTask });

  res.status(201).json({ task: newTask, forkedFrom: req.params.id });
});

// Reject task (reviewing -> running) with feedback
tasksRouter.post('/:id/reject', (req: Request, res: Response) => {
  const { feedback } = req.body;
  const db = getDb();
  db.prepare('UPDATE tasks SET status = \'running\', updated_at = datetime(\'now\') WHERE id = ?')
    .run(req.params.id);
  const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(req.params.id);
  broadcast({ type: 'task_updated', payload: task });

  const project = db.prepare('SELECT * FROM projects WHERE id = ?').get((task as Task).project_id) as any;
  if (project) {
    resumeSession(req.params.id, project.working_dir, feedback || '请根据反馈修改，完成后给出简短总结并结束。').catch(console.error);
  }

  res.json({ task, feedback });
});

// Start task (spawn claude -p)
tasksRouter.post('/:id/start', async (req: Request, res: Response) => {
  try {
    await startTask(req.params.id);
    const db = getDb();
    const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(req.params.id);
    broadcast({ type: 'task_updated', payload: task });
    res.json(task);
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

// Stop task (ask Claude to save and exit gracefully)
tasksRouter.post('/:id/stop', async (req: Request, res: Response) => {
  try {
    const db = getDb();
    const existing = db.prepare('SELECT * FROM tasks WHERE id = ?').get(req.params.id) as Task | undefined;
    if (!existing) return res.status(404).json({ error: 'Task not found' });
    if (existing.status !== 'running') return res.status(400).json({ error: 'Only running tasks can be stopped' });

    const stopPromise = stopSessionManager(req.params.id);
    db.prepare(`UPDATE tasks SET status = 'stopped', updated_at = datetime('now') WHERE id = ?`).run(req.params.id);
    const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(req.params.id);
    broadcast({ type: 'task_updated', payload: task });
    await stopPromise;
    res.json(task);
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

// Resume a stopped task, optionally with a custom message
tasksRouter.post('/:id/resume', async (req: Request, res: Response) => {
  try {
    const { message } = req.body;

    const db = getDb();
    const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(req.params.id) as Task | undefined;
    if (!task) return res.status(404).json({ error: 'Task not found' });
    if (task.status !== 'stopped') return res.status(400).json({ error: 'Only stopped tasks can be resumed' });
    if (!task.session_id) return res.status(400).json({ error: 'Task has no session to resume' });
    if (isSessionActive(req.params.id)) return res.status(409).json({ error: 'Task is still stopping; try again shortly' });

    const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(task.project_id) as any;
    if (!project) return res.status(404).json({ error: 'Project not found' });

    db.prepare(`UPDATE tasks SET status = 'running', updated_at = datetime('now') WHERE id = ?`).run(req.params.id);
    const updated = db.prepare('SELECT * FROM tasks WHERE id = ?').get(req.params.id);
    broadcast({ type: 'task_updated', payload: updated });

    const resumeMessage = message || '请继续执行任务。';
    resumeSession(req.params.id, project.working_dir, resumeMessage).catch(console.error);
    res.json(updated);
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

// Edit task (only pending tasks that haven't been started)
tasksRouter.patch('/:id', (req: Request, res: Response) => {
  const { title, description } = req.body;
  const db = getDb();
  const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(req.params.id) as Task | undefined;
  if (!task) return res.status(404).json({ error: 'Task not found' });
  if (task.status !== 'pending') return res.status(400).json({ error: 'Only pending tasks can be edited' });
  if (task.session_id) return res.status(400).json({ error: 'Cannot edit a stopped task' });

  const newTitle = title || task.title;
  const newDesc = description !== undefined ? description : task.description;
  db.prepare(`UPDATE tasks SET title = ?, description = ?, updated_at = datetime('now') WHERE id = ?`)
    .run(newTitle, newDesc, req.params.id);

  const updated = db.prepare('SELECT * FROM tasks WHERE id = ?').get(req.params.id);
  broadcast({ type: 'task_updated', payload: updated });
  res.json(updated);
});

// Delete task (stops any running process first)
tasksRouter.delete('/:id', (req: Request, res: Response) => {
  stopSessionManager(req.params.id);
  const db = getDb();
  const task = db.prepare('SELECT project_id FROM tasks WHERE id = ?').get(req.params.id) as { project_id: string } | undefined;
  if (task?.project_id) {
    const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(task.project_id) as any;
    if (project) {
      cleanupWorktree(project.working_dir, req.params.id);
    }
  }
  db.prepare('DELETE FROM tasks WHERE id = ?').run(req.params.id);
  broadcast({ type: 'task_deleted', payload: { id: req.params.id, project_id: task?.project_id } });
  const logFile = path.join(getDataDir(), 'logs', `${req.params.id}.log`);
  try { fs.unlinkSync(logFile); } catch {}
  res.status(204).send();
});
