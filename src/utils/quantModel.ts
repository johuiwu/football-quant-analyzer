import { TeamStats, REAL_H2H_RECORDS, LEAGUE_AVGS } from '../data/realTeamsData';

import { LRUCache } from 'lru-cache';
import { calculateBaseOdds } from './oddsCalculator';
import { poisson, dixonColesAdjustment } from '../models/poisson';
import { getTeamElo } from '../models/elo';
import { exactAsianTo1X2, exact1X2ToAsian } from '../models/odds';
import { calculateLeagueTimeDecay } from '../models/bayesian';
import { getLeagueRho, getLeagueAvgGoals, getLeagueHomeAdv } from '../config/leagueParams';
import { evaluateUpsetAlert } from '../models/heatIndex';

// P3-16: LRU cache
const mc = new LRUCache({ max: 100 });






// Kelly Capital Allocation Criterion

export function calculateKellyFraction(prob: number, decimalOdds: number): number {

  if (decimalOdds <= 1.0 || prob <= 0) return 0;

  const b = decimalOdds - 1.0; // Payout multiplier

  const q = 1.0 - prob;        // Loss prob

  const f = (prob * b - q) / b;

  // Apply professional half-Kelly to control drawdowns

  const halfKelly = f * 0.5;

  return Math.max(0, parseFloat((halfKelly * 100).toFixed(2)));

}



// ===== v3.0 扩展特征工程接口 =====



export interface ExtendedTeamFeatures {

  goalsScoredRate: number;

  concededRate: number;

  shotsOnTargetRate: number;

  possessionValue: number;

  duelWonRatio: number;

  fastBreakEfficiency: number;

  keyPassesRate: number;

  crossSuccessRate: number;

  dribbleSuccessRate: number;

  longBallSuccessRate: number;

  avgGoalsPerMatch: number;

  foulsPerMatch: number;

  attackMomentum: number;

  defensiveStability: number;

  transitionSpeed: number;

}



export function extractExtendedFeatures(t: TeamStats, league?: string): ExtendedTeamFeatures {

  const mp = t.homeStats.played + t.awayStats.played;



  // v3.2: 安全访问扩展字段 (来自爬虫/API, 可能�?undefined)

  // 所有缺失值使用联赛中性默认�? 不影响模型主预测

  const g = t.goals; const c = t.conceded; const sot = t.shotsOnTarget;

  const pos = t.possession; const dw = t.duelsWon; const pl = t.possessionLost;

  const fb = t.fastBreaks; const fbg = t.fastBreakGoals; const kp = t.keyPasses;

  const cr = t.crosses; const scr = t.successfulCrosses; const dr = t.dribbles;

  const sdr = t.successfulDribbles; const lb = t.longBalls; const slb = t.successfulLongBalls;

  const ag = t.avgGoals; const fl = t.fouls;



  // 缺失�?�?中性默认�?(不偏向主队或客队)

  const LEAGUE_EXT_DEFAULTS: Record<string, number> = {
    Eliteserien: 9.0, Allsvenskan: 8.5, Veikkausliiga: 8.0,
    EPL: 11.2, LaLiga: 9.8, Bundesliga: 10.5, SerieA: 9.2,
    Ligue1: 9.5, Eredivisie: 10.0, PrimeiraLiga: 9.0,
    SaudiPL: 8.5, CSL: 9.0, JLeague: 9.5, KLeague1: 8.8, KLeague2: 7.5,
    WorldCup: 10.0, DEFAULT: 9.0,
  };
  const leagueTotal = LEAGUE_EXT_DEFAULTS[league || 'DEFAULT'] || 9.0;

  const dRanked = { total: leagueTotal, rank: 0 };
  const dPos = { value: '50%', rank: 0 };



  const G = g ?? dRanked; const C = c ?? dRanked; const SOT = sot ?? dRanked;

  const Pos = pos ?? dPos; const DW = dw ?? dRanked; const PL = pl ?? dRanked;

  const FB = fb ?? dRanked; const FBG = fbg ?? dRanked; const KP = kp ?? dRanked;

  const CR = cr ?? dRanked; const SCR = scr ?? dRanked; const DR = dr ?? dRanked;

  const SDR = sdr ?? dRanked; const LB = lb ?? dRanked; const SLB = slb ?? dRanked;

  const AG = ag ?? dRanked; const FL = fl ?? dRanked;



  const goalsScoredRate = mp > 0 ? G.total / mp : 0;

  const concededRate = mp > 0 ? C.total / mp : 0;

  const shotsOnTargetRate = mp > 0 ? SOT.total / mp : 0;

  const possessionValue = parseFloat(Pos.value) || 50;

  const duelDenom = DW.total + PL.total * 0.6;

  const duelWonRatio = duelDenom > 0 ? DW.total / duelDenom : 0.5;

  const fastBreakEfficiency = FB.total > 0 ? FBG.total / Math.max(1, FB.total) : 0;

  const keyPassesRate = mp > 0 ? KP.total / mp : 0.001;

  const crossSuccessRate = CR.total > 0 ? SCR.total / CR.total : 0.25;

  const dribbleSuccessRate = DR.total > 0 ? SDR.total / DR.total : 0.4;

  const longBallSuccessRate = LB.total > 0 ? SLB.total / LB.total : 0.5;

  const avgGoalsPerMatch = mp > 0 ? parseFloat(String(AG.total)) : 1.3;

  const foulsPerMatch = mp > 0 ? FL.total / mp : 12;

  // 缺失数据时攻击动量等均为中性�? 不影响主模型

  const attackMomentum = (keyPassesRate * 2.5 + dribbleSuccessRate * 1.8 + fastBreakEfficiency * 3.0 + crossSuccessRate * 1.5) / 4;

  const defensiveStability = 1 - (concededRate / Math.max(0.1, goalsScoredRate + concededRate));

  const transitionSpeed = (FB.total / Math.max(1, mp)) * (fastBreakEfficiency + 0.1) * 10;



  return {

    goalsScoredRate, concededRate, shotsOnTargetRate, possessionValue,

    duelWonRatio, fastBreakEfficiency, keyPassesRate, crossSuccessRate,

    dribbleSuccessRate, longBallSuccessRate, avgGoalsPerMatch, foulsPerMatch,

    attackMomentum, defensiveStability, transitionSpeed,

  };

}



export interface ModelWeights {

  odds: number;       // e.g. 0.45

  strength: number;   // e.g. 0.30

  homeAway: number;   // e.g. 0.15

  h2h: number;        // e.g. 0.10

  form: number;       // e.g. 0.05

}



export interface AggregatedDecision {

  direction: 'HOME_WIN' | 'DRAW' | 'AWAY_WIN';

  confidence: number;

  totalGoalsRecommendation?: { direction: 'OVER' | 'UNDER'; confidence: number };

  kellySuggestion?: {
    homeKelly: number;
    awayKelly: number;
    suggestedBetSize: number;
  };

  coreIndicators: {

    poissonIndicator: { type: string; value: number; weight: number };

    eloIndicator: { type: string; value: number; weight: number };

    dixonColesIndicator: { type: string; value: number; weight: number };

  };

}



export interface PredictionResults {

  // 1. 得分�?失球�?(Scoring / Conceding Rates)

  homeScoringRate: number;

  homeConcedingRate: number;

  awayScoringRate: number;

  awayConcedingRate: number;



  // 2. 主客场胜�?(Home/Away Win Rates)

  homeWinRate: number;

  homeDrawRate: number;

  homeLossRate: number;

  awayWinRate: number;

  awayDrawRate: number;

  awayLossRate: number;



  // 3. 攻防实力指数 (Attack/Defense Ratings & Elo additions)

  homeAttackIndex: number;

  homeDefenseIndex: number;

  awayAttackIndex: number;

  awayDefenseIndex: number;

  homeStrength: number;

  awayStrength: number;

  homeElo: number;

  awayElo: number;

  eloHomeWinExpectancy: number;



  // 4. 赔率胜率转换 (Odds Implied Probabilities)

  oddsHomeProb: number;

  oddsDrawProb: number;

  oddsAwayProb: number;

  overround: number;



  // 5. 盘路与赔付率 (Handicap Payouts)

  payoutRate: number;

  impliedHandicap: string;



  // 6. 大小球预�?(Poisson & Dixon-Coles Joint Predictions)

  expectedHomeGoals: number;

  expectedAwayGoals: number;

  poissonTable: { goals: number; prob: number }[];

  overUnderProb: { line: number; over: number; under: number }[];

  // Dixon-Coles 低比分概

lowScoreProbability: {

    zeroZero: number;

    oneZero: number;

    zeroOne: number;

    oneOne: number;

    totalLowScore: number;

  };



  // 7. 交锋优势�?(H2H Advantage Rate)

  h2hHomeAdv: number;

  h2hAwayAdv: number;

  h2hPlayedCount: number;



  // 8. xG实力�?(Expected Goals margin)

  homeXgDiff: number;

  awayXgDiff: number;

  xgStrengthDiff: number;

  xptsDiff: number;
  ppdaDiff: number;
  npxgdDiff: number;



  // 9. 状态分计算 (Form Scores)

  homeFormScore: number;

  awayFormScore: number;



  // 10. 综合预测结果 (Comprehensive predictions)

  compHomeWin: number;

  compDraw: number;

  compAwayWin: number;



  // 11. 衍生市场预测 [新增角球、红黄牌、预期积分]

  expectedHomeCorners: number;

  expectedAwayCorners: number;

  homeXpts: number;

  awayXpts: number;

  homeRealPointsRate: number; // actual match points per game

  awayRealPointsRate: number;

  homePtsStatus: 'UNDERVALUED' | 'BALANCED' | 'OVERVALUED';

  awayPtsStatus: 'UNDERVALUED' | 'BALANCED' | 'OVERVALUED';



  // 12. 凯利公式资金比例 [新增]

  kellyHome: number;

  kellyDraw: number;

  kellyAway: number;



  // 13. 市场冷门检测指�?[新增赔率变动波动与资金流控]

  heatIndexHome: number;

  heatIndexAway: number;

  zScoreHome: number;

  zScoreAway: number;

  upsetLevel: string;

  oddsWaveFactor: number; // odds standard deviation rating

  heavyVolumeRisk: boolean;



  // 14. 双通道融合指标 [新增]

  fusedHomeProb: number;

  fusedDrawProb: number;      // 融合后平局概率

  fusedAwayProb: number;

  asianHomeProb: number;      // 亚盘通道主胜概率

  asianDrawProb: number;      // 亚盘通道平局概率

  asianAwayProb: number;      // 亚盘通道客胜概率

  marketDeviation: number;    // 欧赔与亚盘的偏离程度

  marketConfidence: 'high' | 'medium' | 'low'; // 市场信心等级

  marketDeviationWarning: string | null; // 市场背离警告



  // 15. 聚合决策中枢（新增）

  aggregatedDecision: AggregatedDecision;



  // Recommendations and warning logs

  recommendedDirection: string;

  recommendedReason: string;

  riskRating: 'LOW' | 'MEDIUM' | 'HIGH';

  coldUpsetAlert: boolean; // Cold alarm

  noPredictability?: boolean; // 极端市场无可预测性标记

