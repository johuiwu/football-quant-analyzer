import puppeteer from "puppeteer-extra";
import fs from "fs";
import StealthPlugin from "puppeteer-extra-plugin-stealth";

puppeteer.use(StealthPlugin());

const HG_URL = "https://www.hga050.com";
const USERNAME = "johui888";
const PASSWORD = "aa123123";

const capturedRequests = [];
const MATCH_SCORE_KEYWORDS = ["match", "matches", "data", "list", "games", "fixtures", "event", "events", "game", "games", "inplay", "live"];
const MATCH_FIELD_KEYWORDS = ["homeTeam", "awayTeam", "home_team", "away_team", "team1", "team2", "home", "away", "score", "handicap", "odds", "corner"];

function isMatchRelatedResponseBody(text) {
  if (!text || text.length < 20) return false;
  const lower = text.toLowerCase();
  const hasMatchKeyword = MATCH_SCORE_KEYWORDS.some(kw => lower.includes(kw));
  const hasFieldKeyword = MATCH_FIELD_KEYWORDS.some(kw => lower.includes(kw));
  return hasMatchKeyword && hasFieldKeyword;
}

function analyzeJSONStructure(obj, path = "", depth = 0) {
  if (depth > 3 || obj === null || obj === undefined) return [];
  const results = [];
  if (typeof obj !== "object") return results;

  if (Array.isArray(obj)) {
    results.push({ path: path || "(root)", type: "array", length: obj.length });
    if (obj.length > 0 && typeof obj[0] === "object" && obj[0] !== null) {
      const keys = Object.keys(obj[0]);
      const hasTeamFields = keys.some(k => MATCH_FIELD_KEYWORDS.some(fk => k.toLowerCase().includes(fk)));
      if (hasTeamFields) {
        results.push({ path: path + "[0]", type: "object", keys });
      }
    }
    return results;
  }

  const keys = Object.keys(obj);
  results.push({ path: path || "(root)", type: "object", keys: keys.slice(0, 30) });

  for (const key of keys) {
    const val = obj[key];
    const childPath = path ? `${path}.${key}` : key;

    if (Array.isArray(val) && val.length > 0 && typeof val[0] === "object" && val[0] !== null) {
      results.push({ path: childPath, type: "array", length: val.length });
      const itemKeys = Object.keys(val[0]);
      const hasTeamFields = itemKeys.some(k => MATCH_FIELD_KEYWORDS.some(fk => k.toLowerCase().includes(fk)));
      if (hasTeamFields) {
        results.push({ path: childPath + "[0]", type: "object", keys: itemKeys.slice(0, 25), sample: val[0] });
      }
    } else if (typeof val === "object" && val !== null && !Array.isArray(val)) {
      results.push(...analyzeJSONStructure(val, childPath, depth + 1));
    }
  }
  return results;
}

function scoreMatchData(responseBody) {
  let score = 0;
  const lower = (responseBody || "").toLowerCase();

  if (lower.includes("hom") && lower.includes("away")) score += 30;
  if (lower.includes("score") || lower.includes("goal")) score += 20;
  if (lower.includes("corner") || lower.includes("角球")) score += 20;
  if (lower.includes("handicap") || lower.includes("让球")) score += 15;
  if (lower.includes("odds") || lower.includes("赔率") || lower.includes("盘口")) score += 15;
  if (lower.includes("match") || lower.includes("fixture") || lower.includes("game")) score += 10;
  if (lower.includes("inplay") || lower.includes("live") || lower.includes("滚球")) score += 10;
  if (lower.includes("team") || lower.includes("队")) score += 10;
  if (lower.includes("league") || lower.includes("联赛")) score += 5;
  if (lower.includes("transform.php")) score += 5;
  if (lower.includes("xml") || lower.includes("<game") || lower.includes("<match")) score += 10;

  return score;
}

// ======================== XML 解析工具函数（来自 xhrDataParser.js） ========================

function parseRETIMESET(retimeset) {
  if (!retimeset) return 0;
  if (retimeset.startsWith("MTIME")) return 0;
  const match = retimeset.match(/(\d+)H\^(\d+):\d+/);
  if (match) return parseInt(match[2], 10) || 0;
  return 0;
}

function extractGameFields(block) {
  const fields = {};
  const fieldRegex = /<(\w+)>(.*?)<\/\1>/g;
  let fm;
  while ((fm = fieldRegex.exec(block)) !== null) {
    fields[fm[1]] = fm[2];
  }
  return fields;
}

function parseMatchXML(xmlText) {
  if (!xmlText || typeof xmlText !== "string") return [];
  let matches = [];

  const originalMatch = xmlText.match(/<original>([\s\S]*?)<\/original>/);
  if (originalMatch) {
    try {
      const json = JSON.parse(originalMatch[1]);
      const gameKeys = Object.keys(json).filter(k => k.startsWith("GAME_"));
      for (const key of gameKeys) {
        const g = json[key];
        if (!g.TEAM_H || !g.TEAM_C) continue;
        matches.push(mapGameToMatch(g));
      }
    } catch (e) {}
  }

  if (matches.length > 0) return matches;

  const gameRegex = /<game\s[^>]*>([\s\S]*?)<\/game>/gi;
  let gm;
  while ((gm = gameRegex.exec(xmlText)) !== null) {
    const fields = extractGameFields(gm[1]);
    if (!fields.TEAM_H || !fields.TEAM_C) continue;
    matches.push(mapGameToMatch(fields));
  }

  if (matches.length > 0) return matches;

  try {
    const json = JSON.parse(xmlText);
    if (typeof json === "object" && json !== null) {
      const results = extractMatchArrays(json);
      return results;
    }
  } catch (_) {}

  return matches;
}

