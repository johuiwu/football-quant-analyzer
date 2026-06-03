import sqlite3 from 'sqlite3';
import path from 'path';

const DB_PATH = path.resolve('database/worldcup.db');

async function migrate() {
  console.log('开始数据库迁移：添加 model_parameters 表...');

  const db = new sqlite3.Database(DB_PATH);

  try {
    const tableExists = await new Promise((resolve, reject) => {
      db.get(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='model_parameters'",
        (err, row) => {
          if (err) reject(err);
          else resolve(!!row);
        }
      );
    });

    if (tableExists) {
      console.log('表 model_parameters 已存在，无需创建');
    } else {
      await new Promise((resolve, reject) => {
        db.run(`
          CREATE TABLE model_parameters (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            model_name TEXT NOT NULL,
            parameter_name TEXT NOT NULL,
            parameter_value REAL NOT NULL,
            description TEXT,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(model_name, parameter_name)
          )
        `, (err) => {
          if (err) reject(err);
          else resolve();
        });
      });

      console.log('成功创建 model_parameters 表');
    }

  } catch (error) {
    console.error('迁移失败:', error);
  } finally {
    db.close();
    console.log('数据库连接已关闭');
  }
}

migrate();