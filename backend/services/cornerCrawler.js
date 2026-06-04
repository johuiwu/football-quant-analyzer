import puppeteer from "puppeteer-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";
import fs from "fs";
import {
  getSharedBrowser, getSharedPage, setSharedPage,
  getLoginCookies, setLoginCookies,
  getBalance, setBalance, isLoggedIn, isBrowserActive,
  closeSharedBrowser, HG_URL,
  saveCookiesToDisk, loadCookiesFromDisk
} from "./browserPool.js";
import { parseAllMarkets, handlePopups, clickTab, parseAsianHandicap, randomDelay } from "./crawlerShared.js";

puppeteer.use(StealthPlugin());

// ======================== 配置 ========================
const HG_USERNAME = process.env.HG_USERNAME || "";
const HG_PASSWORD = process.env.HG_PASSWORD || "";
if (!process.env.HG_USERNAME || !process.env.HG_PASSWORD) {
  console.warn("[cornerCrawler] 环境变量 HG_USERNAME / HG_PASSWORD 未设置，将使用运行时凭据");
}
const POLL_INTERVAL = parseInt(process.env.CRAWLER_POLL_INTERVAL || "5000", 10);

// 运行时凭据
let runtimeCredentials = null;
let loginInProgress = false;
let crawlingLock = false;
let pollingActive = false;
let pollingStopFn = null;

