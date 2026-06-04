import puppeteer from "puppeteer-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";
import fs from "fs";
import {
  getSharedBrowser, getSharedPage, setSharedPage,
  getLoginCookies, setLoginCookies,
  getBalance, setBalance, isLoggedIn, isBrowserActive,
  closeSharedBrowser, HG_URL
} from "./browserPool.js";
import { parseAllMarkets, handlePopups, clickTab, parseAsianHandicap, randomDelay } from "./crawlerShared.js";

puppeteer.use(StealthPlugin());

// ======================== 閰嶇疆 ========================
const HG_USERNAME = process.env.HG_USERNAME || "";
const HG_PASSWORD = process.env.HG_PASSWORD || "";
if (!process.env.HG_USERNAME || !process.env.HG_PASSWORD) {
  console.warn("[cornerCrawler] 鐜鍙橀噺 HG_USERNAME / HG_PASSWORD 鏈缃紝灏嗕娇鐢ㄨ繍琛屾椂鍑嵁");
}
const POLL_INTERVAL = parseInt(process.env.CRAWLER_POLL_INTERVAL || "5000", 10);

// 杩愯鏃跺嚟鎹?
let runtimeCredentials = null;
let loginInProgress = false;
let crawlingLock = false;
let pollingActive = false;
let pollingStopFn = null;

// XHR 鎷︽埅缂撳瓨
let capturedResponses = [];
const seenRequestUrls = new Set();

