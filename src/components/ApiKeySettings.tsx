import React, { useState, useEffect, useCallback } from 'react';
import { Key, RefreshCcw, CheckCircle, AlertTriangle, Brain, ExternalLink } from 'lucide-react';

const DEEPSEEK_STORAGE_KEY = 'deepseek_api_key';

export function ApiKeySettings() {
  // DeepSeek API Key
  const [deepseekKey, setDeepseekKey] = useState('');
  const [dsLoading, setDsLoading] = useState(false);
  const [dsMessage, setDsMessage] = useState('');
  const [dsSuccess, setDsSuccess] = useState(false);

  const [showSettings, setShowSettings] = useState(false);

  useEffect(() => {
    const savedDsKey = localStorage.getItem(DEEPSEEK_STORAGE_KEY);
    if (savedDsKey) {
      setDeepseekKey(savedDsKey);
    }
  }, []);

  // ========== DeepSeek API Key ==========
  const saveDeepseekKey = useCallback(async (key: string) => {
    setDsLoading(true);
    setDsMessage('');
    try {
      const response = await fetch('/api/deepseek/set-key', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey: key }),
      });
      const data = await response.json();
      if (data.success) {
        localStorage.setItem(DEEPSEEK_STORAGE_KEY, key);
        setDsMessage(data.message || 'DeepSeek API Key 保存成功！');
        setDsSuccess(true);
      } else {
        setDsMessage(data.message || '保存失败');
        setDsSuccess(false);
      }
    } catch (error) {
      console.error('Error saving DeepSeek Key:', error);
      setDsMessage('网络错误，请稍后重试');
      setDsSuccess(false);
    } finally {
      setDsLoading(false);
    }
  }, []);

  const handleSaveDeepseek = () => {
    if (!deepseekKey.trim()) {
      setDsMessage('请输入有效的 DeepSeek API Key');
      setDsSuccess(false);
      return;
    }
    saveDeepseekKey(deepseekKey.trim());
  };

  const handleResetDeepseek = () => {
    if (confirm('确定要清除 DeepSeek API Key 吗？AI 分析功能将不可用。')) {
      saveDeepseekKey('');
      setDeepseekKey('');
      localStorage.removeItem(DEEPSEEK_STORAGE_KEY);
    }
  };

  const handleDsKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleSaveDeepseek();
  };

  return (
    <div className="mt-4 p-4 bg-slate-900/50 rounded-xl border border-slate-700/50">
      <div 
        className="flex items-center justify-between cursor-pointer"
        onClick={() => setShowSettings(!showSettings)}
      >
        <div className="flex items-center gap-2">
          <Key className="w-4 h-4 text-amber-400" />
          <span className="text-sm font-medium text-slate-300">API Key 设置</span>
        </div>
        <div className="text-xs text-slate-500 flex items-center gap-1">
          <span>{deepseekKey ? '已配置' : '未配置'}</span>
          <svg 
            className={`w-3 h-3 transition-transform ${showSettings ? 'rotate-180' : ''}`} 
            fill="none" viewBox="0 0 24 24" stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </div>

      {showSettings && (
        <div className="mt-4 space-y-4">
          {/* DeepSeek AI Key Section */}
          <div className="p-3 bg-purple-900/20 border border-purple-700/30 rounded-lg">
            <div className="flex items-start gap-2">
              <Brain className="w-4 h-4 text-purple-400 mt-0.5 flex-shrink-0" />
              <div className="text-xs text-slate-400 space-y-1">
                <p className="text-purple-300 font-medium">DeepSeek AI 分析密钥</p>
                <p>用于驱动 AI 战术推演、球队画像、赛事点评功能。获取 Key 请访问：</p>
                <a href="https://platform.deepseek.com/api_keys" target="_blank" rel="noopener noreferrer" className="text-purple-400 underline">
                  https://platform.deepseek.com/api_keys
                </a>
              </div>
            </div>
            <div className="mt-3 space-y-2">
              <label className="text-xs text-slate-400 flex items-center gap-1">
                <Brain className="w-3 h-3" /> DeepSeek API Key
              </label>
              <div className="flex gap-2">
                <input
                  type="password"
                  value={deepseekKey}
                  onChange={(e) => setDeepseekKey(e.target.value)}
                  onKeyDown={handleDsKeyDown}
                  placeholder="输入您的 DeepSeek API Key（sk-...）"
                  className="flex-1 bg-slate-800 border border-purple-700/50 rounded-lg px-3 py-2 text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500"
                />
                <button
                  onClick={handleSaveDeepseek}
                  disabled={dsLoading}
                  className="px-4 py-2 bg-purple-600 hover:bg-purple-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg flex items-center gap-1 transition-colors"
                >
                  {dsLoading ? (
                    <RefreshCcw className="w-3 h-3 animate-spin" />
                  ) : (
                    <CheckCircle className="w-3 h-3" />
                  )}
                  保存
                </button>
              </div>
            </div>

            {dsMessage && (
              <div className={`mt-2 flex items-center gap-2 text-xs p-2 rounded-lg ${dsSuccess ? 'bg-green-900/30 border border-green-700/30 text-green-300' : 'bg-red-900/30 border border-red-700/30 text-red-300'}`}>
                {dsSuccess ? <CheckCircle className="w-3 h-3" /> : <AlertTriangle className="w-3 h-3" />}
                {dsMessage}
              </div>
            )}

            <div className="flex items-center justify-between mt-2 pt-2 border-t border-purple-700/20">
              <span className="text-xs text-slate-500">
                DeepSeek 状态：<span className={deepseekKey ? 'text-green-400' : 'text-amber-400'}>
                  {deepseekKey ? '已配置' : '未配置（AI 功能不可用）'}
                </span>
              </span>
              {deepseekKey && (
                <button onClick={handleResetDeepseek} className="text-xs text-amber-400 hover:text-amber-300 transition-colors">
                  清除 Key
                </button>
              )}
            </div>
          </div>

          {/* 注册引导 */}
          <div className="p-3 bg-indigo-900/20 border border-indigo-700/30 rounded-lg">
            <p className="text-xs text-slate-300 mb-2 font-medium">还没有 DeepSeek API Key？</p>
            <ol className="text-xs text-slate-400 space-y-1 list-decimal list-inside">
              <li>访问 DeepSeek 开放平台注册账号</li>
              <li>进入「API Keys」页面创建新密钥</li>
              <li>复制以 <code className="text-purple-300 bg-purple-900/40 px-1 rounded">sk-</code> 开头的 Key 粘贴到上方</li>
            </ol>
            <a
              href="https://platform.deepseek.com/api_keys"
              target="_blank"
              rel="noopener noreferrer"
              className="mt-2 inline-flex items-center gap-1.5 text-xs text-indigo-400 hover:text-indigo-300 transition-colors"
            >
              <ExternalLink className="w-3 h-3" />
              前往 DeepSeek 开放平台获取 Key →
            </a>
          </div>
        </div>
      )}
    </div>
  );
}
