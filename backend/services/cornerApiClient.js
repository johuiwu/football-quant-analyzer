// ======================== 纯 API 角球数据客户端 ========================
// 使用浏览器上下文的 fetch() 调用 transform.php，绕过 DOM 导航
// Puppeteer 仅用于 ensureLogin 登录和浏览器内 fetch

import { fetchGameList, fetchGameList_FT, fetchViaInterception, RTYPE } from "./transformApi.js";
import { parseGameListXML } from "./xhrDataParser.js";
import { parseAsianHandicap } from "./crawlerShared.js";

// ======================== 数据获取 ========================

/**
 * 在浏览器上下文内并行获取 rb (基本盘) + rcn (角球) 数据
 * @param {Page} page - 已登录的 Puppeteer page
 * @returns {{ success: boolean, matches: Array, rbCount: number, rcnCount: number }}
 */
export async function fetchCornerMatches(page) {
  console.log("[cornerApiClient] 获取角球比赛数据...");
  
  // ★ 优先使用响应拦截方式（让浏览器自然发出 XHR 请求）
  const interceptionResult = await fetchViaInterception(
    page,
    [RTYPE.RB, RTYPE.RCN],
    async () => {
      // 触发页面操作：依次点击 Soccer 和 Corners 标签
      try {
        // 先确保在 Soccer 标签
        await page.evaluate(() => {
          const soccerBtn = document.getElementById("old_ft_live_league") || document.getElementById("symbol_ft");
          if (soccerBtn) soccerBtn.click();
        });
        await new Promise(r => setTimeout(r, 2000));
        
        // 点击 Corners 标签触发 rcn 请求
        await page.evaluate(() => {
          const cnTab = document.getElementById("tab_cn");
          if (cnTab) cnTab.click();
        });
        await new Promise(r => setTimeout(r, 1000));
        
        // 再点击回 Full Time 标签触发 rb 请求
        await page.evaluate(() => {
          const ftTab = document.getElementById("tab_pd") || document.getElementById("tab_re");
          if (ftTab) ftTab.click();
        });
      } catch (e) {
        console.warn("[cornerApiClient] 触发页面操作失败:", e.message);
      }
    },
    15000
  );
  
  let rbXml = interceptionResult[RTYPE.RB] || null;
  let rcnXml = interceptionResult[RTYPE.RCN] || null;
  
  // 如果拦截方式未获取到数据，回退到 fetchInBrowser 方式
  if (!rbXml && !rcnXml) {
    console.log("[cornerApiClient] 拦截方式未获取到数据，回退到 fetchInBrowser...");
    [rbXml, rcnXml] = await Promise.all([
      fetchGameList(page, RTYPE.RB),
      fetchGameList(page, RTYPE.RCN),
    ]);
  }
  
  // 如果 get_game_list 全部失败，尝试 game_list_FT
  if (!rbXml && !rcnXml) {
    console.log("[cornerApiClient] get_game_list 全部失败，尝试 game_list_FT...");
    [rbXml, rcnXml] = await Promise.all([
      fetchGameList_FT(page, RTYPE.RB),
      fetchGameList_FT(page, RTYPE.RCN),
    ]);
  }

  const rbResult = rbXml ? parseGameListXML(rbXml, "rb") : { matches: [], count: 0 };
  const rcnResult = rcnXml ? parseGameListXML(rcnXml, "rcn") : { matches: [], count: 0 };

  console.log("[cornerApiClient] 解析: rb=" + (rbResult.matches?.length || 0) + " 场, rcn=" + (rcnResult.matches?.length || 0) + " 场");

  const merged = mergeByName(rbResult.matches || [], rcnResult.matches || []);

  console.log("[cornerApiClient] 合并完成: " + merged.length + " 场比赛 (rb=" + (rbResult.matches?.length || 0) + " rcn=" + (rcnResult.matches?.length || 0) + ")");
  return { success: merged.length > 0, matches: merged, rbCount: rbResult.matches?.length || 0, rcnCount: rcnResult.matches?.length || 0 };
}

// ======================== 合并逻辑 ========================

/**
 * 按球队名合并 rb (主力数据源) + rcn (角球补充)
 */