function mapGameToMatch(g) {
  return {
    matchId: String(g.GID || ""),
    homeTeam: g.TEAM_H || "",
    awayTeam: g.TEAM_C || "",
    league: g.LEAGUE || "",
    homeScore: parseInt(g.SCORE_H || 0, 10) || 0,
    awayScore: parseInt(g.SCORE_C || 0, 10) || 0,
    elapsedMinutes: parseRETIMESET(g.RETIMESET || g.retimeset || ""),
    isRunning: g.RUNNING === "Y" || g.running === "Y",
    handicapLine: g.RATIO_XROUO || g.RATIO_ROUHO || g.RATIO_ROUCO || "",
    handicapOdds: g.IOR_XROUO || g.IOR_ROUHO || g.IOR_ROUCO || "",
    _ecid: g.ECID || "",
    _hasCornerMarket: (g.sw_CRG === "Y") || (parseInt(g.CN_COUNT || "0") > 0),
    _cornerOULine: g.ratio_CROUO || g.RATIO_CROUO || "",
    _cornerOUOdds: g.ior_CROUO || g.IOR_CROUO || "",
    _hdpLine: g.RATIO_RE || "",
    _hdpHomeOdds: g.IOR_REH || "",
    _hdpAwayOdds: g.IOR_REC || "",
    _ouLine: g.RATIO_ROUO || "",
    _ouOverOdds: g.IOR_ROUH || "",
    _ouUnderOdds: g.IOR_ROUC || "",
  };
}

function extractMatchArrays(obj) {
  const results = [];
  if (!obj || typeof obj !== "object") return results;
  const scan = (data, depth) => {
    if (depth > 5) return;
    if (Array.isArray(data)) {
      for (const item of data) {
        if (item && typeof item === "object") {
          const homeField = item.homeTeam || item.home_team || item.TEAM_H || item.home || item.team1 || item.team_home;
          const awayField = item.awayTeam || item.away_team || item.TEAM_C || item.away || item.team2 || item.team_away;
          if (homeField && awayField) {
            results.push({
              matchId: String(item.GID || item.id || item.matchId || item.match_id || item.eventId || ""),
              homeTeam: String(homeField),
              awayTeam: String(awayField),
              league: item.LEAGUE || item.league || item.tournament || item.competition || "",
              homeScore: parseInt(item.SCORE_H || item.homeScore || item.score_home || item.score1 || 0, 10) || 0,
              awayScore: parseInt(item.SCORE_C || item.awayScore || item.score_away || item.score2 || 0, 10) || 0,
              elapsedMinutes: 0,
              isRunning: true,
              handicapLine: item.RATIO_XROUO || item.ratio_CROUO || item.corner_handicap || item.handicap || "",
              handicapOdds: item.IOR_XROUO || item.ior_CROUO || item.corner_odds || item.odds || "",
              _ecid: "",
              _hasCornerMarket: false,
              _cornerOULine: "",
              _cornerOUOdds: "",
              _hdpLine: item.RATIO_RE || item.hdp_line || item.RATIO_RE || item.hdp || "",
              _hdpHomeOdds: item.IOR_REH || item.ior_reh || item.iorReh || item.homeOdds || item.hdpHomeOdds || item.hdp_home_odds || "",
              _hdpAwayOdds: item.IOR_REC || item.ior_rec || item.iorRec || item.awayOdds || item.hdpAwayOdds || item.hdp_away_odds || "",
              _ouLine: item.RATIO_ROUO || item.ratio_rouo || item.ratioRouo || item.ou_line || item.ouLine || "",
              _ouOverOdds: item.IOR_ROUH || item.ior_rouh || item.iorRouh || item.overOdds || item.ouOverOdds || item.ou_over_odds || "",
              _ouUnderOdds: item.IOR_ROUC || item.ior_rouc || item.iorRouc || item.underOdds || item.ouUnderOdds || item.ou_under_odds || "",
            });
            if (results.length >= 50) return;
          } else {
            scan(item, depth + 1);
          }
        }
      }
    } else if (typeof data === "object") {
      for (const key of Object.keys(data)) {
        scan(data[key], depth + 1);
      }
    }
  };
  scan(obj, 0);
  return results;
}

async function callTransformAPI(page, uid, ver, rtype, apiMode = "get_game_list") {
  const ts = Date.now();
  const params = new URLSearchParams();
  if (apiMode === "service_mainget") {
    params.set("p", "service_mainget");
    params.set("ver", ver);
    params.set("langx", "en-us");
    params.set("login", "N");
    params.set("ts", String(ts));
  } else if (apiMode === "game_list_FT") {
    params.set("p", "game_list_FT");
    params.set("ver", ver);
    params.set("langx", "en-us");
    params.set("uid", uid);
    params.set("ts", String(ts));
    params.set("gtype", "ft");
    params.set("showtype", "live");
    if (rtype) params.set("rtype", rtype);
  } else {
    params.set("uid", uid);
    params.set("ver", ver);
    params.set("langx", "en-us");
    params.set("p", "get_game_list");
    params.set("gtype", "ft");
    params.set("showtype", "live");
    params.set("rtype", rtype);
    params.set("ltype", "3");
    params.set("sorttype", "L");
    params.set("ts", String(ts));
    params.set("chgSortTS", String(ts));
  }
  const label = apiMode === "service_mainget" ? "(service_mainget)" : apiMode === "game_list_FT" ? `(${rtype},game_list_FT)` : `(${rtype})`;
  const url = `https://www.hga050.com/transform.php?${params.toString()}`;
  try {
    const text = await Promise.race([
      page.evaluate(async (fetchUrl) => {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 15000);
        try {
          const resp = await fetch(fetchUrl, { method: "GET", credentials: "include", signal: controller.signal });
          clearTimeout(timeoutId);
          if (!resp.ok) return `[http_error:${resp.status}]`;
          return await resp.text();
        } catch (e) {
          clearTimeout(timeoutId);
          return `[fetch_error:${e.message}]`;
        }
      }, url),
      new Promise((_, reject) => setTimeout(() => reject(new Error("page.evaluate timeout")), 20000)),
    ]);
    if (text && (text.startsWith("[http_error") || text.startsWith("[fetch_error"))) {
      console.log(`  [API]${label} 错误: ${text}`);
      return null;
    }
    return text;
  } catch (e) {
    console.log(`  [API]${label} 请求失败: ${e.message}`);
    return null;
  }
}

