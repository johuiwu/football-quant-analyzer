import { query, get, run } from '../dbService.js';
import { buildFeatureVector } from './featureService.js';

const defaultWeights = {
  offense: 0.3,
  defense: 0.25,
  teamwork: 0.2,
  elo: 0.15,
  squadDepth: 0.1
};

export function getInitialElo(teamId, fifaRank = null) {
  if (fifaRank !== null) {
    return Math.round(1500 + (32 - Math.max(1, Math.min(211, fifaRank))) * 8);
  }
  return 1500;
}

export function updateElo(teamARating, teamBRating, scoreA, scoreB, kFactor = 20) {
  const expectedScoreA = 1 / (1 + Math.pow(10, (teamBRating - teamARating) / 400));
  const expectedScoreB = 1 - expectedScoreA;
  
  const actualScoreA = scoreA > scoreB ? 1 : (scoreA === scoreB ? 0.5 : 0);
  const actualScoreB = 1 - actualScoreA;
  
  const scoreDiff = Math.abs(scoreA - scoreB);
  const multiplier = scoreDiff > 2 ? 1.5 : (scoreDiff > 0 ? 1.2 : 1);
  
  const newRatingA = Math.round(teamARating + kFactor * multiplier * (actualScoreA - expectedScoreA));
  const newRatingB = Math.round(teamBRating + kFactor * multiplier * (actualScoreB - expectedScoreB));
  
  return {
    newRatingA,
    newRatingB
  };
}

export async function historicalWeightedScore(teamId, weights = {
  recentWinRate: 0.3,
  goalDifference: 0.25,
  opponentStrength: 0.25,
  tournamentPerformance: 0.2
}) {
  const features = await buildFeatureVector(teamId, { matches: 20 });
  
  let score = 0;
  
  score += features.winRate * weights.recentWinRate;
  score += Math.max(0, Math.min(1, (features.goalDifference + 2) / 4)) * weights.goalDifference;
  score += (1 - Math.max(0, Math.min(1, features.opponentXGLimit / 1.5))) * weights.opponentStrength;
  score += Math.max(0, Math.min(1, features.goalDifference)) * weights.tournamentPerformance;
  
  return Math.max(0, Math.min(1, score));
}

export async function fourDimensionAbility(teamId) {
  const features = await buildFeatureVector(teamId);
  
  const normalize = (value, min, max) => {
    return Math.max(0, Math.min(1, (value - min) / (max - min)));
  };
  
  const offense = 0.6 * normalize(features.xG_per_match, 0.5, 3) + 0.4 * features.shotConversionRate;
  const defense = 0.6 * features.opponentXGLimit + 0.4 * features.saveRate;
  const teamwork = 0.5 * normalize(features.keyPasses, 2, 10) + 0.5 * features.progressivePassSuccess;
  const pressure = 0.5 * normalize(features.ppda, 12, 7) + 0.5 * normalize(features.recoveriesFinalThird, 3, 15);
  
  return {
    offense,
    defense,
    teamwork,
    pressure
  };
}

export async function squadPotentialScore(teamId) {
  const features = await buildFeatureVector(teamId);
  
  let score = 0;
  
  score += features.squadDepth * 0.4;
  score += features.positionDiversity * 0.3;
  score += Math.max(0, Math.min(1, 1 - features.disciplineIndex / 5)) * 0.3;
  
  return Math.max(0, Math.min(1, score));
}

export async function getTeamElo(teamId) {
  const sql = 'SELECT elo_rating FROM teams WHERE id = ?';
  const team = await get(sql, [teamId]);
  
  if (team && team.elo_rating) {
    return team.elo_rating;
  }
  
  return getInitialElo(teamId);
}

export async function teamStrengthVector(teamId, weights = defaultWeights) {
  const features = await buildFeatureVector(teamId);
  const fourDim = await fourDimensionAbility(teamId);
  const elo = await getTeamElo(teamId);
  const squadPotential = await squadPotentialScore(teamId);
  
  const offenseIndex = fourDim.offense;
  const defenseIndex = fourDim.defense;
  const teamworkScore = fourDim.teamwork;
  const squadDepth = squadPotential;
  
  const normalizedElo = Math.max(0, Math.min(1, (elo - 1000) / 1000));
  
  const overall = (
    offenseIndex * weights.offense +
    defenseIndex * weights.defense +
    teamworkScore * weights.teamwork +
    normalizedElo * weights.elo +
    squadDepth * weights.squadDepth
  );
  
  return {
    teamId,
    offense_index: offenseIndex,
    defense_index: defenseIndex,
    teamwork_score: teamworkScore,
    elo,
    squad_depth: squadDepth,
    overall
  };
}

export async function saveTeamStrengthVector(teamId, vector) {
  const sql = `
    INSERT OR REPLACE INTO team_strength_vectors 
    (team_id, offense_index, defense_index, teamwork_score, elo, squad_depth, overall, version)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `;
  
  await run(sql, [
    teamId,
    vector.offense_index,
    vector.defense_index,
    vector.teamwork_score,
    vector.elo,
    vector.squad_depth,
    vector.overall,
    '1.0'
  ]);
}

export async function getTeamStrengthVector(teamId) {
  const sql = 'SELECT * FROM team_strength_vectors WHERE team_id = ?';
  const vector = await get(sql, [teamId]);
  
  if (vector) {
    return vector;
  }
  
  const computedVector = await teamStrengthVector(teamId);
  await saveTeamStrengthVector(teamId, computedVector);
  
  return computedVector;
}

export async function getAllTeamStrengthVectors() {
  const sql = `
    SELECT tsv.*, t.name, t.chinese_name 
    FROM team_strength_vectors tsv 
    JOIN teams t ON tsv.team_id = t.id 
    ORDER BY tsv.overall DESC
  `;
  
  return await query(sql);
}

export async function computeAndSaveAllTeamStrengthVectors() {
  const teamsSql = 'SELECT id, name, fifa_rank FROM teams';
  const teams = await query(teamsSql);
  
  const results = [];
  
  for (const team of teams) {
    const vector = await teamStrengthVector(team.id);
    await saveTeamStrengthVector(team.id, vector);
    results.push({ team, vector });
  }
  
  return results;
}
