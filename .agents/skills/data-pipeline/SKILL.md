---
name: data-pipeline
description: >
  球队数据管道维护。当需要新增球队数据、清洗爬虫数据、
  更新联赛均值、修复数据模型字段时使用。
  适用场景：(1) 新增球队到 realTeamsData.ts (2) 修复数据字段缺失
  (3) 更新 LEAGUE_AVGS 联赛均值 (4) TeamStats 接口字段变更
  (5) H2H 历史交锋数据维护。
---

# 数据管道

## 核心文件

- 球队数据: `src/data/realTeamsData.ts` — `TeamStats`, `REAL_H2H_RECORDS`, `LEAGUE_AVGS`
- 联赛球队映射: `src/data/leagueTeams.ts`
- 赛程数据: `src/data/worldCup2026Schedule.ts`, `src/data/worldCupData.ts`
- 数据库: `database/db.ts`

## TeamStats 数据模型

```typescript
interface TeamStats {
  id, name, nameCn, league, leagueCn, rank
  homeStats { played, wins, draws, losses, goalsFor, goalsAgainst, xgFor, xgAgainst }
  awayStats { ...同上 }
  form: ('W'|'D'|'L')[]
  homeXg, awayXg
  formLast5: number[]
  // v3.0 扩展字段 (爬虫填充, 可为 undefined)
  goals?, conceded?, shotsOnTarget?, possession?, fouls?, ...
}
```

## 数据流

```
球探网爬虫 → mapRawToStats() → ALLOWED_FIELDS 过滤 → TeamStats
                                              ↓
                                        realTeamsData.ts
                                              ↓
                              quantModel.ts (特征工程) → 赔率计算
```

## 添加新球队步骤

1. 在 `realTeamsData.ts` 中新增 `TeamStats` 对象，确保所有必填字段完整
2. 在 `leagueTeams.ts` 中补充联赛-球队映射
3. 在 `LEAGUE_AVGS` 中更新联赛均值（如需）
4. 如需 H2H 数据，在 `REAL_H2H_RECORDS` 中添加交锋记录
5. 确保球队 `id` 存在于 `crawler/qiumiwuCrawler.ts` 的 `TEAM_SLUG` 或 `LEAGUE_PRESETS` 中

## 数据验证

- 扩展字段 (`goals?`, `possession?` 等) 使用 `RankedValue` 类型，缺失时模型自动使用中性默认值
- `extractExtendedFeatures()` 对所有可选字段有 `??` 回退
- 运行 `npm test` 验证数据结构完整性
