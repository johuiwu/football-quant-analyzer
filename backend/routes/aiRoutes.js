import { Router } from 'express';
import { REAL_TEAMS } from '../../src/data/realTeamsData';
import { calculateBetsModel } from '../../src/utils/quantModel';
import { getPythonScriptContent } from '../../src/utils/pythonTemplate';
import { getDeepSeekClient, setDeepSeekKey, getDeepSeekKey, isDeepSeekKeyConfigured } from '../services/crawlerHelper.js';

function buildQuantitativeData(homeTeam, awayTeam, predictions, odds) {
  return {
    matchContext: {
      homeTeam: homeTeam.nameCn,
      awayTeam: awayTeam.nameCn,
      currentScore: '未开赛',
    },
    quantitativeData: {
      prediction: {
        homeWinProb: parseFloat((predictions.compHomeWin).toFixed(3)),
        drawProb: parseFloat((predictions.compDraw).toFixed(3)),
        awayWinProb: parseFloat((predictions.compAwayWin).toFixed(3)),
      },
      expectedGoals: {
        home: parseFloat(predictions.expectedHomeGoals.toFixed(2)),
        away: parseFloat(predictions.expectedAwayGoals.toFixed(2)),
      },
      tacticalProfile: {
        homeXG: Math.max(0, predictions.homeXgDiff) + (predictions.xgStrengthDiff > 0 ? predictions.xgStrengthDiff / 2 : 0),
        homeXGA: Math.max(0, -predictions.homeXgDiff) + (predictions.xgStrengthDiff > 0 ? 0 : Math.abs(predictions.xgStrengthDiff) / 2),
        awayXG: Math.max(0, predictions.awayXgDiff),
        awayXGA: Math.max(0, -predictions.awayXgDiff),
      },
      cornerData: {
        homeAvg: parseFloat((predictions.expectedHomeCorners || 5.5).toFixed(1)),
        awayAvg: parseFloat((predictions.expectedAwayCorners || 4.5).toFixed(1)),
      },
      handicapData: {
        currentHandicap: predictions.impliedHandicap || '-0.5',
        odds: parseFloat((odds?.home || 1.95).toFixed(2)),
      },
      attackDefense: {
        homeAttackIndex: parseFloat(predictions.homeAttackIndex.toFixed(2)),
        homeDefenseIndex: parseFloat(predictions.homeDefenseIndex.toFixed(2)),
        awayAttackIndex: parseFloat(predictions.awayAttackIndex.toFixed(2)),
        awayDefenseIndex: parseFloat(predictions.awayDefenseIndex.toFixed(2)),
      },
      formScores: {
        homeFormScore: Math.round(predictions.homeFormScore),
        awayFormScore: Math.round(predictions.awayFormScore),
      },
      h2hAdvantage: {
        homeAdvRate: parseFloat((predictions.h2hHomeAdv * 100).toFixed(1)),
        playedCount: predictions.h2hPlayedCount,
      },
      marketHeat: {
        heatIndexHome: parseFloat((predictions.heatIndexHome || 0).toFixed(2)),
        heatIndexAway: parseFloat((predictions.heatIndexAway || 0).toFixed(2)),
        upsetLevel: predictions.upsetLevel || 'NORMAL',
        zScoreHome: parseFloat((predictions.zScoreHome || 0).toFixed(2)),
        zScoreAway: parseFloat((predictions.zScoreAway || 0).toFixed(2)),
      },
      kellyCriteria: {
        kellyHome: parseFloat((predictions.kellyHome || 0).toFixed(3)),
        kellyDraw: parseFloat((predictions.kellyDraw || 0).toFixed(3)),
        kellyAway: parseFloat((predictions.kellyAway || 0).toFixed(3)),
      },
      fusedProbabilities: {
        fusedHomeProb: parseFloat((predictions.fusedHomeProb || predictions.compHomeWin).toFixed(3)),
        fusedDrawProb: parseFloat((predictions.fusedDrawProb || predictions.compDraw).toFixed(3)),
        fusedAwayProb: parseFloat((predictions.fusedAwayProb || predictions.compAwayWin).toFixed(3)),
        marketConfidence: predictions.marketConfidence || 'medium',
      },
    }
  };
}

