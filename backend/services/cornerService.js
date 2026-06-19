import { crawlCornerMatches, getPollingStatus as getCrawlerStatus } from "./cornerCrawler.js";
import { evaluateStrategies as evaluateCornerStrategies, resolveStrategyOdds } from "./cornerEvaluator.js";
import { POLL_CONFIG } from "./crawlerConfig.js";
import { run, query } from "../dbService.js";
import { subscribeMatches, unsubscribeAll } from "./GismoSubscriber.js";
import {
  saveCornerTrigger,
  checkDuplicateBet,
  ensureBetTable,
  generatePendingBet,
  processBetQueue,
  betQueue,
  getBetConfig,
  executeAndRecordBet,
  buildBetTarget
} from "./cornerBetService.js";


// ======================== 数据源配置 ========================
const USE_REAL_DATA = process.env.USE_REAL_DATA !== "false";

// ======================== 自适应轮询常量 ========================
const POLL_FAST_MIN = 5000;
const POLL_FAST_MAX = 8000;
const POLL_SLOW_MIN = 12000;
const POLL_SLOW_MAX = 18000;
const STABLE_THRESHOLD = 3;

// ======================== 后端轮询缓存 ========================
let cachedMatches = [];
let cachedMainMarkets = {};
let pollingInterval = null;
let pollingActive = false;
let consecutiveNoChanges = 0;
let immediatePollLock = false;
let lastFetchTime = 0;
let lastEmptyLogTime = 0;
const POLL_INTERVAL = POLL_CONFIG.interval;
const CACHE_EXPIRE_MS = 30000; // 缓存过期时间：30秒

// ======================== 轮询分析统计 ========================
const pollingAnalytics = {
  sessionStartMs: Date.now(),
  totalPolls: 0,
  totalChanges: 0,
  changeIntervals: {},       // { fieldName: [intervalMs, ...] }
  avgChangeIntervalMs: {},   // { fieldName: avgMs }
  minChangeIntervalMs: {},   // { fieldName: minMs }
  maxChangeIntervalMs: {},   // { fieldName: maxMs }
  lastChangeAt: null,
  lastPollTimestamps: {}     // { matchId_field: timestamp } — track when each field last changed
};

// ======================== 策略配置 ========================
export const DEFAULT_STRATEGIES = [
  { id: 1, enabled: false, name: "策略一 · 走地角球(35'-55')", playTimeStart: 35, playTimeEnd: 55, leadGoals: 99, leadGoalsWeak: 0, cornerHandicapLower: -1.25, cornerHandicapUpper: 2.5, targetOdds: 0.8, betDirection: "over" },
  { id: 2, enabled: false, name: "策略二 · 领先比分(50'-77')", playTimeStart: 50, playTimeEnd: 77, leadGoals: 3, leadGoalsWeak: 1, cornerHandicapLower: -0.75, cornerHandicapUpper: 2.5, targetOdds: 0.8, betDirection: "over" },
  { id: 3, enabled: false, name: "策略三 · 比分平局(70'-99')", playTimeStart: 70, playTimeEnd: 99, leadGoals: 0, leadGoalsWeak: 0, cornerHandicapLower: 0, cornerHandicapUpper: 1.5, targetOdds: 0.8, betDirection: "under" },
  { id: 4, enabled: false, name: "策略四 · 领先追角(60'-99')", playTimeStart: 60, playTimeEnd: 99, leadGoals: 2, leadGoalsWeak: 1, cornerHandicapLower: 0, cornerHandicapUpper: 2.5, targetOdds: 0.8, betDirection: "over" },
  { id: 5, enabled: false, name: "策略五 · 尾声角球(70'-99')", playTimeStart: 70, playTimeEnd: 99, leadGoals: 1, leadGoalsWeak: 0, cornerHandicapLower: 0, cornerHandicapUpper: 2.5, targetOdds: 0.8, betDirection: "over" },
];

let activeStrategies = DEFAULT_STRATEGIES;

