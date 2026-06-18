/**
 * 将 Python 爬虫生成的 all_teams_data.csv 导入 SQLite football_data.db
 *
 * 用法:
 *   npx tsx scripts/importCrawledData.ts
 *   npx tsx scripts/importCrawledData.ts --csv python/output/all_teams_data.csv
 *   npx tsx scripts/importCrawledData.ts --drop   (先清空表再导入)
 */

import { open } from "sqlite";
import sqlite3 from "sqlite3";
import fs from "fs";
import path from "path";

// ======================== 配置 ========================

const PROJECT_DIR = path.resolve(process.cwd());
const DB_PATH = path.join(PROJECT_DIR, "database", "football_data.db");
const DEFAULT_CSV = path.join(PROJECT_DIR, "output", "all_teams_data.csv");
const ERROR_LOG = path.join(PROJECT_DIR, "import_errors.log");
const BATCH_SIZE = 20;

// CSV 列 → DB 列映射 (CSV列名可能与DB列名不完全一致)
const CSV_COLUMNS = [
  "team_name", "team_name_cn", "team_id", "league", "league_cn",
  "goals", "conceded", "goalDifference", "shots", "shotsOnTarget",
  "assists", "passes", "corners", "fouls", "redCards", "yellowCards",
  "penalties", "cleanSheets",
  "avgGoals", "avgConceded", "avgGoalDiff", "avgCorners",
  "possession",
  "tackles", "interceptions", "clearances", "offsides",
  "foulsSuffered", "keyPasses",
  "crosses", "crossesSuccessful", "successfulCrosses",
  "longBalls", "successfulLongBalls",
  "freeKicks", "freeKickGoals",
  "dribbles", "successfulDribbles", "duelsWon",
  "fastBreaks", "fastBreakShots", "fastBreakGoals",
  "hitWoodwork", "possessionLost",
  "twoYellowRedCards", "effectiveBlocks",
  "passesSuccessful", "duelsTotal",
];

// ======================== 工具函数 ========================

function parseArgs(): { csvPath: string; dropFirst: boolean } {
  const args = process.argv.slice(2);
  let csvPath = DEFAULT_CSV;
  let dropFirst = false;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--csv" && i + 1 < args.length) {
      csvPath = path.resolve(args[i + 1]);
      i++;
    } else if (args[i] === "--drop") {
      dropFirst = true;
    }
  }
  return { csvPath, dropFirst };
}

/** 解析 CSV 行 (处理引用字段内的逗号) */
function parseCsvLine(line: string): string[] {
  const cols: string[] = [];
  let current = "";
  let inQuotes = false;
  for (const ch of line) {
    if (ch === '"') {
      inQuotes = !inQuotes;
    } else if (ch === "," && !inQuotes) {
      cols.push(current.trim());
      current = "";
    } else {
      current += ch;
    }
  }
  cols.push(current.trim());
  return cols;
}

