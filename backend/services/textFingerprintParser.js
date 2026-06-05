// ======================== 文本指纹解析器 ========================
// 从页面 textContent 中正则提取比赛和盘口数据
// 不依赖 DOM class/ID，只要页面有文本就能工作

export async function parseByTextFingerprint(page) {
  console.log("[textParser] === 文本指纹解析开始 ===");

  try {
    const result = await page.evaluate(() => {
      const bodyText = (document.body?.textContent || "").replace(/\s+/g, " ").replace(/ +/g, " ").trim();
      const matches = [];
      const seen = new Set();

      // Step 1: 找所有 "XX vs YY" 球队对
      const vsRegex = /([A-Za-z\u4e00-\u9fff][A-Za-z\u4e00-\u9fff .&'-]{3,40}?)\s+(?:vs|VS|Vs|v\.?s\.?|v )\s+([A-Za-z\u4e00-\u9fff][A-Za-z\u4e00-\u9fff .&'-]{3,40}?)/gi;
      let vsMatch;
      while ((vsMatch = vsRegex.exec(bodyText)) !== null) {
        const homeTeam = vsMatch[1].trim();
        const awayTeam = vsMatch[2].trim();
        const key = (homeTeam + "|||" + awayTeam).toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);

        // Step 2: 在球队对附近 600 字符内搜索赔率/盘口
        const vsPos = vsMatch.index;
        const nearbyStart = Math.max(0, vsPos - 100);
        const nearbyEnd = Math.min(bodyText.length, vsPos + 600);
        const nearby = bodyText.substring(nearbyStart, nearbyEnd);

        // 提取所有疑似赔率数字 (0.01 ~ 999)
        const oddsPattern = /\b(\d{1,3}\.\d{2,3})\b/g;
        const allOdds = [];
        let om;
        while ((om = oddsPattern.exec(nearby)) !== null) {
          const v = parseFloat(om[1]);
          if (v > 0.01 && v < 999) allOdds.push(v);
        }

        // 提取盘口线 (+/- 开头)
        const linePattern = /([+-]\s*\d+(?:\/\d+(?:\.\d+)?)?(?:\s*\.\s*5)?)/g;
        const lines = [];
        let lm;
        while ((lm = linePattern.exec(nearby)) !== null) {
          lines.push(lm[1].replace(/\s+/g, ""));
        }

        // Step 3: 在 nearby 中搜索盘口类型标签
        const labelMap = {
          'O/U': /O\/U|Over\s*\/?\s*Under|大\s*\/?\s*小|大小|得分大小/gi,
          'HDP': /HDP|Handicap|让球|Handicap/gi,
          'O/E': /O\/E|Odd\s*\/?\s*Even|单\s*\/?\s*双|单双/gi,
          '1X2': /1\s*X\s*2|独赢/gi,
          'NEXT_CORNER': /Next\s*Corner|下个角球/gi,
        };

        const foundLabels = [];
        for (const [label, regex] of Object.entries(labelMap)) {
          if (regex.test(nearby)) foundLabels.push(label);
        }

        // 构建 handicaps 数组
        const handicaps = [];
        if (allOdds.length >= 2) {
          // 尝试将赔率数字与标签配对
          const labelForOdds = foundLabels.length > 0 ? foundLabels[0] : "O/U";
          handicaps.push({
            category: labelForOdds,
            categoryLabel: labelForOdds,
            period: "full",
            line: lines.length > 0 ? lines[0] : 0,
            odds: { over: allOdds[0] || 0, under: allOdds[1] || 0 },
            source: "text",
            marketGroup: "corner"
          });
        }
        if (allOdds.length >= 4 && foundLabels.length >= 2) {
          handicaps.push({
            category: foundLabels[1] || "HDP",
            categoryLabel: foundLabels[1] || "HDP",
            period: "full",
            line: lines.length > 1 ? lines[1] : (lines[0] || 0),
            odds: { home: allOdds[2] || 0, away: allOdds[3] || 0 },
            source: "text",
            marketGroup: "corner"
          });
        }

        // Step 4: 搜索比分 (仅当页面是 In-Play 视图)
        let homeScore = 0, awayScore = 0;
        const scorePattern = /\b(\d{1,2})\s*[-:]\s*(\d{1,2})\b/g;
        let sm;
        // 在 vs 附近找最接近的比分
        let bestDist = Infinity;
        while ((sm = scorePattern.exec(nearby)) !== null) {
          const dist = Math.abs(sm.index - 100); // 100 是 nearby 中 vs 的大致位置
          if (dist < bestDist && dist < 300) {
            homeScore = parseInt(sm[1], 10) || 0;
            awayScore = parseInt(sm[2], 10) || 0;
            bestDist = dist;
          }
        }

        // Step 5: 搜索角球总数
        let totalCorners = 0;
        const crPattern = /(?:角球|Corner|Corners?)\s*[:\s]*(\d{1,2})/gi;
        let cm;
        while ((cm = crPattern.exec(nearby)) !== null) {
          totalCorners = parseInt(cm[1], 10) || 0;
          break;
        }

        matches.push({
          matchId: "text_" + key.replace(/[^a-z0-9]/g, "_").substring(0, 40),
          matchName: homeTeam + " vs " + awayTeam,
          homeTeam, awayTeam,
          league: "",
          time: "",
          elapsedMinutes: 0,
          homeScore, awayScore,
          totalCorners,
          homeCorners: 0, awayCorners: 0,
          handicaps,
          cornerHandicap: lines.length > 0 ? parseFloat(lines[0]) || 0 : 0,
          cornerOdds: allOdds.length > 0 ? allOdds[0] : 0,
          _dataSource: "text",
          _cornerSource: "text",
          dataQuality: handicaps.length > 0 ? "partial" : "empty",
          timestamp: Date.now(),
          triggeredStrategies: []
        });
      }

      return matches;
    });

    console.log("[textParser] 文本指纹解析到 " + result.length + " 场比赛");
    return {
      success: result.length > 0,
      matches: result,
      source: "text",
      count: result.length
    };
  } catch (e) {
    console.error("[textParser] 解析失败:", e.message);
    return { success: false, matches: [], source: "text", count: 0 };
  }
}
