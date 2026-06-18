// 简化版 models 供 backend 使用
const computeTeamXGSplit = function(team, isHome) {
  const stats = isHome ? team.homeStats : team.awayStats;
  const played = Math.max(1, stats.played);
  const goalsPerGame = stats.goalsFor / played;
  const concededPerGame = stats.goalsAgainst / played;
  return { 
    xgFor: Math.round(goalsPerGame * 0.95 * 100) / 100, 
    xgAgainst: Math.round(concededPerGame * 1.05 * 100) / 100 
  };
};

module.exports = {
  computeTeamXGSplit,
};
