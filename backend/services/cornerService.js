import { crawlCornerMatches, getPollingStatus as getCrawlerStatus } from "./cornerCrawler.js";
import { evaluateStrategies as evaluateCornerStrategies } from "./cornerEvaluator.js";

// ======================== 数据源配置 ========================
const USE_REAL_DATA = process.env.USE_REAL_DATA === "true";

// ======================== 后端轮询缓存 ========================
let cachedMatches = [];
let pollingInterval = null;
let pollingActive = false;
const POLL_INTERVAL = parseInt(process.env.CRAWLER_POLL_INTERVAL || "5000", 10);

// ======================== 策略配置 ========================
export const DEFAULT_STRATEGIES = [
  { id: 1, enabled: true, name: "策略一", playTimeStart: 35, playTimeEnd: 55, leadGoals: 99, leadGoalsWeak: 1, cornerHandicapLower: -1.25, cornerHandicapUpper: 3.5, targetOdds: 0.8 },
  { id: 2, enabled: true, name: "策略二", playTimeStart: 50, playTimeEnd: 77, leadGoals: 3, leadGoalsWeak: 1, cornerHandicapLower: -0.75, cornerHandicapUpper: 2.5, targetOdds: 0.8 },
  { id: 3, enabled: true, name: "策略三", playTimeStart: 70, playTimeEnd: 99, leadGoals: 0, leadGoalsWeak: 0, cornerHandicapLower: 0, cornerHandicapUpper: 1.5, targetOdds: 0.8 },
  { id: 4, enabled: true, name: "策略四", playTimeStart: 60, playTimeEnd: 99, leadGoals: 2, leadGoalsWeak: 0, cornerHandicapLower: 0, cornerHandicapUpper: 3.5, targetOdds: 0.8 },
  { id: 5, enabled: true, name: "策略五", playTimeStart: 70, playTimeEnd: 99, leadGoals: 1, leadGoalsWeak: 0, cornerHandicapLower: 0, cornerHandicapUpper: 3.5, targetOdds: 0.8 },
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
  isRealMode: process.env.CORNER_BET_REAL_MODE === "true"
};

export function setBetConfig(config) {
  if (config) {
    betConfig = { ...betConfig, ...config };
  }
}

export function getBetConfig() {
  return betConfig;
}

// ======================== 后端轮询 ========================
export function startCornerBackendPolling() {
  if (pollingActive) {
    console.log("[cornerService] 轮询已在运行中");
    return { success: true, message: "already polling" };
  }

  console.log("[cornerService] 启动后端轮询 (间隔=" + POLL_INTERVAL + "ms)...");
  pollingActive = true;

  const poll = async () => {
    if (!pollingActive) return;
    try {
      const result = await crawlCornerMatches();
      const rawMatches = result.success ? (result.data?.matches || []) : [];
      const matches = rawMatches.map(mapMatchToCornerFormat);

      // 策略评估：对每场比赛评估所有活跃策略
      for (const match of matches) {
        const triggeredIds = evaluateStrategies(match, activeStrategies);
        match.triggeredStrategies = triggeredIds;
        // 写入触发记录到 corner_history 表
        for (const sid of triggeredIds) {
          saveCornerTrigger(match, sid).catch(e =>
            console.error("[cornerService] 保存触发记录失败:", e.message)
          );
          generatePendingBet(match, sid).catch(e =>
            console.error("[cornerService] 生成待投注失败:", e.message)
          );
        }
      }

      cachedMatches = matches;
      console.log("[cornerService] 轮询更新: " + matches.length + " 场比赛");
        if (matches.length > 0 && !pollingFirstDone) {
          pollingFirstDone = true;
          console.log("[cornerService] 首次爬取完成，缓存已就绪");
        }

      // 执行待投注（真实模式下通过 puppeteer 投注）
      if (betConfig.isRealMode) {
        executePendingBets().catch(e =>
          console.error("[cornerService] 执行待投注失败:", e.message)
        );
      }
    } catch (e) {
      console.error("[cornerService] 轮询错误:", e.message);
    }
    if (pollingActive) {
      pollingInterval = setTimeout(poll, POLL_INTERVAL);
    }
  };

  // 首次立即执行一次
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
  return { success: true };
}

