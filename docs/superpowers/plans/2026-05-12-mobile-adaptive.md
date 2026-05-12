# 移动端适配实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为 Claude Kanban 前端添加 ≤768px 移动端响应式适配：底部导航替代侧边栏，任务详情变为全屏页面，统一简化桌面+移动导航为 3 个 tab。

**Architecture:** 使用 CSS `max-md:` 断点 + JS `useMediaQuery` hook 双轨检测。`TABS` 常量统一驱动 Sidebar 和 BottomNav。DetailPanel 通过 `isMobile` prop 切换侧面板/全屏覆盖两种渲染模式。

**Tech Stack:** React 18, TypeScript, Tailwind CSS 4, Vite 5

---

### Task 1: status.ts — 新增统一 tab 定义

**Files:**
- Modify: `client/src/status.ts`

- [ ] **Step 1: 新增 IN_PROGRESS 常量和 TABS 配置**

在 `client/src/status.ts` 中，`ACTION_STATUSES` 之后、`PRIORITY_LABEL` 之前插入：

```ts
export const IN_PROGRESS_STATUSES: TaskStatus[] = ['pending', 'running'];
export const IN_PROGRESS_LABEL = '进行中';
export const IN_PROGRESS_ICON: IconName = 'zap';

export const TABS = [
  { key: 'in-progress', icon: IN_PROGRESS_ICON, label: IN_PROGRESS_LABEL, statuses: IN_PROGRESS_STATUSES },
  { key: 'action', icon: ACTION_ICON, label: ACTION_LABEL, statuses: ACTION_STATUSES },
  { key: 'done', icon: STATUS_ICON.done, label: STATUS_LABEL.done, statuses: ['done'] as TaskStatus[] },
] as const;

export type TabKey = (typeof TABS)[number]['key'];
```

- [ ] **Step 2: 验证编译**

```bash
cd /Users/tangzeyu/project/claude-kanban && npx tsc --noEmit src/types.ts client/src/status.ts 2>&1
```

Expected: 无错误。

- [ ] **Step 3: Commit**

```bash
git add client/src/status.ts
git commit -m "feat: add unified TABS config and IN_PROGRESS constants to status.ts"
```

---

### Task 2: Sidebar.tsx — 简化为 3 个 tab

**Files:**
- Modify: `client/src/components/Sidebar.tsx`

- [ ] **Step 1: 重写 Sidebar 使用 TABS 配置**

将 `client/src/components/Sidebar.tsx` 替换为：

```tsx
import { TABS, type TabKey } from '../status';
import { NavItem } from './NavItem';

interface Props {
  activeTab: TabKey;
  counts: Record<string, number>;
  onSelectTab: (tab: TabKey) => void;
}

export function Sidebar({ activeTab, counts, onSelectTab }: Props) {
  return (
    <aside className="w-14 shrink-0 flex flex-col items-center gap-1 py-3 border-r border-warm-border bg-warm-card max-md:hidden">
      {TABS.map(item => (
        <NavItem
          key={item.key}
          icon={item.icon}
          label={item.label}
          count={counts[item.key] || 0}
          dangerBadge={item.key === 'action'}
          active={activeTab === item.key}
          onClick={() => onSelectTab(item.key)}
        />
      ))}
    </aside>
  );
}
```

关键变更：
- 移除了 `useMemo`、`STATUS_ORDER` 等旧依赖
- 直接遍历 `TABS` 生成导航项
- 新增 `max-md:hidden` — 移动端自动隐藏

- [ ] **Step 2: 验证编译**

```bash
cd /Users/tangzeyu/project/claude-kanban && npx tsc --noEmit 2>&1 | head -20
```

Expected: 只有 App.tsx 和 ListPanel.tsx 的类型错误（因为它们的 Tab 类型还未更新），Sidebar.tsx 本身无错误。

- [ ] **Step 3: Commit**

```bash
git add client/src/components/Sidebar.tsx
git commit -m "feat: simplify Sidebar to 3 tabs using TABS config"
```

---