async function fetchApiDataWithRetry(page, uid, ver) {
  const results = {};
  const types = [
    { key: "rb", rtype: "rb", label: "滚球基本盘" },
    { key: "rcn", rtype: "rcn", label: "角球盘口" },
    { key: "rrnou", rtype: "rrnou", label: "HDP/O/U 盘口" },
  ];
  for (const t of types) {
    console.log(`  [API] 请求 ${t.label} (rtype=${t.rtype})...`);
    const xml = await callTransformAPI(page, uid, ver, t.rtype);
    if (xml) {
      const parsed = parseMatchXML(xml);
      results[t.key] = { xml, matches: parsed, count: parsed.length };
      console.log(`  [API] ${t.label}: 返回 ${xml.length} 字节, 解析到 ${parsed.length} 场比赛`);
      if (parsed.length === 0 && xml.length > 0) {
        console.log(`  [API]   XML 前 300 字: ${xml.substring(0, 300)}`);
      }
    } else {
      results[t.key] = { xml: null, matches: [], count: 0 };
      console.log(`  [API] ${t.label}: 无响应`);
    }
  }

  if (!results.rb || results.rb.count === 0) {
    console.log(`\n  [API] p=get_game_list 全部无响应，尝试 p=game_list_FT (页面实际使用的接口)...`);
    for (const t of types) {
      const xml = await callTransformAPI(page, uid, ver, t.rtype, "game_list_FT");
      if (xml) {
        const parsed = parseMatchXML(xml);
        results[t.key] = { xml, matches: parsed, count: parsed.length };
        console.log(`  [API] game_list_FT(${t.label}): 返回 ${xml.length} 字节, 解析到 ${parsed.length} 场比赛`);
      } else {
        console.log(`  [API] game_list_FT(${t.label}): 无响应`);
      }
    }
  }

  if ((!results.rb || results.rb.count === 0) && (!results.service_mainget || results.service_mainget.count === 0)) {
    console.log(`\n  [API] game_list_FT 也无数据，尝试 service_mainget...`);
    const xml = await callTransformAPI(page, uid, ver, "", "service_mainget");
    if (xml) {
      const parsed = parseMatchXML(xml);
      results.service_mainget = { xml, matches: parsed, count: parsed.length };
      console.log(`  [API] service_mainget: 返回 ${xml.length} 字节, 解析到 ${parsed.length} 场比赛`);
      if (parsed.length === 0) {
        console.log(`  [API]   XML 前 500 字: ${xml.substring(0, 500)}`);
        try {
          const json = JSON.parse(xml);
          console.log(`  [API]   JSON 顶层键: ${Object.keys(json).slice(0, 20).join(", ")}`);
        } catch (_) {}
      }
    } else {
      console.log(`  [API] service_mainget: 无响应`);
    }
  }

  return results;
}

function mergeMatchData(rbMatches, rcnMatches, rrnouMatches) {
  if (!rbMatches || rbMatches.length === 0) return [];

  const rcnByGid = new Map();
  for (const m of rcnMatches) rcnByGid.set(m.matchId, m);

  const rrnouByGid = new Map();
  for (const m of rrnouMatches) rrnouByGid.set(m.matchId, m);

  return rbMatches.map((rb, idx) => {
    const gid = rb.matchId;
    const rcn = rcnByGid.get(gid);
    const rrn = rrnouByGid.get(gid);

    const ouLine = rcn && rcn._cornerOULine ? parseFloat(rcn._cornerOULine) : 0;
    const ouOdds = rcn && rcn._cornerOUOdds ? rcn._cornerOUOdds : "";

    return {
      rank: idx + 1,
      league: rb.league || "",
      homeTeam: rb.homeTeam || "",
      awayTeam: rb.awayTeam || "",
      homeScore: rb.homeScore || 0,
      awayScore: rb.awayScore || 0,
      time: rb.elapsedMinutes ? `${rb.elapsedMinutes}'` : "",
      cornerLine: ouLine > 0 ? ouLine.toFixed(1) : (rcn && rcn.handicapLine ? rcn.handicapLine : ""),
      cornerOdds: ouOdds || (rcn && rcn.handicapOdds ? rcn.handicapOdds : ""),
      hdpLine: rrn && rrn._hdpLine ? rrn._hdpLine : "",
      hdpHomeOdds: rrn && rrn._hdpHomeOdds ? rrn._hdpHomeOdds : "",
      hdpAwayOdds: rrn && rrn._hdpAwayOdds ? rrn._hdpAwayOdds : "",
      ouMainLine: rrn && rrn._ouLine ? rrn._ouLine : "",
      ouMainOver: rrn && rrn._ouOverOdds ? rrn._ouOverOdds : "",
      ouMainUnder: rrn && rrn._ouUnderOdds ? rrn._ouUnderOdds : "",
      hasCorner: !!(rcn && (rcn._hasCornerMarket || rcn.handicapLine || rcn._cornerOULine)),
      hasHdpOu: !!(rrn && rrn._hdpLine),
      dataQuality: rrn ? "full" : (rcn ? "partial" : "basic"),
      matchId: gid,
    };
  });
}

