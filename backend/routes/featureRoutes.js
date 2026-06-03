import express from 'express';
import { buildFeatureVector, buildAllTeamsFeatureVectors } from '../services/featureService.js';
import { normalizeFeatures, getFeatureStats } from '../services/normalizationService.js';
import cache from '../services/cacheService.js';
import { query } from '../dbService.js';

const router = express.Router();

router.get('/teams/:teamId', async (req, res) => {
  try {
    const { teamId } = req.params;
    const matches = parseInt(req.query.matches) || 10;
    const normalize = req.query.normalize === 'true';

    const vector = await buildFeatureVector(parseInt(teamId), { matches });
    
    let result = { success: true, data: vector };
    
    if (normalize) {
      const allVectors = await buildAllTeamsFeatureVectors(matches);
      const { normalized, stats } = normalizeFeatures(allVectors);
      const normalizedVector = normalized.find(v => v.teamId === parseInt(teamId));
      
      if (normalizedVector) {
        result.data = normalizedVector;
        result.stats = stats;
      }
    }
    
    res.json(result);
  } catch (error) {
    console.error('获取球队特征失败:', error);
    res.status(500).json({ error: true, message: '获取球队特征失败' });
  }
});

router.get('/teams', async (req, res) => {
  try {
    const matches = parseInt(req.query.matches) || 10;
    const normalize = req.query.normalize === 'true';
    
    const vectors = await buildAllTeamsFeatureVectors(matches);
    
    let result = { success: true, data: vectors, count: vectors.length };
    
    if (normalize) {
      const { normalized, stats } = normalizeFeatures(vectors);
      result.data = normalized;
      result.stats = stats;
    }
    
    res.json(result);
  } catch (error) {
    console.error('获取所有球队特征失败:', error);
    res.status(500).json({ error: true, message: '获取所有球队特征失败' });
  }
});

router.get('/stats', async (req, res) => {
  try {
    const matches = parseInt(req.query.matches) || 10;
    const vectors = await buildAllTeamsFeatureVectors(matches);
    const stats = getFeatureStats(vectors);
    
    res.json({ success: true, data: stats });
  } catch (error) {
    console.error('获取特征统计失败:', error);
    res.status(500).json({ error: true, message: '获取特征统计失败' });
  }
});

router.get('/compare/:team1Id/:team2Id', async (req, res) => {
  try {
    const { team1Id, team2Id } = req.params;
    const matches = parseInt(req.query.matches) || 10;
    
    const [team1, team2] = await Promise.all([
      buildFeatureVector(parseInt(team1Id), { matches }),
      buildFeatureVector(parseInt(team2Id), { matches })
    ]);
    
    const comparison = {
      team1,
      team2,
      difference: {}
    };
    
    Object.keys(team1).forEach(key => {
      if (key !== 'teamId' && typeof team1[key] === 'number') {
        comparison.difference[key] = team1[key] - team2[key];
      }
    });
    
    res.json({ success: true, data: comparison });
  } catch (error) {
    console.error('球队对比失败:', error);
    res.status(500).json({ error: true, message: '球队对比失败' });
  }
});

router.post('/cache/clear', (req, res) => {
  try {
    if (req.query.teamId) {
      cache.clearTeamCache(parseInt(req.query.teamId));
      res.json({ success: true, message: '球队缓存已清除' });
    } else {
      cache.clearAll();
      res.json({ success: true, message: '所有缓存已清除' });
    }
  } catch (error) {
    console.error('清除缓存失败:', error);
    res.status(500).json({ error: true, message: '清除缓存失败' });
  }
});

router.get('/cache/stats', (req, res) => {
  try {
    const stats = cache.getStats();
    res.json({ success: true, data: stats });
  } catch (error) {
    console.error('获取缓存状态失败:', error);
    res.status(500).json({ error: true, message: '获取缓存状态失败' });
  }
});

export default router;
