import { app, BrowserWindow, dialog, ipcMain } from 'electron';
import path from 'node:path';
import http from 'node:http';

let mainWindow: BrowserWindow | null = null;
let httpServer: http.Server | null = null;

function showErrorAndQuit(title: string, message: string) {
  dialog.showErrorBox(title, message);
  app.quit();
}

async function startServer() {
  if (app.isPackaged) {
    // require() supports Electron's asar virtual paths; import() does not
    const serverPath = path.join(app.getAppPath(), 'dist', 'index.js');
    try {
      const { createApp } = require(serverPath);
      const result = await createApp({
        port: 14567,
        dataDir: path.join(app.getPath('userData'), 'data'),
        staticDir: path.join(app.getAppPath(), 'dist', 'public'),
      });
      httpServer = result.server;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.stack || err.message : String(err);
      showErrorAndQuit('Server Start Failed', msg);
      throw err;
    }
  }
}

function createWindow() {
  const preloadPath = path.join(__dirname, 'preload.js');

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    title: 'Claude Kanban',
    show: false,
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
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
  try {
    await startServer();
    createWindow();
  } catch {
    // startServer already shows error dialog and quits
    return;
  }

  ipcMain.handle('dialog:openDirectory', async () => {
    if (!mainWindow) return { cancelled: true };
    const result = await dialog.showOpenDialog(mainWindow, {
      title: '选择工作目录',
      properties: ['openDirectory'],
    });
    if (result.canceled || result.filePaths.length === 0) {
      return { cancelled: true };
    }
    return { path: result.filePaths[0] };
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (httpServer) httpServer.close();
  if (process.platform !== 'darwin') app.quit();
});
