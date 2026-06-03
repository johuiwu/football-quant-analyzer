/**
 * P1-6: JSON 字段反规范化迁移脚本
 * 将 teams 表的 home_stats/away_stats JSON 列拆分为 16 个独立平面列
 * 幂等设计：重复运行安全
 */
const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

// 使用 Python 内置 sqlite3 执行迁移（避免 better-sqlite3 依赖问题）
const DB_PATH = path.join(__dirname, '..', 'database', 'football_data.db');
const PY_SCRIPT = `
import sqlite3, json, sys

db_path = sys.argv[1]
conn = sqlite3.connect(db_path)
cur = conn.cursor()

# ===== 新列定义 =====
new_columns = [
    # home_stats fields
    ('home_played', 'INTEGER DEFAULT 0'),
    ('home_wins', 'INTEGER DEFAULT 0'),
    ('home_draws', 'INTEGER DEFAULT 0'),
    ('home_losses', 'INTEGER DEFAULT 0'),
    ('home_goals_for', 'INTEGER DEFAULT 0'),
    ('home_goals_against', 'INTEGER DEFAULT 0'),
    ('home_xg_for', 'REAL DEFAULT 0'),
    ('home_xg_against', 'REAL DEFAULT 0'),
    # away_stats fields
    ('away_played', 'INTEGER DEFAULT 0'),
    ('away_wins', 'INTEGER DEFAULT 0'),
    ('away_draws', 'INTEGER DEFAULT 0'),
    ('away_losses', 'INTEGER DEFAULT 0'),
    ('away_goals_for', 'INTEGER DEFAULT 0'),
    ('away_goals_against', 'INTEGER DEFAULT 0'),
    ('away_xg_for', 'REAL DEFAULT 0'),
    ('away_xg_against', 'INTEGER DEFAULT 0'),
]

# ===== Step 1: 添加列（幂等：跳过已存在的列） =====
existing_cols = set()
cur.execute("PRAGMA table_info(teams)")
for row in cur.fetchall():
    existing_cols.add(row[1])

added = 0
skipped = 0
for col_name, col_type in new_columns:
    if col_name in existing_cols:
        skipped += 1
    else:
        cur.execute(f"ALTER TABLE teams ADD COLUMN {col_name} {col_type}")
        added += 1
        print(f"  + ADDED: {col_name} {col_type}")

print(f"\nColumns: {added} added, {skipped} already exist")

# ===== Step 2: 提取 JSON 数据填充平面列 =====
cur.execute("SELECT team_id, home_stats, away_stats FROM teams")
rows = cur.fetchall()

home_fields = ['played', 'wins', 'draws', 'losses', 'goalsFor', 'goalsAgainst', 'xgFor', 'xgAgainst']
away_fields = ['played', 'wins', 'draws', 'losses', 'goalsFor', 'goalsAgainst', 'xgFor', 'xgAgainst']
home_cols = ['home_played', 'home_wins', 'home_draws', 'home_losses', 'home_goals_for', 'home_goals_against', 'home_xg_for', 'home_xg_against']
away_cols = ['away_played', 'away_wins', 'away_draws', 'away_losses', 'away_goals_for', 'away_goals_against', 'away_xg_for', 'away_xg_against']

updated = 0
empty_json = 0
errors = 0

for team_id, home_json, away_json in rows:
    try:
        # 解析 JSON
        home = json.loads(home_json) if home_json and home_json.strip() else {}
        away = json.loads(away_json) if away_json and away_json.strip() else {}

        if not home and not away:
            empty_json += 1
            continue

        # 构建 UPDATE 参数
        set_clauses = []
        params = []

        for i, field in enumerate(home_fields):
            set_clauses.append(f"{home_cols[i]} = ?")
            params.append(int(home.get(field, 0) or 0))

        for i, field in enumerate(away_fields):
            set_clauses.append(f"{away_cols[i]} = ?")
            params.append(int(away.get(field, 0) or 0))

        params.append(team_id)
        cur.execute(f"UPDATE teams SET {', '.join(set_clauses)} WHERE team_id = ?", params)
        updated += 1

    except Exception as e:
        print(f"  ERROR [{team_id}]: {e}")
        errors += 1

conn.commit()

# ===== 统计 =====
cur.execute("SELECT COUNT(*) FROM teams")
total = cur.fetchone()[0]

print(f"\nMigration complete:")
print(f"  Total teams:    {total}")
print(f"  Updated:        {updated}")
print(f"  Empty JSON:     {empty_json}")
print(f"  Errors:         {errors}")

# ===== Step 3: 抽样验证 =====
print(f"\nSample verification (first 3 rows):")
cur.execute("""
    SELECT team_id, team_name_cn,
           home_stats,
           home_played, home_wins, home_draws, home_losses,
           home_goals_for, home_goals_against
    FROM teams LIMIT 3
""")
for row in cur.fetchall():
    hs = json.loads(row[2]) if row[2] else {}
    print(f"  {row[0]} ({row[1]}):")
    print(f"    JSON:  played={hs.get('played')}, wins={hs.get('wins')}, draws={hs.get('draws')}, losses={hs.get('losses')}, GF={hs.get('goalsFor')}, GA={hs.get('goalsAgainst')}")
    print(f"    FLAT:  played={row[3]}, wins={row[4]}, draws={row[5]}, losses={row[6]}, GF={row[7]}, GA={row[8]}")

conn.close()
print("\nDone.")
`

function run() {
    console.log('P1-6: JSON Field Denormalization Migration');
    console.log('Database:', DB_PATH);
    console.log('');

    const tmpFile = path.join(__dirname, '..', '_migrate_p16.py');
    fs.writeFileSync(tmpFile, PY_SCRIPT, 'utf-8');

    try {
        const result = execSync(`python "${tmpFile}" "${DB_PATH}"`, {
            encoding: 'utf-8',
            stdio: 'pipe',
            timeout: 30000
        });
        console.log(result);
    } catch (err) {
        console.error('Migration failed:', err.stderr || err.message);
        process.exit(1);
    } finally {
        fs.unlinkSync(tmpFile);
    }
}

run();