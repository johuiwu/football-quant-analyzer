import { query, get } from '../dbService.js';
import cache from './cacheService.js';

function getCacheKey(featureName, teamId, matches = 10) {
  return `${featureName}_${teamId}_${matches}`;
}

async function getTeamMatches(teamId, matchCount = 10) {
  const sql = `
    SELECT 
      m.*,
      CASE WHEN m.home_team_id = ? THEN m.home_score ELSE m.away_score END as goalsFor,
      CASE WHEN m.home_team_id = ? THEN m.away_score ELSE m.home_score END as goalsAgainst,
      CASE WHEN m.home_team_id = ? THEN 'home' ELSE 'away' END as venue,
      CASE 
        WHEN (m.home_team_id = ? AND m.home_score > m.away_score) THEN 'win'
        WHEN (m.away_team_id = ? AND m.away_score > m.home_score) THEN 'win'
        WHEN m.home_score = m.away_score THEN 'draw'
        ELSE 'loss'
      END as result
    FROM matches m
    WHERE m.home_team_id = ? OR m.away_team_id = ?
    ORDER BY m.match_date DESC
    LIMIT ?
  `;
  return await query(sql, [teamId, teamId, teamId, teamId, teamId, teamId, teamId, matchCount]);
}

export async function getRecentWinRate(teamId, matches = 10) {
  const cacheKey = getCacheKey('winRate', teamId, matches);
  const cached = cache.getCachedFeature(teamId, 'winRate');
  if (cached !== null && cached !== undefined) return cached;

  const teamMatches = await getTeamMatches(teamId, matches);
  if (teamMatches.length === 0) {
    cache.cacheFeature(teamId, 'winRate', 0);
    return 0;
  }

  const wins = teamMatches.filter(m => m.result === 'win').length;
  const winRate = wins / teamMatches.length;
  
  cache.cacheFeature(teamId, 'winRate', winRate);
  return winRate;
}

export async function getAvgGoalsFor(teamId, matches = 10) {
  const cacheKey = getCacheKey('avgGoalsFor', teamId, matches);
  const cached = cache.getCachedFeature(teamId, 'avgGoalsFor');
  if (cached !== null && cached !== undefined) return cached;

  const teamMatches = await getTeamMatches(teamId, matches);
  if (teamMatches.length === 0) {
    cache.cacheFeature(teamId, 'avgGoalsFor', 0);
    return 0;
  }

  const totalGoals = teamMatches.reduce((sum, m) => sum + m.goalsFor, 0);
  const avgGoalsFor = totalGoals / teamMatches.length;
  
  cache.cacheFeature(teamId, 'avgGoalsFor', avgGoalsFor);
  return avgGoalsFor;
}

export async function getAvgGoalsAgainst(teamId, matches = 10) {
  const cacheKey = getCacheKey('avgGoalsAgainst', teamId, matches);
  const cached = cache.getCachedFeature(teamId, 'avgGoalsAgainst');
  if (cached !== null && cached !== undefined) return cached;

  const teamMatches = await getTeamMatches(teamId, matches);
  if (teamMatches.length === 0) {
    cache.cacheFeature(teamId, 'avgGoalsAgainst', 0);
    return 0;
  }

  const totalGoals = teamMatches.reduce((sum, m) => sum + m.goalsAgainst, 0);
  const avgGoalsAgainst = totalGoals / teamMatches.length;
  
  cache.cacheFeature(teamId, 'avgGoalsAgainst', avgGoalsAgainst);
  return avgGoalsAgainst;
}

export async function getGoalDifference(teamId, matches = 10) {
  const cacheKey = getCacheKey('goalDifference', teamId, matches);
  const cached = cache.getCachedFeature(teamId, 'goalDifference');
  if (cached !== null && cached !== undefined) return cached;

  const avgGF = await getAvgGoalsFor(teamId, matches);
  const avgGA = await getAvgGoalsAgainst(teamId, matches);
  const goalDifference = avgGF - avgGA;
  
  cache.cacheFeature(teamId, 'goalDifference', goalDifference);
  return goalDifference;
}

export async function getAvgXG(teamId, matches = 10) {
  const cacheKey = getCacheKey('xG_per_match', teamId, matches);
  const cached = cache.getCachedFeature(teamId, 'xG_per_match');
  if (cached !== null && cached !== undefined) return cached;

  const avgGF = await getAvgGoalsFor(teamId, matches);
  const xG_per_match = avgGF * 1.05;
  
  cache.cacheFeature(teamId, 'xG_per_match', xG_per_match);
  return xG_per_match;
}

