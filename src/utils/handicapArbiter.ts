export type MatchDirection = 'HOME_WIN' | 'DRAW' | 'AWAY_WIN';

export interface ArbitratedDirection {
  direction: MatchDirection;
  wasFlipped: boolean;
}

/**
 * 盘口对齐修正：当模型推荐方向与盘口覆盖矛盾时，强制翻转方向
 * - 主让球(handicap<0)：HOME_WIN 需净胜 ≥ ceil(|handicap|) 球，否则修正为 AWAY_WIN
 *   0.5 球盘口特殊处理：净胜 > 0 即覆盖（赢半），不翻转
 * - 受让球(handicap>0)：AWAY_WIN 需客队净胜 ≥ ceil(handicap) 球，否则修正为 HOME_WIN
 *   0.5 球盘口特殊处理：客队净胜 < 0 即不覆盖，翻转
 * - 平手盘 / DRAW：不修正
 * - 返回仲裁后方向及翻转标记
 */
export function calculateFinalDirection(
  modelDirection: MatchDirection,
  handicap: number,
  expectedNetGoals: number
): ArbitratedDirection {
  if (handicap === 0) return { direction: modelDirection, wasFlipped: false };

  // 主让球：模型推荐主胜但净胜球不足以覆盖盘口 → 修正为客胜
  if (modelDirection === 'HOME_WIN' && handicap < 0) {
    const absHandicap = Math.abs(handicap);
    // 0.5 球盘口：净胜球 > 0 即覆盖（赢半），不翻转
    if (absHandicap === 0.5) {
      if (expectedNetGoals <= 0) return { direction: 'AWAY_WIN', wasFlipped: true };
    } else {
      const requiredMargin = Math.ceil(absHandicap);
      if (expectedNetGoals < requiredMargin) return { direction: 'AWAY_WIN', wasFlipped: true };
    }
  }

  // 受让球：模型推荐客胜但客队净胜球不足以覆盖盘口 → 修正为主胜
  if (modelDirection === 'AWAY_WIN' && handicap > 0) {
    // 0.5 球盘口：客队净胜球 < 0 即不覆盖，翻转
    if (handicap === 0.5) {
      if (expectedNetGoals >= 0) return { direction: 'HOME_WIN', wasFlipped: true };
    } else {
      const requiredMargin = Math.ceil(handicap);
      if (expectedNetGoals > -requiredMargin) return { direction: 'HOME_WIN', wasFlipped: true };
    }
  }

  return { direction: modelDirection, wasFlipped: false };
}
