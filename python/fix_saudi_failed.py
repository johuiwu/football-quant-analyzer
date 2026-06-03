#!/usr/bin/env python3
"""修复沙特联失败的球队数据"""

import requests
import re
import sqlite3
import os
from bs4 import BeautifulSoup

BASE_URL = "https://www.qiumiwu.com/team/{slug}/stat"
USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/148.0.0.0 Safari/537.36 Edg/148.0.0.0"
)

HASH_TO_FIELD = {
    "goals": "goals",
    "conceded": "conceded",
    "goaldifference": "goalDifference",
    "shots": "shots",
    "shotson": "shotsOnTarget",
    "assists": "assists",
    "passes": "passes",
    "corners": "corners",
    "fouls": "fouls",
    "redcards": "redCards",
    "yellowcards": "yellowCards",
    "penalties": "penalties",
    "cleansheets": "cleanSheets",
    "avggoals": "avgGoals",
    "avgconceded": "avgConceded",
    "avgoaldiff": "avgGoalDiff",
    "avgcorners": "avgCorners",
    "possession": "possession",
    "tackles": "tackles",
    "interceptions": "interceptions",
    "clearances": "clearances",
    "offsides": "offsides",
    "foulssuffered": "foulsSuffered",
    "keypasses": "keyPasses",
    "crosses": "crosses",
    "crossessuccessful": "crossesSuccessful",
    "longballs": "longBalls",
    "successfullongballs": "successfulLongBalls",
    "freekicks": "freeKicks",
    "freekickgoals": "freeKickGoals",
    "dribbles": "dribbles",
    "successfuldribbles": "successfulDribbles",
    "duelswon": "duelsWon",
    "fastbreaks": "fastBreaks",
    "fastbreakshots": "fastBreakShots",
    "fastbreakgoals": "fastBreakGoals",
    "hitwoodwork": "hitWoodwork",
    "possessionlost": "possessionLost",
    "twoyellowredcards": "twoYellowRedCards",
    "effectiveblocks": "effectiveBlocks",
}

# 失败的球队，尝试不同的slug
failed_teams = [
    {"id": "saihaitehaiwan", "name": "塞哈特海湾", "englishName": "Al Khaleej", "slugs": ["saihaitehaiwan", "khaleej", "alkhaleej", "hailwan"]},
    {"id": "kelude", "name": "科鲁德", "englishName": "Al Okhdood", "slugs": ["kelude", "okhdood", "alkhudud", "alokhdood"]},
]

def fetch_stats(slug):
    """请求球队统计页面"""
    url = BASE_URL.format(slug=slug)
    session = requests.Session()
    session.headers.update({"User-Agent": USER_AGENT})
    try:
        resp = session.get(url, timeout=30)
        resp.encoding = 'utf-8'
        if resp.status_code == 200:
            return resp.text
        else:
            return None
    except Exception as e:
        return None

def parse_stats(html):
    """解析球队数据"""
    soup = BeautifulSoup(html, "html.parser")
    anchors = soup.select('a[href*="/league/"][href*="#"]')
    
    raw = {}
    for a in anchors:
        href = a.get("href", "")
        if "#" not in href:
            continue
        hash_name = href.rsplit("#", 1)[-1].lower()
        full_text = a.get_text().strip()
        if not full_text or not re.search(r'\d', full_text):
            continue
        
        lines = [s.strip() for s in full_text.split("\n") if s.strip()]
        if len(lines) < 3:
            lines = full_text.split()
        if len(lines) < 3:
            continue
        
        value = lines[0]
        raw[hash_name] = {
            "value": value.strip(),
        }
    
    result = {}
    for hash_name, item in raw.items():
        field = HASH_TO_FIELD.get(hash_name)
        if not field:
            continue
        num_val = float(re.sub(r'[%]', '', item["value"]))
        result[field] = num_val
    
    return result

