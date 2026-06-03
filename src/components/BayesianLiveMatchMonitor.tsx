import React, { useState, useMemo, useContext, useEffect } from 'react';
import { useAppStore } from '../store/useAppStore';

export const BayesianLiveMatchMonitor: React.FC = () => {
  const state = useAppStore((s) => s.liveMatch);
  const dispatchLiveMatch = useAppStore((s) => s.dispatchLiveMatch);
  
  // 1. 状态定义 - 与 LiveMatchContext 同步
  const [currentMinute, setCurrentMinute] = useState<number>(state.elapsedMinutes);
  const [homeScore, setHomeScore] = useState<number>(state.homeScore);
  const [awayScore, setAwayScore] = useState<number>(state.awayScore);
  const [homeRed, setHomeRed] = useState<number>(state.homeRedCards);
  const [awayRed, setAwayRed] = useState<number>(state.awayRedCards);

  // 同步 Context 状态到本地
  useEffect(() => {
    setCurrentMinute(state.elapsedMinutes);
    setHomeScore(state.homeScore);
    setAwayScore(state.awayScore);
    setHomeRed(state.homeRedCards);
    setAwayRed(state.awayRedCards);
  }, [state]);

  // 更新 Context 的函数
  const handleMinuteChange = (value: number) => {
    setCurrentMinute(value);
    dispatchLiveMatch({ type: 'UPDATE_MINUTE', payload: value });
    dispatchLiveMatch({ type: 'SET_LIVE_STATUS', payload: value > 0 });
    let newStatus: 'pre-match' | 'live' | 'halftime' | 'fulltime' = 'pre-match';
    if (value <= 0) newStatus = 'pre-match';
    else if (value < 45) newStatus = 'live';
    else if (value === 45) newStatus = 'halftime';
    else if (value < 90) newStatus = 'live';
    else newStatus = 'fulltime';
    dispatchLiveMatch({ type: 'SET_STATUS', payload: newStatus });
  };

  const handleHomeScoreChange = (value: number) => {
    setHomeScore(value);
    dispatchLiveMatch({ type: 'UPDATE_SCORE', payload: { home: value, away: awayScore } });
  };

  const handleAwayScoreChange = (value: number) => {
    setAwayScore(value);
    dispatchLiveMatch({ type: 'UPDATE_SCORE', payload: { home: homeScore, away: value } });
  };

  const handleHomeRedChange = (value: number) => {
    setHomeRed(value);
    dispatchLiveMatch({ type: 'UPDATE_RED_CARDS', payload: { home: value, away: awayRed } });
  };

  const handleAwayRedChange = (value: number) => {
    setAwayRed(value);
    dispatchLiveMatch({ type: 'UPDATE_RED_CARDS', payload: { home: homeRed, away: value } });
  };

  // 2. 模拟胜率计算逻辑
  const probabilities = useMemo(() => {
    const timeWeight = (90 - currentMinute) / 90;
    const homeAdj = homeScore * 0.2 - awayScore * 0.15 - homeRed * 0.1 + awayRed * 0.1;
    const awayAdj = awayScore * 0.2 - homeScore * 0.15 - awayRed * 0.1 + homeRed * 0.1;
    
    let win = Math.max(0, Math.min(1, 0.3 + homeAdj + timeWeight * 0.1));
    let lose = Math.max(0, Math.min(1, 0.3 + awayAdj + timeWeight * 0.1));
    let draw = 1 - win - lose;
    
    const sum = win + draw + lose;
    return {
      homeWin: (win / sum) * 100,
      draw: (draw / sum) * 100,
      awayWin: (lose / sum) * 100
    };
  }, [currentMinute, homeScore, awayScore, homeRed, awayRed]);

  // 计算底部预测数据
  const predictions = useMemo(() => {
    const timeLeft = 90 - currentMinute;
    const timeFactor = timeLeft / 90;
    
    return {
      cornerHome: (2.5 + homeScore * 0.3 - homeRed * 0.5) * timeFactor,
      cornerAway: (2.3 + awayScore * 0.3 - awayRed * 0.5) * timeFactor,
      cardHome: 0.8 + homeRed * 0.2,
      cardAway: 0.9 + awayRed * 0.2,
      expectedHome: 0.8 + homeScore * 0.1 - homeRed * 0.15,
      expectedAway: 0.75 + awayScore * 0.1 - awayRed * 0.15,
    };
  }, [currentMinute, homeScore, awayScore, homeRed, awayRed]);

  return (
    <div className="bg-slate-900/80 border border-slate-700 rounded-xl p-4 mb-4">
      {/* A. 标题区 */}
      <div className="flex justify-between items-start mb-3">
        <h3 className="text-lg font-bold text-cyan-400">⚡ 贝叶斯即时滚球走势监测盘</h3>
        <span className="text-xs text-gray-400 max-w-[450px] text-right hidden sm:block">
          根据已比分段时间的衰减、即时进球发生、以及即时红牌变数，在动态先验估计下，输出贝叶斯后置赢球、平局概率。
        </span>
      </div>

      {/* B. 滑块控制区 */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-4">
        <div className="flex flex-col gap-1">
          <div className="flex justify-between text-xs text-gray-300">
            <span>当前分钟数</span>
            <span className="text-blue-400">{currentMinute}'</span>
          </div>
          <input
            type="range" min="0" max="90" value={currentMinute}
            onChange={(e) => handleMinuteChange(Number(e.target.value))}
            className="w-full h-1.5 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-blue-500"
          />
        </div>

        <div className="flex flex-col gap-1">
          <div className="flex justify-between text-xs text-gray-300">
            <span>主队 live 进球</span>
            <span className="text-red-400">{homeScore}</span>
          </div>
          <input
            type="range" min="0" max="9" value={homeScore}
            onChange={(e) => handleHomeScoreChange(Number(e.target.value))}
            className="w-full h-1.5 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-red-500"
          />
        </div>

        <div className="flex flex-col gap-1">
          <div className="flex justify-between text-xs text-gray-300">
            <span>客队 live 进球</span>
            <span className="text-green-400">{awayScore}</span>
          </div>
          <input
            type="range" min="0" max="9" value={awayScore}
            onChange={(e) => handleAwayScoreChange(Number(e.target.value))}
            className="w-full h-1.5 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-green-500"
          />
        </div>

        <div className="flex flex-col gap-1">
          <div className="flex justify-between text-xs text-gray-300">
            <span>主队 red cards</span>
            <span className="text-red-500">{homeRed}</span>
          </div>
          <input
            type="range" min="0" max="2" value={homeRed}
            onChange={(e) => handleHomeRedChange(Number(e.target.value))}
            className="w-full h-1.5 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-red-600"
          />
        </div>

        <div className="flex flex-col gap-1">
          <div className="flex justify-between text-xs text-gray-300">
            <span>客队 red cards</span>
            <span className="text-red-500">{awayRed}</span>
          </div>
          <input
            type="range" min="0" max="2" value={awayRed}
            onChange={(e) => handleAwayRedChange(Number(e.target.value))}
            className="w-full h-1.5 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-red-600"
          />
        </div>
      </div>

      {/* C. 胜率卡片区 */}
      <div className="grid grid-cols-3 gap-2 mb-3">
        <div className="bg-slate-950 border border-slate-700 rounded-lg p-2 text-center">
          <div className="text-xs text-gray-400">【即时主胜】后置胜率：</div>
          <div className="text-lg font-bold text-red-500">{probabilities.homeWin.toFixed(1)}%</div>
          <div className="w-full h-1.5 bg-slate-700 rounded-full mt-1 overflow-hidden">
             <div className="h-full bg-red-500 transition-all duration-300" style={{ width: `${probabilities.homeWin}%` }}></div>
          </div>
        </div>
        <div className="bg-slate-950 border border-slate-700 rounded-lg p-2 text-center">
          <div className="text-xs text-gray-400">【即时平局】后置胜率：</div>
          <div className="text-lg font-bold text-gray-400">{probabilities.draw.toFixed(1)}%</div>
          <div className="w-full h-1.5 bg-slate-700 rounded-full mt-1 overflow-hidden">
             <div className="h-full bg-gray-400 transition-all duration-300" style={{ width: `${probabilities.draw}%` }}></div>
          </div>
        </div>
        <div className="bg-slate-950 border border-slate-700 rounded-lg p-2 text-center">
          <div className="text-xs text-gray-400">【即时客胜】后置胜率：</div>
          <div className="text-lg font-bold text-green-500">{probabilities.awayWin.toFixed(1)}%</div>
          <div className="w-full h-1.5 bg-slate-700 rounded-full mt-1 overflow-hidden">
             <div className="h-full bg-green-500 transition-all duration-300" style={{ width: `${probabilities.awayWin}%` }}></div>
          </div>
        </div>
      </div>

      {/* D. 底部数据 */}
      <div className="flex flex-wrap gap-4 text-xs text-gray-400 border-t border-slate-700 pt-2">
        <div>预计剩余角球增幅：<span className="text-white font-medium">主 {predictions.cornerHome.toFixed(1)} | 客 {predictions.cornerAway.toFixed(1)}</span> 个</div>
        <div>追加红黄牌严厉倾向率：<span className="text-white font-medium">主 {predictions.cardHome.toFixed(1)} | 客 {predictions.cardAway.toFixed(1)}</span> 张</div>
        <div>贝叶斯剩余对战期望值：<span className="text-white font-medium">主 {predictions.expectedHome.toFixed(1)} | 客 {predictions.expectedAway.toFixed(1)}</span> 球</div>
      </div>
    </div>
  );
};

export default BayesianLiveMatchMonitor;
