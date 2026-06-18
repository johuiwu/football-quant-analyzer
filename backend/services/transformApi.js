// ======================== transform.php API 直调模块 ========================
// 在浏览器上下文中用 fetch() 调用 transform.php，替代 DOM 解析
// 三层 fallback 提取 uid/ver：DOM context → 请求拦截 → 缓存
// ★ 修复：Layer1 增加 page.cookies() 回退读取 HttpOnly uid
// ★ 修复：extractFromRequest 超时后清理事件监听器，防止泄漏
// ★ 修复：Layer1 找到 ver 时直接从 cookies API 补充 uid，跳过 Layer2

import { HG_URL, setUid, getUid } from "./browserPool.js";
import { extractVerFromRequest, getCurrentVer } from "./transformSigner.js";
import { addMatchIds } from "./gismoApiClient.js";

// ---- transform.php 基础 URL ----
const API_BASE = HG_URL + "/transform.php";

// ---- rtype 枚举 ----
export const RTYPE = {
  RB: "rb",         // 滚球基本盘 (live)
  RCN: "rcn",       // 滚球角球盘口 (live)
  RNOU: "rrnou",    // 滚球 HDP & O/U (live)
  R: "r",           // 今日基本盘 (today)
  CN: "cn",         // 今日角球盘口 (today)
  RNOU_TODAY: "rnou", // 今日 HDP & O/U (today)
};

// ---- uid/ver 缓存 ----
let cachedUid = null;
let cachedUidAt = 0;
const CACHE_TTL = 60000; // 60s

function setCachedUid(uid) {
  if (uid) { cachedUid = uid; cachedUidAt = Date.now(); setUid(uid); }
}

function getCachedUid() {
  // 最高优先级：global.HG_UID（HgCrawler 登录时从 chk_login 提取）
  if (global.HG_UID && global.HG_UID.length >= 10 && !global.HG_UID.endsWith("=")) {
    cachedUid = global.HG_UID;
    cachedUidAt = Date.now();
    return global.HG_UID;
  }
  // 优先本地缓存
  if (cachedUid && (Date.now() - cachedUidAt) < CACHE_TTL) return cachedUid;
  // 回退到 browserPool（登录时从 chk_login 提取的 uid）
  try {
    const bpUid = getUid();
    if (bpUid && bpUid.length >= 10 && !bpUid.endsWith("=")) {
      console.log("[transformApi] getCachedUid: 使用 browserPool 缓存的 uid");
      cachedUid = bpUid;
      cachedUidAt = Date.now();
      return bpUid;
    }
  } catch(e) {}
  cachedUid = null;
  return null;
}

// ======================== 参数提取（三层 fallback）========================

/**
 * Layer 1: 从 DOM context 读取 uid/ver
 * ★ 修复：优先从 top.uid DOM 全局变量提取（页面 JS 登录后设置），
 *   而非 cookie（uid 是 HttpOnly，document.cookie 读不到）
 */
