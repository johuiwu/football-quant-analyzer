import React, { useState } from "react";
import { Settings, RotateCcw, ChevronDown, ChevronUp, Power, BarChart3 } from "lucide-react";
import { useCornerStore, CornerStrategy, BacktestStats } from "../../store/cornerStore";
import SettingsPanel from "./SettingsPanel";


const numInputClass = "w-full bg-slate-900/80 border border-slate-700 rounded px-2 py-1 text-xs text-slate-200 font-mono focus:outline-none focus:border-emerald-500/50 transition-colors text-center";
const labelClass = "text-[10px] text-slate-500 mb-0.5 block";

export default function StrategyConfigPanel() {
  const strategies = useCornerStore((s) => s.strategies);
  const updateStrategy = useCornerStore((s) => s.updateStrategy);
  const setStrategies = useCornerStore((s) => s.setStrategies);
  const backtestResults = useCornerStore((s) => s.backtestResults);
  const setBacktestResults = useCornerStore((s) => s.setBacktestResults);
  const [expandedIds, setExpandedIds] = useState<Set<number>>(new Set());
  const [backtesting, setBacktesting] = useState(false);

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
    try {
      const res = await fetch("/api/corner/backtest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ strategies }),
      });
      const data = await res.json();
      if (data.success && data.stats) {
        setBacktestResults(data.stats);
      }
    } catch (err) {
      console.error("回测失败:", err);
    } finally {
      setBacktesting(false);
    }
  };

  return (
    <div className="space-y-4">
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

      {/* 左右分栏 */}
      <div className="flex flex-col lg:flex-row gap-4">
        {/* ===== 左栏：策略卡片 ===== */}
        <div className="lg:w-2/3 space-y-3">
          {strategies.map((s) => {
            const isExpanded = expandedIds.has(s.id);
            const stats: BacktestStats | undefined = backtestResults[s.id];

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
                      <span className={`text-sm font-medium ${s.enabled ? "text-emerald-300" : "text-slate-400"}`}>
                        {s.name}
                      </span>
                      {s.enabled && (
                        <span className="ml-2 px-1.5 py-0.5 text-[10px] bg-emerald-500/20 text-emerald-400 rounded">已启用</span>
                      )}
                    </div>
                  </div>
                  {isExpanded ? <ChevronUp className="w-4 h-4 text-slate-500" /> : <ChevronDown className="w-4 h-4 text-slate-500" />}
                </div>

                {/* 统计看板（回测后有数据时显示） */}
                {stats && (
                  <div className="px-3 pb-3">
                    <div className="grid grid-cols-3 gap-2 text-xs">
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
                    <div className="grid grid-cols-2 gap-2 mt-1.5 text-[10px] text-slate-500">
                      <span>成功 {stats.executed} / 失败 {stats.failed}</span>
                      <span className="text-right">ROI {stats.roi}%</span>
                    </div>
                  </div>
                )}

                {/* 折叠态摘要 */}
                {!isExpanded && (
                  <div className="px-3 pb-3 flex gap-4 text-[10px] text-slate-500">
                    <span>⏱ {s.playTimeStart}'–{s.playTimeEnd}'</span>
                    <span>📊 {s.cornerHandicapLower}~{s.cornerHandicapUpper}</span>
                    <span>🎯 ≥{s.targetOdds.toFixed(2)}</span>
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
                  <div className="px-3 pb-4 space-y-3 border-t border-slate-800/50 pt-3">
                    <div>
                      <label className={labelClass}>比赛时间窗口（分钟）</label>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <span className="text-[9px] text-slate-600">开始</span>
                          <input type="number" className={numInputClass} min={0} max={120} step={1}
                            value={s.playTimeStart} onChange={(e) => handleChange(s.id, "playTimeStart", Number(e.target.value))} />
                        </div>
                        <div>
                          <span className="text-[9px] text-slate-600">结束</span>
                          <input type="number" className={numInputClass} min={0} max={120} step={1}
                            value={s.playTimeEnd} onChange={(e) => handleChange(s.id, "playTimeEnd", Number(e.target.value))} />
                        </div>
                      </div>
                    </div>
                    <div>
                      <label className={labelClass}>领先球数条件</label>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <span className="text-[9px] text-slate-600">领先球数</span>
                          <input type="number" className={numInputClass} min={0} max={20} step={1}
                            value={s.leadGoals} onChange={(e) => handleChange(s.id, "leadGoals", Number(e.target.value))} />
                        </div>
                        <div>
                          <span className="text-[9px] text-slate-600">弱队领先</span>
                          <input type="number" className={numInputClass} min={0} max={5} step={1}
                            value={s.leadGoalsWeak} onChange={(e) => handleChange(s.id, "leadGoalsWeak", Number(e.target.value))} />
                        </div>
                      </div>
                    </div>
                    <div>
                      <label className={labelClass}>角球盘口区间</label>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <span className="text-[9px] text-slate-600">下限</span>
                          <input type="number" className={numInputClass} min={-3} max={5} step={0.25}
                            value={s.cornerHandicapLower} onChange={(e) => handleChange(s.id, "cornerHandicapLower", Number(e.target.value))} />
                        </div>
                        <div>
                          <span className="text-[9px] text-slate-600">上限</span>
                          <input type="number" className={numInputClass} min={-3} max={5} step={0.25}
                            value={s.cornerHandicapUpper} onChange={(e) => handleChange(s.id, "cornerHandicapUpper", Number(e.target.value))} />
                        </div>
                      </div>
                    </div>
                    <div>
                       <label className={labelClass}>目标赔率（≥）<span className="text-[9px] text-amber-500 ml-1">HK盘</span></label>
                      <div className="w-24">
                        <input type="number" className={numInputClass} min={0.5} max={2.0} step={0.05}
                          value={s.targetOdds} onChange={(e) => handleChange(s.id, "targetOdds", Number(e.target.value))} />
                      </div>
                    <div>
                      <label className={labelClass}>投注方向</label>
                      <div className="w-32">
                        <select
                          className="w-full bg-slate-900/80 border border-slate-700 rounded px-2 py-1 text-xs text-slate-200 focus:outline-none focus:border-emerald-500/50 transition-colors"
                          value={s.betDirection || "auto"}
                          onChange={(e) => handleChange(s.id, "betDirection", e.target.value as any)}
                        >
                          <option value="auto">自动</option>
                          <option value="over">大 (Over)</option>
                          <option value="under">小 (Under)</option>
                          <option value="home">主队</option>
                          <option value="away">客队</option>
                        </select>
                      </div>
                    </div>
                    </div>
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
