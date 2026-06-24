import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import TEAM_STATS_MAP from '../../src/data/worldcup_team_stats.json';

function getTeamStatsFromTs(teamId) {
  return TEAM_STATS_MAP[teamId] || {
    avgXgFor: 1.2, avgXgAgainst: 1.3, avgPossession: 48,
    avgShots: 9.0, avgShotsOnTarget: 3.5,
    avgGoalsFor: 1.2, avgGoalsAgainst: 1.3,
    avgCorners: 3.5, winRate: 0.40
  };
}

const TEAM_STATS_FILE = join(process.cwd(), 'src', 'data', 'worldcup_team_stats.json');

function getTeamStatsFromFile(teamId) {
  try {
    if (!existsSync(TEAM_STATS_FILE)) return null;
    const content = readFileSync(TEAM_STATS_FILE, 'utf-8');
    const stats = JSON.parse(content);
    return stats[teamId] || null;
  } catch {
    return null;
  }
}

// ─── 内联 Elo 评分数据（来自 world-cup-2026-prediction-model/data/elo-calibrated.json） ───
const ELO_RATINGS = {
  "argentina": 1976, "france": 2009, "spain": 2010, "brazil": 1955,
  "england": 1993, "portugal": 1945, "netherlands": 1894, "germany": 1926,
  "belgium": 1878, "italy": 1901, "colombia": 1878, "uruguay": 1831,
  "croatia": 1852, "morocco": 1874, "switzerland": 1812, "usa": 1826,
  "mexico": 1834, "japan": 1825, "senegal": 1848, "denmark": 1795,
  "ecuador": 1829, "australia": 1772, "south-korea": 1760, "iran": 1747,
  "poland": 1731, "canada": 1740, "serbia": 1714, "wales": 1688,
  "ghana": 1659, "tunisia": 1680, "ivory-coast": 1732, "nigeria": 1671,
  "saudi-arabia": 1657, "qatar": 1592, "egypt": 1695, "algeria": 1704,
  "scotland": 1663, "cameroon": 1633, "paraguay": 1681, "venezuela": 1625,
  "chile": 1616, "peru": 1612, "czech-republic": 1651,
  "bosnia-and-herzegovina": 1602, "south-africa": 1591, "new-zealand": 1591,
  "panama": 1615, "jamaica": 1514, "honduras": 1497, "jordan": 1548,
  "haiti": 1537, "el-salvador": 1438, "trinidad-and-tobago": 1429,
  "guatemala": 1416, "norway": 1880, "sweden": 1752, "turkey": 1731,
  "austria": 1718, "iraq": 1599, "uzbekistan": 1633, "cape-verde": 1599,
  "dr-congo": 1650, "curacao": 1548
};

// ─── 内联 Elo + Dixon-Coles 核心算法（来自 world-cup-2026-prediction-model/elo.mjs） ───
const DC_RHO = -0.13;

function dcTau(a, b, lambda, mu, rho) {
  if (a === 0 && b === 0) return 1 - lambda * mu * rho;
  if (a === 0 && b === 1) return 1 + lambda * rho;
  if (a === 1 && b === 0) return 1 + mu * rho;
  if (a === 1 && b === 1) return 1 - rho;
  return 1;
}

function expectedGoals(rating, opponent, homeBonus = 0) {
  const diff = (rating + homeBonus) - opponent;
  const lambda = 1.35 + diff / 400;
  return Math.max(0.3, Math.min(3.5, lambda));
}

function poissonPmf(k, lambda) {
  if (lambda <= 0) return k === 0 ? 1 : 0;
  let p = Math.exp(-lambda);
  for (let i = 1; i <= k; i++) p *= lambda / i;
  return p;
}

function matchProb(ratingA, ratingB, homeBonusA = 0) {
  const lambda = expectedGoals(ratingA, ratingB, homeBonusA);
  const mu = expectedGoals(ratingB, ratingA, -homeBonusA / 2);
  let winA = 0, draw = 0, winB = 0;
  for (let a = 0; a <= 8; a++) {
    const pA = poissonPmf(a, lambda);
    for (let b = 0; b <= 8; b++) {
      const tau = dcTau(a, b, lambda, mu, DC_RHO);
      const p = pA * poissonPmf(b, mu) * tau;
      if (a > b) winA += p; else if (a < b) winB += p; else draw += p;
    }
  }
  const total = winA + draw + winB;
  return { winA: winA / total, draw: draw / total, winB: winB / total, expectedGoalsA: lambda, expectedGoalsB: mu };
}

