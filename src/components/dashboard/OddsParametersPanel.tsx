import React, { useMemo } from "react";
import { AsianHandicapParams } from "../../utils/quantModel";

// 亚盘盘口选项：严格按主让→平手→受让排列
const HANDICAP_OPTIONS = [
  { label: "主让两球 (-2.0)", value: -2.0 },
  { label: "主让球半/两球 (-1.75)", value: -1.75 },
  { label: "主让球半 (-1.5)", value: -1.5 },
  { label: "主让一球/球半 (-1.25)", value: -1.25 },
  { label: "主让一球 (-1.0)", value: -1.0 },
  { label: "主让半球/一球 (-0.75)", value: -0.75 },
  { label: "主让半球 (-0.5)", value: -0.5 },
  { label: "主让平手/半球 (-0.25)", value: -0.25 },
  { label: "平手 (0.0)", value: 0.0 },
  { label: "受让平手/半球 (+0.25)", value: 0.25 },
  { label: "受让半球 (+0.5)", value: 0.5 },
  { label: "受让半球/一球 (+0.75)", value: 0.75 },
  { label: "受让一球 (+1.0)", value: 1.0 },
  { label: "受让一球/球半 (+1.25)", value: 1.25 },
  { label: "受让球半 (+1.5)", value: 1.5 },
  { label: "受让球半/两球 (+1.75)", value: 1.75 },
  { label: "受让两球 (+2.0)", value: 2.0 },
];

interface OddsParametersPanelProps {
  asianHandicap: AsianHandicapParams;
  setAsianHandicap: (params: AsianHandicapParams) => void;
  goalsLine: number;
  setGoalsLine: (line: number) => void;
  returnRate: number;
  setReturnRate: (rate: number) => void;
  convertedOdds: {
    homeOdds: number;
    drawOdds: number;
    awayOdds: number;
  };
}

