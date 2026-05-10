# Electron 桌面应用重构 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 Claude Kanban 从 Web 应用重构为 Electron 桌面应用，暖色调手工风格 UI，左侧导航 + 列表/详情分屏布局。

**Architecture:** Electron 主进程 import `createApp` 启动 Express 服务器，BrowserWindow 加载 React 前端。前端用 React 18 + Vite 5 + Tailwind CSS 4.x，通过 `localhost:14567` API/WebSocket 通信。服务端代码零改动复用。

**Tech Stack:** Electron 33, React 18, Vite 5, Tailwind CSS 4.x, TypeScript 5.4, better-sqlite3, Express 4, ws 8

---

## 文件结构总览

```
新建:
  client/electron/main.ts           # Electron 主进程
  client/electron/preload.ts        # 预加载脚本
  client/src/status.ts              # 状态标签/图标/颜色工具
  client/src/components/Sidebar.tsx  # 左侧导航栏
  client/src/components/NavItem.tsx  # 单个导航项（图标+角标）
  client/src/components/ListPanel.tsx    # 任务列表容器
  client/src/components/ProjectGroup.tsx # 项目分组标题
  client/src/components/DetailPanel.tsx  # 右侧详情面板
  client/src/components/ActionBar.tsx    # 状态相关操作按钮
  client/src/components/LogPreview.tsx   # 日志预览
  client/src/components/EmptyState.tsx   # 空状态占位
  client/src/components/ProjectView.tsx  # 项目管理视图
  client/src/components/Modal.tsx        # 通用 Modal 容器
  client/src/components/CreateTaskModal.tsx   # 新建任务
  client/src/components/CreateProjectModal.tsx # 新建项目

重写:
  client/src/App.tsx                # 新布局：Sidebar + ListPanel + DetailPanel
  client/src/index.css              # Tailwind 4.x + 暖色主题

修改（Tailwind 暖色重绘）:
  client/src/components/DecisionModal.tsx
  client/src/components/ReviewModal.tsx
  client/src/components/EditTaskModal.tsx
  client/src/components/LogViewer.tsx
  client/vite.config.ts
  client/index.html
  package.json

删除:
  client/src/components/KanbanBoard.tsx
  client/src/components/ProjectList.tsx
  client/src/components/NewProjectModal.tsx
  client/src/components/NewTaskModal.tsx
  client/src/components/TaskCard.tsx
  client/dist/                        # 旧构建产物
```

---

### Task 1: Tailwind CSS 4.x 安装与暖色主题

**Files:**
- Modify: `package.json`
- Modify: `client/vite.config.ts`
- Rewrite: `client/src/index.css`

- [ ] **Step 1: 安装 Tailwind CSS 4.x**

Run: `npm install -D tailwindcss @tailwindcss/vite`

- [ ] **Step 2: 更新 client/vite.config.ts**

```typescript
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  base: './',
  server: {
    proxy: {
      '/api': 'http://localhost:14567',
      '/ws': {
        target: 'ws://localhost:14567',
        ws: true,
      },
    },
  },
  build: {
    outDir: '../dist/public',
    emptyOutDir: true,
  },
});
```

- [ ] **Step 3: 重写 client/src/index.css**

```css
@import "tailwindcss";

@theme {
  --color-warm-bg: #fef9f0;
  --color-warm-card: #fffbf5;
  --color-warm-border: #e8d5c4;
  --color-warm-text: #4e342e;
  --color-warm-text-secondary: #a1887f;
  --color-warm-brown: #8B5A2B;
  --color-warm-brown-hover: #6D3F1A;
  --color-warm-danger: #c0392b;
  --color-warm-danger-bg: #fdf2f2;
  --color-warm-tan: #d4a574;
  --color-warm-log-bg: #fdf8f0;
}

body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  background: var(--color-warm-bg);
  color: var(--color-warm-text);
  margin: 0;
  -webkit-font-smoothing: antialiased;
}
```

- [ ] **Step 4: 验证 Tailwind 生效**

Run: `cd client && npx vite --port 14569`
Open http://localhost:14569 in browser, confirm the warm background color is applied.

- [ ] **Step 5: Commit**

```bash
git add package.json client/vite.config.ts client/src/index.css
git commit -m "feat: add Tailwind CSS 4.x with warm craft theme tokens"
```

---

### Task 2: 状态工具模块

**Files:**
- Create: `client/src/status.ts`

- [ ] **Step 1: 创建 client/src/status.ts**

```typescript
import type { TaskStatus } from '../../src/types';

export const STATUS_LABEL: Record<TaskStatus, string> = {
  pending: '待启动',
  running: '进行中',
  deciding: '待决策',
  reviewing: '待验收',
  done: '已完成',
};

export const STATUS_ICON: Record<TaskStatus, string> = {
  pending: '📥',
  running: '⚡',
  deciding: '❓',
  reviewing: '✅',
  done: '📦',
};

export const STATUS_ORDER: TaskStatus[] = [
  'pending', 'running', 'deciding', 'reviewing', 'done',
];

export const PRIORITY_LABEL: Record<string, string> = {
  high: '高',
  normal: '中',
  low: '低',
};
```

- [ ] **Step 2: Commit**

```bash
git add client/src/status.ts
git commit -m "feat: add status label/icon utility module"
```

---

### Task 3: 通用组件 — EmptyState, Modal, NavItem

**Files:**
- Create: `client/src/components/EmptyState.tsx`
- Create: `client/src/components/Modal.tsx`
- Create: `client/src/components/NavItem.tsx`

- [ ] **Step 1: 创建 EmptyState**

```typescript
// client/src/components/EmptyState.tsx
interface Props {
  icon: string;
  message: string;
}

export function EmptyState({ icon, message }: Props) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-warm-text-secondary">
      <div className="text-3xl mb-3">{icon}</div>
      <p className="text-sm">{message}</p>
    </div>
  );
}
```

- [ ] **Step 2: 创建 Modal**

```typescript
// client/src/components/Modal.tsx
import type { ReactNode } from 'react';

interface Props {
  title: string;
  children: ReactNode;
  onClose: () => void;
  wide?: boolean;
}

export function Modal({ title, children, onClose, wide }: Props) {
  return (
    <div
      className="fixed inset-0 bg-black/30 flex items-center justify-center z-50"
      onClick={onClose}
    >
      <div
        className={`bg-warm-card border border-warm-border rounded-xl p-6 shadow-lg max-h-[85vh] overflow-y-auto ${
          wide ? 'w-[640px]' : 'w-[520px]'
        } max-w-[95vw]`}
        onClick={e => e.stopPropagation()}
      >
        <h3 className="text-base font-bold text-warm-text mb-4">{title}</h3>
        {children}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: 创建 NavItem**

```typescript
// client/src/components/NavItem.tsx

interface Props {
  icon: string;
  label: string;
  count?: number;
  active: boolean;
  dangerBadge?: boolean;
  onClick: () => void;
}

