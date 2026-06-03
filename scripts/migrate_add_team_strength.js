import sqlite3 from 'sqlite3';
import path from 'path';

const DB_PATH = path.resolve('database/worldcup.db');

async function migrate() {
  console.log('开始数据库迁移：添加 team_strength_vectors 表...');
  
  const db = new sqlite3.Database(DB_PATH);
  
  try {
    // 检查表是否已存在
    const tableExists = await new Promise((resolve, reject) => {
      db.get(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='team_strength_vectors'",
        (err, row) => {
          if (err) reject(err);
          else resolve(!!row);
        }
      );
    });

    if (tableExists) {
      console.log('表 team_strength_vectors 已存在，无需创建');
    } else {
      // 创建新表
      await new Promise((resolve, reject) => {
        db.run(`
          CREATE TABLE team_strength_vectors (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            team_id INTEGER NOT NULL UNIQUE,
            offense_index REAL NOT NULL,
            defense_index REAL NOT NULL,
            teamwork_score REAL NOT NULL,
            elo INTEGER NOT NULL,
            squad_depth REAL NOT NULL,
            overall REAL NOT NULL,
            version TEXT DEFAULT '1.0',
            computed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (team_id) REFERENCES teams(id)
          )
        `, (err) => {
          if (err) reject(err);
          else resolve();
        });
      });
      
      // 创建索引
      await Promise.all([
        new Promise((resolve, reject) => {
          db.run('CREATE INDEX idx_team_strength_team ON team_strength_vectors(team_id)', (err) => {
            if (err) reject(err);
            else resolve();
          });
        }),
        new Promise((resolve, reject) => {
          db.run('CREATE INDEX idx_team_strength_overall ON team_strength_vectors(overall DESC)', (err) => {
            if (err) reject(err);
            else resolve();
          });
        })
      ]);
      
      console.log('成功创建 team_strength_vectors 表和索引');
    }
    
  } catch (error) {
    console.error('迁移失败:', error);
  } finally {
    db.close();
    console.log('数据库连接已关闭');
  }
}

migrate();
