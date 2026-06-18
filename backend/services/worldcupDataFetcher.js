import * as cheerio from 'cheerio';

const REQUEST_TIMEOUT = 5000;
const DELAY_BETWEEN_REQUESTS = 1200;
const MAX_MATCHES = 10;

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchWithTimeout(url, timeout = REQUEST_TIMEOUT) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5'
      }
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.text();
  } finally {
    clearTimeout(timer);
  }
}

function extractTeamUrlFromFlashscoreSearch(html) {
  const $ = cheerio.load(html);
  const teamLinks = $('a[href*="/team/"]');
  for (let i = 0; i < teamLinks.length; i++) {
    const el = $(teamLinks[i]);
    const href = el.attr('href');
    const text = el.text().toLowerCase().trim();
    if (href && text) {
      return href.startsWith('http') ? href : `https://www.flashscore.com${href}`;
    }
  }
  const searchResults = $('[class*="search"] a[href*="/team/"]');
  for (let i = 0; i < searchResults.length; i++) {
    const el = $(searchResults[i]);
    const href = el.attr('href');
    if (href) {
      return href.startsWith('http') ? href : `https://www.flashscore.com${href}`;
    }
  }
  const anyTeamLink = $('a[href*="/team/"]').first();
  const href = anyTeamLink.attr('href');
  if (href) {
    return href.startsWith('http') ? href : `https://www.flashscore.com${href}`;
  }
  return null;
}

function extractResultsUrlFromTeamPage(html, baseUrl) {
  const $ = cheerio.load(html);
  const resultsLinks = $('a[href*="results"]');
  for (let i = 0; i < resultsLinks.length; i++) {
    const href = $(resultsLinks[i]).attr('href');
    if (href) {
      return href.startsWith('http') ? href : `${baseUrl}${href}`;
    }
  }
  return null;
}

function tryParseScore(text) {
  if (!text) return null;
  const trimmed = text.trim();
  const match = trimmed.match(/^(\d+)\s*[:–-]\s*(\d+)$/);
  if (match) {
    return { home: parseInt(match[1], 10), away: parseInt(match[2], 10) };
  }
  return null;
}

function parseFlashscoreMatchRow($, row, teamName) {
  const result = {
    date: '', opponent: '', competition: '',
    xg: 0, xa: 0, possession: 0, shotsOnTarget: 0, corners: 0,
    goalsFor: 0, goalsAgainst: 0
  };

  try {
    const rowText = $(row).text();
    const dateEl = $(row).find('[class*="time"]').first();
    if (dateEl.length) {
      result.date = dateEl.text().trim();
    } else {
      const timeEls = $(row).find('span').filter((_, el) => {
        const t = $(el).text().trim();
        return /^\d{2,4}[./-]\d{2}[./-]\d{2,4}$/.test(t);
      });
      if (timeEls.length) {
        result.date = $(timeEls.first()).text().trim();
      }
    }

    const allLinks = $(row).find('a');
    for (let i = 0; i < allLinks.length; i++) {
      const linkText = $(allLinks[i]).text().trim();
      if (linkText && linkText.toLowerCase() !== teamName.toLowerCase() && linkText.length > 1) {
        if (!result.opponent) {
          result.opponent = linkText;
        }
      }
    }

    const scoreEl = $(row).find('[class*="score"]').first();
    if (scoreEl.length) {
      const parsed = tryParseScore(scoreEl.text());
      if (parsed) {
        result.goalsFor = parsed.home;
        result.goalsAgainst = parsed.away;
      }
    } else {
      const allSpans = $(row).find('span');
      for (let i = 0; i < allSpans.length; i++) {
        const parsed = tryParseScore($(allSpans[i]).text());
        if (parsed) {
          result.goalsFor = parsed.home;
          result.goalsAgainst = parsed.away;
          break;
        }
      }
    }

    const compEl = $(row).find('[class*="league"], [class*="tournament"], [class*="competition"]').first();
    if (compEl.length) {
      result.competition = compEl.text().trim();
    }

    const statEls = $(row).find('[class*="stat"], [class*="detail"]');
    statEls.each((_, el) => {
      const text = $(el).text().trim().toLowerCase();
      const val = parseFloat(text) || 0;

      if (text.includes('xg') || text.includes('xG') || text.includes('expected goals')) {
        if (!result.xg) result.xg = val;
      }
      if (text.includes('possession') || text.includes('%')) {
        if (!result.possession) result.possession = val;
      }
      if (text.includes('shots on') || text.includes('shot on')) {
        if (!result.shotsOnTarget) result.shotsOnTarget = val;
      }
      if (text.includes('corner')) {
        if (!result.corners) result.corners = val;
      }
    });

    if (!result.competition) {
      const text = rowText;
      const compMatch = text.match(/(World Cup|Friendly|Qualification|Nations League|Euro|Copa America|Africa Cup|Asian Cup|Confederations Cup)[\s\S]{0,30}/i);
      if (compMatch) {
        result.competition = compMatch[1];
      }
    }
  } catch (e) {
    return null;
  }

  if (!result.opponent && !result.date) return null;
  if (!result.opponent) result.opponent = 'Unknown';
  if (!result.competition) result.competition = 'International';

  return result;
}

