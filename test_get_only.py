"""Test: Modify JSON file, then only call GET (not POST) to see if UI updates."""
from playwright.sync_api import sync_playwright
import json
import os

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page(viewport={"width": 1400, "height": 900})

    page.goto('http://localhost:3000/#/worldcup', wait_until='networkidle', timeout=30000)
    page.wait_for_timeout(2000)

    # Click 球队战绩 tab
    teams_tab = page.locator('button:has-text("球队战绩")')
    if teams_tab.count() > 0:
        teams_tab.click()
        page.wait_for_timeout(3000)

    # Get BEFORE table data
    before = page.evaluate("""() => {
        const table = document.querySelector('table');
        if (!table) return [];
        const rows = table.querySelectorAll('tbody tr');
        const result = [];
        for (let i = 0; i < Math.min(rows.length, 3); i++) {
            const cells = rows[i].querySelectorAll('td');
            result.push(Array.from(cells).map(c => c.textContent.trim()));
        }
        return result;
    }""")
    print("=== BEFORE (first 3 rows) ===")
    for row in before:
        print(f"  {row}")

    # Modify JSON file directly (without POST refresh)
    json_path = r'd:\下载\足球竞彩量化分析系统\足球竞彩量化分析系统\src\data\worldcup_team_stats.json'
    with open(json_path, 'r', encoding='utf-8') as f:
        original_data = json.load(f)

    modified_data = json.loads(json.dumps(original_data))
    # Make VERY obvious changes
    modified_data['baxi']['avgXgFor'] = 77.7
    modified_data['baxi']['avgGoalsFor'] = 33.3
    modified_data['faguo']['avgXgFor'] = 66.6
    modified_data['faguo']['avgGoalsFor'] = 22.2

    with open(json_path, 'w', encoding='utf-8') as f:
        json.dump(modified_data, f, indent=2)
    print("\n=== Modified JSON file (baxi xG=77.7, faguo xG=66.6) ===")

    # Now ONLY call GET /api/worldcup/team-stats (not POST refresh)
    print("\n=== Calling GET /api/worldcup/team-stats (no POST) ===")
    get_result = page.evaluate("""async () => {
        const res = await fetch('/api/worldcup/team-stats');
        return await res.json();
    }""")
    stats = get_result.get('stats', {})
    print(f"  baxi from API: xG={stats.get('baxi', {}).get('avgXgFor')}, goals={stats.get('baxi', {}).get('avgGoalsFor')}")
    print(f"  faguo from API: xG={stats.get('faguo', {}).get('avgXgFor')}, goals={stats.get('faguo', {}).get('avgGoalsFor')}")

    # Now trigger loadStats via the React component
    # We need to click the refresh button which calls POST then GET
    # But we want to test just GET - so let's use React state directly
    # Actually, the refresh button calls POST first which will overwrite our changes
    # Let's just check if the GET API returns the modified data
    print("\n=== Does GET API return modified data? ===")
    if stats.get('baxi', {}).get('avgXgFor') == 77.7:
        print("  YES! GET API returns modified data")
    else:
        print("  NO! GET API returns original data")
        # This means readStatsFromFile is NOT reading the modified JSON file
        # Check if readStatsFromFile has a caching issue

    # Check the actual file on disk
    with open(json_path, 'r', encoding='utf-8') as f:
        disk_data = json.load(f)
    print(f"\n  File on disk baxi xG: {disk_data.get('baxi', {}).get('avgXgFor')}")

    # Restore original data
    with open(json_path, 'w', encoding='utf-8') as f:
        json.dump(original_data, f, indent=2)
    print("\n=== Restored original JSON data ===")

    # Now test the actual refresh flow
    # 1. Click refresh button
    # 2. Wait for POST + GET to complete
    # 3. Check if UI table updates
    print("\n=== Test actual refresh flow ===")
    refresh_btn = page.locator('button:has-text("刷新统计数据")')
    if refresh_btn.count() > 0:
        refresh_btn.click()
        page.wait_for_timeout(10000)  # Wait for POST + GET to complete

        after = page.evaluate("""() => {
            const table = document.querySelector('table');
            if (!table) return [];
            const rows = table.querySelectorAll('tbody tr');
            const result = [];
            for (let i = 0; i < Math.min(rows.length, 3); i++) {
                const cells = rows[i].querySelectorAll('td');
                result.push(Array.from(cells).map(c => c.textContent.trim()));
            }
            return result;
        }""")
        print("=== AFTER refresh (first 3 rows) ===")
        for row in after:
            print(f"  {row}")

        # Compare before and after
        if before == after:
            print("\n*** UI DATA UNCHANGED AFTER REFRESH ***")
        else:
            print("\n*** UI DATA CHANGED AFTER REFRESH ***")
            for i in range(min(len(before), len(after))):
                if before[i] != after[i]:
                    print(f"  Row {i} changed:")
                    print(f"    Before: {before[i]}")
                    print(f"    After:  {after[i]}")

    browser.close()
    print("\n=== Test Complete ===")
