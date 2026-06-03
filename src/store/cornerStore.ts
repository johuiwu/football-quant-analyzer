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
}

/** 盘口条目 */
export interface HandicapEntry {
  order: number;
  category: "O/U" | "HDP" | "1X2" | "O/E";
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
  source: "dom" | "xhr" | "fallback";
}

/** 实时比赛角球数据 */
export interface CornerLiveMatch {
  matchId: string;
  homeTeam: string;
  awayTeam: string;
  elapsedMinutes: number;
  homeScore: number;
  awayScore: number;
  homeCorners: number;
  awayCorners: number;
  cornerHandicap: number;
  cornerOdds: number;
  handicaps: HandicapEntry[];
  triggeredStrategies: number[];
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
  strongHandicapThreshold: number;
  handicapUpperLimit: number;
  handicapLowerLimit: number;
  betAmount: number;
  pollInterval: number;
  isRealMode: boolean;
  isSoundEnabled: boolean;
}

/** 回测统计数据 */
export interface BacktestStats {
  strategyId: string;
  strategyName: string;
  triggered: number;
  wins: number;
  losses: number;
  winRate: number;
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
  error: string | null;
  accountConfig: AccountConfig;
  settings: CornerSettings;
  activeCornerTab: string;
  historyFilterMatchId: string | null;
  backtestResults: Record<number, BacktestStats>;
  crawlerData: any | null;
  scheduleData: any[];
  betConfirmRequired: boolean;
  setStrategies: (strategies: CornerStrategy[]) => void;
  updateStrategy: (id: number, updates: Partial<CornerStrategy>) => void;
  setAccountConfig: (config: Partial<AccountConfig>) => void;
  login: () => Promise<boolean>;
  logout: () => void;
  setSettings: (partial: Partial<CornerSettings>) => void;
  setLoginStatus: (status: boolean, user?: string) => void;
  setActiveCornerTab: (tab: string) => void;
  setHistoryFilterMatchId: (matchId: string | null) => void;
  setBacktestResults: (results: Record<number, BacktestStats>) => void;
  updateBalance: (balance: number) => void;
  startMonitor: () => Promise<void>;
  stopMonitor: () => void;
  refreshData: () => Promise<void>;
  setLiveMatches: (matches: CornerLiveMatch[]) => void;
  addLog: (entry: MonitorLogEntry) => void;
  clearLog: () => void;
  clearError: () => void;
  setCrawlerData: (data: any | null) => void;
  setScheduleData: (data: any[]) => void;
  setBetConfirmRequired: (required: boolean) => void;
}

// ==================== 默认策略 ====================

const DEFAULT_STRATEGIES: CornerStrategy[] = [
  {
    id: 1,
    name: "策略一 · 走地角球(35'-55')",
    enabled: false,
    playTimeStart: 35,
    playTimeEnd: 55,
    leadGoals: 99,
    leadGoalsWeak: 1,
    cornerHandicapLower: -1.25,
    cornerHandicapUpper: 3.5,
    targetOdds: 0.8,
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
    cornerHandicapUpper: 1.5,
    targetOdds: 0.8,
  },
  {
    id: 4,
    name: "策略四 · 领先追角(60'-99')",
    enabled: false,
    playTimeStart: 60,
    playTimeEnd: 99,
    leadGoals: 2,
    leadGoalsWeak: 0,
    cornerHandicapLower: 0,
    cornerHandicapUpper: 3.5,
    targetOdds: 0.8,
  },
  {
    id: 5,
    name: "策略五 · 尾声角球(70'-99')",
    enabled: false,
    playTimeStart: 70,
    playTimeEnd: 99,
    leadGoals: 1,
    leadGoalsWeak: 0,
    cornerHandicapLower: 0,
    cornerHandicapUpper: 3.5,
    targetOdds: 0.8,
  },
];

// ==================== 策略评估 ====================

function evaluateMatchForStrategies(
  match: { currentMinute: number; cornerHandicap: number; odds: number; homeScore: number; awayScore: number },
  strategies: CornerStrategy[]
): number[] {
  const triggered: number[] = [];
  const goalDiff = Math.abs(match.homeScore - match.awayScore);
  for (const strategy of strategies) {
    if (!strategy.enabled) continue;
    if (match.currentMinute < strategy.playTimeStart) continue;
    if (match.currentMinute > strategy.playTimeEnd) continue;
    if (match.cornerHandicap < strategy.cornerHandicapLower) continue;
    if (match.cornerHandicap > strategy.cornerHandicapUpper) continue;
    if (match.odds < strategy.targetOdds) continue;

    // 比赛时间合理性校验（与后端 cornerEvaluator.js 一致）
    if (match.currentMinute > 95) continue;             // 超过最大比赛时间
    if (match.currentMinute >= 45 && match.currentMinute <= 46) continue; // 半场休息

    // 比分条件（与后端 cornerEvaluator.js 严格一致）
    // 1) leadGoals >= 20 → 哨兵值，不做比分限制
    if (strategy.leadGoals >= 20) { triggered.push(strategy.id); continue; }
    // 2) leadGoals > 0 且 leadGoalsWeak === 0 → 上限：球差不超过阈值
    if (strategy.leadGoals > 0 && (strategy.leadGoalsWeak || 0) === 0 && goalDiff <= strategy.leadGoals) { triggered.push(strategy.id); continue; }
    // 3) leadGoalsWeak > 0 → 弱队领先：至少差N球
    if ((strategy.leadGoalsWeak || 0) > 0 && goalDiff >= (strategy.leadGoalsWeak || 0)) { triggered.push(strategy.id); continue; }
    // 4) leadGoals === 0 且 leadGoalsWeak === 0 → 平局检查：goalDiff 必须为 0
    if (strategy.leadGoals === 0 && (strategy.leadGoalsWeak || 0) === 0 && goalDiff === 0) { triggered.push(strategy.id); continue; }
  }
  return triggered;
}

