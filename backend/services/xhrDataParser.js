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

  // ★ 诊断 XML 结构
  const hasGameTag = /<game[^>]*>/.test(xmlText);
  const hasServerResponse = xmlText.includes("<serverresponse");
  const gameNCount = (xmlText.match(/<GAME_\d+>/g) || []).length;
  const plainGameCount = (xmlText.match(/<game[\s>]/g) || []).length;
  const dataCountMatch = xmlText.match(/<dataCount>(\d+)<\/dataCount>/);
  const dataCount = dataCountMatch ? dataCountMatch[1] : "?";
  console.log("[xhrParser] XML 诊断 (" + contextHint + "): " + xmlText.length + " bytes, " +
    "serverresponse=" + hasServerResponse + ", dataCount=" + dataCount +
    ", GAME_N=" + gameNCount + ", <game>=" + plainGameCount);

  // ★ 检测 HTML 响应（服务器返回 HTML 页面而非 XML 数据）
  if (xmlText.includes("<!DOCTYPE html>") || xmlText.trimStart().startsWith("<!")) {
    console.error("[xhrParser] 收到 HTML 响应而非 XML！服务器未返回数据格式 (" + contextHint + ")");
    return { success: false, matches: [], source: "xml", count: 0, error: "html_response" };
  }

  // ★ 增强诊断：输出前 2000 字符中的标签结构
  const tagSample = xmlText.substring(0, 2000).match(/<(\w+)[\s>]/g);
  const uniqueTags = [...new Set((tagSample || []).map(t => t.trim()))].slice(0, 20);
  console.log("[xhrParser] XML 前 2000 字符中的标签: " + uniqueTags.join(", "));

  // ★ 新路径：从 <original> 标签提取 JSON 数据（get_game_list API 返回格式）
  const originalMatch = xmlText.match(/<original>([\s\S]*?)<\/original>/);
  if (originalMatch) {
    console.log("[xhrParser] 发现 <original> 标签，尝试 JSON 解析 (" + contextHint + ")...");
    try {
      const jsonStr = originalMatch[1].trim();
      const gameData = JSON.parse(jsonStr);
      const gameKeys = Object.keys(gameData).filter(k => k.startsWith("GAME_"));
      console.log("[xhrParser] <original> JSON 解析成功: " + gameKeys.length + " 场比赛 (" + contextHint + ")");

      const matches = [];
      for (const key of gameKeys) {
        const g = gameData[key];
        const homeTeam = g.TEAM_H || "";
        const awayTeam = g.TEAM_C || "";
        if (!homeTeam || !awayTeam) continue;

        const gid = g.GID || "";
        const league = g.LEAGUE || "";
        const scoreH = parseInt(g.SCORE_H) || 0;
        const scoreC = parseInt(g.SCORE_C) || 0;
        const retimeset = g.RETIMESET || "";
        const more = g.MORE || "";
        const elapsedMinutes = parseMatchTime(retimeset, more);
        const datetime = g.DATETIME || g.GAME_DATE_TIME || "";
        const running = g.RUNNING === "Y";

        // HDP 让球盘
        const ratioRe = g.RATIO_RE || "";
        const iorReh = g.IOR_REH || "";
        const iorRec = g.IOR_REC || "";
        // OU 大小球
        const ratioRouo = g.RATIO_ROUO || "";
        const iorRouh = g.IOR_ROUH || "";
        const iorRouc = g.IOR_ROUC || "";
        // 角球盘口 (rcn 才有)
        // ★ 关键修正：rcn 响应中，RATIO_RE 是角球让球盘口线，IOR_REH/IOR_REC 是角球让球赔率
        // ★ IOR_RNCH/IOR_RNCC 是 Next Corner（下个角球）赔率
        // ★ IOR_REOE/IOR_REOO 是角球单/双赔率
        // ★ RATIO_HRE/IOR_HREH/IOR_HREC 是角球半场让球（rcn有字段但可能为空）
        // ★ RATIO_HROUO/IOR_HROUH/IOR_HROUC 是角球半场大小（rcn有字段但可能为空）
        // ★ PTYPE 包含 "Corners" 标识角球市场
        // ★ rcn 中无角球独赢(IOR_RGH等)字段
        const ptype = g.PTYPE || "";
        // ★ 根据 contextHint 区分：rb 是基本盘数据（不含角球），cn/rcn 是角球数据
        const isCornerContext = contextHint === "cn" || contextHint === "rcn";
        const isCornerMarket = isCornerContext && (ptype.includes("Corners") || !!(g.IOR_RNCH || g.IOR_RNCC));
        // 角球让球盘（rcn 中 RATIO_RE 即角球让球线，IOR_REH/IOR_REC 即角球让球赔率）
        // ★ 角球字段：只在 cn/rcn 上下文中填充，rb 数据不填充（避免 RATIO_RE 被误认为角球让球线）
        const ratioCornerHdp = isCornerContext ? (g.RATIO_RE || "") : "";
        const iorCornerH = isCornerContext ? (g.IOR_REH || "") : "";
        const iorCorner = isCornerContext ? (g.IOR_REC || "") : "";
        // 角球大小盘（rcn 中 RATIO_ROUO/IOR_ROUH/IOR_ROUC 即角球大小盘）
        const ratioCrOuo = isCornerContext ? (g.RATIO_ROUO || "") : "";
        const iorCrOuo = isCornerContext ? (g.IOR_ROUH || "") : "";
        const iorCrOuu = isCornerContext ? (g.IOR_ROUC || "") : "";
        // Next Corner（下个角球）- IOR_RNCH/IOR_RNCC
        const iorNextCornerH = isCornerContext ? (g.IOR_RNCH || "") : "";
        const iorNextCornerC = isCornerContext ? (g.IOR_RNCC || "") : "";
        // 角球半场让球（rcn 中有 RATIO_HRE/IOR_HREH/IOR_HREC 字段但可能为空）
        const ratioCornerHtHdp = isCornerContext ? (g.RATIO_HRE || "") : "";
        const iorCornerHtHdpH = isCornerContext ? (g.IOR_HREH || "") : "";
        const iorCornerHtHdpC = isCornerContext ? (g.IOR_HREC || "") : "";
        // 角球半场大小（rcn 中有 RATIO_HROUO/IOR_HROUH/IOR_HROUC 字段但可能为空）
        const ratioCornerHtOu = isCornerContext ? (g.RATIO_HROUO || "") : "";
        const iorCornerHtOuH = isCornerContext ? (g.IOR_HROUH || "") : "";
        const iorCornerHtOuC = isCornerContext ? (g.IOR_HROUC || "") : "";
        // 半场让球/大小（rrnou 上下文才有值，rb/rcn 中这些字段属于角球半场）
        const ratioHre = !isCornerContext ? (g.RATIO_HRE || "") : "";
        const iorHreh = !isCornerContext ? (g.IOR_HREH || "") : "";
        const iorHrec = !isCornerContext ? (g.IOR_HREC || "") : "";
        const ratioHrouo = !isCornerContext ? (g.RATIO_HROUO || "") : "";
        const iorHrouh = !isCornerContext ? (g.IOR_HROUH || "") : "";
        const iorHrouc = !isCornerContext ? (g.IOR_HROUC || "") : "";
        // 角球单/双（rcn 中 IOR_REOE=单赔率，IOR_REOO=双赔率）
        const iorCornerOdd = isCornerContext ? (g.IOR_REOE || "") : "";
        const iorCornerEven = isCornerContext ? (g.IOR_REOO || "") : "";
        // 角球独赢（rcn 中 IOR_RGH=主胜/IOR_RGC=客胜/IOR_RGN=平局）
        const iorRgh = isCornerContext ? (g.IOR_RGH || "") : (g.IOR_RGH || "");
        const iorRgc = isCornerContext ? (g.IOR_RGC || "") : (g.IOR_RGC || "");
        const iorRgn = isCornerContext ? (g.IOR_RGN || "") : (g.IOR_RGN || "");
        // 角球上半场独赢（IOR_HRGH/IOR_HRGC/IOR_HRGN）
        const iorCornerHtHomeOdds = isCornerContext ? (g.IOR_HRGH || "") : "";
        const iorCornerHtDrawOdds = isCornerContext ? (g.IOR_HRGN || "") : "";
        const iorCornerHtAwayOdds = isCornerContext ? (g.IOR_HRGC || "") : "";
        // 角球上半场单/双（IOR_HREOE/IOR_HREOO）
        const iorCornerHtOddOdds = isCornerContext ? (g.IOR_HREOE || "") : "";
        const iorCornerHtEvenOdds = isCornerContext ? (g.IOR_HREOO || "") : "";
        // 角球编号（CN_COUNT）
        const cnCount = isCornerContext ? (g.CN_COUNT || "") : "";
        // rb 上下文中的独赢和单/双
        const iorRb1x2Home = !isCornerContext ? (g.IOR_RGH || "") : "";
        const iorRb1x2Away = !isCornerContext ? (g.IOR_RGC || "") : "";
        const iorRb1x2Draw = !isCornerContext ? (g.IOR_RGN || "") : "";
        const iorRbOddOdds = !isCornerContext ? (g.IOR_REOE || "") : "";
        const iorRbEvenOdds = !isCornerContext ? (g.IOR_REOO || "") : "";
        // rb 上半场独赢（IOR_HRGH/IOR_HRGC/IOR_HRGN）
        const iorRbHt1x2Home = !isCornerContext ? (g.IOR_HRGH || "") : "";
        const iorRbHt1x2Away = !isCornerContext ? (g.IOR_HRGC || "") : "";
        const iorRbHt1x2Draw = !isCornerContext ? (g.IOR_HRGN || "") : "";
        // rb 上半场单/双（IOR_HREOE/IOR_HREOO）
        const iorRbHtOddOdds = !isCornerContext ? (g.IOR_HREOE || "") : "";
        const iorRbHtEvenOdds = !isCornerContext ? (g.IOR_HREOO || "") : "";
        // IDs
        const ecid = g.ECID || "";
        const hgid = g.HGID || "";
        const gidm = g.GIDM || "";

        matches.push({
          matchId: gid || ("json_" + matches.length),
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
          cornerHandicap: ratioCornerHdp ? parseAsianHandicap(ratioCornerHdp) : 0,
          cornerOdds: parseFloat(iorCornerH) || 0,
          hasCornerOdds: !!(ratioCornerHdp || ratioCrOuo),
          _cornerHdpLine: ratioCornerHdp,
          _cornerHdpHomeOdds: iorCornerH,
          _cornerHdpAwayOdds: iorCorner,
          _cornerOULine: ratioCrOuo,
          _cornerOUOdds: iorCrOuo,
          _cornerOUUnderOdds: iorCrOuu,
          _hasCornerMarket: isCornerMarket,
          _cornerHomeOdds: iorRgh,
          _cornerAwayOdds: iorRgc,
          _cornerDrawOdds: iorRgn,
          // Next Corner（下个角球）
          _nextCornerHomeOdds: iorNextCornerH,
          _nextCornerAwayOdds: iorNextCornerC,
          _nextCornerNum: cnCount,
          // 角球半场让球（rcn 中有字段但可能为空）
          _cornerHtHdpLine: ratioCornerHtHdp,
          _cornerHtHdpHomeOdds: iorCornerHtHdpH,
          _cornerHtHdpAwayOdds: iorCornerHtHdpC,
          // 角球半场大小（rcn 中有字段但可能为空）
          _cornerHtOULine: ratioCornerHtOu,
          _cornerHtOUOverOdds: iorCornerHtOuH,
          _cornerHtOUUnderOdds: iorCornerHtOuC,
          // 角球半场独赢
          _cornerHtHomeOdds: iorCornerHtHomeOdds,
          _cornerHtDrawOdds: iorCornerHtDrawOdds,
          _cornerHtAwayOdds: iorCornerHtAwayOdds,
          // 角球单/双（IOR_REOE/IOR_REOO）
          _cornerOddOdds: iorCornerOdd,
          _cornerEvenOdds: iorCornerEven,
          // 角球半场单/双
          _cornerHtOddOdds: iorCornerHtOddOdds,
          _cornerHtEvenOdds: iorCornerHtEvenOdds,
          // ★ 半场让球/大小（rrnou 上下文才有值，rb/rcn 中这些字段属于角球半场）
          _htHdpLine: ratioHre,
          _htHdpHomeOdds: iorHreh,
          _htHdpAwayOdds: iorHrec,
          _htOuLine: ratioHrouo,
          _htOuOverOdds: iorHrouh,
          _htOuUnderOdds: iorHrouc,
          // ★ rb 独赢和单/双
          _1x2HomeOdds: iorRb1x2Home,
          _1x2AwayOdds: iorRb1x2Away,
          _1x2DrawOdds: iorRb1x2Draw,
          _oddOdds: iorRbOddOdds,
          _evenOdds: iorRbEvenOdds,
          // ★ rb 上半场独赢和单/双
          _ht1x2HomeOdds: iorRbHt1x2Home,
          _ht1x2AwayOdds: iorRbHt1x2Away,
          _ht1x2DrawOdds: iorRbHt1x2Draw,
          _htOddOdds: iorRbHtOddOdds,
          _htEvenOdds: iorRbHtEvenOdds,
          ecid, hgid, gidm,
          running,
          _ptype: ptype,
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

      console.log("[xhrParser] parseGameListXML (JSON): " + matches.length + " 场比赛 (" + (contextHint || "?") + ", " + xmlText.length + " bytes)");
      // ★ 诊断：输出前3场比赛的角球字段值
      for (let i = 0; i < Math.min(3, matches.length); i++) {
        const m = matches[i];
        console.log("[xhrParser] 比赛" + i + ": " + m.homeTeam + " vs " + m.awayTeam +
          " | context=" + contextHint +
          " | hdp=" + m._hdpLine + " " + m._hdpHomeOdds + "/" + m._hdpAwayOdds +
          " | ou=" + m._ouLine + " " + m._ouOverOdds + "/" + m._ouUnderOdds +
          " | cornerHdp=" + m._cornerHdpLine + " " + m._cornerHdpHomeOdds + "/" + m._cornerHdpAwayOdds +
          " | cornerOU=" + m._cornerOULine + " " + m._cornerOUOdds + "/" + m._cornerOUUnderOdds +
          " | nextCorner=" + m._nextCornerHomeOdds + "/" + m._nextCornerAwayOdds +
          " | cornerHtHdp=" + m._cornerHtHdpLine + " cornerHtOu=" + m._cornerHtOULine +
          " | cornerOE=" + m._cornerOddOdds + "/" + m._cornerEvenOdds +
          " | htHdp=" + m._htHdpLine + " htOu=" + m._htOuLine +
          " | hasCorner=" + m._hasCornerMarket + " ptype=" + (m._ptype || ""));
      }

      return {
        success: matches.length > 0,
        matches,
        source: "xml",
        count: matches.length,
      };
    } catch (jsonErr) {
      console.warn("[xhrParser] <original> JSON 解析失败: " + jsonErr.message + "，回退到 <game> 标签解析");
    }
  }

  if (!hasGameTag) {
    console.warn("[xhrParser] XML 中未找到 <game> 标签且无 <original> JSON (" + contextHint + ")");
    console.log("[xhrParser] XML 前 500 字符: " + xmlText.substring(0, 500));
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
