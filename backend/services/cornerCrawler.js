import puppeteer from "puppeteer-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";
import fs from "fs";
import path from "path";
import {
  getSharedBrowser, getSharedPage, setSharedPage,
  getLoginCookies, setLoginCookies,
  getBalance, setBalance, isLoggedIn, isBrowserActive,
  closeSharedBrowser, HG_URL,
  saveCookiesToDisk, loadCookiesFromDisk,
  MOBILE_UA
} from "./browserPool.js";
import { parseAllMarkets, handlePopups, clickTab, parseAsianHandicap, randomDelay } from "./crawlerShared.js";
import { loadCredentials, updateCredentials, isCredentialsValid, invalidateCookieCache, loadAndValidate, getSavedLoginCredentials, validateCredentials } from "./credentialManager.js";
import { fetchCornerData, fetchHdpOuData, fetchGameDetail } from "./hgApiClient.js";
import { POLL_CONFIG } from "./crawlerConfig.js";
import { withLoginMutex } from "./hgCrawlerService.js";

puppeteer.use(StealthPlugin());

/** 将 re_time 原始格式（如 "2H^71:13"）转为人类可读格式（如 "71:13"） */
function formatTime(retime) {
  if (!retime) return "";
  if (retime.includes("HT")) return "HT";
  const tm = retime.match(/^\d+H\^(\d+:\d+)/);
  if (tm) return tm[1];
  return retime;
}

// ======================== 配置 ========================
const HG_USERNAME = process.env.HG_USERNAME || "";
const HG_PASSWORD = process.env.HG_PASSWORD || "";
if (!process.env.HG_USERNAME || !process.env.HG_PASSWORD) {
  console.warn("[cornerCrawler] 环境变量 HG_USERNAME / HG_PASSWORD 未设置，将使用运行时凭据");
}
const POLL_INTERVAL = POLL_CONFIG.interval;

// 运行时凭据
let runtimeCredentials = null;
let loginInProgress = false;
let crawlingLock = false;
let lastLoginErrorDetail = null;
let browserExplicitlyClosed = false;
let pollingActive = false;
let pollingStopFn = null;

// XHR 拦截缓存
let capturedResponses = [];
const seenRequestUrls = new Set();

// ★ API 模式：缓存 uid/ver
let cachedSessionInfo = null;

// ======================== 保活等待（waitForFunction + 定期滚动防检测） ========================
/**
 * 在 waitForFunction 期间每 5 秒模拟一次轻微滚动，防止页面被标记为闲置
 */
async function waitWithKeepAlive(page, fn, options = {}, scrollMs = 5000) {
  let resolved = false;
  const scrollTask = (async () => {
    while (!resolved) {
      await new Promise(r => setTimeout(r, scrollMs));
      if (resolved) break;
      try {
        await page.evaluate(() => window.scrollBy(0, 80 + Math.random() * 150));
      } catch (_) {}
    }
  })();
  try {
        await page.waitForFunction(fn, options);
  } finally {
    resolved = true;
  }
  // 等待滚动任务结束
  await scrollTask;
}

// ======================== 拟人鼠标移动 ========================
export async function randomMouseMove(page) {
  try {
    const moves = 2 + Math.floor(Math.random() * 4); // 2-5 个坐标点
    for (let i = 0; i < moves; i++) {
      await page.mouse.move(
        100 + Math.random() * 800,
        100 + Math.random() * 600,
        { steps: 3 + Math.floor(Math.random() * 6) }
      );
      await randomDelay(200, 500);
    }
  } catch (_) {}
}



// ======================== 余额提取 ========================
async function extractBalance(page) {
  try {
    const balance = await page.evaluate(() => {
      // 工具：从文本中提取第一个像金额的数字
      const parseNumber = (text) => {
        if (!text) return null;
        const m = text.match(/[$¥€]?\s*([\d,]+\.\d{2})/);
        if (m) {
          const n = parseFloat(m[1].replace(/,/g, ""));
          if (Number.isFinite(n)) return n;
        }
        return null;
      };

      // 第 1 步：按 id/class 选择器精确定位余额元素
      const selectors = [
        '[id*="balance" i]', '[id*="credit" i]', '[id*="wallet" i]',
        '[class*="balance" i]', '[class*="credit" i]', '[class*="wallet" i]',
        '[class*="cash" i]', '[class*="money" i]'
      ];
      for (const sel of selectors) {
        const el = document.querySelector(sel);
        if (el) {
          // 优先取元素直接文本（含直接子节点）
          const directText = (el.childNodes && Array.from(el.childNodes)
            .filter(n => n.nodeType === 3)
            .map(n => n.textContent.trim())
            .filter(Boolean)
            .join(" ")) || el.textContent || "";
          const num = parseNumber(directText);
          if (num !== null) return num;
        }
      }

      // 第 2 步：兜底 - 遍历所有含 Balance/余额/Credit/额度 关键词的元素
      // 仅在该元素的 200 字符范围内匹配，避免全页误匹配
      const keywords = ["Balance", "余额", "Credit", "额度"];
      const all = document.querySelectorAll("*");
      for (const el of all) {
        // 跳过 script/style
        if (el.tagName === "SCRIPT" || el.tagName === "STYLE") continue;
        // 仅检查元素直接文本（不深入子节点）
        const ownText = (el.childNodes && Array.from(el.childNodes)
          .filter(n => n.nodeType === 3)
          .map(n => n.textContent)
          .join("")) || "";
        if (!ownText || ownText.length > 200) continue;
        for (const kw of keywords) {
          if (ownText.includes(kw)) {
            // 关键词命中后，从该元素（含子节点）的 200 字符文本中提取数字
            const fullText = (el.textContent || "").slice(0, 200);
            const num = parseNumber(fullText);
            if (num !== null) return num;
            break;
          }
        }
      }

      return null;
    });
    if (balance !== null) {
      setBalance(balance);
      console.log("[cornerCrawler] 余额: " + balance);
    } else {
      console.log("[extractBalance] 未找到余额元素");
    }
    return balance;
  } catch (e) {
    console.log("[cornerCrawler] 余额提取失败:", e.message);
    return null;
  }
}

// ======================== 登录流程 ========================

// ======================== 截图辅助 ========================
let screenshotDirCreated = false;
async function saveDebugScreenshot(page, label) {
  try {
    if (!screenshotDirCreated) {
      fs.mkdirSync(path.resolve("debug_screenshots"), { recursive: true });
      screenshotDirCreated = true;
    }
    const ts = new Date().toISOString().replace(/[:.]/g, "-");
    const filePath = path.resolve("debug_screenshots", "login_" + label + "_" + ts + ".png");
    await page.screenshot({ path: filePath, fullPage: false });
    console.log("[cornerCrawler] 截图已保存: " + filePath);
  } catch (e) {
    console.warn("[cornerCrawler] 截图失败:", e.message);
  }
}

// ======================== 简易密码页面检测与处理 ========================
/**
 * 检测并处理简易密码页面（多次重试，确保慢加载也能捕获）
 * @param {Page} page - Puppeteer 页面对象
 * @param {number} maxRetries - 最大重试次数（默认3次）
 * @returns {Promise<{detected: boolean, handled: boolean}>} 是否检测到并成功处理
 */
async function handlePasscodePage(page, maxRetries = 3) {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      // ★ 遍历所有 frame 检测简易密码页面（对标 autoLogin.js）
      let passcodeFrame = null;
      let passcodeStatus = null;
      for (const frame of page.frames()) {
        try {
          const status = await frame.evaluate(() => {
            const backLoginBtn = document.getElementById("back_login");
            const isBackLoginVisible = backLoginBtn
              && getComputedStyle(backLoginBtn).display !== 'none'
              && getComputedStyle(backLoginBtn).visibility !== 'hidden'
              && getComputedStyle(backLoginBtn).visibility !== 'collapse';
            const bodyText = (document.body?.textContent || "").substring(0, 500);
            const hasPasscodeText = bodyText.includes("Passcode Login") || bodyText.includes("简易密码");
            const hasTwoFactorText = bodyText.includes("普通登入");
            return { isBackLoginVisible, hasPasscodeText, hasTwoFactorText };
          });
          if (status.isBackLoginVisible || status.hasTwoFactorText) {
            passcodeFrame = frame;
            passcodeStatus = status;
            break;
          }
        } catch (_) {}
      }

      if (!passcodeFrame || (!passcodeStatus.isBackLoginVisible && !passcodeStatus.hasTwoFactorText)) {
        return { detected: false, handled: false };
      }

      console.log(`[登录步骤] 检测到简易密码页面 (attempt ${attempt + 1}/${maxRetries})，点击普通登入...`);
      // ★ 首次检测到时输出 HTML 结构诊断
      if (attempt === 0) {
        try {
          const diag = await passcodeFrame.evaluate(() => {
            const btn = document.getElementById('back_login');
            return {
              backLoginHTML: btn ? btn.outerHTML.substring(0, 300) : 'NOT_FOUND',
              frameUrl: window.location.href,
              bodySample: (document.body?.textContent || "").substring(0, 200)
            };
          });
          console.log("[登录诊断] 简易密码页面结构:", JSON.stringify(diag, null, 2));
        } catch (_) {}
      }

      // ★ 在目标 frame 中点击 #back_login（而非只在主 frame）
      await passcodeFrame.evaluate(() => {
        const btn = document.querySelector("#back_login");
        if (btn) btn.click();
      });
      await randomDelay(3000, 4000);

      // ★ 重新输入账号密码（遍历所有 frame，使用 nativeInputValueSetter）
      const reUser = (runtimeCredentials && runtimeCredentials.username) || HG_USERNAME;
      const rePwd = (runtimeCredentials && runtimeCredentials.password) || HG_PASSWORD;
      for (const frame of page.frames()) {
        try {
          const filled = await frame.evaluate((usr, pw) => {
            const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
              window.HTMLInputElement.prototype, "value"
            ).set;
            const u = document.querySelector("#usr, input[name='username'], input[type='text']");
            const p = document.querySelector("#pwd, input[name='password'], input[type='password']");
            if (u) {
              u.focus();
              nativeInputValueSetter.call(u, usr);
              u.dispatchEvent(new Event("input", { bubbles: true }));
              u.dispatchEvent(new Event("change", { bubbles: true }));
            }
            if (p) {
              p.focus();
              nativeInputValueSetter.call(p, pw);
              p.dispatchEvent(new Event("input", { bubbles: true }));
              p.dispatchEvent(new Event("change", { bubbles: true }));
            }
            return !!(u && p);
          }, reUser, rePwd);
          if (filled) {
            await randomDelay(500, 1000);
            // ★ 使用 Puppeteer click 点击登录按钮（与 autoLogin.js 一致）
            const btn = await frame.$("#btn_login, input[type='submit']");
            if (btn) {
              await btn.click();
              console.log("[登录步骤] 已通过 Puppeteer click 点击登录按钮");
            } else {
              await frame.evaluate(() => {
                const b = document.getElementById('btn_login') || document.querySelector("input[type='submit']");
                if (b) b.click();
              });
            }
            break;
          }
        } catch (_) {}
      }
      console.log("[登录步骤] 已重新输入凭据并点击登录，等待页面加载...");
      await randomDelay(5000, 7000);

      // 验证是否成功离开简易密码页面
      let stillOnPasscode = false;
      for (const frame of page.frames()) {
        try {
          const check = await frame.evaluate(() => {
            const btn = document.getElementById("back_login");
            return btn && getComputedStyle(btn).display !== 'none' && getComputedStyle(btn).visibility !== 'hidden';
          });
          if (check) { stillOnPasscode = true; break; }
        } catch (_) {}
      }
      if (!stillOnPasscode) {
        console.log("[登录步骤] 简易密码页面已处理成功");
        return { detected: true, handled: true };
      }
      console.log("[登录步骤] 简易密码页面仍存在，重试...");
    } catch (e) {
      console.warn("[登录步骤] 简易密码检测失败:", e.message);
    }
  }
  return { detected: true, handled: false };
}

/**
 * 登录状态检测（对标 autoLogin.js detectPageState）
 * 优先级：PASSCODE_PAGE > KICKED_OUT > PASSCODE_DIALOG > POPUP_ACTIVE > LOGGED_IN > LOGIN_PAGE > LOGIN_ERROR > WAIT_RESPONSE
 */
async function detectLoginState(page) {
  // ★ HG 网站使用 iframe，登录表单和内容可能在 iframe 中
  // 必须遍历所有 frame 进行检测，不能只检测主 frame
  const detectFn = () => {
    try {
      // 辅助：判断元素是否可见
      function isVisible(el) {
        if (!el) return false;
        const s = getComputedStyle(el);
        return s.display !== 'none' && s.visibility !== 'hidden' && s.visibility !== 'collapse';
      }

      // 优先级1: 简易密码设置页面（#back_login 可见）
      var backLogin = document.getElementById('back_login');
      if (isVisible(backLogin)) {
        return { state: 'PASSCODE_PAGE', detail: '简易密码设置页面' };
      }

      // 优先级2: 被踢出（#alert_kick 容器激活）
      var alertKick = document.getElementById('alert_kick');
      if (alertKick && alertKick.classList.contains('on')) {
        return { state: 'KICKED_OUT', detail: '被踢出登录' };
      }

      // 优先级3: 简易密码确认弹窗（C_alert_confirm / alert_confirm 激活）
      // ★ 从 POPUP_ACTIVE 中分离出来，专门处理（对标 autoLogin.js PASSCODE_DIALOG）
      var passcodeDialogIds = ['C_alert_confirm', 'alert_confirm'];
      for (var pd = 0; pd < passcodeDialogIds.length; pd++) {
        var pdEl = document.getElementById(passcodeDialogIds[pd]);
        if (pdEl) {
          if (pdEl.classList.contains('on')) {
            return { state: 'PASSCODE_DIALOG', detail: '简易密码确认弹窗(.on): ' + passcodeDialogIds[pd] };
          }
          var pdPs = getComputedStyle(pdEl);
          var pdVisible = pdPs.display !== 'none' && pdPs.visibility !== 'hidden' && pdPs.visibility !== 'collapse' && pdPs.opacity !== '0';
          if (pdVisible) {
            return { state: 'PASSCODE_DIALOG', detail: '简易密码确认弹窗(可见): ' + passcodeDialogIds[pd] };
          }
        }
      }

      // 优先级4: 其他激活弹窗（容器 .on 类 或 display/visibility/opacity 可见）
      var popupIds = ['alert_show', 'system_popup', 'C_alert_ok', 'alert_ok'];
      for (var i = 0; i < popupIds.length; i++) {
        var popupEl = document.getElementById(popupIds[i]);
        if (popupEl) {
          if (popupEl.classList.contains('on')) {
            return { state: 'POPUP_ACTIVE', detail: '弹窗激活(.on): ' + popupIds[i] };
          }
          var ps = getComputedStyle(popupEl);
          var isVisiblePopup = ps.display !== 'none' && ps.visibility !== 'hidden' && ps.visibility !== 'collapse' && ps.opacity !== '0';
          if (isVisiblePopup) {
            return { state: 'POPUP_ACTIVE', detail: '弹窗激活(可见): ' + popupIds[i] };
          }
        }
      }

      // 优先级5: 已登录（主页特征 + loginuser cookie）
      var bodyText = document.body.textContent || "";
      var hasMainFeature = (bodyText.includes("My Events") || bodyText.includes("My Bets")) ||
                           (bodyText.includes("In-Play") && bodyText.includes("Soccer"));
      if (!hasMainFeature) {
        var sportEl = document.getElementById("old_ft_live_league");
        if (sportEl && getComputedStyle(sportEl).display !== 'none') hasMainFeature = true;
      }
      if (!hasMainFeature) {
        var nav = document.getElementById("today_page") || document.getElementById("live_page");
        if (nav && isVisible(nav)) hasMainFeature = true;
      }
      if (!hasMainFeature) {
        var symbol = document.getElementById("symbol_ft");
        if (symbol && isVisible(symbol)) hasMainFeature = true;
      }
      // ★ 额外检测：loginuser cookie 存在说明已登录（对标 autoLogin.js L88）
      if (!hasMainFeature && document.cookie.includes('loginuser=')) {
        hasMainFeature = true;
      }
      var accShow = document.getElementById("acc_show");
      var loginHidden = !accShow || getComputedStyle(accShow).display === 'none';
      if (loginHidden && bodyText.includes("In-Play")) hasMainFeature = true;

      if (hasMainFeature) {
        return { state: 'LOGGED_IN', detail: '已登录 (frame: ' + (window.frameElement ? 'iframe' : 'main') + ')' };
      }

      // 优先级6: 登录页面（#usr 可见）
      var usrEl = document.querySelector('#usr');
      if (usrEl && usrEl.offsetParent !== null) {
        return { state: 'LOGIN_PAGE', detail: '登录页面 (frame: ' + (window.frameElement ? 'iframe' : 'main') + ')' };
      }

      // 优先级7: 密码错误
      var errEl = document.getElementById("text_error");
      if (errEl && errEl.style.display !== "none" && errEl.textContent.trim().length > 0) {
        return { state: 'LOGIN_ERROR', detail: errEl.textContent.trim() };
      }

      // 优先级8: 其他
      return { state: 'WAIT_RESPONSE', detail: '等待响应' };
    } catch (err) {
      return { state: 'WAIT_RESPONSE', detail: '检测异常: ' + (err.message || '') };
    }
  };

  try {
    // 遍历所有 frame（包括主 frame 和 iframe），与 autoLogin.js detectPageState 一致
    for (const frame of page.frames()) {
      try {
        var result = await frame.evaluate(detectFn);
        if (result.state && result.state !== 'WAIT_RESPONSE') return result;
      } catch (_) {}
    }

    return { state: 'WAIT_RESPONSE', detail: '所有 frame 均无有效状态' };
  } catch (err) {
    return { state: 'WAIT_RESPONSE', detail: 'evaluate异常: ' + (err.message || '') };
  }
}

/**
 * 强制清理所有弹窗容器（兜底机制）- 遍历所有 frame
 */
async function forceCleanupPopups(page) {
  try {
    // ★ 遍历所有 frame 执行清理（对标 autoLogin.js 的全 frame 处理）
    for (const frame of page.frames()) {
      try {
        const cleaned = await frame.evaluate(() => {
          let cleaned = false;
          const dialogIds = ["C_alert_confirm", "alert_confirm", "C_alert_ok", "alert_ok", "alert_kick", "system_popup", "alert_show"];
          for (const id of dialogIds) {
            const el = document.getElementById(id);
            if (el) {
              if (el.classList.contains("on")) { el.classList.remove("on"); cleaned = true; }
              el.style.display = 'none';
            }
          }
          if (document.body) {
            document.body.classList.remove("scroll_lock", "locked");
            document.body.style.overflow = "";
          }
          return cleaned;
        });
        if (cleaned) return true;
      } catch (_) {}
    }
    return false;
  } catch (_) { return false; }
}

/**
 * 处理简易密码确认弹窗：点击"否/NO"关闭弹窗（对标 autoLogin.js handlePasscodeDialog）
 */
async function handlePasscodeDialog(page) {
  console.log("[登录步骤] 检测到简易密码确认弹窗，正在关闭...");
  const isContextError = (err) => err.message && (
    err.message.includes("Execution context was destroyed") || err.message.includes("detached Frame")
  );

  // ★ 遍历所有 frame 查找和点击按钮（与 autoLogin.js 一致的全 frame 策略）
  for (const frame of page.frames()) {
    try {
      const clicked = await frame.evaluate(() => {
        const isVisible = (el) => {
          if (!el) return false;
          const s = getComputedStyle(el);
          return s.display !== 'none' && s.visibility !== 'hidden' && s.visibility !== 'collapse';
        };

        // 尝试多种取消按钮选择器
        const cancelSelectors = [
          ".btn_cancel", "#C_no_btn", "#no_btn", "#C_cancel_btn",
          "[class*='popup'] [class*='close']",
        ];
        const cancelTexts = ["NO", "否", "No", "no", "CANCEL", "取消"];

        // 1. 通过选择器找取消按钮
        for (const sel of cancelSelectors) {
          const el = document.querySelector(sel);
          if (el && isVisible(el)) {
            try { el.click(); return true; } catch(_) {}
          }
        }

        // 2. 通过文本找按钮
        const allButtons = Array.from(document.querySelectorAll("button, a, div[role='button'], .btn"));
        for (const btn of allButtons) {
          const text = (btn.textContent || "").trim().toUpperCase();
          if (cancelTexts.includes(text) && isVisible(btn)) {
            try { btn.click(); return true; } catch(_) {}
          }
        }

        // 3. 通过 OK/确认 按钮（有些弹窗只有一个确认按钮）
        const okSelectors = [".btn_confirm", ".btn_submit", "#C_ok_btn", "#ok_btn"];
        for (const sel of okSelectors) {
          const el = document.querySelector(sel);
          if (el && isVisible(el)) {
            try { el.click(); return true; } catch(_) {}
          }
        }

        return false;
      });
      if (clicked) {
        console.log("[登录步骤] 已通过页面内点击关闭简易密码确认弹窗");
        await randomDelay(500, 1000);

        // ★ 弹窗关闭后检测状态，如果仍为 LOGIN_PAGE 则刷新页面（对标 autoLogin.js L604-613）
        try {
          const afterPopupState = await detectLoginState(page);
          console.log("[登录诊断] 弹窗关闭后状态: " + afterPopupState.state + " (" + afterPopupState.detail + ")");
          if (afterPopupState.state === 'LOGGED_IN') {
            console.log("[登录步骤] 弹窗关闭后检测到已登录！");
            return { action: 'success' };
          }
          if (afterPopupState.state === 'LOGIN_PAGE') {
            console.log("[登录步骤] 弹窗关闭后仍为 LOGIN_PAGE，尝试刷新页面...");
            await page.reload({ waitUntil: 'networkidle2', timeout: 15000 }).catch(() => {});
            await randomDelay(3000, 4000);
            const reloadedState = await detectLoginState(page);
            console.log("[登录诊断] 刷新后状态: " + reloadedState.state + " (" + reloadedState.detail + ")");
            if (reloadedState.state === 'LOGGED_IN') {
              return { action: 'success' };
            }
          }
        } catch (_) {}

        return { action: 'retry_login' };
      }
    } catch (err) {
      if (isContextError(err)) {
        console.log("[登录步骤] handlePasscodeDialog: 页面导航中，等待后重试...");
        await randomDelay(2000, 3000);
        continue; // 重试下一个 frame 或重新尝试
      }
    }
  }

  // 所有 frame 都没找到可点击的按钮，强制清理
  const forceCleaned = await forceCleanupPopups(page);
  if (forceCleaned) {
    console.log("[登录步骤] 已强制清理弹窗容器");
    return { action: 'retry_login' };
  }

  console.warn("[登录步骤] 无法关闭简易密码确认弹窗");
  return { action: 'failed' };
}

/**
 * 带自诊断的弹窗处理：先尝试点击按钮，失败则输出弹窗 HTML 结构
 * ★ 遍历所有 frame 查找和点击按钮
 */
