import { useState, useEffect, useCallback, useMemo } from 'react';
import { TeamStats } from '../data/realTeamsData';
import { getTeams, syncStandings } from '../services/apiService';

export function useTeamDataSync() {
  const [teams, setTeams] = useState<TeamStats[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [syncMessage, setSyncMessage] = useState<string>('正在从服务器加载球队数据...');
  const [syncSource, setSyncSource] = useState<string>('loading');
  const [error, setError] = useState<Error | null>(null);

  const loadTeamsFromApi = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    
    try {
      const response = await getTeams();
      
      // 支持两种格式：1) 直接返回数组 2) 返回 { success, data } 格式
      const teamsData = Array.isArray(response) 
        ? response 
        : ((response as any).data && Array.isArray((response as any).data) ? (response as any).data : null);
      
      if (teamsData && teamsData.length > 0) {
        // 验证 API 数据格式是否兼容 TeamStats 接口
        const firstItem = teamsData[0];
        const hasTeamStatsFields = firstItem && typeof firstItem.id === 'string' && typeof firstItem.league === 'string';
        if (hasTeamStatsFields) {
          setTeams(teamsData);
          setSyncMessage(`✓ 已从数据库加载 ${teamsData.length} 支球队数据`);
          setSyncSource('database');
          console.log(`[useTeamDataSync] 从 /api/teams 加载了 ${teamsData.length} 支球队数据`);
        } else {
          // API 数据格式不兼容（如缺少 id/league 字段）
          setSyncMessage('API 数据格式异常，请检查后端服务');
          setSyncSource('error');
          console.warn('[useTeamDataSync] API数据格式不兼容，缺少 id/league 字段');
        }
      } else {
        setSyncMessage('数据库为空，请先同步积分榜数据');
        setSyncSource('empty');
      }
      
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : '加载失败';
      console.error("[useTeamDataSync] 加载球队数据失败:", err);
      setError(err instanceof Error ? err : new Error(errorMessage));
      setSyncMessage('数据加载失败，请检查后端服务是否正常运行');
      setSyncSource('error');
    } finally {
      setIsLoading(false);
    }
  }, []);

  const loadRealTimeStandings = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    
    try {
      // 默认同步英超，用户可在积分榜页面选择其他联赛
      const data = await syncStandings('EPL');
      
      if (data && data.teams) {
        setTeams(data.teams);
        if (data.msg) {
          setSyncMessage(data.msg);
        } else {
          setSyncMessage('✓ 实时积分榜同步成功');
        }
        setSyncSource(data.source || 'api');
      }
      
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : '同步失败';
      console.error("[useTeamDataSync] 同步积分榜失败:", err);
      setError(err instanceof Error ? err : new Error(errorMessage));
      setSyncMessage("积分榜同步失败，请检查网络连接");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadTeamsFromApi();
  }, [loadTeamsFromApi]);

  const stableTeams = useMemo(() => teams, [teams]);

  return {
    teams: stableTeams,
    isLoading,
    syncMessage,
    syncSource,
    error,
    loadTeamsFromApi,
    loadRealTimeStandings
  };
}