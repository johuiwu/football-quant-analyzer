"""Check if Vite is serving the updated WorldCupPage.tsx."""
from playwright.sync_api import sync_playwright
import json

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page()

    # Navigate and check the JS bundle for refreshMsg
    page.goto('http://localhost:3000/#/worldcup', wait_until='networkidle', timeout=30000)

    # Check if the React component has the refreshMsg state
    result = page.evaluate("""() => {
        // Search all script tags for 'refreshMsg'
        const scripts = document.querySelectorAll('script');
        let found = false;
        for (const s of scripts) {
            if (s.textContent && s.textContent.includes('refreshMsg')) {
                found = true;
                break;
            }
        }
        // Also check for the text in the page
        const pageText = document.body.innerText;
        return {
            scriptHasRefreshMsg: found,
            pageHasRefreshMsg: pageText.includes('refreshMsg'),
            pageHas已刷新: pageText.includes('已刷新'),
        };
    }""")
    print(f"Script check: {result}")

    # Try fetching the source module directly from Vite
    try:
        resp = page.request.get('http://localhost:3000/src/pages/WorldCupPage.tsx', timeout=10000)
        source = resp.text()
        has_refresh_msg = 'refreshMsg' in source
        has_changed = 'changed' in source
        print(f"\nVite source module:")
        print(f"  Contains 'refreshMsg': {has_refresh_msg}")
        print(f"  Contains 'changed': {has_changed}")
        if not has_refresh_msg:
            # Show a snippet of the source
            print(f"  Source snippet: {source[:500]}")
    except Exception as e:
        print(f"Error fetching source: {e}")

    browser.close()
