import { create } from "zustand";
import { TeamStats } from "../data/realTeamsData";
import { ModelWeights } from "../utils/quantModel";

// ==================== 类型定义 ====================

export type TabType = "dashboard" | "standings" | "teams" | "worldcup" | "corner" | "updates";

export interface LiveMatchState {
  isLive: boolean;
  elapsedMinutes: number;
  homeScore: number;
  awayScore: number;
  homeShots: number;
  awayShots: number;
  homeShotsOnTarget: number;
  awayShotsOnTarget: number;
  homePossession: number;
  awayPossession: number;
  homeCorners: number;
  awayCorners: number;
  homeYellowCards: number;
  awayYellowCards: number;
  homeRedCards: number;
  awayRedCards: number;
  currentEvent: string | null;
  matchStatus: "pre-match" | "live" | "halftime" | "fulltime";
  odds: { home: number; draw: number; away: number };
}

export type LiveMatchAction =
  | { type: "SET_LIVE_STATUS"; payload: boolean }
  | { type: "UPDATE_MINUTE"; payload: number }
  | { type: "UPDATE_SCORE"; payload: { home: number; away: number } }
  | { type: "UPDATE_SHOTS"; payload: { home: number; away: number } }
  | { type: "UPDATE_SHOTS_ON_TARGET"; payload: { home: number; away: number } }
  | { type: "UPDATE_POSSESSION"; payload: { home: number; away: number } }
  | { type: "UPDATE_CORNERS"; payload: { home: number; away: number } }
  | { type: "UPDATE_YELLOW_CARDS"; payload: { home: number; away: number } }
  | { type: "UPDATE_RED_CARDS"; payload: { home: number; away: number } }
  | { type: "SET_EVENT"; payload: string | null }
  | { type: "SET_STATUS"; payload: "pre-match" | "live" | "halftime" | "fulltime" }
  | { type: "UPDATE_ODDS"; payload: { home: number; draw: number; away: number } }
  | { type: "RESET_MATCH" };

// ==================== Store 接口 ====================

export interface AppStore {
  // 球队选择
  selectedHomeId: string;
  selectedAwayId: string;
  selectedHomeLeague: string;
  selectedAwayLeague: string;
  selectedMatchId: string;
  trackedMatchIds: string[];
  cornerActiveSubTab: string;
  activeTab: TabType;
  teamsPageTeamId: string;
  teamsPageTeamStats: any | null;

  // 数据同步
  teams: TeamStats[];
  isTeamsLoading: boolean;
  teamsSyncMsg: string;
  teamsSyncSource: string;
  fixtures: any[];
  isFixturesLoading: boolean;
  fixtureSyncMsg: string;
  fixtureSyncSource: string;

  // 风险 + 权重
  customWeights: ModelWeights;

  // 实时比赛
  liveMatch: LiveMatchState;

  // 回调函数
  loadRealTimeStandings: () => void;
  loadRealTimeFixtures: () => void;

  // ===== Actions =====
  setHomeTeam: (teamId: string, league: string) => void;
  setAwayTeam: (teamId: string, league: string) => void;
  setHomeLeague: (league: string, firstTeamId: string) => void;
  setAwayLeague: (league: string, firstTeamId: string) => void;
  setActiveTab: (tab: TabType) => void;
  setSelectedMatchId: (id: string) => void;
  addTrackedMatch: (matchId: string) => void;
  removeTrackedMatch: (matchId: string) => void;
  navigateToCorner: (matchId: string) => void;
  navigateToDashboard: (homeId: string, awayId: string, homeLeague: string, awayLeague: string) => void;
  setCornerActiveSubTab: (tab: string) => void;
  setHomeAndGo: (teamId: string, league: string) => void;
  setAwayAndGo: (teamId: string, league: string) => void;
  resetToDefaults: () => void;
  setTeamsPageTeam: (teamId: string, stats: any) => void;
  updateTeamStats: (teamId: string, stats: Partial<TeamStats>) => void;

