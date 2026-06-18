import { describe, it, expect } from 'vitest';
import { calculateRealisticXG, computeTeamXG, computeTeamXGSplit, LEAGUE_XG_PER_SHOT } from '../xg';

describe('LEAGUE_XG_PER_SHOT', () => {
  it('EPL xG per shot is 0.11', () => {
    expect(LEAGUE_XG_PER_SHOT.EPL).toBe(0.11);
  });
  it('SerieA lower than Bundesliga (fewer goals)', () => {
    expect(LEAGUE_XG_PER_SHOT.SerieA).toBeLessThan(LEAGUE_XG_PER_SHOT.Bundesliga);
  });
});

describe('calculateRealisticXG', () => {
  it('typical EPL team: 15 shots, 5 on target => ~0.88 xG', () => {
    const result = calculateRealisticXG(15, 5, 'EPL');
    // 5 * 0.11*1.2 + 10 * 0.11*0.2 = 0.66 + 0.22 = 0.88
    expect(result.xg).toBe(0.88);
    expect(result.warning).toBeUndefined();
  });

  it('realXG overrides computation when provided', () => {
    const result = calculateRealisticXG(15, 5, 'EPL', 1.5);
    expect(result.xg).toBe(1.5);
    expect(result.warning).toBeUndefined();
  });

  it('0 shots => 0 xG', () => {
    const result = calculateRealisticXG(0, 0, 'EPL');
    expect(result.xg).toBe(0);
  });

  it('shotsOnTarget > shots 时自动截断并警告', () => {
    const result = calculateRealisticXG(10, 15, 'EPL');
    // shotsOffTarget = 10 - min(15,10) = 0
    // 10 * 0.132 + 0 = 1.32
    expect(result.xg).toBeGreaterThan(0);
    expect(result.warning).toBeDefined();
    expect(result.warning).toContain('已自动截断');
  });

  it('负数输入不崩溃', () => {
    const result = calculateRealisticXG(-5, -2, 'EPL');
    expect(result.xg).toBe(0);
    expect(Number.isFinite(result.xg)).toBe(true);
  });
});

describe('computeTeamXG', () => {
  it('default team (12 shots, 40% accuracy) => ~0.7 xG', () => {
    const xg = computeTeamXG({ shotsPerGame: 12, shotAccuracy: 40, league: 'EPL' });
    expect(xg).toBeGreaterThan(0.5);
    expect(xg).toBeLessThan(1.0);
  });

  it('high-volume team => higher xG', () => {
    const low = computeTeamXG({ shotsPerGame: 10, shotAccuracy: 30, league: 'EPL' });
    const high = computeTeamXG({ shotsPerGame: 18, shotAccuracy: 50, league: 'EPL' });
    expect(high).toBeGreaterThan(low);
  });
});

describe('computeTeamXGSplit', () => {
  const team = {
    homeStats: { played: 19, goalsFor: 30, goalsAgainst: 10 },
    awayStats: { played: 19, goalsFor: 20, goalsAgainst: 15 },
    shotsPerGame: 14,
    shotAccuracy: 42,
    league: 'EPL',
  };

  it('home xgFor > away xgFor', () => {
    const home = computeTeamXGSplit(team, true);
    const away = computeTeamXGSplit(team, false);
    expect(home.xgFor).toBeGreaterThan(away.xgFor);
  });

  it('returns positive values', () => {
    const result = computeTeamXGSplit(team, true);
    expect(result.xgFor).toBeGreaterThan(0);
    expect(result.xgAgainst).toBeGreaterThan(0);
  });

  it('xgAgainst 不超过上限（被截断到 3× 联赛均值的 0.9）', () => {
    const leakyTeam = {
      homeStats: { played: 1, goalsFor: 1, goalsAgainst: 20 },
      awayStats: { played: 1, goalsFor: 1, goalsAgainst: 20 },
      shotsPerGame: 10,
      shotAccuracy: 30,
      league: 'EPL',
    };
    const result = computeTeamXGSplit(leakyTeam, false);
    // leagueAvg/2 * min(oppQual, 3.0) * 0.9
    // EPL avg = 2.85, /2 = 1.425, *3*0.9 = 3.8475
    expect(result.xgAgainst).toBeLessThan(5);
    expect(result.xgAgainst).toBeGreaterThan(0);
  });
});