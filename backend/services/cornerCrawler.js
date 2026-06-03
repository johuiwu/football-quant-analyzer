import puppeteer from "puppeteer-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";
import fs from "fs";
import {
  getSharedBrowser, getSharedPage, setSharedPage,
  getLoginCookies, setLoginCookies,
  getBalance, setBalance, isLoggedIn,
  closeSharedBrowser, HG_URL
} from "./browserPool.js";

puppeteer.use(StealthPlugin());

// ======================== 配置 ========================
const HG_USERNAME = process.env.HG_USERNAME || "";
const HG_PASSWORD = process.env.HG_PASSWORD || "";
if (!process.env.HG_USERNAME || !process.env.HG_PASSWORD) {
  console.warn("[cornerCrawler] 环境变量 HG_USERNAME / HG_PASSWORD 未设置，将使用运行时凭据");
}
const HEADLESS = process.env.CRAWLER_HEADLESS !== "false";
const POLL_INTERVAL = parseInt(process.env.CRAWLER_POLL_INTERVAL || "5000", 10);

// 运行时凭据
let runtimeCredentials = null;
let pollingActive = false;
let pollingStopFn = null;

// XHR 拦截缓存
let capturedResponses = [];
const seenRequestUrls = new Set();

// ======================== 弹窗处理 ========================
async function handlePopups(page) {
  for (let i = 0; i < 5; i++) {
    await new Promise(r => setTimeout(r, 1000));
    const clicked = await page.evaluate(() => {
      let clickedSomething = false;
      const noBtns = document.querySelectorAll(".btn_cancel, #C_no_btn, #no_btn, [class*='cancel']");
      for (const btn of noBtns) {
        const text = (btn.textContent || "").trim().toUpperCase();
        if (text === "NO" || text === "CANCEL") { btn.click(); clickedSomething = true; }
      }
      const okBtns = document.querySelectorAll("[class*='msg_popup'] .btn, .btn_confirm, #C_ok_btn, #ok_btn, [class*='confirm']");
      for (const btn of okBtns) {
        const text = (btn.textContent || "").trim().toUpperCase();
        if (text === "OK" || text === "CONFIRM") { btn.click(); clickedSomething = true; }
      }
      return clickedSomething;
    });
    if (!clicked) break;
  }
}

// ======================== 余额提取 ========================
async function extractBalance(page) {
  try {
    const balance = await page.evaluate(() => {
      const body = document.body;
      if (!body) return null;
      const text = body.textContent || "";
      const patterns = [
        /Balance[:\s]*[¥$€]?\s*([\d,]+\.?\d*)/i,
        /余额[:\s]*[¥$€]?\s*([\d,]+\.?\d*)/i,
        /Credit[:\s]*[¥$€]?\s*([\d,]+\.?\d*)/i,
        /[¥$€]\s*([\d,]+\.?\d{2})/
      ];
      for (const pattern of patterns) {
        const match = text.match(pattern);
        if (match) return parseFloat(match[1].replace(/,/g, ""));
      }
      return null;
    });
    if (balance !== null) {
      setBalance(balance);
      console.log("[cornerCrawler] 余额: " + balance);
    }
    return balance;
  } catch (e) {
    console.log("[cornerCrawler] 余额提取失败:", e.message);
    return null;
  }
}

