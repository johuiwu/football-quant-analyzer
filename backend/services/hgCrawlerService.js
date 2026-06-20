import puppeteer from "puppeteer-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";

puppeteer.use(StealthPlugin());

import { getSharedBrowser, getSharedPage, setSharedPage, isBrowserActive, closeSharedBrowser as closeShared, HG_URL, FALLBACK_DOMAINS, loadCookiesFromDisk, setUid, getUid } from "./browserPool.js";
import { parseAllMarkets, handlePopups, clickTab, parseAsianHandicap } from "./crawlerShared.js";
import { pauseCornerBackendPolling, resumeCornerBackendPolling, getBackendPollingStatus } from "./cornerService.js";
import { updateCredentials, loadAndValidate } from "./credentialManager.js";
import { extractVerFromRequest } from "./transformSigner.js";
import fs from "fs";

// ======================== 登录互斥锁 ========================
// 防止 hgCrawlerService.loginToHG 和 autoLogin.autoLoginAndGetCredentials 同时运行
let loginMutex = Promise.resolve();

/**
 * 等待登录互斥锁并注册新的互斥段
 * @param {Function} fn - 需要互斥执行的异步函数
 * @returns {Promise} fn 的返回值
 */
export function withLoginMutex(fn) {
  let resolve;
  const next = new Promise(r => { resolve = r; });
  const prev = loginMutex;
  loginMutex = next;
  return prev.then(() => fn()).finally(resolve);
}

// ======================== 配置常量 ========================
const HG_USERNAME = process.env.HG_USERNAME || "";
const HG_PASSWORD = process.env.HG_PASSWORD || "";

// ======================== 域名可达性检测 ========================
/**
 * 检测域名 443 端口是否可达
 */
async function checkDomainReachable(url, timeout = 8000) {
  // ★ 如果配置了代理，跳过检测（代理模式下直连必然失败）
  if (process.env.PUPPETEER_PROXY) {
    console.log("[HgCrawler] 代理模式已启用，跳过域名可达性检测");
    return true;
  }
  try {
    // 使用 HTTPS HEAD 请求替代原始 TCP socket 检测
    // 原始 TCP socket 不支持 SNI，导致需要 SNI 的网站误判为不可达
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);
    const res = await fetch(url, {
      method: "HEAD",
      signal: controller.signal,
      redirect: "manual",
    });
    clearTimeout(timer);
    // 任何响应（包括 3xx 重定向）都说明域名可达
    return res.status > 0;
  } catch (err) {
    // fetch 失败（网络错误/超时/SSL错误）视为不可达
    return false;
  }
}

/**
 * 检测并选择可达的域名
 */
async function selectReachableDomain() {
  console.log("[HgCrawler] 检测主域名可达性:", HG_URL);
  if (await checkDomainReachable(HG_URL)) {
    console.log("[HgCrawler] 主域名可达:", HG_URL);
    return { url: HG_URL, changed: false };
  }
  console.warn("[HgCrawler] 主域名不可达:", HG_URL);

  for (const fb of FALLBACK_DOMAINS) {
    console.log("[HgCrawler] 检测备选域名可达性:", fb);
    if (await checkDomainReachable(fb)) {
      console.log("[HgCrawler] 备选域名可达，切换到:", fb);
      return { url: fb, changed: true };
    }
    console.warn("[HgCrawler] 备选域名不可达:", fb);
  }

  console.error("[HgCrawler] 所有域名均不可达，使用主域名:", HG_URL);
  return { url: HG_URL, changed: false };
}
const NAV_WAIT_MS = 8000;
const TAB_WAIT_MS = 4000;
const SCROLL_WAIT_MS = 3000;

if (!process.env.HG_USERNAME || !process.env.HG_PASSWORD) {
  console.warn("[HgCrawler] 环境变量 HG_USERNAME / HG_PASSWORD 未设置，将使用运行时凭据");
}

let mainPage = null;
let crawlerStatus = {
  isLoggedIn: false,
  lastUpdate: null,
  error: null,
  matchesCount: 0
};

// 轮询状态
let pollingActive = false;
let pollingTimer = null;
let pollingCallback = null;

export function getCrawlerStatus() {
  return { ...crawlerStatus };
}

async function safeEvaluate(page, fn) {
  let retries = 3;
  while (retries > 0) {
    try {
      return await page.evaluate(fn);
    } catch (err) {
      if (err.message && (err.message.includes("Execution context was destroyed") || err.message.includes("detached Frame")) && retries > 1) {
        console.log("[HgCrawler] 页面导航中，等待后重试...");
        await new Promise((r) => setTimeout(r, 2000));
        retries--;
        continue;
      }
      if (err.message && err.message.includes("textContent")) {
        console.log("[HgCrawler] textContent 错误，跳过");
        return null;
      }
      throw err;
    }
  }
  return null;
}

async function clickNoButton(page) {
  try {
    let clickedSomething = false;

    // 1. 尝试点击按钮
    const clicked = await page.evaluate(() => {
      // 辅助函数：检查元素是否可见
      const isVisible = (el) => {
        const style = getComputedStyle(el);
        return style.display !== 'none' && style.visibility !== 'hidden';
      };

      let localClicked = false;

      // 点击"普通登入"按钮（简易密码页面）
      const normalLoginBtn = document.getElementById("back_login");
      if (normalLoginBtn && isVisible(normalLoginBtn)) {
        normalLoginBtn.click();
        localClicked = true;
      }

      // 点击取消/否按钮
      const cancelBtns = document.querySelectorAll(".btn_cancel, #C_no_btn, #no_btn, #C_cancel_btn, [class*='popup'] [class*='close']");
      for (const btn of cancelBtns) {
        if (!isVisible(btn)) continue;
        const text = (btn.textContent || "").trim().toUpperCase();
        if (text === "NO" || text === "否" || text === "CANCEL" || text === "取消" || btn.id === "C_no_btn" || btn.id === "no_btn" || btn.id === "C_cancel_btn") {
          btn.click(); localClicked = true;
        }
      }

      // fallback: 点击任意可见的 .btn_cancel
      if (!localClicked) {
        const cancelFallback = document.querySelectorAll(".btn_cancel");
        for (const btn of cancelFallback) {
          if (!isVisible(btn)) continue;
          btn.click(); localClicked = true; break;
        }
      }

      // 点击确认/OK按钮
      const okBtns = document.querySelectorAll('[class*="msg_popup"] .btn, .btn_confirm, .btn_submit, #C_ok_btn, #ok_btn, #C_alert_confirm, #alert_confirm, #kick_ok_btn, .btn_sure');
      for (const btn of okBtns) {
        if (!isVisible(btn)) continue;
        const text = (btn.textContent || "").trim().toUpperCase();
        if (text === "OK" || text === "确认" || text === "确定" || text === "SUBMIT" || text === "提交" || text === "是" || btn.id === "C_yes_btn" || btn.id === "yes_btn") {
          btn.click(); localClicked = true;
        }
      }

      return localClicked;
    });
    clickedSomething = clicked;

    // 2. 稍作延迟，等待 JS 执行
    if (clickedSomething) {
      await new Promise(r => setTimeout(r, 400));
    }

    // 3. 强制兜底：只移除特定弹窗对话框的 .on 类，不动容器元素
    const forceCleaned = await page.evaluate(() => {
      let cleaned = false;

      // 只移除具体弹窗对话框的 .on 类，不碰容器元素（#msg_popup, #alert_show, .popup）
      const dialogIds = ["C_alert_confirm", "alert_confirm", "C_alert_ok", "alert_ok", "alert_kick", "system_popup"];
      for (const id of dialogIds) {
        const el = document.getElementById(id);
        if (el && el.classList.contains("on")) {
          el.classList.remove("on");
          cleaned = true;
        }
      }

      // 移除 body 上的可能锁定类
      const bodyLock = document.body;
      if (bodyLock) {
        bodyLock.classList.remove("scroll_lock", "locked");
        bodyLock.style.overflow = "";
      }

      return cleaned;
    });
    if (forceCleaned) {
      clickedSomething = true;
    }

    // 4. 按 ESC 键作为最后兜底
    try {
      await page.keyboard.press("Escape");
      await new Promise(r => setTimeout(r, 200));
    } catch (_) {}

    if (clickedSomething) console.log("[HgCrawler] ✓ 已处理弹窗（含强制清理）");
    return !!clickedSomething;
  } catch (err) {
    console.log("[HgCrawler] clickNoButton 出错:", err.message);
    return false;
  }
}

