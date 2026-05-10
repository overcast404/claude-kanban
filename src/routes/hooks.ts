import { Router, Request, Response } from 'express';
import { getDb } from '../db';
import { broadcast } from '../broadcast';
import { v4 as uuid } from 'uuid';

export const hooksRouter = Router();

// Receive hook callbacks from Claude Code sessions
// POST /api/hooks/:taskId
hooksRouter.post('/:taskId', (req: Request, res: Response) => {
  const db = getDb();
  const { taskId } = req.params;
  const hookBody = req.body;

  const hookEventName = hookBody.hook_event_name;
  const toolName = hookBody.tool_name;

  // Handle AskUserQuestion hook
  if (hookEventName === 'PreToolUse' && toolName === 'AskUserQuestion') {
    const questions = hookBody.tool_input?.questions || [];
    const questionText = questions[0]?.question || '需要决策';
    const options = questions[0]?.options || [];

    db.prepare(`INSERT INTO decisions (id, task_id, context, question, options)
      VALUES (?, ?, ?, ?, ?)`).run(
      uuid(), taskId,
      hookBody.additional_context || hookBody.transcript_snippet || '',
      questionText,
      JSON.stringify(options)
    );

    db.prepare(`UPDATE tasks SET status = 'deciding', updated_at = datetime('now') WHERE id = ?`).run(taskId);

    const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(taskId);
    const decision = db.prepare('SELECT * FROM decisions WHERE task_id = ? AND answer IS NULL ORDER BY created_at DESC LIMIT 1').get(taskId);

    broadcast({ type: 'decision_created', payload: { task, decision } });

    return res.json({
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'deny',
        permissionDecisionReason: 'Decision will be collected via Claude Kanban dashboard',
      },
    });
  }

  // Handle mark_complete MCP call
  if (hookEventName === 'PreToolUse' && toolName === 'mcp__manager__mark_complete') {
    const summary = hookBody.tool_input?.summary || '';

    db.prepare(`UPDATE tasks SET status = 'reviewing', summary = ?, updated_at = datetime('now') WHERE id = ?`)
      .run(summary, taskId);

    const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(taskId);
    broadcast({ type: 'task_updated', payload: task });

    return res.json({
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'allow',
      },
    });
  }

  // Stop — allow Claude to stop naturally
  if (hookEventName === 'Stop') {
    return res.json({ continue: false });
  }

  // PermissionRequest — auto-approve
  if (hookEventName === 'PermissionRequest') {
    return res.json({
      hookSpecificOutput: {
        hookEventName: 'PermissionRequest',
        decision: { behavior: 'allow' },
      },
    });
  }

  // Default: allow
  res.json({ continue: true });
});
