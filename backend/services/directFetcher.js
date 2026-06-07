// ======================== 直连备用通道 ========================
// 当 XHR 劫持和 DOM 解析均失败时，用缓存的 ver 签名 + 浏览器 cookies 直连 transform.php

import { HG_URL, getLoginCookies, getRandomUA } from "./browserPool.js";
import { parseTransformXML } from "./xhrDataParser.js";
import { getCurrentVer } from "./transformSigner.js";

/**
 * 通过 Node.js 原生 fetch 直连 transform.php
 * @returns {{ success: boolean, matches?: Array, source?: string, reason?: string, count?: number }}
 */
export async function fetchViaDirectHTTP() {
  // 1. 获取签名
  const ver = getCurrentVer();
  if (!ver) {
    console.log("[directFetcher] 无有效签名，跳过直连");
    return { success: false, reason: "no_signature" };
  }

  // 2. 获取 cookies
  const cookies = getLoginCookies();
  if (!cookies || cookies.length === 0) {
    console.log("[directFetcher] 无登录 cookies，跳过直连");
    return { success: false, reason: "no_cookies" };
  }

  // 构造 Cookie 请求头
  const cookieHeader = cookies
    .map(c => c.name + "=" + c.value)
    .join("; ");

  // 构造 URL
  const url = HG_URL + "/transform.php?ver=" + ver;
  console.log("[directFetcher] 直连请求: " + url.substring(0, 100));

  try {
    const response = await fetch(url, {
      method: "GET",
      headers: {
        "User-Agent": getRandomUA(),
        "Referer": HG_URL + "/",
        "Accept": "*/*",
        "Accept-Language": "en-US,en;q=0.9,zh-CN;q=0.8,zh;q=0.7",
        "Cookie": cookieHeader,
      },
      // 短暂超时，避免阻塞轮询
      signal: AbortSignal.timeout(8000),
    });

    if (response.status === 429 || response.status === 403) {
      console.log("[directFetcher] 被 WAF 拦截 (HTTP " + response.status + ")");
      return { success: false, reason: "waf_blocked", httpStatus: response.status };
    }

    if (!response.ok) {
      console.log("[directFetcher] HTTP " + response.status + " " + response.statusText);
      return { success: false, reason: "http_" + response.status };
    }

    const text = await response.text();

    // 检测是否被重定向到登录页
    if (text.includes("login") && text.length < 2000) {
      console.log("[directFetcher] 响应疑似登录页面，cookie 可能已过期");
      return { success: false, reason: "auth_expired" };
    }

    const parseResult = parseTransformXML(text);
    if (parseResult.success) {
      console.log("[directFetcher] 直连成功: " + parseResult.count + " 场比赛");
      return {
        success: true,
        matches: parseResult.matches,
        source: "direct",
        count: parseResult.count,
      };
    }

    console.log("[directFetcher] 直连响应无法解析比赛数据");
    return { success: false, reason: "parse_failed" };

  } catch (e) {
    if (e.name === "AbortError" || e.name === "TimeoutError") {
      console.log("[directFetcher] 直连超时 (8s)");
      return { success: false, reason: "timeout" };
    }
    console.error("[directFetcher] 直连网络错误:", e.message);
    return { success: false, reason: "network_error", error: e.message };
  }
}