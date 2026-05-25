# Stop/Continue 机制改进方案

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 优化任务停止/恢复机制，使 SIGINT 优雅关闭后等待状态保存，增加超时 SIGKILL 兜底，并在协议文件中告知 Claude 可被停止。

**Architecture:** 在 `session-manager.ts` 中改进 `stopSessionManager`，增加优雅关闭等待（先 SIGINT，等 5 秒后 SIGKILL）。统一 `continue` 和 `resume` 两个重复端点。更新 protocol 文件允许 stop 作为合法退出方式。前端增加停止中的过渡状态。

**Tech Stack:** TypeScript (Node.js), Express, React

---

## 调研结论

Claude CLI 从 v2.1.132（2026-05-06 发布）起，外部 SIGINT（如 `kill -INT`）会触发优雅关闭流程：
- 保存会话状态到 `~/.claude/projects/`
- 恢复终端模式
- 打印 `--resume` 提示

在此之前，外部 SIGINT 会导致进程直接退出而不保存状态。

当前项目已正确使用 SIGINT 发送停止信号，但缺少：
1. **等待优雅关闭**：发送 SIGINT 后立即标记 stopped、删除进程引用，不等待 Claude 完成状态保存
2. **超时兜底**：如果 SIGINT 后 Claude 没有在合理时间内退出，缺少 SIGKILL 兜底
3. **协议告知**：protocol 文件写死 "NO third option"，Claude 不知道 stop 是合法退出方式
4. **端点重复**：`/continue` 和 `/resume` 功能几乎相同

---

### Task 1: 改进 `stopSessionManager` — 优雅关闭 + 超时兜底

**Files:**
- Modify: `src/services/session-manager.ts:120-126`

当前代码：
```typescript
export function stopSessionManager(taskId: string): void {
  const proc = runningProcesses.get(taskId);
  if (proc) {
    proc.kill('SIGINT');
    runningProcesses.delete(taskId);
  }
}
```

改进方案：先 SIGINT，等 5 秒后若进程未退出则 SIGKILL，同时在等待期间不删除进程引用。

- [ ] **Step 1: 重写 `stopSessionManager` 函数**

```typescript
const STOP_GRACE_PERIOD_MS = 5000;

export function stopSessionManager(taskId: string): void {
  const proc = runningProcesses.get(taskId);
  if (!proc) return;

  // Send graceful shutdown signal
  proc.kill('SIGINT');

  // Set a timeout: if process hasn't exited after grace period, force kill
  const forceKillTimer = setTimeout(() => {
    const p = runningProcesses.get(taskId);
    if (p) {
      console.log(`[SessionManager] Task ${taskId} did not exit after ${STOP_GRACE_PERIOD_MS}ms, sending SIGKILL`);
      p.kill('SIGKILL');
    }
  }, STOP_GRACE_PERIOD_MS);

  // Clean up timer if process exits naturally
  const cleanup = () => {
    clearTimeout(forceKillTimer);
    proc.removeListener('exit', cleanup);
    proc.removeListener('close', cleanup);
  };
  proc.on('exit', cleanup);
  proc.on('close', cleanup);
}
```

- [ ] **Step 2: 验证语法正确**

```bash
cd /Users/tangzeyu/project/claude-kanban && npx tsc --noEmit src/services/session-manager.ts 2>&1 | head -20
```

- [ ] **Step 3: Commit**

```bash
git add src/services/session-manager.ts
git commit -m "feat: add graceful shutdown with SIGKILL fallback to stopSessionManager"
```

---

### Task 2: 更新 `POST /:id/stop` 路由 — 不在路由层删除进程引用

**Files:**
- Modify: `src/routes/tasks.ts:336-347`

当前代码在路由层调用 `stopSessionManager` 后直接设置 status。改进后，`stopSessionManager` 不再立即删除进程引用，进程退出时 `handleProcessEnd` 会通过 `checkAndHandleCompletion` 发现状态已是 `stopped` 并跳过。

- [ ] **Step 1: 确认 `checkAndHandleCompletion` 对 stopped 状态的处理**

查看 `session-manager.ts:308-339`，`checkAndHandleCompletion` 已有这行：

```typescript
if (task.status === 'deciding' || task.status === 'reviewing' || task.status === 'done' || task.status === 'pending' || task.status === 'stopped') return;
```

这意味着当 stop 路由先把状态设为 `stopped`，随后进程退出时 `checkAndHandleCompletion` 会正确跳过。无需修改路由层代码，当前逻辑已正确。

- [ ] **Step 2: 在路由中增加 stopped 后的广播确认**

当前 `POST /:id/stop` 代码无需改动。但可加一条日志便于调试：

```typescript
tasksRouter.post('/:id/stop', (req: Request, res: Response) => {
  try {
    stopSessionManager(req.params.id);
    const db = getDb();
    db.prepare(`UPDATE tasks SET status = 'stopped', updated_at = datetime('now') WHERE id = ?`).run(req.params.id);
    const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(req.params.id);
    broadcast({ type: 'task_updated', payload: task });
    console.log(`[Routes] Task ${req.params.id} marked as stopped, waiting for process to exit`);
    res.json(task);
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});
```

