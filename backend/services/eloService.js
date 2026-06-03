// ======================== Elo 等级分服务 ========================
// 负责 Elo 的 DB 读写和基于积分榜数据的动态计算

import { getDb } from '../../database/db.ts';

/** 联赛基准 Elo */
const LEAGUE_ELO_BASE = {
  EPL: 1600, LaLiga: 1570, Bundesliga: 1560, SerieA: 1540,
  Ligue1: 1510, Eredivisie: 1480, PrimeiraLiga: 1470,
  SaudiPL: 1430, CSL: 1400, JLeague: 1390,
  KLeague1: 1380, KLeague2: 1310,
  Eliteserien: 1380, Allsvenskan: 1360, Veikkausliiga: 1330,
  WorldCup: 1550, DEFAULT: 1350,
};

/**
 * 从积分榜数据计算动态 Elo
 * 公式：baseElo + winRateBonus * 200 + goalDiffBonus * 30
 * 钳位：[leagueBase - 200, leagueBase + 400]
 */
export function computeEloFromStandings(team) {
  const base = LEAGUE_ELO_BASE[team.league] || LEAGUE_ELO_BASE.DEFAULT;

  const homePlayed = team.homeStats?.played ?? 0;
  const awayPlayed = team.awayStats?.played ?? 0;
  const totalPlayed = homePlayed + awayPlayed;

  if (totalPlayed === 0) return base;

  const homeWinRate = homePlayed > 0 ? (team.homeStats?.wins ?? 0) / homePlayed : 0;
  const awayWinRate = awayPlayed > 0 ? (team.awayStats?.wins ?? 0) / awayPlayed : 0;
  const overallWinRate = (homeWinRate * homePlayed + awayWinRate * awayPlayed) / totalPlayed;

  const homeGoalsFor = team.homeStats?.goalsFor ?? 0;
  const homeGoalsAgainst = team.homeStats?.goalsAgainst ?? 0;
  const awayGoalsFor = team.awayStats?.goalsFor ?? 0;
  const awayGoalsAgainst = team.awayStats?.goalsAgainst ?? 0;
  const totalGoalDiff = (homeGoalsFor + awayGoalsFor) - (homeGoalsAgainst + awayGoalsAgainst);
  const avgGoalDiff = totalGoalDiff / Math.max(1, totalPlayed);

  // 胜率贡献：高于 50% 为正，低于为负
  const winRateBonus = (overallWinRate - 0.5) * 2;

  // 净胜球贡献
  const goalDiffBonus = avgGoalDiff;

  let elo = base + winRateBonus * 200 + goalDiffBonus * 30;
  elo = Math.round(elo);
  elo = Math.max(base - 200, Math.min(base + 400, elo));

  return elo;
}

/**
 * 标准 Elo 更新公式（单场赛后）
 */
export function calculateEloUpdate(homeElo, awayElo, goalDiff, K = 20) {
  const expectedHome = 1 / (1 + Math.pow(10, -(homeElo - awayElo + 100) / 400));
  const actualHome = goalDiff > 0 ? 1 : goalDiff < 0 ? 0 : 0.5;
  const marginMultiplier = goalDiff !== 0 ? Math.log(Math.abs(goalDiff) + 1) / Math.log(2) + 1 : 1;
  const delta = Math.round(K * marginMultiplier * (actualHome - expectedHome));
  return { homeDelta: delta, awayDelta: -delta };
}

/** 批量计算并写入所有球队 Elo */
export async function updateAllTeamElos(teams) {
  const db = await getDb();

  for (const team of teams) {
    const elo = computeEloFromStandings(team);
    team.elo = elo;

    try {
      await db.run(
        'UPDATE teams SET elo = ? WHERE team_id = ?',
        [elo, team.id]
      );
    } catch (err) {
      console.error('[eloService] 更新 Elo 失败:', team.nameCn, err.message);
    }
  }

  console.log('[eloService] 已更新 ' + teams.length + ' 支球队的 Elo 等级分');
}

/** 从数据库加载所有球队 Elo */
export async function loadAllElos() {
  const db = await getDb();
  const rows = await db.all('SELECT team_id, elo FROM teams WHERE elo IS NOT NULL');
  const eloMap = {};
  for (const row of rows) {
    eloMap[row.team_id] = row.elo;
  }
  return eloMap;
}