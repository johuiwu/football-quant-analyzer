import React, { useState, useMemo } from "react";
import { Settings, RotateCcw, ChevronDown, ChevronUp, Power, BarChart3, Trash2, AlertTriangle } from "lucide-react";
import { useCornerStore, CornerStrategy, BacktestStats } from "../../store/cornerStore";
import SettingsPanel from "./SettingsPanel";

const numInputClass = "w-full bg-slate-900/80 border border-slate-700 rounded px-2.5 py-1.5 text-xs text-slate-200 font-mono focus:outline-none focus:border-emerald-500/50 transition-colors text-center";
const labelClass = "text-[11px] text-slate-400 mb-1 block font-sans";
const hintClass = "text-[9px] text-slate-600 italic mt-0.5 block font-sans";
const sectionTitleClass = "text-xs font-semibold text-slate-300 mb-2 pb-1 border-b border-slate-800/60 font-sans";
const errorClass = "text-[9px] text-rose-400 mt-0.5 block font-sans";

// 默认值映射（用于显示"默认: X"提示）—— 使用新字段名
const DEFAULT_VALUES: Record<string, Record<string, number | string>> = {
  "1": { minute_min: 35, minute_max: 55, leadGoals: 99, leadGoalsWeak: 0, line_min: 7.5, line_max: 11.5, odds_min: 0.8, odds_max: 1.2, corner_min: 0, corner_max: 99, leadSide: "any", direction: "Over", market_type: "over_under", period: "full", aiFilterEnabled: false },
  "2": { minute_min: 50, minute_max: 77, leadGoals: 3, leadGoalsWeak: 1, line_min: -1.5, line_max: 1.5, odds_min: 0.8, odds_max: 1.3, corner_min: 0, corner_max: 99, leadSide: "strong", direction: "Auto", market_type: "handicap", period: "full", aiFilterEnabled: false },
  "3": { minute_min: 70, minute_max: 90, leadGoals: 0, leadGoalsWeak: 0, line_min: 7.5, line_max: 10.5, odds_min: 0.6, odds_max: 0.9, corner_min: 0, corner_max: 99, leadSide: "any", direction: "Under", market_type: "over_under", period: "full", aiFilterEnabled: false },
  "4": { minute_min: 60, minute_max: 80, leadGoals: 2, leadGoalsWeak: 1, line_min: 7.5, line_max: 11.5, odds_min: 0.8, odds_max: 1.3, corner_min: 0, corner_max: 99, leadSide: "strong", direction: "Over", market_type: "over_under", period: "full", aiFilterEnabled: false },
  "5": { minute_min: 75, minute_max: 99, leadGoals: 99, leadGoalsWeak: 0, line_min: 0, line_max: 0, odds_min: 0.8, odds_max: 1.0, corner_min: 0, corner_max: 99, leadSide: "any", direction: "Auto", market_type: "next_corner", period: "full", aiFilterEnabled: false },
  "6": { minute_min: 55, minute_max: 70, leadGoals: 1, leadGoalsWeak: 1, line_min: -1.5, line_max: 1.5, odds_min: 0.9, odds_max: 1.3, corner_min: 0, corner_max: 99, leadSide: "weak", direction: "Auto", market_type: "handicap", period: "full", aiFilterEnabled: false },
  "7": { minute_min: 60, minute_max: 80, leadGoals: 99, leadGoalsWeak: 0, line_min: 7.5, line_max: 10.5, odds_min: 0.9, odds_max: 1.2, corner_min: 3, corner_max: 5, leadSide: "any", direction: "Over", market_type: "over_under", period: "full", aiFilterEnabled: false },
};

function formatDefault(key: string, val: number | string): string {
  if (typeof val === "number") {
    return Number.isInteger(val) ? String(val) : val.toFixed(2);
  }
  const labels: Record<string, string> = { any: "任意", strong: "强队", weak: "弱队", Over: "大", Under: "小", Home: "主队", Away: "客队", Auto: "自动", over_under: "大小球", handicap: "让球", next_corner: "下一个角球", "1x2": "独赢", auto: "自动", full: "全场", half: "半场" };
  return labels[val] || val;
}

