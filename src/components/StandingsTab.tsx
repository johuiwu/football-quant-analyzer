import { useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { LEAGUES, TeamStats } from '../data/realTeamsData';
import { syncStandings } from '../services/apiService';

interface StandingsTabProps {
  activeStandingsLeague: string;
  setActiveStandingsLeague: (id: string) => void;
  teams: TeamStats[];
  isTeamsLoading: boolean;
  teamsSyncMsg: string;
  teamsSyncSource: string;
  loadRealTimeStandings?: () => void;
  onTeamsUpdate: (teams: TeamStats[]) => void;
  onSyncMsgUpdate: (msg: string) => void;
  onSyncSourceUpdate: (src: string) => void;
}

export default function StandingsTab({
  activeStandingsLeague,
  setActiveStandingsLeague,
  teams,
  isTeamsLoading,
  teamsSyncMsg,
  teamsSyncSource,
  loadRealTimeStandings,
  onTeamsUpdate,
  onSyncMsgUpdate,
  onSyncSourceUpdate
}: StandingsTabProps) {
  const [syncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);

  const handleSync = async () => {
    if (syncing) return;
    setSyncing(true);
    setSyncError(null);
    try {
      const data = await syncStandings(activeStandingsLeague);
      if (data && data.teams) {
        onTeamsUpdate(data.teams);
        onSyncMsgUpdate(data.msg || '✔️ 已同步积分榜');
        onSyncSourceUpdate(data.source || 'api');
      }
    } catch (err: any) {
      setSyncError(err.message || '同步失败');
      onSyncMsgUpdate('⚠️ 同步异常：已安全回退至内置高保真名门战势库');
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div className="p-6 bg-[#0F1424] rounded-2xl border border-slate-800 shadow-xl space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800 pb-5">
        <div>
          <h3 className="text-base font-bold text-slate-100 flex items-center gap-2">
            🏆 五大联赛真实量化盘路积分榜 (AI 联网自适应校准)
          </h3>
          <p className="text-xs text-slate-400 mt-1 leading-relaxed">
            提供完整的物理积分、净胜球、得失球和近5场走势表现。支持一键全网 AI 同步以校准最新赛况。
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            disabled={isTeamsLoading || syncing}
            onClick={handleSync}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold tracking-wide transition-all ${
              (isTeamsLoading || syncing) 
                ? 'bg-slate-800 text-slate-500 cursor-not-allowed' 
                : 'bg-[#FF8008] hover:bg-[#FF8008]/90 text-white shadow-lg shadow-orange-950/20'
            }`}
          >
            <RefreshCw className={`w-3.5 h-3.5 ${(isTeamsLoading || syncing) ? 'animate-spin' : ''}`} />
            {syncing ? '正在同步全网赛况...' : isTeamsLoading ? '加载中...' : '联网同步最新积分 (AI)'}
          </button>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 p-3 bg-slate-950/80 border border-slate-850 rounded-xl">
        <div className="flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full ${isTeamsLoading ? 'bg-amber-500 animate-pulse' : 'bg-emerald-500 animate-ping'}`} />
          <span className="text-xs text-slate-300 font-mono">{teamsSyncMsg}</span>
        </div>
        <div className="flex items-center gap-1.5 font-mono">
          <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">数据源:</span>
          <span className="bg-slate-900 px-2 py-0.5 text-[9px] rounded border border-slate-800 text-slate-400 font-bold uppercase tracking-wider">
            {teamsSyncSource === 'google_search_grounding' ? 'WebAI (联网同步)' : 'PRESET (高保真)'}
          </span>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {LEAGUES.map((l) => (
          <button
            key={l.id}
            onClick={() => setActiveStandingsLeague(l.id)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold tracking-wide transition-all ${
              activeStandingsLeague === l.id
                ? 'bg-blue-600 text-white shadow-md border border-blue-500'
                : 'bg-slate-900 text-slate-400 hover:text-slate-200 border border-slate-850'
            }`}
          >
            {l.nameCn} ({l.id})
          </button>
        ))}
      </div>

      <div className="overflow-x-auto rounded-xl border border-slate-850">
        <table className="w-full text-left border-collapse bg-slate-900/40">
          <thead>
            <tr className="border-b border-slate-850 bg-slate-900/80 text-[11px] text-slate-400 font-medium font-sans">
              <th className="py-3 px-4 w-12 text-center">排名</th>
              <th className="py-3 px-4">球队</th>
              <th className="py-3 px-3 text-center">场次</th>
              <th className="py-3 px-3 text-center">胜</th>
              <th className="py-3 px-3 text-center">平</th>
              <th className="py-3 px-3 text-center">负</th>
              <th className="py-3 px-3 text-center">进/失</th>
              <th className="py-3 px-3 text-center">净胜</th>
              <th className="py-3 px-4 text-center text-emerald-400 font-bold">积分</th>
              <th className="py-3 px-4 text-center">近5场</th>
              <th className="py-3 px-4 text-center">零封</th>
              <th className="py-3 px-4 text-right">场均射门 (命中)</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-850 text-xs">
            {teams
              .filter(t => t.league === activeStandingsLeague)
              .map(t => {
                const wins = t.homeStats.wins + t.awayStats.wins;
                const draws = t.homeStats.draws + t.awayStats.draws;
                const losses = t.homeStats.losses + t.awayStats.losses;
                const played = t.homeStats.played + t.awayStats.played;
                const gf = t.homeStats.goalsFor + t.awayStats.goalsFor;
                const ga = t.homeStats.goalsAgainst + t.awayStats.goalsAgainst;
                const gd = gf - ga;
                const points = wins * 3 + draws * 1;
                const displayRank = (t as any).rank && (t as any).rank > 0 ? (t as any).rank : undefined;
                return { team: t, wins, draws, losses, played, gf, ga, gd, points, displayRank };
              })
              .sort((a, b) => {
                if (a.displayRank && b.displayRank) return a.displayRank - b.displayRank;
                return b.points - a.points || b.gd - a.gd || b.gf - a.gf;
              })
              .map((item, idx) => {
                const t = item.team;
                const rankNum = item.displayRank || (idx + 1);
                const formChars = Array.isArray(t.form)
                  ? t.form
                  : (typeof t.form === 'string' ? (t.form as string).split('') : []);
                return (
                  <tr key={t.id} className="hover:bg-slate-800/40 transition-colors">
                    <td className="py-3.5 px-4 text-center">
                      <span className={`inline-flex items-center justify-center w-5 h-5 rounded-full text-[10px] font-bold ${
                        rankNum === 1
                          ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30' 
                          : rankNum === 2
                          ? 'bg-slate-300/20 text-slate-300' 
                          : rankNum === 3
                          ? 'bg-amber-700/20 text-amber-600' 
                          : rankNum < 5
                          ? 'bg-blue-500/10 text-blue-400'
                          : 'text-slate-500'
                      }`}>
                        {rankNum}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 font-semibold text-slate-200">
                      <div className="flex items-center gap-2">
                        <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: (t as any).color || '#3b82f6' }} />
                        <div>
                          <span className="hover:text-blue-400 transition-colors cursor-pointer">{t.nameCn}</span>
                          <span className="block text-[10px] text-slate-500 font-mono font-normal uppercase">{t.id}</span>
                        </div>
                      </div>
                    </td>
                    <td className="py-3.5 px-3 text-center text-slate-300 font-mono">{item.played}</td>
                    <td className="py-3.5 px-3 text-center text-slate-300 font-mono">{item.wins}</td>
                    <td className="py-3.5 px-3 text-center text-slate-300 font-mono">{item.draws}</td>
                    <td className="py-3.5 px-3 text-center text-slate-300 font-mono">{item.losses}</td>
                    <td className="py-3.5 px-3 text-center text-slate-400 font-mono text-[11px]">{item.gf}-{item.ga}</td>
                    <td className="py-3.5 px-3 text-center">
                      <span className={`font-mono font-semibold ${item.gd > 0 ? 'text-emerald-400' : item.gd < 0 ? 'text-rose-400' : 'text-slate-500'}`}>
                        {item.gd > 0 ? `+${item.gd}` : item.gd}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 text-center">
                      <span className="text-emerald-400 font-bold font-mono text-[13px]">{item.points}</span>
                    </td>
                    <td className="py-3.5 px-4 text-center">
                      <div className="inline-flex gap-1">
                        {formChars.map((char, cIdx) => (
                          <span
                            key={cIdx}
                            className={`inline-flex items-center justify-center w-4 h-4 rounded text-[9px] font-bold ${
                              char === 'W' 
                                ? 'bg-emerald-500/25 text-emerald-400 border border-emerald-500/20' 
                                : char === 'D' 
                                ? 'bg-amber-500/20 text-amber-400 border border-amber-500/20' 
                                : 'bg-rose-500/20 text-rose-400 border border-rose-500/20'
                            }`}
                            title={char === 'W' ? '胜 Won' : char === 'D' ? '平 Drew' : '负 Lost'}
                          >
                            {char}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="py-3.5 px-4 text-center text-slate-400 font-mono">{t.cleanSheets}次</td>
                    <td className="py-3.5 px-4 text-right">
                      <div className="font-mono text-slate-300">{t.shotsPerGame}射</div>
                      <div className="text-[10px] text-slate-500 font-mono">命中: {t.shotAccuracy}</div>
                    </td>
                  </tr>
                );
              })}
          </tbody>
        </table>
      </div>
    </div>
  );
}