async function extractFromPage(page) {
  try {
    const params = await page.evaluate(() => {
      // ★ 优先从 top.uid / window.uid 提取（页面 JS 登录后设置的全局变量）
      let uid = "";
      try { uid = top.uid || window.uid || ""; } catch(e) { uid = window.uid || ""; }

      // 如果 top.uid 无效（undefined / 长度不足 / base64 用户名），再从 cookie 读取
      const isValidUid = (u) => u && u !== "undefined" && u.length >= 10 && !u.endsWith("=");
      if (!isValidUid(uid)) {
        uid = "";
        const cookies = document.cookie.split(";").map(c => c.trim());
        for (const c of cookies) {
          const parts = c.split("=");
          if (parts[0].trim() === "uid") { uid = parts.slice(1).join("="); break; }
        }
      }

      // ver from global
      let ver = "";
      try { ver = top.ver || window.ver || ""; } catch(e) { ver = window.ver || ""; }
      const htmlLang = document.documentElement?.lang || "en-us";
      return { uid, ver, langx: htmlLang || "en-us" };
    });

    if (params.ver) {
      extractVerFromRequest("transform.php?ver=" + params.ver);
    }
    // 校验 uid 不是 base64 用户名（endsWith "=" 或长度 < 10）也不是 "undefined"
    const isValidUid = (u) => u && u !== "undefined" && u.length >= 10 && !u.endsWith("=");
    if (params.uid && !isValidUid(params.uid)) {
      console.log("[transformApi] Layer1: cookie uid 是 base64 用户名或无效, 丢弃: " + params.uid.substring(0, 16));
      params.uid = "";
    }
    if (params.uid) {
      setCachedUid(params.uid);
      console.log("[transformApi] Layer1: uid from top.uid/window.uid: " + params.uid.substring(0, 12) + "...");
    }

    // 回退：从页面 URL 提取 uid
    if (!params.uid) {
      try {
        const pageUrl = page.url();
        const urlMatch = pageUrl.match(/[?&]uid=([^&]+)/);
        if (urlMatch && urlMatch[1] && isValidUid(urlMatch[1])) {
          params.uid = urlMatch[1];
          setCachedUid(urlMatch[1]);
          console.log("[transformApi] Layer1: uid from page URL");
        }
      } catch (e) { /* ignore */ }
    }

    // 回退：从 page.cookies() 提取（但 UID cookie 存的是 base64 用户名，不是真正的 uid）
    if (!params.uid) {
      try {
        const allCookies = await page.cookies();
        for (const c of allCookies) {
          if (c.name.toLowerCase() === "uid" && c.value) {
            if (!isValidUid(c.value)) {
              console.log("[transformApi] Layer1: page.cookies() uid 也是 base64 用户名, 跳过");
              continue;
            }
            params.uid = c.value;
            setCachedUid(c.value);
            console.log("[transformApi] Layer1: uid from page.cookies()");
            break;
          }
        }
      } catch (e) { /* ignore */ }
    }

    return { uid: params.uid || "", ver: params.ver || "", langx: params.langx || "en-us" };
  } catch (e) {
    console.warn("[transformApi] Layer1 (DOM) failed:", e.message);
    return { uid: "", ver: "", langx: "en-us" };
  }
}

/**
 * Layer 2: 监听页面发出的 transform 请求，从 URL 提取 ver，从 cookies API 提取 uid
 * ★ 修复：超时后清理事件监听器，防止泄漏
 * ★ 修复：缩短超时 8s → 5s
 */
async function extractFromRequest(page) {
  let eventHandler = null;
  let reqHandler = null;
  let timer = null;

  try {
    console.log("[transformApi] Layer2: waiting for transform request...");

    // 等待一个 transform 请求（最大 5s）
    const response = await new Promise((resolve, reject) => {
      const cleanup = () => {
        if (eventHandler) page.off("response", eventHandler);
        if (reqHandler) page.off("request", reqHandler);
      };

      timer = setTimeout(() => {
        cleanup();
        reject(new Error("timeout"));
      }, 10000);

      eventHandler = (resp) => {
        const url = resp.url();
        // ★ 扩大匹配：包含 transform 且 ver= 的任何请求
        if (url.includes("transform") && url.includes("ver=")) {
          clearTimeout(timer);
          cleanup();
          resolve(resp);
        }
      };

      page.on("response", eventHandler);

            // request handler (also extracts uid from POST body)
      reqHandler = (req) => {
        const url = req.url();
        if (url.includes("transform") && url.includes("ver=")) {
          // Extract ver from URL
          extractVerFromRequest(url);
          // Extract uid from POST body
          const body = req.postData() || "";
          const uidMatch = body.match(/uid=([^&\\s]+)/);
          if (uidMatch && uidMatch[1]) {
            setCachedUid(uidMatch[1]);
            console.log("[transformApi] Layer2: uid from POST body");
          }
          clearTimeout(timer);
          cleanup();
          resolve({ url: () => url });
        }
      };
      page.on("request", reqHandler);
    });

    const url = typeof response.url === "function" ? response.url() : response.url();
    console.log("[transformApi] Layer2: intercepted " + url.substring(0, 120));

    // 提取 ver
    extractVerFromRequest(url);

    // 提取 uid from cookies
    let uid = getCachedUid();
    if (!uid) {
      try {
        const cookies = await page.cookies();
        for (const c of cookies) {
          if (c.name.toLowerCase() === "uid" && c.value) {
            const isValidUid = (u) => u && u.length >= 10 && !u.endsWith("=");
            if (isValidUid(c.value)) {
              uid = c.value;
              setCachedUid(uid);
            } else {
              console.log("[transformApi] Layer2: page.cookies() uid 是 base64 用户名, 丢弃");
            }
            break;
          }
        }
      } catch (e) { /* ignore */ }
    }

    const ver = getCurrentVer();
    console.log("[transformApi] Layer2: uid=" + (uid ? uid.substring(0, 8) + "..." : "MISSING") + " ver=" + (ver ? ver.substring(0, 16) + "..." : "MISSING"));

    return { uid: uid || "", ver: ver || "", langx: "en-us" };

  } catch (e) {
    console.warn("[transformApi] Layer2 (intercept) failed:", e.message);
    // ★ 确保清理
    if (eventHandler) page.off("response", eventHandler);
    if (reqHandler) page.off("request", reqHandler);
    return { uid: "", ver: "", langx: "en-us" };
  }
}

