# Round 2 Review Report

## Fix Status
- cornerStore.ts login: FIXED (now calls /api/corner/login)
- _harden_routes.py & _patch_api.py: REMOVED
- All other 14 issues from Round 1: NOT FIXED

## NEW Critical Issues
### N-1. Hardcoded Credentials: 16 locations (8x worse than Round 1)
3 backend services + 1 frontend component + 10 crawler test scripts + 2 original files

### N-2. Frontend Pre-fills Credentials
src/components/corner/CrawlerControlPanel.tsx:103 - useState default = johui888/aa123123
Anyone opening browser DevTools can see the password in source

## NEW Medium Issues
### N-3. Production Mock Code in useRiskAlerts.ts
mockWebSocketInit generates fake alerts every 10s with 2% probability
### N-4. Unthrottled Polling in useLiveCornerData.ts
N concurrent requests every 5 seconds, no batching
### N-5. Prompt Injection Risk in aiRoutes.js
Team names from DB concatenated directly into AI prompt

## Complete Credential Leak List (16 locations)
test-crawler.js:53
backend/services/cornerCrawler.js:16-17
backend/services/hgCrawlerService.js:204-205 (NEW)
src/components/corner/CrawlerControlPanel.tsx:103 (NEW - most dangerous)
src/crawler/debugPasscode.ts:7-8 (NEW)
src/crawler/debug_page_structure.ts:49,55 (NEW)
src/crawler/demo-corners.ts:43,48 (NEW)
src/crawler/demo-full-crawl.ts:45,51 (NEW)
src/crawler/exploreCorner.ts:7-8 (NEW)
src/crawler/test-final.ts:43,49 (NEW)
src/crawler/test-full.ts:7-8 (NEW)
src/crawler/test-simple.ts:43,49 (NEW)
src/crawler/testHgCrawler.ts:15-16 (NEW)

## Summary
Round 1 fix rate: 2/16 (12.5%)
New issues found: 5
Credential leak scope: 2 -> 16 locations

Ugent actions: 1) Delete CrawlerControlPanel useState defaults, 2) Replace all 16 hardcoded creds with process.env, 3) Clean Git history, 4) Change HG account password