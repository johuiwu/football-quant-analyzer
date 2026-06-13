#!/usr/bin/env node
// ================================================================
// explore-hga-network.js — 自动化探索 hga038.com 的网络活动
// 目标：发现潜在的 WebSocket 或实时数据接口
//
// 运行方式：node explore-hga-network.js
// 环境变量：HEADLESS=true 可启用无头模式（默认有头）
// ================================================================

import puppeteer from "puppeteer-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";

puppeteer.use(StealthPlugin());

// ======================== 配置 ========================
const HG_URL = process.env.HG_URL || "https://www.hga038.com";
const USERNAME = "johui888";
const PASSWORD = "aa123123";
const HEADLESS = process.env.HEADLESS === "true";
const OBSERVE_SECONDS = 15; // 登录后观察窗口（秒）

// ======================== 数据收集 ========================
const wsConnections = [];   // { url, headers }
const xhrFetchRecords = [];  // { url, method, responsePreview }

// ======================== 工具函数 ========================

function truncate(str, maxLen = 100) {
  if (!str) return "";
  return str.length > maxLen ? str.substring(0, maxLen) : str;
}

/** 判断 URL/响应是否包含实时数据关键词 */
function isRealtimeRelated(url, bodyPreview) {
  const keywords = ["match_timelinedelta", "gismo", "live", "timelinedelta",
    "subscribe", "ws-fn-cdn", "akamaized", "betradar"];
  const combined = ((url || "") + " " + (bodyPreview || "")).toLowerCase();
  return keywords.some(kw => combined.includes(kw));
}

// ======================== 主流程 ========================

