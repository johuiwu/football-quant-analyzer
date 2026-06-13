import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  FileCode, Flame, TrendingUp, BarChart3, Download, CheckCircle,
  AlertTriangle, Cpu, Layers, Info, RefreshCw, Sliders, HelpCircle,
  Dices, Scale, Activity, Calculator, Calendar
} from 'lucide-react';
import { TeamStats, LEAGUES } from '../data/realTeamsData';
import { calculateBetsModel, PredictionResults, ModelWeights, AdvancedParams, LiveBayesianParams, calculateBayesianLiveUpdate, convertAsianTo1X2, syncMatchToAsianHandicap, AsianHandicapParams, calculateDynamicAsianHandicap, extractAsianHandicapFeatures, AsianHandicapFeatures, BetsModelInput } from '../utils/quantModel';
import { TeamRadarChart } from '../components/TeamRadarChart';
import { CornerKickStrategyChart } from '../components/CornerKickStrategyChart';
import { ErrorBoundary } from "../components/ErrorBoundary";
import { useAppStore } from '../store/useAppStore';
import { useCornerStore } from '../store/cornerStore';

import { AggregationDecisionCenter } from '../components/AggregationDecisionCenter';
import { BayesianLiveMatchMonitor } from '../components/BayesianLiveMatchMonitor';
import { ApiKeySettings } from '../components/ApiKeySettings';
import { DeepSeekKeyModal } from '../components/DeepSeekKeyModal';
import { useAIAnalysis } from '../hooks/useAIAnalysis';
import { ValidationService } from '../services/ValidationService';
import AdvancedParamsPanel from '../components/AdvancedParamsPanel';
import ModelWeightsPanel from '../components/ModelWeightsPanel';

