#!/usr/bin/env node
// ============================================================
// test-corner-bet.cjs — 角球投注功能端到端测试脚本
// 验证角球页面的元素定位、赔率匹配、投注弹窗是否正确
// 用法: node test-corner-bet.cjs [--debug]
// ============================================================

const puppeteer = require("puppeteer-extra");
const StealthPlugin = require("puppeteer-extra-plugin-stealth");
const fs = require("fs");
const path = require("path");

puppeteer.use(StealthPlugin());

const HG_URL = process.env.HG_URL || "https://www.hga050.com";
const isDebug = true;
const DEBUG_DIR = path.resolve(__dirname, "..", "..", "debug");
const USERNAME = "johui88";
const PASSWORD = "aa123123";

function log(level, msg) {
  const ts = new Date().toISOString().substring(11, 23);
  const prefix = { INFO: "ℹ", OK: "✅", WARN: "⚠", ERR: "❌", DBG: "🔍" }[level] || "•";
  console.log(`[${ts}] ${prefix} ${msg}`);
}
const info = (m) => log("INFO", m);
const ok = (m) => log("OK", m);
const warn = (m) => log("WARN", m);
const err = (m) => log("ERR", m);

async function screenshot(page, label) {
  try {
    if (!fs.existsSync(DEBUG_DIR)) fs.mkdirSync(DEBUG_DIR, { recursive: true });
    const p = path.join(DEBUG_DIR, `corner-bet-${label}-${Date.now()}.png`);
    await page.screenshot({ path: p, fullPage: true });
    info(`截图: ${p}`);
  } catch (e) {}
}

async function handleBetPopups(page) {
  try {
    await page.evaluate(() => {
      const cancelSelectors = ["#C_no_btn", "#no_btn", ".btn_cancel"];
      for (const sel of cancelSelectors) {
        const btns = document.querySelectorAll(sel);
        for (const btn of btns) {
          const rect = btn.getBoundingClientRect();
          if (rect.width > 0 && rect.height > 0) {
            const text = (btn.textContent || "").trim().toUpperCase();
            if (text === "NO" || text === "否") { btn.click(); return; }
          }
        }
      }
      const okSelectors = ["#C_ok_btn", "#ok_btn", ".btn_confirm"];
      for (const sel of okSelectors) {
        const btns = document.querySelectorAll(sel);
        for (const btn of btns) {
          const rect = btn.getBoundingClientRect();
          if (rect.width > 0 && rect.height > 0) {
            const text = (btn.textContent || "").trim().toUpperCase();
            if (text === "OK" || text === "确认") { btn.click(); return; }
          }
        }
      }
      const popupIds = ["C_alert_confirm", "alert_confirm", "alert_show", "system_popup", "alert_kick"];
      for (const id of popupIds) {
        const el = document.getElementById(id);
        if (el && el.classList.contains("on")) el.classList.remove("on");
      }
      if (document.body) {
        document.body.classList.remove("scroll_lock", "locked");
        document.body.style.overflow = "";
      }
    });
  } catch (e) {}
  try { await page.keyboard.press("Escape"); } catch (_) {}
}

async function detectState(page) {
  try {
    return await page.evaluate(() => {
      function isReallyVisible(el) {
        if (!el) return false;
        const style = getComputedStyle(el);
        if (style.display === 'none' || style.visibility === 'hidden') return false;
        return true;
      }
      var bodyText = document.body.textContent || "";
      var hasMainFeature =
        bodyText.includes("My Events") || bodyText.includes("My Bets") ||
        (bodyText.includes("In-Play") && bodyText.includes("Soccer")) ||
        bodyText.includes("Balance") || bodyText.includes("余额");
      if (!hasMainFeature) {
        var nav = document.getElementById("today_page") || document.getElementById("live_page");
        if (nav && isReallyVisible(nav)) hasMainFeature = true;
      }
      if (hasMainFeature) return { state: "LOGGED_IN" };
      var backLogin = document.getElementById("back_login");
      if (backLogin && isReallyVisible(backLogin)) return { state: "PASSCODE_PAGE" };
      var alertKick = document.getElementById("alert_kick");
      if (alertKick && alertKick.classList.contains("on")) return { state: "KICKED_OUT" };
      var popupIds = ["C_alert_confirm", "alert_confirm", "alert_show"];
      for (var id of popupIds) {
        var el = document.getElementById(id);
        if (el && el.classList.contains("on")) return { state: "POPUP_ACTIVE" };
      }
      var usrEl = document.getElementById("usr");
      if (usrEl && isReallyVisible(usrEl)) return { state: "LOGIN_PAGE" };
      return { state: "UNKNOWN" };
    });
  } catch (e) { return { state: "ERROR" }; }
}

