import React, { useState } from "react";
import { ExternalLink, History, DollarSign, RefreshCw, X, Lock } from "lucide-react";
import { useAppStore } from "../../store/useAppStore";
import { useCornerStore } from "../../store/cornerStore";
import type { HandicapEntry } from "../../store/cornerStore";
/** 投注弹窗数据 */
interface BetPopupData {
  matchId: string;
  matchName: string;
  odds: number;
  handicap: number;
  strategyId: string;
}

/** 投注结果 */
interface BetResult {
  success: boolean;
  message: string;
}
import { REAL_TEAMS } from "../../data/realTeamsData";

// ==================== 盘口列映射 ====================

const columnMap: Record<string, string> = {
  "O/U_full_corner": "cornerOU",
  "O/U_half_corner": "cornerOUHalf",
  "HDP_full_corner": "cornerHDP",
  "HDP_half_corner": "cornerHDPHalf",
  "NEXT_full_corner": "nextCorner",
  "O/E_full_corner": "cornerOE",
  "HDP_full_hdp": "mainHDP",
  "HDP_full_main": "mainHDP",
  "O/U_full_ou": "mainOU",
  "O/U_full_main": "mainOU",
};

type ColumnKey = "cornerOU" | "cornerOUHalf" | "cornerHDP" | "cornerHDPHalf" | "nextCorner" | "cornerOE" | "mainHDP" | "mainOU";

const COLUMN_KEYS: ColumnKey[] = ["cornerOU", "cornerOUHalf", "cornerHDP", "cornerHDPHalf", "nextCorner", "cornerOE", "mainHDP", "mainOU"];

const COLUMN_HEADERS: Record<ColumnKey, string> = {
  cornerOU: "角球大小",
  cornerOUHalf: "角球大小/半",
  cornerHDP: "角球让球",
  cornerHDPHalf: "角球让球/半",
  nextCorner: "下个角球",
  cornerOE: "角球单双",
  mainHDP: "主盘让球",
  mainOU: "主盘大小",
};

/** 根据 category + period + marketGroup 生成 columnMap 的 key */
function getColumnKey(h: HandicapEntry): string | null {
  const key = `${h.category}_${h.period}_${h.marketGroup || ""}`;
  if (columnMap[key]) return columnMap[key];
  // fallback: 尝试不带 marketGroup
  const key2 = `${h.category}_${h.period}`;
  if (columnMap[key2]) return columnMap[key2];
  return null;
}

/** 将 handicaps 数组映射为 { columnKey -> HandicapEntry } */
function mapHandicapsToColumns(handicaps: HandicapEntry[]): Record<string, HandicapEntry> {
  const result: Record<string, HandicapEntry> = {};
  for (const h of handicaps) {
    const colKey = getColumnKey(h);
    if (colKey) {
      result[colKey] = h;
    }
  }
  return result;
}

/** 格式化赔率数字 */
function fmt(v: number | undefined | null): string {
  if (v == null || isNaN(v)) return "—";
  return v.toFixed(2);
}

/** 格式化盘口线 */
function fmtLine(v: number | string | undefined | null): string {
  if (v == null) return "—";
  return String(v);
}

// ==================== 单列赔率渲染 ====================

interface OddsCellProps {
  columnKey: ColumnKey;
  handicap?: HandicapEntry;
}

