import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { CalendarDays, Trophy, Cpu, Loader2, AlertCircle, RefreshCw } from 'lucide-react';
import { useWorldCupStore, WorldCupPrediction, WorldCupGroupProb } from "../store/useWorldCupStore";
import { WORLD_CUP_TEAMS, WorldCupTeam, WorldCupFixture, worldcupTeamIdToName, WORLD_CUP_FIXTURES_2026 } from "../data/worldcup_data";
import { getTeamStats } from "../data/worldcup_team_stats";
import { ErrorBoundary } from "../components/ErrorBoundary";

type TabKey = 'schedule' | 'sandbox' | 'teams' | 'stages';

const TABS: { key: TabKey; label: string; icon: typeof CalendarDays }[] = [
  { key: 'schedule', label: '2026赛程', icon: CalendarDays },
  { key: 'sandbox', label: '沙盘', icon: Cpu },
  { key: 'teams', label: '球队战绩', icon: Trophy },
  { key: 'stages', label: '积分榜', icon: Trophy },
];

const GROUP_LETTERS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L'];

function fmtProb(v: number): string {
  return `${(v * 100).toFixed(0)}%`;
}

function fmtWinProb(v: number): string {
  return `${(v * 100).toFixed(0)}%`;
}

function PlaceholderTab({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-slate-500">
      <AlertCircle className="w-12 h-12 mb-4 text-slate-600" />
      <span className="text-base">{message}</span>
    </div>
  );
}

type ScheduleFilter = 'all' | 'played' | 'upcoming' | 'week';

const FILTERS: { key: ScheduleFilter; label: string }[] = [
  { key: 'all', label: '全部' },
  { key: 'played', label: '已赛' },
  { key: 'upcoming', label: '未赛' },
  { key: 'week', label: '本周' },
];

