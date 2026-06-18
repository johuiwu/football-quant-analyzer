#!/usr/bin/env python3
"""爬取剩余联赛数据：荷甲、葡超、沙特联、瑞超"""

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

# ======================== 四个联赛完整球队数据 ========================

ALL_TEAMS = []

# 荷甲 (Eredivisie) 18队
ALL_TEAMS.extend([
    {"name_cn": "埃因霍温", "name_en": "PSV Eindhoven", "slug": "aiyinhuowen", "league_cn": "荷甲", "league": "Eredivisie"},
    {"name_cn": "奈梅亨", "name_en": "NEC Nijmegen", "slug": "nimeiheng", "league_cn": "荷甲", "league": "Eredivisie"},
    {"name_cn": "费耶诺德", "name_en": "Feyenoord", "slug": "feiyenuode", "league_cn": "荷甲", "league": "Eredivisie"},
    {"name_cn": "阿贾克斯", "name_en": "Ajax", "slug": "ajiakesi", "league_cn": "荷甲", "league": "Eredivisie"},
    {"name_cn": "乌德勒支", "name_en": "FC Utrecht", "slug": "wudelezhi", "league_cn": "荷甲", "league": "Eredivisie"},
    {"name_cn": "特温特", "name_en": "FC Twente", "slug": "tewente", "league_cn": "荷甲", "league": "Eredivisie"},
    {"name_cn": "海伦芬", "name_en": "SC Heerenveen", "slug": "hailunfen", "league_cn": "荷甲", "league": "Eredivisie"},
    {"name_cn": "阿尔克马", "name_en": "AZ Alkmaar", "slug": "aerkema", "league_cn": "荷甲", "league": "Eredivisie"},
    {"name_cn": "前进之鹰", "name_en": "Go Ahead Eagles", "slug": "qianjinzhiying", "league_cn": "荷甲", "league": "Eredivisie"},
    {"name_cn": "福图纳", "name_en": "Fortuna Sittard", "slug": "futuna", "league_cn": "荷甲", "league": "Eredivisie"},
    {"name_cn": "格罗宁根", "name_en": "FC Groningen", "slug": "geluoninggen", "league_cn": "荷甲", "league": "Eredivisie"},
    {"name_cn": "特尔斯达", "name_en": "Telstar", "slug": "teersida", "league_cn": "荷甲", "league": "Eredivisie"},
    {"name_cn": "兹沃勒", "name_en": "PEC Zwolle", "slug": "ziwole", "league_cn": "荷甲", "league": "Eredivisie"},
    {"name_cn": "SBV精英", "name_en": "SBV Excelsior", "slug": "sbvjingying", "league_cn": "荷甲", "league": "Eredivisie"},
    {"name_cn": "鹿斯巴达", "name_en": "Sparta Rotterdam", "slug": "lusibada", "league_cn": "荷甲", "league": "Eredivisie"},
    {"name_cn": "布雷达", "name_en": "NAC Breda", "slug": "buleida", "league_cn": "荷甲", "league": "Eredivisie"},
    {"name_cn": "赫拉克勒", "name_en": "Heracles Almelo", "slug": "helakele", "league_cn": "荷甲", "league": "Eredivisie"},
    {"name_cn": "福伦丹", "name_en": "FC Volendam", "slug": "fulundan", "league_cn": "荷甲", "league": "Eredivisie"},
])

