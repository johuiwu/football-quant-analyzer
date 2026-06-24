// ======================== SSE 实时推送延迟追踪模块 ========================
// 自动监测 SSE 推送的端到端延迟，计算 Date.now() - serverTimestamp
// 超过 100ms 阈值时输出告警，定期上报延迟样本到后端聚合统计
//
// 工作流程:
//   1. cornerStore 的 SSE onmessage 回调中调用 trackLatency(payload)
//   2. 本模块计算延迟，本地记录 + 控制台告警
//   3. 每积累 10 个样本自动批量上报到 POST /api/corner/latency-report
//   4. 提供 getLocalLatencyStats() 供前端UI展示实时延迟

// ======================== 配置 ========================

const LATENCY_THRESHOLD_MS = 100; // 告警阈值
const CRITICAL_LATENCY_MS = 500; // 严重告警阈值
const BATCH_UPLOAD_SIZE = 10; // 每积累10个样本上报一次
const CLIENT_ID = `client_${Math.random().toString(36).substring(2, 8)}`;

// ======================== 本地统计 ========================

interface LatencySample {
  serverTs: number;
  clientTs: number;
  latency: number;
  source: string;
  type: string;
}

const samples: LatencySample[] = [];
let alertCount = 0;
let criticalAlertCount = 0;
let totalTracked = 0;
let pendingUpload: LatencySample[] = [];

// 滑动窗口统计（最近100个样本）
const recentLatencies: number[] = [];
const RECENT_WINDOW = 100;

// ======================== 核心函数 ========================

/**
 * 追踪一条 SSE 消息的延迟
 * 在 cornerStore 的 SSE onmessage 回调中调用
 *
 * @param payload - SSE 消息载荷（需包含 serverTimestamp 字段）
 * @returns 延迟毫秒数（-1 表示无效）
 */
export function trackLatency(payload: any): number {
  if (!payload || !payload.serverTimestamp) return -1;

  const clientTs = Date.now();
  const serverTs = payload.serverTimestamp;
  const latency = clientTs - serverTs;

  // 过滤异常值（负数或超过60秒，可能时钟不同步）
  if (latency < 0 || latency > 60000) {
    return -1;
  }

  const source = payload.source || "unknown";
  const type = payload.type || "unknown";

  const sample: LatencySample = { serverTs, clientTs, latency, source, type };
  samples.push(sample);
  totalTracked++;

  // 滑动窗口
  recentLatencies.push(latency);
  if (recentLatencies.length > RECENT_WINDOW) recentLatencies.shift();

  // 阈值告警
  if (latency > CRITICAL_LATENCY_MS) {
    criticalAlertCount++;
    console.error(
      `[延迟追踪·严重] ${latency}ms > ${CRITICAL_LATENCY_MS}ms | source=${source} type=${type} | ⚠️ SSE推送延迟严重超标`
    );
  } else if (latency > LATENCY_THRESHOLD_MS) {
    alertCount++;
    console.warn(
      `[延迟追踪·告警] ${latency}ms > ${LATENCY_THRESHOLD_MS}ms | source=${source} type=${type} | SSE推送延迟超过阈值`
    );
  }

  // 批量上报
  pendingUpload.push(sample);
  if (pendingUpload.length >= BATCH_UPLOAD_SIZE) {
    uploadPendingSamples();
  }

  return latency;
}

/**
 * 批量上报待发送的延迟样本到后端
 */
async function uploadPendingSamples() {
  if (pendingUpload.length === 0) return;

  const batch = pendingUpload.splice(0);
  try {
    await fetch("/api/corner/latency-report", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        serverTs: batch[0].serverTs, // 上报第一个样本的时间戳作为代表
        clientTs: batch[batch.length - 1].clientTs, // 最后一个接收时间
        source: batch[0].source,
        type: batch[0].type,
        clientId: CLIENT_ID,
      }),
    });
  } catch (err) {
    // 上报失败不影响主流程，样本丢弃
    console.debug("[延迟追踪] 样本上报失败:", err);
  }
}

/**
 * 获取本地延迟统计（供前端UI展示）
 */
export function getLocalLatencyStats() {
  const count = recentLatencies.length;
  if (count === 0) {
    return {
      mode: "sse",
      totalTracked: 0,
      recentCount: 0,
      avgLatency: 0,
      maxLatency: 0,
      minLatency: 0,
      p95Latency: 0,
      alertCount: 0,
      criticalAlertCount: 0,
      alertRate: 0,
      status: "no_data",
      thresholdMs: LATENCY_THRESHOLD_MS,
      clientId: CLIENT_ID,
    };
  }

  const sorted = [...recentLatencies].sort((a, b) => a - b);
  const avg = Math.round(recentLatencies.reduce((s, v) => s + v, 0) / count);
  const p95Idx = Math.min(Math.floor(count * 0.95), count - 1);
  const alertRate = totalTracked > 0 ? (alertCount + criticalAlertCount) / totalTracked : 0;

  let status = "healthy";
  if (avg > CRITICAL_LATENCY_MS) status = "critical";
  else if (avg > LATENCY_THRESHOLD_MS || alertRate > 0.1) status = "warning";
  else if (avg <= LATENCY_THRESHOLD_MS && alertRate < 0.05) status = "excellent";

  return {
    mode: "sse",
    totalTracked,
    recentCount: count,
    avgLatency: avg,
    maxLatency: sorted[count - 1],
    minLatency: sorted[0],
    p95Latency: sorted[p95Idx],
    alertCount,
    criticalAlertCount,
    alertRate: Math.round(alertRate * 10000) / 100,
    status,
    thresholdMs: LATENCY_THRESHOLD_MS,
    clientId: CLIENT_ID,
  };
}

/**
 * 重置本地统计
 */
export function resetLocalStats() {
  samples.length = 0;
  recentLatencies.length = 0;
  pendingUpload.length = 0;
  alertCount = 0;
  criticalAlertCount = 0;
  totalTracked = 0;
  console.log("[延迟追踪] 本地统计已重置");
}

/**
 * 强制刷新：立即上报所有待发送样本
 */
export async function flushPendingSamples() {
  if (pendingUpload.length > 0) {
    await uploadPendingSamples();
  }
}

export { LATENCY_THRESHOLD_MS, CRITICAL_LATENCY_MS, CLIENT_ID };