// ======================== 离线降级模板库 ========================
const FALLBACK_TEMPLATES = [
  {
    id: 'dominant_home',
    condition: (pred) => pred.compHomeWin > 0.6,
    result: {
      tacticalSummary: '主队在攻防两端均展现出显著优势。从 xG 数据看，主队预期进球能力明显强于客队，且防守端失球预期较低。历史交锋中主队占据主动权，客队若想拿分需依托反击和定位球机会。建议关注主队中场控制力与客队防线抗压能力之间的博弈。',
      goalAnalysis: '结合预期进球数据，本场比赛总进球预期处于中等偏高水平。主队进攻效率较高，但需警惕领先后可能出现的节奏控制导致进球数收窄。大小球方面需关注比赛进程中的战术调整。',
      riskAlert: { level: 'MEDIUM', confidence: 0.65, summary: '主胜概率较高但盘口深度需关注，存在领后松懈风险', keyRisks: ['盘口过深可能导致赢盘困难', '领后战术保守', '意外丢球打乱节奏'] }
    }
  },
  {
    id: 'balanced_match',
    condition: (pred) => pred.compHomeWin >= 0.35 && pred.compHomeWin <= 0.6 && pred.compDraw >= 0.2,
    result: {
      tacticalSummary: '双方实力接近，比赛预计呈现拉锯态势。攻防指数对比显示两队各有优劣：一方在组织进攻上更具威胁，另一方则在防守纪律性上表现更佳。中场争夺将成为比赛关键区域，谁能控制节奏将直接影响最终结果。',
      goalAnalysis: '预期总进球数处于临界值附近，比赛走向对大小球判断至关重要。若双方开放打法则大球概率上升；若均采取稳健策略则小球可能性更大。建议观察前15分钟的比赛节奏后再做判断。',
      riskAlert: { level: 'MEDIUM', confidence: 0.55, summary: '实力接近的比赛变数较多，平局不可忽视', keyRisks: ['平局概率被低估', '双方互交白卷', '关键时刻个人失误'] }
    }
  },
  {
    id: 'away_threat',
    condition: (pred) => pred.compAwayWin > 0.3,
    result: {
      tacticalSummary: '客队具备相当的竞争力，不容小觑。数据显示客队在客场同样保持了一定的进攻输出能力，而主队防线存在可被利用的空间。客队的快速转换进攻可能对主队防线造成持续压力，尤其要注意边路传中和定位球防守。',
      goalAnalysis: '预期进球数据暗示本场比赛可能有较多进球。客队的客场进攻能力加上主队的主场进攻需求，使得双方都有取得进球的可能。大球方向值得关注，但需防范其中一方提前锁定比分后节奏变化。',
      riskAlert: { level: 'HIGH', confidence: 0.5, summary: '客队爆冷可能性存在，主队不可轻敌', keyRisks: ['客队反击效率高', '主队后防隐患', '客场作战的针对性部署'] }
    }
  },
  {
    id: 'default',
    condition: () => true,
    result: {
      tacticalSummary: '基于量化模型数据分析，本场比赛的关键在于双方攻防效率的对比。主队凭借主场优势在进攻端有一定加成，但客队的防守组织能力同样不容忽视。比赛中段（45-60分钟）的体能瓶颈期可能是打破僵局的关键时间窗口。',
      goalAnalysis: '根据 Poisson 进球模型计算，本场预期总进球处于标准区间。需结合实时赔率变动和场上形势综合判断大小球方向。若上半场已有进球出现，下半场的进球概率将显著提升。',
      riskAlert: { level: 'MEDIUM', confidence: 0.6, summary: '模型预测存在不确定性，请结合实时数据动态评估', keyRisks: ['数据样本偏差', '非技术因素影响（天气/裁判/士气）', '临阵伤病信息缺失'] }
    }
  }
];

