import { Router } from 'express';
import { REAL_TEAMS } from '../../src/data/realTeamsData';
import { ALL_LEAGUE_TEAMS } from '../../src/data/leagueTeams';
import { getDb, upsertTeamStats, getTeamStatsFromDb, getAllCompleteTeams } from '../../database/db';
import { LEAGUE_PRESETS } from '../../config/leaguePresets';
import { fetchTeamStatsFromQiumiwu } from '../services/crawlerHelper.js';

const router = Router();

// 球队数据缓存（与 /api/teams 返回一致）
let teamsCache = null;
let teamsCacheTime = 0;
const TEAMS_CACHE_TTL = 60_000; // 60秒缓存

async function getTeamsMerged() {
  const now = Date.now();
  if (teamsCache && (now - teamsCacheTime) < TEAMS_CACHE_TTL) return teamsCache;
  try {
    const dbTeams = await getAllCompleteTeams();
    const dbMap = new Map(dbTeams.map((t) => [t.id, t]));
    const merged = REAL_TEAMS.map((rt) => {
      const dbTeam = dbMap.get(rt.id);
      if (!dbTeam) return rt;
      const dbHasRealData = dbTeam.homeStats && (dbTeam.homeStats.wins + dbTeam.homeStats.draws + dbTeam.homeStats.losses) > 0;
      // 兼容旧数据：如果 DB 的 awayStats 有非零值（旧格式主客场分配），合并到 homeStats
      let normalizedHomeStats = dbTeam.homeStats;
      let normalizedAwayStats = dbTeam.awayStats;
      if (dbHasRealData && dbTeam.awayStats && (dbTeam.awayStats.wins + dbTeam.awayStats.draws + dbTeam.awayStats.losses) > 0) {
        normalizedHomeStats = {
          played: (dbTeam.homeStats.played || 0) + (dbTeam.awayStats.played || 0),
          wins: (dbTeam.homeStats.wins || 0) + (dbTeam.awayStats.wins || 0),
          draws: (dbTeam.homeStats.draws || 0) + (dbTeam.awayStats.draws || 0),
          losses: (dbTeam.homeStats.losses || 0) + (dbTeam.awayStats.losses || 0),
          goalsFor: (dbTeam.homeStats.goalsFor || 0) + (dbTeam.awayStats.goalsFor || 0),
          goalsAgainst: (dbTeam.homeStats.goalsAgainst || 0) + (dbTeam.awayStats.goalsAgainst || 0),
          xgFor: Math.round(((dbTeam.homeStats.xgFor || 0) + (dbTeam.awayStats.xgFor || 0)) * 10) / 10,
          xgAgainst: Math.round(((dbTeam.homeStats.xgAgainst || 0) + (dbTeam.awayStats.xgAgainst || 0)) * 10) / 10,
        };
        normalizedAwayStats = { played: 0, wins: 0, draws: 0, losses: 0, goalsFor: 0, goalsAgainst: 0, xgFor: 0, xgAgainst: 0 };
      }
      return {
        ...rt,
        ...dbTeam,
        homeStats: dbHasRealData ? normalizedHomeStats : rt.homeStats,
        awayStats: dbHasRealData ? normalizedAwayStats : rt.awayStats,
      };
    });
    for (const dbTeam of dbTeams) {
      if (!REAL_TEAMS.find((rt) => rt.id === dbTeam.id)) {
        merged.push(dbTeam);
      }
    }
    teamsCache = merged;
    teamsCacheTime = now;
    return merged;
  } catch (err) {
    console.warn('[statsRoutes] getTeamsMerged failed, using REAL_TEAMS:', err.message);
    return REAL_TEAMS;
  }
}

// ======================== request throttle ========================
const requestThrottle = new Map();
const THROTTLE_MS = 30_000;

