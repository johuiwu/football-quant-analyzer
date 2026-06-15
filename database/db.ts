import { open, Database } from "sqlite";
import sqlite3 from "sqlite3";
import path from "path";

// ======================== 数据库配置 ========================

// Electron/生产环境: 支持 DB_DIR 环境变量覆盖数据库路径
const DB_BASE = process.env.DB_DIR || path.join(process.cwd(), "database");
const DB_PATH = path.join(DB_BASE, "football_data.db");

let db: Database | null = null;

export async function getDb(): Promise<Database> {
  if (db) return db;

  db = await open({
    filename: DB_PATH,
    driver: sqlite3.Database,
  });

  await db.exec("PRAGMA journal_mode=WAL");
  await db.exec("PRAGMA synchronous=NORMAL");

  await createTables(db);
  console.log("[database] SQLite 就绪:", DB_PATH);
  return db;
}

// ======================== 允许写入的字段列表（与表结构严格一致） ========================

export const ALLOWED_FIELDS = [
  // 基础统计
  "goals", "conceded", "goalDifference", "shots", "shotsOnTarget",
  "assists", "passes", "corners", "fouls", "redCards", "yellowCards",
  "penalties", "cleanSheets",
  // 场均
  "avgGoals", "avgConceded", "avgGoalDiff", "avgCorners",
  // 高阶
  "possession", "tackles", "interceptions", "clearances",
  "offsides", "foulsSuffered", "keyPasses",
  "crosses", "successfulCrosses", "longBalls", "successfulLongBalls",
  "freeKicks", "freeKickGoals",
  "dribbles", "successfulDribbles", "duelsWon",
  "fastBreaks", "fastBreakShots", "fastBreakGoals",
  "hitWoodwork", "possessionLost",
  "crossesSuccessful", "twoYellowRedCards", "effectiveBlocks",
  "passesSuccessful", "duelsTotal",
];

// ======================== 建表（重建，确保列对齐） ========================

