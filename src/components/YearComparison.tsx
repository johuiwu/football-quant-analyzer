import { YearStats } from '../data/worldCupData';

interface YearComparisonProps {
  stats: YearStats[];
}

export function YearComparison({ stats }: YearComparisonProps) {
  const sortedStats = [...stats].sort((a, b) => a.year - b.year);
  
  const metrics = [
    { key: 'total_goals', label: '总进球数', format: 'number' },
    { key: 'avg_goals_per_match', label: '场均进球', format: 'decimal' },
    { key: 'matches', label: '比赛场次', format: 'number' },
    { key: 'attendance', label: '总观众数(万)', format: 'decimal' },
    { key: 'avg_attendance', label: '场均观众(万)', format: 'decimal' },
    { key: 'home_win_rate', label: '主队胜率', format: 'percent' },
    { key: 'draw_rate', label: '平局率', format: 'percent' },
  ];

  return (
    <div className="bg-[#0F1424] rounded-2xl border border-slate-800 overflow-hidden">
      <div className="px-5 py-4 border-b border-slate-800">
        <h3 className="text-sm font-semibold text-slate-200">📈 历届世界杯风格对比</h3>
        <p className="text-xs text-slate-400 mt-1">分析不同年份世界杯的风格变迁</p>
      </div>
      
      <div className="p-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
          {sortedStats.map((year) => (
            <div key={year.year} className="bg-slate-900/50 rounded-xl p-4 border border-slate-800">
              <div className="flex items-center justify-between mb-3">
                <h4 className="font-semibold text-slate-200 text-lg">
                  ⚽ {year.year} 世界杯
                </h4>
                <span className="text-xs text-slate-400 bg-slate-950 px-2 py-1 rounded">
                  {year.host}
                </span>
              </div>
              
              <div className="grid grid-cols-2 gap-2">
                <div className="bg-slate-950 rounded-lg p-2">
                  <div className="text-[10px] text-slate-400 mb-1">比赛场次</div>
                  <div className="text-lg font-bold text-slate-300 font-mono">{year.matches}</div>
                </div>
                <div className="bg-slate-950 rounded-lg p-2">
                  <div className="text-[10px] text-slate-400 mb-1">参赛球队</div>
                  <div className="text-lg font-bold text-slate-300 font-mono">{year.teams}</div>
                </div>
                <div className="bg-slate-950 rounded-lg p-2">
                  <div className="text-[10px] text-slate-400 mb-1">总进球</div>
                  <div className="text-lg font-bold text-amber-400 font-mono">{year.total_goals}</div>
                </div>
                <div className="bg-slate-950 rounded-lg p-2">
                  <div className="text-[10px] text-slate-400 mb-1">场均进球</div>
                  <div className="text-lg font-bold text-amber-400 font-mono">{year.avg_goals_per_match.toFixed(2)}</div>
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="bg-slate-900/50 rounded-xl p-4 border border-slate-800">
          <h4 className="text-xs font-semibold text-slate-300 mb-4">📊 详细数据对比</h4>
          <div className="space-y-3">
            {metrics.map((metric) => (
              <div key={metric.key} className="bg-slate-950 rounded-lg p-3">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs text-slate-400">{metric.label}</span>
                </div>
                <div className="flex items-center gap-4">
                  {sortedStats.map((year) => {
                    const value = (year as any)[metric.key];
                    let displayValue: string;
                    if (metric.format === 'decimal') {
                      displayValue = value.toFixed(2);
                    } else if (metric.format === 'percent') {
                      displayValue = `${value.toFixed(1)}%`;
                    } else {
                      displayValue = value.toString();
                    }
                    
                    const maxValue = Math.max(...sortedStats.map(y => (y as any)[metric.key]));
                    const minValue = Math.min(...sortedStats.map(y => (y as any)[metric.key]));
                    const range = maxValue - minValue || 1;
                    const normalized = ((value - minValue) / range) * 80 + 20;
                    
                    return (
                      <div key={year.year} className="flex-1 text-center">
                        <div 
                          className="h-6 rounded bg-gradient-to-r from-amber-500/20 to-amber-500/80 mb-1 transition-all"
                          style={{ width: `${normalized}%` }}
                        />
                        <div className="text-xs font-mono text-slate-300">{displayValue}</div>
                        <div className="text-[10px] text-slate-500">{year.year}</div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}