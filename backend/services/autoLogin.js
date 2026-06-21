// ======================== 自动登录模块 ========================
// 在凭证缺失或过期时，通过 Puppeteer 浏览器自动登录获取新凭证
// 登录完成后关闭浏览器，返回凭证给 credentialManager

import puppeteer from "puppeteer-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";
import { HG_URL, setUid, saveCookiesToDisk, loadCookiesFromDisk, detectLocalBrowser } from "./browserPool.js";
import { extractVerFromRequest } from "./transformSigner.js";
import { updateCredentials, invalidateCookieCache } from "./credentialManager.js";
import os from "os";
import path from "path";

puppeteer.use(StealthPlugin());

const AUTO_LOGIN_TIMEOUT = 60000; // 60秒超时

// ======================== 登录状态枚举 ========================
const LoginState = {
  LOGIN_PAGE: 'LOGIN_PAGE',           // 在登录页面
  FILL_CREDENTIALS: 'FILL_CREDENTIALS', // 填写凭据中
  WAIT_RESPONSE: 'WAIT_RESPONSE',     // 等待服务器响应
  PASSCODE_PAGE: 'PASSCODE_PAGE',     // 简易密码设置页面 (#back_login 可见)
  PASSCODE_DIALOG: 'PASSCODE_DIALOG', // 简易密码确认弹窗
  KICKED_OUT: 'KICKED_OUT',           // 被踢出弹窗
  LOGGED_IN: 'LOGGED_IN',             // 登录成功
  FAILED: 'FAILED',                   // 失败
};

// ======================== 辅助函数 ========================

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

/**
 * 检测当前页面状态，返回 { state, detail }
 * 优先级：PASSCODE_PAGE > KICKED_OUT > PASSCODE_DIALOG > LOGGED_IN > LOGIN_PAGE > WAIT_RESPONSE
 */
async function detectPageState(page) {
  try {
    // 遍历所有 frame（包括主 frame 和 iframe）
    for (const frame of page.frames()) {
      try {
        const result = await frame.evaluate(() => {
          // 辅助：判断元素是否可见
          function isVisible(el) {
            if (!el) return false;
            const style = getComputedStyle(el);
            return style.display !== 'none' && style.visibility !== 'hidden';
          }

          // 1. 检测简易密码设置页面
          var backLoginBtn = document.getElementById('back_login');
          if (isVisible(backLoginBtn)) {
            return { state: 'PASSCODE_PAGE', detail: '简易密码设置页面' };
          }

          // 2. 检测被踢出弹窗
          var alertKick = document.getElementById('alert_kick');
          if (alertKick && alertKick.classList.contains('on')) {
            return { state: 'KICKED_OUT', detail: '被踢出弹窗' };
          }

          // 3. 检测激活弹窗
          var popupIds = ['C_alert_confirm', 'alert_confirm', 'alert_show'];
          for (var i = 0; i < popupIds.length; i++) {
            var popupEl = document.getElementById(popupIds[i]);
            if (popupEl && popupEl.classList.contains('on')) {
              return { state: 'PASSCODE_DIALOG', detail: '弹窗激活: ' + popupIds[i] };
            }
          }

          // 4. 检测主页特征（已登录）
          var bodyText = document.body.textContent || '';
          var hasSuccess = (bodyText.includes("My Events") || bodyText.includes("My Bets")) ||
                           (bodyText.includes("In-Play") && bodyText.includes("Soccer")) ||
                           (bodyText.includes("Balance") || bodyText.includes("余额") ||
                            bodyText.includes("Credit") || bodyText.includes("额度"));
          if (!hasSuccess) {
            var nav = document.getElementById("today_page") || document.getElementById("live_page");
            if (isVisible(nav)) hasSuccess = true;
          }
          if (!hasSuccess) {
            var symbol = document.getElementById("symbol_ft");
            if (isVisible(symbol)) hasSuccess = true;
          }
          // 额外检测：loginuser cookie 存在说明已登录
          if (!hasSuccess && document.cookie.includes('loginuser=')) {
            hasSuccess = true;
          }
          if (hasSuccess) {
            return { state: 'LOGGED_IN', detail: '已登录 (frame: ' + (window.frameElement ? 'iframe' : 'main') + ')' };
          }

          // 5. 检测登录页面
          var usrInput = document.getElementById('usr');
          if (isVisible(usrInput)) {
            return { state: 'LOGIN_PAGE', detail: '登录页面 (frame: ' + (window.frameElement ? 'iframe' : 'main') + ')' };
          }

          return null; // 此 frame 无有效状态
        });

        if (result && result.state) return result;
      } catch (_) {}
    }

    return { state: LoginState.WAIT_RESPONSE, detail: '等待响应' };
  } catch (e) {
    return { state: LoginState.WAIT_RESPONSE, detail: '检测异常: ' + e.message };
  }
}

/**
 * 处理简易密码设置页面：点击"普通登入"按钮，回到登录页
 */