def insert_team(conn, team_info, stats):
    """插入球队数据到数据库"""
    cursor = conn.cursor()
    
    sql = """
        INSERT OR REPLACE INTO team_stats (
            team_id, team_name, team_name_cn, league, league_cn,
            goals, conceded, goalDifference, shots, shotsOnTarget, assists, passes,
            corners, fouls, redCards, yellowCards, penalties, cleanSheets,
            avgGoals, avgConceded, avgGoalDiff, avgCorners, possession,
            tackles, interceptions, clearances, offsides, foulsSuffered,
            keyPasses, crosses, crossesSuccessful, longBalls, successfulLongBalls,
            freeKicks, freeKickGoals, dribbles, successfulDribbles, duelsWon,
            fastBreaks, fastBreakShots, fastBreakGoals, hitWoodwork,
            possessionLost, twoYellowRedCards, effectiveBlocks
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """
    
    params = (
        team_info['id'],
        team_info['englishName'],
        team_info['name'],
        'SaudiPL',
        '沙特联',
        int(stats.get('goals', 0)),
        int(stats.get('conceded', 0)),
        int(stats.get('goalDifference', 0)),
        int(stats.get('shots', 0)),
        int(stats.get('shotsOnTarget', 0)),
        int(stats.get('assists', 0)),
        int(stats.get('passes', 0)),
        int(stats.get('corners', 0)),
        int(stats.get('fouls', 0)),
        int(stats.get('redCards', 0)),
        int(stats.get('yellowCards', 0)),
        int(stats.get('penalties', 0)),
        int(stats.get('cleanSheets', 0)),
        float(stats.get('avgGoals', 0)),
        float(stats.get('avgConceded', 0)),
        float(stats.get('avgGoalDiff', 0)),
        float(stats.get('avgCorners', 0)),
        float(stats.get('possession', 0)),
        int(stats.get('tackles', 0)),
        int(stats.get('interceptions', 0)),
        int(stats.get('clearances', 0)),
        int(stats.get('offsides', 0)),
        int(stats.get('foulsSuffered', 0)),
        int(stats.get('keyPasses', 0)),
        int(stats.get('crosses', 0)),
        int(stats.get('crossesSuccessful', 0)),
        int(stats.get('longBalls', 0)),
        int(stats.get('successfulLongBalls', 0)),
        int(stats.get('freeKicks', 0)),
        int(stats.get('freeKickGoals', 0)),
        int(stats.get('dribbles', 0)),
        int(stats.get('successfulDribbles', 0)),
        int(stats.get('duelsWon', 0)),
        int(stats.get('fastBreaks', 0)),
        int(stats.get('fastBreakShots', 0)),
        int(stats.get('fastBreakGoals', 0)),
        int(stats.get('hitWoodwork', 0)),
        int(stats.get('possessionLost', 0)),
        int(stats.get('twoYellowRedCards', 0)),
        int(stats.get('effectiveBlocks', 0))
    )
    
    cursor.execute(sql, params)
    conn.commit()

def fix_failed_teams():
    print("=" * 60)
    print("  修复沙特联失败的球队数据")
    print("=" * 60)
    
    DB_PATH = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'database', 'football_data.db')
    conn = sqlite3.connect(DB_PATH)
    
    for team in failed_teams:
        print("\n  尝试爬取 %s (%s)..." % (team['name'], team['englishName']))
        
        found = False
        for slug in team['slugs']:
            print("    尝试 slug: %s..." % slug, end="", flush=True)
            
            html = fetch_stats(slug)
            
            if html:
                stats = parse_stats(html)
                
                if stats:
                    insert_team(conn, {
                        'id': team['id'],
                        'name': team['name'],
                        'englishName': team['englishName']
                    }, stats)
                    print(" 成功")
                    found = True
                    break
                else:
                    print(" 解析失败")
            else:
                print(" 404")
        
        if not found:
            print("    所有slug都失败，使用默认数据")
            # 使用默认数据插入
            insert_team(conn, {
                'id': team['id'],
                'name': team['name'],
                'englishName': team['englishName']
            }, {})
    
    conn.close()
    
    print("\n" + "=" * 60)
    print("  修复完成!")
    print("=" * 60)

if __name__ == "__main__":
    fix_failed_teams()