// XHR 拦截缓存
let capturedResponses = [];
const seenRequestUrls = new Set();

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
async function ensureLogin() {
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

  // ★ Cookie 快速登录：尝试从磁盘恢复会话
  const savedCookies = loadCookiesFromDisk();
  if (savedCookies && savedCookies.length > 0) {
    try {
      console.log("[cornerCrawler] 尝试 Cookie 快速登录...");
      const quickPage = await bi.newPage();
      await quickPage.setUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36");
      await quickPage.setViewport({ width: 1920, height: 1400 });
      for (const ck of savedCookies) {
        try { await quickPage.setCookie(ck); } catch (_) {}
      }
      await quickPage.goto(HG_URL, { waitUntil: "domcontentloaded", timeout: 10000 });
      await new Promise(r => setTimeout(r, 2000));
      const isValid = await quickPage.evaluate(() => {
        const body = document.body?.textContent || "";
        const hasInPlay = body.includes("In-Play") && body.includes("Soccer");
        const sportBtn = document.getElementById("symbol_ft");
        const hasSport = sportBtn && sportBtn.offsetParent !== null;
        return hasInPlay || hasSport;
      });
      if (isValid) {
        setSharedPage(quickPage);
        console.log("[cornerCrawler] Cookie 快速登录成功: " + (Date.now() - _loginStart) + "ms");
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
    await page.setUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36");
    await page.setViewport({ width: 1920, height: 1400 });
    await page.goto(HG_URL, { waitUntil: "domcontentloaded", timeout: 12000 });
    await new Promise(r => setTimeout(r, 2000));
    setSharedPage(page);
    console.log("[cornerCrawler] 新页面创建完成");
    return page;
    } finally {
      loginInProgress = false;
    }
  }

  loginInProgress = true;
  try {
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

  await page.goto(HG_URL, { waitUntil: "domcontentloaded", timeout: 12000 });
  await new Promise(r => setTimeout(r, 2000));
  
  // 保存初始页面截图
const username = (runtimeCredentials && runtimeCredentials.username) || HG_USERNAME;
  const password = (runtimeCredentials && runtimeCredentials.password) || HG_PASSWORD;
  
  // 登录表单元素诊断已移除（生产环境优化）

  // 更智能的选择器策略
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
    "input#btn_login",
    '[value="\u767b\u5165"]'
  ];

  // 填入用户名
  let usernameFilled = false;
  for (const selector of usernameSelectors) {
    try {
      const el = await page.$(selector);
      if (el) {
        console.log("[cornerCrawler] 使用用户名选择器成功:", selector);
        await el.click({ clickCount: 3 });
        await el.type(username, { delay: 30 });
        usernameFilled = true;
        break;
      }
    } catch(e) {}
  }
  
  // 备选方案：直接找所有可见的 text 输入框
  if (!usernameFilled) {
    console.log("[cornerCrawler] 使用备选策略：查找所有文本输入框...");
    const allInputs = await page.$$('input[type="text"], input:not([type])');
    for (const el of allInputs) {
      try {
        const isVisible = await page.evaluate(e => {
          const rect = e.getBoundingClientRect();
          return rect.width > 0 && rect.height > 0;
        }, el);
        if (isVisible) {
          await el.click({ clickCount: 3 });
          await el.type(username, { delay: 30 });
          usernameFilled = true;
          break;
        }
      } catch(e) {}
    }
  }

  // 填入密码
  let passwordFilled = false;
  for (const selector of passwordSelectors) {
    try {
      const el = await page.$(selector);
      if (el) {
        console.log("[cornerCrawler] 使用密码选择器成功:", selector);
        await el.click({ clickCount: 3 });
        await el.type(password, { delay: 30 });
        passwordFilled = true;
        break;
      }
    } catch(e) {}
  }

  if (!passwordFilled) {
    console.log("[cornerCrawler] 使用备选策略：查找所有密码输入框...");
    const allPwds = await page.$$('input[type="password"]');
    if (allPwds.length > 0) {
      await allPwds[0].click({ clickCount: 3 });
      await allPwds[0].type(password, { delay: 30 });
      passwordFilled = true;
    }
  }

  // 保存填写后的截图
// 勾选「记住我」延长 Cookie 有效期
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

  // 点击登录按钮（等待 HG 网站登录重定向完成）
  await new Promise(r => setTimeout(r, 500));
  let loginSuccess = false;
  for (const selector of loginButtonSelectors) {
    try {
      const el = await page.$(selector);
      if (el) {
        console.log("[cornerCrawler] 使用登录按钮选择器:", selector);
        // ★ 同时点击登录按钮 + 等待 HG 网站重定向完成
        await Promise.all([
          el.click({ delay: 100 }),
          page.waitForNavigation({ waitUntil: "domcontentloaded", timeout: 12000 })
        ]);
        loginSuccess = true;
        break;
      }
    } catch(e) {
      // waitForNavigation 超时或失败，继续尝试下一个选择器
      console.log("[cornerCrawler] waitForNavigation failed, trying next selector: " + e.message);
    }
  }

  if (!loginSuccess) {
    // 回退：无 waitForNavigation 的点击
    console.log("[cornerCrawler] waitForNavigation 路径失败，回退到普通点击...");
    for (const selector of loginButtonSelectors) {
      try {
        const el = await page.$(selector);
        if (el) {
          await el.click({ delay: 150 });
          loginSuccess = true;
          console.log("[cornerCrawler] 普通点击成功:", selector);
          break;
        }
      } catch(e) {}
    }
    if (!loginSuccess) {
      const allButtons = await page.$$('button, [role="button"], [onclick]');
      for (const btn of allButtons) {
        try {
          const text = await page.evaluate(el => (el.textContent || '').toLowerCase(), btn);
          if (text.includes('login') || text.includes('登入')) {
            await btn.click({ delay: 150 });
            loginSuccess = true;
            break;
          }
        } catch(e) {}
      }
    }
  }

  // ★ 导航已完成，直接检测登录结果（不再轮询）
  await new Promise(r => setTimeout(r, 1500));
  await handlePopups(page);

  const status = await page.evaluate(() => {
    const body = document.body;
    const bodyText = body ? body.textContent || "" : "";
    const accShow = document.getElementById("acc_show");
    const loginHidden = !accShow || accShow.style.display === "none" || accShow.offsetParent === null;
    const errEl = document.getElementById("text_error");
    const hasError = errEl && errEl.style.display !== "none" && errEl.textContent.trim().length > 0;
    return {
      hasInPlay: bodyText.includes("In-Play"),
      loginHidden, hasError,
      hasSportSelector: !!(document.getElementById("symbol_ft")?.offsetParent),
      hasGameLive: !!(document.getElementById("old_game_live")?.offsetParent),
      currentUrl: window.location.href,
      bodyTextSample: bodyText.substring(0, 200)
    };
  });

  if (status.hasError) {
    console.error("[cornerCrawler] 登录失败: " + (await page.evaluate(() => document.getElementById("text_error")?.textContent || "未知错误")));
    return null;
  }

  if (status.loginHidden || status.hasSportSelector || status.hasGameLive) {
    console.log("[cornerCrawler] [耗时] 登录+导航完成: " + (Date.now() - _loginStart) + "ms");
    console.log("[cornerCrawler] ✅ 登录成功！当前页面:", status.currentUrl);
  } else if (status.hasInPlay) {
    console.log("[cornerCrawler] [耗时] 登录完成(In-Play): " + (Date.now() - _loginStart) + "ms");
    console.log("[cornerCrawler] ✅ 登录成功（In-Play内容检测）");
  } else {
    console.error("[cornerCrawler] 登录后页面异常:", status.bodyTextSample);
    return null;
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
  return page;
} finally {
  loginInProgress = false;
}
}

// ======================== 导航到角球页面 ========================
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

  // 0. 检查是否已在 CORNERS tab（In-Play 而非 Today）
  const alreadyOnCorners = await page.evaluate(() => {
    const cnTab = document.getElementById('tab_cn');
    if (!cnTab || !(cnTab.classList.contains('on') || cnTab.classList.contains('active'))) return false;
    if (document.querySelectorAll('div.box_lebet_odd').length === 0) return false;

    // 排除 Today/今日视图：避免将赛程数据当作实时数据
    const activeTabs = document.querySelectorAll('.btn_filter.on, .btn_filter.active, [class*="today"], [class*="filter"]');
    for (const tab of activeTabs) {
      const text = (tab.textContent || '').toLowerCase().trim();
      if (text === 'today' || text === '今日') return false;
    }
    // 检查 URL
    const url = window.location.href.toLowerCase();
    if (url.includes('today') && !url.includes('inplay') && !url.includes('in-play')) return false;

    return true;
  });
  if (alreadyOnCorners) {
    console.log("[cornerCrawler] CORNERS tab already active on In-Play, skipping navigation");
    await new Promise(r => setTimeout(r, 2000));
    await handlePopups(page);
    return { success: true, source: "corner-inplay-active", matchScores: {} };
  }

  // 0.5: 检查是否在 In-Play（而非 Today）
  const isInPlay = await page.evaluate(() => {
    const url = window.location.href.toLowerCase();
    if (url.includes('inplay') || url.includes('in-play')) return true;
    const activeFilters = document.querySelectorAll('.btn_filter.on, .btn_filter.active');
    return Array.from(activeFilters).some(el => {
      const text = (el.textContent || '').toLowerCase();
      return text.includes('inplay') || text.includes('in-play') || text.includes('In-Play');
    });
  });

  if (!isInPlay) {
    console.log("[cornerCrawler] Not on In-Play view, switching from Today...");
    const inplayNames = ["滚球"];
    for (const name of inplayNames) {
      if (await clickTab(page, name, 1500)) {
        console.log("[cornerCrawler] Switched to In-Play: " + name);
        await new Promise(r => setTimeout(r, 3000));
        await handlePopups(page);
        break;
      }
    }
  }

  // 1. Detect In-Play page content - 多选择器回退精简版
  console.log("[cornerCrawler] Step 1: Detecting In-Play page content...");
  let contentLoaded = false;
  contentSource = "inplay";

  // 等待页面渲染（使用多种选择器回退，网站结构可能已变化）
  try {
    await page.waitForFunction(() => {
      const selectors = [
        'div[class*="team"]',            // 鐞冮槦鐩稿叧瀹瑰櫒
        'div.bet_box',                   // 鎶曟敞瀹瑰櫒锛堟柊缁撴瀯锛?
        'div.box_lebet[class*="bet_type_"]', // 鏃х粨鏋?
        'div[class*="inplay"]',          // In-Play 相关元素
        '[class*="box_score"]',          // 姣斿垎瀹瑰櫒
        'div[class*="game"]',            // 姣旇禌瀹瑰櫒
        'div.btn_filter',                // 鐩樺彛鏍囩瀹瑰櫒
      ];
      for (const sel of selectors) {
        const els = document.querySelectorAll(sel);
        if (els.length >= 2) return true;
      }
      // 通用检测：页面文本是否包含比赛相关内容
      const bodyText = document.body?.textContent || '';
      const hasInPlay = /\bIn.?Play\b/i.test(bodyText);
      const hasTeamNames = /[A-Z][a-z]+[\s-]+(?:FC|United|City|AC|Real|Inter|vs|VS|v\b)/i.test(bodyText);
      return hasInPlay || hasTeamNames;
    }, { timeout: 8000 });
    contentLoaded = true;
    console.log("[cornerCrawler] In-Play content detected");
  } catch (e) {
    console.log("[cornerCrawler] In-Play detection timeout: " + e.message);
    // 不返回 false — ensureLogin 已将页面导航到 In-Play，选择器可能不匹配
    // 继续执行 Soccer → CORNERS 导航
  }

  // 输出页面状态诊断
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

  // === 1.5: 点击 Soccer/足球 标签（桌面版 #symbol_ft） ===
  console.log("[cornerCrawler] Step 1.5: Clicking Soccer tab via #symbol_ft...");
  let soccerClicked = await page.evaluate(() => {
    const btn = document.getElementById('symbol_ft');
    if (!btn) return false;
    if (btn.classList.contains('on')) return true; // 已激活
    btn.scrollIntoView({block:'center'});
    btn.click();
    return true;
  });
  if (soccerClicked) {
    console.log("[cornerCrawler] Soccer tab OK via #symbol_ft");
    await new Promise(r => setTimeout(r, 3000));
  } else {
    console.log("[cornerCrawler] #symbol_ft 未找到，CORENRS 数据可能为空");
  }
  await handlePopups(page);

  // 捕获比赛比分（在 CORNERS 切换之前，Soccer 页面显示真实比赛比分）
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

  // 捕获 Soccer 页面的让球(HDP)和大小(O/U)盘口
  console.log("[cornerCrawler] Capturing Soccer page markets (HDP + O/U)...");
  console.log("[cornerCrawler] Capturing main markets from Soccer view...");
  let soccerMarkets = {};
  try {
    // ★ 先等待 hdpou_ft 盘口异步加载（最多 8s，至少 5 场比赛有数据）
    const waitStart = Date.now();
    await page.waitForFunction(() => {
      const containers = document.querySelectorAll('div.box_lebet[class*="bet_type_"]');
      let withHdpou = 0;
      for (const box of containers) {
        if (box.querySelectorAll('div.form_lebet_hdpou.hdpou_ft').length > 0) withHdpou++;
      }
      return withHdpou >= 5;
    }, { timeout: 8000 }).catch(() => console.log("[cornerCrawler] hdpou_ft wait timeout after " + (Date.now() - waitStart) + "ms, proceeding anyway"));
    const hdpouWaitTime = Date.now() - waitStart;
    console.log("[cornerCrawler] hdpou_ft wait done: " + hdpouWaitTime + "ms");

    // ★ 等待完成后检测是否有比赛数据
    const soccerHasMatches = await page.evaluate(() => {
      return document.querySelectorAll('div.box_lebet[class*="bet_type_"]').length > 0;
    });
    if (!soccerHasMatches) {
      console.log("[cornerCrawler] Soccer 视图无比赛容器，今日无足球赛事");
      return { success: false, source: "no-soccer", matchScores, soccerMarkets: {}, noSoccer: true };
    }

    // 将 matchScores 传入 page.evaluate 以便合并比分
    soccerMarkets = await page.evaluate((scores) => {
      const markets = {};
      let totalContainers = 0, withHdpouCount = 0, withHeadCount = 0, matchedCount = 0;
      const containers = document.querySelectorAll('div.box_lebet[class*="bet_type_"]');
      totalContainers = containers.length;

      // 联赛名缓存：从页面顶部#lea_name 获取
      let currentLeague = '';
      const leaNameEl = document.getElementById('lea_name');
      if (leaNameEl) currentLeague = (leaNameEl.textContent || '').trim();

      for (const box of containers) {
        // 尝试匹配更近的联赛标签
        let league = currentLeague;
        let prev = box.previousElementSibling;
        while (prev) {
          const lea = prev.querySelector('#lea_name, tt[id="lea_name"], [id="lea_name"]');
          if (lea) { league = (lea.textContent || '').trim(); break; }
          prev = prev.previousElementSibling;
        }

        const htEl = box.querySelector('div.box_team.teamH span.text_team');
        const atEl = box.querySelector('div.box_team.teamC span.text_team');
        if (!htEl || !atEl) continue;
        const homeTeam = (htEl.textContent || '').trim();
        const awayTeam = (atEl.textContent || '').trim();
        if (!homeTeam || !awayTeam) continue;
        const key = (homeTeam + '|' + awayTeam).toLowerCase();

        // 提取比赛时间
        let time = '';
        const timeEl = box.querySelector('tt.text_time, [class*="text_time"]');
        if (timeEl) {
          time = (timeEl.textContent || '').replace(/\s+/g, ' ').trim();
        }

        // 合并比分
        const scoreData = scores[key] || {};
        const homeScore = typeof scoreData.homeScore === 'number' ? scoreData.homeScore : -1;
        const awayScore = typeof scoreData.awayScore === 'number' ? scoreData.awayScore : -1;

        const entry = { league, time, homeScore: homeScore >= 0 ? homeScore : null, awayScore: awayScore >= 0 ? awayScore : null, hdp: null, ou: null };
        const hdpouSections = box.querySelectorAll('div.form_lebet_hdpou.hdpou_ft');
        if (hdpouSections.length > 0) withHdpouCount++;
        for (const section of hdpouSections) {
          const headSpan = section.querySelector('div.head_lebet span');
          if (!headSpan) continue;
          withHeadCount++;
          const marketLabel = (headSpan.textContent || '').trim();
          const firstRow = section.querySelector('div.col_hdpou:first-child');
          if (!firstRow) continue;
          const buttons = firstRow.querySelectorAll('div.btn_hdpou_odd');
          if (buttons.length < 2) continue;
          const homeLine = (buttons[0].querySelector('tt.text_ballhead')?.textContent || '').trim();
          const homeOdds = parseFloat(buttons[0].querySelector('span.text_odds')?.textContent || '0') || 0;
          const awayLine = (buttons[1].querySelector('tt.text_ballhead')?.textContent || '').trim();
          const awayOdds = parseFloat(buttons[1].querySelector('span.text_odds')?.textContent || '0') || 0;
          if (marketLabel === '让球') {
            entry.hdp = { line: homeLine, homeOdds, awayOdds };
          } else if (marketLabel === '得分大小') {
            entry.ou = { line: parseFloat(homeLine) || 0, overOdds: homeOdds, underOdds: awayOdds };
          }
        }
        if (entry.hdp || entry.ou) {
          matchedCount++;
          markets[key] = entry;
        }
      }
      markets['__diag__'] = { totalContainers, withHdpouCount, withHeadCount, matchedCount, league: currentLeague };
      return markets;
    }, matchScores);

    // 提取诊断信息并打日志
    const diag = soccerMarkets['__diag__'] || {};
    delete soccerMarkets['__diag__'];
    console.log("[cornerCrawler] Captured main markets for " + Object.keys(soccerMarkets).length + " matches (containers=" + diag.totalContainers + " hdpou=" + diag.withHdpouCount + " head=" + diag.withHeadCount + " matched=" + diag.matchedCount + " league=" + (diag.league || '(none)') + ")");
  } catch (e) {
    console.log("[cornerCrawler] Main markets capture failed:", e.message);
    soccerMarkets = {};
  }


  console.log("[cornerCrawler] Step 2: 点击角球 tab...");
  let clicked = false;
  try {
    clicked = await page.evaluate(() => {
      const tab = document.getElementById('tab_cn');
      if (tab) { tab.scrollIntoView({block:'center'}); tab.click(); return true; }
      return false;
    });
    if (clicked) {
      console.log("[cornerCrawler] 角球 tab clicked via id");
      await new Promise(r => setTimeout(r, 2000));
    }
  } catch (e) {
    console.log("[cornerCrawler] Direct id click failed: " + e.message);
  }

  if (!clicked) {
    clicked = await clickTab(page, "角球", 2000);
    if (!clicked) clicked = await clickTab(page, "角球", 2000);
  }

  if (!clicked) {
    try {
      const allTabs = await page.evaluate(() =>
        Array.from(document.querySelectorAll('div.btn_filter, div[id*="tab"], div[class*="tab"]')).map(t => ({id: t.id, text: (t.textContent || "").trim()}))
      );
      console.log("[cornerCrawler] Available tabs: " + JSON.stringify(allTabs));
    } catch(e) {}
    console.warn("[cornerCrawler] 角球 tab not found, using current page");
  }

  // 3. 确认角球 tab 是否已激活
  console.log("[cornerCrawler] Step 3: Confirming corner tab activation...");
  const cornerTabActive = await page.evaluate(() => {
    const cnTab = document.getElementById('tab_cn');
    if (!cnTab) return false;
    const isActive = cnTab.classList.contains('active') || cnTab.classList.contains('on') || cnTab.classList.contains('selected');
    const hasCornerOdds = document.querySelectorAll('div.box_lebet_odd').length > 0;
    return isActive || hasCornerOdds;
  });
  if (!cornerTabActive) {
    console.warn("[cornerCrawler] 角球 tab 可能未成功激活，尝试强制刷新...");
    try {
      await clickTab(page, "足球", 2000);
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
      }, { timeout: 10000 });
      console.log("[cornerCrawler] Corner markets loaded " + (oddsReady ? "(smart wait)" : "(timeout)"));
    } catch (e) {
      console.log("[cornerCrawler] Corner markets wait timeout: " + e.message);
    }
    if (!oddsReady) await new Promise(r => setTimeout(r, 3000));
  }

  await handlePopups(page);
