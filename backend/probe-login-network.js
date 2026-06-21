// ======================== 登录网络探查脚本 ========================
// 使用 Puppeteer 启动浏览器，监听登录过程中的所有网络响应，
// 探查 uid / ver 的来源（响应体、URL 参数、Cookie、JS 全局变量、script 标签）
//
// 用法: node backend/probe-login-network.js
// 前置: 无需环境变量，手动登录即可

import puppeteer from "puppeteer-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// 加载 .env 文件
dotenv.config({ path: path.resolve(__dirname, "..", ".env") });

puppeteer.use(StealthPlugin());

// ---- 配置 ----
const HG_URL = process.env.HG_URL || "https://www.hga050.com";
const REPORT_PATH = path.resolve(__dirname, "probe-report.json");

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

// ======================== 数据收集容器 ========================
const probeData = {
  responses: [],          // 所有响应记录
  uidResponses: [],       // 包含 uid 的响应
  verResponses: [],       // 包含 ver 的响应
  chkLoginResponses: [],  // chk_login 响应
  cookies: [],            // 登录后 cookie
  windowVars: [],         // window.uid / window.ver
  scriptUidPatterns: [],  // script 标签中的 uid 赋值
  summary: {},
};

/**
 * 截断长字符串，保留前后部分
 */
function truncate(str, maxLen = 500) {
  if (!str || str.length <= maxLen) return str;
  return str.substring(0, maxLen) + `...[总长度=${str.length}]`;
}

/**
 * 检查文本中是否包含关键词
 */
function containsKeyword(text, keyword) {
  if (!text) return false;
  return text.toLowerCase().includes(keyword.toLowerCase());
}

