import React, { useMemo } from 'react';
import { AdvancedParams } from '../../utils/quantModel';

interface AdvancedParamsPanelProps {
  params: AdvancedParams;
  onChange: (params: AdvancedParams) => void;
}

export const AdvancedParamsPanel: React.FC<AdvancedParamsPanelProps> = React.memo(({
  params,
  onChange
}) => {
  // 稳定的选项数组
  const waterTrendOptions = useMemo(() => ['UP', 'STABLE', 'DOWN'], []);
  
  // 更新疲劳度
  const handleFatigueChange = (team: 'home' | 'away', value: number) => {
    onChange({
      ...params,
      [team === 'home' ? 'homeFatigue' : 'awayFatigue']: value
    });
  };
  
  // 更新伤病程度
  const handleInjuryChange = (team: 'home' | 'away', value: number) => {
    onChange({
      ...params,
      [team === 'home' ? 'homeInjuries' : 'awayInjuries']: value
    });
  };
  
  // 更新水位趋势
  const handleWaterTrendChange = (team: 'home' | 'away', value: 'UP' | 'STABLE' | 'DOWN') => {
    onChange({
      ...params,
      [team === 'home' ? 'homeWaterTrend' : 'awayWaterTrend']: value
    });
  };
  
  // 更新投注量
  const handleBetVolumeChange = (type: 'home' | 'away' | 'draw', value: number) => {
    const newParams = { ...params };
    if (type === 'home') newParams.homeBetVolume = value;
    if (type === 'away') newParams.awayBetVolume = value;
    if (type === 'draw') newParams.drawBetVolume = value;
    onChange(newParams);
  };
  
  return (
    <div className="bg-slate-900/60 p-4 rounded-xl border border-slate-800/60 space-y-4">
      <h3 className="text-sm font-semibold text-slate-200 mb-2">高级参数设置</h3>
      
      {/* 疲劳度设置 */}
      <div className="space-y-2">
        <div className="text-xs font-medium text-slate-300">疲劳度设置</div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-slate-400 flex items-center gap-1 mb-1">
              主队疲劳度
              <span className="font-mono text-amber-400">{params.homeFatigue}</span>
            </label>
            <input
              type="range"
              min="0"
              max="10"
              step="1"
              value={params.homeFatigue}
              onChange={(e) => handleFatigueChange('home', Number(e.target.value))}
              className="w-full accent-amber-500 h-1.5 bg-slate-800 rounded"
            />
          </div>
          <div>
            <label className="text-xs text-slate-400 flex items-center gap-1 mb-1">
              客队疲劳度
              <span className="font-mono text-amber-400">{params.awayFatigue}</span>
            </label>
            <input
              type="range"
              min="0"
              max="10"
              step="1"
              value={params.awayFatigue}
              onChange={(e) => handleFatigueChange('away', Number(e.target.value))}
              className="w-full accent-amber-500 h-1.5 bg-slate-800 rounded"
            />
          </div>
        </div>
      </div>
      
      {/* 伤病程度设置 */}
      <div className="space-y-2">
        <div className="text-xs font-medium text-slate-300">伤病程度设置 (%)</div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-slate-400 flex items-center gap-1 mb-1">
              主队伤病
              <span className="font-mono text-red-400">{params.homeInjuries}</span>
            </label>
            <input
              type="range"
              min="0"
              max="100"
              step="5"
              value={params.homeInjuries}
              onChange={(e) => handleInjuryChange('home', Number(e.target.value))}
              className="w-full accent-red-500 h-1.5 bg-slate-800 rounded"
            />
          </div>
          <div>
            <label className="text-xs text-slate-400 flex items-center gap-1 mb-1">
              客队伤病
              <span className="font-mono text-red-400">{params.awayInjuries}</span>
            </label>
            <input
              type="range"
              min="0"
              max="100"
              step="5"
              value={params.awayInjuries}
              onChange={(e) => handleInjuryChange('away', Number(e.target.value))}
              className="w-full accent-red-500 h-1.5 bg-slate-800 rounded"
            />
          </div>
        </div>
      </div>
      
      {/* 水位趋势设置 */}
      <div className="space-y-2">
        <div className="text-xs font-medium text-slate-300">水位趋势设置</div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-slate-400 mb-1">主队水位趋势</label>
            <div className="flex gap-1">
              {waterTrendOptions.map(option => (
                <button
                  key={option}
                  onClick={() => handleWaterTrendChange('home', option as any)}
                  className={`flex-1 px-2 py-1 text-xs rounded border transition-all ${
                    params.homeWaterTrend === option 
                      ? 'bg-emerald-600/30 border-emerald-500 text-emerald-300' 
                      : 'bg-slate-800 border-slate-700 text-slate-400 hover:bg-slate-700'
                  }`}
                >
                  {option === 'UP' ? '↑' : option === 'DOWN' ? '↓' : '→'}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="text-xs text-slate-400 mb-1">客队水位趋势</label>
            <div className="flex gap-1">
              {waterTrendOptions.map(option => (
                <button
                  key={option}
                  onClick={() => handleWaterTrendChange('away', option as any)}
                  className={`flex-1 px-2 py-1 text-xs rounded border transition-all ${
                    params.awayWaterTrend === option 
                      ? 'bg-emerald-600/30 border-emerald-500 text-emerald-300' 
                      : 'bg-slate-800 border-slate-700 text-slate-400 hover:bg-slate-700'
                  }`}
                >
                  {option === 'UP' ? '↑' : option === 'DOWN' ? '↓' : '→'}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
      
      {/* 投注量设置 */}
      <div className="space-y-2 pt-2 border-t border-slate-800">
        <div className="text-xs font-medium text-slate-300">投注量分布 (%)</div>
        <div className="grid grid-cols-3 gap-2">
          <div>
            <label className="text-xs text-rose-400 mb-1 block">主队投注</label>
            <input
              type="number"
              min="0"
              max="100"
              value={params.homeBetVolume}
              onChange={(e) => handleBetVolumeChange('home', Number(e.target.value))}
              className="w-full bg-slate-950 border border-slate-800 rounded px-2 py-1 text-xs text-rose-300"
            />
          </div>
          <div>
            <label className="text-xs text-slate-300 mb-1 block">平局投注</label>
            <input
              type="number"
              min="0"
              max="100"
              value={params.drawBetVolume}
              onChange={(e) => handleBetVolumeChange('draw', Number(e.target.value))}
              className="w-full bg-slate-950 border border-slate-800 rounded px-2 py-1 text-xs"
            />
          </div>
          <div>
            <label className="text-xs text-emerald-400 mb-1 block">客队投注</label>
            <input
              type="number"
              min="0"
              max="100"
              value={params.awayBetVolume}
              onChange={(e) => handleBetVolumeChange('away', Number(e.target.value))}
              className="w-full bg-slate-950 border border-slate-800 rounded px-2 py-1 text-xs text-emerald-300"
            />
          </div>
        </div>
      </div>
    </div>
  );
});
