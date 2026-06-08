import puppeteer from "puppeteer-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";
import type { TeamStats, RankedValue } from "../data/realTeamsData";
import { ALLOWED_FIELDS } from "../../database/db";
import { LEAGUE_PRESETS, LeaguePreset } from "../../config/leaguePresets";
// pinyin lazy-loaded via dynamic import in generateSlug()

puppeteer.use(StealthPlugin());

// ======================== 浏览器单例 ========================

type Browser = Awaited<ReturnType<typeof puppeteer.launch>>;
type Page = Awaited<ReturnType<Browser["newPage"]>>;

let browser: Browser | null = null;
const DEBUG = process.env.CRAWLER_DEBUG === "1";

async function getBrowser(): Promise<Browser> {
  if (!browser || !browser.connected) {
    browser = await puppeteer.launch({
      headless: !DEBUG,
      slowMo: DEBUG ? 200 : 0,
      args: [
        "--no-sandbox", "--disable-setuid-sandbox",
        "--disable-dev-shm-usage", "--disable-gpu",
        "--disable-blink-features=AutomationControlled",
        "--window-size=1366,768",
      ],
    });
  }
  return browser;
}

export async function closeBrowser(): Promise<void> {
  if (browser) { await browser.close(); browser = null; }
}

// ======================== 球队名 → slug ========================

