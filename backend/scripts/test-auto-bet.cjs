#!/usr/bin/env node
// ============================================================
// test-auto-bet.cjs — 自动投注功能端到端测试脚本
// 用法: node test-auto-bet.cjs [--username XXX] [--password XXX] [--amount N] [--debug]
// 默认账号: johui88 / aa123123
// ============================================================

const puppeteer = require("puppeteer-extra");
const StealthPlugin = require("puppeteer-extra-plugin-stealth");
const fs = require("fs");
const path = require("path");

puppeteer.use(StealthPlugin());

// ======================== 配置 ========================
const HG_URL = process.env.HG_URL || "https://www.hga038.com";
const LOGIN_TIMEOUT = 90000;
const DEBUG_DIR = path.resolve(__dirname, "..", "..", "debug");

// 命令行参数
const args = process.argv.slice(2);
const isDebug = args.includes("--debug") || process.env.CRAWLER_DEBUG === "1";
function getArg(name) {
  const idx = args.indexOf(name);
  if (idx === -1 || idx + 1 >= args.length) return null;
  const val = args[idx + 1];
  if (val && val.startsWith("--")) return null; // 下一个参数是flag，不是值
  return val;
}
const USERNAME = getArg("--username") || "johui88";
const PASSWORD = getArg("--password") || "aa123123";
const BET_AMOUNT = getArg("--amount") || "10";

// ======================== 日志 ========================
function log(level, msg) {
  const ts = new Date().toISOString().substring(11, 23);
  const prefix = { INFO: "ℹ", OK: "✅", WARN: "⚠", ERR: "❌", DBG: "🔍" }[level] || "•";
  console.log(`[${ts}] ${prefix} ${msg}`);
}
const info = (m) => log("INFO", m);
const ok = (m) => log("OK", m);
const warn = (m) => log("WARN", m);
const err = (m) => log("ERR", m);
const dbg = (m) => isDebug && log("DBG", m);

// ======================== 截图 ========================
async function screenshot(page, label) {
  if (!isDebug) return;
  try {
    if (!fs.existsSync(DEBUG_DIR)) fs.mkdirSync(DEBUG_DIR, { recursive: true });
    const p = path.join(DEBUG_DIR, `test-bet-${label}-${Date.now()}.png`);
    await page.screenshot({ path: p, fullPage: true });
    dbg(`截图: ${p}`);
  } catch (e) {}
}

// ======================== 暴力弹窗清理 ========================
async function brutalCleanup(page) {
  try {
    const cleaned = await page.evaluate(() => {
      let count = 0;
      const popupIds = [
        "alert_kick", "C_alert_confirm", "alert_confirm",
        "C_alert_ok", "alert_ok", "system_popup", "alert_show",
        "C_passcode_confirm", "passcode_popup"
      ];
      for (const id of popupIds) {
        const el = document.getElementById(id);
        if (el && el.classList.contains("on")) {
          el.classList.remove("on");
          count++;
        }
      }
      if (document.body) {
        document.body.classList.remove("scroll_lock", "locked");
        document.body.style.overflow = "";
      }
      return count;
    });
    if (cleaned > 0) dbg(`brutalCleanup: 移除了 ${cleaned} 个弹窗容器的 .on 类`);
    try { await page.keyboard.press("Escape"); } catch (_) {}
  } catch (e) {
    dbg(`brutalCleanup 异常: ${e.message}`);
  }
}

