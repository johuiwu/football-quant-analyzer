import { query, get } from '../dbService.js';

export async function getAllPlayers(req, res) {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const offset = (page - 1) * limit;
    
    const countSql = 'SELECT COUNT(*) as total FROM players';
    const countResult = await get(countSql);
    const total = countResult.total;
    
    const sql = `
      SELECT 
        p.id,
        p.player_id as playerId,
        p.player_name as name,
        p.player_nickname as nickname,
        p.jersey_number as jerseyNumber,
        p.team_id as teamId,
        t.name as teamName,
        t.chinese_name as chineseTeamName
      FROM players p
      JOIN teams t ON p.team_id = t.id
      ORDER BY p.player_name
      LIMIT ? OFFSET ?
    `;
    const players = await query(sql, [limit, offset]);
    
    res.json({
      success: true,
      data: {
        players,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit)
        }
      }
    });
  } catch (error) {
    console.error('Error fetching players:', error.message);
    res.status(500).json({ error: true, message: 'Failed to fetch players' });
  }
}

export async function getPlayerById(req, res) {
  try {
    const { id } = req.params;
    
    const playerSql = `
      SELECT 
        p.id,
        p.player_id as playerId,
        p.player_name as name,
        p.player_nickname as nickname,
        p.jersey_number as jerseyNumber,
        p.team_id as teamId,
        t.name as teamName,
        t.chinese_name as chineseTeamName
      FROM players p
      JOIN teams t ON p.team_id = t.id
      WHERE p.id = ?
    `;
    const player = await get(playerSql, [id]);
    
    if (!player) {
      return res.status(404).json({ error: true, message: 'Player not found' });
    }
    
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
      ORDER BY from_period, fromTime
    `;
    const positions = await query(positionsSql, [id]);
    
    const cardsSql = `
      SELECT 
        id,
        time,
        card_type as cardType,
        reason,
        period
      FROM player_cards
      WHERE player_id = ?
      ORDER BY period, time
    `;
    const cards = await query(cardsSql, [id]);
    
    res.json({
      success: true,
      data: {
        ...player,
        positions,
        cards
      }
    });
  } catch (error) {
    console.error('Error fetching player:', error.message);
    res.status(500).json({ error: true, message: 'Failed to fetch player details' });
  }
}

export async function getPlayersByTeam(req, res) {
  try {
    const { teamId } = req.params;
    
    const teamSql = 'SELECT id, name, chinese_name FROM teams WHERE id = ?';
    const team = await get(teamSql, [teamId]);
    
    if (!team) {
      return res.status(404).json({ error: true, message: 'Team not found' });
    }
    
    const playersSql = `
      SELECT 
        p.id,
        p.player_id as playerId,
        p.player_name as name,
        p.player_nickname as nickname,
        p.jersey_number as jerseyNumber,
        p.team_id as teamId
      FROM players p
      WHERE p.team_id = ?
      ORDER BY p.jersey_number
    `;
    const players = await query(playersSql, [teamId]);
    
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
          positions,
          cards
        };
      })
    );
    
    res.json({
      success: true,
      data: {
        team: {
          id: team.id,
          name: team.name,
          chineseName: team.chinese_name
        },
        players: playersWithDetails,
        total: playersWithDetails.length
      }
    });
  } catch (error) {
    console.error('Error fetching team players:', error.message);
    res.status(500).json({ error: true, message: 'Failed to fetch team players' });
  }
}