// ==================== 策略同步到后端 ====================

function syncStrategiesToBackend(strategies: CornerStrategy[]) {
  fetch('/api/corner/strategies', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ strategies }),
  }).catch(err => console.error('[cornerStore] 策略同步失败:', err));
}

// ==================== 监控循环 ====================

let monitorInterval: ReturnType<typeof setInterval> | null = null;

// ==================== Store 创建 ====================

export const useCornerStore = create<CornerStore>()(persist((set, get) => ({
  strategies: DEFAULT_STRATEGIES,
  liveMatches: [],
  monitorLog: [],
  isMonitoring: false,
  isLoggedIn: false,
  isLoading: false,
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
    pollInterval: 5000,
    isRealMode: false,
    isSoundEnabled: true,
  },
  activeCornerTab: 'crawler',
  historyFilterMatchId: null,
  backtestResults: {},
  crawlerData: null,
  scheduleData: [],
  betConfirmRequired: false,

  setStrategies: (strategies) => { set({ strategies }); syncStrategiesToBackend(strategies); },
  updateStrategy: (id, updates) =>
    set((state) => ({
      strategies: state.strategies.map((s) =>
        s.id === id ? { ...s, ...updates } : s
      ),
    })),

  setAccountConfig: (config) =>
    set((state) => ({
      accountConfig: { ...state.accountConfig, ...config }
    })),

  setSettings: (partial) =>
    set((state) => ({
      settings: { ...state.settings, ...partial }
    })),

  updateBalance: (balance) =>
    set((state) => ({
      settings: { ...state.settings, balance }
    })),

  setActiveCornerTab: (tab) => set({ activeCornerTab: tab }),

  setLoginStatus: (status, user) => set((state) => {
    const username = user || (status ? state.accountConfig.username : "");
    return {
      isLoggedIn: status,
      accountConfig: { ...state.accountConfig, username, password: status ? state.accountConfig.password : "" },
      settings: { ...state.settings, hgUsername: username, hgPassword: status ? state.settings.hgPassword : "" },
    };
  }),
  setHistoryFilterMatchId: (matchId) => set({ historyFilterMatchId: matchId }),
  setBacktestResults: (results) => set({ backtestResults: results }),

  login: async () => {
    const { accountConfig } = get();
    if (!accountConfig.username || !accountConfig.password) {
      set({ error: "请填写用户名和密码" });
      return false;
    }
    set({ isLoading: true, error: null });
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
        set({ isLoggedIn: true, isLoading: false });
        get().addLog({ timestamp: new Date().toLocaleTimeString(), message: "登录成功", level: "info" });
        return true;
      } else {
        set({ error: "登录失败，请检查用户名和密码", isLoading: false });
        return false;
      }
    } catch (err: any) {
      set({ error: err.message, isLoading: false });
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
    set({ isMonitoring: true });
    get().addLog({ timestamp: new Date().toLocaleTimeString(), message: "监控已启动", level: "info" });
    await get().refreshData();
    monitorInterval = setInterval(() => { get().refreshData(); }, get().settings.pollInterval);
  },

  stopMonitor: () => {
    if (monitorInterval) { clearInterval(monitorInterval); monitorInterval = null; }
    set({ isMonitoring: false });
    get().addLog({ timestamp: new Date().toLocaleTimeString(), message: "监控已停止", level: "info" });
  },

  refreshData: async () => {
    set({ isLoading: true });
    try {
      // 从后端 API 获取最新的角球数据
      const response = await fetch('/api/corner/live');
      const json = await response.json();
      const rawMatches = json?.success && Array.isArray(json.data) ? json.data : [];

      // 映射到前端 CornerLiveMatch 格式
      const liveMatches: CornerLiveMatch[] = rawMatches.map((m: any) => ({
        matchId: String(m.matchId || ""),
        homeTeam: m.homeTeam || "",
        awayTeam: m.awayTeam || "",
        elapsedMinutes: m.elapsedMinutes || 0,
        homeScore: m.homeScore || 0,
        awayScore: m.awayScore || 0,
        homeCorners: m.homeCorners || 0,
        awayCorners: m.awayCorners || 0,
        cornerHandicap: m.cornerHandicap || 0,
        cornerOdds: m.cornerOdds || 0,
        handicaps: m.handicaps || [],
        triggeredStrategies: evaluateMatchForStrategies(
          { currentMinute: m.elapsedMinutes || 0, cornerHandicap: m.cornerHandicap || 0, odds: m.cornerOdds || 0, homeScore: m.homeScore || 0, awayScore: m.awayScore || 0 },
          get().strategies
        )
      }));


      set({ liveMatches, isLoading: false });
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
  setBetConfirmRequired: (required) => set({ betConfirmRequired: required }),
}), {
  name: "corner-store",
  storage: createJSONStorage(() => localStorage),
  partialize: (state) => ({
    strategies: state.strategies,
    accountConfig: state.accountConfig,
    settings: state.settings
  })
}));


// 页面关闭时清理定时器（模块级别，仅注册一次）
if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', () => {
    useCornerStore.getState().stopMonitor();
  });
}
