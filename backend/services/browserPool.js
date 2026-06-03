import puppeteer from "puppeteer-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";

puppeteer.use(StealthPlugin());

// ======================== 单例浏览器管理 ========================
let browser = null;
let sharedPage = null;
let loginCookies = null;
let lastBalance = 0;

const HG_URL = "https://www.hga050.com";
const HEADLESS = process.env.CRAWLER_HEADLESS !== "false";

// ======================== 浏览器启动 ========================
async function launchBrowser() {
  console.log("[browserPool] 正在启动浏览器... (headless=" + HEADLESS + ")");
  try {
    const bi = await puppeteer.launch({
      headless: HEADLESS,
      slowMo: process.env.CRAWLER_DEBUG === "1" ? 100 : 0,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-gpu",
        "--disable-blink-features=AutomationControlled",
        "--window-size=1920,1400"
      ]
    });
    console.log("[browserPool] 浏览器已启动");
    return bi;
  } catch (e) {
    console.error("[browserPool] 浏览器启动失败:", e.message);
    return null;
  }
}

async function getSharedBrowser(forceNew = false) {
  if (forceNew && browser) {
    try { await browser.close(); } catch (e) {}
    browser = null;
    sharedPage = null;
    loginCookies = null;
  }

  if (browser && typeof browser.isConnected === "function" && browser.isConnected()) {
    return browser;
  }

  console.warn("[browserPool] 浏览器未连接，准备重新启动...");
  browser = null;
  browser = await launchBrowser();
  return browser;
}

function getSharedPage() {
  return sharedPage;
}

function setSharedPage(page) {
  sharedPage = page;
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
  return !!sharedPage;
}

async function closeSharedBrowser() {
  if (browser) {
    try { await browser.close(); } catch (e) {}
    browser = null;
    sharedPage = null;
    loginCookies = null;
    lastBalance = 0;
    console.log("[browserPool] 浏览器已关闭");
  }
  return { success: true };
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
  closeSharedBrowser,
  HG_URL
};
