/**
 * 贝叶斯实时更新 — 非线性时间衰减模型
 *
 * 替代 quantModel.ts 中的线性衰减 rawRemaining = (90 - t) / 90
 * 使用幂函数衰减，使末段进球预期更符合真实比赛分布
 */

// ======================== 联赛差异化衰减参数 ========================

/** 各联赛的时间衰减幂次（越大末段衰减越慢，保留更多进球预期） */
export const LEAGUE_TIME_DECAY: Record<string, number> = {
  EPL: 1.2,
  LaLiga: 1.2,
  Bundesliga: 1.0,   // 德甲末段进球多
  SerieA: 1.4,        // 意甲末段进球相对少
  Ligue1: 1.2,
  Championship: 1.3,
  Eredivisie: 1.1,    // 荷甲高进球
  PrimeiraLiga: 1.3,
  DEFAULT: 1.2,
};

// ======================== 衰减函数 ========================

/**
 * 计算非线性时间衰减系数
 *
 * 公式：decay = ((totalMinutes - elapsed) / totalMinutes) ^ exponent
 *
 * - 线性衰减 (exponent=1.0)：80分钟时 decay = 10/90 ≈ 0.111
 * - 非线性 (exponent=1.2)：80分钟时 decay = (10/90)^1.2 ≈ 0.059
 * - 末段预期更低，更符合实际比赛中进球在最后几分钟发生但
 *   总量在前期已消耗较多的事实
 *
 * @param elapsedMinutes 已进行时间（分钟）
 * @param totalMinutes 总比赛时间，默认 90
 * @param exponent 衰减幂次，默认 1.2
 * @returns 剩余时间衰减系数 (0.0 ~ 1.0)
 */
export function calculateTimeDecay(
  elapsedMinutes: number,
  totalMinutes: number = 90,
  exponent: number = 1.2,
): number {
  // 防御性编程：参数校验
  const safeTotal = totalMinutes <= 0 ? 90 : totalMinutes;
  const safeElapsed = Math.max(0, Math.min(elapsedMinutes, safeTotal));
  const safeExponent = Math.max(0, exponent);
  const ratio = (safeTotal - safeElapsed) / safeTotal;
  return Math.pow(ratio, safeExponent);
}

/**
 * 根据联赛获取衰减系数并计算时间衰减
 *
 * @param elapsedMinutes 已进行时间
 * @param league 联赛 ID（可选）
 * @param totalMinutes 总时间，默认 90
 */
export function calculateLeagueTimeDecay(
  elapsedMinutes: number,
  league?: string,
  totalMinutes: number = 90,
): number {
  const exponent = LEAGUE_TIME_DECAY[league || 'DEFAULT'] || LEAGUE_TIME_DECAY.DEFAULT;
  return calculateTimeDecay(elapsedMinutes, totalMinutes, exponent);
}