// ======================== transform.php API 直调模块 ========================
// 在浏览器上下文中用 fetch() 调用 transform.php，替代 DOM 解析
// 三层 fallback 提取 uid/ver：DOM context → 请求拦截 → 缓存
// ★ 修复：Layer1 增加 page.cookies() 回退读取 HttpOnly uid
// ★ 修复：extractFromRequest 超时后清理事件监听器，防止泄漏
// ★ 修复：Layer1 找到 ver 时直接从 cookies API 补充 uid，跳过 Layer2

import { HG_URL, setUid, getUid } from "./browserPool.js";
import { extractVerFromRequest, getCurrentVer } from "./transformSigner.js";

// ---- transform.php 基础 URL ----
const API_BASE = HG_URL + "/transform.php";

// ---- rtype 枚举 ----
export const RTYPE = {
  RB: "rb",         // 滚球基本盘
  RCN: "rcn",       // 角球盘口
  RNOU: "rrnou",    // HDP & O/U
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
 * Layer 1: 从 DOM context + page.cookies() 读取 uid/ver
 * 增加 page.cookies() 回退（因为 document.cookie 无法读取 HttpOnly cookie 中的 uid）
 */
async function extractFromPage(page) {
  try {
    const params = await page.evaluate(() => {
      // uid from cookie (non-HttpOnly only)
      const cookies = document.cookie.split(";").map(c => c.trim());
      let uid = "";
      for (const c of cookies) {
        const parts = c.split("=");
        if (parts[0].trim() === "uid") { uid = parts.slice(1).join("="); break; }
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
    // 校验 uid 不是 base64 用户名（endsWith "=" 或长度 < 10）
    const isValidUid = (u) => u && u.length >= 10 && !u.endsWith("=");
    if (params.uid && !isValidUid(params.uid)) {
      console.log("[transformApi] Layer1: cookie uid 是 base64 用户名, 丢弃");
      params.uid = "";
    }
    if (params.uid) setCachedUid(params.uid);

    // ★ 关键修复：uid 提取优先顺序
    // 1) 从页面 URL 提取（登录后 uid 出现在 URL query string 中）
    // 2) 从 page.cookies() 提取（但 UID cookie 存的是 base64 用户名，不是真正的 uid）
    // 3) 从拦截的 POST 请求中提取（见 Layer 2）
    if (!params.uid) {
      try {
        // 尝试从页面 URL 提取 uid
        const pageUrl = page.url();
        const urlMatch = pageUrl.match(/[?&]uid=([^&]+)/);
        if (urlMatch && urlMatch[1]) {
          params.uid = urlMatch[1];
          setCachedUid(urlMatch[1]);
          console.log("[transformApi] Layer1: uid from page URL");
        }
      } catch (e) { /* ignore */ }
    }

    if (!params.uid) {
      try {
        const allCookies = await page.cookies();
        for (const c of allCookies) {
          if (c.name.toLowerCase() === "uid" && c.value) {
            const isValidUid = (u) => u && u.length >= 10 && !u.endsWith("=");
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

// ======================== 主入口 ========================

/**
 * 提取 transform.php 请求参数（三层 fallback 链）
 * Layer 1 → Layer 1.5(ver已有,用page.cookies补uid) → Layer 2 → Layer 3
 */
export async function extractParams(page) {
  // 1. 缓存
  const cached = extractFromCache();
  if (cached.uid && cached.ver) return cached;

  // 2. DOM context (包含 page.cookies() HttpOnly 回退)
  const dom = await extractFromPage(page);
  if (dom.uid && dom.ver) {
    console.log("[transformApi] params from DOM context");
    return dom;
  }

  // ★ 关键修复：如果 Layer 1 找到了 ver 但没有 uid，尝试从 page.cookies() 补充 uid
  if (dom.ver && !dom.uid) {
    try {
      const allCookies = await page.cookies();
      for (const c of allCookies) {
        if (c.name.toLowerCase() === "uid" && c.value) {
          const isValidUid = (u) => u && u.length >= 10 && !u.endsWith("=");
          if (!isValidUid(c.value)) {
            console.log("[transformApi] extractParams: page.cookies() uid 是 base64 用户名, 跳过");
            continue;
          }
          setCachedUid(c.value);
          console.log("[transformApi] params from DOM (ver) + page.cookies (uid)");
          return { uid: c.value, ver: dom.ver, langx: dom.langx || "en-us" };
        }
      }
    } catch (e) { /* ignore */ }
  }

  // 3. 请求拦截（启动监听器等待 transform 请求，最大 5s）
  const intercepted = await extractFromRequest(page);
  if (intercepted.uid && intercepted.ver) {
    console.log("[transformApi] params from request interception");
    return intercepted;
  }

  console.warn("[transformApi] all extraction methods failed");
  return { uid: "", ver: "", langx: "en-us" };
}

/**
 * 带重试的参数获取：缓存优先 + 等待首页请求 + 三层提取
 */
export async function extractParamsWithRetry(page) {
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
          opts.headers = { "Content-Type": "application/x-www-form-urlencoded" };
          opts.body = fetchBody;
        } else {
          opts.method = "GET";
        }
        const resp = await fetch(fetchUrl, opts);
        if (!resp.ok) return { error: "http_" + resp.status, status: resp.status };
        const text = await resp.text();
        return { ok: true, text, status: resp.status };
      } catch (e) { return { error: e.message, status: 0 }; }
    }, { fetchUrl: url, fetchBody: body });

    if (result.error) { console.warn("[transformApi] fetch error:", result.error); return null; }
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

  const ts = Date.now();
  const body = new URLSearchParams({
    uid: params.uid, ver: params.ver, langx: params.langx || "en-us",
    p: "get_game_list", gtype: "ft",
    showtype: extraParams.showtype || "live",
    rtype: rtype, ltype: "3",
    sorttype: extraParams.sorttype || "L",
    ts: String(ts), chgSortTS: String(ts),
    ...extraParams,
  });

  // ver 放 URL query，其余参数放 POST body（与真实浏览器行为一致）
  const url = API_BASE + "?ver=" + encodeURIComponent(params.ver);
  console.log("[transformApi] fetching " + rtype + " (get_game_list, POST) ...");

  const text = await fetchInBrowser(page, url, body.toString());
  if (text) console.log("[transformApi] " + rtype + " response: " + text.length + " bytes");
  return text;
}

/**
 * 使用 p=game_list_FT 获取比赛列表（页面当前实际有效的接口）
 * 参数格式比 get_game_list 简洁，无 ltype/sorttype/chgSortTS
 */
export async function fetchGameList_FT(page, rtype) {
  const cachedUidDebug = getCachedUid();
  console.log("[transformApi] fetchGameList: 当前缓存的 uid=" + (cachedUidDebug ? cachedUidDebug.substring(0, 16) + "..." : "MISSING"));
  const params = await extractParamsWithRetry(page);
  if (!params.uid || !params.ver) {
    console.warn("[transformApi] fetchGameList_FT: Missing uid/ver, cannot request");
    return null;
  }

  const ts = Date.now();
  const body = new URLSearchParams({
    p: "game_list_FT",
    ver: params.ver,
    langx: params.langx || "en-us",
    uid: params.uid,
    ts: String(ts),
    gtype: "ft",
    showtype: "live",
    rtype: rtype,
  });

  const url = API_BASE + "?ver=" + encodeURIComponent(params.ver);
  console.log("[transformApi] fetching " + rtype + " (game_list_FT, POST) ...");

  const text = await fetchInBrowser(page, url, body.toString());
  if (text) console.log("[transformApi] " + rtype + " (FT) response: " + text.length + " bytes");
  return text;
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