// ======================== 纯 HTTP API 客户端 ========================
// 通过 axios 直接调用 transform.php API，不依赖浏览器
// 替代 page.evaluate(fetch) 方式，实现纯 HTTP 数据获取

import axios from "axios";
import net from "net";
import { HttpsProxyAgent } from "https-proxy-agent";
import { getBaseUrl, updateCredentials } from "./credentialManager.js";
import { HG_URL, FALLBACK_DOMAINS } from "./browserPool.js";

// ---- 请求配置 ----
const DEFAULT_TIMEOUT = 30000;
const MAX_REDIRECTS = 0;

// ---- 域名回退机制 ----
const DOMAIN_CACHE_TTL = 30 * 60 * 1000; // 30 分钟缓存
let _workingDomain = null;
let _workingDomainTime = 0;

/**
 * 获取所有可用域名列表（优先使用最近成功的域名）
 * @returns {string[]}
 */
function _getAllDomains() {
  let primary = getBaseUrl() || HG_URL;
  // ★ 过滤 IP 地址形式的 apiDomain（IP 地址通常不可达，CDN IP 不等于真实服务器地址）
  const IP_REGEX = /^https?:\/\/\d+\.\d+\.\d+\.\d+/;
  if (IP_REGEX.test(primary)) {
    console.log("[hgApiClient] apiDomain 为 IP 地址，跳过: " + primary);
    primary = HG_URL;
  }
  const all = [primary];
  for (const d of FALLBACK_DOMAINS) {
    if (d !== primary) all.push(d);
  }
  // 如果有缓存的工作域名且不是主域名，将其提到第一位
  if (_workingDomain && _workingDomain !== primary && (Date.now() - _workingDomainTime) < DOMAIN_CACHE_TTL) {
    const idx = all.indexOf(_workingDomain);
    if (idx > 0) {
      all.splice(idx, 1);
      all.unshift(_workingDomain);
    }
  }
  return all;
}

/**
 * 清除工作域名缓存
 */
export function clearDomainCache() {
  _workingDomain = null;
  _workingDomainTime = 0;
}

/**
 * 自动探测可用域名（主域名不可达时尝试备用域名）
 * @returns {Promise<string>} 可用域名
 */
export async function detectWorkingDomain() {
  // 检查缓存
  if (_workingDomain && (Date.now() - _workingDomainTime) < DOMAIN_CACHE_TTL) {
    return _workingDomain;
  }

  const domains = _getAllDomains();
  console.log("[域名检测] 并行检测域名可达性:", domains.join(", "));

  // ★ 并行检测所有域名，第一个可达的立即返回
  const results = await Promise.allSettled(
    domains.map(async (domain) => {
      await axios.head(domain, { timeout: 5000, maxRedirects: 0, validateStatus: () => true });
      return domain;
    })
  );

  // 按原始优先级顺序查找第一个成功的
  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    if (r.status === 'fulfilled') {
      const domain = r.value;
      _workingDomain = domain;
      _workingDomainTime = Date.now();
      console.log("[域名检测] 可用域名: " + domain);
      const currentBase = getBaseUrl();
      if (domain !== currentBase) {
        try { updateCredentials({ apiDomain: domain }); } catch (_) {}
      }
      return domain;
    }
  }

  // 所有域名都不可达，返回主域名（让请求自行处理超时）
  console.warn("[域名检测] 所有域名均不可达，使用主域名: " + domains[0]);
  return domains[0];
}

// ---- 代理自动探测 ----
const PROXY_PORTS = [7890, 10809, 1080, 8888]; // Clash, V2Ray, SS, Proxifier
const PROXY_CACHE_TTL = 5 * 60 * 1000; // 5 分钟缓存
let _proxyCache = null;   // { host, port, protocol, source } | null
let _proxyCacheTime = 0;

/**
 * 测试本地端口是否可达（TCP 连接）
 * @param {number} port
 * @param {number} timeout 超时毫秒数
 * @returns {Promise<boolean>}
 */
function testPort(port, timeout = 2000) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    socket.setTimeout(timeout);
    socket.on("connect", () => { socket.destroy(); resolve(true); });
    socket.on("timeout", () => { socket.destroy(); resolve(false); });
    socket.on("error", () => { socket.destroy(); resolve(false); });
    socket.connect(port, "127.0.0.1");
  });
}

/**
 * 清除代理缓存（请求失败时调用）
 */
export function clearProxyCache() {
  _proxyCache = null;
  _proxyCacheTime = 0;
}