function OddsCell({ columnKey, handicap }: OddsCellProps) {
  const locked = (handicap as any)?.locked === true;
  const selected = (handicap as any)?.isSelected === true;

  if (!handicap) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-[11px]">
        <span className="text-slate-700">—</span>
        <span className="text-slate-700">—</span>
      </div>
    );
  }

  const odds = handicap.odds || {};
  const line = handicap.line;
  const textCls = locked ? "text-slate-600" : "";
  const oddsCls = locked ? "text-slate-600" : "text-red-400";
  const lineCls = locked ? "text-slate-600" : "text-slate-400";
  const bgCls = selected ? "bg-orange-100/20" : "";

  let topRow: React.ReactNode;
  let bottomRow: React.ReactNode;

  switch (columnKey) {
    case "cornerOU":
    case "cornerOUHalf":
    case "mainOU":
      topRow = (
        <span className={textCls}>
          <span className={lineCls}>大 {fmtLine(line)}</span>{" "}
          <span className={oddsCls}>{fmt(odds.over)}</span>
        </span>
      );
      bottomRow = (
        <span className={textCls}>
          <span className={lineCls}>小 {fmtLine(line)}</span>{" "}
          <span className={oddsCls}>{fmt(odds.under)}</span>
        </span>
      );
      break;
    case "cornerHDP":
    case "cornerHDPHalf":
    case "mainHDP":
      topRow = (
        <span className={textCls}>
          <span className={lineCls}>主 {fmtLine(line)}</span>{" "}
          <span className={oddsCls}>{fmt(odds.home)}</span>
        </span>
      );
      bottomRow = (
        <span className={textCls}>
          <span className={lineCls}>客 {fmtLine(line)}</span>{" "}
          <span className={oddsCls}>{fmt(odds.away)}</span>
        </span>
      );
      break;
    case "nextCorner":
      topRow = (
        <span className={textCls}>
          <span className={lineCls}>主</span>{" "}
          <span className={oddsCls}>{fmt(odds.home)}</span>
        </span>
      );
      bottomRow = (
        <span className={textCls}>
          <span className={lineCls}>客</span>{" "}
          <span className={oddsCls}>{fmt(odds.away)}</span>
        </span>
      );
      break;
    case "cornerOE":
      topRow = (
        <span className={textCls}>
          <span className={lineCls}>单</span>{" "}
          <span className={oddsCls}>{fmt(odds.odd)}</span>
        </span>
      );
      bottomRow = (
        <span className={textCls}>
          <span className={lineCls}>双</span>{" "}
          <span className={oddsCls}>{fmt(odds.even)}</span>
        </span>
      );
      break;
    default:
      topRow = <span className="text-slate-700">—</span>;
      bottomRow = <span className="text-slate-700">—</span>;
  }

  return (
    <div className={`flex flex-col items-center justify-center h-full text-[11px] leading-tight px-0.5 ${bgCls}`}>
      <div className="flex items-center gap-0.5">
        {topRow}
        {locked && <Lock className="w-2.5 h-2.5 text-slate-600 inline" />}
      </div>
      <div className="flex items-center gap-0.5">
        {bottomRow}
      </div>
    </div>
  );
}

// ==================== MatchRow 组件 ====================

interface MatchRowProps {
  row: any;
  isHighlighted: boolean;
  trackedMatchIds: string[];
  isRealMode: boolean;
  autoBetEnabled: boolean;
  betAmount: number;
  addTrackedMatch: (id: string) => void;
  removeTrackedMatch: (id: string) => void;
  handleViewHistory: (id: string) => void;
  openBetPopup: (row: any) => void;
  navigateToDashboard: (homeId: string, awayId: string, homeLeague: string, awayLeague: string) => void;
  findTeamInfo: (name: string) => { id: string; league: string };
}

