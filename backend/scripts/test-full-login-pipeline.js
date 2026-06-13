#!/usr/bin/env node
// ================================================================
// test-full-login-pipeline.js — 角球系统登录→数据获取→轮询 全链路测试
// 用法: node backend/scripts/test-full-login-pipeline.js [--skip-login] [--poll-cycles N]
// ================================================================

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, "..", "..");

// ======================== 配置 ========================
const BASE_URL = process.env.TEST_BASE_URL || "http://localhost:3000";
const USERNAME = process.env.HG_USERNAME || "johui888";
const PASSWORD = process.env.HG_PASSWORD || "aa123123";
const SKIP_LOGIN = process.argv.includes("--skip-login");
// 支持 --poll-cycles N 参数
let pollCycles = parseInt(process.env.POLL_CYCLES || "5", 10);
const pollIdx = process.argv.indexOf("--poll-cycles");
if (pollIdx !== -1 && process.argv[pollIdx + 1]) {
  const n = parseInt(process.argv[pollIdx + 1], 10);
  if (n > 0) pollCycles = n;
}

// ======================== 工具函数 ========================
function log(label, ...args) {
  const ts = new Date().toLocaleTimeString("zh-CN", { hour12: false });
  console.log(`[${ts}] ${label}`, ...args);
}

function logPhase(phase, msg) {
  console.log(`\n${"=".repeat(60)}`);
  console.log(`  ${phase}: ${msg}`);
  console.log(`${"=".repeat(60)}\n`);
}

async function httpGet(path, timeoutMs = 30000) {
  const url = `${BASE_URL}${path}`;
  const start = Date.now();
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);
    const data = await res.json();
    const elapsed = Date.now() - start;
    return { ok: res.ok, status: res.status, data, elapsed, url };
  } catch (e) {
    return { ok: false, status: 0, data: null, elapsed: Date.now() - start, url, error: e.message };
  }
}

async function httpPost(path, body, timeoutMs = 120000) {
  const url = `${BASE_URL}${path}`;
  const start = Date.now();
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    clearTimeout(timer);
    const data = await res.json();
    const elapsed = Date.now() - start;
    return { ok: res.ok, status: res.status, data, elapsed, url };
  } catch (e) {
    return { ok: false, status: 0, data: null, elapsed: Date.now() - start, url, error: e.message };
  }
}

// ======================== 日志收集器 ========================
class LogCollector {
  constructor() {
    this.logs = [];
    this.errorLogs = [];
    this.warnLogs = [];
  }

  add(line) {
    this.logs.push(line);
    if (line.includes("ERROR") || line.includes("error:") || line.includes("Error:")) {
      this.errorLogs.push(line);
    }
    if (line.includes("WARN") || line.includes("warn:")) {
      this.warnLogs.push(line);
    }
  }

  summary() {
    return {
      totalLines: this.logs.length,
      errorCount: this.errorLogs.length,
      warnCount: this.warnLogs.length,
      errors: this.errorLogs.slice(0, 20), // 最多显示20条错误
      warnings: this.warnLogs.slice(0, 10),
    };
  }
}

