import { calculateBetsModel, BetsModelInput, AsianHandicapFeatures } from '../src/utils/quantModel';

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

interface TestCase {
  name: string;
  input: BetsModelInput;
  expected?: {
    homeProbInRange?: [number, number];
    drawProbInRange?: [number, number];
    awayProbInRange?: [number, number];
    shouldFail?: boolean;
  };
}

function validateResult(result: any, testCase: TestCase): boolean {
  let passed = true;
  
  const probSum = (result.fusedHomeProb || 0) + (result.fusedDrawProb || 0) + (result.fusedAwayProb || 0);
  if (Math.abs(probSum - 1) > 0.01) {
    console.error(`   ❌ 概率和验证失败: ${probSum.toFixed(4)}`);
    passed = false;
  }
  
  if (testCase.expected?.homeProbInRange) {
    const [min, max] = testCase.expected.homeProbInRange;
    if (result.fusedHomeProb < min || result.fusedHomeProb > max) {
      console.error(`   ❌ 主队概率超出预期范围 [${min}, ${max}]: ${result.fusedHomeProb.toFixed(4)}`);
      passed = false;
    }
  }
  
  if (testCase.expected?.drawProbInRange) {
    const [min, max] = testCase.expected.drawProbInRange;
    if (result.fusedDrawProb < min || result.fusedDrawProb > max) {
      console.error(`   ❌ 平局概率超出预期范围 [${min}, ${max}]: ${result.fusedDrawProb.toFixed(4)}`);
      passed = false;
    }
  }
  
  if (testCase.expected?.awayProbInRange) {
    const [min, max] = testCase.expected.awayProbInRange;
    if (result.fusedAwayProb < min || result.fusedAwayProb > max) {
      console.error(`   ❌ 客队概率超出预期范围 [${min}, ${max}]: ${result.fusedAwayProb.toFixed(4)}`);
      passed = false;
    }
  }
  
  return passed;
}

