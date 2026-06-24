// ======================== SSE (Server-Sent Events) 广播模块 ========================
// 管理前端 SSE 客户端连接，在后端数据变更时主动推送给所有连接的客户端
// 替代前端轮询 GET /api/corner/live，实现毫秒级数据同步
//
// 工作原理:
//   前端 → GET /api/corner/stream (建立SSE长连接)
//   后端 → crawlCornerMatches() / Gismo回调 更新数据后调用 broadcast()
//   后端 → 通过SSE推送 { type: "matches", data: [...] } 给所有客户端
//   前端 → EventSource.onmessage → 更新 Zustand store → React 响应式渲染

// ======================== 客户端连接管理 ========================

const clients = new Set(); // Set<Response> 所有活跃的SSE客户端响应对象

// 推送统计
const stats = {
  totalPushes: 0,
  lastPushAt: null,
  lastPushLatency: 0,
};

/**
 * 注册一个新的 SSE 客户端连接
 * @param {import('express').Response} res - Express 响应对象
 * @returns {Function} 取消注册函数（客户端断开时调用）
 */
export function registerSSEClient(res) {
  // SSE 标准响应头
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    "Connection": "keep-alive",
    "X-Accel-Buffering": "no", // 禁用 Nginx 缓冲，确保实时推送
    "Access-Control-Allow-Origin": "*",
  });

  // 发送初始连接确认消息
  res.write(`event: connected\ndata: ${JSON.stringify({ timestamp: Date.now(), message: "SSE连接已建立" })}\n\n`);

  clients.add(res);
  console.log(`[SSE] 新客户端连接, 当前连接数: ${clients.size}`);

  // 返回取消注册函数
  return () => {
    clients.delete(res);
    console.log(`[SSE] 客户端断开, 当前连接数: ${clients.size}`);
  };
}

/**
 * 获取当前连接的客户端数量
 */
export function getSSEClientCount() {
  return clients.size;
}

/**
 * 获取 SSE 推送统计
 */
export function getSSEStats() {
  return {
    ...stats,
    connectedClients: clients.size,
  };
}

// ======================== 广播函数 ========================

/**
 * 向所有连接的客户端广播比赛数据
 * 在 pollOnce() 成功或 Gismo 回调更新数据后调用
 *
 * @param {Object} payload - 推送的数据载荷
 * @param {string} payload.type - 消息类型: "matches" | "delta" | "status" | "heartbeat"
 * @param {Array} payload.data - 比赛数据数组（type="matches"时）
 * @param {Object} payload.mainMarkets - 常规盘口数据
 * @param {Object} payload.changes - 变更详情（type="delta"时）
 * @param {string} payload.source - 数据来源: "poll" | "gismo" | "manual"
 */
export function broadcast(payload) {
  if (clients.size === 0) return; // 无客户端连接时跳过

  const pushStart = Date.now();

  // ★ 嵌入精确的服务端发送时间戳，供前端计算端到端延迟
  const enrichedPayload = {
    ...payload,
    serverTimestamp: pushStart, // 精确到毫秒的时间戳
  };

  try {
    const message = `data: ${JSON.stringify(enrichedPayload)}\n\n`;
    const deadClients = [];

    for (const res of clients) {
      try {
        res.write(message);
      } catch (e) {
        // 写入失败说明客户端已断开，标记为待清理
        deadClients.push(res);
      }
    }

    // 清理断开的客户端
    for (const dead of deadClients) {
      clients.delete(dead);
      try { dead.end(); } catch (_) {}
    }

    // 更新统计
    stats.totalPushes++;
    stats.lastPushAt = new Date().toISOString();
    stats.lastPushLatency = Date.now() - pushStart;
  } catch (e) {
    console.error("[SSE] 广播失败:", e.message);
  }
}

/**
 * 广播完整比赛数据（用于 pollOnce 成功后全量推送）
 * @param {Array} matches - 比赛数据数组
 * @param {Object} mainMarkets - 常规盘口数据
 * @param {string} source - 数据来源
 * @param {Array|null} changes - 变更详情（可选，用于增量推送优化）
 */
export function broadcastMatches(matches, mainMarkets, source = "poll", changes = null) {
  // 如果有变更详情且变更较少，使用增量推送模式
  if (changes && changes.length > 0 && changes.length < matches.length) {
    broadcast({
      type: "delta",
      source,
      timestamp: Date.now(),
      changes: changes.map(c => ({
        matchId: c.matchId,
        field: c.field,
        oldValue: c.oldValue,
        newValue: c.newValue,
      })),
      // 同时推送变更涉及的比赛完整数据（确保前端有完整上下文）
      data: matches.filter(m => changes.some(c => c.matchId === m.matchId)),
      mainMarkets: {}, // 增量推送不附带完整mainMarkets
    });
  } else {
    // 全量推送
    broadcast({
      type: "matches",
      source,
      timestamp: Date.now(),
      data: matches,
      mainMarkets: mainMarkets || {},
      changeCount: changes ? changes.length : 0,
    });
  }
}

/**
 * 广播状态变更（监控启动/停止/暂停等）
 * @param {string} status - 状态描述
 * @param {Object} extra - 附加信息
 */
export function broadcastStatus(status, extra = {}) {
  broadcast({
    type: "status",
    timestamp: Date.now(),
    status,
    ...extra,
  });
}

// ======================== 心跳保活 ========================

// 每 15 秒发送心跳，防止代理/防火墙断开空闲连接
let heartbeatTimer = null;

export function startHeartbeat() {
  if (heartbeatTimer) return;
  heartbeatTimer = setInterval(() => {
    if (clients.size > 0) {
      broadcast({ type: "heartbeat", timestamp: Date.now() });
    }
  }, 15000);
  console.log("[SSE] 心跳定时器已启动 (15s间隔)");
}

export function stopHeartbeat() {
  if (heartbeatTimer) {
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
    console.log("[SSE] 心跳定时器已停止");
  }
}

// 模块加载时自动启动心跳
startHeartbeat();
