import React, { useMemo } from 'react';
import { AlertTriangle, Shield } from 'lucide-react';
import { useAppStore } from '../store/useAppStore';

import { calculateLeagueTimeDecay } from '../models/bayesian';
import { calculateBaseOdds } from '../utils/oddsCalculator';
import { getTeamElo } from '../models/elo';
import type { MatchDirection } from '../utils/handicapArbiter';

interface MarketOdds {
  homeOdds: number;
  drawOdds: number;
  awayOdds: number;
}

interface Props {
  marketOdds: MarketOdds;
  results?: any;
  homeTeamName?: string;
  awayTeamName?: string;
  handicap?: number;
  homeTeam?: any; // TeamStats from parent
  awayTeam?: any; // TeamStats from parent
  payoutRate?: number;
  riskRating?: string;
  compHomeWin?: number;
  compDraw?: number;
  compAwayWin?: number;
  recommendedReason?: string;
  upsetLevel?: string;
  coldUpsetAlert?: boolean;
  zScoreHome?: number;
  zScoreAway?: number;
  // 仲裁结果（由 DashboardPage 传入，组件不再自行计算）
  arbitratedDirection?: MatchDirection;
  arbitratedConfidence?: number;
  arbitratedModelDirection?: MatchDirection;
  // 实时贝叶斯更新结果（由 DashboardPage 传入）
  liveResults?: { liveHomeWin: number; liveDraw: number; liveAwayWin: number };
  isLiveActive?: boolean;
}

