"""Check if statsMap keys match team IDs used in the UI."""
from playwright.sync_api import sync_playwright
import json

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page()

    page.goto('http://localhost:3000/#/worldcup', wait_until='networkidle', timeout=30000)
    page.wait_for_timeout(2000)

    # Click 球队战绩 tab
    teams_tab = page.locator('button:has-text("球队战绩")')
    if teams_tab.count() > 0:
        teams_tab.click()
        page.wait_for_timeout(3000)

    # Get the statsMap from the API
    resp = page.request.get('http://localhost:3000/api/worldcup/team-stats')
    api_data = resp.json()
    stats_keys = list(api_data.get('stats', {}).keys())
    print(f"=== API stats keys ({len(stats_keys)}) ===")
    print(f"  First 10: {stats_keys[:10]}")

    # Get the team IDs from the WorldCupStore
    team_ids = page.evaluate("""() => {
        // Try to find team IDs from the table
        const table = document.querySelector('table');
        if (!table) return [];
        const rows = table.querySelectorAll('tbody tr');
        // We need the team.id which is not directly in the DOM
        // Let's check the React fiber to find the team data
        return [];
    }""")

    # Get team IDs from the WORLD_CUP_TEAMS data
    team_data = page.evaluate("""() => {
        // Access the worldcup data module
        try {
            // Check what teams are in the store
            const storeEl = document.querySelector('[data-testid]');
            return { note: 'Cannot directly access React state from evaluate' };
        } catch(e) {
            return { error: e.message };
        }
    }""")

    # Let's check the worldcup_data.ts for team IDs
    print("\n=== Check worldcup_data.ts team IDs ===")

    # Get the team names from the UI and match them
    ui_teams = page.evaluate("""() => {
        const table = document.querySelector('table');
        if (!table) return [];
        const rows = table.querySelectorAll('tbody tr');
        const result = [];
        for (let i = 0; i < Math.min(rows.length, 5); i++) {
            const cells = rows[i].querySelectorAll('td');
            if (cells.length > 1) {
                result.push({
                    rank: cells[0].textContent.trim(),
                    name: cells[1].textContent.trim(),
                    xg: cells[5]?.textContent.trim(),
                });
            }
        }
        return result;
    }""")
    print(f"UI teams: {json.dumps(ui_teams, ensure_ascii=False)}")

    # Now check: does the API stats key match the team.id used in React?
    # The key question: when getStats(team.id) is called, does statsMap[team.id] exist?
    # team.id comes from WORLD_CUP_TEAMS in worldcup_data.ts
    # statsMap keys come from the API /api/worldcup/team-stats

    # Let's check the worldcup_data.ts for team IDs
    print("\n=== Checking worldcup_data.ts team IDs ===")

    browser.close()
    print("Done")
