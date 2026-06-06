import { AlertTriangle, Calculator } from 'lucide-react';
import { useNavigate, useLocation } from 'react-router-dom';

export default function PageHeader() {
  const navigate = useNavigate();
  const location = useLocation();
  const currentPath = location.pathname;

  return (
    <>
      <div className="bg-red-950/75 border-b border-red-900/50 px-4 py-2.5 text-xs text-red-200 flex items-center justify-center gap-3">
        <AlertTriangle className="w-4 h-4 shrink-0 text-red-500 animate-pulse" />
        <span className="text-center">
          <strong>【重要安全合规警示】</strong> 本软件是一款纯粹面向数据科学与量化工程分析的辅助决策平台。数据及模型算力结果仅供公式理论演练、学术讨论参考。<strong>谨防非法诱赌，禁止将本模型结论接入任何非法投注交易渠道！</strong>
        </span>
      </div>

      <header className="border-b border-slate-800 bg-[#0F1424]/90 backdrop-blur sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 py-3.5 flex flex-col sm:flex-row justify-between items-center gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-gradient-to-tr from-[#FF3E6C] to-[#FF8008] rounded-xl shadow-lg ring-1 ring-white/10">
              <Calculator className="w-6 h-6 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-bold tracking-tight bg-gradient-to-r from-white via-slate-100 to-[#FF8008] bg-clip-text text-transparent">
                  足球量化分析系统
                </h1>
                <span className="px-2 py-0.5 text-[10px] uppercase font-bold tracking-widest bg-emerald-500/25 text-emerald-400 border border-emerald-500/40 rounded">
                  v2.6 STANDALONE
                </span>
              </div>
              <p className="text-xs text-slate-400 font-mono mt-0.5">Desktop-Web Sandbox Integrated Modeling System</p>
            </div>
          </div>

          <div className="flex items-center p-1 bg-slate-900/95 rounded-xl border border-slate-800">
            <button
              id="tab-dashboard"
              onClick={() => navigate('/dashboard')}
              className={`px-4 py-1.5 text-xs font-medium rounded-lg transition-all ${
                currentPath === '/dashboard'
                  ? 'bg-slate-800 text-white shadow-md border border-slate-700'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              📊 量化决策沙盘
            </button>
            <button
              id="tab-standings"
              onClick={() => navigate('/standings')}
              className={`px-4 py-1.5 text-xs font-medium rounded-lg transition-all ${
                currentPath === '/standings'
                  ? 'bg-slate-800 text-white shadow-md border border-slate-700'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              🏆 真实联赛积分
            </button>
            <button
              id="tab-teams"
              onClick={() => navigate('/teams')}
              className={`px-4 py-1.5 text-xs font-medium rounded-lg transition-all ${
                currentPath === '/teams'
                  ? 'bg-slate-800 text-white shadow-md border border-slate-700'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              🛡️ 各球队信息
            </button>
            <button
              id="tab-worldcup"
              onClick={() => navigate('/worldcup')}
              className={`px-4 py-1.5 text-xs font-medium rounded-lg transition-all ${
                currentPath === '/worldcup'
                  ? 'bg-gradient-to-r from-amber-600/80 to-orange-600/80 text-white shadow-md'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              🌍 世界杯数据
            </button>
            <button
              id="tab-corner"
              onClick={() => navigate('/corner')}
              className={`px-4 py-1.5 text-xs font-medium rounded-lg transition-all ${
                currentPath === '/corner'
                  ? 'bg-gradient-to-r from-green-600 to-emerald-600 text-white shadow-md'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              🎯 角球系统
            </button>
            {window.electronAPI?.isElectron && (
              <button
                onClick={() => window.electronAPI?.checkForUpdates?.()}
                className="px-4 py-1.5 text-xs font-medium rounded-lg transition-all bg-indigo-600 hover:bg-indigo-700 text-white shadow-md"
              >
                📦 检查更新
              </button>
            )}
          </div>
        </div>
      </header>
    </>
  );
}