  handicapCoverage: {

    covered: boolean;

    netGoals: number;

    requiredMargin: number;

    reason: string;

  };

}



// Environmental factors and advanced markets parameters interface

export interface AdvancedParams {

  homeFatigue: number;     // 0-10 (0: rested, 10: severely exhausted)

  awayFatigue: number;     // 0-10

  homeInjuries: number;    // 0-100% (key absences rate)

  awayInjuries: number;    // 0-100%

  homeWaterTrend: 'UP' | 'STABLE' | 'DOWN';

  awayWaterTrend: 'UP' | 'STABLE' | 'DOWN';

  homeBetVolume: number;   // 0-100% (money tracking)

  awayBetVolume: number;   // 0-100%

  drawBetVolume: number;   // 0-100%

}



// Core Prediction Calculation integrating Advanced Metrics & Dixon Coles/Elo

// 默认空球队数据
const createDefaultTeam = (): TeamStats => ({
  id: 'default',
  teamId: 0,
  nameCn: '未知球队',
  name: 'Unknown',
  league: 'default',
  leagueCn: '未知联赛',
  rank: 10,
  homeXg: 1.5,
  awayXg: 1.5,
  homeStats: { played: 10, wins: 4, draws: 3, losses: 3, goalsFor: 12, goalsAgainst: 10, xgFor: 11, xgAgainst: 10 },
  awayStats: { played: 10, wins: 4, draws: 3, losses: 3, goalsFor: 12, goalsAgainst: 10, xgFor: 11, xgAgainst: 10 },
  form: ['D', 'D', 'D', 'D', 'D'],
  cleanSheets: 3,
  shotsPerGame: 12,
  shotAccuracy: 40,
  formLast5: [50, 40, 35, 30, 25]
});



/**
 * 动态平局概率计算：基于实力差的指数衰减
 * 实力差越大，平局概率越低（0.15~0.35）
 */
function calculateDynamicDrawProb(homeStrength: number, awayStrength: number): number {
  const diff = Math.abs(homeStrength - awayStrength);
  const raw = 0.35 * Math.exp(-diff * 1.5);  // diff=0 → raw=0.35，使上限可达
  return Math.max(0.15, Math.min(0.35, raw));
}

// 双通道版本：同时处理欧赔和亚盘特征

export function calculateBetsModel(

  input: BetsModelInput

): PredictionResults;



// 向后兼容版本：保持原有接口

