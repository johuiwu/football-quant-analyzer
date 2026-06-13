const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  platform: process.platform,
  isElectron: true,
  version: () => ipcRenderer.invoke('get-app-version'),
  isPackaged: () => ipcRenderer.invoke('get-is-packaged'),
  checkForUpdates: () => ipcRenderer.send('check-for-updates'),
  downloadUpdate: () => ipcRenderer.send('download-update'),
  installUpdate: () => ipcRenderer.send('install-update'),
  onUpdateChecking: (callback) => ipcRenderer.on('update-checking', () => callback()),
  onUpdateAvailable: (callback) => ipcRenderer.on('update-available', (_event, info) => callback(info)),
  onUpdateNotAvailable: (callback) => ipcRenderer.on('update-not-available', () => callback()),
  onUpdateError: (callback) => ipcRenderer.on('update-error', (_event, error) => callback(error)),
  onDownloadProgress: (callback) => ipcRenderer.on('download-progress', (_event, progress) => callback(progress)),
  onUpdateDownloaded: (callback) => ipcRenderer.on('update-downloaded', (_event, info) => callback(info)),
  removeUpdateListeners: () => {
    ipcRenderer.removeAllListeners('update-checking');
    ipcRenderer.removeAllListeners('update-available');
    ipcRenderer.removeAllListeners('update-not-available');
    ipcRenderer.removeAllListeners('update-error');
    ipcRenderer.removeAllListeners('download-progress');
    ipcRenderer.removeAllListeners('update-downloaded');
  },

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