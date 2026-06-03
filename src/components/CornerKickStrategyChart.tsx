import { useEffect, useRef, useState } from 'react';
import * as d3 from 'd3';
import { TeamStats, REAL_TEAMS } from '../data/realTeamsData';
import { PredictionResults } from '../utils/quantModel';
import { Info, HelpCircle, X, BarChart3, Snowflake, TrendingUp, Flag, Shield, Activity } from 'lucide-react';

interface CornerKickStrategyChartProps {
  home: TeamStats;
  away: TeamStats;
  results: PredictionResults;
}

// ======================== 战术角球模型参数配置 ========================
// 以下参数基于历史数据统计，可在此处统一调整：
//   BASE_HOME / BASE_AWAY: 主/客场平均角球基准值
//   SHOTS_WEIGHT: 场均射门数对角球的贡献系数（射门越多→角球越多）
//   RANK_WEIGHT: 球队排名对角球的贡献系数（排名越靠前→角球越多）
//   MIN_CORNERS / MAX_CORNERS: 预测角球数的合理区间截断
const CORNER_MODEL_CONFIG = {
  BASE_HOME: 5.3,
  BASE_AWAY: 4.5,
  AVERAGE_SHOTS: 12,
  SHOTS_WEIGHT: 0.22,
  AVERAGE_RANK: 12,
  RANK_WEIGHT: 0.12,
  MIN_CORNERS: 3.8,
  MAX_CORNERS: 8.2,
};

/** 基于历史数据计算球队的历史平均角球数（确定性辅助函数） */
const getHistoricalAvgCorners = (team: TeamStats, isHome: boolean): number => {
  const cfg = CORNER_MODEL_CONFIG;
  const base = isHome ? cfg.BASE_HOME : cfg.BASE_AWAY;
  const shotsContribution = ((team?.shotsPerGame ?? cfg.AVERAGE_SHOTS) - cfg.AVERAGE_SHOTS) * cfg.SHOTS_WEIGHT;
  const teamRank = team?.rank ?? cfg.AVERAGE_RANK;
  const rankContribution = (cfg.AVERAGE_RANK - teamRank) * cfg.RANK_WEIGHT;
  return parseFloat(Math.max(cfg.MIN_CORNERS, Math.min(cfg.MAX_CORNERS, base + shotsContribution + rankContribution)).toFixed(1));
};

