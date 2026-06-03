import React, { useEffect, useState } from "react";
import { BarChart3, TrendingUp, RefreshCw, ClipboardList } from "lucide-react";
import { useCornerStore } from "../../store/cornerStore";

interface HistoryRow {
  id: number;
  match_id: string;
  match_name: string;
  strategy_id: string;
  odds: number;
  created_at: string;
}

interface SimRecord {
  id: number;
  strategy_id: string;
  match_id: string;
  match_name: string;
  elapsed_minutes: number;
  trigger_odds: number;
  trigger_handicap: number;
  bet_direction: string;
  result: string;
  profit_loss: number;
  created_at: string;
}

interface BetRecord {
  id: number;
  match_id: string;
  match_name: string;
  strategy_id: string;
  odds: number;
  amount: number;
  status: string;
  error_message: string | null;
  executed_at: string | null;
  created_at: string;
}

type SubTab = "simulation" | "trigger" | "bets";

export default function CornerHistoryChart() {
  const historyFilterMatchId = useCornerStore((s) => s.historyFilterMatchId);
  const setHistoryFilterMatchId = useCornerStore((s) => s.setHistoryFilterMatchId);

  const [subTab, setSubTab] = useState<SubTab>("simulation");
  const [historyData, setHistoryData] = useState<HistoryRow[]>([]);
  const [simData, setSimData] = useState<SimRecord[]>([]);
  const [betsData, setBetsData] = useState<BetRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 清除过滤器（组件卸载时）
  useEffect(() => {
    return () => { setHistoryFilterMatchId(null); };
  }, [setHistoryFilterMatchId]);

  // 获取触发历史
  const fetchHistory = async () => {
    setLoading(true);
    setError(null);
    try {
      const resp = await fetch("/api/corner/history?limit=50");
      const json = await resp.json();
      if (json.success) setHistoryData(json.data || []);
      else setError(json.error || "获取失败");
    } catch (err: any) {
      setError(err.message || "网络错误");
    } finally {
      setLoading(false);
    }
  };

  // 获取模拟记录
  const fetchSimRecords = async () => {
    setLoading(true);
    setError(null);
    try {
      let url = "/api/corner/simulation-records?limit=100";
      if (historyFilterMatchId) url += "&matchId=" + encodeURIComponent(historyFilterMatchId);
      const resp = await fetch(url);
      const json = await resp.json();
      if (json.success) setSimData(json.data || []);
      else setError(json.error || "获取失败");
    } catch (err: any) {
      setError(err.message || "网络错误");
    } finally {
      setLoading(false);
    }
  };

  // 获取投注记录
  const fetchBets = async () => {
    setLoading(true);
    setError(null);
    try {
      let url = "/api/corner/bets?limit=100";
      if (historyFilterMatchId) url += "&matchId=" + encodeURIComponent(historyFilterMatchId);
      const resp = await fetch(url);
      const json = await resp.json();
      if (json.success) setBetsData(json.data || []);
      else setError(json.error || "获取失败");
    } catch (err: any) {
      setError(err.message || "网络错误");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (subTab === "trigger") fetchHistory();
    else if (subTab === "simulation") fetchSimRecords();
    else fetchBets();
  }, [subTab, historyFilterMatchId]);

  // ====== 模拟记录表格 ======
  const renderSimulationTab = () => {
    if (simData.length === 0 && !loading) {
      return (
        <div className="bg-[#0F1424] rounded-2xl border border-slate-800/80 p-12 text-center">
          <div className="text-4xl mb-3">📋</div>
          <p className="text-slate-400 text-sm">暂无模拟记录</p>
          <p className="text-[11px] text-slate-600 mt-1">前往「策略配置」运行回测后，数据将在此展示</p>
        </div>
      );
    }

    return (
      <div className="bg-[#0F1424] rounded-2xl border border-slate-800/80 overflow-hidden">
        <div className="grid grid-cols-12 gap-2 px-4 py-2 text-[11px] text-slate-500 border-b border-slate-800 font-medium">
          <div className="col-span-3">比赛</div>
          <div className="col-span-1 text-center">策略</div>
          <div className="col-span-1 text-center">时间</div>
          <div className="col-span-1 text-center">盘口</div>
          <div className="col-span-1 text-center">赔率</div>
          <div className="col-span-1 text-center">方向</div>
          <div className="col-span-1 text-center">结果</div>
          <div className="col-span-1 text-center">盈亏</div>
          <div className="col-span-2 text-right">时间</div>
        </div>
        {simData.map((row) => (
          <div key={row.id} className="grid grid-cols-12 gap-2 px-4 py-2 text-[11px] border-b border-slate-800/30 hover:bg-slate-800/10">
            <div className="col-span-3 text-slate-200 truncate">{row.match_name || row.match_id || "—"}</div>
            <div className="col-span-1 text-center text-emerald-400 font-mono">{row.strategy_id}</div>
            <div className="col-span-1 text-center text-slate-400 font-mono">{row.elapsed_minutes}'</div>
            <div className="col-span-1 text-center text-blue-400 font-mono">{row.trigger_handicap?.toFixed(2)}</div>
            <div className="col-span-1 text-center text-amber-400 font-mono">{row.trigger_odds?.toFixed(2)}</div>
            <div className="col-span-1 text-center text-slate-400">{row.bet_direction}</div>
            <div className="col-span-1 text-center">
              <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
                row.result === 'win' ? 'bg-emerald-500/15 text-emerald-400' :
                row.result === 'lose' ? 'bg-rose-500/15 text-rose-400' :
                'bg-slate-700/50 text-slate-400'
              }`}>
                {row.result === 'win' ? '赢' : row.result === 'lose' ? '输' : '待定'}
              </span>
            </div>
            <div className={`col-span-1 text-center font-mono ${(row.profit_loss || 0) >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
              {(row.profit_loss || 0) > 0 ? '+' : ''}{row.profit_loss?.toFixed(1)}
            </div>
            <div className="col-span-2 text-right text-slate-500 text-[10px]">{row.created_at?.slice(0, 19) || "—"}</div>
          </div>
        ))}
      </div>
    );
  };

  // ====== 触发历史（原有逻辑） ======
  const renderTriggerTab = () => {
    const strategyCounts: Record<string, number> = {};
    historyData.forEach((d) => {
      if (d.strategy_id) {
        d.strategy_id.split(",").forEach((sid) => {
          const s = sid.trim();
          strategyCounts[s] = (strategyCounts[s] || 0) + 1;
        });
      }
    });
    const maxCount = Math.max(1, ...Object.values(strategyCounts), 1);
    const barEntries = ["1", "2", "3", "4", "5"].map((k) => ({
      label: "策略" + k,
      count: strategyCounts[k] || 0,
    }));
    const barColors = ["#F59E0B", "#10B981", "#3B82F6", "#8B5CF6", "#EC4899"];
    const recent = [...historyData].reverse().slice(-10);

    if (historyData.length === 0 && !loading) {
      return (
        <div className="bg-[#0F1424] rounded-2xl border border-slate-800/80 p-12 text-center">
          <div className="text-4xl mb-3">📊</div>
          <p className="text-slate-400 text-sm">暂无触发历史数据</p>
          <p className="text-[11px] text-slate-600 mt-1">实时监控触发策略信号后，数据将自动记录并在此展示</p>
        </div>
      );
    }

    return (
      <>
        <div className="bg-[#0F1424] rounded-2xl border border-slate-800/80 p-5">
          <h4 className="text-xs font-medium text-slate-300 flex items-center gap-1.5 mb-4">
            <TrendingUp className="w-3.5 h-3.5 text-emerald-400" />
            赔率趋势 (最近 {Math.min(historyData.length, 10)} 条)
          </h4>
          <div className="space-y-2">
            {recent.map((row, i) => {
              const pct = Math.min(100, ((row.odds || 0) / 2) * 100);
              return (
                <div key={row.id || i} className="flex items-center gap-2 text-[11px]">
                  <span className="w-14 text-slate-500 text-right shrink-0">#{historyData.length - recent.length + i + 1}</span>
                  <div className="flex-1 h-5 bg-slate-800 rounded relative overflow-hidden">
                    <div className="absolute inset-y-0 left-0 bg-emerald-500/30 rounded transition-all" style={{ width: pct + "%" }} />
                  </div>
                  <span className="w-10 text-amber-400 font-mono text-right shrink-0">{(row.odds ?? 0).toFixed(2)}</span>
                </div>
              );
            })}
          </div>
        </div>

        <div className="bg-[#0F1424] rounded-2xl border border-slate-800/80 p-5">
          <h4 className="text-xs font-medium text-slate-300 flex items-center gap-1.5 mb-4">
            <BarChart3 className="w-3.5 h-3.5 text-emerald-400" />策略触发分布
          </h4>
          <div className="flex items-end justify-center gap-6 h-32">
            {barEntries.map((entry, i) => {
              const heightPct = (entry.count / maxCount) * 100;
              return (
                <div key={entry.label} className="flex flex-col items-center gap-1">
                  <span className="text-[10px] text-slate-400 font-mono">{entry.count}</span>
                  <div className="w-10 rounded-t transition-all"
                    style={{ height: Math.max(4, heightPct * 0.8) + "px", backgroundColor: barColors[i] }} />
                  <span className="text-[10px] text-slate-500">{entry.label}</span>
                </div>
              );
            })}
          </div>
        </div>

        <div className="bg-[#0F1424] rounded-2xl border border-slate-800/80 overflow-hidden">
          <div className="grid grid-cols-12 gap-2 px-4 py-2 text-[11px] text-slate-500 border-b border-slate-800 font-medium">
            <div className="col-span-1">#</div>
            <div className="col-span-4">比赛</div>
            <div className="col-span-2 text-center">策略</div>
            <div className="col-span-2 text-center">赔率</div>
            <div className="col-span-3 text-right">时间</div>
          </div>
          {historyData.map((row, i) => (
            <div key={row.id || i} className="grid grid-cols-12 gap-2 px-4 py-2 text-[11px] border-b border-slate-800/30 hover:bg-slate-800/10">
              <div className="col-span-1 text-slate-500">{i + 1}</div>
              <div className="col-span-4 text-slate-200 truncate">{row.match_name || row.match_id || "—"}</div>
              <div className="col-span-2 text-center text-emerald-400 font-mono">{row.strategy_id || "—"}</div>
              <div className="col-span-2 text-center text-amber-400 font-mono">{(row.odds ?? 0).toFixed(2)}</div>
              <div className="col-span-3 text-right text-slate-500 text-[10px]">{row.created_at?.slice(0, 19) || "—"}</div>
            </div>
          ))}
        </div>
      </>
    );
  };

  // ====== 投注记录表格 ======
  const renderBetsTab = () => {
    if (betsData.length === 0 && !loading) {
      return (
        <div className="bg-[#0F1424] rounded-2xl border border-slate-800/80 p-12 text-center">
          <div className="text-4xl mb-3">💰</div>
          <p className="text-slate-400 text-sm">暂无投注记录</p>
          <p className="text-[11px] text-slate-600 mt-1">策略触发后将自动生成待投注，执行后在此展示</p>
        </div>
      );
    }

    return (
      <div className="bg-[#0F1424] rounded-2xl border border-slate-800/80 overflow-hidden">
        <div className="grid grid-cols-12 gap-2 px-4 py-2 text-[11px] text-slate-500 border-b border-slate-800 font-medium">
          <div className="col-span-3">比赛</div>
          <div className="col-span-1 text-center">策略</div>
          <div className="col-span-1 text-center">赔率</div>
          <div className="col-span-1 text-center">金额</div>
          <div className="col-span-1 text-center">状态</div>
          <div className="col-span-2 text-center">执行时间</div>
          <div className="col-span-3 text-right">创建时间</div>
        </div>
        {betsData.map((row) => (
          <div key={row.id} className="grid grid-cols-12 gap-2 px-4 py-2 text-[11px] border-b border-slate-800/30 hover:bg-slate-800/10">
            <div className="col-span-3 text-slate-200 truncate">{row.match_name || row.match_id || "—"}</div>
            <div className="col-span-1 text-center text-emerald-400 font-mono">{row.strategy_id}</div>
            <div className="col-span-1 text-center text-amber-400 font-mono">{(row.odds ?? 0).toFixed(2)}</div>
            <div className="col-span-1 text-center text-slate-300 font-mono">¥{row.amount || 0}</div>
            <div className="col-span-1 text-center">
              <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
                row.status === 'executed' ? 'bg-emerald-500/15 text-emerald-400' :
                row.status === 'failed' ? 'bg-rose-500/15 text-rose-400' :
                'bg-amber-500/15 text-amber-400'
              }`}>
                {row.status === 'executed' ? '已执行' : row.status === 'failed' ? '失败' : '待执行'}
              </span>
            </div>
            <div className="col-span-2 text-center text-slate-500 text-[10px]">{row.executed_at?.slice(0, 19) || "—"}</div>
            <div className="col-span-3 text-right text-slate-500 text-[10px]">{row.created_at?.slice(0, 19) || "—"}</div>
          </div>
        ))}
      </div>
    );
  };

  return (
    <div className="space-y-4">
      {/* 头部 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <BarChart3 className="w-5 h-5 text-emerald-400" />
          <h3 className="text-sm font-semibold text-slate-200">角球历史数据分析</h3>
          {historyFilterMatchId && (
            <span className="flex items-center gap-1 px-2 py-0.5 text-[10px] bg-indigo-500/15 text-indigo-400 rounded">
              过滤: {historyFilterMatchId}
              <button onClick={() => setHistoryFilterMatchId(null)} className="ml-1 hover:text-white">×</button>
            </span>
          )}
        </div>
        <button onClick={() => {
          if (subTab === "trigger") fetchHistory();
          else if (subTab === "simulation") fetchSimRecords();
          else fetchBets();
        }} disabled={loading}
          className="flex items-center gap-1 px-3 py-1.5 text-xs text-slate-400 hover:text-white bg-slate-800/50 hover:bg-slate-700/50 rounded-lg border border-slate-700/50 transition-all disabled:opacity-50">
          <RefreshCw className={`w-3 h-3 ${loading ? "animate-spin" : ""}`} /> 刷新
        </button>
      </div>

      {/* 子 Tab 切换 */}
      <div className="flex items-center gap-2">
        <button
          onClick={() => setSubTab("simulation")}
          className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
            subTab === "simulation" ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
          }`}
        >
          <ClipboardList className="w-3 h-3" /> 模拟记录
        </button>
        <button
          onClick={() => setSubTab("trigger")}
          className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
            subTab === "trigger" ? 'bg-emerald-600 text-white' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
          }`}
        >
          <BarChart3 className="w-3 h-3" /> 触发历史
        </button>
        <button
          onClick={() => setSubTab("bets")}
          className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
            subTab === "bets" ? 'bg-amber-600 text-white' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
          }`}
        >
          <TrendingUp className="w-3 h-3" /> 投注记录
        </button>
      </div>

      {error && <p className="text-[11px] text-rose-400">⚠️ {error}</p>}

      {subTab === "simulation" ? renderSimulationTab() : subTab === "trigger" ? renderTriggerTab() : renderBetsTab()}
    </div>
  );
}
