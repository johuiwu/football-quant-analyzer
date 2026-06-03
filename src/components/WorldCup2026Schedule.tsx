import { WorldCup2026Match, countryFlags, countryNamesCn, stadiumCityMap } from '../data/worldCup2026Schedule';

interface WorldCup2026ScheduleProps {
  matches: WorldCup2026Match[];
}

export function WorldCup2026Schedule({ matches }: WorldCup2026ScheduleProps) {
  const groupedByDate = matches.reduce((acc, match) => {
    const date = match.date;
    if (!acc[date]) {
      acc[date] = [];
    }
    acc[date].push(match);
    return acc;
  }, {} as Record<string, WorldCup2026Match[]>);

  const sortedDates = Object.keys(groupedByDate).sort();

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    const month = date.getMonth() + 1;
    const day = date.getDate();
    return `${month}月${day}日`;
  };

  return (
    <div className="bg-[#0F1424] rounded-2xl border border-slate-800 overflow-hidden">
      <div className="px-5 py-4 border-b border-slate-800">
        <h3 className="text-sm font-semibold text-slate-200">🏟️ 2026年世界杯赛程</h3>
        <p className="text-xs text-slate-400 mt-1">美加墨联合举办 · 48支球队 · 80场比赛</p>
      </div>
      
      <div className="p-4 space-y-4">
        {sortedDates.map((date) => (
          <div key={date} className="bg-slate-900/50 rounded-xl border border-slate-800 overflow-hidden">
            <div className="px-4 py-3 bg-slate-950">
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-400">📅</span>
                <span className="text-sm font-semibold text-slate-200">{formatDate(date)}</span>
              </div>
            </div>
            
            <div className="p-2 space-y-2">
              {groupedByDate[date].map((match, index) => {
                const stadiumInfo = stadiumCityMap[match.stadium] || { cityCn: '', countryCn: '' };
                const homeFlag = countryFlags[match.home_team] || '🏳️';
                const awayFlag = countryFlags[match.away_team] || '🏳️';
                const homeNameCn = countryNamesCn[match.home_team] || match.home_team;
                const awayNameCn = countryNamesCn[match.away_team] || match.away_team;
                
                return (
                  <div 
                    key={index}
                    className="flex items-center justify-between bg-slate-950/50 rounded-lg p-3 hover:bg-slate-800/30 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <div className="text-center min-w-[70px]">
                        <div className="text-xs text-slate-400 font-medium">{match.time}</div>
                        <div className="text-[10px] text-slate-500 mt-1 truncate">{match.stadium}</div>
                      </div>
                      
                      <div className="flex items-center gap-3">
                        <div className="text-center min-w-[90px]">
                          <div className="flex items-center justify-center gap-1.5">
                            <span className="text-xl">{homeFlag}</span>
                            <span className="font-semibold text-slate-200 text-sm">{homeNameCn}</span>
                          </div>
                        </div>
                        
                        <div className="text-center">
                          <div className="text-lg font-bold text-slate-300">VS</div>
                          <div className="text-[10px] text-amber-400 mt-1 font-medium">{match.group}</div>
                        </div>
                        
                        <div className="text-center min-w-[90px]">
                          <div className="flex items-center justify-center gap-1.5">
                            <span className="text-xl">{awayFlag}</span>
                            <span className="font-semibold text-slate-200 text-sm">{awayNameCn}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                    
                    <div className="text-right">
                      <div className="text-xs text-slate-300">{stadiumInfo.cityCn}</div>
                      <div className="text-[10px] text-slate-500 mt-1">{stadiumInfo.countryCn}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}