import React, { useState } from 'react';
import { Brain, Key, RefreshCcw, CheckCircle, AlertTriangle, ExternalLink, X } from 'lucide-react';

const DEEPSEEK_STORAGE_KEY = 'deepseek_api_key';

interface DeepSeekKeyModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaved: () => void;
}

export function DeepSeekKeyModal({ isOpen, onClose, onSaved }: DeepSeekKeyModalProps) {
  const [apiKey, setApiKey] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [isSuccess, setIsSuccess] = useState(false);

  if (!isOpen) return null;

  const handleSave = async () => {
    if (!apiKey.trim()) {
      setMessage('请输入有效的 DeepSeek API Key');
      setIsSuccess(false);
      return;
    }

    setIsLoading(true);
    setMessage('');

    try {
      const response = await fetch('/api/deepseek/set-key', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey: apiKey.trim() }),
      });

      const data = await response.json();
      if (data.success) {
        localStorage.setItem(DEEPSEEK_STORAGE_KEY, apiKey.trim());
        setMessage('API Key 配置成功！AI 战术分析功能已激活。');
        setIsSuccess(true);
        setTimeout(() => {
          onSaved();
          onClose();
        }, 1200);
      } else {
        setMessage(data.message || '保存失败，请重试');
        setIsSuccess(false);
      }
    } catch (error) {
      setMessage('网络错误，请稍后重试');
      setIsSuccess(false);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleSave();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* 遮罩层 */}
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      
      {/* 弹窗 */}
      <div className="relative bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl w-full max-w-md mx-4 overflow-hidden">
        {/* 顶部装饰条 */}
        <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-purple-500 via-indigo-500 to-purple-500" />
        
        {/* 头部 */}
        <div className="flex items-center justify-between p-5 pb-3">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-purple-500/10 rounded-xl">
              <Brain className="w-5 h-5 text-purple-400" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-100">配置 DeepSeek API Key</h3>
              <p className="text-xs text-slate-400 mt-0.5">激活 AI 战术推演与深度点评</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-500 hover:text-slate-300 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-5 pb-5 space-y-4">
          {/* 说明 */}
          <div className="p-3 bg-purple-900/20 border border-purple-700/30 rounded-xl">
            <div className="flex items-start gap-2">
              <Key className="w-4 h-4 text-purple-400 mt-0.5 flex-shrink-0" />
              <div className="text-xs text-slate-300 space-y-2">
                <p>DeepSeek AI 提供专业的足球战术分析能力：</p>
                <ul className="space-y-1 text-slate-400">
                  <li>• 球队战术画像与弱点剖析</li>
                  <li>• 赛事赔率变动与冷门预警</li>
                  <li>• Poisson 进球模型深度解读</li>
                </ul>
              </div>
            </div>
          </div>

          {/* 注册引导 */}
          <div className="p-3 bg-indigo-900/20 border border-indigo-700/30 rounded-xl">
            <p className="text-xs text-slate-300 mb-2 font-medium">🔑 还没有 API Key？</p>
            <ol className="text-xs text-slate-400 space-y-1.5 list-decimal list-inside">
              <li>访问 DeepSeek 开放平台注册账号</li>
              <li>进入「API Keys」页面创建新密钥</li>
              <li>复制以 <code className="text-purple-300 bg-purple-900/40 px-1 rounded">sk-</code> 开头的 Key</li>
            </ol>
            <a
              href="https://platform.deepseek.com/api_keys"
              target="_blank"
              rel="noopener noreferrer"
              className="mt-2.5 inline-flex items-center gap-1.5 text-xs text-indigo-400 hover:text-indigo-300 transition-colors"
            >
              <ExternalLink className="w-3 h-3" />
              前往 DeepSeek 开放平台获取 Key →
            </a>
          </div>

          {/* 输入框 */}
          <div className="space-y-2">
            <label className="text-xs text-slate-400 flex items-center gap-1.5">
              <Key className="w-3 h-3" /> 输入 API Key
            </label>
            <input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="sk-xxxxxxxxxxxxxxxxxxxxxxxx"
              className="w-full bg-slate-800 border border-slate-600 rounded-xl px-4 py-3 text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-500/30 font-mono"
              autoFocus
            />
          </div>

          {/* 消息提示 */}
          {message && (
            <div className={`flex items-center gap-2 text-xs p-3 rounded-xl ${isSuccess ? 'bg-green-900/30 border border-green-700/30 text-green-300' : 'bg-red-900/30 border border-red-700/30 text-red-300'}`}>
              {isSuccess ? <CheckCircle className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}
              {message}
            </div>
          )}

          {/* 按钮 */}
          <button
            onClick={handleSave}
            disabled={isLoading}
            className="w-full py-3 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-bold rounded-xl flex items-center justify-center gap-2 transition-all shadow-lg shadow-purple-900/25"
          >
            {isLoading ? (
              <>
                <RefreshCcw className="w-4 h-4 animate-spin" />
                验证中...
              </>
            ) : (
              <>
                <CheckCircle className="w-4 h-4" />
                保存并激活 AI 分析
              </>
            )}
          </button>

          <p className="text-[10px] text-slate-600 text-center">
            Key 仅保存在本地浏览器和当前会话中，不会上传至第三方
          </p>
        </div>
      </div>
    </div>
  );
}
