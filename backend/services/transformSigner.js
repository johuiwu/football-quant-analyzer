// ======================== transform.php 签名提取与缓存 ========================
// 从拦截到的 transform.php?ver=xxx 中提取签名参数，缓存后供直连使用

import crypto from "crypto";

// ---- 签名缓存 ----
let cachedVer = null;
let cachedAt = 0;
const TTL_MS = 60000; // 60s TTL

/**
 * 从拦截到的 transform.php URL 中提取 ver 签名参数并缓存
 * 格式：transform.php?ver=md5hex_timestamp
 */
export function extractVerFromRequest(url) {
  if (!url || typeof url !== "string") return false;
  const match = url.match(/ver=([^&\s]+)/);
  if (!match) {
    console.log("[signer] 未找到 ver 参数:", url.substring(0, 120));
    return false;
  }
  cachedVer = match[1];
  cachedAt = Date.now();
  console.log("[signer] 提取并缓存 ver 签名, TTL=" + (TTL_MS / 1000) + "s");
  return true;
}

/**
 * 获取当前缓存的 ver 签名（若未过期）
 * @returns {string|null} 签名或 null
 */
export function getCurrentVer() {
  if (!cachedVer) return null;
  if (Date.now() - cachedAt >= TTL_MS) {
    console.log("[signer] ver 签名已过期 (" + ((Date.now() - cachedAt) / 1000).toFixed(1) + "s)");
    cachedVer = null;
    return null;
  }
  return cachedVer;
}

/**
 * 预留：用密钥自主生成 ver 签名
 * 目前服务端签名算法未知，暂不启用
 */
export function regenerateVer(secret) {
  if (!secret || typeof secret !== "string") {
    console.log("[signer] regenerateVer: 需要 secret 参数");
    return null;
  }
  const ts = Date.now();
  const hash = crypto.createHash("md5").update(secret + ts).digest("hex");
  return hash + "_" + ts;
}

/**
 * 预留：从页面全局变量扫描可能存在的签名密钥
 * 扫描 window 对象中名称含 secret|sign|key|token 的字符串变量
 */
export async function extractSecretFromPage(page) {
  if (!page) return null;
  try {
    const candidates = await page.evaluate(() => {
      const results = [];
      const patterns = /secret|sign|key|token/i;
      for (const key of Object.getOwnPropertyNames(window)) {
        if (patterns.test(key)) {
          const val = window[key];
          if (typeof val === "string" && val.length > 5 && val.length < 200) {
            results.push({ key, val: val.substring(0, 80) });
          }
        }
      }
      return results;
    });
    if (candidates.length > 0) {
      console.log("[signer] 页面发现 " + candidates.length + " 个可疑签名变量:", JSON.stringify(candidates));
      return candidates;
    }
    console.log("[signer] 页面未发现可疑签名变量");
    return null;
  } catch (e) {
    console.log("[signer] extractSecretFromPage 失败:", e.message);
    return null;
  }
}