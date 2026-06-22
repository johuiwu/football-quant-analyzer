import puppeteer from "puppeteer-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";
import fs from "fs";
import path from "path";
import os from "os";

puppeteer.use(StealthPlugin());

// ======================== 单例浏览器管理 ========================

// ======================== 反指纹：随机视口 ========================
const VIEWPORT_WIDTHS = [1366, 1440, 1536, 1600, 1920];
const VIEWPORT_HEIGHTS = [768, 864, 900, 1080];

export function getRandomViewport() {
  const w = VIEWPORT_WIDTHS[Math.floor(Math.random() * VIEWPORT_WIDTHS.length)];
  const h = VIEWPORT_HEIGHTS[Math.floor(Math.random() * VIEWPORT_HEIGHTS.length)];
  return { width: w, height: h };
}

/** 移动端 iPhone UA */
const MOBILE_UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1";

/** 随机 Chrome 版本 UA (127-130) 或移动端 UA */
export function getRandomUA() {
  if (process.env.USE_MOBILE_UA === "true") return MOBILE_UA;
  const version = 127 + Math.floor(Math.random() * 4);
  return "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/" + version + ".0.0.0 Safari/537.36";
}
let browser = null;
let sharedPage = null;
let loginCookies = null;
let lastBalance = 0;
let isLaunching = false; // 防止重复启动
let lastActivityTime = 0; // 最后活动时间
let heartbeatPage = null; // 心跳保活页面
let heartbeatTimer = null;
let currentUid = null; // 当前 uid 缓存

const HG_URL = process.env.HG_URL || "https://www.hga050.com";

const FALLBACK_DOMAINS = [
  "https://www.hga038.com",
  "https://m510.crw066.com",
];

// ======================== 本地浏览器检测 ========================

/**
 * 检测本地已安装的 Chrome 或 Edge 浏览器
 * 优先级：Chrome → Edge
 * @returns {string|null} 浏览器可执行文件路径，或 null
 */