async function main() {
  info("========================================");
  info("  角球投注功能端到端测试");
  info("========================================");

  const launchArgs = ["--ignore-certificate-errors", "--no-sandbox"];
  if (process.env.PUPPETEER_PROXY) {
    launchArgs.push(`--proxy-server=${process.env.PUPPETEER_PROXY}`);
  }

  const browser = await puppeteer.launch({
    headless: false,
    args: launchArgs,
    defaultViewport: { width: 1280, height: 900 },
    ignoreHTTPSErrors: true,
  });

  const page = await browser.newPage();
  await page.setUserAgent(
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/128.0.0.0 Safari/537.36"
  );

  try {
    // ========== 1. 登录 ==========
    info("导航到 " + HG_URL);
    await page.goto(HG_URL, { timeout: 30000, waitUntil: "domcontentloaded" });
    await new Promise(r => setTimeout(r, 3000));
    await screenshot(page, "initial");

    let loginAttempts = 0;
    const MAX_LOGIN = 5;
    while (loginAttempts < MAX_LOGIN) {
      const state = await detectState(page);
      info(`状态: ${state.state}`);

      if (state.state === "LOGGED_IN") { ok("登录成功"); break; }
      if (state.state === "PASSCODE_PAGE") {
        await page.evaluate(() => { const btn = document.getElementById("back_login"); if (btn) btn.click(); });
        await new Promise(r => setTimeout(r, 2000)); continue;
      }
      if (state.state === "KICKED_OUT") {
        await page.evaluate(() => { const btn = document.getElementById("kick_ok_btn"); if (btn) btn.click(); });
        await new Promise(r => setTimeout(r, 1000));
        const client = await page.target().createCDPSession();
        await client.send("Network.clearBrowserCookies");
        await page.goto(HG_URL, { timeout: 30000, waitUntil: "domcontentloaded" });
        await new Promise(r => setTimeout(r, 3000)); continue;
      }
      if (state.state === "POPUP_ACTIVE") {
        await handleBetPopups(page);
        await new Promise(r => setTimeout(r, 1000)); continue;
      }
      if (state.state === "LOGIN_PAGE") {
        loginAttempts++;
        info(`登录尝试 ${loginAttempts}/${MAX_LOGIN}`);
        try {
          const usr = await page.$("#usr");
          if (usr) { await usr.click({ clickCount: 3 }); await usr.type(USERNAME, { delay: 50 }); }
          const pwd = await page.$("#pwd");
          if (pwd) { await pwd.click({ clickCount: 3 }); await pwd.type(PASSWORD, { delay: 50 }); }
          const btn = await page.$("#btn_login");
          if (btn) { await btn.click(); }
        } catch (e) { warn("登录输入失败: " + e.message); }
        await new Promise(r => setTimeout(r, 5000));
        await handleBetPopups(page);
        await new Promise(r => setTimeout(r, 2000));
        continue;
      }
      await new Promise(r => setTimeout(r, 2000));
    }

    if ((await detectState(page)).state !== "LOGGED_IN") {
      err("登录失败"); process.exit(1);
    }
    await screenshot(page, "logged-in");

    // ========== 2. 导航到角球页面 ==========
    info("导航到角球页面...");
    // 先点击 In-Play
    const liveClicked = await page.evaluate(() => {
      const el = document.getElementById("live_page");
      if (el) { el.click(); return true; }
      return false;
    });
    if (!liveClicked) {
      // 尝试 Today
      await page.evaluate(() => {
        const el = document.getElementById("today_page");
        if (el) el.click();
      });
    }
    await new Promise(r => setTimeout(r, 2000));
    await handleBetPopups(page);

    // 点击 Soccer
    const soccerClicked = await page.evaluate(() => {
      const el = document.getElementById("symbol_ft");
      if (el) { el.click(); return true; }
      return false;
    });
    ok(`Soccer标签: ${soccerClicked ? "已点击" : "未找到"}`);
    await new Promise(r => setTimeout(r, 3000));
    await handleBetPopups(page);

    // 点击 CORNERS 标签
    const cornersClicked = await page.evaluate(() => {
      const tabCn = document.getElementById("tab_cn");
      if (tabCn) { tabCn.click(); return true; }
      // 回退：文本匹配
      const allEls = document.querySelectorAll("div, span, a, li");
      for (const el of allEls) {
        const text = (el.textContent || "").trim().toUpperCase();
        if (text === "CORNERS" || text === "角球") {
          const rect = el.getBoundingClientRect();
          if (rect.width > 10 && rect.height > 8) { el.click(); return true; }
        }
      }
      return false;
    });
    ok(`CORNERS标签: ${cornersClicked ? "已点击" : "未找到"}`);
    await new Promise(r => setTimeout(r, 3000));
    await handleBetPopups(page);
    await screenshot(page, "corners-tab");

    // ========== 3. 检测角球页面比赛 ==========
    info("检测角球页面比赛...");
    const pageAnalysis = await page.evaluate(() => {
      const result = {
        matchRows: 0,
        oddsElements: 0,
        textOddsElements: 0,
        sampleOdds: [],
        sampleMatchNames: [],
        pageStructure: ""
      };

      // 检查比赛行
      const rowSelectors = ["div.box_lebet", "tr[class*='row']", "[class*='event']", "[class*='match']"];
      for (const sel of rowSelectors) {
        const rows = document.querySelectorAll(sel);
        if (rows.length > 0) {
          result.matchRows = rows.length;
          // 取前3个比赛行的文本
          for (let i = 0; i < Math.min(3, rows.length); i++) {
            const text = (rows[i].textContent || "").substring(0, 100);
            result.sampleMatchNames.push(text);
          }
          break;
        }
      }

      // 检查赔率元素
      const oddsSelectors = ["span.text_odds", "[class*='text_odds']", "[class*='odd']", "[class*='price']"];
      for (const sel of oddsSelectors) {
        const els = document.querySelectorAll(sel);
        if (els.length > 0) {
          result.oddsElements = els.length;
          if (sel.includes("text_odds")) result.textOddsElements = els.length;
          // 取前5个赔率值
          for (let i = 0; i < Math.min(5, els.length); i++) {
            const val = parseFloat((els[i].textContent || "").trim());
            if (!isNaN(val)) result.sampleOdds.push(val);
          }
          break;
        }
      }

      // 页面结构摘要
      const body = document.body?.textContent || "";
      if (body.includes("CORNERS") || body.includes("角球")) result.pageStructure += "CORNERS标签可见;";
      if (body.includes("In-Play")) result.pageStructure += "In-Play;";
      if (body.includes("No data") || body.includes("暂无数据")) result.pageStructure += "无数据;";

      return result;
    });

    info(`角球页面分析结果:`);
    info(`  比赛行数: ${pageAnalysis.matchRows}`);
    info(`  赔率元素数: ${pageAnalysis.oddsElements} (text_odds: ${pageAnalysis.textOddsElements})`);
    info(`  样本赔率: ${JSON.stringify(pageAnalysis.sampleOdds)}`);
    info(`  样本比赛: ${JSON.stringify(pageAnalysis.sampleMatchNames)}`);
    info(`  页面结构: ${pageAnalysis.pageStructure}`);

    if (pageAnalysis.matchRows === 0) {
      warn("角球页面无比赛，尝试回退到让球/大小页面...");
      await page.evaluate(() => {
        const tabRnou = document.getElementById("tab_rnou");
        if (tabRnou) tabRnou.click();
      });
      await new Promise(r => setTimeout(r, 3000));
      await screenshot(page, "hdp-ou-fallback");

      const hdpAnalysis = await page.evaluate(() => {
        const odds = document.querySelectorAll("span.text_odds, [class*='odd']");
        const vals = [];
        for (let i = 0; i < Math.min(5, odds.length); i++) {
          const v = parseFloat((odds[i].textContent || "").trim());
          if (!isNaN(v)) vals.push(v);
        }
        return { oddsCount: odds.length, sampleOdds: vals };
      });
      info(`让球/大小页面: ${hdpAnalysis.oddsCount} 个赔率元素, 样本: ${JSON.stringify(hdpAnalysis.sampleOdds)}`);
    }

    // ========== 4. 点击第一个有效赔率 ==========
    info("尝试点击第一个有效赔率...");
    const clickResult = await page.evaluate(() => {
      const selectors = ["span.text_odds", "[class*='text_odds']", "[class*='odd']", "[class*='price']"];
      for (const sel of selectors) {
        const els = document.querySelectorAll(sel);
        for (const el of els) {
          const text = (el.textContent || "").trim();
          const val = parseFloat(text);
          if (!isNaN(val) && val > 1.0 && val < 20.0) {
            el.scrollIntoView({ block: "center" });
            el.click();
            return { success: true, odds: val, text: text, selector: sel };
          }
        }
      }
      return { success: false };
    });

    if (clickResult.success) {
      ok(`已点击赔率: ${clickResult.text} (${clickResult.odds}) [选择器: ${clickResult.selector}]`);
    } else {
      err("未找到可点击的赔率");
      await browser.close(); process.exit(1);
    }

    await new Promise(r => setTimeout(r, 3000));
    await handleBetPopups(page);
    await screenshot(page, "odds-clicked");

    // ========== 5. 检测投注弹窗 ==========
    info("检测投注弹窗元素...");
    const popupAnalysis = await page.evaluate(() => {
      const result = {
        hasPopup: false,
        inputById: {},
        inputByAttr: [],
        buttonById: {},
        buttonByKeywords: [],
        popupContainer: false
      };

      // 检查 ID 匹配的输入框
      const inputIds = ["bet_finish_gold", "gold", "credit", "wager_amount", "bet_gold"];
      for (const id of inputIds) {
        const inp = document.getElementById(id);
        if (inp) {
          result.inputById[id] = {
            tag: inp.tagName,
            type: inp.type,
            visible: inp.getBoundingClientRect().width > 0
          };
          result.hasPopup = true;
        }
      }

      // 检查弹窗容器
      const popupSelectors = ["[class*='bet_finish']", "[id*='bet_finish']", "[class*='bet_popup']", "[class*='wager']"];
      for (const sel of popupSelectors) {
        const container = document.querySelector(sel);
        if (container) {
          result.popupContainer = true;
          result.hasPopup = true;
          // 容器内的输入框
          const inputs = container.querySelectorAll("input");
          for (const inp of inputs) {
            if (inp.type !== "hidden" && inp.getBoundingClientRect().width > 0) {
              result.inputByAttr.push({
                id: inp.id, name: inp.name, type: inp.type,
                placeholder: inp.placeholder, className: inp.className
              });
            }
          }
          // 容器内的按钮
          const btns = container.querySelectorAll("button, input[type='submit'], input[type='button']");
          for (const btn of btns) {
            const rect = btn.getBoundingClientRect();
            if (rect.width > 0) {
              result.buttonByKeywords.push({
                id: btn.id, text: (btn.textContent || btn.value || "").trim().substring(0, 50),
                className: btn.className
              });
            }
          }
          break;
        }
      }

      // 检查 ID 匹配的按钮
      const btnIds = ["btn_submit", "btn_confirm", "bet_finish_submit", "submit_bet"];
      for (const id of btnIds) {
        const btn = document.getElementById(id);
        if (btn) {
          result.buttonById[id] = {
            text: (btn.textContent || "").trim().substring(0, 50),
            visible: btn.getBoundingClientRect().width > 0
          };
          result.hasPopup = true;
        }
      }

      // 通用搜索
      const allInputs = document.querySelectorAll("input[type='text'], input[type='number']");
      for (const inp of allInputs) {
        if (inp.getBoundingClientRect().width > 0) {
          const alreadyListed = Object.values(result.inputById).some(v => v) ||
            result.inputByAttr.some(i => i.id === inp.id);
          if (!alreadyListed) {
            result.inputByAttr.push({
              id: inp.id, name: inp.name, type: inp.type,
              placeholder: inp.placeholder, className: (inp.className || "").substring(0, 50)
            });
          }
        }
      }

      return result;
    });

    info(`投注弹窗分析结果:`);
    info(`  弹窗存在: ${popupAnalysis.hasPopup}`);
    info(`  弹窗容器: ${popupAnalysis.popupContainer}`);
    info(`  ID匹配输入框: ${JSON.stringify(popupAnalysis.inputById)}`);
    info(`  属性匹配输入框: ${JSON.stringify(popupAnalysis.inputByAttr)}`);
    info(`  ID匹配按钮: ${JSON.stringify(popupAnalysis.buttonById)}`);
    info(`  文本匹配按钮: ${JSON.stringify(popupAnalysis.buttonByKeywords)}`);

    if (!popupAnalysis.hasPopup) {
      warn("未检测到投注弹窗！可能赔率点击未触发弹窗");
      await screenshot(page, "no-popup");
      await browser.close(); process.exit(1);
    }

    // ========== 6. 输入金额 ==========
    info("输入投注金额...");
    const amountFilled = await page.evaluate((amt) => {
      const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype, "value"
      ).set;
      function fillInput(inp) {
        inp.value = ""; inp.focus();
        nativeInputValueSetter.call(inp, String(amt));
        inp.dispatchEvent(new Event("input", { bubbles: true }));
        inp.dispatchEvent(new Event("change", { bubbles: true }));
        inp.dispatchEvent(new Event("blur", { bubbles: true }));
        return { method: "id:" + inp.id };
      }

      const ids = ["bet_finish_gold", "gold", "credit", "wager_amount", "bet_gold"];
      for (const id of ids) {
        const inp = document.getElementById(id);
        if (inp && inp.tagName === "INPUT") return fillInput(inp);
      }
      const popupSelectors = ["[class*='bet_finish']", "[id*='bet_finish']", "[class*='wager']"];
      for (const sel of popupSelectors) {
        const container = document.querySelector(sel);
        if (container) {
          const inputs = container.querySelectorAll("input");
          for (const inp of inputs) {
            if (inp.type !== "hidden" && inp.getBoundingClientRect().width > 0) {
              return fillInput(inp);
            }
          }
        }
      }
      const inputs = document.querySelectorAll("input[type='text'], input[type='number']");
      for (const inp of inputs) {
        const p = (inp.placeholder || "").toLowerCase();
        const n = (inp.name || "").toLowerCase();
        const c = (inp.className || "").toLowerCase();
        if (p.includes("stake") || p.includes("amount") || p.includes("金额") || n.includes("gold") || n.includes("credit") || c.includes("gold") || c.includes("credit")) {
          return fillInput(inp);
        }
      }
      return null;
    }, "10");

    if (amountFilled) {
      ok(`金额已输入 (${amountFilled.method})`);
    } else {
      err("未找到金额输入框");
    }
    await screenshot(page, "amount-filled");

    // ========== 7. 点击下单按钮 ==========
    info("点击下单按钮...");
    const submitted = await page.evaluate(() => {
      const ids = ["btn_submit", "btn_confirm", "bet_finish_submit"];
      for (const id of ids) {
        const btn = document.getElementById(id);
        if (btn && btn.getBoundingClientRect().width > 0) { btn.click(); return { method: "id:" + id }; }
      }
      const popupSelectors = ["[class*='bet_finish']", "[id*='bet_finish']", "[class*='wager']"];
      for (const sel of popupSelectors) {
        const container = document.querySelector(sel);
        if (container) {
          const btns = container.querySelectorAll("button, input[type='submit']");
          for (const btn of btns) {
            if (btn.getBoundingClientRect().width > 0) { btn.click(); return { method: "popup-btn" }; }
          }
        }
      }
      const keywords = ["下单", "投注", "place bet", "confirm", "确认"];
      const btns = document.querySelectorAll("button, [class*='btn'], input[type='submit']");
      for (const btn of btns) {
        const text = (btn.textContent || btn.value || "").trim().toLowerCase();
        for (const kw of keywords) {
          if (text.includes(kw) && btn.getBoundingClientRect().width > 0) {
            btn.click(); return { method: "text:" + text };
          }
        }
      }
      return null;
    });

    if (submitted) {
      ok(`下单按钮已点击 (${submitted.method})`);
    } else {
      err("未找到下单按钮");
    }

    // ========== 8. 检测结果 ==========
    await new Promise(r => setTimeout(r, 3000));
    await screenshot(page, "bet-result");

    const result = await page.evaluate(() => {
      const body = document.body?.textContent || "";
      if (body.includes("Insufficient") || body.includes("不足") || body.includes("余额不足")) return "insufficient";
      if (body.includes("Accepted") || body.includes("成功") || body.includes("confirmed")) return "success";
      if (body.includes("Rejected") || body.includes("失败")) return "failed";
      return "unknown";
    });

    info("========================================");
    if (result === "insufficient") ok("测试完毕：投注链路畅通（余额不足为预期结果）");
    else if (result === "success") warn("测试完毕：投注成功！请注意账户余额");
    else if (result === "failed") err("测试完毕：投注被平台拒绝");
    else warn("测试完毕：无法确定投注结果");
    info("========================================");

  } catch (e) {
    err(`测试异常: ${e.message}`);
    console.error(e);
  } finally {
    info("关闭浏览器...");
    await browser.close();
  }
}

main();