async function handlePopupWithDiagnostics(page, popupCount, MAX_POPUP) {
  console.log("[登录步骤] 第5步：处理弹窗 (" + popupCount + "/" + MAX_POPUP + ")");

  // 1. 尝试点击取消/否/确认按钮（遍历所有 frame）
  let clickResult = false;
  for (const frame of page.frames()) {
    try {
      const clicked = await frame.evaluate(() => {
        const isVisible = (el) => {
          if (!el) return false;
          const s = getComputedStyle(el);
          return s.display !== 'none' && s.visibility !== 'hidden' && s.visibility !== 'collapse';
        };
        let clicked = false;

        // 点击取消/否
        document.querySelectorAll(".btn_cancel, #C_no_btn, #no_btn, #C_cancel_btn, [class*='popup'] [class*='close']").forEach(btn => {
          if (!isVisible(btn)) return;
          const text = (btn.textContent || "").trim().toUpperCase();
          if (text === "NO" || text === "否" || text === "CANCEL" || text === "取消" || btn.id === "C_no_btn" || btn.id === "no_btn" || btn.id === "C_cancel_btn") {
            btn.click(); clicked = true;
          }
        });

        // fallback: 点击任意可见 .btn_cancel
        if (!clicked) {
          document.querySelectorAll(".btn_cancel").forEach(btn => {
            if (!isVisible(btn)) return;
            btn.click(); clicked = true;
          });
        }

        // 点击确认/OK（某些弹窗需要确认才能关闭）
        if (!clicked) {
          document.querySelectorAll('[class*="msg_popup"] .btn, .btn_confirm, .btn_submit, #C_ok_btn, #ok_btn, .btn_sure').forEach(btn => {
            if (!isVisible(btn)) return;
            const text = (btn.textContent || "").trim().toUpperCase();
            if (text === "OK" || text === "确认" || text === "确定" || text === "SUBMIT" || text === "提交" || text === "是") {
              btn.click(); clicked = true;
            }
          });
        }

        return clicked;
      });
      if (clicked) { clickResult = true; break; }
    } catch (_) {}
  }

  // 2. 强制清理弹窗容器
  const forceCleaned = await forceCleanupPopups(page);

  // 3. 自诊断：首次弹窗时输出弹窗 HTML 结构（遍历所有 frame）
  if (popupCount === 1) {
    try {
      const allResults = [];
      for (const frame of page.frames()) {
        try {
          const popupDiagnosis = await frame.evaluate(() => {
            const popupIds = ['C_alert_confirm', 'alert_confirm', 'alert_show', 'system_popup', 'alert_kick', 'C_alert_ok', 'alert_ok'];
            const results = [];
            for (const id of popupIds) {
              const el = document.getElementById(id);
              if (el) {
                results.push({
                  id,
                  hasOnClass: el.classList.contains('on'),
                  display: getComputedStyle(el).display,
                  visibility: getComputedStyle(el).visibility,
                  opacity: getComputedStyle(el).opacity,
                  innerHTML: el.innerHTML.substring(0, 300)
                });
              }
            }
            return results.length > 0 ? {
              frameUrl: window.location.href,
              popups: results,
              bodySample: (document.body?.textContent || "").substring(0, 200)
            } : null;
          });
          if (popupDiagnosis) allResults.push(popupDiagnosis);
        } catch (_) {}
      }
      if (allResults.length > 0) {
        console.log("[登录诊断] 当前检测到的弹窗HTML结构:", JSON.stringify(allResults, null, 2));
      }
    } catch (_) {}
  }

  return clickResult || forceCleaned;
}

async function ensureLogin() {
  // 用户主动发起登录/启动监控，允许浏览器正常启动
  browserExplicitlyClosed = false;
  const _loginStart = Date.now();
  // 登录并发保护
  if (loginInProgress) {
    console.log("[cornerCrawler] 登录正在进行中，等待...");
    const _waitStart = Date.now();
    const MAX_WAIT = 15000;
    while (loginInProgress) {
      if (Date.now() - _waitStart > MAX_WAIT) {
        console.warn("[cornerCrawler] loginInProgress 超时(15s)，强制释放锁");
        loginInProgress = false;
        break;
      }
      await new Promise(r => setTimeout(r, 1000));
    }
    const existingPage = getSharedPage();
    if (existingPage && isBrowserActive()) {
      try {
        await existingPage.url();
        return existingPage;
      } catch (e) {}
    }
  }

  const bi = await getSharedBrowser(false);
  console.log("[cornerCrawler] [耗时] getSharedBrowser: " + (Date.now() - _loginStart) + "ms");

  // ✗ 浏览器启动失败
  if (!bi) {
    lastLoginErrorDetail = "browser_launch_failed:浏览器启动失败，请检查 Chromium 是否安装，或设置 CRAWLER_HEADLESS=false 试试";
    console.error("[cornerCrawler] 浏览器未启动，登录中止");
    return null;
  }

  // ★ Cookie 快速登录：尝试从磁盘恢复会话
  const savedCookies = loadCookiesFromDisk();
  if (savedCookies && savedCookies.length > 0) {
    try {
      console.log("[cornerCrawler] 尝试 Cookie 快速登录...");
      const quickPage = await bi.newPage();
      await quickPage.setUserAgent(process.env.USE_MOBILE_UA === "true" ? MOBILE_UA : "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36");
      await quickPage.setViewport({ width: 1920, height: 1400 });
      for (const ck of savedCookies) {
        try { await quickPage.setCookie(ck); } catch (_) {}
      }
      await quickPage.goto(HG_URL, { waitUntil: "domcontentloaded", timeout: 10000 });
      await new Promise(r => setTimeout(r, 1000));
      const isValid = await quickPage.evaluate(() => {
        const body = document.body?.textContent || "";
        const hasInPlay = body.includes("In-Play") && body.includes("Soccer");
        const sportBtn = document.getElementById("old_ft_live_league");
        const hasSport = sportBtn && getComputedStyle(sportBtn).display !== 'none' && getComputedStyle(sportBtn).visibility !== 'hidden';
        const hasMyEvents = body.includes("My Events");
        // 检测简易密码页面（#back_login 可见说明在简易密码页面，不应认为已登录）
        const backLoginBtn = document.getElementById("back_login");
        const hasPasscodePage = backLoginBtn && getComputedStyle(backLoginBtn).display !== 'none' && getComputedStyle(backLoginBtn).visibility !== 'hidden';
        if (hasPasscodePage) return false;
        return hasInPlay || hasSport || hasMyEvents;
      });
      if (isValid) {
        setSharedPage(quickPage);
        console.log("[cornerCrawler] Cookie 快速登录成功: " + (Date.now() - _loginStart) + "ms");
        return quickPage;
      }
      // ★ Cookie 有效但可能在简易密码页面，尝试处理
      const passcodeResult = await handlePasscodePage(quickPage);
      if (passcodeResult.detected && passcodeResult.handled) {
        setSharedPage(quickPage);
        console.log("[cornerCrawler] Cookie 登录后处理了简易密码页面: " + (Date.now() - _loginStart) + "ms");
        return quickPage;
      }
      console.log("[cornerCrawler] Cookie 已过期，降级到完整登录");
      await quickPage.close();
    } catch (e) {
      console.warn("[cornerCrawler] Cookie 快速登录失败:", e.message);
    }
  }

  // 如果已有活跃页面且已登录，直接复用
  const existingPage = getSharedPage();
  if (existingPage && isBrowserActive()) {
    try {
      // 检查页面是否仍然可用
      const url = await existingPage.url();
      console.log("[cornerCrawler] 复用已有登录会话，当前页面:", url);
      // ★ 检查是否在简易密码页面
      const passcodeResult = await handlePasscodePage(existingPage);
      if (passcodeResult.detected && passcodeResult.handled) {
        console.log("[cornerCrawler] 复用页面时处理了简易密码页面");
      }
      return existingPage;
    } catch (e) {
      console.warn("[cornerCrawler] 页面不可用，需要重新登录:", e.message);
      setSharedPage(null);
    }
  }

  // 检查是否已登录（浏览器活跃但页面可能已关闭）
  if (isLoggedIn()) {
    console.log("[cornerCrawler] 浏览器已登录但页面为空，创建新页面...");
    loginInProgress = true;
    try {
    const page = await bi.newPage();
    await page.setUserAgent(process.env.USE_MOBILE_UA === "true" ? MOBILE_UA : "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36");
    await page.setViewport({ width: 1920, height: 1400 });
    await page.goto(HG_URL, { waitUntil: "domcontentloaded", timeout: 30000 });
    // 条件等待：检测登录表单或主页特征出现（替代固定 sleep 4s）
    try {
      await page.waitForFunction(() => {
        const usr = document.getElementById('usr');
        const body = document.body?.textContent || '';
        return (usr && getComputedStyle(usr).display !== 'none') ||
               body.includes('In-Play') || body.includes('Soccer') ||
               body.includes('My Events') || body.includes('Balance');
      }, { timeout: 8000 });
    } catch (_) {
      // 超时也继续，不阻塞
    }
    // ★ 检查是否跳转到简易密码页面
    const passcodeResult = await handlePasscodePage(page);
    if (passcodeResult.detected && passcodeResult.handled) {
      console.log("[cornerCrawler] 新页面处理了简易密码页面");
    }
    setSharedPage(page);
    console.log("[cornerCrawler] 新页面创建完成");
    return page;
    } finally {
      loginInProgress = false;
    }
  }

  
  // ========== 完整登录（含 3 次重试，5s 间隔） ==========
  const MAX_LOGIN_RETRIES = 3;
  const LOGIN_RETRY_DELAY = 5000;

  for (let loginAttempt = 1; loginAttempt <= MAX_LOGIN_RETRIES; loginAttempt++) {
    if (loginAttempt > 1) {
      console.log("[cornerCrawler] === 登录重试 " + loginAttempt + "/" + MAX_LOGIN_RETRIES + "，等待 " + (LOGIN_RETRY_DELAY/1000) + "s...");
      await new Promise(r => setTimeout(r, LOGIN_RETRY_DELAY));
      try { await closeSharedBrowser(); } catch (e) {}
      await new Promise(r => setTimeout(r, 2000));
      const biRetry = await getSharedBrowser(false);
      if (!biRetry) {
        lastLoginErrorDetail = "browser_launch_failed_retry";
        console.error("[cornerCrawler] 重试时浏览器启动失败");
        continue;
      }
    }

    loginInProgress = true;
    let page = null;
    try {
      console.log("[cornerCrawler] 正在登录 HG... (attempt " + loginAttempt + "/" + MAX_LOGIN_RETRIES + ")");
      page = await bi.newPage();

      await page.setUserAgent(
        process.env.USE_MOBILE_UA === "true" ? MOBILE_UA : "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36"
      );
      await page.setViewport({ width: 1920, height: 1400 });
      await page.evaluateOnNewDocument(() => {
        Object.defineProperty(navigator, "webdriver", { get: () => false });
        Object.defineProperty(navigator, "plugins", { get: () => [1, 2, 3, 4, 5] });
      });

      // ★ 第0步：清除浏览器 Cookie 和缓存（对标 autoLogin.js L546-553，避免旧会话干扰）
      console.log("[登录步骤] 第0步：清除浏览器 Cookie 和缓存");
      try {
        const client = await page.target().createCDPSession();
        await client.send("Network.clearBrowserCookies");
        await client.send("Network.clearBrowserCache");
        console.log("[登录步骤] 已清除浏览器 Cookie 和缓存");
      } catch (e) {
        console.warn("[登录步骤] 清除 Cookie/缓存失败:", e.message);
      }

      // 第1步：导航到登录页
      console.log("[登录步骤] 第1步：导航到登录页");
      await page.goto(HG_URL, { waitUntil: "domcontentloaded", timeout: 30000 });
      // 条件等待：检测登录表单或主页特征出现（替代固定 sleep 4s）
      try {
        await page.waitForFunction(() => {
          const usr = document.getElementById('usr');
          const body = document.body?.textContent || '';
          return (usr && getComputedStyle(usr).display !== 'none') ||
                 body.includes('In-Play') || body.includes('Soccer') ||
                 body.includes('My Events') || body.includes('Balance');
        }, { timeout: 8000 });
      } catch (_) {
        // 超时也继续，不阻塞
      }

      const username = (runtimeCredentials && runtimeCredentials.username) || HG_USERNAME;
      const password = (runtimeCredentials && runtimeCredentials.password) || HG_PASSWORD;

      console.log("[登录步骤] 第1步：输入账号密码");
      // ★ HG 网站登录表单可能在 iframe 中，需要遍历所有 frame
      let targetFrame = page.mainFrame();
      for (const frame of page.frames()) {
        try {
          const hasUsr = await frame.$("#usr, input[name='username']");
          if (hasUsr) {
            targetFrame = frame;
            console.log("[登录步骤] 在 " + (frame === page.mainFrame() ? "主frame" : "iframe") + " 中找到登录表单");
            break;
          }
        } catch (_) {}
      }
      // ★ 使用 nativeInputValueSetter（与 autoLogin.js 一致），确保 React 等框架能检测到值变化
      try {
        await targetFrame.evaluate((usr, pw) => {
          const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
            window.HTMLInputElement.prototype, "value"
          ).set;
          const u = document.querySelector("#usr, input[name='username'], input[type='text']");
          if (u) {
            u.focus();
            nativeInputValueSetter.call(u, usr);
            u.dispatchEvent(new Event("input", { bubbles: true }));
            u.dispatchEvent(new Event("change", { bubbles: true }));
          }
          const p = document.querySelector("#pwd, input[name='password'], input[type='password']");
          if (p) {
            p.focus();
            nativeInputValueSetter.call(p, pw);
            p.dispatchEvent(new Event("input", { bubbles: true }));
            p.dispatchEvent(new Event("change", { bubbles: true }));
          }
        }, username, password);
        // 验证凭据是否已填入
        const filledValues = await targetFrame.evaluate(() => {
          const u = document.querySelector("#usr, input[name='username'], input[type='text']");
          const p = document.querySelector("#pwd, input[name='password'], input[type='password']");
          return { usr: u ? u.value : 'NOT_FOUND', pwd: p ? (p.value ? '***' : 'EMPTY') : 'NOT_FOUND' };
        });
        console.log("[登录步骤] 凭据填入验证: usr=" + filledValues.usr + ", pwd=" + filledValues.pwd);
      } catch (e) {
        // 回退：使用 Puppeteer type 方法
        console.log("[登录步骤] evaluate 填写失败，回退到 type 方式:", e.message);
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
          console.log("[登录步骤] type 方式也失败:", e2.message);
        }
      }

      // 勾选「记住我」
      try {
        const rememberCheckbox = await page.$('#remember');
        if (rememberCheckbox) {
          const isChecked = await page.evaluate(el => el.checked, rememberCheckbox);
          if (!isChecked) {
            await rememberCheckbox.click();
            console.log("[cornerCrawler] 已勾选「记住我」");
          }
        }
      } catch (e) {}

      // 点击登录按钮（使用 Puppeteer click，与 autoLogin.js 一致）
      await new Promise(r => setTimeout(r, 500));
      console.log("[登录步骤] 第2步：点击登录按钮");
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
                console.log("[登录步骤] 已点击登录按钮 (" + sel + ")");
                break;
              } catch (clickErr) {
                // Puppeteer click 失败，尝试 JS evaluate 点击
                await targetFrame.evaluate((selector) => {
                  const el = document.querySelector(selector);
                  if (el) el.click();
                }, sel);
                btnClicked = true;
                console.log("[登录步骤] 已通过 JS 点击登录按钮 (" + sel + ")");
                break;
              }
            }
          }
        } catch (e) {}
      }
      if (!btnClicked) {
        console.log("[登录步骤] ⚠️ 未找到可点击的登录按钮，尝试 JS 点击 #btn_login");
        await targetFrame.evaluate(() => {
          const btn = document.getElementById('btn_login') || document.querySelector("input[type='submit']");
          if (btn) btn.click();
        });
      }

      // 轮询检测登录结果（最多 60 秒）
      console.log("[登录步骤] 第5步：轮询等待登录结果（最多60s）");
      let loginResult = null;
      const popupCount = { passcodePage: 0, passcodeDialog: 0, kickedOut: 0, popupActive: 0 };
      const MAX_POPUP = 5;
      const loginStartTime = Date.now();
      const LOGIN_POLL_TIMEOUT = 60000;
      let waitResponseCount = 0;
      let loginPageCount = 0;
      // ★ 死循环断路器：追踪连续相同状态
      let lastState = '';
      let consecutiveSameState = 0;
      const MAX_CONSECUTIVE_SAME_STATE = 10;

      while (Date.now() - loginStartTime < LOGIN_POLL_TIMEOUT) {
        await new Promise(r => setTimeout(r, 1000));
        const detected = await detectLoginState(page);
        if (!detected || !detected.state) continue;

        // ★ 死循环断路器：连续相同状态检测
        if (detected.state === lastState && (detected.state === 'LOGIN_PAGE' || detected.state === 'POPUP_ACTIVE' || detected.state === 'WAIT_RESPONSE')) {
          consecutiveSameState++;
          if (consecutiveSameState >= MAX_CONSECUTIVE_SAME_STATE) {
            console.log("[登录诊断] 断路器触发: 连续" + consecutiveSameState + "次检测到 " + detected.state + "，执行刷新页面");
            try {
              // 刷新页面 + 重新清除 Cookie/缓存
              try {
                const client = await page.target().createCDPSession();
                await client.send("Network.clearBrowserCookies");
                await client.send("Network.clearBrowserCache");
                console.log("[登录诊断] 断路器: 已重新清除 Cookie/缓存");
              } catch (_) {}
              await page.reload({ waitUntil: 'domcontentloaded', timeout: 15000 }).catch(() => {});
              await new Promise(r => setTimeout(r, 3000));
              // 重新输入凭据+点击登录
              for (const frame of page.frames()) {
                try {
                  const filled = await frame.evaluate((usr, pw) => {
                    const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
                      window.HTMLInputElement.prototype, "value"
                    ).set;
                    const u = document.querySelector("#usr, input[name='username'], input[type='text']");
                    const p = document.querySelector("#pwd, input[name='password'], input[type='password']");
                    if (u) {
                      u.focus();
                      nativeInputValueSetter.call(u, usr);
                      u.dispatchEvent(new Event("input", { bubbles: true }));
                      u.dispatchEvent(new Event("change", { bubbles: true }));
                    }
                    if (p) {
                      p.focus();
                      nativeInputValueSetter.call(p, pw);
                      p.dispatchEvent(new Event("input", { bubbles: true }));
                      p.dispatchEvent(new Event("change", { bubbles: true }));
                    }
                    return !!(u && p);
                  }, username, password);
                  if (filled) {
                    await new Promise(r => setTimeout(r, 500));
                    const btn = await frame.$("#btn_login, input[type='submit']");
                    if (btn) {
                      await btn.click();
                    } else {
                      await frame.evaluate(() => {
                        const b = document.getElementById('btn_login') || document.querySelector("input[type='submit']");
                        if (b) b.click();
                      });
                    }
                    console.log("[登录诊断] 断路器: 已重新输入凭据并点击登录");
                    break;
                  }
                } catch (_) {}
              }
              consecutiveSameState = 0; // 重置计数器
            } catch (e) {
              console.warn("[登录诊断] 断路器刷新失败:", e.message);
            }
            // 如果刷新后仍连续相同状态，再给 5 次机会后标记失败
            if (consecutiveSameState >= MAX_CONSECUTIVE_SAME_STATE + 5) {
              console.log("[登录步骤] ❌ 断路器刷新后仍无法突破，登录失败");
              lastLoginErrorDetail = "dead_loop_breaker:连续" + consecutiveSameState + "次" + detected.state;
              await saveDebugScreenshot(page, "deadloop-" + loginAttempt);
              loginResult = { success: false };
              break;
            }
          }
        } else {
          consecutiveSameState = 0;
        }
        lastState = detected.state;

        // 45s 警告
        const elapsed = Date.now() - loginStartTime;
        if (elapsed > 45000 && elapsed < 46000) {
          console.log("[登录诊断] 登录已耗时 45s，即将超时。当前状态: " + detected.state + " (" + detected.detail + ")");
        }

        switch (detected.state) {
          case 'PASSCODE_PAGE':
            popupCount.passcodePage++;
            if (popupCount.passcodePage > 3) {
              console.log("[登录步骤] ❌ 简易密码页面超过 3 次，登录失败");
              lastLoginErrorDetail = "popup_loop_timeout(passcodePage)";
              await saveDebugScreenshot(page, "passcode-loop-" + loginAttempt);
              loginResult = { success: false };
              break;
            }
            console.log("[登录步骤] 检测页面状态 → 简易密码设置页面 (" + popupCount.passcodePage + "/3)");
            // ★ 在所有 frame 中查找并点击 #back_login
            for (const frame of page.frames()) {
              try {
                const clicked = await frame.evaluate(() => {
                  const btn = document.querySelector("#back_login");
                  if (btn) { btn.click(); return true; }
                  return false;
                });
                if (clicked) break;
              } catch (_) {}
            }
            await new Promise(r => setTimeout(r, 1500));
            console.log("[登录步骤] 已点击普通登入，等待登录页面加载后重新登录...");
            // 重新输入账号密码（遍历所有 frame，使用 nativeInputValueSetter）
            const reUser = (runtimeCredentials && runtimeCredentials.username) || HG_USERNAME;
            const rePwd = (runtimeCredentials && runtimeCredentials.password) || HG_PASSWORD;
            for (const frame of page.frames()) {
              try {
                const filled = await frame.evaluate((usr, pw) => {
                  const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
                    window.HTMLInputElement.prototype, "value"
                  ).set;
                  const u = document.querySelector("#usr, input[name='username'], input[type='text']");
                  const p = document.querySelector("#pwd, input[name='password'], input[type='password']");
                  if (u) {
                    u.focus();
                    nativeInputValueSetter.call(u, usr);
                    u.dispatchEvent(new Event("input", { bubbles: true }));
                    u.dispatchEvent(new Event("change", { bubbles: true }));
                  }
                  if (p) {
                    p.focus();
                    nativeInputValueSetter.call(p, pw);
                    p.dispatchEvent(new Event("input", { bubbles: true }));
                    p.dispatchEvent(new Event("change", { bubbles: true }));
                  }
                  return !!(u && p);
                }, reUser, rePwd);
                if (filled) {
                  await new Promise(r => setTimeout(r, 500));
                  // ★ 使用 Puppeteer click（与 autoLogin.js 一致）
                  const btn = await frame.$("#btn_login, input[type='submit']");
                  if (btn) {
                    await btn.click();
                    console.log("[登录步骤] 已通过 Puppeteer click 重新点击登录按钮");
                  } else {
                    await frame.evaluate(() => {
                      const b = document.getElementById('btn_login') || document.querySelector("input[type='submit']");
                      if (b) b.click();
                    });
                  }
                  break;
                }
              } catch (_) {}
            }
            console.log("[登录步骤] 已重新输入账号密码并点击登录");
            break;

          case 'KICKED_OUT':
            popupCount.kickedOut++;
            if (popupCount.kickedOut > 2) {
              console.log("[登录步骤] ❌ 被踢出超过 2 次，登录失败");
              lastLoginErrorDetail = "login_kicked_out:账号在其他地方登录";
              await saveDebugScreenshot(page, "kicked-out-" + loginAttempt);
              loginResult = { success: false };
              break;
            }
            console.log("[登录步骤] 检测页面状态 → 被踢出 (" + popupCount.kickedOut + "/2)");
            // ★ 遍历所有 frame 点击 #kick_ok_btn
            for (const frame of page.frames()) {
              try {
                const clicked = await frame.evaluate(() => {
                  const btn = document.querySelector("#kick_ok_btn");
                  if (btn) { btn.click(); return true; }
                  return false;
                });
                if (clicked) break;
              } catch (_) {}
            }
            await new Promise(r => setTimeout(r, 1000));
            await forceCleanupPopups(page);
            console.log("[登录步骤] 已处理被踢出弹窗");
            break;

          case 'PASSCODE_DIALOG':
            // ★ 新增：简易密码确认弹窗专门处理（对标 autoLogin.js PASSCODE_DIALOG）
            popupCount.passcodeDialog++;
            if (popupCount.passcodeDialog > MAX_POPUP) {
              console.log("[登录步骤] ❌ 简易密码确认弹窗超过 " + MAX_POPUP + " 次，登录失败");
              lastLoginErrorDetail = "popup_loop_timeout(passcodeDialog)";
              await saveDebugScreenshot(page, "passcode-dialog-loop-" + loginAttempt);
              loginResult = { success: false };
              break;
            }
            console.log("[登录步骤] 检测页面状态 → 简易密码确认弹窗 (" + popupCount.passcodeDialog + "/" + MAX_POPUP + ")");
            const dialogResult = await handlePasscodeDialog(page);
            if (dialogResult.action === 'success') {
              console.log("[登录步骤] ✅ 弹窗关闭后检测到已登录！");
              loginResult = { success: true };
              break;
            }
            if (dialogResult.action === 'retry_login') {
              // 弹窗关闭后需要重新登录
              console.log("[登录步骤] 弹窗已关闭，等待页面稳定后重新登录...");
              await new Promise(r => setTimeout(r, 2000));
              // 重新输入凭据+点击登录
              for (const frame of page.frames()) {
                try {
                  const filled = await frame.evaluate((usr, pw) => {
                    const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
                      window.HTMLInputElement.prototype, "value"
                    ).set;
                    const u = document.querySelector("#usr, input[name='username'], input[type='text']");
                    const p = document.querySelector("#pwd, input[name='password'], input[type='password']");
                    if (u) {
                      u.focus();
                      nativeInputValueSetter.call(u, usr);
                      u.dispatchEvent(new Event("input", { bubbles: true }));
                      u.dispatchEvent(new Event("change", { bubbles: true }));
                    }
                    if (p) {
                      p.focus();
                      nativeInputValueSetter.call(p, pw);
                      p.dispatchEvent(new Event("input", { bubbles: true }));
                      p.dispatchEvent(new Event("change", { bubbles: true }));
                    }
                    return !!(u && p);
                  }, username, password);
                  if (filled) {
                    await new Promise(r => setTimeout(r, 500));
                    const btn = await frame.$("#btn_login, input[type='submit']");
                    if (btn) {
                      await btn.click();
                    } else {
                      await frame.evaluate(() => {
                        const b = document.getElementById('btn_login') || document.querySelector("input[type='submit']");
                        if (b) b.click();
                      });
                    }
                    console.log("[登录步骤] 弹窗关闭后已重新输入凭据并点击登录");
                    break;
                  }
                } catch (_) {}
              }
            }
            break;

          case 'POPUP_ACTIVE':
            popupCount.popupActive++;
            if (popupCount.popupActive > MAX_POPUP) {
              console.log("[登录步骤] ❌ 弹窗超过 " + MAX_POPUP + " 次，强制清理并登录失败");
              await forceCleanupPopups(page);
              lastLoginErrorDetail = "popup_loop_timeout(popupActive)";
              await saveDebugScreenshot(page, "popup-loop-" + loginAttempt);
              loginResult = { success: false };
              break;
            }
            await handlePopupWithDiagnostics(page, popupCount.popupActive, MAX_POPUP);
            await new Promise(r => setTimeout(r, 1000));
            break;

          case 'LOGGED_IN':
            console.log("[登录步骤] 第6步：✅ 登录成功！(" + detected.detail + ")");
            loginResult = { success: true };
            break;

          case 'LOGIN_PAGE':
            // 还在登录页面，可能凭据未正确填入或登录按钮未生效
            loginPageCount = (loginPageCount || 0) + 1;
            if (loginPageCount <= 3) {
              console.log("[登录步骤] 检测页面状态 → 登录页面，尝试重新输入凭据并点击登录 (" + loginPageCount + "/3)");
              try {
                // 遍历所有 frame 重新输入凭据
                for (const frame of page.frames()) {
                  try {
                    const filled = await frame.evaluate((usr, pw) => {
                      const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
                        window.HTMLInputElement.prototype, "value"
                      ).set;
                      const u = document.querySelector("#usr, input[name='username'], input[type='text']");
                      const p = document.querySelector("#pwd, input[name='password'], input[type='password']");
                      if (u) {
                        u.focus();
                        nativeInputValueSetter.call(u, usr);
                        u.dispatchEvent(new Event("input", { bubbles: true }));
                        u.dispatchEvent(new Event("change", { bubbles: true }));
                      }
                      if (p) {
                        p.focus();
                        nativeInputValueSetter.call(p, pw);
                        p.dispatchEvent(new Event("input", { bubbles: true }));
                        p.dispatchEvent(new Event("change", { bubbles: true }));
                      }
                      return !!(u && p);
                    }, username, password);
                    if (filled) {
                      await new Promise(r => setTimeout(r, 500));
                      // 使用 Puppeteer click 点击登录按钮
                      const btn = await frame.$("#btn_login, input[type='submit']");
                      if (btn) {
                        await btn.click();
                        console.log("[登录步骤] 已重新点击登录按钮");
                      } else {
                        await frame.evaluate(() => {
                          const b = document.getElementById('btn_login') || document.querySelector("input[type='submit']");
                          if (b) b.click();
                        });
                      }
                      break;
                    }
                  } catch (_) {}
                }
              } catch (_) {}
            } else if (loginPageCount === 4) {
              // 第 4 次仍在登录页面，输出诊断信息
              console.log("[登录步骤] 检测页面状态 → 登录页面（已重试 3 次，输出诊断）");
              try {
                // ★ 遍历所有 frame 输出诊断
                for (const frame of page.frames()) {
                  try {
                    const loginDiag = await frame.evaluate(() => {
                      const u = document.querySelector("#usr, input[name='username']");
                      const p = document.querySelector("#pwd, input[name='password']");
                      const btn = document.querySelector("#btn_login, input[type='submit']");
                      const errEl = document.getElementById("text_error");
                      if (!u && !p) return null; // 此 frame 无登录表单
                      return {
                        frameUrl: window.location.href,
                        usrValue: u ? u.value : 'NOT_FOUND',
                        pwdValue: p ? (p.value ? '***' : 'EMPTY') : 'NOT_FOUND',
                        btnExists: !!btn,
                        btnVisible: btn ? (btn.offsetParent !== null) : false,
                        errorText: errEl ? errEl.textContent.trim() : '',
                        url: window.location.href
                      };
                    });
                    if (loginDiag) {
                      console.log("[登录诊断] 登录页面状态:", JSON.stringify(loginDiag, null, 2));
                    }
                  } catch (_) {}
                }
              } catch (_) {}
            } else {
              console.log("[登录步骤] 检测页面状态 → 登录页面（等待中）");
            }
            break;

          case 'LOGIN_ERROR':
            const errMsg = detected.detail || "未知错误";
            console.error("[登录步骤] ❌ 登录失败（密码错误）: " + errMsg);
            lastLoginErrorDetail = "login_wrong_password:" + errMsg;
            await saveDebugScreenshot(page, "error-" + loginAttempt);
            loginResult = { success: false };
            break;

          case 'WAIT_RESPONSE':
          default:
            waitResponseCount++;
            // 每 5 次输出一次诊断信息
            if (waitResponseCount % 5 === 0) {
              console.log("[登录步骤] 检测页面状态 → 等待响应 (" + waitResponseCount + "次, " + Math.round((Date.now() - loginStartTime) / 1000) + "s)");
              // 每 10 次输出页面诊断
              if (waitResponseCount % 10 === 0) {
                try {
                  const pageDiag = await page.evaluate(() => ({
                    url: window.location.href,
                    bodySample: (document.body?.textContent || "").substring(0, 200),
                    visiblePopups: Array.from(document.querySelectorAll('[id*="alert"], [id*="popup"], [class*="popup"]')).filter(el => {
                      const s = getComputedStyle(el);
                      return s.display !== 'none' && s.visibility !== 'hidden' && el.offsetWidth > 0;
                    }).map(el => ({ id: el.id, class: el.className.substring(0, 50), text: (el.textContent || "").substring(0, 100) }))
                  }));
                  console.log("[登录诊断] 页面状态:", JSON.stringify(pageDiag, null, 2));
                } catch (_) {}
              }
            }
            break;
        }

        // 如果有结果，退出循环
        if (loginResult) break;
      }

      // 登录超时 => 输出诊断摘要
      if (!loginResult) {
        console.error("[登录诊断] 登录超时（60s），诊断摘要: " + JSON.stringify({
          passcodePage: popupCount.passcodePage,
          passcodeDialog: popupCount.passcodeDialog,
          kickedOut: popupCount.kickedOut,
          popupActive: popupCount.popupActive,
          loginPageCount,
          waitResponseCount,
          lastState,
          consecutiveSameState
        }));
        lastLoginErrorDetail = "login_timeout:登录超时（60s）";
        await saveDebugScreenshot(page, "timeout-" + loginAttempt);
        continue;
      }

      // 登录成功
      console.log("[cornerCrawler] [耗时] 登录完成: " + (Date.now() - _loginStart) + "ms");
      console.log("[cornerCrawler] ✅ 登录成功！");
      lastLoginErrorDetail = null;
      await saveDebugScreenshot(page, "success");

      // ★ 登录成功后，监听 chk_login 响应来捕获 uid/ver（用于 API 模式跳过导航）
      try {
        page.on("response", async (response) => {
          const url = response.url();
          if (url.includes("chk_login")) {
            try {
              const text = await response.text();
              const uidMatch = text.match(/<uid>([^<]+)<\/uid>/);
              if (uidMatch) {
                const verMatch = url.match(/[?&]ver=([^&]+)/);
                cachedSessionInfo = {
                  uid: uidMatch[1],
                  ver: verMatch ? verMatch[1] : (cachedSessionInfo?.ver || ""),
                  domain: new URL(url).origin
                };
                console.log("[cornerCrawler] 登录时从 chk_login 捕获 uid=" + cachedSessionInfo.uid.substring(0, 10) + "..., ver=" + cachedSessionInfo.ver);
              }
            } catch (e) {}
          }
        });
      } catch (e) {}

      // ★ 登录成功后，主动从页面提取 uid/ver 并写入 credentialManager（对标 autoLogin.js）
      // 不依赖 chk_login 响应拦截（异步的，可能延迟或丢失）
      try {
        let extractedUid = null;
        let extractedVer = null;

        // 先等待 2s，让 chk_login 响应拦截有机会先捕获 uid/ver
        await new Promise(r => setTimeout(r, 2000));

        // 遍历所有 frame 提取 uid/ver
        for (const frame of page.frames()) {
          try {
            const info = await frame.evaluate(() => {
              try {
                const uid = top.uid || window.uid || "";
                const ver = top.ver || window.ver || "";
                const chDomain = window._CHDomain || "";
                return { uid, ver, chDomain };
              } catch (e) { return { uid: "", ver: "", chDomain: "" }; }
            });
            if (info.uid && info.ver) {
              extractedUid = info.uid;
              extractedVer = info.ver;
              console.log("[凭证同步] 从页面 DOM 提取 uid/ver 成功 (frame: " + frame.url().substring(0, 60) + ")");
              break;
            }
          } catch (_) {}
        }
        // 如果 DOM 提取失败，使用 chk_login 拦截的缓存
        if (!extractedUid && cachedSessionInfo?.uid) {
          extractedUid = cachedSessionInfo.uid;
          extractedVer = cachedSessionInfo.ver;
          console.log("[凭证同步] 使用 chk_login 拦截的 uid/ver");
        }
        if (extractedUid && extractedVer) {
          updateCredentials({ uid: extractedUid, ver: extractedVer, apiDomain: null });
          console.log("[凭证同步] uid=" + extractedUid.substring(0, 10) + "..., ver=" + extractedVer.substring(0, 10) + "..., 写入 credentialManager 成功（apiDomain 已清理）");
        } else {
          console.warn("[凭证同步] 未能提取 uid/ver，后续纯 HTTP 请求可能失败");
        }
      } catch (e) {
        console.warn("[凭证同步] 凭证同步失败:", e.message);
      }

      try {
        const saved = await page.cookies();
        setLoginCookies(saved);
        saveCookiesToDisk(saved);
        console.log("[cornerCrawler] Cookie 已保存 (" + saved.length + " 条)");
      } catch (_) {}
      setSharedPage(page);
      console.log("[cornerCrawler] [耗时] ensureLogin 完成: " + (Date.now() - _loginStart) + "ms");
      await extractBalance(page);
      console.log("[cornerCrawler] 登录完成，页面已就绪");
      loginInProgress = false;
      return page;

    } catch (e) {
      console.error("[cornerCrawler] 登录异常 (attempt " + loginAttempt + "/" + MAX_LOGIN_RETRIES + "):", e.message);
      lastLoginErrorDetail = "login_exception:" + e.message;
    } finally {
      loginInProgress = false;
      // 仅在登录失败时关闭 page，成功时已被 setSharedPage 接管
      if (page && !page.isClosed() && getSharedPage() !== page) {
        try { await page.close(); } catch (_) {}
      }
    }
  }

  // 所有重试都失败
  console.error("[cornerCrawler] 登录失败: 已重试 " + MAX_LOGIN_RETRIES + " 次，放弃");
  return null;
}