function printMatchTable(matches) {
  console.log("\n\n======================= 🏆 比赛数据结果 =======================");
  console.log(`共获取 ${matches.length} 场比赛\n`);

  if (matches.length === 0) return;

  const header = "Rank 联赛                     主队                 客队                 比分    时间  角球盘口    HDP        O/U";
  const sep = "---- ------------------------ -------------------- -------------------- ------- ----- ---------- ---------- ----------";
  console.log(header);
  console.log(sep);

  for (const m of matches.slice(0, 30)) {
    const league = (m.league || "").padEnd(24).substring(0, 24);
    const home = (m.homeTeam || "").padEnd(20).substring(0, 20);
    const away = (m.awayTeam || "").padEnd(20).substring(0, 20);
    const score = `${m.homeScore}-${m.awayScore}`.padEnd(7);
    const time = (m.time || "").padEnd(5);
    const corner = m.cornerLine ? `${m.cornerLine}@${m.cornerOdds}`.padEnd(10).substring(0, 10) : "-         ".substring(0, 10);
    const hdp = m.hdpLine ? `${m.hdpLine}@${m.hdpHomeOdds}`.padEnd(10).substring(0, 10) : "-         ".substring(0, 10);
    const ou = m.ouMainLine ? `${m.ouMainLine}@${m.ouMainOver}`.padEnd(10).substring(0, 10) : "-         ".substring(0, 10);

    console.log(`${String(m.rank).padEnd(4)} ${league} ${home} ${away} ${score} ${time} ${corner} ${hdp} ${ou}`);
  }

  const qualityCounts = { full: 0, partial: 0, basic: 0, passive: 0 };
  for (const m of matches) qualityCounts[m.dataQuality]++;
  console.log(`\n数据质量分布:`);
  console.log(`  full:    ${qualityCounts.full} 场 (含角球+HDP+O/U)`);
  console.log(`  partial: ${qualityCounts.partial} 场 (仅角球)`);
  console.log(`  basic:   ${qualityCounts.basic} 场 (仅基础信息)`);
  if (qualityCounts.passive > 0) console.log(`  passive: ${qualityCounts.passive} 场 (被动捕获)`);
  console.log("==============================================================\n");
}

async function extractUidVerFromPage(page) {
  // 优先从已有捕获的请求中提取 ver
  let ver = "";
  for (const req of capturedRequests) {
    const url = req.url || "";
    if ((url.includes("transform.php") || url.includes("transform_nl.php")) && url.includes("ver=")) {
      const match = url.match(/ver=([^&\s]+)/);
      if (match) { ver = match[1]; break; }
    }
  }
  // 回退：从页面全局变量
  if (!ver) {
    try {
      ver = await safeEvaluate(page, () => window.ver || top.ver || "") || "";
    } catch (_) {}
  }

  // uid 优先从 page.cookies() 获取（HttpOnly cookie 无法从 document.cookie 读取）
  let uid = "";
  try {
    const cookies = await page.cookies();
    const uidCookie = cookies.find(c => c.name === "uid");
    if (uidCookie) uid = uidCookie.value;
  } catch (_) {}
  // 回退：从捕获的请求 POST data 提取 uid
  if (!uid) {
    for (const req of capturedRequests) {
      const postData = req.postData || "";
      const m = postData.match(/uid=([^&]+)/);
      if (m) { uid = m[1]; break; }
    }
  }

  return { uid, ver };
}

async function waitForPageStable(page, ms = 2000) {
  await new Promise(r => setTimeout(r, ms));
}

async function safeClick(page, selector, description) {
  try {
    const el = await page.$(selector);
    if (el) {
      await el.scrollIntoView({ block: "center" });
      await el.click();
      console.log(`  ✓ 点击: ${description}`);
      return true;
    }
    return false;
  } catch (e) {
    console.log(`  ✗ 点击失败 ${description}: ${e.message}`);
    return false;
  }
}

async function safeEvaluate(page, fn, ...args) {
  try {
    return await page.evaluate(fn, ...args);
  } catch (e) {
    return null;
  }
}

async function handlePopups(page) {
  for (let i = 0; i < 3; i++) {
    const handled = await safeEvaluate(page, () => {
      let c = false;
      const isVisible = (el) => {
        const s = getComputedStyle(el);
        return s.display !== "none" && s.visibility !== "hidden";
      };
      document.querySelectorAll(".btn_cancel, #C_no_btn, #no_btn, #C_cancel_btn, [class*='cancel']").forEach(btn => {
        if (!isVisible(btn)) return;
        const t = (btn.textContent || "").trim().toUpperCase();
        if (t === "NO" || t === "否" || t === "CANCEL" || t === "取消") { btn.click(); c = true; }
      });
      document.querySelectorAll("#C_ok_btn, #ok_btn, #kick_ok_btn, #C_alert_confirm, #alert_confirm, .btn_confirm, .btn_sure").forEach(btn => {
        if (!isVisible(btn)) return;
        const t = (btn.textContent || "").trim().toUpperCase();
        if (t === "OK" || t === "确认" || t === "确定" || t === "是") { btn.click(); c = true; }
      });
      return c;
    });
    if (!handled) break;
    await waitForPageStable(page, 500);
  }
  try { await page.keyboard.press("Escape"); } catch (_) {}
}

