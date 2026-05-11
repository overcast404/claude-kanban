import { Router, Request, Response } from 'express';
import { v4 as uuid } from 'uuid';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { getDb } from '../db';
import { broadcast } from '../broadcast';
import { Task, TaskCreateInput, Decision } from '../types';
import { startTask, resumeSession, stopSessionManager, getRunningCount, getPendingQueueLength } from '../services/session-manager';

function getDataDir(): string {
  return process.env.CLAUDE_KANBAN_DATA_DIR || path.join(os.homedir(), '.claude-kanban');
}

export const tasksRouter = Router();

// List tasks for a project (query: ?projectId=...)
tasksRouter.get('/', (req: Request, res: Response) => {
  const db = getDb();
  const { projectId } = req.query;
  if (!projectId) return res.status(400).json({ error: 'projectId query required' });

  const tasks = db.prepare(`
    SELECT * FROM tasks WHERE project_id = ? ORDER BY created_at DESC
  `).all(projectId as string);
  res.json(tasks);
});

// Get system status (must be before /:id routes)
tasksRouter.get('/status/system', (_req: Request, res: Response) => {
  res.json({
    running: getRunningCount(),
    queued: getPendingQueueLength(),
    maxConcurrent: 3,
  });
});

// Get task with pending decision if in deciding status
tasksRouter.get('/:id', (req: Request, res: Response) => {
  const db = getDb();
  const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(req.params.id) as Task | undefined;
  if (!task) return res.status(404).json({ error: 'Task not found' });

  let pendingDecision: Decision | null = null;
  if (task.status === 'deciding') {
    pendingDecision = db.prepare(
      'SELECT * FROM decisions WHERE task_id = ? AND answer IS NULL ORDER BY created_at DESC LIMIT 1'
    ).get(task.id) as Decision | null;
  }

  res.json({ task, pendingDecision });
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

// Create task
tasksRouter.post('/', (req: Request, res: Response) => {
  const { projectId } = req.query;
  if (!projectId) return res.status(400).json({ error: 'projectId query required' });

  const { title, description, priority, max_turns }: TaskCreateInput = req.body;
  if (!title) return res.status(400).json({ error: 'title required' });

  const db = getDb();
  const id = uuid();
  db.prepare(`
    INSERT INTO tasks (id, project_id, title, description, priority, max_turns)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(id, projectId, title, description || '', priority || 'normal', max_turns ?? 50);

  const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(id);
  broadcast({ type: 'task_created', payload: task });
  res.status(201).json(task);
});

// Update task status manually
tasksRouter.patch('/:id/status', (req: Request, res: Response) => {
  const { status } = req.body;
  const validStatuses = ['pending', 'running', 'deciding', 'reviewing', 'done'];
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
  db.prepare('UPDATE tasks SET status = \'done\', updated_at = datetime(\'now\') WHERE id = ?')
    .run(req.params.id);
  const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(req.params.id);
  broadcast({ type: 'task_updated', payload: task });
  res.json(task);
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
    resumeSession(req.params.id, project.working_dir, feedback || '请根据反馈修改，完成后调用 mark_complete。').catch(console.error);
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

// Stop task (kill claude process)
tasksRouter.post('/:id/stop', (req: Request, res: Response) => {
  try {
    stopSessionManager(req.params.id);
    const db = getDb();
    db.prepare(`UPDATE tasks SET status = 'pending', updated_at = datetime('now') WHERE id = ?`).run(req.params.id);
    const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(req.params.id);
    broadcast({ type: 'task_updated', payload: task });
    res.json(task);
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

// Continue a stopped task (resume existing session)
tasksRouter.post('/:id/continue', async (req: Request, res: Response) => {
  try {
    const db = getDb();
    const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(req.params.id) as Task | undefined;
    if (!task) return res.status(404).json({ error: 'Task not found' });
    if (!task.session_id) return res.status(400).json({ error: 'Task has no session to resume' });

    const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(task.project_id) as any;
    if (!project) return res.status(404).json({ error: 'Project not found' });

    db.prepare(`UPDATE tasks SET status = 'running', updated_at = datetime('now') WHERE id = ?`).run(req.params.id);
    const updated = db.prepare('SELECT * FROM tasks WHERE id = ?').get(req.params.id);
    broadcast({ type: 'task_updated', payload: updated });

    resumeSession(req.params.id, project.working_dir, '请继续执行任务。').catch(console.error);
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
  db.prepare('DELETE FROM tasks WHERE id = ?').run(req.params.id);
  broadcast({ type: 'task_deleted', payload: { id: req.params.id, project_id: task?.project_id } });
  const logFile = path.join(getDataDir(), 'logs', `${req.params.id}.log`);
  try { fs.unlinkSync(logFile); } catch {}
  res.status(204).send();
});
