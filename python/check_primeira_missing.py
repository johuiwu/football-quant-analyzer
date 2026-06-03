#!/usr/bin/env python3
# 检查葡超球队数据完整性

import sys
sys.stdout.reconfigure(encoding='utf-8')

with open('src/data/leagueTeams.ts', 'r', encoding='utf-8') as f:
    league_content = f.read()

with open('src/data/realTeamsData.ts', 'r', encoding='utf-8') as f:
    real_content = f.read()

# 提取葡超球队列表
import re

# 匹配葡超球队
primeira_teams = re.findall(r'id:"(.*?)",\s*name:"(.*?)",\s*englishName:"(.*?)",\s*league:"PrimeiraLiga"', league_content)

print(f'葡超球队总数: {len(primeira_teams)}')
print()

# 检查哪些球队在 REAL_TEAMS 中有数据
missing_teams = []
for team_id, name, english_name in primeira_teams:
    if f"id: '{team_id}'" in real_content:
        print(f'OK {name} ({team_id}) - 有数据')
    else:
        print(f'MISS {name} ({team_id}) - 缺少数据')
        missing_teams.append((team_id, name, english_name))

print()
print(f'缺少数据的球队数量: {len(missing_teams)}')
print('缺少数据的球队:')
for team_id, name, english_name in missing_teams:
    print(f'  - {name} ({english_name})')
