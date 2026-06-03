#!/usr/bin/env python3
"""检查哪些球队在数据库中没有数据"""

import sqlite3
import os

DB_PATH = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'database', 'football_data.db')

def check_missing_teams():
    print("=" * 60)
    print("  检查缺失数据的球队")
    print("=" * 60)
    
    # 从前端文件读取球队列表
    league_teams_file = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'src', 'data', 'leagueTeams.ts')
    
    if not os.path.exists(league_teams_file):
        print(f"  ❌ 未找到 leagueTeams.ts 文件")
        return
    
    with open(league_teams_file, 'r', encoding='utf-8') as f:
        content = f.read()
    
    # 提取所有球队id
    import re
    team_ids = []
    matches = re.findall(r'id:"([^"]+)"', content)
    team_ids.extend(matches)
    
    print(f"  前端定义的球队数: {len(team_ids)}")
    
    # 连接数据库
    if not os.path.exists(DB_PATH):
        print(f"\n  ❌ 数据库文件不存在!")
        return
    
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    
    # 获取数据库中的球队id
    cursor.execute("SELECT team_id FROM team_stats;")
    db_team_ids = [row[0] for row in cursor.fetchall()]
    print(f"  数据库中的球队数: {len(db_team_ids)}")
    
    # 找出缺失的球队
    missing_teams = [tid for tid in team_ids if tid not in db_team_ids]
    
    if missing_teams:
        print(f"\n  [FAIL] 缺失数据的球队 ({len(missing_teams)} 支):")
        for tid in missing_teams:
            print(f"    - {tid}")
    else:
        print("\n  [OK] 所有前端定义的球队都有数据库数据")
    
    # 检查数据库中有但前端没有的球队
    extra_teams = [tid for tid in db_team_ids if tid not in team_ids]
    if extra_teams:
        print(f"\n  [WARN] 数据库中有但前端未定义的球队 ({len(extra_teams)} 支):")
        for tid in extra_teams:
            cursor.execute("SELECT team_name_cn, league_cn FROM team_stats WHERE team_id = ?;", (tid,))
            result = cursor.fetchone()
            if result:
                print("    - %s (%s, %s)" % (tid, result[0], result[1]))
            else:
                print(f"    - {tid}")
    
    conn.close()
    
    print("\n" + "=" * 60)
    print("  检查完成!")
    print("=" * 60)

if __name__ == "__main__":
    check_missing_teams()
