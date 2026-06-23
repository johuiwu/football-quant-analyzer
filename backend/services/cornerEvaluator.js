// ======================== 共享策略条件评估模块 ========================
// 【同步提醒】前端 cornerStore.ts:export evaluateMatchForStrategies 须与此逻辑保持一致
// 修改任一处时请同步更新另一处
// 统一后端策略评估逻辑，供 cornerService.js 和 cornerStrategyEngine.js 共用
// 前端 cornerStore.ts 独立实现以支持实时响应，但逻辑须与此模块保持一致

import { normalizeHandicap } from './crawlerShared.js';

const evaluationCache = new Map();
const EVALUATION_CACHE_MAX = 500;
const EVALUATION_CACHE_TTL = 60000; // 60秒缓存过期

function cacheKey(match, strategies) {
  const strategyIds = strategies.map(s => s.id + ":" + (s.enabled ? "1" : "0") + ":" + (s.market_type || "auto")).sort().join(",");
  const fingerprint = JSON.stringify({
    id: match.matchId,
    m: match.elapsedMinutes ?? 0,
    h: match.cornerHandicap ?? match.handicap ?? 0,
    o: match.cornerOdds ?? match.odds ?? 0,
    hs: match.homeScore ?? 0,
    as: match.awayScore ?? 0,
    hc: match.homeCorners ?? 0,
    ac: match.awayCorners ?? 0,
    ou: match.cornerOU ? { ro: match.cornerOU.overOdds, ru: match.cornerOU.underOdds, h: match.cornerOU.handicap } : null,
    strats: strategyIds,
  });
  return fingerprint;
}

// ======================== 市场类型过滤 ========================

/**
 * 按市场类型过滤盘口列表
 * @param {Array} handicaps - 比赛的盘口列表（HandicapEntry[]）
 * @param {string} marketType - 市场类型：over_under | handicap | next_corner | auto
 * @returns {Array} 过滤后的盘口列表
 */
export function filterMarketsByType(handicaps, marketType) {
  if (!handicaps || !Array.isArray(handicaps)) return [];
  if (marketType === 'auto' || !marketType) return handicaps;

  const categoryMap = {
    'over_under': ['O/U'],
    'handicap': ['HDP'],
    'next_corner': ['NEXT'],
  };

  const allowedCategories = categoryMap[marketType] || [];
  if (allowedCategories.length === 0) return handicaps;

  return handicaps.filter(h => allowedCategories.includes(h.category));
}

// ======================== AI 评分过滤器 ========================

/**
 * 简化版 AI 概率计算：基于泊松分布估算大小球概率
 * @param {Object} match - 比赛数据
 * @param {Object} strategy - 策略配置
 * @returns {number} 0-100 的概率百分比
 */
export function quickAIProbability(match, strategy) {
  // 先解构 match 对象中的关键字段，避免引用错误
  const { homeCorners = 0, awayCorners = 0, handicap } = match;
  const currentMinute = match.elapsedMinutes ?? match.currentMinute ?? match.elapsed_minutes ?? 0;

  const totalCorners = homeCorners + awayCorners;
  const remainingMinutes = Math.max(0, 90 - currentMinute);

  // 平均每分钟0.15角球的简化假设
  const expectedRemaining = remainingMinutes * 0.15;
  const expectedTotal = totalCorners + expectedRemaining;

  // 获取归一化后的盘口线（使用解构出来的 handicap，fallback 到 cornerHandicap）
  const rawHandicap = handicap ?? match.cornerHandicap ?? 0;
  const line = normalizeHandicap(rawHandicap);

  // 简化概率计算：基于预期总角球与盘口线的对比
  let overProb;
  if (expectedTotal > line) {
    overProb = Math.min(0.95, 0.55 + (expectedTotal - line) * 0.1);
  } else {
    overProb = Math.max(0.05, 0.45 - (line - expectedTotal) * 0.1);
  }

  return Math.round(overProb * 100);
}

// ======================== 方向感知赔率解析 ========================

/**
 * 方向感知赔率解析：根据策略投注方向和市场类型返回实际盘口赔率
 * - over_under: Over → overOdds, Under → underOdds, Auto → 优先overOdds
 * - handicap: Home → homeOdds, Away → awayOdds, Auto → 优先homeOdds
 * - next_corner: Home → homeOdds, Away → awayOdds, Auto → 角球落后方自动选边
 * @param {Object} match - 比赛数据
 * @param {Object} strategy - 策略配置（需含 direction 和 market_type）
 * @returns {number} 实际赔率值，无效时返回 0
 */
