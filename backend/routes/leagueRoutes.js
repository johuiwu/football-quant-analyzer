import { Router } from 'express';
import { REAL_TEAMS } from '../../src/data/realTeamsData';
import { getAllCompleteTeams, getAllTeamsGrouped, hasTeamsData } from '../../database/db';

const router = Router();

// 五大联赛标识
const FIVE_MAJOR_LEAGUES = ['EPL', 'LaLiga', 'SerieA', 'Bundesliga', 'Ligue1'];

/**
 * 为五大联赛球队估算 seasonXpts（当 Understat 数据缺失时）
 */
function ensureAdvancedFields(team) {
  // 强制拦截：已有 Understat 真实数据时，直接返回，不运行估算
  if (team.seasonXpts > 0) return team;

  const isFiveMajor = FIVE_MAJOR_LEAGUES.includes(team.league);
  if (!isFiveMajor) return team;

  // 计算赛季总 xG 和总 xGA
  const seasonXg = (team.homeStats?.xgFor || team.homeXg || 0) + (team.awayStats?.xgFor || team.awayXg || 0);
  const seasonXga = (team.homeStats?.xgAgainst || 0) + (team.awayStats?.xgAgainst || 0);

  // 1. NPxGD = (赛季总 xG - 赛季总 xGA) * 0.95
  const estimatedNpxgd = Math.round((seasonXg - seasonXga) * 0.95 * 10) / 10;

  // 2. xPTS = 实际积分 * 0.7 + max(0, 实际积分 + NPxGD) * 0.3
  const wins = (team.homeStats?.wins || 0) + (team.awayStats?.wins || 0);
  const draws = (team.homeStats?.draws || 0) + (team.awayStats?.draws || 0);
  const points = wins * 3 + draws;
  const estimatedXpts = Math.round((points * 0.7 + Math.max(0, points + estimatedNpxgd) * 0.3) * 10) / 10;

  // 3. PPDA = 联赛基准值 + (排名 - 1) * 0.3
  const leagueBase = { EPL: 9.5, LaLiga: 9.0, Bundesliga: 8.5, SerieA: 10.0, Ligue1: 10.5 };
  const base = leagueBase[team.league] || 12.0;
  const estimatedPpda = Math.round((base + (team.rank - 1) * 0.3) * 10) / 10;

  const hp = team.homeStats?.played || 19;
  const ap = team.awayStats?.played || 19;

  return {
    ...team,
    seasonXpts: estimatedXpts,
    seasonPpda: estimatedPpda,
    seasonNpxgd: estimatedNpxgd,
    matches: hp + ap,
  };
}

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
        const base = dbTeam ? { ...rt, ...dbTeam, homeStats: dbTeam.homeStats || rt.homeStats || { played: 0, wins: 0, draws: 0, losses: 0, goalsFor: 0, goalsAgainst: 0, xgFor: 0, xgAgainst: 0 }, awayStats: dbTeam.awayStats || rt.awayStats || { played: 0, wins: 0, draws: 0, losses: 0, goalsFor: 0, goalsAgainst: 0, xgFor: 0, xgAgainst: 0 } } : rt;
        return ensureAdvancedFields(base);
      });
      // 追加 DB 中有但 REAL_TEAMS 中没有的球队
      for (const dbTeam of dbTeams) {
        if (!REAL_TEAMS.find((rt) => rt.id === dbTeam.id)) {
          merged.push(ensureAdvancedFields(dbTeam));
        }
      }
      console.log('[api/teams] ✓ REAL_TEAMS', REAL_TEAMS.length, '支 + DB 更新', dbTeams.length, '支 → 合并', merged.length, '支');
      res.json(merged);
    } else {
      console.log('[api/teams] 数据库为空，使用预设数据（补充估算高阶字段）');
      // 即使使用预设数据，也为五大联赛球队补充 seasonXpts
      const enriched = REAL_TEAMS.map(ensureAdvancedFields);
      res.json(enriched);
    }
  } catch (err) {
    console.error('[api/teams] 读取数据库失败，使用预设数据:', err);
    // 出错时也补充估算字段
    const enriched = REAL_TEAMS.map(ensureAdvancedFields);
    res.json(enriched);
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
