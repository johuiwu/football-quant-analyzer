import { calculateBaseOdds } from './oddsCalculator';

export interface MatchHistory {
  homeTeam: string;
  awayTeam: string;
  homeElo: number;
  awayElo: number;
  homeXG: number;
  awayXG: number;
  injuryHome: number;
  injuryAway: number;
  realHomeOdds: number;
  realDrawOdds: number;
  realAwayOdds: number;
  finalScoreHome: number;
  finalScoreAway: number;
}

export interface MatchBacktestEntry {
  match: string;
  finalScoreHome: number;
  finalScoreAway: number;
  modelOdds: { homeOdds: number; drawOdds: number; awayOdds: number };
  marketOdds: { homeOdds: number; drawOdds: number; awayOdds: number };
  deviation: {
    home: number;
    draw: number;
    away: number;
    maxDeviation: number;
  };
  modelDirection: 'HOME_WIN' | 'DRAW' | 'AWAY_WIN';
  actualDirection: 'HOME_WIN' | 'DRAW' | 'AWAY_WIN';
  directionCorrect: boolean;
  isHighRisk: boolean;
}

export interface BacktestReport {
  passRate: number;
  totalGames: number;
  correctCount: number;
  highRiskGames: string[];
  entries: MatchBacktestEntry[];
  warnings: string[];
}

function determineDirection(
  finalScoreHome: number,
  finalScoreAway: number
): 'HOME_WIN' | 'DRAW' | 'AWAY_WIN' {
  if (finalScoreHome > finalScoreAway) return 'HOME_WIN';
  if (finalScoreHome < finalScoreAway) return 'AWAY_WIN';
  return 'DRAW';
}

function determineModelDirection(
  homeOdds: number,
  drawOdds: number,
  awayOdds: number
): 'HOME_WIN' | 'DRAW' | 'AWAY_WIN' {
  const homeProb = 1 / homeOdds;
  const drawProb = 1 / drawOdds;
  const awayProb = 1 / awayOdds;

  if (homeProb >= drawProb && homeProb >= awayProb) return 'HOME_WIN';
  if (drawProb >= homeProb && drawProb >= awayProb) return 'DRAW';
  return 'AWAY_WIN';
}

function computeDeviation(model: number, market: number): number {
  return Math.abs(model - market) / market;
}

const DEVIATION_THRESHOLD = 0.20;
const PASS_RATE_WARNING = 0.60;

export function runBacktest(matches: MatchHistory[]): BacktestReport {
  const entries: MatchBacktestEntry[] = matches.map((m) => {
    const modelOdds = calculateBaseOdds(
      m.homeElo,
      m.awayElo,
      m.homeXG,
      m.awayXG,
      m.injuryHome,
      m.injuryAway
    );

    const deviation = {
      home: computeDeviation(modelOdds.homeOdds, m.realHomeOdds),
      draw: computeDeviation(modelOdds.drawOdds, m.realDrawOdds),
      away: computeDeviation(modelOdds.awayOdds, m.realAwayOdds),
      maxDeviation: 0,
    };
    deviation.maxDeviation = Math.max(deviation.home, deviation.draw, deviation.away);

    const modelDirection = determineModelDirection(
      modelOdds.homeOdds,
      modelOdds.drawOdds,
      modelOdds.awayOdds
    );
    const actualDirection = determineDirection(m.finalScoreHome, m.finalScoreAway);
    const directionCorrect = modelDirection === actualDirection;
    const isHighRisk = deviation.maxDeviation > DEVIATION_THRESHOLD;

    return {
      match: `${m.homeTeam} vs ${m.awayTeam}`,
      finalScoreHome: m.finalScoreHome,
      finalScoreAway: m.finalScoreAway,
      modelOdds,
      marketOdds: {
        homeOdds: m.realHomeOdds,
        drawOdds: m.realDrawOdds,
        awayOdds: m.realAwayOdds,
      },
      deviation,
      modelDirection,
      actualDirection,
      directionCorrect,
      isHighRisk,
    };
  });

  const correctCount = entries.filter((e) => e.directionCorrect).length;
  const passRate = entries.length > 0 ? correctCount / entries.length : 0;
  const highRiskGames = entries
    .filter((e) => e.isHighRisk)
    .map((e) => e.match);

  const warnings: string[] = [];

  if (passRate < PASS_RATE_WARNING) {
    warnings.push(
      `核心模型参数存在明显偏差，建议降低 Elo 权重或调整 xG 线性系数。`
    );
  }

  if (highRiskGames.length > 0) {
    warnings.push(
      `存在 ${highRiskGames.length} 场模型与市场偏差 > 20% 的比赛，建议核查数据源。`
    );
  }

  return {
    passRate: Math.round(passRate * 100) / 100,
    totalGames: entries.length,
    correctCount,
    highRiskGames,
    entries,
    warnings,
  };
}

export function formatBacktestReport(report: BacktestReport): string {
  const lines: string[] = [];

  lines.push('='.repeat(60));
  lines.push('  足球竞彩量化模型回测报告');
  lines.push('='.repeat(60));
  lines.push('');
  lines.push(`总场次: ${report.totalGames}`);
  lines.push(`方向正确: ${report.correctCount}`);
  lines.push(`准确率: ${(report.passRate * 100).toFixed(1)}%`);
  lines.push('');

  if (report.warnings.length > 0) {
    lines.push('⚠️ 警告:');
    report.warnings.forEach((w) => lines.push(`  ${w}`));
    lines.push('');
  }

  lines.push('-'.repeat(60));
  lines.push('逐场明细:');
  lines.push('');

  report.entries.forEach((e, i) => {
    lines.push(`[${i + 1}] ${e.match}`);
    lines.push(`  实际比分: ${e.finalScoreHome}:${e.finalScoreAway}`);
    lines.push(`  模型方向: ${e.modelDirection}  |  实际方向: ${e.actualDirection}  |  ${e.directionCorrect ? '✅ 正确' : '❌ 错误'}`);
    lines.push(`  模型赔率: ${e.modelOdds.homeOdds} / ${e.modelOdds.drawOdds} / ${e.modelOdds.awayOdds}`);
    lines.push(`  市场赔率: ${e.marketOdds.homeOdds} / ${e.marketOdds.drawOdds} / ${e.marketOdds.awayOdds}`);
    lines.push(`  最大偏差: ${(e.deviation.maxDeviation * 100).toFixed(1)}%  ${e.isHighRisk ? '⚠️ 高风险' : '✓ 正常'}`);
    lines.push('');
  });

  lines.push('='.repeat(60));

  return lines.join('\n');
}