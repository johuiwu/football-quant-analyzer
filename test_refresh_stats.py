"""Test the World Cup '刷新统计数据' button and verify data changes."""
from playwright.sync_api import sync_playwright
import json
import time

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page()

    # Collect console logs and network responses
    console_logs = []
    page.on('console', lambda msg: console_logs.append(f'[{msg.type}] {msg.text}'))

    network_responses = []
    def on_response(response):
        if 'worldcup' in response.url:
            network_responses.append({
                'url': response.url,
                'status': response.status,
                'body': None
            })
            try:
                network_responses[-1]['body'] = response.json()
            except:
                try:
                    network_responses[-1]['body'] = response.text()[:500]
                except:
                    pass
    page.on('response', on_response)

    # 1. Navigate to World Cup page
    print("=== Step 1: Navigate to World Cup page ===")
    page.goto('http://localhost:3000', wait_until='networkidle', timeout=30000)
    page.screenshot(path='/tmp/wc_initial.png', full_page=True)
    print(f"Page title: {page.title()}")

    # 2. Find and click the "球队战绩" tab
    print("\n=== Step 2: Click 球队战绩 tab ===")
    teams_tab = page.locator('button:has-text("球队战绩")')
    if teams_tab.count() > 0:
        teams_tab.click()
        page.wait_for_timeout(2000)
        page.screenshot(path='/tmp/wc_teams_tab.png', full_page=True)
        print("Clicked 球队战绩 tab")
    else:
        print("ERROR: 球队战绩 tab not found!")

    # 3. Capture initial team stats data via direct API
    print("\n=== Step 3: Capture initial team stats ===")
    init_resp = page.request.get('http://localhost:3000/api/worldcup/team-stats')
    api_response = init_resp.json()
    initial_stats = api_response.get('stats', {})
    initial_count = api_response.get('count', 0)
    print(f"Initial stats count: {initial_count}")
    if initial_stats:
        for team_id in list(initial_stats.keys())[:3]:
            print(f"  {team_id}: {initial_stats[team_id]}")

    # 4. Click the "刷新统计数据" button
    print("\n=== Step 4: Click 刷新统计数据 button ===")
    refresh_btn = page.locator('button:has-text("刷新统计数据")')
    if refresh_btn.count() > 0:
        print("Found 刷新统计数据 button, clicking...")
        refresh_btn.click()
        page.wait_for_timeout(15000)
        page.screenshot(path='/tmp/wc_after_refresh.png', full_page=True)
    else:
        print("ERROR: 刷新统计数据 button not found!")

    # 5. Check network responses
    print("\n=== Step 5: Check network responses ===")
    for resp in network_responses:
        print(f"  URL: {resp['url']}")
        print(f"  Status: {resp['status']}")
        if resp['body'] and isinstance(resp['body'], dict):
            print(f"  Body keys: {list(resp['body'].keys())}")
            if 'success' in resp['body']:
                print(f"  Success: {resp['body']['success']}")
            if 'updated' in resp['body']:
                print(f"  Updated: {resp['body']['updated']}")
            if 'total' in resp['body']:
                print(f"  Total: {resp['body']['total']}")
            if 'message' in resp['body']:
                print(f"  Message: {resp['body']['message']}")

    # 6. Get stats after refresh
    print("\n=== Step 6: Get stats after refresh ===")
    after_resp = page.request.get('http://localhost:3000/api/worldcup/team-stats')
    api_response_after = after_resp.json()
    after_stats = api_response_after.get('stats', {})
    after_count = api_response_after.get('count', 0)
    print(f"After refresh stats count: {after_count}")

    # 7. Compare before and after
    print("\n=== Step 7: Compare before vs after ===")
    if initial_stats and after_stats:
        changed_count = 0
        for team_id in after_stats:
            if team_id in initial_stats:
                before = initial_stats[team_id]
                after = after_stats[team_id]
                diffs = []
                for key in after:
                    if before.get(key) != after.get(key):
                        diffs.append(f"{key}: {before.get(key)} -> {after.get(key)}")
                if diffs:
                    changed_count += 1
                    if changed_count <= 5:
                        print(f"  {team_id} CHANGED: {', '.join(diffs)}")
            else:
                print(f"  {team_id} NEW (not in initial)")
        print(f"\nTotal teams with changed data: {changed_count}")
        if changed_count == 0:
            print("*** NO DATA CHANGED AFTER REFRESH! ***")
    else:
        print("Cannot compare - missing stats data")

    # 8. Check console logs for errors
    print("\n=== Step 8: Console logs (errors only) ===")
    error_logs = [log for log in console_logs if 'error' in log.lower()]
    if error_logs:
        for log in error_logs[:10]:
            print(f"  {log}")
    else:
        print("  No errors found in console")

    # 9. Directly test the refresh API endpoint
    print("\n=== Step 9: Direct API test ===")
    direct_resp = page.request.post('http://localhost:3000/api/worldcup/refresh-team-stats')
    direct_result = direct_resp.json()
    print(f"Direct API call result: {json.dumps(direct_result, indent=2, default=str)[:1000]}")

    # 10. Get stats one more time after direct API call
    print("\n=== Step 10: Stats after direct refresh ===")
    final_resp = page.request.get('http://localhost:3000/api/worldcup/team-stats')
    final_result = final_resp.json()
    final_stats = final_result.get('stats', {})
    if final_stats and after_stats:
        changed_count2 = 0
        for team_id in final_stats:
            if team_id in after_stats:
                before = after_stats[team_id]
                after = final_stats[team_id]
                diffs = []
                for key in after:
                    if before.get(key) != after.get(key):
                        diffs.append(f"{key}: {before.get(key)} -> {after.get(key)}")
                if diffs:
                    changed_count2 += 1
                    if changed_count2 <= 5:
                        print(f"  {team_id} CHANGED: {', '.join(diffs)}")
        print(f"Total teams changed after direct refresh: {changed_count2}")

    browser.close()
    print("\n=== Test Complete ===")
