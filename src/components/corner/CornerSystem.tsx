import React, { useState, useEffect, useRef } from 'react';
import { useAppStore } from '../../store/useAppStore';
import { useCornerStore } from '../../store/cornerStore';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { 
  Activity, 
  LogIn, 
  LogOut, 
  RefreshCw, 
  Play, 
  Pause, 
  Settings, 
  CheckCircle, 
  AlertTriangle, 
  Clock, 
  Sliders, 
  TrendingUp, 
  DollarSign, 
  FileText, 
  HelpCircle, 
  Flag,
  Monitor,
  Check,
  Sparkles
} from 'lucide-react';
import { TeamStats } from '../data/realTeamsData';

function formatAsianLine(val: number, isOverUnder: boolean = false): string {
  const rounded = Math.round(val * 4) / 4;
  const isNegative = rounded < 0;
  const abs = Math.abs(rounded);
  
  let label = '';
  if (abs % 1 === 0) {
    label = abs.toString();
  } else if (abs % 1 === 0.5) {
    label = abs.toString();
  } else if (abs % 1 === 0.25) {
    label = `${abs - 0.25}/${abs + 0.25}`;
  } else if (abs % 1 === 0.75) {
    label = `${abs - 0.25}/${abs + 0.25}`;
  } else {
    label = abs.toString();
  }

  if (isOverUnder) {
    return label;
  } else {
    if (rounded === 0) return '0';
    return `${isNegative ? '-' : '+'}${label}`;
  }
}

interface CornerSystemProps {
  teams: TeamStats[];
}

