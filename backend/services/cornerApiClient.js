// ======================== 纯 API 角球数据客户端 ========================
// 使用浏览器上下文的 fetch() 调用 transform.php，绕过 DOM 导航
// Puppeteer 仅用于 ensureLogin 登录和浏览器内 fetch

import { fetchGameList, fetchGameList_FT, fetchViaInterception, RTYPE } from "./transformApi.js";
import { parseGameListXML } from "./xhrDataParser.js";
import { parseAsianHandicap } from "./crawlerShared.js";

// ======================== 数据获取 ========================

/**
 * 获取赛程：只获取 today 的角球赛程数据（rtype=cn）
 * 用于"获取赛程"按钮，数据展示在赛程 tab
 * @param {Page} page - 已登录的 Puppeteer page
 * @returns {{ success: boolean, matches: Array, cnCount: number }}
 */
export async function fetchCornerSchedule(page) {
  console.log("[cornerApiClient] 获取角球赛程 (today cn)...");

  // ★ 只获取 today 的 cn 数据
  const interceptionResult = await fetchViaInterception(
    page,
    [RTYPE.CN],
    async () => {
      try {
        // ★ 强制刷新：先切换到 In-Play 标签，确保从非目标状态切换
        await page.evaluate(() => {
          const liveBtn = document.getElementById("live_page");
          if (liveBtn) liveBtn.click();
        });
        await new Promise(r => setTimeout(r, 1000));

        // 先点击 Today 标签
        await page.evaluate(() => {
          const todayBtn = document.getElementById("today_page");
          if (todayBtn) todayBtn.click();
        });
        await new Promise(r => setTimeout(r, 2000));

        // ★ 直接点击 Soccer 标签（不再先切到篮球再切回，避免导航停留在篮球标签页）
        await page.evaluate(() => {
          const soccerBtn = document.getElementById("old_ft_live_league") || document.getElementById("symbol_ft");
          if (soccerBtn) soccerBtn.click();
        });
        await new Promise(r => setTimeout(r, 3000));

        // ★ 强制刷新：先点击 Full Time 标签，再点击 Corners
        await page.evaluate(() => {
          const ftTab = document.getElementById("tab_ft") || document.getElementById("tab_re");
          if (ftTab) ftTab.click();
        });
        await new Promise(r => setTimeout(r, 1000));

        // 点击 Corners 标签触发 cn 请求
        await page.evaluate(() => {
          const cnTab = document.getElementById("tab_cn");
          if (cnTab) cnTab.click();
        });
      } catch (e) {
        console.warn("[cornerApiClient] 触发页面操作失败:", e.message);
      }
    },
    30000  // ★ 增加超时到 30s
  );

  let cnXml = interceptionResult[RTYPE.CN] || null;

  // 拦截方式未获取到数据，回退到 fetchInBrowser
  if (!cnXml) {
    console.log("[cornerApiClient] 拦截方式未获取到 cn 数据，回退到 fetchInBrowser...");
    cnXml = await fetchGameList(page, RTYPE.CN);
  }

  // fetchInBrowser 也失败，尝试 game_list_FT
  if (!cnXml) {
    console.log("[cornerApiClient] fetchInBrowser 也失败，尝试 game_list_FT...");
    cnXml = await fetchGameList_FT(page, RTYPE.CN);
  }

  const cnResult = cnXml ? parseGameListXML(cnXml, "rcn") : { matches: [], count: 0 };
  const matches = cnResult.matches || [];

  console.log("[cornerApiClient] 角球赛程: " + matches.length + " 场比赛");
  return { success: matches.length > 0, matches, cnCount: matches.length };
}

/**
 * 启动监控：获取有角球盘口的比赛和让球大小的比赛
 * 返回分类数据：cornerMatches（角球 tab）+ hdpMatches（让球 tab）
 * ★ 同时获取 rrnou 数据以补充半场让球/大小盘口
 * @param {Page} page - 已登录的 Puppeteer page
 * @returns {{ success: boolean, cornerMatches: Array, hdpMatches: Array, rbCount: number, rcnCount: number }}
 */
