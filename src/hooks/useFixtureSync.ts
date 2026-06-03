import { useState, useCallback, useMemo } from 'react';
import { REAL_FIXTURES } from '../data/realTeamsData';

export function useFixtureSync() {
  const [fixtures, setFixtures] = useState<any[]>(REAL_FIXTURES);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [syncMessage, setSyncMessage] = useState<string>(
    REAL_FIXTURES.length > 0
      ? `已加载 ${REAL_FIXTURES.length} 场预设赛事数据`
      : '暂无预设赛事，请手动配置对阵队伍'
  );
  const [syncSource, setSyncSource] = useState<string>('local-preset');
  const [error, setError] = useState<Error | null>(null);

  const loadRealTimeFixtures = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    
    try {
      // 从本地预设数据源加载赛程（不再依赖外部 API）
      if (REAL_FIXTURES.length > 0) {
        setFixtures([...REAL_FIXTURES]);
        setSyncMessage(`已加载 ${REAL_FIXTURES.length} 场预设赛事数据`);
        setSyncSource('local-preset');
      } else {
        setSyncMessage('暂无预设赛事数据，请手动配置对阵队伍');
        setSyncSource('local-preset');
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : '加载失败';
      console.error('[useFixtureSync] 加载赛事失败:', err);
      setError(err instanceof Error ? err : new Error(errorMessage));
      setSyncMessage('加载异常：已安全回退至本地赛事库');
    } finally {
      setIsLoading(false);
    }
  }, []);

  const stableFixtures = useMemo(() => fixtures, [fixtures]);

  return {
    fixtures: stableFixtures,
    isLoading,
    syncMessage,
    syncSource,
    error,
    loadRealTimeFixtures
  };
}
