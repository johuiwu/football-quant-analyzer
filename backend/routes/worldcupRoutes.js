import { Router } from 'express';
import fs from 'fs';
import path from 'path';
import { predictMatch, predictMatchWithStats, simulateGroupStage } from '../services/worldcupPredictionService.js';
import { WORLD_CUP_TEAMS, WORLD_CUP_FIXTURES_2026, worldcupTeamIdToName } from '../../src/data/worldcup_data.js';
import { fetchMultipleTeamsRecentStats, fetchWorldCupMatchResults } from '../services/worldcupDataFetcher.js';
import { fetchStandings } from '../services/worldcupStandingsCrawler.js';

const TEAM_STATS_FILE = path.resolve(process.cwd(), 'src', 'data', 'worldcup_team_stats.json');
const TEAM_STATS_TS_FILE = path.resolve(process.cwd(), 'src', 'data', 'worldcup_team_stats.ts');

const router = Router();

const teamRecentStatsMap = {};

router.get('/worldcup/fixtures', (req, res) => {
  try {
    res.json({
      success: true,
      fixtures: WORLD_CUP_FIXTURES_2026,
      count: WORLD_CUP_FIXTURES_2026.length
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.post('/worldcup/predict', async (req, res) => {
  try {
    const { homeTeamId, awayTeamId, stage } = req.body;

    const homeTeam = WORLD_CUP_TEAMS.find(t => t.id === homeTeamId);
    const awayTeam = WORLD_CUP_TEAMS.find(t => t.id === awayTeamId);

    if (!homeTeam || !awayTeam) {
      return res.status(400).json({ success: false, message: 'Team not found' });
    }

    const homeStats = teamRecentStatsMap[homeTeamId];
    const awayStats = teamRecentStatsMap[awayTeamId];

    let result;
    if (homeStats || awayStats) {
      result = await predictMatchWithStats(homeTeam, awayTeam, stage || 'group', homeStats, awayStats);
    } else {
      result = await predictMatch(homeTeam, awayTeam, stage || 'group');
    }

    res.json(result);
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.post('/worldcup/predict-batch', async (req, res) => {
  try {
    const { fixtures } = req.body;

    if (!Array.isArray(fixtures) || fixtures.length === 0) {
      return res.status(400).json({ success: false, message: 'fixtures array required' });
    }

    const results = [];
    for (const fixture of fixtures) {
      const { fixtureId, homeTeamId, awayTeamId, stage } = fixture;

      const homeTeam = WORLD_CUP_TEAMS.find(t => t.id === homeTeamId);
      const awayTeam = WORLD_CUP_TEAMS.find(t => t.id === awayTeamId);

      if (!homeTeam || !awayTeam) {
        results.push({ fixtureId, error: 'Team not found' });
        continue;
      }

      const homeStats = teamRecentStatsMap[homeTeamId];
      const awayStats = teamRecentStatsMap[awayTeamId];

      let prediction;
      if (homeStats || awayStats) {
        prediction = await predictMatchWithStats(homeTeam, awayTeam, stage || 'group', homeStats, awayStats);
      } else {
        prediction = await predictMatch(homeTeam, awayTeam, stage || 'group');
      }

      results.push({
        fixtureId,
        ...prediction
      });
    }

    res.json({
      success: true,
      results,
      total: results.length
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.get('/worldcup/group-stage', (req, res) => {
  try {
    const groups = {};

    for (const team of WORLD_CUP_TEAMS) {
      const teamInfo = worldcupTeamIdToName[team.id];
      if (teamInfo) {
        const group = teamInfo.group;
        if (!groups[group]) {
          groups[group] = [];
        }
        groups[group].push(team);
      }
    }

    const totalTeams = Object.values(groups).reduce((sum, arr) => sum + arr.length, 0);
    const simulationResults = simulateGroupStage(groups, 3000);

    res.json({
      success: true,
      results: simulationResults,
      groups,
      partial: simulationResults.length < totalTeams
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.get('/worldcup/refresh-data', async (req, res) => {
  try {
    const teams = WORLD_CUP_TEAMS.map(t => ({ id: t.id, name: worldcupTeamIdToName[t.id]?.en || t.id }));
    const results = await fetchMultipleTeamsRecentStats(teams);
    let updatedCount = 0;
    for (const [teamId, stats] of Object.entries(results)) {
      if (stats && stats.length > 0) {
        teamRecentStatsMap[teamId] = stats;
        updatedCount++;
      }
    }
    res.json({ success: true, updated: updatedCount, total: teams.length });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.get('/worldcup/cached-stats', (req, res) => {
  res.json({
    success: true,
    teamCount: Object.keys(teamRecentStatsMap).length,
    teams: Object.keys(teamRecentStatsMap)
  });
});

router.get('/worldcup/match-results', async (req, res) => {
  try {
    const scores = await fetchWorldCupMatchResults();
    // scores now contains per-team stats: [{ participantName, goals, xG, played, homeScore, awayScore }]
    // Map over fixtures and fill scores where we have team data
    const fixtureIds = WORLD_CUP_FIXTURES_2026.map(f => f.id);
    const teamScoreMap = {};
    for (const s of scores) {
      teamScoreMap[s.participantName] = s;
    }
    const results = fixtureIds.map((fixtureId) => ({
      fixtureId,
      homeScore: null,
      awayScore: null
    }));
    res.json({ success: true, results, teamStats: scores });
  } catch (error) {
    res.json({ success: true, results: [] });
  }
});

// ---- livescore API 辅助函数 ----

const LS_API_BASE = 'https://prod-cdn-stats-api.livescore.com/api/v1/competition/734/participantStats/group';
const LS_CATEGORIES = ['goals', 'goals_conceded', 'assist', 'shots_on_target', 'shots', 'successful_dribbles', 'clean_sheets', 'yellow_cards', 'red_cards'];
const API_FETCH_TIMEOUT = 10000;

const LIVESCORE_TO_TEAM_ID = {
  'USA': 'meiguo', 'Australia': 'aodaliya', 'Mexico': 'moxige', 'South Korea': 'hanguo',
  'Paraguay': 'balagui', 'Qatar': 'kataer', 'Czechia': 'jieke1', 'Bosnia and Herzegovina': 'bohei1',
  'Scotland': 'sugelan', 'Canada': 'jianada', 'Brazil': 'baxi', 'Morocco': 'moluoge',
  'Switzerland': 'ruishi', 'South Africa': 'nanfei', 'Haiti': 'haidi', 'Turkiye': 'tuerqi1',
  'Germany': 'deguo', 'Curaçao': 'kulasuo', 'Curacao': 'kulasuo', "Côte d'Ivoire": 'ketediwa1', 'Ivory Coast': 'ketediwa1', 'Ecuador': 'eguaduoer',
  'Netherlands': 'helan', 'Japan': 'riben', 'Sweden': 'ruidian1', 'Tunisia': 'tunisi1',
  'Belgium': 'bilishi', 'Egypt': 'aiji1', 'Iran': 'yilang', 'New Zealand': 'xinxilan1',
  'Spain': 'xibanya', 'Cape Verde': 'fodejiao1', 'Saudi Arabia': 'shatealabo', 'Uruguay': 'wulagui',
  'France': 'faguo', 'Senegal': 'saineijiaer', 'Iraq': 'yilake1', 'Norway': 'nuowei',
  'Argentina': 'agenting', 'Algeria': 'aerjiliya', 'Austria': 'aodili', 'Jordan': 'yuedan1',
  'Portugal': 'putaoya', 'DR Congo': 'minzhugangguo', 'Uzbekistan': 'wuzibiekesitan', 'Colombia': 'gelunbiya',
  'England': 'yinggelan', 'Croatia': 'keluodiya', 'Ghana': 'jiana', 'Panama': 'banama',
  'Korea Republic': 'hanguo', 'Czech Republic': 'jieke1', 'Turkey': 'tuerqi1',
  'United States': 'meiguo', 'Bosnia': 'bohei1'
};

function isEstimatedDefault(stats) {
  if (!stats) return true;
  const fields = ['avgXgFor', 'avgXgAgainst', 'avgPossession', 'avgShots', 'avgShotsOnTarget', 'avgGoalsFor', 'avgGoalsAgainst', 'avgCorners', 'winRate'];
  for (const f of fields) {
    if (typeof stats[f] !== 'number' || isNaN(stats[f])) return true;
  }
  // API 写入的真实数据特征：avgXgAgainst 或 avgGoalsAgainst 为 0（API 不提供失球数据）
  // 但如果 avgXgAgainst === 0 且 avgXgFor > 0，说明是 API 数据而非估算值
  if (stats.avgXgAgainst === 0 && stats.avgXgFor > 0) return false;
  if (stats.avgGoalsAgainst === 0 && stats.avgGoalsFor > 0) return false;
  const typicalWR = [0.20, 0.25, 0.30, 0.35, 0.40, 0.45, 0.50, 0.55, 0.60, 0.65, 0.70];
  if (typicalWR.includes(stats.winRate) && stats.avgShots === Math.round(stats.avgShots)) return true;
  return false;
}

function migrateFromTsFile() {
  try {
    if (!fs.existsSync(TEAM_STATS_TS_FILE)) return;
    const content = fs.readFileSync(TEAM_STATS_TS_FILE, 'utf-8');
    const stats = {};
    const regex = /(\w+):\s*\{([^}]+)\}/g;
    let match;
    while ((match = regex.exec(content)) !== null) {
      const teamId = match[1];
      if (teamId === 'default' || teamId === 'export' || teamId === 'const') continue;
      const fieldsStr = match[2];
      const fields = {};
      const fieldRegex = /(\w+):\s*([\d.]+)/g;
      let fm;
      while ((fm = fieldRegex.exec(fieldsStr)) !== null) {
        fields[fm[1]] = parseFloat(fm[2]);
      }
      if (Object.keys(fields).length >= 5) {
        stats[teamId] = fields;
      }
    }
    fs.writeFileSync(TEAM_STATS_FILE, JSON.stringify(stats, null, 2), 'utf-8');
    console.log(`[worldcupRoutes] Migrated ${Object.keys(stats).length} team stats from TS to JSON`);
  } catch (error) {
    console.error('[worldcupRoutes] Migration from TS failed:', error.message);
  }
}

async function fetchLivescoreCategory(category) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), API_FETCH_TIMEOUT);
  try {
    const res = await fetch(`${LS_API_BASE}/${category}?limit=50&locale=en`, {
      signal: controller.signal,
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function fetchAllLivescoreStats() {
  const results = await Promise.all(LS_CATEGORIES.map(cat => fetchLivescoreCategory(cat)));
  const teamData = {};
  for (let ci = 0; ci < LS_CATEGORIES.length; ci++) {
    const data = results[ci];
    if (!data?.group?.participants) continue;
    const category = LS_CATEGORIES[ci];
    for (const p of data.group.participants) {
      const name = data.participants?.find(x => x.id === p.id)?.name || p.id;
      if (!teamData[name]) teamData[name] = {};
      teamData[name][category] = p;
    }
  }
  return teamData;
}

function convertToSystemStats(livescoreData) {
  const results = {};
  for (const [lsName, data] of Object.entries(livescoreData)) {
    const teamId = LIVESCORE_TO_TEAM_ID[lsName];
    if (!teamId) continue;
    const goals = data.goals;
    const goalsConceded = data.goals_conceded;
    const shots = data.shots;
    const shotsOnTarget = data.shots_on_target;
    const cleanSheets = data.clean_sheets;
    if (!goals) continue;
    const played = cleanSheets?.p || 0;
    const gC = goalsConceded?.gC || 0;
    const xGc = goalsConceded?.xGc || 0;
    results[teamId] = {
      totalPlayed: played,
      avgXgFor: goals.xG != null ? goals.xG : 0,
      avgXgAgainst: xGc,
      avgPossession: 50,
      avgShots: shots?.pG || 0,
      avgShotsOnTarget: shotsOnTarget?.pG || 0,
      avgGoalsFor: goals.g,
      avgGoalsAgainst: gC,
      avgCorners: 3.5,
      winRate: played > 0 ? Math.max(0, Math.min(1, 0.5 + (goals.df || 0) / (played * 4))) : 0
    };
  }
  return results;
}

/** 从 worldcup_team_stats.json 文件中读取所有球队统计数据 */
function readStatsFromFile() {
  if (!fs.existsSync(TEAM_STATS_FILE)) {
    migrateFromTsFile();
  }
  try {
    const content = fs.readFileSync(TEAM_STATS_FILE, 'utf-8');
    return JSON.parse(content);
  } catch (error) {
    console.error('[worldcupRoutes] Failed to read stats JSON:', error.message);
    return {};
  }
}

// ---- 获取所有球队统计数据端点 ----

router.get('/worldcup/team-stats', (req, res) => {
  try {
    const stats = readStatsFromFile();
    res.json({ success: true, stats, count: Object.keys(stats).length });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// ---- 刷新球队统计数据端点 ----

router.post('/worldcup/refresh-team-stats', async (req, res) => {
  try {
    const apiData = await fetchAllLivescoreStats();
    const converted = convertToSystemStats(apiData);

    // Read current stats from JSON file
    const currentStats = readStatsFromFile();
    let updated = 0;
    let changed = 0;

    for (const [teamId, stats] of Object.entries(converted)) {
      const newStats = {
        avgXgFor: stats.avgXgFor,
        avgXgAgainst: stats.avgXgAgainst,
        avgPossession: Math.round(stats.avgPossession),
        avgShots: stats.avgShots,
        avgShotsOnTarget: stats.avgShotsOnTarget,
        avgGoalsFor: stats.avgGoalsFor,
        avgGoalsAgainst: stats.avgGoalsAgainst,
        avgCorners: stats.avgCorners,
        winRate: stats.winRate,
      };

      // Check if data actually changed
      const oldStats = currentStats[teamId];
      if (!oldStats || JSON.stringify(oldStats) !== JSON.stringify(newStats)) {
        changed++;
      }

      currentStats[teamId] = newStats;
      updated++;
    }

    // Backup and write JSON file
    if (updated > 0) {
      if (!fs.existsSync(TEAM_STATS_FILE + '.bak') && fs.existsSync(TEAM_STATS_FILE)) {
        fs.copyFileSync(TEAM_STATS_FILE, TEAM_STATS_FILE + '.bak');
      }
      fs.writeFileSync(TEAM_STATS_FILE, JSON.stringify(currentStats, null, 2), 'utf-8');
    }

    // Also update in-memory teamRecentStatsMap for prediction services
    for (const [teamId, stats] of Object.entries(converted)) {
      teamRecentStatsMap[teamId] = [{
        xg: stats.avgXgFor,
        xga: stats.avgXgAgainst,
        possession: stats.avgPossession,
        shotsOnTarget: stats.avgShotsOnTarget,
        corners: stats.avgCorners,
        goalsFor: stats.avgGoalsFor,
        goalsAgainst: stats.avgGoalsAgainst,
      }];
    }

    res.json({ success: true, updated, changed, total: Object.keys(converted).length });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// ---- 赛程比分数据端点 ----

const SCHEDULE_CACHE = { data: null, time: 0 };
const SCHEDULE_CACHE_TTL = 120000;

router.get('/worldcup/schedule-scores', async (req, res) => {
  try {
    if (Date.now() - SCHEDULE_CACHE.time < SCHEDULE_CACHE_TTL && SCHEDULE_CACHE.data) {
      return res.json(SCHEDULE_CACHE.data);
    }

    const [goalsJson, cleanSheetsJson] = await Promise.all([
      fetchLsCategory('goals'),
      fetchLsCategory('clean_sheets'),
    ]);

    if (!goalsJson?.group?.participants) {
      return res.json({ success: true, fixtures: WORLD_CUP_FIXTURES_2026.map(f => ({ ...f, completed: false, stats: null })) });
    }

    const teamStats = {};
    const todayStr = new Date().toISOString().slice(0, 10);
    for (const p of goalsJson.group.participants) {
      const name = goalsJson.participants?.find(x => x.id === p.id)?.name || '';
      const teamId = LIVESCORE_TO_TEAM_ID[name];
      if (!teamId) continue;
      const cs = cleanSheetsJson?.group?.participants?.find(x => x.id === p.id);
      const played = cs?.p || 0;
      const goalsScored = p.g || 0;
      const goalDiff = p.df || 0;
      const goalsConceded = goalsScored - goalDiff;
      teamStats[teamId] = { played, goalsScored, goalsConceded, xG: p.xG || 0, goalDiff };
    }

    const fixtures = WORLD_CUP_FIXTURES_2026.map(f => {
      const homeHasStats = teamStats[f.homeTeam] && teamStats[f.homeTeam].played > 0;
      const awayHasStats = teamStats[f.awayTeam] && teamStats[f.awayTeam].played > 0;
      const isDatePast = f.date <= todayStr;
      const completed = homeHasStats && awayHasStats && isDatePast;
      return {
        ...f,
        completed,
        stats: completed ? { home: teamStats[f.homeTeam], away: teamStats[f.awayTeam] } : null
      };
    });

    const result = { success: true, fixtures, teamStats };
    SCHEDULE_CACHE.data = result;
    SCHEDULE_CACHE.time = Date.now();
    res.json(result);
  } catch (error) {
    res.json({ success: true, fixtures: WORLD_CUP_FIXTURES_2026.map(f => ({ ...f, completed: false, stats: null })) });
  }
});

async function fetchLsCategory(category) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), API_FETCH_TIMEOUT);
  try {
    const res = await fetch(`${LS_API_BASE}/${category}?limit=50&locale=en`, {
      signal: controller.signal,
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// ---- 积分榜数据端点 (Puppeteer 爬取 livescore) ----

const STANDINGS_CACHE = { data: null, time: 0 };
const STANDINGS_CACHE_TTL = 5 * 60 * 1000; // 5 分钟缓存

router.get('/worldcup/standings', async (req, res) => {
  try {
    if (Date.now() - STANDINGS_CACHE.time < STANDINGS_CACHE_TTL && STANDINGS_CACHE.data) {
      return res.json(STANDINGS_CACHE.data);
    }

    const result = await fetchStandings();
    if (!result.success) {
      if (STANDINGS_CACHE.data) {
        return res.json({ ...STANDINGS_CACHE.data, cached: true });
      }
      return res.status(503).json({ success: false, message: result.error || '爬取积分榜失败' });
    }

    const response = { success: true, groups: result.groups, updatedAt: new Date().toISOString() };
    STANDINGS_CACHE.data = response;
    STANDINGS_CACHE.time = Date.now();
    res.json(response);
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.post('/worldcup/refresh-standings', async (req, res) => {
  try {
    const result = await fetchStandings();
    if (!result.success) {
      return res.status(503).json({ success: false, message: result.error || '爬取积分榜失败' });
    }

    const response = { success: true, groups: result.groups, updatedAt: new Date().toISOString() };
    STANDINGS_CACHE.data = response;
    STANDINGS_CACHE.time = Date.now();
    res.json(response);
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.post('/worldcup/sync-teams', async (req, res) => {
  try {
    const { apiKey } = req.body;
    if (!apiKey) {
      return res.status(400).json({ success: false, msg: 'API Key is required' });
    }

    const response = await fetch('https://v3.football.api-sports.io/teams?league=1&season=2026', {
      headers: { 'x-apisports-key': apiKey }
    });

    if (!response.ok) {
      return res.status(response.status).json({ success: false, msg: `API-Football returned ${response.status}` });
    }

    const data = await response.json();

    if (!data.response || data.response.length === 0) {
      return res.json({ success: false, msg: '获取球队列表失败', count: 0, teams: [] });
    }

    // Build reverse mapping: English name → system teamId
    const nameToTeamId = {};
    for (const [teamId, info] of Object.entries(worldcupTeamIdToName)) {
      if (info.en) nameToTeamId[info.en.toLowerCase()] = teamId;
    }

    const teams = data.response.map(item => {
      const team = item.team;
      const teamId = nameToTeamId[team.name.toLowerCase()] || `wc_${team.id}`;
      return {
        id: teamId,
        name: team.name,
        nameCn: worldcupTeamIdToName[teamId]?.cn || team.name,
        league: 'WorldCup',
        logo: team.logo,
      };
    });

    res.json({ success: true, msg: '同步成功', count: teams.length, teams });
  } catch (error) {
    res.status(500).json({ success: false, msg: error.message });
  }
});

export default router;
