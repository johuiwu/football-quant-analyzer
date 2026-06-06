import React, { useState, useEffect } from "react";
import { RefreshCw, Play, StopCircle, Activity, Calendar, Trophy, Settings, ChevronDown, ChevronUp, Pause, TrendingUp, LogIn } from "lucide-react";
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
  handicaps: any[];
  hasCornerOdds: boolean;
}

export default function CrawlerControlPanel() {
  const [status, setStatus] = useState<CrawlerStatus>({
    isLoggedIn: false,
    lastUpdate: null,
    error: null,
    matchesCount: 0,
  });
  const [loading, setLoading] = useState(false);
  const [scheduleLoading, setScheduleLoading] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [crawlerData, setCrawlerData] = [useCornerStore((s) => s.crawlerData), useCornerStore((s) => s.setCrawlerData)];
  const [scheduleData, setScheduleData] = [useCornerStore((s) => s.scheduleData), useCornerStore((s) => s.setScheduleData)];
  const [mainMarketData, setMainMarketData] = [useCornerStore((s) => s.mainMarketData), useCornerStore((s) => s.setMainMarketData)];
  const [activeTab, setActiveTab] = useState<"matches" | "main_markets" | "schedule" | "raw" | "settings">("matches");
  const [credentials, setCredentials] = useState({ username: "johui888", password: "aa123123" });
  const [message, setMessage] = useState<{ type: "success" | "error" | "info"; text: string } | null>(null);
  const [expandedMatches, setExpandedMatches] = useState<Set<string>>(new Set());
  const [executingBets, setExecutingBets] = useState(false);
  const [showBetConfirm, setShowBetConfirm] = useState(false);
  const setLoginStatus = useCornerStore((s) => s.setLoginStatus);
  const storeIsLoggedIn = useCornerStore((s) => s.isLoggedIn);
  const isLoggedIn = status.isLoggedIn || storeIsLoggedIn;
  const [isPaused, setIsPaused] = useState(false);


  const [isBackendPolling, setIsBackendPolling] = useState(false);

  const fetchingRef = React.useRef(false);
  const messageTimerRef = React.useRef(null);

  const normalizeMatchForRender = (item, index) => ({
    ...item,
    matchId: item.matchId != null ? String(item.matchId) : "match-" + index,
    homeTeam: item.homeTeam || "--",
    awayTeam: item.awayTeam || "--",
    league: item.league || "",
    time: item.time || "",
    homeScore: item.homeScore ?? 0,
    awayScore: item.awayScore ?? 0,
    totalCorners: item.totalCorners ?? 0,
    handicaps: item.handicaps || [],
    _dataSource: item._dataSource || "",
  });


  const showMessage = (type: "success" | "error" | "info", text: string) => {
    if (messageTimerRef.current) {
      clearTimeout(messageTimerRef.current);
      messageTimerRef.current = null;
    }
    setMessage({ type, text });
    messageTimerRef.current = setTimeout(() => {
      messageTimerRef.current = null;
      setMessage(null);
    }, 3000);
  };

  const handleStartMonitor = async (e?: React.MouseEvent) => {
    if (e) e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch("/api/corner/start", { method: "POST" });
      const data = await res.json();
      if (data.success) {
        setIsBackendPolling(true);
        setAutoRefresh(true);
        showMessage("success", "启动成功，后台将自动获取数据");
        // 等待 8 秒后触发首次数据获取（先尝试即时爬取，失败则从缓存读取）
        setTimeout(async () => {
          await fetchMatches(true); // forceCorner=true，走 /api/corner/fetch 即时爬取
        }, 8000);
      } else {
        showMessage("error", data.error || "启动失败");
      }
    } catch (err) {
      showMessage("error", "启动监控失败");
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
        showMessage("info", "监控已暂停");
      } else {
        showMessage("error", data.error || "暂停失败");
      }
    } catch (err) {
      showMessage("error", "暂停失败");
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
        fetchMatches(true);
        showMessage("success", "监控已恢复");
      } else {
        showMessage("error", data.error || "恢复失败");
      }
    } catch (err) {
      showMessage("error", "恢复监控失败");
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
        setIsBackendPolling(false);
        setAutoRefresh(false);
        showMessage("info", "监控已停止");
      }
    } catch (err) {
      showMessage("error", "停止监控失败");
    } finally {
      setLoading(false);
    }
  };

  const fetchStatus = async () => {
    try {
      const res = await fetch("/api/corner/status");
      const data = await res.json();
      if (data.success) {
        const crawler = data.data?.crawler || {};
        const backend = data.data?.backend || {};
        setStatus(prev => ({
          ...prev,
          isLoggedIn: crawler.isLoggedIn || false,
          lastUpdate: crawler.lastUpdate || prev.lastUpdate,
          matchesCount: backend.cachedCount || prev.matchesCount,
          error: null,
        }));
        // 同步后端轮询状态到前端 UI
        const backendPolling = backend.isPolling && !backend.isPaused;
        setIsBackendPolling(backendPolling);
        setIsPaused(!!backend.isPaused);
        // 后端暂停/停止时，同步关闭前端自动刷新，避免持续请求 /api/corner/live
        if (!backendPolling && autoRefresh) {
          setAutoRefresh(false);
        }
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
        setStatus(prev => ({ ...prev, isLoggedIn: true }));
        await fetchStatus();
        setLoginStatus(true, credentials.username);
      } else {
        // 显示详细错误原因和建议
        const errorText = data.error || "登录失败";
        const reason = data.reason || "";
        const detail = data.detail || "";
        const suggestion = data.suggestion || "";
        let fullMsg = errorText;
        if (detail && detail !== errorText) fullMsg += " - " + detail;
        if (suggestion) fullMsg += " (" + suggestion + ")";
        showMessage("error", fullMsg);
        console.error("[登录失败]", { error: errorText, reason, detail, suggestion });
      }
    } catch (err: any) {
      const errMsg = err.message || "登录请求失败";
      showMessage("error", "登录失败：" + errMsg + "（请确认后端服务已启动）");
    } finally {
      setLoading(false);
    }
  };

  const fetchMatches = async (e_or_forceCorner?: React.MouseEvent | boolean) => {
    if (fetchingRef.current) return;
    fetchingRef.current = true;
    const forceCorner = typeof e_or_forceCorner === "boolean" ? e_or_forceCorner : false;
    const e = typeof e_or_forceCorner !== "boolean" ? e_or_forceCorner : undefined;
    if (e) { e.preventDefault(); e.stopPropagation(); }
    try {
      const isLoggedInCorner = useCornerStore.getState().isLoggedIn;
      const useCornerApi = forceCorner || isBackendPolling || isLoggedInCorner;
      
      let apiData = null;
      let apiSource = "";
      
      if (forceCorner) {
        try {
          const fetchRes = await fetch("/api/corner/fetch", { method: "POST" });
          apiData = await fetchRes.json();
          apiSource = "/api/corner/fetch";
          // 即时爬取失败（如 Crawler busy）时回退到缓存接口
          if (!apiData?.success) {
            console.warn("[数据] 即时爬取失败:", apiData?.error || "unknown", "回退到缓存接口");
            apiData = null;
          }
        } catch (fetchErr) {
          console.warn("[数据] 实时获取失败，回退获取:", fetchErr);
        }
      }
      
      if (!apiData) {
        const fallbackUrl = "/api/corner/live";
        apiSource = fallbackUrl;
        const res = await fetch(fallbackUrl);
        apiData = await res.json();
      }
      
      console.log("[数据] 数据来源:", apiData?.success, "count:", apiData?.count, "source:", apiSource);
      if (apiData.success) {
        const rawMatches = apiData.data || [];
        const matchCount = Array.isArray(rawMatches) ? rawMatches.length : (rawMatches?.matches?.length || 0);
        
        if (matchCount > 0 || !apiData.cacheEmpty) {
          // 检查数据来源
          const firstDataSource = rawMatches.length > 0 ? (rawMatches[0]._dataSource || "") : "";
          if (firstDataSource === "today" && !isBackendPolling) {
            showMessage("info", "当前无实时比赛，展示赛程数据");
          }
          
          setCrawlerData({
            matches: (Array.isArray(rawMatches) ? rawMatches : (rawMatches?.matches || [])).map(normalizeMatchForRender),
            allText: apiData.data?.allText || [],
            allElements: apiData.data?.allElements || []
          } as any);
          setStatus(prev => ({ ...prev, matchesCount: matchCount, lastUpdate: Date.now() }));
          
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
              triggeredStrategies: item.triggeredStrategies || [],
              _dataSource: item._dataSource || "",
              _cornerSource: item._cornerSource || ""
            }));
            useCornerStore.getState().setLiveMatches(mapped);
          } else {
            useCornerStore.getState().setLiveMatches([]);
          }
          
        }

        // ★ 始终同步主盘口数据（无论角球数据是否存在）
        const recvMainMarkets = apiData.mainMarkets || {};
        if (Object.keys(recvMainMarkets).length > 0) {
          setMainMarketData(recvMainMarkets);
        }
        
        if (apiData.cacheEmpty && Object.keys(recvMainMarkets).length === 0) {
          showMessage("info", "数据采集中，请稍后刷新...");
        } else if (matchCount > 0) {
          // 禁用提示: showMessage("info", `获取到 ${matchCount} 场比赛`);
        }
      } else {
        showMessage("error", apiData.error || "获取比赛失败");
      }
      if (!useCornerApi) {
        await fetchStatus();
      }
    } catch (err) {
      console.error("[数据] 获取失败:", err);
      showMessage("error", "获取失败");
    } finally {
      fetchingRef.current = false;
    }
  };

  const fetchSchedule = async (e?: React.MouseEvent) => {
    if (e) e.preventDefault();
    setScheduleLoading(true);
    try {
      const res = await fetch("/api/crawler/schedule");
      const data = await res.json();
      if (data.success) {
        if (data.data && data.data.matches) {
          const scheduleItems: ScheduleItem[] = data.data.matches.map((match: any, idx: number) => ({
            id: match.matchId || match.id || `schedule-${idx}`,
            league: typeof match.league === "string" ? match.league : "",
            homeTeam: typeof match.homeTeam === "string" ? match.homeTeam : "",
            awayTeam: typeof match.awayTeam === "string" ? match.awayTeam : "",
            time: typeof match.time === "string" ? match.time : "",
            date: new Date().toLocaleDateString(),
            handicaps: match.handicaps || [],
            hasCornerOdds: match.hasCornerOdds || (match.handicaps && match.handicaps.length > 0),
          }));
          setScheduleData(scheduleItems);
        }
        // 禁用提示: showMessage("info", `获取到 ${data.count || 0} 场比赛`);
        setActiveTab("schedule");
      } else {
        showMessage("error", data.error || "获取赛程失败");
      }
      await fetchStatus();
    } catch (err) {
      console.error("获取失败:", err);
      showMessage("error", "获取失败");
    } finally {
      setScheduleLoading(false);
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
      showMessage("error", "关闭失败");
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
        showMessage("success", `投注执行：${data.executed || 0} 成功, ${data.failed || 0} 失败`);
      } else {
        showMessage("error", data.error || "执行失败");
      }
    } catch (err) {
      showMessage("error", "执行失败");
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

  // scheduleData 有数据时自动切换到赛程子tab
  useEffect(() => {
    if (scheduleData && scheduleData.length > 0 && activeTab !== "schedule") {
      setActiveTab("schedule");
    }
  }, [scheduleData]);

  useEffect(() => {
    let interval = null;
    let cancelled = false;

    const startPolling = async () => {
      if (cancelled) return;
      await fetchMatches(false);
      if (cancelled) return;
      interval = setInterval(() => {
        fetchMatches(false);
      }, 5000);
    };

    if (autoRefresh) {
      startPolling();
    }

    return () => {
      cancelled = true;
      if (interval) clearInterval(interval);
      fetchingRef.current = false;
    };
  }, [autoRefresh]);

  // 定时同步后端轮询状态（检测后端自动暂停等）
  useEffect(() => {
    if (!isBackendPolling) return;
    const timer = setInterval(() => { fetchStatus(); }, 5000);
    return () => clearInterval(timer);
  }, [isBackendPolling]);

  return (
    <div className="bg-[#0F1424] rounded-2xl border border-slate-800/80 p-6">
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
        <div>
          <h3 className="text-lg font-semibold text-slate-200 flex items-center gap-2">
            <Activity className="w-5 h-5 text-emerald-400" />
            实时数据
          </h3>
          <p className="text-xs text-slate-500 mt-1">
            实时获取比赛数据
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
            <span className="text-xs text-slate-400">{status.matchesCount ?? 0} 场</span>
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
          错误：{status.error}
        </div>
      )}

      <div className="flex flex-wrap gap-2 mb-6">
        <button key="btn-toggle-monitor" type="button"
          onClick={isBackendPolling ? handleStopMonitor : isLoggedIn ? handleStartMonitor : handleLogin}
          disabled={loading}
          className={`flex items-center gap-2 px-4 py-2 text-white text-xs rounded-lg transition-colors ${
            isBackendPolling
              ? "bg-rose-600 hover:bg-rose-500"
              : isLoggedIn
              ? "bg-emerald-600 hover:bg-emerald-500"
              : "bg-blue-600 hover:bg-blue-500"
          } disabled:bg-slate-700 disabled:opacity-50`}
        >
          {loading ? (
            <RefreshCw key="icon-loading" className="w-3.5 h-3.5 animate-spin" />
          ) : isBackendPolling ? (
            <StopCircle key="icon-stop" className="w-3.5 h-3.5" />
          ) : isLoggedIn ? (
            <RefreshCw key="icon-start" className="w-3.5 h-3.5" />
          ) : (
            <LogIn key="icon-login" className="w-3.5 h-3.5" />
          )}
          <span>{loading ? "加载中..." : isBackendPolling ? "停止监控" : isLoggedIn ? "启动监控" : "登录"}</span>
        </button>

        <button key="btn-refresh" type="button"
          onClick={(e) => fetchMatches(e)}
          disabled={loading}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:bg-slate-700 disabled:opacity-50 text-white text-xs rounded-lg transition-colors"
        >
          <Activity className="w-3.5 h-3.5" />
          刷新比赛
        </button>

        <button key="btn-schedule" type="button"
          onClick={(e) => fetchSchedule(e)}
          disabled={loading || scheduleLoading}
          className="flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-500 disabled:bg-slate-700 disabled:opacity-50 text-white text-xs rounded-lg transition-colors"
        >
          <Calendar className="w-3.5 h-3.5" />
          {scheduleLoading ? "获取中..." : "获取赛程"}
        </button>
        {isBackendPolling && (
          <button key="btn-pause-resume" type="button"
            onClick={isPaused ? handleResumeMonitor : handlePauseMonitor}
            disabled={loading}
            className={`flex items-center gap-2 px-4 py-2 text-white text-xs rounded-lg transition-colors ${
              isPaused
                ? "bg-amber-600 hover:bg-amber-500"
                : "bg-yellow-600 hover:bg-yellow-500"
            } disabled:bg-slate-700 disabled:opacity-50`}
          >
            {isPaused ? (
              <><Play key="icon-play" className="w-3.5 h-3.5" /><span>恢复监控</span></>
            ) : (
              <><Pause key="icon-pause" className="w-3.5 h-3.5" /><span>暂停监控</span></>
            )}
          </button>
        )}

        <button key="btn-execute-bets" type="button"
          onClick={() => setShowBetConfirm(true)}
          disabled={executingBets || (!status.isLoggedIn && !storeIsLoggedIn)}
          className="flex items-center gap-2 px-4 py-2 bg-amber-600 hover:bg-amber-500 disabled:bg-slate-700 disabled:opacity-50 text-white text-xs rounded-lg transition-colors"
        >
          {executingBets ? (
            <RefreshCw className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <TrendingUp className="w-3.5 h-3.5" />
          )}
          {executingBets ? "执行中..." : "执行待投注"}
        </button>
        <button key="btn-close-browser" type="button"
          onClick={(e) => handleClose(e)}
          disabled={loading || (!status.isLoggedIn && !storeIsLoggedIn)}
          className="flex items-center gap-2 px-4 py-2 bg-rose-600 hover:bg-rose-500 disabled:bg-slate-700 disabled:opacity-50 text-white text-xs rounded-lg transition-colors ml-auto"
        >
          <StopCircle className="w-3.5 h-3.5" />
          关闭浏览器
        </button>

        <label key="label-autorefresh" className="flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs rounded-lg cursor-pointer transition-colors">
          <input
            type="checkbox"
            checked={autoRefresh}
            onChange={(e) => setAutoRefresh(e.target.checked)}
            disabled={!isBackendPolling}
            className="rounded border-slate-600 text-emerald-500 focus:ring-emerald-500"
          />
          <span>自动刷新 (5s)</span>
        </label>
      </div>

      {showBetConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="bg-slate-800 border border-slate-700 rounded-xl p-6 max-w-md w-full mx-4 shadow-2xl">
            <h3 className="text-lg font-semibold text-amber-400 mb-3">⚠️ 自动投注确认</h3>
            <p className="text-sm text-slate-300 mb-4">
              自动投注将通过模型判断并操作 HG 网站进行投注，请确认 DOM 选择器和网站版本无误，否则可能导致投注失败、损失等问题。
            </p>
            <p className="text-sm text-slate-400 mb-6">
              提示：请确认 HG 网站页面结构无变化，测试无误后再使用。
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

      <div className="flex gap-2 mb-4 border-b border-slate-800 pb-2">
        {[
          { id: "matches", icon: <Activity className="w-3.5 h-3.5" />, label: "角球" },
          { id: "main_markets", icon: <Trophy className="w-3.5 h-3.5" />, label: "让球和大小" },
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
              {isBackendPolling ? "监控中，等待数据更新..." : isPaused ? "暂无比赛，轮询已暂停" : "暂无比赛数据，请点击刷新获取数据。"}
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
                          {/* 角球数不展示，仅展示比分 */}
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
                      {(() => {
                        const handicaps = match.handicaps || [];
                        
                        if (handicaps.length === 0) {
                          return (
                            <div className="bg-slate-800/30 rounded-lg p-4 text-center text-slate-500 text-sm">
                              暂无盘口数据
                            </div>
                          );
                        }

                        const colCount = handicaps.length;
                        const gridCols = colCount <= 2 ? "grid-cols-2"
                          : colCount <= 4 ? "grid-cols-4"
                          : "grid-cols-4";

                        const categoryColors: Record<string, { bg: string; text: string; border: string }> = {
                          "O/U":   { bg: "from-blue-900/50 to-slate-800/50",   text: "text-blue-300",   border: "border-blue-800/30" },
                          "O/U_half": { bg: "from-blue-800/30 to-slate-800/50", text: "text-blue-300/70", border: "border-blue-700/20" },
                          "HDP":   { bg: "from-orange-900/50 to-slate-800/50", text: "text-orange-300",  border: "border-orange-800/30" },
                          "HDP_half":{ bg: "from-orange-800/30 to-slate-800/50",text: "text-orange-300/70",border: "border-orange-700/20" },
                          "1X2":   { bg: "from-purple-900/50 to-slate-800/50",text: "text-purple-300",  border: "border-purple-800/30" },
                          "1X2_half":{bg: "from-purple-800/30 to-slate-800/50",text: "text-purple-300/70",border: "border-purple-700/20" },
                          "O/E":   { bg: "from-green-900/50 to-slate-800/50", text: "text-green-300",   border: "border-green-800/30" },
                          "O/E_half":{bg: "from-green-800/30 to-slate-800/50", text: "text-green-300/70", border: "border-green-700/20" },
                          "NEXT": { bg: "from-teal-900/50 to-slate-800/50", text: "text-teal-300", border: "border-teal-800/30" },
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
                                        <div className="text-xs text-slate-400">平</div>
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
                                  {h.category === "NEXT" && (
                                    <>
                                      <div className="text-center">
                                        <div className="text-xs text-slate-400">{translateTeam(match.homeTeam)}</div>
                                        <div className="text-lg font-bold text-white">{(h.odds?.home || 0).toFixed(2)}</div>
                                      </div>
                                      <div className="text-center mt-2 pt-2 border-t border-slate-700">
                                        <div className="text-xs text-slate-400">第{h.line}个角球</div>
                                      </div>
                                      <div className="text-center mt-2 pt-2 border-t border-slate-700">
                                        <div className="text-xs text-slate-400">{translateTeam(match.awayTeam)}</div>
                                        <div className="text-lg font-bold text-white">{(h.odds?.away || 0).toFixed(2)}</div>
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
              );
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
              提示：如需修改 CRAWLER_HEADLESS 请切换显示模式
            </p>
            <p className="text-xs text-slate-600">
              - CRAWLER_HEADLESS=true (默认)：无界面模式<br />
              - CRAWLER_HEADLESS=false：显示浏览器
            </p>
          </div>
        </div>
      )}


      {activeTab === "schedule" && (
        <div className="space-y-3 max-h-[600px] overflow-y-auto">
          {!scheduleData || !scheduleData.length ? (
            <div className="text-center py-8 text-slate-500 text-sm">
              暂无赛程数据，请点击获取赛程。
            </div>
          ) : (
            scheduleData.map((item) => (
              <div key={item.id} className="bg-slate-900/50 rounded-xl border border-slate-800 overflow-hidden">
                <div
                  className="p-4 cursor-pointer flex items-center justify-between hover:bg-slate-800/50 transition-colors"
                  onClick={() => toggleMatchExpand(item.id)}
                >
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <span className="text-xs px-2 py-0.5 bg-slate-800 rounded text-slate-400">{translateLeague(item.league)}</span>
                      <span className="text-xs text-slate-500">{item.date}</span>
                      {item.time && (
                        <span className="text-xs text-amber-400">{translateTime(item.time)}</span>
                      )}
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="text-center">
                        <div className="text-sm font-medium text-slate-200">{translateTeam(item.homeTeam)}</div>
                      </div>
                      <div className="text-center">
                        <div className="text-xs text-slate-400">VS</div>
                      </div>
                      <div className="text-center">
                        <div className="text-sm font-medium text-slate-200">{translateTeam(item.awayTeam)}</div>
                      </div>
                    </div>
                  </div>
                  <button type="button" className="text-slate-400 hover:text-slate-200">
                    {expandedMatches.has(item.id) ? (
                      <ChevronUp className="w-5 h-5" />
                    ) : (
                      <ChevronDown className="w-5 h-5" />
                    )}
                  </button>
                </div>

                {expandedMatches.has(item.id) && (
                  <div className="p-4 border-t border-slate-800 bg-slate-900/30">
                    {(() => {
                      const handicaps = item.handicaps || [];

                      if (handicaps.length === 0) {
                        return (
                          <div className="bg-slate-800/30 rounded-lg p-4 text-center text-slate-500 text-sm">
                            暂无盘口数据
                          </div>
                        );
                      }

                      const colCount = handicaps.length;
                      const gridCols = colCount <= 2 ? "grid-cols-2" : colCount <= 4 ? "grid-cols-4" : "grid-cols-4";

                      const categoryColors: Record<string, { bg: string; text: string; border: string }> = {
                        "O/U":       { bg: "from-blue-900/50 to-slate-800/50",   text: "text-blue-300",   border: "border-blue-800/30" },
                        "O/U_half":  { bg: "from-blue-800/30 to-slate-800/50",  text: "text-blue-300/70", border: "border-blue-700/20" },
                        "HDP":       { bg: "from-orange-900/50 to-slate-800/50",text: "text-orange-300",  border: "border-orange-800/30" },
                        "HDP_half":  { bg: "from-orange-800/30 to-slate-800/50",text: "text-orange-300/70",border: "border-orange-700/20" },
                        "1X2":       { bg: "from-purple-900/50 to-slate-800/50",text: "text-purple-300",  border: "border-purple-800/30" },
                        "1X2_half":  { bg: "from-purple-800/30 to-slate-800/50",text: "text-purple-300/70",border: "border-purple-700/20" },
                        "O/E":       { bg: "from-green-900/50 to-slate-800/50", text: "text-green-300",   border: "border-green-800/30" },
                        "O/E_half":  { bg: "from-green-800/30 to-slate-800/50", text: "text-green-300/70", border: "border-green-700/20" },
                        "NEXT":      { bg: "from-teal-900/50 to-slate-800/50", text: "text-teal-300",     border: "border-teal-800/30" },
                      };

                      return (
                        <div className={`grid ${gridCols} gap-3`}>
                          {handicaps.map((h: any) => {
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
                                      <div className="text-xs text-slate-400">{translateTeam(item.homeTeam)} ({h.line ?? "--"})</div>
                                      <div className="text-lg font-bold text-white">{(h.odds?.home || 0).toFixed(2)}</div>
                                    </div>
                                    <div className="text-center mt-2 pt-2 border-t border-slate-700">
                                      <div className="text-xs text-slate-400">{translateTeam(item.awayTeam)} ({h.line ?? "--"})</div>
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
                                      <div className="text-xs text-slate-400">平</div>
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
                                {h.category === "NEXT" && (
                                  <>
                                    <div className="text-center">
                                      <div className="text-xs text-slate-400">{translateTeam(item.homeTeam)}</div>
                                      <div className="text-lg font-bold text-white">{(h.odds?.home || 0).toFixed(2)}</div>
                                    </div>
                                    <div className="text-center mt-2 pt-2 border-t border-slate-700">
                                      <div className="text-xs text-slate-400">第{h.line}个角球</div>
                                    </div>
                                    <div className="text-center mt-2 pt-2 border-t border-slate-700">
                                      <div className="text-xs text-slate-400">{translateTeam(item.awayTeam)}</div>
                                      <div className="text-lg font-bold text-white">{(h.odds?.away || 0).toFixed(2)}</div>
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
            ))
          )}
        </div>
      )}

      {status.lastUpdate && (
        <div className="mt-4 pt-4 border-t border-slate-800 text-xs text-slate-500 flex items-center gap-2">
          <RefreshCw className="w-3 h-3" />
          更新时间：{new Date(status.lastUpdate).toLocaleTimeString()}
        </div>
      )}
      {activeTab === "main_markets" && (
        <div className="space-y-4 max-h-[600px] overflow-y-auto">
          {(!mainMarketData || Object.keys(mainMarketData).length === 0) ? (
            <div className="text-center py-8 text-slate-500 text-sm">
              暂无让球大小数据，请启动监控获取数据。
            </div>
          ) : (
            Object.entries(mainMarketData).map(([key, val]: [string, any]) => {
              const [home, away] = key.split("|");
              const hasScore = typeof val.homeScore === 'number' && val.homeScore >= 0 && typeof val.awayScore === 'number' && val.awayScore >= 0;
              
              // 辅助函数：兼容单个对象或数组
              const getArray = (data: any) => {
                if (Array.isArray(data)) return data;
                if (data && typeof data === 'object') return [data];
                return [];
              };
              
              const hdpList = getArray(val.hdp);
              const ouList = getArray(val.ou);
              const hdpHalfList = getArray(val.hdpHalf);
              const ouHalfList = getArray(val.ouHalf);
              
              return (
                <div key={key} className="bg-slate-900/50 rounded-xl border border-slate-800 overflow-hidden">
                  <div className="p-4">
                    {/* 联赛 + 时间 */}
                    <div className="flex items-center gap-3 mb-2">
                      {val.league && (
                        <span className="text-xs px-2 py-0.5 bg-slate-800 rounded text-slate-400">{translateLeague(val.league)}</span>
                      )}
                      {val.time && (
                        <span className="text-xs text-slate-500">{translateTime(val.time)}</span>
                      )}
                    </div>
                    {/* 队名 + 比分 */}
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex-1 text-center">
                        <div className="text-sm font-medium text-slate-200">{translateTeam(home)}</div>
                      </div>
                      <div className="text-xs text-slate-500 px-2">
                        {hasScore ? (
                          <span className="text-lg font-bold text-slate-300">{val.homeScore} - {val.awayScore}</span>
                        ) : "VS"}
                      </div>
                      <div className="flex-1 text-center">
                        <div className="text-sm font-medium text-slate-200">{translateTeam(away)}</div>
                      </div>
                    </div>
                    {/* 盘口卡片 - 左右两列布局：左列让球，右列大小 */}
                    <div className="grid grid-cols-2 gap-3">
                      {/* 左列：让球区域 */}
                      <div className="space-y-2">
                        {/* 全场让球 */}
                        {hdpList.length > 0 && (
                          <div className="bg-slate-800/50 rounded-lg p-2">
                            <div className="text-xs text-orange-400 mb-1 font-medium text-center">让球</div>
                            <div className="grid grid-cols-4 gap-1">
                              {hdpList.map((hdp: any, idx: number) => (
                                <div key={idx} className="bg-slate-700/50 rounded p-1 text-center">
                                  <div className="text-orange-300 font-bold text-xs">{hdp.line}</div>
                                  <div className="text-emerald-400 text-xs">{hdp.homeOdds?.toFixed(2) || '-'}</div>
                                  <div className="border-t border-slate-600 my-1"></div>
                                  <div className="text-slate-400 text-xs">{hdp.awayLine || hdp.line}</div>
                                  <div className="text-emerald-400 text-xs">{hdp.awayOdds?.toFixed(2) || '-'}</div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                        {/* 上半场让球 */}
                        {hdpHalfList.length > 0 && (
                          <div className="bg-slate-800/50 rounded-lg p-2">
                            <div className="text-xs text-orange-400/70 mb-1 font-medium text-center">上半场让球</div>
                            <div className="grid grid-cols-4 gap-1">
                              {hdpHalfList.map((hdp: any, idx: number) => (
                                <div key={idx} className="bg-slate-700/50 rounded p-1 text-center">
                                  <div className="text-orange-300/70 font-bold text-xs">{hdp.line}</div>
                                  <div className="text-emerald-400 text-xs">{hdp.homeOdds?.toFixed(2) || '-'}</div>
                                  <div className="border-t border-slate-600 my-1"></div>
                                  <div className="text-slate-400 text-xs">{hdp.awayLine || hdp.line}</div>
                                  <div className="text-emerald-400 text-xs">{hdp.awayOdds?.toFixed(2) || '-'}</div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                      {/* 右列：大小区域 */}
                      <div className="space-y-2">
                        {/* 全场大小 */}
                        {ouList.length > 0 && (
                          <div className="bg-slate-800/50 rounded-lg p-2">
                            <div className="text-xs text-blue-400 mb-1 font-medium text-center">得分大小</div>
                            <div className="grid grid-cols-4 gap-1">
                              {ouList.map((ou: any, idx: number) => (
                                <div key={idx} className="bg-slate-700/50 rounded p-1 text-center">
                                  <div className="text-xs text-slate-500">大</div>
                                  <div className="text-blue-300 font-bold text-xs">{ou.line}</div>
                                  <div className="text-emerald-400 text-xs">{ou.overOdds?.toFixed(2) || '-'}</div>
                                  <div className="border-t border-slate-600 my-1"></div>
                                  <div className="text-xs text-slate-500">小</div>
                                  <div className="text-slate-400 text-xs">{ou.line}</div>
                                  <div className="text-emerald-400 text-xs">{ou.underOdds?.toFixed(2) || '-'}</div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                        {/* 上半场大小 */}
                        {ouHalfList.length > 0 && (
                          <div className="bg-slate-800/50 rounded-lg p-2">
                            <div className="text-xs text-blue-400/70 mb-1 font-medium text-center">上半场大小</div>
                            <div className="grid grid-cols-4 gap-1">
                              {ouHalfList.map((ou: any, idx: number) => (
                                <div key={idx} className="bg-slate-700/50 rounded p-1 text-center">
                                  <div className="text-xs text-slate-500">大</div>
                                  <div className="text-blue-300/70 font-bold text-xs">{ou.line}</div>
                                  <div className="text-emerald-400 text-xs">{ou.overOdds?.toFixed(2) || '-'}</div>
                                  <div className="border-t border-slate-600 my-1"></div>
                                  <div className="text-xs text-slate-500">小</div>
                                  <div className="text-slate-400 text-xs">{ou.line}</div>
                                  <div className="text-emerald-400 text-xs">{ou.underOdds?.toFixed(2) || '-'}</div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}


{activeTab === "raw" && (
        <div className="space-y-4 max-h-[600px] overflow-y-auto">
          {!crawlerData ? (
            <div className="text-center py-8 text-slate-500 text-sm">
              暂无原始数据，请点击刷新获取数据。
            </div>
          ) : (
            <>
              <div className="bg-slate-900/50 rounded-xl border border-slate-800 p-4">
                <h4 className="text-sm font-medium text-slate-300 mb-3">JSON数据</h4>
                <pre className="text-xs text-slate-300 bg-slate-800/50 p-2 rounded overflow-x-auto">
                  {JSON.stringify(crawlerData, null, 2)}
                </pre>
              </div>

              <div className="bg-slate-900/50 rounded-xl border border-slate-800 p-4">
                <h4 className="text-sm font-medium text-slate-300 mb-3">原始文本列表(前100条)</h4>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  {(crawlerData.allText || []).slice(0, 100).map((text, idx) => (
                    <div key={idx} className="bg-slate-800/50 px-2 py-1 rounded">
                      <span className="text-slate-500 mr-2">{idx}.</span>
                      <span className="text-slate-300">{text}</span>
                    </div>
                  ))}
                </div>
                {(crawlerData.allText || []).length > 100 && (
                  <p className="text-xs text-slate-500 mt-2">...还有 {(crawlerData.allText || []).length - 100} 条文本</p>
                )}
              </div>

              <div className="bg-slate-900/50 rounded-xl border border-slate-800 p-4">
                <h4 className="text-sm font-medium text-slate-300 mb-3">原始元素(前50条带位置)</h4>
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
