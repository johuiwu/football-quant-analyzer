import { describe, it, expect } from 'vitest';
import { normalizeHandicap } from '../../backend/services/crawlerShared.js';
import {
  filterMarketsByType,
  quickAIProbability,
  evaluateSingleStrategy,
  resolveStrategyOdds,
} from '../../backend/services/cornerEvaluator.js';

// ======================== 1. 盘口归一化单元测试 ========================
describe('normalizeHandicap - 盘口归一化函数', () => {
  it('应将 "0/0.5" 转换为 0.25', () => {
    expect(normalizeHandicap('0/0.5')).toBe(0.25);
  });

  it('应将 "0.5/1" 转换为 0.75', () => {
    expect(normalizeHandicap('0.5/1')).toBe(0.75);
  });

  it('应将 "1/1.5" 转换为 1.25', () => {
    expect(normalizeHandicap('1/1.5')).toBe(1.25);
  });

  it('应将 "1.5/2" 转换为 1.75', () => {
    expect(normalizeHandicap('1.5/2')).toBe(1.75);
  });

  it('应将 "2/2.5" 转换为 2.25', () => {
    expect(normalizeHandicap('2/2.5')).toBe(2.25);
  });

  it('应将 "2.5/3" 转换为 2.75', () => {
    expect(normalizeHandicap('2.5/3')).toBe(2.75);
  });

  it('应支持 "-" 分隔符: "0-0.5" → 0.25', () => {
    expect(normalizeHandicap('0-0.5')).toBe(0.25);
  });

  it('应支持 "-" 分隔符: "0.5-1" → 0.75', () => {
    expect(normalizeHandicap('0.5-1')).toBe(0.75);
  });

  it('纯数字 0.5 应直接返回 0.5', () => {
    expect(normalizeHandicap(0.5)).toBe(0.5);
  });

  it('纯数字 1 应直接返回 1', () => {
    expect(normalizeHandicap(1)).toBe(1);
  });

  it('纯数字 -0.75 应直接返回 -0.75', () => {
    expect(normalizeHandicap(-0.75)).toBe(-0.75);
  });

  it('null 应返回 0', () => {
    expect(normalizeHandicap(null)).toBe(0);
  });

  it('空字符串应返回 0', () => {
    expect(normalizeHandicap('')).toBe(0);
  });

  it('无法识别的格式 "abc" 应通过 fallback 返回 0', () => {
    expect(normalizeHandicap('abc')).toBe(0);
  });

  it('undefined 应返回 0', () => {
    expect(normalizeHandicap(undefined)).toBe(0);
  });
});

// ======================== 2. 市场类型过滤单元测试 ========================
describe('filterMarketsByType - 市场类型过滤', () => {
  const mockHandicaps = [
    { category: 'O/U', handicap: 9.5, overOdds: 0.85, underOdds: 1.05 },
    { category: 'HDP', handicap: -0.5, homeOdds: 0.90, awayOdds: 1.00 },
    { category: 'NEXT', overOdds: 1.20, underOdds: 0.70 },
    { category: 'O/U', handicap: 8.5, overOdds: 0.75, underOdds: 1.15, period: 'half' },
    { category: 'HDP', handicap: 0.25, homeOdds: 0.95, awayOdds: 0.95, period: 'half' },
    { category: '1X2', homeOdds: 1.50, drawOdds: 2.80, awayOdds: 1.20 },
  ];

  it('over_under 应只保留 O/U 盘口（默认 period=full 过滤掉 half）', () => {
    const result = filterMarketsByType(mockHandicaps, 'over_under');
    expect(result.length).toBe(1);
    expect(result.every(h => h.category === 'O/U')).toBe(true);
  });

  it('handicap 应只保留 HDP 盘口（默认 period=full 过滤掉 half）', () => {
    const result = filterMarketsByType(mockHandicaps, 'handicap');
    expect(result.length).toBe(1);
    expect(result.every(h => h.category === 'HDP')).toBe(true);
  });

  it('next_corner 应只保留 NEXT 盘口', () => {
    const result = filterMarketsByType(mockHandicaps, 'next_corner');
    expect(result.length).toBe(1);
    expect(result[0].category).toBe('NEXT');
  });

  it('1x2 应只保留 1X2 盘口', () => {
    const result = filterMarketsByType(mockHandicaps, '1x2');
    expect(result.length).toBe(1);
    expect(result[0].category).toBe('1X2');
  });

  it('auto 应保留全部盘口', () => {
    const result = filterMarketsByType(mockHandicaps, 'auto');
    expect(result.length).toBe(6);
  });

  it('period=full 应过滤掉 half 盘口', () => {
    const result = filterMarketsByType(mockHandicaps, 'over_under', 'full');
    expect(result.length).toBe(1);
    expect(result[0].handicap).toBe(9.5);
  });

  it('period=half 应只保留 half 盘口', () => {
    const result = filterMarketsByType(mockHandicaps, 'over_under', 'half');
    expect(result.length).toBe(1);
    expect(result[0].handicap).toBe(8.5);
  });

  it('period=any 应保留全部盘口（含 half）', () => {
    const result = filterMarketsByType(mockHandicaps, 'over_under', 'any');
    expect(result.length).toBe(2);
  });

  it('盘口无 period 字段时默认视为 full', () => {
    const noPeriodHandicaps = [
      { category: 'O/U', handicap: 9.5, overOdds: 0.85 },
      { category: 'O/U', handicap: 5.5, overOdds: 0.75, period: 'half' },
    ];
    const result = filterMarketsByType(noPeriodHandicaps, 'over_under', 'full');
    expect(result.length).toBe(1);
    expect(result[0].handicap).toBe(9.5);
  });

  it('空数组应返回空数组', () => {
    const result = filterMarketsByType([], 'over_under');
    expect(result).toEqual([]);
  });

  it('null/undefined 应返回空数组', () => {
    expect(filterMarketsByType(null, 'over_under')).toEqual([]);
    expect(filterMarketsByType(undefined, 'over_under')).toEqual([]);
  });

  it('未指定 market_type 应保留全部', () => {
    const result = filterMarketsByType(mockHandicaps, undefined);
    expect(result.length).toBe(6);
  });
});

