// ======================== 实时推送延迟监测模块 ========================
// 精准记录数据从"后端爬取/变更"到"前端SSE接收"的端到端延迟
// 提供毫秒级阈值告警（默认 <100ms 为正常）和自动化统计报告
//
// 延迟测量原理:
//   后端 broadcast() 时记录 serverTimestamp（嵌入SSE消息）
//   前端 onmessage 时计算 Date.now() - serverTimestamp = 端到端延迟
//   前端通过 POST /api/corner/latency-report 上报延迟样本
//   后端聚合统计 + 阈值告警 + 报告输出

// ======================== 配置 ========================

const LATENCY_THRESHOLD_MS = 100; // 毫秒级阈值：超过此值触发告警
const CRITICAL_LATENCY_MS = 500; // 严重告警阈值
const MAX_SAMPLES = 1000; // 最大保留样本数（环形缓冲）
const REPORT_INTERVAL_MS = 60000; // 自动报告间隔（60秒）

// ======================== 延迟样本存储 ========================

const latencySamples = []; // { serverTs, clientTs, latency, source, type, clientId }
let alertCount = 0;
let criticalAlertCount = 0;
let totalSamples = 0;
const sourceStats = {}; // 按 source 分组统计: { poll: {count, avg, max, min}, gismo: {...} }
const typeStats = {};   // 按 type 分组统计: { matches: {...}, delta: {...} }

// ======================== 核心函数 ========================

/**
 * 记录一个延迟样本（由前端上报）
 * @param {Object} sample - 延迟样本
 * @param {number} sample.serverTs - 后端发送时间戳
 * @param {number} sample.clientTs - 前端接收时间戳
 * @param {string} sample.source - 数据来源 (poll/gismo/manual)
 * @param {string} sample.type - 消息类型 (matches/delta/status/heartbeat)
 * @param {string} sample.clientId - 客户端标识
 */
export function recordLatencySample(sample) {
  const { serverTs, clientTs, source = "unknown", type = "unknown", clientId = "anon" } = sample;

  if (!serverTs || !clientTs) return;

  const latency = clientTs - serverTs;
  if (latency < 0 || latency > 60000) {
    // 异常延迟（负数或超过60秒），可能是时钟不同步，跳过
    return;
  }

  const record = {
    serverTs,
    clientTs,
    latency,
    source,
    type,
    clientId,
    recordedAt: Date.now(),
  };

  // 环形缓冲：超过最大样本数时移除最旧的
  latencySamples.push(record);
  if (latencySamples.length > MAX_SAMPLES) {
    latencySamples.shift();
  }

  totalSamples++;

  // 按来源分组统计
  if (!sourceStats[source]) {
    sourceStats[source] = { count: 0, sum: 0, max: 0, min: Infinity, alertCount: 0 };
  }
  const ss = sourceStats[source];
  ss.count++;
  ss.sum += latency;
  ss.max = Math.max(ss.max, latency);
  ss.min = Math.min(ss.min, latency);

  // 按类型分组统计
  if (!typeStats[type]) {
    typeStats[type] = { count: 0, sum: 0, max: 0, min: Infinity };
  }
  const ts = typeStats[type];
  ts.count++;
  ts.sum += latency;
  ts.max = Math.max(ts.max, latency);
  ts.min = Math.min(ts.min, latency);

  // 阈值告警检测
  if (latency > CRITICAL_LATENCY_MS) {
    criticalAlertCount++;
    ss.alertCount++;
    console.warn(`[延迟告警·严重] ${latency}ms 超过 ${CRITICAL_LATENCY_MS}ms 阈值 | source=${source} type=${type} client=${clientId} | serverTs=${serverTs} clientTs=${clientTs}`);
  } else if (latency > LATENCY_THRESHOLD_MS) {
    alertCount++;
    ss.alertCount++;
    console.warn(`[延迟告警] ${latency}ms 超过 ${LATENCY_THRESHOLD_MS}ms 阈值 | source=${source} type=${type} client=${clientId}`);
  }
}

/**
 * 获取延迟统计报告
 * @returns {Object} 完整的延迟统计报告
 */
