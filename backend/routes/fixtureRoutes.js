import express from 'express';
import { REAL_FIXTURES } from '../../src/data/realTeamsData';
import { crawlQiumiwuFixtures } from '../services/qiumiwuCrawlerService.js';

const router = express.Router();

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

  try {
    const result = await crawlQiumiwuFixtures();

    if (result.success && result.count > 0) {
      res.json({
        fixtures: result.data,
        source: 'google_search_grounding',
        msg: `🟢 从 qiumiwu.com 实时爬取到 ${result.count} 场足球赛程数据`
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
