import { describe, it, expect } from 'vitest';
import { calculateBaseOdds, calculateReturnRate, calculateImpliedProbability } from '../utils/oddsCalculator';
import { convertAsianTo1X2, convert1X2ToAsian, calculateKellyFraction, syncMatchToAsianHandicap } from '../utils/quantModel';

// ======================== calculateBaseOdds ??? ========================
describe('calculateBaseOdds ????', () => {
  it('?elo?xG ? ???????returnRate???', () => {
    const result = calculateBaseOdds(1600, 1600, 1.2, 1.2, 1.0, 1.0);
    expect(result.homeOdds).toBeGreaterThan(2.0);
    expect(result.drawOdds).toBeGreaterThan(2.0);
    expect(result.awayOdds).toBeGreaterThan(2.0);
    // ?????0.93-0.95??
    const rate = calculateReturnRate(result.homeOdds, result.drawOdds, result.awayOdds);
    expect(rate).toBeGreaterThan(0.9);
    expect(rate).toBeLessThan(1.0);
  });

  it('elo=1500/1500 xG=0.8/0.8 ? ??????', () => {
    const result = calculateBaseOdds(1500, 1500, 0.8, 0.8, 1.0, 1.0);
    const sum = 1/result.homeOdds + 1/result.drawOdds + 1/result.awayOdds;
    // ?round???????
    expect(1/sum).toBeGreaterThan(0.88);
  });

  it('elo=1200/2000 xG=0.5/2.5 ? ??????', () => {
    const result = calculateBaseOdds(1200, 2000, 0.5, 2.5, 1.0, 1.0);
    expect(result.awayOdds).toBeLessThan(result.homeOdds);
    expect(result.homeOdds).toBeGreaterThan(result.awayOdds);
  });

  it('?????0.8 ? ?????', () => {
    const result = calculateBaseOdds(1800, 1800, 1.5, 1.5, 0.8, 0.8);
    expect(result.homeOdds).toBeGreaterThan(1.5);
    expect(result.awayOdds).toBeGreaterThan(1.5);
  });

  it('elo=1000/1000 xG=0.3/0.3 ? ???', () => {
    const result = calculateBaseOdds(1000, 1000, 0.3, 0.3, 1.0, 1.0);
    expect(result.homeOdds).toBeGreaterThan(2.0);
    expect(result.awayOdds).toBeGreaterThan(2.0);
    // ?????NaN
    expect(isNaN(result.homeOdds)).toBe(false);
  });

  it('elo=2500/2500 xG=4.0/4.0 ? ????', () => {
    const result = calculateBaseOdds(2500, 2500, 4.0, 4.0, 1.0, 1.0);
    // ??????????
    expect(Math.abs(result.homeOdds - result.awayOdds)).toBeLessThan(0.2);
  });
});

// ======================== calculateReturnRate ========================
describe('calculateReturnRate ???', () => {
  it('2.0/3.5/3.5 ? ?????', () => {
    const rate = calculateReturnRate(2.0, 3.5, 3.5);
    expect(rate).toBeGreaterThan(0.85);
    expect(rate).toBeLessThan(1.0);
  });

  it('1.5/4.0/6.0 ? ???', () => {
    const rate = calculateReturnRate(1.5, 4.0, 6.0);
    expect(rate).toBeGreaterThan(0.8);
    expect(rate).toBeLessThan(0.98);
  });

  it('10.0/10.0/10.0 ? ?????', () => {
    const rate = calculateReturnRate(10.0, 10.0, 10.0);
    expect(rate).toBeGreaterThan(0.9);
  });
});

// ======================== calculateImpliedProbability ========================
describe('calculateImpliedProbability ??', () => {
  it('1.50/3.00/5.00 ? overround>1', () => {
    const result = calculateImpliedProbability(1.50, 3.00, 5.00);
    expect(result.total).toBeGreaterThan(1.0);
  });

  it('????????', () => {
    const result = calculateImpliedProbability(2.50, 3.20, 2.80);
    expect(result.homeProb).toBeGreaterThan(0);
    expect(result.drawProb).toBeGreaterThan(0);
    expect(result.awayProb).toBeGreaterThan(0);
  });
});

// ======================== convertAsianTo1X2 ???? ========================
describe('convertAsianTo1X2 ????', () => {
  it('handicap=-1.0 ???? ? homeProb>awayProb', () => {
    const result = convertAsianTo1X2(-1.0, 0.90, 0.95);
    expect(result.homeProb).toBeGreaterThan(result.awayProb);
  });

  it('handicap=1.0 ???? ? awayProb>homeProb', () => {
    const result = convertAsianTo1X2(1.0, 0.95, 0.90);
    expect(result.awayProb).toBeGreaterThan(result.homeProb);
  });

  it('handicap=-0.75, ???? ? ??????', () => {
    const result = convertAsianTo1X2(-0.75, 0.92, 0.92);
    const sum = result.homeProb + result.drawProb + result.awayProb;
    expect(sum).toBeCloseTo(1, 1);
  });
});


// ======================== syncMatchToAsianHandicap ========================
describe('syncMatchToAsianHandicap', () => {
  it('2.00/3.40/3.80 ? ????', () => {
    const result = syncMatchToAsianHandicap({ home: 2.00, draw: 3.40, away: 3.80 });
    expect(result).toBeDefined();
    expect(typeof result.handicap).toBe('number');
  });

  it('1.60/4.00/5.50 ? ????', () => {
    const result = syncMatchToAsianHandicap({ home: 1.60, draw: 4.00, away: 5.50 });
    expect(result.handicap).toBeLessThan(0);
  });

  it('5.50/4.00/1.60 ? ????', () => {
    const result = syncMatchToAsianHandicap({ home: 5.50, draw: 4.00, away: 1.60 });
    expect(result.handicap).toBeGreaterThan(0);
  });
});

// ======================== convertAsianTo1X2 ????? ========================
describe('convertAsianTo1X2 ??????', () => {
  const standardHandicaps = [-1.5, -1.25, -1.0, -0.75, -0.5, -0.25, 0, 0.25, 0.5, 0.75, 1.0, 1.25, 1.5];
  
  standardHandicaps.forEach(hcp => {
    it('handicap=' + hcp + ' ???', () => {
      const water = hcp <= 0 ? 0.90 : 0.95;
      const awayWater = hcp <= 0 ? 0.95 : 0.90;
      const result = convertAsianTo1X2(hcp, water, awayWater);
      expect(result.homeProb).toBeGreaterThan(0);
      expect(result.awayProb).toBeGreaterThan(0);
      const sum = result.homeProb + result.drawProb + result.awayProb;
      expect(sum).toBeCloseTo(1, 1);
    });
  });
});

// ======================== calculateKellyFraction ?? ========================
describe('calculateKellyFraction ????', () => {
  it('prob=0.95 ??? ? ?????', () => {
    const result = calculateKellyFraction(0.95, 1.2);
    expect(result).toBeGreaterThan(0);
    expect(result).toBeLessThanOrEqual(100);
  });

  it('prob=0.1 ??? ? ??????', () => {
    const result = calculateKellyFraction(0.1, 50.0);
    expect(result).toBeGreaterThanOrEqual(0);
    expect(result).toBeLessThanOrEqual(100);
  });

  it('odds ?? ? ??????', () => {
    const result = calculateKellyFraction(0.3, 100.0);
    expect(result).toBeGreaterThanOrEqual(0);
    expect(result).toBeLessThanOrEqual(100);
  });
});
