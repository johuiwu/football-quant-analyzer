#!/usr/bin/env python3
"""统计leagueTeams.ts中的球队数量"""

import re

with open('src/data/leagueTeams.ts', 'r', encoding='utf-8') as f:
    content = f.read()

# 统计所有球队（不包括注释）
teams = re.findall(r'^\s*\{[^}]+league:"([^"]+)"', content, re.MULTILINE)
total_teams = len(teams)

# 按联赛分组统计
leagues = {}
for league in teams:
    leagues[league] = leagues.get(league, 0) + 1

# 按数量排序
sorted_leagues = sorted(leagues.items(), key=lambda x: x[1], reverse=True)

league_name_map = {
    'WorldCup': '世界杯',
    'EPL': '英超',
    'LaLiga': '西甲',
    'SerieA': '意甲',
    'Bundesliga': '德甲',
    'Ligue1': '法甲',
    'CSL': '中超',
    'JLeague': 'J联赛',
    'KLeague1': '韩K1',
    'KLeague2': '韩K2',
    'Eliteserien': '挪超',
    'Veikkausliiga': '芬超',
    'Eredivisie': '荷甲',
    'PrimeiraLiga': '葡超',
    'SaudiPL': '沙特联',
    'Allsvenskan': '瑞超'
}

print('=' * 60)
print('  球队信息库统计报告')
print('=' * 60)
print(f'\n总计球队数量: {total_teams} 支')
print(f'\n各联赛球队数量:')
print('-' * 60)
for league, count in sorted_leagues:
    name = league_name_map.get(league, league)
    print(f'{name:12s} {league:15s} {count:3d} 支')
print('=' * 60)
print(f'\n联赛总数: {len(leagues)} 个')
print(f'世界杯参赛球队: {leagues.get("WorldCup", 0)} 支')
