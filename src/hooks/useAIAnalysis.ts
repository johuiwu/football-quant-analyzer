import { useState, useCallback, useMemo } from 'react';
import { PredictionResults } from '../utils/quantModel';

// ======================== 类型定义 ========================

export interface RiskAlertType {
  level: 'LOW' | 'MEDIUM' | 'HIGH';
  confidence: number;
  summary: string;
  keyRisks: string[];
}

export interface AIAnalysisResult {
  tacticalSummary: string;
  goalAnalysis: string;
  riskAlert: RiskAlertType;
}

interface CachedAnalysis {
  result: AIAnalysisResult;
  warning: string | null;
  isFallback: boolean;
}

// ======================== 缓存 ========================

const aiCache = new Map<string, CachedAnalysis>();

// ======================== 默认值 ========================

const DEFAULT_RISK_ALERT: RiskAlertType = {
  level: 'MEDIUM',
  confidence: 0.5,
  summary: '暂无风险评估数据',
  keyRisks: [],
};

const DEFAULT_RESULT: AIAnalysisResult = {
  tacticalSummary: '',
  goalAnalysis: '',
  riskAlert: DEFAULT_RISK_ALERT,
};

// ======================== Hook ========================

export function useAIAnalysis() {
  const [result, setResult] = useState<AIAnalysisResult | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [validationWarning, setValidationWarning] = useState<string | null>(null);
  const [isFallback, setIsFallback] = useState<boolean>(false);
  /** API Key 未配置时设为 true，用于触发弹窗 */
  const [needsApiKey, setNeedsApiKey] = useState<boolean>(false);

  const fetchAiAnalysis = useCallback(async (
    homeId: string,
    awayId: string,
    odds: any,
    predictions: PredictionResults,
    extraContext?: { advancedParams?: any; isStatsCustomized?: boolean; customStats?: any }
  ) => {
    setIsLoading(true);
    setResult(null);
    setValidationWarning(null);
    setIsFallback(false);
    setNeedsApiKey(false);

    const cacheKey = `${homeId}_vs_${awayId}`;
    const cached = aiCache.get(cacheKey);
    if (cached) {
      setResult(cached.result);
      setValidationWarning(cached.warning);
      setIsFallback(cached.isFallback);
      setIsLoading(false);
      return;
    }

    try {
      const response = await fetch('/api/ai-analyze-match', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          homeId,
          awayId,
          odds,
          predictions,
          advancedParams: extraContext?.advancedParams,
          isStatsCustomized: extraContext?.isStatsCustomized,
          customStats: extraContext?.isStatsCustomized ? extraContext?.customStats : undefined,
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json();

      if (data.success && data.result) {
        // 新格式：结构化 AI 分析结果
        const analysisResult: AIAnalysisResult = {
          tacticalSummary: data.result.tacticalSummary || '',
          goalAnalysis: data.result.goalAnalysis || '',
          riskAlert: data.result.riskAlert || DEFAULT_RISK_ALERT,
        };

        setResult(analysisResult);
        setIsFallback(!!data.isFallback);

        // 检查是否为 API Key 未配置的降级响应
        if (analysisResult.tacticalSummary.includes('API Key 未配置') ||
            analysisResult.tacticalSummary.includes('API key not configured')) {
          setNeedsApiKey(true);
        }

        // 缓存结果
        aiCache.set(cacheKey, {
          result: analysisResult,
          warning: null, // 校验逻辑移至 ValidationService 外部调用
          isFallback: !!data.isFallback,
        });
      } else if (data.commentary) {
        // 向后兼容：旧格式纯文本 commentary（理论上不会触发，但保留兼容）
        const compatResult: AIAnalysisResult = {
          tacticalSummary: data.commentary,
          goalAnalysis: '',
          riskAlert: DEFAULT_RISK_ALERT,
        };
        setResult(compatResult);

        if (data.commentary.includes('API Key 未配置') || data.commentary.includes('API key not configured')) {
          setNeedsApiKey(true);
        }

        aiCache.set(cacheKey, {
          result: compatResult,
          warning: null,
          isFallback: true,
        });
      } else {
        const errorResult: AIAnalysisResult = {
          ...DEFAULT_RESULT,
          tacticalSummary: data.error || '【⚠️ AI 分析异常】未返回有效分析结果。',
        };
        setResult(errorResult);
        setIsFallback(true);
      }
    } catch (e: any) {
      console.error('AI analysis error:', e);
      const errorResult: AIAnalysisResult = {
        ...DEFAULT_RESULT,
        tacticalSummary: e.message
          ? `【⚠️ 系统异常】无法完成远程 AI 战术推演: ${e.message}`
          : '【⚠️ 系统异常】无法完成远程 AI 战术推演，请检查网络连接或稍后重试。',
      };
      setResult(errorResult);
      setIsFallback(true);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // 稳定的结果对象
  const stableResults = useMemo(() => ({
    hasAnalysis: !!(result?.tacticalSummary),
    hasWarning: !!validationWarning,
    isFallback,
  }), [result, validationWarning, isFallback]);

  return {
    result,           // AIAnalysisResult | null — 结构化分析结果（替代原 analysis）
    isLoading,
    validationWarning,
    needsApiKey,
    isFallback,       // boolean — 是否使用了降级模板
    fetchAiAnalysis,
    ...stableResults,
  };
}