- [ ] **Step 3: Commit**

```bash
git add src/routes/tasks.ts
git commit -m "feat: add debug log for task stop route"
```

---

### Task 3: 更新 Protocol 文件 — 告知 Claude 可被安全停止

**Files:**
- Modify: `src/services/session-manager.ts:488-511`

当前 protocol 最后一段：
```
## Important
- At the end of EACH turn, either you are asking a question (via AskUserQuestion) OR you are done (via mcp__manager__mark_complete).
- There is NO third option. Do not stop mid-work without one of these signals.
```

改为告知 Claude 可被外部停止，会话会被自动保存：

- [ ] **Step 1: 修改 `writeProtocolFile` 中的协议内容**

```typescript
function writeProtocolFile(filePath: string): void {
  const protocol = `# Task Protocol

You are working on a task managed by Claude Kanban. Follow these critical rules:

## Decision Protocol
- When you need the user to make a choice or answer a question, you **MUST** use the **AskUserQuestion** tool.
- **NEVER** output a question as plain text and stop. Always use AskUserQuestion.
- If you output text before the question (analysis, options, reasoning), that is fine — it will be shown to the user as context before they answer.

## Completion Protocol
- When the task is complete, you **MUST call** the MCP tool: **mcp__manager__mark_complete(summary)**
- **NEVER** just text output saying you're done. Always call mcp__manager__mark_complete.
- The summary should concisely describe what was accomplished.

## Permission Protocol
- Permissions are handled automatically. Do not ask for permission approval.
- If a tool is blocked, report it in your summary instead.

## Stop Protocol
- The user may stop you at any time via the dashboard. Your session state is automatically saved.
- When stopped, you will receive SIGINT — Claude Code (v2.1.132+) will save your session and exit gracefully.
- You can be resumed later with --resume, picking up exactly where you left off.
- You do NOT need to do anything special to handle being stopped — just work normally.

## Important
- At the end of EACH turn, either you are asking a question (via AskUserQuestion) OR you are done (via mcp__manager__mark_complete).
- Being stopped externally is a valid third outcome — it does not indicate an error on your part.
`;
  fs.writeFileSync(filePath, protocol);
}
```

- [ ] **Step 2: Commit**

```bash
git add src/services/session-manager.ts
git commit -m "feat: add Stop Protocol section to session protocol file"
```

---

### Task 4: 统一 `/continue` 和 `/resume` 端点

**Files:**
- Modify: `src/routes/tasks.ts:349-394`
- Modify: `client/src/api.ts:52-57`
- Modify: `client/src/components/ActionBar.tsx:37,47` (已有的 continue 按钮已正确)
- Modify: `client/src/App.tsx:783-814`

当前有两个几乎相同的端点：`POST /:id/continue`（无消息）和 `POST /:id/resume`（带消息）。统一为一个 `/resume` 端点，message 参数可选。

- [ ] **Step 1: 合并后端路由，删除 `/continue`，改造 `/resume`**

删除 `POST /:id/continue`（349-369行），改造 `POST /:id/resume` 使 message 可选：

```typescript
// Resume a stopped task (message optional, defaults to "请继续执行任务。")
tasksRouter.post('/:id/resume', async (req: Request, res: Response) => {
  try {
    const { message } = req.body;
    const db = getDb();
    const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(req.params.id) as Task | undefined;
    if (!task) return res.status(404).json({ error: 'Task not found' });
    if (!task.session_id) return res.status(400).json({ error: 'Task has no session to resume' });

    const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(task.project_id) as any;
    if (!project) return res.status(404).json({ error: 'Project not found' });

    db.prepare(`UPDATE tasks SET status = 'running', updated_at = datetime('now') WHERE id = ?`).run(req.params.id);
    const updated = db.prepare('SELECT * FROM tasks WHERE id = ?').get(req.params.id);
    broadcast({ type: 'task_updated', payload: updated });

    const prompt = message || '请继续执行任务。';
    resumeSession(req.params.id, project.working_dir, prompt).catch(console.error);
    res.json(updated);
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});
```

同时**删除**原来的 `POST /:id/continue`（349-369行）和旧的 `POST /:id/resume`（371-394行），只保留上面这个统一版本。

- [ ] **Step 2: 更新前端 API 层**

`client/src/api.ts` 中删除 `continueTask`，让 `resumeStoppedTask` 支持无参数调用：

```typescript
export const resumeStoppedTask = (taskId: string, message?: string) =>
  request<Task>(`/tasks/${taskId}/resume`, {
    method: 'POST',
    body: JSON.stringify({ message: message || '请继续执行任务。' }),
  });
```

- [ ] **Step 3: 更新前端 App.tsx 中的 continue 调用**

