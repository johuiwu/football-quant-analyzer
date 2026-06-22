"""Check if production mode is serving dist files."""
from playwright.sync_api import sync_playwright

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page()

    page.goto('http://localhost:3000', wait_until='networkidle', timeout=30000)

    # Check if the page is using dist or Vite middleware
    # In Vite middleware mode, there should be a @vite/client script
    page_source = page.content()
    has_vite_client = '@vite/client' in page_source
    has_dist_assets = '/assets/index-' in page_source
    print(f"Has @vite/client: {has_vite_client}")
    print(f"Has dist assets: {has_dist_assets}")

    # Check script sources
    scripts = page.locator('script').all()
    for s in scripts:
        src = s.get_attribute('src')
        if src:
            print(f"  Script src: {src}")

    browser.close()