// ======================== 导航到角球页面 ========================
// ======================== 导航到角球页面（简化版：Soccer → HDP&O/U → Corners） ========================
export async function navigateToCorners(page) {
  console.log("[cornerCrawler] ===== Navigating to Corner page (simplified) =====");

  // ========== Soccer 点击 + 容器等待（含 3 次重试，30s 间隔） ==========
  const MAX_NAV_RETRIES = 3;
  const NAV_RETRY_DELAY = 30000;

  for (let navAttempt = 1; navAttempt <= MAX_NAV_RETRIES; navAttempt++) {
    if (navAttempt > 1) {
      console.log("[cornerCrawler] === 导航重试 " + navAttempt + "/" + MAX_NAV_RETRIES + "，等待 " + (NAV_RETRY_DELAY/1000) + "s...");
      await new Promise(r => setTimeout(r, NAV_RETRY_DELAY));
      await handlePopups(page);
    }

    // Step 1: 点击 Soccer
    console.log("[cornerCrawler] Step 1: 点击 Soccer... (attempt " + navAttempt + "/" + MAX_NAV_RETRIES + ")");
    try {
      await page.evaluate(() => {
        const btn = document.getElementById("old_ft_live_league");
        if (btn) { btn.scrollIntoView({block:"center"}); btn.click(); }
      });
    } catch (clickErr) {
      if (clickErr.message && clickErr.message.includes("Execution context was destroyed")) {
        console.log("[cornerCrawler] 页面上下文销毁，尝试重建引用...");
        try {
          const newPage = getSharedPage();
          if (newPage) {
            page = newPage;
            await page.evaluate(() => {
              const btn = document.getElementById("old_ft_live_league");
              if (btn) { btn.scrollIntoView({block:"center"}); btn.click(); }
            });
          }
        } catch (retryErr) {
          console.log("[cornerCrawler] 重建后仍失败:", retryErr.message);
        }
      } else {
        console.log("[cornerCrawler] Soccer 点击失败:", clickErr.message);
      }
    }

    // 等待容器渲染
    try {
      await waitWithKeepAlive(page, () => {
        return document.querySelectorAll('div.box_lebet_odd, div.box_lebet, div.bet_box').length > 0;
      }, { timeout: 15000 });
      console.log("[cornerCrawler] Soccer 比赛容器已渲染");
      break;
    } catch(e) {
      console.log("[cornerCrawler] Soccer 容器等待超时 (attempt " + navAttempt + "/" + MAX_NAV_RETRIES + "): " + e.message);
      if (navAttempt >= MAX_NAV_RETRIES) {
        console.log("[cornerCrawler] 无 Soccer 比赛，终止（已重试 " + MAX_NAV_RETRIES + " 次）");
        return { success: false, source: "no-soccer", matchScores: {}, soccerMarkets: {}, noSoccer: true };
      }
    }
  }

  await randomDelay(2000, 4000);
  await handlePopups(page);
  // ★ 检测简易密码页面（Soccer 点击后可能触发跳转）
  await handlePasscodePage(page);


  // ========== Step 4: HDP & O/U ==========
  let soccerMarkets = {};
  let matchScores = {};
  const hasRnou = await page.evaluate(() => {
    const tab = document.getElementById('tab_rnou');
    if (!tab) return false;
    const style = getComputedStyle(tab);
    return style.display !== 'none' && style.visibility !== 'hidden';
  });
  if (hasRnou) {
    console.log("[cornerCrawler] Step 4: 点击 HDP & O/U 标签...");
    await page.evaluate(() => {
      const tab = document.getElementById('tab_rnou');
      if (tab) { tab.scrollIntoView({block:'center'}); tab.click(); }
    });
    await randomDelay(2000, 4000);
    await handlePopups(page);
    try {
      await waitWithKeepAlive(page, () => {
        const els = document.querySelectorAll('div.box_lebet_odd');
        if (els.length === 0) return false;
        for (const el of els) {
          const os = el.querySelector('span.text_odds');
          if (os) { const v = parseFloat(os.textContent || '0'); if (v > 0 && v < 100) return true; }
        }
        return false;
      }, { timeout: 10000 });
      console.log("[cornerCrawler] HDP&O/U 盘口已渲染");
    } catch(e) { console.log("[cornerCrawler] HDP&O/U 等待超时:", e.message); }
    await randomDelay(1500, 3000);

    // ★ 先从 HDP&O/U 页面捕获比赛比分（Soccer页面的 box_score 是真实比赛比分）
    try {
      const scores = await page.evaluate(() => {
        const result = {};
        const containers = document.querySelectorAll('div.box_lebet[class*="bet_type_"], div.box_lebet_l');
        for (const leftPanel of containers) {
          const htEl = leftPanel.querySelector('div.box_team.teamH span.text_team');
          const atEl = leftPanel.querySelector('div.box_team.teamC span.text_team');
          if (!htEl || !atEl) continue;
          const homeTeam = (htEl.textContent || '').trim();
          const awayTeam = (atEl.textContent || '').trim();
          if (!homeTeam || !awayTeam) continue;
          const scoreSpans = leftPanel.querySelectorAll('div.box_score span.text_point');
          if (scoreSpans.length >= 2) {
            const hs = parseInt((scoreSpans[0].textContent || '0').trim(), 10);
            const as = parseInt((scoreSpans[1].textContent || '0').trim(), 10);
            if (!isNaN(hs) && !isNaN(as)) {
              result[(homeTeam + '|' + awayTeam).toLowerCase()] = { homeScore: hs, awayScore: as };
            }
          }
        }
        return result;
      });
      Object.assign(matchScores, scores);
      console.log("[cornerCrawler] 从 HDP&O/U 页面捕获比分: " + Object.keys(matchScores).length + " 场");
    } catch(e) {
      console.log("[cornerCrawler] 比分捕获失败:", e.message);
    }

    // ★ 再捕获 HDP&O/U 盘口数据，传入比分数据
    soccerMarkets = await captureMainMarkets(page, matchScores);
    console.log("[cornerCrawler] HDP&O/U 市场: " + Object.keys(soccerMarkets).length + " 场");
  } else {
    console.log("[cornerCrawler] #tab_rnou 不可见，跳过 HDP&O/U");
  }

  // ========== Step 5: CORNERS ==========
  let cornerClicked = false;
  const hasCorners = await page.evaluate(() => {
    const tab = document.getElementById('tab_cn');
    if (!tab) return false;
    const style = getComputedStyle(tab);
    return style.display !== 'none' && style.visibility !== 'hidden';
  });
  if (hasCorners) {
    console.log("[cornerCrawler] Step 5: 点击 CORNERS 标签...");
    cornerClicked = await page.evaluate(() => {
      const tab = document.getElementById('tab_cn');
      if (tab) { tab.scrollIntoView({block:'center'}); tab.click(); return true; }
      return false;
    });
    await randomDelay(1500, 3000);
    try {
      await waitWithKeepAlive(page, () => {
        const oddsEls = document.querySelectorAll('div.box_lebet_odd');
        if (oddsEls.length === 0) return false;
        for (const od of oddsEls) {
          const text = od.textContent || '';
          if (text.includes('*')) continue;
          const oddsSpan = od.querySelector('span.text_odds');
          if (oddsSpan) {
            const val = parseFloat(oddsSpan.textContent || '0');
            if (val > 0 && val < 100) return true;
          }
        }
        return false;
      }, { timeout: 10000 });
      console.log("[cornerCrawler] CORNERS 盘口已渲染");
    } catch(e) { console.log("[cornerCrawler] CORNERS 等待超时:", e.message); }
    if (!cornerClicked) await randomDelay(2000, 4000);
  } else {
    console.log("[cornerCrawler] #tab_cn 不可见，跳过 CORNERS");
  }

  await handlePopups(page);
  // ★ 检测简易密码页面（CORNERS 点击后可能触发跳转）
  await handlePasscodePage(page);
  return { success: true, source: "simplified", matchScores, soccerMarkets, noSoccer: false };
}


// ======================== 解析 Soccer 页面 HDP/O/U 盘口 ========================
async function captureMainMarkets(page, matchScores = {}) {
  try {
    return await page.evaluate((scores) => {
      const markets = {};
      // ★ 中文→英文盘口类型映射
      const cm = {'大/小':'O/U','大小':'O/U','O/U':'O/U','得分大小':'O/U','Over/Under':'O/U','Goals O/U':'O/U','让球':'HDP','HDP':'HDP','Handicap':'HDP','上半场':'1H','1H':'1H','下半场':'2H','2H':'2H'};
      let currentLeague = '';
      const leaNameEl = document.getElementById('lea_name');
      if (leaNameEl) currentLeague = (leaNameEl.textContent || '').trim();
      const containers = document.querySelectorAll('div.box_lebet_top, div.box_lebet[class*="bet_type_"]');
      for (const box of containers) {
        let league = currentLeague;
        let prev = box.previousElementSibling;
        while (prev) {
          const lea = prev.querySelector('#lea_name, tt[id="lea_name"], [id="lea_name"]');
          if (lea) { league = (lea.textContent || '').trim(); break; }
          prev = prev.previousElementSibling;
        }
        // box_lebet_top 结构：球队在 div.box_lebet_l 中，盘口在 div.box_lebet_r 中
        // box_lebet[class*="bet_type_"] 结构：球队和盘口在同一容器中
        const leftPanel = box.querySelector('div.box_lebet_l') || box;
        const htEl = leftPanel.querySelector('div.box_team.teamH span.text_team');
        const atEl = leftPanel.querySelector('div.box_team.teamC span.text_team');
        if (!htEl || !atEl) continue;
        const homeTeam = (htEl.textContent || '').trim();
        const awayTeam = (atEl.textContent || '').trim();
        if (!homeTeam || !awayTeam) continue;
        const key = (homeTeam + '|' + awayTeam).toLowerCase();
        let time = '';
        const timeEl = leftPanel.querySelector('tt.text_time, [class*="text_time"]');
        if (timeEl) time = (timeEl.textContent || '').replace(/\s+/g, ' ').trim();
        const scoreData = scores[key] || {};
        const homeScore = typeof scoreData.homeScore === 'number' ? scoreData.homeScore : -1;
        const awayScore = typeof scoreData.awayScore === 'number' ? scoreData.awayScore : -1;
        const entry = { league, time, homeScore: homeScore >= 0 ? homeScore : null, awayScore: awayScore >= 0 ? awayScore : null, hdp: [], ou: [], hdpHalf: [], ouHalf: [] };

        // ★ 优先解析 hdpou_ft 结构（HDP&O/U 页面使用此结构）
        // 在 box_lebet_top 中，盘口在 div.box_lebet_r 中
        const rightPanel = box.querySelector('div.box_lebet_r') || box;
        const hdpouSections = rightPanel.querySelectorAll('div.form_lebet_hdpou');
        for (const section of hdpouSections) {
          const headSpan = section.querySelector('div.head_lebet span');
          if (!headSpan) continue;
          const rawLabel = (headSpan.textContent || '').trim();
          const marketLabel = cm[rawLabel] || rawLabel.toUpperCase();
          const isHalfSection = section.classList.contains('hdpou_1h');

          // 遍历所有非空的 col_hdpou，收集所有有效盘口
          const cols = section.querySelectorAll('div.col_hdpou');
          for (const col of cols) {
            if (col.classList.contains('odd_empty')) continue;
            const buttons = col.querySelectorAll('div.btn_hdpou_odd');
            if (buttons.length < 2) continue;
            const homeLine = (buttons[0].querySelector('tt.text_ballhead')?.textContent || '').trim();
            const homeOdds = parseFloat(buttons[0].querySelector('span.text_odds')?.textContent || '0') || 0;
            const awayLine = (buttons[1].querySelector('tt.text_ballhead')?.textContent || '').trim();
            const awayOdds = parseFloat(buttons[1].querySelector('span.text_odds')?.textContent || '0') || 0;

            if (marketLabel === 'HDP') {
              const hdpEntry = { line: homeLine, awayLine: awayLine, homeOdds, awayOdds };
              if (isHalfSection) entry.hdpHalf.push(hdpEntry); else entry.hdp.push(hdpEntry);
            } else if (marketLabel === 'O/U') {
              const ouEntry = { line: parseFloat(homeLine) || 0, overOdds: homeOdds, underOdds: awayOdds };
              if (isHalfSection) entry.ouHalf.push(ouEntry); else entry.ou.push(ouEntry);
            }
          }
        }

        // ★ fallback: box_lebet_odd 结构（CORNERS 页面或部分 HDP&O/U 页面使用）
        if (entry.hdp.length === 0 && entry.ou.length === 0 && entry.hdpHalf.length === 0 && entry.ouHalf.length === 0) {
          const oddBlocks = rightPanel.querySelectorAll('div.box_lebet_odd');
          for (const block of oddBlocks) {
            const headSpan = block.querySelector('div.head_lebet span');
            if (!headSpan) continue;
            const rawLabel = (headSpan.textContent || '').trim();
            const marketLabel = cm[rawLabel] || rawLabel.toUpperCase();

            // 判断是否上半场
            const halfTt = block.querySelector('div.head_lebet tt');
            const halfLabel = halfTt ? (cm[(halfTt.textContent || '').trim()] || (halfTt.textContent || '').trim()) : '';
            const isHalf = halfLabel === '1H' || halfLabel === '上半场' || (halfTt && (halfTt.textContent || '').includes('上半'));

            const btns = block.querySelectorAll('div.btn_lebet_odd');
            if (btns.length < 2) continue;
            const isLocked = btns[0].classList.contains('lock');
            const homeOdds = isLocked ? 0 : parseFloat((btns[0].querySelector('span.text_odds') || {}).textContent || '0') || 0;
            const awayOdds = isLocked ? 0 : parseFloat((btns[1].querySelector('span.text_odds') || {}).textContent || '0') || 0;

            if (marketLabel === 'HDP') {
              const ln = (btns[0].querySelector('tt.text_ballhead')?.textContent || '').trim();
              const awayLn = (btns[1].querySelector('tt.text_ballhead')?.textContent || '').trim();
              const hdpEntry = { line: ln, awayLine: awayLn, homeOdds, awayOdds, locked: isLocked };
              if (isHalf) entry.hdpHalf.push(hdpEntry); else entry.hdp.push(hdpEntry);
            } else if (marketLabel === 'O/U') {
              const ln = parseFloat((btns[0].querySelector('tt.text_ballhead')?.textContent || '0')) || 0;
              const ouEntry = { line: ln, overOdds: homeOdds, underOdds: awayOdds, locked: isLocked };
              if (isHalf) entry.ouHalf.push(ouEntry); else entry.ou.push(ouEntry);
            }
          }
        }
        if (entry.hdp.length > 0 || entry.ou.length > 0 || entry.hdpHalf.length > 0 || entry.ouHalf.length > 0) markets[key] = entry;
      }
      return markets;
    }, matchScores);
  } catch (e) {
    console.log("[cornerCrawler] main markets capture failed:", e.message);
    return {};
  }
}

