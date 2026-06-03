import { Router } from 'express';
import { REAL_TEAMS } from '../../src/data/realTeamsData';
import { calculateBetsModel } from '../../src/utils/quantModel';
import { getPythonScriptContent } from '../../src/utils/pythonTemplate';
import { getDeepSeekClient, setDeepSeekKey, getDeepSeekKey, isDeepSeekKeyConfigured } from '../services/crawlerHelper.js';

const router = Router();

// ======================== DeepSeek API Key 管理 ========================

// 设置 DeepSeek API Key
router.post('/deepseek/set-key', (req, res) => {
  const { apiKey } = req.body;
  try {
    setDeepSeekKey(apiKey || '');
    res.json({ success: true, message: 'DeepSeek API Key 已更新' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// 查询 DeepSeek API Key 状态
router.get('/deepseek/key-status', (req, res) => {
  const key = getDeepSeekKey();
  res.json({
    configured: key !== null,
    hasKey: key !== null
  });
});

// ======================== POST /ai-team-profile ========================
router.post('/ai-team-profile', async (req, res) => {
  try {
    const { teamId } = req.body;
    const team = REAL_TEAMS.find((t) => t.id === teamId);
    if (!team) {
      return res.status(404).json({
        success: false,
        error: 'Sorry, requested team does not exist in dataset.'
      });
    }

    let ai;
    try {
      ai = getDeepSeekClient();
    } catch (apiErr) {
      return res.json({
        success: false,
        profile: '[AI Analysis Notice] API key not configured.\n\n请在设置页面输入您的 DeepSeek API Key 以启用 AI 战术分析功能。'
      });
    }

    const systemInstruction = 'You are a Chief Tactical Analyst at a top football club, expert in analyzing team tactics (e.g., Guardiola, Ancelotti styles) and deducing tactical styles and weaknesses from high-dimensional statistics. Please output in professional, concise Chinese.';

    const prompt =
      'Please generate a deep tactical profile and review report for team ' + team.nameCn + ' (' + team.name + ') based on the following real high-dimensional sports statistics:\n' +
      '- League Rank: No. ' + team.rank + '\n' +
      '- Home Record: ' + team.homeStats.played + ' games ' + team.homeStats.wins + 'W ' + team.homeStats.draws + 'D ' + team.homeStats.losses + 'L | Goals ' + team.homeStats.goalsFor + ' Conceded ' + team.homeStats.goalsAgainst + ' (xG For ' + team.homeStats.xgFor + ' / xG Against ' + team.homeStats.xgAgainst + ')\n' +
      '- Away Record: ' + team.awayStats.played + ' games ' + team.awayStats.wins + 'W ' + team.awayStats.draws + 'D ' + team.awayStats.losses + 'L | Goals ' + team.awayStats.goalsFor + ' Conceded ' + team.awayStats.goalsAgainst + ' (xG For ' + team.awayStats.xgFor + ' / xG Against ' + team.awayStats.xgAgainst + ')\n' +
      '- Recent 5 Form: ' + team.form.join(' -> ') + '\n' +
      '- Clean Sheets: ' + team.cleanSheets + ' games\n' +
      '- Avg Shots/Game: ' + team.shotsPerGame + ' (Accuracy: ' + team.shotAccuracy + '%)\n\n' +
      'Requirements:\n' +
      '1. [Core Tactical Characteristics]: Analyze home/away style differences, shot conversion efficiency, defensive philosophy reflected by clean sheet rate.\n' +
      '2. [Tactical Blind Spots]: Identify potential fatal flaws in defense or attack, highlight key cold-bet risk points for bettors. Output should be professional, concise and profound.';

    const response = await ai.chat.completions.create({
      model: 'deepseek-chat',
      messages: [
        { role: 'system', content: systemInstruction },
        { role: 'user', content: prompt }
      ],
      temperature: 0.8,
      max_tokens: 2048,
    });

    res.json({
      success: true,
      profile: response.choices[0].message.content
    });

  } catch (err) {
    console.error('AI profile error:', err);
    res.status(500).json({
      success: false,
      error: err.message || 'An error occurred during DeepSeek profile analysis.'
    });
  }
});

// ======================== POST /match-analyze ========================
router.post('/match-analyze', (req, res) => {
  try {
    const { homeId, awayId, odds, goalsLine, customWeights } = req.body;

    const homeTeam = REAL_TEAMS.find((t) => t.id === homeId);
    const awayTeam = REAL_TEAMS.find((t) => t.id === awayId);

    if (!homeTeam || !awayTeam) {
      return res.status(404).json({
        success: false,
        error: 'Home or Away team not found in the dataset matrix.'
      });
    }

    const defaultOdds = odds || { home: 1.95, draw: 3.40, away: 3.80 };
    const predictions = calculateBetsModel(homeTeam, awayTeam, defaultOdds, goalsLine || 2.5, customWeights);

    res.json({
      success: true,
      homeTeam,
      awayTeam,
      predictions
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: err.message || 'Internal quantitative calculation error.'
    });
  }
});

// ======================== POST /ai-analyze-match ========================
router.post('/ai-analyze-match', async (req, res) => {
  try {
    const { homeId, awayId, odds, predictions } = req.body;

    const homeTeam = REAL_TEAMS.find((t) => t.id === homeId);
    const awayTeam = REAL_TEAMS.find((t) => t.id === awayId);

    if (!homeTeam || !awayTeam) {
      return res.status(404).json({
        success: false,
        error: 'Home or Away team not found in the dataset.'
      });
    }

    let ai;
    try {
      ai = getDeepSeekClient();
    } catch (apiErr) {
      return res.json({
        success: false,
        commentary: '[AI Analysis Notice] DeepSeek API Key 未配置。\n' +
          '请在设置页面输入您的 DeepSeek API Key。\n' +
          '配置完成后，此模块将自动激活 DeepSeek AI 分析和多维度冷门风险解读。'
      });
    }

    const systemInstruction =
      'You are an expert in odds calculation, team tactics across leagues, and home/away momentum analysis. ' +
      'Analyze matchup data, comprehensive quantitative odds probabilities, Poisson goal models, H2H records and form indicators. ' +
      'Provide deep analysis of key matchups, attack/defense breakthroughs, Asian/European odds movement, and issue cold-bet warnings with scientific risk control. ' +
      'Output style: deeply professional, logically rigorous, no fluff, in professional Chinese. 400-650 characters.';

    const prompt =
      'Match: Home Team ' + homeTeam.nameCn + ' (Rank ' + homeTeam.rank + ') VS Away Team ' + awayTeam.nameCn + ' (Rank ' + awayTeam.rank + ')\n' +
      'Initial Odds: Home ' + odds.home + ' | Draw ' + odds.draw + ' | Away ' + odds.away + '\n' +
      'Core Quantitative Analysis:\n' +
      '- Model Prediction Probabilities: Home Win ' + (predictions.compHomeWin * 100).toFixed(1) + '% | Draw ' + (predictions.compDraw * 100).toFixed(1) + '% | Away Win ' + (predictions.compAwayWin * 100).toFixed(1) + '%\n' +
      '- Attack/Defense Indices: Home Attack ' + predictions.homeAttackIndex.toFixed(2) + ' / Defense ' + predictions.homeDefenseIndex.toFixed(2) + ' | Away Attack ' + predictions.awayAttackIndex.toFixed(2) + ' / Defense ' + predictions.awayDefenseIndex.toFixed(2) + '\n' +
      '- Poisson Expected Goals: Home ' + predictions.expectedHomeGoals.toFixed(1) + ' | Away ' + predictions.expectedAwayGoals.toFixed(1) + '\n' +
      '- Recent Form Score: Home ' + predictions.homeFormScore.toFixed(0) + ' pts | Away ' + predictions.awayFormScore.toFixed(0) + ' pts\n' +
      '- H2H Home Advantage Rate: ' + (predictions.h2hHomeAdv * 100).toFixed(0) + '% (History matches: ' + (predictions.h2hPlayedCount === 0 ? 'simulated' : predictions.h2hPlayedCount) + ')\n' +
      '- xG Strength Difference: ' + predictions.xgStrengthDiff.toFixed(2) + ' goals\n' +
      '- Recommended Direction: [' + predictions.recommendedDirection + ']\n\n' +
      'Based on this quantitative foundation, please provide detailed football tactical commentary, odds movement analysis, and cold-bet defense warnings.';

    const response = await ai.chat.completions.create({
      model: 'deepseek-chat',
      messages: [
        { role: 'system', content: systemInstruction },
        { role: 'user', content: prompt }
      ],
      temperature: 0.85,
      max_tokens: 1500,
    });

    res.json({
      success: true,
      commentary: response.choices[0].message.content
    });

  } catch (err) {
    console.error('AI analyze error:', err);
    res.status(500).json({
      success: false,
      error: err.message || 'An error occurred during DeepSeek processing.'
    });
  }
});

// ======================== POST /export-python ========================
router.post('/export-python', (req, res) => {
  try {
    const { weights } = req.body;

    // Validate weights parameter
    if (!weights || typeof weights !== 'object') {
      return res.status(400).json({
        success: false,
        error: 'Missing or invalid weights parameter. Expected an object with odds, strength, homeAway, h2h, form fields.'
      });
    }

    const requiredFields = ['odds', 'strength', 'homeAway', 'h2h', 'form'];
    const missingFields = requiredFields.filter(f => typeof weights[f] !== 'number' || isNaN(weights[f]));
    if (missingFields.length > 0) {
      return res.status(400).json({
        success: false,
        error: `Invalid weight values for: ${missingFields.join(', ')}. All must be numbers.`
      });
    }

    // Clamp weights to valid range [0, 1]
    const safeWeights = {};
    for (const f of requiredFields) {
      safeWeights[f] = Math.max(0, Math.min(1, Number(weights[f])));
    }

    const pythonScript = getPythonScriptContent(safeWeights);
    res.setHeader('Content-Disposition', 'attachment; filename=football_quant_analyzer.py');
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.send(pythonScript);
  } catch (err) {
    console.error('[export-python] Error:', err);
    res.status(500).json({ success: false, error: err.message || 'Internal server error generating Python script' });
  }
});


export default router;
