import { Router, Request, Response } from 'express';
import { v4 as uuid } from 'uuid';
import { getDb } from '../db';
import { broadcast } from '../broadcast';
import { stopSessionManager } from '../services/session-manager';
import { Project, ProjectCreateInput } from '../types';

export const projectsRouter = Router();

// List all projects with task counts per status
projectsRouter.get('/', (_req: Request, res: Response) => {
  const db = getDb();
  const projects = db.prepare(`
    SELECT p.*,
      (SELECT COUNT(*) FROM tasks t WHERE t.project_id = p.id AND t.status = 'pending') AS count_pending,
      (SELECT COUNT(*) FROM tasks t WHERE t.project_id = p.id AND t.status = 'running') AS count_running,
      (SELECT COUNT(*) FROM tasks t WHERE t.project_id = p.id AND t.status = 'deciding') AS count_deciding,
      (SELECT COUNT(*) FROM tasks t WHERE t.project_id = p.id AND t.status = 'reviewing') AS count_reviewing,
      (SELECT COUNT(*) FROM tasks t WHERE t.project_id = p.id AND t.status = 'done') AS count_done
    FROM projects p
    ORDER BY p.created_at DESC
  `).all();
  res.json(projects);
});

// Create project
projectsRouter.post('/', (req: Request, res: Response) => {
  const { name, working_dir }: ProjectCreateInput = req.body;
  if (!name || !working_dir) return res.status(400).json({ error: 'name and working_dir required' });

  const db = getDb();
  const id = uuid();
  try {
    db.prepare('INSERT INTO projects (id, name, working_dir) VALUES (?, ?, ?)').run(id, name, working_dir);
  } catch (e: any) {
    if (e.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      return res.status(400).json({ error: '该工作目录已被其他项目使用' });
    }
    console.error(`[projects] create failed: ${e.message}`);
    return res.status(500).json({ error: e.message });
  }
  const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(id);
  res.status(201).json(project);
});

// Get single project
projectsRouter.get('/:id', (req: Request, res: Response) => {
  const db = getDb();
  const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(req.params.id);
  if (!project) return res.status(404).json({ error: 'Project not found' });
  res.json(project);
});

// Delete project
projectsRouter.delete('/:id', (req: Request, res: Response) => {
  const db = getDb();
  const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(req.params.id);
  if (!project) return res.status(404).json({ error: 'Project not found' });

  const runningTasks = db.prepare("SELECT id FROM tasks WHERE project_id = ? AND status = 'running'").all(req.params.id) as { id: string }[];
  for (const t of runningTasks) {
    stopSessionManager(t.id);
  }

  db.prepare('DELETE FROM projects WHERE id = ?').run(req.params.id);
  broadcast({ type: 'project_deleted', payload: { id: req.params.id } });
  res.status(204).send();
});
