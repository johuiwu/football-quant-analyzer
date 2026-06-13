import React from 'react';
import { RefreshCw } from 'lucide-react';
import UpdateChecker from '../components/UpdateChecker';

export default function UpdatesPage() {
  return (
    <div className="max-w-7xl mx-auto px-4 py-6">
      <div className="mb-8 text-center">
        <div className="inline-flex items-center gap-3 mb-3">
          <RefreshCw className="w-6 h-6 text-purple-400" />
          <h1 className="text-2xl font-bold text-slate-100 tracking-tight">软件更新</h1>
        </div>
        <p className="text-sm text-slate-400 max-w-lg mx-auto">
          检查并安装最新版本，获取新功能与性能优化
        </p>
      </div>

      <div className="max-w-md mx-auto">
        <UpdateChecker />
      </div>
    </div>
  );
}