// ======================== 浣欓鎻愬彇 ========================
async function extractBalance(page) {
  try {
    const balance = await page.evaluate(() => {
      const body = document.body;
      if (!body) return null;
      const text = body.textContent || "";
      const patterns = [
        /Balance[:\s]*[楼$鈧琞?\s*([\d,]+\.?\d*)/i,
        /浣欓[:\s]*[楼$鈧琞?\s*([\d,]+\.?\d*)/i,
        /Credit[:\s]*[楼$鈧琞?\s*([\d,]+\.?\d*)/i,
        /[楼$鈧琞\s*([\d,]+\.?\d{2})/
      ];
      for (const pattern of patterns) {
        const match = text.match(pattern);
        if (match) return parseFloat(match[1].replace(/,/g, ""));
      }
      return null;
    });
    if (balance !== null) {
      setBalance(balance);
      console.log("[cornerCrawler] 浣欓: " + balance);
    }
    return balance;
  } catch (e) {
    console.log("[cornerCrawler] 浣欓鎻愬彇澶辫触:", e.message);
    return null;
  }
}

// ======================== 鐧诲綍娴佺▼ ========================
async function ensureLogin() {
  // 鐧诲綍骞跺彂淇濇姢
  if (loginInProgress) {
    console.log("[cornerCrawler] 鐧诲綍姝ｅ湪杩涜涓紝绛夊緟...");
    while (loginInProgress) {
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

  // 濡傛灉宸叉湁娲昏穬椤甸潰涓斿凡鐧诲綍锛岀洿鎺ュ鐢?
  const existingPage = getSharedPage();
  if (existingPage && isBrowserActive()) {
    try {
      // 妫€鏌ラ〉闈㈡槸鍚︿粛鐒跺彲鐢?
      const url = await existingPage.url();
      console.log("[cornerCrawler] 澶嶇敤宸叉湁鐧诲綍浼氳瘽锛屽綋鍓嶉〉闈?", url);
      return existingPage;
    } catch (e) {
      console.warn("[cornerCrawler] 椤甸潰涓嶅彲鐢紝闇€瑕侀噸鏂扮櫥褰?", e.message);
      setSharedPage(null);
    }
  }

  // 妫€鏌ユ槸鍚﹀凡鐧诲綍锛堟祻瑙堝櫒娲昏穬浣嗛〉闈㈠彲鑳藉凡鍏抽棴锛?
  if (isLoggedIn()) {
    console.log("[cornerCrawler] 娴忚鍣ㄥ凡鐧诲綍浣嗛〉闈负绌猴紝鍒涘缓鏂伴〉闈?..");
    loginInProgress = true;
    try {
    const page = await bi.newPage();
    await page.setUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36");
    await page.setViewport({ width: 1920, height: 1400 });
    await page.goto(HG_URL, { waitUntil: "domcontentloaded", timeout: 60000 });
    await new Promise(r => setTimeout(r, 5000));
    setSharedPage(page);
    console.log("[cornerCrawler] 鏂伴〉闈㈠垱寤哄畬鎴?);
    return page;
    } finally {
      loginInProgress = false;
    }
  }

  loginInProgress = true;
  try {
  console.log("[cornerCrawler] 姝ｅ湪鐧诲綍 hga050.com...");
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
  await new Promise(r => setTimeout(r, 8000));
  
  // 淇濆瓨鍒濆椤甸潰鎴浘
  try {
    await page.screenshot({ path: "debug/login-page-1.png" });
  } catch(e) {}

  const username = (runtimeCredentials && runtimeCredentials.username) || HG_USERNAME;
  const password = (runtimeCredentials && runtimeCredentials.password) || HG_PASSWORD;
  
  // 鍏堟煡鐪嬮〉闈㈡湁鍝簺琛ㄥ崟鍏冪礌
  const pageElements = await page.evaluate(() => {
    const inputs = Array.from(document.querySelectorAll('input')).map(i => ({
      type: i.type,
      id: i.id,
      name: i.name,
      className: i.className,
      placeholder: i.placeholder,
      tag: i.tagName
    }));
    const buttons = Array.from(document.querySelectorAll('button, input[type="submit"], [role="button"]')).map(b => ({
      text: (b.textContent || '').substring(0, 50),
      id: b.id,
      className: b.className
    }));
    return { inputs, buttons };
  });
  console.log("[cornerCrawler] 椤甸潰杈撳叆妗?", JSON.stringify(pageElements.inputs));
  console.log("[cornerCrawler] 椤甸潰鎸夐挳:", JSON.stringify(pageElements.buttons));

  // 鏇存櫤鑳界殑閫夋嫨鍣ㄧ瓥鐣?
  const usernameSelectors = [
    "input#usr",
    "input#username",
    'input[name="username"]',
    'input[type="text"]'
  ];
  
  const passwordSelectors = [
    "input#pwd",
    "input#password",
    'input[name="password"]',
    'input[type="password"]'
  ];

  const loginButtonSelectors = [
    "#btn_login",
    "button#login",
    'input[type="submit"]',
    'button[type="submit"]'
  ];

  // 濉叆鐢ㄦ埛鍚?
  let usernameFilled = false;
  for (const selector of usernameSelectors) {
    try {
      const el = await page.$(selector);
      if (el) {
        console.log("[cornerCrawler] 浣跨敤鐢ㄦ埛鍚嶉€夋嫨鍣ㄦ垚鍔?", selector);
        await el.click({ clickCount: 3 });
        await el.type(username, { delay: 80 });
        usernameFilled = true;
        break;
      }
    } catch(e) {}
  }
  
  // 澶囦唤鏂规锛氱洿鎺ユ壘鎵€鏈夊彲瑙佺殑 text 杈撳叆妗?
  if (!usernameFilled) {
    console.log("[cornerCrawler] 浣跨敤澶囦唤绛栫暐锛氭煡鎵炬墍鏈夋枃鏈緭鍏ユ...");
    const allInputs = await page.$$('input[type="text"], input:not([type])');
    for (const el of allInputs) {
      try {
        const isVisible = await page.evaluate(e => {
          const rect = e.getBoundingClientRect();
          return rect.width > 0 && rect.height > 0;
        }, el);
        if (isVisible) {
          await el.click({ clickCount: 3 });
          await el.type(username, { delay: 80 });
          usernameFilled = true;
          break;
        }
      } catch(e) {}
    }
  }

  // 濉叆瀵嗙爜
  let passwordFilled = false;
  for (const selector of passwordSelectors) {
    try {
      const el = await page.$(selector);
      if (el) {
        console.log("[cornerCrawler] 浣跨敤瀵嗙爜閫夋嫨鍣ㄦ垚鍔?", selector);
        await el.click({ clickCount: 3 });
        await el.type(password, { delay: 80 });
        passwordFilled = true;
        break;
      }
    } catch(e) {}
  }

  if (!passwordFilled) {
    console.log("[cornerCrawler] 浣跨敤澶囦唤绛栫暐锛氭煡鎵炬墍鏈夊瘑鐮佽緭鍏ユ...");
    const allPwds = await page.$$('input[type="password"]');
    if (allPwds.length > 0) {
      await allPwds[0].click({ clickCount: 3 });
      await allPwds[0].type(password, { delay: 80 });
      passwordFilled = true;
    }
  }

  // 淇濆瓨濉啓鍚庣殑鎴浘
  try {
    await page.screenshot({ path: "debug/login-page-2-filled.png" });
  } catch(e) {}

  // 鐐瑰嚮鐧诲綍鎸夐挳
  await new Promise(r => setTimeout(r, 800));
  let loginButtonClicked = false;
  for (const selector of loginButtonSelectors) {
    try {
      const el = await page.$(selector);
      if (el) {
        console.log("[cornerCrawler] 浣跨敤鐧诲綍鎸夐挳閫夋嫨鍣?", selector);
        await el.click({ delay: 150 });
        loginButtonClicked = true;
        break;
      }
    } catch(e) {}
  }
  
  if (!loginButtonClicked) {
    console.log("[cornerCrawler] 灏濊瘯鐐瑰嚮鎵€鏈夊彲鑳界殑鎸夐挳...");
    const allButtons = await page.$$('button, [role="button"], [onclick]');
    for (const btn of allButtons) {
      try {
        const text = await page.evaluate(el => (el.textContent || '').toLowerCase(), btn);
        if (text.includes('login') || text.includes('鐧诲綍')) {
          await btn.click({ delay: 150 });
          loginButtonClicked = true;
          break;
        }
      } catch(e) {}
    }
  }

  // 绛夊緟鐧诲綍鎴愬姛
  let loginSuccess = false;
  for (let i = 0; i < 90; i++) {
    await new Promise(r => setTimeout(r, 1000));

    // 澶勭悊寮圭獥
    if (i % 5 === 0) await handlePopups(page);

    const status = await page.evaluate(() => {
      const body = document.body;
      const bodyText = body ? body.textContent || "" : "";
      return {
        hasInPlay: (bodyText.includes("In-Play") || bodyText.includes("婊氱悆")) && (bodyText.includes("Soccer") || bodyText.includes("瓒崇悆")),
        hasMyBets: bodyText.includes("My Bets") || bodyText.includes("My Events") || bodyText.includes("鎴戠殑鎶曟敞") || bodyText.includes("鎴戠殑璧涗簨"),
        hasPasscode: bodyText.includes("Passcode Login"),
        currentUrl: window.location.href,
        bodyTextSample: bodyText.substring(0, 200)
      };
    });
    
    if (i % 10 === 0) {
      console.log("[cornerCrawler] 褰撳墠椤甸潰:", status.currentUrl);
      console.log("[cornerCrawler] 椤甸潰鍐呭:", status.bodyTextSample);
    }

    if (status.hasInPlay && status.hasMyBets) {
      loginSuccess = true;
      console.log("[cornerCrawler] 鉁?鐧诲綍鎴愬姛锛?);
      break;
    }

    if (status.hasPasscode) {
      console.log("[cornerCrawler] 妫€娴嬪埌 Passcode 寮圭獥锛屾嫆缁?..");
      await page.evaluate(() => {
        document.querySelectorAll(".btn_cancel, #C_no_btn, #no_btn")
          .forEach(btn => { try { btn.click(); } catch (e) {} });
      });
    }
  }

  // 淇濆瓨鏈€缁堢櫥褰曞悗鐨勬埅鍥?
  try {
    await page.screenshot({ path: "debug/login-page-3-final.png" });
  } catch(e) {}

  if (!loginSuccess) {
    console.error("[cornerCrawler] 鐧诲綍瓒呮椂");
    return null;
  }

  setSharedPage(page);
  await extractBalance(page);
  console.log("[cornerCrawler] 鐧诲綍瀹屾垚锛岄〉闈㈠凡灏辩华");
  return page;
} finally {
  loginInProgress = false;
}
}

// ======================== 瀵艰埅鍒拌鐞冮〉闈?========================
export async function navigateToCorners(page) {
  console.log("[cornerCrawler] ===== Navigating to Corner page =====");
  let contentSource = "unknown"; // "inplay", "today", "worldcup", "unknown"

  // Helper: check if page has match rows
  async function hasMatches() {
    try {
      const count = await page.evaluate(() => document.querySelectorAll('div.box_lebet[class*="bet_type_"]').length);
      return count > 0;
    } catch (e) { return false; }
  }

  // Helper: try clicking a view tab
  async function trySwitchView(tabText) {
    console.log("[cornerCrawler] Trying to switch to: " + tabText);
    try {
      const clicked = await page.evaluate((txt) => {
        const all = document.querySelectorAll('#showtype_now, #league_name, div.btn_filter, div[id*="tab"], div.btn_title_le, div.txt_sport, div.btn_le_sport');
        for (const el of all) {
          const t = (el.textContent || "").trim();
          if (t === txt || t.includes(txt)) { el.scrollIntoView({block:'center'}); el.click(); return true; }
        }
        return false;
      }, tabText);
      if (clicked) {
        await new Promise(r => setTimeout(r, 5000));
        await handlePopups(page);
      }
      return clicked;
    } catch (e) { return false; }
  }

  // 0. 蹇€熸鏌ワ細CORNERS tab 鏄惁宸叉縺娲讳笖褰撳墠鍦?In-Play锛堥潪 Today锛夎鍥?  const alreadyOnCorners = await page.evaluate(() => {
    const cnTab = document.getElementById('tab_cn');
    if (!cnTab || !(cnTab.classList.contains('on') || cnTab.classList.contains('active'))) return false;
    if (document.querySelectorAll('div.box_lebet_odd').length === 0) return false;

    // 鎺掗櫎 Today/浠婃棩瑙嗗浘锛氶伩鍏嶅皢璧涚▼鏁版嵁褰撲綔瀹炴椂鏁版嵁
    const activeTabs = document.querySelectorAll('.btn_filter.on, .btn_filter.active, [class*="today"], [class*="filter"]');
    for (const tab of activeTabs) {
      const text = (tab.textContent || '').toLowerCase().trim();
      if (text === 'today' || text === '浠婃棩') return false;
    }
    // URL 妫€娴?    const url = window.location.href.toLowerCase();
    if (url.includes('today') && !url.includes('inplay') && !url.includes('in-play')) return false;

    return true;
  });
  if (alreadyOnCorners) {
    console.log("[cornerCrawler] CORNERS tab already active on In-Play, skipping navigation");
    await new Promise(r => setTimeout(r, 2000));
    await handlePopups(page);
    return { success: true, source: "corner-inplay-active", matchScores: {} };
  }

  // 0.5: 纭繚鍦?In-Play 瑙嗗浘锛堣€岄潪 Today锛?  const isInPlay = await page.evaluate(() => {
    const url = window.location.href.toLowerCase();
    if (url.includes('inplay') || url.includes('in-play')) return true;
    const activeFilters = document.querySelectorAll('.btn_filter.on, .btn_filter.active');
    return Array.from(activeFilters).some(el => {
      const text = (el.textContent || '').toLowerCase();
      return text.includes('inplay') || text.includes('in-play') || text.includes('婊氱悆');
    });
  });

  if (!isInPlay) {
    console.log("[cornerCrawler] Not on In-Play view, switching from Today...");
    const inplayNames = ["In-Play", "婊氱悆", "INPLAY", "inplay", "Inplay"];
    for (const name of inplayNames) {
      if (await clickTab(page, name, 1500)) {
        console.log("[cornerCrawler] Switched to In-Play: " + name);
        await new Promise(r => setTimeout(r, 3000));
        await handlePopups(page);
        break;
      }
    }
  }

  // 1. Detect In-Play page content - 澶氶€夋嫨鍣ㄥ洖閫€绮剧畝鐗?
  console.log("[cornerCrawler] Step 1: Detecting In-Play page content...");
  let contentLoaded = false;
  contentSource = "inplay";

  // 绛夊緟椤甸潰娓叉煋锛堜娇鐢ㄥ绉嶉€夋嫨鍣ㄥ洖閫€锛岀綉绔欑粨鏋勫彲鑳藉凡鍙樺寲锛?
  try {
    await page.waitForFunction(() => {
      const selectors = [
        'div[class*="team"]',            // 鐞冮槦鐩稿叧瀹瑰櫒
        'div.bet_box',                   // 鎶曟敞瀹瑰櫒锛堟柊缁撴瀯锛?
        'div.box_lebet[class*="bet_type_"]', // 鏃х粨鏋?
        'div[class*="inplay"]',          // In-Play 鐩稿叧鍏冪礌
        '[class*="box_score"]',          // 姣斿垎瀹瑰櫒
        'div[class*="game"]',            // 姣旇禌瀹瑰櫒
        'div.btn_filter',                // 鐩樺彛鏍囩瀹瑰櫒
      ];
      for (const sel of selectors) {
        const els = document.querySelectorAll(sel);
        if (els.length >= 2) return true;
      }
      // 閫氱敤妫€娴嬶細椤甸潰鏂囨湰鏄惁鍖呭惈姣旇禌鐩稿叧鍐呭
      const bodyText = document.body?.textContent || '';
      const hasInPlay = /\bIn.?Play\b|\b婊氱悆\b/i.test(bodyText);
      const hasTeamNames = /[A-Z][a-z]+[\s-]+(?:FC|United|City|AC|Real|Inter|vs|VS|v\b)/i.test(bodyText);
      return hasInPlay || hasTeamNames;
    }, { timeout: 8000 });
    contentLoaded = true;
    console.log("[cornerCrawler] In-Play content detected");
  } catch (e) {
    console.log("[cornerCrawler] In-Play detection timeout: " + e.message);
    // 涓嶈繑鍥?false 鈥?ensureLogin 宸插皢椤甸潰瀵艰埅鍒?In-Play锛岄€夋嫨鍣ㄥ彲鑳戒笉鍖归厤
    // 缁х画鎵ц Soccer 鈫?CORNERS 瀵艰埅
  }

  // 杈撳嚭椤甸潰鐘舵€佽瘖鏂?
  try {
    const pageDiag = await page.evaluate(() => ({
      url: window.location.href,
      bodyTextPreview: (document.body?.textContent || '').replace(/\s+/g, ' ').substring(0, 150),
      teamElCount: document.querySelectorAll('div[class*="team"]').length,
      betBoxCount: document.querySelectorAll('div.bet_box').length,
      boxLebetCount: document.querySelectorAll('div.box_lebet').length,
      btnFilterCount: document.querySelectorAll('div.btn_filter').length,
      gameElCount: document.querySelectorAll('[class*="game"]').length,
      inplayElCount: document.querySelectorAll('[class*="inplay"]').length,
    }));
    console.log("[cornerCrawler] Page state: " + JSON.stringify(pageDiag));
  } catch (e) {}

  await new Promise(r => setTimeout(r, 2000));
  await handlePopups(page);

  // === 1.5: 鐐瑰嚮 Soccer 鏍囩锛堝繀椤诲厛鍒囧埌 Soccer 瑙嗗浘锛孋ORNERS 鎵嶆湁鏁版嵁锛?===
  console.log("[cornerCrawler] Step 1.5: Clicking Soccer tab...");
  const soccerNames = ["Soccer", "FOOTBALL", "Football", "瓒崇悆"];
  let soccerClicked = false;
  for (const name of soccerNames) {
    soccerClicked = await clickTab(page, name, 1500);
    if (soccerClicked) {
      console.log("[cornerCrawler] Soccer tab clicked: " + name);
      await new Promise(r => setTimeout(r, 2000));
      break;
    }
  }
  if (!soccerClicked) {
    try {
      soccerClicked = await page.evaluate(() => {
        const keywords = ["soccer", "football", "瓒崇悆"];
        const els = document.querySelectorAll("div, span, a, li, button, [id*='tab'], [class*='tab']");
        for (const el of els) {
          const text = (el.textContent || "").trim().toLowerCase();
          const rect = el.getBoundingClientRect();
          if (rect.width < 30 || rect.height < 10) continue;
          for (const kw of keywords) {
            if (text.includes(kw)) { el.scrollIntoView({block:"center"}); el.click(); return true; }
          }
        }
        return false;
      });
    } catch (e) {}
    if (soccerClicked) {
      await new Promise(r => setTimeout(r, 3000));
      console.log("[cornerCrawler] Soccer tab clicked via fallback search");
    } else {
      console.log("[cornerCrawler] 鈿?Soccer tab not found, CORNERS data may be empty");
    }
  }
  await handlePopups(page);

  // 鎹曡幏姣旇禌姣斿垎锛堝湪 CORNERS 鍒囨崲涔嬪墠锛孲occer 椤甸潰鏄剧ず鐪熷疄姣旇禌姣斿垎锛?
  console.log("[cornerCrawler] Capturing match scores from Soccer view...");
  let matchScores = {};
  try {
    matchScores = await page.evaluate(() => {
      const scores = {};
      const containers = document.querySelectorAll('div.box_lebet[class*="bet_type_"]');
      for (const box of containers) {
        const htEl = box.querySelector('div.box_team.teamH span.text_team, [class*="team_h"] span');
        const atEl = box.querySelector('div.box_team.teamC span.text_team, [class*="team_c"] span');
        if (!htEl || !atEl) continue;
        const homeTeam = (htEl.textContent || '').trim();
        const awayTeam = (atEl.textContent || '').trim();
        if (!homeTeam || !awayTeam) continue;
        const scoreEls = box.querySelectorAll('div.box_score span.text_point');
        const homeScore = scoreEls.length >= 2 ? parseInt((scoreEls[0].textContent || '0').trim(), 10) || 0 : 0;
        const awayScore = scoreEls.length >= 2 ? parseInt((scoreEls[1].textContent || '0').trim(), 10) || 0 : 0;
        const key = (homeTeam + '|' + awayTeam).toLowerCase();
        scores[key] = { homeScore, awayScore };
      }
      return scores;
    });
    console.log("[cornerCrawler] Captured scores for " + Object.keys(matchScores).length + " teams");
  } catch (e) {
    console.log("[cornerCrawler] Score capture failed:", e.message);
    matchScores = {};
  }

  // 2. Click 瑙掔悆 tab
  console.log("[cornerCrawler] Step 2: Click 瑙掔悆 tab...");
  let clicked = false;
  try {
    clicked = await page.evaluate(() => {
      const tab = document.getElementById('tab_cn');
      if (tab) { tab.scrollIntoView({block:'center'}); tab.click(); return true; }
      return false;
    });
    if (clicked) {
      console.log("[cornerCrawler] 瑙掔悆 tab clicked via id");
      await new Promise(r => setTimeout(r, 2000));
    }
  } catch (e) {
    console.log("[cornerCrawler] Direct id click failed: " + e.message);
  }

  if (!clicked) {
    clicked = await clickTab(page, "瑙掔悆", 2000);
    if (!clicked) clicked = await clickTab(page, "CORNERS", 2000);
  }

  if (!clicked) {
    try {
      const allTabs = await page.evaluate(() =>
        Array.from(document.querySelectorAll('div.btn_filter, div[id*="tab"], div[class*="tab"]')).map(t => ({id: t.id, text: (t.textContent || "").trim()}))
      );
      console.log("[cornerCrawler] Available tabs: " + JSON.stringify(allTabs));
    } catch(e) {}
    console.warn("[cornerCrawler] 瑙掔悆 tab not found, using current page");
  }

  // 3. 纭瑙掔悆 tab 鏄惁宸叉縺娲?
  console.log("[cornerCrawler] Step 3: Confirming corner tab activation...");
  const cornerTabActive = await page.evaluate(() => {
    const cnTab = document.getElementById('tab_cn');
    if (!cnTab) return false;
    const isActive = cnTab.classList.contains('active') || cnTab.classList.contains('on') || cnTab.classList.contains('selected');
    const hasCornerOdds = document.querySelectorAll('div.box_lebet_odd').length > 0;
    return isActive || hasCornerOdds;
  });
  if (!cornerTabActive) {
    console.warn("[cornerCrawler] 瑙掔悆 tab 鍙兘鏈垚鍔熸縺娲伙紝灏濊瘯寮哄埗鍒锋柊...");
    try {
      await clickTab(page, "Soccer", 2000);
      await new Promise(r => setTimeout(r, 1500));
      await page.evaluate(() => {
        const tab = document.getElementById('tab_cn');
        if (tab) { tab.scrollIntoView({block:'center'}); tab.click(); }
      });
      await new Promise(r => setTimeout(r, 3000));
    } catch(e) {}
  }

  // 4. Wait for corner market data to render (smart wait for actual odds values)
  if (clicked) {
    console.log("[cornerCrawler] Step 4: Waiting for corner markets (smart wait)...");
    let oddsReady = false;
    try {
      oddsReady = await page.waitForFunction(() => {
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
      }, { timeout: 15000 });
      console.log("[cornerCrawler] Corner markets loaded " + (oddsReady ? "(smart wait)" : "(timeout)"));
    } catch (e) {
      console.log("[cornerCrawler] Corner markets wait timeout: " + e.message);
    }
    if (!oddsReady) await new Promise(r => setTimeout(r, 3000));
  }

  await handlePopups(page);

  try {
    await page.screenshot({ path: "debug/corner-step2-corners.png", fullPage: false });
  } catch(e) {}

  console.log("[cornerCrawler] Content source: " + contentSource);
  return { success: contentLoaded, source: contentSource, matchScores };
}

// ======================== DOM 瑙ｆ瀽瑙掔悆鐩樺彛 ========================
async function parseCornerMarkets(page, matchScores = {}) {
  console.log("[cornerCrawler] ===== DOM Parsing Corner Markets =====");

  try {
    // ---- Phase 1: Diagnostic snapshot ----
    const diag = await page.evaluate(() => {
      const info = { containerSelectors: {}, relevantClasses: [], sampleOuterHTML: "" };

      // 娴嬭瘯澶氱瀹瑰櫒閫夋嫨鍣?
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

      // 鎻愬彇椤甸潰涓墍鏈変笌鎶曟敞鐩稿叧鐨?class
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

      // ====== 杈呭姪鍑芥暟 ======
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

      // ====== 绛栫暐1: 鎸?div.bet_box 瑙ｆ瀽锛堢敤鎴锋彁渚涚殑鏂扮粨鏋勶級======
      let containers = document.querySelectorAll("div.bet_box");
      if (containers.length > 0) {
        console.log("[DOM] Using div.bet_box containers, found " + containers.length);

        for (const box of containers) {
          try {
            // 浠?bet_box 涓壘鐞冮槦鍚?- 鍚戜笂鏌ユ壘鏈€杩戠殑鑱旇禌鏍囩
            let league = "";
            let prev = box.previousElementSibling;
            while (prev && !league) {
              const leaEl = prev.querySelector("tt#lea_name, .lea_name, [class*='lea']");
              if (leaEl) { league = safeText(leaEl); break; }
              const text = (prev.textContent || "").trim();
              // 濡傛灉鍓嶄竴涓厔寮熷厓绱犳槸鐭枃鏈紙鑱旇禌鍚嶏級锛屽垯浣跨敤瀹?
              if (text && text.length < 40 && !text.includes("\n") && !text.match(/^\d/)) {
                league = text;
                break;
              }
              prev = prev.previousElementSibling;
            }

            // 鑾峰彇鐞冮槦鍚?- bet_box 鍐呯殑 team div
            const homeEl = box.querySelector("div.box_team.teamH span.text_team, div.team_home, [class*='team_h']");
            const awayEl = box.querySelector("div.box_team.teamC span.text_team, div.team_away, [class*='team_a']");
            let homeTeam = safeText(homeEl);
            let awayTeam = safeText(awayEl);

            // 濡傛灉 bet_box 鍐呮病鎵惧埌锛屽皾璇曞厔寮熷厓绱?
            if (!homeTeam || !awayTeam) {
              const parentRow = box.closest("[class*='row'], [class*='game'], [class*='match']");
              if (parentRow) {
                homeTeam = safeText(parentRow, "[class*='team_h'] span, .teamH span");
                awayTeam = safeText(parentRow, "[class*='team_c'] span, .teamC span");
              }
            }

            if (!homeTeam || !awayTeam) continue;

            // 姣斿垎鍜屾椂闂?鈥?浼樺厛浣跨敤 Soccer 椤垫崟鑾风殑鐪熷疄姣旇禌姣斿垎
            let homeScore = 0, awayScore = 0;
            let cornerHomeCount = 0, cornerAwayCount = 0;
            let totalCorners = 0;
            let timeStr = "";
            let elapsedMinutes = 0;

            // 浠?Soccer 椤垫崟鑾风殑姣旇禌姣斿垎锛堢湡瀹炴瘮鍒嗭紝闈炶鐞冩瘮鍒嗭級
            if (matchScores && homeTeam && awayTeam) {
              const key = (homeTeam + '|' + awayTeam).toLowerCase();
              const matchInfo = matchScores[key];
              if (matchInfo) {
                homeScore = matchInfo.homeScore || 0;
                awayScore = matchInfo.awayScore || 0;
              }
            }

            // 瑙掔悆姣斿垎锛圕ORNERS 椤甸潰涓婄殑 box_score 鏄鐞冩暟鎹紝瀛樺叆鍗曠嫭瀛楁锛?
            const cornerScoreEls = box.querySelectorAll("div.box_score span.text_point");
            if (cornerScoreEls.length >= 2) {
              const ch = parseInt((cornerScoreEls[0].textContent || "0").trim(), 10);
              const ca = parseInt((cornerScoreEls[1].textContent || "0").trim(), 10);
              if (!isNaN(ch) && !isNaN(ca) && ch >= 0 && ca >= 0) {
                cornerHomeCount = ch;
                cornerAwayCount = ca;
              }
            }

            // 鏃堕棿瑙ｆ瀽
            timeStr = safeText(box, "tt.text_time i, .text_time, [class*='timer'], [class*='minute']");
            if (timeStr) {
              if (timeStr.toUpperCase() === "HT") elapsedMinutes = 45;
              else {
                const parts = timeStr.split(":");
                elapsedMinutes = parts.length === 2 ? parseInt(parts[0], 10) || 0 : parseInt(timeStr, 10) || 0;
              }
            }

            totalCorners = safeInt(box, "span.game_total, [class*='corner'] span, [class*='total']");

            // 鐩樺彛鏁版嵁: 浼樺厛鐢ㄦ爣绛炬枃鏈尮閰嶏紙閬垮厤璧旂巼纭紪鐮佺储寮曞鑷撮敊涔憋級
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
                  let ouLine = safeFloat(betButtons[0], "tt.text_ballhead");
                  if (!ouLine) {
                    // 鍥為€€锛氫粠 block 鏂囨湰涓彁鍙栨暟瀛?
                    const blockText = (block.textContent || "").trim();
                    const numMatch = blockText.match(/(\d+\.?\d*)/);
                    if (numMatch) ouLine = parseFloat(numMatch[1]) || 0;
                  }
                  cornerOU = {
                    line: ouLine || 0,
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

            // 鍏滃簳: 鏍囩鍖归厤澶辫触鏃剁敤纭紪鐮佺储寮曪紙淇濈暀鍏煎鎬э級
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

      // ====== 绛栫暐2: 鎸?div.box_lebet.bet_type_cn 瑙ｆ瀽锛堝師鏈夌粨鏋勶級======
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
                cornerHomeCount, cornerAwayCount,
                cornerOU, cornerHDP, nextCorner, cornerOE
              });
            } catch (e) { /* skip broken match */ }
          }
        }
      }

      // ====== 绛栫暐3: 閫氱敤鍥為€€ - 鎵弿鎵€鏈?box_lebet 鍙樹綋 ======
      if (results.length === 0) {
        containers = document.querySelectorAll("div[class*='box_lebet']");
        if (containers.length > 0) {
          console.log("[DOM] Using generic box_lebet containers, found " + containers.length);
          // 杩囨护鎺夐潪姣旇禌瀹瑰櫒锛堝浠呮湁瀵艰埅鐨勶級
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

              // 鎻愬彇鎵€鏈夎禂鐜囨暟瀛?
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

    // 鍘婚噸锛氭寜 (homeTeam + awayTeam) 鍚堝苟
    const seen = new Set();
    const deduped = [];
    for (const m of rawData) {
      const key = (m.homeTeam + "|||" + m.awayTeam).toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        // 娣诲姞鏁版嵁璐ㄩ噺鏍囪
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


// ======================== XHR 鎷︽埅 ========================
async function setupXHRInterception(page) {
  capturedResponses = [];
  seenRequestUrls.clear();
  page.removeAllListeners("request");
  page.removeAllListeners("response");
  console.log("[cornerCrawler] 璁剧疆缃戠粶鐩戝惉锛堣鍔ㄦā寮忥級...");

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

      // transform.php 澶勭悊 - 鎵╁睍锛氬皾璇曚粠浠绘剰鍝嶅簲鎻愬彇姣旇禌鏁版嵁
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

      // 閫氱敤 JSON 鏁版嵁鎹曡幏
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

// ======================== 鏁版嵁鏄犲皠 ========================
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

// ======================== 骞跺彂閿侊紙鍙橀噺宸茬Щ鑷抽《閮級 ========================


// ======================== 杈呭姪锛氬皢 parseCornerMarkets 杩斿洖鏍煎紡杞负 handicaps 鏁扮粍 ========================
function buildHandicapsArray(m) {
  const result = [];
  let order = 1;
  if (m.cornerOU && (m.cornerOU.overOdds > 0 || m.cornerOU.underOdds > 0)) {
    result.push({
      order: order++, category: "O/U", categoryLabel: "O/U",
      period: "full", line: m.cornerOU.line || 0,
      odds: { over: m.cornerOU.overOdds || 0, under: m.cornerOU.underOdds || 0 },
      source: "dom", marketGroup: "corner"
    });
  }
  if (m.cornerHDP && (m.cornerHDP.homeOdds > 0 || m.cornerHDP.awayOdds > 0)) {
    result.push({
      order: order++, category: "HDP", categoryLabel: "HDP",
      period: "full", line: m.cornerHDP.line || "",
      odds: { home: m.cornerHDP.homeOdds || 0, away: m.cornerHDP.awayOdds || 0 },
      source: "dom", marketGroup: "corner"
    });
  }
  if (m.nextCorner && (m.nextCorner.homeOdds > 0 || m.nextCorner.awayOdds > 0)) {
    // 娓呯悊瑙掔悆缂栧彿鏂囨湰锛氭彁鍙栫函鏁板瓧
    let cornerNum = (m.nextCorner.corner || "").replace(/[^0-9]/g, "");
    if (!cornerNum) cornerNum = "0";
    result.push({
      order: order++, category: "NEXT", categoryLabel: "NEXT CORNER",
      period: "full", line: cornerNum,
      odds: { home: m.nextCorner.homeOdds || 0, away: m.nextCorner.awayOdds || 0 },
      source: "dom", marketGroup: "corner"
    });
  }
  if (m.cornerOE && (m.cornerOE.oddOdds > 0 || m.cornerOE.evenOdds > 0)) {
    result.push({
      order: order++, category: "O/E", categoryLabel: "O/E",
      period: "full", odds: { odd: m.cornerOE.oddOdds || 0, even: m.cornerOE.evenOdds || 0 },
      source: "dom", marketGroup: "corner"
    });
  }
  return result;
}

// ======================== 涓诲嚱鏁帮細鐖彇瑙掔悆姣旇禌鏁版嵁 ========================
export async function crawlCornerMatches() {
  // 骞跺彂淇濇姢锛氬鏋滃凡鏈夌埇鍙栧湪杩涜涓紝鐩存帴杩斿洖
  if (crawlingLock) {
    console.warn("[cornerCrawler] Crawler is busy, rejecting concurrent call");
    return { success: false, data: { matches: [], allText: [], allElements: [] }, count: 0, error: "Crawler busy", busy: true };
  }
  crawlingLock = true;
  console.log("[cornerCrawler] ===== Crawling corner data =====");
  const ts = new Date().toISOString();

  // 瓒呮椂淇濇姢锛?80 绉掞紙3 鍒嗛挓锛夊悗鑷姩閲婃斁閿侊紝闃叉姝婚攣
  const LOCK_TIMEOUT_MS = 180000; // 寤堕暱鍒?3 鍒嗛挓
  const lockTimeout = setTimeout(() => {
    if (crawlingLock) {
      console.warn("[cornerCrawler] Lock timeout reached (180s), force releasing");
      crawlingLock = false;
    }
  }, LOCK_TIMEOUT_MS);

  try {
    // 娓呯┖涓婃鎹曡幏鐨?XHR 鍝嶅簲
    capturedResponses = [];
    seenRequestUrls.clear();

    const page = await ensureLogin();
    if (!page) {
      console.error("[cornerCrawler] Login failed, cannot crawl");
      return { success: false, data: { matches: [], allText: [], allElements: [] }, count: 0, timestamp: ts, error: "Login failed" };
    }

    // 璁剧疆 XHR 鎷︽埅锛堝湪瀵艰埅涔嬪墠锛?
    try {
      await setupXHRInterception(page);
    } catch (e) {
      console.warn("[cornerCrawler] XHR interception setup failed:", e.message);
    }

    // 瀵艰埅鍒拌鐞冮〉闈紙鍙嶇埇闅忔満寤惰繜锛?
    await randomDelay(1000, 3000);
    const navResult = await navigateToCorners(page);
    const dataSource = navResult?.source || "unknown";
    const matchScores = navResult?.matchScores || {};
    console.log("[cornerCrawler] Navigation result: source=" + dataSource + " scores=" + Object.keys(matchScores).length);
    await randomDelay(1000, 3000);

    // 绛夊緟鏁版嵁鍔犺浇
    console.log("[cornerCrawler] Waiting for market data...");
    await new Promise(r => setTimeout(r, 3000));

    // 婊氬姩瑙﹀彂鎳掑姞杞?
    try {
      await page.evaluate(() => {
        window.scrollTo(0, document.body.scrollHeight);
        setTimeout(() => window.scrollTo(0, 0), 500);
      });
    } catch(e) {}
    await new Promise(r => setTimeout(r, 2000));

    // 瑙ｆ瀽 DOM 鑾峰彇瑙掔悆鐩樺彛锛堜娇鐢ㄤ笓鐢?parseCornerMarkets 鏇夸唬閫氱敤 parseAllMarkets锛?
    const domData = await parseCornerMarkets(page, matchScores);
    console.log("[cornerCrawler] DOM corner markets: " + domData.length);

    // 灏濊瘯浠?XHR 鎹曡幏涓彁鍙栨瘮璧涘垪琛?
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

    // 鏄犲皠 DOM 鏁版嵁鍒版爣鍑嗘牸寮忥紙parseCornerMarkets 杩斿洖 cornerOU/cornerHDP/nextCorner/cornerOE 鏍煎紡锛?
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

    // 濡傛灉 DOM 鏈?XHR 鐨勯槦浼嶈ˉ鍏呬俊鎭紝鍚堝苟锛堟寜鐞冮槦鍚嶅尮閰嶏級
    if (xhrMatches.length > 0 && matches.length > 0) {
      const xhrByName = {};
      for (const xm of xhrMatches) {
        const key = (xm.homeTeam + "_" + xm.awayTeam).toLowerCase().replace(/[^a-z0-9]/g, "_");
        xhrByName[key] = xm;
      }
      for (const m of matches) {
        const key = (m.homeTeam + "_" + m.awayTeam).toLowerCase().replace(/[^a-z0-9]/g, "_");
        if (xhrByName[key]) {
          // XHR 鏁版嵁涓幏鍙栧疄闄呰鐞冩暟锛堣鐩?DOM 鍥為€€鍊硷級
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

    // 淇濆瓨璋冭瘯鎴浘
    try {
      await page.screenshot({ path: "debug/corner-final.png", fullPage: false });
    } catch(e) {}

    // Add data source info to each match
    for (const m of matches) {
      m._dataSource = dataSource;
    }

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

// ======================== 鍚堝苟 XHR + DOM 鏁版嵁 ========================
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

// ======================== 杞鏀寔 ========================
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

// ======================== 鍏ㄥ眬杞 ========================
export function startCornerPolling(onUpdate) {
  if (pollingActive) {
    console.log("[cornerCrawler] 杞宸插湪杩愯涓?);
    return { success: true, message: "already polling" };
  }
  console.log("[cornerCrawler] 鍚姩鍏ㄥ眬杞...");
  pollingActive = true;
  pollingStopFn = null;

  const poll = async () => {
    if (!pollingActive) return;
    try {
      const result = await crawlCornerMatches();
      const matches = result.success ? (result.data?.matches || []) : [];
      if (pollingActive && onUpdate) onUpdate(matches);
    } catch (e) {
      console.error("[cornerCrawler] 杞閿欒:", e.message);
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
  console.log("[cornerCrawler] 鍋滄鍏ㄥ眬杞...");
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

// ======================== 鐧诲綍 API ========================
export async function loginToHG(username, password) {
  console.log("[cornerCrawler] 璁剧疆鐧诲綍鍑嵁...");
  runtimeCredentials = { username, password };
  const MAX_RETRIES = 3;
  let lastError = null;
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const page = await ensureLogin();
      if (page) {
        return { success: true, message: "鐧诲綍鎴愬姛", balance: getBalance(), attempts: attempt };
      }
      lastError = "鐧诲綍杩斿洖绌洪〉闈?;
    } catch (err) {
      lastError = err.message;
      console.warn("[cornerCrawler] 鐧诲綍灏濊瘯 " + attempt + "/" + MAX_RETRIES + " 澶辫触: " + lastError);
    }
    if (attempt < MAX_RETRIES) {
      await new Promise(r => setTimeout(r, attempt * 2000));
    }
  }
  return { success: false, message: "鐧诲綍澶辫触锛堝凡閲嶈瘯" + MAX_RETRIES + "娆★級: " + lastError, balance: getBalance() };
}

// ======================== 鍏抽棴 ========================
export { getBalance } from "./browserPool.js";

export async function closeCrawler() {
  stopCornerPolling();
  capturedResponses = [];
  return await closeSharedBrowser();
}

// ======================== 璋冭瘯 ========================
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

// ======================== 璇婃柇 ========================
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

    // XHR 鏁版嵁
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

    // 椤甸潰缁撴瀯蹇収锛堣瘖鏂敤锛?    try {
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

    // DOM 瑙掔悆鐩樺彛
    const domData = await parseAllMarkets(page);
    report.domCornerCount = domData.length;
    report.domCornerSample = domData.slice(0, 5);

    // XHR 姣旇禌鍒楄〃
    const bestResponse = pickBestResponse(capturedResponses);
    if (bestResponse && bestResponse.matchList.length > 0) {
      const matches = bestResponse.matchList
        .map(mapToCornerMatch)
        .filter(m => m.homeTeam && m.awayTeam);
      // 鍚堝苟 DOM 鐩樺彛
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