/**
 * Layer 3: 从缓存读取
 */
function extractFromCache() {
  const ver = getCurrentVer();
  const uid = getCachedUid();
  if (ver && uid) {
    console.log("[transformApi] Layer3: using cached params");
    return { uid, ver, langx: "en-us" };
  }
  return { uid: "", ver: "", langx: "en-us" };
}

// ======================== 主动 uid 获取 ========================

/**
 * 主动确保 uid 可用：如果缓存中没有，从 DOM 全局变量或请求拦截获取
 * ★ 修复：解决 uid 提取时序问题（chk_login 响应可能还未到达）
 */
async function ensureUid(page) {
  // 1. 先检查缓存（含 global.HG_UID 和 browserPool）
  const cached = getCachedUid();
  if (cached) return cached;

  // 2. 从 DOM 全局变量获取（top.uid 是页面 JS 登录后设置的全局变量）
  try {
    const uid = await page.evaluate(() => {
      try { return top.uid || window.uid || ""; } catch(e) { return window.uid || ""; }
    });
    if (uid && uid !== "undefined" && uid.length >= 10 && !uid.endsWith("=")) {
      setCachedUid(uid);
      console.log("[transformApi] ensureUid: uid from top.uid: " + uid.substring(0, 12) + "...");
      return uid;
    }
  } catch (e) {}

  // 3. 从页面即将发出的 POST body 拦截（等待下一个带有效 uid 的请求）
  try {
    console.log("[transformApi] ensureUid: 等待带 uid 的请求...");
    const uidFromRequest = await new Promise((resolve) => {
      const timer = setTimeout(() => {
        page.off("request", handler);
        resolve(null);
      }, 8000);

      const handler = (req) => {
        const body = req.postData() || "";
        const match = body.match(/uid=([a-zA-Z0-9]{10,})/);
        if (match && match[1] && match[1] !== "undefined" && !match[1].endsWith("=")) {
          clearTimeout(timer);
          page.off("request", handler);
          resolve(match[1]);
        }
      };
      page.on("request", handler);
    });
    if (uidFromRequest) {
      setCachedUid(uidFromRequest);
      console.log("[transformApi] ensureUid: uid from request body: " + uidFromRequest.substring(0, 12) + "...");
      return uidFromRequest;
    }
  } catch (e) {}

  console.warn("[transformApi] ensureUid: 所有方法均失败");
  return null;
}

// ======================== 主入口 ========================

/**
 * 提取 transform.php 请求参数（三层 fallback 链 + ensureUid）
 */
export async function extractParams(page) {
  // ★ 优先从 global.HG_VER 读取 ver（由 cornerCrawler 拦截设置）
  if (global.HG_VER) {
    const uid = getCachedUid();
    if (uid) {
      console.log("[transformApi] params from global.HG_VER (intercepted ver)");
      return { uid, ver: global.HG_VER, langx: "en-us" };
    }
    // ver 可用但 uid 缺失，继续获取 uid
    const ensuredUid = await ensureUid(page);
    if (ensuredUid) {
      console.log("[transformApi] params from global.HG_VER + ensureUid");
      return { uid: ensuredUid, ver: global.HG_VER, langx: "en-us" };
    }
  }

  // 1. 缓存
  const cached = extractFromCache();
  if (cached.uid && cached.ver) return cached;

  // 2. DOM context（优先 top.uid，回退 cookie）
  const dom = await extractFromPage(page);
  if (dom.uid && dom.ver) {
    console.log("[transformApi] params from DOM context");
    return dom;
  }

  // 3. 如果 ver 已有但 uid 缺失，主动获取 uid
  if (dom.ver && !dom.uid) {
    const uid = await ensureUid(page);
    if (uid) {
      console.log("[transformApi] params from DOM (ver) + ensureUid");
      return { uid, ver: dom.ver, langx: dom.langx || "en-us" };
    }
  }

  // 4. 请求拦截（等待 transform 请求）
  const intercepted = await extractFromRequest(page);
  if (intercepted.uid && intercepted.ver) {
    console.log("[transformApi] params from request interception");
    return intercepted;
  }

  // 5. 最后尝试：ver 从缓存，uid 从 ensureUid
  const ver = getCurrentVer() || dom.ver || intercepted.ver;
  if (ver) {
    const uid = await ensureUid(page);
    if (uid) {
      console.log("[transformApi] params from fallback (ver cache + ensureUid)");
      return { uid, ver, langx: "en-us" };
    }
  }

  console.warn("[transformApi] all extraction methods failed");
  return { uid: "", ver: "", langx: "en-us" };
}

