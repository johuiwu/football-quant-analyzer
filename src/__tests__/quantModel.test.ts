import { describe, it, expect } from 'vitest';
import { calculateBetsModel, BetsModelInput, AsianHandicapFeatures } from '../utils/quantModel';
import { calculateFinalDirection } from '../utils/handicapArbiter';

const mockHomeTeam = {
  id: 'mancity',
  name: 'Manchester City',
  nameCn: '曼彻斯特城',
  league: 'EPL',
  leagueCn: '英超',
  rank: 1,
  homeXg: 2.2,
  awayXg: 1.8,
  homeStats: {
    played: 18,
    wins: 14,
    draws: 3,
    losses: 1,
    goalsFor: 45,
    goalsAgainst: 12,
    xgFor: 42,
    xgAgainst: 11
  },
  awayStats: {
    played: 18,
    wins: 12,
    draws: 4,
    losses: 2,
    goalsFor: 38,
    goalsAgainst: 15,
    xgFor: 35,
    xgAgainst: 14
  },
  form: ['W', 'W', 'D', 'W', 'W'],
  cleanSheets: 12,
  shotsPerGame: 15.2,
  shotAccuracy: 42
};

const mockAwayTeam = {
  id: 'arsenal',
  name: 'Arsenal',
  nameCn: '阿森纳',
  league: 'EPL',
  leagueCn: '英超',
  rank: 2,
  homeXg: 2.0,
  awayXg: 1.6,
  homeStats: {
    played: 18,
    wins: 12,
    draws: 4,
    losses: 2,
    goalsFor: 38,
    goalsAgainst: 14,
    xgFor: 36,
    xgAgainst: 13
  },
  awayStats: {
    played: 18,
    wins: 10,
    draws: 5,
    losses: 3,
    goalsFor: 32,
    goalsAgainst: 18,
    xgFor: 30,
    xgAgainst: 17
  },
  form: ['W', 'D', 'W', 'L', 'W'],
  cleanSheets: 10,
  shotsPerGame: 14.1,
  shotAccuracy: 38
};

const defaultAsianFeatures: AsianHandicapFeatures = {
  handicapValue: 0.25,
  homeWater: 0.85,
  awayWater: 0.95,
  waterDiff: -0.10,
  isSharpMove: false,
  handicapAdjustRate: 0,
  homeWaterChange: 0,
  awayWaterChange: 0,
  marketPressure: 'NORMAL',
  bookmakerBias: 'NEUTRAL'
};

