/**
 * 欧赔计算模块
 * 基于 Elo 评分、xG 差值、伤停等因素计算真实合理的初始欧赔（1X2）
 */

/**
 * 计算真实合理的初始欧赔（1X2）
 * @param homeElo 主队 Elo 评分
 * @param awayElo 客队 Elo 评分
 * @param homeXG 主队预期进球 xG
 * @param awayXG 客队预期进球 xG
 * @param injuryFactorHome 主队伤停折损因子 (0.8-1.0)
 * @param injuryFactorAway 客队伤停折损因子 (0.8-1.0)
 * @returns 1X2 欧赔对象
 */
export function calculateBaseOdds(
  homeElo: number,
  awayElo: number,
  homeXG: number,
  awayXG: number,
  injuryFactorHome: number,
  injuryFactorAway: number
): { homeOdds: number; drawOdds: number; awayOdds: number } {
  const returnRate = 0.94;

  // 1. 基于 Elo + xG 计算综合实力指数（xG 权重提升以扩大球队差距）
  const homeStrength = homeElo / 100 + homeXG * 2.5;
  const awayStrength = awayElo / 100 + awayXG * 2.5;

  // 2. 先算平局概率 — 实力越接近平局越高
  const strengthGap = Math.abs(homeStrength - awayStrength) / Math.max(homeStrength + awayStrength, 1);
  const drawProb = Math.max(0.15, Math.min(0.35, 0.30 - strengthGap * 1.0));

  // 3. 剩余概率按实力比分配给主客胜
  const remaining = 1 - drawProb;
  const homeRaw = homeStrength * injuryFactorHome;
  const awayRaw = awayStrength * injuryFactorAway;
  const totalRaw = homeRaw + awayRaw;

  let homeWinProb = (homeRaw / totalRaw) * remaining;
  let awayWinProb = (awayRaw / totalRaw) * remaining;

  // 4. 概率边界保护
  homeWinProb = Math.max(0.05, Math.min(0.85, homeWinProb));
  awayWinProb = Math.max(0.05, Math.min(0.85, awayWinProb));

  // 5. 归一化确保和为 1
  const sum = homeWinProb + drawProb + awayWinProb;
  const h = homeWinProb / sum;
  const d = drawProb / sum;
  const a = awayWinProb / sum;

  // 6. 转换回欧赔 (94% 返还率)
  const homeOdds = returnRate / h;
  const drawOdds = returnRate / d;
  const awayOdds = returnRate / a;

  // 7. 返还率精确校准
  const impH = 1 / homeOdds;
  const impD = 1 / drawOdds;
  const impA = 1 / awayOdds;
  const totalImp = impH + impD + impA;
  const actualRate = 1 / totalImp;

  let finalHome = homeOdds;
  let finalDraw = drawOdds;
  let finalAway = awayOdds;

  if (Math.abs(actualRate - returnRate) > 0.001) {
    const adj = actualRate / returnRate;
    finalHome *= adj;
    finalDraw *= adj;
    finalAway *= adj;
  }

  return {
    homeOdds: Math.round(finalHome * 100) / 100,
    drawOdds: Math.round(finalDraw * 100) / 100,
    awayOdds: Math.round(finalAway * 100) / 100,
  };
}

/**
 * 计算隐含概率
 * @param odds 欧赔
 * @returns 隐含概率
 */
export function impliedProbability(odds: number): number {
  return 1 / odds;
}

/**
 * 计算一组1X2欧赔的隐含概率分布与总概率
 * @param homeOdds 主胜赔率
 * @param drawOdds 平局赔率
 * @param awayOdds 客胜赔率
 * @returns 包含归一化后的概率分布和原始总概率
 */
export function calculateImpliedProbability(
  homeOdds: number,
  drawOdds: number,
  awayOdds: number
): { homeProb: number; drawProb: number; awayProb: number; total: number } {
  const homeProb = 1 / homeOdds;
  const drawProb = 1 / drawOdds;
  const awayProb = 1 / awayOdds;
  const total = homeProb + drawProb + awayProb;
  return { homeProb, drawProb, awayProb, total };
}

/**
 * 计算返还率
 * @param homeOdds 主胜赔率
 * @param drawOdds 平局赔率
 * @param awayOdds 客胜赔率
 * @returns 返还率（0-1）
 */
export function calculateReturnRate(
  homeOdds: number,
  drawOdds: number,
  awayOdds: number
): number {
  const total = impliedProbability(homeOdds) +
                impliedProbability(drawOdds) +
                impliedProbability(awayOdds);
  return 1 / total;
}

