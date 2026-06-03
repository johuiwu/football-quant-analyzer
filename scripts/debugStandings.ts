
/**
 * 积分榜爬虫调试脚本
 * 用法: npx tsx scripts/debugStandings.ts
 */

import { fetchLeagueStandingsFromQiumiwu, closeBrowser } from "../src/crawler/qiumiwuCrawler";

async function debug() {
  console.log("════════════════════════════════════════");
  console.log("   积分榜爬虫调试");
  console.log("════════════════════════════════════════\n");

  const testLeagues = [
    "英超",
    "西甲",
    "德甲",
  ];

  for (const league of testLeagues) {
    console.log(`\n>>> 测试联赛: ${league}`);
    console.log("─".repeat(50));

    const startTime = Date.now();
    const result = await fetchLeagueStandingsFromQiumiwu(league);
    const elapsed = (Date.now() - startTime) / 1000;

    if (result && result.length > 0) {
      console.log(`\n✓ 爬取成功! (耗时 ${elapsed.toFixed(1)}s, ${result.length} 支球队)`);
      console.log("\n前5名:");
      result.slice(0, 5).forEach((team, idx) => {
        console.log(`  ${idx + 1}. ${team.teamNameCn}: ${team.played}场 ${team.wins}胜 ${team.draws}平 ${team.losses}负 积分${team.points}`);
      });
    } else {
      console.log(`\n✗ 爬取失败 (耗时 ${elapsed.toFixed(1)}s)`);
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

