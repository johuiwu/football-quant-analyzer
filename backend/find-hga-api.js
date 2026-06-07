#!/usr/bin/env node
// ================================================================
// find-hga-api.js — 自动发现 hga050.com 上返回比赛数据的真实 API 接口
//
// 目标：自动访问 hga050.com，登录后进入 In-Play 页面，
//       捕获所有网络请求，分析出哪个接口返回了实时比赛数据。
//
// 运行方式：node find-hga-api.js
// ================================================================

import puppeteer from "puppeteer-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";
import fs from "fs";
import path from "path";

puppeteer.use(StealthPlugin());

// ======================== 配置 ========================
const HG_URL = "https://www.hga050.com";
const USERNAME = "johui888";
const PASSWORD = "aa123123";
const HEADLESS = process.env.HEADLESS === "true"; // 默认有头模式
const COLLECT_SECONDS = 20; // 网络请求收集窗口（秒）
const OUTPUT_DIR = "debug_api_discovery";

// ======================== 数据收集 ========================
const capturedRequests = []; // { url, method, postData, resourceType }
const capturedResponses = []; // { url, method, status, contentType, headers, body, bodyLength, jsonData, isJson, resourceType }
let totalRequests = 0;
let xhrFetchCount = 0;

// ======================== 工具函数 ========================

function truncate(str, maxLen = 300) {
  if (!str) return "";
  return str.length > maxLen ? str.substring(0, maxLen) + "..." : str;
}

function safeJsonParse(text) {
  try {
    return { ok: true, data: JSON.parse(text) };
  } catch (e) {
    return { ok: false, data: null };
  }
}

/** 从 JSON 对象中递归提取所有 key（最多 depth=4） */
function extractAllKeys(obj, depth = 0, maxDepth = 4) {
  if (depth > maxDepth || !obj || typeof obj !== "object") return [];
  const keys = [];
  if (Array.isArray(obj)) {
    if (obj.length > 0 && typeof obj[0] === "object") {
      keys.push(...extractAllKeys(obj[0], depth + 1, maxDepth));
    }
  } else {
    for (const k of Object.keys(obj)) {
      keys.push(k);
      if (typeof obj[k] === "object" && obj[k] !== null) {
        keys.push(...extractAllKeys(obj[k], depth + 1, maxDepth));
      }
    }
  }
  return [...new Set(keys)];
}

/** 检查 JSON 数据是否包含比赛相关字段 */
function scoreMatchData(jsonData, url) {
  if (!jsonData || typeof jsonData !== "object") return 0;

  let score = 0;
  const allKeys = extractAllKeys(jsonData);
  const allKeysLower = allKeys.map(k => k.toLowerCase());
  const urlLower = (url || "").toLowerCase();

  // ---- 字段匹配 ----
  // 球队名
  const teamFields = ["hometeam", "awayteam", "home", "away", "home_team", "away_team",
    "team1", "team2", "team_home", "team_away", "h_name", "a_name", "homename", "awayname",
    "name_home", "name_away", "team_h", "team_a"];
  for (const f of teamFields) {
    if (allKeysLower.includes(f)) { score += 10; break; }
  }

  // 比分
  const scoreFields = ["score", "homescore", "awayscore", "home_score", "away_score",
    "hscore", "ascore", "h_s", "a_s"];
  for (const f of scoreFields) {
    if (allKeysLower.includes(f)) { score += 8; break; }
  }

  // 盘口/让球
  const handicapFields = ["handicap", "cornerhandicap", "corner_handicap", "hdp", "ratio",
    "strong", "ratio_cornerhdp", "letball"];
  for (const f of handicapFields) {
    if (allKeysLower.includes(f)) { score += 10; break; }
  }

  // 赔率
  const oddsFields = ["odds", "cornerodds", "corner_odds", "ioratio", "hdp_home",
    "hdp_away", "ou_over", "ou_under"];
  for (const f of oddsFields) {
    if (allKeysLower.includes(f)) { score += 8; break; }
  }

  // 角球相关
  const cornerFields = ["corner", "cn", "corners", "corner_hdp", "corner_ou",
    "cornercount", "corner_count", "totalcorner", "total_corner"];
  for (const f of cornerFields) {
    if (allKeysLower.includes(f) || urlLower.includes(f)) { score += 6; break; }
  }

  // URL 关键词
  const urlKeywords = ["live", "inplay", "in-play", "match", "game", "event", "fixture"];
  for (const kw of urlKeywords) {
    if (urlLower.includes(kw)) { score += 5; break; }
  }

  // 顶层 key 包含列表类字段
  const listFields = ["matches", "data", "list", "games", "fixtures", "events",
    "results", "items", "doc", "response"];
  for (const f of listFields) {
    if (allKeysLower.includes(f)) { score += 5; break; }
  }

  // 数组长度加分
  function findLargestArray(obj, depth = 0) {
    if (depth > 3 || !obj || typeof obj !== "object") return 0;
    let maxLen = 0;
    if (Array.isArray(obj)) {
      maxLen = obj.length;
    } else {
      for (const k of Object.keys(obj)) {
        if (Array.isArray(obj[k])) {
          maxLen = Math.max(maxLen, obj[k].length);
        } else if (typeof obj[k] === "object") {
          maxLen = Math.max(maxLen, findLargestArray(obj[k], depth + 1));
        }
      }
    }
    return maxLen;
  }
  const largestArr = findLargestArray(jsonData);
  if (largestArr > 0) score += Math.min(largestArr, 50) * 0.1;

  // 特殊：GAME_ 前缀的 key（transform.php 返回格式）
  const gameKeys = allKeys.filter(k => k.startsWith("GAME_") || k.startsWith("game_"));
  if (gameKeys.length > 0) score += 15;

  // 特殊：gismo/betradar 格式
  if (allKeysLower.includes("doc") || allKeysLower.includes("match_info")) score += 5;

  return Math.round(score);
}