export function detectLocalBrowser() {
  const candidates = [
    { path: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', name: 'Chrome' },
    { path: 'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe', name: 'Edge' },
  ];
  for (const { path: browserPath, name } of candidates) {
    if (fs.existsSync(browserPath)) {
      console.log(`[browserPool] 使用本地 ${name} 浏览器 (路径: ${browserPath})`);
      return browserPath;
    }
  }
  console.error('[browserPool] 错误：系统未安装 Chrome 或 Edge，请安装任意一款浏览器再启用角球监控');
  return null;
}

/**
 * 自动探测代理并返回 Puppeteer 的 --proxy-server 参数
 * 优先级：PUPPETEER_PROXY 环境变量 → 本地端口探测
 * @returns {Promise<string[]>} Chrome 启动参数数组
 */
async function _detectBrowserProxyArgs() {
  // 优先级 1：环境变量
  if (process.env.PUPPETEER_PROXY) {
    console.log('[browserPool] 使用环境变量代理: ' + process.env.PUPPETEER_PROXY);
    return [`--proxy-server=${process.env.PUPPETEER_PROXY}`, "--host-resolver-rules=MAP * ~NOTFOUND , EXCLUDE localhost"];
  }

  // 优先级 2：本地端口探测（复用 hgApiClient 的 detectProxyConfig）
  try {
    const { detectProxyConfig } = await import("./hgApiClient.js");
    const proxyConfig = await detectProxyConfig();
    if (proxyConfig) {
      const proxyUrl = `${proxyConfig.protocol || 'http'}://${proxyConfig.host}:${proxyConfig.port}`;
      console.log('[browserPool] 自动探测到代理: ' + proxyUrl);
      return [`--proxy-server=${proxyUrl}`, "--host-resolver-rules=MAP * ~NOTFOUND , EXCLUDE localhost"];
    }
  } catch (e) {
    // hgApiClient 不可用时忽略
  }

  return []; // 无代理，直连
}

// ======================== 浏览器启动 ========================

// ======================== WebSocket 心跳保活 ========================
async function startHeartbeat(bi) {
  try {
    heartbeatPage = await bi.newPage();
    await heartbeatPage.goto("about:blank", { waitUntil: "domcontentloaded" });
    console.log("[browserPool] 心跳页面已创建 (about:blank)");
    const tick = async () => {
      if (!heartbeatPage || heartbeatPage.isClosed()) return;
      try {
        await heartbeatPage.evaluate(() => Date.now());
        lastActivityTime = Date.now();
      } catch (_) {}
      const delay = 60000 + Math.floor(Math.random() * 30000);
      heartbeatTimer = setTimeout(tick, delay);
    };
    tick();
  } catch (e) {
    console.warn("[browserPool] 心跳启动失败:", e.message);
  }
}

async function stopHeartbeat() {
  if (heartbeatTimer) { clearTimeout(heartbeatTimer); heartbeatTimer = null; }
  if (heartbeatPage) {
    try { await heartbeatPage.close(); } catch (_) {}
    heartbeatPage = null;
  }
}
async function launchBrowser() {
  // 防止重复启动
  if (isLaunching) {
    console.log("[browserPool] 浏览器正在启动中，等待...");
    const _lwStart = Date.now();
    const _lwMax = 30000;
    while (isLaunching) {
      if (Date.now() - _lwStart > _lwMax) {
        console.warn("[browserPool] isLaunching 超时(30s)，强制重置");
        isLaunching = false;
        break;
      }
      await new Promise(r => setTimeout(r, 500));
    }
    return browser;
  }

  const detectedPath = detectLocalBrowser();
  if (!detectedPath) {
    isLaunching = false;
    return null;
  }
  isLaunching = true;
  console.log("[browserPool] 正在启动浏览器... (headless=" + (process.env.CRAWLER_HEADLESS === 'true' ? 'new' : 'false') + ", executablePath=" + detectedPath + ")");

  try {
      const vp = getRandomViewport();
    const bi = await puppeteer.launch({
      headless: process.env.CRAWLER_HEADLESS === 'true' ? 'new' : false,
      executablePath: detectedPath,
      userDataDir: path.join(os.tmpdir(), 'puppeteer_profile'),
      slowMo: process.env.CRAWLER_DEBUG === "1" ? 100 : 0,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-gpu",
        "--disable-blink-features=AutomationControlled",
        "--ignore-certificate-errors",
        `--window-size=${vp.width},${vp.height}`,
        "--disable-features=VizDisplayCompositor,IsolateOrigins,site-per-process,TranslateUI,IPCFloodingProtection",
        "--enable-features=NetworkService,NetworkServiceInProcess",
        "--lang=zh-CN,zh",
        "--accept-lang=zh-CN,zh;q=0.9",
        ...(await _detectBrowserProxyArgs()),
      ],
      timeout: 120000 // 启动超时 2 分钟
    });
    console.log("[browserPool] 浏览器已启动");
    // 反指纹注入（所有新页面自动生效，覆盖 webdriver/languages/platform/hardwareConcurrency）
    bi.on("targetcreated", async (target) => {
      if (target.type() === "page") {
        try {
          const page = await target.page();
          if (page) {
            await page.evaluateOnNewDocument(() => {
              Object.defineProperty(navigator, "webdriver", { get: () => false });
              Object.defineProperty(navigator, "plugins", { get: () => [1, 2, 3, 4, 5] });
              Object.defineProperty(navigator, "languages", { get: () => ["zh-CN", "zh"] });
              Object.defineProperty(navigator, "platform", { get: () => "Win32" });
              Object.defineProperty(navigator, "hardwareConcurrency", { get: () => 4 + Math.floor(Math.random() * 5) });
              Object.defineProperty(screen, "width", { get: () => window.innerWidth });
              Object.defineProperty(screen, "height", { get: () => window.innerHeight });
            });
          }
        } catch (_) {}
      }
    });
    startHeartbeat(bi);
    console.log("[browserPool] 心跳已启动");
    isLaunching = false;
    lastActivityTime = Date.now();
    return bi;
  } catch (e) {
    const errMsg = e.message || String(e);
    console.error("[browserPool] 浏览器启动失败:", errMsg);
    if (errMsg.includes("chrome") || errMsg.includes("executable")) {
      console.error("[browserPool] 提示: 请安装 Google Chrome 或 Microsoft Edge 浏览器");
    }
    isLaunching = false;
    return null;
  }
}

async function getSharedBrowser(forceNew = false) {
  // 强制新建
  if (forceNew && browser) {
    console.log("[browserPool] 强制关闭现有浏览器...");
    try {
      await browser.close();
    } catch (e) {
      console.warn("[browserPool] 关闭浏览器时出错:", e.message);
    }
    browser = null;
    sharedPage = null;
    loginCookies = null;
    lastActivityTime = 0;
  }

  // 检查现有浏览器是否可用
  if (browser) {
    try {
      // 尝试获取浏览器版本来检测连接状态
      const version = await browser.version();
      if (version) {
        lastActivityTime = Date.now();
        console.log("[browserPool] 复用现有浏览器会话");
        return browser;
      }
    } catch (e) {
      console.warn("[browserPool] 浏览器连接已断开:", e.message);
      browser = null;
      sharedPage = null;
    }
  }

  console.warn("[browserPool] 浏览器未连接，准备重新启动...");
  browser = null;
  browser = await launchBrowser();
  return browser;
}

/**
 * 检查浏览器是否处于活跃状态
 */
function isBrowserActive() {
  if (!browser) return false;
  // 检查最后活动时间，超过 2 分钟未活动可能已失效
  const now = Date.now();
  return (now - lastActivityTime) < 120000; // 2 分钟
}

