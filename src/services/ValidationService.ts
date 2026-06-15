import { PredictionResults, AdvancedParams, ModelWeights } from '../utils/quantModel';
import { AIAnalysisResult } from '../hooks/useAIAnalysis';

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

  static validateStructuredAnalysis(result: AIAnalysisResult, predictions: PredictionResults): string | null {
    const warnings: string[] = [];

    // 1. 对 riskAlert.confidence 与模型预测概率做交叉校验
    if (result.riskAlert?.confidence != null) {
      const maxProb = Math.max(predictions.compHomeWin, predictions.compDraw, predictions.compAwayWin);
      // 如果模型最高概率很高但 AI 置信度很低，说明 AI 对模型结论有疑虑
      if (maxProb > 0.7 && result.riskAlert.confidence < 0.5) {
        warnings.push(`⚠️ 模型最高概率 ${(maxProb * 100).toFixed(1)}%，但 AI 置信度仅 ${(result.riskAlert.confidence * 100).toFixed(0)}%，存在重大分歧`);
      }
      // 如果模型概率分散但 AI 置信度很高，说明 AI 可能过度自信
      if (maxProb < 0.45 && result.riskAlert.confidence > 0.8) {
        warnings.push(`⚠️ 模型预测分散（最高 ${(maxProb * 100).toFixed(1)}%），但 AI 置信度高达 ${(result.riskAlert.confidence * 100).toFixed(0)}%，可能过度自信`);
      }
    }

    // 2. 对 tacticalSummary 中的数值引用与 quantitativeData 做偏差检测
    const combinedText = `${result.tacticalSummary} ${result.goalAnalysis}`;

    // 检测 AI 提及的胜率百分比与模型偏差
    const winMatch = combinedText.match(/(\d+(?:\.\d+)?)%.*胜/);
    if (winMatch) {
      const aiWinPercent = parseFloat(winMatch[1]);
      const modelHomeWin = predictions.compHomeWin * 100;
      const modelAwayWin = predictions.compAwayWin * 100;
      if (Math.abs(aiWinPercent - modelHomeWin) > 15 && Math.abs(aiWinPercent - modelAwayWin) > 15) {
        warnings.push(`⚠️ AI提及胜率 ${aiWinPercent}%，与模型主胜 ${modelHomeWin.toFixed(1)}%/客胜 ${modelAwayWin.toFixed(1)}% 均存在显著偏差`);
      }
    }

    // 检测大球/小球判断与模型偏差
    if ((combinedText.includes('大球') || combinedText.includes('多进球') || combinedText.includes('进球大战')) &&
        (predictions.expectedHomeGoals + predictions.expectedAwayGoals < 2.5)) {
      warnings.push(`⚠️ 模型预期总进球仅为 ${(predictions.expectedHomeGoals + predictions.expectedAwayGoals).toFixed(2)}，AI对大球判断存疑`);
    }

    if ((combinedText.includes('小球') || combinedText.includes('少进球') || combinedText.includes('防守大战')) &&
        (predictions.expectedHomeGoals + predictions.expectedAwayGoals > 2.8)) {
      warnings.push(`⚠️ 模型预期总进球为 ${(predictions.expectedHomeGoals + predictions.expectedAwayGoals).toFixed(2)}，AI对小球判断存疑`);
    }

    // 3. 检测 riskAlert.level 与模型风险评级的一致性
    if (result.riskAlert?.level) {
      const modelRiskHigh = predictions.upsetLevel === 'HIGH' || predictions.coldUpsetAlert;
      if (result.riskAlert.level === 'LOW' && modelRiskHigh) {
        warnings.push(`⚠️ AI风险等级为 LOW，但模型检测到冷门预警（${predictions.upsetLevel}），风险评估可能不足`);
      }
      if (result.riskAlert.level === 'HIGH' && !modelRiskHigh && predictions.compHomeWin > 0.6) {
        warnings.push(`⚠️ AI风险等级为 HIGH，但模型主胜概率高达 ${(predictions.compHomeWin * 100).toFixed(1)}%，风险评级可能偏高`);
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
