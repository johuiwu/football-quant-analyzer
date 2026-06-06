const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  platform: process.platform,
  isElectron: true,
  version: () => ipcRenderer.invoke('get-app-version'),
  isPackaged: () => ipcRenderer.invoke('get-is-packaged'),
  checkForUpdates: () => ipcRenderer.send('check-for-updates'),

  // ★ 角球系统 API
  corner: {
    getStatus: () => ipcRenderer.invoke('corner:get-status'),
    startPolling: () => ipcRenderer.invoke('corner:start-polling'),
    stopPolling: () => ipcRenderer.invoke('corner:stop-polling'),
    getPendingConfirms: () => ipcRenderer.invoke('corner:pending-confirms'),
    confirmBet: (betId) => ipcRenderer.invoke('corner:confirm-bet', betId),
    rejectBet: (betId) => ipcRenderer.invoke('corner:reject-bet', betId),
  },
});