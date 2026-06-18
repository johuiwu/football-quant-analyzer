import { useState, useEffect } from 'react';
import { 
  ShieldCheck, 
  Search, 
  TrendingUp, 
  TrendingDown, 
  Zap, 
  MapPin, 
  Dribbble, 
  Sparkles, 
  RefreshCw, 
  CheckCircle,
  HelpCircle,
  Award,
  Swords,
  Activity,
  Shield
} from 'lucide-react';
import { TeamStats, LEAGUES } from '../data/realTeamsData';
import { getExtraTeamStats } from '../data/csvTeamsStats';

interface TeamInfoSectionProps {
  teams: TeamStats[];
  onSetHomeTeam?: (teamId: string, leagueId: string) => void;
  onSetAwayTeam?: (teamId: string, leagueId: string) => void;
}

export default function TeamInfoSection({ teams, onSetHomeTeam, onSetAwayTeam }: TeamInfoSectionProps) {
  const [selectedLeague, setSelectedLeague] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [activeTeamId, setActiveTeamId] = useState<string>('mancity');
  const [statsSubTab, setStatsSubTab] = useState<'basic' | 'advanced'>('advanced');

  // AI Tactical Profiling state
  const [aiProfile, setAiProfile] = useState<string>('');
  const [loadingAi, setLoadingAi] = useState<boolean>(false);
  const [errorAi, setErrorAi] = useState<string>('');

  // Find active team stats with a safe fallback object to protect against empty results during fetch
  const fallbackTeam: TeamStats = {
    id: "mancity",
    name: "Manchester City",
    nameCn: "曼彻斯特城",
    league: "EPL",
    leagueCn: "英超",
    rank: 1,
    color: "#6CABDD",
    cleanSheets: 12,
    shotsPerGame: 16.5,
    shotAccuracy: 65,
    form: ["W", "W", "D", "W", "L"],
    homeStats: { played: 15, wins: 11, draws: 3, losses: 1, goalsFor: 40, goalsAgainst: 12, xgFor: 35.5, xgAgainst: 10.2 },
    awayStats: { played: 15, wins: 9, draws: 4, losses: 2, goalsFor: 32, goalsAgainst: 15, xgFor: 28.4, xgAgainst: 14.1 }
  };
  const activeTeam = teams.find(t => t.id === activeTeamId) || teams[0] || fallbackTeam;

  // Load team profile on active team change or fetch initiated manually
  const fetchAiTacticalProfile = async (teamId: string, force: boolean = false) => {
    if (!teamId) return;
    setLoadingAi(true);
    setErrorAi('');
    setAiProfile('');
    try {
      const response = await fetch('/api/ai-team-profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ teamId })
      });
      const data = await response.json();
      if (data.success) {
        setAiProfile(data.profile);
      } else {
        // Fallback display if AI profile is empty or key not loaded
        if (data.profile) {
          setAiProfile(data.profile);
        } else {
          setAiProfile(`获取AI特邀战术解析失败，未开启有效的 Gemini 战能推演。`);
        }
      }
    } catch (err: any) {
      console.error(err);
      setErrorAi('网络出现波动，请稍后再试。');
    } finally {
      setLoadingAi(false);
    }
  };

  useEffect(() => {
    if (activeTeamId) {
      setAiProfile(''); // Clear old
      // Generate standard offline quick-scouting report as initial profile fallback
      const quickProfile = generateOfflineProfile(activeTeam);
      setAiProfile(quickProfile);
    }
  }, [activeTeamId]);

  // Generate a detailed analytical scout report offline based on actual metrics
  function generateOfflineProfile(t: TeamStats): string {
    const homeWinRate = ((t.homeStats.wins / t.homeStats.played) * 100).toFixed(0);
    const awayWinRate = ((t.awayStats.wins / t.awayStats.played) * 100).toFixed(0);
    const homeGfAvg = (t.homeStats.goalsFor / t.homeStats.played).toFixed(1);
    const awayGfAvg = (t.awayStats.goalsFor / t.awayStats.played).toFixed(1);
    const xgDiffHome = (t.homeStats.xgFor - t.homeStats.xgAgainst).toFixed(1);
    const xgDiffAway = (t.awayStats.xgFor - t.awayStats.xgAgainst).toFixed(1);
    
    // Style description
    let style = "均衡型打法";
    if (t.shotsPerGame > 15 && t.shotAccuracy > 42) {
      style = "高压全攻全守 (Tiki-Taka / Heavy Metal Football)";
    } else if (t.cleanSheets > 12) {
      style = "铁血低位防守反击 (Solid Low-Block Counter)";
    } else if (parseFloat(homeGfAvg) > 2.0 && parseFloat(awayGfAvg) < 1.2) {
      style = "极端主场龙客场熊 (Extreme Home Fortress Bias)";
    }

    return `### 📊 ${t.nameCn} 大师级球队本地数字化分析简报
*(此为离线离谱分析，可在右侧点击「AI 检索深度推演」生成实时大师画像)*

**1. 团队技战术底盘：**
该队本赛季踢法呈现 **「${style}」** 走势。在已完成的联赛赛程中，场均可轰出 **${t.shotsPerGame} 次起脚射门**，射门精度达 **${t.shotAccuracy}%**，门前转化率处于联赛领先梯队。防守端累计零封对手 **${t.cleanSheets} 场**，后腰覆盖面广，具有顶尖的硬核抗压防守链。

**2. 主客场抗性对垒：**
- **主场绝对御力**：胜率高达 **${homeWinRate}%**，场均进球 **${homeGfAvg}个**。主场进失球实力净差值(xG)为 **${xgDiffHome}球**，展现了极其恐怖的主场魔鬼气势，适合主场作战时做首推考量。
- **客场客战韧性**：胜率为 **${awayWinRate}%**，场均进球 **${awayGfAvg}个**，客场xG实力净差为 **${xgDiffAway}球**。相较于主场有一定下浮，面临强队压迫时防反转换是其核心战术支点。

**3. 近期状态波动与爆冷预控：**
历史5场走势为 **${t.form.join(' → ')}**。近期攻守配合度稳定，但在应对硬骨头以及深度大巴球队时，由于破密集防守可能存在过度回传，需高度提防遭遇意外平局或小球冷门，投注建议以防平或双选为稳健路线。`;
  }

  // Filter team listings
  const filteredTeams = teams.filter(t => {
    const matchesLeague = selectedLeague === 'ALL' || t.league === selectedLeague;
    const matchesSearch = t.nameCn.toLowerCase().includes(searchQuery.toLowerCase()) || 
                          t.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          t.id.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesLeague && matchesSearch;
  });

  return (
    <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 animate-fadeIn" id="team-info-section">
      {/* 1. Left Side: Active Team Directory & Search */}
      <div className="xl:col-span-4 bg-[#0F1424] rounded-2xl border border-slate-800 p-4 sm:p-5 flex flex-col h-[460px] sm:h-[550px] xl:h-[760px]">
        <div className="mb-4">
          <h3 className="text-sm font-semibold text-slate-100 flex items-center gap-1.5 mb-2">
            <Award className="w-4 h-4 text-emerald-400" />
            各球队信息库 ({teams.length} 支豪门)
          </h3>
          <p className="text-[11px] text-slate-400 mb-3.5">
            快速检索各大联赛核心队伍详情，双击可在上方直接设为对决主客队列。
          </p>

          {/* Search bar */}
          <div className="relative mb-3">
            <Search className="absolute left-2.5 top-2.5 w-3.5 h-3.5 text-slate-400" />
            <input
              type="text"
              placeholder="搜索球队名称 (例: 曼城, Real...)"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-8 pr-3 py-1.5 text-xs text-slate-200 focus:border-blue-500 focus:outline-none placeholder-slate-500"
            />
          </div>

          {/* Leagues tags */}
          <div className="flex flex-wrap gap-1">
            <button
              onClick={() => setSelectedLeague('ALL')}
              className={`px-2 py-1 text-[10px] rounded font-medium transition-all ${
                selectedLeague === 'ALL'
                  ? 'bg-blue-600 text-white'
                  : 'bg-slate-900 border border-slate-800 text-slate-400 hover:text-slate-200'
              }`}
            >
              全部
            </button>
            {LEAGUES.map(l => (
              <button
                key={l.id}
                onClick={() => setSelectedLeague(l.id)}
                className={`px-2 py-1 text-[10px] rounded font-medium transition-all ${
                  selectedLeague === l.id
                    ? 'bg-blue-600 text-white'
                    : 'bg-slate-900 border border-slate-800 text-slate-400 hover:text-slate-200'
                }`}
              >
                {l.nameCn}
              </button>
            ))}
          </div>
        </div>

        {/* Scrollable list */}
        <div className="flex-1 overflow-y-auto space-y-1.5 pr-1 py-1 scrollbar-thin scrollbar-thumb-slate-800">
          {filteredTeams.length === 0 ? (
            <div className="text-center py-8 text-xs text-slate-500">
              未匹配到任何相关豪门球队
            </div>
          ) : (
            filteredTeams.map((t) => {
              const active = t.id === activeTeamId;
              return (
                <button
                  key={t.id}
                  onClick={() => setActiveTeamId(t.id)}
                  onDoubleClick={() => {
                    onSetHomeTeam && onSetHomeTeam(t.id, t.league);
                  }}
                  title="单击详情，双击可在上方直接设为主队"
                  className={`w-full text-left p-2.5 rounded-xl border transition-all flex items-center justify-between cursor-pointer ${
                    active 
                      ? 'bg-blue-950/45 border-blue-500/50 shadow-md shadow-blue-500/5' 
                      : 'bg-slate-900/60 border-slate-850 hover:bg-slate-900 hover:border-slate-850'
                  }`}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-7 h-7 rounded-lg bg-slate-950 flex items-center justify-center border border-slate-800 shrink-0">
                      <span className="text-[10px] font-mono text-emerald-400 font-bold">
                        #{t.rank}
                      </span>
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-slate-200 truncate">{t.nameCn}</p>
                      <p className="text-[10px] text-slate-400 font-mono truncate">{t.name}</p>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-950 text-slate-400 border border-slate-800 font-mono">
                      {t.leagueCn}
                    </span>
                    <span className="text-[11px] font-bold text-slate-300 font-mono">
                      {t.homeStats.wins + t.awayStats.wins}胜
                    </span>
                  </div>
                </button>
              );
            })
          )}
        </div>
      </div>

      {/* 2. Right Side: Multi-dimensional Informational Bento Panel */}
      <div className="xl:col-span-8 space-y-5">
        
        {/* Core Header Card */}
        <div className="bg-[#0F1424] rounded-2xl border border-slate-800 p-4 sm:p-5 md:p-6 relative overflow-hidden">
          {/* Subtle background decoration */}
          <div className="absolute right-0 bottom-0 top-0 w-1/3 bg-gradient-to-l from-blue-500/5 to-transparent pointer-events-none" />
          
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 rounded-2xl bg-slate-950 border border-slate-800 flex items-center justify-center shrink-0">
                <ShieldCheck className="w-8 h-8 text-emerald-400" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-lg font-bold text-slate-100">{activeTeam.nameCn}</h2>
                  <span className="text-xs px-2 py-0.5 rounded-full bg-blue-900/30 text-blue-300 border border-blue-800/40 font-mono">
                    {activeTeam.leagueCn}名列第 {activeTeam.rank} 位
                  </span>
                </div>
                <p className="text-xs text-slate-400 mt-0.5 font-mono">
                  {activeTeam.name} | 联赛标识: {activeTeam.league}
                </p>
              </div>
            </div>

            {/* Form list and overall metrics */}
            <div className="flex flex-col md:items-end gap-1.5">
              <span className="text-[11px] text-slate-400 font-semibold">
                近 5 轮战绩走势
              </span>
              <div className="flex gap-1">
                {activeTeam.form.map((f, idx) => (
                  <span
                    key={idx}
                    className={`w-6 h-6 rounded flex items-center justify-center font-bold text-[11px] font-mono shadow-sm ${
                      f === 'W' 
                        ? 'bg-emerald-900/50 text-emerald-300 border border-emerald-500/30' 
                        : f === 'D' 
                          ? 'bg-amber-900/40 text-amber-300 border border-amber-500/25' 
                          : 'bg-red-950/50 text-red-300 border border-red-500/30'
                    }`}
                  >
                    {f}
                  </span>
                ))}
              </div>
            </div>
          </div>

          {/* Core Sandbox Action bar */}
          <div className="mt-4 pt-4 border-t border-slate-800/80 flex flex-col md:flex-row md:items-center justify-between gap-3 font-sans">
            <span className="text-[11px] text-slate-400 flex items-center gap-1.5">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
              </span>
              <span>沙盘连通：一键将 {activeTeam.nameCn} 载入沙盘，参与双向精算推演</span>
            </span>
            <div className="flex gap-2 shrink-0 w-full md:w-auto">
              <button
                type="button"
                onClick={() => onSetHomeTeam && onSetHomeTeam(activeTeam.id, activeTeam.league)}
                className="flex-1 md:flex-initial px-4 py-2 bg-rose-500/10 hover:bg-rose-500/20 active:bg-rose-500/30 text-rose-400 text-xs font-semibold rounded-lg border border-rose-500/30 hover:border-rose-500/50 transition-all flex items-center justify-center gap-1.5 shadow-sm hover:translate-y-[-1px] active:translate-y-[0px] cursor-pointer"
              >
                ⚔️ 设为主场主队
              </button>
              <button
                type="button"
                onClick={() => onSetAwayTeam && onSetAwayTeam(activeTeam.id, activeTeam.league)}
                className="flex-1 md:flex-initial px-4 py-2 bg-emerald-500/10 hover:bg-emerald-500/20 active:bg-emerald-500/30 text-emerald-400 text-xs font-semibold rounded-lg border border-emerald-500/30 hover:border-emerald-500/50 transition-all flex items-center justify-center gap-1.5 shadow-sm hover:translate-y-[-1px] active:translate-y-[0px] cursor-pointer"
              >
                🛡️ 设为客场客队
              </button>
            </div>
          </div>
        </div>

        {/* Bento Grid layout */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          
          {/* Home stats comparison card */}
          <div className="bg-[#0F1424] rounded-2xl border border-slate-800 p-4 sm:p-5 space-y-4">
            <h4 className="text-xs font-bold text-slate-300 flex items-center gap-1.5 uppercase font-mono tracking-wider">
              <MapPin className="w-3.5 h-3.5 text-blue-400" />
              🏠 主客场战力对立面 (Home vs Away)
            </h4>

            <div className="space-y-3.5">
              {/* Home */}
              <div className="p-3 bg-slate-900/40 border border-slate-850 rounded-xl space-y-2">
                <div className="flex justify-between items-center text-xs">
                  <span className="text-slate-300 font-medium">主场 (Home Stadium)</span>
                  <span className="font-mono font-bold text-blue-400">
                    {activeTeam.homeStats.wins}胜 {activeTeam.homeStats.draws}平 {activeTeam.homeStats.losses}负
                  </span>
                </div>
                {/* Wins bar */}
                <div className="space-y-1">
                  <div className="flex justify-between text-[10px] text-slate-500 font-mono">
                    <span>主场进/失球: {activeTeam.homeStats.goalsFor} 进 / {activeTeam.homeStats.goalsAgainst} 丢</span>
                    <span>胜率: {((activeTeam.homeStats.wins / activeTeam.homeStats.played) * 100).toFixed(0)}%</span>
                  </div>
                  <div className="w-full h-1.5 bg-slate-950 rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-blue-500" 
                      style={{ width: `${(activeTeam.homeStats.wins / activeTeam.homeStats.played) * 100}%` }}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2 gap-2 pt-1.5 border-t border-slate-850/60 text-[10px] font-mono text-slate-400">
                  <div className="truncate">主场 xG 预期进球: <span className="text-slate-200 font-bold">{(activeTeam.homeStats.xgFor / Math.max(1, activeTeam.homeStats.played)).toFixed(2)}</span></div>
                  <div className="truncate">主场 xG 预期失球: <span className="text-slate-200 font-bold">{(activeTeam.homeStats.xgAgainst / Math.max(1, activeTeam.homeStats.played)).toFixed(2)}</span></div>
                </div>
              </div>

              {/* Away */}
              <div className="p-3 bg-slate-900/40 border border-slate-850 rounded-xl space-y-2">
                <div className="flex justify-between items-center text-xs">
                  <span className="text-slate-300 font-medium">客场 (Away Field)</span>
                  <span className="font-mono font-bold text-yellow-400">
                    {activeTeam.awayStats.wins}胜 {activeTeam.awayStats.draws}平 {activeTeam.awayStats.losses}负
                  </span>
                </div>
                {/* Wins bar */}
                <div className="space-y-1">
                  <div className="flex justify-between text-[10px] text-slate-500 font-mono">
                    <span>客场进/失球: {activeTeam.awayStats.goalsFor} 进 / {activeTeam.awayStats.goalsAgainst} 丢</span>
                    <span>胜率: {((activeTeam.awayStats.wins / activeTeam.awayStats.played) * 100).toFixed(0)}%</span>
                  </div>
                  <div className="w-full h-1.5 bg-slate-950 rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-yellow-500" 
                      style={{ width: `${(activeTeam.awayStats.wins / activeTeam.awayStats.played) * 100}%` }}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2 gap-2 pt-1.5 border-t border-slate-850/60 text-[10px] font-mono text-slate-400">
                  <div className="truncate">客场 xG 预期进球: <span className="text-slate-200 font-bold">{(activeTeam.awayStats.xgFor / Math.max(1, activeTeam.awayStats.played)).toFixed(2)}</span></div>
                  <div className="truncate">客场 xG 预期失球: <span className="text-slate-200 font-bold">{(activeTeam.awayStats.xgAgainst / Math.max(1, activeTeam.awayStats.played)).toFixed(2)}</span></div>
                </div>
              </div>
            </div>
          </div>

          {/* Key efficiency stats */}
          <div className="bg-[#0F1424] rounded-2xl border border-slate-800 p-4 sm:p-5 flex flex-col justify-between min-h-[460px] md:min-h-[400px]">
            <div>
              {/* Header with Switch Tabs */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 mb-4 border-b border-slate-800 pb-3">
                <h4 className="text-xs font-bold text-slate-300 flex items-center gap-1.5 uppercase font-mono tracking-wider">
                  <Activity className="w-4 h-4 text-emerald-400" />
                  📊 球队多维行军盘 (Tactical Performance)
                </h4>
                <div className="bg-slate-950 p-1 rounded-lg flex border border-slate-800 shrink-0 select-none">
                  <button
                    type="button"
                    onClick={() => setStatsSubTab('basic')}
                    className={`px-3 py-1 text-[11px] rounded transition-all font-semibold cursor-pointer ${
                      statsSubTab === 'basic'
                        ? 'bg-blue-600 text-white shadow'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    基础效率
                  </button>
                  <button
                    type="button"
                    onClick={() => setStatsSubTab('advanced')}
                    className={`px-3 py-1 text-[11px] rounded transition-all font-semibold cursor-pointer ${
                      statsSubTab === 'advanced'
                        ? 'bg-blue-600 text-white shadow'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    深度精算
                  </button>
                </div>
              </div>

              {statsSubTab === 'basic' ? (
                /* --- Basic Profile Panel --- */
                <div className="space-y-4 pt-1">
                  {/* Shots */}
                  <div>
                    <div className="flex justify-between items-center text-xs text-slate-300 mb-1">
                      <span>场均起脚射门</span>
                      <span className="font-mono font-bold text-slate-100">{activeTeam.shotsPerGame} 次</span>
                    </div>
                    <div className="w-full h-1.5 bg-slate-950 rounded-full overflow-hidden">
                      <div 
                        className="h-full bg-emerald-500 rounded-full" 
                        style={{ width: `${Math.min(activeTeam.shotsPerGame * 5, 100)}%` }}
                      />
                    </div>
                  </div>

                  {/* Shot Accuracy */}
                  <div>
                    <div className="flex justify-between items-center text-xs text-slate-300 mb-1">
                      <span>射门精准度 (门前射正率)</span>
                      <span className="font-mono font-bold text-slate-100">{activeTeam.shotAccuracy}%</span>
                    </div>
                    <div className="w-full h-1.5 bg-slate-950 rounded-full overflow-hidden">
                      <div 
                        className="h-full bg-purple-500 rounded-full" 
                        style={{ width: `${activeTeam.shotAccuracy}%` }}
                      />
                    </div>
                  </div>

                  {/* Clean Sheets */}
                  <div>
                    <div className="flex justify-between items-center text-xs text-slate-300 mb-1">
                      <span>当前零封对手场次 (零封率)</span>
                      <span className="font-mono font-bold text-slate-100">{activeTeam.cleanSheets} 场</span>
                    </div>
                    <div className="w-full h-1.5 bg-slate-950 rounded-full overflow-hidden">
                      <div 
                        className="h-full bg-cyan-500 rounded-full" 
                        style={{ width: `${Math.min((activeTeam.cleanSheets / 38) * 100 * 2, 100)}%` }}
                      />
                    </div>
                  </div>

                  {/* Quick stats cards */}
                  <div className="grid grid-cols-2 gap-2.5 pt-3">
                    <div className="bg-slate-900/50 rounded-lg p-2.5 border border-slate-850/60 text-center">
                      <p className="text-[10px] text-slate-500 font-mono">总战次</p>
                      <p className="text-sm font-bold text-slate-200 mt-0.5 font-mono">
                        {activeTeam.homeStats.played + activeTeam.awayStats.played} 场
                      </p>
                    </div>
                    <div className="bg-slate-900/50 rounded-lg p-2.5 border border-slate-850/60 text-center">
                      <p className="text-[10px] text-slate-500 font-mono">总进球</p>
                      <p className="text-sm font-bold text-emerald-400 mt-0.5 font-mono">
                        {activeTeam.homeStats.goalsFor + activeTeam.awayStats.goalsFor} 球
                      </p>
                    </div>
                  </div>
                </div>
              ) : (
                /* --- Advanced / Compact acts database --- */
                <div className="space-y-4">
                  {(() => {
                    const extra = getExtraTeamStats(activeTeam.id, activeTeam);
                    if (!extra) {
                      return (
                        <div className="text-center py-10 text-slate-500 text-xs">
                          暂无该队伍的高精战术数据
                        </div>
                      );
                    }
                    
                    const shotAccuracyPct = extra.shots > 0 ? ((extra.shotsOnTarget / extra.shots) * 100).toFixed(0) : '0';
                    return (
                      <div className="space-y-3 pt-1">
                        {/* 1. Core control meters */}
                        <div className="grid grid-cols-2 gap-3 pb-1">
                          {/* Possession */}
                          <div className="bg-slate-950/85 p-2.5 rounded-xl border border-slate-850/80 space-y-1">
                            <div className="flex justify-between text-[11px] text-slate-400">
                              <span>控制力 (控球率)</span>
                              <span className="font-mono text-emerald-400 font-bold">{extra.possession}%</span>
                            </div>
                            <div className="w-full h-1 bg-slate-900 rounded-full overflow-hidden">
                              <div className="h-full bg-emerald-400" style={{ width: `${extra.possession}%` }} />
                            </div>
                          </div>

                          {/* Accuracy ratio */}
                          <div className="bg-slate-950/85 p-2.5 rounded-xl border border-slate-850/80 space-y-1">
                            <div className="flex justify-between text-[11px] text-slate-400">
                              <span>射正率 ({extra.shotsOnTarget}/{extra.shots})</span>
                              <span className="font-mono text-cyan-400 font-bold">{shotAccuracyPct}%</span>
                            </div>
                            <div className="w-full h-1 bg-slate-900 rounded-full overflow-hidden">
                              <div className="h-full bg-cyan-400" style={{ width: `${shotAccuracyPct}%` }} />
                            </div>
                          </div>
                        </div>

                        {/* 2. Structured statistics grid */}
                        <div className="grid grid-cols-2 xs:grid-cols-3 gap-2 font-mono">
                          {/* Item 1: Goals & concessions */}
                          <div className="p-2 bg-slate-900/40 rounded-lg border border-slate-850 flex flex-col justify-between">
                            <span className="text-[9px] text-slate-500">进攻总数 (进/失)</span>
                            <div className="flex items-baseline gap-1 mt-1">
                              <span className="text-xs font-bold text-rose-400 font-mono">{extra.goals}</span>
                              <span className="text-[10px] text-slate-500">/</span>
                              <span className="text-xs font-bold text-slate-400 font-mono">{extra.conceded}</span>
                            </div>
                          </div>

                          {/* Item 2: Passes */}
                          <div className="p-2 bg-slate-900/40 rounded-lg border border-slate-850 flex flex-col justify-between">
                            <span className="text-[9px] text-slate-500">传球总量 (助攻)</span>
                            <div className="flex items-baseline gap-1 mt-1">
                              <span className="text-xs font-bold text-blue-400 font-mono">
                                {extra.passes >= 1000 ? `${(extra.passes / 1000).toFixed(1)}k` : extra.passes}
                              </span>
                              <span className="text-[9px] text-slate-500">({extra.assists})</span>
                            </div>
                          </div>

                          {/* Item 3: Key Shots */}
                          <div className="p-2 bg-slate-900/40 rounded-lg border border-slate-850 flex flex-col justify-between">
                            <span className="text-[9px] text-slate-500">门前威胁 (角球)</span>
                            <div className="flex items-baseline gap-1 mt-1 col-span-1">
                              <span className="text-xs font-bold text-purple-400 font-mono">{extra.shots}</span>
                              <span className="text-[10px] text-slate-500">首/</span>
                              <span className="text-xs font-bold text-slate-400 font-mono">{extra.corners}</span>
                            </div>
                          </div>

                          {/* Item 4: Defensive tackles */}
                          <div className="p-2 bg-slate-900/40 rounded-lg border border-slate-850 flex flex-col justify-between">
                            <span className="text-[9px] text-slate-500">防守拦截 (抢断)</span>
                            <div className="flex items-baseline gap-1 mt-1">
                              <span className="text-xs font-bold text-emerald-400 font-mono">{extra.interceptions}</span>
                              <span className="text-[9px] text-slate-500">({extra.tackles})</span>
                            </div>
                          </div>

                          {/* Item 5: Clearances */}
                          <div className="p-2 bg-slate-900/40 rounded-lg border border-slate-850 flex flex-col justify-between">
                            <span className="text-[9px] text-slate-500">坚固屏障 (解围)</span>
                            <span className="text-xs font-bold text-slate-300 mt-1 font-mono">{extra.clearances} 次</span>
                          </div>

                          {/* Item 6: Discipline Cards */}
                          <div className="p-2 bg-slate-900/40 rounded-lg border border-slate-850 flex flex-col justify-between">
                            <span className="text-[9px] text-slate-500">犯纪与红黄牌</span>
                            <div className="flex items-center gap-1.5 mt-1">
                              <span className="text-[11px] font-bold text-yellow-400 font-mono flex items-center gap-0.5">
                                <span className="w-1.5 h-2 bg-yellow-400 rounded-sm shrink-0" />
                                {extra.yellowCards}
                              </span>
                              <span className="text-[11px] font-bold text-red-500 font-mono flex items-center gap-0.5">
                                <span className="w-1.5 h-2 bg-red-500 rounded-sm shrink-0" />
                                {extra.redCards}
                              </span>
                              <span className="text-[9px] text-slate-500">({extra.fouls}犯)</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })()}
                </div>
              )}
            </div>

            {/* Quick tips */}
            <div className="mt-4 p-3 bg-blue-950/20 rounded-xl border border-blue-500/10 text-[11px] text-slate-400 leading-normal flex items-start gap-1.5 font-sans shrink-0">
              <span className="text-emerald-400 shrink-0 select-none">⚡</span>
              <span>
                {statsSubTab === 'basic' 
                  ? '场均起脚次数代表压制力，射正度说明致命转化比；零封次数越多说明抗寒和御险属性极佳。'
                  : '深度精算盘完整加载了赛季总传切、防守抢断拦截、角球和门萨系数，双击可在战术大沙盘同步推演胜算。'
                }
              </span>
            </div>
          </div>

        </div>

        {/* AI Tactical Profiles & Custom analysis section */}
        <div className="bg-[#0F1424] rounded-2xl border border-slate-800 p-4 sm:p-5 space-y-4">
          <div className="flex justify-between items-center border-b border-slate-800 pb-3">
            <h4 className="text-xs font-bold text-slate-300 flex items-center gap-1.5 uppercase font-mono tracking-wider">
              <Sparkles className="w-3.5 h-3.5 text-blue-400" />
              🧠 球队 AI 大师级核心战术特征画像
            </h4>
            <button
              onClick={() => fetchAiTacticalProfile(activeTeam.id, true)}
              disabled={loadingAi}
              className="text-[10px] bg-blue-600 hover:bg-blue-700 disabled:bg-blue-800 text-white font-medium px-2.5 py-1 rounded-md transition-all flex items-center gap-1 shadow-sm"
            >
              {loadingAi ? (
                <RefreshCw className="w-3 h-3 animate-spin" />
              ) : (
                <Sparkles className="w-3 h-3 text-amber-300" />
              )}
              {loadingAi ? 'AI 精算分析中...' : '点击 AI 智能生成画卷'}
            </button>
          </div>

          {/* Render markdown content */}
          <div className="bg-slate-950/60 rounded-xl p-4 border border-slate-850 max-h-[320px] overflow-y-auto text-xs text-slate-300 leading-relaxed space-y-3.5 scrollbar-thin scrollbar-thumb-slate-850">
            {errorAi && (
              <div className="text-red-400 text-center py-4 bg-red-950/20 rounded-lg border border-red-900/30">
                {errorAi}
              </div>
            )}
            
            {!errorAi && aiProfile && (
              <div className="whitespace-pre-line font-light py-0.5">
                {aiProfile}
              </div>
            )}

            {!errorAi && !aiProfile && !loadingAi && (
              <div className="text-center py-12 text-slate-500">
                点击上方「AI 智能生成画卷」按钮，即可调用 Gemini 大脑提供资深主客场技战术及可能导致的赛果冷门投注预警！
              </div>
            )}

            {loadingAi && (
              <div className="flex flex-col items-center justify-center py-12 space-y-3">
                <div className="relative">
                  <div className="w-10 h-10 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                  <span className="absolute inset-0 flex items-center justify-center text-xs">⚽</span>
                </div>
                <div className="text-center space-y-1">
                  <p className="text-slate-300 text-[11px] font-medium font-mono animate-pulse">正在精读多维度主客场攻防净值...</p>
                  <p className="text-slate-500 text-[10px]">结合 Poisson 胜率差与历史交锋轨迹推算战术画像</p>
                </div>
              </div>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}
