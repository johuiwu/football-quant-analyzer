/**
 * database/db.ts — SQLite 数据库访问层
 *
 * 提供球队数据的 CRUD 操作，供 backend 路由使用。
 * 数据库文件: database/football_data.db (SQLite)
 */

import sqlite3 from 'sqlite3';
import path from 'path';

const DB_BASE = process.env.DB_DIR || 'database';
const DB_PATH = path.resolve(DB_BASE, 'football_data.db');

let _db: sqlite3.Database | null = null;

function openDb(): sqlite3.Database {
  if (!_db) {
    _db = new sqlite3.Database(DB_PATH, (err) => {
      if (err) {
        console.error('[database/db] 连接失败:', err.message);
      } else {
        console.log('[database/db] 已连接 SQLite:', DB_PATH);
        _db!.run('PRAGMA journal_mode = WAL');
      }
    });
  }
  return _db;
}

/**
 * 获取 Promise 化的数据库代理对象
 * 支持 await db.get() / db.all() / db.run() 风格调用
 */
export function getDb() {
  const raw = openDb();
  return {
    get: (sql: string, params: any[] = []) => new Promise<any>((resolve, reject) => {
      raw.get(sql, params, (err, row) => err ? reject(err) : resolve(row));
    }),
    all: (sql: string, params: any[] = []) => new Promise<any[]>((resolve, reject) => {
      raw.all(sql, params, (err, rows) => err ? reject(err) : resolve(rows || []));
    }),
    run: (sql: string, params: any[] = []) => new Promise<{ lastID: number; changes: number }>((resolve, reject) => {
      raw.run(sql, params, function (err) {
        if (err) reject(err);
        else resolve({ lastID: this.lastID, changes: this.changes });
      });
    }),
  };
}

// ======================== 基础查询 ========================

export function query(sql: string, params: any[] = []): Promise<any[]> {
  return new Promise((resolve, reject) => {
    openDb().all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows || []);
    });
  });
}

