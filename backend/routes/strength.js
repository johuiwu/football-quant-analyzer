import express from 'express';
import {
  getTeamStrengthVector,
  getAllTeamStrengthVectors,
  computeAndSaveAllTeamStrengthVectors,
  teamStrengthVector
} from '../services/strengthService.js';

const router = express.Router();

router.get('/teams/:id/strength', async (req, res) => {
  try {
    const teamId = parseInt(req.params.id);
    const vector = await getTeamStrengthVector(teamId);
    
    res.json({
      success: true,
      data: vector
    });
  } catch (error) {
    console.error('获取球队实力矢量失败:', error);
    res.status(500).json({
      success: false,

      error: '获取球队实力矢量失败'
    });
  }
});

router.get('/teams/strength/all', async (req, res) => {
  try {
    const vectors = await getAllTeamStrengthVectors();
    
    res.json({
      success: true,
      data: vectors
    });
  } catch (error) {
    console.error('获取所有球队实力矢量失败:', error);
    res.status(500).json({
      success: false,

      error: '获取所有球队实力矢量失败'
    });
  }
});

router.post('/teams/strength/compute-all', async (req, res) => {
  try {
    const results = await computeAndSaveAllTeamStrengthVectors();
    
    res.json({
      success: true,
      message: '成功计算并保存所有球队实力矢量',
      data: {
        count: results.length
      }
    });
  } catch (error) {
    console.error('计算所有球队实力矢量失败:', error);
    res.status(500).json({
      success: false,

      error: '计算所有球队实力矢量失败'
    });
  }
});

router.get('/teams/:id/strength/recompute', async (req, res) => {
  try {
    const teamId = parseInt(req.params.id);
    const vector = await teamStrengthVector(teamId);
    
    res.json({
      success: true,
      data: vector
    });
  } catch (error) {
    console.error('重新计算球队实力矢量失败:', error);
    res.status(500).json({
      success: false,

      error: '重新计算球队实力矢量失败'
    });
  }
});

router.get('/sync-standings', async (req, res) => {
  try {
    const vectors = await getAllTeamStrengthVectors();
    
    const teamsWithRankings = vectors.map((v, index) => ({
      rank: index + 1,
      ...v
    }));
    
    res.json({
      success: true,
      teams: teamsWithRankings,
      source: 'database',
      msg: `✓ 已加载 ${teamsWithRankings.length} 支球队排名数据`
    });
  } catch (error) {
    console.error('同步积分榜失败:', error);
    res.status(500).json({
      success: false,
      success: false,

      error: '同步积分榜失败',
      details: error.message
    });
  }
});

export default router;
