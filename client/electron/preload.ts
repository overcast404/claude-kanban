import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  platform: process.platform,
  pickDirectory: () => ipcRenderer.invoke('dialog:openDirectory') as Promise<{
    path?: string;
    cancelled?: boolean;
  }>,
});
