import { describe, it, expect } from 'vitest';
import { getTeamElo, getOrInitElo, calculateEloUpdate, LEAGUE_ELO_BASE } from '../elo';
import { TeamStats } from '../../data/realTeamsData';
import mockTeams from '../../__tests__/fixtures/mockTeams.json';

// ======================== LEAGUE_ELO_BASE 测试 ========================
describe('LEAGUE_ELO_BASE', () => {
  it('英超基准为 1600', () => {
    expect(LEAGUE_ELO_BASE.EPL).toBe(1600);
  });
  it('西甲基准为 1570', () => {
    expect(LEAGUE_ELO_BASE.LaLiga).toBe(1570);
  });
  it('未知联赛返回 DEFAULT=1350', () => {
    expect(LEAGUE_ELO_BASE.UnknownLeague).toBeUndefined();
  });
});

// ======================== getOrInitElo() 测试 ========================
describe('getOrInitElo(teamName, league, rank)', () => {
  it('英超 rank=1 → 1600 + (10-1)*12 = 1708', () => {
    expect(getOrInitElo('test', 'EPL', 1)).toBe(1708);
  });

  it('英超 rank=10 → 1600 + (10-10)*12 = 1600', () => {
    expect(getOrInitElo('test', 'EPL', 10)).toBe(1600);
  });

  it('英超 rank=20 → 1600 + (10-20)*12 = 1480', () => {
    expect(getOrInitElo('test', 'EPL', 20)).toBe(1480);
  });

  it('西甲 rank=5 → 1570 + (10-5)*12 = 1630', () => {
    expect(getOrInitElo('test', 'LaLiga', 5)).toBe(1630);
  });

  it('未知联赛使用 DEFAULT=1350', () => {
    expect(getOrInitElo('test', 'UnknownLeague', 5)).toBe(1410);
  });

  it('默认 rank=10 时返回联赛基准', () => {
    expect(getOrInitElo('test', 'EPL')).toBe(1600);
  });
});

// ======================== calculateEloUpdate() 测试 ========================
describe('calculateEloUpdate(homeElo, awayElo, goalDiff, K)', () => {
  it('同实力主胜1球 → 主队涨分、客队掉分', () => {
    const { homeDelta, awayDelta } = calculateEloUpdate(1500, 1500, 1);
    expect(homeDelta).toBeGreaterThan(0);
    expect(awayDelta).toBeLessThan(0);
    expect(homeDelta + awayDelta).toBe(0);
  });

  it('同实力主胜3球 → 涨幅大于1球（净胜球加成）', () => {
    const d1 = calculateEloUpdate(1500, 1500, 1);
    const d3 = calculateEloUpdate(1500, 1500, 3);
    expect(Math.abs(d3.homeDelta)).toBeGreaterThan(Math.abs(d1.homeDelta));
  });

  it('同实力平局 → 主队因主场优势小幅掉分', () => {
    const { homeDelta, awayDelta } = calculateEloUpdate(1500, 1500, 0);
    // 同Elo但主场+100 → 预期主胜~64%，平局低于预期 → 主队掉分
    expect(homeDelta).toBeLessThan(0);
    expect(awayDelta).toBeGreaterThan(0);
    expect(homeDelta + awayDelta).toBe(0);
  });

  it('强队主场小胜弱队 → 涨幅较小', () => {
    const dSmall = calculateEloUpdate(1800, 1400, 1);
    const dBig = calculateEloUpdate(1800, 1400, 5);
    expect(Math.abs(dBig.homeDelta)).toBeGreaterThan(Math.abs(dSmall.homeDelta));
  });

  it('弱队客场逼平强队 → 弱队涨分', () => {
    const { homeDelta, awayDelta } = calculateEloUpdate(1800, 1400, 0);
    expect(homeDelta).toBeLessThan(0);
    expect(awayDelta).toBeGreaterThan(0);
  });

  it('K=40 时变化量为 K=20 的2倍', () => {
    const d20 = calculateEloUpdate(1500, 1500, 1, 20);
    const d40 = calculateEloUpdate(1500, 1500, 1, 40);
    // 四舍五入可能导致1分偏差，允许±1容差
    const expected = d20.homeDelta * 2;
    expect(Math.abs(d40.homeDelta - expected)).toBeLessThanOrEqual(1);
  });
});

// ======================== getTeamElo() 测试 ========================
describe('getTeamElo(team)', () => {
  const mancity = mockTeams.mancity as unknown as TeamStats;
  const unknownTeam = mockTeams.unknownTeam as unknown as TeamStats;
  const defaultTeam = mockTeams.defaultLeagueTeam as unknown as TeamStats;

  describe('优先读 team.elo', () => {
    it('team.elo=1900 时返回 1900', () => {
      const team = { ...mancity, elo: 1900 } as TeamStats;
      expect(getTeamElo(team)).toBe(1900);
    });

    it('team.elo=0 时回退到联赛基准', () => {
      const team = { ...mancity, elo: 0 } as TeamStats;
      // mancity: EPL rank=2 → 1600 + (10-2)*12 = 1696
      expect(getTeamElo(team)).toBe(1696);
    });
  });

  describe('无 elo 时联赛基准兜底', () => {
    it('mancity (EPL rank=2) → 1600 + (10-2)*12 = 1696', () => {
      expect(getTeamElo(mancity)).toBe(1696);
    });

    it('unknownTeam (EPL rank=5) → 1600 + (10-5)*12 = 1660', () => {
      expect(getTeamElo(unknownTeam)).toBe(1660);
    });
  });

  describe('防御性编程', () => {
    it('undefined team 不崩溃并返回合理值', () => {
      const result = getTeamElo(undefined as unknown as TeamStats);
      expect(typeof result).toBe('number');
      expect(result).toBeGreaterThan(1000);
    });

    it('空对象 team 不崩溃', () => {
      const result = getTeamElo({} as TeamStats);
      expect(typeof result).toBe('number');
    });

    it('未知联赛返回 DEFAULT', () => {
      const elo = getTeamElo(defaultTeam);
      // UnknownLeague + rank=10 → 1350 + 0 = 1350
      expect(elo).toBe(1350);
    });
  });
});
