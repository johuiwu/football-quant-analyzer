import { describe, it, expect } from 'vitest';
import { computeDixonColesProbs, exactAsianTo1X2, exact1X2ToAsian } from '../odds';

// ======================== computeDixonColesProbs ========================
describe('computeDixonColesProbs', () => {
  it('概率和为 1（容差 0.02）', () => {
    const result = computeDixonColesProbs(1.5, 1.2, -0.075);
    const sum = result.homeProb + result.drawProb + result.awayProb;
    expect(sum).toBeCloseTo(1, 2);
  });

  it('lambda > mu 时主胜概率高于客胜', () => {
    const result = computeDixonColesProbs(1.8, 1.0, -0.075);
    expect(result.homeProb).toBeGreaterThan(result.awayProb);
  });

  it('lambda < mu 时客胜概率高于主胜', () => {
    const result = computeDixonColesProbs(1.0, 1.8, -0.075);
    expect(result.awayProb).toBeGreaterThan(result.homeProb);
  });

  it('lambda = mu 时主客概率接近', () => {
    const result = computeDixonColesProbs(1.5, 1.5, -0.075);
    const diff = Math.abs(result.homeProb - result.awayProb);
    expect(diff).toBeLessThan(0.05);
  });

  it('rho=0 时不修正低比分', () => {
    const withRho = computeDixonColesProbs(1.5, 1.2, -0.075);
    const withoutRho = computeDixonColesProbs(1.5, 1.2, 0);
    // 有 rho 时 0-0 概率被压低（rho<0 => 1-lambda*mu*rho > 1）
    // 所以有 rho 时 drawProb 应略高
    expect(withRho.drawProb).toBeGreaterThan(withoutRho.drawProb);
  });

  it('rho 正数时降低平局概率', () => {
    const posRho = computeDixonColesProbs(1.5, 1.2, 0.1);
    const negRho = computeDixonColesProbs(1.5, 1.2, -0.075);
    // rho>0 压低 0-0 => 平局概率更低
    expect(posRho.drawProb).toBeLessThan(negRho.drawProb);
  });

  it('lambda 极小不崩溃', () => {
    const result = computeDixonColesProbs(0.1, 1.2, -0.075);
    expect(result.awayProb).toBeGreaterThan(result.homeProb);
    const sum = result.homeProb + result.drawProb + result.awayProb;
    expect(sum).toBeCloseTo(1, 2);
  });

  it('mu 极小不崩溃', () => {
    const result = computeDixonColesProbs(1.5, 0.1, -0.075);
    expect(result.homeProb).toBeGreaterThan(result.awayProb);
    const sum = result.homeProb + result.drawProb + result.awayProb;
    expect(sum).toBeCloseTo(1, 2);
  });
});

// ======================== exactAsianTo1X2 ========================
describe('exactAsianTo1X2', () => {
  it('平手盘 (handicap=0) 等实力时主客赔率对称', () => {
    const result = exactAsianTo1X2(0, 1.0, 1.0, 'EPL', 0.92, 0);
    const diff = Math.abs(result.homeOdds - result.awayOdds);
    // 平局存在导致不完全对称，但应接近
    expect(diff).toBeLessThan(0.5);
  });

  it('主让半球 (handicap=-0.5) 主胜赔率低于客胜', () => {
    const result = exactAsianTo1X2(-0.5, 1.0, 1.0, 'EPL', 0.92, 0);
    expect(result.homeOdds).toBeLessThan(result.awayOdds);
  });

  it('客让半球 (handicap=0.5) 客胜赔率低于主胜', () => {
    const result = exactAsianTo1X2(0.5, 1.0, 1.0, 'EPL', 0.92, 0);
    expect(result.awayOdds).toBeLessThan(result.homeOdds);
  });

  it('主让一球 (handicap=-1.0) 主胜赔率显著低于客胜', () => {
    const result = exactAsianTo1X2(-1.0, 1.0, 1.0, 'EPL', 0.92, 0);
    expect(result.homeOdds).toBeLessThan(result.awayOdds);
  });

  it('概率和为 1（容差 0.02）', () => {
    const result = exactAsianTo1X2(-0.5, 1.0, 1.0, 'EPL', 0.92, 0);
    const sum = result.homeProb + result.drawProb + result.awayProb;
    expect(sum).toBeCloseTo(1, 2);
  });

  it('profit margin 合理（homeOdds * homeProb ≈ returnRate）', () => {
    const result = exactAsianTo1X2(0, 1.0, 1.0, 'EPL', 0.92, 0);
    expect(result.homeOdds * result.homeProb).toBeCloseTo(0.92, 1);
    expect(result.drawOdds * result.drawProb).toBeCloseTo(0.92, 1);
    expect(result.awayOdds * result.awayProb).toBeCloseTo(0.92, 1);
  });

  it('homeAdv=0.5 轻微提升主队赔率', () => {
    const noAdv = exactAsianTo1X2(0, 1.0, 1.0, 'EPL', 0.92, 0);
    const withAdv = exactAsianTo1X2(0, 1.0, 1.0, 'EPL', 0.92, 0.5);
    // 主场优势 > 0 => 主队 lambda 更大 => 主胜概率更高 => 主胜赔率更低
    expect(withAdv.homeProb).toBeGreaterThan(noAdv.homeProb);
  });

  it('未知联赛使用默认参数不崩溃', () => {
    const result = exactAsianTo1X2(-0.5, 1.0, 1.0, undefined, 0.92, 0);
    expect(result.homeProb).toBeGreaterThan(0);
    expect(result.awayProb).toBeGreaterThan(0);
  });

  it('homeStrength 远大于 awayStrength 时主胜概率极高', () => {
    const result = exactAsianTo1X2(0, 2.0, 0.5, 'EPL', 0.92, 0);
    expect(result.homeProb).toBeGreaterThan(0.5);
    expect(result.homeProb).toBeGreaterThan(result.awayProb * 2);
  });
});

