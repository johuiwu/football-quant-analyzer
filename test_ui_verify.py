"""Final E2E test: Take screenshots before and after refresh to verify UI changes."""
from playwright.sync_api import sync_playwright
import json

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page(viewport={"width": 1400, "height": 900})

    # Navigate to World Cup page
    page.goto('http://localhost:3000/#/worldcup', wait_until='networkidle', timeout=30000)
    page.wait_for_timeout(2000)

    # Click 球队战绩 tab
    teams_tab = page.locator('button:has-text("球队战绩")')
    if teams_tab.count() > 0:
        teams_tab.click()
        page.wait_for_timeout(3000)

    # Take BEFORE screenshot
    page.screenshot(path='/tmp/wc_before_refresh.png', full_page=True)
    print("=== BEFORE screenshot taken ===")

    # Get the table content BEFORE
    before_rows = page.locator('table tbody tr').all()
    print(f"Table rows BEFORE: {len(before_rows)}")
    before_data = []
    for row in before_rows[:5]:
        cells = row.locator('td').all()
        cell_texts = [c.text_content().strip() for c in cells]
        before_data.append(cell_texts)
        print(f"  {cell_texts}")

    # Now manually modify the JSON file to create a visible difference
    # This simulates what would happen if the livescore API returned different data
    print("\n=== Modifying JSON file to simulate data change ===")
    result = page.evaluate("""async () => {
        // First refresh to get current data
        await fetch('/api/worldcup/refresh-team-stats', { method: 'POST' });
        const res = await fetch('/api/worldcup/team-stats');
        const data = await res.json();
        return data;
    }""")
    print(f"Current stats count: {len(result.get('stats', {}))}")

    # Now let's check if the UI actually shows the stats data
    # Look at the table cells that should contain stats
    print("\n=== Checking table cell values ===")
    # Get all cells in the first few rows
    for i, row_data in enumerate(before_data[:3]):
        if len(row_data) > 2:
            print(f"  Row {i}: team={row_data[1] if len(row_data) > 1 else '?'}, stats_start={row_data[2:6] if len(row_data) > 5 else row_data}")

    # Check what getStats returns for a specific team
    print("\n=== Check getStats function output ===")
    stats_check = page.evaluate("""() => {
        // Check the statsMap in the React component
        const table = document.querySelector('table');
        if (!table) return { error: 'No table found' };
        const rows = table.querySelectorAll('tbody tr');
        const result = [];
        for (let i = 0; i < Math.min(rows.length, 5); i++) {
            const cells = rows[i].querySelectorAll('td');
            const cellTexts = Array.from(cells).map(c => c.textContent.trim());
            result.push(cellTexts);
        }
        return result;
    }""")
    print(f"Table content: {json.dumps(stats_check, ensure_ascii=False, indent=2)[:800]}")

    # Check if stats values are actually displayed or just default values
    print("\n=== Verify stats values match API data ===")
    api_data = page.evaluate("""async () => {
        const res = await fetch('/api/worldcup/team-stats');
        return await res.json();
    }""")
    stats = api_data.get('stats', {})

    # Check a few teams
    for team_id in ['deguo', 'baxi', 'faguo']:
        if team_id in stats:
            s = stats[team_id]
            print(f"  API {team_id}: xG={s.get('avgXgFor')}, goals={s.get('avgGoalsFor')}, winRate={s.get('winRate')}")

    # Now simulate a data change by modifying the JSON file via a custom API call
    # We'll write different data to see if the UI updates
    print("\n=== Simulate data change via direct file write ===")
    # Read the current JSON file
    import os
    json_path = r'd:\下载\足球竞彩量化分析系统\足球竞彩量化分析系统\src\data\worldcup_team_stats.json'
    with open(json_path, 'r', encoding='utf-8') as f:
        original_data = json.load(f)

    # Modify some values to create a visible change
    modified_data = json.loads(json.dumps(original_data))  # deep copy
    if 'deguo' in modified_data:
        modified_data['deguo']['avgXgFor'] = 99.9  # Obvious change
        modified_data['deguo']['avgGoalsFor'] = 50.0
    if 'baxi' in modified_data:
        modified_data['baxi']['avgXgFor'] = 88.8
        modified_data['baxi']['avgGoalsFor'] = 40.0

    # Write modified data
    with open(json_path, 'w', encoding='utf-8') as f:
        json.dump(modified_data, f, indent=2)
    print("Modified JSON file with test values")

    # Now click the refresh button in the UI
    refresh_btn = page.locator('button:has-text("刷新统计数据")')
    if refresh_btn.count() > 0:
        # First, reload the stats from the modified file
        page.evaluate("""async () => {
            // Simulate what loadStats does - just fetch team-stats
            const res = await fetch('/api/worldcup/team-stats');
            const data = await res.json();
            // This should now return the modified data
            return data;
        }""")

        # Click refresh button which calls POST then GET
        refresh_btn.click()
        page.wait_for_timeout(5000)

        # Take AFTER screenshot
        page.screenshot(path='/tmp/wc_after_modified_refresh.png', full_page=True)
        print("AFTER screenshot taken")

        # Check table content after
        after_check = page.evaluate("""() => {
            const table = document.querySelector('table');
            if (!table) return { error: 'No table found' };
            const rows = table.querySelectorAll('tbody tr');
            const result = [];
            for (let i = 0; i < Math.min(rows.length, 5); i++) {
                const cells = rows[i].querySelectorAll('td');
                const cellTexts = Array.from(cells).map(c => c.textContent.trim());
                result.push(cellTexts);
            }
            return result;
        }""")
        print(f"\nTable AFTER: {json.dumps(after_check, ensure_ascii=False, indent=2)[:800]}")

        # Check if the modified values appear
        print("\n=== Check if modified values appear in UI ===")
        for row_data in after_check:
            if row_data and len(row_data) > 2:
                # Look for 99.9 or 88.8 or 50.0 or 40.0
                row_str = ' '.join(row_data)
                if '99.9' in row_str or '88.8' in row_str or '50' in row_str:
                    print(f"  FOUND modified values in row: {row_data}")

    # Restore original data
    with open(json_path, 'w', encoding='utf-8') as f:
        json.dump(original_data, f, indent=2)
    print("\nRestored original JSON data")

    browser.close()
    print("\n=== Test Complete ===")
