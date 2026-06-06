import express from 'express';
import { REAL_FIXTURES, REAL_TEAMS, LEAGUES } from '../../src/data/realTeamsData';
import { crawlQiumiwuFixtures } from '../services/qiumiwuCrawlerService.js';

const router = express.Router();

// 构建球队中文名 → 球队ID 的映射，用于匹配爬虫数据
const teamNameCnToId = new Map();
REAL_TEAMS.forEach(t => {
  if (t.nameCn) teamNameCnToId.set(t.nameCn, { id: t.id, league: t.league });
});

// 联赛中文名 → 联赛ID 的映射
const leagueNameCnToId = new Map();
LEAGUES.forEach(l => {
  if (l.nameCn) leagueNameCnToId.set(l.nameCn, l.id);
});

/**
 * 将 qiumiwu 爬虫数据映射为前端期望的 RealFixture 格式
 * 尝试通过中文名匹配球队ID，无法匹配时保留原始名称
 */
function mapQiumiwuFixture(f) {
  const homeMatch = teamNameCnToId.get(f.homeTeam);
  const awayMatch = teamNameCnToId.get(f.awayTeam);
  const leagueId = leagueNameCnToId.get(f.league);

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
      console.log(`[FixtureRoutes] qiumiwu 赛程映射完成: ${fixtures.length} 场，其中 ${matchedCount} 场匹配到系统球队`);
      res.json({
        fixtures,
        source: 'google_search_grounding',
        msg: `🟢 从 qiumiwu.com 实时爬取到 ${result.count} 场未完场足球赛程数据`
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
