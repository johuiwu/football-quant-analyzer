import React, { useState, useMemo, useCallback, useEffect } from "react";
import { ExternalLink, History, RefreshCw, X, Lock } from "lucide-react";
import { useNavigate } from 'react-router-dom';
import { useAppStore } from "../../store/useAppStore";
import { useCornerStore } from "../../store/cornerStore";
import type { HandicapEntry } from "../../store/cornerStore";

import { useTeamTranslation } from '../../hooks/useTeamTranslation';
import { getTranslatedLeagueName } from '../../services/teamTranslatorService';

// ==================== 盘口分组配置 ====================

type OddsGroupKey = "cornerOU" | "cornerOUHalf" | "cornerHDP" | "cornerHDPHalf" | "nextCorner" | "corner1X2" | "corner1X2Half" | "cornerOE" | "cornerOEHalf";

const CORNER_ODDS_GROUPS: { key: OddsGroupKey; label: string; highlight?: boolean }[] = [
  { key: "cornerOU", label: "大小" },
  { key: "cornerOUHalf", label: "大小 半场" },
  { key: "cornerHDP", label: "让球" },
  { key: "cornerHDPHalf", label: "让球 半场" },
  { key: "nextCorner", label: "下一个角球", highlight: true },
  { key: "corner1X2", label: "独赢" },
  { key: "corner1X2Half", label: "独赢 半场" },
  { key: "cornerOE", label: "单/双" },
  { key: "cornerOEHalf", label: "单/双 半场" },
];

const columnMap: Record<string, OddsGroupKey> = {
  "O/U_full_corner": "cornerOU",
  "O/U_half_corner": "cornerOUHalf",
  "HDP_full_corner": "cornerHDP",
  "HDP_half_corner": "cornerHDPHalf",
  "NEXT_full_corner": "nextCorner",
  "1X2_full_corner": "corner1X2",
  "1X2_half_corner": "corner1X2Half",
  "O/E_full_corner": "cornerOE",
  "O/E_half_corner": "cornerOEHalf",
};

function getColumnKey(h: HandicapEntry): OddsGroupKey | null {
  const key = `${h.category}_${h.period}_${h.marketGroup || ""}`;
  if (columnMap[key]) return columnMap[key];
  const key2 = `${h.category}_${h.period}`;
  if (columnMap[key2]) return columnMap[key2];
  return null;
}

function mapHandicapsToColumns(handicaps: HandicapEntry[]): Record<string, HandicapEntry> {
  const result: Record<string, HandicapEntry> = {};
  for (const h of handicaps) {
    const colKey = getColumnKey(h);
    if (colKey) result[colKey] = h;
  }
  return result;
}

function fmt(v: number | undefined | null): string {
  if (v == null || isNaN(v) || v === 0) return "—";
  return v.toFixed(2);
}

function fmtLine(v: number | string | undefined | null): string {
  if (v == null) return "—";
  return String(v);
}

// ==================== 盘口分组卡片 ====================

interface OddsGroupCardProps {
  groupKey: OddsGroupKey;
  label: string;
  handicap?: HandicapEntry;
  highlight?: boolean;
  variant?: "corner" | "regular";
}

