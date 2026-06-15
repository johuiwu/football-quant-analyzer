import { calculateXgExpectedGoals, getFallbackExpectedGoals } from './worldcupRecentStatsService.js';
import { predictWithExternalModel } from './externalModelService.js';

const STAGE_FACTORS = {
  group: 1.0,
  round_of_32: 0.95,
  round_of_16: 0.92,
  quarter: 0.88,
  semi: 0.85,
  final: 0.80
};

function factorial(n) {
  let r = 1;
  for (let i = 2; i <= n; i++) r *= i;
  return r;
}

function poissonProb(k, lambda) {
  return Math.exp(-lambda) * Math.pow(lambda, k) / factorial(k);
}

function poissonRandom(lambda) {
  const L = Math.exp(-lambda);
  let k = 0;
  let p = 1;
  do {
    k++;
    p *= Math.random();
  } while (p > L);
  return k - 1;
}

function poissonMode(lambda) {
  return Math.round(lambda);
}

function calculatePoissonProbabilities(xgHome, xgAway) {
  const maxGoals = 8;
  let homeWin = 0, draw = 0, awayWin = 0;
  for (let i = 0; i <= maxGoals; i++) {
    for (let j = 0; j <= maxGoals; j++) {
      const prob = poissonProb(i, xgHome) * poissonProb(j, xgAway);
      if (i > j) homeWin += prob;
      else if (i === j) draw += prob;
      else awayWin += prob;
    }
  }
  return { homeWin, draw, awayWin };
}

export function calculateWorldCupElo(teamA, teamB) {
  const Ra = teamA.elo;
  const Rb = teamB.elo;
  const Ea = 1 / (1 + Math.pow(10, (Rb - Ra) / 400));
  const Eb = 1 - Ea;
  const eloGap = Math.abs(Ra - Rb);
  const drawProb = 0.25 * Math.max(0, 1 - eloGap / 1000);
  const totalWinProb = 1 - drawProb;
  return {
    teamAWinProb: totalWinProb * Ea,
    teamBDrawProb: drawProb,
    teamBWinProb: totalWinProb * Eb
  };
}

export function calculateWorldCupEloAdvanced(homeElo, awayElo, stage) {
  const isKnockout = stage !== 'group' && stage !== undefined;
  const K = isKnockout ? 40 : 32;
  const Ra = homeElo;
  const Rb = awayElo;
  const Ea = 1 / (1 + Math.pow(10, (Rb - Ra) / 400));
  const Eb = 1 - Ea;
  const eloGap = Math.abs(Ra - Rb);
  const drawProb = 0.25 * Math.max(0, 1 - eloGap / 1000);
  const totalWinProb = 1 - drawProb;
  return {
    homeWinProb: totalWinProb * Ea,
    drawProb: drawProb,
    awayWinProb: totalWinProb * Eb,
    K
  };
}

export function calculateWorldCupExpectedGoals(teamA, teamB, stage) {
  const stageFactor = STAGE_FACTORS[stage] || 1.0;
  const lambdaA = (teamA.elo / teamB.elo) * teamA.weight * 1.2 * stageFactor;
  const lambdaB = (teamB.elo / teamA.elo) * teamB.weight * 1.2 * stageFactor;
  return {
    homeExpectedGoals: lambdaA,
    awayExpectedGoals: lambdaB
  };
}

export function simulateGroupStage(groups, maxMs = 3000) {
  const advanceMap = {};
  const startTime = Date.now();

  for (const teams of Object.values(groups)) {
    if (Date.now() - startTime > maxMs) break;

    const matchPairs = [];
    for (let i = 0; i < teams.length; i++) {
      for (let j = i + 1; j < teams.length; j++) {
        matchPairs.push([i, j]);
      }
    }

    const advanceCount = {};
    for (const t of teams) {
      advanceCount[t.id] = 0;
    }

    const totalSimulations = 10000;

    for (let sim = 0; sim < totalSimulations; sim++) {
      const points = {};
      for (const t of teams) {
        points[t.id] = 0;
      }

      for (const [i, j] of matchPairs) {
        const teamA = teams[i];
        const teamB = teams[j];
        const { teamAWinProb, teamBDrawProb, teamBWinProb } = calculateWorldCupElo(teamA, teamB);
        const rand = Math.random();

        if (rand < teamAWinProb) {
          points[teamA.id] += 3;
        } else if (rand < teamAWinProb + teamBDrawProb) {
          points[teamA.id] += 1;
          points[teamB.id] += 1;
        } else {
          points[teamB.id] += 3;
        }
      }

      const sorted = [...teams].sort((a, b) => points[b.id] - points[a.id]);
      const topTwo = sorted.slice(0, 2);

      for (const t of topTwo) {
        advanceCount[t.id]++;
      }
    }

    for (const t of teams) {
      advanceMap[t.id] = advanceCount[t.id] / totalSimulations;
    }
  }

  const result = Object.entries(advanceMap).map(([teamId, advanceProb]) => ({
    teamId,
    advanceProb
  }));

  result.sort((a, b) => b.advanceProb - a.advanceProb);
  return result;
}

