import express from 'express';
import { query, get, run } from '../dbService.js';

const router = express.Router();

router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const isRefresh = req.query.refresh === 'true';

    if (isRefresh) {
      return res.status(501).json({
        success: false,
        msg: '此独立后端不支持实时爬虫更新。请使用「npm run dev」启动主服务以获取最新数据。',
        hint: 'USE_MAIN_SERVER'
      });
    }

    let teamData = null;
    let source = 'sqlite';

    // 优先查询 team_stats（含完整高阶数据）
    const statsSql = `
      SELECT 
        team_id as teamId,
        team_name as teamName,
        team_name_cn as teamNameCn,
        league,
        league_cn as leagueCn,
        goals,
        conceded,
        goalDifference,
        shots,
        shotsOnTarget,
        assists,
        passes,
        corners,
        fouls,
        redCards,
        yellowCards,
        penalties,
        cleanSheets,
        avgGoals,
        avgConceded,
        avgGoalDiff,
        avgCorners,
        possession,
        tackles,
        interceptions,
        clearances,
        offsides,
        foulsSuffered,
        keyPasses,
        crosses,
        crossesSuccessful,
        successfulCrosses,
        longBalls,
        successfulLongBalls,
        freeKicks,
        freeKickGoals,
        dribbles,
        successfulDribbles,
        duelsWon,
        fastBreaks,
        fastBreakShots,
        fastBreakGoals,
        hitWoodwork,
        possessionLost,
        twoYellowRedCards,
        effectiveBlocks,
        passesSuccessful,
        duelsTotal
      FROM team_stats
      WHERE team_id = ?
    `;

    teamData = await get(statsSql, [id]);

    // 补充 teams 表中的 rank / home_stats / away_stats / form 等元数据
    if (teamData) {
      const teamMetaSql = `
        SELECT
          rank,
          home_stats as homeStatsJson,
          away_stats as awayStatsJson,
          form,
          home_xg as homeXg,
          away_xg as awayXg,
          season_xpts as seasonXpts,
          season_ppda as seasonPpda,
          season_ppda_allowed as seasonPpdaAllowed,
          season_npxgd as seasonNpxgd,
          matches
        FROM teams
        WHERE team_id = ?
      `;
      const meta = await get(teamMetaSql, [id]);
      if (meta) {
        teamData.rank = meta.rank || teamData.rank;
        teamData.homeStatsJson = meta.homeStatsJson;
        teamData.awayStatsJson = meta.awayStatsJson;
        teamData.form = meta.form;
        teamData.homeXg = meta.homeXg;
        teamData.awayXg = meta.awayXg;
        teamData.seasonXpts = meta.seasonXpts || 0;
        teamData.seasonPpda = meta.seasonPpda || 0;
        teamData.seasonPpdaAllowed = meta.seasonPpdaAllowed || 0;
        teamData.seasonNpxgd = meta.seasonNpxgd || 0;
        teamData.matches = meta.matches || 0;
      }
    } else {
      // 未在 team_stats 中找到，回退到 teams 表
      const completeTeamSql = `
        SELECT 
          team_id as teamId,
          team_name as teamName,
          team_name_cn as teamNameCn,
          league,
          league_cn as leagueCn,
          rank,
          home_stats as homeStatsJson,
          away_stats as awayStatsJson,
          form,
          clean_sheets as cleanSheets,
          shots_per_game as shotsPerGame,
          shot_accuracy as shotAccuracy,
          home_xg as homeXg,
          away_xg as awayXg,
          form_last5 as formLast5
        FROM teams
        WHERE team_id = ?
      `;
      teamData = await get(completeTeamSql, [id]);
    }

    if (!teamData) {
      return res.status(404).json({ success: false, msg: '球队数据未找到，请点击「更新数据」获取' });
    }

    let homeStats = { played: 0, wins: 0, draws: 0, losses: 0, goalsFor: 0, goalsAgainst: 0, xgFor: 0, xgAgainst: 0 };
    let awayStats = { played: 0, wins: 0, draws: 0, losses: 0, goalsFor: 0, goalsAgainst: 0, xgFor: 0, xgAgainst: 0 };

    if (teamData.homeStatsJson) {
      try {
        homeStats = JSON.parse(teamData.homeStatsJson);
      } catch (e) {
        console.warn('[teamStats] 解析 homeStatsJson 失败:', e.message);
      }
    } else if (teamData.goals != null) {
      const totalPlayed = 38;
      const homePlayed = Math.round(totalPlayed / 2);
      const awayPlayed = totalPlayed - homePlayed;
      homeStats = {
        played: homePlayed,
        wins: Math.round((teamData.goals / totalPlayed) * homePlayed * 0.5),
        draws: Math.round((teamData.goals / totalPlayed) * homePlayed * 0.3),
        losses: homePlayed - Math.round((teamData.goals / totalPlayed) * homePlayed * 0.5) - Math.round((teamData.goals / totalPlayed) * homePlayed * 0.3),
        goalsFor: Math.round(teamData.goals * 0.55),
        goalsAgainst: Math.round(teamData.conceded * 0.5),
        xgFor: teamData.avgGoals ? parseFloat((teamData.avgGoals * 0.95).toFixed(2)) : 0,
        xgAgainst: teamData.avgConceded ? parseFloat((teamData.avgConceded * 1.05).toFixed(2)) : 0,
      };
      awayStats = {
        played: awayPlayed,
        wins: Math.round((teamData.goals / totalPlayed) * awayPlayed * 0.4),
        draws: Math.round((teamData.goals / totalPlayed) * awayPlayed * 0.3),
        losses: awayPlayed - Math.round((teamData.goals / totalPlayed) * awayPlayed * 0.4) - Math.round((teamData.goals / totalPlayed) * awayPlayed * 0.3),
        goalsFor: Math.round(teamData.goals * 0.45),
        goalsAgainst: Math.round(teamData.conceded * 0.5),
        xgFor: teamData.avgGoals ? parseFloat((teamData.avgGoals * 0.85).toFixed(2)) : 0,
        xgAgainst: teamData.avgConceded ? parseFloat((teamData.avgConceded * 1.1).toFixed(2)) : 0,
      };
    }

    if (teamData.awayStatsJson) {
      try {
        awayStats = JSON.parse(teamData.awayStatsJson);
      } catch (e) {
        console.warn('[teamStats] 解析 awayStatsJson 失败:', e.message);
      }
    }

    const response = {
      success: true,
      source: source,
      stats: {
        teamId: teamData.teamId,
        teamName: teamData.teamName,
        teamNameCn: teamData.teamNameCn,
        league: teamData.league,
        leagueCn: teamData.leagueCn,
        rank: teamData.rank || 0,
        homeStats: homeStats,
        awayStats: awayStats,
        cleanSheets: teamData.cleanSheets || 0,
        shotsPerGame: teamData.shotsPerGame || (teamData.shots ? Math.round(teamData.shots / 38 * 10) / 10 : 0),
        shotAccuracy: teamData.shotAccuracy || (teamData.shotsOnTarget > 0 && teamData.shots > 0 ? Math.round((teamData.shotsOnTarget / teamData.shots) * 100) : 0),
        homeXg: teamData.homeXg ?? 0,
        awayXg: teamData.awayXg ?? 0,
        seasonXpts: teamData.seasonXpts ?? 0,
        seasonPpda: teamData.seasonPpda ?? 0,
        seasonPpdaAllowed: teamData.seasonPpdaAllowed ?? 0,
        seasonNpxgd: teamData.seasonNpxgd ?? 0,
        matches: teamData.matches ?? 0,
      }
    };

    if (teamData.goals != null) {
      response.stats.basic = {
        goals: { total: teamData.goals, rank: 0 },
        conceded: { total: teamData.conceded, rank: 0 },
        goalDifference: { total: teamData.goalDifference, rank: 0 },
        corners: { total: teamData.corners, rank: 0 },
        avgGoals: { total: teamData.avgGoals, rank: 0 },
        avgConceded: { total: teamData.avgConceded, rank: 0 },
        avgGoalDiff: { total: teamData.avgGoalDiff, rank: 0 },
        avgCorners: { total: teamData.avgCorners, rank: 0 },
        shots: { total: teamData.shots, rank: 0 },
        shotsOnTarget: { total: teamData.shotsOnTarget, rank: 0 },
        assists: { total: teamData.assists, rank: 0 },
        passes: { total: teamData.passes, rank: 0 },
        penalties: { total: teamData.penalties, rank: 0 },
        fouls: { total: teamData.fouls, rank: 0 },
        redCards: { total: teamData.redCards, rank: 0 },
        yellowCards: { total: teamData.yellowCards, rank: 0 },
      };
    }

    if (teamData.possession != null) {
      response.stats.advanced = {
        possession: { value: typeof teamData.possession === 'number' ? `${teamData.possession}%` : teamData.possession, rank: 0 },
        clearances: { total: teamData.clearances, rank: 0 },
        tackles: { total: teamData.tackles, rank: 0 },
        interceptions: { total: teamData.interceptions, rank: 0 },
        offsides: { total: teamData.offsides, rank: 0 },
        foulsSuffered: { total: teamData.foulsSuffered, rank: 0 },
        keyPasses: { total: teamData.keyPasses, rank: 0 },
        crosses: { total: teamData.crosses, rank: 0 },
        successfulCrosses: { total: teamData.successfulCrosses || teamData.crossesSuccessful, rank: 0 },
        longBalls: { total: teamData.longBalls, rank: 0 },
        successfulLongBalls: { total: teamData.successfulLongBalls, rank: 0 },
        freeKicks: { total: teamData.freeKicks, rank: 0 },
        freeKickGoals: { total: teamData.freeKickGoals, rank: 0 },
        dribbles: { total: teamData.dribbles, rank: 0 },
        successfulDribbles: { total: teamData.successfulDribbles, rank: 0 },
        duelsWon: { total: teamData.duelsWon, rank: 0 },
        fastBreaks: { total: teamData.fastBreaks, rank: 0 },
        fastBreakShots: { total: teamData.fastBreakShots, rank: 0 },
        fastBreakGoals: { total: teamData.fastBreakGoals, rank: 0 },
        hitWoodwork: { total: teamData.hitWoodwork, rank: 0 },
        possessionLost: { total: teamData.possessionLost, rank: 0 },
        twoYellowRedCards: { total: teamData.twoYellowRedCards, rank: 0 },
        effectiveBlocks: { total: teamData.effectiveBlocks, rank: 0 },
        passesSuccessful: { total: teamData.passesSuccessful, rank: 0 },
        crossesSuccessful: { total: teamData.crossesSuccessful || teamData.successfulCrosses, rank: 0 },
        duelsTotal: { total: teamData.duelsTotal, rank: 0 },
      };
    }
    
    res.json(response);
  } catch (error) {
    console.error('Error fetching team stats:', error.message);
    res.status(500).json({ success: false, msg: '获取数据失败' });
  }
});

export default router;