### Task 3: BottomNav.tsx — 创建移动端底部导航

**Files:**
- Create: `client/src/components/BottomNav.tsx`

- [ ] **Step 1: 创建 BottomNav 组件**

```tsx
import { TABS, type TabKey } from '../status';
import { NavItem } from './NavItem';

interface Props {
  activeTab: TabKey;
  counts: Record<string, number>;
  onSelectTab: (tab: TabKey) => void;
}

export function BottomNav({ activeTab, counts, onSelectTab }: Props) {
  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 h-14 bg-warm-card border-t border-warm-border flex items-center justify-around px-2 z-20"
      style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}>
      {TABS.map(item => (
        <NavItem
          key={item.key}
          icon={item.icon}
          label={item.label}
          count={counts[item.key] || 0}
          dangerBadge={item.key === 'action'}
          active={activeTab === item.key}
          onClick={() => onSelectTab(item.key)}
        />
      ))}
    </nav>
  );
}
```

要点：
- `md:hidden` — 只在 <768px 时显示
- `fixed bottom-0` + `z-20` — 固定在视口底部
- `safe-area-inset-bottom` — iOS 安全区适配
- 与 Sidebar 使用相同的 `TABS` 和 `NavItem`

- [ ] **Step 2: 验证编译**

```bash
cd /Users/tangzeyu/project/claude-kanban && npx tsc --noEmit 2>&1 | head -20
```

Expected: BottomNav.tsx 本身无类型错误。

- [ ] **Step 3: Commit**

```bash
git add client/src/components/BottomNav.tsx
git commit -m "feat: add BottomNav mobile bottom navigation component"
```

---

### Task 4: ListPanel.tsx — 适配简化后的 tab

**Files:**
- Modify: `client/src/components/ListPanel.tsx`

- [ ] **Step 1: 重写 ListPanel 使用 TABS 查找状态列表**

将 `client/src/components/ListPanel.tsx` 替换为：

```tsx
import type { Task } from '../../../src/types';
import { ProjectGroup } from './ProjectGroup';
import { EmptyState } from './EmptyState';
import { TABS, type TabKey } from '../status';
import { Icon } from './Icon';

interface Props {
  activeTab: TabKey;
  tasksByProject: Record<string, Task[]>;
  projectNames: Record<string, string>;
  selectedTaskId: string | null;
  onSelectTask: (task: Task) => void;
  onCreateTask: () => void;
}

export function ListPanel({
  activeTab, tasksByProject, projectNames,
  selectedTaskId, onSelectTask, onCreateTask,
}: Props) {
  const tab = TABS.find(t => t.key === activeTab);
  const statuses = tab?.statuses || [];
  const icon = tab?.icon || 'folder';
  const label = tab?.label || '';

  const filtered = Object.entries(tasksByProject).filter(
    ([, tasks]) => tasks.some(t => statuses.includes(t.status))
  );

  return (
    <div className="flex-1 flex flex-col overflow-hidden min-w-0">
      <div className="flex items-center justify-between px-4 py-3 border-b border-warm-border shrink-0">
        <h2 className="text-sm font-bold text-warm-text inline-flex items-center gap-1">
          <Icon name={icon} size={16} /> {label}
        </h2>
        {activeTab === 'in-progress' && (
          <button
            onClick={onCreateTask}
            className="text-[11px] bg-warm-brown text-white px-3 py-1.5 rounded-lg font-bold hover:bg-warm-brown-hover transition-colors inline-flex items-center gap-1"
          >
            <Icon name="plus" size={13} /> 任务
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-3">
        {filtered.length === 0 ? (
          <EmptyState icon={icon} message={`没有${label}的任务`} />
        ) : (
          filtered.map(([projectId, tasks]) => (
            <ProjectGroup
              key={projectId}
              projectName={projectNames[projectId] || projectId}
              tasks={tasks.filter(t => statuses.includes(t.status))}
              selectedTaskId={selectedTaskId}
              onSelectTask={onSelectTask}
            />
          ))
        )}
      </div>
    </div>
  );
}
```

