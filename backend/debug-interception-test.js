#!/usr/bin/env node
// ================================================================
// debug-interception-test.js — 精确测试 fetchViaInterception 能否捕获数据
//
// 运行方式：node debug-interception-test.js
// 环境变量：HG_USERNAME / HG_PASSWORD / HEADLESS
// ================================================================

import puppeteer from "puppeteer-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";
import fs from "fs";

puppeteer.use(StealthPlugin());

const HG_URL = "https://www.hga038.com";
const USERNAME = process.env.HG_USERNAME || "johui888";
const PASSWORD = process.env.HG_PASSWORD || "aa123123";
const HEADLESS = process.env.HEADLESS === "true";

async function main() {
  console.log("=== fetchViaInterception 精确测试 ===");

  const browser = await puppeteer.launch({
    headless: HEADLESS,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage", "--window-size=1920,1400"],
    timeout: 60000,
  });

  const page = await browser.newPage();
  await page.setUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36");
  await page.setViewport({ width: 1920, height: 1400 });

  // ====== 1. 导航 + 登录 ======
  console.log("[1] 导航到 " + HG_URL);
  await page.goto(HG_URL, { waitUntil: "domcontentloaded", timeout: 60000 });
  await new Promise(r => setTimeout(r, 5000));

  // 登录
  try {
    await page.waitForSelector("#usr", { timeout: 15000 });
    await page.evaluate((u, p) => {
      const usr = document.querySelector("#usr");
      const pwd = document.querySelector("#pwd");
      if (usr) { usr.value = u; usr.dispatchEvent(new Event("input", { bubbles: true })); }
      if (pwd) { pwd.value = p; pwd.dispatchEvent(new Event("input", { bubbles: true })); }
      setTimeout(() => { const btn = document.querySelector("#btn_login"); if (btn) btn.click(); }, 500);
    }, USERNAME, PASSWORD);
    console.log("[1] 已填写凭据并点击登录");
  } catch (e) {
    console.log("[1] 未找到登录表单，可能已登录");
  }

  // 等待登录完成
  for (let i = 0; i < 60; i++) {
    await new Promise(r => setTimeout(r, 1000));
    const loggedIn = await page.evaluate(() => {
      return !!(document.getElementById("today_page") || document.getElementById("live_page"));
    });
    if (loggedIn) { console.log("[1] 登录成功"); break; }
    if (i % 10 === 9) console.log("[1] 等待登录... (" + (i + 1) + "s)");
  }
  await new Promise(r => setTimeout(r, 3000));

  // ====== 2. 测试 fetchViaInterception 拦截逻辑 ======
  console.log("\n[2] 测试 fetchViaInterception 拦截逻辑");

  // 先检查页面上有哪些标签
  const tabInfo = await page.evaluate(() => {
    const tabs = {};
    const ids = ["live_page", "today_page", "old_ft_live_league", "symbol_ft", "tab_re", "tab_pd", "tab_rnou", "tab_cn"];
    for (const id of ids) {
      const el = document.getElementById(id);
      tabs[id] = el ? { exists: true, visible: el.offsetParent !== null, text: (el.textContent || "").trim().substring(0, 30) } : { exists: false };
    }
    return tabs;
  });
  console.log("[2] 页面标签状态:");
  for (const [id, info] of Object.entries(tabInfo)) {
    console.log("  " + id + ": exists=" + info.exists + (info.exists ? " visible=" + info.visible + " text='" + info.text + "'" : ""));
  }

  // ====== 3. 设置拦截器 + 点击 Soccer 标签 ======
  console.log("\n[3] 设置拦截器 + 点击 Soccer 标签");

  const capturedRb = await new Promise((resolve) => {
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

        console.log("[3] 拦截: p=" + pValue + " rtype=" + rtype + " size=" + body.length + " url=" + url.substring(0, 80));

        // 保存所有拦截到的响应
        const key = pValue + "_" + rtype;
        results[key] = { pValue, rtype, size: body.length, body: body.substring(0, 500), fullBody: body };
      } catch (e) {
        console.log("[3] 拦截读取失败: " + e.message);
      }
    };

    page.on("response", handler);

    // 点击 Soccer 标签
    (async () => {
      try {
        await page.evaluate(() => {
          const btn = document.getElementById("old_ft_live_league") || document.getElementById("symbol_ft");
          if (btn) { console.log("点击 Soccer 标签"); btn.click(); }
          else { console.log("未找到 Soccer 标签按钮"); }
        });
      } catch (e) { console.log("点击失败: " + e.message); }
    })();
  });

  console.log("\n[3] Soccer 标签点击后捕获到的响应:");
  for (const [key, val] of Object.entries(capturedRb)) {
    console.log("  " + key + ": " + val.size + " bytes");
    // 检查是否有 <original> 标签
    if (val.fullBody.includes("<original>")) {
      console.log("    → 包含 <original> 标签 ✓");
      const jsonMatch = val.fullBody.match(/<original>([\s\S]*?)<\/original>/);
      if (jsonMatch) {
        try {
          const d = JSON.parse(jsonMatch[1].trim());
          const gameKeys = Object.keys(d).filter(k => k.startsWith("GAME_"));
          console.log("    → JSON 解析成功: " + gameKeys.length + " 场比赛");
          if (gameKeys.length > 0) {
            const g0 = d[gameKeys[0]];
            console.log("    → 第一场: " + g0.TEAM_H + " vs " + g0.TEAM_C + " | LEAGUE=" + g0.LEAGUE + " | PTYPE=" + g0.PTYPE);
          }
        } catch (e) {
          console.log("    → JSON 解析失败: " + e.message);
          console.log("    → JSON 前200字符: " + jsonMatch[1].substring(0, 200));
        }
      }
    } else {
      console.log("    → 不包含 <original> 标签 ✗");
      console.log("    → 前200字符: " + val.body.substring(0, 200));
    }
  }

  // ====== 4. 点击 Corners 标签 ======
  console.log("\n[4] 设置拦截器 + 点击 Corners 标签");

  const capturedCn = await new Promise((resolve) => {
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

        console.log("[4] 拦截: p=" + pValue + " rtype=" + rtype + " size=" + body.length);

        const key = pValue + "_" + rtype;
        results[key] = { pValue, rtype, size: body.length, body: body.substring(0, 500), fullBody: body };
      } catch (e) {}
    };

    page.on("response", handler);

    // 点击 Corners 标签
    (async () => {
      try {
        // 先检查 tab_cn 是否存在
        const cnExists = await page.evaluate(() => !!document.getElementById("tab_cn"));
        console.log("[4] tab_cn 存在: " + cnExists);

        if (cnExists) {
          await page.evaluate(() => {
            const tab = document.getElementById("tab_cn");
            if (tab) tab.click();
          });
          console.log("[4] 已点击 tab_cn");
        } else {
          // 尝试查找其他角球标签
          const altTabs = await page.evaluate(() => {
            const allTabs = document.querySelectorAll("[id^='tab_']");
            return Array.from(allTabs).map(t => t.id + ":" + (t.textContent || "").trim().substring(0, 20));
          });
          console.log("[4] tab_cn 不存在，页面上的 tab 元素: " + JSON.stringify(altTabs));
        }
      } catch (e) { console.log("[4] 点击失败: " + e.message); }
    })();
  });

  console.log("\n[4] Corners 标签点击后捕获到的响应:");
  for (const [key, val] of Object.entries(capturedCn)) {
    console.log("  " + key + ": " + val.size + " bytes");
    if (val.fullBody.includes("<original>")) {
      console.log("    → 包含 <original> 标签 ✓");
      const jsonMatch = val.fullBody.match(/<original>([\s\S]*?)<\/original>/);
      if (jsonMatch) {
        try {
          const d = JSON.parse(jsonMatch[1].trim());
          const gameKeys = Object.keys(d).filter(k => k.startsWith("GAME_"));
          console.log("    → JSON 解析成功: " + gameKeys.length + " 场比赛");
          if (gameKeys.length > 0) {
            const g0 = d[gameKeys[0]];
            console.log("    → 第一场: " + g0.TEAM_H + " vs " + g0.TEAM_C);
            console.log("    → 角球字段: IOR_RNCH=" + g0.IOR_RNCH + " IOR_RNCC=" + g0.IOR_RNCC + " RATIO_RE=" + g0.RATIO_RE + " RATIO_ROUO=" + g0.RATIO_ROUO + " PTYPE=" + g0.PTYPE);
          }
        } catch (e) {
          console.log("    → JSON 解析失败: " + e.message);
        }
      }
    } else {
      console.log("    → 不包含 <original> 标签 ✗");
      console.log("    → 前200字符: " + val.body.substring(0, 200));
    }
  }

  // ====== 5. 测试 fetchInBrowser 方式 ======
  console.log("\n[5] 测试 fetchInBrowser 方式 (page.evaluate + fetch)");

  // 获取 uid 和 ver
  const params = await page.evaluate(() => {
    return {
      uid: typeof top !== "undefined" && top.uid ? top.uid : "",
      ver: typeof top !== "undefined" && top.ver ? top.ver : "",
    };
  });
  console.log("[5] uid=" + (params.uid ? params.uid.substring(0, 16) + "..." : "MISSING") + " ver=" + (params.ver ? params.ver.substring(0, 16) + "..." : "MISSING"));

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
        return { length: text.length, first200: text.substring(0, 200), isHtml: text.includes("<!DOCTYPE"), isVariableStandard: text === "VariableStandard" };
      } catch (e) { return { error: e.message }; }
    }, params);

    console.log("[5] fetchInBrowser 结果:");
    console.log("  length=" + fetchResult.length);
    console.log("  isVariableStandard=" + fetchResult.isVariableStandard);
    console.log("  isHtml=" + fetchResult.isHtml);
    console.log("  first200=" + fetchResult.first200);
  } else {
    console.log("[5] uid/ver 缺失，无法测试 fetchInBrowser");
  }

  console.log("\n=== 测试完成 ===");
  await browser.close();
}

main().catch(err => { console.error("错误:", err.message); process.exit(1); });
