/**
 * diagnose-matches.cjs — 爬虫诊断脚本
 * 聚焦 In-Play / Today / World Cup 2026 三个分区
 * 结构化诊断报告 + 截图 + XHR 分析
 *
 * 用法: node scripts/diagnose-matches.cjs
 * Windows用户: 使用 scripts/run-diagnose.bat 来避免中文乱码
 */

// 确保在 Windows 上使用 UTF-8 编码输出
if (process.platform === 'win32') {
  try {
    process.stdout.setEncoding('utf8');
    process.stderr.setEncoding('utf8');
  } catch (e) {}
}

const fs = require("fs");
const path = require("path");

// ==================== 动态加载 ES 模块 ====================
let browserPool, crawlerShared, cornerCrawler;

async function loadModules() {
  browserPool = await import("../backend/services/browserPool.js");
  crawlerShared = await import("../backend/services/crawlerShared.js");
  cornerCrawler = await import("../backend/services/cornerCrawler.js");
}

// ==================== 配置 ====================
const HG_USERNAME = process.env.HG_USERNAME || "johui888";
const HG_PASSWORD = process.env.HG_PASSWORD || "aa123123";
const DEBUG_DIR = path.join(__dirname, "..", "debug");
if (!fs.existsSync(DEBUG_DIR)) fs.mkdirSync(DEBUG_DIR, { recursive: true });

const SECTIONS = ["In-Play", "Today", "World Cup 2026"];

// ==================== 诊断数据 ====================
const diagnosis = {
  login: { success: false, detail: "" },
  sections: {},
  xhrUrls: [],
  totalXhrCount: 0
};

// ==================== XHR 拦截 ====================
const seenXhrUrls = new Set();

function setupXHRInterception(page) {
  page.on("request", (req) => {
    const rt = req.resourceType();
    if (rt === "xhr" || rt === "fetch") {
      const url = req.url();
      if (!seenXhrUrls.has(url)) {
        seenXhrUrls.add(url);
        console.log("  [XHR] " + url.substring(0, 150));
      }
    }
  });
}

// ==================== 分区诊断 ====================
async function diagnoseSection(page, sectionName) {
  console.log("\n=== Section: " + sectionName + " ===");

  const entry = {
    status: "unknown",
    boxLebetCount: 0,
    navigated: false,
    pageText: ""
  };

  // 导航到此分区
  try {
    const clicked = await crawlerShared.clickTab(page, sectionName, 8000);
    entry.navigated = clicked;
    console.log("  Navigated: " + (clicked ? "OK" : "NOT FOUND (will check anyway)"));
  } catch (e) {
    console.log("  Navigate error: " + e.message);
  }

  // 等待内容加载 + 弹窗处理
  await new Promise(r => setTimeout(r, 4000));
  try { await crawlerShared.handlePopups(page); } catch (e) {}

  // 统计 div.box_lebet
  try {
    entry.boxLebetCount = await page.evaluate(() => {
      return document.querySelectorAll('div.box_lebet').length;
    });
    console.log("  div.box_lebet count: " + entry.boxLebetCount);
  } catch (e) {
    console.log("  box_lebet check failed: " + e.message);
  }

  // 页面文本采样
  try {
    entry.pageText = await page.evaluate(() => {
      const body = document.body;
      return body ? (body.textContent || "").replace(/\s+/g, " ").trim().substring(0, 500) : "(no body)";
    });
    console.log("  Page text: " + entry.pageText.substring(0, 200) + "...");
  } catch (e) {
    entry.pageText = "(sample failed)";
  }

  // 截图
  const safeName = sectionName.replace(/[^a-zA-Z0-9]/g, "_");
  const screenshotPath = path.join(DEBUG_DIR, "section-" + safeName + ".png");
  try {
    await page.screenshot({ path: screenshotPath, fullPage: false });
    console.log("  Screenshot: debug/section-" + safeName + ".png");
  } catch (e) {
    console.log("  Screenshot failed: " + e.message);
  }

  // 判定状态
  if (entry.boxLebetCount > 0) {
    entry.status = "has_matches";
  } else if (entry.navigated) {
    entry.status = "no_matches";
  } else {
    entry.status = "navigation_failed";
  }

  diagnosis.sections[sectionName] = entry;
}