async function handlePasscodePage(page, options) {
  console.log("[autoLogin] 检测到简易密码设置页面，点击\"普通登入\"按钮...");
  try {
    await page.evaluate(() => {
      const btn = document.querySelector("#back_login");
      if (btn) btn.click();
    });
    await sleep(1500);
    console.log("[autoLogin] 已点击\"普通登入\"，等待页面跳转回登录页");
  } catch (e) {
    console.warn("[autoLogin] 点击\"普通登入\"失败:", e.message);
  }
  return { action: 'retry_login' };
}

/**
 * 处理简易密码确认弹窗：点击"否/NO"关闭弹窗
 */
async function handlePasscodeDialog(page) {
  console.log("[autoLogin] 检测到简易密码确认弹窗，正在关闭...");
  let cleaned = false;
  try {
    // 方法1：通过 page.evaluate 在页面内直接点击（绕过 Puppeteer 元素可见性检查）
    const clicked = await page.evaluate(() => {
      // 尝试多种按钮：NO/否/取消/CANCEL/OK/确认
      const cancelSelectors = [
        ".btn_cancel", "#C_no_btn", "#no_btn", "#C_cancel_btn",
        "[class*='popup'] [class*='close']",
      ];
      const cancelTexts = ["NO", "否", "No", "no", "CANCEL", "取消"];

      // 1. 通过选择器找取消按钮
      for (const sel of cancelSelectors) {
        const el = document.querySelector(sel);
        if (el) {
          const style = getComputedStyle(el);
          if (style.display !== 'none' && style.visibility !== 'hidden') {
            try { (el).click(); return true; } catch(_) {}
          }
        }
      }
      // 2. 通过文本找按钮
      const allButtons = Array.from(document.querySelectorAll("button, a, div[role='button'], .btn"));
      for (const btn of allButtons) {
        const text = (btn.textContent || "").trim().toUpperCase();
        if (cancelTexts.includes(text)) {
          const style = getComputedStyle(btn);
          if (style.display !== 'none' && style.visibility !== 'hidden') {
            try { (btn).click(); return true; } catch(_) {}
          }
        }
      }
      // 3. 通过 OK/确认 按钮（有些弹窗只有一个确认按钮）
      const okSelectors = [".btn_confirm", ".btn_submit", "#C_ok_btn", "#ok_btn"];
      for (const sel of okSelectors) {
        const el = document.querySelector(sel);
        if (el) {
          const style = getComputedStyle(el);
          if (style.display !== 'none' && style.visibility !== 'hidden') {
            try { (el).click(); return true; } catch(_) {}
          }
        }
      }
      return false;
    });

    if (clicked) {
      console.log("[autoLogin] 已通过页面内点击关闭弹窗");
      await sleep(500);
      cleaned = true;
    }

    // 方法2：强制清理兜底 — 直接移除弹窗容器的 .on 类
    const forceCleaned = await page.evaluate(() => {
      const dialogIds = ["C_alert_confirm", "alert_confirm", "alert_show", "C_alert_ok", "alert_ok", "alert_kick", "system_popup", "msg_popup"];
      let result = false;
      for (const id of dialogIds) {
        const el = document.getElementById(id);
        if (el && el.classList.contains("on")) {
          el.classList.remove("on");
          result = true;
        }
      }
      // 解锁 body
      if (document.body) {
        document.body.classList.remove("scroll_lock", "locked");
        document.body.style.overflow = "";
      }
      return result;
    });

    if (forceCleaned) {
      console.log("[autoLogin] 已强制清理弹窗（移除 .on 类）");
      cleaned = true;
    }

    // 方法3：ESC 键兜底
    try { await page.keyboard.press('Escape'); } catch(_) {}
    await sleep(400);

  } catch (e) {
    console.warn("[autoLogin] 关闭简易密码弹窗异常:", e.message);
    // 异常时仍执行强制清理
    try {
      await page.evaluate(() => {
        const dialogIds = ["C_alert_confirm", "alert_confirm", "alert_show", "C_alert_ok", "alert_ok", "alert_kick", "system_popup"];
        for (const id of dialogIds) {
          const el = document.getElementById(id);
          if (el && el.classList.contains("on")) el.classList.remove("on");
        }
        if (document.body) {
          document.body.classList.remove("scroll_lock", "locked");
          document.body.style.overflow = "";
        }
      });
      cleaned = true;
    } catch(_) {}
  }

  if (cleaned) return { action: 'wait' };
  return { action: 'wait' };
}

/**
 * 处理被踢出弹窗：点击确认后重新登录
 */
