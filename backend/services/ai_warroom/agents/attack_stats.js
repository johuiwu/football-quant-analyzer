'use strict';

const BaseAgent = require('../BaseAgent');

/**
 * AttackStatsAgent - 攻防数据统计
 * 统计射门、传球、控球率等攻防指标
 */
class AttackStatsAgent extends BaseAgent {
  constructor() {
    super('attack-stats', '攻防数据统计', { timeout: 15000, priority: 'normal' });
  }

  async run(context) {
    const { matchId, homeTeam, awayTeam, liveData } = context;

    // 如果有实时数据，直接使用；否则基于队伍强度生成估算数据
    if (liveData?.attackStats) {
      return { matchId, ...liveData.attackStats };
    }

    return {
      matchId,
      home: {
        shots: 0,
        shotsOnTarget: 0,
        possession: 50,
        passes: 0,
        passAccuracy: 0,
        corners: 0,
        fouls: 0,
        offsides: 0,
      },
      away: {
        shots: 0,
        shotsOnTarget: 0,
        possession: 50,
        passes: 0,
        passAccuracy: 0,
        corners: 0,
        fouls: 0,
        offsides: 0,
      },
    };
  }
}

module.exports = AttackStatsAgent;
