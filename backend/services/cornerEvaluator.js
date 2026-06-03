// ======================== 共享策略条件评估模块 ========================
// 统一后端策略评估逻辑，供 cornerService.js 和 cornerStrategyEngine.js 共用
// 前端 cornerStore.ts 独立实现以支持实时响应，但逻辑须与此模块保持一致

/**
 * 评估单场比赛是否触发指定策略
 * @param {Object} match - 比赛数据 { elapsedMinutes, handicap, odds, homeScore, awayScore }
 * @param {Object} strategy - 策略配置 { enabled, playTimeStart, playTimeEnd, cornerHandicapLower, cornerHandicapUpper, targetOdds, leadGoals, leadGoalsWeak }
 * @returns {boolean} 是否触发
 */
export function evaluateSingleStrategy(match, strategy) {
  if (!strategy.enabled) return false;

  const currentMinute = match.elapsedMinutes ?? match.currentMinute ?? match.elapsed_minutes ?? 0;
  const handicap = match.handicap ?? match.cornerHandicap ?? 0;
  const odds = match.odds ?? match.cornerOdds ?? 0;
  const homeScore = match.homeScore ?? 0;
  const awayScore = match.awayScore ?? 0;
  const goalDiff = Math.abs(homeScore - awayScore);

  // 比赛时间合理性校验
  const HALF_TIME_START = 45;
  const HALF_TIME_END = 46;
  const MATCH_MAX_MINUTES = 95;
  if (currentMinute > MATCH_MAX_MINUTES) return false;
  if (currentMinute >= HALF_TIME_START && currentMinute <= HALF_TIME_END) return false;

  // 时间窗口检查
  if (currentMinute < strategy.playTimeStart || currentMinute > strategy.playTimeEnd) return false;
  // 盘口范围检查
  if (handicap < strategy.cornerHandicapLower || handicap > strategy.cornerHandicapUpper) return false;
  // 赔率条件检查
  if (odds < strategy.targetOdds) return false;

  // 比分条件检查
  // leadGoals >= 20 → 哨兵值，不做比分限制（如策略一 leadGoals=99）
  if (strategy.leadGoals >= 20) return true;

  // leadGoals > 0 且 leadGoalsWeak === 0 → 上限：球差不超过阈值
  if (strategy.leadGoals > 0 && (strategy.leadGoalsWeak || 0) === 0 && goalDiff <= strategy.leadGoals) return true;

  // leadGoalsWeak > 0 → 弱队领先：至少差N球
  if ((strategy.leadGoalsWeak || 0) > 0 && goalDiff >= (strategy.leadGoalsWeak || 0)) return true;

  // leadGoals === 0 且 leadGoalsWeak === 0 → 平局检查：goalDiff 必须为 0
  if (strategy.leadGoals === 0 && (strategy.leadGoalsWeak || 0) === 0 && goalDiff === 0) return true;

  return false;
}

/**
 * 评估一批比赛的所有已启用策略，返回触发的策略ID列表
 * @param {Object} match - 比赛数据
 * @param {Array} strategies - 策略列表
 * @returns {Array<number|string>} 触发的策略ID数组
 */
export function evaluateStrategies(match, strategies) {
  if (!match || !strategies || !Array.isArray(strategies)) return [];
  return strategies
    .filter(s => evaluateSingleStrategy(match, s))
    .map(s => s.id);
}
