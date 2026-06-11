'use strict';

const { WebSocketServer } = require('ws');

/**
 * WsHandler - AI 战情室 WebSocket 处理器
 * 管理 WebSocket 连接，推送 Agent 状态、比赛事件和预测结果
 */
class WsHandler {
  constructor() {
    /** @type {WebSocketServer|null} */
    this.wss = null;
    /** @type {Set<WebSocket>} */
    this.clients = new Set();
  }

  /**
   * 初始化 WebSocket Server
   * @param {import('http').Server} server - HTTP Server 实例
   */
  init(server) {
    this.wss = new WebSocketServer({ server, path: '/ws/ai-warroom' });

    this.wss.on('connection', (ws) => {
      this.clients.add(ws);
      console.log('[AI WarRoom] WebSocket client connected, total:', this.clients.size);

      ws.on('close', () => {
        this.clients.delete(ws);
        console.log('[AI WarRoom] WebSocket client disconnected, total:', this.clients.size);
      });

      ws.on('error', (err) => {
        console.error('[AI WarRoom] WebSocket error:', err.message);
        this.clients.delete(ws);
      });

      // 发送连接确认
      ws.send(JSON.stringify({ type: 'connected', data: { message: 'AI WarRoom WebSocket connected' } }));
    });

    console.log('[AI WarRoom] WebSocket server initialized at /ws/ai-warroom');
  }

  /**
   * 广播消息给所有连接的客户端
   * @param {string} type - 消息类型
   * @param {object} data - 消息数据
   */
  broadcast(type, data) {
    const message = JSON.stringify({ type, data });
    for (const client of this.clients) {
      if (client.readyState === 1) { // WebSocket.OPEN
        try {
          client.send(message);
        } catch (err) {
          console.error('[AI WarRoom] Broadcast error:', err.message);
        }
      }
    }
  }

  /**
   * 推送 Agent 状态变更
   */
  sendAgentStatus(agentId, status, progress) {
    this.broadcast('agent:status', { id: agentId, status, progress });
  }

  /**
   * 推送比赛实时事件
   */
  sendMatchEvent(event) {
    this.broadcast('match:event', event);
  }

  /**
   * 推送预测结果
   */
  sendPredictionResult(result) {
    this.broadcast('prediction:result', result);
  }

  /**
   * 获取连接数
   */
  getConnectionCount() {
    return this.clients.size;
  }
}

// 单例导出
module.exports = new WsHandler();