function parseFlashscoreResultsPage(html, teamName) {
  const $ = cheerio.load(html);
  const matches = [];

  const rows = $('div[class*="match"], div[class*="event"], tr[class*="match"], tr[class*="event"], div[class*="row"]');
  rows.each((_, row) => {
    if (matches.length >= MAX_MATCHES) return false;
    const parsed = parseFlashscoreMatchRow($, row, teamName);
    if (parsed) {
      matches.push(parsed);
    }
  });

  if (matches.length === 0) {
    const allDivs = $('div').filter((_, el) => {
      const text = $(el).text();
      return text.includes(teamName) && /\d+\s*[:–-]\s*\d+/.test(text);
    });
    allDivs.each((_, el) => {
      if (matches.length >= MAX_MATCHES) return false;
      const parent = $(el).closest('div[class]');
      if (parent.length) {
        const parsed = parseFlashscoreMatchRow($, parent, teamName);
        if (parsed) {
          matches.push(parsed);
        }
      }
    });
  }

  return matches;
}

async function fetchFromFlashscore(teamName) {
  const baseUrl = 'https://www.flashscore.com';

  const searchHtml = await fetchWithTimeout(`${baseUrl}/search/?q=${encodeURIComponent(teamName)}`);
  await delay(DELAY_BETWEEN_REQUESTS);

  const teamUrl = extractTeamUrlFromFlashscoreSearch(searchHtml);
  if (!teamUrl) {
    console.warn(`[worldcupDataFetcher] Could not find flashscore team URL for ${teamName}`);
    return [];
  }

  const teamHtml = await fetchWithTimeout(teamUrl);
  await delay(DELAY_BETWEEN_REQUESTS);

  const resultsUrl = extractResultsUrlFromTeamPage(teamHtml, baseUrl);
  const targetUrl = resultsUrl || (teamUrl.endsWith('/') ? `${teamUrl}results/` : `${teamUrl}/results/`);

  let resultsHtml;
  try {
    resultsHtml = await fetchWithTimeout(targetUrl);
  } catch (e) {
    if (resultsUrl) throw e;
    const altUrl = teamUrl.endsWith('/') ? `${teamUrl}results` : `${teamUrl}/results`;
    resultsHtml = await fetchWithTimeout(altUrl);
  }

  const matches = parseFlashscoreResultsPage(resultsHtml, teamName);
  return matches.slice(0, MAX_MATCHES);
}

function extractTeamUrlFromLivescoreSearch(html) {
  const $ = cheerio.load(html);
  const teamLinks = $('a[href*="/team/"]');
  for (let i = 0; i < teamLinks.length; i++) {
    const href = $(teamLinks[i]).attr('href');
    if (href) {
      return href.startsWith('http') ? href : `https://www.livescore.com${href}`;
    }
  }
  const anyLink = $('a[href*="team"]').first();
  const href = anyLink.attr('href');
  if (href) {
    return href.startsWith('http') ? href : `https://www.livescore.com${href}`;
  }
  return null;
}

function parseLivescoreMatchRow($, row, teamName) {
  const result = {
    date: '', opponent: '', competition: '',
    xg: 0, xa: 0, possession: 0, shotsOnTarget: 0, corners: 0,
    goalsFor: 0, goalsAgainst: 0
  };

  try {
    const rowText = $(row).text();

    const dateEl = $(row).find('[class*="date"], [class*="time"]').first();
    if (dateEl.length) {
      result.date = dateEl.text().trim();
    }

    const allAnchors = $(row).find('a');
    for (let i = 0; i < allAnchors.length; i++) {
      const text = $(allAnchors[i]).text().trim();
      if (text && text.toLowerCase() !== teamName.toLowerCase() && text.length > 1) {
        if (!result.opponent) {
          result.opponent = text;
        }
      }
    }

    const scoreEl = $(row).find('[class*="score"]').first();
    if (scoreEl.length) {
      const parsed = tryParseScore(scoreEl.text());
      if (parsed) {
        result.goalsFor = parsed.home;
        result.goalsAgainst = parsed.away;
      }
    } else {
      const text = rowText;
      const scoreMatch = text.match(/(\d+)\s*[:–-]\s*(\d+)/);
      if (scoreMatch) {
        result.goalsFor = parseInt(scoreMatch[1], 10);
        result.goalsAgainst = parseInt(scoreMatch[2], 10);
      }
    }

    const compEl = $(row).find('[class*="league"], [class*="tournament"]').first();
    if (compEl.length) {
      result.competition = compEl.text().trim();
    }

    if (!result.competition) {
      const text = rowText;
      const compMatch = text.match(/(World Cup|Friendly|Qualification|Nations League|Euro|Copa America|Africa Cup|Asian Cup|Confederations Cup)/i);
      if (compMatch) {
        result.competition = compMatch[1];
      }
    }
  } catch (e) {
    return null;
  }

  if (!result.opponent && !result.date) return null;
  if (!result.opponent) result.opponent = 'Unknown';
  if (!result.competition) result.competition = 'International';

  return result;
}

