import sqlite3, json

db_path = r"D:\下载\足球竞彩量化分析系统\足球竞彩量化分析系统\database\football_data.db"
conn = sqlite3.connect(db_path)
cur = conn.cursor()

# Re-populate: fix xG fields to use float instead of int
cur.execute("SELECT team_id, home_stats, away_stats FROM teams")
rows = cur.fetchall()

# Fields that need float (xG), others are integer
home_fields = ["played", "wins", "draws", "losses", "goalsFor", "goalsAgainst", "xgFor", "xgAgainst"]
away_fields = ["played", "wins", "draws", "losses", "goalsFor", "goalsAgainst", "xgFor", "xgAgainst"]
home_cols = ["home_played", "home_wins", "home_draws", "home_losses", "home_goals_for", "home_goals_against", "home_xg_for", "home_xg_against"]
away_cols = ["away_played", "away_wins", "away_draws", "away_losses", "away_goals_for", "away_goals_against", "away_xg_for", "away_xg_against"]

# xG fields are at indices 6,7 out of 8 (0-based)
xg_indices = {6, 7}

updated = 0
for team_id, home_json, away_json in rows:
    try:
        home = json.loads(home_json) if home_json and home_json.strip() else {}
        away = json.loads(away_json) if away_json and away_json.strip() else {}
        if not home and not away:
            continue

        set_clauses = []
        params = []

        for i, field in enumerate(home_fields):
            set_clauses.append(f"{home_cols[i]} = ?")
            val = home.get(field, 0) or 0
            params.append(float(val) if i in xg_indices else int(val))

        for i, field in enumerate(away_fields):
            set_clauses.append(f"{away_cols[i]} = ?")
            val = away.get(field, 0) or 0
            params.append(float(val) if i in xg_indices else int(val))

        params.append(team_id)
        cur.execute(f"UPDATE teams SET {', '.join(set_clauses)} WHERE team_id = ?", params)
        updated += 1
    except Exception as e:
        print(f"  ERROR [{team_id}]: {e}")

conn.commit()
print(f"Re-migrated {updated} rows with correct xG float values")

# Verify
print("\nVerification (first 3, comparing JSON vs flat):")
cur.execute("""
    SELECT team_id, team_name_cn, home_stats, home_xg_for, home_xg_against,
           away_xg_for, away_xg_against
    FROM teams LIMIT 3
""")
for row in cur.fetchall():
    hs = json.loads(row[2]) if row[2] else {}
    print(f"  {row[0]} ({row[1]}): JSON[xGF={hs.get('xgFor')} xGA={hs.get('xgAgainst')}] FLAT[hxGF={row[3]} hxGA={row[4]} axGF={row[5]} axGA={row[6]}]")

conn.close()
print("Done.")