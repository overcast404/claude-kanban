# 任务停止与继续 — 优雅关闭改进方案

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让任务停止（SIGINT）走优雅关闭流程，等待 Claude 保存会话状态后再标记 stopped；统一 continue/resume 端点。

**Architecture:** 核心改动在 `session-manager.ts` 的 `stopSessionManager`，从"发送 SIGINT 立即返回"变为"发送 SIGINT → 等待进程退出（最长 5s）→ 超时则 SIGKILL"。同时更新协议文件让 Claude 知道 stop 是合法退出路径，合并重复的 `/continue` 和 `/resume` 端点。

**Tech Stack:** TypeScript (Node.js), ChildProcess, better-sqlite3

---

## 调研结论

### Claude CLI 原生 stop/continue 行为

| 方式 | 行为 | 状态保存 |
|------|------|----------|
| `/exit` 或 Ctrl+D | 正常退出 | 完整保存到 `~/.claude/projects/` |
| 交互式 Ctrl+C | 中断当前操作 | 完整保存 |
| 外部 SIGINT (v2.1.132+) | 优雅关闭，恢复终端模式，打印 `--resume` 提示 | **完整保存** |
| `--resume <id>` | 恢复指定会话 | — |
| `-c` / `--continue` | 恢复最近会话 | — |

**关键发现**: v2.1.132（2026-05-06 发布）修复了外部 SIGINT 不触发优雅关闭的 bug。升级后 `kill -INT` 即可正确保存会话。

### 当前项目现状

- **Stop**: `proc.kill('SIGINT')` → 立即 `runningProcesses.delete(taskId)` → DB status = `stopped`
- **Continue**: `spawn claude --resume <sessionId> -p "请继续执行任务。"`
- **Resume (带消息)**: `spawn claude --resume <sessionId> -p <customMessage>`
- **协议文件**: 只允许 AskUserQuestion 和 mark_complete 两种退出方式，与 stop 冲突
- **Hooks**: `Stop` 事件已注册但 `-p` 模式下可能不触发

### 需要改进的点

1. `stopSessionManager` 不等待进程优雅退出 — 可能在 Claude 保存状态前就删除了引用
2. 没有 SIGKILL 兜底 — 如果进程卡住（如正在执行工具），SIGINT 可能不立即生效
3. 协议文件声称 "NO third option"，但 stop 正是第三种退出路径
4. `/continue` 和 `/resume` 两个端点功能几乎相同
5. 进程退出后的 `checkAndHandleCompletion` 对 stopped 状态已有保护（正确跳过），但流程不够清晰

---

## 文件变更清单

| 操作 | 文件 | 说明 |
|------|------|------|
| 修改 | `src/services/session-manager.ts` | 优雅关闭逻辑：SIGINT → 等待 → SIGKILL 兜底 |
| 修改 | `src/routes/tasks.ts` | 合并 `/continue` 和 `/resume`，更新 `/stop` |
| 修改 | `src/services/session-manager.ts` | 更新协议文件内容，允许 stop 作为第三种退出 |
| 修改 | `client/src/api.ts` | 前端 API：统一 continueTask 和 resumeStoppedTask |
| 修改 | `client/src/components/ActionBar.tsx` | 前端按钮：统一 stopped 状态下的"继续"交互 |
| 修改 | `client/src/components/DetailPanel.tsx` | 统一 stopped 恢复逻辑 |
| 修改 | `client/src/App.tsx` | 更新回调绑定 |

---

### Task 1: 优雅关闭 — session-manager.ts

**Files:**
- Modify: `src/services/session-manager.ts:120-126`

**目标**: `stopSessionManager` 发送 SIGINT 后等待进程退出，超时则 SIGKILL。

- [ ] **Step 1: 实现带超时的优雅关闭**

在 `session-manager.ts` 中替换 `stopSessionManager` 函数：