  setTeams: (teams: TeamStats[]) => void;
  setTeamsLoading: (loading: boolean) => void;
  setTeamsSyncMsg: (msg: string) => void;
  setTeamsSyncSource: (src: string) => void;
  setFixtures: (fixtures: any[]) => void;
  setFixturesLoading: (loading: boolean) => void;
  setFixtureSyncMsg: (msg: string) => void;
  setFixtureSyncSource: (src: string) => void;

  setLoadRealTimeStandings: (fn: () => void) => void;
  setLoadRealTimeFixtures: (fn: () => void) => void;

  setCustomWeights: (weights: ModelWeights) => void;

  dispatchLiveMatch: (action: LiveMatchAction) => void;
  resetLiveMatch: () => void;
}

// ==================== 初始值 ====================

const initialLiveMatch: LiveMatchState = {
  isLive: false, elapsedMinutes: 0, homeScore: 0, awayScore: 0,
  homeShots: 0, awayShots: 0, homeShotsOnTarget: 0, awayShotsOnTarget: 0,
  homePossession: 50, awayPossession: 50, homeCorners: 0, awayCorners: 0,
  homeYellowCards: 0, awayYellowCards: 0, homeRedCards: 0, awayRedCards: 0,
  currentEvent: null, matchStatus: "pre-match",
  odds: { home: 2.0, draw: 3.2, away: 3.5 },
};

const defaultState = {
  selectedHomeId: "mancity",
  selectedAwayId: "arsenal",
  selectedHomeLeague: "EPL",
  selectedAwayLeague: "EPL",
  selectedMatchId: "",
  trackedMatchIds: [] as string[],
  cornerActiveSubTab: "monitor",
  activeTab: "dashboard" as TabType,
  teamsPageTeamId: "mancheng",
  teamsPageTeamStats: null as any,

  teams: [] as TeamStats[],
  isTeamsLoading: false,
  teamsSyncMsg: "",
  teamsSyncSource: "",
  fixtures: [] as any[],
  isFixturesLoading: false,
  fixtureSyncMsg: "",
  fixtureSyncSource: "",

  customWeights: { odds: 0.45, strength: 0.30, homeAway: 0.15, h2h: 0.10, form: 0.05 } as ModelWeights,

  liveMatch: initialLiveMatch,
  loadRealTimeStandings: (() => {}) as () => void,
  loadRealTimeFixtures: (() => {}) as () => void,
};

// ==================== Reducer ====================

function liveMatchReducer(state: LiveMatchState, action: LiveMatchAction): LiveMatchState {
  switch (action.type) {
    case "SET_LIVE_STATUS": return { ...state, isLive: action.payload };
    case "UPDATE_MINUTE": return { ...state, elapsedMinutes: action.payload };
    case "UPDATE_SCORE": return { ...state, homeScore: action.payload.home, awayScore: action.payload.away };
    case "UPDATE_SHOTS": return { ...state, homeShots: action.payload.home, awayShots: action.payload.away };
    case "UPDATE_SHOTS_ON_TARGET": return { ...state, homeShotsOnTarget: action.payload.home, awayShotsOnTarget: action.payload.away };
    case "UPDATE_POSSESSION": return { ...state, homePossession: action.payload.home, awayPossession: action.payload.away };
    case "UPDATE_CORNERS": return { ...state, homeCorners: action.payload.home, awayCorners: action.payload.away };
    case "UPDATE_YELLOW_CARDS": return { ...state, homeYellowCards: action.payload.home, awayYellowCards: action.payload.away };
    case "UPDATE_RED_CARDS": return { ...state, homeRedCards: action.payload.home, awayRedCards: action.payload.away };
    case "SET_EVENT": return { ...state, currentEvent: action.payload };
    case "SET_STATUS": return { ...state, matchStatus: action.payload };
    case "UPDATE_ODDS": return { ...state, odds: action.payload };
    case "RESET_MATCH": return initialLiveMatch;
    default: return state;
  }
}

// ==================== Store ====================

