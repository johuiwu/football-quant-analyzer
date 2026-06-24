import puppeteer from 'puppeteer';
import { worldcupTeamIdToName } from '../../src/data/worldcup_data.js';
import { detectLocalBrowser } from './browserPool.js';

const STANDINGS_URL = 'https://www.livescore.com/en/football/international/world-cup-2026/standings/';
const TIMEOUT = 30000;

// livescore 英文名 → 系统 teamId 映射
const LIVESCORE_TO_TEAM_ID = {
  'USA': 'meiguo', 'Australia': 'aodaliya', 'Mexico': 'moxige', 'South Korea': 'hanguo',
  'Paraguay': 'balagui', 'Qatar': 'kataer', 'Czechia': 'jieke1', 'Bosnia and Herzegovina': 'bohei1',
  'Scotland': 'sugelan', 'Canada': 'jianada', 'Brazil': 'baxi', 'Morocco': 'moluoge',
  'Switzerland': 'ruishi', 'South Africa': 'nanfei', 'Haiti': 'haidi', 'Turkiye': 'tuerqi1',
  'Germany': 'deguo', 'Curaçao': 'kulasuo', 'Curacao': 'kulasuo', "Côte d'Ivoire": 'ketediwa1', 'Ivory Coast': 'ketediwa1', 'Ecuador': 'eguaduoer',
  'Netherlands': 'helan', 'Japan': 'riben', 'Sweden': 'ruidian1', 'Tunisia': 'tunisi1',
  'Belgium': 'bilishi', 'Egypt': 'aiji1', 'Iran': 'yilang', 'New Zealand': 'xinxilan1',
  'Spain': 'xibanya', 'Cape Verde': 'fodejiao1', 'Saudi Arabia': 'shatealabo', 'Uruguay': 'wulagui',
  'France': 'faguo', 'Senegal': 'saineijiaer', 'Iraq': 'yilake1', 'Norway': 'nuowei',
  'Argentina': 'agenting', 'Algeria': 'aerjiliya', 'Austria': 'aodili', 'Jordan': 'yuedan1',
  'Portugal': 'putaoya', 'DR Congo': 'minzhugangguo', 'Uzbekistan': 'wuzibiekesitan', 'Colombia': 'gelunbiya',
  'England': 'yinggelan', 'Croatia': 'keluodiya', 'Ghana': 'jiana', 'Panama': 'banama',
  'Korea Republic': 'hanguo', 'Czech Republic': 'jieke1', 'Turkey': 'tuerqi1',
  'United States': 'meiguo', 'Bosnia': 'bohei1'
};

/**
 * 将 livescore 英文球队名转为中文名
 */
function toChineseName(englishName) {
  const teamId = LIVESCORE_TO_TEAM_ID[englishName];
  if (teamId && worldcupTeamIdToName[teamId]) {
    return worldcupTeamIdToName[teamId].cn;
  }
  return englishName;
}

/**
 * 将小组名标准化为中文（如 "Group G" → "G组"）
 */
function normalizeGroupName(name) {
  const m = name.match(/Group\s+([A-L])/i);
  if (m) return m[1] + '组';
  return name;
}

/**
 * 爬取 livescore 积分榜页面
 * @returns {Promise<{success: boolean, groups: Array<{name: string, teams: Array}>} | {success: false, error: string}>}
 */
