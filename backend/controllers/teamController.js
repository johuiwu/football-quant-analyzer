import { query, get } from '../dbService.js';

export async function getAllTeams(req, res) {
  try {
    const sql = `
      SELECT 
        t.id as teamId,
        t.name as teamName,
        t.chinese_name as chineseName,
        t.country_code as countryCode,
        t.fifa_rank as fifaRank,
        t.elo_rating as eloScore,
        t.market_value as marketValue,
        COUNT(p.id) as playerCount
      FROM teams t
      LEFT JOIN players p ON t.id = p.team_id
      GROUP BY t.id
      ORDER BY t.name
    `;
    const teams = await query(sql);
    res.json({ success: true, data: teams });
  } catch (error) {
    console.error('Error fetching teams:', error.message);
    res.status(500).json({ error: true, message: 'Failed to fetch teams' });
  }
}

export async function getTeamById(req, res) {
  try {
    const { id } = req.params;
    
    const teamSql = `
      SELECT 
        id as teamId,
        name as teamName,
        chinese_name as chineseName,
        country_code as countryCode,
        fifa_rank as fifaRank,
        elo_rating as eloScore,
        market_value as marketValue
      FROM teams
      WHERE id = ?
    `;
    const team = await get(teamSql, [id]);
    
    if (!team) {
      return res.status(404).json({ error: true, message: 'Team not found' });
    }
    
    const playersSql = `
      SELECT 
        id,
        player_id as playerId,
        player_name as name,
        player_nickname as nickname,
        jersey_number as jerseyNumber,
        team_id as teamId
      FROM players
      WHERE team_id = ?
      ORDER BY jersey_number
    `;
    const players = await query(playersSql, [id]);
    
    const playersWithDetails = await Promise.all(
      players.map(async (player) => {
        const positionsSql = `
          SELECT 
            id,
            position_id as positionId,
            position,
            from_time as fromTime,
            to_time as toTime,
            from_period as fromPeriod,
            to_period as toPeriod,
            start_reason as startReason,
            end_reason as endReason
          FROM player_positions
          WHERE player_id = ?
        `;
        const cardsSql = `
          SELECT 
            id,
            time,
            card_type as cardType,
            reason,
            period
          FROM player_cards
          WHERE player_id = ?
        `;
        
        const [positions, cards] = await Promise.all([
          query(positionsSql, [player.id]),
          query(cardsSql, [player.id])
        ]);
        
        return {
          ...player,
          cards,
          positions
        };
      })
    );
    
    res.json({
      success: true,
      data: {
        ...team,
        players: playersWithDetails
      }
    });
  } catch (error) {
    console.error('Error fetching team:', error.message);
    res.status(500).json({ error: true, message: 'Failed to fetch team details' });
  }
}

export async function getTeamStats(req, res) {
  try {
    const { id } = req.params;
    
    const teamSql = `
      SELECT name as teamName, chinese_name as chineseName
      FROM teams
      WHERE id = ?
    `;
    const team = await get(teamSql, [id]);
    
    if (!team) {
      return res.status(404).json({ error: true, message: 'Team not found' });
    }
    
    const matchesSql = `
      SELECT 
        COUNT(*) as totalMatches,
        SUM(CASE WHEN (home_team_id = ? AND home_score > away_score) 
              OR (away_team_id = ? AND away_score > home_score) THEN 1 ELSE 0 END) as wins,
        SUM(CASE WHEN home_score = away_score THEN 1 ELSE 0 END) as draws,
        SUM(CASE WHEN (home_team_id = ? AND home_score < away_score) 
              OR (away_team_id = ? AND away_score < home_score) THEN 1 ELSE 0 END) as losses,
        SUM(CASE WHEN home_team_id = ? THEN home_score ELSE away_score END) as goalsScored,
        SUM(CASE WHEN home_team_id = ? THEN away_score ELSE home_score END) as goalsConceded
      FROM matches
      WHERE home_team_id = ? OR away_team_id = ?
    `;
    const stats = await get(matchesSql, [id, id, id, id, id, id, id, id]);
    
    const winRate = stats.totalMatches > 0 
      ? ((stats.wins / stats.totalMatches) * 100).toFixed(2) 
      : 0;
    const avgGoalsScored = stats.totalMatches > 0 
      ? (stats.goalsScored / stats.totalMatches).toFixed(2) 
      : 0;
    const avgGoalsConceded = stats.totalMatches > 0 
      ? (stats.goalsConceded / stats.totalMatches).toFixed(2) 
      : 0;
    
    const yearlyStatsSql = `
      SELECT 
        world_cup_year as year,
        COUNT(*) as matches,
        SUM(CASE WHEN (home_team_id = ? AND home_score > away_score) 
              OR (away_team_id = ? AND away_score > home_score) THEN 1 ELSE 0 END) as wins,
        SUM(CASE WHEN home_score = away_score THEN 1 ELSE 0 END) as draws,
        SUM(CASE WHEN (home_team_id = ? AND home_score < away_score) 
              OR (away_team_id = ? AND away_score < home_score) THEN 1 ELSE 0 END) as losses
      FROM matches
      WHERE home_team_id = ? OR away_team_id = ?
      GROUP BY world_cup_year
      ORDER BY world_cup_year DESC
    `;
    const yearlyStats = await query(yearlyStatsSql, [id, id, id, id, id, id]);
    
    res.json({
      success: true,
      data: {
        teamId: parseInt(id),
        teamName: team.teamName,
        chineseName: team.chineseName,
        totalMatches: stats.totalMatches,
        wins: stats.wins,
        draws: stats.draws,
        losses: stats.losses,
        goalsScored: stats.goalsScored,
        goalsConceded: stats.goalsConceded,
        winRate: parseFloat(winRate),
        avgGoalsScored: parseFloat(avgGoalsScored),
        avgGoalsConceded: parseFloat(avgGoalsConceded),
        yearlyStats
      }
    });
  } catch (error) {
    console.error('Error fetching team stats:', error.message);
    res.status(500).json({ error: true, message: 'Failed to fetch team statistics' });
  }
}
