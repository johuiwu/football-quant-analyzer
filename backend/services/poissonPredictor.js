import { query, get, run } from '../dbService.js';
import { getTeamStrengthVector } from './strengthService.js';

const BASE_LAMBDA = 1.2;
const MAX_GOALS = 5;
const DEFAULT_RHO = 0.2;

/**
 * Dixon-Coles 修正因子 τ(i, j)
 * 仅对低比分 (0-0, 0-1, 1-0, 1-1) 进行修正，其余返回 1
 */
export function dixonColesAdjustment(i, j, lambdaA, lambdaB, rho = DEFAULT_RHO) {
  if (i === 0 && j === 0) return 1 - lambdaA * lambdaB * rho;
  if (i === 0 && j === 1) return 1 + lambdaA * rho;
  if (i === 1 && j === 0) return 1 + lambdaB * rho;
  if (i === 1 && j === 1) return 1 - rho;
  return 1;
}

// 联赛 BASE_LAMBDA 缓存：key=leagueName, value={lambda, timestamp}
const leagueLambdaCache = new Map();
const LEAGUE_LAMBDA_CACHE_TTL = 5 * 60 * 1000; // 5分钟

/**
 * 从 matches 表查询联赛历史场均进球，作为该联赛的 BASE_LAMBDA
 * @param {string} leagueName - 联赛名称
 * @returns {Promise<number>} 场均进球（保留1位小数），无数据时返回默认值 BASE_LAMBDA(1.2)
 */
export async function getLeagueBaseLambda(leagueName) {
  if (!leagueName) return BASE_LAMBDA;

  // 检查缓存
  const cached = leagueLambdaCache.get(leagueName);
  if (cached && (Date.now() - cached.timestamp) < LEAGUE_LAMBDA_CACHE_TTL) {
    return cached.lambda;
  }

  try {
    const row = await get(`
      SELECT AVG(home_score + away_score) as avg_goals
      FROM matches
      WHERE league = ? AND home_score IS NOT NULL AND away_score IS NOT NULL
      ORDER BY match_date DESC LIMIT 100
    `, [leagueName]);

    const lambda = row?.avg_goals ? Math.round(row.avg_goals * 10) / 10 : BASE_LAMBDA;

    // 写入缓存
    leagueLambdaCache.set(leagueName, { lambda, timestamp: Date.now() });
    return lambda;
  } catch (err) {
    console.error(`[getLeagueBaseLambda] 查询失败 (${leagueName}):`, err.message);
    return BASE_LAMBDA;
  }
}

export function poissonProbability(k, lambda) {
  if (lambda <= 0) {
    return k === 0 ? 1.0 : 0.0;
  }
  const logFactorial = (n) => {
    let result = 0;
    for (let i = 2; i <= n; i++) {
      result += Math.log(i);
    }
    return result;
  };
  
  return Math.exp(-lambda + k * Math.log(lambda) - logFactorial(k));
}

export function poissonRandom(lambda) {
  if (lambda <= 0) {
    return 0;
  }
  
  const L = Math.exp(-lambda);
  let k = 0;
  let p = 1;
  
  do {
    k++;
    p *= Math.random();
  } while (p > L);
  
  return k - 1;
}

export async function calculateExpectedGoals(teamStrength, opponentStrength, isNeutral = true, stage = 'group', leagueName = '') {
  const homeAdvantage = isNeutral ? 0 : 0.3;
  const stageFactor = stage === 'knockout' ? 0.9 : 1.0;
  
  const baseLambda = leagueName 
    ? await getLeagueBaseLambda(leagueName) 
    : BASE_LAMBDA;
  
  const lambdaA = baseLambda * 
    (teamStrength.offense_index / 0.5) * 
    (1 / (opponentStrength.defense_index + 0.5)) * 
    (1 + homeAdvantage) * 
    stageFactor;
  
  const lambdaB = baseLambda * 
    (opponentStrength.offense_index / 0.5) * 
    (1 / (teamStrength.defense_index + 0.5)) * 
    stageFactor;
  
  return { lambdaA, lambdaB };
}

export function matchProbabilities(lambdaA, lambdaB, maxGoals = MAX_GOALS, rho = DEFAULT_RHO) {
  let homeWin = 0;
  let draw = 0;
  let awayWin = 0;

  for (let goalsA = 0; goalsA <= maxGoals; goalsA++) {
    for (let goalsB = 0; goalsB <= maxGoals; goalsB++) {
      const prob = poissonProbability(goalsA, lambdaA) * poissonProbability(goalsB, lambdaB) * dixonColesAdjustment(goalsA, goalsB, lambdaA, lambdaB, rho);

      if (goalsA > goalsB) {
        homeWin += prob;
      } else if (goalsA === goalsB) {
        draw += prob;
      } else {
        awayWin += prob;
      }
    }
  }

  const total = homeWin + draw + awayWin;
  return {
    homeWin: homeWin / total,
    draw: draw / total,
    awayWin: awayWin / total
  };
}

