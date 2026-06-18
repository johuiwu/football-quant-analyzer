#!/usr/bin/env python3
"""使用更新后的slug重新爬取失败的球队数据"""

import requests
import csv
from pathlib import Path
from bs4 import BeautifulSoup
import time
import random

BASE_URL = "https://www.qiumiwu.com/team/{slug}/stat"
USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
REQUEST_TIMEOUT = 25
MIN_DELAY = 1.0
MAX_DELAY = 2.5

SCRIPT_DIR = Path(__file__).resolve().parent
PROJECT_DIR = SCRIPT_DIR.parent
OUTPUT_DIR = PROJECT_DIR / "output"
OUTPUT_FILE = OUTPUT_DIR / "all_teams_data.csv"

# ======================== 更新slug后的失败球队 ========================

FAILED_TEAMS = []

# 荷甲失败球队（更新slug）
FAILED_TEAMS.extend([
    {"name_cn": "奈梅亨", "name_en": "NEC Nijmegen", "slug": "naimeiheng", "league_cn": "荷甲", "league": "Eredivisie"},
    {"name_cn": "阿尔克马", "name_en": "AZ Alkmaar", "slug": "aerkemaer", "league_cn": "荷甲", "league": "Eredivisie"},
    {"name_cn": "福图纳", "name_en": "Fortuna Sittard", "slug": "futunaxitade", "league_cn": "荷甲", "league": "Eredivisie"},
    {"name_cn": "鹿斯巴达", "name_en": "Sparta Rotterdam", "slug": "lutedansibada", "league_cn": "荷甲", "league": "Eredivisie"},
    {"name_cn": "赫拉克勒", "name_en": "Heracles Almelo", "slug": "helakelesi", "league_cn": "荷甲", "league": "Eredivisie"},
])

# 葡超失败球队（更新slug）
FAILED_TEAMS.extend([
    {"name_cn": "葡萄牙体育", "name_en": "Sporting CP", "slug": "putaoyatiyu", "league_cn": "葡超", "league": "PrimeiraLiga"},
    {"name_cn": "埃斯托里尔", "name_en": "GD Estoril Praia", "slug": "aisituolier", "league_cn": "葡超", "league": "PrimeiraLiga"},
    {"name_cn": "里奥阿维", "name_en": "Rio Ave FC", "slug": "liaoawei", "league_cn": "葡超", "league": "PrimeiraLiga"},
    {"name_cn": "圣克拉拉", "name_en": "CD Santa Clara", "slug": "shengkelala", "league_cn": "葡超", "league": "PrimeiraLiga"},
    {"name_cn": "阿维什镇", "name_en": "UD Oliveirense", "slug": "aweishenzhen", "league_cn": "葡超", "league": "PrimeiraLiga"},
])

# 沙特联失败球队（更新slug）
FAILED_TEAMS.extend([
    {"name_cn": "利雅得青年人", "name_en": "Al Wehda", "slug": "liyadeqingnianren", "league_cn": "沙特联", "league": "SaudiPL"},
    {"name_cn": "达曼协作", "name_en": "Al Ettifaq", "slug": "yidifake", "league_cn": "沙特联", "league": "SaudiPL"},
])

# 瑞超失败球队（更新slug）
FAILED_TEAMS.extend([
    {"name_cn": "佐加顿斯", "name_en": "Djurgårdens IF", "slug": "youerjiadeng", "league_cn": "瑞超", "league": "Allsvenskan"},
    {"name_cn": "埃夫斯堡", "name_en": "IF Elfsborg", "slug": "aierfusibao", "league_cn": "瑞超", "league": "Allsvenskan"},
    {"name_cn": "盖斯", "name_en": "GAIS", "slug": "gedepugaisi", "league_cn": "瑞超", "league": "Allsvenskan"},
    {"name_cn": "布鲁马波", "name_en": "Brommapojkarna", "slug": "buluomabokana", "league_cn": "瑞超", "league": "Allsvenskan"},
    {"name_cn": "卡尔马", "name_en": "Kalmar FF", "slug": "kaerma", "league_cn": "瑞超", "league": "Allsvenskan"},
    {"name_cn": "代格福什", "name_en": "Degerfors IF", "slug": "daigefushen", "league_cn": "瑞超", "league": "Allsvenskan"},
    {"name_cn": "哥德堡", "name_en": "IFK Göteborg", "slug": "gedepu", "league_cn": "瑞超", "league": "Allsvenskan"},
    {"name_cn": "哈尔姆斯", "name_en": "Halmstads BK", "slug": "hamusitade", "league_cn": "瑞超", "league": "Allsvenskan"},
])

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


