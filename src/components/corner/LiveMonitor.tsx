import React from "react";
import { ExternalLink, History } from "lucide-react";
import { useAppStore } from "../../store/useAppStore";
import { useCornerStore } from "../../store/cornerStore";
import type { HandicapEntry } from "../../store/cornerStore";
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

  // 判断数据来源
  const firstMatch = displayData.length > 0 ? displayData[0] : null;
  const dataSource = firstMatch?._dataSource || "unknown";

  const dataSourceBadge = () => {
    if (dataSource === "inplay") {
      return <span className="text-[10px] text-green-400 bg-green-500/10 px-2 py-0.5 rounded border border-green-500/20">实时 In-Play</span>;
    } else if (dataSource === "today") {
      return <span className="text-[10px] text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20">赛程 Today</span>;
    }
    return null;
  };

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
          {dataSourceBadge()}
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
          <div className="grid grid-cols-[1fr_1fr_0.3fr_0.2fr_0.2fr_0.2fr_1fr_0.2fr_0.2fr] gap-1.5 px-3 py-2.5 text-[11px] text-slate-500 border-b border-slate-800 font-medium">
            <div>主队</div>
            <div>客队</div>
            <div className="text-center">时间</div>
            <div className="text-center">比分</div>
            <div className="text-center">主角</div>
            <div className="text-center">客角</div>
            <div className="text-center">盘口(8项)</div>
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
                  "grid grid-cols-[1fr_1fr_0.3fr_0.2fr_0.2fr_0.2fr_1fr_0.2fr_0.2fr] gap-1.5 px-3 py-2.5 text-xs border-b border-slate-800/40 transition-colors " +
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
                <div className="flex flex-wrap gap-1 items-start min-w-0">
                  {(row.handicaps && row.handicaps.length > 0) ? (
                    row.handicaps.map((h: HandicapEntry) => {
                      const colors: Record<string, string> = {
                        "O/U": h.period === "full" ? "bg-blue-600/20 text-blue-300 border-blue-500/30" : "bg-blue-400/10 text-blue-300/70 border-blue-400/20",
                        "HDP": h.period === "full" ? "bg-orange-600/20 text-orange-300 border-orange-500/30" : "bg-orange-400/10 text-orange-300/70 border-orange-400/20",
                        "1X2": h.period === "full" ? "bg-purple-600/20 text-purple-300 border-purple-500/30" : "bg-purple-400/10 text-purple-300/70 border-purple-400/20",
                        "O/E": h.period === "full" ? "bg-green-600/20 text-green-300 border-green-500/30" : "bg-green-400/10 text-green-300/70 border-green-400/20",
                      };
                      const colorClass = colors[h.category] || "bg-slate-700/30 text-slate-400 border-slate-600/30";
                      let shortLabel = h.categoryLabel;
                      if (shortLabel.length > 5) shortLabel = shortLabel.replace("上半场 ", "半");
                      
                      let displayVal = "";
                      if (h.category === "O/U" && h.line != null) {
                        displayVal = h.line + (h.odds ? "|" + (h.odds.over || 0).toFixed(2) : "");
                      } else if (h.category === "HDP" && h.line) {
                        displayVal = String(h.line) + (h.odds ? "|" + (h.odds.home || 0).toFixed(2) : "");
                      } else if (h.category === "1X2" && h.odds) {
                        displayVal = (h.odds.home || 0).toFixed(2);
                      } else if (h.category === "O/E" && h.odds) {
                        displayVal = (h.odds.odd || 0).toFixed(2);
                      }
                      
                      return (
                        <span key={h.order} className={"inline-flex items-center gap-0.5 px-1.5 py-0.5 text-[9px] rounded border " + colorClass} title={h.categoryLabel + ": " + JSON.stringify(h.odds || {})}>
                          <span className="font-medium">{shortLabel}</span>
                          {displayVal ? <span className="font-mono opacity-80">{displayVal}</span> : null}
                          {h.source === "xhr" ? <span className="text-[7px] text-emerald-400">●</span> : h.source === "fallback" ? <span className="text-[7px] text-slate-500">○</span> : null}
                        </span>
                      );
                    })
                  ) : (
                    <span className="text-slate-600 text-[10px]">N/A</span>
                  )}
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