async function runBoundaryTests() {
  console.log('=== 边界测试用例 ===\n');
  
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

  const testCases: TestCase[] = [
    {
      name: '正常赔率 - 均衡盘',
      input: {
        homeTeam: mockHomeTeam,
        awayTeam: mockAwayTeam,
        odds1X2: { home: 2.10, draw: 3.30, away: 3.20 },
        asianFeatures: defaultAsianFeatures,
        goalsLine: 2.5
      },
      expected: { homeProbInRange: [0.35, 0.45], drawProbInRange: [0.25, 0.35], awayProbInRange: [0.25, 0.35] }
    },
    {
      name: '极端赔率 - 主队大热门',
      input: {
        homeTeam: mockHomeTeam,
        awayTeam: mockAwayTeam,
        odds1X2: { home: 1.20, draw: 6.00, away: 10.00 },
        asianFeatures: { ...defaultAsianFeatures, handicapValue: -1.5 },
        goalsLine: 2.5
      },
      expected: { homeProbInRange: [0.65, 0.85], drawProbInRange: [0.10, 0.25], awayProbInRange: [0.05, 0.15] }
    },
    {
      name: '极端赔率 - 客队大热门',
      input: {
        homeTeam: mockAwayTeam,
        awayTeam: mockHomeTeam,
        odds1X2: { home: 8.00, draw: 5.00, away: 1.30 },
        asianFeatures: { ...defaultAsianFeatures, handicapValue: 1.5 },
        goalsLine: 2.5
      },
      expected: { homeProbInRange: [0.10, 0.20], drawProbInRange: [0.20, 0.30], awayProbInRange: [0.55, 0.70] }
    },
    {
      name: '极端盘口 - 主让3球',
      input: {
        homeTeam: mockHomeTeam,
        awayTeam: mockAwayTeam,
        odds1X2: { home: 1.40, draw: 4.50, away: 6.50 },
        asianFeatures: { ...defaultAsianFeatures, handicapValue: -3.0, homeWater: 0.60, awayWater: 1.20 },
        goalsLine: 3.5
      }
    },
    {
      name: '极端盘口 - 客让2球半',
      input: {
        homeTeam: mockAwayTeam,
        awayTeam: mockHomeTeam,
        odds1X2: { home: 5.50, draw: 4.00, away: 1.50 },
        asianFeatures: { ...defaultAsianFeatures, handicapValue: 2.5, homeWater: 1.15, awayWater: 0.70 },
        goalsLine: 3.0
      }
    },
    {
      name: '平手盘 - 均衡水位',
      input: {
        homeTeam: mockHomeTeam,
        awayTeam: mockAwayTeam,
        odds1X2: { home: 2.30, draw: 3.20, away: 2.80 },
        asianFeatures: { ...defaultAsianFeatures, handicapValue: 0, homeWater: 0.90, awayWater: 0.90 },
        goalsLine: 2.5
      },
      expected: { homeProbInRange: [0.35, 0.45], drawProbInRange: [0.25, 0.35], awayProbInRange: [0.25, 0.35] }
    },
    {
      name: '极端水位 - 主队超低水',
      input: {
        homeTeam: mockHomeTeam,
        awayTeam: mockAwayTeam,
        odds1X2: { home: 1.90, draw: 3.40, away: 3.50 },
        asianFeatures: { ...defaultAsianFeatures, handicapValue: -0.25, homeWater: 0.65, awayWater: 1.15 },
        goalsLine: 2.5
      }
    },
    {
      name: '极端水位 - 客队超低水',
      input: {
        homeTeam: mockHomeTeam,
        awayTeam: mockAwayTeam,
        odds1X2: { home: 2.80, draw: 3.30, away: 2.40 },
        asianFeatures: { ...defaultAsianFeatures, handicapValue: 0.25, homeWater: 1.15, awayWater: 0.65 },
        goalsLine: 2.5
      }
    },
    {
      name: '极端大小球 - 5球大球',
      input: {
        homeTeam: mockHomeTeam,
        awayTeam: mockAwayTeam,
        odds1X2: { home: 1.80, draw: 3.60, away: 4.00 },
        asianFeatures: { ...defaultAsianFeatures, handicapValue: -0.5 },
        goalsLine: 5.0
      }
    },
    {
      name: '极端大小球 - 1.5球小球',
      input: {
        homeTeam: mockHomeTeam,
        awayTeam: mockAwayTeam,
        odds1X2: { home: 2.50, draw: 3.20, away: 2.70 },
        asianFeatures: { ...defaultAsianFeatures, handicapValue: 0 },
        goalsLine: 1.5
      }
    },
    {
      name: '高抽水赔率 - 庄家高利润',
      input: {
        homeTeam: mockHomeTeam,
        awayTeam: mockAwayTeam,
        odds1X2: { home: 1.85, draw: 3.00, away: 3.80 },
        asianFeatures: { ...defaultAsianFeatures, handicapValue: -0.25, homeWater: 0.88, awayWater: 0.98 },
        goalsLine: 2.5
      }
    },
    {
      name: '低抽水赔率 - 接近公平',
      input: {
        homeTeam: mockHomeTeam,
        awayTeam: mockAwayTeam,
        odds1X2: { home: 2.05, draw: 3.25, away: 3.30 },
        asianFeatures: { ...defaultAsianFeatures, handicapValue: 0.25, homeWater: 0.92, awayWater: 0.92 },
        goalsLine: 2.5
      }
    }
  ];

  let passedCount = 0;
  let failedCount = 0;

  for (const testCase of testCases) {
    console.log(`测试: ${testCase.name}`);
    try {
      const result = calculateBetsModel(testCase.input);
      
      if (testCase.expected?.shouldFail) {
        console.error('   ❌ 预期失败但实际成功');
        failedCount++;
      } else {
        const isValid = validateResult(result, testCase);
        if (isValid) {
          console.log(`   ✅ 通过 - 融合概率: 主${result.fusedHomeProb.toFixed(4)} / 平${result.fusedDrawProb.toFixed(4)} / 客${result.fusedAwayProb.toFixed(4)}`);
          passedCount++;
        } else {
          failedCount++;
        }
      }
    } catch (error) {
      if (testCase.expected?.shouldFail) {
        console.log('   ✅ 按预期失败');
        passedCount++;
      } else {
        console.error(`   ❌ 异常: ${error}`);
        failedCount++;
      }
    }
    console.log('');
  }

  console.log(`=== 边界测试结果 ===`);
  console.log(`通过: ${passedCount} / ${testCases.length}`);
  console.log(`失败: ${failedCount} / ${testCases.length}`);

  return failedCount === 0;
}

