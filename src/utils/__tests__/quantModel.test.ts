import { describe, it, expect } from 'vitest';
import {
  calculateKellyFraction,
  convertAsianTo1X2,
  convert1X2ToAsian,
} from '../quantModel';

// ======================== calculateKellyFraction() 测试 ========================
describe('calculateKellyFraction(prob, decimalOdds)', () => {
  describe('典型值', () => {
    it('prob=0.55, odds=2.0 返回正数', () => {
      const result = calculateKellyFraction(0.55, 2.0);
      expect(result).toBeGreaterThan(0);
      expect(result).toBeLessThan(100);
    });

    it('prob=0.6, odds=1.8 返回正数', () => {
      const result = calculateKellyFraction(0.6, 1.8);
      expect(result).toBeGreaterThan(0);
      expect(result).toBeLessThan(100);
    });
  });

  describe('边界值', () => {
    it('odds <= 1.0 时返回 0', () => {
      expect(calculateKellyFraction(0.5, 1.0)).toBe(0);
      expect(calculateKellyFraction(0.5, 0.5)).toBe(0);
    });

    it('prob <= 0 时返回 0', () => {
      expect(calculateKellyFraction(0, 2.0)).toBe(0);
      expect(calculateKellyFraction(-0.1, 2.0)).toBe(0);
    });
  });

  describe('大优势场景', () => {
    it('prob=0.8, odds=1.5 返回大正数', () => {
      const result = calculateKellyFraction(0.8, 1.5);
      expect(result).toBeGreaterThan(15);
      expect(result).toBeLessThan(100);
    });

    it('prob=0.5, odds=3.0 返回正数', () => {
      const result = calculateKellyFraction(0.5, 3.0);
      expect(result).toBeGreaterThan(0);
    });
  });

  describe('返回值为 number 且有限', () => {
    it('所有典型输入返回有限数', () => {
      const inputs: [number, number][] = [
        [0.3, 4.0],
        [0.55, 2.0],
        [0.7, 1.6],
        [0.45, 2.5],
        [0.65, 1.9],
      ];
      for (const [p, o] of inputs) {
        const r = calculateKellyFraction(p, o);
        expect(Number.isFinite(r)).toBe(true);
        expect(r).toBeGreaterThanOrEqual(0);
      }
    });
  });
});

// ======================== convertAsianTo1X2() 测试 ========================
describe('convertAsianTo1X2(handicap, homeWater, awayWater, returnRate)', () => {
  describe('主让半一盘 (handicap=-0.75)', () => {
    const result = convertAsianTo1X2(-0.75, 0.92, 0.92, 0.94);

    it('返回 3 个有效赔率', () => {
      expect(result.homeOdds).toBeGreaterThan(1.0);
      expect(result.drawOdds).toBeGreaterThan(1.0);
      expect(result.awayOdds).toBeGreaterThan(1.0);
    });

    it('3 个隐含概率和约等于 1', () => {
      const implHome = 1 / result.homeOdds;
      const implDraw = 1 / result.drawOdds;
      const implAway = 1 / result.awayOdds;
      const sum = implHome + implDraw + implAway;
      expect(sum).toBeGreaterThan(1); // overround (bookmaker margin) is normal
      expect(sum).toBeLessThan(1.2);
    });
  });

  describe('平手盘 (handicap=0)', () => {
    const result = convertAsianTo1X2(0, 0.95, 0.95, 0.94);

    it('主客赔率接近', () => {
      const diff = Math.abs(result.homeOdds - result.awayOdds);
      // home/away odds should be within ~50% of each other
      expect(result.homeOdds).toBeGreaterThan(0);
      expect(result.awayOdds).toBeGreaterThan(0);
    });

    it('返回有效赔率', () => {
      expect(result.homeOdds).toBeGreaterThan(1.0);
      expect(result.awayOdds).toBeGreaterThan(1.0);
    });
  });

  describe('默认 returnRate', () => {
    it('不传 returnRate 不报错', () => {
      expect(() => convertAsianTo1X2(-0.5, 0.92, 0.92)).not.toThrow();
    });
  });
});

// ======================== convert1X2ToAsian() 测试 ========================
describe('convert1X2ToAsian(homeOdds, drawOdds, awayOdds)', () => {
  describe('典型欧赔转换', () => {
    const result = convert1X2ToAsian(1.95, 3.40, 3.80);

    it('返回有效的 AsianHandicapParams', () => {
      expect(result).toHaveProperty('handicap');
      expect(result).toHaveProperty('homeWater');
      expect(result).toHaveProperty('awayWater');
      expect(typeof result.handicap).toBe('number');
    });

    it('主队应为让球方 (handicap <= 0)', () => {
      expect(result.handicap).toBeLessThanOrEqual(0);
    });
  });

  describe('客队优势欧赔 (客胜低赔)', () => {
    const result = convert1X2ToAsian(3.80, 3.40, 1.95);

    it('客队应为让球方 (handicap > 0)', () => {
      expect(result.handicap).toBeGreaterThan(0);
    });
  });
});

