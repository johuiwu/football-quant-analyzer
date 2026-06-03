import React from "react";
import { ExternalLink, History } from "lucide-react";
import { useAppStore } from "../../store/useAppStore";
import { useCornerStore } from "../../store/cornerStore";
import { REAL_TEAMS } from "../../data/realTeamsData";

export default function LiveMonitor() {
  const selectedMatchId = useAppStore((s) => s.selectedMatchId);
  const trackedMatchIds = useAppStore((s) => s.trackedMatchIds);
  const removeTrackedMatch = useAppStore((s) => s.removeTrackedMatch);
  const navigateToDashboard = useAppStore((s) => s.navigateToDashboard);
  const strategies = useCornerStore((s) => s.strategies) || [];
  const setActiveCornerTab = useCornerStore((s) => s.setActiveCornerTab);
  const setHistoryFilterMatchId = useCornerStore((s) => s.setHistoryFilterMatchId);
  const displayData = useCornerStore((s) => s.liveMatches);
  const isLoading = useCornerStore((s) => s.isLoading);
  const pollInterval = useCornerStore((s) => s.settings.pollInterval);

  const findTeamInfo = (nameCn: string) => {
    const team = REAL_TEAMS.find((t) => t.nameCn === nameCn);
    return team ? { id: team.id, league: team.league } : { id: "", league: "" };
  };

  const enabledCount = Array.isArray(strategies) ? strategies.filter((s: any) => s.enabled).length : 0;

  const handleViewHistory = (matchId: string) => {
    setHistoryFilterMatchId(matchId);
    setActiveCornerTab("history");
  };

  if (isLoading && displayData.length === 0) {
    return (
      <div className="bg-[#0F1424] rounded-2xl border border-slate-800/80 p-12 text-center">
        <div className="w-6 h-6 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
        <p className="text-sm text-slate-400">加载角球数据中...</p>
      </div>
    );
  }

  return (
    <div key={selectedMatchId || "default"} className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <h3 className="text-sm font-semibold text-slate-200">
              实时监控 {displayData.length > 0 && "(" + displayData.length + "场)"}
            </h3>
          </div>
          {trackedMatchIds.length > 0 && (
            <span className="text-[10px] text-emerald-500 bg-emerald-500/10 px-2 py-0.5 rounded">
              追踪 {trackedMatchIds.length} 场比赛
            </span>
          )}
        </div>
      </div>

      {enabledCount === 0 && (
        <p className="text-[11px] text-amber-400/80">
          ⚠️ 尚未启用策略，建议先在「策略配置」中启用策略。
        </p>
      )}

      {displayData.length === 0 ? (
        <div className="bg-[#0F1424] rounded-2xl border border-slate-800/80 p-12 text-center">
          <div className="text-4xl mb-3">⏳</div>
          <p className="text-base font-medium text-slate-300 mb-1">当前没有进行中的比赛</p>
          <p className="text-sm text-slate-500">实时角球数据将在比赛开始后自动获取</p>
        </div>
      ) : (
        <div className="bg-[#0F1424] rounded-2xl border border-slate-800/80 overflow-hidden">
          <div className="grid grid-cols-[1fr_1fr_0.35fr_0.25fr_0.25fr_0.25fr_0.25fr_0.35fr_0.25fr_0.25fr_0.25fr] gap-2 px-4 py-3 text-[11px] text-slate-500 border-b border-slate-800 font-medium">
            <div>主队</div>
            <div>客队</div>
            <div className="text-center">时间</div>
            <div className="text-center">比分</div>
            <div className="text-center">主角</div>
            <div className="text-center">客角</div>
            <div className="text-center">盘口</div>
            <div className="text-center">赔率</div>
            <div className="text-center">数据源</div>
            <div className="text-center">策略</div>
            <div className="text-center">操作</div>
          </div>

          {displayData.map((row: any) => {
            const trig = Array.isArray(row.triggeredStrategies) ? row.triggeredStrategies : [];
            const hasSignal = trig.length > 0;
            const isHighlighted = selectedMatchId && String(row.matchId) === selectedMatchId;
            const hi = findTeamInfo(row.homeTeam);
            const ai = findTeamInfo(row.awayTeam);

            return (
              <div
                key={row.matchId}
                className={
                  "grid grid-cols-[1fr_1fr_0.35fr_0.25fr_0.25fr_0.25fr_0.25fr_0.35fr_0.25fr_0.25fr_0.25fr] gap-2 px-4 py-3 text-xs border-b border-slate-800/40 transition-colors " +
                  (isHighlighted
                    ? "ring-2 ring-emerald-500/60 bg-emerald-500/5"
                    : hasSignal
                    ? "bg-emerald-500/5 border-l-2 border-l-emerald-600/60"
                    : "hover:bg-slate-800/20")
                }
              >
                <div className="font-medium text-slate-200 truncate">
                  {isHighlighted && <span className="mr-0.5">🏆</span>}
                  {row.homeTeam || "--"}
                </div>
                <div className="text-slate-300 truncate">{row.awayTeam || "--"}</div>
                <div className="text-center text-slate-400 font-mono">{row.elapsedMinutes || 0}'</div>
                <div className="text-center text-slate-300 font-mono font-bold">
                  {row.homeScore ?? 0} - {row.awayScore ?? 0}
                </div>
                <div className="text-center text-emerald-400 font-mono">{row.homeCorners ?? 0}</div>
                <div className="text-center text-emerald-400 font-mono">{row.awayCorners ?? 0}</div>
                <div className="text-center text-blue-400 font-mono">
                  {(row.cornerHandicap ?? 0) > 0 ? "+" : ""}
                  {(row.cornerHandicap ?? 0).toFixed(2)}
                </div>
                <div className="text-center text-amber-400 font-mono">
                  {(row.cornerOdds ?? 0).toFixed(2)}
                </div>
                <div className="text-center">
                  {row._cornerSource === "xhr" ? (
                    <span className="text-emerald-400 text-[10px]" title="XHR 实时数据">●</span>
                  ) : row._cornerSource === "dom" ? (
                    <span className="text-amber-400 text-[10px]" title="DOM 解析数据">◐</span>
                  ) : (
                    <span className="text-slate-600 text-[10px]" title="回退数据">○</span>
                  )}
                </div>
                <div className="text-center">
                  {hasSignal ? (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 text-[10px] font-mono">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                      {trig.join(",")}
                    </span>
                  ) : (
                    <span className="text-slate-600">—</span>
                  )}
                </div>
                <div className="text-center">
                  <div className="flex items-center gap-1 justify-center">
                    <button type="button"
                      onClick={() => removeTrackedMatch(String(row.matchId))}
                      className="inline-flex items-center justify-center w-5 h-5 text-[10px] rounded bg-rose-500/20 hover:bg-rose-500/40 text-rose-400 hover:text-rose-300 transition-all"
                      title="取消追踪"
                    >
                      ×
                    </button>
                    <button type="button"
                      onClick={() => handleViewHistory(String(row.matchId))}
                      className="inline-flex items-center justify-center w-5 h-5 text-[10px] rounded bg-indigo-500/20 hover:bg-indigo-500/40 text-indigo-400 hover:text-indigo-300 transition-all"
                      title="查看历史"
                    >
                      <History className="w-2.5 h-2.5" />
                    </button>
                    {hi.id && ai.id ? (
                      <button type="button"
                        onClick={() => navigateToDashboard(hi.id, ai.id, hi.league, ai.league)}
                        className="inline-flex items-center gap-0.5 px-1.5 py-0.5 text-[10px] rounded bg-slate-700/50 hover:bg-slate-600 text-slate-400 hover:text-white transition-all"
                        title="跳转到 Dashboard 分析该场比赛"
                      >
                        <ExternalLink className="w-2.5 h-2.5" /> 分析
                      </button>
                    ) : (
                      <span className="text-[10px] text-slate-600">—</span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="flex items-center gap-4 text-[10px] text-slate-500">
        <span className="inline-flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-emerald-400" />策略触发
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="w-1 h-3 border-l-2 border-emerald-600/60" />触发行高亮
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="w-1 h-3 ring-2 ring-emerald-500/60" />追踪比赛
        </span>
        <span>自动刷新: {pollInterval / 1000}s</span>
      </div>
    </div>
  );
}
