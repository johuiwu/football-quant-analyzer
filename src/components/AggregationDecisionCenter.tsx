import React, { useMemo } from 'react';
import { Zap, TrendingUp, TrendingDown, Minus, AlertTriangle, CheckCircle } from 'lucide-react';
import { useAppStore } from '../store/useAppStore';

import { calculateLeagueTimeDecay } from '../models/bayesian';
import { calculateBaseOdds } from '../utils/oddsCalculator';
import { getTeamElo } from '../models/elo';

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
}

export function AggregationDecisionCenter({ marketOdds, results, homeTeamName, awayTeamName, handicap, homeTeam, awayTeam }: Props) {
  const liveMatch = useAppStore((s) => s.liveMatch);

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
    const homeElo = getTeamElo(safeHomeTeam);
    const awayElo = getTeamElo(safeAwayTeam);
    const homeXg = safeHomeTeam.homeXg;
    const awayXg = safeAwayTeam.awayXg;
    return calculateBaseOdds(homeElo, awayElo, Math.max(0.5, homeXg), Math.max(0.5, awayXg), 1.0, 1.0);
  }, [safeHomeTeam, safeAwayTeam]);

  const oddsMismatch = useMemo(() => {
    const homeDiff = Math.abs((marketOdds.homeOdds - modelOdds.homeOdds) / marketOdds.homeOdds);
    const drawDiff = Math.abs((marketOdds.drawOdds - modelOdds.drawOdds) / marketOdds.drawOdds);
    const awayDiff = Math.abs((marketOdds.awayOdds - modelOdds.awayOdds) / marketOdds.awayOdds);
    return {
      hasMismatch: homeDiff > 0.2 || drawDiff > 0.2 || awayDiff > 0.2,
      maxDiff: Math.max(homeDiff, drawDiff, awayDiff)
    };
  }, [marketOdds, modelOdds]);

  // 使用 results 中的真实数据，或者回退到基于球队的计算
  const preMatchPredictions = useMemo(() => {
    if (results?.compHomeWin !== undefined) {
      return {
        homeWin: results.compHomeWin,
        draw: results.compDraw,
        awayWin: results.compAwayWin,
        homeXg: safeHomeTeam.homeXg,
        awayXg: safeAwayTeam.awayXg
      };
    }
    const homeElo = getTeamElo(safeHomeTeam);
    const awayElo = getTeamElo(safeAwayTeam);
    const eloDiff = homeElo - awayElo;
    const homeWinProb = 1 / (1 + Math.pow(10, -eloDiff / 700));
    const xgDiff = safeHomeTeam.homeXg - safeAwayTeam.awayXg;
    const adjustedHomeWin = Math.max(0.05, Math.min(0.95, homeWinProb + xgDiff * 0.03));
    const adjustedAwayWin = Math.max(0.05, Math.min(0.95, 1 - homeWinProb - xgDiff * 0.03));
    const drawProb = Math.max(0.05, 1 - adjustedHomeWin - adjustedAwayWin);
    const total = adjustedHomeWin + drawProb + adjustedAwayWin;
    
    return {
      homeWin: adjustedHomeWin / total,
      draw: drawProb / total,
      awayWin: adjustedAwayWin / total,
      homeXg: safeHomeTeam.homeXg,
      awayXg: safeAwayTeam.awayXg
    };
  }, [results, safeHomeTeam, safeAwayTeam]);

  // ???????? isActive ??????? currentMinute ????
  const timeFactor = useMemo(() => {
    return calculateLeagueTimeDecay(currentMinute, safeHomeTeam?.league || safeAwayTeam?.league, 90);
  }, [currentMinute, safeHomeTeam, safeAwayTeam]);

  const dynamicPredictions = useMemo(() => {
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

  const recommendation = useMemo(() => {
    // 优先使用 aggregatedDecision 中的数据
    if (results?.aggregatedDecision) {
      const { direction, confidence } = results.aggregatedDecision;
      let directionText = '平局';
      let colorClass = 'bg-gradient-to-r from-amber-400 via-orange-400 to-red-400';
      let glowClass = 'drop-shadow-[0_0_12px_rgba(251,146,60,0.6)]';
      
      switch(direction) {
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
        default:
          directionText = '平局';
          break;
      }
      
      return {
        direction: directionText,
        confidence: confidence || adjustedHomeWin,
        colorClass,
        glowClass,
        aggregatedDirection: direction
      };
    }
    
    // 如果没有 aggregatedDecision，使用本地计算
    if (adjustedHomeWin > adjustedAwayWin && adjustedHomeWin > adjustedDraw) {
      return { 
        direction: '主胜', 
        confidence: adjustedHomeWin, 
        colorClass: 'bg-gradient-to-r from-blue-400 via-purple-500 to-pink-500',
        glowClass: 'drop-shadow-[0_0_12px_rgba(139,92,246,0.6)]',
        aggregatedDirection: 'HOME_WIN'
      };
    } else if (adjustedAwayWin > adjustedHomeWin && adjustedAwayWin > adjustedDraw) {
      return { 
        direction: '客胜', 
        confidence: adjustedAwayWin, 
        colorClass: 'bg-gradient-to-r from-cyan-400 via-green-400 to-yellow-400',
        glowClass: 'drop-shadow-[0_0_12px_rgba(34,197,94,0.6)]',
        aggregatedDirection: 'AWAY_WIN'
      };
    } else {
      return { 
        direction: '平局', 
        confidence: adjustedDraw, 
        colorClass: 'bg-gradient-to-r from-amber-400 via-orange-400 to-red-400',
        glowClass: 'drop-shadow-[0_0_12px_rgba(251,146,60,0.6)]',
        aggregatedDirection: 'DRAW'
      };
    }
  }, [results, adjustedHomeWin, adjustedDraw, adjustedAwayWin]);

  const homeTeamDisplay = homeTeamName || safeHomeTeam.nameCn;
  const awayTeamDisplay = awayTeamName || safeAwayTeam.nameCn;

  const displayDirection = useMemo(() => {
    const dir = recommendation.aggregatedDirection;
    switch(dir) {
      case 'HOME_WIN': return `${homeTeamDisplay} 主胜`;
      case 'AWAY_WIN': return `${awayTeamDisplay} 客胜`;
      case 'DRAW': return '平局';
      case 'OVER': return '大球';
      case 'UNDER': return '小球';
      default: return '平局';
    }
  }, [recommendation.aggregatedDirection, recommendation.direction, homeTeamDisplay, awayTeamDisplay]);

  const getConfidenceColor = (confidence: number) => {
    if (confidence > 0.7) return 'text-emerald-400';
    if (confidence > 0.5) return 'text-yellow-400';
    return 'text-red-400';
  };

  return (
    <div className="relative">
      {/* 核心推荐区 */}
      <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 rounded-xl border border-slate-700/50 p-4 mb-3">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-4 flex-wrap">
            <div className="flex items-center gap-2">
              <Zap className="w-6 h-6 text-yellow-400" />
              <span className="text-xl font-bold text-white">终极多核推荐:</span>
            </div>
            <span className={`text-3xl font-black ${recommendation.colorClass} bg-clip-text text-transparent ${recommendation.glowClass}`}>
              {displayDirection}
            </span>
          </div>
          
          {/* 置信度和多因子校准 */}
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-slate-400">集成置信度</span>
              <span className={`text-xl font-black font-mono ${getConfidenceColor(recommendation.confidence)} drop-shadow-lg`}>
                {(recommendation.confidence * 100).toFixed(1)}%
              </span>
            </div>
            <div className="flex items-center gap-1.5 px-2 py-1 bg-yellow-500/15 border border-yellow-500/30 rounded-full">
              <CheckCircle className="w-3 h-3 text-yellow-400" />
              <span className="text-[10px] text-yellow-400">多因子校准</span>
            </div>
          </div>
        </div>
        
        {/* 副标题 */}
        <div className="mt-2 pl-8">
          <span className="text-sm text-slate-500">
            融合拟合 Poisson 目标、等级 Elo 战力修正与 Dixon 变态方程
          </span>
        </div>
      </div>

      {/* 数据展示区域 */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-3">
        
        {/* 1. 概率分布 */}
        <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 p-3">
          <div className="text-[10px] uppercase tracking-wider text-slate-400 mb-2">概率分布</div>
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <TrendingUp className="w-3 h-3 text-red-400" />
              <span className="text-xs text-red-400">主胜</span>
              <div className="flex-1 h-1.5 bg-slate-700 rounded-full overflow-hidden">
                <div className="h-full bg-red-500" style={{ width: `${adjustedHomeWin * 100}%` }} />
              </div>
              <span className="text-xs font-mono font-bold text-red-400">{(adjustedHomeWin * 100).toFixed(1)}%</span>
            </div>
            <div className="flex items-center gap-2">
              <Minus className="w-3 h-3 text-slate-400" />
              <span className="text-xs text-slate-400">平局</span>
              <div className="flex-1 h-1.5 bg-slate-700 rounded-full overflow-hidden">
                <div className="h-full bg-slate-500" style={{ width: `${adjustedDraw * 100}%` }} />
              </div>
              <span className="text-xs font-mono font-bold text-slate-300">{(adjustedDraw * 100).toFixed(1)}%</span>
            </div>
            <div className="flex items-center gap-2">
              <TrendingDown className="w-3 h-3 text-green-400" />
              <span className="text-xs text-green-400">客胜</span>
              <div className="flex-1 h-1.5 bg-slate-700 rounded-full overflow-hidden">
                <div className="h-full bg-green-500" style={{ width: `${adjustedAwayWin * 100}%` }} />
              </div>
              <span className="text-xs font-mono font-bold text-green-400">{(adjustedAwayWin * 100).toFixed(1)}%</span>
            </div>
          </div>
        </div>

        {/* 2. 赔率对比 */}
        <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 p-3">
          <div className="text-[10px] uppercase tracking-wider text-slate-400 mb-2">赔率对比</div>
          <div className="space-y-1.5">
            <div className="flex justify-between text-xs">
              <span className="text-red-400">主胜</span>
              <div className="flex items-center gap-2">
                <span className="text-slate-300 font-mono">市 {marketOdds.homeOdds.toFixed(2)}</span>
                <span className="text-slate-600">|</span>
                <span className="text-blue-400 font-mono">模 {modelOdds.homeOdds.toFixed(2)}</span>
              </div>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-slate-400">平局</span>
              <div className="flex items-center gap-2">
                <span className="text-slate-300 font-mono">市 {marketOdds.drawOdds.toFixed(2)}</span>
                <span className="text-slate-600">|</span>
                <span className="text-blue-400 font-mono">模 {modelOdds.drawOdds.toFixed(2)}</span>
              </div>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-green-400">客胜</span>
              <div className="flex items-center gap-2">
                <span className="text-slate-300 font-mono">市 {marketOdds.awayOdds.toFixed(2)}</span>
                <span className="text-slate-600">|</span>
                <span className="text-blue-400 font-mono">模 {modelOdds.awayOdds.toFixed(2)}</span>
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