// ======================== 主流程 ========================
async function main() {
  const overallStart = Date.now();
  const phases = {};
  const collector = new LogCollector();

  console.log("╔══════════════════════════════════════════════════════════╗");
  console.log("║   角球系统登录→数据获取→轮询 全链路测试              ║");
  console.log("║   BASE_URL=" + BASE_URL + "  pollCycles=" + pollCycles + "          ║");
  console.log("╚══════════════════════════════════════════════════════════╝\n");

  // ====== Phase 0: 检查服务器是否运行 ======
  logPhase("PHASE 0", "检查服务器是否运行");
  {
    const r = await httpGet("/api/corner/status");
    if (!r.ok && r.status !== 200) {
      log("ERROR", "服务器未运行或无法连接:", r.error || `status=${r.status}`);
      log("TIP", "请先启动服务器: npx tsx server.ts");
      process.exit(1);
    }
    phases["server_check"] = { elapsed: r.elapsed, ok: true };
    log("OK", "服务器运行正常 (" + r.elapsed + "ms)");
  }

  // ====== Phase 1: 登录（或跳过） ======
  if (!SKIP_LOGIN) {
    logPhase("PHASE 1", "登录 HG 网站");
    const loginStart = Date.now();

    const r = await httpPost("/api/corner/login", {
      username: USERNAME,
      password: PASSWORD,
    });

    phases["login"] = { elapsed: Date.now() - loginStart, ok: r.ok && r.data?.success };

    if (r.ok && r.data?.success) {
      log("OK", "登录成功!", `耗时=${Date.now() - loginStart}ms`);
    } else {
      log("WARN", "登录结果:", JSON.stringify(r.data).substring(0, 200));
      if (r.error) log("ERROR", "请求失败:", r.error);
      // 继续执行，不退出（可能是 Cookie 快速恢复路径）
    }

    // 登录后等待几秒让后端完成初始化
    log("INFO", "等待后端初始化...");
    await new Promise(r => setTimeout(r, 3000));
  } else {
    logPhase("PHASE 1", "跳过登录 (--skip-login)");
    phases["login"] = { elapsed: 0, ok: true, skipped: true };
  }

  // ====== Phase 2: 检查状态 ======
  logPhase("PHASE 2", "检查爬虫状态");
  {
    const r = await httpGet("/api/corner/status");
    phases["status"] = { elapsed: r.elapsed, ok: r.ok, data: r.data };
    if (r.ok) {
      log("OK", "状态检查完成 (" + r.elapsed + "ms)");
      const d = r.data?.data;
      if (d) {
        log("  crawler", JSON.stringify(d.crawler).substring(0, 200));
        log("  backend", JSON.stringify(d.backend).substring(0, 200));
        log("  balance", d.balance ?? "N/A");
      }
    } else {
      log("WARN", "状态检查异常:", JSON.stringify(r.data)?.substring(0, 100));
    }
  }

  // ====== Phase 3: 获取数据（即时爬取） ======
  logPhase("PHASE 3", "获取角球数据 (/corner/fetch)");
  {
    const fetchStart = Date.now();
    const r = await httpPost("/api/corner/fetch", {});
    phases["fetch_data"] = { elapsed: Date.now() - fetchStart, ok: r.ok && r.data?.success };

    if (r.ok && r.data?.success) {
      const matches = r.data?.data?.matches || [];
      const count = matches.length;
      log("OK", `数据获取成功! 耗时=${Date.now() - fetchStart}ms, 比赛数=${count}`);

      if (count > 0) {
        log("\n  --- 前3场比赛 ---");
        matches.slice(0, 3).forEach((m, i) => {
          const name = m.matchName || m.homeTeam + " vs " + m.awayTeam;
          const time = m.time || "--:--";
          const score = `${m.homeScore||0}-${m.awayScore||0}`;
          const corners = m.totalCorners ?? "N/A";
          const hdpCount = (m.handicaps || []).length;
          log(`  [${i}] ${name} | ${time} | ${score} | 角球=${corners} | 盘口=${hdpCount}个`);
        });

        // 检查盘口完整性
        if (count > 0) {
          const first = matches[0];
          const cats = new Set((first.handicaps || []).map(h => h.category + ":" + h.period));
          log(`\n  [盘口类型] 第一场比赛盘口: ${[...cats].join(", ")}`);
        }
      } else {
        log("WARN", "返回的比赛数为0（可能当前无角球比赛）");
      }
    } else {
      log("ERROR", "数据获取失败:", JSON.stringify(r.data)?.substring(0, 300));
      if (r.error) log("ERROR", "请求异常:", r.error);
    }
  }

  // ====== Phase 4: 获取 live 数据（缓存模式） ======
  logPhase("PHASE 4", "获取 live 缓存数据 (/corner/live)");
  {
    const r = await httpGet("/api/corner/live");
    phases["live_data"] = { elapsed: r.elapsed, ok: r.ok && r.data?.success };
    if (r.ok && r.data?.success) {
      const count = r.data?.count || 0;
      log("OK", `Live 数据获取成功 (${r.elapsed}ms), 比赛数=${count}, source=${r.data.source}, cacheAge=${r.data.cacheAge ?? "N/A"}ms`);
    } else {
      log("WARN", "Live 数据获取异常:", JSON.stringify(r.data)?.substring(0, 150));
    }
  }

  // ====== Phase 5: 启动监控轮询 ======
  logPhase("PHASE 5", `启动监控轮询 (${pollCycles} 个周期)`);
  {
    const r = await httpPost("/api/corner/start", {});
    phases["start_polling"] = { elapsed: r.elapsed, ok: r.ok && r.data?.success };
    if (r.ok && r.data?.success) {
      log("OK", "监控轮询已启动 (" + r.elapsed + "ms)");

      // 观察多个轮询周期
      let successCount = 0;
      let failCount = 0;
      let totalDataPoints = 0;

      for (let cycle = 1; cycle <= pollCycles; cycle++) {
        await new Promise(r => setTimeout(r, 16000)); // 等待一个轮询周期（15s间隔 + 1s缓冲）

        const lr = await httpGet("/api/corner/live");
        if (lr.ok && lr.data?.success) {
          successCount++;
          totalDataPoints += lr.data.count || 0;
          log(`  [轮次 ${cycle}/${pollCycles}] OK`, `${lr.data.count}场比赛, cacheAge=${lr.data.cacheAge ?? "??"}ms, source=${lr.data.source}, 耗时=${lr.elapsed}ms`);
        } else {
          failCount++;
          log(`  [轮次 ${cycle}/${pollCycles}] FAIL`, `status=${lr.status}`, lr.error || JSON.stringify(lr.data)?.substring(0, 100));
        }

        // 每个周期也检查一次 status
        if (cycle % 2 === 0 || cycle === pollCycles) {
          const sr = await httpGet("/api/corner/status");
          if (sr.ok && sr.data?.data) {
            const bs = sr.data.data.backend;
            log(`  [状态] polling=${bs?.isPolling ?? "?"} lastUpdate=${bs?.lastUpdate ? new Date(bs.lastUpdate).toLocaleTimeString() : "?"}`);
          }
        }
      }

      phases["poll_cycles"] = { successCount, failCount, totalDataPoints, cycles: pollCycles };
      log("\n  --- 轮询汇总 ---");
      log(`  成功: ${successCount}/${pollCycles} | 失败: ${failCount}/${pollCycles} | 总数据点: ${totalDataPoints}`);

    } else {
      log("ERROR", "启动监控轮询失败:", JSON.stringify(r.data)?.substring(0, 200));
      phases["poll_cycles"] = { successCount: 0, failCount: pollCycles, totalDataPoints: 0, cycles: pollCycles };
    }
  }

  // ====== Phase 6: 停止轮询 ======
  logPhase("PHASE 6", "停止监控轮询");
  {
    const r = await httpPost("/api/corner/stop", {});
    phases["stop_polling"] = { elapsed: r.elapsed, ok: r.ok };
    log("OK", "轮询已停止 (" + r.elapsed + "ms)");
  }

  // ====== 最终报告 ======
  const totalElapsed = Date.now() - overallStart;
  logPhase("FINAL REPORT", `总耗时: ${(totalElapsed / 1000).toFixed(1)}s`);

  console.log("\n┌────────────────────┬──────────┬────────┐");
  console.log("│ 阶段               │ 耗时(ms) │ 状态   │");
  console.log("├────────────────────┼──────────┼────────┤");
  for (const [name, p] of Object.entries(phases)) {
    const labelMap = {
      server_check: "0.服务器检查",
      login: "1.登录",
      status: "2.状态检查",
      fetch_data: "3.数据获取(f)",
      live_data: "4.Live数据",
      start_polling: "5.启动轮询",
      stop_polling: "6.停止轮询",
    };
    const label = labelMap[name] || name;
    const elapsed = p.elapsed ?? 0;
    const status = p.skipped ? "SKIP" : (p.ok ? "OK" : "FAIL");
    console.log(`│ ${label.padEnd(18)} │ ${String(elapsed).padStart(8)} │ ${status.padEnd(6)} │`);
  }
  console.log("├────────────────────┼──────────┼────────┤");
  console.log(`│ ${"总计".padEnd(18)} │ ${String(totalElapsed).padStart(8)} │        │`);
  console.log("└────────────────────┴──────────┴────────┘");

  // 轮询详情
  if (phases.poll_cycles) {
    const pc = phases.poll_cycles;
    console.log(`\n  轮询统计: 成功 ${pc.successCount}/${pc.cycles} | 失败 ${pc.failCount}/${pc.cycles} | 数据点 ${pc.totalDataPoints}`);
  }

  // 输出建议
  console.log("\n  --- 优化建议 ---");
  const loginTime = phases.login?.elapsed || 0;
  const fetchTime = phases.fetch_data?.elapsed || 0;

  if (loginTime > 45000) {
    console.log(`  ⚠ 登录耗时 ${loginTime}ms > 45s，建议优化：减少固定sleep、使用条件等待`);
  } else if (loginTime > 25000) {
    console.log(`  ⚡ 登录耗时 ${loginTime}ms，可优化空间：使用自适应轮询+条件等待可缩短至15s内`);
  } else {
    console.log(`  ✓ 登录耗时 ${loginTime}ms，速度良好`);
  }

  if (fetchTime > 20000) {
    console.log(`  ⚠ 数据获取耗时 ${fetchTime}ms > 20s，建议优先纯HTTP API模式`);
  } else if (fetchTime > 8000) {
    console.log(`  ⚡ 数据获取耗时 ${fetchTime}ms，Cookie快速恢复或纯HTTP模式可加速`);
  } else {
    console.log(`  ✓ 数据获取耗时 ${fetchTime}ms，速度良好`);
  }

  // 保存结果到文件
  const reportPath = path.join(PROJECT_ROOT, "backend", "pipeline-test-report.json");
  try {
    fs.writeFileSync(reportPath, JSON.stringify({
      timestamp: new Date().toISOString(),
      totalElapsed,
      phases,
      config: { BASE_URL, pollCycles, SKIP_LOGIN },
    }, null, 2));
    log("\n报告已保存:", reportPath);
  } catch (_) {}

  console.log("\n✅ 全链路测试完成\n");
}

main().catch(err => {
  console.error("致命错误:", err.message);
  process.exit(1);
});
