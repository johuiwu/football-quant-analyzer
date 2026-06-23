import { Router } from "express";
import { getLiveCornerData, evaluateStrategies, DEFAULT_STRATEGIES, setCornerStrategies } from "../services/cornerService.js";
import { startCornerBackendPolling, stopCornerBackendPolling, pauseCornerBackendPolling, resumeCornerBackendPolling, getBackendPollingStatus, getAlertStatus, getPollingAnalytics } from "../services/cornerService.js";
import { getCornerHistory, saveCornerHistory, clearHistory, setBetConfig, getAutoBetConfig, executePendingBets, getCornerBets, checkDuplicateBet, addManualBet, getMaxBetAmount, getPendingConfirms, confirmBet, rejectBet, retryBet, getBetQueueStatus } from "../services/cornerBetService.js";
import { diagnoseCrawler, getDebugInfo, closeCrawler, startCornerPolling, stopCornerPolling, getPollingStatus, getBalance, crawlCornerMatches, resetBrowserClosedFlag, extractBalance, loginToHG as cornerLoginToHG } from "../services/cornerCrawler.js";
import { runBacktest, getSimulationRecords, getStrategyStats } from "../services/cornerStrategyEngine.js";

import { requireFields, validateTypes, validateLength } from "../middleware/validate.js";

const router = Router();

// DEFAULT_STRATEGIES 从 cornerService 导入（统一策略源）
// 使用见下方 parsedStrategies 兜底逻辑

// ======================== GET /api/corner/live ========================
router.get("/corner/live", async (req, res) => {
  try {
    const matchId = req.query.matchId || null;
    const result = await getLiveCornerData(matchId);
    const matchList = (result && Array.isArray(result.data)) ? result.data : [];
    res.json({
      success: true,
      data: matchList,
      mainMarkets: result.mainMarkets || {},
      generatedAt: (result && result.generatedAt) || new Date().toISOString(),
      count: matchList.length,
      cacheAge: (result && result.cacheAge != null) ? result.cacheAge : null,
      cacheEmpty: (result && result.cacheEmpty) ? true : false,
      source: (result && result.source) || "cache"
    });
  } catch (err) {
    const msg = err.message || String(err);
    console.error("[cornerRoutes] /corner/live error:", msg);
    if (msg.includes("browser") || msg.includes("isConnected") || msg.includes("launch")) {
      return res.status(503).json({ success: false, error: "爬虫浏览器未就绪，请稍后重试", detail: msg });
    }
    res.status(500).json({ success: false, error: msg });
  }
});

// ======================== POST /api/corner/fetch ========================
// 即时爬取：直接调用 crawlCornerMatches()，不读缓存
router.post("/corner/fetch", async (req, res) => {
  try {
    resetBrowserClosedFlag();
    console.log("[cornerRoutes] /corner/fetch 即时爬取开始...");
    const timeoutMs = 60000; // 从 90s 缩短到 60s（纯HTTP模式应在30s内完成）
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error("爬取超时（60s）")), timeoutMs)
    );
    const result = await Promise.race([crawlCornerMatches(), timeoutPromise]);
    if (!result || !result.success) {
      const errMsg = (result && result.error) || "爬取失败";
      console.error("[cornerRoutes] /corner/fetch failed:", errMsg);
      return res.status(500).json({ success: false, error: errMsg });
    }
    const matches = result.data?.matches || [];
    console.log("[cornerRoutes] /corner/fetch 完成:", matches.length, "场比赛");
    res.json({ success: true, data: matches, mainMarkets: result.mainMarkets || {}, count: matches.length, source: "live-fetch" });
  } catch (err) {
    const msg = err.message || String(err);
    console.error("[cornerRoutes] /corner/fetch error:", msg);
    if (msg.includes("browser") || msg.includes("isConnected") || msg.includes("launch")) {
      return res.status(503).json({ success: false, error: "爬虫浏览器未就绪，请稍后重试", detail: msg });
    }
    res.status(500).json({ success: false, error: msg });
  }
});


