'use strict';

const express = require('express');
const router = express.Router();
const { createMasterAgent, ResultIntegrator } = require('../services/ai_warroom');
const MockDataGenerator = require('../services/ai_warroom/MockDataGenerator');
const db = require('../dbService');

let taskCounter = 0;

/**
 * GET /api/ai-warroom/agents
 * 返回所有 Agent 状态
 */
router.get('/agents', (req, res) => {
  try {
    const master = createMasterAgent();
    const agents = master.getAgentStatuses();
    res.json({ success: true, data: agents });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/ai-warroom/predict
 * 触发一次完整预测任务
 */
router.post('/predict', async (req, res) => {
  try {
    const { homeTeam, awayTeam, matchId } = req.body;
    if (!homeTeam || !awayTeam) {
      return res.status(400).json({ success: false, error: 'homeTeam and awayTeam are required' });
    }

    const taskId = `task_${Date.now()}_${++taskCounter}`;

    // 立即返回 taskId
    res.json({ success: true, data: { taskId } });

    // 后台执行 Agent 调度
    setImmediate(async () => {
      try {
        // 生成模拟数据作为上下文
        const mockData = MockDataGenerator.generateFullMatch();

        const context = {
          matchId: matchId || taskId,
          homeTeam,
          awayTeam,
          liveData: {
            elapsedMinutes: 45,
            events: mockData.events,
            attackStats: mockData.attackStats,
          },
          attackStats: mockData.attackStats,
          historyData: {
            totalMatches: randInt(10, 50),
            homeWins: randInt(5, 20),
            draws: randInt(3, 10),
            awayWins: randInt(2, 15),
            avgHomeGoals: +(rand(0.8, 2.5).toFixed(2)),
            avgAwayGoals: +(rand(0.5, 2.0).toFixed(2)),
            recentMatches: [],
          },
        };

        const master = createMasterAgent();
        const results = await master.dispatchAll(context);
        const integrator = new ResultIntegrator();
        const prediction = integrator.integrate(results);

        // 补充胜率曲线
        prediction.win_rate_curve = mockData.winRateCurve;

        // 收集 Agent 日志
        const agentLogs = [];
        for (const [agentId, agentResult] of results) {
          agentLogs.push({
            agentId,
            status: agentResult.status,
            result: agentResult.result,
            error: agentResult.error,
            duration: agentResult.duration,
          });
        }

        // 保存到数据库
        await db.savePredictionTask({
          taskId,
          matchId: matchId || taskId,
          homeTeam,
          awayTeam,
          status: 'completed',
          result: prediction,
          tacticalData: {
            playerPositions: mockData.playerPositions,
            passRoutes: mockData.passRoutes,
            heatMap: mockData.heatMap,
          },
          agentLogs,
        });
      } catch (error) {
        console.error('[AI WarRoom] Prediction task failed:', error.message);
        // 保存失败状态到数据库
        try {
          await db.savePredictionTask({
            taskId,
            matchId: matchId || taskId,
            homeTeam,
            awayTeam,
            status: 'failed',
            result: null,
            tacticalData: null,
            agentLogs: [],
          });
        } catch (dbErr) {
          console.error('[AI WarRoom] Failed to save error state:', dbErr.message);
        }
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/ai-warroom/task/:taskId
 * 获取任务结果
 */
router.get('/task/:taskId', async (req, res) => {
  try {
    const { taskId } = req.params;
    const task = await db.getTaskResult(taskId);

    if (!task) {
      return res.status(404).json({ success: false, error: 'Task not found' });
    }

    res.json({ success: true, data: task });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/ai-warroom/history
 * 查询历史预测记录
 */
router.get('/history', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const offset = (page - 1) * limit;

    const { records, total } = await db.getPredictionHistory(limit, offset);

    res.json({
      success: true,
      data: { records, total, page, limit },
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function rand(min, max) {
  return Math.random() * (max - min) + min;
}

module.exports = router;
