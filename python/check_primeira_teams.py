#!/usr/bin/env python3
# 检查葡超球队数量

with open('src/data/leagueTeams.ts', 'r', encoding='utf-8') as f:
    content = f.read()

# 统计葡超球队数量
primeira_count = content.count("league: 'PrimeiraLiga'")
print(f'葡超球队总数: {primeira_count}')

# 统计REAL_TEAMS中葡超球队数量
with open('src/data/realTeamsData.ts', 'r', encoding='utf-8') as f:
    content2 = f.read()

real_primeira_count = content2.count("league: 'PrimeiraLiga'")
print(f'REAL_TEAMS中葡超球队数量: {real_primeira_count}')