async function parseCornerMarkets(page, matchScores = {}) {
  console.log("[cornerCrawler] ===== DOM Parsing Corner Markets =====");

  // 验证当前是否在 CORNERS 标签页，避免解析 HDP&O/U 页面数据
  try {
    const isOnCornersTab = await page.evaluate(() => {
      const cnTab = document.getElementById('tab_cn');
      if (!cnTab) return false;
      return cnTab.classList.contains('on') || cnTab.classList.contains('active');
    });
    if (!isOnCornersTab) {
      console.log("[cornerCrawler] 当前不在 CORNERS 标签页，跳过角球数据解析");
      return [];
    }
  } catch (e) {
    console.warn("[cornerCrawler] CORNERS 标签页检查失败:", e.message);
  }

  try {
    // ---- Phase 1: Diagnostic snapshot ----
    const diag = await page.evaluate(() => {
      const info = { containerSelectors: {}, relevantClasses: [], sampleOuterHTML: "" };

      // 测试多种容器选择器
      const selTests = [
        "div.bet_box",
        "div.box_lebet",
        "div.box_lebet.bet_type_cn",
        "div[class*='box_lebet']",
        "div[class*='bet_type']",
        "div[class*='inplay_row']",
      ];
      for (const sel of selTests) {
        const els = document.querySelectorAll(sel);
        info.containerSelectors[sel] = els.length;
        if (els.length > 0 && !info.sampleOuterHTML) {
          info.sampleOuterHTML = els[0].outerHTML.substring(0, 800);
        }
      }

      // 提取页面中所有与投注相关的 class
      const allClasses = new Set();
      document.querySelectorAll("*").forEach(el => {
        if (el.className && typeof el.className === "string") {
          el.className.split(/\s+/).forEach(c => allClasses.add(c));
        }
      });
      info.relevantClasses = [...allClasses].filter(c =>
        c.toLowerCase().includes("box") || c.includes("lebet") ||
        c.includes("odd") || c.includes("bet") || c.includes("team") ||
        c.includes("game") || c.includes("match") || c.includes("market")
      );

      return info;
    });

    console.log("[cornerCrawler] DOM container selectors found:", JSON.stringify(diag.containerSelectors));
    if (diag.relevantClasses.length > 0) {
      console.log("[cornerCrawler] Relevant classes:", diag.relevantClasses.join(", "));
    }
    if (diag.sampleOuterHTML) {
      console.log("[cornerCrawler] Sample container HTML:", diag.sampleOuterHTML.substring(0, 300));
    }

    // ---- Phase 2: Parse match data ----
    const rawData = await page.evaluate((matchScores) => {
      const results = [];

      // ====== 辅助函数 ======
      function safeText(el, selector) {
        const found = selector ? el.querySelector(selector) : el;
        return found ? (found.textContent || "").trim() : "";
      }

      function safeInt(el, selector) {
        const t = safeText(el, selector);
        return parseInt(t, 10) || 0;
      }

      function safeFloat(el, selector) {
        const t = safeText(el, selector);
        return parseFloat(t) || 0;
      }

      // ====== 策略1: 按 div.bet_box 解析（用户提供的新结构）======
      let containers = document.querySelectorAll("div.bet_box");
      if (containers.length > 0) {
        console.log("[DOM] Using div.bet_box containers, found " + containers.length);

        for (const box of containers) {
          try {
            // 从 bet_box 中找球队名 - 向上查找最近的联赛标签
            let league = "";
            let prev = box.previousElementSibling;
            while (prev && !league) {
              const leaEl = prev.querySelector("tt#lea_name, .lea_name, [class*='lea']");
              if (leaEl) { league = safeText(leaEl); break; }
              const text = (prev.textContent || "").trim();
              // 如果前一个兄弟元素是短文本（联赛名），则使用它
              if (text && text.length < 40 && !text.includes("\n") && !text.match(/^\d/)) {
                league = text;
                break;
              }
              prev = prev.previousElementSibling;
            }

            // 获取球队名 - bet_box 内的 team div
            const homeEl = box.querySelector("div.box_team.teamH span.text_team, div.team_home, [class*='team_h']");
            const awayEl = box.querySelector("div.box_team.teamC span.text_team, div.team_away, [class*='team_a']");
            let homeTeam = safeText(homeEl);
            let awayTeam = safeText(awayEl);

            // 如果 bet_box 内找不到，尝试兄弟元素
            if (!homeTeam || !awayTeam) {
              const parentRow = box.closest("[class*='row'], [class*='game'], [class*='match']");
              if (parentRow) {
                homeTeam = safeText(parentRow, "[class*='team_h'] span, .teamH span");
                awayTeam = safeText(parentRow, "[class*='team_c'] span, .teamC span");
              }
            }

            if (!homeTeam || !awayTeam) continue;

            // 比分和时间 — 优先使用 Soccer 页捕获的真实比赛比分
            let homeScore = 0, awayScore = 0;
            let cornerHomeCount = 0, cornerAwayCount = 0;
            let totalCorners = 0;
            let timeStr = "";
            let elapsedMinutes = 0;

            // 从 Soccer 页捕获的比赛比分（真实比分，非角球比分）
            if (matchScores && homeTeam && awayTeam) {
              const key = (homeTeam + '|' + awayTeam).toLowerCase();
              const matchInfo = matchScores[key];
              if (matchInfo) {
                homeScore = matchInfo.homeScore || 0;
                awayScore = matchInfo.awayScore || 0;
              }
            }

            // 角球比分（CORNERS 页面上的 box_score 是角球数据，存入单独字段）
            const cornerScoreEls = box.querySelectorAll("div.box_score span.text_point");
            if (cornerScoreEls.length >= 2) {
              const ch = parseInt((cornerScoreEls[0].textContent || "0").trim(), 10);
              const ca = parseInt((cornerScoreEls[1].textContent || "0").trim(), 10);
              if (!isNaN(ch) && !isNaN(ca) && ch >= 0 && ca >= 0) {
                cornerHomeCount = ch;
                cornerAwayCount = ca;
              }
            }

            // 时间解析
            timeStr = safeText(box, "tt.text_time i, .text_time, [class*='timer'], [class*='minute']");
            if (timeStr) {
              if (timeStr.toUpperCase() === "HT") elapsedMinutes = 45;
              else {
                const parts = timeStr.split(":");
                elapsedMinutes = parts.length === 2 ? parseInt(parts[0], 10) || 0 : parseInt(timeStr, 10) || 0;
              }
            }

            totalCorners = safeInt(box, "span.game_total, [class*='corner'] span, [class*='total']");

            // 盘口数据: 优先用标签文本匹配（避免赔率硬编码索引导致错乱）
            let cornerOU = null, cornerHDP = null, nextCorner = null, cornerOE = null;

            const oddBlocks = box.querySelectorAll("div.box_lebet_odd:not(.box_lebet_half)");
            if (oddBlocks.length > 0) {
              for (const block of oddBlocks) {
                const headSpan = block.querySelector("div.head_lebet span");
                if (!headSpan) continue;
                const rawMarket = (headSpan.textContent || "").trim();
                // ★ 中文→英文盘口类型映射（与 parseAllMarkets 保持一致）
                const cm = {'大/小':'O/U','大小':'O/U','O/U':'O/U','角球大/小':'O/U','角球大小':'O/U','Over/Under':'O/U','让球':'HDP','HDP':'HDP','角球让球':'HDP','Handicap':'HDP','下个角球':'NEXT_CORNER','NEXT CORNER':'NEXT_CORNER','单/双':'O/E','单双':'O/E','O/E':'O/E','角球单/双':'O/E','角球单双':'O/E','Odd/Even':'O/E'};
                const marketType = cm[rawMarket] || rawMarket.toUpperCase();
                // ★ 修复：包含 lock 按钮提取盘口线(line)，lock时赔率为0
                const betButtons = block.querySelectorAll("div.btn_lebet_odd");
                if (betButtons.length === 0) continue;

                if (marketType === "O/U" && betButtons.length >= 2) {
                  let ouLine = safeFloat(betButtons[0], "tt.text_ballhead");
                  if (!ouLine) {
                    // 回退：从 block 文本中提取数字
                    const blockText = (block.textContent || "").trim();
                    const numMatch = blockText.match(/(\d+\.?\d*)/);
                    if (numMatch) ouLine = parseFloat(numMatch[1]) || 0;
                  }
                  const isLocked = betButtons[0].classList.contains("lock");
                  cornerOU = {
                    line: ouLine || 0,
                    overOdds: isLocked ? 0 : safeFloat(betButtons[0], "span.text_odds"),
                    underOdds: isLocked ? 0 : safeFloat(betButtons[1], "span.text_odds"),
                    locked: isLocked
                  };
                } else if (marketType === "HDP" && betButtons.length >= 2) {
                  const isLocked = betButtons[0].classList.contains("lock");
                  cornerHDP = {
                    line: safeText(betButtons[0], "tt.text_ballhead"),
                    homeOdds: isLocked ? 0 : safeFloat(betButtons[0], "span.text_odds"),
                    awayOdds: isLocked ? 0 : safeFloat(betButtons[1], "span.text_odds"),
                    locked: isLocked
                  };
                } else if (marketType === "NEXT_CORNER" && betButtons.length >= 2) {
                  const isLocked = betButtons[0].classList.contains("lock");
                  nextCorner = {
                    corner: safeText(betButtons[0], "tt.text_ballou"),
                    homeOdds: isLocked ? 0 : safeFloat(betButtons[0], "span.text_odds"),
                    awayOdds: isLocked ? 0 : safeFloat(betButtons[1], "span.text_odds"),
                    locked: isLocked
                  };
                } else if (marketType === "O/E" && betButtons.length >= 2) {
                  const isLocked = betButtons[0].classList.contains("lock");
                  cornerOE = {
                    oddOdds: isLocked ? 0 : safeFloat(betButtons[0], "span.text_odds"),
                    evenOdds: isLocked ? 0 : safeFloat(betButtons[1], "span.text_odds"),
                    locked: isLocked
                  };
                }
              }
            }

            // 兜底：标签匹配失败时用硬编码索引（保留兼容性）
            if (!cornerHDP && !cornerOU) {
              const oddsSpans = box.querySelectorAll("span.odds");
              const oddsValues = [];
              oddsSpans.forEach(s => {
                const v = parseFloat((s.textContent || "").trim());
                if (!isNaN(v)) oddsValues.push(v);
              });
              if (oddsValues.length >= 6) {
                cornerOU = { line: 0, overOdds: oddsValues[0], underOdds: oddsValues[1] };
                cornerHDP = { line: "", homeOdds: oddsValues[2], awayOdds: oddsValues[3] };
                nextCorner = { corner: "", homeOdds: oddsValues[4], awayOdds: oddsValues[5] };
              }
            }

            const result = {
              homeTeam, awayTeam, league,
              time: formatTime(timeStr), elapsedMinutes,
              homeScore, awayScore, totalCorners,
              cornerOU, cornerHDP, nextCorner, cornerOE,
              rawOdds: []
            };

            results.push(result);
          } catch (e) { /* skip broken match */ }
        }
      }

      // ====== 策略2: 按 div.box_lebet.bet_type_cn 解析（原有结构）======
      if (results.length === 0) {
        containers = document.querySelectorAll("div.box_lebet.bet_type_cn");
        if (containers.length > 0) {
          console.log("[DOM] Using div.box_lebet.bet_type_cn containers, found " + containers.length);

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

              let timeStr = "";
              let elapsedMinutes = 0;
              const timeEl = leftPanel.querySelector("tt.text_time i.txt_bk");
              if (timeEl) {
                timeStr = safeText(timeEl);
              } else {
                // 回退：取 text_time 完整文本再用正则提取时间
                timeStr = safeText(leftPanel, "tt.text_time");
              }
              if (timeStr) {
                const upper = timeStr.toUpperCase();
                if (upper === "HT") {
                  elapsedMinutes = 45;
                } else {
                  // 先尝试纯数字时间格式 xx:xx
                  const timeMatch = timeStr.match(/(\d{1,2}):(\d{2})/);
                  if (timeMatch) {
                    elapsedMinutes = parseInt(timeMatch[1], 10) || 0;
                  } else {
                    // 纯数字
                    const numMatch = timeStr.match(/(\d+)/);
                    elapsedMinutes = numMatch ? (parseInt(numMatch[1], 10) || 0) : 0;
                  }
                }
              }

              // ★ 比分：优先使用 matchScores（Soccer页面的真实比赛比分）
              let homeScore = 0, awayScore = 0;
              let cornerHomeCount = 0, cornerAwayCount = 0;
              // CORNERS 页面的 box_score 是角球数，不是比赛比分
              const scoreSpans = leftPanel.querySelectorAll("div.box_score span.text_point");
              if (scoreSpans.length >= 2) {
                cornerHomeCount = parseInt((scoreSpans[0].textContent || "0").trim(), 10) || 0;
                cornerAwayCount = parseInt((scoreSpans[1].textContent || "0").trim(), 10) || 0;
              }
              if (matchScores && homeTeam && awayTeam) {
                const key = (homeTeam + '|' + awayTeam).toLowerCase();
                const matchInfo = matchScores[key];
                if (matchInfo) {
                  homeScore = matchInfo.homeScore || 0;
                  awayScore = matchInfo.awayScore || 0;
                }
              }

              let totalCorners = safeInt(leftPanel, "span.game_total");

              // ---- Right panel: odds ----
              const rightPanel = gameEl.querySelector("div.box_lebet_r");
              let cornerOU = null, cornerHDP = null, nextCorner = null, cornerOE = null;

              if (rightPanel) {
                const oddBlocks = rightPanel.querySelectorAll("div.box_lebet_odd");
                for (const block of oddBlocks) {
                  if (block.classList.contains("box_lebet_half")) continue;

                  const headSpan = block.querySelector("div.head_lebet span");
                  if (!headSpan) continue;
                  const rawMarket = (headSpan.textContent || "").trim();
                  // ★ 中文→英文盘口类型映射（与策略1保持一致）
                  const cm = {'大/小':'O/U','大小':'O/U','O/U':'O/U','角球大/小':'O/U','角球大小':'O/U','Over/Under':'O/U','让球':'HDP','HDP':'HDP','角球让球':'HDP','Handicap':'HDP','下个角球':'NEXT_CORNER','NEXT CORNER':'NEXT_CORNER','单/双':'O/E','单双':'O/E','O/E':'O/E','角球单/双':'O/E','角球单双':'O/E','Odd/Even':'O/E'};
                  const marketType = cm[rawMarket] || rawMarket.toUpperCase();

                  // ★ 修复：包含 lock 按钮提取盘口线(line)，lock时赔率为0
                  const betButtons = block.querySelectorAll("div.btn_lebet_odd");
                  if (betButtons.length === 0) continue;
                  const isLocked = betButtons[0].classList.contains("lock");

                  if (marketType === "O/U" && betButtons.length >= 2) {
                    cornerOU = {
                      line: safeFloat(betButtons[0], "tt.text_ballhead"),
                      overOdds: isLocked ? 0 : safeFloat(betButtons[0], "span.text_odds"),
                      underOdds: isLocked ? 0 : safeFloat(betButtons[1], "span.text_odds"),
                      locked: isLocked
                    };
                  } else if (marketType === "HDP" && betButtons.length >= 2) {
                    cornerHDP = {
                      line: safeText(betButtons[0], "tt.text_ballhead"),
                      homeOdds: isLocked ? 0 : safeFloat(betButtons[0], "span.text_odds"),
                      awayOdds: isLocked ? 0 : safeFloat(betButtons[1], "span.text_odds"),
                      locked: isLocked
                    };
                  } else if ((marketType === "NEXT_CORNER" || marketType === "NEXT CORNER") && betButtons.length >= 2) {
                    nextCorner = {
                      corner: safeText(betButtons[0], "tt.text_ballou"),
                      homeOdds: isLocked ? 0 : safeFloat(betButtons[0], "span.text_odds"),
                      awayOdds: isLocked ? 0 : safeFloat(betButtons[1], "span.text_odds"),
                      locked: isLocked
                    };
                  } else if (marketType === "O/E" && betButtons.length >= 2) {
                    cornerOE = {
                      oddOdds: isLocked ? 0 : safeFloat(betButtons[0], "span.text_odds"),
                      evenOdds: isLocked ? 0 : safeFloat(betButtons[1], "span.text_odds"),
                      locked: isLocked
                    };
                  }
                }
              }

              results.push({
                homeTeam, awayTeam, league, time: formatTime(timeStr), elapsedMinutes,
                homeScore, awayScore, totalCorners,
                cornerHomeCount, cornerAwayCount,
                cornerOU, cornerHDP, nextCorner, cornerOE
              });
            } catch (e) { /* skip broken match */ }
          }
        }
      }

      // ====== 策略3: 通用回退 - 扫描所有 box_lebet 变体 ======
      if (results.length === 0) {
        containers = document.querySelectorAll("div[class*='box_lebet']");
        if (containers.length > 0) {
          console.log("[DOM] Using generic box_lebet containers, found " + containers.length);
          // 过滤掉非比赛容器（如仅有导航的）
          const matchContainers = [...containers].filter(el => {
            const text = (el.textContent || "").toLowerCase();
            return text.includes("vs") ||
              (el.querySelector("[class*='team']") && el.querySelector("[class*='odd']"));
          });
          console.log("[DOM] Filtered to " + matchContainers.length + " likely match containers");

          for (const el of matchContainers) {
            try {
              const teams = el.querySelectorAll("[class*='team_h'] span, [class*='teamH'] span, [class*='team_c'] span, [class*='teamC'] span");
              if (teams.length < 2) continue;
              const homeTeam = (teams[0].textContent || "").trim();
              const awayTeam = (teams[1].textContent || "").trim();
              if (!homeTeam || !awayTeam) continue;

              // 提取所有赔率数字
              const oddsSpans = el.querySelectorAll("span.text_odds, span.odds, [class*='odds']");
              const oddsValues = [];
              oddsSpans.forEach(s => {
                const v = parseFloat((s.textContent || "").trim());
                if (!isNaN(v) && v > 0) oddsValues.push(v);
              });

              results.push({
                homeTeam, awayTeam, league: "",
                time: "", elapsedMinutes: 0,
                homeScore: 0, awayScore: 0, totalCorners: 0,
                cornerOU: null, cornerHDP: null, nextCorner: null, cornerOE: null,
                rawOdds: oddsValues
              });
            } catch (e) {}
          }
        }
      }

      return results;
    }, matchScores);

    // ---- Phase 3: Log results ----
    console.log("[cornerCrawler] DOM parsed " + rawData.length + " corner matches:");
    for (const m of rawData.slice(0, 5)) {
      const hdp = m.cornerHDP || {};
      const ou = m.cornerOU || {};
      console.log("  " + (m.league || "(no league)") + ": " + m.homeTeam + " vs " + m.awayTeam +
        (m.elapsedMinutes ? " @" + m.elapsedMinutes + "'" : "") +
        (m.homeScore || m.awayScore ? " " + m.homeScore + "-" + m.awayScore : "") +
        (m.totalCorners ? " cr:" + m.totalCorners : "") +
        (hdp.line ? " hdp:" + hdp.line + " odds:" + hdp.homeOdds : "") +
        (ou.line ? " ou:" + ou.line + " ov:" + ou.overOdds + " un:" + ou.underOdds : "") +
        (m.rawOdds ? " rawOdds:[" + m.rawOdds.slice(0, 4).join(",") + "]" : "")
      );
    }

    // 去重：按 (homeTeam + awayTeam) 合并
    const seen = new Set();
    const deduped = [];
    for (const m of rawData) {
      const key = (m.homeTeam + "|||" + m.awayTeam).toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        // 添加数据质量标记
        const hasBasicInfo = m.homeTeam && m.awayTeam;
        const hasMarketData = (m.cornerHDP || m.cornerOU || m.nextCorner);
        const hasLiveData = (m.elapsedMinutes > 0 || m.homeScore > 0 || m.awayScore > 0 || m.totalCorners > 0);
        if (hasBasicInfo && hasMarketData && hasLiveData) {
          m.dataQuality = "full";
        } else if (hasBasicInfo && (hasMarketData || hasLiveData)) {
          m.dataQuality = "partial";
        } else {
          m.dataQuality = "empty";
        }
        deduped.push(m);
      }
    }
    if (deduped.length < rawData.length) {
      console.log("[cornerCrawler] Deduplicated: " + rawData.length + " -> " + deduped.length);
    }
    const qualityCounts = {};
    deduped.forEach(m => { qualityCounts[m.dataQuality] = (qualityCounts[m.dataQuality] || 0) + 1; });
    console.log("[cornerCrawler] Data quality: " + JSON.stringify(qualityCounts));

    return deduped;
  } catch (e) {
    console.error("[cornerCrawler] parseCornerMarkets failed:", e.message);
    return [];
  }
}