export async function fetchCornerMatches(page) {
  console.log("[cornerApiClient] 获取监控数据 (live 角球 + 让球 + 半场)...");

  // ★ 获取 live 模式数据：rb(基本盘) + rcn(角球) + rrnou(半场让球/大小)
  const interceptionResult = await fetchViaInterception(
    page,
    [RTYPE.RB, RTYPE.RCN, RTYPE.RNOU],
    async () => {
      try {
        // ★ 强制刷新：先切换到 Today 标签，确保从非目标状态切换
        await page.evaluate(() => {
          const todayBtn = document.getElementById("today_page");
          if (todayBtn) todayBtn.click();
        });
        await new Promise(r => setTimeout(r, 1000));

        // 点击 In-Play 标签
        await page.evaluate(() => {
          const liveBtn = document.getElementById("live_page");
          if (liveBtn) liveBtn.click();
        });
        await new Promise(r => setTimeout(r, 2000));

        // ★ 直接点击 Soccer 标签（不再先切到篮球再切回，避免导航停留在篮球标签页）
        await page.evaluate(() => {
          const soccerBtn = document.getElementById("old_ft_live_league") || document.getElementById("symbol_ft");
          if (soccerBtn) soccerBtn.click();
        });
        await new Promise(r => setTimeout(r, 3000));

        // ★ 先点击 HDP & O/U 标签触发 rrnou 请求
        await page.evaluate(() => {
          const rnouTab = document.getElementById("tab_rnou");
          if (rnouTab) rnouTab.click();
        });
        await new Promise(r => setTimeout(r, 2000));

        // 点击 Corners 标签触发 rcn 请求
        await page.evaluate(() => {
          const cnTab = document.getElementById("tab_cn");
          if (cnTab) cnTab.click();
        });
      } catch (e) {
        console.warn("[cornerApiClient] 触发页面操作失败:", e.message);
      }
    },
    30000  // ★ 增加超时到 30s，因为操作步骤增多
  );
  
  let rbXml = interceptionResult[RTYPE.RB] || null;
  let rcnXml = interceptionResult[RTYPE.RCN] || null;
  let rrnouXml = interceptionResult[RTYPE.RNOU] || null;

  // 如果拦截方式未获取到数据，回退到 fetchInBrowser 方式（live 模式）
  if (!rbXml && !rcnXml) {
    console.log("[cornerApiClient] 拦截方式未获取到数据，回退到 fetchInBrowser (live)...");
    [rbXml, rcnXml, rrnouXml] = await Promise.all([
      fetchGameList(page, RTYPE.RB),
      fetchGameList(page, RTYPE.RCN),
      fetchGameList(page, RTYPE.RNOU),
    ]);
  } else {
    // 部分缺失时单独获取
    if (!rbXml) {
      console.log("[cornerApiClient] rb 数据缺失，单独获取...");
      rbXml = await fetchGameList(page, RTYPE.RB);
    }
    if (!rcnXml) {
      console.log("[cornerApiClient] rcn 数据缺失，单独获取...");
      rcnXml = await fetchGameList(page, RTYPE.RCN);
    }
    if (!rrnouXml) {
      console.log("[cornerApiClient] rrnou 数据缺失，单独获取...");
      rrnouXml = await fetchGameList(page, RTYPE.RNOU);
    }
  }

  // 如果 fetchInBrowser 也失败，尝试 game_list_FT（live 模式）
  if (!rbXml && !rcnXml) {
    console.log("[cornerApiClient] fetchInBrowser 也失败，尝试 game_list_FT (live)...");
    [rbXml, rcnXml, rrnouXml] = await Promise.all([
      fetchGameList_FT(page, RTYPE.RB),
      fetchGameList_FT(page, RTYPE.RCN),
      fetchGameList_FT(page, RTYPE.RNOU),
    ]);
  }

  const rbResult = rbXml ? parseGameListXML(rbXml, "rb") : { matches: [], count: 0 };
  const rcnResult = rcnXml ? parseGameListXML(rcnXml, "rcn") : { matches: [], count: 0 };
  const rrnouResult = rrnouXml ? parseGameListXML(rrnouXml, "rrnou") : { matches: [], count: 0 };

  console.log("[cornerApiClient] 解析: r=" + (rbResult.matches?.length || 0) + " 场, cn=" + (rcnResult.matches?.length || 0) + " 场, rrnou=" + (rrnouResult.matches?.length || 0) + " 场");

  const merged = mergeByName(rbResult.matches || [], rcnResult.matches || [], rrnouResult.matches || []);

  // ★ 分类：角球 tab（有角球盘口的比赛）+ 让球 tab（有 HDP/OU 盘口的比赛）
  const cornerMatches = merged.filter(m => m._hasCornerMarket);
  // ★ hdpMatches：基于 handicaps 数组过滤，而非 _hdpLine/_ouLine
  const hdpMatches = merged.filter(m => (m.handicaps || []).some(h => h.marketGroup !== "corner"));

  console.log("[cornerApiClient] 合并完成: " + merged.length + " 场 → 角球=" + cornerMatches.length + " 让球=" + hdpMatches.length + " (r=" + (rbResult.matches?.length || 0) + " cn=" + (rcnResult.matches?.length || 0) + ")");
  return { success: merged.length > 0, matches: merged, cornerMatches, hdpMatches, rbCount: rbResult.matches?.length || 0, rcnCount: rcnResult.matches?.length || 0 };
}