/**
 * 自动探测可用代理，返回 axios proxy 配置对象或 null
 * 优先级：环境变量 → 本地端口探测
 * 结果缓存 5 分钟
 * @returns {Promise<{host:string,port:number,protocol:string}|null>}
 */
export async function detectProxyConfig() {
  // 检查缓存
  if (_proxyCache && (Date.now() - _proxyCacheTime) < PROXY_CACHE_TTL) {
    return _proxyCache;
  }

  // 优先级 1：环境变量
  const envProxy = process.env.HTTPS_PROXY || process.env.HTTP_PROXY || process.env.https_proxy || process.env.http_proxy;
  if (envProxy) {
    try {
      const url = new URL(envProxy);
      const config = { host: url.hostname, port: parseInt(url.port) || 80, protocol: url.protocol.replace(":", ""), url: envProxy };
      console.log("[代理检测] 使用环境变量代理: " + envProxy);
      console.log("[代理检测] 已自动探测到可用代理，请求将走代理通道");
      _proxyCache = config;
      _proxyCacheTime = Date.now();
      return config;
    } catch (e) {
      console.warn("[代理检测] 环境变量代理格式无效:", envProxy);
    }
  }

  // 优先级 2：本地端口探测
  for (const port of PROXY_PORTS) {
    const reachable = await testPort(port);
    if (reachable) {
      const proxyUrl = "http://127.0.0.1:" + port;
      const config = { host: "127.0.0.1", port, protocol: "http", url: proxyUrl };
      console.log("[代理检测] 探测到本地代理: " + proxyUrl);
      console.log("[代理检测] 已自动探测到可用代理，请求将走代理通道");
      _proxyCache = config;
      _proxyCacheTime = Date.now();
      return config;
    }
  }

  // 无代理可用
  console.log("[代理检测] 未检测到本地代理，使用直连模式");
  _proxyCache = null;
  _proxyCacheTime = Date.now();
  return null;
}

// ---- UA ----
const DESKTOP_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36";
const MOBILE_UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1";

function getUserAgent() {
  return process.env.USE_MOBILE_UA === "true" ? MOBILE_UA : DESKTOP_UA;
}

function buildHeaders(cookieStr, baseUrl) {
  return {
    "Content-Type": "application/x-www-form-urlencoded",
    "X-Requested-With": "XMLHttpRequest",
    "Cookie": cookieStr,
    "User-Agent": getUserAgent(),
    "Referer": baseUrl + "/",
    "Origin": baseUrl,
    "Accept": "*/*",
    "Accept-Language": "en-us",
  };
}

function isSessionExpired(response) {
  if (response.status === 302) return true;
  const text = typeof response.data === "string" ? response.data : "";
  if (text.includes("<!DOCTYPE html>") || text.trimStart().startsWith("<!")) return true;
  return false;
}

/**
 * 向单个域名发送 POST 请求
 * @returns {Promise<{data: string, expired: boolean}>}
 */
async function _postToDomain(domain, ver, cookieStr, params, proxyConfig) {
  const url = domain + "/transform.php?ver=" + encodeURIComponent(ver);
  const axiosConfig = {
    headers: buildHeaders(cookieStr, domain),
    timeout: DEFAULT_TIMEOUT,
    maxRedirects: MAX_REDIRECTS,
    validateStatus: (status) => status < 400,
  };
  if (proxyConfig && proxyConfig.url) {
    const agent = new HttpsProxyAgent(proxyConfig.url);
    axiosConfig.httpsAgent = agent;
    axiosConfig.httpAgent = agent;
    axiosConfig.proxy = false;
  }
  const response = await axios.post(url, params.toString(), axiosConfig);
  if (isSessionExpired(response)) {
    return { data: "", expired: true };
  }
  return { data: response.data, expired: false };
}