// ======================== 登录后弹窗处理 ========================
async function handlePostLoginPopups(page) {
  info("检查登录后弹窗...");
  await screenshot(page, "post-login-popup-check");

  try {
    const handled = await page.evaluate(() => {
      // ★ 优先点击否/取消按钮（简易密码提示点"否"跳过）
      const cancelKeywords = ["NO", "否", "取消", "cancel", "skip", "跳过", "NOT NOW"];
      const cancelBtnSelectors = [
        "#C_no_btn", "#no_btn", ".btn_cancel",
        "#C_alert_confirm .btn_cancel", "#alert_confirm .btn_cancel",
        "#C_alert_confirm button", "#alert_confirm button",
        "[class*='msg_popup'] .btn"
      ];
      for (const sel of cancelBtnSelectors) {
        const btns = document.querySelectorAll(sel);
        for (const btn of btns) {
          const rect = btn.getBoundingClientRect();
          if (rect.width > 0 && rect.height > 0) {
            const text = (btn.textContent || "").trim().toUpperCase();
            for (const kw of cancelKeywords) {
              if (text === kw.toUpperCase() || text.includes(kw.toUpperCase())) {
                btn.click();
                return { clicked: true, method: "cancel-btn", text: text };
              }
            }
          }
        }
      }

      // 2. 查找并点击弹窗中的确认/OK按钮
      const okKeywords = ["OK", "确认", "确定", "是", "yes", "ok", "同意"];
      const confirmBtnSelectors = [
        "#C_ok_btn", "#ok_btn", "#C_alert_confirm .btn_confirm",
        "#alert_confirm .btn_confirm", ".btn_confirm", ".btn_submit",
        "#C_alert_confirm button", "#alert_confirm button",
        "[class*='msg_popup'] .btn"
      ];

      for (const sel of confirmBtnSelectors) {
        const btns = document.querySelectorAll(sel);
        for (const btn of btns) {
          const rect = btn.getBoundingClientRect();
          if (rect.width > 0 && rect.height > 0) {
            const text = (btn.textContent || "").trim().toUpperCase();
            for (const kw of okKeywords) {
              if (text === kw.toUpperCase() || text.includes(kw.toUpperCase())) {
                btn.click();
                return { clicked: true, method: "ok-btn", text: text };
              }
            }
          }
        }
      }

      // 3. 检查是否有"普通登入"按钮（简易密码页面）
      const backLogin = document.getElementById("back_login");
      if (backLogin) {
        const rect = backLogin.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0) {
          backLogin.click();
          return { clicked: true, method: "back_login" };
        }
      }

      // 4. 检查弹窗文本内容
      const popupIds = ["C_alert_confirm", "alert_confirm", "alert_show", "system_popup"];
      for (const id of popupIds) {
        const el = document.getElementById(id);
        if (el && el.classList.contains("on")) {
          const popupText = (el.textContent || "").substring(0, 200);
          return { clicked: false, popupText: popupText };
        }
      }

      return { clicked: false, noPopup: true };
    });

    if (handled.clicked) {
      ok(`弹窗已处理 (${handled.method}${handled.text ? ': ' + handled.text : ''})`);
      await new Promise(r => setTimeout(r, 2000));
    } else if (handled.popupText) {
      warn(`弹窗内容: ${handled.popupText}`);
      // 如果弹窗有文本但没找到按钮，暴力清理
      await brutalCleanup(page);
    } else {
      dbg("无弹窗需要处理");
    }
  } catch (e) {
    dbg(`handlePostLoginPopups 异常: ${e.message}`);
  }
}

// ======================== 页面状态检测 ========================
async function detectState(page) {
  try {
    return await page.evaluate(() => {
      function isReallyVisible(el) {
        if (!el) return false;
        const style = getComputedStyle(el);
        if (style.display === 'none' || style.visibility === 'hidden') return false;
        let parent = el.parentElement;
        while (parent) {
          if (parent.id === 'alert_kick' || parent.id === 'alert_show' ||
              parent.id === 'C_alert_confirm' || parent.id === 'alert_confirm' ||
              parent.id === 'system_popup') {
            if (!parent.classList.contains('on')) return false;
          }
          parent = parent.parentElement;
        }
        return true;
      }

      var bodyText = document.body.textContent || "";
      var hasMainFeature =
        bodyText.includes("My Events") || bodyText.includes("My Bets") ||
        (bodyText.includes("In-Play") && bodyText.includes("Soccer")) ||
        bodyText.includes("Balance") || bodyText.includes("余额") ||
        bodyText.includes("Credit") || bodyText.includes("额度");

      if (!hasMainFeature) {
        var nav = document.getElementById("today_page") || document.getElementById("live_page");
        if (nav && isReallyVisible(nav)) hasMainFeature = true;
      }
      if (!hasMainFeature) {
        var symbol = document.getElementById("symbol_ft");
        if (symbol && isReallyVisible(symbol)) hasMainFeature = true;
      }
      if (hasMainFeature) return { state: "LOGGED_IN", detail: "主页特征可见" };

      var backLogin = document.getElementById("back_login");
      if (backLogin && isReallyVisible(backLogin)) {
        return { state: "PASSCODE_PAGE", detail: "简易密码设置页面" };
      }

      var alertKick = document.getElementById("alert_kick");
      if (alertKick && alertKick.classList.contains("on")) {
        return { state: "KICKED_OUT", detail: "被踢出弹窗" };
      }

      var popupIds = ["C_alert_confirm", "alert_confirm", "alert_show"];
      for (var id of popupIds) {
        var el = document.getElementById(id);
        if (el && el.classList.contains("on")) {
          return { state: "POPUP_ACTIVE", detail: "弹窗激活: " + id };
        }
      }

      var usrEl = document.getElementById("usr");
      if (usrEl && isReallyVisible(usrEl)) {
        return { state: "LOGIN_PAGE", detail: "登录页面" };
      }

      return { state: "UNKNOWN", detail: "未知状态" };
    });
  } catch (e) {
    return { state: "ERROR", detail: e.message };
  }
}