/**
 * 带重试的参数获取：缓存优先 + 等待首页请求 + 三层提取
 */
export async function extractParamsWithRetry(page) {
  // ★ 优先从 global.HG_VER 读取 ver
  if (global.HG_VER) {
    const uid = getCachedUid();
    if (uid) {
      console.log("[transformApi] paramsWithRetry: using global.HG_VER");
      return { uid, ver: global.HG_VER, langx: "en-us" };
    }
  }

  // 先试缓存
  const cached = extractFromCache();
  if (cached.uid && cached.ver) return cached;

  // 等待首页自然发出的 transform 请求（1.5s 足够）
  console.log("[transformApi] waiting for homepage transform requests...");
  await new Promise(r => setTimeout(r, 1500));

  // 三层提取
  return await extractParams(page);
}

// ======================== API 请求 ========================

async function fetchInBrowser(page, url, body = null) {
  try {
    const result = await page.evaluate(async ({ fetchUrl, fetchBody }) => {
      try {
        const opts = { credentials: "include" };
        if (fetchBody) {
          opts.method = "POST";
          // ★ 必须包含 X-Requested-With: XMLHttpRequest，否则服务器返回 HTML 页面而非 XML 数据
          opts.headers = {
            "Content-Type": "application/x-www-form-urlencoded",
            "X-Requested-With": "XMLHttpRequest",
          };
          opts.body = fetchBody;
        } else {
          opts.method = "GET";
          opts.headers = { "X-Requested-With": "XMLHttpRequest" };
        }
        const resp = await fetch(fetchUrl, opts);
        if (!resp.ok) return { error: "http_" + resp.status, status: resp.status };
        const text = await resp.text();
        return { ok: true, text, status: resp.status };
      } catch (e) { return { error: e.message, status: 0 }; }
    }, { fetchUrl: url, fetchBody: body });

    if (result.error) { console.warn("[transformApi] fetch error:", result.error); return null; }

    // ★ 检测 HTML 响应（预期 XML，若服务器未识别为 XHR 则返回 HTML）
    if (result.text && (result.text.trimStart().startsWith("<!") || result.text.includes("<!DOCTYPE html>"))) {
      console.warn("[transformApi] 收到 HTML 响应（预期 XML），X-Requested-With 可能未生效, length=" + result.text.length);
    }

    return result.text;
  } catch (e) { console.warn("[transformApi] page.evaluate failed:", e.message); return null; }
}