# 葡超 (PrimeiraLiga) 18队
ALL_TEAMS.extend([
    {"name_cn": "葡萄牙体育", "name_en": "Sporting CP", "slug": "putoyatiyu", "league_cn": "葡超", "league": "PrimeiraLiga"},
    {"name_cn": "本菲卡", "name_en": "SL Benfica", "slug": "benfeika", "league_cn": "葡超", "league": "PrimeiraLiga"},
    {"name_cn": "波尔图", "name_en": "FC Porto", "slug": "boertu", "league_cn": "葡超", "league": "PrimeiraLiga"},
    {"name_cn": "布拉加", "name_en": "SC Braga", "slug": "bulajia", "league_cn": "葡超", "league": "PrimeiraLiga"},
    {"name_cn": "埃斯托里尔", "name_en": "GD Estoril Praia", "slug": "aituolier", "league_cn": "葡超", "league": "PrimeiraLiga"},
    {"name_cn": "吉尔维森特", "name_en": "Gil Vicente FC", "slug": "jierweisente", "league_cn": "葡超", "league": "PrimeiraLiga"},
    {"name_cn": "阿罗卡", "name_en": "FC Arouca", "slug": "aluoka", "league_cn": "葡超", "league": "PrimeiraLiga"},
    {"name_cn": "法马利康", "name_en": "FC Famalicão", "slug": "famalikang", "league_cn": "葡超", "league": "PrimeiraLiga"},
    {"name_cn": "吉马良斯", "name_en": "Vitória SC", "slug": "jimaliangsi", "league_cn": "葡超", "league": "PrimeiraLiga"},
    {"name_cn": "阿马多拉之星", "name_en": "Estrela da Amadora", "slug": "amaduolazhixing", "league_cn": "葡超", "league": "PrimeiraLiga"},
    {"name_cn": "马德拉国民", "name_en": "CD Nacional", "slug": "madelaguomin", "league_cn": "葡超", "league": "PrimeiraLiga"},
    {"name_cn": "莫雷拉人", "name_en": "Moreirense FC", "slug": "moleilaren", "league_cn": "葡超", "league": "PrimeiraLiga"},
    {"name_cn": "里奥阿维", "name_en": "Rio Ave FC", "slug": "liaowei", "league_cn": "葡超", "league": "PrimeiraLiga"},
    {"name_cn": "艾华卡", "name_en": "AVS Futebol SAD", "slug": "aihuaka", "league_cn": "葡超", "league": "PrimeiraLiga"},
    {"name_cn": "圣克拉拉", "name_en": "CD Santa Clara", "slug": "shengkela", "league_cn": "葡超", "league": "PrimeiraLiga"},
    {"name_cn": "卡萨比亚", "name_en": "Casa Pia AC", "slug": "kasabiya", "league_cn": "葡超", "league": "PrimeiraLiga"},
    {"name_cn": "通德拉", "name_en": "CD Tondela", "slug": "tongdela", "league_cn": "葡超", "league": "PrimeiraLiga"},
    {"name_cn": "阿维什镇", "name_en": "UD Oliveirense", "slug": "aweizhen", "league_cn": "葡超", "league": "PrimeiraLiga"},
])

# 沙特联 (SaudiPL) 8队 (使用现有数据)
ALL_TEAMS.extend([
    {"name_cn": "利雅得新月", "name_en": "Al Hilal", "slug": "liyadexinyue", "league_cn": "沙特联", "league": "SaudiPL"},
    {"name_cn": "利雅得胜利", "name_en": "Al Nassr", "slug": "liyadeshengli", "league_cn": "沙特联", "league": "SaudiPL"},
    {"name_cn": "吉达联合", "name_en": "Al Ittihad", "slug": "jidalianhe", "league_cn": "沙特联", "league": "SaudiPL"},
    {"name_cn": "吉达国民", "name_en": "Al Ahli", "slug": "jidaguomin", "league_cn": "沙特联", "league": "SaudiPL"},
    {"name_cn": "利雅得青年", "name_en": "Al Shabab", "slug": "liyadeqingnian", "league_cn": "沙特联", "league": "SaudiPL"},
    {"name_cn": "达曼协作", "name_en": "Al Ettifaq", "slug": "damanxiezuo", "league_cn": "沙特联", "league": "SaudiPL"},
    {"name_cn": "布赖代合作", "name_en": "Al Taawoun", "slug": "bulaidaihezuo", "league_cn": "沙特联", "league": "SaudiPL"},
    {"name_cn": "哈萨征服", "name_en": "Al Fateh", "slug": "hasazhengfu", "league_cn": "沙特联", "league": "SaudiPL"},
])

