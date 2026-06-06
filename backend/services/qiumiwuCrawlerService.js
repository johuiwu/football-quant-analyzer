import puppeteer from "puppeteer";

// ======================== 配置常量 ========================
const QIUMIWU_URL = "https://www.qiumiwu.com/game/zuqiu";
const NAV_TIMEOUT = 30000;
const WAIT_MS = 3000;

// ======================== 解析赛程数据 ========================
/**
 * 基于已知的 HTML 结构解析 qiumiwu.com 足球赛程页面。
 * 
 * HTML 结构 (来自 output/赛程网页.txt)：
 *   <div class="fixture__details fixture__details--today">
 *     <summary>...今天 06-03 星期三 (30场)...</summary>
 *     <div class="fixture__list" status-alias="end|in|wait|other" ball-type="0">
 *       <div class="fixture__list__data">
 *         <span class="fixture__list__league">国际赛</span>
 *         <span class="fixture__list__time">00:00</span>
 *         <span class="fixture__list__status">完场|上半场 X'|未开赛|取消</span>
 *         <a class="fixture__list__info" href="/game/stat-xxx">
 *           <div class="fixture__list__team"><span>主队</span><img/></div>
 *           <div class="fixture__list__score">
 *             <span class="fixture__list__score__text" win="0|1">分数</span>
 *             <span class="fixture__list__score__symbol">-|VS</span>
 *             <span class="fixture__list__score__text" win="0|1">分数</span>
 *           </div>
 *           <div class="fixture__list__team"><span>客队</span><img/></div>
 *         </a>
 *         <div class="fixture__list__score">...</div>
 *         <div class="fixture__list__extra">...</div>
 *       </div>
 *     </div>
 *   </div>
 */
async function parseFixtures(page) {
  console.log("[QiumiwuCrawler] 解析赛程数据...");

  const fixtures = await page.evaluate(() => {
    const results = [];
    const todaySection = document.querySelector("details.fixture__details--today");
    if (!todaySection) {
      console.log("[QiumiwuCrawler] 未找到今天赛程区块");
      return results;
    }

    const matchNodes = todaySection.querySelectorAll("div.fixture__list");
    console.log("[QiumiwuCrawler] 找到 " + matchNodes.length + " 个比赛节点");

    matchNodes.forEach((node, index) => {
      try {
        const dataEl = node.querySelector("div.fixture__list__data");
        if (!dataEl) return;

        // 联赛名称
        const leagueEl = dataEl.querySelector("span.fixture__list__league");
        const league = leagueEl ? leagueEl.textContent.trim() : "";

        // 比赛时间
        const timeEl = dataEl.querySelector("span.fixture__list__time");
        const matchTime = timeEl ? timeEl.textContent.trim() : "";

        // 比赛状态
        const statusEl = dataEl.querySelector("span.fixture__list__status");
        const matchStatus = statusEl ? statusEl.textContent.trim() : "";

        // 赛事链接 info 区块
        const infoLink = dataEl.querySelector("a.fixture__list__info");
        if (!infoLink) return;

        // 主客队名称
        const teamEls = infoLink.querySelectorAll("div.fixture__list__team span");
        if (teamEls.length < 2) return;
        const homeTeam = teamEls[0].textContent.trim();
        const awayTeam = teamEls[1].textContent.trim();
        if (!homeTeam || !awayTeam) return;

        // 比分
        const scoreEl = infoLink.querySelector("div.fixture__list__score");
        let homeScore = null, awayScore = null;
        if (scoreEl) {
          const scoreTexts = scoreEl.querySelectorAll("span.fixture__list__score__text");
          if (scoreTexts.length >= 2) {
            const hs = parseInt(scoreTexts[0].textContent.trim(), 10);
            const as = parseInt(scoreTexts[1].textContent.trim(), 10);
            if (!isNaN(hs) && !isNaN(as)) {
              homeScore = hs;
              awayScore = as;
            }
          }
        }

        // 赛事详情链接ID
        const href = infoLink.getAttribute("href") || "";
        const matchId = href.replace("/game/", "").replace("/stat-", "").replace("/live-", "");

        // 状态别名
        const statusAlias = node.getAttribute("status-alias") || "unknown";

        results.push({
          id: matchId || ("qmw_" + index + "_" + Date.now()),
          league,
          homeTeam,
          awayTeam,
          matchTime,
          matchStatus,
          statusAlias,
          homeScore,
          awayScore,
          name: homeTeam + " vs " + awayTeam,
          stageCn: league,
          source: "qiumiwu"
        });
      } catch (e) {
        console.log("[QiumiwuCrawler] 解析第 " + index + " 场比赛出错:", e.message);
      }
    });

    return results;
  });

  // 过滤已完场赛事，只保留未完场（in=进行中, wait=未开赛, other=其他状态如推迟等）
  const unfinishedFixtures = fixtures.filter(f => f.statusAlias !== "end");
  const filteredCount = fixtures.length - unfinishedFixtures.length;
  console.log("[QiumiwuCrawler] 成功解析 " + fixtures.length + " 场赛程，过滤已完场 " + filteredCount + " 场，保留未完场 " + unfinishedFixtures.length + " 场");
  if (unfinishedFixtures.length > 0) {
    unfinishedFixtures.slice(0, 5).forEach((f, i) =>
      console.log(`  [${i}] ${f.league} | ${f.homeTeam} vs ${f.awayTeam} | ${f.matchTime} | ${f.matchStatus} | 比分: ${f.homeScore ?? "-"}-${f.awayScore ?? "-"}`)
    );
  }

  return unfinishedFixtures;
}

// ======================== 爬虫入口 ========================
/**
 * 爬取 qiumiwu.com 足球赛程页面
 * @returns {Promise<{success: boolean, data: Array, count: number, error?: string}>}
 */
export async function crawlQiumiwuFixtures() {
  console.log("[QiumiwuCrawler] === 开始爬取 qiumiwu.com 足球赛程 ===");
  let browser = null;

  try {
    browser = await puppeteer.launch({
      headless: true,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-gpu",
        "--disable-blink-features=AutomationControlled"
      ]
    });

    const page = await browser.newPage();
    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36"
    );
    await page.setViewport({ width: 1920, height: 1080 });
    await page.setExtraHTTPHeaders({
      "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8"
    });

    console.log("[QiumiwuCrawler] 导航到 " + QIUMIWU_URL);
    await page.goto(QIUMIWU_URL, {
      waitUntil: "networkidle2",
      timeout: NAV_TIMEOUT
    });
    console.log("[QiumiwuCrawler] 页面加载完成");

    // 等待赛程区块渲染
    await page.waitForSelector("details.fixture__details--today", {
      timeout: 10000
    }).catch(() => {
      console.log("[QiumiwuCrawler] ⚠ 未找到 today 区块，尝试等待完整加载");
      return new Promise(r => setTimeout(r, WAIT_MS));
    });

    // 额外等待确保动态内容完成
    await new Promise(r => setTimeout(r, 2000));

    // 解析赛程数据
    const fixtures = await parseFixtures(page);

    await browser.close();
    browser = null;

    console.log("[QiumiwuCrawler] === 爬取完成: " + fixtures.length + " 场赛程 ===");

    return {
      success: true,
      data: fixtures,
      count: fixtures.length
    };
  } catch (err) {
    console.error("[QiumiwuCrawler] 爬取失败:", err.message);
    if (browser) {
      try { await browser.close(); } catch (e) {}
    }
    return {
      success: false,
      data: [],
      count: 0,
      error: err.message
    };
  }
}