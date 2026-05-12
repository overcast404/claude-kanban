# 移动端适配设计

## 概述

为 Claude Kanban 前端添加移动端响应式适配。移动端（≤768px）底部导航替代侧边栏，任务详情从侧面板改为全屏页面。同时简化桌面端和移动端的导航 tab。

## 断点

- 移动端: `max-width: 768px`
- 桌面端: `≥769px` 保持现有布局
- 检测方式: CSS `@media` + JS `useMediaQuery` hook（用于控制 DetailPanel 渲染模式）

## 导航简化

桌面和移动统一简化为 3 个 tab：

| Tab | 包含状态 | 图标 | 标签 |
|------|---------|------|------|
| 进行中 | pending + running | `zap` | 进行中 |
| 待处理 | deciding + reviewing | `bell` | 待处理 |
| 已完成 | done | `archive` | 已完成 |

`status.ts` 中新增 `IN_PROGRESS_STATUSES = ['pending', 'running']` 常量。ListPanel 根据 activeTab 筛选对应状态的任务。Sidebar 和底部导航复用同一套 tab 定义。

项目 tab 保留在 TopBar 右侧，不进入底部导航。

## 移动端布局

### 结构

```
移动端:
┌─────────────────┐     ┌─────────────────┐
│ TopBar (h-10)    │     │ TopBar + 返回按钮 │
├─────────────────┤     ├─────────────────┤
│                 │     │                 │
│   ListPanel /   │     │   DetailPanel   │
│   ProjectView   │     │   (全屏页面)     │
│                 │     │                 │
├─────────────────┤     ├─────────────────┤
│ 底部导航 (h-14)  │     │ 底部导航 (h-14)  │
└─────────────────┘     └─────────────────┘
```

### 关键变更

1. **底部导航 (BottomNav)**: 固定在视口底部，`h-14`（56px），`flex-row` 排列 3 个 NavItem，带安全区 padding
2. **DetailPanel**: 移动端点击任务时，DetailPanel 作为全屏覆盖层渲染（`fixed inset-0 z-30`），取代桌面端的侧面板分屏模式。左上角显示返回箭头关闭详情
3. **拖拽分隔条**: 移动端隐藏（已有 `detailVisible` 状态控制）
4. **ListPanel**: 移动端 `px-3` 替代桌面 `px-4`，节省水平空间

### 组件变更清单

| 文件 | 变更 |
|------|------|
| `status.ts` | 新增 `IN_PROGRESS_STATUSES`, `IN_PROGRESS_LABEL`, `IN_PROGRESS_ICON`；`ACTION_STATUSES` 保持不变；新增 `MOBILE_TABS` 导出 |
| `App.tsx` | 新增 `useMediaQuery` hook；`activeTab` 类型从 4 个值变为 3 个（移除 `'pending'` 和 `'running'`，新增 `'in-progress'`）；移动端时 DetailPanel 全屏渲染；传递 `isMobile` 给子组件 |
| `Sidebar.tsx` | 适配简化为 3 个 tab；桌面端保持垂直布局不变 |
| `BottomNav.tsx` | **新文件**，固定在底部的水平导航，3 个 tab，仅在移动端显示 |
| `DetailPanel.tsx` | 新增 `isMobile` prop；移动端全屏覆盖 + 返回按钮 + `onBack` 回调 |
| `ListPanel.tsx` | `activeTab` 变更适配，合并 pending/running 筛选 |
| `TopBar.tsx` | 移动端隐藏项目按钮文字（仅图标），或保持简洁 |
| `index.css` | 添加移动端安全区、底部导航间距等全局样式 |
| `QrCodeModal.tsx` | 暂不修改（扫码自动选择延后） |

## 暂不纳入

- 扫码自动选择 IP（后续单独处理）
- 移动端手势/滑动操作
- PWA / 离线支持