// ======================== 登录流程 ========================
async function doLogin(page, username, password) {
  info("填写凭据并登录...");

  try {
    const usernameInput = await page.$("#usr, input[name='username'], input[type='text'], input[placeholder*='用户']");
    if (usernameInput) {
      await usernameInput.click({ clickCount: 3 });
      await usernameInput.type(username, { delay: 50 });
      ok("已输入用户名");
    } else {
      warn("未找到用户名输入框");
    }
  } catch (e) {
    warn(`输入用户名失败: ${e.message}`);
    return false;
  }

  try {
    const passwordInput = await page.$("#pwd, input[name='password'], input[type='password'], input[placeholder*='密码']");
    if (passwordInput) {
      await passwordInput.click({ clickCount: 3 });
      await passwordInput.type(password, { delay: 50 });
      ok("已输入密码");
    } else {
      warn("未找到密码输入框");
    }
  } catch (e) {
    warn(`输入密码失败: ${e.message}`);
    return false;
  }

  // 点击登录按钮 — 逐个尝试选择器
  let btnClicked = false;
  const btnSelectors = ["#btn_login", "input[type='submit']", "button[type='submit']", "input[type='button']", "[class*='login']", "[class*='submit']"];
  for (const sel of btnSelectors) {
    try {
      const btn = await page.$(sel);
      if (btn) {
        const box = await btn.boundingBox();
        if (box && box.width > 0 && box.height > 0) {
          await btn.click();
          ok(`已点击登录按钮 (${sel})`);
          btnClicked = true;
          break;
        }
      }
    } catch (e) {}
  }
  if (!btnClicked) {
    warn("未找到可点击的登录按钮，尝试 Enter 键");
    try { await page.keyboard.press("Enter"); } catch (e) {}
  }

  // 等待页面响应 — 使用 waitForNavigation 或 waitForFunction
  try {
    await Promise.race([
      page.waitForNavigation({ timeout: 10000, waitUntil: "domcontentloaded" }),
      page.waitForFunction(() => {
        const body = document.body?.textContent || "";
        return body.includes("Balance") || body.includes("余额") ||
               body.includes("Credit") || body.includes("In-Play") ||
               body.includes("My Events") || body.includes("My Bets") ||
               !!document.getElementById("live_page") || !!document.getElementById("today_page");
      }, { timeout: 10000 }),
      new Promise(r => setTimeout(r, 10000)),
    ]);
  } catch (e) {
    dbg("waitForNavigation/Function 超时，继续...");
  }

  return true;
}

