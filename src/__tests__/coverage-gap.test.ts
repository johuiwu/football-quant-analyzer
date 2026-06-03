import { describe, it, expect } from 'vitest';
import { convertAsianTo1X2, convert1X2ToAsian } from '../utils/quantModel';
import { calculateBaseOdds, calculateReturnRate } from '../utils/oddsCalculator';

// ======================== convertAsianTo1X2 ?????? ========================
describe('convertAsianTo1X2 ??????', () => {
  it('handicap=0.5 ???? ? awayProb > homeProb', () => {
    const result = convertAsianTo1X2(0.5, 0.95, 0.90);
    const sum = result.homeProb + result.drawProb + result.awayProb;
    expect(sum).toBeCloseTo(1, 1);
    expect(result.awayProb).toBeGreaterThan(result.homeProb);
  });

  it('handicap=0.75 ???? ? ??????', () => {
    const result = convertAsianTo1X2(0.75, 1.00, 0.86);
    expect(result.awayProb).toBeGreaterThan(result.homeProb);
    const sum = result.homeProb + result.drawProb + result.awayProb;
    expect(sum).toBeCloseTo(1, 1);
  });

  it('handicap=1.0 ???? ? awayProb ???? homeProb', () => {
    const result = convertAsianTo1X2(1.0, 1.05, 0.82);
    const diff = result.awayProb - result.homeProb;
    expect(diff).toBeGreaterThan(0.05);
  });

  it('handicap=1.25 ???? ? ????', () => {
    const result = convertAsianTo1X2(1.25, 1.10, 0.78);
    expect(result.awayProb).toBeGreaterThan(result.homeProb);
  });

  it('handicap=1.5 ???? ? ???', () => {
    const result = convertAsianTo1X2(1.5, 1.15, 0.75);
    expect(result.awayProb).toBeGreaterThan(0);
    expect(result.homeProb).toBeGreaterThan(0);
  });

  it('handicap=2.0 ???? ? ???????', () => {
    const result = convertAsianTo1X2(2.0, 1.20, 0.72);
    expect(result.awayProb).toBeGreaterThan(result.homeProb);
    const sum = result.homeProb + result.drawProb + result.awayProb;
    expect(sum).toBeCloseTo(1, 1);
  });
});

// ======================== calculateBaseOdds ?? ========================
describe('calculateBaseOdds ??', () => {
  it('???? ? ????', () => {
    const result = calculateBaseOdds(1800, 1800, 1.5, 1.5, 1, 1);
    expect(result.homeOdds).toBeGreaterThan(0);
    expect(result.drawOdds).toBeGreaterThan(0);
    expect(result.awayOdds).toBeGreaterThan(0);
    expect(Math.abs(result.homeOdds - result.awayOdds)).toBeLessThan(0.5);
  });

  it('???? ? ????', () => {
    const result = calculateBaseOdds(2000, 1400, 2.5, 0.8, 1, 1);
    expect(result.homeOdds).toBeLessThan(result.awayOdds);
  });

  it('???? ? ????', () => {
    const result = calculateBaseOdds(1400, 2000, 0.8, 2.5, 1, 1);
    expect(result.awayOdds).toBeLessThan(result.homeOdds);
  });

  it('?? elo ? ? ??????', () => {
    const result = calculateBaseOdds(2200, 1200, 3.0, 0.5, 1, 1);
    expect(result.homeOdds).toBeGreaterThan(1.0);
    expect(result.awayOdds).toBeGreaterThan(1.0);
    expect(result.drawOdds).toBeGreaterThan(2.0);
  });

  it('??????=0.8 ? ??????', () => {
    const normal = calculateBaseOdds(1800, 1800, 1.5, 1.5, 1, 1);
    const injured = calculateBaseOdds(1800, 1800, 1.5, 1.5, 0.8, 1);
    expect(injured.homeOdds).toBeGreaterThanOrEqual(normal.homeOdds * 0.95);
  });

  it('???? ? ?????', () => {
    const result = calculateBaseOdds(1800, 1800, 1.5, 1.5, 0.8, 0.8);
    expect(result.homeOdds).toBeGreaterThan(1.0);
    expect(result.awayOdds).toBeGreaterThan(1.0);
  });
});

// ======================== calculateReturnRate ========================
describe('calculateReturnRate', () => {
  it('???? ? ???? 0.85-1.0', () => {
    const rate = calculateReturnRate(2.0, 3.5, 4.0);
    expect(rate).toBeGreaterThan(0.85);
    expect(rate).toBeLessThan(1.0);
  });

  it('???? ? ????? 1', () => {
    const rate = calculateReturnRate(2.0, 3.0, 6.0);
    expect(rate).toBeCloseTo(1, 2);
  });
});

// ======================== convert1X2ToAsian ????? ========================
describe('convert1X2ToAsian ????', () => {
  it('1.80/3.80/4.00 ? ?????', () => {
    const result = convert1X2ToAsian(1.80, 3.80, 4.00);
    expect(typeof result.handicap).toBe('number');
    expect(result.handicap).toBeLessThan(0);
  });

  it('4.00/3.80/1.80 ? ?????', () => {
    const result = convert1X2ToAsian(4.00, 3.80, 1.80);
    expect(typeof result.handicap).toBe('number');
    expect(result.handicap).toBeGreaterThan(0);
  });

  it('2.50/3.10/2.80 ? ???? 0', () => {
    const result = convert1X2ToAsian(2.50, 3.10, 2.80);
    expect(Math.abs(result.handicap)).toBeLessThanOrEqual(0.5);
  });
});