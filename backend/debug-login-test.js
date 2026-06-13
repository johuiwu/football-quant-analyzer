#!/usr/bin/env node
// ================================================================
// debug-login-test.js — 精确测试登录 + 数据获取全链路
// ================================================================

import puppeteer from "puppeteer-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";

puppeteer.use(StealthPlugin());

const HG_URL = "https://www.hga038.com";
const USERNAME = process.env.HG_USERNAME || "johui888";
const PASSWORD = process.env.HG_PASSWORD || "aa123123";
const HEADLESS = process.env.HEADLESS === "true";

async function main() {
  console.log("=== 登录 + 数据获取全链路测试 ===");

  const browser = await puppeteer.launch({
    headless: HEADLESS,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage", "--window-size=1920,1400"],
    timeout: 60000,
  });

  const page = await browser.newPage();
  await page.setUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36");
  await page.setViewport({ width: 1920, height: 1400 });
  await page.evaluateOnNewDocument(() => {
    Object.defineProperty(navigator, "webdriver", { get: () => false });
  });

  // ====== 1. 导航 ======
  console.log("[1] 导航到 " + HG_URL);
  await page.goto(HG_URL, { waitUntil: "domcontentloaded", timeout: 60000 });
  await new Promise(r => setTimeout(r, 5000));

  // 截图看当前页面状态
  await page.screenshot({ path: "debug/step1_initial.png" });

  // 检查当前页面内容
  const pageState1 = await page.evaluate(() => {
    return {
      url: location.href,
      title: document.title,
      bodyLength: (document.body?.textContent || "").length,
      hasLoginForm: !!document.querySelector("#usr"),
      hasInPlay: (document.body?.textContent || "").includes("In-Play"),
      hasSoccer: (document.body?.textContent || "").includes("Soccer"),
      bodyFirst500: (document.body?.textContent || "").substring(0, 500),
    };
  });
  console.log("[1] 页面状态: url=" + pageState1.url + " hasLogin=" + pageState1.hasLoginForm + " hasInPlay=" + pageState1.hasInPlay + " hasSoccer=" + pageState1.hasSoccer);

  // ====== 2. 登录 ======
  console.log("\n[2] 登录");
  if (pageState1.hasLoginForm) {
    await page.evaluate((u, p) => {
      const usr = document.querySelector("#usr") || document.querySelector("input[type='text']");
      const pwd = document.querySelector("#pwd") || document.querySelector("input[type='password']");
      if (usr) { usr.value = u; usr.dispatchEvent(new Event("input", { bubbles: true })); }
      if (pwd) { pwd.value = p; pwd.dispatchEvent(new Event("input", { bubbles: true })); }
    }, USERNAME, PASSWORD);
    await new Promise(r => setTimeout(r, 500));
    await page.evaluate(() => {
      const btn = document.querySelector("#btn_login") || document.querySelector("input[type='button']");
      if (btn) btn.click();
    });
    console.log("[2] 已点击登录按钮");
  }

  // 等待登录完成（最多 90 秒）
  let loginOk = false;
  for (let i = 0; i < 90; i++) {
    await new Promise(r => setTimeout(r, 1000));
    
    // 处理弹窗
    try {
      await page.evaluate(() => {
        // 简易密码页面
        const backBtn = document.getElementById("back_login");
        if (backBtn && backBtn.offsetParent !== null) {
          backBtn.click();
        }
        // 取消弹窗
        for (const sel of [".btn_cancel", "#C_no_btn", "#no_btn"]) {
          const btn = document.querySelector(sel);
          if (btn && btn.offsetParent !== null) btn.click();
        }
        // 确认弹窗
        for (const sel of ["#kick_ok_btn", "#C_ok_btn", "#ok_btn"]) {
          const btn = document.querySelector(sel);
          if (btn && btn.offsetParent !== null) btn.click();
        }
      });
    } catch (e) {}

    const state = await page.evaluate(() => {
      const bodyText = document.body?.textContent || "";
      const hasInPlay = bodyText.includes("In-Play");
      const hasSoccer = bodyText.includes("Soccer");
      const hasSportNav = !!(document.getElementById("symbol_ft") || document.getElementById("old_ft_live_league") || document.getElementById("live_page") || document.getElementById("today_page"));
      const hasLoginBtn = !!document.querySelector("#btn_login");
      const hasPasscode = !!document.getElementById("back_login");
      const hasKick = !!document.getElementById("kick_ok_btn");
      return { hasInPlay, hasSoccer, hasSportNav, hasLoginBtn, hasPasscode, hasKick };
    });

    if (state.hasInPlay || state.hasSportNav) {
      console.log("[2] 登录成功! InPlay=" + state.hasInPlay + " SportNav=" + state.hasSportNav);
      loginOk = true;
      break;
    }

    if (i % 15 === 14) {
      console.log("[2] 等待登录... (" + (i + 1) + "s) InPlay=" + state.hasInPlay + " LoginBtn=" + state.hasLoginBtn + " Passcode=" + state.hasPasscode + " Kick=" + state.hasKick);
      await page.screenshot({ path: "debug/step2_login_" + i + ".png" });
    }
  }

  if (!loginOk) {
    console.log("[2] 登录失败！");
    await page.screenshot({ path: "debug/step2_login_failed.png" });
    const bodyText = await page.evaluate(() => (document.body?.textContent || "").substring(0, 1000));
    console.log("[2] 页面内容: " + bodyText);
    await browser.close();
    return;
  }

  await new Promise(r => setTimeout(r, 3000));
  await page.screenshot({ path: "debug/step2_logged_in.png" });

  // ====== 3. 检查 uid/ver ======
  console.log("\n[3] 检查 uid/ver");
  const params = await page.evaluate(() => {
    return {
      uid: typeof top !== "undefined" && top.uid ? top.uid : (typeof uid !== "undefined" ? uid : ""),
      ver: typeof top !== "undefined" && top.ver ? top.ver : (typeof ver !== "undefined" ? ver : ""),
    };
  });
  console.log("[3] uid=" + (params.uid ? params.uid.substring(0, 16) + "..." : "MISSING") + " ver=" + (params.ver ? params.ver.substring(0, 16) + "..." : "MISSING"));

  // ====== 4. 检查页面标签 ======
  console.log("\n[4] 检查页面标签");
  const tabInfo = await page.evaluate(() => {
    const result = {};
    // 查找所有可能的标签元素
    const allIds = ["live_page", "today_page", "old_ft_live_league", "symbol_ft", "tab_re", "tab_pd", "tab_rnou", "tab_cn"];
    for (const id of allIds) {
      const el = document.getElementById(id);
      result[id] = el ? { exists: true, visible: el.offsetParent !== null, text: (el.textContent || "").trim().substring(0, 30) } : { exists: false };
    }
    // 也查找所有 tab_ 开头的元素
    const tabEls = document.querySelectorAll("[id^='tab_']");
    result._allTabs = Array.from(tabEls).map(t => t.id + ":" + (t.textContent || "").trim().substring(0, 20));
    return result;
  });
  for (const [id, info] of Object.entries(tabInfo)) {
    if (id === "_allTabs") {
      console.log("[4] 所有 tab 元素: " + JSON.stringify(info));
    } else {
      console.log("[4] " + id + ": exists=" + info.exists + (info.exists ? " visible=" + info.visible + " text='" + info.text + "'" : ""));
    }
  }

  // ====== 5. 设置拦截器 + 点击 Soccer ======
  console.log("\n[5] 设置拦截器 + 点击 Soccer");

  const capturedSoccer = await new Promise((resolve) => {
    const results = {};
    let handler = null;
    let timer = null;

    const cleanup = () => {
      if (handler) page.off("response", handler);
      if (timer) clearTimeout(timer);
    };

    timer = setTimeout(() => { cleanup(); resolve(results); }, 20000);

    handler = async (response) => {
      const url = response.url();
      if (!url.includes("transform.php") && !url.includes("transform_nl.php")) return;
      try {
        const request = response.request();
        const postData = request.postData() || "";
        const pMatch = postData.match(/p=([^&]+)/);
        const rtypeMatch = postData.match(/rtype=([^&]+)/);
        const pValue = pMatch ? pMatch[1] : "unknown";
        const rtype = rtypeMatch ? rtypeMatch[1] : "unknown";
        const body = await response.text();
        const key = pValue + "_" + rtype;
        console.log("[5] 拦截: " + key + " size=" + body.length);
        results[key] = { pValue, rtype, size: body.length, hasOriginal: body.includes("<original>"), body: body };
      } catch (e) {}
    };

    page.on("response", handler);

    // 点击 Soccer
    page.evaluate(() => {
      const btn = document.getElementById("old_ft_live_league") || document.getElementById("symbol_ft");
      if (btn) btn.click();
    }).catch(e => console.log("[5] 点击失败: " + e.message));
  });

  console.log("[5] Soccer 点击后捕获:");
  for (const [key, val] of Object.entries(capturedSoccer)) {
    console.log("  " + key + ": " + val.size + " bytes, hasOriginal=" + val.hasOriginal);
    if (val.hasOriginal) {
      const jsonMatch = val.body.match(/<original>([\s\S]*?)<\/original>/);
      if (jsonMatch) {
        try {
          const d = JSON.parse(jsonMatch[1].trim());
          const gameKeys = Object.keys(d).filter(k => k.startsWith("GAME_"));
          console.log("    → " + gameKeys.length + " 场比赛, 第一场: " + (d[gameKeys[0]]?.TEAM_H || "?") + " vs " + (d[gameKeys[0]]?.TEAM_C || "?"));
        } catch (e) { console.log("    → JSON 解析失败: " + e.message); }
      }
    }
  }

  // ====== 6. 点击 Corners ======
  console.log("\n[6] 设置拦截器 + 点击 Corners");
  await new Promise(r => setTimeout(r, 2000));

  const capturedCorners = await new Promise((resolve) => {
    const results = {};
    let handler = null;
    let timer = null;

    const cleanup = () => {
      if (handler) page.off("response", handler);
      if (timer) clearTimeout(timer);
    };

    timer = setTimeout(() => { cleanup(); resolve(results); }, 20000);

    handler = async (response) => {
      const url = response.url();
      if (!url.includes("transform.php") && !url.includes("transform_nl.php")) return;
      try {
        const request = response.request();
        const postData = request.postData() || "";
        const pMatch = postData.match(/p=([^&]+)/);
        const rtypeMatch = postData.match(/rtype=([^&]+)/);
        const pValue = pMatch ? pMatch[1] : "unknown";
        const rtype = rtypeMatch ? rtypeMatch[1] : "unknown";
        const body = await response.text();
        const key = pValue + "_" + rtype;
        console.log("[6] 拦截: " + key + " size=" + body.length);
        results[key] = { pValue, rtype, size: body.length, hasOriginal: body.includes("<original>"), body: body };
      } catch (e) {}
    };

    page.on("response", handler);

    // 点击 Corners
    page.evaluate(() => {
      const tab = document.getElementById("tab_cn");
      if (tab) tab.click();
    }).catch(e => console.log("[6] 点击失败: " + e.message));
  });

  console.log("[6] Corners 点击后捕获:");
  for (const [key, val] of Object.entries(capturedCorners)) {
    console.log("  " + key + ": " + val.size + " bytes, hasOriginal=" + val.hasOriginal);
    if (val.hasOriginal) {
      const jsonMatch = val.body.match(/<original>([\s\S]*?)<\/original>/);
      if (jsonMatch) {
        try {
          const d = JSON.parse(jsonMatch[1].trim());
          const gameKeys = Object.keys(d).filter(k => k.startsWith("GAME_"));
          console.log("    → " + gameKeys.length + " 场比赛");
          if (gameKeys.length > 0) {
            const g0 = d[gameKeys[0]];
            console.log("    → " + g0.TEAM_H + " vs " + g0.TEAM_C + " | IOR_RNCH=" + g0.IOR_RNCH + " RATIO_RE=" + g0.RATIO_RE + " RATIO_ROUO=" + g0.RATIO_ROUO + " PTYPE=" + g0.PTYPE);
          }
        } catch (e) { console.log("    → JSON 解析失败: " + e.message); }
      }
    }
  }

  // ====== 7. 测试 fetchInBrowser ======
  console.log("\n[7] 测试 fetchInBrowser (page.evaluate + fetch)");
  if (params.uid && params.ver) {
    const fetchResult = await page.evaluate(async ({ uid, ver }) => {
      try {
        const ts = Date.now();
        const body = new URLSearchParams({
          uid: uid, ver: ver, langx: "en-us",
          p: "get_game_list", gtype: "ft",
          showtype: "live", rtype: "rcn", ltype: "3",
          sorttype: "L", ts: String(ts), chgSortTS: String(ts),
        });
        const url = "https://www.hga038.com/app/member/transform.php?ver=" + encodeURIComponent(ver);
        const resp = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded", "X-Requested-With": "XMLHttpRequest" },
          credentials: "include",
          body: body.toString(),
        });
        const text = await resp.text();
        return { length: text.length, first200: text.substring(0, 200), isVariableStandard: text === "VariableStandard" || text.trim() === "VariableStandard" };
      } catch (e) { return { error: e.message }; }
    }, params);
    console.log("[7] fetchInBrowser: length=" + fetchResult.length + " isVariableStandard=" + fetchResult.isVariableStandard);
    console.log("[7] first200: " + fetchResult.first200);
  } else {
    console.log("[7] uid/ver 缺失，跳过");
  }

  console.log("\n=== 测试完成 ===");
  await browser.close();
}

main().catch(err => { console.error("错误:", err.message); process.exit(1); });