export async function getShotConversionRate(teamId, matches = 10) {
  const cacheKey = getCacheKey('shotConversionRate', teamId, matches);
  const cached = cache.getCachedFeature(teamId, 'shotConversionRate');
  if (cached !== null && cached !== undefined) return cached;

  const avgGF = await getAvgGoalsFor(teamId, matches);
  const shotConversionRate = avgGF > 0 ? Math.min(0.25, avgGF / 10) : 0.1;
  
  cache.cacheFeature(teamId, 'shotConversionRate', shotConversionRate);
  return shotConversionRate;
}

export async function getOpponentXGLimit(teamId, matches = 10) {
  const cacheKey = getCacheKey('opponentXGLimit', teamId, matches);
  const cached = cache.getCachedFeature(teamId, 'opponentXGLimit');
  if (cached !== null && cached !== undefined) return cached;

  const avgGA = await getAvgGoalsAgainst(teamId, matches);
  const opponentXGLimit = Math.max(0.5, 1 - (avgGA / 2));
  
  cache.cacheFeature(teamId, 'opponentXGLimit', opponentXGLimit);
  return opponentXGLimit;
}

export async function getSaveRate(teamId, matches = 10) {
  const cacheKey = getCacheKey('saveRate', teamId, matches);
  const cached = cache.getCachedFeature(teamId, 'saveRate');
  if (cached !== null && cached !== undefined) return cached;

  const avgGA = await getAvgGoalsAgainst(teamId, matches);
  const saveRate = Math.max(0.5, Math.min(0.9, 1 - (avgGA / 5)));
  
  cache.cacheFeature(teamId, 'saveRate', saveRate);
  return saveRate;
}

export async function getKeyPassesPerMatch(teamId, matches = 10) {
  const cacheKey = getCacheKey('keyPasses', teamId, matches);
  const cached = cache.getCachedFeature(teamId, 'keyPasses');
  if (cached !== null && cached !== undefined) return cached;

  const avgGF = await getAvgGoalsFor(teamId, matches);
  const keyPasses = avgGF * 3;
  
  cache.cacheFeature(teamId, 'keyPasses', keyPasses);
  return keyPasses;
}

export async function getProgressivePassSuccess(teamId, matches = 10) {
  const cacheKey = getCacheKey('progressivePassSuccess', teamId, matches);
  const cached = cache.getCachedFeature(teamId, 'progressivePassSuccess');
  if (cached !== null && cached !== undefined) return cached;

  const avgGF = await getAvgGoalsFor(teamId, matches);
  const progressivePassSuccess = 0.7 + (avgGF / 10);
  
  cache.cacheFeature(teamId, 'progressivePassSuccess', progressivePassSuccess);
  return progressivePassSuccess;
}

export async function getPPDA(teamId, matches = 10) {
  const cacheKey = getCacheKey('ppda', teamId, matches);
  const cached = cache.getCachedFeature(teamId, 'ppda');
  if (cached !== null && cached !== undefined) return cached;

  const avgGA = await getAvgGoalsAgainst(teamId, matches);
  const ppda = 8 + (avgGA * 2);
  
  cache.cacheFeature(teamId, 'ppda', ppda);
  return ppda;
}

export async function getRecoveriesInFinalThird(teamId, matches = 10) {
  const cacheKey = getCacheKey('recoveriesFinalThird', teamId, matches);
  const cached = cache.getCachedFeature(teamId, 'recoveriesFinalThird');
  if (cached !== null && cached !== undefined) return cached;

  const winRate = await getRecentWinRate(teamId, matches);
  const recoveriesFinalThird = 5 + (winRate * 10);
  
  cache.cacheFeature(teamId, 'recoveriesFinalThird', recoveriesFinalThird);
  return recoveriesFinalThird;
}

export async function getAverageExperience(teamId) {
  const cacheKey = getCacheKey('avgExperience', teamId);
  const cached = cache.getCachedFeature(teamId, 'avgExperience');
  if (cached !== null && cached !== undefined) return cached;

  const sql = `
    SELECT 
      COUNT(p.id) as playerCount
    FROM players p
    WHERE p.team_id = ?
  `;
  
  const result = await get(sql, [teamId]);
  const avgExperience = result ? (result.playerCount > 0 ? 900 : 0) : 0;
  
  cache.cacheFeature(teamId, 'avgExperience', avgExperience);
  return avgExperience;
}

