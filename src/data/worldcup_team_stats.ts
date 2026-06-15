export interface WorldCupTeamStats {
  avgXgFor: number;
  avgXgAgainst: number;
  avgPossession: number;
  avgShots: number;
  avgShotsOnTarget: number;
  avgGoalsFor: number;
  avgGoalsAgainst: number;
  avgCorners: number;
  winRate: number;
}

export const TEAM_STATS_MAP: Record<string, WorldCupTeamStats> = {
  baxi: { avgXgFor: 1.3, avgXgAgainst: 1.4, avgPossession: 50, avgShots: 9.0, avgShotsOnTarget: 5.0, avgGoalsFor: 1.0, avgGoalsAgainst: 1.0, avgCorners: 3.5, winRate: 0.42 },
  faguo: { avgXgFor: 2.0, avgXgAgainst: 0.7, avgPossession: 56, avgShots: 13.8, avgShotsOnTarget: 5.5, avgGoalsFor: 2.1, avgGoalsAgainst: 0.6, avgCorners: 5.2, winRate: 0.65 },
  agenting: { avgXgFor: 1.9, avgXgAgainst: 0.7, avgPossession: 55, avgShots: 13.2, avgShotsOnTarget: 5.3, avgGoalsFor: 2.0, avgGoalsAgainst: 0.7, avgCorners: 5.0, winRate: 0.65 },
  yinggelan: { avgXgFor: 2.0, avgXgAgainst: 0.8, avgPossession: 57, avgShots: 14.0, avgShotsOnTarget: 5.6, avgGoalsFor: 2.1, avgGoalsAgainst: 0.7, avgCorners: 5.3, winRate: 0.65 },
  xibanya: { avgXgFor: 1.9, avgXgAgainst: 0.8, avgPossession: 58, avgShots: 13.5, avgShotsOnTarget: 5.4, avgGoalsFor: 2.0, avgGoalsAgainst: 0.8, avgCorners: 5.1, winRate: 0.60 },
  helan: { avgXgFor: 0.8, avgXgAgainst: 0.6, avgPossession: 50, avgShots: 9.0, avgShotsOnTarget: 6.0, avgGoalsFor: 2.0, avgGoalsAgainst: 2.0, avgCorners: 3.5, winRate: 0.80 },
  deguo: { avgXgFor: 4.2, avgXgAgainst: 0.4, avgPossession: 50, avgShots: 18.0, avgShotsOnTarget: 12.0, avgGoalsFor: 7.0, avgGoalsAgainst: 1.0, avgCorners: 3.5, winRate: 1.00 },
  putaoya: { avgXgFor: 1.8, avgXgAgainst: 0.9, avgPossession: 53, avgShots: 12.8, avgShotsOnTarget: 5.1, avgGoalsFor: 1.8, avgGoalsAgainst: 0.9, avgCorners: 4.8, winRate: 0.55 },
  keluodiya: { avgXgFor: 1.7, avgXgAgainst: 1.0, avgPossession: 52, avgShots: 12.0, avgShotsOnTarget: 4.8, avgGoalsFor: 1.7, avgGoalsAgainst: 1.0, avgCorners: 4.5, winRate: 0.55 },
  bilishi: { avgXgFor: 1.8, avgXgAgainst: 0.9, avgPossession: 54, avgShots: 12.5, avgShotsOnTarget: 5.0, avgGoalsFor: 1.8, avgGoalsAgainst: 0.9, avgCorners: 4.7, winRate: 0.55 },
  moluoge: { avgXgFor: 1.4, avgXgAgainst: 1.3, avgPossession: 50, avgShots: 8.0, avgShotsOnTarget: 3.0, avgGoalsFor: 1.0, avgGoalsAgainst: 1.0, avgCorners: 3.5, winRate: 0.40 },
  riben: { avgXgFor: 0.6, avgXgAgainst: 0.8, avgPossession: 50, avgShots: 9.0, avgShotsOnTarget: 3.0, avgGoalsFor: 2.0, avgGoalsAgainst: 2.0, avgCorners: 3.5, winRate: 0.85 },
  wulagui: { avgXgFor: 1.6, avgXgAgainst: 1.0, avgPossession: 50, avgShots: 11.5, avgShotsOnTarget: 4.6, avgGoalsFor: 1.7, avgGoalsAgainst: 1.0, avgCorners: 4.4, winRate: 0.50 },
  gelunbiya: { avgXgFor: 1.5, avgXgAgainst: 1.1, avgPossession: 51, avgShots: 11.0, avgShotsOnTarget: 4.4, avgGoalsFor: 1.5, avgGoalsAgainst: 1.1, avgCorners: 4.2, winRate: 0.50 },
  ruishi: { avgXgFor: 3.2, avgXgAgainst: 0.6, avgPossession: 50, avgShots: 17.0, avgShotsOnTarget: 7.0, avgGoalsFor: 1.0, avgGoalsAgainst: 1.0, avgCorners: 3.5, winRate: 0.00 },
  hanguo: { avgXgFor: 2.3, avgXgAgainst: 0.8, avgPossession: 50, avgShots: 11.0, avgShotsOnTarget: 6.0, avgGoalsFor: 2.0, avgGoalsAgainst: 1.0, avgCorners: 3.5, winRate: 0.42 },
  saineijiaer: { avgXgFor: 1.3, avgXgAgainst: 1.2, avgPossession: 48, avgShots: 9.5, avgShotsOnTarget: 3.8, avgGoalsFor: 1.3, avgGoalsAgainst: 1.2, avgCorners: 3.8, winRate: 0.40 },
  ruidian1: { avgXgFor: 1.3, avgXgAgainst: 0.3, avgPossession: 50, avgShots: 10.0, avgShotsOnTarget: 7.0, avgGoalsFor: 5.0, avgGoalsAgainst: 1.0, avgCorners: 3.5, winRate: 1.00 },
  eguaduoer: { avgXgFor: 1.0, avgXgAgainst: 1.5, avgPossession: 50, avgShots: 9.0, avgShotsOnTarget: 1.0, avgGoalsFor: 0.0, avgGoalsAgainst: 1.0, avgCorners: 3.5, winRate: 0.25 },
  yilang: { avgXgFor: 1.2, avgXgAgainst: 1.2, avgPossession: 47, avgShots: 8.8, avgShotsOnTarget: 3.5, avgGoalsFor: 1.2, avgGoalsAgainst: 1.2, avgCorners: 3.6, winRate: 0.40 },
  aodaliya: { avgXgFor: 1.2, avgXgAgainst: 1.4, avgPossession: 50, avgShots: 8.0, avgShotsOnTarget: 4.0, avgGoalsFor: 2.0, avgGoalsAgainst: 0.0, avgCorners: 3.5, winRate: 0.70 },
  tuerqi1: { avgXgFor: 1.4, avgXgAgainst: 1.2, avgPossession: 50, avgShots: 18.0, avgShotsOnTarget: 8.0, avgGoalsFor: 0.0, avgGoalsAgainst: 2.0, avgCorners: 3.5, winRate: 0.15 },
  nuowei: { avgXgFor: 1.4, avgXgAgainst: 1.2, avgPossession: 50, avgShots: 10.0, avgShotsOnTarget: 4.0, avgGoalsFor: 1.4, avgGoalsAgainst: 1.2, avgCorners: 3.9, winRate: 0.45 },
  aodili: { avgXgFor: 1.3, avgXgAgainst: 1.2, avgPossession: 49, avgShots: 9.5, avgShotsOnTarget: 3.8, avgGoalsFor: 1.3, avgGoalsAgainst: 1.2, avgCorners: 3.8, winRate: 0.40 },
  moxige: { avgXgFor: 1.5, avgXgAgainst: 0.1, avgPossession: 50, avgShots: 11.0, avgShotsOnTarget: 4.0, avgGoalsFor: 2.0, avgGoalsAgainst: 0.0, avgCorners: 3.5, winRate: 0.63 },
  jieke1: { avgXgFor: 0.8, avgXgAgainst: 2.3, avgPossession: 50, avgShots: 7.0, avgShotsOnTarget: 4.0, avgGoalsFor: 1.0, avgGoalsAgainst: 2.0, avgCorners: 3.5, winRate: 0.55 },
  nanfei: { avgXgFor: 0.1, avgXgAgainst: 1.5, avgPossession: 50, avgShots: 3.0, avgShotsOnTarget: 2.0, avgGoalsFor: 0.0, avgGoalsAgainst: 2.0, avgCorners: 3.5, winRate: 0.47 },
  jianada: { avgXgFor: 1.2, avgXgAgainst: 1.0, avgPossession: 50, avgShots: 9.0, avgShotsOnTarget: 4.0, avgGoalsFor: 1.0, avgGoalsAgainst: 1.0, avgCorners: 3.5, winRate: 0.45 },
  bohei1: { avgXgFor: 1.0, avgXgAgainst: 1.2, avgPossession: 50, avgShots: 7.0, avgShotsOnTarget: 3.0, avgGoalsFor: 1.0, avgGoalsAgainst: 1.0, avgCorners: 3.5, winRate: 0.50 },
  kataer: { avgXgFor: 0.6, avgXgAgainst: 3.2, avgPossession: 50, avgShots: 6.0, avgShotsOnTarget: 3.0, avgGoalsFor: 1.0, avgGoalsAgainst: 1.0, avgCorners: 3.5, winRate: 0.60 },
  haidi: { avgXgFor: 1.0, avgXgAgainst: 1.0, avgPossession: 50, avgShots: 11.0, avgShotsOnTarget: 2.0, avgGoalsFor: 0.0, avgGoalsAgainst: 1.0, avgCorners: 3.5, winRate: 0.25 },
  sugelan: { avgXgFor: 1.0, avgXgAgainst: 1.0, avgPossession: 50, avgShots: 7.0, avgShotsOnTarget: 2.0, avgGoalsFor: 1.0, avgGoalsAgainst: 0.0, avgCorners: 3.5, winRate: 0.50 },
  balagui: { avgXgFor: 0.5, avgXgAgainst: 1.3, avgPossession: 50, avgShots: 4.0, avgShotsOnTarget: 1.0, avgGoalsFor: 1.0, avgGoalsAgainst: 4.0, avgCorners: 3.5, winRate: 0.63 },
  kulasuo: { avgXgFor: 0.4, avgXgAgainst: 4.2, avgPossession: 50, avgShots: 8.0, avgShotsOnTarget: 2.0, avgGoalsFor: 1.0, avgGoalsAgainst: 7.0, avgCorners: 3.5, winRate: 0.65 },
  ketediwa1: { avgXgFor: 1.5, avgXgAgainst: 1.0, avgPossession: 50, avgShots: 12.0, avgShotsOnTarget: 4.0, avgGoalsFor: 1.0, avgGoalsAgainst: 0.0, avgCorners: 3.5, winRate: 0.38 },
  fodejiao1: { avgXgFor: 0.7, avgXgAgainst: 1.7, avgPossession: 42, avgShots: 6.0, avgShotsOnTarget: 2.4, avgGoalsFor: 0.7, avgGoalsAgainst: 1.7, avgCorners: 2.7, winRate: 0.25 },
  shatealabo: { avgXgFor: 0.8, avgXgAgainst: 1.6, avgPossession: 43, avgShots: 6.5, avgShotsOnTarget: 2.6, avgGoalsFor: 0.8, avgGoalsAgainst: 1.6, avgCorners: 2.9, winRate: 0.25 },
  aiji1: { avgXgFor: 0.9, avgXgAgainst: 1.5, avgPossession: 44, avgShots: 7.5, avgShotsOnTarget: 3.0, avgGoalsFor: 1.0, avgGoalsAgainst: 1.5, avgCorners: 3.1, winRate: 0.30 },
  xinxilan1: { avgXgFor: 0.7, avgXgAgainst: 1.7, avgPossession: 42, avgShots: 5.8, avgShotsOnTarget: 2.3, avgGoalsFor: 0.7, avgGoalsAgainst: 1.7, avgCorners: 2.7, winRate: 0.25 },
  yilake1: { avgXgFor: 0.7, avgXgAgainst: 1.8, avgPossession: 41, avgShots: 5.5, avgShotsOnTarget: 2.2, avgGoalsFor: 0.7, avgGoalsAgainst: 1.8, avgCorners: 2.6, winRate: 0.20 },
  minzhugangguo: { avgXgFor: 0.7, avgXgAgainst: 1.7, avgPossession: 42, avgShots: 6.0, avgShotsOnTarget: 2.4, avgGoalsFor: 0.7, avgGoalsAgainst: 1.7, avgCorners: 2.8, winRate: 0.25 },
  wuzibiekesitan: { avgXgFor: 0.8, avgXgAgainst: 1.6, avgPossession: 43, avgShots: 6.5, avgShotsOnTarget: 2.6, avgGoalsFor: 0.8, avgGoalsAgainst: 1.6, avgCorners: 3.0, winRate: 0.25 },
  aerjiliya: { avgXgFor: 1.0, avgXgAgainst: 1.4, avgPossession: 45, avgShots: 8.0, avgShotsOnTarget: 3.2, avgGoalsFor: 1.1, avgGoalsAgainst: 1.4, avgCorners: 3.3, winRate: 0.35 },
  yuedan1: { avgXgFor: 0.7, avgXgAgainst: 1.7, avgPossession: 42, avgShots: 5.8, avgShotsOnTarget: 2.3, avgGoalsFor: 0.7, avgGoalsAgainst: 1.7, avgCorners: 2.7, winRate: 0.25 },
  jiana: { avgXgFor: 0.9, avgXgAgainst: 1.5, avgPossession: 44, avgShots: 7.5, avgShotsOnTarget: 3.0, avgGoalsFor: 1.0, avgGoalsAgainst: 1.5, avgCorners: 3.1, winRate: 0.30 },
  banama: { avgXgFor: 0.8, avgXgAgainst: 1.6, avgPossession: 43, avgShots: 6.5, avgShotsOnTarget: 2.6, avgGoalsFor: 0.8, avgGoalsAgainst: 1.6, avgCorners: 2.9, winRate: 0.25 },
  meiguo: { avgXgFor: 1.3, avgXgAgainst: 0.5, avgPossession: 50, avgShots: 12.0, avgShotsOnTarget: 6.0, avgGoalsFor: 4.0, avgGoalsAgainst: 1.0, avgCorners: 3.5, winRate: 1.00 },
  tunisi1: { avgXgFor: 0.3, avgXgAgainst: 1.3, avgPossession: 50, avgShots: 5.0, avgShotsOnTarget: 2.0, avgGoalsFor: 1.0, avgGoalsAgainst: 5.0, avgCorners: 3.5, winRate: 0.68 },
};

export function getTeamStats(teamId: string): WorldCupTeamStats {
  return TEAM_STATS_MAP[teamId] || {
    avgXgFor: 1.2, avgXgAgainst: 1.3, avgPossession: 48,
    avgShots: 9.0, avgShotsOnTarget: 3.5,
    avgGoalsFor: 1.2, avgGoalsAgainst: 1.3,
    avgCorners: 3.5, winRate: 0.40
  };
}
