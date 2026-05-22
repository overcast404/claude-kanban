# Kanban Board Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the three status-tab list views (in-progress/action/done) with a single three-column kanban board, simplify sidebar from 4 tabs to 2 (chat + board).

**Architecture:** Two new components — `KanbanBoard` (three-column container with project filter) and `KanbanColumn` (single column with project-grouped task cards). Existing `TaskCard` reused as-is. `ListPanel` and `ProjectGroup` removed. Sidebar/BottomNav simplified to 2 tabs. App.tsx routing updated.

**Tech Stack:** React 18, TypeScript, Tailwind CSS 4

---

### Task 1: Update status.ts — Redefine TABS

**Files:**
- Modify: `client/src/status.ts`

- [ ] **Step 1: Replace TABS definition**

Replace the current 4-tab TABS array with a 2-tab version (chat + board). Keep the status constants and board column definitions.

```typescript
import type { TaskStatus } from '../../src/types';
import type { IconName } from './components/Icon';

export const STATUS_LABEL: Record<TaskStatus, string> = {
  pending: '待启动',
  running: '进行中',
  deciding: '待决策',
  reviewing: '待验收',
  done: '已完成',
};

export const STATUS_ICON: Record<TaskStatus, IconName> = {
  pending: 'inbox',
  running: 'zap',
  deciding: 'help-circle',
  reviewing: 'check-circle',
  done: 'archive',
};

export const STATUS_ORDER: TaskStatus[] = [
  'pending', 'running', 'deciding', 'reviewing', 'done',
];

// Board column definitions
export const BOARD_COLUMNS = [
  {
    key: 'active' as const,
    icon: 'zap' as IconName,
    label: '进行中',
    statuses: ['pending', 'running'] as TaskStatus[],
    accentBorder: 'border-b-2 border-b-warm-brown',
    accentBg: 'bg-warm-brown',
  },
  {
    key: 'attention' as const,
    icon: 'bell' as IconName,
    label: '待处理',
    statuses: ['deciding', 'reviewing'] as TaskStatus[],
    accentBorder: 'border-b-2 border-b-warm-danger',
    accentBg: 'bg-warm-danger',
  },
  {
    key: 'done' as const,
    icon: 'archive' as IconName,
    label: '已完成',
    statuses: ['done'] as TaskStatus[],
    accentBorder: 'border-b-2 border-b-warm-border',
    accentBg: 'bg-warm-text-secondary',
  },
];

export const TABS = [
  { key: 'chat', icon: 'message-circle' as IconName, label: '聊天' },
  { key: 'board', icon: 'clipboard' as IconName, label: '看板' },
] as const;

export type TabKey = (typeof TABS)[number]['key'];
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd client && npx tsc --noEmit
```

Expected: No errors related to status.ts. There may be errors in files we haven't updated yet (Sidebar, BottomNav, App), which we'll fix in subsequent tasks.

- [ ] **Step 3: Commit**

```bash
git add client/src/status.ts
git commit -m "refactor: redefine TABS to chat + board, add BOARD_COLUMNS"
```

---

### Task 2: Create KanbanColumn component

**Files:**
- Create: `client/src/components/KanbanColumn.tsx`

- [ ] **Step 1: Write the component**

