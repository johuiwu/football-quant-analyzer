'use strict';

const BaseAgent = require('../BaseAgent');

/**
 * ShotProbabilityAgent - 射门概率计算
 * 基于攻防数据计算 xG（期望进球值）
 */
class ShotProbabilityAgent extends BaseAgent {
  constructor() {
    super('shot-probability', '射门概率计算', { timeout: 20000, priority: 'normal' });
  }

  async run(context) {
    const { matchId, homeTeam, awayTeam, attackStats } = context;

    // 基于攻防数据计算 xG
    const homeShots = attackStats?.home?.shotsOnTarget || 0;
    const awayShots = attackStats?.away?.shotsOnTarget || 0;

    // 简化 xG 模型：每次射正 ≈ 0.3 xG
    const homeXG = Math.round(homeShots * 0.3 * 100) / 100;
    const awayXG = Math.round(awayShots * 0.3 * 100) / 100;

    return {
      matchId,
      homeXG,
      awayXG,
      totalXG: Math.round((homeXG + awayXG) * 100) / 100,
      shotMap: [],
    };
  }
}

module.exports = ShotProbabilityAgent;
