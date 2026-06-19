import { useState } from 'react';
import { TeamStats } from '../data/realTeamsData';
import { PredictionResults } from '../utils/quantModel';
import { Info, X, HelpCircle } from 'lucide-react';

interface TeamRadarChartProps {
  homeName: string;
  awayName: string;
  homeStats: TeamStats;
  awayStats: TeamStats;
  results: PredictionResults;
}

const DIMENSION_INFOS: Record<string, {
  title: string;
  formula: string;
  description: string;
  mathExplanation: string;
}> = {
  attack: {
    title: '进攻实力 (Attack Index)',
    formula: 'λ_home = H_GF_avg * (A_GA_avg / League_G_avg)',
    description: '通过主队特定主场场均进球率与客队场均失球率，对消对手历史平均偏度，除以联赛场均基数得出的泊松期望进攻强度 lambda。',
    mathExplanation: '在 Poisson 模型中，该值直接决定单场产生多个进球的几率阶乘收敛速度。数值越高代表射门创造力与门前嗅觉越好。'
  },
  defense: {
    title: '防守抗压 (Defense Index)',
    formula: 'μ_away = A_GA_avg * (H_GF_avg / League_G_avg)',
    description: '通过客队特定客场失球率，并对冲主队平均进球能力，转化而成的综合防御阻尼系数。越小越防守强，图中已进行了归一化倒数转换。',
    mathExplanation: '在算法中作为对手进球函数的基础抑制分母。数值越高代表该阵守体系韧性极高，零封或少失球期望越显著。'
  },
  accuracy: {
    title: '射门精度 (Shot Accuracy)',
    formula: '🎯 Accuracy = (Shot_On_Target / Total_Shots) * 100%',
    description: '在两队全部终结起脚射门中，能够直接命中守门员防守框架范围（射正）内的百分比率。',
    mathExplanation: '用作爆冷几率的浮动权重校乘数。高精度队伍在较低的绝对射门次数下，仍能实现更高的即时破门致胜期望分。'
  },
  cleansheets: {
    title: '零封率 (Clean Sheets)',
    formula: '🚫 CS_Rate = Clean_Sheets / Matches_Played * 100%',
    description: '历史对局中零封对手（不丢球）场次占已经历赛事总盘口的胜率比例。表现极致防守的硬性极限。',
    mathExplanation: '该指标在模型中用于修正 1X2 主胜和平局赔率的临界偏态，零封高的队伍在战术上具备极强的反压制及防守锁分底能。'
  },
  xgeff: {
    title: '期望效率 (xG Efficiency)',
    formula: '⚡ xG_Eff = Total_Goals_Scored / Total_xG_Expected_Goals',
    description: '实际进球总数与系统期望进球指数（Expected Goals, xG）的比值。精准折射球队是高位浪费机会还是神级门前终结者。',
    mathExplanation: '若 xG_Eff 远超 100%，则反映前锋具有世界级精准起脚极强的终结能，或者战术配合极简效；数值偏低则说明浪射偏轨严重。'
  }
};

