'use strict';

const BaseAgent = require('./BaseAgent');

/**
 * MasterAgent - 主控调度器
 * 管理所有从 Agent 的注册、任务分发、超时隔离和结果收集
 * 所有 Agent 之间禁止直接通信，结果通过主控收集
 */
class MasterAgent extends BaseAgent {
  constructor() {
    super('coordinator', '主控协调员', { timeout: 60000, priority: 'high' });
    /** @type {Map<string, BaseAgent>} */
    this.agents = new Map();
    /** @type {Map<string, object>} */
    this.results = new Map();
  }

  /**
   * 注册 Agent 实例
   * @param {BaseAgent} agent
   */
  registerAgent(agent) {
    if (!(agent instanceof BaseAgent)) {
      throw new Error(`Invalid agent: must be instance of BaseAgent`);
    }
    this.agents.set(agent.id, agent);
  }

  /**
   * 获取指定 Agent
   * @param {string} agentId
   * @returns {BaseAgent|undefined}
   */
  getAgent(agentId) {
    return this.agents.get(agentId);
  }

  /**
   * 获取所有 Agent 状态
   * @returns {Array<object>}
   */
  getAgentStatuses() {
    return Array.from(this.agents.values()).map((a) => a.getStatus());
  }

  /**
   * 分发任务给指定 Agent
   * @param {string} taskType - Agent ID
   * @param {object} context - 执行上下文
   * @returns {Promise<object>} 执行结果
   */
  async dispatchTask(taskType, context) {
    const agent = this.agents.get(taskType);
    if (!agent) {
      return {
        agentId: taskType,
        status: 'failed',
        error: `Agent "${taskType}" not found`,
        duration: 0,
      };
    }
    const result = await agent.execute(context);
    this.results.set(taskType, result);
    return result;
  }

  /**
   * 并行执行所有 Agent，按优先级排序
   * 单个 Agent 超时/失败不影响其他 Agent
   * @param {object} context - 执行上下文
   * @returns {Promise<Map<string, object>>} agentId → 执行结果
   */
  async dispatchAll(context) {
    // 按优先级排序：high > normal > low
    const priorityOrder = { high: 0, normal: 1, low: 2 };
    const sortedAgents = Array.from(this.agents.values()).sort(
      (a, b) => (priorityOrder[a.priority] || 1) - (priorityOrder[b.priority] || 1)
    );

    // 并行执行所有 Agent
    const promises = sortedAgents.map((agent) => agent.execute(context));
    const settled = await Promise.allSettled(promises);

    // 收集结果
    settled.forEach((entry, index) => {
      const agent = sortedAgents[index];
      const result = entry.status === 'fulfilled'
        ? entry.value
        : { agentId: agent.id, status: 'failed', error: entry.reason?.message || 'Unknown error', duration: 0 };
      this.results.set(agent.id, result);
    });

    return this.results;
  }

  /**
   * 收集所有已完成 Agent 的结果
   * @returns {Map<string, object>}
   */
  collectResults() {
    return new Map(this.results);
  }

  /**
   * 重置所有 Agent 状态
   */
  resetAll() {
    this.agents.forEach((agent) => agent.reset());
    this.results.clear();
    this.status = 'idle';
    this.progress = 0;
  }

  /**
   * MasterAgent 自身的 run 方法 - 执行 dispatchAll
   */
  async run(context) {
    const results = await this.dispatchAll(context);
    return Object.fromEntries(results);
  }
}

module.exports = MasterAgent;
