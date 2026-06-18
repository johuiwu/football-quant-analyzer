'use strict';

const BaseAgent = require('../BaseAgent');

/**
 * HistoryMatchAgent - 历史交锋分析
 * 查询历史交锋记录，统计近 10 场数据
 */
class HistoryMatchAgent extends BaseAgent {
  constructor() {
    super('history-match', '历史交锋分析', { timeout: 20000, priority: 'normal' });
  }

  async run(context) {
    const { matchId, homeTeam, awayTeam, historyData } = context;

    // 如果有历史数据，直接使用；否则返回空结构
    if (historyData) {
      return { matchId, ...historyData };
    }

    return {
      matchId,
      totalMatches: 0,
      homeWins: 0,
      draws: 0,
      awayWins: 0,
      avgHomeGoals: 0,
      avgAwayGoals: 0,
      recentMatches: [],
    };
  }
}

module.exports = HistoryMatchAgent;
