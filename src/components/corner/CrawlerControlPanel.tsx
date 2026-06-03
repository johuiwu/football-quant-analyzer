import React, { useState, useEffect } from "react";
import { RefreshCw, Play, Square, Activity, Calendar, Trophy, Settings, ChevronDown, ChevronUp, Pause, TrendingUp } from "lucide-react";
import { useCornerStore } from "../../store/cornerStore";
import { translateLeague, translateTeam, translateTime } from "../../data/cornerTranslations";

interface CrawlerStatus {
  isLoggedIn: boolean;
  lastUpdate: string | null;
  error: string | null;
  matchesCount: number;
}

interface ScheduleItem {
  id: string;
  league: string;
  homeTeam: string;
  awayTeam: string;
  time: string;
  date: string;
}

export default function CrawlerControlPanel() {
  const [status, setStatus] = useState<CrawlerStatus>({
    isLoggedIn: false,
    lastUpdate: null,
    error: null,
    matchesCount: 0,
  });
  const [loading, setLoading] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [crawlerData, setCrawlerData] = [useCornerStore((s) => s.crawlerData), useCornerStore((s) => s.setCrawlerData)];
const [scheduleData, setScheduleData] = [useCornerStore((s) => s.scheduleData), useCornerStore((s) => s.setScheduleData)];
  const [activeTab, setActiveTab] = useState<"matches" | "schedule" | "raw" | "settings">("matches");
  const [credentials, setCredentials] = useState({ username: "johui888", password: "aa123123" });
  const [message, setMessage] = useState<{ type: "success" | "error" | "info"; text: string } | null>(null);
  const [expandedMatches, setExpandedMatches] = useState<Set<string>>(new Set());
  const [executingBets, setExecutingBets] = useState(false);
  const [showBetConfirm, setShowBetConfirm] = useState(false);
  const setLoginStatus = useCornerStore((s) => s.setLoginStatus);
  const [isPaused, setIsPaused] = useState(false);


  const [isMonitoring, setIsMonitoring] = useState(false);

  const showMessage = (type: "success" | "error" | "info", text: string) => {
    setMessage({ type, text });
    setTimeout(() => setMessage(null), 3000);
  };

  const handleStartMonitor = async (e?: React.MouseEvent) => {
    if (e) e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch("/api/corner/start", { method: "POST" });
      const data = await res.json();
      if (data.success) {
        setIsMonitoring(true);
        showMessage("success", "角球监控已启动，等待首批数据...");
        // 延迟5秒开启自动刷新，给后端首次爬取留足时间
        setTimeout(() => {
          setAutoRefresh(true);
        }, 5000);
      } else {
        showMessage("error", data.error || "启动监控失败");
      }
    } catch (err) {
      showMessage("error", "启动监控请求失败");
    } finally {
      setLoading(false);
    }
  };

  const handlePauseMonitor = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/corner/pause", { method: "POST" });
      const data = await res.json();
      if (data.success) {
        setIsPaused(true);
        setAutoRefresh(false);
        showMessage("info", "角球监控已暂停");
      } else {
        showMessage("error", data.error || "暂停失败");
      }
    } catch (err) {
      showMessage("error", "暂停请求失败");
    } finally {
      setLoading(false);
    }
  };

  const handleResumeMonitor = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/corner/resume", { method: "POST" });
      const data = await res.json();
      if (data.success) {
        setIsPaused(false);
        setAutoRefresh(true);
        // 恢复后立即拉一次数据
        fetchMatches(true);
        showMessage("success", "角球监控已恢复");
      } else {
        showMessage("error", data.error || "恢复失败");
      }
    } catch (err) {
      showMessage("error", "恢复请求失败");
    } finally {
      setLoading(false);
    }
  };


  const handleStopMonitor = async (e?: React.MouseEvent) => {
    if (e) e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch("/api/corner/stop", { method: "POST" });
      const data = await res.json();
      if (data.success) {
        setIsMonitoring(false);
        setAutoRefresh(false);
        showMessage("info", "角球监控已停止");
      }
    } catch (err) {
      showMessage("error", "停止监控请求失败");
    } finally {
      setLoading(false);
    }
  };

  const fetchStatus = async () => {
    try {
      const res = await fetch("/api/corner/status");
      const data = await res.json();
      if (data.success) {
        setStatus(data.data);
      }
    } catch (err) {
      console.error("获取状态失败:", err);
    }
  };

  const handleLogin = async (e?: React.MouseEvent) => {
    if (e) e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch("/api/corner/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(credentials),
      });
      const data = await res.json();
      if (data.success) {
        showMessage("success", "登录成功！");
        await fetchStatus();
        setLoginStatus(true, credentials.username);
      } else {
        showMessage("error", data.error || "登录失败");
      }
    } catch (err) {
      showMessage("error", "请求失败");
    } finally {
      setLoading(false);
    }
  };

  const fetchMatches = async (e_or_forceCorner?: React.MouseEvent | boolean) => {
    const forceCorner = typeof e_or_forceCorner === "boolean" ? e_or_forceCorner : false;
    const e = typeof e_or_forceCorner !== "boolean" ? e_or_forceCorner : undefined;
    if (e) { e.preventDefault(); e.stopPropagation(); }
    setLoading(true);
    try {
      // 角球监控模式下使用角球专用 API，否则使用通用爬虫 API
      // 角球登录后使用角球专用API，否则用通用爬虫API
      const isLoggedInCorner = useCornerStore.getState().isLoggedIn;
      const useCornerApi = forceCorner || isMonitoring || isLoggedInCorner;
      const apiUrl = useCornerApi ? "/api/corner/live" : "/api/crawler/matches";
      const res = await fetch(apiUrl);
      const data = await res.json();
      console.log("[角球] 数据返回:", data?.success, "count:", data?.count);
      if (data.success) {
        const rawMatches = data.data || [];
        const matchCount = Array.isArray(rawMatches) ? rawMatches.length : (rawMatches?.matches?.length || 0);
        
        // 更新 CrawlerControlPanel 本地状态
        setCrawlerData({
          matches: Array.isArray(rawMatches) ? rawMatches : (rawMatches?.matches || []),
          allText: data.data?.allText || [],
          allElements: data.data?.allElements || []
        } as any);
        setStatus(prev => ({ ...prev, matchesCount: matchCount, lastUpdate: Date.now() }));
        
        // 映射到 CornerLiveMatch 格式并写入 Store，供 LiveMonitor 渲染
        const matchList = Array.isArray(rawMatches) ? rawMatches : (rawMatches?.matches || []);
        if (matchList.length > 0) {
          const mapped = matchList.map((item) => ({
            matchId: String(item.matchId || "unknown"),
            homeTeam: item.homeTeam || "--",
            awayTeam: item.awayTeam || "--",
            elapsedMinutes: Number(item.elapsedMinutes) || 0,
            homeScore: Number(item.homeScore) || 0,
            awayScore: Number(item.awayScore) || 0,
            homeCorners: Number(item.homeCorners) || 0,
            awayCorners: Number(item.awayCorners) || 0,
            cornerHandicap: Number(item.cornerHandicap) || 0,
            cornerOdds: Number(item.cornerOdds) || 0,
            handicaps: item.handicaps || [],
            triggeredStrategies: item.triggeredStrategies || []
          }));
          useCornerStore.getState().setLiveMatches(mapped);
        } else {
          useCornerStore.getState().setLiveMatches([]);
        }
        if (data.cacheEmpty) {
          showMessage("info", "数据准备中，请稍候...");
        } else {
          showMessage("info", `获取到 ${matchCount} 场比赛`);
        }
      } else {
        showMessage("error", data.error || "获取比赛失败");
      }
      if (!useCornerApi) {
        await fetchStatus();
      }
    } catch (err) {
      console.error("[角球] 请求失败:", err);
      showMessage("error", "请求失败");
    } finally {
      setLoading(false);
    }
  };

  const fetchSchedule = async (e?: React.MouseEvent) => {
    if (e) e.preventDefault();
    setLoading(true);
    try {
      // TODO: 需要后端添加 /api/corner/schedule 端点，当前暂用 /api/crawler/schedule
      const res = await fetch("/api/crawler/schedule");
      const data = await res.json();
      if (data.success) {
        // 保存赛程数据
        if (data.data && data.data.matches) {
          const scheduleItems: ScheduleItem[] = data.data.matches.map((match: any, idx: number) => ({
            id: match.matchId || `schedule-${idx}`,
            league: match.league,
            homeTeam: match.homeTeam,
            awayTeam: match.awayTeam,
            time: match.time,
            date: new Date().toLocaleDateString(),
          }));
          setScheduleData(scheduleItems);
        }
        showMessage("info", `获取到 ${data.count || 0} 条赛程`);
        // 自动切换到赛程标签
        setActiveTab("schedule");
      } else {
        showMessage("error", data.error || "获取赛程失败");
      }
      await fetchStatus();
    } catch (err) {
      console.error("请求失败:", err);
      showMessage("error", "请求失败");
    } finally {
      setLoading(false);
    }
  };

  const handleClose = async (e?: React.MouseEvent) => {
    if (e) e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch("/api/corner/close", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (data.success) {
        showMessage("success", "浏览器已关闭");
        setCrawlerData(null);
      }
      await fetchStatus();
      setLoginStatus(false, '');
    } catch (err) {
      showMessage("error", "请求失败");
    } finally {
      setLoading(false);
    }
  };

  const handleExecutePendingBets = async (e?: React.MouseEvent) => {
    if (e) e.preventDefault();
    if (executingBets) return;
    setExecutingBets(true);
    try {
      const res = await fetch("/api/corner/bets/execute", { method: "POST" });
      const data = await res.json();
      if (data.success) {
        showMessage("success", `投注执行完成: ${data.executed || 0} 成功, ${data.failed || 0} 失败`);
      } else {
        showMessage("error", data.error || "执行失败");
      }
    } catch (err) {
      showMessage("error", "请求失败");
    } finally {
      setExecutingBets(false);
    }
  };

  const cancelBetConfirm = () => {
    setShowBetConfirm(false);
  };

  const confirmExecuteBets = async () => {
    setShowBetConfirm(false);
    await handleExecutePendingBets();
  };

  const toggleMatchExpand = (matchId: string) => {
    const newExpanded = new Set(expandedMatches);
    if (newExpanded.has(matchId)) {
      newExpanded.delete(matchId);
    } else {
      newExpanded.add(matchId);
    }
    setExpandedMatches(newExpanded);
  };

  useEffect(() => {
    fetchStatus();
  }, []);

  useEffect(() => {
    let interval: NodeJS.Timeout | null = null;
    if (autoRefresh) {
      // 立即拉取一次数据，然后每10秒轮询
      fetchMatches(true);
      interval = setInterval(() => {
        fetchMatches(true);
      }, 5000);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [autoRefresh, isMonitoring]);

  return (
    <div className="bg-[#0F1424] rounded-2xl border border-slate-800/80 p-6">
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
        <div>
          <h3 className="text-lg font-semibold text-slate-200 flex items-center gap-2">
            <Activity className="w-5 h-5 text-emerald-400" />
            实时数据
          </h3>
          <p className="text-xs text-slate-500 mt-1">
            实时比赛数据爬取与监控
          </p>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-900/50 rounded-lg border border-slate-800">
            <span className={`w-2 h-2 rounded-full ${status.isLoggedIn ? "bg-emerald-500 animate-pulse" : "bg-slate-600"}`} />
            <span className="text-xs text-slate-400">
              {status.isLoggedIn ? "已登录" : "未登录"}
            </span>
          </div>
          <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-900/50 rounded-lg border border-slate-800">
            <Trophy className="w-3.5 h-3.5 text-amber-400" />
            <span className="text-xs text-slate-400">{status.matchesCount} 场</span>
          </div>
        </div>
      </div>

      {message && (
        <div className={`mb-4 px-4 py-2 rounded-lg text-xs ${
          message.type === "success"
            ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30"
            : message.type === "error"
            ? "bg-rose-500/15 text-rose-400 border border-rose-500/30"
            : "bg-blue-500/15 text-blue-400 border border-blue-500/30"
        }`}>
          {message.text}
        </div>
      )}

      {status.error && (
        <div className="mb-4 px-4 py-2 rounded-lg text-xs bg-rose-500/15 text-rose-400 border border-rose-500/30">
          ⚠️ {status.error}
        </div>
      )}

      <div className="flex flex-wrap gap-2 mb-6">
        <button type="button"
          onClick={(e) => handleLogin(e)}
          disabled={loading || status.isLoggedIn}
          className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-700 disabled:opacity-50 text-white text-xs rounded-lg transition-colors"
        >
          <Play className="w-3.5 h-3.5" />
          {status.isLoggedIn ? "已登录" : "登录并启动"}
        </button>

        <button type="button"
          onClick={(e) => fetchMatches(e)}
          disabled={loading || isMonitoring || !status.isLoggedIn}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:bg-slate-700 disabled:opacity-50 text-white text-xs rounded-lg transition-colors"
        >
          <Activity className="w-3.5 h-3.5" />
          获取比赛
        </button>

        <button type="button"
          onClick={(e) => fetchSchedule(e)}
          disabled={loading || isMonitoring || !status.isLoggedIn}
          className="flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-500 disabled:bg-slate-700 disabled:opacity-50 text-white text-xs rounded-lg transition-colors"
        >
          <Calendar className="w-3.5 h-3.5" />
          获取赛程
        </button>


        <button type="button"
          onClick={isMonitoring ? handleStopMonitor : handleStartMonitor}
          disabled={loading}
          className={`flex items-center gap-2 px-4 py-2 text-white text-xs rounded-lg transition-colors ${
            isMonitoring
              ? "bg-rose-600 hover:bg-rose-500"
              : "bg-emerald-600 hover:bg-emerald-500"
          } disabled:bg-slate-700 disabled:opacity-50`}
        >
          {loading ? (
            <RefreshCw className="w-3.5 h-3.5 animate-spin" />
          ) : isMonitoring ? (
            <Square className="w-3.5 h-3.5" />
          ) : (
            <RefreshCw className="w-3.5 h-3.5" />
          )}
          {loading ? "操作中..." : isMonitoring ? "停止角球监控" : "启动角球监控"}
        </button>
        {isMonitoring && (
          <button type="button"
            onClick={isPaused ? handleResumeMonitor : handlePauseMonitor}
            disabled={loading}
            className={`flex items-center gap-2 px-4 py-2 text-white text-xs rounded-lg transition-colors ${
              isPaused
                ? "bg-amber-600 hover:bg-amber-500"
                : "bg-yellow-600 hover:bg-yellow-500"
            } disabled:bg-slate-700 disabled:opacity-50`}
          >
            {isPaused ? (
              <><Play className="w-3.5 h-3.5" /> 恢复监控</>
            ) : (
              <><Pause className="w-3.5 h-3.5" /> 暂停监控</>
            )}
          </button>
        )}
        {/* 投注风险确认对话框 */}
        {showBetConfirm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
            <div className="bg-slate-800 border border-slate-700 rounded-xl p-6 max-w-md w-full mx-4 shadow-2xl">
              <h3 className="text-lg font-semibold text-amber-400 mb-3">⚠️ 自动投注风险确认</h3>
              <p className="text-sm text-slate-300 mb-4">
                自动投注功能通过模拟浏览器操作在 HG 网站上下注，<strong className="text-red-400">DOM 选择器可能因网站改版而失效</strong>，
                存在投注失败、误操作或资金损失的风险。
              </p>
              <p className="text-sm text-slate-400 mb-6">
                建议：仅在确认 HG 网站页面结构无变化且已充分测试后使用。
              </p>
              <div className="flex gap-3 justify-end">
                <button
                  onClick={cancelBetConfirm}
                  className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-slate-300 text-sm rounded-lg transition-colors"
                >
                  取消
                </button>
                <button
                  onClick={confirmExecuteBets}
                  className="px-4 py-2 bg-amber-600 hover:bg-amber-500 text-white text-sm rounded-lg transition-colors"
                >
                  确认执行投注
                </button>
              </div>
            </div>
          </div>
        )}

        <button type="button"
          onClick={(e) => handleExecutePendingBets(e)}
          disabled={executingBets || !status.isLoggedIn}
          className="flex items-center gap-2 px-4 py-2 bg-amber-600 hover:bg-amber-500 disabled:bg-slate-700 disabled:opacity-50 text-white text-xs rounded-lg transition-colors"
        >
          {executingBets ? (
            <RefreshCw className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <TrendingUp className="w-3.5 h-3.5" />
          )}
          {executingBets ? "执行中..." : "执行待处理投注"}
        </button>
        <button type="button"
          onClick={(e) => handleClose(e)}
          disabled={loading || !status.isLoggedIn}
          className="flex items-center gap-2 px-4 py-2 bg-rose-600 hover:bg-rose-500 disabled:bg-slate-700 disabled:opacity-50 text-white text-xs rounded-lg transition-colors ml-auto"
        >
          <Square className="w-3.5 h-3.5" />
          关闭浏览器
        </button>

        <label className="flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs rounded-lg cursor-pointer transition-colors">
          <input
            type="checkbox"
            checked={autoRefresh}
            onChange={(e) => setAutoRefresh(e.target.checked)}
            disabled={!isMonitoring}
            className="rounded border-slate-600 text-emerald-500 focus:ring-emerald-500"
          />
          <span>自动刷新 (10s)</span>
        </label>
      </div>

      <div className="flex gap-2 mb-4 border-b border-slate-800 pb-2">
        {[
          { id: "matches", icon: <Activity className="w-3.5 h-3.5" />, label: "实时比赛" },
          { id: "schedule", icon: <Calendar className="w-3.5 h-3.5" />, label: "赛程" },
          { id: "raw", icon: <Activity className="w-3.5 h-3.5" />, label: "原始数据" },
          { id: "settings", icon: <Settings className="w-3.5 h-3.5" />, label: "设置" },
        ].map((tab) => (
          <button type="button"
            key={tab.id}
            onClick={() => setActiveTab(tab.id as any)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              activeTab === tab.id
                ? "bg-emerald-600 text-white"
                : "text-slate-400 hover:text-slate-200 hover:bg-slate-800"
            }`}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === "matches" && (
        <div className="space-y-4 max-h-[600px] overflow-y-auto">
          {!crawlerData || !(crawlerData.matches || []).length ? (
            <div className="text-center py-8 text-slate-500 text-sm">
              {isMonitoring ? "监控运行中，等待首批数据到达..." : "暂无比赛数据，请先点击「获取比赛」"}
            </div>
          ) : (
            (crawlerData.matches || []).map((match) => {
              return (
                <div key={match.matchId} className="bg-slate-900/50 rounded-xl border border-slate-800 overflow-hidden">
                  <div
                    className="p-4 cursor-pointer flex items-center justify-between hover:bg-slate-800/50 transition-colors"
                    onClick={() => toggleMatchExpand(match.matchId)}
                  >
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <span className="text-xs px-2 py-0.5 bg-slate-800 rounded text-slate-400">{translateLeague(match.league)}</span>
                        <span className="text-xs text-slate-500">{translateTime(match.time)}</span>
                      </div>
                      <div className="flex items-center gap-4">
                        <div className="text-center">
                          <div className="text-sm font-medium text-slate-200">{translateTeam(match.homeTeam)}</div>
                        </div>
                        <div className="text-center">
                          <div className="text-lg font-bold text-slate-300">
                            {match.homeScore ?? 0} - {match.awayScore ?? 0}
                          </div>
                          {match.totalCorners > 0 && (
                            <div className="text-xs text-amber-400">
                              角球: {match.totalCorners}
                            </div>
                          )}
                        </div>
                        <div className="text-center">
                          <div className="text-sm font-medium text-slate-200">{translateTeam(match.awayTeam)}</div>
                        </div>
                      </div>
                    </div>
                    <button type="button" className="text-slate-400 hover:text-slate-200">
                      {expandedMatches.has(match.matchId) ? (
                        <ChevronUp className="w-5 h-5" />
                      ) : (
                        <ChevronDown className="w-5 h-5" />
                      )}
                    </button>
                  </div>

                  {expandedMatches.has(match.matchId) && (
                    <div className="p-4 border-t border-slate-800 bg-slate-900/30">
                      {/* 展示所有盘口数据 (handicaps) */}
                      {(() => {
                        const handicaps = match.handicaps || [];
                        
                        if (handicaps.length === 0) {
                          return (
                            <div className="bg-slate-800/30 rounded-lg p-4 text-center text-slate-500 text-sm">
                              暂无角球盘口数据
                            </div>
                          );
                        }

                        const colCount = handicaps.length;
                        const gridCols = colCount <= 2 ? "grid-cols-2"
                          : colCount <= 4 ? "grid-cols-4"
                          : "grid-cols-4";

                        // 颜色体系：蓝=O/U, 橙=HDP, 紫=1X2, 绿=O/E（full深色 half浅色）
                        const categoryColors: Record<string, { bg: string; text: string; border: string }> = {
                          "O/U":   { bg: "from-blue-900/50 to-slate-800/50",   text: "text-blue-300",   border: "border-blue-800/30" },
                          "O/U_half": { bg: "from-blue-800/30 to-slate-800/50", text: "text-blue-300/70", border: "border-blue-700/20" },
                          "HDP":   { bg: "from-orange-900/50 to-slate-800/50", text: "text-orange-300",  border: "border-orange-800/30" },
                          "HDP_half":{ bg: "from-orange-800/30 to-slate-800/50",text: "text-orange-300/70",border: "border-orange-700/20" },
                          "1X2":   { bg: "from-purple-900/50 to-slate-800/50",text: "text-purple-300",  border: "border-purple-800/30" },
                          "1X2_half":{bg: "from-purple-800/30 to-slate-800/50",text: "text-purple-300/70",border: "border-purple-700/20" },
                          "O/E":   { bg: "from-green-900/50 to-slate-800/50", text: "text-green-300",   border: "border-green-800/30" },
                          "O/E_half":{bg: "from-green-800/30 to-slate-800/50", text: "text-green-300/70", border: "border-green-700/20" },
                        };

                        return (
                          <div className={`grid ${gridCols} gap-3`}>
                            {handicaps.map((h) => {
                              const colorKey = h.period === "half" ? `${h.category}_half` : h.category;
                              const colors = categoryColors[colorKey] || categoryColors["O/U"];
                              let label = h.categoryLabel || h.category;
                              if (label.length > 6) label = label.replace("上半场 ", "半");

                              return (
                                <div key={h.order || label} className={`bg-gradient-to-br ${colors.bg} rounded-lg p-3 border ${colors.border}`}>
                                  <div className={`text-xs ${colors.text} mb-2 font-medium text-center`}>{label}</div>
                                  {h.category === "O/U" && (
                                    <>
                                      <div className="text-center">
                                        <div className="text-xs text-slate-400">大 {h.line ?? "--"}</div>
                                        <div className="text-lg font-bold text-white">{(h.odds?.over || 0).toFixed(2)}</div>
                                      </div>
                                      <div className="text-center mt-2 pt-2 border-t border-slate-700">
                                        <div className="text-xs text-slate-400">小 {h.line ?? "--"}</div>
                                        <div className="text-lg font-bold text-white">{(h.odds?.under || 0).toFixed(2)}</div>
                                      </div>
                                    </>
                                  )}
                                  {h.category === "HDP" && (
                                    <>
                                      <div className="text-center">
                                        <div className="text-xs text-slate-400">{translateTeam(match.homeTeam)} ({h.line ?? "--"})</div>
                                        <div className="text-lg font-bold text-white">{(h.odds?.home || 0).toFixed(2)}</div>
                                      </div>
                                      <div className="text-center mt-2 pt-2 border-t border-slate-700">
                                        <div className="text-xs text-slate-400">{translateTeam(match.awayTeam)} ({h.line ?? "--"})</div>
                                        <div className="text-lg font-bold text-white">{(h.odds?.away || 0).toFixed(2)}</div>
                                      </div>
                                    </>
                                  )}
                                  {h.category === "1X2" && (
                                    <div className="flex justify-around text-center">
                                      <div>
                                        <div className="text-xs text-slate-400">主</div>
                                        <div className="text-sm font-bold text-white">{(h.odds?.home || 0).toFixed(2)}</div>
                                      </div>
                                      <div>
                                        <div className="text-xs text-slate-400">和</div>
                                        <div className="text-sm font-bold text-white">{(h.odds?.draw || 0).toFixed(2)}</div>
                                      </div>
                                      <div>
                                        <div className="text-xs text-slate-400">客</div>
                                        <div className="text-sm font-bold text-white">{(h.odds?.away || 0).toFixed(2)}</div>
                                      </div>
                                    </div>
                                  )}
                                  {h.category === "O/E" && (
                                    <>
                                      <div className="text-center">
                                        <div className="text-xs text-slate-400">单</div>
                                        <div className="text-lg font-bold text-white">{(h.odds?.odd || 0).toFixed(2)}</div>
                                      </div>
                                      <div className="text-center mt-2 pt-2 border-t border-slate-700">
                                        <div className="text-xs text-slate-400">双</div>
                                        <div className="text-lg font-bold text-white">{(h.odds?.even || 0).toFixed(2)}</div>
                                      </div>
                                    </>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        );
                      })()}

                    </div>
                  )}
                </div>
              )
            })
          )}
        </div>
      )}

      {activeTab === "settings" && (
        <div className="space-y-4">
          <div>
            <label className="block text-xs text-slate-400 mb-1.5">用户名</label>
            <input
              type="text"
              value={credentials.username}
              onChange={(e) => setCredentials({ ...credentials, username: e.target.value })}
              className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-lg text-xs text-slate-200 focus:outline-none focus:border-emerald-500"
            />
          </div>
          <div>
            <label className="block text-xs text-slate-400 mb-1.5">密码</label>
            <input
              type="password"
              value={credentials.password}
              onChange={(e) => setCredentials({ ...credentials, password: e.target.value })}
              className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-lg text-xs text-slate-200 focus:outline-none focus:border-emerald-500"
            />
          </div>
          <div className="pt-2">
            <p className="text-xs text-slate-500 mb-2">
              💡 提示：修改 CRAWLER_HEADLESS 环境变量可切换浏览器显示模式
            </p>
            <p className="text-xs text-slate-600">
              - CRAWLER_HEADLESS=true (默认)：无界面模式<br />
              - CRAWLER_HEADLESS=false：显示浏览器窗口
            </p>
          </div>
        </div>
      )}

      {activeTab === "schedule" && (
        <div className="space-y-3 max-h-[600px] overflow-y-auto">
          {!scheduleData.length ? (
            <div className="text-center py-8 text-slate-500 text-sm">
              暂无赛程数据，请先点击「获取赛程」
            </div>
          ) : (
            scheduleData.map((item) => (
              <div key={item.id} className="bg-slate-900/50 rounded-xl border border-slate-800 p-4">
                <div className="flex items-center gap-3 mb-2">
                  <span className="text-xs px-2 py-0.5 bg-slate-800 rounded text-slate-400">{translateLeague(item.league)}</span>
                  <span className="text-xs text-slate-500">{item.date}</span>
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex-1 grid grid-cols-3 gap-4 text-center">
                    <div>
                      <div className="text-sm font-medium text-slate-200">{translateTeam(item.homeTeam)}</div>
                    </div>
                    <div>
                      <div className="text-xs text-slate-400">VS</div>
                    </div>
                    <div>
                      <div className="text-sm font-medium text-slate-200">{translateTeam(item.awayTeam)}</div>
                    </div>
                  </div>
                </div>
                {item.time && (
                  <div className="mt-2 text-center text-xs text-amber-400">
                    时间: {translateTime(item.time)}
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      )}

      {status.lastUpdate && (
        <div className="mt-4 pt-4 border-t border-slate-800 text-xs text-slate-500 flex items-center gap-2">
          <RefreshCw className="w-3 h-3" />
          最后更新: {new Date(status.lastUpdate).toLocaleTimeString()}
        </div>
      )}

      {activeTab === "raw" && (
        <div className="space-y-4 max-h-[600px] overflow-y-auto">
          {!crawlerData ? (
            <div className="text-center py-8 text-slate-500 text-sm">
              暂无原始数据，请先点击「获取比赛」
            </div>
          ) : (
            <>
              <div className="bg-slate-900/50 rounded-xl border border-slate-800 p-4">
                <h4 className="text-sm font-medium text-slate-300 mb-3">调试信息</h4>
                <pre className="text-xs text-slate-300 bg-slate-800/50 p-2 rounded overflow-x-auto">
                  {JSON.stringify(crawlerData, null, 2)}
                </pre>
              </div>

              <div className="bg-slate-900/50 rounded-xl border border-slate-800 p-4">
                <h4 className="text-sm font-medium text-slate-300 mb-3">原始文本列表（前100个）</h4>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  {(crawlerData.allText || []).slice(0, 100).map((text, idx) => (
                    <div key={idx} className="bg-slate-800/50 px-2 py-1 rounded">
                      <span className="text-slate-500 mr-2">{idx}.</span>
                      <span className="text-slate-300">{text}</span>
                    </div>
                  ))}
                </div>
                {(crawlerData.allText || []).length > 100 && (
                  <p className="text-xs text-slate-500 mt-2">...还有 {(crawlerData.allText || []).length - 100} 个文本</p>
                )}
              </div>

              <div className="bg-slate-900/50 rounded-xl border border-slate-800 p-4">
                <h4 className="text-sm font-medium text-slate-300 mb-3">原始元素（前50个，带位置）</h4>
                <div className="space-y-1 text-xs">
                  {(crawlerData.allElements || []).slice(0, 50).map((elem, idx) => (
                    <div key={idx} className="flex items-start gap-2 bg-slate-800/50 px-2 py-1 rounded">
                      <span className="text-slate-500 w-8 flex-shrink-0">{idx}.</span>
                      <span className="text-blue-400 w-16 flex-shrink-0">({elem.x},{elem.y})</span>
                      <span className="text-slate-300 truncate">{elem.text}</span>
                    </div>
                  ))}
                </div>
                {(crawlerData.allElements || []).length > 50 && (
                  <p className="text-xs text-slate-500 mt-2">...还有 {(crawlerData.allElements || []).length - 50} 个元素</p>
                )}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