关键变更：
- 类型从 `'action' | TaskStatus` 变为 `TabKey`
- 用 `TABS.find()` 替代硬编码的 `isAction` / `ACTION_STATUSES` 判断
- 新建任务按钮条件从 `(activeTab === 'pending' || activeTab === 'running')` 变为 `activeTab === 'in-progress'`

- [ ] **Step 2: Commit**

```bash
git add client/src/components/ListPanel.tsx
git commit -m "feat: adapt ListPanel to use TABS config and TabKey type"
```

---

### Task 5: DetailPanel.tsx — 添加移动端全屏模式

**Files:**
- Modify: `client/src/components/DetailPanel.tsx`

- [ ] **Step 1: 添加 isMobile prop 和移动端全屏渲染**

在 `DetailPanel.tsx` 中做以下修改：

**修改 Props 接口**（第 10-25 行附近），新增 `isMobile`：

```tsx
interface Props {
  task: Task | null;
  projectName: string;
  logs: { stream: string; text: string }[];
  isMobile?: boolean;
  onStart: () => void;
  onStop: () => void;
  onContinue: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onDecide: () => void;
  onApprove: () => void;
  onReject: () => void;
  onRejectSubmitted: () => void;
  onViewLogs: () => void;
  onClose: () => void;
}
```

**修改空状态渲染**（第 57-63 行），移动端空状态不显示：

```tsx
  if (!task) {
    if (isMobile) return null;
    return (
      <div className="h-full border-l border-warm-border bg-warm-card flex items-center justify-center">
        <EmptyState icon="arrow-left" message="选择一个任务查看详情" />
      </div>
    );
  }
```

**在 return 语句最外层包裹移动端容器**。将现有的 `<div className="h-full border-l ...">` 外部包一层移动端判断：

移动端（`isMobile`）时返回：

```tsx
  const content = (
    <div className="h-full overflow-y-auto">
      <div className="p-4">
        {/* 移动端返回按钮 */}
        {isMobile && (
          <div className="flex items-center gap-2 mb-3">
            <button
              onClick={onClose}
              className="inline-flex items-center gap-1 text-warm-brown text-sm font-medium"
            >
              <Icon name="arrow-left" size={18} /> 返回
            </button>
            <span className="text-sm text-warm-text-secondary truncate">{task.title}</span>
          </div>
        )}

        <div className="mb-4">
          <div className="flex items-start justify-between gap-2">
            <h2 className="text-[15px] font-bold text-warm-text mb-1">{task.title}</h2>
            {!isMobile && (
              <button
                onClick={onClose}
                className="text-warm-text-secondary hover:text-warm-text p-0.5 rounded shrink-0"
                title="关闭详情"
              >
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M4 4l8 8M12 4l-8 8" />
                </svg>
              </button>
            )}
          </div>
          ...{/* 其余项目信息保持不变 */}
```

实际实现时，采用更简洁的方式——将桌面端的关闭按钮条件渲染 (`!isMobile &&`)，移动端在顶部添加返回按钮行。其余内容完全复用。

**完整替换方案：**

将当前文件的 `return` 之前的内容保持不变，return 后的 JSX 改为：

