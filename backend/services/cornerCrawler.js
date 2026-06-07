import puppeteer from "puppeteer-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";
import fs from "fs";
import path from "path";
import {
  getSharedBrowser, getSharedPage, setSharedPage,
  getLoginCookies, setLoginCookies,
  getBalance, setBalance, isLoggedIn, isBrowserActive, getUid,
  closeSharedBrowser, HG_URL,
  saveCookiesToDisk, loadCookiesFromDisk
} from "./browserPool.js";
import { loginToHG as hgLoginToHG } from "./hgCrawlerService.js";
import { getCurrentVer, extractVerFromRequest } from "./transformSigner.js";
import { fetchGameList, RTYPE, extractParamsWithRetry } from "./transformApi.js";
import { parseGameListXML } from "./xhrDataParser.js";
import { parseAllMarkets, handlePopups, clickTab, parseAsianHandicap, randomDelay } from "./crawlerShared.js";

puppeteer.use(StealthPlugin());

// ======================== 配置 ========================
const HG_USERNAME = process.env.HG_USERNAME || "";
const HG_PASSWORD = process.env.HG_PASSWORD || "";
if (!process.env.HG_USERNAME || !process.env.HG_PASSWORD) {
  console.warn("[cornerCrawler] 环境变量 HG_USERNAME / HG_PASSWORD 未设置，将使用运行时凭据");
}
const POLL_INTERVAL = 3000 + Math.random() * 7000;

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
      const body = document.body;
      if (!body) return null;
      const text = body.textContent || "";
      const patterns = [
        /Balance[:\s]*[$]?\s*([\d,]+\.?\d*)/i,
        /余额[:\s]*[¥$€]?\s*([\d,]+\.?\d*)/i,
        /Credit[:\s]*[$]?\s*([\d,]+\.?\d*)/i,
        /[$]?\s*([\d,]+\.?\d{2})/
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
      const passcodeStatus = await page.evaluate(() => {
        const backLoginBtn = document.getElementById("back_login");
        const isBackLoginVisible = backLoginBtn
          && getComputedStyle(backLoginBtn).display !== 'none'
          && getComputedStyle(backLoginBtn).visibility !== 'hidden';
        const bodyText = (document.body?.textContent || "").substring(0, 500);
        const hasPasscodeText = bodyText.includes("Passcode Login") || bodyText.includes("简易密码");
        const hasTwoFactorText = bodyText.includes("普通登入");
        return { isBackLoginVisible, hasPasscodeText, hasTwoFactorText };
      });

      if (!passcodeStatus.isBackLoginVisible && !passcodeStatus.hasTwoFactorText) {
        return { detected: false, handled: false };
      }

      console.log(`[cornerCrawler] 检测到简易密码页面 (attempt ${attempt + 1}/${maxRetries})，点击普通登入...`);
      await page.evaluate(() => {
        const btn = document.querySelector("#back_login");
        if (btn) btn.click();
      });
      await randomDelay(3000, 4000);

      // 重新输入账号密码
      const reUser = (runtimeCredentials && runtimeCredentials.username) || HG_USERNAME;
      const rePwd = (runtimeCredentials && runtimeCredentials.password) || HG_PASSWORD;
      await page.evaluate((usr, pw) => {
        const u = document.getElementById('usr');
        const p = document.getElementById('pwd');
        if (u) { u.value = usr; u.dispatchEvent(new Event('input', { bubbles: true })); }
        if (p) { p.value = pw; p.dispatchEvent(new Event('input', { bubbles: true })); }
      }, reUser, rePwd);
      await randomDelay(500, 1000);
      await page.evaluate(() => {
        const btn = document.getElementById('btn_login');
        if (btn) btn.click();
      });
      console.log("[cornerCrawler] 已重新登录，等待页面加载...");
      await randomDelay(5000, 7000);

      // 验证是否成功离开简易密码页面
      const stillOnPasscode = await page.evaluate(() => {
        const btn = document.getElementById("back_login");
        return btn && getComputedStyle(btn).display !== 'none' && getComputedStyle(btn).visibility !== 'hidden';
      });
      if (!stillOnPasscode) {
        console.log("[cornerCrawler] 简易密码页面已处理成功");
        return { detected: true, handled: true };
      }
      console.log("[cornerCrawler] 简易密码页面仍存在，重试...");
    } catch (e) {
      console.warn("[cornerCrawler] 简易密码检测失败:", e.message);
    }
  }
  return { detected: true, handled: false };
}

