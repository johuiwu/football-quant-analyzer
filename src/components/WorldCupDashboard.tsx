import { useState } from 'react';
import { 
  getTeamStats, 
  getStageComparison, 
  getRefereeStats, 
  getManagerStats, 
  getYearStats, 
  getAvailableYears
} from '../data/worldCupData';
import { worldCup2026Schedule, WorldCup2026Match } from '../data/worldCup2026Schedule';
import { TeamStatsTable } from './TeamStatsTable';
import { StageComparison } from './StageComparison';
import { RefereeStats } from './RefereeStats';
import { ManagerStats } from './ManagerStats';
import { YearComparison } from './YearComparison';
import { WorldCup2026Schedule } from './WorldCup2026Schedule';

type TabType = 'schedule' | 'teams' | 'stages' | 'referees' | 'managers' | 'years';

export function WorldCupDashboard() {
  const [activeTab, setActiveTab] = useState<TabType>('schedule');
  const [selectedYear, setSelectedYear] = useState<number | undefined>(undefined);
  const years = getAvailableYears();

  const tabs: { id: TabType; label: string; icon: string }[] = [
    { id: 'schedule', label: '2026赛程', icon: '🏆' },
    { id: 'teams', label: '球队战绩', icon: '⚽' },
    { id: 'stages', label: '阶段对比', icon: '📊' },
    { id: 'referees', label: '裁判统计', icon: '🔍' },
    { id: 'managers', label: '教练对比', icon: '👔' },
    { id: 'years', label: '年份对比', icon: '📈' },
  ];

  const teamStats = getTeamStats(selectedYear);
  const stageStats = getStageComparison(selectedYear);
  const refereeStats = getRefereeStats(selectedYear);
  const managerStats = getManagerStats(selectedYear);
  const yearStats = getYearStats();

  return (
    <div className="min-h-screen bg-[#0F1424] p-4 md:p-6">
      <div className="max-w-7xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-slate-100">🌍 世界杯数据分析</h1>
            <p className="text-sm text-slate-400 mt-1">历届世界杯数据统计与分析</p>
          </div>
          
          {activeTab !== 'schedule' && activeTab !== 'years' && (
            <div className="flex items-center gap-3">
              <label className="text-xs text-slate-400">选择年份:</label>
              <select
                value={selectedYear || ''}
                onChange={(e) => setSelectedYear(e.target.value ? Number(e.target.value) : undefined)}
                className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-amber-500"
              >
                <option value="">全部年份</option>
                {years.map((year) => (
                  <option key={year} value={year}>{year}</option>
                ))}
              </select>
            </div>
          )}
        </div>

        <div className="bg-slate-900/50 rounded-2xl border border-slate-800 overflow-hidden">
          <div className="flex border-b border-slate-800 overflow-x-auto">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-4 py-3 text-sm font-medium whitespace-nowrap transition-colors ${
                  activeTab === tab.id
                    ? 'text-amber-400 bg-amber-500/10 border-b-2 border-amber-500'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
                }`}
              >
                <span>{tab.icon}</span>
                <span>{tab.label}</span>
              </button>
            ))}
          </div>

          <div className="p-4 md:p-6">
            {activeTab === 'schedule' && (
              <WorldCup2026Schedule matches={worldCup2026Schedule} />
            )}
            
            {activeTab === 'teams' && (
              <TeamStatsTable stats={teamStats} />
            )}
            
            {activeTab === 'stages' && (
              <StageComparison stats={stageStats} />
            )}
            
            {activeTab === 'referees' && (
              <RefereeStats stats={refereeStats} />
            )}
            
            {activeTab === 'managers' && (
              <ManagerStats stats={managerStats} />
            )}
            
            {activeTab === 'years' && (
              <YearComparison stats={yearStats} />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}