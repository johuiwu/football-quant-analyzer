---
name: crawler-guard
description: >
  球探网爬虫维护与调试。当爬虫报错、数据字段变更、反爬策略调整、
  球队 slug 映射缺失时使用。
  适用场景：(1) 爬虫报错排查 (2) 添加新联赛/球队 slug
  (3) 反爬策略调整 (4) 页面结构变更适配
  (5) 数据提取字段映射修复。
---

# 爬虫维护

## 核心文件

- 爬虫主逻辑: `src/crawler/qiumiwuCrawler.ts`
- 联赛预设: `config/leaguePresets.ts`
- 允许字段: `database/db.ts` — `ALLOWED_FIELDS`
- 爬虫测试: `test-api.js`

## 架构

```
qiumiwuCrawler.ts
├── getBrowser()           — Puppeteer + Stealth 浏览器单例
├── mapRawToStats()        — 锚点数据 → TeamStats 映射
├── TEAM_SLUG              — 球队中文名 → 球探网 slug 内联映射
├── fetchStandings()       — 积分榜爬取
├── fetchTeamStatsFromQiumiwu()  — 球队详细统计爬取
└── closeBrowser()         — 浏览器清理
```

## 爬取目标

URL 模式: `https://www.qiumiwu.com/team/{slug}/stat`

提取 `<a[href*="/league/"][href*="#"]>` 锚点元素，解析 innerText 行结构:
- 第1行: 数值 (如 "2.1")
- 第2行: 标签 (如 "场均进球")
- 第4行: 联赛排名

## 调试

- 设置 `CRAWLER_DEBUG=1` 环境变量启用可视化调试（非 headless）
- 锚点不足（< 3）时会打印警告，需检查页面结构
- slug 映射查找顺序: `LEAGUE_PRESETS[leagueKey].teamSlugs` → `TEAM_SLUG`

## 添加新球队

1. 在 `TEAM_SLUG` 中添加 `"中文名":"slug"` 映射
2. 在 `LEAGUE_PRESETS`（`config/leaguePresets.ts`）中添加联赛预设（含 teamSlugs）
3. 确保球队 `id` 出现在 `src/data/realTeamsData.ts` 中
