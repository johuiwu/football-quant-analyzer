import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

// ==================== 类型定义 ====================

/** 角球策略参数 */
export interface CornerStrategy {
  id: number;
  name: string;
  enabled: boolean;
  playTimeStart: number;
  playTimeEnd: number;
  leadGoals: number;
  leadGoalsWeak: number;
  cornerHandicapLower: number;
  cornerHandicapUpper: number;
  targetOdds: number;
  maxOdds: number;
  betDirection: "over" | "under" | "home" | "away" | "auto";
  minCurrentCorners: number;
  maxCurrentCorners: number;
  leadSide: "any" | "strong" | "weak";
}

/** 盘口条目 */
export interface HandicapEntry {
  order: number;
  category: "O/U" | "HDP" | "1X2" | "O/E" | "NEXT" | "CS";
  categoryLabel: string;
  period: "full" | "half";
  line?: number | string;
  odds?: {
    home?: number;
    away?: number;
    draw?: number;
    over?: number;
    under?: number;
    odd?: number;
    even?: number;
  };
  source: "dom" | "xhr" | "fallback" | "api";
  /** 盘口分组: main=让球&大小, corner=角球盘口, hdp=让球, ou=大小球, correct_score=波胆 */
  marketGroup?: "main" | "corner" | "hdp" | "ou" | "correct_score";
}

/** 实时比赛角球数据 */
export interface CornerLiveMatch {
  matchId: string;
  homeTeam: string;
  awayTeam: string;
  time: string;
  elapsedMinutes: number;
  homeScore: number;
  awayScore: number;
  homeCorners: number;
  awayCorners: number;
  cornerHandicap: number;
  cornerOdds: number;
  handicaps: HandicapEntry[];
  triggeredStrategies: number[];
  _dataSource?: string;
  _cornerSource?: string;
}

/** 监控日志条目 */
export interface MonitorLogEntry {
  timestamp: string;
  message: string;
  level: "info" | "warning" | "signal";
}

/** 账户配置 */
export interface AccountConfig {
  username: string;
  password: string;
  remember: boolean;
}

/** 全局设置 */
export interface CornerSettings {
  hgUsername: string;
  hgPassword: string;
  balance: number;
  refreshInterval: number;
  strongHandicapThreshold: number; // 盘口绝对值>=此值时区分强弱队，用于leadSide判断
  handicapUpperLimit: number; // 全局盘口上限，超过此值的比赛不触发任何策略
  handicapLowerLimit: number; // 全局盘口下限，低于此值的比赛不触发任何策略
  betAmount: number;
  pollInterval: number;
  isRealMode: boolean;
  isSoundEnabled: boolean;
  autoBetEnabled: boolean;
  autoBetConfirmRequired: boolean;
}

/** 回测统计数据 */
export interface BacktestStats {
  strategyId: string;
  strategyName: string;
  triggered: number;
  executed: number;
  failed: number;
  successRate: number;
  totalProfit: number;
  roi: number;
}

// ==================== Store 接口 ====================

export interface CornerStore {
  strategies: CornerStrategy[];
  liveMatches: CornerLiveMatch[];
  monitorLog: MonitorLogEntry[];
  isMonitoring: boolean;
  isLoggedIn: boolean;
  isLoading: boolean;
  loginInProgress: boolean;
  error: string | null;
  accountConfig: AccountConfig;
  settings: CornerSettings;
  activeCornerTab: 'crawler' | 'monitor' | 'strategy' | 'history';
  historyFilterMatchId: string | null;
  backtestResults: Record<number, BacktestStats>;
  crawlerData: any | null;
  scheduleData: any[];
  mainMarketData: Record<string, { league?: string; time?: string; homeScore?: number | null; awayScore?: number | null; hdp?: { line: string; homeOdds: number; awayOdds: number } | null; ou?: { line: number; overOdds: number; underOdds: number } | null }>;
  betConfirmRequired: boolean;
  scheduleFreshLoaded: boolean;
  autoRefresh: boolean;
  setStrategies: (strategies: CornerStrategy[], skipBackendSync?: boolean) => void;
  updateStrategy: (id: number, updates: Partial<CornerStrategy>) => void;
  setAccountConfig: (config: Partial<AccountConfig>) => void;
  login: () => Promise<boolean>;
  logout: () => void;
  setLoginInProgress: (status: boolean) => void;
  setSettings: (partial: Partial<CornerSettings>) => void;
  setLoginStatus: (status: boolean, user?: string) => void;
  setActiveCornerTab: (tab: 'crawler' | 'monitor' | 'strategy' | 'history') => void;
  setHistoryFilterMatchId: (matchId: string | null) => void;
  setBacktestResults: (results: Record<number, BacktestStats>) => void;
  updateBalance: (balance: number) => void;
  balanceLastUpdated: number | null;
  isBalanceLoading: boolean;
  refreshBalance: () => Promise<void>;
  startMonitor: () => Promise<void>;
  stopMonitor: () => void;
  refreshData: () => Promise<void>;
  setLiveMatches: (matches: CornerLiveMatch[]) => void;
  addLog: (entry: MonitorLogEntry) => void;
  clearLog: () => void;
  clearError: () => void;
  setCrawlerData: (data: any | null) => void;
  setScheduleData: (data: any[]) => void;
  setMainMarketData: (data: any) => void;
  setBetConfirmRequired: (required: boolean) => void;
  setScheduleFreshLoaded: (loaded: boolean) => void;
  setAutoRefresh: (on: boolean) => void;
  syncAllSettingsToBackend: () => Promise<void>;
}

