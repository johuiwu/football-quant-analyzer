import express from 'express';
import { REAL_FIXTURES, REAL_TEAMS, LEAGUES } from '../../src/data/realTeamsData';
import { ALL_LEAGUE_TEAMS } from '../../src/data/leagueTeams';
import { crawlQiumiwuFixtures } from '../services/qiumiwuCrawlerService.js';

const router = express.Router();

// 构建球队中文名 → 球队ID 的映射（基于 REAL_TEAMS）
const teamNameCnToId = new Map();
REAL_TEAMS.forEach(t => {
  if (t.nameCn) teamNameCnToId.set(t.nameCn, { id: t.id, league: t.league });
});
// 补充映射：从 leagueTeams.ts 的 name 字段（可能使用更短的中文名，如"曼城"→"曼彻斯特城"）
ALL_LEAGUE_TEAMS.forEach(t => {
  if (t.name && t.realTeamId) {
    const existing = teamNameCnToId.get(t.name);
    if (!existing) {
      const realTeam = REAL_TEAMS.find(r => r.id === t.realTeamId);
      if (realTeam) {
        teamNameCnToId.set(t.name, { id: realTeam.id, league: realTeam.league });
      }
    }
  }
});

// qiumiwu 特有中文队名别名（补充 qiumiwu 与系统之间的命名差异，如词序颠倒、简称等）
const teamNameAliases = {
  '东京FC': 'fctokyo',
  '町田泽维': 'tingtianzeweiya',
  '名古屋鲸': 'nagoya',
  '京都': 'jingdubusiniao',
  '清水鼓动': 'qingshuixintiao',
};
Object.entries(teamNameAliases).forEach(([aliasName, realTeamId]) => {
  if (!teamNameCnToId.has(aliasName)) {
    const realTeam = REAL_TEAMS.find(r => r.id === realTeamId);
    if (realTeam) {
      teamNameCnToId.set(aliasName, { id: realTeam.id, league: realTeam.league });
    }
  }
});

// 联赛中文名 → 联赛ID 的映射
const leagueNameCnToId = new Map();
LEAGUES.forEach(l => {
  if (l.nameCn) leagueNameCnToId.set(l.nameCn, l.id);
});

// qiumiwu 联赛简称 → 系统 league ID 的别名映射
const leagueNameAliases = {
  '日职联': 'JLeague',
  'J联赛': 'JLeague',
  '韩K1': 'KLeague1',
  '韩K2': 'KLeague2',
  '英超': 'EPL',
  '西甲': 'LaLiga',
  '意甲': 'SerieA',
  '德甲': 'Bundesliga',
  '法甲': 'Ligue1',
  '中超': 'CSL',
  '荷甲': 'Eredivisie',
  '葡超': 'PrimeiraLiga',
  '沙特联': 'SaudiPL',
  '瑞超': 'Allsvenskan',
  '挪超': 'Eliteserien',
  '芬超': 'Veikkausliiga',
  '丹超': 'DanishSuperliga',
  '卡塔尔联': 'QatarSL',
};

function getLeagueId(leagueName) {
  if (!leagueName) return '';
  const exactMatch = leagueNameCnToId.get(leagueName);
  if (exactMatch) return exactMatch;
  return leagueNameAliases[leagueName] || '';
}

/**
 * 将 qiumiwu 爬虫数据映射为前端期望的 RealFixture 格式
 * 尝试通过中文名匹配球队ID，无法匹配时保留原始名称
 */
function mapQiumiwuFixture(f) {
  const homeMatch = teamNameCnToId.get(f.homeTeam);
  const awayMatch = teamNameCnToId.get(f.awayTeam);
  const leagueId = getLeagueId(f.league);

  return {
    id: f.id,
    name: f.name,
    homeTeam: f.homeTeam,
    awayTeam: f.awayTeam,
    homeTeamId: homeMatch ? homeMatch.id : '',
    awayTeamId: awayMatch ? awayMatch.id : '',
    homeLeague: homeMatch ? homeMatch.league : (leagueId || ''),
    awayLeague: awayMatch ? awayMatch.league : (leagueId || ''),
    matchTime: f.matchTime || '',
    matchStatus: f.matchStatus || '',
    statusAlias: f.statusAlias || '',
    homeScore: f.homeScore,
    awayScore: f.awayScore,
    stageCn: f.stageCn || f.league || '',
    defaultOdds: { home: 2.0, draw: 3.2, away: 3.5 },
    defaultGoalsLine: 2.5,
    competitionType: 'League',
    source: 'qiumiwu'
  };
}

// ======================== 赛程数据（本地预设数据源） ========================

