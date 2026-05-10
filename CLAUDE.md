# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 开发命令

```bash
# Web 模式
npm run dev           # server (tsx watch, :14567) + client (Vite, :14568)
npm run build         # tsc src/ → dist/ + vite build client/ → dist/public/
npm run start         # node dist/cli.js

# Electron 桌面应用模式
npm run dev:electron  # server + client + Electron 三进程并行
npm run build:electron # esbuild 编译 client/electron/ → dist/electron/
npm run build:all     # build + build:electron
npm run start:electron # 生产模式启动 Electron 窗口
npm run pack          # build:all + electron-builder --dir
npm run dist          # build:all + electron-builder (安装包)
```

开发时 client 在 `:14568`，Vite 自动代理 `/api` 和 `/ws` 到 server `:14567`。

## 架构概览

双模式应用：CLI Web 模式 + Electron 桌面模式，共享同一套后端和前端。

```
src/                    # 服务端 (Express + WebSocket + SQLite)
  cli.ts                # CLI 入口 (bin: ck)，解析参数启动 createApp()
  index.ts              # createApp() → Express app，被 CLI 和 Electron 共用
  db.ts                 # SQLite (better-sqlite3, WAL 模式)
  types.ts              # 共享类型 (Project, Task, Decision, WsMessage)
  broadcast.ts          # WebSocket 广播
  routes/               # API 路由 (projects, tasks, hooks, mcp, filesystem)
  services/
    session-manager.ts  # spawn claude CLI 子进程，max 3 并发，排队 + 自动恢复

client/                 # React 18 + Vite 5 + Tailwind 4
  src/                  # 前端源码
  electron/             # Electron 主进程 + preload (独立 tsconfig)
    main.ts             # BrowserWindow + 嵌入 Express server
    preload.ts          # contextBridge 暴露 electronAPI.platform
  vite.config.ts        # base: './', 代理 /api 和 /ws 到后端

scripts/
  build-electron.mjs    # esbuild 两步编译: main.ts + preload.ts → dist/electron/
```

### Electron 模式 vs Web 模式

- **Web 模式**: CLI 启动 Express，自动打开浏览器
- **Electron 模式**: `main.ts` 直接调用 `createApp()` 在 Electron 内启动服务器，BrowserWindow 加载前端。开发时从 `VITE_DEV_SERVER_URL` 加载，生产时加载 `dist/public/index.html`
- 数据目录：`app.getPath('userData') + '/data'`
- `better-sqlite3` 是原生模块，electron-builder 配置了 `asarUnpack` 解包

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