export function calculateBetsModel(

  homeTeamOrInput: TeamStats | BetsModelInput,

  awayTeam?: TeamStats,

  odds?: { home: number; draw: number; away: number },

  goalsLine: number = 2.5,

  customWeights?: ModelWeights,

  advancedInputs?: AdvancedParams

): PredictionResults {
  
  try {

  // 处理新旧两种调用方式

  let homeTeam: TeamStats = createDefaultTeam();

  let awayTeamVal: TeamStats = createDefaultTeam();

  let odds1X2: Odds1X2 = { home: 2.0, draw: 3.2, away: 3.5 };

  let asianFeatures: AsianHandicapFeatures = {

    handicapValue: 0,

    homeWater: 0.92,

    awayWater: 0.92,

    waterDiff: 0,

    isSharpMove: false,

    handicapAdjustRate: 0,

    homeWaterChange: 0,

    awayWaterChange: 0,

    marketPressure: 'NORMAL',

    bookmakerBias: 'NEUTRAL'

  };

  let finalGoalsLine: number = 2.5;

  let finalWeights: ModelWeights | undefined;

  let finalAdvancedParams: AdvancedParams | undefined;

  let finalFusionWeights: { oddsChannel: number; asianChannel: number } = { oddsChannel: 0.7, asianChannel: 0.3 };



  if ('homeTeam' in homeTeamOrInput) {

    // 新接口：BetsModelInput

    const input = homeTeamOrInput;

    const inputHomeTeam = input.homeTeam;

    const inputAwayTeam = input.awayTeam;

    

    // 完整的防御性检

if (!inputHomeTeam || !inputHomeTeam.rank || !inputHomeTeam.homeStats) {

      console.warn('[calculateBetsModel] Invalid homeTeam, using default');

      homeTeam = createDefaultTeam();

    } else {

      homeTeam = inputHomeTeam;

    }

    

    if (!inputAwayTeam || !inputAwayTeam.rank || !inputAwayTeam.awayStats) {

      console.warn('[calculateBetsModel] Invalid awayTeam, using default');

      awayTeamVal = createDefaultTeam();

    } else {

      awayTeamVal = inputAwayTeam;

    }

    

    // 防御性检查：确保 odds1X2 有默认

odds1X2 = input.odds1X2 ?? { home: 2.0, draw: 3.2, away: 3.5 };

    asianFeatures = input.asianFeatures;

    finalGoalsLine = input.goalsLine ?? 2.5;

    finalWeights = input.customWeights;

    finalAdvancedParams = input.advancedParams;

    finalFusionWeights = input.fusionWeights ?? { oddsChannel: 0.7, asianChannel: 0.3 };

  } else {

    // 旧接口：向后兼容

    const oldHomeTeam = homeTeamOrInput;

    const oldAwayTeam = awayTeam;

    

    if (!oldHomeTeam || !oldHomeTeam.rank || !oldHomeTeam.homeStats) {

      console.warn('[calculateBetsModel] Invalid homeTeam (old API), using default');

      homeTeam = createDefaultTeam();

    } else {

      homeTeam = oldHomeTeam;

    }

    

    if (!oldAwayTeam || !oldAwayTeam.rank || !oldAwayTeam.homeStats) {

      console.warn('[calculateBetsModel] Invalid awayTeam (old API), using default');

      awayTeamVal = createDefaultTeam();

    } else {

      awayTeamVal = oldAwayTeam;

    }

    // 防御性检查：确保 odds1X2 有默认

odds1X2 = odds ?? { home: 2.0, draw: 3.2, away: 3.5 };

    // 为旧接口生成默认亚盘特征

    asianFeatures = {

      handicapValue: 0,

      homeWater: 0.92,

      awayWater: 0.92,

      waterDiff: 0,

      isSharpMove: false,

      handicapAdjustRate: 0,

      homeWaterChange: 0,

      awayWaterChange: 0,

      marketPressure: 'NORMAL',

      bookmakerBias: 'NEUTRAL'

    };

    finalGoalsLine = goalsLine;

    finalWeights = customWeights;

    finalAdvancedParams = advancedInputs;

    finalFusionWeights = { oddsChannel: 0.7, asianChannel: 0.3 };

  }



  // 最终防御性检查：确保球队数据有效

  if (!homeTeam || !homeTeam.rank || !homeTeam.homeStats) {

    homeTeam = createDefaultTeam();

  }

  if (!awayTeamVal || !awayTeamVal.rank || !awayTeamVal.awayStats) {

    awayTeamVal = createDefaultTeam();

  }



  // P3-16: cache check (包含 Understat 字段确保数据更新后缓存失效)
  const ck = JSON.stringify({ hi: homeTeam.id, ai: awayTeamVal.id, o: odds1X2, af: asianFeatures, gl: finalGoalsLine, w: finalWeights, ap: finalAdvancedParams, fw: finalFusionWeights, hx: (homeTeam as any).seasonXpts || 0, ax: (awayTeamVal as any).seasonXpts || 0, hp: (homeTeam as any).seasonPpda || 0, ap2: (awayTeamVal as any).seasonPpda || 0, hn: (homeTeam as any).seasonNpxgd || 0, an: (awayTeamVal as any).seasonNpxgd || 0 });
  const ch = mc.get(ck);
  if (ch) return ch;

  // 联赛战术特征权重映射表 (xPTS, PPDA, NPxGD)
  const LEAGUE_TACTICAL_WEIGHTS: Record<string, { xpts: number; ppda: number; npxgd: number }> = {
    // 英超：球风硬朗，PPDA 压迫作用较大
    'EPL': { xpts: 0.02, ppda: 0.015, npxgd: 0.02 },
    '英超': { xpts: 0.02, ppda: 0.015, npxgd: 0.02 },

    // 西甲：技术流，传控与 xPTS 预期积分关联度高
    'LaLiga': { xpts: 0.03, ppda: 0.005, npxgd: 0.025 },
    '西甲': { xpts: 0.03, ppda: 0.005, npxgd: 0.025 },

    // 意甲：防守反击为主，非点球预期净胜球对结果影响大
    'SerieA': { xpts: 0.02, ppda: 0.01, npxgd: 0.03 },
    '意甲': { xpts: 0.02, ppda: 0.01, npxgd: 0.03 },

    // 德甲：大开大合，进攻效率权重较高
    'Bundesliga': { xpts: 0.015, ppda: 0.015, npxgd: 0.02 },
    '德甲': { xpts: 0.015, ppda: 0.015, npxgd: 0.02 },

    // 法甲/其他联赛：使用默认的基准配置
    'DEFAULT': { xpts: 0.02, ppda: 0.01, npxgd: 0.02 },
  };

  const baseWeights: ModelWeights = finalWeights || {
    odds: 0.30,
    strength: 0.30,
    homeAway: 0.15,
    h2h: 0.15,
    form: 0.10,
  };

  // 获取比赛类型和球队ID
  const competitionType = 'homeTeam' in homeTeamOrInput 
    ? (homeTeamOrInput as BetsModelInput).competitionType 
    : undefined;
  const homeTeamId = 'homeTeam' in homeTeamOrInput 
    ? (homeTeamOrInput as BetsModelInput).homeTeamId 
    : undefined;
  const awayTeamId = 'homeTeam' in homeTeamOrInput 
    ? (homeTeamOrInput as BetsModelInput).awayTeamId 
    : undefined;

  // 检查是否是德比
  const isDerby = homeTeamId && awayTeamId 
    ? checkIfDerby(homeTeamId, awayTeamId) 
    : false;

  const league = homeTeam.league === awayTeamVal.league ? homeTeam.league : 'DEFAULT';

  // 获取综合预测权重调整
  const weights = getAdjustedWeights(
    baseWeights, 
    competitionType || 'League', 
    isDerby,
    league
  );

  // 获取聚合决策中枢的动态权重
  const dynamicModelWeights = getDynamicWeights(
    competitionType || 'League',
    isDerby
  );



  const adv = finalAdvancedParams || {

    homeFatigue: 2,

    awayFatigue: 2,

    homeInjuries: 10,

    awayInjuries: 10,

    homeWaterTrend: 'STABLE',

    awayWaterTrend: 'STABLE',

    homeBetVolume: 45,

    awayBetVolume: 35,

    drawBetVolume: 20

  };



  const leagueAvg = LEAGUE_AVGS[league] || LEAGUE_AVGS.DEFAULT;



  // v3.0 扩展特征工程：提取高阶统计特

const homeExt = extractExtendedFeatures(homeTeam, league);

  const awayExt = extractExtendedFeatures(awayTeamVal, league);



  // Elo rating incorporation & expectancy scoring

  const homeElo = getTeamElo(homeTeam);

  const awayElo = getTeamElo(awayTeamVal);

  // Expected home win index based on Elo rating differences (with home court 100 points bump)

  const eloDiff = (homeElo + 95) - awayElo;

  const eloHomeWinExpectancy = 1 / (1 + Math.pow(10, -eloDiff / 400));



  // Environmental damage modifiers calculations

  const fatigueDamageHome = 1 - (adv.homeFatigue * 0.025); // max fatigue drops physical score by 25%

  const fatigueDamageAway = 1 - (adv.awayFatigue * 0.025);

  const injuryDamageHome = 1 - (adv.homeInjuries * 0.002);   // max injuries drops score by 20%

  const injuryDamageAway = 1 - (adv.awayInjuries * 0.002);



  const homeEnvFactor = Math.max(0.65, fatigueDamageHome * injuryDamageHome);

  const awayEnvFactor = Math.max(0.65, fatigueDamageAway * injuryDamageAway);



  // 1. 得分�?/ 失球�?(Goals per game)

  const homeHPlayed = Math.max(1, homeTeam.homeStats.played);

  const awayAPlayed = Math.max(1, awayTeamVal.awayStats.played);



  const homeScoringRate = homeTeam.homeStats.goalsFor / homeHPlayed;

  const homeConcedingRate = homeTeam.homeStats.goalsAgainst / homeHPlayed;

  const awayScoringRate = awayTeamVal.awayStats.goalsFor / awayAPlayed;

  const awayConcedingRate = awayTeamVal.awayStats.goalsAgainst / awayAPlayed;



  // 2. 主客场胜�?(Home/Away record distributions)

  const homeWinRate = homeTeam.homeStats.wins / homeHPlayed;

  const homeDrawRate = homeTeam.homeStats.draws / homeHPlayed;

  const homeLossRate = homeTeam.homeStats.losses / homeHPlayed;



  const awayWinRate = awayTeamVal.awayStats.wins / awayAPlayed;

  const awayDrawRate = awayTeamVal.awayStats.draws / awayAPlayed;

  const awayLossRate = awayTeamVal.awayStats.losses / awayAPlayed;



  // 3. 攻防实力指数 (Attack & Defense indices relative to league baselines)
  // 小样本 shrinkage：当 played < 10 时，攻防指数向1.0收缩，避免小样本极端偏移
  const homeShrinkage = Math.min(1.0, homeHPlayed / 10);
  const awayShrinkage = Math.min(1.0, awayAPlayed / 10);

  const rawHomeAttackIndex = (homeScoringRate / Math.max(0.1, leagueAvg.homeGoals)) * homeEnvFactor;
  const rawHomeDefenseIndex = (homeConcedingRate / Math.max(0.1, leagueAvg.awayGoals)) / homeEnvFactor;
  const rawAwayAttackIndex = (awayScoringRate / Math.max(0.1, leagueAvg.awayGoals)) * awayEnvFactor;
  const rawAwayDefenseIndex = (awayConcedingRate / Math.max(0.1, leagueAvg.homeGoals)) / awayEnvFactor;

  const homeAttackIndex = rawHomeAttackIndex * homeShrinkage + 1.0 * (1 - homeShrinkage);
  const homeDefenseIndex = rawHomeDefenseIndex * homeShrinkage + 1.0 * (1 - homeShrinkage);
  const awayAttackIndex = rawAwayAttackIndex * awayShrinkage + 1.0 * (1 - awayShrinkage);
  const awayDefenseIndex = rawAwayDefenseIndex * awayShrinkage + 1.0 * (1 - awayShrinkage);



  // General Strength: combination of stats strength + Elo expectations

  const statsHomeStrength = (homeAttackIndex + (1 / Math.max(0.1, homeDefenseIndex))) / 2;

  const statsAwayStrength = (awayAttackIndex + (1 / Math.max(0.1, awayDefenseIndex))) / 2;

  

  // 先用纯 stats 实力估算平局期望，避免循环依赖
  const statsHomeStrengthOnly = statsHomeStrength * 0.6;
  const statsAwayStrengthOnly = statsAwayStrength * 0.6;
  const estimatedDrawProb = calculateDynamicDrawProb(statsHomeStrengthOnly, statsAwayStrengthOnly);
  // 从 (1 - eloHomeWinExpectancy) 中扣除平局份额（平局份额的一半归客队）
  const eloAwayWinExpectancy = Math.max(0.05, 1 - eloHomeWinExpectancy - estimatedDrawProb * 0.5);
  // High fidelity combined strength: Elo is worth 40% of physical capability rating
  const homeStrength = statsHomeStrength * 0.6 + eloHomeWinExpectancy * 2.0 * 0.4;
  const awayStrength = statsAwayStrength * 0.6 + eloAwayWinExpectancy * 2.0 * 0.4;



  // 4. 欧赔通道：赔率转�?(Odds Implied Probabilities & Overround)

  // 防御性检查：确保 odds1X2 有

const oddsHome = odds1X2?.home ?? 2.0;

  const oddsDraw = odds1X2?.draw ?? 3.2;

  const oddsAway = odds1X2?.away ?? 3.5;

  

  const imHome = oddsHome > 0 ? 1 / oddsHome : 0;

  const imDraw = oddsDraw > 0 ? 1 / oddsDraw : 0;

  const imAway = oddsAway > 0 ? 1 / oddsAway : 0;

  const totalImplied = imHome + imDraw + imAway;



  const oddsHomeProb = totalImplied > 0 ? imHome / totalImplied : 0.33;

  const oddsDrawProb = totalImplied > 0 ? imDraw / totalImplied : 0.33;

  const oddsAwayProb = totalImplied > 0 ? imAway / totalImplied : 0.33;

  const overround = Math.max(0, totalImplied - 1);



  // 5. 亚盘通道：从亚盘特征计算概率

  const asianHomeProb = calculateAsianImpliedProb(asianFeatures, 'HOME');

  const asianDrawProb = calculateAsianImpliedProb(asianFeatures, 'DRAW');

  const asianAwayProb = calculateAsianImpliedProb(asianFeatures, 'AWAY');



  // 6. 双通道融合

  const marketDeviation = checkMarketDeviation(

    { home: oddsHomeProb, draw: oddsDrawProb, away: oddsAwayProb },

    { home: asianHomeProb, draw: asianDrawProb, away: asianAwayProb }

  );



  // 融合概率 = 欧赔权重 * 欧赔概率 + 亚盘权重 * 亚盘概率

  const fusedHomeProb = finalFusionWeights.oddsChannel * oddsHomeProb + 

                        finalFusionWeights.asianChannel * asianHomeProb;

  const fusedDrawProb = finalFusionWeights.oddsChannel * oddsDrawProb + 

                        finalFusionWeights.asianChannel * asianDrawProb;

  const fusedAwayProb = finalFusionWeights.oddsChannel * oddsAwayProb + 

                        finalFusionWeights.asianChannel * asianAwayProb;



  // 归一化融合概

const fusedTotal = fusedHomeProb + fusedDrawProb + fusedAwayProb;

  const finalHomeProb = fusedTotal > 0 ? fusedHomeProb / fusedTotal : 0.33;

  const finalDrawProb = fusedTotal > 0 ? fusedDrawProb / fusedTotal : 0.33;

  const finalAwayProb = fusedTotal > 0 ? fusedAwayProb / fusedTotal : 0.33;



  // 5. 盘路与返还率 (Handicap Payouts)

  const payoutRate = totalImplied > 0 ? 1 / totalImplied : 0.95;

  // 使用 Dixon-Coles 模型精确计算隐含盘口（替代原赔率差硬映射）
  const impliedAsian = convert1X2ToAsian(oddsHome, oddsDraw, oddsAway, league);
  let impliedHandicap: string;
  const ih = impliedAsian.handicap;
  if (ih === 0) {
    impliedHandicap = '平手 (0)';
  } else if (ih < 0) {
    const absH = Math.abs(ih);
    impliedHandicap = `主让${absH}球 (${ih.toFixed(2)})`;
  } else {
    impliedHandicap = `客让${ih}球 (+${ih.toFixed(2)})`;
  }



  // 6. Dixon-Coles Bivariate Goal Matrices Calculation

  const expectedHomeGoals = homeAttackIndex * awayDefenseIndex * leagueAvg.homeGoals;

  const expectedAwayGoals = awayAttackIndex * homeDefenseIndex * leagueAvg.awayGoals;



  // Bivariate Dixon-Coles goal grid simulation

  const maxGoals = 8;

  const dixonColesGrid: number[][] = Array.from({ length: 9 }, () => Array(9).fill(0));

  let gridSum = 0;



  for (let h = 0; h <= maxGoals; h++) {

    for (let a = 0; a <= maxGoals; a++) {

      const pHome = poisson(h, expectedHomeGoals);

      const pAway = poisson(a, expectedAwayGoals);

      const cellDixonAdj = dixonColesAdjustment(h, a, expectedHomeGoals, expectedAwayGoals, getLeagueRho(league));

      const prob = pHome * pAway * cellDixonAdj;

      dixonColesGrid[h][a] = Math.max(0, prob);

      gridSum += prob;

    }

  }



  // Normalize grid

  const normFactor = gridSum > 0 ? 1 / gridSum : 1;

  const poissonTable: { goals: number; prob: number }[] = [];

  for (let s = 0; s <= maxGoals; s++) {

    let sumProb = 0;

    for (let h = 0; h <= s; h++) {

      const a = s - h;

      if (h <= maxGoals && a <= maxGoals) {

        sumProb += dixonColesGrid[h][a] * normFactor;

      }

    }

    poissonTable.push({ goals: s, prob: sumProb });

  }



  // Calculate Over/Under lines using the Dixon-Coles bivariate grid values

  // 确保包含用户传入的 finalGoalsLine，并且去重和排序
  const uniqueLines = new Set([1.5, 2.5, 3.5, finalGoalsLine]);
  const overUnderLines = Array.from(uniqueLines).sort((a, b) => a - b);

  const overUnderProb = overUnderLines.map((line) => {

    let underProb = 0;

    for (let h = 0; h <= maxGoals; h++) {

      for (let a = 0; a <= maxGoals; a++) {

        if (h + a < line) {

          underProb += dixonColesGrid[h][a] * normFactor;

        }

      }

    }

    return {

      line,

      under: Math.min(0.99, Math.max(0.01, underProb)),

      over: Math.min(0.99, Math.max(0.01, 1 - underProb)),

    };

  });



  // 计算 Dixon-Coles 低比分概

const lowScoreProbability = {

    zeroZero: dixonColesGrid[0][0] * normFactor,

    oneZero: dixonColesGrid[1][0] * normFactor,

    zeroOne: dixonColesGrid[0][1] * normFactor,

    oneOne: dixonColesGrid[1][1] * normFactor,

    totalLowScore: (dixonColesGrid[0][0] + dixonColesGrid[1][0] + dixonColesGrid[0][1] + dixonColesGrid[1][1]) * normFactor

  };



  // 7. 交锋优势�?H2H

  let h2hHomeAdv = 0.5;

  let h2hPlayedCount = 0;



  const h2hSource = REAL_H2H_RECORDS[homeTeam.id]?.[awayTeamVal.id];

  const h2hSourceInverse = REAL_H2H_RECORDS[awayTeamVal.id]?.[homeTeam.id];



  if (h2hSource) {

    const total = h2hSource.wins + h2hSource.draws + h2hSource.losses;

    if (total > 0) {

      h2hHomeAdv = (h2hSource.wins + h2hSource.draws * 0.5) / total;

      h2hPlayedCount = total;

    }

  } else if (h2hSourceInverse) {

    const total = h2hSourceInverse.wins + h2hSourceInverse.draws + h2hSourceInverse.losses;

    if (total > 0) {

      h2hHomeAdv = (h2hSourceInverse.losses + h2hSourceInverse.draws * 0.5) / total;

      h2hPlayedCount = total;

    }

  } else {

    const homeRank = homeTeam.rank ?? 10;

    const awayRank = awayTeamVal.rank ?? 10;

    const rankDiff = awayRank - homeRank;

    h2hHomeAdv = 0.5 + rankDiff * 0.02;

    h2hHomeAdv = Math.min(0.75, Math.max(0.25, h2hHomeAdv));

  }

  const h2hAwayAdv = 1 - h2hHomeAdv;

  // 历史交锋平局率（用于 compDraw 的 h2h 项）
  let h2hDrawAdv = 0.25;
  if (h2hSource) {
    const total = h2hSource.wins + h2hSource.draws + h2hSource.losses;
    if (total > 0) {
      h2hDrawAdv = h2hSource.draws / total;
    }
  } else if (h2hSourceInverse) {
    const total = h2hSourceInverse.wins + h2hSourceInverse.draws + h2hSourceInverse.losses;
    if (total > 0) {
      h2hDrawAdv = h2hSourceInverse.draws / total;
    }
  }



  // 8. xG 实力 - 优先读 homeXg（场均预期进球），回退到 homeStats.xgFor
  const safeHomeXg = homeTeam.homeXg > 0 ? homeTeam.homeXg : homeTeam.homeStats.xgFor;
  const safeHomeXgAgainst = homeTeam.homeStats.xgAgainst > 0
    ? homeTeam.homeStats.xgAgainst
    : computeTeamXGSplit(homeTeam, true).xgAgainst;
  // 客队预期进球：读取 awayXg（客场场均预期进球），兜底用 computeTeamXGSplit(team, false)
  const safeAwayXg = awayTeamVal.awayXg > 0
    ? awayTeamVal.awayXg
    : computeTeamXGSplit(awayTeamVal, false).xgFor;
  const safeAwayXgAgainst = awayTeamVal.awayStats.xgAgainst > 0
    ? awayTeamVal.awayStats.xgAgainst
    : computeTeamXGSplit(awayTeamVal, false).xgAgainst;

  const homeXgDiff = (safeHomeXg - safeHomeXgAgainst) / homeHPlayed;
  const awayXgDiff = (safeAwayXg - safeAwayXgAgainst) / awayAPlayed;

  const xgStrengthDiff = homeXgDiff - awayXgDiff;

  // 8.5 高级战术特征（xPTS/PPDA/NPxGD）- 条件加权，仅五大联赛有数据时生效
  let xptsDiff = 0;
  let ppdaDiff = 0;
  let npxgdDiff = 0;
  const homeSeasonXpts = (homeTeam as any).seasonXpts || 0;
  const awaySeasonXpts = (awayTeamVal as any).seasonXpts || 0;
  const homeMatches = (homeTeam as any).matches || 0;
  const awayMatches = (awayTeamVal as any).matches || 0;
  const homeSeasonPpda = (homeTeam as any).seasonPpda || 0;
  const awaySeasonPpda = (awayTeamVal as any).seasonPpda || 0;
  const homeSeasonNpxgd = (homeTeam as any).seasonNpxgd || 0;
  const awaySeasonNpxgd = (awayTeamVal as any).seasonNpxgd || 0;

  // 仅当双方均有有效 xPTS 数据时（五大联赛）才计算差值
  if (homeSeasonXpts > 0 && awaySeasonXpts > 0) {
    const homeAvgXpts = homeMatches > 0 ? homeSeasonXpts / homeMatches : homeSeasonXpts;
    const awayAvgXpts = awayMatches > 0 ? awaySeasonXpts / awayMatches : awaySeasonXpts;
    xptsDiff = homeAvgXpts - awayAvgXpts;
    // PPDA: 数值越小压迫越强，homePPDA - awayPPDA 为正表示主队压迫更强
    ppdaDiff = homeSeasonPpda - awaySeasonPpda;
    npxgdDiff = homeSeasonNpxgd - awaySeasonNpxgd;
  }

  // 9. 状态分计算 (Form Scores)

  const formWeights = [0.35, 0.25, 0.20, 0.12, 0.08];

  const calcFormScore = (form: ('W' | 'D' | 'L')[]) => {

    let score = 0;

    for (let i = 0; i < 5; i++) {

      const match = form[i] || 'D';

      const pts = match === 'W' ? 3 : match === 'D' ? 1 : 0;

      score += pts * (formWeights[i] || 0.1);

    }

    return (score / 3) * 100;

  };

  const homeFormScore = calcFormScore(homeTeam.form);

  const awayFormScore = calcFormScore(awayTeamVal.form);

  // 近期走势平局率（用于 compDraw 的 form 项）
  const homeDrawCount = homeTeam.form?.filter((r: string) => r === 'D').length ?? 0;
  const awayDrawCount = awayTeamVal.form?.filter((r: string) => r === 'D').length ?? 0;
  const homePlayed = homeTeam.form?.length ?? 0;
  const awayPlayed = awayTeamVal.form?.length ?? 0;
  const drawFormScore = (homePlayed + awayPlayed) > 0
    ? (homeDrawCount + awayDrawCount) / (homePlayed + awayPlayed)
    : 0.25;



  // 10. 综合预测结果合成（使用双通道融合概率

const strengthDiff = homeStrength - awayStrength;
  const strHomeProb = 1 / (1 + Math.exp(-strengthDiff * 1.5));
  const strAwayProb = 1 - strHomeProb;

  const normalizedGap = Math.abs(strengthDiff) / Math.max(homeStrength + awayStrength, 0.1);
  let strDrawProb = calculateDynamicDrawProb(homeStrength, awayStrength);

  const LEAGUE_DRAW_FACTORS: Record<string, number> = {
    Eliteserien: 0.82, Allsvenskan: 0.85, Veikkausliiga: 0.88,
    Eredivisie: 0.88, Bundesliga: 0.90,
    EPL: 1.00, LaLiga: 1.00,
    SerieA: 1.12, PrimeiraLiga: 1.05, Ligue1: 1.02,
    CSL: 0.95, JLeague: 0.95, KLeague1: 0.95, KLeague2: 0.98,
    SaudiPL: 0.95, WorldCup: 1.00,
    DEFAULT: 1.00,
  };
  strDrawProb *= (LEAGUE_DRAW_FACTORS[league] || 1.0);
  strDrawProb = Math.max(0.14, Math.min(0.30, strDrawProb));  // 0.30 为实际可达上限



  const strengthHomeClean = strHomeProb * (1 - strDrawProb);

  const strengthAwayClean = strAwayProb * (1 - strDrawProb);

  const strengthDrawClean = strDrawProb;



  const haHomeWinsWeighted = homeWinRate;

  const haAwayWinsWeighted = awayWinRate;

  const totalHA = haHomeWinsWeighted + haAwayWinsWeighted + 0.5;  // 0.5 为平局兜底权重，待接入实际平局率数据

  const haHomeClean = haHomeWinsWeighted / totalHA;

  const haAwayClean = haAwayWinsWeighted / totalHA;

  const haDrawClean = 0.5 / totalHA;



  // v3.0 扩展特征微调因子 (攻防动量 / 转换效率 / 控球优势)

  const extMomentumHome = homeExt.attackMomentum * 0.08;

  const extMomentumAway = awayExt.attackMomentum * 0.08;

  const extDefHome = homeExt.defensiveStability * 0.05;

  const extDefAway = awayExt.defensiveStability * 0.05;

  const possessionAdvantage = (homeExt.possessionValue - awayExt.possessionValue) / 100 * 0.04;

  // 获取当前比赛的联赛权重配置（如果未匹配到，则使用 DEFAULT 兜底）
  const leagueWeights = LEAGUE_TACTICAL_WEIGHTS[league] || LEAGUE_TACTICAL_WEIGHTS['DEFAULT'];

  // 计算战术外部因子（基于联赛特征动态加权）
  const tacticalExtFactor = (xptsDiff !== 0 || ppdaDiff !== 0 || npxgdDiff !== 0)
    ? xptsDiff * leagueWeights.xpts + ppdaDiff * leagueWeights.ppda + npxgdDiff * leagueWeights.npxgd
    : 0;
  const extFactor = (extMomentumHome - extMomentumAway) + (extDefHome - extDefAway) + possessionAdvantage + tacticalExtFactor;
  const clippedExtFactor = Math.max(-0.15, Math.min(0.15, extFactor));



  // 使用双通道融合概率替代原始欧赔概率

  let compHomeWin = (

    finalHomeProb * weights.odds +

    strengthHomeClean * weights.strength +

    haHomeClean * weights.homeAway +

    h2hHomeAdv * weights.h2h +

    (homeFormScore / (homeFormScore + awayFormScore || 1)) * weights.form

  ) + clippedExtFactor;
  console.log('[DEBUG] compHomeWin=', compHomeWin, 'extFactor=', extFactor, 'clippedExtFactor=', clippedExtFactor);



  let compAwayWin = (

    finalAwayProb * weights.odds +

    strengthAwayClean * weights.strength +

    haAwayClean * weights.homeAway +

    h2hAwayAdv * weights.h2h +

    (awayFormScore / (homeFormScore + awayFormScore || 1)) * weights.form

  ) - clippedExtFactor;



  let compDraw = (

    finalDrawProb * weights.odds +

    strengthDrawClean * weights.strength +

    haDrawClean * weights.homeAway +

    h2hDrawAdv * weights.h2h +

    drawFormScore * weights.form
    + (Math.abs(clippedExtFactor) < 0.1 ? Math.abs(clippedExtFactor) * 0.2 : -Math.abs(clippedExtFactor) * 0.3)  // 有方向性的平局修正：小实力差时平局略增（两队接近时平局常见），大实力差时平局降低（实力悬殊时平局少见）

  );



  const totalComp = compHomeWin + compDraw + compAwayWin;

  compHomeWin = compHomeWin / totalComp;

  compDraw = compDraw / totalComp;

  compAwayWin = compAwayWin / totalComp;

  // 投注量修正因子：当某方向投注量占比过高时，轻微降低该方向概率（反向指标）
  const totalBetVolume = (adv.homeBetVolume || 45) + (adv.awayBetVolume || 35) + (adv.drawBetVolume || 20);
  const homeBetRatio = (adv.homeBetVolume || 45) / totalBetVolume;
  const awayBetRatio = (adv.awayBetVolume || 35) / totalBetVolume;
  const drawBetRatio = (adv.drawBetVolume || 20) / totalBetVolume;

  // 当投注量占比超过50%时，视为过热，降低0.5%~2%的概率
  const homeOverheat = homeBetRatio > 0.5 ? (homeBetRatio - 0.5) * 0.04 : 0;
  const awayOverheat = awayBetRatio > 0.5 ? (awayBetRatio - 0.5) * 0.04 : 0;
  const drawOverheat = drawBetRatio > 0.5 ? (drawBetRatio - 0.5) * 0.04 : 0;

  compHomeWin = Math.max(0, compHomeWin - homeOverheat);
  compDraw = Math.max(0, compDraw - drawOverheat);
  compAwayWin = Math.max(0, compAwayWin - awayOverheat);

  // 极端场景检测：三方向概率均 ≤ 0 时标记"无可预测性"
  const noPredictability = (compHomeWin + compDraw + compAwayWin) <= 0;
  if (noPredictability) {
    compHomeWin = 1/3;
    compDraw = 1/3;
    compAwayWin = 1/3;
  } else {
    const compTotal2 = compHomeWin + compDraw + compAwayWin;
    compHomeWin /= compTotal2;
    compDraw /= compTotal2;
    compAwayWin /= compTotal2;
  }

  // 聚合决策中枢算法

  const calculateAggregatedDecision = (
    modelWeights: { poissonWeight: number; eloWeight: number; dixonColesWeight: number }
  ): AggregatedDecision => {

    const { poissonWeight, eloWeight, dixonColesWeight } = modelWeights;



    const totalExpectedGoals = expectedHomeGoals + expectedAwayGoals;

    const poissonType = totalExpectedGoals < 2.2 ? 'UNDER' : totalExpectedGoals > 2.8 ? 'OVER' : 'NEUTRAL';

    const poissonValue = poissonType === 'UNDER' ? Math.max(0.5, 1 - (totalExpectedGoals / 4)) :

                         poissonType === 'OVER' ? Math.max(0.5, totalExpectedGoals / 5) : 0.5;



    const eloDiffVal = Math.abs(eloHomeWinExpectancy - 0.5);

    let eloType: string;

    let eloValue: number;

    if (eloHomeWinExpectancy > 0.55) {

      eloType = 'HOME_WIN';

      eloValue = Math.min(0.95, 0.5 + eloDiffVal);

    } else if (eloHomeWinExpectancy < 0.45) {

      eloType = 'AWAY_WIN';

      eloValue = Math.min(0.95, 0.5 + eloDiffVal);

    } else {

      eloType = 'DRAW';

      eloValue = Math.min(0.95, 1 - eloDiffVal);

    }



    const dixonColesType = lowScoreProbability.totalLowScore > 0.55 ? 'UNDER' :

                          lowScoreProbability.totalLowScore < 0.4 ? 'OVER' : 'NEUTRAL';

    const dixonColesValue = dixonColesType === 'UNDER' ? Math.max(0.5, lowScoreProbability.totalLowScore) :

                            dixonColesType === 'OVER' ? Math.max(0.5, 1 - lowScoreProbability.totalLowScore) : 0.5;



    let finalDirection: 'HOME_WIN' | 'DRAW' | 'AWAY_WIN';

    let finalConfidence: number;

    // Poisson/DC 大小球类型到胜平负方向的映射
    // OVER = 总进球多 → 倾向有明确胜负（非平局）
    // UNDER = 总进球少 → 倾向平局或低比分胜负
    // NEUTRAL = 中性
    const mapGoalsTypeToDirection = (
      goalsType: 'OVER' | 'UNDER' | 'NEUTRAL',
      eloDirection: string
    ): 'align' | 'contradict' | 'neutral' => {
      if (goalsType === 'NEUTRAL') return 'neutral';
      if (eloDirection === 'DRAW') {
        // Elo 认为平局：OVER 矛盾（进球多不太可能平局），UNDER 一致（进球少可能平局）
        return goalsType === 'UNDER' ? 'align' : 'contradict';
      }
      // Elo 认为有胜负：OVER 一致（进球多支持有胜负），UNDER 部分矛盾（进球少可能平局）
      return goalsType === 'OVER' ? 'align' : 'contradict';
    };

    if (eloDiffVal > 0.25) {

      finalDirection = eloType as 'HOME_WIN' | 'DRAW' | 'AWAY_WIN';

      // Poisson/Dixon-Coles 方向与 Elo 方向一致时加分，矛盾时减分，中性时少量加分
      const poissonAlignment = mapGoalsTypeToDirection(poissonType, eloType);
      const poissonAlignScore = poissonAlignment === 'align' ? poissonValue * poissonWeight
                              : poissonAlignment === 'neutral' ? poissonValue * poissonWeight * 0.3
                              : -poissonValue * poissonWeight * 0.2;
      const dcAlignment = mapGoalsTypeToDirection(dixonColesType, eloType);
      const dcAlignScore = dcAlignment === 'align' ? dixonColesValue * dixonColesWeight
                         : dcAlignment === 'neutral' ? dixonColesValue * dixonColesWeight * 0.3
                         : -dixonColesValue * dixonColesWeight * 0.2;
      finalConfidence = Math.min(0.95, Math.max(0.1, eloValue * eloWeight + poissonAlignScore + dcAlignScore));

    }

    else {

      if (compHomeWin > compAwayWin && compHomeWin > compDraw) {

        finalDirection = 'HOME_WIN';

        finalConfidence = Math.min(0.95, compHomeWin);

      } else if (compAwayWin > compHomeWin && compAwayWin > compDraw) {

        finalDirection = 'AWAY_WIN';

        finalConfidence = Math.min(0.95, compAwayWin);

      } else {

        finalDirection = 'DRAW';

        finalConfidence = Math.min(0.95, compDraw);

      }

      // Poisson/DC 方向一致性修正：与 compMax 方向一致时微增置信度
      const compDirection = finalDirection;
      const poissonCompAlignment = mapGoalsTypeToDirection(poissonType, compDirection);
      const poissonBonus = poissonCompAlignment === 'align' ? poissonValue * poissonWeight * 0.15
                         : poissonCompAlignment === 'neutral' ? 0 : -poissonValue * poissonWeight * 0.1;
      const dcCompAlignment = mapGoalsTypeToDirection(dixonColesType, compDirection);
      const dcBonus = dcCompAlignment === 'align' ? dixonColesValue * dixonColesWeight * 0.15
                    : dcCompAlignment === 'neutral' ? 0 : -dixonColesValue * dixonColesWeight * 0.1;
      finalConfidence = Math.min(0.95, Math.max(0.1, finalConfidence + poissonBonus + dcBonus));

    }



    // 独立的大小球推荐（与胜平负方向解耦）
    let totalGoalsRecommendation: { direction: 'OVER' | 'UNDER'; confidence: number } | undefined;
    if (lowScoreProbability.totalLowScore > 0.65 && totalExpectedGoals < 2.0) {
      totalGoalsRecommendation = {
        direction: 'UNDER',
        confidence: Math.min(0.95, 0.5 + (lowScoreProbability.totalLowScore - 0.5) * 1.5)
      };
    } else if (lowScoreProbability.totalLowScore < 0.4 && totalExpectedGoals > 2.8) {
      totalGoalsRecommendation = {
        direction: 'OVER',
        confidence: Math.min(0.95, 0.5 + ((1 - lowScoreProbability.totalLowScore) - 0.5) * 1.5)
      };
    } else if (poissonType === 'UNDER' && dixonColesType === 'UNDER') {
      totalGoalsRecommendation = {
        direction: 'UNDER',
        confidence: Math.min(0.95, (poissonValue * poissonWeight + dixonColesValue * dixonColesWeight) / (poissonWeight + dixonColesWeight))
      };
    } else if (poissonType === 'OVER' && dixonColesType === 'OVER') {
      totalGoalsRecommendation = {
        direction: 'OVER',
        confidence: Math.min(0.95, (poissonValue * poissonWeight + dixonColesValue * dixonColesWeight) / (poissonWeight + dixonColesWeight))
      };
    }



    return {

      direction: finalDirection,

      confidence: finalConfidence,

      totalGoalsRecommendation,

      coreIndicators: {

        poissonIndicator: { type: poissonType, value: poissonValue, weight: poissonWeight },

        eloIndicator: { type: eloType, value: eloValue, weight: eloWeight },

        dixonColesIndicator: { type: dixonColesType, value: dixonColesValue, weight: dixonColesWeight }

      }

    };

  };



  const aggregatedDecision = calculateAggregatedDecision(dynamicModelWeights);



  // 11. 赔率波动及资金热度评�?(Cold Upset Heat Index Analysis)

  // Heat Index = Funding pool share divided by mathematical likelihood score

  // v8.0: Z-Score ????????????? heatIndex?
  // ????????/??????????????????????
  const HISTORICAL_MEAN = 50;   // ????????? (???)
  const HISTORICAL_STD  = 15;   // ??????????

  const upsetAlert = evaluateUpsetAlert(
    adv.homeBetVolume,
    adv.awayBetVolume,
    compHomeWin,
    compAwayWin,
    HISTORICAL_MEAN,
    HISTORICAL_STD,
    oddsHomeProb,
    oddsAwayProb,
    0, // historicalCount: 0 = ????? betting_history ?????????? count
  );

  // ??? heatIndex ????????????????
  const heatIndexHome = parseFloat((adv.homeBetVolume / Math.max(1, compHomeWin * 100)).toFixed(2));
  const heatIndexAway = parseFloat((adv.awayBetVolume / Math.max(1, compAwayWin * 100)).toFixed(2));

  

  // Calculate simulated variance trend indicator

  let oddsWaveFactor = 1.0; 

  if (adv.homeWaterTrend === 'UP') oddsWaveFactor += 0.15;

  if (adv.homeWaterTrend === 'DOWN') oddsWaveFactor -= 0.12;

  if (adv.awayWaterTrend === 'UP') oddsWaveFactor += 0.10;

  

  // High volume alarm

  const heavyVolumeRisk = (adv.homeBetVolume > 65 && compHomeWin < 0.45) || (adv.awayBetVolume > 55 && compAwayWin < 0.35);



  // 12. 凯利公式资金比例筹划

  const kellyHome = calculateKellyFraction(compHomeWin, oddsHome);

  const kellyDraw = calculateKellyFraction(compDraw, oddsDraw);

  const kellyAway = calculateKellyFraction(compAwayWin, oddsAway);

  // 将 kellySuggestion 合并到 aggregatedDecision 中
  const aggregatedDecisionWithKelly: AggregatedDecision = {
    ...aggregatedDecision,
    kellySuggestion: {
      homeKelly: kellyHome,
      awayKelly: kellyAway,
      suggestedBetSize: kellyHome > 0.05 ? kellyHome : kellyAway > 0.05 ? kellyAway : 0,
    },
  };



  // 13. 衍生数据扩展（角球、黄牌）

  // Corner kicks based on attack pressure combined indicators

  const baseHomeCorners = 4.2 + (homeAttackIndex * 2.2) + (awayDefenseIndex * 1.5) - (adv.homeFatigue * 0.1);

  const baseAwayCorners = 3.6 + (awayAttackIndex * 2.0) + (homeDefenseIndex * 1.2) - (adv.awayFatigue * 0.1);

  const expectedHomeCorners = parseFloat(Math.max(2, baseHomeCorners).toFixed(1));

  const expectedAwayCorners = parseFloat(Math.max(2, baseAwayCorners).toFixed(1));



  // 14. 预期积分与球队长期估值值�?(xPts)

  const homeXpts = parseFloat(((compHomeWin * 3) + (compDraw * 1)).toFixed(2));

  const awayXpts = parseFloat(((compAwayWin * 3) + (compDraw * 1)).toFixed(2));



  // Actual performance rate evaluation

  const homeRealPlay = homeTeam.homeStats.played + homeTeam.awayStats.played;

  const awayRealPlay = awayTeamVal.homeStats.played + awayTeamVal.awayStats.played;

  

  const hW = homeTeam.homeStats.wins + homeTeam.awayStats.wins;

  const hD = homeTeam.homeStats.draws + homeTeam.awayStats.draws;

  const aW = awayTeamVal.homeStats.wins + awayTeamVal.awayStats.wins;

  const aD = awayTeamVal.homeStats.draws + awayTeamVal.awayStats.draws;



  const homeRealPointsRate = parseFloat((((hW * 3) + (hD * 1)) / (homeRealPlay || 1)).toFixed(2));

  const awayRealPointsRate = parseFloat((((aW * 3) + (aD * 1)) / (awayRealPlay || 1)).toFixed(2));



  // Evaluate whether they are currently overvalued or undervalued against their real average points per game

  const ptsDiffHome = homeXpts - homeRealPointsRate;

  const ptsDiffAway = awayXpts - awayRealPointsRate;



  const homePtsStatus = ptsDiffHome > 0.25 ? 'UNDERVALUED' : (ptsDiffHome < -0.25 ? 'OVERVALUED' : 'BALANCED');

  const awayPtsStatus = ptsDiffAway > 0.25 ? 'UNDERVALUED' : (ptsDiffAway < -0.25 ? 'OVERVALUED' : 'BALANCED');



  // Triggering the refined Cold Upset Warning alerts

  const coldUpsetAlert = 

    (oddsHomeProb < 0.42 && (compHomeWin - oddsHomeProb) > 0.17 && adv.homeWaterTrend === 'DOWN') ||

    (oddsAwayProb < 0.35 && (compAwayWin - oddsAwayProb) > 0.15 && adv.awayWaterTrend === 'DOWN') ||

    upsetAlert.isUpset;



  // Generating detailed betting recommendations

  // recommendedDirection 基于 aggregatedDecision.direction 的文本描述（统一判定逻辑）
  const safeHomeName = homeTeam?.nameCn || 'Unknown';
  const safeAwayName = awayTeamVal?.nameCn || 'Unknown';
  const recommendedDirection = aggregatedDecisionWithKelly.direction === 'HOME_WIN'
    ? `${safeHomeName} 主胜（置信度 ${(aggregatedDecisionWithKelly.confidence * 100).toFixed(0)}%）`
    : aggregatedDecisionWithKelly.direction === 'AWAY_WIN'
    ? `${safeAwayName} 客胜（置信度 ${(aggregatedDecisionWithKelly.confidence * 100).toFixed(0)}%）`
    : '平局倾向';

  let recommendedReason = '';

  let riskRating: 'LOW' | 'MEDIUM' | 'HIGH' = 'MEDIUM';



  const selectedLineProb = overUnderProb.find((p) => p.line === finalGoalsLine) || overUnderProb[1];



  if (aggregatedDecisionWithKelly.direction === 'HOME_WIN') {

    recommendedReason = `Dixon-Coles 模型支持主场进球效率（期望 ${expectedHomeGoals.toFixed(1)} 球）。结合 Elo ${homeElo} 领先优势，半凯利公式锁定 ${kellyHome}% 比例防线，庄防赔付低。`;

    riskRating = aggregatedDecisionWithKelly.confidence > 0.65 ? 'LOW' : 'MEDIUM';

  } else if (aggregatedDecisionWithKelly.direction === 'AWAY_WIN') {

    recommendedReason = `客队 Elo 分数 ${awayElo} 呈防冷压制态势。xPts 模型指示客队长期估值牌面为 ${awayXpts}。主队由于疲劳 ${adv.homeFatigue} 攻防漏勺。`;

    riskRating = aggregatedDecisionWithKelly.confidence > 0.65 ? 'LOW' : 'MEDIUM';

  } else {

    recommendedReason = `综合模型显示双方实力接近，平局概率 ${(compDraw * 100).toFixed(1)}% 较高。Dixon-Coles 矩阵预警低分区域概率密集，凯利建议克制投注。`;
    riskRating = 'MEDIUM';

  }






  const _r = {

    homeScoringRate,

    homeConcedingRate,

    awayScoringRate,

    awayConcedingRate,

    homeWinRate,

    homeDrawRate,

    homeLossRate,

    awayWinRate,

    awayDrawRate,

    awayLossRate,

    homeAttackIndex,

    homeDefenseIndex,

    awayAttackIndex,

    awayDefenseIndex,

    homeStrength,

    awayStrength,

    homeElo,

    awayElo,

    eloHomeWinExpectancy,

    oddsHomeProb,

    oddsDrawProb,

    oddsAwayProb,

    overround,

    payoutRate,

    impliedHandicap,

    expectedHomeGoals,

    expectedAwayGoals,

    poissonTable,

    overUnderProb,

    lowScoreProbability,

    h2hHomeAdv,

    h2hAwayAdv,

    h2hPlayedCount,

    homeXgDiff,

    awayXgDiff,

    xgStrengthDiff,

    xptsDiff,
    ppdaDiff,
    npxgdDiff,

    homeFormScore,

    awayFormScore,

    compHomeWin,

    compDraw,

    compAwayWin,

    expectedHomeCorners,

    expectedAwayCorners,

    homeXpts,

    awayXpts,

    homeRealPointsRate,

    awayRealPointsRate,

    homePtsStatus,

    awayPtsStatus,

    kellyHome,

    kellyDraw,

    kellyAway,

    heatIndexHome,

    heatIndexAway,
    zScoreHome: upsetAlert.zScoreHome,
    zScoreAway: upsetAlert.zScoreAway,
    upsetLevel: upsetAlert.level,

    oddsWaveFactor,

    heavyVolumeRisk,

    // 双通道融合指标

    fusedHomeProb: finalHomeProb,

    fusedDrawProb: finalDrawProb,

    fusedAwayProb: finalAwayProb,

    asianHomeProb,

    asianDrawProb,

    asianAwayProb,

    marketDeviation: marketDeviation.deviation,

    marketConfidence: marketDeviation.confidence,

    marketDeviationWarning: marketDeviation.warning,

    aggregatedDecision: aggregatedDecisionWithKelly,

    recommendedDirection,

    recommendedReason,

    riskRating,

    coldUpsetAlert,

    noPredictability,

    handicapCoverage: checkHandicapCoverage(expectedHomeGoals, expectedAwayGoals, asianFeatures.handicapValue)

  };

  // P3-16: cache and return
  mc.set(ck, _r);
  return _r;

  } catch (error) {
    console.error('[calculateBetsModel] Critical error:', error);
    
    // 安全返回默认结果
    const defaultHome = createDefaultTeam();
    const defaultAway = createDefaultTeam();
    
    // 使用非常基础的默认值
    return {
      homeScoringRate: 1.4,
      homeConcedingRate: 1.2,
      awayScoringRate: 1.2,
      awayConcedingRate: 1.4,
      homeWinRate: 0.45,
      homeDrawRate: 0.25,
      homeLossRate: 0.3,
      awayWinRate: 0.3,
      awayDrawRate: 0.25,
      awayLossRate: 0.45,
      homeAttackIndex: 50,
      homeDefenseIndex: 50,
      awayAttackIndex: 50,
      awayDefenseIndex: 50,
      homeStrength: 1500,
      awayStrength: 1500,
      homeElo: 1500,
      awayElo: 1500,
      eloHomeWinExpectancy: 0.5,
      oddsHomeProb: 0.45,
      oddsDrawProb: 0.25,
      oddsAwayProb: 0.3,
      overround: 1.1,
      payoutRate: 0.909,
      impliedHandicap: '0',
      expectedHomeGoals: 1.4,
      expectedAwayGoals: 1.2,
      poissonTable: [],
      overUnderProb: [],
      lowScoreProbability: {
        zeroZero: 0.1,
        oneZero: 0.1,
        zeroOne: 0.1,
        oneOne: 0.1,
        totalLowScore: 0.4
      },
      h2hHomeAdv: 0,
      h2hAwayAdv: 0,
      h2hPlayedCount: 0,
      homeXgDiff: 0,
      awayXgDiff: 0,
      xgStrengthDiff: 0,
      homeFormScore: 0,
      awayFormScore: 0,
      compHomeWin: 0,
      compDraw: 0,
      compAwayWin: 0,
      expectedHomeCorners: 5,
      expectedAwayCorners: 5,
      homeXpts: 1.5,
      awayXpts: 1.5,
      homeRealPointsRate: 1.0,
      awayRealPointsRate: 1.0,
      homePtsStatus: 'BALANCED',
      awayPtsStatus: 'BALANCED',
      kellyHome: 0,
      kellyDraw: 0,
      kellyAway: 0,
      heatIndexHome: 0,
      heatIndexAway: 0,
      zScoreHome: 0,
      zScoreAway: 0,
      upsetLevel: 'none',
      oddsWaveFactor: 1.0,
      heavyVolumeRisk: false,
      // 双通道融合指标
      fusedHomeProb: 0.45,
      fusedDrawProb: 0.25,
      fusedAwayProb: 0.3,
      asianHomeProb: 0.45,
      asianDrawProb: 0.25,
      asianAwayProb: 0.3,
      marketDeviation: 0,
      marketConfidence: 'medium',
      marketDeviationWarning: null,
      aggregatedDecision: {
        direction: 'DRAW',
        confidence: 0.5,
        kellySuggestion: {
          homeKelly: 0,
          awayKelly: 0,
          suggestedBetSize: 0,
        },
        coreIndicators: {
          poissonIndicator: { type: 'DRAW', value: 0.5, weight: 0.33 },
          eloIndicator: { type: 'DRAW', value: 0.5, weight: 0.33 },
          dixonColesIndicator: { type: 'DRAW', value: 0.5, weight: 0.34 }
        }
      },
      recommendedDirection: '平局倾向',
      recommendedReason: '系统进入安全模式，请检查数据完整性。',
      riskRating: 'MEDIUM',
      coldUpsetAlert: false,
      handicapCoverage: { covered: true, netGoals: 0, requiredMargin: 0, reason: '安全模式，无盘口验证' }
    };
  }
}



