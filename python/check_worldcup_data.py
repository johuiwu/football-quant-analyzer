#!/usr/bin/env python3
# 检查 realTeamsData.ts 中的世界杯球队

with open('src/data/realTeamsData.ts', 'r', encoding='utf-8') as f:
    content = f.read()

# 统计世界杯球队数量
worldcup_count = content.count("league: 'WorldCup'")
print(f'世界杯球队数量: {worldcup_count}')

# 检查是否包含特定球队
teams_to_check = ['faguo', 'agenting', 'yinggelan']
for team in teams_to_check:
    if f"id: '{team}'" in content:
        print(f'✓ 包含 {team}')
    else:
        print(f'✗ 缺少 {team}')

# 检查 REAL_TEAMS 数组是否正确结束
if '];\n\n// ==================== 历史交锋记录 ====================' in content:
    print('✓ REAL_TEAMS 数组正确结束')
else:
    print('✗ REAL_TEAMS 数组可能未正确结束')