export default function DashboardPage() {
  const selectedHomeId = useAppStore((s) => s.selectedHomeId);
  const selectedAwayId = useAppStore((s) => s.selectedAwayId);
  const activeTab = useAppStore((s) => s.activeTab);
  const selectedHomeLeague = useAppStore((s) => s.selectedHomeLeague);
  const selectedAwayLeague = useAppStore((s) => s.selectedAwayLeague);
  const resetToDefaults = useAppStore((s) => s.resetToDefaults);
  const setHomeTeam = useAppStore((s) => s.setHomeTeam);
  const setAwayTeam = useAppStore((s) => s.setAwayTeam);
  const setSelectedMatchId = useAppStore((s) => s.setSelectedMatchId);
  const selectedMatchId = useAppStore((s) => s.selectedMatchId);
  const setHomeLeague = useAppStore((s) => s.setHomeLeague);
  const setAwayLeague = useAppStore((s) => s.setAwayLeague);
  const teams = useAppStore((s) => s.teams);
  const fixtures = useAppStore((s) => s.fixtures);
  const fixtureSyncMsg = useAppStore((s) => s.fixtureSyncMsg);
  const fixtureSyncSource = useAppStore((s) => s.fixtureSyncSource);
  const isFixturesLoading = useAppStore((s) => s.isFixturesLoading);
  const loadRealTimeFixtures = useAppStore((s) => s.loadRealTimeFixtures);
  const loadRealTimeStandings = useAppStore((s) => s.loadRealTimeStandings);
  const liveMatchState = useAppStore((s) => s.liveMatch);
  const dispatchLiveMatch = useAppStore((s) => s.dispatchLiveMatch);


  const prevHomeLeagueRef = useRef<string>(selectedHomeLeague);
  const prevAwayLeagueRef = useRef<string>(selectedAwayLeague);

  // ===== Internal state =====
  const [results, setResults] = useState<PredictionResults | null>(null);
  const [calculationError, setCalculationError] = useState<string | null>(null);
  const [showKeyModal, setShowKeyModal] = useState<boolean>(false);
  const [goalsLine, setGoalsLine] = useState<number>(2.5);
  const [returnRate, setReturnRate] = useState<number>(0.94);
  const [useSystemWeights, setUseSystemWeights] = useState<boolean>(true);
  const [showParamWarning, setShowParamWarning] = useState<boolean>(false);
  const [isStatsCustomized, setIsStatsCustomized] = useState<boolean>(false);
  const [selectedFixtureId, setSelectedFixtureId] = useState<string>('');
  const [accordionStates, setAccordionStates] = useState({ basicProbabilities: true, xGDetails: false, aiAnalysis: false, liveMonitor: false, worldCup: false });
  const [useCustomWeights, setUseCustomWeights] = useState<boolean>(false);

  const [advancedParams, setAdvancedParams] = useState<AdvancedParams>({
    homeFatigue: 1, awayFatigue: 1, homeInjuries: 3, awayInjuries: 3,
    homeWaterTrend: 'STABLE', awayWaterTrend: 'STABLE',
    homeBetVolume: 45, awayBetVolume: 35, drawBetVolume: 20,
  } as AdvancedParams);

  const [customWeights, setCustomWeights] = useState<ModelWeights>({
    odds: 0.45, strength: 0.30, homeAway: 0.15, h2h: 0.10, form: 0.05,
  } as ModelWeights);

  const [asianHandicap, setAsianHandicap] = useState<AsianHandicapParams>({
    handicap: -0.5, homeWater: 0.92, awayWater: 0.92,
  });

  const [customStats, setCustomStats] = useState({
    homeWins: 14, homeDraws: 4, homeLosses: 1, homeGoalsFor: 48, homeGoalsAgainst: 16, homeXgFor: 44.5, homeXgAgainst: 15.2,
    awayWins: 13, awayDraws: 3, awayLosses: 3, awayGoalsFor: 40, awayGoalsAgainst: 14, awayXgFor: 37.5, awayXgAgainst: 14.2,
    form: ['W','W','W','W','D'] as ('W'|'D'|'L')[],
  });
  // ===== Computed values =====
  const homeTeamsList = useMemo(() => teams.filter(t => t.league === selectedHomeLeague), [teams, selectedHomeLeague]);
  const awayTeamsList = useMemo(() => teams.filter(t => t.league === selectedAwayLeague), [teams, selectedAwayLeague]);

  const asianFeatures = useMemo<AsianHandicapFeatures>(() => {
    return extractAsianHandicapFeatures(asianHandicap);
  }, [asianHandicap]);

  const convertedOdds = useMemo(() => {
    return convertAsianTo1X2(asianHandicap.handicap, asianHandicap.homeWater, asianHandicap.awayWater, returnRate, selectedHomeLeague);
  }, [asianHandicap, returnRate]);

  const odds = useMemo(() => ({
    home: convertedOdds.homeOdds,
    draw: convertedOdds.drawOdds,
    away: convertedOdds.awayOdds,
  }), [convertedOdds]);

  // ===== Default team fallback =====
  const defaultTeam: TeamStats = {
    id: 'default', teamId: 0, nameCn: 'unknown', name: 'Unknown',
    league: 'default', leagueCn: 'unknown', rank: 10,
    homeXg: 1.5, awayXg: 1.5,
    homeStats: { played: 10, wins: 4, draws: 3, losses: 3, goalsFor: 12, goalsAgainst: 10, xgFor: 11, xgAgainst: 10 },
    awayStats: { played: 10, wins: 4, draws: 3, losses: 3, goalsFor: 12, goalsAgainst: 10, xgFor: 11, xgAgainst: 10 },
    form: ['D','D','D','D','D'] as ('W'|'D'|'L')[],
    cleanSheets: 3, shotsPerGame: 12, shotAccuracy: 40, formLast5: [50,40,35,30,25],
  };

  // ===== Computed: home/away teams =====
  const selectedTeams = useMemo((): { home: TeamStats; away: TeamStats } => {
    let originalHome = teams.find(t => t.id === selectedHomeId);
    let originalAway = teams.find(t => t.id === selectedAwayId);
    if (!originalHome) {
      const homeLeagueTeams = teams.filter(t => t.league === selectedHomeLeague);
      originalHome = homeLeagueTeams.length > 0 ? homeLeagueTeams[0] : (teams[0] || defaultTeam);
    }
    if (!originalAway) {
      const awayLeagueTeams = teams.filter(t => t.league === selectedAwayLeague);
      originalAway = awayLeagueTeams.length > 0 ? awayLeagueTeams[0] : (teams[1] || teams[0] || originalHome || defaultTeam);
    }
    return { home: originalHome, away: originalAway };
  }, [teams, selectedHomeId, selectedAwayId, selectedHomeLeague, selectedAwayLeague]);
  const home = selectedTeams.home;
  const away = selectedTeams.away;

  // ===== AI analysis hook =====
  const aiAnalysisHook = useAIAnalysis();
  useEffect(() => {
    if (aiAnalysisHook.needsApiKey) {
      setShowKeyModal(true);
    }
  }, [aiAnalysisHook.needsApiKey]);
  const { analysis: aiAnalysis, isLoading: isAiLoading, validationWarning: aiValidationWarning, needsApiKey, fetchAiAnalysis: rawFetchAiAnalysis } = aiAnalysisHook;

  // ===== Live results =====
  const liveResults = useMemo(() => {
    if (!results) return null;
    const bayesianParams: LiveBayesianParams = {
      elapsedMinutes: liveMatchState.elapsedMinutes,
      liveHomeGoals: liveMatchState.homeScore,
      liveAwayGoals: liveMatchState.awayScore,
      homeRedCards: liveMatchState.homeRedCards,
      awayRedCards: liveMatchState.awayRedCards
    };
    return calculateBayesianLiveUpdate(results, bayesianParams, home, away);
  }, [results, liveMatchState, home, away]);

  // ===== Handlers =====
  const handleSelectFixture = (fixtureId: string) => {
    setSelectedFixtureId(fixtureId);
    if (!fixtureId) return;
    const fixture = fixtures.find(f => f.id === fixtureId);
    if (fixture) {
      const homeTeamExists = teams.some(t => t.id === fixture.homeTeamId);
      const awayTeamExists = teams.some(t => t.id === fixture.awayTeamId);
      if (homeTeamExists && awayTeamExists) {
        setHomeLeague(fixture.homeLeague, fixture.homeTeamId);
        setAwayLeague(fixture.awayLeague, fixture.awayTeamId);
        const asian = syncMatchToAsianHandicap(fixture.defaultOdds, fixture.homeLeague);
        setAsianHandicap(asian);
        setGoalsLine(fixture.defaultGoalsLine);
        setIsStatsCustomized(false);
          const homeTeam = teams.find(t => t.id === fixture.homeTeamId);
          const awayTeam = teams.find(t => t.id === fixture.awayTeamId);
          if (homeTeam && awayTeam) {
            setSelectedMatchId(homeTeam.nameCn + '_vs_' + awayTeam.nameCn);
          }
      } else {
        console.warn('Fixture references non-existent teams:', fixtureId);
      }
    }
  };

  const checkAbnormalParams = (params: AdvancedParams, weights?: ModelWeights) => {
    const weightsToCheck = useSystemWeights ? undefined : weights;
    const isAbnormal = ValidationService.checkAbnormalParams(params, weightsToCheck);
    setShowParamWarning(isAbnormal);
  };
  const handleRecalculate = useCallback(() => {
    if (teams.length === 0) {
      console.log('[Dashboard] teams为空，跳过计算');
      return;
    }
    const { home: h, away: a } = selectedTeams;
    if (!h?.id || !h?.league || !h?.homeStats || !h?.nameCn ||
        !a?.id || !a?.league || !a?.homeStats || !a?.nameCn) {
      console.warn('[Dashboard] selectedTeams数据不完整，跳过计算');
      return;
    }

    // 当自定义stats开启时，将customStats合并到球队数据中
    let effectiveHome = h;
    let effectiveAway = a;
    if (isStatsCustomized) {
      effectiveHome = {
        ...h,
        homeStats: {
          ...h.homeStats,
          wins: customStats.homeWins,
          draws: customStats.homeDraws,
          losses: customStats.homeLosses,
          goalsFor: customStats.homeGoalsFor,
          goalsAgainst: customStats.homeGoalsAgainst,
          xgFor: customStats.homeXgFor,
          xgAgainst: customStats.homeXgAgainst,
        },
        form: customStats.form,
        homeXg: customStats.homeXgFor,
      };
      effectiveAway = {
        ...a,
        awayStats: {
          ...a.awayStats,
          wins: customStats.awayWins,
          draws: customStats.awayDraws,
          losses: customStats.awayLosses,
          goalsFor: customStats.awayGoalsFor,
          goalsAgainst: customStats.awayGoalsAgainst,
          xgFor: customStats.awayXgFor,
          xgAgainst: customStats.awayXgAgainst,
        },
        homeXg: customStats.awayXgFor,
        awayXg: customStats.awayXgFor,
      };
    }

    const finalWeights = useCustomWeights && !useSystemWeights ? customWeights : undefined;
    const selectedFixture = selectedFixtureId ? fixtures.find(f => f.id === selectedFixtureId) : null;
    const input: BetsModelInput = {
      homeTeam: effectiveHome,
      awayTeam: effectiveAway,
      odds1X2: odds,
      asianFeatures,
      goalsLine,
      customWeights: finalWeights,
      advancedParams,
      fusionWeights: { oddsChannel: 0.7, asianChannel: 0.3 },
      competitionType: selectedFixture?.competitionType || (selectedHomeLeague === 'WorldCup' || selectedAwayLeague === 'WorldCup' ? 'Cup' : 'League'),
      homeTeamId: effectiveHome.teamId || 0,
      awayTeamId: effectiveAway.teamId || 0
    };
    try {
      const computed = calculateBetsModel(input);
      setResults(computed);
      setCalculationError(null);
    } catch (err: any) {
      console.error('[handleRecalculate] Calculation error:', err);
      setCalculationError(err?.message || 'Calculation error');
      setResults(null);
    }
    checkAbnormalParams(advancedParams, customWeights);
  }, [odds, asianFeatures, goalsLine, useCustomWeights, useSystemWeights, customWeights, advancedParams, selectedTeams, selectedFixtureId, fixtures, isStatsCustomized, customStats]);

  const enableStatsCustomizer = () => {
    const hTeam = teams.find(t => t.id === selectedHomeId) || teams[0];
    const aTeam = teams.find(t => t.id === selectedAwayId) || teams[1];
    setCustomStats({
      homeWins: hTeam.homeStats.wins,
      homeDraws: hTeam.homeStats.draws,
      homeLosses: hTeam.homeStats.losses,
      homeGoalsFor: hTeam.homeStats.goalsFor,
      homeGoalsAgainst: hTeam.homeStats.goalsAgainst,
      homeXgFor: hTeam.homeStats.xgFor,
      homeXgAgainst: hTeam.homeStats.xgAgainst,
      awayWins: aTeam.awayStats.wins,
      awayDraws: aTeam.awayStats.draws,
      awayLosses: aTeam.awayStats.losses,
      awayGoalsFor: aTeam.awayStats.goalsFor,
      awayGoalsAgainst: aTeam.awayStats.goalsAgainst,
      awayXgFor: aTeam.awayStats.xgFor,
      awayXgAgainst: aTeam.awayStats.xgAgainst,
      form: [...hTeam.form]
    });
    setIsStatsCustomized(true);
  };

  const toggleAccordion = (key: keyof typeof accordionStates) => setAccordionStates({...accordionStates, [key]: !accordionStates[key]});

  // ===== Effects =====
  useEffect(() => {
    handleRecalculate();
  }, [handleRecalculate]);

  useEffect(() => {
    const { home: h, away: a } = selectedTeams;
    const dynamicAsian = calculateDynamicAsianHandicap(h, a, advancedParams.homeInjuries, advancedParams.awayInjuries);
    setAsianHandicap(dynamicAsian);
  }, [selectedHomeId, selectedAwayId, advancedParams.homeInjuries, advancedParams.awayInjuries]);

  useEffect(() => {
    const homeLeagueChanged = prevHomeLeagueRef.current !== selectedHomeLeague;
    const awayLeagueChanged = prevAwayLeagueRef.current !== selectedAwayLeague;
    if (homeLeagueChanged) {
      prevHomeLeagueRef.current = selectedHomeLeague;
      const homeTeamExists = homeTeamsList.some(t => t.id === selectedHomeId);
      if (!homeTeamExists && homeTeamsList.length > 0) {
        setHomeTeam(homeTeamsList[0].id, selectedHomeLeague);
      }
    }
    if (awayLeagueChanged) {
      prevAwayLeagueRef.current = selectedAwayLeague;
      const awayTeamExists = awayTeamsList.some(t => t.id === selectedAwayId);
      if (!awayTeamExists && awayTeamsList.length > 0) {
        setAwayTeam(awayTeamsList[0].id, selectedAwayLeague);
      }
    }
  }, [selectedHomeLeague, selectedAwayLeague, homeTeamsList, awayTeamsList]);

  // 当teams从空变为非空时，校正当前球队选择
  useEffect(() => {
    if (teams.length === 0) return;
    // 校正主队：如果当前选中的球队不在当前联赛中，自动选择该联赛第一个球队
    const homeTeamExists = teams.some(t => t.id === selectedHomeId);
    if (!homeTeamExists) {
      const homeLeagueTeams = teams.filter(t => t.league === selectedHomeLeague);
      if (homeLeagueTeams.length > 0) {
        setHomeTeam(homeLeagueTeams[0].id, selectedHomeLeague);
      }
    }
    // 校正客队
    const awayTeamExists = teams.some(t => t.id === selectedAwayId);
    if (!awayTeamExists) {
      const awayLeagueTeams = teams.filter(t => t.league === selectedAwayLeague);
      if (awayLeagueTeams.length > 0) {
        setAwayTeam(awayLeagueTeams[0].id, selectedAwayLeague);
      }
    }
  }, [teams]); // 仅在teams变化时触发

  // teams就绪后触发重算（当teams从空变为非空时，确保handleRecalculate被调用）
  useEffect(() => {
    if (teams.length > 0) {
      handleRecalculate();
    }
  }, [teams.length > 0]); // eslint-disable-line react-hooks/exhaustive-deps
  // ===== Dashboard JSX (migrated from AppNew.tsx L501-L1738) =====
  return (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">

            {/* 左边：物理模型输入与调整 */}
            <div className="lg:col-span-4 flex flex-col gap-6">
              
              {/* 1. 对战选取与赔率参数 */}
              <div className="p-5 bg-[#0F1424] rounded-2xl border border-slate-800/80 shadow-xl relative overflow-hidden">
                <div className="absolute top-0 right-0 w-24 h-24 bg-gradient-to-br from-blue-500/10 to-transparent blur-3xl pointer-events-none" />
                
                <h3 className="text-sm font-semibold text-slate-200 flex items-center gap-2 mb-4">
                  <span className="w-1.5 h-3.5 bg-blue-500 rounded-full" />
                  对决阵容与初盘数据
                </h3>

                {/* 2026 真实热门赛程选择 */}
                <div className="mb-4 bg-slate-900/60 p-3 rounded-xl border border-slate-800/60">
                  <div className="flex justify-between items-center mb-1.5">
                    <label className="text-[11px] font-semibold text-blue-400 flex items-center gap-1.5">
                      <Calendar className="w-3.5 h-3.5 shrink-0 text-emerald-400" />
                      📅 接入每日最新真实赛程
                    </label>
                    <button
                      onClick={loadRealTimeFixtures}
                      title="从内置高保真赛事数据库载入最新对阵"
                      disabled={isFixturesLoading}
                      className="text-[10px] text-blue-400 hover:text-blue-300 font-semibold flex items-center gap-1 transition-all cursor-pointer"
                    >
                      <RefreshCw className={`w-2.5 h-2.5 shrink-0 ${isFixturesLoading ? 'animate-spin' : ''}`} />
                      {isFixturesLoading ? "同步中..." : "联网刷新"}
                    </button>
                  </div>
                  <select
                    value={selectedFixtureId}
                    onChange={(e) => handleSelectFixture(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-850 rounded-lg px-2 py-1.5 text-xs text-slate-200 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 font-medium"
                  >
                    <option value="">-- 手动配置队伍与自定义初盘 --</option>
                    {fixtures.map(f => (
                      <option key={f.id} value={f.id}>
                        [{f.stageCn}] {f.name} {f.matchTime ? `(${f.matchTime.split(' ')[0]})` : ''}
                      </option>
                    ))}
                  </select>
                  {selectedFixtureId && (
                    <div className="mt-1.5 flex justify-between items-center px-1">
                      <span className="text-[10px] text-slate-400 font-mono">
                        已同步真实初指及进球盘口 ({odds.home} / {odds.draw} / {odds.away})
                      </span>
                      <button
                        onClick={() => setSelectedFixtureId('')}
                        className="text-[10px] text-[#FF3E6C] hover:underline"
                        title="断开赛程绑定，回归自定义调整"
                      >
                        断开赛程绑定
                      </button>
                    </div>
                  )}
                  <div className="mt-2 pt-1.5 border-t border-slate-850/40 flex items-center justify-between text-[10px] text-slate-500 font-mono leading-tight">
                    <span className="truncate max-w-[210px]" title={fixtureSyncMsg}>
                      {fixtureSyncSource === 'google_search_grounding' ? '🟢 联网同步: ' : '🔵 本地预置: '}{fixtureSyncMsg}
                    </span>
                    <span className="shrink-0 bg-slate-950 px-1 py-0.5 text-[8px] rounded border border-slate-850 text-slate-400 font-bold uppercase tracking-wider">
                      {fixtureSyncSource === 'google_search_grounding' ? 'WebAI' : 'PRESET'}
                    </span>
                  </div>
                </div>

                {/* API Key 设置 */}
                <ApiKeySettings />

                <div className="grid grid-cols-2 gap-4 mb-4">
                  <div>
                    <label className="block text-[11px] text-slate-400 mb-1">主队联赛分类</label>
                    <select
                      value={selectedHomeLeague}
                      onChange={(e) => {
                        const list = teams.filter(t => t.league === e.target.value);
                        const firstId = list.length > 0 ? list[0].id : selectedHomeId;
                        setHomeLeague(e.target.value, firstId);
                        setSelectedFixtureId('');
                        setIsStatsCustomized(false);
                      }}
                      className="w-full bg-slate-900 border border-slate-850 rounded-lg px-2 py-1.5 text-xs text-slate-200 focus:border-blue-500 focus:outline-none"
                    >
                      {LEAGUES.map(l => (
                        <option key={l.id} value={l.id}>{l.nameCn}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-[11px] text-slate-400 mb-1">客队联赛分类</label>
                    <select
                      value={selectedAwayLeague}
                      onChange={(e) => {
                        const list = teams.filter(t => t.league === e.target.value);
                        const firstId = list.length > 0 ? list[0].id : selectedAwayId;
                        setAwayLeague(e.target.value, firstId);
                        setSelectedFixtureId('');
                        setIsStatsCustomized(false);
                      }}
                      className="w-full bg-slate-900 border border-slate-850 rounded-lg px-2 py-1.5 text-xs text-slate-200 focus:border-blue-500 focus:outline-none"
                    >
                      {LEAGUES.map(l => (
                        <option key={l.id} value={l.id}>{l.nameCn}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4 mb-5">
                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1">选择主队 (Home)</label>
                    <select
                      value={selectedHomeId}
                      onChange={(e) => {
                        setHomeTeam(e.target.value, selectedHomeLeague);
                        setIsStatsCustomized(false);
                        setSelectedFixtureId('');
                      }}
                      className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-xs font-semibold text-slate-200 focus:border-blue-500 focus:outline-none"
                    >
                      {homeTeamsList.map(t => (
                        <option key={t.id} value={t.id}>
                          #{t.rank} {t.nameCn}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1">选择客队 (Away)</label>
                    <select
                      value={selectedAwayId}
                      onChange={(e) => {
                        setAwayTeam(e.target.value, selectedAwayLeague);
                        setIsStatsCustomized(false);
                        setSelectedFixtureId('');
                      }}
                      className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-xs font-semibold text-slate-200 focus:border-blue-500 focus:outline-none"
                    >
                      {awayTeamsList.map(t => (
                        <option key={t.id} value={t.id}>
                          #{t.rank} {t.nameCn}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* 亚盘让球配置面板 */}
                <div className="bg-slate-900/60 p-3.5 rounded-xl border border-slate-800/60 space-y-3.5">
                  <div className="flex justify-between items-center">
                    <span className="text-xs font-medium text-slate-300">亚盘让球盘口 & 主客水位</span>
                    <span className="text-[10px] font-mono text-amber-400 bg-amber-500/10 px-1.5 py-0.5 rounded">亚盘精算</span>
                  </div>

                  {/* 盘口选择器 */}
                  <div>
                    <label className="block text-[11px] text-slate-400 mb-1.5">盘口 (让球方)</label>
                    <select
                      value={asianHandicap.handicap}
                      onChange={(e) => setAsianHandicap({ ...asianHandicap, handicap: Number(e.target.value) })}
                      className="w-full px-3 py-2 text-sm font-mono bg-slate-950 border border-slate-800 rounded-lg
                        text-slate-200 appearance-none cursor-pointer
                        focus:outline-none focus:ring-2 focus:ring-amber-500/50 focus:border-amber-500/50
                        hover:border-slate-700 transition-colors"
                    >
                      <option value={-2.0} className="bg-slate-900 text-slate-200">主让两球 (-2.0)</option>
                      <option value={-1.75} className="bg-slate-900 text-slate-200">主让球半/两球 (-1.75)</option>
                      <option value={-1.5} className="bg-slate-900 text-slate-200">主让球半 (-1.5)</option>
                      <option value={-1.25} className="bg-slate-900 text-slate-200">主让一球/球半 (-1.25)</option>
                      <option value={-1.0} className="bg-slate-900 text-slate-200">主让一球 (-1.0)</option>
                      <option value={-0.75} className="bg-slate-900 text-slate-200">主让半球/一球 (-0.75)</option>
                      <option value={-0.5} className="bg-slate-900 text-slate-200">主让半球 (-0.5)</option>
                      <option value={-0.25} className="bg-slate-900 text-slate-200">主让平手/半球 (-0.25)</option>
                      <option value={0.0} className="bg-slate-900 text-slate-200">平手 (0.0)</option>
                      <option value={0.25} className="bg-slate-900 text-slate-200">受让平手/半球 (+0.25)</option>
                      <option value={0.5} className="bg-slate-900 text-slate-200">受让半球 (+0.5)</option>
                      <option value={0.75} className="bg-slate-900 text-slate-200">受让半球/一球 (+0.75)</option>
                      <option value={1.0} className="bg-slate-900 text-slate-200">受让一球 (+1.0)</option>
                      <option value={1.25} className="bg-slate-900 text-slate-200">受让一球/球半 (+1.25)</option>
                      <option value={1.5} className="bg-slate-900 text-slate-200">受让球半 (+1.5)</option>
                      <option value={1.75} className="bg-slate-900 text-slate-200">受让球半/两球 (+1.75)</option>
                      <option value={2.0} className="bg-slate-900 text-slate-200">受让两球 (+2.0)</option>
                    </select>
                  </div>

                  {/* 主客水位滑块 */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <div className="flex justify-between items-center mb-1">
                        <span className="text-[10px] text-rose-400 font-medium">主队水位</span>
                        <span className="text-[11px] font-bold font-mono text-rose-400 bg-rose-500/10 px-1.5 py-0.5 rounded">{asianHandicap.homeWater.toFixed(2)}</span>
                      </div>
                      <input
                        type="range"
                        min="0.70"
                        max="1.05"
                        step="0.01"
                        value={asianHandicap.homeWater}
                        onChange={(e) => setAsianHandicap({ ...asianHandicap, homeWater: Number(e.target.value) })}
                        className="w-full accent-rose-500 h-1 bg-slate-950 rounded cursor-pointer"
                      />
                      <div className="flex justify-between text-[9px] text-slate-500 font-mono mt-0.5">
                        <span>0.70</span><span>1.05</span>
                      </div>
                    </div>
                    <div>
                      <div className="flex justify-between items-center mb-1">
                        <span className="text-[10px] text-emerald-400 font-medium">客队水位</span>
                        <span className="text-[11px] font-bold font-mono text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded">{asianHandicap.awayWater.toFixed(2)}</span>
                      </div>
                      <input
                        type="range"
                        min="0.70"
                        max="1.05"
                        step="0.01"
                        value={asianHandicap.awayWater}
                        onChange={(e) => setAsianHandicap({ ...asianHandicap, awayWater: Number(e.target.value) })}
                        className="w-full accent-emerald-500 h-1 bg-slate-950 rounded cursor-pointer"
                      />
                      <div className="flex justify-between text-[9px] text-slate-500 font-mono mt-0.5">
                        <span>0.70</span><span>1.05</span>
                      </div>
                    </div>
                  </div>

                  {/* 返还率选择 */}
                  <div className="flex items-center justify-between pt-1.5 border-t border-slate-800/50">
                    <span className="text-[10px] text-slate-400">返还率标准</span>
                    <div className="flex gap-1.5">
                      {[0.92, 0.94, 0.96, 0.98].map((r) => (
                        <button
                          key={r}
                          onClick={() => setReturnRate(r)}
                          className={`px-2 py-0.5 text-[10px] font-mono rounded border transition-all ${
                            returnRate === r
                              ? 'bg-indigo-600/30 border-indigo-500 text-indigo-300'
                              : 'bg-slate-950 border-slate-800 text-slate-400 hover:bg-slate-850'
                          }`}
                        >
                          {(r * 100).toFixed(0)}%
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* 亚盘 → 欧赔折算参考 (只读) */}
                  <div className="pt-2 border-t border-slate-800/50">
                    <span className="block text-[10px] text-slate-400 mb-2 font-mono">↓ 亚盘 → 欧赔折算参考 (只读)</span>
                    <div className="grid grid-cols-3 gap-2">
                      <div className="text-center bg-slate-950 rounded-lg py-1.5 border border-slate-800/50">
                        <span className="block text-[10px] text-rose-400/70">主胜</span>
                        <span className="text-xs font-bold font-mono text-rose-400">{convertedOdds.homeOdds.toFixed(2)}</span>
                      </div>
                      <div className="text-center bg-slate-950 rounded-lg py-1.5 border border-slate-800/50">
                        <span className="block text-[10px] text-slate-400/70">平局</span>
                        <span className="text-xs font-bold font-mono text-slate-300">{convertedOdds.drawOdds.toFixed(2)}</span>
                      </div>
                      <div className="text-center bg-slate-950 rounded-lg py-1.5 border border-slate-800/50">
                        <span className="block text-[10px] text-emerald-400/70">客胜</span>
                        <span className="text-xs font-bold font-mono text-emerald-400">{convertedOdds.awayOdds.toFixed(2)}</span>
                      </div>
                    </div>
                  </div>

                </div>

                <div className="mt-4 flex gap-2">
                  <button
                    onClick={handleRecalculate}
                    className="flex-1 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-xs font-semibold py-2.5 px-4 rounded-xl shadow-lg transition-all flex items-center justify-center gap-1.5"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    重新进行10维算力演算
                  </button>
                  <button
                    onClick={() => {
                      const h = selectedTeams.home;
                      const a = selectedTeams.away;
                      if (h && a) {
                        const matchId = h.nameCn + "_vs_" + a.nameCn;
                        useAppStore.getState().addTrackedMatch(matchId);
                        useAppStore.getState().setSelectedMatchId(matchId);
                        // 导航到角球系统页面，切换到爬虫控制 tab
                        useAppStore.getState().setActiveTab("corner");
                        useCornerStore.getState().setActiveCornerTab("crawler");
                      }
                    }}
                    className="flex-1 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-xs font-semibold text-white py-2.5 px-4 rounded-xl shadow-lg transition-all flex items-center justify-center gap-1.5"
                  >
                    📡 发送到角球系统
                  </button>
                  <button
                    onClick={isStatsCustomized ? () => setIsStatsCustomized(false) : enableStatsCustomizer}
                    className={`px-3 py-2 text-xs font-medium rounded-xl border transition-all ${
                      isStatsCustomized
                        ? 'bg-emerald-950/40 border-emerald-500 text-emerald-300'
                        : 'bg-slate-900 border-slate-800 text-slate-400 hover:bg-slate-850 hover:text-slate-200'
                    }`}
                    title="自定义球队的统计数据，测试极限对抗模型"
                  >
                    {isStatsCustomized ? '⚙️ 解锁自定义 stats' : '🧪 自定义战力 stats'}
                  </button>
                </div>

                {/* 重置定制数据按钮 */}
                <button
                  onClick={() => {
                    setIsStatsCustomized(false);
                    setUseCustomWeights(false);
                    setCustomWeights({ odds: 0.45, strength: 0.30, homeAway: 0.15, h2h: 0.10, form: 0.05 });
                    setAsianHandicap({ handicap: -0.5, homeWater: 0.92, awayWater: 0.92 });
                    setAdvancedParams({
                      homeFatigue: 1, awayFatigue: 1,
                      homeInjuries: 3, awayInjuries: 3,
                      homeWaterTrend: 'STABLE', awayWaterTrend: 'STABLE',
                      homeBetVolume: 45, awayBetVolume: 35, drawBetVolume: 20
                    });
                    resetToDefaults();
                    if (teams.length === 0) loadRealTimeStandings();
                    // useEffect 会在 state 变更后自动触发 handleRecalculate
                  }}
                  className="w-full mt-2 bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-400 hover:text-slate-200 text-xs font-medium py-2 px-4 rounded-xl transition-all flex items-center justify-center gap-1.5"
                  title="将所有自定义模型参数、赔率及球队选择恢复为系统默认初始配置"
                >
                  <RefreshCw className="w-3 h-3" />
                  重置定制数据 (恢复默认沙盘配置)
                </button>
              </div>

              {/* 2. 状态微调数据（当开启 stats 调试时可见） */}
              {isStatsCustomized && (
                <div className="p-5 bg-[#0F1424] rounded-2xl border border-emerald-800/30 shadow-xl transition-all animate-fadeIn">
                  <h3 className="text-xs font-semibold text-emerald-400 flex items-center gap-1.5 mb-3">
                    <Sliders className="w-3.5 h-3.5" />
                    物理战力调试器 (自定义沙盒)
                  </h3>
                  <p className="text-[11px] text-slate-400 mb-4">
                    您可以修改该对决的主客战绩核心系数，以模拟核心球员伤缺、主帅换人等真实战术偏差下，10维数学矩阵预测的变化情况。
                  </p>

                  <div className="space-y-4 text-xs">
                    <div>
                      <span className="font-semibold text-rose-400 block mb-2">【主队 - {home.nameCn}】主场历史系数</span>
                      <div className="grid grid-cols-2 gap-2.5">
                        <div>
                          <label className="block text-[10px] text-slate-400">主场胜/平/负</label>
                          <div className="flex gap-1">
                            <input
                              type="number"
                              value={customStats.homeWins}
                              onChange={(e) => setCustomStats({ ...customStats, homeWins: parseInt(e.target.value) || 0 })}
                              className="w-full bg-slate-900 text-center border border-slate-800 rounded py-0.5 font-mono text-xs"
                            />
                            <input
                              type="number"
                              value={customStats.homeDraws}
                              onChange={(e) => setCustomStats({ ...customStats, homeDraws: parseInt(e.target.value) || 0 })}
                              className="w-full bg-slate-900 text-center border border-slate-800 rounded py-0.5 font-mono text-xs"
                            />
                            <input
                              type="number"
                              value={customStats.homeLosses}
                              onChange={(e) => setCustomStats({ ...customStats, homeLosses: parseInt(e.target.value) || 0 })}
                              className="w-full bg-slate-900 text-center border border-slate-800 rounded py-0.5 font-mono text-xs"
                            />
                          </div>
                        </div>
                        <div>
                          <label className="block text-[10px] text-slate-400">总进球/丢球</label>
                          <div className="flex gap-1">
                            <input
                              type="number"
                              value={customStats.homeGoalsFor}
                              onChange={(e) => setCustomStats({ ...customStats, homeGoalsFor: parseInt(e.target.value) || 0 })}
                              className="w-full bg-slate-900 text-center border border-slate-800 rounded py-0.5 font-mono text-xs"
                              title="进球"
                            />
                            <input
                              type="number"
                              value={customStats.homeGoalsAgainst}
                              onChange={(e) => setCustomStats({ ...customStats, homeGoalsAgainst: parseInt(e.target.value) || 0 })}
                              className="w-full bg-slate-900 text-center border border-slate-800 rounded py-0.5 font-mono text-xs"
                              title="丢球"
                            />
                          </div>
                        </div>
                      </div>
                      <div>
                        <label className="block text-[10px] text-slate-400">主场xG(期望进球/丢球)</label>
                        <div className="flex gap-1">
                          <input
                            type="number"
                            step="0.1"
                            value={customStats.homeXgFor}
                            onChange={(e) => setCustomStats({ ...customStats, homeXgFor: parseFloat(e.target.value) || 0 })}
                            className="w-full bg-slate-900 text-center border border-slate-800 rounded py-0.5 font-mono text-xs"
                            title="期望进球"
                          />
                          <input
                            type="number"
                            step="0.1"
                            value={customStats.homeXgAgainst}
                            onChange={(e) => setCustomStats({ ...customStats, homeXgAgainst: parseFloat(e.target.value) || 0 })}
                            className="w-full bg-slate-900 text-center border border-slate-800 rounded py-0.5 font-mono text-xs"
                            title="期望丢球"
                          />
                        </div>
                      </div>
                    </div>

                    <div>
                      <span className="font-semibold text-emerald-400 block mb-2">【客队 - {away.nameCn}】客场历史系数</span>
                      <div className="grid grid-cols-2 gap-2.5">
                        <div>
                          <label className="block text-[10px] text-slate-400">客场胜/平/负</label>
                          <div className="flex gap-1">
                            <input
                              type="number"
                              value={customStats.awayWins}
                              onChange={(e) => setCustomStats({ ...customStats, awayWins: parseInt(e.target.value) || 0 })}
                              className="w-full bg-slate-900 text-center border border-slate-800 rounded py-0.5 font-mono text-xs"
                            />
                            <input
                              type="number"
                              value={customStats.awayDraws}
                              onChange={(e) => setCustomStats({ ...customStats, awayDraws: parseInt(e.target.value) || 0 })}
                              className="w-full bg-slate-900 text-center border border-slate-800 rounded py-0.5 font-mono text-xs"
                            />
                            <input
                              type="number"
                              value={customStats.awayLosses}
                              onChange={(e) => setCustomStats({ ...customStats, awayLosses: parseInt(e.target.value) || 0 })}
                              className="w-full bg-slate-900 text-center border border-slate-800 rounded py-0.5 font-mono text-xs"
                            />
                          </div>
                        </div>
                        <div>
                          <label className="block text-[10px] text-slate-400">总进球/丢球</label>
                          <div className="flex gap-1">
                            <input
                              type="number"
                              value={customStats.awayGoalsFor}
                              onChange={(e) => setCustomStats({ ...customStats, awayGoalsFor: parseInt(e.target.value) || 0 })}
                              className="w-full bg-slate-900 text-center border border-slate-800 rounded py-0.5 font-mono text-xs"
                            />
                            <input
                              type="number"
                              value={customStats.awayGoalsAgainst}
                              onChange={(e) => setCustomStats({ ...customStats, awayGoalsAgainst: parseInt(e.target.value) || 0 })}
                              className="w-full bg-slate-900 text-center border border-slate-800 rounded py-0.5 font-mono text-xs"
                            />
                          </div>
                        </div>
                      </div>
                      <div>
                        <label className="block text-[10px] text-slate-400">客场xG(期望进球/丢球)</label>
                        <div className="flex gap-1">
                          <input
                            type="number"
                            step="0.1"
                            value={customStats.awayXgFor}
                            onChange={(e) => setCustomStats({ ...customStats, awayXgFor: parseFloat(e.target.value) || 0 })}
                            className="w-full bg-slate-900 text-center border border-slate-800 rounded py-0.5 font-mono text-xs"
                            title="期望进球"
                          />
                          <input
                            type="number"
                            step="0.1"
                            value={customStats.awayXgAgainst}
                            onChange={(e) => setCustomStats({ ...customStats, awayXgAgainst: parseFloat(e.target.value) || 0 })}
                            className="w-full bg-slate-900 text-center border border-slate-800 rounded py-0.5 font-mono text-xs"
                            title="期望丢球"
                          />
                        </div>
                      </div>
                    </div>

                    <div>
                      <span className="font-semibold text-slate-300 block mb-2">更新球队最新近期走势 (Form: W-D-L)</span>
                      <div className="flex gap-1">
                        {customStats.form.map((f, idx) => (
                          <select
                            key={idx}
                            value={f}
                            onChange={(e) => {
                              const newF = [...customStats.form];
                              newF[idx] = e.target.value as 'W' | 'D' | 'L';
                              setCustomStats({ ...customStats, form: newF });
                            }}
                            className="bg-slate-900 border border-slate-800 text-xs text-center rounded py-1 flex-1 font-bold text-slate-200"
                          >
                            <option value="W" className="text-rose-500">W</option>
                            <option value="D" className="text-slate-400">D</option>
                            <option value="L" className="text-emerald-500">L</option>
                          </select>
                        ))}
                      </div>
                      <p className="text-[10px] text-slate-400 mt-1">从左到右表示由新到旧的近5场战绩</p>
                    </div>

                    <button
                      onClick={handleRecalculate}
                      className="w-full bg-emerald-600 hover:bg-emerald-500 text-xs font-semibold py-2 rounded-lg text-white font-sans mt-3 transition-colors"
                    >
                      保存微调并重新演算
                    </button>
                  </div>
                </div>
              )}

              <AdvancedParamsPanel
                advancedParams={advancedParams}
                setAdvancedParams={setAdvancedParams}
                customWeights={customWeights}
                checkAbnormalParams={checkAbnormalParams}
              />

              {/* Parameter Warning Banner */}
              {showParamWarning && (
                <div className="p-3 bg-yellow-500/10 border border-yellow-500/30 rounded-xl mb-4 flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-yellow-500 shrink-0" />
                  <span className="text-xs text-yellow-300">
                    ⚠️ 当前参数为异常设定，可能严重偏离模型基准线！建议保持默认值。
                  </span>
                  <button
                    onClick={() => {
                      setAdvancedParams({
                        homeFatigue: 1,
                        awayFatigue: 1,
                        homeInjuries: 3,
                        awayInjuries: 3,
                        homeWaterTrend: 'STABLE',
                        awayWaterTrend: 'STABLE',
                        homeBetVolume: 45,
                        awayBetVolume: 35,
                        drawBetVolume: 20
                      });
                      setUseSystemWeights(true);
                      setShowParamWarning(false);
                      handleRecalculate();
                    }}
                    className="ml-auto text-xs text-yellow-400 hover:text-yellow-300 underline"
                  >
                    重置默认
                  </button>
                </div>
              )}

              <ModelWeightsPanel
                customWeights={customWeights}
                setCustomWeights={setCustomWeights}
                useSystemWeights={useSystemWeights}
                setUseSystemWeights={setUseSystemWeights}
                useCustomWeights={useCustomWeights}
                setUseCustomWeights={setUseCustomWeights}
                advancedParams={advancedParams}
                checkAbnormalParams={checkAbnormalParams}
                setShowParamWarning={setShowParamWarning}
                handleRecalculate={handleRecalculate}
              />

            </div>

            {/* 右边/中间：量化计算输出看板及决策结论 */}
            <div className="lg:col-span-8 flex flex-col gap-6">
              


              {calculationError && (
                <div className="p-5 rounded-2xl bg-red-950/30 border border-red-500/30 text-center">
                  <p className="text-red-400 text-sm font-semibold mb-1">Calculation Error</p>
                  <p className="text-red-300 text-xs">{calculationError}</p>
                  <button 
                    onClick={() => { setCalculationError(null); handleRecalculate(); }}
                    className="mt-3 px-4 py-1.5 bg-red-600/20 hover:bg-red-600/40 text-red-300 rounded-lg text-xs border border-red-500/30 transition-colors"
                  >
                    Retry Calculation
                  </button>
                </div>
              )}
              {results && (
                <>
                  {/* C. 聚合决策中枢（新增，最显眼位置） */}
                  <AggregationDecisionCenter 
                    marketOdds={convertedOdds}
                    results={results}
                    homeTeamName={home.nameCn}
                    awayTeamName={away.nameCn}
                    handicap={asianHandicap.handicap}
                    homeTeam={home}
                    awayTeam={away}
                  />

                  {/* E. 推荐方向精简决策板 */}
                  <div className="p-6 rounded-2xl bg-gradient-to-r from-[#111A30] to-[#162744] border border-blue-500/30 shadow-2xl relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-36 h-36 bg-blue-500/10 rounded-full blur-3xl pointer-events-none" />
                    
                    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-4">
                      <div>
                        <span className="text-[10px] uppercase font-bold tracking-widest bg-blue-500/20 text-blue-300 border border-blue-500/30 px-2 py-0.5 rounded-md">
                          10大模型综合集成方向
                        </span>
                        <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-white mt-1.5 flex items-center gap-2">
                          🎯 建议方向: 
                          <span className="text-rose-400 font-extrabold">{results.recommendedDirection}</span>
                        </h2>
                      </div>
                      
                      <div className="flex items-center gap-2.5">
                        <div className="text-right">
                          <span className="block text-[10px] text-slate-400">机构资金回返率</span>
                          <span className="font-mono text-sm font-bold text-slate-200">{(results.payoutRate * 100).toFixed(2)}%</span>
                        </div>
                        <div className="h-8 w-[1px] bg-slate-800" />
                        <div>
                          <span className="block text-[10px] text-slate-400">爆冷预兆等级</span>
                          <span className={`text-xs font-bold font-mono px-2 py-0.5 rounded ${
                            results.riskRating === 'LOW'
                              ? 'bg-emerald-500/15 text-emerald-400'
                              : results.riskRating === 'MEDIUM'
                              ? 'bg-yellow-500/15 text-yellow-500'
                              : 'bg-rose-500/15 text-rose-500'
                          }`}>
                            {results.riskRating === 'LOW' ? '🔥 极低风险' : results.riskRating === 'MEDIUM' ? '⚠️ 稳妥适中' : '💀 高风险防守'}
                          </span>
                        </div>
                      </div>
                    </div>

                    <p className="text-slate-300 text-xs sm:text-sm leading-relaxed mb-4">
                      {results.recommendedReason}
                    </p>

                    <div className="flex flex-wrap gap-2.5 text-xs">
                      <div className="flex items-center gap-1.5 bg-slate-900/60 px-3 py-1.5 rounded-lg border border-slate-800">
                        <span className="w-2 h-2 rounded-full bg-indigo-500" />
                        <span className="text-slate-400">主胜期望率:</span>
                        <strong className="text-rose-400 font-mono">{(results.compHomeWin * 100).toFixed(1)}%</strong>
                      </div>
                      <div className="flex items-center gap-1.5 bg-slate-900/60 px-3 py-1.5 rounded-lg border border-slate-800">
                        <span className="w-2 h-2 rounded-full bg-slate-500" />
                        <span className="text-slate-400">平局期望率:</span>
                        <strong className="text-slate-300 font-mono">{(results.compDraw * 100).toFixed(1)}%</strong>
                      </div>
                      <div className="flex items-center gap-1.5 bg-slate-900/60 px-3 py-1.5 rounded-lg border border-slate-800">
                        <span className="w-2 h-2 rounded-full bg-emerald-500" />
                        <span className="text-slate-400">客胜期望率:</span>
                        <strong className="text-emerald-400 font-mono">{(results.compAwayWin * 100).toFixed(1)}%</strong>
                      </div>
                    </div>

                    <div key={selectedMatchId || "upset-alert"}>
                    <ErrorBoundary>
                      {results.upsetLevel === "cold_start" ? (
                        <div key="upset-cold-start" className="mt-4 flex items-center gap-2 bg-slate-500/10 border border-slate-500/20 px-3.5 py-2.5 rounded-xl text-slate-400 text-xs text-left">
                          <Flame className="w-4.5 h-4.5 shrink-0 text-slate-500" />
                          <span>
                            <strong>📊 数据积累中：</strong>
                            历史投注数据尚不足 5 场，爆冷预警功能将在积累足够数据后自动启用。
                            当前使用基础模型进行风险评估。
                          </span>
                        </div>
                      ) : results.coldUpsetAlert ? (
                        (() => {
                          const isDanger = results.upsetLevel === "danger";
                          const bgColor = isDanger ? "bg-rose-500/15 border-rose-500/30" : "bg-orange-500/10 border-orange-500/20";
                          const textColor = isDanger ? "text-rose-300" : "text-orange-300";
                          const iconColor = isDanger ? "text-rose-500" : "text-orange-400";
                          const label = isDanger ? "🔴 高危爆冷预警" : "🟠 冷门预警";
                          const zHome = results.zScoreHome && results.zScoreHome !== 0 ? results.zScoreHome.toFixed(1) : "数据待积累";
                          const zAway = results.zScoreAway && results.zScoreAway !== 0 ? results.zScoreAway.toFixed(1) : "数据待积累";
                          return (
                            <div key={results.upsetLevel || "upset-alert"} className={"mt-4 flex items-center gap-2 border px-3.5 py-2.5 rounded-xl text-xs text-left " + bgColor + " " + textColor}>
                              <Flame className={"w-4.5 h-4.5 shrink-0 h-full " + iconColor} />
                              <span>
                                <strong>{label}：</strong>
                                投注量异常 (Z-Score: 主 {zHome} / 客 {zAway})，
                                模型概率显著高于赔率隐含概率，建议防冷。
                              </span>
                            </div>
                          );
                        })()
                      ) : null}
                    </ErrorBoundary>
                    </div>
                  </div>

                  {/* D. 综合胜平负概率与亚盘隐含概率比对展示面板 */}
                  <div className="p-5 bg-[#0F1424] rounded-2xl border border-slate-800/80 shadow-xl">
                    <h3 className="text-sm font-semibold text-slate-200 flex items-center justify-between gap-1.5 mb-4">
                      <span className="flex items-center gap-1.5">
                        <TrendingUp className="w-4 h-4 text-rose-500" />
                        亚盘折算隐含概率 V.S. 数学量化期望 (10维空间)
                      </span>
                      <span className="text-[10px] text-slate-400 font-mono">Weights: {useCustomWeights && !useSystemWeights ? `${Math.round(customWeights.odds*100)}/${Math.round(customWeights.strength*100)}/${Math.round(customWeights.homeAway*100)}/${Math.round(customWeights.h2h*100)}/${Math.round(customWeights.form*100)}` : '45/30/15/10/5'}</span>
                    </h3>

                    {/* 可视化条形对比图 */}
                    <div className="space-y-4">
                      {/* 主胜列 */}
                      <div>
                        <div className="flex justify-between text-xs text-slate-300 mb-1">
                          <span className="font-semibold flex items-center gap-2">
                            <span className="w-2.5 h-2.5 bg-rose-500 rounded-sm" />
                            {home.nameCn} 主胜期望占比
                          </span>
                          <span className="font-mono text-rose-400 font-bold">
                            量化 {(results.compHomeWin*100).toFixed(1)}%
                            <span className="text-slate-500 font-normal text-[10px] ml-1">
                              (庄赔 ${(results.oddsHomeProb*100).toFixed(0)}%)
                            </span>
                          </span>
                        </div>
                        <div className="w-full bg-slate-900 rounded-lg h-3 overflow-hidden relative border border-slate-800/60">
                          {/* Bookmaker implied light bg */}
                          <div
                            className="bg-rose-500/15 h-full absolute left-0 top-0 transition-all border-r border-[#FF3E6C]/30"
                            style={{ width: `${results.oddsHomeProb * 100}%` }}
                            title="庄家赔率返还率隐含概率"
                          />
                          {/* Our Quant bar */}
                          <div
                            className="bg-gradient-to-r from-rose-600 to-[#FF3E6C] h-full rounded-lg absolute left-0 top-0 shadow-[0_0_8px_rgba(239,68,68,0.4)] transition-all"
                            style={{ width: `${results.compHomeWin * 100}%` }}
                          />
                        </div>
                      </div>

                      {/* 平局列 */}
                      <div>
                        <div className="flex justify-between text-xs text-slate-300 mb-1">
                          <span className="font-semibold flex items-center gap-2">
                            <span className="w-2.5 h-2.5 bg-slate-400 rounded-sm" />
                            双方握手言和 平局期待
                          </span>
                          <span className="font-mono text-slate-200 font-bold">
                            量化 {(results.compDraw*100).toFixed(1)}%
                            <span className="text-slate-500 font-normal text-[10px] ml-1">
                              (庄赔 ${(results.oddsDrawProb*100).toFixed(0)}%)
                            </span>
                          </span>
                        </div>
                        <div className="w-full bg-slate-900 rounded-lg h-3 overflow-hidden relative border border-slate-800/60">
                          <div
                            className="bg-slate-400/20 h-full absolute left-0 top-0 transition-all border-r border-slate-400/40"
                            style={{ width: `${results.oddsDrawProb * 100}%` }}
                          />
                          <div
                            className="bg-slate-400 h-full rounded-lg absolute left-0 top-0 shadow-lg transition-all"
                            style={{ width: `${results.compDraw * 100}%` }}
                          />
                        </div>
                      </div>

                      {/* 客胜列 */}
                      <div>
                        <div className="flex justify-between text-xs text-slate-300 mb-1">
                          <span className="font-semibold flex items-center gap-2">
                            <span className="w-2.5 h-2.5 bg-emerald-500 rounded-sm" />
                            {away.nameCn} 客胜期待
                          </span>
                          <span className="font-mono text-emerald-400 font-bold">
                            量化 {(results.compAwayWin*100).toFixed(1)}%
                            <span className="text-slate-500 font-normal text-[10px] ml-1">
                              (庄赔 ${(results.oddsAwayProb*100).toFixed(0)}%)
                            </span>
                          </span>
                        </div>
                        <div className="w-full bg-slate-900 rounded-lg h-3 overflow-hidden relative border border-slate-800/60">
                          <div
                            className="bg-emerald-500/15 h-full absolute left-0 top-0 transition-all border-r border-[#10B981]/30"
                            style={{ width: `${results.oddsAwayProb * 100}%` }}
                          />
                          <div
                            className="bg-gradient-to-r from-emerald-600 to-emerald-400 h-full rounded-lg absolute left-0 top-0 shadow-[0_0_8px_rgba(16,185,129,0.3)] transition-all"
                            style={{ width: `${results.compAwayWin * 100}%` }}
                          />
                        </div>
                      </div>
                    </div>

                    <div className="mt-4 flex justify-between items-center bg-slate-950 p-2.5 rounded-lg text-slate-400 text-[11px] font-mono border border-slate-900">
                      <span>庄家隐含抽水回佣: <strong className="text-rose-400">{(results.overround * 100).toFixed(1)}%</strong></span>
                      <span>机构让让隐含标准线: <strong className="text-blue-400">{results.impliedHandicap}</strong></span>
                      <span>1XBet赔付返还率: <strong className="text-emerald-400">{(results.payoutRate * 100).toFixed(1)}%</strong></span>
                    </div>
                  </div>

                  {/* === PANEL STEP 2: 即时动态仿真沙盘 (Interactive Live Sandbox) === */}
                  {/* 贝叶斯滚球比分即时动态监控台 */}
                  {liveResults && (
                    <div className="p-6 bg-slate-900/90 rounded-2xl border border-blue-500/20 shadow-2xl relative overflow-hidden">
                        <div className="absolute top-0 right-0 w-24 h-24 bg-blue-500/5 rounded-full blur-2xl pointer-events-none" />
                        
                        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-4">
                          <div>
                            <span className="text-[10px] font-extrabold uppercase bg-blue-500/20 text-blue-300 border border-blue-500/20 px-2.5 py-1 rounded-md">
                              Bayesian Dynamic In-Play Monitoring
                            </span>
                            <h3 className="text-base font-bold text-white mt-2 flex items-center gap-2">
                              ⚡ 贝叶斯即时滚球走势监测盘
                            </h3>
                          </div>
                          
                          <p className="text-xs text-slate-400 leading-relaxed max-w-md">
                            根据已比分钟数的时间衰减、即时进球发生、以及即时红牌变数，在动态先验估计下，输出贝叶斯后置赢球、平局概率。
                          </p>
                        </div>

                        {/* Sliders layout for Inplay inputs */}
                        <div className="grid grid-cols-1 md:grid-cols-5 gap-4 bg-slate-950 p-4 rounded-xl border border-slate-800 mb-5">
                          <div>
                            <div className="flex justify-between items-center mb-1">
                              <span className="text-[11px] text-slate-400">⏱️ 当前分钟数</span>
                              <span className="text-[11px] font-bold font-mono text-blue-400 bg-blue-500/10 px-1.5 py-0.5 rounded">{liveMatchState.elapsedMinutes}'</span>
                            </div>
                            <input
                              type="range"
                              min="0"
                              max="90"
                              step="5"
                              value={liveMatchState.elapsedMinutes}
                              onChange={(e) => dispatchLiveMatch({ type: 'UPDATE_MINUTE', payload: Number(e.target.value) })}
                              className="w-full accent-blue-500 h-1 bg-slate-950 rounded cursor-pointer"
                            />
                          </div>
                          <div>
                            <div className="flex justify-between items-center mb-1">
                              <span className="text-[11px] text-slate-400">⚽ 主队进球</span>
                              <span className="text-[11px] font-bold font-mono text-rose-400 bg-rose-500/10 px-1.5 py-0.5 rounded">{liveMatchState.homeScore}</span>
                            </div>
                            <input
                              type="range"
                              min="0"
                              max="6"
                              step="1"
                              value={liveMatchState.homeScore}
                              onChange={(e) => dispatchLiveMatch({ type: 'UPDATE_SCORE', payload: { home: Number(e.target.value), away: liveMatchState.awayScore } })}
                              className="w-full accent-rose-500 h-1 bg-slate-950 rounded cursor-pointer"
                            />
                          </div>
                          <div>
                            <div className="flex justify-between items-center mb-1">
                              <span className="text-[11px] text-slate-400">⚽ 客队进球</span>
                              <span className="text-[11px] font-bold font-mono text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded">{liveMatchState.awayScore}</span>
                            </div>
                            <input
                              type="range"
                              min="0"
                              max="6"
                              step="1"
                              value={liveMatchState.awayScore}
                              onChange={(e) => dispatchLiveMatch({ type: 'UPDATE_SCORE', payload: { home: liveMatchState.homeScore, away: Number(e.target.value) } })}
                              className="w-full accent-emerald-500 h-1 bg-slate-950 rounded cursor-pointer"
                            />
                          </div>
                          <div>
                            <div className="flex justify-between items-center mb-1">
                              <span className="text-[11px] text-slate-400">🔴 主队红牌</span>
                              <span className="text-[11px] font-bold font-mono text-red-400 bg-red-500/10 px-1.5 py-0.5 rounded">{liveMatchState.homeRedCards}</span>
                            </div>
                            <input
                              type="range"
                              min="0"
                              max="3"
                              step="1"
                              value={liveMatchState.homeRedCards}
                              onChange={(e) => dispatchLiveMatch({ type: 'UPDATE_RED_CARDS', payload: { home: Number(e.target.value), away: liveMatchState.awayRedCards } })}
                              className="w-full accent-red-600 h-1 bg-slate-950 rounded cursor-pointer"
                            />
                          </div>
                          <div>
                            <div className="flex justify-between items-center mb-1">
                              <span className="text-[11px] text-slate-400">🔴 客队红牌</span>
                              <span className="text-[11px] font-bold font-mono text-orange-400 bg-orange-500/10 px-1.5 py-0.5 rounded">{liveMatchState.awayRedCards}</span>
                            </div>
                            <input
                              type="range"
                              min="0"
                              max="3"
                              step="1"
                              value={liveMatchState.awayRedCards}
                              onChange={(e) => dispatchLiveMatch({ type: 'UPDATE_RED_CARDS', payload: { home: liveMatchState.homeRedCards, away: Number(e.target.value) } })}
                              className="w-full accent-orange-600 h-1 bg-slate-950 rounded cursor-pointer"
                            />
                          </div>
                        </div>

                        {/* Real-time calculated Posterior output probabilities */}
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4.5">
                          {/* Live win */}
                          <div className="bg-slate-950 p-3 rounded-xl border border-slate-850">
                            <div className="flex justify-between items-center text-xs mb-1.5 text-slate-400 font-mono">
                              <span>【即时主胜】后置胜率:</span>
                              <strong className="text-rose-400 text-sm">{(liveResults.liveHomeWin * 100).toFixed(1)}%</strong>
                            </div>
                            <div className="w-full bg-slate-900 rounded h-2 overflow-hidden">
                              <div className="bg-rose-500 h-full rounded transition-all" style={{ width: `${liveResults.liveHomeWin * 100}%` }} />
                            </div>
                          </div>

                          {/* Live Draw */}
                          <div className="bg-slate-950 p-3 rounded-xl border border-slate-850">
                            <div className="flex justify-between items-center text-xs mb-1.5 text-slate-400 font-mono">
                              <span>【即时平局】后置胜率:</span>
                              <strong className="text-slate-300 text-sm">{(liveResults.liveDraw * 100).toFixed(1)}%</strong>
                            </div>
                            <div className="w-full bg-slate-900 rounded h-2 overflow-hidden">
                              <div className="bg-slate-400 h-full rounded transition-all" style={{ width: `${liveResults.liveDraw * 100}%` }} />
                            </div>
                          </div>

                          {/* Live Away win */}
                          <div className="bg-slate-950 p-3 rounded-xl border border-slate-850">
                            <div className="flex justify-between items-center text-xs mb-1.5 text-slate-400 font-mono">
                              <span>【即时客胜】后置胜率:</span>
                              <strong className="text-emerald-400 text-sm">{(liveResults.liveAwayWin * 100).toFixed(1)}%</strong>
                            </div>
                            <div className="w-full bg-slate-900 rounded h-2 overflow-hidden">
                              <div className="bg-emerald-500 h-full rounded transition-all" style={{ width: `${liveResults.liveAwayWin * 100}%` }} />
                            </div>
                          </div>
                        </div>

                        {/* Live secondary changes */}
                        <div className="mt-3.5 pt-3 border-t border-slate-800/80 flex flex-wrap justify-between gap-4 text-[11px] font-mono text-slate-500 uppercase leading-relaxed">
                          <span>预计剩余角球增幅: <strong className="text-indigo-400">主 {liveResults.liveCornerHomeLeft} | 客 {liveResults.liveCornerAwayLeft} 个</strong></span>
                          <span>追加红黄牌摩擦倾向率: <strong className="text-yellow-500">主 {liveResults.liveCardsHomeLeft} | 客 {liveResults.liveCardsAwayLeft} 张</strong></span>
                          <span>贝叶斯剩余对攻期望值: <strong className="text-purple-400">主 {liveResults.remainingExpectedHomeGoals.toFixed(1)} | 客 {liveResults.remainingExpectedAwayGoals.toFixed(1)} 球</strong></span>
                        </div>
                      </div>
                    )}

                  {/* D3 战术角球与进攻强压协动图 */}
                  {results && (
                    <CornerKickStrategyChart
                      home={home}
                      away={away}
                      results={results}
                    />
                  )}

                  {/* === PANEL STEP 3: 二级衍生盘与财务决策 (Stakes & Penalty Cards) === */}
                  {/* 量化多维高级部分：凯利公式、xPts估值、黄红惩罚界限（职业量化终端级） */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* Size 1: Kelly & xPts Valuations */}
                    <div className="p-5 bg-[#0F1424] rounded-2xl border border-slate-800/80 shadow-xl flex flex-col justify-between">
                      <div>
                        <h3 className="text-sm font-semibold text-slate-200 flex items-center gap-1.5 mb-2.5">
                          <Scale className="w-4 h-4 text-amber-400 font-bold" />
                          💰 职业凯利资金比例 & 预期估值 (xPts)
                        </h3>
                        <p className="text-[11px] text-slate-400 mb-4 font-sans leading-relaxed">
                          采用标准半凯利准则（Half-Kelly Fraction）将融算概率与市场赔率拟合，直接为投资分配防线比例，防范重仓爆仓风险。
                        </p>

                        {/* Kelly Table */}
                        <div className="space-y-3 mb-4.5">
                          <div className="bg-slate-950 p-2.5 rounded-lg border border-slate-900/50 flex justify-between items-center">
                            <span className="text-xs text-rose-300 font-semibold">{home.nameCn} 主胜凯利倍率:</span>
                            <div className="text-right">
                              <span className={`px-2 py-0.5 rounded text-[11px] font-mono font-bold ${results.kellyHome > 0 ? 'bg-rose-500/15 text-rose-400' : 'bg-slate-900 text-slate-500'}`}>
                                {results.kellyHome > 0 ? `建议投注 ${results.kellyHome}% 仓位` : '不买入 (无期望收益)'}
                              </span>
                            </div>
                          </div>
                          <div className="bg-slate-950 p-2.5 rounded-lg border border-slate-900/50 flex justify-between items-center">
                            <span className="text-xs text-slate-300 font-semibold">双方战平 凯利倍率:</span>
                            <div className="text-right">
                              <span className={`px-2 py-0.5 rounded text-[11px] font-mono font-bold ${results.kellyDraw > 0 ? 'bg-slate-500/20 text-slate-300' : 'bg-slate-900 text-slate-500'}`}>
                                {results.kellyDraw > 0 ? `建议投注 ${results.kellyDraw}% 仓位` : '不建议买入'}
                              </span>
                            </div>
                          </div>
                          <div className="bg-slate-950 p-2.5 rounded-lg border border-slate-900/50 flex justify-between items-center">
                            <span className="text-xs text-emerald-300 font-semibold">{away.nameCn} 客胜凯利倍率:</span>
                            <div className="text-right">
                              <span className={`px-2 py-0.5 rounded text-[11px] font-mono font-bold ${results.kellyAway > 0 ? 'bg-emerald-500/15 text-emerald-400' : 'bg-slate-900 text-slate-500'}`}>
                                {results.kellyAway > 0 ? `建议投注 ${results.kellyAway}% 仓位` : '不买入 (无期望收益)'}
                              </span>
                            </div>
                          </div>
                        </div>

                        {/* xPts valuation */}
                        <div className="pt-3 border-t border-slate-800/40">
                          <h4 className="text-xs font-semibold text-slate-200 mb-2 flex items-center gap-1">
                            📊 球队赛季估值回归 (预期积分 xPts 列)
                          </h4>
                          <div className="space-y-2">
                            <div className="flex justify-between items-center text-xs">
                              <span className="text-slate-400">{home.nameCn}:</span>
                              <span className="font-mono text-slate-300">
                                期望战力 xPts <strong className="text-rose-400 font-bold">{results.homeXpts}</strong> 点 
                                <span className={`ml-2 px-1 rounded text-[9px] font-bold ${results.homePtsStatus === 'UNDERVALUED' ? 'bg-emerald-500/15 text-emerald-400' : results.homePtsStatus === 'OVERVALUED' ? 'bg-rose-500/15 text-rose-400' : 'bg-slate-900 text-slate-500'}`}>
                                  {results.homePtsStatus === 'UNDERVALUED' ? '🟢 股价低估/反弹可买' : results.homePtsStatus === 'OVERVALUED' ? '🔴 股价虚高/建议防冷' : '价值平衡'}
                                </span>
                              </span>
                            </div>
                            <div className="flex justify-between items-center text-xs">
                              <span className="text-slate-400">{away.nameCn}:</span>
                              <span className="font-mono text-slate-300">
                                期望战力 xPts <strong className="text-emerald-400 font-bold">{results.awayXpts}</strong> 点
                                <span className={`ml-2 px-1 rounded text-[9px] font-bold ${results.awayPtsStatus === 'UNDERVALUED' ? 'bg-emerald-500/15 text-emerald-400' : results.awayPtsStatus === 'OVERVALUED' ? 'bg-rose-500/15 text-rose-400' : 'bg-slate-900 text-slate-500'}`}>
                                  {results.awayPtsStatus === 'UNDERVALUED' ? '🟢 股价低估/反弹可买' : results.awayPtsStatus === 'OVERVALUED' ? '🔴 股价虚高/建议防冷' : '价值平衡'}
                                </span>
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Size 2: Penalty Cards prediction exclusively (Removing repetitive Corners block) */}
                    <div className="p-5 bg-[#0F1424] rounded-2xl border border-slate-800/80 shadow-xl flex flex-col justify-between">
                      <div>
                        <h3 className="text-sm font-semibold text-slate-200 flex items-center gap-1.5 mb-2.5">
                          <Activity className="w-4 h-4 text-emerald-400" />
                          📊 犯规热度与惩罚黄红牌模型估值
                        </h3>
                        <p className="text-[11px] text-slate-400 mb-4 font-sans leading-relaxed">
                          基于两队赛季抢断强硬度、侵犯摩擦频率以及历史红黄罚单走势，融合即时对战张力期望，推演最终裁判出牌阻断倾向。
                        </p>

                        <div className="bg-slate-950 p-4 rounded-xl border border-slate-900">
                          <span className="text-[11px] font-semibold text-yellow-500 block mb-2.5">🟨 摩擦犯规惩罚期望 (Penalty Cards)</span>
                          <div className="space-y-2.5 text-xs font-mono">
                            <div className="flex justify-between text-slate-300">
                              <span>【主队】{home.nameCn} 惩罚张数:</span>
                              <strong>{results.expectedHomeCards} 张</strong>
                            </div>
                            <div className="flex justify-between text-slate-300">
                              <span>【客队】{away.nameCn} 惩罚张数:</span>
                              <strong>{results.expectedAwayCards} 张</strong>
                            </div>
                            <div className="h-[1px] bg-slate-800 my-1 font-bold" />
                            <div className="flex justify-between text-yellow-400 items-center">
                              <span>总罚单界线预期:</span>
                              <div className="flex items-center gap-1.5">
                                <strong className="text-sm">{(results.expectedHomeCards + results.expectedAwayCards).toFixed(1)} 张</strong>
                                <span className={`px-1 py-0.5 rounded text-[9px] font-bold ${
                                  (results.expectedHomeCards + results.expectedAwayCards) > 4.2
                                    ? 'bg-rose-500/15 text-rose-400'
                                    : 'bg-emerald-500/15 text-emerald-400'
                                }`}>
                                  {(results.expectedHomeCards + results.expectedAwayCards) > 4.2 ? '高摩擦对抗' : '温和克制'}
                                </span>
                              </div>
                            </div>
                          </div>
                        </div>

                        <div className="mt-4 p-2 bg-slate-900 rounded text-[10px] text-slate-400 leading-tight">
                          * <strong>对抗警告：</strong>出牌期望受天气、德比敌对属性及主裁宽松尺度等非对称噪声干扰，标配标准误差在 &plusmn;1.45 张。
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* E. 物理 Poisson 进球预期、大小球概率分布 与 5维核心战力雷达图 */}
                  <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                    
                    {/* 进球数与大小球复合概率列 (占 7 格) */}
                    <div className="lg:col-span-7 grid grid-cols-1 md:grid-cols-2 gap-6">
                      
                      {/* Size 1: Poisson Expected goal count */}
                      <div className="p-5 bg-[#0F1424] rounded-2xl border border-slate-800/80 shadow-xl flex flex-col justify-between">
                        <div>
                          <h3 className="text-sm font-semibold text-slate-200 flex items-center gap-1.5 mb-3">
                            <Activity className="w-4 h-4 text-emerald-400" />
                            物理 Poisson 预期概率
                          </h3>
                          <p className="text-[11px] text-slate-400 mb-4 font-sans leading-relaxed">
                            利用主队攻击力指数（{results.homeAttackIndex.toFixed(2)}）与客队防守度、联赛初始场均进球数交叉进行 Poisson 公式运算得出的主客场真实球队单场期望入球数。
                          </p>
                          
                          <div className="space-y-3.5 mb-4">
                            <div>
                              <div className="flex justify-between items-center text-xs font-mono mb-1 text-slate-300">
                                <span>【主场】{home.nameCn} 预期入球数</span>
                                <span className="font-bold text-rose-400">{results.expectedHomeGoals.toFixed(2)} 球</span>
                              </div>
                              <div className="w-full bg-slate-900 rounded h-1.5 overflow-hidden">
                                <div className="bg-rose-500 h-full rounded" style={{ width: `${Math.min(100, results.expectedHomeGoals * 25)}%` }} />
                              </div>
                            </div>

                            <div>
                              <div className="flex justify-between items-center text-xs font-mono mb-1 text-slate-300">
                                <span>【客场】{away.nameCn} 预期入球数</span>
                                <span className="font-bold text-[#FF8008]">{results.expectedAwayGoals.toFixed(2)} 球</span>
                              </div>
                              <div className="w-full bg-slate-900 rounded h-1.5 overflow-hidden">
                                <div className="bg-[#FF8008] h-full rounded" style={{ width: `${Math.min(100, results.expectedAwayGoals * 25)}%` }} />
                              </div>
                            </div>
                          </div>
                        </div>

                        {/* Display direct Poisson combination prob list */}
                        <div className="bg-slate-950 p-2.5 rounded-lg border border-slate-900/60">
                          <div className="text-[11px] text-slate-400 font-mono mb-1.5 flex justify-between">
                            <span>预计精确总进球概率（Poisson）:</span>
                            <span>总和=100%</span>
                          </div>
                          <div className="grid grid-cols-5 gap-1.5 text-center font-mono text-[10px]">
                            {results.poissonTable.slice(0, 5).map((col) => (
                              <div key={col.goals} className="bg-slate-900 p-1 rounded">
                                <div className="text-slate-500 font-semibold">{col.goals}球</div>
                                <div className="text-slate-300">{(col.prob * 100).toFixed(1)}%</div>
                              </div>
                            ))}
                          </div>
                        </div>

                      </div>

                      {/* Size 2: Large / Small OverUnder probabilities */}
                      <div className="p-5 bg-[#0F1424] rounded-2xl border border-slate-800/80 shadow-xl flex flex-col justify-between">
                        <div>
                          <h3 className="text-sm font-semibold text-slate-200 flex items-center gap-1.5 mb-2">
                            <BarChart3 className="w-4 h-4 text-[#FF3E6C]" />
                            大小球盘口概率演算 (基于边界值 {goalsLine}球)
                          </h3>
                          <p className="text-[11px] text-slate-400 mb-4 leading-relaxed">
                            根据两队各进球事件复合联合概率折算成 1.5 到 3.5 各线盘口的大小球出线几率百分比：
                          </p>

                          <div className="space-y-3">
                            {results.overUnderProb.map((p) => {
                              const isCurrentLine = p.line === goalsLine;
                              return (
                                <div key={p.line} className={`p-2 rounded-xl transition-all ${
                                  isCurrentLine ? 'bg-blue-900/25 border border-blue-500/20' : 'bg-slate-900/40'
                                }`}>
                                  <div className="flex justify-between items-center text-xs mb-1.5 font-mono">
                                    <span className={`font-semibold ${isCurrentLine ? 'text-blue-300' : 'text-slate-400'}`}>
                                      {p.line} 球界
                                    </span>
                                    <div className="flex gap-4">
                                      <span className="text-rose-400">大球 (Over): {(p.over * 100).toFixed(1)}%</span>
                                      <span className="text-emerald-400">小球 (Under): {(p.under * 100).toFixed(1)}%</span>
                                    </div>
                                  </div>
                                  <div className="flex h-1.5 w-full bg-slate-950 rounded-lg overflow-hidden">
                                    <div className="bg-rose-500" style={{ width: `${p.over * 100}%` }} title="大球" />
                                    <div className="bg-emerald-500" style={{ width: `${p.under * 100}%` }} title="小球" />
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>

                        <p className="text-[10px] text-slate-500 mt-3 font-mono leading-tight text-center">
                          * 采用标准二元泊松回归公式推演，已计入单赛季历史离散偏态系数
                        </p>
                      </div>

                    </div>

                    {/* 5维雷达战功星对比大图 (占 5 格) */}
                    <div className="lg:col-span-5">
                      <TeamRadarChart
                        homeName={home.nameCn}
                        awayName={away.nameCn}
                        homeStats={home}
                        awayStats={away}
                        results={results}
                      />
                    </div>

                  </div>

                  {/* F. AI 专家推演模块 (DeepSeek API 交互，包含对失配密钥的安全懒加载) */}
                  <div className="p-6 bg-slate-900 rounded-2xl border border-slate-800 shadow-xl relative overflow-hidden">
                    <div className="absolute top-0 left-0 w-2 h-full bg-gradient-to-b from-indigo-500 via-purple-500 to-pink-500" />
                    
                    <div className="flex items-center justify-between flex-wrap gap-4 mb-4 pl-2">
                      <div className="flex items-center gap-2.5">
                        <div className="p-1 px-2.5 bg-purple-500/10 text-purple-400 text-xs font-mono font-bold uppercase rounded-lg border border-purple-500/25">
                          DeepSeek AI Real-Time Analyzer
                        </div>
                        <h4 className="text-sm font-bold text-slate-100">AI 专家战术推演点评系统</h4>
                        <span className="text-[9px] bg-slate-800 px-2 py-0.5 rounded-full text-slate-400">
                          🔍 防幻觉校验中
                        </span>
                      </div>

                      <button
                        onClick={() => { const savedKey = localStorage.getItem('deepseek_api_key'); if (!savedKey) { setShowKeyModal(true); return; } rawFetchAiAnalysis(home.id, away.id, odds, results!, { advancedParams, isStatsCustomized, customStats }); }}
                        disabled={isAiLoading}
                        className="bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs py-1.5 px-3.5 rounded-xl flex items-center gap-1.5 transition-all shadow-md"
                      >
                        <Cpu className={`w-3.5 h-3.5 ${isAiLoading ? 'animate-spin' : ''}`} />
                        {isAiLoading ? '数智生成中...' : '生成 AI 深度战力点评'}
                      </button>
                    </div>

                    {!aiAnalysis && !isAiLoading && (
                      <p className="text-xs text-slate-400 pl-2">
                        点击上方按钮启动 DeepSeek AI 顶级精算评委，对该赛事的打法克制关系、战术强弱破绽、大小球深度原因进行文字剖析。
                      </p>
                    )}

                    {isAiLoading && (
                      <div className="pl-2 space-y-2 py-2 animate-pulse">
                        <div className="h-3 w-5/6 bg-slate-800 rounded" />
                        <div className="h-3 w-4/6 bg-slate-800 rounded" />
                        <div className="h-3 w-2/3 bg-slate-800 rounded" />
                        <span className="text-[11px] block font-mono text-indigo-400">「正在根据物理攻守差、Poisson进球模型、状态系数推导冷门预警战术草案...」</span>
                      </div>
                    )}

                    {aiAnalysis && (
                      <>
                        {/* AI Validation Warning Banner */}
                        {aiValidationWarning && (
                          <div className="mb-4 p-3 bg-red-950/50 border border-red-500/30 rounded-lg text-red-300 text-xs">
                            <AlertTriangle className="w-4 h-4 inline-block mr-1.5" />
                            <strong>[防幻觉校验]</strong> {aiValidationWarning}
                          </div>
                        )}

                        {/* AI Analysis Content */}
                        <div className="pl-2 pr-2 py-1 border-t border-slate-800 mt-2.5">
                          <div className="text-xs text-slate-300 leading-relaxed font-sans whitespace-pre-wrap">
                            {aiAnalysis}
                          </div>
                        </div>

                        {/* Model Data Reference */}
                        <div className="mt-3 p-2.5 bg-slate-950/60 rounded-lg text-[10px] text-slate-500 border border-slate-800">
                          <strong className="text-slate-400">📊 模型基准参考（用于AI结果比对）：</strong>
                          <div className="mt-1 grid grid-cols-3 gap-2 font-mono">
                            <div>主胜：{(results.compHomeWin * 100).toFixed(1)}%</div>
                            <div>平局：{(results.compDraw * 100).toFixed(1)}%</div>
                            <div>客胜：{(results.compAwayWin * 100).toFixed(1)}%</div>
                            <div>预期进球：{(results.expectedHomeGoals + results.expectedAwayGoals).toFixed(2)}</div>
                            <div>小球概率：{((results.overUnderProb.find(p => p.line === 2.5)?.under || 0) * 100).toFixed(1)}%</div>
                            <div>大球概率：{((results.overUnderProb.find(p => p.line === 2.5)?.over || 0) * 100).toFixed(1)}%</div>
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                </>
              )}

            </div>

          {/* DeepSeek API Key 配置弹窗 */}
          <DeepSeekKeyModal
            isOpen={showKeyModal}
            onClose={() => setShowKeyModal(false)}
            onSaved={() => {
              setShowKeyModal(false);
              // Key 保存成功后自动触发 AI 分析
              rawFetchAiAnalysis(home?.id || '', away?.id || '', odds, results!, { advancedParams, isStatsCustomized, customStats });
            }}
          />
          </div>
  );
}


