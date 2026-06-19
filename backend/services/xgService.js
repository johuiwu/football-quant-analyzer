/**
 * xG (预期进球) 科学计算模型 - ESM 版本
 * 供 backend 路由 (import) 使用，逻辑与 src/models/xg.ts 保持一致
 */

// ======================== 联赛 xG 每射门基准 ========================

/** 各联赛平均 xG 每射门值（射正权重 1.2×，射偏权重 0.2×） */
const LEAGUE_XG_PER_SHOT = {
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
const ON_TARGET_XG_FACTOR = 1.2;
/** 射偏期望 xG（低质量尝试） */
const OFF_TARGET_XG_FACTOR = 0.2;

// ======================== 联赛场均进球数 ========================

/** 联赛场均进球数（与 src/config/leagueParams.ts 保持一致） */
const LEAGUE_AVG_GOALS = {
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
 * 根据联赛 ID 获取场均进球数
 * @param {string} [league] 联赛 ID
 * @returns {number} 场均进球数
 */
export function getLeagueAvgGoals(league) {
  if (!league) return LEAGUE_AVG_GOALS.DEFAULT;
  return LEAGUE_AVG_GOALS[league] != null ? LEAGUE_AVG_GOALS[league] : LEAGUE_AVG_GOALS.DEFAULT;
}

// ======================== 计算函数 ========================

/**
 * 科学计算预期进球 (xG)
 *
 * @param {number} shots 总射门次数
 * @param {number} shotsOnTarget 射正次数
 * @param {string} [league] 联赛 ID（用于联赛特定 xG 基准）
 * @param {number} [realXG] 若有真实 xG 数据则直接返回（爬虫提供）
 * @returns {{ xg: number, warning?: string }} 计算后的 xG 值及可选的警告信息
 */
function calculateRealisticXG(shots, shotsOnTarget, league, realXG) {
  // 若有真实 xG 数据，直接使用
  if (realXG !== undefined && realXG > 0) {
    return { xg: realXG };
  }

  const warnings = [];

  // 射正数不能超过总射门数
  const safeShotsOnTarget = Math.min(shotsOnTarget, shots);
  if (shotsOnTarget > shots) {
    warnings.push('shotsOnTarget 超过总射门数，已自动截断');
  }

  // 负数截断
  const safeShots = Math.max(0, shots);

  if (safeShots === 0) {
    return { xg: 0, warning: warnings.length > 0 ? warnings.join('; ') : undefined };
  }

  const xgPerShot = LEAGUE_XG_PER_SHOT[league || 'DEFAULT'] != null
    ? LEAGUE_XG_PER_SHOT[league || 'DEFAULT']
    : LEAGUE_XG_PER_SHOT.DEFAULT;
  const shotsOffTarget = safeShots - safeShotsOnTarget;

  // 核心公式：射正 × 高质量系数 + 射偏 × 低质量系数
  const xg = safeShotsOnTarget * (xgPerShot * ON_TARGET_XG_FACTOR)
           + shotsOffTarget * (xgPerShot * OFF_TARGET_XG_FACTOR);

  return {
    xg: Math.round(xg * 100) / 100,
    warning: warnings.length > 0 ? warnings.join('; ') : undefined,
  };
}

/**
 * 从球队统计数据计算场均 xG
 *
 * @param {Object} team 球队数据（需包含 shotsPerGame, shotAccuracy, league）
 * @returns {number} 计算后的 xG 值
 */
export function computeTeamXG(team) {
  const shots = team.shotsPerGame || 12;
  const accuracy = (team.shotAccuracy || 40) / 100;
  const shotsOnTarget = Math.round(shots * accuracy);

  return calculateRealisticXG(shots, shotsOnTarget, team.league, team.realXG).xg;
}

/**
 * 为球队主/客场分别计算 xG（考虑到主客场射门表现不同）
 *
 * @param {Object} team 球队完整数据
 * @param {boolean} isHome 是否主场
 * @returns {{ xgFor: number, xgAgainst: number }} 该侧预期进球和预期失球
 */
export function computeTeamXGSplit(team, isHome) {
  const stats = isHome ? team.homeStats : team.awayStats;
  const played = Math.max(1, stats.played);
  const goalsPerGame = stats.goalsFor / played;
  const concededPerGame = stats.goalsAgainst / played;

  // xGFor：基于射门数据 + 实际进球率校准
  const baseXG = computeTeamXG(team);
  const xgFor = Math.round((baseXG * 0.85 + goalsPerGame * 0.15) * 100) / 100;

  // xGAgainst：基于对手进球率与联赛场均进球关系估算
  const leagueAvg = getLeagueAvgGoals(team.league);
  const opponentQuality = concededPerGame / Math.max(0.1, leagueAvg / 2);
  const xgAgainst = Math.round((leagueAvg / 2 * Math.min(opponentQuality, 3.0) * 0.9) * 100) / 100;

  return { xgFor, xgAgainst };
}