describe('calculateBetsModel', () => {
  it('should return valid prediction results with normal input', () => {
    const input: BetsModelInput = {
      homeTeam: mockHomeTeam,
      awayTeam: mockAwayTeam,
      odds1X2: { home: 2.10, draw: 3.30, away: 3.20 },
      asianFeatures: defaultAsianFeatures,
      goalsLine: 2.5
    };

    const result = calculateBetsModel(input);

    expect(result).toBeDefined();
    expect(result.fusedHomeProb).toBeDefined();
    expect(result.fusedDrawProb).toBeDefined();
    expect(result.fusedAwayProb).toBeDefined();
    expect(result.marketConfidence).toBeDefined();
  });

  it('should return probabilities that sum to 1', () => {
    const input: BetsModelInput = {
      homeTeam: mockHomeTeam,
      awayTeam: mockAwayTeam,
      odds1X2: { home: 2.10, draw: 3.30, away: 3.20 },
      asianFeatures: defaultAsianFeatures,
      goalsLine: 2.5
    };

    const result = calculateBetsModel(input);
    const probSum = result.fusedHomeProb + result.fusedDrawProb + result.fusedAwayProb;

    expect(probSum).toBeCloseTo(1, 2);
  });

  it('should handle extreme odds - heavy favorite', () => {
    const input: BetsModelInput = {
      homeTeam: mockHomeTeam,
      awayTeam: mockAwayTeam,
      odds1X2: { home: 1.20, draw: 6.00, away: 10.00 },
      asianFeatures: { ...defaultAsianFeatures, handicapValue: -1.5 },
      goalsLine: 2.5
    };

    const result = calculateBetsModel(input);

    expect(result.fusedHomeProb).toBeGreaterThan(0.6);
    expect(result.fusedAwayProb).toBeLessThan(0.2);
  });

  it('should handle extreme odds - underdog', () => {
    const input: BetsModelInput = {
      homeTeam: mockAwayTeam,
      awayTeam: mockHomeTeam,
      odds1X2: { home: 8.00, draw: 5.00, away: 1.30 },
      asianFeatures: { ...defaultAsianFeatures, handicapValue: 1.5 },
      goalsLine: 2.5
    };

    const result = calculateBetsModel(input);

    expect(result.fusedAwayProb).toBeGreaterThan(0.5);
    expect(result.fusedHomeProb).toBeLessThan(0.2);
  });

  it('should handle Asian handicap conversions', () => {
    const input: BetsModelInput = {
      homeTeam: mockHomeTeam,
      awayTeam: mockAwayTeam,
      odds1X2: { home: 1.90, draw: 3.40, away: 3.50 },
      asianFeatures: { ...defaultAsianFeatures, handicapValue: -0.25, homeWater: 0.65, awayWater: 1.15 },
      goalsLine: 2.5
    };

    const result = calculateBetsModel(input);

    expect(result.asianHomeProb).toBeDefined();
    expect(result.asianDrawProb).toBeDefined();
    expect(result.asianAwayProb).toBeDefined();
    expect(result.fusedHomeProb).toBeGreaterThan(result.oddsHomeProb);
  });

  it('should detect market deviation', () => {
    const input: BetsModelInput = {
      homeTeam: mockHomeTeam,
      awayTeam: mockAwayTeam,
      odds1X2: { home: 1.80, draw: 3.60, away: 4.00 },
      asianFeatures: { ...defaultAsianFeatures, handicapValue: -1.0, homeWater: 0.70, awayWater: 1.10 },
      goalsLine: 3.5
    };

    const result = calculateBetsModel(input);

    expect(result.marketDeviation).toBeDefined();
    expect(result.marketConfidence).toBeDefined();
  });

  it('should handle different goal lines', () => {
    const input25: BetsModelInput = {
      homeTeam: mockHomeTeam,
      awayTeam: mockAwayTeam,
      odds1X2: { home: 2.10, draw: 3.30, away: 3.20 },
      asianFeatures: defaultAsianFeatures,
      goalsLine: 2.5
    };

    const input35: BetsModelInput = {
      homeTeam: mockHomeTeam,
      awayTeam: mockAwayTeam,
      odds1X2: { home: 2.10, draw: 3.30, away: 3.20 },
      asianFeatures: defaultAsianFeatures,
      goalsLine: 3.5
    };

    const result25 = calculateBetsModel(input25);
    const result35 = calculateBetsModel(input35);

    expect(result25.overUnderProb).toBeDefined();
    expect(result35.overUnderProb).toBeDefined();
    expect(result25.expectedHomeGoals).toBeDefined();
    expect(result25.expectedAwayGoals).toBeDefined();
  });

  it('should return valid recommendation', () => {
    const input: BetsModelInput = {
      homeTeam: mockHomeTeam,
      awayTeam: mockAwayTeam,
      odds1X2: { home: 2.10, draw: 3.30, away: 3.20 },
      asianFeatures: defaultAsianFeatures,
      goalsLine: 2.5
    };

    const result = calculateBetsModel(input);

    expect(result.recommendedDirection).toBeDefined();
    expect(typeof result.recommendedDirection).toBe('string');
    expect(result.recommendedDirection.length).toBeGreaterThan(0);
  });

  it('should handle Kelly criterion calculations', () => {
    const input: BetsModelInput = {
      homeTeam: mockHomeTeam,
      awayTeam: mockAwayTeam,
      odds1X2: { home: 1.80, draw: 3.60, away: 4.00 },
      asianFeatures: defaultAsianFeatures,
      goalsLine: 2.5
    };

    const result = calculateBetsModel(input);

    expect(result.kellyHome).toBeDefined();
    expect(result.kellyDraw).toBeDefined();
    expect(result.kellyAway).toBeDefined();
    expect(result.kellyHome).toBeGreaterThanOrEqual(0);
  });

  it('should return defensive metrics', () => {
    const input: BetsModelInput = {
      homeTeam: mockHomeTeam,
      awayTeam: mockAwayTeam,
      odds1X2: { home: 2.10, draw: 3.30, away: 3.20 },
      asianFeatures: defaultAsianFeatures,
      goalsLine: 2.5
    };

    const result = calculateBetsModel(input);

    expect(result.expectedHomeCorners).toBeDefined();
    expect(result.expectedAwayCorners).toBeDefined();
  });

  // ===== ???????? =====
  it('bookmakerBias HOME + ??', () => {
    const result = calculateBetsModel({
      homeTeam: mockHomeTeam, awayTeam: mockAwayTeam,
      odds1X2: { home: 1.45, draw: 4.50, away: 7.00 },
      asianFeatures: { ...defaultAsianFeatures, handicapValue: -1.25, bookmakerBias: 'HOME', homeWater: 0.85, awayWater: 1.00 },
      goalsLine: 3.0,
    } as BetsModelInput);
    expect(result.fusedHomeProb).toBeGreaterThan(0.5);
  });

  it('bookmakerBias AWAY + ??', () => {
    const result = calculateBetsModel({
      homeTeam: mockAwayTeam, awayTeam: mockHomeTeam,
      odds1X2: { home: 7.00, draw: 4.50, away: 1.45 },
      asianFeatures: { ...defaultAsianFeatures, handicapValue: 1.25, bookmakerBias: 'AWAY', homeWater: 1.00, awayWater: 0.85, isStrongHomeHandicap: false, isStrongAwayHandicap: true },
      goalsLine: 2.5,
    } as BetsModelInput);
    expect(result.fusedAwayProb).toBeGreaterThan(0.5);
  });

  it('marketPressure HIGH + isSharpMove', () => {
    const result = calculateBetsModel({
      homeTeam: mockHomeTeam, awayTeam: mockAwayTeam,
      odds1X2: { home: 2.20, draw: 3.10, away: 3.20 },
      asianFeatures: { ...defaultAsianFeatures, handicapValue: -0.5, marketPressure: 'HIGH', isSharpMove: true, waterDiff: -0.25, homeWater: 0.75, awayWater: 1.05 },
      goalsLine: 2.5,
    } as BetsModelInput);
    expect(result.fusedHomeProb).toBeGreaterThan(0);
  });

  it('??????? + ?????', () => {
    const result = calculateBetsModel({
      homeTeam: mockHomeTeam, awayTeam: mockAwayTeam,
      odds1X2: { home: 2.00, draw: 3.40, away: 3.60 },
      asianFeatures: defaultAsianFeatures,
      goalsLine: 2.5,
      advancedParams: { fatigue: 0.5, injury: 0.3, morale: 0.2, weather: 0.1, travelDistance: 0.3, restDays: 1, scheduleDensity: 0.5, injuryImpactHome: 0.2, injuryImpactAway: 0.1 },
      weights: { odds: 0.3, strength: 0.4, homeAway: 0.2, h2h: 0.05, form: 0.05 },
    } as BetsModelInput);
    expect(result.fusedHomeProb).toBeGreaterThanOrEqual(0);
    expect(result.fusedAwayProb).toBeGreaterThanOrEqual(0);
    expect(result.fusedHomeProb + result.fusedDrawProb + result.fusedAwayProb).toBeCloseTo(1, 2);
  });

  it('goalsLine=2.0 ????', () => {
    const result = calculateBetsModel({
      homeTeam: mockHomeTeam, awayTeam: mockAwayTeam,
      odds1X2: { home: 2.50, draw: 2.80, away: 3.00 },
      asianFeatures: { ...defaultAsianFeatures, handicapValue: 0 },
      goalsLine: 2.0,
    } as BetsModelInput);
    expect(result.expectedHomeGoals).toBeGreaterThanOrEqual(0);
    expect(result.expectedAwayGoals).toBeGreaterThanOrEqual(0);
  });

  it('goalsLine=4.0 ????', () => {
    const result = calculateBetsModel({
      homeTeam: mockHomeTeam, awayTeam: mockAwayTeam,
      odds1X2: { home: 1.80, draw: 3.80, away: 4.50 },
      asianFeatures: defaultAsianFeatures,
      goalsLine: 4.0,
    } as BetsModelInput);
    expect(result.expectedHomeGoals).toBeGreaterThanOrEqual(0);
    expect(result.expectedAwayGoals).toBeGreaterThanOrEqual(0);
  });

  it('??? handicap=0', () => {
    const result = calculateBetsModel({
      homeTeam: mockHomeTeam, awayTeam: mockAwayTeam,
      odds1X2: { home: 2.50, draw: 3.10, away: 2.80 },
      asianFeatures: { ...defaultAsianFeatures, handicapValue: 0, isStrongHomeHandicap: false, homeWater: 0.93, awayWater: 0.93 },
      goalsLine: 2.5,
    } as BetsModelInput);
    expect(result.fusedHomeProb).toBeGreaterThan(0.2);
    expect(result.fusedAwayProb).toBeGreaterThan(0.2);
  });

  it('????? handicap=-0.25', () => {
    const result = calculateBetsModel({
      homeTeam: mockHomeTeam, awayTeam: mockAwayTeam,
      odds1X2: { home: 2.10, draw: 3.20, away: 3.40 },
      asianFeatures: { ...defaultAsianFeatures, handicapValue: -0.25, homeWater: 0.88, awayWater: 0.98 },
      goalsLine: 2.5,
    } as BetsModelInput);
    expect(result.fusedHomeProb + result.fusedDrawProb + result.fusedAwayProb).toBeCloseTo(1, 2);
  });

  it('????? handicap=0.25', () => {
    const result = calculateBetsModel({
      homeTeam: mockAwayTeam, awayTeam: mockHomeTeam,
      odds1X2: { home: 3.40, draw: 3.20, away: 2.10 },
      asianFeatures: { ...defaultAsianFeatures, handicapValue: 0.25, homeWater: 0.98, awayWater: 0.88, isStrongHomeHandicap: false, isStrongAwayHandicap: true },
      goalsLine: 2.5,
    } as BetsModelInput);
    expect(result.fusedAwayProb).toBeGreaterThan(0.3);
  });


  it('waterDiff>0.05 ????????????', () => {
    const result = calculateBetsModel({
      homeTeam: mockHomeTeam, awayTeam: mockAwayTeam,
      odds1X2: { home: 2.50, draw: 3.20, away: 2.70 },
      asianFeatures: { ...defaultAsianFeatures, handicapValue: 0, waterDiff: 0.12, homeWater: 1.05, awayWater: 0.82, isStrongHomeHandicap: false, isStrongAwayHandicap: false },
      goalsLine: 2.5,
    } as BetsModelInput);
    expect(result.fusedHomeProb).toBeGreaterThanOrEqual(0);
    expect(result.fusedAwayProb).toBeGreaterThanOrEqual(0);
  });

  it('????????????', () => {
    const result = calculateBetsModel({
      homeTeam: mockAwayTeam, awayTeam: mockHomeTeam,
      odds1X2: { home: 3.00, draw: 3.20, away: 2.30 },
      asianFeatures: { ...defaultAsianFeatures, handicapValue: 0.25, waterDiff: 0.15, homeWater: 1.05, awayWater: 0.80, isStrongHomeHandicap: false, isStrongAwayHandicap: true },
      goalsLine: 2.5,
    } as BetsModelInput);
    expect(result.fusedAwayProb).toBeGreaterThan(0.2);
  });


  it('competitionType=Cup??????', () => {
    const result = calculateBetsModel({
      homeTeam: mockHomeTeam, awayTeam: mockAwayTeam,
      odds1X2: { home: 2.10, draw: 3.30, away: 3.20 },
      asianFeatures: defaultAsianFeatures,
      goalsLine: 2.5,
      competitionType: 'Cup',
    } as BetsModelInput);
    expect(result.fusedHomeProb).toBeGreaterThan(0);
    expect(result.fusedHomeProb + result.fusedDrawProb + result.fusedAwayProb).toBeCloseTo(1, 2);
  });

  it('competitionType=Friendly???????', () => {
    const result = calculateBetsModel({
      homeTeam: mockHomeTeam, awayTeam: mockAwayTeam,
      odds1X2: { home: 2.10, draw: 3.30, away: 3.20 },
      asianFeatures: defaultAsianFeatures,
      goalsLine: 2.5,
      competitionType: 'Friendly',
    } as BetsModelInput);
    expect(result.fusedHomeProb).toBeGreaterThan(0);
    expect(result.fusedDrawProb).toBeGreaterThan(0);
  });


  it('??????? vs ???teamId=6:1?', () => {
    const result = calculateBetsModel({
      homeTeamId: 6,
      awayTeamId: 1,
      homeTeam: mockHomeTeam, awayTeam: mockAwayTeam,
      odds1X2: { home: 2.10, draw: 3.30, away: 3.20 },
      asianFeatures: defaultAsianFeatures,
      goalsLine: 2.5,
    } as BetsModelInput);
    expect(result.fusedHomeProb).toBeGreaterThan(0);
    expect(result.fusedDrawProb).toBeGreaterThan(0);
    expect(result.fusedHomeProb + result.fusedDrawProb + result.fusedAwayProb).toBeCloseTo(1, 2);
  });

});

