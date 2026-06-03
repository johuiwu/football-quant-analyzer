#!/usr/bin/env python3
"""检查数据库中数据异常的球队"""

import sqlite3
import os

DB_PATH = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'database', 'football_data.db')

def check_zero_data():
    print("=" * 70)
    print("  检查数据库中数据异常的球队")
    print("=" * 70)
    
    if not os.path.exists(DB_PATH):
        print("  ERROR: 数据库文件不存在!")
        return
    
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    
    cursor.execute("""
        SELECT team_id, team_name_cn, league_cn, goals, conceded, shots, passes, corners, fouls
        FROM team_stats
        WHERE goals = 0 OR conceded = 0 OR shots = 0 OR passes = 0 OR corners = 0
        ORDER BY league_cn, team_name_cn
    """)
    
    zero_teams = cursor.fetchall()
    
    if zero_teams:
        print("  发现 %d 支球队存在零数据字段:" % len(zero_teams))
        print("-" * 70)
        print("  %-15s %-12s %-12s %4s %4s %4s %4s %4s %4s" % 
              ("team_id", "球队名", "联赛", "进球", "失球", "射门", "传球", "角球", "犯规"))
        print("-" * 70)
        for row in zero_teams:
            print("  %-15s %-12s %-12s %4d %4d %4d %4d %4d %4d" % row)
    
    cursor.execute("""
        SELECT team_id, team_name_cn, league_cn
        FROM team_stats
        WHERE goals IS NULL OR conceded IS NULL
        ORDER BY league_cn, team_name_cn
    """)
    
    null_teams = cursor.fetchall()
    
    if null_teams:
        print("\n  发现 %d 支球队存在空数据字段:" % len(null_teams))
        print("-" * 70)
        print("  %-15s %-12s %-12s" % ("team_id", "球队名", "联赛"))
        print("-" * 70)
        for row in null_teams:
            print("  %-15s %-12s %-12s" % row)
    
    conn.close()
    
    print("\n" + "=" * 70)
    print("  检查完成!")
    print("=" * 70)

if __name__ == "__main__":
    check_zero_data()
