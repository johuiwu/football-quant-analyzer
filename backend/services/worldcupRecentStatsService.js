const STAGE_FACTORS = {
  group: 1.0,
  round_of_32: 0.95,
  round_of_16: 0.92,
  quarter: 0.88,
  semi: 0.85,
  final: 0.80
};

function avg(arr) {
  if (!arr || arr.length === 0) return null;
  return arr.reduce((s, v) => s + v, 0) / arr.length;
}

function parseNum(v) {
  if (v === null || v === undefined) return null;
  const n = typeof v === 'string' ? parseFloat(v) : v;
  return isNaN(n) ? null : n;
}

export function calculateXgExpectedGoals(homeRecentStats, awayRecentStats, stage) {
  const stageFactor = STAGE_FACTORS[stage] || 1.0;

  const homeXgList = (homeRecentStats || []).map(m => parseNum(m.xg)).filter(v => v !== null);
  const awayXgList = (awayRecentStats || []).map(m => parseNum(m.xg)).filter(v => v !== null);
  const homeXgAgainstList = (homeRecentStats || []).map(m => parseNum(m.xga)).filter(v => v !== null);
  const awayXgAgainstList = (awayRecentStats || []).map(m => parseNum(m.xga)).filter(v => v !== null);

  const homeAvgXgFor = avg(homeXgList);
  const awayAvgXgFor = avg(awayXgList);
  const homeAvgXgAgainst = avg(homeXgAgainstList);
  const awayAvgXgAgainst = avg(awayXgAgainstList);

  if (homeAvgXgFor !== null && awayAvgXgFor !== null) {
    const lambdaHome = ((homeAvgXgFor + awayAvgXgAgainst) / 2) * stageFactor;
    const lambdaAway = ((awayAvgXgFor + homeAvgXgAgainst) / 2) * stageFactor;
    return { homeExpectedGoals: lambdaHome, awayExpectedGoals: lambdaAway, source: 'xg' };
  }

  return { homeExpectedGoals: null, awayExpectedGoals: null, source: 'none' };
}

import { getTeamStats } from '../../src/data/worldcup_team_stats.js';

export function getFallbackExpectedGoals(homeTeamId, awayTeamId, stage) {
  const stageFactor = STAGE_FACTORS[stage] || 1.0;
  const home = getTeamStats(homeTeamId);
  const away = getTeamStats(awayTeamId);
  const homeX = home.avgXgFor || 1.0;
  const homeXA = home.avgXgAgainst || 1.0;
  const awayX = away.avgXgFor || 1.0;
  const awayXA = away.avgXgAgainst || 1.0;
  const lambdaHome = ((homeX + awayXA) / 2) * stageFactor;
  const lambdaAway = ((awayX + homeXA) / 2) * stageFactor;
  return {
    homeStats: { xG: homeX, xGA: homeXA, winRate: home.winRate || 0.5 },
    awayStats: { xG: awayX, xGA: awayXA, winRate: away.winRate || 0.5 },
    homeExpectedGoals: lambdaHome,
    awayExpectedGoals: lambdaAway,
    source: 'fallback'
  };
}