async function loginToHG(page) {
  console.log("\n[登录] 开始登录...");
  await page.goto(HG_URL, { waitUntil: "domcontentloaded", timeout: 60000 });
  console.log("[登录] 页面加载完成");
  await waitForPageStable(page, 4000);

  for (let attempt = 0; attempt < 60; attempt++) {
    await handlePopups(page);
    await waitForPageStable(page, 800);

    const status = await safeEvaluate(page, () => {
      const bt = (document.body?.textContent || "");
      return {
        hasSuccess: bt.includes("My Events") || bt.includes("My Bets") ||
                    (bt.includes("In-Play") && bt.includes("Soccer")),
        hasLogin: (bt.includes("登入") || bt.includes("登录") || bt.includes("LOG IN")) &&
                  document.getElementById("usr") && getComputedStyle(document.getElementById("usr")).display !== "none",
        hasPasscodePage: (() => {
          const btn = document.getElementById("back_login");
          return btn && getComputedStyle(btn).display !== "none" && getComputedStyle(btn).visibility !== "hidden";
        })(),
      };
    });

    if (!status) continue;

    if (status.hasSuccess) {
      console.log("[登录] ✅ 成功（检测到已登录状态）");
      return true;
    }

    if (status.hasPasscodePage) {
      console.log("[登录] 检测到简易密码页面，点击普通登入...");
      await safeEvaluate(page, () => {
        const btn = document.querySelector("#back_login");
        if (btn) btn.click();
      });
      await waitForPageStable(page, 3000);
      continue;
    }

    if (status.hasLogin) {
      console.log("[登录] 填写用户名密码...");
      await page.evaluate((u, p) => {
        const usr = document.querySelector("#usr");
        const pwd = document.querySelector("#pwd");
        if (usr) { usr.value = u; usr.dispatchEvent(new Event("input", { bubbles: true })); }
        if (pwd) { pwd.value = p; pwd.dispatchEvent(new Event("input", { bubbles: true })); }
      }, USERNAME, PASSWORD);
      await waitForPageStable(page, 500);
      await safeClick(page, "#btn_login", "登录按钮");
      console.log("[登录] 已点击登录，等待验证...");
      continue;
    }

    if (attempt % 10 === 9) {
      const sample = await safeEvaluate(page, () => (document.body?.textContent || "").substring(0, 120));
      console.log(`[登录] 等待中... (${attempt + 1}/60) text: ${sample}`);
    }
  }

  console.log("[登录] ⚠ 超时");
  return false;
}

async function navigateToInPlay(page) {
  console.log("\n[导航] 导航到 In-Play 页面...");

  let clicked = await safeEvaluate(page, () => {
    const tab = document.getElementById("live_page");
    if (tab) { tab.click(); return true; }
    return false;
  });

  if (!clicked) {
    clicked = await safeEvaluate(page, () => {
      const all = document.querySelectorAll("a, button, span, div, li");
      for (const el of all) {
        const t = (el.textContent || "").trim().toUpperCase();
        const r = el.getBoundingClientRect();
        if (r.width < 10 || r.height < 8) continue;
        if (t.includes("IN-PLAY") || t.includes("INPLAY") || t.includes("滚球") || t === "LIVE") {
          el.scrollIntoView({ block: "center" });
          el.click();
          return true;
        }
      }
      return false;
    });
  }

  if (clicked) {
    console.log("[导航] ✓ In-Play 已点击");
    await waitForPageStable(page, 5000);
  } else {
    console.log("[导航] ⚠ 未找到 In-Play 按钮，尝试直接访问");
    const currentUrl = await page.url();
    console.log("[导航] 当前 URL:", currentUrl);
  }

  clicked = await safeEvaluate(page, () => {
    const btn = document.getElementById("symbol_ft") || document.getElementById("old_ft_live_league");
    if (btn) { btn.scrollIntoView({ block: "center" }); btn.click(); return true; }
    return false;
  });
  if (clicked) {
    console.log("[导航] 足球标签已点击，等待数据接口触发...");
    await waitForPageStable(page, 6000);

    // 主动滚动触发更多请求
    try {
      await page.evaluate(() => {
        window.scrollTo(0, document.body.scrollHeight / 2);
        setTimeout(() => window.scrollTo(0, 0), 500);
      });
    } catch (_) {}
    await waitForPageStable(page, 3000);

    console.log("[导航] 已触发数据加载，检查捕获到的 transform.php 请求...");
    const gameListCount = capturedRequests.filter(r =>
      (r.url || "").includes("get_game_list")
    ).length;
    console.log("[导航] 捕获到 " + gameListCount + " 条 get_game_list 请求");
  }
}

async function captureXHRResponses(page) {
  capturedRequests.length = 0;

  page.on("request", (request) => {
    const type = request.resourceType();
    if (type !== "xhr" && type !== "fetch" && type !== "websocket") return;
    capturedRequests.push({
      type: "request",
      url: request.url(),
      method: request.method(),
      headers: request.headers(),
      postData: request.postData(),
      timestamp: Date.now(),
      response: null,
      responseHeaders: null,
    });
  });

  page.on("response", async (response) => {
    const url = response.url();
    const req = response.request();
    const type = req.resourceType();
    if (type !== "xhr" && type !== "fetch" && type !== "websocket") return;

    const existing = capturedRequests.find(r => r.type === "request" && r.url === url && !r.response);
    if (!existing) {
      capturedRequests.push({
        type: "response_only",
        url,
        method: req.method(),
        status: response.status(),
        headers: response.headers(),
        response: null,
        responseHeaders: response.headers(),
        timestamp: Date.now(),
      });
    }

    let bodyText = "";
    try {
      bodyText = await response.text();
    } catch (e) {
      bodyText = `[error reading body: ${e.message}]`;
    }

    const contentType = response.headers()["content-type"] || "";
    const isTransformUrl = url.includes("transform.php") || url.includes("transform_nl.php");
    let parsed = null;
    let parseError = null;
    if (contentType.includes("json") || bodyText.startsWith("{") || bodyText.startsWith("[")) {
      try { parsed = JSON.parse(bodyText); }
      catch (e) { parseError = e.message; }
    }

    const responseBody = parsed ? JSON.stringify(parsed).substring(0, 8000) : bodyText.substring(0, 8000);

    if (existing) {
      existing.response = responseBody;
      existing.responseHeaders = response.headers();
      existing.status = response.status();
      existing.parsed = parsed;
      existing.parseError = parseError;
      existing.bodyLength = bodyText.length;
      existing.fullBody = bodyText;
    } else {
      const entry = capturedRequests.find(r => r.type === "response_only" && r.url === url);
      if (entry) {
        entry.response = responseBody;
        entry.parsed = parsed;
        entry.parseError = parseError;
        entry.bodyLength = bodyText.length;
        entry.fullBody = bodyText;
        entry.status = response.status();
      }
    }
  });
}

