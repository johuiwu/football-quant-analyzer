import React, { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import type { HandicapEntry } from "../../store/cornerStore";
import MarketCard from "./MarketCard";

interface MarketSectionProps {
  title: string;
  icon?: React.ReactNode;
  count: number;
  handicaps: HandicapEntry[];
  homeTeam?: string;
  awayTeam?: string;
  defaultExpanded?: boolean;
  accentColor?: string;
}

const accentStyles: Record<string, { bar: string; text: string; bg: string; count: string }> = {
  main:     { bar: "bg-emerald-500", text: "text-emerald-300", bg: "bg-emerald-500/10", count: "bg-emerald-500/15 text-emerald-400" },
  corner:   { bg: "bg-amber-500/10", bar: "bg-amber-500",  text: "text-amber-300",  count: "bg-amber-500/15 text-amber-400" },
  score:    { bg: "bg-purple-500/10", bar: "bg-purple-500", text: "text-purple-300", count: "bg-purple-500/15 text-purple-400" },
};

export default function MarketSection({
  title,
  icon,
  count,
  handicaps,
  homeTeam,
  awayTeam,
  defaultExpanded = false,
  accentColor = "main",
}: MarketSectionProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const colors = accentStyles[accentColor] || accentStyles.main;
  const isCorner = accentColor === "corner"; // 角球盘口使用紧凑布局

  if (count === 0) {
    return (
      <div className="border border-slate-800/40 rounded-lg overflow-hidden">
        <div className="flex items-center gap-2 px-3 py-2 bg-slate-900/30 text-slate-500 cursor-default select-none">
          {icon && <span className="w-4 h-4 opacity-50">{icon}</span>}
          <span className="text-xs font-medium">{title}</span>
          <span className="text-[10px] text-slate-600">(暂无数据)</span>
        </div>
      </div>
    );
  }

  return (
    <div className="border border-slate-800/50 rounded-lg overflow-hidden">
      {/* 分类标题行（可点击折叠） */}
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className={`w-full flex items-center justify-between px-3 py-2 ${colors.bg} hover:bg-slate-800/40 transition-colors`}
      >
        <div className="flex items-center gap-2">
          {icon && <span className="w-4 h-4 opacity-80">{icon}</span>}
          <span className={`text-xs font-medium ${colors.text}`}>{title}</span>
          <span className={`text-[10px] px-1.5 py-0.5 rounded ${colors.count}`}>
            {count} 项
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          {count > 0 && !expanded && (
            <span className="text-[9px] text-slate-500">
              {handicaps.map(h => h.categoryLabel.replace("上半场 ", "半")).join("、")}
            </span>
          )}
          {expanded ? (
            <ChevronUp className="w-3.5 h-3.5 text-slate-400" />
          ) : (
            <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
          )}
        </div>
      </button>

      {/* 展开的卡片内容 */}
      {expanded && (
        <div className="px-3 py-2 bg-slate-900/20">
          <div className={isCorner 
            ? "grid grid-cols-4 gap-2" 
            : "flex flex-wrap gap-2"
          }>
            {handicaps.map((h) => (
              <MarketCard
                key={`${h.order}-${h.category}`}
                handicap={h}
                homeTeam={homeTeam}
                awayTeam={awayTeam}
                compact={isCorner}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}