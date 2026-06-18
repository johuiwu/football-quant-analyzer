'use strict';

const BaseAgent = require('../BaseAgent');

/**
 * MatchTrackerAgent - 赛事进程追踪
 * 追踪比赛时间、阶段（上半场/下半场/加时/点球）、关键事件
 */
class MatchTrackerAgent extends BaseAgent {
  constructor() {
    super('match-tracker', '赛事进程追踪', { timeout: 15000, priority: 'high' });
  }

  async run(context) {
    const { matchId, homeTeam, awayTeam, liveData } = context;

    // 如果有实时数据，直接使用；否则返回默认占位
    const elapsed = liveData?.elapsedMinutes || 0;
    const phase = this._determinePhase(elapsed);
    const events = liveData?.events || this._generatePlaceholderEvents(homeTeam, awayTeam, elapsed);

    return {
      matchId,
      elapsedMinutes: elapsed,
      phase,
      events,
    };
  }

  _determinePhase(elapsed) {
    if (elapsed <= 0) return 'pre-match';
    if (elapsed <= 45) return 'first-half';
    if (elapsed <= 47) return 'halftime';
    if (elapsed <= 90) return 'second-half';
    if (elapsed <= 105) return 'extra-first';
    if (elapsed <= 120) return 'extra-second';
    return 'penalties';
  }

  _generatePlaceholderEvents(homeTeam, awayTeam, elapsed) {
    const events = [];
    if (elapsed > 0) {
      events.push({ minute: 1, type: 'kickoff', team: 'neutral', description: '比赛开始' });
    }
    if (elapsed > 45) {
      events.push({ minute: 45, type: 'halftime', team: 'neutral', description: '上半场结束' });
    }
    return events;
  }
}

module.exports = MatchTrackerAgent;