const TEAM_SLUG: Record<string, string> = {
  // 英超 — 对齐 ALL_LEAGUE_TEAMS.id
  "曼彻斯特城":"mancheng","阿森纳":"asenna","利物浦":"liwupu","切尔西":"qieerxi",
  "托特纳姆热刺":"reci","曼彻斯特联":"manlian","阿斯顿维拉":"asidunweila",
  "纽卡斯尔联":"niukasier","布莱顿":"bulaidun","西汉姆联":"xihanmu",
  "伯恩茅斯":"boenmaosi","布伦特福德":"buluntefude","伯恩利":"boenli",
  "水晶宫":"shuijinggong","埃弗顿":"aifudun","富勒姆":"fuleimu",
  "利兹联":"lizilian","诺丁汉森林":"nuodinghan","桑德兰":"sangdelan","狼队":"langdui",
  // 西甲
  "皇家马德里":"huangma","巴塞罗那":"basaluona","马德里竞技":"madelijingji",
  "赫罗纳":"heluona","毕尔巴鄂竞技":"bierbae","皇家社会":"huangjiashehui",
  "皇家贝蒂斯":"beidisi","塞维利亚":"saiweiliya","瓦伦西亚":"walunxiya",
  "比利亚雷亚尔":"biliyaleiyaer","阿拉维斯":"alaweisi","塞尔塔":"saierta",
  "埃尔切":"aierqie","西班牙人":"xibanyaren","莱万特":"laiwante",
  "马略卡":"maluoka","奥萨苏纳":"aosasuna","奥维耶多":"aoweiyeduo",
  "赫塔费":"hetafei","巴列卡诺":"baliekanuo",
  // 意甲
  "国际米兰":"guojimilan","AC米兰":"acmilan","尤文图斯":"youwentusi",
  "亚特兰大":"yatelanda","那不勒斯":"nabulesi","罗马":"luoma","拉齐奥":"laqiao",
  "佛罗伦萨":"foluolunsa","博洛尼亚":"boluoniya","都灵":"duling",
  "卡利亚里":"kaliyali","克雷莫内塞":"keleimona","科莫":"kemo",
  "热那亚":"renaya","莱切":"laiqie","帕尔马":"paerma","比萨":"bisa",
  "萨索洛":"sasuoluo","乌迪内斯":"wudineisi","维罗纳":"weiluona",
  // 德甲
  "拜仁慕尼黑":"bairen","勒沃库森":"leiwokusen","斯图加特":"situjiate",
  "多特蒙德":"duotemengde","RB莱比锡":"laihongniu","法兰克福":"falankefu",
  "霍芬海姆":"huofenhaimu","沃尔夫斯堡":"wofusibao","云达不莱梅":"bulaimei",
  "门兴格拉德巴赫":"menxing","门兴":"menxing",
  "奥格斯堡":"aogesibao","柏林联合":"bolinlianhe","弗赖堡":"fulaibao",
  "汉堡":"hanbao1","海登海姆":"haidenghaimu","科隆":"kelong",
  "美因茨":"meiyinci","圣保利":"shengbao",
  // 法甲
  "巴黎圣日耳曼":"balishengman","摩纳哥":"monage","马赛":"masai",
  "里尔":"lier","里昂":"liang","朗斯":"langsi","尼斯":"nisi","雷恩":"leien",
  "兰斯":"lansi","斯特拉斯堡":"sitelasi","布雷斯特":"buleisite",
  "图卢兹":"tuluzi","欧塞尔":"ousaier","南特":"nante","昂热":"angre",
  "勒阿弗尔":"leiafuer","洛里昂":"luoliang","巴黎FC":"balifc","梅斯":"meisi",
  // 中超
  "上海申花":"shanghaishenhua","上海海港":"shanghaihaigang","北京国安":"beijingguoan",
  "山东泰山":"shandongtaishan","成都蓉城":"chedurongcheng","武汉三镇":"wuhansanzhen",
  "浙江队":"zhejiangdui","天津津门虎":"tianjinjinmenhu","长春亚泰":"changchunyatai",
  "河南队":"henandui",
  // J联赛
  "川崎前锋":"chuanqianqianfeng","横滨水手":"hengbinshuishou",
  "浦和红钻":"fuhehongzuan","鹿岛鹿角":"ludaojiao","神户胜利船":"shenhushengli",
  "广岛三箭":"guandaosanjian","名古屋鲸八":"mingguwujingba","FC东京":"fctokyo",
  "大阪樱花":"dabanyinghua","大阪钢巴":"dabangangba",
  // 荷甲
  "阿贾克斯":"ajiakesi","PSV埃因霍温":"psvaiyinhuowen","费耶诺德":"feiyenuode",
  "阿尔克马尔":"aerkemaer","特温特":"tewente","乌德勒支":"wudelezhi",
  "维特斯":"weitesi","海伦芬":"hailunfen",
  // 葡超
  "本菲卡":"benfeika","波尔图":"boertu","葡萄牙体育":"putaoyatiyu","布拉加":"bulajia",
  "吉马良斯":"jimaliangsi","博阿维斯塔":"boaweisita","里奥阿维":"liaoawei",
  "埃斯托里尔":"aisituolier",
  // 沙特联
  "利雅得新月":"liyadexinyue","利雅得胜利":"liyadeshengli",
  "吉达联合":"jidalianhe","吉达国民":"jidaguomin","利雅得青年":"liyadeqingnian",
  "达曼协作":"damanxiezuo","布赖代合作":"bulaidaihezuo","哈萨征服":"hasazhengfu",

  // === 挪超 ===
  "博德闪耀":"bodeshanyao","莫尔德":"moerde","罗森博格":"luosenboge","维京":"weijing",
  "布兰":"bulan","特罗姆瑟":"teluomuse","利勒斯特罗姆":"lileisiteluomu",
  // === 瑞超 ===
  "马尔默":"maermo","哈马比":"hamabi","佐加顿斯":"zuojiadunsi","赫根":"hegen",
  "埃夫斯堡":"aifusibao","索尔纳":"suoerna","哥德堡":"gedebao",
  // === 荷甲 ===
  // === 韩K1/K2 ===
  "蔚山现代":"weishanxiandai","全北现代":"quanbeixiandai","浦项制铁":"puxiangzhitie",
  "首尔FC":"shouerfc","水原FC":"shuiyuanfc","光州FC":"guangzhoufc","大邱FC":"daqiufc",
  // === 葡超 ===
  // === 芬超 ===
  "赫尔辛基":"heerxinji","古比斯":"gubisi",
  // === 日职 ===
  // === 世界杯 === (球米屋slug规则：有同名篮球队的加1后缀为足球，无同名篮球队的不带1为足球)
  "阿根廷":"agenting","巴西":"baxi1","德国":"deguo1","西班牙":"xibanya1",
  "英格兰":"yinggelan","葡萄牙":"putaoya","荷兰":"helan1","比利时":"bilishi1",
  "法国":"faguo1","意大利":"yidali1","克罗地亚":"keluodiya1",
  "韩国":"hanguo1","瑞士":"ruishi","加纳":"jiana1","塞内加尔":"saineijiaer",
  "日本":"riben1","厄瓜多尔":"eguaduoer","澳大利亚":"aodaliya1","伊朗":"yilang1",
  "沙特阿拉伯":"shatealabo","美国":"meiguo1","加拿大":"jianada1","墨西哥":"moxige1",
  "乌拉圭":"wulagui","卡塔尔":"kataer1","摩洛哥":"moluoge",
  // 2026世界杯新增球队
  "南非":"nanfei","捷克":"jieke1","波黑":"bohei1","巴拉圭":"balagui",
  "海地":"haidi","苏格兰":"sugelan","土耳其":"tuerqi1","库拉索":"kulasuo",
  "科特迪瓦":"ketediwa1","瑞典":"ruidian1","突尼斯":"tunisi1","佛得角":"fodejiao1",
  "埃及":"aiji1","新西兰":"xinxilan1","伊拉克":"yilake1","挪威":"nuowei",
  "阿尔及利亚":"aerjiliya","奥地利":"aodili","民主刚果":"minzhugangguo",
  "乌兹别克斯坦":"wuzibiekesitan","哥伦比亚":"gelunbiya","巴拿马":"banama","约旦":"yuedan1",
};

