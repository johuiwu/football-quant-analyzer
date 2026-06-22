import { run, query } from "../dbService.js";
import { executeBet as executeBetOnHG, sleep } from "./cornerBetExecutor.js";
import { loadAndValidate } from "./credentialManager.js";

// ======================== 异步互斥锁（保护 betQueue / isProcessing） ========================
class AsyncMutex {
  constructor() { this._queue = []; this._locked = false; }
  acquire() {
    return new Promise(resolve => {
      if (!this._locked) { this._locked = true; resolve(); }
      else this._queue.push(resolve);
    });
  }
  release() {
    if (this._queue.length > 0) this._queue.shift()();
    else this._locked = false;
  }
}
const betMutex = new AsyncMutex();

// 动态加载 httpBetExecutor 模块（文件可能不存在，使用动态 import + catch 兜底）
let executeBetViaHttp = null;
let _httpBetModuleLoaded = false;
async function ensureHttpBetModule() {
  if (_httpBetModuleLoaded) return;
  _httpBetModuleLoaded = true;
  try {
    const mod = await import("./httpBetExecutor.js");
    executeBetViaHttp = mod.executeBetViaHttp;
    console.log("[角球投注] httpBetExecutor 模块加载成功，HTTP投注方式可用");
  } catch (e) {
    console.log("[角球投注] httpBetExecutor 模块不可用，将使用浏览器DOM投注");
  }
}

// ======================== 投注配置 ========================
const MAX_BET_AMOUNT = parseInt(process.env.MAX_BET_AMOUNT || "1000", 10);
const MAX_AUTO_RETRIES = 2;
const RETRY_DELAY_MS = 10000;
export function getMaxBetAmount() { return MAX_BET_AMOUNT; }

export function buildBetTarget(betDirection, handicap) {
  const h = handicap != null ? handicap : "";
  switch (betDirection) {
    case "over": return "大 " + h;
    case "under": return "小 " + h;
    case "home": return "让球 " + h + " 主队";
    case "away": return "让球 " + h + " 客队";
    case "next": return "下个角球";
    case "auto": return "自动 " + h;
    default: return betDirection + " " + h;
  }
}

let betConfig = {
  amount: parseInt(process.env.CORNER_BET_AMOUNT || "100", 10),
  isRealMode: process.env.CORNER_BET_REAL_MODE === "true",
  trackedMatchIds: [],
  autoBetEnabled: false,
  autoBetConfirmRequired: false
};

export function getAutoBetConfig() { return { ...betConfig, autoBetMasterSwitch: true }; }
export function setBetConfig(config) { if (config) { betConfig = { ...betConfig, ...config }; } }
export function getBetConfig() { return betConfig; }

// ======================== 历史记录存储 ========================
let tablePromise = null;

async function ensureTable() {
  console.warn("[cornerBetService] 运行时建表已弃用（corner_history/corner_bets），请通过迁移系统管理表结构。");
  if (tablePromise) return tablePromise;
  tablePromise = (async () => {
    try {
      await run("CREATE TABLE IF NOT EXISTS corner_history (id INTEGER PRIMARY KEY AUTOINCREMENT, match_id TEXT NOT NULL, match_name TEXT, strategy_id TEXT, triggered_at TEXT, bet_status TEXT DEFAULT 'pending', odds REAL, amount INTEGER DEFAULT 0, created_at TEXT DEFAULT CURRENT_TIMESTAMP)");
      await run("CREATE INDEX IF NOT EXISTS idx_corner_history_match ON corner_history(match_id)");
      await run("CREATE INDEX IF NOT EXISTS idx_corner_history_time ON corner_history(created_at)");
      await run("CREATE INDEX IF NOT EXISTS idx_corner_history_match_strategy ON corner_history(match_id, strategy_id)");
    } catch (err) { console.warn("[cornerBetService] table error:", err.message); }
  })();
  return tablePromise;
}

let betTablePromise = null;