export function setCornerStrategies(strategies) {
  if (strategies && Array.isArray(strategies) && strategies.length > 0) {
    activeStrategies = strategies;
  }
}

export function getCornerStrategies() {
  return activeStrategies;
}

// ======================== 后端轮询 ========================

// ======================== 增量更新 ========================

const DELTA_FIELDS = ["elapsedMinutes", "homeScore", "awayScore", "totalCorners", "homeCorners", "awayCorners"];

function computeDelta(oldMatches, newMatches) {
  if (!oldMatches || oldMatches.length === 0) {
    return newMatches.map(m => ({ matchId: m.matchId, field: "initial", oldValue: null, newValue: null }));
  }
  const oldMap = new Map(oldMatches.map(m => [m.matchId, m]));
  const deltas = [];
  for (const nm of newMatches) {
    const om = oldMap.get(nm.matchId);
    if (!om) {
      deltas.push({ matchId: nm.matchId, field: "added", oldValue: null, newValue: null });
      continue;
    }
    for (const field of DELTA_FIELDS) {
      if (JSON.stringify(om[field]) !== JSON.stringify(nm[field])) {
        deltas.push({ matchId: nm.matchId, field, oldValue: om[field], newValue: nm[field] });
      }
    }
    if (JSON.stringify(om.cornerOU) !== JSON.stringify(nm.cornerOU)) {
      deltas.push({ matchId: nm.matchId, field: "cornerOU", oldValue: om.cornerOU, newValue: nm.cornerOU });
    }
    if (JSON.stringify(om.cornerHDP) !== JSON.stringify(nm.cornerHDP)) {
      deltas.push({ matchId: nm.matchId, field: "cornerHDP", oldValue: om.cornerHDP, newValue: nm.cornerHDP });
    }
    if (JSON.stringify(om.nextCorner) !== JSON.stringify(nm.nextCorner)) {
      deltas.push({ matchId: nm.matchId, field: "nextCorner", oldValue: om.nextCorner, newValue: nm.nextCorner });
    }
  }
  return deltas;
}

/**
 * 单次轮询辅助函数：爬取并映射数据
 */
function computeChangesAndAnalytics(newMatches) {
  const changes = computeDelta(cachedMatches, newMatches);
  const hasChanges = changes.length > 0;

  pollingAnalytics.totalPolls++;
  if (hasChanges) {
    const now = Date.now();
    for (const d of changes) {
      if (d.field === "initial" || d.field === "added") continue;
      pollingAnalytics.totalChanges++;
      const key = d.matchId + "_" + d.field;
      const lastTs = pollingAnalytics.lastPollTimestamps[key];
      if (lastTs) {
        const intervalMs = now - lastTs;
        if (!pollingAnalytics.changeIntervals[d.field]) {
          pollingAnalytics.changeIntervals[d.field] = [];
        }
        pollingAnalytics.changeIntervals[d.field].push(intervalMs);
        if (pollingAnalytics.changeIntervals[d.field].length > 100) {
          pollingAnalytics.changeIntervals[d.field] = pollingAnalytics.changeIntervals[d.field].slice(-100);
        }
        const intervals = pollingAnalytics.changeIntervals[d.field];
        pollingAnalytics.avgChangeIntervalMs[d.field] = Math.round(intervals.reduce((a, b) => a + b, 0) / intervals.length);
        pollingAnalytics.minChangeIntervalMs[d.field] = Math.min(...intervals);
        pollingAnalytics.maxChangeIntervalMs[d.field] = Math.max(...intervals);
        const oldStr = typeof d.oldValue === "object" ? JSON.stringify(d.oldValue) : String(d.oldValue);
        const newStr = typeof d.newValue === "object" ? JSON.stringify(d.newValue) : String(d.newValue);
        console.log("[cornerService] 赔率变更: matchId=" + d.matchId + " field=" + d.field + " old=" + oldStr + " new=" + newStr + " interval=" + intervalMs + "ms");
      }
      pollingAnalytics.lastPollTimestamps[key] = now;
    }
    pollingAnalytics.lastChangeAt = new Date(now).toISOString();
  }

  return { changes, hasChanges };
}

