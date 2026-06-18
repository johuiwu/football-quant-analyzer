'use strict';

/**
 * MockDataGenerator - 模拟数据生成器
 * 生成模拟比赛数据用于演示，即使不接入外部 API 也能完整运行
 */

// 4-3-3 阵型默认位置（x: 0-105, y: 0-68）
const HOME_FORMATION = [
  { id: 1, x: 5, y: 34 },    // GK
  { id: 2, x: 22, y: 10 },   // RB
  { id: 3, x: 20, y: 25 },   // CB
  { id: 4, x: 20, y: 43 },   // CB
  { id: 5, x: 22, y: 58 },   // LB
  { id: 6, x: 38, y: 20 },   // CM
  { id: 7, x: 36, y: 34 },   // CDM
  { id: 8, x: 38, y: 48 },   // CM
  { id: 9, x: 55, y: 12 },   // RW
  { id: 10, x: 52, y: 34 },  // ST
  { id: 11, x: 55, y: 56 },  // LW
];

const AWAY_FORMATION = [
  { id: 12, x: 100, y: 34 },
  { id: 13, x: 83, y: 58 },
  { id: 14, x: 85, y: 43 },
  { id: 15, x: 85, y: 25 },
  { id: 16, x: 83, y: 10 },
  { id: 17, x: 67, y: 48 },
  { id: 18, x: 69, y: 34 },
  { id: 19, x: 67, y: 20 },
  { id: 20, x: 50, y: 56 },
  { id: 21, x: 53, y: 34 },
  { id: 22, x: 50, y: 12 },
];

function rand(min, max) {
  return Math.random() * (max - min) + min;
}

function randInt(min, max) {
  return Math.floor(rand(min, max + 1));
}

function pick(arr) {
  return arr[randInt(0, arr.length - 1)];
}

const EVENT_TYPES = ['goal', 'shot', 'pass', 'foul', 'corner', 'yellow_card', 'red_card', 'substitution'];
const HIGH_IMPACT_EVENTS = ['goal', 'red_card'];

class MockDataGenerator {
  /**
   * 生成 22 个球员位置数据
   */
  generatePlayerPositions() {
    const positions = [];
    for (const p of HOME_FORMATION) {
      positions.push({
        id: p.id,
        x: p.x + rand(-3, 3),
        y: p.y + rand(-3, 3),
        team: 'home',
      });
    }
    for (const p of AWAY_FORMATION) {
      positions.push({
        id: p.id,
        x: p.x + rand(-3, 3),
        y: p.y + rand(-3, 3),
        team: 'away',
      });
    }
    return positions;
  }

  /**
   * 生成传球路线数据
   */
  generatePassRoutes(players) {
    if (!players || players.length === 0) players = this.generatePlayerPositions();
    const routes = [];
    const homePlayers = players.filter((p) => p.team === 'home');
    const awayPlayers = players.filter((p) => p.team === 'away');

    // 主队传球
    for (let i = 0; i < 8; i++) {
      const from = pick(homePlayers);
      const to = pick(homePlayers.filter((p) => p.id !== from.id));
      if (to) {
        routes.push({ from: from.id, to: to.id, weight: rand(0.2, 1.0) });
      }
    }

    // 客队传球
    for (let i = 0; i < 8; i++) {
      const from = pick(awayPlayers);
      const to = pick(awayPlayers.filter((p) => p.id !== from.id));
      if (to) {
        routes.push({ from: from.id, to: to.id, weight: rand(0.2, 1.0) });
      }
    }

    return routes;
  }

  /**
   * 生成热力图数据
   */
  generateHeatMap(players) {
    if (!players || players.length === 0) players = this.generatePlayerPositions();
    const points = [];
    for (const player of players) {
      // 每个球员周围生成 2-4 个热力点
      const count = randInt(2, 4);
      for (let i = 0; i < count; i++) {
        points.push({
          x: player.x + rand(-8, 8),
          y: player.y + rand(-8, 8),
          intensity: rand(0.3, 1.0),
        });
      }
    }
    return points;
  }

