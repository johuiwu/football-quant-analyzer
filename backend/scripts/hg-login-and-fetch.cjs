#!/usr/bin/env node
// ============================================================
// hg-login-and-fetch.cjs — 自包含登录与数据获取脚本
// 用法: node hg-login-and-fetch.cjs [--monitor] [--debug] [--username XXX] [--password XXX]
// ============================================================

const puppeteer = require("puppeteer-extra");
const StealthPlugin = require("puppeteer-extra-plugin-stealth");
const fs = require("fs");
const path = require("path");

puppeteer.use(StealthPlugin());

// ======================== 配置 ========================
const HG_URL = process.env.HG_URL || "https://www.hga050.com";
const HG_USERNAME = process.env.HG_USERNAME || "";
const HG_PASSWORD = process.env.HG_PASSWORD || "";
const LOGIN_TIMEOUT = 90000; // 90秒
const POLL_INTERVAL = 3000;

// 命令行参数
const args = process.argv.slice(2);
const isMonitor = args.includes("--monitor");
const isDebug = args.includes("--debug") || process.env.CRAWLER_DEBUG === "1";
const usernameArg = args[args.indexOf("--username") + 1];
const passwordArg = args[args.indexOf("--password") + 1];
const USERNAME = usernameArg || HG_USERNAME;
const PASSWORD = passwordArg || HG_PASSWORD;

// 路径
const SCRIPT_DIR = __dirname;
const SERVICES_DIR = path.resolve(SCRIPT_DIR, "..", "services");
const COOKIES_PATH = path.resolve(SERVICES_DIR, "..", "cookies.json");
const CREDENTIALS_PATH = path.resolve(SERVICES_DIR, "..", "credentials.json");
const DEBUG_DIR = path.resolve(SCRIPT_DIR, "..", "..", "debug");

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

// ======================== 暴力弹窗清理 ========================
/**
 * 核心策略：不检测弹窗是否可见，直接移除所有弹窗容器的 .on 类
 * 这避免了 getComputedStyle 误判 DOM 模板元素的问题
 */
async function brutalCleanup(page) {
  try {
    const cleaned = await page.evaluate(() => {
      let count = 0;
      // 移除所有已知弹窗容器的 .on 类
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
      // 移除 body 锁定类
      if (document.body) {
        document.body.classList.remove("scroll_lock", "locked");
        document.body.style.overflow = "";
      }
      return count;
    });
    if (cleaned > 0) {
      dbg(`brutalCleanup: 移除了 ${cleaned} 个弹窗容器的 .on 类`);
    }
    // ESC 键兜底
    try { await page.keyboard.press("Escape"); } catch (_) {}
  } catch (e) {
    dbg(`brutalCleanup 异常: ${e.message}`);
  }
}

