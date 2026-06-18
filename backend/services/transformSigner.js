// ======================== transform.php 签名提取与缓存 ========================
// 从拦截到的 transform.php?ver=xxx 中提取签名参数，缓存后供直连使用

// ---- 签名缓存 ----
let cachedVer = null;
let cachedAt = 0;
const TTL_MS = 120000; // 120s TTL（与页面刷新频率匹配）

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