// ======================== 暂停/恢复轮询 ========================
let pollingPaused = false;
let pollingFirstDone = false;
let pauseTime = null;

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
  // 立即执行一次轮询
  const poll = async () => {
    if (!pollingActive || pollingPaused) return;
    try {
      const result = await crawlCornerMatches();
      const rawMatches = result.success ? (result.data?.matches || []) : [];
      const matches = rawMatches.map(mapMatchToCornerFormat);

      // 策略评估：对每场比赛评估所有活跃策略
      for (const match of matches) {
        const triggeredIds = evaluateStrategies(match, activeStrategies);
        match.triggeredStrategies = triggeredIds;
        // 写入触发记录到 corner_history 表
        for (const sid of triggeredIds) {
          saveCornerTrigger(match, sid).catch(e =>
            console.error("[cornerService] 保存触发记录失败:", e.message)
          );
          generatePendingBet(match, sid).catch(e =>
            console.error("[cornerService] 生成待投注失败:", e.message)
          );
        }
      }

      cachedMatches = matches;
      console.log("[cornerService] 轮询更新: " + matches.length + " 场比赛");
        if (matches.length > 0 && !pollingFirstDone) {
          pollingFirstDone = true;
          console.log("[cornerService] 首次爬取完成，缓存已就绪");
        }

      // 执行待投注（真实模式下通过 puppeteer 投注）
      if (betConfig.isRealMode) {
        executePendingBets().catch(e =>
          console.error("[cornerService] 执行待投注失败:", e.message)
        );
      }
    } catch (e) {
      console.error("[cornerService] 轮询错误:", e.message);
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
    cachedCount: cachedMatches.length,
    lastPollInterval: POLL_INTERVAL,
    pausedAt: pauseTime ? new Date(pauseTime).toISOString() : null
  };
}


// ======================== 数据格式映射 ========================
function mapMatchToCornerFormat(match) {
  // 爬虫返回的数据已经是扁平格式，直接透传并补全字段
  const ou = match.cornerOverUnder || {};
  const nc = match.nextCorner || {};
  const oe = match.cornerOddEven || {};
  return {
    matchId: match.matchId || "",
    matchName: match.matchName || (match.homeTeam + " vs " + match.awayTeam),
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
    cornerOverUnder: ou.line != null ? { line: ou.line, overOdds: ou.overOdds, underOdds: ou.underOdds } : null,
    nextCorner: nc.corner ? nc : null,
    cornerOddEven: oe.oddOdds ? oe : null,
    timestamp: match.timestamp || Date.now(),
    triggeredStrategies: match.triggeredStrategies || []
  };
}

// ======================== 获取实时角球数据 ========================
export async function getLiveCornerData(filterMatchId) {
  const generatedAt = new Date().toISOString();

  // 如果有缓存数据，直接返回（忽略 USE_REAL_DATA，确保轮询数据能返回）
  if (cachedMatches.length > 0) {
    const filtered = filterMatchId
      ? cachedMatches.filter(m => m.matchId === filterMatchId || m.homeTeam + "_vs_" + m.awayTeam === filterMatchId)
      : cachedMatches;
    return { data: filtered, generatedAt, count: filtered.length };
  }

  // 无缓存时，根据 USE_REAL_DATA 决定返回空还是 cacheEmpty 标志
  if (!USE_REAL_DATA) {
    return { data: [], generatedAt, count: 0 };
  }

  // 无缓存：返回空，不触发爬取（由轮询系统负责填充缓存）
  console.log("[cornerService] 缓存为空，等待轮询系统填充...");
  return { data: [], generatedAt, count: 0, cacheEmpty: true };
}

// ======================== 策略评估引擎（委托给共享模块 cornerEvaluator.js） ========================
// 前端 cornerStore.ts 独立实现以支持实时响应，逻辑须与此模块保持一致
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