// ======================== 页面状态检测 ========================
async function detectState(page) {
  try {
    return await page.evaluate(() => {
      // 辅助：检查元素是否真正可见（考虑父容器）
      function isReallyVisible(el) {
        if (!el) return false;
        // 检查自身
        const style = getComputedStyle(el);
        if (style.display === 'none' || style.visibility === 'hidden') return false;
        // 检查是否在弹窗容器内且容器未激活
        let parent = el.parentElement;
        while (parent) {
          if (parent.id === 'alert_kick' || parent.id === 'alert_show' ||
              parent.id === 'C_alert_confirm' || parent.id === 'alert_confirm' ||
              parent.id === 'system_popup') {
            // 在弹窗容器内，检查容器是否激活
            if (!parent.classList.contains('on')) return false;
          }
          parent = parent.parentElement;
        }
        return true;
      }

      // 1. 检测已登录（主页特征）
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

      // 2. 检测简易密码页面
      var backLogin = document.getElementById("back_login");
      if (backLogin && isReallyVisible(backLogin)) {
        return { state: "PASSCODE_PAGE", detail: "简易密码设置页面" };
      }

      // 3. 检测被踢出（需要容器激活）
      var alertKick = document.getElementById("alert_kick");
      if (alertKick && alertKick.classList.contains("on")) {
        return { state: "KICKED_OUT", detail: "被踢出弹窗" };
      }

      // ★ 4. 检测弹窗（容器激活的）— 必须在 LOGIN_PAGE 之前检测！
      var popupIds = ["C_alert_confirm", "alert_confirm", "alert_show"];
      for (var id of popupIds) {
        var el = document.getElementById(id);
        if (el && el.classList.contains("on")) {
          return { state: "POPUP_ACTIVE", detail: "弹窗激活: " + id };
        }
      }

      // 5. 检测登录页面
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

// ======================== 诊断 ========================
async function diagnose(page, label) {
  if (!isDebug) return;
  try {
    if (!fs.existsSync(DEBUG_DIR)) fs.mkdirSync(DEBUG_DIR, { recursive: true });
    const ts = Date.now();
    const screenshotPath = path.join(DEBUG_DIR, `${label}-${ts}.png`);
    await page.screenshot({ path: screenshotPath, fullPage: true });
    dbg(`诊断截图: ${screenshotPath}`);

    const state = await page.evaluate(() => ({
      url: location.href,
      title: document.title,
      bodyText: (document.body.textContent || "").substring(0, 500),
      keyElements: {
        usr: !!document.getElementById("usr"),
        back_login: !!document.getElementById("back_login"),
        kick_ok_btn: !!document.getElementById("kick_ok_btn"),
        alert_kick_on: document.getElementById("alert_kick")?.classList.contains("on"),
        C_alert_confirm_on: document.getElementById("C_alert_confirm")?.classList.contains("on"),
        symbol_ft: !!document.getElementById("symbol_ft"),
        live_page: !!document.getElementById("live_page"),
      }
    }));
    dbg(`页面状态: URL=${state.url}, 标题=${state.title}`);
    dbg(`关键元素: ${JSON.stringify(state.keyElements)}`);
    dbg(`页面文本前200字: ${state.bodyText.substring(0, 200)}`);
  } catch (e) {
    dbg(`诊断异常: ${e.message}`);
  }
}

// ======================== 登录流程 ========================
async function doLogin(page, username, password) {
  info("填写凭据并登录...");

  // 使用 Puppeteer type() 方法模拟真实键盘输入（触发 React/Vue change 事件）
  const usernameInput = await page.$("#usr, input[name='username'], input[type='text'], input[placeholder*='用户']");
  if (usernameInput) {
    await usernameInput.click({ clickCount: 3 });
    await usernameInput.type(username, { delay: 50 });
    ok("已输入用户名");
  } else {
    warn("未找到用户名输入框");
  }

  const passwordInput = await page.$("#pwd, input[name='password'], input[type='password'], input[placeholder*='密码']");
  if (passwordInput) {
    await passwordInput.click({ clickCount: 3 });
    await passwordInput.type(password, { delay: 50 });
    ok("已输入密码");
  } else {
    warn("未找到密码输入框");
  }

  // 点击登录按钮 — 逐个尝试选择器
  const btnSelectors = ["#btn_login", "input[type='submit']", "button[type='submit']", "input[type='button']", "[class*='login']", "[class*='submit']"];
  let btnClicked = false;
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
    } catch (e) {
      dbg(`按钮选择器 ${sel} 失败: ${e.message}`);
    }
  }
  if (!btnClicked) {
    warn("未找到可点击的登录按钮，尝试 Enter 键");
    await page.keyboard.press("Enter");
  }

  // 等待页面响应
  await new Promise(r => setTimeout(r, 3000));
}

// ======================== uid/ver 提取 ========================
async function extractUidVer(page) {
  let uid = null;
  let ver = null;

  // 1. 从 DOM 全局变量提取
  try {
    const domParams = await page.evaluate(() => {
      let u = "", v = "";
      try { u = top.uid || window.uid || ""; } catch(e) { u = window.uid || ""; }
      try { v = top.ver || window.ver || ""; } catch(e) { v = window.ver || ""; }
      return { uid: u, ver: v };
    });
    if (domParams.uid && domParams.uid !== "undefined" && domParams.uid.length >= 10 && !domParams.uid.endsWith("=")) {
      uid = domParams.uid;
      ok(`从 DOM 提取 uid: ${uid.substring(0, 12)}...`);
    }
    if (domParams.ver) {
      ver = domParams.ver;
      ok(`从 DOM 提取 ver: ${ver.substring(0, 16)}...`);
    }
  } catch (e) {}

  // 2. 主动 fetch 触发 ver 获取
  if (!ver) {
    try {
      info("主动 fetch transform.php?p=home 触发 ver 获取...");
      await page.evaluate(async () => {
        try {
          await fetch("transform.php?p=home", {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded", "X-Requested-With": "XMLHttpRequest" },
            credentials: "include"
          });
        } catch (e) {}
      });
      await new Promise(r => setTimeout(r, 2000));
      // 再次从 DOM 提取
      const verFromDom = await page.evaluate(() => {
        try { return top.ver || window.ver || ""; } catch(e) { return window.ver || ""; }
      });
      if (verFromDom) {
        ver = verFromDom;
        ok(`从主动 fetch 后 DOM 提取 ver: ${ver.substring(0, 16)}...`);
      }
    } catch (e) {}
  }

  // 3. 从 Cookie 提取 uid
  if (!uid) {
    try {
      const cookies = await page.cookies();
      for (const c of cookies) {
        if (c.name.toLowerCase() === "uid" && c.value && c.value.length >= 10 && !c.value.endsWith("=")) {
          uid = c.value;
          ok(`从 Cookie 提取 uid: ${uid.substring(0, 12)}...`);
          break;
        }
      }
      // 也检查其他可能包含 uid 的 Cookie
      if (!uid) {
        for (const c of cookies) {
          dbg(`Cookie: ${c.name}=${c.value.substring(0, 20)}...`);
        }
      }
    } catch (e) {}
  }

  // 4. 遍历所有 frame 查找 uid 和 API 域名
  let apiDomain = null;
  if (!uid) {
    try {
      const frames = page.frames();
      dbg(`页面有 ${frames.length} 个 frame`);
      for (const frame of frames) {
        try {
          const frameUrl = frame.url();
          dbg(`frame: ${frameUrl.substring(0, 80)}`);
          // 从 transform.php frame 提取 API 域名
          if (frameUrl.includes("transform.php") && !apiDomain) {
            try {
              const urlObj = new URL(frameUrl);
              apiDomain = urlObj.origin;
              ok(`从 frame 提取 API 域名: ${apiDomain}`);
            } catch (e) {}
          }
          const frameUid = await frame.evaluate(() => {
            try { return window.uid || ""; } catch(e) { return ""; }
          });
          if (frameUid && frameUid !== "undefined" && frameUid.length >= 10 && !frameUid.endsWith("=")) {
            uid = frameUid;
            ok(`从 frame ${frameUrl.substring(0, 50)} 提取 uid: ${uid.substring(0, 12)}...`);
          }
        } catch (e) {}
      }
    } catch (e) {}
  }
  // 如果没从 frame 找到 API 域名，尝试从页面 URL 提取
  if (!apiDomain) {
    try {
      const pageUrl = page.url();
      const urlObj = new URL(pageUrl);
      // 检查 URL 参数中的 domain
      const domainParam = urlObj.searchParams.get("domain");
      if (domainParam) {
        apiDomain = "https://" + domainParam;
        ok(`从页面 URL 参数提取 API 域名: ${apiDomain}`);
      }
    } catch (e) {}
  }

  // 5. 主动触发 chk_login 请求提取 uid
  if (!uid) {
    try {
      info("主动触发 chk_login 请求提取 uid...");
      const uidPromise = new Promise((resolve) => {
        const handler = async (response) => {
          if (response.url().includes("chk_login") || response.url().includes("p=chk_login")) {
            try {
              const text = await response.text();
              const uidMatch = text.match(/<uid>([^<]+)<\/uid>/);
              if (uidMatch && uidMatch[1]) {
                page.off("response", handler);
                resolve(uidMatch[1]);
              }
            } catch (e) {}
          }
        };
        page.on("response", handler);
        setTimeout(() => { page.off("response", handler); resolve(null); }, 8000);
      });
      await page.evaluate(() => {
        try {
          fetch("transform.php?p=chk_login", {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded", "X-Requested-With": "XMLHttpRequest" },
            credentials: "include"
          });
        } catch (e) {}
      });
      const uidFromChkLogin = await uidPromise;
      if (uidFromChkLogin) {
        uid = uidFromChkLogin;
        ok(`从主动 chk_login 提取 uid: ${uid.substring(0, 12)}...`);
      }
    } catch (e) {}
  }

  // 4. 导航到 Soccer 页面触发请求
  if (!uid || !ver) {
    info("导航到 Soccer 页面触发请求...");
    try {
      await page.evaluate(() => { document.getElementById("live_page")?.click(); });
      await new Promise(r => setTimeout(r, 2000));
      await page.evaluate(() => { document.getElementById("symbol_ft")?.click(); });
      await new Promise(r => setTimeout(r, 3000));
    } catch (e) {}

    // 再次提取
    if (!uid || !ver) {
      try {
        const retry = await page.evaluate(() => {
          let u = "", v = "";
          try { u = top.uid || window.uid || ""; } catch(e) { u = window.uid || ""; }
          try { v = top.ver || window.ver || ""; } catch(e) { v = window.ver || ""; }
          return { uid: u, ver: v };
        });
        if (!uid && retry.uid && retry.uid !== "undefined" && retry.uid.length >= 10) uid = retry.uid;
        if (!ver && retry.ver) ver = retry.ver;
      } catch (e) {}
    }
  }

  return { uid, ver, apiDomain };
}

// ======================== 凭证保存 ========================
function saveCredentials(uid, ver, cookies) {
  try {
    fs.writeFileSync(COOKIES_PATH, JSON.stringify(cookies, null, 2), "utf8");
    fs.writeFileSync(CREDENTIALS_PATH, JSON.stringify({ uid, ver, savedAt: Date.now(), cookieCount: cookies.length }, null, 2), "utf8");
    ok(`凭证已保存: uid=${uid?.substring(0, 12)}... ver=${ver?.substring(0, 16)}... cookies=${cookies.length}条`);
  } catch (e) {
    warn(`凭证保存失败: ${e.message}`);
  }
}

function loadCredentials() {
  try {
    if (!fs.existsSync(CREDENTIALS_PATH) || !fs.existsSync(COOKIES_PATH)) return null;
    const cred = JSON.parse(fs.readFileSync(CREDENTIALS_PATH, "utf8"));
    const cookies = JSON.parse(fs.readFileSync(COOKIES_PATH, "utf8"));
    if (!cred.uid || !cred.ver || !Array.isArray(cookies)) return null;
    const cookieStr = cookies.map(c => `${c.name}=${c.value}`).join("; ");
    return { uid: cred.uid, ver: cred.ver, cookieStr, cookies };
  } catch (e) {
    return null;
  }
}

// ======================== HTTP API 数据获取 ========================
async function fetchViaHttp(uid, ver, cookieStr, rtype, apiDomain) {
  const baseUrl = apiDomain || HG_URL;
  const url = baseUrl + "/transform.php?ver=" + encodeURIComponent(ver);
  const isLive = ["rb", "rcn", "rrnou"].includes(rtype);
  const ts = Date.now();
  // 手动构建 body 字符串（不编码 rtype 中的 /）
  const body = [
    "uid=" + uid, "ver=" + ver, "langx=en-us",
    "p=get_game_list", "p3type=", "date=", "gtype=ft",
    "showtype=" + (isLive ? "live" : "today"),
    "rtype=" + rtype, "ltype=3", "sorttype=L",
    "ts=" + ts, "chgSortTS=" + ts,
    "p3type=", "date=", "filter=" + (isLive ? "" : "FT"),
    "cupFantasy=N", "specialClick=", "isFantasy=N",
  ].join("&");

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "X-Requested-With": "XMLHttpRequest",
      "Cookie": cookieStr,
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
      "Referer": baseUrl + "/",
      "Origin": baseUrl,
    },
    body: body,
    // 忽略 SSL 证书错误
    rejectUnauthorized: false,
  });

  if (!res.ok) {
    dbg(`fetchViaHttp(${rtype}): HTTP ${res.status} from ${url}`);
    if (res.status === 302) return { data: "", expired: true };
    return { data: "", expired: false, error: `HTTP ${res.status}` };
  }

  const text = await res.text();
  dbg(`fetchViaHttp(${rtype}): 响应长度=${text.length}, 前200字=${text.substring(0, 200)}`);
  if (text.includes("<!DOCTYPE html>") || text.trimStart().startsWith("<!")) {
    return { data: "", expired: true };
  }
  return { data: text, expired: false };
}