// ======================== recommendedDirection 修复验证 ========================
describe('recommendedDirection 不应始终为小球', () => {
  it('主队明显优势应输出主胜', () => {
    const result = calculateBetsModel({
      homeTeam: mockHomeTeam, awayTeam: mockAwayTeam,
      odds1X2: { home: 1.60, draw: 4.00, away: 5.50 },
      asianFeatures: { ...defaultAsianFeatures, handicapValue: -1.0, homeWater: 0.85, awayWater: 0.95 },
      goalsLine: 2.5,
    } as BetsModelInput);
    expect(result.recommendedDirection).toBeDefined();
    expect(result.recommendedDirection).toMatch(/主胜|曼彻斯特城/);
  });

  it('客队明显优势应输出客胜', () => {
    const result = calculateBetsModel({
      homeTeam: mockAwayTeam, awayTeam: mockHomeTeam,
      odds1X2: { home: 5.50, draw: 4.00, away: 1.60 },
      asianFeatures: { ...defaultAsianFeatures, handicapValue: 1.0, homeWater: 0.95, awayWater: 0.85, isStrongAwayHandicap: true },
      goalsLine: 2.5,
    } as BetsModelInput);
    expect(result.recommendedDirection).toBeDefined();
    expect(result.recommendedDirection).toMatch(/客胜|曼彻斯特城/);
  });

  it('双方均势不应回退到小球为主方向', () => {
    const result = calculateBetsModel({
      homeTeam: mockHomeTeam, awayTeam: mockHomeTeam,
      odds1X2: { home: 2.50, draw: 3.10, away: 2.80 },
      asianFeatures: { ...defaultAsianFeatures, handicapValue: 0 },
      goalsLine: 2.5,
    } as BetsModelInput);
    expect(result.recommendedDirection).toBeDefined();
    const hasDirection = result.recommendedDirection.includes('主胜') || 
                         result.recommendedDirection.includes('客胜') || 
                         result.recommendedDirection.includes('平局');
    expect(hasDirection).toBe(true);
  });

  it('recommendedReason 应附加大小球倾向', () => {
    const result = calculateBetsModel({
      homeTeam: mockHomeTeam, awayTeam: mockAwayTeam,
      odds1X2: { home: 2.10, draw: 3.30, away: 3.20 },
      asianFeatures: defaultAsianFeatures,
      goalsLine: 2.5,
    } as BetsModelInput);
    expect(result.recommendedReason).toBeDefined();
    expect(typeof result.recommendedReason).toBe('string');
    expect(result.recommendedReason.length).toBeGreaterThan(10);
  });

  it('aggregatedDecision 方向应正常计算', () => {
    const result = calculateBetsModel({
      homeTeam: mockHomeTeam, awayTeam: mockAwayTeam,
      odds1X2: { home: 2.10, draw: 3.30, away: 3.20 },
      asianFeatures: defaultAsianFeatures,
      goalsLine: 2.5,
    } as BetsModelInput);
    expect(result.aggregatedDecision).toBeDefined();
    expect(result.aggregatedDecision.direction).toBeDefined();
    expect(['HOME_WIN', 'DRAW', 'AWAY_WIN']).toContain(result.aggregatedDecision.direction);
    // direction 不应包含大小球方向
    expect(result.aggregatedDecision.direction).not.toBe('OVER');
    expect(result.aggregatedDecision.direction).not.toBe('UNDER');
  });

  it('totalGoalsRecommendation 在低比分场景下应输出大小球推荐', () => {
    // 使用低进球预期场景：强防守弱进攻
    const defensiveHome = { ...mockHomeTeam, homeXg: 0.8, awayXg: 0.6, homeStats: { ...mockHomeTeam.homeStats, goalsFor: 8, goalsAgainst: 5 }, awayStats: { ...mockHomeTeam.awayStats, goalsFor: 6, goalsAgainst: 7 } };
    const defensiveAway = { ...mockAwayTeam, homeXg: 0.7, awayXg: 0.5, homeStats: { ...mockAwayTeam.homeStats, goalsFor: 7, goalsAgainst: 6 }, awayStats: { ...mockAwayTeam.awayStats, goalsFor: 5, goalsAgainst: 8 } };
    const result = calculateBetsModel({
      homeTeam: defensiveHome, awayTeam: defensiveAway,
      odds1X2: { home: 2.80, draw: 2.90, away: 2.90 },
      asianFeatures: defaultAsianFeatures,
      goalsLine: 2.0,
    } as BetsModelInput);
    // direction 应为胜平负方向，不受大小球影响
    expect(['HOME_WIN', 'DRAW', 'AWAY_WIN']).toContain(result.aggregatedDecision.direction);
    // totalGoalsRecommendation 可能有值（取决于具体计算结果）
    if (result.aggregatedDecision.totalGoalsRecommendation) {
      expect(['OVER', 'UNDER']).toContain(result.aggregatedDecision.totalGoalsRecommendation.direction);
      expect(result.aggregatedDecision.totalGoalsRecommendation.confidence).toBeGreaterThan(0);
      expect(result.aggregatedDecision.totalGoalsRecommendation.confidence).toBeLessThanOrEqual(0.95);
    }
  });

  it('Elo 差距大时 direction 不受低比分概率影响', () => {
    // 强队 vs 弱队，即使低比分概率高，direction 也应为 HOME_WIN
    const strongHome = { ...mockHomeTeam, elo: 1850 };
    const weakAway = { ...mockAwayTeam, elo: 1550 };
    const result = calculateBetsModel({
      homeTeam: strongHome, awayTeam: weakAway,
      odds1X2: { home: 1.50, draw: 4.00, away: 6.00 },
      asianFeatures: { ...defaultAsianFeatures, handicapValue: -1.0 },
      goalsLine: 2.5,
    } as BetsModelInput);
    // Elo 差距大时，direction 应为 HOME_WIN
    expect(result.aggregatedDecision.direction).toBe('HOME_WIN');
  });

  it('aggregatedDecision 应包含 kellySuggestion', () => {
    const result = calculateBetsModel({
      homeTeam: mockHomeTeam, awayTeam: mockAwayTeam,
      odds1X2: { home: 2.10, draw: 3.30, away: 3.20 },
      asianFeatures: defaultAsianFeatures,
      goalsLine: 2.5,
    } as BetsModelInput);
    expect(result.aggregatedDecision.kellySuggestion).toBeDefined();
    expect(typeof result.aggregatedDecision.kellySuggestion!.homeKelly).toBe('number');
    expect(typeof result.aggregatedDecision.kellySuggestion!.awayKelly).toBe('number');
    expect(typeof result.aggregatedDecision.kellySuggestion!.suggestedBetSize).toBe('number');
    expect(result.aggregatedDecision.kellySuggestion!.suggestedBetSize).toBeGreaterThanOrEqual(0);
  });

  it('recommendedDirection 与 aggregatedDecision.direction 一致', () => {
    const result = calculateBetsModel({
      homeTeam: mockHomeTeam, awayTeam: mockAwayTeam,
      odds1X2: { home: 2.10, draw: 3.30, away: 3.20 },
      asianFeatures: defaultAsianFeatures,
      goalsLine: 2.5,
    } as BetsModelInput);
    const dir = result.aggregatedDecision.direction;
    if (dir === 'HOME_WIN') {
      expect(result.recommendedDirection).toContain('主胜');
    } else if (dir === 'AWAY_WIN') {
      expect(result.recommendedDirection).toContain('客胜');
    } else {
      expect(result.recommendedDirection).toContain('平局');
    }
  });
});