// ======================== exact1X2ToAsian ========================
describe('exact1X2ToAsian', () => {
  const homeOdds = 2.0;
  const drawOdds = 3.5;
  const awayOdds = 3.8;

  it('返回标准盘口值', () => {
    const result = exact1X2ToAsian(homeOdds, drawOdds, awayOdds, 1.0, 1.0, 'EPL');
    // 标准盘口列表中的值
    const standardHandicaps = [-3.0, -2.5, -2.0, -1.75, -1.5, -1.25, -1.0, -0.75, -0.5, -0.25,
      0, 0.25, 0.5, 0.75, 1.0, 1.25, 1.5, 1.75, 2.0, 2.5, 3.0];
    expect(standardHandicaps).toContain(result.handicap);
  });

  it('主场大热时盘口为负（主让球）', () => {
    const result = exact1X2ToAsian(1.5, 4.0, 7.0, 1.0, 1.0, 'EPL');
    expect(result.handicap).toBeLessThan(0);
  });

  it('客场大热时盘口为正（客让球）', () => {
    const result = exact1X2ToAsian(7.0, 4.0, 1.5, 1.0, 1.0, 'EPL');
    expect(result.handicap).toBeGreaterThan(0);
  });

  it('水位在合理范围 [0.75, 1.10]', () => {
    const result = exact1X2ToAsian(homeOdds, drawOdds, awayOdds, 1.0, 1.0, 'EPL');
    expect(result.homeWater).toBeGreaterThanOrEqual(0.75);
    expect(result.homeWater).toBeLessThanOrEqual(1.10);
    expect(result.awayWater).toBeGreaterThanOrEqual(0.75);
    expect(result.awayWater).toBeLessThanOrEqual(1.10);
  });

  it('主场大热时主队水位偏低', () => {
    const result = exact1X2ToAsian(1.4, 5.0, 8.0, 1.0, 1.0, 'EPL');
    expect(result.homeWater).toBeLessThanOrEqual(result.awayWater);
  });

  it('等实力时盘口接近 0', () => {
    const result = exact1X2ToAsian(2.7, 3.2, 2.7, 1.0, 1.0, 'EPL');
    expect(Math.abs(result.handicap)).toBeLessThanOrEqual(0.25);
  });

  it('往返转换一致性：1X2 → Asian → 1X2 验证', () => {
    const asian = exact1X2ToAsian(homeOdds, drawOdds, awayOdds, 1.0, 1.0, 'EPL');
    const back = exactAsianTo1X2(asian.handicap, 1.0, 1.0, 'EPL', 0.92, 0);

    // 往返后主胜概率应接近原始隐含概率
    const rawProbs = {
      home: 1 / homeOdds,
      draw: 1 / drawOdds,
      away: 1 / awayOdds,
    };
    const total = rawProbs.home + rawProbs.draw + rawProbs.away;
    const origHomeProb = rawProbs.home / total;

    expect(back.homeProb).toBeCloseTo(origHomeProb, 1);
  });

  it('极端赔率不崩溃（主队超强）', () => {
    const result = exact1X2ToAsian(1.1, 8.0, 20.0, 1.0, 1.0, 'EPL');
    expect(result.handicap).toBeLessThan(0);
    expect(Number.isFinite(result.homeWater)).toBe(true);
  });

  it('极端赔率不崩溃（客队超强）', () => {
    const result = exact1X2ToAsian(20.0, 8.0, 1.1, 1.0, 1.0, 'EPL');
    expect(result.handicap).toBeGreaterThan(1.0);
    expect(Number.isFinite(result.awayWater)).toBe(true);
  });
});