function validateStrategy(s: CornerStrategy): string[] {
  const errors: string[] = [];
  // NaN 防御 + 范围校验
  if (!Number.isFinite(s.minute_min) || !Number.isFinite(s.minute_max)) {
    errors.push("时间值无效");
  } else {
    if (s.minute_min >= s.minute_max) errors.push("开始时间须小于结束时间");
    if (s.minute_min < 0 || s.minute_max > 120) errors.push("时间范围须在0-120分钟内");
  }
  if (!Number.isFinite(s.line_min) || !Number.isFinite(s.line_max)) {
    errors.push("盘口值无效");
  } else if (s.line_min > s.line_max) {
    errors.push("盘口下限不能大于上限");
  }
  if (!Number.isFinite(s.odds_min) || !Number.isFinite(s.odds_max)) {
    errors.push("赔率值无效");
  } else {
    if (s.odds_min > s.odds_max) errors.push("最低赔率不能大于最高赔率");
    if (s.odds_min < 0.5 || s.odds_max > 2.0) errors.push("赔率范围须在0.5-2.0内");
  }
  if (!Number.isFinite(s.corner_min) || !Number.isFinite(s.corner_max)) {
    errors.push("角球数值无效");
  } else {
    if (s.corner_min > s.corner_max) errors.push("角球数下限不能大于上限");
    if (s.corner_min < 0 || s.corner_max > 30) errors.push("角球数范围须在0-30内");
  }
  // leadGoals 哨兵值(>=90)时不参与 leadGoalsWeak 比较
  if (s.leadGoals < 90 && s.leadGoalsWeak > 0 && s.leadGoals < s.leadGoalsWeak) {
    errors.push("弱队领先不能大于领先球数上限");
  }
  return errors;
}

