// ======================== gismo 实时数据订阅器 ========================
// 使用 match_timelinedelta 端点轮询比赛实时数据（比分、角球、时间等）
// 支持变更检测、比赛结束自动退订、Token 失效自动刷新

import { getToken, extractTokenFromPage } from "./gismoApiClient.js";

const GISMO_BASE = "https://ws-fn-cdn001.akamaized.net/188bet/en/Etc:UTC/gismo";
const POLL_INTERVAL = 3000; // 轮询间隔 3 秒

// ---- 订阅状态 ----
const timers = new Map();       // matchId → interval timer
const lastState = new Map();    // matchId → { homeScore, awayScore, totalCorners, elapsedMinutes }
const failCounts = new Map();   // matchId → 连续失败次数
const MAX_CONSECUTIVE_FAILURES = 10; // 连续失败超过此阈值触发 Token 刷新

// ---- Token 刷新全局锁 ----
let isRefreshingToken = false;  // 全局互斥锁，防止多个 matchId 并发刷新
let tokenRefreshFailCount = 0;  // Token 刷新连续失败计数
const TOKEN_REFRESH_LOG_INTERVAL = 3; // 每失败 N 次才输出一次警告日志，避免刷屏

// ---- 订阅参数缓存（用于刷新 Token 后重新订阅） ----
let cachedCallback = null;
let cachedPage = null;
let cachedOnMatchEnded = null;

// ======================== Token 刷新 ========================

/**
 * 尝试刷新 Token（带全局互斥锁）
 * 刷新成功：重置所有 failCount，Token 自动缓存到 gismoApiClient
 * 刷新失败：输出警告日志，重置所有 failCount 继续重试
 * @returns {Promise<boolean>} 是否刷新成功
 */
async function tryRefreshToken() {
  if (isRefreshingToken) {
    // 其他 matchId 正在刷新，直接跳过等待
    return false;
  }

  isRefreshingToken = true;
  try {
    if (!cachedPage || cachedPage.isClosed()) {
      tokenRefreshFailCount++;
      if (tokenRefreshFailCount % TOKEN_REFRESH_LOG_INTERVAL === 1) {
        console.warn("[GismoSubscriber] \u26a0\ufe0f Token 刷新失败（page 不可用），等待下一轮重试");
      }
      return false;
    }

    const newToken = await extractTokenFromPage(cachedPage);
    if (newToken) {
      tokenRefreshFailCount = 0;
      console.log("[GismoSubscriber] \u2705 Token 刷新成功，重置所有 failCount 继续轮询");
      // 重置所有 matchId 的 failCount（Token 是全局共享的）
      for (const mid of failCounts.keys()) {
        failCounts.set(mid, 0);
      }
      return true;
    } else {
      tokenRefreshFailCount++;
      if (tokenRefreshFailCount % TOKEN_REFRESH_LOG_INTERVAL === 1) {
        console.warn("[GismoSubscriber] \u26a0\ufe0f Token 刷新失败（凭证可能已彻底失效），请检查账号凭证。等待下一轮重试...");
      }
      // 刷新失败也重置 failCount，让系统继续重试而非退订
      for (const mid of failCounts.keys()) {
        failCounts.set(mid, 0);
      }
      return false;
    }
  } catch (error) {
    tokenRefreshFailCount++;
    if (tokenRefreshFailCount % TOKEN_REFRESH_LOG_INTERVAL === 1) {
      console.error("[GismoSubscriber] \u274c Token 刷新过程发生异常:", error.message);
    }
    // 异常也重置 failCount，继续重试
    for (const mid of failCounts.keys()) {
      failCounts.set(mid, 0);
    }
    return false;
  } finally {
    isRefreshingToken = false; // 绝对必须释放锁！
  }
}

// ======================== 数据解析 ========================

/**
 * 解析 match_timelinedelta 响应
 * @param {Object} data - gismo API 响应
 * @returns {Object|null} 解析后的比赛实时数据
 */