// ======================== XML 解析 ========================
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
      // 匹配自闭合标签 <TAG/> 或 <TAG />
      const selfCloseRegex = /<(\w+)\s*\/>/g;
      let sc;
      while ((sc = selfCloseRegex.exec(content)) !== null) {
        if (!(sc[1] in obj)) obj[sc[1]] = "";
      }
      // 匹配属性标签 <TAG attr="val"/>
      const attrTagRegex = /<(\w+)\s+([^>]*?)\/>/g;
      let at;
      while ((at = attrTagRegex.exec(content)) !== null) {
        if (!(at[1] in obj)) obj[at[1]] = at[2].trim();
      }
      if (Object.keys(obj).length > 0) games.push(obj);
    }
    if (found) break;
  }

  // ★ 尝试 <original> 标签中的 JSON 数据
  const origRegex = /<original>([\s\S]*?)<\/original>/g;
  let origMatch;
  while ((origMatch = origRegex.exec(xmlStr)) !== null) {
    try {
      const jsonData = JSON.parse(origMatch[1]);
      if (typeof jsonData === "object" && Object.keys(jsonData).length > 0) {
        games.push(jsonData);
      }
    } catch (e) {}
  }

  // ★ 如果没有找到任何根标签，尝试直接提取所有二级标签（扁平结构）
  if (games.length === 0) {
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

function parseCornerData(rcnXml, rrnouXml) {
  const rcnGames = extractGamesFromXML(rcnXml);
  const rnouGames = extractGamesFromXML(rrnouXml);

  // 构建 rrnou 比分映射
  const scoreMap = {};
  for (const g of rnouGames) {
    const ht = g.TEAM_H || g.team_h || "";
    const at = g.TEAM_C || g.team_c || "";
    if (ht && at) {
      const key = (ht + "|" + at).toLowerCase();
      scoreMap[key] = {
        homeScore: parseInt(g.SCORE_H || g.score_h, 10) || 0,
        awayScore: parseInt(g.SCORE_C || g.score_c, 10) || 0,
        retime: g.RETIMESET || g.re_time || ""
      };
    }
  }

  const matches = [];
  for (const game of rcnGames) {
    const homeTeam = game.TEAM_H || game.team_h || "";
    const awayTeam = game.TEAM_C || game.team_c || "";
    const league = game.LEAGUE || game.league || "";
    if (!homeTeam || !awayTeam) continue;

    const scoreKey = (homeTeam + "|" + awayTeam).toLowerCase();
    const si = scoreMap[scoreKey] || {};

    // 角球盘口
    const rouo = parseFloat(game.RATIO_CROUO || game.ratio_crouo || game.RATIO_ROUO || game.ratio_rouo || 0);
    const iorouh = parseFloat(game.IOR_CROUO || game.ior_crouo || game.IOR_ROUH || game.ior_rouh || 0);
    const iorouc = parseFloat(game.IOR_CROUU || game.ior_crouu || game.IOR_ROUC || game.ior_rouc || 0);
    const rre = game.RATIO_CRGH || game.ratio_crgh || game.RATIO_RE || game.ratio_re || "";
    const iorh = parseFloat(game.IOR_CRGH || game.ior_crgh || game.IOR_REH || game.ior_reh || 0);
    const iorc = parseFloat(game.IOR_CRGC || game.ior_crgc || game.IOR_REC || game.ior_rec || 0);

    const retime = game.RETIMESET || game.re_time || si.retime || "";
    let elapsed = 0;
    const tm = retime.match(/^(\d)H\^(\d+):(\d+)/);
    if (tm) elapsed = (parseInt(tm[1], 10) - 1) * 45 + parseInt(tm[2], 10);
    else if (retime.includes("HT")) elapsed = 45;

    matches.push({
      homeTeam, awayTeam, league,
      time: retime, elapsedMinutes: elapsed,
      homeScore: si.homeScore || 0, awayScore: si.awayScore || 0,
      cornerOU: rouo > 0 ? { line: rouo, overOdds: iorouh, underOdds: iorouc } : null,
      cornerHDP: (rre || iorh > 0) ? { line: rre, homeOdds: iorh, awayOdds: iorc } : null,
      ecid: game.ECID || game.ecid || "",
      gid: game.GID || game.gid || "",
    });
  }
  return matches;
}

// ======================== 凭证验证 ========================
async function validateCredentials(uid, ver, cookieStr) {
  try {
    const url = HG_URL + "/transform.php";
    const params = new URLSearchParams({ p: "get_member_data", uid, ver, langx: "en-us" });
    const res = await fetch(url + "?ver=" + encodeURIComponent(ver), {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "X-Requested-With": "XMLHttpRequest",
        "Cookie": cookieStr,
      },
      body: params.toString(),
    });
    const text = await res.text();
    return text.includes("<member>") || text.includes("<username>");
  } catch (e) {
    return false;
  }
}

