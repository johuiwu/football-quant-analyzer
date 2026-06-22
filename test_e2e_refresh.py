"""Full E2E test: Navigate to World Cup teams tab, click refresh, verify data changes."""
from playwright.sync_api import sync_playwright
import json
import time

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page()

    console_logs = []
    page.on('console', lambda msg: console_logs.append(f'[{msg.type}] {msg.text}'))

    network_requests = []
    def on_request(request):
        if 'worldcup' in request.url:
            network_requests.append(f'{request.method} {request.url}')
    page.on('request', on_request)

    network_responses = []
    def on_response(response):
        if 'worldcup' in response.url:
            try:
                body = response.json()
                network_responses.append({'url': response.url, 'status': response.status, 'body': body})
            except:
                network_responses.append({'url': response.url, 'status': response.status, 'body': None})
    page.on('response', on_response)

    # 1. Navigate to World Cup page
    print("=== Step 1: Navigate to World Cup page ===")
    page.goto('http://localhost:3000/#/worldcup', wait_until='networkidle', timeout=30000)
    page.wait_for_timeout(2000)
    page.screenshot(path='/tmp/wc_page_loaded.png', full_page=True)
    print(f"URL: {page.url}")

    # 2. Click "球队战绩" tab
    print("\n=== Step 2: Click 球队战绩 tab ===")
    teams_tab = page.locator('button:has-text("球队战绩")')
    if teams_tab.count() > 0:
        teams_tab.click()
        page.wait_for_timeout(3000)
        page.screenshot(path='/tmp/wc_teams_tab.png', full_page=True)
        print("Clicked 球队战绩 tab")
    else:
        print("ERROR: 球队战绩 tab not found!")
        # List all visible buttons
        all_btns = page.locator('button').all()
        for btn in all_btns:
            text = btn.text_content()
            if text and text.strip() and len(text.strip()) < 20:
                print(f"  Button: '{text.strip()}'")

    # 3. Capture current team stats display
    print("\n=== Step 3: Capture current table data ===")
    # Get the table rows
    rows = page.locator('table tbody tr').all()
    print(f"Found {len(rows)} table rows")
    if rows:
        for i, row in enumerate(rows[:5]):
            cells = row.locator('td').all()
            cell_texts = [c.text_content().strip() for c in cells]
            print(f"  Row {i}: {cell_texts}")

    # 4. Get current API data for comparison
    print("\n=== Step 4: Get current API data ===")
    resp = page.request.get('http://localhost:3000/api/worldcup/team-stats')
    before_data = resp.json().get('stats', {})
    print(f"Current stats count: {len(before_data)}")
    # Show some values
    for tid in ['deguo', 'baxi', 'faguo', 'agenting']:
        if tid in before_data:
            s = before_data[tid]
            print(f"  {tid}: xG={s.get('avgXgFor')}, goals={s.get('avgGoalsFor')}, winRate={s.get('winRate')}")

    # 5. Click "刷新统计数据" button
    print("\n=== Step 5: Click 刷新统计数据 button ===")
    refresh_btn = page.locator('button:has-text("刷新统计数据")')
    if refresh_btn.count() > 0:
        print("Found refresh button, clicking...")
        refresh_btn.click()

        # Wait for the refresh to complete (look for the button to stop spinning)
        try:
            # Wait up to 30 seconds for the button text to change back from "刷新中..."
            page.wait_for_function(
                'document.querySelector("button")?.textContent?.includes("刷新统计数据") && !document.querySelector("button")?.textContent?.includes("刷新中")',
                timeout=30000
            )
            print("Refresh completed!")
        except:
            print("Timeout waiting for refresh, continuing...")

        page.wait_for_timeout(2000)
        page.screenshot(path='/tmp/wc_after_refresh.png', full_page=True)
    else:
        print("ERROR: 刷新统计数据 button not found!")

    # 6. Check network responses
    print("\n=== Step 6: Check network responses ===")
    for resp_data in network_responses:
        url = resp_data['url']
        status = resp_data['status']
        body = resp_data.get('body')
        print(f"  {status} {url}")
        if body and isinstance(body, dict):
            if 'success' in body:
                print(f"    success={body['success']}")
            if 'updated' in body:
                print(f"    updated={body['updated']}")
            if 'stats' in body:
                stats = body['stats']
                print(f"    stats count={len(stats)}")
                # Show a sample
                for tid in list(stats.keys())[:2]:
                    print(f"    {tid}: {json.dumps(stats[tid])}")

    # 7. Get API data after refresh
    print("\n=== Step 7: Get API data after refresh ===")
    resp = page.request.get('http://localhost:3000/api/worldcup/team-stats')
    after_data = resp.json().get('stats', {})
    print(f"After stats count: {len(after_data)}")
    for tid in ['deguo', 'baxi', 'faguo', 'agenting']:
        if tid in after_data:
            s = after_data[tid]
            print(f"  {tid}: xG={s.get('avgXgFor')}, goals={s.get('avgGoalsFor')}, winRate={s.get('winRate')}")

    # 8. Compare before and after
    print("\n=== Step 8: Compare before vs after ===")
    changed = 0
    for tid in after_data:
        if tid in before_data:
            diffs = []
            for key in after_data[tid]:
                b = before_data[tid].get(key)
                a = after_data[tid].get(key)
                if b != a:
                    diffs.append(f"{key}: {b} -> {a}")
            if diffs:
                changed += 1
                if changed <= 5:
                    print(f"  {tid} CHANGED: {', '.join(diffs)}")
    print(f"Total changed: {changed}")

    # 9. Check table data after refresh
    print("\n=== Step 9: Check table data after refresh ===")
    rows = page.locator('table tbody tr').all()
    if rows:
        for i, row in enumerate(rows[:5]):
            cells = row.locator('td').all()
            cell_texts = [c.text_content().strip() for c in cells]
            print(f"  Row {i}: {cell_texts}")

    # 10. Check console errors
    print("\n=== Step 10: Console errors ===")
    errors = [log for log in console_logs if 'error' in log.lower()]
    if errors:
        for e in errors[:5]:
            print(f"  {e}")
    else:
        print("  No errors")

    browser.close()
    print("\n=== E2E Test Complete ===")