export async function simulatePoissonMatch(teamAStrength, teamBStrength, isNeutral = true, stage = 'group', leagueName = '') {
  const { lambdaA, lambdaB } = await calculateExpectedGoals(teamAStrength, teamBStrength, isNeutral, stage, leagueName);
  const prob = matchProbabilities(lambdaA, lambdaB);
  
  const goalsA = poissonRandom(lambdaA);
  const goalsB = poissonRandom(lambdaB);
  
  return {
    goalsA,
    goalsB,
    homeWinProb: prob.homeWin,
    drawProb: prob.draw,
    awayWinProb: prob.awayWin,
    expectedGoalsA: lambdaA,
    expectedGoalsB: lambdaB
  };
}

export async function predictMatchById(teamAId, teamBId, isNeutral = true, stage = 'group', leagueName = '') {
  const [teamAStrength, teamBStrength] = await Promise.all([
    getTeamStrengthVector(teamAId),
    getTeamStrengthVector(teamBId)
  ]);
  
  const { lambdaA, lambdaB } = await calculateExpectedGoals(teamAStrength, teamBStrength, isNeutral, stage, leagueName);
  const prob = matchProbabilities(lambdaA, lambdaB);
  
  return {
    teamAId,
    teamBId,
    isNeutral,
    stage,
    expectedGoalsA: lambdaA,
    expectedGoalsB: lambdaB,
    leagueBaseLambda: leagueName ? await getLeagueBaseLambda(leagueName) : BASE_LAMBDA,
    homeWinProb: prob.homeWin,
    drawProb: prob.draw,
    awayWinProb: prob.awayWin
  };
}

export async function getModelParameters() {
  const rows = await query(
    "SELECT * FROM model_parameters WHERE model_name = 'poisson'"
  );
  
  const params = {
    alpha: 1.0,
    beta: 0.0
  };
  
  rows.forEach(row => {
    if (row.parameter_name === 'alpha') params.alpha = row.parameter_value;
    if (row.parameter_name === 'beta') params.beta = row.parameter_value;
  });
  
  return params;
}

export async function saveModelParameters(params) {
  await Promise.all([
    run(`
      INSERT OR REPLACE INTO model_parameters (model_name, parameter_name, parameter_value, description)
      VALUES (?, ?, ?, ?)
    `, ['poisson', 'alpha', params.alpha, 'Attack/Defense weight']),
    run(`
      INSERT OR REPLACE INTO model_parameters (model_name, parameter_name, parameter_value, description)
      VALUES (?, ?, ?, ?)
    `, ['poisson', 'beta', params.beta, 'Base offset'])
  ]);
}

export async function trainPoissonModel(matches) {
  let alpha = 1.0;
  let beta = 0.0;
  const iterations = 100;
  const learningRate = 0.01;
  
  for (let iter = 0; iter < iterations; iter++) {
    let alphaGradient = 0;
    let betaGradient = 0;
    
    for (const match of matches) {
      if (!match.offenseA || !match.defenseB || match.homeGoals == null) continue;
      
      const lambda = alpha * match.offenseA * match.defenseB + beta;
      const mu = alpha * match.offenseB * match.defenseA + beta;
      
      const probLambda = poissonProbability(match.homeGoals, lambda);
      const probMu = poissonProbability(match.awayGoals, mu);
      
      if (probLambda > 0 && probMu > 0 && lambda > 1e-10 && mu > 1e-10) {
        alphaGradient += (match.homeGoals - lambda) / lambda * match.offenseA * match.defenseB;
        alphaGradient += (match.awayGoals - mu) / mu * match.offenseB * match.defenseA;
        betaGradient += (match.homeGoals - lambda) / lambda;
        betaGradient += (match.awayGoals - mu) / mu;
      }
    }
    
    alpha += learningRate * alphaGradient;
    beta += learningRate * betaGradient;
    alpha = Math.max(0.1, Math.min(5.0, alpha));
  }
  
  await saveModelParameters({ alpha, beta });
  return { alpha, beta };
}

export function brierScore(predicted, actual) {
  let score = 0;
  for (let i = 0; i < predicted.length; i++) {
    score += Math.pow(predicted[i] - actual[i], 2);
  }
  return score / predicted.length;
}

export function logLoss(predicted, actual, epsilon = 1e-10) {
  let loss = 0;
  for (let i = 0; i < predicted.length; i++) {
    const p = Math.max(epsilon, Math.min(1 - epsilon, predicted[i]));
    loss -= actual[i] * Math.log(p);
  }
  return loss / predicted.length;
}