function MatchRow({
  row,
  isHighlighted,
  trackedMatchIds,
  isRealMode,
  autoBetEnabled,
  betAmount,
  addTrackedMatch,
  removeTrackedMatch,
  handleViewHistory,
  openBetPopup,
  navigateToDashboard,
  findTeamInfo,
}: MatchRowProps) {
  const trig = Array.isArray(row.triggeredStrategies) ? row.triggeredStrategies : [];
  const hasSignal = trig.length > 0;
  const hi = findTeamInfo(row.homeTeam);
  const ai = findTeamInfo(row.awayTeam);

  // 将 handicaps 映射到8列
  const handicaps = row.handicaps || [];
  const colData = mapHandicapsToColumns(handicaps);

  const rowBgCls = isHighlighted
    ? "ring-2 ring-emerald-500/60 bg-emerald-500/5"
    : hasSignal
    ? "bg-emerald-500/5 border-l-2 border-l-emerald-600/60"
    : "hover:bg-slate-800/20";

  return (
    <div
      className={`grid grid-cols-[minmax(80px,1fr)_minmax(80px,1fr)_40px_44px_32px_32px_repeat(8,minmax(64px,0.8fr))_44px_64px] gap-0 items-center px-2 py-1.5 text-[11px] border-b border-slate-800/40 transition-colors ${rowBgCls}`}
    >
      {/* 主队 */}
      <div className="font-medium text-slate-200 truncate pr-1">
        {isHighlighted && <span className="mr-0.5">🏆</span>}
        {row.homeTeam || "--"}
      </div>
      {/* 客队 */}
      <div className="text-slate-300 truncate pr-1">{row.awayTeam || "--"}</div>
      {/* 时间 */}
      <div className="text-center text-slate-400 font-mono">{row.elapsedMinutes || 0}'</div>
      {/* 比分 */}
      <div className="text-center text-slate-300 font-mono font-bold">
        {row.homeScore ?? 0}-{row.awayScore ?? 0}
      </div>
      {/* 主角 */}
      <div className="text-center text-emerald-400 font-mono">{row.homeCorners ?? 0}</div>
      {/* 客角 */}
      <div className="text-center text-emerald-400 font-mono">{row.awayCorners ?? 0}</div>

      {/* 8列赔率 */}
      {COLUMN_KEYS.map((colKey) => (
        <OddsCell key={colKey} columnKey={colKey} handicap={colData[colKey]} />
      ))}

      {/* 策略 */}
      <div className="text-center">
        {hasSignal ? (
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 text-[10px] font-mono">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
            {trig.join(",")}
          </span>
        ) : (
          <span className="text-slate-600">—</span>
        )}
      </div>

      {/* 操作 */}
      <div className="text-center">
        <div className="flex items-center gap-0.5 justify-center">
          {trackedMatchIds.includes(String(row.matchId)) ? (
            <button type="button"
              onClick={() => removeTrackedMatch(String(row.matchId))}
              className="inline-flex items-center justify-center w-5 h-5 text-[10px] rounded bg-rose-500/20 hover:bg-rose-500/40 text-rose-400 hover:text-rose-300 transition-all"
              title={isRealMode && autoBetEnabled ? "取消追踪（将停止自动投注）" : "取消追踪"}
            >
              ×
            </button>
          ) : (
            <button type="button"
              onClick={() => addTrackedMatch(String(row.matchId))}
              className="inline-flex items-center justify-center w-5 h-5 text-[10px] rounded bg-emerald-500/20 hover:bg-emerald-500/40 text-emerald-400 hover:text-emerald-300 transition-all"
              title={isRealMode && autoBetEnabled ? "追踪比赛（允许自动投注）" : "追踪比赛"}
            >
              +
            </button>
          )}
          <button type="button"
            onClick={() => handleViewHistory(String(row.matchId))}
            className="inline-flex items-center justify-center w-5 h-5 text-[10px] rounded bg-indigo-500/20 hover:bg-indigo-500/40 text-indigo-400 hover:text-indigo-300 transition-all"
            title="查看历史"
          >
            <History className="w-2.5 h-2.5" />
          </button>
          {isRealMode && (
            <button type="button"
              onClick={() => openBetPopup(row)}
              className="inline-flex items-center justify-center w-5 h-5 text-[10px] rounded bg-amber-500/20 hover:bg-amber-500/40 text-amber-400 hover:text-amber-300 transition-all"
              title="手动投注"
            >
              <DollarSign className="w-2.5 h-2.5" />
            </button>
          )}
          {hi.id && ai.id ? (
            <button type="button"
              onClick={() => navigateToDashboard(hi.id, ai.id, hi.league, ai.league)}
              className="inline-flex items-center gap-0.5 px-1 py-0.5 text-[10px] rounded bg-slate-700/50 hover:bg-slate-600 text-slate-400 hover:text-white transition-all"
              title="跳转到 Dashboard 分析该场比赛"
            >
              <ExternalLink className="w-2.5 h-2.5" />
            </button>
          ) : (
            <span className="text-[10px] text-slate-600">—</span>
          )}
        </div>
      </div>
    </div>
  );
}

// ==================== LiveMonitor 主组件 ====================