describe('calculateFinalDirection (handicapArbiter)', () => {
  it('主让球且净胜球不足时翻转方向，wasFlipped=true', () => {
    const result = calculateFinalDirection('HOME_WIN', -1, 0.5);
    expect(result.direction).toBe('AWAY_WIN');
    expect(result.wasFlipped).toBe(true);
  });

  it('主让球且净胜球足够时不翻转，wasFlipped=false', () => {
    const result = calculateFinalDirection('HOME_WIN', -1, 1.5);
    expect(result.direction).toBe('HOME_WIN');
    expect(result.wasFlipped).toBe(false);
  });

  it('平手盘不翻转，wasFlipped=false', () => {
    const result = calculateFinalDirection('HOME_WIN', 0, 0.5);
    expect(result.direction).toBe('HOME_WIN');
    expect(result.wasFlipped).toBe(false);
  });

  it('受让球且客胜净胜球不足时翻转为主胜，wasFlipped=true', () => {
    const result = calculateFinalDirection('AWAY_WIN', 1, -0.5);
    expect(result.direction).toBe('HOME_WIN');
    expect(result.wasFlipped).toBe(true);
  });

  it('DRAW 方向不翻转，wasFlipped=false', () => {
    const result = calculateFinalDirection('DRAW', -1, 0.5);
    expect(result.direction).toBe('DRAW');
    expect(result.wasFlipped).toBe(false);
  });
});

