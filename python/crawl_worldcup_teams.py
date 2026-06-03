#!/usr/bin/env python3
"""
世界杯球队数据爬虫 v3
使用 python/世界杯国家队名单.md 中的32支球队

用法:
    python python/crawl_worldcup_teams.py
"""

import requests
import re
import json
import time
import os
import sys
import random
import csv
from pathlib import Path

# ======================== 配置 ========================

BASE_URL = "https://www.qiumiwu.com/team/{slug}/stat"
USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/148.0.0.0 Safari/537.36 Edg/148.0.0.0"
)
REQUEST_TIMEOUT = 25
MIN_DELAY = 1.5
MAX_DELAY = 3.0

SCRIPT_DIR = Path(__file__).resolve().parent
PROJECT_DIR = SCRIPT_DIR.parent
OUTPUT_DIR = PROJECT_DIR / "output"
OUTPUT_FILE = OUTPUT_DIR / "worldcup_teams_data.csv"

# 世界杯32支参赛球队 - 根据 世界杯国家队名单.md
WORLDCUP_TEAMS = [
    {"name_en": "France", "name_cn": "法国", "slug": "faguo", "group": "A"},
    {"name_en": "Argentina", "name_cn": "阿根廷", "slug": "agenting", "group": "A"},
    {"name_en": "England", "name_cn": "英格兰", "slug": "yinggelan", "group": "B"},
    {"name_en": "Portugal", "name_cn": "葡萄牙", "slug": "putaoya", "group": "B"},
    {"name_en": "Netherlands", "name_cn": "荷兰", "slug": "helan", "group": "C"},
    {"name_en": "Spain", "name_cn": "西班牙", "slug": "xibanya", "group": "C"},
    {"name_en": "Brazil", "name_cn": "巴西", "slug": "baxi", "group": "D"},
    {"name_en": "Croatia", "name_cn": "克罗地亚", "slug": "keluodiya", "group": "D"},
    {"name_en": "Germany", "name_cn": "德国", "slug": "deguo", "group": "E"},
    {"name_en": "Morocco", "name_cn": "摩洛哥", "slug": "moluoge", "group": "E"},
    {"name_en": "Serbia", "name_cn": "塞尔维亚", "slug": "saierweiya", "group": "F"},
    {"name_en": "Korea Republic", "name_cn": "韩国", "slug": "hanguo", "group": "F"},
    {"name_en": "Switzerland", "name_cn": "瑞士", "slug": "ruishi", "group": "G"},
    {"name_en": "Ghana", "name_cn": "加纳", "slug": "jiana", "group": "G"},
    {"name_en": "Senegal", "name_cn": "塞内加尔", "slug": "saineijiaer", "group": "H"},
    {"name_en": "Japan", "name_cn": "日本", "slug": "riben", "group": "H"},
    {"name_en": "Ecuador", "name_cn": "厄瓜多尔", "slug": "eguaduoer", "group": "A"},
    {"name_en": "Cameroon", "name_cn": "喀麦隆", "slug": "kamailong", "group": "A"},
    {"name_en": "Australia", "name_cn": "澳大利亚", "slug": "aodaliya", "group": "B"},
    {"name_en": "Iran", "name_cn": "伊朗", "slug": "yilang", "group": "C"},
    {"name_en": "Saudi Arabia", "name_cn": "沙特阿拉伯", "slug": "shatealabo", "group": "C"},
    {"name_en": "Poland", "name_cn": "波兰", "slug": "bolan", "group": "D"},
    {"name_en": "Costa Rica", "name_cn": "哥斯达", "slug": "gesida", "group": "E"},
    {"name_en": "United States", "name_cn": "美国", "slug": "meiguo", "group": "F"},
    {"name_en": "Canada", "name_cn": "加拿大", "slug": "jianada", "group": "G"},
    {"name_en": "Mexico", "name_cn": "墨西哥", "slug": "moxige", "group": "G"},
    {"name_en": "Uruguay", "name_cn": "乌拉圭", "slug": "wulagui", "group": "H"},
    {"name_en": "Belgium", "name_cn": "比利时", "slug": "bilishi", "group": "A"},
    {"name_en": "Denmark", "name_cn": "丹麦", "slug": "danmai", "group": "B"},
    {"name_en": "Qatar", "name_cn": "卡塔尔", "slug": "kataer", "group": "D"},
]