export function getLatencyReport() {
  const sampleCount = latencySamples.length;
  if (sampleCount === 0) {
    return {
      timestamp: new Date().toISOString(),
      mode: "sse",
      thresholdMs: LATENCY_THRESHOLD_MS,
      criticalThresholdMs: CRITICAL_LATENCY_MS,
      summary: {
        totalSamples: 0,
        avgLatency: 0,
        maxLatency: 0,
        minLatency: 0,
        p50Latency: 0,
        p95Latency: 0,
        p99Latency: 0,
        alertCount: 0,
        criticalAlertCount: 0,
        alertRate: 0,
      },
      bySource: {},
      byType: {},
      recentSamples: [],
      status: "no_data",
      message: "暂无延迟样本，请确保前端已连接 SSE 并上报延迟数据",
    };
  }

  // 计算百分位数
  const sortedLatencies = latencySamples.map((s) => s.latency).sort((a, b) => a - b);
  const percentile = (p) => {
    const idx = Math.min(Math.floor(sortedLatencies.length * p), sortedLatencies.length - 1);
    return sortedLatencies[idx];
  };

  const avgLatency = Math.round(latencySamples.reduce((sum, s) => sum + s.latency, 0) / sampleCount);

  // 按来源格式化
  const bySource = {};
  for (const [src, ss] of Object.entries(sourceStats)) {
    bySource[src] = {
      count: ss.count,
      avgLatency: Math.round(ss.sum / ss.count),
      maxLatency: ss.max,
      minLatency: ss.min === Infinity ? 0 : ss.min,
      alertCount: ss.alertCount,
      alertRate: ss.count > 0 ? Math.round((ss.alertCount / ss.count) * 10000) / 100 : 0,
    };
  }

  // 按类型格式化
  const byType = {};
  for (const [t, ts] of Object.entries(typeStats)) {
    byType[t] = {
      count: ts.count,
      avgLatency: Math.round(ts.sum / ts.count),
      maxLatency: ts.max,
      minLatency: ts.min === Infinity ? 0 : ts.min,
    };
  }

  // 判定整体状态
  let status = "healthy";
  let message = "SSE 推送延迟正常，达到毫秒级标准";
  const alertRate = sampleCount > 0 ? (alertCount + criticalAlertCount) / sampleCount : 0;

  if (avgLatency > CRITICAL_LATENCY_MS) {
    status = "critical";
    message = `平均延迟 ${avgLatency}ms 严重超标（阈值 ${CRITICAL_LATENCY_MS}ms），需排查`;
  } else if (avgLatency > LATENCY_THRESHOLD_MS || alertRate > 0.1) {
    status = "warning";
    message = `平均延迟 ${avgLatency}ms 超过阈值 ${LATENCY_THRESHOLD_MS}ms 或告警率 ${(alertRate * 100).toFixed(1)}% 过高`;
  } else if (avgLatency <= LATENCY_THRESHOLD_MS && alertRate < 0.05) {
    status = "excellent";
    message = `SSE 推送延迟优秀！平均 ${avgLatency}ms，P95 ${percentile(0.95)}ms，告警率 ${(alertRate * 100).toFixed(1)}%`;
  }

  return {
    timestamp: new Date().toISOString(),
    mode: "sse",
    thresholdMs: LATENCY_THRESHOLD_MS,
    criticalThresholdMs: CRITICAL_LATENCY_MS,
    summary: {
      totalSamples: sampleCount,
      avgLatency,
      maxLatency: sortedLatencies[sampleCount - 1],
      minLatency: sortedLatencies[0],
      p50Latency: percentile(0.5),
      p95Latency: percentile(0.95),
      p99Latency: percentile(0.99),
      alertCount,
      criticalAlertCount,
      alertRate: Math.round(alertRate * 10000) / 100,
    },
    bySource,
    byType,
    recentSamples: latencySamples.slice(-20).reverse(),
    status,
    message,
  };
}

/**
 * 重置延迟统计（用于清除历史数据重新开始监测）
 */
export function resetLatencyStats() {
  latencySamples.length = 0;
  alertCount = 0;
  criticalAlertCount = 0;
  totalSamples = 0;
  for (const key of Object.keys(sourceStats)) delete sourceStats[key];
  for (const key of Object.keys(typeStats)) delete typeStats[key];
  console.log("[延迟监测] 统计数据已重置");
}

// ======================== 自动报告输出 ========================

let reportTimer = null;

/**
 * 启动自动报告定时器（每60秒输出一次延迟统计到控制台）
 */
export function startAutoReport() {
  if (reportTimer) return;
  reportTimer = setInterval(() => {
    const report = getLatencyReport();
    if (report.summary.totalSamples > 0) {
      console.log(`\n[延迟报告] ======== ${report.timestamp} ========`);
      console.log(`[延迟报告] 状态: ${report.status} - ${report.message}`);
      console.log(`[延迟报告] 样本数: ${report.summary.totalSamples} | 平均: ${report.summary.avgLatency}ms | P50: ${report.summary.p50Latency}ms | P95: ${report.summary.p95Latency}ms | P99: ${report.summary.p99Latency}ms | 最大: ${report.summary.maxLatency}ms`);
      console.log(`[延迟报告] 告警: ${report.summary.alertCount}次 (严重 ${report.summary.criticalAlertCount}次) | 告警率: ${report.summary.alertRate}%`);

      // 按来源输出
      for (const [src, ss] of Object.entries(report.bySource)) {
        console.log(`[延迟报告] 来源[${src}]: 样本=${ss.count} 平均=${ss.avgLatency}ms 最大=${ss.maxLatency}ms 告警=${ss.alertCount}次 (${ss.alertRate}%)`);
      }
      console.log("[延迟报告] ====================================\n");
    }
  }, REPORT_INTERVAL_MS);
  console.log(`[延迟监测] 自动报告已启动 (每 ${REPORT_INTERVAL_MS / 1000}s 输出一次)`);
}

/**
 * 停止自动报告
 */
export function stopAutoReport() {
  if (reportTimer) {
    clearInterval(reportTimer);
    reportTimer = null;
    console.log("[延迟监测] 自动报告已停止");
  }
}

// 模块加载时自动启动
startAutoReport();

export { LATENCY_THRESHOLD_MS, CRITICAL_LATENCY_MS };