```tsx
  const body = (
    <div className="overflow-y-auto">
      <div className="p-4">
        {isMobile && (
          <button
            onClick={onClose}
            className="inline-flex items-center gap-1 text-warm-brown text-sm font-medium mb-3"
          >
            <Icon name="arrow-left" size={18} /> 返回
          </button>
        )}
        <div className="mb-4">
          <div className="flex items-start justify-between gap-2">
            <h2 className="text-[15px] font-bold text-warm-text mb-1">{task.title}</h2>
            {!isMobile && (
              <button
                onClick={onClose}
                className="text-warm-text-secondary hover:text-warm-text p-0.5 rounded shrink-0"
                title="关闭详情"
              >
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M4 4l8 8M12 4l-8 8" />
                </svg>
              </button>
            )}
          </div>
          <div className="flex items-center gap-2 text-[11px] text-warm-text-secondary">
            <span className="inline-flex items-center gap-0.5"><Icon name="folder" size={12} /> {projectName}</span>
            <span className="inline-flex items-center gap-0.5"><Icon name={STATUS_ICON[task.status]} size={13} /> {STATUS_LABEL[task.status]}</span>
            {task.priority !== 'normal' && (
              <span className={task.priority === 'high' ? 'text-warm-danger font-semibold' : ''}>
                {PRIORITY_LABEL[task.priority]}优先级
              </span>
            )}
          </div>
        </div>

        {task.description && (
          <div className="mb-4">
            <p className="text-[12px] text-warm-text leading-relaxed">{task.description}</p>
          </div>
        )}

        {(task.status === 'running' || task.status === 'reviewing' || task.status === 'done') && (
          <div className="mb-4 p-3 bg-warm-log-bg border border-warm-border rounded-lg">
            <h4 className="text-[10px] font-bold text-warm-brown mb-2 inline-flex items-center gap-0.5"><Icon name="activity" size={12} /> 状态</h4>
            <div className="text-[11px] text-warm-text space-y-0.5">
              <p>轮次: {task.current_turn}/{task.max_turns}</p>
              <p>费用: ${(task.total_cost_usd || 0).toFixed(2)}</p>
              {task.session_id && <p>会话: {task.session_id.slice(0, 8)}...</p>}
            </div>
          </div>
        )}

        {task.status === 'reviewing' && task.summary && (
          <div className="mb-4">
            <h4 className="text-[10px] font-bold text-warm-brown mb-1 inline-flex items-center gap-0.5"><Icon name="clipboard" size={12} /> 摘要</h4>
            <p className="text-[12px] text-warm-text leading-relaxed">{task.summary}</p>
          </div>
        )}

        <ActionBar task={task} {...actions} onReject={handleRejectClick} />

        {showInlineFeedback && (
          <div className="mt-3 p-3 border border-warm-border rounded-lg bg-warm-log-bg">
            <label className="block text-[10px] font-semibold text-warm-text-secondary uppercase mb-1.5">修改意见</label>
            <textarea
              value={feedbackText}
              onChange={e => setFeedbackText(e.target.value)}
              placeholder="告诉 Claude 哪里需要改..."
              rows={3}
              autoFocus
              className="w-full p-2 border border-warm-border rounded-lg text-sm bg-warm-card text-warm-text resize-y"
            />
            <div className="flex justify-end gap-2 mt-2">
              <button
                onClick={handleCancelFeedback}
                className="px-4 py-1.5 border border-warm-border text-warm-text-secondary rounded-lg text-xs font-semibold"
                disabled={submitting}
              >
                取消
              </button>
              <button
                onClick={handleSendFeedback}
                className="px-4 py-1.5 bg-warm-brown text-white rounded-lg text-xs font-bold"
                disabled={submitting || !feedbackText.trim()}
              >
                发送
              </button>
            </div>
          </div>
        )}

        <LogPreview lines={logs} onViewFull={actions.onViewLogs} />
      </div>
    </div>
  );

  if (isMobile) {
    return (
      <div className="fixed inset-0 z-30 bg-warm-card flex flex-col">
        {body}
      </div>
    );
  }

  return (
    <div className="h-full border-l border-warm-border bg-warm-card overflow-y-auto">
      {body}
    </div>
  );
```

要点：
- 移动端 `fixed inset-0 z-30` 全屏覆盖，覆盖底部导航
- 桌面端关闭按钮仅 `!isMobile` 时显示
- 移动端顶部显示返回按钮
- 内容 body 提取为变量，避免重复

- [ ] **Step 2: Commit**

```bash
git add client/src/components/DetailPanel.tsx
git commit -m "feat: add mobile full-screen mode to DetailPanel"
```

---

### Task 6: TopBar.tsx — 移动端隐藏按钮文字

**Files:**
- Modify: `client/src/components/TopBar.tsx`

- [ ] **Step 1: 包裹文字标签，移动端隐藏**

