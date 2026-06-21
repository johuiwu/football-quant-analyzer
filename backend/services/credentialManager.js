// ======================== 凭证管理模块 ========================
// 统一管理 uid/ver/cookies 的读取、缓存和持久化
// 供 hgApiClient 和 crawlCornerMatches 使用

import fs from "fs";
import path from "path";
import axios from "axios";
import { getUid, setUid, loadCookiesFromDisk, saveCookiesToDisk, HG_URL, FALLBACK_DOMAINS } from "./browserPool.js";
import { getCurrentVer, extractVerFromRequest } from "./transformSigner.js";
// ★ 避免与 hgApiClient.js 循环依赖，代理/域名检测函数使用懒加载

// ---- credentials.json 路径 ----
// ★ 禁止使用 import.meta.url / __dirname 推导路径
// 统一使用 process.env.CRED_PATH（由 Electron main.cjs 或 server.ts 设置）
// 回退到 APPDATA 等价路径（与 Electron app.getPath('userData') 一致）
function _resolveCredPath() {
  if (process.env.CRED_PATH) return process.env.CRED_PATH;

  // 等价于 Electron app.getPath('userData')：APPDATA/<productName>
  const appName = '足球竞彩量化分析系统';
  const userDataDir = path.join(process.env.APPDATA || process.env.HOME || '.', appName);
  return path.join(userDataDir, 'credentials.json');
}

let CRED_PATH = _resolveCredPath();

// 旧路径（import.meta.url 时代）— 用于自动迁移
const _OLD_CRED_PATHS = [
  // 开发模式旧路径：backend/credentials.json（相对于项目根目录）
  path.resolve(process.cwd(), 'backend', 'credentials.json'),
];

// 自动迁移：如果新路径不存在但旧路径存在，复制过来
function _migrateCredFile() {
  if (fs.existsSync(CRED_PATH)) return; // 新路径已有文件，无需迁移
  for (const oldPath of _OLD_CRED_PATHS) {
    try {
      if (fs.existsSync(oldPath)) {
        // 确保新路径的目录存在
        const dir = path.dirname(CRED_PATH);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        fs.copyFileSync(oldPath, CRED_PATH);
        console.log('[credentialManager] 已自动迁移凭证文件: ' + oldPath + ' → ' + CRED_PATH);
        return;
      }
    } catch (e) {
      console.warn('[credentialManager] 凭证文件迁移失败:', e.message);
    }
  }
}
_migrateCredFile();

// ---- 内存缓存 ----
let cachedCookieStr = null;
let cachedCookieStrAt = 0;
const COOKIE_CACHE_TTL = 30000; // 30秒

/**
 * 检查 uid 是否有效（非空、长度>=10、非base64用户名）
 */
function isValidUid(uid) {
  return uid && uid !== "undefined" && uid.length >= 10 && !uid.endsWith("=");
}

/**
 * 加载凭证
 * @returns {{ uid: string, ver: string, cookieStr: string } | null}
 */
export function loadCredentials() {
  // 检查凭证是否过期（超过 2 小时）
  try {
    const credFile = JSON.parse(fs.readFileSync(CRED_PATH, "utf8"));
    if (credFile.savedAt && (Date.now() - credFile.savedAt) > 7200000) {
      const ageMin = ((Date.now() - credFile.savedAt) / 60000).toFixed(1);
      console.log("[credentialManager] 凭证已过期（超过 2 小时，已过 " + ageMin + " 分钟），需要重新登录");
      return null;
    }
  } catch (e) {}

  // 1. 获取 uid（优先内存，回退磁盘）
  let uid = getUid();
  if (!isValidUid(uid)) {
    // 尝试从磁盘恢复 uid
    try {
      const credFile = JSON.parse(fs.readFileSync(CRED_PATH, "utf8"));
      if (credFile.uid && isValidUid(credFile.uid)) {
        setUid(credFile.uid);
        uid = credFile.uid;
        console.log("[credentialManager] 从磁盘恢复 uid: " + uid.substring(0, 12) + "...");
      }
    } catch (e) {}
  }
  if (!isValidUid(uid)) {
    // 诊断日志：输出 uid 无效的详细信息
    const memUid = getUid();
    let diskExists = false;
    let diskUid = null;
    try {
      if (fs.existsSync(CRED_PATH)) {
        diskExists = true;
        const credFile = JSON.parse(fs.readFileSync(CRED_PATH, "utf8"));
        diskUid = credFile.uid || null;
      }
    } catch (e) {}
    console.warn("[credentialManager] uid 无效或缺失 | CRED_PATH=" + CRED_PATH + " | 内存uid=" + JSON.stringify(memUid) + " | 磁盘文件存在=" + diskExists + " | 磁盘uid=" + (diskUid ? diskUid.substring(0, 12) + "..." : "null"));
    return null;
  }

  // 2. 获取 ver（优先内存，回退磁盘）
  let ver = getCurrentVer();
  if (!ver) {
    try {
      const credFile = JSON.parse(fs.readFileSync(CRED_PATH, "utf8"));
      if (credFile.ver) {
        extractVerFromRequest("transform.php?ver=" + credFile.ver);
        ver = getCurrentVer();
        console.log("[credentialManager] 从磁盘恢复 ver: " + credFile.ver.substring(0, 16) + "...");
      }
    } catch (e) {}
  }
  if (!ver) {
    console.warn("[credentialManager] ver 缺失");
    return null;
  }

  // 3. 获取 cookieStr（带缓存）
  const cookieStr = _getCookieStr();
  if (!cookieStr) {
    console.warn("[credentialManager] cookies 缺失");
    return null;
  }

  // 4. 获取 apiDomain（可选，从 credentials.json 读取）
  let apiDomain = null;
  try {
    const credFile = JSON.parse(fs.readFileSync(CRED_PATH, "utf8"));
    apiDomain = credFile.apiDomain || null;
  } catch (e) {}

  return { uid, ver, cookieStr, apiDomain };
}