function getFallbackTemplate(predictions) {
  for (const template of FALLBACK_TEMPLATES) {
    if (template.condition(predictions)) {
      return template.result;
    }
  }
  return FALLBACK_TEMPLATES[FALLBACK_TEMPLATES.length - 1].result;
}

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
        success: true,
        result: {
          tacticalSummary: '[AI Analysis Notice] DeepSeek API Key 未配置。\n请在设置页面输入您的 DeepSeek API Key。',
          goalAnalysis: '',
          riskAlert: { level: 'HIGH', confidence: 0, summary: 'API Key 未配置，无法进行量化分析', keyRisks: ['缺少 API 密钥'] }
        },
        isFallback: true,
      });
    }

    const systemInstruction = `你是一名资深的足球量化分析师，擅长结合数据模型与比赛逻辑进行深度推演。

## 角色
你拥有丰富的足球数据分析经验，能够从多维度量化指标中提炼战术洞察，对比赛走势做出基于数据的预判。

## 任务
请根据提供的结构化量化数据，完成以下 4 项分析任务：
1. **战术克制分析**：根据双方的 xG（预期进球）、xGA（预期失球）差异，分析进攻和防守的强弱对比与克制关系。
2. **大小球深度原因**：结合预期进球总数和当前比分，判断比赛是否存在"刷数据"或"收着踢"的可能。
3. **胜负手判断**：指出后续比赛中最可能改变局势的关键事件（如换人调整、红牌、定位球等）。
4. **风险预警**：对当前的模型预测概率给出置信度评估（0-1），并指出潜在风险点。

## 输出要求
必须严格输出为 JSON 格式，包含以下三个字段：
{
  "tacticalSummary": "战术克制与强弱对比的深度分析文字（200-400字，引用具体数值）",
  "goalAnalysis": "大小球深度原因分析文字（150-250字，结合预期进球和比分判断）",
  "riskAlert": {
    "level": "LOW|MEDIUM|HIGH",
    "confidence": 0.00~1.00之间的数值,
    "summary": "风险预警摘要（50-100字）",
    "keyRisks": ["具体风险点1", "具体风险点2"]
  }
}

注意：所有分析必须引用数据中的具体数值，禁止空泛描述。`;

    const quantData = buildQuantitativeData(homeTeam, awayTeam, predictions, odds);
    const prompt = JSON.stringify(quantData, null, 2);

    const response = await ai.chat.completions.create({
      model: 'deepseek-chat',
      messages: [
        { role: 'system', content: systemInstruction },
        { role: 'user', content: prompt }
      ],
      temperature: 0.7,
      max_tokens: 2048,
      response_format: { type: "json_object" },
    });

    let rawContent = response.choices[0].message.content;
    let parsedResult;

    // 尝试提取 JSON（处理可能的 markdown 代码块包裹）
    const jsonMatch = rawContent.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try {
        parsedResult = JSON.parse(jsonMatch[0]);
      } catch (e) {
        // JSON 解析失败，fallback 到原始文本
        parsedResult = {
          tacticalSummary: rawContent,
          goalAnalysis: '',
          riskAlert: { level: 'MEDIUM', confidence: 0.5, summary: '无法解析结构化风险数据', keyRisks: [] }
        };
      }
    } else {
      parsedResult = {
        tacticalSummary: rawContent,
        goalAnalysis: '',
        riskAlert: { level: 'MEDIUM', confidence: 0.5, summary: '无法解析结构化风险数据', keyRisks: [] }
      };
    }

    res.json({
      success: true,
      result: parsedResult,
      isFallback: false,
    });

  } catch (err) {
    console.error('AI analyze error:', err);
    // 错误降级：使用离线模板
    const fallbackResult = getFallbackTemplate(predictions || {});
    fallbackResult.tacticalSummary = '[离线模式] ' + fallbackResult.tacticalSummary + '\n\n⚠️ AI 分析暂时不可用，正在加载离线模板。请检查网络连接或 API Key 配置。';
    res.json({
      success: true,
      result: fallbackResult,
      isFallback: true,
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