// ======================== 登录状态机循环 ========================
async function loginWithStateMachine(page, username, password) {
  info("开始登录状态机循环...");
  const startTime = Date.now();
  let loginAttempts = 0;
  const MAX_LOGIN_ATTEMPTS = 5;

  while (Date.now() - startTime < LOGIN_TIMEOUT) {
    const state = await detectState(page);
    dbg(`状态: ${state.state} — ${state.detail}`);

    switch (state.state) {
      case "LOGGED_IN":
        ok("登录成功！");
        await screenshot(page, "logged-in");
        return true;

      case "PASSCODE_PAGE":
        info("检测到简易密码页面，点击'普通登入'...");
        try {
          await page.evaluate(() => {
            const btn = document.getElementById("back_login");
            if (btn) btn.click();
          });
          await new Promise(r => setTimeout(r, 2000));
        } catch (e) {}
        break;

      case "KICKED_OUT":
        info("检测到被踢出弹窗，点击确认...");
        try {
          await page.evaluate(() => {
            const btn = document.getElementById("kick_ok_btn");
            if (btn) btn.click();
          });
          await new Promise(r => setTimeout(r, 1000));
          const client = await page.target().createCDPSession();
          await client.send("Network.clearBrowserCookies");
          await page.goto(HG_URL, { timeout: 30000, waitUntil: "domcontentloaded" });
          await new Promise(r => setTimeout(r, 3000));
        } catch (e) {}
        break;

      case "POPUP_ACTIVE":
        info("检测到弹窗，执行暴力清理...");
        await brutalCleanup(page);
        await new Promise(r => setTimeout(r, 1000));
        break;

      case "LOGIN_PAGE":
        loginAttempts++;
        if (loginAttempts > MAX_LOGIN_ATTEMPTS) {
          err(`登录尝试已达 ${MAX_LOGIN_ATTEMPTS} 次，可能凭据错误或存在验证码`);
          await screenshot(page, "login-failed");
          return false;
        }
        info(`登录尝试 ${loginAttempts}/${MAX_LOGIN_ATTEMPTS}...`);
        const loginResult = await doLogin(page, username, password);
        if (!loginResult) {
          // 输入失败，刷新页面重试
          warn("登录输入失败，刷新页面...");
          await page.reload({ timeout: 30000, waitUntil: "domcontentloaded" });
          await new Promise(r => setTimeout(r, 3000));
          break;
        }
        // 登录后先尝试点击弹窗确认按钮（而非暴力移除）
        await new Promise(r => setTimeout(r, 2000));
        await handlePostLoginPopups(page);
        await new Promise(r => setTimeout(r, 3000));
        break;

      default:
        await new Promise(r => setTimeout(r, 2000));
        break;
    }
  }

  err("登录超时！");
  return false;
}

// ======================== 导航到让球/大小标签 ========================
async function navigateToHdpOu(page) {
  info("导航到让球/大小标签页...");

  // 尝试 In-Play → Soccer → HDP&O/U
  let found = false;

  // 策略1: In-Play
  info("尝试 In-Play → Soccer → 让球/大小...");
  try {
    const liveClicked = await page.evaluate(() => {
      const el = document.getElementById("live_page");
      if (el) { el.click(); return true; }
      return false;
    });
    if (liveClicked) {
      await new Promise(r => setTimeout(r, 2000));
      await brutalCleanup(page);

      // 点击 Soccer
      const soccerClicked = await page.evaluate(() => {
        const el = document.getElementById("symbol_ft");
        if (el) { el.click(); return true; }
        return false;
      });
      if (soccerClicked) {
        await new Promise(r => setTimeout(r, 3000));
        await brutalCleanup(page);

        // 点击让球/大小标签
        found = await clickHdpOuTab(page);
      }
    }
  } catch (e) {
    dbg(`In-Play策略失败: ${e.message}`);
  }

  // 策略2: Today
  if (!found) {
    info("In-Play无比赛，尝试 Today → Soccer → 让球/大小...");
    try {
      const todayClicked = await page.evaluate(() => {
        const el = document.getElementById("today_page");
        if (el) { el.click(); return true; }
        return false;
      });
      if (todayClicked) {
        await new Promise(r => setTimeout(r, 2000));
        await brutalCleanup(page);

        const soccerClicked = await page.evaluate(() => {
          const el = document.getElementById("symbol_ft");
          if (el) { el.click(); return true; }
          return false;
        });
        if (soccerClicked) {
          await new Promise(r => setTimeout(r, 3000));
          await brutalCleanup(page);
          found = await clickHdpOuTab(page);
        }
      }
    } catch (e) {
      dbg(`Today策略失败: ${e.message}`);
    }
  }

  if (found) {
    ok("已导航到让球/大小标签页");
    await new Promise(r => setTimeout(r, 2000));
    await screenshot(page, "hdp-ou-tab");
  } else {
    warn("未能导航到让球/大小标签页，尝试在当前页面查找赔率");
  }

  return found;
}

async function clickHdpOuTab(page) {
  // 尝试多种方式点击让球/大小标签
  return await page.evaluate(() => {
    // 方式1: 通过ID
    const tabRnou = document.getElementById("tab_rnou");
    if (tabRnou) { tabRnou.click(); return true; }

    // 方式2: 通过文本匹配
    const keywords = ["让球", "大小", "HDP", "HDP&O/U", "HANDICAP", "OVER/UNDER"];
    const allEls = document.querySelectorAll("div, span, a, li, button");
    for (const el of allEls) {
      const text = (el.textContent || "").trim().toUpperCase();
      for (const kw of keywords) {
        if (text === kw.toUpperCase() || text.includes(kw.toUpperCase())) {
          const rect = el.getBoundingClientRect();
          if (rect.width > 10 && rect.height > 8) {
            el.scrollIntoView({ block: "center" });
            el.click();
            return true;
          }
        }
      }
    }
    return false;
  });
}