export function AggregationDecisionCenter({ marketOdds, results, homeTeamName, awayTeamName, handicap, homeTeam: propsHomeTeam, awayTeam: propsAwayTeam, payoutRate, riskRating, compHomeWin, compDraw, compAwayWin, recommendedReason, upsetLevel, coldUpsetAlert, zScoreHome, zScoreAway, arbitratedDirection, arbitratedConfidence, arbitratedModelDirection, liveResults, isLiveActive }: Props) {
  const liveMatch = useAppStore((s) => s.liveMatch);

  // 直接从 Zustand Store 获取最新球队数据，确保 Understat 字段实时更新
  const storeTeams = useAppStore((s) => s.teams);
  const selectedHomeId = useAppStore((s) => s.selectedHomeId);
  const selectedAwayId = useAppStore((s) => s.selectedAwayId);
  const storeHomeTeam = storeTeams.find(t => t.id === selectedHomeId);
  const storeAwayTeam = storeTeams.find(t => t.id === selectedAwayId);
  const homeTeam = storeHomeTeam || propsHomeTeam;
  const awayTeam = storeAwayTeam || propsAwayTeam;

  const {
    elapsedMinutes: currentMinute,
    homeScore,
    awayScore,
    homeRedCards,
    awayRedCards,
    isLive: isActive,
    matchStatus
  } = liveMatch;

  // 使用 props 传入的球队数据，不再内部查找 REAL_TEAMS
  const safeHomeTeam = homeTeam || { homeXg: 1.5, awayXg: 1.5, nameCn: homeTeamName || '主队', league: 'DEFAULT', rank: 10 };
  const safeAwayTeam = awayTeam || { homeXg: 1.5, awayXg: 1.5, nameCn: awayTeamName || '客队', league: 'DEFAULT', rank: 10 };

  const modelOdds = useMemo(() => {
    if (!results?.compHomeWin || !results?.compDraw || !results?.compAwayWin) return undefined;
    return {
      homeOdds: 1 / results.compHomeWin,
      drawOdds: 1 / results.compDraw,
      awayOdds: 1 / results.compAwayWin,
    };
  }, [results?.compHomeWin, results?.compDraw, results?.compAwayWin]);

  const oddsMismatch = useMemo(() => {
    if (!modelOdds) return { hasMismatch: false, maxDiff: 0 };
    const homeDiff = Math.abs((marketOdds.homeOdds - modelOdds.homeOdds) / marketOdds.homeOdds);
    const drawDiff = Math.abs((marketOdds.drawOdds - modelOdds.drawOdds) / marketOdds.drawOdds);
    const awayDiff = Math.abs((marketOdds.awayOdds - modelOdds.awayOdds) / marketOdds.awayOdds);
    return {
      hasMismatch: homeDiff > 0.2 || drawDiff > 0.2 || awayDiff > 0.2,
      maxDiff: Math.max(homeDiff, drawDiff, awayDiff)
    };
  }, [marketOdds, modelOdds]);

  // 使用 results 中的真实数据，无本地回退
  const preMatchPredictions = useMemo(() => {
    if (results?.compHomeWin !== undefined) {
      return {
        homeWin: results.compHomeWin,
        draw: results.compDraw,
        awayWin: results.compAwayWin,
        homeXg: safeHomeTeam.homeXg > 0 ? safeHomeTeam.homeXg : (safeHomeTeam.homeStats?.xgFor || 1.5),
        awayXg: safeAwayTeam.awayXg > 0 ? safeAwayTeam.awayXg : (safeAwayTeam.awayStats?.xgFor || 1.5)
      };
    }
    // 无本地回退：数据不足时返回 undefined
    return undefined;
  }, [results, safeHomeTeam, safeAwayTeam]);

  const timeFactor = useMemo(() => {
    return calculateLeagueTimeDecay(currentMinute, safeHomeTeam?.league || safeAwayTeam?.league, 90);
  }, [currentMinute, safeHomeTeam, safeAwayTeam]);

  const dynamicPredictions = useMemo(() => {
    if (!preMatchPredictions) {
      return {
        adjustedHomeWin: 0.33,
        adjustedDraw: 0.33,
        adjustedAwayWin: 0.33,
        homeXg: 1.5,
        awayXg: 1.5,
        description: '数据不足'
      };
    }

    if (!isActive || matchStatus === 'pre-match') {
      return {
        ...preMatchPredictions,
        adjustedHomeWin: preMatchPredictions.homeWin,
        adjustedDraw: preMatchPredictions.draw,
        adjustedAwayWin: preMatchPredictions.awayWin,
        description: '赛前预测'
      };
    }

    const homeRedCardPenalty = Math.max(0, 1 - homeRedCards * 0.15);
    const awayRedCardPenalty = Math.max(0, 1 - awayRedCards * 0.15);

    const scoreDiff = homeScore - awayScore;
    let homePower = 1;
    let awayPower = 1;

    if (scoreDiff > 0) {
      homePower = 0.7 + scoreDiff * 0.1;
      awayPower = 0.3 + Math.max(0, 1 - scoreDiff * 0.15);
    } else if (scoreDiff < 0) {
      const absDiff = Math.abs(scoreDiff);
      awayPower = 0.7 + absDiff * 0.1;
      homePower = 0.3 + Math.max(0, 1 - absDiff * 0.15);
    }

    homePower = Math.min(1.2, Math.max(0.3, homePower * homeRedCardPenalty));
    awayPower = Math.min(1.2, Math.max(0.3, awayPower * awayRedCardPenalty));

    let homeWin = preMatchPredictions.homeWin;
    let draw = preMatchPredictions.draw;
    let awayWin = preMatchPredictions.awayWin;

    if (scoreDiff !== 0) {
      const momentumFactor = scoreDiff > 0 ? homePower : awayPower;
      if (scoreDiff > 0) {
        homeWin = Math.min(0.9, homeWin + momentumFactor * 0.15);
        awayWin = Math.max(0.05, awayWin - momentumFactor * 0.1);
      } else {
        awayWin = Math.min(0.9, awayWin + momentumFactor * 0.15);
        homeWin = Math.max(0.05, homeWin - momentumFactor * 0.1);
      }
      draw = Math.max(0.05, 1 - homeWin - awayWin);
    }

    const total = homeWin + draw + awayWin;
    homeWin /= total;
    draw /= total;
    awayWin /= total;

    let description = '实时计算中';
    if (matchStatus === 'halftime') {
      description = '中场分析';
    } else if (currentMinute >= 90) {
      description = '全场结束';
    }

    return {
      ...preMatchPredictions,
      adjustedHomeWin: homeWin,
      adjustedDraw: draw,
      adjustedAwayWin: awayWin,
      description
    };
  }, [isActive, matchStatus, currentMinute, homeScore, awayScore, homeRedCards, awayRedCards, preMatchPredictions]);

  const {
    adjustedHomeWin,
    adjustedDraw,
    adjustedAwayWin,
    homeXg,
    awayXg
  } = dynamicPredictions;

  const xptsDiff = (results as any)?.xptsDiff || 0;
  const ppdaDiff = (results as any)?.ppdaDiff || 0;
  const npxgdDiff = (results as any)?.npxgdDiff || 0;
  // 高级战术特征差值来自 quantModel.ts 的标准化计算（场均差值）
  const hasAdvancedData = xptsDiff !== 0 || ppdaDiff !== 0 || npxgdDiff !== 0;

  // 推荐方向：仅使用 DashboardPage 传入的仲裁结果，不再本地计算
  const recommendation = useMemo(() => {
    const isLiveRecommendation = isLiveActive && liveResults !== undefined;

    if (arbitratedDirection) {
      let directionText = '平局';
      let colorClass = 'bg-gradient-to-r from-amber-400 via-orange-400 to-red-400';
      let glowClass = 'drop-shadow-[0_0_12px_rgba(251,146,60,0.6)]';
      
      switch(arbitratedDirection) {
        case 'HOME_WIN':
          directionText = '主胜';
          colorClass = 'bg-gradient-to-r from-blue-400 via-purple-500 to-pink-500';
          glowClass = 'drop-shadow-[0_0_12px_rgba(139,92,246,0.6)]';
          break;
        case 'AWAY_WIN':
          directionText = '客胜';
          colorClass = 'bg-gradient-to-r from-cyan-400 via-green-400 to-yellow-400';
          glowClass = 'drop-shadow-[0_0_12px_rgba(34,197,94,0.6)]';
          break;
        case 'DRAW':
          directionText = '平局';
          break;
        default:
          directionText = '平局';
          break;
      }

      return {
        direction: directionText,
        confidence: arbitratedConfidence,
        colorClass,
        glowClass,
        aggregatedDirection: arbitratedDirection,
        modelDirection: arbitratedModelDirection ?? arbitratedDirection,
        totalGoalsRecommendation: results?.aggregatedDecision?.totalGoalsRecommendation,
        isLiveRecommendation,
      };
    }
    
    // 无仲裁结果：数据不足
    return {
      direction: '数据不足',
      confidence: undefined as number | undefined,
      colorClass: 'bg-gradient-to-r from-slate-500 via-slate-600 to-slate-500',
      glowClass: '',
      aggregatedDirection: undefined as MatchDirection | undefined,
      modelDirection: undefined as MatchDirection | undefined,
      totalGoalsRecommendation: undefined as { direction: 'OVER' | 'UNDER'; confidence: number } | undefined,
      isLiveRecommendation,
    };
  }, [arbitratedDirection, arbitratedConfidence, arbitratedModelDirection, results, isLiveActive, liveResults]);

  const homeTeamDisplay = homeTeamName || safeHomeTeam.nameCn;
  const awayTeamDisplay = awayTeamName || safeAwayTeam.nameCn;

  const getConfidenceColor = (confidence: number) => {
    if (confidence > 0.7) return 'text-emerald-400';
    if (confidence > 0.5) return 'text-yellow-400';
    return 'text-red-400';
  };

  return (
    <div className="relative">
      {/* 核心推荐区 */}
      <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 rounded-xl border border-slate-700/50 p-4 mb-3">
        {/* 第一层：主标题行（左右对齐） */}
        <div className="flex items-start justify-between mb-2">
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xl font-bold text-white">
                ⚡ 盘口优化推荐：
              </span>
              <span className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-amber-300 via-amber-500 to-orange-500">
                {recommendation.aggregatedDirection === 'HOME_WIN' ? homeTeamDisplay : recommendation.aggregatedDirection === 'AWAY_WIN' ? awayTeamDisplay : recommendation.direction}
              </span>
              {(handicap ?? 0) !== 0 && (
                <span className="text-xs text-slate-400 self-center">
                  （基于亚盘 {(handicap ?? 0) > 0 ? '受让' : '让'} {Math.abs(handicap ?? 0)} 球优化）
                </span>
              )}
            </div>

            {/* 大小球推荐（独立维度） */}
            {recommendation.totalGoalsRecommendation && (
              <div className="flex items-center gap-2 text-sm">
                <span className="text-slate-500">⚽ 总进球数：</span>
                <span className={`font-bold ${recommendation.totalGoalsRecommendation.direction === 'OVER' ? 'text-orange-400' : 'text-cyan-400'}`}>
                  {recommendation.totalGoalsRecommendation.direction === 'OVER' ? '大球' : '小球'}
                </span>
                <span className="text-slate-500 text-xs">
                  （置信度 {(recommendation.totalGoalsRecommendation.confidence * 100).toFixed(1)}%）
                </span>
              </div>
            )}

            {/* 模型纯概率最优（辅助说明） */}
            <div className="flex items-center gap-2 text-sm text-slate-400">
              <span>📊 模型纯概率最优：</span>
              <span className="text-slate-300">
                {recommendation.modelDirection === 'HOME_WIN' ? homeTeamDisplay : recommendation.modelDirection === 'AWAY_WIN' ? awayTeamDisplay : recommendation.direction}
                {recommendation.modelDirection && (
                  <span className="text-slate-500 ml-1">（{(Math.max(adjustedHomeWin, adjustedDraw, adjustedAwayWin) * 100).toFixed(1)}%）</span>
                )}
              </span>
            </div>
          </div>

          {/* 右侧：置信度 + 回返率 + 风险等级 */}
          <div className="flex flex-col items-end gap-1 shrink-0">
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-400">集成置信度</span>
              {recommendation.confidence !== undefined && recommendation.confidence !== null ? (
                <span className={`text-lg font-bold font-mono ${getConfidenceColor(recommendation.confidence)} drop-shadow-lg`}>
                  {(recommendation.confidence * 100).toFixed(1)}%
                </span>
              ) : (
                <span className="text-lg font-bold font-mono text-slate-500">--</span>
              )}
            </div>
            <div className="flex items-center gap-1">
              {payoutRate !== undefined && (
                <>
                  <span className="text-xs text-slate-400">机构回返率</span>
                  <span className="text-xs font-mono text-emerald-400">{(payoutRate * 100).toFixed(2)}%</span>
                </>
              )}
              {riskRating && (
                <span className={`text-[10px] px-1.5 py-0.5 rounded ${
                  riskRating === 'LOW' ? 'bg-emerald-500/20 text-emerald-400' : riskRating === 'MEDIUM' ? 'bg-yellow-500/20 text-yellow-500' : 'bg-rose-500/20 text-rose-400'
                }`}>
                  {riskRating === 'LOW' ? '极低风险' : riskRating === 'MEDIUM' ? '稳妥适中' : '高风险防守'}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* 第二层：融合来源与胜率分布（横向弹性布局） */}
        <div className="flex items-center justify-between border-t border-slate-700/50 pt-3 mt-1 flex-wrap gap-3">
          <div className="flex items-center gap-6 text-sm text-slate-400">
            <span>融合来源：<span className="text-slate-300">量化模型 + 市场数据</span></span>
            {compHomeWin !== undefined && compDraw !== undefined && compAwayWin !== undefined && (
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-blue-500"></span>
                  <span className="text-slate-300">主胜 {(compHomeWin * 100).toFixed(1)}%</span>
                </div>
                <div className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-slate-500"></span>
                  <span className="text-slate-300">平局 {(compDraw * 100).toFixed(1)}%</span>
                </div>
                <div className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-green-500"></span>
                  <span className="text-slate-300">客胜 {(compAwayWin * 100).toFixed(1)}%</span>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* 第三层：底部说明与冷门预警（统一边距） */}
        <div className="flex flex-col gap-3 mt-2 text-sm text-slate-400">
          {recommendedReason && (
            <p className="leading-relaxed">{recommendedReason}</p>
          )}

          {/* 冷门预警 / 数据积累中 */}
          {upsetLevel === "cold_start" && (
            <div className="flex items-start gap-3 rounded-lg bg-orange-900/10 border border-orange-500/30 p-3">
              <AlertTriangle className="w-4 h-4 shrink-0 text-orange-400 mt-0.5" />
              <div className="flex-1 text-xs text-orange-300/90 leading-relaxed">
                📊 数据积累中：历史投注数据尚不足 5 场，爆冷预警功能将在积累足够数据后自动启用。
              </div>
            </div>
          )}
          {coldUpsetAlert && upsetLevel !== "cold_start" && (() => {
            const isDanger = upsetLevel === "danger";
            return (
              <div className={`flex items-start gap-3 rounded-lg border p-3 ${isDanger ? "bg-rose-900/10 border-rose-500/30" : "bg-orange-900/10 border-orange-500/30"}`}>
                <AlertTriangle className={`w-4 h-4 shrink-0 mt-0.5 ${isDanger ? "text-rose-500" : "text-orange-400"}`} />
                <div className={`flex-1 text-xs leading-relaxed ${isDanger ? "text-rose-300/90" : "text-orange-300/90"}`}>
                  <span className="font-bold">{isDanger ? "🔴 高危爆冷预警：" : "冷门预警："}</span>
                  投注量异常 (Z-Score: 主 {zScoreHome && zScoreHome !== 0 ? zScoreHome.toFixed(1) : "数据待积累"} / 客 {zScoreAway && zScoreAway !== 0 ? zScoreAway.toFixed(1) : "数据待积累"})，
                  模型概率显著高于赔率隐含概率，建议防冷。
                </div>
              </div>
            );
          })()}
        </div>
      </div>

      {/* 数据展示区域 */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-3">

        {/* 1. 赔率对比 */}
        <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 p-3">
          <div className="text-[10px] uppercase tracking-wider text-slate-400 mb-2">赔率对比</div>
          <div className="space-y-1.5">
            <div className="flex justify-between text-xs">
              <span className="text-red-400">主胜</span>
              <div className="flex items-center gap-2">
                <span className="text-slate-300 font-mono">市 {marketOdds.homeOdds.toFixed(2)}</span>
                <span className="text-slate-600">|</span>
                <span className="text-blue-400 font-mono">模 {modelOdds?.homeOdds?.toFixed(2) ?? '--'}</span>
              </div>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-slate-400">平局</span>
              <div className="flex items-center gap-2">
                <span className="text-slate-300 font-mono">市 {marketOdds.drawOdds.toFixed(2)}</span>
                <span className="text-slate-600">|</span>
                <span className="text-blue-400 font-mono">模 {modelOdds?.drawOdds?.toFixed(2) ?? '--'}</span>
              </div>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-green-400">客胜</span>
              <div className="flex items-center gap-2">
                <span className="text-slate-300 font-mono">市 {marketOdds.awayOdds.toFixed(2)}</span>
                <span className="text-slate-600">|</span>
                <span className="text-blue-400 font-mono">模 {modelOdds?.awayOdds?.toFixed(2) ?? '--'}</span>
              </div>
            </div>
          </div>
          
          {/* 实时比分 */}
          {isActive && matchStatus === 'live' && currentMinute > 0 && (
            <div className="mt-2 pt-2 border-t border-slate-700/50">
              <div className="flex items-center justify-center gap-2 text-xs">
                <span className="text-red-400 font-bold">{homeScore}</span>
                <span className="text-slate-600">:</span>
                <span className="text-green-400 font-bold">{awayScore}</span>
                <span className="text-slate-500 ml-1">{currentMinute}'</span>
              </div>
            </div>
          )}
        </div>

        {/* 3. xG 预期进球 */}
        <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 p-3">
          <div className="text-[10px] uppercase tracking-wider text-slate-400 mb-2">预期进球 (xG)</div>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-red-500" />
                <span className="text-xs text-red-400">{homeTeamDisplay}</span>
              </div>
              <span className="text-sm font-mono font-bold text-white">{homeXg.toFixed(2)}</span>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-green-500" />
                <span className="text-xs text-green-400">{awayTeamDisplay}</span>
              </div>
              <span className="text-sm font-mono font-bold text-white">{awayXg.toFixed(2)}</span>
            </div>
          </div>
        </div>

        {/* 高级战术特征 */}
        <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 p-3 space-y-2">
          <div className="text-[10px] uppercase tracking-wider text-slate-400 mb-2 flex items-center gap-1.5">
            <Shield className="w-3.5 h-3.5 text-cyan-400" /> 高级战术特征
          </div>
          {!hasAdvancedData ? (
            <div className="text-[10px] text-slate-500 text-center py-2">非五大联赛，暂无高阶数据</div>
          ) : (
            <div className="space-y-1.5">
              <div className="flex justify-between text-[10px]">
                <span className="text-slate-400">xPTS 预期积分差</span>
                <span className={`font-mono font-bold ${xptsDiff >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                  {xptsDiff >= 0 ? '+' : ''}{xptsDiff.toFixed(2)}
                </span>
              </div>
              <div className="flex justify-between text-[10px]">
                <span className="text-slate-400">PPDA 压迫强度差</span>
                <span className={`font-mono font-bold ${ppdaDiff >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                  {ppdaDiff >= 0 ? '+' : ''}{ppdaDiff.toFixed(2)}
                </span>
              </div>
              <div className="flex justify-between text-[10px]">
                <span className="text-slate-400">NPxGD 非点球xG差</span>
                <span className={`font-mono font-bold ${npxgdDiff >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                  {npxgdDiff >= 0 ? '+' : ''}{npxgdDiff.toFixed(2)}
                </span>
              </div>
            </div>
          )}
        </div>

        {/* 4. 动态因子 */}
        <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 p-3">
          <div className="text-[10px] uppercase tracking-wider text-slate-400 mb-2">动态因子</div>
          <div className="flex justify-between items-center">
            <div className="text-center">
              <div className="text-[10px] text-slate-500">⏱️ 比赛时间</div>
              <div className="text-sm font-mono font-bold text-cyan-400">{currentMinute}'</div>
            </div>
            <div className="text-center">
              <div className="text-[10px] text-slate-500">⏳ 剩余因子</div>
              <div className="text-sm font-mono font-bold text-blue-400">{(timeFactor * 100).toFixed(0)}%</div>
            </div>
          </div>
          
          {/* 警告提示 */}
          {oddsMismatch.hasMismatch && (
            <div className="mt-2 flex items-center gap-1 px-2 py-1 bg-red-500/15 border border-red-500/30 rounded">
              <AlertTriangle className="w-3 h-3 text-red-400" />
              <span className="text-[10px] text-red-400">赔率偏离 {(oddsMismatch.maxDiff * 100).toFixed(0)}%</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default AggregationDecisionCenter;
