import re
import sys

TEAMS_FILE = "src/data/realTeamsData.ts"

def read_file(path):
    with open(path, 'r', encoding='utf-8-sig') as f:
        return f.read()

def extract_teams(content):
    match = re.search(r"export const REAL_TEAMS:\s*TeamStats\[\]\s*=\s*\[(.*?)\];", content, re.DOTALL)
    if not match:
        print("[FATAL] 无法定位 REAL_TEAMS 数组")
        return []
    teams_text = match.group(1)
    teams = []
    brace_count = 0
    current = ""
    in_team = False
    for ch in teams_text:
        current += ch
        if ch == '{':
            brace_count += 1
            in_team = True
        elif ch == '}':
            brace_count -= 1
            if brace_count == 0 and in_team:
                teams.append(current.strip())
                current = ""
                in_team = False
    return teams

def parse_team_block(block):
    result = {}

    id_match = re.search(r"id:\s*'([^']+)'", block)
    result['id'] = id_match.group(1) if id_match else 'UNKNOWN'
    name_match = re.search(r"name:\s*'([^']+)'", block)
    result['name'] = name_match.group(1) if name_match else 'UNKNOWN'
    name_cn_match = re.search(r"nameCn:\s*'([^']+)'", block)
    result['nameCn'] = name_cn_match.group(1) if name_cn_match else 'UNKNOWN'
    rank_match = re.search(r"rank:\s*(\d+)", block)
    result['rank'] = int(rank_match.group(1)) if rank_match else None

    hs = re.search(r"homeStats:\s*\{(.*?)\}", block, re.DOTALL)
    if hs:
        hs_text = hs.group(1)
        result['homeStats'] = parse_stats(hs_text)
    else:
        result['homeStats'] = None

    aws = re.search(r"awayStats:\s*\{(.*?)\}", block, re.DOTALL)
    if aws:
        aws_text = aws.group(1)
        result['awayStats'] = parse_stats(aws_text)
    else:
        result['awayStats'] = None

    form_match = re.search(r"form:\s*\[(.*?)\]", block, re.DOTALL)
    if form_match:
        form_text = form_match.group(1)
        result['form'] = [s.strip().strip("'") for s in form_text.split(',') if s.strip()]
    else:
        result['form'] = []

    cs_match = re.search(r"cleanSheets:\s*(\d+)", block)
    result['cleanSheets'] = int(cs_match.group(1)) if cs_match else None

    spg_match = re.search(r"shotsPerGame:\s*([\d.]+)", block)
    result['shotsPerGame'] = float(spg_match.group(1)) if spg_match else None

    sa_match = re.search(r"shotAccuracy:\s*(\d+)", block)
    result['shotAccuracy'] = int(sa_match.group(1)) if sa_match else None

    hxg_match = re.search(r"homeXg:\s*([\d.]+)", block)
    result['homeXg'] = float(hxg_match.group(1)) if hxg_match else None

    axg_match = re.search(r"awayXg:\s*([\d.]+)", block)
    result['awayXg'] = float(axg_match.group(1)) if axg_match else None

    league_match = re.search(r"league:\s*'([^']+)'", block)
    result['league'] = league_match.group(1) if league_match else None

    return result

def parse_stats(text):
    result = {}
    mappings = {
        'played': r'played:\s*(\d+)',
        'wins': r'wins:\s*(\d+)',
        'draws': r'draws:\s*(\d+)',
        'losses': r'losses:\s*(\d+)',
        'goalsFor': r'goalsFor:\s*([\d.]+)',
        'goalsAgainst': r'goalsAgainst:\s*([\d.]+)',
        'xgFor': r'xgFor:\s*([\d.]+)',
        'xgAgainst': r'xgAgainst:\s*([\d.]+)',
    }
    for key, pattern in mappings.items():
        m = re.search(pattern, text)
        if m:
            val = m.group(1)
            result[key] = float(val) if '.' in val else int(val)
        else:
            result[key] = None
    return result

