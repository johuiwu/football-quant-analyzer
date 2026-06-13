# 角球系统自动投注链路开发进度跟踪

## 总体状态
> 最后更新: 2026-06-13

### 已完成规格
| 规格 ID | 描述 | 状态 | 完成日期 |
|---------|------|------|----------|
| `fix-tracked-matchids-empty-blocks-autobet` | trackedMatchIds 空=允许所有 | ✅ 代码已落地 | 前期 |
| `fix-auto-bet-chain` | 投注执行器6项修复 | ✅ 代码已落地 | 前期 |
| `fix-auto-bet-chain-breakpoints` | 配置同步+初始化同步 | ✅ 代码已落地 | 前期 |
| `fix-reverted-modifications` | 恢复的修改重新移除 | ✅ 代码已落地 | 前期 |
| `verify-auto-bet-full-chain` | 完整链路验证+触发历史upsert | ✅ 已重构为冷却期方案 | 前期 |
| `refactor-trigger-history-dedup` | 冷却期去重+前端聚合+SOLID重构 | ✅ 全部完成 | 2026-06-13 |

### 当前工作
无进行中的工作。

### 本次重构修改摘要

**`cornerService.js`**:
- `saveCornerTrigger` 改为 15 分钟冷却期方案（`TRIGGER_COOLDOWN_MINUTES=15`）
- `pollOnce` 拆分为 4 个单一职责函数：`fetchMatchData` → `computeChangesAndAnalytics` → `evaluateAndSaveTriggers` → `processAutoBetsForMatches`
- 新增 `clearHistory()` 导出函数

**`cornerRoutes.js`**:
- 新增 `DELETE /api/corner/history` 路由（清空 corner_history 和 corner_bets）

**`CornerHistoryChart.tsx`**:
- 新增 `aggregateTriggers()` 按 `match_name + strategy_id` 分组聚合
- 策略列显示 `(×N)` 触发次数
- 赔率趋势图、策略分布图均使用聚合数据
- 新增 🗑️ 清空按钮（含确认对话框）

### 已知问题（已全部解决）
1. ✅ `saveCornerTrigger` 全量 upsert → 改为 15min 冷却期方案
2. ✅ `cornerService.js` 函数职责过重 → 已拆分 pollOnce
3. ✅ 前端触发历史表格缺乏聚合 → 已添加聚合显示

### 技术债务
- 数据库字段 camelCase/snake_case 混用（保持不变，非本次范围）
- 魔术数字如 `30000`、`500` 在 cornerService.js 仍硬编码（非本次范围）