  /**
   * 生成比赛事件序列
   */
  generateMatchEvents() {
    const events = [];
    let minute = 0;

    // 开球
    events.push({ minute: 0, eventType: 'kickoff', team: 'neutral', description: '比赛开始' });

    // 随机生成 15-30 个事件
    const totalEvents = randInt(15, 30);
    for (let i = 0; i < totalEvents; i++) {
      minute += randInt(2, 6);
      if (minute > 90) break;

      const eventType = pick(EVENT_TYPES);
      const team = pick(['home', 'away']);
      let description = '';

      switch (eventType) {
        case 'goal':
          description = `${team === 'home' ? '主队' : '客队'}进球！`;
          break;
        case 'shot':
          description = `${team === 'home' ? '主队' : '客队'}射门`;
          break;
        case 'pass':
          description = `${team === 'home' ? '主队' : '客队'}传球`;
          break;
        case 'foul':
          description = `${team === 'home' ? '主队' : '客队'}犯规`;
          break;
        case 'corner':
          description = `${team === 'home' ? '主队' : '客队'}角球`;
          break;
        case 'yellow_card':
          description = `${team === 'home' ? '主队' : '客队'}黄牌`;
          break;
        case 'red_card':
          description = `${team === 'home' ? '主队' : '客队'}红牌！`;
          break;
        case 'substitution':
          description = `${team === 'home' ? '主队' : '客队'}换人`;
          break;
      }

      events.push({ minute, eventType, team, description });
    }

    // 半场
    if (!events.find((e) => e.minute >= 45 && e.eventType === 'halftime')) {
      events.push({ minute: 45, eventType: 'halftime', team: 'neutral', description: '上半场结束' });
    }

    // 终场
    events.push({ minute: 90, eventType: 'fulltime', team: 'neutral', description: '比赛结束' });

    return events.sort((a, b) => a.minute - b.minute);
  }

  /**
   * 生成胜率曲线数据
   */
  generateWinRateCurve() {
    const curve = [];
    let homeProb = rand(0.35, 0.55);
    let awayProb = rand(0.2, 0.4);
    let drawProb = 1 - homeProb - awayProb;

    for (let min = 0; min <= 90; min += 5) {
      // 随机波动
      homeProb += rand(-0.03, 0.03);
      awayProb += rand(-0.03, 0.03);
      drawProb = 1 - homeProb - awayProb;

      // 钳位
      homeProb = Math.max(0.05, Math.min(0.85, homeProb));
      awayProb = Math.max(0.05, Math.min(0.85, awayProb));
      drawProb = Math.max(0.05, 1 - homeProb - awayProb);

      // 归一化
      const total = homeProb + drawProb + awayProb;
      curve.push({
        minute: min,
        home: Math.round((homeProb / total) * 1000) / 1000,
        draw: Math.round((drawProb / total) * 1000) / 1000,
        away: Math.round((awayProb / total) * 1000) / 1000,
      });
    }
    return curve;
  }

  /**
   * 生成完整比赛数据
   */
  generateFullMatch() {
    const playerPositions = this.generatePlayerPositions();
    const passRoutes = this.generatePassRoutes(playerPositions);
    const heatMap = this.generateHeatMap(playerPositions);
    const events = this.generateMatchEvents();
    const winRateCurve = this.generateWinRateCurve();

    // 从事件推断比分
    const homeGoals = events.filter((e) => e.eventType === 'goal' && e.team === 'home').length;
    const awayGoals = events.filter((e) => e.eventType === 'goal' && e.team === 'away').length;

    // 攻防统计
    const homeShots = events.filter((e) => e.eventType === 'shot' && e.team === 'home').length + homeGoals;
    const awayShots = events.filter((e) => e.eventType === 'shot' && e.team === 'away').length + awayGoals;

    return {
      playerPositions,
      passRoutes,
      heatMap,
      events,
      winRateCurve,
      score: { home: homeGoals, away: awayGoals },
      attackStats: {
        home: {
          shots: homeShots,
          shotsOnTarget: Math.ceil(homeShots * 0.5),
          possession: Math.round(rand(40, 60)),
          passes: randInt(200, 500),
          passAccuracy: rand(0.7, 0.9),
          corners: events.filter((e) => e.eventType === 'corner' && e.team === 'home').length,
          fouls: events.filter((e) => e.eventType === 'foul' && e.team === 'home').length,
          offsides: randInt(0, 5),
        },
        away: {
          shots: awayShots,
          shotsOnTarget: Math.ceil(awayShots * 0.5),
          possession: 0, // will be 100 - home
          passes: randInt(200, 500),
          passAccuracy: rand(0.7, 0.9),
          corners: events.filter((e) => e.eventType === 'corner' && e.team === 'away').length,
          fouls: events.filter((e) => e.eventType === 'foul' && e.team === 'away').length,
          offsides: randInt(0, 5),
        },
      },
    };
  }
}

module.exports = new MockDataGenerator();
