/**
 * 全量爬取脚本 — 遍历 94 支球队并写入 SQLite
 *
 * 用法:
 *   npx tsx scripts/crawlAllTeams.ts
 *
 * 首次运行会爬取所有球队, 之后增量更新。
 * 每支球队间隔 2-3 秒以防被封。
 */

import { REAL_TEAMS } from "../src/data/realTeamsData";
import { fetchTeamStatsFromQiumiwu, closeBrowser } from "../src/crawler/qiumiwuCrawler";
import { upsertTeamStats, getDb, closeDb } from "../database/db";

const DELAY_MS = () => 2000 + Math.floor(Math.random() * 1000); // 2-3s 随机
const BATCH_SIZE = 10;

async function crawlAll() {
  console.log("════════════════════════════════════════");
  console.log(`  全量爬取 — ${REAL_TEAMS.length} 支球队`);
  console.log("════════════════════════════════════════\n");

  // 初始化数据库
  await getDb();

  let success = 0;
  let failed = 0;
  const failedTeams: string[] = [];

  for (let i = 0; i < REAL_TEAMS.length; i++) {
    const team = REAL_TEAMS[i];
    const progress = `[${i + 1}/${REAL_TEAMS.length}]`;

    console.log(`${progress} 正在爬取: ${team.nameCn} (${team.leagueCn})...`);

    try {
      const stats = await fetchTeamStatsFromQiumiwu(team.nameCn, team.leagueCn);

      if (stats && Object.keys(stats).filter((k) => (stats as any)[k] !== undefined).length >= 1) {
        await upsertTeamStats(
          team.id,
          team.nameCn,
          team.name,
          team.league,
          team.leagueCn,
          stats as Record<string, any>
        );
        const fieldCount = Object.values(stats).filter((v) => v !== undefined).length;
        console.log(`  ✓ ${team.nameCn} — ${fieldCount} 字段已写入 SQLite`);
        success++;
      } else {
        console.warn(`  ✗ ${team.nameCn} — 爬虫返回空数据, 跳过`);
        failed++;
        failedTeams.push(team.nameCn);
      }
    } catch (err: any) {
      console.error(`  ✗ ${team.nameCn} — 异常: ${err.message?.slice(0, 80)}`);
      failed++;
      failedTeams.push(team.nameCn);
    }

    // 进度报告
    if ((i + 1) % BATCH_SIZE === 0) {
      console.log(`\n── 进度: ${i + 1}/${REAL_TEAMS.length} | 成功 ${success} | 失败 ${failed} ──\n`);
    }

    // 延迟 (最后一支球队不延迟)
    if (i < REAL_TEAMS.length - 1) {
      const delay = DELAY_MS();
      await new Promise((r) => setTimeout(r, delay));
    }
  }

  // 最终报告
  console.log("\n════════════════════════════════════════");
  console.log(`  爬取完成!`);
  console.log(`  成功: ${success} 支球队`);
  console.log(`  失败: ${failed} 支球队`);
  if (failedTeams.length > 0) {
    console.log(`  失败列表: ${failedTeams.join(", ")}`);
  }
  console.log("════════════════════════════════════════\n");

  await closeBrowser();
  await closeDb();
}

crawlAll().catch((err) => {
  console.error("全量爬取异常:", err);
  process.exit(1);
});
