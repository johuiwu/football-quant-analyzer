from playwright.sync_api import sync_playwright
import time

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page(viewport={"width": 1600, "height": 1000})

    page.goto('http://localhost:3000')
    page.wait_for_load_state('networkidle')
    time.sleep(3)

    # Navigate to corner system
    corner_btn = page.locator('button:has-text("角球系统")').first
    corner_btn.click()
    time.sleep(3)

    # Take screenshot of initial state
    page.screenshot(path='/tmp/corner_initial.png')
    print("Initial corner page screenshot saved")

    # Check what's visible
    body_text = page.locator('body').text_content() or ""
    print(f"\nPage content (first 500 chars):")
    print(body_text[:500])

    # Check for monitor tab
    monitor_btn = page.locator('button:has-text("实时监控")').first
    if monitor_btn.is_visible(timeout=3000):
        print("\nFound '实时监控' button, clicking...")
        monitor_btn.click()
        time.sleep(5)

        # Take screenshot after clicking monitor
        page.screenshot(path='/tmp/corner_monitor.png')
        print("Monitor tab screenshot saved")

        # Check content again
        body_text2 = page.locator('body').text_content() or ""
        print(f"\nMonitor page content (first 800 chars):")
        print(body_text2[:800])

        # Check for specific elements
        print("\n=== Checking for UI elements ===")
        
        # Check for empty state
        empty_state = page.locator('text=当前没有进行中的比赛').count()
        print(f"Empty state message: {empty_state}")
        
        # Check for loading state
        loading = page.locator('text=加载角球数据中').count()
        print(f"Loading state: {loading}")
        
        # Check for any table/grid
        tables = page.locator('table, [class*="grid"]').count()
        print(f"Tables/grids: {tables}")
        
        # Check for odds values (any numbers with decimals)
        import re
        odds_pattern = r'\b\d+\.\d{2}\b'
        odds_matches = re.findall(odds_pattern, body_text2)
        print(f"Potential odds values found: {len(odds_matches)}")
        if odds_matches:
            print(f"Sample: {odds_matches[:10]}")

    browser.close()
