export async function crawlCornerMatches() {
  // 并发保护：如果已有爬取在进行中，直接返回
  if (crawlingLock) {
    console.warn("[cornerCrawler] Crawler is busy, rejecting concurrent call");
    return { success: false, data: { matches: [], allText: [], allElements: [] }, count: 0, error: "Crawler busy", busy: true };
  }
  crawlingLock = true;
  console.log("[cornerCrawler] ===== Crawling corner data =====");
  const ts = new Date().toISOString();

  // 瓒呮椂淇濇姢锛?80 绉掞紙3 鍒嗛挓锛夊悗鑷姩閲婃斁閿侊紝闃叉姝婚攣
  const LOCK_TIMEOUT_MS = 180000; // 延长到 3 分钟
  const lockTimeout = setTimeout(() => {
    if (crawlingLock) {
      console.warn("[cornerCrawler] Lock timeout reached (180s), force releasing");
      crawlingLock = false;
    }
  }, LOCK_TIMEOUT_MS);

  try {
    // 清空上次捕获的 XHR 响应
    capturedResponses = [];
    seenRequestUrls.clear();

    const page = await ensureLogin();
    if (!page) {
      console.error("[cornerCrawler] Login failed, cannot crawl");
      return { success: false, data: { matches: [], allText: [], allElements: [] }, count: 0, timestamp: ts, error: "Login failed" };
    }

    // 设置 XHR 拦截（在导航之前）
    try {
      await setupXHRInterception(page);
    } catch (e) {
      console.warn("[cornerCrawler] XHR interception setup failed:", e.message);
    }

    // 导航到角球页面（反爬随机延迟）
    await randomDelay(1000, 3000);
    const navResult = await navigateToCorners(page);
    const dataSource = navResult?.source || "unknown";
    const matchScores = navResult?.matchScores || {};
      // ★ 无 Soccer 数据时提前终止
    if (navResult?.noSoccer) {
      console.log("[cornerCrawler] 无 Soccer 数据，终止爬取");
      crawlingLock = false;
      clearTimeout(lockTimeout);
      return { success: false, data: { matches: [], allText: [], allElements: [] }, count: 0, timestamp: ts, error: "今日无足球赛事", noSoccer: true };
    }
  const soccerMarkets = navResult?.soccerMarkets || {};
    console.log("[cornerCrawler] Navigation result: source=" + dataSource + " scores=" + Object.keys(matchScores).length);
    await randomDelay(500, 1000);

    // 等待数据加载
    await randomDelay(800, 1500);


    // 滚动触发懒加载
    try {
      await page.evaluate(() => {
        window.scrollTo(0, document.body.scrollHeight);
        setTimeout(() => window.scrollTo(0, 0), 500);
      });
    } catch(e) {}
    await randomDelay(1500, 3000);

    // 解析 DOM 获取角球盘口（使用专用 parseCornerMarkets 替代通用 parseAllMarkets）
    const domData = await parseCornerMarkets(page, matchScores);
    console.log("[cornerCrawler] DOM corner markets: " + domData.length);

    // 尝试从 XHR 捕获中提取比赛列表
    let xhrMatches = [];
    try {
      // Log all captured response summaries for debugging
      if (capturedResponses.length > 0) {
        console.log("[cornerCrawler] Captured " + capturedResponses.length + " XHR responses:");
        for (let ci = 0; ci < capturedResponses.length; ci++) {
          const cr = capturedResponses[ci];
          console.log("[cornerCrawler]   [" + ci + "] items=" + cr.itemCount + " fields=" + JSON.stringify(cr.sampleFields) + " url=" + cr.url.substring(0, 120));
        }
      } else {
        console.log("[cornerCrawler] No XHR responses captured, seen URLs: " + seenRequestUrls.size);
      }

      const bestResponse = pickBestResponse(capturedResponses);
      if (bestResponse && bestResponse.matchList && bestResponse.matchList.length > 0) {
        xhrMatches = bestResponse.matchList
          .map(mapToCornerMatch)
          .filter(m => m.homeTeam && m.awayTeam);
        console.log("[cornerCrawler] XHR matches found: " + xhrMatches.length);
      } else {
        console.log("[cornerCrawler] No XHR matches extracted from " + capturedResponses.length + " responses");
      }
    } catch (e) {
      console.warn("[cornerCrawler] XHR data extraction failed:", e.message);
    }

    // 映射 DOM 数据到标准格式（parseCornerMarkets 返回 cornerOU/cornerHDP/nextCorner/cornerOE 格式）
    const matches = domData.map((m, idx) => ({
      matchId: "g_" + (m.homeTeam + "_" + m.awayTeam).replace(/[^a-zA-Z0-9]/g, "_") + "_" + idx,
      matchName: m.homeTeam + " vs " + m.awayTeam,
      homeTeam: m.homeTeam, awayTeam: m.awayTeam,
      league: m.league || "", time: m.time || "",
      elapsedMinutes: m.elapsedMinutes || 0,
      homeScore: m.homeScore || 0, awayScore: m.awayScore || 0,
      totalCorners: m.totalCorners || 0,
      homeCorners: m.cornerHomeCount || 0, awayCorners: m.cornerAwayCount || 0,
      _cornerSource: "dom",
      cornerHandicap: m.cornerHDP ? parseAsianHandicap(m.cornerHDP.line) : 0,
      cornerOdds: m.cornerHDP ? (m.cornerHDP.homeOdds || 0) : 0,
      handicaps: buildHandicapsArray(m),
      dataQuality: m.cornerHDP || m.cornerOU ? "full" : (m.homeTeam ? "partial" : "empty"),
      timestamp: Date.now(),
      triggeredStrategies: []
    }));

    // 如果 DOM 有 XHR 的队伍补充信息，合并（按球队名匹配）
    if (xhrMatches.length > 0 && matches.length > 0) {
      const xhrByName = {};
      for (const xm of xhrMatches) {
        const key = (xm.homeTeam + "_" + xm.awayTeam).toLowerCase().replace(/[^a-z0-9]/g, "_");
        xhrByName[key] = xm;
      }
      for (const m of matches) {
        const key = (m.homeTeam + "_" + m.awayTeam).toLowerCase().replace(/[^a-z0-9]/g, "_");
        if (xhrByName[key]) {
          // XHR 数据中获取实际角球数（覆盖 DOM 回退值）
          const xhrHC = xhrByName[key].homeCorners || 0;
          const xhrAC = xhrByName[key].awayCorners || 0;
          if (xhrHC > 0 || xhrAC > 0) {
            m.homeCorners = xhrHC;
            m.awayCorners = xhrAC;
            m._cornerSource = "xhr";
          }
        }
      }
    }

        console.log("[cornerCrawler] ===== Done: " + matches.length + " corner matches =====");
    if (matches.length === 0) {
      console.log("[cornerCrawler] ZERO matches! DOM count=" + domData.length + " XHR count=" + xhrMatches.length + " capturedResponses=" + capturedResponses.length);
      // Dump page sample to debug file
      try {
        const sample = await page.evaluate(() => {
          const body = document.body;
          return body ? (body.textContent || "").replace(/\s+/g, " ").trim().substring(0, 500) : "(no body)";
        });
        fs.writeFileSync("debug/zero-matches-page.txt", sample + "\n\nSeen URLs: " + JSON.stringify([...seenRequestUrls].slice(0, 20)));
        console.log("[cornerCrawler] Page sample written to debug/zero-matches-page.txt");
      } catch(e) {}
    }

    // 保存调试截图
// Add data source info to each match
    for (const m of matches) {
      m._dataSource = dataSource;
    }

    return {
      success: true,
      data: { matches, allText: [], allElements: [] },
      count: matches.length,
      timestamp: ts,
      mainMarkets: soccerMarkets
    };
  } catch (err) {
    console.error("[cornerCrawler] crawlCornerMatches error:", err.message);
    return {
      success: false,
      data: { matches: [], allText: [], allElements: [] },
      count: 0,
      timestamp: ts,
      error: err.message
    };
  } finally {
    clearTimeout(lockTimeout);
    crawlingLock = false;
  }
}
