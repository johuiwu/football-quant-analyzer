// ======================== XHR 数据解析器 ========================
// 从 capturedResponses 中提取比赛和盘口数据
// 不依赖 DOM，纯 JSON 解析

import { parseAsianHandicap } from "./crawlerShared.js";

// ---- 辅助：字段名归一化 ----
const TEAM_FIELDS_HOME = ["home", "homeTeam", "home_team", "team1", "team_home", "h_name", "homeName", "name_home", "team_h", "home_name"];
const TEAM_FIELDS_AWAY = ["away", "awayTeam", "away_team", "team2", "team_away", "a_name", "awayName", "name_away", "team_a", "away_name"];
const SCORE_FIELDS_HOME = ["homeScore", "home_score", "score_home", "score1", "h_score"];
const SCORE_FIELDS_AWAY = ["awayScore", "away_score", "score_away", "score2", "a_score"];
const CORNER_FIELDS_HOME = ["homeCorners", "home_corners", "corner_home", "corner1"];
const CORNER_FIELDS_AWAY = ["awayCorners", "away_corners", "corner_away", "corner2"];
const TIMER_FIELDS = ["timer", "elapsed", "minute", "elapsedMinutes", "time", "matchTime"];
const HANDICAP_FIELDS = ["corner_handicap", "cornerHandicap", "handicap", "hdp", "line"];
const ODDS_FIELDS = ["corner_odds", "cornerOdds", "odds", "ior"];

function pickField(obj, fields) {
  for (const f of fields) {
    if (obj[f] !== undefined && obj[f] !== null) return obj[f];
  }
  return undefined;
}

// ---- 辅助：映射单条 API 数据到统一格式 ----
function mapToCornerMatch(apiMatch) {
  const matchId = String(
    apiMatch.id || apiMatch.match_id || apiMatch.matchId || apiMatch._id ||
    apiMatch.event_id || apiMatch.eventId || apiMatch.game_id || apiMatch.gameId || ""
  );
  const homeTeam = pickField(apiMatch, TEAM_FIELDS_HOME) || "";
  const awayTeam = pickField(apiMatch, TEAM_FIELDS_AWAY) || "";
  if (!homeTeam || !awayTeam) return null;

  let elapsedMinutes = 0;
  const timer = pickField(apiMatch, TIMER_FIELDS);
  if (typeof timer === "number") elapsedMinutes = timer;
  else if (typeof timer === "string") {
    const parts = timer.split(":");
    elapsedMinutes = parts.length === 2 ? parseInt(parts[0], 10) || 0 : parseInt(timer, 10) || 0;
  }

  return {
    matchId, homeTeam, awayTeam, elapsedMinutes,
    homeScore: parseInt(pickField(apiMatch, SCORE_FIELDS_HOME) || 0, 10) || 0,
    awayScore: parseInt(pickField(apiMatch, SCORE_FIELDS_AWAY) || 0, 10) || 0,
    homeCorners: parseInt(pickField(apiMatch, CORNER_FIELDS_HOME) || 0, 10) || 0,
    awayCorners: parseInt(pickField(apiMatch, CORNER_FIELDS_AWAY) || 0, 10) || 0,
    handicap: parseFloat(pickField(apiMatch, HANDICAP_FIELDS) || 0) || 0,
    odds: parseFloat(pickField(apiMatch, ODDS_FIELDS) || 0) || 0,
    _source: "xhr",
    strategy: []
  };
}

// ---- 辅助：选择最佳响应 ----
function pickBestResponse(captured) {
  if (!captured || captured.length === 0) return null;
  const scored = captured.map(c => {
    let score = 0;
    const sample = c.matchList[0] || {};
    if (sample.home || sample.homeTeam || sample.home_team || sample.team1) score += 10;
    if (sample.away || sample.awayTeam || sample.away_team || sample.team2) score += 10;
    if ("corner_handicap" in sample || "cornerHandicap" in sample || "handicap" in sample) score += 15;
    if ("corner_odds" in sample || "cornerOdds" in sample || "odds" in sample) score += 10;
    score += Math.min(c.itemCount, 50) * 0.1;
    const url = (c.url || "").toLowerCase();
    if (url.includes("live")) score += 5;
    if (url.includes("corner")) score += 5;
    if (url.includes("match")) score += 3;
    return { ...c, score };
  });
  scored.sort((a, b) => b.score - a.score);
  return scored[0];
}

// ---- 主入口：解析 XHR 响应 ----
export function parseXHRResponses(capturedResponses) {
  if (!capturedResponses || capturedResponses.length === 0) {
    console.log("[xhrParser] 无 captured responses");
    return { success: false, matches: [], source: "xhr", count: 0 };
  }

  const best = pickBestResponse(capturedResponses);
  if (!best || !best.matchList || best.matchList.length === 0) {
    console.log("[xhrParser] pickBestResponse 返回空");
    return { success: false, matches: [], source: "xhr", count: 0 };
  }

  const matches = best.matchList
    .map(mapToCornerMatch)
    .filter(m => m && m.homeTeam && m.awayTeam);

  console.log("[xhrParser] 解析到 " + matches.length + " 场比赛 (来自 " + best.url?.substring(0, 100) + ")");

  return {
    success: matches.length > 0,
    matches,
    source: "xhr",
    count: matches.length,
    rawUrl: best.url,
    rawItemCount: best.itemCount
  };
}

// ---- 导出辅助函数供外部使用 ----
export { mapToCornerMatch, pickBestResponse };


// ---- 解析 game_list XML（rcn / rrnou / rb 接口返回） ----
export function parseGameListXML(xmlText) {
  if (!xmlText || typeof xmlText !== "string") {
    return { success: false, matches: [], source: "xml", count: 0 };
  }

  try {
    // 用正则提取所有 <game> 元素
    const gameRegex = /<game[^>]*>([\s\S]*?)<\/game>/gi;
    const matches = [];
    let gameMatch;

    while ((gameMatch = gameRegex.exec(xmlText)) !== null) {
      const gameBlock = gameMatch[1];
      
      // 提取关键字段
      const getTag = (tag) => {
        const re = new RegExp("<" + tag + "[^>]*>([^<]*)</" + tag + ">", "i");
        const m = gameBlock.match(re);
        return m ? m[1].trim() : "";
      };

      const homeTeam = getTag("TEAM_H");
      const awayTeam = getTag("TEAM_C");
      const gid = getTag("GID");
      const league = getTag("LEAGUE");
      const scoreH = parseInt(getTag("SCORE_H")) || 0;
      const scoreC = parseInt(getTag("SCORE_C")) || 0;
      const retimeset = getTag("RETIMESET");

      if (homeTeam && awayTeam) {
        matches.push({
          GID: gid,
          homeTeam,
          awayTeam,
          league,
          scoreH,
          scoreC,
          retimeset,
        });
      }
    }

    return {
      success: matches.length > 0,
      matches,
      source: "xml",
      count: matches.length,
    };
  } catch (e) {
    console.error("[xhrParser] parseGameListXML error:", e.message);
    return { success: false, matches: [], source: "xml", count: 0, error: e.message };
  }
}