export function NavItem({ icon, label, count, active, dangerBadge, onClick }: Props) {
  return (
    <button
      onClick={onClick}
      className={`relative flex flex-col items-center gap-0.5 w-full py-2.5 rounded-lg transition-colors ${
        active
          ? 'text-warm-brown font-bold'
          : 'text-warm-text-secondary hover:text-warm-brown'
      }`}
    >
      <span className="text-lg relative">
        {icon}
        {count !== undefined && count > 0 && (
          <span
            className={`absolute -top-1 -right-3 min-w-[16px] h-4 text-[9px] leading-4 rounded-full px-1 text-white text-center ${
              dangerBadge ? 'bg-warm-danger' : 'bg-warm-brown'
            }`}
          >
            {count}
          </span>
        )}
      </span>
      <span className="text-[10px] leading-tight">{label}</span>
    </button>
  );
}
```

- [ ] **Step 4: Commit**

```bash
git add client/src/components/EmptyState.tsx client/src/components/Modal.tsx client/src/components/NavItem.tsx
git commit -m "feat: add EmptyState, Modal, and NavItem base components"
```

---

### Task 4: 左侧导航栏 Sidebar

**Files:**
- Create: `client/src/components/Sidebar.tsx`

- [ ] **Step 1: 创建 Sidebar**

```typescript
// client/src/components/Sidebar.tsx
import { NavItem } from './NavItem';
import { STATUS_ICON, STATUS_LABEL, STATUS_ORDER } from '../status';
import type { TaskStatus } from '../../../src/types';

interface Props {
  activeTab: 'projects' | TaskStatus;
  counts: Record<string, number>;
  onSelectTab: (tab: 'projects' | TaskStatus) => void;
}

