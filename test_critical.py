"""Critical test: Does loadStats() actually update React state when called from handleRefresh?"""
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

    # Get BEFORE table
    before = page.evaluate("""() => {
        const table = document.querySelector('table');
        const rows = table.querySelectorAll('tbody tr');
        return Array.from(rows).slice(0,1).map(r =>
            Array.from(r.querySelectorAll('td')).map(c => c.textContent.trim())
        );
    }""")
    print(f"BEFORE: {before}")

    # Test A: Call loadStats directly from the browser console
    # This simulates what handleRefresh does (minus the POST)
    print("\n=== Test A: Direct loadStats call (no page reload) ===")

    # We can't call loadStats directly from outside React,
    # but we CAN trigger it by clicking the refresh button
    # BUT we need to prevent the POST from overwriting our changes

    # Approach: Override fetch to intercept the POST and return fake success
    page.evaluate("""() => {
        window._origFetch = window.fetch;
        window._postIntercepted = false;
        window.fetch = async function(...args) {
            const url = typeof args[0] === 'string' ? args[0] : args[0]?.url;
            const options = args[1] || {};
            if (url === '/api/worldcup/refresh-team-stats' && options.method === 'POST') {
                window._postIntercepted = true;
                console.log('[INTERCEPT] Blocked POST refresh-team-stats');
                return new Response(JSON.stringify({ success: true, updated: 48, total: 48 }), {
                    status: 200,
                    headers: { 'Content-Type': 'application/json' }
                });
            }
            return window._origFetch.apply(this, args);
        };
    }""")

    # Click the refresh button
    refresh_btn = page.locator('button:has-text("刷新统计数据")')
    if refresh_btn.count() > 0:
        refresh_btn.click()
        page.wait_for_timeout(5000)

        # Check if POST was intercepted
        intercepted = page.evaluate("() => window._postIntercepted")
        print(f"  POST intercepted: {intercepted}")

        # Check table
        after = page.evaluate("""() => {
            const table = document.querySelector('table');
            const rows = table.querySelectorAll('tbody tr');
            return Array.from(rows).slice(0,1).map(r =>
                Array.from(r.querySelectorAll('td')).map(c => c.textContent.trim())
            );
        }""")
        print(f"  AFTER: {after}")

        # Check if 77.7 appears
        found = any('77.7' in cell for row in after for cell in row)
        print(f"  77.7 found: {found}")

        if not found:
            print("\n  *** UI DID NOT UPDATE EVEN WHEN POST WAS BLOCKED! ***")
            print("  This means loadStats() is not properly updating React state")

            # Let's check if the GET request was even made
            get_check = page.evaluate("""async () => {
                // Make a direct GET request
                const res = await window._origFetch('/api/worldcup/team-stats');
                const data = await res.json();
                return { baxi_xG: data.stats?.baxi?.avgXgFor };
            }""")
            print(f"  Direct GET check: {get_check}")

    # Restore fetch
    page.evaluate("() => { window.fetch = window._origFetch; }")

    # Restore original data
    with open(json_path, 'w', encoding='utf-8') as f:
        json.dump(original_data, f, indent=2)
    print("\nRestored original JSON data")

    # Test B: Check if the issue is with the fetch interception
    # The intercepted fetch might not work correctly with React's fetch
    print("\n=== Test B: Alternative approach - use page.evaluate to trigger state update ===")

    # Modify file again
    with open(json_path, 'w', encoding='utf-8') as f:
        json.dump(modified_data, f, indent=2)

    # Try using React DevTools approach to force state update
    # Actually, let's just check if the component's loadStats function
    # is actually being called when the button is clicked

    # The simplest test: reload the page and check
    page.reload(wait_until='networkidle', timeout=30000)
    page.wait_for_timeout(2000)
    teams_tab = page.locator('button:has-text("球队战绩")')
    if teams_tab.count() > 0:
        teams_tab.click()
        page.wait_for_timeout(3000)

    after_reload = page.evaluate("""() => {
        const table = document.querySelector('table');
        const rows = table.querySelectorAll('tbody tr');
        return Array.from(rows).slice(0,1).map(r =>
            Array.from(r.querySelectorAll('td')).map(c => c.textContent.trim())
        );
    }""")
    print(f"  After page reload: {after_reload}")
    found_reload = any('77.7' in cell for row in after_reload for cell in row)
    print(f"  77.7 found after reload: {found_reload}")

    # Restore
    with open(json_path, 'w', encoding='utf-8') as f:
        json.dump(original_data, f, indent=2)

    browser.close()
    print("\n=== Test Complete ===")
