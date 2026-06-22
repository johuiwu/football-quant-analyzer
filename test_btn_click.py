"""Focused test: Check if the refresh button click actually triggers the POST request."""
from playwright.sync_api import sync_playwright
import json

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page()

    # Track ALL network requests
    all_requests = []
    def on_request(request):
        all_requests.append(f'{request.method} {request.url}')
    page.on('request', on_request)

    all_responses = []
    def on_response(response):
        if 'refresh' in response.url or 'team-stats' in response.url:
            try:
                body = response.json()
                all_responses.append({'url': response.url, 'status': response.status, 'method': response.request.method, 'body': body})
            except:
                all_responses.append({'url': response.url, 'status': response.status, 'method': response.request.method})
    page.on('response', on_response)

    console_logs = []
    page.on('console', lambda msg: console_logs.append(f'[{msg.type}] {msg.text}'))

    # Navigate to World Cup page
    page.goto('http://localhost:3000/#/worldcup', wait_until='networkidle', timeout=30000)
    page.wait_for_timeout(2000)

    # Click 球队战绩 tab
    teams_tab = page.locator('button:has-text("球队战绩")')
    if teams_tab.count() > 0:
        teams_tab.click()
        page.wait_for_timeout(3000)

    # Clear request tracking
    all_requests.clear()
    all_responses.clear()

    # Find the refresh button and check its properties
    print("=== Refresh button analysis ===")
    refresh_btn = page.locator('button:has-text("刷新统计数据")')
    if refresh_btn.count() > 0:
        btn = refresh_btn.first
        print(f"Button found: visible={btn.is_visible()}, enabled={btn.is_enabled()}")
        print(f"Button text: '{btn.text_content()}'")
        print(f"Button disabled: {btn.is_disabled()}")

        # Check if button is inside a form or has onclick
        btn_html = btn.evaluate('el => el.outerHTML')
        print(f"Button HTML: {btn_html[:300]}")

        # Click the button
        print("\n=== Clicking refresh button ===")
        btn.click()
        print("Button clicked!")

        # Wait and check for network requests
        page.wait_for_timeout(5000)

        print("\n=== All network requests after click ===")
        for req in all_requests:
            if 'worldcup' in req.lower() or 'api' in req.lower():
                print(f"  {req}")

        print("\n=== All relevant responses after click ===")
        for resp in all_responses:
            print(f"  {resp.get('method', '?')} {resp['status']} {resp['url']}")
            if resp.get('body') and isinstance(resp['body'], dict):
                print(f"    Body: {json.dumps(resp['body'], default=str)[:300]}")
    else:
        print("ERROR: Refresh button not found!")

    # Check console for errors
    print("\n=== Console logs ===")
    for log in console_logs:
        print(f"  {log}")

    # Also try triggering the API call directly from the browser context
    print("\n=== Direct fetch test from browser ===")
    result = page.evaluate("""async () => {
        try {
            const res = await fetch('/api/worldcup/refresh-team-stats', { method: 'POST' });
            const data = await res.json();
            return { status: res.status, data };
        } catch (err) {
            return { error: err.message };
        }
    }""")
    print(f"Direct fetch result: {json.dumps(result, default=str)[:500]}")

    browser.close()