async function handleKickedOut(page) {
  console.log("[autoLogin] 检测到被踢出弹窗，点击确认并清理...");
  try {
    // 1. 点击确认按钮
    await page.evaluate(() => {
      const btn = document.querySelector("#kick_ok_btn");
      if (btn) btn.click();
    });
    await sleep(3000);

    // 2. 强制移除弹窗容器的 .on 类（确保弹窗关闭）
    await page.evaluate(() => {
      const dialogIds = ["alert_kick", "C_alert_confirm", "alert_confirm", "C_alert_ok", "alert_ok", "system_popup"];
      for (const id of dialogIds) {
        const el = document.getElementById(id);
        if (el && el.classList.contains("on")) {
          el.classList.remove("on");
        }
      }
      // 移除 body 锁定类
      if (document.body) {
        document.body.classList.remove("scroll_lock", "locked");
        document.body.style.overflow = "";
      }
    });
    console.log("[autoLogin] 已点击确认并强制清理弹窗");

    // 3. 清除页面 Cookie 避免重复会话
    const client = await page.target().createCDPSession();
    await client.send("Network.clearBrowserCookies");
    console.log("[autoLogin] 已清除浏览器 Cookie");

    // 4. 重新导航到登录页
    await page.goto(HG_URL, { waitUntil: "domcontentloaded", timeout: 30000 });
    await sleep(2000);
    console.log("[autoLogin] 已重新导航到登录页");
  } catch (e) {
    console.warn("[autoLogin] 处理被踢出弹窗异常:", e.message);
    // 即使异常也尝试重新导航
    try {
      await page.goto(HG_URL, { waitUntil: "domcontentloaded", timeout: 30000 });
      await sleep(2000);
    } catch (e2) {
      console.warn("[autoLogin] 重新导航也失败:", e2.message);
    }
  }
  return { action: 'retry_login' };
}

/**
 * 填写凭据并点击登录
 */
async function fillCredentials(page, options) {
  console.log("[autoLogin] 填写凭据...");
  const username = options.username || "";
  const password = options.password || "";

  // HG 网站登录表单可能在 iframe 中，需要遍历所有 frame
  let targetFrame = page.mainFrame();
  for (const frame of page.frames()) {
    try {
      const hasUsr = await frame.$("#usr, input[name='username']");
      if (hasUsr) {
        targetFrame = frame;
        console.log("[autoLogin] 在 " + (frame === page.mainFrame() ? "主frame" : "iframe") + " 中找到登录表单");
        break;
      }
    } catch (_) {}
  }

  // 使用 evaluate 方式填写凭据（避免 Puppeteer click 不可点击问题）
  try {
    await targetFrame.evaluate((user, pass) => {
      const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype, "value"
      ).set;

      const usrInput = document.querySelector("#usr, input[name='username'], input[type='text']");
      if (usrInput) {
        usrInput.focus();
        nativeInputValueSetter.call(usrInput, user);
        usrInput.dispatchEvent(new Event("input", { bubbles: true }));
        usrInput.dispatchEvent(new Event("change", { bubbles: true }));
      }

      const pwdInput = document.querySelector("#pwd, input[name='password'], input[type='password']");
      if (pwdInput) {
        pwdInput.focus();
        nativeInputValueSetter.call(pwdInput, pass);
        pwdInput.dispatchEvent(new Event("input", { bubbles: true }));
        pwdInput.dispatchEvent(new Event("change", { bubbles: true }));
      }
    }, username, password);
    console.log("[autoLogin] 已通过 evaluate 填写凭据");
  } catch (e) {
    console.log("[autoLogin] evaluate 填写失败，回退到 type 方式...");
    // 回退：使用 Puppeteer type 方法
    try {
      const usernameInput = await targetFrame.$("#usr, input[name='username'], input[type='text']");
      if (usernameInput) {
        await usernameInput.evaluate(el => el.focus());
        await usernameInput.type(username, { delay: 50 });
      }
      const passwordInput = await targetFrame.$("#pwd, input[name='password'], input[type='password']");
      if (passwordInput) {
        await passwordInput.evaluate(el => el.focus());
        await passwordInput.type(password, { delay: 50 });
      }
    } catch (e2) {
      console.log("[autoLogin] type 方式也失败:", e2.message);
    }
  }

  // 点击登录按钮
  const btnSelectors = ["#btn_login", "input[type='submit']", "button[type='submit']", "input[type='button']"];
  let btnClicked = false;
  for (const sel of btnSelectors) {
    try {
      const btn = await targetFrame.$(sel);
      if (btn) {
        const box = await btn.boundingBox();
        if (box && box.width > 0 && box.height > 0) {
          try {
            await btn.click();
            btnClicked = true;
            console.log("[autoLogin] 已点击登录按钮 (" + sel + ")");
            break;
          } catch (clickErr) {
            // Puppeteer click 失败，尝试 JS evaluate 点击
            console.log("[autoLogin] Puppeteer click 失败，尝试 JS 点击...");
            await targetFrame.evaluate((selector) => {
              const el = document.querySelector(selector);
              if (el) el.click();
            }, sel);
            btnClicked = true;
            console.log("[autoLogin] 已通过 JS 点击登录按钮 (" + sel + ")");
            break;
          }
        }
      }
    } catch (e) {}
  }

  // 如果所有选择器都失败，尝试通过 evaluate 查找并点击
  if (!btnClicked) {
    try {
      await targetFrame.evaluate(() => {
        const btns = document.querySelectorAll("input[type='submit'], button[type='submit'], input[type='button']");
        for (const btn of btns) {
          const rect = btn.getBoundingClientRect();
          if (rect.width > 0 && rect.height > 0) {
            btn.click();
            return;
          }
        }
      });
      console.log("[autoLogin] 已通过 evaluate 点击登录按钮");
    } catch (e) {}
  }

  await sleep(1500);
}