def fetch_stats(session, slug):
    url = BASE_URL.format(slug=slug)
    try:
        resp = session.get(url, timeout=REQUEST_TIMEOUT)
        resp.encoding = 'utf-8'
        if resp.status_code == 200:
            return resp.text
        else:
            return None
    except Exception as e:
        return None


def parse_stats(html):
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
        raw[hash_name] = {"value": value.strip(), "rank": rank_str.strip() or "0"}

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
        row[col] = stats[col]["total"] if col in stats else 0
    return row


def write_csv(rows, append=True):
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    mode = "a" if append else "w"
    header = not append or not OUTPUT_FILE.exists()
    
    with open(OUTPUT_FILE, mode, newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=OUTPUT_COLS, extrasaction='ignore')
        if header:
            writer.writeheader()
        for row in rows:
            writer.writerow(row)


def main():
    print("=" * 60)
    print("  使用更新后的slug重新爬取失败球队")
    print("=" * 60)
    print(f"  待爬取球队数: {len(FAILED_TEAMS)}")
    print(f"  荷甲: {sum(1 for t in FAILED_TEAMS if t['league'] == 'Eredivisie')} 队")
    print(f"  葡超: {sum(1 for t in FAILED_TEAMS if t['league'] == 'PrimeiraLiga')} 队")
    print(f"  沙特联: {sum(1 for t in FAILED_TEAMS if t['league'] == 'SaudiPL')} 队")
    print(f"  瑞超: {sum(1 for t in FAILED_TEAMS if t['league'] == 'Allsvenskan')} 队")
    print()

    session = requests.Session()
    session.headers.update({"User-Agent": USER_AGENT})

    success_count = 0
    fail_count = 0
    all_rows = []
    failed_teams = []

    for i, team in enumerate(FAILED_TEAMS):
        print(f"[{i+1}/{len(FAILED_TEAMS)}] {team['league_cn']} - {team['name_cn']} ({team['slug']})", end="", flush=True)
        
        html = fetch_stats(session, team['slug'])
        if not html:
            print(" 失败：无响应")
            failed_teams.append(f"{team['name_cn']} ({team['slug']})")
            fail_count += 1
            time.sleep(random.uniform(MIN_DELAY, MAX_DELAY))
            continue

        stats = parse_stats(html)
        if not stats:
            print(" 失败：解析失败")
            failed_teams.append(f"{team['name_cn']} ({team['slug']})")
            fail_count += 1
            time.sleep(random.uniform(MIN_DELAY, MAX_DELAY))
            continue

        n = len(stats)
        print(f" 成功：{n} 字段")

        row = flatten_stats(team, stats)
        all_rows.append(row)
        success_count += 1

        time.sleep(random.uniform(MIN_DELAY, MAX_DELAY))

    if all_rows:
        write_csv(all_rows, append=True)
        print(f"\n已将 {len(all_rows)} 支球队数据追加到 {OUTPUT_FILE}")

    print("\n" + "=" * 60)
    print(f"  完成! 成功: {success_count}, 失败: {fail_count}")
    if failed_teams:
        print(f"  失败球队: {', '.join(failed_teams)}")
    print("=" * 60)


if __name__ == "__main__":
    main()
