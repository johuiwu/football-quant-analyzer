export type MatchDirection = 'HOME_WIN' | 'DRAW' | 'AWAY_WIN';

export interface ArbitratedDirection {
  direction: MatchDirection;
  wasFlipped: boolean;
  coverProbability: number;       // 覆盖盘口的概率（0~1），无矩阵数据时为 -1
  arbitrationMode: 'THRESHOLD' | 'PROBABILISTIC';  // 仲裁模式
  flipReason: string;             // 翻转/不翻转的原因说明
}

/**
 * 基于 Dixon-Coles 进球分布矩阵计算盘口覆盖概率
 * - 主让球(handicap<0)：累加 homeGoals - awayGoals >= ceil(|handicap|) 的概率
 * - 受让球(handicap>0)：累加 awayGoals - homeGoals >= ceil(handicap) 的概率
 * - 平手盘(handicap=0)：返回 1.0
 * - 每个格子概率必须乘以 normFactor，确保归一化数学严谨
 * - ceil(0.5) = 1，0.5球盘口自然等价于"净胜≥1即覆盖"，无需特殊分支
 */
export function calculateCoverProbability(
  handicap: number,
  dixonColesGrid: number[][],
  normFactor: number
): number {
  // 平手盘无需仲裁
  if (handicap === 0) return 1.0;

  // 无效输入检查
  if (!dixonColesGrid || dixonColesGrid.length === 0) return -1;

  const requiredMargin = Math.ceil(Math.abs(handicap));
  let coverProb = 0;

  for (let h = 0; h < dixonColesGrid.length; h++) {
    const row = dixonColesGrid[h];
    if (!row) continue;
    for (let a = 0; a < row.length; a++) {
      const cellProb = row[a] * normFactor;
      if (handicap < 0) {
        // 主让球：主队净胜球 >= 盘口要求
        if (h - a >= requiredMargin) {
          coverProb += cellProb;
        }
      } else {
        // 受让球/客让球：客队净胜球 >= 盘口要求
        if (a - h >= requiredMargin) {
          coverProb += cellProb;
        }
      }
    }
  }

  return Math.min(1.0, Math.max(0, coverProb));
}

/**
 * 盘口对齐修正：当模型推荐方向与盘口覆盖矛盾时，强制翻转方向
 *
 * 动态概率仲裁（v2.0）：
 * - 有 Dixon-Coles 矩阵时：基于进球分布计算"打穿盘口"的覆盖概率
 *   覆盖概率 ≥ 阈值(默认40%) → 不翻转；< 阈值 → 翻转
 * - 无矩阵数据时：回退到原有均值硬门槛逻辑（向后兼容）
 *
 * 早期退出：
 * - DRAW 方向：平局不参与盘口仲裁，直接返回
 * - 平手盘(handicap=0)：无需仲裁，直接返回
 */