// ======================== 合并逻辑 ========================

/**
 * 按球队名合并 rb (基本盘) + rcn (角球) + rrnou (半场让球/大小)
 */
function mergeByName(rbMatches, rcnMatches, rrnouMatches = []) {
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

  // rrnou 按 key 索引（半场让球/大小数据）
  const rrnouByName = new Map();
  for (const m of rrnouMatches) {
    const key = (m.homeTeam + "|" + m.awayTeam).toLowerCase().trim();
    rrnouByName.set(key, m);
  }

  const allKeys = new Set([...rbByName.keys(), ...rcnByName.keys(), ...rrnouByName.keys()]);
  const merged = [];
  let idx = 0;

  for (const key of allKeys) {
    const rb = rbByName.get(key);
    const rcn = rcnByName.get(key);
    const rrnou = rrnouByName.get(key);
    const teams = key.split("|");
    const homeTeam = (rb?.homeTeam || rcn?.homeTeam || rrnou?.homeTeam || teams[0] || "").trim();
    const awayTeam = (rb?.awayTeam || rcn?.awayTeam || rrnou?.awayTeam || teams[1] || "").trim();
    if (!homeTeam || !awayTeam) continue;

    const match = {
      matchId: "api_" + idx + "_" + homeTeam.replace(/[^a-zA-Z0-9]/g, "_") + "_" + awayTeam.replace(/[^a-zA-Z0-9]/g, "_"),
      matchName: homeTeam + " vs " + awayTeam,
      homeTeam, awayTeam,
      league: rb?.league || rcn?.league || rrnou?.league || "",
      leagueId: rb?.leagueId || rcn?.leagueId || rrnou?.leagueId || "",
      leagueName: rb?.leagueName || rcn?.leagueName || rrnou?.leagueName || "",
      time: rb?.time || rcn?.time || rrnou?.time || "",
      elapsedMinutes: rb?.elapsedMinutes || rcn?.elapsedMinutes || rrnou?.elapsedMinutes || 0,
      homeScore: rb?.homeScore || 0,
      awayScore: rb?.awayScore || 0,

      // 角球数据 (来自 rcn)
      totalCorners: rcn?.totalCorners || 0,
      homeCorners: rcn?.cornerHomeCount || 0,
      awayCorners: rcn?.cornerAwayCount || 0,
      // 角球盘口（数字格式，与 DOM 输出对齐）
      cornerHandicap: rcn?.cornerHandicap || 0,
      cornerOdds: rcn?.cornerOdds || 0,
      hasCornerOdds: rcn?.hasCornerOdds || false,
      // 角球让球盘口（详细字段，来自 rcn）
      _cornerHdpLine: rcn?._cornerHdpLine || "",
      _cornerHdpHomeOdds: rcn?._cornerHdpHomeOdds || "",
      _cornerHdpAwayOdds: rcn?._cornerHdpAwayOdds || "",
      // 角球大小（来自 rcn）
      _cornerOULine: rcn?._cornerOULine || "",
      _cornerOUOdds: rcn?._cornerOUOdds || "",
      _cornerOUUnderOdds: rcn?._cornerOUUnderOdds || "",
      _hasCornerMarket: !!(rcn?._hasCornerMarket),
      // Next Corner（下个角球，来自 rcn）
      _nextCornerHomeOdds: rcn?._nextCornerHomeOdds || "",
      _nextCornerAwayOdds: rcn?._nextCornerAwayOdds || "",
      _nextCornerNum: rcn?._nextCornerNum || "",
      // 角球半场让球（来自 rcn，可能为空）
      _cornerHtHdpLine: rcn?._cornerHtHdpLine || "",
      _cornerHtHdpHomeOdds: rcn?._cornerHtHdpHomeOdds || "",
      _cornerHtHdpAwayOdds: rcn?._cornerHtHdpAwayOdds || "",
      // 角球半场大小（来自 rcn，可能为空）
      _cornerHtOULine: rcn?._cornerHtOULine || "",
      _cornerHtOUOverOdds: rcn?._cornerHtOUOverOdds || "",
      _cornerHtOUUnderOdds: rcn?._cornerHtOUUnderOdds || "",
      // ★ 角球独赢：rcn 中无角球独赢数据，IOR_RGH 等是让球独赢，不填充
      _corner1x2HomeOdds: "",
      _corner1x2AwayOdds: "",
      _corner1x2DrawOdds: "",
      // ★ 角球上半场独赢：同上，rcn 中无此数据
      _cornerHt1x2HomeOdds: "",
      _cornerHt1x2AwayOdds: "",
      _cornerHt1x2DrawOdds: "",
      // 角球单/双（来自 rcn）
      _cornerOddOdds: rcn?._cornerOddOdds || "",
      _cornerEvenOdds: rcn?._cornerEvenOdds || "",
      // 角球半场单/双（来自 rcn）
      _cornerHtOddOdds: rcn?._cornerHtOddOdds || "",
      _cornerHtEvenOdds: rcn?._cornerHtEvenOdds || "",

      // HDP/OU (来自 rb)
      _hdpLine: rb?._hdpLine || "",
      _hdpHomeOdds: rb?._hdpHomeOdds || "",
      _hdpAwayOdds: rb?._hdpAwayOdds || "",
      _ouLine: rb?._ouLine || "",
      _ouOverOdds: rb?._ouOverOdds || "",
      _ouUnderOdds: rb?._ouUnderOdds || "",

      // 半场让球/大小 (来自 rrnou)
      _htHdpLine: rrnou?._htHdpLine || rb?._htHdpLine || "",
      _htHdpHomeOdds: rrnou?._htHdpHomeOdds || rb?._htHdpHomeOdds || "",
      _htHdpAwayOdds: rrnou?._htHdpAwayOdds || rb?._htHdpAwayOdds || "",
      _htOuLine: rrnou?._htOuLine || rb?._htOuLine || "",
      _htOuOverOdds: rrnou?._htOuOverOdds || rb?._htOuOverOdds || "",
      _htOuUnderOdds: rrnou?._htOuUnderOdds || rb?._htOuUnderOdds || "",

      // 独赢 (来自 rb)
      _1x2HomeOdds: rb?._1x2HomeOdds || "",
      _1x2AwayOdds: rb?._1x2AwayOdds || "",
      _1x2DrawOdds: rb?._1x2DrawOdds || "",
      // 上半场独赢 (来自 rb)
      _ht1x2HomeOdds: rb?._ht1x2HomeOdds || "",
      _ht1x2AwayOdds: rb?._ht1x2AwayOdds || "",
      _ht1x2DrawOdds: rb?._ht1x2DrawOdds || "",
      // 单/双 (来自 rb)
      _oddOdds: rb?._oddOdds || "",
      _evenOdds: rb?._evenOdds || "",
      // 上半场单/双 (来自 rb)
      _htOddOdds: rb?._htOddOdds || "",
      _htEvenOdds: rb?._htEvenOdds || "",

      _dataSource: "api",
      _cornerSource: rcn ? "api" : "none",
      dataQuality: (rb && rcn) ? "full" : (rb ? "no_corner" : "no_base"),
      timestamp: Date.now(),
      triggeredStrategies: [],
      handicaps: buildHandicapsArray(rcn, rb, rrnou),

      // ID 字段
      ecid: rb?.ecid || rcn?.ecid || rrnou?.ecid || "",
      hgid: rb?.hgid || rcn?.hgid || rrnou?.hgid || "",
      gidm: rb?.gidm || rcn?.gidm || rrnou?.gidm || "",
      running: rb?.running || rcn?.running || rrnou?.running || false,
    };

    merged.push(match);
    idx++;
  }

  return merged;
}

