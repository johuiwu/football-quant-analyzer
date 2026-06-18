import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
process.chdir(path.join(__dirname, '..'));

import { query } from '../backend/dbService.js';
import {
  buildFeatureVector,
  buildAllTeamsFeatureVectors
} from '../backend/services/featureService.js';
import { normalizeFeatures, getFeatureStats } from '../backend/services/normalizationService.js';

function formatNumber(num, decimals = 2) {
  if (num === null || num === undefined || isNaN(num)) return '-';
  return Number(num).toFixed(decimals);
}

async function getTeamByName(name) {
  const sql = 'SELECT id, name, chinese_name FROM teams WHERE name = ? LIMIT 1';
  const teams = await query(sql, [name]);
  return teams[0];
}

async function testTeamFeatures(teamName) {
  console.log(`\n=== 测试 ${teamName} 特征 ===\n`);
  
  const team = await getTeamByName(teamName);
  if (!team) {
    console.log(`找不到球队: ${teamName}`);
    return null;
  }
  
  console.log(`球队: ${team.name} (${team.chinese_name || team.name})`);
  console.log(`ID: ${team.id}`);
  
  const featureVector = await buildFeatureVector(team.id, { matches: 10 });
  
  console.log('\n--- 特征向量 ---');
  Object.entries(featureVector).forEach(([key, value]) => {
    if (key !== 'teamId') {
      console.log(`  ${key.padEnd(25)}: ${formatNumber(value)}`);
    }
  });
  
  return { team, features: featureVector };
}

async function testNormalization(vectors) {
  console.log('\n\n=== 特征归一化测试 ===\n');
  
  const result = normalizeFeatures(vectors);
  const stats = getFeatureStats(vectors);
  
  console.log('统计摘要:');
  Object.entries(stats).forEach(([feature, stat]) => {
    console.log(`  ${feature.padEnd(25)}: 均值=${formatNumber(stat.mean)} ± ${formatNumber(stat.stdDev)}, 范围=[${formatNumber(stat.min)}, ${formatNumber(stat.max)}]`);
  });
  
  return result;
}

async function main() {
  console.log('========================================');
  console.log('世界杯数据分析 - 特征工程工厂 测试');
  console.log('========================================\n');
  
  try {
    const argentina = await testTeamFeatures('Argentina');
    const france = await testTeamFeatures('France');
    const brazil = await testTeamFeatures('Brazil');
    
    const allVectors = await buildAllTeamsFeatureVectors(10);
    console.log(`\n\n已构建 ${allVectors.length} 支球队的特征向量`);
    
    const topTeams = [argentina, france, brazil].filter(x => x);
    if (topTeams.length > 0) {
      const topVectors = topTeams.map(t => t.features);
      await testNormalization([...topVectors, ...allVectors.slice(0, 5)]);
    }
    
    console.log('\n\n========================================');
    console.log('所有测试完成！');
    console.log('========================================\n');
    
  } catch (error) {
    console.error('测试过程出错:', error.message);
    console.error(error.stack);
  }
}

main();