export function get(sql: string, params: any[] = []): Promise<any | undefined> {
  return new Promise((resolve, reject) => {
    openDb().get(sql, params, (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
}

export function run(sql: string, params: any[] = []): Promise<{ lastID: number; changes: number }> {
  return new Promise((resolve, reject) => {
    openDb().run(sql, params, function (err) {
      if (err) reject(err);
      else resolve({ lastID: this.lastID, changes: this.changes });
    });
  });
}

// ======================== 球队完整数据 ========================

const FIVE_MAJOR_LEAGUES = ['EPL', 'LaLiga', 'SerieA', 'Bundesliga', 'Ligue1'];

/**
 * 估算赛季 xPTS（预期积分）
 * 基于现有战绩数据，使用加权公式计算
 */
function estimateSeasonXpts(team: any): number {
  const wins = (team.homeStats?.wins || 0) + (team.awayStats?.wins || 0);
  const draws = (team.homeStats?.draws || 0) + (team.awayStats?.draws || 0);
  const points = wins * 3 + draws;
  // xPTS = 实际积分 * 0.7 + max(0, 实际积分 + NPxGD) * 0.3
  const npxgd = estimateSeasonNpxgd(team);
  return Math.round((points * 0.7 + Math.max(0, points + npxgd) * 0.3) * 10) / 10;
}

/**
 * 估算赛季 PPDA（压迫强度）
 * 基于联赛和排名估算，五大联赛顶级球队约 7-10，中下游约 11-15
 */
function estimateSeasonPpda(team: any): number {
  const rank = team.rank || 10;
  const league = team.league || '';

  // 联赛基础 PPDA（越强的联赛压迫越强）
  const leagueBase: Record<string, number> = {
    EPL: 9.5, LaLiga: 9.0, Bundesliga: 8.5, SerieA: 10.0, Ligue1: 10.5,
  };

  const base = leagueBase[league] || 12.0;
  // 排名越靠前，PPDA 越低（压迫越强）
  const rankAdjust = (rank - 1) * 0.3;
  return Math.round((base + rankAdjust) * 10) / 10;
}

/**
 * 估算赛季 NPxGD（非点球 xG 差值）
 */
function estimateSeasonNpxgd(team: any): number {
  const seasonXg = (team.homeStats?.xgFor || team.homeXg || 0) + (team.awayStats?.xgFor || team.awayXg || 0);
  const seasonXga = (team.homeStats?.xgAgainst || 0) + (team.awayStats?.xgAgainst || 0);
  // NPxGD = (赛季总 xG - 赛季总 xGA) * 0.95
  return Math.round((seasonXg - seasonXga) * 0.95 * 10) / 10;
}

/**
 * 将数据库行转换为前端 TeamStats 格式
 */
function dbRowToTeamStats(row: any): any {
  let homeStats = { played: 0, wins: 0, draws: 0, losses: 0, goalsFor: 0, goalsAgainst: 0, xgFor: 0, xgAgainst: 0 };
  let awayStats = { played: 0, wins: 0, draws: 0, losses: 0, goalsFor: 0, goalsAgainst: 0, xgFor: 0, xgAgainst: 0 };

  if (row.home_stats) {
    try { homeStats = JSON.parse(row.home_stats); } catch (_) {}
  }
  if (row.away_stats) {
    try { awayStats = JSON.parse(row.away_stats); } catch (_) {}
  }

  let form: string[] = ['D', 'D', 'D', 'D', 'D'];
  if (row.form) {
    try { form = JSON.parse(row.form); } catch (_) { form = row.form.split(','); }
  }

  let formLast5: number[] = [];
  if (row.form_last5) {
    try { formLast5 = JSON.parse(row.form_last5); } catch (_) {}
  }

  const team: any = {
    id: row.team_id,
    teamId: row.team_id,
    name: row.team_name,
    nameCn: row.team_name_cn,
    league: row.league,
    leagueCn: row.league_cn,
    rank: row.rank || 0,
    homeStats,
    awayStats,
    form,
    cleanSheets: row.clean_sheets || 0,
    shotsPerGame: row.shots_per_game || 0,
    shotAccuracy: row.shot_accuracy || 0,
    homeXg: row.home_xg || 0,
    awayXg: row.away_xg || 0,
    formLast5,
    seasonXpts: row.season_xpts || 0,
    seasonPpda: row.season_ppda || 0,
    seasonPpdaAllowed: row.season_ppda_allowed || 0,
    seasonNpxgd: row.season_npxgd || 0,
    matches: row.matches || 0,
  };

  // 五大联赛：估算缺失的高级指标，并确保 matches 有值
  if (FIVE_MAJOR_LEAGUES.includes(team.league)) {
    if (team.seasonXpts <= 0) {
      team.seasonXpts = estimateSeasonXpts(team);
      team.seasonPpda = estimateSeasonPpda(team);
      team.seasonNpxgd = estimateSeasonNpxgd(team);
    }
    // 始终确保 matches 有值（无论 seasonXpts 是否 > 0）
    if (!team.matches || team.matches <= 0) {
      team.matches = (homeStats.played || 0) + (awayStats.played || 0);
    }
  }

  return team;
}

// ======================== 导出函数 ========================

/**
 * 检查数据库中是否有球队数据
 */
export async function hasTeamsData(): Promise<boolean> {
  try {
    const row = await get('SELECT COUNT(*) as cnt FROM teams');
    return (row?.cnt || 0) > 0;
  } catch {
    return false;
  }
}

/**
 * 获取所有球队的完整数据（合并 teams + team_stats 表）
 */
export async function getAllCompleteTeams(): Promise<any[]> {
  const rows = await query('SELECT * FROM teams ORDER BY league, rank');
  return rows.map(dbRowToTeamStats);
}

/**
 * 获取所有球队按联赛分组
 */
export async function getAllTeamsGrouped(): Promise<Record<string, any[]>> {
  const teams = await getAllCompleteTeams();
  const grouped: Record<string, any[]> = {};
  for (const team of teams) {
    const league = team.league || 'unknown';
    if (!grouped[league]) grouped[league] = [];
    grouped[league].push(team);
  }
  return grouped;
}

/**
 * 保存/更新球队完整数据到 teams 表
 */
export async function saveCompleteTeam(team: any): Promise<void> {
  const homeStatsJson = JSON.stringify(team.homeStats || {});
  const awayStatsJson = JSON.stringify(team.awayStats || {});
  const formJson = JSON.stringify(team.form || []);
  const formLast5Json = JSON.stringify(team.formLast5 || []);

  const sql = `
    INSERT OR REPLACE INTO teams (
      team_id, team_name, team_name_cn, league, league_cn, rank,
      home_stats, away_stats, form, form_last5,
      clean_sheets, shots_per_game, shot_accuracy,
      home_xg, away_xg,
      home_played, home_wins, home_draws, home_losses, home_goals_for, home_goals_against,
      away_played, away_wins, away_draws, away_losses, away_goals_for, away_goals_against,
      season_xpts, season_ppda, season_ppda_allowed, season_npxgd, matches,
      last_updated, data_source
    ) VALUES (
      ?, ?, ?, ?, ?, ?,
      ?, ?, ?, ?,
      ?, ?, ?,
      ?, ?,
      ?, ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?,
      datetime('now'), ?
    )
  `;

  const params = [
    team.id, team.name, team.nameCn, team.league, team.leagueCn, team.rank,
    homeStatsJson, awayStatsJson, formJson, formLast5Json,
    team.cleanSheets || 0, team.shotsPerGame || 0, team.shotAccuracy || 0,
    team.homeXg || 0, team.awayXg || 0,
    team.homeStats?.played || 0, team.homeStats?.wins || 0, team.homeStats?.draws || 0,
    team.homeStats?.losses || 0, team.homeStats?.goalsFor || 0, team.homeStats?.goalsAgainst || 0,
    team.awayStats?.played || 0, team.awayStats?.wins || 0, team.awayStats?.draws || 0,
    team.awayStats?.losses || 0, team.awayStats?.goalsFor || 0, team.awayStats?.goalsAgainst || 0,
    team.seasonXpts || 0, team.seasonPpda || 0, team.seasonPpdaAllowed || 0,
    team.seasonNpxgd || 0, team.matches || 0,
    team.dataSource || 'crawler',
  ];

  await run(sql, params);
}

// 爬虫允许保存的字段列表
export const ALLOWED_FIELDS = [
  'goals', 'conceded', 'goalDifference', 'shots', 'shotsOnTarget',
  'assists', 'passes', 'corners', 'fouls', 'redCards', 'yellowCards',
  'penalties', 'cleanSheets', 'avgGoals', 'avgConceded', 'avgGoalDiff',
  'avgCorners', 'possession', 'tackles', 'interceptions', 'clearances',
  'offsides', 'foulsSuffered', 'keyPasses', 'crosses', 'crossesSuccessful',
  'successfulCrosses', 'longBalls', 'successfulLongBalls', 'freeKicks',
  'freeKickGoals', 'dribbles', 'successfulDribbles', 'duelsWon',
  'fastBreaks', 'fastBreakShots', 'fastBreakGoals', 'hitWoodwork',
  'possessionLost', 'twoYellowRedCards', 'effectiveBlocks',
  'passesSuccessful', 'duelsTotal',
];

/**
 * 更新或插入球队统计到 team_stats 表
 */
export async function upsertTeamStats(
  teamId: string, teamNameCn: string, teamName: string,
  league: string, leagueCn: string, stats: any
): Promise<void> {
  const setClauses: string[] = [];
  const params: any[] = [];

  for (const field of ALLOWED_FIELDS) {
    if (stats[field] !== undefined) {
      const value = typeof stats[field] === 'object' ? (stats[field].total ?? stats[field].value ?? 0) : stats[field];
      setClauses.push(`${field} = ?`);
      params.push(value);
    }
  }

  if (setClauses.length === 0) return;

  params.push(teamId, teamNameCn, teamName, league, leagueCn);

  const sql = `
    INSERT INTO team_stats (team_id, team_name_cn, team_name, league, league_cn, ${ALLOWED_FIELDS.filter(f => stats[f] !== undefined).join(', ')})
    VALUES (?, ?, ?, ?, ?, ${ALLOWED_FIELDS.filter(f => stats[f] !== undefined).map(() => '?').join(', ')})
    ON CONFLICT(team_id) DO UPDATE SET ${setClauses.join(', ')}, last_updated = datetime('now')
  `;

  // 简化版本：直接 REPLACE
  const replaceSql = `
    INSERT OR REPLACE INTO team_stats (team_id, team_name_cn, team_name, league, league_cn, ${ALLOWED_FIELDS.filter(f => stats[f] !== undefined).join(', ')}, last_updated)
    VALUES (?, ?, ?, ?, ?, ${ALLOWED_FIELDS.filter(f => stats[f] !== undefined).map(() => '?').join(', ')}, datetime('now'))
  `;

  const insertParams: any[] = [teamId, teamNameCn, teamName, league, leagueCn];
  for (const field of ALLOWED_FIELDS) {
    if (stats[field] !== undefined) {
      const value = typeof stats[field] === 'object' ? (stats[field].total ?? stats[field].value ?? 0) : stats[field];
      insertParams.push(value);
    }
  }

  await run(replaceSql, insertParams);
}

/**
 * 从 team_stats 表获取球队统计
 */
export async function getTeamStatsFromDb(teamId: string): Promise<any | null> {
  try {
    return await get('SELECT * FROM team_stats WHERE team_id = ?', [teamId]);
  } catch {
    return null;
  }
}
