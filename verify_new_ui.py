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

    # Start monitoring
    start_btn = page.locator('button:has-text("启动监控")').first
    if start_btn.is_visible(timeout=3000):
        start_btn.click()
        time.sleep(10)

    # Switch to monitor tab
    monitor_btn = page.locator('button:has-text("实时监控")').first
    if monitor_btn.is_visible(timeout=3000):
        monitor_btn.click()
        time.sleep(5)

        # Take screenshot
        page.screenshot(path='/tmp/verify_new_ui.png', full_page=True)
        print("Screenshot saved")

        # Check for new UI elements (card-based layout)
        body_text = page.locator('body').text_content() or ""

        # Check for new card headers
        new_labels = ["让球", "大小", "下一个角球", "单/双", "大小球"]
        print("\n=== New Card Labels ===")
        for label in new_labels:
            found = label in body_text
            print(f"  '{label}': {'✓' if found else '✗'}")

        # Check for empty state
        empty = "当前没有进行中的比赛" in body_text
        print(f"\n  Empty state: {'✓' if empty else '✗'}")

        # Check for odds values
        import re
        odds_matches = re.findall(r'\b[01]\.\d{2,3}\b', body_text)
        print(f"  Odds values found: {len(odds_matches)}")
        if odds_matches:
            print(f"  Sample: {odds_matches[:10]}")

        # Check API data
        print("\n=== API Data ===")
        for url, data in api_data.items():
            if 'live' in url and isinstance(data, dict):
                data_count = len(data.get('data', []))
                mm_count = len(data.get('mainMarkets', {}))
                print(f"  data: {data_count} matches")
                print(f"  mainMarkets: {mm_count} entries")

                # Check O/U mapping
                if mm_count > 0:
                    for key, val in list(data['mainMarkets'].items())[:2]:
                        if 'ou' in val:
                            for ou in val['ou'][:2]:
                                line = ou.get('line', 0)
                                over = ou.get('overOdds', 0)
                                under = ou.get('underOdds', 0)
                                print(f"  O/U: line={line}, over={over}, under={under}")

    browser.close()