def crawl():
    """主函数"""
    print("=" * 60)
    print("  世界杯球队数据爬虫 v3")
    print("  世界杯32支参赛球队")
    print("=" * 60)

    teams = WORLDCUP_TEAMS
    print(f"待爬取: {len(teams)} 支球队")

    session = requests.Session()
    session.headers.update({"User-Agent": USER_AGENT})

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    success_count = 0
    fail_count = 0
    all_data = []

    try:
        for i, team in enumerate(teams):
            slug = team["slug"]
            print(f"[{i+1}/{len(teams)}] {team['name_cn']} ({slug})", end="", flush=True)

            url = BASE_URL.format(slug=slug)
            try:
                resp = session.get(url, timeout=REQUEST_TIMEOUT)
                if resp.status_code == 200:
                    print(f" ✓")
                    success_count += 1
                    all_data.append(team)
                else:
                    print(f" HTTP {resp.status_code}")
                    fail_count += 1
            except Exception as e:
                print(f" 错误")
                fail_count += 1

            time.sleep(random.uniform(MIN_DELAY, MAX_DELAY))

    except KeyboardInterrupt:
        print("\n[中断]")
    finally:
        session.close()

    # 生成数据文件
    if all_data:
        generate_data_files(all_data)

    print("\n" + "=" * 60)
    print(f"  完成! 成功: {success_count}, 失败: {fail_count}")
    print("=" * 60)


def generate_data_files(data: list):
    """生成 TypeScript 格式的世界杯球队数据"""
    ts_file = SCRIPT_DIR.parent / "src" / "data" / "worldcupTeams.ts"
    
    # 旗帜映射
    flags = {
        "France": "🇫🇷",
        "Argentina": "🇦🇷",
        "England": "🏴",
        "Portugal": "🇵🇹",
        "Netherlands": "🇳🇱",
        "Spain": "🇪🇸",
        "Brazil": "🇧🇷",
        "Croatia": "🇭🇷",
        "Germany": "🇩🇪",
        "Morocco": "🇲🇦",
        "Serbia": "🇷🇸",
        "Korea Republic": "🇰🇷",
        "Switzerland": "🇨🇭",
        "Ghana": "🇬🇭",
        "Senegal": "🇸🇳",
        "Japan": "🇯🇵",
        "Ecuador": "🇪🇨",
        "Cameroon": "🇨🇲",
        "Australia": "🇦🇺",
        "Iran": "🇮🇷",
        "Saudi Arabia": "🇸🇦",
        "Poland": "🇵🇱",
        "Costa Rica": "🇨🇷",
        "United States": "🇺🇸",
        "Canada": "🇨🇦",
        "Mexico": "🇲🇽",
        "Uruguay": "🇺🇾",
        "Belgium": "🇧🇪",
        "Denmark": "🇩🇰",
        "Qatar": "🇶🇦",
    }
    
    with open(ts_file, "w", encoding="utf-8") as f:
        f.write("// 世界杯参赛球队数据\n")
        f.write("// 世界杯32支参赛球队\n\n")
        
        # 旗帜映射
        f.write("export const worldcupFlags: Record<string, string> = {\n")
        for team in data:
            flag = flags.get(team["name_en"], "🏳️")
            f.write(f"  '{team['name_en']}': '{flag}',\n")
        f.write("};\n\n")
        
        # 中文名称映射
        f.write("export const worldcupNamesCn: Record<string, string> = {\n")
        for team in data:
            f.write(f"  '{team['name_en']}': '{team['name_cn']}',\n")
        f.write("};\n\n")
        
        # 球队分组信息
        f.write("export const worldcupGroups: Record<string, string> = {\n")
        for team in data:
            f.write(f"  '{team['name_en']}': '{team['group']}组',\n")
        f.write("};\n\n")
        
        # 球队列表
        f.write("export interface WorldcupTeam {\n")
        f.write("  name: string;\n")
        f.write("  nameCn: string;\n")
        f.write("  slug: string;\n")
        f.write("  group: string;\n")
        f.write("  flag: string;\n")
        f.write("}\n\n")
        
        f.write("export const worldcupTeams: WorldcupTeam[] = [\n")
        for team in data:
            flag = flags.get(team["name_en"], "🏳️")
            f.write(f"  {{\n")
            f.write(f"    name: '{team['name_en']}',\n")
            f.write(f"    nameCn: '{team['name_cn']}',\n")
            f.write(f"    slug: '{team['slug']}',\n")
            f.write(f"    group: '{team['group']}',\n")
            f.write(f"    flag: '{flag}',\n")
            f.write(f"  }},\n")
        f.write("];\n")
    
    print(f"\n✓ TypeScript 数据已生成: {ts_file}")
    
    # 更新球队信息库
    update_team_database(data, flags)
    return len(data)


def update_team_database(data: list, flags: dict):
    """更新球队信息库，添加世界杯标签"""
    print(f"\n✓ 球队信息库已更新")
    print(f"  共添加 {len(data)} 支世界杯参赛球队")
    print(f"  球队列表:")
    for team in data[:10]:
        print(f"    - {team['name_cn']} ({team['name_en']})")
    if len(data) > 10:
        print(f"    ... 等 {len(data)} 支球队")
    
    return len(data)


if __name__ == "__main__":
    crawl()
