import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { matchProb, poissonPmf, DC_RHO } from '../../world-cup-2026-prediction-model/elo.mjs';
import { getTeamStats } from '../../src/data/worldcup_team_stats.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MODEL_DIR = join(__dirname, '..', '..', 'world-cup-2026-prediction-model');

let ratingsCache = null;

function loadRatings() {
  if (ratingsCache) return ratingsCache;
  try {
    const raw = readFileSync(join(MODEL_DIR, 'data', 'elo-calibrated.json'), 'utf-8');
    ratingsCache = JSON.parse(raw).ratings;
    return ratingsCache;
  } catch (e) {
    throw new Error(`无法加载外部模型 Elo 数据: ${e.message}`);
  }
}

/**
 * 系统内部球队 ID（拼音）→ 外部模型球队名（英文小写连字符）
 * 覆盖全部 48 支世界杯参赛队
 */
const TEAM_ID_MAP = {
  // Group A
  'moxige': 'mexico',
  'nanfei': 'south-africa',
  'hanguo': 'south-korea',
  'jieke1': 'czech-republic',
  // Group B
  'jianada': 'canada',
  'bohei1': 'bosnia-and-herzegovina',
  'kataer': 'qatar',
  'ruishi': 'switzerland',
  // Group C
  'baxi': 'brazil',
  'moluoge': 'morocco',
  'haidi': 'haiti',
  'sugelan': 'scotland',
  // Group D
  'meiguo': 'usa',
  'balagui': 'paraguay',
  'aodaliya': 'australia',
  'tuerqi1': 'turkey',
  // Group E
  'deguo': 'germany',
  'kulasuo': 'curacao',
  'ketediwa1': 'ivory-coast',
  'eguaduoer': 'ecuador',
  // Group F
  'helan': 'netherlands',
  'riben': 'japan',
  'ruidian1': 'sweden',
  'tunisi1': 'tunisia',
  // Group G
  'bilishi': 'belgium',
  'aiji1': 'egypt',
  'yilang': 'iran',
  'xinxilan1': 'new-zealand',
  // Group H
  'xibanya': 'spain',
  'fodejiao1': 'cape-verde',
  'shatealabo': 'saudi-arabia',
  'wulagui': 'uruguay',
  // Group I
  'faguo': 'france',
  'saineijiaer': 'senegal',
  'yilake1': 'iraq',
  'nuowei': 'norway',
  // Group J
  'agenting': 'argentina',
  'aerjiliya': 'algeria',
  'aodili': 'austria',
  'yuedan1': 'jordan',
  // Group K
  'putaoya': 'portugal',
  'minzhugangguo': 'dr-congo',
  'wuzibiekesitan': 'uzbekistan',
  'gelunbiya': 'colombia',
  // Group L
  'yinggelan': 'england',
  'keluodiya': 'croatia',
  'jiana': 'ghana',
  'banama': 'panama',
};

/**
 * 将系统内部球队 ID 映射为外部模型球队名
 */
export function toExternalTeamName(systemId) {
  const name = TEAM_ID_MAP[systemId];
  if (!name) {
    throw new Error(`未知球队: ${systemId}，无法映射到外部模型`);
  }
  return name;
}

/**
 * Dixon-Coles τ 修正因子
 * 修正低比分（0-0, 1-0, 0-1, 1-1）的泊松概率
 */
function dcTau(a, b, lambda, mu, rho) {
  if (a === 0 && b === 0) return 1 - lambda * mu * rho;
  if (a === 0 && b === 1) return 1 + lambda * rho;
  if (a === 1 && b === 0) return 1 + mu * rho;
  if (a === 1 && b === 1) return 1 - rho;
  return 1;
}

/**
 * 计算比分概率矩阵，返回前 N 个最可能的比分
 */
function computeScoreProbabilities(lambda, mu, topN = 5) {
  const scores = [];
  for (let a = 0; a <= 6; a++) {
    const pA = poissonPmf(a, lambda);
    for (let b = 0; b <= 6; b++) {
      const tau = dcTau(a, b, lambda, mu, DC_RHO);
      const p = pA * poissonPmf(b, mu) * tau;
      if (p > 0.001) { // 过滤极低概率
        scores.push({ score: `${a}-${b}`, prob: p });
      }
    }
  }
  scores.sort((x, y) => y.prob - x.prob);
  const total = scores.reduce((s, x) => s + x.prob, 0);
  return scores.slice(0, topN).map(x => ({ score: x.score, prob: x.prob / total }));
}

/**
 * 基于近期胜率 (winRate) 对 Elo 评分做小幅动态调整
 * 借鉴 Pallab9999 项目的 form 特征思路
 */
function applyFormAdjustment(rating, winRate) {
  if (winRate == null) return { adjusted: rating, delta: 0 };
  if (winRate >= 0.65) return { adjusted: rating + 30, delta: 30 };
  if (winRate >= 0.55) return { adjusted: rating + 15, delta: 15 };
  if (winRate <= 0.25) return { adjusted: rating - 30, delta: -30 };
  if (winRate <= 0.35) return { adjusted: rating - 15, delta: -15 };
  return { adjusted: rating, delta: 0 };
}

/**
 * 使用外部开源预测模型（Elo + Dixon-Coles 泊松）进行比赛预测
 *
 * @param {string} homeTeamId - 系统内部主队 ID（拼音）
 * @param {string} awayTeamId - 系统内部客队 ID（拼音）
 * @returns {Promise<{homeWinProb: number, drawProb: number, awayWinProb: number,
 *          homeExpectedGoals: number, awayExpectedGoals: number,
 *          predictedScore: string, dataSource: string}>}
 */
export async function predictWithExternalModel(homeTeamId, awayTeamId) {
  const ratings = loadRatings();

  const homeExternal = toExternalTeamName(homeTeamId);
  const awayExternal = toExternalTeamName(awayTeamId);

  const ratingA = ratings[homeExternal];
  const ratingB = ratings[awayExternal];

  if (ratingA == null) {
    throw new Error(`外部模型无 ${homeExternal} (${homeTeamId}) 的 Elo 评分`);
  }
  if (ratingB == null) {
    throw new Error(`外部模型无 ${awayExternal} (${awayTeamId}) 的 Elo 评分`);
  }

  // 基于 winRate 的 form 微调（借鉴 Pallab9999 form 特征思路）
  const homeStats = getTeamStats(homeTeamId);
  const awayStats = getTeamStats(awayTeamId);
  const homeForm = applyFormAdjustment(ratingA, homeStats?.winRate);
  const awayForm = applyFormAdjustment(ratingB, awayStats?.winRate);

  // 中立场预测（世界杯默认中立场地），使用 form 调整后的 Elo
  const result = matchProb(homeForm.adjusted, awayForm.adjusted, 0);

  // 计算比分概率矩阵（前 5 最可能比分）
  const scoreProbabilities = computeScoreProbabilities(result.expectedGoalsA, result.expectedGoalsB, 5);

  // 用泊松众数作为预测比分
  function poissonMode(lambda) {
    return Math.round(lambda);
  }

  const homeGoals = poissonMode(result.expectedGoalsA);
  const awayGoals = poissonMode(result.expectedGoalsB);

  return {
    homeWinProb: result.winA,
    drawProb: result.draw,
    awayWinProb: result.winB,
    homeExpectedGoals: result.expectedGoalsA,
    awayExpectedGoals: result.expectedGoalsB,
    predictedScore: `${homeGoals}-${awayGoals}`,
    dataSource: 'external',
    formAdjustment: { home: homeForm.delta, away: awayForm.delta },
    scoreProbabilities
  };
}
