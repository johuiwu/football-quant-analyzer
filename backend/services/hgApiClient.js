// ======================== 纯 HTTP API 客户端 ========================
// 通过 axios 直接调用 transform.php API，不依赖浏览器
// 替代 page.evaluate(fetch) 方式，实现纯 HTTP 数据获取

import axios from "axios";
import { getBaseUrl } from "./credentialManager.js";

// ---- 请求配置 ----
const DEFAULT_TIMEOUT = 15000;
const MAX_REDIRECTS = 0;

// ---- UA ----
const DESKTOP_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36";
const MOBILE_UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1";

function getUserAgent() {
  return process.env.USE_MOBILE_UA === "true" ? MOBILE_UA : DESKTOP_UA;
}

function buildHeaders(cookieStr) {
  const baseUrl = getBaseUrl();
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

async function postTransformPhp(ver, cookieStr, params) {
  const baseUrl = getBaseUrl();
  const url = baseUrl + "/transform.php?ver=" + encodeURIComponent(ver);

  try {
    const response = await axios.post(url, params.toString(), {
      headers: buildHeaders(cookieStr),
      timeout: DEFAULT_TIMEOUT,
      maxRedirects: MAX_REDIRECTS,
      validateStatus: (status) => status < 400,
    });

    if (isSessionExpired(response)) {
      console.warn("[hgApiClient] 会话已过期（响应为 HTML 或 302）");
      return { data: "", expired: true };
    }

    return { data: response.data, expired: false };
  } catch (err) {
    if (err.response && err.response.status === 302) {
      console.warn("[hgApiClient] 会话已过期（302 重定向）");
      return { data: "", expired: true };
    }
    console.error("[hgApiClient] 请求失败:", err.message);
    throw err;
  }
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
