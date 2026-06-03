const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  platform: process.platform,
  isElectron: true,
  version: () => ipcRenderer.invoke('get-app-version'),
  isPackaged: () => ipcRenderer.invoke('get-is-packaged'),
});