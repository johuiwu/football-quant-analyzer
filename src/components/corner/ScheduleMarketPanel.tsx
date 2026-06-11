import React from "react";
import type { HandicapEntry } from "../../store/cornerStore";

interface ScheduleMarketPanelProps {
  handicaps: HandicapEntry[];
  homeTeam: string;
  awayTeam: string;
}

export default function ScheduleMarketPanel({ handicaps, homeTeam, awayTeam }: ScheduleMarketPanelProps) {
  const getHandicapByType = (category: string, period: string = "full") => {
    return handicaps.find(h => h.category === category && h.period === period);
  };

  const marketTypes = [
    { category: "O/U", period: "full", label: "大/小" },
    { category: "O/U", period: "half", label: "大/小\n上半场" },
    { category: "HDP", period: "full", label: "让球" },
    { category: "HDP", period: "half", label: "让球\n上半场" },
    { category: "1X2", period: "full", label: "独赢" },
    { category: "1X2", period: "half", label: "独赢\n上半场" },
    { category: "O/E", period: "full", label: "单/双" },
    { category: "O/E", period: "half", label: "单/双\n上半场" },
  ];

  const categoryColors: Record<string, { bg: string; text: string; border: string }> = {
    "O/U": { bg: "bg-blue-900/30", text: "text-blue-300", border: "border-blue-800/30" },
    "HDP": { bg: "bg-orange-900/30", text: "text-orange-300", border: "border-orange-800/30" },
    "1X2": { bg: "bg-purple-900/30", text: "text-purple-300", border: "border-purple-800/30" },
    "O/E": { bg: "bg-green-900/30", text: "text-green-300", border: "border-green-800/30" },
  };

  const renderMarketCard = (market: typeof marketTypes[0]) => {
    const h = getHandicapByType(market.category, market.period);
    const colors = categoryColors[market.category] || categoryColors["O/U"];
    const isHalf = market.period === "half";

    if (!h) {
      return (
        <div key={`${market.category}-${market.period}`} className={`${colors.bg} ${colors.border} border rounded px-2 py-1 min-h-[80px] flex flex-col items-center justify-center opacity-50`}>
          <div className={`text-[10px] ${colors.text} text-center font-medium leading-tight`}>
            {market.label}
          </div>
          <div className="text-xs text-slate-500 mt-1">暂无数据</div>
        </div>
      );
    }

    return (
      <div key={`${market.category}-${market.period}`} className={`${colors.bg} ${colors.border} border rounded px-2 py-1 min-h-[80px] flex flex-col`}>
        <div className={`text-[10px] ${colors.text} text-center font-medium leading-tight mb-1`}>
          {market.label}
        </div>
        
        {h.category === "O/U" && (
          <>
            <div className="flex-1 flex flex-col items-center justify-center">
              <div className="text-[9px] text-slate-400">大 {h.line ?? "--"}</div>
              <div className={`text-sm font-bold text-white ${isHalf ? 'text-xs' : ''}`}>
                {(h.odds?.over || 0).toFixed(2)}
              </div>
            </div>
            <div className="border-t border-slate-700/50 pt-1">
              <div className="text-[9px] text-slate-400">小 {h.line ?? "--"}</div>
              <div className={`text-sm font-bold text-white ${isHalf ? 'text-xs' : ''}`}>
                {(h.odds?.under || 0).toFixed(2)}
              </div>
            </div>
          </>
        )}
        
        {h.category === "HDP" && (
          <>
            <div className="flex-1 flex flex-col items-center justify-center">
              <div className="text-[9px] text-slate-400">{h.line ?? "--"}</div>
              <div className={`text-sm font-bold text-white ${isHalf ? 'text-xs' : ''}`}>
                {(h.odds?.home || 0).toFixed(2)}
              </div>
            </div>
            <div className="border-t border-slate-700/50 pt-1">
              <div className="text-[9px] text-slate-400">{h.line ?? "--"}</div>
              <div className={`text-sm font-bold text-white ${isHalf ? 'text-xs' : ''}`}>
                {(h.odds?.away || 0).toFixed(2)}
              </div>
            </div>
          </>
        )}
        
        {h.category === "1X2" && (
          <>
            <div className="flex-1 flex flex-col items-center justify-center">
              <div className="text-[9px] text-slate-400">主</div>
              <div className={`text-sm font-bold text-white ${isHalf ? 'text-xs' : ''}`}>
                {(h.odds?.home || 0).toFixed(2)}
              </div>
            </div>
            <div className="border-t border-slate-700/50 pt-1">
              <div className="text-[9px] text-slate-400">客/和</div>
              <div className={`text-sm font-bold text-white ${isHalf ? 'text-xs' : ''}`}>
                {h.odds?.away ? (h.odds.away).toFixed(2) : '--'}
                {h.odds?.draw && (
                  <span className="ml-1 text-[10px]">和{(h.odds.draw).toFixed(2)}</span>
                )}
              </div>
            </div>
          </>
        )}
        
        {h.category === "O/E" && (
          <>
            <div className="flex-1 flex flex-col items-center justify-center">
              <div className="text-[9px] text-slate-400">单</div>
              <div className={`text-sm font-bold text-white ${isHalf ? 'text-xs' : ''}`}>
                {(h.odds?.odd || 0).toFixed(2)}
              </div>
            </div>
            <div className="border-t border-slate-700/50 pt-1">
              <div className="text-[9px] text-slate-400">双</div>
              <div className={`text-sm font-bold text-white ${isHalf ? 'text-xs' : ''}`}>
                {(h.odds?.even || 0).toFixed(2)}
              </div>
            </div>
          </>
        )}
      </div>
    );
  };

  return (
    <div className="grid grid-cols-8 gap-1">
      {marketTypes.map(renderMarketCard)}
    </div>
  );
}