export default function LiveMonitor() {
  const selectedMatchId = useAppStore((s) => s.selectedMatchId);
  const trackedMatchIds = useAppStore((s) => s.trackedMatchIds);
  const addTrackedMatch = useAppStore((s) => s.addTrackedMatch);
  const removeTrackedMatch = useAppStore((s) => s.removeTrackedMatch);
  const navigateToDashboard = useAppStore((s) => s.navigateToDashboard);
  const strategies = useCornerStore((s) => s.strategies) || [];
  const setActiveCornerTab = useCornerStore((s) => s.setActiveCornerTab);
  const setHistoryFilterMatchId = useCornerStore((s) => s.setHistoryFilterMatchId);
  const displayData = useCornerStore((s) => s.liveMatches);
  const isLoading = useCornerStore((s) => s.isLoading);
  const pollInterval = useCornerStore((s) => s.settings.pollInterval);
  const settings = useCornerStore((s) => s.settings);
  const isRealMode = settings.isRealMode;
  const betAmount = useCornerStore((s) => s.settings.betAmount);
  const refreshData = useCornerStore((s) => s.refreshData);
  const [searchText, setSearchText] = useState("");

  const findTeamInfo = (nameCn: string) => {
    const team = REAL_TEAMS.find((t) => t.nameCn === nameCn);
    return team ? { id: team.id, league: team.league } : { id: "", league: "" };
  };

  const enabledCount = Array.isArray(strategies) ? strategies.filter((s: any) => s.enabled).length : 0;

  const searchTerm = searchText.trim().toLowerCase();
  const filteredData = searchTerm
    ? displayData.filter((m) =>
        (m.homeTeam || "").toLowerCase().includes(searchTerm) ||
        (m.awayTeam || "").toLowerCase().includes(searchTerm)
      )
    : displayData;

  const handleViewHistory = (matchId: string) => {
    setHistoryFilterMatchId(matchId);
    setActiveCornerTab("history");
  };

  // 手动投注状态
  const [betPopup, setBetPopup] = useState<BetPopupData | null>(null);
  const [betInputAmount, setBetInputAmount] = useState(betAmount);
  const [betSubmitting, setBetSubmitting] = useState(false);
  const [betResult, setBetResult] = useState<BetResult | null>(null);

  const handleManualBet = async () => {
    if (!betPopup) return;
    setBetSubmitting(true);
    setBetResult(null);
    try {
      const resp = await fetch("/api/corner/bet/manual", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          matchId: betPopup.matchId,
          matchName: betPopup.matchName,
          strategyId: betPopup.strategyId,
          odds: betPopup.odds,
          handicap: betPopup.handicap,
          amount: betInputAmount
        })
      });
      const json = await resp.json();
      if (json.success) {
        setBetResult({ success: true, message: "投注已提交！betId: " + json.betId });
        setTimeout(() => { setBetPopup(null); setBetResult(null); }, 2000);
      } else {
        setBetResult({ success: false, message: json.error || "投注失败" });
      }
    } catch (err: any) {
      setBetResult({ success: false, message: err.message || "网络错误" });
    } finally {
      setBetSubmitting(false);
    }
  };

  const openBetPopup = (row: any) => {
    const trig = Array.isArray(row.triggeredStrategies) ? row.triggeredStrategies : [];
    setBetInputAmount(betAmount);
    setBetResult(null);
    setBetPopup({
      matchId: String(row.matchId),
      matchName: row.homeTeam + " vs " + row.awayTeam,
      odds: row.cornerOdds || 0,
      handicap: row.cornerHandicap || 0,
      strategyId: trig.length > 0 ? String(trig[0]) : "manual"
    });
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
              实时监控 {displayData.length > 0 && "(" + filteredData.length + "/" + displayData.length + "场)"}
            </h3>
          </div>
          {dataSourceBadge()}
          {trackedMatchIds.length > 0 && (
            <span className="text-[10px] text-emerald-500 bg-emerald-500/10 px-2 py-0.5 rounded">
              追踪 {trackedMatchIds.length} 场比赛
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <input type="text" value={searchText} onChange={(e) => setSearchText(e.target.value)} placeholder="搜索球队..."
              className="w-36 px-2.5 py-1.5 text-[11px] bg-slate-800/80 border border-slate-700/80 rounded-lg text-slate-300 placeholder-slate-500 focus:outline-none focus:border-emerald-500/50 transition-colors" />
            {searchText && (
              <button onClick={() => setSearchText("")} className="absolute right-1.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300">
                <X className="w-3 h-3" />
              </button>
            )}
          </div>
          <button type="button" onClick={() => refreshData()} disabled={isLoading}
            className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] bg-emerald-600/20 hover:bg-emerald-600/30 disabled:bg-slate-700/30 text-emerald-400 disabled:text-slate-500 rounded-lg border border-emerald-500/20 disabled:border-slate-600/30 transition-all">
            <RefreshCw className={"w-3 h-3" + (isLoading ? " animate-spin" : "")} />
            刷新
          </button>
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
      ) : filteredData.length === 0 ? (
        <div className="bg-[#0F1424] rounded-2xl border border-slate-800/80 p-12 text-center">
          <div className="text-4xl mb-3">🔍</div>
          <p className="text-base font-medium text-slate-300 mb-1">未找到匹配的比赛</p>
          <p className="text-sm text-slate-500">尝试其他搜索关键词</p>
        </div>
      ) : (
        <div className="bg-[#0F1424] rounded-2xl border border-slate-800/80 overflow-x-auto">
          {/* 表头 */}
          <div className="grid grid-cols-[minmax(80px,1fr)_minmax(80px,1fr)_40px_44px_32px_32px_repeat(8,minmax(64px,0.8fr))_44px_64px] gap-0 items-center px-2 py-2 text-[10px] text-slate-500 border-b border-slate-700/60 font-medium bg-slate-900/40">
            <div>主队</div>
            <div>客队</div>
            <div className="text-center">时间</div>
            <div className="text-center">比分</div>
            <div className="text-center">主角</div>
            <div className="text-center">客角</div>
            {COLUMN_KEYS.map((k) => (
              <div key={k} className="text-center">{COLUMN_HEADERS[k]}</div>
            ))}
            <div className="text-center">策略</div>
            <div className="text-center">操作</div>
          </div>

          {/* 数据行 */}
          {filteredData.map((row: any) => {
            const isHighlighted = selectedMatchId && String(row.matchId) === selectedMatchId;
            return (
              <MatchRow
                key={row.matchId}
                row={row}
                isHighlighted={isHighlighted}
                trackedMatchIds={trackedMatchIds}
                isRealMode={isRealMode}
                autoBetEnabled={settings.autoBetEnabled}
                betAmount={betAmount}
                addTrackedMatch={addTrackedMatch}
                removeTrackedMatch={removeTrackedMatch}
                handleViewHistory={handleViewHistory}
                openBetPopup={openBetPopup}
                navigateToDashboard={navigateToDashboard}
                findTeamInfo={findTeamInfo}
              />
            );
          })}
        </div>
      )}

      {betPopup && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-[#1a1f36] rounded-2xl border border-slate-700 w-96 p-6 shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-slate-200">{`手动投注`}</h3>
              <button onClick={() => setBetPopup(null)} className="text-slate-500 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="space-y-3 mb-4">
              <div>
                <label className="text-[10px] text-slate-500">{`比赛`}</label>
                <p className="text-xs text-slate-200 truncate">{betPopup.matchName}</p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] text-slate-500">{`盘口`}</label>
                  <p className="text-xs text-amber-400 font-mono">{betPopup.handicap}</p>
                </div>
                <div>
                  <label className="text-[10px] text-slate-500">{`赔率`}</label>
                  <p className="text-xs text-amber-400 font-mono">{betPopup.odds.toFixed(2)}</p>
                </div>
              </div>
              <div>
                <label className="text-[10px] text-slate-500">{`策略`}</label>
                <p className="text-xs text-emerald-400 font-mono">{betPopup.strategyId}</p>
              </div>
              <div>
                <label className="text-[10px] text-slate-500">{`投注金额`}</label>
                <input type="number" className="w-full bg-slate-900/80 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-amber-500/50" value={betInputAmount} min={10} max={100000} onChange={(e) => setBetInputAmount(Number(e.target.value))} />
              </div>
            </div>
            {betResult && (
              <p className={"text-xs mb-3 px-3 py-2 rounded " + (betResult.success ? "bg-emerald-500/15 text-emerald-400" : "bg-rose-500/15 text-rose-400")}>
                {betResult.message}
              </p>
            )}
            <div className="flex gap-2">
              <button onClick={() => setBetPopup(null)} className="flex-1 px-4 py-2 text-xs rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-300 transition-colors">
                {`取消`}
              </button>
              <button onClick={handleManualBet} disabled={betSubmitting || betInputAmount <= 0} className="flex-1 px-4 py-2 text-xs rounded-lg bg-amber-600 hover:bg-amber-500 text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
                {betSubmitting ? "提交中..." : "确认投注 ¥" + betInputAmount}
              </button>
            </div>
          </div>
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
          <span className="w-1 h-3 ring-2 ring-emerald-500/60" />追踪比赛{isRealMode && settings.autoBetEnabled ? "（自动投注）" : ""}
        </span>
        <span>自动刷新: {pollInterval / 1000}s</span>
      </div>
    </div>
  );
}