/**
 * 单次轮询辅助函数：评估策略并保存触发记录
 */
async function evaluateAndSaveTriggers(matches, hasChanges, changes) {
  const oldMatchMap = new Map(cachedMatches.map(om => [om.matchId, om]));

  if (hasChanges) {
    const changedMatchIds = [...new Set(changes.map(c => c.matchId))];
    console.log("[cornerService] 数据变化: " + changes.length + " 项, 涉及 " + changedMatchIds.length + " 场比赛, 触发策略评估");
    for (const match of matches) {
      if (changedMatchIds.includes(match.matchId)) {
        const triggeredIds = evaluateStrategies(match, activeStrategies);
        match.triggeredStrategies = triggeredIds;
        for (const sid of triggeredIds) {
          const strategy = activeStrategies.find(s => s.id === sid);
          const actualOdds = resolveStrategyOdds(match, strategy || {});
          if (actualOdds <= 0) {
            // 仍保存触发记录，标记赔率缺失，等待下次轮询赔率更新后执行投注
            console.warn(`[cornerService] 策略${sid}触发但赔率为0，保存触发记录待赔率更新, matchId=${match.matchId}`);
            saveCornerTrigger(match, sid, 0).catch(e =>
              console.error("[cornerService] 保存触发记录失败:", e.message)
            );
            continue;
          }
          saveCornerTrigger(match, sid, actualOdds).catch(e =>
            console.error("[cornerService] 保存触发记录失败:", e.message)
          );
        }
      } else {
        const oldMatch = oldMatchMap.get(match.matchId);
        match.triggeredStrategies = oldMatch?.triggeredStrategies || [];
      }
    }
  } else {
    for (const match of matches) {
      const oldMatch = oldMatchMap.get(match.matchId);
      if (oldMatch) match.triggeredStrategies = oldMatch.triggeredStrategies || [];
    }
  }
}

/**
 * 单次轮询辅助函数：自动投注处理
 */
async function processAutoBetsForMatches(matches) {
  const betConfig = getBetConfig();
  // ★ 不再提前 return：即使 isRealMode=false 或 autoBetEnabled=false，
  // 也要进入投注函数生成 skipped 记录，让用户在投注记录中看到策略触发了但未执行
  for (const match of matches) {
    if (betConfig.trackedMatchIds.length > 0 && !betConfig.trackedMatchIds.includes(match.matchId)) {
      console.log("[cornerService] 比赛不在追踪白名单中: matchId=" + match.matchId);
      continue;
    }
    const triggeredIds = match.triggeredStrategies || [];
    for (const sid of triggeredIds) {
      try {
        const isDup = await checkDuplicateBet(match.matchId, sid);
        if (isDup) {
          console.log("[cornerService] 跳过重复投注: " + match.matchId + " 策略" + sid);
          continue;
        }

        if (betConfig.autoBetConfirmRequired) {
          // 二次确认开启：走原有 generatePendingBet → betQueue → processBetQueue 流程
          await ensureBetTable();
          const existingBet = await query(
            "SELECT id FROM corner_bets WHERE match_id = ? AND strategy_id = ?",
            [match.matchId || "", String(sid)]
          );
          if (existingBet && existingBet.length > 0) {
            console.log("[cornerService] 已有投注记录，跳过入队: " + match.matchId + " 策略" + sid);
            continue;
          }
          const strategy = activeStrategies.find(s => s.id === sid);
          const betDir = strategy?.betDirection || "auto";
          const actualOdds = resolveStrategyOdds(match, strategy || {});
          if (actualOdds <= 0) {
            console.warn(`[cornerService] 策略${sid}触发但赔率为0，跳过投注, matchId=${match.matchId}`);
            continue;
          }
          match.betTarget = buildBetTarget(betDir, match.cornerHandicap || 0);
          const genResult = await generatePendingBet(match, sid, actualOdds);
          if (genResult.success && !genResult.skipped) {
            betQueue.push({
              betId: genResult.id,
              historyId: null,
              matchId: match.matchId,
              matchName: match.matchName || "",
              strategyId: sid,
              odds: actualOdds,
              amount: betConfig.amount,
              handicap: match.cornerHandicap || 0,
              betDirection: betDir
            });
          }
        } else {
          // 二次确认关闭：直接执行投注并记录最终状态
          const strategy = activeStrategies.find(s => s.id === sid);
          const actualOdds = resolveStrategyOdds(match, strategy || {});
          if (actualOdds <= 0) {
            console.warn(`[cornerService] 策略${sid}触发但赔率为0，跳过直接执行投注, matchId=${match.matchId}`);
            continue;
          }
          await executeAndRecordBet(match, sid, strategy?.betDirection || "auto", actualOdds);
        }
      } catch (e) {
        console.error("[cornerService] 投注处理失败:", e.message);
      }
    }
  }
  // 仅二次确认开启时才需要处理队列
  if (betConfig.autoBetConfirmRequired) {
    processBetQueue().catch(e =>
      console.error("[cornerService] 投注队列处理失败:", e.message)
    );
  }
}

