#!/usr/bin/env python3
"""爬取中超、挪超和芬超联赛数据"""

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

# 中超、挪超、芬超球队数据
NEW_LEAGUE_TEAMS = [
    # 中超
    {"name_cn": "成都蓉城", "name_en": "Chengdu Rongcheng", "slug": "chengdurongcheng", "league_cn": "中超", "league": "CSL"},
    {"name_cn": "上海申花", "name_en": "Shanghai Shenhua", "slug": "shanghaishenhua", "league_cn": "中超", "league": "CSL"},
    {"name_cn": "云南玉昆", "name_en": "Yunnan Yukun", "slug": "yunnanyukun", "league_cn": "中超", "league": "CSL"},
    {"name_cn": "山东泰山", "name_en": "Shandong Taishan", "slug": "shandongtaishan", "league_cn": "中超", "league": "CSL"},
    {"name_cn": "北京国安", "name_en": "Beijing Guoan", "slug": "beijingguoan", "league_cn": "中超", "league": "CSL"},
    {"name_cn": "上海海港", "name_en": "Shanghai Port", "slug": "shanghaihaigang", "league_cn": "中超", "league": "CSL"},
    {"name_cn": "武汉三镇", "name_en": "Wuhan Three Towns", "slug": "wuhansanzhen", "league_cn": "中超", "league": "CSL"},
    {"name_cn": "大连英博", "name_en": "Dalian Yingbo", "slug": "dalianyingbo", "league_cn": "中超", "league": "CSL"},
    {"name_cn": "青岛海牛", "name_en": "Qingdao Hainiu", "slug": "qingdaohainiu", "league_cn": "中超", "league": "CSL"},
    {"name_cn": "天津津门虎", "name_en": "Tianjin Jinmen Tiger", "slug": "tianjinjinmenhu", "league_cn": "中超", "league": "CSL"},
    {"name_cn": "浙江队", "name_en": "Zhejiang FC", "slug": "zhejiangdui", "league_cn": "中超", "league": "CSL"},
    {"name_cn": "辽宁铁人", "name_en": "Liaoning Tieren", "slug": "liaoningtieren", "league_cn": "中超", "league": "CSL"},
    {"name_cn": "深圳新鹏城", "name_en": "Shenzhen Peng City", "slug": "shenzhenxinpengcheng", "league_cn": "中超", "league": "CSL"},
    {"name_cn": "重庆铜梁龙", "name_en": "Chongqing Tongliang Long", "slug": "chongqingtonglianglong", "league_cn": "中超", "league": "CSL"},
    {"name_cn": "河南队", "name_en": "Henan FC", "slug": "henandui", "league_cn": "中超", "league": "CSL"},
    {"name_cn": "青岛西海岸", "name_en": "Qingdao West Coast", "slug": "qingdaoxihaian", "league_cn": "中超", "league": "CSL"},
    
    # 挪超
    {"name_cn": "维京", "name_en": "Viking FK", "slug": "weijing", "league_cn": "挪超", "league": "Eliteserien"},
    {"name_cn": "博德闪耀", "name_en": "Bodø/Glimt", "slug": "bodeshanyao", "league_cn": "挪超", "league": "Eliteserien"},
    {"name_cn": "布兰", "name_en": "Brann", "slug": "bulan", "league_cn": "挪超", "league": "Eliteserien"},
    {"name_cn": "特罗姆瑟", "name_en": "Tromsø IL", "slug": "teluomuse", "league_cn": "挪超", "league": "Eliteserien"},
    {"name_cn": "利勒斯特罗姆", "name_en": "Lillestrøm SK", "slug": "lileisiteluomu", "league_cn": "挪超", "league": "Eliteserien"},
    {"name_cn": "莫尔德", "name_en": "Molde FK", "slug": "moerde", "league_cn": "挪超", "league": "Eliteserien"},
    {"name_cn": "汉坎", "name_en": "HamKam", "slug": "hankan", "league_cn": "挪超", "league": "Eliteserien"},
    {"name_cn": "腓特烈", "name_en": "Fredrikstad FK", "slug": "feitelie", "league_cn": "挪超", "league": "Eliteserien"},
    {"name_cn": "奥勒松", "name_en": "Aalesunds FK", "slug": "aoleisong", "league_cn": "挪超", "league": "Eliteserien"},
    {"name_cn": "斯达", "name_en": "IK Start", "slug": "sida", "league_cn": "挪超", "league": "Eliteserien"},
    {"name_cn": "奥斯KFUM", "name_en": "KFUM Oslo", "slug": "kfumaosilu", "league_cn": "挪超", "league": "Eliteserien"},
    {"name_cn": "萨普斯堡", "name_en": "Sarpsborg 08", "slug": "sapusibao", "league_cn": "挪超", "league": "Eliteserien"},
    {"name_cn": "瓦勒伦加", "name_en": "Vålerenga", "slug": "waleilunjia", "league_cn": "挪超", "league": "Eliteserien"},
    {"name_cn": "克里斯蒂", "name_en": "Kristiansund BK", "slug": "kelisidiansong", "league_cn": "挪超", "league": "Eliteserien"},
    {"name_cn": "桑纳菲", "name_en": "Sandefjord Fotball", "slug": "sangdefeijie", "league_cn": "挪超", "league": "Eliteserien"},
    {"name_cn": "罗森博格", "name_en": "Rosenborg BK", "slug": "luosenboge", "league_cn": "挪超", "league": "Eliteserien"},
    
    # 芬超
    {"name_cn": "图尔库国际", "name_en": "FC Inter Turku", "slug": "tuerkuguoji", "league_cn": "芬超", "league": "Veikkausliiga"},
    {"name_cn": "古比斯", "name_en": "KuPS", "slug": "gubisi", "league_cn": "芬超", "league": "Veikkausliiga"},
    {"name_cn": "奥卢", "name_en": "AC Oulu", "slug": "aolu", "league_cn": "芬超", "league": "Veikkausliiga"},
    {"name_cn": "埃尔维斯", "name_en": "Ilves", "slug": "aierweisi", "league_cn": "芬超", "league": "Veikkausliiga"},
    {"name_cn": "赫尔辛基", "name_en": "HJK Helsinki", "slug": "heerxinji", "league_cn": "芬超", "league": "Veikkausliiga"},
    {"name_cn": "TPS图尔库", "name_en": "TPS Turku", "slug": "tpstuerku", "league_cn": "芬超", "league": "Veikkausliiga"},
    {"name_cn": "格尼斯坦", "name_en": "FC Gnistan", "slug": "genisitan", "league_cn": "芬超", "league": "Veikkausliiga"},
    {"name_cn": "VPS瓦萨", "name_en": "VPS Vaasa", "slug": "vpswasa", "league_cn": "芬超", "league": "Veikkausliiga"},
    {"name_cn": "雅罗", "name_en": "FF Jaro", "slug": "yaluo", "league_cn": "芬超", "league": "Veikkausliiga"},
    {"name_cn": "拉赫蒂", "name_en": "FC Lahti", "slug": "lahedi", "league_cn": "芬超", "league": "Veikkausliiga"},
    {"name_cn": "塞那乔其", "name_en": "SJK Seinäjoki", "slug": "sainaqiaoqi", "league_cn": "芬超", "league": "Veikkausliiga"},
    {"name_cn": "玛丽港", "name_en": "IFK Mariehamn", "slug": "maligang", "league_cn": "芬超", "league": "Veikkausliiga"},
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
            return None
    except Exception:
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
    print("  爬取中超、挪超和芬超联赛数据")
    print("=" * 60)
    print(f"  待爬取球队数: {len(NEW_LEAGUE_TEAMS)}")
    print(f"  中超: {sum(1 for t in NEW_LEAGUE_TEAMS if t['league'] == 'CSL')} 队")
    print(f"  挪超: {sum(1 for t in NEW_LEAGUE_TEAMS if t['league'] == 'Eliteserien')} 队")
    print(f"  芬超: {sum(1 for t in NEW_LEAGUE_TEAMS if t['league'] == 'Veikkausliiga')} 队")
    print()

    session = requests.Session()
    session.headers.update({"User-Agent": USER_AGENT})

    success_count = 0
    fail_count = 0
    all_rows = []
    failed_teams = []

    for i, team in enumerate(NEW_LEAGUE_TEAMS):
        print(f"[{i+1}/{len(NEW_LEAGUE_TEAMS)}] {team['league_cn']} - {team['name_cn']}", end="", flush=True)
        
        html = fetch_stats(session, team['slug'])
        if not html:
            print(" — 无响应")
            failed_teams.append(team['name_cn'])
            fail_count += 1
            time.sleep(random.uniform(MIN_DELAY, MAX_DELAY))
            continue

        stats = parse_stats(html)
        if not stats:
            print(" — 解析失败")
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
        write_csv(all_rows, append=True)
        print(f"\n已将 {len(all_rows)} 支球队数据追加到 {OUTPUT_FILE}")

    print("\n" + "=" * 60)
    print(f"  完成! 成功: {success_count}, 失败: {fail_count}")
    if failed_teams:
        print(f"  失败球队: {', '.join(failed_teams[:10])}{'...' if len(failed_teams) > 10 else ''}")
    print("=" * 60)


if __name__ == "__main__":
    main()
