import puppeteer from "puppeteer-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";

puppeteer.use(StealthPlugin());

import { getSharedBrowser, getSharedPage, setSharedPage, isBrowserActive, closeSharedBrowser as closeShared, HG_URL } from "./browserPool.js";
import { parseAllMarkets, handlePopups, clickTab, parseAsianHandicap } from "./crawlerShared.js";
import { pauseCornerBackendPolling, resumeCornerBackendPolling, getBackendPollingStatus } from "./cornerService.js";
import fs from "fs";

// ======================== 配置常量 ========================
const HG_USERNAME = process.env.HG_USERNAME || "";
const HG_PASSWORD = process.env.HG_PASSWORD || "";
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
      if (err.message && err.message.includes("Execution context was destroyed") && retries > 1) {
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
    const result = await page.evaluate(() => {
      let clickedSomething = false;
      const cancelBtns = document.querySelectorAll(".btn_cancel, #C_no_btn, #no_btn");
      for (const btn of cancelBtns) {
        const text = (btn.textContent || "").trim().toUpperCase();
        if (text === "NO" || text === "否" || btn.id === "C_no_btn" || btn.id === "no_btn") {
          btn.click(); clickedSomething = true;
        }
      }
      const okBtns = document.querySelectorAll('[class*="msg_popup"] .btn, .btn_confirm, #C_ok_btn, #ok_btn');
      for (const btn of okBtns) {
        const text = (btn.textContent || "").trim().toUpperCase();
        if (text === "OK" || text === "确认" || text === "确定") {
          btn.click(); clickedSomething = true;
        }
      }
      return clickedSomething;
    });
    if (result) console.log("[HgCrawler] ✓ 已处理弹窗");
    return !!result;
  } catch (err) {
    console.log("[HgCrawler] clickNoButton 出错:", err.message);
    return false;
  }
}

