// ======================== 纯 HTTP 登录模块 ========================
// 通过 axios 直接调用 transform_nl.php 的 chk_login 接口完成登录
// 无需启动 Puppeteer 浏览器，登录速度提升 5-10 倍
//
// 登录协议（基于抓包分析 captured_bet_requests.json）:
//   1. GET 首页 → 获取初始 cookies + 从 HTML 中提取 ver 签名
//   2. POST transform_nl.php?ver=<VER> with p=chk_login → 验证账号密码，返回 uid
//   3. POST transform_nl.php?ver=<VER> with p=memSet → 会员设置验证
//
// 调用链路:
//   /api/corner/login → loginViaHttp() → 成功则直接返回凭证
//                                         → 失败则回退到 Puppeteer 登录

import axios from "axios";
import crypto from "crypto";
import { HG_URL, FALLBACK_DOMAINS, saveCookiesToDisk, setUid } from "./browserPool.js";
import { updateCredentials, loadCredentials } from "./credentialManager.js";
import { extractVerFromRequest, getCurrentVer } from "./transformSigner.js";
import { detectProxyConfig, detectWorkingDomain, clearProxyCache, clearDomainCache } from "./hgApiClient.js";

// ======================== 常量配置 ========================

const HTTP_LOGIN_TIMEOUT = 15000; // 单次请求超时 15s
const MAX_DOMAIN_RETRIES = 3; // 域名重试次数
const CHK_LOGIN_ENDPOINT = "/transform_nl.php";
const HOMEPAGE_PATH = "/";

// 标准 User-Agent（与抓包数据一致）
const STANDARD_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36";

// ======================== 辅助函数 ========================

/**
 * 从首页 HTML 中提取 ver 签名
 * ver 格式: md5hex_timestamp（如 fb17d6e0891e8dafddfae2960414d2ed_1781240709873）
 * 可能出现在: script 标签内联、URL 参数、meta 标签
 */
