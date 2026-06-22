"""Precise test: Check if React state actually updates after loadStats."""
from playwright.sync_api import sync_playwright
import json

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page(viewport={"width": 1400, "height": 900})

    console_logs = []
    page.on('console', lambda msg: console_logs.append(f'[{msg.type}] {msg.text}'))

    page.goto('http://localhost:3000/#/worldcup', wait_until='networkidle', timeout=30000)
    page.wait_for_timeout(2000)

    # Click 球队战绩 tab
    teams_tab = page.locator('button:has-text("球队战绩")')
    if teams_tab.count() > 0:
        teams_tab.click()
        page.wait_for_timeout(3000)

    # Modify JSON file to create visible difference
    json_path = r'd:\下载\足球竞彩量化分析系统\足球竞彩量化分析系统\src\data\worldcup_team_stats.json'
    with open(json_path, 'r', encoding='utf-8') as f:
        original_data = json.load(f)

    modified_data = json.loads(json.dumps(original_data))
    modified_data['baxi']['avgXgFor'] = 77.7
    modified_data['baxi']['avgGoalsFor'] = 33.3

    with open(json_path, 'w', encoding='utf-8') as f:
        json.dump(modified_data, f, indent=2)
    print("Modified JSON: baxi xG=77.7, goals=33.3")

    # Test 1: Call GET /api/worldcup/team-stats directly from browser
    print("\n=== Test 1: Direct GET API call ===")
    api_result = page.evaluate("""async () => {
        const res = await fetch('/api/worldcup/team-stats');
        const data = await res.json();
        return {
            success: data.success,
            baxi_xG: data.stats?.baxi?.avgXgFor,
            baxi_goals: data.stats?.baxi?.avgGoalsFor
        };
    }""")
    print(f"  API result: {api_result}")

    # Test 2: Check if the React component's statsMap has the updated value
    # We need to intercept the React state update
    print("\n=== Test 2: Check React component state ===")
    # Add a debug hook to monitor setStatsMap calls
    page.evaluate("""() => {
        // Override fetch to log what loadStats receives
        const origFetch = window.fetch;
        window._debugStatsMap = null;
        window.fetch = async function(...args) {
            const res = await origFetch.apply(this, args);
            if (args[0] === '/api/worldcup/team-stats') {
                const clone = res.clone();
                const data = await clone.json();
                window._debugStatsMap = data.stats;
                console.log('[DEBUG] team-stats response:', JSON.stringify({
                    baxi_xG: data.stats?.baxi?.avgXgFor,
                    baxi_goals: data.stats?.baxi?.avgGoalsFor
                }));
            }
            return res;
        };
    }""")

    # Now click the refresh button
    print("\n=== Test 3: Click refresh button ===")
    refresh_btn = page.locator('button:has-text("刷新统计数据")')
    if refresh_btn.count() > 0:
        refresh_btn.click()
        page.wait_for_timeout(8000)

        # Check what the debug hook captured
        debug_result = page.evaluate("""() => {
            return {
                debugStatsMap_baxi_xG: window._debugStatsMap?.baxi?.avgXgFor,
                debugStatsMap_baxi_goals: window._debugStatsMap?.baxi?.avgGoalsFor
            };
        }""")
        print(f"  Debug captured: {debug_result}")

        # Check the actual table content
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
        print(f"  Table after refresh: {json.dumps(table_result, ensure_ascii=False)}")

    # Check console logs for the debug output
    print("\n=== Console logs ===")
    for log in console_logs:
        if 'DEBUG' in log or 'team-stats' in log:
            print(f"  {log}")

    # Test 4: Check if the issue is that refresh-team-stats POST overwrites the modified data
    print("\n=== Test 4: Does POST overwrite modified data? ===")
    # The POST /api/worldcup/refresh-team-stats calls livescore API and writes new data
    # This would overwrite our modified 77.7 value with the livescore value (3.0)
    # So the sequence is: POST (writes 3.0) -> GET (reads 3.0) -> UI shows 3.0
    # This means the UI update IS working, but the data is the same as before!

    # Let's verify: check what the POST endpoint wrote
    post_check = page.evaluate("""async () => {
        // Read the current file data via GET
        const res = await fetch('/api/worldcup/team-stats');
        const data = await res.json();
        return {
            baxi_xG: data.stats?.baxi?.avgXgFor,
            baxi_goals: data.stats?.baxi?.avgGoalsFor
        };
    }""")
    print(f"  After POST+GET: {post_check}")

    # Restore original data
    with open(json_path, 'w', encoding='utf-8') as f:
        json.dump(original_data, f, indent=2)
    print("\nRestored original JSON data")

    # Test 5: Simulate the scenario where livescore data actually changes
    # We'll intercept the POST to NOT call livescore, just return success
    # Then only the GET will be called, which should read our modified file
    print("\n=== Test 5: Skip POST, only GET ===")

    # Modify file again
    with open(json_path, 'w', encoding='utf-8') as f:
        json.dump(modified_data, f, indent=2)

    # Override fetch to skip the POST call
    page.evaluate("""() => {
        window.fetch = async function(...args) {
            const url = typeof args[0] === 'string' ? args[0] : args[0]?.url;
            const options = args[1] || {};
            // Skip the POST refresh call, return fake success
            if (url === '/api/worldcup/refresh-team-stats' && options.method === 'POST') {
                console.log('[DEBUG] Intercepted POST refresh, returning fake success');
                return new Response(JSON.stringify({ success: true, updated: 48, total: 48 }), {
                    status: 200,
                    headers: { 'Content-Type': 'application/json' }
                });
            }
            // Let GET calls through normally
            return window._origFetch.apply(this, args);
        };
    }""")

    # Click refresh again
    refresh_btn = page.locator('button:has-text("刷新统计数据")')
    if refresh_btn.count() > 0:
        refresh_btn.click()
        page.wait_for_timeout(5000)

        # Check table
        table_result2 = page.evaluate("""() => {
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
        print(f"  Table after skip-POST refresh: {json.dumps(table_result2, ensure_ascii=False)}")

        # Check if 77.7 appears
        found = False
        for row in table_result2:
            for cell in row:
                if '77.7' in cell:
                    found = True
                    print(f"  FOUND 77.7 in table!")
                    break
        if not found:
            print(f"  77.7 NOT found in table - UI NOT updating from GET response!")

    # Restore
    with open(json_path, 'w', encoding='utf-8') as f:
        json.dump(original_data, f, indent=2)

    browser.close()
    print("\n=== Test Complete ===")
