#!/usr/bin/env python3
"""完整爬取所有韩K联赛球队"""

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

# 完整的韩K联赛球队列表
ALL_KLEAGUE_TEAMS = [
    # 韩K1联赛
    {"name_cn": "首尔FC", "name_en": "Seoul FC", "slug": "fcshouer", "league_cn": "韩K1", "league": "KLeague1"},
    {"name_cn": "蔚山现代", "name_en": "Ulsan Hyundai", "slug": "weishanhd", "league_cn": "韩K1", "league": "KLeague1"},
    {"name_cn": "全北现代", "name_en": "Jeonbuk Hyundai", "slug": "quanbeixiandai", "league_cn": "韩K1", "league": "KLeague1"},
    {"name_cn": "仁川联", "name_en": "Incheon United", "slug": "renchuanlian", "league_cn": "韩K1", "league": "KLeague1"},
    {"name_cn": "江原FC", "name_en": "Gangwon FC", "slug": "jiangyuanfc", "league_cn": "韩K1", "league": "KLeague1"},
    {"name_cn": "安养FC", "name_en": "Anyang FC", "slug": "anyangfc", "league_cn": "韩K1", "league": "KLeague1"},
    {"name_cn": "大田市民", "name_en": "Daejeon Citizen", "slug": "datianshimin", "league_cn": "韩K1", "league": "KLeague1"},
    {"name_cn": "金泉尚武", "name_en": "Gimcheon Sangmu", "slug": "jinquanshangwu", "league_cn": "韩K1", "league": "KLeague1"},
    {"name_cn": "济州SK", "name_en": "Jeju SK", "slug": "jizhouskfc", "league_cn": "韩K1", "league": "KLeague1"},
    {"name_cn": "浦项制铁", "name_en": "Pohang Steelers", "slug": "puxiangtieren", "league_cn": "韩K1", "league": "KLeague1"},
    {"name_cn": "富川FC", "name_en": "Bucheon FC", "slug": "fuchuanfc", "league_cn": "韩K1", "league": "KLeague1"},
    {"name_cn": "光州FC", "name_en": "Gwangju FC", "slug": "guangzhoufc", "league_cn": "韩K1", "league": "KLeague1"},
    # 韩K2联赛
    {"name_cn": "大邱FC", "name_en": "Daegu FC", "slug": "daqiufc", "league_cn": "韩K2", "league": "KLeague2"},
    {"name_cn": "釜山偶像", "name_en": "Busan IPark", "slug": "fushanouxiang", "league_cn": "韩K2", "league": "KLeague2"},
    {"name_cn": "水原FC", "name_en": "Suwon FC", "slug": "shuiyuanfc", "league_cn": "韩K2", "league": "KLeague2"},
    {"name_cn": "首尔衣恋", "name_en": "Seoul E-Land", "slug": "shoueryilian", "league_cn": "韩K2", "league": "KLeague2"},
    {"name_cn": "华城FC", "name_en": "Hwaseong FC", "slug": "huachengfc", "league_cn": "韩K2", "league": "KLeague2"},
    {"name_cn": "水原三星", "name_en": "Suwon Samsung", "slug": "shuiyuansanxing", "league_cn": "韩K2", "league": "KLeague2"},
    {"name_cn": "忠南牙山", "name_en": "Chungnam Asan", "slug": "zhongnanyashan", "league_cn": "韩K2", "league": "KLeague2"},
    {"name_cn": "庆南FC", "name_en": "Gyeongnam FC", "slug": "qingnanfc", "league_cn": "韩K2", "league": "KLeague2"},
    {"name_cn": "忠北清州", "name_en": "Chungbuk Cheongju", "slug": "zhongbeiqingzhou", "league_cn": "韩K2", "league": "KLeague2"},
    {"name_cn": "金浦市民", "name_en": "Gimpo Citizen", "slug": "jinpushimin", "league_cn": "韩K2", "league": "KLeague2"},
    {"name_cn": "龙仁FC", "name_en": "Yongin FC", "slug": "longrenfc", "league_cn": "韩K2", "league": "KLeague2"},
    {"name_cn": "坡州市民", "name_en": "Paju Citizen", "slug": "pozhoushimin", "league_cn": "韩K2", "league": "KLeague2"},
    {"name_cn": "城南FC", "name_en": "Seongnam FC", "slug": "chengnanfc", "league_cn": "韩K2", "league": "KLeague2"},
    {"name_cn": "全南天龙", "name_en": "Jeonnam Dragons", "slug": "quannantianlong", "league_cn": "韩K2", "league": "KLeague2"},
    {"name_cn": "天安城", "name_en": "Cheonan City", "slug": "tianancheng", "league_cn": "韩K2", "league": "KLeague2"},
    {"name_cn": "安山小绿人", "name_en": "Ansan Greeners", "slug": "anshanxiaolyuren", "league_cn": "韩K2", "league": "KLeague2"},
    {"name_cn": "金海", "name_en": "Gimhae FC", "slug": "jinhai", "league_cn": "韩K2", "league": "KLeague2"},
]

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
            print(f"    HTTP {resp.status_code}")
            return None
    except Exception as e:
        print(f"    请求异常: {e}")
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


def write_csv(rows):
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    with open(OUTPUT_FILE, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=OUTPUT_COLS, extrasaction='ignore')
        writer.writeheader()
        for row in rows:
            writer.writerow(row)


def main():
    print("=" * 60)
    print("  完整爬取韩K联赛球队数据")
    print("=" * 60)
    print(f"  待爬取球队数: {len(ALL_KLEAGUE_TEAMS)}")
    print(f"  韩K1联赛: {sum(1 for t in ALL_KLEAGUE_TEAMS if t['league'] == 'KLeague1')} 队")
    print(f"  韩K2联赛: {sum(1 for t in ALL_KLEAGUE_TEAMS if t['league'] == 'KLeague2')} 队")
    print()

    session = requests.Session()
    session.headers.update({"User-Agent": USER_AGENT})

    success_count = 0
    fail_count = 0
    all_rows = []
    failed_teams = []

    for i, team in enumerate(ALL_KLEAGUE_TEAMS):
        print(f"[{i+1}/{len(ALL_KLEAGUE_TEAMS)}] {team['league_cn']} - {team['name_cn']} ({team['slug']})", end="", flush=True)
        
        html = fetch_stats(session, team['slug'])
        if not html:
            print(" — 无响应")
            failed_teams.append(team['name_cn'])
            fail_count += 1
            time.sleep(random.uniform(MIN_DELAY, MAX_DELAY))
            continue

        stats = parse_stats(html)
        if not stats:
            print(f" — 解析失败")
            failed_teams.append(team['name_cn'])
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
        write_csv(all_rows)
        print(f"\n已将 {len(all_rows)} 支球队数据写入 {OUTPUT_FILE}")

    print("\n" + "=" * 60)
    print(f"  完成! 成功: {success_count}, 失败: {fail_count}")
    if failed_teams:
        print(f"  失败球队: {', '.join(failed_teams)}")
    print("=" * 60)


if __name__ == "__main__":
    main()