// Live Bayesian Parameters Interface

export interface LiveBayesianParams {

  elapsedMinutes: number;

  liveHomeGoals: number;

  liveAwayGoals: number;

  homeRedCards: number;

  awayRedCards: number;

}



// 15. Bayesian Dynamic In-Play Updater (贝叶斯即时监�?

export function calculateBayesianLiveUpdate(

  preMatchResults: PredictionResults,

  params: LiveBayesianParams,

  homeTeam: TeamStats,

  awayTeam: TeamStats,

  league: string = 'DEFAULT'

) {

  const { elapsedMinutes, liveHomeGoals, liveAwayGoals, homeRedCards, awayRedCards } = params;

  

  // ===== v4.0: 非线性时间衰减（幂函数替代线性） =====
  const rawRemaining = calculateLeagueTimeDecay(elapsedMinutes, homeTeam?.league || awayTeam?.league);

  

  // Apply immediate penalty for red cards (each red card lowers offensive expected goals by 20%, defensive capability by 30%)

  const redCardHomeDamage = Math.max(0.4, 1.0 - homeRedCards * 0.22);

  const redCardAwayDamage = Math.max(0.4, 1.0 - awayRedCards * 0.22);

  const redCardHomeDefenseLeak = Math.max(1.0, 1.0 + homeRedCards * 0.35);

  const redCardAwayDefenseLeak = Math.max(1.0, 1.0 + awayRedCards * 0.35);



  const remainingExpectedHomeGoals = preMatchResults.expectedHomeGoals * rawRemaining * redCardHomeDamage * (redCardAwayDefenseLeak < 1.1 ? 1.0 : 1.15);

  const remainingExpectedAwayGoals = preMatchResults.expectedAwayGoals * rawRemaining * redCardAwayDamage * (redCardHomeDefenseLeak < 1.1 ? 1.0 : 1.15);



  // Run bivariate Dixon-Coles on the remaining matches goals

  const maxGoals = 6; // clip for high-speed live computation

  const baseLiveResultHomeScore = liveHomeGoals;

  const baseLiveResultAwayScore = liveAwayGoals;



  let liveHomeWinProb = 0;

  let liveDrawProb = 0;

  let liveAwayWinProb = 0;

  let remainingSum = 0;



  for (let rH = 0; rH <= maxGoals; rH++) {

    for (let rA = 0; rA <= maxGoals; rA++) {

      const pHome = poisson(rH, remainingExpectedHomeGoals);

      const pAway = poisson(rA, remainingExpectedAwayGoals);

      const cellDixon = dixonColesAdjustment(rH, rA, remainingExpectedHomeGoals, remainingExpectedAwayGoals, getLeagueRho(league));

      const prob = pHome * pAway * cellDixon;

      

      const absoluteHome = baseLiveResultHomeScore + rH;

      const absoluteAway = baseLiveResultAwayScore + rA;



      if (absoluteHome > absoluteAway) {

        liveHomeWinProb += prob;

      } else if (absoluteHome === absoluteAway) {

        liveDrawProb += prob;

      } else {

        liveAwayWinProb += prob;

      }



      remainingSum += prob;

    }

  }



  // Under Bayesian updating, we use pre-match computed weights as a Prior

  // Normalization gives us the in-play joint posterior likelihood

  const sumLive = liveHomeWinProb + liveDrawProb + liveAwayWinProb;

  if (sumLive > 0) {

    liveHomeWinProb = liveHomeWinProb / sumLive;

    liveDrawProb = liveDrawProb / sumLive;

    liveAwayWinProb = liveAwayWinProb / sumLive;

  } else {

    // Fallback if remaining time is exactly 0

    if (baseLiveResultHomeScore > baseLiveResultAwayScore) {

      liveHomeWinProb = 1.0; liveDrawProb = 0; liveAwayWinProb = 0;

    } else if (baseLiveResultHomeScore === baseLiveResultAwayScore) {

      liveHomeWinProb = 0; liveDrawProb = 1.0; liveAwayWinProb = 0;

    } else {

      liveHomeWinProb = 0; liveDrawProb = 0; liveAwayWinProb = 1.0;

    }

  }



  // Combine Corners and Yellow Cards dynamic live expected increments

  // 角球时间分布权重：后段权重高于前段（角球多发生在比赛后段）
  const cornerTimeWeight = elapsedMinutes < 45 
    ? 1.0   // 上半场：均匀分布
    : elapsedMinutes < 60 
      ? 1.15 // 45-60分钟：角球频率开始上升
      : 1.3; // 60分钟后：角球频率显著上升

  const liveCornerHomeLeft = Math.max(0, Math.round(preMatchResults.expectedHomeCorners * rawRemaining * cornerTimeWeight));
  const liveCornerAwayLeft = Math.max(0, Math.round(preMatchResults.expectedAwayCorners * rawRemaining * cornerTimeWeight));



  return {

    liveHomeWin: liveHomeWinProb,

    liveDraw: liveDrawProb,

    liveAwayWin: liveAwayWinProb,

    liveCornerHomeLeft,

    liveCornerAwayLeft,

    remainingExpectedHomeGoals,

    remainingExpectedAwayGoals

  };

}