const OddsGroupCard = React.memo(function OddsGroupCard({ groupKey, label, handicap, highlight, variant = "corner" }: OddsGroupCardProps) {
  const locked = (handicap as any)?.locked === true;
  const selected = (handicap as any)?.isSelected === true;

  const borderCls = variant === "regular"
    ? "border-emerald-600/40 bg-emerald-900/10"
    : highlight
    ? "border-blue-500/60 bg-blue-500/5"
    : "border-slate-700/60 bg-slate-800/40";
  const headerBg = variant === "regular"
    ? "bg-emerald-700/30 text-emerald-300"
    : highlight
    ? "bg-blue-500/20 text-blue-300"
    : "bg-slate-700/60 text-slate-400";

  if (!handicap) {
    return (
      <div className={`rounded-lg border ${borderCls} overflow-hidden`}>
        <div className={`px-2 py-1 text-center text-[10px] font-medium ${headerBg}`}>{label}</div>
        <div className="grid grid-cols-2 divide-x divide-slate-700/40">
          <div className="px-2 py-1.5 text-center text-[11px] text-slate-600">—</div>
          <div className="px-2 py-1.5 text-center text-[11px] text-slate-600">—</div>
        </div>
      </div>
    );
  }

  const odds = handicap.odds || {};
  const line = handicap.line;
  const textCls = locked ? "text-slate-600" : "";
  const oddsCls = locked ? "text-slate-600" : "text-red-400";
  const lineCls = locked ? "text-slate-600" : "text-slate-400";
  const cellBg = selected ? "bg-orange-100/20" : "";

  let topLabel: string;
  let topValue: string;
  let bottomLabel: string;
  let bottomValue: string;

  switch (groupKey) {
    case "cornerOU":
    case "cornerOUHalf":
      topLabel = `大 ${fmtLine(line)}`;
      topValue = fmt(odds.over);
      bottomLabel = `小 ${fmtLine(line)}`;
      bottomValue = fmt(odds.under);
      break;
    case "cornerHDP":
    case "cornerHDPHalf":
      topLabel = `主 ${fmtLine(line)}`;
      topValue = fmt(odds.home);
      bottomLabel = `客 ${fmtLine(line)}`;
      bottomValue = fmt(odds.away);
      break;
    case "nextCorner":
      topLabel = "主";
      topValue = fmt(odds.home);
      bottomLabel = "客";
      bottomValue = fmt(odds.away);
      break;
    case "cornerOE":
      topLabel = "单";
      topValue = fmt(odds.odd);
      bottomLabel = "双";
      bottomValue = fmt(odds.even);
      break;
    default:
      topLabel = "—";
      topValue = "—";
      bottomLabel = "—";
      bottomValue = "—";
  }

  return (
    <div className={`rounded-lg border ${borderCls} overflow-hidden`}>
      <div className={`px-2 py-1 text-center text-[10px] font-medium ${headerBg}`}>{label}</div>
      <div className="grid grid-cols-2 divide-x divide-slate-700/40">
        <div className={`px-2 py-1.5 text-center ${cellBg}`}>
          <div className={`text-[10px] ${lineCls}`}>{topLabel}</div>
          <div className={`text-[12px] font-semibold ${oddsCls} flex items-center justify-center gap-0.5`}>
            {topValue}
            {locked && <Lock className="w-2.5 h-2.5 text-slate-600" />}
          </div>
        </div>
        <div className={`px-2 py-1.5 text-center ${cellBg}`}>
          <div className={`text-[10px] ${lineCls}`}>{bottomLabel}</div>
          <div className={`text-[12px] font-semibold ${oddsCls} flex items-center justify-center gap-0.5`}>
            {bottomValue}
            {locked && <Lock className="w-2.5 h-2.5 text-slate-600" />}
          </div>
        </div>
      </div>
    </div>
  );
});

// ==================== 常规盘口表格（按源网站风格：盘口线横排，主/客或大/小竖排） ====================

const REGULAR_BORDER = "border-emerald-600/40 bg-emerald-900/10";
const REGULAR_HEADER = "bg-emerald-700/30 text-emerald-300";

