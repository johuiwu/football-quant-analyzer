import puppeteer from "puppeteer-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";
import fs from "fs";
import { fileURLToPath } from "url";
import { resolve } from "path";

puppeteer.use(StealthPlugin());

// ======================== 单例浏览器管理 ========================
let browser = null;
let sharedPage = null;
let loginCookies = null;
let lastBalance = 0;
let isLaunching = false; // 防止重复启动
let lastActivityTime = 0; // 最后活动时间

const HG_URL = process.env.HG_URL || "https://www.hga050.com";

/** 读取环境变量决定是否无头模式，默认 true（有头模式需显式设 CRAWLER_HEADLESS=false） */
function getHeadless() {
  return process.env.CRAWLER_HEADLESS !== "false";
}

// ======================== 浏览器启动 ========================
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

  const headless = getHeadless();
  isLaunching = true;
  console.log("[browserPool] 正在启动浏览器... (headless=" + headless + ", CRAWLER_HEADLESS=" + (process.env.CRAWLER_HEADLESS || "(未设置)") + ")");

  try {
    const bi = await puppeteer.launch({
      headless,
      slowMo: process.env.CRAWLER_DEBUG === "1" ? 100 : 0,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-gpu",
        "--disable-blink-features=AutomationControlled",
        "--window-size=1920,1400",
        "--disable-features=VizDisplayCompositor,IsolateOrigins,site-per-process",
        "--enable-features=NetworkService,NetworkServiceInProcess"
      ],
      timeout: 120000 // 启动超时 2 分钟
    });
    console.log("[browserPool] 浏览器已启动");
    isLaunching = false;
    lastActivityTime = Date.now();
    return bi;
  } catch (e) {
    const errMsg = e.message || String(e);
    console.error("[browserPool] 浏览器启动失败:", errMsg);
    if (errMsg.includes("chrome") || errMsg.includes("executable")) {
      console.error("[browserPool] 提示: 请确认 Chromium 已安装 (npm install puppeteer 自动下载)");
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
  // 检查最后活动时间，超过 5 分钟未活动可能已失效
  const now = Date.now();
  return (now - lastActivityTime) < 300000; // 5 分钟
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
let COOKIE_PATH;
try {
  // ESM 模式（原始源码）
  COOKIE_PATH = fileURLToPath(new URL("../cookies.json", import.meta.url));
} catch {
  // CJS/bundled 模式（esbuild 打包后 import.meta.url 为空）
  // 优先使用环境变量，否则回退到 cwd
  COOKIE_PATH = process.env.COOKIE_PATH || resolve(process.cwd(), "backend", "cookies.json");
}

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
      const cookies = JSON.parse(raw);
      if (Array.isArray(cookies) && cookies.length > 0) {
        console.log("[browserPool] 从磁盘加载 Cookie (" + cookies.length + " 条)");
        return cookies;
      }
    }
  } catch (e) {
    console.warn("[browserPool] Cookie 读取失败:", e.message);
  }
  return null;
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
  saveCookiesToDisk,
  loadCookiesFromDisk
};