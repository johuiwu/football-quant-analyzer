import { Router } from 'express';
import { REAL_TEAMS, REAL_FIXTURES } from '../../src/data/realTeamsData';
import { LEAGUE_PRESETS } from '../../config/leaguePresets';
import { saveCompleteTeam } from '../../database/db';
import { computeTeamXGSplit } from '../../src/models/xg';
import { updateAllTeamElos } from '../services/eloService.js';
import { fetchLeagueStandingsFromQiumiwu } from '../services/crawlerHelper.js';

const router = Router();

// ======================== GET /sync-standings ========================
router.get('/sync-standings', async (req, res) => {
  const leagueId = (req.query.league || '').toString().trim();

  if (!leagueId) {
    return res.status(400).json({
      success: false,
      msg: 'Missing required parameter: league (e.g. EPL, LaLiga, SerieA, Bundesliga, Ligue1)',
    });
  }

  const preset = LEAGUE_PRESETS[leagueId];
  if (!preset || !preset.crawlerSlug) {
    return res.status(400).json({
      success: false,
      msg: 'Invalid or unsupported league: ' + leagueId + '. Supported: EPL, LaLiga, SerieA, Bundesliga, Ligue1',
    });
  }

  const leagueCn = preset.nameCn;
  console.log('[sync-standings] Single-league sync for: ' + leagueCn + ' (id=' + leagueId + ', slug=' + preset.crawlerSlug + ')');

  try {
    let updatedTeams = [...REAL_TEAMS];
    let allStandings = [];

    console.log('[sync-standings] --- Crawling: ' + leagueCn + ' ---');
    let standings = await Promise.race([
      fetchLeagueStandingsFromQiumiwu(leagueCn),
      new Promise((_, reject) => setTimeout(() => reject(new Error('Crawler timeout after 30s')), 30000))
    ]).catch(err => {
      const msg = err.message || String(err);
      console.warn('[sync-standings] ' + leagueCn + ': ' + msg);
      if (msg.includes('UNSUPPORTED_LEAGUE')) {
        return { __unsupported: true, reason: msg };
      }
      return null;
    });

    // Filter standings by league maxTeams
    if (standings && Array.isArray(standings) && standings.length > 0) {
      const maxTeams = preset.maxTeams || 999;
      if (standings.length > maxTeams) {
        console.log('[sync-standings] Trimming standings from ' + standings.length + ' to ' + maxTeams);
        standings = standings.slice(0, maxTeams);
      }
    }

    if (standings && typeof standings === 'object' && !Array.isArray(standings) && standings.__unsupported) {
      return res.status(400).json({
        success: false,
        msg: standings.reason || 'League not supported for crawling',
      });
    }

    if (standings && standings.length > 0) {
      console.log('[sync-standings] ' + leagueCn + ': got ' + standings.length + ' standings');

      // 为当前联赛创建本地球队名称映射（提高匹配率）
      const localTeamMap = {};
      REAL_TEAMS.filter(t => t.league === leagueId).forEach(t => {
        localTeamMap[t.nameCn] = t;                 // 中文名
        localTeamMap[t.nameCn.replace(/\s/g, '')] = t; // 去空格
        localTeamMap[t.name] = t;                    // 英文名
        localTeamMap[t.name.replace(/\s/g, '')] = t;   // 去空格
        // 添加常用别名
        const aliasMap = {
          'PSV埃因霍温': ['PSV', '埃因霍温'],
          '阿贾克斯': ['Ajax'],
          '费耶诺德': ['Feyenoord'],
          '阿尔克马尔': ['AZ', '阿尔克马'],
          '特温特': ['Twente', 'FC Twente'],
          '乌德勒支': ['Utrecht', 'FC Utrecht'],
          '海伦芬': ['Heerenveen'],
          'NEC奈梅亨': ['奈梅亨', 'NEC'],
          '前进之鹰': ['GA', 'Go Ahead'],
          '福图纳锡塔德': ['福图纳', 'Fortuna'],
          '格罗宁根': ['Groningen'],
          '特尔斯达': ['Telstar'],
          '兹沃勒': ['Zwolle', 'PEC'],
          'SBV精英': ['SBV', 'Excelsior'],
          '鹿特丹斯巴达': ['鹿斯巴达', 'Sparta'],
          'NAC布雷达': ['布雷达', 'NAC'],
          '赫拉克勒斯': ['赫拉克勒', 'Heracles'],
          '福伦丹': ['Volendam'],
        };
        const aliases = aliasMap[t.nameCn];
        if (aliases) aliases.forEach(a => { localTeamMap[a] = t; });
      });

      let matchedCount = 0;
      const matchedTeamNames = [];
      const updateTasks = [];
      for (const standing of standings) {
        const sName = (standing.teamNameCn || '').trim();
        let matchedTeam = null;

        // 策略1: 精确匹配 localTeamMap 键
        if (localTeamMap[sName]) {
          matchedTeam = localTeamMap[sName];
        }
        // 策略2: 去空格后匹配
        else if (localTeamMap[sName.replace(/\s/g, '')]) {
          matchedTeam = localTeamMap[sName.replace(/\s/g, '')];
        }
        // 策略3: 子串双向匹配（抓取名 vs 本地中/英文名）
        else {
          for (const key of Object.keys(localTeamMap)) {
            if (sName.includes(key) || key.includes(sName)) {
              matchedTeam = localTeamMap[key];
              break;
            }
          }
        }

        if (matchedTeam) {
          const idx = updatedTeams.findIndex(t => t.nameCn === matchedTeam.nameCn);
          if (idx >= 0) {
            matchedCount++;
            matchedTeamNames.push(updatedTeams[idx].nameCn);
            const team = updatedTeams[idx];
            updateTasks.push((async () => {
              const totalPlayed = standing.played;

              // 统一使用均分估算主客场数据（仅使用 qiumiwu.com 爬虫）
              const haData = null;

              const homePlayed = haData?.home?.played ?? Math.ceil(totalPlayed / 2);
              const awayPlayed = haData?.away?.played ?? Math.floor(totalPlayed / 2);

              const homeWins = haData?.home?.wins ?? Math.ceil(standing.wins * 0.55);
              const homeDraws = haData?.home?.draws ?? Math.ceil(standing.draws * 0.5);
              const homeLosses = haData?.home?.losses ?? Math.max(0, homePlayed - homeWins - homeDraws);
              const awayWins = haData?.away?.wins ?? (standing.wins - homeWins);
              const awayDraws = haData?.away?.draws ?? (standing.draws - homeDraws);
              const awayLosses = haData?.away?.losses ?? Math.max(0, awayPlayed - awayWins - awayDraws);

              const homeGoalsFor = haData?.home?.goalsFor ?? Math.ceil(standing.goalsFor * 0.55);
              const homeGoalsAgainst = haData?.home?.goalsAgainst ?? Math.ceil(standing.goalsAgainst * 0.45);
              const awayGoalsFor = haData?.away?.goalsFor ?? (standing.goalsFor - homeGoalsFor);
              const awayGoalsAgainst = haData?.away?.goalsAgainst ?? (standing.goalsAgainst - homeGoalsAgainst);

              const estCleanSheets = Math.max(0, Math.round(totalPlayed * 0.35 - (standing.goalsAgainst) * 0.18));

              const homeXG = computeTeamXGSplit({ ...team, shotsPerGame: team.shotsPerGame || 12, shotAccuracy: team.shotAccuracy || 40, league: team.league, homeStats: { ...team.homeStats, played: homePlayed, goalsFor: homeGoalsFor, goalsAgainst: homeGoalsAgainst }, awayStats: { ...team.awayStats, played: awayPlayed, goalsFor: awayGoalsFor, goalsAgainst: awayGoalsAgainst } }, true);
              const awayXG = computeTeamXGSplit({ ...team, shotsPerGame: team.shotsPerGame || 12, shotAccuracy: team.shotAccuracy || 40, league: team.league, homeStats: { ...team.homeStats, played: homePlayed, goalsFor: homeGoalsFor, goalsAgainst: homeGoalsAgainst }, awayStats: { ...team.awayStats, played: awayPlayed, goalsFor: awayGoalsFor, goalsAgainst: awayGoalsAgainst } }, false);

              updatedTeams[idx] = {
                ...team,
                rank: standing.rank,
                cleanSheets: team.cleanSheets > 0 ? team.cleanSheets : estCleanSheets,
                homeStats: {
                  ...team.homeStats,
                  played: homePlayed,
                  wins: homeWins,
                  draws: homeDraws,
                  losses: homeLosses,
                  goalsFor: homeGoalsFor,
                  goalsAgainst: homeGoalsAgainst,
                  xgFor: homeXG.xgFor,
                  xgAgainst: homeXG.xgAgainst,
                },
                awayStats: {
                  ...team.awayStats,
                  played: awayPlayed,
                  wins: awayWins,
                  draws: awayDraws,
                  losses: awayLosses,
                  goalsFor: awayGoalsFor,
                  goalsAgainst: awayGoalsAgainst,
                  xgFor: awayXG.xgFor,
                  xgAgainst: awayXG.xgAgainst,
                },
              };
            })());
          }
        } else {
          console.warn(`[sync-standings] 无法匹配球队: ${sName}`);
        }
      }
      await Promise.all(updateTasks);

      // 只保留匹配到的球队，确保 updatedTeams 数量与爬虫抓取一致
      updatedTeams = updatedTeams.filter(t => matchedTeamNames.includes(t.nameCn));

      console.log('[sync-standings] ' + leagueCn + ': ' + matchedCount + ' teams matched');
      allStandings = allStandings.concat(standings);
    } else {
      console.warn('[sync-standings] ' + leagueCn + ': crawl failed or no data');
      return res.json({
        success: true,
        teams: REAL_TEAMS.filter(t => t.league === leagueId),
        source: 'local_database_preset',
        msg: leagueCn + ' sync failed (crawler returned no data), fell back to local preset.',
      });
    }

    // ===== Dynamic Elo Update =====
    try {
      await updateAllTeamElos(updatedTeams);
    } catch (eloErr) {
      console.error('[sync-standings] Elo update failed:', eloErr);
    }

    // updatedTeams 已仅包含匹配到的当前联赛球队，直接使用
    console.log('[sync-standings] ' + updatedTeams.length + ' teams in league ' + leagueCn);

    // 填充默认字段，确保 34 列完整
    const failedTeams = [];
    const savedTeamNames = [];
    for (const team of updatedTeams) {
      team.elo = team.elo ?? null;
      team.formLast5 = team.formLast5 || [];
      team.homeXg = team.homeXg ?? 0;
      team.awayXg = team.awayXg ?? 0;
      team.shotsPerGame = team.shotsPerGame ?? 12;
      team.shotAccuracy = team.shotAccuracy ?? 40;
      team.cleanSheets = team.cleanSheets ?? 0;
      team.form = team.form || ['W','D','L','W','D'];

      try {
        await saveCompleteTeam(team);
        savedTeamNames.push(team.nameCn);
      } catch (dbErr) {
        console.error('[sync-standings] save failed for ' + team.nameCn + ':', dbErr);
        failedTeams.push(team.nameCn);
      }
    }
    console.log('[sync-standings] ' + savedTeamNames.length + '/' + updatedTeams.length + ' teams saved');

    const savedTeams = updatedTeams.filter(team => savedTeamNames.includes(team.nameCn));

    return res.json({
      success: true,
      teams: savedTeams,
      standings: allStandings,
      source: 'qiumiwu_crawler',
      syncedLeagues: [leagueCn],
      failedTeams: failedTeams.length > 0 ? failedTeams : undefined,
      msg: 'Success: ' + leagueCn + ' | Total ' + allStandings.length + ' standings, '
        + savedTeamNames.length + ' teams saved'
        + (failedTeams.length > 0 ? ' (' + failedTeams.length + ' failed: ' + failedTeams.join(', ') + ')' : '') + '.',
    });
  } catch (error) {
    console.error('[sync-standings] Error:', error);
    return res.json({
      success: true,
      teams: REAL_TEAMS.filter(t => t.league === leagueId),
      source: 'local_database_preset',
      msg: 'Sync error, fell back to local preset.',
    });
  }
});

// ======================== GET /real-fixtures ========================
router.get('/real-fixtures', async (req, res) => {
  return res.json({
    success: true,
    fixtures: REAL_FIXTURES,
    source: 'local_database_preset',
    msg: 'Loaded 2026 season core match fixtures from local curated database.',
  });
});

export default router;
