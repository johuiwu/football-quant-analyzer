import { describe, it, expect } from 'vitest';
import { calculateZScore, computeStats, evaluateUpsetAlert, ensureEnoughData } from '../heatIndex';

describe('calculateZScore', () => {
  it('value=100, mean=50, stdDev=25 => zScore=2.0', () => {
    expect(calculateZScore(100, 50, 25)).toBeCloseTo(2.0, 5);
  });

  it('value=50, mean=50, stdDev=25 => zScore=0', () => {
    expect(calculateZScore(50, 50, 25)).toBeCloseTo(0, 5);
  });

  it('value=25, mean=50, stdDev=25 => zScore=-1.0', () => {
    expect(calculateZScore(25, 50, 25)).toBeCloseTo(-1.0, 5);
  });

  it('stdDev=0 时返回 0（防御性编程）', () => {
    expect(calculateZScore(100, 50, 0)).toBe(0);
  });

  it('stdDev 为负数时返回 0', () => {
    expect(calculateZScore(100, 50, -5)).toBe(0);
  });
});

describe('computeStats', () => {
  it('空数组返回 {mean:0, stdDev:0}', () => {
    const result = computeStats([]);
    expect(result.mean).toBe(0);
    expect(result.stdDev).toBe(0);
  });

  it('单元素数组返回 mean=该值, stdDev=0', () => {
    const result = computeStats([42]);
    expect(result.mean).toBe(42);
    expect(result.stdDev).toBe(0);
  });

  it('[10, 20, 30] => mean=20, stdDev≈10', () => {
    const result = computeStats([10, 20, 30]);
    expect(result.mean).toBeCloseTo(20, 5);
    expect(result.stdDev).toBeCloseTo(10, 5);
  });

  it('模拟10场比赛数据', () => {
    const data = [45, 52, 48, 55, 50, 47, 53, 49, 51, 50];
    const result = computeStats(data);
    expect(result.mean).toBeCloseTo(50, 0);
    expect(result.stdDev).toBeGreaterThan(0);
    expect(result.stdDev).toBeLessThan(5);
  });
});

describe('evaluateUpsetAlert', () => {
  it('正常投注不触发预警 (zScore < 2.0)', () => {
    const result = evaluateUpsetAlert(
      50, 50,    // 投注量
      0.40, 0.30, // 模型概率
      50, 15,    // 历史均值/标准差
      0.35, 0.25  // 赔率隐含概率
    );
    expect(result.isUpset).toBe(false);
    expect(result.level).toBe('none');
  });

  it('zScore > 2.0 且 probGap > 0.15 触发预警', () => {
    // homeBet=85，历史均值50，std=15 => Z = (85-25)/(7.5) ≈ 8 (非常大) 
    // 注意: evaluateUpsetAlert 内部分母用 historicalStdDev/2
    const result = evaluateUpsetAlert(
      85, 15,
      0.55, 0.20,
      50, 15,
      0.30, 0.15
    );
    expect(result.isUpset).toBe(true);
    expect(result.level).toBe('danger');
  });

  it('zScore > 2.0 但 probGap 不满足时不触发', () => {
    const result = evaluateUpsetAlert(
      85, 15,
      0.35, 0.30,
      50, 15,
      0.33, 0.28  // probGap 很小
    );
    expect(result.isUpset).toBe(false);
  });

  it('1.5 < zScore < 2.0 且 probGap > 0.1 触发 warning', () => {
    const result = evaluateUpsetAlert(
      65, 35,
      0.45, 0.28,
      50, 15,
      0.30, 0.18
    );
    expect(result.level).toBe('warning');
  });

  it('zScoreHome 和 zScoreAway 正确计算', () => {
    const result = evaluateUpsetAlert(
      80, 20,
      0.50, 0.25,
      50, 20,
      0.30, 0.20
    );
    // home: Z = (80-25)/(10) = 5.5, away: Z = (20-25)/(10) = -0.5
    expect(result.zScoreHome).toBeGreaterThan(0);
    expect(result.zScoreAway).toBeLessThan(0);
  });
});


describe('ensureEnoughData', () => {
  it('null ?? false', () => {
    expect(ensureEnoughData(null)).toBe(false);
  });

  it('count < 5 ?? false', () => {
    expect(ensureEnoughData({ count: 3, stdDev: 10 })).toBe(false);
  });

  it('count >= 5 ? stdDev ???? true', () => {
    expect(ensureEnoughData({ count: 5, stdDev: 10 })).toBe(true);
  });

  it('stdDev ????? false', () => {
    expect(ensureEnoughData({ count: 10, stdDev: 0.0005 })).toBe(false);
  });
});

describe('evaluateUpsetAlert ?????', () => {
  it('historicalCount=0 ??? cold_start', () => {
    const result = evaluateUpsetAlert(
      50, 50, 0.40, 0.30, 50, 15, 0.35, 0.25,
      0 // ???
    );
    expect(result.level).toBe('cold_start');
    expect(result.dataReady).toBe(false);
    expect(result.zScoreHome).toBe(0);
    expect(result.zScoreAway).toBe(0);
  });

  it('historicalCount=3 ???? cold_start (?? 5 ?)', () => {
    const result = evaluateUpsetAlert(
      50, 50, 0.40, 0.30, 50, 15, 0.35, 0.25,
      3
    );
    expect(result.level).toBe('cold_start');
  });

  it('historicalCount=6 ????? Z-Score (stdDev ??)', () => {
    const result = evaluateUpsetAlert(
      50, 50, 0.40, 0.30, 50, 15, 0.35, 0.25,
      6
    );
    expect(result.dataReady).toBe(true);
    // ??????????
    expect(result.level).toBe('none');
  });

  it('?????????????? (heatIndex > 1.45)', () => {
    const result = evaluateUpsetAlert(
      85, 15, 0.30, 0.45, 50, 15, 0.20, 0.40,
      2 // ????
    );
    // heatIndex = 85 / (0.30 * 100) = 2.83 > 1.45 ? ???????
    expect(result.level).toBe('warning');
    expect(result.isUpset).toBe(true);
  });
});
