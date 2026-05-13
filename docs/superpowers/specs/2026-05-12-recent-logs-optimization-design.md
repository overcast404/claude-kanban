# 最近日志优化设计

**日期**: 2026-05-12
**目标**: 解析 Claude `stream-json` 结构化输出，在"进行中"任务卡片上展示当前操作描述。

## 数据流

```
Claude CLI --stream-json (stdout)
  → session-manager.ts 100ms 批量 flush
    → WebSocket broadcast task_output { taskId, text, stream, seq }
      → App.tsx 收到后调用 parseActivity() 解析 JSON 行
        → 维护 taskActivities: Record<string, string[]>
          → TaskCard 在卡片内渲染滚动日志区
```

## 解析规则

利用 `stream-json` 的结构化字段，从 `content_block_start` + `input_json_delta` 中提取信息：

| 事件序列 | 提取字段 | 生成描述 |
|---------|---------|---------|
| `content_block_start` tool_use + `input_json_delta` 含 `description` | `name` + `description` | `Bash: Recent git history` |
| 同上，无 description 但有 `filePath` | `name` + `filePath` | `Read: src/index.ts` |
| 同上，无 description 也无 filePath | `name` | `Write: 写入文件` |
| `content_block_start` tool_use，参数尚未到达 | `name` | `Bash: ...` |
| `content_block_start` thinking | — | `思考中...` |
| `content_block_delta` text_delta | — | `输出回复中...` |
| `result` | `subtype` | `已完成` |

## 文件变更

### 1. 新建 `client/src/activity.ts`

- `parseJsonStream(text: string): string[]` — 从原始 text 中提取所有活动描述
- 内部维护状态机：追踪当前 tool_use 的 name 和 accumulated partial_json
- 当 `content_block_stop` 时，解析完整 JSON 参数，提取 description/filePath

### 2. 修改 `App.tsx`

- 新增状态：`taskActivities: Record<string, string[]>`
- WebSocket `task_output` 处理中：调 `parseJsonStream()` 解析，追加到对应 taskId 的数组
- 将 `taskActivities` 传入 `DetailPanel` → 保持 LogPreview 使用原始 logs
- 将 `taskActivities` 传入 `ListPanel` → `ProjectGroup` → `TaskCard`

### 3. 修改 `TaskCard.tsx`

- 新增 prop：`activities?: string[]`
- running 状态的卡片底部新增一个滚动区域（max-h-[56px]，约 3 行高度）
- 显示最新的 3-5 条活动描述
- 每行文字静态截断（truncate），超长加省略号
- 使用 `text-[10px] text-warm-brown font-mono`，搭配 `bg-warm-log-bg` 背景
- 区域可垂直滚动查看历史

### 4. 修改 `ProjectGroup.tsx`

- 新增 prop：`taskActivities: Record<string, string[]>`
- 透传给 `TaskCard`

### 5. 修改 `ListPanel.tsx`

- 新增 prop：`taskActivities: Record<string, string[]>`
- 透传给 `ProjectGroup`

### 6. 可选：`LogPreview.tsx`

- 同样改为使用 `taskActivities` 而非原始 `logs`，展示更整洁