// ======================== GET /api/corner/strategies/check ========================
router.get("/corner/strategies/check", async (req, res) => {
  try {
    const { strategies, matchId } = req.query;
    const parsedStrategies = strategies ? JSON.parse(strategies) : DEFAULT_STRATEGIES;
    const result = await getLiveCornerData(matchId || null);
    const matchList = (result && Array.isArray(result.data)) ? result.data : [];
    const checked = matchList.map((match) => {
      const triggered = evaluateStrategies(match, parsedStrategies);
      return { ...match, triggeredStrategies: triggered, signalCount: triggered.length };
    });
    res.json({ success: true, data: checked, generatedAt: result.generatedAt, count: checked.length });
  } catch (err) {
    console.error("[cornerRoutes] /corner/strategies/check error:", err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ======================== GET /api/corner/settings ========================
router.get("/corner/settings", async (req, res) => {
  try {
    const { getCornerSettings } = await import("../services/cornerService.js");
    const settings = getCornerSettings();
    // 出参映射：策略列表同时返回新旧字段
    if (settings.strategies) {
      settings.strategies = settings.strategies.map(mapStrategyFieldsBackward);
    }
    res.json({ success: true, data: settings });
  } catch (err) {
    console.error("[cornerRoutes] GET /corner/settings error:", err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ======================== PUT /api/corner/settings ========================
router.put("/corner/settings", async (req, res) => {
  try {
    const { setCornerSettings } = await import("../services/cornerService.js");
    const settings = req.body || {};
    // 参数验证
    const errors = [];
    if (settings.strongHandicapThreshold !== undefined && (settings.strongHandicapThreshold < 0 || settings.strongHandicapThreshold > 5)) {
      errors.push("strongHandicapThreshold需在0-5之间");
    }
    if (settings.handicapUpperLimit !== undefined && (settings.handicapUpperLimit < -5 || settings.handicapUpperLimit > 10)) {
      errors.push("handicapUpperLimit需在-5到10之间");
    }
    if (settings.handicapLowerLimit !== undefined && (settings.handicapLowerLimit < -5 || settings.handicapLowerLimit > 10)) {
      errors.push("handicapLowerLimit需在-5到10之间");
    }
    if (settings.handicapLowerLimit !== undefined && settings.handicapUpperLimit !== undefined && settings.handicapLowerLimit >= settings.handicapUpperLimit) {
      errors.push("handicapLowerLimit必须小于handicapUpperLimit");
    }
    if (errors.length > 0) {
      return res.status(400).json({ success: false, error: "参数验证失败", details: errors });
    }
    setCornerSettings(settings);
    console.log("[cornerRoutes] 全局设置已同步:", settings);
    res.json({ success: true });
  } catch (err) {
    console.error("[cornerRoutes] PUT /corner/settings error:", err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ======================== GET /api/corner/strategies/default ========================
router.get("/corner/strategies/default", async (req, res) => {
  try {
    const { DEFAULT_STRATEGIES } = await import("../services/cornerService.js");
    // 出参映射：同时返回新旧字段，确保旧版前端兼容
    const mappedStrategies = DEFAULT_STRATEGIES.map(mapStrategyFieldsBackward);
    res.json({ success: true, data: mappedStrategies });
  } catch (err) {
    console.error("[cornerRoutes] /corner/strategies/default error:", err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ======================== 策略字段映射适配器（过渡期兼容） ========================

/**
 * 旧字段 → 新字段映射表
 * 入参映射：将前端发送的旧字段自动转换为新字段
 */
const STRATEGY_FIELD_MAP = {
  playTimeStart: 'minute_min',
  playTimeEnd: 'minute_max',
  cornerHandicapLower: 'line_min',
  cornerHandicapUpper: 'line_max',
  targetOdds: 'odds_min',
  maxOdds: 'odds_max',
  minCurrentCorners: 'corner_min',
  maxCurrentCorners: 'corner_max',
  betDirection: 'direction',
};

/**
 * 新字段 → 旧字段反向映射表
 * 出参映射：返回时同时包含旧字段，确保旧版前端兼容
 */
const STRATEGY_FIELD_MAP_REVERSE = {};
for (const [oldKey, newKey] of Object.entries(STRATEGY_FIELD_MAP)) {
  STRATEGY_FIELD_MAP_REVERSE[newKey] = oldKey;
}

/**
 * 入参映射：将策略对象中的旧字段转换为新字段
 * @param {Object} strategy - 原始策略对象
 * @returns {Object} 映射后的策略对象（仅包含新字段）
 */
function mapStrategyFieldsForward(strategy) {
  const mapped = { ...strategy };
  let hasOldFields = false;

  for (const [oldKey, newKey] of Object.entries(STRATEGY_FIELD_MAP)) {
    if (mapped[oldKey] !== undefined) {
      hasOldFields = true;
      // direction 字段特殊处理：旧值小写 → 新值首字母大写
      if (oldKey === 'betDirection' && typeof mapped[oldKey] === 'string') {
        const val = mapped[oldKey];
        mapped[newKey] = val.charAt(0).toUpperCase() + val.slice(1).toLowerCase();
      } else {
        mapped[newKey] = mapped[oldKey];
      }
      delete mapped[oldKey];
    }
  }

  // 确保新字段有默认值
  if (mapped.market_type === undefined) mapped.market_type = 'auto';
  if (mapped.aiFilterEnabled === undefined) mapped.aiFilterEnabled = false;

  if (hasOldFields) {
    console.warn('[策略迁移] 检测到旧字段请求，已自动适配为新字段格式');
  }

  return mapped;
}

/**
 * 出参映射：为策略对象添加旧字段副本，确保旧版前端兼容
 * @param {Object} strategy - 新字段策略对象
 * @returns {Object} 同时包含新旧字段的策略对象
 */
function mapStrategyFieldsBackward(strategy) {
  const result = { ...strategy };

  for (const [newKey, oldKey] of Object.entries(STRATEGY_FIELD_MAP_REVERSE)) {
    if (strategy[newKey] !== undefined && strategy[oldKey] === undefined) {
      // direction 字段反向映射：首字母大写 → 全小写
      if (newKey === 'direction' && typeof strategy[newKey] === 'string') {
        result[oldKey] = strategy[newKey].toLowerCase();
      } else {
        result[oldKey] = strategy[newKey];
      }
    }
  }

  return result;
}

// ======================== PUT /api/corner/strategies ========================
router.put("/corner/strategies", async (req, res) => {
  try {
    const { strategies } = req.body || {};
    if (!strategies || !Array.isArray(strategies) || strategies.length === 0) {
      return res.status(400).json({ success: false, error: "请提供有效的策略列表" });
    }

    // 入参映射：旧字段 → 新字段
    const mappedStrategies = strategies.map(mapStrategyFieldsForward);

    // 参数验证（兼容新旧字段名）
    const VALID_DIRECTIONS = ["Auto", "Over", "Under", "Home", "Away"];
    const VALID_DIRECTIONS_OLD = ["auto", "over", "under", "home", "away"];
    const VALID_MARKET_TYPES = ["over_under", "handicap", "next_corner", "auto"];
    const VALID_LEAD_SIDES = ["any", "strong", "weak"];
    const errors = [];

    for (const s of mappedStrategies) {
      if (typeof s.id !== 'number' || s.id < 1 || s.id > 10) {
        errors.push(`策略id必须为1-10的数字`);
      }
      // 时间窗口验证（兼容新旧字段）
      const minuteMin = s.minute_min ?? s.playTimeStart;
      const minuteMax = s.minute_max ?? s.playTimeEnd;
      if (minuteMin !== undefined && (minuteMin < 0 || minuteMin > 120)) {
        errors.push(`策略${s.id}: minute_min需在0-120之间`);
      }
      if (minuteMax !== undefined && (minuteMax < 0 || minuteMax > 120)) {
        errors.push(`策略${s.id}: minute_max需在0-120之间`);
      }
      if (minuteMin !== undefined && minuteMax !== undefined && minuteMin >= minuteMax) {
        errors.push(`策略${s.id}: minute_min必须小于minute_max`);
      }
      // 盘口区间验证
      const lineMin = s.line_min ?? s.cornerHandicapLower;
      const lineMax = s.line_max ?? s.cornerHandicapUpper;
      if (lineMin !== undefined && lineMax !== undefined && lineMin > lineMax) {
        errors.push(`策略${s.id}: line_min不能大于line_max`);
      }
      // 赔率验证
      const oddsMin = s.odds_min ?? s.targetOdds;
      const oddsMax = s.odds_max ?? s.maxOdds;
      if (oddsMin !== undefined && (oddsMin < 0 || oddsMin > 3)) {
        errors.push(`策略${s.id}: odds_min需在0-3之间`);
      }
      if (oddsMax !== undefined && (oddsMax < 0 || oddsMax > 3)) {
        errors.push(`策略${s.id}: odds_max需在0-3之间`);
      }
      if (oddsMin !== undefined && oddsMax !== undefined && oddsMin > oddsMax) {
        errors.push(`策略${s.id}: odds_min不能大于odds_max`);
      }
      // 投注方向验证（兼容新旧格式）
      const dir = s.direction || s.betDirection;
      if (dir && !VALID_DIRECTIONS.includes(dir) && !VALID_DIRECTIONS_OLD.includes(dir)) {
        errors.push(`策略${s.id}: direction必须为${VALID_DIRECTIONS.join('/')}`);
      }
      // 市场类型验证
      if (s.market_type && !VALID_MARKET_TYPES.includes(s.market_type)) {
        errors.push(`策略${s.id}: market_type必须为${VALID_MARKET_TYPES.join('/')}`);
      }
      // 领先方身份验证
      if (s.leadSide && !VALID_LEAD_SIDES.includes(s.leadSide)) {
        errors.push(`策略${s.id}: leadSide必须为${VALID_LEAD_SIDES.join('/')}`);
      }
      if (s.leadGoals !== undefined && (s.leadGoals < 0 || s.leadGoals > 20)) {
        errors.push(`策略${s.id}: leadGoals需在0-20之间`);
      }
      if (s.leadGoalsWeak !== undefined && (s.leadGoalsWeak < 0 || s.leadGoalsWeak > 5)) {
        errors.push(`策略${s.id}: leadGoalsWeak需在0-5之间`);
      }
      // 角球数范围验证
      const cornerMin = s.corner_min ?? s.minCurrentCorners;
      const cornerMax = s.corner_max ?? s.maxCurrentCorners;
      if (cornerMin !== undefined && (cornerMin < 0 || cornerMin > 30)) {
        errors.push(`策略${s.id}: corner_min需在0-30之间`);
      }
      if (cornerMax !== undefined && (cornerMax < 0 || cornerMax > 30)) {
        errors.push(`策略${s.id}: corner_max需在0-30之间`);
      }
      if (cornerMin !== undefined && cornerMax !== undefined && cornerMin > cornerMax) {
        errors.push(`策略${s.id}: corner_min不能大于corner_max`);
      }
    }

    if (errors.length > 0) {
      return res.status(400).json({ success: false, error: "参数验证失败", details: errors });
    }

    setCornerStrategies(mappedStrategies);
    console.log("[cornerRoutes] 策略已同步，数量:", mappedStrategies.length);
    res.json({ success: true, count: mappedStrategies.length });
  } catch (err) {
    console.error("[cornerRoutes] PUT /corner/strategies error:", err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});


// ======================== GET /api/corner/history ========================
router.get("/corner/history", async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 20;
    const rows = await getCornerHistory(limit);
    res.json({ success: true, data: rows, count: rows.length });
  } catch (err) {
    console.error("[cornerRoutes] /corner/history error:", err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ======================== POST /api/corner/history ========================
router.post("/corner/history", validateTypes({ matchId: "string", matchName: "string", homeTeam: "string", awayTeam: "string" }), async (req, res) => {
  try {
    const record = req.body || {};
    const result = await saveCornerHistory(record);
    res.json(result);
  } catch (err) {
    console.error("[cornerRoutes] POST /corner/history error:", err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ======================== POST /api/corner/login ========================
// ★ 统一使用 cornerCrawler 的登录实现（内部含凭证验证）
router.post("/corner/login", requireFields(["username", "password"]), validateLength({ username: { min: 1, max: 100 }, password: { min: 1, max: 100 } }), async (req, res) => {
  try {
    const { username, password } = req.body || {};
    if (!username || !password) {
      return res.status(400).json({ success: false, error: "请提供用户名和密码" });
    }

    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error("登录超时，请重试")), 90000)
    );

    const result = await Promise.race([
      cornerLoginToHG(username, password),
      timeoutPromise
    ]);

    if (!result || typeof result !== "object") {
      return res.status(500).json({ success: false, error: "登录服务返回异常数据" });
    }

    // 登录成功后重置浏览器关闭标志
    if (result.success) {
      resetBrowserClosedFlag();
    }

    // 根据失败原因提供友好建议
    if (!result.success) {
      const errorMsg = result.error || "";
      let suggestion = "";
      if (errorMsg.includes("超时")) {
        suggestion = "网站可能暂时无法访问或被屏蔽，请检查网络或尝试设置 CRAWLER_HEADLESS=false 打开可见浏览器排查";
      } else if (errorMsg.includes("浏览器")) {
        suggestion = "请确认 Chrome 或 Edge 已安装，或尝试设置环境变量 CRAWLER_HEADLESS=false";
      } else if (errorMsg.includes("无法连接")) {
        suggestion = "浏览器页面连接失败，请重启服务后重试";
      } else {
        suggestion = "请检查网络连接和凭据是否正确，终端日志可查看详细信息";
      }
      result.suggestion = suggestion;
    }

    res.json(result);
  } catch (err) {
    console.error("[cornerRoutes] /corner/login error:", err.message);
    const errMsg = err.message || "登录服务内部错误";
    let suggestion = "";
    if (errMsg.includes("超时")) {
      suggestion = "登录请求超时（90s），请检查 CRAWLER_HEADLESS 设置或尝试重启服务";
    }
    res.status(500).json({ success: false, error: errMsg, suggestion });
  }
});

// ======================== GET /api/corner/status ========================
router.get("/corner/status", async (req, res) => {
  try {
    const crawlerStatus = getPollingStatus();
    const backendStatus = getBackendPollingStatus();
    res.json({ success: true, data: { crawler: crawlerStatus, backend: backendStatus, balance: getBalance() } });
  } catch (err) {
    console.error("[cornerRoutes] /corner/status error:", err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ======================== GET /api/corner/balance ========================
router.get("/corner/balance", async (req, res) => {
  try {
    // 尝试从浏览器提取真实余额
    const { getSharedPage } = await import("../services/browserPool.js");
    const page = getSharedPage();
    if (page) {
      const balance = await extractBalance(page);
      if (balance !== null) {
        return res.json({ success: true, balance });
      }
    }
    // 浏览器不可用或提取失败，返回缓存余额
    const cachedBalance = getBalance();
    if (cachedBalance) {
      return res.json({ success: true, balance: cachedBalance });
    }
    res.json({ success: false, error: "无法获取余额，请确认已登录", balance: 0 });
  } catch (err) {
    console.error("[cornerRoutes] /corner/balance error:", err.message);
    res.status(500).json({ success: false, error: err.message, balance: 0 });
  }
});

// ======================== POST /api/corner/start ========================
router.post("/corner/start", async (req, res) => {
  try {
    resetBrowserClosedFlag();
    // 启动后端轮询
    const result = startCornerBackendPolling();
    console.log("[cornerRoutes] 后端轮询已启动");
    res.json(result);
  } catch (err) {
    console.error("[cornerRoutes] /corner/start error:", err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ======================== POST /api/corner/stop ========================
router.post("/corner/stop", async (req, res) => {
  try {
    const result = stopCornerBackendPolling();
    res.json(result);
  } catch (err) {
    console.error("[cornerRoutes] /corner/stop error:", err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ======================== POST /api/corner/pause ========================
router.post("/corner/pause", async (req, res) => {
  try {
    const result = pauseCornerBackendPolling();
    res.json(result);
  } catch (err) {
    console.error("[cornerRoutes] /corner/pause error:", err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ======================== POST /api/corner/resume ========================
router.post("/corner/resume", async (req, res) => {
  try {
    const result = resumeCornerBackendPolling();
    res.json(result);
  } catch (err) {
    console.error("[cornerRoutes] /corner/resume error:", err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ======================== GET /api/corner/stats/:strategyId ========================
router.get("/corner/stats/:strategyId", async (req, res) => {
  try {
    const stats = await getStrategyStats(req.params.strategyId);
    res.json({ success: true, data: stats });
  } catch (err) {
    console.error("[cornerRoutes] /corner/stats error:", err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ======================== POST /api/corner/backtest ========================
router.post("/corner/backtest", async (req, res) => {
  try {
    const { strategies } = req.body || {};
    if (!strategies || !Array.isArray(strategies) || strategies.length === 0) {
      return res.status(400).json({ success: false, error: "请提供策略列表" });
    }
    // 入参映射：旧字段 → 新字段
    const mappedStrategies = strategies.map(mapStrategyFieldsForward);
    const result = await runBacktest(mappedStrategies);
    res.json(result);
  } catch (err) {
    console.error("[cornerRoutes] /corner/backtest error:", err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ======================== GET /api/corner/simulation-records ========================
router.get("/corner/simulation-records", async (req, res) => {
  try {
    const { matchId, strategyId, limit } = req.query;
    const rows = await getSimulationRecords({
      matchId: matchId || null,
      strategyId: strategyId || null,
      limit: parseInt(limit) || 50
    });
    res.json({ success: true, data: rows, count: rows.length });
  } catch (err) {
    console.error("[cornerRoutes] /corner/simulation-records error:", err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ======================== GET /api/corner/diagnose ========================
router.get("/corner/diagnose", async (req, res) => {
  try {
    console.log("[cornerRoutes] 启动爬虫诊断...");
    const report = await diagnoseCrawler();
    console.log("[cornerRoutes] 诊断完成, status=" + report.status + " XHR=" + report.interceptedXHRCount + " matches=" + report.matchesFound + " domCorners=" + report.domCornerCount);
    res.json({ success: true, data: report });
  } catch (err) {
    const msg = err.message || String(err);
    console.error("[cornerRoutes] /corner/diagnose error:", msg);
    res.status(500).json({ success: false, error: "诊断失败，请检查爬虫状态", detail: msg });
  }
});

// ======================== GET /api/corner/debug ========================
router.get("/corner/debug", async (req, res) => {
  try {
    const info = getDebugInfo();
    res.json({ success: true, data: info });
  } catch (err) {
    console.error("[cornerRoutes] /corner/debug error:", err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ======================== POST /api/corner/close ========================
router.post("/corner/close", async (req, res) => {
  try {
    stopCornerBackendPolling();
    const result = await closeCrawler();
    res.json(result);
  } catch (err) {
    console.error("[cornerRoutes] /corner/close error:", err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ======================== GET /api/corner/bet-config ========================
router.get("/corner/bet-config", async (req, res) => {
  try {
    const config = getAutoBetConfig();
    res.json({ success: true, data: config });
  } catch (err) {
    console.error("[cornerRoutes] /corner/bet-config GET error:", err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ======================== POST /api/corner/bet-config ========================
router.post("/corner/bet-config", async (req, res) => {
  try {
    const { amount, isRealMode, trackedMatchIds, autoBetEnabled, autoBetConfirmRequired } = req.body || {};
    const config = {};
    if (amount !== undefined) config.amount = amount;
    if (isRealMode !== undefined) config.isRealMode = isRealMode;
    if (trackedMatchIds !== undefined) config.trackedMatchIds = trackedMatchIds;
    if (autoBetEnabled !== undefined) config.autoBetEnabled = autoBetEnabled;
    if (autoBetConfirmRequired !== undefined) config.autoBetConfirmRequired = autoBetConfirmRequired;
    setBetConfig(config);
    res.json({ success: true });
  } catch (err) {
    console.error("[cornerRoutes] /corner/bet-config error:", err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ======================== GET /api/corner/bets ========================
router.get("/corner/bets", async (req, res) => {
  try {
    const { status, limit, matchId } = req.query;
    const rows = await getCornerBets({ status: status || null, limit: parseInt(limit) || 50, matchId: matchId || null });
    res.json({ success: true, data: rows, count: rows.length });
  } catch (err) {
    console.error("[cornerRoutes] /corner/bets error:", err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ======================== POST /api/corner/bets/execute ========================
router.post("/corner/bets/execute", async (req, res) => {
  try {
    const result = await executePendingBets();
    res.json(result);
  } catch (err) {
    console.error("[cornerRoutes] /corner/bets/execute error:", err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ======================== GET /api/corner/alert-status ========================
router.get("/corner/alert-status", async (req, res) => {
  try {
    const status = getAlertStatus();
    res.json({ success: true, data: status });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ======================== GET /api/corner/alert-log ========================
router.get("/corner/alert-log", async (req, res) => {
  try {
    const fs = await import("fs");
    const limit = parseInt(req.query.limit) || 20;
    if (!fs.existsSync("corner_alert_log.jsonl")) {
      return res.json({ success: true, data: [], count: 0 });
    }
    const lines = fs.readFileSync("corner_alert_log.jsonl", "utf-8").trim().split("\n");
    const entries = lines.slice(-limit).map(line => {
      try { return JSON.parse(line); } catch (_) { return null; }
    }).filter(Boolean);
    res.json({ success: true, data: entries, count: entries.length });
  } catch (err) {
    console.error("[cornerRoutes] /corner/alert-log error:", err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ======================== POST /api/corner/bet/manual ========================
router.post("/corner/bet/manual", async (req, res) => {
  try {
    const { matchId, matchName, strategyId, odds, handicap, amount } = req.body || {};

    // 参数校验
    if (!matchId) {
      return res.status(400).json({ success: false, error: "缺少 matchId" });
    }
    if (!strategyId) {
      return res.status(400).json({ success: false, error: "缺少 strategyId" });
    }
    if (!amount || amount <= 0) {
      return res.status(400).json({ success: false, error: "请填写有效金额" });
    }

    // 金额校验
    const maxAmount = getMaxBetAmount();
    if (amount > maxAmount) {
      return res.status(400).json({ success: false, error: "投注金额超限 (" + maxAmount + ")" });
    }

    const result = await addManualBet({
      matchId,
      matchName: matchName || "",
      strategyId: String(strategyId),
      odds: odds || 0,
      handicap: handicap || 0,
      amount
    });

    if (result.success) {
      res.json({ success: true, betId: result.betId, message: "投注已提交" });
    } else {
      res.status(400).json({ success: false, error: result.error });
    }
  } catch (err) {
    console.error("[cornerRoutes] /corner/bet/manual error:", err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ======================== GET /api/corner/pending-confirms ========================
router.get("/corner/pending-confirms", async (req, res) => {
  try {
    const rows = await getPendingConfirms();
    res.json({ success: true, data: rows, count: rows.length });
  } catch (err) {
    console.error("[cornerRoutes] /corner/pending-confirms error:", err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ======================== POST /api/corner/confirm-bet/:id ========================
router.post("/corner/confirm-bet/:id", async (req, res) => {
  try {
    const betId = parseInt(req.params.id);
    if (!betId) {
      return res.status(400).json({ success: false, error: "无效的投注ID" });
    }
    const result = await confirmBet(betId);
    if (result.success) {
      res.json({ success: true, betId: result.betId, message: "投注已确认执行" });
    } else {
      res.status(400).json({ success: false, error: result.error });
    }
  } catch (err) {
    console.error("[cornerRoutes] /corner/confirm-bet error:", err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ======================== POST /api/corner/reject-bet/:id ========================
router.post("/corner/reject-bet/:id", async (req, res) => {
  try {
    const betId = parseInt(req.params.id);
    if (!betId) {
      return res.status(400).json({ success: false, error: "无效的投注ID" });
    }
    const result = await rejectBet(betId);
    if (result.success) {
      res.json({ success: true, message: "投注已拒绝" });
    } else {
      res.status(400).json({ success: false, error: result.error });
    }
  } catch (err) {
    console.error("[cornerRoutes] /corner/reject-bet error:", err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ======================== POST /api/corner/retry-bet/:id ========================
router.post("/corner/retry-bet/:id", async (req, res) => {
  try {
    const betId = parseInt(req.params.id);
    if (!betId) {
      return res.status(400).json({ success: false, error: "无效的投注ID" });
    }
    const result = await retryBet(betId);
    if (!result.success) {
      return res.status(400).json({ success: false, error: result.error });
    }
    res.json({ success: true, betId: result.betId, message: "投注已重新入队" });
  } catch (err) {
    console.error("[cornerRoutes] /corner/retry-bet error:", err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ======================== GET /api/corner/bet-queue-status ========================
router.get("/corner/bet-queue-status", async (req, res) => {
  try {
    const status = getBetQueueStatus();
    res.json({ success: true, data: status });
  } catch (err) {
    console.error("[cornerRoutes] /corner/bet-queue-status error:", err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ======================== GET /api/corner/polling-analytics ========================
router.get("/corner/polling-analytics", async (req, res) => {
  try {
    const analytics = getPollingAnalytics();
    res.json({ success: true, data: analytics });
  } catch (err) {
    console.error("[cornerRoutes] /corner/polling-analytics error:", err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ======================== DELETE /api/corner/history ========================
router.delete("/corner/history", async (req, res) => {
  try {
    const result = await clearHistory();
    if (result.success) {
      res.json({ success: true, message: "历史记录已清空" });
    } else {
      res.status(500).json({ success: false, error: result.error });
    }
  } catch (err) {
    console.error("[cornerRoutes] /corner/history DELETE error:", err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ======================== DELETE /api/corner/reset-backtest ========================
router.delete("/corner/reset-backtest", async (req, res) => {
  try {
    const { run } = await import("../dbService.js");
    await run("DELETE FROM corner_simulation_records");
    console.log("[cornerRoutes] 回测数据已清除");
    res.json({ success: true, message: "回测数据已清除" });
  } catch (err) {
    const msg = err.message || String(err);
    // 表不存在等情况下也视为成功（本来就没有数据）
    if (msg.includes("no such table") || msg.includes("does not exist")) {
      console.log("[cornerRoutes] 无回测数据表，跳过清理");
      return res.json({ success: true, message: "无回测数据" });
    }
    console.error("[cornerRoutes] /corner/reset-backtest error:", msg);
    res.status(500).json({ success: false, error: msg });
  }
});

// ======================== POST /api/corner/simulation-step ========================
// 回测模拟单步执行
router.post("/corner/simulation-step", async (req, res) => {
  try {
    const { runSimulationStep } = await import("../services/cornerService.js");
    if (typeof runSimulationStep !== "function") {
      return res.json({ success: true, matches: [], logs: ["回测模拟功能未启用"] });
    }
    const result = await runSimulationStep();
    res.json({ success: true, matches: result.matches || [], logs: result.logs || [] });
  } catch (err) {
    console.error("[cornerRoutes] /corner/simulation-step error:", err.message);
    res.json({ success: true, matches: [], logs: ["模拟步骤执行异常: " + err.message] });
  }
});

export default router;