将 TopBar.tsx 中两个按钮的文字部分用 `<span className="max-md:hidden">` 包裹：

```tsx
<button
  onClick={() => onSelectTab('projects')}
  className={`inline-flex items-center gap-1 px-1.5 py-1 rounded text-xs transition-colors ${
    activeTab === 'projects'
      ? 'text-warm-brown font-bold'
      : 'text-warm-text-secondary hover:text-warm-brown'
  }`}
>
  <Icon name="folder" size={15} /> <span className="max-md:hidden">项目</span>
</button>
<button
  onClick={() => setShowQr(true)}
  className="inline-flex items-center gap-1 px-1.5 py-1 rounded text-xs text-warm-text-secondary hover:text-warm-brown transition-colors"
>
  <Icon name="smartphone" size={15} /> <span className="max-md:hidden">扫码</span>
</button>
```

- [ ] **Step 2: Commit**

```bash
git add client/src/components/TopBar.tsx
git commit -m "feat: hide TopBar button text on mobile with max-md:hidden"
```

---

### Task 7: App.tsx — 串联移动端布局

**Files:**
- Modify: `client/src/App.tsx`

这是核心改动，将 `useMediaQuery`、新 tab 类型、计数组装、条件渲染全部串联。

- [ ] **Step 1: 重写 App.tsx**

将 `client/src/App.tsx` 完整替换为：

