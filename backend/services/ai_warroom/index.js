'use strict';

/**
 * AI 战情室模块入口
 * 导出所有核心类和工厂函数
 */

const BaseAgent = require('./BaseAgent');
const MasterAgent = require('./MasterAgent');
const ResultIntegrator = require('./ResultIntegrator');

// 核心 Agent
const MatchTrackerAgent = require('./agents/match_tracker');
const AttackStatsAgent = require('./agents/attack_stats');
const ShotProbabilityAgent = require('./agents/shot_probability');
const HistoryMatchAgent = require('./agents/history_match');

// 模板 Agent
const { createTemplateAgents } = require('./agents/template_agents');

/**
 * 创建并注册所有 16 个 Agent 的 MasterAgent 实例
 * @param {object} [options] - 可选配置
 * @returns {MasterAgent}
 */
function createMasterAgent(options = {}) {
  const master = new MasterAgent();

  // 注册 4 个核心 Agent
  master.registerAgent(new MatchTrackerAgent());
  master.registerAgent(new AttackStatsAgent());
  master.registerAgent(new ShotProbabilityAgent());
  master.registerAgent(new HistoryMatchAgent());

  // 注册 12 个模板 Agent
  const templateAgents = createTemplateAgents();
  templateAgents.forEach((agent) => master.registerAgent(agent));

  return master;
}

module.exports = {
  BaseAgent,
  MasterAgent,
  ResultIntegrator,
  createMasterAgent,
  // 单独导出核心 Agent 类，便于按需使用
  MatchTrackerAgent,
  AttackStatsAgent,
  ShotProbabilityAgent,
  HistoryMatchAgent,
};