function getSharedPage() {
  return sharedPage;
}

function setSharedPage(page) {
  sharedPage = page;
  if (page) {
    lastActivityTime = Date.now();
  }
}

function getLoginCookies() {
  return loginCookies;
}

function setLoginCookies(cookies) {
  loginCookies = cookies;
}

function getBalance() {
  return lastBalance;
}

function setBalance(balance) {
  lastBalance = balance;
}

function isLoggedIn() {
  // 检查是否有共享页面且浏览器活跃
  return !!sharedPage && isBrowserActive();
}

async function closeSharedBrowser() {
  if (browser) {
    await stopHeartbeat();
    try {
      await browser.close();
    } catch (e) {
      console.warn("[browserPool] 关闭浏览器时出错:", e.message);
    }
    browser = null;
    sharedPage = null;
    loginCookies = null;
    lastBalance = 0;
    lastActivityTime = 0;
    console.log("[browserPool] 浏览器已关闭");
  }
  return { success: true };
}

// ======================== Cookie 文件持久化 ========================
// ★ 禁止使用 import.meta.url / __dirname 推导路径
// 统一使用 process.env.COOKIE_PATH（由 Electron main.cjs 或 server.ts 设置）
// 回退到 APPDATA 等价路径（与 Electron app.getPath('userData') 一致）
function _resolveCookiePath() {
  if (process.env.COOKIE_PATH) return process.env.COOKIE_PATH;

  // 等价于 Electron app.getPath('userData')：APPDATA/<productName>
  const appName = '足球竞彩量化分析系统';
  const userDataDir = path.join(process.env.APPDATA || process.env.HOME || '.', appName);
  return path.join(userDataDir, 'cookies.json');
}

let COOKIE_PATH = _resolveCookiePath();

// 旧路径（import.meta.url 时代）— 用于自动迁移
const _OLD_COOKIE_PATHS = [
  // 开发模式旧路径：backend/cookies.json（相对于项目根目录）
  path.resolve(process.cwd(), 'backend', 'cookies.json'),
];

// 自动迁移：如果新路径不存在但旧路径存在，复制过来
function _migrateCookieFile() {
  if (fs.existsSync(COOKIE_PATH)) return; // 新路径已有文件，无需迁移
  for (const oldPath of _OLD_COOKIE_PATHS) {
    try {
      if (fs.existsSync(oldPath)) {
        // 确保新路径的目录存在
        const dir = path.dirname(COOKIE_PATH);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        fs.copyFileSync(oldPath, COOKIE_PATH);
        console.log('[browserPool] 已自动迁移 Cookie 文件: ' + oldPath + ' → ' + COOKIE_PATH);
        return;
      }
    } catch (e) {
      console.warn('[browserPool] Cookie 文件迁移失败:', e.message);
    }
  }
}
_migrateCookieFile();

function saveCookiesToDisk(cookies) {
  try {
    fs.writeFileSync(COOKIE_PATH, JSON.stringify(cookies, null, 2), "utf8");
    console.log("[browserPool] Cookie 已写入磁盘: " + COOKIE_PATH);
    return true;
  } catch (e) {
    console.warn("[browserPool] Cookie 写入失败:", e.message);
    return false;
  }
}

function loadCookiesFromDisk() {
  try {
    if (fs.existsSync(COOKIE_PATH)) {
      const raw = fs.readFileSync(COOKIE_PATH, "utf8");
      const cookiesRaw = JSON.parse(raw);
      if (Array.isArray(cookiesRaw) && cookiesRaw.length > 0) {
        const now = Date.now() / 1000;
        const validCookies = cookiesRaw.filter(ck => !ck.expires || ck.expires > now);
        const expired = cookiesRaw.length - validCookies.length;
        if (expired > 0) {
          console.log("[browserPool] 丢弃 " + expired + " 条过期 Cookie");
        }
        if (validCookies.length > 0) {
          console.log("[browserPool] 从磁盘加载 Cookie (" + validCookies.length + " 条有效)");
          return validCookies;
        } else {
          console.log("[browserPool] 所有 Cookie 已过期");
        }
      }
      }
  } catch (e) {
    console.warn("[browserPool] Cookie 读取失败:", e.message);
  }
  return null;
}

function getUid() {
  return currentUid;
}

function setUid(uid) {
  currentUid = uid;
}

export {
  getSharedBrowser,
  getSharedPage,
  setSharedPage,
  getLoginCookies,
  setLoginCookies,
  getBalance,
  setBalance,
  isLoggedIn,
  isBrowserActive,
  closeSharedBrowser,
  HG_URL,
  FALLBACK_DOMAINS,
  saveCookiesToDisk,
  loadCookiesFromDisk,
  MOBILE_UA,
  getUid,
  setUid
};