```tsx
import { useState, useEffect, useCallback, useRef } from 'react';
import type { Project, Task, Decision, WsMessage, TaskOutputPayload } from '../../src/types';
import { listProjects, listTasks, startTask, stopTask, continueTask, deleteTask, deleteProject } from './api';
import { useWebSocket } from './useWebSocket';
import { TABS, type TabKey } from './status';
import { Sidebar } from './components/Sidebar';
import { BottomNav } from './components/BottomNav';
import { TopBar } from './components/TopBar';
import { ListPanel } from './components/ListPanel';
import { DetailPanel } from './components/DetailPanel';
import { ProjectView } from './components/ProjectView';
import { CreateTaskModal } from './components/CreateTaskModal';
import { CreateProjectModal } from './components/CreateProjectModal';
import { EditTaskModal } from './components/EditTaskModal';
import { DecisionModal } from './components/DecisionModal';
import { ReviewModal } from './components/ReviewModal';
import { LogViewer } from './components/LogViewer';

type Tab = 'projects' | TabKey;

type ProjectData = Project & {
  count_pending: number; count_running: number; count_deciding: number;
  count_reviewing: number; count_done: number;
};

function useMediaQuery(query: string) {
  const [matches, setMatches] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const mql = window.matchMedia(query);
    const handler = (e: MediaQueryListEvent) => setMatches(e.matches);
    mql.addEventListener('change', handler);
    return () => mql.removeEventListener('change', handler);
  }, [query]);
  return matches;
}

export default function App() {
  const isMobile = useMediaQuery('(max-width: 768px)');
  const [activeTab, setActiveTab] = useState<Tab>('action');
  const [projects, setProjects] = useState<ProjectData[]>([]);
  const [tasks, setTasks] = useState<Record<string, Task[]>>({});
  const [taskOutputs, setTaskOutputs] = useState<Record<string, { stream: string; text: string }[]>>({});
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [viewingLogs, setViewingLogs] = useState<Task | null>(null);

  const [showCreateTask, setShowCreateTask] = useState(false);
  const [showCreateProject, setShowCreateProject] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [decidingTask, setDecidingTask] = useState<Task | null>(null);
  const [reviewingTask, setReviewingTask] = useState<Task | null>(null);

  const [detailVisible, setDetailVisible] = useState(true);
  const [detailWidth, setDetailWidth] = useState(50);
  const containerRef = useRef<HTMLDivElement>(null);
  const resizingRef = useRef(false);

  const loadProjects = useCallback(async () => {
    const ps = await listProjects();
    setProjects(ps as unknown as ProjectData[]);
  }, []);

  const loadTasks = useCallback(async (projectId: string) => {
    const ts = await listTasks(projectId);
    setTasks(prev => ({ ...prev, [projectId]: ts }));
  }, []);

  useEffect(() => { loadProjects(); }, [loadProjects]);

  useEffect(() => {
    projects.forEach(p => loadTasks(p.id));
  }, [projects, loadTasks]);

  useWebSocket(useCallback((msg: WsMessage) => {
    if (msg.type === 'task_updated' || msg.type === 'task_created') {
      const task = msg.payload as Task;
      setTasks(prev => {
        const existing = prev[task.project_id] || [];
        const idx = existing.findIndex(t => t.id === task.id);
        const updated = idx >= 0
          ? existing.map((t, i) => i === idx ? task : t)
          : [task, ...existing];
        return { ...prev, [task.project_id]: updated };
      });
      loadProjects();
    } else if (msg.type === 'task_deleted') {
      const { id, project_id } = msg.payload as { id: string; project_id?: string };
      if (project_id) {
        setTasks(prev => ({
          ...prev,
          [project_id]: (prev[project_id] || []).filter(t => t.id !== id),
        }));
        if (selectedTaskId === id) setSelectedTaskId(null);
      }
      setTaskOutputs(prev => { const next = { ...prev }; delete next[id]; return next; });
      loadProjects();
    } else if (msg.type === 'project_deleted') {
      const { id } = msg.payload as { id: string };
      setProjects(prev => prev.filter(p => p.id !== id));
      setTasks(prev => { const next = { ...prev }; delete next[id]; return next; });
      loadProjects();
    } else if (msg.type === 'decision_created') {
      loadProjects();
    } else if (msg.type === 'task_output') {
      const payload = msg.payload as TaskOutputPayload;
      setTaskOutputs(prev => ({
        ...prev,
        [payload.taskId]: [...(prev[payload.taskId] || []), { stream: payload.stream, text: payload.text }],
      }));
    }
  }, [loadProjects, selectedTaskId]));

  useEffect(() => {
    if (selectedTaskId) setDetailVisible(true);
  }, [selectedTaskId]);

  // 桌面端拖拽分隔条
  useEffect(() => {
    if (isMobile) return;
    const handleMouseMove = (e: MouseEvent) => {
      if (!resizingRef.current || !containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const percent = ((rect.right - e.clientX) / rect.width) * 100;
      setDetailWidth(Math.min(70, Math.max(20, percent)));
    };
    const handleMouseUp = () => {
      resizingRef.current = false;
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
    };
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isMobile]);

  const handleRefresh = (projectId?: string) => {
    if (projectId) {
      loadTasks(projectId);
    } else {
      projects.forEach(p => loadTasks(p.id));
    }
    loadProjects();
  };

  const allTasks = Object.values(tasks).flat();
  const selectedTask = allTasks.find(t => t.id === selectedTaskId) || null;

  const tasksByProject = tasks;
  const projectNames: Record<string, string> = {};
  projects.forEach(p => { projectNames[p.id] = p.name; });

  // 按 tab 聚合计数
  const counts: Record<string, number> = {};
  allTasks.forEach(t => {
    const tab = TABS.find(tab => (tab.statuses as readonly string[]).includes(t.status));
    if (tab) {
      counts[tab.key] = (counts[tab.key] || 0) + 1;
    }
  });

  const detailPanel = (
    <DetailPanel
      task={selectedTask}
      projectName={selectedTask ? (projectNames[selectedTask.project_id] || '') : ''}
      logs={selectedTask ? (taskOutputs[selectedTask.id] || []) : []}
      isMobile={isMobile}
      onStart={async () => {
        if (selectedTask) {
          await startTask(selectedTask.id);
          handleRefresh(selectedTask.project_id);
        }
      }}
      onStop={async () => {
        if (selectedTask) {
          await stopTask(selectedTask.id);
          handleRefresh(selectedTask.project_id);
        }
      }}
      onContinue={async () => {
        if (selectedTask) {
          await continueTask(selectedTask.id);
          handleRefresh(selectedTask.project_id);
        }
      }}
      onEdit={() => selectedTask && setEditingTask(selectedTask)}
      onDelete={async () => {
        if (selectedTask && confirm(`确定删除任务 "${selectedTask.title}"？`)) {
          await deleteTask(selectedTask.id);
          setSelectedTaskId(null);
          handleRefresh(selectedTask.project_id);
        }
      }}
      onDecide={() => selectedTask && setDecidingTask(selectedTask)}
      onApprove={() => selectedTask && setReviewingTask(selectedTask)}
      onReject={() => {}}
      onRejectSubmitted={() => {
        if (selectedTask) handleRefresh(selectedTask.project_id);
      }}
      onViewLogs={() => selectedTask && setViewingLogs(selectedTask)}
      onClose={() => setDetailVisible(false)}
    />
  );

  return (
    <div ref={containerRef} className="flex h-screen overflow-hidden">
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        <TopBar activeTab={activeTab} onSelectTab={setActiveTab as (tab: 'projects') => void} />
        <div className="flex flex-1 overflow-hidden" style={isMobile ? { paddingBottom: '3.5rem' } : undefined}>
          <Sidebar
            activeTab={activeTab as TabKey}
            counts={counts}
            onSelectTab={setActiveTab as (tab: TabKey) => void}
          />

          {activeTab === 'projects' ? (
            <ProjectView
              projects={projects}
              onCreate={() => setShowCreateProject(true)}
              onDelete={async (p) => {
                if (confirm(`确定删除项目 "${p.name}" 及其所有任务？`)) {
                  await deleteProject(p.id);
                  handleRefresh();
                }
              }}
            />
          ) : (
            <div className="flex-1 min-w-0">
              <ListPanel
                activeTab={activeTab as TabKey}
                tasksByProject={tasksByProject}
                projectNames={projectNames}
                selectedTaskId={selectedTaskId}
                onSelectTask={(task) => { setSelectedTaskId(task.id); setDetailVisible(true); }}
                onCreateTask={() => setShowCreateTask(true)}
              />
            </div>
          )}
        </div>
      </div>

      {activeTab !== 'projects' && detailVisible && (
        isMobile ? (
          detailPanel
        ) : (
          <>
            <div
              className="w-1.5 cursor-col-resize bg-warm-border hover:bg-warm-tan shrink-0 transition-colors"
              onMouseDown={(e) => {
                e.preventDefault();
                resizingRef.current = true;
                document.body.style.userSelect = 'none';
                document.body.style.cursor = 'col-resize';
              }}
            />
            <div style={{ width: `${detailWidth}%` }} className="min-w-0">
              {detailPanel}
            </div>
          </>
        )
      )}

      <BottomNav
        activeTab={activeTab as TabKey}
        counts={counts}
        onSelectTab={setActiveTab as (tab: TabKey) => void}
      />

      {showCreateTask && (
        <CreateTaskModal
          projects={projects.map(p => ({ id: p.id, name: p.name }))}
          onClose={() => setShowCreateTask(false)}
          onCreated={() => { setShowCreateTask(false); handleRefresh(); }}
        />
      )}

      {showCreateProject && (
        <CreateProjectModal
          onClose={() => setShowCreateProject(false)}
          onCreated={() => { setShowCreateProject(false); handleRefresh(); }}
        />
      )}

      {editingTask && (
        <EditTaskModal
          task={editingTask}
          onClose={() => setEditingTask(null)}
          onUpdated={() => { setEditingTask(null); handleRefresh(editingTask.project_id); }}
        />
      )}

      {decidingTask && (
        <DecisionModal
          task={decidingTask}
          onClose={() => setDecidingTask(null)}
          onResolved={() => { setDecidingTask(null); handleRefresh(); }}
        />
      )}

      {reviewingTask && (
        <ReviewModal
          task={reviewingTask}
          onClose={() => setReviewingTask(null)}
          onResolved={() => { setReviewingTask(null); handleRefresh(); }}
        />
      )}

      {viewingLogs && (
        <LogViewer
          taskId={viewingLogs.id}
          taskTitle={viewingLogs.title}
          taskStatus={viewingLogs.status}
          liveOutputs={taskOutputs[viewingLogs.id] || []}
          onClose={() => setViewingLogs(null)}
        />
      )}
    </div>
  );
}
```