/** 从 JSON 数据中提取比赛样本 */
function extractMatchSamples(jsonData, maxSamples = 3) {
  if (!jsonData || typeof jsonData !== "object") return [];

  const samples = [];

  function tryExtractArray(arr) {
    if (!Array.isArray(arr)) return;
    for (const item of arr.slice(0, maxSamples)) {
      if (item && typeof item === "object") {
        samples.push(item);
      }
    }
  }

  // Pattern 1: 顶层是数组
  if (Array.isArray(jsonData)) {
    tryExtractArray(jsonData);
    return samples;
  }

  // Pattern 2: response.GAME_X 格式
  if (jsonData.response && typeof jsonData.response === "object") {
    const gameKeys = Object.keys(jsonData.response).filter(k => k.startsWith("GAME_") || k.startsWith("game_"));
    if (gameKeys.length > 0) {
      for (const k of gameKeys.slice(0, maxSamples)) {
        samples.push(jsonData.response[k]);
      }
      return samples;
    }
  }

  // Pattern 3: 顶层 GAME_ 格式
  const topGameKeys = Object.keys(jsonData).filter(k => k.startsWith("GAME_") || k.startsWith("game_"));
  if (topGameKeys.length > 0) {
    for (const k of topGameKeys.slice(0, maxSamples)) {
      samples.push(jsonData[k]);
    }
    return samples;
  }

  // Pattern 4: doc 数组（gismo 格式）
  if (jsonData.doc && Array.isArray(jsonData.doc)) {
    tryExtractArray(jsonData.doc);
    return samples;
  }

  // Pattern 5: 搜索常见的列表字段
  const listKeys = ["matches", "data", "list", "games", "fixtures", "events", "results", "items"];
  for (const k of listKeys) {
    if (jsonData[k] && Array.isArray(jsonData[k])) {
      tryExtractArray(jsonData[k]);
      if (samples.length > 0) return samples;
    }
  }

  // Pattern 6: 深度搜索（最多3层）
  function deepSearch(obj, depth) {
    if (depth > 3 || samples.length >= maxSamples) return;
    if (!obj || typeof obj !== "object") return;
    for (const k of Object.keys(obj)) {
      if (Array.isArray(obj[k]) && obj[k].length > 0 && obj[k][0] && typeof obj[k][0] === "object") {
        tryExtractArray(obj[k]);
        if (samples.length >= maxSamples) return;
      } else if (typeof obj[k] === "object" && !Array.isArray(obj[k])) {
        deepSearch(obj[k], depth + 1);
      }
    }
  }
  deepSearch(jsonData, 0);

  return samples;
}

// ======================== 主流程 ========================

