"""Final verification: Test the refresh button with feedback and data changes."""
from playwright.sync_api import sync_playwright
import json

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page(viewport={"width": 1400, "height": 900})

    page.goto('http://localhost:3000/#/worldcup', wait_until='networkidle', timeout=30000)
    page.wait_for_timeout(2000)

    # Click 球队战绩 tab
    teams_tab = page.locator('button:has-text("球队战绩")')
    if teams_tab.count() > 0:
        teams_tab.click()
        page.wait_for_timeout(3000)

    # Test 1: Check that the page loads with stats
    print("=== Test 1: Page loads with stats ===")
    table_rows = page.locator('table tbody tr').all()
    print(f"  Table rows: {len(table_rows)}")

    if table_rows:
        first_row = table_rows[0].locator('td').all()
        cell_texts = [c.text_content().strip() for c in first_row]
        print(f"  First row: {cell_texts}")

    # Test 2: Click refresh button and check for feedback message
    print("\n=== Test 2: Click refresh and check feedback ===")
    refresh_btn = page.locator('button:has-text("刷新统计数据")')
    if refresh_btn.count() > 0:
        refresh_btn.click()
        print("  Clicked refresh button")

        # Wait for refresh to complete
        page.wait_for_timeout(15000)

        # Check for feedback message
        msg_elements = page.locator('text=已刷新').all()
        if msg_elements:
            for el in msg_elements:
                print(f"  Feedback message: {el.text_content()}")
        else:
            print("  No feedback message found")

        # Also check for any error messages
        error_elements = page.locator('text=刷新失败').all()
        if error_elements:
            for el in error_elements:
                print(f"  Error message: {el.text_content()}")

    # Test 3: Check API response format
    print("\n=== Test 3: Check API response format ===")
    api_result = page.evaluate("""async () => {
        const res = await fetch('/api/worldcup/refresh-team-stats', { method: 'POST' });
        return await res.json();
    }""")
    print(f"  API response: {json.dumps(api_result, indent=2)}")

    # Test 4: Verify avgXgFor is now per-game (should be smaller than before)
    print("\n=== Test 4: Verify avgXgFor is per-game ===")
    stats_result = page.evaluate("""async () => {
        const res = await fetch('/api/worldcup/team-stats');
        const data = await res.json();
        return {
            deguo: data.stats?.deguo,
            baxi: data.stats?.baxi,
        };
    }""")
    print(f"  Germany stats: {json.dumps(stats_result.get('deguo', {}), indent=2)}")
    print(f"  Brazil stats: {json.dumps(stats_result.get('baxi', {}), indent=2)}")

    # Germany: xG was 6.1 total for 2 games, should now be 3.05 per game
    deguo_xg = stats_result.get('deguo', {}).get('avgXgFor')
    if deguo_xg is not None:
        if deguo_xg < 4.0:  # 3.05 per game vs 6.1 total
            print(f"  ✓ avgXgFor is per-game: {deguo_xg} (was 6.1 total)")
        else:
            print(f"  ✗ avgXgFor still looks like total: {deguo_xg}")

    # Test 5: Verify table shows updated values after refresh
    print("\n=== Test 5: Verify table shows updated values ===")
    table_rows2 = page.locator('table tbody tr').all()
    if table_rows2:
        # Find Germany row
        for row in table_rows2:
            cells = row.locator('td').all()
            cell_texts = [c.text_content().strip() for c in cells]
            if '德国' in cell_texts[1] or 'Germany' in cell_texts[1]:
                print(f"  Germany row: {cell_texts}")
                break

    # Test 6: Check feedback message appears after refresh
    print("\n=== Test 6: Check feedback message after second refresh ===")
    refresh_btn = page.locator('button:has-text("刷新统计数据")')
    if refresh_btn.count() > 0:
        refresh_btn.click()
        page.wait_for_timeout(15000)

        # Check for feedback
        page_content = page.content()
        if '已刷新' in page_content:
            # Find the exact text
            feedback = page.locator('span:has-text("已刷新")').all()
            for f in feedback:
                text = f.text_content()
                if '刷新' in text:
                    print(f"  Feedback: {text}")
        else:
            print("  No feedback message found in page")

    browser.close()
    print("\n=== Verification Complete ===")
