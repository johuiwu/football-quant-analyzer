#!/usr/bin/env python3
"""检查数据库数据"""

import sqlite3
import os

DB_PATH = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'database', 'football_data.db')

def check_database():
    print("=" * 60)
    print("  检查数据库数据")
    print("=" * 60)
    print(f"  数据库路径: {DB_PATH}")
    print(f"  文件存在: {os.path.exists(DB_PATH)}")
    
    if not os.path.exists(DB_PATH):
        print("\n  ❌ 数据库文件不存在!")
        return
    
    try:
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()
        
        # 检查表是否存在
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table';")
        tables = cursor.fetchall()
        print(f"\n  数据库表: {[t[0] for t in tables]}")
        
        # 检查 team_stats 表
        cursor.execute("SELECT COUNT(*) FROM team_stats;")
        count = cursor.fetchone()[0]
        print(f"  team_stats 记录数: {count}")
        
        # 按联赛统计
        cursor.execute("SELECT league_cn, COUNT(*) FROM team_stats GROUP BY league_cn ORDER BY COUNT(*) DESC;")
        leagues = cursor.fetchall()
        print("\n  各联赛数据统计:")
        for league, cnt in leagues:
            print(f"    {league}: {cnt} 支球队")
        
        # 检查字段
        cursor.execute("PRAGMA table_info(team_stats);")
        columns = cursor.fetchall()
        print(f"\n  表字段数: {len(columns)}")
        
        # 检查一些示例数据
        cursor.execute("SELECT team_id, team_name_cn, league_cn FROM team_stats LIMIT 5;")
        sample = cursor.fetchall()
        print("\n  示例数据:")
        for row in sample:
            print(f"    {row[0]} - {row[1]} ({row[2]})")
        
        conn.close()
        
        print("\n" + "=" * 60)
        print("  检查完成!")
        print("=" * 60)
        
    except Exception as e:
        print(f"\n  ❌ 数据库操作失败: {e}")

if __name__ == "__main__":
    check_database()
