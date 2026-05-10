# Claude Kanban

基于 Claude Code 的多任务看板管理系统。通过编排多个 Claude CLI 会话，实现任务的自动执行、人工决策介入和结果验收。

## 快速安装

```bash
git clone <repo> && cd claude-kanban
npm install && npm run build && npm install -g .
ck
```

## 架构

```
claude-kanban/
├── src/                  # 服务端源码
│   ├── cli.ts            # CLI 入口（bin: ck）
│   ├── index.ts          # Express 应用 + WebSocket
│   ├── db.ts             # SQLite (WAL 模式)
│   ├── types.ts          # 共享类型定义
│   ├── broadcast.ts      # WebSocket 广播
│   ├── routes/           # API 路由
│   └── services/         # Claude CLI 进程编排
├── client/               # React 前端
│   ├── src/
│   └── vite.config.ts
├── dist/                 # 构建输出（含 client 静态文件）
│   ├── cli.js
│   └── public/
└── package.json
```

### 技术栈

| 层 | 技术 |
|---|---|
| 后端 | Express, WebSocket (ws), better-sqlite3 (WAL 模式) |
| 前端 | React 18, Vite 5 |
| CLI | Node.js，命令名 `ck` |

## 使用

```bash
ck                    # 默认端口 14567，自动打开浏览器
ck --port 8080        # 自定义端口
ck --data-dir ~/data  # 自定义数据目录
ck --no-open          # 不自动打开浏览器
ck --help             # 显示帮助
```

数据默认存储在 `~/.claude-kanban/`；开发模式（`--dev`）存储在项目的 `dev-data/` 目录。

## 开发

```bash
npm run dev           # 启动 server (tsx watch, :14567) + client (Vite, :14568)
npm run build         # tsc + vite build → dist/
npm run start         # node dist/cli.js
```

开发模式下：
- Server: `http://localhost:14567`
- Client: `http://localhost:14568`（Vite 自动代理 `/api` 和 `/ws` 到 server）
- WebSocket: `ws://localhost:14567/ws`

## 任务生命周期

```
pending → running → deciding → running → reviewing → done
```

| 状态 | 说明 |
|---|---|
| `pending` | 等待执行 |
| `running` | Claude 正在工作 |
| `deciding` | Claude 提出疑问，等待用户决策 |
| `reviewing` | Claude 调用 mark_complete，等待用户验收 |
| `done` | 用户验收通过，任务完成 |

## 核心机制

该仓库定义了一个 Claude Code 管理系统，核心机制如下：

### 会话编排

`src/services/session-manager.ts` 负责管理 Claude CLI 子进程，最多 3 个并发会话，超出自动排队。

### 钩子系统

每个会话动态生成三份配置文件：

| 文件 | 作用 |
|---|---|
| `<taskId>.json` | Claude Code 钩子配置 |
| `<taskId>-protocol.md` | 行为协议约束 |
| `<taskId>-mcp.json` | MCP 服务连接配置 |

钩子拦截三类事件：
- **AskUserQuestion** — 阻止并记录为 Decision，由用户通过 UI 回答
- **mark_complete** — 允许调用，任务进入 reviewing 状态
- **PermissionRequest** — 自动批准

### MCP 服务

通过 SSE 协议暴露 `mark_complete(summary)` 工具，Claude 会话完成任务后调用此工具提交结果。

### 实时通信

WebSocket 广播消息类型：`task_updated`、`task_created`、`task_deleted`、`decision_created`、`decision_resolved`。

### 强制修正

如果 Claude 进程在未发送信号的情况下退出，系统会自动恢复会话并提示其明确意图（AskUserQuestion 或 mark_complete）。

## API 概览

| 路径 | 说明 |
|---|---|
| `GET/POST /api/projects` | 项目管理 |
| `GET/POST /api/tasks` | 任务管理 |
| `GET/PATCH /api/tasks/:id` | 单个任务操作 |
| `POST /api/hooks` | Claude Code 钩子回调 |
| `GET /mcp/sse` | MCP SSE 端点 |

## 数据库

SQLite（WAL 模式），三张核心表：

- **projects** — 项目，绑定工作目录
- **tasks** — 任务，含状态、优先级、预算、会话 ID
- **decisions** — 决策记录，关联任务、问题、选项、答案
