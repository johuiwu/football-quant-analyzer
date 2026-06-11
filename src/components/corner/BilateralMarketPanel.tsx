import React from "react";
import type { HandicapEntry } from "../../store/cornerStore";

interface BilateralMarketPanelProps {
  handicaps: HandicapEntry[];
  homeTeam: string;
  awayTeam: string;
}

export default function BilateralMarketPanel({ handicaps, homeTeam, awayTeam }: BilateralMarketPanelProps) {
  // 按类型分组盘口
  const hdpHandicaps = handicaps.filter(h => h.category === "HDP");
  const ouHandicaps = handicaps.filter(h => h.category === "O/U");
  const xHandicaps = handicaps.filter(h => h.category === "1X2");
  const oeHandicaps = handicaps.filter(h => h.category === "O/E");

  // 让球盘口布局 - 双边显示
  const renderHdpSection = () => {
    if (hdpHandicaps.length === 0) return null;
    
    return (
      <div className="bg-orange-900/20 rounded-lg p-2 border border-orange-800/30">
        <div className="text-[10px] text-orange-300 font-medium mb-2 text-center">让球</div>
        <div className="space-y-1">
          {hdpHandicaps.map((h, idx) => (
            <div key={h.order || idx} className="grid grid-cols-3 gap-1 text-center">
              <div className="bg-slate-800/50 rounded px-1.5 py-1">
                <div className="text-[10px] text-slate-400">{homeTeam}</div>
                <div className="text-xs font-bold text-white">{(h.odds?.home || 0).toFixed(2)}</div>
              </div>
              <div className="bg-slate-800/30 rounded px-1.5 py-1 flex items-center justify-center">
                <div className="text-[10px] text-orange-300 font-medium">{h.line ?? "--"}</div>
              </div>
              <div className="bg-slate-800/50 rounded px-1.5 py-1">
                <div className="text-[10px] text-slate-400">{awayTeam}</div>
                <div className="text-xs font-bold text-white">{(h.odds?.away || 0).toFixed(2)}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  };

  // 大小球盘口布局 - 双边显示
  const renderOuSection = () => {
    if (ouHandicaps.length === 0) return null;
    
    return (
      <div className="bg-blue-900/20 rounded-lg p-2 border border-blue-800/30">
        <div className="text-[10px] text-blue-300 font-medium mb-2 text-center">得分大小</div>
        <div className="space-y-1">
          {ouHandicaps.map((h, idx) => (
            <div key={h.order || idx} className="grid grid-cols-2 gap-1 text-center">
              <div className="bg-slate-800/50 rounded px-1.5 py-1">
                <div className="text-[10px] text-slate-400">大 {h.line ?? "--"}</div>
                <div className="text-xs font-bold text-white">{(h.odds?.over || 0).toFixed(2)}</div>
              </div>
              <div className="bg-slate-800/50 rounded px-1.5 py-1">
                <div className="text-[10px] text-slate-400">小 {h.line ?? "--"}</div>
                <div className="text-xs font-bold text-white">{(h.odds?.under || 0).toFixed(2)}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  };

  // 独赢盘口布局
  const renderXSection = () => {
    if (xHandicaps.length === 0) return null;
    
    return (
      <div className="bg-purple-900/20 rounded-lg p-2 border border-purple-800/30">
        <div className="text-[10px] text-purple-300 font-medium mb-2 text-center">独赢</div>
        <div className="grid grid-cols-3 gap-1 text-center">
          {xHandicaps.map((h, idx) => (
            <div key={h.order || idx}>
              <div className="text-[10px] text-slate-400">主</div>
              <div className="text-xs font-bold text-white">{(h.odds?.home || 0).toFixed(2)}</div>
            </div>
          ))}
          {xHandicaps.map((h, idx) => (
            <div key={"draw-" + idx}>
              <div className="text-[10px] text-slate-400">平</div>
              <div className="text-xs font-bold text-white">{(h.odds?.draw || 0).toFixed(2)}</div>
            </div>
          ))}
          {xHandicaps.map((h, idx) => (
            <div key={"away-" + idx}>
              <div className="text-[10px] text-slate-400">客</div>
              <div className="text-xs font-bold text-white">{(h.odds?.away || 0).toFixed(2)}</div>
            </div>
          ))}
        </div>
      </div>
    );
  };

  // 单/双盘口布局
  const renderOeSection = () => {
    if (oeHandicaps.length === 0) return null;
    
    return (
      <div className="bg-green-900/20 rounded-lg p-2 border border-green-800/30">
        <div className="text-[10px] text-green-300 font-medium mb-2 text-center">单双</div>
        <div className="grid grid-cols-2 gap-1 text-center">
          {oeHandicaps.map((h, idx) => (
            <>
              <div key={"odd-" + idx}>
                <div className="text-[10px] text-slate-400">单</div>
                <div className="text-xs font-bold text-white">{(h.odds?.odd || 0).toFixed(2)}</div>
              </div>
              <div key={"even-" + idx}>
                <div className="text-[10px] text-slate-400">双</div>
                <div className="text-xs font-bold text-white">{(h.odds?.even || 0).toFixed(2)}</div>
              </div>
            </>
          ))}
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-2">
      {/* 主双边布局：让球(左) + 大小(右) */}
      <div className="grid grid-cols-2 gap-2">
        {renderHdpSection()}
        {renderOuSection()}
      </div>
      
      {/* 第二行：独赢 + 单双 */}
      <div className="grid grid-cols-2 gap-2">
        {renderXSection()}
        {renderOeSection()}
      </div>
    </div>
  );
}