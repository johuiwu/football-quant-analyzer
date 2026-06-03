import React, { useEffect, useRef } from "react";
import { HashRouter, Routes, Route, Navigate, useNavigate, useLocation } from "react-router-dom";
import { TeamStats } from "./data/realTeamsData";
import { ModelWeights } from "./utils/quantModel";
import TeamInfoSection from "./components/TeamInfoSection";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { WorldCupDashboard } from "./components/WorldCupDashboard";
import { useFixtureSync } from "./hooks/useFixtureSync";
import { useTeamDataSync } from "./hooks/useTeamDataSync";
import { useRiskAlerts } from "./hooks/useRiskAlerts";
import PageHeader from "./components/PageHeader";
import StandingsPage from "./pages/StandingsPage";
import CornerSystemPage from "./pages/CornerSystemPage";
import DashboardPage from "./pages/DashboardPage";
import PythonExportTab from "./components/PythonExportTab";
import { useAppStore } from "./store/useAppStore";

// 路径与 activeTab 映射
const PATH_TO_TAB: Record<string, string> = {
  "/dashboard": "dashboard",
  "/standings": "standings",
  "/teams": "teams",
  "/worldcup": "worldcup",
  "/corner": "corner",
  "/python": "python",
};

function AppNewContent() {
  // ===== Store selectors =====
  const activeTab = useAppStore((s) => s.activeTab);
  const customWeights = useAppStore((s) => s.customWeights);
  const isExporting = useAppStore((s) => s.isExporting);

  const setTeams = useAppStore((s) => s.setTeams);
  const setTeamsLoading = useAppStore((s) => s.setTeamsLoading);
  const setTeamsSyncMsg = useAppStore((s) => s.setTeamsSyncMsg);
  const setTeamsSyncSource = useAppStore((s) => s.setTeamsSyncSource);
  const setFixtures = useAppStore((s) => s.setFixtures);
  const setFixturesLoading = useAppStore((s) => s.setFixturesLoading);
  const setFixtureSyncMsg = useAppStore((s) => s.setFixtureSyncMsg);
  const setFixtureSyncSource = useAppStore((s) => s.setFixtureSyncSource);
  const setLoadRealTimeFixtures = useAppStore((s) => s.setLoadRealTimeFixtures);
  const setRiskAlerts = useAppStore((s) => s.setRiskAlerts);
  const setActiveTab = useAppStore((s) => s.setActiveTab);
  const setIsExporting = useAppStore((s) => s.setIsExporting);

  const navigate = useNavigate();
  const isFirstRender = useRef(true);
  const location = useLocation();

  // ===== 双向同步：activeTab 与 URL =====

  // activeTab 到 URL（store 驱动导航，如 setHomeAndGo 触发）
  useEffect(() => {
    const targetPath = "/" + activeTab;
    if (location.pathname !== targetPath) {
      navigate(targetPath, { replace: true });
    }
  }, [activeTab]); // eslint-disable-line react-hooks/exhaustive-deps

  // URL 到 activeTab（浏览器导航驱动 store 更新）
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
  const riskAlertsHook = useRiskAlerts();

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

  const { alerts: riskAlerts } = riskAlertsHook;

  // 将 Hook 数据同步到 Store
  useEffect(() => { setTeams(teams); }, [teams, setTeams]);
  useEffect(() => { setTeamsLoading(isTeamsLoading); }, [isTeamsLoading, setTeamsLoading]);
  useEffect(() => { setTeamsSyncMsg(teamsSyncMsg); }, [teamsSyncMsg, setTeamsSyncMsg]);
  useEffect(() => { setTeamsSyncSource(teamsSyncSource); }, [teamsSyncSource, setTeamsSyncSource]);
  useEffect(() => { setFixtures(fixtures); }, [fixtures, setFixtures]);
  useEffect(() => { setFixturesLoading(isFixturesLoading); }, [isFixturesLoading, setFixturesLoading]);
  useEffect(() => { setFixtureSyncMsg(fixtureSyncMsg); }, [fixtureSyncMsg, setFixtureSyncMsg]);
  useEffect(() => { setFixtureSyncSource(fixtureSyncSource); }, [fixtureSyncSource, setFixtureSyncSource]);
  useEffect(() => { setLoadRealTimeFixtures(() => loadRealTimeFixtures); }, [loadRealTimeFixtures, setLoadRealTimeFixtures]);
  useEffect(() => { setRiskAlerts(riskAlerts); }, [riskAlerts, setRiskAlerts]);

  // Download stand-alone custom python software file
  const handleExportPython = async () => {
    setIsExporting(true);
    try {
      const response = await fetch("/api/export-python", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ weights: customWeights }),
      });
      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || ("HTTP " + response.status));
      }
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "football_quant_analyzer.py";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch (e: any) {
      console.error("Export error:", e);
      alert("导出 Python 脚本失败：" + (e.message || "未知错误"));
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#090D1A] text-slate-100 font-sans antialiased selection:bg-[#FF3E6C] selection:text-white">

      <PageHeader />

      <main className="max-w-7xl mx-auto px-4 py-6">
        <Routes>
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/standings" element={<StandingsPage />} />
          <Route path="/teams" element={<ErrorBoundary><TeamInfoSection /></ErrorBoundary>} />
          <Route path="/worldcup" element={<WorldCupDashboard />} />
          <Route path="/python" element={<PythonExportTab handleExportPython={handleExportPython} isExporting={isExporting} />} />
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
            <span>2026 赛季赛果数据状态：增量更新已完成 (覆盖英超/意甲/西甲/德甲 200+劲旅完整对赛历史)</span>
          </div>
          <p className="text-[10px] text-red-500/80 max-w-2xl mx-auto leading-relaxed">
            * 再次声明：本软件为开源教学模型，绝不向任何博彩企业、竞彩店铺提供连通、代购服务。理性对待对赛计算结果，反对赌博，遵守法律法规。
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
