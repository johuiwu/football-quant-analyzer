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


// ---- 辅助：解析 RETIMESET + MORE 为比赛分钟数 ----
function parseMatchTime(retimeset, more) {
  if (!retimeset) {
    const m = parseInt(more) || 0;
    return m > 0 ? m : 0;
  }
  const match = retimeset.match(/(\d)H\^(\d+):(\d+)/);
  if (match) {
    const half = parseInt(match[1]);
    const min = parseInt(match[2]);
    const sec = parseInt(match[3]);
    if (half === 1) return min + sec / 60;
    if (half === 2) return 45 + min + sec / 60;
    return min + sec / 60;
  }
  const otMatch = retimeset.match(/OT\^(\d+):(\d+)/);
  if (otMatch) return 90 + parseInt(otMatch[1]) + parseInt(otMatch[2]) / 60;
  if (retimeset.includes("HT")) return 45;
  const m = parseInt(more) || 0;
  return m > 0 ? m : 0;
}

// ---- 解析 game_list XML（rcn / rb / rrnou 接口返回） ----
export function parseGameListXML(xmlText, contextHint = "") {
  if (!xmlText || typeof xmlText !== "string") {
    return { success: false, matches: [], source: "xml", count: 0 };
  }

  try {
    const gameRegex = /<game[^>]*>([\s\S]*?)<\/game>/gi;
    const matches = [];
    let gameMatch;

    while ((gameMatch = gameRegex.exec(xmlText)) !== null) {
      const gameBlock = gameMatch[1];

      const getTag = (tag) => {
        const re = new RegExp("<" + tag + "[^>]*>([^<]*)<\/" + tag + ">", "i");
        const m = gameBlock.match(re);
        return m ? m[1].trim() : "";
      };

      const homeTeam = getTag("TEAM_H");
      const awayTeam = getTag("TEAM_C");
      if (!homeTeam || !awayTeam) continue;

      const gid = getTag("GID");
      const league = getTag("LEAGUE");
      const scoreH = parseInt(getTag("SCORE_H")) || 0;
      const scoreC = parseInt(getTag("SCORE_C")) || 0;
      const retimeset = getTag("RETIMESET");
      const more = getTag("MORE");
      const elapsedMinutes = parseMatchTime(retimeset, more);
      const datetime = getTag("DATETIME");
      const running = getTag("RUNNING") === "Y";

      // HDP 让球盘
      const ratioRe = getTag("RATIO_RE");
      const iorReh = getTag("IOR_REH");
      const iorRec = getTag("IOR_REC");
      // OU 大小球
      const ratioRouo = getTag("RATIO_ROUO");
      const iorRouh = getTag("IOR_ROUH");
      const iorRouc = getTag("IOR_ROUC");
      // 角球盘口 (rcn 才有)
      const cnCount = getTag("CN_COUNT");
      const ratioCrOuo = getTag("ratio_CROUO") || getTag("RATIO_CROUO");
      const iorCrOuo = getTag("ior_CROUO") || getTag("IOR_CROUO");
      const iorCrOuu = getTag("ior_CROUU") || getTag("IOR_CROUU");
      const ratioCornerHdp = getTag("RATIO_CORNERHDP");
      const iorCornerH = getTag("IOR_CORNERH");
      const iorCorner = getTag("IOR_CORNER");
      // 半场
      const ratioHre = getTag("RATIO_HRE");
      const iorHreh = getTag("IOR_HREH");
      const iorHrec = getTag("IOR_HREC");
      const ratioHrouo = getTag("RATIO_HROUO");
      const iorHrouh = getTag("IOR_HROUH");
      const iorHrouc = getTag("IOR_HROUC");
      // 角球胜负
      const iorRgh = getTag("IOR_RGH");
      const iorRgc = getTag("IOR_RGC");
      const iorRgn = getTag("IOR_RGN");
      // IDs
      const ecid = getTag("ECID");
      const hgid = getTag("HGID");
      const gidm = getTag("GIDM");

      matches.push({
        matchId: gid || ("xml_" + matches.length),
        homeTeam, awayTeam, league,
        time: datetime,
        elapsedMinutes,
        homeScore: scoreH,
        awayScore: scoreC,
        totalCorners: 0,
        cornerHomeCount: 0,
        cornerAwayCount: 0,
        _hdpLine: ratioRe,
        _hdpHomeOdds: iorReh,
        _hdpAwayOdds: iorRec,
        _ouLine: ratioRouo,
        _ouOverOdds: iorRouh,
        _ouUnderOdds: iorRouc,
        // 角球让球盘（数字格式，与 DOM 输出对齐）
        cornerHandicap: ratioCornerHdp ? parseAsianHandicap(ratioCornerHdp) : 0,
        cornerOdds: parseFloat(iorCornerH) || 0,
        hasCornerOdds: !!(ratioCornerHdp || ratioCrOuo),
        // 角球让球盘（详细字段）
        _cornerHdpLine: ratioCornerHdp,
        _cornerHdpHomeOdds: iorCornerH,
        _cornerHdpAwayOdds: iorCorner,
        // 角球大小
        _cornerOULine: ratioCrOuo,
        _cornerOUOdds: iorCrOuo,
        _cornerOUUnderOdds: iorCrOuu,
        _hasCornerMarket: !!(cnCount && parseInt(cnCount) > 0),
        _cornerHomeOdds: iorRgh,
        _cornerAwayOdds: iorRgc,
        _cornerDrawOdds: iorRgn,
        _htHdpLine: ratioHre,
        _htHdpHomeOdds: iorHreh,
        _htHdpAwayOdds: iorHrec,
        _htOuLine: ratioHrouo,
        _htOuOverOdds: iorHrouh,
        _htOuUnderOdds: iorHrouc,
        ecid, hgid, gidm,
        running,
        _dataSource: "xml",
        _cornerSource: "xml",
        dataQuality: "full",
        timestamp: Date.now(),
        triggeredStrategies: [],
        handicaps: [],
        leagueId: "",
        leagueName: league,
      });
    }

    console.log("[xhrParser] parseGameListXML: " + matches.length + " 场比赛 (" + (contextHint || "?") + ", " + (xmlText ? xmlText.length : 0) + " bytes)");

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
