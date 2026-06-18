import { TeamStats } from '../data/worldCupData';
import { countryFlags, countryNamesCn } from '../data/worldCup2026Schedule';

interface TeamStatsTableProps {
  stats: TeamStats[];
}

export function TeamStatsTable({ stats }: TeamStatsTableProps) {
  return (
    <div className="bg-[#0F1424] rounded-2xl border border-slate-800 overflow-hidden">
      <div className="px-5 py-4 border-b border-slate-800">
        <h3 className="text-sm font-semibold text-slate-200">🏆 球队战绩统计</h3>
        <p className="text-xs text-slate-400 mt-1">各球队在世界杯中的综合表现数据</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-slate-900/50">
              <th className="px-4 py-3 text-left text-slate-400 font-medium text-xs">排名</th>
              <th className="px-4 py-3 text-left text-slate-400 font-medium text-xs">球队</th>
              <th className="px-4 py-3 text-center text-slate-400 font-medium text-xs">场次</th>
              <th className="px-4 py-3 text-center text-slate-400 font-medium text-xs">胜</th>
              <th className="px-4 py-3 text-center text-slate-400 font-medium text-xs">平</th>
              <th className="px-4 py-3 text-center text-slate-400 font-medium text-xs">负</th>
              <th className="px-4 py-3 text-center text-slate-400 font-medium text-xs">进球</th>
              <th className="px-4 py-3 text-center text-slate-400 font-medium text-xs">失球</th>
              <th className="px-4 py-3 text-center text-slate-400 font-medium text-xs">净胜</th>
              <th className="px-4 py-3 text-center text-slate-400 font-medium text-xs">胜率</th>
              <th className="px-4 py-3 text-center text-slate-400 font-medium text-xs">场均进球</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-850">
            {stats.map((team, index) => {
              const flag = countryFlags[team.team_name] || countryFlags[team.team_country] || '🏳️';
              const teamNameCn = countryNamesCn[team.team_name] || countryNamesCn[team.team_country] || team.team_name;
              
              return (
                <tr key={team.team_name} className="hover:bg-slate-800/30 transition-colors">
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
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <span className="text-lg">{flag}</span>
                      <span className="font-semibold text-slate-200">{teamNameCn}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-center text-slate-300 font-mono">{team.matches}</td>
                  <td className="px-4 py-3 text-center text-emerald-400 font-mono">{team.wins}</td>
                  <td className="px-4 py-3 text-center text-slate-300 font-mono">{team.draws}</td>
                  <td className="px-4 py-3 text-center text-rose-400 font-mono">{team.losses}</td>
                  <td className="px-4 py-3 text-center text-slate-300 font-mono">{team.goals_for}</td>
                  <td className="px-4 py-3 text-center text-slate-400 font-mono">{team.goals_against}</td>
                  <td className="px-4 py-3 text-center">
                    <span className={`font-mono font-semibold ${
                      team.goal_diff > 0 ? 'text-emerald-400' :
                      team.goal_diff < 0 ? 'text-rose-400' : 'text-slate-400'
                    }`}>
                      {team.goal_diff > 0 ? `+${team.goal_diff}` : team.goal_diff}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className={`font-mono ${team.win_rate >= 60 ? 'text-emerald-400' : team.win_rate >= 40 ? 'text-amber-400' : 'text-rose-400'}`}>
                      {team.win_rate.toFixed(1)}%
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center text-slate-300 font-mono">{team.avg_goals_per_match.toFixed(2)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}