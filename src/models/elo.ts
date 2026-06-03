import { TeamStats } from '../data/realTeamsData';

// ======================== 联赛基准 Elo ========================

export const LEAGUE_ELO_BASE: Record<string, number> = {
  EPL: 1600, LaLiga: 1570, Bundesliga: 1560, SerieA: 1540,
  Ligue1: 1510, Eredivisie: 1480, PrimeiraLiga: 1470,
  SaudiPL: 1430, CSL: 1400, JLeague: 1390,
  KLeague1: 1380, KLeague2: 1310,
  Eliteserien: 1380, Allsvenskan: 1360, Veikkausliiga: 1330,
  WorldCup: 1550, DEFAULT: 1350,
};

// ======================== 纯数学函数 ========================

/**
 * 根据联赛和排名初始化 Elo（无历史数据时兜底）
 * 公式：联赛基准 + (10 - rank) * 12
 */
export function getOrInitElo(teamName: string, league: string, rank: number = 10): number {
  const base = LEAGUE_ELO_BASE[league] || LEAGUE_ELO_BASE.DEFAULT;
  return Math.round(base + (10 - rank) * 12);
}

/**
 * 标准 Elo 更新公式
 * @param homeElo 主队当前 Elo
 * @param awayElo 客队当前 Elo
 * @param goalDiff 净胜球（主队进球 - 客队进球）
 * @param K K 因子，默认 20
 * @returns { homeDelta, awayDelta } 双方 Elo 变化量
 */
export function calculateEloUpdate(
  homeElo: number,
  awayElo: number,
  goalDiff: number,
  K: number = 20,
): { homeDelta: number; awayDelta: number } {
  // 预期主队胜率
  const expectedHome = 1 / (1 + Math.pow(10, -(homeElo - awayElo + 100) / 400));

  // 实际结果：胜=1, 平=0.5, 负=0
  const actualHome = goalDiff > 0 ? 1 : goalDiff < 0 ? 0 : 0.5;

  // 净胜球加成：大比分获胜/落败加权
  const marginMultiplier = goalDiff !== 0 ? Math.log(Math.abs(goalDiff) + 1) / Math.log(2) + 1 : 1;

  const delta = Math.round(K * marginMultiplier * (actualHome - expectedHome));
  return { homeDelta: delta, awayDelta: -delta };
}

/**
 * 获取球队 Elo（优先读 team.elo，无值则用联赛基准兜底）
 */
export function getTeamElo(team: TeamStats): number {
  // 防御性编程
  if (!team) return LEAGUE_ELO_BASE.DEFAULT;

  // 优先使用已存储的动态 Elo
  if (typeof team.elo === 'number' && team.elo > 0) {
    return team.elo;
  }

  // 兜底：联赛基准 + 排名调整
  const rank = team?.rank ?? 10;
  const league = team?.league || 'DEFAULT';
  return getOrInitElo(team?.nameCn || '', league, rank);
}