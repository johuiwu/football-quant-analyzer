"""Deep diagnosis: Add debug logging to trace the exact data flow in refresh-team-stats."""
from playwright.sync_api import sync_playwright
import json

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page()

    # 1. First check what convertToSystemStats would produce
    # by calling livescore APIs directly and doing the conversion ourselves
    print("=== Step 1: Fetch livescore raw data and simulate convertToSystemStats ===")

    LIVESCORE_TO_TEAM_ID = {
        'USA': 'meiguo', 'Australia': 'aodaliya', 'Mexico': 'moxige', 'South Korea': 'hanguo',
        'Paraguay': 'balagui', 'Qatar': 'kataer', 'Czechia': 'jieke1', 'Bosnia and Herzegovina': 'bohei1',
        'Scotland': 'sugelan', 'Canada': 'jianada', 'Brazil': 'baxi', 'Morocco': 'moluoge',
        'Switzerland': 'ruishi', 'South Africa': 'nanfei', 'Haiti': 'haidi', 'Turkiye': 'tuerqi1',
        'Germany': 'deguo', 'Curaçao': 'kulasuo', 'Curacao': 'kulasuo', "Côte d'Ivoire": 'ketediwa1',
        'Ivory Coast': 'ketediwa1', 'Ecuador': 'eguaduoer',
        'Netherlands': 'helan', 'Japan': 'riben', 'Sweden': 'ruidian1', 'Tunisia': 'tunisi1',
        'Belgium': 'bilishi', 'Egypt': 'aiji1', 'Iran': 'yilang', 'New Zealand': 'xinxilan1',
        'Spain': 'xibanya', 'Cape Verde': 'fodejiao1', 'Saudi Arabia': 'shatealabo', 'Uruguay': 'wulagui',
        'France': 'faguo', 'Senegal': 'saineijiaer', 'Iraq': 'yilake1', 'Norway': 'nuowei',
        'Argentina': 'agenting', 'Algeria': 'aerjiliya', 'Austria': 'aodili', 'Jordan': 'yuedan1',
        'Portugal': 'putaoya', 'DR Congo': 'minzhugangguo', 'Uzbekistan': 'wuzibiekesitan', 'Colombia': 'gelunbiya',
        'England': 'yinggelan', 'Croatia': 'keluodiya', 'Ghana': 'jiana', 'Panama': 'banama',
        'Korea Republic': 'hanguo', 'Czech Republic': 'jieke1', 'Turkey': 'tuerqi1',
        'United States': 'meiguo', 'Bosnia': 'bohei1'
    }

    # Fetch goals and clean_sheets (the two categories used for conversion)
    categories = ['goals', 'goals_conceded', 'shots', 'shots_on_target', 'clean_sheets']
    all_data = {}
    for cat in categories:
        try:
            resp = page.request.get(f'https://prod-cdn-stats-api.livescore.com/api/v1/competition/734/participantStats/group/{cat}?limit=50&locale=en', timeout=10000)
            data = resp.json()
            all_data[cat] = data
            parts = data.get('participants', [])
            group_parts = data.get('group', {}).get('participants', [])
            print(f"  {cat}: {len(group_parts)} teams")
        except Exception as e:
            print(f"  {cat}: ERROR - {e}")
            all_data[cat] = None

    # Simulate fetchAllLivescoreStats
    team_data = {}
    for cat in categories:
        data = all_data.get(cat)
        if not data or not data.get('group', {}).get('participants'):
            continue
        for p in data['group']['participants']:
            name = next((x.get('name', '') for x in data.get('participants', []) if x.get('id') == p.get('id')), '')
            if not name:
                continue
            if name not in team_data:
                team_data[name] = {}
            team_data[name][cat] = p

    # Simulate convertToSystemStats
    print("\n=== Step 2: Simulate convertToSystemStats ===")
    converted = {}
    unmapped = []
    for ls_name, data in team_data.items():
        team_id = LIVESCORE_TO_TEAM_ID.get(ls_name)
        if not team_id:
            unmapped.append(ls_name)
            continue
        goals = data.get('goals')
        goals_conceded = data.get('goals_conceded')
        shots = data.get('shots')
        shots_on_target = data.get('shots_on_target')
        clean_sheets = data.get('clean_sheets')
        if not goals:
            print(f"  {ls_name} ({team_id}): NO goals data, SKIPPED")
            continue
        played = clean_sheets.get('p', 1) if clean_sheets else 1
        gC = goals_conceded.get('gC', 0) if goals_conceded else 0
        xGc = goals_conceded.get('xGc', 0) if goals_conceded else 0

        result = {
            'avgXgFor': goals.get('xG', 0),
            'avgXgAgainst': xGc / played if played > 0 else 0,
            'avgPossession': 50,
            'avgShots': shots.get('pG', 0) if shots else 0,
            'avgShotsOnTarget': shots_on_target.get('pG', 0) if shots_on_target else 0,
            'avgGoalsFor': goals.get('g', 0) / played if played > 0 else 0,
            'avgGoalsAgainst': gC / played if played > 0 else 0,
            'avgCorners': 3.5,
            'winRate': max(0, min(1, 0.5 + (goals.get('df', 0) or 0) / (played * 4))) if played > 0 else 0
        }
        converted[team_id] = result

    print(f"Converted {len(converted)} teams")
    if unmapped:
        print(f"Unmapped teams ({len(unmapped)}): {unmapped}")

    # Show some converted results
    for tid in list(converted.keys())[:5]:
        print(f"  {tid}: {json.dumps(converted[tid])}")

    # 2. Compare with current JSON file data
    print("\n=== Step 3: Compare converted data with current JSON file ===")
    resp = page.request.get('http://localhost:3000/api/worldcup/team-stats')
    current = resp.json().get('stats', {})

    diff_count = 0
    same_count = 0
    for tid, new_stats in converted.items():
        old_stats = current.get(tid)
        if not old_stats:
            print(f"  {tid}: NEW (not in current file)")
            diff_count += 1
            continue
        diffs = []
        for key in new_stats:
            old_val = old_stats.get(key)
            new_val = new_stats[key]
            # Compare with some tolerance for floating point
            if isinstance(old_val, (int, float)) and isinstance(new_val, (int, float)):
                if abs(old_val - new_val) > 0.01:
                    diffs.append(f"{key}: {old_val} -> {new_val}")
            elif old_val != new_val:
                diffs.append(f"{key}: {old_val} -> {new_val}")
        if diffs:
            diff_count += 1
            if diff_count <= 10:
                print(f"  {tid} DIFF: {', '.join(diffs)}")
        else:
            same_count += 1

    print(f"\nDifferent: {diff_count}, Same: {same_count}")

    # 3. Check if the JSON file was actually updated on disk
    print("\n=== Step 4: Check JSON file modification time ===")
    import os
    json_path = r'd:\下载\足球竞彩量化分析系统\足球竞彩量化分析系统\src\data\worldcup_team_stats.json'
    if os.path.exists(json_path):
        mtime = os.path.getmtime(json_path)
        import datetime
        mtime_str = datetime.datetime.fromtimestamp(mtime).strftime('%Y-%m-%d %H:%M:%S')
        print(f"JSON file last modified: {mtime_str}")
        # Read the file directly
        with open(json_path, 'r', encoding='utf-8') as f:
            file_data = json.load(f)
        # Show a sample
        for tid in list(file_data.keys())[:3]:
            print(f"  {tid}: {json.dumps(file_data[tid])}")
    else:
        print("JSON file NOT FOUND!")

    # 4. Now call the actual refresh API and check again
    print("\n=== Step 5: Call actual refresh API and re-check ===")
    resp = page.request.post('http://localhost:3000/api/worldcup/refresh-team-stats', timeout=30000)
    result = resp.json()
    print(f"Refresh API result: {json.dumps(result)}")

    # Re-read the JSON file
    if os.path.exists(json_path):
        mtime2 = os.path.getmtime(json_path)
        mtime2_str = datetime.datetime.fromtimestamp(mtime2).strftime('%Y-%m-%d %H:%M:%S')
        print(f"JSON file last modified AFTER refresh: {mtime2_str}")
        with open(json_path, 'r', encoding='utf-8') as f:
            file_data2 = json.load(f)
        for tid in list(file_data2.keys())[:3]:
            print(f"  {tid}: {json.dumps(file_data2[tid])}")

        # Check if file actually changed
        if file_data == file_data2:
            print("\n*** FILE CONTENT IDENTICAL AFTER REFRESH! ***")
        else:
            print("\n*** FILE CONTENT CHANGED AFTER REFRESH ***")
            # Show diffs
            for tid in file_data2:
                if tid in file_data:
                    for key in file_data2[tid]:
                        if file_data[tid].get(key) != file_data2[tid].get(key):
                            print(f"  {tid}.{key}: {file_data[tid].get(key)} -> {file_data2[tid].get(key)}")

    browser.close()
    print("\n=== Diagnosis Complete ===")
