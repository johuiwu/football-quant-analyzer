export interface UpdateInfo {
  version: string;
  files: Array<{ url: string; sha512: string; size: number }>;
  path: string;
  sha512: string;
  releaseDate: string;
  releaseName?: string;
  releaseNotes?: string;
}

export interface DownloadProgress {
  percent: number;
  bytesPerSecond: number;
  total: number;
  transferred: number;
}

declare global {
  interface Window {
    electronAPI: {
      platform: string;
      isElectron: boolean;
      version: () => Promise<string>;
      isPackaged: () => Promise<boolean>;
      checkForUpdates: () => void;
      downloadUpdate: () => void;
      installUpdate: () => void;
      onUpdateChecking: (callback: () => void) => void;
      onUpdateAvailable: (callback: (info: UpdateInfo) => void) => void;
      onUpdateNotAvailable: (callback: (info: UpdateInfo) => void) => void;
      onUpdateError: (callback: (error: { message: string }) => void) => void;
      onDownloadProgress: (callback: (progress: DownloadProgress) => void) => void;
      onUpdateDownloaded: (callback: (info: UpdateInfo) => void) => void;
      removeUpdateListeners: () => void;
    };
  }
}

export {};
