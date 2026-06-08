import {
  saveSimulationRecord,
  getSimulationRecords,
  getStrategyStats
} from './cornerService.js';
import { evaluateSingleStrategy } from './cornerEvaluator.js';

// ======================== 模拟比赛名称生成 ========================
const TEAM_NAMES = [
  "曼城", "阿森纳", "利物浦", "曼联", "切尔西", "热刺", "纽卡斯尔", "布莱顿",
  "皇马", "巴萨", "马竞", "塞维利亚", "拜仁", "多特", "莱比锡", "勒沃库森",
  "巴黎", "马赛", "里昂", "摩纳哥", "国米", "AC米兰", "尤文", "那不勒斯"
];

function randomTeamName() {
  return TEAM_NAMES[Math.floor(Math.random() * TEAM_NAMES.length)];
}

function randomMatchName() {
  let home = randomTeamName();
  let away = randomTeamName();
  while (away === home) away = randomTeamName();
  return { home, away, name: `${home} vs ${away}`, matchId: `${home}_vs_${away}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}` };
}

/**
 * 生成一场模拟比赛数据
 * 返回随机比赛时间、角球盘口和赔率
 */
function generateSimulatedMatch() {
  const { home, away, name, matchId } = randomMatchName();
  const elapsedMinutes = Math.floor(Math.random() * 90) + 5;
  // 盘口在 -2 到 4 之间
  const handicapRaw = (Math.random() * 6 - 2).toFixed(2);
  const handicap = parseFloat(handicapRaw);
  // 赔率在 0.6 到 2.0 之间
  const oddsRaw = (0.6 + Math.random() * 1.4).toFixed(2);
  const odds = parseFloat(oddsRaw);
  // 模拟比分差
  const goalDiff = Math.floor(Math.random() * 5) - 2;
  return { matchId, matchName: name, homeTeam: home, awayTeam: away, elapsedMinutes, cornerHandicap: handicap, cornerOdds: odds, homeScore: Math.max(0, 1 + goalDiff), awayScore: Math.max(0, 1) };
}

/**
 * 评估单场比赛是否触发指定策略（委托给共享模块 cornerEvaluator.js）
 */
function doesStrategyTrigger(match, strategy) {
  return evaluateSingleStrategy(match, strategy);
}

/**
 * 模拟投注结果
 * 赔率越高胜率越低，模拟真实场景
 * odds > 1.5 → 胜率约 40%；odds ≤ 1.5 → 胜率约 55%
 */
function simulateBetResult(odds) {
  const winRate = odds > 1.5 ? 0.40 : 0.55;
  const isWin = Math.random() < winRate;
  return {
    result: isWin ? 'win' : 'lose',
    profitLoss: isWin ? Math.round((odds - 1) * 100 * 100) / 100 : -100
  };
}

// ======================== 回测主函数 ========================

/**
 * 对指定策略列表执行历史回测
 * @param {Array} strategies - 策略列表（含 enabled, playTimeStart/End, leadGoals 等字段）
 * @returns {Object} { stats: { [strategyId]: { triggered, wins, losses, winRate, totalProfit, roi } } }
 */
export async function runBacktest(strategies) {
  const MATCH_COUNT = 80;
  console.log(`[cornerStrategyEngine] 开始回测，生成 ${MATCH_COUNT} 场模拟比赛...`);

  // 生成模拟比赛数据
  const simulatedMatches = [];
  for (let i = 0; i < MATCH_COUNT; i++) {
    simulatedMatches.push(generateSimulatedMatch());
  }

  // 按策略统计
  const statsMap = {};

  for (const strategy of strategies) {
    if (!strategy.enabled) continue;
    const sid = String(strategy.id);
    let wins = 0;
    let losses = 0;
    let totalProfit = 0;

    for (const match of simulatedMatches) {
      if (doesStrategyTrigger(match, strategy)) {
        const { result, profitLoss } = simulateBetResult(match.cornerOdds);
        if (result === 'win') wins++;
        else losses++;
        totalProfit += profitLoss;

        // 写入模拟记录
        await saveSimulationRecord({
          strategy_id: sid,
          match_id: match.matchId,
          match_name: match.matchName,
          elapsed_minutes: match.elapsedMinutes,
          trigger_odds: match.cornerOdds,
          trigger_handicap: match.cornerHandicap,
          bet_direction: match.cornerHandicap > 0 ? '强队' : '对面',
          result,
          profit_loss: profitLoss
        });
      }
    }

    const triggered = wins + losses;
    const winRate = triggered > 0 ? Math.round((wins / triggered) * 100 * 100) / 100 : 0;
    const roi = triggered > 0 ? Math.round((totalProfit / (triggered * 100)) * 100 * 100) / 100 : 0;

    statsMap[sid] = {
      strategyId: sid,
      strategyName: strategy.name,
      triggered,
      executed: wins,
      failed: losses,
      successRate: winRate,
      totalProfit: Math.round(totalProfit * 100) / 100,
      roi
    };
  }

  console.log('[cornerStrategyEngine] 回测完成，策略数:', Object.keys(statsMap).length);
  return { success: true, simulated: true, warning: "回测数据为随机模拟生成，不代表真实比赛结果，仅供策略逻辑验证参考", stats: statsMap, totalMatches: MATCH_COUNT };
}