/**
 * 获取 Cookie 字符串（带内存缓存）
 */
function _getCookieStr() {
  const now = Date.now();
  if (cachedCookieStr && (now - cachedCookieStrAt) < COOKIE_CACHE_TTL) {
    return cachedCookieStr;
  }

  const cookies = loadCookiesFromDisk();
  if (!cookies || cookies.length === 0) return null;

  cachedCookieStr = cookies.map(c => `${c.name}=${c.value}`).join("; ");
  cachedCookieStrAt = now;
  return cachedCookieStr;
}

/**
 * 更新凭证
 * @param {{ uid?: string, ver?: string, cookies?: Array, username?: string, password?: string }} updates
 */
export function updateCredentials(updates) {
  if (updates.uid && isValidUid(updates.uid)) {
    setUid(updates.uid);
    console.log("[credentialManager] uid 已更新: " + updates.uid.substring(0, 12) + "...");
  }

  if (updates.ver) {
    // 通过 extractVerFromRequest 更新 ver
    extractVerFromRequest("transform.php?ver=" + updates.ver);
    console.log("[credentialManager] ver 已更新: " + updates.ver.substring(0, 16) + "...");
  }

  if (updates.cookies && updates.cookies.length > 0) {
    saveCookiesToDisk(updates.cookies);
    // 清除 cookieStr 缓存，强制下次重新读取
    cachedCookieStr = null;
    cachedCookieStrAt = 0;
    console.log("[credentialManager] cookies 已更新 (" + updates.cookies.length + " 条)");
  }

  // 当 uid 和 ver 同时存在时，自动持久化完整凭证到 credentials.json
  if (updates.uid && updates.ver) {
    saveToDisk({ uid: updates.uid, ver: updates.ver, cookies: updates.cookies || [], apiDomain: updates.apiDomain, username: updates.username, password: updates.password });
  } else if (updates.apiDomain || updates.username) {
    // 单独更新 apiDomain/username 时，读取现有凭证后重新保存
    const existing = loadFromDisk();
    if (existing) {
      saveToDisk({ uid: existing.uid, ver: existing.ver, cookies: [], apiDomain: updates.apiDomain });
    }
  }
}

/**
 * 检查凭证是否有效
 */
export function isCredentialsValid() {
  const uid = getUid();
  const ver = getCurrentVer();
  const cookies = loadCookiesFromDisk();
  return isValidUid(uid) && !!ver && cookies && cookies.length > 0;
}

/**
 * 清除 Cookie 缓存（强制下次从磁盘读取）
 */
export function invalidateCookieCache() {
  cachedCookieStr = null;
  cachedCookieStrAt = 0;
}

/**
 * 获取基础 URL（优先使用 apiDomain，回退到 HG_URL）
 */
export function getBaseUrl() {
  try {
    const credFile = JSON.parse(fs.readFileSync(CRED_PATH, "utf8"));
    if (credFile.apiDomain) return credFile.apiDomain;
  } catch (e) {}
  return HG_URL;
}

// ======================== 凭证验证与持久化 ========================

/**
 * 通过网络请求验证凭证是否仍然有效
 * @param {string} uid
 * @param {string} ver
 * @param {string} cookieStr
 * @returns {Promise<{ valid: boolean, reason?: string, error?: string }>}
 */