export function calculateFinalDirection(
  modelDirection: MatchDirection,
  handicap: number,
  expectedNetGoals: number,
  dixonColesGrid?: number[][],
  normFactor?: number,
  coverProbabilityThreshold?: number
): ArbitratedDirection {
  const threshold = coverProbabilityThreshold ?? 0.4;

  // DRAW 早期退出：平局方向不参与盘口仲裁（必须在最顶端）
  if (modelDirection === 'DRAW') {
    return {
      direction: 'DRAW',
      wasFlipped: false,
      coverProbability: -1,
      arbitrationMode: 'THRESHOLD',
      flipReason: '平局方向不参与盘口仲裁'
    };
  }

  // 平手盘无需仲裁
  if (handicap === 0) {
    return {
      direction: modelDirection,
      wasFlipped: false,
      coverProbability: 1.0,
      arbitrationMode: 'THRESHOLD',
      flipReason: '平手盘，无需仲裁'
    };
  }

  // ===== 概率仲裁分支：有 Dixon-Coles 矩阵数据时 =====
  if (dixonColesGrid && dixonColesGrid.length > 0 && normFactor !== undefined) {
    const coverProb = calculateCoverProbability(handicap, dixonColesGrid, normFactor);

    if (coverProb < 0) {
      // 概率计算失败，回退到阈值仲裁
      return thresholdArbitration(modelDirection, handicap, expectedNetGoals, threshold, true);
    }

    if (modelDirection === 'HOME_WIN' && handicap < 0) {
      if (coverProb >= threshold) {
        return {
          direction: 'HOME_WIN',
          wasFlipped: false,
          coverProbability: coverProb,
          arbitrationMode: 'PROBABILISTIC',
          flipReason: `概率仲裁：覆盖概率 ${(coverProb * 100).toFixed(0)}% ≥ ${(threshold * 100).toFixed(0)}%，保持主胜方向`
        };
      } else {
        return {
          direction: 'AWAY_WIN',
          wasFlipped: true,
          coverProbability: coverProb,
          arbitrationMode: 'PROBABILISTIC',
          flipReason: `概率仲裁：覆盖概率 ${(coverProb * 100).toFixed(0)}% < ${(threshold * 100).toFixed(0)}%，主胜净胜球不足以覆盖盘口，修正为客胜`
        };
      }
    }

    if (modelDirection === 'AWAY_WIN' && handicap > 0) {
      if (coverProb >= threshold) {
        return {
          direction: 'AWAY_WIN',
          wasFlipped: false,
          coverProbability: coverProb,
          arbitrationMode: 'PROBABILISTIC',
          flipReason: `概率仲裁：覆盖概率 ${(coverProb * 100).toFixed(0)}% ≥ ${(threshold * 100).toFixed(0)}%，保持客胜方向`
        };
      } else {
        return {
          direction: 'HOME_WIN',
          wasFlipped: true,
          coverProbability: coverProb,
          arbitrationMode: 'PROBABILISTIC',
          flipReason: `概率仲裁：覆盖概率 ${(coverProb * 100).toFixed(0)}% < ${(threshold * 100).toFixed(0)}%，客胜净胜球不足以覆盖盘口，修正为主胜`
        };
      }
    }

    // 其他组合（如 HOME_WIN + handicap>0 或 AWAY_WIN + handicap<0）：不翻转
    return {
      direction: modelDirection,
      wasFlipped: false,
      coverProbability: coverProb,
      arbitrationMode: 'PROBABILISTIC',
      flipReason: `概率仲裁：覆盖概率 ${(coverProb * 100).toFixed(0)}%，方向与盘口无冲突，保持${modelDirection === 'HOME_WIN' ? '主胜' : '客胜'}方向`
    };
  }

  // ===== 阈值仲裁分支：无矩阵数据时回退到原有逻辑 =====
  return thresholdArbitration(modelDirection, handicap, expectedNetGoals, threshold);
}

/**
 * 阈值仲裁（原有逻辑，向后兼容）
 */
function thresholdArbitration(
  modelDirection: MatchDirection,
  handicap: number,
  expectedNetGoals: number,
  _threshold: number,
  _probCalcFailed: boolean = false
): ArbitratedDirection {
  const probWarning = _probCalcFailed ? ' (概率计算异常)' : '';

  // 主让球：模型推荐主胜但净胜球不足以覆盖盘口 → 修正为客胜
  if (modelDirection === 'HOME_WIN' && handicap < 0) {
    const absHandicap = Math.abs(handicap);
    const requiredMargin = Math.ceil(absHandicap);
    if (expectedNetGoals < requiredMargin) {
      return {
        direction: 'AWAY_WIN',
        wasFlipped: true,
        coverProbability: -1,
        arbitrationMode: 'THRESHOLD',
        flipReason: `阈值仲裁：预期净胜球 ${expectedNetGoals.toFixed(2)} < 盘口要求 ${requiredMargin}，修正为客胜${probWarning}`
      };
    }
    return {
      direction: 'HOME_WIN',
      wasFlipped: false,
      coverProbability: -1,
      arbitrationMode: 'THRESHOLD',
      flipReason: `阈值仲裁：预期净胜球 ${expectedNetGoals.toFixed(2)} ≥ 盘口要求 ${requiredMargin}，保持主胜方向${probWarning}`
    };
  }

  // 受让球：模型推荐客胜但客队净胜球不足以覆盖盘口 → 修正为主胜
  if (modelDirection === 'AWAY_WIN' && handicap > 0) {
    const requiredMargin = Math.ceil(handicap);
    if (expectedNetGoals > -requiredMargin) {
      return {
        direction: 'HOME_WIN',
        wasFlipped: true,
        coverProbability: -1,
        arbitrationMode: 'THRESHOLD',
        flipReason: `阈值仲裁：客队预期净胜球不足覆盖盘口要求 ${requiredMargin}，修正为主胜${probWarning}`
      };
    }
    return {
      direction: 'AWAY_WIN',
      wasFlipped: false,
      coverProbability: -1,
      arbitrationMode: 'THRESHOLD',
      flipReason: `阈值仲裁：客队预期净胜球足以覆盖盘口要求 ${requiredMargin}，保持客胜方向${probWarning}`
    };
  }

  // 其他组合：不翻转
  return {
    direction: modelDirection,
    wasFlipped: false,
    coverProbability: -1,
    arbitrationMode: 'THRESHOLD',
    flipReason: `阈值仲裁：方向与盘口无冲突，保持原方向${probWarning}`
  };
}
