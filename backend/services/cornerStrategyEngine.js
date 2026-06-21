import {
  saveSimulationRecord,
  getSimulationRecords,
  getStrategyStats
} from './cornerBetService.js';
import { run, query } from '../dbService.js';
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
  // Step 1: 运行前清除历史模拟记录
  try {
    await run("DELETE FROM corner_simulation_records");
    console.log("[cornerStrategyEngine] 已清除历史模拟记录");
  } catch (e) {
    console.warn("[cornerStrategyEngine] 清除模拟记录失败（表可能不存在）:", e.message);
  }

  // Step 2: 查询真实历史投注记录
  let useRealData = false;
  let realRecords = [];
  try {
    realRecords = await query(
      "SELECT strategy_id, bet_status, odds, amount FROM corner_history WHERE bet_status IN ('executed', 'failed')"
    ) || [];
    useRealData = realRecords.length >= 10;
    console.log(`[cornerStrategyEngine] 真实历史记录: ${realRecords.length} 条, ${useRealData ? '使用真实数据' : '回退到模拟数据'}`);
  } catch (e) {
    console.warn("[cornerStrategyEngine] 查询真实记录失败:", e.message);
  }

  const statsMap = {};

  if (useRealData) {
    // 基于真实历史记录计算统计
    for (const strategy of strategies) {
      if (!strategy.enabled) continue;
      const sid = String(strategy.id);
      const strategyRecords = realRecords.filter(r => String(r.strategy_id) === sid);

      const executed = strategyRecords.filter(r => r.bet_status === 'executed').length;
      const failed = strategyRecords.filter(r => r.bet_status === 'failed').length;
      const triggered = executed + failed;

      let totalProfit = 0;
      for (const r of strategyRecords) {
        // 仅 executed 状态影响盈亏计算，failed 状态排除在外（既不算盈也不算亏）
        if (r.bet_status === 'executed') {
          totalProfit += (r.odds - 1) * (r.amount || 100);
        }
      }

      const winRate = triggered > 0 ? Math.round((executed / triggered) * 100 * 100) / 100 : 0;
      const roi = triggered > 0 ? Math.round((totalProfit / (triggered * 100)) * 100 * 100) / 100 : 0;

      statsMap[sid] = {
        strategyId: sid,
        strategyName: strategy.name,
        triggered,
        executed,
        failed,
        successRate: winRate,
        totalProfit: Math.round(totalProfit * 100) / 100,
        roi
      };
    }

    console.log('[cornerStrategyEngine] 真实数据回测完成，策略数:', Object.keys(statsMap).length);
    return {
      success: true,
      simulated: false,
      dataSource: 'real',
      stats: statsMap,
      totalRecords: realRecords.length
    };
  }

  // Fallback: 模拟数据回测
  const MATCH_COUNT = 80;
  console.log(`[cornerStrategyEngine] 真实记录不足，生成 ${MATCH_COUNT} 场模拟比赛...`);

  const simulatedMatches = [];
  for (let i = 0; i < MATCH_COUNT; i++) {
    simulatedMatches.push(generateSimulatedMatch());
  }

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

  console.log('[cornerStrategyEngine] 模拟回测完成，策略数:', Object.keys(statsMap).length);
  return {
    success: true,
    simulated: true,
    dataSource: 'simulated',
    warning: "回测数据为随机模拟生成，不代表真实比赛结果，仅供策略逻辑验证参考",
    stats: statsMap,
    totalMatches: MATCH_COUNT
  };
}

// 导出给 routes 使用
export { getSimulationRecords, getStrategyStats, saveSimulationRecord };