// ======================== 查找比赛并点击赔率 ========================
async function findAndClickOdds(page) {
  info("查找比赛赔率...");

  // 等待赔率数据加载
  try {
    await page.waitForFunction(() => {
      const odds = document.querySelectorAll("span.text_odds, [class*='odd'], [class*='price']");
      for (const el of odds) {
        const val = parseFloat((el.textContent || "").trim());
        if (!isNaN(val) && val > 1.0) return true;
      }
      return false;
    }, { timeout: 15000 });
  } catch (e) {
    warn("等待赔率超时，继续尝试...");
  }

  // 查找并点击第一个有效赔率
  const clicked = await page.evaluate(() => {
    // 优先查找 span.text_odds
    const selectors = [
      "span.text_odds",
      "[class*='text_odds']",
      "[class*='odd']",
      "[class*='price']",
      "[class*='ior']",
      "span[class*='bet']"
    ];

    for (const sel of selectors) {
      const elements = document.querySelectorAll(sel);
      for (const el of elements) {
        const text = (el.textContent || "").trim();
        const val = parseFloat(text);
        if (!isNaN(val) && val > 1.0 && val < 20.0) {
          el.scrollIntoView({ block: "center" });
          el.click();
          return { success: true, odds: val, text: text };
        }
      }
    }

    // 回退：遍历所有 span 查找数字赔率
    const allSpans = document.querySelectorAll("span, a, div");
    for (const el of allSpans) {
      const text = (el.textContent || "").trim();
      // 赔率通常是1.xx到9.xx的数字
      if (/^\d+\.\d{2}$/.test(text)) {
        const val = parseFloat(text);
        if (val > 1.0 && val < 20.0) {
          const rect = el.getBoundingClientRect();
          if (rect.width > 5 && rect.height > 5) {
            el.scrollIntoView({ block: "center" });
            el.click();
            return { success: true, odds: val, text: text };
          }
        }
      }
    }

    return { success: false };
  });

  if (clicked.success) {
    ok(`已点击赔率: ${clicked.text} (${clicked.odds})`);
    await screenshot(page, "odds-clicked");
  } else {
    err("未找到可点击的赔率");
  }

  return clicked.success;
}

// ======================== 输入投注金额 ========================
async function fillBetAmount(page, amount) {
  info(`输入投注金额: ${amount}`);

  await new Promise(r => setTimeout(r, 2000)); // 等待弹窗出现
  await brutalCleanup(page);

  const filled = await page.evaluate((amt) => {
    // 方式1: 通过ID查找
    const ids = ["bet_finish_gold", "gold", "credit", "bet_gold", "wager_amount"];
    for (const id of ids) {
      const inp = document.getElementById(id);
      if (inp && inp.tagName === "INPUT") {
        inp.value = "";
        inp.focus();
        const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
          window.HTMLInputElement.prototype, "value"
        ).set;
        nativeInputValueSetter.call(inp, String(amt));
        inp.dispatchEvent(new Event("input", { bubbles: true }));
        inp.dispatchEvent(new Event("change", { bubbles: true }));
        inp.dispatchEvent(new Event("blur", { bubbles: true }));
        return { success: true, method: "id:" + id };
      }
    }

    // 方式2: 通过属性匹配查找
    const inputs = document.querySelectorAll(
      "input[type='text'], input[type='number'], input:not([type='hidden'])"
    );
    for (const inp of inputs) {
      const placeholder = (inp.placeholder || "").toLowerCase();
      const name = (inp.name || "").toLowerCase();
      const className = (inp.className || "").toLowerCase();
      const id = (inp.id || "").toLowerCase();

      if (
        placeholder.includes("stake") || placeholder.includes("amount") ||
        placeholder.includes("金额") || placeholder.includes("bet") ||
        name.includes("stake") || name.includes("amount") || name.includes("bet") ||
        name.includes("gold") || name.includes("credit") ||
        className.includes("stake") || className.includes("amount") ||
        className.includes("gold") || className.includes("credit") ||
        id.includes("gold") || id.includes("credit") || id.includes("amount") ||
        id.includes("stake") || id.includes("bet")
      ) {
        inp.value = "";
        inp.focus();
        const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
          window.HTMLInputElement.prototype, "value"
        ).set;
        nativeInputValueSetter.call(inp, String(amt));
        inp.dispatchEvent(new Event("input", { bubbles: true }));
        inp.dispatchEvent(new Event("change", { bubbles: true }));
        inp.dispatchEvent(new Event("blur", { bubbles: true }));
        return { success: true, method: "attr:" + (inp.id || inp.name || inp.className) };
      }
    }

    // 方式3: 在投注弹窗内查找所有可见input
    const betPopup = document.querySelector(
      "[class*='bet_finish'], [class*='bet_popup'], [class*='wager'], [id*='bet_finish'], [id*='wager']"
    );
    if (betPopup) {
      const popupInputs = betPopup.querySelectorAll("input");
      for (const inp of popupInputs) {
        if (inp.type !== "hidden" && inp.getBoundingClientRect().width > 0) {
          inp.value = "";
          inp.focus();
          const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
            window.HTMLInputElement.prototype, "value"
          ).set;
          nativeInputValueSetter.call(inp, String(amt));
          inp.dispatchEvent(new Event("input", { bubbles: true }));
          inp.dispatchEvent(new Event("change", { bubbles: true }));
          inp.dispatchEvent(new Event("blur", { bubbles: true }));
          return { success: true, method: "popup-input" };
        }
      }
    }

    return { success: false };
  }, amount);

  if (filled.success) {
    ok(`金额已输入 (${filled.method})`);
    await screenshot(page, "amount-filled");
  } else {
    err("未找到金额输入框");
  }

  return filled.success;
}