// ==================== 输出诊断报告 ====================
function printDiagnosisReport() {
  console.log("\n" + "=".repeat(60));
  console.log("  诊 断 报 告");
  console.log("=".repeat(60));

  // --- 登录状态 ---
  console.log("\n[登录状态]");
  console.log("  结果: " + (diagnosis.login.success ? "成功" : "失败"));
  console.log("  详情: " + diagnosis.login.detail);

  // --- 各分区 ---
  for (const [name, entry] of Object.entries(diagnosis.sections)) {
    const icon = entry.status === "has_matches" ? "  OK" :
                 entry.status === "no_matches" ? " WARN" : " FAIL";
    const label = entry.status === "has_matches" ? "有比赛数据" :
                  entry.status === "no_matches" ? "无比赛数据" : "导航失败";
    console.log("\n[分区] " + name + " " + icon);
    console.log("  状态: " + label);
    console.log("  div.box_lebet 数量: " + entry.boxLebetCount);
    console.log("  导航成功: " + (entry.navigated ? "是" : "否"));
  }

  // --- XHR 摘要 ---
  console.log("\n[网络请求]");
  console.log("  捕获 XHR/Fetch URL 数量: " + diagnosis.totalXhrCount);
  const apiUrls = diagnosis.xhrUrls.filter(u =>
    u.includes("transform") || u.includes("gismo") || u.includes("betradar") || u.includes("api")
  );
  console.log("  数据相关 API 数量: " + apiUrls.length);
  for (const url of apiUrls.slice(0, 10)) {
    console.log("    " + url);
  }
  if (apiUrls.length > 10) {
    console.log("    ... 还有 " + (apiUrls.length - 10) + " 个");
  }

  // --- 综合分析 ---
  console.log("\n[综合分析]");
  const reasons = [];
  const anyMatches = Object.values(diagnosis.sections).some(e => e.status === "has_matches");

  if (!diagnosis.login.success) {
    reasons.push("登录失败，无法获取任何页面内容");
    reasons.push("修复: 检查 HG_USERNAME / HG_PASSWORD 凭据是否正确");
    reasons.push("修复: 检查 hga050.com 网站是否可正常访问");
  } else if (anyMatches) {
    reasons.push("至少一个分区有比赛数据，爬虫基本可用");
    const emptySections = Object.entries(diagnosis.sections)
      .filter(([, e]) => e.status !== "has_matches")
      .map(([n]) => n);
    if (emptySections.length > 0) {
      reasons.push("以下分区无数据: " + emptySections.join(", "));
      reasons.push("可能原因: 该时段无对应比赛 / 导航 tab 选择器不匹配");

      // 检查无数据分区的页面文本
      for (const name of emptySections) {
        const text = diagnosis.sections[name].pageText.toLowerCase();
        if (text.includes("no event") || text.includes("no data") || text.includes("暂无")) {
          reasons.push("  \"" + name + "\" 页面提示无数据，非技术问题");
        }
      }
    }
  } else {
    reasons.push("所有分区均无比赛数据");

    // 检查是否触发反爬
    let hasChallenge = false;
    for (const [, entry] of Object.entries(diagnosis.sections)) {
      const lt = entry.pageText.toLowerCase();
      if (lt.includes("cloudflare") || lt.includes("cf-challenge") || lt.includes("just a moment")) {
        hasChallenge = true;
        reasons.push("检测到 Cloudflare 人机验证页面");
        break;
      }
      if (lt.includes("login") || lt.includes("登入") || lt.includes("log in") || lt.includes("password")) {
        reasons.push("页面仍处于登录界面，登录可能未成功");
        break;
      }
      if (lt.includes("access denied") || lt.includes("forbidden") || lt.includes("403")) {
        reasons.push("检测到访问被拒绝 (403/Forbidden)");
        break;
      }
    }

    if (!hasChallenge) {
      if (apiUrls.length === 0) {
        reasons.push("未捕获到任何数据 API 请求");
        reasons.push("页面可能通过 iframe 或 WebSocket 加载比赛数据");
      } else {
        reasons.push("有 API 请求但未映射到 DOM 节点");
        reasons.push("可能 DOM 结构已变更，div.box_lebet 选择器失效");
      }
    }
  }

  for (const r of reasons) {
    console.log("  - " + r);
  }

  // --- 推荐方案 ---
  console.log("\n[推荐方案]");
  if (!diagnosis.login.success) {
    console.log("  1. 修复登录凭据或手动登录后重试");
    console.log("  2. 如果 hga050.com 改版，更新登录选择器");
    console.log("  3. 检查网络是否可访问 hga050.com");
  } else if (!anyMatches) {
    const hasChallenge = Object.values(diagnosis.sections).some(e =>
      e.pageText.toLowerCase().includes("cloudflare") ||
      e.pageText.toLowerCase().includes("just a moment")
    );
    if (hasChallenge) {
      console.log("  1. 降低爬取频率，增加随机延迟");
      console.log("  2. 考虑使用代理 IP 轮换");
      console.log("  3. 在非无头模式下手动完成验证");
    } else {
      console.log("  1. 检查 debug/section-*.png 截图确认页面实际内容");
      console.log("  2. 更新 DOM 选择器（div.box_lebet 可能已变更）");
      console.log("  3. 考虑直接用 XHR API 获取数据");
      console.log("  4. 检查页面中是否有 iframe 嵌入的外部比赛数据");
    }
  } else {
    console.log("  1. 爬虫基本正常，可继续使用现有方案");
    const emptySections = Object.entries(diagnosis.sections)
      .filter(([, e]) => e.status !== "has_matches")
      .map(([n]) => n);
    if (emptySections.length > 0) {
      console.log("  2. 无数据分区可忽略（非营业时段）或更新 tab 选择器");
    }
  }

  console.log("\n" + "=".repeat(60));
}

