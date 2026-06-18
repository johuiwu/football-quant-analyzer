import { StageStats } from '../data/worldCupData';

interface StageComparisonProps {
  stats: StageStats[];
}

const stageNamesCn: Record<string, string> = {
  'Group Stage': '小组赛',
  'Round of 16': '1/8决赛',
  'Quarter-Final': '1/4决赛',
  'Semi-Final': '半决赛',
  'Final': '决赛',
  'Third Place Playoff': '三四名决赛',
  'Knockout': '淘汰赛'
};

export function StageComparison({ stats }: StageComparisonProps) {
  const groupStage = stats.find(s => s.stage === 'Group Stage');
  const knockoutStats = stats.filter(s => s.stage !== 'Group Stage');
  
  const knockoutTotal = knockoutStats.reduce((acc, s) => ({
    matches: acc.matches + s.matches,
    total_goals: acc.total_goals + s.total_goals,
    home_wins: acc.home_wins + s.home_wins,
    away_wins: acc.away_wins + s.away_wins,
    draws: acc.draws + s.draws
  }), { matches: 0, total_goals: 0, home_wins: 0, away_wins: 0, draws: 0 });

  const knockoutAvg = {
    stage: 'Knockout',
    matches: knockoutTotal.matches,
    total_goals: knockoutTotal.total_goals,
    avg_goals_per_match: knockoutTotal.matches > 0 ? knockoutTotal.total_goals / knockoutTotal.matches : 0,
    home_wins: knockoutTotal.home_wins,
    away_wins: knockoutTotal.away_wins,
    draws: knockoutTotal.draws,
    avg_goals_home: knockoutTotal.matches > 0 ? knockoutTotal.total_goals / knockoutTotal.matches / 2 : 0,
    avg_goals_away: knockoutTotal.matches > 0 ? knockoutTotal.total_goals / knockoutTotal.matches / 2 : 0
  };

  const comparisonData = groupStage ? [groupStage, knockoutAvg] : [];

  const getStageNameCn = (stage: string) => stageNamesCn[stage] || stage;

  return (
    <div className="bg-[#0F1424] rounded-2xl border border-slate-800 overflow-hidden">
      <div className="px-5 py-4 border-b border-slate-800">
        <h3 className="text-sm font-semibold text-slate-200">⚽ 小组赛 vs 淘汰赛风格对比</h3>
        <p className="text-xs text-slate-400 mt-1">分析不同阶段比赛的风格差异</p>
      </div>
      
      <div className="p-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {comparisonData.map((stage) => (
            <div key={stage.stage} className="bg-slate-900/50 rounded-xl p-4 border border-slate-800">
              <div className="flex items-center justify-between mb-4">
                <h4 className="font-semibold text-slate-200">
                  {stage.stage === 'Group Stage' ? '🏆 小组赛' : '🔥 淘汰赛'}
                </h4>
                <span className="text-xs text-slate-400">
                  {stage.matches} 场比赛
                </span>
              </div>
              
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-slate-950 rounded-lg p-3">
                  <div className="text-[10px] text-slate-400 mb-1">场均进球</div>
                  <div className="text-xl font-bold text-amber-400 font-mono">
                    {stage.avg_goals_per_match.toFixed(2)}
                  </div>
                </div>
                <div className="bg-slate-950 rounded-lg p-3">
                  <div className="text-[10px] text-slate-400 mb-1">总进球</div>
                  <div className="text-xl font-bold text-slate-300 font-mono">
                    {stage.total_goals}
                  </div>
                </div>
                <div className="bg-slate-950 rounded-lg p-3">
                  <div className="text-[10px] text-slate-400 mb-1">主队胜</div>
                  <div className="text-lg font-semibold text-rose-400 font-mono">
                    {stage.home_wins}
                  </div>
                </div>
                <div className="bg-slate-950 rounded-lg p-3">
                  <div className="text-[10px] text-slate-400 mb-1">客队胜</div>
                  <div className="text-lg font-semibold text-emerald-400 font-mono">
                    {stage.away_wins}
                  </div>
                </div>
                <div className="bg-slate-950 rounded-lg p-3 col-span-2">
                  <div className="text-[10px] text-slate-400 mb-2">平局数</div>
                  <div className="text-lg font-semibold text-slate-300 font-mono">
                    {stage.draws} 场 ({((stage.draws / stage.matches) * 100).toFixed(1)}%)
                  </div>
                </div>
              </div>

              <div className="mt-4 space-y-2">
                <div>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-slate-400">主胜占比</span>
                    <span className="text-rose-400 font-mono">{((stage.home_wins / stage.matches) * 100).toFixed(1)}%</span>
                  </div>
                  <div className="h-1.5 bg-slate-950 rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-rose-500 transition-all"
                      style={{ width: `${(stage.home_wins / stage.matches) * 100}%` }}
                    />
                  </div>
                </div>
                <div>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-slate-400">客胜占比</span>
                    <span className="text-emerald-400 font-mono">{((stage.away_wins / stage.matches) * 100).toFixed(1)}%</span>
                  </div>
                  <div className="h-1.5 bg-slate-950 rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-emerald-500 transition-all"
                      style={{ width: `${(stage.away_wins / stage.matches) * 100}%` }}
                    />
                  </div>
                </div>
                <div>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-slate-400">平局占比</span>
                    <span className="text-slate-300 font-mono">{((stage.draws / stage.matches) * 100).toFixed(1)}%</span>
                  </div>
                  <div className="h-1.5 bg-slate-950 rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-slate-500 transition-all"
                      style={{ width: `${(stage.draws / stage.matches) * 100}%` }}
                    />
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-4 p-3 bg-slate-900/50 rounded-xl border border-slate-800">
          <h4 className="text-xs font-semibold text-slate-300 mb-2">📊 淘汰赛细分阶段</h4>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            {knockoutStats.map((stage) => (
              <div key={stage.stage} className="bg-slate-950 rounded-lg p-2">
                <div className="text-[10px] text-slate-400 mb-1 truncate">{getStageNameCn(stage.stage)}</div>
                <div className="text-sm font-bold text-amber-400 font-mono">
                  {stage.avg_goals_per_match.toFixed(1)}球/场
                </div>
                <div className="text-[10px] text-slate-500">{stage.matches}场</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}