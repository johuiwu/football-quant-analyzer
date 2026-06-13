import React, { useEffect, useRef } from "react";
import { HashRouter, Routes, Route, Navigate, useNavigate, useLocation } from "react-router-dom";
import TeamInfoSection from "./components/TeamInfoSection";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { WorldCupDashboard } from "./components/WorldCupDashboard";
import { useFixtureSync } from "./hooks/useFixtureSync";
import { useTeamDataSync } from "./hooks/useTeamDataSync";
import PageHeader from "./components/PageHeader";
import StandingsPage from "./pages/StandingsPage";
import CornerSystemPage from "./pages/CornerSystemPage";
import DashboardPage from "./pages/DashboardPage";
import { useAppStore } from "./store/useAppStore";

// 路径到 activeTab 的映射
const PATH_TO_TAB: Record<string, string> = {
  "/dashboard": "dashboard",
  "/standings": "standings",
  "/teams": "teams",
  "/worldcup": "worldcup",
  "/corner": "corner",
};

function AppNewContent() {
  // ===== Store selectors =====
  const activeTab = useAppStore((s) => s.activeTab);

  const setTeams = useAppStore((s) => s.setTeams);
  const setTeamsLoading = useAppStore((s) => s.setTeamsLoading);
  const setTeamsSyncMsg = useAppStore((s) => s.setTeamsSyncMsg);
  const setTeamsSyncSource = useAppStore((s) => s.setTeamsSyncSource);
  const setFixtures = useAppStore((s) => s.setFixtures);
  const setFixturesLoading = useAppStore((s) => s.setFixturesLoading);
  const setFixtureSyncMsg = useAppStore((s) => s.setFixtureSyncMsg);
  const setFixtureSyncSource = useAppStore((s) => s.setFixtureSyncSource);
  const setLoadRealTimeFixtures = useAppStore((s) => s.setLoadRealTimeFixtures);
  const setActiveTab = useAppStore((s) => s.setActiveTab);

  const navigate = useNavigate();
  const isFirstRender = useRef(true);
  const location = useLocation();

  // ===== 双向同步，activeTab 和 URL =====

  // activeTab 到 URL，Store 驱动导航，如 setHomeAndGo 触发
  useEffect(() => {
    const targetPath = "/" + activeTab;
    if (location.pathname !== targetPath) {
      navigate(targetPath, { replace: true });
    }
  }, [activeTab]); // eslint-disable-line react-hooks/exhaustive-deps

  // URL 到 activeTab，浏览器导航驱动 store 更新
  useEffect(() => {
    const tab = PATH_TO_TAB[location.pathname];
    if (tab && tab !== activeTab) {
      setActiveTab(tab as any);
    }
  }, [location.pathname]); // eslint-disable-line react-hooks/exhaustive-deps

  // 应用启动时自动初始化 API Key
  useEffect(() => {
    const savedKey = localStorage.getItem("football_api_key");
    if (savedKey) {
      fetch("/api/set-api-key", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiKey: savedKey }),
      }).catch(err => console.error("Failed to initialize API Key:", err));
    }
  }, []);

  // 使用重构后的 Hooks
  const fixtureSync = useFixtureSync();
  const teamDataSync = useTeamDataSync();

  const {
    fixtures,
    isLoading: isFixturesLoading,
    syncMessage: fixtureSyncMsg,
    syncSource: fixtureSyncSource,
    loadRealTimeFixtures
  } = fixtureSync;

  const {
    teams,
    isLoading: isTeamsLoading,
    syncMessage: teamsSyncMsg,
    syncSource: teamsSyncSource,
    loadRealTimeStandings
  } = teamDataSync;


  // 将 Hook 数据同步到 Store
  useEffect(() => { setTeams(teams); }, [teams, setTeams]);
  useEffect(() => { setTeamsLoading(isTeamsLoading); }, [isTeamsLoading, setTeamsLoading]);
  useEffect(() => { setTeamsSyncMsg(teamsSyncMsg); }, [teamsSyncMsg, setTeamsSyncMsg]);
  useEffect(() => { setTeamsSyncSource(teamsSyncSource); }, [teamsSyncSource, setTeamsSyncSource]);
  useEffect(() => { setFixtures(fixtures); }, [fixtures, setFixtures]);
  useEffect(() => { setFixturesLoading(isFixturesLoading); }, [isFixturesLoading, setFixturesLoading]);
  useEffect(() => { setFixtureSyncMsg(fixtureSyncMsg); }, [fixtureSyncMsg, setFixtureSyncMsg]);
  useEffect(() => { setFixtureSyncSource(fixtureSyncSource); }, [fixtureSyncSource, setFixtureSyncSource]);
  useEffect(() => { setLoadRealTimeFixtures(loadRealTimeFixtures); }, [loadRealTimeFixtures, setLoadRealTimeFixtures]);


  return (
    <div className="min-h-screen bg-[#090D1A] text-slate-100 font-sans antialiased selection:bg-[#FF3E6C] selection:text-white">

      <PageHeader />

      <main className="max-w-7xl mx-auto px-4 py-6">
        <Routes>
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="/dashboard" element={<ErrorBoundary><DashboardPage /></ErrorBoundary>} />
          <Route path="/standings" element={<StandingsPage />} />
          <Route path="/teams" element={<ErrorBoundary><TeamInfoSection /></ErrorBoundary>} />
          <Route path="/worldcup" element={<WorldCupDashboard />} />
          <Route path="/corner" element={<ErrorBoundary><CornerSystemPage /></ErrorBoundary>} />
        </Routes>
      </main>

      <footer className="border-t border-slate-800/80 bg-[#070A14] mt-12 py-8">
        <div className="max-w-7xl mx-auto px-4 text-center space-y-3.5">
          <p className="text-xs text-slate-500 font-mono">
            Football Quantitative Precision Predictor Engine - Built for Academic Rationality Research - All Rights Reserved 2026
          </p>
          <div className="inline-flex items-center gap-2 bg-slate-900/60 border border-slate-800 px-3.5 py-1.5 rounded-lg text-[10px] text-slate-400">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
            <span>2026 全部赛事数据已完成增量更新(覆盖英超/意甲/西甲/德甲 200+球队完整对战历史)</span>
          </div>
          <p className="text-[10px] text-red-500/80 max-w-2xl mx-auto leading-relaxed">
            * 再次声明：本软件为开源教学模型，严禁向任何投注企业、投注网站提供连接、代购服务。理性对待预测结果，反对赌球，遵守法律法规。
          </p>
        </div>
      </footer>

    </div>
  );
}

export default function AppNew() {
  return (
    <HashRouter>
      <AppNewContent />
    </HashRouter>
  );
}
