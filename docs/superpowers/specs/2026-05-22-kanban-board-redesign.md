# 看板交互重构设计

## 目标

将任务展示从"按状态分标签页的垂直列表"改为"聊天为主体、三列看板一眼可见"的交互模式。

## 设计决策

| 决策 | 选择 |
|------|------|
| 布局方式 | 标签切换：聊天和看板各自独立视图 |
| 侧边栏标签 | 聊天、看板（2个，原4个） |
| 项目入口 | 保留 TopBar 入口不变 |
| 三列映射 | 进行中(pending+running) / 待处理(deciding+reviewing) / 已完成(done) |
| 列内排列 | 按项目分组，每组有项目名小标题 |
| 任务点击 | 右侧滑出详情面板（现有行为保持不变） |
| 聊天面板 | 完全保持不变 |

## 组件变更

### 修改

- **status.ts**: TABS 从 4 个（chat/in-progress/action/done）改为 2 个（chat/board）
- **App.tsx**: 移除 `in-progress`/`action`/`done` 三个标签路由，替换为 `board` 标签渲染 KanbanBoard
- **Sidebar.tsx**: 渲染 2 个而非 4 个 NavItem
- **BottomNav.tsx**: 同步 Sidebar 变更

### 新增

- **KanbanBoard.tsx**: 三列看板容器
  - Props: `tasksByProject`, `projectNames`, `selectedTaskId`, `taskActivities`, `onSelectTask`
  - 三列等宽 flex 布局，每列可独立垂直滚动
  - 顶部可选项目筛选下拉 + 新建任务按钮
- **KanbanColumn.tsx**: 单个看板列
  - Props: `title`, `icon`, `tasks`, `projectNames`, `selectedTaskId`, `taskActivities`, `onSelectTask`, `accentClass`
  - 列头：图标 + 标题 + 数量徽章 + 颜色强调
  - 列体：按 projectId 分组，每组渲染项目名小标题 + TaskCard 列表
  - 复用现有 TaskCard 组件

### 移除/不再使用

- **ListPanel.tsx**: 被 KanbanBoard 替代，可删除
- **ProjectGroup.tsx**: 分组逻辑合并到 KanbanColumn 内部

### 保持不变

- ProjectView.tsx, DetailPanel.tsx, ChatPanel.tsx, TaskCard.tsx, TopBar.tsx
- 所有模态框、WebSocket 逻辑、状态管理

## 看板列视觉规格

| 列 | 状态 | 列头颜色 | 卡片样式 |
|----|------|---------|---------|
| 进行中 | pending, running | `#8B5A2B` 棕色底线 | running: 实线高亮边框; pending: 默认边框 |
| 待处理 | deciding, reviewing | `#c0392b` 红色底线 | deciding: 红色虚线; reviewing: 棕色边框 |
| 已完成 | done | `#e8d5c4` 默认底线 | 默认边框 + opacity-60 |

## 数据流

不变。WebSocket 推送 → App state 更新 → KanbanBoard props 变化 → 列内卡片实时更新。

## 边界情况

- 某列为空时显示空状态占位文本
- 项目筛选为"全部"时不区分项目
- 移动端：看板列改为垂直堆叠或水平滑动
