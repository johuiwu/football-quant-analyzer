import { describe, test, expect } from 'vitest';
import { ValidationService } from '../services/ValidationService';

// 创建模拟的预测结果
const createMockResults = (overrides: Partial<any> = {}) => ({
  compHomeWin: 0.45,
  compAwayWin: 0.30,
  expectedHomeGoals: 1.8,
  expectedAwayGoals: 1.2,
  overUnderProb: [
    { line: 2.5, over: 0.45, under: 0.55 }
  ],
  ...overrides
});

describe('ValidationService', () => {
  describe('validateAIAnalysis', () => {
    test('应在 AI 分析只提到主胜且模型胜率较低时返回警告', () => {
      const analysis = '主胜稳了，主队很强势';
      const results = createMockResults({ compHomeWin: 0.30 });
      
      const warning = ValidationService.validateAIAnalysis(analysis, results);
      
      expect(warning).not.toBeNull();
      expect(warning?.includes('模型主胜率')).toBe(true);
    });

    test('应在 AI 分析只提到客胜且模型胜率较低时返回警告', () => {
      const analysis = '客胜肯定没问题';
      const results = createMockResults({ compAwayWin: 0.20 });
      
      const warning = ValidationService.validateAIAnalysis(analysis, results);
      
      expect(warning).not.toBeNull();
      expect(warning?.includes('模型客胜率')).toBe(true);
    });

    test('应在 AI 分析提到大球但模型预测小球概率高时返回警告', () => {
      const analysis = '大球一定有，进球大战';
      const results = createMockResults({
        expectedHomeGoals: 1.0,
        expectedAwayGoals: 0.8,
        overUnderProb: [
          { line: 2.5, over: 0.30, under: 0.70 }
        ]
      });
      
      const warning = ValidationService.validateAIAnalysis(analysis, results);
      
      expect(warning).not.toBeNull();
      expect(warning?.includes('大球')).toBe(true);
    });

    test('应在 AI 分析提到小球但模型预测大球概率高时返回警告', () => {
      const analysis = '小球，防守大战';
      const results = createMockResults({
        expectedHomeGoals: 2.5,
        expectedAwayGoals: 2.0,
        overUnderProb: [
          { line: 2.5, over: 0.65, under: 0.35 }
        ]
      });
      
      const warning = ValidationService.validateAIAnalysis(analysis, results);
      
      expect(warning).not.toBeNull();
      expect(warning?.includes('小球')).toBe(true);
    });

    test('应在分析和模型预测一致时不返回警告', () => {
      const analysis = '主胜概率约 45%，平局也有可能';
      const results = createMockResults({ compHomeWin: 0.45 });
      
      const warning = ValidationService.validateAIAnalysis(analysis, results);
      
      expect(warning).toBeNull();
    });
  });

  describe('checkAbnormalParams', () => {
    test('应在伤病率异常高时返回 true', () => {
      const isAbnormal = ValidationService.checkAbnormalParams({
        homeFatigue: 1,
        awayFatigue: 1,
        homeInjuries: 25,
        awayInjuries: 3
      });
      
      expect(isAbnormal).toBe(true);
    });

    test('应在疲劳程度异常高时返回 true', () => {
      const isAbnormal = ValidationService.checkAbnormalParams({
        homeFatigue: 7,
        awayFatigue: 1,
        homeInjuries: 3,
        awayInjuries: 3
      });
      
      expect(isAbnormal).toBe(true);
    });

    test('应在自定义权重异常时返回 true', () => {
      const isAbnormal = ValidationService.checkAbnormalParams(
        {
          homeFatigue: 1,
          awayFatigue: 1,
          homeInjuries: 3,
          awayInjuries: 3
        },
        { odds: 0.10, strength: 0.05, homeAway: 0.45, h2h: 0.35, form: 0.05 }
      );
      
      expect(isAbnormal).toBe(true);
    });

    test('应在所有参数正常时返回 false', () => {
      const isAbnormal = ValidationService.checkAbnormalParams({
        homeFatigue: 1,
        awayFatigue: 1,
        homeInjuries: 3,
        awayInjuries: 3
      });
      
      expect(isAbnormal).toBe(false);
    });
  });
});