export function resolveStrategyOdds(match, strategy) {
  const rawDir = strategy?.direction || strategy?.betDirection || "Auto";
  const betDir = rawDir.toLowerCase();
  const marketType = strategy?.market_type || 'auto';

  // ========== next_corner 市场类型专用逻辑 ==========
  if (marketType === 'next_corner') {
    const nextCorner = match.nextCorner || match.cornerOU;
    const homeOdds = nextCorner?.homeOdds ?? nextCorner?.overOdds ?? 0;
    const awayOdds = nextCorner?.awayOdds ?? nextCorner?.underOdds ?? 0;

    if (betDir === "home" && homeOdds > 0) return homeOdds;
    if (betDir === "away" && awayOdds > 0) return awayOdds;

    // Auto 方向：next_corner 自动选边逻辑
    if (betDir === "auto") {
      const homeCorners = match.homeCorners ?? 0;
      const awayCorners = match.awayCorners ?? 0;

      if (homeCorners < awayCorners) {
        // 主队角球落后，正在压上进攻，自动投注主队
        console.log(`[NextCorner Auto] 主队角球落后(${homeCorners}<${awayCorners})，自动投注主队(Home), matchId=${match.matchId || ''}`);
        return homeOdds || awayOdds;
      } else if (awayCorners < homeCorners) {
        // 客队角球落后，自动投注客队
        console.log(`[NextCorner Auto] 客队角球落后(${awayCorners}<${homeCorners})，自动投注客队(Away), matchId=${match.matchId || ''}`);
        return awayOdds || homeOdds;
      } else {
        // 角球数相等，选择赔率更低的那方（市场更看好）
        const chosenSide = (homeOdds > 0 && awayOdds > 0 && awayOdds < homeOdds) ? 'Away' : 'Home';
        const chosenOdds = chosenSide === 'Away' ? awayOdds : homeOdds;
        console.log(`[NextCorner Auto] 角球数相等(${homeCorners}=${awayCorners})，选择赔率更低的${chosenSide}方(odds=${chosenOdds}), matchId=${match.matchId || ''}`);
        return chosenOdds;
      }
    }

    // fallback
    return (homeOdds || awayOdds || match.cornerOdds) ?? 0;
  }

  // ========== handicap 市场类型专用逻辑 ==========
  if (marketType === 'handicap') {
    const cornerHDP = match.cornerHDP || match.cornerOU;
    const homeOdds = cornerHDP?.homeOdds ?? 0;
    const awayOdds = cornerHDP?.awayOdds ?? 0;

    if (betDir === "home" && homeOdds > 0) return homeOdds;
    if (betDir === "away" && awayOdds > 0) return awayOdds;

    // Auto 方向：handicap 优先选 homeOdds
    if (betDir === "auto") {
      if (homeOdds > 0) return homeOdds;
      if (awayOdds > 0) return awayOdds;
    }

    return (homeOdds || awayOdds || match.cornerOdds) ?? 0;
  }

  // ========== over_under / auto 市场类型（默认逻辑） ==========
  const cornerOU = match.cornerOU;
  if (cornerOU) {
    if (betDir === "over" && cornerOU.overOdds > 0) return cornerOU.overOdds;
    if (betDir === "under" && cornerOU.underOdds > 0) return cornerOU.underOdds;
    // under 方向但 underOdds 缺失时输出警告
    if (betDir === "under" && (!cornerOU.underOdds || cornerOU.underOdds <= 0)) {
      console.warn(`[cornerEvaluator] underOdds缺失 matchId=${match.matchId}, 将使用fallback赔率`);
    }
    // auto 方向：从 cornerOU 中提取有效赔率（优先 overOdds，其次 underOdds）
    if (betDir === "auto") {
      if (cornerOU.overOdds > 0) return cornerOU.overOdds;
      if (cornerOU.underOdds > 0) return cornerOU.underOdds;
    }
  }

  // home/away 或 cornerOU 中无对应方向赔率时 fallback
  return match.cornerOdds ?? match.odds ?? 0;
}

// ======================== 7级流水线策略评估 ========================

/**
 * 评估单场比赛是否触发指定策略（7级流水线架构）
 *
 * 流水线顺序：
 * 1. 时间过滤（minute_min/max）
 * 2. 盘口类型过滤（market_type）
 * 3. 盘口归一化（normalizeHandicap）
 * 4. 盘口区间过滤（line_min/max，next_corner 类型跳过）
 * 5. 赔率过滤（odds_min/max）
 * 6. AI评分过滤（aiFilterEnabled，可选）
 * 7. 投注方向与比分条件匹配（direction, leadGoals, leadSide）
 *
 * @param {Object} match - 比赛数据
 * @param {Object} strategy - 策略配置（新字段：minute_min/max, line_min/max, odds_min/max, corner_min/max, direction, market_type, aiFilterEnabled）
 * @param {Object} globalSettings - 全局设置
 * @returns {boolean} 是否触发
 */