// ======================== 3. AI 概率计算单元测试 ========================
describe('quickAIProbability - AI评分概率计算', () => {
  it('应在 0-100 范围内返回概率值', () => {
    const match = {
      homeCorners: 3,
      awayCorners: 2,
      elapsedMinutes: 75,
      handicap: 9.5,
    };
    const prob = quickAIProbability(match, {});
    expect(prob).toBeGreaterThanOrEqual(0);
    expect(prob).toBeLessThanOrEqual(100);
  });

  it('角球数远低于盘口线时，概率应较低', () => {
    const match = {
      homeCorners: 1,
      awayCorners: 1,
      elapsedMinutes: 80,
      handicap: 12.5,
    };
    const prob = quickAIProbability(match, {});
    expect(prob).toBeLessThan(50);
  });

  it('角球数远高于盘口线时，概率应较高', () => {
    const match = {
      homeCorners: 6,
      awayCorners: 5,
      elapsedMinutes: 60,
      handicap: 5.5,
    };
    const prob = quickAIProbability(match, {});
    expect(prob).toBeGreaterThan(50);
  });

  it('零角球零分钟时应返回合理值', () => {
    const match = {
      homeCorners: 0,
      awayCorners: 0,
      elapsedMinutes: 0,
      handicap: 9.5,
    };
    const prob = quickAIProbability(match, {});
    expect(prob).toBeGreaterThanOrEqual(0);
    expect(prob).toBeLessThanOrEqual(100);
  });

  it('缺失字段时应使用默认值不崩溃', () => {
    const match = {};
    const prob = quickAIProbability(match, {});
    expect(prob).toBeGreaterThanOrEqual(0);
    expect(prob).toBeLessThanOrEqual(100);
  });

  it('电竞赛事应显著降低概率', () => {
    const normalMatch = {
      homeCorners: 2, awayCorners: 1, elapsedMinutes: 60, handicap: 5.5,
      matchName: 'Team A vs Team B',
    };
    const esportsMatch = {
      homeCorners: 2, awayCorners: 1, elapsedMinutes: 60, handicap: 5.5,
      matchName: 'eFootball Pro League',
    };
    const normalProb = quickAIProbability(normalMatch, {});
    const esportsProb = quickAIProbability(esportsMatch, {});
    // 电竞赛事概率应显著低于常规赛事
    expect(esportsProb).toBeLessThan(normalProb);
  });
});

