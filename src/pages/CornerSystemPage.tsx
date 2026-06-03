import { Monitor, BarChart3, Settings, Play } from 'lucide-react';
import CrawlerControlPanel from '../components/corner/CrawlerControlPanel';
import LiveMonitor from '../components/corner/LiveMonitor';
import CornerHistoryChart from '../components/corner/CornerHistoryChart';
import StrategyConfigPanel from '../components/corner/StrategyConfigPanel';
import { useCornerStore } from '../store/cornerStore';

type TabType = 'crawler' | 'monitor' | 'strategy' | 'history';

export default function CornerSystemPage() {
  const activeTab = useCornerStore((s) => s.activeCornerTab);
  const setActiveCornerTab = useCornerStore((s) => s.setActiveCornerTab);

  const tabs = [
    { id: 'crawler' as TabType, label: '赛程数据', icon: <Play className="w-4 h-4" /> },
    { id: 'monitor' as TabType, label: '实时监控', icon: <Monitor className="w-4 h-4" /> },
    { id: 'strategy' as TabType, label: '策略配置', icon: <Settings className="w-4 h-4" /> },
    { id: 'history' as TabType, label: '历史分析', icon: <BarChart3 className="w-4 h-4" /> },
  ];

  return (
    <div className="p-4">
      <div className="flex items-center gap-2 mb-4">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveCornerTab(tab.id)}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              activeTab === tab.id
                ? 'bg-emerald-600 text-white'
                : 'bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-slate-200'
            }`}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      <div className="bg-slate-900/50 rounded-xl border border-slate-800 p-4">
        {activeTab === 'crawler' && <CrawlerControlPanel />}
        {activeTab === 'monitor' && <LiveMonitor />}
        {activeTab === 'strategy' && <StrategyConfigPanel />}
        {activeTab === 'history' && <CornerHistoryChart />}
      </div>
    </div>
  );
}