export default function StrategyConfigPanel() {
  const strategies = useCornerStore((s) => s.strategies);
  const updateStrategy = useCornerStore((s) => s.updateStrategy);
  const setStrategies = useCornerStore((s) => s.setStrategies);
  const backtestResults = useCornerStore((s) => s.backtestResults);
  const setBacktestResults = useCornerStore((s) => s.setBacktestResults);
  const [expandedIds, setExpandedIds] = useState<Set<number>>(new Set());
  const [backtesting, setBacktesting] = useState(false);
  const [isSimulated, setIsSimulated] = useState(false);
  const [simulatedWarning, setSimulatedWarning] = useState("");

  const toggleExpand = (id: number) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const handleResetDefaults = async () => {
    if (!window.confirm("确定要加载默认策略吗？当前所有策略配置将被覆盖。")) return;
    try {
      const res = await fetch("/api/corner/strategies/default");
      const data = await res.json();
      if (data.success && Array.isArray(data.data)) {
        setStrategies(data.data);
      } else {
        alert("加载默认策略失败：" + (data.message || "未知错误"));
      }
    } catch (err) {
      console.error("加载默认策略失败:", err);
      alert("加载默认策略失败，请检查网络连接");
    }
  };
  const handleToggle = (id: number, enabled: boolean) => updateStrategy(id, { enabled });
  const handleChange = (id: number, field: keyof CornerStrategy, value: number | string | boolean) => {
    // NaN 防御：数值类型非有限值不写入 store
    if (typeof value === "number" && !Number.isFinite(value)) return;
    updateStrategy(id, { [field]: value } as any);
  };

  const runBacktest = async () => {
    // 前置校验：有校验错误时阻止回测
    const enabledStrategies = strategies.filter(s => s.enabled);
    const hasErrors = enabledStrategies.some(s => validateStrategy(s).length > 0);
    if (hasErrors) {
      alert("请先修复策略配置错误后再运行回测");
      return;
    }
    setBacktesting(true);
    setBacktestResults({});
    setIsSimulated(false);
    setSimulatedWarning("");
    try {
      const res = await fetch("/api/corner/backtest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ strategies: enabledStrategies }),
      });
      const data = await res.json();
      if (data.success && data.stats) {
        setBacktestResults(data.stats);
        setIsSimulated(data.simulated === true);
        setSimulatedWarning(data.warning || "");
      } else {
        alert("回测失败：" + (data.message || "未知错误"));
      }
    } catch (err) {
      console.error("回测失败:", err);
      alert("回测请求失败，请检查网络连接");
    } finally {
      setBacktesting(false);
    }
  };

  const handleResetBacktest = async () => {
    if (!window.confirm("确定要清除所有运行回测生成的模拟数据吗？此操作不可恢复！")) return;
    try {
      const res = await fetch("/api/corner/reset-backtest", { method: "DELETE" });
      const data = await res.json();
      if (data.success) {
        setBacktestResults({});
      } else {
        console.error("[StrategyConfig] 重置回测失败:", data.error);
        alert("重置失败: " + (data.error || "未知错误"));
      }
    } catch (err) {
      console.error("[StrategyConfig] 重置回测数据失败:", err);
      alert("重置请求失败，请检查后端服务是否运行");
    }
  };

  // 检测策略间方向冲突（仅当时间窗口、比分条件、盘口范围均有重叠时才算冲突）
  const directionConflicts = useMemo(() => {
    const conflicts: string[] = [];
    const enabled = strategies.filter(s => s.enabled);
    for (let i = 0; i < enabled.length; i++) {
      for (let j = i + 1; j < enabled.length; j++) {
        const a = enabled[i], b = enabled[j];
        // 不同 market_type 不算冲突（不同市场不会同时触发同一投注）
        if (a.market_type !== b.market_type) continue;
        // 不同 period 不算冲突
        if (a.period !== b.period) continue;
        // leadSide 互斥不算冲突
        if ((a.leadSide === "strong" && b.leadSide === "weak") ||
            (a.leadSide === "weak" && b.leadSide === "strong")) continue;
        // 时间窗口重叠
        if (a.minute_min <= b.minute_max && b.minute_min <= a.minute_max) {
          // 方向冲突
          if ((a.direction === "Over" && b.direction === "Under") ||
              (a.direction === "Under" && b.direction === "Over")) {
            // 比分条件重叠检查：leadGoals>=90 为哨兵值（不限比分），否则检查范围是否有交集
            const aMin = a.leadGoalsWeak ?? 0, aMax = a.leadGoals >= 90 ? Infinity : a.leadGoals;
            const bMin = b.leadGoalsWeak ?? 0, bMax = b.leadGoals >= 90 ? Infinity : b.leadGoals;
            const scoreOverlap = aMin <= bMax && bMin <= aMax;
            if (!scoreOverlap) continue;
            // 盘口范围重叠检查
            const hcpOverlap = a.line_min <= b.line_max && b.line_min <= a.line_max;
            if (!hcpOverlap) continue;
            conflicts.push(`策略${a.id}与策略${b.id}: Over/Under方向冲突`);
          }
        }
      }
    }
    return conflicts;
  }, [strategies]);

  return (
    <div className="space-y-4 font-sans">
      {/* 头部 */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <Settings className="w-5 h-5 text-emerald-400" />
          <h3 className="text-sm font-semibold text-slate-200">角球策略配置</h3>
        </div>
        <div className="flex items-center gap-2">
          <button type="button"
            onClick={runBacktest}
            disabled={backtesting}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg transition-colors disabled:opacity-50"
          >
            <BarChart3 className="w-3 h-3" />
            {backtesting ? "回测中..." : "运行回测"}
          </button>
          <button type="button"
            onClick={handleResetBacktest}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-rose-900/50 hover:bg-rose-800/50 text-rose-400 rounded-lg border border-rose-800/50 transition-colors"
            title="清除所有回测生成的模拟数据"
          >
            <Trash2 className="w-3 h-3" />
            重置回测数据
          </button>
          <button type="button"
            onClick={handleResetDefaults}
            className="flex items-center gap-1 px-3 py-1.5 text-xs text-slate-400 hover:text-white bg-slate-800/50 hover:bg-slate-700/50 rounded-lg border border-slate-700/50 transition-all"
          >
            <RotateCcw className="w-3 h-3" />
            加载默认策略
          </button>
        </div>
      </div>

      <p className="text-[11px] text-slate-400 leading-relaxed">
        配置 7 套角球投注策略的条件参数。左侧调整策略触发条件，右侧管理账号与系统设置。
      </p>

      {/* 方向冲突警告 */}
      {directionConflicts.length > 0 && (
        <div className="px-3 py-2 bg-rose-950/40 border border-rose-800/50 rounded-lg flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 text-rose-400 mt-0.5 shrink-0" />
          <div className="text-[11px] text-rose-300">
            <span className="font-semibold">方向冲突警告：</span>
            {directionConflicts.map((c, i) => <span key={i} className="block">{c}</span>)}
            <span className="text-rose-400/80">后端评估时将自动保留ID最小的策略</span>
          </div>
        </div>
      )}

      {/* 左右分栏 */}
      <div className="flex flex-col lg:flex-row gap-4">
        {/* ===== 左栏：策略卡片（两列网格） ===== */}
        <div className="lg:w-2/3 self-start grid grid-cols-1 md:grid-cols-2 gap-2 items-start">
          {strategies.map((s) => {
            const isExpanded = expandedIds.has(s.id);
            const stats: BacktestStats | undefined = backtestResults[s.id];
            const defaults = DEFAULT_VALUES[String(s.id)] || {};
            const validationErrors = validateStrategy(s);
            const isLineDisabled = s.market_type === "next_corner";

            return (
              <div
                key={s.id}
                className={`bg-[#0F1424] rounded-2xl border transition-all ${
                  s.enabled ? "border-emerald-700/60 shadow-lg shadow-emerald-500/5" : "border-slate-800/80"
                }`}
              >
                {/* 卡片头部 */}
                <div className="flex items-center justify-between p-3 cursor-pointer" onClick={() => toggleExpand(s.id)}>
                  <div className="flex items-center gap-3">
                    <button type="button"
                      onClick={(e) => { e.stopPropagation(); handleToggle(s.id, !s.enabled); }}
                      className={`p-1.5 rounded-lg transition-all ${
                        s.enabled ? "bg-emerald-500/20 text-emerald-400" : "bg-slate-800 text-slate-500 hover:text-slate-300"
                      }`}
                      title={s.enabled ? "禁用策略" : "启用策略"}
                    >
                      <Power className="w-4 h-4" />
                    </button>
                    <div>
                      <span className={`text-[13px] font-medium font-sans ${s.enabled ? "text-emerald-300" : "text-slate-400"}`}>
                        {s.name}
                      </span>
                      {s.enabled && (
                        <span className="ml-2 px-1.5 py-0.5 text-[10px] bg-emerald-500/20 text-emerald-400 rounded font-sans">已启用</span>
                      )}
                    </div>
                  </div>
                  {isExpanded ? <ChevronUp className="w-4 h-4 text-slate-500" /> : <ChevronDown className="w-4 h-4 text-slate-500" />}
                </div>

                {/* 统计看板（回测后有数据时显示） */}
                {stats && (
                  <div className="px-3 pb-3">
                    {isSimulated ? (
                      <div className="mb-2 px-2 py-1.5 bg-amber-900/30 border border-amber-700/40 rounded text-[10px] text-amber-400 flex items-center gap-1.5 font-sans">
                        <span className="font-bold">模拟数据</span>
                        <span className="text-amber-500/80">— {simulatedWarning || "回测基于随机模拟生成，不代表真实结果"}</span>
                      </div>
                    ) : (
                      <div className="mb-2 px-2 py-1.5 bg-emerald-900/30 border border-emerald-700/40 rounded text-[10px] text-emerald-400 flex items-center gap-1.5 font-sans">
                        <span className="font-bold">真实数据</span>
                        <span className="text-emerald-500/80">— 基于历史投注记录统计</span>
                      </div>
                    )}
                    <div className="grid grid-cols-3 gap-2 text-xs font-sans">
                      <div className="bg-slate-800/50 p-2 rounded">
                        <div className="text-slate-500 text-[10px]">触发次数</div>
                        <div className="text-white font-semibold">{stats.triggered}</div>
                      </div>
                      <div className="bg-slate-800/50 p-2 rounded">
                        <div className="text-slate-500 text-[10px]">执行成功率</div>
                        <div className="text-emerald-400 font-semibold">{stats.successRate}%</div>
                      </div>
                      <div className="bg-slate-800/50 p-2 rounded">
                        <div className="text-slate-500 text-[10px]">总收益</div>
                        <div className={`font-semibold ${stats.totalProfit >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                          {stats.totalProfit > 0 ? '+' : ''}{stats.totalProfit}
                        </div>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-2 mt-1.5 text-[10px] text-slate-500 font-sans">
                      <span>成功 {stats.executed} / 失败 {stats.failed}</span>
                      <span className="text-right">ROI {stats.roi}%</span>
                    </div>
                  </div>
                )}

                {/* 折叠态摘要 */}
                {!isExpanded && (
                  <div className="px-3 pb-3 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-slate-500 font-sans">
                    <span>⏱ {s.minute_min ?? s.playTimeStart}'–{s.minute_max ?? s.playTimeEnd}'</span>
                    <span>📊 {s.line_min ?? s.cornerHandicapLower}~{s.line_max ?? s.cornerHandicapUpper}</span>
                    <span>🎯 ≥{(s.odds_min ?? s.targetOdds ?? 0).toFixed(2)}</span>
                    {((s.corner_min ?? s.minCurrentCorners) > 0 || (s.corner_max ?? s.maxCurrentCorners) < 99) && (
                      <span>⚽ {s.corner_min ?? s.minCurrentCorners}~{s.corner_max ?? s.maxCurrentCorners}角</span>
                    )}
                    {s.leadSide !== "any" && (
                      <span>🏷 {s.leadSide === "strong" ? "强队领先" : "弱队领先"}</span>
                    )}
                    {(s.odds_max ?? s.maxOdds ?? 1.10) < 1.10 && (
                      <span>📉 ≤{(s.odds_max ?? s.maxOdds ?? 1.10).toFixed(2)}</span>
                    )}
                    {(s.market_type ?? "auto") !== "auto" && (
                      <span>📋 {(s.market_type ?? "auto") === "over_under" ? "大小球" : (s.market_type ?? "auto") === "handicap" ? "让球" : (s.market_type ?? "auto") === "next_corner" ? "下个角球" : s.market_type}</span>
                    )}
                    {(() => {
                      const sMin = s.minute_min ?? s.playTimeStart ?? 0;
                      const sMax = s.minute_max ?? s.playTimeEnd ?? 99;
                      const overlapping = strategies.filter(o => o.enabled && o.id !== s.id && (o.minute_min ?? o.playTimeStart ?? 0) <= sMax && (o.minute_max ?? o.playTimeEnd ?? 99) >= sMin);
                      const halfTimeIssue = sMin <= 45 && sMax >= 46;
                      return (
                        <>
                          {overlapping.length > 0 && (
                            <span className="text-[9px] text-amber-500" title="同时触发可能导致重复投注">
                              ⚠ 与策略{overlapping.map(o => o.id).join("、")}时间重叠
                            </span>
                          )}
                          {halfTimeIssue && (
                            <span className="text-[9px] text-amber-500 ml-1" title="半场休息不支持投注">
                              ⚠ 不含半场
                            </span>
                          )}
                        </>
                      );
                    })()}
                  </div>
                )}

                {/* 展开态参数编辑 */}
                {isExpanded && (
                  <div className="px-3 pb-4 space-y-4 border-t border-slate-800/50 pt-3">

                    {/* ====== 分组1：时间与比分条件 ====== */}
                    <div>
                      <h5 className={sectionTitleClass}>⏱ 时间与比分条件</h5>

                      <label className={labelClass}>比赛时间窗口（分钟）<span className="text-[9px] text-slate-600 ml-1">策略仅在此时段内触发</span></label>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <span className="text-[9px] text-slate-600 font-sans">开始</span>
                          <input type="number" className={numInputClass} min={0} max={120} step={1}
                            value={s.minute_min} onChange={(e) => handleChange(s.id, "minute_min", Number(e.target.value))} />
                          <span className={hintClass}>默认: {defaults.minute_min}</span>
                        </div>
                        <div>
                          <span className="text-[9px] text-slate-600 font-sans">结束</span>
                          <input type="number" className={numInputClass} min={0} max={120} step={1}
                            value={s.minute_max} onChange={(e) => handleChange(s.id, "minute_max", Number(e.target.value))} />
                          <span className={hintClass}>默认: {defaults.minute_max}</span>
                        </div>
                      </div>
                      {s.minute_min >= s.minute_max && <span className={errorClass}>开始时间须小于结束时间</span>}

                      <div className="mt-3">
                        <label className={labelClass}>领先球数条件 <span className="text-[9px] text-slate-600 ml-1">≥90表示不限制比分</span></label>
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <span className="text-[9px] text-slate-600 font-sans">领先球数上限</span>
                            <input type="number" className={numInputClass} min={0} max={99} step={1}
                              value={s.leadGoals} onChange={(e) => handleChange(s.id, "leadGoals", Number(e.target.value))} />
                            <span className={hintClass}>默认: {defaults.leadGoals}</span>
                          </div>
                          <div>
                            <span className="text-[9px] text-slate-600 font-sans">弱队领先球数</span>
                            <input type="number" className={numInputClass} min={0} max={5} step={1}
                              value={s.leadGoalsWeak} onChange={(e) => handleChange(s.id, "leadGoalsWeak", Number(e.target.value))} />
                            <span className={hintClass}>默认: {defaults.leadGoalsWeak}</span>
                          </div>
                        </div>
                      </div>

                      <div className="mt-3">
                        <label className={labelClass}>领先方身份 <span className="text-[9px] text-slate-600 ml-1">限定领先方身份条件</span></label>
                        <select
                          className="w-full bg-slate-900/80 border border-slate-700 rounded px-2.5 py-1.5 text-xs text-slate-200 font-sans focus:outline-none focus:border-emerald-500/50 transition-colors"
                          value={s.leadSide || "any"}
                          onChange={(e) => handleChange(s.id, "leadSide", e.target.value as any)}
                        >
                          <option value="any">任意 (any)</option>
                          <option value="strong">强队领先 (strong)</option>
                          <option value="weak">弱队领先 (weak)</option>
                        </select>
                        <span className={hintClass}>默认: {formatDefault("leadSide", defaults.leadSide || "any")}</span>
                      </div>
                    </div>

                    {/* ====== 分组2：角球盘口条件 ====== */}
                    <div>
                      <h5 className={sectionTitleClass}>📊 角球盘口条件</h5>

                      <label className={labelClass}>市场类型 <span className="text-[9px] text-slate-600 ml-1">限定策略适用的盘口类型</span></label>
                      <select
                        className="w-full bg-slate-900/80 border border-slate-700 rounded px-2.5 py-1.5 text-xs text-slate-200 font-sans focus:outline-none focus:border-emerald-500/50 transition-colors"
                        value={s.market_type || "auto"}
                        onChange={(e) => handleChange(s.id, "market_type", e.target.value as any)}
                      >
                        <option value="auto">自动 (auto)</option>
                        <option value="over_under">大小球 (over_under)</option>
                        <option value="handicap">让球 (handicap)</option>
                        <option value="next_corner">下一个角球 (next_corner)</option>
                        <option value="1x2">独赢 (1x2)</option>
                      </select>
                      <span className={hintClass}>默认: {formatDefault("market_type", defaults.market_type || "auto")}</span>

                      <div className="mt-3">
                        <label className={labelClass}>盘口周期 <span className="text-[9px] text-slate-600 ml-1">全场/半场过滤</span></label>
                        <select
                          className="w-full bg-slate-900/80 border border-slate-700 rounded px-2.5 py-1.5 text-xs text-slate-200 font-sans focus:outline-none focus:border-emerald-500/50 transition-colors"
                          value={s.period || "full"}
                          onChange={(e) => handleChange(s.id, "period", e.target.value as any)}
                        >
                          <option value="full">全场 (full)</option>
                          <option value="half">半场 (half)</option>
                          <option value="any">不限制 (any)</option>
                        </select>
                        <span className={hintClass}>默认: {formatDefault("period", defaults.period || "full")}</span>
                      </div>

                      <div className="mt-3">
                        <label className={labelClass}>角球盘口区间 <span className="text-[9px] text-slate-600 ml-1">归一化后的盘口范围</span></label>
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <span className="text-[9px] text-slate-600 font-sans">下限</span>
                            <input type="number" className={numInputClass} min={-5} max={20} step={0.25}
                              disabled={isLineDisabled}
                              value={isLineDisabled ? '' : s.line_min}
                              onChange={(e) => handleChange(s.id, "line_min", Number(e.target.value))} />
                            <span className={hintClass}>{isLineDisabled ? "下一个角球类型无需盘口区间" : `默认: ${defaults.line_min}`}</span>
                          </div>
                          <div>
                            <span className="text-[9px] text-slate-600 font-sans">上限</span>
                            <input type="number" className={numInputClass} min={-5} max={20} step={0.25}
                              disabled={isLineDisabled}
                              value={isLineDisabled ? '' : s.line_max}
                              onChange={(e) => handleChange(s.id, "line_max", Number(e.target.value))} />
                            <span className={hintClass}>{isLineDisabled ? "下一个角球类型无需盘口区间" : `默认: ${defaults.line_max}`}</span>
                          </div>
                        </div>
                        {!isLineDisabled && s.line_min > s.line_max && <span className={errorClass}>盘口下限不能大于上限</span>}
                      </div>

                      <div className="mt-3">
                        <label className={labelClass}>当前角球数范围 <span className="text-[9px] text-slate-600 ml-1">0/99表示不限制</span></label>
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <span className="text-[9px] text-slate-600 font-sans">最小角球数</span>
                            <input type="number" className={numInputClass} min={0} max={30} step={1}
                              value={s.corner_min} onChange={(e) => handleChange(s.id, "corner_min", Number(e.target.value))} />
                            <span className={hintClass}>默认: {defaults.corner_min}</span>
                          </div>
                          <div>
                            <span className="text-[9px] text-slate-600 font-sans">最大角球数</span>
                            <input type="number" className={numInputClass} min={0} max={30} step={1}
                              value={s.corner_max} onChange={(e) => handleChange(s.id, "corner_max", Number(e.target.value))} />
                            <span className={hintClass}>默认: {defaults.corner_max}</span>
                          </div>
                        </div>
                        {s.corner_min > s.corner_max && <span className={errorClass}>角球数下限不能大于上限</span>}
                      </div>
                    </div>

                    {/* ====== 分组3：赔率条件 ====== */}
                    <div>
                      <h5 className={sectionTitleClass}>🎯 赔率条件 <span className="text-[9px] text-amber-500 ml-1">HK盘</span></h5>

                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className={labelClass}>最低赔率（≥）</label>
                          <input type="number" className={numInputClass} min={0.5} max={2.0} step={0.05}
                            value={s.odds_min} onChange={(e) => handleChange(s.id, "odds_min", Number(e.target.value))} />
                          <span className={hintClass}>默认: {defaults.odds_min}</span>
                        </div>
                        <div>
                          <label className={labelClass}>最高赔率（≤） <span className="text-[9px] text-slate-600 ml-1">过滤异常赔率</span></label>
                          <input type="number" className={numInputClass} min={0.5} max={2.0} step={0.05}
                            value={s.odds_max} onChange={(e) => handleChange(s.id, "odds_max", Number(e.target.value))} />
                          <span className={hintClass}>默认: {defaults.odds_max}</span>
                        </div>
                      </div>
                      {s.odds_min > s.odds_max && <span className={errorClass}>最低赔率不能大于最高赔率</span>}
                    </div>

                    {/* ====== 分组4：投注方向 ====== */}
                    <div>
                      <h5 className={sectionTitleClass}>🎲 投注方向</h5>
                      <label className={labelClass}>选择投注方向 <span className="text-[9px] text-slate-600 ml-1">决定触发后投注大/小/主/客</span></label>
                      <select
                        className="w-full bg-slate-900/80 border border-slate-700 rounded px-2.5 py-1.5 text-xs text-slate-200 font-sans focus:outline-none focus:border-emerald-500/50 transition-colors"
                        value={s.direction || "Auto"}
                        onChange={(e) => handleChange(s.id, "direction", e.target.value as any)}
                      >
                        <option value="Auto">自动 (Auto)</option>
                        <option value="Over">大 (Over)</option>
                        <option value="Under">小 (Under)</option>
                        <option value="Home">主队 (Home)</option>
                        <option value="Away">客队 (Away)</option>
                      </select>
                      <span className={hintClass}>默认: {formatDefault("direction", defaults.direction || "Auto")}</span>
                    </div>

                    {/* ====== 分组5：AI评分过滤 ====== */}
                    <div>
                      <h5 className={sectionTitleClass}>🤖 AI评分过滤</h5>
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input type="checkbox"
                          checked={s.aiFilterEnabled || false}
                          onChange={(e) => handleChange(s.id, "aiFilterEnabled", e.target.checked)}
                          className="rounded border-slate-700 bg-slate-900/80 text-emerald-500 focus:ring-emerald-500/50" />
                        <span className="text-xs text-slate-300 font-sans">启用AI评分过滤</span>
                      </label>
                      <span className={hintClass}>启用后，AI计算概率须{'>'}60%才允许策略触发</span>
                    </div>

                    {/* 验证错误汇总 */}
                    {validationErrors.length > 0 && (
                      <div className="px-2 py-1.5 bg-rose-950/30 border border-rose-800/40 rounded text-[10px] text-rose-300 font-sans">
                        {validationErrors.map((err, i) => <span key={i} className="block">⚠ {err}</span>)}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* ===== 右栏：系统设置 ===== */}
        <div className="lg:w-1/3">
          <SettingsPanel />
        </div>
      </div>
    </div>
  );
}
