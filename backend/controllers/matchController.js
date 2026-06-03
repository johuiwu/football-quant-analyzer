import { query, get } from '../dbService.js';

export async function getAllMatches(req, res) {
  try {
    const year = req.query.year;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const offset = (page - 1) * limit;
    
    let whereClause = '';
    const params = [];
    
    if (year) {
      whereClause = 'WHERE world_cup_year = ?';
      params.push(year);
    }
    
    const countSql = `SELECT COUNT(*) as total FROM matches ${whereClause}`;
    const countResult = await get(countSql, params);
    const total = countResult.total;
    
    const sql = `
      SELECT 
        m.id,
        m.match_id as matchId,
        m.match_date as matchDate,
        m.kick_off as kickOff,
        m.home_score as homeScore,
        m.away_score as awayScore,
        m.stage,
        m.world_cup_year as worldCupYear,
        m.home_team_id as homeTeamId,
        m.away_team_id as awayTeamId,
        h.name as homeTeamName,
        h.chinese_name as homeTeamChinese,
        a.name as awayTeamName,
        a.chinese_name as awayTeamChinese
      FROM matches m
      JOIN teams h ON m.home_team_id = h.id
      JOIN teams a ON m.away_team_id = a.id
      ${whereClause}
      ORDER BY m.match_date DESC
      LIMIT ? OFFSET ?
    `;
    const matches = await query(sql, [...params, limit, offset]);
    
    res.json({
      success: true,
      data: {
        matches,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit)
        },
        filters: { year }
      }
    });
  } catch (error) {
    console.error('Error fetching matches:', error.message);
    res.status(500).json({ error: true, message: 'Failed to fetch matches' });
  }
}

export async function getMatchById(req, res) {
  try {
    const { id } = req.params;
    
    const matchSql = `
      SELECT 
        m.id,
        m.match_id as matchId,
        m.match_date as matchDate,
        m.kick_off as kickOff,
        m.home_score as homeScore,
        m.away_score as awayScore,
        m.stage,
        m.world_cup_year as worldCupYear,
        m.home_team_id as homeTeamId,
        m.away_team_id as awayTeamId,
        m.competition_stage_id as competitionStageId,
        m.stadium_id as stadiumId,
        m.stadium,
        m.stadium_country as stadiumCountry,
        m.referee_id as refereeId,
        m.referee,
        m.referee_country as refereeCountry,
        h.name as homeTeamName,
        h.chinese_name as homeTeamChinese,
        a.name as awayTeamName,
        a.chinese_name as awayTeamChinese
      FROM matches m
      JOIN teams h ON m.home_team_id = h.id
      JOIN teams a ON m.away_team_id = a.id
      WHERE m.id = ?
    `;
    const match = await get(matchSql, [id]);
    
    if (!match) {
      return res.status(404).json({ error: true, message: 'Match not found' });
    }
    
    res.json({
      success: true,
      data: match
    });
  } catch (error) {
    console.error('Error fetching match:', error.message);
    res.status(500).json({ error: true, message: 'Failed to fetch match details' });
  }
}

export async function getMatchesByTeam(req, res) {
  try {
    const { teamId } = req.params;
    const year = req.query.year;
    
    const teamSql = 'SELECT id, name, chinese_name FROM teams WHERE id = ?';
    const team = await get(teamSql, [teamId]);
    
    if (!team) {
      return res.status(404).json({ error: true, message: 'Team not found' });
    }
    
    let whereClause = '(m.home_team_id = ? OR m.away_team_id = ?)';
    const params = [teamId, teamId];
    
    if (year) {
      whereClause += ' AND m.world_cup_year = ?';
      params.push(year);
    }
    
    const matchesSql = `
      SELECT 
        m.id,
        m.match_id as matchId,
        m.match_date as matchDate,
        m.kick_off as kickOff,
        m.home_score as homeScore,
        m.away_score as awayScore,
        m.stage,
        m.world_cup_year as worldCupYear,
        m.home_team_id as homeTeamId,
        m.away_team_id as awayTeamId,
        h.name as homeTeamName,
        h.chinese_name as homeTeamChinese,
        a.name as awayTeamName,
        a.chinese_name as awayTeamChinese,
        CASE 
          WHEN m.home_team_id = ? THEN 'home'
          ELSE 'away'
        END as teamRole,
        CASE 
          WHEN (m.home_team_id = ? AND m.home_score > m.away_score) 
            OR (m.away_team_id = ? AND m.away_score > m.home_score) THEN 'win'
          WHEN m.home_score = m.away_score THEN 'draw'
          ELSE 'loss'
        END as result
      FROM matches m
      JOIN teams h ON m.home_team_id = h.id
      JOIN teams a ON m.away_team_id = a.id
      WHERE ${whereClause}
      ORDER BY m.match_date DESC
    `;
    const matches = await query(matchesSql, [teamId, teamId, teamId, ...params]);
    
    res.json({
      success: true,
      data: {
        team: {
          id: team.id,
          name: team.name,
          chineseName: team.chinese_name
        },
        matches,
        total: matches.length,
        filters: { year }
      }
    });
  } catch (error) {
    console.error('Error fetching team matches:', error.message);
    res.status(500).json({ error: true, message: 'Failed to fetch team matches' });
  }
}
