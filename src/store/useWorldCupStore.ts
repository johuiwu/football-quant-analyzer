import { create } from "zustand";
import { WORLD_CUP_FIXTURES_2026, WORLD_CUP_TEAMS, WorldCupFixture, WorldCupTeam } from "../data/worldcup_data";

export interface WorldCupPrediction {
  homeWinProb: number;
  drawProb: number;
  awayWinProb: number;
  homeExpectedGoals: number;
  awayExpectedGoals: number;
  predictedScore: string;
  dataSource?: 'crawler' | 'static' | 'elo';
}

export interface WorldCupGroupProb {
  teamId: string;
  advanceProb: number;
}

interface State {
  fixtures: WorldCupFixture[];
  teams: WorldCupTeam[];
  predictions: Record<string, WorldCupPrediction>;
  groupAdvanceProbs: WorldCupGroupProb[];
  isLoading: boolean;
  error: string | null;
  lastPredictionUpdate: string | null;
}

interface Actions {
  fetchPredictions: (matchId?: string) => Promise<void>;
  fetchAllPredictions: (forceRefresh?: boolean) => Promise<void>;
  fetchGroupStage: () => Promise<void>;
  clearPredictions: () => void;
  setLoading: (loading: boolean) => void;
  reset: () => void;
}

export type WorldCupStore = State & Actions;

const initialState: State = {
  fixtures: WORLD_CUP_FIXTURES_2026,
  teams: WORLD_CUP_TEAMS,
  predictions: {},
  groupAdvanceProbs: [],
  isLoading: false,
  error: null,
  lastPredictionUpdate: null,
};

let _fetchBatchAbortController: AbortController | null = null;
let _fetchGroupAbortController: AbortController | null = null;

export const useWorldCupStore = create<WorldCupStore>((set, get) => ({
  ...initialState,

  fetchPredictions: async (matchId?: string) => {
    const controller = new AbortController();

    set({ isLoading: true, error: null });
    try {
      if (matchId) {
        const fixture = get().fixtures.find((f) => f.id === matchId);
        if (!fixture) {
          set({ isLoading: false, error: `Fixture ${matchId} not found` });
          return;
        }
        const res = await fetch("/api/worldcup/predict", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            homeTeamId: fixture.homeTeam,
            awayTeamId: fixture.awayTeam,
            stage: fixture.stage,
          }),
          signal: controller.signal,
        });
        if (!res.ok) throw new Error(`Failed to fetch prediction for ${matchId}`);
        const data: WorldCupPrediction = await res.json();
        set((s) => ({
          predictions: { ...s.predictions, [matchId]: data },
          isLoading: false,
          lastPredictionUpdate: new Date().toISOString(),
        }));
      } else {
        const existingPredictions = get().predictions;
        const fixtures = get().fixtures;
        const missingFixtures = fixtures.filter(f => !existingPredictions[f.id]);
        
        if (missingFixtures.length === 0) {
          set({ isLoading: false });
          return;
        }

        const results: Record<string, WorldCupPrediction> = { ...existingPredictions };
        for (const fixture of missingFixtures) {
          if (controller.signal.aborted) break;
          const res = await fetch("/api/worldcup/predict", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              homeTeamId: fixture.homeTeam,
              awayTeamId: fixture.awayTeam,
              stage: fixture.stage,
            }),
            signal: controller.signal,
          });
          if (!res.ok) throw new Error(`Failed to fetch prediction for ${fixture.id}`);
          const data: WorldCupPrediction = await res.json();
          results[fixture.id] = data;
        }
        if (!controller.signal.aborted) {
          set({ 
            predictions: results, 
            isLoading: false,
            lastPredictionUpdate: new Date().toISOString()
          });
        }
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      set({
        isLoading: false,
        error: err instanceof Error ? err.message : "Unknown error fetching predictions",
      });
    }
  },

  fetchAllPredictions: async (forceRefresh: boolean = false) => {
    if (_fetchBatchAbortController) {
      _fetchBatchAbortController.abort();
    }
    const controller = new AbortController();
    _fetchBatchAbortController = controller;

    set({ isLoading: true, error: null });
    try {
      const fixtures = get().fixtures;
      const existingPredictions = get().predictions;
      
      const fixturesToFetch = forceRefresh 
        ? fixtures 
        : fixtures.filter(f => !existingPredictions[f.id] && !f.homeTeam.startsWith('tbd') && !f.awayTeam.startsWith('tbd'));

      if (fixturesToFetch.length === 0) {
        set({ isLoading: false });
        return;
      }

      const batchPayload = fixturesToFetch.map(f => ({
        fixtureId: f.id,
        homeTeamId: f.homeTeam,
        awayTeamId: f.awayTeam,
        stage: f.stage
      }));

      const res = await fetch("/api/worldcup/predict-batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fixtures: batchPayload }),
        signal: controller.signal,
      });

      if (!res.ok) throw new Error("Failed to fetch batch predictions");
      const data = await res.json();

      if (!controller.signal.aborted && data.success) {
        const newPredictions: Record<string, WorldCupPrediction> = forceRefresh 
          ? {} 
          : { ...existingPredictions };
        
        for (const result of data.results) {
          if (result.fixtureId && !result.error) {
            newPredictions[result.fixtureId] = {
              homeWinProb: result.homeWinProb,
              drawProb: result.drawProb,
              awayWinProb: result.awayWinProb,
              homeExpectedGoals: result.homeExpectedGoals,
              awayExpectedGoals: result.awayExpectedGoals,
              predictedScore: result.predictedScore,
              dataSource: result.dataSource
            };
          }
        }

        set({
          predictions: newPredictions,
          isLoading: false,
          lastPredictionUpdate: new Date().toISOString()
        });
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      set({
        isLoading: false,
        error: err instanceof Error ? err.message : "Unknown error fetching predictions",
      });
    } finally {
      if (_fetchBatchAbortController === controller) {
        _fetchBatchAbortController = null;
      }
    }
  },

  fetchGroupStage: async () => {
    if (_fetchGroupAbortController) {
      _fetchGroupAbortController.abort();
    }
    const controller = new AbortController();
    _fetchGroupAbortController = controller;

    set({ isLoading: true, error: null });
    try {
      const res = await fetch("/api/worldcup/group-stage", {
        signal: controller.signal,
      });
      if (!res.ok) throw new Error("Failed to fetch group stage probabilities");
      const data = await res.json();
      if (!controller.signal.aborted) {
        set({ groupAdvanceProbs: data.results || [], isLoading: false });
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      set({
        isLoading: false,
        error: err instanceof Error ? err.message : "Unknown error fetching group stage",
      });
    } finally {
      if (_fetchGroupAbortController === controller) {
        _fetchGroupAbortController = null;
      }
    }
  },

  clearPredictions: () => set({ 
    predictions: {}, 
    lastPredictionUpdate: null 
  }),

  setLoading: (loading: boolean) => set({ isLoading: loading }),

  reset: () => set({ ...initialState }),
}));
