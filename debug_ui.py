from playwright.sync_api import sync_playwright
import time, json

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page(viewport={"width": 1600, "height": 1000})

    # Collect console logs
    page.on("console", lambda msg: print(f"CONSOLE [{msg.type}]: {msg.text[:200]}"))

    # Collect API responses
    api_data = {}
    def handle_response(response):
        if '/api/corner/' in response.url:
            try:
                api_data[response.url] = response.json()
            except:
                pass
    page.on("response", handle_response)

    page.goto('http://localhost:3000')
    page.wait_for_load_state('networkidle')
    time.sleep(3)

    # Click corner system
    corner_btn = page.locator('button:has-text("角球系统")').first
    corner_btn.click()
    time.sleep(3)

    # Check what tab is active
    body_text = page.locator('body').text_content() or ""
    print(f"Page text (first 500 chars after corner click):")
    corner_idx = body_text.find('角球系统')
    if corner_idx >= 0:
        print(body_text[corner_idx:corner_idx+500])

    # Click "启动监控"
    start_btn = page.locator('button:has-text("启动监控")').first
    if start_btn.is_visible(timeout=3000):
        print("\nClicking '启动监控'...")
        start_btn.click()
        time.sleep(10)

        # Check API responses
        print("\nAPI responses:")
        for url, data in api_data.items():
            print(f"  {url}:")
            if isinstance(data, dict):
                if 'data' in data:
                    print(f"    data count: {len(data['data'])}")
                    if len(data['data']) > 0:
                        print(f"    first match: {json.dumps(data['data'][0], ensure_ascii=False)[:200]}")
                if 'mainMarkets' in data:
                    mm = data['mainMarkets']
                    print(f"    mainMarkets count: {len(mm)}")
                    for key, val in list(mm.items())[:2]:
                        print(f"    {key}: {json.dumps(val, ensure_ascii=False)[:200]}")

    # Take screenshot
    page.screenshot(path='/tmp/crawler_state.png', full_page=True)

    # Now check the monitor tab
    monitor_btn = page.locator('button:has-text("实时监控")').first
    if monitor_btn.is_visible(timeout=3000):
        print("\nClicking '实时监控'...")
        monitor_btn.click()
        time.sleep(5)

        # Check API responses again
        print("\nAPI responses after monitor click:")
        for url, data in api_data.items():
            if 'live' in url:
                print(f"  {url}:")
                if isinstance(data, dict):
                    if 'data' in data:
                        print(f"    data count: {len(data['data'])}")
                    if 'mainMarkets' in data:
                        print(f"    mainMarkets count: {len(data['mainMarkets'])}")

        page.screenshot(path='/tmp/monitor_state.png', full_page=True)

        body_text2 = page.locator('body').text_content() or ""
        monitor_idx = body_text2.find('实时监控')
        if monitor_idx >= 0:
            print(f"\nMonitor section text (800 chars):")
            print(body_text2[monitor_idx:monitor_idx+800])

    browser.close()