```typescript
import type { Task } from '../../../src/types';
import type { IconName } from './Icon';
import { Icon } from './Icon';
import { TaskCard } from './TaskCard';

interface Props {
  icon: IconName;
  label: string;
  count: number;
  accentBorder: string;
  accentBg: string;
  tasks: Task[];
  projectNames: Record<string, string>;
  selectedTaskId: string | null;
  taskActivities: Record<string, string>;
  onSelectTask: (task: Task) => void;
}

export function KanbanColumn({
  icon, label, count, accentBorder, accentBg,
  tasks, projectNames, selectedTaskId, taskActivities, onSelectTask,
}: Props) {
  // Group tasks by project
  const grouped: Record<string, Task[]> = {};
  for (const t of tasks) {
    if (!grouped[t.project_id]) grouped[t.project_id] = [];
    grouped[t.project_id].push(t);
  }

  return (
    <div className="flex-1 flex flex-col min-w-0 border-r border-warm-border last:border-r-0">
      {/* Column header */}
      <div className={`px-3 py-2.5 text-center shrink-0 bg-warm-card ${accentBorder}`}>
        <div className="flex items-center justify-center gap-1.5 mb-0.5">
          <Icon name={icon} size={14} />
          <span className="text-xs font-bold text-warm-text">{label}</span>
        </div>
        <span className={`inline-block text-[10px] text-white px-1.5 py-0.5 rounded-full font-bold ${accentBg}`}>
          {count}
        </span>
      </div>

      {/* Column body */}
      <div className="flex-1 overflow-y-auto px-2 py-2">
        {Object.keys(grouped).length === 0 ? (
          <div className="text-[11px] text-warm-text-secondary text-center py-8">
            暂无任务
          </div>
        ) : (
          Object.entries(grouped).map(([projectId, projectTasks]) => (
            <div key={projectId} className="mb-3">
              <h3 className="text-[10px] font-bold text-warm-brown uppercase tracking-wide mb-1.5 px-1">
                <Icon name="folder" size={11} /> {projectNames[projectId] || projectId}
              </h3>
              <div className="flex flex-col gap-1">
                {projectTasks.map(task => (
                  <TaskCard
                    key={task.id}
                    task={task}
                    projectName={projectNames[task.project_id] || task.project_id}
                    selected={selectedTaskId === task.id}
                    activity={taskActivities[task.id] || ''}
                    onClick={() => onSelectTask(task)}
                  />
                ))}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd client && npx tsc --noEmit
```

Expected: No errors in KanbanColumn.tsx.

- [ ] **Step 3: Commit**

```bash
git add client/src/components/KanbanColumn.tsx
git commit -m "feat: add KanbanColumn component"
```

---

### Task 3: Create KanbanBoard component

**Files:**
- Create: `client/src/components/KanbanBoard.tsx`

- [ ] **Step 1: Write the component**

```typescript
import type { Task } from '../../../src/types';
import { BOARD_COLUMNS } from '../status';
import { KanbanColumn } from './KanbanColumn';
import { Icon } from './Icon';

interface Props {
  tasksByProject: Record<string, Task[]>;
  projectNames: Record<string, string>;
  selectedTaskId: string | null;
  taskActivities: Record<string, string>;
  onSelectTask: (task: Task) => void;
  onCreateTask: () => void;
}

export function KanbanBoard({
  tasksByProject, projectNames, selectedTaskId,
  taskActivities, onSelectTask, onCreateTask,
}: Props) {
  // Flatten all tasks
  const allTasks = Object.values(tasksByProject).flat();

  return (
    <div className="flex-1 flex flex-col overflow-hidden min-w-0">
      {/* Top bar */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-warm-border shrink-0">
        <h2 className="text-sm font-bold text-warm-text inline-flex items-center gap-1">
          <Icon name="clipboard" size={16} /> 看板
        </h2>
        <button
          onClick={onCreateTask}
          className="text-[11px] bg-warm-brown text-white px-3 py-1.5 rounded-lg font-bold hover:bg-warm-brown-hover transition-colors inline-flex items-center gap-1"
        >
          <Icon name="plus" size={13} /> 任务
        </button>
      </div>

      {/* Three columns */}
      <div className="flex-1 flex overflow-hidden">
        {BOARD_COLUMNS.map(col => {
          const columnTasks = allTasks.filter(t =>
            (col.statuses as readonly string[]).includes(t.status)
          );
          return (
            <KanbanColumn
              key={col.key}
              icon={col.icon}
              label={col.label}
              count={columnTasks.length}
              accentBorder={col.accentBorder}
              accentBg={col.accentBg}
              tasks={columnTasks}
              projectNames={projectNames}
              selectedTaskId={selectedTaskId}
              taskActivities={taskActivities}
              onSelectTask={onSelectTask}
            />
          );
        })}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd client && npx tsc --noEmit
```

Expected: No errors in KanbanBoard.tsx.

- [ ] **Step 3: Commit**

```bash
git add client/src/components/KanbanBoard.tsx
git commit -m "feat: add KanbanBoard component"
```

---

### Task 4: Update Sidebar and BottomNav