export async function getPositionDiversity(teamId) {
  const cacheKey = getCacheKey('positionDiversity', teamId);
  const cached = cache.getCachedFeature(teamId, 'positionDiversity');
  if (cached !== null && cached !== undefined) return cached;

  const sql = `
    SELECT 
      COUNT(DISTINCT pp.position) as uniquePositions,
      COUNT(DISTINCT p.id) as playerCount
    FROM players p
    LEFT JOIN player_positions pp ON p.id = pp.player_id
    WHERE p.team_id = ?
  `;
  
  const result = await get(sql, [teamId]);
  if (!result || result.playerCount === 0) {
    cache.cacheFeature(teamId, 'positionDiversity', 0.7);
    return 0.7;
  }
  
  const positionDiversity = Math.min(1, result.uniquePositions / 5);
  
  cache.cacheFeature(teamId, 'positionDiversity', positionDiversity);
  return positionDiversity;
}

export async function getDisciplineIndex(teamId) {
  const cacheKey = getCacheKey('disciplineIndex', teamId);
  const cached = cache.getCachedFeature(teamId, 'disciplineIndex');
  if (cached !== null && cached !== undefined) return cached;

  // 拆分为两个独立查询，避免 player_cards × matches 笛卡尔积导致 totalCards 被放大
  const cardsSql = `
    SELECT COUNT(pc.id) as totalCards
    FROM players p
    JOIN player_cards pc ON p.id = pc.player_id
    WHERE p.team_id = ?
  `;
  const matchesSql = `
    SELECT COUNT(DISTINCT m.id) as matchCount
    FROM matches m
    WHERE m.home_team_id = ? OR m.away_team_id = ?
  `;

  const [cardsResult, matchesResult] = await Promise.all([
    get(cardsSql, [teamId]),
    get(matchesSql, [teamId, teamId]),
  ]);

  const totalCards = cardsResult?.totalCards ?? 0;
  const matchCount = matchesResult?.matchCount ?? 0;

  const disciplineIndex = matchCount > 0 ? totalCards / matchCount : 0.5;

  cache.cacheFeature(teamId, 'disciplineIndex', disciplineIndex);
  return disciplineIndex;
}

export async function getSquadDepthScore(teamId) {
  const cacheKey = getCacheKey('squadDepth', teamId);
  const cached = cache.getCachedFeature(teamId, 'squadDepth');
  if (cached !== null && cached !== undefined) return cached;

  const sql = `
    SELECT COUNT(DISTINCT id) as playerCount
    FROM players
    WHERE team_id = ?
  `;
  
  const result = await get(sql, [teamId]);
  const squadDepth = result ? Math.min(1, result.playerCount / 20) : 0.5;
  
  cache.cacheFeature(teamId, 'squadDepth', squadDepth);
  return squadDepth;
}

export async function buildFeatureVector(teamId, options = { matches: 10 }) {
  const { matches = 10 } = options;
  
  const [
    winRate,
    avgGoalsFor,
    avgGoalsAgainst,
    goalDifference,
    xG_per_match,
    shotConversionRate,
    opponentXGLimit,
    saveRate,
    keyPasses,
    progressivePassSuccess,
    ppda,
    recoveriesFinalThird,
    avgExperience,
    positionDiversity,
    disciplineIndex,
    squadDepth
  ] = await Promise.all([
    getRecentWinRate(teamId, matches),
    getAvgGoalsFor(teamId, matches),
    getAvgGoalsAgainst(teamId, matches),
    getGoalDifference(teamId, matches),
    getAvgXG(teamId, matches),
    getShotConversionRate(teamId, matches),
    getOpponentXGLimit(teamId, matches),
    getSaveRate(teamId, matches),
    getKeyPassesPerMatch(teamId, matches),
    getProgressivePassSuccess(teamId, matches),
    getPPDA(teamId, matches),
    getRecoveriesInFinalThird(teamId, matches),
    getAverageExperience(teamId),
    getPositionDiversity(teamId),
    getDisciplineIndex(teamId),
    getSquadDepthScore(teamId)
  ]);

  return {
    teamId,
    winRate,
    avgGoalsFor,
    avgGoalsAgainst,
    goalDifference,
    xG_per_match,
    shotConversionRate,
    opponentXGLimit,
    saveRate,
    keyPasses,
    progressivePassSuccess,
    ppda,
    recoveriesFinalThird,
    avgExperience,
    positionDiversity,
    disciplineIndex,
    squadDepth
  };
}

export async function buildAllTeamsFeatureVectors(matches = 10) {
  const sql = 'SELECT id, name FROM teams ORDER BY name';
  const teams = await query(sql);
  
  const vectors = await Promise.all(
    teams.map(team => buildFeatureVector(team.id, { matches }))
  );
  
  return vectors;
}
