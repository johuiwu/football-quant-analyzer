-- ======================== 初始化建表脚本 ========================
-- 首次启动时由 Electron main.cjs 自动执行
-- 仅在 teams 表不存在时执行

-- teams 表（世界杯数据库版本，teamController/strengthService/featureService 使用）
CREATE TABLE IF NOT EXISTS teams (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  name            TEXT NOT NULL UNIQUE,
  chinese_name    TEXT,
  country_code    TEXT,
  fifa_rank       INTEGER,
  elo_rating      INTEGER,
  market_value    REAL,
  created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_teams_name ON teams(name);

-- players 表
CREATE TABLE IF NOT EXISTS players (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  player_id       INTEGER NOT NULL,
  player_name     TEXT NOT NULL,
  player_nickname TEXT,
  jersey_number   INTEGER,
  team_id         INTEGER NOT NULL,
  created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (team_id) REFERENCES teams(id),
  UNIQUE(player_id, team_id)
);
CREATE INDEX IF NOT EXISTS idx_players_team ON players(team_id);

-- player_positions 表
CREATE TABLE IF NOT EXISTS player_positions (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  player_id     INTEGER NOT NULL,
  position_id   INTEGER,
  position      TEXT,
  from_time     TEXT,
  to_time       TEXT,
  from_period   INTEGER,
  to_period     INTEGER,
  start_reason  TEXT,
  end_reason    TEXT,
  created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (player_id) REFERENCES players(id)
);
CREATE INDEX IF NOT EXISTS idx_player_positions_player ON player_positions(player_id);

-- player_cards 表
CREATE TABLE IF NOT EXISTS player_cards (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  player_id   INTEGER NOT NULL,
  time        TEXT,
  card_type   TEXT,
  reason      TEXT,
  period      INTEGER,
  created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (player_id) REFERENCES players(id)
);
CREATE INDEX IF NOT EXISTS idx_player_cards_player ON player_cards(player_id);

-- matches 表
CREATE TABLE IF NOT EXISTS matches (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  match_id            INTEGER NOT NULL UNIQUE,
  match_date          DATE NOT NULL,
  kick_off            TEXT,
  home_team_id        INTEGER NOT NULL,
  away_team_id        INTEGER NOT NULL,
  home_score          INTEGER NOT NULL,
  away_score          INTEGER NOT NULL,
  stage               TEXT,
  world_cup_year      INTEGER NOT NULL,
  competition_stage_id INTEGER,
  stadium_id          INTEGER,
  stadium             TEXT,
  stadium_country     TEXT,
  referee_id          INTEGER,
  referee             TEXT,
  referee_country     TEXT,
  created_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (home_team_id) REFERENCES teams(id),
  FOREIGN KEY (away_team_id) REFERENCES teams(id)
);
CREATE INDEX IF NOT EXISTS idx_matches_date ON matches(match_date);
CREATE INDEX IF NOT EXISTS idx_matches_home_team ON matches(home_team_id);
CREATE INDEX IF NOT EXISTS idx_matches_away_team ON matches(away_team_id);

-- team_strength_vectors 表
CREATE TABLE IF NOT EXISTS team_strength_vectors (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  team_id         INTEGER NOT NULL UNIQUE,
  offense_index   REAL NOT NULL,
  defense_index   REAL NOT NULL,
  teamwork_score  REAL NOT NULL,
  elo             INTEGER NOT NULL,
  squad_depth     REAL NOT NULL,
  overall         REAL NOT NULL,
  version         TEXT DEFAULT '1.0',
  computed_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (team_id) REFERENCES teams(id)
);
CREATE INDEX IF NOT EXISTS idx_team_strength_team ON team_strength_vectors(team_id);
CREATE INDEX IF NOT EXISTS idx_team_strength_overall ON team_strength_vectors(overall DESC);

-- data_versions 表
CREATE TABLE IF NOT EXISTS data_versions (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  data_type   TEXT NOT NULL UNIQUE,
  version     INTEGER NOT NULL,
  updated_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- model_parameters 表
CREATE TABLE IF NOT EXISTS model_parameters (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  model_name  TEXT NOT NULL UNIQUE,
  parameters  TEXT NOT NULL,
  version     TEXT DEFAULT '1.0',
  created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- corner_history 表（角球系统）
CREATE TABLE IF NOT EXISTS corner_history (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  match_id      TEXT NOT NULL,
  match_name    TEXT,
  strategy_id   TEXT,
  triggered_at  TEXT,
  bet_status    TEXT DEFAULT 'pending',
  odds          REAL,
  amount        INTEGER DEFAULT 0,
  created_at    TEXT DEFAULT CURRENT_TIMESTAMP,
  handicap      REAL,
  error_message TEXT,
  profit_loss   REAL
);
CREATE INDEX IF NOT EXISTS idx_corner_history_match ON corner_history(match_id);
CREATE INDEX IF NOT EXISTS idx_corner_history_time ON corner_history(created_at);
CREATE INDEX IF NOT EXISTS idx_corner_history_match_strategy ON corner_history(match_id, strategy_id);

-- corner_bets 表（角球投注）
CREATE TABLE IF NOT EXISTS corner_bets (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  match_id      TEXT NOT NULL,
  match_name    TEXT,
  strategy_id   TEXT,
  odds          REAL,
  amount        INTEGER DEFAULT 0,
  status        TEXT DEFAULT 'pending',
  error_message TEXT,
  executed_at   TEXT,
  retry_count   INTEGER DEFAULT 0,
  bet_target    TEXT DEFAULT NULL,
  error_reason  TEXT DEFAULT NULL,
  created_at    TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_corner_bets_status ON corner_bets(status);
CREATE INDEX IF NOT EXISTS idx_corner_bets_match ON corner_bets(match_id);

-- corner_simulation_records 表（回测模拟）
CREATE TABLE IF NOT EXISTS corner_simulation_records (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  strategy_id      TEXT,
  match_id         TEXT,
  match_name       TEXT,
  elapsed_minutes  INTEGER,
  trigger_odds     REAL,
  trigger_handicap REAL,
  bet_direction    TEXT,
  result           TEXT DEFAULT 'pending',
  profit_loss      REAL,
  created_at       TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_sim_strategy ON corner_simulation_records(strategy_id);
CREATE INDEX IF NOT EXISTS idx_sim_match ON corner_simulation_records(match_id);
CREATE INDEX IF NOT EXISTS idx_sim_time ON corner_simulation_records(created_at);
