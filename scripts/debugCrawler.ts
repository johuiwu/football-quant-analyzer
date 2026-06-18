/**
 * 爬虫调试脚本
 * 用法: npx tsx scripts/debugCrawler.ts
 *
 * 会自动打开 Chromium 窗口 (headless: false), 方便观察页面加载状态。
 * 如果浏览器窗口弹出但页面空白, 查看控制台输出的 HTML 预览和截屏文件。
 */

import { fetchTeamStatsFromQiumiwu, closeBrowser } from "../src/crawler/qiumiwuCrawler";

async function debug() {
  console.log("════════════════════════════════════════");
  console.log("   qiumiwuCrawler 调试脚本");
  console.log("════════════════════════════════════════\n");

  // ---- 测试用例 ----
  const testCases = [
    { teamName: "曼彻斯特城", league: "英格兰超级联赛" },
    { teamName: "阿森纳", league: "英格兰超级联赛" },
  ];

  for (const tc of testCases) {
    console.log(`\n>>> 测试: ${tc.teamName} (${tc.league})`);
    console.log("─".repeat(50));

    const startTime = Date.now();
    const result = await fetchTeamStatsFromQiumiwu(tc.teamName, tc.league);
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

    if (result && Object.keys(result).length >= 3) {
      console.log(`\n✓ 爬取成功! (耗时 ${elapsed}s)`);
      console.log("字段列表:");
      for (const [k, v] of Object.entries(result)) {
        if (v !== undefined) {
          console.log(`  ${k}: ${JSON.stringify(v)}`);
        }
      }
    } else {
      console.log(`\n✗ 爬取失败 (耗时 ${elapsed}s)`);
      console.log("请检查:");
      console.log("  1. 浏览器窗口是否有 Cloudflare 人机验证?");
      console.log("  2. 页面是否为空 / 404?");
      console.log("  3. 控制台 HTML 预览内容是否正常?");
      console.log("  4. 当前目录下是否生成了 debug_*.png 截屏?");
    }
  }

  console.log("\n════════════════════════════════════════");
  console.log("   调试结束, 关闭浏览器...");
  console.log("════════════════════════════════════════");
  await closeBrowser();
}

debug().catch((err) => {
  console.error("调试脚本异常:", err);
  process.exit(1);
});
