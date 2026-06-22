"""Debug: Check DOM for refreshMsg span after click."""
from playwright.sync_api import sync_playwright
import json

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page(viewport={"width": 1400, "height": 900})

    # Modify JSON to force change
    json_path = r'd:\下载\足球竞彩量化分析系统\足球竞彩量化分析系统\src\data\worldcup_team_stats.json'
    with open(json_path, 'r', encoding='utf-8') as f:
        original_data = json.load(f)
    modified_data = json.loads(json.dumps(original_data))
    modified_data['baxi']['avgXgFor'] = 99.9
    with open(json_path, 'w', encoding='utf-8') as f:
        json.dump(modified_data, f, indent=2)

    page.goto('http://localhost:3000/#/worldcup', wait_until='networkidle', timeout=30000)
    page.wait_for_timeout(3000)

    teams_tab = page.locator('button:has-text("球队战绩")')
    if teams_tab.count() > 0:
        teams_tab.click()
        page.wait_for_timeout(3000)

    # Click refresh
    refresh_btn = page.locator('button:has-text("刷新统计数据")')
    if refresh_btn.count() > 0:
        refresh_btn.click()

        # Wait shorter time and check DOM repeatedly
        for i in range(6):
            page.wait_for_timeout(2000)

            # Check the parent div of the button for any new elements
            parent_html = refresh_btn.first.evaluate('el => el.parentElement.innerHTML')

            # Look for the feedback span
            if '已刷新' in parent_html or 'emerald' in parent_html:
                print(f"  [{i*2}s] Feedback found in parent HTML!")
                # Extract just the span part
                import re
                span_match = re.search(r'<span[^>]*>.*?</span>', parent_html)
                if span_match:
                    print(f"  Span HTML: {span_match.group()[:200]}")
                break
            else:
                # Check if button is still refreshing
                btn_text = refresh_btn.first.text_content()
                print(f"  [{i*2}s] Button text: '{btn_text}', No feedback in parent")

        # Take screenshot
        page.screenshot(path='/tmp/wc_feedback_debug.png', full_page=True)

    # Restore
    with open(json_path, 'w', encoding='utf-8') as f:
        json.dump(original_data, f, indent=2)

    browser.close()
