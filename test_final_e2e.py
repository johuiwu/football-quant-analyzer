"""Final E2E verification in production mode."""
from playwright.sync_api import sync_playwright
import json

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page(viewport={"width": 1400, "height": 900})

    page.goto('http://localhost:3000/#/worldcup', wait_until='networkidle', timeout=30000)
    page.wait_for_timeout(3000)

    # Click 球队战绩 tab
    teams_tab = page.locator('button:has-text("球队战绩")')
    if teams_tab.count() > 0:
        teams_tab.click()
        page.wait_for_timeout(3000)

    # Test 1: Check table data (avgXgFor should be per-game)
    print("=== Test 1: Table data ===")
    table_rows = page.locator('table tbody tr').all()
    if table_rows:
        first_row = table_rows[0].locator('td').all()
        cell_texts = [c.text_content().strip() for c in first_row]
        print(f"  First row: {cell_texts}")
        print(f"  Brazil xG: {cell_texts[5]} (should be 1.5)")

    # Test 2: Click refresh and verify feedback
    print("\n=== Test 2: Refresh with feedback ===")
    refresh_btn = page.locator('button:has-text("刷新统计数据")')
    if refresh_btn.count() > 0:
        refresh_btn.click()
        page.wait_for_timeout(15000)

        # Check for feedback message
        page_text = page.content()
        if '已刷新' in page_text:
            print("  Feedback message found!")
            # Find the exact text using a more robust selector
            feedback = page.locator('text=已刷新').first
            if feedback:
                try:
                    text = feedback.text_content(timeout=3000)
                    print(f"  Message: {text}")
                except:
                    print("  (Could not read exact text)")
        else:
            print("  No feedback message")

    # Test 3: Verify API response
    print("\n=== Test 3: API response ===")
    api_result = page.evaluate("""async () => {
        const res = await fetch('/api/worldcup/refresh-team-stats', { method: 'POST' });
        return await res.json();
    }""")
    print(f"  Response: success={api_result.get('success')}, updated={api_result.get('updated')}, changed={api_result.get('changed')}, total={api_result.get('total')}")

    # Test 4: Verify avgXgFor is per-game
    print("\n=== Test 4: avgXgFor per-game ===")
    stats = page.evaluate("""async () => {
        const res = await fetch('/api/worldcup/team-stats');
        const data = await res.json();
        return {
            deguo_xG: data.stats?.deguo?.avgXgFor,
            baxi_xG: data.stats?.baxi?.avgXgFor,
            faguo_xG: data.stats?.faguo?.avgXgFor,
        };
    }""")
    print(f"  Germany xG: {stats.get('deguo_xG')} (per-game, was 6.1 total)")
    print(f"  Brazil xG: {stats.get('baxi_xG')} (per-game, was 3.0 total)")
    print(f"  France xG: {stats.get('faguo_xG')} (per-game, was 1.8 total)")

    # Verify per-game calculation
    deguo_ok = stats.get('deguo_xG') is not None and stats.get('deguo_xG') < 4.0
    baxi_ok = stats.get('baxi_xG') is not None and stats.get('baxi_xG') < 2.0
    print(f"  Germany per-game: {'PASS' if deguo_ok else 'FAIL'}")
    print(f"  Brazil per-game: {'PASS' if baxi_ok else 'FAIL'}")

    browser.close()
    print("\n=== Final Verification Complete ===")
