import React, { useEffect, useRef } from "react";
import { HashRouter, Routes, Route, Navigate, useNavigate, useLocation } from "react-router-dom";
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
import { useAppStore } from "./store/useAppStore";

// 璺緞涓?activeTab 鏄犲皠
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
  const setRiskAlerts = useAppStore((s) => s.setRiskAlerts);
  const setActiveTab = useAppStore((s) => s.setActiveTab);

  const navigate = useNavigate();
  const isFirstRender = useRef(true);
  const location = useLocation();

  // ===== 鍙屽悜鍚屾锛歛ctiveTab 涓?URL =====

  // activeTab 鍒?URL锛坰tore 椹卞姩瀵艰埅锛屽 setHomeAndGo 瑙﹀彂锛?
  useEffect(() => {
    const targetPath = "/" + activeTab;
    if (location.pathname !== targetPath) {
      navigate(targetPath, { replace: true });
    }
  }, [activeTab]); // eslint-disable-line react-hooks/exhaustive-deps

  // URL 鍒?activeTab锛堟祻瑙堝櫒瀵艰埅椹卞姩 store 鏇存柊锛?
  useEffect(() => {
    const tab = PATH_TO_TAB[location.pathname];
    if (tab && tab !== activeTab) {
      setActiveTab(tab as any);
    }
  }, [location.pathname]); // eslint-disable-line react-hooks/exhaustive-deps

  // 搴旂敤鍚姩鏃惰嚜鍔ㄥ垵濮嬪寲 API Key
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

  // 浣跨敤閲嶆瀯鍚庣殑 Hooks
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

  // 灏?Hook 鏁版嵁鍚屾鍒?Store
  useEffect(() => { setTeams(teams); }, [teams, setTeams]);
  useEffect(() => { setTeamsLoading(isTeamsLoading); }, [isTeamsLoading, setTeamsLoading]);
  useEffect(() => { setTeamsSyncMsg(teamsSyncMsg); }, [teamsSyncMsg, setTeamsSyncMsg]);
  useEffect(() => { setTeamsSyncSource(teamsSyncSource); }, [teamsSyncSource, setTeamsSyncSource]);
  useEffect(() => { setFixtures(fixtures); }, [fixtures, setFixtures]);
  useEffect(() => { setFixturesLoading(isFixturesLoading); }, [isFixturesLoading, setFixturesLoading]);
  useEffect(() => { setFixtureSyncMsg(fixtureSyncMsg); }, [fixtureSyncMsg, setFixtureSyncMsg]);
  useEffect(() => { setFixtureSyncSource(fixtureSyncSource); }, [fixtureSyncSource, setFixtureSyncSource]);
  useEffect(() => { setLoadRealTimeFixtures(loadRealTimeFixtures); }, [loadRealTimeFixtures, setLoadRealTimeFixtures]);
  useEffect(() => { setRiskAlerts(riskAlerts); }, [riskAlerts, setRiskAlerts]);


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
            <span>2026 璧涘璧涙灉鏁版嵁鐘舵€侊細澧為噺鏇存柊宸插畬鎴?(瑕嗙洊鑻辫秴/鎰忕敳/瑗跨敳/寰风敳 200+鍔叉梾瀹屾暣瀵硅禌鍘嗗彶)</span>
          </div>
          <p className="text-[10px] text-red-500/80 max-w-2xl mx-auto leading-relaxed">
            * 鍐嶆澹版槑锛氭湰杞欢涓哄紑婧愭暀瀛︽ā鍨嬶紝缁濅笉鍚戜换浣曞崥褰╀紒涓氥€佺珵褰╁簵閾烘彁渚涜繛閫氥€佷唬璐湇鍔°€傜悊鎬у寰呭璧涜绠楃粨鏋滐紝鍙嶅璧屽崥锛岄伒瀹堟硶寰嬫硶瑙勩€?
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