// ======================== XHR 拦截 ========================
async function setupXHRInterception(page) {
  capturedResponses = [];
  seenRequestUrls.clear();
  page.removeAllListeners("request");
  page.removeAllListeners("response");
  console.log("[cornerCrawler] 设置网络监听（被动模式）...");

  const typeStats = {};
  let saveCount = 0;

  page.on("request", (request) => {
    const url = request.url();
    const resourceType = request.resourceType();
    typeStats[resourceType] = (typeStats[resourceType] || 0) + 1;

    const lowerUrl = url.toLowerCase();
    const candidateKeywords = ["api", "json", "live", "match", "odds", "corner", "list", "schedule", "data", "market", "inplay", "event", "game"];
    const isCandidate = candidateKeywords.some(kw => lowerUrl.includes(kw));

    if (resourceType === "xhr" || resourceType === "fetch" || isCandidate) {
      if (seenRequestUrls.size < 30 || isCandidate) {
        console.log("[cornerCrawler] REQ " + request.method() + " [" + resourceType + "] " + url.substring(0, 200));
      }
      seenRequestUrls.add(url);
    }
  });

  page.on("response", async (response) => {
    const url = response.url();
    const contentType = response.headers()["content-type"] || "";

    try {
      const text = await response.text();
      let jsonData = null;
      try { jsonData = JSON.parse(text); } catch (e) { return; }

      // transform.php 处理 - 扩展：尝试从任意响应提取比赛数据
      if (url.includes("transform.php") || url.includes("transform_nl.php")) {
        if (saveCount < 5) {
          try {
            fs.writeFileSync("debug/transform-" + Date.now() + ".json", text.substring(0, 8000));
            saveCount++;
          } catch (e) {}
        }

        let matchList = null;
        const topKeys = Object.keys(jsonData);
        console.log("[cornerCrawler] transform response keys: " + JSON.stringify(topKeys.slice(0, 10)));

        // Pattern 1: jsonData.response.GAME_X
        if (jsonData.response && typeof jsonData.response === "object") {
          const respObj = jsonData.response;
          const gameKeys = Object.keys(respObj).filter(k => k.startsWith("GAME_"));
          if (gameKeys.length > 0) {
            matchList = gameKeys.map(k => respObj[k]);
            console.log("[cornerCrawler] Found " + matchList.length + " games in jsonData.response.GAME_X");
          }
        }

        // Pattern 2: jsonData directly has game-like keys
        if (!matchList) {
          const directGameKeys = topKeys.filter(k => k.startsWith("GAME_"));
          if (directGameKeys.length > 0) {
            matchList = directGameKeys.map(k => jsonData[k]);
            console.log("[cornerCrawler] Found " + matchList.length + " games in jsonData.GAME_X (direct)");
          }
        }

        // Pattern 3: Any array in response
        if (!matchList) {
          for (const key of topKeys) {
            if (Array.isArray(jsonData[key]) && jsonData[key].length > 0) {
              const first = jsonData[key][0];
              if (first && typeof first === "object" && (first.homeTeam || first.awayTeam || first.home || first.away || first.matchId || first.eventId)) {
                matchList = jsonData[key];
                console.log("[cornerCrawler] Found " + matchList.length + " items in jsonData." + key);
                break;
              }
            }
          }
        }

        // Pattern 4: Deep search in response object
        if (!matchList && jsonData.response) {
          const resp = jsonData.response;
          for (const key of Object.keys(resp)) {
            const val = resp[key];
            if (Array.isArray(val) && val.length > 0) {
              const first = val[0];
              if (first && typeof first === "object" && Object.keys(first).length > 2) {
                matchList = val;
                console.log("[cornerCrawler] Found " + matchList.length + " items in jsonData.response." + key);
                break;
              }
            }
          }
        }

        if (matchList && matchList.length > 0) {
          const firstItem = matchList[0];
          capturedResponses.push({
            url,
            matchList,
            itemCount: matchList.length,
            sampleFields: typeof firstItem === "object" ? Object.keys(firstItem).slice(0, 20) : []
          });
        } else {
          // Log top-level keys for debugging
          console.log("[cornerCrawler] transform: no matches found, code=" + (jsonData.code || "none") + " topKeys=" + JSON.stringify(topKeys));
        }
        return;
      }

      // Betradar / Sportradar gismo API interception
      if (url.includes("betradar.hgapp0003.com") || url.includes("ws-fn-cdn001.akamaized.net")) {
        if (saveCount < 5) {
          try {
            const fname = "debug/betradar-" + Date.now() + ".json";
            fs.writeFileSync(fname, text.substring(0, 8000));
            saveCount++;
          } catch (e) {}
        }

        let matchList = null;
        const topKeys = Object.keys(jsonData);
        console.log("[cornerCrawler] betradar/gismo response keys: " + JSON.stringify(topKeys.slice(0, 10)));

        // gismo format: jsonData.doc is an array of match data
        if (jsonData.doc && Array.isArray(jsonData.doc) && jsonData.doc.length > 0) {
          matchList = jsonData.doc;
          console.log("[cornerCrawler] gismo doc array: " + matchList.length + " items");
        }

        // gismo match_info: contains team names, score, etc.
        if (!matchList && jsonData.match && typeof jsonData.match === "object") {
          matchList = [jsonData.match];
          console.log("[cornerCrawler] gismo match_info single match");
        }

        // Betradar p=getDataMT: look for any array with team data
        if (!matchList) {
          for (const key of topKeys) {
            if (Array.isArray(jsonData[key]) && jsonData[key].length > 0) {
              const first = jsonData[key][0];
              if (first && typeof first === "object") {
                const fk = Object.keys(first);
                if (fk.some(k => k.toLowerCase().includes("team") || k.toLowerCase().includes("match") || k.toLowerCase().includes("event") || k.toLowerCase().includes("name"))) {
                  matchList = jsonData[key];
                  console.log("[cornerCrawler] betradar array in " + key + ": " + matchList.length + " items, sample keys: " + JSON.stringify(fk.slice(0, 10)));
                  break;
                }
              }
            }
          }
        }

        // Deep recursive search for arrays with team/match data
        if (!matchList) {
          function deepFind(obj, depth) {
            if (depth > 4 || !obj || typeof obj !== "object") return null;
            if (Array.isArray(obj) && obj.length > 0 && obj.length < 200) {
              const first = obj[0];
              if (first && typeof first === "object") {
                const fk = Object.keys(first);
                if (fk.some(k => /team|match|event|name|score/i.test(k))) return obj;
              }
            }
            if (typeof obj === "object" && !Array.isArray(obj)) {
              for (const k of Object.keys(obj)) {
                const r = deepFind(obj[k], depth + 1);
                if (r) return r;
              }
            }
            return null;
          }
          matchList = deepFind(jsonData, 0);
          if (matchList) console.log("[cornerCrawler] betradar deep find: " + matchList.length + " items");
        }

        if (matchList && matchList.length > 0) {
          const firstItem = matchList[0];
          capturedResponses.push({
            url,
            matchList,
            itemCount: matchList.length,
            sampleFields: typeof firstItem === "object" ? Object.keys(firstItem).slice(0, 20) : [],
            source: "betradar"
          });
          console.log("[cornerCrawler] Captured betradar/gismo: " + matchList.length + " items");
        }
        return;
      }

      // 通用 JSON 数据捕获
      let matchList = jsonData;
      if (jsonData.data && Array.isArray(jsonData.data)) matchList = jsonData.data;
      else if (jsonData.result && Array.isArray(jsonData.result)) matchList = jsonData.result;
      else if (jsonData.list && Array.isArray(jsonData.list)) matchList = jsonData.list;
      else if (jsonData.matches && Array.isArray(jsonData.matches)) matchList = jsonData.matches;

      if (Array.isArray(matchList) && matchList.length > 0) {
        const firstItem = matchList[0];
        const hasTeamFields = firstItem && typeof firstItem === "object" && (
          firstItem.home || firstItem.away || firstItem.homeTeam || firstItem.awayTeam ||
          firstItem.home_team || firstItem.away_team || firstItem.team1 || firstItem.team2 ||
          firstItem.match_id || firstItem.matchId || firstItem.id
        );
        if (hasTeamFields) {
          capturedResponses.push({
            url,
            matchList,
            itemCount: matchList.length,
            sampleFields: typeof firstItem === "object" ? Object.keys(firstItem).slice(0, 20) : []
          });
        }
      }
    } catch (e) {}
  });
}

// ======================== XML 解析工具 ========================
function extractGamesFromXML(xmlStr) {
  const games = [];
  // ★ 先尝试 <game> 标签，如果没有则尝试其他根标签
  const rootTags = ["game", "match", "event", "data", "row"];
  let found = false;
  for (const tag of rootTags) {
    const gameRegex = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "g");
    let m;
    while ((m = gameRegex.exec(xmlStr)) !== null) {
      found = true;
      const obj = {};
      const content = m[1];
      // 匹配 <TAG>value</TAG> 格式
      const tagRegex = /<(\w+)>([\s\S]*?)<\/\1>/g;
      let tm;
      while ((tm = tagRegex.exec(content)) !== null) {
        obj[tm[1]] = tm[2].trim();
      }
      // 匹配自闭合标签 <TAG/> 或 <TAG />（值为空字符串）
      const selfCloseRegex = /<(\w+)\s*\/>/g;
      let sc;
      while ((sc = selfCloseRegex.exec(content)) !== null) {
        if (!(sc[1] in obj)) obj[sc[1]] = "";
      }
      // 匹配属性标签 <TAG attr="val"/>（值为属性字符串）
      const attrTagRegex = /<(\w+)\s+([^>]*?)\/>/g;
      let at;
      while ((at = attrTagRegex.exec(content)) !== null) {
        if (!(at[1] in obj)) obj[at[1]] = at[2].trim();
      }
      if (Object.keys(obj).length > 0) games.push(obj);
    }
    if (found) break;
  }

  // ★ 如果没有找到任何根标签，尝试直接提取所有二级标签（扁平结构）
  if (games.length === 0) {
    // 检测最外层标签（如 <xml>、<response> 等）
    const outerMatch = xmlStr.match(/<(\w+)[^>]*>([\s\S]*)<\/\1>/);
    if (outerMatch) {
      const inner = outerMatch[2];
      const obj = {};
      const tagRegex = /<(\w+)>([\s\S]*?)<\/\1>/g;
      let tm;
      while ((tm = tagRegex.exec(inner)) !== null) {
        obj[tm[1]] = tm[2].trim();
      }
      const selfCloseRegex = /<(\w+)\s*\/>/g;
      let sc;
      while ((sc = selfCloseRegex.exec(inner)) !== null) {
        if (!(sc[1] in obj)) obj[sc[1]] = "";
      }
      if (Object.keys(obj).length > 0) games.push(obj);
    }
  }

  return games;
}

// ======================== 分类型 XML 解析 ========================
function parseCornerXML(xmlStr, rtype) {
  if (!xmlStr || xmlStr === "FETCH_ERROR:" || typeof xmlStr !== "string" || xmlStr.startsWith("FETCH_ERROR:")) return [];

  // ★ 诊断：打印原始 XML 前 300 字符
  console.log(`[cornerCrawler] parseCornerXML(${rtype}): 原始XML前300字: ${xmlStr.substring(0, 300)}`);

  const games = extractGamesFromXML(xmlStr);
  console.log(`[cornerCrawler] parseCornerXML(${rtype}): 提取 ${games.length} 个 game 节点`);

  if (games.length > 0) {
    const sampleKeys = Object.keys(games[0]).join(", ");
    console.log(`[cornerCrawler] parseCornerXML(${rtype}): 首个 game 的字段: ${sampleKeys}`);
    // ★ 打印首个 game 的完整字段和值（用于确认实际字段名）
    console.log(`[cornerCrawler] parseCornerXML(${rtype}): 首个 game 完整数据:`, JSON.stringify(games[0]).substring(0, 500));
    if (rtype === "rcn") {
      console.log(`[cornerCrawler] parseCornerXML(${rtype}): TEAM_H="${games[0].TEAM_H || games[0].team_h}", TEAM_C="${games[0].TEAM_C || games[0].team_c}", GID="${games[0].GID || games[0].gid}"`);
    } else if (rtype === "rrnou") {
      console.log(`[cornerCrawler] parseCornerXML(${rtype}): TEAM_H="${games[0].TEAM_H || games[0].team_h}", TEAM_C="${games[0].TEAM_C || games[0].team_c}", GID="${games[0].GID || games[0].gid}"`);
    } else if (rtype === "get_game_more") {
      // ★ 打印所有 game 节点的字段（get_game_more 可能返回多个盘口类型）
      for (let gi = 0; gi < Math.min(games.length, 5); gi++) {
        console.log(`[cornerCrawler] parseCornerXML(get_game_more): game[${gi}] 字段:`, Object.keys(games[gi]).join(", "));
        console.log(`[cornerCrawler] parseCornerXML(get_game_more): game[${gi}] 数据:`, JSON.stringify(games[gi]).substring(0, 500));
      }
    }
  }

  if (rtype === "rcn" || rtype === "get_game_more") {
    return games.filter(g => {
      const ht = g.TEAM_H || g.team_h || "";
      const at = g.TEAM_C || g.team_c || "";
      // get_game_more 可能没有 TEAM_H/TEAM_C，但有盘口数据，不过滤掉
      if (rtype === "get_game_more") return true;
      return ht && at;
    });
  } else if (rtype === "rrnou") {
    return games.filter(g => {
      const ht = g.TEAM_H || g.team_h || "";
      const at = g.TEAM_C || g.team_c || "";
      return ht && at;
    });
  }
  return games;
}

// ======================== API 模式：获取 uid/ver ========================
async function getSessionInfo(page) {
  // 1. 缓存
  if (cachedSessionInfo?.uid && cachedSessionInfo?.ver) {
    console.log("[cornerCrawler] API: 使用缓存的 uid/ver");
    return cachedSessionInfo;
  }

  // 2. 拦截 XHR 请求提取 uid/ver（优先于 top.uid，因为跨域 iframe 中 top.uid 不可用）
  console.log("[cornerCrawler] API: 尝试通过 XHR 拦截获取 uid/ver...");
  try {
    const info = await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("XHR拦截超时(8s)")), 8000);
      const handler = (request) => {
        const url = request.url();
        if (!url.includes("transform")) return;
        const verMatch = url.match(/[?&]ver=([^&]+)/);
        const ver = verMatch ? verMatch[1] : "";
        const body = request.postData() || "";
        const uidMatch = body.match(/uid=([^&]+)/);
        const uid = uidMatch ? uidMatch[1] : "";
        if (uid && ver && uid !== "undefined") {
          clearTimeout(timeout);
          page.off("request", handler);
          let domain = HG_URL;
          try { domain = new URL(url).origin; } catch (e) {}
          resolve({ uid, ver, domain });
        }
      };
      page.on("request", handler);
      // 触发页面发请求
      page.evaluate(() => {
        try { document.getElementById("live_page")?.click(); } catch (e) {}
      }).catch(() => {});
    });
    cachedSessionInfo = info;
    console.log("[cornerCrawler] API: 通过 XHR 拦截获取 uid/ver 成功");
    return info;
  } catch (e) {
    console.log("[cornerCrawler] API: XHR 拦截获取 uid/ver 失败: " + e.message);
  }

  // 3. 兜底：尝试 top.uid/top.ver（跨域 iframe 中通常不可用）
  try {
    const info = await page.evaluate(() => {
      try {
        const uid = top.uid || "";
        const ver = top.ver || "";
        return { uid, ver, domain: location.origin };
      } catch (e) { return { uid: "", ver: "", domain: location.origin }; }
    });
    if (info.uid && info.ver) {
      cachedSessionInfo = info;
      console.log("[cornerCrawler] API: 通过 top.uid/ver 获取成功（兜底）");
      return info;
    }
  } catch (e) {}

  return null;
}

