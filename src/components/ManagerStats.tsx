import { ManagerStats as ManagerStatsType } from '../data/worldCupData';
import { countryFlags, countryNamesCn } from '../data/worldCup2026Schedule';

interface ManagerStatsProps {
  stats: ManagerStatsType[];
}

export function ManagerStats({ stats }: ManagerStatsProps) {
  return (
    <div className="bg-[#0F1424] rounded-2xl border border-slate-800 overflow-hidden">
      <div className="px-5 py-4 border-b border-slate-800">
        <h3 className="text-sm font-semibold text-slate-200">👔 主教练战绩对比</h3>
        <p className="text-xs text-slate-400 mt-1">各主教练带队在世界杯的表现</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-slate-900/50">
              <th className="px-4 py-3 text-left text-slate-400 font-medium text-xs">排名</th>
              <th className="px-4 py-3 text-left text-slate-400 font-medium text-xs">主教练</th>
              <th className="px-4 py-3 text-left text-slate-400 font-medium text-xs">所属国家</th>
              <th className="px-4 py-3 text-center text-slate-400 font-medium text-xs">场次</th>
              <th className="px-4 py-3 text-center text-slate-400 font-medium text-xs">胜</th>
              <th className="px-4 py-3 text-center text-slate-400 font-medium text-xs">平</th>
              <th className="px-4 py-3 text-center text-slate-400 font-medium text-xs">负</th>
              <th className="px-4 py-3 text-center text-slate-400 font-medium text-xs">进球</th>
              <th className="px-4 py-3 text-center text-slate-400 font-medium text-xs">失球</th>
              <th className="px-4 py-3 text-center text-slate-400 font-medium text-xs">胜率</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-850">
            {stats.map((manager, index) => {
              const flag = countryFlags[manager.country] || '🏳️';
              const countryNameCn = countryNamesCn[manager.country] || manager.country;
              
              return (
                <tr key={`${manager.manager_name}-${index}`} className="hover:bg-slate-800/30 transition-colors">
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold ${
                      index === 0 ? 'bg-amber-500/20 text-amber-400' :
                      index === 1 ? 'bg-slate-300/20 text-slate-300' :
                      index === 2 ? 'bg-amber-700/20 text-amber-600' :
                      'bg-slate-800 text-slate-400'
                    }`}>
                      {index + 1}
                    </span>
                  </td>
                  <td className="px-4 py-3 font-semibold text-slate-200">{manager.manager_name}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <span className="text-sm">{flag}</span>
                      <span className="text-slate-400 text-xs">{countryNameCn}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-center text-slate-300 font-mono">{manager.matches}</td>
                  <td className="px-4 py-3 text-center text-emerald-400 font-mono">{manager.wins}</td>
                  <td className="px-4 py-3 text-center text-slate-300 font-mono">{manager.draws}</td>
                  <td className="px-4 py-3 text-center text-rose-400 font-mono">{manager.losses}</td>
                  <td className="px-4 py-3 text-center text-slate-300 font-mono">{manager.goals_for}</td>
                  <td className="px-4 py-3 text-center text-slate-400 font-mono">{manager.goals_against}</td>
                  <td className="px-4 py-3 text-center">
                    <span className={`font-mono font-semibold ${
                      manager.win_rate >= 70 ? 'text-emerald-400' :
                      manager.win_rate >= 50 ? 'text-amber-400' :
                      manager.win_rate >= 30 ? 'text-yellow-400' : 'text-rose-400'
                    }`}>
                      {manager.win_rate.toFixed(1)}%
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