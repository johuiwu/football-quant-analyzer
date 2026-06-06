import { useState, useCallback, useMemo } from 'react';
import { REAL_FIXTURES } from '../data/realTeamsData';

const API_BASE = import.meta.env.VITE_API_BASE || '';

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
      // Step 1: 尝试从后端 qiumiwu 爬虫获取实时赛程数据
      const response = await fetch(`${API_BASE}/api/qiumiwu-fixtures`, {
        method: 'GET',
        headers: { 'Accept': 'application/json' },
        signal: AbortSignal.timeout(60000) // 60秒超时（Puppeteer爬虫需要较长时间）
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const result = await response.json();

      if (result.fixtures && result.fixtures.length > 0) {
        setFixtures(result.fixtures);
        setSyncMessage(result.msg || `已加载 ${result.fixtures.length} 场实时赛程数据`);
        setSyncSource(result.source || 'google_search_grounding');
      } else {
        // 爬取成功但无数据，回退到本地预设
        if (REAL_FIXTURES.length > 0) {
          setFixtures([...REAL_FIXTURES]);
          setSyncMessage(`实时赛程为空，回退至 ${REAL_FIXTURES.length} 场预设赛事数据`);
        } else {
          setSyncMessage(result.msg || '暂无赛程数据');
        }
        setSyncSource('local-preset');
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : '加载失败';
      console.error('[useFixtureSync] 联网刷新失败:', err);

      // Step 2: 联网失败，回退到本地预设
      if (REAL_FIXTURES.length > 0) {
        setFixtures([...REAL_FIXTURES]);
        setSyncMessage(`联网刷新超时，已回退至 ${REAL_FIXTURES.length} 场预设赛事数据`);
        setSyncSource('local-preset');
      } else {
        setSyncMessage('暂无预设赛事数据，请手动配置对阵队伍');
        setSyncSource('local-preset');
      }
      setError(err instanceof Error ? err : new Error(errorMessage));
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