// ==================== 默认策略 ====================

const DEFAULT_STRATEGIES: CornerStrategy[] = [
  {
    id: 1,
    name: "策略一 · 走地角球(35'-55')",
    enabled: false,
    playTimeStart: 35,
    playTimeEnd: 55,
    leadGoals: 99, // >=20 sentinel: no score restriction
    leadGoalsWeak: 0,
    cornerHandicapLower: -1.25,
    cornerHandicapUpper: 2.5,
    targetOdds: 0.8,
    maxOdds: 1.10,
    betDirection: "over",
    minCurrentCorners: 3,
    maxCurrentCorners: 7,
    leadSide: "any",
  },
  {
    id: 2,
    name: "策略二 · 领先角球(50'-77')",
    enabled: false,
    playTimeStart: 50,
    playTimeEnd: 77,
    leadGoals: 3,
    leadGoalsWeak: 1,
    cornerHandicapLower: -0.75,
    cornerHandicapUpper: 2.5,
    targetOdds: 0.8,
    maxOdds: 1.30,
    betDirection: "over",
    minCurrentCorners: 0,
    maxCurrentCorners: 99,
    leadSide: "strong",
  },
  {
    id: 3,
    name: "策略三 · 平局角球(70'-99')",
    enabled: false,
    playTimeStart: 70,
    playTimeEnd: 99,
    leadGoals: 0,
    leadGoalsWeak: 0,
    cornerHandicapLower: 0,
    cornerHandicapUpper: 2.0,
    targetOdds: 0.6,
    maxOdds: 0.90,
    betDirection: "under",
    minCurrentCorners: 3,
    maxCurrentCorners: 9,
    leadSide: "any",
  },
  {
    id: 4,
    name: "策略四 · 领先追角(60'-99')",
    enabled: false,
    playTimeStart: 60,
    playTimeEnd: 99,
    leadGoals: 2,
    leadGoalsWeak: 1,
    cornerHandicapLower: 0,
    cornerHandicapUpper: 2.5,
    targetOdds: 0.8,
    maxOdds: 1.30,
    betDirection: "over",
    minCurrentCorners: 0,
    maxCurrentCorners: 99,
    leadSide: "strong",
  },
  {
    id: 5,
    name: "策略五 · 尾声角球(70'-99')",
    enabled: false,
    playTimeStart: 70,
    playTimeEnd: 99,
    leadGoals: 1,
    leadGoalsWeak: 1,
    cornerHandicapLower: 0,
    cornerHandicapUpper: 2.5,
    targetOdds: 0.8,
    maxOdds: 1.10,
    betDirection: "over",
    minCurrentCorners: 0,
    maxCurrentCorners: 99,
    leadSide: "any",
  },
  {
    id: 6,
    name: "策略六 · 逆风角球(55'-75')",
    enabled: false,
    playTimeStart: 55,
    playTimeEnd: 75,
    leadGoals: 1,
    leadGoalsWeak: 1,
    cornerHandicapLower: -0.5,
    cornerHandicapUpper: 1.5,
    targetOdds: 0.9,
    maxOdds: 1.30,
    betDirection: "over",
    minCurrentCorners: 2,
    maxCurrentCorners: 8,
    leadSide: "any",
  },
  {
    id: 7,
    name: "策略七 · 均值回归(60'-80')",
    enabled: false,
    playTimeStart: 60,
    playTimeEnd: 80,
    leadGoals: 99,
    leadGoalsWeak: 0,
    cornerHandicapLower: -0.5,
    cornerHandicapUpper: 1.5,
    targetOdds: 0.9,
    maxOdds: 1.30,
    betDirection: "over",
    minCurrentCorners: 3,
    maxCurrentCorners: 5,
    leadSide: "any",
  },
];

