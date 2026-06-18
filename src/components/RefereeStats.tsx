import { RefereeStats as RefereeStatsType } from '../data/worldCupData';
import { countryFlags, countryNamesCn } from '../data/worldCup2026Schedule';

interface RefereeStatsProps {
  stats: RefereeStatsType[];
}

export function RefereeStats({ stats }: RefereeStatsProps) {
  return (
    <div className="bg-[#0F1424] rounded-2xl border border-slate-800 overflow-hidden">
      <div className="px-5 py-4 border-b border-slate-800">
        <h3 className="text-sm font-semibold text-slate-200">🔍 裁判统计</h3>
        <p className="text-xs text-slate-400 mt-1">各裁判的执法风格和比赛数据</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-slate-900/50">
              <th className="px-4 py-3 text-left text-slate-400 font-medium text-xs">裁判</th>
              <th className="px-4 py-3 text-left text-slate-400 font-medium text-xs">国家</th>
              <th className="px-4 py-3 text-center text-slate-400 font-medium text-xs">执法场次</th>
              <th className="px-4 py-3 text-center text-slate-400 font-medium text-xs">总进球</th>
              <th className="px-4 py-3 text-center text-slate-400 font-medium text-xs">场均进球</th>
              <th className="px-4 py-3 text-center text-slate-400 font-medium text-xs">主队胜</th>
              <th className="px-4 py-3 text-center text-slate-400 font-medium text-xs">客队胜</th>
              <th className="px-4 py-3 text-center text-slate-400 font-medium text-xs">平局</th>
              <th className="px-4 py-3 text-center text-slate-400 font-medium text-xs">主队胜率</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-850">
            {stats.map((ref, index) => {
              const flag = countryFlags[ref.country] || '🏳️';
              const countryNameCn = countryNamesCn[ref.country] || ref.country;
              
              return (
                <tr key={`${ref.referee}-${index}`} className="hover:bg-slate-800/30 transition-colors">
                  <td className="px-4 py-3 font-semibold text-slate-200">{ref.referee}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <span className="text-sm">{flag}</span>
                      <span className="text-slate-400 text-xs">{countryNameCn}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-center text-slate-300 font-mono">{ref.matches}</td>
                  <td className="px-4 py-3 text-center text-amber-400 font-mono">{ref.total_goals}</td>
                  <td className="px-4 py-3 text-center text-slate-300 font-mono">{ref.avg_goals_per_match.toFixed(2)}</td>
                  <td className="px-4 py-3 text-center text-rose-400 font-mono">{ref.home_wins}</td>
                  <td className="px-4 py-3 text-center text-emerald-400 font-mono">{ref.away_wins}</td>
                  <td className="px-4 py-3 text-center text-slate-400 font-mono">{ref.draws}</td>
                  <td className="px-4 py-3 text-center">
                    <span className={`font-mono ${ref.home_win_rate > 50 ? 'text-rose-400' : ref.home_win_rate < 40 ? 'text-emerald-400' : 'text-slate-300'}`}>
                      {ref.home_win_rate.toFixed(1)}%
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}