// ======================== 锚点 Hash → 字段 映射表 ========================

const HASH_TO_FIELD: Record<string, string> = {
  "goals":            "goals",
  "goals_against":    "conceded",
  "goal_diff":        "goalDifference",
  "goal_difference":  "goalDifference",
  "shots":            "shots",
  "shots_on_target":  "shotsOnTarget",
  "assists":          "assists",
  "passes":           "passes",
  "corners":          "corners",
  "corner_kicks":     "corners",
  "fouls":            "fouls",
  "red_cards":        "redCards",
  "yellow_cards":     "yellowCards",
  "avg_goals":        "avgGoals",
  "avg_conceded":     "avgConceded",
  "avg_goals_against":"avgConceded",
  "avg_goal_diff":    "avgGoalDiff",
  "avg_goal_difference":"avgGoalDiff",
  "avg_corners":      "avgCorners",
  "avg_corner_kicks": "avgCorners",
  "possession":       "possession",
  "ball_possession":  "possession",
  "tackles":          "tackles",
  "interceptions":    "interceptions",
  "clearances":       "clearances",
  "key_passes":       "keyPasses",
  "crosses":          "crosses",
  "crosses_successful":"crossesSuccessful",
  "successful_crosses":"crossesSuccessful",
  "long_balls":       "longBalls",
  "long_balls_successful":"successfulLongBalls",
  "successful_long_balls":"successfulLongBalls",
  "duels_won":        "duelsWon",
  "duels":            "duelsWon",
  "fast_break_shots": "fastBreakShots",
  "fastbreak_shots":  "fastBreakShots",
  "fast_break_goals": "fastBreakGoals",
  "fastbreak_goals":  "fastBreakGoals",
  "fastbreaks":       "fastBreaks",
  "fast_breaks":      "fastBreaks",
  "hit_woodwork":     "hitWoodwork",
  "offsides":         "offsides",
  "penalties":        "penalties",
  "penalty":          "penalties",
  "free_kicks":       "freeKicks",
  "freekicks":        "freeKicks",
  "free_kick_goals":  "freeKickGoals",
  "freekick_goals":   "freeKickGoals",
  "fouls_suffered":   "foulsSuffered",
  "was_fouled":       "foulsSuffered",
  "possession_lost":  "possessionLost",
  "poss_losts":       "possessionLost",
  "two_yellow_red":   "twoYellowRedCards",
  "yellow2red_cards": "twoYellowRedCards",
  "effective_blocks": "effectiveBlocks",
  "blocked_shots":    "effectiveBlocks",
  "clean_sheets":     "cleanSheets",
  "dribbles":         "dribbles",
  "dribble":          "dribbles",
  "dribble_succ":     "successfulDribbles",
  "successful_dribbles":"successfulDribbles",
  "crosses_accuracy":     "crossesSuccessful",
  "long_balls_accuracy":  "successfulLongBalls",
  "passes_accuracy":      "passes",
};

// ======================== 核心提取 ========================

interface RawStatItem {
  hash: string;
  value: string;
  rank: string;
}

function mapRawToStats(rawItems: RawStatItem[]): Partial<TeamStats> {
  const result: Partial<TeamStats> = {};
  const unmapped: string[] = [];

  for (const item of rawItems) {
    const hash = item.hash;
    const field = HASH_TO_FIELD[hash];
    if (!field) { unmapped.push(hash); continue; }

    const numVal = parseFloat(item.value.replace(/%/g, ""));
    if (isNaN(numVal)) continue;

    const rank = parseInt(item.rank, 10) || 0;

    if (field === "possession") {
      (result as any)[field] = { value: `${numVal}%`, rank };
    } else {
      (result as any)[field] = { total: numVal, rank } satisfies RankedValue;
    }
  }

  console.log(`[crawler] 映射: ${Object.keys(result).length} 字段`);
  if (unmapped.length > 0) {
    console.log(`[crawler] 未映射: ${[...new Set(unmapped)].sort().join(", ")}`);
  }
  return result;
}

// ======================== 主导出 ========================