export async function fetchStandings() {
  let browser = null;
  try {
    // 构建浏览器启动参数
    const args = [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--ignore-certificate-errors',
    ];

    // 如果设置了代理环境变量，添加代理参数
    if (process.env.PUPPETEER_PROXY) {
      args.push(`--proxy-server=${process.env.PUPPETEER_PROXY}`);
      args.push('--host-resolver-rules=MAP * ~NOTFOUND , EXCLUDE localhost');
    }

    // headless 模式可配置
    const headless = process.env.CRAWLER_HEADLESS === 'false' ? false : 'new';

    const browserPath = detectLocalBrowser();
    if (!browserPath) {
      return { success: false, error: "系统未安装 Chrome 或 Edge" };
    }

    browser = await puppeteer.launch({
      headless,
      executablePath: browserPath,
      args,
    });

    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

    await page.goto(STANDINGS_URL, { waitUntil: 'networkidle2', timeout: TIMEOUT });

    // 在页面内执行解析逻辑，提取所有数据
    const result = await page.evaluate(() => {
      // 提取小组名
      const groupHeaders = [];
      document.querySelectorAll('[data-id="st-hdr_stg"]').forEach(el => {
        groupHeaders.push(el.textContent.trim());
      });

      // 提取所有球队行 ID（只取左侧排名区的 rw-* 行，排除右侧数据区的嵌套 rw-*）
      const rowIds = [];
      document.querySelectorAll('[data-id^="rw-"]').forEach(el => {
        const id = el.getAttribute('data-id');
        if (id && id.startsWith('rw-')) {
          // 只取包含 c-nm 子元素的行（左侧排名区），排除纯数据行
          if (el.querySelector('[data-id="c-nm"]')) {
            rowIds.push(id.replace('rw-', ''));
          }
        }
      });

      // 提取球队名：直接从每个 rw-* 行内的 c-nm > font 获取
      const teamNames = {};
      for (const tid of rowIds) {
        const rowEl = document.querySelector(`[data-id="rw-${tid}"]`);
        if (!rowEl) continue;
        const cNm = rowEl.querySelector('[data-id="c-nm"]');
        if (!cNm) continue;
        const font = cNm.querySelector('font');
        if (font) {
          teamNames[tid] = font.textContent.trim();
        } else {
          // fallback: 取 c-nm 内的文本
          const text = cNm.textContent.trim();
          teamNames[tid] = text || tid;
        }
      }

      // 为每个 teamId 提取数据字段
      const fields = ['played', 'wins', 'draws', 'losses', 'goalsFor', 'goalsAgainst', 'goalsDiff', 'points'];
      const teamData = {};

      for (const tid of rowIds) {
        const data = {};
        let hasData = false;
        for (const f of fields) {
          const el = document.querySelector(`[data-id="${tid}_lg-cl_${f}"]`);
          if (el) {
            const val = parseInt(el.textContent.trim(), 10);
            if (!isNaN(val)) {
              data[f] = val;
              hasData = true;
            }
          }
        }
        if (hasData) {
          teamData[tid] = {
            name: teamNames[tid] || tid,
            ...data,
          };
        }
      }

      // 按小组分组：每个小组4支球队，按 rowIds 顺序分配
      const groups = [];
      for (let i = 0; i < groupHeaders.length; i++) {
        const start = i * 4;
        const end = start + 4;
        const groupTids = rowIds.slice(start, end);
        const groupTeams = groupTids.map(tid => {
          const t = teamData[tid] || { name: teamNames[tid] || tid };
          return {
            teamId: tid,
            name: t.name,
            played: t.played || 0,
            wins: t.wins || 0,
            draws: t.draws || 0,
            losses: t.losses || 0,
            goalsFor: t.goalsFor || 0,
            goalsAgainst: t.goalsAgainst || 0,
            goalsDiff: t.goalsDiff || 0,
            points: t.points || 0,
          };
        });

        groups.push({
          name: groupHeaders[i],
          teams: groupTeams,
        });
      }

      return { groups };
    });

    await browser.close();

    // 将英文名映射为中文名，小组名标准化为中文
    for (const group of result.groups) {
      group.name = normalizeGroupName(group.name);
      for (const team of group.teams) {
        team.name = toChineseName(team.name);
      }
    }

    return { success: true, ...result };

  } catch (error) {
    if (browser) {
      try { await browser.close(); } catch {}
    }
    return { success: false, error: error.message };
  }
}

const SCHEDULE_URL = 'https://www.livescore.com/en/football/international/world-cup-2026/';
const RESULTS_URL = 'https://www.livescore.com/en/football/international/world-cup-2026/results/';
const LS_DETAILS_API = 'https://prod-cdn-public-api.livescore.com/v1/api/app/competition/734/details/8?locale=en';
const RESULTS_CACHE = { data: null, time: 0 };
const RESULTS_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

/**
 * 爬取 livescore 赛果页面，提取每场比赛的单场比分
 * @returns {Promise<Record<string, { homeScore: number, awayScore: number }> | null>}
 *   key 格式: 日期_时间_主队teamId_客队teamId (e.g., "2026-06-12_03:00_moxige_nanfei")
 *   Returns null if crawling fails
 */
export async function fetchMatchResults() {
  // Check cache first
  if (RESULTS_CACHE.data && Date.now() - RESULTS_CACHE.time < RESULTS_CACHE_TTL) {
    return RESULTS_CACHE.data;
  }

  try {
    // 直接调用 LiveScore Details API（无需 Puppeteer，速度快）
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000);
    const res = await fetch(LS_DETAILS_API, {
      signal: controller.signal,
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
    });
    clearTimeout(timer);

    if (!res.ok) {
      console.warn('[worldcupStandingsCrawler] LS Details API returned', res.status);
      return null;
    }

    const data = await res.json();
    const stages = data?.Stages || [];

    // 将英文名映射为系统 teamId
    const resultMap = {};
    for (const stage of stages) {
      for (const event of stage.Events || []) {
        // 只处理已完赛的比赛（Eps === 'FT'）
        if (event.Eps !== 'FT') continue;
        const homeName = event.T1?.[0]?.Nm;
        const awayName = event.T2?.[0]?.Nm;
        if (!homeName || !awayName) continue;

        const homeTeamId = LIVESCORE_TO_TEAM_ID[homeName];
        const awayTeamId = LIVESCORE_TO_TEAM_ID[awayName];
        if (!homeTeamId || !awayTeamId) continue;

        const homeScore = parseInt(event.Tr1, 10);
        const awayScore = parseInt(event.Tr2, 10);
        if (isNaN(homeScore) || isNaN(awayScore)) continue;

        const key = `${homeTeamId}_${awayTeamId}`;
        resultMap[key] = { homeScore, awayScore };
      }
    }

    if (Object.keys(resultMap).length > 0) {
      RESULTS_CACHE.data = resultMap;
      RESULTS_CACHE.time = Date.now();
      console.log(`[worldcupStandingsCrawler] Fetched ${Object.keys(resultMap).length} match results from LS Details API`);
      return resultMap;
    }

    console.warn('[worldcupStandingsCrawler] No match results from LS Details API');
    return null;

  } catch (error) {
    console.warn('[worldcupStandingsCrawler] fetchMatchResults failed:', error.message);
    return null;
  }
}
