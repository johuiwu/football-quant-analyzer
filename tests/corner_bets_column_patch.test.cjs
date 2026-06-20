/**
 * 端到端测试：验证 corner_bets 表列补齐和自动投注记录创建
 * 运行方式: node tests/corner_bets_column_patch.test.cjs
 */
const sqlite3 = require("sqlite3");
const path = require("path");
const fs = require("fs");
const assert = require("assert");

// 使用临时文件数据库（避免影响生产数据）
const TEST_DB_PATH = path.join(__dirname, "_test_corner_bets.db");

function cleanup() {
  for (const f of [TEST_DB_PATH, TEST_DB_PATH + "-wal", TEST_DB_PATH + "-shm"]) {
    try { fs.unlinkSync(f); } catch {}
  }
}

// sqlite3 异步包装
function openDb() {
  return new Promise((resolve, reject) => {
    const db = new sqlite3.Database(TEST_DB_PATH, (err) => {
      if (err) reject(err);
      else resolve(db);
    });
  });
}

function runSql(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) reject(err);
      else resolve({ lastID: this.lastID, changes: this.changes });
    });
  });
}

function allSql(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
}

function closeDb(db) {
  return new Promise((resolve, reject) => {
    db.close((err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

// 列补齐逻辑（与 cornerBetService.js 中 ensureBetTable 一致）
async function patchColumns(db) {
  const columns = await allSql(db, "PRAGMA table_info(corner_bets)");
  const existingCols = new Set(columns.map((c) => c.name));
  const missingCols = [
    { name: "retry_count", def: "INTEGER DEFAULT 0" },
    { name: "bet_target", def: "TEXT DEFAULT NULL" },
    { name: "error_reason", def: "TEXT DEFAULT NULL" },
  ];
  for (const col of missingCols) {
    if (!existingCols.has(col.name)) {
      try {
        await runSql(db, `ALTER TABLE corner_bets ADD COLUMN ${col.name} ${col.def}`);
        console.log(`  [patch] 已添加列: ${col.name}`);
      } catch (alterErr) {
        if (!alterErr.message.includes("duplicate column")) {
          throw alterErr;
        }
        console.log(`  [patch] 列已存在，跳过: ${col.name}`);
      }
    }
  }
}

async function test1_OldTableColumnPatch() {
  console.log("\n=== 测试1: 旧表列补齐 ===");
  cleanup();
  const db = await openDb();

  try {
    // 创建旧版 corner_bets 表（不含 bet_target、error_reason、retry_count）
    await runSql(db, `CREATE TABLE corner_bets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      match_id TEXT NOT NULL,
      match_name TEXT,
      strategy_id TEXT,
      odds REAL,
      amount INTEGER DEFAULT 0,
      status TEXT DEFAULT 'pending',
      error_message TEXT,
      executed_at TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )`);
    console.log("  旧版 corner_bets 表已创建（无 bet_target/error_reason/retry_count）");

    // 验证旧表不含新列
    let columns = await allSql(db, "PRAGMA table_info(corner_bets)");
    let colNames = columns.map((c) => c.name);
    assert(!colNames.includes("bet_target"), "旧表不应包含 bet_target");
    assert(!colNames.includes("error_reason"), "旧表不应包含 error_reason");
    assert(!colNames.includes("retry_count"), "旧表不应包含 retry_count");
    console.log("  验证通过：旧表确实缺少新列");

    // 执行列补齐
    await patchColumns(db);

    // 验证补齐后包含新列
    columns = await allSql(db, "PRAGMA table_info(corner_bets)");
    colNames = columns.map((c) => c.name);
    assert(colNames.includes("bet_target"), "补齐后应包含 bet_target");
    assert(colNames.includes("error_reason"), "补齐后应包含 error_reason");
    assert(colNames.includes("retry_count"), "补齐后应包含 retry_count");
    console.log("  验证通过：列补齐成功，所有新列已添加");

    console.log("  [PASS] 测试1通过");
  } finally {
    await closeDb(db);
    cleanup();
  }
}

async function test2_InsertWithBetTarget() {
  console.log("\n=== 测试2: 投注记录创建（含 bet_target） ===");
  cleanup();
  const db = await openDb();

  try {
    // 创建完整表
    await runSql(db, `CREATE TABLE corner_bets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      match_id TEXT NOT NULL,
      match_name TEXT,
      strategy_id TEXT,
      odds REAL,
      amount INTEGER DEFAULT 0,
      status TEXT DEFAULT 'pending',
      error_message TEXT,
      executed_at TEXT,
      retry_count INTEGER DEFAULT 0,
      bet_target TEXT DEFAULT NULL,
      error_reason TEXT DEFAULT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )`);

    // 插入含 bet_target 的投注记录
    const result = await runSql(db,
      "INSERT INTO corner_bets (match_id, match_name, strategy_id, odds, amount, status, bet_target) VALUES (?, ?, ?, ?, ?, ?, ?)",
      ["test-match-001", "TeamA vs TeamB", "strategy-1", 1.85, 100, "pending", "大 11.5"]
    );
    assert(result.lastID > 0, "插入应返回有效 ID");
    console.log(`  投注记录已创建，ID: ${result.lastID}`);

    // 查询验证
    const rows = await allSql(db, "SELECT * FROM corner_bets WHERE id = ?", [result.lastID]);
    assert(rows.length === 1, "应查询到1条记录");
    assert(rows[0].bet_target === "大 11.5", `bet_target 应为 '大 11.5'，实际为 '${rows[0].bet_target}'`);
    assert(rows[0].match_id === "test-match-001", "match_id 应正确");
    assert(rows[0].status === "pending", "status 应为 pending");
    console.log("  验证通过：bet_target 正确写入和读取");

    console.log("  [PASS] 测试2通过");
  } finally {
    await closeDb(db);
    cleanup();
  }
}

async function test3_ErrorReasonOnFailure() {
  console.log("\n=== 测试3: 失败场景 error_reason 写入 ===");
  cleanup();
  const db = await openDb();

  try {
    // 创建完整表并插入 pending 记录
    await runSql(db, `CREATE TABLE corner_bets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      match_id TEXT NOT NULL,
      match_name TEXT,
      strategy_id TEXT,
      odds REAL,
      amount INTEGER DEFAULT 0,
      status TEXT DEFAULT 'pending',
      error_message TEXT,
      executed_at TEXT,
      retry_count INTEGER DEFAULT 0,
      bet_target TEXT DEFAULT NULL,
      error_reason TEXT DEFAULT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )`);

    const insertResult = await runSql(db,
      "INSERT INTO corner_bets (match_id, match_name, strategy_id, odds, amount, status, bet_target) VALUES (?, ?, ?, ?, ?, ?, ?)",
      ["test-match-002", "TeamC vs TeamD", "strategy-2", 2.10, 200, "pending", "小 9.5"]
    );

    // 模拟投注失败，更新状态和 error_reason
    await runSql(db,
      "UPDATE corner_bets SET status = 'failed', error_reason = ?, error_message = ?, executed_at = ? WHERE id = ?",
      ["余额不足", "余额不足", new Date().toISOString(), insertResult.lastID]
    );

    // 验证
    const rows = await allSql(db, "SELECT * FROM corner_bets WHERE id = ?", [insertResult.lastID]);
    assert(rows[0].status === "failed", "状态应为 failed");
    assert(rows[0].error_reason === "余额不足", `error_reason 应为 '余额不足'，实际为 '${rows[0].error_reason}'`);
    assert(rows[0].error_message === "余额不足", "error_message 应正确");
    console.log("  验证通过：error_reason 正确写入失败记录");

    console.log("  [PASS] 测试3通过");
  } finally {
    await closeDb(db);
    cleanup();
  }
}

async function test4_AlterTableIdempotent() {
  console.log("\n=== 测试4: 重复列补齐不报错 ===");
  cleanup();
  const db = await openDb();

  try {
    // 创建完整表（已包含所有列）
    await runSql(db, `CREATE TABLE corner_bets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      match_id TEXT NOT NULL,
      match_name TEXT,
      strategy_id TEXT,
      odds REAL,
      amount INTEGER DEFAULT 0,
      status TEXT DEFAULT 'pending',
      error_message TEXT,
      executed_at TEXT,
      retry_count INTEGER DEFAULT 0,
      bet_target TEXT DEFAULT NULL,
      error_reason TEXT DEFAULT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )`);

    // 再次执行列补齐（所有列已存在）
    await patchColumns(db);

    // 验证表结构完整
    const columns = await allSql(db, "PRAGMA table_info(corner_bets)");
    const colNames = columns.map((c) => c.name);
    assert(colNames.includes("bet_target"), "应包含 bet_target");
    assert(colNames.includes("error_reason"), "应包含 error_reason");
    assert(colNames.includes("retry_count"), "应包含 retry_count");
    console.log("  验证通过：重复补齐不报错，表结构完整");

    console.log("  [PASS] 测试4通过");
  } finally {
    await closeDb(db);
    cleanup();
  }
}

async function test5_FullAutoBetFlow() {
  console.log("\n=== 测试5: 完整自动投注流程（旧表 → 补齐 → 插入 → 更新） ===");
  cleanup();
  const db = await openDb();

  try {
    // Step 1: 创建旧版表
    await runSql(db, `CREATE TABLE corner_bets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      match_id TEXT NOT NULL,
      match_name TEXT,
      strategy_id TEXT,
      odds REAL,
      amount INTEGER DEFAULT 0,
      status TEXT DEFAULT 'pending',
      error_message TEXT,
      executed_at TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )`);
    console.log("  Step 1: 旧版表已创建");

    // Step 2: 列补齐
    await patchColumns(db);
    console.log("  Step 2: 列补齐完成");

    // Step 3: 策略触发，创建投注记录
    const insertResult = await runSql(db,
      "INSERT INTO corner_bets (match_id, match_name, strategy_id, odds, amount, status, bet_target, created_at) VALUES (?, ?, ?, ?, ?, 'pending', ?, ?)",
      ["match-auto-001", "AutoTeam vs ManualTeam", "strategy-auto", 1.95, 150, "让球 0/0.5 客队", new Date().toISOString()]
    );
    console.log(`  Step 3: 投注记录已创建，ID: ${insertResult.lastID}`);

    // Step 4: 模拟投注执行失败
    await runSql(db,
      "UPDATE corner_bets SET status = 'insufficient', error_message = ?, error_reason = ?, executed_at = ?, retry_count = ?, bet_target = ? WHERE id = ?",
      ["余额不足", "余额不足", new Date().toISOString(), 1, "让球 0/0.5 客队", insertResult.lastID]
    );
    console.log("  Step 4: 投注状态已更新为 insufficient");

    // Step 5: 验证完整数据持久化
    const rows = await allSql(db, "SELECT * FROM corner_bets WHERE id = ?", [insertResult.lastID]);
    const row = rows[0];
    assert(row.match_id === "match-auto-001", "match_id 正确");
    assert(row.bet_target === "让球 0/0.5 客队", `bet_target 正确，实际: ${row.bet_target}`);
    assert(row.status === "insufficient", "status 正确");
    assert(row.error_reason === "余额不足", `error_reason 正确，实际: ${row.error_reason}`);
    assert(row.retry_count === 1, "retry_count 正确");
    console.log("  Step 5: 数据持久化验证通过");

    console.log("  [PASS] 测试5通过");
  } finally {
    await closeDb(db);
    cleanup();
  }
}

// 主函数
async function main() {
  console.log("========================================");
  console.log("corner_bets 列补齐 & 自动投注流程测试");
  console.log("========================================");

  let passed = 0;
  let failed = 0;

  const tests = [
    test1_OldTableColumnPatch,
    test2_InsertWithBetTarget,
    test3_ErrorReasonOnFailure,
    test4_AlterTableIdempotent,
    test5_FullAutoBetFlow,
  ];

  for (const test of tests) {
    try {
      await test();
      passed++;
    } catch (err) {
      failed++;
      console.error(`  [FAIL] ${test.name}: ${err.message}`);
    }
  }

  console.log("\n========================================");
  console.log(`测试结果: ${passed} 通过, ${failed} 失败, 共 ${tests.length} 项`);
  console.log("========================================");

  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("测试运行失败:", err);
  process.exit(1);
});
