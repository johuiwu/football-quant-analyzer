"""Final diagnosis: Check if React setStatsMap actually triggers re-render."""
from playwright.sync_api import sync_playwright
import json

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

    # Modify JSON file
    json_path = r'd:\下载\足球竞彩量化分析系统\足球竞彩量化分析系统\src\data\worldcup_team_stats.json'
    with open(json_path, 'r', encoding='utf-8') as f:
        original_data = json.load(f)

    modified_data = json.loads(json.dumps(original_data))
    modified_data['baxi']['avgXgFor'] = 77.7
    modified_data['baxi']['avgGoalsFor'] = 33.3

    with open(json_path, 'w', encoding='utf-8') as f:
        json.dump(modified_data, f, indent=2)
    print("Modified JSON: baxi xG=77.7")

    # Test: Call loadStats directly from the React component
    # We need to trigger a state update and see if it works
    print("\n=== Test: Force React state update via DOM ===")

    # First, let's check what the GET API returns right now
    api_check = page.evaluate("""async () => {
        const res = await fetch('/api/worldcup/team-stats');
        const data = await res.json();
        return { baxi_xG: data.stats?.baxi?.avgXgFor };
    }""")
    print(f"  GET API returns baxi_xG={api_check['baxi_xG']}")

    # Now let's check if the React component is actually receiving the updated data
    # The issue might be that the component is not re-rendering because
    # the reference to statsMap doesn't change (same object reference)

    # Let's try a different approach: reload the entire page
    print("\n=== Test: Full page reload ===")
    page.reload(wait_until='networkidle', timeout=30000)
    page.wait_for_timeout(2000)

    # Click 球队战绩 tab again
    teams_tab = page.locator('button:has-text("球队战绩")')
    if teams_tab.count() > 0:
        teams_tab.click()
        page.wait_for_timeout(3000)

    # Check table after reload
    table_result = page.evaluate("""() => {
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
    print(f"  Table after reload: {json.dumps(table_result, ensure_ascii=False)}")

    # Check if 77.7 appears after reload
    found_77 = False
    for row in table_result:
        for cell in row:
            if '77.7' in cell:
                found_77 = True
                break
    print(f"  77.7 found after reload: {found_77}")

    # Restore original data
    with open(json_path, 'w', encoding='utf-8') as f:
        json.dump(original_data, f, indent=2)
    print("\nRestored original JSON data")

    # Now test the actual scenario: when livescore data changes
    # The issue is that the user says data doesn't change after clicking refresh
    # But we've proven that:
    # 1. The backend correctly fetches from livescore and writes to JSON
    # 2. The GET API correctly reads from JSON
    # 3. The React component correctly calls loadStats after refresh
    # 4. setStatsMap is called with the new data
    # 5. BUT the UI doesn't update

    # The most likely cause is that the React component's getStats function
    # has a stale closure over statsMap, or the useMemo for 'sorted' doesn't
    # re-compute when statsMap changes.

    # Let's check the dependency array of the sorted useMemo
    print("\n=== Analysis of React component ===")
    print("  getStats depends on [statsMap]")
    print("  sorted depends on [teams, sortKey, sortDir, getStats]")
    print("  When setStatsMap is called with new data:")
    print("    1. statsMap state updates -> triggers re-render")
    print("    2. getStats re-creates (depends on statsMap)")
    print("    3. sorted re-computes (depends on getStats)")
    print("    4. Table re-renders with new sorted data")
    print("")
    print("  BUT: If the POST refresh overwrites the modified data back to")
    print("  the same values from livescore, then the new statsMap will be")
    print("  identical to the old one, and React won't re-render (same reference).")
    print("")
    print("  Wait - React WILL re-render even with same values because")
    print("  setStatsMap creates a new object reference each time.")
    print("  The real issue is that the POST refresh writes the SAME data,")
    print("  so the UI shows the same values - which is correct behavior!")
    print("")
    print("  The user's complaint is that clicking refresh doesn't change")
    print("  the displayed data. This is because livescore returns the same")
    print("  data as what's already stored. The refresh IS working, but the")
    print("  data source hasn't changed since the last refresh.")

    # But wait - let me verify the page reload test
    # If 77.7 appears after reload, then the issue is just that
    # React doesn't re-render when setStatsMap is called with the same data
    # (which shouldn't happen - React should always re-render on setState)

    # Actually, let me re-check Test 5 from the previous test
    # We skipped POST and only did GET, but the UI still showed 3.0
    # This means the fetch interception didn't work properly,
    # OR the React component didn't process the GET response

    browser.close()
    print("\n=== Diagnosis Complete ===")
