import { Router } from 'express';
import { 
  getCrawlerStatus, 
  loginToHG, 
  fetchAllLiveMatches, 
  closeBrowser,
  startMatchPolling,
  stopMatchPolling,
  getPollingStatus
} from '../services/hgCrawlerService.js';

import { requireFields, validateLength } from '../middleware/validate.js';

const router = Router();

// ==================== 获取爬虫状态 ====================
router.get('/crawler/status', async (req, res) => {
  try {
    const status = getCrawlerStatus();
    res.json({ success: true, data: status });
  } catch (err) {
    console.error('[CrawlerRoutes] /status error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ==================== 登录 ====================
router.post('/crawler/login', requireFields(['username', 'password']), validateLength({ username: { min: 1, max: 100 }, password: { min: 1, max: 100 } }), async (req, res) => {
  try {
    const { username, password, forceNew } = req.body;
    const credentials = username && password ? { username, password } : null;
    const result = await loginToHG(credentials, forceNew);
    res.json(result);
  } catch (err) {
    console.error('[CrawlerRoutes] /login error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ==================== 获取实时比赛数据 ====================
router.get('/crawler/matches', async (req, res) => {
  try {
    const result = await fetchAllLiveMatches();
    res.json(result);
  } catch (err) {
    console.error('[CrawlerRoutes] /matches error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ==================== 关闭浏览器 ====================
router.post('/crawler/close', async (req, res) => {
  try {
    const result = await closeBrowser();
    res.json(result);
  } catch (err) {
    console.error('[CrawlerRoutes] /close error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ==================== 启动轮询 ====================
router.post('/crawler/matches/poll/start', async (req, res) => {
  try {
    const result = startMatchPolling((data) => {
      console.log('[CrawlerRoutes] 轮询回调: ' + (data?.count || 0) + ' 场比赛');
    });
    res.json(result);
  } catch (err) {
    console.error('[CrawlerRoutes] /matches/poll/start error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ==================== 停止轮询 ====================
router.post('/crawler/matches/poll/stop', async (req, res) => {
  try {
    const result = stopMatchPolling();
    res.json(result);
  } catch (err) {
    console.error('[CrawlerRoutes] /matches/poll/stop error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