console.log("[cornerCrawler] Content source: " + contentSource);
  return { success: contentLoaded, source: contentSource, matchScores, soccerMarkets, noSoccer: false };
}

// ======================== DOM 解析角球盘口 ========================
async function parseCornerMarkets(page, matchScores = {}) {
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
                const betButtons = block.querySelectorAll("div.btn_lebet_odd:not(.lock)");
                if (betButtons.length === 0) continue;

                if (marketType === "O/U" && betButtons.length >= 2) {
                  let ouLine = safeFloat(betButtons[0], "tt.text_ballhead");
                  if (!ouLine) {
                    // 回退：从 block 文本中提取数字
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
                } else if (marketType === "NEXT_CORNER" && betButtons.length >= 2) {
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
    // 清理角球编号文本：提取纯数字
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
    await randomDelay(1000, 3000);

    // 等待数据加载
    console.log("[cornerCrawler] Waiting for market data...");
    await new Promise(r => setTimeout(r, 3000));

    // 滚动触发懒加载
    try {
      await page.evaluate(() => {
        window.scrollTo(0, document.body.scrollHeight);
        setTimeout(() => window.scrollTo(0, 0), 500);
      });
    } catch(e) {}
    await new Promise(r => setTimeout(r, 2000));

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
      console.warn("[cornerCrawler] 登录失败 " + attempt + "/" + MAX_RETRIES + " 次尝试: " + lastError);
    }
    if (attempt < MAX_RETRIES) {
      await new Promise(r => setTimeout(r, attempt * 2000));
    }
  }
  return { success: false, message: "登录失败超过" + MAX_RETRIES + "次重试: " + lastError, balance: getBalance() };
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