/**
 * 单次轮询核心逻辑
 * ★ 修复：单次爬取失败时不暂停轮询，保留缓存数据
 *   仅在连续失败 3 次且缓存为空时才暂停
 */
async function pollOnce() {
  const result = await crawlCornerMatches();

  if (!result.success) {
    consecutiveFailures++;
    console.warn("[cornerService] 单次爬取失败 (" + consecutiveFailures + "次), 错误: " + (result.error || "unknown"));
    // 连续失败 ≥2 且缓存为空才暂停（避免频繁无意义爬取）
    if (consecutiveFailures >= 2 && cachedMatches.length === 0) {
      console.log("[cornerService] 连续失败且无缓存，轮询已暂停");
      pauseCornerBackendPolling();
    }
    return;
  }

  const rawMatches = result.data?.matches || [];
  const mainMarkets = result.mainMarkets || {};
  const matches = rawMatches.map(mapMatchToCornerFormat);

  const { changes, hasChanges } = computeChangesAndAnalytics(matches);
  await evaluateAndSaveTriggers(matches, hasChanges, changes);

  cachedMatches = matches;
  cachedMainMarkets = mainMarkets;
  lastFetchTime = Date.now();
  consecutiveFailures = 0;

  // gismo 订阅：提取 matchId 列表并订阅实时数据
  const matchIds = cachedMatches.map(m => m.matchId).filter(Boolean);
  if (matchIds.length > 0) {
    const { getSharedPage } = await import("./browserPool.js");
    const sharedPage = getSharedPage();
    if (sharedPage) {
      subscribeMatches(matchIds, (deltaData) => {
        // gismo 回调：更新 cachedMatches 中的实时数据
        const match = cachedMatches.find(m => m.matchId === deltaData.matchId);
        if (match) {
          if (deltaData.elapsedMinutes !== undefined) match.elapsedMinutes = deltaData.elapsedMinutes;
          if (deltaData.homeScore !== undefined) match.homeScore = deltaData.homeScore;
          if (deltaData.awayScore !== undefined) match.awayScore = deltaData.awayScore;
          if (deltaData.totalCorners !== undefined) {
            match.totalCorners = deltaData.totalCorners;
            match.homeCorners = deltaData.homeCorners || 0;
            match.awayCorners = deltaData.awayCorners || 0;

            // ★ 角球数变化时立即触发策略评估和自动投注
            const triggeredIds = evaluateCornerStrategies(match, activeStrategies);
            if (triggeredIds.length > 0) {
              match.triggeredStrategies = triggeredIds;
              console.log(`[cornerService] gismo 角球变化触发策略评估: matchId=${match.matchId}, 触发策略=[${triggeredIds.join(',')}]`);
              // 保存触发记录
              for (const sid of triggeredIds) {
                const strategy = activeStrategies.find(s => s.id === sid);
                const actualOdds = resolveStrategyOdds(match, strategy || {});
                if (actualOdds > 0) {
                  saveCornerTrigger(match, sid, actualOdds).catch(e =>
                    console.error("[cornerService] gismo触发保存记录失败:", e.message)
                  );
                }
              }
              // 触发自动投注
              processAutoBetsForMatches([match]).catch(e =>
                console.error("[cornerService] gismo触发自动投注失败:", e.message)
              );
            }
          }
          console.log(`[cornerService] gismo 更新: ${match.homeTeam} vs ${match.awayTeam}, ${deltaData.elapsedMinutes}'`);
        }
      }, sharedPage);
    }
  }

  console.log("[cornerService] 轮询更新: " + matches.length + " 场比赛, mainMarkets: " + Object.keys(mainMarkets).length);
  if (matches.length > 0 && !pollingFirstDone) {
    pollingFirstDone = true;
    console.log("[cornerService] 首次爬取完成，缓存已就绪");
  }

  await processAutoBetsForMatches(matches);
  return { hasChanges };
}