// ======================== API 模式：直接调用 transform.php ========================
async function fetchCornerDataViaAPI(page) {
  const _start = Date.now();
  console.log("[cornerCrawler] ===== Fetching corner data via direct API =====");
  try {
    const sessionInfo = await getSessionInfo(page);
    if (!sessionInfo) return null;

    const ts = Date.now();
    const listUrl = sessionInfo.domain + "/transform.php?ver=" + sessionInfo.ver;
    const fetchOpts = { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded", "X-Requested-With": "XMLHttpRequest" }, credentials: "include" };

    const rcnBody = ["uid=" + sessionInfo.uid, "ver=" + sessionInfo.ver, "langx=en-us",
      "p=get_game_list", "p3type=", "date=", "gtype=ft", "showtype=live",
      "rtype=rcn", "ltype=3", "filter=", "cupFantasy=N", "sorttype=L",
      "specialClick=", "isFantasy=N", "ts=" + ts, "chgSortTS=" + ts].join("&");

    const rnouBody = ["uid=" + sessionInfo.uid, "ver=" + sessionInfo.ver, "langx=en-us",
      "p=get_game_list", "p3type=", "date=", "gtype=ft", "showtype=live",
      "rtype=rrnou", "ltype=3", "filter=", "cupFantasy=N", "sorttype=L",
      "specialClick=", "isFantasy=N", "ts=" + ts, "chgSortTS=" + (ts + 100)].join("&");

    // ★ 并行请求角球列表 + HDP&O/U
    console.log("[cornerCrawler] API: 并行请求 rcn + rrnou...");
    const [listXml, rnouXml] = await page.evaluate(async (url, b1, b2, opts) => {
      const [r1, r2] = await Promise.all([
        fetch(url, { ...opts, body: b1 }).then(r => r.text()).catch(e => "FETCH_ERROR:" + e.message),
        fetch(url, { ...opts, body: b2 }).then(r => r.text()).catch(e => "")
      ]);
      return [r1, r2];
    }, listUrl, rcnBody, rnouBody, fetchOpts);
    console.log("[cornerCrawler] API: 并行请求完成: " + (Date.now() - _start) + "ms");

    if (!listXml || listXml.startsWith("FETCH_ERROR:")) {
      console.log("[cornerCrawler] API: rcn 请求失败");
      return null;
    }

    // ★ rcn XML 字段名是小写混合：gid, team_h, team_c, league, re_time, ratio_rouho, ior_ROUHO 等
    const games = parseCornerXML(listXml, "rcn");
    console.log("[cornerCrawler] API: 角球列表返回 " + games.length + " 场比赛");
    // ★ 不再在角球为空时直接返回，继续解析 rrnou（让球/大小数据可能有效）

    // ★ rrnou XML 字段名是全大写：GID, TEAM_H, TEAM_C, LEAGUE, SCORE_H, SCORE_C, RETIMESET, RATIO_RE, IOR_REH 等
    const rnouGames = parseCornerXML(rnouXml, "rrnou");
    console.log("[cornerCrawler] API: rrnou 返回 " + rnouGames.length + " 场比赛数据");
    // ★ 角球和 rrnou 都为空时才返回空
    if (games.length === 0 && rnouGames.length === 0) {
      console.warn("[cornerCrawler] API: rcn 和 rrnou 数据均为空");
      return [];
    }
    const scoreMap = {};
    for (const g of rnouGames) {
      const ht = g.TEAM_H || g.team_h || "";
      const at = g.TEAM_C || g.team_c || "";
      const key = (ht + "|" + at).toLowerCase();
      scoreMap[key] = { homeScore: parseInt(g.SCORE_H || g.score_h, 10) || 0, awayScore: parseInt(g.SCORE_C || g.score_c, 10) || 0, retime: g.RETIMESET || g.re_time || "" };
    }
    console.log("[cornerCrawler] API: HDP&O/U " + rnouGames.length + " 场，比分映射 " + Object.keys(scoreMap).length + " 条");

    // 解析角球数据（rcn 格式，字段名小写混合）
    const cornerMatches = [];
    const needDetail = [];
    for (const game of games) {
      const homeTeam = game.TEAM_H || game.team_h || "";
      const awayTeam = game.TEAM_C || game.team_c || "";
      const league = game.LEAGUE || game.league || "";
      if (!homeTeam || !awayTeam) continue;
      const scoreKey = (homeTeam + "|" + awayTeam).toLowerCase();
      const scoreInfo = scoreMap[scoreKey] || {};

      let cornerOU = null, cornerHDP = null, nextCorner = null, cornerOE = null;
      let cornerOUHalf = null, cornerHDPHalf = null;
      let corner1X2 = null, corner1X2Half = null, cornerOEHalf = null;
      // ★ 打印完整 game 数据用于调试（确认 rcn 实际返回哪些字段）
      console.log(`[cornerCrawler] rcn game 完整数据:`, JSON.stringify(game).substring(0, 800));
      // O/U — 先尝试角球专用字段，再回退到常规字段
      const rouo = parseFloat(game.RATIO_CROUO || game.ratio_crouo || game.RATIO_ROUO || game.ratio_rouo || 0);
      const iorouh = parseFloat(game.IOR_CROUO || game.ior_crouo || game.IOR_ROUH || game.ior_rouh || 0);
      const iorouc = parseFloat(game.IOR_CROUU || game.ior_crouu || game.IOR_ROUC || game.ior_rouc || 0);
      if (rouo > 0 || iorouh > 0) cornerOU = { line: rouo, overOdds: iorouc, underOdds: iorouh, locked: iorouh === 0 && iorouc === 0 };
      // HDP — 先尝试角球专用字段，再回退到常规字段
      const rre = game.RATIO_CRGH || game.ratio_crgh || game.RATIO_RE || game.ratio_re || "";
      const iorh = parseFloat(game.IOR_CRGH || game.ior_crgh || game.IOR_REH || game.ior_reh || 0);
      const iorc = parseFloat(game.IOR_CRGC || game.ior_crgc || game.IOR_REC || game.ior_rec || 0);
      if (rre || iorh > 0) cornerHDP = { line: rre, homeOdds: iorh, awayOdds: iorc, locked: iorh === 0 && iorc === 0 };
      // O/E — 大写优先
      const ioo = parseFloat(game.IOR_REOO || game.ior_reoo || 0);
      const ioe = parseFloat(game.IOR_REOE || game.ior_reoe || 0);
      if (ioo > 0 || ioe > 0) cornerOE = { oddOdds: ioo, evenOdds: ioe, locked: ioo === 0 && ioe === 0 };
      // ★ NEXT CORNER — 使用 rcn 专用字段 WTYPE_RNC / IOR_RNCH / IOR_RNCC
      const rncType = game.WTYPE_RNC || game.wtype_rnc || "";
      const rnch = parseFloat(game.IOR_RNCH || game.ior_rnch || 0);
      const rncc = parseFloat(game.IOR_RNCC || game.ior_rncc || 0);
      if (rnch > 0 || rncc > 0) nextCorner = { corner: rncType, homeOdds: rnch, awayOdds: rncc, locked: rnch === 0 && rncc === 0 };
      // ★ 上半场角球大小 (Half-time Corner O/U)
      const hrouo = parseFloat(game.RATIO_HROUO || game.ratio_hrouo || 0);
      const ihrouh = parseFloat(game.IOR_HROUH || game.ior_hrouh || 0);
      const ihrouc = parseFloat(game.IOR_HROUC || game.ior_hrouc || 0);
      if (hrouo > 0 || ihrouh > 0) cornerOUHalf = { line: hrouo, overOdds: ihrouc, underOdds: ihrouh, locked: ihrouh === 0 && ihrouc === 0 };
      // ★ 上半场角球让球 (Half-time Corner HDP)
      const hhre = game.RATIO_HRE || game.ratio_hre || "";
      const ihreh = parseFloat(game.IOR_HREH || game.ior_hreh || 0);
      const ihrec = parseFloat(game.IOR_HREC || game.ior_hrec || 0);
      if (hhre || ihreh > 0) cornerHDPHalf = { line: hhre, homeOdds: ihreh, awayOdds: ihrec, locked: ihreh === 0 && ihrec === 0 };
      // ★ 角球独赢 (Corner 1X2)
      const irgh = parseFloat(game.IOR_RGH || game.ior_rgh || 0);
      const irgc = parseFloat(game.IOR_RGC || game.ior_rgc || 0);
      const irgn = parseFloat(game.IOR_RGN || game.ior_rgn || 0);
      if (irgh > 0 || irgc > 0 || irgn > 0) corner1X2 = { homeOdds: irgh, drawOdds: irgn, awayOdds: irgc, locked: irgh === 0 && irgc === 0 && irgn === 0 };
      // ★ 上半场角球独赢 (Half-time Corner 1X2)
      const ihrgH = parseFloat(game.IOR_HRGH || game.ior_hrgh || 0);
      const ihrgC = parseFloat(game.IOR_HRGC || game.ior_hrgc || 0);
      const ihrgN = parseFloat(game.IOR_HRGN || game.ior_hrgn || 0);
      if (ihrgH > 0 || ihrgC > 0 || ihrgN > 0) corner1X2Half = { homeOdds: ihrgH, drawOdds: ihrgN, awayOdds: ihrgC, locked: ihrgH === 0 && ihrgC === 0 && ihrgN === 0 };
      // ★ 上半场角球单双 (Half-time Corner O/E)
      const ihreoe = parseFloat(game.IOR_HREOE || game.ior_hreoe || 0);
      const ihreoo = parseFloat(game.IOR_HREOO || game.ior_hreoo || 0);
      if (ihreoe > 0 || ihreoo > 0) cornerOEHalf = { oddOdds: ihreoe, evenOdds: ihreoo, locked: ihreoe === 0 && ihreoo === 0 };

      // ★ 时间 — 大写优先
      const retime = game.RETIMESET || game.re_time || scoreInfo.retime || "";
      let elapsed = 0;
      const tm = retime.match(/^(\d)H\^(\d+):(\d+)/);
      if (tm) elapsed = parseInt(tm[2], 10) + (parseInt(tm[3], 10) > 0 ? 1 : 0);
      else if (retime.includes("HT")) elapsed = 45;

      const m = {
        matchId: game.GID || game.gid || "api_" + cornerMatches.length,
        matchName: homeTeam + " vs " + awayTeam, homeTeam, awayTeam, league,
        time: formatTime(retime), elapsedMinutes: elapsed,
        homeScore: scoreInfo.homeScore || 0,
        awayScore: scoreInfo.awayScore || 0,
        homeCorners: parseInt(game.SCORE_H || game.score_h, 10) || 0,
        awayCorners: parseInt(game.SCORE_C || game.score_c, 10) || 0,
        totalCorners: (parseInt(game.SCORE_H || game.score_h, 10) || 0) + (parseInt(game.SCORE_C || game.score_c, 10) || 0),
        _cornerSource: "api",
        cornerHandicap: cornerHDP ? parseAsianHandicap(cornerHDP.line) : 0,
        cornerOdds: cornerHDP ? (cornerHDP.homeOdds || 0) : 0,
        cornerOU, cornerHDP, nextCorner, cornerOE, cornerOUHalf, cornerHDPHalf, corner1X2, corner1X2Half, cornerOEHalf,
        handicaps: buildHandicapsArray({ cornerOU, cornerHDP, nextCorner, cornerOE, cornerOUHalf, cornerHDPHalf, corner1X2, corner1X2Half, cornerOEHalf }),
        dataQuality: (cornerHDP || cornerOU || nextCorner) ? "full" : "partial",
        timestamp: Date.now(), triggeredStrategies: [], ecid: game.ECID || game.ecid || ""
      };
      console.log(`[cornerCrawler] 解析比赛: ${homeTeam} vs ${awayTeam}, cornerOU=${JSON.stringify(cornerOU)}, cornerHDP=${JSON.stringify(cornerHDP)}, nextCorner=${JSON.stringify(nextCorner)}, cornerOE=${JSON.stringify(cornerOE)}, ECID=${game.ECID || game.ecid}`);
      cornerMatches.push(m);
      // 放宽触发条件：缺少盘口数据时，尝试用 GID 作为 ecid
      const ecid = game.ECID || game.ecid || game.GID || game.gid || "";
      if (ecid && (!cornerOU || !cornerHDP)) needDetail.push({ idx: cornerMatches.length - 1, ecid: ecid });
    }

    // ★ 并行请求 get_game_more
    if (needDetail.length > 0) {
      console.log("[cornerCrawler] API: 并行请求 " + needDetail.length + " 个 get_game_more...");
      const bodies = needDetail.map(g => ["uid=" + sessionInfo.uid, "ver=" + sessionInfo.ver, "langx=en-us",
        "p=get_game_more", "from=right_panel", "gtype=ft", "showtype=live", "ltype=3", "ecid=" + g.ecid].join("&"));
      const results = await page.evaluate(async (url, bodies, opts) => {
        return await Promise.all(bodies.map(b => fetch(url, { ...opts, body: b }).then(r => r.text()).catch(() => "")));
      }, listUrl, bodies, fetchOpts);
      for (let i = 0; i < needDetail.length; i++) {
        // ★ 诊断：打印 get_game_more 原始响应
        const rawResp = results[i] || "";
        console.log(`[cornerCrawler] get_game_more[${i}] 原始响应前500字: ${rawResp.substring(0, 500)}`);
        if (!rawResp || rawResp.length < 10) {
          console.log(`[cornerCrawler] get_game_more[${i}] 响应为空或过短，跳过`);
          continue;
        }
        const moreGames = parseCornerXML(rawResp, "get_game_more");
        const m = cornerMatches[needDetail[i].idx];
        if (moreGames.length === 0) {
          console.log(`[cornerCrawler] get_game_more[${i}] 解析出 0 个 game 节点，原始响应前1000字: ${rawResp.substring(0, 1000)}`);
          continue;
        }

        console.log(`[cornerCrawler] get_game_more[${i}]: 返回 ${moreGames.length} 个 game 节点`);

        // ★ 辅助函数：大小写兼容获取字段值
        const gv = (obj, ...keys) => {
          for (const k of keys) { if (obj[k] != null && obj[k] !== "") return obj[k]; }
          return "";
        };
        const gvf = (obj, ...keys) => {
          for (const k of keys) { const v = parseFloat(obj[k]); if (!isNaN(v) && v !== 0) return v; }
          return 0;
        };

        // ★ 遍历所有 game 节点，每个节点可能包含不同盘口类型
        for (const d of moreGames) {
          console.log(`[cornerCrawler] get_game_more game节点: 字段=`, Object.keys(d).join(","));
          console.log(`[cornerCrawler] get_game_more game节点: 数据=`, JSON.stringify(d).substring(0, 800));

          // ★ 角球让球 (Corner Handicap) — 不依赖 SW 开关，直接尝试读取字段值
          if (!m.cornerHDP) {
            const h = gvf(d, "IOR_CRGH", "ior_CRGH", "IOR_REH", "ior_reh", "IOR_HDPH", "ior_hdph");
            const c = gvf(d, "IOR_CRGC", "ior_CRGC", "IOR_REC", "ior_rec", "IOR_HDPC", "ior_hdpc");
            const line = gv(d, "RATIO_CRGH", "ratio_CRGH", "RATIO_RE", "ratio_re", "RATIO_HDP", "ratio_hdp");
            if (h > 0 || c > 0 || line) {
              m.cornerHDP = {
                line: line || "",
                homeOdds: h, awayOdds: c, locked: h === 0 && c === 0
              };
              m.cornerHandicap = parseAsianHandicap(m.cornerHDP.line);
              m.cornerOdds = h;
            }
          }

          // ★ 角球大小 (Corner O/U) — 不依赖 SW 开关，直接尝试读取字段值
          if (!m.cornerOU) {
            const co = gvf(d, "RATIO_CROUO", "ratio_CROUO", "RATIO_ROUO", "ratio_rouo", "RATIO_CROU", "ratio_crou");
            const ioo = gvf(d, "IOR_CROUO", "ior_CROUO", "IOR_ROUH", "ior_rouh", "IOR_CROUH", "ior_crouh");
            const iou = gvf(d, "IOR_CROUU", "ior_CROUU", "IOR_ROUC", "ior_rouc", "IOR_CROUC", "ior_crouc");
            if (co > 0 || ioo > 0) {
              m.cornerOU = { line: co, overOdds: iou, underOdds: ioo, locked: ioo === 0 && iou === 0 };
            }
          }

          // ★ 下个角球 (Next Corner) — 不依赖 SW 开关，直接尝试读取字段值
          if (!m.nextCorner) {
            const nh = gvf(d, "IOR_CRNH", "ior_CRNH", "IOR_CROUH", "ior_CROUH",
              "IOR_CROU_NEXT_H", "ior_crou_next_h", "IOR_NEXT_H", "ior_next_h");
            const nc = gvf(d, "IOR_CRNC", "ior_CRNC", "IOR_CROUC", "ior_CROUC",
              "IOR_CROU_NEXT_C", "ior_crou_next_c", "IOR_NEXT_C", "ior_next_c");
            const cornerLine = gv(d, "RATIO_CRN", "ratio_CRN", "RATIO_CROUH", "ratio_CROUH",
              "RATIO_CROU_NEXT", "ratio_crou_next", "RATIO_NEXT", "ratio_next");
            if (nh > 0 || nc > 0) {
              m.nextCorner = {
                corner: cornerLine || "",
                homeOdds: nh, awayOdds: nc, locked: nh === 0 && nc === 0
              };
            }
          }

          // ★ 角球单双 (Corner O/E) — 不依赖 SW 开关，直接尝试读取字段值
          if (!m.cornerOE) {
            const ioo = gvf(d, "IOR_REOO", "ior_REOO", "IOR_CROO", "ior_CROO", "IOR_CROEO", "ior_croeo");
            const ioe = gvf(d, "IOR_REOE", "ior_REOE", "IOR_CROE", "ior_CROE", "IOR_CROEE", "ior_croee");
            if (ioo > 0 || ioe > 0) {
              m.cornerOE = { oddOdds: ioo, evenOdds: ioe, locked: ioo === 0 && ioe === 0 };
            }
          }

          // ★ 上半场角球大小 (Half-time Corner O/U)
          if (!m.cornerOUHalf) {
            const hco = gvf(d, "RATIO_HROUO", "ratio_hrouo", "RATIO_CROUO_H", "ratio_crouo_h");
            const hioo = gvf(d, "IOR_HROUH", "ior_hrouh", "IOR_CROUH_H", "ior_crouh_h");
            const hiou = gvf(d, "IOR_HROUC", "ior_hrouc", "IOR_CROUC_H", "ior_crouc_h");
            if (hco > 0 || hioo > 0) {
              m.cornerOUHalf = { line: hco, overOdds: hiou, underOdds: hioo, locked: hioo === 0 && hiou === 0 };
            }
          }

          // ★ 上半场角球让球 (Half-time Corner HDP)
          if (!m.cornerHDPHalf) {
            const hline = gv(d, "RATIO_HRE", "ratio_hre", "RATIO_CRGH_H", "ratio_crgh_h");
            const hiorh = gvf(d, "IOR_HREH", "ior_hreh", "IOR_CRGH_H", "ior_crgh_h");
            const hiorc = gvf(d, "IOR_HREC", "ior_hrec", "IOR_CRGC_H", "ior_crgc_h");
            if (hline || hiorh > 0) {
              m.cornerHDPHalf = { line: hline, homeOdds: hiorh, awayOdds: hiorc, locked: hiorh === 0 && hiorc === 0 };
            }
          }

          // ★ 角球独赢 (Corner 1X2)
          if (!m.corner1X2) {
            const rgh = gvf(d, "IOR_RGH", "ior_rgh");
            const rgc = gvf(d, "IOR_RGC", "ior_rgc");
            const rgn = gvf(d, "IOR_RGN", "ior_rgn");
            if (rgh > 0 || rgc > 0 || rgn > 0) {
              m.corner1X2 = { homeOdds: rgh, drawOdds: rgn, awayOdds: rgc, locked: rgh === 0 && rgc === 0 && rgn === 0 };
            }
          }

          // ★ 上半场角球独赢 (Half-time Corner 1X2)
          if (!m.corner1X2Half) {
            const hrgh = gvf(d, "IOR_HRGH", "ior_hrgh");
            const hrgc = gvf(d, "IOR_HRGC", "ior_hrgc");
            const hrgn = gvf(d, "IOR_HRGN", "ior_hrgn");
            if (hrgh > 0 || hrgc > 0 || hrgn > 0) {
              m.corner1X2Half = { homeOdds: hrgh, drawOdds: hrgn, awayOdds: hrgc, locked: hrgh === 0 && hrgc === 0 && hrgn === 0 };
            }
          }

          // ★ 上半场角球单双 (Half-time Corner O/E)
          if (!m.cornerOEHalf) {
            const hreoe = gvf(d, "IOR_HREOE", "ior_hreoe");
            const hreoo = gvf(d, "IOR_HREOO", "ior_hreoo");
            if (hreoe > 0 || hreoo > 0) {
              m.cornerOEHalf = { oddOdds: hreoe, evenOdds: hreoo, locked: hreoe === 0 && hreoo === 0 };
            }
          }
        }

        // 更新 handicaps 和 dataQuality
        m.handicaps = buildHandicapsArray({ cornerOU: m.cornerOU, cornerHDP: m.cornerHDP, nextCorner: m.nextCorner, cornerOE: m.cornerOE, cornerOUHalf: m.cornerOUHalf, cornerHDPHalf: m.cornerHDPHalf, corner1X2: m.corner1X2, corner1X2Half: m.corner1X2Half, cornerOEHalf: m.cornerOEHalf });
        m.dataQuality = (m.cornerHDP || m.cornerOU || m.nextCorner) ? "full" : "partial";
        console.log(`[cornerCrawler] get_game_more 结果: ${m.homeTeam} vs ${m.awayTeam}, cornerOU=${JSON.stringify(m.cornerOU)}, cornerHDP=${JSON.stringify(m.cornerHDP)}, nextCorner=${JSON.stringify(m.nextCorner)}, cornerOE=${JSON.stringify(m.cornerOE)}`);
      }
    }

    console.log("[cornerCrawler] API: 完成 " + cornerMatches.length + " 场，耗时 " + (Date.now() - _start) + "ms");

    // ★ 当角球比赛为空但 rrnou 有让球/大小数据时，从 rrnou 创建比赛条目
    const cornerMatchIds = new Set(cornerMatches.map(m => m.matchId));
    const cornerTeamKeys = new Set(cornerMatches.map(m => (m.homeTeam + "|" + m.awayTeam).toLowerCase()));
    for (const g of rnouGames) {
      const ht = g.TEAM_H || g.team_h || "";
      const at = g.TEAM_C || g.team_c || "";
      const gid = g.GID || g.gid || "";
      const teamKey = (ht + "|" + at).toLowerCase();
      if (cornerMatchIds.has(gid) || cornerTeamKeys.has(teamKey)) continue;
      if (!ht || !at) continue;

      const retime = g.RETIMESET || g.re_time || "";
      let elapsed = 0;
      const tm = retime.match(/^(\d)H\^(\d+):(\d+)/);
      if (tm) elapsed = parseInt(tm[2], 10) + (parseInt(tm[3], 10) > 0 ? 1 : 0);
      else if (retime.includes("HT")) elapsed = 45;

      const m = {
        matchId: gid || "rnou_" + cornerMatches.length,
        matchName: ht + " vs " + at,
        homeTeam: ht, awayTeam: at,
        league: g.LEAGUE || g.league || "",
        time: formatTime(retime), elapsedMinutes: elapsed,
        homeScore: parseInt(g.SCORE_H || g.score_h, 10) || 0,
        awayScore: parseInt(g.SCORE_C || g.score_c, 10) || 0,
        totalCorners: 0, homeCorners: 0, awayCorners: 0,
        _cornerSource: "none",
        cornerHandicap: 0, cornerOdds: 0,
        cornerOU: null, cornerHDP: null, nextCorner: null, cornerOE: null,
        handicaps: [],
        dataQuality: "hdp_only",
        timestamp: Date.now(), triggeredStrategies: [],
        ecid: g.ECID || g.ecid || "",
      };
      cornerMatches.push(m);
      cornerMatchIds.add(m.matchId);
      cornerTeamKeys.add(teamKey);
    }

    for (const m of cornerMatches.slice(0, 5)) {
      const h = m.cornerHDP || {}, o = m.cornerOU || {};
      console.log("  " + (m.league || "") + ": " + m.homeTeam + " vs " + m.awayTeam +
        (m.elapsedMinutes ? " @" + m.elapsedMinutes + "'" : "") +
        (m.homeScore || m.awayScore ? " " + m.homeScore + "-" + m.awayScore : "") +
        (h.line ? " hdp:" + h.line : "") + (o.line ? " ou:" + o.line : ""));
    }

    // ★ 构建 mainMarkets 数据（用于前端 "让球和大小" tab）
    // rrnou 字段名全大写：TEAM_H, TEAM_C, LEAGUE, SCORE_H, SCORE_C, RETIMESET, RATIO_RE, IOR_REH, RATIO_ROUO, IOR_ROUH 等
    // ★ 还包含 A_sub_*, B_sub_*, C_sub_* 子盘口数据
    const mainMarkets = {};
    for (const g of rnouGames) {
      const key = (g.TEAM_H || g.team_h || "") + "|" + (g.TEAM_C || g.team_c || "");
      const gid = g.GID || g.gid || "";
      const hdpItems = [];
      const ouItems = [];
      const hdpHalfItems = [];
      const ouHalfItems = [];

      // ★ 诊断：打印首个 rrnou game 的完整数据
      if (Object.keys(mainMarkets).length === 0) {
        console.log(`[cornerCrawler] rrnou 首个 game 完整数据:`, JSON.stringify(g).substring(0, 2000));
      }

      // ★ 辅助函数：提取指定前缀的盘口数据
      const extractMarketItems = (prefix, g) => {
        const p = prefix ? prefix + "_" : "";
        const items = { hdp: [], ou: [], hdpHalf: [], ouHalf: [] };
        // 全场让球
        const ratioRe = g[p + "RATIO_RE"] || "";
        const iorReh = parseFloat(g[p + "IOR_REH"]) || 0;
        const iorRec = parseFloat(g[p + "IOR_REC"]) || 0;
        if (ratioRe || iorReh > 0) {
          items.hdp.push({ line: ratioRe, homeOdds: iorReh, awayOdds: iorRec });
        }
        // 全场大小
        const ratioRouo = parseFloat(g[p + "RATIO_ROUO"]) || 0;
        const iorRouh = parseFloat(g[p + "IOR_ROUH"]) || 0;
        const iorRouc = parseFloat(g[p + "IOR_ROUC"]) || 0;
        if (ratioRouo > 0 || iorRouh > 0) {
          items.ou.push({ line: ratioRouo, overOdds: iorRouc, underOdds: iorRouh });
        }
        // 上半场让球
        const ratioHre = g[p + "RATIO_HRE"] || "";
        const iorHreh = parseFloat(g[p + "IOR_HREH"]) || 0;
        const iorHrec = parseFloat(g[p + "IOR_HREC"]) || 0;
        if (ratioHre || iorHreh > 0) {
          items.hdpHalf.push({ line: ratioHre, homeOdds: iorHreh, awayOdds: iorHrec });
        }
        // 上半场大小
        const ratioHrouo = parseFloat(g[p + "RATIO_HROUO"]) || 0;
        const iorHrouh = parseFloat(g[p + "IOR_HROUH"]) || 0;
        const iorHrouc = parseFloat(g[p + "IOR_HROUC"]) || 0;
        if (ratioHrouo > 0 || iorHrouh > 0) {
          items.ouHalf.push({ line: ratioHrouo, overOdds: iorHrouc, underOdds: iorHrouh });
        }
        return items;
      };

      // 主盘口
      const main = extractMarketItems("", g);
      hdpItems.push(...main.hdp);
      ouItems.push(...main.ou);
      hdpHalfItems.push(...main.hdpHalf);
      ouHalfItems.push(...main.ouHalf);

      // A/B/C 子盘口
      for (const sub of ["A_sub", "B_sub", "C_sub"]) {
        const subItems = extractMarketItems(sub, g);
        hdpItems.push(...subItems.hdp);
        ouItems.push(...subItems.ou);
        hdpHalfItems.push(...subItems.hdpHalf);
        ouHalfItems.push(...subItems.ouHalf);
      }

      if (hdpItems.length > 0 || ouItems.length > 0 || hdpHalfItems.length > 0 || ouHalfItems.length > 0) {
        const marketData = {
          league: g.LEAGUE || g.league || "",
          time: formatTime(g.RETIMESET || g.re_time || ""),
          homeScore: parseInt(g.SCORE_H || g.score_h, 10) || 0,
          awayScore: parseInt(g.SCORE_C || g.score_c, 10) || 0,
          hdp: hdpItems,
          ou: ouItems,
          hdpHalf: hdpHalfItems,
          ouHalf: ouHalfItems
        };
        // ★ 同时使用 homeTeam|awayTeam 和 gid 作为 key，方便前端匹配
        // 合并而非覆盖：如果 key 已存在（角球数据），追加常规盘口字段
        const mergeTo = (k) => {
          if (mainMarkets[k]) {
            Object.assign(mainMarkets[k], marketData);
          } else {
            mainMarkets[k] = { ...marketData };
          }
        };
        mergeTo(key);
        if (gid) mergeTo(gid);
      }
    }
    console.log("[cornerCrawler] mainMarkets: " + Object.keys(mainMarkets).length + " 场有盘口数据");

    return { matches: cornerMatches, mainMarkets };
  } catch (e) {
    console.error("[cornerCrawler] API: 失败:", e.message);
    return null;
  }
}

// ======================== 数据映射 ========================
function mapToCornerMatch(apiMatch) {
  const matchId = String(
    apiMatch.id || apiMatch.match_id || apiMatch.matchId || apiMatch._id ||
    apiMatch.event_id || apiMatch.eventId || apiMatch.game_id || apiMatch.gameId || ""
  );

  const homeTeam = apiMatch.home || apiMatch.homeTeam || apiMatch.home_team ||
                   apiMatch.team1 || apiMatch.team_home || apiMatch.h_name ||
                   apiMatch.homeName || apiMatch.name_home || apiMatch.team_h || "";
  const awayTeam = apiMatch.away || apiMatch.awayTeam || apiMatch.away_team ||
                   apiMatch.team2 || apiMatch.team_away || apiMatch.a_name ||
                   apiMatch.awayName || apiMatch.name_away || apiMatch.team_a || "";

  let elapsedMinutes = 0;
  if (apiMatch.timer !== undefined && apiMatch.timer !== null) {
    if (typeof apiMatch.timer === "number") {
      elapsedMinutes = Math.floor(apiMatch.timer / 60);
    } else if (typeof apiMatch.timer === "string") {
      const parts = apiMatch.timer.split(":");
      elapsedMinutes = parts.length === 2 ? (parseInt(parts[0], 10) || 0) : (parseInt(apiMatch.timer, 10) || 0);
    }
  } else if (apiMatch.elapsed !== undefined) {
    elapsedMinutes = parseInt(apiMatch.elapsed, 10) || 0;
  } else if (apiMatch.minute !== undefined) {
    elapsedMinutes = parseInt(apiMatch.minute, 10) || 0;
  } else if (apiMatch.elapsedMinutes !== undefined) {
    elapsedMinutes = parseInt(apiMatch.elapsedMinutes, 10) || 0;
  }

  return {
    matchId, homeTeam, awayTeam, elapsedMinutes,
    homeScore: parseInt(apiMatch.homeScore || apiMatch.home_score || 0, 10) || 0,
    awayScore: parseInt(apiMatch.awayScore || apiMatch.away_score || 0, 10) || 0,
    homeCorners: parseInt(apiMatch.homeCorners || apiMatch.home_corners || 0, 10) || 0,
    awayCorners: parseInt(apiMatch.awayCorners || apiMatch.away_corners || 0, 10) || 0,
    handicap: parseFloat(apiMatch.corner_handicap ?? apiMatch.cornerHandicap ?? apiMatch.handicap ?? 0) || 0,
    odds: parseFloat(apiMatch.corner_odds ?? apiMatch.cornerOdds ?? apiMatch.odds ?? 0) || 0,
    strategy: []
  };
}



function pickBestResponse(captured) {
  if (captured.length === 0) return null;
  const scored = captured.map(c => {
    let score = 0;
    const sample = c.matchList[0] || {};
    if (sample.home || sample.homeTeam || sample.home_team || sample.team1) score += 10;
    if (sample.away || sample.awayTeam || sample.away_team || sample.team2) score += 10;
    if ("corner_handicap" in sample || "cornerHandicap" in sample || "handicap" in sample) score += 15;
    if ("corner_odds" in sample || "cornerOdds" in sample || "odds" in sample) score += 10;
    score += Math.min(c.itemCount, 50) * 0.1;
    const url = c.url.toLowerCase();
    if (url.includes("live")) score += 5;
    if (url.includes("corner")) score += 5;
    if (url.includes("match")) score += 3;
    return { ...c, score };
  });
  scored.sort((a, b) => b.score - a.score);
  return scored[0];
}

// ======================== 并发锁（变量已移至顶部） ========================


// ======================== 辅助：将 parseCornerMarkets 返回格式转为 handicaps 数组 ========================
function buildHandicapsArray(m) {
  const result = [];
  let order = 1;
  if (m.cornerOU) {
    result.push({
      order: order++, category: "O/U", categoryLabel: "O/U",
      period: "full", line: m.cornerOU.line || 0,
      odds: { over: m.cornerOU.overOdds || 0, under: m.cornerOU.underOdds || 0 },
      source: "dom", marketGroup: "corner",
      locked: m.cornerOU.locked || false
    });
  }
  if (m.cornerHDP) {
    result.push({
      order: order++, category: "HDP", categoryLabel: "HDP",
      period: "full", line: m.cornerHDP.line || "",
      odds: { home: m.cornerHDP.homeOdds || 0, away: m.cornerHDP.awayOdds || 0 },
      source: "dom", marketGroup: "corner",
      locked: m.cornerHDP.locked || false
    });
  }
  if (m.cornerOUHalf) {
    result.push({
      order: order++, category: "O/U", categoryLabel: "上半场 O/U",
      period: "half", line: m.cornerOUHalf.line || 0,
      odds: { over: m.cornerOUHalf.overOdds || 0, under: m.cornerOUHalf.underOdds || 0 },
      source: "dom", marketGroup: "corner",
      locked: m.cornerOUHalf.locked || false
    });
  }
  if (m.cornerHDPHalf) {
    result.push({
      order: order++, category: "HDP", categoryLabel: "上半场 HDP",
      period: "half", line: m.cornerHDPHalf.line || "",
      odds: { home: m.cornerHDPHalf.homeOdds || 0, away: m.cornerHDPHalf.awayOdds || 0 },
      source: "dom", marketGroup: "corner",
      locked: m.cornerHDPHalf.locked || false
    });
  }
  if (m.nextCorner) {
    // 解析角球编号：支持16进制编码（RNCB=11, RNCC=12, RNC4=4）
    let cornerText = (m.nextCorner.corner || "").trim();
    let cornerNum = "";

    // 方法1：提取RNC后的16进制部分并解码
    const rncMatch = cornerText.match(/RNC([0-9A-Fa-f]+)/i);
    if (rncMatch) {
      const hexVal = parseInt(rncMatch[1], 16);
      if (!isNaN(hexVal) && hexVal > 0) cornerNum = String(hexVal);
    }

    // 方法2：回退提取中文数字
    if (!cornerNum) {
      const cnNumMap = {'一':'1','二':'2','三':'3','四':'4','五':'5','六':'6','七':'7','八':'8','九':'9','十':'10','十一':'11','十二':'12','十三':'13','十四':'14','十五':'15'};
      const cnMatch = cornerText.match(/[一二三四五六七八九十]+/);
      if (cnMatch && cnNumMap[cnMatch[0]]) cornerNum = cnNumMap[cnMatch[0]];
    }

    // 方法3：回退提取阿拉伯数字
    if (!cornerNum) {
      cornerNum = cornerText.replace(/[^0-9]/g, "");
    }

    // 方法4：最终回退使用 totalCorners+1
    if (!cornerNum) {
      const totalCorners = m.totalCorners ?? m.homeCorners + m.awayCorners ?? 0;
      cornerNum = String(totalCorners + 1);
    }

    result.push({
      order: order++, category: "NEXT", categoryLabel: "NEXT CORNER",
      period: "full", line: cornerNum,
      odds: { home: m.nextCorner.homeOdds || 0, away: m.nextCorner.awayOdds || 0 },
      source: "dom", marketGroup: "corner",
      locked: m.nextCorner.locked || false
    });
  }
  if (m.cornerOE) {
    result.push({
      order: order++, category: "O/E", categoryLabel: "O/E",
      period: "full", odds: { odd: m.cornerOE.oddOdds || 0, even: m.cornerOE.evenOdds || 0 },
      source: "dom", marketGroup: "corner",
      locked: m.cornerOE.locked || false
    });
  }
  if (m.corner1X2) {
    result.push({
      order: order++, category: "1X2", categoryLabel: "独赢",
      period: "full",
      odds: { home: m.corner1X2.homeOdds || 0, draw: m.corner1X2.drawOdds || 0, away: m.corner1X2.awayOdds || 0 },
      source: "dom", marketGroup: "corner",
      locked: m.corner1X2.locked || false
    });
  }
  if (m.corner1X2Half) {
    result.push({
      order: order++, category: "1X2", categoryLabel: "上半场独赢",
      period: "half",
      odds: { home: m.corner1X2Half.homeOdds || 0, draw: m.corner1X2Half.drawOdds || 0, away: m.corner1X2Half.awayOdds || 0 },
      source: "dom", marketGroup: "corner",
      locked: m.corner1X2Half.locked || false
    });
  }
  if (m.cornerOEHalf) {
    result.push({
      order: order++, category: "O/E", categoryLabel: "上半场单/双",
      period: "half",
      odds: { odd: m.cornerOEHalf.oddOdds || 0, even: m.cornerOEHalf.evenOdds || 0 },
      source: "dom", marketGroup: "corner",
      locked: m.cornerOEHalf.locked || false
    });
  }
  return result;
}

// ======================== 纯 HTTP 数据获取路径 ========================

// ======================== 登录冷却机制 ========================
let lastLoginFailureTime = 0;
const LOGIN_COOLDOWN_MS = 120000;

async function _processHttpResults(rcnResult, rnouResult, uid, ver, cookieStr) {
  // 检测 CheckEMNU 响应（今日数据可能需要 EMNU 验证）
  if (rcnResult.data === "CheckEMNU") {
    console.warn("[cornerCrawler] 纯HTTP: rcn 返回 CheckEMNU，跳过今日角球数据");
    rcnResult.data = "";
  }
  if (rnouResult.data === "CheckEMNU") {
    console.warn("[cornerCrawler] 纯HTTP: rnou 返回 CheckEMNU，跳过今日比分数据");
    rnouResult.data = "";
  }

  if (rcnResult.expired || rnouResult.expired) {
    console.warn("[cornerCrawler] 纯HTTP: 会话已过期，触发 autoLogin 重新登录...");
    invalidateCookieCache();
    try {
      const loginResult = await withLoginMutex(async () => {
        const { autoLoginAndGetCredentials } = await import("./autoLogin.js");
        const savedLogin = getSavedLoginCredentials();
        return await autoLoginAndGetCredentials({
          username: savedLogin?.username || process.env.HG_USERNAME || "",
          password: savedLogin?.password || process.env.HG_PASSWORD || "",
        });
      });
      if (!loginResult.success || !loginResult.uid || !loginResult.ver) return null;
      updateCredentials({ uid: loginResult.uid, ver: loginResult.ver, cookies: loginResult.cookies || [] });
    } catch (e) {
      console.warn("[cornerCrawler] 纯HTTP: 重新登录失败:", e.message);
      return null;
    }
    const newCreds = loadCredentials();
    if (!newCreds) return null;
    const [retryRcn, retryRnou] = await Promise.all([
      fetchCornerData(newCreds.uid, newCreds.ver, newCreds.cookieStr),
      fetchHdpOuData(newCreds.uid, newCreds.ver, newCreds.cookieStr),
    ]);
    if (retryRcn.expired) return null;
    rcnResult.data = retryRcn.data;
    rcnResult.expired = retryRcn.expired;
    rnouResult.data = retryRnou.data;
    rnouResult.expired = retryRnou.expired;
  }

  const rcnXml = rcnResult.data;
  const rnouXml = rnouResult.data;

  // ★ 即使 rcn 为空，rrnou 仍可能有 HDP/O/U 数据，不能直接返回 null
  const games = (!rcnXml || rcnXml.length < 10) ? [] : parseCornerXML(rcnXml, "rcn");
  console.log("[cornerCrawler] 纯HTTP: 角球列表返回 " + games.length + " 场比赛");

  // ★ 先解析 rrnou 数据（无论角球是否为空，HDP/O/U 数据都需要）
  const rnouGames = parseCornerXML(rnouXml || "", "rrnou");
  console.log("[cornerCrawler] 纯HTTP: rrnou 返回 " + rnouGames.length + " 场比赛数据");

  // 如果角球和 rrnou 都为空，才返回 null
  if (games.length === 0 && rnouGames.length === 0) {
    console.warn("[cornerCrawler] 纯HTTP: rcn 和 rrnou 数据均为空");
    return null;
  }

  const scoreMap = {};
  for (const g of rnouGames) {
    const ht = g.TEAM_H || g.team_h || "";
    const at = g.TEAM_C || g.team_c || "";
    const key = (ht + "|" + at).toLowerCase();
    scoreMap[key] = {
      homeScore: parseInt(g.SCORE_H || g.score_h, 10) || 0,
      awayScore: parseInt(g.SCORE_C || g.score_c, 10) || 0,
      retime: g.RETIMESET || g.re_time || ""
    };
  }

  const cornerMatches = [];
  const needDetail = [];
  for (const game of games) {
    const homeTeam = game.TEAM_H || game.team_h || "";
    const awayTeam = game.TEAM_C || game.team_c || "";
    const league = game.LEAGUE || game.league || "";
    if (!homeTeam || !awayTeam) continue;
    const scoreKey = (homeTeam + "|" + awayTeam).toLowerCase();
    const scoreInfo = scoreMap[scoreKey] || {};

    let cornerOU = null, cornerHDP = null, nextCorner = null, cornerOE = null;
    let cornerOUHalf = null, cornerHDPHalf = null;
    const rouo = parseFloat(game.RATIO_CROUO || game.ratio_crouo || game.RATIO_ROUO || game.ratio_rouo || 0);
    const iorouh = parseFloat(game.IOR_CROUO || game.ior_crouo || game.IOR_ROUH || game.ior_rouh || 0);
    const iorouc = parseFloat(game.IOR_CROUU || game.ior_crouu || game.IOR_ROUC || game.ior_rouc || 0);
    if (rouo > 0 || iorouh > 0) cornerOU = { line: rouo, overOdds: iorouc, underOdds: iorouh, locked: iorouh === 0 && iorouc === 0 };
    const rre = game.RATIO_CRGH || game.ratio_crgh || game.RATIO_RE || game.ratio_re || "";
    const iorh = parseFloat(game.IOR_CRGH || game.ior_crgh || game.IOR_REH || game.ior_reh || 0);
    const iorc = parseFloat(game.IOR_CRGC || game.ior_crgc || game.IOR_REC || game.ior_rec || 0);
    if (rre || iorh > 0) cornerHDP = { line: rre, homeOdds: iorh, awayOdds: iorc, locked: iorh === 0 && iorc === 0 };
    const ioo = parseFloat(game.IOR_REOO || game.ior_reoo || 0);
    const ioe = parseFloat(game.IOR_REOE || game.ior_reoe || 0);
    if (ioo > 0 || ioe > 0) cornerOE = { oddOdds: ioo, evenOdds: ioe, locked: ioo === 0 && ioe === 0 };
    const rncType = game.WTYPE_RNC || game.wtype_rnc || "";
    const rnch = parseFloat(game.IOR_RNCH || game.ior_rnch || 0);
    const rncc = parseFloat(game.IOR_RNCC || game.ior_rncc || 0);
    if (rnch > 0 || rncc > 0) nextCorner = { corner: rncType, homeOdds: rnch, awayOdds: rncc, locked: rnch === 0 && rncc === 0 };
    // ★ 上半场角球大小 (Half-time Corner O/U)
    const hrouo = parseFloat(game.RATIO_HROUO || game.ratio_hrouo || 0);
    const ihrouh = parseFloat(game.IOR_HROUH || game.ior_hrouh || 0);
    const ihrouc = parseFloat(game.IOR_HROUC || game.ior_hrouc || 0);
    if (hrouo > 0 || ihrouh > 0) cornerOUHalf = { line: hrouo, overOdds: ihrouc, underOdds: ihrouh, locked: ihrouh === 0 && ihrouc === 0 };
    // ★ 上半场角球让球 (Half-time Corner HDP)
    const hhre = game.RATIO_HRE || game.ratio_hre || "";
    const ihreh = parseFloat(game.IOR_HREH || game.ior_hreh || 0);
    const ihrec = parseFloat(game.IOR_HREC || game.ior_hrec || 0);
    if (hhre || ihreh > 0) cornerHDPHalf = { line: hhre, homeOdds: ihreh, awayOdds: ihrec, locked: ihreh === 0 && ihrec === 0 };

    const retime = game.RETIMESET || game.re_time || scoreInfo.retime || "";
    let elapsed = 0;
    const tm = retime.match(/^(\d)H\^(\d+):(\d+)/);
    if (tm) elapsed = parseInt(tm[2], 10) + (parseInt(tm[3], 10) > 0 ? 1 : 0);
    else if (retime.includes("HT")) elapsed = 45;

    const m = {
      matchId: game.GID || game.gid || "api_" + cornerMatches.length,
      matchName: homeTeam + " vs " + awayTeam, homeTeam, awayTeam, league,
      time: formatTime(retime), elapsedMinutes: elapsed,
      homeScore: scoreInfo.homeScore || 0, awayScore: scoreInfo.awayScore || 0,
      homeCorners: parseInt(game.SCORE_H || game.score_h, 10) || 0,
      awayCorners: parseInt(game.SCORE_C || game.score_c, 10) || 0,
      totalCorners: (parseInt(game.SCORE_H || game.score_h, 10) || 0) + (parseInt(game.SCORE_C || game.score_c, 10) || 0),
      _cornerSource: "api",
      cornerHandicap: cornerHDP ? parseAsianHandicap(cornerHDP.line) : 0,
      cornerOdds: cornerHDP ? (cornerHDP.homeOdds || 0) : 0,
      cornerOU, cornerHDP, nextCorner, cornerOE, cornerOUHalf, cornerHDPHalf,
      handicaps: buildHandicapsArray({ cornerOU, cornerHDP, nextCorner, cornerOE, cornerOUHalf, cornerHDPHalf }),
      dataQuality: (cornerHDP || cornerOU || nextCorner) ? "full" : "partial",
      timestamp: Date.now(), triggeredStrategies: [], ecid: game.ECID || game.ecid || ""
    };
    cornerMatches.push(m);
    const ecid = game.ECID || game.ecid || game.GID || game.gid || "";
    if (ecid && (!cornerOU || !cornerHDP)) needDetail.push({ idx: cornerMatches.length - 1, ecid: ecid });
  }

  if (needDetail.length > 0) {
    console.log("[cornerCrawler] 纯HTTP: 并行请求 " + needDetail.length + " 个 get_game_more...");
    const detailPromises = needDetail.map(g =>
      fetchGameDetail(uid, ver, cookieStr, g.ecid).catch(() => ({ data: "", expired: false }))
    );
    const detailResults = await Promise.all(detailPromises);
    for (let i = 0; i < needDetail.length; i++) {
      const rawResp = detailResults[i].data || "";
      if (!rawResp || rawResp.length < 10) continue;
      const moreGames = parseCornerXML(rawResp, "get_game_more");
      const m = cornerMatches[needDetail[i].idx];
      if (moreGames.length === 0) continue;
      const gv = (obj, ...keys) => { for (const k of keys) { if (obj[k] != null && obj[k] !== "") return obj[k]; } return ""; };
      const gvf = (obj, ...keys) => { for (const k of keys) { const v = parseFloat(obj[k]); if (!isNaN(v) && v !== 0) return v; } return 0; };
      for (const d of moreGames) {
        const ptype = gv(d, "PTYPE", "ptype");
        if (!ptype || !ptype.includes("Corners")) continue;
        if (!m.cornerOU) {
          const rouo = gvf(d, "RATIO_CROUO", "ratio_crouo", "RATIO_ROUO", "ratio_rouo");
          const iorouh = gvf(d, "IOR_CROUO", "ior_crouo", "IOR_ROUH", "ior_rouh");
          const iorouc = gvf(d, "IOR_CROUU", "ior_crouu", "IOR_ROUC", "ior_rouc");
          if (rouo > 0 || iorouh > 0) m.cornerOU = { line: rouo, overOdds: iorouc, underOdds: iorouh, locked: iorouh === 0 && iorouc === 0 };
        }
        if (!m.cornerHDP) {
          const rre = gv(d, "RATIO_CRGH", "ratio_crgh", "RATIO_RE", "ratio_re");
          const iorh = gvf(d, "IOR_CRGH", "ior_crgh", "IOR_REH", "ior_reh");
          const iorc = gvf(d, "IOR_CRGC", "ior_crgc", "IOR_REC", "ior_rec");
          if (rre || iorh > 0) {
            m.cornerHDP = { line: rre, homeOdds: iorh, awayOdds: iorc, locked: iorh === 0 && iorc === 0 };
            m.cornerHandicap = parseAsianHandicap(rre);
            m.cornerOdds = iorh;
          }
        }
        // ★ 上半场角球大小 (Half-time Corner O/U)
        if (!m.cornerOUHalf) {
          const hco = gvf(d, "RATIO_HROUO", "ratio_hrouo", "RATIO_CROUO_H", "ratio_crouo_h");
          const hioo = gvf(d, "IOR_HROUH", "ior_hrouh", "IOR_CROUH_H", "ior_crouh_h");
          const hiou = gvf(d, "IOR_HROUC", "ior_hrouc", "IOR_CROUC_H", "ior_crouc_h");
          if (hco > 0 || hioo > 0) {
            m.cornerOUHalf = { line: hco, overOdds: hiou, underOdds: hioo, locked: hioo === 0 && hiou === 0 };
          }
        }
        // ★ 上半场角球让球 (Half-time Corner HDP)
        if (!m.cornerHDPHalf) {
          const hline = gv(d, "RATIO_HRE", "ratio_hre", "RATIO_CRGH_H", "ratio_crgh_h");
          const hiorh = gvf(d, "IOR_HREH", "ior_hreh", "IOR_CRGH_H", "ior_crgh_h");
          const hiorc = gvf(d, "IOR_HREC", "ior_hrec", "IOR_CRGC_H", "ior_crgc_h");
          if (hline || hiorh > 0) {
            m.cornerHDPHalf = { line: hline, homeOdds: hiorh, awayOdds: hiorc, locked: hiorh === 0 && hiorc === 0 };
          }
        }
      }
      m.handicaps = buildHandicapsArray({ cornerOU: m.cornerOU, cornerHDP: m.cornerHDP, nextCorner: m.nextCorner, cornerOE: m.cornerOE, cornerOUHalf: m.cornerOUHalf, cornerHDPHalf: m.cornerHDPHalf });
      m.dataQuality = (m.cornerHDP || m.cornerOU || m.nextCorner) ? "full" : "partial";
    }
  }

  // ★ 当角球比赛为空但 rrnou 有让球/大小数据时，从 rrnou 创建比赛条目
  const cornerMatchIds = new Set(cornerMatches.map(m => m.matchId));
  const cornerTeamKeys = new Set(cornerMatches.map(m => (m.homeTeam + "|" + m.awayTeam).toLowerCase()));
  for (const g of rnouGames) {
    const ht = g.TEAM_H || g.team_h || "";
    const at = g.TEAM_C || g.team_c || "";
    const gid = g.GID || g.gid || "";
    const teamKey = (ht + "|" + at).toLowerCase();
    // 跳过已在角球列表中的比赛
    if (cornerMatchIds.has(gid) || cornerTeamKeys.has(teamKey)) continue;
    if (!ht || !at) continue;

    const retime = g.RETIMESET || g.re_time || "";
    let elapsed = 0;
    const tm = retime.match(/^(\d)H\^(\d+):(\d+)/);
    if (tm) elapsed = parseInt(tm[2], 10) + (parseInt(tm[3], 10) > 0 ? 1 : 0);
    else if (retime.includes("HT")) elapsed = 45;

    const m = {
      matchId: gid || "rnou_" + cornerMatches.length,
      matchName: ht + " vs " + at,
      homeTeam: ht, awayTeam: at,
      league: g.LEAGUE || g.league || "",
      time: formatTime(retime), elapsedMinutes: elapsed,
      homeScore: parseInt(g.SCORE_H || g.score_h, 10) || 0,
      awayScore: parseInt(g.SCORE_C || g.score_c, 10) || 0,
      totalCorners: 0, homeCorners: 0, awayCorners: 0,
      _cornerSource: "none",
      cornerHandicap: 0, cornerOdds: 0,
      cornerOU: null, cornerHDP: null, nextCorner: null, cornerOE: null,
      handicaps: [],
      dataQuality: "hdp_only",
      timestamp: Date.now(), triggeredStrategies: [],
      ecid: g.ECID || g.ecid || "",
    };
    cornerMatches.push(m);
    cornerMatchIds.add(m.matchId);
    cornerTeamKeys.add(teamKey);
  }

  const mainMarkets = {};
  // ★ 角球盘口（按 matchId 索引）
  for (const m of cornerMatches) {
    if (m.cornerOU || m.cornerHDP) {
      mainMarkets[m.matchId] = { cornerOU: m.cornerOU, cornerHDP: m.cornerHDP, nextCorner: m.nextCorner, cornerOE: m.cornerOE, cornerOUHalf: m.cornerOUHalf, cornerHDPHalf: m.cornerHDPHalf, corner1X2: m.corner1X2, corner1X2Half: m.corner1X2Half, cornerOEHalf: m.cornerOEHalf };
    }
  }
  // ★ 让球/大小盘口（从 rrnou 数据构建，按 matchId 和 homeTeam|awayTeam 双索引）
  // 注意：gid 可能与角球数据的 matchId 相同，需要合并而非覆盖
  for (const g of rnouGames) {
    const ht = g.TEAM_H || g.team_h || "";
    const at = g.TEAM_C || g.team_c || "";
    const gid = g.GID || g.gid || "";
    const teamKey = ht + "|" + at;
    const hdpItems = [], ouItems = [], hdpHalfItems = [], ouHalfItems = [];

    const extractMarketItems = (prefix, g) => {
      const p = prefix ? prefix + "_" : "";
      const items = { hdp: [], ou: [], hdpHalf: [], ouHalf: [] };
      const ratioRe = g[p + "RATIO_RE"] || "";
      const iorReh = parseFloat(g[p + "IOR_REH"]) || 0;
      const iorRec = parseFloat(g[p + "IOR_REC"]) || 0;
      if (ratioRe || iorReh > 0) items.hdp.push({ line: ratioRe, homeOdds: iorReh, awayOdds: iorRec });
      const ratioRouo = parseFloat(g[p + "RATIO_ROUO"]) || 0;
      const iorRouh = parseFloat(g[p + "IOR_ROUH"]) || 0;
      const iorRouc = parseFloat(g[p + "IOR_ROUC"]) || 0;
      if (ratioRouo > 0 || iorRouh > 0) items.ou.push({ line: ratioRouo, overOdds: iorRouc, underOdds: iorRouh });
      const ratioHre = g[p + "RATIO_HRE"] || "";
      const iorHreh = parseFloat(g[p + "IOR_HREH"]) || 0;
      const iorHrec = parseFloat(g[p + "IOR_HREC"]) || 0;
      if (ratioHre || iorHreh > 0) items.hdpHalf.push({ line: ratioHre, homeOdds: iorHreh, awayOdds: iorHrec });
      const ratioHrouo = parseFloat(g[p + "RATIO_HROUO"]) || 0;
      const iorHrouh = parseFloat(g[p + "IOR_HROUH"]) || 0;
      const iorHrouc = parseFloat(g[p + "IOR_HROUC"]) || 0;
      if (ratioHrouo > 0 || iorHrouh > 0) items.ouHalf.push({ line: ratioHrouo, overOdds: iorHrouc, underOdds: iorHrouh });
      return items;
    };

    const main = extractMarketItems("", g);
    hdpItems.push(...main.hdp); ouItems.push(...main.ou);
    hdpHalfItems.push(...main.hdpHalf); ouHalfItems.push(...main.ouHalf);
    for (const sub of ["A_sub", "B_sub", "C_sub"]) {
      const subItems = extractMarketItems(sub, g);
      hdpItems.push(...subItems.hdp); ouItems.push(...subItems.ou);
      hdpHalfItems.push(...subItems.hdpHalf); ouHalfItems.push(...subItems.ouHalf);
    }

    if (hdpItems.length > 0 || ouItems.length > 0 || hdpHalfItems.length > 0 || ouHalfItems.length > 0) {
      const marketData = { hdp: hdpItems, ou: ouItems, hdpHalf: hdpHalfItems, ouHalf: ouHalfItems };
      // ★ 合并到 mainMarkets：如果 key 已存在（角球数据），追加常规盘口字段而非覆盖
      const mergeTo = (key) => {
        if (mainMarkets[key]) {
          Object.assign(mainMarkets[key], marketData);
        } else {
          mainMarkets[key] = { ...marketData };
        }
      };
      mergeTo(teamKey);
      if (gid) mergeTo(gid);
    }
  }

  console.log("[cornerCrawler] 纯HTTP: 完成，" + cornerMatches.length + " 场比赛, mainMarkets: " + Object.keys(mainMarkets).length);
  for (const m of cornerMatches) { m._dataSource = "http"; }

  // ★ 异步保活：发送轻量请求维持网站会话
  setTimeout(() => {
    validateCredentials(uid, ver, cookieStr).catch(() => {});
  }, 3000);

  return {
    success: true,
    data: { matches: cornerMatches, allText: [], allElements: [] },
    count: cornerMatches.length,
    timestamp: new Date().toISOString(),
    mainMarkets: mainMarkets,
  };
}

async function _crawlViaPureHttp() {
  // 1. 直接加载凭证（不前置验证，直接尝试请求）
  let creds = loadCredentials();
  const hasCredentials = creds && creds.uid && creds.ver && creds.cookieStr;

  if (!hasCredentials) {
    // 凭证缺失，需要登录 — 不直接返回，fall through 到 autoLogin 逻辑
    console.log("[cornerCrawler] 纯HTTP: 凭证缺失，需要登录（将尝试 autoLogin）");
  }

  // 2. 如果有凭证，直接尝试发送请求
  if (hasCredentials) {
    const { uid, ver, cookieStr } = creds;
    console.log("[cornerCrawler] 纯HTTP: 使用缓存凭证发送请求...");
    const [rcnResult, rnouResult] = await Promise.all([
      fetchCornerData(uid, ver, cookieStr),
      fetchHdpOuData(uid, ver, cookieStr),
    ]);

    // 请求成功且未过期 → 直接处理数据
    if (!rcnResult.expired && !rnouResult.expired) {
      console.log("[cornerCrawler] 纯HTTP: 缓存凭证请求成功（无需浏览器）");
      return _processHttpResults(rcnResult, rnouResult, uid, ver, cookieStr);
    }

    // 请求过期 → 需要重新登录
    console.warn("[cornerCrawler] 纯HTTP: 缓存凭证已过期，需要重新登录");
    invalidateCookieCache();
  }

  // 3. 需要登录 → 检查冷却时间
  const now = Date.now();
  if (lastLoginFailureTime > 0 && (now - lastLoginFailureTime) < LOGIN_COOLDOWN_MS) {
    console.log("[cornerCrawler] 纯HTTP: 登录冷却中（距上次失败 " + Math.floor((now - lastLoginFailureTime) / 1000) + "s），跳过登录");
    return { __specialResult: true, reason: "login_cooldown" };
  }

  // 3.5. 检查共享浏览器是否已登录（避免重复 autoLogin）
  if (!hasCredentials || (creds && !creds.uid)) {
    const sharedPage = getSharedPage();
    if (sharedPage && isBrowserActive()) {
      try {
        const isLoggedIn = await sharedPage.evaluate(() => {
          const body = document.body?.textContent || '';
          return (body.includes('In-Play') && body.includes('Soccer')) ||
                 !!document.getElementById('symbol_ft') ||
                 !!document.getElementById('live_page');
        });
        if (isLoggedIn) {
          console.log('[cornerCrawler] 共享浏览器已登录但 uid 缺失，从页面重新提取凭证...');
          try {
            const { syncCredentialsFromPage } = await import('./autoLogin.js');
            const credResult = await syncCredentialsFromPage(sharedPage, {});
            if (credResult.uid) {
              console.log('[cornerCrawler] 从已登录页面提取 uid 成功: ' + credResult.uid.substring(0, 10) + '...');
              // 重新加载凭证
              const newCreds = loadCredentials();
              if (newCreds && newCreds.uid && newCreds.ver && newCreds.cookieStr) {
                const [rcnResult, rnouResult] = await Promise.all([
                  fetchCornerData(newCreds.uid, newCreds.ver, newCreds.cookieStr),
                  fetchHdpOuData(newCreds.uid, newCreds.ver, newCreds.cookieStr),
                ]);
                if (!rcnResult.expired && !rnouResult.expired) {
                  return _processHttpResults(rcnResult, rnouResult, newCreds.uid, newCreds.ver, newCreds.cookieStr);
                }
              }
            } else {
              console.warn('[cornerCrawler] 从已登录页面提取 uid 失败，继续 autoLogin 流程');
            }
          } catch (e) {
            console.warn('[cornerCrawler] 从已登录页面提取凭证异常:', e.message);
          }
        }
      } catch (e) {
        console.log('[cornerCrawler] 共享浏览器状态检查失败:', e.message);
      }
    }
  }

  // 4. 触发 autoLogin（通过登录互斥锁保护，防止与 hgCrawlerService.loginToHG 并发）
  console.log("[cornerCrawler] 纯HTTP: 触发 Puppeteer 登录...");
  let newCreds = null;
  try {
    const loginResult = await withLoginMutex(async () => {
      // 互斥锁获取后先检查凭证是否已有效（可能 hgCrawlerService 已登录成功）
      const existingCreds = loadCredentials();
      if (existingCreds && existingCreds.uid && existingCreds.ver) {
        const validCheck = await loadAndValidate().catch(() => null);
        if (validCheck && validCheck.uid) {
          console.log("[cornerCrawler] 互斥锁获取后凭证已有效，跳过 autoLogin");
          return { success: true, uid: validCheck.uid, ver: validCheck.ver, cookies: validCheck.cookies || [] };
        }
      }
      const { autoLoginAndGetCredentials } = await import("./autoLogin.js");
      const savedLogin = getSavedLoginCredentials();
      return await autoLoginAndGetCredentials({
        username: savedLogin?.username || process.env.HG_USERNAME || "",
        password: savedLogin?.password || process.env.HG_PASSWORD || "",
      });
    });
    if (loginResult.success && loginResult.uid && loginResult.ver) {
      updateCredentials({ uid: loginResult.uid, ver: loginResult.ver, cookies: loginResult.cookies || [] });
      newCreds = loadCredentials();
      if (newCreds) console.log("[cornerCrawler] 纯HTTP: autoLogin 成功获取凭证");
    }
  } catch (e) {
    console.warn("[cornerCrawler] 纯HTTP: autoLogin 失败:", e.message);
  }

  if (!newCreds) {
    lastLoginFailureTime = Date.now();
    return { __specialResult: true, reason: "login_failed" };
  }

  // 5. 用新凭证重试请求
  const { uid, ver, cookieStr } = newCreds;
  const [rcnResult, rnouResult] = await Promise.all([
    fetchCornerData(uid, ver, cookieStr),
    fetchHdpOuData(uid, ver, cookieStr),
  ]);

  if (rcnResult.expired) {
    console.warn("[cornerCrawler] 纯HTTP: 新凭证仍然过期");
    lastLoginFailureTime = Date.now();
    return { __specialResult: true, reason: "credentials_expired" };
  }

  return _processHttpResults(rcnResult, rnouResult, uid, ver, cookieStr);
}

// ======================== 主函数：爬取角球比赛数据 ========================
export async function crawlCornerMatches() {
  // 并发保护：如果已有爬取在进行中，直接返回
  if (crawlingLock) {
    console.warn("[cornerCrawler] Crawler is busy, rejecting concurrent call");
    return { success: false, data: { matches: [], allText: [], allElements: [] }, count: 0, error: "Crawler busy", busy: true };
  }
  crawlingLock = true;
  console.log("[cornerCrawler] ===== Crawling corner data =====");
  const ts = new Date().toISOString();

  // 瓒呮椂淇濇姢锛?80 绉掞紙3 鍒嗛挓锛夊悗鑷姩閲婃斁閿侊紝闃叉姝婚攣
  const LOCK_TIMEOUT_MS = 180000; // 延长到 3 分钟
  const lockTimeout = setTimeout(() => {
    if (crawlingLock) {
      console.warn("[cornerCrawler] Lock timeout reached (180s), force releasing");
      crawlingLock = false;
    }
  }, LOCK_TIMEOUT_MS);

  // ★ 纯 HTTP 快速路径：优先使用 axios 直接调用 API
  try {
    const httpResult = await _crawlViaPureHttp();
    if (httpResult) {
      // 检查是否为特殊结果标记（凭证缺失/登录失败等）
      if (httpResult.__specialResult) {
        crawlingLock = false;
        clearTimeout(lockTimeout);
        const reason = httpResult.reason;
        console.warn("[cornerCrawler] 纯 HTTP 路径特殊结果:", reason);
        // 凭证相关错误 → 返回 success:false
        if (["credentials_missing", "login_cooldown", "login_failed", "credentials_expired"].includes(reason)) {
          return { success: false, data: { matches: [], allText: [], allElements: [] }, count: 0, timestamp: ts, error: reason };
        }
        // 未知特殊结果 → 视为无比赛数据（正常空）
        return { success: true, data: { matches: [], allText: [], allElements: [] }, count: 0, timestamp: ts, reason: "no_live_matches" };
      }
      crawlingLock = false;
      clearTimeout(lockTimeout);
      return httpResult;
    }
    console.log("[cornerCrawler] 纯 HTTP 路径返回 null（无比赛数据）");
  } catch (e) {
    console.warn("[cornerCrawler] 纯 HTTP 路径异常:", e.message);
  }

  // 纯 HTTP 返回 null = 凭证有效但无比赛数据（正常情况，不应视为失败）
  crawlingLock = false;
  clearTimeout(lockTimeout);
  return { success: true, data: { matches: [], allText: [], allElements: [] }, count: 0, timestamp: ts, reason: "no_live_matches" };
}

// ======================== 合并 XHR + DOM 数据 ========================
function mergeCornerData(xhrMatches, domCornerData) {
  // DOM data is now the primary source, just return xhrMatches if available, else domCornerData
  if (xhrMatches && xhrMatches.length > 0) return xhrMatches;
  if (!domCornerData || domCornerData.length === 0) return [];
  return domCornerData.map((m, i) => ({
    matchId: "dom_" + i,
    homeTeam: m.homeTeam || "",
    awayTeam: m.awayTeam || "",
    elapsedMinutes: m.elapsedMinutes || 0,
    homeScore: m.homeScore || 0,
    awayScore: m.awayScore || 0,
    handicap: m.cornerHandicap || 0,
    odds: m.cornerOdds || 0,
    strategy: []
  }));
}

// ======================== 轮询支持 ========================
export async function pollCornerMatches(onUpdate, intervalMs) {
  const interval = intervalMs || POLL_INTERVAL;
  console.log("[cornerCrawler] polling mode, interval=" + interval + "ms");
  let stopped = false;
  let timer = null;

  const poll = async () => {
    if (stopped) return;
    try {
      const matches = await crawlCornerMatches();
      if (!stopped && onUpdate) onUpdate(matches);
    } catch (e) {
      console.error("[cornerCrawler] poll error:", e.message);
    }
  };

  await poll();
  timer = setInterval(poll, interval);
  return () => { stopped = true; if (timer) clearInterval(timer); };
}

// ======================== 轻量级角球导航（投注专用） ========================
/**
 * 轻量级角球页面导航，仅用于投注执行，跳过数据爬取流程
 * 与 navigateToCorners 相比，跳过盘口数据等待、页面诊断、懒加载滚动等
 */
export async function navigateToCornersFast(page) {
  console.log("[cornerCrawler] ===== Fast navigate to Corner page (bet only) =====");

  // 1. 检查是否已在 CORNERS tab（In-Play）
  const alreadyOnCorners = await page.evaluate(() => {
    const cnTab = document.getElementById('tab_cn');
    if (!cnTab || !(cnTab.classList.contains('on') || cnTab.classList.contains('active'))) return false;
    if (document.querySelectorAll('div.box_lebet').length === 0) return false;
    const activeTabs = document.querySelectorAll('.btn_filter.on, .btn_filter.active');
    for (const tab of activeTabs) {
      const text = (tab.textContent || '').toLowerCase().trim();
      if (text === 'today' || text === '今日') return false;
    }
    return true;
  });
  if (alreadyOnCorners) {
    console.log("[cornerCrawler] Already on CORNERS tab, skipping navigation");
    await new Promise(r => setTimeout(r, 1000));
    await handlePopups(page);
    return { success: true };
  }

  // 2. 检查是否在 In-Play
  const isInPlay = await page.evaluate(() => {
    const url = window.location.href.toLowerCase();
    if (url.includes('inplay') || url.includes('in-play')) return true;
    const activeFilters = document.querySelectorAll('.btn_filter.on, .btn_filter.active');
    return Array.from(activeFilters).some(el => {
      const text = (el.textContent || '').toLowerCase();
      return text.includes('inplay') || text.includes('in-play') || text.includes('滚球');
    });
  });

  if (!isInPlay) {
    console.log("[cornerCrawler] Switching to In-Play...");
    await page.evaluate(() => {
      const all = document.querySelectorAll('#showtype_now, div.btn_filter, div.btn_title_le');
      for (const el of all) {
        const t = (el.textContent || '').trim();
        if (t === '滚球' || t.includes('In-Play') || t.includes('inplay')) {
          el.scrollIntoView({ block: 'center' });
          el.click();
          return;
        }
      }
    });
    await new Promise(r => setTimeout(r, 3000));
    await handlePopups(page);
  }

  // 3. 点击 CORNERS tab
  let cnClicked = false;
  try {
    cnClicked = await page.evaluate(() => {
      const cnTab = document.getElementById('tab_cn');
      if (cnTab && !cnTab.classList.contains('on') && !cnTab.classList.contains('active')) {
        cnTab.scrollIntoView({ block: 'center' });
        cnTab.click();
        return true;
      }
      return false;
    });
  } catch (e) {}

  if (!cnClicked) {
    // 回退：通过文本查找 CORNERS tab
    try {
      await page.evaluate(() => {
        const all = document.querySelectorAll('#league_name, div.btn_filter, div[id*="tab"], div.btn_title_le');
        for (const el of all) {
          const t = (el.textContent || '').trim();
          if (t === 'CORNERS' || t === '角球' || t.includes('CORNERS')) {
            el.scrollIntoView({ block: 'center' });
            el.click();
            return;
          }
        }
      });
    } catch (e) {}
  }

  // 4. 等待比赛行出现（不等待完整盘口数据）
  await new Promise(r => setTimeout(r, 3000));
  await handlePopups(page);

  try {
    await waitWithKeepAlive(page, 
      () => document.querySelectorAll('div.box_lebet').length > 0,
      { timeout: 8000 }
    );
  } catch (e) {
    console.log("[cornerCrawler] Fast nav: match rows not found, continuing anyway");
  }

  return { success: true };
}

// ======================== 全局轮询 ========================
export function startCornerPolling(onUpdate) {
  if (pollingActive) {
    console.log("[cornerCrawler] 轮询已在运行中");
    return { success: true, message: "already polling" };
  }
  console.log("[cornerCrawler] 启动全局轮询...");
  pollingActive = true;
  pollingStopFn = null;

  const poll = async () => {
    if (!pollingActive) return;
    try {
      const page = getSharedPage(); if (page) await randomMouseMove(page);
      const result = await crawlCornerMatches();
      const matches = result.success ? (result.data?.matches || []) : [];
      if (pollingActive && onUpdate) onUpdate(matches);
    } catch (e) {
      console.error("[cornerCrawler] 轮询错误:", e.message);
    }
    if (pollingActive) {
      pollingStopFn = setTimeout(poll, POLL_INTERVAL);
    }
  };
  poll();
  return { success: true };
}

export function stopCornerPolling() {
  if (!pollingActive) return { success: true, message: "not polling" };
  console.log("[cornerCrawler] 停止全局轮询...");
  pollingActive = false;
  if (pollingStopFn) { clearTimeout(pollingStopFn); pollingStopFn = null; }
  return { success: true };
}

export function getPollingStatus() {
  return {
    isPolling: pollingActive,
    isLoggedIn: isLoggedIn(),
    balance: getBalance(),
    lastUpdate: pollingActive ? Date.now() : null,
    loginInProgress
  };
}

// ======================== 登录 API ========================
export async function loginToHG(username, password) {
  console.log("[cornerCrawler] 设置登录凭据...");
  runtimeCredentials = { username, password };
  lastLoginErrorDetail = null;
  const MAX_RETRIES = 3;
  let lastError = null;
  let lastReason = null;
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const page = await ensureLogin();
      if (page) {
        return { success: true, message: "登录成功", balance: getBalance(), attempts: attempt };
      }
      lastError = "登录返回空页面";
      lastReason = lastLoginErrorDetail || "login_unknown";
    } catch (err) {
      lastError = err.message;
      lastReason = "login_exception:" + (err.message || "未知异常");
      console.warn("[cornerCrawler] 登录失败 " + attempt + "/" + MAX_RETRIES + " 次尝试: " + lastError);
    }
    if (attempt < MAX_RETRIES) {
      await new Promise(r => setTimeout(r, attempt * 2000));
    }
  }
  return {
    success: false,
    message: "登录失败(" + MAX_RETRIES + "次重试): " + lastError,
    reason: lastReason || "login_unknown",
    detail: lastLoginErrorDetail || lastError,
    balance: getBalance()
  };
}

