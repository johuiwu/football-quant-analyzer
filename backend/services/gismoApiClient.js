// ======================== gismo API 客户端 ========================
// 从页面拦截 Sportradar/Betradar gismo CDN 请求，提取 token 和 matchId
// 使用提取的 token 请求 gismo API 获取角球数等统计数据
// 与 transform.php 互补：gismo 提供角球数统计，transform 提供盘口赔率

// ---- Token 缓存 ----
let cachedToken = null;
let cachedTokenAt = 0;
const TOKEN_TTL = 3600000; // 1小时（CDN token 有效期较长）

// ---- matchId 缓存 ----
let cachedMatchIds = [];
let matchIdTeamMap = new Map(); // matchId → { homeTeam, awayTeam }

// ---- gismo 响应缓存 ----
let gismoCache = new Map(); // matchId → { cornerData, timestamp }
const GISMO_CACHE_TTL = 10000; // 10秒

// ======================== Token 提取 ========================

/**
 * 从 gismo URL 中提取 CDN token 并缓存
 * URL 格式: https://ws-fn-cdn001.akamaized.net/.../gismo/...?T=exp=xxx~acl=/*~data=xxx~hmac=xxx
 */
export function extractTokenFromUrl(url) {
  if (!url || typeof url !== "string") return false;
  const match = url.match(/[?&]T=([^&\s]+)/);
  if (match && match[1]) {
    cachedToken = match[1];
    cachedTokenAt = Date.now();
    return true;
  }
  return false;
}

/**
 * 获取当前缓存的 token（若未过期）
 */
export function getToken() {
  if (!cachedToken) return null;
  if (Date.now() - cachedTokenAt >= TOKEN_TTL) {
    cachedToken = null;
    return null;
  }
  return cachedToken;
}

// ======================== matchId 提取 ========================

/**
 * 从 gismo URL 中提取 matchId
 * URL 格式: .../gismo/match_info/70771296?T=...
 */
export function extractMatchIdFromUrl(url) {
  if (!url || typeof url !== "string") return null;
  const match = url.match(/gismo\/match_(?:info|details|detailsextended|timelinedelta|timeline)\/(\d+)/);
  if (match && match[1]) {
    const matchId = match[1];
    if (!cachedMatchIds.includes(matchId)) {
      cachedMatchIds.push(matchId);
      console.log("[gismoApi] 新 matchId: " + matchId + " (共 " + cachedMatchIds.length + " 个)");
    }
    return matchId;
  }
  return null;
}

/**
 * 获取所有已知的 matchId
 */
export function getMatchIds() {
  return [...cachedMatchIds];
}

/**
 * 清空 matchId 缓存（新轮次开始时调用）
 */
export function clearMatchIds() {
  cachedMatchIds = [];
  matchIdTeamMap.clear();
}

// ======================== gismo API 请求 ========================

const GISMO_BASE = "https://ws-fn-cdn001.akamaized.net/188bet/en/Etc:UTC/gismo";

/**
 * 在浏览器上下文中请求 gismo API
 * @param {Page} page - Puppeteer 页面
 * @param {string} endpoint - API 端点（如 "match_details"）
 * @param {string} matchId - 比赛 ID
 * @returns {Object|null} JSON 响应或 null
 */
async function fetchGismoApi(page, endpoint, matchId) {
  const token = getToken();
  if (!token) {
    console.log("[gismoApi] 无可用 token，跳过请求");
    return null;
  }

  const url = GISMO_BASE + "/" + endpoint + "/" + matchId + "?T=" + token;

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
      console.log("[gismoApi] " + endpoint + "/" + matchId + " 失败: " + result.error);
      return null;
    }
    return result;
  } catch (e) {
    console.log("[gismoApi] page.evaluate 失败: " + e.message);
    return null;
  }
}

// ======================== 数据解析 ========================

/**
 * 从 match_info 响应中提取比赛基本信息
 * 返回: { matchId, homeTeam, awayTeam, homeScore, awayScore, status, hasCornerCoverage }
 */
export function parseMatchInfo(data) {
  if (!data?.doc?.[0]?.data?.match) return null;
  const match = data.doc[0].data.match;
  const teams = match.teams || {};
  const result = match.result || {};
  const coverage = match.coverage || {};

  return {
    matchId: match._id,
    homeTeam: teams.home?.name || "",
    awayTeam: teams.away?.name || "",
    homeTeamAbbr: teams.home?.abbr || "",
    awayTeamAbbr: teams.away?.abbr || "",
    homeScore: result.home || 0,
    awayScore: result.away || 0,
    status: match.status?.name || "",
    hasCornerCoverage: !!coverage.cornersonly,
    tournament: data.doc[0].data.tournament?.name || "",
  };
}

