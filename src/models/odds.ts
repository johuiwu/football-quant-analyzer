/**
 * 亚盘 ↔ 欧赔精确转换模块
 * 基于 Dixon-Coles 双变量泊松模型（rho 按联赛差异化）
 * 替代 quantModel.ts 中的分段线性映射表
 */

import { poisson, dixonColesAdjustment } from './poisson';
import { getLeagueRho, getLeagueAvgGoals } from '../config/leagueParams';

// ======================== 常量 ========================

const DEFAULT_RETURN_RATE = 0.92;
const MAX_GOALS = 8;

// ======================== 辅助：Dixon-Coles 比分概率 ========================

export function computeDixonColesProbs(
  lambda: number,
  mu: number,
  rho: number = -0.075,
): { homeProb: number; drawProb: number; awayProb: number } {
  let homeProb = 0, drawProb = 0, awayProb = 0, totalProb = 0;
  for (let h = 0; h <= MAX_GOALS; h++) {
    const pH = poisson(h, lambda);
    for (let a = 0; a <= MAX_GOALS; a++) {
      const pA = poisson(a, mu);
      const adj = dixonColesAdjustment(h, a, lambda, mu, rho);
      const p = pH * pA * adj;
      if (h > a) homeProb += p;
      else if (h === a) drawProb += p;
      else awayProb += p;
      totalProb += p;
    }
  }
  if (totalProb > 0) { homeProb /= totalProb; drawProb /= totalProb; awayProb /= totalProb; }
  return { homeProb, drawProb, awayProb };
}

// ======================== 亚盘 → 欧赔 ========================

export function exactAsianTo1X2(
  handicap: number,
  homeStrength: number,
  awayStrength: number,
  league?: string,
  returnRate: number = DEFAULT_RETURN_RATE,
  homeAdv: number = 0,
): {
  homeOdds: number;
  drawOdds: number;
  awayOdds: number;
  homeProb: number;
  drawProb: number;
  awayProb: number;
} {
  const strengthDiff = homeStrength - awayStrength;
  const adjustedDiff = strengthDiff - handicap;
  const leagueAvg = getLeagueAvgGoals(league);
  const baseGoals = leagueAvg / 2;
  const lambda = Math.max(0.1, baseGoals + adjustedDiff / 2 + homeAdv / 2);
  const mu = Math.max(0.1, baseGoals - adjustedDiff / 2 - homeAdv / 2);
  const rho = getLeagueRho(league);
  const { homeProb, drawProb, awayProb } = computeDixonColesProbs(lambda, mu, rho);
  const homeOdds = Math.round((returnRate / homeProb) * 100) / 100;
  const drawOdds = Math.round((returnRate / drawProb) * 100) / 100;
  const awayOdds = Math.round((returnRate / awayProb) * 100) / 100;
  return { homeOdds, drawOdds, awayOdds, homeProb, drawProb, awayProb };
}

// ======================== 欧赔 → 亚盘 ========================

function klDivergence(p: number[], q: number[]): number {
  if (p.length === 0 || q.length === 0) return Infinity;
  let kl = 0;
  for (let i = 0; i < p.length; i++) {
    if (p[i] > 0 && q[i] > 0) kl += p[i] * Math.log(p[i] / q[i]);
  }
  return kl;
}

export function exact1X2ToAsian(
  homeOdds: number,
  drawOdds: number,
  awayOdds: number,
  homeStrength: number = 1.0,
  awayStrength: number = 1.0,
  league?: string,
): {
  handicap: number;
  homeWater: number;
  awayWater: number;
} {
  const rawHome = 1 / homeOdds;
  const rawDraw = 1 / drawOdds;
  const rawAway = 1 / awayOdds;
  const totalImp = rawHome + rawDraw + rawAway;
  const targetProbs = [rawHome / totalImp, rawDraw / totalImp, rawAway / totalImp];
  const returnRate = 1 / totalImp;

  let lo = -3.0, hi = 3.0, bestHandicap = 0, bestKL = Infinity;
  const precision = 0.01;

  for (let i = 0; i <= 100; i++) {
    const mid = lo + (hi - lo) / 2;
    const result = exactAsianTo1X2(mid, homeStrength, awayStrength, league, returnRate);
    const modelProbs = [result.homeProb, result.drawProb, result.awayProb];
    const probDiff = modelProbs[0] - modelProbs[2];
    const targetDiff = targetProbs[0] - targetProbs[2];
    if (probDiff > targetDiff) lo = mid; else hi = mid;
    const kl = klDivergence(targetProbs, modelProbs);
    if (kl < bestKL) { bestKL = kl; bestHandicap = mid; }
    if (hi - lo < precision) break;
  }

  const standardHandicaps = [-3.0, -2.5, -2.0, -1.75, -1.5, -1.25, -1.0, -0.75, -0.5, -0.25,
    0, 0.25, 0.5, 0.75, 1.0, 1.25, 1.5, 1.75, 2.0, 2.5, 3.0];
  let finalHandicap = standardHandicaps[0], minDist = Infinity;
  for (const h of standardHandicaps) {
    const dist = Math.abs(h - bestHandicap);
    if (dist < minDist) { minDist = dist; finalHandicap = h; }
  }

  const finalResult = exactAsianTo1X2(finalHandicap, homeStrength, awayStrength, league, returnRate);
  const homeFair = finalResult.homeProb / (finalResult.homeProb + finalResult.awayProb);
  const awayFair = finalResult.awayProb / (finalResult.homeProb + finalResult.awayProb);
  const homeWater = Math.round((returnRate / homeFair) * 100) / 100;
  const awayWater = Math.round((returnRate / awayFair) * 100) / 100;

  return {
    handicap: finalHandicap,
    homeWater: Math.max(0.75, Math.min(1.10, homeWater)),
    awayWater: Math.max(0.75, Math.min(1.10, awayWater)),
  };
}