export function Sidebar({ activeTab, counts, onSelectTab }: Props) {
  return (
    <aside className="w-14 flex-shrink-0 flex flex-col items-center gap-1 py-3 border-r border-warm-border bg-warm-card">
      {STATUS_ORDER.map(status => (
        <NavItem
          key={status}
          icon={STATUS_ICON[status]}
          label={STATUS_LABEL[status]}
          count={counts[status]}
          dangerBadge={status === 'deciding'}
          active={activeTab === status}
          onClick={() => onSelectTab(status)}
        />
      ))}
      <div className="mt-auto">
        <NavItem
          icon="📁"
          label="项目"
          active={activeTab === 'projects'}
          onClick={() => onSelectTab('projects')}
        />
      </div>
    </aside>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add client/src/components/Sidebar.tsx
git commit -m "feat: add Sidebar component with 5 status tabs + projects"
```

---

### Task 5: TaskCard 组件（列表版）

**Files:**
- Create: `client/src/components/TaskCard.tsx`（重写）

- [ ] **Step 1: 重写 TaskCard**

```typescript
// client/src/components/TaskCard.tsx
import type { Task } from '../../../src/types';
import { PRIORITY_LABEL } from '../status';

interface Props {
  task: Task;
  projectName: string;
  selected: boolean;
  onClick: () => void;
}

export function TaskCard({ task, projectName, selected, onClick }: Props) {
  const isDone = task.status === 'done';
  const isDeciding = task.status === 'deciding';

  return (
    <div
      onClick={onClick}
      className={`bg-warm-card border rounded-lg p-3 cursor-pointer transition-colors ${
        selected
          ? 'border-warm-tan ring-1 ring-warm-tan'
          : 'border-warm-border hover:border-warm-tan'
      } ${isDone ? 'opacity-60' : ''} ${isDeciding ? 'border-warm-danger border-dashed' : ''}`}
    >
      <div className={`text-[13px] font-bold text-warm-text mb-1 ${isDone ? 'line-through' : ''}`}>
        {task.title}
      </div>

      <div className="flex items-center gap-2 text-[10px] text-warm-text-secondary">
        {task.priority !== 'normal' && (
          <span className={task.priority === 'high' ? 'text-warm-danger font-semibold' : 'text-gray-400'}>
            {PRIORITY_LABEL[task.priority]}优先级
          </span>
        )}
        {task.status === 'running' && (
          <span className="text-warm-brown">
            第{task.current_turn}/{task.max_turns}轮 · ${(task.total_cost_usd || 0).toFixed(2)}
          </span>
        )}
        {task.status === 'deciding' && (
          <span className="text-warm-danger font-medium">等待决策</span>
        )}
        {task.status === 'reviewing' && task.summary && (
          <span className="truncate max-w-[200px]">{task.summary.slice(0, 50)}</span>
        )}
        {task.status === 'pending' && task.session_id && (
          <span className="text-warm-tan">可继续</span>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add client/src/components/TaskCard.tsx
git commit -m "feat: rewrite TaskCard for list-style layout with warm theme"
```

---

### Task 6: ListPanel 列表区 + ProjectGroup

**Files:**
- Create: `client/src/components/ProjectGroup.tsx`
- Create: `client/src/components/ListPanel.tsx`

- [ ] **Step 1: 创建 ProjectGroup**

```typescript
// client/src/components/ProjectGroup.tsx
import type { Task } from '../../../src/types';
import { TaskCard } from './TaskCard';

interface Props {
  projectName: string;
  tasks: Task[];
  selectedTaskId: string | null;
  onSelectTask: (task: Task) => void;
}

export function ProjectGroup({ projectName, tasks, selectedTaskId, onSelectTask }: Props) {
  if (tasks.length === 0) return null;

  return (
    <div className="mb-4">
      <h3 className="text-[11px] font-bold text-warm-brown uppercase tracking-wide mb-2">
        📁 {projectName}
      </h3>
      <div className="flex flex-col gap-1.5">
        {tasks.map(task => (
          <TaskCard
            key={task.id}
            task={task}
            projectName={projectName}
            selected={selectedTaskId === task.id}
            onClick={() => onSelectTask(task)}
          />
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: 创建 ListPanel**

```typescript
// client/src/components/ListPanel.tsx
import type { Task, TaskStatus } from '../../../src/types';
import { ProjectGroup } from './ProjectGroup';
import { EmptyState } from './EmptyState';
import { STATUS_LABEL, STATUS_ICON } from '../status';

interface Props {
  activeTab: TaskStatus;
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
  const filtered = Object.entries(tasksByProject).filter(
    ([, tasks]) => tasks.some(t => t.status === activeTab)
  );

  return (
    <div className="flex-1 flex flex-col overflow-hidden min-w-0">
      <div className="flex items-center justify-between px-4 py-3 border-b border-warm-border flex-shrink-0">
        <h2 className="text-sm font-bold text-warm-text">
          {STATUS_ICON[activeTab]} {STATUS_LABEL[activeTab]}
        </h2>
        {(activeTab === 'pending' || activeTab === 'running') && (
          <button
            onClick={onCreateTask}
            className="text-[11px] bg-warm-brown text-white px-3 py-1.5 rounded-lg font-bold hover:bg-warm-brown-hover transition-colors"
          >
            + 任务
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-3">
        {filtered.length === 0 ? (
          <EmptyState icon={STATUS_ICON[activeTab]} message={`没有${STATUS_LABEL[activeTab]}的任务`} />
        ) : (
          filtered.map(([projectId, tasks]) => (
            <ProjectGroup
              key={projectId}
              projectName={projectNames[projectId] || projectId}
              tasks={tasks.filter(t => t.status === activeTab)}
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

- [ ] **Step 3: Commit**

```bash
git add client/src/components/ProjectGroup.tsx client/src/components/ListPanel.tsx
git commit -m "feat: add ListPanel with cross-project task grouping"
```

---

### Task 7: DetailPanel 详情区 + ActionBar + LogPreview

**Files:**
- Create: `client/src/components/ActionBar.tsx`
- Create: `client/src/components/LogPreview.tsx`
- Create: `client/src/components/DetailPanel.tsx`

- [ ] **Step 1: 创建 ActionBar**

```typescript
// client/src/components/ActionBar.tsx
import type { Task } from '../../../src/types';

interface Props {
  task: Task;
  onStart: () => void;
  onStop: () => void;
  onContinue: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onDecide: () => void;
  onApprove: () => void;
  onReject: () => void;
  onViewLogs: () => void;
}

export function ActionBar({ task, onStart, onStop, onContinue, onEdit, onDelete, onDecide, onApprove, onReject, onViewLogs }: Props) {
  return (
    <div className="flex flex-wrap gap-2">
      {task.status === 'pending' && (
        <>
          <button onClick={onStart} className="px-4 py-1.5 bg-warm-brown text-white rounded-lg text-xs font-bold hover:bg-warm-brown-hover transition-colors">
            ▶ 开始
          </button>
          {task.session_id && (
            <button onClick={onContinue} className="px-4 py-1.5 border border-warm-tan text-warm-brown rounded-lg text-xs font-semibold hover:bg-warm-card transition-colors">
              继续
            </button>
          )}
          <button onClick={onEdit} className="px-4 py-1.5 border border-warm-border text-warm-text-secondary rounded-lg text-xs font-semibold hover:border-warm-tan transition-colors">
            编辑
          </button>
          <button onClick={onDelete} className="px-4 py-1.5 border border-warm-danger text-warm-danger rounded-lg text-xs font-semibold hover:bg-warm-danger-bg transition-colors">
            删除
          </button>
        </>
      )}

      {task.status === 'running' && (
        <>
          <button onClick={onStop} className="px-4 py-1.5 border border-warm-danger text-warm-danger rounded-lg text-xs font-semibold hover:bg-warm-danger-bg transition-colors">
            ⏹ 停止
          </button>
          <button onClick={onContinue} className="px-4 py-1.5 bg-warm-brown text-white rounded-lg text-xs font-bold hover:bg-warm-brown-hover transition-colors">
            继续
          </button>
          <button onClick={onViewLogs} className="px-4 py-1.5 border border-warm-tan text-warm-brown rounded-lg text-xs font-semibold hover:bg-warm-card transition-colors">
            📋 日志
          </button>
        </>
      )}

      {task.status === 'deciding' && (
        <button onClick={onDecide} className="px-4 py-1.5 bg-warm-danger text-white rounded-lg text-xs font-bold hover:opacity-85 transition-colors">
          查看决策
        </button>
      )}

      {task.status === 'reviewing' && (
        <>
          <button onClick={onApprove} className="px-4 py-1.5 bg-warm-brown text-white rounded-lg text-xs font-bold hover:bg-warm-brown-hover transition-colors">
            ✓ 验收通过
          </button>
          <button onClick={onReject} className="px-4 py-1.5 border border-warm-danger text-warm-danger rounded-lg text-xs font-semibold hover:bg-warm-danger-bg transition-colors">
            ↩ 回复继续
          </button>
        </>
      )}

      {task.status === 'done' && (
        <button onClick={onViewLogs} className="px-4 py-1.5 border border-warm-tan text-warm-brown rounded-lg text-xs font-semibold hover:bg-warm-card transition-colors">
          📋 查看日志
        </button>
      )}
    </div>
  );
}
```

- [ ] **Step 2: 创建 LogPreview**

```typescript
// client/src/components/LogPreview.tsx
import { useEffect } from 'react';

interface Props {
  lines: { stream: string; text: string }[];
  onViewFull: () => void;
}

export function LogPreview({ lines, onViewFull }: Props) {
  const recent = lines.slice(-20);

  return (
    <div className="mt-4">
      <div className="flex items-center justify-between mb-2">
        <h4 className="text-[11px] font-bold text-warm-brown">📝 最近日志</h4>
        <button
          onClick={onViewFull}
          className="text-[10px] text-warm-tan hover:text-warm-brown transition-colors"
        >
          查看全部 →
        </button>
      </div>
      <div className="bg-warm-log-bg border border-warm-border rounded-lg p-3 max-h-[260px] overflow-y-auto">
        {recent.length === 0 ? (
          <p className="text-[10px] text-warm-text-secondary">暂无日志</p>
        ) : (
          <pre className="text-[10px] text-warm-text font-mono leading-relaxed whitespace-pre-wrap m-0">
            {recent.map((line, i) => (
              <span key={i} className={line.stream === 'stderr' ? 'text-warm-danger' : ''}>
                {line.text}
              </span>
            ))}
          </pre>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: 创建 DetailPanel**

```typescript
// client/src/components/DetailPanel.tsx
import type { Task } from '../../../src/types';
import { PRIORITY_LABEL, STATUS_LABEL, STATUS_ICON } from '../status';
import { ActionBar } from './ActionBar';
import { LogPreview } from './LogPreview';
import { EmptyState } from './EmptyState';

interface Props {
  task: Task | null;
  projectName: string;
  logs: { stream: string; text: string }[];
  onStart: () => void;
  onStop: () => void;
  onContinue: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onDecide: () => void;
  onApprove: () => void;
  onReject: () => void;
  onViewLogs: () => void;
}

export function DetailPanel({ task, projectName, logs, ...actions }: Props) {
  if (!task) {
    return (
      <div className="w-[360px] flex-shrink-0 border-l border-warm-border bg-warm-card flex items-center justify-center">
        <EmptyState icon="👈" message="选择一个任务查看详情" />
      </div>
    );
  }

  return (
    <div className="w-[360px] flex-shrink-0 border-l border-warm-border bg-warm-card overflow-y-auto">
      <div className="p-4">
        <div className="mb-4">
          <h2 className="text-[15px] font-bold text-warm-text mb-1">{task.title}</h2>
          <div className="flex items-center gap-2 text-[11px] text-warm-text-secondary">
            <span>📁 {projectName}</span>
            <span>{STATUS_ICON[task.status]} {STATUS_LABEL[task.status]}</span>
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
            <h4 className="text-[10px] font-bold text-warm-brown mb-2">📊 状态</h4>
            <div className="text-[11px] text-warm-text space-y-0.5">
              <p>轮次: {task.current_turn}/{task.max_turns}</p>
              <p>费用: ${(task.total_cost_usd || 0).toFixed(2)}</p>
              {task.session_id && <p>会话: {task.session_id.slice(0, 8)}...</p>}
            </div>
          </div>
        )}

        {task.status === 'reviewing' && task.summary && (
          <div className="mb-4">
            <h4 className="text-[10px] font-bold text-warm-brown mb-1">📝 摘要</h4>
            <p className="text-[12px] text-warm-text leading-relaxed">{task.summary}</p>
          </div>
        )}

        <ActionBar task={task} {...actions} />

        <LogPreview lines={logs} onViewFull={actions.onViewLogs} />
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Commit**

```bash
git add client/src/components/ActionBar.tsx client/src/components/LogPreview.tsx client/src/components/DetailPanel.tsx
git commit -m "feat: add DetailPanel with ActionBar and LogPreview"
```

---

### Task 8: 项目管理视图 ProjectView

**Files:**
- Create: `client/src/components/ProjectView.tsx`

- [ ] **Step 1: 创建 ProjectView**

```typescript
// client/src/components/ProjectView.tsx
import type { Project } from '../../../src/types';
import { EmptyState } from './EmptyState';

interface ProjectWithTaskCounts {
  id: string;
  name: string;
  working_dir: string;
  created_at: string;
  count_pending: number;
  count_running: number;
  count_deciding: number;
  count_reviewing: number;
  count_done: number;
}

interface Props {
  projects: ProjectWithTaskCounts[];
  onCreate: () => void;
  onDelete: (project: Project) => void;
}

export function ProjectView({ projects, onCreate, onDelete }: Props) {
  return (
    <div className="flex-1 flex flex-col overflow-hidden min-w-0">
      <div className="flex items-center justify-between px-4 py-3 border-b border-warm-border flex-shrink-0">
        <h2 className="text-sm font-bold text-warm-text">📁 项目</h2>
        <button
          onClick={onCreate}
          className="text-[11px] bg-warm-brown text-white px-3 py-1.5 rounded-lg font-bold hover:bg-warm-brown-hover transition-colors"
        >
          + 新建
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-3">
        {projects.length === 0 ? (
          <EmptyState icon="📁" message="还没有项目，点击上方按钮创建" />
        ) : (
          <div className="flex flex-col gap-2.5">
            {projects.map(p => (
              <div
                key={p.id}
                className="bg-warm-card border border-warm-border rounded-lg p-3.5 flex items-center justify-between group"
              >
                <div className="min-w-0">
                  <div className="text-[13px] font-bold text-warm-text">{p.name}</div>
                  <div className="text-[10px] text-warm-text-secondary mt-0.5 truncate">{p.working_dir}</div>
                  <div className="flex gap-1.5 mt-1.5">
                    {p.count_pending > 0 && (
                      <span className="text-[9px] bg-warm-border text-warm-brown px-1.5 py-0.5 rounded">{p.count_pending}待启动</span>
                    )}
                    {p.count_running > 0 && (
                      <span className="text-[9px] bg-warm-border text-warm-brown px-1.5 py-0.5 rounded">{p.count_running}进行中</span>
                    )}
                    {p.count_deciding > 0 && (
                      <span className="text-[9px] bg-warm-danger-bg text-warm-danger px-1.5 py-0.5 rounded">{p.count_deciding}待决策</span>
                    )}
                    {p.count_reviewing > 0 && (
                      <span className="text-[9px] bg-warm-border text-warm-brown px-1.5 py-0.5 rounded">{p.count_reviewing}待验收</span>
                    )}
                    {p.count_done > 0 && (
                      <span className="text-[9px] bg-warm-border text-warm-brown px-1.5 py-0.5 rounded">{p.count_done}已完成</span>
                    )}
                  </div>
                </div>
                <button
                  onClick={() => onDelete(p)}
                  className="text-[10px] border border-warm-danger text-warm-danger px-2 py-0.5 rounded opacity-0 group-hover:opacity-100 hover:bg-warm-danger-bg transition-all flex-shrink-0 ml-3"
                >
                  删除
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add client/src/components/ProjectView.tsx
git commit -m "feat: add ProjectView for project management"
```

---

### Task 9: 弹窗组件 — CreateTask, CreateProject, EditTask

**Files:**
- Create: `client/src/components/CreateTaskModal.tsx`
- Create: `client/src/components/CreateProjectModal.tsx`
- Rewrite: `client/src/components/EditTaskModal.tsx`

- [ ] **Step 1: 创建 CreateTaskModal**

```typescript
// client/src/components/CreateTaskModal.tsx
import { useState } from 'react';
import type { Project } from '../../../src/types';
import { createTask, startTask } from '../api';
import { Modal } from './Modal';

interface Props {
  projects: { id: string; name: string }[];
  onClose: () => void;
  onCreated: () => void;
}

export function CreateTaskModal({ projects, onClose, onCreated }: Props) {
  const [projectId, setProjectId] = useState(projects[0]?.id || '');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState('normal');
  const [maxTurns, setMaxTurns] = useState(50);
  const [submitting, setSubmitting] = useState(false);

  const handleCreate = async (start: boolean) => {
    if (!title.trim() || !projectId) return;
    setSubmitting(true);
    try {
      const task = await createTask(projectId, {
        title: title.trim(),
        description: description.trim(),
        priority: priority as 'high' | 'normal' | 'low',
        max_turns: maxTurns,
      });
      if (start) await startTask(task.id);
      onCreated();
    } catch (e) {
      alert('创建失败: ' + (e as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal title="+ 新建任务" onClose={onClose}>
      <div className="space-y-3">
        <div>
          <label className="block text-[11px] font-semibold text-warm-text-secondary mb-1">项目</label>
          <select
            value={projectId}
            onChange={e => setProjectId(e.target.value)}
            className="w-full p-2 border border-warm-border rounded-lg text-sm bg-warm-card text-warm-text"
          >
            {projects.map(p => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-[11px] font-semibold text-warm-text-secondary mb-1">标题</label>
          <input
            value={title}
            onChange={e => setTitle(e.target.value)}
            className="w-full p-2 border border-warm-border rounded-lg text-sm bg-warm-card text-warm-text"
            placeholder="任务标题"
            autoFocus
          />
        </div>
        <div>
          <label className="block text-[11px] font-semibold text-warm-text-secondary mb-1">描述</label>
          <textarea
            value={description}
            onChange={e => setDescription(e.target.value)}
            className="w-full p-2 border border-warm-border rounded-lg text-sm bg-warm-card text-warm-text resize-y"
            placeholder="任务描述（可选）"
            rows={3}
          />
        </div>
        <div className="flex gap-3">
          <div className="flex-1">
            <label className="block text-[11px] font-semibold text-warm-text-secondary mb-1">优先级</label>
            <select
              value={priority}
              onChange={e => setPriority(e.target.value)}
              className="w-full p-2 border border-warm-border rounded-lg text-sm bg-warm-card text-warm-text"
            >
              <option value="high">高</option>
              <option value="normal" selected>中</option>
              <option value="low">低</option>
            </select>
          </div>
          <div className="flex-1">
            <label className="block text-[11px] font-semibold text-warm-text-secondary mb-1">最大轮次</label>
            <input
              type="number"
              value={maxTurns}
              onChange={e => setMaxTurns(Number(e.target.value))}
              className="w-full p-2 border border-warm-border rounded-lg text-sm bg-warm-card text-warm-text"
              min={1}
              max={200}
            />
          </div>
        </div>
        <div className="flex justify-end gap-2 pt-3">
          <button
            onClick={onClose}
            className="px-4 py-2 border border-warm-border text-warm-text-secondary rounded-lg text-xs font-semibold"
            disabled={submitting}
          >
            取消
          </button>
          <button
            onClick={() => handleCreate(false)}
            className="px-4 py-2 border border-warm-tan text-warm-brown rounded-lg text-xs font-semibold"
            disabled={submitting || !title.trim()}
          >
            创建为待启动
          </button>
          <button
            onClick={() => handleCreate(true)}
            className="px-4 py-2 bg-warm-brown text-white rounded-lg text-xs font-bold"
            disabled={submitting || !title.trim()}
          >
            创建并启动
          </button>
        </div>
      </div>
    </Modal>
  );
}
```

- [ ] **Step 2: 创建 CreateProjectModal**

```typescript
// client/src/components/CreateProjectModal.tsx
import { useState } from 'react';
import { createProject, pickDirectory } from '../api';
import { Modal } from './Modal';

interface Props {
  onClose: () => void;
  onCreated: () => void;
}

export function CreateProjectModal({ onClose, onCreated }: Props) {
  const [name, setName] = useState('');
  const [workingDir, setWorkingDir] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [browsing, setBrowsing] = useState(false);

  const handleBrowse = async () => {
    setBrowsing(true);
    try {
      const result = await pickDirectory();
      if (result.path) setWorkingDir(result.path);
    } catch (e) {
      alert('选择目录失败: ' + (e as Error).message);
    } finally {
      setBrowsing(false);
    }
  };

  const handleCreate = async () => {
    if (!name.trim() || !workingDir.trim()) return;
    setSubmitting(true);
    try {
      await createProject({ name: name.trim(), working_dir: workingDir.trim() });
      onCreated();
    } catch (e) {
      alert('创建失败: ' + (e as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal title="+ 新建项目" onClose={onClose}>
      <div className="space-y-3">
        <div>
          <label className="block text-[11px] font-semibold text-warm-text-secondary mb-1">项目名称</label>
          <input
            value={name}
            onChange={e => setName(e.target.value)}
            className="w-full p-2 border border-warm-border rounded-lg text-sm bg-warm-card text-warm-text"
            placeholder="输入项目名称"
            autoFocus
          />
        </div>
        <div>
          <label className="block text-[11px] font-semibold text-warm-text-secondary mb-1">工作目录</label>
          <div className="flex gap-2">
            <input
              value={workingDir}
              onChange={e => setWorkingDir(e.target.value)}
              className="flex-1 p-2 border border-warm-border rounded-lg text-sm bg-warm-card text-warm-text"
              placeholder="选择或输入路径"
            />
            <button
              onClick={handleBrowse}
              className="px-3 py-2 border border-warm-tan text-warm-brown rounded-lg text-xs font-semibold hover:bg-warm-card"
              disabled={browsing}
            >
              浏览...
            </button>
          </div>
        </div>
        <div className="flex justify-end gap-2 pt-3">
          <button
            onClick={onClose}
            className="px-4 py-2 border border-warm-border text-warm-text-secondary rounded-lg text-xs font-semibold"
          >
            取消
          </button>
          <button
            onClick={handleCreate}
            className="px-4 py-2 bg-warm-brown text-white rounded-lg text-xs font-bold"
            disabled={submitting || !name.trim() || !workingDir.trim()}
          >
            创建
          </button>
        </div>
      </div>
    </Modal>
  );
}
```

- [ ] **Step 3: 重写 EditTaskModal**

```typescript
// client/src/components/EditTaskModal.tsx
import { useState } from 'react';
import type { Task } from '../../../src/types';
import { updateTask } from '../api';
import { Modal } from './Modal';

interface Props {
  task: Task;
  onClose: () => void;
  onUpdated: () => void;
}

export function EditTaskModal({ task, onClose, onUpdated }: Props) {
  const [title, setTitle] = useState(task.title);
  const [description, setDescription] = useState(task.description);
  const [submitting, setSubmitting] = useState(false);

  const handleSave = async () => {
    if (!title.trim()) return;
    setSubmitting(true);
    try {
      await updateTask(task.id, { title: title.trim(), description: description.trim() });
      onUpdated();
    } catch (e) {
      alert('保存失败: ' + (e as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal title="编辑任务" onClose={onClose}>
      <div className="space-y-3">
        <div>
          <label className="block text-[11px] font-semibold text-warm-text-secondary mb-1">标题</label>
          <input
            value={title}
            onChange={e => setTitle(e.target.value)}
            className="w-full p-2 border border-warm-border rounded-lg text-sm bg-warm-card text-warm-text"
            autoFocus
          />
        </div>
        <div>
          <label className="block text-[11px] font-semibold text-warm-text-secondary mb-1">描述</label>
          <textarea
            value={description}
            onChange={e => setDescription(e.target.value)}
            className="w-full p-2 border border-warm-border rounded-lg text-sm bg-warm-card text-warm-text resize-y"
            rows={4}
          />
        </div>
        <div className="flex justify-end gap-2 pt-3">
          <button
            onClick={onClose}
            className="px-4 py-2 border border-warm-border text-warm-text-secondary rounded-lg text-xs font-semibold"
          >
            取消
          </button>
          <button
            onClick={handleSave}
            className="px-4 py-2 bg-warm-brown text-white rounded-lg text-xs font-bold"
            disabled={submitting || !title.trim()}
          >
            保存
          </button>
        </div>
      </div>
    </Modal>
  );
}
```

- [ ] **Step 4: Commit**

```bash
git add client/src/components/CreateTaskModal.tsx client/src/components/CreateProjectModal.tsx client/src/components/EditTaskModal.tsx
git commit -m "feat: add CreateTask, CreateProject, EditTask modals with warm theme"
```

---

### Task 10: 重绘 DecisionModal 和 ReviewModal

**Files:**
- Rewrite: `client/src/components/DecisionModal.tsx`
- Rewrite: `client/src/components/ReviewModal.tsx`

- [ ] **Step 1: 重写 DecisionModal（Tailwind 暖色版）**

```typescript
// client/src/components/DecisionModal.tsx
import { useState, useEffect } from 'react';
import type { Task, Decision } from '../../../src/types';
import { getTaskWithDecision, submitDecision } from '../api';
import { Modal } from './Modal';

interface Props {
  task: Task;
  onClose: () => void;
  onResolved: () => void;
}

export function DecisionModal({ task, onClose, onResolved }: Props) {
  const [decision, setDecision] = useState<Decision | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedOption, setSelectedOption] = useState<string | null>(null);
  const [otherText, setOtherText] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    getTaskWithDecision(task.id).then(data => {
      setDecision(data.pendingDecision);
      if (data.pendingDecision?.options) {
        const opts = typeof data.pendingDecision.options === 'string'
          ? JSON.parse(data.pendingDecision.options)
          : data.pendingDecision.options;
        data.pendingDecision.options = opts;
      }
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [task.id]);

  const handleSubmit = async () => {
    const answer = selectedOption === 'other' ? otherText.trim() : selectedOption;
    if (!answer) return;
    setSubmitting(true);
    try {
      await submitDecision(task.id, answer);
      onResolved();
    } catch (e) {
      alert('提交失败: ' + (e as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50">
        <div className="bg-warm-card border border-warm-border rounded-xl p-6">
          <p className="text-sm text-warm-text-secondary">加载中...</p>
        </div>
      </div>
    );
  }

  return (
    <Modal title={`❓ 待决策 — ${task.title}`} onClose={onClose} wide>
      {decision && (
        <>
          {decision.context && (
            <div className="mb-3">
              <div className="text-[10px] font-semibold text-warm-text-secondary uppercase mb-1.5">Claude 的输出上下文</div>
              <div className="bg-warm-log-bg border border-warm-border rounded-lg p-3 max-h-[180px] overflow-y-auto text-[12px] text-warm-text leading-relaxed">
                {decision.context.split('\n').map((line, i) => (
                  <p key={i}>{line || ' '}</p>
                ))}
              </div>
            </div>
          )}

          <div className="mb-3">
            <div className="text-[10px] font-semibold text-warm-text-secondary uppercase mb-1.5">Claude 的问题</div>
            <div className="bg-[#fef9f0] border border-warm-tan rounded-lg p-3 text-[13px] text-warm-text font-medium">
              {decision.question}
            </div>
          </div>
        </>
      )}

      <div>
        <div className="text-[10px] font-semibold text-warm-text-secondary uppercase mb-1.5">你的回答</div>
        {(decision?.options || []).map((opt: { label: string; description?: string }, i: number) => (
          <div
            key={i}
            onClick={() => setSelectedOption(opt.label)}
            className={`p-2.5 border rounded-lg mb-1.5 cursor-pointer transition-colors ${
              selectedOption === opt.label
                ? 'border-warm-brown bg-[#fef9f0]'
                : 'border-warm-border hover:border-warm-tan'
            }`}
          >
            <div className="text-[12px] font-semibold text-warm-text">
              {String.fromCharCode(65 + i)} · {opt.label}
            </div>
            {opt.description && (
              <div className="text-[11px] text-warm-text-secondary mt-0.5">{opt.description}</div>
            )}
          </div>
        ))}

        <div
          onClick={() => setSelectedOption('other')}
          className={`p-2.5 border rounded-lg mb-1.5 cursor-pointer transition-colors border-dashed ${
            selectedOption === 'other'
              ? 'border-warm-brown bg-[#fef9f0]'
              : 'border-warm-border hover:border-warm-tan'
          }`}
        >
          <div className="text-[12px] font-semibold text-warm-text">✎ 自定义回答</div>
          {selectedOption === 'other' && (
            <textarea
              value={otherText}
              onChange={e => setOtherText(e.target.value)}
              placeholder="输入你的回答..."
              rows={3}
              className="w-full mt-2 p-2 border border-warm-border rounded-lg text-sm bg-warm-card text-warm-text resize-y"
              onClick={e => e.stopPropagation()}
            />
          )}
        </div>
      </div>

      <div className="flex justify-end gap-2 pt-4">
        <button
          onClick={onClose}
          className="px-4 py-2 border border-warm-border text-warm-text-secondary rounded-lg text-xs font-semibold"
          disabled={submitting}
        >
          稍后处理
        </button>
        <button
          onClick={handleSubmit}
          className="px-4 py-2 bg-warm-brown text-white rounded-lg text-xs font-bold"
          disabled={submitting || !selectedOption || (selectedOption === 'other' && !otherText.trim())}
        >
          提交回答并继续执行
        </button>
      </div>
    </Modal>
  );
}
```

- [ ] **Step 2: 重写 ReviewModal（Tailwind 暖色版）**

```typescript
// client/src/components/ReviewModal.tsx
import { useState } from 'react';
import type { Task } from '../../../src/types';
import { approveTask, rejectTask } from '../api';
import { Modal } from './Modal';

interface Props {
  task: Task;
  onClose: () => void;
  onResolved: () => void;
}

export function ReviewModal({ task, onClose, onResolved }: Props) {
  const [feedback, setFeedback] = useState('');
  const [showFeedback, setShowFeedback] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const handleApprove = async () => {
    setSubmitting(true);
    try { await approveTask(task.id); onResolved(); }
    catch (e) { alert('操作失败: ' + (e as Error).message); }
    finally { setSubmitting(false); }
  };

  const handleReject = async () => {
    if (!feedback.trim()) return;
    setSubmitting(true);
    try { await rejectTask(task.id, feedback.trim()); onResolved(); }
    catch (e) { alert('操作失败: ' + (e as Error).message); }
    finally { setSubmitting(false); }
  };

  const isDone = task.status === 'done';

  return (
    <Modal title={`${isDone ? '🏁 已完成' : '✅ 待验收'} — ${task.title}`} onClose={onClose}>
      {task.summary && (
        <div className="mb-3">
          <div className="text-[10px] font-semibold text-warm-text-secondary uppercase mb-1.5">Claude 的完成摘要</div>
          <div className="bg-warm-log-bg border border-warm-border rounded-lg p-3 text-[12px] text-warm-text leading-relaxed max-h-[200px] overflow-y-auto">
            {task.summary.split('\n').map((line, i) => (
              <p key={i}>{line || ' '}</p>
            ))}
          </div>
        </div>
      )}

      <div className="flex gap-6 text-[12px] text-warm-text-secondary mb-4">
        <span>总花费: ${(task.total_cost_usd || 0).toFixed(2)}</span>
        <span>总轮次: {task.current_turn}</span>
      </div>

      {isDone ? (
        <div className="flex justify-end">
          <button onClick={onClose} className="px-4 py-2 border border-warm-border text-warm-text-secondary rounded-lg text-xs font-semibold">关闭</button>
        </div>
      ) : !showFeedback ? (
        <div className="flex justify-end gap-2">
          <button onClick={() => setShowFeedback(true)} className="px-4 py-2 border border-warm-tan text-warm-brown rounded-lg text-xs font-semibold" disabled={submitting}>
            ↩ 回复继续
          </button>
          <button onClick={handleApprove} className="px-4 py-2 bg-warm-brown text-white rounded-lg text-xs font-bold" disabled={submitting}>
            ✓ 验收通过
          </button>
        </div>
      ) : (
        <div>
          <div className="mb-3">
            <label className="block text-[10px] font-semibold text-warm-text-secondary uppercase mb-1.5">修改意见</label>
            <textarea
              value={feedback}
              onChange={e => setFeedback(e.target.value)}
              placeholder="告诉 Claude 哪里需要改..."
              rows={3}
              autoFocus
              className="w-full p-2 border border-warm-border rounded-lg text-sm bg-warm-card text-warm-text resize-y"
            />
          </div>
          <div className="flex justify-end gap-2">
            <button onClick={() => setShowFeedback(false)} className="px-4 py-2 border border-warm-border text-warm-text-secondary rounded-lg text-xs font-semibold" disabled={submitting}>取消</button>
            <button onClick={handleReject} className="px-4 py-2 bg-warm-brown text-white rounded-lg text-xs font-bold" disabled={submitting || !feedback.trim()}>发送</button>
          </div>
        </div>
      )}
    </Modal>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add client/src/components/DecisionModal.tsx client/src/components/ReviewModal.tsx
git commit -m "refactor: rewrite DecisionModal and ReviewModal with Tailwind warm theme"
```

---

### Task 11: 重绘 LogViewer（暖色终端风格）

**Files:**
- Rewrite: `client/src/components/LogViewer.tsx`

- [ ] **Step 1: 重写 LogViewer**

```typescript
// client/src/components/LogViewer.tsx
import { useState, useEffect, useRef } from 'react';
import { fetchTaskLogs } from '../api';
import { Modal } from './Modal';

interface Props {
  taskId: string;
  taskTitle: string;
  liveOutputs: { stream: string; text: string }[];
  onClose: () => void;
}

export function LogViewer({ taskId, taskTitle, liveOutputs, onClose }: Props) {
  const [autoScroll, setAutoScroll] = useState(true);
  const [logText, setLogText] = useState('');
  const [offset, setOffset] = useState(0);
  const [eof, setEof] = useState(false);
  const bodyRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchTaskLogs(taskId, 0).then(data => {
      setLogText(data.text);
      setOffset(data.offset);
      setEof(data.eof);
    }).catch(() => {});
  }, [taskId]);

  useEffect(() => {
    if (autoScroll && bodyRef.current) {
      bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
    }
  }, [liveOutputs, autoScroll]);

  const allLines = [
    ...logText.split('\n').map(text => ({ stream: 'stdout', text })),
    ...liveOutputs,
  ];

  const getLineClass = (text: string) => {
    try {
      const parsed = JSON.parse(text);
      if (parsed.type === 'assistant' && parsed.message?.content) {
        const content = parsed.message.content;
        if (Array.isArray(content)) {
          const hasThinking = content.some((b: { type: string }) => b.type === 'thinking');
          if (hasThinking) return 'text-warm-text-secondary italic';
          if (content.some((b: { type: string }) => b.type === 'tool_use')) return 'text-warm-brown';
        }
        return 'text-warm-text';
      }
      if (parsed.type === 'user') return 'text-warm-text-secondary text-[11px]';
      if (parsed.type === 'result') return 'text-emerald-700';
      if (parsed.type === 'system') return 'text-warm-text-secondary text-[10px]';
      return 'text-warm-text';
    } catch {
      return 'text-warm-text';
    }
  };

  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50" onClick={onClose}>
      <div
        className="bg-warm-card border border-warm-border rounded-xl shadow-lg flex flex-col"
        style={{ width: '70vw', maxWidth: '900px', height: '80vh' }}
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-3 border-b border-warm-border flex-shrink-0">
          <h3 className="text-sm font-bold text-warm-text truncate">📋 日志 — {taskTitle}</h3>
          <div className="flex items-center gap-4 flex-shrink-0">
            <label className="flex items-center gap-1.5 text-[11px] text-warm-text-secondary cursor-pointer">
              <input type="checkbox" checked={autoScroll} onChange={e => setAutoScroll(e.target.checked)} />
              自动滚动
            </label>
            <button onClick={onClose} className="px-3 py-1 border border-warm-border rounded-lg text-[11px] text-warm-text-secondary">关闭</button>
          </div>
        </div>

        <div ref={bodyRef} className="flex-1 overflow-y-auto min-h-0 bg-warm-log-bg rounded-b-xl">
          {allLines.length === 0 ? (
            <div className="flex items-center justify-center h-full text-[13px] text-warm-text-secondary">暂无日志</div>
          ) : (
            <pre className="m-0 p-4 font-mono text-[11px] leading-relaxed text-warm-text whitespace-pre-wrap break-all">
              {allLines.map((line, i) => (
                <span key={i} className={`${getLineClass(line.text)} ${line.stream === 'stderr' ? 'text-warm-danger' : ''}`}>
                  {line.text}
                  {line.text.endsWith('\n') ? '' : '\n'}
                </span>
              ))}
            </pre>
          )}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add client/src/components/LogViewer.tsx
git commit -m "refactor: rewrite LogViewer with warm-tone terminal style"
```

---

### Task 12: 重写 App.tsx — 主布局集成

**Files:**
- Rewrite: `client/src/App.tsx`

- [ ] **Step 1: 重写 App.tsx**

```typescript
// client/src/App.tsx
import { useState, useEffect, useCallback } from 'react';
import type { Project, Task, Decision, WsMessage, TaskOutputPayload, TaskStatus } from '../../src/types';
import { listProjects, listTasks, startTask, stopTask, continueTask, deleteTask, deleteProject, updateTaskStatus } from './api';
import { useWebSocket } from './useWebSocket';
import { Sidebar } from './components/Sidebar';
import { ListPanel } from './components/ListPanel';
import { DetailPanel } from './components/DetailPanel';
import { ProjectView } from './components/ProjectView';
import { CreateTaskModal } from './components/CreateTaskModal';
import { CreateProjectModal } from './components/CreateProjectModal';
import { EditTaskModal } from './components/EditTaskModal';
import { DecisionModal } from './components/DecisionModal';
import { ReviewModal } from './components/ReviewModal';
import { LogViewer } from './components/LogViewer';

type Tab = 'projects' | TaskStatus;

type ProjectData = Project & {
  count_pending: number; count_running: number; count_deciding: number;
  count_reviewing: number; count_done: number;
};

export default function App() {
  const [activeTab, setActiveTab] = useState<Tab>('pending');
  const [projects, setProjects] = useState<ProjectData[]>([]);
  const [tasks, setTasks] = useState<Record<string, Task[]>>({});
  const [taskOutputs, setTaskOutputs] = useState<Record<string, { stream: string; text: string }[]>>({});
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [viewingLogs, setViewingLogs] = useState<Task | null>(null);

  // Modal state
  const [showCreateTask, setShowCreateTask] = useState(false);
  const [showCreateProject, setShowCreateProject] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [decidingTask, setDecidingTask] = useState<Task | null>(null);
  const [reviewingTask, setReviewingTask] = useState<Task | null>(null);

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

  const counts: Record<string, number> = {};
  allTasks.forEach(t => { counts[t.status] = (counts[t.status] || 0) + 1; });

  const projectList = projects.map(p => ({
    id: p.id, name: p.name, working_dir: p.working_dir,
  }));

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar
        activeTab={activeTab}
        counts={counts}
        onSelectTab={setActiveTab}
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
        <ListPanel
          activeTab={activeTab}
          tasksByProject={tasksByProject}
          projectNames={projectNames}
          selectedTaskId={selectedTaskId}
          onSelectTask={(task) => setSelectedTaskId(task.id)}
          onCreateTask={() => setShowCreateTask(true)}
        />
      )}

      {activeTab !== 'projects' && (
        <DetailPanel
          task={selectedTask}
          projectName={selectedTask ? (projectNames[selectedTask.project_id] || '') : ''}
          logs={selectedTask ? (taskOutputs[selectedTask.id] || []) : []}
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
          onReject={() => selectedTask && setReviewingTask(selectedTask)}
          onViewLogs={() => selectedTask && setViewingLogs(selectedTask)}
        />
      )}

      {showCreateTask && (
        <CreateTaskModal
          projects={projectList}
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
          liveOutputs={taskOutputs[viewingLogs.id] || []}
          onClose={() => setViewingLogs(null)}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add client/src/App.tsx
git commit -m "feat: rewrite App.tsx with sidebar + list/detail split layout"
```

---

### Task 13: Electron 主进程 + 预加载脚本

**Files:**
- Create: `client/electron/main.ts`
- Create: `client/electron/preload.ts`
- Modify: `client/vite.config.ts`
- Modify: `client/index.html`
- Modify: `package.json`

- [ ] **Step 1: 安装 Electron**

```bash
npm install -D electron electron-builder concurrently
```

- [ ] **Step 2: 创建 client/electron/main.ts**

```typescript
import { app, BrowserWindow } from 'electron';
import path from 'node:path';

// Import server createApp — 需要编译为 JS 后使用
// 开发模式下用 tsx 运行，生产模式下从 dist 加载

let mainWindow: BrowserWindow | null = null;
let server: { close: () => Promise<void> } | null = null;

async function startServer() {
  // 开发模式：假设 server 由 tsx watch 单独启动
  // 生产模式：直接在 Electron 进程中启动
  if (app.isPackaged) {
    const { createApp } = await import(path.join(__dirname, '../../dist/index.js'));
    const result = await createApp({
      port: 14567,
      dataDir: path.join(app.getPath('userData'), 'data'),
    });
    server = result;
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    title: 'Claude Kanban',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(path.join(__dirname, '../public/index.html'));
  }
}

app.whenReady().then(async () => {
  await startServer();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', async () => {
  if (server) await server.close();
  if (process.platform !== 'darwin') app.quit();
});
```

- [ ] **Step 3: 创建 client/electron/preload.ts**

```typescript
// Preload script — minimal, context bridge if needed later
import { contextBridge } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  platform: process.platform,
});
```

- [ ] **Step 4: 更新 package.json scripts**

```jsonc
// 修改 package.json 的 scripts 部分：
"scripts": {
  "dev": "concurrently \"tsx watch src/cli.ts --dev --no-open\" \"cd client && vite --port 14568\"",
  "dev:electron": "concurrently \"tsx src/cli.ts --dev --no-open\" \"cd client && vite --port 14568\" \"electron client/electron/main.ts\"",
  "build": "tsc && cd client && vite build",
  "start": "node dist/cli.js",
  "start:electron": "electron client/electron/main.ts",
  "pack": "npm run build && electron-builder --dir",
  "dist": "npm run build && electron-builder"
},
"main": "client/electron/main.ts"
```

- [ ] **Step 5: 安装 electron-rebuild 处理 better-sqlite3**

```bash
npm install -D @electron/rebuild
```

- [ ] **Step 6: Commit**

```bash
git add client/electron/ package.json
git commit -m "feat: add Electron main process and preload script"
```

---

### Task 14: 清理旧文件 + 最终验证

**Files:**
- Delete: `client/src/components/KanbanBoard.tsx`
- Delete: `client/src/components/ProjectList.tsx`
- Delete: `client/src/components/NewProjectModal.tsx`
- Delete: `client/src/components/NewTaskModal.tsx`
- Delete: `client/dist/`

- [ ] **Step 1: 删除旧组件**

```bash
rm client/src/components/KanbanBoard.tsx
rm client/src/components/ProjectList.tsx
rm client/src/components/NewProjectModal.tsx
rm client/src/components/NewTaskModal.tsx
rm -rf client/dist/
```

- [ ] **Step 2: 运行编译检查**

```bash
cd client && npx tsc --noEmit
```

- [ ] **Step 3: 运行构建**

```bash
npm run build
```

预期输出：构建成功，`dist/public/` 生成前端产物，`dist/` 生成服务端 JS。

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "chore: remove old kanban/project-list components and build artifacts"
```

---

### Task 15: Electron Builder 打包配置

**Files:**
- Modify: `package.json`（添加 build 配置）

- [ ] **Step 1: 添加 electron-builder 配置到 package.json**

```json
"build": {
  "appId": "com.claude-kanban.app",
  "productName": "Claude Kanban",
  "directories": {
    "output": "release"
  },
  "files": [
    "dist/**/*",
    "client/electron/**/*.js",
    "client/public/**/*",
    "node_modules/**/*",
    "package.json"
  ],
  "win": {
    "target": "nsis"
  },
  "mac": {
    "target": "dmg"
  },
  "linux": {
    "target": "AppImage"
  },
  "asarUnpack": [
    "node_modules/better-sqlite3/**"
  ]
}
```

- [ ] **Step 2: Commit**

```bash
git add package.json
git commit -m "chore: add electron-builder packaging config"
```

---

## 验证计划

1. **样式验证：** 启动 dev 后，确认暖色背景 `#fef9f0`、卡片边框 `#e8d5c4`、棕色按钮 `#8B5A2B` 全部生效
2. **导航验证：** 点击左侧 6 个导航项，列表区内容正确切换
3. **跨项目分组：** 创建 2+ 个项目，各项目下有同状态任务，确认列表区按项目分组展示
4. **详情面板：** 点击任务卡片，右侧显示详情。未选中时显示空状态
5. **任务操作：** 创建任务 → 开始 → 停止 → 继续 → 完成全流程
6. **决策和验收：** 触发决策流程，确认 Modal 正常弹出和交互
7. **WebSocket：** 启动任务后确认实时日志推送到详情面板
8. **构建：** `npm run build` 无报错，启动 `node dist/cli.js` 确认服务器运行
9. **Electron 启动：** `npm run start:electron` 确认 Electron 窗口正常加载
