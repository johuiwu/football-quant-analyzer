import { useState, useCallback, useMemo } from 'react';
import { ValidationService } from '../services/ValidationService';
import { PredictionResults } from '../utils/quantModel';

export function useAIAnalysis() {
  const [analysis, setAnalysis] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [validationWarning, setValidationWarning] = useState<string | null>(null);
  /** API Key 未配置时设为 true，用于触发弹窗 */
  const [needsApiKey, setNeedsApiKey] = useState<boolean>(false);

  const fetchAiAnalysis = useCallback(async (homeId: string, awayId: string, odds: any, predictions: PredictionResults) => {
    setIsLoading(true);
    setAnalysis(null);
    setValidationWarning(null);
    setNeedsApiKey(false);

    try {
      const response = await fetch('/api/ai-analyze-match', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          homeId,
          awayId,
          odds,
          predictions
        }),
      });
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      
      const data = await response.json();
      if (data.success && data.commentary) {
        setAnalysis(data.commentary);
        
        const warning = ValidationService.validateAIAnalysis(data.commentary, predictions);
        setValidationWarning(warning);
      } else if (data.commentary) {
        // 服务器返回了未配置 API Key 的提示
        if (data.commentary.includes('API Key 未配置') || data.commentary.includes('API key not configured')) {
          setNeedsApiKey(true);
        }
        setAnalysis(data.commentary);
      } else {
        setAnalysis(data.error || '【⚠️ AI 分析异常】未返回有效分析结果。');
      }
    } catch (e: any) {
      console.error('AI analysis error:', e);
      if (e.message) {
        setAnalysis(`【⚠️ 系统异常】无法完成远程 AI 战术推演: ${e.message}`);
      } else {
        setAnalysis('【⚠️ 系统异常】无法完成远程 AI 战术推演，请检查网络连接或稍后重试。');
      }
    } finally {
      setIsLoading(false);
    }
  }, []);

  // 稳定的结果对象
  const stableResults = useMemo(() => ({
    hasAnalysis: !!analysis,
    hasWarning: !!validationWarning,
  }), [analysis, validationWarning]);

  return {
    analysis,
    isLoading,
    validationWarning,
    needsApiKey,
    fetchAiAnalysis,
    ...stableResults
  };
}