// ======================== 点击下单按钮 ========================
async function clickSubmitButton(page) {
  info("查找并点击下单按钮...");

  const clicked = await page.evaluate(() => {
    // 方式1: 通过ID
    const ids = ["btn_submit", "btn_confirm", "bet_finish_submit", "submit_bet"];
    for (const id of ids) {
      const btn = document.getElementById(id);
      if (btn) {
        const rect = btn.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0) {
          btn.scrollIntoView({ block: "center" });
          btn.click();
          return { success: true, method: "id:" + id };
        }
      }
    }

    // 方式2: 通过文本匹配
    const keywords = ["下单", "投注", "place bet", "confirm bet", "确认", "提交"];
    const btns = document.querySelectorAll(
      "button, [class*='btn'], a[class*='btn'], input[type='submit'], input[type='button']"
    );
    for (const btn of btns) {
      const text = (btn.textContent || btn.value || "").trim().toLowerCase();
      const rect = btn.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        for (const kw of keywords) {
          if (text.includes(kw.toLowerCase())) {
            btn.scrollIntoView({ block: "center" });
            btn.click();
            return { success: true, method: "text:" + text };
          }
        }
      }
    }

    // 方式3: 在投注弹窗内查找提交按钮
    const betPopup = document.querySelector(
      "[class*='bet_finish'], [class*='bet_popup'], [class*='wager'], [id*='bet_finish'], [id*='wager']"
    );
    if (betPopup) {
      const submitBtns = betPopup.querySelectorAll(
        "button, input[type='submit'], input[type='button'], [class*='submit'], [class*='confirm']"
      );
      for (const btn of submitBtns) {
        const rect = btn.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0) {
          btn.scrollIntoView({ block: "center" });
          btn.click();
          return { success: true, method: "popup-btn" };
        }
      }
    }

    return { success: false };
  });

  if (clicked.success) {
    ok(`已点击下单按钮 (${clicked.method})`);
    await screenshot(page, "submit-clicked");
  } else {
    err("未找到下单按钮");
  }

  return clicked.success;
}