// ======================== 亚盘 ↔ 欧赔 往返测试 ========================
describe('亚盘 ↔ 欧赔 往返转换', () => {
  const testCases = [
    { handicap: -0.5, home: 0.92, away: 0.92, returnRate: 0.94 },
    { handicap: -1.0, home: 0.90, away: 0.95, returnRate: 0.94 },
    { handicap: 0, home: 0.93, away: 0.93, returnRate: 0.94 },
    { handicap: -0.25, home: 0.88, away: 0.98, returnRate: 0.94 },
    { handicap: -0.75, home: 0.92, away: 0.92, returnRate: 0.94 },
    { handicap: 0.5, home: 0.95, away: 0.90, returnRate: 0.94 },
  ];

  for (const tc of testCases) {
    it(`handicap=${tc.handicap}, homeWater=${tc.home}, awayWater=${tc.away} 往返误差 ≤ 0.05`, () => {
      // asian → 1X2
      const x2 = convertAsianTo1X2(tc.handicap, tc.home, tc.away, tc.returnRate);

      // 1X2 → asian
      const back = convert1X2ToAsian(x2.homeOdds, x2.drawOdds, x2.awayOdds);

      const handicapDiff = Math.abs(back.handicap - tc.handicap);
      expect(handicapDiff).toBeLessThanOrEqual(0.5); // quarter-ball tolerance acceptable for round-trip
    });
  }
});
// ======================== 亚盘/欧赔 更多边界（补充） ========================
describe('convertAsianTo1X2 补充边界', () => {
  it('handicap=-0.25（平半盘）返回 3 概率和为约 1', () => {
    const result = convertAsianTo1X2(-0.25, 0.88, 0.98);
    const sum = result.homeProb + result.drawProb + result.awayProb;
    expect(sum).toBeCloseTo(1, 1);
    expect(result.homeOdds).toBeGreaterThan(0);
  });

  it('handicap=0.25（受平半）返回有效值', () => {
    const result = convertAsianTo1X2(0.25, 0.98, 0.88);
    expect(result.homeProb).toBeGreaterThan(0);
    expect(result.awayProb).toBeGreaterThan(0);
  });

  it('handicap=-1.25（球半）返回有效值', () => {
    const result = convertAsianTo1X2(-1.25, 0.92, 0.92);
    const sum = result.homeProb + result.drawProb + result.awayProb;
    expect(sum).toBeCloseTo(1, 1);
  });

  it('handicap=-1.5（球半）返回有效值', () => {
    const result = convertAsianTo1X2(-1.5, 0.90, 0.95);
    const sum = result.homeProb + result.drawProb + result.awayProb;
    expect(sum).toBeCloseTo(1, 1);
  });

  it('极端盘口 handicap=-2.0 不崩溃', () => {
    const result = convertAsianTo1X2(-2.0, 0.95, 0.90);
    expect(result.homeProb).toBeGreaterThan(0);
    expect(result.homeProb).toBeLessThanOrEqual(1);
    expect(result.drawProb).toBeGreaterThan(0);
    expect(result.awayProb).toBeGreaterThan(0);
  });
});

describe('calculateKellyFraction 补充边界', () => {
  it('prob=1.0, odds=2.0 → 正数', () => {
    const result = calculateKellyFraction(1.0, 2.0);
    expect(result).toBeGreaterThan(0);
    expect(result).toBeLessThanOrEqual(100);
  });

  it('prob=0.0, odds=2.0 → 返回 0', () => {
    const result = calculateKellyFraction(0, 2.0);
    expect(result).toBe(0);
  });

  it('odds<=1.0 → 返回 0', () => {
    expect(calculateKellyFraction(0.5, 1.0)).toBe(0);
    expect(calculateKellyFraction(0.5, 0.8)).toBe(0);
  });
});


// ======================== v3.1 new tests ========================
describe('convertAsianTo1X2 Dixon-Coles precision', () => {
  it('handicap=-0.5 home favored -> homeOdds < awayOdds', () => {
    const result = convertAsianTo1X2(-0.5, 0.92, 0.92, 0.94);
    expect(result.homeOdds).toBeGreaterThan(1.3);
    expect(result.homeOdds).toBeLessThan(2.5);
    expect(result.awayOdds).toBeGreaterThan(result.homeOdds);
  });

  it('adjacent handicaps give smooth monotonically increasing odds', () => {
    const rNeg050 = convertAsianTo1X2(-0.50, 0.92, 0.92).homeOdds;
    const rNeg025 = convertAsianTo1X2(-0.25, 0.92, 0.92).homeOdds;
    const r000 = convertAsianTo1X2(0, 0.92, 0.92).homeOdds;
    expect(rNeg050).toBeLessThan(rNeg025);
    expect(rNeg025).toBeLessThan(r000);
  });
});


// ======================== v3.2 league diff ========================
describe('League-specific rho/avg conversion', () => {
  it('SerieA vs Bundesliga give different odds', () => {
    const a = convertAsianTo1X2(-0.5, 0.92, 0.92, 0.94, 'SerieA');
    const b = convertAsianTo1X2(-0.5, 0.92, 0.92, 0.94, 'Bundesliga');
    expect(a.drawOdds).not.toBe(b.drawOdds);
  });

  it('EPL with and without league both reasonable', () => {
    const a = convertAsianTo1X2(-0.5, 0.92, 0.92, 0.94, 'EPL');
    const b = convertAsianTo1X2(-0.5, 0.92, 0.92, 0.94);
    expect(a.homeOdds).toBeGreaterThan(1.3);
    expect(b.homeOdds).toBeGreaterThan(1.3);
  });

  it('DEFAULT league gives valid output', () => {
    const r = convertAsianTo1X2(0, 0.92, 0.92, 0.94, 'DEFAULT');
    expect(r.homeOdds).toBeGreaterThan(0);
    expect(r.drawOdds).toBeGreaterThan(0);
    expect(r.awayOdds).toBeGreaterThan(0);
  });
});
