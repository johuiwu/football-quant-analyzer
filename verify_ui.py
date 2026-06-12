from playwright.sync_api import sync_playwright
import time

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page(viewport={"width": 1600, "height": 1000})

    page.goto('http://localhost:3000')
    page.wait_for_load_state('networkidle')
    time.sleep(3)

    # Click corner system
    corner_btn = page.locator('button:has-text("角球系统")').first
    corner_btn.click()
    time.sleep(3)

    # Click "启动监控" to get data
    start_btn = page.locator('button:has-text("启动监控")').first
    if start_btn.is_visible(timeout=3000):
        start_btn.click()
        time.sleep(8)

    # Now click "实时监控"
    monitor_btn = page.locator('button:has-text("实时监控")').first
    if monitor_btn.is_visible(timeout=3000):
        monitor_btn.click()
        time.sleep(3)

    # Take full screenshot
    page.screenshot(path='/tmp/verify_ui.png', full_page=True)
    print("Screenshot saved to /tmp/verify_ui.png")

    # Check what's rendered
    body_text = page.locator('body').text_content() or ""

    # Check for new table headers
    new_headers = ["角球大小", "角球大小/半", "角球让球", "角球让球/半", "下个角球", "角球单双", "主盘让球", "主盘大小"]
    for h in new_headers:
        found = h in body_text
        print(f"  Header '{h}': {'FOUND' if found else 'NOT FOUND'}")

    # Check for old UI elements
    old_elements = ["角球盘口", "主盘口", "O/U", "HDP", "下一个弯"]
    for o in old_elements:
        found = o in body_text
        print(f"  Old element '{o}': {'FOUND' if found else 'NOT FOUND'}")

    # Check for grid structure
    grids = page.locator('[class*="grid-cols-"]').all()
    print(f"\nGrid elements: {len(grids)}")
    for g in grids[:5]:
        cls = g.get_attribute('class') or ""
        if 'grid-cols' in cls:
            print(f"  Grid: {cls[:150]}")

    # Check for odds values
    red_elements = page.locator('[class*="text-red-400"]').all()
    print(f"\ntext-red-400 elements: {len(red_elements)}")
    for el in red_elements[:15]:
        print(f"  '{el.text_content()}'")

    # Check for Lock icons
    lock_icons = page.locator('svg').all()
    lock_found = 0
    for svg in lock_icons:
        cls = svg.get_attribute('class') or ""
        if 'lock' in cls.lower():
            lock_found += 1
    print(f"\nLock icons: {lock_found}")

    browser.close()