关键变更总结：
1. 新增 `useMediaQuery('(max-width: 768px)')` — 响应式检测
2. `Tab` 类型从 `'projects' | 'action' | TaskStatus` 变为 `'projects' | TabKey`
3. `counts` 按 tab 聚合而非按 status
4. 桌面端拖拽逻辑在 `isMobile` 时跳过 (`useEffect` 提前 return)
5. `detailPanel` 提取为变量，桌面端包裹分隔条+宽度控制，移动端直接渲染（全屏覆盖）
6. `BottomNav` 始终渲染（CSS `md:hidden` 控制显示）
7. 主内容区在移动端添加 `paddingBottom: 3.5rem` 避免被底部导航遮挡

- [ ] **Step 2: 验证 TypeScript 编译**

```bash
cd /Users/tangzeyu/project/claude-kanban && npx tsc --noEmit 2>&1
```

Expected: 无类型错误。

- [ ] **Step 3: 启动开发服务器验证**

```bash
cd /Users/tangzeyu/project/claude-kanban && npm run dev 2>&1 &
```

打开浏览器访问 `http://localhost:14568`：
- 桌面端宽度：Sidebar 显示在左侧，DetailPanel 侧边弹出，可拖拽调整宽度
- 缩窄到 <768px：Sidebar 消失，底部导航出现，DetailPanel 全屏覆盖
- 点击任务：移动端全屏显示详情，有返回按钮

