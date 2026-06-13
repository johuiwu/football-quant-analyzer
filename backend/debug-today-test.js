#!/usr/bin/env node
// 验证 showtype=today 能否获取角球数据
import puppeteer from "puppeteer-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";

puppeteer.use(StealthPlugin());

const HG_URL = "https://www.hga038.com";
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
  await page.evaluateOnNewDocument(() => { Object.defineProperty(navigator, "webdriver", { get: () => false }); });

  // 导航 + 登录
  console.log("[1] 导航 + 登录");
  await page.goto(HG_URL, { waitUntil: "domcontentloaded", timeout: 60000 });
  await new Promise(r => setTimeout(r, 5000));
  await page.evaluate((u, p) => {
    const usr = document.querySelector("#usr"); const pwd = document.querySelector("#pwd");
    if (usr) { usr.value = u; usr.dispatchEvent(new Event("input", { bubbles: true })); }
    if (pwd) { pwd.value = p; pwd.dispatchEvent(new Event("input", { bubbles: true })); }
    setTimeout(() => { const btn = document.querySelector("#btn_login"); if (btn) btn.click(); }, 500);
  }, USERNAME, PASSWORD);
  for (let i = 0; i < 90; i++) {
    await new Promise(r => setTimeout(r, 1000));
    try { await page.evaluate(() => { const b = document.getElementById("back_login"); if (b && b.offsetParent !== null) b.click(); for (const s of [".btn_cancel","#C_no_btn","#no_btn"]) { const e = document.querySelector(s); if (e && e.offsetParent !== null) e.click(); } for (const s of ["#kick_ok_btn","#C_ok_btn"]) { const e = document.querySelector(s); if (e && e.offsetParent !== null) e.click(); } }); } catch(e) {}
    const ok = await page.evaluate(() => !!(document.getElementById("live_page") || document.getElementById("today_page")));
    if (ok) { console.log("[1] 登录成功"); break; }
  }
  await new Promise(r => setTimeout(r, 3000));

  // 检查 uid
  const uidInfo = await page.evaluate(() => ({
    top_uid: typeof top !== "undefined" && top.uid ? top.uid : "",
    top_ver: typeof top !== "undefined" && top.ver ? top.ver : "",
    chk_uid: typeof globalThis !== "undefined" && globalThis.HG_UID ? globalThis.HG_UID : "",
  }));
  console.log("[2] uid=" + (uidInfo.top_uid || "MISSING") + " ver=" + (uidInfo.top_ver ? uidInfo.top_ver.substring(0,16) + "..." : "MISSING"));

  // 设置全局拦截器
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
      allCaptured[key] = { pValue, rtype, size: body.length, body, postData };
      console.log("[拦截] " + key + ": " + body.length + " bytes" + (body.length <= 50 ? " → " + body : ""));
    } catch (e) {}
  });

  // ====== 点击 Today 标签 ======
  console.log("\n[3] 点击 Today 标签");
  await page.evaluate(() => { const t = document.getElementById("today_page"); if (t) t.click(); });
  await new Promise(r => setTimeout(r, 5000));

  // ====== 点击 Soccer ======
  console.log("[4] 点击 Soccer");
  await page.evaluate(() => { const b = document.getElementById("old_ft_live_league"); if (b) b.click(); });
  await new Promise(r => setTimeout(r, 8000));

  // 检查 tab_cn
  const tabs = await page.evaluate(() => {
    const tabEls = document.querySelectorAll("[id^='tab_']");
    return Array.from(tabEls).map(t => t.id + ":" + (t.textContent || "").trim().substring(0, 20));
  });
  console.log("[4] 标签: " + JSON.stringify(tabs));

  // ====== 点击 Corners ======
  console.log("[5] 点击 Corners");
  const cnClicked = await page.evaluate(() => { const t = document.getElementById("tab_cn"); if (t) { t.click(); return true; } return false; });
  console.log("[5] tab_cn 点击: " + cnClicked);
  await new Promise(r => setTimeout(r, 8000));

  // ====== 分析捕获结果 ======
  console.log("\n[6] 分析捕获结果");
  for (const [key, val] of Object.entries(allCaptured)) {
    console.log("\n--- " + key + " (" + val.size + " bytes) ---");
    console.log("  postData: " + val.postData.substring(0, 300));
    if (val.size <= 100) {
      console.log("  完整: " + val.body);
    } else if (val.body.includes("<original>")) {
      const jsonMatch = val.body.match(/<original>([\s\S]*?)<\/original>/);
      if (jsonMatch) {
        try {
          const d = JSON.parse(jsonMatch[1].trim());
          const gameKeys = Object.keys(d).filter(k => k.startsWith("GAME_"));
          console.log("  → JSON: " + gameKeys.length + " 场比赛");
          if (gameKeys.length > 0) {
            const g0 = d[gameKeys[0]];
            console.log("  → " + g0.TEAM_H + " vs " + g0.TEAM_C + " | PTYPE=" + g0.PTYPE + " | IOR_RNCH=" + g0.IOR_RNCH + " | RATIO_RE=" + g0.RATIO_RE + " | RATIO_ROUO=" + g0.RATIO_ROUO);
          }
        } catch (e) { console.log("  → JSON 解析失败: " + e.message); }
      }
    } else {
      console.log("  前300: " + val.body.substring(0, 300));
    }
  }

  console.log("\n=== 完成 ===");
  await browser.close();
}

main().catch(err => { console.error("错误:", err.message); process.exit(1); });