# 瑞超 (Allsvenskan) 16队
ALL_TEAMS.extend([
    {"name_cn": "天狼星", "name_en": "IK Sirius", "slug": "tianlangxing", "league_cn": "瑞超", "league": "Allsvenskan"},
    {"name_cn": "哈马比", "name_en": "Hammarby", "slug": "hamabi", "league_cn": "瑞超", "league": "Allsvenskan"},
    {"name_cn": "佐加顿斯", "name_en": "Djurgårdens IF", "slug": "zuojiadunsi", "league_cn": "瑞超", "league": "Allsvenskan"},
    {"name_cn": "赫根", "name_en": "BK Häcken", "slug": "hegen", "league_cn": "瑞超", "league": "Allsvenskan"},
    {"name_cn": "马尔默", "name_en": "Malmö FF", "slug": "maermo", "league_cn": "瑞超", "league": "Allsvenskan"},
    {"name_cn": "埃夫斯堡", "name_en": "IF Elfsborg", "slug": "aifusibao", "league_cn": "瑞超", "league": "Allsvenskan"},
    {"name_cn": "米亚尔比", "name_en": "Mjällby AIF", "slug": "miyaerbi", "league_cn": "瑞超", "league": "Allsvenskan"},
    {"name_cn": "瓦斯特拉斯", "name_en": "Västerås SK", "slug": "wasitelasi", "league_cn": "瑞超", "league": "Allsvenskan"},
    {"name_cn": "盖斯", "name_en": "GAIS", "slug": "gaisi", "league_cn": "瑞超", "league": "Allsvenskan"},
    {"name_cn": "布鲁马波", "name_en": "Brommapojkarna", "slug": "bulumabo", "league_cn": "瑞超", "league": "Allsvenskan"},
    {"name_cn": "索尔纳", "name_en": "AIK", "slug": "suoerna", "league_cn": "瑞超", "league": "Allsvenskan"},
    {"name_cn": "卡尔马", "name_en": "Kalmar FF", "slug": "kerma", "league_cn": "瑞超", "league": "Allsvenskan"},
    {"name_cn": "代格福什", "name_en": "Degerfors IF", "slug": "daigefushi", "league_cn": "瑞超", "league": "Allsvenskan"},
    {"name_cn": "哥德堡", "name_en": "IFK Göteborg", "slug": "gedebao", "league_cn": "瑞超", "league": "Allsvenskan"},
    {"name_cn": "奥尔格里特", "name_en": "Örgryte IS", "slug": "aoergelite", "league_cn": "瑞超", "league": "Allsvenskan"},
    {"name_cn": "哈尔姆斯", "name_en": "Halmstads BK", "slug": "haermusi", "league_cn": "瑞超", "league": "Allsvenskan"},
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
    print("  爬取剩余联赛数据：荷甲、葡超、沙特联、瑞超")
    print("=" * 60)
    print(f"  总球队数: {len(ALL_TEAMS)}")
    print(f"  荷甲: {sum(1 for t in ALL_TEAMS if t['league'] == 'Eredivisie')} 队")
    print(f"  葡超: {sum(1 for t in ALL_TEAMS if t['league'] == 'PrimeiraLiga')} 队")
    print(f"  沙特联: {sum(1 for t in ALL_TEAMS if t['league'] == 'SaudiPL')} 队")
    print(f"  瑞超: {sum(1 for t in ALL_TEAMS if t['league'] == 'Allsvenskan')} 队")
    print()

    session = requests.Session()
    session.headers.update({"User-Agent": USER_AGENT})

    success_count = 0
    fail_count = 0
    all_rows = []
    failed_teams = []

    for i, team in enumerate(ALL_TEAMS):
        print(f"[{i+1}/{len(ALL_TEAMS)}] {team['league_cn']} - {team['name_cn']}", end="", flush=True)
        
        html = fetch_stats(session, team['slug'])
        if not html:
            print(" 失败：无响应")
            failed_teams.append(team['name_cn'])
            fail_count += 1
            time.sleep(random.uniform(MIN_DELAY, MAX_DELAY))
            continue

        stats = parse_stats(html)
        if not stats:
            print(" 失败：解析失败")
            failed_teams.append(team['name_cn'])
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
