import { Router } from 'express';
import path from 'path';
import sqlite3 from 'sqlite3';
import { REAL_TEAMS, REAL_FIXTURES } from '../../src/data/realTeamsData';
import { LEAGUE_PRESETS } from '../../config/leaguePresets';
import { saveCompleteTeam } from '../../database/db';
import { computeTeamXGSplit } from '../../src/models/xg';
import { updateAllTeamElos } from '../services/eloService.js';
import { fetchLeagueStandingsFromQiumiwu } from '../services/crawlerHelper.js';

const router = Router();
const UNDERSTAT_LEAGUES_GLOBAL = ['英超', '西甲', '意甲', '德甲', '法甲', 'EPL', 'LaLiga', 'SerieA', 'Bundesliga', 'Ligue1'];

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

            // ====== Understat 拦截：从数据库读取 season_xg，计算场均 xG ======
            const UNDERSTAT_LEAGUES = ['英超', '西甲', '意甲', '德甲', '法甲', 'EPL', 'LaLiga', 'SerieA', 'Bundesliga', 'Ligue1'];
            let understatAvgXG = 0, understatAvgXGA = 0;
            let understatMeta = null;
            if (UNDERSTAT_LEAGUES.includes(team.league)) {
              try {
                const dbPath = path.resolve('database/football_data.db');
                const dbRow = await new Promise((resolve, reject) => {
                  const db = new sqlite3.Database(dbPath, sqlite3.OPEN_READONLY, (err) => {
                    if (err) { reject(err); return; }
                    db.get('SELECT season_xg, season_xga, season_xpts, season_ppda, season_ppda_allowed, season_npxgd FROM teams WHERE team_id = ?', [team.id], (err2, row) => {
                      db.close();
                      if (err2) reject(err2); else resolve(row);
                    });
                  });
                });
                if (dbRow && dbRow.season_xg > 0) {
                  const played = standing.played || 38;
                  understatAvgXG = dbRow.season_xg / played;
                  understatAvgXGA = dbRow.season_xga / played;
                  understatMeta = {
                    seasonXpts: dbRow.season_xpts || 0,
                    seasonPpda: dbRow.season_ppda || 0,
                    seasonPpdaAllowed: dbRow.season_ppda_allowed || 0,
                    seasonNpxgd: dbRow.season_npxgd || 0,
                    matches: played,
                  };
                  console.log(`✅ [Understat 锁定] ${team.nameCn} 场均 xG: ${understatAvgXG.toFixed(2)} (xGA: ${understatAvgXGA.toFixed(2)})`);
                }
              } catch (dbErr) {
                // 查询失败不影响主流程
              }
            }

            updateTasks.push((async () => {
              const totalPlayed = standing.played;

              // 统一为总胜平负，不再估算主客场分配
              const homePlayed = totalPlayed;
              const awayPlayed = 0;
              const homeWins = standing.wins;
              const homeDraws = standing.draws;
              const homeLosses = standing.losses;
              const awayWins = 0;
              const awayDraws = 0;
              const awayLosses = 0;
              const homeGoalsFor = standing.goalsFor;
              const homeGoalsAgainst = standing.goalsAgainst;
              const awayGoalsFor = 0;
              const awayGoalsAgainst = 0;

              const homeXG = computeTeamXGSplit({ ...team, shotsPerGame: team.shotsPerGame || 12, shotAccuracy: team.shotAccuracy || 40, league: team.league, homeStats: { played: homePlayed, goalsFor: homeGoalsFor, goalsAgainst: homeGoalsAgainst }, awayStats: { played: awayPlayed, goalsFor: awayGoalsFor, goalsAgainst: awayGoalsAgainst } }, true);
              const awayXG = computeTeamXGSplit({ ...team, shotsPerGame: team.shotsPerGame || 12, shotAccuracy: team.shotAccuracy || 40, league: team.league, homeStats: { played: homePlayed, goalsFor: homeGoalsFor, goalsAgainst: homeGoalsAgainst }, awayStats: { played: awayPlayed, goalsFor: awayGoalsFor, goalsAgainst: awayGoalsAgainst } }, false);

              // Understat 数据写入数据库，保留主客场差异
              if (understatAvgXG > 0) {
                try {
                  const dbPath2 = path.resolve('database/football_data.db');
                  await new Promise((resolve, reject) => {
                    const db2 = new sqlite3.Database(dbPath2, sqlite3.OPEN_READWRITE, (err) => {
                      if (err) { reject(err); return; }
                      console.log(`[防覆盖验证] 正在更新 ${team.name} 的战术数据，home_xg 将被锁定在当前值: ${team.homeXg}`);
                      db2.run(
                        'UPDATE teams SET home_xg = home_xg, away_xg = away_xg WHERE team_id = ?',
                        [team.id],
                        (err2) => { db2.close(); if (err2) reject(err2); else resolve(); }
                      );
                    });
                  });
                } catch (dbErr) {
                  console.warn(`[Understat] 数据库更新失败: ${dbErr.message}`);
                }
              }

              // Understat 优先，否则用 xgService 推算
              const finalHomeXg = understatAvgXG > 0 ? understatAvgXG : homeXG.xgFor;
              const finalAwayXg = understatAvgXG > 0 ? understatAvgXGA : awayXG.xgFor;
              const finalXgAgainst = understatAvgXGA > 0 ? understatAvgXGA : homeXG.xgAgainst;
              if (understatAvgXG <= 0) {
                console.log(`[xgService] 回退到推算 xG: ${homeXG.xgFor.toFixed(2)}`);
              }

              updatedTeams[idx] = {
                ...team,
                rank: standing.rank,
                cleanSheets: 0,
                homeXg: finalHomeXg,
                awayXg: finalAwayXg,
                ...(understatMeta || {}),
                homeStats: {
                  played: homePlayed,
                  wins: homeWins,
                  draws: homeDraws,
                  losses: homeLosses,
                  goalsFor: homeGoalsFor,
                  goalsAgainst: homeGoalsAgainst,
                  xgFor: finalHomeXg,
                  xgAgainst: finalXgAgainst,
                },
                awayStats: {
                  played: 0, wins: 0, draws: 0, losses: 0,
                  goalsFor: 0, goalsAgainst: 0,
                  xgFor: 0, xgAgainst: 0,
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
        if (team.homeXg > 0 && UNDERSTAT_LEAGUES_GLOBAL.includes(team.league)) {
          console.log(`[防覆盖验证] saveCompleteTeam 前检查: ${team.nameCn} homeXg=${team.homeXg} awayXg=${team.awayXg}`);
        }
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