// ======================== helper: fallback stats from league preset ========================
function buildFallbackStats(team) {
  const matchesPlayed = team.homeStats.played + team.awayStats.played;
  const homePlayed = team.homeStats.played;
  const awayPlayed = team.awayStats.played;

  return {
    basic: null,
    advanced: null,
    estimated: true,
    teamId: team.id,
    teamName: team.nameCn,
    league: team.leagueCn,
    rank: team.rank,
    matchesPlayed,
    homeXg: team.homeXg || 0,
    awayXg: team.awayXg || 0,
    last_updated: null,
    cleanSheets: 0,
    shotsPerGame: 0,
    shotAccuracy: 0,
    homeStats: {
      played: homePlayed,
      wins: 0, draws: 0, losses: 0,
      goalsFor: 0, goalsAgainst: 0,
      xgFor: 0, xgAgainst: 0,
      estimated: true,
    },
    awayStats: {
      played: awayPlayed,
      wins: 0, draws: 0, losses: 0,
      goalsFor: 0, goalsAgainst: 0,
      xgFor: 0, xgAgainst: 0,
      estimated: true,
    },
  };
}

// ======================== helper: build response from crawler stats ========================
function buildResponse(team, stats, source) {
  const matchesPlayed = team.homeStats.played + team.awayStats.played;
  const shotsTotal = stats.shots ? (stats.shots.total || 0) : 0;
  const shotsOnTargetTotal = stats.shotsOnTarget ? (stats.shotsOnTarget.total || 0) : 0;

  const totalGoals = stats.goals ? (stats.goals.total || 0) : 0;
  const totalConceded = stats.conceded ? (stats.conceded.total || 0) : 0;

  // 统一为总胜平负检查（homeStats 存储总数据，awayStats 全零）
  const realTotalWins = team.homeStats?.wins || 0;
  const realTotalDraws = team.homeStats?.draws || 0;
  const realTotalLosses = team.homeStats?.losses || 0;
  const hasRealWDL = (realTotalWins + realTotalDraws + realTotalLosses) > 0;

  const totalWins = hasRealWDL ? realTotalWins : Math.round(totalGoals / 2.5) || 0;
  const totalDraws = hasRealWDL ? realTotalDraws : Math.max(0, matchesPlayed - totalWins - Math.round(totalConceded / 3)) || 0;
  const totalLosses = hasRealWDL ? realTotalLosses : Math.max(0, matchesPlayed - totalWins - totalDraws) || 0;

  const homePlayed = hasRealWDL ? (team.homeStats ? (team.homeStats.played || Math.round(matchesPlayed / 2)) : Math.round(matchesPlayed / 2)) : Math.round(matchesPlayed / 2);
  const awayPlayed = hasRealWDL ? (team.awayStats ? (team.awayStats.played || (matchesPlayed - homePlayed)) : (matchesPlayed - homePlayed)) : (matchesPlayed - homePlayed);

  const homeWins = hasRealWDL ? (team.homeStats ? (team.homeStats.wins || 0) : 0) : Math.round(totalWins * 0.6);
  const awayWins = totalWins - homeWins;
  const homeDraws = hasRealWDL ? (team.homeStats ? (team.homeStats.draws || 0) : 0) : Math.round(totalDraws * 0.5);
  const awayDraws = totalDraws - homeDraws;
  const homeLosses = Math.max(0, homePlayed - homeWins - homeDraws);
  const awayLosses = Math.max(0, awayPlayed - awayWins - awayDraws);

  const homeGoals = hasRealWDL ? (team.homeStats ? (team.homeStats.goalsFor || 0) : 0) : Math.round(totalGoals * 0.55);
  const awayGoals = totalGoals - homeGoals;
  const homeConceded = hasRealWDL ? (team.homeStats ? (team.homeStats.goalsAgainst || 0) : 0) : Math.round(totalConceded * 0.45);
  const awayConceded = totalConceded - homeConceded;

  const avgGoals = stats.avgGoals ? (stats.avgGoals.total || 0) : 0;
  const avgConceded = stats.avgConceded ? (stats.avgConceded.total || 0) : 0;

  return {
    success: true,
    teamId: team.id,
    source,
    stats: {
      basic: {
        goals: stats.goals || null,
        conceded: stats.conceded || null,
        goalDifference: stats.goalDifference || null,
        corners: stats.corners || null,
        avgGoals: stats.avgGoals || null,
        avgConceded: stats.avgConceded || null,
        avgGoalDiff: stats.avgGoalDiff || null,
        avgCorners: stats.avgCorners || null,
        shots: stats.shots || null,
        shotsOnTarget: stats.shotsOnTarget || null,
        assists: stats.assists || null,
        passes: stats.passes || null,
        penalties: stats.penalties || null,
        fouls: stats.fouls || null,
        redCards: stats.redCards || null,
        yellowCards: stats.yellowCards || null,
      },
      advanced: {
        possession: stats.possession || null,
        clearances: stats.clearances || null,
        tackles: stats.tackles || null,
        interceptions: stats.interceptions || null,
        offsides: stats.offsides || null,
        foulsSuffered: stats.foulsSuffered || null,
        keyPasses: stats.keyPasses || null,
        crosses: stats.crosses || null,
        successfulCrosses: stats.successfulCrosses || (stats.crossesSuccessful) || null,
        longBalls: stats.longBalls || null,
        successfulLongBalls: stats.successfulLongBalls || null,
        freeKicks: stats.freeKicks || null,
        freeKickGoals: stats.freeKickGoals || null,
        dribbles: stats.dribbles || null,
        successfulDribbles: stats.successfulDribbles || null,
        duelsWon: stats.duelsWon || null,
        fastBreaks: stats.fastBreaks || null,
        fastBreakShots: stats.fastBreakShots || null,
        fastBreakGoals: stats.fastBreakGoals || null,
        hitWoodwork: stats.hitWoodwork || null,
        possessionLost: stats.possessionLost || null,
      },
      teamId: team.id,
      teamName: team.nameCn,
      league: team.leagueCn,
      rank: team.rank,
      matchesPlayed,
      last_updated: null,
      cleanSheets: stats.cleanSheets ? (stats.cleanSheets.total || 0) : 0,
      shotsPerGame: matchesPlayed > 0 ? parseFloat((shotsTotal / matchesPlayed).toFixed(1)) : 0,
      shotAccuracy: shotsTotal > 0 ? parseFloat(((shotsOnTargetTotal / shotsTotal) * 100).toFixed(1)) : 0,
      cornersPerGame: stats.corners && stats.corners.total ? parseFloat((stats.corners.total / matchesPlayed).toFixed(1)) : 0,
      homeXg: stats.xgFor && stats.xgFor.home ? parseFloat(stats.xgFor.home.toFixed(1)) : (team.homeXg || 0),
      awayXg: stats.xgFor && stats.xgFor.away ? parseFloat(stats.xgFor.away.toFixed(1)) : (team.awayXg || 0),
      seasonXpts: team.seasonXpts || 0,
      seasonPpda: team.seasonPpda || 0,
      seasonPpdaAllowed: team.seasonPpdaAllowed || 0,
      seasonNpxgd: team.seasonNpxgd || 0,
      matches: team.matches || 0,
      homeStats: {
        played: matchesPlayed,
        wins: realTotalWins,
        draws: realTotalDraws,
        losses: realTotalLosses,
        goalsFor: totalGoals,
        goalsAgainst: totalConceded,
        xgFor: matchesPlayed > 0 ? parseFloat((totalGoals * 0.95 / matchesPlayed).toFixed(2)) : 0,
        xgAgainst: matchesPlayed > 0 ? parseFloat((totalConceded * 1.05 / matchesPlayed).toFixed(2)) : 0,
      },
      awayStats: {
        played: 0, wins: 0, draws: 0, losses: 0,
        goalsFor: 0, goalsAgainst: 0,
        xgFor: 0, xgAgainst: 0,
        ...(hasRealWDL ? {} : { estimated: true }),
      },
      estimated: !hasRealWDL,
    },
  };
}