export async function fetchGameList(page, rtype, extraParams = {}) {
  const cachedUidDebug = getCachedUid();
  console.log("[transformApi] fetchGameList: 当前缓存的 uid=" + (cachedUidDebug ? cachedUidDebug.substring(0, 16) + "..." : "MISSING"));
  const params = await extractParamsWithRetry(page);
  if (!params.uid || !params.ver) {
    console.warn("[transformApi] fetchGameList: Missing uid/ver, cannot request");
    return null;
  }

  // ★ 根据 rtype 自动判断 showtype：rb/rcn/rrnou 是 live，r/cn/rnou 是 today
  const isLiveRtype = ["rb", "rcn", "rrnou"].includes(rtype);
  const defaultShowtype = isLiveRtype ? "live" : "today";

  const ts = Date.now();
  const body = new URLSearchParams({
    uid: params.uid, ver: params.ver, langx: params.langx || "en-us",
    p: "get_game_list", gtype: "ft",
    showtype: extraParams.showtype || defaultShowtype,
    rtype: rtype, ltype: "3",
    sorttype: extraParams.sorttype || "L",
    ts: String(ts), chgSortTS: String(ts),
    // ★ today 模式需要额外参数
    ...(isLiveRtype ? {} : { p3type: "", date: "", filter: "FT", cupFantasy: "N", specialClick: "", isFantasy: "N" }),
    ...extraParams,
  });

  // ver 放 URL query，其余参数放 POST body（与真实浏览器行为一致）
  const url = API_BASE + "?ver=" + encodeURIComponent(params.ver);
  console.log("[transformApi] fetching " + rtype + " (get_game_list, POST, showtype=" + (extraParams.showtype || defaultShowtype) + ") ...");

  const text = await fetchInBrowser(page, url, body.toString());

  // ★ 校验响应格式：如果不是 XML，回退到 game_list_FT
  if (!text) {
    console.warn("[transformApi] " + rtype + " get_game_list 返回空，回退到 game_list_FT...");
    return await fetchGameList_FT(page, rtype);
  }
  // ★ 检测 HTML 响应（服务器未识别为 XHR 请求时返回 HTML 页面）
  if (text.includes("<!DOCTYPE html>") || text.trimStart().startsWith("<!")) {
    console.warn("[transformApi] " + rtype + " get_game_list 返回 HTML 页面（非 XML），回退到 game_list_FT...");
    return await fetchGameList_FT(page, rtype);
  }
  if (!text.includes("<?xml") && !text.includes("<serverresponse")) {
    console.warn("[transformApi] " + rtype + " 响应不是 XML (length=" + text.length + "), 回退到 game_list_FT...");
    return await fetchGameList_FT(page, rtype);
  }

  console.log("[transformApi] " + rtype + " response: " + text.length + " bytes");

  // ★ 从 XML 响应提取 ECID（gismo matchId）
  const ecidMatches = text.matchAll(/<ECID>([^<]+)<\/ECID>/g);
  const ecids = [...ecidMatches].map(m => m[1]).filter(Boolean);
  if (ecids.length > 0) {
    addMatchIds(ecids);
    console.log(`[gismo] 从 transform.php 提取到 ${ecids.length} 个 matchId`);
  }

  return text;
}

/**
 * 使用 p=game_list_FT 获取比赛列表（页面当前实际有效的接口）
 * 参数格式比 get_game_list 简洁，无 ltype/sorttype/chgSortTS
 */
export async function fetchGameList_FT(page, rtype) {
  const cachedUidDebug = getCachedUid();
  console.log("[transformApi] fetchGameList_FT: 当前缓存的 uid=" + (cachedUidDebug ? cachedUidDebug.substring(0, 16) + "..." : "MISSING"));
  const params = await extractParamsWithRetry(page);
  if (!params.uid || !params.ver) {
    console.warn("[transformApi] fetchGameList_FT: Missing uid/ver, cannot request");
    return null;
  }

  // ★ 根据 rtype 动态设置 showtype
  const isLiveRtype = ["rb", "rcn", "rrnou"].includes(rtype);
  const showtype = isLiveRtype ? "live" : "today";

  const ts = Date.now();
  const body = new URLSearchParams({
    p: "game_list_FT",
    ver: params.ver,
    langx: params.langx || "en-us",
    uid: params.uid,
    ts: String(ts),
    gtype: "ft",
    showtype: showtype,
    rtype: rtype,
  });

  const url = API_BASE + "?ver=" + encodeURIComponent(params.ver);
  console.log("[transformApi] fetching " + rtype + " (game_list_FT, POST, showtype=" + showtype + ") ...");

  const text = await fetchInBrowser(page, url, body.toString());
  if (text) {
    // ★ 检测 HTML 响应（服务器未识别为 XHR 请求时返回 HTML 页面）
    if (text.includes("<!DOCTYPE html>") || text.trimStart().startsWith("<!")) {
      console.warn("[transformApi] " + rtype + " (FT) 返回 HTML 页面（非 XML），X-Requested-With 可能未生效, length=" + text.length);
      return null;
    }
    console.log("[transformApi] " + rtype + " (FT) response: " + text.length + " bytes");

    // ★ 从 XML 响应提取 ECID（gismo matchId）
    const ecidMatches = text.matchAll(/<ECID>([^<]+)<\/ECID>/g);
    const ecids = [...ecidMatches].map(m => m[1]).filter(Boolean);
    if (ecids.length > 0) {
      addMatchIds(ecids);
      console.log(`[gismo] 从 transform.php 提取到 ${ecids.length} 个 matchId`);
    }
  }
  return text;
}

/**
 * 通过响应拦截方式获取 transform.php 数据
 * 原理：设置 page.on('response') 拦截器，然后触发页面操作使浏览器自然发出 XHR 请求，
 * 拦截器捕获匹配的响应并返回数据。
 *
 * @param {Page} page - 已登录的 Puppeteer page
 * @param {string[]} rtypes - 需要获取的 rtype 列表，如 ["rb", "rcn"]
 * @param {Function} triggerFn - 触发页面操作的异步函数，如点击标签
 * @param {number} timeout - 等待超时（毫秒），默认 15000
 * @returns {Object} { rb: "xml_text", rcn: "xml_text", ... }
 */