export async function predictMatch(homeTeam, awayTeam, stage) {
  // 优先调用外部开源模型（Elo + Dixon-Coles 泊松）
  try {
    const externalResult = await predictWithExternalModel(homeTeam.id, awayTeam.id);
    return externalResult;
  } catch (extError) {
    console.warn(`外部模型调用失败，降级到内部 xG/xGA 模型: ${extError.message}`);
  }

  // 降级：使用内部 xG/xGA 加权泊松模型
  const statData = getFallbackExpectedGoals(homeTeam.id, awayTeam.id, stage);
  const homeX = statData.homeStats.xG;
  const homeXA = statData.homeStats.xGA;
  const awayX = statData.awayStats.xG;
  const awayXA = statData.awayStats.xGA;

  const baseGoalFactor = 1.5;
  const homeAdvantage = 1.1;
  const suppressionFactor = 0.85;
  const clamp = (v, min, max) => Math.max(min, Math.min(max, v));

  const homeExpectedGoals = clamp(((homeX + awayXA) / 2) * baseGoalFactor * homeAdvantage * suppressionFactor, 1.2, 4.5);
  const awayExpectedGoals = clamp(((awayX + homeXA) / 2) * baseGoalFactor * suppressionFactor, 1.2, 4.5);

  const homeGoals = poissonMode(homeExpectedGoals);
  const awayGoals = poissonMode(awayExpectedGoals);
  const predictedScore = `${homeGoals}-${awayGoals}`;

  const probs = calculatePoissonProbabilities(homeExpectedGoals, awayExpectedGoals);

  return {
    homeWinProb: probs.homeWin,
    drawProb: probs.draw,
    awayWinProb: probs.awayWin,
    homeExpectedGoals,
    awayExpectedGoals,
    predictedScore,
    dataSource: 'internal'
  };
}

export async function predictMatchWithStats(homeTeam, awayTeam, stage, homeRecentStats, awayRecentStats) {
  // 优先调用外部开源模型（Elo + Dixon-Coles 泊松）
  try {
    const externalResult = await predictWithExternalModel(homeTeam.id, awayTeam.id);
    return externalResult;
  } catch (extError) {
    console.warn(`外部模型调用失败，降级到内部 xG/xGA 模型: ${extError.message}`);
  }

  // 降级：使用内部 xG/xGA 加权泊松模型
  const xgResult = calculateXgExpectedGoals(homeRecentStats, awayRecentStats, stage);

  const baseGoalFactor = 1.5;
  const homeAdvantage = 1.1;
  const suppressionFactor = 0.85;
  const clamp = (v, min, max) => Math.max(min, Math.min(max, v));

  let homeExpectedGoals, awayExpectedGoals;
  if (xgResult.source === 'xg' && xgResult.homeExpectedGoals !== null) {
    homeExpectedGoals = clamp(xgResult.homeExpectedGoals * baseGoalFactor * homeAdvantage * suppressionFactor, 1.2, 4.5);
    awayExpectedGoals = clamp(xgResult.awayExpectedGoals * baseGoalFactor * suppressionFactor, 1.2, 4.5);
  } else {
    const fallback = getFallbackExpectedGoals(homeTeam.id, awayTeam.id, stage);
    homeExpectedGoals = clamp(fallback.homeExpectedGoals * baseGoalFactor * homeAdvantage * suppressionFactor, 1.2, 4.5);
    awayExpectedGoals = clamp(fallback.awayExpectedGoals * baseGoalFactor * suppressionFactor, 1.2, 4.5);
  }

  const homeGoals = poissonMode(homeExpectedGoals);
  const awayGoals = poissonMode(awayExpectedGoals);
  const predictedScore = `${homeGoals}-${awayGoals}`;
  const probs = calculatePoissonProbabilities(homeExpectedGoals, awayExpectedGoals);

  return {
    homeWinProb: probs.homeWin,
    drawProb: probs.draw,
    awayWinProb: probs.awayWin,
    homeExpectedGoals,
    awayExpectedGoals,
    predictedScore,
    dataSource: 'internal'
  };
}