export function parseTimelineDelta(data) {
  if (!data?.doc?.[0]?.data?.match) return null;

  const match = data.doc[0].data.match;
  const events = data.doc[0].data.events || [];
  const timeinfo = match.timeinfo || {};
  const result = match.result || {};
  const status = match.status || {};
  const teams = match.teams || {};

  // 统计角球事件
  let homeCorners = 0;
  let awayCorners = 0;
  for (const evt of events) {
    if (evt.type === "corner") {
      if (evt.team === "home") homeCorners++;
      else if (evt.team === "away") awayCorners++;
    }
  }

  const elapsedSeconds = parseInt(timeinfo.played, 10) || 0;

  return {
    matchId: match._id,
    elapsedSeconds,
    elapsedMinutes: Math.floor(elapsedSeconds / 60),
    homeScore: result.home ?? 0,
    awayScore: result.away ?? 0,
    matchStatus: status.name || "",
    matchStatusShort: status.shortName || "",
    liveStatus: match.matchstatus || "",
    isRunning: !!timeinfo.running,
    homeTeam: teams.home?.name || "",
    awayTeam: teams.away?.name || "",
    homeCorners,
    awayCorners,
    totalCorners: homeCorners + awayCorners,
    timestamp: Date.now(),
  };
}

// ======================== 变更检测 ========================

/**
 * 对比当前数据与上次状态，标记变更字段
 * @param {Object} deltaData - 当前解析数据
 * @returns {Object} 带 changed 和 changes 标记的数据
 */
function detectChanges(deltaData) {
  const prev = lastState.get(deltaData.matchId);
  if (!prev) {
    // 首次获取，视为有变更
    deltaData.changed = true;
    deltaData.changes = { scoreChanged: true, cornerChanged: true, timeChanged: true };
  } else {
    const scoreChanged = deltaData.homeScore !== prev.homeScore || deltaData.awayScore !== prev.awayScore;
    const cornerChanged = deltaData.totalCorners !== prev.totalCorners;
    const timeChanged = deltaData.elapsedMinutes !== prev.elapsedMinutes;
    deltaData.changed = scoreChanged || cornerChanged || timeChanged;
    deltaData.changes = { scoreChanged, cornerChanged, timeChanged };
  }

  // 更新上次状态
  lastState.set(deltaData.matchId, {
    homeScore: deltaData.homeScore,
    awayScore: deltaData.awayScore,
    totalCorners: deltaData.totalCorners,
    elapsedMinutes: deltaData.elapsedMinutes,
  });

  return deltaData;
}

// ======================== 订阅管理 ========================

/**
 * 订阅比赛实时数据
 * @param {string[]} matchIds - 比赛 ID 列表
 * @param {Function} callback - 数据回调 (deltaData) => void
 * @param {Page} page - Puppeteer 页面对象
 * @param {Function} [onMatchEnded] - 比赛结束回调 (matchId) => void
 */