// ==================== 主流程 ====================
async function main() {
  console.log("===== 爬虫诊断工具 =====");
  console.log("时间: " + new Date().toISOString());
  console.log("调试目录: " + DEBUG_DIR);
  console.log("");

  await loadModules();

  // ---- Step 1: 登录 ----
  console.log("--- Step 1: 登录 ---");
  let page = browserPool.getSharedPage();

  if (page && browserPool.isLoggedIn()) {
    try {
      const url = await page.url();
      console.log("  现有页面: " + (url || "").substring(0, 100));

      // 验证页面内容是否真的是登录态
      const isLoggedInContent = await page.evaluate(() => {
        const t = document.body ? document.body.textContent || "" : "";
        return (t.includes("My Events") || t.includes("My Bets")) &&
               (t.includes("In-Play") && (t.includes("Soccer") || t.includes("足球")));
      });

      if (isLoggedInContent) {
        console.log("  复用现有会话");
        diagnosis.login.success = true;
        diagnosis.login.detail = "复用现有会话";
      } else {
        console.log("  页面内容非登录态，需重新登录");
        page = null;
      }
    } catch (e) {
      console.log("  现有会话无效: " + e.message);
      page = null;
    }
  }

  if (!diagnosis.login.success) {
    console.log("  正在登录 hga050.com...");
    try {
      const result = await cornerCrawler.loginToHG(HG_USERNAME, HG_PASSWORD);
      diagnosis.login.success = result.success;
      diagnosis.login.detail = result.success
        ? "登录成功, 余额: " + (result.balance || "?")
        : (result.message || "登录返回失败");

      if (!result.success) {
        console.error("  登录失败: " + JSON.stringify(result));
        printDiagnosisReport();
        process.exit(1);
      }
      console.log("  OK 登录成功");
      page = browserPool.getSharedPage();
    } catch (e) {
      diagnosis.login.success = false;
      diagnosis.login.detail = "异常: " + e.message;
      console.error("  登录异常: " + e.message);
      printDiagnosisReport();
      process.exit(1);
    }
  }

  if (!page) {
    console.error("  登录后无法获取页面对象");
    diagnosis.login.detail += " (页面对象为空)";
    printDiagnosisReport();
    process.exit(1);
  }

  // ---- Step 2: 设置 XHR 拦截 ----
  console.log("\n--- Step 2: 设置 XHR 拦截 ---");
  setupXHRInterception(page);

  // ---- Step 3: 遍历分区 ----
  console.log("\n--- Step 3: 分区诊断 ---");
  for (const section of SECTIONS) {
    await diagnoseSection(page, section);
  }

  // ---- Step 4: XHR 汇总 ----
  diagnosis.xhrUrls = Array.from(seenXhrUrls);
  diagnosis.totalXhrCount = diagnosis.xhrUrls.length;

  fs.writeFileSync(
    path.join(DEBUG_DIR, "all-xhr-urls.txt"),
    diagnosis.xhrUrls.join("\n")
  );
  console.log("\nXHR URLs saved to debug/all-xhr-urls.txt (" + diagnosis.totalXhrCount + " urls)");

  // ---- Step 5: 输出报告 ----
  printDiagnosisReport();

  console.log("\n===== 诊断完成 =====");
}

main().catch(err => {
  console.error("FATAL:", err);
  process.exit(1);
});