async function createTables(database: Database) {
  // 创建 teams 表 - 保存完整球队数据
  const teamsTableExists = await database.get(
    "SELECT name FROM sqlite_master WHERE type='table' AND name='teams'"
  );
  if (!teamsTableExists) {
    await database.exec(`
      CREATE TABLE teams (
        team_id         TEXT    NOT NULL UNIQUE,
        team_name       TEXT    NOT NULL,
        team_name_cn    TEXT    NOT NULL,
        league          TEXT    NOT NULL,
        league_cn       TEXT    NOT NULL,
        rank            INTEGER DEFAULT 0,
        home_stats      TEXT,    -- JSON 格式保存主场数据 (deprecated, kept for backup)
        away_stats      TEXT,    -- JSON 格式保存客场数据 (deprecated, kept for backup)
        -- P1-6: 反规范化扁平列
        home_played     INTEGER DEFAULT 0,
        home_wins       INTEGER DEFAULT 0,
        home_draws      INTEGER DEFAULT 0,
        home_losses     INTEGER DEFAULT 0,
        home_goals_for  INTEGER DEFAULT 0,
        home_goals_against INTEGER DEFAULT 0,
        home_xg_for     REAL    DEFAULT 0,
        home_xg_against REAL    DEFAULT 0,
        away_played     INTEGER DEFAULT 0,
        away_wins       INTEGER DEFAULT 0,
        away_draws      INTEGER DEFAULT 0,
        away_losses     INTEGER DEFAULT 0,
        away_goals_for  INTEGER DEFAULT 0,
        away_goals_against INTEGER DEFAULT 0,
        away_xg_for     REAL    DEFAULT 0,
        away_xg_against REAL    DEFAULT 0,
        form            TEXT,    -- JSON 格式保存近期表现
        clean_sheets    INTEGER DEFAULT 0,
        shots_per_game  REAL    DEFAULT 0,
        shot_accuracy   INTEGER DEFAULT 0,
        home_xg         REAL    DEFAULT 0,
        away_xg         REAL    DEFAULT 0,
        form_last5      TEXT,    -- JSON 格式保存最近5场
        last_updated    DATETIME DEFAULT (datetime('now')),
        data_source     TEXT    DEFAULT 'crawler',
        elo             REAL    DEFAULT NULL,
      );
    `);

    await database.exec(
      "CREATE INDEX IF NOT EXISTS idx_teams_league ON teams(league)"
    );
  }

  // ===== 迁移：添加 elo 列（兼容旧数据库） =====
  try {
    await database.get("SELECT elo FROM teams LIMIT 1");
  } catch {
    await database.exec("ALTER TABLE teams ADD COLUMN elo REAL DEFAULT NULL");
    console.log("[database] 迁移：已添加 elo 列");
  }


  // 保留原表用于兼容
  const tableExists = await database.get(
    "SELECT name FROM sqlite_master WHERE type='table' AND name='team_stats'"
  );
  if (tableExists) return;

  await database.exec(`
    CREATE TABLE team_stats (
      team_name       TEXT    NOT NULL,
      team_name_cn    TEXT    NOT NULL,
      team_id         TEXT    NOT NULL UNIQUE,
      league          TEXT    NOT NULL,
      league_cn       TEXT    NOT NULL,

      -- 基础统计
      goals           INTEGER DEFAULT 0,
      conceded        INTEGER DEFAULT 0,
      goalDifference  INTEGER DEFAULT 0,
      shots           INTEGER DEFAULT 0,
      shotsOnTarget   INTEGER DEFAULT 0,
      assists         INTEGER DEFAULT 0,
      passes          INTEGER DEFAULT 0,
      corners         INTEGER DEFAULT 0,
      fouls           INTEGER DEFAULT 0,
      redCards        INTEGER DEFAULT 0,
      yellowCards     INTEGER DEFAULT 0,
      penalties       INTEGER DEFAULT 0,
      cleanSheets     INTEGER DEFAULT 0,

      -- 场均
      avgGoals        REAL    DEFAULT 0,
      avgConceded     REAL    DEFAULT 0,
      avgGoalDiff     REAL    DEFAULT 0,
      avgCorners      REAL    DEFAULT 0,

      -- 高阶
      possession      REAL    DEFAULT 0,
      tackles         INTEGER DEFAULT 0,
      interceptions   INTEGER DEFAULT 0,
      clearances      INTEGER DEFAULT 0,
      offsides        INTEGER DEFAULT 0,
      foulsSuffered   INTEGER DEFAULT 0,
      keyPasses       INTEGER DEFAULT 0,
      crosses         INTEGER DEFAULT 0,
      crossesSuccessful    INTEGER DEFAULT 0,
      successfulCrosses    INTEGER DEFAULT 0,
      longBalls       INTEGER DEFAULT 0,
      successfulLongBalls  INTEGER DEFAULT 0,
      freeKicks       INTEGER DEFAULT 0,
      freeKickGoals   INTEGER DEFAULT 0,
      dribbles        INTEGER DEFAULT 0,
      successfulDribbles   INTEGER DEFAULT 0,
      duelsWon        INTEGER DEFAULT 0,
      fastBreaks      INTEGER DEFAULT 0,
      fastBreakShots  INTEGER DEFAULT 0,
      fastBreakGoals  INTEGER DEFAULT 0,
      hitWoodwork     INTEGER DEFAULT 0,
      possessionLost  INTEGER DEFAULT 0,
      twoYellowRedCards     INTEGER DEFAULT 0,
      effectiveBlocks       INTEGER DEFAULT 0,
      passesSuccessful INTEGER DEFAULT 0,
      duelsTotal       INTEGER DEFAULT 0,

      last_updated    DATETIME DEFAULT (datetime('now')),
      data_source     TEXT    DEFAULT 'crawler'
    );
  `);

  await database.exec(
    "CREATE INDEX IF NOT EXISTS idx_team_stats_league ON team_stats(league)"
  );
}

// ======================== CRUD 操作 ========================

export interface TeamStatsRow {
  team_name: string;
  team_name_cn: string;
  team_id: string;
  league: string;
  league_cn: string;
  goals: number;
  conceded: number;
  goalDifference: number;
  shots: number;
  shotsOnTarget: number;
  assists: number;
  passes: number;
  possession: number;
  corners: number;
  fouls: number;
  redCards: number;
  yellowCards: number;
  cleanSheets: number;
  avgGoals: number;
  avgConceded: number;
  tackles: number;
  interceptions: number;
  clearances: number;
  keyPasses: number;
  crosses: number;
  longBalls: number;
  duelsWon: number;
  fastBreakShots: number;
  fastBreakGoals: number;
  hitWoodwork: number;
  offsides: number;
  last_updated: string;
  data_source: string;
}