// ======================== handicaps 数组构建 ========================

function buildHandicapsArray(rcn, rb, rrnou) {
  const result = [];
  let order = 0;

  // ===== 角球盘口（来自 rcn，marketGroup=corner）=====

  // 1. 角球大/小全场
  if (rcn?._cornerOULine) {
    const oOver = parseFloat(rcn._cornerOUOdds) || 0;
    const oUnder = parseFloat(rcn._cornerOUUnderOdds) || 0;
    result.push({
      order: order++, category: "O/U", categoryLabel: "大/小",
      period: "full", line: parseAsianHandicap(rcn._cornerOULine) || 0,
      odds: { over: oOver, under: oUnder },
      overOdds: oOver, underOdds: oUnder,
      source: "api", marketGroup: "corner",
    });
  }

  // 2. 角球大/小上半场
  if (rcn?._cornerHtOULine) {
    const oOver = parseFloat(rcn._cornerHtOUOverOdds) || 0;
    const oUnder = parseFloat(rcn._cornerHtOUUnderOdds) || 0;
    result.push({
      order: order++, category: "O/U", categoryLabel: "上半场 大/小",
      period: "half", line: parseAsianHandicap(rcn._cornerHtOULine) || 0,
      odds: { over: oOver, under: oUnder },
      overOdds: oOver, underOdds: oUnder,
      source: "api", marketGroup: "corner",
    });
  }

  // 3. 角球让球全场
  if (rcn?._cornerHdpLine) {
    const hHome = parseFloat(rcn._cornerHdpHomeOdds) || 0;
    const hAway = parseFloat(rcn._cornerHdpAwayOdds) || 0;
    result.push({
      order: order++, category: "HDP", categoryLabel: "让球",
      period: "full", line: parseAsianHandicap(rcn._cornerHdpLine) || 0,
      odds: { home: hHome, away: hAway },
      homeOdds: hHome, awayOdds: hAway,
      source: "api", marketGroup: "corner",
    });
  }

  // 4. 下个角球（Next Corner）
  if (rcn?._nextCornerHomeOdds || rcn?._nextCornerAwayOdds) {
    const nHome = parseFloat(rcn._nextCornerHomeOdds) || 0;
    const nAway = parseFloat(rcn._nextCornerAwayOdds) || 0;
    result.push({
      order: order++, category: "NEXT", categoryLabel: "下个角球",
      period: "full", line: rcn._nextCornerNum || "",
      odds: { home: nHome, away: nAway },
      homeOdds: nHome, awayOdds: nAway,
      source: "api", marketGroup: "corner",
    });
  }

  // 5. 角球让球上半场
  if (rcn?._cornerHtHdpLine) {
    const hHome = parseFloat(rcn._cornerHtHdpHomeOdds) || 0;
    const hAway = parseFloat(rcn._cornerHtHdpAwayOdds) || 0;
    result.push({
      order: order++, category: "HDP", categoryLabel: "上半场 让球",
      period: "half", line: parseAsianHandicap(rcn._cornerHtHdpLine) || 0,
      odds: { home: hHome, away: hAway },
      homeOdds: hHome, awayOdds: hAway,
      source: "api", marketGroup: "corner",
    });
  }

  // ★ 6. 角球独赢全场 — 已移除：rcn 中 IOR_RGH 等是让球独赢，不是角球独赢
  // ★ 7. 角球上半场独赢 — 已移除：同上

  // 8. 角球单/双全场
  if (rcn?._cornerOddOdds || rcn?._cornerEvenOdds) {
    const odd = parseFloat(rcn._cornerOddOdds) || 0;
    const even = parseFloat(rcn._cornerEvenOdds) || 0;
    result.push({
      order: order++, category: "O/E", categoryLabel: "单/双",
      period: "full",
      odds: { odd, even },
      oddOdds: odd, evenOdds: even,
      source: "api", marketGroup: "corner",
    });
  }

  // 9. 角球上半场单/双
  if (rcn?._cornerHtOddOdds || rcn?._cornerHtEvenOdds) {
    const odd = parseFloat(rcn._cornerHtOddOdds) || 0;
    const even = parseFloat(rcn._cornerHtEvenOdds) || 0;
    result.push({
      order: order++, category: "O/E", categoryLabel: "上半场 单/双",
      period: "half",
      odds: { odd, even },
      oddOdds: odd, evenOdds: even,
      source: "api", marketGroup: "corner",
    });
  }

  // ===== 让球tab盘口（来自 rb + rrnou，marketGroup=hdp/ou）=====

  // 7. 让球全场（来自 rb）
  if (rb?._hdpLine) {
    const hHome = parseFloat(rb._hdpHomeOdds) || 0;
    const hAway = parseFloat(rb._hdpAwayOdds) || 0;
    result.push({
      order: order++, category: "HDP", categoryLabel: "让球",
      period: "full", line: parseAsianHandicap(rb._hdpLine) || 0,
      odds: { home: hHome, away: hAway },
      homeOdds: hHome, awayOdds: hAway,
      source: "api", marketGroup: "hdp",
    });
  }

  // 8. 让球半场（来自 rrnou）
  if (rrnou?._htHdpLine) {
    const hHome = parseFloat(rrnou._htHdpHomeOdds) || 0;
    const hAway = parseFloat(rrnou._htHdpAwayOdds) || 0;
    result.push({
      order: order++, category: "HDP", categoryLabel: "上半场 让球",
      period: "half", line: parseAsianHandicap(rrnou._htHdpLine) || 0,
      odds: { home: hHome, away: hAway },
      homeOdds: hHome, awayOdds: hAway,
      source: "api", marketGroup: "hdp",
    });
  }

  // 9. 大小球全场（来自 rb）
  if (rb?._ouLine) {
    const oOver = parseFloat(rb._ouOverOdds) || 0;
    const oUnder = parseFloat(rb._ouUnderOdds) || 0;
    result.push({
      order: order++, category: "O/U", categoryLabel: "大小球",
      period: "full", line: parseAsianHandicap(rb._ouLine) || 0,
      odds: { over: oOver, under: oUnder },
      overOdds: oOver, underOdds: oUnder,
      source: "api", marketGroup: "ou",
    });
  }

  // 10. 大小球半场（来自 rrnou）
  if (rrnou?._htOuLine) {
    const oOver = parseFloat(rrnou._htOuOverOdds) || 0;
    const oUnder = parseFloat(rrnou._htOuUnderOdds) || 0;
    result.push({
      order: order++, category: "O/U", categoryLabel: "上半场 大小球",
      period: "half", line: parseAsianHandicap(rrnou._htOuLine) || 0,
      odds: { over: oOver, under: oUnder },
      overOdds: oOver, underOdds: oUnder,
      source: "api", marketGroup: "ou",
    });
  }

  // 11. 独赢全场（来自 rb）
  if (rb?._1x2HomeOdds || rb?._1x2AwayOdds || rb?._1x2DrawOdds) {
    const home = parseFloat(rb._1x2HomeOdds) || 0;
    const away = parseFloat(rb._1x2AwayOdds) || 0;
    const draw = parseFloat(rb._1x2DrawOdds) || 0;
    result.push({
      order: order++, category: "1X2", categoryLabel: "独赢",
      period: "full",
      odds: { home, away, draw },
      homeOdds: home, awayOdds: away, drawOdds: draw,
      source: "api", marketGroup: "hdp",
    });
  }

  // 12. 上半场独赢（来自 rb）
  if (rb?._ht1x2HomeOdds || rb?._ht1x2AwayOdds || rb?._ht1x2DrawOdds) {
    const home = parseFloat(rb._ht1x2HomeOdds) || 0;
    const away = parseFloat(rb._ht1x2AwayOdds) || 0;
    const draw = parseFloat(rb._ht1x2DrawOdds) || 0;
    result.push({
      order: order++, category: "1X2", categoryLabel: "上半场 独赢",
      period: "half",
      odds: { home, away, draw },
      homeOdds: home, awayOdds: away, drawOdds: draw,
      source: "api", marketGroup: "hdp",
    });
  }

  // 13. 单/双全场（来自 rb）
  if (rb?._oddOdds || rb?._evenOdds) {
    const odd = parseFloat(rb._oddOdds) || 0;
    const even = parseFloat(rb._evenOdds) || 0;
    result.push({
      order: order++, category: "O/E", categoryLabel: "单/双",
      period: "full",
      odds: { odd, even },
      oddOdds: odd, evenOdds: even,
      source: "api", marketGroup: "ou",
    });
  }

  // 14. 上半场单/双（来自 rb）
  if (rb?._htOddOdds || rb?._htEvenOdds) {
    const odd = parseFloat(rb._htOddOdds) || 0;
    const even = parseFloat(rb._htEvenOdds) || 0;
    result.push({
      order: order++, category: "O/E", categoryLabel: "上半场 单/双",
      period: "half",
      odds: { odd, even },
      oddOdds: odd, evenOdds: even,
      source: "api", marketGroup: "ou",
    });
  }

  return result;
}
