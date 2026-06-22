"""Capture feedback message on first refresh after page load."""
from playwright.sync_api import sync_playwright
import json
import time

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page(viewport={"width": 1400, "height": 900})

    # First, modify the JSON file to force a data change
    json_path = r'd:\下载\足球竞彩量化分析系统\足球竞彩量化分析系统\src\data\worldcup_team_stats.json'
    with open(json_path, 'r', encoding='utf-8') as f:
        original_data = json.load(f)

    modified_data = json.loads(json.dumps(original_data))
    modified_data['baxi']['avgXgFor'] = 99.9  # Force a visible change

    with open(json_path, 'w', encoding='utf-8') as f:
        json.dump(modified_data, f, indent=2)

    page.goto('http://localhost:3000/#/worldcup', wait_until='networkidle', timeout=30000)
    page.wait_for_timeout(3000)

    # Click 球队战绩 tab
    teams_tab = page.locator('button:has-text("球队战绩")')
    if teams_tab.count() > 0:
        teams_tab.click()
        page.wait_for_timeout(3000)

    # Check initial display (should show 99.9 from modified file)
    table_rows = page.locator('table tbody tr').all()
    if table_rows:
        first_row = table_rows[0].locator('td').all()
        cell_texts = [c.text_content().strip() for c in first_row]
        print(f"Initial display: {cell_texts}")
        print(f"  Brazil xG: {cell_texts[5]}")

    # Click refresh (this will overwrite 99.9 with livescore data)
    print("\n=== Click refresh ===")
    refresh_btn = page.locator('button:has-text("刷新统计数据")')
    if refresh_btn.count() > 0:
        refresh_btn.click()

        # Wait for refresh and check for feedback immediately
        page.wait_for_timeout(15000)

        # Check for feedback message
        page_text = page.locator('body').text_content()
        if '已刷新' in page_text:
            print("  Feedback message found!")
            # Find the exact text
            idx = page_text.find('已刷新')
            print(f"  Message: ...{page_text[idx:idx+50]}...")
        else:
            print("  No feedback message found")

        # Check table after refresh
        table_rows2 = page.locator('table tbody tr').all()
        if table_rows2:
            first_row2 = table_rows2[0].locator('td').all()
            cell_texts2 = [c.text_content().strip() for c in first_row2]
            print(f"\nAfter refresh: {cell_texts2}")
            print(f"  Brazil xG: {cell_texts2[5]} (should be 1.5 from livescore)")

        # Verify data changed
        if cell_texts[5] != cell_texts2[5]:
            print(f"\n  DATA CHANGED: {cell_texts[5]} -> {cell_texts2[5]}")
        else:
            print(f"\n  Data unchanged: {cell_texts[5]}")

    # Restore original data
    with open(json_path, 'w', encoding='utf-8') as f:
        json.dump(original_data, f, indent=2)
    print("\nRestored original JSON data")

    browser.close()
    print("\n=== Test Complete ===")