router.get('/sync-fixtures', async (req, res) => {
  try {
    // 使用内置预设赛程数据（不再依赖 football-data.org 外部 API）
    const fixtures = REAL_FIXTURES.map(match => ({
      id: match.id,
      name: match.name,
      homeTeamId: match.homeTeamId,
      awayTeamId: match.awayTeamId,
      homeLeague: match.homeLeague,
      awayLeague: match.awayLeague,
      matchTime: match.matchTime,
      stageCn: match.stageCn,
      defaultOdds: match.defaultOdds || { home: 2.0, draw: 3.2, away: 3.5 },
      defaultGoalsLine: match.defaultGoalsLine || 2.5,
      competitionType: match.competitionType || 'League'
    }));

    if (fixtures.length > 0) {
      res.json({
        fixtures,
        source: 'local-preset',
        msg: `已加载 ${fixtures.length} 场预设赛事数据`
      });
    } else {
      res.json({
        fixtures: [],
        source: 'local-preset',
        msg: '暂无预设赛事数据，请手动配置对阵队伍'
      });
    }
  } catch (error) {
    console.error('Fixtures sync error:', error);
    res.status(500).json({
      error: true,
      message: '获取赛程失败',
      details: error.message
    });
  }
});

// ======================== 从 qiumiwu.com 实时爬取赛程 ========================

router.get('/qiumiwu-fixtures', async (req, res) => {
  console.log('[FixtureRoutes] 请求 qiumiwu.com 赛程爬取...');

  // Electron 生产模式下爬虫被禁用
  if (process.env.DISABLE_CRAWLER === 'true') {
    console.log('[FixtureRoutes] 爬虫已禁用 (DISABLE_CRAWLER=true)，返回提示');
    return res.json({
      fixtures: [],
      source: 'local-preset',
      msg: '当前运行环境不支持联网爬取，请手动配置对阵队伍'
    });
  }

  try {
    const result = await crawlQiumiwuFixtures();

    if (result.success && result.count > 0) {
      const fixtures = result.data.map(mapQiumiwuFixture);
      const matchedCount = fixtures.filter(f => f.homeTeamId && f.awayTeamId).length;
      const leagueOnlyCount = fixtures.filter(f => !f.homeTeamId && f.homeLeague).length;
      console.log(`[FixtureRoutes] qiumiwu 赛程映射完成: 共 ${fixtures.length} 场, 球队全匹配 ${matchedCount} 场, 仅联赛匹配 ${leagueOnlyCount} 场`);
      if (fixtures.length - matchedCount - leagueOnlyCount > 0) {
        fixtures.filter(f => !f.homeTeamId && !f.homeLeague).slice(0, 5).forEach(f =>
          console.log(`  [未匹配] ${f.homeTeam || '?'} vs ${f.awayTeam || '?'} (${f.league})`)
        );
      }
      res.json({
        fixtures,
        source: 'google_search_grounding',
        msg: ''
      });
    } else {
      // 爬取失败，回退到本地预设
      const fallbackFixtures = REAL_FIXTURES.map(match => ({
        id: match.id,
        name: match.name,
        homeTeamId: match.homeTeamId,
        awayTeamId: match.awayTeamId,
        homeLeague: match.homeLeague,
        awayLeague: match.awayLeague,
        matchTime: match.matchTime,
        stageCn: match.stageCn,
        defaultOdds: match.defaultOdds || { home: 2.0, draw: 3.2, away: 3.5 },
        defaultGoalsLine: match.defaultGoalsLine || 2.5,
        competitionType: match.competitionType || 'League'
      }));

      res.json({
        fixtures: fallbackFixtures,
        source: 'local-preset',
        msg: `爬取失败：${result.error || '未知错误'}，已回退至本地预设数据`,
        crawlError: result.error
      });
    }
  } catch (error) {
    console.error('[FixtureRoutes] qiumiwu 爬取路由错误:', error);

    const fallbackFixtures = REAL_FIXTURES.map(match => ({
      id: match.id,
      name: match.name,
      homeTeamId: match.homeTeamId,
      awayTeamId: match.awayTeamId,
      homeLeague: match.homeLeague,
      awayLeague: match.awayLeague,
      matchTime: match.matchTime,
      stageCn: match.stageCn,
      defaultOdds: match.defaultOdds || { home: 2.0, draw: 3.2, away: 3.5 },
      defaultGoalsLine: match.defaultGoalsLine || 2.5,
      competitionType: match.competitionType || 'League'
    }));

    res.status(200).json({
      fixtures: fallbackFixtures,
      source: 'local-preset',
      msg: '爬取异常：已安全回退至本地赛事库',
      crawlError: error.message
    });
  }
});

export default router;
