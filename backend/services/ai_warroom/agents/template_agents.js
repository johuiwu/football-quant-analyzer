'use strict';

const BaseAgent = require('../BaseAgent');

/**
 * 12 个模板 Agent 的定义
 * 每个 Agent 继承 BaseAgent，提供占位 run() 实现
 */

// Agent 定义：[id, name, priority, timeout]
const TEMPLATE_DEFS = [
  ['defense-stability', '防守稳定性', 'normal', 20000],
  ['midfield-control', '中场控制力', 'normal', 20000],
  ['home-advantage', '主场优势', 'low', 15000],
  ['weather-impact', '天气影响', 'low', 15000],
  ['injury-impact', '伤病影响', 'normal', 20000],
  ['form-analysis', '近期状态', 'normal', 20000],
  ['corner-stats', '角球统计', 'normal', 20000],
  ['card-risk', '红黄牌风险', 'low', 15000],
  ['substitution-effect', '换人效果', 'low', 15000],
  ['momentum-shift', '势头转换', 'normal', 20000],
  ['set-piece', '定位球分析', 'normal', 20000],
  ['psychological', '心理因素', 'low', 15000],
];

/**
 * 创建单个模板 Agent 类
 */
function createTemplateAgentClass(id, name, priority, timeout) {
  class TemplateAgent extends BaseAgent {
    constructor() {
      super(id, name, { timeout, priority });
    }

    async run(context) {
      const { homeTeam, awayTeam } = context;
      // 模拟分析延迟
      await new Promise((r) => setTimeout(r, 500 + Math.random() * 1500));

      return {
        agentId: this.id,
        homeTeam,
        awayTeam,
        score: +(Math.random() * 10).toFixed(1),
        insight: `${name}分析完成：${homeTeam} vs ${awayTeam}`,
      };
    }
  }
  return TemplateAgent;
}

/**
 * 创建所有 12 个模板 Agent 实例
 * @returns {BaseAgent[]}
 */
function createTemplateAgents() {
  return TEMPLATE_DEFS.map(([id, name, priority, timeout]) => {
    const AgentClass = createTemplateAgentClass(id, name, priority, timeout);
    return new AgentClass();
  });
}

module.exports = { createTemplateAgents, TEMPLATE_DEFS };
