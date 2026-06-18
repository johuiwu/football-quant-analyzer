import React from 'react';
import { Activity } from 'lucide-react';
import { AdvancedParams, ModelWeights } from '../utils/quantModel';

interface AdvancedParamsPanelProps {
  advancedParams: AdvancedParams;
  setAdvancedParams: React.Dispatch<React.SetStateAction<AdvancedParams>>;
  customWeights: ModelWeights;
  checkAbnormalParams: (params: AdvancedParams, weights?: ModelWeights) => void;
}

export default function AdvancedParamsPanel({
  advancedParams,
  setAdvancedParams,
  customWeights,
  checkAbnormalParams
}: AdvancedParamsPanelProps) {
  return (
    <>
      <div className="p-5 bg-[#0F1424] rounded-2xl border border-slate-800/80 shadow-xl">
        <h3 className="text-sm font-semibold text-slate-200 flex items-center gap-1.5 mb-3">
          <Activity className="w-4 h-4 text-emerald-400 font-bold" />
          🩺 伤停疲劳 & 机构资金流
        </h3>
        <p className="text-[11px] text-slate-400 mb-4 leading-relaxed">
          调整球员战损与赛事疲劳系数，以及即时筹码热度，将直接纠偏 Elo 估算值与 Dixon-Coles 进球期望。
        </p>

        <div className="space-y-4 text-xs">
          <div className="grid grid-cols-2 gap-3 pb-3 border-b border-slate-850/60">
            <div>
              <div className="flex justify-between items-center text-[11px] mb-1">
                <span className="text-slate-400">主队疲劳 {advancedParams.homeFatigue} 级</span>
              </div>
              <input
                type="range"
                min="0"
                max="10"
                step="1"
                value={advancedParams.homeFatigue}
                onChange={(e) => {
                  const newParams = { ...advancedParams, homeFatigue: parseInt(e.target.value) };
                  setAdvancedParams(newParams);
                  checkAbnormalParams(newParams, customWeights);
                }}
                className="w-full accent-rose-500 h-1 bg-slate-900 rounded pointer-events-auto cursor-pointer"
              />
            </div>
            <div>
              <div className="flex justify-between items-center text-[11px] mb-1">
                <span className="text-slate-400">客队疲劳 {advancedParams.awayFatigue} 级</span>
              </div>
              <input
                type="range"
                min="0"
                max="10"
                step="1"
                value={advancedParams.awayFatigue}
                onChange={(e) => {
                  const newParams = { ...advancedParams, awayFatigue: parseInt(e.target.value) };
                  setAdvancedParams(newParams);
                  checkAbnormalParams(newParams, customWeights);
                }}
                className="w-full accent-emerald-500 h-1 bg-slate-900 rounded pointer-events-auto cursor-pointer"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 pb-3 border-b border-slate-850/60">
            <div>
              <div className="flex justify-between items-center text-[11px] mb-1">
                <span className="text-slate-400">主队战伤率 {advancedParams.homeInjuries}%</span>
              </div>
              <input
                type="range"
                min="0"
                max="100"
                step="1"
                value={advancedParams.homeInjuries}
                onChange={(e) => {
                  const newParams = { ...advancedParams, homeInjuries: parseInt(e.target.value) };
                  setAdvancedParams(newParams);
                  checkAbnormalParams(newParams, customWeights);
                }}
                className="w-full accent-rose-500 h-1 bg-slate-900 rounded pointer-events-auto cursor-pointer"
              />
            </div>
            <div>
              <div className="flex justify-between items-center text-[11px] mb-1">
                <span className="text-slate-400">客队战伤率 {advancedParams.awayInjuries}%</span>
              </div>
              <input
                type="range"
                min="0"
                max="100"
                step="1"
                value={advancedParams.awayInjuries}
                onChange={(e) => {
                  const newParams = { ...advancedParams, awayInjuries: parseInt(e.target.value) };
                  setAdvancedParams(newParams);
                  checkAbnormalParams(newParams, customWeights);
                }}
                className="w-full accent-emerald-500 h-1 bg-slate-900 rounded pointer-events-auto cursor-pointer"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 pb-3 border-b border-slate-850/60">
            <div>
              <label className="block text-[10px] text-slate-400 mb-1">主胜水位波动</label>
              <select
                value={advancedParams.homeWaterTrend}
                onChange={(e) => setAdvancedParams({ ...advancedParams, homeWaterTrend: e.target.value as any })}
                className="w-full bg-slate-900 border border-slate-800 text-slate-300 py-1 px-1 rounded text-[11px] font-sans"
              >
                <option value="DOWN">📈 比降 (庄防冷防爆)</option>
                <option value="STABLE">➡️ 基本维持不变</option>
                <option value="UP">📉 抬高 (赔付危险走空)</option>
              </select>
            </div>
            <div>
              <label className="block text-[10px] text-slate-400 mb-1">客胜水位波动</label>
              <select
                value={advancedParams.awayWaterTrend}
                onChange={(e) => setAdvancedParams({ ...advancedParams, awayWaterTrend: e.target.value as any })}
                className="w-full bg-slate-900 border border-slate-800 text-slate-300 py-1 px-1 rounded text-[11px] font-sans"
              >
                <option value="DOWN">📈 水位比降 (庄防)</option>
                <option value="STABLE">➡️ 基本维持不变</option>
                <option value="UP">📉 抬高 (赔付增大)</option>
              </select>
            </div>
          </div>

          <div>
            <span className="block text-[11px] text-slate-300 mb-2 font-semibold">📊 交易所即时资金热度比 (主 / 平 / 客)</span>
            <span className="block text-[9px] text-amber-400/70 mb-1.5">⚠️ 某方向占比 &gt;50% 时将触发反向修正（降低该方向概率）</span>
            <div className="grid grid-cols-3 gap-2">
              <div>
                <span className="text-[10px] text-slate-400 block text-center mb-1">主队: {advancedParams.homeBetVolume}%</span>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={advancedParams.homeBetVolume}
                  onChange={(e) => {
                    const v = Math.min(100, parseInt(e.target.value));
                    const left = 100 - v;
                    setAdvancedParams({
                      ...advancedParams,
                      homeBetVolume: v,
                      awayBetVolume: Math.round(left * 0.6),
                      drawBetVolume: Math.round(left * 0.4)
                    });
                  }}
                  className="w-full accent-rose-500 h-1 bg-slate-900 rounded pointer-events-auto cursor-pointer"
                />
              </div>
              <div>
                <span className="text-[10px] text-slate-400 block text-center mb-1">平局: {advancedParams.drawBetVolume}%</span>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={advancedParams.drawBetVolume}
                  onChange={(e) => {
                    const v = Math.min(100, parseInt(e.target.value));
                    const left = 100 - v;
                    setAdvancedParams({
                      ...advancedParams,
                      drawBetVolume: v,
                      homeBetVolume: Math.round(left * 0.55),
                      awayBetVolume: Math.round(left * 0.45)
                    });
                  }}
                  className="w-full accent-slate-500 h-1 bg-slate-900 rounded pointer-events-auto cursor-pointer"
                />
              </div>
              <div>
                <span className="text-[10px] text-slate-400 block text-center mb-1">客队: {advancedParams.awayBetVolume}%</span>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={advancedParams.awayBetVolume}
                  onChange={(e) => {
                    const v = Math.min(100, parseInt(e.target.value));
                    const left = 100 - v;
                    setAdvancedParams({
                      ...advancedParams,
                      awayBetVolume: v,
                      homeBetVolume: Math.round(left * 0.6),
                      drawBetVolume: Math.round(left * 0.4)
                    });
                  }}
                  className="w-full accent-emerald-500 h-1 bg-slate-900 rounded pointer-events-auto cursor-pointer"
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}