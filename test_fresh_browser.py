"""Final verification with fresh browser."""
from playwright.sync_api import sync_playwright
import json

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    context = browser.new_context()
    page = context.new_page()

    page.goto('http://localhost:3000/#/worldcup', wait_until='networkidle', timeout=30000)
    page.wait_for_timeout(3000)

    # Click 球队战绩 tab
    teams_tab = page.locator('button:has-text("球队战绩")')
    if teams_tab.count() > 0:
        teams_tab.click()
        page.wait_for_timeout(3000)

    # Check table
    table_rows = page.locator('table tbody tr').all()
    if table_rows:
        first_row = table_rows[0].locator('td').all()
        cell_texts = [c.text_content().strip() for c in first_row]
        print(f"First row: {cell_texts}")
        # avgXgFor should now be per-game (e.g., Brazil 1.5 instead of 3.0)
        xg_value = cell_texts[5] if len(cell_texts) > 5 else '?'
        print(f"  Brazil xG: {xg_value} (should be 1.5)")

    # Click refresh
    print("\n=== Click refresh ===")
    refresh_btn = page.locator('button:has-text("刷新统计数据")')
    if refresh_btn.count() > 0:
        refresh_btn.click()
        page.wait_for_timeout(15000)

        # Check for feedback message
        all_text = page.content()
        if '已刷新' in all_text:
            print("  Feedback message found!")
            # Find the exact text
            spans = page.locator('span').all()
            for span in spans:
                text = span.text_content()
                if text and '刷新' in text:
                    print(f"  Message: '{text}'")
        else:
            print("  No feedback message found")

        # Check table after refresh
        table_rows2 = page.locator('table tbody tr').all()
        if table_rows2:
            first_row2 = table_rows2[0].locator('td').all()
            cell_texts2 = [c.text_content().strip() for c in first_row2]
            print(f"\nFirst row after refresh: {cell_texts2}")
            xg_value2 = cell_texts2[5] if len(cell_texts2) > 5 else '?'
            print(f"  Brazil xG after refresh: {xg_value2}")

    browser.close()
    print("\n=== Done ===")