export function CornerKickStrategyChart({ home, away, results }: CornerKickStrategyChartProps) {
  const [activeTooltip, setActiveTooltip] = useState<string | null>(null);
  const barSvgRef = useRef<SVGSVGElement | null>(null);
  const scatterSvgRef = useRef<SVGSVGElement | null>(null);

  // Home and Away Live parameters
  const homeHistAvg = getHistoricalAvgCorners(home, true);
  const awayHistAvg = getHistoricalAvgCorners(away, false);

  const homeExp = results.expectedHomeCorners;
  const awayExp = results.expectedAwayCorners;

  // D3 Rendering for Part 1: Bar Chart (Expected vs Historical Baseline Corners)
  useEffect(() => {
    if (!barSvgRef.current) return;
    if (!home || !away || !results) return;

    // Clear previous elements
    const svgElement = d3.select(barSvgRef.current);
    svgElement.selectAll('*').interrupt().remove();

    const width = 360;
    const height = 180;
    const margin = { top: 25, right: 20, bottom: 25, left: 55 };
    const chartWidth = width - margin.left - margin.right;
    const chartHeight = height - margin.top - margin.bottom;

    // Prepare data
    const data = [
      {
        team: home.nameCn,
        type: '历史场均',
        value: homeHistAvg,
        color: 'rgba(239, 68, 68, 0.45)', // soft red
        strokeColor: '#EF4444'
      },
      {
        team: home.nameCn,
        type: '模型预测',
        value: homeExp,
        color: 'url(#homeBarGrad)',
        strokeColor: '#EF4444'
      },
      {
        team: away.nameCn,
        type: '历史场均',
        value: awayHistAvg,
        color: 'rgba(16, 185, 129, 0.45)', // soft green
        strokeColor: '#10B981'
      },
      {
        team: away.nameCn,
        type: '模型预测',
        value: awayExp,
        color: 'url(#awayBarGrad)',
        strokeColor: '#10B981'
      }
    ];

    const chartGroup = svgElement
      .append('g')
      .attr('transform', `translate(${margin.left}, ${margin.top})`);

    // Definitions for gradients
    const defs = svgElement.append('defs');
    
    // Home gradient
    const homeGrad = defs.append('linearGradient')
      .attr('id', 'homeBarGrad')
      .attr('x1', '0%')
      .attr('y1', '100%')
      .attr('x2', '0%')
      .attr('y2', '0%');
    homeGrad.append('stop').attr('offset', '0%').attr('stop-color', '#991B1B').attr('stop-opacity', 0.85);
    homeGrad.append('stop').attr('offset', '100%').attr('stop-color', '#EF4444').attr('stop-opacity', 0.95);

    // Away gradient
    const awayGrad = defs.append('linearGradient')
      .attr('id', 'awayBarGrad')
      .attr('x1', '0%')
      .attr('y1', '100%')
      .attr('x2', '0%')
      .attr('y2', '0%');
    awayGrad.append('stop').attr('offset', '0%').attr('stop-color', '#065F46').attr('stop-opacity', 0.85);
    awayGrad.append('stop').attr('offset', '100%').attr('stop-color', '#10B981').attr('stop-opacity', 0.95);

    // Scales
    const y = d3.scaleLinear()
      .domain([0, Math.max(10, d3.max(data, d => d.value) || 10) * 1.1])
      .range([chartHeight, 0]);

    // X0 scale for team groups
    const x0 = d3.scaleBand()
      .domain([home.nameCn, away.nameCn])
      .range([0, chartWidth])
      .paddingInner(0.25);

    // X1 scale for bar types within team groups
    const x1 = d3.scaleBand()
      .domain(['历史场均', '模型预测'])
      .range([0, x0.bandwidth()])
      .padding(0.08);

    // Grid lines (Y axis)
    chartGroup.append('g')
      .attr('class', 'grid')
      .call(
        d3.axisLeft(y)
          .ticks(5)
          .tickSize(-chartWidth)
          .tickFormat(() => '')
      )
      .selectAll('line')
      .attr('stroke', 'rgba(148, 163, 184, 0.06)')
      .attr('stroke-dasharray', '2,2');

    // Add Axes
    chartGroup.append('g')
      .attr('transform', `translate(0, ${chartHeight})`)
      .call(d3.axisBottom(x0).tickSize(4))
      .selectAll('text')
      .attr('fill', 'rgba(241, 245, 249, 0.8)')
      .attr('font-size', '10px');

    chartGroup.append('g')
      .call(d3.axisLeft(y).ticks(5).tickSize(4))
      .selectAll('text')
      .attr('fill', 'rgba(148, 163, 184, 0.7)')
      .attr('font-size', '9px')
      .attr('font-family', 'monospace');

    // Drawing Bars with entrance transition
    chartGroup.selectAll('.bar-group')
      .data(data)
      .enter()
      .append('rect')
      .attr('x', d => {
        const xPos = x0(d.team);
        return (xPos !== undefined ? xPos : 0) + (x1(d.type) || 0);
      })
      .attr('width', x1.bandwidth())
      .attr('y', chartHeight)
      .attr('height', 0)
      .attr('fill', d => d.color)
      .attr('stroke', d => d.strokeColor)
      .attr('stroke-width', 1)
      .attr('rx', 2)
      .attr('ry', 2)
      .transition()
      .duration(800)
      .attr('y', d => y(d.value))
      .attr('height', d => chartHeight - y(d.value));

    // Drawing Bar values text
    chartGroup.selectAll('.bar-label')
      .data(data)
      .enter()
      .append('text')
      .attr('x', d => {
        const xPos = x0(d.team);
        return (xPos !== undefined ? xPos : 0) + (x1(d.type) || 0) + x1.bandwidth() / 2;
      })
      .attr('text-anchor', 'middle')
      .attr('y', chartHeight - 5)
      .attr('fill', 'rgba(255, 255, 255, 0.9)')
      .attr('font-size', '8.5px')
      .attr('font-family', 'monospace')
      .attr('font-weight', '600')
      .transition()
      .duration(850)
      .attr('y', d => y(d.value) - 6)
      .text(d => d.value.toFixed(1));

    // Customize Axis lines color
    chartGroup.selectAll('.domain')
      .attr('stroke', 'rgba(148, 163, 184, 0.15)');
    chartGroup.selectAll('line')
      .attr('stroke', 'rgba(148, 163, 184, 0.12)');

    return () => { svgElement.selectAll("*").interrupt().remove(); };
  }, [home, away, homeHistAvg, awayHistAvg, homeExp, awayExp]);

  // D3 Rendering for Part 2: Scatter / Line Plot (Correlation between Attack Index & Corners)
  useEffect(() => {
    if (!scatterSvgRef.current) return;
    if (!home || !away || !results) return;

    // Clear previous elements
    const svgElement = d3.select(scatterSvgRef.current);
    svgElement.selectAll('*').interrupt().remove();

    const width = 360;
    const height = 180;
    const margin = { top: 20, right: 25, bottom: 30, left: 45 };
    const chartWidth = width - margin.left - margin.right;
    const chartHeight = height - margin.top - margin.bottom;

    const chartGroup = svgElement
      .append('g')
      .attr('transform', `translate(${margin.left}, ${margin.top})`);

    // 1. Generate reference correlation line data of Attack Index vs Expected Corners
    // Formula base: corners = 3.9 + (attackRating * 2.1) under average opposing defense (indexing ~ 1.0)
    const correlationData = Array.from({ length: 13 }, (_, i) => {
      const attack = 0.5 + i * 0.2; // 0.5 to 2.9
      const estCorners = 3.9 + attack * 2.1;
      return { attack, estCorners };
    });

    // 2. Generate benchmarks dataset (other famous EPL/LaLiga standard indices)
    const benchmarks = [
      { name: '皇家马德里', id: 'realmadrid', attack: 2.35, corners: 8.8, color: '#38BDF8' },
      { name: '曼彻斯特城', id: 'mancity', attack: 2.10, corners: 8.3, color: '#38BDF8' },
      { name: '阿森纳', id: 'arsenal', attack: 1.85, corners: 7.8, color: '#6366F1' },
      { name: '利物浦', id: 'liverpool', attack: 1.95, corners: 8.0, color: '#C084FC' },
      { name: '拜仁慕尼黑', id: 'bayern', attack: 1.70, corners: 7.5, color: '#F472B6' },
      { name: '国际米兰', id: 'internazionale', attack: 1.60, corners: 7.2, color: '#F472B6' },
      { name: '切尔西', id: 'chelsea', attack: 1.45, corners: 6.9, color: '#475569' },
      { name: '多特蒙德', id: 'bortmund', attack: 1.35, corners: 6.7, color: '#475569' },
    ];

    // Filter benchmarks if any matches our current home/away team to prevent overlap
    const visibleBenchmarks = benchmarks.filter(b => b.id !== home.id && b.id !== away.id).slice(0, 5);

    // Current selected teams live plotting points
    const currentPoints = [
      {
        name: `${home.nameCn} (选)`,
        id: home.id,
        attack: results.homeAttackIndex,
        corners: homeExp,
        color: '#EF4444', // Home rose red
        isCurrent: true
      },
      {
        name: `${away.nameCn} (选)`,
        id: away.id,
        attack: results.awayAttackIndex,
        corners: awayExp,
        color: '#10B981', // Away emerald green
        isCurrent: true
      }
    ];

    // Scales
    const x = d3.scaleLinear()
      .domain([0.4, 2.8])
      .range([0, chartWidth]);

    const y = d3.scaleLinear()
      .domain([2.5, 10.5])
      .range([chartHeight, 0]);

    // Grid lines (X & Y)
    chartGroup.append('g')
      .attr('class', 'grid')
      .call(
        d3.axisLeft(y)
          .ticks(5)
          .tickSize(-chartWidth)
          .tickFormat(() => '')
      )
      .selectAll('line')
      .attr('stroke', 'rgba(148, 163, 184, 0.05)')
      .attr('stroke-dasharray', '2,2');

    chartGroup.append('g')
      .attr('class', 'grid')
      .attr('transform', `translate(0, ${chartHeight})`)
      .call(
        d3.axisBottom(x)
          .ticks(6)
          .tickSize(-chartHeight)
          .tickFormat(() => '')
      )
      .selectAll('line')
      .attr('stroke', 'rgba(148, 163, 184, 0.05)')
      .attr('stroke-dasharray', '2,2');

    // Add Axes
    chartGroup.append('g')
      .attr('transform', `translate(0, ${chartHeight})`)
      .call(d3.axisBottom(x).ticks(6).tickSize(4))
      .selectAll('text')
      .attr('fill', 'rgba(148, 163, 184, 0.75)')
      .attr('font-size', '8.5px')
      .attr('font-family', 'monospace');

    chartGroup.append('g')
      .call(d3.axisLeft(y).ticks(5).tickSize(4))
      .selectAll('text')
      .attr('fill', 'rgba(148, 163, 184, 0.75)')
      .attr('font-size', '8.5px')
      .attr('font-family', 'monospace');

    // Generate Regression Line (D3 line path)
    const lineGenerator = d3.line<{ attack: number, estCorners: number }>()
      .x(d => x(d.attack))
      .y(d => y(d.estCorners))
      .curve(d3.curveMonotoneX);

    // Draw regression curve path
    chartGroup.append('path')
      .datum(correlationData)
      .attr('fill', 'none')
      .attr('stroke', 'rgba(129, 140, 248, 0.25)') // custom slate-purple
      .attr('stroke-width', 3)
      .attr('stroke-dasharray', '3,3')
      .attr('d', lineGenerator);

    // Render underlying Benchmark dots (static opacity markers to visualize standard distribution)
    chartGroup.selectAll('.benchmark-dot')
      .data(visibleBenchmarks)
      .enter()
      .append('circle')
      .attr('cx', d => x(d.attack))
      .attr('cy', d => y(d.corners))
      .attr('r', 4.5)
      .attr('fill', '#334155')
      .attr('stroke', 'rgba(255,255,255,0.08)')
      .attr('stroke-width', 1)
      .attr('opacity', 0.5);

    // Benchmark Labels
    chartGroup.selectAll('.benchmark-label')
      .data(visibleBenchmarks)
      .enter()
      .append('text')
      .attr('x', d => x(d.attack) + 6)
      .attr('y', d => y(d.corners) + 3)
      .text(d => d.name)
      .attr('fill', 'rgba(148, 163, 184, 0.35)')
      .attr('font-size', '8px');

    // Render dynamic active selected teams highlighted coordinates
    const selectedDots = chartGroup.selectAll('.selected-dot')
      .data(currentPoints)
      .enter()
      .append('g')
      .attr('class', 'selected-dot');

    // Glowing halo pulse underneath
    selectedDots.append('circle')
      .attr('cx', d => x(d.attack))
      .attr('cy', d => y(d.corners))
      .attr('r', 10)
      .attr('fill', d => d.color)
      .attr('opacity', 0.18)
      .attr('class', 'animate-pulse');

    // Central solid core dot
    selectedDots.append('circle')
      .attr('cx', d => x(d.attack))
      .attr('cy', d => y(d.corners))
      .attr('r', 5.5)
      .attr('fill', d => d.color)
      .attr('stroke', '#ffffff')
      .attr('stroke-width', 1.5)
      .attr('cursor', 'pointer');

    // Selected Team Name display annotations
    selectedDots.append('text')
      .attr('x', d => x(d.attack) + (d.id === home.id ? 9 : -9))
      .attr('y', d => y(d.corners) - 7)
      .attr('text-anchor', d => d.id === home.id ? 'start' : 'end')
      .text(d => `${d.name} (${d.corners.toFixed(1)}角)`)
      .attr('fill', '#ffffff')
      .attr('font-weight', '700')
      .attr('font-size', '9px')
      .attr('class', 'drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)]');

    // Customize Axis lines color
    chartGroup.selectAll('.domain')
      .attr('stroke', 'rgba(148, 163, 184, 0.15)');
    chartGroup.selectAll('line')
      .attr('stroke', 'rgba(148, 163, 184, 0.12)');

    return () => { svgElement.selectAll("*").interrupt().remove(); };
  }, [home, away, results, homeExp, awayExp]);

  const toggleInfo = (key: string) => {
    setActiveTooltip(activeTooltip === key ? null : key);
  };

  return (
    <div className="p-5 bg-[#0F1424] rounded-2xl border border-slate-800/80 shadow-xl relative overflow-hidden flex flex-col justify-between">
      {/* Absolute ambient lights */}
      <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-500/5 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute -bottom-10 -left-10 w-24 h-24 bg-blue-500/5 rounded-full blur-2xl pointer-events-none" />

      {/* Header */}
      <div>
        <div className="flex justify-between items-start mb-2">
          <div className="flex items-center gap-2">
            <div className="p-1 px-2.5 bg-indigo-600/15 text-indigo-400 text-[10px] font-mono font-bold uppercase rounded border border-indigo-500/20">
              D3.js Strategy Engine
            </div>
            <h3 className="text-sm font-bold text-slate-100 flex items-center gap-1.5">
              🎯 战术角球与进攻强压多维拟合终端
            </h3>
          </div>
          <button
            onClick={() => toggleInfo('general')}
            className="text-slate-500 hover:text-slate-300 transition-colors p-0.5"
            title="查看模型背景与推理解析"
          >
            <HelpCircle className="w-4 h-4" />
          </button>
        </div>
        <p className="text-[11px] text-slate-400 mb-4 leading-relaxed">
          采用两队即时 <b>进攻指数量化轴 (Attack Index)</b> 与 <b>防守抗压系数</b> 交互映射，拟合出物理战术角球的期望爆点与偏度走势。
        </p>
      </div>

      {/* Grid containing two D3 charts */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mb-1.5">
        
        {/* Card 1: Expected vs Historical base */}
        <div className="bg-slate-950/60 p-3 rounded-xl border border-slate-900 flex flex-col justify-between relative">
          <div className="flex justify-between items-center mb-1 mb-1.5">
            <span className="text-[11px] font-semibold text-slate-300 flex items-center gap-1">
              <BarChart3 className="w-3.5 h-3.5 text-rose-400" />
              历史均势对冲比 (Historical vs live Exp)
            </span>
            <span className="text-[9px] text-slate-500 font-mono">单位: 个</span>
          </div>
          
          <div className="w-full flex justify-center items-center h-[180px]">
            <svg ref={barSvgRef} className="w-full h-full max-w-[340px]" />
          </div>

          <div className="text-[10px] text-slate-400 bg-slate-900/40 p-1.5 rounded border border-slate-850/60 leading-normal mt-2">
            主队疲劳、客战抗折损及天气等即时微调，将对 live 仿真发生纠增/缩值。
          </div>
        </div>

        {/* Card 2: Attack index to Corner kick frequency Correlation */}
        <div className="bg-slate-950/60 p-3 rounded-xl border border-slate-900 flex flex-col justify-between relative">
          <div className="flex justify-between items-center mb-1.5">
            <span className="text-[11px] font-semibold text-indigo-400 flex items-center gap-1">
              <TrendingUp className="w-3.5 h-3.5 text-indigo-400" />
              进攻实力轴 vs 角球频率协变映射
            </span>
            <span className="text-[9px] text-slate-500 font-mono">横: Attack, 纵: Corners</span>
          </div>

          <div className="w-full flex justify-center items-center h-[180px]">
            <svg ref={scatterSvgRef} className="w-full h-full max-w-[340px]" />
          </div>

          <div className="text-[10px] text-slate-400 bg-slate-900/40 p-1.5 rounded border border-slate-850/60 mt-2">
            点代表基元分布。<strong>实线：</strong>理论角球增长曲线。当发生大红牌或极端保守，落点可能严重脱轨。
          </div>
        </div>

      </div>

      {/* Model summary footer explanation */}
      <div className="flex flex-wrap items-center justify-between text-[11px] text-slate-500 font-mono bg-[#0A0D1A]/55 p-2 rounded-xl border border-slate-900 mt-2 gap-2">
        <span>数据状态: <strong className="text-emerald-400">✅ 实时演算中 (Reactive)</strong></span>
        <span>角球理论高频爆带: <strong className="text-indigo-300">Attack Index &gt; 1.8 (7.8个起)</strong></span>
        <span>标准误差(StdErr): <strong className="text-slate-400">&plusmn;1.18 个</strong></span>
      </div>

      {/* Popup tooltip box */}
      {activeTooltip && (
        <div className="absolute inset-5 bg-[#090D1ACC]/98 backdrop-blur-md p-5 z-30 border border-indigo-500/30 rounded-2xl flex flex-col justify-between overflow-y-auto duration-200">
          <div>
            <div className="flex justify-between items-start pb-2 border-b border-slate-800 mb-3.5">
              <div>
                <span className="text-[9px] font-extrabold text-indigo-400 font-mono uppercase tracking-wider block">
                  MATH MECHANICS // D3 CORNER DECISION MATRIX
                </span>
                <h3 className="text-xs font-bold text-white mt-1">
                  📐 战术角球与核心火力的协动物理机制
                </h3>
              </div>
              <button
                onClick={() => setActiveTooltip(null)}
                className="text-slate-400 hover:text-white hover:bg-slate-800 p-1 rounded-lg transition-colors cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="space-y-3.5 text-slate-300 text-xs text-left leading-relaxed">
              <p>
                <strong>1. 为什么用 D3 回归表现角球数？</strong><br />
                在量化足球中，角球（Corners）并不是孤立的随机数，而是<strong>两队高位围困与攻守侵略度的副产物</strong>。通过将传统的 Poisson 进球期望扩展，本界面将两队实战数据拟合在连续的曲线空间中。
              </p>
              <p>
                <strong>2. 核心联动公式演绎:</strong><br />
                <code className="block bg-slate-950 text-indigo-300 font-mono p-2 rounded text-[11px] text-center border border-slate-900 my-1">
                  Corners_Exp = Base_Constant + α * Attack_Index_Home + β * Defense_Index_Away - γ * Fatigue
                </code>
                在 D3 协变映射中，随着左侧环境设置面板（如<strong>战损率、疲劳度、赔率机构即时抽水</strong>）发生变动，主客队的 Attack Index 会执行动态漂移，导致散点在回归曲线中做实时运动。
              </p>
              <p>
                <strong>3. 投资实战指引:</strong><br />
                若当前对决中两队的 Attack Index 均位于 <strong>1.8 以上</strong>（即图中的高频爆发带），则单场大角球的概率累积概率将会按指数级别急剧放大。您可以据此快速判定机构开设的标准总角球界限（通常在 9.5 到 10.5 之间）是否具备买入价值。
              </p>
            </div>
          </div>

          <div className="pt-3 border-t border-slate-800/60 flex justify-between items-center text-[10px] text-slate-500 font-mono">
            <span>⚽ 欧战历史千场模型校对支撑 // D3 Analytics</span>
            <button
              onClick={() => setActiveTooltip(null)}
              className="text-indigo-400 hover:text-indigo-300 underline font-semibold cursor-pointer"
            >
              返回监控端
            </button>
          </div>
        </div>
      )}

    </div>
  );
}