// ==================== 策略评估 ====================
// 策略评估统一由后端 cornerEvaluator.js 执行，前端直接使用 API 返回的 triggeredStrategies
// 修改策略逻辑请编辑 backend/services/cornerEvaluator.js

// ==================== 策略同步到后端 ====================

// debounce timer for updateStrategy backend sync
let __syncTimer: ReturnType<typeof setTimeout> | null = null;

function syncStrategiesToBackend(strategies: CornerStrategy[]) {
  fetch('/api/corner/strategies', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ strategies }),
  }).catch(err => console.error('[cornerStore] 策略同步失败:', err));
}


// ==================== 跨 Store 延迟访问 ====================
// cornerStore 和 useAppStore 存在循环依赖，使用延迟获取避免模块加载时死循环

function getAppStoreTrackedMatchIds(): string[] {
  try {
    // 动态 require 仅在运行时执行，不影响模块加载
    const mod = require('./useAppStore');
    return mod?.useAppStore?.getState?.()?.trackedMatchIds || [];
  } catch {
    return [];
  }
}

function getAppStoreState(): any | null {
  try {
    const mod = require('./useAppStore');
    return mod?.useAppStore?.getState?.() || null;
  } catch {
    return null;
  }
}

// ==================== 监控循环 ====================

let monitorInterval: ReturnType<typeof setTimeout> | null = null;

// ==================== Store 创建 ====================

