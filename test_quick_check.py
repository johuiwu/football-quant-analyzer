"""Quick check: Verify backend code changes are active."""
from playwright.sync_api import sync_playwright
import json

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page()

    # Navigate first
    page.goto('http://localhost:3000', wait_until='networkidle', timeout=30000)

    # Test API response format
    print("=== Check API response ===")
    result = page.evaluate("""async () => {
        const res = await fetch('/api/worldcup/refresh-team-stats', { method: 'POST' });
        return await res.json();
    }""")
    print(f"  Response: {json.dumps(result, indent=2)}")
    print(f"  Has 'changed' field: {'changed' in result}")

    # Check avgXgFor
    print("\n=== Check avgXgFor ===")
    stats = page.evaluate("""async () => {
        const res = await fetch('/api/worldcup/team-stats');
        const data = await res.json();
        return { deguo_xG: data.stats?.deguo?.avgXgFor, baxi_xG: data.stats?.baxi?.avgXgFor };
    }""")
    print(f"  Germany xG: {stats.get('deguo_xG')} (should be ~3.05 if per-game)")
    print(f"  Brazil xG: {stats.get('baxi_xG')} (should be ~1.5 if per-game)")

    browser.close()
