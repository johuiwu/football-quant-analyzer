"""Check if livescore API data matches what's stored, and if the data is actually current."""
from playwright.sync_api import sync_playwright
import json

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page()

    # 1. Get livescore goals data
    print("=== Livescore API raw data (goals) ===")
    resp = page.request.get('https://prod-cdn-stats-api.livescore.com/api/v1/competition/734/participantStats/group/goals?limit=50&locale=en', timeout=15000)
    goals_data = resp.json()
    participants = {p['id']: p['name'] for p in goals_data.get('participants', [])}
    group_parts = goals_data.get('group', {}).get('participants', [])

    # 2. Get livescore clean_sheets data (for played count)
    print("\n=== Livescore API raw data (clean_sheets) ===")
    resp2 = page.request.get('https://prod-cdn-stats-api.livescore.com/api/v1/competition/734/participantStats/group/clean_sheets?limit=50&locale=en', timeout=15000)
    cs_data = resp2.json()
    cs_parts = {p['id']: p for p in cs_data.get('group', {}).get('participants', [])}

    # 3. Get current JSON file data
    print("\n=== Current JSON file data ===")
    resp3 = page.request.get('http://localhost:3000/api/worldcup/team-stats')
    file_data = resp3.json().get('stats', {})

    # 4. Compare livescore raw data with what convertToSystemStats would produce
    print("\n=== Detailed comparison: livescore raw vs JSON file ===")
    LIVESCORE_TO_TEAM_ID = {
        'Germany': 'deguo', 'Brazil': 'baxi', 'France': 'faguo', 'Argentina': 'agenting',
        'England': 'yinggelan', 'Spain': 'xibanya', 'Netherlands': 'helan',
        'USA': 'meiguo', 'Japan': 'riben', 'South Korea': 'hanguo',
    }

    for gp in group_parts[:10]:
        name = participants.get(gp['id'], 'unknown')
        team_id = LIVESCORE_TO_TEAM_ID.get(name)
        if not team_id:
            continue

        g = gp.get('g', 0)
        xG = gp.get('xG', 0)
        df = gp.get('df', 0)

        cs = cs_parts.get(gp['id'], {})
        played = cs.get('p', 1)

        # What convertToSystemStats would compute
        computed_avgGoalsFor = g / played if played > 0 else 0
        computed_avgXgFor = xG if xG is not None else 0
        computed_winRate = max(0, min(1, 0.5 + (df or 0) / (played * 4))) if played > 0 else 0

        # What's in the JSON file
        file_stats = file_data.get(team_id, {})

        print(f"\n  {name} ({team_id}):")
        print(f"    Livescore raw: g={g}, xG={xG}, df={df}, played={played}")
        print(f"    Computed:      avgGoalsFor={computed_avgGoalsFor:.1f}, avgXgFor={computed_avgXgFor}, winRate={computed_winRate:.4f}")
        print(f"    JSON file:     avgGoalsFor={file_stats.get('avgGoalsFor')}, avgXgFor={file_stats.get('avgXgFor')}, winRate={file_stats.get('winRate')}")

        # Check if they match
        matches = (
            abs(computed_avgGoalsFor - file_stats.get('avgGoalsFor', 0)) < 0.01 and
            abs(computed_avgXgFor - file_stats.get('avgXgFor', 0)) < 0.01 and
            abs(computed_winRate - file_stats.get('winRate', 0)) < 0.001
        )
        print(f"    MATCH: {matches}")

    # 5. Check if the competition 734 is actually the 2026 World Cup
    print("\n=== Check competition info ===")
    try:
        resp4 = page.request.get('https://prod-cdn-stats-api.livescore.com/api/v1/competition/734?locale=en', timeout=10000)
        comp_data = resp4.json()
        print(f"Competition data: {json.dumps(comp_data, indent=2)[:500]}")
    except Exception as e:
        print(f"Could not fetch competition info: {e}")

    browser.close()
    print("\n=== Comparison Complete ===")
