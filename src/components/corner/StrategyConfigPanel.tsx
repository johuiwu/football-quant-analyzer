import React, { useState, useMemo } from "react";
import { Settings, RotateCcw, ChevronDown, ChevronUp, Power, BarChart3, Trash2, AlertTriangle } from "lucide-react";
import { useCornerStore, CornerStrategy, BacktestStats } from "../../store/cornerStore";
import SettingsPanel from "./SettingsPanel";

const numInputClass = "w-full bg-slate-900/80 border border-slate-700 rounded px-2.5 py-1.5 text-xs text-slate-200 font-mono focus:outline-none focus:border-emerald-500/50 transition-colors text-center";
const labelClass = "text-[11px] text-slate-400 mb-1 block font-sans";
const hintClass = "text-[9px] text-slate-600 italic mt-0.5 block font-sans";
const sectionTitleClass = "text-xs font-semibold text-slate-300 mb-2 pb-1 border-b border-slate-800/60 font-sans";
const errorClass = "text-[9px] text-rose-400 mt-0.5 block font-sans";

// 默认值映射（用于显示"默认: X"提示）
const DEFAULT_VALUES: Record<string, Record<string, number | string>> = {
  "1": { playTimeStart: 35, playTimeEnd: 55, leadGoals: 99, leadGoalsWeak: 0, cornerHandicapLower: -1.25, cornerHandicapUpper: 2.5, targetOdds: 0.8, maxOdds: 1.10, minCurrentCorners: 3, maxCurrentCorners: 7, leadSide: "any", betDirection: "over" },
  "2": { playTimeStart: 50, playTimeEnd: 77, leadGoals: 3, leadGoalsWeak: 1, cornerHandicapLower: -0.75, cornerHandicapUpper: 2.5, targetOdds: 0.8, maxOdds: 1.10, minCurrentCorners: 0, maxCurrentCorners: 99, leadSide: "any", betDirection: "over" },
  "3": { playTimeStart: 70, playTimeEnd: 99, leadGoals: 0, leadGoalsWeak: 0, cornerHandicapLower: 0, cornerHandicapUpper: 2.0, targetOdds: 0.8, maxOdds: 1.10, minCurrentCorners: 5, maxCurrentCorners: 9, leadSide: "any", betDirection: "over" },
  "4": { playTimeStart: 60, playTimeEnd: 99, leadGoals: 2, leadGoalsWeak: 1, cornerHandicapLower: 0, cornerHandicapUpper: 2.5, targetOdds: 0.8, maxOdds: 1.10, minCurrentCorners: 0, maxCurrentCorners: 99, leadSide: "any", betDirection: "over" },
  "5": { playTimeStart: 70, playTimeEnd: 99, leadGoals: 1, leadGoalsWeak: 1, cornerHandicapLower: 0, cornerHandicapUpper: 2.5, targetOdds: 0.8, maxOdds: 1.10, minCurrentCorners: 0, maxCurrentCorners: 99, leadSide: "any", betDirection: "over" },
  "6": { playTimeStart: 55, playTimeEnd: 75, leadGoals: 1, leadGoalsWeak: 0, cornerHandicapLower: -0.5, cornerHandicapUpper: 1.5, targetOdds: 0.8, maxOdds: 1.10, minCurrentCorners: 2, maxCurrentCorners: 8, leadSide: "any", betDirection: "over" },
  "7": { playTimeStart: 60, playTimeEnd: 80, leadGoals: 99, leadGoalsWeak: 0, cornerHandicapLower: -0.5, cornerHandicapUpper: 1.5, targetOdds: 0.8, maxOdds: 1.10, minCurrentCorners: 3, maxCurrentCorners: 5, leadSide: "any", betDirection: "over" },
};

function formatDefault(key: string, val: number | string): string {
  if (typeof val === "number") {
    return Number.isInteger(val) ? String(val) : val.toFixed(2);
  }
  const labels: Record<string, string> = { any: "任意", strong: "强队", weak: "弱队", over: "大", under: "小", home: "主队", away: "客队", auto: "自动" };
  return labels[val] || val;
}