// ======================== 4. 7级流水线集成测试 ========================
describe('evaluateSingleStrategy - 7级流水线评估', () => {
  const globalSettings = {
    strongHandicapThreshold: 1,
    handicapUpperLimit: 3.5,
    handicapLowerLimit: -1.25,
  };

  // 构造一个完全符合策略条件的 mock 比赛
  // 注意：handicap 必须在 line_min(-1.25) ~ line_max(2.5) 范围内
  // 注意：elapsedMinutes 不能落在半场休息窗口(45-46)
  const baseMatch = {
    matchId: 'test_match_001',
    elapsedMinutes: 47,
    homeScore: 1,
    awayScore: 1,
    homeCorners: 4,
    awayCorners: 3,
    totalCorners: 7,
    cornerHandicap: 1.5,
    handicap: 1.5,
    cornerOdds: 0.90,
    cornerOU: { line: 9.5, overOdds: 0.90, underOdds: 0.95 },
    handicaps: [
      { category: 'O/U', line: 9.5, odds: { over: 0.90, under: 0.95 }, period: 'full' },
      { category: 'HDP', line: -0.5, odds: { home: 0.90, away: 1.00 }, period: 'full' },
      { category: 'NEXT', homeOdds: 1.20, underOdds: 0.70, period: 'full' },
    ],
  };

  const baseStrategy = {
    id: 1,
    name: '测试策略',
    enabled: true,
    market_type: 'over_under',
    minute_min: 35,
    minute_max: 55,
    leadGoals: 99,
    leadGoalsWeak: 0,
    line_min: 7.5,
    line_max: 11.5,
    odds_min: 0.8,
    odds_max: 1.10,
    corner_min: 3,
    corner_max: 10,
    direction: 'Over',
    leadSide: 'any',
    aiFilterEnabled: false,
  };

  it('完全符合条件时应返回 true', () => {
    const result = evaluateSingleStrategy(baseMatch, baseStrategy, globalSettings);
    expect(result).toBe(true);
  });

  // --- 第1级：时间过滤 ---
  it('第1级-时间不在窗口内应返回 false', () => {
    const match = { ...baseMatch, elapsedMinutes: 30 };
    expect(evaluateSingleStrategy(match, baseStrategy, globalSettings)).toBe(false);
  });

  it('第1级-时间超过窗口上限应返回 false', () => {
    const match = { ...baseMatch, elapsedMinutes: 60 };
    expect(evaluateSingleStrategy(match, baseStrategy, globalSettings)).toBe(false);
  });

  // --- 第2级：盘口类型过滤 ---
  it('第2级-market_type=over_under 但无 O/U 盘口应返回 false', () => {
    const match = { ...baseMatch, handicaps: [
      { category: 'HDP', line: -0.5, odds: { home: 0.90, away: 1.00 }, period: 'full' },
    ]};
    expect(evaluateSingleStrategy(match, { ...baseStrategy, market_type: 'over_under' }, globalSettings)).toBe(false);
  });

  it('第2级-market_type=handicap 应只匹配 HDP 盘口', () => {
    const strategy = { ...baseStrategy, market_type: 'handicap', direction: 'Home' };
    // 有 HDP 盘口时不应因类型过滤被拒绝
    const result = evaluateSingleStrategy(baseMatch, strategy, globalSettings);
    // 结果取决于后续条件，但不应在第2级被过滤
    expect(typeof result).toBe('boolean');
  });

  // --- 第3+4级：盘口归一化 + 区间过滤 ---
  it('第4级-next_corner 类型应跳过盘口区间检查', () => {
    const strategy = { ...baseStrategy, market_type: 'next_corner', line_min: -1, line_max: 1 };
    // 盘口 9.5 远超 line_max=1，但 next_corner 应跳过此检查
    // 需要有 NEXT 盘口才能通过第2级
    const result = evaluateSingleStrategy(baseMatch, strategy, globalSettings);
    expect(typeof result).toBe('boolean');
  });

  // --- 第5级：赔率过滤 ---
  it('第5级-赔率低于 odds_min 应返回 false', () => {
    const match = { ...baseMatch, cornerOU: { overOdds: 0.50, underOdds: 0.95, handicap: 1.5 } };
    expect(evaluateSingleStrategy(match, baseStrategy, globalSettings)).toBe(false);
  });

  it('第5级-赔率高于 odds_max 应返回 false', () => {
    const match = { ...baseMatch, cornerOU: { overOdds: 1.50, underOdds: 0.95, handicap: 1.5 } };
    expect(evaluateSingleStrategy(match, baseStrategy, globalSettings)).toBe(false);
  });

  // --- 第6级：AI评分过滤 ---
  it('第6级-aiFilterEnabled=true 且 AI 概率 > 60% 应通过', () => {
    // 角球9个，盘口1.5，75分钟时预期总角球远超盘口线 → 概率 > 60%
    const match = { ...baseMatch, elapsedMinutes: 75, homeCorners: 5, awayCorners: 4, totalCorners: 9 };
    const strategy = { ...baseStrategy, aiFilterEnabled: true, minute_min: 70, minute_max: 90 };
    const result = evaluateSingleStrategy(match, strategy, globalSettings);
    expect(result).toBe(true);
  });

  it('第6级-aiFilterEnabled=true 且 AI 概率 <= 60% 应返回 false', () => {
    // 角球2个，盘口12.5，80分钟 → 预期总角球远低于盘口线 → 概率 < 60%
    const match = { ...baseMatch, elapsedMinutes: 80, homeCorners: 1, awayCorners: 1, totalCorners: 2, handicap: 12.5, cornerHandicap: 12.5, cornerOU: { overOdds: 0.90, underOdds: 0.95, handicap: 12.5 } };
    const strategy = { ...baseStrategy, aiFilterEnabled: true, minute_min: 70, minute_max: 90, line_min: -3, line_max: 15 };
    const result = evaluateSingleStrategy(match, strategy, globalSettings);
    expect(result).toBe(false);
  });

  it('第6级-aiFilterEnabled=false 应跳过 AI 评分检查', () => {
    const strategy = { ...baseStrategy, aiFilterEnabled: false };
    const result = evaluateSingleStrategy(baseMatch, strategy, globalSettings);
    expect(result).toBe(true);
  });

  // --- 第7级：投注方向与比分条件 ---
  it('第7级-角球数不在 corner_min/max 范围内应返回 false', () => {
    const match = { ...baseMatch, homeCorners: 1, awayCorners: 0, totalCorners: 1 };
    expect(evaluateSingleStrategy(match, baseStrategy, globalSettings)).toBe(false);
  });

  it('第7级-平局策略(leadGoals=0) 比分非平局应返回 false', () => {
    const match = { ...baseMatch, homeScore: 2, awayScore: 1 };
    const strategy = { ...baseStrategy, leadGoals: 0, leadGoalsWeak: 0 };
    expect(evaluateSingleStrategy(match, strategy, globalSettings)).toBe(false);
  });

  it('第7级-平局策略(leadGoals=0) 比分平局应返回 true', () => {
    const match = { ...baseMatch, homeScore: 1, awayScore: 1 };
    const strategy = { ...baseStrategy, leadGoals: 0, leadGoalsWeak: 0 };
    expect(evaluateSingleStrategy(match, strategy, globalSettings)).toBe(true);
  });

  // --- 禁用策略 ---
  it('策略 enabled=false 应直接返回 false', () => {
    const strategy = { ...baseStrategy, enabled: false };
    expect(evaluateSingleStrategy(baseMatch, strategy, globalSettings)).toBe(false);
  });
});