/** 紧凑型表格：让球或大小球，盘口线横排在顶部，赔率竖排在下方 */
const RegularMarketTable = React.memo(function RegularMarketTable({
  title,
  fullItems,
  halfItems,
  type,
}: {
  title: string;
  fullItems: HandicapEntry[];
  halfItems: HandicapEntry[];
  type: "HDP" | "O/U";
}) {
  if (fullItems.length === 0 && halfItems.length === 0) return null;

  const isOU = type === "O/U";
  // 合并盘口线去重：先全场，后半场
  const seen = new Set<string>();
  const allLines: string[] = [];
  for (const h of fullItems) {
    const key = String(h.line);
    if (!seen.has(key)) { seen.add(key); allLines.push(key); }
  }
  for (const h of halfItems) {
    const key = String(h.line);
    if (!seen.has(key)) { seen.add(key); allLines.push(key); }
  }

  // 根据盘口线查找到对应赔率
  const findItem = (items: HandicapEntry[], line: string, side: "top" | "bottom") => {
    const item = items.find((h) => String(h.line) === line);
    if (!item) return undefined;
    if (isOU) return side === "top" ? item.odds?.over : item.odds?.under;
    return side === "top" ? item.odds?.home : item.odds?.away;
  };

  return (
    <div className={`rounded-lg border ${REGULAR_BORDER} overflow-hidden`}>
      <div className={`px-2 py-1 text-[10px] font-medium ${REGULAR_HEADER} text-center`}>{title}</div>
      <table className="w-full text-[11px] table-fixed">
        <thead>
          {/* 盘口线横排表头（全场+半场分组） */}
          <tr>
            <th className="px-1 py-1 text-[9px] text-slate-500 font-normal w-12 text-center">—</th>
            {fullItems.length > 0 && (
              <th colSpan={fullItems.length} className="px-1 py-0.5 text-[9px] text-emerald-400/70 font-normal border-l border-emerald-700/20 text-center">全场</th>
            )}
            {halfItems.length > 0 && (
              <th colSpan={halfItems.length} className="px-1 py-0.5 text-[9px] text-emerald-400/70 font-normal border-l border-emerald-700/20 text-center">半场</th>
            )}
          </tr>
          <tr className="border-t border-emerald-700/30">
            <th className="px-1 py-0.5 text-[9px] text-slate-500 font-normal w-12 text-center">{isOU ? "大小" : "让球"}</th>
            {fullItems.map((h, i) => (
              <th key={`f-${i}`} className="px-1 py-0.5 text-[10px] text-emerald-300/80 font-semibold text-center border-l border-emerald-700/20">
                {fmtLine(h.line)}
              </th>
            ))}
            {halfItems.map((h, i) => (
              <th key={`h-${i}`} className="px-1 py-0.5 text-[10px] text-emerald-300/80 font-semibold text-center border-l border-emerald-700/20">
                {fmtLine(h.line)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {/* 第一行：主 / 大 */}
          <tr className="border-t border-emerald-700/20">
            <td className="px-1 py-0.5 text-[10px] text-slate-400 text-center font-medium">{isOU ? "大" : "主"}</td>
            {fullItems.map((h, i) => {
              const locked = (h as any)?.locked === true;
              const val = isOU ? h.odds?.over : h.odds?.home;
              return (
                <td key={`f-top-${i}`} className="px-1 py-0.5 text-center font-semibold border-l border-emerald-700/20">
                  <div className={`text-[12px] ${locked ? "text-slate-600" : "text-red-400"}`}>{fmt(val)}</div>
                </td>
              );
            })}
            {halfItems.map((h, i) => {
              const locked = (h as any)?.locked === true;
              const val = isOU ? h.odds?.over : h.odds?.home;
              return (
                <td key={`h-top-${i}`} className="px-1 py-0.5 text-center font-semibold border-l border-emerald-700/20">
                  <div className={`text-[12px] ${locked ? "text-slate-600" : "text-red-400"}`}>{fmt(val)}</div>
                </td>
              );
            })}
          </tr>
          {/* 第二行：客 / 小 */}
          <tr className="border-t border-emerald-700/20">
            <td className="px-1 py-0.5 text-[10px] text-slate-400 text-center font-medium">{isOU ? "小" : "客"}</td>
            {fullItems.map((h, i) => {
              const locked = (h as any)?.locked === true;
              const val = isOU ? h.odds?.under : h.odds?.away;
              return (
                <td key={`f-bot-${i}`} className="px-1 py-0.5 text-center font-semibold border-l border-emerald-700/20">
                  <div className={`text-[12px] ${locked ? "text-slate-600" : "text-red-400"}`}>{fmt(val)}</div>
                </td>
              );
            })}
            {halfItems.map((h, i) => {
              const locked = (h as any)?.locked === true;
              const val = isOU ? h.odds?.under : h.odds?.away;
              return (
                <td key={`h-bot-${i}`} className="px-1 py-0.5 text-center font-semibold border-l border-emerald-700/20">
                  <div className={`text-[12px] ${locked ? "text-slate-600" : "text-red-400"}`}>{fmt(val)}</div>
                </td>
              );
            })}
          </tr>
        </tbody>
      </table>
    </div>
  );
});

/** 1X2 独赢表格 */
const Regular1X2Table = React.memo(function Regular1X2Table({
  title,
  items,
}: {
  title: string;
  items: HandicapEntry[];
}) {
  if (items.length === 0) return null;

  return (
    <div className={`rounded-lg border ${REGULAR_BORDER} overflow-hidden`}>
      <div className={`px-2 py-1 text-[10px] font-medium ${REGULAR_HEADER}`}>{title}</div>
      <table className="w-full text-[11px]">
        <thead>
          <tr className="border-t border-emerald-700/30">
            <th className="px-1.5 py-0.5 text-[9px] text-slate-500 font-normal w-6 text-center">—</th>
            {items.map((h, i) => (
              <th key={i} className="px-1.5 py-0.5 text-[10px] text-emerald-300/80 font-semibold text-center">
                {h.categoryLabel || "独赢"}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          <tr className="border-t border-emerald-700/20">
            <td className="px-1.5 py-0.5 text-[9px] text-slate-500 text-center">主</td>
            {items.map((h, i) => (
              <td key={i} className="px-1.5 py-0.5 text-center font-semibold text-red-400">{fmt(h.odds?.home)}</td>
            ))}
          </tr>
          <tr className="border-t border-emerald-700/20">
            <td className="px-1.5 py-0.5 text-[9px] text-slate-500 text-center">平</td>
            {items.map((h, i) => (
              <td key={i} className="px-1.5 py-0.5 text-center font-semibold text-red-400">{fmt(h.odds?.draw)}</td>
            ))}
          </tr>
          <tr className="border-t border-emerald-700/20">
            <td className="px-1.5 py-0.5 text-[9px] text-slate-500 text-center">客</td>
            {items.map((h, i) => (
              <td key={i} className="px-1.5 py-0.5 text-center font-semibold text-red-400">{fmt(h.odds?.away)}</td>
            ))}
          </tr>
        </tbody>
      </table>
    </div>
  );
});

// ==================== 翻译子组件 ====================

function TranslatedTeamName({ name }: { name: string }) {
  const { translated } = useTeamTranslation(name);
  return <>{translated}</>;
}

function TranslatedLeagueName({ name }: { name: string }) {
  const [translated, setTranslated] = useState(name);
  useEffect(() => {
    if (!name) return;
    let cancelled = false;
    getTranslatedLeagueName(name).then(r => { if (!cancelled) setTranslated(r); }).catch(() => {});
    return () => { cancelled = true; };
  }, [name]);
  return <>{translated}</>;
}

// ==================== 比赛卡片 ====================

interface MatchCardProps {
  row: any;
  isHighlighted: boolean;
  trackedMatchIds: string[];
  addTrackedMatch: (id: string) => void;
  removeTrackedMatch: (id: string) => void;
  handleViewHistory: (id: string) => void;
  navigateToDashboard: (homeId: string, awayId: string, homeLeague: string, awayLeague: string) => void;
  findTeamInfo: (name: string) => { id: string; league: string };
}

const MatchCard = React.memo(function MatchCard({
  row,
  isHighlighted,
  trackedMatchIds,
  addTrackedMatch,
  removeTrackedMatch,
  handleViewHistory,
  navigateToDashboard,
  findTeamInfo,
}: MatchCardProps) {
  const trig = Array.isArray(row.triggeredStrategies) ? row.triggeredStrategies : [];
  const hasSignal = trig.length > 0;
  const hi = findTeamInfo(row.homeTeam);
  const ai = findTeamInfo(row.awayTeam);

  const handicaps = row.handicaps || [];
  // 调试：打印 handicaps 中所有 marketGroup 和 category
  if (handicaps.length > 0) {
    const groups = new Set(handicaps.map((h: HandicapEntry) => `${h.marketGroup || 'undefined'}:${h.category}`));
    const mg = Array.from(groups).join(', ');
    console.debug(`[LiveMonitor] ${row.homeTeam} vs ${row.awayTeam}: ${handicaps.length}条盘口 [${mg}]`);
  }
  const cornerMarkets = handicaps.filter((h: HandicapEntry) => h.marketGroup === "corner");
  const regularMarkets = handicaps.filter((h: HandicapEntry) =>
    (h.marketGroup !== "corner" || !h.marketGroup) && (h.category === "O/U" || h.category === "HDP" || h.category === "1X2")
  );
  const colData = mapHandicapsToColumns(cornerMarkets);

  // 按类别+周期归类常规盘口
  const hdpFull = regularMarkets.filter((h: HandicapEntry) => h.category === "HDP" && h.period === "full");
  const hdpHalf = regularMarkets.filter((h: HandicapEntry) => h.category === "HDP" && h.period === "half");
  const ouFull = regularMarkets.filter((h: HandicapEntry) => h.category === "O/U" && h.period === "full");
  const ouHalf = regularMarkets.filter((h: HandicapEntry) => h.category === "O/U" && h.period === "half");
  const x2Full = regularMarkets.filter((h: HandicapEntry) => h.category === "1X2" && h.period === "full");
  const x2Half = regularMarkets.filter((h: HandicapEntry) => h.category === "1X2" && h.period === "half");
  const hasRegularMarkets = regularMarkets.length > 0;

  const cardBorder = isHighlighted
    ? "border-emerald-500/60 bg-emerald-500/5"
    : hasSignal
    ? "border-emerald-600/40 bg-emerald-500/5"
    : "border-slate-700/60 bg-slate-800/30 hover:bg-slate-800/50";

  return (
    <div data-match-id={row.matchId} className={`rounded-xl border ${cardBorder} p-3 transition-colors`}>
      {/* 比赛信息 */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          {isHighlighted && <span className="text-sm">🏆</span>}
          <div>
            <div className="text-sm font-semibold text-slate-200">
              <TranslatedTeamName name={row.homeTeam || "--"} /> <span className="text-slate-500 mx-1">vs</span> <TranslatedTeamName name={row.awayTeam || "--"} />
            </div>
            <div className="text-[10px] text-slate-500 mt-0.5">
              <TranslatedLeagueName name={row.league || ""} /> {row.elapsedMinutes ? `· ${row.elapsedMinutes}'` : ""}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="text-center">
            <div className="text-lg font-bold text-slate-200 font-mono">
              {row.homeScore ?? 0} - {row.awayScore ?? 0}
            </div>
            <div className="text-[10px] text-emerald-400 font-mono">
              角 {row.homeCorners ?? 0} - {row.awayCorners ?? 0}
            </div>
          </div>
          {hasSignal && (
            <div className="flex flex-wrap gap-1">
              {trig.map((sid) => (
                <span key={sid} className="px-2 py-0.5 text-[10px] font-medium bg-emerald-500/10 text-emerald-400 rounded-full border border-emerald-500/20">
                  策略{sid}
                </span>
              ))}
            </div>
          )}
          <div className="flex items-center gap-1">
            {trackedMatchIds.includes(String(row.matchId)) ? (
              <button
                onClick={() => removeTrackedMatch(String(row.matchId))}
                className="px-2 py-1 text-[10px] rounded bg-rose-500/20 hover:bg-rose-500/40 text-rose-400 transition-all"
                title="取消追踪"
              >
                取消追踪
              </button>
            ) : (
              <button
                onClick={() => addTrackedMatch(String(row.matchId))}
                className="px-2 py-1 text-[10px] rounded bg-emerald-500/20 hover:bg-emerald-500/40 text-emerald-400 transition-all"
                title="追踪比赛"
              >
                追踪
              </button>
            )}
            <button
              onClick={() => handleViewHistory(String(row.matchId))}
              className="p-1 rounded bg-indigo-500/20 hover:bg-indigo-500/40 text-indigo-400 transition-all"
              title="查看历史"
            >
              <History className="w-3 h-3" />
            </button>
            {hi.id && ai.id && (
              <button
                onClick={() => navigateToDashboard(hi.id, ai.id, hi.league, ai.league)}
                className="p-1 rounded bg-slate-700/50 hover:bg-slate-600 text-slate-400 transition-all"
                title="跳转到 Dashboard"
              >
                <ExternalLink className="w-3 h-3" />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* 角球盘口分组 */}
      <div className="grid grid-cols-8 gap-2">
        {CORNER_ODDS_GROUPS.map((group) => (
          <OddsGroupCard
            key={group.key}
            groupKey={group.key}
            label={group.label}
            handicap={colData[group.key]}
            highlight={group.highlight}
            variant="corner"
          />
        ))}
      </div>

      {/* 常规盘口分组（让球/大小球） - 紧凑型：全场+半场同行展示 */}
      {hasRegularMarkets && (
        <div className="mt-2">
          <div className="text-[10px] text-emerald-400/80 font-medium mb-1">常规盘口</div>
          <div className="flex gap-2">
            {/* 左栏：让球 */}
            <div className="flex-1">
              <RegularMarketTable title="让球" fullItems={hdpFull} halfItems={hdpHalf} type="HDP" />
            </div>
            {/* 右栏：大小球 */}
            <div className="flex-1">
              <RegularMarketTable title="大小球" fullItems={ouFull} halfItems={ouHalf} type="O/U" />
            </div>
          </div>
          {/* 1X2 独赢（如有） */}
          {(x2Full.length > 0 || x2Half.length > 0) && (
            <div className="mt-1.5 space-y-1.5">
              <Regular1X2Table title="独赢 (全场)" items={x2Full} />
              <Regular1X2Table title="独赢 (半场)" items={x2Half} />
            </div>
          )}
        </div>
      )}
    </div>
  );
});

// ==================== LiveMonitor 主组件 ====================

export default function LiveMonitor() {
  const navigate = useNavigate();
  const teams = useAppStore((s) => s.teams);
  const selectedMatchId = useAppStore((s) => s.selectedMatchId);
  const trackedMatchIds = useAppStore((s) => s.trackedMatchIds);
  const addTrackedMatch = useAppStore((s) => s.addTrackedMatch);
  const removeTrackedMatch = useAppStore((s) => s.removeTrackedMatch);
  const navigateToDashboardStore = useAppStore((s) => s.navigateToDashboard);
  const navigateToDashboard = useCallback((homeId: string, awayId: string, homeLeague: string, awayLeague: string) => {
    navigateToDashboardStore(homeId, awayId, homeLeague, awayLeague);
    navigate('/dashboard');
  }, [navigateToDashboardStore, navigate]);
  const strategies = useCornerStore((s) => s.strategies) || [];
  const setActiveCornerTab = useCornerStore((s) => s.setActiveCornerTab);
  const setHistoryFilterMatchId = useCornerStore((s) => s.setHistoryFilterMatchId);
  const displayData = useCornerStore((s) => s.liveMatches);
  const isLoading = useCornerStore((s) => s.isLoading);
  const pollInterval = useCornerStore((s) => s.settings.pollInterval);
  const settings = useCornerStore((s) => s.settings);
  const refreshData = useCornerStore((s) => s.refreshData);
  const [searchText, setSearchText] = useState("");

  // 初次加载时获取数据（轮询由 cornerStore.startMonitor 的 schedulePoll 统一管理）
  useEffect(() => {
    if (displayData.length === 0) refreshData();
  }, []);

  const findTeamInfo = (nameCn: string) => {
    const team = teams.find((t) => t.nameCn === nameCn);
    return team ? { id: team.id, league: team.league } : { id: "", league: "" };
  };

  const enabledCount = Array.isArray(strategies) ? strategies.filter((s: any) => s.enabled).length : 0;

  const searchTerm = searchText.trim().toLowerCase();
  const filteredData = useMemo(() =>
    searchTerm
      ? displayData.filter((m) =>
          (m.homeTeam || "").toLowerCase().includes(searchTerm) ||
          (m.awayTeam || "").toLowerCase().includes(searchTerm)
        )
      : displayData,
    [displayData, searchTerm]
  );

  const handleViewHistory = useCallback((matchId: string) => {
    setHistoryFilterMatchId(matchId);
    setActiveCornerTab("history");
  }, [setHistoryFilterMatchId, setActiveCornerTab]);

  if (isLoading && displayData.length === 0) {
    return (
      <div className="bg-[#0F1424] rounded-2xl border border-slate-800/80 p-12 text-center">
        <div className="w-6 h-6 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
        <p className="text-sm text-slate-400">加载角球数据中...</p>
      </div>
    );
  }

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
          {trackedMatchIds.length > 0 && (() => {
            const liveMatchIds = new Set(displayData.map((m: any) => String(m.matchId || "")));
            const effectiveCount = trackedMatchIds.filter((id: string) => liveMatchIds.has(id)).length;
            return effectiveCount > 0 ? (
              <span className="text-[10px] text-emerald-500 bg-emerald-500/10 px-2 py-0.5 rounded">
                追踪 {effectiveCount} 场比赛
              </span>
            ) : null;
          })()}
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
        <div className="space-y-3">
          {filteredData.map((row: any) => {
            const isHighlighted = selectedMatchId && String(row.matchId) === selectedMatchId;
            return (
              <MatchCard
                key={row.matchId}
                row={row}
                isHighlighted={isHighlighted}
                trackedMatchIds={trackedMatchIds}
                addTrackedMatch={addTrackedMatch}
                removeTrackedMatch={removeTrackedMatch}
                handleViewHistory={handleViewHistory}
                navigateToDashboard={navigateToDashboard}
                findTeamInfo={findTeamInfo}
              />
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