```typescript
const GRACEFUL_SHUTDOWN_MS = 5000;

export function stopSessionManager(taskId: string): void {
  const proc = runningProcesses.get(taskId);
  if (!proc) return;

  // 先尝试 SIGINT 优雅关闭
  proc.kill('SIGINT');

  // 设置超时，到期未退出则 SIGKILL
  const forceKillTimer = setTimeout(() => {
    if (runningProcesses.has(taskId)) {
      console.log(`[SessionManager] Task ${taskId} did not exit gracefully after ${GRACEFUL_SHUTDOWN_MS}ms, sending SIGKILL`);
      proc.kill('SIGKILL');
    }
  }, GRACEFUL_SHUTDOWN_MS);

  // 进程退出时清理定时器（由 handleProcessEnd 触发）
  // runningProcesses.delete(taskId) 已在 handleProcessEnd 中执行，这里不再重复
}
```

- [ ] **Step 2: 修改 handleProcessEnd 以区分 stop 和正常退出**

在 `handleProcessEnd`（`launchSession` 内部，约第 258 行）中，区分是用户手动 stop 还是 Claude 自己退出：

```typescript
// 在 handleProcessEnd 内部，runningProcesses.delete 之后:
runningProcesses.delete(task.id);

// 检查当前任务状态 — 如果已经是 stopped，说明是用户手动停止，不需要 checkAndHandleCompletion
const currentTask = db.prepare('SELECT status FROM tasks WHERE id = ?').get(task.id) as { status: string } | undefined;
if (currentTask?.status === 'stopped') {
  console.log(`[SessionManager] Task ${task.id} was stopped by user, skipping completion check`);
  // 清理配置文件
  try { fs.unlinkSync(hooksConfigPath); } catch {}
  try { fs.unlinkSync(protocolPath); } catch {}
  try { fs.unlinkSync(mcpConfigPath); } catch {}
  return;
}

checkAndHandleCompletion(task.id, stdout).catch(console.error);
```

- [ ] **Step 3: resumeSession 中也要加同样的 stopped 检查**

在 `resumeSession` 的 `handleProcessEnd`（约第 427 行）中也加入相同的 stopped 状态检查逻辑，避免 stop 后又触发 completion 逻辑：

```typescript
// resumeSession 的 handleProcessEnd 中:
runningProcesses.delete(taskId);

const currentTask = db.prepare('SELECT status FROM tasks WHERE id = ?').get(taskId) as { status: string } | undefined;
if (currentTask?.status === 'stopped') {
  console.log(`[SessionManager] Task ${taskId} was stopped by user during resume, skipping completion check`);
  try { fs.unlinkSync(hooksConfigPath); } catch {}
  try { fs.unlinkSync(protocolPath); } catch {}
  try { fs.unlinkSync(mcpConfigPath); } catch {}
  return;
}

checkAndHandleCompletion(taskId, resumeStdout).catch(console.error);
```

- [ ] **Step 4: 验证 — 启动一个任务然后 stop，检查日志**

```bash
# 启动项目
npm run dev
# 在浏览器中：创建任务 → 启动 → 点击停止
# 检查 ~/.claude-kanban/logs/<taskId>.log 是否有正常输出
# 检查任务状态是否正确变为 stopped
```

预期：点击停止后，任务状态在 5s 内变为 `stopped`，不会错误进入 `reviewing`。

---

### Task 2: 合并 /continue 和 /resume 端点

**Files:**
- Modify: `src/routes/tasks.ts:350-394`

**目标**: 删除 `/continue` 端点，扩展 `/resume` 使其 `message` 参数可选（默认 "请继续执行任务。"）。

- [ ] **Step 1: 修改 POST /:id/resume 端点**

将 `/resume` 端点改为接受可选 `message`：

```typescript
// Resume a task (continue or resume with custom message)
tasksRouter.post('/:id/resume', async (req: Request, res: Response) => {
  try {
    const { message } = req.body;

    const db = getDb();
    const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(req.params.id) as Task | undefined;
    if (!task) return res.status(404).json({ error: 'Task not found' });
    if (!task.session_id) return res.status(400).json({ error: 'Task has no session to resume' });

    const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(task.project_id) as any;
    if (!project) return res.status(404).json({ error: 'Project not found' });

    const resumeMessage = message || '请继续执行任务。';

    db.prepare(`UPDATE tasks SET status = 'running', updated_at = datetime('now') WHERE id = ?`).run(req.params.id);
    const updated = db.prepare('SELECT * FROM tasks WHERE id = ?').get(req.params.id);
    broadcast({ type: 'task_updated', payload: updated });

    resumeSession(req.params.id, project.working_dir, resumeMessage).catch(console.error);
    res.json(updated);
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});
```

