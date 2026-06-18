import { describe, it, expect } from 'vitest';
import { calculateTimeDecay, calculateLeagueTimeDecay, LEAGUE_TIME_DECAY } from '../bayesian';

describe('calculateTimeDecay', () => {
  it('elapsed=0 => decay=1.0 (鍏ㄥ満姣旇禌鍓╀綑)', () => {
    expect(calculateTimeDecay(0, 90, 1.2)).toBeCloseTo(1.0, 5);
  });

  it('elapsed=45 => decay = pow(0.5, 1.2) 鈮?0.435', () => {
    const decay = calculateTimeDecay(45, 90, 1.2);
    expect(decay).toBeCloseTo(0.435, 2);
  });

  it('elapsed=80 => decay = pow(10/90, 1.2) 鈮?0.059 (vs linear 0.111)', () => {
    const decay = calculateTimeDecay(80, 90, 1.2);
    const linear = (90 - 80) / 90;
    expect(decay).toBeLessThan(linear); // 鏈琛板噺鏇存參
    expect(decay).toBeCloseTo(0.072, 2);
  });

  it('elapsed=90 => decay=0 (姣旇禌缁撴潫)', () => {
    expect(calculateTimeDecay(90, 90, 1.2)).toBe(0);
  });

  it('exponent=1.0 gives linear decay', () => {
    expect(calculateTimeDecay(45, 90, 1.0)).toBeCloseTo(0.5, 5);
  });

  it('exponent=1.4 at halftime => lower than exponent=1.0', () => {
    const d1 = calculateTimeDecay(45, 90, 1.0);
    const d4 = calculateTimeDecay(45, 90, 1.4);
    expect(d4).toBeLessThan(d1);
  });
});

describe('calculateLeagueTimeDecay', () => {
  it('EPL (1.2) vs Bundesliga (1.0) differ at halftime', () => {
    const epl = calculateLeagueTimeDecay(45, 'EPL');
    const bund = calculateLeagueTimeDecay(45, 'Bundesliga');
    // Bundesliga lower exponent => higher remaining ratio at halftime
    expect(bund).toBeGreaterThan(epl);
  });

  it('SerieA (1.4) most conservative', () => {
    const serieA = calculateLeagueTimeDecay(45, 'SerieA');
    const bund = calculateLeagueTimeDecay(45, 'Bundesliga');
    const epl = calculateLeagueTimeDecay(45, 'EPL');
    // SerieA has highest exponent => lowest remaining
    expect(serieA).toBeLessThan(bund);
    expect(serieA).toBeLessThan(epl);
  });

  it('unknown league uses DEFAULT=1.2', () => {
    const unknown = calculateLeagueTimeDecay(45, 'Unknown');
    const epl = calculateLeagueTimeDecay(45, 'EPL');
    expect(unknown).toBe(epl);
  });

  it('no league uses DEFAULT=1.2', () => {
    const noLeague = calculateLeagueTimeDecay(45);
    const epl = calculateLeagueTimeDecay(45, 'EPL');
    expect(noLeague).toBe(epl);
  });
});


// ======================== 边界保护测试（v3.1新增） ========================
describe('calculateTimeDecay 边界保护', () => {
  it('elapsedMinutes 为负数时截断为 0', () => {
    expect(calculateTimeDecay(-10, 90, 1.2)).toBeCloseTo(1.0, 5);
  });

  it('elapsedMinutes > totalMinutes 时截断为 totalMinutes', () => {
    expect(calculateTimeDecay(100, 90, 1.2)).toBe(0);
  });

  it('totalMinutes <= 0 时兜底为 90', () => {
    const decay = calculateTimeDecay(45, 0, 1.2);
    expect(decay).toBeCloseTo(0.435, 2);
  });

  it('totalMinutes 为负数时兜底为 90', () => {
    const decay = calculateTimeDecay(45, -10, 1.2);
    expect(decay).toBeCloseTo(0.435, 2);
  });

  it('exponent 为负数时截断为 0', () => {
    const decay = calculateTimeDecay(45, 90, -1);
    expect(decay).toBe(1); // pow(0.5, 0) = 1
  });

  it('exponent=0 时始终返回 1', () => {
    expect(calculateTimeDecay(45, 90, 0)).toBe(1);
  });
});describe('LEAGUE_TIME_DECAY', () => {
  it('Bundesliga lowest exponent (most goals late)', () => {
    expect(LEAGUE_TIME_DECAY.Bundesliga).toBe(1.0);
  });

  it('SerieA highest among major leagues', () => {
    const majors = ['EPL', 'LaLiga', 'Bundesliga', 'SerieA', 'Ligue1'];
    const values = majors.map(l => LEAGUE_TIME_DECAY[l]);
    expect(Math.max(...values)).toBe(LEAGUE_TIME_DECAY.SerieA);
  });

  it('DEFAULT = 1.2', () => {
    expect(LEAGUE_TIME_DECAY.DEFAULT).toBe(1.2);
  });
});
