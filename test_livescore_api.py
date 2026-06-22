"""Diagnose: Check what livescore API actually returns and what convertToSystemStats produces."""
from playwright.sync_api import sync_playwright
import json

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page()

    # 1. Directly call the livescore API to see raw data
    print("=== Step 1: Call livescore goals API directly ===")
    try:
        resp = page.request.get('https://prod-cdn-stats-api.livescore.com/api/v1/competition/734/participantStats/group/goals?limit=50&locale=en', timeout=15000)
        goals_data = resp.json()
        participants = goals_data.get('participants', [])
        group_parts = goals_data.get('group', {}).get('participants', [])
        print(f"Participants count: {len(participants)}")
        print(f"Group participants count: {len(group_parts)}")
        if participants:
            print(f"Sample participant: {json.dumps(participants[0], indent=2)[:500]}")
        if group_parts:
            print(f"Sample group participant: {json.dumps(group_parts[0], indent=2)[:500]}")
            # Show first 5 team names and their stats
            for gp in group_parts[:5]:
                name = next((p_item.get('name', 'unknown') for p_item in participants if p_item.get('id') == gp.get('id')), 'unknown')
                print(f"  Team: {name}, g={gp.get('g')}, xG={gp.get('xG')}, df={gp.get('df')}, p={gp.get('p')}")
    except Exception as e:
        print(f"ERROR calling goals API: {e}")

    # 2. Call all 9 categories to see what data is available
    print("\n=== Step 2: Check all livescore categories ===")
    categories = ['goals', 'goals_conceded', 'assist', 'shots_on_target', 'shots', 'successful_dribbles', 'clean_sheets', 'yellow_cards', 'red_cards']
    for cat in categories:
        try:
            resp = page.request.get(f'https://prod-cdn-stats-api.livescore.com/api/v1/competition/734/participantStats/group/{cat}?limit=50&locale=en', timeout=10000)
            data = resp.json()
            parts = data.get('participants', [])
            group_parts = data.get('group', {}).get('participants', [])
            if group_parts:
                sample = group_parts[0]
                name = next((p_item.get('name', 'unknown') for p_item in parts if p_item.get('id') == sample.get('id')), 'unknown')
                print(f"  {cat}: {len(group_parts)} teams, sample: {name} -> {json.dumps(sample)[:200]}")
            else:
                print(f"  {cat}: NO DATA (group.participants empty)")
        except Exception as e:
            print(f"  {cat}: ERROR - {e}")

    # 3. Call the backend refresh API and check what it writes
    print("\n=== Step 3: Call backend refresh-team-stats ===")
    try:
        resp = page.request.post('http://localhost:3000/api/worldcup/refresh-team-stats', timeout=30000)
        result = resp.json()
        print(f"Refresh result: {json.dumps(result, indent=2)}")
    except Exception as e:
        print(f"ERROR: {e}")

    # 4. Read the JSON file after refresh
    print("\n=== Step 4: Read team-stats after refresh ===")
    try:
        resp = page.request.get('http://localhost:3000/api/worldcup/team-stats')
        result = resp.json()
        stats = result.get('stats', {})
        # Show a few teams with their full stats
        for team_id in list(stats.keys())[:5]:
            print(f"  {team_id}: {json.dumps(stats[team_id])}")
    except Exception as e:
        print(f"ERROR: {e}")

    # 5. Check the server logs for any errors
    print("\n=== Step 5: Check server-side processing ===")
    # Call refresh-data endpoint to see what worldcupDataFetcher returns
    try:
        resp = page.request.get('http://localhost:3000/api/worldcup/refresh-data', timeout=60000)
        result = resp.json()
        print(f"refresh-data result: {json.dumps(result, indent=2)[:500]}")
    except Exception as e:
        print(f"ERROR: {e}")

    browser.close()
    print("\n=== Diagnosis Complete ===")