/**
 * 计算自适应轮询间隔（毫秒）
 * @param {boolean} hasChanges - 本轮是否有数据变化
 * @returns {number} 下次轮询延迟
 */
function adaptPollingInterval(hasChanges) {
  if (hasChanges) {
    consecutiveNoChanges = 0;
    return POLL_FAST_MIN + Math.random() * (POLL_FAST_MAX - POLL_FAST_MIN);
  }
  consecutiveNoChanges++;
  if (consecutiveNoChanges >= STABLE_THRESHOLD) {
    return POLL_SLOW_MIN + Math.random() * (POLL_SLOW_MAX - POLL_SLOW_MIN);
  }
  return POLL_FAST_MIN + Math.random() * (POLL_FAST_MAX - POLL_FAST_MIN);
}

/**
 * 公共轮询调度函数 — 自适应间隔 + start/resume 复用
 */
function scheduleNextPoll() {
  const poll = async () => {
    if (!pollingActive || pollingPaused) return;
    let hasChanges = false;
    try {
      const result = await pollOnce();
      hasChanges = result?.hasChanges ?? false;
    } catch (e) {
      console.error("[cornerService] 轮询错误:", e.message);
      consecutiveFailures++;
      if (consecutiveFailures >= ALERT_THRESHOLD) {
        console.error("[cornerService] 告警: 连续 " + consecutiveFailures + " 次爬取失败!");
        lastAlertTime = new Date().toISOString();
      }
      if (consecutiveFailures >= 2 && cachedMatches.length === 0) {
        console.log("[cornerService] 连续失败且无缓存，轮询已暂停");
        pauseCornerBackendPolling();
        return;
      }
    }
    if (pollingActive && !pollingPaused) {
      const interval = adaptPollingInterval(hasChanges);
      pollingInterval = setTimeout(poll, interval);
    }
  };
  poll();
}

/**
 * 即时轮询 — 供外部事件调用，取消 pending 定时器并立即执行
 */
async function triggerImmediatePoll() {
  if (!pollingActive || pollingPaused) return;
  if (immediatePollLock) return;
  immediatePollLock = true;
  try {
    if (pollingInterval) {
      clearTimeout(pollingInterval);
      pollingInterval = null;
    }
    await pollOnce();
  } catch (e) {
    console.error("[cornerService] 即时轮询错误:", e.message);
  } finally {
    immediatePollLock = false;
  }
  if (pollingActive && !pollingPaused) {
    scheduleNextPoll();
  }
}

/**
 * 实时事件钩子 — 供未来 WebSocket/Gismo 集成调用
 * @param {Object} eventData - 实时事件数据（预留）
 */
export function onLiveEvent(eventData) {
  console.log("[cornerService] 收到实时事件，触发即时轮询:", JSON.stringify(eventData).substring(0, 200));
  triggerImmediatePoll().catch(e =>
    console.error("[cornerService] 即时轮询失败:", e.message)
  );
}