async function placeBetOnHG(bet) {
  // 非真实模式：直接标记为成功
  if (!betConfig.isRealMode) {
    console.log("[cornerService] 模拟模式，跳过真实投注 bet#" + bet.id);
    return { success: true };
  }

  try {
    // 复用浏览器池中已登录的页面
    const { getSharedPage, isLoggedIn } = await import("./browserPool.js");
    if (!isLoggedIn()) {
      return { success: false, error: "未登录" };
    }

    const page = getSharedPage();
    if (!page) {
      return { success: false, error: "浏览器页面不可用" };
    }

    // 1. 导航到角球页面
    const { navigateToCorners } = await import("./cornerCrawler.js");
    await navigateToCorners(page);
    await new Promise(r => setTimeout(r, 3000));

    // 2. 查找匹配的比赛行
    const matchFound = await page.evaluate((matchName) => {
      const rows = document.querySelectorAll("tr, [class*='row'], [class*='event']");
      for (const row of rows) {
        if (row.textContent && row.textContent.includes(matchName)) {
          return true;
        }
      }
      return false;
    }, bet.match_name);

    if (!matchFound) {
      return { success: false, error: "未找到比赛: " + bet.match_name };
    }

    // 3. 尝试在比赛行中查找角球盘口投注按钮并点击
    const betPlaced = await page.evaluate((betData) => {
      const rows = document.querySelectorAll("tr, [class*='row'], [class*='event']");
      for (const row of rows) {
        if (!row.textContent || !row.textContent.includes(betData.match_name)) continue;
        const clickables = row.querySelectorAll("[class*='odd'], [class*='price'], [class*='bet'], [class*='sel']");
        for (const el of clickables) {
          const text = (el.textContent || "").trim();
          const val = parseFloat(text);
          if (!isNaN(val) && Math.abs(val - betData.odds) < 0.3) {
            el.click();
            return true;
          }
        }
      }
      return false;
    }, { match_name: bet.match_name, odds: bet.odds });

    if (!betPlaced) {
      return { success: false, error: "未找到匹配的投注选项" };
    }

    // 4. 等待投注单弹出
    await new Promise(r => setTimeout(r, 2000));

    // 5. 填入投注金额
    try {
      await page.evaluate((amount) => {
        const inputs = document.querySelectorAll("input[type='text'], input[type='number'], input");
        for (const inp of inputs) {
          const placeholder = (inp.placeholder || "").toLowerCase();
          const name = (inp.name || "").toLowerCase();
          if (placeholder.includes("stake") || placeholder.includes("amount") || placeholder.includes("金额")
              || name.includes("stake") || name.includes("amount") || name.includes("bet")) {
            inp.value = "";
            inp.focus();
            inp.value = String(amount);
            inp.dispatchEvent(new Event("input", { bubbles: true }));
            inp.dispatchEvent(new Event("change", { bubbles: true }));
            return true;
          }
        }
        return false;
      }, bet.amount);
    } catch (e) {
      console.warn("[cornerService] 填入金额失败:", e.message);
    }

    await new Promise(r => setTimeout(r, 500));

    // 6. 点击确认投注按钮
    const confirmed = await page.evaluate(() => {
      const btns = document.querySelectorAll("button, [class*='btn'], [class*='confirm'], [class*='submit'], [class*='place']");
      for (const btn of btns) {
        const text = (btn.textContent || "").toLowerCase().trim();
        if (text.includes("confirm") || text.includes("place") || text.includes("bet")
            || text.includes("确认") || text.includes("投注") || text.includes("submit")) {
          btn.click();
          return true;
        }
      }
      return false;
    });

    if (!confirmed) {
      return { success: false, error: "未找到确认投注按钮" };
    }

    await new Promise(r => setTimeout(r, 2000));
    return { success: true };

  } catch (err) {
    return { success: false, error: err.message };
  }
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
    return { success: true, executed: 0 };
  }

  console.log("[cornerService] 执行 " + pendingBets.length + " 条待投注...");

  let executed = 0;
  let failed = 0;

  for (const bet of pendingBets) {
    try {
      const result = await placeBetOnHG(bet);
      if (result.success) {
        await run(
          "UPDATE corner_bets SET status = 'executed', executed_at = ? WHERE id = ?",
          [new Date().toISOString(), bet.id]
        );
        executed++;
        console.log("[cornerService] 投注执行成功: bet#" + bet.id);
      } else {
        await run(
          "UPDATE corner_bets SET status = 'failed', error_message = ? WHERE id = ?",
          [result.error || "unknown", bet.id]
        );
        failed++;
        console.warn("[cornerService] 投注执行失败: bet#" + bet.id, result.error);
      }
    } catch (err) {
      await run(
        "UPDATE corner_bets SET status = 'failed', error_message = ? WHERE id = ?",
        [err.message || "unknown", bet.id]
      ).catch(() => {});
      failed++;
      console.error("[cornerService] 投注执行异常: bet#" + bet.id, err.message);
    }
  }

  return { success: true, executed, failed };
}

export async function getCornerBets({ status, limit = 50 }) {
  await ensureBetTable();
  try {
    let sql = "SELECT * FROM corner_bets WHERE 1=1";
    const params = [];
    if (status) {
      sql += " AND status = ?";
      params.push(status);
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
    const wins = await query("SELECT COUNT(*) as count FROM corner_history WHERE strategy_id = ? AND bet_status = 'win'", [strategyId]);
    const losses = await query("SELECT COUNT(*) as count FROM corner_history WHERE strategy_id = ? AND bet_status = 'lose'", [strategyId]);
    const profit = await query("SELECT SUM(profit_loss) as total FROM corner_history WHERE strategy_id = ?", [strategyId]);
    
    const totalCount = total[0]?.count || 0;
    const winCount = wins[0]?.count || 0;
    const lossCount = losses[0]?.count || 0;
    const totalProfit = profit[0]?.total || 0;
    
    return {
      triggered: totalCount,
      wins: winCount,
      losses: lossCount,
      winRate: totalCount > 0 ? (winCount / totalCount) * 100 : 0,
      totalProfit,
      roi: totalCount > 0 ? (totalProfit / totalCount) * 100 : 0
    };
  } catch (err) {
    console.error("[cornerService] 获取策略统计失败:", err.message);
    return {
      triggered: 0,
      wins: 0,
      losses: 0,
      winRate: 0,
      totalProfit: 0,
      roi: 0
    };
  }
}
