import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
process.chdir(path.join(__dirname, '..'));

import { query } from '../backend/dbService.js';
import {
  predictMatchById,
  matchProbabilities,
  calculateExpectedGoals,
  brierScore,
  logLoss,
  getTeamStrengthVector
} from '../backend/services/poissonPredictor.js';

function formatPercent(num) {
  return `${(num * 100).toFixed(2)}%`;
}

async function validateModel() {
  console.log('=' .repeat(60));
  console.log('世界杯预测模型验证');
  console.log('=' .repeat(60));

  const matches = await query(`
    SELECT 
      m.id,
      m.home_team_id as homeTeamId,
      m.away_team_id as awayTeamId,
      m.home_score as homeGoals,
      m.away_score as awayGoals,
      th.name as homeTeamName,
      ta.name as awayTeamName
    FROM matches m
    JOIN teams th ON m.home_team_id = th.id
    JOIN teams ta ON m.away_team_id = ta.id
    WHERE m.home_score IS NOT NULL AND m.away_score IS NOT NULL
  `);

  console.log(`\n找到 ${matches.length} 场历史比赛数据`);

  let totalBrierScore = 0;
  let totalLogLoss = 0;
  let correctPredictions = 0;

  let confusionMatrix = {
    homeWin: { homeWin: 0, draw: 0, awayWin: 0 },
    draw: { homeWin: 0, draw: 0, awayWin: 0 },
    awayWin: { homeWin: 0, draw: 0, awayWin: 0 }
  };

  const predictions = [];

  for (const match of matches) {
    try {
      const [teamAStrength, teamBStrength] = await Promise.all([
        getTeamStrengthVector(match.homeTeamId),
        getTeamStrengthVector(match.awayTeamId)
      ]);

      const { lambdaA, lambdaB } = calculateExpectedGoals(teamAStrength, teamBStrength, true, 'group');
      const prob = matchProbabilities(lambdaA, lambdaB);

      const actualResult = match.homeGoals > match.awayGoals ? 'homeWin' : 
                           match.homeGoals === match.awayGoals ? 'draw' : 'awayWin';

      const predictedResult = prob.homeWin > prob.draw && prob.homeWin > prob.awayWin ? 'homeWin' :
                              prob.draw > prob.homeWin && prob.draw > prob.awayWin ? 'draw' : 'awayWin';

      if (predictedResult === actualResult) {
        correctPredictions++;
      }

      confusionMatrix[actualResult][predictedResult]++;

      const probs = [prob.homeWin, prob.draw, prob.awayWin];
      const actual = [
        actualResult === 'homeWin' ? 1 : 0,
        actualResult === 'draw' ? 1 : 0,
        actualResult === 'awayWin' ? 1 : 0
      ];

      totalBrierScore += brierScore(probs, actual);
      totalLogLoss += logLoss(probs, actual);

      predictions.push({
        homeTeam: match.homeTeamName,
        awayTeam: match.awayTeamName,
        actualGoals: `${match.homeGoals}-${match.awayGoals}`,
        predictedHomeWin: formatPercent(prob.homeWin),
        predictedDraw: formatPercent(prob.draw),
        predictedAwayWin: formatPercent(prob.awayWin),
        correct: predictedResult === actualResult
      });

    } catch (error) {
      console.warn(`Failed to process match ${match.id}: ${error.message}`);
    }
  }

  const avgBrierScore = totalBrierScore / matches.length;
  const avgLogLoss = totalLogLoss / matches.length;
  const accuracy = correctPredictions / matches.length;

  console.log('\n' + '=' .repeat(60));
  console.log('验证结果');
  console.log('=' .repeat(60));
  console.log(`\n准确率: ${formatPercent(accuracy)}`);
  console.log(`Brier分数: ${avgBrierScore.toFixed(4)} (越小越好)`);
  console.log(`对数损失: ${avgLogLoss.toFixed(4)} (越小越好)`);

  console.log('\n混淆矩阵:');
  console.log(`\t\t实际胜\t实际平\t实际负`);
  console.log(`预测胜\t${confusionMatrix.homeWin.homeWin}\t${confusionMatrix.homeWin.draw}\t${confusionMatrix.homeWin.awayWin}`);
  console.log(`预测平\t${confusionMatrix.draw.homeWin}\t${confusionMatrix.draw.draw}\t${confusionMatrix.draw.awayWin}`);
  console.log(`预测负\t${confusionMatrix.awayWin.homeWin}\t${confusionMatrix.awayWin.draw}\t${confusionMatrix.awayWin.awayWin}`);

  console.log('\n前10场比赛预测示例:');
  predictions.slice(0, 10).forEach(p => {
    console.log(`\n${p.homeTeam} vs ${p.awayTeam}`);
    console.log(`  实际比分: ${p.actualGoals}`);
    console.log(`  预测概率: 胜${p.predictedHomeWin}, 平${p.predictedDraw}, 负${p.predictedAwayWin}`);
    console.log(`  预测${p.correct ? '✓ 正确' : '✗ 错误'}`);
  });

  console.log('\n' + '=' .repeat(60));
  console.log('验证完成');
  console.log('=' .repeat(60));

  return {
    accuracy,
    avgBrierScore,
    avgLogLoss,
    confusionMatrix
  };
}

async function testPredictions() {
  console.log('\n\n');
  console.log('=' .repeat(60));
  console.log('测试几场典型比赛');
  console.log('=' .repeat(60));

  const teams = await query('SELECT id, name FROM teams WHERE name IN (?, ?, ?)', 
    ['Argentina', 'France', 'Brazil']);

  const teamMap = {};
  teams.forEach(t => teamMap[t.name] = t.id);

  const testMatches = [
    { teamA: 'Argentina', teamB: 'France' },
    { teamA: 'Brazil', teamB: 'France' },
    { teamA: 'Argentina', teamB: 'Brazil' }
  ];

  for (const test of testMatches) {
    console.log(`\n测试: ${test.teamA} vs ${test.teamB}`);
    try {
      const prediction = await predictMatchById(
        teamMap[test.teamA],
        teamMap[test.teamB],
        true,
        'knockout'
      );

      console.log(`  预期进球: ${prediction.expectedGoalsA.toFixed(2)}-${prediction.expectedGoalsB.toFixed(2)}`);
      console.log(`  胜平负概率: 胜${formatPercent(prediction.homeWinProb)}, 平${formatPercent(prediction.drawProb)}, 负${formatPercent(prediction.awayWinProb)}`);
    } catch (error) {
      console.log(`  预测失败: ${error.message}`);
    }
  }
}

async function main() {
  await validateModel();
  await testPredictions();
}

main().catch(console.error);