// ==================== 亚盘特征提取模块 ====================



export interface AsianHandicapParams {

  handicap: number;   // 让球盘口: 负数=主队让球, 正数=客队让球, 0=平手

  homeWater: number;  // 主队水位 0.80~1.05

  awayWater: number;  // 客队水位 0.80~1.05

  prevHandicap?: number;  // 上一期盘口（用于计算变化率）

  prevHomeWater?: number; // 上一期主队水位（用于检测剧烈变动）

  prevAwayWater?: number;

}



export interface AsianHandicapFeatures {

  handicapValue: number;

  homeWater: number;           // 主队水位

  awayWater: number;           // 客队水位

  waterDiff: number;

  isSharpMove: boolean;        // 是否出现剧烈水位变动

  handicapAdjustRate: number;

  homeWaterChange: number;     // 主队水位变化量

  awayWaterChange: number;     // 客队水位变化量

  marketPressure: 'HOT' | 'COLD' | 'NORMAL'; // 市场热度

  bookmakerBias: 'HOME' | 'AWAY' | 'NEUTRAL'; // 庄家倾向

}



/**

 * 亚盘专用特征提取模块

 * 直接从亚盘数据中提取特征，不进行欧亚转换

 */

export function extractAsianHandicapFeatures(

  current: AsianHandicapParams,

  previous?: AsianHandicapParams

): AsianHandicapFeatures {

  // 水位差：反映主客热度（正�?主队热，负数=客队热）

  const waterDiff = current.homeWater - current.awayWater;

  

  // 盘口变化

const prevHandicap = previous?.handicap ?? current.handicap;

  const handicapAdjustRate = current.handicap - prevHandicap;

  

  // 水位变化

const prevHomeWater = previous?.prevHomeWater ?? current.homeWater;

  const prevAwayWater = previous?.prevAwayWater ?? current.awayWater;

  const homeWaterChange = current.homeWater - prevHomeWater;

  const awayWaterChange = current.awayWater - prevAwayWater;

  

  // 检测剧烈水位变动（阈值：0.10）

  const isSharpMove = Math.abs(homeWaterChange) > 0.10 || Math.abs(awayWaterChange) > 0.10;

  

  // 判断市场热度

  let marketPressure: 'HOT' | 'COLD' | 'NORMAL' = 'NORMAL';

  if (waterDiff < -0.08) {

    marketPressure = 'HOT'; // 主队水位低，受热

  } else if (waterDiff > 0.08) {

    marketPressure = 'COLD'; // 主队水位高，受冷

  }

  

  // 判断庄家倾向

  let bookmakerBias: 'HOME' | 'AWAY' | 'NEUTRAL' = 'NEUTRAL';

  if (current.handicap < -0.5 || (current.handicap < 0 && waterDiff < -0.05)) {

    bookmakerBias = 'HOME';

  } else if (current.handicap > 0.5 || (current.handicap > 0 && waterDiff > 0.05)) {

    bookmakerBias = 'AWAY';

  }

  

  return {

    handicapValue: current.handicap,

    homeWater: current.homeWater,

    awayWater: current.awayWater,

    waterDiff,

    isSharpMove,

    handicapAdjustRate,

    homeWaterChange,

    awayWaterChange,

    marketPressure,

    bookmakerBias

  };

}



