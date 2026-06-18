import { Router } from 'express';
import { REAL_TEAMS } from '../../src/data/realTeamsData';
import { ALL_LEAGUE_TEAMS } from '../../src/data/leagueTeams';
import { getDb, upsertTeamStats, getTeamStatsFromDb } from '../../database/db';
import { LEAGUE_PRESETS } from '../../config/leaguePresets';
import { fetchTeamStatsFromQiumiwu } from '../services/crawlerHelper.js';

const router = Router();

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
    },
    awayStats: {
      played: awayPlayed,
      wins: 0, draws: 0, losses: 0,
      goalsFor: 0, goalsAgainst: 0,
      xgFor: 0, xgAgainst: 0,
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

  const realTotalWins = (team.homeStats ? (team.homeStats.wins || 0) : 0) + (team.awayStats ? (team.awayStats.wins || 0) : 0);
  const realTotalDraws = (team.homeStats ? (team.homeStats.draws || 0) : 0) + (team.awayStats ? (team.awayStats.draws || 0) : 0);
  const realTotalLosses = (team.homeStats ? (team.homeStats.losses || 0) : 0) + (team.awayStats ? (team.awayStats.losses || 0) : 0);
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
      homeStats: {
        played: homePlayed,
        wins: homeWins,
        draws: homeDraws,
        losses: homeLosses,
        goalsFor: homeGoals,
        goalsAgainst: homeConceded,
        xgFor: parseFloat(((homeGoals * 0.95) / homePlayed).toFixed(2)),
        xgAgainst: parseFloat(((homeConceded * 1.05) / homePlayed).toFixed(2)),
      },
      awayStats: {
        played: awayPlayed,
        wins: awayWins,
        draws: awayDraws,
        losses: awayLosses,
        goalsFor: awayGoals,
        goalsAgainst: awayConceded,
        xgFor: parseFloat(((awayGoals * 0.95) / awayPlayed).toFixed(2)),
        xgAgainst: parseFloat(((awayConceded * 1.05) / awayPlayed).toFixed(2)),
      },
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

  const realTotalWins = (team.homeStats ? (team.homeStats.wins || 0) : 0) + (team.awayStats ? (team.awayStats.wins || 0) : 0);
  const realTotalDraws = (team.homeStats ? (team.homeStats.draws || 0) : 0) + (team.awayStats ? (team.awayStats.draws || 0) : 0);
  const realTotalLosses = (team.homeStats ? (team.homeStats.losses || 0) : 0) + (team.awayStats ? (team.awayStats.losses || 0) : 0);
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
      homeStats: {
        played: homePlayed,
        wins: homeWins, draws: homeDraws, losses: homeLosses,
        goalsFor: homeGoals, goalsAgainst: homeConceded,
        xgFor: parseFloat((homeGoals * 0.95).toFixed(1)),
        xgAgainst: parseFloat((homeConceded * 1.05).toFixed(1)),
      },
      awayStats: {
        played: awayPlayed,
        wins: awayWins, draws: awayDraws, losses: awayLosses,
        goalsFor: awayGoals, goalsAgainst: awayConceded,
        xgFor: parseFloat((awayGoals * 0.95).toFixed(1)),
        xgAgainst: parseFloat((awayConceded * 1.05).toFixed(1)),
      },
    },
  };
}

// ======================== Route: GET /team-stats/:teamId ========================
router.get('/team-stats/:teamId', async (req, res) => {
  const { teamId } = req.params;
  const isRefresh = req.query.refresh === 'true';
  const now = Date.now();

  // Find team in REAL_TEAMS, then ALL_LEAGUE_TEAMS
  let team = REAL_TEAMS.find((t) => t.id === teamId);
  const leagueTeam = ALL_LEAGUE_TEAMS.find((t) => t.id === teamId);
  if (!team && leagueTeam && leagueTeam.realTeamId) {
    team = REAL_TEAMS.find((t) => t.id === leagueTeam.realTeamId);
  }
  if (!team && !leagueTeam) {
    return res.status(404).json({ success: false, error: 'Team \'' + teamId + '\' not found.' });
  }
  // For teams in ALL_LEAGUE_TEAMS not in REAL_TEAMS, construct fallback team
  if (!team && leagueTeam) {
    const realTeamData = leagueTeam.realTeamId
      ? REAL_TEAMS.find(t => t.id === leagueTeam.realTeamId)
      : REAL_TEAMS.find(t => t.nameCn === leagueTeam.name || t.name === leagueTeam.englishName);
    const preset = LEAGUE_PRESETS[leagueTeam.leagueKey];
    const totalPlayed = realTeamData
      ? (realTeamData.homeStats.played + realTeamData.awayStats.played)
      : (preset ? preset.matchesPerSeason : 30);
    const halfPlayed = Math.round(totalPlayed / 2);

    team = {
      id: leagueTeam.id, name: leagueTeam.englishName, nameCn: leagueTeam.name,
      league: leagueTeam.leagueKey, leagueCn: leagueTeam.league,
      rank: realTeamData ? (realTeamData.rank || 0) : 0,
      homeStats: (realTeamData && realTeamData.homeStats) || { played: halfPlayed, wins: 0, draws: 0, losses: 0, goalsFor: 0, goalsAgainst: 0, xgFor: 0, xgAgainst: 0 },
      awayStats: (realTeamData && realTeamData.awayStats) || { played: totalPlayed - halfPlayed, wins: 0, draws: 0, losses: 0, goalsFor: 0, goalsAgainst: 0, xgFor: 0, xgAgainst: 0 },
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
    stats: buildFallbackStats(team),
  });
});

export default router;