function ScheduleTab() {
  const fixtures = useWorldCupStore((s) => s.fixtures);
  const [scheduleData, setScheduleData] = useState<Record<string, { completed: boolean; stats: any }>>({});
  const [dateFilter, setDateFilter] = useState<ScheduleFilter>('all');
  const [refreshing, setRefreshing] = useState(false);

  const loadScheduleData = useCallback(async () => {
    setRefreshing(true);
    try {
      const res = await fetch('/api/worldcup/schedule-scores');
      const data = await res.json();
      if (data.success && data.fixtures) {
        const map: Record<string, { completed: boolean; stats: any }> = {};
        for (const f of data.fixtures) {
          map[f.id] = { completed: f.completed, stats: f.stats };
        }
        setScheduleData(map);
      }
    } catch {
      // ignore
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadScheduleData();
  }, [loadScheduleData]);

  const weekStart = new Date();
  weekStart.setDate(weekStart.getDate() - weekStart.getDay());
  const weekStartStr = weekStart.toISOString().slice(0, 10);
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 6);
  const weekEndStr = weekEnd.toISOString().slice(0, 10);

  const filtered = useMemo(() => {
    return fixtures.filter(f => {
      const info = scheduleData[f.id];
      const completed = info?.completed ?? false;
      switch (dateFilter) {
        case 'played': return completed;
        case 'upcoming': return !completed;
        case 'week': return f.date >= weekStartStr && f.date <= weekEndStr;
        default: return true;
      }
    });
  }, [fixtures, scheduleData, dateFilter, weekStartStr, weekEndStr]);

  const groupedByDate = useMemo(() => {
    const map: Record<string, WorldCupFixture[]> = {};
    for (const f of filtered) {
      if (!map[f.date]) map[f.date] = [];
      map[f.date].push(f);
    }
    return Object.entries(map).sort(([a], [b]) => a.localeCompare(b));
  }, [filtered]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <CalendarDays className="w-4 h-4 text-amber-400" />
          <span className="text-sm font-medium text-slate-300">2026赛程</span>
        </div>
        <div className="flex gap-1">
          {FILTERS.map(f => (
            <button
              key={f.key}
              onClick={() => setDateFilter(f.key)}
              className={`px-3 py-1 text-xs font-medium rounded-lg transition-all ${
                dateFilter === f.key
                  ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50 border border-transparent'
              }`}
            >
              {f.label}
            </button>
          ))}
          <button
            onClick={loadScheduleData}
            disabled={refreshing}
            className="flex items-center gap-1.5 px-3 py-1 text-xs font-medium rounded-lg bg-slate-800 text-slate-300 hover:bg-slate-700 transition-colors disabled:opacity-50 ml-2"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
            {refreshing ? '更新中...' : '更新比分'}
          </button>
        </div>
      </div>
      {groupedByDate.length === 0 ? (
        <div className="text-center py-20 text-slate-500">暂无匹配赛程</div>
      ) : (
        groupedByDate.map(([date, dateFixtures]) => (
          <div key={date}>
            <div className="flex items-center gap-2 mb-3">
              <div className="w-2 h-2 rounded-full bg-amber-500" />
              <span className="text-sm font-semibold text-slate-300">{date}</span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {dateFixtures.map((fixture) => {
                const homeInfo = worldcupTeamIdToName[fixture.homeTeam];
                const awayInfo = worldcupTeamIdToName[fixture.awayTeam];
                const homeName = homeInfo?.cn ?? fixture.homeTeam;
                const awayName = awayInfo?.cn ?? fixture.awayTeam;
                const homeFlag = homeInfo?.flag ?? '';
                const awayFlag = awayInfo?.flag ?? '';
                const isTbd = fixture.homeTeam.startsWith('tbd') || fixture.awayTeam.startsWith('tbd');
                const info = scheduleData[fixture.id];
                const completed = info?.completed ?? false;
                const stats = info?.stats ?? null;

                return (
                  <div key={fixture.id} className={`bg-slate-900/50 border rounded-xl p-4 transition-colors ${completed ? 'border-emerald-800/40' : 'border-slate-800 hover:border-slate-700'}`}>
                    <div className="flex items-center justify-between text-xs text-slate-500 mb-2">
                      <span>{fixture.time}</span>
                      <div className="flex items-center gap-2">
                        {completed && <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-400 font-medium">已完赛</span>}
                        <span className="truncate">{fixture.stadium}</span>
                      </div>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2 min-w-0 flex-1 justify-end">
                        <span className="text-sm font-medium text-slate-200 truncate">{homeName}</span>
                        <span className="text-lg">{homeFlag}</span>
                      </div>
                      <div className={`text-xs font-bold shrink-0 ${completed ? 'text-amber-400 font-mono text-lg' : 'text-slate-400'}`}>
                        {completed ? (
                          <span className="flex flex-col items-center">
                            <span>{stats.home.goalsScored} - {stats.away.goalsScored}</span>
                            <span className="text-[10px] text-slate-500 font-normal">({stats.home.goalsScored + stats.away.goalsScored}球)</span>
                          </span>
                        ) : isTbd ? (
                          <span className="text-slate-600">TBD</span>
                        ) : (
                          'VS'
                        )}
                      </div>
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        <span className="text-lg">{awayFlag}</span>
                        <span className="text-sm font-medium text-slate-200 truncate">{awayName}</span>
                      </div>
                    </div>
                    {completed && (
                      <div className="mt-2 text-[10px] text-slate-500 text-center">
                        场均 {stats.home.goalsScored > 0 || stats.home.goalsConceded > 0 ? `主${(stats.home.goalsScored / stats.home.played).toFixed(1)}球/场` : ''}
                        {stats.away.goalsScored > 0 || stats.away.goalsConceded > 0 ? ` 客${(stats.away.goalsScored / stats.away.played).toFixed(1)}球/场` : ''}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))
      )}
    </div>
  );
}

type SortDir = 'asc' | 'desc';

interface ColumnConfig {
  key: string;
  label: string;
  align: 'left' | 'right';
  sortable: boolean;
  getValue: (team: WorldCupTeam, info: any, stats: any) => string | number;
  defaultDir: SortDir;
}

const COLUMNS: ColumnConfig[] = [
  { key: '#', label: '#', align: 'left', sortable: false, getValue: () => '', defaultDir: 'asc' },
  { key: 'name', label: '球队', align: 'left', sortable: true, getValue: (_t, info) => info?.cn ?? _t.nameCn, defaultDir: 'asc' },
  { key: 'group', label: '分组', align: 'left', sortable: true, getValue: (_t, info) => info?.group ?? '-', defaultDir: 'asc' },
  { key: 'fifaRank', label: 'FIFA', align: 'right', sortable: true, getValue: (t) => t.fifaRank, defaultDir: 'asc' },
  { key: 'elo', label: 'Elo', align: 'right', sortable: true, getValue: (t) => t.elo, defaultDir: 'desc' },
  { key: 'avgXgFor', label: 'xG', align: 'right', sortable: true, getValue: (_t, _i, s) => s.avgXgFor, defaultDir: 'desc' },
  { key: 'avgXgAgainst', label: 'xGA', align: 'right', sortable: true, getValue: (_t, _i, s) => s.avgXgAgainst, defaultDir: 'desc' },
  { key: 'avgShots', label: '射门', align: 'right', sortable: true, getValue: (_t, _i, s) => s.avgShots, defaultDir: 'desc' },
  { key: 'avgShotsOnTarget', label: '射正', align: 'right', sortable: true, getValue: (_t, _i, s) => s.avgShotsOnTarget, defaultDir: 'desc' },
  { key: 'avgGoalsFor', label: '进球', align: 'right', sortable: true, getValue: (_t, _i, s) => s.avgGoalsFor, defaultDir: 'desc' },
  { key: 'avgGoalsAgainst', label: '失球', align: 'right', sortable: true, getValue: (_t, _i, s) => s.avgGoalsAgainst, defaultDir: 'desc' },
  { key: 'winRate', label: '胜率', align: 'right', sortable: true, getValue: (_t, _i, s) => s.winRate, defaultDir: 'desc' },
];

function TeamsTab() {
  const teams = useWorldCupStore((s) => s.teams);
  const [refreshing, setRefreshing] = useState(false);
  const [statsMap, setStatsMap] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(true);
  const [sortKey, setSortKey] = useState('elo');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  const loadStats = useCallback(async () => {
    try {
      const res = await fetch('/api/worldcup/team-stats');
      const data = await res.json();
      if (data.success && data.stats) {
        setStatsMap(data.stats);
      }
    } catch (err) {
      console.error('加载统计数据失败:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadStats();
  }, [loadStats]);

  const getStats = useCallback((teamId: string) => {
    return statsMap[teamId] || getTeamStats(teamId);
  }, [statsMap]);

  const sorted = useMemo(() => {
    const col = COLUMNS.find(c => c.key === sortKey);
    if (!col) return [...teams].sort((a, b) => b.elo - a.elo);

    return [...teams].sort((a, b) => {
      const infoA = worldcupTeamIdToName[a.id];
      const infoB = worldcupTeamIdToName[b.id];
      const valA = col.getValue(a, infoA, getStats(a.id));
      const valB = col.getValue(b, infoB, getStats(b.id));

      if (valA == null || valA === '' || valA === '-') return 1;
      if (valB == null || valB === '' || valB === '-') return -1;

      const cmp = typeof valA === 'number' && typeof valB === 'number' ? valA - valB : String(valA).localeCompare(String(valB));
      return sortDir === 'desc' ? -cmp : cmp;
    });
  }, [teams, sortKey, sortDir, getStats]);

  const handleSort = (key: string) => {
    if (key === '#') return;
    if (key === sortKey) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      const col = COLUMNS.find(c => c.key === key);
      setSortKey(key);
      setSortDir(col?.defaultDir ?? 'desc');
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await fetch('/api/worldcup/refresh-team-stats', { method: 'POST' });
      await loadStats();
    } catch (err) {
      console.error('刷新统计数据失败:', err);
    } finally {
      setRefreshing(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-amber-500" />
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-medium text-slate-300 flex items-center gap-2">
          <Trophy className="w-4 h-4 text-amber-400" />
          球队统计数据
        </h3>
        <button
          onClick={handleRefresh}
          disabled={refreshing}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-slate-800 text-slate-300 hover:bg-slate-700 transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
          {refreshing ? '刷新中...' : '刷新统计数据'}
        </button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-800 text-xs text-slate-400 uppercase">
            {COLUMNS.map(col => (
              <th
                key={col.key}
                onClick={() => col.sortable && handleSort(col.key)}
                className={`py-3 px-2 ${col.align === 'right' ? 'text-right' : 'text-left'} ${col.sortable ? 'cursor-pointer hover:text-slate-200 select-none' : ''}`}
              >
                <span className="inline-flex items-center gap-1">
                  {col.label}
                  {col.sortable && sortKey === col.key && (
                    <span className="text-amber-400 text-[10px]">{sortDir === 'desc' ? '▲' : '▼'}</span>
                  )}
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map((team, idx) => {
            const info = worldcupTeamIdToName[team.id];
            const stats = getStats(team.id);
            return (
              <tr key={team.id} className="border-b border-slate-800/50 hover:bg-slate-800/30 transition-colors">
                <td className="py-2.5 px-2 text-slate-500 font-mono text-xs">{idx + 1}</td>
                <td className="py-2.5 px-2">
                  <div className="flex items-center gap-2">
                    <span className="text-lg">{info?.flag ?? ''}</span>
                    <span className="text-slate-200 font-medium">{info?.cn ?? team.nameCn}</span>
                  </div>
                </td>
                <td className="py-2.5 px-2 text-slate-400">{info?.group ?? '-'}</td>
                <td className="py-2.5 px-2 text-right text-slate-300 font-mono">{team.fifaRank}</td>
                <td className="py-2.5 px-2 text-right text-amber-400 font-mono font-bold">{team.elo}</td>
                <td className="py-2.5 px-2 text-right text-emerald-400 font-mono">{typeof stats.avgXgFor === 'number' ? stats.avgXgFor.toFixed(1) : '-'}</td>
                <td className="py-2.5 px-2 text-right text-rose-400 font-mono">{typeof stats.avgXgAgainst === 'number' ? stats.avgXgAgainst.toFixed(1) : '-'}</td>
                <td className="py-2.5 px-2 text-right text-slate-300 font-mono">{typeof stats.avgShots === 'number' ? stats.avgShots.toFixed(1) : '-'}</td>
                <td className="py-2.5 px-2 text-right text-slate-300 font-mono">{typeof stats.avgShotsOnTarget === 'number' ? stats.avgShotsOnTarget.toFixed(1) : '-'}</td>
                <td className="py-2.5 px-2 text-right text-emerald-400 font-mono">{typeof stats.avgGoalsFor === 'number' ? stats.avgGoalsFor.toFixed(1) : '-'}</td>
                <td className="py-2.5 px-2 text-right text-rose-400 font-mono">{typeof stats.avgGoalsAgainst === 'number' ? stats.avgGoalsAgainst.toFixed(1) : '-'}</td>
                <td className="py-2.5 px-2 text-right text-slate-300 font-mono">{typeof stats.winRate === 'number' ? `${(stats.winRate * 100).toFixed(0)}%` : '-'}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      </div>
    </div>
  );
}

interface StandingTeam {
  teamId: string;
  name: string;
  played: number;
  wins: number;
  draws: number;
  losses: number;
  goalsFor: number;
  goalsAgainst: number;
  goalsDiff: number;
  points: number;
}

interface StandingsGroup {
  name: string;
  teams: StandingTeam[];
}

function StandingsTab() {
  const [groups, setGroups] = useState<StandingsGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadStandings = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true); else setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/worldcup/standings');
      const data = await res.json();
      if (data.success && data.groups) {
        setGroups(data.groups);
      } else {
        setError(data.message || '加载失败');
      }
    } catch {
      setError('网络请求失败');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { loadStandings(); }, [loadStandings]);

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      const res = await fetch('/api/worldcup/refresh-standings', { method: 'POST' });
      const data = await res.json();
      if (data.success && data.groups) {
        setGroups(data.groups);
        setError(null);
      } else {
        setError(data.message || '刷新失败');
      }
    } catch {
      setError('刷新请求失败');
    } finally {
      setRefreshing(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-amber-500" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <Trophy className="w-4 h-4 text-amber-400" />
          <span className="text-sm font-medium text-slate-300">2026世界杯积分榜</span>
          {error && <span className="text-xs text-rose-400">{error}</span>}
        </div>
        <button
          onClick={handleRefresh}
          disabled={refreshing}
          className="flex items-center gap-1.5 px-3 py-1 text-xs font-medium rounded-lg bg-slate-800 text-slate-300 hover:bg-slate-700 transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
          {refreshing ? '更新中...' : '更新积分榜'}
        </button>
      </div>

      {groups.length === 0 ? (
        <PlaceholderTab message={error || '暂无积分榜数据'} />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {groups.map((group, gi) => (
            <div key={gi} className="bg-slate-900/50 border border-slate-800 rounded-xl overflow-hidden">
              <div className="px-4 py-3 bg-slate-800/60 border-b border-slate-700/50">
                <span className="text-sm font-bold text-amber-400">{group.name}</span>
              </div>
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-slate-800 text-[10px] text-slate-500 uppercase">
                    <th className="py-1.5 px-1.5 text-left w-6">#</th>
                    <th className="py-1.5 px-1.5 text-left">球队</th>
                    <th className="py-1.5 px-1 text-right w-7">场</th>
                    <th className="py-1.5 px-1 text-right w-7">胜</th>
                    <th className="py-1.5 px-1 text-right w-7">平</th>
                    <th className="py-1.5 px-1 text-right w-7">负</th>
                    <th className="py-1.5 px-1 text-right w-7">进</th>
                    <th className="py-1.5 px-1 text-right w-7">失</th>
                    <th className="py-1.5 px-1 text-right w-9">净胜</th>
                    <th className="py-1.5 px-1.5 text-right w-10 font-bold text-amber-400">积分</th>
                  </tr>
                </thead>
                <tbody>
                  {group.teams.map((team, ti) => (
                    <tr key={team.teamId} className="border-b border-slate-800/30 hover:bg-slate-800/30 transition-colors last:border-b-0">
                      <td className="py-1.5 px-1.5 text-slate-500 font-mono">{ti + 1}</td>
                      <td className="py-1.5 px-1.5 text-slate-200 font-medium truncate max-w-[100px]">{team.name}</td>
                      <td className="py-1.5 px-1 text-right text-slate-300 font-mono">{team.played}</td>
                      <td className="py-1.5 px-1 text-right text-emerald-400 font-mono">{team.wins}</td>
                      <td className="py-1.5 px-1 text-right text-slate-300 font-mono">{team.draws}</td>
                      <td className="py-1.5 px-1 text-right text-rose-400 font-mono">{team.losses}</td>
                      <td className="py-1.5 px-1 text-right text-slate-300 font-mono">{team.goalsFor}</td>
                      <td className="py-1.5 px-1 text-right text-slate-300 font-mono">{team.goalsAgainst}</td>
                      <td className={`py-1.5 px-1 text-right font-mono ${team.goalsDiff > 0 ? 'text-emerald-400' : team.goalsDiff < 0 ? 'text-rose-400' : 'text-slate-400'}`}>
                        {team.goalsDiff > 0 ? '+' : ''}{team.goalsDiff}
                      </td>
                      <td className="py-1.5 px-1.5 text-right text-amber-400 font-bold font-mono">{team.points}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function SandboxTab() {
  const teams = useMemo(() => [...WORLD_CUP_TEAMS].sort((a, b) => b.elo - a.elo), []);

  const [scheduleData, setScheduleData] = useState<Record<string, { completed: boolean }>>({});
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    fetch('/api/worldcup/schedule-scores')
      .then(r => r.json())
      .then(data => {
        if (data.success && data.fixtures) {
          const map: Record<string, { completed: boolean }> = {};
          for (const f of data.fixtures) {
            map[f.id] = { completed: f.completed };
          }
          setScheduleData(map);
        }
      })
      .catch(() => {});
  }, []);

  const allFixtures = useMemo(() => {
    return WORLD_CUP_FIXTURES_2026
      .filter(f => !f.homeTeam.startsWith('tbd') && !f.awayTeam.startsWith('tbd'))
      .sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
  }, []);

  const fixtures = useMemo(() => {
    if (showAll) return allFixtures;
    return allFixtures.filter(f => !(scheduleData[f.id]?.completed ?? false));
  }, [allFixtures, showAll, scheduleData]);

  const [selectedFixtureId, setSelectedFixtureId] = useState(allFixtures[0]?.id ?? '');
  const selectedFixture = allFixtures.find(f => f.id === selectedFixtureId);
  const [homeId, setHomeId] = useState(() => allFixtures[0]?.homeTeam ?? teams[0]?.id ?? '');
  const [awayId, setAwayId] = useState(() => allFixtures[0]?.awayTeam ?? teams[1]?.id ?? '');
  const [predicting, setPredicting] = useState(false);
  const [result, setResult] = useState<WorldCupPrediction | null>(null);

  const handleFixtureChange = (fixtureId: string) => {
    setSelectedFixtureId(fixtureId);
    const fixture = allFixtures.find(f => f.id === fixtureId);
    if (fixture) {
      setHomeId(fixture.homeTeam);
      setAwayId(fixture.awayTeam);
    }
  };

  const handleShowAllChange = (val: boolean) => {
    setShowAll(val);
    if (!val && !fixtures.find(f => f.id === selectedFixtureId)) {
      const first = fixtures[0];
      if (first) handleFixtureChange(first.id);
    }
  };

  const safePrediction = (data: any): WorldCupPrediction => ({
    homeWinProb: typeof data?.homeWinProb === 'number' ? data.homeWinProb : 0.33,
    drawProb: typeof data?.drawProb === 'number' ? data.drawProb : 0.34,
    awayWinProb: typeof data?.awayWinProb === 'number' ? data.awayWinProb : 0.33,
    homeExpectedGoals: typeof data?.homeExpectedGoals === 'number' ? data.homeExpectedGoals : 0,
    awayExpectedGoals: typeof data?.awayExpectedGoals === 'number' ? data.awayExpectedGoals : 0,
    predictedScore: typeof data?.predictedScore === 'string' ? data.predictedScore : '0-0',
    dataSource: data?.dataSource,
    scoreProbabilities: Array.isArray(data?.scoreProbabilities) ? data.scoreProbabilities : undefined,
  });

  const homeInfo = worldcupTeamIdToName[homeId];
  const awayInfo = worldcupTeamIdToName[awayId];

  const handlePredict = async () => {
    if (!homeId || !awayId) return;
    setPredicting(true);
    setResult(null);
    try {
      const res = await fetch('/api/worldcup/predict', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ homeTeamId: homeId, awayTeamId: awayId, stage: selectedFixture?.stage ?? 'group' }),
        signal: AbortSignal.timeout(30000),
      });
      if (!res.ok) throw new Error('预测请求失败');
      const data = await res.json();
      setResult(safePrediction(data));
    } catch (err) {
      console.error('预测失败:', err);
    } finally {
      setPredicting(false);
    }
  };

  const homeTeam = teams.find(t => t.id === homeId);
  const awayTeam = teams.find(t => t.id === awayId);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
      <div className="lg:col-span-4 flex flex-col gap-4">
        <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-5">
          <h3 className="text-white font-medium mb-4 flex items-center gap-2">
            <Cpu className="w-4 h-4 text-amber-400" />
            世界杯量化沙盘
          </h3>

          <div className="flex items-center justify-between mb-1.5">
            <label className="text-xs text-slate-400">选择比赛</label>
            <div className="flex gap-1">
              <button onClick={() => handleShowAllChange(false)}
                className={`px-2 py-0.5 text-[10px] font-medium rounded transition-all ${!showAll ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30' : 'text-slate-500 hover:text-slate-300 border border-transparent'}`}>
                未赛
              </button>
              <button onClick={() => handleShowAllChange(true)}
                className={`px-2 py-0.5 text-[10px] font-medium rounded transition-all ${showAll ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30' : 'text-slate-500 hover:text-slate-300 border border-transparent'}`}>
                全部
              </button>
            </div>
          </div>
          <select value={selectedFixtureId} onChange={e => handleFixtureChange(e.target.value)}
            className="w-full bg-[#090D1A] border border-slate-700 rounded-lg px-3 py-2.5 text-sm text-slate-200 focus:outline-none focus:border-amber-500 mb-3">
            {fixtures.map(f => {
              const hInfo = worldcupTeamIdToName[f.homeTeam];
              const aInfo = worldcupTeamIdToName[f.awayTeam];
              return (
                <option key={f.id} value={f.id}>
                  {f.date} {f.time} {hInfo?.cn ?? f.homeTeam} vs {aInfo?.cn ?? f.awayTeam}
                </option>
              );
            })}
          </select>

          {selectedFixture && (
            <div className="bg-slate-800/40 border border-slate-700/50 rounded-lg p-3 mb-4">
              <div className="flex items-center justify-between text-xs mb-2">
                <span className="text-slate-300 font-medium">{selectedFixture.date} {selectedFixture.time}</span>
                <span className={`px-2 py-0.5 rounded text-[10px] font-medium ${
                  selectedFixture.stage === 'final' ? 'bg-amber-500/20 text-amber-400' :
                  selectedFixture.stage === 'semi' ? 'bg-purple-500/20 text-purple-400' :
                  selectedFixture.stage === 'quarter' ? 'bg-blue-500/20 text-blue-400' :
                  selectedFixture.stage === 'round_of_16' ? 'bg-cyan-500/20 text-cyan-400' :
                  selectedFixture.stage === 'round_of_32' ? 'bg-teal-500/20 text-teal-400' :
                  'bg-emerald-500/20 text-emerald-400'
                }`}>
                  {selectedFixture.stage === 'group' ? '小组赛' :
                   selectedFixture.stage === 'round_of_32' ? '32强' :
                   selectedFixture.stage === 'round_of_16' ? '16强' :
                   selectedFixture.stage === 'quarter' ? '1/4决赛' :
                   selectedFixture.stage === 'semi' ? '半决赛' : '决赛'}
                </span>
              </div>
              <div className="text-[11px] text-slate-500">{selectedFixture.stadium}</div>
            </div>
          )}

          <label className="text-xs text-slate-400 mb-1.5 block">主队</label>
          <select value={homeId} onChange={e => setHomeId(e.target.value)}
            className="w-full bg-[#090D1A] border border-slate-700 rounded-lg px-3 py-2.5 text-sm text-slate-200 focus:outline-none focus:border-amber-500 mb-3">
            {teams.map(t => {
              const info = worldcupTeamIdToName[t.id];
              return <option key={t.id} value={t.id}>{info?.flag ?? ''} {info?.cn ?? t.nameCn} (Elo:{t.elo})</option>;
            })}
          </select>

          <label className="text-xs text-slate-400 mb-1.5 block">客队</label>
          <select value={awayId} onChange={e => setAwayId(e.target.value)}
            className="w-full bg-[#090D1A] border border-slate-700 rounded-lg px-3 py-2.5 text-sm text-slate-200 focus:outline-none focus:border-amber-500 mb-4">
            {teams.map(t => {
              const info = worldcupTeamIdToName[t.id];
              return <option key={t.id} value={t.id}>{info?.flag ?? ''} {info?.cn ?? t.nameCn} (Elo:{t.elo})</option>;
            })}
          </select>

          <button onClick={handlePredict} disabled={predicting || !homeId || !awayId}
            className="w-full bg-gradient-to-r from-amber-600 to-orange-500 hover:from-amber-500 hover:to-orange-400 disabled:from-slate-700 disabled:to-slate-700 disabled:text-slate-500 text-white rounded-lg py-3 font-medium transition-all flex items-center justify-center gap-2 min-h-[44px]">
            <span className={predicting ? 'inline-flex items-center gap-2' : 'hidden'}>
              <Loader2 className="w-4 h-4 animate-spin" /> 预测中...
            </span>
            <span className={!predicting ? 'inline-flex items-center gap-2' : 'hidden'}>
              <Cpu className="w-4 h-4" /> 世界杯预测
            </span>
          </button>
        </div>

        {homeTeam && awayTeam && (
          <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-4">
            <div className="text-xs text-slate-500 mb-3">球队实力对比</div>
            <div className="flex items-center justify-between text-sm">
              <div className="text-center flex-1">
                <div className="text-lg mb-1">{homeInfo?.flag ?? ''}</div>
                <div className="text-slate-200 font-medium truncate">{homeInfo?.cn ?? homeTeam.nameCn}</div>
                <div className="text-amber-400 font-mono text-xs mt-1">Elo {homeTeam.elo}</div>
                <div className="text-[10px] text-slate-500">FIFA #{homeTeam.fifaRank}</div>
              </div>
              <div className="text-slate-600 text-xs font-bold px-3">VS</div>
              <div className="text-center flex-1">
                <div className="text-lg mb-1">{awayInfo?.flag ?? ''}</div>
                <div className="text-slate-200 font-medium truncate">{awayInfo?.cn ?? awayTeam.nameCn}</div>
                <div className="text-amber-400 font-mono text-xs mt-1">Elo {awayTeam.elo}</div>
                <div className="text-[10px] text-slate-500">FIFA #{awayTeam.fifaRank}</div>
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="lg:col-span-8 flex flex-col gap-4">
        <ErrorBoundary>
          <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-5 flex flex-col items-center justify-center min-h-[240px]">
            <div className={predicting ? 'flex flex-col items-center' : 'hidden'}>
              <Loader2 className="w-12 h-12 mb-4 text-amber-400 animate-spin" />
              <p className="text-base text-slate-400">正在加载预测结果...</p>
            </div>
            <div className={!predicting && !result ? 'flex flex-col items-center' : 'hidden'}>
              <Cpu className="w-12 h-12 mb-4 text-slate-600" />
              <p className="text-base mb-2 text-slate-500">世界杯量化沙盘</p>
              <p className="text-sm text-slate-600">选择球队并点击预测查看结果</p>
            </div>
            <div className={!predicting && result ? 'w-full' : 'hidden'}>
              <div className="flex items-center justify-between mb-4">
                <h4 className="text-white font-medium">预测结果</h4>
                <span className={`text-[10px] px-2 py-0.5 rounded ${
                  result?.dataSource === 'external'
                    ? 'bg-emerald-500/20 text-emerald-400'
                    : 'bg-slate-800 text-slate-500'
                }`}>
                  {result?.dataSource === 'external' ? '预测来源：开源模型 v1.0' : '预测来源：xG 加权模型'}
                </span>
              </div>
              <div className="text-center mb-6">
                <div className="flex items-center justify-center gap-6 mb-3">
                  <div className="text-right">
                    <div className="text-lg">{homeInfo?.flag ?? ''}</div>
                    <div className="text-sm text-slate-300 font-medium">{homeInfo?.cn ?? homeId}</div>
                  </div>
                  <div className="text-3xl font-bold text-amber-400 font-mono tracking-wider">{result?.predictedScore ?? '-'}</div>
                  <div className="text-left">
                    <div className="text-lg">{awayInfo?.flag ?? ''}</div>
                    <div className="text-sm text-slate-300 font-medium">{awayInfo?.cn ?? awayId}</div>
                  </div>
                </div>
                <div className="flex justify-center gap-3 text-xs">
                  <span className="px-3 py-1 rounded-full bg-rose-500/20 text-rose-300 font-mono">主 {fmtWinProb(result?.homeWinProb ?? 0)}</span>
                  <span className="px-3 py-1 rounded-full bg-slate-600/30 text-slate-300 font-mono">平 {fmtWinProb(result?.drawProb ?? 0)}</span>
                  <span className="px-3 py-1 rounded-full bg-emerald-500/20 text-emerald-300 font-mono">客 {fmtWinProb(result?.awayWinProb ?? 0)}</span>
                </div>
                {result?.scoreProbabilities && result.scoreProbabilities.length > 0 && (
                  <div className="mt-4">
                    <div className="text-[11px] text-slate-500 mb-2 font-medium">最可能比分</div>
                    <div className="grid grid-cols-3 gap-2">
                      {result.scoreProbabilities.slice(0, 5).map((sp, idx) => (
                        <div
                          key={sp.score}
                          className={`
                            p-2 rounded-lg text-center border transition-all
                            ${idx === 0
                              ? 'bg-[#0F1424] border border-indigo-400/50 shadow-[0_0_20px_rgba(99,102,241,0.15)]'
                              : 'bg-[#0F1424] border-slate-700/50 hover:bg-[#1A2234]'}
                          `}
                        >
                          <div className={`text-sm font-bold ${idx === 0 ? 'text-white' : 'text-slate-200'}`}>{sp.score}</div>
                          <div className={`text-xs ${idx === 0 ? 'text-indigo-200' : 'text-slate-500'}`}>{(sp.prob * 100).toFixed(1)}%</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
              <div className="grid grid-cols-2 gap-4 mb-4">
                <div className="bg-slate-800/30 rounded-lg p-3 text-center">
                  <div className="text-[10px] text-slate-500 mb-1">主队期望进球</div>
                  <div className="text-lg font-mono font-bold text-amber-400">{(result?.homeExpectedGoals ?? 0).toFixed(2)}</div>
                </div>
                <div className="bg-slate-800/30 rounded-lg p-3 text-center">
                  <div className="text-[10px] text-slate-500 mb-1">客队期望进球</div>
                  <div className="text-lg font-mono font-bold text-amber-400">{(result?.awayExpectedGoals ?? 0).toFixed(2)}</div>
                </div>
              </div>
              <div className="bg-slate-800/30 rounded-lg p-4">
                <div className="text-[11px] text-slate-500 mb-3 font-medium">概率分布</div>
                <div className="space-y-2">
                  <div>
                    <div className="flex justify-between text-xs mb-1"><span className="text-rose-400">主胜</span><span className="font-mono text-rose-400">{fmtWinProb(result?.homeWinProb ?? 0)}</span></div>
                    <div className="w-full h-3 bg-slate-800 rounded-full overflow-hidden"><div className="h-full rounded-full bg-gradient-to-r from-rose-600 to-rose-400 transition-all" style={{ width: `${Math.min(100, (result?.homeWinProb ?? 0) * 100)}%` }} /></div>
                  </div>
                  <div>
                    <div className="flex justify-between text-xs mb-1"><span className="text-slate-400">平局</span><span className="font-mono text-slate-400">{fmtWinProb(result?.drawProb ?? 0)}</span></div>
                    <div className="w-full h-3 bg-slate-800 rounded-full overflow-hidden"><div className="h-full rounded-full bg-gradient-to-r from-slate-600 to-slate-400 transition-all" style={{ width: `${Math.min(100, (result?.drawProb ?? 0) * 100)}%` }} /></div>
                  </div>
                  <div>
                    <div className="flex justify-between text-xs mb-1"><span className="text-emerald-400">客胜</span><span className="font-mono text-emerald-400">{fmtWinProb(result?.awayWinProb ?? 0)}</span></div>
                    <div className="w-full h-3 bg-slate-800 rounded-full overflow-hidden"><div className="h-full rounded-full bg-gradient-to-r from-emerald-600 to-emerald-400 transition-all" style={{ width: `${Math.min(100, (result?.awayWinProb ?? 0) * 100)}%` }} /></div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </ErrorBoundary>
      </div>
    </div>
  );
}

export default function WorldCupPage() {
  const [activeTab, setActiveTab] = useState<TabKey>('schedule');

  const renderTabContent = () => {
    switch (activeTab) {
      case 'schedule':
        return <ErrorBoundary key="schedule"><ScheduleTab /></ErrorBoundary>;
      case 'sandbox':
        return <ErrorBoundary key="sandbox"><SandboxTab /></ErrorBoundary>;
      case 'teams':
        return <ErrorBoundary key="teams"><TeamsTab /></ErrorBoundary>;
      case 'stages':
        return <ErrorBoundary key="stages"><StandingsTab /></ErrorBoundary>;
    }
  };

  return (
    <div className="min-h-screen bg-[#0F1424] text-slate-100">
      <div className="relative overflow-hidden">
        <div className="absolute top-0 left-0 w-full h-48 bg-gradient-to-b from-amber-500/5 to-transparent pointer-events-none" />
        <div className="relative max-w-7xl mx-auto px-4 py-6">
          <div className="flex items-center gap-3 mb-6">
            <div className="p-2 bg-gradient-to-tr from-amber-600 to-orange-500 rounded-lg shadow-lg">
              <Trophy className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">2026 世界杯</h2>
              <p className="text-xs text-slate-400">美国 · 加拿大 · 墨西哥</p>
            </div>
          </div>

          <div className="flex gap-1 mb-6 overflow-x-auto">
            {TABS.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.key;
              return (
                <button
                  key={tab.key}
                  onClick={() => setActiveTab(tab.key)}
                  className={`flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium rounded-lg whitespace-nowrap transition-all ${
                    isActive
                      ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50 border border-transparent'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  {tab.label}
                </button>
              );
            })}
          </div>

          <div className="relative">
            {renderTabContent()}
          </div>
        </div>
      </div>
    </div>
  );
}
