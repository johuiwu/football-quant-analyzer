import { useState, useEffect, useCallback, useMemo } from 'react';
import { REAL_TEAMS } from '../data/realTeamsData';
import { TeamStats } from '../data/realTeamsData';
import { getTeams, syncStandings } from '../services/apiService';

export function useTeamDataSync() {
  const [teams, setTeams] = useState<TeamStats[]>(REAL_TEAMS);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [syncMessage, setSyncMessage] = useState<string>('离线载入：已配置 2026 赛季五大联赛门阀真实多维战绩矩阵');
  const [syncSource, setSyncSource] = useState<string>('preset');
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
        setTeams(teamsData);
        setSyncMessage(`✓ 已从数据库加载 ${teamsData.length} 支球队数据`);
        setSyncSource('database');
        console.log(`[useTeamDataSync] 从 /api/teams 加载了 ${teamsData.length} 支球队数据`);
      } else {
        setSyncMessage('⚠️ 数据库为空，使用内置预设数据');
        setSyncSource('preset');
      }
      
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : '加载失败';
      console.error("[useTeamDataSync] 加载球队数据失败:", err);
      setError(err instanceof Error ? err : new Error(errorMessage));
      setSyncMessage('⚠️ API连接失败，已安全回退至内置高保真名门战势库');
      setSyncSource('preset');
    } finally {
      setIsLoading(false);
    }
  }, []);

  const loadRealTimeStandings = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    
    try {
      const data = await syncStandings();
      
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
      setSyncMessage("⚠️ 同步异常：已安全回退至内置高保真名门战势库");
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