async function runSanityCheck() {
  console.log('=== 量化模型连通性测试 ===\n');

  const asianFeatures: AsianHandicapFeatures = {
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

  const testInput: BetsModelInput = {
    homeTeam: mockHomeTeam,
    awayTeam: mockAwayTeam,
    odds1X2: {
      home: 2.10,
      draw: 3.30,
      away: 3.20
    },
    asianFeatures,
    goalsLine: 2.5,
    fusionWeights: {
      oddsChannel: 0.7,
      asianChannel: 0.3
    }
  };

  console.log('测试输入数据:');
  console.log('  - 主队:', testInput.homeTeam.nameCn);
  console.log('  - 客队:', testInput.awayTeam.nameCn);
  console.log('  - 欧赔:', JSON.stringify(testInput.odds1X2));
  console.log('  - 亚盘特征:', JSON.stringify(testInput.asianFeatures));
  console.log('');

  try {
    const result = calculateBetsModel(testInput);
    console.log('✅ 模型执行成功！\n');

    console.log('=== 输出结果验证 ===');
    
    const requiredFields = [
      { key: 'fusedHomeProb', label: '融合主队概率', min: 0, max: 1 },
      { key: 'fusedDrawProb', label: '融合平局概率', min: 0, max: 1 },
      { key: 'fusedAwayProb', label: '融合客队概率', min: 0, max: 1 },
      { key: 'marketConfidence', label: '市场置信度', min: 0, max: 1 },
      { key: 'recommendedDirection', label: '推荐方向' }
    ];

    let allPassed = true;
    for (const { key, label, min, max } of requiredFields) {
      const value = result[key as keyof typeof result];
      if (value === undefined || value === null) {
        console.error(`❌ 缺失关键字段: ${label} (${key})`);
        allPassed = false;
      } else if (min !== undefined && max !== undefined && (value < min || value > max)) {
        console.error(`❌ ${label} (${key}) 值超出范围 [${min}, ${max}]: ${value}`);
        allPassed = false;
      } else {
        console.log(`✅ ${label} (${key}): ${typeof value === 'number' ? value.toFixed(4) : value}`);
      }
    }

    const probSum = (result.fusedHomeProb || 0) + (result.fusedDrawProb || 0) + (result.fusedAwayProb || 0);
    if (Math.abs(probSum - 1) > 0.01) {
      console.error(`❌ 概率和不等于1: ${probSum.toFixed(4)}`);
      allPassed = false;
    } else {
      console.log(`✅ 概率和验证通过: ${probSum.toFixed(4)}`);
    }

    console.log('\n=== 双通道融合指标 ===');
    console.log(`✅ 欧赔主队概率: ${(result.oddsHomeProb || 0).toFixed(4)}`);
    console.log(`✅ 欧赔平局概率: ${(result.oddsDrawProb || 0).toFixed(4)}`);
    console.log(`✅ 欧赔客队概率: ${(result.oddsAwayProb || 0).toFixed(4)}`);
    console.log(`✅ 亚盘主队概率: ${(result.asianHomeProb || 0).toFixed(4)}`);
    console.log(`✅ 亚盘平局概率: ${(result.asianDrawProb || 0).toFixed(4)}`);
    console.log(`✅ 亚盘客队概率: ${(result.asianAwayProb || 0).toFixed(4)}`);
    console.log(`✅ 市场偏离程度: ${(result.marketDeviation || 0).toFixed(4)}`);
    console.log(`✅ 市场置信度: ${result.marketConfidence || 'N/A'}`);
    if (result.marketDeviationWarning) {
      console.log(`⚠️  警告信息: ${result.marketDeviationWarning}`);
    }

    if (allPassed) {
      console.log('\n=== 🎉 连通性测试通过 ===\n');
    } else {
      console.log('\n=== ❌ 连通性测试失败 ===\n');
      process.exit(1);
    }

  } catch (error) {
    console.error('❌ 模型执行异常:', error);
    process.exit(1);
  }
}

async function main() {
  await runSanityCheck();
  const boundaryPassed = await runBoundaryTests();
  
  if (!boundaryPassed) {
    process.exit(1);
  }
  
  console.log('\n=== 🎉 所有测试完成 ===');
}

main();