**Files:**
- Modify: `client/src/components/Sidebar.tsx`
- Modify: `client/src/components/BottomNav.tsx`

- [ ] **Step 1: Update Sidebar.tsx**

Simplify to 2 tabs. The `counts` and `dangerBadge` props are no longer needed since we don't show per-status counts.

```typescript
import { TABS, type TabKey } from '../status';
import { NavItem } from './NavItem';

interface Props {
  activeTab: TabKey;
  onSelectTab: (tab: TabKey) => void;
}

export function Sidebar({ activeTab, onSelectTab }: Props) {
  return (
    <aside className="w-14 shrink-0 flex flex-col items-center gap-1 py-3 border-r border-warm-border bg-warm-card max-md:hidden">
      {TABS.map(item => (
        <NavItem
          key={item.key}
          icon={item.icon}
          label={item.label}
          count={0}
          dangerBadge={false}
          active={activeTab === item.key}
          onClick={() => onSelectTab(item.key)}
        />
      ))}
    </aside>
  );
}
```

- [ ] **Step 2: Update BottomNav.tsx**

Same simplification, matching Sidebar:

```typescript
import { TABS, type TabKey } from '../status';
import { NavItem } from './NavItem';

interface Props {
  activeTab: TabKey;
  onSelectTab: (tab: TabKey) => void;
}

export function BottomNav({ activeTab, onSelectTab }: Props) {
  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 h-14 bg-warm-card border-t border-warm-border flex items-center justify-around px-2 z-20"
      style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}>
      {TABS.map(item => (
        <NavItem
          key={item.key}
          icon={item.icon}
          label={item.label}
          count={0}
          dangerBadge={false}
          active={activeTab === item.key}
          onClick={() => onSelectTab(item.key)}
        />
      ))}
    </nav>
  );
}
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
cd client && npx tsc --noEmit
```

Expected: Sidebar and BottomNav compile clean. App.tsx may still have errors (next task).

- [ ] **Step 4: Commit**

```bash
git add client/src/components/Sidebar.tsx client/src/components/BottomNav.tsx
git commit -m "refactor: simplify Sidebar and BottomNav to 2 tabs"
```

---

### Task 5: Update App.tsx — Integrate KanbanBoard

**Files:**
- Modify: `client/src/App.tsx`

This is the core integration. We need to:
1. Update the `Tab` type to include `'board'`
2. Replace the `in-progress`/`action`/`done` routing with `board` → `KanbanBoard`
3. Remove the `counts` logic (no longer needed per-status)
4. Update `detailVisible` condition
5. Remove `ListPanel` import, add `KanbanBoard` import

- [ ] **Step 1: Update imports and type**

Change the import block and Tab type:

```typescript
import { TABS, type TabKey } from './status';
// ... other imports stay the same ...
import { KanbanBoard } from './components/KanbanBoard';
// Remove: import { ListPanel } from './components/ListPanel';
```

Change `type Tab`:
```typescript
type Tab = 'projects' | TabKey;
// TabKey is now 'chat' | 'board', so Tab is 'projects' | 'chat' | 'board'
```

- [ ] **Step 2: Remove counts computation**

Remove the block that computes `counts` from allTasks:

```typescript
// REMOVE this block (around lines 706-712):
// const counts: Record<string, number> = {};
// allTasks.forEach(t => {
//   const tab = TABS.find(tab => (tab.statuses as readonly string[]).includes(t.status));
//   if (tab) {
//     counts[tab.key] = (counts[tab.key] || 0) + 1;
//   }
// });
```

- [ ] **Step 3: Update default activeTab**

Change default tab from `'action'` to `'board'`:

```typescript
const [activeTab, setActiveTab] = useState<Tab>(() => {
  try { return (localStorage.getItem('ck_tab') as Tab) || 'board'; } catch { return 'board'; }
});
```

- [ ] **Step 4: Update Sidebar render**

Remove `counts` prop:

```typescript
<Sidebar
  activeTab={activeTab as TabKey}
  onSelectTab={setActiveTab as (tab: TabKey) => void}
/>
```

- [ ] **Step 5: Replace the ListPanel routing with KanbanBoard**