// ---- gismo 实时比赛状态缓存 ----
const liveMatchState = new Map(); // matchId → { elapsedMinutes, homeScore, awayScore, homeCorners, awayCorners, totalCorners, ... }

// ---- 策略触发回调 ----
let strategyTriggerCallback = null;

/**
 * 注入 gismo 实时增量数据，更新比赛状态缓存
 * @param {Object} deltaData - GismoSubscriber 回调传入的增量数据
 */
export function injectGismoDelta(deltaData) {
  if (!deltaData || !deltaData.matchId) return;

  const state = {
    matchId: deltaData.matchId,
    elapsedMinutes: deltaData.elapsedMinutes ?? null,
    homeScore: deltaData.homeScore ?? 0,
    awayScore: deltaData.awayScore ?? 0,
    homeCorners: deltaData.homeCorners ?? 0,
    awayCorners: deltaData.awayCorners ?? 0,
    totalCorners: deltaData.totalCorners ?? 0,
    homeTeam: deltaData.homeTeam ?? '',
    awayTeam: deltaData.awayTeam ?? '',
    matchStatus: deltaData.matchStatus ?? '',
    liveStatus: deltaData.liveStatus ?? '',
    isRunning: deltaData.isRunning ?? false,
    timestamp: Date.now()
  };

  liveMatchState.set(deltaData.matchId, state);

  console.log(
    `[cornerStrategyEngine] gismo delta: matchId=${state.matchId} ${state.homeTeam} vs ${state.awayTeam} ${state.homeScore}-${state.awayScore} @ ${state.elapsedMinutes}' corners=${state.totalCorners}`
  );
}

/**
 * 基于 gismo 实时数据评估策略触发
 * @param {Object} deltaData - GismoSubscriber 回调传入的增量数据
 * @param {Array} strategies - 策略列表
 * @param {Function} oddsProvider - 获取最新 transform.php 赔率的函数，签名 (matchId) => oddsData
 * @returns {Array} 触发的策略 ID 列表
 */
export function evaluateWithGismoData(deltaData, strategies, oddsProvider) {
  if (!deltaData || !deltaData.matchId) return [];

  // 仅在数据发生时间或角球变化时才评估
  const hasRelevantChange =
    deltaData.changed === true &&
    (deltaData.changes?.timeChanged || deltaData.changes?.cornerChanged);

  if (!hasRelevantChange) return [];

  // 获取最新赔率数据
  const oddsData = oddsProvider
    ? oddsProvider(deltaData.matchId) ?? null
    : null;

  // 合并 gismo 实时数据与赔率数据，构建策略评估用的比赛对象
  const matchForEval = {
    elapsedMinutes: deltaData.elapsedMinutes,
    homeScore: deltaData.homeScore,
    awayScore: deltaData.awayScore,
    homeCorners: deltaData.homeCorners,
    awayCorners: deltaData.awayCorners,
    totalCorners: deltaData.totalCorners,
    homeTeam: deltaData.homeTeam,
    awayTeam: deltaData.awayTeam,
    matchId: deltaData.matchId,
    handicap: oddsData?.handicap ?? 0,
    odds: oddsData?.odds ?? 0,
    // 将 oddsData 中其他可用字段展开
    ...(oddsData ?? {})
  };

  const triggeredIds = [];

  for (const strategy of strategies) {
    if (!strategy.enabled) continue;

    const triggered = evaluateSingleStrategy(matchForEval, strategy);
    if (triggered) {
      triggeredIds.push(strategy.id);
      console.log(
        `[cornerStrategyEngine] 策略触发: matchId=${deltaData.matchId} strategy="${strategy.name}" @ ${deltaData.elapsedMinutes}'`
      );

      // 调用策略触发回调
      if (strategyTriggerCallback) {
        try {
          strategyTriggerCallback({
            matchId: deltaData.matchId,
            strategyId: strategy.id,
            strategyName: strategy.name,
            deltaData,
            oddsData,
            timestamp: Date.now()
          });
        } catch (err) {
          console.error('[cornerStrategyEngine] 策略触发回调执行出错:', err);
        }
      }
    }
  }

  return triggeredIds;
}

/**
 * 注册策略触发回调
 * @param {Function} callback - 回调函数，签名 ({ matchId, strategyId, strategyName, deltaData, oddsData, timestamp }) => void
 */
export function setStrategyTriggerCallback(callback) {
  strategyTriggerCallback = callback;
}

/**
 * 获取指定比赛的 gismo 实时状态
 * @param {string} matchId
 * @returns {Object|null}
 */
export function getLiveMatchState(matchId) {
  return liveMatchState.get(matchId) ?? null;
}

/**
 * 清空所有 gismo 实时比赛状态缓存
 */
export function clearLiveMatchStates() {
  liveMatchState.clear();
}

/**
 * 获取所有 gismo 实时比赛状态
 * @returns {Array}
 */
export function getGismoEnrichedMatches() {
  return Array.from(liveMatchState.values());
}

// 导出给 routes 使用
export { getSimulationRecords, getStrategyStats, saveSimulationRecord };