// ======================== 登录流程 ========================
async function ensureLogin() {
  const bi = await getSharedBrowser(false);

  // 如果已有活跃页面且已登录，直接复用
  const existingPage = getSharedPage();
  if (existingPage) {
    try {
      await existingPage.url();
      console.log("[cornerCrawler] 复用已有登录会话");
      return existingPage;
    } catch (e) {
      setSharedPage(null);
    }
  }

  console.log("[cornerCrawler] 正在登录 hga050.com...");
  const page = await bi.newPage();

  await page.setUserAgent(
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36"
  );
  await page.setViewport({ width: 1920, height: 1400 });
  await page.evaluateOnNewDocument(() => {
    Object.defineProperty(navigator, "webdriver", { get: () => false });
    Object.defineProperty(navigator, "plugins", { get: () => [1, 2, 3, 4, 5] });
  });

  await page.goto(HG_URL, { waitUntil: "domcontentloaded", timeout: 60000 });
  await new Promise(r => setTimeout(r, 5000));

  const username = (runtimeCredentials && runtimeCredentials.username) || HG_USERNAME;
  const password = (runtimeCredentials && runtimeCredentials.password) || HG_PASSWORD;

  // 填入用户名
  try {
    await page.waitForSelector("input#usr", { timeout: 10000 });
    await page.click("input#usr", { clickCount: 3 });
    await page.type("input#usr", username, { delay: 80 });
  } catch (e) {
    console.log("[cornerCrawler] 用户名输入框未找到，尝试备用选择器...");
    try {
      await page.waitForSelector('input[type="text"]', { timeout: 5000 });
      const inputs = await page.$$('input[type="text"]');
      if (inputs.length > 0) {
        await inputs[0].click({ clickCount: 3 });
        await inputs[0].type(username, { delay: 80 });
      }
    } catch (e2) {}
  }

  // 填入密码
  try {
    await page.waitForSelector("input#pwd", { timeout: 5000 });
    await page.click("input#pwd", { clickCount: 3 });
    await page.type("input#pwd", password, { delay: 80 });
  } catch (e) {
    try {
      await page.waitForSelector('input[type="password"]', { timeout: 5000 });
      const pwds = await page.$$('input[type="password"]');
      if (pwds.length > 0) {
        await pwds[0].click({ clickCount: 3 });
        await pwds[0].type(password, { delay: 80 });
      }
    } catch (e2) {}
  }

  await new Promise(r => setTimeout(r, 500));
  try { await page.click("#btn_login", { delay: 100 }); } catch (e) {}

  // 等待登录成功
  let loginSuccess = false;
  for (let i = 0; i < 60; i++) {
    await new Promise(r => setTimeout(r, 1000));

    // 处理弹窗
    if (i % 5 === 0) await handlePopups(page);

    const status = await page.evaluate(() => {
      const body = document.body;
      const bodyText = body ? body.textContent || "" : "";
      return {
        hasInPlay: bodyText.includes("In-Play") && bodyText.includes("Soccer"),
        hasMyBets: bodyText.includes("My Bets") || bodyText.includes("My Events"),
        hasPasscode: bodyText.includes("Passcode Login")
      };
    });

    if (status.hasInPlay && status.hasMyBets) {
      loginSuccess = true;
      console.log("[cornerCrawler] ✓ 登录成功！");
      break;
    }

    if (status.hasPasscode) {
      console.log("[cornerCrawler] 检测到 Passcode 弹窗，拒绝...");
      await page.evaluate(() => {
        document.querySelectorAll(".btn_cancel, #C_no_btn, #no_btn")
          .forEach(btn => { try { btn.click(); } catch (e) {} });
      });
    }
  }

  if (!loginSuccess) {
    console.error("[cornerCrawler] 登录超时");
    return null;
  }

  setSharedPage(page);
  await extractBalance(page);
  console.log("[cornerCrawler] 登录完成，页面已就绪");
  return page;
}

// ======================== Fuzzy Tab Click ========================
async function clickTab(page, tabName) {
  console.log("[cornerCrawler] click tab: " + tabName);
  try {
    const result = await page.evaluate((name) => {
      const upperName = name.toUpperCase();
      const tabs = document.querySelectorAll('div[role="tab"]');
      for (const tab of tabs) {
        const text = (tab.textContent || "").trim().toUpperCase();
        if (text === upperName || text.replace(/\s/g, "") === upperName.replace(/\s/g, "")) {
          tab.click();
          return { action: "clicked_role_tab", text };
        }
      }
      const allEls = document.querySelectorAll("div, span, a, li, button");
      for (const el of allEls) {
        const text = (el.textContent || "").trim().toUpperCase();
        const rect = el.getBoundingClientRect();
        if (rect.width < 20 || rect.height < 12) continue;
        if (text === upperName) { el.click(); return { action: "clicked_exact", text }; }
      }
      for (const el of allEls) {
        const text = (el.textContent || "").trim().toUpperCase();
        const rect = el.getBoundingClientRect();
        if (rect.width < 20 || rect.height < 12) continue;
        if (text.includes(upperName)) { el.click(); return { action: "clicked_contains", text }; }
      }
      return { action: "not_found" };
    }, tabName);
    console.log("[cornerCrawler] click result: " + JSON.stringify(result));
    return result.action !== "not_found";
  } catch (e) {
    console.error("[cornerCrawler] click tab failed:", e.message);
    return false;
  }
}

