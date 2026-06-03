/**
 * xG (预期进球) 科学计算模型
 * 替代线性估算 xgFor = goalsFor * 0.95
 *
 * 基于射门次数、射正次数、联赛平均 xG 每射门值计算
 */

import { getLeagueAvgGoals } from '../config/leagueParams';

// ======================== 联赛 xG 每射门基准 ========================

/** 各联赛平均 xG 每射门值（射正权重 1.2×，射偏权重 0.2×） */
export const LEAGUE_XG_PER_SHOT: Record<string, number> = {
  EPL: 0.11,
  LaLiga: 0.10,
  Bundesliga: 0.12,
  SerieA: 0.09,
  Ligue1: 0.10,
  Championship: 0.09,
  Eredivisie: 0.12,
  PrimeiraLiga: 0.10,
  DEFAULT: 0.10,
};

/** 射正期望 xG（高质量机会） */
export const ON_TARGET_XG_FACTOR = 1.2;
/** 射偏期望 xG（低质量尝试） */
export const OFF_TARGET_XG_FACTOR = 0.2;

// ======================== 计算函数 ========================

/**
 * 科学计算预期进球 (xG)
 *
 * @param shots 总射门次数
 * @param shotsOnTarget 射正次数
 * @param league 联赛 ID（用于联赛特定 xG 基准）
 * @param useRealXG 若有真实 xG 数据则直接返回（爬虫提供）
 * @returns 计算后的 xG 值
 */
export function calculateRealisticXG(
  shots: number,
  shotsOnTarget: number,
  league?: string,
  realXG?: number,
): number {
  // 若有真实 xG 数据，直接使用
  if (realXG !== undefined && realXG > 0) {
    return realXG;
  }

  const xgPerShot = LEAGUE_XG_PER_SHOT[league || 'DEFAULT'] || LEAGUE_XG_PER_SHOT.DEFAULT;
  const shotsOffTarget = Math.max(0, shots - shotsOnTarget);

  // 核心公式：射正 × 高质量系数 + 射偏 × 低质量系数
  const xg = shotsOnTarget * (xgPerShot * ON_TARGET_XG_FACTOR)
           + shotsOffTarget * (xgPerShot * OFF_TARGET_XG_FACTOR);

  return Math.round(xg * 100) / 100;
}

/**
 * 从球队统计数据计算场均 xG
 *
 * @param team 球队数据（需包含 shotsPerGame, shotAccuracy, league）
 * @returns 计算后的 xG 值
 */
export function computeTeamXG(team: {
  shotsPerGame?: number;
  shotAccuracy?: number;
  league?: string;
  realXG?: number;
}): number {
  const shots = team.shotsPerGame || 12;
  const accuracy = (team.shotAccuracy || 40) / 100;
  const shotsOnTarget = Math.round(shots * accuracy);

  return calculateRealisticXG(shots, shotsOnTarget, team.league, team.realXG);
}

/**
 * 为球队主/客场分别计算 xG（考虑到主客场射门表现不同）
 *
 * @param team 球队完整数据
 * @param isHome 是否主场
 * @returns { xgFor, xgAgainst } 该侧预期进球和预期失球
 */
export function computeTeamXGSplit(
  team: {
    homeStats: { played: number; goalsFor: number; goalsAgainst: number };
    awayStats: { played: number; goalsFor: number; goalsAgainst: number };
    shotsPerGame?: number;
    shotAccuracy?: number;
    league?: string;
  },
  isHome: boolean,
): { xgFor: number; xgAgainst: number } {
  const stats = isHome ? team.homeStats : team.awayStats;
  const played = Math.max(1, stats.played);
  const goalsPerGame = stats.goalsFor / played;
  const concededPerGame = stats.goalsAgainst / played;

  // xGFor：基于射门数据 + 实际进球率校准
  const baseXG = computeTeamXG(team);
  const xgFor = Math.round((baseXG * 0.85 + goalsPerGame * 0.15) * 100) / 100;

  // xGAgainst：基于对手进球率估算
  const leagueAvg = getLeagueAvgGoals(team.league);
  const opponentQuality = concededPerGame / Math.max(0.1, leagueAvg / 2);
  const xgAgainst = Math.round((leagueAvg / 2 * opponentQuality * 0.9) * 100) / 100;

  return { xgFor, xgAgainst };
}