// ======================== 关闭 ========================
export { getBalance } from "./browserPool.js";
export { extractBalance };

export async function closeCrawler() {
  stopCornerPolling();
  capturedResponses = [];
  browserExplicitlyClosed = true;
  return await closeSharedBrowser();
}

export function resetBrowserClosedFlag() {
  console.log("[cornerCrawler] 浏览器关闭标志已重置");
  browserExplicitlyClosed = false;
  cachedSessionInfo = null; // 同时重置会话信息缓存
}

// ======================== 调试 ========================
export function getDebugInfo() {
  return {
    headless: process.env.CRAWLER_HEADLESS === 'true',
    isLoggedIn: isLoggedIn(),
    balance: getBalance(),
    capturedResponseCount: capturedResponses.length,
    capturedResponsesSummary: capturedResponses.map(c => ({
      url: c.url.substring(0, 150),
      itemCount: c.itemCount,
      sampleFields: c.sampleFields
    })),
    seenXHRCount: seenRequestUrls.size,
    seenXHRUrls: Array.from(seenRequestUrls).slice(0, 30)
  };
}

// ======================== 诊断 ========================
export async function diagnoseCrawler() {
  const report = {
    timestamp: new Date().toISOString(),
    headless: process.env.CRAWLER_HEADLESS === 'true',
    steps: [],
    status: "starting",
    errors: [],
    loginSuccess: false,
    navigationSuccess: false,
    interceptedXHRCount: 0,
    interceptedXHRUrls: [],
    capturedAPIs: [],
    matchesFound: 0,
    sampleMatches: [],
    domCornerCount: 0,
    domCornerSample: [],
    totalTimeMs: 0
  };

  const startTime = Date.now();

  try {
    report.steps.push("browser_start");
    await getSharedBrowser(false);
    report.steps.push("browser_ready");

    report.steps.push("login_start");
    try {
      const page = await ensureLogin();
      report.loginSuccess = true;
      report.steps.push("login_ok");
    } catch (e) {
      report.errors.push({ step: "login", message: e.message });
      report.steps.push("login_failed");
      report.status = "login_failed";
      report.totalTimeMs = Date.now() - startTime;
      return report;
    }

    const page = getSharedPage();

    report.steps.push("xhr_setup_start");
    try { await setupXHRInterception(page); report.steps.push("xhr_setup_ok"); } catch (e) {
      report.errors.push({ step: "xhr_setup", message: e.message });
    }

    report.steps.push("navigate_start");
    try {
      await navigateToCorners(page);
      report.navigationSuccess = true;
      report.steps.push("navigate_ok");
    } catch (e) {
      report.errors.push({ step: "navigate", message: e.message });
      report.steps.push("navigate_failed");
    }

    report.steps.push("wait_data");
    await new Promise(r => setTimeout(r, 5000));
    try {
      await page.evaluate(() => {
        window.scrollTo(0, document.body.scrollHeight);
        setTimeout(() => window.scrollTo(0, 0), 1000);
      });
    } catch (e) {}
    await new Promise(r => setTimeout(r, 3000));
    report.steps.push("wait_done");

    // XHR 数据
    report.interceptedXHRUrls = [...seenRequestUrls];
    report.interceptedXHRCount = seenRequestUrls.size;
    for (const cr of capturedResponses.slice(0, 5)) {
      report.capturedAPIs.push({
        url: cr.url.substring(0, 250),
        itemCount: cr.itemCount,
        fields: cr.sampleFields,
        sampleItem: cr.matchList[0] || {}
      });
    }

    // 尝试获取数据
    try {
      report.pageStructure = await page.evaluate(() => {
        const result = {};
        result['div.bet_box'] = document.querySelectorAll('div.bet_box').length;
        result['div.box_lebet'] = document.querySelectorAll('div.box_lebet').length;
        result['div.box_lebet[class*="bet_type_"]'] = document.querySelectorAll('div.box_lebet[class*="bet_type_"]').length;
        result['div.box_lebet.bet_type_cn'] = document.querySelectorAll('div.box_lebet.bet_type_cn').length;
        result['div.box_lebet_odd'] = document.querySelectorAll('div.box_lebet_odd').length;
        const cnTab = document.getElementById('tab_cn');
        result['tab_cn_exists'] = !!cnTab;
        result['tab_cn_active'] = cnTab ? cnTab.classList.contains('active') || cnTab.classList.contains('on') : false;
        result['bodyText'] = (document.body?.textContent || '').replace(/\s+/g, ' ').trim().substring(0, 200);
        return result;
      });
      report.steps.push("page_structure_ok");
    } catch(e) {
      report.steps.push("page_structure_failed");
    }

    // DOM 角球盘口
    const domData = await parseAllMarkets(page);
    report.domCornerCount = domData.length;
    report.domCornerSample = domData.slice(0, 5);

    // XHR 比赛列表
    const bestResponse = pickBestResponse(capturedResponses);
    if (bestResponse && bestResponse.matchList.length > 0) {
      const matches = bestResponse.matchList
        .map(mapToCornerMatch)
        .filter(m => m.homeTeam && m.awayTeam);
      // 合并 DOM 盘口
      const merged = mergeCornerData(matches, domData);
      report.matchesFound = merged.length;
      report.sampleMatches = merged.slice(0, 5);
    }

    report.status = "complete";
    report.totalTimeMs = Date.now() - startTime;
    return report;
  } catch (err) {
    report.status = "error";
    report.errors.push({ step: "global", message: err.message, stack: (err.stack || "").substring(0, 300) });
    report.totalTimeMs = Date.now() - startTime;
    return report;
  }
}