async function detectLoginState(page) {
  return await safeEvaluate(page, () => {
    try {
      // 优先级1: 简易密码页面（#back_login 可见）
      var backLogin = document.getElementById('back_login');
      if (backLogin) {
        var s = getComputedStyle(backLogin);
        if (s.display !== 'none' && s.visibility !== 'hidden') {
          return { state: 'PASSCODE_PAGE', detail: '简易密码页面' };
        }
      }

      // 优先级2: 被踢出（#alert_kick 容器激活 + #kick_ok_btn 可见）
      var alertKick = document.getElementById('alert_kick');
      if (alertKick && alertKick.classList.contains('on')) {
        // 弹窗容器已激活，确认踢出按钮可见
        var kickBtn = document.getElementById('kick_ok_btn');
        if (kickBtn) {
          var ks = getComputedStyle(kickBtn);
          if (ks.display !== 'none' && ks.visibility !== 'hidden') {
            return { state: 'KICKED_OUT', detail: '被踢出登录' };
          }
        }
        // 容器激活但按钮不可见，仍然判定为被踢出（容器可见即表示弹窗显示）
        return { state: 'KICKED_OUT', detail: '被踢出登录(容器激活)' };
      }
      // 回退：如果 #alert_kick 不存在，仅检查按钮可见性
      if (!alertKick) {
        var kickBtnFallback = document.getElementById('kick_ok_btn');
        if (kickBtnFallback) {
          var kfs = getComputedStyle(kickBtnFallback);
          if (kfs.display !== 'none' && kfs.visibility !== 'hidden') {
            return { state: 'KICKED_OUT', detail: '被踢出登录(无容器)' };
          }
        }
      }

      // 优先级3: 检测激活弹窗（容器 .on 类）— 必须在 LOGIN_PAGE 之前！
      var popupIds = ['C_alert_confirm', 'alert_confirm', 'alert_show'];
      for (var i = 0; i < popupIds.length; i++) {
        var popupEl = document.getElementById(popupIds[i]);
        if (popupEl && popupEl.classList.contains('on')) {
          return { state: 'POPUP_ACTIVE', detail: '弹窗激活: ' + popupIds[i] };
        }
      }

      // 优先级4: 已登录（主页特征）
      var bodyText = document.body.textContent || "";
      var hasMainFeature = (bodyText.includes("My Events") || bodyText.includes("My Bets")) ||
                           (bodyText.includes("In-Play") && bodyText.includes("Soccer"));
      if (!hasMainFeature) {
        var nav = document.getElementById("today_page") || document.getElementById("live_page");
        if (nav && getComputedStyle(nav).display !== 'none' && getComputedStyle(nav).visibility !== 'hidden') hasMainFeature = true;
        var symbol = document.getElementById("symbol_ft");
        if (symbol && getComputedStyle(symbol).display !== 'none' && getComputedStyle(symbol).visibility !== 'hidden') hasMainFeature = true;
      }
      if (hasMainFeature) {
        return { state: 'LOGGED_IN', detail: '主页特征可见' };
      }

      // 优先级5: 登录页面（#usr 可见）
      var usrEl = document.querySelector('#usr');
      if (usrEl && usrEl.offsetParent !== null) {
        return { state: 'LOGIN_PAGE', detail: '登录页面' };
      }

      // 优先级6: 其他状态
      return { state: 'WAIT_RESPONSE', detail: '等待响应' };
    } catch (err) {
      return { state: 'WAIT_RESPONSE', detail: '检测异常: ' + (err.message || '') };
    }
  });
}

// ======================== 登录 ========================
export async function loginToHG(credentials, forceNew = false, isolated = false) {
  // ★ 登录互斥锁：防止与 autoLogin 并发
  return withLoginMutex(async () => {
    // 互斥锁获取后先检查凭证是否已有效（可能前一个登录已成功）
    if (!forceNew && !isolated) {
      try {
        const validCreds = await loadAndValidate();
        if (validCreds && validCreds.uid && validCreds.ver) {
          const sharedPage = getSharedPage();
          if (sharedPage && isBrowserActive()) {
            console.log("[HgCrawler] 互斥锁获取后检测到凭证有效且共享页面可用，跳过登录");
            crawlerStatus.isLoggedIn = true;
            return { success: true };
          }
        }
      } catch (_) {}
    }

    return await _loginToHGImpl(credentials, forceNew, isolated);
  });
}