/**
 * 从 match_details 响应中提取角球数
 * 数据格式: doc[0].data.values["124"] = { name: "Corner kicks", value: { home: N, away: N } }
 */
export function extractCornerCounts(detailsData) {
  if (!detailsData?.doc?.[0]?.data?.values) return null;

  const values = detailsData.doc[0].data.values;

  // key=124 是 "Corner kicks"
  const cornerEntry = values["124"];
  if (cornerEntry && cornerEntry.value && typeof cornerEntry.value.home === "number") {
    return {
      homeCorners: cornerEntry.value.home,
      awayCorners: cornerEntry.value.away,
      totalCorners: cornerEntry.value.home + cornerEntry.value.away,
    };
  }

  // 回退：遍历所有 values 查找 "Corner kicks"
  for (const key of Object.keys(values)) {
    const entry = values[key];
    if (entry && entry.name && entry.name.toLowerCase().includes("corner") && entry.value) {
      return {
        homeCorners: entry.value.home || 0,
        awayCorners: entry.value.away || 0,
        totalCorners: (entry.value.home || 0) + (entry.value.away || 0),
      };
    }
  }

  return null;
}

/**
 * 从 match_details 响应中提取所有统计数据
 */
export function extractAllStats(detailsData) {
  if (!detailsData?.doc?.[0]?.data?.values) return null;

  const values = detailsData.doc[0].data.values;
  const stats = {};

  const statNames = {
    "40": "Ball Possession",
    "45": "Shots on Goal",
    "50": "Shots off Goal",
    "60": "Corner kicks",
    "120": "Attacks",
    "121": "Dangerous Attacks",
    "122": "Fouls",
    "123": "Free Kicks",
    "124": "Corner kicks",
    "125": "Offsides",
    "126": "Yellow Cards",
    "127": "Red Cards",
    "129": "Saves",
  };

  for (const [key, name] of Object.entries(statNames)) {
    if (values[key] && values[key].value) {
      stats[name] = values[key].value;
    }
  }

  return stats;
}

// ======================== 主入口 ========================

/**
 * 获取指定比赛的角球数据（带缓存）
 * @param {Page} page - Puppeteer 页面
 * @param {string} matchId - 比赛 ID
 * @returns {Object|null} { homeCorners, awayCorners, totalCorners } 或 null
 */
export async function fetchCornerData(page, matchId) {
  if (!matchId) return null;

  // 检查缓存
  const cached = gismoCache.get(matchId);
  if (cached && Date.now() - cached.timestamp < GISMO_CACHE_TTL) {
    return cached.cornerData;
  }

  // 请求 match_details
  const detailsData = await fetchGismoApi(page, "match_details", matchId);
  if (!detailsData) return null;

  const cornerData = extractCornerCounts(detailsData);
  if (cornerData) {
    gismoCache.set(matchId, { cornerData, timestamp: Date.now() });
  }
  return cornerData;
}

/**
 * 批量获取所有已知比赛的角球数据
 * @param {Page} page - Puppeteer 页面
 * @returns {Map<string, Object>} matchId → { homeCorners, awayCorners, totalCorners }
 */
export async function fetchAllCornerData(page) {
  const results = new Map();
  const token = getToken();
  if (!token || cachedMatchIds.length === 0) {
    return results;
  }

  console.log("[gismoApi] 批量获取 " + cachedMatchIds.length + " 场比赛角球数据...");

  // 并行请求（最多 5 个并发）
  const batchSize = 5;
  for (let i = 0; i < cachedMatchIds.length; i += batchSize) {
    const batch = cachedMatchIds.slice(i, i + batchSize);
    const promises = batch.map(async (matchId) => {
      const cornerData = await fetchCornerData(page, matchId);
      if (cornerData) {
        results.set(matchId, cornerData);
      }
    });
    await Promise.all(promises);
  }

  console.log("[gismoApi] 获取到 " + results.size + "/" + cachedMatchIds.length + " 场角球数据");
  return results;
}

/**
 * 处理 gismo 响应：提取 match_info 中的球队名映射
 * 在 XHR 拦截中调用，建立 matchId → 球队名的映射
 */
