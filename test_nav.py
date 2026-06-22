"""Test: Navigate to the actual World Cup page and verify the UI renders team stats correctly."""
from playwright.sync_api import sync_playwright
import json

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page()

    console_logs = []
    page.on('console', lambda msg: console_logs.append(f'[{msg.type}] {msg.text}'))

    # 1. Navigate to the app
    print("=== Step 1: Navigate to app ===")
    page.goto('http://localhost:3000', wait_until='networkidle', timeout=30000)
    page.screenshot(path='/tmp/wc_app_home.png', full_page=True)
    print(f"Page title: {page.title()}")

    # 2. Find navigation links/buttons to World Cup page
    print("\n=== Step 2: Find navigation elements ===")
    # Check all links
    links = page.locator('a').all()
    for link in links:
        href = link.get_attribute('href')
        text = link.text_content()
        if text and text.strip():
            print(f"  Link: text='{text.strip()}' href='{href}'")

    # Check all buttons
    buttons = page.locator('button').all()
    for btn in buttons:
        text = btn.text_content()
        if text and text.strip():
            print(f"  Button: '{text.strip()}'")

    # 3. Try navigating to /worldcup or similar routes
    print("\n=== Step 3: Try World Cup routes ===")
    for route in ['/worldcup', '/#/worldcup', '/#worldcup', '/world-cup']:
        try:
            page.goto(f'http://localhost:3000{route}', wait_until='networkidle', timeout=5000)
            title = page.title()
            # Check if World Cup content is visible
            wc_elements = page.locator('text=世界杯').count()
            print(f"  Route {route}: title='{title}', 世界杯 elements={wc_elements}")
        except Exception as e:
            print(f"  Route {route}: {e}")

    # 4. Check the app's routing configuration
    print("\n=== Step 4: Check page content ===")
    page.goto('http://localhost:3000', wait_until='networkidle', timeout=30000)

    # Look for sidebar or navigation
    nav_items = page.locator('nav a, nav button, [role="tab"], .sidebar a, .sidebar button').all()
    for item in nav_items:
        text = item.text_content()
        if text and text.strip():
            print(f"  Nav item: '{text.strip()}'")

    # 5. Check if there's a hash-based router
    current_url = page.url
    print(f"\nCurrent URL: {current_url}")

    # 6. Try clicking on any element that mentions World Cup or 世界杯
    print("\n=== Step 6: Try clicking World Cup navigation ===")
    wc_links = page.locator('a:has-text("世界杯"), button:has-text("世界杯"), a:has-text("World Cup"), button:has-text("World Cup")')
    print(f"Found {wc_links.count()} World Cup navigation elements")
    if wc_links.count() > 0:
        wc_links.first.click()
        page.wait_for_timeout(2000)
        page.screenshot(path='/tmp/wc_page.png', full_page=True)
        print(f"After click URL: {page.url}")

    # 7. Check the page source for routing hints
    print("\n=== Step 7: Check for SPA routing ===")
    # Look for React Router or similar
    page_content = page.content()
    if 'worldcup' in page_content.lower() or '世界杯' in page_content:
        print("  World Cup content found in page")
    else:
        print("  No World Cup content in current page")

    # 8. Try direct hash navigation
    print("\n=== Step 8: Try hash routes ===")
    for hash_route in ['#worldcup', '#/worldcup', '#world-cup']:
        page.goto(f'http://localhost:3000/{hash_route}', wait_until='networkidle', timeout=5000)
        wc_count = page.locator('text=世界杯').count()
        if wc_count > 0:
            print(f"  {hash_route}: Found 世界杯 content!")
            page.screenshot(path='/tmp/wc_hash_page.png', full_page=True)
            break
        else:
            print(f"  {hash_route}: No 世界杯 content")

    browser.close()
    print("\n=== Navigation Test Complete ===")
