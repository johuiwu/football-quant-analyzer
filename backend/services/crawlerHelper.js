import dotenv from 'dotenv';
import OpenAI from 'openai';

// ======================== 爬虫懒加载 (Electron环境下禁用Puppeteer，避免Chromium冲突) ========================
dotenv.config();

const CRAWLER_DISABLED = process.env.DISABLE_CRAWLER === 'true';

let _crawler = null;
export async function getCrawler() {
  if (CRAWLER_DISABLED) return null;
  if (!_crawler) {
    try {
      _crawler = await import('../../src/crawler/qiumiwuCrawler.ts');
    } catch (e) {
      console.warn('[crawlerHelper] 爬虫模块加载失败，禁用联网同步', e?.message?.slice(0, 80));
      return null;
    }
  }
  return _crawler;
}

export async function fetchTeamStatsFromQiumiwu(teamNameCn, leagueCn) {
  const c = await getCrawler();
  if (!c) { console.warn('[crawlerHelper] 爬虫已禁用，跳过 fetchTeamStats'); return null; }
  return c.fetchTeamStatsFromQiumiwu(teamNameCn, leagueCn);
}

export async function fetchLeagueStandingsFromQiumiwu(leagueCn) {
  const c = await getCrawler();
  if (!c) { console.warn('[crawlerHelper] 爬虫已禁用，跳过 fetchLeagueStandings'); return null; }
  return c.fetchLeagueStandingsFromQiumiwu(leagueCn);
}


// ======================== DeepSeek AI 客户端懒初始化 ========================

// 运行时设置的 DeepSeek API Key（优先于 .env 中的值）
let runtimeDeepSeekKey = null;
let aiClient = null;

/**
 * 设置 DeepSeek API Key（运行时覆盖 .env 配置）
 * @param {string|null} key - API Key，传 null 或空字符串则清除运行时 Key，回退到 .env
 */
export function setDeepSeekKey(key) {
  if (key && key.trim()) {
    runtimeDeepSeekKey = key.trim();
  } else {
    runtimeDeepSeekKey = null;
  }
  // 重置客户端，下次调用时用新 Key 重新初始化
  aiClient = null;
  console.log('[DeepSeek] API Key 已更新，客户端已重置');
}

/**
 * 获取当前生效的 DeepSeek API Key
 * @returns {string|null}
 */
export function getDeepSeekKey() {
  if (runtimeDeepSeekKey) return runtimeDeepSeekKey;
  const envKey = process.env.DEEPSEEK_API_KEY;
  if (envKey && envKey !== 'MY_DEEPSEEK_API_KEY') return envKey;
  return null;
}

/**
 * 检查 DeepSeek API Key 是否已配置
 * @returns {boolean}
 */
export function isDeepSeekKeyConfigured() {
  return getDeepSeekKey() !== null;
}

export function getDeepSeekClient() {
  const key = getDeepSeekKey();
  if (!key) {
    throw new Error('DEEPSEEK_API_KEY 未配置。请在设置页面输入您的 DeepSeek API Key。');
  }
  if (!aiClient) {
    aiClient = new OpenAI({
      baseURL: 'https://api.deepseek.com',
      apiKey: key,
    });
  }
  return aiClient;
}

// ======================== 角球数据爬虫 (通用接口，模拟数据占位) ========================

/**
 * 获取比赛实时角球盘口数据
 * @param {string} matchId — 比赛标识
 * @param {string} [league] — 联赛名称（可选）
 * @returns {Promise<{cornerHome: number, cornerAway: number, cornerHandicap: number, cornerOdds: number} | null>}
 *
 * [Future] 替换为真实角球数据源（如 hga050.com 的页面抓取逻辑）
 */
export async function fetchCornerOdds(matchId, league) {
  if (CRAWLER_DISABLED) {
    console.warn('[crawlerHelper] 爬虫已禁用，跳过 fetchCornerOdds');
    return null;
  }

  // 使用 matchId 的 hashCode 生成稳定的模拟数据
  let hash = 0;
  for (let i = 0; i < matchId.length; i++) {
    hash = ((hash << 5) - hash) + matchId.charCodeAt(i);
    hash |= 0;
  }

  const seed = Math.abs(hash % 100) / 100;
  const cornerHome = Math.round((3 + seed * 4) * 10) / 10;
  const cornerAway = Math.round((2 + (1 - seed) * 4) * 10) / 10;
  const cornerHandicap = Math.round((-1.5 + seed * 3) * 4) / 4;
  const cornerOdds = Math.round((0.7 + seed * 0.6) * 100) / 100;

  console.log('[crawlerHelper] fetchCornerOdds OK: ' + matchId +
    ' handicap=' + cornerHandicap + ' odds=' + cornerOdds);

  return { cornerHome, cornerAway, cornerHandicap, cornerOdds };
}