async function _loginToHGImpl(credentials, forceNew = false, isolated = false) {
  console.log("[HgCrawler] 开始登录...");
  crawlerStatus.error = null;

  // ★ 域名可达性检测与回退
  const { url: activeUrl, changed: domainChanged } = await selectReachableDomain();
  if (domainChanged) {
    console.log("[HgCrawler] 域名已切换:", activeUrl);
  }

  // Priority: reuse shared browser session from browserPool
  if (!forceNew && !isolated) {
    const sharedPage = getSharedPage();
    if (sharedPage && isBrowserActive()) {
      try {
        const sharedUrl = await sharedPage.url();
        console.log("[HgCrawler] Shared session found: " + (sharedUrl || "").substring(0, 100));
        const status = await safeEvaluate(sharedPage, () => {
          try {
            const bodyText = document.body.textContent || "";
            return (bodyText.includes("My Events") || bodyText.includes("My Bets")) ||
                   (bodyText.includes("In-Play") && bodyText.includes("Soccer")) ||
                   (function(){
                     var acc = document.getElementById("acc_show");
                     if (acc) {
                       return acc.style.display === "none" || acc.offsetParent === null;
                     }
                     return false;
                   })();
          } catch (e) { return false; }
        });
        if (status) {
          console.log("[HgCrawler] Reusing shared session, skip login");
          mainPage = sharedPage;
          crawlerStatus.isLoggedIn = true;
          return { success: true };
        }
      } catch (err) {
        console.log("[HgCrawler] Shared session invalid: " + err.message);
      }
    }
  }

  // 如果 mainPage 仍有效，尝试复用
  if (!forceNew && !isolated && mainPage) {
    try {
      const currentUrl = mainPage.url();
      console.log("[HgCrawler] 复用已有页面: " + (currentUrl || "").substring(0, 100));
      const status = await safeEvaluate(mainPage, () => {
        try {
          const bodyText = document.body.textContent || "";
          return (bodyText.includes("My Events") || bodyText.includes("My Bets")) ||
                 (bodyText.includes("In-Play") && bodyText.includes("Soccer")) ||
                 (function(){
                   var acc = document.getElementById("acc_show");
                   if (acc) {
                     return acc.style.display === "none" || acc.offsetParent === null;
                   }
                   return false;
                 })();
        } catch (e) { return false; }
      });
      if (status) {
        console.log("[HgCrawler] 已有页面登录态有效，跳过登录");
        crawlerStatus.isLoggedIn = true;
        return { success: true };
      }
    } catch (err) {
      console.log("[HgCrawler] 已有页面已失效，将创建新页面");
      mainPage = null;
    }
  }

  let bi;
  if (isolated) {
    const headless = true;
    bi = await puppeteer.launch({
      headless,
      executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
      args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage", "--disable-gpu", "--window-size=1920,1400"],
      timeout: 60000
    });
    console.log("[HgCrawler] 隔离浏览器已启动");
    const savedCookies = loadCookiesFromDisk();
    let cookiePage = await bi.newPage();
    await cookiePage.setUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36");
    await cookiePage.setViewport({ width: 1920, height: 1400 });
    if (savedCookies && savedCookies.length > 0) {
      for (const ck of savedCookies) { try { await cookiePage.setCookie(ck); } catch (_) {} }
      await cookiePage.goto(activeUrl, { waitUntil: "domcontentloaded", timeout: 30000 });
      await new Promise(r => setTimeout(r, 1500));
      const isValid = await safeEvaluate(cookiePage, () => {
        const body = document.body?.textContent || "";
        return (body.includes("In-Play") && body.includes("Soccer")) || !!document.getElementById("symbol_ft");
      });
      if (isValid) {
        console.log("[HgCrawler] Cookie快速登录成功 (隔离模式)");
        return { success: true, page: cookiePage, browser: bi };
      }
      console.log("[HgCrawler] Cookie无效，执行完整登录...");
      await cookiePage.close();
    }
  } else {
    bi = await getSharedBrowser(forceNew);
  }
  let page = null;

  try {
    page = await bi.newPage();
    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36"
    );
    await page.setViewport({ width: 1920, height: 1400 });
    await page.evaluateOnNewDocument(() => {
      Object.defineProperty(navigator, "webdriver", { get: () => false });
      Object.defineProperty(navigator, "plugins", { get: () => [1, 2, 3, 4, 5] });
    });

    // ★ 登录前清除浏览器所有 Cookie 和缓存，避免旧会话冲突导致被踢出
    try {
      const client = await page.target().createCDPSession();
      await client.send("Network.clearBrowserCookies");
      await client.send("Network.clearBrowserCache");
      console.log("[HgCrawler] 已清除浏览器 Cookie 和缓存（防止旧会话冲突）");
    } catch (e) {
      console.warn("[HgCrawler] 清除 Cookie/缓存失败:", e.message);
    }

    await page.goto(activeUrl, { waitUntil: "domcontentloaded", timeout: 60000 });
    console.log("[HgCrawler] 等待页面完全加载...");
    // 条件等待：检测登录表单或主页特征（替代固定 sleep 5s）
    try {
      await page.waitForFunction(() => {
        const usr = document.getElementById('usr');
        const body = document.body?.textContent || '';
        return (usr && getComputedStyle(usr).display !== 'none') ||
               body.includes('In-Play') || body.includes('Soccer') ||
               body.includes('My Events') || body.includes('Balance');
      }, { timeout: 8000 });
    } catch (_) {}

    let loginClicked = false;
    const popupCount = { passcodePage: 0, passcodeDialog: 0, kickedOut: 0 };
    const MAX_POPUP = 5;
    const loginStartTime = Date.now();
    const LOGIN_TIMEOUT = 60000;

    while (Date.now() - loginStartTime < LOGIN_TIMEOUT) {
      const detected = await detectLoginState(page);
      if (!detected || !detected.state) {
        await new Promise((r) => setTimeout(r, 1000));
        continue;
      }

      switch (detected.state) {
        case 'PASSCODE_PAGE':
          popupCount.passcodePage++;
          if (popupCount.passcodePage > MAX_POPUP) {
            console.log("[HgCrawler] WARNING: passcodePage 弹窗超过 " + MAX_POPUP + " 次，登录失败");
            crawlerStatus.error = "popup loop timeout (passcodePage)";
            return isolated ? { success: false, error: "popup loop timeout (passcodePage)" } : { success: false, error: "popup loop timeout (passcodePage)" };
          }
          console.log("[HgCrawler] 检测到简易密码页面，点击普通登入... (" + detected.detail + ")");
          await page.evaluate(() => {
            const btn = document.querySelector("#back_login");
            if (btn) btn.click();
          });
          await new Promise((r) => setTimeout(r, 1500));
          loginClicked = false;
          console.log("[HgCrawler] 已点击普通登入，等待登录页面加载后重新登录...");
          break;

        case 'KICKED_OUT':
          popupCount.kickedOut++;
          if (popupCount.kickedOut > 2) {
            // ★ 被踢出超过 2 次直接返回失败，避免死循环
            console.log("[HgCrawler] 被踢出超过 2 次，登录失败（网站反并发机制触发）");
            crawlerStatus.error = "登录失败：账号在其他地方登录或网站反爬机制触发，请稍后重试";
            return { success: false, error: crawlerStatus.error };
          }
          console.log("[HgCrawler] 检测到被踢出登录，点击确认并清理... (" + detected.detail + ")");
          // 1. 点击确认按钮
          await page.evaluate(() => {
            const btn = document.querySelector("#kick_ok_btn");
            if (btn) btn.click();
          });
          await new Promise((r) => setTimeout(r, 1000));
          // 2. 强制移除弹窗容器的 .on 类
          await page.evaluate(() => {
            const dialogIds = ["alert_kick", "C_alert_confirm", "alert_confirm", "C_alert_ok", "alert_ok", "system_popup"];
            for (const id of dialogIds) {
              const el = document.getElementById(id);
              if (el && el.classList.contains("on")) el.classList.remove("on");
            }
            if (document.body) {
              document.body.classList.remove("scroll_lock", "locked");
              document.body.style.overflow = "";
            }
          });
          // 3. 清除 Cookie 并关闭当前页面，打开全新页面重新导航
          console.log("[HgCrawler] 第 " + popupCount.kickedOut + " 次被踢出，关闭当前页面并重新打开...");
          try {
            const client = await page.target().createCDPSession();
            await client.send("Network.clearBrowserCookies");
            console.log("[HgCrawler] 已清除浏览器 Cookie");
          } catch (e) {
            console.warn("[HgCrawler] 清除 Cookie 失败:", e.message);
          }
          try {
            // ★ 关闭旧页面，打开新页面（彻底清除页面状态）
            await page.close();
            page = await bi.newPage();
            await page.setUserAgent(
              "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36"
            );
            await page.setViewport({ width: 1920, height: 1400 });
            await page.evaluateOnNewDocument(() => {
              Object.defineProperty(navigator, "webdriver", { get: () => false });
              Object.defineProperty(navigator, "plugins", { get: () => [1, 2, 3, 4, 5] });
            });
            // ★ 等待足够时间让网站服务端处理登出状态
            await new Promise((r) => setTimeout(r, 8000));
            await page.goto(activeUrl, { waitUntil: "domcontentloaded", timeout: 30000 });
            // 等待登录表单加载
            try {
              await page.waitForFunction(() => {
                const usr = document.getElementById('usr');
                return usr && getComputedStyle(usr).display !== 'none';
              }, { timeout: 8000 });
            } catch (_) {}
            console.log("[HgCrawler] 新页面已打开并导航到登录页");
          } catch (e) {
            console.warn("[HgCrawler] 重新打开页面失败:", e.message);
          }
          loginClicked = false;
          break;

        case 'PASSCODE_DIALOG':
          popupCount.passcodeDialog++;
          if (popupCount.passcodeDialog > MAX_POPUP) {
            console.log("[HgCrawler] WARNING: passcodeDialog 弹窗超过 " + MAX_POPUP + " 次，登录失败");
            crawlerStatus.error = "popup loop timeout (passcodeDialog)";
            return isolated ? { success: false, error: "popup loop timeout (passcodeDialog)" } : { success: false, error: "popup loop timeout (passcodeDialog)" };
          }
          console.log("[HgCrawler] 检测到弹窗，尝试处理... (" + detected.detail + ", loginClicked=" + loginClicked + ")");
          const clicked = await clickNoButton(page);
          if (clicked) {
            await new Promise((r) => setTimeout(r, 1000));
            try { await page.waitForNavigation({ waitUntil: "domcontentloaded", timeout: 8000 }); } catch (_) {}
          } else {
            await new Promise((r) => setTimeout(r, 1000));
          }
          break;

        case 'POPUP_ACTIVE':
          console.log("[HgCrawler] 检测到激活弹窗，先点击取消按钮再清理...");
          await clickNoButton(page);
          await new Promise((r) => setTimeout(r, 1000));
          // 强制清理弹窗
          await page.evaluate(() => {
            const dialogIds = ["C_alert_confirm", "alert_confirm", "alert_show", "system_popup"];
            for (const id of dialogIds) {
              const el = document.getElementById(id);
              if (el && el.classList.contains("on")) el.classList.remove("on");
            }
            if (document.body) {
              document.body.classList.remove("scroll_lock", "locked");
              document.body.style.overflow = "";
            }
          });
          break;

        case 'LOGGED_IN':
          console.log("[HgCrawler] ✅ 登录成功！ (" + detected.detail + ", loginClicked=" + loginClicked + ")");
          if (!isolated) { mainPage = page; setSharedPage(page); }
          crawlerStatus.isLoggedIn = true;

          // ★ 登录成功后提取 uid/ver 并保存到 credentialManager
          try {
            // 从 frame URL 提取 uid
            const frames = page.frames();
            for (const frame of frames) {
              try {
                const frameUrl = frame.url();
                if (frameUrl.includes("transform.php") && frameUrl.includes("uid=")) {
                  const uidMatch = frameUrl.match(/uid=([^&]+)/);
                  if (uidMatch && uidMatch[1] && uidMatch[1].length >= 10 && !uidMatch[1].endsWith("=")) {
                    setUid(uidMatch[1]);
                    console.log("[HgCrawler] 从 frame 提取 uid: " + uidMatch[1].substring(0, 12) + "...");
                    break;
                  }
                }
              } catch (e) {}
            }
            // 从 DOM 提取 uid（备选）
            if (!getUid()) {
              try {
                const domUid = await page.evaluate(() => {
                  try { return top.uid || window.uid || ""; } catch(e) { return window.uid || ""; }
                });
                if (domUid && domUid !== "undefined" && domUid.length >= 10 && !domUid.endsWith("=")) {
                  setUid(domUid);
                  console.log("[HgCrawler] 从 DOM 提取 uid: " + domUid.substring(0, 12) + "...");
                }
              } catch (e) {}
            }
            // 从 DOM 提取 ver
            const domVer = await page.evaluate(() => {
              try { return top.ver || window.ver || ""; } catch(e) { return window.ver || ""; }
            });
            if (domVer) {
              extractVerFromRequest(domVer);
              console.log("[HgCrawler] 从 DOM 提取 ver: " + domVer.substring(0, 16) + "...");
            }
            // 保存凭证到磁盘
            const cookies = await page.cookies();
            updateCredentials({ uid: getUid(), ver: domVer, cookies, username: credentials?.username, password: credentials?.password });
            console.log("[HgCrawler] 凭证已保存到 credentialManager");
          } catch (e) {
            console.warn("[HgCrawler] 提取 uid/ver 失败:", e.message);
          }

          if (process.env.CRAWLER_DEBUG === "1") {
            await page.screenshot({ path: "debug-login-success.png" });
          }
          return isolated ? { success: true, page, browser: bi } : { success: true };

        case 'LOGIN_PAGE':
          if (!loginClicked) {
            console.log("[HgCrawler] 设置用户名密码并登录...");
            const user = credentials && credentials.username ? credentials.username : HG_USERNAME;
            const pwd = credentials && credentials.password ? credentials.password : HG_PASSWORD;

            // 使用 Puppeteer type() 方法模拟真实键盘输入
            const usernameInput = await page.$("#usr, input[name='username'], input[type='text']");
            if (usernameInput) {
              await usernameInput.click({ clickCount: 3 });
              await usernameInput.type(user, { delay: 50 });
            }
            const passwordInput = await page.$("#pwd, input[name='password'], input[type='password']");
            if (passwordInput) {
              await passwordInput.click({ clickCount: 3 });
              await passwordInput.type(pwd, { delay: 50 });
            }
            // 点击登录按钮
            const btnSelectors = ["#btn_login", "input[type='submit']", "button[type='submit']", "input[type='button']"];
            for (const sel of btnSelectors) {
              try {
                const btn = await page.$(sel);
                if (btn) {
                  const box = await btn.boundingBox();
                  if (box && box.width > 0 && box.height > 0) {
                    await btn.click();
                    break;
                  }
                }
              } catch (e) {}
            }

            loginClicked = true;
            // ★ 不重置 kickedOut 计数器，防止被踢出后重新登录又走"首次被踢出"分支导致死循环
            popupCount.passcodePage = 0;
            popupCount.passcodeDialog = 0;
            console.log("[HgCrawler] ✓ 已点击登录按钮");
          }
          await new Promise((r) => setTimeout(r, 500));
          break;

        case 'WAIT_RESPONSE':
        default:
          await new Promise((r) => setTimeout(r, 1000));
          break;
      }
    }

    console.log("[HgCrawler] ⚠ 登录超时");
    crawlerStatus.error = "登录超时";
    return { success: false, error: "登录超时" };
  } catch (err) {
    console.error("[HgCrawler] 登录失败:", err.message);
    crawlerStatus.error = err.message;
    return { success: false, error: err.message };
  }
}

