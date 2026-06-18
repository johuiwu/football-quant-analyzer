// ======================== 共享策略条件评估模块 ========================
// 【同步提醒】前端 cornerStore.ts:export evaluateMatchForStrategies 须与此逻辑保持一致
// 修改任一处时请同步更新另一处
// 统一后端策略评估逻辑，供 cornerService.js 和 cornerStrategyEngine.js 共用
// 前端 cornerStore.ts 独立实现以支持实时响应，但逻辑须与此模块保持一致

const evaluationCache = new Map();
const EVALUATION_CACHE_MAX = 500;

function cacheKey(match, strategies) {
  const strategyIds = strategies.map(s => s.id + ":" + (s.enabled ? "1" : "0")).sort().join(",");
  const fingerprint = JSON.stringify({
    id: match.matchId,
    m: match.elapsedMinutes ?? 0,
    h: match.cornerHandicap ?? match.handicap ?? 0,
    o: match.cornerOdds ?? match.odds ?? 0,
    hs: match.homeScore ?? 0,
    as: match.awayScore ?? 0,
    hc: match.homeCorners ?? 0,
    ac: match.awayCorners ?? 0,
    ou: match.cornerOU ? { ro: match.cornerOU.overOdds, ru: match.cornerOU.underOdds } : null,
    strats: strategyIds,
  });
  return fingerprint;
}

/**
 * 方向感知赔率解析：根据策略投注方向返回实际盘口赔率
 * over → cornerOU.overOdds, under → cornerOU.underOdds, auto/home/away → cornerOdds
 * @param {Object} match - 比赛数据
 * @param {Object} strategy - 策略配置（需含 betDirection）
 * @returns {number} 实际赔率值，无效时返回 0
 */
export function resolveStrategyOdds(match, strategy) {
  const cornerOU = match.cornerOU;
  const betDir = strategy?.betDirection || "auto";

  if (cornerOU) {
    if (betDir === "over" && cornerOU.overOdds > 0) return cornerOU.overOdds;
    if (betDir === "under" && cornerOU.underOdds > 0) return cornerOU.underOdds;
  }
  // auto/home/away/next 或 cornerOU 中无对应方向赔率时 fallback
  return match.cornerOdds ?? match.odds ?? 0;
}

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
  const homeScore = match.homeScore ?? 0;
  const awayScore = match.awayScore ?? 0;
  const goalDiff = Math.abs(homeScore - awayScore);
  const homeCorners = match.homeCorners ?? 0;
  const awayCorners = match.awayCorners ?? 0;

  // 策略触发校验日志：明确区分比分和角球数
  console.log(`[策略触发校验] 策略${strategy.id}: 比分: ${homeScore}-${awayScore}, 角球: ${homeCorners}-${awayCorners}, 实际领先球数: ${goalDiff}`);

  // 方向感知赔率选择：使用 resolveStrategyOdds 统一解析
  const odds = resolveStrategyOdds(match, strategy);

  // 赔率安全校验：赔率为0且策略要求赔率>0时，阻止触发
  if (odds <= 0 && (strategy.targetOdds || 0) > 0) {
    console.error(`[赔率缺失] 策略${strategy.id}无法获取当前投注方向(${strategy.betDirection || 'auto'})的有效赔率, matchId=${match.matchId || ''}`);
    return false;
  }

  // 比赛时间合理性校验
  const HALF_TIME_START = 45;
  const HALF_TIME_END = 46;
  const MATCH_MAX_MINUTES = 99;
  if (currentMinute > MATCH_MAX_MINUTES) return false;
  if (currentMinute >= HALF_TIME_START && currentMinute <= HALF_TIME_END) return false;

  // 时间窗口检查
  if (currentMinute < strategy.playTimeStart || currentMinute > strategy.playTimeEnd) return false;
  // 盘口范围检查
  // 盘口范围检查（方向感知：betDirection=auto 时使用绝对值比较，否则使用原始值）
  if (strategy.betDirection === "auto" || strategy.betDirection == null) {
    const absHcp = Math.abs(handicap);
    if (absHcp < strategy.cornerHandicapLower || absHcp > strategy.cornerHandicapUpper) return false;
  } else {
    if (handicap < strategy.cornerHandicapLower || handicap > strategy.cornerHandicapUpper) return false;
  }
  // 赔率条件检查
  if (odds < strategy.targetOdds) return false;

  // 比分条件检查
  // leadGoals >= 20 → 哨兵值，不做比分限制（如策略一 leadGoals=99）
  if (strategy.leadGoals >= 20) return true;

  // leadGoals > 0 且 leadGoalsWeak === 0 → 上限：球差不超过阈值
  if (strategy.leadGoals > 0 && (strategy.leadGoalsWeak || 0) === 0 && goalDiff <= strategy.leadGoals) return true;

  // leadGoalsWeak > 0 → 弱队领先：至少差N球，同时受 leadGoals 上限约束
  if ((strategy.leadGoalsWeak || 0) > 0 && goalDiff >= (strategy.leadGoalsWeak || 0) && goalDiff <= strategy.leadGoals) return true;

  // leadGoals === 0 且 leadGoalsWeak === 0 → 平局检查：goalDiff 必须为 0
  if (strategy.leadGoals === 0 && (strategy.leadGoalsWeak || 0) === 0) {
    const isTriggered = goalDiff === 0;
    console.log('[策略3 Debug] 当前比分:', homeScore, '-', awayScore, '触发条件: leadGoals=' + strategy.leadGoals, '是否通过:', isTriggered);
    if (isTriggered) return true;
  }

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
  const key = cacheKey(match, strategies);
  const cached = evaluationCache.get(key);
  if (cached !== undefined) return cached;
  const result = strategies
    .filter(s => evaluateSingleStrategy(match, s))
    .map(s => s.id);
  if (evaluationCache.size >= EVALUATION_CACHE_MAX) {
    const firstKey = evaluationCache.keys().next().value;
    evaluationCache.delete(firstKey);
  }
  evaluationCache.set(key, result);
  return result;
}