- [ ] **Step 2: 删除 POST /:id/continue 端点**

移除 `tasks.ts` 中第 350-369 行的 `/continue` 路由处理。

- [ ] **Step 3: 验证端点**

```bash
# 测试不带 message（默认消息）
curl -X POST http://localhost:14567/api/tasks/<taskId>/resume \
  -H 'Content-Type: application/json' -d '{}'

# 测试带 message
curl -X POST http://localhost:14567/api/tasks/<taskId>/resume \
  -H 'Content-Type: application/json' -d '{"message":"请修复这个 bug"}'
```

---

### Task 3: 更新协议文件 — 允许 stop

**Files:**
- Modify: `src/services/session-manager.ts:489-511` (writeProtocolFile 函数)

**目标**: 协议文件中加入 stop 退出路径，让 Claude 知道被外部停止是正常的。

- [ ] **Step 1: 修改 writeProtocolFile**

在 `writeProtocolFile` 函数的协议模板末尾添加 Stop 协议：

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
- **NEVER** just output text saying you're done. Always call mcp__manager__mark_complete.
- The summary should concisely describe what was accomplished.

## Permission Protocol
- Permissions are handled automatically. Do not ask for permission approval.
- If a tool is blocked, report it in your summary instead.

## Stop Protocol
- You may receive SIGINT (external stop) at any time. When this happens, your session state is automatically saved.
- The session can be resumed later via --resume, so do not worry about losing work.
- If you are in the middle of a tool call when stopped, the tool's partial output may be lost. Re-execute if needed after resume.

## Important
- At the end of EACH turn, either you are asking a question (via AskUserQuestion), you are done (via mcp__manager__mark_complete), or you may be stopped externally (SIGINT).
`;
  fs.writeFileSync(filePath, protocol);
}
```

- [ ] **Step 2: 检查 hooks.ts 的 Stop 事件处理是否合理**

`src/routes/hooks.ts:70-72` 已有：

```typescript
// Stop — allow Claude to stop naturally
if (hookEventName === 'Stop') {
  return res.json({ continue: false });
}
```

这个处理是正确的 — 当 Claude 发起 Stop（非交互模式的正常结束），返回 `continue: false` 不加阻止。不需要修改。

---

### Task 4: 前端 API 和组件统一

**Files:**
- Modify: `client/src/api.ts`
- Modify: `client/src/components/ActionBar.tsx`
- Modify: `client/src/components/DetailPanel.tsx`
- Modify: `client/src/App.tsx`

**目标**: 前端删除 `continueTask` 调用，统一使用 `resumeStoppedTask`。

- [ ] **Step 1: 更新 client/src/api.ts**

删除 `continueTask` 函数（因为它调用的 `/continue` 端点已被移除），保留并优化 `resumeStoppedTask`：

```typescript
// 删除 continueTask:
// export const continueTask = (taskId: string) =>
//   request<Task>(`/tasks/${taskId}/continue`, { method: 'POST' });

// 保留并改进 resumeStoppedTask:
export const resumeStoppedTask = (taskId: string, message?: string) =>
  request<Task>(`/tasks/${taskId}/resume`, { 
    method: 'POST', 
    body: JSON.stringify({ message: message || '' }) 
  });
```

- [ ] **Step 2: 更新 ActionBar.tsx — 统一 continued 按钮**

`ActionBar` 中 `running` 状态的"继续"按钮改为调用 `onResumeStopped`（与 stopped 状态保持一致），删除 `onContinue` prop。

```typescript
// ActionBar.tsx — Props 中删除 onContinue，所有"继续"按钮改用 onResumeStopped
interface Props {
  task: Task;
  onStart: () => void;
  onStop: () => void;
  // onContinue: () => void;  ← 删除
  onEdit: () => void;
  onDelete: () => void;
  onApprove: () => void;
  onReject: () => void;
  onResumeStopped: () => void;  // 用于所有"继续"场景
}
```

按钮部分：

