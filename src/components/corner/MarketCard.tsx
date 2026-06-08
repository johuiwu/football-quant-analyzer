import React from "react";
import type { HandicapEntry } from "../../store/cornerStore";

interface MarketCardProps {
  handicap: HandicapEntry;
  homeTeam?: string;
  awayTeam?: string;
  compact?: boolean;
}

const categoryGradients: Record<string, { bg: string; text: string; border: string; label: string }> = {
  "O/U":       { bg: "from-blue-900/50 to-slate-800/50",   text: "text-blue-300",   border: "border-blue-800/30", label: "" },
  "O/U_half":  { bg: "from-blue-800/30 to-slate-800/50",   text: "text-blue-300/70", border: "border-blue-700/20",  label: "半场" },
  "HDP":       { bg: "from-orange-900/50 to-slate-800/50",  text: "text-orange-300",  border: "border-orange-800/30", label: "" },
  "HDP_half":  { bg: "from-orange-800/30 to-slate-800/50",  text: "text-orange-300/70",border: "border-orange-700/20", label: "半场" },
  "1X2":       { bg: "from-purple-900/50 to-slate-800/50",  text: "text-purple-300",  border: "border-purple-800/30", label: "" },
  "1X2_half":  { bg: "from-purple-800/30 to-slate-800/50",  text: "text-purple-300/70",border: "border-purple-700/20", label: "半场" },
  "O/E":       { bg: "from-green-900/50 to-slate-800/50",   text: "text-green-300",   border: "border-green-800/30", label: "" },
  "O/E_half":  { bg: "from-green-800/30 to-slate-800/50",   text: "text-green-300/70", border: "border-green-700/20", label: "半场" },
  "NEXT":      { bg: "from-cyan-900/50 to-slate-800/50",    text: "text-cyan-300",    border: "border-cyan-800/30",  label: "" },
  "NEXT_half": { bg: "from-cyan-800/30 to-slate-800/50",    text: "text-cyan-300/70", border: "border-cyan-700/20",  label: "半场" },
};

