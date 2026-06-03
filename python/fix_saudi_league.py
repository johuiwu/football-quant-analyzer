#!/usr/bin/env python3
"""修复沙特联联赛球队数据，添加缺失的8支球队"""

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

# 缺失的8支沙特联球队
missing_teams = [
    {"id": "kadixiya", "name": "卡迪西亚", "englishName": "Al Qadsiah", "slug": "kadixiya"},
    {"id": "saihaitehaiwan", "name": "塞哈特海湾", "englishName": "Al Khaleej", "slug": "saihaitehaiwan"},
    {"id": "xinweilaichengtiyu", "name": "新未来城体育", "englishName": "Neom SC", "slug": "xinweilaichengtiyu"},
    {"id": "feiha", "name": "费哈", "englishName": "Al Feiha", "slug": "feiha"},
    {"id": "kelude", "name": "科鲁德", "englishName": "Al Okhdood", "slug": "kelude"},
    {"id": "hasenmu", "name": "哈森姆", "englishName": "Al Hazem", "slug": "hasenmu"},
    {"id": "liyadetiyu", "name": "利雅得体育", "englishName": "Al Riyadh", "slug": "liyadetiyu"},
    {"id": "damake", "name": "达马克", "englishName": "Damac", "slug": "damake"},
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

def update_frontend_teams():
    """更新前端球队列表"""
    league_teams_file = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'src', 'data', 'leagueTeams.ts')
    
    with open(league_teams_file, 'r', encoding='utf-8') as f:
        content = f.read()
    
    # 更新球队数量
    content = content.replace(
        '{ name: "沙特联", key: "SaudiPL", teamCount: 8, hasFullData: true }',
        '{ name: "沙特联", key: "SaudiPL", teamCount: 16, hasFullData: true }'
    )
    
    # 添加缺失的球队
    new_teams = '''
  // ======================== 沙特联 (SaudiPL) - 16 队 ========================
  { id:"liyadexinyue",     name:"利雅得新月", englishName:"Al Hilal",            league:"SaudiPL", leagueKey:"SaudiPL", slug:"liyadexinyue", realTeamId:"liyadexinyue" },
  { id:"liyadeshengli",    name:"利雅得胜利", englishName:"Al Nassr",            league:"SaudiPL", leagueKey:"SaudiPL", slug:"liyadeshengli", realTeamId:"liyadeshengli" },
  { id:"jidalianhe",       name:"吉达联合",   englishName:"Al Ittihad",          league:"SaudiPL", leagueKey:"SaudiPL", slug:"jidalianhe", realTeamId:"jidalianhe" },
  { id:"jidaguomin",       name:"吉达国民",   englishName:"Al Ahli",             league:"SaudiPL", leagueKey:"SaudiPL", slug:"jidaguomin", realTeamId:"jidaguomin" },
  { id:"liyadeqingnianren",   name:"利雅得青年", englishName:"Al Wehda",           league:"SaudiPL", leagueKey:"SaudiPL", slug:"liyadeqingnianren", realTeamId:"liyadeqingnianren" },
  { id:"yidifake",      name:"达曼协作",   englishName:"Al Ettifaq",          league:"SaudiPL", leagueKey:"SaudiPL", slug:"yidifake", realTeamId:"yidifake" },
  { id:"bulaidaihezuo",    name:"布赖代合作", englishName:"Al Taawoun",          league:"SaudiPL", leagueKey:"SaudiPL", slug:"bulaidaihezuo", realTeamId:"bulaidaihezuo" },
  { id:"hasazhengfu",      name:"哈萨征服",   englishName:"Al Fateh",            league:"SaudiPL", leagueKey:"SaudiPL", slug:"hasazhengfu", realTeamId:"hasazhengfu" },
  { id:"kadixiya",         name:"卡迪西亚",   englishName:"Al Qadsiah",          league:"SaudiPL", leagueKey:"SaudiPL", slug:"kadixiya", realTeamId:"kadixiya" },
  { id:"saihaitehaiwan",   name:"塞哈特海湾", englishName:"Al Khaleej",          league:"SaudiPL", leagueKey:"SaudiPL", slug:"saihaitehaiwan", realTeamId:"saihaitehaiwan" },
  { id:"xinweilaichengtiyu",name:"新未来城体育", englishName:"Neom SC",        league:"SaudiPL", leagueKey:"SaudiPL", slug:"xinweilaichengtiyu", realTeamId:"xinweilaichengtiyu" },
  { id:"feiha",            name:"费哈",       englishName:"Al Feiha",            league:"SaudiPL", leagueKey:"SaudiPL", slug:"feiha", realTeamId:"feiha" },
  { id:"kelude",           name:"科鲁德",     englishName:"Al Okhdood",          league:"SaudiPL", leagueKey:"SaudiPL", slug:"kelude", realTeamId:"kelude" },
  { id:"hasenmu",          name:"哈森姆",     englishName:"Al Hazem",            league:"SaudiPL", leagueKey:"SaudiPL", slug:"hasenmu", realTeamId:"hasenmu" },
  { id:"liyadetiyu",       name:"利雅得体育", englishName:"Al Riyadh",           league:"SaudiPL", leagueKey:"SaudiPL", slug:"liyadetiyu", realTeamId:"liyadetiyu" },
  { id:"damake",           name:"达马克",     englishName:"Damac",               league:"SaudiPL", leagueKey:"SaudiPL", slug:"damake", realTeamId:"damake" },
'''
    
    content = content.replace(
        '''  // ======================== 沙特联 (SaudiPL) - 8 队 ========================
  { id:"liyadexinyue",     name:"利雅得新月", englishName:"Al Hilal",            league:"SaudiPL", leagueKey:"SaudiPL", slug:"liyadexinyue", realTeamId:"liyadexinyue" },
  { id:"liyadeshengli",    name:"利雅得胜利", englishName:"Al Nassr",            league:"SaudiPL", leagueKey:"SaudiPL", slug:"liyadeshengli", realTeamId:"liyadeshengli" },
  { id:"jidalianhe",       name:"吉达联合",   englishName:"Al Ittihad",          league:"SaudiPL", leagueKey:"SaudiPL", slug:"jidalianhe", realTeamId:"jidalianhe" },
  { id:"jidaguomin",       name:"吉达国民",   englishName:"Al Ahli",             league:"SaudiPL", leagueKey:"SaudiPL", slug:"jidaguomin", realTeamId:"jidaguomin" },
  { id:"liyadeqingnianren",   name:"利雅得青年", englishName:"Al Wehda",           league:"SaudiPL", leagueKey:"SaudiPL", slug:"liyadeqingnianren", realTeamId:"liyadeqingnianren" },
  { id:"yidifake",      name:"达曼协作",   englishName:"Al Ettifaq",          league:"SaudiPL", leagueKey:"SaudiPL", slug:"yidifake", realTeamId:"yidifake" },
  { id:"bulaidaihezuo",    name:"布赖代合作", englishName:"Al Taawoun",          league:"SaudiPL", leagueKey:"SaudiPL", slug:"bulaidaihezuo", realTeamId:"bulaidaihezuo" },
  { id:"hasazhengfu",      name:"哈萨征服",   englishName:"Al Fateh",            league:"SaudiPL", leagueKey:"SaudiPL", slug:"hasazhengfu", realTeamId:"hasazhengfu" },''',
        new_teams.strip()
    )
    
    with open(league_teams_file, 'w', encoding='utf-8') as f:
        f.write(content)

def fix_saudi_league():
    print("=" * 60)
    print("  修复沙特联联赛球队数据")
    print("=" * 60)
    
    DB_PATH = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'database', 'football_data.db')
    conn = sqlite3.connect(DB_PATH)
    
    success_count = 0
    fail_count = 0
    
    print("\n  正在爬取缺失的8支沙特联球队数据...")
    for team in missing_teams:
        print("  爬取 %s (%s)..." % (team['name'], team['slug']), end="", flush=True)
        
        html = fetch_stats(team['slug'])
        
        if not html:
            print(" 失败")
            fail_count += 1
            continue
        
        stats = parse_stats(html)
        
        if not stats:
            print(" 解析失败")
            fail_count += 1
            continue
        
        insert_team(conn, team, stats)
        print(" 成功")
        success_count += 1
        
        import time
        time.sleep(1)
    
    conn.close()
    
    print("\n  爬取完成: %d 成功, %d 失败" % (success_count, fail_count))
    
    print("\n  更新前端球队列表...")
    update_frontend_teams()
    print("  前端球队列表已更新!")
    
    print("\n" + "=" * 60)
    print("  修复完成!")
    print("=" * 60)

if __name__ == "__main__":
    fix_saudi_league()
