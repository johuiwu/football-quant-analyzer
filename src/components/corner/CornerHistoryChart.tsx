import React, { useEffect, useState } from "react";
import { BarChart3, TrendingUp, RefreshCw } from "lucide-react";
import { useCornerStore } from "../../store/cornerStore";

interface HistoryRow {
  id: number;
  match_id: string;
  match_name: string;
  strategy_id: string;
  odds: number;
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
  error_reason: string | null;
  bet_target: string | null;
  executed_at: string | null;
  retry_count: number;
  created_at: string;
}

type SubTab = "trigger" | "bets";

export default function CornerHistoryChart() {
  const historyFilterMatchId = useCornerStore((s) => s.historyFilterMatchId);
  const setHistoryFilterMatchId = useCornerStore((s) => s.setHistoryFilterMatchId);

  const [subTab, setSubTab] = useState<SubTab>("trigger");
  const [historyData, setHistoryData] = useState<HistoryRow[]>([]);
  const [betsData, setBetsData] = useState<BetRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isBackendPolling, setIsBackendPolling] = useState(false);
  const [filterStrategy, setFilterStrategy] = useState<string>("all");
  const [sortBy, setSortBy] = useState<string>("time-desc");

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
    else fetchBets();
  }, [subTab, historyFilterMatchId]);

  // 检测后端轮询状态
  useEffect(() => {
    const checkPolling = async () => {
      try {
        const res = await fetch("/api/corner/status");
        const data = await res.json();
        if (data.success) {
          const backend = data.data?.backend || {};
          setIsBackendPolling(!!(backend.isPolling && !backend.isPaused));
        }
      } catch {}
    };
    checkPolling();
    const timer = setInterval(checkPolling, 15000);
    return () => clearInterval(timer);
  }, []);

  // 监控运行时自动刷新投注记录
  useEffect(() => {
    if (!isBackendPolling) return;
    const timer = setInterval(() => {
      if (subTab === "trigger") fetchHistory();
      else fetchBets();
    }, 10000);
    return () => clearInterval(timer);
  }, [isBackendPolling, subTab]);

  // 按 (match_name + strategy_id) 分组聚合
  function aggregateTriggers(rows: HistoryRow[]): (HistoryRow & { count: number })[] {
    const grouped = new Map<string, { row: HistoryRow; count: number }>();
    for (const item of rows) {
      const key = (item.match_name || "") + "_" + (item.strategy_id || "");
      if (grouped.has(key)) {
        const existing = grouped.get(key)!;
        existing.count += 1;
        if (item.created_at > existing.row.created_at) {
          existing.row.odds = item.odds;
        }
        if (item.created_at < existing.row.created_at) {
          existing.row.created_at = item.created_at;
        }
      } else {
        grouped.set(key, { row: { ...item }, count: 1 });
      }
    }
    return Array.from(grouped.values()).map(({ row, count }) => ({ ...row, count }));
  }

  // ====== 触发历史（原有逻辑） ======
  const renderTriggerTab = () => {
    const aggregatedData = aggregateTriggers(historyData);
    let filteredData = aggregatedData;
    if (filterStrategy !== "all") {
      filteredData = aggregatedData.filter(d => d.strategy_id === filterStrategy);
    }
    filteredData = [...filteredData].sort((a, b) => {
      if (sortBy === "time-desc") return (b.created_at || "").localeCompare(a.created_at || "");
      if (sortBy === "time-asc") return (a.created_at || "").localeCompare(b.created_at || "");
      if (sortBy === "odds-desc") return (b.odds || 0) - (a.odds || 0);
      if (sortBy === "odds-asc") return (a.odds || 0) - (b.odds || 0);
      return 0;
    });
    const strategyCounts: Record<string, number> = {};
    filteredData.forEach((d) => {
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
    const recent = [...filteredData].reverse().slice(-10);

    if (filteredData.length === 0 && !loading) {
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
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 items-start">
        <div className="bg-[#0F1424] rounded-2xl border border-slate-800/80 p-5">
          <h4 className="text-xs font-medium text-slate-300 flex items-center gap-1.5 mb-4">
            <TrendingUp className="w-3.5 h-3.5 text-emerald-400" />
            赔率趋势 (最近 {Math.min(filteredData.length, 10)} 条)
          </h4>
          <div className="space-y-2">
            {recent.map((row, i) => {
              const pct = Math.min(100, ((row.odds || 0) / 2) * 100);
              return (
                <div key={row.id || i} className="flex items-center gap-2 text-[11px]">
                  <span className="w-14 text-slate-500 text-right shrink-0">#{filteredData.length - recent.length + i + 1}</span>
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
        </div>

        <div className="bg-[#0F1424] rounded-2xl border border-slate-800/80 overflow-hidden">
          <div className="grid grid-cols-12 gap-2 px-4 py-2 text-[11px] text-slate-500 border-b border-slate-800 font-medium">
            <div className="col-span-1">#</div>
            <div className="col-span-4">比赛</div>
            <div className="col-span-2 text-center">策略</div>
            <div className="col-span-2 text-center">赔率</div>
            <div className="col-span-3 text-right">时间</div>
          </div>
          {filteredData.map((row, i) => (
            <div key={row.id || i} className="grid grid-cols-12 gap-2 px-4 py-2 text-[11px] border-b border-slate-800/30 hover:bg-slate-800/10">
              <div className="col-span-1 text-slate-500">{i + 1}</div>
              <div className="col-span-4 text-slate-200 truncate">{row.match_name || row.match_id || "—"}</div>
              <div className="col-span-2 text-center text-emerald-400 font-mono">
                {row.strategy_id || "—"}{row.count > 1 ? ` (×${row.count})` : ""}
              </div>
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
    let filteredBets = betsData;
    if (filterStrategy !== "all") {
      filteredBets = betsData.filter(d => String(d.strategy_id) === filterStrategy);
    }
    filteredBets = [...filteredBets].sort((a: BetRecord, b: BetRecord) => {
      if (sortBy === "time-desc") return (b.created_at || "").localeCompare(a.created_at || "");
      if (sortBy === "time-asc") return (a.created_at || "").localeCompare(b.created_at || "");
      if (sortBy === "odds-desc") return (b.odds || 0) - (a.odds || 0);
      if (sortBy === "odds-asc") return (a.odds || 0) - (b.odds || 0);
      return 0;
    });

    const handleRetry = async (betId: number) => {
      try {
        const resp = await fetch(`/api/corner/retry-bet/${betId}`, { method: "POST" });
        const json = await resp.json();
        if (json.success) {
          fetchBets();
        } else {
          setError(json.error || "重试失败");
        }
      } catch (err: any) {
        setError(err.message || "网络错误");
      }
    };

    const statusLabel = (status: string, errorMsg: string | null) => {
      switch (status) {
        case 'success': return { text: '成功', cls: 'bg-emerald-500/15 text-emerald-400' };
        case 'executed': return { text: '已执行', cls: 'bg-emerald-500/15 text-emerald-400' };
        case 'failed': return { text: '失败', cls: 'bg-rose-500/15 text-rose-400', title: errorMsg || '未知错误' };
        case 'insufficient': return { text: '余额不足', cls: 'bg-orange-500/15 text-orange-400', title: errorMsg || '余额不足' };
        case 'pending': return { text: '待执行', cls: 'bg-amber-500/15 text-amber-400' };
        case 'pending_confirm': return { text: '待确认', cls: 'bg-blue-500/15 text-blue-400' };
        case 'rejected': return { text: '已拒绝', cls: 'bg-slate-500/15 text-slate-400' };
        default: return { text: status, cls: 'bg-slate-500/15 text-slate-400' };
      }
    };

    if (filteredBets.length === 0 && !loading) {
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
        <div className="grid grid-cols-16 gap-2 px-4 py-2 text-[11px] text-slate-500 border-b border-slate-800 font-medium">
          <div className="col-span-3">比赛</div>
          <div className="col-span-1 text-center">策略</div>
          <div className="col-span-1 text-center">赔率</div>
          <div className="col-span-1 text-center">金额</div>
          <div className="col-span-2 text-center">投注盘口</div>
          <div className="col-span-2 text-center">状态</div>
          <div className="col-span-1 text-center">重试</div>
          <div className="col-span-2 text-center">执行时间</div>
          <div className="col-span-1 text-right">创建时间</div>
          <div className="col-span-2 text-center">操作</div>
        </div>
        {filteredBets.map((row) => {
          const st = statusLabel(row.status, row.error_reason || row.error_message);
          const canRetry = row.status === 'failed' || row.status === 'insufficient';
          const showError = (row.status === 'failed' || row.status === 'insufficient') && row.error_reason;
          return (
            <div key={row.id} className="grid grid-cols-16 gap-2 px-4 py-2 text-[11px] border-b border-slate-800/30 hover:bg-slate-800/10">
              <div className="col-span-3 text-slate-200 truncate">{row.match_name || row.match_id || "—"}</div>
              <div className="col-span-1 text-center text-emerald-400 font-mono">{row.strategy_id}</div>
              <div className="col-span-1 text-center text-amber-400 font-mono">{(row.odds ?? 0).toFixed(2)}</div>
              <div className="col-span-1 text-center text-slate-300 font-mono">¥{row.amount || 0}</div>
              <div className="col-span-2 text-center text-cyan-400 text-[10px] truncate">{row.bet_target || "—"}</div>
              <div className="col-span-2 text-center">
                <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${st.cls}`} title={st.title}>
                  {st.text}
                </span>
                {showError && (
                  <div className="text-[9px] text-rose-400 mt-0.5 truncate" title={row.error_reason || ""}>
                    {row.error_reason}
                  </div>
                )}
              </div>
              <div className="col-span-1 text-center text-slate-500 font-mono">{row.retry_count || 0}</div>
              <div className="col-span-2 text-center text-slate-500 text-[10px]">{row.executed_at?.slice(0, 19) || "—"}</div>
              <div className="col-span-1 text-right text-slate-500 text-[10px]">{row.created_at?.slice(0, 16) || "—"}</div>
              <div className="col-span-2 text-center">
                {canRetry && (
                  <button
                    onClick={() => handleRetry(row.id)}
                    className="px-2 py-0.5 text-[10px] text-amber-400 hover:text-white bg-amber-500/10 hover:bg-amber-600/30 rounded border border-amber-500/30 hover:border-amber-500/60 transition-all"
                  >
                    重试
                  </button>
                )}
              </div>
            </div>
          );
        })}
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
        <div className="flex items-center gap-2">
          <button onClick={() => {
            if (subTab === "trigger") fetchHistory();
            else fetchBets();
          }} disabled={loading}
            className="flex items-center gap-1 px-3 py-1.5 text-xs text-slate-400 hover:text-white bg-slate-800/50 hover:bg-slate-700/50 rounded-lg border border-slate-700/50 transition-all disabled:opacity-50">
            <RefreshCw className={`w-3 h-3 ${loading ? "animate-spin" : ""}`} /> 刷新
          </button>
          <button
            onClick={async () => {
              if (!window.confirm("确定清空所有触发历史和投注记录？此操作不可撤销！")) return;
              try {
                const resp = await fetch("/api/corner/history", { method: "DELETE" });
                const json = await resp.json();
                if (json.success) {
                  if (subTab === "trigger") fetchHistory();
                  else fetchBets();
                } else {
                  setError(json.error || "清空失败");
                }
              } catch (err: any) {
                setError(err.message || "网络错误");
              }
            }}
            className="flex items-center gap-1 px-3 py-1.5 text-xs text-rose-400 hover:text-white bg-slate-800/50 hover:bg-rose-600/50 rounded-lg border border-slate-700/50 hover:border-rose-500/50 transition-all"
          >
            🗑️ 清空
          </button>
        </div>
      </div>

      {/* 子 Tab 切换 */}
      <div className="flex items-center gap-2">
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

      {/* 筛选控件 */}
      <div className="flex flex-wrap items-center gap-3">
        <select
          value={filterStrategy}
          onChange={(e) => setFilterStrategy(e.target.value)}
          className="bg-[#0F1424] border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-emerald-500/50"
        >
          <option value="all">全部策略</option>
          <option value="1">策略1</option>
          <option value="2">策略2</option>
          <option value="3">策略3</option>
          <option value="4">策略4</option>
          <option value="5">策略5</option>
        </select>
        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value)}
          className="bg-[#0F1424] border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-emerald-500/50"
        >
          <option value="time-desc">时间（最新优先）</option>
          <option value="time-asc">时间（最早优先）</option>
          <option value="odds-desc">赔率（从高到低）</option>
          <option value="odds-asc">赔率（从低到高）</option>
        </select>
      </div>

      {error && <p className="text-[11px] text-rose-400">⚠️ {error}</p>}

      {subTab === "trigger" ? renderTriggerTab() : renderBetsTab()}
    </div>
  );
}