async function analyzeCapturedData() {
  console.log("\n\n========== 📊 网络请求分析报告 ==========");
  console.log(`共捕获 ${capturedRequests.length} 个 XHR/Fetch 请求`);
  console.log("");

  const matchCandidates = [];

  for (const req of capturedRequests) {
    const url = req.url || "";
    const shortUrl = url.length > 120 ? url.substring(0, 120) + "..." : url;
    const method = req.method || "GET";
    const status = req.status || "?";

    let responseText = "";
    if (req.parsed && typeof req.parsed === "object") {
      responseText = JSON.stringify(req.parsed);
    } else if (typeof req.response === "string") {
      responseText = req.response;
    } else if (req.fullBody) {
      responseText = req.fullBody;
    }

    const score = scoreMatchData(responseText || url);
    if (score > 0) {
      matchCandidates.push({ score, req, shortUrl, responseText });
    }

    console.log(`\n${method} ${status} | ${shortUrl}`);
    if (req.postData) {
      console.log(`  POST Body: ${(req.postData || "").substring(0, 300)}.substring(0, 300)}`);
    }
    if (req.responseHeaders) {
      const ct = req.responseHeaders["content-type"] || req.responseHeaders["Content-Type"] || "";
      console.log(`  Content-Type: ${ct}`);
      console.log(`  Body size: ${req.bodyLength || 0} chars`);
    }

    if (req.parsed && typeof req.parsed === "object") {
      const structure = analyzeJSONStructure(req.parsed);
      for (const s of structure) {
        console.log(`  └ ${s.path} → ${s.type}${s.keys ? ": " + s.keys.join(", ") : ""}${s.length !== undefined ? " [" + s.length + " items]" : ""}`);
        if (s.sample) {
          const jsonStr = JSON.stringify(s.sample, null, 2);
          console.log(`      sample: ${jsonStr.substring(0, 500)}`);
        }
      }
    } else if (req.fullBody && req.fullBody.length > 0) {
      const body = req.fullBody;
      if (body.trim().startsWith("<") || body.trim().startsWith("{") || body.trim().startsWith("[")) {
        console.log(`  Response body (${body.length} chars):\n${body.substring(0, 600)}`);
        if (body.length > 600) console.log(`  ... (truncated, ${body.length} total chars)`);
      } else {
        console.log(`  Response (text): ${body.substring(0, 300)}`);
      }
    } else if (req.parseError) {
      console.log(`  Parse error: ${req.parseError}`);
    }
  }

  console.log("\n\n========== 🏆 比赛数据接口候选排名 ==========");
  matchCandidates.sort((a, b) => b.score - a.score);

  if (matchCandidates.length === 0) {
    console.log("未检测到包含比赛数据的接口。");
    console.log("尝试从 DOM 提取比赛数据...");
    return [];
  }

  console.log("按置信度排序（分数越高越可能是比赛数据接口）：");
  console.log("");
  const seen = new Set();
  let rank = 0;
  for (const candidate of matchCandidates) {
    if (seen.has(candidate.shortUrl)) continue;
    seen.add(candidate.shortUrl);
    rank++;
    const stars = candidate.score >= 80 ? "★★★★★" :
                  candidate.score >= 60 ? "★★★★" :
                  candidate.score >= 40 ? "★★★" :
                  candidate.score >= 20 ? "★★" : "★";
    console.log(`${rank}. [${candidate.score}分 ${stars}] ${candidate.req.method || "GET"} ${candidate.shortUrl}`);
    if (candidate.req.postData) {
      console.log(`   POST Body: ${candidate.req.postData.substring(0, 200)}`);
    }

    if (candidate.req.parsed && typeof candidate.req.parsed === "object") {
      const structure = analyzeJSONStructure(candidate.req.parsed);
      const matchArrays = structure.filter(s => s.type === "array" && s.keys);
      for (const arr of matchArrays) {
        const hasNameFields = arr.keys.some(k => /home|away|team|match|score|corner/i.test(k));
        if (hasNameFields) {
          console.log(`   📦 数据数组: ${arr.path} (${arr.length} items)`);
          console.log(`   📋 字段列表: ${arr.keys.slice(0, 20).join(", ")}`);
        }
      }
    }

    if (candidate.req.bodyLength) {
      console.log(`   📏 响应大小: ${candidate.req.bodyLength} bytes`);
    }
    console.log("");
  }

  console.log("\n========== ✅ 结论 ==========");
  if (matchCandidates.length > 0) {
    const top = matchCandidates[0];
    console.log(`最可能的比赛数据接口:`);
    console.log(`  URL: ${top.req.url}`);
    console.log(`  方法: ${top.req.method || "GET"}`);
    console.log(`  置信度: ${top.score}/100 分`);
    if (top.req.postData) {
      console.log(`  请求体: ${top.req.postData.substring(0, 500)}`);
    }
    console.log("");
    console.log("提示: 如果 transform.php 是主要接口，尝试在浏览器中直接调用：");
    console.log(`  fetch("${top.req.url}", { credentials: "include" }).then(r => r.text()).then(console.log)`);
  }

  console.log("\n\n========== 🔄 被动捕获的 XML 解析尝试 ==========");
  const printedUrls = new Set();
  for (const req of capturedRequests) {
    const url = req.url || "";
    if (!url.includes("transform")) continue;
    if (!req.fullBody || !req.fullBody.trim().startsWith("<")) continue;

    const bodyHash = req.fullBody.substring(0, 200);
    if (printedUrls.has(bodyHash)) continue;
    printedUrls.add(bodyHash);

    const parsed = parseMatchXML(req.fullBody);
    if (parsed.length > 0) {
      console.log(`从 ${url.substring(0, 80)}... 解析到 ${parsed.length} 场比赛`);
      const simpleMatches = parsed.map((m, i) => ({
        rank: i + 1,
        league: m.league || "",
        homeTeam: m.homeTeam || "",
        awayTeam: m.awayTeam || "",
        homeScore: m.homeScore || 0,
        awayScore: m.awayScore || 0,
        time: m.elapsedMinutes ? `${m.elapsedMinutes}'` : "",
        cornerLine: m.handicapLine || "",
        cornerOdds: m.handicapOdds || "",
        hdpLine: m._hdpLine || "",
        hdpHomeOdds: m._hdpHomeOdds || "",
        hdpAwayOdds: m._hdpAwayOdds || "",
        ouMainLine: m._ouLine || "",
        ouMainOver: m._ouOverOdds || "",
        ouMainUnder: m._ouUnderOdds || "",
        hasCorner: !!m._hasCornerMarket || !!m.handicapLine,
        hasHdpOu: !!m._hdpLine,
        dataQuality: "passive",
        matchId: m.matchId,
      }));
      printMatchTable(simpleMatches);
    } else {
      console.log(`从 ${url.substring(0, 80)}... 未解析到比赛数据 (XML ${req.fullBody.length} 字节)`);
    }
  }

  return matchCandidates;
}