export interface CrawlResult {
  stats: Partial<TeamStats>;
  source: "live" | "cache" | "fallback";
  crawledAt: number;
}

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36";

const LEAGUE_SLUG: Record<string, string> = {
  "英超": "yingchao",
  "西甲": "xijia",
  "意甲": "yijia",
  "德甲": "dejia",
  "法甲": "fajia",
  "中超": "zhongchao",
  "J1联赛": "rizhilian",
  "J1": "j1",
  "荷甲": "hejia",
  "葡超": "puchao",
  "沙特联": "shate",
  "沙特": "shate",
  "韩K1": "hanklian",
  "韩K2": "hank2lian",
  "瑞典超": "ruidianchao",
  "挪超": "nuochao",
  "芬超": "fenchao",
};

export interface StandingItem {
  rank: number;
  teamNameCn: string;
  teamName: string;
  played: number;
  wins: number;
  draws: number;
  losses: number;
  goalsFor: number;
  goalsAgainst: number;
  points: number;
}

export async function fetchLeagueStandingsFromQiumiwu(
  leagueCn: string
): Promise<StandingItem[] | null> {
  // 从联赛预设查找 slug；若不存在则回退到内联 LEAGUE_SLUG 映射
  const leagueKey = Object.keys(LEAGUE_PRESETS).find(k => LEAGUE_PRESETS[k].nameCn === leagueCn) || "";
  const preset = leagueKey ? LEAGUE_PRESETS[leagueKey] : undefined;
  const presetSlug = preset?.crawlerSlug;
  const slug = presetSlug || LEAGUE_SLUG[leagueCn];
  if (!slug) {
    const errMsg = `[crawler] 无联赛slug: ${leagueCn} (leagueKey=${leagueKey}), 该联赛不支持爬虫同步`;
    console.warn(errMsg);
    throw new Error(`UNSUPPORTED_LEAGUE: ${leagueCn} - no slug mapping found`);
  }

  const matchesPerSeason = preset?.matchesPerSeason ?? 38;
  const minPlayedThreshold = Math.max(2, Math.floor(matchesPerSeason * 0.08));

  const url = `https://www.qiumiwu.com/league/${slug}/standings`;
  console.log(`[crawler] → 积分榜 (回退): ${leagueCn} → ${url} (赛季${matchesPerSeason}场, 阈值≥${minPlayedThreshold}场)`);

  const bi = await getBrowser().catch((e: Error) => {
    console.error(`[crawler] 浏览器失败: ${e.message}`);
    return null;
  });
  if (!bi) return null;

  let page: Page | null = null;

  try {
    page = await bi.newPage();
    await page.setUserAgent(UA);
    await page.setViewport({ width: 1366, height: 768 });
    await page.evaluateOnNewDocument(() => {
      Object.defineProperty(navigator, "webdriver", { get: () => false });
    });

    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45000 });
    await new Promise<void>(r => setTimeout(r, 5000));

    const pageContent = await page.content();
    console.log(`[crawler] 页面长度: ${pageContent.length} 字符`);

    const standingsJson = await page.evaluate((threshold) => {
      const debugInfo: any = {
        threshold,
        tableCount: 0,
      };

      const dataPoints: any[] = [];
      const teamNames: string[] = [];

      // 策略：优先从 DOM 表格行中提取队名 + 数据
      const tables = document.querySelectorAll('table');
      let targetTable: HTMLTableElement | null = null;

      debugInfo.tableCount = tables.length;
      for (const table of tables) {
        let rows = table.querySelectorAll('tbody tr');
        if (rows.length < 10) rows = table.querySelectorAll('tr');
        const dataRows = [];
        rows.forEach(r => {
          if (r.querySelectorAll('td').length >= 8) {
            dataRows.push(r);
          }
        });
        if (dataRows.length >= 10) {
          targetTable = table;
          break;
        }
      }

      if (targetTable) {
        let rows = targetTable.querySelectorAll('tbody tr');
        if (rows.length === 0) rows = targetTable.querySelectorAll('tr');
        const dataRows = [];
        rows.forEach(r => {
          if (r.querySelectorAll('td').length >= 8) {
            dataRows.push(r);
          }
        });
        dataRows.forEach((row) => {
          const cells = row.querySelectorAll('td');
          if (cells.length >= 8) {
            // 尝试从第2列（通常是队名列）提取队名
            let teamName = '';
            const nameCell = cells[1] || cells[0];
            const link = nameCell.querySelector('a');
            if (link) {
              teamName = (link.textContent || '').trim();
            }
            if (!teamName) {
              teamName = (nameCell.textContent || '').trim();
            }

            // 从后续列提取数据
            const cellTexts = Array.from(cells).map((c: Element) => (c.textContent || '').trim());

            // 积分榜典型列顺序: 排名 | 队名 | 赛 | 胜 | 平 | 负 | 进球 | 失球 | 净胜 | 积分
            const parseNum = (s: string) => parseInt(s, 10) || 0;

            if (cellTexts.length >= 10) {
              const data = {
                played: parseNum(cellTexts[2]),
                wins: parseNum(cellTexts[3]),
                draws: parseNum(cellTexts[4]),
                losses: parseNum(cellTexts[5]),
                goalsFor: parseNum(cellTexts[6]),
                goalsAgainst: parseNum(cellTexts[7]),
                points: parseNum(cellTexts[9]),
              };
              if (data.played >= threshold && teamName) {
                teamNames.push(teamName);
                dataPoints.push(data);
              }
            } else if (cellTexts.length >= 8) {
              // 简化列: 排名 | 队名 | 赛 | 胜 | 平 | 负 | 得失 | 积分
              const data = {
                played: parseNum(cellTexts[2]),
                wins: parseNum(cellTexts[3]),
                draws: parseNum(cellTexts[4]),
                losses: parseNum(cellTexts[5]),
                goalsFor: 0,
                goalsAgainst: 0,
                points: parseNum(cellTexts[7]),
              };
              if (data.played >= threshold && teamName) {
                teamNames.push(teamName);
                dataPoints.push(data);
              }
            }
          }
        });
      }

      // 如果 DOM 提取失败，回退到旧的正则方式（仅数据，无队名）
      if (dataPoints.length === 0) {
        const allText = document.body.textContent || '';
        const fullRowPattern = /(\d+)\s+(\d+)\s+(\d+)\/(\d+)\/(\d+)\s+(\d+)\s+(\d+)/g;
        const allMatches: any[] = [];
        let frMatch;
        while ((frMatch = fullRowPattern.exec(allText)) !== null) {
          const data = {
            played: parseInt(frMatch[1], 10),
            points: parseInt(frMatch[2], 10),
            wins: parseInt(frMatch[3], 10),
            draws: parseInt(frMatch[4], 10),
            losses: parseInt(frMatch[5], 10),
            goalsFor: parseInt(frMatch[6], 10),
            goalsAgainst: parseInt(frMatch[7], 10),
          };
          allMatches.push(data);
          if (data.played >= threshold) {
            dataPoints.push(data);
          }
        }
        debugInfo.allMatches = allMatches.length;
        debugInfo.allMatchesSample = allMatches.slice(0, 3);
      }

      debugInfo.foundDataPoints = dataPoints.length;
      debugInfo.dataPointsSample = dataPoints.slice(0, 5);

      return JSON.stringify({ dataPoints, teamNames, debug: debugInfo });
    }, minPlayedThreshold);

    const parsedResult = JSON.parse(standingsJson);
    const dataPoints = parsedResult.dataPoints || [];
    const teamNames = parsedResult.teamNames || [];
    const debug = parsedResult.debug || {};

    console.log(`[crawler] ${leagueCn} 调试: 提取数据点=${dataPoints.length}, 提取队名=${teamNames.length}, 阈值=${minPlayedThreshold}`);
    if (debug.allMatchesSample?.length) {
      console.log(`[crawler] ${leagueCn} 匹配样本:`, JSON.stringify(debug.allMatchesSample));
    }
    if (dataPoints.length === 0) {
      console.warn(`[crawler] ✗ ${leagueCn}: 页面无可用数据`);
      return null;
    }

    if (teamNames.length > 0 && teamNames.length === dataPoints.length) {
      const standings = [];
      for (let i = 0; i < dataPoints.length; i++) {
        standings.push({
          rank: i + 1,
          teamNameCn: teamNames[i],
          teamName: teamNames[i],
          played: dataPoints[i].played,
          wins: dataPoints[i].wins,
          draws: dataPoints[i].draws,
          losses: dataPoints[i].losses,
          goalsFor: dataPoints[i].goalsFor,
          goalsAgainst: dataPoints[i].goalsAgainst,
          points: dataPoints[i].points,
        });
      }
      console.log(`[crawler] ✓ ${leagueCn} 积分榜 (DOM): ${standings.length} 支球队`);
      if (standings.length > 0) {
        console.log(`[crawler] 前3名:`, standings.slice(0, 3).map(s => `${s.teamNameCn}(P${s.points})`));
      }
      return standings;
    }

    console.warn(`[crawler] ⚠ ${leagueCn}: DOM队名提取不完整(${teamNames.length}/${dataPoints.length})，回退到硬编码列表`);

    const englishPremierLeagueTeams = [
      '阿森纳', '曼彻斯特城', '曼彻斯特联', '阿斯顿维拉', '利物浦', '伯恩茅斯',
      '桑德兰', '布莱顿', '布伦特福德', '切尔西', '富勒姆', '纽卡斯尔联',
      '埃弗顿', '利兹联', '水晶宫', '诺丁汉森林', '托特纳姆热刺', '西汉姆联',
      '伯恩利', '狼队'
    ];

    const laLigaTeams = [
      '巴塞罗那', '皇家马德里', '比利亚雷亚尔', '马德里竞技', '皇家贝蒂斯', '塞尔塔',
      '赫塔费', '巴列卡诺', '瓦伦西亚', '皇家社会', '西班牙人', '毕尔巴鄂竞技',
      '塞维利亚', '阿拉维斯', '埃尔切', '莱万特', '奥萨苏纳', '马略卡',
      '赫罗纳', '奥维耶多'
    ];

    const serieATeams = [
      '国际米兰', 'AC米兰', '尤文图斯', '亚特兰大', '罗马', '拉齐奥',
      '那不勒斯', '佛罗伦萨', '博洛尼亚', '都灵', '卡利亚里', '克雷莫内塞',
      '科莫', '热那亚', '莱切', '帕尔马', '比萨', '萨索洛',
      '乌迪内斯', '维罗纳'
    ];

    const bundesligaTeams = [
      '拜仁慕尼黑', '勒沃库森', '斯图加特', '多特蒙德', 'RB莱比锡', '法兰克福',
      '霍芬海姆', '沃尔夫斯堡', '云达不莱梅', '门兴格拉德巴赫', '奥格斯堡', '柏林联合',
      '弗赖堡', '汉堡', '海登海姆', '科隆', '美因茨', '圣保利'
    ];

    const ligue1Teams = [
      '巴黎圣日耳曼', '摩纳哥', '马赛', '里尔', '里昂', '朗斯',
      '尼斯', '雷恩', '兰斯', '斯特拉斯堡', '布雷斯特', '图卢兹',
      '欧塞尔', '南特', '昂热', '勒阿弗尔', '洛里昂', '巴黎FC'
    ];

    const cslTeams = [
      '成都蓉城', '上海申花', '云南玉昆', '山东泰山', '北京国安',
      '上海海港', '武汉三镇', '大连英博', '青岛海牛', '天津津门虎',
      '浙江队', '辽宁铁人', '深圳新鹏城', '重庆铜梁龙', '河南队', '青岛西海岸'
    ];

    const jLeagueTeams = [
      '川崎前锋', '横滨水手', '浦和红钻', '鹿岛鹿角', '神户胜利船',
      '广岛三箭', '名古屋鲸八', 'FC东京', '大阪樱花', '大阪钢巴',
      '冈山绿雉', '清水心跳', '町田泽维亚', '东京绿茵', '京都不死鸟',
      '柏太阳神', '长崎成功丸', '水户蜀葵', '千叶市原', '福冈黄蜂'
    ];

    const kLeague1Teams = [
      '首尔FC', '蔚山现代', '全北现代', '仁川联', '江原FC', '安养FC',
      '大田市民', '金泉尚武', '济州SK', '浦项制铁', '富川FC', '光州FC'
    ];

    const kLeague2Teams = [
      '大邱FC', '釜山偶像', '水原FC', '首尔衣恋', '华城FC', '水原三星',
      '忠南牙山', '庆南FC', '忠北清州', '金浦市民', '龙仁FC', '坡州市民',
      '城南FC', '全南天龙', '天安城', '安山小绿人', '金海'
    ];

    const saudiPLTeams = [
      '利雅得新月', '利雅得胜利', '吉达联合', '吉达国民',
      '利雅得青年', '达曼协作', '布赖代合作', '哈萨征服',
      '卡迪西亚', '塞哈特海湾', '新未来城体育', '费哈',
      '科鲁德', '哈森姆', '利雅得体育', '达马克',
      '欧鲁巴赫', '布赖代先锋'
    ];

    const eredivisieTeams = [
      '埃因霍温', '奈梅亨', '费耶诺德', '阿贾克斯',
      '乌德勒支', '特温特', '海伦芬', '阿尔克马',
      '前进之鹰', '福图纳', '格罗宁根', '特尔斯达',
      '兹沃勒', 'SBV精英', '鹿斯巴达', '布雷达',
      '赫拉克勒', '福伦丹'
    ];

    const primeiraLigaTeams = [
      '葡萄牙体育', '本菲卡', '波尔图', '布拉加',
      '埃斯托里尔', '吉尔维森特', '阿罗卡', '法马利康',
      '吉马良斯', '阿马多拉之星', '马德拉国民', '莫雷拉人',
      '里奥阿维', '艾华卡', '圣克拉拉', '卡萨比亚',
      '通德拉', '阿维什镇'
    ];

    const leagueTeams: Record<string, string[]> = {
      '英超': englishPremierLeagueTeams,
      '西甲': laLigaTeams,
      '意甲': serieATeams,
      '德甲': bundesligaTeams,
      '法甲': ligue1Teams,
      '中超': cslTeams,
      'J1联赛': jLeagueTeams,
      '韩K1': kLeague1Teams,
      '韩K2': kLeague2Teams,
      '沙特联': saudiPLTeams,
      '荷甲': eredivisieTeams,
      '葡超': primeiraLigaTeams,
      '挪超': [
        '维京', '博德闪耀', '布兰', '特罗姆瑟', '利勒斯特罗姆',
        '莫尔德', '汉坎', '腓特烈', '奥勒松', '斯达',
        '奥斯KFUM', '萨普斯堡', '瓦勒伦加', '克里斯蒂', '桑纳菲', '罗森博格'
      ],
      '芬超': [
        '图尔库国际', '古比斯', '奥卢', '埃尔维斯', '赫尔辛基',
        'TPS图尔库', '格尼斯坦', 'VPS瓦萨', '雅罗',
        '拉赫蒂', '塞那乔其', '玛丽港'
      ],
      '瑞超': [
        '天狼星', '哈马比', '佐加顿斯', '赫根', '马尔默',
        '埃夫斯堡', '米亚尔比', '瓦斯特拉斯', '盖斯',
        '布鲁马波', '索尔纳', '卡尔马', '代格福什',
        '哥德堡', '奥尔格里特', '哈尔姆斯'
      ],
    };

    const currentLeagueTeams = leagueTeams[leagueCn] || englishPremierLeagueTeams;

    if (dataPoints.length < currentLeagueTeams.length) {
      console.warn(`[crawler] ⚠ ${leagueCn}: 提取数据点(${dataPoints.length})少于预设球队数(${currentLeagueTeams.length})`);
    }
    if (dataPoints.length > currentLeagueTeams.length) {
      console.warn(`[crawler] ⚠ ${leagueCn}: 提取数据点(${dataPoints.length})多于预设球队数(${currentLeagueTeams.length}), 可能有降级/升级球队`);
    }

    const standings: StandingItem[] = [];
    for (let i = 0; i < Math.min(currentLeagueTeams.length, dataPoints.length); i++) {
      const data = dataPoints[i];
      standings.push({
        rank: i + 1,
        teamNameCn: currentLeagueTeams[i],
        teamName: currentLeagueTeams[i],
        played: data.played,
        wins: data.wins,
        draws: data.draws,
        losses: data.losses,
        goalsFor: data.goalsFor,
        goalsAgainst: data.goalsAgainst,
        points: data.points,
      });
    }

    console.log(`[crawler] ✓ ${leagueCn} 积分榜 (回退): ${standings.length} 支球队`);

    if (standings.length > 0) {
      console.log(`[crawler] 前3名:`, standings.slice(0, 3).map(s => `${s.teamNameCn}(P${s.points})`));
    }

    return standings.length > 0 ? standings : null;

  } catch (err: any) {
    console.warn(`[crawler] 积分榜爬取异常: ${err.message?.slice(0, 200)}`);
    console.warn(`[crawler] 异常堆栈:`, err.stack?.slice(0, 500));
    return null;
  } finally {
    if (page) { try { await page.close(); } catch {} }
  }
}

