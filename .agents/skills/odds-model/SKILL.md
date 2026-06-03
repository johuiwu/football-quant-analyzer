---
name: odds-model
description: >
  足球竞彩赔率模型调整与校准。当需要修改 Elo/xG 权重、亚盘转换公式、
  凯利公式参数、返还率校准、Poisson/Dixon-Coles 模型参数时使用。
  适用场景：(1) 调整赔率计算器权重 (2) 修改亚盘盘口映射规则
  (3) 校准凯利资金分配 (4) 更新球队 Elo 评分表
  (5) 修改 1X2 ↔ 亚盘转换逻辑。
---

# 赔率模型调整

## 核心文件

- 欧赔计算: `src/utils/oddsCalculator.ts` — `calculateBaseOdds()`, `convert1X2ToAsian()`, `calculateDynamicAsianHandicap()`
- 量化模型: `src/utils/quantModel.ts` — `poisson()`, `dixonColesAdjustment()`, `getTeamElo()`, `calculateKellyFraction()`, `extractExtendedFeatures()`
- 球队数据: `src/data/realTeamsData.ts` — `TeamStats`, `REAL_H2H_RECORDS`, `LEAGUE_AVGS`

## 模型结构

欧赔计算链: Elo + xG → 实力指数 → 平局概率 → 主客胜概率 → 欧赔 1X2 → (可选) 亚盘转换

- `strengthGap` 决定平局概率范围 [0.18, 0.40]
- `homeXG * 1.5` / `awayXG * 1.5` 是 xG 权重系数
- 返还率固定 94% (`returnRate = 0.94`)
- 伤停因子: `Math.max(0.8, 1 - injuries * 0.02)`，每 1% 伤停率折损 2% 实力

## 亚盘转换规则

`convert1X2ToAsian()` 基于 `probDiff = homeProb - awayProb` 映射到盘口:

| probDiff 范围       | 盘口  |
|---------------------|-------|
| > 0.35              | -1.5  |
| (0.28, 0.35]        | -1.25 |
| (0.22, 0.28]        | -1.0  |
| (0.17, 0.22]        | -0.75 |
| (0.11, 0.17]        | -0.5  |
| (0.05, 0.11]        | -0.25 |
| (-0.05, 0.05]       | 0     |
| ...反向对称          | +0.25 ~ +1.5 |

水位推算: `baseWater = 0.86`，每档盘口 (±0.25) 带动水位 0.04 变化

## 修改规范

- 修改权重/阈值时必须同步更新 `src/__tests__/quantModel.test.ts` 测试用例
- Elo 评分表在 `getTeamElo()` 的 `eloMap` 中，添加新球队需同时更新 `src/data/realTeamsData.ts`
- `extractExtendedFeatures()` 的缺失值默认策略: 联赛中性值，不偏向任一队
- 修改后运行 `npm test` 验证回测准确率不低于当前基准
