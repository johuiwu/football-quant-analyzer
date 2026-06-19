import React, { useState, useEffect, useCallback } from "react";
import { RefreshCw, Download, CheckCircle, AlertCircle, XCircle, ArrowRightCircle, ExternalLink } from "lucide-react";
import type { UpdateInfo, DownloadProgress } from "../types/electron";

type UpdateStatus = 'idle' | 'checking' | 'available' | 'not-available' | 'downloading' | 'downloaded' | 'error';

const MANUAL_DOWNLOAD_URL = 'https://github.com/johuiwu/football-quant-analyzer/releases';

export default function UpdateChecker() {
  const [status, setStatus] = useState<UpdateStatus>('idle');
  const [currentVersion, setCurrentVersion] = useState<string>('');
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);
  const [downloadProgress, setDownloadProgress] = useState<DownloadProgress | null>(null);
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [isRetrying, setIsRetrying] = useState(false);
  const [canManualDownload, setCanManualDownload] = useState(false);

  const isElectron = typeof window !== 'undefined' && window.electronAPI?.isElectron;

  useEffect(() => {
    if (!isElectron) return;

    const getVersion = async () => {
      const version = await window.electronAPI.version();
      setCurrentVersion(version);
    };
    getVersion();

    window.electronAPI.onUpdateChecking(() => {
      setStatus('checking');
      setIsRetrying(false);
      setCanManualDownload(false);
    });

    window.electronAPI.onUpdateAvailable((info) => {
      setUpdateInfo(info);
      setStatus('available');
    });

    window.electronAPI.onUpdateNotAvailable(() => {
      setStatus('not-available');
    });

    window.electronAPI.onUpdateError((error) => {
      setErrorMessage(error.message);
      setIsRetrying(!!error.isRetrying);
      setCanManualDownload(!!error.canManualDownload);
      if (!error.isRetrying) {
        setStatus('error');
      }
      // isRetrying=true 时保持 checking 状态，不切换到 error
    });

    window.electronAPI.onDownloadProgress((progress) => {
      setDownloadProgress(progress);
      setStatus('downloading');
    });

    window.electronAPI.onUpdateDownloaded((info) => {
      setUpdateInfo(info);
      setStatus('downloaded');
    });

    return () => {
      window.electronAPI.removeUpdateListeners();
    };
  }, [isElectron]);

  const handleCheckForUpdates = useCallback(() => {
    if (!isElectron) return;
    setStatus('checking');
    setErrorMessage('');
    setIsRetrying(false);
    setCanManualDownload(false);
    window.electronAPI.checkForUpdates();
  }, [isElectron]);

  const handleDownloadUpdate = useCallback(() => {
    if (!isElectron) return;
    setStatus('downloading');
    window.electronAPI.downloadUpdate();
  }, [isElectron]);

  const handleInstallUpdate = useCallback(() => {
    if (!isElectron) return;
    window.electronAPI.installUpdate();
  }, [isElectron]);

  const handleManualDownload = useCallback(() => {
    window.open(MANUAL_DOWNLOAD_URL, '_blank');
  }, []);

  if (!isElectron) return null;

  return (
    <div className="bg-[#0F1424] rounded-xl border border-slate-800/80 p-4">
      <div className="flex items-center gap-2 mb-3">
        <RefreshCw className="w-4 h-4 text-purple-400" />
        <h4 className="text-sm font-semibold text-slate-200">软件更新</h4>
      </div>

      <div className="space-y-3">
        {/* 当前版本 */}
        <div className="flex items-center justify-between text-xs">
          <span className="text-slate-400">当前版本</span>
          <span className="text-slate-200 font-mono">{currentVersion}</span>
        </div>

        {/* 状态显示 */}
        {status === 'idle' && (
          <button
            onClick={handleCheckForUpdates}
            className="w-full flex items-center justify-center gap-2 bg-purple-600 hover:bg-purple-700 text-white text-xs py-2 rounded-lg transition-colors"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            检查更新
          </button>
        )}

        {(status === 'checking' || isRetrying) && (
          <div className="flex items-center justify-center gap-2 text-slate-300 text-xs py-2">
            <RefreshCw className="w-3.5 h-3.5 animate-spin" />
            {isRetrying ? '网络不稳定，自动重试中...' : '正在检查更新...'}
          </div>
        )}

        {status === 'not-available' && (
          <div className="flex items-center justify-center gap-2 text-emerald-400 text-xs py-2">
            <CheckCircle className="w-3.5 h-3.5" />
            已是最新版本
          </div>
        )}

        {status === 'available' && updateInfo && (
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="text-amber-400">发现新版本</span>
              <span className="text-amber-300 font-mono">{updateInfo.version}</span>
            </div>
            <button
              onClick={handleDownloadUpdate}
              className="w-full flex items-center justify-center gap-2 bg-amber-600 hover:bg-amber-700 text-white text-xs py-2 rounded-lg transition-colors"
            >
              <Download className="w-3.5 h-3.5" />
              下载更新
            </button>
          </div>
        )}

        {status === 'downloading' && (
          <div className="space-y-2">
            <div className="w-full bg-slate-700 rounded-full h-2.5 overflow-hidden">
              <div
                className="bg-purple-500 h-2.5 transition-all duration-300"
                style={{ width: `${downloadProgress?.percent || 0}%` }}
              />
            </div>
            <div className="flex items-center justify-between text-[10px] text-slate-400">
              <span>下载中 {downloadProgress?.percent.toFixed(1) || 0}%</span>
              <span className="font-mono">
                {(downloadProgress?.bytesPerSecond || 0) / 1024 / 1024 > 1
                  ? `${((downloadProgress?.bytesPerSecond || 0) / 1024 / 1024).toFixed(1)} MB/s`
                  : `${((downloadProgress?.bytesPerSecond || 0) / 1024).toFixed(0)} KB/s`
                }
              </span>
            </div>
          </div>
        )}

        {status === 'downloaded' && (
          <div className="space-y-2">
            <div className="flex items-center justify-center gap-2 text-emerald-400 text-xs">
              <CheckCircle className="w-3.5 h-3.5" />
              下载完成
            </div>
            <button
              onClick={handleInstallUpdate}
              className="w-full flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs py-2 rounded-lg transition-colors"
            >
              <ArrowRightCircle className="w-3.5 h-3.5" />
              立即安装并重启
            </button>
          </div>
        )}

        {status === 'error' && !isRetrying && (
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-rose-400 text-xs">
              <XCircle className="w-3.5 h-3.5" />
              更新出错
            </div>
            <p className="text-[10px] text-slate-500 break-all">{errorMessage}</p>
            <div className="flex gap-2">
              <button
                onClick={handleCheckForUpdates}
                className="flex-1 flex items-center justify-center gap-1.5 bg-slate-700 hover:bg-slate-600 text-white text-xs py-2 rounded-lg transition-colors"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                重试
              </button>
              {canManualDownload && (
                <button
                  onClick={handleManualDownload}
                  className="flex-1 flex items-center justify-center gap-1.5 bg-blue-700 hover:bg-blue-600 text-white text-xs py-2 rounded-lg transition-colors"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  手动下载
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
