/**
 * 批量更新球队数据脚本
 *
 * 用法:
 *   node scripts/batchUpdateTeams.cjs
 *   node scripts/batchUpdateTeams.cjs --league EPL
 *   node scripts/batchUpdateTeams.cjs --force
 *   node scripts/batchUpdateTeams.cjs --delay 5000
 *   node scripts/batchUpdateTeams.cjs --league EPL --force --delay 3000
 */

const { REAL_TEAMS } = require("../backend/data.cjs");
const { getDb, upsertTeamStats, getTeamStatsFromDb } = require("../database/db.cjs");

// ======================== 命令行参数解析 ========================

function parseArgs() {
  const args = process.argv.slice(2);
  const result = { league: null, force: false, delay: 5000 };

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--league" && args[i + 1]) {
      result.league = args[i + 1];
      i++;
    } else if (args[i] === "--force") {
      result.force = true;
    } else if (args[i] === "--delay" && args[i + 1]) {
      result.delay = parseInt(args[i + 1], 10);
      if (isNaN(result.delay) || result.delay < 0) result.delay = 5000;
      i++;
    }
  }

  return result;
}

// ======================== 工具函数 ========================

function randomDelay(baseMs) {
  // 在 baseMs 的 60%-160% 之间随机，模拟人类行为
  const min = Math.floor(baseMs * 0.6);
  const max = Math.floor(baseMs * 1.6);
  return min + Math.floor(Math.random() * (max - min));
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function withTimeout(promise, ms) {
  return Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error("timeout")), ms)
    ),
  ]);
}

// ======================== team_stats 写入 ========================

const TEAM_STATS_COLUMNS = [
  "team_id", "team_name", "team_name_cn", "league", "league_cn",
  "goals", "conceded", "goalDifference", "shots", "shotsOnTarget",
  "assists", "passes", "corners", "fouls", "redCards", "yellowCards",
  "penalties", "cleanSheets", "avgGoals", "avgConceded", "avgGoalDiff",
  "avgCorners", "possession", "tackles", "interceptions", "clearances",
  "offsides", "foulsSuffered", "keyPasses", "crosses", "crossesSuccessful",
  "longBalls", "successfulLongBalls", "freeKicks", "freeKickGoals",
  "dribbles", "successfulDribbles", "duelsWon", "fastBreaks",
  "fastBreakShots", "fastBreakGoals", "hitWoodwork", "possessionLost",
];

const TEAM_STATS_UPDATE_COLS = [
  "goals", "conceded", "goalDifference", "shots", "shotsOnTarget",
  "assists", "passes", "corners", "fouls", "redCards", "yellowCards",
  "penalties", "cleanSheets", "avgGoals", "avgConceded", "avgGoalDiff",
  "avgCorners", "possession", "tackles", "interceptions", "clearances",
  "offsides", "foulsSuffered", "keyPasses", "crosses", "crossesSuccessful",
  "longBalls", "successfulLongBalls", "freeKicks", "freeKickGoals",
  "dribbles", "successfulDribbles", "duelsWon", "fastBreaks",
  "fastBreakShots", "fastBreakGoals", "hitWoodwork", "possessionLost",
];

function buildTeamStatsSql() {
  const insertCols = TEAM_STATS_COLUMNS.join(", ");
  const placeholders = TEAM_STATS_COLUMNS.map(() => "?").join(", ");
  const updateSet = TEAM_STATS_UPDATE_COLS.map((c) => `${c}=excluded.${c}`).join(", ");

  return `
    INSERT INTO team_stats (${insertCols})
    VALUES (${placeholders})
    ON CONFLICT(team_id) DO UPDATE SET
      ${updateSet}, last_updated=CURRENT_TIMESTAMP
  `;
}

function total(v) {
  if (v === undefined || v === null) return 0;
  if (typeof v === "number") return v;
  if (typeof v.total === "number") return v.total;
  return 0;
}

function pct(v) {
  if (!v) return 0;
  if (typeof v === "number") return v;
  if (typeof v.value === "string") return parseFloat(v.value) || 0;
  if (typeof v.total === "number") return v.total;
  return 0;
}

async function writeTeamStats(team, stats) {
  const db = getDb();
  const sql = buildTeamStatsSql();

  const params = [
    team.id, team.name, team.nameCn, team.league, team.leagueCn,
    total(stats.goals), total(stats.conceded), total(stats.goalDifference),
    total(stats.shots), total(stats.shotsOnTarget),
    total(stats.assists), total(stats.passes),
    total(stats.corners), total(stats.fouls),
    total(stats.redCards), total(stats.yellowCards),
    total(stats.penalties), total(stats.cleanSheets),
    total(stats.avgGoals), total(stats.avgConceded),
    total(stats.avgGoalDiff), total(stats.avgCorners),
    pct(stats.possession),
    total(stats.tackles), total(stats.interceptions),
    total(stats.clearances), total(stats.offsides),
    total(stats.foulsSuffered), total(stats.keyPasses),
    total(stats.crosses), total(stats.crossesSuccessful),
    total(stats.longBalls), total(stats.successfulLongBalls),
    total(stats.freeKicks), total(stats.freeKickGoals),
    total(stats.dribbles), total(stats.successfulDribbles),
    total(stats.duelsWon),
    total(stats.fastBreaks), total(stats.fastBreakShots),
    total(stats.fastBreakGoals), total(stats.hitWoodwork),
    total(stats.possessionLost),
  ];

  await new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) reject(err);
      else resolve({ lastID: this.lastID, changes: this.changes });
    });
  });
}