// ==================== 双通道融合接口 ====================



export interface Odds1X2 {

  home: number;

  draw: number;

  away: number;

}



export type CompetitionType = 'League' | 'Cup' | 'Friendly';

export interface BetsModelInput {
  homeTeam: TeamStats;
  awayTeam: TeamStats;
  odds1X2: Odds1X2;           // 欧赔 1X2
  asianFeatures: AsianHandicapFeatures; // 亚盘特征
  goalsLine?: number;
  customWeights?: ModelWeights;
  advancedParams?: AdvancedParams;
  fusionWeights?: {           // 双通道融合权重
    oddsChannel: number;      // 欧赔通道权重 (默认 0.7)
    asianChannel: number;     // 亚盘通道权重 (默认 0.3)
  };
  competitionType?: CompetitionType; // 比赛类型
  homeTeamId?: number;        // 主队唯一数字 ID
  awayTeamId?: number;        // 客队唯一数字 ID
}

// 德比配置表（基于球队 ID）
const DERBY_MAP: Record<string, boolean> = {
  // 曼彻斯特德比（曼城 vs 曼联）
  '6:1': true,
  '1:6': true,
  // 伦敦德比（阿森纳 vs 热刺）
  '4:18': true,
  '18:4': true,
  // 西班牙国家德比（皇马 vs 巴萨）
  '21:22': true,
  '22:21': true,
  // 马德里德比（皇马 vs 马竞）
  '21:23': true,
  '23:21': true,
  // 米兰德比（国际米兰 vs AC米兰）
  '41:42': true,
  '42:41': true,
  // 国家德比（尤文图斯 vs 国际米兰）
  '43:41': true,
  '41:43': true,
  // 德国国家德比（拜仁 vs 多特）
  '61:64': true,
  '64:61': true,
  // 鲁尔区德比（多特 vs 沙尔克04）
  '64:69': true,
  '69:64': true,
};