function mergeByName(rbMatches, rcnMatches) {
  // rb 为基准
  const rbByName = new Map();
  for (const m of rbMatches) {
    const key = (m.homeTeam + "|" + m.awayTeam).toLowerCase().trim();
    rbByName.set(key, m);
  }

  // rcn 按 key 索引
  const rcnByName = new Map();
  for (const m of rcnMatches) {
    const key = (m.homeTeam + "|" + m.awayTeam).toLowerCase().trim();
    rcnByName.set(key, m);
  }

  const allKeys = new Set([...rbByName.keys(), ...rcnByName.keys()]);
  const merged = [];
  let idx = 0;

  for (const key of allKeys) {
    const rb = rbByName.get(key);
    const rcn = rcnByName.get(key);
    const teams = key.split("|");
    const homeTeam = (rb?.homeTeam || rcn?.homeTeam || teams[0] || "").trim();
    const awayTeam = (rb?.awayTeam || rcn?.awayTeam || teams[1] || "").trim();
    if (!homeTeam || !awayTeam) continue;

    const match = {
      matchId: "api_" + idx + "_" + homeTeam.replace(/[^a-zA-Z0-9]/g, "_") + "_" + awayTeam.replace(/[^a-zA-Z0-9]/g, "_"),
      matchName: homeTeam + " vs " + awayTeam,
      homeTeam, awayTeam,
      league: rb?.league || rcn?.league || "",
      leagueId: rb?.leagueId || rcn?.leagueId || "",
      leagueName: rb?.leagueName || rcn?.leagueName || "",
      time: rb?.time || rcn?.time || "",
      elapsedMinutes: rb?.elapsedMinutes || rcn?.elapsedMinutes || 0,
      homeScore: rb?.homeScore || rcn?.homeScore || 0,
      awayScore: rb?.awayScore || rcn?.awayScore || 0,

      // 角球数据 (来自 rcn)
      totalCorners: rcn?.totalCorners || 0,
      homeCorners: rcn?.cornerHomeCount || 0,
      awayCorners: rcn?.cornerAwayCount || 0,
      // 角球盘口（数字格式，与 DOM 输出对齐）
      cornerHandicap: rcn?.cornerHandicap || 0,
      cornerOdds: rcn?.cornerOdds || 0,
      hasCornerOdds: rcn?.hasCornerOdds || false,
      // 角球让球盘口（详细字段）
      _cornerHdpLine: rcn?._cornerHdpLine || "",
      _cornerHdpHomeOdds: rcn?._cornerHdpHomeOdds || "",
      _cornerHdpAwayOdds: rcn?._cornerHdpAwayOdds || "",
      // 角球大小
      _cornerOULine: rcn?._cornerOULine || "",
      _cornerOUOdds: rcn?._cornerOUOdds || "",
      _cornerOUUnderOdds: rcn?._cornerOUUnderOdds || "",
      _hasCornerMarket: !!(rcn?._hasCornerMarket),
      _cornerHomeOdds: rcn?._cornerHomeOdds || "",
      _cornerAwayOdds: rcn?._cornerAwayOdds || "",
      _cornerDrawOdds: rcn?._cornerDrawOdds || "",

      // HDP/OU (来自 rb)
      _hdpLine: rb?._hdpLine || "",
      _hdpHomeOdds: rb?._hdpHomeOdds || "",
      _hdpAwayOdds: rb?._hdpAwayOdds || "",
      _ouLine: rb?._ouLine || "",
      _ouOverOdds: rb?._ouOverOdds || "",
      _ouUnderOdds: rb?._ouUnderOdds || "",

      // 半场盘口 (来自 rb)
      _htHdpLine: rb?._htHdpLine || "",
      _htHdpHomeOdds: rb?._htHdpHomeOdds || "",
      _htHdpAwayOdds: rb?._htHdpAwayOdds || "",
      _htOuLine: rb?._htOuLine || "",
      _htOuOverOdds: rb?._htOuOverOdds || "",
      _htOuUnderOdds: rb?._htOuUnderOdds || "",

      _dataSource: "api",
      _cornerSource: rcn ? "api" : "none",
      dataQuality: (rb && rcn) ? "full" : (rb ? "no_corner" : "no_base"),
      timestamp: Date.now(),
      triggeredStrategies: [],
      handicaps: buildHandicapsArray(rcn, rb),

      // ID 字段
      ecid: rb?.ecid || rcn?.ecid || "",
      hgid: rb?.hgid || rcn?.hgid || "",
      gidm: rb?.gidm || rcn?.gidm || "",
      running: rb?.running || rcn?.running || false,
    };

    merged.push(match);
    idx++;
  }

  return merged;
}

// ======================== handicaps 数组构建 ========================

function buildHandicapsArray(rcn, rb) {
  const result = [];
  let order = 0;

  // 角球让球盘 (来自 rcn 的 RATIO_CORNERHDP)
  if (rcn?._cornerHdpLine) {
    result.push({
      order: order++,
      category: "HDP",
      categoryLabel: "角球让球",
      period: "full",
      line: parseAsianHandicap(rcn._cornerHdpLine) || 0,
      odds: { home: parseFloat(rcn._cornerHdpHomeOdds) || 0, away: parseFloat(rcn._cornerHdpAwayOdds) || 0 },
      source: "api",
      marketGroup: "corner",
    });
  }

  // 角球大小 (来自 rcn)
  if (rcn?._cornerOULine) {
    result.push({
      order: order++,
      category: "O/U",
      categoryLabel: "角球大小",
      period: "full",
      line: parseFloat(rcn._cornerOULine) || 0,
      odds: { over: parseFloat(rcn._cornerOUOdds) || 0, under: parseFloat(rcn._cornerOUUnderOdds) || 0 },
      source: "api",
      marketGroup: "corner",
    });
  }

  // 让球盘 (来自 rb)
  if (rb?._hdpLine) {
    result.push({
      order: order++,
      category: "HDP",
      categoryLabel: "让球",
      period: "full",
      line: parseFloat(rb._hdpLine) || 0,
      odds: { home: parseFloat(rb._hdpHomeOdds) || 0, away: parseFloat(rb._hdpAwayOdds) || 0 },
      source: "api",
      marketGroup: "hdp",
    });
  }

  // 大小球 (来自 rb)
  if (rb?._ouLine) {
    result.push({
      order: order++,
      category: "O/U",
      categoryLabel: "大小球",
      period: "full",
      line: parseFloat(rb._ouLine) || 0,
      odds: { over: parseFloat(rb._ouOverOdds) || 0, under: parseFloat(rb._ouUnderOdds) || 0 },
      source: "api",
      marketGroup: "ou",
    });
  }

  return result;
}