// ======================== 主流程 ========================
async function main() {
  info("=== HGA 登录与数据获取脚本 ===");
  info(`模式: ${isMonitor ? "持续监听" : "单次获取"}`);
  info(`HG_URL: ${HG_URL}`);
  info(`用户名: ${USERNAME ? USERNAME.substring(0, 4) + "****" : "(未设置)"}`);

  // 1. 尝试凭证快速恢复
  const savedCreds = loadCredentials();
  if (savedCreds) {
    info("发现磁盘凭证，验证有效性...");
    const isValid = await validateCredentials(savedCreds.uid, savedCreds.ver, savedCreds.cookieStr);
    if (isValid) {
      ok("凭证有效！跳过浏览器登录，直接获取数据");
      await fetchDataAndOutput(savedCreds);
      if (isMonitor) {
        await startMonitoring(savedCreds);
      }
      return;
    }
    warn("凭证已过期，需要重新登录");
  }

  // 2. 浏览器登录
  if (!USERNAME || !PASSWORD) {
    err("未设置用户名/密码！请通过 --username/--password 参数或 HG_USERNAME/HG_PASSWORD 环境变量设置");
    process.exit(1);
  }

  let browser = null;
  let page = null;
  let capturedUid = null;
  let capturedVer = null;
  let capturedApiDomain = null;

  try {
    // 启动浏览器
    info("启动 Puppeteer 浏览器...");
    const launchArgs = [
      "--ignore-certificate-errors",
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
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
    await page.setUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36");
    await page.setViewport({ width: 1920, height: 1080 });
    await page.evaluateOnNewDocument(() => {
      Object.defineProperty(navigator, "webdriver", { get: () => false });
      Object.defineProperty(navigator, "plugins", { get: () => [1, 2, 3, 4, 5] });
    });
    ok("浏览器已启动");

    // 设置响应拦截
    page.on("response", async (response) => {
      const url = response.url();
      try {
        if (url.includes("chk_login")) {
          const text = await response.text();
          const uidMatch = text.match(/<uid>([^<]+)<\/uid>/);
          if (uidMatch && uidMatch[1]) {
            capturedUid = uidMatch[1];
            ok(`从 chk_login 捕获 uid: ${capturedUid.substring(0, 10)}...`);
          }
        }
        if (url.includes("transform.php") && url.includes("ver=")) {
          const verMatch = url.match(/[?&]ver=([^&]+)/);
          if (verMatch && verMatch[1]) {
            capturedVer = verMatch[1];
            ok(`从 transform.php 捕获 ver: ${capturedVer.substring(0, 16)}...`);
          }
        }
      } catch (e) {}
    });

    // 导航到登录页
    info(`导航到 ${HG_URL}...`);
    await page.goto(HG_URL, { waitUntil: "domcontentloaded", timeout: 30000 });
    await new Promise(r => setTimeout(r, 3000));

    // ★ 暴力清理首次弹窗
    await brutalCleanup(page);
    await new Promise(r => setTimeout(r, 1000));

    // 登录循环
    const loginStart = Date.now();
    let loginAttempted = false;
    let lastState = "";
    let stuckCount = 0;

    while (Date.now() - loginStart < LOGIN_TIMEOUT) {
      // ★ 先检测状态，再决定是否清理（不要在检测前清理弹窗！）
      const detected = await detectState(page);
      dbg(`状态: ${detected.state} (${detected.detail})`);

      // 检测卡死：同一状态连续出现
      if (detected.state === lastState) {
        stuckCount++;
        if (stuckCount > 15) {
          warn(`状态 ${detected.state} 连续出现 15 次，尝试强制操作...`);
          await diagnose(page, "stuck");
          await brutalCleanup(page);
          // 强制清除 Cookie 并重新导航
          try {
            const client = await page.target().createCDPSession();
            await client.send("Network.clearBrowserCookies");
          } catch (e) {}
          await page.goto(HG_URL, { waitUntil: "domcontentloaded", timeout: 30000 });
          await new Promise(r => setTimeout(r, 3000));
          loginAttempted = false;
          stuckCount = 0;
          continue;
        }
      } else {
        stuckCount = 0;
        lastState = detected.state;
      }

      switch (detected.state) {
        case "LOGGED_IN":
          ok("登录成功！");
          await diagnose(page, "login-success");

          // 提取 uid/ver
          if (!capturedUid || !capturedVer) {
            info("提取 uid/ver...");
            const extracted = await extractUidVer(page);
            if (extracted.uid) capturedUid = extracted.uid;
            if (extracted.ver) capturedVer = extracted.ver;
            if (extracted.apiDomain) capturedApiDomain = extracted.apiDomain;
          }

          if (capturedUid && capturedVer) {
            // 保存凭证
            const cookies = await page.cookies();
            saveCredentials(capturedUid, capturedVer, cookies);

            // 关闭浏览器
            await browser.close();
            browser = null;

            // 用纯 HTTP 获取数据
            const creds = { uid: capturedUid, ver: capturedVer, cookieStr: cookies.map(c => `${c.name}=${c.value}`).join("; "), cookies, apiDomain: capturedApiDomain };
            await fetchDataAndOutput(creds);
            if (isMonitor) {
              await startMonitoring(creds);
            }
            return;
          } else {
            warn(`凭证不完整: uid=${capturedUid ? "有" : "无"} ver=${capturedVer ? "有" : "无"}`);
            // 尝试继续等待
            await new Promise(r => setTimeout(r, 3000));
          }
          break;

        case "LOGIN_PAGE":
          if (!loginAttempted) {
            await doLogin(page, USERNAME, PASSWORD);
            loginAttempted = true;
            await new Promise(r => setTimeout(r, 3000));
          } else {
            await new Promise(r => setTimeout(r, 1000));
          }
          break;

        case "PASSCODE_PAGE":
          info("检测到简易密码页面，点击\"普通登入\"...");
          await page.evaluate(() => {
            const btn = document.querySelector("#back_login");
            if (btn) btn.click();
          });
          await new Promise(r => setTimeout(r, 3000));
          loginAttempted = false;
          break;

        case "KICKED_OUT":
          info("检测到被踢出弹窗，清理并重新导航...");
          await brutalCleanup(page);
          try {
            const client = await page.target().createCDPSession();
            await client.send("Network.clearBrowserCookies");
            ok("已清除 Cookie");
          } catch (e) {}
          await page.goto(HG_URL, { waitUntil: "domcontentloaded", timeout: 30000 });
          await new Promise(r => setTimeout(r, 3000));
          loginAttempted = false;
          break;

        case "POPUP_ACTIVE":
          info("检测到激活弹窗，先点击取消按钮再清理...");
          // 1. 先尝试点击弹窗内的"否/取消"按钮
          const popupClicked = await page.evaluate(() => {
            // 查找激活弹窗内的按钮
            const popupIds = ["C_alert_confirm", "alert_confirm", "alert_show", "system_popup"];
            for (const id of popupIds) {
              const container = document.getElementById(id);
              if (container && container.classList.contains("on")) {
                // 先尝试点击"否/取消"按钮
                const noBtns = container.querySelectorAll(".btn_cancel, #C_no_btn, #no_btn, button, input[type='button']");
                for (const btn of noBtns) {
                  const text = (btn.textContent || btn.value || "").trim().toUpperCase();
                  if (text === "NO" || text === "否" || text === "NO/" || text.includes("NO") || text === "CANCEL" || text === "取消") {
                    btn.click();
                    return true;
                  }
                }
                // 如果没找到"否"按钮，点击第一个按钮
                if (noBtns.length > 0) {
                  noBtns[0].click();
                  return true;
                }
              }
            }
            return false;
          });
          if (popupClicked) {
            ok("已点击弹窗按钮");
          }
          await new Promise(r => setTimeout(r, 1000));
          // 2. 然后暴力清理残留弹窗
          await brutalCleanup(page);
          await new Promise(r => setTimeout(r, 500));
          break;

        default:
          await new Promise(r => setTimeout(r, 1000));
          break;
      }
    }

    // 超时
    err("登录超时！");
    await diagnose(page, "login-timeout");
    process.exit(1);

  } catch (e) {
    err(`异常: ${e.message}`);
    if (page) await diagnose(page, "exception");
    process.exit(1);
  } finally {
    if (browser) {
      try { await browser.close(); } catch (e) {}
    }
  }
}

// ======================== 数据获取与输出 ========================
async function fetchDataAndOutput(creds) {
  info("通过纯 HTTP API 获取角球数据...");
  const apiDomain = creds.apiDomain || null;
  try {
    // 先尝试今日数据 (r/cn)，再尝试滚球数据 (rcn)
    let rcnResult = { data: "", expired: false };
    let rnouResult = { data: "", expired: false };

    // 今日角球数据
    info("请求今日角球数据 (r/cn + r/rnou)..." + (apiDomain ? ` 域名=${apiDomain}` : ""));
    const [todayRcn, todayRnou] = await Promise.all([
      fetchViaHttp(creds.uid, creds.ver, creds.cookieStr, "r/cn", apiDomain),
      fetchViaHttp(creds.uid, creds.ver, creds.cookieStr, "r/rnou", apiDomain),
    ]);

    if (todayRcn.expired || todayRnou.expired) {
      warn("会话已过期，需要重新登录");
      return { expired: true };
    }

    // 滚球角球数据
    info("请求滚球角球数据 (rcn + rrnou)...");
    const [liveRcn, liveRnou] = await Promise.all([
      fetchViaHttp(creds.uid, creds.ver, creds.cookieStr, "rcn", apiDomain),
      fetchViaHttp(creds.uid, creds.ver, creds.cookieStr, "rrnou", apiDomain),
    ]);

    if (liveRcn.expired || liveRnou.expired) {
      warn("会话已过期，需要重新登录");
      return { expired: true };
    }

    // 合并数据
    const todayMatches = parseCornerData(todayRcn.data || "", todayRnou.data || "");
    const liveMatches = parseCornerData(liveRcn.data || "", liveRnou.data || "");
    const matches = [...todayMatches, ...liveMatches];

    // 如果今日数据返回 CheckEMNU，提示用户
    if (todayRcn.data === "CheckEMNU" || todayRnou.data === "CheckEMNU") {
      warn("今日数据需要 EMNU 验证，跳过今日数据");
    }

    ok(`获取到 ${todayMatches.length} 场今日 + ${liveMatches.length} 场滚球 = ${matches.length} 场角球比赛`);

    // 输出摘要
    for (const m of matches.slice(0, 5)) {
      const ouStr = m.cornerOU ? `O/U ${m.cornerOU.line} (${m.cornerOU.overOdds}/${m.cornerOU.underOdds})` : "无";
      const hdpStr = m.cornerHDP ? `HDP ${m.cornerHDP.line} (${m.cornerHDP.homeOdds}/${m.cornerHDP.awayOdds})` : "无";
      info(`  ${m.league} | ${m.homeTeam} vs ${m.awayTeam} | ${m.homeScore}-${m.awayScore} | ${m.time} | ${ouStr} | ${hdpStr}`);
    }
    if (matches.length > 5) info(`  ... 还有 ${matches.length - 5} 场比赛`);

    return { expired: false, matches };
  } catch (e) {
    err(`数据获取失败: ${e.message}`);
    return { expired: false, matches: [], error: e.message };
  }
}

// ======================== 持续监听 ========================
async function startMonitoring(creds) {
  info(`=== 启动持续监听 (${POLL_INTERVAL}ms 间隔) ===`);
  let currentCreds = creds;
  let lastMatchCount = 0;
  let lastHash = "";

  const poll = async () => {
    try {
      const result = await fetchDataAndOutput(currentCreds);

      if (result.expired) {
        warn("会话过期，尝试重新登录...");
        // 重新登录
        const newCreds = await reLogin();
        if (newCreds) {
          currentCreds = newCreds;
          ok("重新登录成功，继续监听");
        } else {
          err("重新登录失败，10秒后重试");
          setTimeout(poll, 10000);
          return;
        }
      }

      // 增量变更检测
      if (result.matches) {
        const newHash = JSON.stringify(result.matches.map(m => `${m.homeTeam}|${m.awayTeam}|${m.cornerOU?.overOdds}|${m.cornerHDP?.homeOdds}`));
        if (newHash !== lastHash) {
          if (lastHash) {
            ok(`数据变更检测: ${lastMatchCount} → ${result.matches.length} 场比赛`);
          }
          lastHash = newHash;
          lastMatchCount = result.matches.length;
        }
      }
    } catch (e) {
      err(`轮询异常: ${e.message}`);
    }

    setTimeout(poll, POLL_INTERVAL);
  };

  poll();
}

async function reLogin() {
  info("执行重新登录...");
  let browser = null;
  let page = null;
  let uid = null;
  let ver = null;

  try {
    const launchArgs = ["--ignore-certificate-errors", "--no-sandbox", "--disable-setuid-sandbox"];
    if (process.env.PUPPETEER_PROXY) {
      launchArgs.push("--proxy-server=" + process.env.PUPPETEER_PROXY);
      launchArgs.push("--host-resolver-rules=MAP * ~NOTFOUND , EXCLUDE localhost");
    }
    browser = await puppeteer.launch({
      headless: process.env.PUPPETEER_HEADLESS !== "false",
      args: launchArgs,
    });
    page = await browser.newPage();
    await page.setUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36");
    await page.setViewport({ width: 1920, height: 1080 });

    page.on("response", async (response) => {
      const url = response.url();
      try {
        if (url.includes("chk_login")) {
          const text = await response.text();
          const uidMatch = text.match(/<uid>([^<]+)<\/uid>/);
          if (uidMatch) uid = uidMatch[1];
        }
        if (url.includes("transform.php") && url.includes("ver=")) {
          const verMatch = url.match(/[?&]ver=([^&]+)/);
          if (verMatch) ver = verMatch[1];
        }
      } catch (e) {}
    });

    // 清除旧 Cookie
    await page.goto("about:blank");
    const client = await page.target().createCDPSession();
    await client.send("Network.clearBrowserCookies");

    await page.goto(HG_URL, { waitUntil: "domcontentloaded", timeout: 30000 });
    await new Promise(r => setTimeout(r, 3000));
    await brutalCleanup(page);

    // 简化登录循环
    const start = Date.now();
    let attempted = false;
    while (Date.now() - start < 60000) {
      await brutalCleanup(page);
      await new Promise(r => setTimeout(r, 500));
      const state = await detectState(page);

      if (state.state === "LOGGED_IN") {
        const extracted = await extractUidVer(page);
        if (!uid && extracted.uid) uid = extracted.uid;
        if (!ver && extracted.ver) ver = extracted.ver;
        if (uid && ver) {
          const cookies = await page.cookies();
          saveCredentials(uid, ver, cookies);
          await browser.close();
          return { uid, ver, cookieStr: cookies.map(c => `${c.name}=${c.value}`).join("; "), cookies };
        }
      } else if (state.state === "LOGIN_PAGE" && !attempted) {
        await doLogin(page, USERNAME, PASSWORD);
        attempted = true;
        await new Promise(r => setTimeout(r, 3000));
      } else if (state.state === "PASSCODE_PAGE") {
        await page.evaluate(() => document.querySelector("#back_login")?.click());
        await new Promise(r => setTimeout(r, 3000));
        attempted = false;
      } else if (state.state === "KICKED_OUT") {
        await brutalCleanup(page);
        try { const c = await page.target().createCDPSession(); await c.send("Network.clearBrowserCookies"); } catch(e) {}
        await page.goto(HG_URL, { waitUntil: "domcontentloaded", timeout: 30000 });
        await new Promise(r => setTimeout(r, 3000));
        attempted = false;
      } else {
        await new Promise(r => setTimeout(r, 1000));
      }
    }

    err("重新登录超时");
    await browser.close();
    return null;
  } catch (e) {
    err(`重新登录异常: ${e.message}`);
    if (browser) try { await browser.close(); } catch (_) {}
    return null;
  }
}

// ======================== 启动 ========================
main().catch(e => {
  err(`致命错误: ${e.message}`);
  process.exit(1);
});
