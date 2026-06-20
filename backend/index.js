import express from 'express';
import cors from 'cors';
import { createRequire } from 'module';
import apiRoutes from './routes/index.js';

const require = createRequire(import.meta.url);
const knex = require('knex');
const knexConfig = require('../knexfile.cjs');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '1mb', parameterLimit: 10000 }));

app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
  next();
});

app.get('/api', (req, res) => {
  res.json({
    success: true,
    message: 'World Cup Data Analysis API',
    version: '1.0.0',
    endpoints: {
      teams: {
        'GET /api/teams': 'Get all teams',
        'GET /api/teams/:id': 'Get team by ID with players',
        'GET /api/teams/:id/stats': 'Get team statistics',
        'GET /api/teams/:id/strength': 'Get team strength vector',
        'GET /api/teams/strength/all': 'Get all team strength vectors sorted by overall',
        'GET /api/teams/:id/strength/recompute': 'Recompute and get team strength vector'
      },
      players: {
        'GET /api/players': 'Get all players (paginated)',
        'GET /api/players/:id': 'Get player by ID',
        'GET /api/players/team/:teamId': 'Get players by team'
      },
      matches: {
        'GET /api/matches': 'Get all matches (supports ?year=YYYY)',
        'GET /api/matches/:id': 'Get match by ID',
        'GET /api/matches/team/:teamId': 'Get matches by team'
      },
      fixtures: {
        'GET /api/sync-fixtures': 'Get preset fixture data (local data source)',
        'GET /api/qiumiwu-fixtures': 'Crawl live football fixtures from qiumiwu.com'
      },
      features: {
        'GET /api/features/teams': 'Get feature vectors for all teams',
        'GET /api/features/teams/:teamId': 'Get feature vector for specific team',
        'GET /api/features/stats': 'Get feature statistics',
        'GET /api/features/compare/:team1Id/:team2Id': 'Compare two teams',
        'GET /api/features/cache/stats': 'Get cache stats',
        'POST /api/features/cache/clear': 'Clear feature cache'
      },
      strength: {
        'POST /api/teams/strength/compute-all': 'Compute and save all team strength vectors'
      },
      predict: {
        'POST /api/predict/poisson': 'Predict match using Poisson model',
        'POST /api/predict/simulate': 'Simulate match outcomes',
        'GET /api/predict/parameters': 'Get model parameters',
        'POST /api/predict/train': 'Train Poisson model on historical data'
      },
      ai: {
        'POST /api/ai-team-profile': 'Get AI tactical analysis for a team',
        'POST /api/match-analyze': 'Quantitative match analysis',
        'POST /api/ai-analyze-match': 'AI-powered match commentary',
        'POST /api/deepseek/set-key': 'Set DeepSeek API Key',
        'GET /api/deepseek/key-status': 'Check DeepSeek API Key status'
      }
    }
  });
});

app.use('/api', apiRoutes);

// 根路由 — 重定向到 API 文档
app.get('/', (req, res) => {
  res.json({ success: true, message: 'Server is running', docs: '/api' });
  return;
});


app.use((req, res) => {
  res.status(404).json({ error: true, message: 'Endpoint not found' });
});

app.use((err, req, res, next) => {
  if (err.type === 'request.aborted' || err.code === 'ECONNABORTED') {
    console.warn(`[warn] 请求被中止: ${req.method} ${req.url}`);
    return;
  }
  if (err.status && err.status >= 400 && err.status < 500) {
    console.warn(`[warn] ${err.status} ${err.message} — ${req.method} ${req.url}`);
    res.status(err.status).json({ error: true, message: err.message });
    return;
  }
  console.error('Unhandled error:', err);
  res.status(500).json({ error: true, message: 'Internal server error' });
});

async function startServer() {
  // 执行数据库迁移
  try {
    const db = knex(knexConfig.development);
    await db.migrate.latest();
    console.log('[migration] 数据库迁移执行完成');
    await db.destroy();
  } catch (err) {
    console.warn('[migration] 数据库迁移失败（非致命）:', err.message);
  }

  app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
    console.log(`API documentation: http://localhost:${PORT}/api`);
  });
}

startServer();

export default app;