async function ensureLogin() {
  // 用户主动关闭浏览器，阻止自动重新登录
  if (browserExplicitlyClosed) {
    console.log("[cornerCrawler] 浏览器已被显式关闭，跳过登录");
    return null;
  }

  browserExplicitlyClosed = false;
  const _loginStart = Date.now();

  // 登录并发保护
  if (loginInProgress) {
    console.log("[cornerCrawler] 登录正在进行中，等待...");
    const _waitStart = Date.now();
    const MAX_WAIT = 60000;
    while (loginInProgress) {
      if (Date.now() - _waitStart > MAX_WAIT) {
        console.warn("[cornerCrawler] loginInProgress 超时(60s)，强制释放锁");
        loginInProgress = false;
        break;
      }
      await new Promise(r => setTimeout(r, 1000));
    }
    const ep = getSharedPage();
    if (ep && isBrowserActive()) {
      try { await ep.url(); return ep; } catch (e) {}
    }
  }

  // 1. 检查现有的共享页面是否已登录
  const existingPage = getSharedPage();
  if (existingPage && isBrowserActive()) {
    try {
      // 先验证页面可访问
      let url = ""; try { url = existingPage.url(); } catch (_) {}
      console.log("[cornerCrawler] Shared page URL:", url.substring(0, 100));

      // 等待页面稳定（可能刚从登录跳转过来）
      await new Promise(r => setTimeout(r, 1000));

      const stillLoggedIn = await existingPage.evaluate(() => {
        const bodyText = document.body?.textContent || "";
        // 多种登录成功标志
        if (bodyText.includes("My Events") || bodyText.includes("My Bets")) return true;
        if (bodyText.includes("In-Play") && bodyText.includes("Soccer")) return true;
        // 检查足球入口按钮
        const el = document.getElementById("symbol_ft") || document.getElementById("old_ft_live_league") || document.getElementById("today_page") || document.getElementById("live_page");
        if (el) { const s = getComputedStyle(el); return s.display !== "none" && s.visibility !== "hidden"; }
        // 检查账户显示（acc_show 隐藏=已登录）
        const acc = document.getElementById("acc_show");
        if (acc) { const s = getComputedStyle(acc); if (s.display === "none" || acc.offsetParent === null) return true; }
        return false;
      }).catch(() => false);

      if (stillLoggedIn) {
        console.log("[cornerCrawler] 复用已登录会话: " + (Date.now() - _loginStart) + "ms");
        await handlePasscodePage(existingPage);
        return existingPage;
      }
      console.log("[cornerCrawler] Shared page 登录态已失效");
    } catch (e) {
      console.warn("[cornerCrawler] Shared page 不可用:", e.message);
      setSharedPage(null);
    }
  }

  // 2. 获取浏览器实例
  const bi = await getSharedBrowser(false);
  console.log("[cornerCrawler] [耗时] getSharedBrowser: " + (Date.now() - _loginStart) + "ms");
  if (!bi) {
    console.error("[cornerCrawler] 浏览器未启动");
    return null;
  }

  // 3. Cookie 快速登录
  const savedCookies = loadCookiesFromDisk();
  if (savedCookies && savedCookies.length > 0) {
    try {
      console.log("[cornerCrawler] 尝试 Cookie 快速登录...");
      const quickPage = await bi.newPage();
      await quickPage.setUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36");
      await quickPage.setViewport({ width: 1920, height: 1400 });
      for (const ck of savedCookies) { try { await quickPage.setCookie(ck); } catch (_) {} }
      await quickPage.goto(HG_URL, { waitUntil: "domcontentloaded", timeout: 15000 });
      await new Promise(r => setTimeout(r, 3000));

      const passcodeResult = await handlePasscodePage(quickPage);
      if (passcodeResult.detected && passcodeResult.handled) {
        console.log("[cornerCrawler] Cookie 登录后处理了简易密码页面: " + (Date.now() - _loginStart) + "ms");
      }

      const valid = await quickPage.evaluate(() => {
        const bodyText = document.body?.textContent || "";
        if (bodyText.includes("My Events") || bodyText.includes("My Bets")) return true;
        if (bodyText.includes("In-Play") && bodyText.includes("Soccer")) return true;
        const el = document.getElementById("symbol_ft") || document.getElementById("old_ft_live_league") || document.getElementById("today_page") || document.getElementById("live_page");
        if (el) { const s = getComputedStyle(el); return s.display !== "none" && s.visibility !== "hidden"; }
        const acc = document.getElementById("acc_show");
        if (acc) { const s = getComputedStyle(acc); if (s.display === "none" || acc.offsetParent === null) return true; }
        return false;
      }).catch(() => false);

      if (valid) {
        setSharedPage(quickPage);
        console.log("[cornerCrawler] Cookie 快速登录成功: " + (Date.now() - _loginStart) + "ms");
        return quickPage;
      }
      console.log("[cornerCrawler] Cookie 已过期");
      await quickPage.close();
    } catch (e) {
      console.warn("[cornerCrawler] Cookie 快速登录失败:", e.message);
    }
  }

  // 4. 自动完整登录回退（环境变量提供凭据时）
  if (HG_USERNAME && HG_PASSWORD) {
    console.log("[cornerCrawler] Cookie 过期或未登录，自动执行完整登录...");
    try {
      const result = await hgLoginToHG({ username: HG_USERNAME, password: HG_PASSWORD });
      if (result?.success) {
        const sp = getSharedPage();
        if (sp) {
          console.log("[cornerCrawler] 自动登录成功，耗时: " + (Date.now() - _loginStart) + "ms");
          await handlePasscodePage(sp);
          return sp;
        }
      }
      console.warn("[cornerCrawler] 自动登录失败: " + (result?.error || "unknown"));
    } catch (loginErr) {
      console.error("[cornerCrawler] 自动登录异常:", loginErr.message);
    }
  }

  console.warn("[cornerCrawler] 所有登录方式均失败，无法爬取");
  return null;
}

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
              time: timeStr, elapsedMinutes,
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
                homeTeam, awayTeam, league, time: timeStr, elapsedMinutes,
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
      // Extract ver signature for subsequent API calls
      if (url.includes("transform.php") || url.includes("transform_nl.php")) {
        extractVerFromRequest(url);
      }

      // Try to parse as JSON (transform_nl.php returns JSON)
      let jsonData = null;
      try { jsonData = JSON.parse(text); } catch (e) {
        // transform.php returns XML, JSON parse failure is expected
        // Continue to check for XML format match data
      }

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
  if (m.nextCorner) {
    // 清理角球编号文本：支持中文数字和阿拉伯数字
    let cornerText = (m.nextCorner.corner || "").trim();
    const cnNumMap = {'一':'1','二':'2','三':'3','四':'4','五':'5','六':'6','七':'7','八':'8','九':'9','十':'10','十一':'11','十二':'12','十三':'13','十四':'14','十五':'15'};
    let cornerNum = "";
    // 先尝试提取中文数字
    const cnMatch = cornerText.match(/[一二三四五六七八九十]+/);
    if (cnMatch && cnNumMap[cnMatch[0]]) {
      cornerNum = cnNumMap[cnMatch[0]];
    } else {
      // 回退：提取阿拉伯数字
      cornerNum = cornerText.replace(/[^0-9]/g, "");
    }
    if (!cornerNum) cornerNum = "0";
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
  return result;
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

  // 检查浏览器是否已被用户手动关闭，不自动重启
  if (browserExplicitlyClosed) {
    console.log("[cornerCrawler] 浏览器已被手动关闭，跳过爬取");
    crawlingLock = false;
    clearTimeout(lockTimeout);
    return { success: false, data: { matches: [], allText: [], allElements: [] }, count: 0, timestamp: ts, error: "browser_closed" };
  }

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

    // 导航到角球页面（反爬随机延迟）
    await randomDelay(1000, 3000);
    const navResult = await navigateToCorners(page);
    const dataSource = navResult?.source || "unknown";
    const matchScores = navResult?.matchScores || {};
      // ★ 无 Soccer 数据时提前终止
    if (navResult?.noSoccer) {
      console.log("[cornerCrawler] 无 Soccer 数据，终止爬取");
      crawlingLock = false;
      clearTimeout(lockTimeout);
      return { success: false, data: { matches: [], allText: [], allElements: [] }, count: 0, timestamp: ts, error: "今日无足球赛事", noSoccer: true };
    }
  const soccerMarkets = navResult?.soccerMarkets || {};
    console.log("[cornerCrawler] Navigation result: source=" + dataSource + " scores=" + Object.keys(matchScores).length);
    await randomDelay(500, 1000);

    // 主动登出检测：检查 kick_ok_btn 弹窗
    try {
      const kickedOut = await page.evaluate(() => {
          const kickBtn = document.querySelector("#kick_ok_btn");
          if (!kickBtn) return false;
          const style = getComputedStyle(kickBtn);
          return style.display !== 'none' && style.visibility !== 'hidden';
        });
      if (kickedOut) {
        console.log("[cornerCrawler] 检测到登出弹窗(kick_ok_btn)，尝试重新登录...");
        try { await page.click("#kick_ok_btn"); } catch (_) {}
        await randomDelay(1000, 2000);
        const rePage = await ensureLogin();
        if (rePage) {
          console.log("[cornerCrawler] 重新登录成功，重新导航...");
          await setupXHRInterception(rePage);
          await navigateToCorners(rePage);
          await randomDelay(500, 1000);
        }
      }
    } catch (e) {
      console.warn("[cornerCrawler] 登出检测失败:", e.message);
    }

    // 简易密码页面检测：导航后可能跳转到简易密码页面（多次重试）
    try {
      const passcodeResult = await handlePasscodePage(page, 3);
      if (passcodeResult.detected && passcodeResult.handled) {
        // 重新导航到角球页面
        try {
          await setupXHRInterception(page);
          await navigateToCorners(page);
          await randomDelay(500, 1000);
        } catch (navErr) {
          console.warn("[cornerCrawler] 重新导航失败:", navErr.message);
        }
      }
    } catch (e) {
      console.warn("[cornerCrawler] 简易密码检测失败:", e.message);
    }

    // 等待数据加载
    await randomDelay(800, 1500);


    // 滚动触发懒加载
    try {
      await page.evaluate(() => {
        window.scrollTo(0, document.body.scrollHeight);
        setTimeout(() => window.scrollTo(0, 0), 500);
      });
    } catch(e) {}
    await randomDelay(1500, 3000);

    // 解析 DOM 获取角球盘口（使用专用 parseCornerMarkets 替代通用 parseAllMarkets）
    const domData = await parseCornerMarkets(page, matchScores);
    console.log("[cornerCrawler] DOM corner markets: " + domData.length);

    // 尝试从 XHR 捕获中提取比赛列表
    let xhrMatches = [];
    try {
      // Log all captured response summaries for debugging
      if (capturedResponses.length > 0) {
        console.log("[cornerCrawler] Captured " + capturedResponses.length + " XHR responses:");
        for (let ci = 0; ci < capturedResponses.length; ci++) {
          const cr = capturedResponses[ci];
          console.log("[cornerCrawler]   [" + ci + "] items=" + cr.itemCount + " fields=" + JSON.stringify(cr.sampleFields) + " url=" + cr.url.substring(0, 120));
        }
      } else {
        console.log("[cornerCrawler] No XHR responses captured, seen URLs: " + seenRequestUrls.size);
      }

      const bestResponse = pickBestResponse(capturedResponses);
      if (bestResponse && bestResponse.matchList && bestResponse.matchList.length > 0) {
        xhrMatches = bestResponse.matchList
          .map(mapToCornerMatch)
          .filter(m => m.homeTeam && m.awayTeam);
        console.log("[cornerCrawler] XHR matches found: " + xhrMatches.length);
      } else {
        console.log("[cornerCrawler] No XHR matches extracted from " + capturedResponses.length + " responses");
      }
    } catch (e) {
      console.warn("[cornerCrawler] XHR data extraction failed:", e.message);
    }

    // 映射 DOM 数据到标准格式（parseCornerMarkets 返回 cornerOU/cornerHDP/nextCorner/cornerOE 格式）
    const matches = domData.map((m, idx) => ({
      matchId: "g_" + (m.homeTeam + "_" + m.awayTeam).replace(/[^a-zA-Z0-9]/g, "_") + "_" + idx,
      matchName: m.homeTeam + " vs " + m.awayTeam,
      homeTeam: m.homeTeam, awayTeam: m.awayTeam,
      league: m.league || "", time: m.time || "",
      elapsedMinutes: m.elapsedMinutes || 0,
      homeScore: m.homeScore || 0, awayScore: m.awayScore || 0,
      totalCorners: m.totalCorners || 0,
      homeCorners: m.cornerHomeCount || 0, awayCorners: m.cornerAwayCount || 0,
      _cornerSource: "dom",
      cornerHandicap: m.cornerHDP ? parseAsianHandicap(m.cornerHDP.line) : 0,
      cornerOdds: m.cornerHDP ? (m.cornerHDP.homeOdds || 0) : 0,
      handicaps: buildHandicapsArray(m),
      dataQuality: m.cornerHDP || m.cornerOU ? "full" : (m.homeTeam ? "partial" : "empty"),
      timestamp: Date.now(),
      triggeredStrategies: []
    }));

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

        
    // ★ 混合模式：API 增强盘口数据
    const apiUid = getUid();
    const apiVer = getCurrentVer();
    if (apiUid && apiVer && matches.length > 0) {
      console.log("[cornerCrawler] 并行请求 API 增强盘口数据...");
      try {
        const cachedParams = { uid: apiUid, ver: apiVer, langx: "en-us" };
        const [rbXml, rcnXml, rrnouXml] = await Promise.all([
          fetchGameList(page, RTYPE.RB, {}, cachedParams),
          fetchGameList(page, RTYPE.RCN, {}, cachedParams),
          fetchGameList(page, RTYPE.RNOU, {}, cachedParams),
        ]);
        const rcnResult = rcnXml ? parseGameListXML(rcnXml) : { matches: [] };
        const rrnouResult = rrnouXml ? parseGameListXML(rrnouXml) : { matches: [] };

        // 按球队名建立索引（API 返回的 matchId/GID 与 DOM matchId 不同）
        const rcnByName = new Map();
        for (const m of (rcnResult.matches || [])) {
          const key = (m.homeTeam + "|" + m.awayTeam).toLowerCase();
          rcnByName.set(key, m);
        }
        const rrnouByName = new Map();
        for (const m of (rrnouResult.matches || [])) {
          const key = (m.homeTeam + "|" + m.awayTeam).toLowerCase();
          rrnouByName.set(key, m);
        }

        let enrichedCount = 0;
        for (const match of matches) {
          const key = (match.homeTeam + "|" + match.awayTeam).toLowerCase();
          const rcn = rcnByName.get(key);
          const rrn = rrnouByName.get(key);

          if (rcn) {
            match._cornerOULine = rcn._cornerOULine || "";
            match._cornerOUOdds = rcn._cornerOUOdds || "";
            match._hasCornerMarket = rcn._hasCornerMarket || false;
          }
          if (rrn) {
            match._hdpLine = rrn._hdpLine || "";
            match._hdpHomeOdds = rrn._hdpHomeOdds || "";
            match._hdpAwayOdds = rrn._hdpAwayOdds || "";
            match._ouLine = rrn._ouLine || "";
            match._ouOverOdds = rrn._ouOverOdds || "";
            match._ouUnderOdds = rrn._ouUnderOdds || "";
          }
          if (rcn || rrn) enrichedCount++;
        }
        console.log("[cornerCrawler] API 增强完成: " + enrichedCount + "/" + matches.length + " 场比赛已补充盘口数据");
        for (const m of matches) {
          m._dataSource = "dom+api";
        }
      } catch (apiErr) {
        console.warn("[cornerCrawler] API 增强失败，降级为纯 DOM 数据:", apiErr.message);
        for (const m of matches) {
          m._dataSource = "dom";
        }
      }
    } else {
      if (!apiUid) console.log("[cornerCrawler] 无缓存 uid，跳过 API 增强");
      else if (!apiVer) console.log("[cornerCrawler] 无缓存 ver，跳过 API 增强");
      else console.log("[cornerCrawler] 无比赛数据，跳过 API 增强");
    }

        console.log("[cornerCrawler] ===== Done: " + matches.length + " corner matches =====");
    if (matches.length === 0) {
      console.log("[cornerCrawler] ZERO matches! DOM count=" + domData.length + " XHR count=" + xhrMatches.length + " capturedResponses=" + capturedResponses.length);
      // Dump page sample to debug file
      try {
        const sample = await page.evaluate(() => {
          const body = document.body;
          return body ? (body.textContent || "").replace(/\s+/g, " ").trim().substring(0, 500) : "(no body)";
        });
        fs.writeFileSync("debug/zero-matches-page.txt", sample + "\n\nSeen URLs: " + JSON.stringify([...seenRequestUrls].slice(0, 20)));
        console.log("[cornerCrawler] Page sample written to debug/zero-matches-page.txt");
      } catch(e) {}
    }

    // 保存调试截图
// Add data source info to each match
    for (const m of matches) {
      m._dataSource = dataSource;
    }

    return {
      success: true,
      data: { matches, allText: [], allElements: [] },
      count: matches.length,
      timestamp: ts,
      mainMarkets: soccerMarkets
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

export async function closeCrawler() {
  stopCornerPolling();
  capturedResponses = [];
  browserExplicitlyClosed = true;
  return await closeSharedBrowser();
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