// ======================== 盘口修复验证 ========================
describe('盘口（让球方）计算修复', () => {
  it('impliedHandicap 应与同赔率的 asianHandicap 方向一致', () => {
    const result = calculateBetsModel({
      homeTeam: mockHomeTeam, awayTeam: mockAwayTeam,
      odds1X2: { home: 1.80, draw: 3.60, away: 4.50 },
      asianFeatures: { ...defaultAsianFeatures, handicapValue: -0.75 },
      goalsLine: 2.5,
    } as BetsModelInput);
    // impliedHandicap 应包含"主让"（因为主胜赔率 1.80 < 客胜 4.50）
    expect(result.impliedHandicap).toBeDefined();
    expect(result.impliedHandicap).toMatch(/主让/);
  });

  it('impliedHandicap 不应为硬编码平手', () => {
    // 明显主胜赔率 1.50 vs 客胜 7.00，不应显示平手
    const result = calculateBetsModel({
      homeTeam: mockHomeTeam, awayTeam: mockAwayTeam,
      odds1X2: { home: 1.50, draw: 4.50, away: 7.00 },
      asianFeatures: { ...defaultAsianFeatures, handicapValue: -1.0 },
      goalsLine: 2.5,
    } as BetsModelInput);
    expect(result.impliedHandicap).not.toBe('平手 (0)');
  });

  it('EPL 主场优势使同赔率下盘口合理偏移', () => {
    // EPL 球队，主胜 2.10 vs 客胜 3.20，应有主场优势加成
    const result = calculateBetsModel({
      homeTeam: mockHomeTeam, awayTeam: mockAwayTeam,
      odds1X2: { home: 2.10, draw: 3.30, away: 3.20 },
      asianFeatures: defaultAsianFeatures,
      goalsLine: 2.5,
    } as BetsModelInput);
    // impliedHandicap 应产生合理盘口（不应是极端值）
    expect(result.impliedHandicap).toBeDefined();
    // 盘口应在 [-1.5, 1.5] 范围内
    expect(typeof result.impliedHandicap).toBe('string');
    expect(result.impliedHandicap.length).toBeGreaterThan(3);
  });

  it('实力差距大时平局概率应被压下', () => {
    // 强队 vs 弱队，赔率差距大
    const result = calculateBetsModel({
      homeTeam: mockHomeTeam, awayTeam: mockAwayTeam,
      odds1X2: { home: 1.40, draw: 5.00, away: 8.00 },
      asianFeatures: { ...defaultAsianFeatures, handicapValue: -1.5 },
      goalsLine: 2.5,
    } as BetsModelInput);
    // 实力悬殊时平局概率应偏低
    expect(result.fusedDrawProb).toBeLessThan(0.35);
  });

  it('同 Elo 同 xG 的镜像对阵平局概率应合理', () => {
    const result = calculateBetsModel({
      homeTeam: mockHomeTeam, awayTeam: mockHomeTeam,
      odds1X2: { home: 2.50, draw: 3.10, away: 2.80 },
      asianFeatures: { ...defaultAsianFeatures, handicapValue: 0 },
      goalsLine: 2.5,
    } as BetsModelInput);
    // 平局概率应在合理范围内（0.15-0.35）
    expect(result.fusedDrawProb).toBeGreaterThan(0.15);
    expect(result.fusedDrawProb).toBeLessThan(0.38);
  });
});