export function TeamRadarChart({
  homeName,
  awayName,
  homeStats,
  awayStats,
  results
}: TeamRadarChartProps) {
  const [activeTooltip, setActiveTooltip] = useState<string | null>(null);

  // 1. Calculate underlying stats out of 100
  
  // Attack Index
  const homeAttack = Math.min(100, Math.max(15, results.homeAttackIndex * 50));
  const awayAttack = Math.min(100, Math.max(15, results.awayAttackIndex * 50));

  // Defense Strength (Inverted, higher is better)
  const homeDefense = Math.min(100, Math.max(15, (2.2 - results.homeDefenseIndex) * 45));
  const awayDefense = Math.min(100, Math.max(15, (2.2 - results.awayDefenseIndex) * 45));

  // Shot Accuracy (typically between 25% and 55%)
  const homeAccuracy = Math.min(100, Math.max(15, (homeStats.shotAccuracy / 55) * 100));
  const awayAccuracy = Math.min(100, Math.max(15, (awayStats.shotAccuracy / 55) * 100));

  // Clean Sheets
  const homeCleanSheets = Math.min(100, Math.max(15, (homeStats.cleanSheets / 18) * 100));
  const awayCleanSheets = Math.min(100, Math.max(15, (awayStats.cleanSheets / 18) * 100));

  // xG Efficiency (Goals For / xG For)
  const totalHomeGoals = (homeStats.homeStats.goalsFor || 0) + (homeStats.awayStats.goalsFor || 0);
  const totalHomeXg = (homeStats.homeStats.xgFor || 1) + (homeStats.awayStats.xgFor || 1);
  const homeXgEffVal = totalHomeGoals / Math.max(1, totalHomeXg);
  const homeXgEff = Math.min(100, Math.max(15, homeXgEffVal * 65));

  const totalAwayGoals = (awayStats.homeStats.goalsFor || 0) + (awayStats.awayStats.goalsFor || 0);
  const totalAwayXg = (awayStats.homeStats.xgFor || 1) + (awayStats.awayStats.xgFor || 1);
  const awayXgEffVal = totalAwayGoals / Math.max(1, totalAwayXg);
  const awayXgEff = Math.min(100, Math.max(15, awayXgEffVal * 65));

  // Dimensions order
  const dimensions = [
    { name: '进攻实力 (Attack)', key: 'attack', home: homeAttack, away: awayAttack, originalHome: results.homeAttackIndex.toFixed(2), originalAway: results.awayAttackIndex.toFixed(2), unit: 'x' },
    { name: '防守抗压 (Defense)', key: 'defense', home: homeDefense, away: awayDefense, originalHome: results.homeDefenseIndex.toFixed(2), originalAway: results.awayDefenseIndex.toFixed(2), unit: 'x' },
    { name: '射门精度 (Accuracy)', key: 'accuracy', home: homeAccuracy, away: awayAccuracy, originalHome: homeStats.shotAccuracy, originalAway: awayStats.shotAccuracy, unit: '%' },
    { name: '零封零失 (Clean Sheets)', key: 'cleansheets', home: homeCleanSheets, away: awayCleanSheets, originalHome: homeStats.cleanSheets, originalAway: awayStats.cleanSheets, unit: '场' },
    { name: '期望效率 (xG Efficiency)', key: 'xgeff', home: homeXgEff, away: awayXgEff, originalHome: (homeXgEffVal * 100).toFixed(0), originalAway: (awayXgEffVal * 100).toFixed(0), unit: '%' }
  ];

  // 2. Geometry calculations
  const width = 360;
  const height = 340;
  const cx = width / 2;
  const cy = height / 2 - 10;
  const r = 105; // Max radius for 100% value
  const numAxes = dimensions.length;

  // Generate ticks backgrounds (grid outer lines)
  const ticks = [20, 40, 60, 80, 100];

  // Radar vertices mapping
  const getCoordinates = (index: number, val: number) => {
    const angle = -Math.PI / 2 + (index * 2 * Math.PI) / numAxes;
    const distance = (val / 100) * r;
    return {
      x: cx + distance * Math.cos(angle),
      y: cy + distance * Math.sin(angle)
    };
  };

  // Build polygons
  const homePoints = dimensions.map((d, i) => {
    const pt = getCoordinates(i, d.home);
    return `${pt.x},${pt.y}`;
  }).join(' ');

  const awayPoints = dimensions.map((d, i) => {
    const pt = getCoordinates(i, d.away);
    return `${pt.x},${pt.y}`;
  }).join(' ');

  return (
    <div className="p-5 bg-[#0F1424] rounded-2xl border border-slate-800/80 shadow-xl flex flex-col justify-between h-full relative overflow-hidden">
      <div className="absolute top-0 right-0 w-24 h-24 bg-gradient-to-br from-indigo-500/10 to-transparent blur-2xl pointer-events-none" />
      
      <div>
        <div className="flex justify-between items-center mb-1">
          <h3 className="text-sm font-semibold text-slate-200 flex items-center gap-2">
            <span className="w-1.5 h-3.5 bg-indigo-500 rounded-full" />
            5维核心战术参数比对雷达图
          </h3>
          <span className="text-[10px] uppercase font-mono text-indigo-400 bg-indigo-500/10 px-2 py-0.5 rounded border border-indigo-500/20">
            D3 Physical Vector Axis
          </span>
        </div>
        <p className="text-[11px] text-slate-400 mb-2 gap-1 flex items-center leading-relaxed font-sans">
          <span>客观对比双方火力及稳定极限，<b>点击指标名或 ⓘ 图标查看核心公式定义</b>：</span>
        </p>
      </div>

      {/* Dimension Quick-Info Badges Header */}
      <div className="flex flex-wrap gap-1 justify-center mb-2 bg-slate-950/45 p-1 rounded-xl border border-slate-900">
        {Object.entries(DIMENSION_INFOS).map(([key, info]) => (
          <button
            key={key}
            onClick={() => setActiveTooltip(activeTooltip === key ? null : key)}
            className={`flex items-center gap-0.5 px-2 py-0.5 rounded-full text-[9px] font-medium transition-all cursor-pointer ${
              activeTooltip === key
                ? 'bg-indigo-600 font-bold text-white scale-105 shadow-md shadow-indigo-500/20'
                : 'bg-slate-900/60 text-slate-400 hover:text-slate-200 hover:bg-slate-800'
            }`}
          >
            <Info className="w-2.5 h-2.5 text-indigo-400" />
            {info.title.split(' ')[0]}
          </button>
        ))}
      </div>

      {/* SVG Canvas Container */}
      <div className="flex items-center justify-center my-1.5 relative">
        <svg viewBox={`0 0 ${width} ${height}`} className="w-full max-w-[310px] h-auto drop-shadow-[0_4px_12px_rgba(0,0,0,0.5)] notranslate" translate="no">
          {/* Radial Grid lines */}
          {ticks.map((tick) => {
            const pointsStr = Array.from({ length: numAxes }).map((_, i) => {
              const pt = getCoordinates(i, tick);
              return `${pt.x},${pt.y}`;
            }).join(' ');
            return (
              <polygon
                key={tick}
                points={pointsStr}
                fill="none"
                stroke="rgba(148, 163, 184, 0.08)"
                strokeDasharray={tick === 100 ? '0' : '2,2'}
                strokeWidth={tick === 100 ? '1.5' : '1'}
              />
            );
          })}

          {/* Concentric tick label values */}
          {ticks.slice(1, 5).map((tick) => {
            const pt = getCoordinates(0, tick);
            return (
              <text
                key={tick}
                x={pt.x + 5}
                y={pt.y + 11}
                fill="rgba(148, 163, 184, 0.45)"
                fontSize="8"
                fontFamily="monospace"
                style={{ userSelect: 'none' }}
              >
                {tick}
              </text>
            );
          })}

          {/* Axes lines */}
          {Array.from({ length: numAxes }).map((_, i) => {
            const outerCoord = getCoordinates(i, 100);
            return (
              <line
                key={i}
                x1={cx}
                y1={cy}
                x2={outerCoord.x}
                y2={outerCoord.y}
                stroke="rgba(148, 163, 184, 0.12)"
                strokeWidth="1.2"
              />
            );
          })}

          {/* Axes labels around radar */}
          {dimensions.map((d, i) => {
            const outerCoord = getCoordinates(i, 114);
            const anchor = i === 0 ? 'middle' : i === 1 || i === 2 ? 'start' : 'end';
            let dy = 4;
            if (i === 1 || i === 4) dy = 1;
            if (i === 2 || i === 3) dy = 5;
            if (i === 0) dy = -5;

            return (
              <text
                key={d.name}
                x={outerCoord.x}
                y={outerCoord.y + dy}
                fill={activeTooltip === d.key ? '#818CF8' : 'rgba(241, 245, 249, 0.8)'}
                fontSize="10"
                fontWeight={activeTooltip === d.key ? '700' : '500'}
                textAnchor={anchor}
                className="cursor-pointer hover:fill-indigo-400 transition-colors select-none font-medium"
                onClick={() => setActiveTooltip(activeTooltip === d.key ? null : d.key)}
                style={{ userSelect: 'none' }}
              >
                {d.name.split(' ')[0]} ⓘ
              </text>
            );
          })}

          {/* HOME TEAM POLYGON (Rose Red) */}
          <polygon
            points={homePoints}
            fill="rgba(239, 68, 68, 0.16)"
            stroke="url(#roseGradient)"
            strokeWidth="2.5"
            strokeLinecap="round"
            className="filter drop-shadow-[0_0_6px_rgba(239,68,68,0.35)]"
          />

          {/* AWAY TEAM POLYGON (Emerald Green) */}
          <polygon
            points={awayPoints}
            fill="rgba(16, 185, 129, 0.16)"
            stroke="url(#emeraldGradient)"
            strokeWidth="2.5"
            strokeLinecap="round"
            className="filter drop-shadow-[0_0_6px_rgba(16,185,129,0.35)]"
          />

          {/* HOME DATA VERTEX DOTS */}
          {dimensions.map((d, i) => {
            const pt = getCoordinates(i, d.home);
            return (
              <circle
                key={`h-dot-${i}`}
                cx={pt.x}
                cy={pt.y}
                r="3.5"
                fill="#EF4444"
                stroke="#ffffff"
                strokeWidth="1"
              />
            );
          })}

          {/* AWAY DATA VERTEX DOTS */}
          {dimensions.map((d, i) => {
            const pt = getCoordinates(i, d.away);
            return (
              <circle
                key={`a-dot-${i}`}
                cx={pt.x}
                cy={pt.y}
                r="3.5"
                fill="#10B981"
                stroke="#ffffff"
                strokeWidth="1"
              />
            );
          })}

          {/* Gradient definitions for glowing strokes */}
          <defs>
            <linearGradient id="roseGradient" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#F43F5E" />
              <stop offset="100%" stopColor="#BE123C" />
            </linearGradient>
            <linearGradient id="emeraldGradient" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#34D399" />
              <stop offset="100%" stopColor="#047857" />
            </linearGradient>
          </defs>
        </svg>
      </div>

      {/* Numerical Comparison Feed Panel below radar */}
      <div className="bg-slate-950 p-2.5 rounded-xl border border-slate-900 grid grid-cols-2 gap-3 mt-1 text-[11px] font-sans">
        {/* Home col */}
        <div className="border-r border-slate-900/85 pr-1.5 text-left">
          <span className="font-semibold text-rose-400 block mb-1.5 truncate">
            🔴 {homeName}
          </span>
          <div className="space-y-1.5 text-slate-400 font-mono text-[10px]">
            <div 
              className="flex justify-between items-center cursor-pointer hover:bg-slate-900/50 px-1 py-0.5 rounded transition-all group"
              onClick={() => setActiveTooltip('attack')}
              title="点击查看进攻指数量化公式"
            >
              <span className="flex items-center gap-1 text-slate-400 truncate">
                进攻指数 <Info className="w-2.5 h-2.5 text-indigo-400 opacity-40 group-hover:opacity-100 shrink-0" />
              </span>
              <span className="text-slate-200">{dimensions[0].originalHome}x</span>
            </div>
            
            <div 
              className="flex justify-between items-center cursor-pointer hover:bg-slate-900/50 px-1 py-0.5 rounded transition-all group"
              onClick={() => setActiveTooltip('defense')}
              title="点击查看防守指数量化公式"
            >
              <span className="flex items-center gap-1 text-slate-400 truncate">
                防守抗压 <Info className="w-2.5 h-2.5 text-indigo-400 opacity-40 group-hover:opacity-100 shrink-0" />
              </span>
              <span className="text-slate-200">{dimensions[1].originalHome}x</span>
            </div>

            <div 
              className="flex justify-between items-center cursor-pointer hover:bg-slate-900/50 px-1 py-0.5 rounded transition-all group"
              onClick={() => setActiveTooltip('accuracy')}
              title="点击查看射门精度算法"
            >
              <span className="flex items-center gap-1 text-slate-400 truncate">
                射门精度 <Info className="w-2.5 h-2.5 text-indigo-400 opacity-40 group-hover:opacity-100 shrink-0" />
              </span>
              <span className="text-slate-200">{homeStats.shotAccuracy}%</span>
            </div>

            <div 
              className="flex justify-between items-center cursor-pointer hover:bg-slate-900/50 px-1 py-0.5 rounded transition-all group"
              onClick={() => setActiveTooltip('cleansheets')}
              title="点击查看零封量化公式"
            >
              <span className="flex items-center gap-1 text-slate-400 truncate">
                零封率 <Info className="w-2.5 h-2.5 text-indigo-400 opacity-40 group-hover:opacity-100 shrink-0" />
              </span>
              <span className="text-slate-200">{homeStats.cleanSheets} 场</span>
            </div>

            <div 
              className="flex justify-between items-center cursor-pointer hover:bg-slate-900/50 px-1 py-0.5 rounded transition-all group"
              onClick={() => setActiveTooltip('xgeff')}
              title="点击查看xG效率算法"
            >
              <span className="flex items-center gap-1 text-slate-400 truncate">
                xG效率分 <Info className="w-2.5 h-2.5 text-indigo-400 opacity-40 group-hover:opacity-100 shrink-0" />
              </span>
              <span className="text-slate-200">{dimensions[4].originalHome}%</span>
            </div>
          </div>
        </div>

        {/* Away col */}
        <div className="pl-1 text-left">
          <span className="font-semibold text-emerald-400 block mb-1.5 truncate">
            🟢 {awayName}
          </span>
          <div className="space-y-1.5 text-slate-400 font-mono text-[10px]">
            <div 
              className="flex justify-between items-center cursor-pointer hover:bg-slate-900/50 px-1 py-0.5 rounded transition-all group"
              onClick={() => setActiveTooltip('attack')}
              title="点击查看进攻指数量化公式"
            >
              <span className="flex items-center gap-1 text-slate-400 truncate">
                进攻实力 <Info className="w-2.5 h-2.5 text-indigo-400 opacity-40 group-hover:opacity-100 shrink-0" />
              </span>
              <span className="text-slate-200">{dimensions[0].originalAway}x</span>
            </div>
            
            <div 
              className="flex justify-between items-center cursor-pointer hover:bg-slate-900/50 px-1 py-0.5 rounded transition-all group"
              onClick={() => setActiveTooltip('defense')}
              title="点击查看防守指数量化公式"
            >
              <span className="flex items-center gap-1 text-slate-400 truncate">
                防守抗压 <Info className="w-2.5 h-2.5 text-indigo-400 opacity-40 group-hover:opacity-100 shrink-0" />
              </span>
              <span className="text-slate-200">{dimensions[1].originalAway}x</span>
            </div>

            <div 
              className="flex justify-between items-center cursor-pointer hover:bg-slate-900/50 px-1 py-0.5 rounded transition-all group"
              onClick={() => setActiveTooltip('accuracy')}
              title="点击查看射门精度算法"
            >
              <span className="flex items-center gap-1 text-slate-400 truncate">
                射门精度 <Info className="w-2.5 h-2.5 text-indigo-400 opacity-40 group-hover:opacity-100 shrink-0" />
              </span>
              <span className="text-slate-200">{awayStats.shotAccuracy}%</span>
            </div>

            <div 
              className="flex justify-between items-center cursor-pointer hover:bg-slate-900/50 px-1 py-0.5 rounded transition-all group"
              onClick={() => setActiveTooltip('cleansheets')}
              title="点击查看零封量化公式"
            >
              <span className="flex items-center gap-1 text-slate-400 truncate">
                零封率 <Info className="w-2.5 h-2.5 text-indigo-400 opacity-40 group-hover:opacity-100 shrink-0" />
              </span>
              <span className="text-slate-200">{awayStats.cleanSheets} 场</span>
            </div>

            <div 
              className="flex justify-between items-center cursor-pointer hover:bg-slate-900/50 px-1 py-0.5 rounded transition-all group"
              onClick={() => setActiveTooltip('xgeff')}
              title="点击查看xG效率算法"
            >
              <span className="flex items-center gap-1 text-slate-400 truncate">
                xG效率分 <Info className="w-2.5 h-2.5 text-indigo-400 opacity-40 group-hover:opacity-100 shrink-0" />
              </span>
              <span className="text-slate-200">{dimensions[4].originalAway}%</span>
            </div>
          </div>
        </div>
      </div>

      {/* Tooltip Overlay Popup Box */}
      {activeTooltip && (
        <div className="absolute inset-x-3 inset-y-3 bg-[#0A0D1ACC]/95 backdrop-blur-md p-4 z-20 flex flex-col justify-between border border-indigo-500/30 rounded-2xl animate-fade-in transition-all">
          <div>
            <div className="flex justify-between items-start mb-2.5 border-b border-slate-800 pb-1.5 animate-in slide-in-from-top-1 duration-200">
              <div>
                <h4 className="text-[9px] font-bold text-indigo-400 tracking-wider font-mono uppercase">
                  DIMENSION MATHS // 核心维度算力解析
                </h4>
                <h3 className="text-xs font-bold text-slate-100 mt-0.5 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 bg-indigo-500 rounded-full animate-ping shrink-0" />
                  {DIMENSION_INFOS[activeTooltip].title}
                </h3>
              </div>
              <button
                onClick={() => setActiveTooltip(null)}
                className="p-1 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
                title="关闭说明"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="bg-slate-950 p-2 rounded-xl border border-slate-900 mb-2.5 text-center">
              <span className="block text-[9px] text-slate-500 font-mono mb-1">物理概率回归公式 (Mathematical Equation)</span>
              <code className="text-[10px] font-mono font-bold text-emerald-400 bg-emerald-500/5 px-2 py-1 rounded tracking-wide select-all block break-words">
                {DIMENSION_INFOS[activeTooltip].formula}
              </code>
            </div>

            <div className="space-y-2 text-[11px] text-slate-300">
              <p className="leading-relaxed">
                <span className="text-slate-100 font-semibold">ℹ️ 指标定义：</span>
                {DIMENSION_INFOS[activeTooltip].description}
              </p>
              <p className="leading-relaxed bg-slate-900/40 p-2 rounded-lg border border-slate-850/60 text-slate-400">
                <span className="text-indigo-300 font-semibold">📈 逻辑应用：</span>
                {DIMENSION_INFOS[activeTooltip].mathExplanation}
              </p>
            </div>
          </div>

          <div className="pt-1.5 border-t border-slate-800/40 flex justify-between items-center text-[9px] text-slate-500 font-mono">
            <span>Quant Engine v2.6 // Poisson Core</span>
            <button
              onClick={() => setActiveTooltip(null)}
              className="text-[10px] font-semibold text-indigo-400 hover:text-indigo-300 underline cursor-pointer"
            >
              返回对比图表
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
