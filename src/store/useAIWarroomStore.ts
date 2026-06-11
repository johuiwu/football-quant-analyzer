import { create } from "zustand";

export interface AgentStatus {
  id: string;
  name: string;
  status: 'idle' | 'running' | 'completed' | 'error';
  progress: number;       // 0-100
  lastOutput?: string;
  error?: string;
}

export interface TacticalData {
  playerPositions: Array<{ id: number; x: number; y: number; team: 'home' | 'away' }>;
  passRoutes: Array<{ from: number; to: number; weight: number }>;
  heatMap: Array<{ x: number; y: number; intensity: number }>;
}

export interface PredictionResult {
  score: { home: number; away: number };
  winProbabilities: { home: number; draw: number; away: number };
  confidenceInterval: { low: number; high: number };
  timestamp: string;
  agentConsensus?: string;
  topScores: Array<{ home: number; away: number; probability: number }>;
  win_rate_curve?: Array<{ minute: number; home: number; draw: number; away: number }>;
}

export interface TaskRecord {
  id: string;
  matchId: string;
  homeTeam: string;
  awayTeam: string;
  result: PredictionResult;
  createdAt: string;
}

const INITIAL_AGENTS: AgentStatus[] = [
  { id: "probability-analyst", name: "概率分析师", status: "idle", progress: 0 },
  { id: "odds-evaluator", name: "赔率评估师", status: "idle", progress: 0 },
  { id: "tactical-analyst", name: "战术分析师", status: "idle", progress: 0 },
  { id: "form-analyst", name: "状态分析师", status: "idle", progress: 0 },
  { id: "h2h-analyst", name: "交锋分析师", status: "idle", progress: 0 },
  { id: "injury-analyst", name: "伤病分析师", status: "idle", progress: 0 },
  { id: "weather-analyst", name: "天气分析师", status: "idle", progress: 0 },
  { id: "momentum-analyst", name: "势头分析师", status: "idle", progress: 0 },
  { id: "stats-aggregator", name: "数据聚合器", status: "idle", progress: 0 },
  { id: "model-ensemble", name: "模型集成器", status: "idle", progress: 0 },
  { id: "risk-assessor", name: "风险评估师", status: "idle", progress: 0 },
  { id: "confidence-calibrator", name: "置信度校准器", status: "idle", progress: 0 },
  { id: "market-sentiment", name: "市场情绪师", status: "idle", progress: 0 },
  { id: "match-tracker", name: "赛事进程追踪", status: "idle", progress: 0 },
  { id: "attack-stats", name: "攻防数据统计", status: "idle", progress: 0 },
  { id: "shot-probability", name: "射门概率计算", status: "idle", progress: 0 },
];

export interface AIWarroomStore {
  agents: AgentStatus[];
  tacticalData: TacticalData;
  predictionResult: PredictionResult;
  taskHistory: TaskRecord[];
  updateAgentStatus: (id: string, status: Partial<AgentStatus>) => void;
  updateTacticalData: (data: Partial<TacticalData>) => void;
  updatePrediction: (result: PredictionResult) => void;
  addTaskRecord: (record: TaskRecord) => void;
  resetAll: () => void;
}

export const useAIWarroomStore = create<AIWarroomStore>((set) => ({
  agents: INITIAL_AGENTS,
  tacticalData: { playerPositions: [], passRoutes: [], heatMap: [] },
  predictionResult: {
    score: { home: 0, away: 0 },
    winProbabilities: { home: 0, draw: 0, away: 0 },
    confidenceInterval: { low: 0, high: 0 },
    timestamp: "",
    topScores: [],
  },
  taskHistory: [],

  updateAgentStatus: (id, statusUpdate) =>
    set((state) => ({
      agents: state.agents.map((a) => a.id === id ? { ...a, ...statusUpdate } : a),
    })),

  updateTacticalData: (data) =>
    set((state) => ({ tacticalData: { ...state.tacticalData, ...data } })),

  updatePrediction: (result) =>
    set({ predictionResult: result }),

  addTaskRecord: (record) =>
    set((state) => ({
      taskHistory: [record, ...state.taskHistory].slice(0, 50),
    })),

  resetAll: () =>
    set({
      agents: INITIAL_AGENTS,
      tacticalData: { playerPositions: [], passRoutes: [], heatMap: [] },
      predictionResult: {
        score: { home: 0, away: 0 },
        winProbabilities: { home: 0, draw: 0, away: 0 },
        confidenceInterval: { low: 0, high: 0 },
        timestamp: "",
        topScores: [],
      },
      taskHistory: [],
    }),
}));