function parseLivescoreResultsPage(html, teamName) {
  const $ = cheerio.load(html);
  const matches = [];

  const rows = $('div[class*="match"], div[class*="event"], tr[class*="match"], tr[class*="event"], div[class*="row"]');
  rows.each((_, row) => {
    if (matches.length >= MAX_MATCHES) return false;
    const parsed = parseLivescoreMatchRow($, row, teamName);
    if (parsed) {
      matches.push(parsed);
    }
  });

  return matches;
}

async function fetchFromLivescore(teamName) {
  const baseUrl = 'https://www.livescore.com';

  const searchHtml = await fetchWithTimeout(`${baseUrl}/en/search/?q=${encodeURIComponent(teamName)}`);
  await delay(DELAY_BETWEEN_REQUESTS);

  const teamUrl = extractTeamUrlFromLivescoreSearch(searchHtml);
  if (!teamUrl) {
    console.warn(`[worldcupDataFetcher] Could not find livescore team URL for ${teamName}`);
    return [];
  }

  const teamHtml = await fetchWithTimeout(teamUrl);
  await delay(DELAY_BETWEEN_REQUESTS);

  let resultsHtml;
  try {
    const resultsUrl = teamUrl.endsWith('/') ? `${teamUrl}results/` : `${teamUrl}/results/`;
    resultsHtml = await fetchWithTimeout(resultsUrl);
  } catch (e) {
    resultsHtml = teamHtml;
  }

  const matches = parseLivescoreResultsPage(resultsHtml, teamName);
  return matches.slice(0, MAX_MATCHES);
}

export async function fetchTeamRecentStats(teamId, teamName) {
  let matches = [];

  try {
    matches = await fetchFromFlashscore(teamName);
    if (matches.length > 0) return matches;
  } catch (err) {
    console.warn(`[worldcupDataFetcher] flashscore failed for ${teamName} (${teamId}): ${err.message}`);
  }

  await delay(DELAY_BETWEEN_REQUESTS);

  try {
    matches = await fetchFromLivescore(teamName);
    if (matches.length > 0) return matches;
  } catch (err) {
    console.warn(`[worldcupDataFetcher] livescore failed for ${teamName} (${teamId}): ${err.message}`);
  }

  console.warn(`[worldcupDataFetcher] All sources failed for team ${teamName} (${teamId}), returning empty`);
  return [];
}

export async function fetchMultipleTeamsRecentStats(teams) {
  const results = {};

  for (const team of teams) {
    try {
      const stats = await fetchTeamRecentStats(team.id, team.name);
      results[team.id] = stats;
    } catch (err) {
      console.warn(`[worldcupDataFetcher] fetchMultipleTeamsRecentStats: team ${team.name} (${team.id}) failed: ${err.message}`);
      results[team.id] = [];
    }
    await delay(DELAY_BETWEEN_REQUESTS);
  }

  return results;
}

// 获取世界杯已完赛场次的统计数据（从 livescore API 获取）
export async function fetchWorldCupMatchResults() {
  try {
    const catData = await Promise.all([
      fetch('https://prod-cdn-stats-api.livescore.com/api/v1/competition/734/participantStats/group/goals?limit=50&locale=en', {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
      }).then(r => r.ok ? r.json() : null),
      fetch('https://prod-cdn-stats-api.livescore.com/api/v1/competition/734/participantStats/group/clean_sheets?limit=50&locale=en', {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
      }).then(r => r.ok ? r.json() : null)
    ]);

    const goalsData = catData[0];
    const cleanSheetsData = catData[1];

    if (!goalsData?.group?.participants) return [];

    const results = [];
    for (const p of goalsData.group.participants) {
      const name = goalsData.participants?.find(x => x.id === p.id)?.name || '';
      if (!name) continue;
      const cs = cleanSheetsData?.group?.participants?.find(x => x.id === p.id);
      const played = cs?.p || 1;
      results.push({
        participantName: name,
        goals: p.g,
        xG: p.xG,
        played
      });
    }
    return results;
  } catch (err) {
    return [];
  }
}
