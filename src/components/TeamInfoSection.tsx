﻿﻿﻿﻿﻿﻿﻿﻿import { useState, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { ShieldCheck, Search, TrendingUp, Zap, MapPin, Sparkles, Info, Award, Swords, Loader2, Check, Clock } from 'lucide-react';
import { TeamStats, RankedValue } from '../data/realTeamsData';
import { ALL_LEAGUES, ALL_LEAGUE_TEAMS, LeagueTeam } from '../data/leagueTeams';
import { useAppStore } from '../store/useAppStore';

export default function TeamInfoSection() {
  const navigate = useNavigate();
  const [selectedLeague, setSelectedLeague] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [justCompleted, setJustCompleted] = useState(false);
  const [dataSource, setDataSource] = useState<string | null>(null);
  const teams = useAppStore((s) => s.teams);
  const selectedTeamId = useAppStore((s) => s.teamsPageTeamId);
  const teamStats = useAppStore((s) => s.teamsPageTeamStats);
  const setHomeAndGo = useAppStore((s) => s.setHomeAndGo);
  const setAwayAndGo = useAppStore((s) => s.setAwayAndGo);
  const setTeamsPageTeam = useAppStore((s) => s.setTeamsPageTeam);
  const updateTeamStats = useAppStore((s) => s.updateTeamStats);
  

  // ── fetchWithTimeout：60 秒超时，避免请求挂起导致页面空白 ──
  const fetchWithTimeout = async (url: string, timeoutMs = 60000) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, { signal: controller.signal });
      return res;
    } finally {
      clearTimeout(timer);
    }
  };

  // ── handleSelectTeam：直接 fetch，不依赖 useEffect ──
  const handleSelectTeam = useCallback(async (teamId: string) => {
    if (teamId === selectedTeamId) return;
    setLoading(true);
    setError('');
    setDataSource(null);
    try {
      const res = await fetchWithTimeout(`/api/team-stats/${teamId}`, 15000);
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      const data = await res.json();
      // 记录数据来源
      if (data.source) setDataSource(data.source);
      if (data.success && data.stats) {
        // 确保 homeStats/awayStats 存在
        const stats = data.stats;
        if (!stats.homeStats) stats.homeStats = { played: 0, wins: 0, draws: 0, losses: 0, goalsFor: 0, goalsAgainst: 0, xgFor: 0, xgAgainst: 0 };
        if (!stats.awayStats) stats.awayStats = { played: 0, wins: 0, draws: 0, losses: 0, goalsFor: 0, goalsAgainst: 0, xgFor: 0, xgAgainst: 0 };
        setTeamsPageTeam(teamId, stats);
        // 同步更新 store.teams 数组，使 DashboardPage 的 calculateBetsModel 使用最新数据
        const syncLeagueEntry = ALL_LEAGUE_TEAMS.find(t => t.id === teamId);
        const storeTeamId = syncLeagueEntry?.realTeamId || teamId;
        if (teams.find(t => t.id === storeTeamId)) {
          updateTeamStats(storeTeamId, {
            homeStats: stats.homeStats,
            awayStats: stats.awayStats,
            rank: stats.rank ?? undefined,
            cleanSheets: stats.cleanSheets ?? undefined,
            shotsPerGame: stats.shotsPerGame ?? undefined,
            shotAccuracy: stats.shotAccuracy ?? undefined,
            ...(stats.homeXg ? { homeXg: stats.homeXg } : {}),
            ...(stats.awayXg ? { awayXg: stats.awayXg } : {}),
          });
        }
        setError('');
      } else {
        // API 返回空数据，尝试从内置 REAL_TEAMS 中查找
        const leagueEntry = ALL_LEAGUE_TEAMS.find(t => t.id === teamId);
        const lookupId = leagueEntry?.realTeamId || teamId;
        const fallbackTeam = teams.find(t => t.id === lookupId) || teams.find(t => t.nameCn === leagueEntry?.name);
        
        if (fallbackTeam) {
          // 使用内置数据
          setTeamsPageTeam(teamId, {
            teamName: fallbackTeam.name,
            teamNameCn: fallbackTeam.nameCn,
            league: fallbackTeam.league,
            leagueCn: fallbackTeam.leagueCn,
            rank: fallbackTeam.rank,
            homeStats: fallbackTeam.homeStats,
            awayStats: fallbackTeam.awayStats,
            cleanSheets: fallbackTeam.cleanSheets,
            shotsPerGame: fallbackTeam.shotsPerGame,
            shotAccuracy: fallbackTeam.shotAccuracy,
          });
          setError('');
        } else {
          setTeamsPageTeam(teamId, null);
          setError(data.msg || data.error || '暂无数据，请点击「更新数据」获取最新统计。');
        }
      }
    } catch (err: any) {
      console.error('获取数据失败:', err);
      // API 请求失败，尝试从内置 REAL_TEAMS 中查找
      const leagueEntry = ALL_LEAGUE_TEAMS.find(t => t.id === teamId);
      const lookupId = leagueEntry?.realTeamId || teamId;
      const fallbackTeam = teams.find(t => t.id === lookupId) || teams.find(t => t.nameCn === leagueEntry?.name);
      
      if (fallbackTeam) {
        // 使用内置数据
        setTeamsPageTeam(teamId, {
          teamName: fallbackTeam.name,
          teamNameCn: fallbackTeam.nameCn,
          league: fallbackTeam.league,
          leagueCn: fallbackTeam.leagueCn,
          rank: fallbackTeam.rank,
          homeStats: fallbackTeam.homeStats,
          awayStats: fallbackTeam.awayStats,
          cleanSheets: fallbackTeam.cleanSheets,
          shotsPerGame: fallbackTeam.shotsPerGame,
          shotAccuracy: fallbackTeam.shotAccuracy,
        });
        setError('');
      } else {
        setTeamsPageTeam(teamId, null);
        if (err.name === 'AbortError') {
          setError('请求超时，请重试');
        } else if (err.message) {
          setError(`数据获取失败: ${err.message}`);
        } else {
          setError('数据获取失败');
        }
      }
    } finally { setLoading(false); }
  }, [selectedTeamId, setTeamsPageTeam, updateTeamStats, teams]);

  // ── handleUpdateStats：?refresh=true 触发爬虫 ──
  const handleUpdateStats = useCallback(async () => {
    if (!selectedTeamId) return;
    setRefreshing(true);
    setError('');
    setDataSource(null);
    setJustCompleted(false);
    const startTime = Date.now();
    // 启动耗时计时器
    const timer = setInterval(() => {
      setElapsedSeconds(Math.floor((Date.now() - startTime) / 1000));
    }, 1000);
    try {
      const res = await fetchWithTimeout(`/api/team-stats/${selectedTeamId}?refresh=true`, 90000);
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        // 501 = 独立后端不支持爬虫
        if (res.status === 501 && errData.hint === 'USE_MAIN_SERVER') {
          setError('当前后端服务不支持爬虫更新，请使用 npm run dev 启动主服务');
          setRefreshing(false);
          clearInterval(timer);
          return;
        }
        throw new Error(errData.error || `HTTP ${res.status}`);
      }
      const data = await res.json();
      // 记录数据来源
      if (data.source) setDataSource(data.source);
      if (data.success && data.stats) {
        // 确保 homeStats/awayStats 存在（非五大联赛球队从爬虫数据估算）
        const stats = data.stats;
        if (!stats.homeStats) stats.homeStats = { played: 0, wins: 0, draws: 0, losses: 0, goalsFor: 0, goalsAgainst: 0, xgFor: 0, xgAgainst: 0 };
        if (!stats.awayStats) stats.awayStats = { played: 0, wins: 0, draws: 0, losses: 0, goalsFor: 0, goalsAgainst: 0, xgFor: 0, xgAgainst: 0 };
        setTeamsPageTeam(selectedTeamId, stats);
        // 同步更新 store.teams 数组，使 DashboardPage 的 calculateBetsModel 使用最新数据
        const syncLeagueEntry = ALL_LEAGUE_TEAMS.find(t => t.id === selectedTeamId);
        const storeTeamId = syncLeagueEntry?.realTeamId || selectedTeamId;
        if (teams.find(t => t.id === storeTeamId)) {
          updateTeamStats(storeTeamId, {
            homeStats: stats.homeStats,
            awayStats: stats.awayStats,
            rank: stats.rank ?? undefined,
            cleanSheets: stats.cleanSheets ?? undefined,
            shotsPerGame: stats.shotsPerGame ?? undefined,
            shotAccuracy: stats.shotAccuracy ?? undefined,
            ...(stats.homeXg ? { homeXg: stats.homeXg } : {}),
            ...(stats.awayXg ? { awayXg: stats.awayXg } : {}),
          });
        }
        setError('');
        // 短暂成功反馈
        setRefreshing(false);
        setJustCompleted(true);
        clearInterval(timer);
        setTimeout(() => setJustCompleted(false), 2500);
        // 当 basic/advanced 均为空时给出提示
        if (!stats.basic && !stats.advanced) {
          setError('已返回预估数据（爬虫无数据），建议稍后重试或检查网络连接');
        }
      } else {
        clearInterval(timer);
        setError(data.msg || data.error || '更新失败，请稍后重试');
      }
    } catch (err: any) {
      clearInterval(timer);
      console.error('刷新数据失败:', err);
      if (err.name === 'AbortError') {
        setError('爬虫请求超时（90秒），请检查网络后重试');
      } else if (err.message) {
        setError(`刷新失败：${err.message}`);
      } else {
        setError('刷新失败：网络或服务异常');
      }
    } finally { setRefreshing(false); clearInterval(timer); }
  }, [selectedTeamId, setTeamsPageTeam, updateTeamStats, teams]);

  // ── 本地球队 ── (不再回退到 teams[0]，未找到时返回 undefined)
  const LGA: Record<string, string> = { EPL: '英超', LaLiga: '西甲', SerieA: '意甲', Bundesliga: '德甲', Ligue1: '法甲', CSL: '中超', JLeague: 'J1', KLeague1: '韩K1', KLeague2: '韩K2', Eliteserien: '挪超', Veikkausliiga: '芬超', Eredivisie: '荷甲', PrimeiraLiga: '葡超', SaudiPL: '沙特联', Allsvenskan: '瑞超' };
  // 有完整基础数据的联赛（REAL_TEAMS 中有胜平负）
  const LEAGUES_WITH_FULL_DATA = ['EPL', 'LaLiga', 'SerieA', 'Bundesliga', 'Ligue1'];

  const leagueEntry = ALL_LEAGUE_TEAMS.find(t => t.id === selectedTeamId);
  const lookupId = leagueEntry?.realTeamId || selectedTeamId;
  const activeTeam: TeamStats | undefined = teams.find(t => t.id === lookupId) ||
    (leagueEntry ? teams.find(t => t.nameCn === leagueEntry.name) : undefined);
  // activeTeam 现在可能是 undefined（球队不在内置 REAL_TEAMS 中），此时 UI 依赖 API teamStats 和 leagueEntry 展示

  // 安全的展示对象：activeTeam 不可用时从 leagueEntry/teamStats 构造最小对象
  const safeTeam = useMemo((): TeamStats => {
    if (activeTeam) return activeTeam;
    const le = leagueEntry;
    const lk = le?.leagueKey || 'EPL';
    const home = teamStats?.homeStats;
    const away = teamStats?.awayStats;
    return {
      id: le?.realTeamId || selectedTeamId,
      name: le?.englishName || '',
      nameCn: le?.name || teamStats?.teamName || '—',
      league: lk,
      leagueCn: LGA[lk] || lk,
      rank: teamStats?.rank ?? 0,
      homeStats: home || { played: 0, wins: 0, draws: 0, losses: 0, goalsFor: 0, goalsAgainst: 0, xgFor: 0, xgAgainst: 0 },
      awayStats: away || { played: 0, wins: 0, draws: 0, losses: 0, goalsFor: 0, goalsAgainst: 0, xgFor: 0, xgAgainst: 0 },
      form: ['D', 'D', 'D', 'D', 'D'],
      cleanSheets: teamStats?.cleanSheets ?? 0, 
      shotsPerGame: teamStats?.shotsPerGame ?? 0, 
      shotAccuracy: teamStats?.shotAccuracy ?? 0,
      homeXg: teamStats?.homeXg ?? 1.5,
      awayXg: teamStats?.awayXg ?? 1.5,
      formLast5: [50, 40, 35, 30, 25],
    } as TeamStats;
  }, [activeTeam, leagueEntry, selectedTeamId, teamStats]);

  const activeTeamLeague = safeTeam.league || leagueEntry?.leagueKey || 'EPL';

  // ── 画像 ──
  const teamProfile = useMemo(() => {
    const t = safeTeam; const hp = Math.max(1, t.homeStats.played), ap = Math.max(1, t.awayStats.played);
    if (!activeTeam) {
      return `### ${t.nameCn}\n*(该球队暂未录入本地离线数据库，请点击「更新数据」从 qiumiwu.com 获取最新统计)*\n\n当前展示数据为 API 实时查询结果。`;
    }
    return `### ${t.nameCn} 战术特征画像\n*(基于 ${t.leagueCn} 2025/2026 赛季数据)*\n\n**1. 技战术底盘：**\n场均可轰出 **${t.shotsPerGame} 次射门**，精度 **${t.shotAccuracy}%**，零封 **${t.cleanSheets} 场**。\n\n**2. 主客场抗性：**\n- 主场胜率 **${((t.homeStats.wins/hp)*100).toFixed(0)}%**，场均进球 **${(t.homeStats.goalsFor/hp).toFixed(1)}个**，xG净差 **${((t.homeXg > 0 ? t.homeXg : (t.homeStats?.xgFor || 0)) - (t.homeStats?.xgAgainst > 0 ? t.homeStats.xgAgainst : (t.awayXg || 0))).toFixed(1)}球**\n- 客场胜率 **${((t.awayStats.wins/ap)*100).toFixed(0)}%**，场均进球 **${(t.awayStats.goalsFor/ap).toFixed(1)}个**，xG净差 **${((t.homeXg > 0 ? t.homeXg : (t.homeStats?.xgFor || 0)) - (t.homeStats?.xgAgainst > 0 ? t.homeStats.xgAgainst : (t.awayXg || 0))).toFixed(1)}球**\n\n**3. 近期走势：** ${t.form.join(' → ')}。`;
  }, [safeTeam, activeTeam]);

  const currentLeagueInfo = ALL_LEAGUES.find(l => l.key === selectedLeague);
  const filteredTeams = ALL_LEAGUE_TEAMS.filter(t => {
    const ml = selectedLeague === 'ALL' || t.leagueKey === selectedLeague;
    const ms = !searchQuery || t.name.includes(searchQuery) || t.englishName.toLowerCase().includes(searchQuery.toLowerCase()) || t.id.includes(searchQuery);
    return ml && ms;
  });
  // 获取球队胜场：优先从 REAL_TEAMS 查找，其次从 teamStats（API 实时数据）
  // 返回 [wins, found]: found=false 表示球队无任何数据源
  const winsOf = (t: LeagueTeam): [number, boolean] => {
    const lookupId = t.realTeamId || t.id;
    const rt = teams.find(r => r.id === lookupId || r.nameCn === t.name);
    if (rt) {
      const totalWins = rt.homeStats.wins + rt.awayStats.wins;
      return [totalWins, true];
    }
    // 回退到 API 数据
    if (selectedTeamId === t.id && teamStats?.homeStats?.wins != null) {
      return [(teamStats.homeStats.wins || 0) + (teamStats.awayStats?.wins || 0), true];
    }
    return [0, false];
  };
  const hp = Math.max(1, safeTeam.homeStats.played), ap = Math.max(1, safeTeam.awayStats.played);
  const hwp = (safeTeam.homeStats.wins / hp) * 100, awp = (safeTeam.awayStats.wins / ap) * 100;
  const totalWins = safeTeam.homeStats.wins + safeTeam.awayStats.wins;
  const totalDraws = safeTeam.homeStats.draws + safeTeam.awayStats.draws;
  const totalLosses = safeTeam.homeStats.losses + safeTeam.awayStats.losses;
  const totalPlayed = totalWins + totalDraws + totalLosses;
  const totalWinRate = totalPlayed > 0 ? (totalWins / totalPlayed) * 100 : 0;
  const displayXgFor = safeTeam.homeXg > 0 ? safeTeam.homeXg : ((safeTeam.homeStats?.xgFor || 0) / Math.max(1, safeTeam.homeStats?.played || 1));
  const displayXgAgainst = (safeTeam.homeStats?.xgAgainst || 0) / Math.max(1, safeTeam.homeStats?.played || 1);
  const awayDisplayXgFor = safeTeam.awayXg > 0 ? safeTeam.awayXg : ((safeTeam.awayStats?.xgFor || 0) / Math.max(1, safeTeam.awayStats?.played || 1));
  const awayDisplayXgAgainst = (safeTeam.awayStats?.xgAgainst || 0) / Math.max(1, safeTeam.awayStats?.played || 1);
  const hxd = displayXgFor - displayXgAgainst, axd = awayDisplayXgFor - awayDisplayXgAgainst;

  return (
    <div className="max-w-7xl mx-auto p-4 space-y-5" id="team-info-section">
      <div className="grid grid-cols-12 gap-5">

        {/* ── 左侧 ── */}
        <div className="col-span-4 bg-[#0b0b0f] rounded-2xl border border-[#2a2a30] p-4 flex flex-col h-[620px]">
          <h3 className="text-sm font-bold text-slate-100 flex items-center gap-1.5 mb-1"><Award className="w-4 h-4 text-emerald-400" /> 各球队信息库 ({ALL_LEAGUE_TEAMS.length} 支豪门)</h3>
          <p className="text-[11px] text-slate-500 mb-3">快速检索各大联赛核心队伍详情，双击可在上方直接设为对决主客队列。</p>
          <div className="relative mb-3"><Search className="absolute left-2.5 top-2.5 w-3.5 h-3.5 text-slate-500" /><input type="text" placeholder="搜索球队名称 (例：曼城, Real...)" value={searchQuery} onChange={e => setSearchQuery(e.target.value)} className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-8 pr-3 py-2 text-xs text-slate-200 focus:border-blue-500 focus:outline-none placeholder-slate-600" /></div>
          <div className="flex flex-wrap gap-1 mb-3">
            <button onClick={() => setSelectedLeague('ALL')} className={`px-2 py-1 text-[10px] rounded font-medium ${selectedLeague === 'ALL' ? 'bg-blue-600 text-white' : 'bg-slate-900 border border-slate-800 text-slate-400 hover:text-slate-200'}`}>全部</button>
            {ALL_LEAGUES.map(l => (<button key={l.key} onClick={() => setSelectedLeague(l.key)} className={`px-2 py-1 text-[10px] rounded font-medium ${selectedLeague === l.key ? 'bg-blue-600 text-white' : 'bg-slate-900 border border-slate-800 text-slate-400 hover:text-slate-200'}`}>{l.name}</button>))}
          </div>
          <div className="flex-1 overflow-y-auto space-y-1 pr-1 scrollbar-thin scrollbar-thumb-slate-800">
            {filteredTeams.length === 0 ? (
              <div className="text-center py-10 text-xs text-slate-500">{searchQuery ? '无匹配' : '暂无数据'}</div>
            ) : filteredTeams.map((t: LeagueTeam) => {
              const active = t.id === selectedTeamId; const [wins, hasData] = winsOf(t);
              return (
                <button key={t.id} onClick={() => handleSelectTeam(t.id)} onDoubleClick={() => { setHomeAndGo(t.realTeamId || t.id, t.leagueKey); navigate('/dashboard'); }}
                  className={`w-full text-left px-3 py-2.5 rounded-xl border flex items-center justify-between transition-all ${active ? 'bg-blue-950/45 border-blue-500/50 shadow-md' : 'bg-slate-900/60 border-transparent hover:bg-slate-900 hover:border-slate-700'}`}>
                  <div className="flex items-center gap-2.5 min-w-0"><div className="w-7 h-7 rounded-lg bg-slate-950 flex items-center justify-center border border-slate-800 shrink-0"><span className="text-[10px] font-mono text-emerald-400 font-bold">{t.englishName?.charAt(0) || '#'}</span></div><div className="min-w-0"><p className="text-xs font-semibold text-slate-200 truncate">{t.name}</p></div></div>
                  <div className="flex items-center gap-2 shrink-0"><span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-950 text-slate-400 border border-slate-800 font-mono">{LGA[t.leagueKey] || t.leagueKey}</span><span className="text-[11px] font-bold text-slate-300 font-mono">{hasData ? `${wins}胜` : '—'}</span></div>
                </button>
              );
            })}
          </div>
        </div>

        {/* ── 右侧 ── */}
        <div className="col-span-8 space-y-5">
          {loading ? (
            <div key="panel-loading" className="text-center text-slate-400 py-16 bg-[#0b0b0f] rounded-2xl border border-[#2a2a30]"><Loader2 className="w-8 h-8 animate-spin mx-auto mb-3" /><span className="text-sm">正在加载数据...</span></div>
          ) : error && !teamStats ? (
            <div key="panel-error" className="text-center text-red-400 py-16 bg-[#0b0b0f] rounded-2xl border border-[#2a2a30]"><span className="text-sm">{error}</span></div>
          ) : !teamStats ? (
            <div key="panel-empty" className="text-center text-slate-500 py-16 bg-[#0b0b0f] rounded-2xl border border-[#2a2a30]">请从左侧选择一支球队</div>
          ) : (
            <div key="panel-content">
              {/* 区块A */}
              <div className="bg-[#0b0b0f] rounded-2xl border border-[#2a2a30] p-5 relative overflow-hidden">
                <div className="absolute right-0 bottom-0 top-0 w-1/3 bg-gradient-to-l from-blue-500/5 to-transparent pointer-events-none" />
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div className="flex items-center gap-4">
                    <div className="w-14 h-14 rounded-2xl bg-slate-950 border border-slate-800 flex items-center justify-center shrink-0"><ShieldCheck className="w-8 h-8 text-emerald-400" /></div>
                    <div>
                      <div className="flex items-center gap-2"><h2 className="text-lg font-bold text-slate-100">{teamStats?.teamName || safeTeam?.nameCn || '—'}</h2><span className="text-xs px-2 py-0.5 rounded-full bg-blue-900/30 text-blue-300 border border-blue-800/40 font-mono">{teamStats?.league || safeTeam?.leagueCn || '—'}名列第 {teamStats?.rank ?? safeTeam?.rank ?? '—'} 位</span></div>
                      <p className="text-xs text-slate-500 mt-0.5 font-mono">{safeTeam?.name || ''}</p>
                    </div>
                  </div>
                  <div className="flex flex-col md:items-end gap-1.5"><span className="text-[11px] text-slate-500 font-semibold">近 5 轮战绩走势</span><div className="flex gap-1">{(safeTeam?.form?.length ? safeTeam.form : ['—', '—', '—', '—', '—']).map((f, idx) => (<span key={`${safeTeam?.id || 'unknown'}_form_${idx}`} className={`w-6 h-6 rounded flex items-center justify-center font-bold text-[11px] shadow-sm ${f === 'W' ? 'bg-emerald-900/50 text-emerald-300 border border-emerald-500/30' : f === 'D' ? 'bg-amber-900/40 text-amber-300 border border-amber-500/25' : f === 'L' ? 'bg-red-950/50 text-red-300 border border-red-500/30' : 'bg-slate-900/50 text-slate-600 border border-slate-700/30'}`}>{f}</span>))}</div></div>
                </div>
                <div className="flex mt-4 pt-3 border-t border-slate-800/60 gap-2">
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={(e) => { e.preventDefault(); handleUpdateStats(); }}
                      disabled={refreshing || justCompleted}
                      className={`px-3 py-2 rounded-lg text-[11px] font-semibold flex items-center gap-1.5 border transition-all duration-300 ${
                        justCompleted
                          ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40 scale-105'
                          : refreshing ? 'bg-amber-500/20 text-amber-300 border-amber-500/30 cursor-wait' : 'bg-amber-600/15 hover:bg-amber-500/20 text-amber-300 border-amber-500/25 hover:scale-105'
                      }`}>
                    {justCompleted ? (
                        <span key="state-completed"><Check key="icon-check" className="w-3.5 h-3.5" /> 已更新</span>
                      ) : refreshing ? (
                        <span key="state-refreshing"><Loader2 key="icon-loading" className="w-3.5 h-3.5 animate-spin" /> 等待更新中...{elapsedSeconds > 0 && <span className="ml-1 text-[9px] opacity-60 font-mono">{elapsedSeconds}s</span>}</span>
                      ) : (
                        <span key="state-idle"><Zap key="icon-zap" className="w-3.5 h-3.5" /> 更新数据</span>
                      )}</button>
                    {refreshing && (
                      <span className="text-[9px] px-1.5 py-0.5 rounded-full font-mono bg-amber-900/30 text-amber-400 border border-amber-500/20 flex items-center gap-1 animate-pulse">
                        <Clock className="w-2.5 h-2.5" />{elapsedSeconds}s
                      </span>
                    )}
                    {dataSource && !refreshing && !justCompleted && (
                      <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-mono border ${
                        dataSource === 'live' ? 'bg-emerald-900/30 text-emerald-400 border-emerald-500/30 animate-pulse' :
                        dataSource === 'cache' || dataSource === 'sqlite' ? 'bg-blue-900/30 text-blue-400 border-blue-500/30' :
                        'bg-slate-800/50 text-slate-500 border-slate-600/30'
                      }`}>
                        {dataSource === 'live' ? '实时' : dataSource === 'cache' || dataSource === 'sqlite' ? '缓存' : dataSource}
                      </span>
                    )}
                    {error && !refreshing && (
                      <span className="text-[10px] px-2 py-1 rounded bg-rose-500/10 text-rose-400 border border-rose-500/20">{error}</span>
                    )}
                  </div>
                  <button onClick={() => { setHomeAndGo(safeTeam.id, activeTeamLeague); navigate('/dashboard'); }} className="flex-1 py-2 rounded-lg text-[11px] font-semibold bg-gradient-to-r from-rose-600 to-red-700 hover:from-rose-500 hover:to-red-600 text-white flex items-center justify-center gap-1.5 border border-rose-500/30 shadow-lg shadow-rose-950/30"><ShieldCheck className="w-3.5 h-3.5" /> 设为主场主队</button>
                  <button onClick={() => { setAwayAndGo(safeTeam.id, activeTeamLeague); navigate('/dashboard'); }} className="flex-1 py-2 rounded-lg text-[11px] font-semibold bg-slate-700 hover:bg-slate-600 text-slate-200 flex items-center justify-center gap-1.5 border border-slate-600/40"><Swords className="w-3.5 h-3.5" /> 设为客场客队</button>
                </div>
              </div>

              {/* 区块B — 综合战力指数 + 关键指标 */}
              <div className="grid grid-cols-12 gap-5">
                <div className="col-span-7 space-y-4">
                  {/* 综合战力指数卡片 */}
                  <div className="bg-[#0b0b0f] rounded-2xl border border-[#2a2a30] p-4 space-y-3">
                    <h4 className="text-[11px] font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5"><TrendingUp className="w-3.5 h-3.5 text-purple-400" /> 综合战力指数</h4>
                    <div className="flex justify-between items-center text-[11px]">
                      <span className="text-slate-300 font-mono">{totalWins}胜 {totalDraws}平 {totalLosses}负</span>
                      <span className="font-mono font-bold text-emerald-400">胜率: {totalWinRate.toFixed(0)}%</span>
                    </div>
                    <div>
                      <div className="flex justify-between text-[10px] text-slate-500 mb-1"><span>战力指数</span><span>{totalWinRate.toFixed(0)}%</span></div>
                      <div className="w-full bg-slate-950 h-2.5 rounded-full overflow-hidden"><div className="h-2.5 rounded-full bg-gradient-to-r from-blue-500 via-purple-500 to-emerald-400" style={{ width: `${Math.min(totalWinRate, 100)}%` }} /></div>
                    </div>
                    <div className="grid grid-cols-2 gap-3 pt-1">
                      <div><span className="block text-[10px] text-slate-500">xG 预期进球</span><span className="text-base font-bold text-emerald-400 font-mono">{displayXgFor.toFixed(2)}</span></div>
                      <div><span className="block text-[10px] text-slate-500">xG 预期失球</span><span className="text-base font-bold text-rose-400 font-mono">{displayXgAgainst.toFixed(2)}</span></div>
                    </div>
                    <div className="pt-1"><span className="text-[10px] text-slate-500">xG 净差值</span><span className={`text-sm font-bold font-mono ml-2 ${hxd >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>{hxd >= 0 ? '+' : ''}{hxd.toFixed(2)}</span></div>
                  </div>
                </div>
                <div className="col-span-5 bg-[#0b0b0f] rounded-2xl border border-[#2a2a30] p-4 space-y-5">
                  <h4 className="text-[11px] font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5"><TrendingUp className="w-3.5 h-3.5 text-purple-400" /> 关键进攻防守指标</h4>
                  {[{ label: '场均起脚射门', val: safeTeam?.shotsPerGame ?? '—', pct: Math.min((safeTeam?.shotsPerGame || 0) * 5, 100), c: 'blue' }, { label: '射门精准度', val: safeTeam?.shotAccuracy != null ? `${safeTeam.shotAccuracy}%` : '—', pct: safeTeam?.shotAccuracy || 0, c: 'emerald' }, { label: '赛季零封对手场次', val: safeTeam?.cleanSheets ?? '—', pct: Math.min(((safeTeam?.cleanSheets || 0) / 38) * 100 * 2, 100), c: 'cyan' }].map(({ label, val, pct, c }) => (
                    <div key={label}><div className="flex justify-between items-center text-xs text-slate-300 mb-1.5"><span>{label}</span><span className="font-mono font-bold text-slate-100">{val}</span></div><div className="w-full h-2 bg-slate-950 rounded-full overflow-hidden"><div className={`h-2 rounded-full bg-gradient-to-r from-${c}-500 to-${c}-400`} style={{ width: `${Math.min(pct, 100)}%` }} /></div></div>
                  ))}
                </div>
              </div>

              {/* 进阶统计 — 直接使用 API 原始结构 teamStats.basic[key].total */}
              <div className="space-y-5">
                <div className="bg-[#151518] rounded-xl border border-[#2a2a30] p-4">
                  <h3 className="text-sm font-bold mb-4 text-slate-300 flex items-center gap-2"><TrendingUp className="w-4 h-4 text-cyan-400" /> 基础统计数据</h3>
                  <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 gap-2">
                    {['goals','conceded','goalDifference','corners','avgGoals','avgConceded','avgGoalDiff','avgCorners','shots','shotsOnTarget','assists','passes','penalties','fouls','redCards','yellowCards'].map(key => {
                      const v = (teamStats?.basic as any)?.[key] as RankedValue | null;
                      const dv = v && typeof v.total === 'number' ? (['avgGoals','avgConceded','avgGoalDiff','avgCorners'].includes(key) && v.total > 100 ? (v.total / 100).toFixed(1) : v.total) : '—';
                      const LB: Record<string,string> = {goals:'进球',conceded:'失球',goalDifference:'净胜球',corners:'角球',avgGoals:'场均进球',avgConceded:'场均失球',avgGoalDiff:'场均净胜',avgCorners:'场均角球',shots:'射门',shotsOnTarget:'射正',assists:'助攻',passes:'传球',penalties:'点球',fouls:'犯规',redCards:'红牌',yellowCards:'黄牌'};
                      return (<div key={key} className="bg-[#1f1f25] p-2.5 rounded-lg flex flex-col items-center text-center"><span className="text-lg font-bold text-slate-100 font-mono">{dv}</span><span className="text-[10px] text-slate-400 mt-0.5">{LB[key]}</span></div>);
                    })}
                  </div>
                </div>
                <div className="bg-[#151518] rounded-xl border border-[#2a2a30] p-4">

                  <h3 className="text-sm font-bold mb-4 text-slate-300 flex items-center gap-2"><Zap className="w-4 h-4 text-purple-400" /> 高阶战术数据</h3>

                  <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-8 gap-2">

                    {['possession','clearances','tackles','twoYellowRedCards','interceptions','effectiveBlocks','offsides','foulsSuffered','passesSuccessful','keyPasses','crosses','crossesSuccessful','longBalls','successfulLongBalls','freeKicks','freeKickGoals','dribbles','successfulDribbles','duelsTotal','duelsWon','fastBreaks','fastBreakShots','fastBreakGoals','hitWoodwork','possessionLost','matchesPlayed'].map(key => {

                      let val: string | number = '—';

                      if (key === 'matchesPlayed') {

                        const played = (teamStats?.homeStats?.played ?? 0) + (teamStats?.awayStats?.played ?? 0);

                        val = played > 0 ? played : '—';

                      } else {

                        const raw = (teamStats?.advanced as any)?.[key];

                        val = raw ? ('value' in raw ? (raw as any).value : (raw as RankedValue).total) : '—';

                        if (key === 'possession' && typeof val === 'number') val = val + '%';

                      }

                      const LB: Record<string,string> = {possession:'控球率',clearances:'解围',tackles:'抢断',twoYellowRedCards:'两黄变红',interceptions:'拦截',effectiveBlocks:'有效封堵',offsides:'越位',foulsSuffered:'被侵犯',passesSuccessful:'传球成功率',keyPasses:'关键传球',crosses:'传中',crossesSuccessful:'成功传中',longBalls:'长传',successfulLongBalls:'成功长传',freeKicks:'任意球',freeKickGoals:'任意球进球',dribbles:'盘带',successfulDribbles:'成功盘带',duelsTotal:'对抗总数',duelsWon:'对抗获胜',fastBreaks:'快反',fastBreakShots:'快反射门',fastBreakGoals:'快反进球',hitWoodwork:'中柱',possessionLost:'丢球权',matchesPlayed:'比赛场次'};

                      return (<div key={key} className="bg-[#1f1f25] p-2.5 rounded-lg flex flex-col items-center text-center"><span className="text-lg font-bold text-purple-300 font-mono">{val}</span><span className="text-[10px] text-slate-400 mt-0.5">{LB[key]}</span></div>);

                    })}

                  </div>

                </div>



              </div>

              {/* 区块C */}
              <div className="bg-[#0b0b0f] rounded-2xl border border-[#2a2a30] p-5 space-y-4">
                <div className="flex justify-between items-center border-b border-[#2a2a30] pb-3"><h4 className="text-xs font-bold text-slate-300 flex items-center gap-1.5 uppercase tracking-wider"><Sparkles className="w-3.5 h-3.5 text-purple-400" /> 球队 AI 大师级核心战术特征画像</h4><button className="text-[10px] px-3 py-1.5 rounded-lg bg-indigo-600/20 text-indigo-300 border border-indigo-500/30 hover:bg-indigo-600/30 font-semibold">点击 AI 智能生成画像</button></div>
                <pre className="text-[11px] text-slate-300 whitespace-pre-wrap leading-relaxed font-sans overflow-x-auto max-h-80 overflow-y-auto bg-slate-950/50 rounded-lg p-4">{teamProfile}</pre>
                <div className="pt-2 text-[10px] text-amber-500/70 flex items-center gap-1"><Info className="w-3 h-3" /> AI 模块暂不可用，使用本地离线分析引擎</div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