export function processGismoResponse(url, jsonData) {
  if (!url || !jsonData) return;

  // 提取 token
  extractTokenFromUrl(url);

  // 提取 matchId
  const matchId = extractMatchIdFromUrl(url);
  if (!matchId) return;

  // 从 match_info 响应中提取球队名映射
  if (url.includes("match_info")) {
    const info = parseMatchInfo(jsonData);
    if (info && info.homeTeam && info.awayTeam) {
      matchIdTeamMap.set(matchId, {
        homeTeam: info.homeTeam,
        awayTeam: info.awayTeam,
        homeTeamAbbr: info.homeTeamAbbr,
        awayTeamAbbr: info.awayTeamAbbr,
        homeScore: info.homeScore,
        awayScore: info.awayScore,
        hasCornerCoverage: info.hasCornerCoverage,
      });
    }
  }

  // 从 match_details 响应中提取角球数并缓存
  if (url.includes("match_details")) {
    const cornerData = extractCornerCounts(jsonData);
    if (cornerData) {
      gismoCache.set(matchId, { cornerData, timestamp: Date.now() });
    }
  }
}

/**
 * 按球队名匹配查找 gismo 角球数据
 * @param {string} homeTeam - 主队名
 * @param {string} awayTeam - 客队名
 * @returns {Object|null} { homeCorners, awayCorners, totalCorners, matchId } 或 null
 */
export function findCornerDataByTeamName(homeTeam, awayTeam) {
  if (!homeTeam || !awayTeam) return null;

  const normalize = (name) => (name || "").toLowerCase().replace(/[^a-z0-9]/g, "");

  for (const [matchId, teamInfo] of matchIdTeamMap) {
    const gismoHome = normalize(teamInfo.homeTeam);
    const gismoAway = normalize(teamInfo.awayTeam);
    const matchHome = normalize(homeTeam);
    const matchAway = normalize(awayTeam);

    // 精确匹配或包含匹配
    if ((gismoHome === matchHome || gismoHome.includes(matchHome) || matchHome.includes(gismoHome)) &&
        (gismoAway === matchAway || gismoAway.includes(matchAway) || matchAway.includes(gismoAway))) {
      const cached = gismoCache.get(matchId);
      if (cached?.cornerData) {
        return { ...cached.cornerData, matchId };
      }
    }
  }

  return null;
}

/**
 * 从页面 DOM 中提取 gismo CDN token
 * 优先级：1) window.gismoToken 全局变量  2) script/iframe src 中的 T= 参数
 * @param {Page} page - Puppeteer 页面
 * @returns {string|null} 提取到的 token 或 null
 */
export async function extractTokenFromPage(page) {
  let token = null;

  // 策略1：检查页面全局变量
  try {
    token = await page.evaluate(() => window.gismoToken);
  } catch (_) {
    // 忽略 evaluate 异常
  }

  // 策略2：从 script/iframe src 中提取
  if (!token) {
    try {
      token = await page.evaluate(() => {
        const scripts = document.querySelectorAll('script[src*="akamaized.net"]');
        for (const s of scripts) {
          const m = s.src.match(/[?&]T=([^&\s]+)/);
          if (m) return m[1];
        }
        const iframes = document.querySelectorAll('iframe[src*="akamaized.net"]');
        for (const f of iframes) {
          const m = f.src.match(/[?&]T=([^&\s]+)/);
          if (m) return m[1];
        }
        return null;
      });
    } catch (_) {
      // 忽略 evaluate 异常
    }
  }

  if (token) {
    cachedToken = token;
    cachedTokenAt = Date.now();
    console.log(`[gismo] 从页面提取到 token: ${token.substring(0, 8)}...`);
  } else {
    console.log("[gismo] 无法从页面提取 token，将回退到 XHR 拦截");
  }

  return token;
}

/**
 * 批量将 matchId（ECID）添加到缓存
 * @param {string[]} ids - matchId 数组
 */
export function addMatchIds(ids) {
  if (!Array.isArray(ids) || ids.length === 0) return;
  for (const id of ids) {
    if (!cachedMatchIds.includes(id)) {
      cachedMatchIds.push(id);
    }
  }
  console.log(`[gismo] 添加 ${ids.length} 个 matchId 到缓存`);
}

/**
 * 获取 gismo 状态信息（调试用）
 */
export function getGismoStatus() {
  return {
    hasToken: !!cachedToken,
    tokenAge: cachedToken ? Math.round((Date.now() - cachedTokenAt) / 1000) + "s" : "none",
    matchIdCount: cachedMatchIds.length,
    matchIds: cachedMatchIds,
    teamMapSize: matchIdTeamMap.size,
    cacheSize: gismoCache.size,
  };
}

/**
 * 清空所有缓存（新会话时调用）
 */
export function resetAll() {
  cachedToken = null;
  cachedTokenAt = 0;
  cachedMatchIds = [];
  matchIdTeamMap.clear();
  gismoCache.clear();
}
