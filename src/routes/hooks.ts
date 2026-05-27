import { Router, Request, Response } from 'express';
import { getDb } from '../db';
import { broadcast } from '../broadcast';
import { findWorktreeByTask, getRecentOutput } from '../services/session-manager';
import { v4 as uuid } from 'uuid';
import fs from 'fs';
import { resolveCommit } from '../services/git-snapshot';

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
    const hookContext = hookBody.additional_context || hookBody.transcript_snippet || '';
    const recentStdout = getRecentOutput(taskId);
    const context = recentStdout || hookContext;

    db.prepare(`INSERT INTO decisions (id, task_id, context, question, options)
      VALUES (?, ?, ?, ?, ?)`).run(
      uuid(), taskId,
      context,
      questionText,
      JSON.stringify(options)
    );

    db.prepare(`UPDATE tasks SET status = 'deciding', updated_at = datetime('now') WHERE id = ?`).run(taskId);

    const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(taskId);
    const decision = db.prepare('SELECT * FROM decisions WHERE task_id = ? AND answer IS NULL ORDER BY created_at DESC LIMIT 1').get(taskId);

    broadcast({ type: 'decision_created', payload: { task, decision } });

    return res.json({
      continue: false,
      stopReason: 'Question intercepted by Claude Kanban - awaiting user decision',
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
    const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(taskId) as { project_id: string } | undefined;
    const project = task
      ? db.prepare('SELECT * FROM projects WHERE id = ?').get(task.project_id) as { working_dir: string } | undefined
      : undefined;
    let checkpointCommit: string | null = null;

    if (project) {
      try {
        const wt = findWorktreeByTask(project.working_dir, taskId);
        const cwd = wt && fs.existsSync(wt.path) ? wt.path : project.working_dir;
        checkpointCommit = resolveCommit(cwd, 'HEAD');
      } catch (e) {
        console.error(`[Hooks] Failed to capture checkpoint for task ${taskId}:`, (e as Error).message);
      }
    }

    db.prepare(`UPDATE tasks SET status = 'reviewing', summary = ?, checkpoint_commit = ?, updated_at = datetime('now') WHERE id = ?`)
      .run(summary, checkpointCommit, taskId);

    const updatedTask = db.prepare('SELECT * FROM tasks WHERE id = ?').get(taskId);
    broadcast({ type: 'task_updated', payload: updatedTask });

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