// 检查是否是德比
function checkIfDerby(homeId: number, awayId: number): boolean {
  const key = `${homeId}:${awayId}`;
  return DERBY_MAP[key] === true;
}

// 根据比赛类型和是否为德比动态调整权重
function getAdjustedWeights(
  baseWeights: ModelWeights,
  competitionType: CompetitionType = 'League',
  isDerby: boolean = false,
  league?: string
): ModelWeights {
  let weights = { ...baseWeights };

  // 根据比赛类型调整权重
  switch (competitionType) {
    case 'Cup':
      // 杯赛：降低赔率和主客场权重，提高历史交锋权重
      weights.odds *= 0.8;
      weights.homeAway *= 0.7;
      weights.h2h *= 1.5;
      weights.form *= 1.2;
      break;
    case 'Friendly':
      // 友谊赛：降低所有权重，更均衡
      weights.odds *= 0.6;
      weights.strength *= 0.8;
      weights.homeAway *= 0.5;
      weights.h2h *= 0.7;
      weights.form *= 0.8;
      break;
    case 'League':
    default:
      // 联赛：联赛级差异化调整
      if (league) {
        const leagueModifiers: Record<string, Partial<ModelWeights>> = {
          Eliteserien: { homeAway: -0.05, form: +0.03, h2h: +0.02 },
          Allsvenskan: { homeAway: -0.05, form: +0.03, h2h: +0.02 },
          Veikkausliiga: { homeAway: -0.03, form: +0.02, h2h: +0.01 },
          Bundesliga: { homeAway: -0.03, odds: +0.03 },
          Eredivisie: { homeAway: -0.03, form: +0.02, odds: +0.01 },
          SerieA: { h2h: +0.03, odds: -0.03 },
          KLeague2: { h2h: +0.03, form: +0.02, homeAway: -0.03, odds: -0.02 },
        };
        const mod = leagueModifiers[league];
        if (mod) {
          if (mod.odds) weights.odds += mod.odds;
          if (mod.strength) weights.strength += mod.strength;
          if (mod.homeAway) weights.homeAway += mod.homeAway;
          if (mod.h2h) weights.h2h += mod.h2h;
          if (mod.form) weights.form += mod.form;
        }
      }
      break;
  }

  // 如果是德比，进一步调整权重
  if (isDerby) {
    weights.h2h *= 1.8; // 德比中历史交锋更重要
    weights.form *= 1.4; // 近期状态也更重要
    weights.homeAway *= 0.6; // 主客场优势在德比中可能减弱
  }

  // 归一化权重，确保总和为 1
  const total = weights.odds + weights.strength + weights.homeAway + weights.h2h + weights.form;
  weights.odds /= total;
  weights.strength /= total;
  weights.homeAway /= total;
  weights.h2h /= total;
  weights.form /= total;

  return weights;
}