export async function ensureBetTable() {
  console.warn("[cornerBetService] 运行时建表已弃用（corner_bets），请通过迁移系统管理表结构。");
  if (betTablePromise) return betTablePromise;
  betTablePromise = (async () => {
    try {
      await run("CREATE TABLE IF NOT EXISTS corner_bets (id INTEGER PRIMARY KEY AUTOINCREMENT, match_id TEXT NOT NULL, match_name TEXT, strategy_id TEXT, odds REAL, amount INTEGER DEFAULT 0, status TEXT DEFAULT 'pending', error_message TEXT, executed_at TEXT, retry_count INTEGER DEFAULT 0, bet_target TEXT DEFAULT NULL, error_reason TEXT DEFAULT NULL, created_at TEXT DEFAULT CURRENT_TIMESTAMP)");
      await run("CREATE INDEX IF NOT EXISTS idx_corner_bets_status ON corner_bets(status)");
      await run("CREATE INDEX IF NOT EXISTS idx_corner_bets_match ON corner_bets(match_id)");

      // 列补齐：ALTER TABLE 兜底，确保旧表也能获得新列
      const columns = await query("PRAGMA table_info(corner_bets)");
      const existingCols = new Set(columns.map(c => c.name));
      const missingCols = [
        { name: "retry_count", def: "INTEGER DEFAULT 0" },
        { name: "bet_target", def: "TEXT DEFAULT NULL" },
        { name: "error_reason", def: "TEXT DEFAULT NULL" },
      ];
      for (const col of missingCols) {
        if (!existingCols.has(col.name)) {
          // 安全守卫：列名仅允许字母数字下划线（来源为硬编码常量，禁止外部化）
          if (!/^[a-z_]+$/i.test(col.name)) continue;
          try {
            await run(`ALTER TABLE corner_bets ADD COLUMN ${col.name} ${col.def}`);
          } catch (alterErr) {
            // 列已存在时 SQLite 会报 duplicate column 错误，安全忽略
            if (!alterErr.message.includes("duplicate column")) {
              console.warn(`[cornerBetService] ALTER TABLE ADD COLUMN ${col.name} failed:`, alterErr.message);
            }
          }
        }
      }
    } catch (err) { console.warn("[cornerBetService] corner_bets table error:", err.message); }
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

const TRIGGER_COOLDOWN_MINUTES = 15;

export async function saveCornerTrigger(match, strategyId, actualOdds) {
  await ensureTable();
  try {
    const matchId = match.matchId || "";
    const sid = String(strategyId);
    const cooldownTime = new Date(Date.now() - TRIGGER_COOLDOWN_MINUTES * 60 * 1000).toISOString();
    const recent = await query(
      "SELECT id FROM corner_history WHERE match_id = ? AND strategy_id = ? AND created_at > ? ORDER BY id DESC LIMIT 1",
      [matchId, sid, cooldownTime]
    );
    if (recent && recent.length > 0) {
      return { success: true, skipped: true };
    }
    const result = await run(
      "INSERT INTO corner_history (match_id, match_name, strategy_id, triggered_at, bet_status, odds, amount) VALUES (?, ?, ?, ?, ?, ?, ?)",
      [matchId, match.matchName || "", sid, new Date().toISOString(), "pending", actualOdds ?? match.cornerOdds ?? 0, 0]
    );
    return { success: true, id: result.lastID };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

export async function generatePendingBet(match, strategyId, actualOdds) {
  await ensureBetTable();
  try {
    const existing = await query(
      "SELECT id FROM corner_bets WHERE match_id = ? AND strategy_id = ? AND status = 'pending'",
      [match.matchId || "", String(strategyId)]
    );
    if (existing && existing.length > 0) {
      return { success: true, skipped: true, reason: "duplicate pending" };
    }

    const result = await run(
      "INSERT INTO corner_bets (match_id, match_name, strategy_id, odds, amount, status, bet_target) VALUES (?, ?, ?, ?, ?, 'pending', ?)",
      [match.matchId || "", match.matchName || "", String(strategyId), actualOdds ?? match.cornerOdds ?? 0, betConfig.amount, match.betTarget || null]
    );
    return { success: true, id: result.lastID };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

// ======================== 二次确认关闭时的直接执行路径 ========================

/**
 * 二次确认关闭时，直接执行投注并插入最终状态记录
 * 绕过 generatePendingBet + betQueue 流程
 * @param {Object} match - 比赛对象（需含 matchId, matchName, cornerOdds, cornerHandicap）
 * @param {string} strategyId - 策略ID
 * @param {string} betDirection - 投注方向 (over/under/next/auto)
 */
export async function executeAndRecordBet(match, strategyId, betDirection, actualOdds) {
  console.log("[角球投注] 二次确认关闭，进入自动执行流程...");

  const betTarget = buildBetTarget(betDirection, match.cornerHandicap || 0);
  const matchId = match.matchId || "";
  const matchName = match.matchName || "";
  const sid = String(strategyId);
  const now = new Date().toISOString();

  const betData = {
    matchName,
    matchId,
    odds: actualOdds ?? match.cornerOdds ?? 0,
    amount: betConfig.amount,
    handicap: match.cornerHandicap || 0,
    strategyId: sid,
    betDirection: betDirection || "auto",
    cornerOU: match.cornerOU || null
  };

  // ★ 先在 corner_bets 表中插入 pending 记录（确保无论投注成功/失败都有记录）
  await ensureBetTable();
  let betRecordId;
  try {
    const insertResult = await run(
      "INSERT INTO corner_bets (match_id, match_name, strategy_id, odds, amount, status, bet_target, created_at) VALUES (?, ?, ?, ?, ?, 'pending', ?, ?)",
      [matchId, matchName, sid, betData.odds, betData.amount, betTarget, now]
    );
    betRecordId = insertResult.lastID;
    console.log(`[投注诊断] 策略${sid}已创建投注记录 bet#${betRecordId}，正在尝试下单...`);
  } catch (insertErr) {
    console.error("[角球投注] 创建投注记录失败:", insertErr.message);
    return;
  }

  // ★ 非真实模式：直接标记为 skipped，不执行实际投注
  if (!betConfig.isRealMode) {
    await run(
      "UPDATE corner_bets SET status = 'skipped', error_reason = '非真实模式', executed_at = ? WHERE id = ?",
      [new Date().toISOString(), betRecordId]
    );
    console.log(`[角球投注] 非真实模式，跳过实际投注 bet#${betRecordId}`);
    return;
  }

  if (!betConfig.autoBetEnabled) {
    await run(
      "UPDATE corner_bets SET status = 'skipped', error_reason = '自动投注未启用', executed_at = ? WHERE id = ?",
      [new Date().toISOString(), betRecordId]
    );
    console.log(`[角球投注] 自动投注未启用，跳过实际投注 bet#${betRecordId}`);
    return;
  }

  // 自动重试逻辑
  await ensureHttpBetModule();
  let result = null;
  let attempt = 0;
  while (attempt <= MAX_AUTO_RETRIES) {
    try {
      const credCheck = await loadAndValidate().catch(() => null);
      if (credCheck && credCheck.valid && credCheck.credentials?.uid && executeBetViaHttp) {
        console.log("[角球投注] 使用纯HTTP投注方式" + (attempt > 0 ? ` (重试第${attempt}次)` : ""));
        result = await executeBetViaHttp(betData);
      } else {
        console.log("[角球投注] 凭证无效或HTTP模块不可用，回退到浏览器DOM投注方式" + (attempt > 0 ? ` (重试第${attempt}次)` : ""));
        result = await executeBetOnHG(betData);
      }
    } catch (err) {
      result = { success: false, error: err.message };
    }

    if (result && (result.success || result.insufficient)) break;

    attempt++;
    if (attempt <= MAX_AUTO_RETRIES) {
      console.error(`[投注失败重试记录] 第${attempt}次重试: ${result?.error || "unknown"}`);
      await sleep(RETRY_DELAY_MS);
    }
  }

  // ★ result 安全兜底
  if (!result) {
    result = { success: false, error: "投注结果为空（可能所有重试均未返回结果）" };
  }

  const finalRetryCount = attempt;
  const executedAt = new Date().toISOString();

  if (result.success) {
    await run(
      "UPDATE corner_bets SET status = 'success', executed_at = ?, retry_count = ? WHERE id = ?",
      [executedAt, finalRetryCount, betRecordId]
    );
    await saveCornerHistory({
      match_id: matchId,
      match_name: matchName,
      strategy_id: sid,
      bet_status: "executed",
      odds: betData.odds,
      amount: betData.amount
    }).catch(() => {});
    console.log("[角球投注] 自动执行结果: 成功");
  } else if (result.insufficient) {
    await run(
      "UPDATE corner_bets SET status = 'insufficient', error_message = ?, error_reason = ?, executed_at = ?, retry_count = ? WHERE id = ?",
      [result.error || "余额不足", result.error || "余额不足", executedAt, finalRetryCount, betRecordId]
    );
    await saveCornerHistory({
      match_id: matchId,
      match_name: matchName,
      strategy_id: sid,
      bet_status: "insufficient",
      odds: betData.odds,
      amount: betData.amount
    }).catch(() => {});
    console.log("[角球投注] 自动执行结果: 失败，原因: 余额不足");
  } else {
    const errMsg = result.error || "unknown";
    await run(
      "UPDATE corner_bets SET status = 'failed', error_message = ?, error_reason = ?, executed_at = ?, retry_count = ? WHERE id = ?",
      [errMsg, errMsg, executedAt, finalRetryCount, betRecordId]
    );
    await saveCornerHistory({
      match_id: matchId,
      match_name: matchName,
      strategy_id: sid,
      bet_status: "failed",
      odds: betData.odds,
      amount: betData.amount
    }).catch(() => {});
    console.log("[角球投注] 自动执行结果: 失败，原因: " + errMsg);
  }
}

// ======================== 投注队列 ========================
export let betQueue = [];
let isProcessing = false;

export async function checkDuplicateBet(matchId, strategyId) {
  await ensureTable();
  try {
    // 检查 corner_history 表
    const historyRows = await query(
      "SELECT id FROM corner_history WHERE match_id = ? AND strategy_id = ? AND bet_status IN ('executed', 'failed')",
      [matchId, String(strategyId)]
    );
    if (historyRows && historyRows.length > 0) return true;

    // ★ 同时检查 corner_bets 表（任何状态都视为重复，避免 skipped/pending 重复创建）
    const betRows = await query(
      "SELECT id FROM corner_bets WHERE match_id = ? AND strategy_id = ?",
      [matchId, String(strategyId)]
    );
    if (betRows && betRows.length > 0) return true;

    return false;
  } catch (err) {
    console.error("[cornerBetService] 查重失败，降级放行:", err.message);
    // 降级策略：查询失败时允许投注继续执行，避免数据库临时异常阻断所有投注
    return false;
  }
}

export async function processBetQueue() {
  await betMutex.acquire();
  try {
    if (isProcessing || betQueue.length === 0) return;
    isProcessing = true;

    try {
      const task = betQueue.shift();

    // ★ 投注诊断日志
    console.log(`[投注诊断] 策略${task.strategyId}已进入投注执行队列，正在尝试下单...`);

    if (betConfig.autoBetConfirmRequired) {
      console.log("[cornerBetService] 二次确认模式: bet#" + task.betId + " " + task.matchName + " 等待用户确认");
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

    console.log("[cornerBetService] 执行投注: bet#" + task.betId + " " + task.matchName);

    const betTarget = buildBetTarget(task.betDirection || "auto", task.handicap || 0);
    console.log(`[下注诊断] 策略${task.strategyId}触发, 赔率: ${task.odds}, 盘口: ${betTarget}`);

    if (!task.odds || task.odds <= 0) {
      console.error(`[下注诊断] 赔率无效(odds=${task.odds})，跳过投注, bet#${task.betId}`);
      await run("UPDATE corner_bets SET status = 'failed', error_message = '赔率无效', error_reason = '赔率为0或负数' WHERE id = ?", [task.betId]);
      // 同步写入历史记录，确保前端可展示
      await saveCornerHistory({
        match_id: task.matchId,
        match_name: task.matchName,
        strategy_id: String(task.strategyId),
        bet_status: "failed",
        odds: task.odds || 0,
        amount: task.amount || 0
      }).catch(() => {});
      isProcessing = false;
      return;
    }

    // ★ 自动投注开关检查：关闭后不再执行投注
    if (!betConfig.autoBetEnabled) {
      console.log("[cornerBetService] 自动投注已关闭，跳过: bet#" + task.betId);
      await run(
        "UPDATE corner_bets SET status = 'skipped', error_reason = '自动投注未启用', executed_at = ? WHERE id = ?",
        [new Date().toISOString(), task.betId]
      );
      isProcessing = false;
      return;
    }

    // ★ 非真实模式：标记为 skipped，不执行实际投注
    if (!betConfig.isRealMode) {
      await run(
        "UPDATE corner_bets SET status = 'skipped', error_reason = '非真实模式', executed_at = ? WHERE id = ?",
        [new Date().toISOString(), task.betId]
      );
      console.log(`[cornerBetService] 非真实模式，跳过实际投注 bet#${task.betId}`);
      isProcessing = false;
      return;
    }

    const betData = {
      matchName: task.matchName,
      matchId: task.matchId,
      odds: task.odds,
      amount: task.amount,
      handicap: task.handicap || 0,
      strategyId: String(task.strategyId),
      betDirection: task.betDirection || "auto",
      cornerOU: task.cornerOU || null
    };

    // 自动重试逻辑
    await ensureHttpBetModule();
    let result = null;
    let attempt = 0;
    while (attempt <= MAX_AUTO_RETRIES) {
      const credCheck = await loadAndValidate().catch(() => null);
      if (credCheck && credCheck.valid && credCheck.credentials?.uid && executeBetViaHttp) {
        console.log("[cornerBetService] 使用纯HTTP投注方式" + (attempt > 0 ? ` (重试第${attempt}次)` : ""));
        result = await executeBetViaHttp(betData);
      } else {
        console.log("[cornerBetService] 凭证无效或HTTP模块不可用，回退到浏览器DOM投注方式" + (attempt > 0 ? ` (重试第${attempt}次)` : ""));
        result = await executeBetOnHG(betData);
      }

      if (result && (result.success || result.insufficient)) break;

      attempt++;
      if (attempt <= MAX_AUTO_RETRIES) {
        console.error(`[投注失败重试记录] 第${attempt}次重试: ${result?.error || "unknown"}`);
        await sleep(RETRY_DELAY_MS);
      }
    }

    // ★ result 安全兜底
    if (!result) {
      result = { success: false, error: "投注结果为空（可能所有重试均未返回结果）" };
    }

    const finalRetryCount = attempt;

    if (result.success) {
      await run(
        "UPDATE corner_bets SET status = 'executed', executed_at = ?, retry_count = ?, bet_target = ? WHERE id = ?",
        [new Date().toISOString(), finalRetryCount, betTarget, task.betId]
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
    } else if (result.insufficient) {
      console.log("[cornerBetService] 余额不足: bet#" + task.betId + " " + task.matchName);
      await run(
        "UPDATE corner_bets SET status = 'insufficient', error_message = ?, error_reason = ?, retry_count = ?, bet_target = ? WHERE id = ?",
        [result.error || "余额不足", result.error || "余额不足", finalRetryCount, betTarget, task.betId]
      );
      if (task.historyId) {
        await run(
          "UPDATE corner_history SET bet_status = 'insufficient' WHERE id = ?",
          [task.historyId]
        ).catch(() => {});
      } else {
        await run(
          "UPDATE corner_history SET bet_status = 'insufficient' WHERE match_id = ? AND strategy_id = ? AND bet_status = 'pending'",
          [task.matchId, String(task.strategyId)]
        ).catch(() => {});
      }
    } else {
      const errMsg = result.error || "unknown";
      await run(
        "UPDATE corner_bets SET status = 'failed', error_message = ?, error_reason = ?, retry_count = ?, bet_target = ? WHERE id = ?",
        [errMsg, errMsg, finalRetryCount, betTarget, task.betId]
      );
      if (task.historyId) {
        await run(
          "UPDATE corner_history SET bet_status = 'failed' WHERE id = ?",
          [task.historyId]
        ).catch(() => {});
      } else {
        await run(
          "UPDATE corner_history SET bet_status = 'failed' WHERE match_id = ? AND strategy_id = ? AND bet_status = 'pending'",
          [task.matchId, String(task.strategyId)]
        ).catch(() => {});
      }
    }
  } catch (err) {
    console.error("[cornerBetService] 自动投注失败:", err.message);
  } finally {
    isProcessing = false;
  }
  } finally {
    betMutex.release();
  }
}

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

  await betMutex.acquire();
  try {
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
        console.error("[cornerBetService] 投注队列处理失败:", e.message)
      );
    }
  } finally {
    betMutex.release();
  }

  return { success: true, betId: result.lastID };
}

async function placeBetOnHG(bet) {
  if (!betConfig.isRealMode) {
    console.log("[cornerBetService] 模拟模式跳过实际投注 bet#" + bet.id);
    return { success: true };
  }

  const betData = {
    matchName: bet.match_name,
    matchId: bet.match_id,
    odds: bet.odds,
    amount: bet.amount,
    handicap: bet.handicap || 0,
    strategyId: String(bet.strategy_id || ""),
    betDirection: bet.bet_direction || "auto"
  };

  // 优先使用纯 HTTP 投注（增加空值检查和异常保护）
  await ensureHttpBetModule();
  const credCheck = await loadAndValidate().catch(() => null);
  if (credCheck && credCheck.valid && executeBetViaHttp) {
    try {
      return await executeBetViaHttp(betData);
    } catch (err) {
      console.error("[placeBetOnHG] HTTP投注异常，回退浏览器DOM:", err.message);
    }
  }
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
    console.error("[cornerBetService] 查询待投注失败:", err.message);
    return { success: false, error: err.message };
  }

  if (!pendingBets || pendingBets.length === 0) {
    return { success: true, executed: 0, queued: 0 };
  }

  console.log("[cornerBetService] 将 " + pendingBets.length + " 条待投注入队...");

  let queued = 0;
  for (const bet of pendingBets) {
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
    console.error("[cornerBetService] 查询投注记录失败:", err.message);
    return [];
  }
}

let simTablePromise = null;

async function ensureSimulationTable() {
  console.warn("[cornerBetService] 运行时建表已弃用（corner_simulation_records），请通过迁移系统管理。");
  if (simTablePromise) return simTablePromise;
  simTablePromise = (async () => {
    try {
      await run("CREATE TABLE IF NOT EXISTS corner_simulation_records (id INTEGER PRIMARY KEY AUTOINCREMENT, strategy_id TEXT, match_id TEXT, match_name TEXT, elapsed_minutes INTEGER, trigger_odds REAL, trigger_handicap REAL, bet_direction TEXT, result TEXT DEFAULT 'pending', profit_loss REAL, created_at TEXT DEFAULT CURRENT_TIMESTAMP)");
      await run("CREATE INDEX IF NOT EXISTS idx_sim_strategy ON corner_simulation_records(strategy_id)");
      await run("CREATE INDEX IF NOT EXISTS idx_sim_match ON corner_simulation_records(match_id)");
      await run("CREATE INDEX IF NOT EXISTS idx_sim_time ON corner_simulation_records(created_at)");
    } catch (err) { console.warn("[cornerBetService] simulation table error:", err.message); }
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

export async function getPendingConfirms() {
  await ensureBetTable();
  try {
    return await query(
      "SELECT * FROM corner_bets WHERE status = 'pending_confirm' ORDER BY id ASC"
    ) || [];
  } catch (err) {
    console.error("[cornerBetService] 查询待确认投注失败:", err.message);
    return [];
  }
}

export async function confirmBet(betId) {
  await ensureBetTable();
  try {
    const [bet] = await query("SELECT * FROM corner_bets WHERE id = ? AND status = 'pending_confirm'", [betId]) || [];
    if (!bet) {
      return { success: false, error: "投注不存在或状态不是待确认" };
    }
    await betMutex.acquire();
    try {
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
        console.error("[cornerBetService] 确认投注执行失败:", e.message)
      );
    } finally {
      betMutex.release();
    }
    return { success: true, betId: bet.id };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

export async function rejectBet(betId) {
  await ensureBetTable();
  try {
    await run("UPDATE corner_bets SET status = 'rejected' WHERE id = ? AND status = 'pending_confirm'", [betId]);
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

export async function retryBet(betId) {
  await ensureBetTable();
  try {
    const [bet] = await query("SELECT * FROM corner_bets WHERE id = ? AND status IN ('insufficient', 'failed')", [betId]) || [];
    if (!bet) {
      return { success: false, error: "投注不存在或状态不可重试（仅支持 insufficient/failed）" };
    }
    await run("UPDATE corner_bets SET status = 'pending', error_message = NULL, error_reason = NULL, retry_count = 0 WHERE id = ?", [betId]);
    await run(
      "UPDATE corner_history SET bet_status = 'pending' WHERE match_id = ? AND strategy_id = ? AND bet_status IN ('insufficient', 'failed')",
      [bet.match_id, String(bet.strategy_id)]
    ).catch(() => {});
    await betMutex.acquire();
    try {
      betQueue.push({
        betId: bet.id,
        matchId: bet.match_id,
        matchName: bet.match_name || "",
        strategyId: bet.strategy_id,
        odds: bet.odds,
        amount: bet.amount,
        handicap: 0,
        betDirection: bet.bet_direction || "auto"
      });
      processBetQueue().catch(e =>
        console.error("[cornerBetService] 重试投注执行失败:", e.message)
      );
    } finally {
      betMutex.release();
    }
    return { success: true, betId: bet.id };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

export function getBetQueueStatus() {
  return {
    queueLength: betQueue.length,
    isProcessing: isProcessing
  };
}

// ======================== 模拟记录管理 ========================
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
    console.error("[cornerBetService] 获取模拟记录失败:", err.message);
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
    console.error("[cornerBetService] 获取策略统计失败:", err.message);
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

export async function clearHistory() {
  try {
    await ensureTable();
    await ensureBetTable();
    await run("DELETE FROM corner_history", []);
    await run("DELETE FROM corner_bets", []);
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
}