// ======================== 主流程 ========================

async function main() {
  const config = parseArgs();

  // 动态导入 TypeScript 爬虫模块
  let fetchTeamStatsFromQiumiwu, closeBrowser;
  try {
    const crawler = await import("../src/crawler/qiumiwuCrawler.ts");
    fetchTeamStatsFromQiumiwu = crawler.fetchTeamStatsFromQiumiwu;
    closeBrowser = crawler.closeBrowser;
  } catch (err) {
    console.error("❌ 无法加载爬虫模块，请确保已安装 tsx:", err.message);
    process.exit(1);
  }

  // 筛选球队
  let teams = REAL_TEAMS;
  if (config.league) {
    teams = teams.filter((t) => t.league === config.league);
    if (teams.length === 0) {
      console.error(`❌ 未找到联赛 ${config.league} 的球队`);
      process.exit(1);
    }
  }

  console.log("═══════════════════════════════════════════════════");
  console.log(`  批量更新球队数据`);
  console.log(`  球队数量: ${teams.length}`);
  if (config.league) console.log(`  指定联赛: ${config.league}`);
  console.log(`  强制更新: ${config.force ? "是" : "否"}`);
  console.log(`  请求延迟: ${config.delay}ms`);
  console.log("═══════════════════════════════════════════════════\n");

  // 初始化数据库连接
  getDb();

  let successCount = 0;
  let failCount = 0;
  let skipCount = 0;

  for (let i = 0; i < teams.length; i++) {
    const team = teams[i];
    const progress = `[${i + 1}/${teams.length}]`;

    // 检查是否已有数据（非 --force 模式下跳过已有数据的球队）
    if (!config.force) {
      try {
        const existing = await getTeamStatsFromDb(team.id);
        if (existing && existing.goals > 0) {
          console.log(`${progress} ${team.nameCn} (${team.league}) ⊙ 已有数据，跳过`);
          skipCount++;
          continue;
        }
      } catch (err) {
        // 查询失败不阻塞，继续爬取
      }
    }

    // 爬取数据（60 秒超时）
    try {
      const stats = await withTimeout(
        fetchTeamStatsFromQiumiwu(team.nameCn, team.leagueCn),
        60000
      );

      if (stats && Object.keys(stats).filter((k) => stats[k] !== undefined).length >= 1) {
        const fieldCount = Object.values(stats).filter((v) => v !== undefined).length;

        // 写入 team_stats 表
        await writeTeamStats(team, stats);

        // 同时更新 teams 表
        const teamWithStats = {
          ...team,
          homeStats: team.homeStats || {},
          awayStats: team.awayStats || {},
          homeXg: stats.homeXg ?? stats.home_xg ?? team.homeXg,
          awayXg: stats.awayXg ?? stats.away_xg ?? team.awayXg,
          cleanSheets: stats.cleanSheets ?? team.cleanSheets,
          shotsPerGame: stats.avgGoals ? (stats.shots ? stats.shots : team.shotsPerGame) : team.shotsPerGame,
          shotAccuracy: stats.shotsOnTarget && stats.shots
            ? Math.round((total(stats.shotsOnTarget) / total(stats.shots)) * 100)
            : team.shotAccuracy,
          data_source: "crawler",
        };
        await upsertTeamStats(team.id, teamWithStats);

        console.log(`${progress} ${team.nameCn} (${team.league}) ✓ ${fieldCount} fields`);
        successCount++;
      } else {
        console.log(`${progress} ${team.nameCn} (${team.league}) ✗ 无数据`);
        failCount++;
      }
    } catch (err) {
      const reason = err.message === "timeout" ? "timeout" : err.message?.slice(0, 60);
      console.log(`${progress} ${team.nameCn} (${team.league}) ✗ ${reason}`);
      failCount++;
    }

    // 请求间延迟（最后一支球队不延迟）
    if (i < teams.length - 1) {
      const delay = randomDelay(config.delay);
      await sleep(delay);
    }
  }

  // 关闭浏览器
  try {
    await closeBrowser();
  } catch (err) {
    // 忽略关闭浏览器错误
  }

  // 打印汇总
  console.log("\n═══════════════════════════════════════════════════");
  console.log(`  批量更新完成`);
  console.log(`  总计: ${teams.length} 支球队`);
  console.log(`  成功: ${successCount}`);
  console.log(`  失败: ${failCount}`);
  console.log(`  跳过: ${skipCount}`);
  console.log("═══════════════════════════════════════════════════\n");

  process.exit(0);
}

main().catch((err) => {
  console.error("❌ 批量更新异常:", err);
  process.exit(1);
});