// ======================== 拼音 Slug 自动生成 ========================

let _pinyinModule: any = null;
async function getPinyinModule() {
  if (!_pinyinModule) {
    _pinyinModule = await import("tiny-pinyin");
  }
  return _pinyinModule.default || _pinyinModule;
}

async function generateSlug(teamNameCn: string): Promise<string> {
  // 分离中文和英文/数字部分
  const parts: string[] = [];
  let current = "";
  let isChinese = false;

  for (const ch of teamNameCn) {
    const isCh = /[一-鿿]/.test(ch);
    if (current.length === 0) {
      isChinese = isCh;
      current = ch;
    } else if (isChinese === isCh) {
      current += ch;
    } else {
      if (isChinese) {
        const pinyinMod = await getPinyinModule();
        parts.push(pinyinMod.convertToPinyin(current, "", true));
      } else {
        parts.push(current.toLowerCase().replace(/[^a-z0-9]/g, ""));
      }
      isChinese = isCh;
      current = ch;
    }
  }
  // 处理最后一部分
  if (current.length > 0) {
    if (isChinese) {
      const pinyinMod = await getPinyinModule();
      parts.push(pinyinMod.convertToPinyin(current, "", true));
    } else {
      parts.push(current.toLowerCase().replace(/[^a-z0-9]/g, ""));
    }
  }

  return parts.join("").replace(/[^a-z0-9]/g, "").toLowerCase();
}

