"""Check if the frontend React code is actually being served with the refreshMsg changes."""
from playwright.sync_api import sync_playwright
import json

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page(viewport={"width": 1400, "height": 900})

    console_logs = []
    page.on('console', lambda msg: console_logs.append(f'[{msg.type}] {msg.text}'))

    page.goto('http://localhost:3000/#/worldcup', wait_until='networkidle', timeout=30000)
    page.wait_for_timeout(2000)

    # Click 球队战绩 tab
    teams_tab = page.locator('button:has-text("球队战绩")')
    if teams_tab.count() > 0:
        teams_tab.click()
        page.wait_for_timeout(3000)

    # Check the page source for refreshMsg
    page_content = page.content()
    has_refresh_msg = 'refreshMsg' in page_content or '已刷新' in page_content
    print(f"Page contains refreshMsg/已刷新: {has_refresh_msg}")

    # Check the button area HTML
    refresh_area = page.locator('button:has-text("刷新统计数据")').first.evaluate('el => el.parentElement.innerHTML')
    print(f"\nRefresh button area HTML:\n{refresh_area[:500]}")

    # Click refresh and check console for errors
    print("\n=== Click refresh ===")
    refresh_btn = page.locator('button:has-text("刷新统计数据")')
    if refresh_btn.count() > 0:
        refresh_btn.click()
        page.wait_for_timeout(15000)

        # Check for the feedback span
        feedback_spans = page.locator('span.text-xs').all()
        for span in feedback_spans:
            text = span.text_content()
            if text and '刷新' in text:
                print(f"  Found feedback: {text}")

        # Check the button area again
        refresh_area2 = page.locator('button:has-text("刷新统计数据")').first.evaluate('el => el.parentElement.innerHTML')
        print(f"\nRefresh button area HTML after click:\n{refresh_area2[:800]}")

    # Check console for errors
    print("\n=== Console errors ===")
    errors = [log for log in console_logs if 'error' in log.lower()]
    for e in errors[:5]:
        print(f"  {e}")

    browser.close()