/**
 * 自动登录并获取凭证
 * @param {Object} options
 * @param {string} options.username - 用户名
 * @param {string} options.password - 密码
 * @param {string} options.passcode - 安全码（可选）
 * @returns {Promise<{ success: boolean, uid?: string, ver?: string, cookieStr?: string, error?: string }>}
 */
export async function autoLoginAndGetCredentials(options = {}) {
  console.log("[autoLogin] 启动自动登录...");
  const startTime = Date.now();

  let browser = null;
  let page = null;
  let browserRef = null; // 共享引用，确保超时时也能关闭浏览器

  try {
    // 超时保护
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error("自动登录超时 (" + AUTO_LOGIN_TIMEOUT + "ms)")), AUTO_LOGIN_TIMEOUT);
    });

    const loginPromise = async () => {
      // 1. 启动浏览器
      const launchArgs = [
        "--ignore-certificate-errors",
        "--no-sandbox",
        "--disable-setuid-sandbox",
      ];
      // 代理自动探测：环境变量 → 本地端口探测
      if (process.env.PUPPETEER_PROXY) {
        launchArgs.push("--proxy-server=" + process.env.PUPPETEER_PROXY);
        launchArgs.push("--host-resolver-rules=MAP * ~NOTFOUND , EXCLUDE localhost");
      } else {
        try {
          const { detectProxyConfig } = await import("./hgApiClient.js");
          const proxyConfig = await detectProxyConfig();
          if (proxyConfig) {
            const proxyUrl = `${proxyConfig.protocol || 'http'}://${proxyConfig.host}:${proxyConfig.port}`;
            console.log('[autoLogin] 自动探测到代理: ' + proxyUrl);
            launchArgs.push("--proxy-server=" + proxyUrl);
            launchArgs.push("--host-resolver-rules=MAP * ~NOTFOUND , EXCLUDE localhost");
          }
        } catch (e) {
          // hgApiClient 不可用时忽略
        }
      }

      const detectedPath = detectLocalBrowser();
      if (!detectedPath) {
        return { success: false, error: '系统未安装 Chrome 或 Edge，请安装任意一款浏览器再启用角球监控' };
      }
      browser = await puppeteer.launch({
        headless: 'new',
        executablePath: detectedPath,
        userDataDir: path.join(os.tmpdir(), 'puppeteer_profile'),
        args: launchArgs,
      });
      browserRef = browser; // 保存引用，超时时可关闭
      page = await browser.newPage();
      console.log("[autoLogin] 浏览器已启动");

      // 2. 设置 uid/ver 拦截
      let capturedUid = null;
      let capturedVer = null;
      let apiDomain = null;

      page.on("response", async (response) => {
        const url = response.url();
        try {
          // 拦截 transform.php 请求提取 ver
          if (url.includes("transform.php") && url.includes("ver=")) {
            extractVerFromRequest(url);
            const verMatch = url.match(/[?&]ver=([^&]+)/);
            if (verMatch && verMatch[1]) {
              capturedVer = verMatch[1];
              console.log("[autoLogin] 从 transform.php 捕获 ver: " + capturedVer.substring(0, 16) + "...");
            }
          }
        } catch (e) {
          // 忽略响应体读取错误
        }
      });

      // 3. 清除浏览器 Cookie 和缓存（避免旧会话冲突导致被踢出）
      try {
        const client = await page.target().createCDPSession();
        await client.send("Network.clearBrowserCookies");
        await client.send("Network.clearBrowserCache");
        console.log("[autoLogin] 已清除浏览器 Cookie 和缓存");
      } catch (e) {
        console.warn("[autoLogin] 清除 Cookie/缓存失败:", e.message);
      }

      // 4. 导航到登录页
      console.log("[autoLogin] 导航到 " + HG_URL);
      await page.goto(HG_URL, { waitUntil: "domcontentloaded", timeout: 30000 });
      await sleep(1000);

      // ======================== 状态机循环 ========================
      let state = LoginState.LOGIN_PAGE;
      const popupCount = { passcodePage: 0, passcodeDialog: 0, kickedOut: 0, loginAttempts: 0 };
      const MAX_POPUP_COUNT = 5;
      const MAX_LOGIN_ATTEMPTS = 3;

      while (Date.now() - startTime < AUTO_LOGIN_TIMEOUT) {
        const pageState = await detectPageState(page);
        console.log("[autoLogin] 状态机检测: state=" + pageState.state + " (" + pageState.detail + "), 内部状态=" + state);

        switch (pageState.state) {
          case LoginState.PASSCODE_PAGE: {
            popupCount.passcodePage++;
            if (popupCount.passcodePage > MAX_POPUP_COUNT) {
              console.error("[autoLogin] 简易密码设置页面出现超过 " + MAX_POPUP_COUNT + " 次，登录失败");
              return { success: false, error: "简易密码设置页面循环超过" + MAX_POPUP_COUNT + "次" };
            }
            const result = await handlePasscodePage(page, options);
            if (result.action === 'retry_login') {
              state = LoginState.FILL_CREDENTIALS;
            }
            break;
          }

          case LoginState.PASSCODE_DIALOG: {
            popupCount.passcodeDialog++;
            if (popupCount.passcodeDialog > MAX_POPUP_COUNT) {
              console.error("[autoLogin] 简易密码确认弹窗出现超过 " + MAX_POPUP_COUNT + " 次，登录失败");
              return { success: false, error: "简易密码确认弹窗循环超过" + MAX_POPUP_COUNT + "次" };
            }
            await handlePasscodeDialog(page);
            // 弹窗关闭后等待更久，让页面完成跳转
            await sleep(5000);
            // 检查是否已登录（弹窗关闭可能意味着登录成功）
            const afterPopupState = await detectPageState(page);
            console.log("[autoLogin] 弹窗关闭后状态: " + afterPopupState.state + " (" + afterPopupState.detail + ")");
            if (afterPopupState.state === LoginState.LOGGED_IN) {
              console.log("[autoLogin] 弹窗关闭后检测到已登录！");
              state = LoginState.LOGGED_IN;
              break;
            }
            // 如果仍然检测到 LOGIN_PAGE，可能实际已登录但 iframe 还没加载完
            // 尝试直接导航到主页看是否已登录
            if (afterPopupState.state === LoginState.LOGIN_PAGE) {
              console.log("[autoLogin] 弹窗关闭后仍为 LOGIN_PAGE，尝试刷新页面...");
              await page.reload({ waitUntil: 'networkidle2', timeout: 15000 }).catch(() => {});
              await sleep(3000);
              const reloadedState = await detectPageState(page);
              console.log("[autoLogin] 刷新后状态: " + reloadedState.state + " (" + reloadedState.detail + ")");
              if (reloadedState.state === LoginState.LOGGED_IN) {
                state = LoginState.LOGGED_IN;
                break;
              }
            }
            break;
          }

          case LoginState.KICKED_OUT: {
            popupCount.kickedOut++;
            if (popupCount.kickedOut > MAX_POPUP_COUNT) {
              console.error("[autoLogin] 被踢出弹窗出现超过 " + MAX_POPUP_COUNT + " 次，登录失败");
              return { success: false, error: "被踢出弹窗循环超过" + MAX_POPUP_COUNT + "次" };
            }
            const result = await handleKickedOut(page);
            if (result.action === 'retry_login') {
              state = LoginState.FILL_CREDENTIALS;
            }
            break;
          }

          case LoginState.LOGIN_PAGE: {
            if (popupCount.loginAttempts >= MAX_LOGIN_ATTEMPTS) {
              console.error("[autoLogin] 登录尝试超过 " + MAX_LOGIN_ATTEMPTS + " 次，登录失败");
              return { success: false, error: "登录尝试次数超限（" + MAX_LOGIN_ATTEMPTS + "次）" };
            }
            popupCount.loginAttempts++;
            if (state !== LoginState.FILL_CREDENTIALS) {
              if (options.username && options.password) {
                await fillCredentials(page, options);
                state = LoginState.WAIT_RESPONSE;
                await sleep(3000);
              } else {
                console.log("[autoLogin] 无用户名/密码，等待手动登录...");
                // 等待用户手动登录
                await page.waitForFunction(() => {
                  const body = document.body?.textContent || "";
                  return body.includes("Balance") || body.includes("余额") ||
                         body.includes("Credit") || body.includes("额度");
                }, { timeout: 10000 }).catch(() => {});
              }
            } else {
              // state === FILL_CREDENTIALS，说明刚从弹窗处理回来，需要重新填写凭据
              if (options.username && options.password) {
                await fillCredentials(page, options);
                state = LoginState.WAIT_RESPONSE;
                await sleep(3000);
              }
            }
            break;
          }

          case LoginState.LOGGED_IN: {
            console.log("[autoLogin] 检测到已登录状态，开始提取凭证");

            // 等待 uid/ver 捕获
            if (!capturedUid || !capturedVer) {
              console.log("[autoLogin] 等待 uid/ver 捕获...");

              // 4.2 主动触发 ver 获取：通过 page.evaluate fetch transform.php?p=home
              if (!capturedVer) {
                try {
                  console.log("[autoLogin] 主动 fetch transform.php?p=home 触发 ver 获取...");
                  await page.evaluate(async () => {
                    try {
                      await fetch("transform.php?p=home", {
                        method: "POST",
                        headers: {
                          "Content-Type": "application/x-www-form-urlencoded",
                          "X-Requested-With": "XMLHttpRequest"
                        },
                        credentials: "include"
                      });
                    } catch (e) {}
                  });
                  await sleep(1000);
                  // ver 应该已经通过 page.on('response') 拦截器捕获
                } catch (e) {
                  console.warn("[autoLogin] 主动 fetch 失败:", e.message);
                }
              }

              // 4.4 从 DOM 全局变量提取 ver 的回退
              if (!capturedVer) {
                try {
                  const verFromDom = await page.evaluate(() => {
                    try { return top.ver || window.ver || ""; } catch(e) { return window.ver || ""; }
                  });
                  if (verFromDom) {
                    capturedVer = verFromDom;
                    extractVerFromRequest("transform.php?ver=" + verFromDom);
                    console.log("[autoLogin] 从 DOM 全局变量提取 ver: " + verFromDom.substring(0, 16) + "...");
                  }
                } catch (e) {}
              }

              // 遍历所有 frame 查找 uid 和 API 域名
              if (!capturedUid) {
                try {
                  const frames = page.frames();
                  for (const frame of frames) {
                    try {
                      const frameUrl = frame.url();
                      // 从 transform.php frame 提取 API 域名
                      if (frameUrl.includes("transform.php") && !apiDomain) {
                        try {
                          const urlObj = new URL(frameUrl);
                          apiDomain = urlObj.origin;
                          console.log("[autoLogin] 从 frame 提取 API 域名: " + apiDomain);
                        } catch (e) {}
                      }
                      const frameUid = await frame.evaluate(() => {
                        try { return window.uid || ""; } catch(e) { return ""; }
                      });
                      if (frameUid && frameUid !== "undefined" && frameUid.length >= 10 && !frameUid.endsWith("=")) {
                        capturedUid = frameUid;
                        console.log("[autoLogin] 从 frame 提取 uid: " + capturedUid.substring(0, 12) + "...");
                      }
                    } catch (e) {}
                  }
                } catch (e) {}
              }

              // 从 _CHDomain 对象提取 uid（含 ver/domain 等附加字段）
              if (!capturedUid) {
                try {
                  const chDomain = await page.evaluate(() => {
                    try {
                      const ch = window._CHDomain || (typeof top !== 'undefined' && top._CHDomain) || null;
                      if (!ch) return null;
                      return {
                        uid: ch.uid || '',
                        mid: ch.mid || '',
                        username: ch.username || '',
                        ver: ch.ver || '',
                        domain: ch.domain || ''
                      };
                    } catch (e) { return null; }
                  });
                  if (chDomain && chDomain.uid && chDomain.uid.length >= 10 && !chDomain.uid.endsWith('=')) {
                    capturedUid = chDomain.uid;
                    console.log('[autoLogin] 从 _CHDomain.uid 提取 uid: ' + capturedUid.substring(0, 12) + '...');
                    if (chDomain.ver && !capturedVer) {
                      capturedVer = chDomain.ver;
                      extractVerFromRequest('transform.php?ver=' + chDomain.ver);
                      console.log('[autoLogin] 从 _CHDomain.ver 提取 ver: ' + capturedVer.substring(0, 8) + '...');
                    }
                    if (chDomain.domain && !apiDomain) {
                      apiDomain = 'https://' + chDomain.domain;
                      console.log('[autoLogin] 从 _CHDomain.domain 提取 apiDomain: ' + apiDomain);
                    }
                  }
                } catch (e) {}
              }

              // 最后回退：导航到 Soccer 页面触发请求
              try {
                await page.evaluate(() => {
                  const btn = document.getElementById("live_page");
                  if (btn) btn.click();
                });
                await sleep(2000);
                await page.evaluate(() => {
                  const btn = document.getElementById("symbol_ft");
                  if (btn) btn.click();
                });
                await sleep(1500);
              } catch (e) {
                console.warn("[autoLogin] 导航到 Soccer 失败:", e.message);
              }
            }

            // 4.3 立即写入 credentialManager 和 browserPool
            if (capturedUid && capturedVer) {
              updateCredentials({ uid: capturedUid, ver: capturedVer, cookies: [], apiDomain: apiDomain });
              setUid(capturedUid);
              console.log("[autoLogin] uid/ver 已立即写入 credentialManager 和 browserPool");
            }

            // 获取 Cookie
            const cookies = await page.cookies();
            console.log("[autoLogin] 获取到 " + cookies.length + " 条 Cookie");

            // 从内联 script 标签解析 uid
            if (!capturedUid) {
              try {
                for (const frame of page.frames()) {
                  try {
                    const scriptUids = await frame.evaluate(() => {
                      const results = [];
                      const scripts = document.querySelectorAll('script');
                      for (const s of scripts) {
                        const text = s.textContent || '';
                        const m = text.match(/uid\s*=\s*'([^']+)'/);
                        if (m && m[1] && m[1].length >= 10 && !m[1].endsWith('=')) {
                          results.push(m[1]);
                        }
                      }
                      return results;
                    });
                    if (scriptUids.length > 0) {
                      capturedUid = scriptUids[0];
                      console.log('[autoLogin] 从内联 script 标签提取 uid: ' + capturedUid.substring(0, 12) + '...');
                      break;
                    }
                  } catch (e) {}
                }
              } catch (e) {}
            }

            // 如果 uid 仍为空，尝试从 Cookie 中提取
            if (!capturedUid) {
              for (const c of cookies) {
                if (c.name.toLowerCase() === "uid" && c.value && c.value.length >= 10 && !c.value.endsWith("=")) {
                  capturedUid = c.value;
                  console.log("[autoLogin] 从 Cookie 提取 uid: " + capturedUid.substring(0, 10) + "...");
                  break;
                }
              }
            }

            // 构建结果
            const result = {
              success: !!(capturedUid && capturedVer),
              uid: capturedUid,
              ver: capturedVer,
              apiDomain: apiDomain,
              cookieStr: cookies.map(c => `${c.name}=${c.value}`).join("; "),
              cookies: cookies,
            };

            if (result.success) {
              updateCredentials({ uid: capturedUid, ver: capturedVer, cookies: cookies, apiDomain: apiDomain });
              console.log("[autoLogin] 登录成功，凭证已保存 (耗时: " + (Date.now() - startTime) + "ms)");
            } else {
              console.warn("[autoLogin] 登录完成但凭证不完整: uid=" + (capturedUid ? "有" : "无") + " ver=" + (capturedVer ? "有" : "无"));
            }

            return result;
          }

          case LoginState.WAIT_RESPONSE:
          default: {
            await sleep(1000);
            break;
          }
        }
      }

      // 超时退出循环
      console.error("[autoLogin] 状态机循环超时 (" + AUTO_LOGIN_TIMEOUT + "ms)");
      return { success: false, error: "登录状态机超时" };
    };

    // 竞速：登录 vs 超时
    const result = await Promise.race([loginPromise(), timeoutPromise]);
    return result;

  } catch (err) {
    console.error("[autoLogin] 自动登录失败:", err.message);
    // 超时或其他异常时，确保关闭浏览器避免资源泄漏
    if (browserRef) {
      try { await browserRef.close(); } catch (_) {}
    }
    return { success: false, error: err.message };
  } finally {
    // 关闭浏览器（如果 catch 中已关闭则 browserRef 为已关闭状态，close 会抛错但被忽略）
    if (browser) {
      try {
        await browser.close();
        console.log("[autoLogin] 浏览器已关闭");
      } catch (e) {
        // 忽略关闭错误（可能已在 catch 中关闭）
      }
    }
  }
}