export const useCornerStore = create<CornerStore>()(persist((set, get) => ({
  strategies: DEFAULT_STRATEGIES,
  liveMatches: [],
  monitorLog: [],
  isMonitoring: false,
  isLoggedIn: false,
  isLoading: false,
  loginInProgress: false,
  error: null,
  accountConfig: {
    username: "",
    password: "",
    remember: false
  },
  settings: {
    hgUsername: "",
    hgPassword: "",
    balance: 0,
    refreshInterval: 2,
    strongHandicapThreshold: 1,
    handicapUpperLimit: 3.5,
    handicapLowerLimit: -1.25,
    betAmount: 100,
    pollInterval: 8000,
    isRealMode: false,
    isSoundEnabled: true,
    autoBetEnabled: false,
    autoBetConfirmRequired: false,
  },
  activeCornerTab: 'crawler',
  historyFilterMatchId: null,
  backtestResults: {},
  crawlerData: null,
  scheduleData: [],
  mainMarketData: {},
  betConfirmRequired: false,
  scheduleFreshLoaded: false,
  autoRefresh: false,
  balanceLastUpdated: null,
  isBalanceLoading: false,

  setStrategies: (strategies, skipBackendSync) => { set({ strategies }); if (!skipBackendSync) syncStrategiesToBackend(strategies); },
  updateStrategy: (id, updates) => {
    set((state) => ({
      strategies: state.strategies.map((s) =>
        s.id === id ? { ...s, ...updates } : s
      ),
    }));
    const strategies = get().strategies;
    if (__syncTimer) clearTimeout(__syncTimer);
    __syncTimer = setTimeout(() => syncStrategiesToBackend(strategies), 300);
  },

  setAccountConfig: (config) =>
    set((state) => ({
      accountConfig: { ...state.accountConfig, ...config }
    })),

  setSettings: (partial) => {
    set((state) => ({
      settings: { ...state.settings, ...partial }
    }));
    // 配置变更时同步到后端（合并 trackedMatchIds）
    if ('isRealMode' in partial || 'betAmount' in partial || 'autoBetEnabled' in partial || 'autoBetConfirmRequired' in partial) {
      const s = get().settings;
      const trackedMatchIds = getAppStoreTrackedMatchIds();
      fetch('/api/corner/bet-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          isRealMode: s.isRealMode,
          amount: s.betAmount,
          autoBetEnabled: s.autoBetEnabled,
          autoBetConfirmRequired: s.autoBetConfirmRequired ?? false,
          trackedMatchIds
        })
      }).catch(() => {});
    }
    // 全局盘口设置变更时同步到后端
    if ('strongHandicapThreshold' in partial || 'handicapUpperLimit' in partial || 'handicapLowerLimit' in partial) {
      const s = get().settings;
      fetch('/api/corner/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          strongHandicapThreshold: s.strongHandicapThreshold,
          handicapUpperLimit: s.handicapUpperLimit,
          handicapLowerLimit: s.handicapLowerLimit,
        })
      }).catch(() => {});
    }
  },

  // 一次性同步所有配置到后端（用于页面初始化时确保前后端一致）
  syncAllSettingsToBackend: async () => {
    const s = get().settings;
    const trackedMatchIds = getAppStoreTrackedMatchIds();
    fetch('/api/corner/bet-config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        isRealMode: s.isRealMode,
        amount: s.betAmount,
        autoBetEnabled: s.autoBetEnabled,
        autoBetConfirmRequired: s.autoBetConfirmRequired ?? false,
        trackedMatchIds
      })
    }).catch(() => {});
    // ★ 同步策略到后端，确保后端重启后策略不丢失
    syncStrategiesToBackend(get().strategies);
    // ★ 同步全局设置到后端（盘口分界线、上下限）
    fetch('/api/corner/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        strongHandicapThreshold: s.strongHandicapThreshold,
        handicapUpperLimit: s.handicapUpperLimit,
        handicapLowerLimit: s.handicapLowerLimit,
      })
    }).catch(() => {});
  },

  updateBalance: (balance) =>
    set((state) => ({
      settings: { ...state.settings, balance }
    })),

  refreshBalance: async () => {
    set({ isBalanceLoading: true });
    try {
      const res = await fetch('/api/corner/balance');
      const data = await res.json();
      if (data.success && data.balance != null) {
        set((state) => ({
          settings: { ...state.settings, balance: data.balance },
          balanceLastUpdated: Date.now(),
        }));
      }
    } catch (err) {
      console.error('[cornerStore] 刷新余额失败:', err);
    } finally {
      set({ isBalanceLoading: false });
    }
  },

  setActiveCornerTab: (tab) => set({ activeCornerTab: tab }),

  setLoginStatus: (status, user) => set((state) => {
    const username = user || (status ? state.accountConfig.username : "");
    return {
      isLoggedIn: status,
      accountConfig: { ...state.accountConfig, username, password: status ? state.accountConfig.password : "" },
      settings: { ...state.settings, hgUsername: username, hgPassword: status ? state.settings.hgPassword : "" },
    };
  }),
  setLoginInProgress: (status) => set({ loginInProgress: status }),
  setHistoryFilterMatchId: (matchId) => set({ historyFilterMatchId: matchId }),
  setBacktestResults: (results) => set({ backtestResults: results }),

  login: async () => {
    const { accountConfig } = get();
    if (!accountConfig.username || !accountConfig.password) {
      set({ error: "请填写用户名和密码" });
      return false;
    }
    set({ isLoading: true, loginInProgress: true, error: null });
    try {
      const response = await fetch('/api/corner/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: accountConfig.username,
          password: accountConfig.password,
        }),
      });
      const data = await response.json();
      const success = data.success === true;
      if (success) {
        set({ isLoggedIn: true, isLoading: false, loginInProgress: false });
        get().addLog({ timestamp: new Date().toLocaleTimeString(), message: "登录成功", level: "info" });
        return true;
      } else {
        set({ error: "登录失败，请检查用户名和密码", isLoading: false, loginInProgress: false });
        return false;
      }
    } catch (err: any) {
      set({ error: err.message, isLoading: false, loginInProgress: false });
      return false;
    }
  },

  logout: () => {
    get().stopMonitor();
    set({ isLoggedIn: false });
    get().addLog({ timestamp: new Date().toLocaleTimeString(), message: "已登出", level: "info" });
  },

  startMonitor: async () => {
    const { isLoggedIn, login } = get();
    if (!isLoggedIn) {
      const loginSuccess = await login();
      if (!loginSuccess) return;
    }
    try {
      const response = await fetch('/api/corner/start', { method: 'POST' });
      const data = await response.json();
      if (data.success) {
        set({ isMonitoring: true });
        get().addLog({ timestamp: new Date().toLocaleTimeString(), message: "监控已启动", level: "info" });
        await get().refreshData();
        const schedulePoll = () => {
          if (!get().isMonitoring) return;
          const interval = 8000 + Math.random() * 2000;
          monitorInterval = setTimeout(() => { get().refreshData(); schedulePoll(); }, interval);
        };
        schedulePoll();
      } else {
        set({ error: "后端监控启动失败: " + (data.error || "未知错误") });
        get().addLog({ timestamp: new Date().toLocaleTimeString(), message: "监控启动失败", level: "warning" });
      }
    } catch (err: any) {
      set({ error: "后端监控启动请求失败: " + (err.message || "网络错误") });
      get().addLog({ timestamp: new Date().toLocaleTimeString(), message: "监控启动请求失败", level: "warning" });
    }
  },

  stopMonitor: () => {
    fetch('/api/corner/pause', { method: 'POST' }).catch(() => {});
    if (monitorInterval) { clearTimeout(monitorInterval); monitorInterval = null; }
    set({ isMonitoring: false, autoRefresh: false });
    get().addLog({ timestamp: new Date().toLocaleTimeString(), message: "监控已停止", level: "info" });
  },

  refreshData: async () => {
    set({ isLoading: true });
    try {
      // 从后端 API 获取最新的角球数据
      const response = await fetch('/api/corner/live');
      const json = await response.json();
      const rawMatches = json?.success && Array.isArray(json.data) ? json.data : [];
      const mainMarkets = json?.mainMarkets || {};

      // 映射到前端 CornerLiveMatch 格式（triggeredStrategies 由后端评估）
      const liveMatches: CornerLiveMatch[] = rawMatches.map((m: any) => ({
        matchId: String(m.matchId || ""),
        homeTeam: m.homeTeam || "",
        awayTeam: m.awayTeam || "",
        time: m.time || "",
        elapsedMinutes: m.elapsedMinutes ?? 0,
        homeScore: m.homeScore ?? 0,
        awayScore: m.awayScore ?? 0,
        homeCorners: m.homeCorners ?? 0,
        awayCorners: m.awayCorners ?? 0,
        cornerHandicap: m.cornerHandicap ?? 0,
        cornerOdds: m.cornerOdds ?? 0,
        handicaps: m.handicaps || [],
        _dataSource: m._dataSource,
        _cornerSource: m._cornerSource,
        triggeredStrategies: m.triggeredStrategies || []
      }));

      // ★ 合并 mainMarkets 到已有比赛 + 创建缺失的比赛条目
      if (Object.keys(mainMarkets).length > 0) {
        const existingKeys = new Set<string>();
        const existingIds = new Set<string>();

        // 1. 合并 mainMarkets 到已有比赛
        for (const m of liveMatches) {
          const teamKey = (m.homeTeam || "") + "|" + (m.awayTeam || "");
          existingKeys.add(teamKey.toLowerCase());
          existingIds.add(String(m.matchId || ""));

          const mm = (mainMarkets as any)[String(m.matchId || "")] || (mainMarkets as any)[teamKey];
          if (!mm) continue;

          const extraHandicaps: any[] = [];
          let order = (m.handicaps || []).length + 1;

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
            (m as any).handicaps = [...(m.handicaps || []), ...extraHandicaps];
          }
        }

        // 2. 为 mainMarkets 中没有对应 liveMatches 条目的比赛创建新条目
        for (const [key, mmRaw] of Object.entries(mainMarkets)) {
          const mm = mmRaw as any;
          if (existingIds.has(key) || existingKeys.has(key.toLowerCase())) continue;
          const sepIdx = key.indexOf("|");
          if (sepIdx < 1) continue;
          const homeTeam = key.substring(0, sepIdx);
          const awayTeam = key.substring(sepIdx + 1);
          if (!homeTeam || !awayTeam) continue;

          const handicaps: any[] = [];
          let order = 1;
          for (const h of (mm.hdp || [])) {
            handicaps.push({
              order: order++, category: "HDP", categoryLabel: "让球",
              period: "full", line: h.line || 0,
              odds: { home: h.homeOdds || 0, away: h.awayOdds || 0 },
              source: "api", marketGroup: "hdp",
            });
          }
          for (const o of (mm.ou || [])) {
            handicaps.push({
              order: order++, category: "O/U", categoryLabel: "大小球",
              period: "full", line: o.line || 0,
              odds: { over: o.overOdds || 0, under: o.underOdds || 0 },
              source: "api", marketGroup: "ou",
            });
          }
          for (const h of (mm.hdpHalf || [])) {
            handicaps.push({
              order: order++, category: "HDP", categoryLabel: "上半场 让球",
              period: "half", line: h.line || 0,
              odds: { home: h.homeOdds || 0, away: h.awayOdds || 0 },
              source: "api", marketGroup: "hdp",
            });
          }
          for (const o of (mm.ouHalf || [])) {
            handicaps.push({
              order: order++, category: "O/U", categoryLabel: "上半场 大小球",
              period: "half", line: o.line || 0,
              odds: { over: o.overOdds || 0, under: o.underOdds || 0 },
              source: "api", marketGroup: "ou",
            });
          }

          if (handicaps.length > 0) {
            existingKeys.add(key.toLowerCase());
            liveMatches.push({
              matchId: "mm_" + key,
              homeTeam, awayTeam,
              time: "",
              elapsedMinutes: 0,
              homeScore: 0, awayScore: 0,
              homeCorners: 0, awayCorners: 0,
              cornerHandicap: 0, cornerOdds: 0,
              handicaps,
              _dataSource: "api",
              _cornerSource: "none",
              triggeredStrategies: [],
            } as any);
          }
        }
      }

      set({ liveMatches, isLoading: false });

      // 自动清理已失效的 trackedMatchIds：移除不在当前 liveMatches 中的 ID 或已结束的比赛
      const appState = getAppStoreState();
      if (appState) {
        const currentTracked = appState.trackedMatchIds || [];
        if (currentTracked.length > 0) {
          const liveMatchIds = new Set(liveMatches.map((m: any) => String(m.matchId || "")));
          const staleIds = currentTracked.filter((id: string) => !liveMatchIds.has(id));
          if (staleIds.length > 0) {
            for (const id of staleIds) {
              appState.removeTrackedMatch(id);
            }
            console.log(`[cornerStore] 自动清理 ${staleIds.length} 个已结束的追踪比赛: [${staleIds.join(',')}]`);
          }
        }
      }

      const triggeredCount = liveMatches.reduce((sum, m) => sum + m.triggeredStrategies.length, 0);
      if (triggeredCount > 0) {
        get().addLog({ timestamp: new Date().toLocaleTimeString(), message: `检测到 ${triggeredCount} 个策略触发`, level: "signal" });
      }
    } catch (err: any) {
      console.error("[角球系统] 刷新数据失败:", err);
      set({ isLoading: false });
    }
  },

  setLiveMatches: (matches) => set({ liveMatches: matches }),

  addLog: (entry) =>
    set((state) => ({ monitorLog: [...state.monitorLog.slice(-99), entry] })),
  clearLog: () => set({ monitorLog: [] }),
  clearError: () => set({ error: null }),
  setCrawlerData: (data) => set({ crawlerData: data }),
  setScheduleData: (data) => set({ scheduleData: data }),
  setMainMarketData: (data) => set({ mainMarketData: data }),
  setBetConfirmRequired: (required) => set({ betConfirmRequired: required }),
  setScheduleFreshLoaded: (loaded) => set({ scheduleFreshLoaded: loaded }),
  setAutoRefresh: (on) => set({ autoRefresh: on }),
}), {
  name: "corner-store",
  storage: createJSONStorage(() => localStorage),
  partialize: (state) => ({
    strategies: state.strategies,
    accountConfig: { username: state.accountConfig.username, remember: state.accountConfig.remember },
    settings: { ...state.settings, hgPassword: "" },
    autoRefresh: state.autoRefresh,
    balanceLastUpdated: state.balanceLastUpdated,
  })
}));

if (typeof window !== "undefined") {
  useCornerStore.persist.onFinishHydration(() => {
    const state = useCornerStore.getState();
    const strategies = state.strategies;
    syncStrategiesToBackend(strategies);
    // 验证持久化的登录状态：如果 isLoggedIn=true，检查后端 session 是否有效
    if (state.isLoggedIn) {
      fetch("/api/corner/status")
        .then(r => r.json())
        .then(data => {
          if (!data.success || !data.data?.crawler?.isLoggedIn) {
            useCornerStore.getState().setLoginStatus(false);
          }
        })
        .catch(() => {
          // 后端未启动时不重置，下次 fetchStatus 会自动同步
        });
    }
  });
}


// 页面关闭时清理定时器（模块级别，仅注册一次）
if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', () => {
    useCornerStore.getState().stopMonitor();
  });
}
