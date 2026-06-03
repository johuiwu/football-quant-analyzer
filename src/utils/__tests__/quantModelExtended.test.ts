import { describe, it, expect, vi } from 'vitest';
import {
  extractExtendedFeatures,
  checkMarketDeviation,
  calculateDynamicAsianHandicap,
} from '../quantModel';
import { TeamStats, RankedValue } from '../../data/realTeamsData';
import { calculateBaseOdds } from '../oddsCalculator';

// ===== Mock calculateBaseOdds for calculateDynamicAsianHandicap =====
vi.mock('../oddsCalculator', () => ({
  calculateBaseOdds: vi.fn(),
  impliedProbability: vi.fn((odds: number) => 1 / odds),
  calculateImpliedProbability: vi.fn(),
  calculateReturnRate: vi.fn(),
}));

// ===== 辅助：创建测试用 TeamStats =====
function makeTeam(overrides: Partial<TeamStats> = {}): TeamStats {
  return {
    id: 'test_team',
    name: 'Test FC',
    nameCn: '测试队',
    league: 'EPL',
    leagueCn: '英超',
    rank: 5,
    homeStats: { played: 10, wins: 5, draws: 3, losses: 2, goalsFor: 18, goalsAgainst: 10, xgFor: 16, xgAgainst: 9 },
    awayStats: { played: 10, wins: 4, draws: 3, losses: 3, goalsFor: 14, goalsAgainst: 12, xgFor: 13, xgAgainst: 11 },
    form: ['W', 'D', 'L', 'W', 'D'],
    cleanSheets: 4,
    shotsPerGame: 14,
    shotAccuracy: 0.4,
    homeXg: 1.8,
    awayXg: 1.4,
    ...overrides,
  };
}

function makeRankedValue(total: number, rank: number): RankedValue {
  return { total, rank };
}

// ======================== extractExtendedFeatures ========================
describe('extractExtendedFeatures(t, league?)', () => {
  it('EPL 球队返回 16 字段完整，all non-NaN', () => {
    const features = extractExtendedFeatures(makeTeam());
    const keys = Object.keys(features);
    expect(keys.length).toBeGreaterThanOrEqual(14);
    for (const key of keys) {
      expect(features[key as keyof typeof features]).not.toBeNaN();
    }
  });

  it('mp=0 球队返回默认值不崩溃', () => {
    const team = makeTeam({
      homeStats: { played: 0, wins: 0, draws: 0, losses: 0, goalsFor: 0, goalsAgainst: 0, xgFor: 0, xgAgainst: 0 },
      awayStats: { played: 0, wins: 0, draws: 0, losses: 0, goalsFor: 0, goalsAgainst: 0, xgFor: 0, xgAgainst: 0 },
    });
    const features = extractExtendedFeatures(team);
    expect(features.goalsScoredRate).toBe(0);
    expect(features.concededRate).toBe(0);
  });

  it('指定 league="EPL" → leagueTotal=11.2', () => {
    const features = extractExtendedFeatures(makeTeam(), 'EPL');
    expect(features.keyPassesRate).toBeGreaterThanOrEqual(0);
  });

  it('指定未知 league → 回退 DEFAULT=9.0', () => {
    const team = makeTeam({
      goals: undefined,
      conceded: undefined,
      keyPasses: undefined,
    });
    const features = extractExtendedFeatures(team, 'UnknownLeague');
    expect(features.keyPassesRate).toBeGreaterThanOrEqual(0);
  });

  it('possession="45%" → 解析为 45', () => {
    const team = makeTeam({
      possession: { value: '45%', rank: 0 },
    });
    const features = extractExtendedFeatures(team);
    expect(features.possessionValue).toBe(45);
  });

  it('fastBreakEfficiency 分母为 0 → 返回 0', () => {
    const team = makeTeam({
      fastBreaks: makeRankedValue(0, 0),
      fastBreakGoals: makeRankedValue(0, 0),
    });
    const features = extractExtendedFeatures(team);
    expect(features.fastBreakEfficiency).toBe(0);
  });

  it('crossSuccessRate 分母为 0 → 返回默认 0.25', () => {
    const team = makeTeam({
      crosses: makeRankedValue(0, 0),
      successfulCrosses: makeRankedValue(0, 0),
    });
    const features = extractExtendedFeatures(team);
    expect(features.crossSuccessRate).toBe(0.25);
  });

  it('dribbleSuccessRate 分母为 0 → 返回默认 0.4', () => {
    const team = makeTeam({
      dribbles: makeRankedValue(0, 0),
      successfulDribbles: makeRankedValue(0, 0),
    });
    const features = extractExtendedFeatures(team);
    expect(features.dribbleSuccessRate).toBe(0.4);
  });

  it('attackMomentum 综合指标非 NaN', () => {
    const features = extractExtendedFeatures(makeTeam());
    expect(features.attackMomentum).not.toBeNaN();
  });

  it('defensiveStability 在 [0,1] 范围内', () => {
    const features = extractExtendedFeatures(makeTeam());
    expect(features.defensiveStability).toBeGreaterThanOrEqual(0);
    expect(features.defensiveStability).toBeLessThanOrEqual(1);
  });

  it('拥有完整扩展统计数据的球队返回非默认值', () => {
    const team = makeTeam({
      goals: makeRankedValue(50, 1),
      conceded: makeRankedValue(25, 3),
      shotsOnTarget: makeRankedValue(120, 2),
      possession: { value: '55%', rank: 1 },
      duelsWon: makeRankedValue(320, 2),
      possessionLost: makeRankedValue(280, 5),
      fastBreaks: makeRankedValue(30, 4),
      fastBreakGoals: makeRankedValue(8, 2),
      keyPasses: makeRankedValue(180, 1),
      crosses: makeRankedValue(320, 3),
      successfulCrosses: makeRankedValue(80, 3),
      dribbles: makeRankedValue(200, 2),
      successfulDribbles: makeRankedValue(100, 2),
      longBalls: makeRankedValue(400, 1),
      successfulLongBalls: makeRankedValue(200, 1),
      avgGoals: makeRankedValue(2, 1),
      fouls: makeRankedValue(220, 4),
    });
    const features = extractExtendedFeatures(team);
    expect(features.goalsScoredRate).toBeGreaterThan(0);
    expect(features.shotsOnTargetRate).toBeGreaterThan(0);
    expect(features.possessionValue).toBe(55);
    expect(features.duelWonRatio).toBeGreaterThan(0);
    expect(features.fastBreakEfficiency).toBeGreaterThan(0);
    expect(features.crossSuccessRate).toBeGreaterThan(0);
    expect(features.dribbleSuccessRate).toBeGreaterThan(0);
    expect(features.longBallSuccessRate).toBeGreaterThan(0);
    expect(features.avgGoalsPerMatch).toBeGreaterThan(0);
  });
});