export default function MarketCard({ handicap, homeTeam, awayTeam, compact = false }: MarketCardProps) {
  const { category, categoryLabel, period, line, odds } = handicap;
  const colorKey = period === "half" ? `${category}_half` : category;
  const colors = categoryGradients[colorKey] || categoryGradients["O/U"];
  const shortLabel = categoryLabel.length > 6
    ? categoryLabel.replace("上半场 ", "半")
    : categoryLabel;

  return (
    <div className={`bg-gradient-to-br ${colors.bg} rounded-lg ${compact ? "p-2" : "p-3"} border ${colors.border} ${compact ? "min-w-[110px] w-[110px]" : "min-w-[140px] flex-1"}`}>
      <div className={`${compact ? "text-[10px]" : "text-xs"} ${colors.text} mb-1.5 font-medium text-center`}>
        {shortLabel}
        {handicap.source === "xhr" && (
          <span className="ml-1 text-[8px] text-emerald-400" title="实时数据">●</span>
        )}
      </div>

      {category === "O/U" && (
        <>
          <div className="text-center">
            <div className={`${compact ? "text-[10px]" : "text-xs"} text-slate-400`}>大 {line ?? "--"}</div>
            <div className={`${compact ? "text-base" : "text-lg"} font-bold text-white`}>{(odds?.over || 0).toFixed(2)}</div>
          </div>
          <div className={`text-center ${compact ? "mt-1.5 pt-1.5" : "mt-2 pt-2"} border-t border-slate-700`}>
            <div className={`${compact ? "text-[10px]" : "text-xs"} text-slate-400`}>小 {line ?? "--"}</div>
            <div className={`${compact ? "text-base" : "text-lg"} font-bold text-white`}>{(odds?.under || 0).toFixed(2)}</div>
          </div>
        </>
      )}

      {category === "HDP" && (
        <>
          <div className="text-center">
            <div className={`${compact ? "text-[10px]" : "text-xs"} text-slate-400`}>
              {homeTeam || "主队"} ({line ?? "--"})
            </div>
            <div className={`${compact ? "text-base" : "text-lg"} font-bold text-white`}>{(odds?.home || 0).toFixed(2)}</div>
          </div>
          <div className={`text-center ${compact ? "mt-1.5 pt-1.5" : "mt-2 pt-2"} border-t border-slate-700`}>
            <div className={`${compact ? "text-[10px]" : "text-xs"} text-slate-400`}>
              {awayTeam || "客队"} ({line ?? "--"})
            </div>
            <div className={`${compact ? "text-base" : "text-lg"} font-bold text-white`}>{(odds?.away || 0).toFixed(2)}</div>
          </div>
        </>
      )}

      {category === "1X2" && (
        <div className="flex justify-around text-center">
          <div>
            <div className={`${compact ? "text-[10px]" : "text-xs"} text-slate-400`}>主</div>
            <div className={`${compact ? "text-sm" : "text-sm"} font-bold text-white`}>{(odds?.home || 0).toFixed(2)}</div>
          </div>
          <div>
            <div className={`${compact ? "text-[10px]" : "text-xs"} text-slate-400`}>平</div>
            <div className={`${compact ? "text-sm" : "text-sm"} font-bold text-white`}>{(odds?.draw || 0).toFixed(2)}</div>
          </div>
          <div>
            <div className={`${compact ? "text-[10px]" : "text-xs"} text-slate-400`}>客</div>
            <div className={`${compact ? "text-sm" : "text-sm"} font-bold text-white`}>{(odds?.away || 0).toFixed(2)}</div>
          </div>
        </div>
      )}

      {category === "O/E" && (
        <>
          <div className="text-center">
            <div className={`${compact ? "text-[10px]" : "text-xs"} text-slate-400`}>单</div>
            <div className={`${compact ? "text-base" : "text-lg"} font-bold text-white`}>{(odds?.odd || 0).toFixed(2)}</div>
          </div>
          <div className={`text-center ${compact ? "mt-1.5 pt-1.5" : "mt-2 pt-2"} border-t border-slate-700`}>
            <div className={`${compact ? "text-[10px]" : "text-xs"} text-slate-400`}>双</div>
            <div className={`${compact ? "text-base" : "text-lg"} font-bold text-white`}>{(odds?.even || 0).toFixed(2)}</div>
          </div>
        </>
      )}

      {category === "NEXT" && (
        <>
          <div className="text-center">
            <div className={`${compact ? "text-[10px]" : "text-xs"} text-slate-400`}>
              {homeTeam || "主队"}
            </div>
            <div className={`${compact ? "text-base" : "text-lg"} font-bold text-white`}>{(odds?.home || 0).toFixed(2)}</div>
          </div>
          <div className={`text-center ${compact ? "mt-1.5 pt-1.5" : "mt-2 pt-2"} border-t border-slate-700`}>
            <div className={`${compact ? "text-[10px]" : "text-xs"} text-slate-400`}>
              {awayTeam || "客队"}
            </div>
            <div className={`${compact ? "text-base" : "text-lg"} font-bold text-white`}>{(odds?.away || 0).toFixed(2)}</div>
          </div>
        </>
      )}

      {/* 波胆 / Correct Score - 使用评分矩阵 */}
      {category === "CS" && odds && (
        <div className="grid grid-cols-2 gap-1.5 text-center">
          {Object.entries(odds).filter(([k]) => k !== "home" && k !== "away").map(([key, val]) => (
            <div key={key} className="bg-slate-800/50 rounded px-1 py-1">
              <div className={`${compact ? "text-[9px]" : "text-[10px]"} text-slate-400`}>{key}</div>
              <div className={`${compact ? "text-[10px]" : "text-xs"} font-bold text-white`}>{(val as number).toFixed(2)}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}