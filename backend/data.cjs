// CommonJS 数据模块，供 backend 使用
// 简化版 - 避免直接导入 TypeScript

const REAL_TEAMS = [
  {
    id: 'mancity',
    name: 'Manchester City',
    nameCn: '曼彻斯特城',
    league: 'EPL',
    leagueCn: '英超',
    rank: 1,
    homeStats: { played: 19, wins: 14, draws: 4, losses: 1, goalsFor: 48, goalsAgainst: 16, xgFor: 44.5, xgAgainst: 15.2 },
    awayStats: { played: 19, wins: 12, draws: 3, losses: 4, goalsFor: 39, goalsAgainst: 22, xgFor: 38.1, xgAgainst: 19.8 },
    form: ['W', 'D', 'W', 'W', 'L'],
    cleanSheets: 13,
    shotsPerGame: 16.5,
    shotAccuracy: 46,
    homeXg: 2.34,
    awayXg: 2.01,
    formLast5: [90, 65, 85, 95, 30],
  },
  {
    id: 'arsenal',
    name: 'Arsenal',
    nameCn: '阿森纳',
    league: 'EPL',
    leagueCn: '英超',
    rank: 2,
    homeStats: { played: 19, wins: 15, draws: 2, losses: 2, goalsFor: 45, goalsAgainst: 15, xgFor: 42.1, xgAgainst: 13.8 },
    awayStats: { played: 19, wins: 13, draws: 3, losses: 3, goalsFor: 40, goalsAgainst: 14, xgFor: 37.5, xgAgainst: 14.2 },
    form: ['W', 'W', 'W', 'D', 'W'],
    cleanSheets: 18,
    shotsPerGame: 15.2,
    shotAccuracy: 44,
    homeXg: 2.22,
    awayXg: 1.97,
    formLast5: [92, 88, 85, 60, 95],
  },
];

const ALL_LEAGUE_TEAMS = [
  { id: 'mancity', name: '曼彻斯特城', englishName: 'Manchester City', league: 'EPL', leagueKey: 'EPL', slug: 'mancity', realTeamId: 'mancity' },
  { id: 'arsenal', name: '阿森纳', englishName: 'Arsenal', league: 'EPL', leagueKey: 'EPL', slug: 'arsenal', realTeamId: 'arsenal' },
];

const LEAGUE_PRESETS = {
  EPL: { name: 'Premier League', nameCn: '英超', maxTeams: 20 },
  LaLiga: { name: 'La Liga', nameCn: '西甲', maxTeams: 20 },
  SerieA: { name: 'Serie A', nameCn: '意甲', maxTeams: 20 },
  Bundesliga: { name: 'Bundesliga', nameCn: '德甲', maxTeams: 18 },
  Ligue1: { name: 'Ligue 1', nameCn: '法甲', maxTeams: 18 },
};

const LEAGUES = Object.entries(LEAGUE_PRESETS).map(([id, preset]) => ({
  id,
  name: preset.name,
  nameCn: preset.nameCn,
  maxTeams: preset.maxTeams,
}));

const REAL_FIXTURES = [];

module.exports = {
  REAL_TEAMS,
  ALL_LEAGUE_TEAMS,
  LEAGUE_PRESETS,
  LEAGUES,
  REAL_FIXTURES,
};