// ─── 球队 ID 映射 ───
const TEAM_ID_MAP = {
  'moxige': 'mexico', 'nanfei': 'south-africa', 'hanguo': 'south-korea',
  'jieke1': 'czech-republic', 'jianada': 'canada',
  'bohei1': 'bosnia-and-herzegovina', 'kataer': 'qatar', 'ruishi': 'switzerland',
  'baxi': 'brazil', 'moluoge': 'morocco', 'haidi': 'haiti', 'sugelan': 'scotland',
  'meiguo': 'usa', 'balagui': 'paraguay', 'aodaliya': 'australia', 'tuerqi1': 'turkey',
  'deguo': 'germany', 'kulasuo': 'curacao', 'ketediwa1': 'ivory-coast',
  'eguaduoer': 'ecuador', 'helan': 'netherlands', 'riben': 'japan',
  'ruidian1': 'sweden', 'tunisi1': 'tunisia', 'bilishi': 'belgium',
  'aiji1': 'egypt', 'yilang': 'iran', 'xinxilan1': 'new-zealand',
  'xibanya': 'spain', 'fodejiao1': 'cape-verde', 'shatealabo': 'saudi-arabia',
  'wulagui': 'uruguay', 'faguo': 'france', 'saineijiaer': 'senegal',
  'yilake1': 'iraq', 'nuowei': 'norway', 'agenting': 'argentina',
  'aerjiliya': 'algeria', 'aodili': 'austria', 'yuedan1': 'jordan',
  'putaoya': 'portugal', 'minzhugangguo': 'dr-congo', 'wuzibiekesitan': 'uzbekistan',
  'gelunbiya': 'colombia', 'yinggelan': 'england', 'keluodiya': 'croatia',
  'jiana': 'ghana', 'banama': 'panama',
};

export function toExternalTeamName(systemId) {
  const name = TEAM_ID_MAP[systemId];
  if (!name) throw new Error(`未知球队: ${systemId}，无法映射到外部模型`);
  return name;
}

function computeScoreProbabilities(lambda, mu, topN = 5) {
  const scores = [];
  for (let a = 0; a <= 6; a++) {
    const pA = poissonPmf(a, lambda);
    for (let b = 0; b <= 6; b++) {
      const tau = dcTau(a, b, lambda, mu, DC_RHO);
      const p = pA * poissonPmf(b, mu) * tau;
      if (p > 0.001) scores.push({ score: `${a}-${b}`, prob: p });
    }
  }
  scores.sort((x, y) => y.prob - x.prob);
  return scores.slice(0, topN).map(x => ({ score: x.score, prob: x.prob }));
}

/**
 * 基于近期胜率 (winRate) 对 Elo 评分做连续线性微调
 * 借鉴 Pallab9999 项目的 form 特征思路，改为连续函数避免阶梯跳跃
 * winRate=0.5 时 delta=0，范围 [-18, +18]
 */
function applyFormAdjustment(rating, winRate) {
  if (winRate == null) return { adjusted: rating, delta: 0 };
  const delta = Math.round((winRate - 0.5) * 120);
  const clamped = Math.max(-18, Math.min(18, delta));
  return { adjusted: rating + clamped, delta: clamped };
}

export async function predictWithExternalModel(homeTeamId, awayTeamId) {
  const homeExternal = toExternalTeamName(homeTeamId);
  const awayExternal = toExternalTeamName(awayTeamId);

  const ratingA = ELO_RATINGS[homeExternal];
  const ratingB = ELO_RATINGS[awayExternal];

  if (ratingA == null) throw new Error(`外部模型无 ${homeExternal} (${homeTeamId}) 的 Elo 评分`);
  if (ratingB == null) throw new Error(`外部模型无 ${awayExternal} (${awayTeamId}) 的 Elo 评分`);

  const homeStats = getTeamStatsFromFile(homeTeamId) || getTeamStatsFromTs(homeTeamId);
  const awayStats = getTeamStatsFromFile(awayTeamId) || getTeamStatsFromTs(awayTeamId);
  const homeForm = applyFormAdjustment(ratingA, homeStats?.winRate);
  const awayForm = applyFormAdjustment(ratingB, awayStats?.winRate);

  // 东道主主场优势：2026 世界杯东道主为美国、墨西哥、加拿大
  const HOST_NATIONS = new Set(['meiguo', 'moxige', 'jianada']);
  let homeBonusA = 0;
  if (HOST_NATIONS.has(homeTeamId)) homeBonusA = 65;
  else if (HOST_NATIONS.has(awayTeamId)) homeBonusA = -65;

  const result = matchProb(homeForm.adjusted, awayForm.adjusted, homeBonusA);
  const scoreProbabilities = computeScoreProbabilities(result.expectedGoalsA, result.expectedGoalsB, 5);

  const homeGoals = Math.round(result.expectedGoalsA);
  const awayGoals = Math.round(result.expectedGoalsB);

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
