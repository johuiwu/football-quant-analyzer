import express from 'express';
import { REAL_FIXTURES } from '../../src/data/realTeamsData';

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

export default router;