export function evaluateSingleStrategy(match, strategy, globalSettings) {
  if (!strategy.enabled) return false;

  const currentMinute = match.elapsedMinutes ?? match.currentMinute ?? match.elapsed_minutes ?? 0;
  const rawHandicap = match.handicap ?? match.cornerHandicap ?? 0;
  const homeScore = match.homeScore ?? 0;
  const awayScore = match.awayScore ?? 0;
  const goalDiff = Math.abs(homeScore - awayScore);
  const homeCorners = match.homeCorners ?? 0;
  const awayCorners = match.awayCorners ?? 0;

  // 策略触发校验日志
  console.log(`[策略触发校验] 策略${strategy.id}: 比分: ${homeScore}-${awayScore}, 角球: ${homeCorners}-${awayCorners}, 实际领先球数: ${goalDiff}`);

  // ========== 第1级：时间过滤 ==========
  // 比赛时间合理性校验
  const HALF_TIME_START = 45;
  const HALF_TIME_END = 46;
  const MATCH_MAX_MINUTES = 99;
  if (currentMinute > MATCH_MAX_MINUTES) return false;
  if (currentMinute >= HALF_TIME_START && currentMinute <= HALF_TIME_END) return false;

  // 时间窗口检查（兼容新旧字段名）
  const minuteMin = strategy.minute_min ?? strategy.playTimeStart ?? 0;
  const minuteMax = strategy.minute_max ?? strategy.playTimeEnd ?? 99;
  if (currentMinute < minuteMin || currentMinute > minuteMax) {
    console.log(`[流水线-1级] 策略${strategy.id} 时间过滤未通过: ${currentMinute}' 不在 ${minuteMin}'-${minuteMax}' 范围内`);
    return false;
  }

  // ========== 第2级：盘口类型过滤 ==========
  const marketType = strategy.market_type || 'auto';
  const matchHandicaps = match.handicaps || [];
  const filteredMarkets = filterMarketsByType(matchHandicaps, marketType);

  // 如果策略指定了特定市场类型但该类型盘口不存在，则不触发
  if (marketType !== 'auto' && filteredMarkets.length === 0 && matchHandicaps.length > 0) {
    console.log(`[流水线-2级] 策略${strategy.id} 盘口类型过滤未通过: market_type=${marketType}, 无匹配盘口`);
    return false;
  }

  // ========== 第3级：盘口归一化 ==========
  const handicap = normalizeHandicap(rawHandicap);

  // ========== 第4级：盘口区间过滤（next_corner 类型跳过） ==========
  const lineMin = strategy.line_min ?? strategy.cornerHandicapLower ?? -3;
  const lineMax = strategy.line_max ?? strategy.cornerHandicapUpper ?? 5;

  if (marketType !== 'next_corner') {
    // 方向感知：direction=Auto 时使用绝对值比较，否则使用原始值
    const rawDir = strategy.direction || strategy.betDirection || "Auto";
    const dirLower = rawDir.toLowerCase();
    if (dirLower === "auto" || dirLower == null) {
      const absHcp = Math.abs(handicap);
      if (absHcp < lineMin || absHcp > lineMax) {
        console.log(`[流水线-4级] 策略${strategy.id} 盘口区间过滤未通过: |${handicap}| 不在 ${lineMin}~${lineMax} 范围内`);
        return false;
      }
    } else {
      if (handicap < lineMin || handicap > lineMax) {
        console.log(`[流水线-4级] 策略${strategy.id} 盘口区间过滤未通过: ${handicap} 不在 ${lineMin}~${lineMax} 范围内`);
        return false;
      }
    }
  } else {
    console.log(`[流水线-4级] 策略${strategy.id} next_corner类型，跳过盘口区间过滤`);
  }

  // ========== 第5级：赔率过滤 ==========
  const odds = resolveStrategyOdds(match, strategy);
  const oddsMin = strategy.odds_min ?? strategy.targetOdds ?? 0;
  const oddsMax = strategy.odds_max ?? strategy.maxOdds ?? 1.10;

  // 赔率安全校验：赔率为0且策略要求赔率>0时，阻止触发
  if (odds <= 0 && oddsMin > 0) {
    console.error(`[流水线-5级] 策略${strategy.id} 赔率缺失: direction=${strategy.direction || 'Auto'}, matchId=${match.matchId || ''}`);
    return false;
  }
  if (odds < oddsMin) {
    console.log(`[流水线-5级] 策略${strategy.id} 赔率下限未通过: ${odds} < ${oddsMin}`);
    return false;
  }
  if (odds > oddsMax) {
    console.log(`[流水线-5级] 策略${strategy.id} 赔率上限未通过: ${odds} > ${oddsMax}`);
    return false;
  }

  // ========== 第6级：AI评分过滤（可选） ==========
  const aiFilterEnabled = strategy.aiFilterEnabled ?? false;
  if (aiFilterEnabled) {
    const aiProb = quickAIProbability(match, strategy);
    if (aiProb <= 60) {
      console.log(`[AI评分过滤] 策略${strategy.id} AI概率${aiProb}%未达60%阈值, matchId=${match.matchId || ''}`);
      return false;
    }
    console.log(`[AI评分通过] 策略${strategy.id} AI概率${aiProb}%超过60%阈值`);
  }

  // ========== 第7级：投注方向与比分条件匹配 ==========

  // 角球数绝对值范围检查
  const totalCorners = homeCorners + awayCorners;
  const cornerMin = strategy.corner_min ?? strategy.minCurrentCorners ?? 0;
  const cornerMax = strategy.corner_max ?? strategy.maxCurrentCorners ?? 99;
  if (totalCorners < cornerMin || totalCorners > cornerMax) {
    console.log(`[流水线-7级] 策略${strategy.id} 角球数过滤未通过: ${totalCorners} 不在 ${cornerMin}~${cornerMax} 范围内`);
    return false;
  }

  // 领先方身份判断（leadSide 字段）- 需结合 strongHandicapThreshold
  if (strategy.leadSide && strategy.leadSide !== "any" && goalDiff > 0) {
    const threshold = globalSettings?.strongHandicapThreshold ?? 1;
    const isStrongWeakMatchup = Math.abs(handicap) >= threshold;
    if (isStrongWeakMatchup) {
      const homeLeading = homeScore > awayScore;
      const homeIsStrong = handicap >= 0;
      const strongTeamLeading = (homeIsStrong && homeLeading) || (!homeIsStrong && !homeLeading);
      if (strategy.leadSide === "strong" && !strongTeamLeading) return false;
      if (strategy.leadSide === "weak" && strongTeamLeading) return false;
    }
  }

  // 比分条件检查
  // leadGoals >= 20 → 哨兵值，不做比分限制
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
export function evaluateStrategies(match, strategies, globalSettings) {
  if (!match || !strategies || !Array.isArray(strategies)) return [];

  // 全局盘口兜底检查（归一化后比较）
  const rawHandicap = match.handicap ?? match.cornerHandicap ?? 0;
  const handicap = normalizeHandicap(rawHandicap);
  if (globalSettings) {
    if (handicap < (globalSettings.handicapLowerLimit ?? -1.25)) return [];
    if (handicap > (globalSettings.handicapUpperLimit ?? 3.5)) return [];
  }

  const key = cacheKey(match, strategies);
  const cached = evaluationCache.get(key);
  if (cached !== undefined) {
    if (Date.now() - cached.timestamp > EVALUATION_CACHE_TTL) {
      evaluationCache.delete(key);
    } else {
      return cached.value;
    }
  }
  const result = strategies
    .filter(s => evaluateSingleStrategy(match, s, globalSettings))
    .map(s => s.id);

  // 策略间方向冲突互斥：如果同一场比赛触发了多个策略且 direction 存在 Over/Under 冲突，只保留 id 最小的策略
  if (result.length > 1) {
    const triggeredStrategies = strategies.filter(s => result.includes(s.id));
    const hasOver = triggeredStrategies.some(s => (s.direction || s.betDirection || '').toLowerCase() === "over");
    const hasUnder = triggeredStrategies.some(s => (s.direction || s.betDirection || '').toLowerCase() === "under");
    if (hasOver && hasUnder) {
      const minId = Math.min(...result);
      console.log(`[策略互斥] 比赛${match.matchId || ''}触发策略${result.join(',')}存在Over/Under冲突，保留策略${minId}`);
      const filteredResult = [minId];
      evaluationCache.set(key, { value: filteredResult, timestamp: Date.now() });
      return filteredResult;
    }
  }

  if (evaluationCache.size >= EVALUATION_CACHE_MAX) {
    const firstKey = evaluationCache.keys().next().value;
    evaluationCache.delete(firstKey);
  }
  evaluationCache.set(key, { value: result, timestamp: Date.now() });
  return result;
}