export function subscribeMatches(matchIds, callback, page, onMatchEnded) {
  if (!Array.isArray(matchIds) || matchIds.length === 0) {
    console.log("[GismoSubscriber] matchIds 为空，跳过订阅");
    return;
  }

  // 缓存订阅参数（用于 Token 刷新后恢复）
  cachedCallback = callback;
  cachedPage = page;
  cachedOnMatchEnded = onMatchEnded;

  for (const matchId of matchIds) {
    // 已订阅则跳过
    if (timers.has(matchId)) continue;

    const timer = setInterval(async () => {
      // 检测 page 是否已关闭
      if (page && page.isClosed()) {
        console.log("[GismoSubscriber] page 已关闭，自动退订 matchId=" + matchId);
        unsubscribeMatches([matchId]);
        return;
      }

      const token = getToken();
      if (!token) {
        const fails = (failCounts.get(matchId) || 0) + 1;
        failCounts.set(matchId, fails);
        if (fails >= MAX_CONSECUTIVE_FAILURES) {
          // 达到阈值：先尝试刷新 Token，不直接退订
          console.log("[GismoSubscriber] token 连续不可用 " + fails + " 次，尝试刷新 Token (matchId=" + matchId + ")");
          await tryRefreshToken();
        } else {
          console.log("[GismoSubscriber] 无可用 token (" + fails + "/" + MAX_CONSECUTIVE_FAILURES + ")，跳过轮询 matchId=" + matchId);
        }
        return;
      }

      const url = GISMO_BASE + "/match_timelinedelta/" + matchId + "?T=" + token;

      try {
        const result = await page.evaluate(async (fetchUrl) => {
          try {
            const resp = await fetch(fetchUrl, { credentials: "omit" });
            if (!resp.ok) return { error: "http_" + resp.status };
            return await resp.json();
          } catch (e) {
            return { error: e.message };
          }
        }, url);

        if (result.error) {
          const fails = (failCounts.get(matchId) || 0) + 1;
          failCounts.set(matchId, fails);
          if (fails >= MAX_CONSECUTIVE_FAILURES) {
            // 达到阈值：先尝试刷新 Token，不直接退订
            console.log("[GismoSubscriber] matchId=" + matchId + " 连续请求失败 " + fails + " 次，尝试刷新 Token");
            await tryRefreshToken();
          } else {
            console.log("[GismoSubscriber] matchId=" + matchId + " 请求失败: " + result.error + " (" + fails + "/" + MAX_CONSECUTIVE_FAILURES + ")");
          }
          return;
        }

        // 请求成功，重置失败计数和刷新失败计数
        failCounts.set(matchId, 0);
        tokenRefreshFailCount = 0;

        const deltaData = parseTimelineDelta(result);
        if (!deltaData) return;

        // 变更检测
        detectChanges(deltaData);

        // 回调通知
        callback(deltaData);

        // 比赛结束自动退订（仅此场景才退订）
        if (deltaData.liveStatus !== "live" || !deltaData.isRunning) {
          console.log("[GismoSubscriber] matchId " + matchId + " ended, unsubscribing");
          if (onMatchEnded) onMatchEnded(matchId);
          unsubscribeMatches([matchId]);
        }
      } catch (e) {
        const fails = (failCounts.get(matchId) || 0) + 1;
        failCounts.set(matchId, fails);
        if (fails >= MAX_CONSECUTIVE_FAILURES) {
          // 达到阈值：先尝试刷新 Token，不直接退订
          console.log("[GismoSubscriber] matchId=" + matchId + " 连续异常 " + fails + " 次，尝试刷新 Token: " + e.message);
          await tryRefreshToken();
        } else {
          console.log("[GismoSubscriber] matchId=" + matchId + " 轮询异常: " + e.message);
        }
      }
    }, POLL_INTERVAL);

    timers.set(matchId, timer);
    console.log("[GismoSubscriber] 已订阅 matchId=" + matchId);
  }
}

/**
 * 退订指定比赛
 * @param {string[]} matchIds - 比赛 ID 列表
 */
export function unsubscribeMatches(matchIds) {
  if (!Array.isArray(matchIds)) return;
  for (const matchId of matchIds) {
    const timer = timers.get(matchId);
    if (timer) {
      clearInterval(timer);
      timers.delete(matchId);
      lastState.delete(matchId);
      failCounts.delete(matchId);
      console.log("[GismoSubscriber] 已退订 matchId=" + matchId);
    }
  }
}

/**
 * 退订所有比赛
 */
export function unsubscribeAll() {
  for (const [matchId, timer] of timers) {
    clearInterval(timer);
  }
  timers.clear();
  lastState.clear();
  failCounts.clear();
  isRefreshingToken = false;
  tokenRefreshFailCount = 0;
  console.log("[GismoSubscriber] 已退订所有比赛");
}

/**
 * 获取订阅器状态
 * @returns {Object} { activeSubscriptions, matchIds, hasToken }
 */
export function getSubscriberStatus() {
  return {
    activeSubscriptions: timers.size,
    matchIds: [...timers.keys()],
    hasToken: !!getToken(),
  };
}
