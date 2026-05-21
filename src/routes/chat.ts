import { Router, Request, Response } from 'express';
import { getDb } from '../db';

export const chatRouter = Router();

interface ChatMessageRow {
  id: string;
  task_id: string;
  project_id: string;
  project_name: string;
  type: string;
  content: string;
  quote_message_id: string | null;
  decision_json: string | null;
  round: number;
  timestamp: string;
}

function rowToMsg(row: ChatMessageRow) {
  return {
    id: row.id,
    taskId: row.task_id,
    projectId: row.project_id,
    projectName: row.project_name,
    type: row.type,
    content: row.content,
    quoteMessageId: row.quote_message_id || undefined,
    decision: row.decision_json ? JSON.parse(row.decision_json) : undefined,
    round: row.round,
    timestamp: row.timestamp,
  };
}

// GET /api/chat-messages — list all messages, optionally filtered by task_id
chatRouter.get('/', (req: Request, res: Response) => {
  const db = getDb();
  const taskId = req.query.taskId as string | undefined;
  const limit = parseInt(req.query.limit as string) || 500;
  const offset = parseInt(req.query.offset as string) || 0;

  if (taskId) {
    const rows = db.prepare(
      'SELECT * FROM chat_messages WHERE task_id = ? ORDER BY timestamp ASC LIMIT ? OFFSET ?'
    ).all(taskId, limit, offset) as ChatMessageRow[];
    res.json(rows.map(rowToMsg));
  } else {
    const rows = db.prepare(
      'SELECT * FROM chat_messages ORDER BY timestamp ASC LIMIT ? OFFSET ?'
    ).all(limit, offset) as ChatMessageRow[];
    res.json(rows.map(rowToMsg));
  }
});

// POST /api/chat-messages — create a single message
chatRouter.post('/', (req: Request, res: Response) => {
  const db = getDb();
  const { id, taskId, projectId, projectName, type, content, quoteMessageId, decision, round, timestamp } = req.body;

  if (!id || !taskId || !projectId || !type) {
    res.status(400).json({ error: 'Missing required fields: id, taskId, projectId, type' });
    return;
  }

  db.prepare(`
    INSERT OR REPLACE INTO chat_messages (id, task_id, project_id, project_name, type, content, quote_message_id, decision_json, round, timestamp)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id, taskId, projectId, projectName || '', type, content || '', quoteMessageId || null,
    decision ? JSON.stringify(decision) : null, round || 0, timestamp || new Date().toISOString()
  );

  res.status(201).json({ ok: true });
});

// DELETE /api/chat-messages/:taskId — delete all messages for a task
chatRouter.delete('/:taskId', (req: Request, res: Response) => {
  const db = getDb();
  db.prepare('DELETE FROM chat_messages WHERE task_id = ?').run(req.params.taskId);
  res.status(204).send();
});