// ======================== 导航到 In-Play（使用 shared clickTab） ========================
async function navigateToInPlay(page) {
  console.log("[HgCrawler] 导航到 In-Play...");
  try {
    // SPA 页面，URL 不变是正常的，以 DOM 内容为准（桌面版用 #live_page "滚球"）
    let clicked = await page.evaluate(() => {
      const tab = document.getElementById('live_page');
      if (tab) { tab.click(); return true; }
      return false;
    });
    if (!clicked) clicked = await clickTab(page, "滚球", NAV_WAIT_MS);
    if (!clicked) {
      console.log("[HgCrawler]   未找到 In-Play Tab，尝试模糊匹配...");
      try {
        const fuzzy = await page.evaluate(() => {
          const all = document.querySelectorAll("a, button, span, div, li");
          for (const el of all) {
            const text = (el.textContent || "").trim().toUpperCase();
            const rect = el.getBoundingClientRect();
            if (rect.width < 15 || rect.height < 10) continue;
            if (text.includes("IN-PLAY") || text.includes("INPLAY") || text.includes("LIVE")) {
              el.scrollIntoView({ block: "center" });
              el.click();
              return true;
            }
          }
          return false;
        });
        if (fuzzy) {
          console.log("[HgCrawler]   模糊匹配 In-Play 成功");
          await new Promise(r => setTimeout(r, NAV_WAIT_MS));
        }
      } catch (e) {}
    }

    // 等待动态内容渲染
    try {
      await page.waitForSelector('div.box_lebet[class*="bet_type_"], div.bet_box', { timeout: 15000 });
      console.log("[HgCrawler]   In-Play 比赛内容已加载");
    } catch (e) {
      console.log("[HgCrawler]   In-Play 无比赛内容 (超时): " + e.message);
    }
    return true;
  } catch (err) {
    console.log("[HgCrawler] 导航到 In-Play 失败:", err.message);
    return false;
  }
}