function syncTrackedMatchesToBackend(ids: string[]) {
  // 合并投注配置一起发送，避免覆盖后端其他配置
  let betConfig: Record<string, any> = { trackedMatchIds: ids };
  try {
    const cornerModule = require('./cornerStore');
    if (cornerModule?.useCornerStore?.getState) {
      const s = cornerModule.useCornerStore.getState().settings;
      betConfig.isRealMode = s.isRealMode;
      betConfig.amount = s.betAmount;
      betConfig.autoBetEnabled = s.autoBetEnabled;
      betConfig.autoBetConfirmRequired = s.autoBetConfirmRequired ?? false;
    }
  } catch (_) {}
  fetch('/api/corner/bet-config', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(betConfig)
  }).catch(() => {});
}

export const useAppStore = create<AppStore>((set) => ({
  ...defaultState,

  setHomeTeam: (teamId, league) => set({ selectedHomeId: teamId, selectedHomeLeague: league }),
  setAwayTeam: (teamId, league) => set({ selectedAwayId: teamId, selectedAwayLeague: league }),
  setHomeLeague: (league, firstTeamId) => set({ selectedHomeLeague: league, selectedHomeId: firstTeamId }),
  setAwayLeague: (league, firstTeamId) => set({ selectedAwayLeague: league, selectedAwayId: firstTeamId }),
  setActiveTab: (tab) => set({ activeTab: tab }),
  setSelectedMatchId: (id) => set({ selectedMatchId: id }),
  addTrackedMatch: (matchId) => set((s) => { const next = s.trackedMatchIds.includes(matchId) ? s.trackedMatchIds : [...s.trackedMatchIds, matchId]; syncTrackedMatchesToBackend(next); return { trackedMatchIds: next }; }),
  removeTrackedMatch: (matchId) => set((s) => { const next = s.trackedMatchIds.filter((id) => id !== matchId); syncTrackedMatchesToBackend(next); return { trackedMatchIds: next }; }),
  navigateToCorner: (matchId) => set({ selectedMatchId: matchId }),
  setCornerActiveSubTab: (tab) => set({ cornerActiveSubTab: tab }),
  navigateToDashboard: (homeId, awayId, homeLeague, awayLeague) =>
    set({ selectedHomeId: homeId, selectedAwayId: awayId, selectedHomeLeague: homeLeague, selectedAwayLeague: awayLeague }),
  setHomeAndGo: (teamId, league) => set({ selectedHomeId: teamId, selectedHomeLeague: league }),
  setAwayAndGo: (teamId, league) => set({ selectedAwayId: teamId, selectedAwayLeague: league }),
  resetToDefaults: () => set({
    customWeights: { odds: 0.45, strength: 0.30, homeAway: 0.15, h2h: 0.10, form: 0.05 } as ModelWeights,
    liveMatch: initialLiveMatch,
  }),
  setTeamsPageTeam: (teamId, stats) => set({ teamsPageTeamId: teamId, teamsPageTeamStats: stats }),
  updateTeamStats: (teamId, stats) => set((s) => ({
    teams: s.teams.map((t) =>
      t.id === teamId ? { ...t, ...stats } : t
    ),
  })),

  setTeams: (teams) => set({ teams }),
  setTeamsLoading: (loading) => set({ isTeamsLoading: loading }),
  setTeamsSyncMsg: (msg) => set({ teamsSyncMsg: msg }),
  setTeamsSyncSource: (src) => set({ teamsSyncSource: src }),
  setFixtures: (fixtures) => set({ fixtures }),
  setFixturesLoading: (loading) => set({ isFixturesLoading: loading }),
  setFixtureSyncMsg: (msg) => set({ fixtureSyncMsg: msg }),
  setFixtureSyncSource: (src) => set({ fixtureSyncSource: src }),

  setLoadRealTimeStandings: (fn) => set({ loadRealTimeStandings: fn }),
  setLoadRealTimeFixtures: (fn) => set({ loadRealTimeFixtures: fn }),

  setCustomWeights: (weights) => set({ customWeights: weights }),

  dispatchLiveMatch: (action) => set((state) => ({ liveMatch: liveMatchReducer(state.liveMatch, action) })),
  resetLiveMatch: () => set({ liveMatch: initialLiveMatch }),
}));

export const useActiveTab = () => useAppStore((s) => s.activeTab);
