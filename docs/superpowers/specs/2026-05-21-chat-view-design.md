# Chat View 设计文档

**日期**: 2026-05-21
**状态**: 已确认

## 1. 设计背景

当前看板以任务卡片 + 状态列的方式管理项目。用户希望增加一个群聊风格的视图，通过自然对话的方式与 AI（Claude）交互，降低使用门槛。

## 2. 核心设计

### 2.1 定位

在看板旁边新增"聊天"导航标签，与现有看板共享底层数据和 API，仅作为新的交互视图。看板和聊天可随时切换，数据实时同步。

### 2.2 布局

群聊风格：左侧项目成员列表 + 右侧统一聊天流。

- **左侧**：项目列表，每个项目显示在线状态和活跃任务数。底部提示 `@项目名 创建新任务`。
- **右侧**：聊天消息流（按时间排列所有项目消息）+ 底部输入框。
- **导航**：底部导航新增"聊天"标签，与"进行中""待处理""已完成"并列。

### 2.3 核心交互

#### 创建任务

用户在输入框输入 `@项目名 任务描述`，发送后：
1. 生成用户消息气泡（蓝色，靠右，含 `@项目名` 标签）
2. 调用 `POST /api/tasks?projectId=` 创建任务
3. 调用 `POST /api/tasks/:id/start` 启动任务
4. 立即出现 AI 回复气泡（白色，靠左），开始流式展示执行过程

#### 流式执行过程

任务进入 `running` 状态后，AI 气泡通过 `task_output` WebSocket 消息实时追加内容。同一气泡持续更新，展示 claude 子进程的 stdout/stderr 输出。

#### 决策交互

当 `decision_created` 消息到达：
- 当前 AI 气泡停止流式，**定格**为决策样式
- 展示问题文本和选项按钮（从 Decision.options 生成）
- 额外提供"自定义回答"按钮
- 用户可点击按钮一键决策，或右键/长按消息选择"引用回复"输入自定义答复
- 用户的决策生成新的用户消息气泡（含引用内容）
- AI 的下一次执行生成为**新的 AI 气泡**

#### 完成审批

当任务进入 `reviewing` 状态（`task_updated`）：
- 当前 AI 气泡**定格**为完成样式（绿色边框）
- 展示摘要和"批准完成""驳回修改"按钮
- 批准 → `POST /api/tasks/:id/approve`，显示系统消息 `✅ 已批准`
- 驳回 → `POST /api/tasks/:id/reject`（可选附带反馈），AI 下一轮执行生成新气泡

### 2.4 气泡规则总结

| 触发条件 | 行为 |
|---|---|
| 用户 @项目 发送 | 创建用户消息气泡 |
| 任务首次 running | 创建 AI 气泡 #1，开始流式 |
| task_output WS 消息 | 追加到最新 AI 气泡 |
| 任务 deciding | 最新 AI 气泡定格为决策样式 |
| 用户做出决策 | 创建用户回复气泡 |
| 任务 running（恢复后） | 创建新的 AI 气泡 #N |
| 任务 reviewing | 最新 AI 气泡定格为完成样式 |
| 用户审批/驳回 | 系统消息 / 新 AI 气泡 |

## 3. 技术方案

### 3.1 后端变更

**零数据库改动**。对现有 API 的映射：

| 聊天操作 | API |
|---|---|
| @项目 发送 | `POST /tasks` + `POST /tasks/:id/start` |
| 点击决策按钮 | `POST /tasks/:id/decide` |
| 引用回复决策 | `POST /tasks/:id/decide` |
| 批准完成 | `POST /tasks/:id/approve` |
| 驳回修改 | `POST /tasks/:id/reject` |

现有 WebSocket 消息（`task_output`、`decision_created`、`task_updated`）完全满足聊天视图的数据推送需求，无需新增消息类型。

### 3.2 前端新增组件

```
client/src/
├── components/
│   ├── ChatPanel.tsx          # 聊天主容器（替代 ListPanel 在聊天标签下渲染）
│   ├── ChatSidebar.tsx        # 左侧项目成员列表
│   ├── ChatMessageList.tsx    # 消息列表（虚拟滚动）
│   ├── ChatBubble.tsx         # 通用聊天气泡
│   │   ├── UserBubble         # 用户消息（蓝色，靠右）
│   │   ├── AIBubble           # AI 消息（白色，靠左）
│   │   │   ├── StreamingBubble  # 执行中：流式日志
│   │   │   ├── DecisionBubble   # 需决策：问题 + 选项按钮
│   │   │   └── ReviewBubble     # 已完成：摘要 + 审批按钮
│   │   └── SystemBubble       # 系统消息（居中，灰色小字）
│   ├── ChatInput.tsx          # 输入框（@提及自动补全、引用预览条）
│   └── QuoteOverlay.tsx       # 引用消息浮层（长按/右键触发）
```

### 3.3 客户端消息状态管理

聊天消息在 App.tsx 中作为新的 state 管理，结构：

```typescript
interface ChatMessage {
  id: string;
  taskId: string;
  type: 'user_message' | 'ai_execution' | 'ai_decision' | 'ai_review' | 'system';
  content: string;           // 文本内容 / 流式累积日志
  quoteMessageId?: string;   // 引用回复
  decision?: Decision;       // AI 决策气泡附带
  timestamp: string;
  round: number;             // 该任务的第几轮执行（0=首次）
}
```

消息来源：
- **user_message**: @发送时本地创建，决策/审批时本地创建
- **ai_execution**: `task_created` + `task_updated(status=running)` 时创建，`task_output` 时追加 content
- **ai_decision**: `decision_created` 时，将最新 ai_execution 转为 ai_decision
- **ai_review**: `task_updated(status=reviewing)` 时，将最新 ai_execution 转为 ai_review
- **system**: `task_updated(status=done)` 等事件时创建

## 4. 验收标准

- [ ] 底部导航出现"聊天"标签，点击进入聊天视图
- [ ] 输入 `@项目名 描述` 发送后，创建任务并启动，立即显示用户气泡和 AI 流式气泡
- [ ] AI 执行过程中，气泡实时展示工作日志
- [ ] AI 提问时，气泡定格并显示决策按钮，可点击按钮或引用回复
- [ ] AI 完成时，气泡定格为完成样式，可批准或驳回
- [ ] 驳回后 AI 继续执行，生成新气泡，旧气泡保留
- [ ] 多次决策-恢复的对话链条完整保留在聊天记录中
- [ ] 切换到看板视图时，任务状态与聊天视图同步一致
- [ ] 多个项目的消息混合在同一聊天流中，通过 `[项目名]` 区分
- [ ] 左侧项目列表显示活跃任务数
