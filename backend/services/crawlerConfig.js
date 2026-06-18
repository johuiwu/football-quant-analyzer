// ======================== 爬虫配置：所有 DOM 选择器集中管理 ========================
// 修改此文件即可热更新选择器，无需改动 cornerCrawler.js 逻辑

export const SELECTORS = {
  // ---- Soccer 导航 ----
  soccerBtn: "old_ft_live_league",       // ID of Soccer button in sidebar

  // ---- Tab 标签 ----
  tabHdpOu: "tab_rnou",                  // "HDP & O/U" tab
  tabCorners: "tab_cn",                  // "CORNERS" tab
  tabHome: "home_page",                  // "HOME" button for navigation back

  // ---- 比赛容器 ----
  container: "div.box_lebet_top",         // Top-level match container (In-Play)
  leftPanel: "div.box_lebet_l",           // Left panel: teams, scores, time
  rightPanel: "div.box_lebet_r",          // Right panel: odds data

  // ---- 球队 & 比分 ----
  teamHome: "div.box_team.teamH span.text_team",
  teamAway: "div.box_team.teamC span.text_team",
  scorePoints: "div.box_score span.text_point",
  timeText: "tt.text_time i.txt_bk",     // Primary time element
  timeFallback: "tt.text_time",          // Fallback time element

  // ---- 角球统计 ----
  totalCorners: "span.game_total",

  // ---- HDP/O/U tab 盘口 ----
  hdpForm: "div.form_lebet_hdpou.hdpou_ft",
  hdpHeadLabel: "div.head_lebet span",
  hdpCol: "div.col_hdpou",
  hdpOddBtn: "div.btn_hdpou_odd",
  hdpBallhead: "tt.text_ballhead",
  hdpOdds: "span.text_odds",

  // ---- Corners tab 盘口 ----
  oddBlocks: "div.box_lebet_odd",
  oddBlockHalf: "box_lebet_half",        // class for half-period blocks
  oddHeadSpan: "div.head_lebet span",
  oddHeadTT: "div.head_lebet tt",        // 1H tag in half blocks
  oddBtn: "div.btn_lebet_odd",
  oddBallou: "tt.text_ballou",           // O/U/E label
  oddBallhead: "tt.text_ballhead",       // Line number
  oddOdds: "span.text_odds",            // Odds number

  // ---- 联赛名 ----
  leaName: "#lea_name",

  // ---- 通用回退 ----
  genericContainer: "div[class*='box_lebet']",
};

// ---- 盘口标签映射（中文→英文） ----
export const MARKET_LABEL_MAP = {
  'O/U': 'O/U', '大/小': 'O/U', '大小': 'O/U', 'Over/Under': 'O/U',
  'HDP': 'HDP', '让球': 'HDP', 'Handicap': 'HDP',
  'NEXT CORNER': 'NEXT_CORNER', 'Next Corner': 'NEXT_CORNER', '下个角球': 'NEXT_CORNER',
  'O/E': 'O/E', '单/双': 'O/E', '单双': 'O/E', 'Odd/Even': 'O/E',
  '1X2': '1X2', '1 X 2': '1X2', '独赢': '1X2',
};

// ---- 轮询配置 ----
export const POLL_CONFIG = {
  interval: parseInt(process.env.CRAWLER_POLL_INTERVAL || "15000", 10),
  lockTimeout: 180000,                   // 3 min lock timeout
  cacheExpireMs: 30000,                  // 30s cache expiry
  alertThreshold: 3,                     // Consecutive failures before alert
  soccerRenderTimeout: 15000,            // Soccer container render timeout
  hdpRenderTimeout: 10000,               // HDP data render timeout
  cornerRenderTimeout: 10000,            // CORNERS data render timeout
};