export function startCornerBackendPolling() {
  if (pollingActive) {
    console.log("[cornerService] 轮询已在运行中");
    return { success: true, message: "already polling" };
  }

  console.log("[cornerService] 启动后端轮询 (间隔=" + POLL_INTERVAL + "ms)...");
  pollingActive = true;
  pollingPaused = false;
  consecutiveFailures = 0;

  scheduleNextPoll();
  return { success: true, interval: POLL_INTERVAL };
}

export function stopCornerBackendPolling() {
  if (!pollingActive) {
    return { success: true, message: "not polling" };
  }
  console.log("[cornerService] 停止后端轮询...");
  unsubscribeAll();
  pollingActive = false;
  if (pollingInterval) {
    clearTimeout(pollingInterval);
    pollingInterval = null;
  }
  cachedMatches = [];
  cachedMainMarkets = {};
  return { success: true };
}

// ======================== 暂停/恢复轮询 ========================
let pollingPaused = false;
let pollingFirstDone = false;
let pauseTime = null;

// ======================== 告警状态 ========================
let consecutiveFailures = 0;
const ALERT_THRESHOLD = 5;
let lastAlertTime = null;

export function getAlertStatus() {
  return {
    consecutiveFailures,
    alertActive: consecutiveFailures >= ALERT_THRESHOLD,
    lastAlertTime,
    threshold: ALERT_THRESHOLD
  };
}

export function getPollingAnalytics() {
  // Calculate recommendation based on data
  let recommendation = POLL_INTERVAL;
  const allIntervals = Object.values(pollingAnalytics.changeIntervals).flat();
  if (allIntervals.length >= 3) {
    const avgAll = allIntervals.reduce((a, b) => a + b, 0) / allIntervals.length;
    recommendation = Math.max(3000, Math.round(avgAll * 0.5 / 1000) * 1000); // round to nearest second, min 3s
  }
  return {
    ...pollingAnalytics,
    currentPollInterval: POLL_INTERVAL,
    recommendation,
    sessionDurationMs: Date.now() - pollingAnalytics.sessionStartMs
  };
}

export function pauseCornerBackendPolling() {
  if (!pollingActive) {
    return { success: true, message: "轮询未在运行，无需暂停" };
  }
  if (pollingPaused) {
    return { success: true, message: "already paused" };
  }
  console.log("[cornerService] 暂停后端轮询...");
  unsubscribeAll();
  pollingPaused = true;
  pauseTime = Date.now();
  if (pollingInterval) {
    clearTimeout(pollingInterval);
    pollingInterval = null;
  }
  return { success: true, paused: true, pausedAt: new Date(pauseTime).toISOString() };
}

export function resumeCornerBackendPolling() {
  if (!pollingActive) {
    return { success: false, message: "轮询未在运行，无法恢复" };
  }
  if (!pollingPaused) {
    return { success: true, message: "轮询未暂停" };
  }
  console.log("[cornerService] 恢复后端轮询...");
  pollingPaused = false;
  consecutiveFailures = 0;
  const pausedDuration = pauseTime ? Date.now() - pauseTime : 0;
  pauseTime = null;

  scheduleNextPoll();
  return { success: true, paused: false, pausedDuration };
}

export function getBackendPollingStatus() {
  return {
    isPolling: pollingActive,
    isPaused: pollingPaused,
    pausedReason: pollingPaused ? "no_matches" : null,
    cachedCount: cachedMatches.length,
    cachedMainMarketCount: Object.keys(cachedMainMarkets).length,
    lastPollInterval: POLL_INTERVAL,
    pausedAt: pauseTime ? new Date(pauseTime).toISOString() : null
  };
}


