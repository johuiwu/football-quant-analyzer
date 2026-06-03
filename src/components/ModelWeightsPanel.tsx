import React from 'react';
import { Scale } from 'lucide-react';
import { ModelWeights, AdvancedParams } from '../utils/quantModel';

interface ModelWeightsPanelProps {
  customWeights: ModelWeights;
  setCustomWeights: React.Dispatch<React.SetStateAction<ModelWeights>>;
  useSystemWeights: boolean;
  setUseSystemWeights: React.Dispatch<React.SetStateAction<boolean>>;
  useCustomWeights: boolean;
  setUseCustomWeights: React.Dispatch<React.SetStateAction<boolean>>;
  advancedParams: AdvancedParams;
  checkAbnormalParams: (params: AdvancedParams, weights?: ModelWeights) => void;
  setShowParamWarning: React.Dispatch<React.SetStateAction<boolean>>;
  handleRecalculate: () => void;
}

export default function ModelWeightsPanel({
  customWeights,
  setCustomWeights,
  useSystemWeights,
  setUseSystemWeights,
  useCustomWeights,
  setUseCustomWeights,
  advancedParams,
  checkAbnormalParams,
  setShowParamWarning,
  handleRecalculate
}: ModelWeightsPanelProps) {
  return (
    <div className="p-5 bg-[#0F1424] rounded-2xl border border-slate-800/80 shadow-xl">
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-sm font-semibold text-slate-200 flex items-center gap-1.5">
          <Scale className="w-4 h-4 text-[#FF8008]" />
          模型集成权重微调
        </h3>
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-slate-400">使用系统优化权重</span>
          <input
            type="checkbox"
            checked={useSystemWeights}
            onChange={(e) => {
              setUseSystemWeights(e.target.checked);
              if (e.target.checked) {
                setUseCustomWeights(false);
              }
            }}
            className="w-3.5 h-3.5 accent-emerald-500 bg-slate-900 border-none rounded pointer"
          />
        </div>
      </div>

      {useSystemWeights ? (
        <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-4 text-center">
          <div className="text-emerald-400 text-xs mb-2">✅ 使用系统优化权重配置</div>
          <div className="text-slate-400 text-[10px] font-mono space-y-1">
            <div>赔率权重: 45% | 战力权重: 30%</div>
            <div>主客权重: 15% | 交锋权重: 10% | 走势权重: 5%</div>
          </div>
          <button
            onClick={() => setUseSystemWeights(false)}
            className="mt-3 text-xs text-slate-400 hover:text-slate-300 underline"
          >
            启用自定义权重
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-[10px] text-slate-400">自定义比例</span>
            <input
              type="checkbox"
              checked={useCustomWeights}
              onChange={(e) => setUseCustomWeights(e.target.checked)}
              className="w-3.5 h-3.5 accent-[#FF8050] bg-slate-900 border-none rounded pointer"
            />
          </div>

          <div>
            <div className="flex justify-between text-[11px] text-slate-300 font-mono mb-1">
              <span>1. 赔率转换权重 (Odds)</span>
              <span>{(customWeights.odds * 100).toFixed(0)}%</span>
            </div>
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              disabled={!useCustomWeights}
              value={customWeights.odds}
              onChange={(e) => {
                setCustomWeights({ ...customWeights, odds: parseFloat(e.target.value) });
                checkAbnormalParams(advancedParams, customWeights);
              }}
              className="w-full accent-blue-500 bg-slate-900 h-1 rounded-lg pointer-events-auto cursor-pointer"
            />
          </div>

          <div>
            <div className="flex justify-between text-[11px] text-slate-300 font-mono mb-1">
              <span>2. 战力攻守权重 (Strength)</span>
              <span>{(customWeights.strength * 100).toFixed(0)}%</span>
            </div>
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              disabled={!useCustomWeights}
              value={customWeights.strength}
              onChange={(e) => {
                setCustomWeights({ ...customWeights, strength: parseFloat(e.target.value) });
                checkAbnormalParams(advancedParams, customWeights);
              }}
              className="w-full accent-[#FF3E6C] bg-slate-900 h-1 rounded-lg pointer-events-auto cursor-pointer"
            />
          </div>

          <div>
            <div className="flex justify-between text-[11px] text-slate-300 font-mono mb-1">
              <span>3. 主客气势权重 (Home/Away)</span>
              <span>{(customWeights.homeAway * 100).toFixed(0)}%</span>
            </div>
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              disabled={!useCustomWeights}
              value={customWeights.homeAway}
              onChange={(e) => {
                setCustomWeights({ ...customWeights, homeAway: parseFloat(e.target.value) });
                checkAbnormalParams(advancedParams, customWeights);
              }}
              className="w-full accent-indigo-500 bg-slate-900 h-1 rounded-lg pointer-events-auto cursor-pointer"
            />
          </div>

          <div>
            <div className="flex justify-between text-[11px] text-slate-300 font-mono mb-1">
              <span>4. 交锋偏向权重 (H2H)</span>
              <span>{(customWeights.h2h * 100).toFixed(0)}%</span>
            </div>
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              disabled={!useCustomWeights}
              value={customWeights.h2h}
              onChange={(e) => {
                setCustomWeights({ ...customWeights, h2h: parseFloat(e.target.value) });
                checkAbnormalParams(advancedParams, customWeights);
              }}
              className="w-full accent-purple-500 bg-slate-900 h-1 rounded-lg pointer-events-auto cursor-pointer"
            />
          </div>

          <div className="bg-slate-950 p-2 text-[10px] text-slate-400 rounded border border-slate-900 flex justify-between items-center">
            <span>5. 会战走势权重 (Form Index)</span>
            <span className="font-semibold text-emerald-400 font-mono">5% (固定值)</span>
          </div>

          {useCustomWeights && (
            <div className="flex items-center gap-1">
              <button
                onClick={() => {
                  setCustomWeights({ odds: 0.45, strength: 0.30, homeAway: 0.15, h2h: 0.10, form: 0.05 });
                  setUseSystemWeights(true);
                  setShowParamWarning(false);
                  handleRecalculate();
                }}
                className="text-[10px] text-slate-400 hover:text-white underline mt-1"
              >
                重置回 10大公式指定系统权重 (45%, 30%, 15%, 10%, 5%)
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}