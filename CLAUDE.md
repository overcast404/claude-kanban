# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 开发命令

```bash
npm run dev           # server (tsx watch, :14567) + client (Vite, :14568)
npm run build         # tsc src/ → dist/ + vite build client/ → dist/public/
npm run start         # node dist/cli.js
```

开发时 client 在 `:14568`，Vite 自动代理 `/api` 和 `/ws` 到 server `:14567`。

## 架构概览

纯 CLI 工具：`ck` 命令启动 Express 服务器，自动打开浏览器访问看板。

```
src/                    # 服务端 (Express + WebSocket + SQLite)
  cli.ts                # CLI 入口 (bin: ck)，解析参数启动 createApp()
  index.ts              # createApp() → Express app
  db.ts                 # SQLite (better-sqlite3, WAL 模式)
  types.ts              # 共享类型 (Project, Task, Decision, WsMessage)
  broadcast.ts          # WebSocket 广播
  routes/               # API 路由 (projects, tasks, hooks, mcp, filesystem)
  services/
    session-manager.ts  # spawn claude CLI 子进程，max 3 并发，排队 + 自动恢复

client/                 # React 18 + Vite 5 + Tailwind 4
  src/                  # 前端源码
  vite.config.ts        # base: './', 代理 /api 和 /ws 到后端
```

### 任务生命周期

```
pending → running → deciding（Claude 提问）→ running（用户决策后恢复）
                 → reviewing（Claude 调用 mark_complete）→ done（用户验收通过）
```

### 会话编排 (session-manager.ts)

- spawn claude CLI 子进程，max 3 并发
- 每个会话动态生成三份配置到 dataDir: `hooks/<taskId>.json`（钩子配置）、`-protocol.md`（协议约束）、`-mcp.json`（MCP 连接）
- 协议约束：Claude 停止时必须通过 AskUserQuestion（需决策）或 mark_complete（已完成）发信号
- 进程无信号退出时自动恢复并提示意图
- 钩子拦截：AskUserQuestion → 阻止并记入 Decision；mark_complete → 允许，任务进入 reviewing；PermissionRequest → 自动批准

### WebSocket 广播

消息类型: `task_updated`, `task_created`, `task_deleted`, `decision_created`, `decision_resolved`, `task_output`

### CLI 参数

`--port`, `--data-dir`, `--no-open`, `--dev`, `--help`, `--version`