async function extractDOMData(page) {
  console.log("\n[DOM] 尝试从页面提取比赛数据...");
  await waitForPageStable(page, 3000);

  const domInfo = await safeEvaluate(page, () => {
    const info = {
      url: window.location.href,
      title: document.title,
      bodyText: (document.body?.textContent || "").replace(/\s+/g, " ").trim().substring(0, 500),
      matchElements: 0,
      sampleHTML: "",
      leagueNames: [],
      teamNames: [],
      scoreData: [],
    };

    const allEls = document.querySelectorAll("div.box_lebet, div.bet_box, div[class*='game'], div[class*='match']");
    info.matchElements = allEls.length;
    if (allEls.length > 0) {
      info.sampleHTML = allEls[0].outerHTML.substring(0, 1000);
    }

    document.querySelectorAll("tt#lea_name, .lea_name, [class*='lea']").forEach(el => {
      const t = (el.textContent || "").trim();
      if (t && t.length < 50) info.leagueNames.push(t);
    });

    document.querySelectorAll("span.text_team, [class*='team'] span, div[class*='team']").forEach(el => {
      const t = (el.textContent || "").trim();
      if (t && t.length > 1 && t.length < 40) info.teamNames.push(t);
    });

    document.querySelectorAll("div.box_score span.text_point, span[class*='point']").forEach(el => {
      info.scoreData.push((el.textContent || "").trim());
    });

    return info;
  });

  if (domInfo) {
    console.log(`  URL: ${domInfo.url}`);
    console.log(`  标题: ${domInfo.title}`);
    console.log(`  比赛容器数: ${domInfo.matchElements}`);
    console.log(`  找到联赛: [${domInfo.leagueNames.slice(0, 10).join(", ")}${domInfo.leagueNames.length > 10 ? "..." : ""}]`);
    console.log(`  找到球队: [${domInfo.teamNames.slice(0, 10).join(", ")}${domInfo.teamNames.length > 10 ? "..." : ""}]`);
    console.log(`  比分数据: [${domInfo.scoreData.slice(0, 10).join(", ")}]`);
    if (domInfo.sampleHTML) {
      console.log(`  比赛容器 HTML 样例:\n${domInfo.sampleHTML}`);
    }
    console.log(`  页面文本摘要: ${domInfo.bodyText.substring(0, 300)}`);
  }

  return domInfo;
}