// ======================== 导航到角球页面 ========================
async function navigateToCorners(page) {
  console.log("[cornerCrawler] ===== Navigating to Corner page =====");

  // 1. Click "Today" tab
  console.log("[cornerCrawler] Step 1: Click Today...");
  try {
    await page.waitForSelector('div[role="tab"]', { timeout: 8000 });
    const todayText = await page.evaluate(() => {
      const tabs = document.querySelectorAll('div[role="tab"]');
      for (const tab of tabs) {
        const text = (tab.textContent || "").trim().toUpperCase();
        if (text === "TODAY" || text.includes("TODAY")) { tab.click(); return text; }
      }
      return null;
    });
    console.log("[cornerCrawler] Today clicked: " + (todayText || "not found, skip"));
  } catch (e) {
    console.log("[cornerCrawler] Today click failed: " + e.message);
  }
  await new Promise(r => setTimeout(r, 2000));
  await handlePopups(page);

  // 2. Click CORNERS tab
  console.log("[cornerCrawler] Step 2: Click CORNERS...");
  let clicked = await clickTab(page, "CORNERS");
  if (!clicked) {
    console.log("[cornerCrawler] Trying Chinese ...");
    clicked = await clickTab(page, "...");
  }
  if (!clicked) {
    try {
      const allTabs = await page.evaluate(() =>
        Array.from(document.querySelectorAll('div[role="tab"]')).map(t => (t.textContent || "").trim())
      );
      console.log("[cornerCrawler] Available tabs: " + JSON.stringify(allTabs));
    } catch(e) {}
  }
  if (!clicked) {
    console.warn("[cornerCrawler] CORNERS tab not found, using current page");
  }

  await new Promise(r => setTimeout(r, 3000));
  await handlePopups(page);

  try {
    await page.screenshot({ path: "debug/corner-step2-corners.png", fullPage: false });
  } catch(e) {}

  try {
    const sample = await page.evaluate(() => {
      const body = document.body;
      if (!body) return "(empty)";
      return (body.textContent || "").replace(/\s+/g, " ").trim().substring(0, 300);
    });
    console.log("[cornerCrawler] Page sample: " + sample);
  } catch(e) {}

  console.log("[cornerCrawler] ===== Navigation done =====");
}

