/**
 * 冷门爆冷热力指数优化模块 — Z-Score 动态预警
 *
 * 替代 quantModel.ts 中固定阈值 heatIndex > 1.45 的经验判断。
 * 使用统计学 Z-Score 标准化方法，根据历史投注分布动态检测异常。
 *
 * 公式：
 *   zScore = (currentValue - historicalMean) / historicalStdDev
 *   爆冷预警：zScore > 2.0 且 modelProb - impliedProb > 0.15
 *
 * 冷启动保护：
 *   当 betting_history 样本量 < 5 时，自动降级到旧 heatIndex 阈值模式
 */

// ======================== Z-Score 计算 ========================

/**
 * 计算 Z-Score（标准分数）
 */
export function calculateZScore(value: number, mean: number, stdDev: number): number {
  if (stdDev <= 0) return 0;
  return (value - mean) / stdDev;
}

// ======================== 统计计算 ========================

/**
 * 从一组历史值计算均值与标准差（样本标准差）
 */
export function computeStats(values: number[]): { mean: number; stdDev: number } {
  const n = values.length;
  if (n === 0) return { mean: 0, stdDev: 0 };
  const mean = values.reduce((s, v) => s + v, 0) / n;
  if (n === 1) return { mean, stdDev: 0 };
  const variance = values.reduce((s, v) => s + (v - mean) ** 2, 0) / (n - 1);
  return { mean, stdDev: Math.sqrt(variance) };
}

// ======================== 冷启动检查 ========================

export interface BettingDataQuality {
  count: number;
  stdDev: number;
}

/**
 * 检查历史投注数据是否足够用于 Z-Score 计算
 * - 样本量 < 5：数据不信任，需降级
 * - 标准差 < 0.001：缺乏差异性，退化为固定值
 */
export function ensureEnoughData(stats: BettingDataQuality | null): boolean {
  if (!stats) return false;
  if (stats.count < 5) return false;
  if (stats.stdDev < 0.001) return false;
  return true;
}

// ======================== 爆冷预警判定 ========================

export interface UpsetAlertResult {
  isUpset: boolean;
  level: 'none' | 'warning' | 'danger' | 'cold_start';
  zScoreHome: number;
  zScoreAway: number;
  probGap: number;
  description: string;
  dataReady: boolean;
}

/**
 * 综合爆冷预警判定
 * @param historicalCount 历史样本量，0=冷启动，>=5=正常模式
 */
export function evaluateUpsetAlert(
  homeBetVolume: number,
  awayBetVolume: number,
  compHomeWin: number,
  compAwayWin: number,
  historicalMean: number,
  historicalStdDev: number,
  oddsHomeProb: number,
  oddsAwayProb: number,
  historicalCount: number = 30, // 默认 30 保持向后兼容
): UpsetAlertResult {
  // 冷启动检查
  const dataReady = ensureEnoughData(
    historicalCount >= 5 ? { count: historicalCount, stdDev: historicalStdDev } : null
  );

  if (!dataReady) {
    // 降级到旧 heatIndex 公式
    const fallbackHome = parseFloat((homeBetVolume / Math.max(1, compHomeWin * 100)).toFixed(2));
    const isUpset = fallbackHome > 1.45;
    const level: 'none' | 'warning' | 'danger' | 'cold_start' = isUpset ? 'warning' : 'cold_start';
    return {
      isUpset,
      level,
      zScoreHome: 0,
      zScoreAway: 0,
      probGap: Math.max(compHomeWin - oddsHomeProb, compAwayWin - oddsAwayProb, 0),
      description: isUpset
        ? '降级模式: 投注量异常 (heatIndex=' + fallbackHome.toFixed(2) + ' > 1.45)'
        : '正在积累历史投注数据，暂时使用简化的统计模型',
      dataReady: false,
    };
  }

  // 正常 Z-Score 模式
  const zScoreHome = calculateZScore(homeBetVolume, historicalMean / 2, historicalStdDev / 2);
  const zScoreAway = calculateZScore(awayBetVolume, historicalMean / 2, historicalStdDev / 2);
  const maxZScore = Math.max(Math.abs(zScoreHome), Math.abs(zScoreAway));

  const probGap = Math.max(compHomeWin - oddsHomeProb, compAwayWin - oddsAwayProb, 0);

  const isUpset = maxZScore > 2.0 && probGap > 0.15;
  let level: 'none' | 'warning' | 'danger' | 'cold_start' = 'none';

  if (maxZScore > 2.5 && probGap > 0.2) {
    level = 'danger';
  } else if (maxZScore > 2.0 && probGap > 0.15) {
    level = 'warning';
  } else if (maxZScore > 1.5 && probGap > 0.1) {
    level = 'warning';
  }

  let description = '正常区间';
  if (level === 'warning') {
    const side = zScoreHome > zScoreAway ? '主' : '客';
    description = '投注异常: ' + side + '队 Z=' + maxZScore.toFixed(1) + ' > 2.0, 模型领先 ' + (probGap*100).toFixed(0) + '%';
  } else if (level === 'danger') {
    const side = zScoreHome > zScoreAway ? '主' : '客';
    description = '强烈预警: ' + side + '队 Z=' + maxZScore.toFixed(1) + ' > 2.5, 模型领先 ' + (probGap*100).toFixed(0) + '%';
  }

  return { isUpset, level, zScoreHome, zScoreAway, probGap, description, dataReady: true };
}
