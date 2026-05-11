import express from 'express';
import cors from 'cors';
import http from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import { initDatabase } from './db';
import { projectsRouter } from './routes/projects';
import { tasksRouter } from './routes/tasks';
import { hooksRouter } from './routes/hooks';
import { mcpRouter } from './routes/mcp';
import { filesystemRouter } from './routes/filesystem';
import { networkRouter } from './routes/network';
import { setBroadcast } from './broadcast';
import { WsMessage } from './types';

export interface AppConfig {
  port: number;
  dataDir: string;
  staticDir: string;
}

export function createApp(config: AppConfig) {
  const { port, dataDir, staticDir } = config;

  process.env.CLAUDE_KANBAN_DATA_DIR = dataDir;

  const app = express();
  app.use(cors());
  app.use(express.json());

  app.use('/api/projects', projectsRouter);
  app.use('/api/tasks', tasksRouter);
  app.use('/api/hooks', hooksRouter);
  app.use('/mcp', mcpRouter);
  app.use('/api/filesystem', filesystemRouter);
  app.use('/api/network-info', networkRouter);

  app.use(express.static(staticDir));
  app.get('*', (_req, res) => {
    res.sendFile(require('path').join(staticDir, 'index.html'));
  });

  const server = http.createServer(app);

  return new Promise<{ server: http.Server; url: string }>((resolve, reject) => {
    server.on('error', (err: NodeJS.ErrnoException) => {
      if (err.code === 'EADDRINUSE') {
        const err2 = new Error(`Port ${port} is already in use.`) as NodeJS.ErrnoException;
        err2.code = 'EADDRINUSE';
        reject(err2);
      } else {
        reject(err);
      }
    });
    server.listen(port, () => {
      const wss = new WebSocketServer({ server });
      const clients = new Set<WebSocket>();

      wss.on('connection', (ws) => {
        clients.add(ws);
        ws.on('close', () => clients.delete(ws));
      });

      const broadcast = (msg: WsMessage): void => {
        const data = JSON.stringify(msg);
        for (const ws of clients) {
          if (ws.readyState === WebSocket.OPEN) ws.send(data);
        }
      };

      setBroadcast(broadcast);
      initDatabase();

      resolve({ server, url: `http://localhost:${port}` });
    });
  });
}
