#!/usr/bin/env node
// ================================================================
// debug-response-detail.js — 详细检查各 API 响应内容
// ================================================================

import puppeteer from "puppeteer-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";
import fs from "fs";

puppeteer.use(StealthPlugin());

const HG_URL = "https://www.hga050.com";
const USERNAME = process.env.HG_USERNAME || "johui888";
const PASSWORD = process.env.HG_PASSWORD || "aa123123";

async function main() {
  const browser = await puppeteer.launch({
    headless: false,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage", "--window-size=1920,1400"],
    timeout: 60000,
  });

  const page = await browser.newPage();
  await page.setUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36");
  await page.setViewport({ width: 1920, height: 1400 });
  await page.evaluateOnNewDocument(() => {
    Object.defineProperty(navigator, "webdriver", { get: () => false });
  });

  // 导航 + 登录
  console.log("[1] 导航 + 登录");
  await page.goto(HG_URL, { waitUntil: "domcontentloaded", timeout: 60000 });
  await new Promise(r => setTimeout(r, 5000));

  await page.evaluate((u, p) => {
    const usr = document.querySelector("#usr");
    const pwd = document.querySelector("#pwd");
    if (usr) { usr.value = u; usr.dispatchEvent(new Event("input", { bubbles: true })); }
    if (pwd) { pwd.value = p; pwd.dispatchEvent(new Event("input", { bubbles: true })); }
    setTimeout(() => { const btn = document.querySelector("#btn_login"); if (btn) btn.click(); }, 500);
  }, USERNAME, PASSWORD);

  // 等待登录
  for (let i = 0; i < 90; i++) {
    await new Promise(r => setTimeout(r, 1000));
    try {
      await page.evaluate(() => {
        const backBtn = document.getElementById("back_login");
        if (backBtn && backBtn.offsetParent !== null) backBtn.click();
        for (const sel of [".btn_cancel", "#C_no_btn", "#no_btn"]) {
          const btn = document.querySelector(sel);
          if (btn && btn.offsetParent !== null) btn.click();
        }
        for (const sel of ["#kick_ok_btn", "#C_ok_btn"]) {
          const btn = document.querySelector(sel);
          if (btn && btn.offsetParent !== null) btn.click();
        }
      });
    } catch (e) {}
    const ok = await page.evaluate(() => !!(document.getElementById("live_page") || document.getElementById("today_page")));
    if (ok) { console.log("[1] 登录成功"); break; }
  }
  await new Promise(r => setTimeout(r, 3000));

  // 检查 uid 来源
  console.log("\n[2] 检查 uid 来源");
  const uidSources = await page.evaluate(() => {
    return {
      top_uid: typeof top !== "undefined" && top.uid ? top.uid : "MISSING",
      window_uid: typeof uid !== "undefined" ? uid : "MISSING",
      top_ver: typeof top !== "undefined" && top.ver ? top.ver : "MISSING",
      // 检查 iframe 中的 uid
      iframe_count: document.querySelectorAll("iframe").length,
      // 检查 script 标签中的 uid
      scripts_with_uid: Array.from(document.querySelectorAll("script")).filter(s => s.textContent.includes("uid=")).length,
    };
  });
  console.log("[2] uid 来源: " + JSON.stringify(uidSources));

  // 设置全局拦截器，捕获所有 transform.php 响应
  const allCaptured = {};
  page.on("response", async (response) => {
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
      allCaptured[key] = { pValue, rtype, size: body.length, body };
      console.log("[拦截] " + key + ": " + body.length + " bytes");
    } catch (e) {}
  });

  // ====== 3. 点击 Soccer ======
  console.log("\n[3] 点击 Soccer");
  await page.evaluate(() => {
    const btn = document.getElementById("old_ft_live_league");
    if (btn) btn.click();
  });
  await new Promise(r => setTimeout(r, 8000));

  // 检查 Soccer 子页面的标签
  const soccerTabs = await page.evaluate(() => {
    const tabs = document.querySelectorAll("[id^='tab_']");
    return Array.from(tabs).map(t => t.id + ":" + (t.textContent || "").trim().substring(0, 20));
  });
  console.log("[3] Soccer 子页面标签: " + JSON.stringify(soccerTabs));

  // ====== 4. 点击 Corners ======
  console.log("\n[4] 点击 Corners");
  const cnClicked = await page.evaluate(() => {
    const tab = document.getElementById("tab_cn");
    if (tab) { tab.click(); return true; }
    return false;
  });
  console.log("[4] tab_cn 点击: " + cnClicked);
  await new Promise(r => setTimeout(r, 8000));

  // ====== 5. 分析所有捕获的响应 ======
  console.log("\n[5] 分析所有捕获的响应");
  for (const [key, val] of Object.entries(allCaptured)) {
    console.log("\n--- " + key + " (" + val.size + " bytes) ---");
    if (val.size <= 100) {
      console.log("  完整内容: " + val.body);
    } else {
      console.log("  前500字符: " + val.body.substring(0, 500));
    }
    // 检查 <original> 标签
    if (val.body.includes("<original>")) {
      const jsonMatch = val.body.match(/<original>([\s\S]*?)<\/original>/);
      if (jsonMatch) {
        try {
          const d = JSON.parse(jsonMatch[1].trim());
          const gameKeys = Object.keys(d).filter(k => k.startsWith("GAME_"));
          console.log("  → JSON: " + gameKeys.length + " 场比赛");
          if (gameKeys.length > 0) {
            const g0 = d[gameKeys[0]];
            console.log("  → 样本: " + g0.TEAM_H + " vs " + g0.TEAM_C + " | PTYPE=" + g0.PTYPE + " | IOR_RNCH=" + g0.IOR_RNCH + " | RATIO_RE=" + g0.RATIO_RE);
          }
        } catch (e) { console.log("  → JSON 解析失败: " + e.message); }
      }
    }
    // 检查 <game> 标签
    if (val.body.includes("<game>")) {
      const gameCount = (val.body.match(/<game[\s>]/g) || []).length;
      console.log("  → 包含 <game> 标签: " + gameCount + " 个");
    }
  }

  // 保存关键响应到文件
  const outputDir = "debug_api_discovery";
  if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });
  for (const [key, val] of Object.entries(allCaptured)) {
    if (val.size > 100) {
      const ext = val.body.includes("<?xml") || val.body.includes("<serverresponse") ? "xml" : "html";
      fs.writeFileSync(outputDir + "/" + key + "." + ext, val.body, "utf-8");
    }
  }
  console.log("\n响应已保存到 " + outputDir + "/");

  console.log("\n=== 测试完成 ===");
  await browser.close();
}

main().catch(err => { console.error("错误:", err.message); process.exit(1); });