// 将爬虫返回的 RankedValue 转为数值
function total(v: any): number {
  if (v === undefined || v === null) return 0;
  if (typeof v === "number") return v;
  if (typeof v.total === "number") return v.total;
  return 0;
}

// 将 possession 转为 REAL (移除 %)
function pct(v: any): number {
  if (!v) return 0;
  if (typeof v === "number") return v;
  if (typeof v.value === "string") return parseFloat(v.value) || 0;
  if (typeof v.total === "number") return v.total;
  return 0;
}

const INSERT_COLS = [
  "team_name", "team_name_cn", "team_id", "league", "league_cn",
  "goals", "conceded", "goalDifference", "shots", "shotsOnTarget",
  "assists", "passes", "corners", "fouls", "redCards", "yellowCards",
  "penalties", "cleanSheets",
  "avgGoals", "avgConceded", "avgGoalDiff", "avgCorners",
  "possession", "tackles", "interceptions", "clearances",
  "offsides", "foulsSuffered", "keyPasses",
  "crosses", "crossesSuccessful", "successfulCrosses",
  "longBalls", "successfulLongBalls",
  "freeKicks", "freeKickGoals",
  "dribbles", "successfulDribbles", "duelsWon",
  "fastBreaks", "fastBreakShots", "fastBreakGoals",
  "hitWoodwork", "possessionLost",
  "twoYellowRedCards", "effectiveBlocks",
  "passesSuccessful", "duelsTotal",
  "last_updated", "data_source",
];

/** 写入/更新（精确对齐表列数） */
export async function upsertTeamStats(
  teamId: string,
  teamNameCn: string,
  teamName: string,
  league: string,
  leagueCn: string,
  stats: Record<string, any>
): Promise<void> {
  const d = await getDb();

  const vals: any[] = [
    teamName, teamNameCn, teamId, league, leagueCn,
    total(stats.goals), total(stats.conceded), total(stats.goalDifference),
    total(stats.shots), total(stats.shotsOnTarget),
    total(stats.assists), total(stats.passes),
    total(stats.corners), total(stats.fouls),
    total(stats.redCards), total(stats.yellowCards),
    total(stats.penalties), total(stats.cleanSheets),
    total(stats.avgGoals), total(stats.avgConceded),
    total(stats.avgGoalDiff), total(stats.avgCorners),
    pct(stats.possession),
    total(stats.tackles), total(stats.interceptions),
    total(stats.clearances), total(stats.offsides),
    total(stats.foulsSuffered), total(stats.keyPasses),
    total(stats.crosses), total(stats.crossesSuccessful),
    total(stats.successfulCrosses),
    total(stats.longBalls), total(stats.successfulLongBalls),
    total(stats.freeKicks), total(stats.freeKickGoals),
    total(stats.dribbles), total(stats.successfulDribbles),
    total(stats.duelsWon),
    total(stats.fastBreaks), total(stats.fastBreakShots),
    total(stats.fastBreakGoals), total(stats.hitWoodwork),
    total(stats.possessionLost),
    total(stats.twoYellowRedCards), total(stats.effectiveBlocks),
    total(stats.passesSuccessful), total(stats.duelsTotal),
    new Date().toISOString().slice(0, 19).replace("T", " "),
    "crawler",
  ];

  const placeholders = vals.map(() => "?").join(", ");
  const cols = INSERT_COLS.join(", ");

  await d.run(
    `INSERT OR REPLACE INTO team_stats (${cols}) VALUES (${placeholders})`,
    vals
  );

  console.log(`[database] ✓ ${teamNameCn} 写入成功`);
}

/** 按 team_id 查询 */
export async function getTeamStatsFromDb(teamId: string): Promise<TeamStatsRow | null> {
  const d = await getDb();
  return d.get<TeamStatsRow>(
    "SELECT * FROM team_stats WHERE team_id = ?",
    [teamId]
  ) as Promise<TeamStatsRow | null>;
}

