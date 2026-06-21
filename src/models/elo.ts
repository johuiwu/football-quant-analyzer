import { TeamStats } from '../data/realTeamsData';
import { WORLD_CUP_TEAMS } from '../data/worldcup_data';

// ======================== 世界杯 Elo 查找表（中英文双语映射） ========================

const WORLDCUP_ELO_MAP: Record<string, number> = {};
for (const t of WORLD_CUP_TEAMS) {
  // 同时配置 id、英文名、中文名作为键，确保任何命名方式都能查到
  WORLDCUP_ELO_MAP[t.id] = t.elo;
  WORLDCUP_ELO_MAP[t.name] = t.elo;
  WORLDCUP_ELO_MAP[t.nameCn] = t.elo;
}

// ======================== 联赛基准 Elo ========================

export const LEAGUE_ELO_BASE: Record<string, number> = {
  EPL: 1600, LaLiga: 1570, Bundesliga: 1560, SerieA: 1540,
  Ligue1: 1510, Eredivisie: 1480, PrimeiraLiga: 1470,
  SaudiPL: 1430, CSL: 1400, JLeague: 1390,
  KLeague1: 1380, KLeague2: 1310,
  Eliteserien: 1380, Allsvenskan: 1360, Veikkausliiga: 1330,
  WorldCup: 1550, DEFAULT: 1350,
};

// ======================== 主场优势 ========================

/** 默认主场 Elo 加成（约等于 0.25 球的优势） */
export const DEFAULT_HOME_ADVANTAGE = 100;

/** 各联赛主场优势差异化（联赛主场胜率越高，加成越大） */
export const LEAGUE_HOME_ADVANTAGE: Record<string, number> = {
  EPL: 105, LaLiga: 110, Bundesliga: 95, SerieA: 115,
  Ligue1: 100, Eredivisie: 105, PrimeiraLiga: 120,
  Championship: 100, SaudiPL: 100, CSL: 110, JLeague: 95,
  KLeague1: 100, KLeague2: 95,
  Eliteserien: 110, Allsvenskan: 105, Veikkausliiga: 100,
  WorldCup: 0, // 中立场无主场优势
  DEFAULT: 100,
};

// ======================== K 因子 ========================

/** 联赛 K 因子（高竞争联赛 K 值更低以稳定排名） */
export const LEAGUE_K_FACTOR: Record<string, number> = {
  EPL: 18, LaLiga: 18, Bundesliga: 18, SerieA: 18,
  Ligue1: 20, Eredivisie: 22, PrimeiraLiga: 22,
  Championship: 24, SaudiPL: 24, CSL: 26, JLeague: 26,
  KLeague1: 26, KLeague2: 28,
  Eliteserien: 24, Allsvenskan: 26, Veikkausliiga: 28,
  WorldCup: 32, // 大赛 K 值更高以快速反映状态
  DEFAULT: 20,
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
 * 标准 Elo 更新公式（参数化主场优势）
 * @param homeElo 主队当前 Elo
 * @param awayElo 客队当前 Elo
 * @param goalDiff 净胜球（主队进球 - 客队进球）
 * @param K K 因子，默认 20
 * @param homeAdv 主场 Elo 加成，默认 100
 * @returns { homeDelta, awayDelta } 双方 Elo 变化量
 */
export function calculateEloUpdate(
  homeElo: number,
  awayElo: number,
  goalDiff: number,
  K: number = 20,
  homeAdv: number = DEFAULT_HOME_ADVANTAGE,
): { homeDelta: number; awayDelta: number } {
  // 预期主队胜率（含主场优势）
  const expectedHome = 1 / (1 + Math.pow(10, -(homeElo - awayElo + homeAdv) / 400));

  // 实际结果：胜=1, 平=0.5, 负=0
  const actualHome = goalDiff > 0 ? 1 : goalDiff < 0 ? 0 : 0.5;

  // 净胜球加成：大比分获胜/落败加权
  const marginMultiplier = goalDiff !== 0 ? Math.log(Math.abs(goalDiff) + 1) / Math.log(2) + 1 : 1;

  const delta = Math.round(K * marginMultiplier * (actualHome - expectedHome));
  return { homeDelta: delta, awayDelta: -delta };
}

/**
 * 获取球队 Elo（世界杯球队优先从精确映射查找，否则读 team.elo，最后用联赛基准兜底）
 */
export function getTeamElo(team: TeamStats): number {
  // 防御性编程
  if (!team) return LEAGUE_ELO_BASE.DEFAULT;

  // 世界杯球队：优先从 WORLD_CUP_TEAMS 查找精确 Elo（中英文双语匹配）
  if (team.league === 'WorldCup' || team.league === '世界杯') {
    // 同时检测 id、中文名、英文名，确保任何命名方式都能匹配
    const rawElo = WORLDCUP_ELO_MAP[team.id] || WORLDCUP_ELO_MAP[team.name] || WORLDCUP_ELO_MAP[team.nameCn] || null;

    if (rawElo && rawElo > 0) {
      // 归一化：世界杯 Elo 整体偏高约 200，需向五大联赛标准基数靠拢
      const normalizedElo = rawElo > 1800 ? rawElo - 200 : rawElo;
      if (process.env.NODE_ENV === 'development') {
        console.log(`[Elo 世界杯] ${team.nameCn || team.name || team.id} 读取到 Elo: ${rawElo} (归一化后: ${normalizedElo})`);
      }
      return normalizedElo;
    }

    // 映射表里没查到，绝对不能返回 0，给保底值 1550
    if (process.env.NODE_ENV === 'development') {
      console.warn(`[Elo 安全兜底] 未在映射表中找到 ${team.nameCn || team.name || team.id} 的 Elo，使用保底值 1550`);
    }
    return 1550;
  }

  // 优先使用已存储的动态 Elo
  if (typeof team.elo === 'number' && team.elo > 0) {
    return team.elo;
  }

  // 兜底：联赛基准 + 排名调整
  const rank = team?.rank ?? 10;
  const league = team?.league || 'DEFAULT';
  return getOrInitElo(team?.nameCn || '', league, rank);
}

/**
 * 获取联赛 K 因子
 */
export function getLeagueKFactor(league?: string): number {
  if (!league) return LEAGUE_K_FACTOR.DEFAULT;
  return LEAGUE_K_FACTOR[league] ?? LEAGUE_K_FACTOR.DEFAULT;
}

/**
 * 获取联赛主场优势
 */
export function getLeagueHomeAdvantage(league?: string): number {
  if (!league) return LEAGUE_HOME_ADVANTAGE.DEFAULT;
  return LEAGUE_HOME_ADVANTAGE[league] ?? LEAGUE_HOME_ADVANTAGE.DEFAULT;
}