- [ ] **Step 4: Commit**

```bash
git add client/src/App.tsx
git commit -m "feat: wire up mobile responsive layout with useMediaQuery"
```

---

### Task 8: index.css — 移动端全局样式

**Files:**
- Modify: `client/src/index.css`

- [ ] **Step 1: 添加 body 的移动端 viewport 优化**

在 `client/src/index.css` 的 `body` 选择器中添加移动端优化，并在文件末尾添加底部安全区变量：

将 `body` 块中的 `margin: 0;` 后追加 `overflow: hidden;`（防止移动端双滚动条）：

```css
body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  background: var(--color-warm-bg);
  color: var(--color-warm-text);
  margin: 0;
  overflow: hidden;
  -webkit-font-smoothing: antialiased;
}
```

- [ ] **Step 2: Commit**

```bash
git add client/src/index.css
git commit -m "fix: add overflow-hidden to body for mobile viewport"
```

---

### Task 9: 全量验证 + 收尾

**Files:** 无新建

- [ ] **Step 1: 完整类型检查**

```bash
cd /Users/tangzeyu/project/claude-kanban && npx tsc --noEmit 2>&1
```

Expected: 零错误。

- [ ] **Step 2: 构建验证**

```bash
cd /Users/tangzeyu/project/claude-kanban && npm run build 2>&1
```

Expected: 构建成功，无警告。

- [ ] **Step 3: 浏览器手动验证清单**

在 Chrome DevTools 中测试：

| 场景 | 预期行为 |
|------|---------|
| 桌面端 >768px | 左侧 Sidebar 可见，右侧 DetailPanel 侧边弹出，可拖拽 |
| 移动端 ≤768px | Sidebar 消失，底部固定导航显示 3 个 tab |
| 移动端点击任务 | DetailPanel 全屏覆盖，左上角有"返回"按钮 |
| 移动端点击返回 | 关闭详情，回到列表 |
| 移动端切换 tab | 列表内容切换，计数正确 |
| 移动端"待处理"tab | 徽标为红色(danger) |
| iOS Safari | 底部导航不被 Home Indicator 遮挡 |
| TopBar 移动端 | 按钮仅显示图标，无文字 |

- [ ] **Step 4: 最终 commit（如有遗漏文件）**

```bash
git status
git add -A
git commit -m "chore: finalize mobile responsive adaptation"
```