async function main() {
  console.log("═══════════════════════════════════════════");
  console.log("  hga050.com API 发现工具");
  console.log("═══════════════════════════════════════════");
  console.log(`  用户: ${USERNAME}`);
  console.log(`  目标: ${HG_URL}`);
  console.log("═══════════════════════════════════════════\n");

  const browser = await puppeteer.launch({
    headless: false,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-gpu",
      "--window-size=1920,1400",
      "--disable-blink-features=AutomationControlled",
      "--lang=zh-CN,zh",
    ],
    timeout: 120000,
  });

  const page = await browser.newPage();
  await page.setUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36");
  await page.setViewport({ width: 1920, height: 1400 });
  await page.evaluateOnNewDocument(() => {
    Object.defineProperty(navigator, "webdriver", { get: () => false });
    Object.defineProperty(navigator, "plugins", { get: () => [1, 2, 3, 4, 5] });
    Object.defineProperty(navigator, "languages", { get: () => ["zh-CN", "zh"] });
    Object.defineProperty(navigator, "platform", { get: () => "Win32" });
  });

  await captureXHRResponses(page);

  const loginOk = await loginToHG(page);
  if (!loginOk) {
    console.log("[主流程] 登录失败，尝试继续...");
  }

  await navigateToInPlay(page);

  // ========== ★ 新增：提取 uid/ver 并主动调用 API ==========
  console.log("\n[API] 提取 uid/ver 参数...");
  let uid = "";
  let ver = "";

  const cookies = await page.cookies();
  const uidCookie = cookies.find(c => c.name === "uid");
  if (uidCookie) uid = uidCookie.value;
  console.log(`  uid: ${uid ? uid.substring(0, 8) + "..." : "未找到"}`);

    const uidVer = await extractUidVerFromPage(page);
  uid = uidVer.uid || uid;
  ver = uidVer.ver || ver;
  if (!ver) {
    try {
      await page.evaluate(() => {
        const els = document.querySelectorAll("script");
        for (const el of els) {
          if (el.textContent && el.textContent.includes("ver=")) {
            const m = el.textContent.match(/ver\s*[:=]\s*['"]([^'"]+)['"]/);
            if (m) { window.__found_ver = m[1]; break; }
          }
        }
      });
      ver = await safeEvaluate(page, () => window.__found_ver || "");
    } catch (_) {}
  }
  console.log(`  ver: ${ver ? ver.substring(0, 20) + "..." : "未找到"}`);

  let apiMatches = [];
  if (uid && ver) {
    console.log("\n[API] 主动调用 transform.php 获取比赛数据...");
    const apiResults = await fetchApiDataWithRetry(page, uid, ver);

    const rbData = apiResults.rb || { matches: [] };
    const rcnData = apiResults.rcn || { matches: [] };
    const rrnouData = apiResults.rrnou || { matches: [] };

    if (rbData.matches.length > 0) {
      apiMatches = mergeMatchData(rbData.matches, rcnData.matches, rrnouData.matches);
      printMatchTable(apiMatches);
    } else if (apiResults.service_mainget && apiResults.service_mainget.matches.length > 0) {
      console.log("\n[API] service_mainget 返回了比赛数据！");
      apiMatches = apiResults.service_mainget.matches.map((m, i) => ({
        rank: i + 1,
        league: m.league || "",
        homeTeam: m.homeTeam || "",
        awayTeam: m.awayTeam || "",
        homeScore: m.homeScore || 0,
        awayScore: m.awayScore || 0,
        time: m.elapsedMinutes ? `${m.elapsedMinutes}'` : "",
        cornerLine: m.handicapLine || "",
        cornerOdds: m.handicapOdds || "",
        hdpLine: m._hdpLine || "",
        hdpHomeOdds: m._hdpHomeOdds || "",
        hdpAwayOdds: m._hdpAwayOdds || "",
        ouMainLine: m._ouLine || "",
        ouMainOver: m._ouOverOdds || "",
        ouMainUnder: m._ouUnderOdds || "",
        hasCorner: !!m._hasCornerMarket,
        hasHdpOu: !!m._hdpLine,
        dataQuality: "basic",
        matchId: m.matchId,
      }));
      printMatchTable(apiMatches);
    } else {
      console.log("\n[API] 主动调用未解析到比赛数据，将使用被动捕获的数据");
    }
  } else {
    console.log("\n[API] uid 或 ver 缺失，跳过主动 API 调用，将使用被动捕获的数据");
  }

  // ========== 后续：原有被动分析流程 ==========
  console.log("\n[等待] 等待数据加载（10秒）...");
  for (let i = 0; i < 10; i++) {
    await waitForPageStable(page, 1000);
    await handlePopups(page);
    if (i === 3 || i === 7) {
      try {
        await page.evaluate(() => {
          window.scrollTo(0, document.body.scrollHeight);
          setTimeout(() => window.scrollTo(0, 0), 500);
        });
      } catch (_) {}
    }
  }

  console.log(`\n已捕获 ${capturedRequests.length} 个网络请求，开始分析...`);

  const candidates = await analyzeCapturedData();

  if (candidates.length === 0) {
    console.log("\n[DOM Fallback] 网络请求中未发现比赛数据，尝试从 DOM 提取...");
    await extractDOMData(page);
  }

  try {
    await page.screenshot({ path: "debug-hga-final.png", fullPage: true });
    console.log("\n[截图] 已保存: debug-hga-final.png");
  } catch (_) {}

  // Save results to JSON
  const resultData = {
    meta: {
      target: HG_URL,
      timestamp: new Date().toISOString(),
      totalCaptured: capturedRequests.length,
      wsCount: 0,
      matchApiCount: capturedRequests.filter(r => (r.url || "").includes("get_game_list")).length,
      staticAborted: 0,
    },
    apiCalls: apiMatches.length > 0 ? apiMatches.slice(0, 30) : [],
    allCaptured: capturedRequests.slice(0, 20).map(r => ({
      url: r.url?.substring(0, 200),
      method: r.method,
      status: r.status,
      contentType: r.responseHeaders?.["content-type"] || "",
      bodyPreview: (r.fullBody || "").substring(0, 500),
      bodySize: r.bodyLength || 0,
    })),
  };
  try {
    fs.writeFileSync("output/find-hga-result.json", JSON.stringify(resultData, null, 2), "utf8");
    console.log("\n[输出] 已保存到 output/find-hga-result.json");
  } catch (e) {
    console.log("\n[输出] 保存失败:", e.message);
  }

  console.log("\n═══════════════════════════════════════════");
  console.log("  分析完成");
  console.log("═══════════════════════════════════════════\n");

  await browser.close();
  process.exit(0);
}

main().catch(err => {
  console.error("\n[错误]", err.message);
  console.error(err.stack);
  process.exit(1);
});
