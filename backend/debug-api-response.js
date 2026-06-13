#!/usr/bin/env node
// ================================================================
// debug-api-response.js — 登录 hga038.com 后通过响应拦截捕获
//                         transform.php 的完整响应体
//
// 旧方案: page.evaluate + fetch() → 返回 "VariableStandard"
//         （ver 签名过期或请求上下文错误）
// 新方案: 在导航前设置 page.on('response') 拦截器，
//         让页面自然发出 XHR 请求，被动捕获真实响应
//
// 运行方式：node debug-api-response.js
// 环境变量：HG_USERNAME / HG_PASSWORD / HEADLESS
// ================================================================

import puppeteer from "puppeteer-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";
import fs from "fs";
import path from "path";

puppeteer.use(StealthPlugin());

// ======================== 配置 ========================
const HG_URL = "https://www.hga038.com";
const USERNAME = process.env.HG_USERNAME || "johui888";
const PASSWORD = process.env.HG_PASSWORD || "aa123123";
const HEADLESS = process.env.HEADLESS === "true";
const OUTPUT_DIR = "debug_api_discovery";

// ======================== 主流程 ========================

async function main() {
  console.log("=".repeat(60));
  console.log("  HGA API 响应调试工具（响应拦截模式）");
  console.log("  目标: " + HG_URL);
  console.log("  时间: " + new Date().toLocaleString());
  console.log("=".repeat(60));

  // 创建输出目录
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  // ========== 1. 启动浏览器 ==========
  console.log("\n[1/6] 启动浏览器 (headless=" + HEADLESS + ")...");
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

  // ========== 2. 设置响应拦截（在导航之前） ==========
  console.log("\n[2/6] 设置响应拦截器...");
  const capturedResponses = {};

  page.on("response", async (response) => {
    const url = response.url();
    if (url.includes("transform.php") || url.includes("transform_nl.php")) {
      try {
        const contentType = response.headers()["content-type"] || "";
        const status = response.status();
        let body;
        try { body = await response.text(); } catch (e) { body = "[read failed]"; }

        // 从请求中提取 p= 参数
        const request = response.request();
        const postData = request.postData() || "";
        const pMatch = postData.match(/p=([^&]+)/);
        const pValue = pMatch ? pMatch[1] : "unknown";

        // 提取 rtype
        const rtypeMatch = postData.match(/rtype=([^&]+)/);
        const rtype = rtypeMatch ? rtypeMatch[1] : "unknown";

        const key = `${pValue}_${rtype}`;
        capturedResponses[key] = {
          url,
          method: request.method(),
          postData,
          contentType,
          status,
          bodyLength: body.length,
          body,
        };
        console.log(`[拦截] ${key}: ${body.length} bytes, type=${contentType}, status=${status}`);
      } catch (e) {
        // 忽略拦截过程中的错误
      }
    }
  });

  // ========== 3. 导航 + 登录 ==========
  console.log("\n[3/6] 导航到 " + HG_URL + " ...");
  await page.goto(HG_URL, { waitUntil: "domcontentloaded", timeout: 60000 });
  await new Promise((r) => setTimeout(r, 5000));

  // 等待登录表单
  console.log("  自动登录 (用户: " + USERNAME + ")...");
  try {
    await page.waitForSelector("#usr", { timeout: 15000 });
  } catch (e) {
    console.log("  未找到 #usr 输入框，可能已登录或页面结构变化");
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

  // 等待登录完成
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
        const cancelBtns = document.querySelectorAll(".btn_cancel, #C_no_btn, #no_btn");
        for (const btn of cancelBtns) {
          const style = getComputedStyle(btn);
          if (style.display !== "none" && style.visibility !== "hidden") {
            btn.click();
          }
        }
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
    console.log("  登录超时，继续尝试捕获响应...");
  }

  // 等待页面稳定
  await new Promise((r) => setTimeout(r, 3000));

  // ========== 4. 导航到 In-Play → Soccer ==========
  console.log("\n[4/6] 导航到 In-Play → Soccer ...");

  // 点击 In-Play
  try {
    await page.evaluate(() => {
      const tab = document.getElementById("live_page");
      if (tab) tab.click();
    });
    await new Promise((r) => setTimeout(r, 3000));
  } catch (e) {
    console.log("  点击 In-Play 失败: " + e.message);
  }

  // 点击 Soccer
  try {
    await page.evaluate(() => {
      const btn = document.getElementById("old_ft_live_league") || document.getElementById("symbol_ft");
      if (btn) { btn.scrollIntoView({ block: "center" }); btn.click(); }
    });
    await new Promise((r) => setTimeout(r, 5000));
  } catch (e) {
    console.log("  点击 Soccer 失败: " + e.message);
  }

  // 等待所有 transform.php XHR 请求完成
  console.log("  等待 XHR 请求完成 (15秒)...");
  await new Promise((r) => setTimeout(r, 15000));

  // ========== 5. 点击 HDP & O/U 和 Corners 标签 ==========
  console.log("\n[5/6] 点击 HDP & O/U 和 Corners 标签...");

  // 点击 HDP & O/U
  try {
    await page.evaluate(() => {
      const tab = document.getElementById("tab_rnou");
      if (tab) tab.click();
    });
    console.log("  已点击 #tab_rnou (HDP & O/U)");
  } catch (e) {
    console.log("  点击 #tab_rnou 失败: " + e.message);
  }
  await new Promise((r) => setTimeout(r, 5000));

  // 点击 Corners
  try {
    await page.evaluate(() => {
      const tab = document.getElementById("tab_cn");
      if (tab) tab.click();
    });
    console.log("  已点击 #tab_cn (Corners)");
  } catch (e) {
    console.log("  点击 #tab_cn 失败: " + e.message);
  }
  await new Promise((r) => setTimeout(r, 5000));

  // 等待更多 XHR 请求
  console.log("  等待更多 XHR 请求 (10秒)...");
  await new Promise((r) => setTimeout(r, 10000));

  // ========== 6. 保存所有捕获的响应 ==========
  console.log("\n[6/6] 保存捕获的响应...");
  const keys = Object.keys(capturedResponses);

  if (keys.length === 0) {
    console.log("  未捕获到任何 transform.php 响应！");
  } else {
    console.log("  共捕获 " + keys.length + " 个响应\n");
  }

  for (const key of keys) {
    const resp = capturedResponses[key];

    // 根据内容类型决定文件扩展名
    const isXml = resp.contentType.includes("xml") || resp.body.trimStart().startsWith("<?xml") || resp.body.trimStart().startsWith("<");
    const ext = isXml ? "xml" : "html";
    const filename = `${key}.${ext}`;
    const filePath = path.join(OUTPUT_DIR, filename);

    // 保存文件
    fs.writeFileSync(filePath, resp.body, "utf-8");

    // 打印摘要
    console.log("  " + "─".repeat(50));
    console.log("  键名: " + key);
    console.log("  URL: " + resp.url);
    console.log("  方法: " + resp.method);
    console.log("  请求体: " + resp.postData.substring(0, 200));
    console.log("  内容类型: " + resp.contentType);
    console.log("  状态码: " + resp.status);
    console.log("  大小: " + resp.bodyLength + " bytes");
    console.log("  保存到: " + filePath);
    console.log("  前500字符:");
    console.log("  " + resp.body.substring(0, 500).replace(/\n/g, "\n  "));
  }

  // ========== 汇总 ==========
  console.log("\n" + "=".repeat(60));
  console.log("  响应拦截汇总");
  console.log("=".repeat(60));
  console.log("  捕获总数: " + keys.length);

  for (const key of keys) {
    const resp = capturedResponses[key];
    console.log(`    ${key}: ${resp.bodyLength} bytes, status=${resp.status}, type=${resp.contentType}`);
  }

  console.log("\n" + "=".repeat(60));
  console.log("  完成！所有响应已保存到 " + OUTPUT_DIR + "/");
  console.log("=".repeat(60));

  // 关闭浏览器
  await browser.close();
}

main().catch((err) => {
  console.error("脚本执行出错:", err.message);
  console.error(err.stack);
  process.exit(1);
});