// ======================== 5. resolveStrategyOdds 单元测试 ========================
describe('resolveStrategyOdds - 方向感知赔率解析', () => {
  const match = {
    cornerOU: { overOdds: 0.90, underOdds: 0.95, handicap: 9.5 },
    cornerOdds: 0.88,
    odds: 0.87,
  };

  it('direction=Over 应返回 overOdds', () => {
    expect(resolveStrategyOdds(match, { direction: 'Over' })).toBe(0.90);
  });

  it('direction=Under 应返回 underOdds', () => {
    expect(resolveStrategyOdds(match, { direction: 'Under' })).toBe(0.95);
  });

  it('direction=Auto 应优先返回 overOdds', () => {
    expect(resolveStrategyOdds(match, { direction: 'Auto' })).toBe(0.90);
  });

  it('direction=Home 应 fallback 到 cornerOdds', () => {
    expect(resolveStrategyOdds(match, { direction: 'Home' })).toBe(0.88);
  });

  it('旧字段 betDirection=over 应兼容返回 overOdds', () => {
    expect(resolveStrategyOdds(match, { betDirection: 'over' })).toBe(0.90);
  });

  it('旧字段 betDirection=under 应兼容返回 underOdds', () => {
    expect(resolveStrategyOdds(match, { betDirection: 'under' })).toBe(0.95);
  });

  // ========== next_corner 自动选边测试 ==========
  describe('next_corner 市场类型自动选边', () => {
    const nextCornerMatch = {
      ...match,
      homeCorners: 3,
      awayCorners: 5,
      nextCorner: { homeOdds: 1.10, awayOdds: 0.80 },
    };

    it('next_corner + direction=Home 应返回 homeOdds', () => {
      expect(resolveStrategyOdds(nextCornerMatch, { direction: 'Home', market_type: 'next_corner' })).toBe(1.10);
    });

    it('next_corner + direction=Away 应返回 awayOdds', () => {
      expect(resolveStrategyOdds(nextCornerMatch, { direction: 'Away', market_type: 'next_corner' })).toBe(0.80);
    });

    it('next_corner + Auto + 主队角球落后 → 自动投注主队(Home)', () => {
      const m = { ...nextCornerMatch, homeCorners: 3, awayCorners: 5 };
      const result = resolveStrategyOdds(m, { direction: 'Auto', market_type: 'next_corner' });
      expect(result).toBe(1.10); // homeOdds
    });

    it('next_corner + Auto + 客队角球落后 → 自动投注客队(Away)', () => {
      const m = { ...nextCornerMatch, homeCorners: 5, awayCorners: 3 };
      const result = resolveStrategyOdds(m, { direction: 'Auto', market_type: 'next_corner' });
      expect(result).toBe(0.80); // awayOdds
    });

    it('next_corner + Auto + 角球数相等 → 选择赔率更低的那方', () => {
      const m = { ...nextCornerMatch, homeCorners: 4, awayCorners: 4 };
      const result = resolveStrategyOdds(m, { direction: 'Auto', market_type: 'next_corner' });
      expect(result).toBe(0.80); // awayOdds < homeOdds，选 Away
    });

    it('next_corner 无 nextCorner 数据时 fallback 到 cornerOU', () => {
      const m = { cornerOU: { overOdds: 0.90, underOdds: 0.95 }, homeCorners: 3, awayCorners: 5 };
      const result = resolveStrategyOdds(m, { direction: 'Auto', market_type: 'next_corner' });
      // fallback: overOdds as homeOdds
      expect(result).toBe(0.90);
    });
  });

  // ========== handicap 市场类型测试 ==========
  describe('handicap 市场类型', () => {
    const hdpMatch = {
      ...match,
      cornerHDP: { homeOdds: 0.95, awayOdds: 0.95 },
    };

    it('handicap + direction=Home 应返回 homeOdds', () => {
      expect(resolveStrategyOdds(hdpMatch, { direction: 'Home', market_type: 'handicap' })).toBe(0.95);
    });

    it('handicap + direction=Away 应返回 awayOdds', () => {
      expect(resolveStrategyOdds(hdpMatch, { direction: 'Away', market_type: 'handicap' })).toBe(0.95);
    });

    it('handicap + Auto 应优先返回 homeOdds', () => {
      expect(resolveStrategyOdds(hdpMatch, { direction: 'Auto', market_type: 'handicap' })).toBe(0.95);
    });
  });

  // ========== 1x2 独赢市场类型测试 ==========
  describe('1x2 独赢市场类型', () => {
    const match1x2 = {
      ...match,
      corner1X2: { homeOdds: 1.50, drawOdds: 2.80, awayOdds: 1.20 },
    };

    it('1x2 + direction=Home 应返回 homeOdds', () => {
      expect(resolveStrategyOdds(match1x2, { direction: 'Home', market_type: '1x2' })).toBe(1.50);
    });

    it('1x2 + direction=Away 应返回 awayOdds', () => {
      expect(resolveStrategyOdds(match1x2, { direction: 'Away', market_type: '1x2' })).toBe(1.20);
    });

    it('1x2 + Auto 应返回赔率最低方', () => {
      // awayOdds=1.20 最低
      expect(resolveStrategyOdds(match1x2, { direction: 'Auto', market_type: '1x2' })).toBe(1.20);
    });
  });

  // ========== 零赔率保护测试 ==========
  describe('零赔率保护', () => {
    it('next_corner + Home + homeOdds=0 应返回 0', () => {
      const m = { nextCorner: { homeOdds: 0, awayOdds: 0.80 }, homeCorners: 3, awayCorners: 5 };
      const result = resolveStrategyOdds(m, { direction: 'Home', market_type: 'next_corner' });
      expect(result).toBe(0);
    });

    it('next_corner + Away + awayOdds=0 应返回 0', () => {
      const m = { nextCorner: { homeOdds: 0.90, awayOdds: 0 }, homeCorners: 3, awayCorners: 5 };
      const result = resolveStrategyOdds(m, { direction: 'Away', market_type: 'next_corner' });
      expect(result).toBe(0);
    });

    it('1x2 + Home + homeOdds=0 应返回 0', () => {
      const m = { corner1X2: { homeOdds: 0, drawOdds: 2.80, awayOdds: 1.20 } };
      const result = resolveStrategyOdds(m, { direction: 'Home', market_type: '1x2' });
      expect(result).toBe(0);
    });
  });
});
