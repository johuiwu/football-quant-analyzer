#!/usr/bin/env python3
"""专门爬取失败的J联赛球队"""

import requests
import csv
from pathlib import Path
from bs4 import BeautifulSoup
import time
import random

# 配置
BASE_URL = "https://www.qiumiwu.com/team/{slug}/stat"
USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
REQUEST_TIMEOUT = 25
MIN_DELAY = 1.0
MAX_DELAY = 2.5

SCRIPT_DIR = Path(__file__).resolve().parent
PROJECT_DIR = SCRIPT_DIR.parent
OUTPUT_DIR = PROJECT_DIR / "output"
OUTPUT_FILE = OUTPUT_DIR / "all_teams_data.csv"

# 字段映射
HASH_TO_FIELD = {
    "goals":"goals","goals_against":"conceded","goal_diff":"goalDifference",
    "goal_difference":"goalDifference","corner_kicks":"corners","corners":"corners",
    "shots":"shots","shots_on_target":"shotsOnTarget","assists":"assists",
    "passes":"passes","penalty":"penalties","penalties":"penalties",
    "fouls":"fouls","red_cards":"redCards","yellow_cards":"yellowCards",
    "avg_goals":"avgGoals","avg_conceded":"avgConceded",
    "avg_goals_against":"avgConceded","avg_goal_diff":"avgGoalDiff",
    "avg_goal_difference":"avgGoalDiff","avg_corners":"avgCorners",
    "avg_corner_kicks":"avgCorners","possession":"possession",
    "ball_possession":"possession","tackles":"tackles",
    "interceptions":"interceptions","clearances":"clearances",
    "offsides":"offsides","was_fouled":"foulsSuffered",
    "fouls_suffered":"foulsSuffered","key_passes":"keyPasses",
    "crosses":"crosses","crosses_successful":"crossesSuccessful",
    "successful_crosses":"crossesSuccessful","crosses_accuracy":"crossesSuccessful",
    "long_balls":"longBalls","long_balls_successful":"successfulLongBalls",
    "successful_long_balls":"successfulLongBalls","long_balls_accuracy":"successfulLongBalls",
    "free_kicks":"freeKicks","freekicks":"freeKicks",
    "free_kick_goals":"freeKickGoals","freekick_goals":"freeKickGoals",
    "dribble":"dribbles","dribbles":"dribbles","dribble_succ":"successfulDribbles",
    "successful_dribbles":"successfulDribbles","duels":"duelsWon","duels_won":"duelsWon",
    "fastbreaks":"fastBreaks","fast_breaks":"fastBreaks",
    "fastbreak_shots":"fastBreakShots","fast_break_shots":"fastBreakShots",
    "fastbreak_goals":"fastBreakGoals","fast_break_goals":"fastBreakGoals",
    "hit_woodwork":"hitWoodwork","poss_losts":"possessionLost",
    "possession_lost":"possessionLost","clean_sheets":"cleanSheets",
    "yellow2red_cards":"twoYellowRedCards","two_yellow_red":"twoYellowRedCards",
    "blocked_shots":"effectiveBlocks","effective_blocks":"effectiveBlocks",
}

# CSV输出列顺序
OUTPUT_COLS = [
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
]

# 需要重新爬取的球队
MISSING_TEAMS = [
    {"name_cn": "清水心跳", "name_en": "", "slug": "qingshuixintiao", "league_cn": "J联赛", "league": "JLeague"},
    {"name_cn": "町田泽维亚", "name_en": "", "slug": "tingtianzeweiya", "league_cn": "J联赛", "league": "JLeague"},
    {"name_cn": "京都不死鸟", "name_en": "", "slug": "jingdubusiniao", "league_cn": "J联赛", "league": "JLeague"},
]


def fetch_stats(session, slug):
    """请求球队统计页面，返回 HTML 文本"""
    url = BASE_URL.format(slug=slug)
    try:
        resp = session.get(url, timeout=REQUEST_TIMEOUT)
        resp.encoding = 'utf-8'
        if resp.status_code == 200:
            return resp.text
        else:
            print(f"    HTTP {resp.status_code}")
            return None
    except Exception as e:
        print(f"    请求异常: {e}")
        return None


