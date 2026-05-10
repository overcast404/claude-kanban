import { app, BrowserWindow } from 'electron';
import path from 'node:path';

let mainWindow: BrowserWindow | null = null;
let server: { close: () => Promise<void> } | null = null;

async function startServer() {
  if (app.isPackaged) {
    // Production: server JS is at <app>/dist/index.js
    const serverPath = path.join(app.getAppPath(), 'dist', 'index.js');
    const { createApp } = await import(serverPath);
    const result = await createApp({
      port: 14567,
      dataDir: path.join(app.getPath('userData'), 'data'),
    });
    server = result;
  }
}

function createWindow() {
  const preloadPath = app.isPackaged
    ? path.join(__dirname, 'preload.js')
    : path.join(__dirname, 'preload.js');

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    title: 'Claude Kanban',
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  const devUrl = process.env.VITE_DEV_SERVER_URL;
  if (devUrl) {
    mainWindow.loadURL(devUrl);
  } else {
    const indexPath = app.isPackaged
      ? path.join(app.getAppPath(), 'dist', 'public', 'index.html')
      : path.join(__dirname, '..', 'public', 'index.html');
    mainWindow.loadFile(indexPath);
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