/** 清洗单个值: 去除百分号, 转为有效数值 */
function cleanNumber(raw: string): number {
  if (!raw || raw.trim() === "") return 0;
  const cleaned = raw.trim().replace(/%/g, "").replace(/["']/g, "");
  const n = parseFloat(cleaned);
  return isNaN(n) ? 0 : n;
}

// ======================== 主导入逻辑 ========================

async function importCsv() {
  const { csvPath, dropFirst } = parseArgs();

  console.log("════════════════════════════════════════");
  console.log("  CSV → SQLite 数据导入");
  console.log("════════════════════════════════════════");
  console.log(`  CSV:  ${csvPath}`);
  console.log(`  DB:   ${DB_PATH}`);
  console.log(`  批量: ${BATCH_SIZE} 行/事务\n`);

  if (!fs.existsSync(csvPath)) {
    console.error(`[ERROR] CSV 文件不存在: ${csvPath}`);
    console.error("  请先运行 Python 爬虫: python python/crawler.py");
    process.exit(1);
  }

  const db = await open({
    filename: DB_PATH,
    driver: sqlite3.Database,
  });

  
  // 确保表存在
  await db.exec(`CREATE TABLE IF NOT EXISTS team_stats (
    team_name       TEXT    NOT NULL,
    team_name_cn    TEXT    NOT NULL,
    team_id         TEXT    NOT NULL UNIQUE,
    league          TEXT    NOT NULL,
    league_cn       TEXT    NOT NULL,
    goals           INTEGER DEFAULT 0,
    conceded        INTEGER DEFAULT 0,
    goalDifference  INTEGER DEFAULT 0,
    shots           INTEGER DEFAULT 0,
    shotsOnTarget   INTEGER DEFAULT 0,
    assists         INTEGER DEFAULT 0,
    passes          INTEGER DEFAULT 0,
    corners         INTEGER DEFAULT 0,
    fouls           INTEGER DEFAULT 0,
    redCards        INTEGER DEFAULT 0,
    yellowCards     INTEGER DEFAULT 0,
    penalties       INTEGER DEFAULT 0,
    cleanSheets     INTEGER DEFAULT 0,
    avgGoals        REAL    DEFAULT 0,
    avgConceded     REAL    DEFAULT 0,
    avgGoalDiff     REAL    DEFAULT 0,
    avgCorners      REAL    DEFAULT 0,
    possession      REAL    DEFAULT 0,
    tackles         INTEGER DEFAULT 0,
    interceptions   INTEGER DEFAULT 0,
    clearances      INTEGER DEFAULT 0,
    offsides        INTEGER DEFAULT 0,
    foulsSuffered   INTEGER DEFAULT 0,
    keyPasses       INTEGER DEFAULT 0,
    crosses         INTEGER DEFAULT 0,
    crossesSuccessful    INTEGER DEFAULT 0,
    successfulCrosses    INTEGER DEFAULT 0,
    longBalls       INTEGER DEFAULT 0,
    successfulLongBalls  INTEGER DEFAULT 0,
    freeKicks       INTEGER DEFAULT 0,
    freeKickGoals   INTEGER DEFAULT 0,
    dribbles        INTEGER DEFAULT 0,
    successfulDribbles   INTEGER DEFAULT 0,
    duelsWon        INTEGER DEFAULT 0,
    fastBreaks      INTEGER DEFAULT 0,
    fastBreakShots  INTEGER DEFAULT 0,
    fastBreakGoals  INTEGER DEFAULT 0,
    hitWoodwork     INTEGER DEFAULT 0,
    possessionLost  INTEGER DEFAULT 0,
    twoYellowRedCards     INTEGER DEFAULT 0,
    effectiveBlocks       INTEGER DEFAULT 0,
    passesSuccessful INTEGER DEFAULT 0,
    duelsTotal       INTEGER DEFAULT 0,
    last_updated    DATETIME DEFAULT (datetime('now')),
    data_source     TEXT    DEFAULT 'crawler'
  )`);

  // 清空表
  if (dropFirst) {
    console.log("[INFO] 清空 team_stats 表...");
    await db.exec("DELETE FROM team_stats");
  }

  // 读取 CSV
  const raw = fs.readFileSync(csvPath, "utf-8");
  const allLines = raw.split(/\r?\n/).filter((l) => l.trim());
  if (allLines.length < 2) {
    console.error("[ERROR] CSV 文件为空或仅有表头");
    await db.close();
    process.exit(1);
  }

  // 解析表头
  const header = parseCsvLine(allLines[0]);
  console.log(`[INFO] CSV 表头: ${header.length} 列`);
  console.log(`[INFO] CSV 数据: ${allLines.length - 1} 行`);

  // 构建 INSERT SQL (每行精确指定列)
  const insertCols = CSV_COLUMNS.join(", ");
  const placeholders = CSV_COLUMNS.map(() => "?").join(", ");
  const insertSql = `INSERT OR REPLACE INTO team_stats (${insertCols}) VALUES (${placeholders})`;

  // 清空错误日志
  fs.writeFileSync(ERROR_LOG, `# Import Errors — ${new Date().toISOString()}\n`, "utf-8");

  let success = 0;
  let failed = 0;
  let batch: any[][] = [];

  for (let i = 1; i < allLines.length; i++) {
    const cols = parseCsvLine(allLines[i]);
    if (cols.length < 5) {
      failed++;
      fs.appendFileSync(ERROR_LOG, `[行${i}] 列数不足 (${cols.length})\n`, "utf-8");
      continue;
    }

    try {
      // 构建行数据: 按 CSV_COLUMNS 顺序取 CSV 列值
      const row: any[] = CSV_COLUMNS.map((colName) => {
        const idx = header.indexOf(colName);
        if (idx < 0 || idx >= cols.length) return colName === "possession" ? 0 : 0;
        const raw = cols[idx];

        // 数值列: 清洗 + 转为数字
        if (colName === "possession") {
          return cleanNumber(raw);
        }
        // 文本列: 原样
        if (["team_name", "team_name_cn", "team_id", "league", "league_cn"].includes(colName)) {
          return raw.replace(/"/g, "").trim();
        }
        // 其他数值列
        return cleanNumber(raw);
      });

      batch.push(row);
      success++;

      // 批量写入
      if (batch.length >= BATCH_SIZE) {
        await writeBatch(db, insertSql, batch);
        console.log(`  进度: ${success}/${allLines.length - 1}`);
        batch = [];
      }
    } catch (err: any) {
      failed++;
      fs.appendFileSync(
        ERROR_LOG,
        `[行${i}] ${err.message?.slice(0, 100)}\n数据: ${allLines[i].slice(0, 120)}\n`,
        "utf-8"
      );
    }
  }

  // 写入剩余批次
  if (batch.length > 0) {
    await writeBatch(db, insertSql, batch);
    console.log(`  进度: ${success}/${allLines.length - 1}`);
  }

  await db.close();

  // 最终报告
  console.log("\n════════════════════════════════════════");
  console.log(`  导入完成!`);
  console.log(`  成功: ${success}  失败: ${failed}`);
  if (failed > 0) {
    console.log(`  错误日志: ${ERROR_LOG}`);
  }
  console.log("════════════════════════════════════════");
}

async function writeBatch(db: any, sql: string, rows: any[][]) {
  await db.exec("BEGIN");
  try {
    for (const row of rows) {
      await db.run(sql, row);
    }
    await db.exec("COMMIT");
  } catch (err) {
    await db.exec("ROLLBACK");
    throw err;
  }
}

importCsv().catch((err) => {
  console.error("[FATAL]", err);
  process.exit(1);
});
