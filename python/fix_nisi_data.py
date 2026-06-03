#!/usr/bin/env python3
"""修复尼斯队异常数据"""

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
            print("    HTTP %d" % resp.status_code)
            return None
    except Exception as e:
        print("    请求异常: %s" % str(e))
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
        rank_str = "0"
        for j, part in enumerate(lines):
            if part == "联赛第" and j + 1 < len(lines):
                rank_str = re.sub(r'[^0-9]', '', lines[j + 1])
                break
            if "联赛第" in part:
                digits = re.sub(r'[^0-9]', '', part)
                if digits:
                    rank_str = digits
                    break
        if rank_str == "0" and len(lines) >= 4:
            rank_str = re.sub(r'[^0-9]', '', lines[3])
        
        raw[hash_name] = {
            "value": value.strip(),
            "rank": rank_str.strip() or "0",
        }
    
    result = {}
    for hash_name, item in raw.items():
        field = HASH_TO_FIELD.get(hash_name)
        if not field:
            continue
        num_val = float(re.sub(r'[%]', '', item["value"]))
        result[field] = num_val
    
    return result

def fix_nisi():
    print("=" * 60)
    print("  修复尼斯队异常数据")
    print("=" * 60)
    
    print("  正在爬取尼斯队数据...")
    html = fetch_stats("nisi")
    
    if not html:
        print("  爬取失败!")
        return
    
    data = parse_stats(html)
    
    if not data:
        print("  解析数据失败!")
        return
    
    print("  爬取成功!")
    print("  进球: %d" % int(data.get('goals', 0)))
    print("  失球: %d" % int(data.get('conceded', 0)))
    print("  射门: %d" % int(data.get('shots', 0)))
    print("  传球: %d" % int(data.get('passes', 0)))
    
    DB_PATH = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'database', 'football_data.db')
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    
    sql = """
        UPDATE team_stats SET
            goals = ?, conceded = ?, goalDifference = ?,
            shots = ?, shotsOnTarget = ?, assists = ?, passes = ?,
            corners = ?, fouls = ?, redCards = ?, yellowCards = ?,
            penalties = ?, cleanSheets = ?, avgGoals = ?, avgConceded = ?,
            avgGoalDiff = ?, avgCorners = ?, possession = ?, tackles = ?,
            interceptions = ?, clearances = ?, offsides = ?, foulsSuffered = ?,
            keyPasses = ?, crosses = ?, crossesSuccessful = ?, longBalls = ?,
            successfulLongBalls = ?, freeKicks = ?, freeKickGoals = ?,
            dribbles = ?, successfulDribbles = ?, duelsWon = ?, fastBreaks = ?,
            fastBreakShots = ?, fastBreakGoals = ?, hitWoodwork = ?,
            possessionLost = ?, twoYellowRedCards = ?, effectiveBlocks = ?
        WHERE team_id = ?
    """
    
    params = (
        int(data.get('goals', 0)), int(data.get('conceded', 0)), int(data.get('goalDifference', 0)),
        int(data.get('shots', 0)), int(data.get('shotsOnTarget', 0)), int(data.get('assists', 0)),
        int(data.get('passes', 0)), int(data.get('corners', 0)), int(data.get('fouls', 0)),
        int(data.get('redCards', 0)), int(data.get('yellowCards', 0)), int(data.get('penalties', 0)),
        int(data.get('cleanSheets', 0)), float(data.get('avgGoals', 0)), float(data.get('avgConceded', 0)),
        float(data.get('avgGoalDiff', 0)), float(data.get('avgCorners', 0)), float(data.get('possession', 0)),
        int(data.get('tackles', 0)), int(data.get('interceptions', 0)), int(data.get('clearances', 0)),
        int(data.get('offsides', 0)), int(data.get('foulsSuffered', 0)), int(data.get('keyPasses', 0)),
        int(data.get('crosses', 0)), int(data.get('crossesSuccessful', 0)), int(data.get('longBalls', 0)),
        int(data.get('successfulLongBalls', 0)), int(data.get('freeKicks', 0)), int(data.get('freeKickGoals', 0)),
        int(data.get('dribbles', 0)), int(data.get('successfulDribbles', 0)), int(data.get('duelsWon', 0)),
        int(data.get('fastBreaks', 0)), int(data.get('fastBreakShots', 0)), int(data.get('fastBreakGoals', 0)),
        int(data.get('hitWoodwork', 0)), int(data.get('possessionLost', 0)), int(data.get('twoYellowRedCards', 0)),
        int(data.get('effectiveBlocks', 0)), 'nisi'
    )
    
    cursor.execute(sql, params)
    conn.commit()
    print("  数据已更新到数据库!")
    conn.close()
    
    print("\n" + "=" * 60)
    print("  修复完成!")
    print("=" * 60)

if __name__ == "__main__":
    fix_nisi()