`App.tsx` 第783行 `onContinue` 回调改为调用 `resumeStoppedTask`：

```typescript
onContinue={async () => {
  if (selectedTask) {
    await resumeStoppedTask(selectedTask.id);
    handleRefresh(selectedTask.project_id);
  }
}}
```

同时删除 `continueTask` 的 import（第3行），确认 `resumeStoppedTask` 已 import。

- [ ] **Step 4: 验证 TypeScript 编译**

```bash
cd /Users/tangzeyu/project/claude-kanban && npx tsc --noEmit 2>&1 | head -20
```

- [ ] **Step 5: Commit**

```bash
git add src/routes/tasks.ts client/src/api.ts client/src/App.tsx
git commit -m "refactor: unify /continue and /resume into single /resume endpoint"
```

---

### Task 5: 前端 — 停止按钮增加加载态（过渡状态）

**Files:**
- Modify: `client/src/components/ActionBar.tsx:44-48`

当用户点击停止后，在进程真正退出前（最多 5 秒），按钮应显示不可用的过渡态，防止重复点击。

- [ ] **Step 1: 给 ActionBar 增加 `stopping` prop**

```typescript
interface Props {
  task: Task;
  stopping?: boolean;  // 正在停止中
  onStart: () => void;
  onStop: () => void;
  onContinue: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onApprove: () => void;
  onReject: () => void;
  onResumeStopped: () => void;
}
```

- [ ] **Step 2: 停止按钮使用 stopping 状态**

```typescript
{task.status === 'running' && (
  <>
    <Btn icon="square" label={stopping ? '停止中...' : '停止'} danger onClick={onStop} />
  </>
)}
```

`Btn` 组件本身不需要改动 — 如果 `stopping` 为 true，按钮仍可显示但视觉上 disabled（可以让 `Btn` 组件支持 `disabled` prop）。

- [ ] **Step 3: 给 Btn 组件增加 disabled 支持**

```typescript
function Btn({ icon, label, primary, danger, disabled, onClick }: {
  icon: IconName; label: string; primary?: boolean; danger?: boolean; disabled?: boolean; onClick: () => void
}) {
  return (
    <button
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors inline-flex items-center gap-1 ${
        disabled ? 'opacity-50 cursor-not-allowed' : ''
      } ${
        primary
          ? 'bg-warm-brown text-white hover:bg-warm-brown-hover'
          : danger
            ? 'bg-red-100 text-red-700 hover:bg-red-200'
            : 'border border-warm-border text-warm-text-secondary hover:bg-warm-bg'
      }`}
    >
      <Icon name={icon} size={14} />
      {label}
    </button>
  );
}
```

- [ ] **Step 4: 在 DetailPanel 中管理 stopping 状态**

在 `DetailPanel.tsx` 中添加 `stopping` state，点击停止后设为 true，等 WebSocket 收到 `task_updated` 且 status 变为 `stopped` 后自动恢复。

```typescript
// 在 DetailPanel 中添加
const [stopping, setStopping] = useState(false);

// 在 onStop 回调中
onStop={async () => {
  setStopping(true);
  try {
    await actions.onStop();
  } finally {
    // WebSocket will update task status to 'stopped', effect below handles reset
  }
}}
```

并在 useEffect 中监听 task status 变化来重置 stopping：

```typescript
useEffect(() => {
  if (task?.status === 'stopped' || task?.status === 'running') {
    setStopping(false);
  }
}, [task?.status]);
```

- [ ] **Step 5: 传递 stopping 给 ActionBar**

```typescript
<ActionBar task={task} stopping={stopping} {...actions} ... />
```

- [ ] **Step 6: Commit**

```bash
git add client/src/components/ActionBar.tsx client/src/components/DetailPanel.tsx
git commit -m "feat: add stopping transition state to stop button"
```

---

## 改动文件清单

| 文件 | 改动类型 | 说明 |
|------|----------|------|
| `src/services/session-manager.ts` | Modify | 优雅关闭 + 超时兜底 + 协议文件更新 |
| `src/routes/tasks.ts` | Modify | 统一 /continue 和 /resume 端点，删除重复 |
| `client/src/api.ts` | Modify | 统一为 `resumeStoppedTask` |
| `client/src/App.tsx` | Modify | continue 改用 resumeStoppedTask |
| `client/src/components/ActionBar.tsx` | Modify | 增加 stopping 状态和 disabled 支持 |
| `client/src/components/DetailPanel.tsx` | Modify | 管理 stopping 过渡状态 |

## 不改动的部分

- `src/types.ts` — 类型定义无需变更，TaskStatus 已有 `stopped`
- `src/db.ts` — 数据库 schema 无需变更
- `src/hooks.ts` — Stop hook 处理器已存在，无需变更
- `src/services/session-manager.ts` 的 `resumeSession` 函数 — 已正确使用 `--resume`
- `checkAndHandleCompletion` — 已正确跳过 `stopped` 状态