// ======================== DOM 解析角球盘口 ========================
async function parseCornerMarkets(page) {
  console.log("[cornerCrawler] ===== DOM Parsing Corner Markets =====");

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
    const rawData = await page.evaluate(() => {
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

      // ====== 策略1: 按 div.bet_box 解析（用户提供的新结构） ======
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

            // 如果 bet_box 内没找到，尝试兄弟元素
            if (!homeTeam || !awayTeam) {
              const parentRow = box.closest("[class*='row'], [class*='game'], [class*='match']");
              if (parentRow) {
                homeTeam = safeText(parentRow, "[class*='team_h'] span, .teamH span");
                awayTeam = safeText(parentRow, "[class*='team_c'] span, .teamC span");
              }
            }

            if (!homeTeam || !awayTeam) continue;

            // 比分和时间 - 在同级或父级查找
            let timeStr = "";
            let elapsedMinutes = 0;
            let homeScore = 0, awayScore = 0;
            let totalCorners = 0;

            const parentRow = box.closest("[class*='row'], [class*='game'], [class*='match'], [class*='box_lebet']");
            const searchRoot = parentRow || box.parentElement || box;

            timeStr = safeText(searchRoot, "tt.text_time i, .text_time, [class*='timer'], [class*='minute']");
            if (timeStr) {
              if (timeStr.toUpperCase() === "HT") elapsedMinutes = 45;
              else {
                const parts = timeStr.split(":");
                elapsedMinutes = parts.length === 2 ? parseInt(parts[0], 10) || 0 : parseInt(timeStr, 10) || 0;
              }
            }

            const scoreEls = searchRoot.querySelectorAll("div.box_score span.text_point, .score, [class*='score'] span");
            if (scoreEls.length >= 2) {
              const hs = parseInt((scoreEls[0].textContent || "0").trim(), 10);
              const as = parseInt((scoreEls[1].textContent || "0").trim(), 10);
              if (!isNaN(hs) && !isNaN(as) && hs >= 0 && hs <= 15 && as >= 0 && as <= 15) {
                homeScore = hs;
                awayScore = as;
              }
            }

            totalCorners = safeInt(searchRoot, "span.game_total, [class*='corner'], [class*='total']");

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

            // 兜底: 标签匹配失败时用硬编码索引（保留兼容性）
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
              time: timeStr, elapsedMinutes,
              homeScore, awayScore, totalCorners,
              cornerOU, cornerHDP, nextCorner, cornerOE,
              rawOdds: []
            };

            results.push(result);
          } catch (e) { /* skip broken match */ }
        }
      }

      // ====== 策略2: 按 div.box_lebet.bet_type_cn 解析（原有结构） ======
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
                timeStr = safeText(leftPanel, "tt.text_time i:not([class*='icon'])");
              }
              if (timeStr) {
                if (timeStr.toUpperCase() === "HT") elapsedMinutes = 45;
                else {
                  const parts = timeStr.split(":");
                  elapsedMinutes = parts.length === 2 ? parseInt(parts[0], 10) || 0 : parseInt(timeStr, 10) || 0;
                }
              }

              let homeScore = 0, awayScore = 0;
              const scoreSpans = leftPanel.querySelectorAll("div.box_score span.text_point");
              if (scoreSpans.length >= 2) {
                homeScore = parseInt((scoreSpans[0].textContent || "0").trim(), 10) || 0;
                awayScore = parseInt((scoreSpans[1].textContent || "0").trim(), 10) || 0;
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

              results.push({
                homeTeam, awayTeam, league, time: timeStr, elapsedMinutes,
                homeScore, awayScore, totalCorners,
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
    });

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

      // transform.php 处理
      if (url.includes("transform.php")) {
        if (saveCount < 3) {
          try {
            fs.writeFileSync("debug/transform-" + Date.now() + ".json", text.substring(0, 5000));
            saveCount++;
          } catch (e) {}
        }

        let matchList = null;
        if (jsonData.response && typeof jsonData.response === "object") {
          const respObj = jsonData.response;
          const gameKeys = Object.keys(respObj).filter(k => k.startsWith("GAME_"));
          if (gameKeys.length > 0) {
            matchList = gameKeys.map(k => respObj[k]);
            console.log("[cornerCrawler] Found " + matchList.length + " games in jsonData.response.GAME_X");
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

// ======================== 数据映射 ========================
function mapToCornerMatch(apiMatch) {
  const matchId = String(
    apiMatch.id || apiMatch.match_id || apiMatch.matchId ||
    apiMatch.event_id || apiMatch.eventId || apiMatch.game_id || apiMatch.gameId || ""
  );

  const homeTeam = apiMatch.home || apiMatch.homeTeam || apiMatch.home_team ||
                   apiMatch.team1 || apiMatch.team_home || apiMatch.h_name || "";
  const awayTeam = apiMatch.away || apiMatch.awayTeam || apiMatch.away_team ||
                   apiMatch.team2 || apiMatch.team_away || apiMatch.a_name || "";

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


// ======================== 亚洲盘口解析 ========================
/**
 * 将亚洲盘口字符串解析为数值
 * "-0.5/1" -> -0.75  "+1.5/2" -> 1.75  "0/0.5" -> 0.25  "-1" -> -1
 */
function parseAsianHandicap(line) {
  if (line == null || line === "") return 0;
  if (typeof line === "number") return line;
  const s = String(line).trim();
  let sign = 1;
  let rest = s;
  if (rest.startsWith("-")) { sign = -1; rest = rest.substring(1); }
  else if (rest.startsWith("+")) { rest = rest.substring(1); }
  if (rest.includes("/")) {
    const parts = rest.split("/");
    const vals = parts.map(p => parseFloat(p)).filter(v => !isNaN(v));
    if (vals.length === 2) return sign * ((vals[0] + vals[1]) / 2);
    if (vals.length === 1) return sign * vals[0];
    return 0;
  }
  const val = parseFloat(rest);
  return (isNaN(val)) ? 0 : sign * val;
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

// ======================== 并发锁 ========================
let crawlingLock = false;

// ======================== 主函数：爬取角球比赛数据 ========================
export async function crawlCornerMatches() {
  // 并发保护：如果已有爬取在进行中，直接返回
  if (crawlingLock) {
    console.warn("[cornerCrawler] Crawler is busy, rejecting concurrent call");
    return { success: false, data: { matches: [], allText: [], allElements: [] }, count: 0, error: "Crawler busy", busy: true };
  }
  crawlingLock = true;
  console.log("[cornerCrawler] ====== Crawling corner data ======");
  const ts = new Date().toISOString();

  // 超时保护：120 秒后自动释放锁，防止死锁
  const LOCK_TIMEOUT_MS = 120000;
  const lockTimeout = setTimeout(() => {
    if (crawlingLock) {
      console.warn("[cornerCrawler] Lock timeout reached (120s), force releasing");
      crawlingLock = false;
    }
  }, LOCK_TIMEOUT_MS);

  try {
    // 清空上次捕获的 XHR 响应
    capturedResponses = [];
    seenRequestUrls.clear();

    const page = await ensureLogin();
    if (!page) {
      console.error("[cornerCrawler] Login failed, cannot crawl");
      return { success: false, data: { matches: [], allText: [], allElements: [] }, count: 0, timestamp: ts, error: "Login failed" };
    }

    // 设置 XHR 拦截（在导航之前）
    try {
      await setupXHRInterception(page);
    } catch (e) {
      console.warn("[cornerCrawler] XHR interception setup failed:", e.message);
    }

    // 导航到角球页面
    await navigateToCorners(page);

    // 等待数据加载
    console.log("[cornerCrawler] Waiting for market data...");
    await new Promise(r => setTimeout(r, 4000));

    // 滚动触发懒加载
    try {
      await page.evaluate(() => {
        window.scrollTo(0, document.body.scrollHeight);
        setTimeout(() => window.scrollTo(0, 0), 500);
      });
    } catch(e) {}
    await new Promise(r => setTimeout(r, 2000));

    // 解析 DOM 获取角球盘口
    const domData = await parseCornerMarkets(page);
    console.log("[cornerCrawler] DOM corner markets: " + domData.length);

    // 尝试从 XHR 捕获中提取比赛列表
    let xhrMatches = [];
    try {
      const bestResponse = pickBestResponse(capturedResponses);
      if (bestResponse && bestResponse.matchList && bestResponse.matchList.length > 0) {
        xhrMatches = bestResponse.matchList
          .map(mapToCornerMatch)
          .filter(m => m.homeTeam && m.awayTeam);
        console.log("[cornerCrawler] XHR matches found: " + xhrMatches.length);
      }
    } catch (e) {
      console.warn("[cornerCrawler] XHR data extraction failed:", e.message);
    }

    // 映射 DOM 数据到标准格式
    const matches = domData.map((m, idx) => {
      const hdp = m.cornerHDP || {};
      const ou = m.cornerOU || {};
      const nc = m.nextCorner || {};
      const oe = m.cornerOE || {};

      // 使用 parseAsianHandicap 正确解析亚洲盘口
      const handicapVal = parseAsianHandicap(hdp.line);

      // 从 DOM 数据中提取角球数（优先实际值，回退为 0 并标记来源）
      const domHomeCorners = m.homeCorners ?? 0;
      const domAwayCorners = m.awayCorners ?? 0;
      const hasDomCorners = (domHomeCorners > 0 || domAwayCorners > 0);

      return {
        matchId: "g_" + (m.homeTeam + "_" + m.awayTeam).replace(/[^a-zA-Z0-9]/g, "_") + "_" + idx,
        matchName: m.homeTeam + " vs " + m.awayTeam,
        homeTeam: m.homeTeam,
        awayTeam: m.awayTeam,
        league: m.league || "",
        time: m.time || "",
        elapsedMinutes: m.elapsedMinutes || 0,
        homeScore: m.homeScore || 0,
        awayScore: m.awayScore || 0,
        totalCorners: m.totalCorners || 0,
        homeCorners: domHomeCorners,
        awayCorners: domAwayCorners,
        _cornerSource: hasDomCorners ? "dom" : "fallback",
        cornerHandicap: handicapVal,
        cornerOdds: hdp.homeOdds || 0,
        cornerOverUnder: ou.line ? { line: ou.line, overOdds: ou.overOdds, underOdds: ou.underOdds } : null,
        nextCorner: nc.corner ? nc : null,
        cornerOddEven: oe.oddOdds ? oe : null,
        dataQuality: m.dataQuality || "partial",
        timestamp: Date.now(),
        triggeredStrategies: []
      };
    });

    // 如果 DOM 有 XHR 的队伍补充信息，合并（按球队名匹配）
    if (xhrMatches.length > 0 && matches.length > 0) {
      const xhrByName = {};
      for (const xm of xhrMatches) {
        const key = (xm.homeTeam + "_" + xm.awayTeam).toLowerCase().replace(/[^a-z0-9]/g, "_");
        xhrByName[key] = xm;
      }
      for (const m of matches) {
        const key = (m.homeTeam + "_" + m.awayTeam).toLowerCase().replace(/[^a-z0-9]/g, "_");
        if (xhrByName[key]) {
          // XHR 数据中获取实际角球数（覆盖 DOM 回退值）
          const xhrHC = xhrByName[key].homeCorners || 0;
          const xhrAC = xhrByName[key].awayCorners || 0;
          if (xhrHC > 0 || xhrAC > 0) {
            m.homeCorners = xhrHC;
            m.awayCorners = xhrAC;
            m._cornerSource = "xhr";
          }
        }
      }
    }

    console.log("[cornerCrawler] ====== Done: " + matches.length + " corner matches ======");

    // 保存调试截图
    try {
      await page.screenshot({ path: "debug/corner-final.png", fullPage: false });
    } catch(e) {}

    return {
      success: true,
      data: { matches, allText: [], allElements: [] },
      count: matches.length,
      timestamp: ts
    };
  } catch (err) {
    console.error("[cornerCrawler] crawlCornerMatches error:", err.message);
    return {
      success: false,
      data: { matches: [], allText: [], allElements: [] },
      count: 0,
      timestamp: ts,
      error: err.message
    };
  } finally {
    clearTimeout(lockTimeout);
    crawlingLock = false;
  }
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
    lastUpdate: pollingActive ? Date.now() : null
  };
}

// ======================== 登录 API ========================
export async function loginToHG(username, password) {
  console.log("[cornerCrawler] 设置登录凭据...");
  runtimeCredentials = { username, password };
  const MAX_RETRIES = 3;
  let lastError = null;
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const page = await ensureLogin();
      if (page) {
        return { success: true, message: "登录成功", balance: getBalance(), attempts: attempt };
      }
      lastError = "登录返回空页面";
    } catch (err) {
      lastError = err.message;
      console.warn(`[cornerCrawler] 登录尝试 ${attempt}/${MAX_RETRIES} 失败: ${lastError}`);
    }
    if (attempt < MAX_RETRIES) {
      await new Promise(r => setTimeout(r, attempt * 2000));
    }
  }
  return { success: false, message: `登录失败（已重试${MAX_RETRIES}次）: ${lastError}`, balance: getBalance() };
}

// ======================== 关闭 ========================
export { getBalance } from "./browserPool.js";

export async function closeCrawler() {
  stopCornerPolling();
  capturedResponses = [];
  return await closeSharedBrowser();
}

// ======================== 调试 ========================
export function getDebugInfo() {
  return {
    headless: HEADLESS,
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
    headless: HEADLESS,
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

    // DOM 角球盘口
    const domData = await parseCornerMarkets(page);
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
