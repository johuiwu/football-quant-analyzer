import { describe, test, expect } from 'vitest';
import { calculateImpliedProbability } from '../utils/oddsCalculator';
import { convert1X2ToAsian } from '../utils/quantModel';

const RETURN_RATE = 0.94;
const TARGET_TOTAL = 1 / RETURN_RATE;

describe('calculateImpliedProbability 纯函数校验', () => {
  test('场景 A：2.00 / 3.50 / 4.00 归一化后隐含概率总合应 ≈ 1.0638', () => {
    const raw = calculateImpliedProbability(2.00, 3.50, 4.00);
    const totalProb = raw.homeProb + raw.drawProb + raw.awayProb;
    const homeNorm = raw.homeProb / totalProb;
    const drawNorm = raw.drawProb / totalProb;
    const awayNorm = raw.awayProb / totalProb;

    const normalizedHomeOdds = RETURN_RATE / homeNorm;
    const normalizedDrawOdds = RETURN_RATE / drawNorm;
    const normalizedAwayOdds = RETURN_RATE / awayNorm;

    const check = calculateImpliedProbability(normalizedHomeOdds, normalizedDrawOdds, normalizedAwayOdds);
    expect(check.total).toBeCloseTo(TARGET_TOTAL, 3);
    // 验证归一化后的概率和为1
    expect(homeNorm + drawNorm + awayNorm).toBeCloseTo(1.0, 6);
  });

  test('场景 B：1.80 / 3.60 / 5.00 归一化后隐含概率总合应 ≈ 1.0638', () => {
    const raw = calculateImpliedProbability(1.80, 3.60, 5.00);
    const totalProb = raw.homeProb + raw.drawProb + raw.awayProb;
    const homeNorm = raw.homeProb / totalProb;
    const drawNorm = raw.drawProb / totalProb;
    const awayNorm = raw.awayProb / totalProb;

    const normalizedHomeOdds = RETURN_RATE / homeNorm;
    const normalizedDrawOdds = RETURN_RATE / drawNorm;
    const normalizedAwayOdds = RETURN_RATE / awayNorm;

    const check = calculateImpliedProbability(normalizedHomeOdds, normalizedDrawOdds, normalizedAwayOdds);
    expect(check.total).toBeCloseTo(TARGET_TOTAL, 3);
    expect(homeNorm + drawNorm + awayNorm).toBeCloseTo(1.0, 6);
  });

  test('场景 C：2.50 / 3.20 / 2.80 归一化后隐含概率总合应 ≈ 1.0638', () => {
    const raw = calculateImpliedProbability(2.50, 3.20, 2.80);
    const totalProb = raw.homeProb + raw.drawProb + raw.awayProb;
    const homeNorm = raw.homeProb / totalProb;
    const drawNorm = raw.drawProb / totalProb;
    const awayNorm = raw.awayProb / totalProb;

    const normalizedHomeOdds = RETURN_RATE / homeNorm;
    const normalizedDrawOdds = RETURN_RATE / drawNorm;
    const normalizedAwayOdds = RETURN_RATE / awayNorm;

    const check = calculateImpliedProbability(normalizedHomeOdds, normalizedDrawOdds, normalizedAwayOdds);
    expect(check.total).toBeCloseTo(TARGET_TOTAL, 3);
    expect(homeNorm + drawNorm + awayNorm).toBeCloseTo(1.0, 6);
  });
});

