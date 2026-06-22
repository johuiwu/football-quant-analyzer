import React, { useState } from 'react';
import { RefreshCw, Database } from 'lucide-react';
import { syncWorldCupTeams } from '../services/apiService';
import { useAppStore } from '../store/useAppStore';
import { useWorldCupStore } from '../store/useWorldCupStore';
import { WORLD_CUP_TEAMS, WorldCupTeam } from '../data/worldcup_data';

export function WorldCupSyncButton() {
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState('');
  const teams = useAppStore((s) => s.teams);
  const setTeams = useAppStore((s) => s.setTeams);
  const setTeamsSyncMsg = useAppStore((s) => s.setTeamsSyncMsg);
  const setTeamsSyncSource = useAppStore((s) => s.setTeamsSyncSource);
  const setWcTeams = useWorldCupStore((s) => s.setTeams);

  const handleSync = async () => {
    const apiKey = localStorage.getItem('football_api_key');
    if (!apiKey) {
      const key = prompt('请输入您的 API-Football Key（api-football.com 注册获取，免费层即可）');
      if (!key) return;
      localStorage.setItem('football_api_key', key);
    }

    setIsSyncing(true);
    setSyncMsg('正在从 API-Football 同步世界杯球队数据（约需30秒）...');
    try {
      const storedKey = localStorage.getItem('football_api_key') || '';
      const result = await syncWorldCupTeams(storedKey);
      if (result.success && result.teams && result.teams.length > 0) {
        // 合并到现有球队中，只替换世界杯球队，保留其他联赛
        const nonWc = teams.filter(t => t.league !== 'WorldCup');
        const syncedIds = new Set(result.teams.map(t => t.id));
        const existingWc = teams.filter(t => t.league === 'WorldCup' && !syncedIds.has(t.id));
        setTeams([...nonWc, ...existingWc, ...result.teams]);
        // Also update WorldCupStore so the WorldCup page reflects synced data
        const existingWcMap = new Map<string, WorldCupTeam>(WORLD_CUP_TEAMS.map(t => [t.id, t]));
        const wcTeams: WorldCupTeam[] = result.teams.map((t: any) => {
          const existing = existingWcMap.get(t.id);
          return {
            id: t.id,
            name: t.name,
            nameCn: t.nameCn || existing?.nameCn || t.name,
            fifaRank: existing?.fifaRank ?? 50,
            continent: existing?.continent ?? '',
            elo: existing?.elo ?? 1500,
            weight: existing?.weight ?? 1.0,
          };
        });
        setWcTeams(wcTeams);
        setSyncMsg(`✓ ${result.msg}（共 ${result.count} 支球队）`);
        setTeamsSyncMsg(result.msg);
        setTeamsSyncSource('api-football');
      } else {
        setSyncMsg('⚠️ 同步失败：未获取到球队数据');
      }
    } catch (err: any) {
      let msg = err.message || '';
      // 尝试从后端返回的 JSON 错误中提取 msg
      const jsonMatch = msg.match(/\{"success":false,"msg":"([^"]+)"/);
      if (jsonMatch) msg = jsonMatch[1];
      if (msg.includes('401') || msg.includes('403')) {
        setSyncMsg('⚠️ API Key 无效，请在 api-football.com 检查您的 Key');
      } else if (msg.includes('429')) {
        setSyncMsg('⚠️ API 请求频率超限，请等待1分钟后重试');
      } else if (msg.includes('Failed to fetch') || msg.includes('NetworkError')) {
        setSyncMsg('⚠️ 无法连接后端，请确认 npm run dev 正在运行中');
      } else if (msg.includes('获取球队列表失败')) {
        setSyncMsg('⚠️ API-Football 调用失败，可能是 API Key 无效或免费层次数已用完');
      } else if (msg.includes('timeout') || msg.includes('abort')) {
        setSyncMsg('⚠️ 同步超时（后端调用 API-Football 33次耗时过长），请稍后重试');
      } else {
        setSyncMsg(`⚠️ 同步失败：${msg.slice(0, 100)}`);
      }
    } finally {
      setIsSyncing(false);
    }
  };

  return (
    <div className="mb-4 bg-blue-900/20 p-3 rounded-xl border border-blue-800/40">
      <div className="flex items-center gap-2 mb-1.5">
        <Database className="w-3.5 h-3.5 text-blue-400 shrink-0" />
        <span className="text-[11px] font-semibold text-blue-300">世界杯数据同步</span>
      </div>
      <p className="text-[10px] text-slate-400 mb-2">
        通过后端代理连接 API-Football，获取世界杯球队实时统计数据
      </p>
      <button
        onClick={handleSync}
        disabled={isSyncing}
        className="w-full flex items-center justify-center gap-1.5 bg-blue-600 hover:bg-blue-500 disabled:bg-blue-800/50 text-xs font-semibold py-2 px-4 rounded-lg transition-all"
      >
        <RefreshCw className={`w-3 h-3 ${isSyncing ? 'animate-spin' : ''}`} />
        {isSyncing ? '同步中（约需30秒）...' : '从 API-Football 同步数据'}
      </button>
      {syncMsg && (
        <p className={`mt-1.5 text-[10px] ${syncMsg.startsWith('✓') ? 'text-emerald-400' : syncMsg.startsWith('⚠') ? 'text-yellow-400' : 'text-slate-400'}`}>
          {syncMsg}
        </p>
      )}
    </div>
  );
}
