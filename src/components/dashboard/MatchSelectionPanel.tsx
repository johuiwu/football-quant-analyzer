import React, { useMemo } from 'react';
import { Calendar, RefreshCw } from 'lucide-react';

interface MatchSelectionPanelProps {
  fixtures: any[];
  selectedFixtureId: string;
  onFixtureSelect: (id: string) => void;
  onLoadRealTimeFixtures: () => void;
  isLoading: boolean;
  syncMessage: string;
  syncSource: string;
}

const MatchSelectionPanelComponent: React.FC<MatchSelectionPanelProps> = ({
  fixtures,
  selectedFixtureId,
  onFixtureSelect,
  onLoadRealTimeFixtures,
  isLoading,
  syncMessage,
  syncSource
}) => {
  const memoizedFixtures = useMemo(() => fixtures, [fixtures]);

  return (
    <div className="mb-4 bg-slate-900/60 p-3 rounded-xl border border-slate-800/60">
      <div className="flex justify-between items-center mb-1.5">
        <label className="text-[11px] font-semibold text-blue-400 flex items-center gap-1.5">
          <Calendar className="w-3.5 h-3.5 shrink-0 text-emerald-400" />
          📅 接入每日最新真实赛程
        </label>
        <button
          onClick={onLoadRealTimeFixtures}
          title="从内置高保真赛事数据库载入最新对阵"
          disabled={isLoading}
          className="text-[10px] text-blue-400 hover:text-blue-300 font-semibold flex items-center gap-1 transition-all cursor-pointer"
        >
          <RefreshCw className={`w-2.5 h-2.5 shrink-0 ${isLoading ? 'animate-spin' : ''}`} />
          {isLoading ? '同步中...' : '联网刷新'}
        </button>
      </div>
      <select
        value={selectedFixtureId}
        onChange={(e) => onFixtureSelect(e.target.value)}
        className="w-full bg-slate-950 border border-slate-850 rounded-lg px-3 py-2 text-xs text-slate-200 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 font-medium"
      >
        <option value="">-- 手动配置队伍与自定义初盘 --</option>
        {memoizedFixtures.map(f => (
          <option key={f.id} value={f.id}>
            [{f.stageCn}] {f.name} {f.matchTime ? `(${f.matchTime.split(' ')[0]})` : ''}
          </option>
        ))}
      </select>
      {selectedFixtureId && (
        <div className="mt-1.5 flex justify-between items-center px-1">
          <span className="text-[10px] text-slate-400 font-mono">
            已同步真实初指及进球盘口
          </span>
          <button
            onClick={() => onFixtureSelect('')}
            className="text-[10px] text-[#FF3E6C] hover:underline"
            title="断开赛程绑定，回归自定义调整"
          >
            断开赛程绑定
          </button>
        </div>
      )}
      <div className="mt-2 pt-1.5 border-t border-slate-850/50 flex items-center justify-between text-[10px] text-slate-500 font-mono leading-tight">
        <span className="truncate max-w-[210px]" title={syncMessage}>
          {syncSource === 'google_search_grounding' ? '🟢 联网同步: ' : '🔵 本地预置: '}{syncMessage}
        </span>
        <span className="shrink-0 bg-slate-950 px-1 py-0.5 text-[8px] rounded border border-slate-850 text-slate-400 font-bold uppercase tracking-wider">
          {syncSource === 'google_search_grounding' ? 'WebAI' : 'PRESET'}
        </span>
      </div>
    </div>
  );
};

export const MatchSelectionPanel = React.memo(MatchSelectionPanelComponent);