export async function validateCredentials(uid, ver, cookieStr, apiDomain) {
  // 构建域名列表：优先 apiDomain → 主域名 → 备用域名
  const primaryDomain = apiDomain || HG_URL;
  const domains = [primaryDomain];
  for (const d of FALLBACK_DOMAINS) {
    if (d !== primaryDomain) domains.push(d);
  }

  // 代理自动探测（懒加载避免循环依赖）
  let proxyConfig = null;
  try {
    const { detectProxyConfig } = await import("./hgApiClient.js");
    proxyConfig = await detectProxyConfig();
  } catch (_) {}

  let lastError = null;

  for (const baseUrl of domains) {
    try {
      const ts = Date.now();
      const params = new URLSearchParams({
        uid, ver, langx: "en-us",
        p: "get_game_list", gtype: "ft", showtype: "live",
        rtype: "rcn", ltype: "3", sorttype: "L",
        ts: String(ts), chgSortTS: String(ts),
        p3type: "", date: "", filter: "", cupFantasy: "N",
        specialClick: "", isFantasy: "N",
      });
      const axiosConfig = {
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "X-Requested-With": "XMLHttpRequest",
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
          "Referer": baseUrl + "/",
          "Origin": baseUrl,
          "Accept": "*/*",
          "Accept-Language": "en-us",
          Cookie: cookieStr,
        },
        timeout: 15000,
        maxRedirects: 0,
        validateStatus: (s) => s < 500, // 5xx 触发异常以启用域名回退
      };
      if (proxyConfig) {
        axiosConfig.proxy = proxyConfig;
      }

      const response = await axios.post(`${baseUrl}/transform.php?ver=${encodeURIComponent(ver)}`, params.toString(), axiosConfig);

      if (response.status >= 400 || response.status === 302) {
        return { valid: false, reason: "session_expired" };
      }

      const text = typeof response.data === "string" ? response.data : String(response.data);

      // 响应包含 <serverresponse> XML 标签（有效会话）
      if (text.includes("<serverresponse")) {
        // 如果回退域名成功，更新 apiDomain
        if (baseUrl !== primaryDomain) {
          try { updateCredentials({ apiDomain: baseUrl }); } catch (_) {}
          console.log("[credentialManager] 凭证验证域名回退成功: " + baseUrl);
        }
        return { valid: true };
      }

      // 响应是 HTML（会话已过期，被重定向到登录页）
      if (text.includes("<html>") || text.includes("<!DOCTYPE")) {
        return { valid: false, reason: "session_expired" };
      }

      // CheckEMNU 响应说明参数不完整或凭证无效
      if (text.includes("CheckEMNU")) {
        return { valid: false, reason: "check_emnu" };
      }

      // 其他情况视为无效
      return { valid: false, reason: "session_expired" };
    } catch (err) {
      const isNetworkError = err.code === "ECONNREFUSED" || err.code === "ETIMEDOUT" ||
        err.code === "ECONNRESET" || err.code === "ENOTFOUND" || err.code === "EAI_FAIL";
      if (isNetworkError) {
        console.warn("[credentialManager] 域名不可达: " + baseUrl + " (" + err.code + ")，尝试下一个...");
        lastError = err;
        continue;
      }
      return { valid: false, reason: "network_error", error: err.message };
    }
  }

  // 所有域名都失败
  try {
    const { clearProxyCache, clearDomainCache } = await import("./hgApiClient.js");
    if (proxyConfig) clearProxyCache();
    clearDomainCache();
  } catch (_) {}
  return { valid: false, reason: "network_error", error: lastError?.message || "所有域名均不可达" };
}

/**
 * 加载凭证并验证有效性
 * @returns {Promise<{ valid: boolean, credentials?: object, reason?: string }>}
 */
export async function loadAndValidate() {
  const creds = loadCredentials();
  if (!creds) {
    return { valid: false, credentials: null, reason: "no_credentials" };
  }

  const result = await validateCredentials(creds.uid, creds.ver, creds.cookieStr, creds.apiDomain);
  if (result.valid) {
    return { valid: true, credentials: { uid: creds.uid, ver: creds.ver, cookieStr: creds.cookieStr, apiDomain: creds.apiDomain } };
  }

  return { valid: false, credentials: null, reason: result.reason || "session_expired" };
}

/**
 * 将完整凭证保存到 credentials.json
 * @param {{ uid: string, ver: string, cookies?: Array }} param0
 */
export function saveToDisk({ uid, ver, cookies, apiDomain, username, password }) {
  try {
    const data = {
      uid,
      ver,
      apiDomain: apiDomain || null,
      username: username || null,
      password: password || null,
      savedAt: Date.now(),
      cookieCount: cookies?.length || 0,
    };
    fs.writeFileSync(CRED_PATH, JSON.stringify(data, null, 2), "utf8");
    console.log("[credentialManager] 凭证已持久化: " + CRED_PATH);

    // 同时保存原始 cookies
    if (cookies && cookies.length > 0) {
      saveCookiesToDisk(cookies);
    }
  } catch (e) {
    console.warn("[credentialManager] 凭证持久化失败:", e.message);
  }
}

/**
 * 从 credentials.json 读取保存的凭证
 * @returns {{ uid: string, ver: string, savedAt: number, cookieCount: number } | null}
 */
export function loadFromDisk() {
  try {
    if (!fs.existsSync(CRED_PATH)) return null;
    const raw = fs.readFileSync(CRED_PATH, "utf8");
    const data = JSON.parse(raw);
    if (!data.uid || !data.ver) return null;
    return { uid: data.uid, ver: data.ver, savedAt: data.savedAt, cookieCount: data.cookieCount, username: data.username, password: data.password, apiDomain: data.apiDomain };
  } catch {
    return null;
  }
}

/**
 * 获取保存的用户名/密码（用于 autoLogin）
 * @returns {{ username: string, password: string } | null}
 */
export function getSavedLoginCredentials() {
  try {
    const data = loadFromDisk();
    if (data && data.username && data.password) {
      return { username: data.username, password: data.password };
    }
    return null;
  } catch {
    return null;
  }
}