function extractVerFromHtml(html) {
  if (!html || typeof html !== "string") return null;

  // 策略1: 匹配 ver=xxx 格式（URL 参数或 JS 变量赋值）
  const verMatch = html.match(/ver=([a-f0-9]{32}_\d{10,})/);
  if (verMatch && verMatch[1]) return verMatch[1];

  // 策略2: 匹配 transform.php?ver=xxx 格式
  const transformMatch = html.match(/transform(?:_nl)?\.php\?ver=([a-f0-9]{32}_\d{10,})/);
  if (transformMatch && transformMatch[1]) return transformMatch[1];

  // 策略3: 匹配 JS 变量 ver="xxx" 或 ver='xxx'
  const jsVarMatch = html.match(/\bver\s*=\s*["']([a-f0-9]{32}_\d{10,})["']/);
  if (jsVarMatch && jsVarMatch[1]) return jsVarMatch[1];

  // 策略4: 匹配 _CHDomain.ver = "xxx"
  const chDomainMatch = html.match(/_CHDomain\s*\.\s*ver\s*=\s*["']([a-f0-9]{32}_\d{10,})["']/);
  if (chDomainMatch && chDomainMatch[1]) return chDomainMatch[1];

  return null;
}

/**
 * 从 chk_login 响应中提取 uid
 * 响应格式: XML，包含 <serverresponse><uid>xxx</uid>...</serverresponse>
 * 或 JSON 格式
 */
function extractUidFromLoginResponse(responseData) {
  const text = typeof responseData === "string" ? responseData : String(responseData || "");

  // 策略1: XML 格式 <uid>xxx</uid>
  const xmlUidMatch = text.match(/<uid>([^<]+)<\/uid>/i);
  if (xmlUidMatch && xmlUidMatch[1] && xmlUidMatch[1].length >= 10) {
    return xmlUidMatch[1].trim();
  }

  // 策略2: JSON 格式 "uid":"xxx"
  const jsonUidMatch = text.match(/"uid"\s*:\s*"([^"]+)"/);
  if (jsonUidMatch && jsonUidMatch[1] && jsonUidMatch[1].length >= 10) {
    return jsonUidMatch[1].trim();
  }

  // 策略3: uid=xxx 参数格式
  const paramUidMatch = text.match(/\buid=([a-z0-9]{20,})/i);
  if (paramUidMatch && paramUidMatch[1]) {
    return paramUidMatch[1].trim();
  }

  return null;
}

/**
 * 检查 chk_login 响应是否表示登录成功
 * 成功标志: 响应中包含 <serverresponse> 且包含有效 uid
 * 失败标志: 响应中包含 error / CheckEMNU / session_expired
 */
function isLoginSuccessful(responseData, extractedUid) {
  if (!extractedUid) return false;

  const text = typeof responseData === "string" ? responseData : String(responseData || "");

  // 明确的失败标志
  if (text.includes("CheckEMNU")) return false;
  if (text.toLowerCase().includes("password_error")) return false;
  if (text.toLowerCase().includes("account_locked")) return false;
  if (text.toLowerCase().includes("session_expired")) return false;

  // 成功标志: 有 serverresponse 标签 + uid
  if (text.includes("<serverresponse") && extractedUid) return true;

  // 有 uid 但无明确失败标志，也视为成功
  if (extractedUid && extractedUid.length >= 10) return true;

  return false;
}

/**
 * 从 Set-Cookie 响应头中解析 cookies
 */
function parseCookiesFromHeaders(responseHeaders) {
  const cookies = [];
  const setCookieHeaders = responseHeaders?.["set-cookie"];
  if (!setCookieHeaders) return cookies;

  const headerArray = Array.isArray(setCookieHeaders) ? setCookieHeaders : [setCookieHeaders];
  for (const cookieStr of headerArray) {
    const parts = cookieStr.split(";");
    if (parts.length === 0) continue;
    const nameValue = parts[0].trim();
    const eqIdx = nameValue.indexOf("=");
    if (eqIdx <= 0) continue;
    const name = nameValue.substring(0, eqIdx).trim();
    const value = nameValue.substring(eqIdx + 1).trim();
    if (!name) continue;

    const cookie = { name, value, domain: ".hga050.com", path: "/" };
    // 解析 expires
    for (let i = 1; i < parts.length; i++) {
      const part = parts[i].trim().toLowerCase();
      if (part.startsWith("expires=")) {
        const expiresStr = parts[i].trim().substring(8);
        const expires = new Date(expiresStr).getTime() / 1000;
        if (!isNaN(expires)) cookie.expires = expires;
      } else if (part.startsWith("domain=")) {
        cookie.domain = parts[i].trim().substring(7);
      } else if (part.startsWith("path=")) {
        cookie.path = parts[i].trim().substring(5);
      }
    }
    cookies.push(cookie);
  }
  return cookies;
}

/**
 * 构建 axios 请求配置（含代理和标准 headers）
 */
async function buildAxiosConfig(extraHeaders = {}) {
  const config = {
    timeout: HTTP_LOGIN_TIMEOUT,
    maxRedirects: 0,
    validateStatus: () => true, // 接受所有状态码，自行判断
    headers: {
      "User-Agent": STANDARD_UA,
      "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.9,zh-CN;q=0.8,zh;q=0.7",
      "Accept-Encoding": "gzip, deflate, br",
      "Connection": "keep-alive",
      "Upgrade-Insecure-Requests": "1",
      ...extraHeaders,
    },
  };

  // 代理自动探测
  try {
    const proxyConfig = await detectProxyConfig();
    if (proxyConfig) {
      config.proxy = proxyConfig;
    }
  } catch (_) {
    // 代理探测失败，直连
  }

  return config;
}

// ======================== 核心登录函数 ========================

/**
 * 纯 HTTP 方式登录 HG 网站
 *
 * 流程:
 *   1. 检查已有凭证是否有效（避免重复登录）
 *   2. GET 首页获取初始 cookies + ver 签名
 *   3. POST chk_login 验证账号密码
 *   4. POST memSet 会员设置验证
 *   5. 持久化凭证（uid/ver/cookies）
 *
 * @param {string} username - HG 用户名
 * @param {string} password - HG 密码
 * @returns {Promise<{ success: boolean, uid?: string, ver?: string, cookieStr?: string, cookies?: Array, apiDomain?: string, error?: string, reason?: string }>}
 */
export async function loginViaHttp(username, password) {
  console.log("[httpLogin] 开始纯 HTTP 登录...");
  const startTime = Date.now();

  if (!username || !password) {
    return { success: false, error: "用户名和密码不能为空", reason: "missing_credentials" };
  }

  // 获取可用域名
  let workingDomain;
  try {
    workingDomain = await detectWorkingDomain();
    console.log("[httpLogin] 使用域名: " + workingDomain);
  } catch (e) {
    workingDomain = HG_URL;
    console.warn("[httpLogin] 域名检测失败，使用默认: " + workingDomain);
  }

  // Step 0: 检查已有凭证是否仍然有效（避免不必要的登录）
  try {
    const existingCreds = loadCredentials();
    if (existingCreds && existingCreds.uid && existingCreds.ver) {
      const isValid = await _validateExistingSession(existingCreds, workingDomain);
      if (isValid) {
        console.log("[httpLogin] 现有凭证仍然有效，跳过登录 (耗时: " + (Date.now() - startTime) + "ms)");
        return {
          success: true,
          uid: existingCreds.uid,
          ver: existingCreds.ver,
          cookieStr: existingCreds.cookieStr,
          cookies: [],
          apiDomain: existingCreds.apiDomain || workingDomain,
          reason: "session_reused",
        };
      }
      console.log("[httpLogin] 现有凭证已失效，执行完整登录");
    }
  } catch (e) {
    console.warn("[httpLogin] 凭证检查失败，继续登录:", e.message);
  }

  // 遍历域名重试
  const domains = [workingDomain, ...FALLBACK_DOMAINS.filter((d) => d !== workingDomain)];
  let lastError = null;

  for (let domainIdx = 0; domainIdx < Math.min(domains.length, MAX_DOMAIN_RETRIES); domainIdx++) {
    const domain = domains[domainIdx];
    if (domainIdx > 0) {
      console.log("[httpLogin] 切换到备用域名: " + domain);
    }

    try {
      const result = await _loginOnDomain(domain, username, password);
      if (result.success) {
        console.log("[httpLogin] 登录成功! uid=" + (result.uid || "").substring(0, 12) + "..., 耗时: " + (Date.now() - startTime) + "ms");
        return result;
      }
      lastError = result.error || "未知错误";
      console.warn("[httpLogin] 域名 " + domain + " 登录失败: " + lastError);

      // 密码错误等不可重试的错误，直接返回
      if (result.reason === "invalid_credentials" || result.reason === "account_locked") {
        return result;
      }
    } catch (e) {
      lastError = e.message;
      console.warn("[httpLogin] 域名 " + domain + " 登录异常:", e.message);
      // 网络错误时清缓存重试
      clearProxyCache();
      clearDomainCache();
    }
  }

  return {
    success: false,
    error: "所有域名登录均失败: " + (lastError || "未知错误"),
    reason: "all_domains_failed",
  };
}

/**
 * 验证已有 session 是否仍然有效
 */
async function _validateExistingSession(creds, domain) {
  try {
    const ver = creds.ver || getCurrentVer();
    if (!ver) return false;

    const params = new URLSearchParams({
      uid: creds.uid,
      ver: ver,
      langx: "en-us",
      p: "get_game_list",
      gtype: "ft",
      showtype: "live",
      rtype: "rcn",
      ltype: "3",
      sorttype: "L",
      ts: String(Date.now()),
      chgSortTS: String(Date.now()),
      p3type: "",
      date: "",
      filter: "",
      cupFantasy: "N",
      specialClick: "",
      isFantasy: "N",
    });

    const config = await buildAxiosConfig({
      "Content-Type": "application/x-www-form-urlencoded",
      "X-Requested-With": "XMLHttpRequest",
      "Referer": domain + "/",
      "Origin": domain,
      Cookie: creds.cookieStr,
    });

    const response = await axios.post(`${domain}${CHK_LOGIN_ENDPOINT}?ver=${encodeURIComponent(ver)}`, params.toString(), config);

    const text = typeof response.data === "string" ? response.data : String(response.data || "");
    // <serverresponse> 表示 session 有效
    if (text.includes("<serverresponse")) return true;
    // CheckEMNU 表示参数错误/session 过期
    if (text.includes("CheckEMNU")) return false;
    // HTML 重定向表示 session 过期
    if (text.includes("<html>") || text.includes("<!DOCTYPE")) return false;

    return false;
  } catch (e) {
    console.warn("[httpLogin] session 验证失败:", e.message);
    return false;
  }
}

/**
 * 在指定域名上执行完整登录流程
 */
async function _loginOnDomain(domain, username, password) {
  let collectedCookies = [];
  let ver = null;

  // ======================== Step 1: GET 首页 ========================
  console.log("[httpLogin] Step 1: GET 首页获取初始 cookies + ver...");

  const homeConfig = await buildAxiosConfig({
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Upgrade-Insecure-Requests": "1",
  });

  const homeResponse = await axios.get(domain + HOMEPAGE_PATH, homeConfig);

  if (homeResponse.status >= 400) {
    return { success: false, error: "首页请求失败 (HTTP " + homeResponse.status + ")", reason: "homepage_error" };
  }

  // 解析首页 cookies
  const homeCookies = parseCookiesFromHeaders(homeResponse.headers);
  collectedCookies = _mergeCookies(collectedCookies, homeCookies);

  // 从首页 HTML 中提取 ver 签名
  const homeHtml = typeof homeResponse.data === "string" ? homeResponse.data : String(homeResponse.data || "");
  ver = extractVerFromHtml(homeHtml);

  if (!ver) {
    // 尝试使用缓存的 ver
    ver = getCurrentVer();
    if (ver) {
      console.log("[httpLogin] 首页未提取到 ver，使用缓存 ver: " + ver.substring(0, 16) + "...");
    } else {
      // 最后回退: 生成一个临时 ver（md5_timestamp 格式）
      ver = crypto.createHash("md5").update(domain + Date.now()).digest("hex") + "_" + Date.now();
      console.warn("[httpLogin] 无法提取 ver，生成临时 ver: " + ver.substring(0, 16) + "...");
    }
  } else {
    // 同步到 transformSigner 缓存
    extractVerFromRequest(`transform_nl.php?ver=${ver}`);
    console.log("[httpLogin] 从首页提取 ver: " + ver.substring(0, 16) + "...");
  }

  // 构建 Cookie 请求头
  const cookieStr = collectedCookies.map((c) => `${c.name}=${c.value}`).join("; ");

  // ======================== Step 2: POST chk_login ========================
  console.log("[httpLogin] Step 2: POST chk_login 验证账号密码...");

  // 构建 Base64 编码的 User-Agent（与抓包数据一致）
  const userAgentB64 = Buffer.from(STANDARD_UA).toString("base64");

  const loginParams = new URLSearchParams({
    p: "chk_login",
    langx: "en-us",
    ver: ver,
    username: username,
    password: password,
    app: "N",
    auto: "GZAZDH",
    userAgent: userAgentB64,
  });

  const loginConfig = await buildAxiosConfig({
    "Content-Type": "application/x-www-form-urlencoded",
    "X-Requested-With": "XMLHttpRequest",
    "Referer": domain + "/",
    "Origin": domain,
    Cookie: cookieStr,
  });

  const loginResponse = await axios.post(`${domain}${CHK_LOGIN_ENDPOINT}?ver=${encodeURIComponent(ver)}`, loginParams.toString(), loginConfig);

  // 解析登录响应 cookies
  const loginRespCookies = parseCookiesFromHeaders(loginResponse.headers);
  collectedCookies = _mergeCookies(collectedCookies, loginRespCookies);

  const loginRespText = typeof loginResponse.data === "string" ? loginResponse.data : String(loginResponse.data || "");

  // 检查是否被 WAF 拦截
  if (loginResponse.status === 403 || loginResponse.status === 429) {
    return { success: false, error: "被 WAF 拦截 (HTTP " + loginResponse.status + ")", reason: "waf_blocked" };
  }

  // 检查是否被重定向到登录页（session 过期）
  if (loginResponse.status === 302 || loginRespText.includes("<html>") || loginRespText.includes("<!DOCTYPE")) {
    return { success: false, error: "登录被重定向，可能 session 过期", reason: "redirected" };
  }

  // 检查明确的失败标志
  if (loginRespText.includes("CheckEMNU")) {
    return { success: false, error: "参数错误 (CheckEMNU)，ver 可能已过期", reason: "check_emnu" };
  }
  if (loginRespText.toLowerCase().includes("password") && loginRespText.toLowerCase().includes("error")) {
    return { success: false, error: "用户名或密码错误", reason: "invalid_credentials" };
  }

  // 提取 uid
  const uid = extractUidFromLoginResponse(loginRespText);
  if (!isLoginSuccessful(loginRespText, uid)) {
    console.warn("[httpLogin] chk_login 响应未包含有效 uid, 响应前200字符:", loginRespText.substring(0, 200));
    return {
      success: false,
      error: "登录响应中未找到有效 uid",
      reason: "no_uid_in_response",
      responsePreview: loginRespText.substring(0, 500),
    };
  }

  console.log("[httpLogin] chk_login 成功! uid=" + uid.substring(0, 12) + "...");

  // 更新 cookieStr（包含登录后新获取的 cookies）
  const finalCookieStr = collectedCookies.map((c) => `${c.name}=${c.value}`).join("; ");

  // ======================== Step 3: POST memSet（会员设置验证） ========================
  console.log("[httpLogin] Step 3: POST memSet 会员设置验证...");

  const memSetParams = new URLSearchParams({
    p: "memSet",
    ver: ver,
    uid: uid,
    langx: "en-us",
    action: "check",
  });

  const memSetConfig = await buildAxiosConfig({
    "Content-Type": "application/x-www-form-urlencoded",
    "X-Requested-With": "XMLHttpRequest",
    "Referer": domain + "/",
    "Origin": domain,
    Cookie: finalCookieStr,
  });

  try {
    const memSetResponse = await axios.post(`${domain}${CHK_LOGIN_ENDPOINT}?ver=${encodeURIComponent(ver)}`, memSetParams.toString(), memSetConfig);

    // 解析 memSet 响应 cookies
    const memSetCookies = parseCookiesFromHeaders(memSetResponse.headers);
    collectedCookies = _mergeCookies(collectedCookies, memSetCookies);

    console.log("[httpLogin] memSet 验证完成 (HTTP " + memSetResponse.status + ")");
  } catch (e) {
    // memSet 失败不阻断登录流程（已通过 chk_login 验证）
    console.warn("[httpLogin] memSet 请求失败（不阻断登录）:", e.message);
  }

  // ======================== Step 4: 持久化凭证 ========================
  const finalCookies = collectedCookies;
  const finalCookieStrAll = finalCookies.map((c) => `${c.name}=${c.value}`).join("; ");

  // 同步到 browserPool 内存
  setUid(uid);

  // 同步到 credentialManager 磁盘
  updateCredentials({
    uid: uid,
    ver: ver,
    cookies: finalCookies,
    apiDomain: domain,
    username: username,
    password: password,
  });

  // 持久化 cookies 到磁盘
  saveCookiesToDisk(finalCookies);

  console.log("[httpLogin] 凭证已持久化，登录完成");

  return {
    success: true,
    uid: uid,
    ver: ver,
    cookieStr: finalCookieStrAll,
    cookies: finalCookies,
    apiDomain: domain,
    reason: "http_login_success",
  };
}

// ======================== Cookie 合并工具 ========================

/**
 * 合并两个 cookie 数组（后者覆盖前者同名的）
 */
function _mergeCookies(existing, incoming) {
  const map = new Map();
  for (const c of existing) {
    map.set(c.name, c);
  }
  for (const c of incoming) {
    map.set(c.name, c);
  }
  return Array.from(map.values());
}

// ======================== 导出 ========================

export { extractVerFromHtml, extractUidFromLoginResponse, isLoginSuccessful };