def validate_team(team, errors, warnings):
    tid = f"{team['id']} ({team['nameCn']})"
    league = team.get('league', '')

    if team['rank'] is None:
        errors.append(f"[RANK_MISSING] {tid}: 排名缺失")
    elif league == 'WorldCup':
        if not (1 <= team['rank'] <= 50):
            errors.append(f"[RANK_RANGE] {tid}: FIFA排名={team['rank']} 超出[1,50]范围")
    else:
        if not (1 <= team['rank'] <= 20):
            errors.append(f"[RANK_RANGE] {tid}: 联赛排名={team['rank']} 超出[1,20]范围")

    if len(team['form']) < 5:
        errors.append(f"[FORM_SHORT] {tid}: form长度={len(team['form'])} 不足5")
    else:
        for i, c in enumerate(team['form']):
            if c not in ('W', 'D', 'L'):
                errors.append(f"[FORM_CHAR] {tid}: form[{i}]='{c}' 非W/D/L")

    for label, stats in [('主场', team['homeStats']), ('客场', team['awayStats'])]:
        if stats is None:
            errors.append(f"[STATS_MISSING] {tid}: {label}数据缺失")
            continue

        pl = stats.get('played', 0)
        wi = stats.get('wins', 0)
        dr = stats.get('draws', 0)
        lo = stats.get('losses', 0)
        gf = stats.get('goalsFor', 0)
        ga = stats.get('goalsAgainst', 0)
        xf = stats.get('xgFor', 0)
        xa = stats.get('xgAgainst', 0)

        if pl is None:
            errors.append(f"[PLAYED_NULL] {tid}: {label}played为None")
            continue

        total = wi + dr + lo
        if total != pl:
            errors.append(f"[RECORD_MISMATCH] {tid}: {label}wins({wi})+draws({dr})+losses({lo})={total} != played({pl})")

        if pl > 0:
            if gf > pl * 6:
                errors.append(f"[GOALS_HIGH] {tid}: {label}goalsFor={gf} 场次={pl} (场均>{6})")
            if ga > pl * 5:
                errors.append(f"[GOALS_AGAINST_HIGH] {tid}: {label}goalsAgainst={ga} 场次={pl}")

            if xf is not None and gf is not None and abs(xf - gf) > pl * 0.6:
                errors.append(f"[XG_DEVIATION] {tid}: {label}xgFor({xf}) 偏离 goalsFor({gf}) 超过{pl*0.6}")
            if xa is not None and ga is not None and abs(xa - ga) > pl * 0.6:
                errors.append(f"[XGA_DEVIATION] {tid}: {label}xgAgainst({xa}) 偏离 goalsAgainst({ga}) 超过{pl*0.6}")

    if team['shotsPerGame'] is not None and team['shotsPerGame'] <= 0:
        errors.append(f"[SHOTS_ZERO] {tid}: shotsPerGame={team['shotsPerGame']}")

    if team['shotAccuracy'] is not None and not (0 <= team['shotAccuracy'] <= 100):
        errors.append(f"[ACCURACY_RANGE] {tid}: shotAccuracy={team['shotAccuracy']} 超出[0,100]")

    if team['homeXg'] is not None and team['homeXg'] <= 0:
        errors.append(f"[HOME_XG_ZERO] {tid}: homeXg={team['homeXg']}")
    if team['awayXg'] is not None and team['awayXg'] <= 0:
        errors.append(f"[AWAY_XG_ZERO] {tid}: awayXg={team['awayXg']}")

def check_rank_duplicates(teams, warnings):
    league_ranks = {}
    for t in teams:
        league = t.get('league', '')
        rank = t.get('rank')
        if league and rank:
            key = (league, rank)
            if key in league_ranks:
                prev = league_ranks[key]
                warnings.append(f"[RANK_DUP_WARN] {league} rank={rank}: {prev} 与 {t['id']}({t['nameCn']}) 冲突")
            else:
                league_ranks[key] = t['id']

def main():
    content = read_file(TEAMS_FILE)
    team_blocks = extract_teams(content)

    if not team_blocks:
        print("[FATAL] 未找到任何球队数据")
        sys.exit(1)

    teams = []
    errors = []
    warnings = []

    for block in team_blocks:
        t = parse_team_block(block)
        if t['id'] == 'UNKNOWN':
            continue
        teams.append(t)

    for team in teams:
        validate_team(team, errors, warnings)

    check_rank_duplicates(teams, warnings)

    print("=" * 60)
    print("  足球竞彩量化分析系统 - 数据完整性校验")
    print("=" * 60)
    print(f"  总球队数: {len(teams)}")
    print(f"  错误数:   {len(errors)}")
    print(f"  警告数:   {len(warnings)}")
    print("=" * 60)

    if warnings:
        print("\n警告(需关注):")
        for w in warnings:
            print(f"  {w}")

    if errors:
        print("\n错误详情:")
        for e in errors:
            print(f"  {e}")
        print(f"\n[FAIL] 共发现 {len(errors)} 个数据错误, {len(warnings)} 个警告")
        sys.exit(1)
    else:
        if warnings:
            print(f"\n[PASS] 数据校验通过 (有 {len(warnings)} 个警告)")
        else:
            print("\n[PASS] 所有球队数据校验通过, 零异常")
        sys.exit(0)

if __name__ == '__main__':
    main()