def parse_stats(html):
    """从 HTML 中解析所有 best-team 锚点，返回 {field: {total, rank}} 字典"""
    soup = BeautifulSoup(html, "html.parser")
    anchors = soup.select('a[href*="/league/"][href*="#"]')

    raw = {}
    for a in anchors:
        href = a.get("href", "")
        if "#" not in href:
            continue
        hash_name = href.rsplit("#", 1)[-1].lower()
        full_text = a.get_text().strip()
        if not full_text or not any(c.isdigit() for c in full_text):
            continue

        lines = [s.strip() for s in full_text.split("\n") if s.strip()]
        if len(lines) < 3:
            lines = full_text.split()
        if len(lines) < 3:
            continue

        value = lines[0]
        rank_str = "0"
        for j, part in enumerate(lines):
            if part == "联赛第" and j + 1 < len(lines):
                rank_str = ''.join(c for c in lines[j + 1] if c.isdigit())
                break
            if "联赛第" in part:
                digits = ''.join(c for c in part if c.isdigit())
                if digits:
                    rank_str = digits
                    break
        if rank_str == "0" and len(lines) >= 4:
            rank_str = ''.join(c for c in lines[3] if c.isdigit())
        raw[hash_name] = {
            "value": value.strip(),
            "rank": rank_str.strip() or "0",
        }

    result = {}
    for hash_name, item in raw.items():
        field = HASH_TO_FIELD.get(hash_name)
        if not field:
            continue
        num_val = float(item["value"].replace('%', ''))
        rank_val = int(item["rank"]) if item["rank"].isdigit() else 0
        result[field] = {"total": num_val, "rank": rank_val}

    return result


def flatten_stats(team_info, stats):
    """将拉平的团队信息 stats 转为CSV行字典"""
    row = {
        "team_name": team_info["name_en"],
        "team_name_cn": team_info["name_cn"],
        "team_id": team_info["slug"],
        "league": team_info["league"],
        "league_cn": team_info["league_cn"],
    }
    for col in OUTPUT_COLS:
        if col in row:
            continue
        if col in stats:
            row[col] = stats[col]["total"]
        else:
            row[col] = 0
    return row


def append_to_csv(rows):
    """将爬取结果追加到CSV"""
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    file_exists = OUTPUT_FILE.exists()
    with open(OUTPUT_FILE, "a", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=OUTPUT_COLS, extrasaction='ignore')
        if not file_exists:
            writer.writeheader()
        for row in rows:
            writer.writerow(row)


def main():
    print("=" * 60)
    print("  重新爬取失败的J联赛球队")
    print("=" * 60)

    session = requests.Session()
    session.headers.update({"User-Agent": USER_AGENT})

    success_count = 0
    fail_count = 0
    all_rows = []

    for i, team in enumerate(MISSING_TEAMS):
        print(f"\n[{i+1}/{len(MISSING_TEAMS)}] {team['name_cn']} ({team['slug']})", end="", flush=True)
        
        html = fetch_stats(session, team['slug'])
        if not html:
            print(" — 无响应")
            fail_count += 1
            time.sleep(random.uniform(MIN_DELAY, MAX_DELAY))
            continue

        stats = parse_stats(html)
        if not stats:
            print(f" — 解析失败 (HTML {len(html)} 字节)")
            fail_count += 1
            time.sleep(random.uniform(MIN_DELAY, MAX_DELAY))
            continue

        n = len(stats)
        print(f" — {n} 字段")

        row = flatten_stats(team, stats)
        all_rows.append(row)
        success_count += 1

        time.sleep(random.uniform(MIN_DELAY, MAX_DELAY))

    if all_rows:
        append_to_csv(all_rows)
        print(f"\n已将 {len(all_rows)} 支球队数据追加到 {OUTPUT_FILE}")

    print("\n" + "=" * 60)
    print(f"  完成! 成功: {success_count}, 失败: {fail_count}")
    print("=" * 60)


if __name__ == "__main__":
    main()