function validateStrategy(s: CornerStrategy): string[] {
  const errors: string[] = [];
  if (s.playTimeStart >= s.playTimeEnd) errors.push("开始时间须小于结束时间");
  if (s.cornerHandicapLower > s.cornerHandicapUpper) errors.push("盘口下限不能大于上限");
  if (s.targetOdds > (s.maxOdds ?? 1.10)) errors.push("最低赔率不能大于最高赔率");
  if (s.minCurrentCorners > s.maxCurrentCorners) errors.push("角球数下限不能大于上限");
  if (s.leadGoalsWeak > 0 && s.leadGoals < s.leadGoalsWeak) errors.push("弱队领先不能大于领先球数上限");
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
    try {
      const res = await fetch("/api/corner/strategies/default");
      const data = await res.json();
      if (data.success && Array.isArray(data.data)) {
        setStrategies(data.data);
      }
    } catch (err) {
      console.error("加载默认策略失败:", err);
    }
  };
  const handleToggle = (id: number, enabled: boolean) => updateStrategy(id, { enabled });
  const handleChange = (id: number, field: keyof CornerStrategy, value: number | string) => updateStrategy(id, { [field]: value } as any);

  const runBacktest = async () => {
    setBacktesting(true);
    setBacktestResults({});
    setIsSimulated(false);
    setSimulatedWarning("");
    try {
      const res = await fetch("/api/corner/backtest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ strategies }),
      });
      const data = await res.json();
      if (data.success && data.stats) {
        setBacktestResults(data.stats);
        setIsSimulated(data.simulated !== false);
        setSimulatedWarning(data.warning || "");
      }
    } catch (err) {
      console.error("回测失败:", err);
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

  // 检测策略间方向冲突
  const directionConflicts = useMemo(() => {
    const conflicts: string[] = [];
    const enabled = strategies.filter(s => s.enabled);
    for (let i = 0; i < enabled.length; i++) {
      for (let j = i + 1; j < enabled.length; j++) {
        const a = enabled[i], b = enabled[j];
        // 时间窗口重叠
        if (a.playTimeStart <= b.playTimeEnd && b.playTimeStart <= a.playTimeEnd) {
          // 方向冲突
          if ((a.betDirection === "over" && b.betDirection === "under") ||
              (a.betDirection === "under" && b.betDirection === "over")) {
            conflicts.push(`策略${a.id}与策略${b.id}: over/under方向冲突`);
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
        配置 5 套角球投注策略的条件参数。左侧调整策略触发条件，右侧管理账号与系统设置。
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
                    <span>⏱ {s.playTimeStart}'–{s.playTimeEnd}'</span>
                    <span>📊 {s.cornerHandicapLower}~{s.cornerHandicapUpper}</span>
                    <span>🎯 ≥{s.targetOdds.toFixed(2)}</span>
                    {(s.minCurrentCorners > 0 || s.maxCurrentCorners < 99) && (
                      <span>⚽ {s.minCurrentCorners}~{s.maxCurrentCorners}角</span>
                    )}
                    {s.leadSide !== "any" && (
                      <span>🏷 {s.leadSide === "strong" ? "强队领先" : "弱队领先"}</span>
                    )}
                    {s.maxOdds < 1.10 && (
                      <span>📉 ≤{s.maxOdds.toFixed(2)}</span>
                    )}
                    {(() => {
                      const overlapping = strategies.filter(o => o.enabled && o.id !== s.id && o.playTimeStart <= s.playTimeEnd && o.playTimeEnd >= s.playTimeStart);
                      const halfTimeIssue = s.playTimeStart <= 45 && s.playTimeEnd >= 46;
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
                            value={s.playTimeStart} onChange={(e) => handleChange(s.id, "playTimeStart", Number(e.target.value))} />
                          <span className={hintClass}>默认: {defaults.playTimeStart}</span>
                        </div>
                        <div>
                          <span className="text-[9px] text-slate-600 font-sans">结束</span>
                          <input type="number" className={numInputClass} min={0} max={120} step={1}
                            value={s.playTimeEnd} onChange={(e) => handleChange(s.id, "playTimeEnd", Number(e.target.value))} />
                          <span className={hintClass}>默认: {defaults.playTimeEnd}</span>
                        </div>
                      </div>
                      {s.playTimeStart >= s.playTimeEnd && <span className={errorClass}>开始时间须小于结束时间</span>}

                      <div className="mt-3">
                        <label className={labelClass}>领先球数条件 <span className="text-[9px] text-slate-600 ml-1">≥20表示不限制比分</span></label>
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <span className="text-[9px] text-slate-600 font-sans">领先球数上限</span>
                            <input type="number" className={numInputClass} min={0} max={20} step={1}
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

                      <label className={labelClass}>角球盘口区间 <span className="text-[9px] text-slate-600 ml-1">角球让球盘口范围</span></label>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <span className="text-[9px] text-slate-600 font-sans">下限</span>
                          <input type="number" className={numInputClass} min={-3} max={5} step={0.25}
                            value={s.cornerHandicapLower} onChange={(e) => handleChange(s.id, "cornerHandicapLower", Number(e.target.value))} />
                          <span className={hintClass}>默认: {defaults.cornerHandicapLower}</span>
                        </div>
                        <div>
                          <span className="text-[9px] text-slate-600 font-sans">上限</span>
                          <input type="number" className={numInputClass} min={-3} max={5} step={0.25}
                            value={s.cornerHandicapUpper} onChange={(e) => handleChange(s.id, "cornerHandicapUpper", Number(e.target.value))} />
                          <span className={hintClass}>默认: {defaults.cornerHandicapUpper}</span>
                        </div>
                      </div>
                      {s.cornerHandicapLower > s.cornerHandicapUpper && <span className={errorClass}>盘口下限不能大于上限</span>}

                      <div className="mt-3">
                        <label className={labelClass}>当前角球数范围 <span className="text-[9px] text-slate-600 ml-1">0/99表示不限制</span></label>
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <span className="text-[9px] text-slate-600 font-sans">最小角球数</span>
                            <input type="number" className={numInputClass} min={0} max={30} step={1}
                              value={s.minCurrentCorners} onChange={(e) => handleChange(s.id, "minCurrentCorners", Number(e.target.value))} />
                            <span className={hintClass}>默认: {defaults.minCurrentCorners}</span>
                          </div>
                          <div>
                            <span className="text-[9px] text-slate-600 font-sans">最大角球数</span>
                            <input type="number" className={numInputClass} min={0} max={30} step={1}
                              value={s.maxCurrentCorners} onChange={(e) => handleChange(s.id, "maxCurrentCorners", Number(e.target.value))} />
                            <span className={hintClass}>默认: {defaults.maxCurrentCorners}</span>
                          </div>
                        </div>
                        {s.minCurrentCorners > s.maxCurrentCorners && <span className={errorClass}>角球数下限不能大于上限</span>}
                      </div>
                    </div>

                    {/* ====== 分组3：赔率条件 ====== */}
                    <div>
                      <h5 className={sectionTitleClass}>🎯 赔率条件 <span className="text-[9px] text-amber-500 ml-1">HK盘</span></h5>

                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className={labelClass}>最低赔率（≥）</label>
                          <input type="number" className={numInputClass} min={0.5} max={2.0} step={0.05}
                            value={s.targetOdds} onChange={(e) => handleChange(s.id, "targetOdds", Number(e.target.value))} />
                          <span className={hintClass}>默认: {defaults.targetOdds}</span>
                        </div>
                        <div>
                          <label className={labelClass}>最高赔率（≤） <span className="text-[9px] text-slate-600 ml-1">过滤异常赔率</span></label>
                          <input type="number" className={numInputClass} min={0.5} max={2.0} step={0.05}
                            value={s.maxOdds} onChange={(e) => handleChange(s.id, "maxOdds", Number(e.target.value))} />
                          <span className={hintClass}>默认: {defaults.maxOdds}</span>
                        </div>
                      </div>
                      {s.targetOdds > (s.maxOdds ?? 1.10) && <span className={errorClass}>最低赔率不能大于最高赔率</span>}
                    </div>

                    {/* ====== 分组4：投注方向 ====== */}
                    <div>
                      <h5 className={sectionTitleClass}>🎲 投注方向</h5>
                      <label className={labelClass}>选择投注方向 <span className="text-[9px] text-slate-600 ml-1">决定触发后投注大/小/主/客</span></label>
                      <select
                        className="w-full bg-slate-900/80 border border-slate-700 rounded px-2.5 py-1.5 text-xs text-slate-200 font-sans focus:outline-none focus:border-emerald-500/50 transition-colors"
                        value={s.betDirection || "auto"}
                        onChange={(e) => handleChange(s.id, "betDirection", e.target.value as any)}
                      >
                        <option value="auto">自动 (Auto)</option>
                        <option value="over">大 (Over)</option>
                        <option value="under">小 (Under)</option>
                        <option value="home">主队 (Home)</option>
                        <option value="away">客队 (Away)</option>
                      </select>
                      <span className={hintClass}>默认: {formatDefault("betDirection", defaults.betDirection || "auto")}</span>
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
