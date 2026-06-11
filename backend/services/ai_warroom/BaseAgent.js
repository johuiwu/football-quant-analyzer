'use strict';

/**
 * BaseAgent - 所有 Agent 的抽象基类
 * 定义 Agent 生命周期：idle → running → completed/failed
 * 子类必须覆盖 run(context) 方法
 */
class BaseAgent {
  /**
   * @param {string} id - Agent 唯一标识
   * @param {string} name - 显示名称
   * @param {object} [options] - 可选配置
   * @param {number} [options.timeout=30000] - 超时毫秒数
   * @param {string} [options.priority='normal'] - 任务优先级 high/normal/low
   */
  constructor(id, name, options = {}) {
    this.id = id;
    this.name = name;
    this.status = 'idle';
    this.progress = 0;
    this.lastOutput = null;
    this.lastError = null;
    this.timeout = options.timeout || 30000;
    this.priority = options.priority || 'normal';
  }

  /**
   * 抽象方法 - 子类必须实现
   * @param {object} context - 执行上下文
   * @returns {Promise<any>} 执行结果
   */
  async run(context) {
    throw new Error(`Agent "${this.id}" must implement run(context) method`);
  }

  /**
   * 模板方法 - 封装状态管理、超时控制、错误捕获
   * @param {object} context - 执行上下文
   * @returns {Promise<{agentId: string, status: string, result?: any, error?: string, duration: number}>}
   */
  async execute(context) {
    const startTime = Date.now();
    this.status = 'running';
    this.progress = 0;
    this.lastError = null;

    try {
      // 超时控制：Promise.race
      const result = await Promise.race([
        this.run(context),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Agent timeout')), this.timeout)
        ),
      ]);

      this.status = 'completed';
      this.progress = 100;
      this.lastOutput = typeof result === 'string' ? result : JSON.stringify(result).slice(0, 200);

      return {
        agentId: this.id,
        status: 'completed',
        result,
        duration: Date.now() - startTime,
      };
    } catch (error) {
      this.status = 'failed';
      this.lastError = error.message;

      return {
        agentId: this.id,
        status: 'failed',
        error: error.message,
        duration: Date.now() - startTime,
      };
    }
  }

  /**
   * 重置 Agent 状态
   */
  reset() {
    this.status = 'idle';
    this.progress = 0;
    this.lastOutput = null;
    this.lastError = null;
  }

  /**
   * 获取 Agent 状态摘要
   */
  getStatus() {
    return {
      id: this.id,
      name: this.name,
      status: this.status,
      progress: this.progress,
      lastOutput: this.lastOutput,
      lastError: this.lastError,
      priority: this.priority,
    };
  }
}

module.exports = BaseAgent;