// ======================== 主流程 ========================
async function probeLoginNetwork() {
  let browser = null;
  try {
    // ---- 1. 启动浏览器（非 headless） ----
    console.log("[探查] 启动浏览器（非 headless 模式）...");
    const launchArgs = [
      "--ignore-certificate-errors",
      "--no-sandbox",
      "--disable-setuid-sandbox",
    ];
    if (process.env.PUPPETEER_PROXY) {
      launchArgs.push("--proxy-server=" + process.env.PUPPETEER_PROXY);
      launchArgs.push("--host-resolver-rules=MAP * ~NOTFOUND , EXCLUDE localhost");
    }

    const executablePath = process.env.PUPPETEER_EXECUTABLE_PATH || undefined;

    browser = await puppeteer.launch({
      headless: false,
      executablePath,
      args: launchArgs,
    });
    const page = await browser.newPage();
    console.log("[探查] 浏览器已启动 (headless=false)");

    // ---- 2. 注册 response 监听器 ----
    let responseCount = 0;

    page.on("response", async (response) => {
      const url = response.url();
      const status = response.status();
      responseCount++;

      const record = {
        index: responseCount,
        url: truncate(url, 300),
        status,
        timestamp: Date.now(),
      };

      try {
        // 尝试获取响应体（部分响应可能无法读取）
        const contentType = response.headers()["content-type"] || "";
        const isText = contentType.includes("text") ||
                       contentType.includes("json") ||
                       contentType.includes("xml") ||
                       contentType.includes("javascript") ||
                       contentType.includes("form");

        let body = null;
        if (isText) {
          try {
            body = await response.text();
            record.bodyLength = body.length;
            record.bodyPreview = truncate(body, 300);
          } catch (_) {
            record.bodyError = "无法读取响应体";
          }
        }

        // ---- 检查 chk_login ----
        if (url.includes("chk_login")) {
          const chkRecord = { ...record };
          if (body) {
            chkRecord.bodyFull = truncate(body, 2000);
            // 提取 uid 标签
            const uidXmlMatch = body.match(/<uid>([^<]+)<\/uid>/);
            if (uidXmlMatch) {
              chkRecord.uidFromXml = uidXmlMatch[1];
            }
            // 提取 JSON uid
            try {
              const json = JSON.parse(body);
              if (json.uid) chkRecord.uidFromJson = String(json.uid);
              if (json.data?.uid) chkRecord.uidFromJsonData = String(json.data.uid);
            } catch (_) {}
          }
          probeData.chkLoginResponses.push(chkRecord);
          console.log(`[探查] 发现 chk_login 响应 #${responseCount} | status=${status} | bodyLen=${record.bodyLength || "N/A"}`);
        }

        // ---- 检查包含 uid 的响应 ----
        if (containsKeyword(url, "uid") || (body && containsKeyword(body, "uid"))) {
          const uidRecord = { ...record };
          if (body) {
            // XML 标签中的 uid
            const xmlMatch = body.match(/<uid>([^<]+)<\/uid>/);
            if (xmlMatch) uidRecord.uidXmlValue = xmlMatch[1];

            // JSON 中的 uid
            try {
              const json = JSON.parse(body);
              if (json.uid) uidRecord.uidJsonValue = String(json.uid);
              if (json.data?.uid) uidRecord.uidJsonDataValue = String(json.data.uid);
            } catch (_) {}

            // URL 参数中的 uid
            try {
              const urlObj = new URL(url);
              const uidParam = urlObj.searchParams.get("uid");
              if (uidParam) uidRecord.uidUrlParam = uidParam;
            } catch (_) {}

            // 赋值模式 uid=xxx / uid:"xxx"
            const assignMatch = body.match(/uid\s*[=:]\s*['"]?([a-zA-Z0-9_+]{10,})['"]?/);
            if (assignMatch) uidRecord.uidAssignPattern = assignMatch[1];

            uidRecord.bodyFull = truncate(body, 2000);
          }
          probeData.uidResponses.push(uidRecord);
          console.log(`[探查] 发现 uid 相关响应 #${responseCount} | url=${truncate(url, 100)}`);
        }

        // ---- 检查包含 ver 的响应 ----
        if (containsKeyword(url, "ver=") || (body && containsKeyword(body, "ver"))) {
          const verRecord = { ...record };
          if (body) {
            // URL 参数中的 ver
            try {
              const urlObj = new URL(url);
              const verParam = urlObj.searchParams.get("ver");
              if (verParam) verRecord.verUrlParam = verParam;
            } catch (_) {}

            // 赋值模式 ver=xxx / ver:"xxx"
            const assignMatch = body.match(/ver\s*[=:]\s*['"]?([a-zA-Z0-9_]+)['"]?/);
            if (assignMatch) verRecord.verAssignPattern = assignMatch[1];

            verRecord.bodyFull = truncate(body, 1000);
          }
          probeData.verResponses.push(verRecord);
          console.log(`[探查] 发现 ver 相关响应 #${responseCount} | url=${truncate(url, 100)}`);
        }

        // 简要记录所有响应
        probeData.responses.push(record);
      } catch (_) {
        probeData.responses.push(record);
      }
    });

    // ---- 3. 导航到登录页 ----
    console.log("[探查] 导航到 " + HG_URL + " ...");
    await page.goto(HG_URL, { waitUntil: "domcontentloaded", timeout: 30000 });
    await sleep(2000);
    console.log("[探查] 页面已加载，请在浏览器中手动登录...");

    // ---- 4. 等待用户手动登录 ----
    const LOGIN_TIMEOUT = 300000; // 5 分钟超时
    const startTime = Date.now();
    let loginDetected = false;

    while (Date.now() - startTime < LOGIN_TIMEOUT && !loginDetected) {
      await sleep(2000);

      // 跨 frame 检测登录状态
      for (const frame of page.frames()) {
        try {
          const loggedIn = await frame.evaluate(() => {
            function isVisible(el) {
              if (!el) return false;
              const s = getComputedStyle(el);
              return s.display !== "none" && s.visibility !== "hidden";
            }
            const bt = (document.body.textContent || "");
            return (
              bt.includes("My Events") || bt.includes("My Bets") ||
              (bt.includes("In-Play") && bt.includes("Soccer")) ||
              bt.includes("Balance") || bt.includes("余额") ||
              bt.includes("Credit") || bt.includes("额度") ||
              isVisible(document.getElementById("today_page")) ||
              isVisible(document.getElementById("live_page")) ||
              isVisible(document.getElementById("symbol_ft"))
            );
          });
          if (loggedIn) {
            loginDetected = true;
            break;
          }
        } catch (_) {}
      }

      // 每 30 秒打印一次等待提示
      const elapsed = Math.floor((Date.now() - startTime) / 1000);
      if (elapsed > 0 && elapsed % 30 === 0) {
        const remaining = Math.floor((LOGIN_TIMEOUT - (Date.now() - startTime)) / 1000);
        console.log(`[探查] 等待手动登录中... 已等待 ${elapsed}s，剩余 ${remaining}s`);
      }
    }

    if (!loginDetected) {
      console.warn("[探查] 登录等待超时（5分钟），将基于已有数据生成报告");
    } else {
      console.log("[探查] 检测到登录成功！开始收集数据...");
    }

    // 等待页面稳定
    await sleep(3000);

    // ---- 5. 遍历所有 frame 提取 window.uid / window.ver ----
    console.log("[探查] 遍历所有 frame 提取全局变量...");
    for (const frame of page.frames()) {
      try {
        const frameUrl = frame.url();
        const vars = await frame.evaluate(() => {
          const result = {};
          // window.uid
          try { result.uid = typeof uid !== "undefined" ? String(uid) : null; } catch (_) { result.uid = null; }
          // window.ver
          try { result.ver = typeof ver !== "undefined" ? String(ver) : null; } catch (_) { result.ver = null; }
          // top.uid
          try { result.topUid = (typeof top !== "undefined" && top.uid) ? String(top.uid) : null; } catch (_) { result.topUid = null; }
          // top.ver
          try { result.topVer = (typeof top !== "undefined" && top.ver) ? String(top.ver) : null; } catch (_) { result.topVer = null; }
          return result;
        });

        if (vars.uid || vars.ver || vars.topUid || vars.topVer) {
          probeData.windowVars.push({
            frameUrl: truncate(frameUrl, 200),
            ...vars,
          });
          console.log(`[探查] frame ${truncate(frameUrl, 80)} | uid=${vars.uid || vars.topUid || "null"} | ver=${vars.ver || vars.topVer || "null"}`);
        }
      } catch (_) {}
    }

    // ---- 6. 遍历所有 cookie ----
    console.log("[探查] 收集 Cookie...");
    try {
      const cookies = await page.cookies();
      for (const c of cookies) {
        const cookieInfo = {
          name: c.name,
          valuePrefix: c.value ? c.value.substring(0, 30) : "",
          valueLength: c.value ? c.value.length : 0,
          domain: c.domain,
          path: c.path,
        };
        probeData.cookies.push(cookieInfo);

        // 标记 uid 相关 cookie
        const isUidRelated =
          c.name.toLowerCase() === "uid" ||
          c.name.startsWith("login_") ||
          c.name.toLowerCase().includes("uid") ||
          c.name === "loginuser";
        if (isUidRelated) {
          console.log(`[探查] uid 相关 Cookie: ${c.name} = ${c.value ? c.value.substring(0, 40) : ""}(长度=${c.value ? c.value.length : 0})`);
        }
      }
    } catch (_) {}

    // ---- 7. 在所有 frame 中搜索 script 标签中的 uid 赋值模式 ----
    console.log("[探查] 搜索 script 标签中的 uid 赋值模式...");
    for (const frame of page.frames()) {
      try {
        const frameUrl = frame.url();
        const patterns = await frame.evaluate(() => {
          const results = [];
          const scripts = document.querySelectorAll("script");
          for (const s of scripts) {
            const text = s.textContent || "";
            // 匹配 uid=xxx / uid:"xxx" / uid:'xxx'
            const uidMatches = text.match(/uid\s*[=:]\s*['"]?([a-zA-Z0-9_+/=]{5,})['"]?/g);
            if (uidMatches) {
              for (const m of uidMatches) {
                results.push({
                  pattern: m.substring(0, 100),
                  source: s.src ? truncate(s.src, 100) : "inline",
                });
              }
            }
            // 匹配 ver=xxx
            const verMatches = text.match(/ver\s*[=:]\s*['"]?([a-zA-Z0-9_]+)['"]?/g);
            if (verMatches) {
              for (const m of verMatches) {
                results.push({
                  pattern: m.substring(0, 100),
                  source: s.src ? truncate(s.src, 100) : "inline",
                });
              }
            }
          }
          return results;

          function truncate(str, maxLen) {
            if (!str || str.length <= maxLen) return str;
            return str.substring(0, maxLen) + "...";
          }
        });

        if (patterns.length > 0) {
          probeData.scriptUidPatterns.push({
            frameUrl: truncate(frameUrl, 200),
            patterns,
          });
          for (const p of patterns) {
            console.log(`[探查] script 赋值模式: ${p.pattern} (来源: ${p.source})`);
          }
        }
      } catch (_) {}
    }

    // ---- 8. 生成探查报告 ----
    probeData.summary = {
      totalResponses: probeData.responses.length,
      chkLoginCount: probeData.chkLoginResponses.length,
      uidRelatedCount: probeData.uidResponses.length,
      verRelatedCount: probeData.verResponses.length,
      cookieCount: probeData.cookies.length,
      windowVarsFound: probeData.windowVars.length,
      scriptPatternsFound: probeData.scriptUidPatterns.reduce((sum, f) => sum + f.patterns.length, 0),
      loginDetected,
      probeTime: new Date().toISOString(),
    };

    // 保存完整报告
    fs.writeFileSync(REPORT_PATH, JSON.stringify(probeData, null, 2), "utf8");

    // ---- 9. 输出探查报告 ----
    console.log("\n" + "=".repeat(60));
    console.log("           登录网络探查报告");
    console.log("=".repeat(60));
    console.log(`探查时间: ${probeData.summary.probeTime}`);
    console.log(`登录状态: ${loginDetected ? "已登录" : "未检测到登录"}`);
    console.log("");

    console.log("--- 响应统计 ---");
    console.log(`总响应数: ${probeData.summary.totalResponses}`);
    console.log(`chk_login 响应数: ${probeData.summary.chkLoginCount}`);
    console.log(`包含 uid 的响应数: ${probeData.summary.uidRelatedCount}`);
    console.log(`包含 ver 的响应数: ${probeData.summary.verRelatedCount}`);
    console.log("");

    if (probeData.chkLoginResponses.length > 0) {
      console.log("--- chk_login 响应详情 ---");
      for (const r of probeData.chkLoginResponses) {
        console.log(`  URL: ${r.url}`);
        console.log(`  Status: ${r.status}`);
        if (r.uidFromXml) console.log(`  uid (XML标签): ${r.uidFromXml}`);
        if (r.uidFromJson) console.log(`  uid (JSON字段): ${r.uidFromJson}`);
        if (r.uidFromJsonData) console.log(`  uid (JSON data.uid): ${r.uidFromJsonData}`);
        if (r.bodyFull) console.log(`  响应体: ${truncate(r.bodyFull, 500)}`);
        console.log("");
      }
    }

    if (probeData.uidResponses.length > 0) {
      console.log("--- 包含 uid 的响应 ---");
      for (const r of probeData.uidResponses) {
        console.log(`  #${r.index} | URL: ${r.url}`);
        if (r.uidXmlValue) console.log(`    uid (XML): ${r.uidXmlValue}`);
        if (r.uidJsonValue) console.log(`    uid (JSON): ${r.uidJsonValue}`);
        if (r.uidJsonDataValue) console.log(`    uid (data.uid): ${r.uidJsonDataValue}`);
        if (r.uidUrlParam) console.log(`    uid (URL参数): ${r.uidUrlParam}`);
        if (r.uidAssignPattern) console.log(`    uid (赋值模式): ${r.uidAssignPattern}`);
        console.log("");
      }
    }

    if (probeData.verResponses.length > 0) {
      console.log("--- 包含 ver 的响应 ---");
      for (const r of probeData.verResponses) {
        console.log(`  #${r.index} | URL: ${r.url}`);
        if (r.verUrlParam) console.log(`    ver (URL参数): ${r.verUrlParam}`);
        if (r.verAssignPattern) console.log(`    ver (赋值模式): ${r.verAssignPattern}`);
        console.log("");
      }
    }

    console.log("--- Cookie 统计 ---");
    console.log(`总 Cookie 数: ${probeData.summary.cookieCount}`);
    const uidCookies = probeData.cookies.filter(c =>
      c.name.toLowerCase() === "uid" ||
      c.name.startsWith("login_") ||
      c.name.toLowerCase().includes("uid") ||
      c.name === "loginuser"
    );
    if (uidCookies.length > 0) {
      console.log("uid 相关 Cookie:");
      for (const c of uidCookies) {
        console.log(`  ${c.name} = ${c.valuePrefix}...(长度=${c.valueLength}) | domain=${c.domain}`);
      }
    } else {
      console.log("未发现 uid 相关 Cookie");
    }
    console.log("");

    console.log("--- 全局变量 (window.uid / window.ver) ---");
    if (probeData.windowVars.length > 0) {
      for (const v of probeData.windowVars) {
        console.log(`  frame: ${v.frameUrl}`);
        if (v.uid) console.log(`    window.uid = ${v.uid}`);
        if (v.ver) console.log(`    window.ver = ${v.ver}`);
        if (v.topUid) console.log(`    top.uid = ${v.topUid}`);
        if (v.topVer) console.log(`    top.ver = ${v.topVer}`);
      }
    } else {
      console.log("未在任何 frame 中发现 window.uid / window.ver");
    }
    console.log("");

    console.log("--- script 标签中的 uid/ver 赋值模式 ---");
    if (probeData.scriptUidPatterns.length > 0) {
      for (const f of probeData.scriptUidPatterns) {
        console.log(`  frame: ${f.frameUrl}`);
        for (const p of f.patterns) {
          console.log(`    模式: ${p.pattern} | 来源: ${p.source}`);
        }
      }
    } else {
      console.log("未在 script 标签中发现 uid/ver 赋值模式");
    }

    console.log("");
    console.log("=".repeat(60));
    console.log(`完整报告已保存到: ${REPORT_PATH}`);
    console.log("=".repeat(60));

    // 保持浏览器打开 10 秒供用户查看
    console.log("\n[探查] 浏览器将在 10 秒后关闭，可手动查看页面...");
    await sleep(10000);

    await browser.close();
  } catch (e) {
    console.error("[探查] 探查失败:", e.message);
    if (browser) { try { await browser.close(); } catch (_) {} }
    process.exit(1);
  }
}

probeLoginNetwork();