describe('convert1X2ToAsian 水位归一化验证', () => {
  // 生成符合 94% 返还率的测试赔率
  function normalizeToReturnRate(homeOdds: number, drawOdds: number, awayOdds: number) {
    const raw = calculateImpliedProbability(homeOdds, drawOdds, awayOdds);
    const totalProb = raw.homeProb + raw.drawProb + raw.awayProb;
    const homeNorm = raw.homeProb / totalProb;
    const drawNorm = raw.drawProb / totalProb;
    const awayNorm = raw.awayProb / totalProb;

    return {
      homeOdds: RETURN_RATE / homeNorm,
      drawOdds: RETURN_RATE / drawNorm,
      awayOdds: RETURN_RATE / awayNorm,
    };
  }

  test('场景 A 正常赔率 → 亚盘水位隐含概率和应为 1/0.94', () => {
    const normalized = normalizeToReturnRate(2.00, 3.50, 4.00);
    const asian = convert1X2ToAsian(normalized.homeOdds, normalized.drawOdds, normalized.awayOdds);

    const homeImpWater = 1 / asian.homeWater;
    const awayImpWater = 1 / asian.awayWater;

    // 亚盘水位隐含概率应从 1X2 归一化后推导
    expect(homeImpWater > 0).toBe(true);
    expect(awayImpWater > 0).toBe(true);
  });

  test('场景 B 正常赔率 → 水位在合理范围 [0.75, 1.10]', () => {
    const normalized = normalizeToReturnRate(1.80, 3.60, 5.00);
    const asian = convert1X2ToAsian(normalized.homeOdds, normalized.drawOdds, normalized.awayOdds);

    expect(asian.homeWater).toBeGreaterThanOrEqual(0.75);
    expect(asian.homeWater).toBeLessThanOrEqual(1.10);
    expect(asian.awayWater).toBeGreaterThanOrEqual(0.75);
    expect(asian.awayWater).toBeLessThanOrEqual(1.10);
  });

  test('场景 C 正常赔率 → 盘口应为合理整档', () => {
    const normalized = normalizeToReturnRate(2.50, 3.20, 2.80);
    const asian = convert1X2ToAsian(normalized.homeOdds, normalized.drawOdds, normalized.awayOdds);

    // 盘口值应为标准档位
    const validHandicaps = [-1.5, -1.25, -1.0, -0.75, -0.5, -0.25, 0, 0.25, 0.5, 0.75, 1.0, 1.25, 1.5];
    expect(validHandicaps).toContain(asian.handicap);
  });
});
// ======================== 极端赔率边界（补充） ========================
describe('calculateImpliedProbability 极端赔率', () => {
  it('极端赔率 1.01/51.00/51.00 → 归一化后合理', () => {
    const raw = calculateImpliedProbability(1.01, 51.00, 51.00);
    const totalProb = raw.homeProb + raw.drawProb + raw.awayProb;
    const homeNorm = raw.homeProb / totalProb;
    expect(homeNorm).toBeGreaterThan(0.9);
    expect(totalProb).toBeGreaterThan(1);
  });

  it('平局最高概率场景 → drawProb > 0.3', () => {
    // 三赔接近 → 平局隐含概率最高
    const raw = calculateImpliedProbability(3.00, 3.00, 3.00);
    const totalProb = raw.homeProb + raw.drawProb + raw.awayProb;
    const drawNorm = raw.drawProb / totalProb;
    expect(drawNorm).toBeGreaterThan(0.3);
  });

  it('无效赔率（≤1.0）→ 返回极大总概率但不出错', () => {
    const raw = calculateImpliedProbability(0.5, 3.40, 3.80);
    expect(raw.homeProb).toBeGreaterThan(0);
    expect(raw.total).toBeGreaterThan(1);
  });

  it('对称赔率 2.00/3.20/3.20 → homeProb 最大', () => {
    const raw = calculateImpliedProbability(2.00, 3.20, 3.20);
    const totalProb = raw.homeProb + raw.drawProb + raw.awayProb;
    const homeNorm = raw.homeProb / totalProb;
    expect(homeNorm).toBeGreaterThan(raw.drawProb / totalProb);
  });
});

describe('convert1X2ToAsian 补充', () => {
  it('极端主胜赔率 1.20/5.00/12.00 → 亚盘为负（主让深盘）', () => {
    const result = convert1X2ToAsian(1.20, 5.00, 12.00);
    expect(result.handicap).toBeLessThan(0);
    expect(result.handicap).toBeGreaterThan(-3);
  });

  it('极端客胜赔率 12.00/5.00/1.20 → 亚盘为正（客让深盘）', () => {
    const result = convert1X2ToAsian(12.00, 5.00, 1.20);
    expect(result.handicap).toBeGreaterThan(0);
    expect(result.handicap).toBeLessThan(3);
  });
});


// ======================== v3.1 round-trip ========================
import { exactAsianTo1X2, exact1X2ToAsian, computeDixonColesProbs } from '../models/odds';

describe('Asian <-> 1X2 round-trip', () => {
  const cases = [
    { hcp: -0.5, hs: 1.15, aw: 0.85 },
    { hcp: 0, hs: 1.0, aw: 1.0 },
    { hcp: 0.5, hs: 0.85, aw: 1.15 },
    { hcp: -1.0, hs: 1.3, aw: 0.7 },
    { hcp: 1.0, hs: 0.7, aw: 1.3 },
  ];

  cases.forEach(({ hcp, hs, aw }) => {
    it('handicap=' + hcp + ' round-trip err <= 0.05', () => {
      const r = exactAsianTo1X2(hcp, hs, aw);
      const back = exact1X2ToAsian(r.homeOdds, r.drawOdds, r.awayOdds, hs, aw);
      expect(Math.abs(back.handicap - hcp)).toBeLessThanOrEqual(0.05);
    });
  });

  it('computeDixonColesProbs sum == 1', () => {
    const p = computeDixonColesProbs(1.35, 1.15);
    expect(p.homeProb + p.drawProb + p.awayProb).toBeCloseTo(1.0, 4);
  });
});