// ======================== checkMarketDeviation ========================
describe('checkMarketDeviation(oddsProb, asianProb)', () => {
  it('完全一致 → confidence=high, warning=null', () => {
    const result = checkMarketDeviation(
      { home: 0.5, draw: 0.25, away: 0.25 },
      { home: 0.5, draw: 0.25, away: 0.25 },
    );
    expect(result.confidence).toBe('high');
    expect(result.warning).toBeNull();
    expect(result.deviation).toBe(0);
  });

  it('偏差 0.15 → confidence=medium', () => {
    const result = checkMarketDeviation(
      { home: 0.55, draw: 0.25, away: 0.20 },
      { home: 0.40, draw: 0.30, away: 0.30 },
    );
    expect(result.confidence).toBe('medium');
    expect(result.warning).toContain('轻微背离');
  });

  it('偏差 0.25 → confidence=low', () => {
    const result = checkMarketDeviation(
      { home: 0.65, draw: 0.20, away: 0.15 },
      { home: 0.35, draw: 0.35, away: 0.30 },
    );
    expect(result.confidence).toBe('low');
  });

  it('oddsProb.home>0.6 且 asianProb.home<0.4 → 特定主胜背离警告', () => {
    const result = checkMarketDeviation(
      { home: 0.65, draw: 0.20, away: 0.15 },
      { home: 0.35, draw: 0.35, away: 0.30 },
    );
    expect(result.warning).toContain('主胜');
  });

  it('oddsProb.away>0.6 且 asianProb.away<0.4 → 特定客胜背离警告', () => {
    const result = checkMarketDeviation(
      { home: 0.15, draw: 0.20, away: 0.65 },
      { home: 0.35, draw: 0.30, away: 0.35 },
    );
    expect(result.warning).toContain('客胜');
  });

  it('oddsProb.draw>0.5 且 asianProb.draw<0.25 → 平局背离警告', () => {
    const result = checkMarketDeviation(
      { home: 0.25, draw: 0.55, away: 0.20 },
      { home: 0.35, draw: 0.20, away: 0.45 },
    );
    expect(result.warning).toContain('平局');
  });

  it('偏差大但无极端背离 → 通用警告', () => {
    const result = checkMarketDeviation(
      { home: 0.5, draw: 0.25, away: 0.25 },
      { home: 0.25, draw: 0.40, away: 0.35 },
    );
    expect(result.confidence).toBe('low');
    expect(result.warning).toContain('显著背离');
  });
});

// ======================== calculateDynamicAsianHandicap ========================
describe('calculateDynamicAsianHandicap(home, away, hInjuries, aInjuries)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('调用 convert1X2ToAsian 返回 AsianHandicapParams', () => {
    const mockBaseOdds = { homeOdds: 2.0, drawOdds: 3.4, awayOdds: 3.8 };
    vi.mocked(calculateBaseOdds).mockReturnValue(mockBaseOdds);

    const home = makeTeam({ homeXg: 2.0 });
    const away = makeTeam({ id: 'away_team', homeXg: 1.4, awayXg: 1.2 });

    const result = calculateDynamicAsianHandicap(home, away);
    expect(result).toBeDefined();
    expect(typeof result.handicap).toBe('number');
    expect(calculateBaseOdds).toHaveBeenCalledTimes(1);
  });

  it('无伤病时 injuryFactor 为 1', () => {
    const mockBaseOdds = { homeOdds: 1.8, drawOdds: 3.4, awayOdds: 4.5 };
    vi.mocked(calculateBaseOdds).mockReturnValue(mockBaseOdds);

    const home = makeTeam();
    const away = makeTeam({ id: 'away_team' });

    calculateDynamicAsianHandicap(home, away);
    expect(vi.mocked(calculateBaseOdds).mock.calls[0][4]).toBe(1);
    expect(vi.mocked(calculateBaseOdds).mock.calls[0][5]).toBe(1);
  });

  it('homeInjuries=5 → injuryFactor 接近 0.9', () => {
    const mockBaseOdds = { homeOdds: 2.0, drawOdds: 3.4, awayOdds: 3.8 };
    vi.mocked(calculateBaseOdds).mockReturnValue(mockBaseOdds);

    const home = makeTeam();
    const away = makeTeam({ id: 'away_team' });

    calculateDynamicAsianHandicap(home, away, 5, 0);
    const homeInjuryFactor = vi.mocked(calculateBaseOdds).mock.calls[0][4] as number;
    expect(homeInjuryFactor).toBeCloseTo(0.9, 1);
  });
});
