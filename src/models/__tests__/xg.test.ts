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
    const xg = calculateRealisticXG(15, 5, 'EPL');
    // 5 * 0.11*1.2 + 10 * 0.11*0.2 = 0.66 + 0.22 = 0.88
    expect(xg).toBe(0.88);
  });

  it('realXG overrides computation when provided', () => {
    const xg = calculateRealisticXG(15, 5, 'EPL', 1.5);
    expect(xg).toBe(1.5);
  });

  it('0 shots => 0 xG', () => {
    const xg = calculateRealisticXG(0, 0, 'EPL');
    expect(xg).toBe(0);
  });

  it('shotsOnTarget cannot exceed shots', () => {
    const xg = calculateRealisticXG(10, 15, 'EPL');
    // shotsOffTarget = max(0, 10-15) = 0
    // 15 * 0.132 + 0 = 1.98
    expect(xg).toBeGreaterThan(0);
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

  it('home xGFor > away xGFor', () => {
    const home = computeTeamXGSplit(team, true);
    const away = computeTeamXGSplit(team, false);
    expect(home.xgFor).toBeGreaterThan(away.xgFor);
  });

  it('returns positive values', () => {
    const result = computeTeamXGSplit(team, true);
    expect(result.xgFor).toBeGreaterThan(0);
    expect(result.xgAgainst).toBeGreaterThan(0);
  });
});