const OddsParametersPanelComponent: React.FC<OddsParametersPanelProps> = ({
  asianHandicap,
  setAsianHandicap,
  goalsLine,
  setGoalsLine,
  returnRate,
  setReturnRate,
  convertedOdds
}) => {
  const returnRateOptions = useMemo(() => [0.92, 0.94, 0.96, 0.98], []);
  const goalsLineOptions = useMemo(() => [1.5, 2.25, 2.5, 2.75, 3.5], []);

  return (
    <div className="bg-slate-900/60 p-3.5 rounded-xl border border-slate-800/60 space-y-3.5">
      <div className="flex justify-between items-center">
        <span className="text-xs font-medium text-slate-300">亚盘让球盘口 & 主客水位</span>
        <span className="text-[10px] font-mono text-amber-400 bg-amber-500/10 px-1.5 py-0.5 rounded">亚盘精算</span>
      </div>

      {/* 盘口选择器 */}
      <div>
        <label className="block text-[11px] text-slate-400 mb-1.5">盘口 (让球方)</label>
        <select
          value={asianHandicap.handicap}
          onChange={(e) => setAsianHandicap({ ...asianHandicap, handicap: Number(e.target.value) })}
          className="w-full px-3 py-2 text-sm font-mono bg-slate-950 border border-slate-800 rounded-lg
            text-slate-200 appearance-none cursor-pointer
            focus:outline-none focus:ring-2 focus:ring-amber-500/50 focus:border-amber-500/50
            hover:border-slate-700 transition-colors"
        >
          {HANDICAP_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value} className="bg-slate-900 text-slate-200">
              {opt.label}
            </option>
          ))}
        </select>
      </div>

      {/* 主客水位滑块 */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <div className="flex justify-between items-center mb-1">
            <span className="text-[10px] text-rose-400 font-medium">主队水位</span>
            <span className="text-[11px] font-bold font-mono text-rose-400 bg-rose-500/10 px-1.5 py-0.5 rounded">{asianHandicap.homeWater.toFixed(2)}</span>
          </div>
          <input
            type="range"
            min="0.70"
            max="1.05"
            step="0.01"
            value={asianHandicap.homeWater}
            onChange={(e) => setAsianHandicap({ ...asianHandicap, homeWater: Number(e.target.value) })}
            className="w-full accent-rose-500 h-1 bg-slate-950 rounded cursor-pointer"
          />
          <div className="flex justify-between text-[9px] text-slate-500 font-mono mt-0.5">
            <span>0.70</span><span>1.05</span>
          </div>
        </div>
        <div>
          <div className="flex justify-between items-center mb-1">
            <span className="text-[10px] text-emerald-400 font-medium">客队水位</span>
            <span className="text-[11px] font-bold font-mono text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded">{asianHandicap.awayWater.toFixed(2)}</span>
          </div>
          <input
            type="range"
            min="0.70"
            max="1.05"
            step="0.01"
            value={asianHandicap.awayWater}
            onChange={(e) => setAsianHandicap({ ...asianHandicap, awayWater: Number(e.target.value) })}
            className="w-full accent-emerald-500 h-1 bg-slate-950 rounded cursor-pointer"
          />
          <div className="flex justify-between text-[9px] text-slate-500 font-mono mt-0.5">
            <span>0.70</span><span>1.05</span>
          </div>
        </div>
      </div>

      {/* 返还率选择 */}
      <div className="flex items-center justify-between pt-1.5 border-t border-slate-800/50">
        <span className="text-[10px] text-slate-400">返还率标准</span>
        <div className="flex gap-1.5">
          {returnRateOptions.map((r) => (
            <button
              key={r}
              onClick={() => setReturnRate(r)}
              className={`px-2 py-0.5 text-[10px] font-mono rounded border transition-all ${
                returnRate === r
                  ? "bg-indigo-600/30 border-indigo-500 text-indigo-300"
                  : "bg-slate-950 border-slate-800 text-slate-400 hover:bg-slate-850"
              }`}
            >
              {(r * 100).toFixed(0)}%
            </button>
          ))}
        </div>
      </div>

      {/* 亚盘 → 欧赔折算参考 (只读) */}
      <div className="pt-2 border-t border-slate-800/50">
        <span className="block text-[10px] text-slate-400 mb-2 font-mono">↓ 亚盘 → 欧赔折算参考 (只读)</span>
        <div className="grid grid-cols-3 gap-2">
          <div className="text-center bg-slate-950 rounded-lg py-1.5 border border-slate-800/50">
            <span className="block text-[10px] text-rose-400/70">主胜</span>
            <span className="text-xs font-bold font-mono text-rose-400">{convertedOdds.homeOdds.toFixed(2)}</span>
          </div>
          <div className="text-center bg-slate-950 rounded-lg py-1.5 border border-slate-800/50">
            <span className="block text-[10px] text-slate-400/70">平局</span>
            <span className="text-xs font-bold font-mono text-slate-300">{convertedOdds.drawOdds.toFixed(2)}</span>
          </div>
          <div className="text-center bg-slate-950 rounded-lg py-1.5 border border-slate-800/50">
            <span className="block text-[10px] text-emerald-400/70">客胜</span>
            <span className="text-xs font-bold font-mono text-emerald-400">{convertedOdds.awayOdds.toFixed(2)}</span>
          </div>
        </div>
      </div>

      {/* 盘口大小球边界选择球线 */}
      <div className="pt-2 border-t border-slate-800/50">
        <label className="flex justify-between text-xs text-slate-300 mb-1.5">
          <span>盘口大小球边界球数 (Goals Line):</span>
          <span className="font-mono text-blue-400 font-semibold">{goalsLine}球</span>
        </label>
        <div className="flex gap-2">
          {goalsLineOptions.map((val) => (
            <button
              key={val}
              onClick={() => setGoalsLine(val)}
              className={`flex-1 py-1 text-xs font-mono rounded border transition-all ${
                goalsLine === val
                  ? "bg-blue-600/30 border-blue-500 text-blue-300 shadow-md scale-105"
                  : "bg-slate-950 border-slate-800 text-slate-400 hover:bg-slate-850 hover:text-slate-200"
              }`}
            >
              {val}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};

export const OddsParametersPanel = React.memo(OddsParametersPanelComponent);