// ======================== helper: build response from DB row ========================
function buildResponseFromDb(team, row, source) {
  function r(val) { return { total: val || 0, rank: 0 }; }
  const matchesPlayed = team.homeStats.played + team.awayStats.played;
  const shotsTotal = row.shots || 0;
  const shotsOnTargetTotal = row.shotsOnTarget || 0;

  const totalGoals = row.goals || 0;
  const totalConceded = row.conceded || 0;

  // 统一为总胜平负检查（homeStats 存储总数据，awayStats 全零）
  const realTotalWins = team.homeStats?.wins || 0;
  const realTotalDraws = team.homeStats?.draws || 0;
  const realTotalLosses = team.homeStats?.losses || 0;
  const hasRealWDL = (realTotalWins + realTotalDraws + realTotalLosses) > 0;

  const totalWins = hasRealWDL ? realTotalWins : Math.round(totalGoals / 2.5) || 0;
  const totalDraws = hasRealWDL ? realTotalDraws : Math.max(0, matchesPlayed - totalWins - Math.round(totalConceded / 3)) || 0;
  const totalLosses = hasRealWDL ? realTotalLosses : Math.max(0, matchesPlayed - totalWins - totalDraws) || 0;

  const homePlayed = hasRealWDL ? (team.homeStats ? (team.homeStats.played || Math.round(matchesPlayed / 2)) : Math.round(matchesPlayed / 2)) : Math.round(matchesPlayed / 2);
  const awayPlayed = hasRealWDL ? (team.awayStats ? (team.awayStats.played || (matchesPlayed - homePlayed)) : (matchesPlayed - homePlayed)) : (matchesPlayed - homePlayed);

  const homeWins = hasRealWDL ? (team.homeStats ? (team.homeStats.wins || 0) : 0) : Math.round(totalWins * 0.6);
  const awayWins = totalWins - homeWins;
  const homeDraws = hasRealWDL ? (team.homeStats ? (team.homeStats.draws || 0) : 0) : Math.round(totalDraws * 0.5);
  const awayDraws = totalDraws - homeDraws;
  const homeLosses = Math.max(0, homePlayed - homeWins - homeDraws);
  const awayLosses = Math.max(0, awayPlayed - awayWins - awayDraws);

  const homeGoals = hasRealWDL ? (team.homeStats ? (team.homeStats.goalsFor || 0) : 0) : Math.round(totalGoals * 0.55);
  const awayGoals = totalGoals - homeGoals;
  const homeConceded = hasRealWDL ? (team.homeStats ? (team.homeStats.goalsAgainst || 0) : 0) : Math.round(totalConceded * 0.45);
  const awayConceded = totalConceded - homeConceded;

  return {
    success: true,
    teamId: team.id,
    source,
    stats: {
      basic: {
        goals: r(row.goals), conceded: r(row.conceded),
        goalDifference: r(row.goalDifference), corners: r(row.corners),
        avgGoals: r(row.avgGoals), avgConceded: r(row.avgConceded),
        avgGoalDiff: r(row.avgGoalDiff), avgCorners: r(row.avgCorners),
        shots: r(row.shots), shotsOnTarget: r(row.shotsOnTarget),
        assists: r(row.assists), passes: r(row.passes),
        penalties: r(row.penalties), fouls: r(row.fouls),
        redCards: r(row.redCards), yellowCards: r(row.yellowCards),
      },
      advanced: {
        possession: { value: (row.possession || 0) + '%', rank: 0 },
        clearances: r(row.clearances), tackles: r(row.tackles),
        interceptions: r(row.interceptions), offsides: r(row.offsides),
        foulsSuffered: r(row.foulsSuffered), keyPasses: r(row.keyPasses),
        crosses: r(row.crosses), successfulCrosses: r(row.crossesSuccessful || row.successfulCrosses),
        longBalls: r(row.longBalls), successfulLongBalls: r(row.successfulLongBalls),
        freeKicks: r(row.freeKicks), freeKickGoals: r(row.freeKickGoals),
        dribbles: r(row.dribbles), successfulDribbles: r(row.successfulDribbles),
        duelsWon: r(row.duelsWon), fastBreaks: r(row.fastBreaks),
        fastBreakShots: r(row.fastBreakShots), fastBreakGoals: r(row.fastBreakGoals),
        hitWoodwork: r(row.hitWoodwork), possessionLost: r(row.possessionLost),
      },
      teamId: team.id, teamName: team.nameCn,
      league: team.leagueCn, rank: team.rank,
      matchesPlayed,
      last_updated: row.last_updated || null,
      cleanSheets: row.cleanSheets || 0,
      shotsPerGame: matchesPlayed > 0 ? parseFloat((shotsTotal / matchesPlayed).toFixed(1)) : 0,
      shotAccuracy: shotsTotal > 0 ? parseFloat(((shotsOnTargetTotal / shotsTotal) * 100).toFixed(1)) : 0,
      homeXg: row.home_xg != null ? parseFloat(Number(row.home_xg).toFixed(1)) : (team.homeXg || 0),
      awayXg: row.away_xg != null ? parseFloat(Number(row.away_xg).toFixed(1)) : (team.awayXg || 0),
      seasonXpts: row.seasonXpts ?? row.season_xpts ?? 0,
      seasonPpda: row.seasonPpda ?? row.season_ppda ?? 0,
      seasonPpdaAllowed: row.seasonPpdaAllowed ?? row.season_ppda_allowed ?? 0,
      seasonNpxgd: row.seasonNpxgd ?? row.season_npxgd ?? 0,
      matches: row.matches ?? 0,
      homeStats: {
        played: matchesPlayed,
        wins: realTotalWins,
        draws: realTotalDraws,
        losses: realTotalLosses,
        goalsFor: totalGoals,
        goalsAgainst: totalConceded,
        xgFor: matchesPlayed > 0 ? parseFloat((totalGoals * 0.95 / matchesPlayed).toFixed(1)) : 0,
        xgAgainst: matchesPlayed > 0 ? parseFloat((totalConceded * 1.05 / matchesPlayed).toFixed(1)) : 0,
      },
      awayStats: {
        played: 0, wins: 0, draws: 0, losses: 0,
        goalsFor: 0, goalsAgainst: 0,
        xgFor: 0, xgAgainst: 0,
        ...(hasRealWDL ? {} : { estimated: true }),
      },
      estimated: !hasRealWDL,
    },
  };
}