Replace the current `in-progress`/`action`/`done` block with a `board` case:

```typescript
) : activeTab === 'board' ? (
  <div className="flex-1 min-w-0">
    <KanbanBoard
      tasksByProject={tasksByProject}
      projectNames={projectNames}
      selectedTaskId={selectedTaskId}
      taskActivities={taskActivities}
      onSelectTask={(task) => { setSelectedTaskId(task.id); setDetailVisible(true); }}
      onCreateTask={() => setShowCreateTask(true)}
    />
  </div>
) : (
```

Wait - looking at the current routing structure more carefully:

```typescript
{activeTab === 'projects' ? (
  <ProjectView ... />
) : activeTab === 'chat' ? (
  <ChatPanel ... />
) : (
  <div className="flex-1 min-w-0">
    <ListPanel ... />
  </div>
)}
```

This needs to become:

```typescript
{activeTab === 'projects' ? (
  <ProjectView ... />
) : activeTab === 'chat' ? (
  <>
    <ChatPanel ... />
    {threadTaskId && <ThreadPanel ... />}
  </>
) : (
  <div className="flex-1 min-w-0">
    <KanbanBoard
      tasksByProject={tasksByProject}
      projectNames={projectNames}
      selectedTaskId={selectedTaskId}
      taskActivities={taskActivities}
      onSelectTask={(task) => { setSelectedTaskId(task.id); setDetailVisible(true); }}
      onCreateTask={() => setShowCreateTask(true)}
    />
  </div>
)}
```

- [ ] **Step 6: Update detail panel visibility condition**

Change line 830 from:

```typescript
{activeTab !== 'projects' && activeTab !== 'chat' && detailVisible && (
```

To:

```typescript
{activeTab === 'board' && detailVisible && (
```

- [ ] **Step 7: Update BottomNav render**

Remove `counts` prop:

```typescript
<BottomNav
  activeTab={activeTab as TabKey}
  onSelectTab={setActiveTab as (tab: TabKey) => void}
/>
```

- [ ] **Step 8: Verify TypeScript compiles**

```bash
cd client && npx tsc --noEmit
```

Expected: No errors across all files.

- [ ] **Step 9: Commit**

```bash
git add client/src/App.tsx
git commit -m "feat: integrate KanbanBoard, replace 3 tab lists with single board view"
```

---

### Task 6: Remove unused components

**Files:**
- Delete: `client/src/components/ListPanel.tsx`
- Delete: `client/src/components/ProjectGroup.tsx`

- [ ] **Step 1: Delete the files**

```bash
rm client/src/components/ListPanel.tsx
rm client/src/components/ProjectGroup.tsx
```

- [ ] **Step 2: Verify TypeScript still compiles**

```bash
cd client && npx tsc --noEmit
```

Expected: Clean compilation — no remaining imports of the deleted files.

- [ ] **Step 3: Verify dev build works**

```bash
cd client && npx vite build --mode development 2>&1 | tail -5
```

Expected: Build succeeds.

- [ ] **Step 4: Commit**

```bash
git add client/src/components/ListPanel.tsx client/src/components/ProjectGroup.tsx
git commit -m "chore: remove unused ListPanel and ProjectGroup"
```

---

### Task 7: Manual verification

- [ ] **Step 1: Start dev server**

```bash
npm run dev
```

Expected: Server starts on :14567, client on :14568.

- [ ] **Step 2: Open browser and verify**

Navigate to `http://localhost:14568` and check:
1. Sidebar shows 2 tabs: 聊天 and 看板
2. Default tab is 看板
3. Three columns display: 进行中 | 待处理 | 已完成
4. Tasks are grouped by project within columns
5. Task cards show correct status styling (running=highlighted border, deciding=red dashed, reviewing=tan border, done=opacity)
6. Clicking a task opens detail panel on the right
7. Switching to 聊天 tab shows the chat interface (unchanged)
8. Clicking project title in TopBar shows project view (unchanged)
9. "新建任务" button in kanban header opens create task modal
10. Mobile: bottom nav shows 2 tabs, kanban columns scroll horizontally

- [ ] **Step 3: Fix any issues found**

If issues found during manual verification, fix and commit individually.