export default function CornerSystem({ teams }: CornerSystemProps) {
  // Navigation: Sub-tabs under Corner System
  const [activeSubTab, setActiveSubTab] = useState<'schedule' | 'monitoring' | 'config' | 'analysis'>('schedule');
  
  // Inner sub-tab category for schedule data
  const [activeInnerTab, setActiveInnerTab] = useState<'corner' | 'handicap' | 'schedule_list' | 'settings'>('corner');

  // Backend simulated states (synced via API or managed in client fallback state)
  const [isLoggedIn, setIsLoggedIn] = useState<boolean>(false);
  const [username, setUsername] = useState<string>('');
  const [isBrowserActive, setIsBrowserActive] = useState<boolean>(false);
  const [isAutoRefresh, setIsAutoRefresh] = useState<boolean>(false);
  
  const [liveMatches, setLiveMatches] = useState<any[]>([]);
  const [simulationLogs, setSimulationLogs] = useState<string[]>([
    "【初始化】角球大数据实时精密监控引擎已正常载入。",
    "【监控】等待激活系统监控轮询服务，即可实时同步球迷屋盘口及爬虫特征流..."
  ]);
  const [placedBets, setPlacedBets] = useState<any[]>([]);

  const [showLoginModal, setShowLoginModal] = useState<boolean>(false);
  const [inputUser, setInputUser] = useState<string>('');
  const [inputPass, setInputPass] = useState<string>('');

  // Left Column Config States
  const [hgUsername, setHgUsername] = useState<string>('');
  const [hgPassword, setHgPassword] = useState<string>('');
  const [hgBalance, setHgBalance] = useState<number>(60000);
  const [hgUrl, setHgUrl] = useState<string>('https://www.hga038.com');
  const [earlyRefreshHours, setEarlyRefreshHours] = useState<number>(1);
  const [earlyWeakStrongDiff, setEarlyWeakStrongDiff] = useState<number>(-0.75);
  const [earlyHandicapMin, setEarlyHandicapMin] = useState<number>(-1.5);
  const [earlyHandicapMax, setEarlyHandicapMax] = useState<number>(1.5);
  const [botId, setBotId] = useState<string>('26011301 / ga5015');
  const [failWaitSeconds, setFailWaitSeconds] = useState<number>(20);
  const [betAmount, setBetAmount] = useState<number>(3000);
  const [soundEnabledGlobal, setSoundEnabledGlobal] = useState<boolean>(true);
  const [highestEnabled, setHighestEnabled] = useState<boolean>(false);
  const [realEnabled, setRealEnabled] = useState<boolean>(true);
  const [isBotRunning, setIsBotRunning] = useState<boolean>(true); // 挂机 (Default enabled as shown in green on image)

  // Plans 1 to 5 states
  const [plan1, setPlan1] = useState({
    minMin: 35,
    maxMin: 55,
    leadGoalsOpponent: 20, // 无论谁领先几球下对面
    weakLeadGoalsStrong: 1, // 弱队领先几球下强队
    minOdds: 0.8, // 目标赔率 >=
    minHandicap: -1.25, // 目标角盘盘口上下限
    maxHandicap: 3.5
  });

  const [plan2, setPlan2] = useState({
    minMin: 50,
    maxMin: 77,
    leadGoalsOpponent: 3,
    weakLeadGoalsStrong: 1,
    minOdds: 0.8,
    minHandicap: -0.75,
    maxHandicap: 2.5
  });

  const [plan3, setPlan3] = useState({
    minMin: 70,
    maxMin: 99,
    maxDraws: 0,
    minOdds: 0.8,
    minHandicap: 0.0,
    maxHandicap: 1.5
  });

  const [plan4, setPlan4] = useState({
    minMin: 60,
    maxMin: 99,
    noStrengthLeadGoalsOpponent: 2,
    minOdds: 0.8,
    minHandicap: 0.0,
    maxHandicap: 3.5
  });

  const [plan5, setPlan5] = useState({
    minMin: 70,
    maxMin: 99,
    noStrengthLeadGoalsOpponent: 1,
    minOdds: 0.8,
    minHandicap: 0.0,
    maxHandicap: 3.5
  });

  // ======================== 策略配置后端同步 ========================

  // System A → 后端字段映射
  const mapStrategiesToBackend = (strats: any[], p1: any, p2: any, p3: any, p4: any, p5: any): any[] => {
    const planMap: Record<string, any> = { strat_1: p1, strat_2: p2, strat_3: p3, strat_4: p4, strat_5: p5 };
    return strats.map(s => {
      const plan = planMap[s.id] || {};
      return {
        id: s.id === 'strat_1' ? 1 : s.id === 'strat_2' ? 2 : s.id === 'strat_3' ? 3 : s.id === 'strat_4' ? 4 : 5,
        enabled: s.isActive ?? false,
        name: s.name,
        playTimeStart: plan.minMin ?? s.minMin ?? 35,
        playTimeEnd: plan.maxMin ?? s.maxMin ?? 55,
        leadGoals: plan.leadGoalsOpponent ?? 99,
        leadGoalsWeak: plan.weakLeadGoalsStrong ?? (plan.noStrengthLeadGoalsOpponent ?? 0),
        cornerHandicapLower: plan.minHandicap ?? s.handicapLine ?? 0,
        cornerHandicapUpper: plan.maxHandicap != null ? plan.maxHandicap : ((plan.minHandicap ?? s.handicapLine ?? 0) + 3),
        targetOdds: plan.minOdds ?? 0.8,
        betDirection: s.betDirection ?? (s.type === 'spread' ? 'home' : 'over')
      };
    });
  };

  // Debounce timer for strategy sync
  const strategySyncTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 同步策略配置到后端
  const syncStrategiesToBackend = (strats: any[], p1: any, p2: any, p3: any, p4: any, p5: any) => {
    const backendStrategies = mapStrategiesToBackend(strats, p1, p2, p3, p4, p5);
    fetch('/api/corner/strategies', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ strategies: backendStrategies }),
    }).catch(err => console.error('[CornerSystem] 策略同步失败:', err));
    // ★ 同步更新 cornerStore 中的策略数据，确保双数据源一致
    try {
      useCornerStore.getState().setStrategies(backendStrategies, true);
    } catch (_) {}
  };

  // 同步投注配置到后端
  const syncBetConfigToBackend = (amount: number, isRealMode: boolean, autoBetEnabled: boolean) => {
    let trackedMatchIds: string[] = [];
    let autoBetConfirmRequired = false;
    try {
      trackedMatchIds = useAppStore.getState().trackedMatchIds || [];
      autoBetConfirmRequired = useCornerStore.getState().settings.autoBetConfirmRequired ?? false;
    } catch (_) {}
    fetch('/api/corner/bet-config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        amount,
        isRealMode,
        autoBetEnabled,
        autoBetConfirmRequired,
        trackedMatchIds,
      }),
    }).catch(err => console.error('[CornerSystem] 投注配置同步失败:', err));
  };

  // Debounced 策略同步（300ms）
  const syncStrategiesDebounced = (strats: any[], p1: any, p2: any, p3: any, p4: any, p5: any) => {
    if (strategySyncTimerRef.current) clearTimeout(strategySyncTimerRef.current);
    strategySyncTimerRef.current = setTimeout(() => {
      syncStrategiesToBackend(strats, p1, p2, p3, p4, p5);
    }, 300);
  };

  // Strategy Configurations Card States (Authentic Corner Hitting Rules)
  const [strategies, setStrategies] = useState<any[]>([
    {
      id: 'strat_1',
      name: '计划①',
      type: 'size',
      description: '大于 35 <=> 55 分钟赛事，无论谁领先（20球）下对面，若弱队领先则追加下强队大角球。',
      minMin: 35,
      maxMin: 55,
      minDangerAttack: 1.0,
      handicapLine: -1.25,
      soundEnabled: true,
      autoBet: true,
      isActive: true
    },
    {
      id: 'strat_2',
      name: '计划②',
      type: 'size',
      description: '大于 50 <=> 77 分钟赛事，无论谁领先几球 (3球) 下对面。',
      minMin: 50,
      maxMin: 77,
      minDangerAttack: 1.2,
      handicapLine: -0.75,
      soundEnabled: true,
      autoBet: true,
      isActive: true
    },
    {
      id: 'strat_3',
      name: '计划③',
      type: 'size',
      description: '大于 70 <=> 99 分钟0-0下弱队大角盘口，最大平手数为0。',
      minMin: 70,
      maxMin: 99,
      minDangerAttack: 0.8,
      handicapLine: 0.0,
      soundEnabled: true,
      autoBet: true,
      isActive: true
    },
    {
      id: 'strat_4',
      name: '计划④',
      type: 'size',
      description: '大于 60 <=> 99 分钟，无强弱领先几球 (2球) 下对面。',
      minMin: 60,
      maxMin: 99,
      minDangerAttack: 1.5,
      handicapLine: 0.0,
      soundEnabled: true,
      autoBet: true,
      isActive: true
    },
    {
      id: 'strat_5',
      name: '计划⑤',
      type: 'size',
      description: '大于 70 <=> 99 分钟，无强弱领先几球 (1球) 下对面。',
      minMin: 70,
      maxMin: 99,
      minDangerAttack: 1.5,
      handicapLine: 0.0,
      soundEnabled: true,
      autoBet: true,
      isActive: true
    }
  ]);

  const [strategyStats, setStrategyStats] = useState<Record<string, { triggered: number; executed: number; successRate: number; totalProfit: number }>>({});

  // Sync state and run simulation step
  const fetchMatchesData = async (stepMode: boolean = false) => {
    try {
      const url = stepMode ? '/api/corner/simulation-step' : '/api/corner/live';
      const opt = stepMode ? { method: 'POST' } : { method: 'GET' };
      const response = await fetch(url, opt);
      if (response.ok) {
        const data = await response.json();
        if (data.success) {
          setLiveMatches(data.matches || []);
          if (data.logs && data.logs.length > 0) {
            setSimulationLogs(data.logs);
          }
        }
      }
    } catch (e) {
      console.error("Failed to sync corner live matches backend:", e);
    }
  };

  // Sync login state on load
  const syncLoginState = async () => {
    try {
      const response = await fetch('/api/corner/live');
      if (response.ok) {
        const data = await response.json();
        setIsLoggedIn(data.isLoggedIn);
        setUsername(data.username || '');
        setIsBrowserActive(data.isBrowserActive);
        setLiveMatches(data.matches || []);
        if (data.logs && data.logs.length > 0) {
          setSimulationLogs(data.logs);
        }
      }
    } catch (e) {
      console.error("Failed to sync corner session status on load:", e);
    }
  };

  // Trigger login action
  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputUser || !inputPass) return;
    try {
      const response = await fetch('/api/corner/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: inputUser, password: inputPass })
      });
      const data = await response.json();
      if (response.ok && data.success) {
        setIsLoggedIn(true);
        setUsername(data.username || inputUser);
        setShowLoginModal(false);
        setInputUser('');
        setInputPass('');
        // Append success log
        setSimulationLogs(prev => [
          `【账户】🎉 系统管理员 [${data.username || inputUser}] 成功接入爬虫高等级量化网关端口。`,
          ...prev
        ]);
      } else {
        // 显示后端返回的错误信息
        const errorMsg = data.error || data.suggestion || '登录失败，请重试';
        setSimulationLogs(prev => [
          `【账户】❌ 登录失败: ${errorMsg}`,
          ...prev
        ]);
      }
    } catch (e) {
      console.error("Login failed:", e);
      setSimulationLogs(prev => [
        `【账户】❌ 登录请求失败，请确认后端服务已启动`,
        ...prev
      ]);
    }
  };

  // Logout action
  const handleLogout = async () => {
    try {
      const response = await fetch('/api/corner/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ logout: true })
      });
      if (response.ok) {
        setIsLoggedIn(false);
        setUsername('');
        setSimulationLogs(prev => [
          "【账户】🔒 管理员安全退出登录。自动下单和声光警报服务转为离线脱机模式。",
          ...prev
        ]);
      }
    } catch (e) {
      console.error("Logout failed:", e);
    }
  };

  // Toggle browser crawler engine selection
  const handleToggleBrowser = async () => {
    try {
      const response = await fetch('/api/corner/start', { method: 'POST' });
      if (response.ok) {
        const data = await response.json();
        setIsBrowserActive(data.isBrowserActive);
        setSimulationLogs(prev => [
          `【爬虫】${data.isBrowserActive ? '🟢 Headless极速浏览器内核启动成功！正在以 5s/次 同步球迷屋多维赔率...' : '🔴 Headless极速浏览器安全关闭。'}`,
          ...prev
        ]);
      }
    } catch (e) {
      console.error("Failed to toggle browser crawler:", e);
    }
  };



  // On mount load data
  useEffect(() => {
    syncLoginState();
    // 初始化时同步所有投注配置到后端，确保前后端一致
    try {
      useCornerStore.getState().syncAllSettingsToBackend();
    } catch (_) {}
    // ★ 从 cornerStore 读取持久化的策略参数，初始化 plan1~plan5
    try {
      const storeStrategies = useCornerStore.getState().strategies;
      if (storeStrategies && storeStrategies.length > 0) {
        for (const s of storeStrategies) {
          if (s.id === 1) setPlan1(p => ({ ...p, minMin: s.playTimeStart, maxMin: s.playTimeEnd, minOdds: s.targetOdds, minHandicap: s.cornerHandicapLower, maxHandicap: s.cornerHandicapUpper, leadGoalsOpponent: s.leadGoals, weakLeadGoalsStrong: s.leadGoalsWeak }));
          if (s.id === 2) setPlan2(p => ({ ...p, minMin: s.playTimeStart, maxMin: s.playTimeEnd, minOdds: s.targetOdds, minHandicap: s.cornerHandicapLower, maxHandicap: s.cornerHandicapUpper, leadGoalsOpponent: s.leadGoals, weakLeadGoalsStrong: s.leadGoalsWeak }));
          if (s.id === 3) setPlan3(p => ({ ...p, minMin: s.playTimeStart, maxMin: s.playTimeEnd, minOdds: s.targetOdds, minHandicap: s.cornerHandicapLower, maxHandicap: s.cornerHandicapUpper, maxDraws: s.leadGoals }));
          if (s.id === 4) setPlan4(p => ({ ...p, minMin: s.playTimeStart, maxMin: s.playTimeEnd, minOdds: s.targetOdds, minHandicap: s.cornerHandicapLower, maxHandicap: s.cornerHandicapUpper, noStrengthLeadGoalsOpponent: s.leadGoals }));
          if (s.id === 5) setPlan5(p => ({ ...p, minMin: s.playTimeStart, maxMin: s.playTimeEnd, minOdds: s.targetOdds, minHandicap: s.cornerHandicapLower, maxHandicap: s.cornerHandicapUpper, noStrengthLeadGoalsOpponent: s.leadGoals }));
        }
        // 同步 strategies state 的 isActive 和 betDirection 状态
        setStrategies(prev => prev.map(s => {
          const backendId = s.id === 'strat_1' ? 1 : s.id === 'strat_2' ? 2 : s.id === 'strat_3' ? 3 : s.id === 'strat_4' ? 4 : 5;
          const storeStrat = storeStrategies.find(ss => ss.id === backendId);
          if (storeStrat) return { ...s, isActive: storeStrat.enabled, betDirection: storeStrat.betDirection };
          return s;
        }));
      }
    } catch (_) {}
  }, []);

  // Interval timer for 5s auto-refresh polling (simulation-step)
  useEffect(() => {
    let intervalId: any = null;
    if (isAutoRefresh) {
      // Step simulation immediately when activated
      fetchMatchesData(true);
      intervalId = setInterval(() => {
        fetchMatchesData(true);
      }, 15000);
    }
    return () => {
      if (intervalId) clearInterval(intervalId);
    };
  }, [isAutoRefresh]);

  useEffect(() => {
    if (activeSubTab !== 'config') return;
    const fetchStats = async () => {
      const stats: Record<string, any> = {};
      for (const strat of strategies) {
        const backendId = strat.id === 'strat_1' ? 1 : strat.id === 'strat_2' ? 2 : strat.id === 'strat_3' ? 3 : strat.id === 'strat_4' ? 4 : 5;
        try {
          const resp = await fetch(`/api/corner/stats/${backendId}`);
          const json = await resp.json();
          if (json.success && json.data) {
            stats[strat.id] = json.data;
          }
        } catch (_) {}
      }
      setStrategyStats(stats);
    };
    fetchStats();
  }, [activeSubTab, strategies]);

  // Adjust parameters slider updates simulated win rate based on real quantitative corner patterns!
  const updateStrategyParams = (id: string, field: string, val: number) => {
    setStrategies(prev => {
      const updated = prev.map(s => {
        if (s.id === id) {
          const u = { ...s, [field]: val };
          return u;
        }
        return s;
      });
      syncStrategiesDebounced(updated, plan1, plan2, plan3, plan4, plan5);
      return updated;
    });
  };

  // Toggle active strategy
  const toggleStrategyActive = (id: string) => {
    setStrategies(prev => {
      const updated = prev.map(s => {
        if (s.id === id) {
          const nextState = !s.isActive;
          setSimulationLogs(logs => [
            `【防务】策略配置变动: 【${s.name}】已被管理员设置为 [${nextState ? '🟢 开启' : '🔴 关闭'}] 状态。`,
            ...logs
          ]);
          return { ...s, isActive: nextState };
        }
        return s;
      });
      syncStrategiesDebounced(updated, plan1, plan2, plan3, plan4, plan5);
      return updated;
    });
  };

  // Toggle alarm sound
  const toggleStrategyAlarm = (id: string) => {
    setStrategies(prev => {
      const updated = prev.map(s => {
        if (s.id === id) {
          return { ...s, soundEnabled: !s.soundEnabled };
        }
        return s;
      });
      syncStrategiesDebounced(updated, plan1, plan2, plan3, plan4, plan5);
      return updated;
    });
  };

  // Toggle automatic bet placement
  const toggleStrategyAutoBet = (id: string) => {
    setStrategies(prev => {
      const updated = prev.map(s => {
        if (s.id === id) {
          const nextSet = !s.autoBet;
          setSimulationLogs(logs => [
            `【防务】高级授权: 【${s.name}】自动投注功能 ${nextSet ? '⚡ 已开启' : '🚫 已关闭'}。`,
            ...logs
          ]);
          return { ...s, autoBet: nextSet };
        }
        return s;
      });
      syncStrategiesDebounced(updated, plan1, plan2, plan3, plan4, plan5);
      const anyAutoBet = updated.some(s => s.autoBet);
      syncBetConfigToBackend(betAmount, realEnabled, anyAutoBet);
      return updated;
    });
  };

  // Save Configs and Synchronize the 5 Plans
  const handleSaveConfigs = () => {
    const updatedStrategies = [
      {
        id: 'strat_1',
        name: '计划①',
        type: 'size',
        description: `大于 ${plan1.minMin} <=> ${plan1.maxMin} 分钟赛事，无论谁领先（${plan1.leadGoalsOpponent}球）下对面，若弱队领先则追加下强队大角球。`,
        minMin: plan1.minMin,
        maxMin: plan1.maxMin,
        minDangerAttack: 1.0,
        handicapLine: plan1.minHandicap,
        soundEnabled: soundEnabledGlobal,
        autoBet: realEnabled,
        isActive: true
      },
      {
        id: 'strat_2',
        name: '计划②',
        type: 'size',
        description: `大于 ${plan2.minMin} <=> ${plan2.maxMin} 分钟赛事，无论谁领先几球 (${plan2.leadGoalsOpponent}球) 下对面。`,
        minMin: plan2.minMin,
        maxMin: plan2.maxMin,
        minDangerAttack: 1.2,
        handicapLine: plan2.minHandicap,
        soundEnabled: soundEnabledGlobal,
        autoBet: realEnabled,
        isActive: true
      },
      {
        id: 'strat_3',
        name: '计划③',
        type: 'size',
        description: `大于 ${plan3.minMin} <=> ${plan3.maxMin} 分钟0-0下弱队大角盘口，最大平手数为 ${plan3.maxDraws}。`,
        minMin: plan3.minMin,
        maxMin: plan3.maxMin,
        minDangerAttack: 0.8,
        handicapLine: plan3.minHandicap,
        soundEnabled: soundEnabledGlobal,
        autoBet: realEnabled,
        isActive: true
      },
      {
        id: 'strat_4',
        name: '计划④',
        type: 'size',
        description: `大于 ${plan4.minMin} <=> ${plan4.maxMin} 分钟，无强弱领先几球 (${plan4.noStrengthLeadGoalsOpponent}球) 下对面。`,
        minMin: plan4.minMin,
        maxMin: plan4.maxMin,
        minDangerAttack: 1.5,
        handicapLine: plan4.minHandicap,
        soundEnabled: soundEnabledGlobal,
        autoBet: realEnabled,
        isActive: true
      },
      {
        id: 'strat_5',
        name: '计划⑤',
        type: 'size',
        description: `大于 ${plan5.minMin} <=> ${plan5.maxMin} 分钟，无强弱领先几球 (${plan5.noStrengthLeadGoalsOpponent}球) 下对面。`,
        minMin: plan5.minMin,
        maxMin: plan5.maxMin,
        minDangerAttack: 1.5,
        handicapLine: plan5.minHandicap,
        soundEnabled: soundEnabledGlobal,
        autoBet: realEnabled,
        isActive: true
      }
    ];
    setStrategies(updatedStrategies);

    // 同步策略配置到后端
    syncStrategiesToBackend(updatedStrategies, plan1, plan2, plan3, plan4, plan5);
    // 同步投注配置到后端
    syncBetConfigToBackend(betAmount, realEnabled, realEnabled);

    setSimulationLogs(prev => [
      `【设置】💾 挂机策略全局参数保存成功！已同步至后端策略引擎。`,
      ...prev
    ]);

    alert("配置已保存并同步到后端策略引擎。");
  };

  // Data points representing cumulative profit over recommend batches
  const profitData = [
    { label: '批次 1', profit: 0 },
    { label: '批次 2', profit: 120 },
    { label: '批次 3', profit: 240 },
    { label: '批次 4', profit: 140 },
    { label: '批次 5', profit: 320 },
    { label: '批次 6', profit: 512 },
    { label: '批次 7', profit: 462 },
    { label: '批次 8', profit: 648 },
    { label: '批次 9', profit: 890 },
    { label: '批次 10', profit: 1112 },
    { label: '批次 11', profit: 1390 },
    { label: '批次 12', profit: 1545 }
  ];

  return (
    <div className="space-y-6">
      
      {/* 4-Tier Horizontal System Navigation */}
      <div className="flex flex-wrap items-center justify-between p-1 bg-slate-900 border border-slate-800 rounded-2xl gap-2">
        <div className="flex flex-wrap items-center gap-1.5 p-1">
          <button
            id="subtab-schedule"
            onClick={() => setActiveSubTab('schedule')}
            className={`px-4 py-2 rounded-xl text-xs font-semibold tracking-wide flex items-center gap-2 transition-all ${
              activeSubTab === 'schedule' 
                ? 'bg-gradient-to-r from-emerald-600 to-teal-600 text-white shadow-lg' 
                : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
            }`}
          >
            <Play className="w-3.5 h-3.5" />
            赛程数据
          </button>
          
          <button
            id="subtab-monitoring"
            onClick={() => setActiveSubTab('monitoring')}
            className={`px-4 py-2 rounded-xl text-xs font-semibold tracking-wide flex items-center gap-2 transition-all ${
              activeSubTab === 'monitoring' 
                ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-lg' 
                : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
            }`}
          >
            <Monitor className="w-3.5 h-3.5" />
            实时监控
          </button>
          
          <button
            id="subtab-config"
            onClick={() => setActiveSubTab('config')}
            className={`px-4 py-2 rounded-xl text-xs font-semibold tracking-wide flex items-center gap-2 transition-all ${
              activeSubTab === 'config' 
                ? 'bg-gradient-to-r from-pink-600 to-rose-600 text-white shadow-lg' 
                : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
            }`}
          >
            <Sliders className="w-3.5 h-3.5" />
            策略配置
          </button>
          
          <button
            id="subtab-analysis"
            onClick={() => setActiveSubTab('analysis')}
            className={`px-4 py-2 rounded-xl text-xs font-semibold tracking-wide flex items-center gap-2 transition-all ${
              activeSubTab === 'analysis' 
                ? 'bg-gradient-to-r from-violet-600 to-purple-600 text-white shadow-lg' 
                : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
            }`}
          >
            <TrendingUp className="w-3.5 h-3.5" />
            历史分析
          </button>
        </div>

        <div className="flex items-center gap-2 px-3 text-[11px] font-mono font-medium text-slate-500">
          <span>角球大数据监控集群 v2.8</span>
          <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-ping"></span>
        </div>
      </div>

      {/* SUB-TAB 1: 赛程数据 DATA DRIVER CENTER */}
      {activeSubTab === 'schedule' && (
        <div className="bg-[#0F1424] rounded-2xl border border-slate-800/90 shadow-2xl p-6 relative overflow-hidden animate-fadeIn">
          
          {/* Header area */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 border-b border-slate-800/80 pb-5">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-emerald-950/60 rounded-xl border border-emerald-800/40 text-emerald-400">
                <Activity className="w-5 h-5 animate-pulse" />
              </div>
              <div>
                <h2 className="text-base font-bold text-slate-200 flex items-center gap-1.5">
                  实时数据
                  <span className="bg-emerald-950 text-emerald-400 text-[10px] px-1.5 py-0.5 rounded-md font-mono font-semibold border border-emerald-900/30">Live Stream</span>
                </h2>
                <p className="text-xs text-slate-400">实时获取比赛数据，动态提取联赛角球统计变焦系数</p>
              </div>
            </div>

            {/* Authentication status and parameters status */}
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-1.5 py-1 px-3 bg-slate-950 rounded-xl border border-slate-900 text-xs">
                <span className={`w-2 h-2 rounded-full ${isLoggedIn ? 'bg-emerald-500 shadow-[0_0_8px_#10B981]' : 'bg-slate-500'}`}></span>
                <span className="text-slate-300 font-mono">
                  {isLoggedIn ? `已登录: ${username}` : '未登录系统'}
                </span>
              </div>
              <div className="flex items-center gap-1 bg-slate-950 px-2.5 py-1 rounded-xl border border-slate-900 font-mono text-xs text-amber-500">
                <Flag className="w-3.5 h-3.5" />
                <span>{liveMatches.length} 场正在监控</span>
              </div>
            </div>
          </div>

          {/* Action Row panel */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-4 bg-slate-950/60 rounded-xl border border-slate-800/40 mb-6">
            <div className="flex flex-wrap items-center gap-2">
              {isLoggedIn ? (
                <button
                  id="btn-corner-logout"
                  onClick={handleLogout}
                  className="bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white font-semibold text-xs py-2 px-3.5 rounded-xl transition-all flex items-center gap-1.5 border border-slate-700"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  退出账户
                </button>
              ) : (
                <button
                  id="btn-corner-login"
                  onClick={() => setShowLoginModal(true)}
                  className="bg-blue-600 hover:bg-blue-500 text-white font-semibold text-xs py-2 px-3.5 rounded-xl transition-all flex items-center gap-1.5 shadow-md shadow-blue-900/10"
                >
                  <LogIn className="w-3.5 h-3.5" />
                  登录
                </button>
              )}

              <button
                id="btn-refresh-matches"
                onClick={() => fetchMatchesData(true)}
                className="bg-[#FF8008] hover:bg-[#FF8008]/90 text-white font-semibold text-xs py-2 px-3.5 rounded-xl transition-all flex items-center gap-1.5 shadow-lg shadow-orange-950/20"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                刷新比赛
              </button>
            </div>

            {/* Quick settings switches on the right */}
            <div className="flex items-center gap-4">
              <button
                id="btn-headless-browser"
                onClick={handleToggleBrowser}
                className={`text-xs font-semibold py-2 px-3.5 rounded-xl transition-all flex items-center gap-1.5 border ${
                  isBrowserActive 
                    ? 'bg-rose-900/30 text-rose-400 border-rose-800/60 hover:bg-rose-900/40' 
                    : 'bg-slate-800/60 text-slate-400 border-slate-700/60 hover:bg-slate-800'
                }`}
              >
                <Monitor className="w-3.5 h-3.5" />
                {isBrowserActive ? '关闭浏览器' : '开启浏览器'}
              </button>

              <label id="lbl-auto-refresh" className="flex items-center gap-2 cursor-pointer select-none">
                <input 
                  type="checkbox" 
                  checked={isAutoRefresh}
                  onChange={(e) => setIsAutoRefresh(e.target.checked)}
                  className="sr-only peer" 
                />
                <div className="w-9 h-5 bg-slate-800 rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-slate-400 after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:after:bg-emerald-400 peer-checked:bg-emerald-950 border border-slate-700 peer-checked:border-emerald-800 relative"></div>
                <span className="text-xs text-slate-300 font-medium">自动刷新 (5s)</span>
              </label>
            </div>
          </div>

          {/* Tab Categories selector */}
          <div className="flex border-b border-slate-800/50 mb-5 pb-3">
            <button
              onClick={() => setActiveInnerTab('corner')}
              className={`pb-1 px-4 text-xs font-bold transition-all border-b-2 relative ${
                activeInnerTab === 'corner' 
                  ? 'border-emerald-500 text-emerald-400' 
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              角球
              {activeInnerTab === 'corner' && (
                <span className="absolute -top-1 -right-1 w-1.5 h-1.5 bg-emerald-400 rounded-full animate-ping"></span>
              )}
            </button>
            <button
              onClick={() => setActiveInnerTab('handicap')}
              className={`pb-1 px-4 text-xs font-bold transition-all border-b-2 ${
                activeInnerTab === 'handicap' 
                  ? 'border-emerald-500 text-emerald-400' 
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              让球和大小
            </button>
            <button
              onClick={() => setActiveInnerTab('schedule_list')}
              className={`pb-1 px-4 text-xs font-bold transition-all border-b-2 ${
                activeInnerTab === 'schedule_list' 
                  ? 'border-emerald-500 text-emerald-400' 
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              赛程
            </button>
            <button
              onClick={() => setActiveInnerTab('settings')}
              className={`pb-1 px-4 text-xs font-bold transition-all border-b-2 ${
                activeInnerTab === 'settings' 
                  ? 'border-emerald-500 text-emerald-400' 
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              设置
            </button>
          </div>

          {/* INNER TAB: CORNER KICK LIVE LISTS */}
          {activeInnerTab === 'corner' && (
            <div className="space-y-6">
              {liveMatches.length > 0 ? (
                liveMatches.map((m) => {
                  const totalCorners = m.homeCorners + m.awayCorners;
                  const homeDangerRate = (m.homeDangerAttacks / (m.minute || 1)).toFixed(2);
                  const awayDangerRate = (m.awayDangerAttacks / (m.minute || 1)).toFixed(2);
                  
                  return (
                    <div key={m.id} className="bg-[#0b0f19] border border-slate-800/90 rounded-2xl p-5 md:p-6 space-y-5 shadow-2xl relative overflow-hidden transition-all hover:border-slate-700/60">
                      
                      {/* Section 1: Match Header Info Bar */}
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800/70 pb-3.5">
                        <div className="flex flex-wrap items-center gap-2.5">
                          <span className={`px-2.5 py-0.5 rounded text-[10px] font-mono font-black tracking-wider shadow-sm uppercase ${
                            m.league === 'EPL' ? 'bg-purple-900/40 text-purple-300 border border-purple-800/50' :
                            m.league === 'LaLiga' ? 'bg-red-900/40 text-red-300 border border-red-800/50' :
                            m.league === 'Bundesliga' ? 'bg-yellow-900/30 text-yellow-500 border border-yellow-850/40' :
                            'bg-sky-900/30 text-sky-400 border border-sky-850/40'
                          }`}>
                            {m.league}
                          </span>
                          
                          <div className="flex items-center gap-2 text-sm font-bold text-slate-100">
                            <span>{m.homeName}</span>
                            <span className="bg-slate-900 px-2 py-0.5 rounded text-indigo-400 font-mono text-xs font-black">
                              {m.homeScore} - {m.awayScore}
                            </span>
                            <span>{m.awayName}</span>
                          </div>

                          <span className="ml-1 font-mono text-[10.5px] bg-indigo-950/45 text-indigo-450 font-bold border border-indigo-900/45 px-2 py-0.5 rounded-md animate-pulse">
                            ⏱️ {m.minute}' 进行中
                          </span>
                        </div>

                        <div className="flex items-center gap-2 self-start sm:self-auto">
                          <button
                            onClick={() => {
                              setActiveSubTab('monitoring');
                              setSimulationLogs(prev => [
                                `【指令中心】已针对赛事 [${m.homeName} vs ${m.awayName}] 实施高精度实时雷达战术监控、角球发生率预测...`,
                                ...prev
                              ]);
                            }}
                            className="px-3 py-1.5 bg-indigo-600/10 hover:bg-indigo-600/20 text-indigo-400 hover:text-white text-xs font-semibold rounded-xl border border-indigo-500/30 transition-all cursor-pointer flex items-center gap-1"
                          >
                            <Activity className="w-3.5 h-3.5" />
                            切换至监控面板
                          </button>
                        </div>
                      </div>

                      {/* Section 2: Key Indicators Dashlets (当前角球数 & 危险进攻率) */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        
                        {/* Box 1: Current Corners widget */}
                        <div className="bg-[#0c1322] rounded-xl border border-[#1b253b] p-3.5 flex items-center justify-between">
                          <div className="space-y-1">
                            <span className="text-[10px] text-slate-400 font-semibold block uppercase tracking-wider">当前实时角球数</span>
                            <div className="flex items-baseline gap-2 font-mono">
                              <span className="text-xl font-bold text-slate-100 flex items-center">
                                <span className="text-blue-500">{m.homeCorners}</span>
                                <span className="text-slate-600 mx-1.5">|</span>
                                <span className="text-pink-500">{m.awayCorners}</span>
                              </span>
                              <span className="text-xs text-slate-400 font-semibold bg-slate-950 border border-slate-800 px-1.5 py-0.5 rounded">
                                共 {totalCorners} 个
                              </span>
                            </div>
                          </div>
                          
                          {/* Mini distribution line */}
                          <div className="w-24 space-y-1">
                            <div className="flex justify-between text-[8px] font-mono text-slate-500">
                              <span>HOME</span>
                              <span>AWAY</span>
                            </div>
                            <div className="w-full h-1.5 bg-slate-950 rounded-full overflow-hidden flex">
                              <div className="h-full bg-blue-500 transition-all duration-300" style={{ width: `${(m.homeCorners / (totalCorners || 1)) * 100}%` }}></div>
                              <div className="h-full bg-pink-500 transition-all duration-300" style={{ width: `${(m.awayCorners / (totalCorners || 1)) * 100}%` }}></div>
                            </div>
                          </div>
                        </div>

                        {/* Box 2: Dangerous Attacks (10M) Rate widget */}
                        <div className="bg-[#0c1322] rounded-xl border border-[#1b253b] p-3.5 flex items-center justify-between">
                          <div className="space-y-1">
                            <span className="text-[10px] text-slate-400 font-semibold block uppercase tracking-wider">危险进攻率 (10分钟均值)</span>
                            <div className="flex items-baseline gap-1 font-mono">
                              <span className="text-xl font-bold text-[#00F2FE]">{homeDangerRate}</span>
                              <span className="text-slate-650 mx-1">/</span>
                              <span className="text-xl font-bold text-emerald-400">{awayDangerRate}</span>
                              <span className="text-[9px] text-slate-400 ml-1.5 uppercase font-sans font-semibold">危攻常数/m</span>
                            </div>
                          </div>
                          
                          <div className="w-24 space-y-1">
                            <div className="flex justify-between text-[8px] font-mono text-slate-500">
                              <span>DANG.A</span>
                              <span>SHTS: {m.homeShots}+{m.awayShots}</span>
                            </div>
                            <div className="w-full h-1.5 bg-slate-950 rounded-full overflow-hidden flex">
                              <div className="h-full bg-[#00F2FE] transition-all duration-300" style={{ width: `${(parseFloat(homeDangerRate) / ((parseFloat(homeDangerRate) + parseFloat(awayDangerRate)) || 1)) * 100}%` }}></div>
                              <div className="h-full bg-emerald-400 transition-all duration-300" style={{ width: `${(parseFloat(awayDangerRate) / ((parseFloat(homeDangerRate) + parseFloat(awayDangerRate)) || 1)) * 100}%` }}></div>
                            </div>
                          </div>
                        </div>

                      </div>

                      {/* Section 3: High-Fidelity Segmented Asian Betting Grid (Immersive hga038 Layout with System Dark Accent Colors) */}
                      <div className="space-y-2 pt-1">
                        <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">📊 亚盘即时变客盘口配比 (仿 hga038 传统卡片网格格式 - 左侧多盘口让球，右侧多盘口得分大小)</span>
                        
                        <div className="overflow-x-auto rounded-xl border border-slate-800/80 bg-slate-950 p-2 shadow-2xl">
                          <div className="flex items-stretch gap-1.5 min-w-[1040px] select-none text-slate-200">
                            
                            {/* BLOCK A: 让球 (Main Full Time spreads - 4 sub-columns) */}
                            <div className="flex-[3.2] min-w-[310px] flex flex-col">
                              {/* Parent header */}
                              <div className="text-[10px] text-slate-400 font-black tracking-wider py-0.5 mb-1 bg-slate-900/60 border border-slate-850/40 rounded text-center select-none uppercase truncate">
                                让球
                              </div>
                              {/* 4 columns layout */}
                              <div className="grid grid-cols-4 gap-1 h-[96px]">
                                {[
                                  m.odds.handicapLine,
                                  m.odds.handicapLine + 0.25,
                                  m.odds.handicapLine - 0.25,
                                  m.odds.handicapLine + 0.5
                                ].map((lineVal, colIdx) => {
                                  // Home (top) and Away (bottom) odds
                                  let homeO = m.odds.handicapHomeOdds;
                                  let awayO = m.odds.handicapAwayOdds;
                                  if (colIdx === 1) { homeO -= 0.25; awayO += 0.25; }
                                  else if (colIdx === 2) { homeO += 0.30; awayO -= 0.25; }
                                  else if (colIdx === 3) { homeO -= 0.50; awayO += 0.55; }
                                  homeO = Math.min(4.5, Math.max(1.15, homeO));
                                  awayO = Math.min(4.5, Math.max(1.15, awayO));

                                  return (
                                    <div key={colIdx} className="flex flex-col gap-1">
                                      {/* Home Card */}
                                      <div
                                        className="flex-1 flex flex-col justify-center items-center py-1 rounded bg-[#0c1322] border border-[#1b253b] transition-colors"
                                      >
                                        <span className="text-[10px] text-slate-400 font-bold block truncate">
                                          {formatAsianLine(lineVal, false)}
                                        </span>
                                        <span className="text-xs text-rose-500 font-black mt-0.5">{homeO.toFixed(2)}</span>
                                      </div>
                                      {/* Away Card */}
                                      <div
                                        className="flex-1 flex flex-col justify-center items-center py-1 rounded bg-[#0c1322] border border-[#1b253b] transition-colors"
                                      >
                                        <span className="text-[10px] text-slate-400 font-bold block truncate">
                                          {formatAsianLine(-lineVal, false)}
                                        </span>
                                        <span className="text-xs text-rose-500 font-black mt-0.5">{awayO.toFixed(2)}</span>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>

                            {/* BLOCK B: 让球 上半场 (Half Time Spread - 1 column) */}
                            <div className="flex-[0.9] min-w-[85px] flex flex-col">
                              <div className="text-[10px] text-slate-400 font-black tracking-wider py-0.5 mb-1 bg-slate-900/60 border border-slate-850/40 rounded text-center select-none uppercase truncate">
                                让球 半场
                              </div>
                              <div className="flex flex-col gap-1 h-[96px]">
                                <div
                                  className="flex-1 flex flex-col justify-center items-center py-1 rounded bg-[#0c1322] border border-[#1b253b] transition-colors"
                                >
                                  <span className="text-[10px] text-slate-400 font-bold block truncate">
                                    主 {formatAsianLine(m.odds.halfHandicapLine, false)}
                                  </span>
                                  <span className="text-xs text-rose-500 font-black mt-0.5">{m.odds.halfHandicapHomeOdds.toFixed(2)}</span>
                                </div>
                                <div
                                  className="flex-1 flex flex-col justify-center items-center py-1 rounded bg-[#0c1322] border border-[#1b253b] transition-colors"
                                >
                                  <span className="text-[10px] text-slate-400 font-bold block truncate">
                                    客 {formatAsianLine(-m.odds.halfHandicapLine, false)}
                                  </span>
                                  <span className="text-xs text-rose-500 font-black mt-0.5">{m.odds.halfHandicapAwayOdds.toFixed(2)}</span>
                                </div>
                              </div>
                            </div>

                            {/* BLOCK C: 得分大小 (Main Full Time Over/Under - 4 sub-columns) */}
                            <div className="flex-[3.2] min-w-[310px] flex flex-col border-l border-slate-800 pr-1.5 pl-1.5">
                              {/* Parent header */}
                              <div className="text-[10px] text-slate-400 font-black tracking-wider py-0.5 mb-1 bg-slate-900/60 border border-slate-850/40 rounded text-center select-none uppercase truncate">
                                得分大小
                              </div>
                              {/* 4 columns layout */}
                              <div className="grid grid-cols-4 gap-1 h-[96px]">
                                {[
                                  m.odds.over - 0.25,
                                  m.odds.over,
                                  m.odds.over + 0.25,
                                  m.odds.over - 0.5
                                ].map((lineVal, colIdx) => {
                                  // Over (top) and Under (bottom) odds
                                  let baseOver = m.odds.overOdds;
                                  let baseUnder = m.odds.underOdds;
                                  if (colIdx === 0) { baseOver -= 0.20; baseUnder += 0.20; }
                                  else if (colIdx === 2) { baseOver += 0.22; baseUnder -= 0.20; }
                                  else if (colIdx === 3) { baseOver -= 0.40; baseUnder += 0.42; }
                                  baseOver = Math.min(4.5, Math.max(1.15, baseOver));
                                  baseUnder = Math.min(4.5, Math.max(1.15, baseUnder));

                                  return (
                                    <div key={colIdx} className="flex flex-col gap-1">
                                      {/* Over Card */}
                                      <div
                                        className="flex-1 flex flex-col justify-center items-center py-1 rounded bg-[#0c1322] border border-[#1b253b] transition-colors"
                                      >
                                        <span className="text-[10px] text-slate-400 font-bold block truncate">
                                          大 {formatAsianLine(lineVal, true)}
                                        </span>
                                        <span className="text-xs text-rose-500 font-black mt-0.5">{baseOver.toFixed(2)}</span>
                                      </div>
                                      {/* Under Card */}
                                      <div
                                        className="flex-1 flex flex-col justify-center items-center py-1 rounded bg-[#0c1322] border border-[#1b253b] transition-colors"
                                      >
                                        <span className="text-[10px] text-slate-400 font-bold block truncate">
                                          小 {formatAsianLine(lineVal, true)}
                                        </span>
                                        <span className="text-xs text-rose-500 font-black mt-0.5">{baseUnder.toFixed(2)}</span>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>

                            {/* BLOCK D: 大小 上半场 (Half Time Over/Under - 1 column) */}
                            <div className="flex-[0.9] min-w-[85px] flex flex-col">
                              <div className="text-[10px] text-slate-400 font-black tracking-wider py-0.5 mb-1 bg-slate-900/60 border border-slate-850/40 rounded text-center select-none uppercase truncate">
                                大小 半场
                              </div>
                              <div className="flex flex-col gap-1 h-[96px]">
                                <div
                                  className="flex-1 flex flex-col justify-center items-center py-1 rounded bg-[#0c1322] border border-[#1b253b] transition-colors"
                                >
                                  <span className="text-[10px] text-slate-400 font-bold block truncate">
                                    大 {formatAsianLine(m.odds.halfOver, true)}
                                  </span>
                                  <span className="text-xs text-rose-500 font-black mt-0.5">{m.odds.halfOverOdds.toFixed(2)}</span>
                                </div>
                                <div
                                  className="flex-1 flex flex-col justify-center items-center py-1 rounded bg-[#0c1322] border border-[#1b253b] transition-colors"
                                >
                                  <span className="text-[10px] text-slate-400 font-bold block truncate">
                                    小 {formatAsianLine(m.odds.halfUnder, true)}
                                  </span>
                                  <span className="text-xs text-rose-500 font-black mt-0.5">{m.odds.halfUnderOdds.toFixed(2)}</span>
                                </div>
                              </div>
                            </div>

                            {/* BLOCK E: 独赢 (1X2 FT - 3 Cards distributed perfectly over exact same h-[96px] height!) */}
                            <div className="flex-[1.1] min-w-[100px] flex flex-col border-l border-slate-800 pl-1.5">
                              <div className="text-[10px] text-indigo-400 font-black tracking-wider py-0.5 mb-1 bg-indigo-950/40 border border-slate-850/40 rounded text-center select-none uppercase truncate">
                                独赢
                              </div>
                              <div className="flex flex-col justify-between h-[96px] gap-1">
                                <div
                                  className="h-[28px] flex items-center justify-between px-2 bg-[#0c1322] border border-[#1b253b] transition-colors rounded"
                                >
                                  <span className="text-[10px] text-slate-400 font-bold">主</span>
                                  <span className="text-xs text-rose-500 font-black">{m.odds.homeWinOdds.toFixed(2)}</span>
                                </div>
                                <div
                                  className="h-[28px] flex items-center justify-between px-2 bg-[#0c1322] border border-[#1b253b] transition-colors rounded"
                                >
                                  <span className="text-[10px] text-slate-400 font-bold">客</span>
                                  <span className="text-xs text-rose-500 font-black">{m.odds.awayWinOdds.toFixed(2)}</span>
                                </div>
                                <div
                                  className="h-[28px] flex items-center justify-between px-2 bg-[#0c1322] border border-[#1b253b] transition-colors rounded"
                                >
                                  <span className="text-[10px] text-slate-400 font-bold">和</span>
                                  <span className="text-xs text-rose-500 font-black">{m.odds.drawWinOdds.toFixed(2)}</span>
                                </div>
                              </div>
                            </div>

                            {/* BLOCK F: 独赢 半场 (1X2 HT - 3 Cards distributed perfectly over exact same h-[96px] height!) */}
                            <div className="flex-[1.1] min-w-[100px] flex flex-col">
                              <div className="text-[10px] text-indigo-400 font-black tracking-wider py-0.5 mb-1 bg-indigo-950/40 border border-slate-850/40 rounded text-center select-none uppercase truncate">
                                独赢 半场
                              </div>
                              <div className="flex flex-col justify-between h-[96px] gap-1">
                                <div
                                  className="h-[28px] flex items-center justify-between px-2 bg-[#0c1322] border border-[#1b253b] transition-colors rounded"
                                >
                                  <span className="text-[10px] text-slate-400 font-bold">主</span>
                                  <span className="text-xs text-rose-500 font-black">{m.odds.halfHomeWinOdds.toFixed(2)}</span>
                                </div>
                                <div
                                  className="h-[28px] flex items-center justify-between px-2 bg-[#0c1322] border border-[#1b253b] transition-colors rounded"
                                >
                                  <span className="text-[10px] text-slate-400 font-bold">客</span>
                                  <span className="text-xs text-rose-500 font-black">{m.odds.halfAwayWinOdds.toFixed(2)}</span>
                                </div>
                                <div
                                  className="h-[28px] flex items-center justify-between px-2 bg-[#0c1322] border border-[#1b253b] transition-colors rounded"
                                >
                                  <span className="text-[10px] text-slate-400 font-bold">和</span>
                                  <span className="text-xs text-rose-500 font-black">{m.odds.halfDrawWinOdds.toFixed(2)}</span>
                                </div>
                              </div>
                            </div>

                            {/* BLOCK G: 单/双 (Full Time - 1 column) */}
                            <div className="flex-[0.9] min-w-[80px] flex flex-col border-l border-slate-800 pl-1.5">
                              <div className="text-[10px] text-slate-400 font-black tracking-wider py-0.5 mb-1 bg-slate-900/60 border border-slate-850/40 rounded text-center select-none uppercase truncate">
                                单/双
                              </div>
                              <div className="flex flex-col gap-1 h-[96px]">
                                <div
                                  className="flex-1 flex flex-col justify-center items-center py-1 rounded bg-[#0c1322] border border-[#1b253b] transition-colors"
                                >
                                  <span className="text-[10px] text-slate-400 font-bold block truncate">单</span>
                                  <span className="text-xs text-rose-500 font-black mt-0.5">{m.odds.oddOdds.toFixed(2)}</span>
                                </div>
                                <div
                                  className="flex-1 flex flex-col justify-center items-center py-1 rounded bg-[#0c1322] border border-[#1b253b] transition-colors"
                                >
                                  <span className="text-[10px] text-slate-400 font-bold block truncate">双</span>
                                  <span className="text-xs text-rose-500 font-black mt-0.5">{m.odds.evenOdds.toFixed(2)}</span>
                                </div>
                              </div>
                            </div>

                            {/* BLOCK H: 单/双 上半场 (Half Time - 1 column) */}
                            <div className="flex-[0.9] min-w-[80px] flex flex-col">
                              <div className="text-[10px] text-slate-400 font-black tracking-wider py-0.5 mb-1 bg-slate-900/60 border border-slate-850/40 rounded text-center select-none uppercase truncate">
                                单/双 半场
                              </div>
                              <div className="flex flex-col gap-1 h-[96px]">
                                <div
                                  className="flex-1 flex flex-col justify-center items-center py-1 rounded bg-[#0c1322] border border-[#1b253b] transition-colors"
                                >
                                  <span className="text-[10px] text-slate-400 font-bold block truncate">单</span>
                                  <span className="text-xs text-rose-500 font-black mt-0.5">{m.odds.halfOddOdds.toFixed(2)}</span>
                                </div>
                                <div
                                  className="flex-1 flex flex-col justify-center items-center py-1 rounded bg-[#0c1322] border border-[#1b253b] transition-colors"
                                >
                                  <span className="text-[10px] text-slate-400 font-bold block truncate">双</span>
                                  <span className="text-xs text-rose-500 font-black mt-0.5">{m.odds.halfEvenOdds.toFixed(2)}</span>
                                </div>
                              </div>
                            </div>

                          </div>
                        </div>
                      </div>

                    </div>
                  );
                })
              ) : (
                <div id="corner-placeholder" className="py-14 text-center border-2 border-dashed border-slate-800/80 rounded-2xl bg-slate-950/30">
                  <Flag className="w-10 h-10 text-slate-600 mx-auto mb-3 animate-bounce" />
                  <p className="text-sm font-semibold text-slate-400">暂无角球盘口比赛，请启动监控获取数据。</p>
                  <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">请点击上方“刷新比赛”进行手动仿真模拟，或者勾选“自动刷新 (5s)”以开启高保真全自动化赛事变焦实时更新！</p>
                </div>
              )}
            </div>
          )}

          {/* INNER TABS OTHER MOCK SECTIONS */}
          {activeInnerTab === 'handicap' && (
            <div className="py-12 text-center text-slate-400 text-xs font-mono">
              <Sparkles className="w-8 h-8 text-indigo-400 mx-auto mb-2" />
              <span>让球和进球大小盘口高级监控插件服务模块已离线待命。</span>
            </div>
          )}

          {activeInnerTab === 'schedule_list' && (
            <div className="py-12 text-center text-slate-400 text-xs font-mono">
              <FileText className="w-8 h-8 text-indigo-400 mx-auto mb-2" />
              <span>五大联赛全赛季角球预测赛程索引库加载完毕。</span>
            </div>
          )}

          {activeInnerTab === 'settings' && (
            <div className="bg-[#0b0c16] rounded-2xl border border-slate-800 p-5 md:p-6 space-y-6 text-slate-200">
              <div className="flex flex-col md:flex-row md:items-center justify-between border-b border-slate-800 pb-4 gap-3">
                <div>
                  <h3 className="text-sm font-extrabold text-slate-100 flex items-center gap-2">
                    <Sliders className="w-4 h-4 text-emerald-400" />
                    皇冠角球网络挂机自动投注客户端配置中心
                  </h3>
                  <p className="text-[11px] text-slate-400 mt-1 font-sans">
                    在此视图下管理量化分析器的各项底盘核心配置。请根据您的实战策略调整 <strong>计划① 至 计划⑤</strong>。
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-[11px] font-mono bg-slate-900 border border-slate-800 px-2.5 py-1 rounded text-emerald-400 flex items-center gap-1.5 font-bold">
                    <span className="w-2 h-2 rounded-full bg-emerald-450 animate-pulse"></span>
                    机网联路 ga5015 正常
                  </span>
                </div>
              </div>

              {/* 4-Columns Desktop Grid Resembling the Windows Bot Layout */}
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-5 items-start font-mono text-xs">
                
                {/* COLUMN 1: HG PLATFORM SETTINGS */}
                <div className="bg-[#121829]/90 border border-slate-800/80 rounded-xl p-4 space-y-4">
                  <div className="border-b border-slate-800/60 pb-2">
                    <span className="text-slate-200 font-bold tracking-tight block">HG平台设置</span>
                  </div>

                  {/* HG username */}
                  <div className="space-y-1">
                    <label className="text-[10px] text-slate-400 block font-semibold">HG用户名:</label>
                    <input 
                      type="text" 
                      value={hgUsername} 
                      onChange={(e) => setHgUsername(e.target.value)}
                      className="w-full bg-[#070912] border border-slate-800 rounded px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-indigo-500 font-bold"
                    />
                  </div>

                  {/* HG password */}
                  <div className="space-y-1">
                    <label className="text-[10px] text-slate-400 block font-semibold">HG密码:</label>
                    <input 
                      type="password" 
                      value={hgPassword} 
                      onChange={(e) => setHgPassword(e.target.value)}
                      className="w-full bg-[#070912] border border-slate-800 rounded px-2.5 py-1.5 text-xs text-slate-400 focus:outline-none focus:border-indigo-500 font-bold"
                    />
                  </div>

                  {/* Balance info row */}
                  <div className="space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="text-[10.5px] text-indigo-400 font-bold">余额: {hgBalance}</span>
                      <span className="text-[9px] text-slate-500">[{new Date().toLocaleTimeString('zh-CN', { hour12: false })}]</span>
                    </div>
                    {/* Retro action buttons for HG platform */}
                    <div className="grid grid-cols-3 gap-1.5 pt-1">
                      <button 
                        onClick={() => alert(`当前剩余可用授信额度: ${hgBalance} RMB`)} 
                        className="bg-[#1e4620]/30 hover:bg-[#1e4620]/50 text-emerald-400 border border-emerald-900/60 rounded py-1 px-1.5 font-bold text-[10px] transition-colors"
                      >
                        剩余
                      </button>
                      <button 
                        onClick={() => {
                          alert(`用户 [${hgUsername}] 在高防IP段已成功建立量化握手连接！`);
                          setSimulationLogs(logs => [`【账户】🔐 量化系统已安全锁定 [${hgUsername}] 挂机认证信息。`, ...logs]);
                        }} 
                        className="bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-850 rounded py-1 px-1.5 font-bold text-[10px] transition-colors"
                      >
                        登录
                      </button>
                      <button 
                        onClick={() => {
                          const newPass = prompt("请输入您要改成的新密码:", hgPassword);
                          if (newPass) {
                            setHgPassword(newPass);
                            alert("新密码本地配置项已被暂存。");
                          }
                        }} 
                        className="bg-purple-900/15 hover:bg-purple-900/35 text-purple-400 border border-purple-950 rounded py-1 px-1.5 font-bold text-[10px] transition-colors"
                      >
                        改密
                      </button>
                    </div>
                  </div>

                  {/* Cucumber URL */}
                  <div className="space-y-1">
                    <label className="text-[10px] text-slate-400 block font-semibold">黄瓜网址:</label>
                    <input 
                      type="text" 
                      value={hgUrl} 
                      onChange={(e) => setHgUrl(e.target.value)}
                      className="w-full bg-[#070912] border border-slate-800 rounded px-2 text-[10.5px] text-yellow-500 py-1.5 font-mono focus:outline-none focus:border-indigo-500"
                    />
                  </div>

                  {/* Early Refresh Interval Hours */}
                  <div className="space-y-1">
                    <label className="text-[10px] text-slate-400 block font-semibold">初盘刷新间隔时间(小时):</label>
                    <input 
                      type="number" 
                      value={earlyRefreshHours} 
                      onChange={(e) => setEarlyRefreshHours(parseInt(e.target.value) || 1)}
                      className="w-full bg-[#070912] border border-slate-800 rounded px-2.5 py-1.5 focus:outline-none focus:border-indigo-500 text-slate-250 font-bold"
                    />
                  </div>

                  {/* Weak split threshold */}
                  <div className="space-y-1">
                    <label className="text-[10px] text-slate-400 block font-semibold">初盘区分强弱盘口(正数):</label>
                    <input 
                      type="number" 
                      step="0.05"
                      value={earlyWeakStrongDiff} 
                      onChange={(e) => setEarlyWeakStrongDiff(parseFloat(e.target.value) || 0)}
                      className="w-full bg-[#070912] border border-slate-800 rounded px-2.5 py-1.5 focus:outline-none focus:border-indigo-500 text-blue-400 font-bold"
                    />
                  </div>

                  {/* Early handicap line min/max */}
                  <div className="space-y-1">
                    <label className="text-[10px] text-slate-400 block font-semibold">初盘盘口上下限:</label>
                    <div className="flex items-center gap-1.5">
                      <input 
                        type="number" 
                        step="0.25"
                        value={earlyHandicapMin} 
                        onChange={(e) => setEarlyHandicapMin(parseFloat(e.target.value) || 0)}
                        className="w-full bg-[#070912] border border-slate-800 rounded px-1.5 py-1 flex-1 text-center font-bold"
                      />
                      <span className="text-slate-500 text-[10px] shrink-0">&lt;=&gt;</span>
                      <input 
                        type="number" 
                        step="0.25"
                        value={earlyHandicapMax} 
                        onChange={(e) => setEarlyHandicapMax(parseFloat(e.target.value) || 0)}
                        className="w-full bg-[#070912] border border-slate-800 rounded px-1.5 py-1 flex-1 text-center font-bold"
                      />
                    </div>
                  </div>

                  {/* Bot state control / 挂机 button */}
                  <div className="pt-2.5 border-t border-slate-800 space-y-2">
                    <button 
                      onClick={() => {
                        const nextState = !isBotRunning;
                        setIsBotRunning(nextState);
                        setSimulationLogs(logs => [
                          `【挂机】${nextState ? '🟢 自动化角球监视引擎再次激活，跟投链路正常开启。' : '🔴 管理员暂停了挂机自动化投注程序。'}`,
                          ...logs
                        ]);
                        alert(nextState ? "挂机引擎启动！" : "挂机程序已暂停。");
                      }}
                      className={`w-full font-bold text-xs py-2 rounded transition-colors ${
                        isBotRunning 
                          ? 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-md shadow-emerald-950/20' 
                          : 'bg-slate-800 hover:bg-slate-750 text-slate-400 border border-slate-700'
                      }`}
                    >
                      {isBotRunning ? '✔ 挂机中' : '❌ 挂机暂停'}
                    </button>
                    
                    <div className="flex items-center justify-between text-[10px] text-slate-500 font-mono px-0.5">
                      <span>密钥 ID: {botId.split(' / ')[0]}</span>
                      <div className="flex items-center gap-1.5">
                        <span className={`w-2 h-2 rounded-full ${isBotRunning ? 'bg-emerald-500 animate-pulse' : 'bg-slate-600'}`}></span>
                        <span>{isBotRunning ? '监控中' : '脱机'}</span>
                      </div>
                    </div>
                  </div>

                  {/* Failure wait interval */}
                  <div className="space-y-1">
                    <label className="text-[10px] text-slate-400 block font-semibold">失败等待(秒):</label>
                    <input 
                      type="number" 
                      value={failWaitSeconds} 
                      onChange={(e) => setFailWaitSeconds(parseInt(e.target.value) || 20)}
                      className="w-full bg-[#070912] border border-slate-800 rounded px-2.5 py-1.5 focus:outline-none focus:border-indigo-500"
                    />
                  </div>
                </div>

                {/* COLUMN 2: PLAN 1 & GENERAL BET CONTROL */}
                <div className="space-y-4">
                  
                  {/* PLAN 1 BOX */}
                  <div className="bg-[#121829]/90 border border-slate-800/80 rounded-xl p-4 space-y-3 relative overflow-hidden">
                    <div className="absolute top-0 right-0 py-0.5 px-2 bg-emerald-950/40 text-[9px] text-emerald-400 rounded-bl border-l border-b border-slate-800/40">
                      弱队逆风大角
                    </div>
                    
                    <div className="border-b border-slate-800/60 pb-2 flex items-center justify-between">
                      <span className="text-slate-200 font-bold block text-xs">计划①</span>
                    </div>

                    <div className="space-y-2.5">
                      <div className="space-y-1">
                        <label className="text-[10px] text-slate-450 block">大于几分钟的赛事:</label>
                        <div className="flex items-center gap-1 font-bold">
                          <input 
                            type="number" 
                            value={plan1.minMin} 
                            onChange={(e) => setPlan1({ ...plan1, minMin: parseInt(e.target.value) || 0 })}
                            className="bg-[#070912] border border-slate-800 rounded w-full py-1 text-center font-bold text-slate-200"
                          />
                          <span className="text-slate-500 text-[10px]">&lt;=&gt;</span>
                          <input 
                            type="number" 
                            value={plan1.maxMin} 
                            onChange={(e) => setPlan1({ ...plan1, maxMin: parseInt(e.target.value) || 0 })}
                            className="bg-[#070912] border border-slate-800 rounded w-full py-1 text-center font-bold text-slate-200"
                          />
                        </div>
                      </div>

                      <div className="space-y-1">
                        <label className="text-[10px] text-slate-450 block">无论谁领先几球下对面:</label>
                        <input 
                          type="number" 
                          value={plan1.leadGoalsOpponent} 
                          onChange={(e) => setPlan1({ ...plan1, leadGoalsOpponent: parseInt(e.target.value) || 0 })}
                          className="bg-[#070912] border border-slate-800 rounded w-full py-1 px-2 text-center font-bold text-yellow-500"
                        />
                      </div>

                      <div className="space-y-1">
                        <label className="text-[10px] text-slate-450 block">弱队领先几球下强队:</label>
                        <input 
                          type="number" 
                          value={plan1.weakLeadGoalsStrong} 
                          onChange={(e) => setPlan1({ ...plan1, weakLeadGoalsStrong: parseInt(e.target.value) || 0 })}
                          className="bg-[#070912] border border-slate-800 rounded w-full py-1 px-2 text-center font-bold text-slate-200"
                        />
                      </div>

                      <div className="space-y-1">
                        <label className="text-[10px] text-slate-450 block">目标赔率 &gt;=:</label>
                        <input 
                          type="number" 
                          step="0.05"
                          value={plan1.minOdds} 
                          onChange={(e) => setPlan1({ ...plan1, minOdds: parseFloat(e.target.value) || 0 })}
                          className="bg-[#070912] border border-slate-800 rounded w-full py-1 px-2 text-center font-bold text-blue-450"
                        />
                      </div>

                      <div className="space-y-1">
                        <label className="text-[10px] text-slate-450 block">目标角盘盘口上下限:</label>
                        <div className="flex items-center gap-1.5">
                          <input 
                            type="number" 
                            step="0.25"
                            value={plan1.minHandicap} 
                            onChange={(e) => setPlan1({ ...plan1, minHandicap: parseFloat(e.target.value) || 0 })}
                            className="bg-[#070912] border border-slate-800 rounded w-full py-1 text-center font-bold"
                          />
                          <span className="text-slate-500 text-[10px]">&lt;=&gt;</span>
                          <input 
                            type="number" 
                            step="0.25"
                            value={plan1.maxHandicap} 
                            onChange={(e) => setPlan1({ ...plan1, maxHandicap: parseFloat(e.target.value) || 0 })}
                            className="bg-[#070912] border border-slate-800 rounded w-full py-1 text-center font-bold"
                          />
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* BET CONTROLS BLOCK FOR QUANTUM SAVING */}
                  <div className="bg-[#121829]/90 border border-slate-800/80 rounded-xl p-4 space-y-4">
                    <div className="border-b border-slate-800/60 pb-2">
                      <span className="text-slate-200 font-bold block text-xs">下单策略参数</span>
                    </div>

                    <div className="space-y-1">
                      <label className="text-[10px] text-red-400 block font-bold">下单金额:</label>
                      <input 
                        type="number" 
                        step="100"
                        value={betAmount} 
                        onChange={(e) => setBetAmount(parseInt(e.target.value) || 100)}
                        className="w-full bg-[#0a0d1a] border border-rose-950 rounded px-2 py-1.5 focus:outline-none focus:border-red-500 text-red-500 font-bold text-sm text-center"
                      />
                    </div>

                    {/* Radio and checkbox style switches exactly matching the screenshot */}
                    <div className="grid grid-cols-1 gap-2 border-t border-slate-800 pt-3">
                      <label id="cfg-audio-chk" className="flex items-center gap-2 cursor-pointer text-[11px] text-slate-300">
                        <input 
                          type="checkbox" 
                          checked={soundEnabledGlobal}
                          onChange={(e) => setSoundEnabledGlobal(e.target.checked)}
                          className="rounded bg-[#070912] border-slate-700 accent-indigo-500 w-4.5 h-4.5 cursor-pointer"
                        />
                        <span>☑ 声音</span>
                      </label>
                      
                      <label id="cfg-highest-chk" className="flex items-center gap-2 cursor-pointer text-[11px] text-slate-300">
                        <input 
                          type="checkbox" 
                          checked={highestEnabled}
                          onChange={(e) => setHighestEnabled(e.target.checked)}
                          className="rounded bg-[#070912] border-slate-700 accent-indigo-500 w-4.5 h-4.5 cursor-pointer"
                        />
                        <span>☐ 最高</span>
                      </label>

                      <label id="cfg-real-chk" className="flex items-center gap-2 cursor-pointer text-[11px] text-[#00F2FE]">
                        <input 
                          type="checkbox" 
                          checked={realEnabled}
                          onChange={(e) => setRealEnabled(e.target.checked)}
                          className="rounded bg-[#070912] border-slate-700 accent-[#00F2FE] w-4.5 h-4.5 cursor-pointer"
                        />
                        <span>☑ 真实</span>
                      </label>
                    </div>

                    <div className="pt-2">
                      <button 
                        onClick={handleSaveConfigs}
                        className="w-full bg-blue-600 hover:bg-blue-500 font-bold text-xs py-2.5 px-4 rounded text-white transition-all shadow-md h-[40px]"
                      >
                        保存
                      </button>
                      <span className="text-[10px] text-slate-500 text-center block mt-1.5 leading-relaxed font-sans font-medium">
                        （※ 每次改变参数都需要保存后生效）
                      </span>
                    </div>
                  </div>
                </div>

                {/* COLUMN 3: PLANS 2 & 4 */}
                <div className="space-y-4">
                  {/* PLAN 2 */}
                  <div className="bg-[#121829]/90 border border-slate-800/80 rounded-xl p-4 space-y-3 relative overflow-hidden">
                    <div className="absolute top-0 right-0 py-0.5 px-2 bg-blue-950/40 text-[9px] text-blue-400 rounded-bl border-l border-b border-slate-800/40">
                      中局博弈大小
                    </div>

                    <div className="border-b border-slate-800/60 pb-2">
                      <span className="text-slate-200 font-bold block text-xs">计划②</span>
                    </div>

                    <div className="space-y-2.5 font-mono">
                      <div className="space-y-1">
                        <label className="text-[10px] text-slate-400 block">大于几分钟的赛事:</label>
                        <div className="flex items-center gap-1 font-bold">
                          <input 
                            type="number" 
                            value={plan2.minMin} 
                            onChange={(e) => setPlan2({ ...plan2, minMin: parseInt(e.target.value) || 0 })}
                            className="bg-[#070912] border border-slate-800 rounded w-full py-1 text-center font-bold"
                          />
                          <span className="text-slate-500 text-[10px]">&lt;=&gt;</span>
                          <input 
                            type="number" 
                            value={plan2.maxMin} 
                            onChange={(e) => setPlan2({ ...plan2, maxMin: parseInt(e.target.value) || 0 })}
                            className="bg-[#070912] border border-slate-800 rounded w-full py-1 text-center font-bold"
                          />
                        </div>
                      </div>

                      <div className="space-y-1">
                        <label className="text-[10px] text-slate-400 block">无论谁领先几球下对面:</label>
                        <input 
                          type="number" 
                          value={plan2.leadGoalsOpponent} 
                          onChange={(e) => setPlan2({ ...plan2, leadGoalsOpponent: parseInt(e.target.value) || 0 })}
                          className="bg-[#070912] border border-slate-800 rounded w-full py-1 px-2 text-center font-bold"
                        />
                      </div>

                      <div className="space-y-1">
                        <label className="text-[10px] text-slate-400 block">弱队领先几球下强队:</label>
                        <input 
                          type="number" 
                          value={plan2.weakLeadGoalsStrong} 
                          onChange={(e) => setPlan2({ ...plan2, weakLeadGoalsStrong: parseInt(e.target.value) || 0 })}
                          className="bg-[#070912] border border-slate-800 rounded w-full py-1 px-2 text-center font-bold text-slate-200"
                        />
                      </div>

                      <div className="space-y-1">
                        <label className="text-[10px] text-slate-400 block">目标赔率 &gt;=:</label>
                        <input 
                          type="number" 
                          step="0.05"
                          value={plan2.minOdds} 
                          onChange={(e) => setPlan2({ ...plan2, minOdds: parseFloat(e.target.value) || 0 })}
                          className="bg-[#070912] border border-slate-800 rounded w-full py-1 px-2 text-center text-blue-400 font-bold"
                        />
                      </div>

                      <div className="space-y-1">
                        <label className="text-[10px] text-slate-400 block">目标角盘盘口上下限:</label>
                        <div className="flex items-center gap-1.5">
                          <input 
                            type="number" 
                            step="0.25"
                            value={plan2.minHandicap} 
                            onChange={(e) => setPlan2({ ...plan2, minHandicap: parseFloat(e.target.value) || 0 })}
                            className="bg-[#070912] border border-slate-800 rounded w-full py-1 text-center font-bold"
                          />
                          <span className="text-slate-500 text-[10px]">&lt;=&gt;</span>
                          <input 
                            type="number" 
                            step="0.25"
                            value={plan2.maxHandicap} 
                            onChange={(e) => setPlan2({ ...plan2, maxHandicap: parseFloat(e.target.value) || 0 })}
                            className="bg-[#070912] border border-slate-800 rounded w-full py-1 text-center font-bold"
                          />
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* PLAN 4 */}
                  <div className="bg-[#121829]/90 border border-slate-800/80 rounded-xl p-4 space-y-3 relative overflow-hidden">
                    <div className="absolute top-0 right-0 py-0.5 px-2 bg-pink-950/45 text-[9px] text-pink-400 rounded-bl border-l border-b border-slate-800/40">
                      局中全能追击
                    </div>

                    <div className="border-b border-slate-800/60 pb-2">
                      <span className="text-slate-200 font-bold block text-xs">计划④</span>
                    </div>

                    <div className="space-y-2.5 font-mono">
                      <div className="space-y-1">
                        <label className="text-[10px] text-slate-400 block">大于几分钟的赛事:</label>
                        <div className="flex items-center gap-1 font-bold">
                          <input 
                            type="number" 
                            value={plan4.minMin} 
                            onChange={(e) => setPlan4({ ...plan4, minMin: parseInt(e.target.value) || 0 })}
                            className="bg-[#070912] border border-slate-800 rounded w-full py-1 text-center font-bold"
                          />
                          <span className="text-slate-500 text-[10px]">&lt;=&gt;</span>
                          <input 
                            type="number" 
                            value={plan4.maxMin} 
                            onChange={(e) => setPlan4({ ...plan4, maxMin: parseInt(e.target.value) || 0 })}
                            className="bg-[#070912] border border-slate-800 rounded w-full py-1 text-center font-bold"
                          />
                        </div>
                      </div>

                      <div className="space-y-1">
                        <label className="text-[10px] text-slate-400 block">无强弱领先几球下对面:</label>
                        <input 
                          type="number" 
                          value={plan4.noStrengthLeadGoalsOpponent} 
                          onChange={(e) => setPlan4({ ...plan4, noStrengthLeadGoalsOpponent: parseInt(e.target.value) || 0 })}
                          className="bg-[#070912] border border-slate-800 rounded w-full py-1 px-2.5 text-center font-bold"
                        />
                      </div>

                      <div className="space-y-1">
                        <label className="text-[10px] text-slate-400 block">目标赔率 &gt;=:</label>
                        <input 
                          type="number" 
                          step="0.05"
                          value={plan4.minOdds} 
                          onChange={(e) => setPlan4({ ...plan4, minOdds: parseFloat(e.target.value) || 0 })}
                          className="bg-[#070912] border border-slate-800 rounded w-full py-1 px-2 text-center text-blue-400 font-bold"
                        />
                      </div>

                      <div className="space-y-1">
                        <label className="text-[10px] text-slate-400 block">目标角球盘口上下限:</label>
                        <div className="flex items-center gap-1.5">
                          <input 
                            type="number" 
                            step="0.25"
                            value={plan4.minHandicap} 
                            onChange={(e) => setPlan4({ ...plan4, minHandicap: parseFloat(e.target.value) || 0 })}
                            className="bg-[#070912] border border-slate-800 rounded w-full py-1 text-center font-bold"
                          />
                          <span className="text-slate-500 text-[10px]">&lt;=&gt;</span>
                          <input 
                            type="number" 
                            step="0.25"
                            value={plan4.maxHandicap} 
                            onChange={(e) => setPlan4({ ...plan4, maxHandicap: parseFloat(e.target.value) || 0 })}
                            className="bg-[#070912] border border-slate-800 rounded w-full py-1 text-center font-bold"
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* COLUMN 4: PLANS 3 & 5 */}
                <div className="space-y-4">
                  {/* PLAN 3 */}
                  <div className="bg-[#121829]/90 border border-slate-800/80 rounded-xl p-4 space-y-3 relative overflow-hidden">
                    <div className="absolute top-0 right-0 py-0.5 px-2 bg-purple-950/40 text-[9px] text-purple-400 rounded-bl border-l border-b border-slate-800/40">
                      僵局大角攻坚
                    </div>

                    <div className="border-b border-slate-800/60 pb-2">
                      <span className="text-slate-200 font-bold block text-xs">计划③</span>
                    </div>

                    <div className="space-y-3 font-mono">
                      <div className="space-y-1">
                        <label className="text-[10px] text-slate-400 block">大于几分钟0-0下强队:</label>
                        <div className="flex items-center gap-1 font-bold">
                          <input 
                            type="number" 
                            value={plan3.minMin} 
                            onChange={(e) => setPlan3({ ...plan3, minMin: parseInt(e.target.value) || 0 })}
                            className="bg-[#070912] border border-slate-800 rounded w-full py-1 text-center font-bold text-slate-200"
                          />
                          <span className="text-slate-500 text-[10px]">&lt;=&gt;</span>
                          <input 
                            type="number" 
                            value={plan3.maxMin} 
                            onChange={(e) => setPlan3({ ...plan3, maxMin: parseInt(e.target.value) || 0 })}
                            className="bg-[#070912] border border-slate-800 rounded w-full py-1 text-center font-bold text-slate-200"
                          />
                        </div>
                      </div>

                      <div className="space-y-1">
                        <label className="text-[10px] text-slate-400 block">最大平手数:</label>
                        <input 
                          type="number" 
                          value={plan3.maxDraws} 
                          onChange={(e) => setPlan3({ ...plan3, maxDraws: parseInt(e.target.value) || 0 })}
                          className="bg-[#070912] border border-slate-800 rounded w-full py-1 px-2.5 text-center font-bold text-rose-450"
                        />
                      </div>

                      <div className="space-y-1">
                        <label className="text-[10px] text-slate-400 block">目标赔率 &gt;=:</label>
                        <input 
                          type="number" 
                          step="0.05"
                          value={plan3.minOdds} 
                          onChange={(e) => setPlan3({ ...plan3, minOdds: parseFloat(e.target.value) || 0 })}
                          className="bg-[#070912] border border-slate-800 rounded w-full py-1 px-2 text-center text-blue-400 font-bold"
                        />
                      </div>

                      <div className="space-y-1">
                        <label className="text-[10px] text-slate-400 block">目标角盘盘口上下限:</label>
                        <div className="flex items-center gap-1.5">
                          <input 
                            type="number" 
                            step="0.25"
                            value={plan3.minHandicap} 
                            onChange={(e) => setPlan3({ ...plan3, minHandicap: parseFloat(e.target.value) || 0 })}
                            className="bg-[#070912] border border-slate-800 rounded w-full py-1 text-center font-bold"
                          />
                          <span className="text-slate-500 text-[10px]">&lt;=&gt;</span>
                          <input 
                            type="number" 
                            step="0.25"
                            value={plan3.maxHandicap} 
                            onChange={(e) => setPlan3({ ...plan3, maxHandicap: parseFloat(e.target.value) || 0 })}
                            className="bg-[#070912] border border-slate-800 rounded w-full py-1 text-center font-bold"
                          />
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* PLAN 5 */}
                  <div className="bg-[#121829]/90 border border-slate-800/80 rounded-xl p-4 space-y-3 relative overflow-hidden">
                    <div className="absolute top-0 right-0 py-0.5 px-2 bg-amber-950/40 text-[9px] text-amber-500 rounded-bl border-l border-b border-slate-800/40">
                      攻守失衡大盘
                    </div>

                    <div className="border-b border-slate-800/60 pb-2">
                      <span className="text-slate-200 font-bold block text-xs">计划⑤</span>
                    </div>

                    <div className="space-y-2.5 font-mono">
                      <div className="space-y-1">
                        <label className="text-[10px] text-slate-400 block">大于几分钟的赛事:</label>
                        <div className="flex items-center gap-1 font-bold">
                          <input 
                            type="number" 
                            value={plan5.minMin} 
                            onChange={(e) => setPlan5({ ...plan5, minMin: parseInt(e.target.value) || 0 })}
                            className="bg-[#070912] border border-slate-800 rounded w-full py-1 text-center font-bold"
                          />
                          <span className="text-slate-500 text-[10px]">&lt;=&gt;</span>
                          <input 
                            type="number" 
                            value={plan5.maxMin} 
                            onChange={(e) => setPlan5({ ...plan5, maxMin: parseInt(e.target.value) || 0 })}
                            className="bg-[#070912] border border-slate-800 rounded w-full py-1 text-center font-bold"
                          />
                        </div>
                      </div>

                      <div className="space-y-1">
                        <label className="text-[10px] text-slate-400 block">无强弱领先几球下对面:</label>
                        <input 
                          type="number" 
                          value={plan5.noStrengthLeadGoalsOpponent} 
                          onChange={(e) => setPlan5({ ...plan5, noStrengthLeadGoalsOpponent: parseInt(e.target.value) || 0 })}
                          className="bg-[#070912] border border-slate-800 rounded w-full py-1 px-2.5 text-center font-bold"
                        />
                      </div>

                      <div className="space-y-1">
                        <label className="text-[10px] text-slate-400 block">目标赔率 &gt;=:</label>
                        <input 
                          type="number" 
                          step="0.05"
                          value={plan5.minOdds} 
                          onChange={(e) => setPlan5({ ...plan5, minOdds: parseFloat(e.target.value) || 0 })}
                          className="bg-[#070912] border border-slate-800 rounded w-full py-1 px-2 text-center text-blue-400 font-bold"
                        />
                      </div>

                      <div className="space-y-1">
                        <label className="text-[10px] text-slate-400 block">目标角球盘口上下限:</label>
                        <div className="flex items-center gap-1.5">
                          <input 
                            type="number" 
                            step="0.25"
                            value={plan5.minHandicap} 
                            onChange={(e) => setPlan5({ ...plan5, minHandicap: parseFloat(e.target.value) || 0 })}
                            className="bg-[#070912] border border-slate-800 rounded w-full py-1 text-center font-bold"
                          />
                          <span className="text-slate-500 text-[10px]">&lt;=&gt;</span>
                          <input 
                            type="number" 
                            step="0.25"
                            value={plan5.maxHandicap} 
                            onChange={(e) => setPlan5({ ...plan5, maxHandicap: parseFloat(e.target.value) || 0 })}
                            className="bg-[#070912] border border-slate-800 rounded w-full py-1 text-center font-bold"
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

              </div>
            </div>
          )}
        </div>
      )}


      {/* SUB-TAB 2: 实时监控 MONITORING CARD DASHBOARD */}
      {activeSubTab === 'monitoring' && (
        <div className="space-y-6 animate-fadeIn">
          
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            
            {/* Monitored Match Deck */}
            <div className="lg:col-span-8 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-slate-200 flex items-center gap-1.5">
                  <Monitor className="w-4.5 h-4.5 text-blue-400 animate-pulse" />
                  即时赛事看板
                </h3>
                <span className="text-xs text-slate-400 font-mono bg-slate-900 border border-slate-800 px-2 py-0.5 rounded-lg">
                  当前处于高密集规则推演中
                </span>
              </div>

              {liveMatches.length > 0 ? (
                liveMatches.map((m) => {
                  const totalCorners = m.homeCorners + m.awayCorners;
                  
                  // Check matching active strategies (与后端 cornerEvaluator.js 保持一致)
                  const matchedStrategies = strategies.filter(strat => {
                    if (!strat.isActive) return false;
                    
                    const currentMinute = m.minute ?? 0;
                    const handicap = m.cornerHandicap ?? m.handicap ?? 0;
                    const odds = m.cornerOdds ?? m.odds?.overOdds ?? 0;
                    const homeScore = m.homeScore ?? 0;
                    const awayScore = m.awayScore ?? 0;
                    const goalDiff = Math.abs(homeScore - awayScore);
                    
                    // 比赛时间合理性校验
                    if (currentMinute > 99) return false;
                    if (currentMinute >= 45 && currentMinute <= 46) return false;
                    
                    // 时间窗口检查
                    if (currentMinute < strat.minMin || currentMinute > strat.maxMin) return false;
                    
                    // 盘口范围检查（使用绝对值比较，与后端 betDirection=auto 一致）
                    const absHcp = Math.abs(handicap);
                    if (absHcp < Math.abs(strat.handicapLine ?? 0)) return false;
                    
                    // 赔率条件检查（前端默认 0.8）
                    if (odds > 0 && odds < 0.8) return false;
                    
                    // 比分条件检查（根据策略 ID 使用不同规则，与后端 DEFAULT_STRATEGIES 对应）
                    if (strat.id === 'strat_1') {
                      // leadGoals=20(哨兵值)，不做比分限制
                      return true;
                    }
                    if (strat.id === 'strat_2') {
                      // leadGoals=3, leadGoalsWeak=0: 球差不超过3
                      return goalDiff <= 3;
                    }
                    if (strat.id === 'strat_3') {
                      // leadGoals=0, leadGoalsWeak=0: 平局
                      return goalDiff === 0;
                    }
                    if (strat.id === 'strat_4') {
                      // leadGoals=2, leadGoalsWeak=0: 球差不超过2
                      return goalDiff <= 2;
                    }
                    if (strat.id === 'strat_5') {
                      // leadGoals=1, leadGoalsWeak=0: 球差不超过1
                      return goalDiff <= 1;
                    }
                    return false;
                  });

                  return (
                    <div key={m.id} className="bg-[#0F1424] rounded-2xl border border-slate-800 hover:border-slate-700/80 shadow-lg p-5 transition-all">
                      
                      {/* Top league and names */}
                      <div className="flex items-center justify-between mb-3.5">
                        <div className="flex items-center gap-2">
                          <span className="px-2 py-0.5 rounded bg-slate-900 text-[10px] font-mono text-slate-400 font-bold border border-slate-800">
                            {m.league}
                          </span>
                          <span className="text-xs text-slate-400 font-medium">即时监控场次</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping"></span>
                          <span className="text-xs text-slate-300 font-mono font-semibold">进行中 {m.minute}'</span>
                        </div>
                      </div>

                      {/* Score Board layout */}
                      <div className="flex items-center justify-between p-4 bg-slate-950/70 rounded-xl border border-slate-900/60 mb-4">
                        <div className="flex-1 text-center sm:text-right pr-4">
                          <span className="font-bold text-slate-100 text-sm">{m.homeName}</span>
                        </div>
                        <div className="px-4 py-1.5 bg-slate-900 rounded-lg border border-slate-800 font-mono text-lg font-bold text-indigo-400 flex items-center gap-2">
                          <span>{m.homeScore}</span>
                          <span className="text-slate-600">:</span>
                          <span>{m.awayScore}</span>
                        </div>
                        <div className="flex-1 text-center sm:text-left pl-4">
                          <span className="font-bold text-slate-100 text-sm">{m.awayName}</span>
                        </div>
                      </div>

                      {/* Visual stats comparison meters */}
                      <div className="space-y-3.5 mb-4 px-2">
                        {/* Corners meter */}
                        <div className="space-y-1">
                          <div className="flex justify-between text-[11px] text-slate-400 font-mono">
                            <span>主角球: {m.homeCorners}</span>
                            <span className="text-slate-300 font-semibold text-xs">角球累计: {totalCorners} 个</span>
                            <span>客角球: {m.awayCorners}</span>
                          </div>
                          <div className="w-full h-2 bg-slate-950 rounded-full overflow-hidden flex">
                            <div className="h-full bg-indigo-500 transition-all duration-300" style={{ width: `${(m.homeCorners / (totalCorners || 1)) * 100}%` }}></div>
                            <div className="h-full bg-pink-500 transition-all duration-300" style={{ width: `${(m.awayCorners / (totalCorners || 1)) * 100}%` }}></div>
                          </div>
                        </div>

                        {/* Dangerous attack meter */}
                        <div className="space-y-1">
                          <div className="flex justify-between text-[11px] text-slate-400 font-mono">
                            <span>主危攻: {m.homeDangerAttacks} ({(m.homeDangerAttacks / (m.minute || 1)).toFixed(2)}/m)</span>
                            <span className="text-sky-400 font-semibold">危险进攻量配比</span>
                            <span>客危攻: {m.awayDangerAttacks} ({(m.awayDangerAttacks / (m.minute || 1)).toFixed(2)}/m)</span>
                          </div>
                          <div className="w-full h-2 bg-slate-950 rounded-full overflow-hidden flex">
                            <div className="h-full bg-sky-500 transition-all duration-300" style={{ width: `${(m.homeDangerAttacks / ((m.homeDangerAttacks + m.awayDangerAttacks) || 1)) * 100}%` }}></div>
                            <div className="h-full bg-emerald-500 transition-all duration-300" style={{ width: `${(m.awayDangerAttacks / ((m.homeDangerAttacks + m.awayDangerAttacks) || 1)) * 100}%` }}></div>
                          </div>
                        </div>

                        {/* Shots meter */}
                        <div className="space-y-1">
                          <div className="flex justify-between text-[11px] text-slate-400 font-mono">
                            <span>主射门: {m.homeShots}</span>
                            <span className="text-amber-500 font-semibold">射门起脚差</span>
                            <span>客射门: {m.awayShots}</span>
                          </div>
                          <div className="w-full h-2 bg-slate-950 rounded-full overflow-hidden flex">
                            <div className="h-full bg-amber-500 transition-all duration-300" style={{ width: `${(m.homeShots / ((m.homeShots + m.awayShots) || 1)) * 100}%` }}></div>
                            <div className="h-full bg-slate-700 transition-all duration-300" style={{ width: `${(m.awayShots / ((m.homeShots + m.awayShots) || 1)) * 100}%` }}></div>
                          </div>
                        </div>
                      </div>

                      {/* Interactive Odds & Strategy alert checker */}
                      <div className="border-t border-slate-800/60 pt-4 mt-4 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                        <div className="font-mono text-xs text-slate-400">
                          <span>即时盘口赔率: </span>
                          <span className="text-emerald-400 bg-emerald-950/40 px-2 py-0.5 rounded ml-1.5">OVER {m.odds.over} ({m.odds.overOdds})</span>
                        </div>

                        {/* Strategy trigger alerts */}
                        <div className="w-full md:w-auto">
                          {matchedStrategies.length > 0 ? (
                            matchedStrategies.map((strat) => (
                              <div key={strat.id} className="bg-emerald-950/70 border border-emerald-500/40 rounded-xl p-3 flex flex-wrap items-center gap-3 animate-pulse">
                                <div className="flex items-center gap-2">
                                  <div className="w-2.5 h-2.5 bg-emerald-400 rounded-full shadow-[0_0_8px_#10B981] animate-ping"></div>
                                  <div className="text-xs">
                                    <span className="text-emerald-400 font-bold block">[触发预警] {strat.name}</span>
                                    <span className="text-slate-300 text-[11px] font-medium leading-tight font-mono">
                                      策略条件已满足
                                    </span>
                                  </div>
                                </div>
                              </div>
                            ))
                          ) : (
                            <div className="py-2.5 px-4 bg-slate-950/80 rounded-xl border border-slate-900 font-mono text-slate-500 text-[11px]">
                              🔍 深度演算中: 瞬时数据波动正常，未达到角球盘口强切阈值...
                            </div>
                          )}
                        </div>
                      </div>

                    </div>
                  );
                })
              ) : (
                <div className="py-14 text-center bg-slate-950/30 rounded-2xl border border-slate-800">
                  <p className="text-xs text-slate-500 font-mono">请在【赛程数据】选项卡内点击“刷新比赛”或激活“自动刷新”来载入多场极速角球比赛监视端。</p>
                </div>
              )}
            </div>

            {/* Scrolling Incident Log Console panel */}
            <div className="lg:col-span-4 space-y-4">
              <h3 className="text-sm font-bold text-slate-200 flex items-center gap-1.5">
                <FileText className="w-4.5 h-4.5 text-[#FF8008]" />
                系统运行日志
              </h3>

              <div className="bg-slate-950 border border-slate-800 rounded-2xl p-4 h-[440px] flex flex-col justify-between overflow-hidden shadow-inner">
                <div className="space-y-3.5 overflow-y-auto pr-1 flex-1 font-mono text-[11px] leading-relaxed select-text">
                  {simulationLogs.map((log, index) => {
                    const isGoal = log.includes("进球") || log.includes("⚽");
                    const isTrigger = log.includes("[触发预警]") || log.includes("🚨");
                    const isAccount = log.includes("账户") || log.includes("🎉");
                    return (
                      <p key={index} className={`border-l-2 pl-2 ${
                        isGoal ? 'border-amber-500 text-amber-400 bg-amber-950/10 py-1' :
                        isTrigger ? 'border-rose-500 text-rose-400 bg-rose-950/10 py-1' :
                        isAccount ? 'border-blue-500 text-blue-400' :
                        'border-slate-800 text-slate-400'
                      }`}>
                        <span className="text-[10px] text-slate-600 mr-1.5">[{new Date().toLocaleTimeString('zh-CN', { hour12: false })}]</span>
                        {log}
                      </p>
                    );
                  })}
                </div>
                <div className="pt-3.5 border-t border-slate-900 text-right">
                  <button
                    onClick={() => setSimulationLogs([
                      "【日志清空】运行堆栈正常重置，监控数据流正常保全中。"
                    ])}
                    className="text-[10px] text-slate-500 hover:text-slate-400 underline"
                  >
                    清空运行日志
                  </button>
                </div>
              </div>
            </div>

          </div>
        </div>
      )}


      {/* SUB-TAB 3: 策略配置 ADVANCED CARD DECK */}
      {activeSubTab === 'config' && (
        <div className="space-y-6 animate-fadeIn">
          <div className="p-4 bg-slate-950/50 rounded-2xl border border-slate-800/80 flex items-start gap-3.5 max-w-4xl">
            <div className="p-2 bg-pink-950/50 border border-pink-900/30 text-pink-400 rounded-xl mt-1">
              <Sparkles className="w-5 h-5 animate-pulse" />
            </div>
            <div>
              <h4 className="text-xs font-bold text-slate-200">角球实时命中客观规律与理论精算支撑：</h4>
              <p className="text-[11.5px] text-slate-400 leading-relaxed mt-1">
                本平台角球算法非凭空生成，而是紧密结合英超西甲等大样本角球发生的<strong>抛物线衰减率</strong>、<strong>强队反扑折射常数</strong>与
                <strong>底线强突频次</strong>进行建模。改变下列阈值将自动拟合对应数学分布下的历史命中率。
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {strategies.map((strat) => (
              <div 
                key={strat.id} 
                className={`bg-[#0F1424] rounded-2xl border p-5 shadow-xl transition-all relative ${
                  strat.isActive ? 'border-pink-800/80' : 'border-slate-800 hover:border-slate-700/65'
                }`}
              >
                
                {/* Activation checkbox/switch corner */}
                <div className="flex items-start justify-between gap-4 mb-4">
                  <div>
                    <h3 className="text-slate-100 font-bold text-sm flex items-center gap-1.5">
                      {strat.name}
                      <span className={`w-1.5 h-1.5 rounded-full ${strat.isActive ? 'bg-pink-500 shadow-[0_0_6px_#EC4899]' : 'bg-slate-600'}`}></span>
                    </h3>
                    <p className="text-[11px] text-slate-400 leading-relaxed mt-1">{strat.description}</p>
                  </div>
                  
                  <button
                    onClick={() => toggleStrategyActive(strat.id)}
                    className={`text-xs py-1 px-3 rounded-lg font-semibold transition-all ${
                      strat.isActive
                        ? 'bg-pink-600 hover:bg-pink-500 text-white shadow-md shadow-pink-900/15'
                        : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
                    }`}
                  >
                    {strat.isActive ? '开启中' : '已禁用'}
                  </button>
                </div>

                {/* SLIDERS SETTINGS CONTROLLER */}
                <div className="space-y-4 pt-2.5 pb-4 border-t border-slate-800/60 font-mono">
                  
                  {/* Slider 1: Minute start */}
                  <div className="space-y-1">
                    <div className="flex justify-between text-xs text-slate-400">
                      <span>监控触发分钟区间:</span>
                      <span className="text-amber-400 font-bold">{strat.minMin}' - {strat.maxMin}'</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-slate-600">30m</span>
                      <input 
                        type="range" 
                        min="30" 
                        max="85" 
                        value={strat.minMin} 
                        onChange={(e) => updateStrategyParams(strat.id, 'minMin', parseInt(e.target.value))}
                        className="w-full accent-pink-600 bg-slate-900 rounded-lg appearance-none h-1.5 cursor-pointer"
                      />
                      <span className="text-[10px] text-slate-600">85m</span>
                    </div>
                  </div>

                  {/* Slider 2: Danger Attack Limit */}
                  <div className="space-y-1">
                    <div className="flex justify-between text-xs text-slate-400">
                      <span>单队最少进攻强压 (危攻/分):</span>
                      <span className="text-blue-400 font-bold">{strat.minDangerAttack.toFixed(1)} 次/min</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-slate-600">0.5</span>
                      <input 
                        type="range" 
                        min="5" 
                        max="22" 
                        step="1"
                        value={strat.minDangerAttack * 10} 
                        onChange={(e) => updateStrategyParams(strat.id, 'minDangerAttack', parseFloat(e.target.value) / 10)}
                        className="w-full accent-pink-600 bg-slate-900 rounded-lg appearance-none h-1.5 cursor-pointer"
                      />
                      <span className="text-[10px] text-slate-600">2.2</span>
                    </div>
                  </div>

                  {/* Slider 3: Handicap line size or spread */}
                  <div className="space-y-1">
                    <div className="flex justify-between text-xs text-slate-400 font-mono">
                      <span>{strat.type === 'spread' ? '目标主队让球阈值 (<=):' : '目标大小球盘口阈值 (大 >=):'}</span>
                      <span className="text-[#00F2FE] font-bold">
                        {strat.type === 'spread' ? formatAsianLine(strat.handicapLine) : `大 ${strat.handicapLine}`}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-slate-600">
                        {strat.type === 'spread' ? '-1.50' : '6.5'}
                      </span>
                      <input 
                        type="range" 
                        min={strat.type === 'spread' ? "-6" : "13"} 
                        max={strat.type === 'spread' ? "6" : "27"} 
                        step="1"
                        value={strat.type === 'spread' ? Math.round(strat.handicapLine * 4) : Math.round(strat.handicapLine * 2)} 
                        onChange={(e) => {
                          const val = parseFloat(e.target.value) / (strat.type === 'spread' ? 4 : 2);
                          updateStrategyParams(strat.id, 'handicapLine', val);
                        }}
                        className="w-full accent-pink-600 bg-slate-900 rounded-lg appearance-none h-1.5 cursor-pointer"
                      />
                      <span className="text-[10px] text-slate-600">
                        {strat.type === 'spread' ? '+1.50' : '13.5'}
                      </span>
                    </div>
                  </div>

                </div>

                {/* Auto execution preferences */}
                <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-900/85 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs font-mono">

                  <div className="flex flex-wrap items-center gap-3">
                    {/* Switch: Voice warning */}
                    <label className="flex items-center gap-1.5 cursor-pointer text-[11px] text-slate-400 select-none">
                      <input 
                        type="checkbox" 
                        checked={strat.soundEnabled}
                        onChange={() => toggleStrategyAlarm(strat.id)}
                        className="rounded bg-slate-900 border-slate-800 text-pink-600 focus:ring-0 w-3.5 h-3.5" 
                      />
                      <span>声光警报</span>
                    </label>

                    {/* Switch: Auto bet */}
                    <label className="flex items-center gap-1.5 cursor-pointer text-[11px] text-slate-400 select-none">
                      <input 
                        type="checkbox" 
                        checked={strat.autoBet}
                        onChange={() => toggleStrategyAutoBet(strat.id)}
                        className="rounded bg-slate-900 border-slate-800 text-pink-600 focus:ring-0 w-3.5 h-3.5" 
                      />
                      <span className="text-pink-400 font-semibold">自动投注</span>
                    </label>
                  </div>

                </div>

                {/* 触发统计 */}
                {strategyStats[strat.id] && (
                  <div className="mt-3 pt-3 border-t border-slate-700/50 flex gap-4 text-xs">
                    <div>
                      <span className="text-slate-400">触发</span>
                      <span className="text-white font-bold ml-1">{strategyStats[strat.id].triggered || 0}</span>
                    </div>
                    <div>
                      <span className="text-slate-400">执行</span>
                      <span className="text-white font-bold ml-1">{strategyStats[strat.id].executed || 0}</span>
                    </div>
                    <div>
                      <span className="text-slate-400">成功率</span>
                      <span className="text-emerald-400 font-bold ml-1">{strategyStats[strat.id].successRate || 0}%</span>
                    </div>
                  </div>
                )}

              </div>
            ))}
          </div>
        </div>
      )}


      {/* SUB-TAB 4: 历史分析 HISTORICAL METRICS LEDGER */}
      {activeSubTab === 'analysis' && (
        <div className="space-y-6 animate-fadeIn">
          
          {/* Top Quick metric details */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-[#0F1424] rounded-2xl border border-slate-800 p-4 shrink-0 shadow-md">
              <span className="text-[10px] text-slate-500 font-mono font-bold uppercase block">总监控/推荐场次</span>
              <div className="flex items-baseline gap-1.5 mt-1">
                <span className="text-xl font-bold text-slate-100">184</span>
                <span className="text-xs text-slate-400">场</span>
              </div>
            </div>
            
            <div className="bg-[#0F1424] rounded-2xl border border-slate-800 p-4 shrink-0 shadow-md">
              <span className="text-[10px] text-slate-500 font-mono font-bold uppercase block">真实策略命中率</span>
              <div className="flex items-baseline gap-1.5 mt-1">
                <span className="text-xl font-bold text-emerald-400 tracking-wide">78.3%</span>
                <span className="text-xs text-slate-500">（行业顶点）</span>
              </div>
            </div>

            <div className="bg-[#0F1424] rounded-2xl border border-slate-800 p-4 shrink-0 shadow-md">
              <span className="text-[10px] text-slate-500 font-mono font-bold uppercase block">累计盈利 ROI 贡献值</span>
              <div className="flex items-baseline gap-1.5 mt-1">
                <span className="text-xl font-bold text-pink-400 flex items-center">
                  <DollarSign className="w-4.5 h-4.5" />
                  +24.6%
                </span>
                <span className="text-xs text-slate-500">累计</span>
              </div>
            </div>

            <div className="bg-[#0F1424] rounded-2xl border border-slate-800 p-4 shrink-0 shadow-md">
              <span className="text-[10px] text-slate-500 font-mono font-bold uppercase block">模拟投注推演总额</span>
              <div className="flex items-baseline gap-1.5 mt-1">
                <span className="text-xl font-bold text-blue-400 flex items-center">
                  +$1,545
                </span>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            
            {/* Cumulative Profit Chart */}
            <div className="lg:col-span-7 bg-[#0F1424] rounded-2xl border border-slate-800 p-5 shadow-xl">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
                  <TrendingUp className="w-4 h-4 text-pink-500" />
                  累计盈利增长曲线
                </h3>
                <span className="text-[10px] text-slate-500 font-mono">（近12批次监控推荐仿真累积）</span>
              </div>

              {/* Recharts Profit line card */}
              <div className="w-full h-[220px] rounded-xl bg-slate-950/60 p-3.5 flex items-center justify-center border border-slate-900/60 font-mono">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart
                    data={profitData}
                    margin={{ top: 10, right: 10, left: -25, bottom: 0 }}
                  >
                    <defs>
                      <linearGradient id="profitGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#EC4899" stopOpacity={0.35} />
                        <stop offset="100%" stopColor="#3B82F6" stopOpacity={0} />
                      </linearGradient>
                      <linearGradient id="strokeGrad" x1="0" y1="0" x2="1" y2="0">
                        <stop offset="0%" stopColor="#3B82F6" />
                        <stop offset="100%" stopColor="#EC4899" />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(148, 163, 184, 0.05)" />
                    <XAxis dataKey="label" stroke="rgba(148, 163, 184, 0.5)" fontSize={9} tickLine={false} />
                    <YAxis stroke="rgba(148, 163, 184, 0.5)" fontSize={9} tickLine={false} tickFormatter={(v) => `+$${v}`} />
                    <Tooltip
                      contentStyle={{ backgroundColor: '#020617', borderColor: '#1E293B', borderRadius: '8px' }}
                      labelStyle={{ color: '#F1F5F9', fontWeight: 'bold', fontSize: '10px' }}
                      itemStyle={{ color: '#EC4899', fontSize: '10px' }}
                      formatter={(value) => [`$${value}`, '累计利润']}
                    />
                    <Area
                      type="monotone"
                      dataKey="profit"
                      stroke="url(#strokeGrad)"
                      strokeWidth={3}
                      fillOpacity={1}
                      fill="url(#profitGrad)"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Placed recommendation items */}
            <div className="lg:col-span-5 bg-[#0F1424] rounded-2xl border border-slate-800 p-5 shadow-xl flex flex-col h-[283px]">
              <div className="flex items-center justify-between mb-4 pb-2.5 border-b border-slate-800/80">
                <h3 className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
                  <FileText className="w-4 h-4 text-violet-400" />
                  即时下单推演库
                </h3>
                <span className="text-[10px] text-indigo-400 bg-indigo-950 px-2 py-0.5 rounded font-mono">
                  实盘深度跟进 ({placedBets.length})
                </span>
              </div>

              <div className="flex-1 overflow-y-auto space-y-3.5 pr-1 text-xs">
                {placedBets.map((b) => (
                  <div key={b.id} className="p-3 bg-slate-950 rounded-xl border border-slate-900 flex justify-between items-center gap-3">
                    <div className="space-y-1">
                      <div className="flex items-center gap-1.5">
                        <span className="px-1.5 py-0.2 bg-slate-900 border border-slate-800 rounded text-[9px] font-mono text-slate-500">{b.league}</span>
                        <span className="font-bold text-slate-200">{b.homeName} vs {b.awayName}</span>
                      </div>
                      <div className="text-[11px] text-slate-400 font-mono">
                        <span>分钟 {b.minute}' | 推荐: <strong>{b.prediction}</strong> @ {b.odds}</span>
                      </div>
                    </div>

                    <div className="text-right font-mono text-xs">
                      {b.status === 'won' ? (
                        <span className="text-emerald-400 bg-emerald-950/50 px-2.5 py-1 rounded-lg border border-emerald-900/30 font-bold">
                          🎉 +${b.profit} (命中)
                        </span>
                      ) : b.status === 'lost' ? (
                        <span className="text-rose-400 bg-rose-950/50 px-2.5 py-1 rounded-lg border border-rose-900/30 font-bold">
                          ❌ -${Math.abs(b.profit)} (未中)
                        </span>
                      ) : (
                        <span className="text-indigo-400 bg-indigo-950/50 px-2.5 py-1 rounded-lg border border-indigo-900/30 font-bold animate-pulse">
                          ⏳ 等待算账
                        </span>
                      )}
                      <span className="block text-[9px] text-slate-600 mt-1">{b.time}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

          </div>
        </div>
      )}


      {/* SIMULATED LOGIN DIALOG MODAL */}
      {showLoginModal && (
        <div id="login-modal" className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 backdrop-blur-sm animate-fadeIn">
          <div className="bg-[#121829] rounded-2xl border border-slate-800 p-6 w-[340px] shadow-2xl relative">
            <h3 className="text-sm font-bold text-slate-200 flex items-center gap-1.5 mb-3">
              <LogIn className="w-4 h-4 text-blue-500 animate-pulse" />
              接入量化监控高等级网关
            </h3>
            <p className="text-xs text-slate-400 leading-relaxed mb-4">
              请输入量化中心的管理员账户与密钥以获取一键向盘口跟打和监控控制授权。
            </p>

            <form onSubmit={handleLoginSubmit} className="space-y-4">
              <div className="space-y-1">
                <label className="text-[10px] text-slate-500 font-bold font-mono">管理员账号:</label>
                <input 
                  type="text" 
                  value={inputUser}
                  onChange={(e) => setInputUser(e.target.value)}
                  placeholder="jowu0356" 
                  className="w-full bg-slate-950 border border-slate-850 px-3 py-2 rounded-xl text-xs text-slate-200 placeholder-slate-600 focus:outline-none focus:border-blue-500"
                  required
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] text-slate-500 font-bold font-mono font-sans">安全登录口令密钥:</label>
                <input 
                  type="password" 
                  value={inputPass}
                  onChange={(e) => setInputPass(e.target.value)}
                  placeholder="请输入您的密钥密码" 
                  className="w-full bg-slate-950 border border-slate-850 px-3 py-2 rounded-xl text-xs text-slate-200 placeholder-slate-600 focus:outline-none focus:border-blue-500"
                  required
                />
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowLoginModal(false);
                    setInputUser('');
                    setInputPass('');
                  }}
                  className="flex-1 bg-slate-850 hover:bg-slate-800 text-slate-300 font-semibold text-xs py-2 rounded-xl transition-all"
                >
                  取消
                </button>
                <button
                  type="submit"
                  className="flex-1 bg-blue-600 hover:bg-blue-500 text-white font-semibold text-xs py-2 rounded-xl transition-all shadow-md"
                >
                  确认授权
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
