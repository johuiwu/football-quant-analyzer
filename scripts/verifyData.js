import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import sqlite3 from 'sqlite3';
import { normalizeTeamName, getChineseName, teamNameChineseMapping } from '../config/teamNameMapping.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = path.join(__dirname, '../database/worldcup.db');

async function main() {
  console.log('Starting data verification...\n');
  
  const db = new sqlite3.Database(DB_PATH);
  let allPassed = true;
  
  try {
    console.log('=== 1. 验证球队数量 ===');
    const teamCount = await new Promise((resolve) => {
      db.get('SELECT COUNT(*) as count FROM teams', (err, row) => {
        resolve(row ? row.count : 0);
      });
    });
    console.log(`数据库中共有 ${teamCount} 支球队`);
    
    console.log('\n=== 2. 验证每支球队至少有20名球员 ===');
    const teamsWithPlayerCount = await new Promise((resolve) => {
      db.all(`
        SELECT t.name, t.chinese_name, COUNT(p.id) as player_count
        FROM teams t
        LEFT JOIN players p ON t.id = p.team_id
        GROUP BY t.id
        ORDER BY player_count DESC
      `, (err, rows) => {
        resolve(rows || []);
      });
    });
    
    const teamsBelowThreshold = teamsWithPlayerCount.filter(t => t.player_count < 20);
    
    if (teamsBelowThreshold.length === 0) {
      console.log('✓ 所有球队都有20名以上球员');
    } else {
      console.log('✗ 以下球队球员数量不足20人:');
      teamsBelowThreshold.forEach(team => {
        console.log(`  - ${team.name} (${team.chinese_name || '-'}): ${team.player_count} 名球员`);
      });
      allPassed = false;
    }
    
    console.log('\n=== 3. 验证每场比赛比分不为空 ===');
    const matchesWithEmptyScore = await new Promise((resolve) => {
      db.all(`
        SELECT m.match_id, m.match_date, h.name as home_team, a.name as away_team,
               m.home_score, m.away_score
        FROM matches m
        JOIN teams h ON m.home_team_id = h.id
        JOIN teams a ON m.away_team_id = a.id
        WHERE m.home_score IS NULL OR m.away_score IS NULL
      `, (err, rows) => {
        resolve(rows || []);
      });
    });
    
    if (matchesWithEmptyScore.length === 0) {
      console.log('✓ 所有比赛比分都不为空');
    } else {
      console.log('✗ 以下比赛比分存在空值:');
      matchesWithEmptyScore.slice(0, 10).forEach(match => {
        console.log(`  - ${match.match_id}: ${match.home_team} vs ${match.away_team} (${match.match_date})`);
      });
      if (matchesWithEmptyScore.length > 10) {
        console.log(`  ... 还有 ${matchesWithEmptyScore.length - 10} 场比赛`);
      }
      allPassed = false;
    }
    
    console.log('\n=== 4. 验证队名归一化 ===');
    const teams = await new Promise((resolve) => {
      db.all('SELECT name, chinese_name FROM teams ORDER BY name', (err, rows) => {
        resolve(rows || []);
      });
    });
    
    const teamsWithoutChinese = teams.filter(t => !t.chinese_name || t.chinese_name === t.name);
    
    if (teamsWithoutChinese.length === 0) {
      console.log('✓ 所有球队都已正确映射中文名称');
    } else {
      console.log('✗ 以下球队缺少中文映射:');
      teamsWithoutChinese.forEach(team => {
        console.log(`  - ${team.name}`);
      });
      allPassed = false;
    }
    
    console.log('\n=== 5. 验证关键队名归一化 ===');
    const specialTeams = [
      { original: 'Korea (South)', expected: 'South Korea' },
      { original: 'Iran, Islamic Republic of', expected: 'Iran' },
      { original: 'United States of America', expected: 'United States' }
    ];
    
    let normalizationPassed = true;
    for (const { original, expected } of specialTeams) {
      const normalized = normalizeTeamName(original);
      if (normalized === expected) {
        console.log(`✓ ${original} → ${normalized}`);
      } else {
        console.log(`✗ ${original} → ${normalized} (期望: ${expected})`);
        normalizationPassed = false;
      }
    }
    
    if (!normalizationPassed) allPassed = false;
    
    console.log('\n=== 6. 数据统计 ===');
    const stats = await Promise.all([
      new Promise((resolve) => db.get('SELECT COUNT(*) as count FROM teams', (err, row) => resolve(row.count))),
      new Promise((resolve) => db.get('SELECT COUNT(*) as count FROM matches', (err, row) => resolve(row.count))),
      new Promise((resolve) => db.get('SELECT COUNT(*) as count FROM players', (err, row) => resolve(row.count))),
      new Promise((resolve) => db.get('SELECT COUNT(*) as count FROM player_positions', (err, row) => resolve(row.count))),
      new Promise((resolve) => db.get('SELECT COUNT(*) as count FROM player_cards', (err, row) => resolve(row.count))),
      new Promise((resolve) => db.get('SELECT COUNT(DISTINCT world_cup_year) as count FROM matches', (err, row) => resolve(row.count))),
      new Promise((resolve) => db.get('SELECT MIN(world_cup_year) as min, MAX(world_cup_year) as max FROM matches', (err, row) => resolve(row)))
    ]);
    
    console.log(`球队数量: ${stats[0]}`);
    console.log(`比赛数量: ${stats[1]}`);
    console.log(`球员数量: ${stats[2]}`);
    console.log(`位置记录: ${stats[3]}`);
    console.log(`红黄牌记录: ${stats[4]}`);
    console.log(`世界杯届数: ${stats[5]} (${stats[6].min}-${stats[6].max})`);
    
    console.log('\n=== 7. 随机抽样验证 ===');
    const sampleMatches = await new Promise((resolve) => {
      db.all(`
        SELECT m.match_date, h.name as home_team, h.chinese_name as home_cn,
               a.name as away_team, a.chinese_name as away_cn,
               m.home_score, m.away_score, m.stage
        FROM matches m
        JOIN teams h ON m.home_team_id = h.id
        JOIN teams a ON m.away_team_id = a.id
        ORDER BY RANDOM() LIMIT 5
      `, (err, rows) => {
        resolve(rows || []);
      });
    });
    
    console.log('随机抽取5场比赛:');
    sampleMatches.forEach(match => {
      console.log(`  - ${match.match_date}: ${match.home_team}(${match.home_cn}) ${match.home_score} - ${match.away_score} ${match.away_team}(${match.away_cn}) [${match.stage}]`);
    });
    
    console.log('\n=== 8. 数据版本检查 ===');
    const versions = await new Promise((resolve) => {
      db.all('SELECT version, description, created_at FROM data_versions ORDER BY created_at DESC', (err, rows) => {
        resolve(rows || []);
      });
    });
    
    if (versions.length > 0) {
      console.log(`当前数据版本: ${versions[0].version}`);
      console.log(`描述: ${versions[0].description}`);
      console.log(`创建时间: ${versions[0].created_at}`);
    } else {
      console.log('✗ 未找到数据版本记录');
      allPassed = false;
    }
    
  } catch (err) {
    console.error('验证过程中发生错误:', err.message);
    allPassed = false;
  } finally {
    db.close();
  }
  
  console.log('\n==============================');
  if (allPassed) {
    console.log('✓ 所有验证通过!');
  } else {
    console.log('✗ 部分验证未通过，请检查上述警告');
    process.exit(1);
  }
}

main();
