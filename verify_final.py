from playwright.sync_api import sync_playwright
import time, json

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page(viewport={"width": 1600, "height": 1000})

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

    # Navigate to corner system
    corner_btn = page.locator('button:has-text("角球系统")').first
    corner_btn.click()
    time.sleep(3)

    # Start monitoring to get data
    start_btn = page.locator('button:has-text("启动监控")').first
    if start_btn.is_visible(timeout=3000):
        start_btn.click()
        time.sleep(8)

    # Switch to monitor tab
    monitor_btn = page.locator('button:has-text("实时监控")').first
    if monitor_btn.is_visible(timeout=3000):
        monitor_btn.click()
        time.sleep(5)

        # Take screenshot
        page.screenshot(path='/tmp/verify_final.png', full_page=True)
        print("Screenshot saved")

        # Check for new UI elements
        body_text = page.locator('body').text_content() or ""

        # Check for 8-column headers
        new_headers = ["角球大小", "角球大小/半", "角球让球", "角球让球/半", "下个角球", "角球单双", "主盘让球", "主盘大小"]
        print("\n=== Column Headers ===")
        for h in new_headers:
            found = h in body_text
            print(f"  '{h}': {'✓' if found else '✗'}")

        # Check for O/U odds values
        print("\n=== O/U Odds Check ===")
        for url, data in api_data.items():
            if 'live' in url and isinstance(data, dict):
                if 'mainMarkets' in data:
                    mm = data['mainMarkets']
                    for key, val in list(mm.items())[:3]:
                        if 'ou' in val:
                            for ou in val['ou'][:2]:
                                line = ou.get('line', 0)
                                over = ou.get('overOdds', 0)
                                under = ou.get('underOdds', 0)
                                print(f"  Match {key}: line={line}, overOdds={over}, underOdds={under}")
                                # Verify over > under for positive line
                                if line > 0 and over > 0 and under > 0:
                                    if over > under:
                                        print(f"    ✓ O/U mapping correct (over={over} > under={under})")
                                    else:
                                        print(f"    ✗ O/U mapping INCORRECT (over={over} < under={under})")

        # Check for text-red-400 (odds styling)
        red_elements = page.locator('[class*="text-red-400"]').all()
        print(f"\n=== Styling ===")
        print(f"  text-red-400 elements: {len(red_elements)}")

        # Check for Lock icons
        lock_svgs = page.locator('svg[class*="lucide-lock"]').all()
        print(f"  Lock icons: {len(lock_svgs)}")

        # Check for grid structure
        grids = page.locator('[class*="grid-cols-"]').all()
        print(f"  Grid elements: {len(grids)}")

        # Check for match data
        print("\n=== Data Check ===")
        if 'data' in api_data.get('http://localhost:3000/api/corner/live', {}):
            data_count = len(api_data['http://localhost:3000/api/corner/live']['data'])
            print(f"  Live matches: {data_count}")
        if 'mainMarkets' in api_data.get('http://localhost:3000/api/corner/live', {}):
            mm_count = len(api_data['http://localhost:3000/api/corner/live']['mainMarkets'])
            print(f"  Main markets: {mm_count}")

    browser.close()