/**
 * 从已登录的 page 中提取 uid/ver 并同步到 credentialManager / browserPool
 * 供 hgCrawlerService 等外部模块在登录成功后复用，避免重复编写提取逻辑
 *
 * 提取策略（按优先级）：
 *   1. 响应拦截器捕获 transform.php 中的 ver
 *   1.5. 从 _CHDomain 对象提取 uid/ver/domain（首要来源）
 *   2. 从 frame 的 window.uid 提取
 *   3. 从 DOM 全局变量 (top.uid / window.uid) 提取
 *   4. 主动 fetch transform.php?p=home 触发 ver 获取
 *   5. 从 DOM 全局变量 (top.ver / window.ver) 提取 ver
 *   5.5. 从内联 script 标签解析 uid（回退）
 *   6. 从 Cookie 提取 uid（最终回退）
 *
 * @param {import('puppeteer').Page} page - 已登录的 Puppeteer 页面
 * @param {object} [options] - 可选参数
 * @param {string} [options.username] - 用户名（用于凭证持久化）
 * @param {string} [options.password] - 密码（用于凭证持久化）
 * @returns {Promise<{uid: string|null, ver: string|null, apiDomain: string|null}>}
 */
export async function syncCredentialsFromPage(page, options = {}) {
  let capturedUid = null;
  let capturedVer = null;
  let apiDomain = null;

  // 1. 注册响应拦截器，捕获后续请求中的 uid/ver
  page.on("response", async (response) => {
    const url = response.url();
    try {
      if (url.includes("transform.php") && url.includes("ver=")) {
        extractVerFromRequest(url);
        const verMatch = url.match(/[?&]ver=([^&]+)/);
        if (verMatch && verMatch[1]) {
          capturedVer = verMatch[1];
          console.log("[syncCredentials] 从 transform.php 捕获 ver: " + capturedVer.substring(0, 16) + "...");
        }
      }
    } catch (e) {}
  });

  // 1.5. 从 _CHDomain 对象提取 uid（首要来源 - 登录后主页内联脚本设置）
  if (!capturedUid) {
    try {
      const chDomain = await page.evaluate(() => {
        try {
          const ch = window._CHDomain || (typeof top !== 'undefined' && top._CHDomain) || null;
          if (!ch) return null;
          return {
            uid: ch.uid || '',
            mid: ch.mid || '',
            username: ch.username || '',
            ver: ch.ver || '',
            domain: ch.domain || ''
          };
        } catch (e) { return null; }
      });
      if (chDomain && chDomain.uid && chDomain.uid.length >= 10 && !chDomain.uid.endsWith('=')) {
        capturedUid = chDomain.uid;
        console.log('[syncCredentials] 从 _CHDomain.uid 提取 uid: ' + capturedUid.substring(0, 12) + '...');
        // 同步 _CHDomain 附加信息
        if (chDomain.mid) options._chMid = chDomain.mid;
        if (chDomain.username && !options.username) options.username = chDomain.username;
        if (chDomain.ver && !capturedVer) {
          capturedVer = chDomain.ver;
          extractVerFromRequest('transform.php?ver=' + chDomain.ver);
          console.log('[syncCredentials] 从 _CHDomain.ver 提取 ver: ' + chDomain.ver.substring(0, 16) + '...');
        }
        if (chDomain.domain && !apiDomain) {
          apiDomain = 'https://' + chDomain.domain;
          console.log('[syncCredentials] 从 _CHDomain.domain 提取 apiDomain: ' + apiDomain);
        }
      }
    } catch (e) {
      console.warn('[syncCredentials] _CHDomain 提取失败:', e.message);
    }
  }

  // 2. 从 frame 提取 uid 和 API 域名
  try {
    const frames = page.frames();
    for (const frame of frames) {
      try {
        const frameUrl = frame.url();
        // 提取 API 域名
        if (frameUrl.includes("transform.php") && !apiDomain) {
          try { apiDomain = new URL(frameUrl).origin; } catch (e) {}
        }
        // 从 frame 内 window.uid 提取
        if (!capturedUid) {
          const frameUid = await frame.evaluate(() => {
            try { return window.uid || ""; } catch(e) { return ""; }
          });
          if (frameUid && frameUid !== "undefined" && frameUid.length >= 10 && !frameUid.endsWith("=")) {
            capturedUid = frameUid;
            console.log("[syncCredentials] 从 frame 提取 uid: " + capturedUid.substring(0, 12) + "...");
          }
        }
      } catch (e) {}
    }
  } catch (e) {}

  // 3. 从 DOM 全局变量提取 uid
  if (!capturedUid) {
    try {
      const domUid = await page.evaluate(() => {
        try { return top.uid || window.uid || ""; } catch(e) { return window.uid || ""; }
      });
      if (domUid && domUid !== "undefined" && domUid.length >= 10 && !domUid.endsWith("=")) {
        capturedUid = domUid;
        console.log("[syncCredentials] 从 DOM 提取 uid: " + capturedUid.substring(0, 12) + "...");
      }
    } catch (e) {}
  }

  // 4. 主动 fetch transform.php?p=home 触发 ver 获取
  if (!capturedVer) {
    try {
      console.log("[syncCredentials] 主动 fetch transform.php?p=home 触发 ver 获取...");
      await page.evaluate(async () => {
        try {
          await fetch("transform.php?p=home", {
            method: "POST",
            headers: {
              "Content-Type": "application/x-www-form-urlencoded",
              "X-Requested-With": "XMLHttpRequest"
            },
            credentials: "include"
          });
        } catch (e) {}
      });
      await sleep(1000);
    } catch (e) {
      console.warn("[syncCredentials] 主动 fetch 失败:", e.message);
    }
  }

  // 5. 从 DOM 全局变量提取 ver（回退）
  if (!capturedVer) {
    try {
      const verFromDom = await page.evaluate(() => {
        try { return top.ver || window.ver || ""; } catch(e) { return window.ver || ""; }
      });
      if (verFromDom) {
        capturedVer = verFromDom;
        extractVerFromRequest("transform.php?ver=" + verFromDom);
        console.log("[syncCredentials] 从 DOM 提取 ver: " + verFromDom.substring(0, 16) + "...");
      }
    } catch (e) {}
  }

  // 5.5. 从内联 script 标签解析 uid（回退）
  if (!capturedUid) {
    try {
      for (const frame of page.frames()) {
        try {
          const scriptUids = await frame.evaluate(() => {
            const results = [];
            const scripts = document.querySelectorAll('script');
            for (const s of scripts) {
              const text = s.textContent || '';
              const m = text.match(/uid\s*=\s*'([^']+)'/);
              if (m && m[1] && m[1].length >= 10 && !m[1].endsWith('=')) {
                results.push(m[1]);
              }
            }
            return results;
          });
          if (scriptUids.length > 0) {
            capturedUid = scriptUids[0];
            console.log('[syncCredentials] 从内联 script 标签提取 uid: ' + capturedUid.substring(0, 12) + '...');
            break;
          }
        } catch (e) {}
      }
    } catch (e) {}
  }

  // 6. 从 Cookie 提取 uid（最终回退）
  if (!capturedUid) {
    try {
      const cookies = await page.cookies();
      for (const c of cookies) {
        if (c.name.toLowerCase() === "uid" && c.value && c.value.length >= 10 && !c.value.endsWith("=")) {
          capturedUid = c.value;
          console.log("[syncCredentials] 从 Cookie 提取 uid: " + capturedUid.substring(0, 10) + "...");
          break;
        }
      }
    } catch (e) {}
  }

  // 7. 同步到 browserPool 内存 + credentialManager 磁盘
  if (capturedUid) {
    setUid(capturedUid);
  }
  const cookies = await page.cookies();
  updateCredentials({
    uid: capturedUid,
    ver: capturedVer,
    cookies,
    username: options.username,
    password: options.password,
    apiDomain
  });

  if (capturedUid && capturedVer) {
    console.log("[syncCredentials] 凭证同步完成: uid=" + capturedUid.substring(0, 10) + "... ver=" + (capturedVer || "").substring(0, 16) + "...");
  } else {
    console.warn("[syncCredentials] 凭证不完整: uid=" + (capturedUid ? "有" : "无") + " ver=" + (capturedVer ? "有" : "无"));
  }

  return { uid: capturedUid, ver: capturedVer, apiDomain };
}