// ======================== 数据格式映射 ========================
function mapMatchToCornerFormat(match) {
  return {
    matchId: match.matchId || "",
    matchName: match.matchName || ((match.homeTeam && match.awayTeam) ? match.homeTeam + " vs " + match.awayTeam : "未知比赛"),
    homeTeam: match.homeTeam || "",
    awayTeam: match.awayTeam || "",
    league: match.league || "",
    time: match.time || "",
    elapsedMinutes: match.elapsedMinutes || 0,
    homeScore: match.homeScore || 0,
    awayScore: match.awayScore || 0,
    totalCorners: match.totalCorners || 0,
    homeCorners: match.homeCorners || 0,
    awayCorners: match.awayCorners || 0,
    cornerHandicap: match.cornerHandicap != null ? parseFloat(match.cornerHandicap) : 0,
    cornerOdds: match.cornerOdds != null ? parseFloat(match.cornerOdds) : 0,
    cornerOU: match.cornerOU || null,
    handicaps: match.handicaps || [],
    timestamp: match.timestamp || Date.now(),
    triggeredStrategies: match.triggeredStrategies || [],
    _dataSource: match._dataSource || "",
    _cornerSource: match._cornerSource || ""
  };
}

// ======================== 获取实时角球数据 ========================
export async function getLiveCornerData(filterMatchId) {
  const generatedAt = new Date().toISOString();

  // 检查缓存是否有效（有数据且未过期）
  const now = Date.now();
  const isCacheValid = cachedMatches.length > 0 && (now - lastFetchTime) < CACHE_EXPIRE_MS;

  if (isCacheValid) {
    // ★ 返回前重新评估策略（确保使用最新的 activeStrategies）
    for (const m of cachedMatches) {
      m.triggeredStrategies = evaluateCornerStrategies(m, activeStrategies);
    }
    const filtered = filterMatchId
      ? cachedMatches.filter(m => m.matchId === filterMatchId || m.homeTeam + "_vs_" + m.awayTeam === filterMatchId)
      : cachedMatches;
    console.log(`[cornerService] 返回缓存数据（${filtered.length}场），缓存年龄: ${Math.floor((now - lastFetchTime) / 1000)}秒`);
    return { data: filtered, generatedAt, count: filtered.length, cacheAge: now - lastFetchTime, mainMarkets: cachedMainMarkets };
  }

  // 缓存无效或为空，检查是否正在轮询中
  if (pollingActive && cachedMatches.length > 0) {
    // ★ 返回前重新评估策略（确保使用最新的 activeStrategies）
    for (const m of cachedMatches) {
      m.triggeredStrategies = evaluateCornerStrategies(m, activeStrategies);
    }
    // 轮询正在进行中，返回旧缓存但标记为过期
    console.log(`[cornerService] 返回即将刷新的缓存数据（${cachedMatches.length}场），等待轮询更新...`);
    const filtered = filterMatchId
      ? cachedMatches.filter(m => m.matchId === filterMatchId || m.homeTeam + "_vs_" + m.awayTeam === filterMatchId)
      : cachedMatches;
    return { data: filtered, generatedAt, count: filtered.length, cacheExpired: true, mainMarkets: cachedMainMarkets };
  }
  // 无缓存时直接返回空（不自动触发爬虫，由轮询/即时爬取入口负责）
  // 标记 cacheEmpty 让前端知道需要启动监控
  // ★ 即使角球缓存为空，也返回 mainMarkets（让球大小数据可能有效）
  // ★ 有 mainMarkets 数据时不标记 cacheEmpty，让前端正常展示
  if (Object.keys(cachedMainMarkets).length > 0) {
    console.log("[cornerService] 角球缓存为空，但 mainMarkets 有 " + Object.keys(cachedMainMarkets).length + " 场数据");
    return { data: [], generatedAt, count: 0, mainMarkets: cachedMainMarkets };
  }
  // 限频日志：每30秒最多打印一次"无有效数据"，避免刷屏
  const logNow = Date.now();
  if (!lastEmptyLogTime || logNow - lastEmptyLogTime > 30000) {
    lastEmptyLogTime = logNow;
    console.log("[cornerService] 无有效数据，返回空");
  }
  return { data: [], generatedAt, count: 0, cacheEmpty: true };
}

// ======================== 策略评估引擎（委托给共享模块 cornerEvaluator.js） ========================
// 前端统一使用后端 API 返回的 triggeredStrategies，不再本地评估
export function evaluateStrategies(match, strategies) {
  return evaluateCornerStrategies(match, strategies);
}