// ======================== 解析 Soccer 页面比赛列表 ========================
async function parseSoccerMatches(page) {
  console.log("[HgCrawler] 解析 Soccer 页面比赛列表...");
  try {
    await page.screenshot({ path: "debug/soccer-page.png", fullPage: true });
  } catch (e) {}

  const matches = await page.evaluate(() => {
    const results = [];

    // 策略 A: 查找标准的比赛元素
    const containers = document.querySelectorAll("div.box_lebet, div[class*='game'], div[class*='match'], div[class*='row']");
    for (const el of containers) {
      try {
        const text = (el.textContent || "").trim();
        if (!text.includes("vs")) continue;
        
        // 查找球队名
        const teamEls = el.querySelectorAll("div[class*='team'], span[class*='team'], div.text_team, span.text_team");
        let homeTeam = "", awayTeam = "";
        if (teamEls.length >= 2) {
          homeTeam = (teamEls[0].textContent || "").trim();
          awayTeam = (teamEls[1].textContent || "").trim();
        } else {
          // 尝试从文本中解析 "A vs B"
          const vsMatch = text.match(/(.+?)\s+vs\s+(.+?)(?:\s+|$)/i);
          if (vsMatch) {
            homeTeam = vsMatch[1].trim();
            awayTeam = vsMatch[2].trim();
          }
        }
        if (!homeTeam || !awayTeam) continue;
        
        // 查找比分
        let homeScore = 0, awayScore = 0;
        const scoreMatch = text.match(/(\d{1,2})\s*[-–—]\s*(\d{1,2})/);
        if (scoreMatch) {
          homeScore = parseInt(scoreMatch[1], 10);
          awayScore = parseInt(scoreMatch[2], 10);
        } else {
          const scoreEls = el.querySelectorAll("span[class*='point'], span[class*='score'], div.box_score");
          if (scoreEls.length >= 2) {
            homeScore = parseInt((scoreEls[0].textContent || "0").trim(), 10) || 0;
            awayScore = parseInt((scoreEls[1].textContent || "0").trim(), 10) || 0;
          }
        }
        
        // 查找联赛名
        let league = "";
        let prev = el.previousElementSibling;
        let upCount = 0;
        while (prev && upCount < 10) {
          const pText = (prev.textContent || "").trim();
          if (pText && pText.length > 3 && pText.length < 60 && !/\d/.test(pText) && !/vs/i.test(pText)) {
            league = pText;
            break;
          }
          prev = prev.previousElementSibling;
          upCount++;
        }
        
        // 查找时间
        let timeStr = "";
        const timeMatch = text.match(/(\d{1,2}:\d{2}|\d{1,2}'|HT)/);
        if (timeMatch) timeStr = timeMatch[0];
        
        results.push({ homeTeam, awayTeam, league, time: timeStr || "--:--", homeScore, awayScore, elapsedMinutes: 0 });
      } catch (e) {}
    }
    
    if (results.length > 0) {
      console.log("[HgCrawler] 策略 A 解析到 " + results.length + " 场比赛");
      return results;
    }

    console.log("[HgCrawler] 策略 A 无结果，尝试策略 B...");

    // Step 1: 收集所有可见文本元素（含坐标）
    const allItems = [];
    document.querySelectorAll("*").forEach(el => {
      try {
        const directText = [];
        for (const node of el.childNodes) {
          if (node.nodeType === 3) {
            const t = node.textContent.trim();
            if (t.length > 0) directText.push(t);
          }
        }
        const text = directText.join(" ") || (el.textContent || "").trim();
        if (text.length < 2 || text.length > 200) return;
        const rect = el.getBoundingClientRect();
        if (rect.width < 8 || rect.height < 5) return;
        allItems.push({ text, tag: el.tagName, y: Math.round(rect.top), x: Math.round(rect.left), w: Math.round(rect.width), h: Math.round(rect.height) });
      } catch (e) {}
    });
    allItems.sort((a, b) => a.y - b.y || a.x - b.x);

    // Step 2: 找所有比分位置 (如 "1-1", "2-0")
    const scorePositions = [];
    for (let i = 0; i < allItems.length; i++) {
      const scoreMatch = allItems[i].text.match(/^(\d{1,2})\s*[-–—]\s*(\d{1,2})$/);
      if (scoreMatch && allItems[i].text.length <= 7) {
        scorePositions.push({
          idx: i,
          y: allItems[i].y,
          x: allItems[i].x,
          home: parseInt(scoreMatch[1]),
          away: parseInt(scoreMatch[2])
        });
      }
    }

    // Step 3: 为每个比分找附近的球队名
    const usedTeams = new Set();
    for (const sp of scorePositions) {
      // 找比分上方最近的联赛名
      let league = "";
      for (let j = sp.idx - 1; j >= 0; j--) {
        const item = allItems[j];
        if (Math.abs(item.y - sp.y) > 100) break;
        const t = item.text;
        if (t.length > 3 && t.length < 60 &&
            /^[A-Z]/.test(t) && !/\d/.test(t) &&
            !/vs/i.test(t) && !/^[A-Z]{1,2}$/.test(t)) {
          league = t;
          break;
        }
      }

      // 找比分同行或上方的球队名（主队一般在比分左边，客队在右边）
      let homeTeam = "", awayTeam = "";

      // 主队: 在比分左侧附近找最长文本
      for (let j = sp.idx - 1; j >= Math.max(0, sp.idx - 8); j--) {
        const item = allItems[j];
        if (Math.abs(item.y - sp.y) > 12) continue;
        if (item.x >= sp.x) continue;
        const t = item.text;
        if (t.length > 2 && !/^\d/.test(t) && !/^\d+\.\d{2}$/.test(t) &&
            /[A-Z]/.test(t) && !usedTeams.has(t)) {
          if (t.length > homeTeam.length) homeTeam = t;
        }
      }
      // 如果左侧没找到，往上方找
      if (!homeTeam) {
        for (let j = sp.idx - 1; j >= Math.max(0, sp.idx - 20); j--) {
          const item = allItems[j];
          if (Math.abs(item.y - sp.y) > 40) continue;
          const t = item.text;
          if (t.length > 2 && !/^\d/.test(t) && !/^\d+\.\d{2}$/.test(t) &&
              /[A-Z]/.test(t) && !usedTeams.has(t)) {
            homeTeam = t;
            break;
          }
        }
      }

      // 客队: 在比分右侧附近找
      for (let j = sp.idx + 1; j < Math.min(allItems.length, sp.idx + 8); j++) {
        const item = allItems[j];
        if (Math.abs(item.y - sp.y) > 12) continue;
        if (item.x <= sp.x + 50) continue;
        const t = item.text;
        if (t.length > 2 && !/^\d/.test(t) && !/^\d+\.\d{2}$/.test(t) &&
            /[A-Z]/.test(t) && !usedTeams.has(t)) {
          if (t.length > awayTeam.length) awayTeam = t;
        }
      }
      // 如果右侧没找到，往下方找
      if (!awayTeam) {
        for (let j = sp.idx + 1; j < Math.min(allItems.length, sp.idx + 20); j++) {
          const item = allItems[j];
          if (Math.abs(item.y - sp.y) > 40) continue;
          const t = item.text;
          if (t.length > 2 && !/^\d/.test(t) && !/^\d+\.\d{2}$/.test(t) &&
              /[A-Z]/.test(t) && !usedTeams.has(t)) {
            awayTeam = t;
            break;
          }
        }
      }

      if (homeTeam && awayTeam) {
        usedTeams.add(homeTeam);
        usedTeams.add(awayTeam);

        // 找时间（比分附近的小文本，格式如 12:34 或 HT 或 90'）
        let timeStr = "--:--";
        for (let j = Math.max(0, sp.idx - 10); j < Math.min(allItems.length, sp.idx + 10); j++) {
          const t = allItems[j].text;
          if (/^\d{1,3}[:']\d{2}$/.test(t) || /^\d{1,3}'$/.test(t) || t === "HT" || /^\d{1,2}:\d{2}$/.test(t)) {
            timeStr = t;
            break;
          }
        }

        results.push({
          homeTeam, awayTeam, league, time: timeStr,
          homeScore: sp.home, awayScore: sp.away,
          elapsedMinutes: 0
        });
      }
    }

    return results;
  });

  console.log("[HgCrawler] Soccer页解析到 " + matches.length + " 场比赛");
  if (matches.length > 0) {
    matches.slice(0, 3).forEach((m, i) =>
      console.log(`  [${i}] ${m.homeTeam} vs ${m.awayTeam} | ${m.league} | ${m.homeScore}-${m.awayScore} | ${m.time}`)
    );
  }

  // 转换为统一格式
  return matches.map((m, idx) => ({
    league: m.league || "",
    homeTeam: m.homeTeam,
    awayTeam: m.awayTeam,
    time: m.time || "--:--",
    homeScore: m.homeScore || 0,
    awayScore: m.awayScore || 0,
    elapsedMinutes: m.elapsedMinutes || 0,
    cornerOU: null,
    cornerHDP: null,
    nextCorner: null,
    cornerOE: null,
    totalCorners: 0,
    matchName: (m.homeTeam || "") + " vs " + (m.awayTeam || ""),
    matchId: "soccer_" + idx + "_" + Date.now(),
    timestamp: Date.now()
  }));
}

// ======================== 解析 CORNERS 页面角球盘口 ========================
async function parseCornerOdds(page) {
  console.log("[HgCrawler] 解析 CORNERS 页面角球盘口...");

  try {
    await page.screenshot({ path: "debug/corners-page.png", fullPage: true });
  } catch (e) {}

  const cornerData = await page.evaluate(() => {
    const results = [];

    function safeText(el, selector) {
      const found = selector ? el.querySelector(selector) : el;
      return found ? (found.textContent || "").trim() : "";
    }
    function safeFloat(el, selector) {
      const t = safeText(el, selector);
      const num = parseFloat(t);
      return (!isNaN(num) && num > 0) ? num : 0;
    }
    function extractCornerCount(root) {
      if (!root) return 0;
      const totalEl = root.querySelector("span.game_total, [class*='corner'] span, [class*='total']");
      if (totalEl) {
        const val = parseInt((totalEl.textContent || "").trim(), 10);
        if (!isNaN(val) && val >= 0 && val <= 30) return val;
      }
      const scoreEls = root.querySelectorAll("div.box_score span.text_point");
      if (scoreEls.length >= 2) {
        const ch = parseInt((scoreEls[0].textContent || "0").trim(), 10);
        const ca = parseInt((scoreEls[1].textContent || "0").trim(), 10);
        if (!isNaN(ch) && !isNaN(ca) && ch >= 0 && ca >= 0) return ch + ca;
      }
      return 0;
    }

    // ====== 策略1: div.bet_box ======
    let containers = document.querySelectorAll("div.bet_box");
    if (containers.length > 0) {
      for (const box of containers) {
        try {
          let league = "";
          let prev = box.previousElementSibling;
          while (prev && !league) {
            const text = (prev.textContent || "").trim();
            if (text && text.length < 40 && !text.includes("\n") && !/^\d/.test(text)) {
              league = text; break;
            }
            prev = prev.previousElementSibling;
          }

          const homeEl = box.querySelector("div.box_team.teamH span.text_team, div.team_home, [class*='team_h']");
          const awayEl = box.querySelector("div.box_team.teamC span.text_team, div.team_away, [class*='team_a']");
          let homeTeam = safeText(homeEl), awayTeam = safeText(awayEl);

          if (!homeTeam || !awayTeam) {
            const parentRow = box.closest("[class*='row'], [class*='game'], [class*='match']");
            if (parentRow) {
              homeTeam = safeText(parentRow, "[class*='team_h'] span, .teamH span");
              awayTeam = safeText(parentRow, "[class*='team_c'] span, .teamC span");
            }
          }
          if (!homeTeam || !awayTeam) continue;

          const searchRoot = box.closest("[class*='row'], [class*='game'], [class*='match'], [class*='box_lebet']") || box.parentElement || box;
          let timeStr = safeText(searchRoot, "tt.text_time i, .text_time, [class*='timer'], [class*='minute']");
          let elapsedMinutes = 0;
          if (timeStr) {
            if (timeStr.toUpperCase() === "HT") elapsedMinutes = 45;
            else { const parts = timeStr.split(":"); elapsedMinutes = parts.length === 2 ? parseInt(parts[0], 10) || 0 : parseInt(timeStr, 10) || 0; }
          }

          // 比分解析: 仅用CSS选择器，不用文本匹配（避免误匹配角球数）
          let homeScore = 0, awayScore = 0;
          {
            const scoreEls = searchRoot.querySelectorAll("div.box_score span.text_point, .score, [class*='score'] span, [class*='point']");
            if (scoreEls.length >= 2) {
              const hs = parseInt((scoreEls[0].textContent || "0").trim(), 10);
              const as = parseInt((scoreEls[1].textContent || "0").trim(), 10);
              if (!isNaN(hs) && !isNaN(as) && hs >= 0 && hs <= 15 && as >= 0 && as <= 15) {
                homeScore = hs;
                awayScore = as;
              }
            }
          }

          // 角球数解析: 从比赛容器文本中提取
          const cornerCount = extractCornerCount(searchRoot) || extractCornerCount(box) || 0;

          // 盘口数据: 优先用标签文本匹配（避免赔率硬编码索引导致错乱）
          // 构建 handicaps 数组（兼容 parseAllMarkets 格式，含中文标签+半场）
          const handicaps = [];
          let hOrder = 1;
          const categoryMap = {
            '大/小':'O/U','大小':'O/U','O/U':'O/U','角球大/小':'O/U','角球大小':'O/U','Over/Under':'O/U',
            '让球':'HDP','HDP':'HDP','角球让球':'HDP','Handicap':'HDP',
            '独赢':'1X2','1X2':'1X2','1 X 2':'1X2','角球独赢':'1X2',
            '单/双':'O/E','单双':'O/E','O/E':'O/E','角球单/双':'O/E','角球单双':'O/E','Odd/Even':'O/E',
            'NEXT CORNER':'NEXT','下一个角球':'NEXT','下一角球':'NEXT'
          };

          const oddBlocks = box.querySelectorAll('div.box_lebet_odd');
          for (const block of oddBlocks) {
            const headSpan = block.querySelector('div.head_lebet span');
            let marketLabel = "";
            if (headSpan) { marketLabel = (headSpan.textContent || "").trim(); } else { const headDiv = block.querySelector("div.head_lebet"); if (!headDiv) continue; marketLabel = (headDiv.textContent || "").trim(); }
            const category = categoryMap[marketLabel] || categoryMap[marketLabel.toUpperCase()];
            if (!category) continue;

            const betButtons = block.querySelectorAll('div.btn_lebet_odd:not(.lock)');
            if (betButtons.length === 0) continue;

            // 检测半场（box_lebet_half 类 或 标签含上半场/1H）
            const isHalf = block.classList.contains('box_lebet_half') ||
              marketLabel.includes('上半场') || marketLabel.includes('1st Half') || marketLabel.includes('1H');
            const period = isHalf ? 'half' : 'full';
            const categoryLabel = (isHalf ? '上半场 ' : '') + marketLabel;

            const hItem = { order: hOrder++, category, categoryLabel, period, source: 'dom', marketGroup: 'corner' };

            if (category === '1X2' && betButtons.length >= 3) {
              const ods = {};
              for (let bj = 0; bj < betButtons.length; bj++) {
                const bq = betButtons[bj].querySelector('tt.text_ballou');
                const blv = (bq ? bq.textContent : '').trim();
                const bv = parseFloat((betButtons[bj].querySelector('span.text_odds') || {}).textContent || '0');
                if (!isNaN(bv) && bv > 0) {
                  if (blv === "主" || blv === "1") ods.home = bv; else if (blv === "和" || blv === "X") ods.draw = bv; else if (blv === "客" || blv === "2") ods.away = bv;
                }
              }
              hItem.odds = ods;
            } else if (category === 'O/U' && betButtons.length >= 2) {
              const ln = parseFloat((betButtons[0].querySelector('tt.text_ballhead') || {}).textContent || '0') || 0;
              let over = 0, under = 0;
              for (let bj = 0; bj < betButtons.length; bj++) {
                const bq = betButtons[bj].querySelector('tt.text_ballou');
                const blv = (bq ? bq.textContent : '').trim();
                const bv = parseFloat((betButtons[bj].querySelector('span.text_odds') || {}).textContent || '0');
                if (!isNaN(bv) && bv > 0) { if (blv === "大" || blv === "O") over = bv; else if (blv === "小" || blv === "U") under = bv; }
              }
              hItem.line = ln; hItem.odds = { over, under };
            } else if (category === 'HDP' && betButtons.length >= 2) {
              const ln = ((betButtons[0].querySelector('tt.text_ballhead') || {}).textContent || '').trim();
              const ho = parseFloat((betButtons[0].querySelector('span.text_odds') || {}).textContent || '0');
              const ao = parseFloat((betButtons[1].querySelector('span.text_odds') || {}).textContent || '0');
              hItem.line = ln; hItem.odds = { home: ho || 0, away: ao || 0 };
            } else if (category === 'O/E' && betButtons.length >= 2) {
              let oo = 0, eo = 0;
              for (let bj = 0; bj < betButtons.length; bj++) {
                const bq = betButtons[bj].querySelector('tt.text_ballou');
                const blv = (bq ? bq.textContent : '').trim();
                const bv = parseFloat((betButtons[bj].querySelector('span.text_odds') || {}).textContent || '0');
                if (!isNaN(bv) && bv > 0) { if (blv === "单" || blv === "Odd") oo = bv; else if (blv === "双" || blv === "Even") eo = bv; }
              }
              hItem.odds = { odd: oo, even: eo };
            } else if (category === 'NEXT' && betButtons.length >= 2) {
              const ho2 = parseFloat((betButtons[0].querySelector('span.text_odds') || {}).textContent || '0');
              const ao2 = parseFloat((betButtons[1].querySelector('span.text_odds') || {}).textContent || '0');
              hItem.line = marketLabel; hItem.odds = { home: ho2 || 0, away: ao2 || 0 };
            } else {
              continue;
            }
            handicaps.push(hItem);
          }

          const result = {
            homeTeam, awayTeam, league, time: timeStr, elapsedMinutes,
            homeScore, awayScore, totalCorners: cornerCount,
            handicaps
          };
          if (handicaps.length > 0) results.push(result);
        } catch (e) {}
      }
    }

    // ====== 策略2: div.box_lebet.bet_type_cn ======
    const categoryMap = {
      '大/小':'O/U','大小':'O/U','O/U':'O/U','角球大/小':'O/U','角球大小':'O/U','Over/Under':'O/U',
      '让球':'HDP','HDP':'HDP','角球让球':'HDP','Handicap':'HDP',
      '独赢':'1X2','1X2':'1X2','1 X 2':'1X2','角球独赢':'1X2',
      '单/双':'O/E','单双':'O/E','O/E':'O/E','角球单/双':'O/E','角球单双':'O/E','Odd/Even':'O/E',
      'NEXT CORNER':'NEXT','下一个角球':'NEXT','下一角球':'NEXT'
    };
    if (results.length === 0) {
      containers = document.querySelectorAll("div.box_lebet.bet_type_cn");
      if (containers.length > 0) {
        for (const gameEl of containers) {
          try {
            let league = "";
            let prev = gameEl.previousElementSibling;
            while (prev && !league) {
              const leaEl = prev.querySelector("tt#lea_name");
              if (leaEl) { league = safeText(leaEl); break; }
              prev = prev.previousElementSibling;
            }

            const leftPanel = gameEl.querySelector("div.box_lebet_l");
            if (!leftPanel) continue;
            const homeTeam = safeText(leftPanel, "div.box_team.teamH span.text_team");
            const awayTeam = safeText(leftPanel, "div.box_team.teamC span.text_team");
            if (!homeTeam || !awayTeam) continue;

            let timeStr = safeText(leftPanel, "tt.text_time i:not([class*='icon'])");
            let elapsedMinutes = 0;
            if (timeStr) {
              if (timeStr.toUpperCase() === "HT") elapsedMinutes = 45;
              else { const parts = timeStr.split(":"); elapsedMinutes = parts.length === 2 ? parseInt(parts[0], 10) || 0 : parseInt(timeStr, 10) || 0; }
            }

            // 比分: 仅用CSS选择器
            let homeScore = 0, awayScore = 0;
            {
              const scoreSpans = leftPanel.querySelectorAll("div.box_score span.text_point, [class*='point']");
              if (scoreSpans.length >= 2) {
                homeScore = parseInt((scoreSpans[0].textContent || "0").trim(), 10) || 0;
                awayScore = parseInt((scoreSpans[1].textContent || "0").trim(), 10) || 0;
              }
            }

            // 角球数
            const cornerCount = extractCornerCount(leftPanel) || extractCornerCount(gameEl) || 0;

            // 盘口数据: 构建 handicaps 数组（含中文标签+半场，同策略1）
            const handicaps = [];
            let hOrder = 1;
            const rightPanel = gameEl.querySelector('div.box_lebet_r');
            if (rightPanel) {
              const oddBlocks = rightPanel.querySelectorAll('div.box_lebet_odd');
              for (const block of oddBlocks) {
                const headSpan = block.querySelector('div.head_lebet span');
                let marketLabel = "";
                if (headSpan) { marketLabel = (headSpan.textContent || "").trim(); } else { const headDiv = block.querySelector("div.head_lebet"); if (!headDiv) continue; marketLabel = (headDiv.textContent || "").trim(); }
                const category = categoryMap[marketLabel] || categoryMap[marketLabel.toUpperCase()];
                if (!category) continue;

                const betButtons = block.querySelectorAll('div.btn_lebet_odd:not(.lock)');
                if (betButtons.length === 0) continue;

                const isHalf = block.classList.contains('box_lebet_half') ||
                  marketLabel.includes('上半场') || marketLabel.includes('1st Half') || marketLabel.includes('1H');
                const period = isHalf ? 'half' : 'full';
                const categoryLabel = (isHalf ? '上半场 ' : '') + marketLabel;

                const hItem = { order: hOrder++, category, categoryLabel, period, source: 'dom', marketGroup: 'corner' };

                if (category === '1X2' && betButtons.length >= 3) {
                  const ods = {};
                  for (let bj = 0; bj < betButtons.length; bj++) {
                    const bq = betButtons[bj].querySelector('tt.text_ballou');
                    const blv = (bq ? bq.textContent : '').trim();
                    const bv = parseFloat((betButtons[bj].querySelector('span.text_odds') || {}).textContent || '0');
                    if (!isNaN(bv) && bv > 0) {
                      if (blv === "主" || blv === "1") ods.home = bv; else if (blv === "和" || blv === "X") ods.draw = bv; else if (blv === "客" || blv === "2") ods.away = bv;
                    }
                  }
                  hItem.odds = ods;
                } else if (category === 'O/U' && betButtons.length >= 2) {
                  const ln = parseFloat((betButtons[0].querySelector('tt.text_ballhead') || {}).textContent || '0') || 0;
                  let over = 0, under = 0;
                  for (let bj = 0; bj < betButtons.length; bj++) {
                    const bq = betButtons[bj].querySelector('tt.text_ballou');
                    const blv = (bq ? bq.textContent : '').trim();
                    const bv = parseFloat((betButtons[bj].querySelector('span.text_odds') || {}).textContent || '0');
                    if (!isNaN(bv) && bv > 0) { if (blv === "大" || blv === "O") over = bv; else if (blv === "小" || blv === "U") under = bv; }
                  }
                  hItem.line = ln; hItem.odds = { over, under };
                } else if (category === 'HDP' && betButtons.length >= 2) {
                  const ln = ((betButtons[0].querySelector('tt.text_ballhead') || {}).textContent || '').trim();
                  const ho = parseFloat((betButtons[0].querySelector('span.text_odds') || {}).textContent || '0');
                  const ao = parseFloat((betButtons[1].querySelector('span.text_odds') || {}).textContent || '0');
                  hItem.line = ln; hItem.odds = { home: ho || 0, away: ao || 0 };
                } else if (category === 'O/E' && betButtons.length >= 2) {
                  let oo = 0, eo = 0;
                  for (let bj = 0; bj < betButtons.length; bj++) {
                    const bq = betButtons[bj].querySelector('tt.text_ballou');
                    const blv = (bq ? bq.textContent : '').trim();
                    const bv = parseFloat((betButtons[bj].querySelector('span.text_odds') || {}).textContent || '0');
                    if (!isNaN(bv) && bv > 0) { if (blv === "单" || blv === "Odd") oo = bv; else if (blv === "双" || blv === "Even") eo = bv; }
                  }
                  hItem.odds = { odd: oo, even: eo };
                } else if (category === 'NEXT' && betButtons.length >= 2) {
                  hItem.line = marketLabel;
                  hItem.odds = { home: parseFloat((betButtons[0].querySelector('span.text_odds') || {}).textContent || '0') || 0, away: parseFloat((betButtons[1].querySelector('span.text_odds') || {}).textContent || '0') || 0 };
                } else {
                  continue;
                }
                handicaps.push(hItem);
              }
            }

            const result = { homeTeam, awayTeam, league, time: timeStr, elapsedMinutes, homeScore, awayScore, totalCorners: cornerCount, handicaps };
            if (handicaps.length > 0) results.push(result);
          } catch (e) {}
        }
      }
    }

    // ====== 策略3: 通用 div[class*='box_lebet'] ======
    if (results.length === 0) {
      containers = document.querySelectorAll("div[class*='box_lebet']");
      const matchContainers = [...containers].filter(el => {
        const text = (el.textContent || "").toLowerCase();
        return text.includes("vs") || (el.querySelector("[class*='team']") && el.querySelector("[class*='odd']"));
      });

      for (const el of matchContainers) {
        try {
          const teams = el.querySelectorAll("[class*='team_h'] span, [class*='teamH'] span, [class*='team_c'] span, [class*='teamC'] span");
          if (teams.length < 2) continue;
          const homeTeam = (teams[0].textContent || "").trim();
          const awayTeam = (teams[1].textContent || "").trim();
          if (!homeTeam || !awayTeam) continue;
          const oddsSpans = el.querySelectorAll("span.text_odds, span.odds, [class*='odds']");
          const oddsValues = [];
          oddsSpans.forEach(s => { const v = parseFloat((s.textContent || "").trim()); if (!isNaN(v) && v > 0) oddsValues.push(v); });
          results.push({ homeTeam, awayTeam, league: "", time: "", elapsedMinutes: 0, homeScore: 0, awayScore: 0, totalCorners: 0, cornerOU: null, cornerHDP: null, nextCorner: null, cornerOE: null, rawOdds: oddsValues });
        } catch (e) {}
      }
    }

    return results;
  });

  // 去重
  const seen = new Set();
  const deduped = [];
  for (const m of cornerData) {
    const key = (m.homeTeam + "|||" + m.awayTeam).toLowerCase();
    if (!seen.has(key)) { seen.add(key); deduped.push(m); }
  }

  console.log("[HgCrawler] CORNERS页解析到 " + deduped.length + " 条角球盘口");
  if (deduped.length > 0) {
    deduped.slice(0, 3).forEach((m, i) =>
      console.log(`  [${i}] ${m.homeTeam} vs ${m.awayTeam} | league=${m.league} | 比分=${m.homeScore}-${m.awayScore} | 角球=${m.totalCorners} | O/U=${JSON.stringify(m.cornerOU)} | HDP=${JSON.stringify(m.cornerHDP)}`)
    );
  }

  return deduped;
}

// ======================== 合并比赛列表与角球盘口 ========================
function mergeMatchWithCornerOdds(matches, cornerOdds) {
  if (!cornerOdds || cornerOdds.length === 0) return matches;

  const normalized = (name) => (name || "").toLowerCase().replace(/[^a-z0-9]/g, "");

  const cornerMap = new Map();
  for (const co of cornerOdds) {
    const key = normalized(co.homeTeam) + "|" + normalized(co.awayTeam);
    cornerMap.set(key, co);
  }

  for (const match of matches) {
    const key = normalized(match.homeTeam) + "|" + normalized(match.awayTeam);
    let co = cornerMap.get(key);

    // 精确匹配失败时，尝试模糊匹配（球队名包含关系）
    if (!co) {
      const matchHome = normalized(match.homeTeam);
      const matchAway = normalized(match.awayTeam);
      for (const [ckey, cval] of cornerMap) {
        const [chome, caway] = ckey.split("|");
        if ((matchHome.includes(chome) || chome.includes(matchHome)) &&
            (matchAway.includes(caway) || caway.includes(matchAway))) {
          co = cval;
          break;
        }
      }
    }

    if (co) {
      // 使用 handicaps 数组替代旧的单独字段
      match.handicaps = co.handicaps || match.handicaps || [];
      match.totalCorners = co.totalCorners || match.totalCorners;
      if (co.elapsedMinutes) match.elapsedMinutes = co.elapsedMinutes;
      if (co.time) match.time = co.time;
      if (co.homeScore || co.awayScore) { match.homeScore = co.homeScore; match.awayScore = co.awayScore; }
    }
  }

  console.log("[HgCrawler] 合并后 " + matches.length + " 场比赛 (含角球盘口)");
  return matches;
}

// ======================== 获取比赛（含角球盘口） ========================
// ======================== 页面状态管理 ========================
/**
 * 确保页面就绪：验证 mainPage 存活，必要时重新登录
 */
async function ensurePageReady() {
  if (!mainPage) {
    console.log("[HgCrawler] mainPage 为空，重新登录...");
    const result = await loginToHG();
    if (!result.success) return false;
  }

  try {
    const url = mainPage.url();
    console.log("[HgCrawler] 页面就绪，当前 URL: " + (url || "(unknown)").substring(0, 120));

    // 等待动态内容渲染（SPA 页面需要 JS 渲染 DOM）
    console.log("[HgCrawler] 等待页面动态内容渲染...");
    await new Promise(r => setTimeout(r, 5000));
    try {
      await mainPage.waitForFunction(() => {
        const body = document.body;
        if (!body) return false;
        const text = body.textContent || "";
        return text.includes("In-Play") || text.includes("IN-PLAY") || text.length > 2000;
      }, { timeout: 10000 });
      console.log("[HgCrawler] 动态内容已渲染");
    } catch (e) {
      console.log("[HgCrawler] 动态内容等待超时，继续执行: " + e.message);
    }

    return true;
  } catch (err) {
    console.log("[HgCrawler] mainPage 已失效 (" + err.message + ")，重新登录...");
    mainPage = null;
    const result = await loginToHG();
    if (!result.success) return false;
    console.log("[HgCrawler] 重新登录后页面就绪");
    return true;
  }
}

export async function fetchAllLiveMatches() {
  console.log("[HgCrawler] === 获取比赛数据 (In-Play → Soccer → CORNERS) ===");

  if (!(await ensurePageReady())) {
    return { success: false, error: "无法连接到浏览器页面" };
  }

  try {
    // Step 1: 导航到 In-Play
    await navigateToInPlay(mainPage);

    // Step 2: 点击 足球 标签（桌面版 #symbol_ft）
    console.log("[HgCrawler] 点击 足球 标签 via #symbol_ft...");
    let soccerClicked = await mainPage.evaluate(() => {
      const btn = document.getElementById('symbol_ft');
      if (!btn) return false;
      if (btn.classList.contains('on')) return true;
      btn.scrollIntoView({block:'center'});
      btn.click();
      return true;
    });
    if (!soccerClicked) {
      console.log("[HgCrawler] #symbol_ft 未找到，尝试文本匹配...");
      if (await clickTab(mainPage, "足球")) { soccerClicked = true; }
    }
    console.log("[HgCrawler] 足球标签点击结果: " + (soccerClicked ? "成功" : "失败，跳过"));
    await new Promise(r => setTimeout(r, 4000));

    // 滚动触发懒加载
    try {
      await mainPage.evaluate(() => { window.scrollTo(0, document.body.scrollHeight); });
      await new Promise(r => setTimeout(r, 2000));
      await mainPage.evaluate(() => { window.scrollTo(0, 0); });
      await new Promise(r => setTimeout(r, 2000));
    } catch (e) {}

    // Step 3: 解析 Soccer 页面比赛列表
    let matches = await parseSoccerMatches(mainPage);

    // Step 4: 点击 CORNERS 标签
    console.log("[HgCrawler] 点击 CORNERS 标签...");
    await clickTab(mainPage, "角球");
    await new Promise(r => setTimeout(r, 4000));

    // 滚动触发懒加载
    try {
      await mainPage.evaluate(() => {
        window.scrollTo(0, document.body.scrollHeight);
        setTimeout(() => window.scrollTo(0, 0), 1000);
      });
      await new Promise(r => setTimeout(r, 3000));
    } catch (e) {}

    // Step 5: 解析角球盘口
    const cornerOdds = await parseAllMarkets(mainPage);

    // Step 6: 使用 parseAllMarkets 结果构建比赛列表（含全部 8 种盘口）
    if (matches.length === 0 && cornerOdds.length > 0) {
      console.log("[HgCrawler] Soccer页解析无结果，使用 CORNERS 数据");
      matches = cornerOdds.map((co, idx) => ({
        league: co.league || "",
        homeTeam: co.homeTeam,
        awayTeam: co.awayTeam,
        time: co.time || "--:--",
        homeScore: co.homeScore || 0,
        awayScore: co.awayScore || 0,
        elapsedMinutes: co.elapsedMinutes || 0,
        totalCorners: co.totalCorners || 0,
        handicaps: co.handicaps || [],
        matchName: (co.homeTeam || "") + " vs " + (co.awayTeam || ""),
        matchId: "corner_" + idx + "_" + Date.now(),
        timestamp: Date.now()
      }));
    } else {
      matches = mergeMatchWithCornerOdds(matches, cornerOdds);
    }

    crawlerStatus.lastUpdate = Date.now();
    crawlerStatus.matchesCount = matches.length;
    crawlerStatus.error = null;

    console.log("[HgCrawler] === 完成: " + matches.length + " 场比赛 (含角球盘口) ===");
    if (matches.length > 0) {
      console.log("[HgCrawler] 样例: " + JSON.stringify(matches[0], null, 2).substring(0, 500));
    }

    return {
      success: true,
      data: { matches, allText: [], allElements: [] },
      count: matches.length
    };
  } catch (err) {
    console.error("[HgCrawler] 获取比赛数据失败:", err.message);
    crawlerStatus.error = err.message;
    try {
      const loginResult = await loginToHG();
      if (loginResult.success) return await fetchAllLiveMatches();
    } catch (e) {}
    return { success: false, error: err.message };
  }
}

// ======================== 获取赛程（Today → CORNERS） ========================
// ======================== 获取赛程（Today → CORNERS） ========================
export async function fetchSchedule(_retryCount = 0) {
  console.log("[HgCrawler] === 获取赛程 (Today → CORNERS) ===");

  // 使用隔离浏览器，不影响监控的共享浏览器
  let privateBrowser = null;
  let page = null;

  try {
    const loginRes = await loginToHG(null, false, true); // isolated mode
    if (!loginRes.success || !loginRes.page) {
      return { success: false, error: loginRes.error || "隔离登录失败" };
    }
    page = loginRes.page;
    privateBrowser = loginRes.browser;
    console.log("[HgCrawler] 隔离浏览器就绪");

    // 等待页面动态内容渲染（SPA 需要 JS 渲染 DOM）
    console.log("[HgCrawler] 等待页面动态内容渲染...");
    await new Promise(r => setTimeout(r, 5000));
    try {
      await page.waitForFunction(() => {
        const body = document.body;
        if (!body) return false;
        const text = body.textContent || "";
        return text.includes("In-Play") || text.includes("IN-PLAY") || text.length > 2000;
      }, { timeout: 10000 });
      console.log("[HgCrawler] 动态内容已渲染");
    } catch (e) {
      console.log("[HgCrawler] 动态内容等待超时，继续执行: " + e.message);
    }
    await new Promise(r => setTimeout(r, 3000));


    // 切换到 Today 视图（仅切换上下文，不提取数据）
    console.log("[HgCrawler] 点击 Today 标签...");
    let todayClicked = await page.evaluate(() => {
      const tab = document.getElementById("today_page");
      if (tab) { tab.click(); return true; }
      return false;
    });
    if (!todayClicked) await clickTab(page, "今日");
    // 等待 Today 页面完全渲染（tab_cn 出现 + 网络空闲 + 缓冲）
    try {
      await page.waitForFunction(() => {
        return document.getElementById('tab_cn') !== null;
      }, { timeout: 15000 });
      console.log("[HgCrawler] tab_cn 已出现，等待网络空闲...");
      await page.waitForNetworkIdle({ timeout: 15000, idleTime: 2000 });
      console.log("[HgCrawler] Today 页面完全渲染（含 network idle）");
    } catch (e) {
      console.log("[HgCrawler] Today 页面等待超时，继续尝试点击 CORNERS");
    }
    await new Promise(r => setTimeout(r, 3000));

    // ========== 阶段二：提取 CORNERS 盘口 ==========
    console.log("[HgCrawler] 点击 CORNERS 标签...");
    let cornerClicked = await page.evaluate(() => {
      const tab = document.getElementById('tab_cn');
      if (tab) { tab.scrollIntoView({block:'center'}); tab.click(); return true; }
      return false;
    });
    if (cornerClicked) {
      console.log("[HgCrawler] CORNERS tab clicked via id");
      await new Promise(r => setTimeout(r, 2000));
    } else {
      await clickTab(page, "角球");
    }

    // 智能等待：等待实际盘口数据渲染完成
    console.log("[HgCrawler] 等待 CORNERS 盘口数据渲染...");
    let oddsReady = false;
    try {
      oddsReady = await page.waitForFunction(() => {
        const oddsEls = document.querySelectorAll('div.box_lebet_odd');
        if (oddsEls.length === 0) return false;
        for (const od of oddsEls) {
          const oddsText = od.textContent || '';
          if (oddsText.includes('*')) continue;
          const oddsSpan = od.querySelector('span.text_odds');
          if (oddsSpan) {
            const val = parseFloat(oddsSpan.textContent || '0');
            if (val > 0 && val < 100) return true;
          }
        }
        return false;
      }, { timeout: 25000 });
      console.log("[HgCrawler] CORNERS 盘口数据已加载" + (oddsReady ? "" : " (超时)"));
    } catch (e) {
      console.log("[HgCrawler] CORNERS 盘口等待超时: " + e.message);
    }
    if (!oddsReady) await new Promise(r => setTimeout(r, 5000));
    await new Promise(r => setTimeout(r, 5000));

    // 滚动触发懒加载
    try {
      await page.evaluate(() => { window.scrollTo(0, document.body.scrollHeight); setTimeout(() => window.scrollTo(0, 0), 1000); });
      await new Promise(r => setTimeout(r, 3000));
    } catch (e) {}

    try { await page.screenshot({ path: "debug/schedule-corners.png", fullPage: true }); console.log("[HgCrawler] 截图: debug/schedule-corners.png"); } catch (e) {}

    // 解析 CORNERS 盘口（优先 parseAllMarkets，回退到 parseCornerOdds）
    let cornerOdds = await parseAllMarkets(page);
    if (cornerOdds.length === 0) {
      console.log("[HgCrawler] parseAllMarkets 无结果，尝试 parseCornerOdds 直接解析...");
      cornerOdds = await parseCornerOdds(page);
    }
    console.log("[HgCrawler] CORNERS 盘口: " + cornerOdds.length + " 条");

    // 数据为空时检测是否强制登出（仅可见弹窗触发，防误判隐藏DOM模板）
    if (cornerOdds.length === 0 && _retryCount < 2) {
      try {
        const kicked = await page.evaluate(() => {
          const btn = document.getElementById('kick_ok_btn');
          if (!btn || btn.offsetParent === null) return false;
          const style = window.getComputedStyle(btn);
          if (style.display === 'none' || style.visibility === 'hidden') return false;
          btn.click(); return true;
        });
        if (kicked) {
          console.log("[HgCrawler] 检测到强制登出，点击 OK 并重新登录...");
          await new Promise(r => setTimeout(r, 3000));
          const loginRes2 = await loginToHG(null, true, true);
          if (loginRes2.success && loginRes2.page) {
            try { await privateBrowser.close(); } catch(e) {}
            page = loginRes2.page;
            privateBrowser = loginRes2.browser;
            console.log("[HgCrawler] 重新登录成功，重试获取赛程 (retry " + (_retryCount + 1) + "/2)");
            return await fetchSchedule(_retryCount + 1);
          }
          console.log("[HgCrawler] 重新登录失败，返回空结果");
        }
      } catch (kickErr) {
        console.log("[HgCrawler] 登出检测异常: " + kickErr.message);
      }
    }

    // ========== 阶段三：直接用 CORNERS 数据构建赛程 ==========
    const scheduleData = cornerOdds.map((co, idx) => {
      const handicaps = co.handicaps || [];
      const hdpEntry = handicaps.find(h => h.category === "HDP" && h.period === "full");
      const ouEntry = handicaps.find(h => h.category === "O/U" && h.period === "full");
      return {
        id: "sched_" + idx,
        league: co.league || "",
        homeTeam: co.homeTeam,
        awayTeam: co.awayTeam,
        time: co.time || "--:--",
        date: new Date().toLocaleDateString(),
        homeScore: co.homeScore || 0,
        awayScore: co.awayScore || 0,
        handicaps,
        cornerHandicap: hdpEntry ? parseAsianHandicap(hdpEntry.line) : 0,
        cornerOdds: hdpEntry?.odds?.home || ouEntry?.odds?.over || 0,
        hasCornerOdds: handicaps.length > 0
      };
    });

    crawlerStatus.lastUpdate = Date.now();
    crawlerStatus.matchesCount = scheduleData.length;

    console.log("[HgCrawler] === 赛程完成: " + scheduleData.length + " 场 ===");
    if (scheduleData.length > 0) {
      scheduleData.slice(0, 5).forEach((m, i) =>
        console.log("  [" + i + "] " + m.league + " | " + m.homeTeam + " vs " + m.awayTeam + " | HDP=" + m.cornerHandicap + " odds=" + m.cornerOdds + " hdpCount=" + m.handicaps.length)
      );
    }

    // 等待页面稳定后再导航回主页
    await new Promise(r => setTimeout(r, 3000));
    try {
      await page.evaluate(() => {
        const homeBtn = document.getElementById('home_page');
        if (homeBtn) { homeBtn.click(); return true; }
        return false;
      });
      await new Promise(r => setTimeout(r, 1500));
      console.log("[HgCrawler] 已点击 #home_page 回到主页");
    } catch (e) {
      console.warn("[HgCrawler] 主页导航失败:", e.message);
    }

    return {
      success: true,
      data: { matches: scheduleData },
      count: scheduleData.length
    };
  } catch (err) {
    console.error("[HgCrawler] 获取赛程失败:", err.message);
    crawlerStatus.error = err.message;
    return { success: false, error: err.message };
  } finally {
    // 关闭隔离浏览器
    if (privateBrowser) {
      try {
        await privateBrowser.close();
        console.log("[HgCrawler] 已关闭隔离浏览器");
      } catch (e) {
        console.warn("[HgCrawler] 关闭隔离浏览器失败:", e.message);
      }
    }
  }
}
export function startMatchPolling(onUpdate) {
  if (pollingActive) {
    console.log("[HgCrawler] 轮询已在运行中");
    return { success: true, message: "already polling" };
  }
  console.log("[HgCrawler] 启动比赛轮询 (10s间隔)...");
  pollingActive = true;
  pollingCallback = onUpdate;

  const poll = async () => {
    if (!pollingActive) return;
    try {
      const result = await fetchAllLiveMatches();
      if (pollingActive && pollingCallback) {
        pollingCallback(result);
      }
    } catch (e) {
      console.error("[HgCrawler] 轮询错误:", e.message);
    }
    if (pollingActive) {
      pollingTimer = setTimeout(poll, 10000);
    }
  };
  poll();
  return { success: true };
}

export function stopMatchPolling() {
  if (!pollingActive) return { success: true, message: 'not polling' };
  console.log("[HgCrawler] 停止比赛轮询");
  pollingActive = false;
  if (pollingTimer) { clearTimeout(pollingTimer); pollingTimer = null; }
  pollingCallback = null;
  return { success: true };
}

export function getPollingStatus() {
  return {
    isPolling: pollingActive,
    isLoggedIn: crawlerStatus.isLoggedIn,
    lastUpdate: crawlerStatus.lastUpdate,
    matchesCount: crawlerStatus.matchesCount
  };
}

// ======================== 关闭 ========================
export async function closeBrowser() {
  stopMatchPolling();
  const result = await closeShared();
  mainPage = null;
  crawlerStatus.isLoggedIn = false;
  crawlerStatus.lastUpdate = null;
  crawlerStatus.matchesCount = 0;
  return result;
}