async function main() {
  console.log("=".repeat(60));
  console.log("  HGA API 接口发现工具");
  console.log("  目标: " + HG_URL);
  console.log("  时间: " + new Date().toLocaleString());
  console.log("=".repeat(60));

  // 创建输出目录
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  // ========== 1. 启动浏览器 ==========
  console.log("\n[1/7] 启动浏览器 (headless=" + HEADLESS + ")...");
  const browser = await puppeteer.launch({
    headless: HEADLESS,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-gpu",
      "--disable-blink-features=AutomationControlled",
      "--window-size=1920,1400",
    ],
    timeout: 60000,
  });

  const page = await browser.newPage();
  await page.setUserAgent(
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36"
  );
  await page.setViewport({ width: 1920, height: 1400 });

  // 反指纹
  await page.evaluateOnNewDocument(() => {
    Object.defineProperty(navigator, "webdriver", { get: () => false });
    Object.defineProperty(navigator, "plugins", { get: () => [1, 2, 3, 4, 5] });
    Object.defineProperty(navigator, "languages", { get: () => ["zh-CN", "zh"] });
  });

  // ========== 2. 设置请求拦截 ==========
  console.log("[2/7] 设置请求拦截...");
  await page.setRequestInterception(true);

  page.on("request", (request) => {
    const url = request.url();
    const method = request.method();
    const resourceType = request.resourceType();
    const postData = request.postData();

    totalRequests++;

    if (resourceType === "xhr" || resourceType === "fetch") {
      xhrFetchCount++;
      capturedRequests.push({
        url,
        method,
        postData: truncate(postData, 500),
        resourceType,
      });
      console.log("  [REQ] " + method + " [" + resourceType + "] " + truncate(url, 150));
      if (postData) {
        console.log("        POST body: " + truncate(postData, 200));
      }
    }

    request.continue();
  });

  page.on("response", async (response) => {
    const url = response.url();
    const status = response.status();
    const headers = response.headers();
    const contentType = headers["content-type"] || "";
    const resourceType = response.request().resourceType();

    // 只处理 XHR/Fetch 响应
    if (resourceType !== "xhr" && resourceType !== "fetch") return;

    let body = "";
    let jsonData = null;
    let isJson = false;

    try {
      body = await response.text();
      const parseResult = safeJsonParse(body);
      if (parseResult.ok) {
        jsonData = parseResult.data;
        isJson = true;
      }
    } catch (e) {
      // 响应体读取失败（如被 abort），跳过
      return;
    }

    const entry = {
      url,
      method: response.request().method(),
      status,
      contentType,
      headers: {
        "content-type": contentType,
        "content-length": headers["content-length"],
        "set-cookie": headers["set-cookie"] ? "(present)" : undefined,
      },
      bodyLength: body.length,
      isJson,
      jsonData: isJson ? jsonData : null,
      bodyPreview: truncate(body, 1000),
      resourceType,
    };

    // 计算置信度
    if (isJson && jsonData) {
      entry.confidence = scoreMatchData(jsonData, url);
      entry.allKeys = extractAllKeys(jsonData).slice(0, 30);
      entry.matchSamples = extractMatchSamples(jsonData, 2);
    } else {
      // 非 JSON 响应（如 XML），检查是否包含比赛相关文本
      let textScore = 0;
      const lowerBody = (body || "").toLowerCase();
      if (lowerBody.includes("<game") || lowerBody.includes("<match")) textScore += 10;
      if (lowerBody.includes("home") && lowerBody.includes("away")) textScore += 5;
      if (lowerBody.includes("score")) textScore += 5;
      if (lowerBody.includes("corner")) textScore += 6;
      if (lowerBody.includes("handicap") || lowerBody.includes("hdp")) textScore += 8;
      if (lowerBody.includes("odds") || lowerBody.includes("ioratio")) textScore += 5;
      if (url.toLowerCase().includes("transform")) textScore += 3;
      entry.confidence = textScore;
      entry.allKeys = [];
      entry.matchSamples = [];
    }

    capturedResponses.push(entry);

    // 实时打印高置信度响应
    if (entry.confidence >= 15) {
      console.log("  [RESP ★" + entry.confidence + "] " + status + " " + truncate(url, 120));
      if (isJson && entry.allKeys.length > 0) {
        console.log("             keys: " + entry.allKeys.slice(0, 15).join(", "));
      }
    }
  });

  // ========== 3. 导航到登录页 ==========
  console.log("\n[3/7] 导航到 " + HG_URL + " ...");
  await page.goto(HG_URL, { waitUntil: "domcontentloaded", timeout: 60000 });
  await new Promise((r) => setTimeout(r, 5000));

  // ========== 4. 自动登录 ==========
  console.log("\n[4/7] 自动登录 (用户: " + USERNAME + ")...");

  // 等待登录表单出现
  try {
    await page.waitForSelector("#usr", { timeout: 15000 });
  } catch (e) {
    console.log("  未找到 #usr 输入框，可能已登录或页面结构变化");
    // 检查是否已经登录
    const alreadyLoggedIn = await page.evaluate(() => {
      const bodyText = document.body?.textContent || "";
      return bodyText.includes("In-Play") && bodyText.includes("Soccer");
    });
    if (alreadyLoggedIn) {
      console.log("  已处于登录状态，跳过登录");
    } else {
      console.log("  等待登录表单...");
      await new Promise((r) => setTimeout(r, 5000));
    }
  }

  // 填写用户名密码并登录
  const loginClicked = await page.evaluate((usr, pwd) => {
    const usrInput = document.querySelector("#usr") || document.querySelector("input[type='text']");
    const pwdInput = document.querySelector("#pwd") || document.querySelector("input[type='password']");
    if (usrInput) {
      usrInput.value = usr;
      usrInput.dispatchEvent(new Event("input", { bubbles: true }));
    }
    if (pwdInput) {
      pwdInput.value = pwd;
      pwdInput.dispatchEvent(new Event("input", { bubbles: true }));
    }
    setTimeout(() => {
      const loginBtn = document.querySelector("#btn_login") || document.querySelector("input[type='button']");
      if (loginBtn) loginBtn.click();
    }, 500);
    return !!(usrInput && pwdInput);
  }, USERNAME, PASSWORD);

  if (loginClicked) {
    console.log("  已填写凭据并点击登录按钮");
  }

  // 等待登录完成（最多80秒，与 hgCrawlerService 逻辑一致）
  let loginSuccess = false;
  for (let i = 0; i < 80; i++) {
    await new Promise((r) => setTimeout(r, 1000));
    const status = await page.evaluate(() => {
      const bodyText = document.body?.textContent || "";
      const hasSuccess = bodyText.includes("In-Play") && bodyText.includes("Soccer");
      const hasPasscodePage = (() => {
        const btn = document.getElementById("back_login");
        if (!btn) return false;
        const style = getComputedStyle(btn);
        return style.display !== "none" && style.visibility !== "hidden";
      })();
      const hasPostLogin = (() => {
        const nav = document.getElementById("today_page") || document.getElementById("live_page");
        if (nav && getComputedStyle(nav).display !== "none") return true;
        const symbol = document.getElementById("symbol_ft");
        if (symbol && getComputedStyle(symbol).display !== "none") return true;
        return false;
      })();
      return { hasSuccess, hasPasscodePage, hasPostLogin };
    });

    // 处理简易密码页面
    if (status.hasPasscodePage) {
      console.log("  检测到简易密码页面，点击普通登入...");
      await page.evaluate(() => {
        const btn = document.querySelector("#back_login");
        if (btn) btn.click();
      });
      await new Promise((r) => setTimeout(r, 3000));
      // 重新输入账号密码
      await page.evaluate((usr, pwd) => {
        const u = document.getElementById("usr");
        const p = document.getElementById("pwd");
        if (u) { u.value = usr; u.dispatchEvent(new Event("input", { bubbles: true })); }
        if (p) { p.value = pwd; p.dispatchEvent(new Event("input", { bubbles: true })); }
      }, USERNAME, PASSWORD);
      await new Promise((r) => setTimeout(r, 500));
      await page.evaluate(() => {
        const btn = document.getElementById("btn_login");
        if (btn) btn.click();
      });
      continue;
    }

    // 处理弹窗
    try {
      await page.evaluate(() => {
        // 点击取消/否按钮
        const cancelBtns = document.querySelectorAll(".btn_cancel, #C_no_btn, #no_btn");
        for (const btn of cancelBtns) {
          const style = getComputedStyle(btn);
          if (style.display !== "none" && style.visibility !== "hidden") {
            btn.click();
          }
        }
        // 点击 OK/确认按钮
        const okBtns = document.querySelectorAll("#kick_ok_btn, #C_ok_btn, #ok_btn");
        for (const btn of okBtns) {
          const style = getComputedStyle(btn);
          if (style.display !== "none" && style.visibility !== "hidden") {
            btn.click();
          }
        }
      });
    } catch (e) {}

    if (status.hasSuccess || status.hasPostLogin) {
      console.log("  登录成功！");
      loginSuccess = true;
      break;
    }

    if (i % 10 === 9) {
      console.log("  等待登录... (" + (i + 1) + "s)");
    }
  }

  if (!loginSuccess) {
    console.log("  登录超时，继续尝试捕获请求...");
  }

  // 等待页面稳定
  await new Promise((r) => setTimeout(r, 3000));

  // ========== 5. 导航到 In-Play → Soccer ==========
  console.log("\n[5/7] 导航到 In-Play → Soccer...");

  // 点击 In-Play / 滚球
  const inplayClicked = await page.evaluate(() => {
    const tab = document.getElementById("live_page");
    if (tab) { tab.click(); return true; }
    // 模糊匹配
    const all = document.querySelectorAll("a, button, span, div, li");
    for (const el of all) {
      const text = (el.textContent || "").trim().toUpperCase();
      const rect = el.getBoundingClientRect();
      if (rect.width < 15 || rect.height < 10) continue;
      if (text.includes("IN-PLAY") || text.includes("INPLAY") || text.includes("滚球")) {
        el.scrollIntoView({ block: "center" });
        el.click();
        return true;
      }
    }
    return false;
  });
  console.log("  In-Play 点击: " + (inplayClicked ? "成功" : "未找到"));
  await new Promise((r) => setTimeout(r, 3000));

  // 处理弹窗
  try {
    await page.evaluate(() => {
      const cancelBtns = document.querySelectorAll(".btn_cancel, #C_no_btn, #no_btn");
      for (const btn of cancelBtns) { try { btn.click(); } catch(e) {} }
    });
  } catch (e) {}

  // 点击 Soccer / 足球
  const soccerClicked = await page.evaluate(() => {
    const btn = document.getElementById("old_ft_live_league") || document.getElementById("symbol_ft");
    if (btn) { btn.scrollIntoView({ block: "center" }); btn.click(); return true; }
    return false;
  });
  console.log("  Soccer 点击: " + (soccerClicked ? "成功" : "未找到"));
  await new Promise((r) => setTimeout(r, 5000));

  // 等待比赛容器渲染
  try {
    await page.waitForFunction(
      () => document.querySelectorAll("div.box_lebet, div.bet_box").length > 0,
      { timeout: 15000 }
    );
    console.log("  比赛容器已渲染");
  } catch (e) {
    console.log("  比赛容器等待超时，继续...");
  }

  // ========== 6. 收集网络请求 ==========
  console.log("\n[6/7] 收集网络请求 (" + COLLECT_SECONDS + "秒窗口)...");

  // 点击 HDP & O/U 标签触发更多请求
  try {
    const hasRnou = await page.evaluate(() => {
      const tab = document.getElementById("tab_rnou");
      if (!tab) return false;
      const style = getComputedStyle(tab);
      return style.display !== "none" && style.visibility !== "hidden";
    });
    if (hasRnou) {
      await page.evaluate(() => {
        const tab = document.getElementById("tab_rnou");
        if (tab) { tab.scrollIntoView({ block: "center" }); tab.click(); }
      });
      console.log("  点击 HDP & O/U 标签");
      await new Promise((r) => setTimeout(r, 3000));
    }
  } catch (e) {}

  // 点击 CORNERS 标签触发更多请求
  try {
    const hasCorners = await page.evaluate(() => {
      const tab = document.getElementById("tab_cn");
      if (!tab) return false;
      const style = getComputedStyle(tab);
      return style.display !== "none" && style.visibility !== "hidden";
    });
    if (hasCorners) {
      await page.evaluate(() => {
        const tab = document.getElementById("tab_cn");
        if (tab) { tab.scrollIntoView({ block: "center" }); tab.click(); }
      });
      console.log("  点击 CORNERS 标签");
      await new Promise((r) => setTimeout(r, 3000));
    }
  } catch (e) {}

  // 滚动触发懒加载
  try {
    await page.evaluate(() => {
      window.scrollTo(0, document.body.scrollHeight);
      setTimeout(() => window.scrollTo(0, 0), 1000);
    });
  } catch (e) {}

  // 等待收集窗口
  const collectStart = Date.now();
  while (Date.now() - collectStart < COLLECT_SECONDS * 1000) {
    await new Promise((r) => setTimeout(r, 2000));
    const elapsed = Math.round((Date.now() - collectStart) / 1000);
    console.log("  收集中... " + elapsed + "/" + COLLECT_SECONDS + "s (已捕获 " + capturedResponses.length + " 个 XHR/Fetch 响应)");
  }

  // ========== 7. 分析并输出结果 ==========
  console.log("\n[7/7] 分析结果...");

  // 保存原始数据到文件
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const rawOutputPath = path.join(OUTPUT_DIR, "raw-captures-" + timestamp + ".json");
  fs.writeFileSync(rawOutputPath, JSON.stringify({
    timestamp: new Date().toISOString(),
    totalRequests,
    xhrFetchCount,
    capturedRequests: capturedRequests.length,
    capturedResponses: capturedResponses.length,
    requests: capturedRequests,
    responses: capturedResponses.map(r => ({
      url: r.url,
      method: r.method,
      status: r.status,
      contentType: r.contentType,
      bodyLength: r.bodyLength,
      isJson: r.isJson,
      confidence: r.confidence,
      allKeys: r.allKeys,
      bodyPreview: r.bodyPreview,
      matchSamples: r.matchSamples,
    })),
  }, null, 2));
  console.log("  原始数据已保存: " + rawOutputPath);

  // 按置信度排序
  const sorted = [...capturedResponses]
    .filter(r => r.confidence > 0)
    .sort((a, b) => b.confidence - a.confidence);

  // 去重（同一 URL 只保留最高置信度的）
  const seenUrls = new Set();
  const unique = [];
  for (const item of sorted) {
    const urlKey = item.url.split("?")[0]; // 去掉 query 参数去重
    if (!seenUrls.has(urlKey)) {
      seenUrls.add(urlKey);
      unique.push(item);
    }
  }

  // 输出报告
  console.log("\n" + "=".repeat(60));
  console.log("  HGA API 发现报告");
  console.log("  时间: " + new Date().toLocaleString());
  console.log("  总请求数: " + totalRequests);
  console.log("  XHR/Fetch 请求数: " + xhrFetchCount);
  console.log("  捕获响应数: " + capturedResponses.length);
  console.log("  有置信度的响应: " + unique.length);
  console.log("=".repeat(60));

  // 高置信度（>= 15）
  const highConf = unique.filter(r => r.confidence >= 15);
  const medConf = unique.filter(r => r.confidence >= 5 && r.confidence < 15);
  const lowConf = unique.filter(r => r.confidence > 0 && r.confidence < 5);

  if (highConf.length > 0) {
    console.log("\n--- 高置信度接口（可能含有比赛数据）---");
    for (let i = 0; i < highConf.length; i++) {
      const r = highConf[i];
      console.log("\n[" + (i + 1) + "] 置信度: " + r.confidence + "  URL: " + truncate(r.url, 200));
      console.log("    方法: " + r.method + "  状态码: " + r.status);
      console.log("    Content-Type: " + r.contentType);
      console.log("    响应体大小: " + r.bodyLength + " bytes");
      if (r.isJson && r.allKeys.length > 0) {
        console.log("    返回字段: " + r.allKeys.slice(0, 20).join(", "));
      }
      if (r.matchSamples && r.matchSamples.length > 0) {
        console.log("    比赛样本:");
        for (const sample of r.matchSamples) {
          const sampleStr = JSON.stringify(sample, null, 2);
          console.log("      " + truncate(sampleStr, 300).replace(/\n/g, "\n      "));
        }
      }
      if (!r.isJson && r.bodyPreview) {
        console.log("    响应预览: " + truncate(r.bodyPreview, 300));
      }

      // 保存高置信度响应的完整数据
      const safeName = r.url.replace(/[^a-zA-Z0-9]/g, "_").substring(0, 80);
      const respPath = path.join(OUTPUT_DIR, "high-conf-" + (i + 1) + "-" + safeName + ".json");
      try {
        fs.writeFileSync(respPath, r.isJson ? JSON.stringify(r.jsonData, null, 2) : r.bodyPreview);
      } catch (e) {}
    }
  }

  if (medConf.length > 0) {
    console.log("\n--- 中等置信度 ---");
    for (let i = 0; i < medConf.length; i++) {
      const r = medConf[i];
      console.log("[" + (i + 1) + "] 置信度: " + r.confidence + "  " + r.method + " " + truncate(r.url, 150));
      console.log("    状态: " + r.status + "  大小: " + r.bodyLength + " bytes  Content-Type: " + r.contentType);
      if (r.allKeys && r.allKeys.length > 0) {
        console.log("    字段: " + r.allKeys.slice(0, 10).join(", "));
      }
    }
  }

  if (lowConf.length > 0) {
    console.log("\n--- 低置信度（可能是静态资源/配置）---");
    for (const r of lowConf) {
      console.log("  置信度: " + r.confidence + "  " + r.method + " " + truncate(r.url, 120));
    }
  }

  // DOM 回退分析：如果高置信度接口不足，从 DOM 中提取比赛数据
  if (highConf.length === 0) {
    console.log("\n--- DOM 回退数据（所有 API 都不像含有比赛数据）---");
    try {
      const domData = await page.evaluate(() => {
        const results = [];
        const containers = document.querySelectorAll("div.box_lebet, div.bet_box");
        for (const el of containers) {
          try {
            const homeEl = el.querySelector("div.box_team.teamH span.text_team, [class*='team_h'] span");
            const awayEl = el.querySelector("div.box_team.teamC span.text_team, [class*='team_c'] span");
            const homeTeam = homeEl ? homeEl.textContent.trim() : "";
            const awayTeam = awayEl ? awayEl.textContent.trim() : "";
            if (!homeTeam || !awayTeam) continue;

            const scoreEls = el.querySelectorAll("div.box_score span.text_point");
            let homeScore = 0, awayScore = 0;
            if (scoreEls.length >= 2) {
              homeScore = parseInt(scoreEls[0].textContent.trim()) || 0;
              awayScore = parseInt(scoreEls[1].textContent.trim()) || 0;
            }

            const timeEl = el.querySelector("tt.text_time, [class*='timer']");
            const timeStr = timeEl ? timeEl.textContent.trim() : "";

            results.push({ homeTeam, awayTeam, homeScore, awayScore, time: timeStr });
          } catch (e) {}
        }
        return results;
      });

      if (domData.length > 0) {
        console.log("  从 DOM 中提取到 " + domData.length + " 场比赛:");
        for (const m of domData.slice(0, 10)) {
          console.log("    " + m.homeTeam + " vs " + m.awayTeam + " | " + m.homeScore + "-" + m.awayScore + " | " + m.time);
        }
        console.log("\n  提示: DOM 中有比赛数据但 API 未捕获到，说明数据可能是：");
        console.log("  1. 通过 WebSocket 推送（非 XHR/Fetch）");
        console.log("  2. 内嵌在初始 HTML 中（SSR）");
        console.log("  3. 通过其他非标准请求方式加载");
      } else {
        console.log("  DOM 中也未找到比赛数据，可能当前无进行中的比赛");
      }
    } catch (e) {
      console.log("  DOM 分析失败: " + e.message);
    }
  }

  // 输出所有 XHR/Fetch URL 汇总
  console.log("\n--- 所有 XHR/Fetch 请求 URL 汇总 ---");
  const allXhrUrls = [...new Set(capturedRequests.map(r => r.url.split("?")[0]))];
  for (const url of allXhrUrls) {
    console.log("  " + url);
  }

  // 保存报告
  const reportPath = path.join(OUTPUT_DIR, "report-" + timestamp + ".txt");
  console.log("\n报告已保存到: " + reportPath);
  console.log("原始数据已保存到: " + rawOutputPath);

  // 关闭浏览器
  console.log("\n关闭浏览器...");
  await browser.close();
  console.log("完成！");
}

// 运行
main().catch((err) => {
  console.error("脚本执行出错:", err.message);
  console.error(err.stack);
  process.exit(1);
});