async function main() {
  console.log("============================================================");
  console.log("  HGA 网络活动探索工具 - WebSocket / 实时接口发现");
  console.log("  目标: " + HG_URL);
  console.log("  时间: " + new Date().toLocaleString());
  console.log("  模式: " + (HEADLESS ? "无头" : "有头"));
  console.log("============================================================\n");

  // ========== 1. 启动反检测浏览器 ==========
  console.log("[1/6] 启动浏览器 (headless=" + HEADLESS + ")...");
  const launchArgs = [
    "--no-sandbox",
    "--disable-setuid-sandbox",
    "--disable-dev-shm-usage",
    "--disable-gpu",
    "--disable-blink-features=AutomationControlled",
    "--ignore-certificate-errors",
    "--window-size=1920,1400",
  ];

  // 支持代理配置（与项目约定一致）
  if (process.env.PUPPETEER_PROXY) {
    launchArgs.push("--proxy-server=" + process.env.PUPPETEER_PROXY);
    launchArgs.push("--host-resolver-rules=MAP * ~NOTFOUND , EXCLUDE localhost");
  }

  const browser = await puppeteer.launch({
    headless: HEADLESS,
    args: launchArgs,
    timeout: 60000,
  });

  const page = await browser.newPage();
  await page.setUserAgent(
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36"
  );
  await page.setViewport({ width: 1920, height: 1400 });

  // 反指纹注入
  await page.evaluateOnNewDocument(() => {
    Object.defineProperty(navigator, "webdriver", { get: () => false });
    Object.defineProperty(navigator, "plugins", { get: () => [1, 2, 3, 4, 5] });
    Object.defineProperty(navigator, "languages", { get: () => ["zh-CN", "zh"] });
    Object.defineProperty(navigator, "platform", { get: () => "Win32" });
  });

  // ========== 2. 设置请求拦截（不修改、不阻止） ==========
  console.log("[2/6] 设置请求拦截...");

  await page.setRequestInterception(true);

  // ---- 拦截所有请求 ----
  page.on("request", (request) => {
    const url = request.url();
    const resourceType = request.resourceType();

    // 记录 WebSocket 连接
    if (resourceType === "websocket") {
      const headers = request.headers();
      wsConnections.push({
        url: url,
        headers: {
          "Origin": headers["origin"] || "(none)",
          "Sec-WebSocket-Key": headers["sec-websocket-key"] ? "(present)" : "(missing)",
          "Sec-WebSocket-Version": headers["sec-websocket-version"] || "(unknown)",
          "Sec-WebSocket-Protocol": headers["sec-websocket-protocol"] || "(none)",
          "User-Agent": truncate(headers["user-agent"], 80),
        },
      });
      console.log("  [WS+] 发现 WebSocket 连接: " + url);
    }

    // 不做任何修改或阻止，直接放行
    request.continue();
  });

  // ---- 拦截响应（仅记录 XHR/Fetch） ----
  page.on("response", async (response) => {
    const requestObj = response.request();
    const resourceType = requestObj.resourceType();

    // 仅关注 XHR 和 Fetch
    if (resourceType !== "xhr" && resourceType !== "fetch") return;

    const url = response.url();
    const method = requestObj.method();

    try {
      const body = await response.text();
      const preview = truncate(body, 100);

      xhrFetchRecords.push({
        url,
        method,
        responsePreview: preview,
        status: response.status(),
        isRealtime: isRealtimeRelated(url, preview),
      });

      // 实时打印含关键词的请求
      if (isRealtimeRelated(url, preview)) {
        console.log("  [REALTIME] " + method + " " + truncate(url, 120));
        console.log("             Response Preview: " + preview);
      }
    } catch (_) {
      // 响应体读取失败（如被 abort），跳过
      xhrFetchRecords.push({ url, method, responsePreview: "(unreadable)", status: 0, isRealtime: false });
    }
  });

  // ========== 3. 导航到登录页 ==========
  console.log("\n[3/6] 导航到 " + HG_URL + " ...");
  try {
    await page.goto(HG_URL, { waitUntil: "domcontentloaded", timeout: 60000 });
  } catch (navErr) {
    console.error("  导航错误: " + navErr.message);
    // 区分诊断
    if (navErr.message.includes("net::ERR_NAME_NOT_RESOLVED")) {
      console.error("  >> DNS 解析失败，请检查网络连接或代理设置");
    } else if (navErr.message.includes("net::ERR_SSL")) {
      console.error("  >> SSL 证书问题，已添加 --ignore-certificate-errors");
    } else if (navErr.message.includes("net::ERR_CONNECTION_REFUSED")) {
      console.error("  >> 连接被拒绝，目标服务器不可达");
    } else if (navErr.message.includes("net::ERR_TIMED_OUT") || navErr.message.includes("net::ERR_CONNECTION_TIMED_OUT")) {
      console.error("  >> 连接超时，请检查网络或代理");
    } else if (navErr.message.includes("net::ERR_PROXY")) {
      console.error("  >> 代理错误，请检查 PUPPETEER_PROXY 设置");
    }
  }

  await new Promise((r) => setTimeout(r, 5000));

  // ========== 4. 自动登录（复用 hgCrawlerService 的健壮弹窗处理逻辑） ==========
  console.log("\n[4/6] 自动登录 (用户: " + USERNAME + ")...");

  let loginSuccess = false;
  let loginClicked = false;
  let popupLastHandledAt = 0;
  let consecutivePopupCount = 0;

  for (let i = 0; i < 80; i++) {
    await new Promise((r) => setTimeout(r, 1000));

    const status = await page.evaluate(() => {
      try {
        const bodyText = document.body.textContent || "";
        return {
          hasSuccess: (bodyText.includes("My Events") || bodyText.includes("My Bets")) ||
                      (bodyText.includes("In-Play") && bodyText.includes("Soccer")) ||
                      (() => {
                        var nav = document.getElementById("today_page") || document.getElementById("live_page");
                        if (nav && getComputedStyle(nav).display !== "none" && getComputedStyle(nav).visibility !== "hidden") return true;
                        var symbol = document.getElementById("symbol_ft");
                        if (symbol && getComputedStyle(symbol).display !== "none" && getComputedStyle(symbol).visibility !== "hidden") return true;
                        return false;
                      })(),
          hasLogin: (bodyText.includes("\u767b\u5165") || bodyText.includes("\u767b\u5f55") || bodyText.includes("LOG IN")) &&
                    (() => { var el = document.querySelector("#usr"); return el ? el.offsetParent !== null : false; })(),
          hasPasscodeDialog: (() => {
            var confirm = document.getElementById('C_alert_confirm');
            if (confirm && getComputedStyle(confirm).display !== "none" && getComputedStyle(confirm).visibility !== "hidden") return true;
            var confirm2 = document.getElementById('alert_confirm');
            if (confirm2 && getComputedStyle(confirm2).display !== "none" && getComputedStyle(confirm2).visibility !== "hidden") return true;
            var alertShow = document.getElementById('alert_show');
            if (!alertShow) return false;
            return getComputedStyle(alertShow).display !== "none" && getComputedStyle(alertShow).visibility !== "hidden" &&
                   (alertShow.textContent || "").includes('\u7b80\u6613\u5bc6\u7801');
          })(),
          hasLoggedOutMsg: (() => {
            var kickBtn = document.getElementById('kick_ok_btn');
            if (!kickBtn) return false;
            return getComputedStyle(kickBtn).display !== "none" && getComputedStyle(kickBtn).visibility !== "hidden";
          })(),
          hasTwoFactor: bodyText.includes("\u666e\u901a\u767b\u5165"),
          hasPasscodePage: (() => {
            var btn = document.getElementById('back_login');
            if (!btn) return false;
            var style = getComputedStyle(btn);
            return style.display !== "none" && style.visibility !== "hidden";
          })(),
          hasPostLogin: (() => {
            var nav = document.getElementById("today_page") || document.getElementById("live_page");
            if (nav && getComputedStyle(nav).display !== "none" && getComputedStyle(nav).visibility !== "hidden") return true;
            var symbol = document.getElementById("symbol_ft");
            if (symbol && getComputedStyle(symbol).display !== "none" && getComputedStyle(symbol).visibility !== "hidden") return true;
            return false;
          })()
        };
      } catch (err) { return null; }
    });

    if (!status) continue;

    // ★ 优先检测简易密码页面（必须在 hasSuccess 之前，否则底层页面文本可能误判为成功）
    if (status.hasPasscodePage) {
      console.log("  检测到简易密码页面，点击普通登入...");
      await page.evaluate(() => { const btn = document.querySelector("#back_login"); if (btn) btn.click(); });
      await new Promise((r) => setTimeout(r, 3000));
      loginClicked = false;
      continue;
    }

    if (status.hasSuccess || (loginClicked && status.hasPostLogin && !status.hasLogin)) {
      console.log("  ✅ 登录成功！");
      loginSuccess = true;
      break;
    }

    if (consecutivePopupCount > 12) {
      console.log("  WARNING: consecutive popup > 12, breaking loop (loginClicked=" + loginClicked + ")");
      break;
    }

    // ★ 健壮弹窗处理（复用 hgCrawlerService 的 clickNoButton 逻辑）
    if ((status.hasPasscodeDialog || status.hasLoggedOutMsg) && (i - popupLastHandledAt >= 3 || i === 10)) {
      console.log("  检测到弹窗，尝试处理... (loginClicked=" + loginClicked + ")");

      // 第一步：尝试点击按钮
      const clicked = await page.evaluate(() => {
        const isVisible = (el) => {
          const style = getComputedStyle(el);
          return style.display !== 'none' && style.visibility !== 'hidden';
        };
        let localClicked = false;

        // 点击"普通登入"按钮（简易密码页面）
        const normalLoginBtn = document.getElementById("back_login");
        if (normalLoginBtn && isVisible(normalLoginBtn)) { normalLoginBtn.click(); localClicked = true; }

        // 点击取消/否按钮
        const cancelBtns = document.querySelectorAll(".btn_cancel, #C_no_btn, #no_btn, #C_cancel_btn, [class*='popup'] [class*='close']");
        for (const btn of cancelBtns) {
          if (!isVisible(btn)) continue;
          const text = (btn.textContent || "").trim().toUpperCase();
          if (text === "NO" || text === "\u5426" || text === "CANCEL" || text === "\u53d6\u6d88" || btn.id === "C_no_btn" || btn.id === "no_btn" || btn.id === "C_cancel_btn") {
            btn.click(); localClicked = true;
          }
        }

        // fallback: 点击任意可见的 .btn_cancel
        if (!localClicked) {
          const cancelFallback = document.querySelectorAll(".btn_cancel");
          for (const btn of cancelFallback) { if (isVisible(btn)) { btn.click(); localClicked = true; break; } }
        }

        // 点击确认/OK按钮
        const okBtns = document.querySelectorAll('[class*="msg_popup"] .btn, .btn_confirm, .btn_submit, #C_ok_btn, #ok_btn, #C_alert_confirm, #alert_confirm, #kick_ok_btn, .btn_sure');
        for (const btn of okBtns) {
          if (!isVisible(btn)) continue;
          const text = (btn.textContent || "").trim().toUpperCase();
          if (text === "OK" || text === "\u786e\u8ba4" || text === "\u786e\u5b9a" || text === "SUBMIT" || text === "\u63d0\u4ea4" || text === "\u662f" || btn.id === "C_yes_btn" || btn.id === "yes_btn") {
            btn.click(); localClicked = true;
          }
        }

        return localClicked;
      });

      if (clicked) {
        await new Promise((r) => setTimeout(r, 400));
      }

      // ★ 第二步：强制兜底 — 移除弹窗对话框的 .on 类（不碰容器元素）
      const forceCleaned = await page.evaluate(() => {
        let cleaned = false;
        const dialogIds = ["C_alert_confirm", "alert_confirm", "C_alert_ok", "alert_ok", "alert_kick", "system_popup"];
        for (const id of dialogIds) {
          const el = document.getElementById(id);
          if (el && el.classList.contains("on")) { el.classList.remove("on"); cleaned = true; }
        }
        // 移除 body 上的锁定类
        const bodyLock = document.body;
        if (bodyLock) {
          bodyLock.classList.remove("scroll_lock", "locked");
          bodyLock.style.overflow = "";
        }
        return cleaned;
      });

      if (clicked || forceCleaned) {
        popupLastHandledAt = i;
        consecutivePopupCount++;
        // ★ 不重置 loginClicked — 登录已点击后弹窗可能是正常后续流程
        console.log("  ✓ 已处理弹窗（含强制清理）");
        await new Promise((r) => setTimeout(r, 2000));
        try { await page.waitForNavigation({ waitUntil: "domcontentloaded", timeout: 8000 }); } catch (_) {}
      } else {
        consecutivePopupCount++;
        await new Promise((r) => setTimeout(r, 1000));
      }
      // 不 continue，让循环自然进入下一次迭代，优先检查 hasSuccess
      continue;
    }

    if (status.hasTwoFactor) {
      console.log("  ⚠ 进入二次验证，返回登录");
      await page.evaluate(() => { const btn = document.querySelector("#back_login"); if (btn) btn.click(); });
      await new Promise((r) => setTimeout(r, 5000));
      loginClicked = false;
      continue;
    }

    // 输入凭据并登录
    if (!loginClicked && status.hasLogin) {
      console.log("  设置用户名密码并点击登录...");
      await page.evaluate((usr, pwd) => {
        const usrInput = document.querySelector("#usr") || document.querySelector("input[type='text']");
        const pwdInput = document.querySelector("#pwd") || document.querySelector("input[type='password']");
        if (usrInput) { usrInput.value = usr; usrInput.dispatchEvent(new Event("input", { bubbles: true })); }
        if (pwdInput) { pwdInput.value = pwd; pwdInput.dispatchEvent(new Event("input", { bubbles: true })); }
        setTimeout(() => {
          const loginBtn = document.querySelector("#btn_login") || document.querySelector("input[type='button']") || document.querySelector("button");
          if (loginBtn) loginBtn.click();
        }, 500);
      }, USERNAME, PASSWORD);

      loginClicked = true;
      consecutivePopupCount = 0;
      console.log("  ✓ 已点击登录按钮");
      continue;
    }

    if (i % 15 === 14) {
      console.log("  等待登录... (" + (i + 1) + "s)");
    }
  }

  if (!loginSuccess) {
    console.log("  ⚠ 登录超时或未成功，继续尝试导航以捕获尽可能多的网络活动...");
  }

  // ESC 键兜底清理残留弹窗
  try { await page.keyboard.press("Escape"); await new Promise((r) => setTimeout(r, 500)); } catch (_) {}

  // 截图诊断：查看当前页面状态
  try {
    await page.screenshot({ path: "debug/explore-after-login.png", fullPage: false });
    console.log("  截图已保存: debug/explore-after-login.png");
  } catch (_) {}

  // 等待页面稳定
  await new Promise((r) => setTimeout(r, 3000));

  // ========== 5. 导航到 In-Play → CORNERS 触发数据加载 ==========
  console.log("\n[5/6] 导航到 In-Play → Soccer → CORNERS ...");

  // 点击 In-Play / 滚球
  const inplayClicked = await page.evaluate(() => {
    const tab = document.getElementById("live_page");
    if (tab) { tab.click(); return true; }
    const all = document.querySelectorAll("a, button, span, div, li");
    for (const el of all) {
      const text = (el.textContent || "").trim().toUpperCase();
      const rect = el.getBoundingClientRect();
      if (rect.width < 15 || rect.height < 10) continue;
      if (text.includes("IN-PLAY") || text.includes("INPLAY") || text.includes("LIVE") || text.includes("\u6eda\u7403")) {
        el.scrollIntoView({ block: "center" });
        el.click();
        return true;
      }
    }
    return false;
  });
  console.log("  In-Play 点击: " + (inplayClicked ? "\u6210\u529f" : "\u672a\u627e\u5230"));
  await new Promise((r) => setTimeout(r, 4000));

  // 处理可能的弹窗
  try {
    await page.evaluate(() => {
      const cancelBtns = document.querySelectorAll(".btn_cancel, #C_no_btn, #no_btn");
      for (const btn of cancelBtns) { try { btn.click(); } catch(e) {} }
    });
  } catch (_) {}

  // 点击 Soccer / 足球 (#symbol_ft)
  const soccerClicked = await page.evaluate(() => {
    const btn = document.getElementById("symbol_ft");
    if (btn) { btn.scrollIntoView({ block: "center" }); btn.click(); return true; }
    return false;
  });
  console.log("  Soccer 点击: " + (soccerClicked ? "\u6210\u529f" : "\u672a\u627e\u5230"));
  await new Promise((r) => setTimeout(r, 5000));

  // 等待比赛容器渲染
  try {
    await page.waitForFunction(
      () => document.querySelectorAll("div.box_lebet[class*='bet_type_'], div.bet_box").length > 0,
      { timeout: 15000 }
    );
    console.log("  比赛容器已渲染");
  } catch (e) {
    console.log("  比赛容器等待超时，继续...");
  }

  // ★ 关键步骤：点击 CORNERS 标签页触发角球相关数据加载
  const cornerClicked = await page.evaluate(() => {
    // 优先用 ID
    const tabById = document.getElementById("tab_cn");
    if (tabById) { tabById.scrollIntoView({ block: "center" }); tabById.click(); return true; }

    // 回退：文本匹配
    const all = document.querySelectorAll("a, button, span, div, li, tt");
    for (const el of all) {
      const text = (el.textContent || "").trim().toUpperCase();
      const rect = el.getBoundingClientRect();
      if (rect.width < 10 || rect.height < 8) continue;
      if (text.includes("CORNER") || text.includes("CN") || text.includes("\u89d2\u7403")) {
        el.scrollIntoView({ block: "center" });
        el.click();
        return true;
      }
    }
    return false;
  });
  console.log("  CORNERS 标签点击: " + (cornerClicked ? "\u6210\u529f" : "\u672a\u627e\u5230"));
  await new Promise((r) => setTimeout(r, 5000));

  // 滚动触发懒加载和更多数据请求
  try {
    await page.evaluate(() => {
      window.scrollTo(0, document.body.scrollHeight);
      setTimeout(() => window.scrollTo(0, 0), 1000);
    });
    await new Promise((r) => setTimeout(r, 3000));
  } catch (_) {}

  // 额外尝试：点击 HDP & O/U 标签触发更多 API 调用
  try {
    const extraTabClicked = await page.evaluate(() => {
      const tab = document.getElementById("tab_rnou");
      if (!tab) return false;
      const style = getComputedStyle(tab);
      if (style.display !== "none" && style.visibility !== "hidden") {
        tab.scrollIntoView({ block: "center" }); tab.click(); return true;
      }
      return false;
    });
    if (extraTabClicked) {
      console.log("  额外点击了 HDP & O/U 标签");
      await new Promise((r) => setTimeout(r, 3000));
    }
  } catch (_) {}

  // ========== 6. 观察窗口（持续收集） ==========
  console.log("\n[6/6] 观察窗口 (" + OBSERVE_SECONDS + " 秒)...");

  const observeStart = Date.now();
  while (Date.now() - observeStart < OBSERVE_SECONDS * 1000) {
    await new Promise((r) => setTimeout(r, 2000));
    const elapsed = Math.round((Date.now() - observeStart) / 1000);
    console.log("  观察中... " + elapsed + "/" + OBSERVE_SECONDS +
                "s | WS: " + wsConnections.length +
                " | XHR/Fetch: " + xhrFetchRecords.length);
  }

  // ========== 输出结果 ==========

  console.log("\n");
  console.log("=== 发现 WebSocket ===");
  if (wsConnections.length > 0) {
    for (let i = 0; i < wsConnections.length; i++) {
      const ws = wsConnections[i];
      console.log("");
      console.log("[" + (i + 1) + "] URL: " + ws.url);
      console.log("    Headers:");
      for (const [key, value] of Object.entries(ws.headers)) {
        console.log("      " + key + ": " + value);
      }
    }
  } else {
    console.log("(未发现 WebSocket 连接)");
  }

  console.log("");
  console.log("=== 发现 XHR/Fetch ===");

  if (xhrFetchRecords.length > 0) {
    // 先输出实时相关的请求
    const realtimeRecords = xhrFetchRecords.filter(r => r.isRealtime);
    const normalRecords = xhrFetchRecords.filter(r => !r.isRealtime);

    if (realtimeRecords.length > 0) {
      console.log("");
      console.log("--- 【重点】含实时数据关键词的请求 ---");
      for (let i = 0; i < realtimeRecords.length; i++) {
        const r = realtimeRecords[i];
        console.log("");
        console.log("[" + (i + 1) + "] [" + r.method + "] " + r.url);
        console.log("    Status: " + r.status);
        console.log("    Response Preview: " + r.responsePreview);
      }
    }

    console.log("");
    console.log("--- 全部 XHR/Fetch 请求列表 ---");
    for (let i = 0; i < xhrFetchRecords.length; i++) {
      const r = xhrFetchRecords[i];
      const marker = r.isRealtime ? " ★" : "";
      console.log("");
      console.log("[" + (i + 1) + "]" + marker + " [" + r.method + "] " + r.url);
      console.log("    Response Preview: " + r.responsePreview);
    }
  } else {
    console.log("(未发现 XHR/Fetch 请求)");
  }

  // ========== 验证总结 ==========
  console.log("");
  console.log("============================================================");
  console.log("  探索总结");
  console.log("============================================================");
  console.log("  WebSocket 连接数: " + wsConnections.length);
  console.log("  XHR/Fetch 请求数: " + xhrFetchRecords.length);
  console.log("  含实时关键词的请求: " + xhrFetchRecords.filter(r => r.isRealtime).length);

  const hasWss = wsConnections.some(ws => ws.url.startsWith("wss://"));
  const hasTimelineDelta = xhrFetchRecords.some(r =>
    r.url.toLowerCase().includes("timelinedelta") ||
    r.responsePreview.toLowerCase().includes("timelinedelta")
  );

  console.log("");
  console.log("  验证结果:");
  console.log("    - 发现 wss:// 连接: " + (hasWss ? "YES → 存在实时推送可能性" : "NO"));
  console.log("    - 发现 match_timelinedelta 请求: " + (hasTimelineDelta ? "YES → 存在增量更新机制" : "NO"));

  if (hasWss) {
    console.log("");
    console.log("  >> 建议：WebSocket 连接可用于实时比分/事件推送订阅");
  }
  if (hasTimelineDelta) {
    console.log("  >> 建议：match_timelinedelta 端点可用于轮询获取增量更新");
  }
  if (!hasWss && !hasTimelineDelta) {
    console.log("");
    console.log("  >> 提示：当前时段可能无进行中的比赛，或数据通过其他方式传输");
  }

  // ========== 关闭浏览器 ==========
  console.log("\n关闭浏览器...");
  await browser.close();
  console.log("完成！\n");
}

// 运行
main().catch((err) => {
  console.error("脚本执行出错:", err.message);
  console.error(err.stack);
  process.exit(1);
});
