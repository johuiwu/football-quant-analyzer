---
name: backtest-engineer
description: >
  足球量化模型回测验证。当需要运行策略回测、解读回测报告、
  调整回测参数、分析模型偏差时使用。
  适用场景：(1) 运行/解读回测报告 (2) 调整偏差阈值
  (3) 分析高风险比赛 (4) 验证模型准确率 (5) 调参优化。
---

# 回测验证

## 核心文件

- 回测引擎: `src/utils/backtest.ts` — `runBacktest()`, `formatBacktestReport()`
- 测试用例: `src/__tests__/quantModel.test.ts`

## 回测流程

1. 准备 `MatchHistory[]` 数据（Elo、xG、伤停、真实比分、市场赔率）
2. 调用 `runBacktest(matches)` → `BacktestReport`
3. 输出含准确率、高风险场次、警告的格式化报告

## 关键参数

- `DEVIATION_THRESHOLD = 0.20` — 模型与市场偏差超过 20% 标记为高风险
- `PASS_RATE_WARNING = 0.60` — 准确率低于 60% 触发模型偏差警告
- `computeDeviation(model, market) = |model - market| / market`

## 回测报告结构

```
BacktestReport {
  passRate, totalGames, correctCount,
  highRiskGames: string[],
  entries: MatchBacktestEntry[] {
    match, finalScore, modelOdds, marketOdds,
    deviation { home, draw, away, maxDeviation },
    modelDirection, actualDirection,
    directionCorrect, isHighRisk
  },
  warnings: string[]
}
```

## 调参建议

- 准确率低 → 降低 Elo 权重或调整 xG 系数（见 odds-model 技能）
- 偏差率高 → 检查数据源质量，可能爬虫数据异常（见 crawler-guard 技能）
- 修改后运行 `npm test` 确保测试通过