async function postTransformPhp(ver, cookieStr, params) {
  // 代理自动探测
  const proxyConfig = await detectProxyConfig();

  // 获取所有域名（优先使用缓存的工作域名）
  const domains = _getAllDomains();
  let lastError = null;

  for (const domain of domains) {
    try {
      const result = await _postToDomain(domain, ver, cookieStr, params, proxyConfig);

      // 请求成功 → 缓存工作域名
      if (_workingDomain !== domain) {
        _workingDomain = domain;
        _workingDomainTime = Date.now();
        console.log("[hgApiClient] 域名回退成功: " + domain);
        // 更新凭证中的 apiDomain
        const currentBase = getBaseUrl();
        if (domain !== currentBase) {
          try { updateCredentials({ apiDomain: domain }); } catch (_) {}
        }
      }

      if (result.expired) {
        console.warn("[hgApiClient] 会话已过期（响应为 HTML 或 302）");
        return result;
      }

      return result;
    } catch (err) {
      const isNetworkError = err.code === "ECONNREFUSED" || err.code === "ETIMEDOUT" ||
        err.code === "ECONNRESET" || err.code === "ENOTFOUND" || err.code === "EAI_FAIL" ||
        err.code === "ECONNABORTED";

      if (isNetworkError) {
        console.warn("[hgApiClient] 域名不可达: " + domain + " (" + err.code + ")，尝试下一个...");
        lastError = err;
        // 清除工作域名缓存（当前域名已不可达）
        if (_workingDomain === domain) {
          _workingDomain = null;
          _workingDomainTime = 0;
        }
        continue; // 尝试下一个域名
      }

      // 非网络错误（如 302 重定向、HTTP 错误等）不重试其他域名
      if (err.response && err.response.status === 302) {
        console.warn("[hgApiClient] 会话已过期（302 重定向）");
        return { data: "", expired: true };
      }

      console.error("[hgApiClient] 请求失败:", err.message);
      throw err;
    }
  }

  // 所有域名都失败
  if (proxyConfig) {
    console.warn("[hgApiClient] 所有域名均失败，清除代理缓存以便下次重新探测");
    clearProxyCache();
  }
  clearDomainCache();
  console.error("[hgApiClient] 所有域名均不可达，最后错误:", lastError?.message);
  throw lastError || new Error("所有域名均不可达");
}

// ======================== API 方法 ========================

export async function fetchCornerData(uid, ver, cookieStr) {
  console.log("[hgApiClient] 正在从 API 获取角球数据 (rcn)...");
  const ts = Date.now();
  const params = new URLSearchParams({
    uid, ver, langx: "en-us",
    p: "get_game_list", gtype: "ft", showtype: "live",
    rtype: "rcn", ltype: "3", sorttype: "L",
    ts: String(ts), chgSortTS: String(ts),
    p3type: "", date: "", filter: "", cupFantasy: "N",
    specialClick: "", isFantasy: "N",
  });
  return postTransformPhp(ver, cookieStr, params);
}

export async function fetchHdpOuData(uid, ver, cookieStr) {
  console.log("[hgApiClient] 正在从 API 获取 HDP&O/U 数据 (rrnou)...");
  const ts = Date.now();
  const params = new URLSearchParams({
    uid, ver, langx: "en-us",
    p: "get_game_list", gtype: "ft", showtype: "live",
    rtype: "rrnou", ltype: "3", sorttype: "L",
    ts: String(ts), chgSortTS: String(ts + 100),
    p3type: "", date: "", filter: "", cupFantasy: "N",
    specialClick: "", isFantasy: "N",
  });
  return postTransformPhp(ver, cookieStr, params);
}

export async function fetchGameDetail(uid, ver, cookieStr, ecid) {
  console.log("[hgApiClient] 正在从 API 获取比赛详情: " + ecid);
  const ts = Date.now();
  const params = new URLSearchParams({
    uid, ver, langx: "en-us",
    p: "get_game_more", from: "right_panel",
    gtype: "ft", showtype: "live", ltype: "3",
    ecid: ecid, ts: String(ts),
  });
  return postTransformPhp(ver, cookieStr, params);
}

export async function placeBet(uid, ver, cookieStr, betParams) {
  console.log("[hgApiClient] 正在执行下注 (FT_bet)...");
  const ts = Date.now();
  const params = new URLSearchParams({
    uid, ver, langx: "en-us",
    p: "FT_bet", gtype: "ft", showtype: "live",
    ...betParams,
    ts: String(ts),
  });
  return postTransformPhp(ver, cookieStr, params);
}

export async function fetchTodayCornerData(uid, ver, cookieStr) {
  console.log("[hgApiClient] 正在从 API 获取今日角球数据 (cn)...");
  const ts = Date.now();
  const params = new URLSearchParams({
    uid, ver, langx: "en-us",
    p: "get_game_list", gtype: "ft", showtype: "today",
    rtype: "cn", ltype: "3", sorttype: "L",
    ts: String(ts), chgSortTS: String(ts),
    p3type: "", date: "", filter: "FT", cupFantasy: "N",
    specialClick: "", isFantasy: "N",
  });
  return postTransformPhp(ver, cookieStr, params);
}