export async function fetchViaInterception(page, rtypes, triggerFn, timeout = 15000) {
  const results = {};
  const remaining = new Set(rtypes);
  let handler = null;
  let timer = null;

  try {
    const captured = await new Promise((resolve, reject) => {
      const cleanup = () => {
        if (handler) page.off("response", handler);
        if (timer) clearTimeout(timer);
      };

      timer = setTimeout(() => {
        console.log("[transformApi] 拦截超时: 已捕获=" + Object.keys(results).join(",") + " 未捕获=" + [...remaining].join(","));
        cleanup();
        resolve(results);
      }, timeout);

      handler = async (response) => {
        const url = response.url();
        if (!url.includes("transform.php") && !url.includes("transform_nl.php")) return;

        try {
          const request = response.request();
          const postData = request.postData() || "";

          // ★ 从任何请求中提取 uid 和 ver（在 pValue 检查之前）
          extractVerFromRequest(url);
          const uidMatch = postData.match(/uid=([^&\s]+)/);
          if (uidMatch && uidMatch[1] && uidMatch[1].length > 5) setCachedUid(uidMatch[1]);

          const pMatch = postData.match(/p=([^&]+)/);
          const rtypeMatch = postData.match(/rtype=([^&]+)/);

          // ★ 输出所有 transform.php 请求（无论是否匹配）
          if (pMatch) {
            console.log("[transformApi] 拦截到请求: p=" + pMatch[1] + " rtype=" + (rtypeMatch ? rtypeMatch[1] : "N/A") + " 目标=" + [...remaining].join(","));
          }

          if (!pMatch || !rtypeMatch) return;

          const pValue = pMatch[1];
          const rtype = rtypeMatch[1];

          // 捕获 get_game_list / game_list_FT / gameModel 请求，且 rtype 在目标列表中
          if (pValue !== "get_game_list" && pValue !== "game_list_FT" && pValue !== "gameModel") return;
          if (!remaining.has(rtype)) return;

          // 读取响应体
          const body = await response.text();
          console.log("[transformApi] 拦截捕获: p=" + pValue + " rtype=" + rtype + " size=" + body.length);

          // ★ 从拦截的响应中提取 ECID
          const ecidMatches = body.matchAll(/<ECID>([^<]+)<\/ECID>/g);
          const ecids = [...ecidMatches].map(m => m[1]).filter(Boolean);
          if (ecids.length > 0) {
            addMatchIds(ecids);
            console.log(`[gismo] 从拦截响应提取到 ${ecids.length} 个 matchId`);
          }

          // 校验响应格式（跳过 HTML 和 code_type error 响应）
          if (body && !body.includes("<!DOCTYPE html>") && !body.trimStart().startsWith("<!") && !body.includes("code_type error")) {
            results[rtype] = body;
            remaining.delete(rtype);
          } else if (body && body.includes("code_type error")) {
            console.log("[transformApi] 跳过 code_type error 响应: p=" + pValue + " rtype=" + rtype);
          }

          // 所有目标都已捕获
          if (remaining.size === 0) {
            cleanup();
            resolve(results);
          }
        } catch (e) {
          // 响应体读取失败，忽略
        }
      };

      page.on("response", handler);

      // 执行触发函数（如点击标签），使浏览器发出 XHR 请求
      if (triggerFn) {
        triggerFn().catch(e => {
          console.warn("[transformApi] triggerFn error:", e.message);
        });
      }
    });

    return captured;
  } finally {
    if (handler) page.off("response", handler);
    if (timer) clearTimeout(timer);
  }
}

export async function fetchGameDetail(page, ecid) {
  if (!ecid) return null;
  const params = await extractParamsWithRetry(page);
  if (!params.uid || !params.ver) return null;

  const ts = Date.now();
  const body = new URLSearchParams({
    uid: params.uid, ver: params.ver, langx: params.langx || "en-us",
    p: "get_game_more", ecid: ecid, ts: String(ts),
  });

  const url = API_BASE + "?ver=" + encodeURIComponent(params.ver);
  const text = await fetchInBrowser(page, url, body.toString());
  if (text) console.log("[transformApi] detail " + ecid + ": " + text.length + " bytes");
  return text;
}