// 动态权重计算函数
function getDynamicWeights(
  competitionType: string,
  isDerby: boolean
): { poissonWeight: number; eloWeight: number; dixonColesWeight: number } {
  // 默认权重（常规联赛）
  let weights = { poissonWeight: 0.35, eloWeight: 0.35, dixonColesWeight: 0.30 };

  if (competitionType === 'Cup' || isDerby) {
    // 杯赛或德比：降低 Elo，提升 Poisson 和 Dixon-Coles（近期状态）
    weights = { poissonWeight: 0.40, eloWeight: 0.20, dixonColesWeight: 0.40 };
  } else if (competitionType === 'Friendly') {
    // 友谊赛：大幅降低 Elo，提升 Dixon-Coles（低强度赛事更随机）
    weights = { poissonWeight: 0.30, eloWeight: 0.15, dixonColesWeight: 0.55 };
  }

  return weights;
}

export function checkHandicapCoverage(
  homeGoals: number,
  awayGoals: number,
  handicap: number
): { covered: boolean; netGoals: number; requiredMargin: number; reason: string } {
  const netGoals = homeGoals - awayGoals;

  if (handicap === 0) {
    return { covered: true, netGoals, requiredMargin: 0, reason: '平手盘，无需覆盖' };
  }

  if (handicap < 0) {
    const absHandicap = Math.abs(handicap);
    const requiredMargin = Math.ceil(absHandicap);
    const covered = netGoals >= requiredMargin;
    return {
      covered,
      netGoals,
      requiredMargin,
      reason: covered
        ? `预期净胜 ${netGoals.toFixed(2)} 球，足够覆盖主让${absHandicap}球（需净胜≥${requiredMargin}球）`
        : `需要净胜 ≥${requiredMargin} 球才能覆盖主让${absHandicap}球，当前预期净胜 ${netGoals.toFixed(2)} 球`
    };
  }

  if (handicap > 0) {
    const requiredMargin = Math.ceil(handicap);
    const covered = netGoals > -requiredMargin;
    return {
      covered,
      netGoals,
      requiredMargin,
      reason: covered
        ? `预期净胜 ${netGoals.toFixed(2)} 球，主队受让${handicap}球下保持不败，足以覆盖盘口`
        : `预期净负 ${Math.abs(netGoals).toFixed(2)} 球，无法覆盖受让${handicap}球盘口`
    };
  }

  return { covered: false, netGoals, requiredMargin: 0, reason: '未知盘口' };
}

// ==================== 信心信号判定 ====================



export type ConfidenceLevel = 'high' | 'medium' | 'low';



export interface MarketDeviationResult {

  confidence: ConfidenceLevel;

  deviation: number;          // 偏离程度

  oddsProb: { home: number; draw: number; away: number };

  asianProb: { home: number; draw: number; away: number };

  warning: string | null;

}



/**

 * 从亚盘特征计算隐含概�? * @param features 亚盘特征

 * @param resultType 结果类型 (HOME/DRAW/AWAY)

 */

function calculateAsianImpliedProb(

  features: AsianHandicapFeatures,

  resultType: 'HOME' | 'DRAW' | 'AWAY'

): number {

  let baseProb = 0.33;

  

  // 根据盘口判断基础倾向

  if (features.handicapValue < 0) {

    // 主队让球 �?主队更强

    if (resultType === 'HOME') {

      baseProb = 0.45 + Math.abs(features.handicapValue) * 0.1;

    } else if (resultType === 'AWAY') {

      baseProb = 0.25 - Math.abs(features.handicapValue) * 0.05;

    }

  } else if (features.handicapValue > 0) {

    // 客队让球 �?客队更强

    if (resultType === 'AWAY') {

      baseProb = 0.45 + features.handicapValue * 0.1;

    } else if (resultType === 'HOME') {

      baseProb = 0.25 - features.handicapValue * 0.05;

    }

  }



  // 盘口越大，平局概率越低（DRAW 专属调整）

  if (resultType === 'DRAW') {

    const absHcp = Math.abs(features.handicapValue);

    baseProb = Math.max(0.18, 0.32 - absHcp * 0.10);

  }

  

  // 根据水位差调

if (features.waterDiff < -0.05) {

    // 主队水位低，受热

if (resultType === 'HOME') {

      baseProb = Math.min(0.6, baseProb + 0.1);

    } else if (resultType === 'AWAY') {

      baseProb = Math.max(0.2, baseProb - 0.08);

    }

  } else if (features.waterDiff > 0.05) {

    // 主队水位高，受冷

if (resultType === 'HOME') {

      baseProb = Math.max(0.2, baseProb - 0.08);

    } else if (resultType === 'AWAY') {

      baseProb = Math.min(0.6, baseProb + 0.1);

    }

  }

  

  // 根据庄家倾向调整

  if (features.bookmakerBias === 'HOME' && resultType === 'HOME') {

    baseProb = Math.min(0.7, baseProb + 0.08);

  } else if (features.bookmakerBias === 'AWAY' && resultType === 'AWAY') {

    baseProb = Math.min(0.7, baseProb + 0.08);

  }

  

  return Math.max(0.05, Math.min(0.95, baseProb));

}



/**

 * 检查欧赔与亚盘计算出的概率是否出现背离

 */

export function checkMarketDeviation(

  oddsProb: { home: number; draw: number; away: number },

  asianProb: { home: number; draw: number; away: number }

): MarketDeviationResult {

  // 计算各结果的概率差异

  const homeDiff = Math.abs(oddsProb.home - asianProb.home);

  const drawDiff = Math.abs(oddsProb.draw - asianProb.draw);

  const awayDiff = Math.abs(oddsProb.away - asianProb.away);

  

  const maxDeviation = Math.max(homeDiff, drawDiff, awayDiff);

  

  let confidence: ConfidenceLevel = 'high';

  let warning: string | null = null;

  

  // 判断背离程度

  if (maxDeviation > 0.2) {

    confidence = 'low';

    

    // 检查极端背离情

if (oddsProb.home > 0.6 && asianProb.home < 0.4) {

      warning = '欧赔强烈看好主胜，但亚盘数据不支持此判断';

    } else if (oddsProb.away > 0.6 && asianProb.away < 0.4) {

      warning = '欧赔强烈看好客胜，但亚盘数据不支持此判断';

    } else if (oddsProb.draw > 0.5 && asianProb.draw < 0.25) {

      warning = '欧赔看好平局，但亚盘数据不支持此判断';

    } else {

      warning = `市场数据出现显著背离 (偏离�? ${(maxDeviation * 100).toFixed(0)}%)`;

    }

  } else if (maxDeviation > 0.1) {

    confidence = 'medium';

    warning = `市场数据存在轻微背离 (偏离�? ${(maxDeviation * 100).toFixed(0)}%)`;

  }

  

  return {

    confidence,

    deviation: maxDeviation,

    oddsProb,

    asianProb,

    warning

  };

}



// ==================== 亚盘 �?欧赔 折算引擎（保持向后兼容） ====================



export interface Converted1X2 {

  homeOdds: number;

  drawOdds: number;

  awayOdds: number;

  homeProb: number;

  drawProb: number;

  awayProb: number;

}



/**

 * 亚盘 �?欧赔 1X2 折算

 * 基于水位隐含概率 + 盘口→期望进球差 + Poisson/Dixon-Coles 分布

 * @param handicap 让球盘口（负=主队让球，如 -0.5 表示主让半球�? * @param homeWater 主队水位

 * @param awayWater 客队水位

 * @param returnRate 返还率，默认 0.94

 */

export function convertAsianTo1X2(

  handicap: number,

  homeWater: number,

  awayWater: number,

  returnRate: number = 0.94,

  league?: string,

): Converted1X2 {

  // ===== v3.1: Dixon-Coles 概率模型精确转换 =====
  const hI = 1 / homeWater;
  const aI = 1 / awayWater;
  const tI = hI + aI;
  const hStr = (hI / tI) * 2;
  const aStr = (aI / tI) * 2;

  const r = exactAsianTo1X2(handicap, hStr, aStr, league || undefined, returnRate);

  return {
    homeOdds: r.homeOdds,
    drawOdds: r.drawOdds,
    awayOdds: r.awayOdds,
    homeProb: r.homeProb,
    drawProb: r.drawProb,
    awayProb: r.awayProb,
  };
}

export function convert1X2ToAsian(

  homeOdds: number,

  drawOdds: number,

  awayOdds: number,

  league?: string,

  homeAdv?: number,

): AsianHandicapParams {

  // ===== v3.1: Dixon-Coles 二分搜索精确转换 =====
  const r = exact1X2ToAsian(homeOdds, drawOdds, awayOdds, 1.0, 1.0, league || undefined, homeAdv ?? getLeagueHomeAdv(league));

  return {
    handicap: r.handicap,
    homeWater: r.homeWater,
    awayWater: r.awayWater,
  };
}
export function syncMatchToAsianHandicap(matchOdds: {
  home: number;
  draw: number;
  away: number;
}, league?: string, homeAdv?: number): AsianHandicapParams {

  return convert1X2ToAsian(matchOdds.home, matchOdds.draw, matchOdds.away, league, homeAdv);

}



/**

 * 动态计算亚盘：从球队数据和伤停情况计算

 * @param homeTeam 主队

 * @param homeInjuries 主队伤停率（0-1）

 * @param awayInjuries 客队伤停率（0-1）

 */

export function calculateDynamicAsianHandicap(

  homeTeam: TeamStats,

  awayTeam: TeamStats,

  homeInjuries: number = 0,

  awayInjuries: number = 0

): AsianHandicapParams {

  const homeElo = getTeamElo(homeTeam);

  const awayElo = getTeamElo(awayTeam);



  // 获取球队 xG 数据（仅使用基础值，避免双倍计算）

  const homeXG = homeTeam.homeXg;

  const awayXG = awayTeam.awayXg;



  const homeInjuryFactor = Math.max(0.8, 1 - homeInjuries * 0.02);

  const awayInjuryFactor = Math.max(0.8, 1 - awayInjuries * 0.02);



  // 使用新的赔率计算

  const baseOdds = calculateBaseOdds(

    homeElo,

    awayElo,

    Math.max(0.5, homeXG),

    Math.max(0.5, awayXG),

    homeInjuryFactor,

    awayInjuryFactor

  );



  return convert1X2ToAsian(baseOdds.homeOdds, baseOdds.drawOdds, baseOdds.awayOdds, homeTeam.league, getLeagueHomeAdv(homeTeam.league));

}







