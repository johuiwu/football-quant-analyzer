import React, { useState, useEffect } from "react";
import { RefreshCw, Play, StopCircle, Activity, Calendar, Trophy, Settings, ChevronDown, ChevronUp, Pause, TrendingUp, LogIn } from "lucide-react";
import { useCornerStore } from "../../store/cornerStore";
import { translateTime } from "../../data/cornerTranslations";
import { useTeamTranslation } from '../../hooks/useTeamTranslation';
import { getTranslatedLeagueName } from '../../services/teamTranslatorService';

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

export default function CrawlerControlPanel() {
  const [status, setStatus] = useState<CrawlerStatus>({
    isLoggedIn: false,
    lastUpdate: null,
    error: null,
    matchesCount: 0,
  });
  const [loading, setLoading] = useState(false);
  const autoRefresh = useCornerStore((s) => s.autoRefresh);
  const setAutoRefresh = useCornerStore((s) => s.setAutoRefresh);
  const [crawlerData, setCrawlerData] = [useCornerStore((s) => s.crawlerData), useCornerStore((s) => s.setCrawlerData)];
  const [activeTab, setActiveTab] = useState<"matches" | "settings">("matches");
  const storeAccount = useCornerStore((s) => s.accountConfig);
  const storeSettings = useCornerStore((s) => s.settings);
  const [credentials, setCredentials] = useState(() => {
    const saved = localStorage.getItem("hg_credentials");
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        return {
          username: parsed.username || storeAccount.username || storeSettings.hgUsername || "",
          password: storeAccount.password || storeSettings.hgPassword || "",
        };
      } catch { /* ignore */ }
    }
    return {
      username: storeAccount.username || storeSettings.hgUsername || "",
      password: storeAccount.password || storeSettings.hgPassword || "",
    };
  });
  const [rememberMe, setRememberMe] = useState(() => localStorage.getItem("hg_credentials") !== null);
  const [message, setMessage] = useState<{ type: "success" | "error" | "info"; text: string } | null>(null);
  const [expandedMatches, setExpandedMatches] = useState<Set<string>>(new Set());
  const setLoginStatus = useCornerStore((s) => s.setLoginStatus);
  const storeIsLoggedIn = useCornerStore((s) => s.isLoggedIn);
  const storeLoginInProgress = useCornerStore((s) => s.loginInProgress);
  const setStoreLoginInProgress = useCornerStore((s) => s.setLoginInProgress);
  const isLoggedIn = status.isLoggedIn || storeIsLoggedIn;
  const [isPaused, setIsPaused] = useState(false);


  const [isBackendPolling, setIsBackendPolling] = useState(false);

  const fetchingRef = React.useRef(false);
  const messageTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortControllerRef = React.useRef<AbortController | null>(null);
  const startMonitorTimeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  /** Raw match data from API before normalization */
  interface RawMatchItem {
    matchId?: string | number;
    homeTeam?: string;
    awayTeam?: string;
    league?: string;
    time?: string;
    homeScore?: number;
    awayScore?: number;
    totalCorners?: number;
    handicaps?: any[];
    _dataSource?: string;
    [key: string]: any;
  }

  const normalizeMatchForRender = (item: RawMatchItem, index: number) => ({
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
        // 同步 cornerStore 的 isMonitoring 状态，确保其他组件可正确判断监控状态
        try { useCornerStore.getState().set({ isMonitoring: true }); } catch (_) {}
        showMessage("success", "启动成功，后台将自动获取数据");
        // 等待 8 秒后触发首次数据获取（先尝试即时爬取，失败则从缓存读取）
        if (startMonitorTimeoutRef.current) {
          clearTimeout(startMonitorTimeoutRef.current);
        }
        startMonitorTimeoutRef.current = setTimeout(async () => {
          startMonitorTimeoutRef.current = null;
          await fetchMatches(true); // forceCorner=true，走 /api/corner/fetch 即时爬取
        }, 8000);
      } else {
        showMessage("error", data.error || "启动失败");
        // ★ 检测登录会话过期：如果错误信息包含登录相关关键词，自动重置登录状态
        const errMsg = (data.error || "").toLowerCase();
        if (errMsg.includes("login") || errMsg.includes("登录") || errMsg.includes("kick") || errMsg.includes("session") || errMsg.includes("uid")) {
          setStatus(prev => ({ ...prev, isLoggedIn: false }));
          setLoginStatus(false, "");
        }
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
        // 从后端同步登录状态到 store（Tab 切回来时恢复）
        const state = useCornerStore.getState();
        if (crawler.isLoggedIn && !state.isLoggedIn) {
          setLoginStatus(true, crawler.username || "");
        }
        // 后端有登录在进展中，同步 store 的 loginInProgress
        if (crawler.loginInProgress && !state.loginInProgress) {
          setStoreLoginInProgress(true);
        }
        if (!crawler.loginInProgress && state.loginInProgress) {
          setStoreLoginInProgress(false);
        }
      }
    } catch (err) {
      console.error("获取状态失败:", err);
    }
  };

  const handleLogin = async (e?: React.MouseEvent) => {
    if (e) e.preventDefault();
    if (storeLoginInProgress) return;
    setLoading(true);
    setStoreLoginInProgress(true);
    // 取消之前未完成的请求
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    const controller = new AbortController();
    abortControllerRef.current = controller;
    // ★ 前端超时保护：90s 后自动 abort（与后端路由层超时对齐）
    const timeoutId = setTimeout(() => controller.abort(), 90000);
    let wasAborted = false;
    try {
      const res = await fetch("/api/corner/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(credentials),
        signal: controller.signal,
      });
      const data = await res.json();
      if (data.success) {
        showMessage("success", "登录成功！");
        setStatus(prev => ({ ...prev, isLoggedIn: true }));
        setLoginStatus(true, credentials.username);
        if (rememberMe) {
          localStorage.setItem("hg_credentials", JSON.stringify({ username: credentials.username }));
        } else {
          localStorage.removeItem("hg_credentials");
        }
        await fetchStatus();
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
      if (err.name === 'AbortError') { wasAborted = true; return; }
      const errMsg = err.message || "登录请求失败";
      showMessage("error", "登录失败：" + errMsg + "（请确认后端服务已启动）");
    } finally {
      clearTimeout(timeoutId);
      if (abortControllerRef.current === controller) {
        abortControllerRef.current = null;
      }
      setLoading(false);
      if (!wasAborted) {
        setStoreLoginInProgress(false);
      }
    }
  };

  const fetchMatches = async (e_or_forceCorner?: React.MouseEvent | boolean) => {
    if (fetchingRef.current) return;
    fetchingRef.current = true;
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    const controller = new AbortController();
    abortControllerRef.current = controller;
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
          const fetchRes = await fetch("/api/corner/fetch", { method: "POST", signal: controller.signal });
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
        // API 返回的数据结构：
        // - /corner/live: { data: matchList[], mainMarkets, count }
        // - /corner/fetch: { data: matches[], mainMarkets, count }
        // 每场比赛的 handicaps[] 只有角球盘口(marketGroup=corner)
        // 让球/大小盘口在 apiData.mainMarkets 中，需合并到 handicaps
        const rawMatches = apiData.data || [];
        const matchList = Array.isArray(rawMatches) ? rawMatches : (rawMatches?.matches || []);
        const matchCount = matchList.length;
        const mainMarkets = apiData.mainMarkets || {};

        // 将 mainMarkets 转换为 handicaps 格式并合并到对应比赛
        const mergeMainMarkets = (matches: any[]) => {
          const existingKeys = new Set<string>();
          const existingIds = new Set<string>();
          for (const m of matches) {
            const teamKey = (m.homeTeam || "") + "|" + (m.awayTeam || "");
            existingKeys.add(teamKey.toLowerCase());
            existingIds.add(String(m.matchId || m.gid || ""));
          }

          // ★ 从 mainMarkets 中找出没有对应 matchList 条目的比赛，创建新的比赛条目
          const extraMatches: any[] = [];
          for (const [key, mmRaw] of Object.entries(mainMarkets)) {
            const mm = mmRaw as any;
            if (existingIds.has(key) || existingKeys.has(key.toLowerCase())) continue;
            // key 格式为 "homeTeam|awayTeam"
            const sepIdx = key.indexOf("|");
            if (sepIdx < 1) continue;
            const homeTeam = key.substring(0, sepIdx);
            const awayTeam = key.substring(sepIdx + 1);
            if (!homeTeam || !awayTeam) continue;

            const extraHandicaps: any[] = [];
            let order = 1;
            for (const h of (mm.hdp || [])) {
              extraHandicaps.push({
                order: order++, category: "HDP", categoryLabel: "让球",
                period: "full", line: h.line || 0,
                odds: { home: h.homeOdds || 0, away: h.awayOdds || 0 },
                source: "api", marketGroup: "hdp",
              });
            }
            for (const o of (mm.ou || [])) {
              extraHandicaps.push({
                order: order++, category: "O/U", categoryLabel: "大小球",
                period: "full", line: o.line || 0,
                odds: { over: o.overOdds || 0, under: o.underOdds || 0 },
                source: "api", marketGroup: "ou",
              });
            }
            for (const h of (mm.hdpHalf || [])) {
              extraHandicaps.push({
                order: order++, category: "HDP", categoryLabel: "上半场 让球",
                period: "half", line: h.line || 0,
                odds: { home: h.homeOdds || 0, away: h.awayOdds || 0 },
                source: "api", marketGroup: "hdp",
              });
            }
            for (const o of (mm.ouHalf || [])) {
              extraHandicaps.push({
                order: order++, category: "O/U", categoryLabel: "上半场 大小球",
                period: "half", line: o.line || 0,
                odds: { over: o.overOdds || 0, under: o.underOdds || 0 },
                source: "api", marketGroup: "ou",
              });
            }

            if (extraHandicaps.length > 0) {
              extraMatches.push({
                matchId: "mm_" + key,
                matchName: homeTeam + " vs " + awayTeam,
                homeTeam, awayTeam,
                league: "", time: "",
                elapsedMinutes: 0, homeScore: 0, awayScore: 0,
                totalCorners: 0, homeCorners: 0, awayCorners: 0,
                handicaps: extraHandicaps,
                triggeredStrategies: [],
                _dataSource: "api", _cornerSource: "none",
                dataQuality: "hdp_only",
              });
            }
          }

          // 合并 mainMarkets 到已有比赛
          const merged = matches.map((m: any) => {
            // ★ 尝试多种 key 匹配：matchId > homeTeam|awayTeam > gid
            const teamKey = (m.homeTeam || "") + "|" + (m.awayTeam || "");
            const matchIdKey = String(m.matchId || m.gid || "");
            const mm = mainMarkets[matchIdKey] || mainMarkets[teamKey];
            if (!mm) return m;

            const extraHandicaps: any[] = [];
            let order = (m.handicaps || []).length + 1;

            // 全场让球
            for (const h of (mm.hdp || [])) {
              extraHandicaps.push({
                order: order++, category: "HDP", categoryLabel: "让球",
                period: "full", line: h.line || 0,
                odds: { home: h.homeOdds || 0, away: h.awayOdds || 0 },
                source: "api", marketGroup: "hdp",
              });
            }
            // 全场大小
            for (const o of (mm.ou || [])) {
              extraHandicaps.push({
                order: order++, category: "O/U", categoryLabel: "大小球",
                period: "full", line: o.line || 0,
                odds: { over: o.overOdds || 0, under: o.underOdds || 0 },
                source: "api", marketGroup: "ou",
              });
            }
            // 上半场让球
            for (const h of (mm.hdpHalf || [])) {
              extraHandicaps.push({
                order: order++, category: "HDP", categoryLabel: "上半场 让球",
                period: "half", line: h.line || 0,
                odds: { home: h.homeOdds || 0, away: h.awayOdds || 0 },
                source: "api", marketGroup: "hdp",
              });
            }
            // 上半场大小
            for (const o of (mm.ouHalf || [])) {
              extraHandicaps.push({
                order: order++, category: "O/U", categoryLabel: "上半场 大小球",
                period: "half", line: o.line || 0,
                odds: { over: o.overOdds || 0, under: o.underOdds || 0 },
                source: "api", marketGroup: "ou",
              });
            }

            return { ...m, handicaps: [...(m.handicaps || []), ...extraHandicaps] };
          });

          return [...merged, ...extraMatches];
        };

        const mergedMatchList = mergeMainMarkets(matchList);

        if (mergedMatchList.length > 0 || !apiData.cacheEmpty) {
          // 检查数据来源
          const firstDataSource = matchList.length > 0 ? (matchList[0]._dataSource || "") : "";
          if (firstDataSource === "today" && !isBackendPolling) {
            showMessage("info", "当前无实时比赛，展示赛程数据");
          }

          setCrawlerData({
            matches: mergedMatchList.map(normalizeMatchForRender)
          } as any);
          setStatus(prev => ({ ...prev, matchesCount: matchCount, lastUpdate: Date.now() }));

          if (mergedMatchList.length > 0) {
            const mapped = mergedMatchList.map((item) => ({
              matchId: String(item.matchId || "unknown"),
              homeTeam: item.homeTeam || "--",
              awayTeam: item.awayTeam || "--",
              time: item.time || "",
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
        
        if (apiData.cacheEmpty) {
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
    } catch (err: any) {
      if (err.name === 'AbortError' || err.name === 'AbortController') return;
      console.error("[数据] 获取失败:", err);
      showMessage("error", "获取失败");
    } finally {
      if (abortControllerRef.current === controller) {
        abortControllerRef.current = null;
      }
      fetchingRef.current = false;
    }
  };

  const handleClose = async (e?: React.MouseEvent) => {
    if (e) e.preventDefault();
    // 在关闭前停止所有可能触发后端请求的定时器
    setAutoRefresh(false);
    if (startMonitorTimeoutRef.current) {
      clearTimeout(startMonitorTimeoutRef.current);
      startMonitorTimeoutRef.current = null;
    }
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
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
    return () => {
      // 中止正在进行的登录请求
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
        abortControllerRef.current = null;
      }
      // 清除启动监控延迟请求
      if (startMonitorTimeoutRef.current) {
        clearTimeout(startMonitorTimeoutRef.current);
        startMonitorTimeoutRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    let interval = null;
    let cancelled = false;

    const startPolling = async () => {
      if (cancelled) return;
      await fetchMatches(false);
      if (cancelled) return;
      interval = setInterval(() => {
        fetchMatches(false);
      }, 15000);
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
    const timer = setInterval(() => { fetchStatus(); }, 10000);
    return () => clearInterval(timer);
  }, [isBackendPolling]);

  // 登录进行中时持续轮询后端状态（Tab 切回来后检测登录完成）
  useEffect(() => {
    if (!storeLoginInProgress) return;
    const timer = setInterval(() => { fetchStatus(); }, 5000);
    return () => clearInterval(timer);
  }, [storeLoginInProgress]);

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
          disabled={loading || storeLoginInProgress}
          className={`flex items-center gap-2 px-4 py-2 text-white text-xs rounded-lg transition-colors ${
            isBackendPolling
              ? "bg-rose-600 hover:bg-rose-500"
              : isLoggedIn
              ? "bg-emerald-600 hover:bg-emerald-500"
              : "bg-blue-600 hover:bg-blue-500"
          } disabled:bg-slate-700 disabled:opacity-50`}
        >
          {loading || storeLoginInProgress ? (
            <RefreshCw key="icon-loading" className="w-3.5 h-3.5 animate-spin" />
          ) : isBackendPolling ? (
            <StopCircle key="icon-stop" className="w-3.5 h-3.5" />
          ) : isLoggedIn ? (
            <RefreshCw key="icon-start" className="w-3.5 h-3.5" />
          ) : (
            <LogIn key="icon-login" className="w-3.5 h-3.5" />
          )}
          <span>{storeLoginInProgress ? "登录中..." : loading ? "加载中..." : isBackendPolling ? "停止监控" : isLoggedIn ? "启动监控" : "登录"}</span>
        </button>

        <button key="btn-refresh" type="button"
          onClick={(e) => fetchMatches(e)}
          disabled={loading}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:bg-slate-700 disabled:opacity-50 text-white text-xs rounded-lg transition-colors"
        >
          <Activity className="w-3.5 h-3.5" />
          刷新比赛
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

      <div className="flex gap-2 mb-4 border-b border-slate-800 pb-2">
        {[
          { id: "matches", icon: <Activity className="w-3.5 h-3.5" />, label: "角球" },
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
              {isBackendPolling ? "监控中，等待角球盘口数据更新..." : isPaused ? "暂无角球盘口比赛，轮询已暂停" : "暂无角球盘口比赛，请启动监控获取数据。"}
            </div>
          ) : (
            (crawlerData.matches || []).map((match) => {
              return (
                <div key={match.matchId} data-match-id={match.matchId} className="bg-slate-900/50 rounded-xl border border-slate-800 overflow-hidden">
                  <div
                    className="p-4 cursor-pointer flex items-center justify-between hover:bg-slate-800/50 transition-colors"
                    onClick={() => toggleMatchExpand(match.matchId)}
                  >
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <span className="text-xs px-2 py-0.5 bg-slate-800 rounded text-slate-400"><TranslatedLeagueName name={match.league} /></span>
                        <span className="text-xs text-slate-500">{translateTime(match.time)}{match.elapsedMinutes ? ` · ${match.elapsedMinutes}'` : ""}</span>
                      </div>
                      <div className="flex items-center gap-4">
                        <div className="text-center">
                          <div className="text-sm font-medium text-slate-200"><TranslatedTeamName name={match.homeTeam} /></div>
                        </div>
                        <div className="text-center">
                          <div className="text-lg font-bold text-slate-300">
                            {match.homeScore ?? 0} - {match.awayScore ?? 0}
                          </div>
                          {/* 角球数不展示，仅展示比分 */}
                        </div>
                        <div className="text-center">
                          <div className="text-sm font-medium text-slate-200"><TranslatedTeamName name={match.awayTeam} /></div>
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
                    <div className="px-3 py-2 border-t border-slate-800 bg-slate-900/30">
                      {(() => {
                        const allHandicaps = match.handicaps || [];
                        const cornerHandicaps = allHandicaps.filter((h: any) => h.marketGroup === "corner");
                        const mainHandicaps = allHandicaps.filter((h: any) => h.marketGroup !== "corner");

                        if (allHandicaps.length === 0) {
                          return (
                            <div className="text-center text-slate-500 text-xs py-2">暂无盘口数据</div>
                          );
                        }

                        const cornerColors: Record<string, { bg: string; text: string; border: string }> = {
                          "O/U":   { bg: "bg-blue-900/40", text: "text-blue-300", border: "border-blue-800/30" },
                          "O/U_half": { bg: "bg-blue-900/25", text: "text-blue-300/70", border: "border-blue-700/20" },
                          "HDP":   { bg: "bg-orange-900/40", text: "text-orange-300", border: "border-orange-800/30" },
                          "HDP_half":{ bg: "bg-orange-900/25", text: "text-orange-300/70", border: "border-orange-700/20" },
                          "1X2":   { bg: "bg-purple-900/40", text: "text-purple-300", border: "border-purple-800/30" },
                          "1X2_half":{bg: "bg-purple-900/25", text: "text-purple-300/70", border: "border-purple-700/20" },
                          "O/E":   { bg: "bg-green-900/40", text: "text-green-300", border: "border-green-800/30" },
                          "O/E_half":{bg: "bg-green-900/25", text: "text-green-300/70", border: "border-green-700/20" },
                          "NEXT":  { bg: "bg-teal-900/40", text: "text-teal-300", border: "border-teal-800/30" },
                        };

                        const mainColors: Record<string, { bg: string; text: string; border: string }> = {
                          "O/U":   { bg: "bg-amber-900/40", text: "text-amber-300", border: "border-amber-800/30" },
                          "O/U_half": { bg: "bg-amber-900/25", text: "text-amber-300/70", border: "border-amber-700/20" },
                          "HDP":   { bg: "bg-orange-900/40", text: "text-orange-300", border: "border-orange-800/30" },
                          "HDP_half":{ bg: "bg-orange-900/25", text: "text-orange-300/70", border: "border-orange-700/20" },
                          "1X2":   { bg: "bg-yellow-900/40", text: "text-yellow-300", border: "border-yellow-800/30" },
                          "1X2_half":{bg: "bg-yellow-900/25", text: "text-yellow-300/70", border: "border-yellow-700/20" },
                          "O/E":   { bg: "bg-amber-900/30", text: "text-amber-300", border: "border-amber-700/20" },
                          "O/E_half":{bg: "bg-amber-900/20", text: "text-amber-300/70", border: "border-amber-700/20" },
                        };

                        // 按盘口类型分组（合并角球+主盘口为统一布局）
                        // 每个 group 包含同名同 type 的所有 line/odds 变体
                        const groupByCategory = (handicaps: any[]) => {
                          const groups: Record<string, any[]> = {};
                          for (const h of handicaps) {
                            const k = (h.categoryLabel || h.category) + (h.period === "half" ? "_half" : "");
                            if (!groups[k]) groups[k] = [];
                            groups[k].push(h);
                          }
                          return groups;
                        };

                        const cornerGroups = groupByCategory(cornerHandicaps);
                        const mainGroups = groupByCategory(mainHandicaps);

                        const renderMainGroup = (groupKey: string, items: any[]) => {
                          const first = items[0];
                          const isOU = first.category === "O/U";
                          const isHDP = first.category === "HDP";
                          const label = first.categoryLabel || first.category;
                          const shortLabel = label.length > 4 ? label.replace("上半场 ", "半") : label;

                          // 多个盘口线时，按行分组（上行=大/主，下行=小/客）
                          const overItems = items.filter((h: any) => (h.odds?.over ?? h.odds?.home ?? 0) >= 0);
                          const underItems = items.filter((h: any) => (h.odds?.under ?? h.odds?.away ?? 0) >= 0);
                          const colCount = Math.max(overItems.length, underItems.length, 2);

                          return (
                            <div className="rounded border border-slate-700/50 bg-slate-900/40">
                              <div className="text-[11px] text-slate-300 font-medium text-center py-1 border-b border-slate-700/50">
                                {shortLabel}
                              </div>
                              {isHDP && (
                                <div className={`grid gap-0`} style={{ gridTemplateColumns: `repeat(${Math.max(colCount, 2)}, 1fr)` }}>
                                  {overItems.map((h, i) => (
                                    <div key={i} className="px-1.5 py-1 text-center border-b border-slate-800/50">
                                      <div className="text-[10px] text-slate-400">{h.line ?? "--"}</div>
                                      <div className="text-[11px] font-bold text-red-400">{(h.odds?.home || 0).toFixed(2)}</div>
                                    </div>
                                  ))}
                                  {underItems.map((h, i) => (
                                    <div key={i} className="px-1.5 py-1 text-center">
                                      <div className="text-[10px] text-slate-400">{h.line ?? "--"}</div>
                                      <div className="text-[11px] font-bold text-red-400">{(h.odds?.away || 0).toFixed(2)}</div>
                                    </div>
                                  ))}
                                </div>
                              )}
                              {isOU && (
                                <div className={`grid gap-0`} style={{ gridTemplateColumns: `repeat(${Math.max(colCount, 2)}, 1fr)` }}>
                                  {overItems.map((h, i) => (
                                    <div key={i} className="px-1.5 py-1 text-center border-b border-slate-800/50">
                                      <div className="text-[10px] text-slate-400">大 {h.line ?? "--"}</div>
                                      <div className="text-[11px] font-bold text-red-400">{(h.odds?.over || 0).toFixed(2)}</div>
                                    </div>
                                  ))}
                                  {underItems.map((h, i) => (
                                    <div key={i} className="px-1.5 py-1 text-center">
                                      <div className="text-[10px] text-slate-400">小 {h.line ?? "--"}</div>
                                      <div className="text-[11px] font-bold text-red-400">{(h.odds?.under || 0).toFixed(2)}</div>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          );
                        };

                        const renderCornerGroup = (groupKey: string, items: any[]) => {
                          const first = items[0];
                          const isOU = first.category === "O/U";
                          const isHDP = first.category === "HDP";
                          const isNext = first.category === "NEXT";
                          const isOE = first.category === "O/E";
                          const isOneX2 = first.category === "1X2";
                          const label = first.categoryLabel || first.category;
                          const shortLabel = label.length > 4 ? label.replace("上半场 ", "半") : label;

                          // 多个盘口线时，按上下行分布
                          const overItems = items.filter((h: any) => (h.odds?.over ?? h.odds?.home ?? h.odds?.odd ?? 0) >= 0);
                          const underItems = items.filter((h: any) => (h.odds?.under ?? h.odds?.away ?? h.odds?.even ?? 0) >= 0);
                          const colCount = Math.max(overItems.length, underItems.length, 2);

                          return (
                            <div className="rounded border border-blue-800/30 bg-slate-900/40">
                              <div className="text-[11px] text-blue-300 font-medium text-center py-1 border-b border-blue-800/30">
                                {shortLabel}
                              </div>
                              {(isOU || isHDP || isNext || isOE) && (
                                <div className="grid gap-0" style={{ gridTemplateColumns: `repeat(${Math.max(colCount, 2)}, 1fr)` }}>
                                  {overItems.map((h, i) => (
                                    <div key={i} className="px-1.5 py-1 text-center border-b border-slate-800/50">
                                      <div className="text-[10px] text-slate-400">
                                        {isOU ? `大${h.line ?? "--"}` : isHDP ? `主${h.line ?? "--"}` : isNext ? (h.line ? `第${Math.round(h.line)}球(主)` : "主") : "单"}
                                      </div>
                                      <div className="text-[11px] font-bold text-red-400">
                                        {(h.odds?.over ?? h.odds?.home ?? h.odds?.odd ?? 0).toFixed(2)}
                                      </div>
                                    </div>
                                  ))}
                                  {underItems.map((h, i) => (
                                    <div key={i} className="px-1.5 py-1 text-center">
                                      <div className="text-[10px] text-slate-400">
                                        {isOU ? `小${h.line ?? "--"}` : isHDP ? `客${h.line ?? "--"}` : isNext ? (h.line ? `第${Math.round(h.line)}球(客)` : "客") : "双"}
                                      </div>
                                      <div className="text-[11px] font-bold text-red-400">
                                        {(h.odds?.under ?? h.odds?.away ?? h.odds?.even ?? 0).toFixed(2)}
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              )}
                              {isOneX2 && items.map((h, i) => (
                                <div key={i} className="grid grid-cols-3 divide-x divide-slate-800">
                                  <div className="px-1 py-1 text-center">
                                    <div className="text-[9px] text-slate-400">主</div>
                                    <div className="text-[11px] font-bold text-red-400">{(h.odds?.home || 0).toFixed(2)}</div>
                                  </div>
                                  <div className="px-1 py-1 text-center">
                                    <div className="text-[9px] text-slate-400">平</div>
                                    <div className="text-[11px] font-bold text-red-400">{(h.odds?.draw || 0).toFixed(2)}</div>
                                  </div>
                                  <div className="px-1 py-1 text-center">
                                    <div className="text-[9px] text-slate-400">客</div>
                                    <div className="text-[11px] font-bold text-red-400">{(h.odds?.away || 0).toFixed(2)}</div>
                                  </div>
                                </div>
                              ))}
                            </div>
                          );
                        };

                        return (
                          <div className="space-y-2">
                            {Object.keys(cornerGroups).length > 0 && (
                              <div>
                                <div className="text-[10px] text-blue-400 mb-1 font-medium flex items-center gap-1">
                                  <span className="w-1 h-1 rounded-full bg-blue-400" />角球盘口
                                </div>
                                <div className="grid grid-cols-4 gap-1.5">
                                  {Object.entries(cornerGroups).map(([k, items]) => (
                                    <div key={k} className="min-w-0">{renderCornerGroup(k, items)}</div>
                                  ))}
                                </div>
                              </div>
                            )}
                            {Object.keys(mainGroups).length > 0 && (
                              <div>
                                <div className="text-[10px] text-amber-400 mb-1 font-medium flex items-center gap-1">
                                  <span className="w-1 h-1 rounded-full bg-amber-400" />让球/大小盘口
                                </div>
                                <div className="grid grid-cols-4 gap-1.5">
                                  {(() => {
                                    // 固定顺序：让球 → 半让球 → 大小球 → 半大小球
                                    const order = ["让球", "大小球"];
                                    const sortedEntries = Object.entries(mainGroups).sort((a, b) => {
                                      const aIsHDP = (a[1][0]?.category || "") === "HDP";
                                      const bIsHDP = (b[1][0]?.category || "") === "HDP";
                                      const aIsHalf = a[1][0]?.period === "half";
                                      const bIsHalf = b[1][0]?.period === "half";
                                      // HDP在前，OU在后；同类型内全场在前，半场在后
                                      if (aIsHDP !== bIsHDP) return aIsHDP ? -1 : 1;
                                      return (aIsHalf ? 1 : 0) - (bIsHalf ? 1 : 0);
                                    });
                                    return sortedEntries.map(([k, items]) => (
                                      <div key={k} className="min-w-0">{renderMainGroup(k, items)}</div>
                                    ));
                                  })()}
                                </div>
                              </div>
                            )}
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
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="rememberMe"
              checked={rememberMe}
              onChange={(e) => setRememberMe(e.target.checked)}
              className="w-4 h-4 rounded border-slate-600 bg-slate-800 text-emerald-500 focus:ring-emerald-500/50 cursor-pointer"
            />
            <label htmlFor="rememberMe" className="text-xs text-slate-400 cursor-pointer select-none">记住账号密码</label>
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

      {status.lastUpdate && (
        <div className="mt-4 pt-4 border-t border-slate-800 text-xs text-slate-500 flex items-center gap-2">
          <RefreshCw className="w-3 h-3" />
          更新时间：{new Date(status.lastUpdate).toLocaleTimeString()}
        </div>
      )}
    </div>
  );
}
