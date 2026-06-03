import { useState, useEffect, useCallback, useMemo, useRef } from 'react';

interface RiskAlert {
  id: number;
  type: 'line_change' | 'lineup_issue' | 'injury_alert';
  severity: 'high' | 'medium' | 'low';
  message: string;
  timestamp: Date;
}

export function useRiskAlerts() {
  const [alerts, setAlerts] = useState<RiskAlert[]>([]);
  const [wsConnected, setWsConnected] = useState(false);
  const timeoutRef = useRef<Map<number, NodeJS.Timeout>>(new Map());

  const addRiskAlert = useCallback((alert: Omit<RiskAlert, 'id' | 'timestamp'>) => {
    const id = Date.now();
    const newAlert: RiskAlert = {
      ...alert,
      id,
      timestamp: new Date()
    };
    setAlerts(prev => [...prev, newAlert]);
    
    // 清理旧的超时计时器
    const timeoutId = setTimeout(() => {
      setAlerts(prev => prev.filter(a => a.id !== id));
      timeoutRef.current.delete(id);
    }, 120000);
    
    timeoutRef.current.set(id, timeoutId);
  }, []);

  const clearRiskAlert = useCallback((id: number) => {
    const timeout = timeoutRef.current.get(id);
    if (timeout) {
      clearTimeout(timeout);
      timeoutRef.current.delete(id);
    }
    setAlerts(prev => prev.filter(a => a.id !== id));
  }, []);

  const mockWebSocketInit = useCallback(() => {
    setWsConnected(true);
    
    const interval = setInterval(() => {
      if (Math.random() > 0.98) {
        const alertTypes = [
          { type: 'line_change' as const, severity: 'high' as const, message: '⚠️ 盘口突变：从受让0.25变为受让0.5' },
          { type: 'line_change' as const, severity: 'medium' as const, message: '⚠️ 水位波动剧烈：超过0.05' },
          { type: 'lineup_issue' as const, severity: 'medium' as const, message: '⚠️ 首发异常：主力前锋未进大名单' },
        ];
        const randomAlert = alertTypes[Math.floor(Math.random() * alertTypes.length)];
        addRiskAlert(randomAlert);
      }
    }, 10000);
    
    return () => clearInterval(interval);
  }, [addRiskAlert]);

  useEffect(() => {
    const cleanup = mockWebSocketInit();
    // 组件卸载时清理所有计时器
    return () => {
      timeoutRef.current.forEach(timeout => clearTimeout(timeout));
      timeoutRef.current.clear();
      cleanup();
    };
  }, [mockWebSocketInit]);

  // 提供稳定的 alerts 引用
  const stableAlerts = useMemo(() => alerts, [alerts]);

  // 计算统计信息
  const stats = useMemo(() => ({
    count: alerts.length,
    hasHighSeverity: alerts.some(alert => alert.severity === 'high'),
  }), [alerts]);

  return {
    alerts: stableAlerts,
    wsConnected,
    addRiskAlert,
    clearRiskAlert,
    ...stats
  };
}
