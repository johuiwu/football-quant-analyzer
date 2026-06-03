import express from 'express';
import cors from 'cors';
import teamRoutes from './routes/teamRoutes.js';
import teamStatsRoutes from './routes/teamStatsRoutes.js';
import playerRoutes from './routes/playerRoutes.js';
import matchRoutes from './routes/matchRoutes.js';
import featureRoutes from './routes/featureRoutes.js';
import strengthRoutes from './routes/strength.js';
import predictRoutes from './routes/predict.js';
import fixtureRoutes from './routes/fixtureRoutes.js';
import aiRoutes from './routes/aiRoutes.js';
import cornerRoutes from './routes/cornerRoutes.js';
import crawlerRoutes from './routes/crawlerRoutes.js';

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

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
        'GET /api/sync-fixtures': 'Get preset fixture data (local data source)'
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

app.use('/api/teams', teamRoutes);
app.use('/api/team-stats', teamStatsRoutes);
app.use('/api/players', playerRoutes);
app.use('/api/matches', matchRoutes);
app.use('/api/features', featureRoutes);
app.use('/api', strengthRoutes);
app.use('/api', predictRoutes);
app.use('/api', fixtureRoutes);
app.use('/api', aiRoutes);
app.use('/api', cornerRoutes);
app.use('/api', crawlerRoutes);

// 根路由 — 重定向到 API 文档
app.get('/', (req, res) => {
  res.json({ success: true, message: 'Server is running', docs: '/api' });
  return;
});


app.use((req, res) => {
  res.status(404).json({ error: true, message: 'Endpoint not found' });
});

app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: true, message: 'Internal server error' });
});

app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
  console.log(`API documentation: http://localhost:${PORT}/api`);
});

export default app;
