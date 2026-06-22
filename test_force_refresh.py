"""Force refresh and test feedback message."""
from playwright.sync_api import sync_playwright
import json

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page(viewport={"width": 1400, "height": 900})

    # Force hard reload (clear cache)
    page.goto('http://localhost:3000/#/worldcup', wait_until='networkidle', timeout=30000)

    # Clear cache and reload
    page.context.clear_cookies()

    # Navigate with cache bypass
    page.goto('http://localhost:3000/#/worldcup', wait_until='networkidle', timeout=30000)
    page.wait_for_timeout(3000)

    # Click 球队战绩 tab
    teams_tab = page.locator('button:has-text("球队战绩")')
    if teams_tab.count() > 0:
        teams_tab.click()
        page.wait_for_timeout(3000)

    # Check if refreshMsg is in the page source
    page_source = page.content()
    print(f"'refreshMsg' in source: {'refreshMsg' in page_source}")
    print(f"'已刷新' in source: {'已刷新' in page_source}")

    # Click refresh button
    print("\n=== Click refresh ===")
    refresh_btn = page.locator('button:has-text("刷新统计数据")')
    if refresh_btn.count() > 0:
        refresh_btn.click()
        page.wait_for_timeout(15000)

        # Check for feedback span
        all_spans = page.locator('span').all()
        for span in all_spans:
            text = span.text_content()
            if text and ('刷新' in text or '更新' in text or '最新' in text):
                print(f"  Found span: '{text}'")

        # Check the parent div of the button
        parent_html = refresh_btn.first.evaluate('el => el.parentElement.outerHTML')
        if '已刷新' in parent_html:
            print(f"  Feedback found in parent HTML!")
        else:
            print(f"  No feedback in parent HTML")
            # Print the full parent HTML for debugging
            print(f"  Parent HTML (truncated): {parent_html[:600]}")

    browser.close()
