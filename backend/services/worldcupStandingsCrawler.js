import puppeteer from 'puppeteer';

const STANDINGS_URL = 'https://www.livescore.com/en/football/international/world-cup-2026/standings/';
const TIMEOUT = 30000;

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
    const headless = process.env.CRAWLER_HEADLESS !== 'false' ? true : { headless: 'new' };

    browser = await puppeteer.launch({
      headless,
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
    return { success: true, ...result };

  } catch (error) {
    if (browser) {
      try { await browser.close(); } catch {}
    }
    return { success: false, error: error.message };
  }
}
