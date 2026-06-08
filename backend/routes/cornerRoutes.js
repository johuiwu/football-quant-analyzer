import { Router } from "express";
import { getLiveCornerData, evaluateStrategies, getCornerHistory, saveCornerHistory, setBetConfig, getAutoBetConfig, executePendingBets, getCornerBets, DEFAULT_STRATEGIES, setCornerStrategies, checkDuplicateBet, addManualBet, getMaxBetAmount, getPendingConfirms, confirmBet, rejectBet } from "../services/cornerService.js";
import { startCornerBackendPolling, stopCornerBackendPolling, pauseCornerBackendPolling, resumeCornerBackendPolling, getBackendPollingStatus, getAlertStatus } from "../services/cornerService.js";
import { diagnoseCrawler, getDebugInfo, closeCrawler, startCornerPolling, stopCornerPolling, getPollingStatus, getBalance, crawlCornerMatches } from "../services/cornerCrawler.js";
import { loginToHG as hgLoginToHG } from "../services/hgCrawlerService.js";
import { getSharedPage, isPageLoggedIn, isBrowserActive } from "../services/browserPool.js";
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
    const cornerMatchList = (result && Array.isArray(result.cornerMatches)) ? result.cornerMatches : [];
    const hdpMatchData = result.hdpMatches || {};
    res.json({
      success: true,
      data: matchList,
      cornerMatches: cornerMatchList,
      hdpMatches: hdpMatchData,
      mainMarkets: result.mainMarkets || {},
      generatedAt: (result && result.generatedAt) || new Date().toISOString(),
      count: matchList.length,
      cornerCount: cornerMatchList.length,
      hdpCount: Object.keys(hdpMatchData).length,
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
    console.log("[cornerRoutes] /corner/fetch 即时爬取开始...");
    const timeoutMs = 90000;
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error("爬取超时（90s）")), timeoutMs)
    );
    const result = await Promise.race([crawlCornerMatches(), timeoutPromise]);
    if (!result || !result.success) {
      const errMsg = (result && result.error) || "爬取失败";
      console.error("[cornerRoutes] /corner/fetch failed:", errMsg);
      return res.status(500).json({ success: false, error: errMsg });
    }
    const matches = result.data?.matches || [];
    const cornerMatches = result.data?.cornerMatches || [];
    const hdpMatches = result.data?.hdpMatches || [];
    console.log("[cornerRoutes] /corner/fetch 完成:", matches.length, "场比赛 (角球=" + cornerMatches.length + " 让球=" + hdpMatches.length + ")");
    res.json({ success: true, data: matches, cornerMatches, hdpMatches, mainMarkets: result.mainMarkets || {}, count: matches.length, cornerCount: cornerMatches.length, hdpCount: hdpMatches.length, source: "live-fetch" });
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

// ======================== GET /api/corner/strategies/default ========================
router.get("/corner/strategies/default", async (req, res) => {
  try {
    const { DEFAULT_STRATEGIES } = await import("../services/cornerService.js");
    res.json({ success: true, data: DEFAULT_STRATEGIES });
  } catch (err) {
    console.error("[cornerRoutes] /corner/strategies/default error:", err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ======================== PUT /api/corner/strategies ========================
router.put("/corner/strategies", async (req, res) => {
  try {
    const { strategies } = req.body || {};
    if (!strategies || !Array.isArray(strategies) || strategies.length === 0) {
      return res.status(400).json({ success: false, error: "请提供有效的策略列表" });
    }
    setCornerStrategies(strategies);
    console.log("[cornerRoutes] 策略已同步，数量:", strategies.length);
    res.json({ success: true, count: strategies.length });
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
// ★ 复用 hgCrawlerService 的登录实现（已验证可用）
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
      hgLoginToHG({ username, password }),
      timeoutPromise
    ]);

    if (!result || typeof result !== "object") {
      return res.status(500).json({ success: false, error: "登录服务返回异常数据" });
    }

    // 根据失败原因提供友好建议（hgCrawler 返回 error 字段）
    if (!result.success) {
      const errorMsg = result.error || "";
      let suggestion = "";
      if (errorMsg.includes("超时")) {
        suggestion = "网站可能暂时无法访问或被屏蔽，请检查网络或尝试设置 CRAWLER_HEADLESS=false 打开可见浏览器排查";
      } else if (errorMsg.includes("浏览器")) {
        suggestion = "请确认 Chromium 已安装（npm install puppeteer 自动安装），或尝试设置环境变量 CRAWLER_HEADLESS=false";
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

// ======================== POST /api/corner/start ========================
router.post("/corner/start", async (req, res) => {
  try {
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
    const result = await runBacktest(strategies);
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

export default router;
