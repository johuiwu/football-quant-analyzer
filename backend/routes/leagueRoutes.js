import { Router } from 'express';
import { REAL_TEAMS } from '../../src/data/realTeamsData';
import { getAllCompleteTeams, getAllTeamsGrouped, hasTeamsData } from '../../database/db';

const router = Router();

// 1. Get all teams data & stats —— 合并 REAL_TEAMS 与数据库数据，确保全部联赛球队都在列表中
router.get('/teams', async (req, res) => {
  try {
    const hasData = await hasTeamsData();
    if (hasData) {
      const dbTeams = await getAllCompleteTeams();
      // 以 REAL_TEAMS 为基准（含全部 14 联赛），用 DB 数据更新同名球队
      const dbMap = new Map(dbTeams.map((t) => [t.id, t]));
      const merged = REAL_TEAMS.map((rt) => {
        const dbTeam = dbMap.get(rt.id);
        return dbTeam ? { ...rt, ...dbTeam, homeStats: dbTeam.homeStats || rt.homeStats || { played: 0, wins: 0, draws: 0, losses: 0, goalsFor: 0, goalsAgainst: 0, xgFor: 0, xgAgainst: 0 }, awayStats: dbTeam.awayStats || rt.awayStats || { played: 0, wins: 0, draws: 0, losses: 0, goalsFor: 0, goalsAgainst: 0, xgFor: 0, xgAgainst: 0 } } : rt;
      });
      // 追加 DB 中有但 REAL_TEAMS 中没有的球队
      for (const dbTeam of dbTeams) {
        if (!REAL_TEAMS.find((rt) => rt.id === dbTeam.id)) {
          merged.push(dbTeam);
        }
      }
      console.log('[api/teams] ✓ REAL_TEAMS', REAL_TEAMS.length, '支 + DB 更新', dbTeams.length, '支 → 合并', merged.length, '支');
      res.json(merged);
    } else {
      console.log('[api/teams] 数据库为空，使用预设数据');
      res.json(REAL_TEAMS);
    }
  } catch (err) {
    console.error('[api/teams] 读取数据库失败，使用预设数据:', err);
    res.json(REAL_TEAMS);
  }
});

// v3.3: SQLite 持久化 —— 获取所有球队数据（从 SQLite，按联赛分组）
router.get('/teams/all', async (req, res) => {
  try {
    const grouped = await getAllTeamsGrouped();
    res.json({ success: true, data: grouped });
  } catch (err) {
    console.error('[api/teams/all] 数据库读取失败', err.message);
    res.status(500).json({ success: false, error: '数据库读取失败' });
  }
});

export default router;