// ======================== 登录 ========================
export async function loginToHG(credentials, forceNew = false) {
  console.log("[HgCrawler] 开始登录...");
  crawlerStatus.error = null;

  // Priority: reuse shared browser session from browserPool
  if (!forceNew) {
    const sharedPage = getSharedPage();
    if (sharedPage && isBrowserActive()) {
      try {
        const sharedUrl = await sharedPage.url();
        console.log("[HgCrawler] Shared session found: " + (sharedUrl || "").substring(0, 100));
        const status = await safeEvaluate(sharedPage, () => {
          try {
            const bodyText = document.body.textContent || "";
            return (bodyText.includes("My Events") || bodyText.includes("My Bets")) ||
                   (bodyText.includes("In-Play") && bodyText.includes("Soccer"));
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
  if (!forceNew && mainPage) {
    try {
      const currentUrl = mainPage.url();
      console.log("[HgCrawler] 复用已有页面: " + (currentUrl || "").substring(0, 100));
      const status = await safeEvaluate(mainPage, () => {
        try {
          const bodyText = document.body.textContent || "";
          return (bodyText.includes("My Events") || bodyText.includes("My Bets")) ||
                 (bodyText.includes("In-Play") && bodyText.includes("Soccer"));
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

  const bi = await getSharedBrowser(forceNew);
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

    await page.goto(HG_URL, { waitUntil: "domcontentloaded", timeout: 60000 });
    console.log("[HgCrawler] 等待页面完全加载...");
    await new Promise((r) => setTimeout(r, 5000));

    let loginClicked = false;
    let popupLastHandledAt = 0;

    for (let i = 0; i < 80; i++) {
      await new Promise((r) => setTimeout(r, 1000));

      const status = await safeEvaluate(page, () => {
        try {
          const bodyText = document.body.textContent || "";
          return {
            hasSuccess: (bodyText.includes("My Events") || bodyText.includes("My Bets")) ||
                        (bodyText.includes("In-Play") && bodyText.includes("Soccer") && bodyText.includes("Basketball")),
            hasLogin: bodyText.includes("登入") || bodyText.includes("登录") || bodyText.includes("LOG IN"),
            hasPasscodeDialog: bodyText.includes("Passcode Login") || bodyText.includes("简易密码"),
            hasLoggedOutMsg: bodyText.includes("您已被强制登出") || bodyText.includes("You have been logged out"),
            hasTwoFactor: bodyText.includes("普通登入")
          };
        } catch (err) { return null; }
      });

      if (!status) continue;

      if (status.hasSuccess) {
        console.log("[HgCrawler] ✅ 登录成功！");
        mainPage = page;
        setSharedPage(page);
        crawlerStatus.isLoggedIn = true;
        if (process.env.CRAWLER_DEBUG === "1") {
          await page.screenshot({ path: "debug-login-success.png" });
        }
        return { success: true };
      }

      if ((status.hasPasscodeDialog || status.hasLoggedOutMsg) && (i - popupLastHandledAt >= 3 || i === 10)) {
        console.log("[HgCrawler] 检测到弹窗，尝试处理...");
        const clicked = await clickNoButton(page);
        if (clicked) {
          popupLastHandledAt = i;
          loginClicked = false;
          await new Promise((r) => setTimeout(r, 2000));
        }
        continue;
      }

      if (status.hasTwoFactor) {
        console.log("[HgCrawler] ⚠ 进入二次验证，返回登录");
        await safeEvaluate(page, () => {
          const btn = document.querySelector("#back_login");
          if (btn) btn.click();
        });
        await new Promise((r) => setTimeout(r, 5000));
        loginClicked = false;
        continue;
      }

      if (!loginClicked && status.hasLogin) {
        console.log("[HgCrawler] 设置用户名密码并登录...");
        const user = credentials && credentials.username ? credentials.username : HG_USERNAME;
        const pwd = credentials && credentials.password ? credentials.password : HG_PASSWORD;

        await page.evaluate((usr, pw) => {
          const usrInput = document.querySelector("#usr") || document.querySelector("input[type='text']");
          if (usrInput) {
            usrInput.value = usr;
            usrInput.dispatchEvent(new Event("input", { bubbles: true }));
          }
          const pwdInput = document.querySelector("#pwd") || document.querySelector("input[type='password']");
          if (pwdInput) {
            pwdInput.value = pw;
            pwdInput.dispatchEvent(new Event("input", { bubbles: true }));
          }
          setTimeout(() => {
            const loginBtn = document.querySelector("#btn_login") || document.querySelector("input[type='button']") || document.querySelector("button");
            if (loginBtn) loginBtn.click();
          }, 500);
        }, user, pwd);

        loginClicked = true;
        console.log("[HgCrawler] ✓ 已点击登录按钮");
        continue;
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
    // SPA 页面，URL 不变是正常的，以 DOM 内容为准
    const clicked = await clickTab(page, "In-Play", NAV_WAIT_MS);
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
          let cornerOU = null, cornerHDP = null, nextCorner = null, cornerOE = null;

          const oddBlocks = box.querySelectorAll("div.box_lebet_odd:not(.box_lebet_half)");
          if (oddBlocks.length > 0) {
            for (const block of oddBlocks) {
              const headSpan = block.querySelector("div.head_lebet span");
              if (!headSpan) continue;
              const marketType = (headSpan.textContent || "").trim().toUpperCase();
              const betButtons = block.querySelectorAll("div.btn_lebet_odd:not(.lock)");
              if (betButtons.length === 0) continue;

              if (marketType === "O/U" && betButtons.length >= 2) {
                cornerOU = {
                  line: safeFloat(betButtons[0], "tt.text_ballhead"),
                  overOdds: safeFloat(betButtons[0], "span.text_odds"),
                  underOdds: safeFloat(betButtons[1], "span.text_odds")
                };
              } else if (marketType === "HDP" && betButtons.length >= 2) {
                cornerHDP = {
                  line: safeText(betButtons[0], "tt.text_ballhead"),
                  homeOdds: safeFloat(betButtons[0], "span.text_odds"),
                  awayOdds: safeFloat(betButtons[1], "span.text_odds")
                };
              } else if (marketType === "NEXT CORNER" && betButtons.length >= 2) {
                nextCorner = {
                  corner: safeText(betButtons[0], "tt.text_ballou"),
                  homeOdds: safeFloat(betButtons[0], "span.text_odds"),
                  awayOdds: safeFloat(betButtons[1], "span.text_odds")
                };
              } else if (marketType === "O/E" && betButtons.length >= 2) {
                cornerOE = {
                  oddOdds: safeFloat(betButtons[0], "span.text_odds"),
                  evenOdds: safeFloat(betButtons[1], "span.text_odds")
                };
              }
            }
          }

          // 兜底: 标签匹配失败时用硬编码索引
          if (!cornerHDP && !cornerOU) {
            const oddsSpans = box.querySelectorAll("span.odds");
            const oddsValues = [];
            oddsSpans.forEach(s => { const v = parseFloat((s.textContent || "").trim()); if (!isNaN(v)) oddsValues.push(v); });
            if (oddsValues.length >= 6) {
              cornerOU = { line: 0, overOdds: oddsValues[0], underOdds: oddsValues[1] };
              cornerHDP = { line: "", homeOdds: oddsValues[2], awayOdds: oddsValues[3] };
              nextCorner = { corner: "", homeOdds: oddsValues[4], awayOdds: oddsValues[5] };
            }
            if (oddsValues.length >= 8) {
              cornerOE = { oddOdds: oddsValues[6], evenOdds: oddsValues[7] };
            }
          }

          const result = {
            homeTeam, awayTeam, league, time: timeStr, elapsedMinutes,
            homeScore, awayScore, totalCorners: cornerCount,
            cornerOU, cornerHDP, nextCorner, cornerOE,
            rawOdds: []
          };

          results.push(result);
        } catch (e) {}
      }
    }

    // ====== 策略2: div.box_lebet.bet_type_cn ======
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

            const rightPanel = gameEl.querySelector("div.box_lebet_r");
            let cornerOU = null, cornerHDP = null, nextCorner = null, cornerOE = null;

            if (rightPanel) {
              const oddBlocks = rightPanel.querySelectorAll("div.box_lebet_odd");
              for (const block of oddBlocks) {
                if (block.classList.contains("box_lebet_half")) continue;
                const headSpan = block.querySelector("div.head_lebet span");
                if (!headSpan) continue;
                const marketType = (headSpan.textContent || "").trim().toUpperCase();
                const betButtons = block.querySelectorAll("div.btn_lebet_odd:not(.lock)");
                if (betButtons.length === 0) continue;

                if (marketType === "O/U" && betButtons.length >= 2) {
                  cornerOU = { line: safeFloat(betButtons[0], "tt.text_ballhead"), overOdds: safeFloat(betButtons[0], "span.text_odds"), underOdds: safeFloat(betButtons[1], "span.text_odds") };
                } else if (marketType === "HDP" && betButtons.length >= 2) {
                  cornerHDP = { line: safeText(betButtons[0], "tt.text_ballhead"), homeOdds: safeFloat(betButtons[0], "span.text_odds"), awayOdds: safeFloat(betButtons[1], "span.text_odds") };
                } else if (marketType === "NEXT CORNER" && betButtons.length >= 2) {
                  nextCorner = { corner: safeText(betButtons[0], "tt.text_ballou"), homeOdds: safeFloat(betButtons[0], "span.text_odds"), awayOdds: safeFloat(betButtons[1], "span.text_odds") };
                } else if (marketType === "O/E" && betButtons.length >= 2) {
                  cornerOE = { oddOdds: safeFloat(betButtons[0], "span.text_odds"), evenOdds: safeFloat(betButtons[1], "span.text_odds") };
                }
              }
            }

            results.push({ homeTeam, awayTeam, league, time: timeStr, elapsedMinutes, homeScore, awayScore, totalCorners: cornerCount, cornerOU, cornerHDP, nextCorner, cornerOE });
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

    // Step 2: 点击 Soccer 标签（尝试多种名称）
    console.log("[HgCrawler] 点击 Soccer 标签...");
    const soccerNames = ["Soccer", "FOOTBALL", "Football", "足球"];
    let soccerClicked = false;
    for (const name of soccerNames) {
      if (await clickTab(mainPage, name)) { soccerClicked = true; break; }
    }
    if (!soccerClicked) {
      console.log("[HgCrawler] ⚠ Soccer标签未找到，尝试匹配包含关键词的元素...");
      // 万能匹配：搜索包含 "soccer" 或 "football" 或 "足球" 的可点击元素
      try {
        soccerClicked = await mainPage.evaluate(() => {
          const keywords = ["soccer", "football", "足球"];
          const els = document.querySelectorAll("div, span, a, li, button");
          for (const el of els) {
            const text = (el.textContent || "").toLowerCase();
            const rect = el.getBoundingClientRect();
            if (rect.width < 15 || rect.height < 10) continue;
            for (const kw of keywords) {
              if (text.includes(kw)) { el.click(); return true; }
            }
          }
          return false;
        });
      } catch (e) {}
    }
    console.log("[HgCrawler] Soccer标签点击结果: " + (soccerClicked ? "成功" : "失败，跳过"));
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
    await clickTab(mainPage, "CORNERS");
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
export async function fetchSchedule() {
  console.log("[HgCrawler] === 获取赛程 (Today → CORNERS) ===");

  if (!(await ensurePageReady())) {
    return { success: false, error: "无法连接到浏览器页面" };
  }

  // 暂停角球后端轮询，避免竞态条件（fetchSchedule 和 crawlCornerMatches 共用同一浏览器页面）
  const pollStatus = getBackendPollingStatus();
  const wasPolling = pollStatus.isPolling && !pollStatus.isPaused;
  if (wasPolling) {
    pauseCornerBackendPolling();
    console.log("[HgCrawler] 已暂停角球轮询");
  }

  try {
    await navigateToInPlay(mainPage);

    // ========== 阶段一：提取 Today 比赛列表 ==========
    console.log("[HgCrawler] 点击 Today 标签...");
    await clickTab(mainPage, "Today");
    console.log("[HgCrawler] 等待 Today 比赛数据渲染...");
    try {
      await mainPage.waitForFunction(() => {
        const containers = document.querySelectorAll('div.box_lebet[class*="bet_type_"]');
        if (containers.length === 0) return false;
        for (const c of containers) {
          const text = c.textContent || '';
          if (text.includes('*')) continue;
          const ht = c.querySelector('div.box_team.teamH span.text_team, div.team_home, [class*="team_h"]');
          const at = c.querySelector('div.box_team.teamC span.text_team, div.team_away, [class*="team_a"]');
          if (ht && at && (ht.textContent || '').trim().length > 2 && (at.textContent || '').trim().length > 2) return true;
        }
        return false;
      }, { timeout: 20000 });
      console.log("[HgCrawler] Today 比赛数据已加载");
    } catch (e) {
      console.log("[HgCrawler] Today 比赛等待超时: " + e.message);
    }
    await new Promise(r => setTimeout(r, 2000));

    // 提取 Today 比赛列表
    const todayMatches = await mainPage.evaluate(() => {
      const results = [];
      const containers = document.querySelectorAll('div.box_lebet[class*="bet_type_"]');
      for (const box of containers) {
        const text = box.textContent || '';
        if (text.includes('*')) continue;
        let league = '';
        let prev = box.previousElementSibling;
        while (prev && !league) {
          const pt = (prev.textContent || '').trim();
          if (pt && pt.length < 40 && pt.indexOf('\n') < 0 && !/^\d/.test(pt)) league = pt;
          prev = prev.previousElementSibling;
        }
        const htEl = box.querySelector('div.box_team.teamH span.text_team, div.team_home, [class*="team_h"]');
        const atEl = box.querySelector('div.box_team.teamC span.text_team, div.team_away, [class*="team_a"]');
        const ht = htEl ? (htEl.textContent || '').trim() : '';
        const at = atEl ? (atEl.textContent || '').trim() : '';
        if (!ht || !at) continue;
        const timeEl = box.querySelector('tt.text_time i, .text_time, [class*="timer"], [class*="minute"]');
        const time = timeEl ? (timeEl.textContent || '').trim() : '';
        const scoreEls = box.querySelectorAll('div.box_score span.text_point, .score, [class*="score"] span, [class*="point"]');
        const hs = scoreEls.length >= 2 ? parseInt((scoreEls[0].textContent || '0').trim(), 10) : 0;
        const as2 = scoreEls.length >= 2 ? parseInt((scoreEls[1].textContent || '0').trim(), 10) : 0;
        results.push({
          homeTeam: ht, awayTeam: at, league, time,
          homeScore: isNaN(hs) ? 0 : hs,
          awayScore: isNaN(as2) ? 0 : as2
        });
      }
      return results;
    });
    console.log("[HgCrawler] Today 比赛列表: " + todayMatches.length + " 场");

    // ========== 阶段二：提取 CORNERS 盘口 ==========
    console.log("[HgCrawler] 点击 CORNERS 标签...");
    await clickTab(mainPage, "CORNERS");

    // 智能等待：等待实际盘口数据渲染完成（而非仅 DOM 存在）
    console.log("[HgCrawler] 等待 CORNERS 盘口数据渲染...");
    let oddsReady = false;
    try {
      oddsReady = await mainPage.waitForFunction(() => {
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
    await new Promise(r => setTimeout(r, 2000));

    // 滚动触发懒加载
    try {
      await mainPage.evaluate(() => { window.scrollTo(0, document.body.scrollHeight); setTimeout(() => window.scrollTo(0, 0), 1000); });
      await new Promise(r => setTimeout(r, 3000));
    } catch (e) {}

    try { await mainPage.screenshot({ path: "debug/schedule-corners.png", fullPage: true }); console.log("[HgCrawler] 截图: debug/schedule-corners.png"); } catch (e) {}

    // 解析 CORNERS 盘口（优先 parseAllMarkets，回退到 parseCornerOdds）
    let cornerOdds = await parseAllMarkets(mainPage);
    if (cornerOdds.length === 0) {
      console.log("[HgCrawler] parseAllMarkets 无结果，尝试 parseCornerOdds 直接解析...");
      cornerOdds = await parseCornerOdds(mainPage);
    }
    console.log("[HgCrawler] CORNERS 盘口: " + cornerOdds.length + " 条");

    // ========== 阶段三：合并 Today 比赛 + CORNERS 盘口 ==========
    const cornersByTeam = {};
    for (const co of cornerOdds) {
      const key = (co.homeTeam + "_" + co.awayTeam).toLowerCase().replace(/[^a-z0-9_]/g, "");
      cornersByTeam[key] = co;
    }

    const scheduleData = todayMatches.map((tm, idx) => {
      const key = (tm.homeTeam + "_" + tm.awayTeam).toLowerCase().replace(/[^a-z0-9_]/g, "");
      const co = cornersByTeam[key];
      const handicaps = co ? (co.handicaps || []) : [];
      const hdpEntry = handicaps.find(h => h.category === "HDP" && h.period === "full");
      const ouEntry = handicaps.find(h => h.category === "O/U" && h.period === "full");
      return {
        id: "sched_" + idx,
        league: tm.league || (co ? co.league : "") || "",
        homeTeam: tm.homeTeam,
        awayTeam: tm.awayTeam,
        time: tm.time || (co ? co.time : "") || "--:--",
        date: new Date().toLocaleDateString(),
        homeScore: tm.homeScore,
        awayScore: tm.awayScore,
        handicaps,
        cornerHandicap: hdpEntry ? parseAsianHandicap(hdpEntry.line) : 0,
        cornerOdds: (hdpEntry && hdpEntry.odds) ? (hdpEntry.odds.home || 0) : (ouEntry ? (ouEntry.odds?.over || 0) : 0),
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

    // 恢复页面到 In-Play 状态，避免污染后续实时监控
    try {
      console.log("[HgCrawler] 恢复浏览器到 In-Play 视图...");
      for (const name of ["In-Play", "滚球", "inplay", "INPLAY"]) {
        const clicked = await clickTab(mainPage, name, 1500);
        if (clicked) { console.log("[HgCrawler] In-Play tab clicked: " + name); break; }
      }
      await new Promise(r => setTimeout(r, 2000));
      await handlePopups(mainPage);
    } catch (e) {
      console.log("[HgCrawler] 恢复 In-Play 视图失败（无影响）:", e.message);
    }

    return {
      success: true,
      data: { matches: scheduleData },
      count: scheduleData.length
    };
  } catch (err) {
    console.error("[HgCrawler] 获取赛程失败:", err.message);
    crawlerStatus.error = err.message;
    try {
      const loginResult = await loginToHG();
      if (loginResult.success) return await fetchSchedule();
    } catch (e) {}
    return { success: false, error: err.message };
  } finally {
    if (wasPolling) {
      await new Promise(r => setTimeout(r, 2000));
      resumeCornerBackendPolling();
      console.log("[HgCrawler] 已恢复角球轮询");
    }
  }
}

// ======================== 轮询 ========================
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
  if (!pollingActive) return { success: true, message: "not polling" };
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
