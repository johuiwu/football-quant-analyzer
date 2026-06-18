import express from 'express';
import { 
  predictMatchById, 
  simulatePoissonMatch, 
  getModelParameters,
  trainPoissonModel 
} from '../services/poissonPredictor.js';
import { getTeamStrengthVector } from '../services/strengthService.js';
import { query } from '../dbService.js';
import { requireFields, validateTypes, validateRanges } from '../middleware/validate.js';

const router = express.Router();

router.post('/predict/poisson', requireFields(['teamA_id', 'teamB_id']), validateTypes({ teamA_id: 'number', teamB_id: 'number', isNeutral: 'boolean', stage: 'string', leagueName: 'string' }), async (req, res) => {
  try {
    const {
      teamA_id,
      teamB_id,
      isNeutral = true,
      stage = 'group',
      leagueName = ''
    } = req.body;

    if (!teamA_id || !teamB_id) {
      return res.status(400).json({
        success: false,
        message: 'teamA_id and teamB_id are required'
      });
    }

    const prediction = await predictMatchById(
      parseInt(teamA_id),
      parseInt(teamB_id),
      isNeutral,
      stage,
      leagueName
    );
    
    res.json({
      success: true,
      data: prediction
    });
  } catch (error) {
    console.error('Prediction error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to predict match'
    });
  }
});

router.post('/predict/simulate', requireFields(['teamA_id', 'teamB_id']), validateTypes({ teamA_id: 'number', teamB_id: 'number', isNeutral: 'boolean', stage: 'string', leagueName: 'string' }), validateRanges({ simulations: { min: 1, max: 10000 } }), async (req, res) => {
  try {
    const {
      teamA_id,
      teamB_id,
      isNeutral = true,
      stage = 'group',
      simulations = 100,
      leagueName = ''
    } = req.body;

    if (!teamA_id || !teamB_id) {
      return res.status(400).json({
        success: false,
        message: 'teamA_id and teamB_id are required'
      });
    }

    const [teamAStrength, teamBStrength] = await Promise.all([
      getTeamStrengthVector(parseInt(teamA_id)),
      getTeamStrengthVector(parseInt(teamB_id))
    ]);

    const results = [];
    let homeWins = 0, draws = 0, awayWins = 0;
    let totalGoalsA = 0, totalGoalsB = 0;

    for (let i = 0; i < simulations; i++) {
      const result = await simulatePoissonMatch(teamAStrength, teamBStrength, isNeutral, stage, leagueName);
      results.push(result);
      
      if (result.goalsA > result.goalsB) homeWins++;
      else if (result.goalsA === result.goalsB) draws++;
      else awayWins++;
      
      totalGoalsA += result.goalsA;
      totalGoalsB += result.goalsB;
    }
    
    res.json({
      success: true,
      data: {
        teamA_id: parseInt(teamA_id),
        teamB_id: parseInt(teamB_id),
        simulations,
        homeWins,
        draws,
        awayWins,
        homeWinRate: homeWins / simulations,
        drawRate: draws / simulations,
        awayWinRate: awayWins / simulations,
        avgGoalsA: totalGoalsA / simulations,
        avgGoalsB: totalGoalsB / simulations
      }
    });
  } catch (error) {
    console.error('Simulation error:', error);
    res.status(500).json({
      error: true,
      message: 'Failed to simulate matches'
    });
  }
});

router.get('/predict/parameters', async (req, res) => {
  try {
    const params = await getModelParameters();
    res.json({
      success: true,
      data: params
    });
  } catch (error) {
    console.error('Get parameters error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get model parameters'
    });
  }
});

router.post('/predict/train', async (req, res) => {
  try {
    const matches = await query(`
      SELECT 
        m.id,
        m.home_team_id as homeTeamId,
        m.away_team_id as awayTeamId,
        m.home_score as homeGoals,
        m.away_score as awayGoals,
        tsa.offense_index as offenseA,
        tsa.defense_index as defenseA,
        tsb.offense_index as offenseB,
        tsb.defense_index as defenseB
      FROM matches m
      JOIN team_strength_vectors tsa ON m.home_team_id = tsa.team_id
      JOIN team_strength_vectors tsb ON m.away_team_id = tsb.team_id
      WHERE m.home_score IS NOT NULL AND m.away_score IS NOT NULL
    `);
    
    const params = await trainPoissonModel(matches);
    
    res.json({
      success: true,
      message: 'Model trained successfully',
      data: params
    });
  } catch (error) {
    console.error('Training error:', error);
    res.status(500).json({
      error: true,
      message: 'Failed to train model'
    });
  }
});

export default router;