/** 查询所有球队，按联赛分组 */
export async function getAllTeamsGrouped(): Promise<Record<string, TeamStatsRow[]>> {
  const d = await getDb();
  const rows = await d.all<TeamStatsRow[]>(
    "SELECT * FROM team_stats ORDER BY league, goals DESC"
  );
  const grouped: Record<string, TeamStatsRow[]> = {};
  for (const row of rows) {
    if (!grouped[row.league]) grouped[row.league] = [];
    grouped[row.league]!.push(row);
  }
  return grouped;
}

/** 检查数据是否在 N 小时内 */
export function isStale(lastUpdated: string, maxHours = 24): boolean {
  const updated = Date.parse(lastUpdated);
  if (isNaN(updated)) return true;
  return Date.now() - updated > maxHours * 60 * 60 * 1000;
}

// ======================== 完整球队数据操作 ========================

export interface CompleteTeam {
  id: string;
  name: string;
  nameCn: string;
  league: string;
  leagueCn: string;
  rank: number;
  homeStats: any;
  awayStats: any;
  form: string[];
  cleanSheets: number;
  shotsPerGame: number;
  shotAccuracy: number;
  homeXg: number;
  awayXg: number;
  formLast5: number[];
  elo?: number;
}

/** 保存完整球队数据 */
export async function saveCompleteTeam(team: CompleteTeam): Promise<void> {
  const d = await getDb();

  await d.run(
    `INSERT OR REPLACE INTO teams (
      team_id, team_name, team_name_cn, league, league_cn,
      rank, home_stats, away_stats, form,
      home_played, home_wins, home_draws, home_losses,
      home_goals_for, home_goals_against, home_xg_for, home_xg_against,
      away_played, away_wins, away_draws, away_losses,
      away_goals_for, away_goals_against, away_xg_for, away_xg_against,
      clean_sheets, shots_per_game, shot_accuracy,
      home_xg, away_xg, form_last5, elo, last_updated, data_source
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      team.id,
      team.name,
      team.nameCn,
      team.league,
      team.leagueCn,
      team.rank,
      JSON.stringify(team.homeStats),
      JSON.stringify(team.awayStats),
      JSON.stringify(team.form),
      team.homeStats?.played ?? 0,
      team.homeStats?.wins ?? 0,
      team.homeStats?.draws ?? 0,
      team.homeStats?.losses ?? 0,
      team.homeStats?.goalsFor ?? 0,
      team.homeStats?.goalsAgainst ?? 0,
      team.homeStats?.xgFor ?? 0,
      team.homeStats?.xgAgainst ?? 0,
      team.awayStats?.played ?? 0,
      team.awayStats?.wins ?? 0,
      team.awayStats?.draws ?? 0,
      team.awayStats?.losses ?? 0,
      team.awayStats?.goalsFor ?? 0,
      team.awayStats?.goalsAgainst ?? 0,
      team.awayStats?.xgFor ?? 0,
      team.awayStats?.xgAgainst ?? 0,
      team.cleanSheets,
      team.shotsPerGame,
      team.shotAccuracy,
      team.homeXg,
      team.awayXg,
      JSON.stringify(team.formLast5),
      team.elo ?? null,
      new Date().toISOString().slice(0, 19).replace("T", " "),
      "crawler",
    ]
  );

  console.log(`[database] ✓ ${team.nameCn} 完整数据保存成功`);
}

/** 从数据库读取所有完整球队数据 */
export async function getAllCompleteTeams(): Promise<CompleteTeam[]> {
  const d = await getDb();
  const rows = await d.all<
    {
      team_id: string;
      team_name: string;
      team_name_cn: string;
      league: string;
      league_cn: string;
      rank: number;
      home_stats: string;
      away_stats: string;
      form: string;
      clean_sheets: number;
      shots_per_game: number;
      shot_accuracy: number;
      home_xg: number;
      away_xg: number;
      form_last5: string;
      home_played: number;
      home_wins: number;
      home_draws: number;
      home_losses: number;
      home_goals_for: number;
      home_goals_against: number;
      home_xg_for: number;
      home_xg_against: number;
      away_played: number;
      away_wins: number;
      away_draws: number;
      away_losses: number;
      away_goals_for: number;
      away_goals_against: number;
      away_xg_for: number;
      away_xg_against: number;
      elo: number;
    }[]
  >("SELECT * FROM teams");

  return rows.map((row) => {
    // P1-6: 优先从平面列构建，0 值时回退到 JSON 列
    const hasFlatHome = (row.home_played ?? 0) > 0 || (row.home_wins ?? 0) > 0 || (row.home_draws ?? 0) > 0 || (row.home_losses ?? 0) > 0;
    const hasFlatAway = (row.away_played ?? 0) > 0 || (row.away_wins ?? 0) > 0 || (row.away_draws ?? 0) > 0 || (row.away_losses ?? 0) > 0;

    let homeStats, awayStats;
    if (hasFlatHome) {
      homeStats = {
        played: row.home_played ?? 0,
        wins: row.home_wins ?? 0,
        draws: row.home_draws ?? 0,
        losses: row.home_losses ?? 0,
        goalsFor: row.home_goals_for ?? 0,
        goalsAgainst: row.home_goals_against ?? 0,
        xgFor: row.home_xg_for ?? 0,
        xgAgainst: row.home_xg_against ?? 0,
      };
    } else {
      homeStats = JSON.parse(row.home_stats || "{}");
    }

    if (hasFlatAway) {
      awayStats = {
        played: row.away_played ?? 0,
        wins: row.away_wins ?? 0,
        draws: row.away_draws ?? 0,
        losses: row.away_losses ?? 0,
        goalsFor: row.away_goals_for ?? 0,
        goalsAgainst: row.away_goals_against ?? 0,
        xgFor: row.away_xg_for ?? 0,
        xgAgainst: row.away_xg_against ?? 0,
      };
    } else {
      awayStats = JSON.parse(row.away_stats || "{}");
    }

    return {
      id: row.team_id,
      name: row.team_name,
      nameCn: row.team_name_cn,
      league: row.league,
      leagueCn: row.league_cn,
      rank: row.rank,
      homeStats,
      awayStats,
      form: (() => {
        const raw = row.form;
        if (!raw) return ['D','D','D','D','D'];
        try { return JSON.parse(raw); } catch {}
        return raw.split('').slice(0, 5);
      })(),
      cleanSheets: row.clean_sheets,
      shotsPerGame: row.shots_per_game,
      shotAccuracy: row.shot_accuracy,
      homeXg: row.home_xg,
      awayXg: row.away_xg,
      formLast5: (() => {
        const raw = row.form_last5;
        if (!raw) return [];
        try { return JSON.parse(raw); } catch {}
        return [];
      })(),
      elo: row.elo ?? undefined,
    };
  });
}

/** 检查数据库中是否有球队数据 */
export async function hasTeamsData(): Promise<boolean> {
  const d = await getDb();
  const count = await d.get<{ count: number }>(
    "SELECT COUNT(*) as count FROM teams"
  );
  return (count?.count || 0) > 0;
}

/** 关闭数据库 */
export async function closeDb(): Promise<void> {
  if (db) {
    await db.close();
    db = null;
  }
}

// ======================== betting_history CRUD ========================

export interface BettingRecord {
  match_id: string;
  league: string;
  home_bet: number;
  away_bet: number;
  draw_bet: number;
  recorded_at?: string;
}

export interface BettingStats {
  mean: number;
  stdDev: number;
  count: number;
}

/** ???????? */
export async function saveBettingRecord(record: BettingRecord): Promise<void> {
  const d = await getDb();
  await d.run(
    `INSERT INTO betting_history (match_id, league, home_bet, away_bet, draw_bet)
     VALUES (?, ?, ?, ?, ?)`,
    [record.match_id, record.league, record.home_bet, record.away_bet, record.draw_bet]
  );
}

/** ????????????????????? = home+away+draw? */
export async function getBettingStatsByLeague(
  league: string,
  limit: number = 30
): Promise<BettingStats> {
  const d = await getDb();
  const rows = await d.all<{ total_bet: number }[]>(
    `SELECT (home_bet + away_bet + draw_bet) as total_bet
     FROM betting_history
     WHERE league = ?
     ORDER BY recorded_at DESC
     LIMIT ?`,
    [league, limit]
  );

  if (!rows || rows.length === 0) {
    return { mean: 0, stdDev: 0, count: 0 };
  }

  const values = rows.map(r => r.total_bet);
  const n = values.length;
  const mean = values.reduce((s, v) => s + v, 0) / n;
  const variance = values.reduce((s, v) => s + (v - mean) ** 2, 0) / Math.max(1, n - 1);
  const stdDev = Math.sqrt(variance);

  return { mean, stdDev, count: n };
}
