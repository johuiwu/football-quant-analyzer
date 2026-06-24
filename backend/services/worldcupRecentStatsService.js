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

import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const TEAM_STATS_MAP = require('../../src/data/worldcup_team_stats.json');

function getTeamStatsFromTs(teamId) {
  return TEAM_STATS_MAP[teamId] || {
    avgXgFor: 1.2, avgXgAgainst: 1.3, avgPossession: 48,
    avgShots: 9.0, avgShotsOnTarget: 3.5,
    avgGoalsFor: 1.2, avgGoalsAgainst: 1.3,
    avgCorners: 3.5, winRate: 0.40
  };
}

const TEAM_STATS_FILE = path.resolve(process.cwd(), 'src', 'data', 'worldcup_team_stats.json');

function getTeamStatsFromFile(teamId) {
  try {
    if (!fs.existsSync(TEAM_STATS_FILE)) return null;
    const content = fs.readFileSync(TEAM_STATS_FILE, 'utf-8');
    const stats = JSON.parse(content);
    return stats[teamId] || null;
  } catch {
    return null;
  }
}

export function getFallbackExpectedGoals(homeTeamId, awayTeamId, stage) {
  const stageFactor = STAGE_FACTORS[stage] || 1.0;
  const home = getTeamStatsFromFile(homeTeamId) || getTeamStatsFromTs(homeTeamId);
  const away = getTeamStatsFromFile(awayTeamId) || getTeamStatsFromTs(awayTeamId);
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