// ======================== Route: GET /team-stats/:teamId ========================
router.get('/team-stats/:teamId', async (req, res) => {
  const { teamId } = req.params;
  const isRefresh = req.query.refresh === 'true';
  const now = Date.now();

  // Find team in mergedTeams (DB + REAL_TEAMS), then ALL_LEAGUE_TEAMS
  const mergedTeams = await getTeamsMerged();
  let team = mergedTeams.find((t) => t.id === teamId);
  const leagueTeam = ALL_LEAGUE_TEAMS.find((t) => t.id === teamId);
  if (!team && leagueTeam && leagueTeam.realTeamId) {
    team = mergedTeams.find((t) => t.id === leagueTeam.realTeamId);
  }
  if (!team && !leagueTeam) {
    return res.status(404).json({ success: false, error: 'Team \'' + teamId + '\' not found.' });
  }
  // For teams in ALL_LEAGUE_TEAMS not in mergedTeams, construct fallback team
  if (!team && leagueTeam) {
    const realTeamData = leagueTeam.realTeamId
      ? mergedTeams.find(t => t.id === leagueTeam.realTeamId)
      : mergedTeams.find(t => t.nameCn === leagueTeam.name || t.name === leagueTeam.englishName);
    // 最终 fallback：仍从 REAL_TEAMS 查找
    const fallbackReal = !realTeamData
      ? (REAL_TEAMS.find(t => t.id === leagueTeam.realTeamId) || REAL_TEAMS.find(t => t.nameCn === leagueTeam.name || t.name === leagueTeam.englishName))
      : null;
    const usedRealData = realTeamData || fallbackReal;
    const preset = LEAGUE_PRESETS[leagueTeam.leagueKey];
    const totalPlayed = usedRealData
      ? (usedRealData.homeStats.played + usedRealData.awayStats.played)
      : (preset ? preset.matchesPerSeason : 30);
    const halfPlayed = Math.round(totalPlayed / 2);

    team = {
      id: leagueTeam.id, name: leagueTeam.englishName, nameCn: leagueTeam.name,
      league: leagueTeam.leagueKey, leagueCn: leagueTeam.league,
      rank: usedRealData ? (usedRealData.rank || 0) : 0,
      homeStats: (usedRealData && usedRealData.homeStats) || { played: halfPlayed, wins: 0, draws: 0, losses: 0, goalsFor: 0, goalsAgainst: 0, xgFor: 0, xgAgainst: 0 },
      awayStats: (usedRealData && usedRealData.awayStats) || { played: totalPlayed - halfPlayed, wins: 0, draws: 0, losses: 0, goalsFor: 0, goalsAgainst: 0, xgFor: 0, xgAgainst: 0 },
    };
  }

  console.log('[team-stats] checking:', team.nameCn, teamId, isRefresh ? '(refresh)' : '(db)');

  // 1. First check SQLite
  let dbRow = await getTeamStatsFromDb(teamId).catch(() => null);
  if (!dbRow) {
    dbRow = await getTeamStatsFromDb(team.id).catch(() => null);
  }
  if (!dbRow && leagueTeam && leagueTeam.realTeamId) {
    dbRow = await getTeamStatsFromDb(leagueTeam.realTeamId).catch(() => null);
  }
  if (!dbRow && team.nameCn) {
    const d = await getDb();
    dbRow = await d.get(
      'SELECT * FROM team_stats WHERE team_name_cn = ? OR team_name = ? LIMIT 1',
      [team.nameCn, team.name]
    ).catch(() => null);
  }

  // 2. Non-refresh mode + data exists → return from SQLite
  if (!isRefresh && dbRow) {
    console.log('[team-stats] SQLite hit, last_updated:', dbRow.last_updated);
    return res.json(buildResponseFromDb(team, dbRow, 'sqlite'));
  }

  // 3. No data + non-refresh → prompt user to refresh
  if (!isRefresh && !dbRow) {
    console.log('[team-stats] no data, waiting for manual refresh');
    return res.json({
      success: true, teamId, stats: null, source: 'empty',
      estimated: true,
      teamName: team.nameCn, league: team.leagueCn,
      rank: team.rank,
      matchesPlayed: team.homeStats.played + team.awayStats.played,
      msg: 'No data yet, click Refresh to get latest stats.',
    });
  }

  // 4. Refresh mode: rate limiting
  if (isRefresh) {
    const lastRequest = requestThrottle.get(teamId) || 0;
    if (now - lastRequest < THROTTLE_MS) {
      return res.status(429).json({
        success: false,
        error: 'Too frequent, retry in ' + Math.ceil((THROTTLE_MS - (now - lastRequest)) / 1000) + ' seconds',
      });
    }
    requestThrottle.set(teamId, now);
  }

  // 5. Trigger crawler (with 75s timeout)
  console.log('[team-stats] calling crawler:', team.nameCn, '/', team.leagueCn);
  try {
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('CRAWLER_TIMEOUT')), 75_000)
    );
    const liveStats = await Promise.race([
      fetchTeamStatsFromQiumiwu(team.nameCn, team.leagueCn),
      timeoutPromise,
    ]);

    if (liveStats && Object.keys(liveStats).filter(k => liveStats[k] !== undefined).length >= 1) {
      await upsertTeamStats(team.id, team.nameCn, team.name, team.league, team.leagueCn, liveStats);
      console.log('[team-stats] crawl + write success, source=live');
      const fresh = await getTeamStatsFromDb(teamId).catch(() => null);
      if (fresh) return res.json(buildResponseFromDb(team, fresh, 'live'));
      return res.json(buildResponse(team, liveStats, 'live'));
    }

    if (liveStats === null) {
      console.warn('[team-stats] crawler timeout or returned null');
    } else {
      console.warn('[team-stats] crawler returned empty');
    }
  } catch (err) {
    const msg = (err && err.message) ? err.message.slice(0, 150) : '';
    if (msg === 'CRAWLER_TIMEOUT') {
      console.warn('[team-stats] crawler timeout (75s), degrading to SQLite');
    } else {
      console.error('[team-stats] crawl error:', msg);
    }
  }

  // 6. Crawler failed → degrade to SQLite
  if (dbRow) {
    console.log('[team-stats] crawler failed, degrading to SQLite');
    return res.json(buildResponseFromDb(team, dbRow, 'cache'));
  }

  // 7. No data at all → return fallback estimate
  console.log('[team-stats] no crawler data, no DB cache, returning fallback');
  return res.json({
    success: true,
    teamId,
    source: 'fallback',
    estimated: true,
    stats: buildFallbackStats(team),
  });
});

export default router;