// ======================== 检测投注结果 ========================
async function checkBetResult(page) {
  info("检测投注结果...");

  await new Promise(r => setTimeout(r, 3000));
  await screenshot(page, "bet-result");

  const result = await page.evaluate(() => {
    const body = document.body?.textContent || "";

    // 余额不足
    const insufficientKeywords = [
      "Insufficient", "不足", "余额不足", "超过限额",
      "balance is not enough", "insufficient balance",
      "low balance", "金额不足"
    ];
    for (const kw of insufficientKeywords) {
      if (body.includes(kw)) return { status: "insufficient", keyword: kw };
    }

    // 投注成功
    const successKeywords = [
      "Accepted", "成功", "confirmed", "已接受",
      "bet placed", "下单成功", "Bet Placed"
    ];
    for (const kw of successKeywords) {
      if (body.includes(kw)) return { status: "success", keyword: kw };
    }

    // 其他错误
    const errorKeywords = [
      "Rejected", "失败", "error", "Error",
      "odds changed", "赔率变动", "盘口变动",
      "suspended", "暂停", "closed"
    ];
    for (const kw of errorKeywords) {
      if (body.includes(kw)) return { status: "error", keyword: kw };
    }

    // 检查弹窗内容
    const popupIds = ["C_alert_confirm", "alert_confirm", "alert_show", "system_popup"];
    for (const id of popupIds) {
      const el = document.getElementById(id);
      if (el && el.classList.contains("on")) {
        const popupText = el.textContent || "";
        for (const kw of insufficientKeywords) {
          if (popupText.includes(kw)) return { status: "insufficient", keyword: kw };
        }
        for (const kw of successKeywords) {
          if (popupText.includes(kw)) return { status: "success", keyword: kw };
        }
        return { status: "popup", keyword: popupText.substring(0, 100) };
      }
    }

    return { status: "unknown" };
  });

  return result;
}

// ======================== 主流程 ========================
async function main() {
  info("========================================");
  info("  自动投注功能端到端测试");
  info(`  账号: ${USERNAME}`);
  info(`  金额: ${BET_AMOUNT}`);
  info("========================================");

  let browser = null;

  try {
    // 1. 启动浏览器
    info("启动浏览器...");
    const launchArgs = [
      "--ignore-certificate-errors",
      "--no-sandbox",
      "--disable-setuid-sandbox",
    ];

    // 代理配置
    if (process.env.PUPPETEER_PROXY) {
      launchArgs.push(`--proxy-server=${process.env.PUPPETEER_PROXY}`);
      launchArgs.push("--host-resolver-rules=MAP * ~NOTFOUND , EXCLUDE localhost");
      info(`使用代理: ${process.env.PUPPETEER_PROXY}`);
    }

    browser = await puppeteer.launch({
      headless: false,
      args: launchArgs,
      defaultViewport: { width: 1280, height: 900 },
      ignoreHTTPSErrors: true,
    });

    const page = await browser.newPage();
    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36"
    );

    // 2. 导航到首页
    info(`导航到 ${HG_URL}...`);
    await page.goto(HG_URL, { timeout: 30000, waitUntil: "domcontentloaded" });
    await new Promise(r => setTimeout(r, 3000));
    await screenshot(page, "initial");

    // 3. 登录
    const loginOk = await loginWithStateMachine(page, USERNAME, PASSWORD);
    if (!loginOk) {
      err("登录失败，退出测试");
      process.exit(1);
    }

    // 4. 导航到让球/大小标签
    await navigateToHdpOu(page);

    // 5. 查找比赛并点击赔率
    const oddsClicked = await findAndClickOdds(page);
    if (!oddsClicked) {
      err("当前无可用比赛，请稍后重试");
      process.exit(1);
    }

    // 6. 输入投注金额
    const amountFilled = await fillBetAmount(page, BET_AMOUNT);
    if (!amountFilled) {
      err("无法输入投注金额，投注弹窗可能未出现");
      process.exit(1);
    }

    // 7. 点击下单按钮
    const submitted = await clickSubmitButton(page);
    if (!submitted) {
      err("无法点击下单按钮");
      process.exit(1);
    }

    // 8. 检测结果
    const result = await checkBetResult(page);

    info("========================================");
    switch (result.status) {
      case "insufficient":
        ok("测试完毕：投注链路畅通（余额不足为预期结果）");
        ok(`触发关键词: ${result.keyword}`);
        break;
      case "success":
        warn("测试完毕：投注成功！请注意账户余额");
        warn(`触发关键词: ${result.keyword}`);
        break;
      case "error":
        err(`测试完毕：投注失败 — ${result.keyword}`);
        break;
      case "popup":
        warn(`测试完毕：弹窗提示 — ${result.keyword}`);
        break;
      default:
        warn("测试完毕：无法确定投注结果（未检测到成功/失败关键词）");
        break;
    }
    info("========================================");

  } catch (e) {
    err(`测试异常: ${e.message}`);
    console.error(e);
    process.exit(1);
  } finally {
    if (browser) {
      info("关闭浏览器...");
      await browser.close();
    }
  }

  process.exit(0);
}

main();
