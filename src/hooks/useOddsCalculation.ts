import { useState, useEffect, useMemo, useCallback } from 'react';
import { AsianHandicapParams, calculateDynamicAsianHandicap, convertAsianTo1X2 } from '../utils/quantModel';
import { TeamStats } from '../data/realTeamsData';

export function useOddsCalculation(homeTeam: TeamStats | null, awayTeam: TeamStats | null, homeInjuries: number, awayInjuries: number) {
  const [asianHandicap, setAsianHandicap] = useState<AsianHandicapParams>({
    handicap: -0.5,
    homeWater: 0.92,
    awayWater: 0.92,
  });
  const [goalsLine, setGoalsLine] = useState<number>(2.5);
  const [returnRate, setReturnRate] = useState<number>(0.94);

  useEffect(() => {
    if (!homeTeam || !awayTeam) return;
    
    const dynamicAsian = calculateDynamicAsianHandicap(
      homeTeam,
      awayTeam,
      homeInjuries,
      awayInjuries
    );
    
    console.log('[盘口联动] 主队:', homeTeam.nameCn, 'xG:', homeTeam.homeXg,
      '| 客队:', awayTeam.nameCn, 'xG:', awayTeam.awayXg,
      '| 盘口:', dynamicAsian.handicap, '水位:', dynamicAsian.homeWater, '/', dynamicAsian.awayWater);
    
    setAsianHandicap(dynamicAsian);
  }, [homeTeam, awayTeam, homeInjuries, awayInjuries]);

  const convertedOdds = useMemo(() => {
    return convertAsianTo1X2(
      asianHandicap.handicap,
      asianHandicap.homeWater,
      asianHandicap.awayWater,
      returnRate
    );
  }, [asianHandicap, returnRate]);

  const odds = useMemo(() => ({
    home: convertedOdds.homeOdds,
    draw: convertedOdds.drawOdds,
    away: convertedOdds.awayOdds,
  }), [convertedOdds]);

  return {
    asianHandicap,
    setAsianHandicap,
    goalsLine,
    setGoalsLine,
    returnRate,
    setReturnRate,
    odds
  };
}
