import { PredictionResults, AdvancedParams, ModelWeights } from '../utils/quantModel';

export class ValidationService {
  static validateAIAnalysis(analysis: string, results: PredictionResults): string | null {
    const warnings: string[] = [];

    if (analysis.includes('主胜') && !analysis.includes('平局') && !analysis.includes('客胜')) {
      if (results.compHomeWin < 0.45) {
        warnings.push(`⚠️ 模型主胜率仅为 ${(results.compHomeWin * 100).toFixed(1)}%，AI推荐可能过于乐观（偏差 +${((0.45 - results.compHomeWin) * 100).toFixed(1)}%）`);
      }
    }

    if (analysis.includes('客胜') && !analysis.includes('平局') && !analysis.includes('主胜')) {
      if (results.compAwayWin < 0.45) {
        warnings.push(`⚠️ 模型客胜率仅为 ${(results.compAwayWin * 100).toFixed(1)}%，AI推荐可能过于乐观（偏差 +${((0.45 - results.compAwayWin) * 100).toFixed(1)}%）`);
      }
    }

    if ((analysis.includes('大球') || analysis.includes('多进球') || analysis.includes('进球大战')) && 
        (results.expectedHomeGoals + results.expectedAwayGoals < 2.5)) {
      warnings.push(`⚠️ 模型预期总进球仅为 ${(results.expectedHomeGoals + results.expectedAwayGoals).toFixed(2)}，小球概率 ${(results.overUnderProb.find(p => p.line === 2.5)?.under * 100 || 0).toFixed(1)}%，AI对大球判断存疑`);
    }

    if ((analysis.includes('小球') || analysis.includes('少进球') || analysis.includes('防守大战')) && 
        (results.expectedHomeGoals + results.expectedAwayGoals > 2.8)) {
      warnings.push(`⚠️ 模型预期总进球为 ${(results.expectedHomeGoals + results.expectedAwayGoals).toFixed(2)}，大球概率 ${(results.overUnderProb.find(p => p.line === 2.5)?.over * 100 || 0).toFixed(1)}%，AI对小球判断存疑`);
    }

    const winMatch = analysis.match(/(\d+(?:\.\d+)?)%.*胜/);
    if (winMatch) {
      const aiWinPercent = parseFloat(winMatch[1]);
      if (Math.abs(aiWinPercent - results.compHomeWin * 100) > 15) {
        warnings.push(`⚠️ AI提及胜率 ${aiWinPercent}%，与模型计算值 ${(results.compHomeWin * 100).toFixed(1)}% 存在显著偏差（${(Math.abs(aiWinPercent - results.compHomeWin * 100)).toFixed(1)}%）`);
      }
    }

    return warnings.length > 0 ? warnings.join(' | ') : null;
  }

  static checkAbnormalParams(params: AdvancedParams, weights?: ModelWeights): boolean {
    let isAbnormal = false;
    
    if (params.homeInjuries > 20 || params.awayInjuries > 20) {
      isAbnormal = true;
    }
    
    if (params.homeFatigue > 5 || params.awayFatigue > 5) {
      isAbnormal = true;
    }
    
    if (weights) {
      if (Math.abs(weights.odds - 0.45) > 0.2 || 
          Math.abs(weights.strength - 0.30) > 0.2) {
        isAbnormal = true;
      }
    }
    
    return isAbnormal;
  }
}
