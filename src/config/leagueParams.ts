/**
 * 联赛差异化 Dixon-Coles 参数配置
 * 
 * rho 参数控制低比分（0-0, 1-0, 0-1, 1-1）的修正强度：
 * - 负值越大（绝对值大）：低比分概率修正越强（适用于低比分联赛如意甲）
 * - 负值越小（绝对值小）：低比分概率修正越弱（适用于高进球联赛如德甲）
 */

/** 联赛 Dixon-Coles rho 参数 */
export const LEAGUE_RHO: Record<string, number> = {
  EPL: -0.075,          // 英超：标准参考值
  LaLiga: -0.080,       // 西甲：略低于英超
  Bundesliga: -0.055,   // 德甲：进球多，低比分修正弱
  SerieA: -0.100,       // 意甲：低比分明显多，修正最强
  Ligue1: -0.070,       // 法甲：介于英超和意甲之间
  Championship: -0.085, // 英冠：低比分略多
  Eredivisie: -0.050,   // 荷甲：进球多
  PrimeiraLiga: -0.095, // 葡超：低比分偏多
  DEFAULT: -0.075,      // 默认
};

/**
 * 联赛场均进球数（用于 lambda/mu 基准）
 */
export const LEAGUE_AVG_GOALS: Record<string, number> = {
  EPL: 2.85,
  LaLiga: 2.55,
  Bundesliga: 3.05,
  SerieA: 2.60,
  Ligue1: 2.72,
  Championship: 2.50,
  Eredivisie: 3.10,
  PrimeiraLiga: 2.45,
  DEFAULT: 2.70,
};

/**
 * 根据联赛 ID 获取 rho 参数
 */
export function getLeagueRho(league?: string): number {
  if (!league) return LEAGUE_RHO.DEFAULT;
  return LEAGUE_RHO[league] ?? LEAGUE_RHO.DEFAULT;
}

/**
 * 根据联赛 ID 获取场均进球数
 */
export function getLeagueAvgGoals(league?: string): number {
  if (!league) return LEAGUE_AVG_GOALS.DEFAULT;
  return LEAGUE_AVG_GOALS[league] ?? LEAGUE_AVG_GOALS.DEFAULT;
}

/** 联赛主场进球优势（场均） */
export const LEAGUE_HOME_ADV: Record<string, number> = {
  EPL: 0.32,
  LaLiga: 0.35,
  Bundesliga: 0.38,
  SerieA: 0.30,
  Ligue1: 0.33,
  Championship: 0.28,
  Eredivisie: 0.40,
  PrimeiraLiga: 0.32,
  DEFAULT: 0.32,
};

/** 根据联赛 ID 获取主场优势 */
export function getLeagueHomeAdv(league?: string): number {
  if (!league) return LEAGUE_HOME_ADV.DEFAULT;
  return LEAGUE_HOME_ADV[league] ?? LEAGUE_HOME_ADV.DEFAULT;
}