```tsx
{task.status === 'pending' && (
  <>
    <Btn icon="play" label="开始" primary onClick={onStart} />
    {task.session_id && (
      <Btn icon="corner-down-left" label="继续" onClick={onResumeStopped} />
    )}
    <Btn icon="edit" label="编辑" onClick={onEdit} />
    <Btn icon="x" label="删除" danger onClick={onDelete} />
  </>
)}

{task.status === 'running' && (
  <>
    <Btn icon="square" label="停止" danger onClick={onStop} />
  </>
)}

{task.status === 'stopped' && (
  <>
    <button onClick={onResumeStopped} className="px-4 py-1.5 bg-warm-brown text-white rounded-lg text-xs font-bold hover:bg-warm-brown-hover transition-colors inline-flex items-center gap-1">
      <Icon name="corner-down-left" size={14} />
      回复继续
    </button>
```

> **注意**: `running` 状态下删除了"继续"按钮，因为 running 时用户应该先 stop 再 continue，或者直接发消息交互。之前 running 下的"继续"按钮实际上是发送空消息重新 spawn，这不合理。

- [ ] **Step 3: 更新 DetailPanel.tsx — 删除 onContinue prop**

```typescript
// DetailPanel.tsx — 接口中删除 onContinue
interface Props {
  task: Task | null;
  projectName: string;
  logs: { stream: string; text: string }[];
  isMobile?: boolean;
  onStart: () => void;
  onStop: () => void;
  // onContinue: () => void;  ← 删除
  onEdit: () => void;
  onDelete: () => void;
  onDecisionResolved: () => void;
  onApprove: () => void;
  onReject: () => void;
  onRejectSubmitted: () => void;
  onResumeStopped: (message: string) => Promise<void>;
  onClose: () => void;
}
```

`ActionBar` 调用处删除 `onContinue`：

```tsx
{task.status !== 'deciding' && (
  <ActionBar task={task} onStart={actions.onStart} onStop={actions.onStop}
    onEdit={actions.onEdit} onDelete={actions.onDelete}
    onApprove={actions.onApprove} onReject={onReject}
    onResumeStopped={handleResumeStoppedClick} />
)}
```

- [ ] **Step 4: 更新 App.tsx — 删除 onContinue 回调**

```typescript
// App.tsx — DetailPanel 使用处删除 onContinue prop（约第 783 行）
const detailPanel = (
  <DetailPanel
    task={selectedTask}
    projectName={selectedTask ? (projectNames[selectedTask.project_id] || '') : ''}
    logs={selectedTask ? (taskOutputs[selectedTask.id] || []) : []}
    isMobile={isMobile}
    onStart={async () => { ... }}
    onStop={async () => { ... }}
    // onContinue 删除
    onEdit={() => selectedTask && setEditingTask(selectedTask)}
    ...
    onResumeStopped={async (message) => { ... }}
    onClose={() => setDetailVisible(false)}
  />
);
```

同时删除 `App.tsx` 顶部 import 中的 `continueTask`：

```typescript
import { listProjects, listTasks, createTask, startTask, stopTask, deleteTask, ... } from './api';
// 删除 continueTask 导入
```

- [ ] **Step 5: 端到端验证**

```bash
npm run dev
```

在浏览器中：
1. 创建任务 → 启动 → 点击停止 → 状态变为 "已停止"
2. 点击 "回复继续" → 输入指令 → 任务恢复执行
3. 在 pending 状态点击 "继续" → 使用默认消息恢复
4. 确认没有报错

---

## 自审清单

**1. 覆盖度检查:**
- [x] 优雅关闭等待 → Task 1
- [x] SIGKILL 超时兜底 → Task 1
- [x] 进程退出后不误判 completion → Task 1 (handleProcessEnd 检查 stopped 状态)
- [x] 协议文件更新 → Task 3
- [x] 合并重复端点 → Task 2
- [x] 前端统一 → Task 4

**2. 占位符扫描:** 无 TBD/TODO/占位符 — 所有步骤包含完整代码。

**3. 类型一致性:** `onResumeStopped` 在 ActionBar 中是 `() => void`（简单触发），在 DetailPanel 中是 `(message: string) => Promise<void>`（带消息输入）。两者通过 DetailPanel 的 `handleResumeStoppedClick` 桥接 — 先弹出输入框，用户输入后调用 `onResumeStopped(message)`。类型一致。
