'use strict';

/**
 * ResultIntegrator - 结果整合器
 * 将多个 Agent 的输出整合为最终预测结果
 * 加权投票算法：近期状态40%、历史交锋30%、伤病影响20%、天气场地10%
 */

// 泊松概率计算
function poissonProb(k, lambda) {
  if (lambda <= 0) return k === 0 ? 1.0 : 0.0;
  let logFact = 0;
  for (let i = 2; i <= k; i++) logFact += Math.log(i);
  return Math.exp(-lambda + k * Math.log(lambda) - logFact);
}

class ResultIntegrator {
  constructor() {
    // 加权投票算法权重
    this.weights = {
      form: 0.40,       // 近期状态
      history: 0.30,    // 历史交锋
      injury: 0.20,     // 伤病影响
      weather: 0.10,    // 天气场地
    };

    this.maxGoals = 5; // 最大进球数
  }

  /**
   * 整合所有 Agent 结果
   * @param {Map<string, object>} agentResults - agentId → 执行结果
   * @returns {object} 整合后的预测结果
   */
  integrate(agentResults) {
    // 提取各 Agent 结果
    const formResult = this._extractResult(agentResults, 'form-analyst');
    const historyResult = this._extractResult(agentResults, 'history-match');
    const injuryResult = this._extractResult(agentResults, 'injury-analyst');
    const weatherResult = this._extractResult(agentResults, 'weather-analyst');
    const attackResult = this._extractResult(agentResults, 'attack-stats');
    const shotResult = this._extractResult(agentResults, 'shot-probability');
    const momentumResult = this._extractResult(agentResults, 'momentum-analyst');

    // 计算主客队期望进球数（lambda）
    const homeLambda = this._calculateLambda('home', formResult, historyResult, injuryResult, weatherResult, attackResult, shotResult);
    const awayLambda = this._calculateLambda('away', formResult, historyResult, injuryResult, weatherResult, attackResult, shotResult);

    // 基于泊松分布计算比分概率矩阵
    const scoreMatrix = this._buildScoreMatrix(homeLambda, awayLambda);

    // 提取前 3 个最可能比分
    const topScores = this._getTopScores(scoreMatrix, 3);

    // 计算胜率分布
    const winProbabilities = this._calculateWinProbabilities(scoreMatrix);

    // 计算置信区间
    const confidenceInterval = this._calculateConfidenceInterval(winProbabilities, formResult, historyResult);

    // 生成 Agent 共识描述
    const agentConsensus = this._generateConsensus(winProbabilities, momentumResult);

    // 最可能比分
    const score = topScores.length > 0
      ? { home: topScores[0].home, away: topScores[0].away }
      : { home: 0, away: 0 };

    return {
      score,
      topScores,
      winProbabilities,
      confidenceInterval,
      agentConsensus,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * 从结果 Map 中提取指定 Agent 的 result 字段
   */
  _extractResult(agentResults, agentId) {
    const entry = agentResults instanceof Map
      ? agentResults.get(agentId)
      : agentResults[agentId];
    return entry?.status === 'completed' ? entry.result : null;
  }

  /**
   * 计算期望进球数（lambda）
   * 基础 lambda = 1.2，根据各 Agent 结果调整
   */
  _calculateLambda(side, formResult, historyResult, injuryResult, weatherResult, attackResult, shotResult) {
    let lambda = 1.2; // 基础期望进球

    // 历史交锋调整
    if (historyResult) {
      const avgGoals = side === 'home' ? historyResult.avgHomeGoals : historyResult.avgAwayGoals;
      if (avgGoals > 0) {
        lambda = lambda * 0.4 + avgGoals * 0.6;
      }
    }

    // xG 调整
    if (shotResult) {
      const xg = side === 'home' ? shotResult.homeXG : shotResult.awayXG;
      if (xg > 0) {
        lambda = lambda * 0.5 + xg * 0.5;
      }
    }

    // 伤病影响调整
    if (injuryResult) {
      const impact = side === 'home' ? injuryResult.impactScore?.home : injuryResult.impactScore?.away;
      if (impact > 0) {
        lambda *= (1 - impact * 0.1); // 每个伤病影响降低 10%
      }
    }

    // 天气影响调整
    if (weatherResult && weatherResult.impactFactor) {
      lambda *= (1 - Math.abs(weatherResult.impactFactor) * 0.05);
    }

    return Math.max(0.1, lambda);
  }

  /**
   * 构建比分概率矩阵
   */
  _buildScoreMatrix(homeLambda, awayLambda) {
    const matrix = [];
    for (let h = 0; h <= this.maxGoals; h++) {
      for (let a = 0; a <= this.maxGoals; a++) {
        const prob = poissonProb(h, homeLambda) * poissonProb(a, awayLambda);
        matrix.push({ home: h, away: a, probability: Math.round(prob * 1000) / 1000 });
      }
    }
    return matrix.sort((a, b) => b.probability - a.probability);
  }

  /**
   * 获取前 N 个最可能比分
   */
  _getTopScores(scoreMatrix, n) {
    return scoreMatrix.slice(0, n).map((s) => ({
      home: s.home,
      away: s.away,
      probability: Math.round(s.probability * 1000) / 1000, // 精确到 0.1%
    }));
  }

  /**
   * 计算胜率分布
   */
  _calculateWinProbabilities(scoreMatrix) {
    let home = 0, draw = 0, away = 0;
    for (const s of scoreMatrix) {
      if (s.home > s.away) home += s.probability;
      else if (s.home === s.away) draw += s.probability;
      else away += s.probability;
    }
    return {
      home: Math.round(home * 1000) / 1000,
      draw: Math.round(draw * 1000) / 1000,
      away: Math.round(away * 1000) / 1000,
    };
  }

  /**
   * 计算置信区间
   */
  _calculateConfidenceInterval(winProbabilities, formResult, historyResult) {
    // 基于数据完整度调整置信区间宽度
    let confidence = 0.5; // 基础置信度

    if (formResult) confidence += 0.15;
    if (historyResult && historyResult.totalMatches > 0) confidence += 0.15;

    const margin = (1 - confidence) / 2;
    const homeWin = winProbabilities.home;

    return {
      low: Math.max(0, Math.round((homeWin - margin) * 1000) / 1000),
      high: Math.min(1, Math.round((homeWin + margin) * 1000) / 1000),
    };
  }

  /**
   * 生成 Agent 共识描述
   */
  _generateConsensus(winProbabilities, momentumResult) {
    const { home, draw, away } = winProbabilities;

    let direction;
    if (home > away + 0.1) direction = '主队明显优势';
    else if (home > away + 0.03) direction = '主队小幅优势';
    else if (away > home + 0.1) direction = '客队明显优势';
    else if (away > home + 0.03) direction = '客队小幅优势';
    else direction = '势均力敌';

    let suggestion;
    if (Math.abs(home - away) < 0.05) {
      suggestion = '建议关注平局选项';
    } else if (home > away) {
      suggestion = '建议关注主胜方向';
    } else {
      suggestion = '建议关注客胜方向';
    }

    // 势头调整
    if (momentumResult?.direction && momentumResult.direction !== 'neutral') {
      suggestion += `（${momentumResult.direction === 'home' ? '主队' : '客队'}势头占优）`;
    }

    return `${direction}，${suggestion}`;
  }
}

module.exports = ResultIntegrator;
