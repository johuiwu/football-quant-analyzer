#!/usr/bin/env python3
"""清理数据库中的重复数据"""

import sqlite3
import os

DB_PATH = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'database', 'football_data.db')

def clean_duplicate():
    print("=" * 60)
    print("  清理数据库中的重复数据")
    print("=" * 60)
    
    if not os.path.exists(DB_PATH):
        print("  ERROR: 数据库文件不存在!")
        return
    
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    
    # 检查是否存在 arsenal 重复数据
    cursor.execute("SELECT * FROM team_stats WHERE team_id = 'arsenal';")
    arsenal_rows = cursor.fetchall()
    
    if len(arsenal_rows) > 0:
        print("  发现重复数据: arsenal")
        print("  删除重复数据...")
        cursor.execute("DELETE FROM team_stats WHERE team_id = 'arsenal';")
        conn.commit()
        print("  已删除重复数据!")
    else:
        print("  未发现重复数据")
    
    # 检查 asenna 是否存在（正确的记录）
    cursor.execute("SELECT * FROM team_stats WHERE team_id = 'asenna';")
    asenna_row = cursor.fetchone()
    if asenna_row:
        print("  正确的记录 asenna 存在")
    else:
        print("  警告: asenna 记录不存在!")
    
    conn.close()
    
    print("\n" + "=" * 60)
    print("  清理完成!")
    print("=" * 60)

if __name__ == "__main__":
    clean_duplicate()
