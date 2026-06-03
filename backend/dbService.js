import sqlite3 from 'sqlite3';
import path from 'path';

// Electron/生产环境: 支持 DB_DIR 环境变量
const DB_BASE = process.env.DB_DIR || 'database';
const DB_PATH = path.resolve(DB_BASE, 'football_data.db');

let db = null;

function getDb() {
  if (!db) {
    db = new sqlite3.Database(DB_PATH, (err) => {
      if (err) {
        console.error('Failed to connect to database:', err.message);
      } else {
        console.log('Connected to SQLite database');
        db.run('PRAGMA journal_mode = WAL');
      }
    });
  }
  return db;
}

export function query(sql, params = []) {
  return new Promise((resolve, reject) => {
    const database = getDb();
    database.all(sql, params, (err, rows) => {
      if (err) {
        reject(err);
      } else {
        resolve(rows);
      }
    });
  });
}

export function get(sql, params = []) {
  return new Promise((resolve, reject) => {
    const database = getDb();
    database.get(sql, params, (err, row) => {
      if (err) {
        reject(err);
      } else {
        resolve(row);
      }
    });
  });
}

export function run(sql, params = []) {
  return new Promise((resolve, reject) => {
    const database = getDb();
    database.run(sql, params, function (err) {
      if (err) {
        reject(err);
      } else {
        resolve({ lastID: this.lastID, changes: this.changes });
      }
    });
  });
}

export function close() {
  if (db) {
    db.close();
    db = null;
  }
}
