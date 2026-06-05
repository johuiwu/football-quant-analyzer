import { crawlCornerMatches, getPollingStatus as getCrawlerStatus } from "./cornerCrawler.js";
import { evaluateStrategies as evaluateCornerStrategies } from "./cornerEvaluator.js";
import { executeBet as executeBetOnHG, sleep } from "./cornerBetExecutor.js";

// ======================== 数据源配置 ========================
const USE_REAL_DATA = process.env.USE_REAL_DATA !== "false";

// ======================== 后端轮询缓存 ========================
let cachedMatches = [];
let cachedMainMarkets = {};
let pollingInterval = null;
let pollingActive = false;
let lastFetchTime = 0;
const POLL_INTERVAL = parseInt(process.env.CRAWLER_POLL_INTERVAL || "15000", 10); // 调整为15秒
const CACHE_EXPIRE_MS = 30000; // 缓存过期时间：30秒

// ======================== 策略配置 ========================
export const DEFAULT_STRATEGIES = [
  { id: 1, enabled: false, name: "策略一 · 走地角球(35'-55')", playTimeStart: 35, playTimeEnd: 55, leadGoals: 99, leadGoalsWeak: 0, cornerHandicapLower: -1.25, cornerHandicapUpper: 2.5, targetOdds: 0.8, betDirection: "over" },
  { id: 2, enabled: false, name: "策略二 · 领先角球(50'-77')", playTimeStart: 50, playTimeEnd: 77, leadGoals: 3, leadGoalsWeak: 1, cornerHandicapLower: -0.75, cornerHandicapUpper: 2.5, targetOdds: 0.8, betDirection: "over" },
  { id: 3, enabled: false, name: "策略三 · 平局角球(70'-99')", playTimeStart: 70, playTimeEnd: 99, leadGoals: 0, leadGoalsWeak: 0, cornerHandicapLower: 0, cornerHandicapUpper: 1.5, targetOdds: 0.8, betDirection: "under" },
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

// ======================== 投注配置 ========================
let betConfig = {
  amount: parseInt(process.env.CORNER_BET_AMOUNT || "100", 10),
  isRealMode: process.env.CORNER_BET_REAL_MODE === "true",
  trackedMatchIds: [],
  autoBetEnabled: false,
  autoBetConfirmRequired: false  // ★ 二次确认：true 时投注需用户手动确认
};

export function getAutoBetConfig() { return { ...betConfig, autoBetMasterSwitch: true }; }

export function setBetConfig(config) {
  if (config) {
    betConfig = { ...betConfig, ...config };
  }
}

// ======================== 自动投注配置 ========================
const MAX_BET_AMOUNT = parseInt(process.env.MAX_BET_AMOUNT || "1000", 10);

export function getMaxBetAmount() { return MAX_BET_AMOUNT; }

export function getBetConfig() {
  return betConfig;
}

// ======================== 后端轮询 ========================

/**
 * 单次轮询核心逻辑（内部函数，消除 start/resume 中的重复代码）
 */
async function pollOnce() {
  const result = await crawlCornerMatches();
  const rawMatches = result.success ? (result.data?.matches || []) : [];
  const mainMk = result.mainMarkets || {};
  const matches = rawMatches.map(mapMatchToCornerFormat);

  // 策略评估：对每场比赛评估所有活跃策略
  for (const match of matches) {
    const triggeredIds = evaluateStrategies(match, activeStrategies);
    match.triggeredStrategies = triggeredIds;
    for (const sid of triggeredIds) {
      saveCornerTrigger(match, sid).catch(e =>
        console.error("[cornerService] 保存触发记录失败:", e.message)
      );
    }
  }

  cachedMatches = matches;
  cachedMainMarkets = mainMk || {};
  lastFetchTime = Date.now();

  // 无比赛且无主盘口数据时自动暂停轮询，避免反复登录
  if (matches.length === 0 && Object.keys(mainMk).length === 0) {
    console.log("[cornerService] 暂无比赛，轮询已暂停");
    pauseCornerBackendPolling();
    return;
  }

  consecutiveFailures = 0;
  console.log("[cornerService] 轮询更新: " + matches.length + " 场比赛, mainMarkets: " + Object.keys(mainMk).length);
  if (matches.length > 0 && !pollingFirstDone) {
    pollingFirstDone = true;
    console.log("[cornerService] 首次爬取完成，缓存已就绪");
  }

  // 自动投注：策略触发后入队处理（需 UI开关 + 白名单非空）
  if (betConfig.isRealMode && betConfig.autoBetEnabled) {
    for (const match of matches) {
      if (betConfig.trackedMatchIds.length === 0 || !betConfig.trackedMatchIds.includes(match.matchId)) continue;
      const triggeredIds = evaluateStrategies(match, activeStrategies);
      match.triggeredStrategies = triggeredIds;
      for (const sid of triggeredIds) {
        try {
          const isDup = await checkDuplicateBet(match.matchId, sid);
          if (isDup) {
            console.log("[cornerService] 跳过重复投注: " + match.matchId + " 策略" + sid);
            continue;
          }
          const genResult = await generatePendingBet(match, sid);
          if (genResult.success && !genResult.skipped) {
            betQueue.push({
              betId: genResult.id,
              historyId: null,
              matchId: match.matchId,
              matchName: match.matchName || "",
              strategyId: sid,
              odds: match.cornerOdds || 0,
              amount: betConfig.amount,
              handicap: match.cornerHandicap || 0
            });
          }
        } catch (e) {
          console.error("[cornerService] 投注入队失败:", e.message);
        }
      }
    }
    processBetQueue().catch(e =>
      console.error("[cornerService] 投注队列处理失败:", e.message)
    );
  }
}

export function startCornerBackendPolling() {
  if (pollingActive) {
    console.log("[cornerService] 轮询已在运行中");
    return { success: true, message: "already polling" };
  }

  console.log("[cornerService] 启动后端轮询 (间隔=" + POLL_INTERVAL + "ms)...");
  pollingActive = true;
  pollingPaused = false;

  const poll = async () => {
    if (!pollingActive || pollingPaused) return;
    try {
      await pollOnce();
    } catch (e) {
      console.error("[cornerService] 轮询错误:", e.message);
      consecutiveFailures++;
      if (consecutiveFailures >= ALERT_THRESHOLD) {
        console.error("[cornerService] 告警: 连续 " + consecutiveFailures + " 次爬取失败!");
        lastAlertTime = new Date().toISOString();
      }
    }
    if (pollingActive && !pollingPaused) {
      pollingInterval = setTimeout(poll, POLL_INTERVAL);
    }
  };

  poll();
  return { success: true, interval: POLL_INTERVAL };
}

export function stopCornerBackendPolling() {
  if (!pollingActive) {
    return { success: true, message: "not polling" };
  }
  console.log("[cornerService] 停止后端轮询...");
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

export function pauseCornerBackendPolling() {
  if (!pollingActive) {
    return { success: true, message: "轮询未在运行，无需暂停" };
  }
  if (pollingPaused) {
    return { success: true, message: "already paused" };
  }
  console.log("[cornerService] 暂停后端轮询...");
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
  const pausedDuration = pauseTime ? Date.now() - pauseTime : 0;
  pauseTime = null;

  const poll = async () => {
    if (!pollingActive || pollingPaused) return;
    try {
      await pollOnce();
    } catch (e) {
      console.error("[cornerService] 轮询错误:", e.message);
      consecutiveFailures++;
      if (consecutiveFailures >= ALERT_THRESHOLD) {
        console.error("[cornerService] 告警: 连续 " + consecutiveFailures + " 次爬取失败!");
        lastAlertTime = new Date().toISOString();
      }
    }
    if (pollingActive && !pollingPaused) {
      pollingInterval = setTimeout(poll, POLL_INTERVAL);
    }
  };
  poll();
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
    handicaps: match.handicaps || [],
    timestamp: match.timestamp || Date.now(),
    triggeredStrategies: match.triggeredStrategies || []
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
  console.log("[cornerService] 无有效数据，返回空");
  return { data: [], generatedAt, count: 0, cacheEmpty: true };
}

// ======================== 策略评估引擎（委托给共享模块 cornerEvaluator.js） ========================
// 前端统一使用后端 API 返回的 triggeredStrategies，不再本地评估
export function evaluateStrategies(match, strategies) {
  return evaluateCornerStrategies(match, strategies);
}

// ======================== 历史记录存储 ========================
import { run, query } from "../dbService.js";

let tablePromise = null;

async function ensureTable() {
  console.warn("[cornerService] 运行时建表已弃用（corner_history/corner_bets），请通过迁移系统管理表结构。");
  if (tablePromise) return tablePromise;
  tablePromise = (async () => {
    try {
      await run("CREATE TABLE IF NOT EXISTS corner_history (id INTEGER PRIMARY KEY AUTOINCREMENT, match_id TEXT NOT NULL, match_name TEXT, strategy_id TEXT, triggered_at TEXT, bet_status TEXT DEFAULT 'pending', odds REAL, amount INTEGER DEFAULT 0, created_at TEXT DEFAULT CURRENT_TIMESTAMP)");
      await run("CREATE INDEX IF NOT EXISTS idx_corner_history_match ON corner_history(match_id)");
      await run("CREATE INDEX IF NOT EXISTS idx_corner_history_time ON corner_history(created_at)");
    } catch (err) { console.warn("[cornerService] table error:", err.message); }
  })();
  return tablePromise;
}

let betTablePromise = null;

async function ensureBetTable() {
  console.warn("[cornerService] 运行时建表已弃用（corner_bets），请通过迁移系统管理表结构。");
  if (betTablePromise) return betTablePromise;
  betTablePromise = (async () => {
    try {
      await run("CREATE TABLE IF NOT EXISTS corner_bets (id INTEGER PRIMARY KEY AUTOINCREMENT, match_id TEXT NOT NULL, match_name TEXT, strategy_id TEXT, odds REAL, amount INTEGER DEFAULT 0, status TEXT DEFAULT 'pending', error_message TEXT, executed_at TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP)");
      await run("CREATE INDEX IF NOT EXISTS idx_corner_bets_status ON corner_bets(status)");
      await run("CREATE INDEX IF NOT EXISTS idx_corner_bets_match ON corner_bets(match_id)");
    } catch (err) { console.warn("[cornerService] corner_bets table error:", err.message); }
  })();
  return betTablePromise;
}

export async function saveCornerHistory(record) {
  await ensureTable();
  try {
    const result = await run(
      "INSERT INTO corner_history (match_id, match_name, strategy_id, triggered_at, bet_status, odds, amount) VALUES (?, ?, ?, ?, ?, ?, ?)",
      [record.match_id || "", record.match_name || "", record.strategy_id || "", new Date().toISOString(), record.bet_status || "pending", record.odds || 0, record.amount || 0]
    );
    return { success: true, id: result.lastID };
  } catch (err) { return { success: false, error: err.message }; }
}

export async function saveCornerTrigger(match, strategyId) {
  return saveCornerHistory({
    match_id: match.matchId || "",
    match_name: match.matchName || "",
    strategy_id: String(strategyId),
    odds: match.cornerOdds || 0,
    bet_status: "pending"
  });
}

// ======================== 待执行投注 ========================
export async function generatePendingBet(match, strategyId) {
  await ensureBetTable();
  try {
    // 去重：同一 match + strategy 组合已有 pending 记录时跳过
    const existing = await query(
      "SELECT id FROM corner_bets WHERE match_id = ? AND strategy_id = ? AND status = 'pending'",
      [match.matchId || "", String(strategyId)]
    );
    if (existing && existing.length > 0) {
      return { success: true, skipped: true, reason: "duplicate pending" };
    }

    const result = await run(
      "INSERT INTO corner_bets (match_id, match_name, strategy_id, odds, amount, status) VALUES (?, ?, ?, ?, ?, 'pending')",
      [match.matchId || "", match.matchName || "", String(strategyId), match.cornerOdds || 0, betConfig.amount]
    );
    return { success: true, id: result.lastID };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

// ======================== 投注队列 ========================
let betQueue = [];
let isProcessing = false;

/**
 * 检查是否已有同一比赛同一策略的成功/失败投注记录（查 corner_history 表 executed/failed 状态）
 */
export async function checkDuplicateBet(matchId, strategyId) {
  await ensureTable();
  try {
    const rows = await query(
      "SELECT id FROM corner_history WHERE match_id = ? AND strategy_id = ? AND bet_status IN ('executed', 'failed')",
      [matchId, String(strategyId)]
    );
    return rows && rows.length > 0;
  } catch (err) {
    console.error("[cornerService] 查重失败:", err.message);
    return false;
  }
}

/**
 * 处理投注队列中的任务（每次处理 1 个）
 */
async function processBetQueue() {
  if (isProcessing || betQueue.length === 0) return;
  isProcessing = true;

  try {
    const task = betQueue.shift();

    // ★ 二次确认：开启后投注进入 pending_confirm 状态，等待用户手动确认
    if (betConfig.autoBetConfirmRequired) {
      console.log("[cornerService] 二次确认模式: bet#" + task.betId + " " + task.matchName + " 等待用户确认");
      await run(
        "UPDATE corner_bets SET status = 'pending_confirm' WHERE id = ?",
        [task.betId]
      );
      if (task.historyId) {
        await run(
          "UPDATE corner_history SET bet_status = 'pending_confirm' WHERE id = ?",
          [task.historyId]
        ).catch(() => {});
      } else {
        await run(
          "UPDATE corner_history SET bet_status = 'pending_confirm' WHERE match_id = ? AND strategy_id = ? AND bet_status = 'pending'",
          [task.matchId, String(task.strategyId)]
        ).catch(() => {});
      }
      isProcessing = false;
      return;
    }

    console.log("[cornerService] 执行投注: bet#" + task.betId + " " + task.matchName);

    const betData = {
      matchName: task.matchName,
      matchId: task.matchId,
      odds: task.odds,
      amount: task.amount,
      handicap: task.handicap || 0,
      strategyId: String(task.strategyId)
    };

    const result = await executeBetOnHG(betData);

    if (result.success) {
      await run(
        "UPDATE corner_bets SET status = 'executed', executed_at = ? WHERE id = ?",
        [new Date().toISOString(), task.betId]
      );
      if (task.historyId) {
        await run(
          "UPDATE corner_history SET bet_status = 'executed' WHERE id = ?",
          [task.historyId]
        ).catch(() => {});
      } else {
        await run(
          "UPDATE corner_history SET bet_status = 'executed' WHERE match_id = ? AND strategy_id = ? AND bet_status = 'pending'",
          [task.matchId, String(task.strategyId)]
        ).catch(() => {});
      }
    } else {
      await run(
        "UPDATE corner_bets SET status = 'failed', error_message = ? WHERE id = ?",
        [result.error || "unknown", task.betId]
      );
      if (task.historyId) {
        await run(
          "UPDATE corner_history SET bet_status = 'failed', error_message = ? WHERE id = ?",
          [result.error || "unknown", task.historyId]
        ).catch(() => {});
      } else {
        await run(
          "UPDATE corner_history SET bet_status = 'failed' WHERE match_id = ? AND strategy_id = ? AND bet_status = 'pending'",
          [task.matchId, String(task.strategyId)]
        ).catch(() => {});
      }
    }
  } catch (err) {
    console.error("[cornerService] 自动投注失败:", err.message);
  } finally {
    isProcessing = false;
  }
}

/**
 * 手动投注 API —— 创建投注记录并加入队列
 */
export async function addManualBet(matchData) {
  const { matchId, matchName, strategyId, odds, handicap, amount } = matchData;

  if (amount > MAX_BET_AMOUNT) {
    return { success: false, error: "投注金额超限 (" + MAX_BET_AMOUNT + ")" };
  }

  const isDuplicate = await checkDuplicateBet(matchId, strategyId);
  if (isDuplicate) {
    return { success: false, error: "该比赛/策略已有执行记录" };
  }

  await ensureBetTable();
  const result = await run(
    "INSERT INTO corner_bets (match_id, match_name, strategy_id, odds, amount, status) VALUES (?, ?, ?, ?, ?, 'pending')",
    [matchId, matchName || "", String(strategyId), odds || 0, amount]
  );

  const historyResult = await saveCornerHistory({
    match_id: matchId,
    match_name: matchName || "",
    strategy_id: String(strategyId),
    odds: odds || 0,
    amount: amount,
    bet_status: "pending"
  }).catch(() => ({}));

  betQueue.push({
    betId: result.lastID,
    historyId: historyResult?.id || null,
    matchId,
    matchName: matchName || "",
    strategyId,
    odds: odds || 0,
    amount,
    handicap: handicap || 0
  });

  if (betConfig.isRealMode) {
    processBetQueue().catch(e =>
      console.error("[cornerService] 投注队列处理失败:", e.message)
    );
  }

  return { success: true, betId: result.lastID };
}

/**
 * 调用 cornerBetExecutor 执行投注
 */
async function placeBetOnHG(bet) {
  if (!betConfig.isRealMode) {
    console.log("[cornerService] 模拟模式跳过实际投注 bet#" + bet.id);
    return { success: true };
  }

  const betData = {
    matchName: bet.match_name,
    matchId: bet.match_id,
    odds: bet.odds,
    amount: bet.amount,
    strategyId: String(bet.strategy_id || "")
  };

  return await executeBetOnHG(betData);
}

export async function executePendingBets() {
  await ensureBetTable();
  let pendingBets;
  try {
    pendingBets = await query(
      "SELECT * FROM corner_bets WHERE status = 'pending' ORDER BY id ASC"
    );
  } catch (err) {
    console.error("[cornerService] 查询待投注失败:", err.message);
    return { success: false, error: err.message };
  }

  if (!pendingBets || pendingBets.length === 0) {
    return { success: true, executed: 0, queued: 0 };
  }

  console.log("[cornerService] 将 " + pendingBets.length + " 条待投注入队...");

  let queued = 0;
  for (const bet of pendingBets) {
    // 检查是否已在队列中，避免重复
    if (!betQueue.some(t => t.betId === bet.id)) {
      betQueue.push({
        betId: bet.id,
        matchId: bet.match_id,
        matchName: bet.match_name || "",
        strategyId: bet.strategy_id,
        odds: bet.odds,
        amount: bet.amount,
        handicap: 0
      });
      queued++;
    }
  }

  // 触发一次队列处理（取 1 单执行）
  await processBetQueue();

  return { success: true, executed: 0, queued };
}

export async function getCornerBets({ status, limit = 50, matchId = null }) {
  await ensureBetTable();
  try {
    let sql = "SELECT * FROM corner_bets WHERE 1=1";
    const params = [];
    if (status) {
      sql += " AND status = ?";
      params.push(status);
    }
    if (matchId) {
      sql += " AND match_id = ?";
      params.push(matchId);
    }
    sql += " ORDER BY id DESC LIMIT ?";
    params.push(limit);
    return await query(sql, params) || [];
  } catch (err) {
    console.error("[cornerService] 查询投注记录失败:", err.message);
    return [];
  }
}

let simTablePromise = null;

async function ensureSimulationTable() {
  console.warn("[cornerService] 运行时建表已弃用（corner_simulation_records），请通过迁移系统管理。");
  if (simTablePromise) return simTablePromise;
  simTablePromise = (async () => {
    try {
      await run("CREATE TABLE IF NOT EXISTS corner_simulation_records (id INTEGER PRIMARY KEY AUTOINCREMENT, strategy_id TEXT, match_id TEXT, match_name TEXT, elapsed_minutes INTEGER, trigger_odds REAL, trigger_handicap REAL, bet_direction TEXT, result TEXT DEFAULT 'pending', profit_loss REAL, created_at TEXT DEFAULT CURRENT_TIMESTAMP)");
      await run("CREATE INDEX IF NOT EXISTS idx_sim_strategy ON corner_simulation_records(strategy_id)");
      await run("CREATE INDEX IF NOT EXISTS idx_sim_match ON corner_simulation_records(match_id)");
      await run("CREATE INDEX IF NOT EXISTS idx_sim_time ON corner_simulation_records(created_at)");
    } catch (err) { console.warn("[cornerService] simulation table error:", err.message); }
  })();
  return simTablePromise;
}

export async function saveSimulationRecord(record) {
  await ensureSimulationTable();
  try {
    const result = await run(
      "INSERT INTO corner_simulation_records (strategy_id, match_id, match_name, elapsed_minutes, trigger_odds, trigger_handicap, bet_direction, result, profit_loss) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
      [String(record.strategy_id || ""), record.match_id || "", record.match_name || "", record.elapsed_minutes || 0, record.trigger_odds || 0, record.trigger_handicap || 0, record.bet_direction || "", record.result || "pending", record.profit_loss || 0]
    );
    return { success: true, id: result.lastID };
  } catch (err) { return { success: false, error: err.message }; }
}

export async function getCornerHistory(limit = 20) {
  await ensureTable();
  try { return await query("SELECT * FROM corner_history ORDER BY id DESC LIMIT ?", [limit]) || []; }
  catch (err) { return []; }
}

// ======================== 二次确认机制 ========================

/**
 * 获取待确认的投注列表
 */
export async function getPendingConfirms() {
  await ensureBetTable();
  try {
    return await query(
      "SELECT * FROM corner_bets WHERE status = 'pending_confirm' ORDER BY id ASC"
    ) || [];
  } catch (err) {
    console.error("[cornerService] 查询待确认投注失败:", err.message);
    return [];
  }
}

/**
 * 确认投注并执行
 */
export async function confirmBet(betId) {
  await ensureBetTable();
  try {
    const [bet] = await query("SELECT * FROM corner_bets WHERE id = ? AND status = 'pending_confirm'", [betId]) || [];
    if (!bet) {
      return { success: false, error: "投注不存在或状态不是待确认" };
    }
    // 加入队列执行
    betQueue.push({
      betId: bet.id,
      matchId: bet.match_id,
      matchName: bet.match_name || "",
      strategyId: bet.strategy_id,
      odds: bet.odds,
      amount: bet.amount,
      handicap: 0
    });
    processBetQueue().catch(e =>
      console.error("[cornerService] 确认投注执行失败:", e.message)
    );
    return { success: true, betId: bet.id };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

/**
 * 拒绝投注
 */
export async function rejectBet(betId) {
  await ensureBetTable();
  try {
    await run("UPDATE corner_bets SET status = 'rejected' WHERE id = ? AND status = 'pending_confirm'", [betId]);
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

// ======================== 模拟记录管理（新增） ========================
export async function getSimulationRecords({ matchId, strategyId, limit = 50 }) {
  await ensureSimulationTable();
  try {
    let sql = "SELECT * FROM corner_simulation_records WHERE 1=1";
    const params = [];
    if (matchId) {
      sql += " AND match_id = ?";
      params.push(matchId);
    }
    if (strategyId) {
      sql += " AND strategy_id = ?";
      params.push(strategyId);
    }
    sql += " ORDER BY id DESC LIMIT ?";
    params.push(limit);
    return await query(sql, params) || [];
  } catch (err) {
    console.error("[cornerService] 获取模拟记录失败:", err.message);
    return [];
  }
}

export async function getStrategyStats(strategyId) {
  await ensureTable();
  try {
    const total = await query("SELECT COUNT(*) as count FROM corner_history WHERE strategy_id = ?", [strategyId]);
    const executed = await query("SELECT COUNT(*) as count FROM corner_history WHERE strategy_id = ? AND bet_status = 'executed'", [strategyId]);
    const failed = await query("SELECT COUNT(*) as count FROM corner_history WHERE strategy_id = ? AND bet_status = 'failed'", [strategyId]);
    const profit = await query("SELECT SUM(profit_loss) as total FROM corner_history WHERE strategy_id = ?", [strategyId]);
    
    const totalCount = total[0]?.count || 0;
    const executedCount = executed[0]?.count || 0;
    const failedCount = failed[0]?.count || 0;
    const totalProfit = profit[0]?.total || 0;
    
    return {
      triggered: totalCount,
      executed: executedCount,
      failed: failedCount,
      successRate: totalCount > 0 ? (executedCount / totalCount) * 100 : 0,
      totalProfit,
      roi: totalCount > 0 ? (totalProfit / totalCount) * 100 : 0
    };
  } catch (err) {
    console.error("[cornerService] 获取策略统计失败:", err.message);
    return {
      triggered: 0,
      executed: 0,
      failed: 0,
      successRate: 0,
      totalProfit: 0,
      roi: 0
    };
  }
}