export async function fetchTeamStatsFromQiumiwu(
  teamNameCn: string, leagueCn: string
): Promise<Partial<TeamStats> | null> {
  // slug 查找优先级：LEAGUE_PRESETS > TEAM_SLUG > 拼音自动生成
  const leagueKey = Object.keys(LEAGUE_PRESETS).find(k => LEAGUE_PRESETS[k].nameCn === leagueCn) || "";
  const presetTeamSlugs = leagueKey ? LEAGUE_PRESETS[leagueKey]?.teamSlugs : undefined;
  let slug = (presetTeamSlugs ? presetTeamSlugs[teamNameCn] : undefined) || TEAM_SLUG[teamNameCn];
  if (!slug) {
    // 拼音自动生成兜底
    slug = await generateSlug(teamNameCn);
    console.log(`[crawler] 拼音生成slug: ${teamNameCn} -> ${slug}`);
  }
  if (!slug) { console.warn(`[crawler] 无slug: ${teamNameCn} (${leagueCn})`); return null; }

  const url = `https://www.qiumiwu.com/team/${slug}/stat`;
  console.log(`[crawler] → ${teamNameCn} → ${url}`);

  const bi = await getBrowser().catch((e: Error) => {
    console.error(`[crawler] 浏览器失败: ${e.message}`);
    return null;
  });
  if (!bi) return null;

  let page: Page | null = null;
  let stats: Partial<TeamStats> = {};

  try {
    page = await bi.newPage();
    await page.setUserAgent(UA);
    await page.setViewport({ width: 1366, height: 768 });
    await page.evaluateOnNewDocument(() => {
      Object.defineProperty(navigator, "webdriver", { get: () => false });
    });

    await page.goto(url, { waitUntil: "networkidle0", timeout: 30000 });
    await new Promise<void>(r => setTimeout(r, 8000));

    // 提取锚点数据 (evaluate 返回 JSON 字符串, 在 Node 侧解析)
    const rawJson = await page.evaluate(() => {
      const anchors = document.querySelectorAll('a[href*="/league/"][href*="#"]');
      const results: Array<{hash:string;value:string;label:string;rank:string}> = [];
      for (const a of anchors) {
        const href = a.getAttribute('href') || '';
        const hashIdx = href.lastIndexOf('#');
        if (hashIdx < 0) continue;
        const hash = href.slice(hashIdx + 1).toLowerCase();
        const rawText = ((a as HTMLElement).innerText || (a as HTMLElement).textContent || '').trim();
        if (!rawText || !/[0-9]/.test(rawText)) continue;
        const lines = rawText.split('\n').filter((s: string) => s.trim());
        if (lines.length < 3) continue;
        results.push({
          hash: hash,
          value: lines[0].trim(),
          label: lines[1] ? lines[1].trim() : '',
          rank: lines.length >= 4 ? lines[3].trim() : (lines[2] ? lines[2].trim().replace(/[^0-9]/g,'') : '0')
        });
      }
      return JSON.stringify(results);
    });
    const rawItems: RawStatItem[] = JSON.parse(rawJson);

    console.log(`[crawler] 锚点: ${rawItems.length}`);

    if (rawItems.length >= 3) {
      stats = mapRawToStats(rawItems);
    } else {
      console.warn(`[crawler] 锚点不足 (${rawItems.length})`);
    }
  } catch (err: any) {
    console.warn(`[crawler] 异常: ${err.message?.slice(0, 100)}`);
  } finally {
    if (page) { try { await page.close(); } catch {} }
  }

  // 按 ALLOWED_FIELDS 过滤
  const filtered: Partial<TeamStats> = {};
  for (const f of ALLOWED_FIELDS) {
    if ((stats as any)[f] !== undefined) (filtered as any)[f] = (stats as any)[f];
  }

  const n = Object.keys(filtered).length;
  console.log(`[crawler] ${n >= 1 ? "✓" : "✗"} ${teamNameCn}: ${n} 字段`);
  return n >= 1 ? filtered : null;
}
