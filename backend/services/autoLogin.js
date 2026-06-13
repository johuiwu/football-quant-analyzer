// ======================== 自动登录模块 ========================
// 在凭证缺失或过期时，通过 Puppeteer 浏览器自动登录获取新凭证
// 登录完成后关闭浏览器，返回凭证给 credentialManager

import puppeteer from "puppeteer-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";
import { HG_URL, setUid, saveCookiesToDisk, loadCookiesFromDisk } from "./browserPool.js";
import { extractVerFromRequest } from "./transformSigner.js";
import { updateCredentials, invalidateCookieCache, loadCredentials } from "./credentialManager.js";

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
    const result = await page.evaluate(() => {
      // 辅助：判断元素是否可见（使用 getComputedStyle，兼容 position:fixed）
      function isVisible(el) {
        if (!el) return false;
        const style = getComputedStyle(el);
        return style.display !== 'none' && style.visibility !== 'hidden';
      }

      // 1. 检测简易密码设置页面 (#back_login 可见)
      var backLoginBtn = document.getElementById('back_login');
      if (isVisible(backLoginBtn)) {
        return { state: 'PASSCODE_PAGE', detail: '简易密码设置页面' };
      }

      // 2. 检测被踢出弹窗（需要 #alert_kick 容器激活）
      var alertKick = document.getElementById('alert_kick');
      if (alertKick && alertKick.classList.contains('on')) {
        return { state: 'KICKED_OUT', detail: '被踢出弹窗' };
      }

      // 3. 检测激活弹窗（容器 .on 类）— 必须在 LOGIN_PAGE 之前检测！
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
      if (hasSuccess) {
        return { state: 'LOGGED_IN', detail: '已登录' };
      }

      // 5. 检测登录页面 (#usr 输入框可见)
      var usrInput = document.getElementById('usr');
      if (usrInput && isVisible(usrInput)) {
        return { state: 'LOGIN_PAGE', detail: '登录页面' };
      }

      // 6. 其他情况：等待响应
      return { state: 'WAIT_RESPONSE', detail: '等待响应' };
    });
    return result;
  } catch (e) {
    return { state: 'WAIT_RESPONSE', detail: '检测异常: ' + e.message };
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
    await sleep(600);

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

  // 使用 Puppeteer type() 方法模拟真实键盘输入
  const usernameInput = await page.$("#usr, input[name='username'], input[type='text']");
  if (usernameInput) {
    await usernameInput.click({ clickCount: 3 });
    await usernameInput.type(username, { delay: 50 });
  }

  const passwordInput = await page.$("#pwd, input[name='password'], input[type='password']");
  if (passwordInput) {
    await passwordInput.click({ clickCount: 3 });
    await passwordInput.type(password, { delay: 50 });
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
          console.log("[autoLogin] 已点击登录按钮 (" + sel + ")");
          break;
        }
      }
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

  // ★ 快速路径：磁盘有 uid/ver 时，先尝试纯 HTTP 保活
  const diskCreds = loadCredentials();
  if (diskCreds && diskCreds.uid && diskCreds.ver) {
    console.log("[autoLogin] 磁盘存在 uid/ver，尝试纯 HTTP 保活...");
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);
      const res = await fetch(`${HG_URL}/transform.php?ver=${diskCreds.ver}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          ...(diskCreds.cookieStr ? { Cookie: diskCreds.cookieStr } : {}),
        },
        body: `uid=${diskCreds.uid}&ver=${diskCreds.ver}&p=get_league_count`,
        signal: controller.signal,
      });
      clearTimeout(timeout);
      if (res.ok) {
        const text = await res.text();
        if (!text.includes("<!DOCTYPE") && !text.includes("<html>")) {
          console.log("[autoLogin] 纯 HTTP 保活成功，跳过浏览器登录");
          return { success: true, uid: diskCreds.uid, ver: diskCreds.ver };
        }
      }
      console.log("[autoLogin] 保活请求返回非预期内容，走完整浏览器登录");
    } catch (e) {
      console.log("[autoLogin] 纯 HTTP 保活失败: " + e.message + "，走完整浏览器登录");
    }
  }

  let browser = null;
  let page = null;

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
      if (process.env.PUPPETEER_PROXY) {
        launchArgs.push("--proxy-server=" + process.env.PUPPETEER_PROXY);
        launchArgs.push("--host-resolver-rules=MAP * ~NOTFOUND , EXCLUDE localhost");
      }

      browser = await puppeteer.launch({
        headless: process.env.PUPPETEER_HEADLESS !== "false",
        args: launchArgs,
      });
      page = await browser.newPage();
      console.log("[autoLogin] 浏览器已启动");

      // 2. 设置 uid/ver 拦截
      let capturedUid = null;
      let capturedVer = null;
      let apiDomain = null;

      page.on("response", async (response) => {
        const url = response.url();
        try {
          // 拦截 chk_login 响应提取 uid
          if (url.includes("chk_login")) {
            const text = await response.text();
            const uidMatch = text.match(/<uid>([^<]+)<\/uid>/);
            if (uidMatch && uidMatch[1]) {
              capturedUid = uidMatch[1];
              console.log("[autoLogin] 从 chk_login 捕获 uid: " + capturedUid.substring(0, 10) + "...");
            }
          }
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

      // 3. 加载已有 Cookie（如有）
      const savedCookies = loadCookiesFromDisk();
      if (savedCookies && savedCookies.length > 0) {
        await page.setCookie(...savedCookies);
        console.log("[autoLogin] 已加载 " + savedCookies.length + " 条 Cookie");
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
            // 弹窗关闭后继续等待，状态不变
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
              updateCredentials({ uid: capturedUid, ver: capturedVer, cookies: [] });
              setUid(capturedUid);
              console.log("[autoLogin] uid/ver 已立即写入 credentialManager 和 browserPool");
            }

            // 获取 Cookie
            const cookies = await page.cookies();
            console.log("[autoLogin] 获取到 " + cookies.length + " 条 Cookie");

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
              updateCredentials({ uid: capturedUid, ver: capturedVer, cookies: cookies });
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
    return { success: false, error: err.message };
  } finally {
    // 关闭浏览器
    if (browser) {
      try {
        await browser.close();
        console.log("[autoLogin] 浏览器已关闭");
      } catch (e) {
        // 忽略关闭错误
      }
    }
  }
}
