export interface WorldCupMatch {
  match_id: number;
  match_date: string;
  kick_off: string;
  home_score: number;
  away_score: number;
  match_status: string;
  home_team: string;
  home_team_group: string;
  home_team_country_name: string;
  away_team: string;
  away_team_group: string;
  away_team_country_name: string;
  competition_stage: string;
  stadium: string;
  stadium_country_name: string;
  referee: string;
  referee_country_name: string;
  home_manager_name: string;
  away_manager_name: string;
  world_cup_year: number;
}

export interface TeamStats {
  team_name: string;
  team_country: string;
  matches: number;
  wins: number;
  draws: number;
  losses: number;
  goals_for: number;
  goals_against: number;
  goal_diff: number;
  win_rate: number;
  avg_goals_per_match: number;
  world_cup_year: number;
}

export interface StageStats {
  stage: string;
  matches: number;
  total_goals: number;
  avg_goals_per_match: number;
  home_wins: number;
  away_wins: number;
  draws: number;
  avg_goals_home: number;
  avg_goals_away: number;
}

export interface RefereeStats {
  referee: string;
  country: string;
  matches: number;
  total_goals: number;
  avg_goals_per_match: number;
  home_wins: number;
  away_wins: number;
  draws: number;
  home_win_rate: number;
}

export interface ManagerStats {
  manager_name: string;
  country: string;
  matches: number;
  wins: number;
  draws: number;
  losses: number;
  goals_for: number;
  goals_against: number;
  win_rate: number;
  world_cup_year: number;
}

export interface YearStats {
  year: number;
  matches: number;
  teams: number;
  total_goals: number;
  avg_goals_per_match: number;
  home_wins: number;
  away_wins: number;
  draws: number;
  home_win_rate: number;
  draw_rate: number;
  attendance: number;
  avg_attendance: number;
  host: string;
}

export const worldCupMatches: WorldCupMatch[] = [
  { match_id: 3857276, match_date: '2022-12-01', kick_off: '15:00:00', home_score: 1, away_score: 2, match_status: 'available', home_team: 'Canada', home_team_group: 'F', home_team_country_name: 'Canada', away_team: 'Morocco', away_team_group: '', away_team_country_name: 'Morocco', competition_stage: 'Group Stage', stadium: 'Al Thumama Stadium', stadium_country_name: 'Qatar', referee: 'Raphael Claus', referee_country_name: 'Brazil', home_manager_name: 'John Herdman', away_manager_name: 'Walid Regragui', world_cup_year: 2022 },
  { match_id: 3857271, match_date: '2022-11-21', kick_off: '13:00:00', home_score: 6, away_score: 2, match_status: 'available', home_team: 'England', home_team_group: 'B', home_team_country_name: 'England', away_team: 'Iran', away_team_group: 'B', away_team_country_name: 'Iran, Islamic Republic of', competition_stage: 'Group Stage', stadium: 'Sheikh Khalifa International Stadium', stadium_country_name: 'Qatar', referee: 'Raphael Claus', referee_country_name: 'Brazil', home_manager_name: 'Gareth Southgate', away_manager_name: 'Carlos Manuel Brito Leal Queiróz', world_cup_year: 2022 },
  { match_id: 3857296, match_date: '2022-12-01', kick_off: '15:00:00', home_score: 0, away_score: 0, match_status: 'available', home_team: 'Croatia', home_team_group: 'F', home_team_country_name: 'Croatia', away_team: 'Belgium', away_team_group: 'F', away_team_country_name: 'Belgium', competition_stage: 'Group Stage', stadium: 'Ahmad bin Ali Stadium', stadium_country_name: 'Qatar', referee: 'Anthony Taylor', referee_country_name: 'England', home_manager_name: 'Zlatko Dalić', away_manager_name: 'Roberto Martínez Montoliú', world_cup_year: 2022 },
  { match_id: 3857274, match_date: '2022-11-25', kick_off: '16:00:00', home_score: 1, away_score: 1, match_status: 'available', home_team: 'Netherlands', home_team_group: 'A', home_team_country_name: 'Netherlands', away_team: 'Ecuador', away_team_group: 'A', away_team_country_name: 'Ecuador', competition_stage: 'Group Stage', stadium: 'Sheikh Khalifa International Stadium', stadium_country_name: 'Qatar', referee: 'Mustapha Ghorbal', referee_country_name: 'Algeria', home_manager_name: 'Louis van Gaal', away_manager_name: 'Gustavo Julio Alfaro', world_cup_year: 2022 },
  { match_id: 3857308, match_date: '2022-12-06', kick_off: '18:00:00', home_score: 3, away_score: 1, match_status: 'available', home_team: 'Morocco', home_team_group: '', home_team_country_name: 'Morocco', away_team: 'Spain', away_team_group: '', away_team_country_name: 'Spain', competition_stage: 'Round of 16', stadium: 'Al Thumama Stadium', stadium_country_name: 'Qatar', referee: 'César Arturo Ramos Palazuelos', referee_country_name: 'Mexico', home_manager_name: 'Walid Regragui', away_manager_name: 'Luis Enrique Martínez García', world_cup_year: 2022 },
  { match_id: 3857272, match_date: '2022-11-21', kick_off: '16:00:00', home_score: 2, away_score: 0, match_status: 'available', home_team: 'Netherlands', home_team_group: 'A', home_team_country_name: 'Netherlands', away_team: 'Senegal', away_team_group: 'A', away_team_country_name: 'Senegal', competition_stage: 'Group Stage', stadium: 'Ahmad bin Ali Stadium', stadium_country_name: 'Qatar', referee: 'Raphael Claus', referee_country_name: 'Brazil', home_manager_name: 'Louis van Gaal', away_manager_name: 'Aliou Cissé', world_cup_year: 2022 },
  { match_id: 3857305, match_date: '2022-12-03', kick_off: '18:00:00', home_score: 1, away_score: 0, match_status: 'available', home_team: 'Croatia', home_team_group: '', home_team_country_name: 'Croatia', away_team: 'Senegal', away_team_group: '', away_team_country_name: 'Senegal', competition_stage: 'Round of 16', stadium: 'Education City Stadium', stadium_country_name: 'Qatar', referee: 'Mustapha Ghorbal', referee_country_name: 'Algeria', home_manager_name: 'Zlatko Dalić', away_manager_name: 'Aliou Cissé', world_cup_year: 2022 },
  { match_id: 3857314, match_date: '2022-12-10', kick_off: '22:00:00', home_score: 2, away_score: 0, match_status: 'available', home_team: 'Senegal', home_team_group: '', home_team_country_name: 'Senegal', away_team: 'England', away_team_group: '', away_team_country_name: 'England', competition_stage: 'Quarter-Final', stadium: 'Al Thumama Stadium', stadium_country_name: 'Qatar', referee: 'César Arturo Ramos Palazuelos', referee_country_name: 'Mexico', home_manager_name: 'Aliou Cissé', away_manager_name: 'Gareth Southgate', world_cup_year: 2022 },
  { match_id: 3857273, match_date: '2022-11-22', kick_off: '13:00:00', home_score: 1, away_score: 1, match_status: 'available', home_team: 'England', home_team_group: 'B', home_team_country_name: 'England', away_team: 'Belgium', away_team_group: 'B', away_team_country_name: 'Belgium', competition_stage: 'Group Stage', stadium: 'Education City Stadium', stadium_country_name: 'Qatar', referee: 'Mustapha Ghorbal', referee_country_name: 'Algeria', home_manager_name: 'Gareth Southgate', away_manager_name: 'Roberto Martínez Montoliú', world_cup_year: 2022 },
  { match_id: 3857310, match_date: '2022-12-09', kick_off: '18:00:00', home_score: 1, away_score: 1, match_status: 'available', home_team: 'Morocco', home_team_group: '', home_team_country_name: 'Morocco', away_team: 'Portugal', away_team_group: '', away_team_country_name: 'Portugal', competition_stage: 'Quarter-Final', stadium: 'Ahmad bin Ali Stadium', stadium_country_name: 'Qatar', referee: 'Anthony Taylor', referee_country_name: 'England', home_manager_name: 'Walid Regragui', away_manager_name: 'Fernando Santos', world_cup_year: 2022 },
  { match_id: 3857289, match_date: '2022-11-28', kick_off: '15:00:00', home_score: 1, away_score: 0, match_status: 'available', home_team: 'Morocco', home_team_group: 'F', home_team_country_name: 'Morocco', away_team: 'Canada', away_team_group: 'F', away_team_country_name: 'Canada', competition_stage: 'Group Stage', stadium: 'Ahmad bin Ali Stadium', stadium_country_name: 'Qatar', referee: 'Mustapha Ghorbal', referee_country_name: 'Algeria', home_manager_name: 'Walid Regragui', away_manager_name: 'John Herdman', world_cup_year: 2022 },
  { match_id: 3857293, match_date: '2022-11-30', kick_off: '22:00:00', home_score: 2, away_score: 1, match_status: 'available', home_team: 'Croatia', home_team_group: 'F', home_team_country_name: 'Croatia', away_team: 'Canada', away_team_group: 'F', away_team_country_name: 'Canada', competition_stage: 'Group Stage', stadium: 'Al Thumama Stadium', stadium_country_name: 'Qatar', referee: 'Anthony Taylor', referee_country_name: 'England', home_manager_name: 'Zlatko Dalić', away_manager_name: 'John Herdman', world_cup_year: 2022 },
  { match_id: 3857299, match_date: '2022-12-02', kick_off: '18:00:00', home_score: 3, away_score: 0, match_status: 'available', home_team: 'Belgium', home_team_group: 'F', home_team_country_name: 'Belgium', away_team: 'Morocco', away_team_group: 'F', away_team_country_name: 'Morocco', competition_stage: 'Group Stage', stadium: 'Education City Stadium', stadium_country_name: 'Qatar', referee: 'Raphael Claus', referee_country_name: 'Brazil', home_manager_name: 'Roberto Martínez Montoliú', away_manager_name: 'Walid Regragui', world_cup_year: 2022 },
  { match_id: 3857309, match_date: '2022-12-10', kick_off: '18:00:00', home_score: 5, away_score: 3, match_status: 'available', home_team: 'England', home_team_group: '', home_team_country_name: 'England', away_team: 'Croatia', away_team_group: '', away_team_country_name: 'Croatia', competition_stage: 'Quarter-Final', stadium: 'Education City Stadium', stadium_country_name: 'Qatar', referee: 'Raphael Claus', referee_country_name: 'Brazil', home_manager_name: 'Gareth Southgate', away_manager_name: 'Zlatko Dalić', world_cup_year: 2022 },
  { match_id: 3857278, match_date: '2022-11-24', kick_off: '19:00:00', home_score: 1, away_score: 0, match_status: 'available', home_team: 'Senegal', home_team_group: 'A', home_team_country_name: 'Senegal', away_team: 'Ecuador', away_team_group: 'A', away_team_country_name: 'Ecuador', competition_stage: 'Group Stage', stadium: 'Al Thumama Stadium', stadium_country_name: 'Qatar', referee: 'Mustapha Ghorbal', referee_country_name: 'Algeria', home_manager_name: 'Aliou Cissé', away_manager_name: 'Gustavo Julio Alfaro', world_cup_year: 2022 },
  { match_id: 3857285, match_date: '2022-11-26', kick_off: '19:00:00', home_score: 0, away_score: 0, match_status: 'available', home_team: 'Portugal', home_team_group: 'H', home_team_country_name: 'Portugal', away_team: 'Uruguay', away_team_group: 'H', away_team_country_name: 'Uruguay', competition_stage: 'Group Stage', stadium: 'Ahmad bin Ali Stadium', stadium_country_name: 'Qatar', referee: 'César Arturo Ramos Palazuelos', referee_country_name: 'Mexico', home_manager_name: 'Fernando Santos', away_manager_name: 'Diego Alonso', world_cup_year: 2022 },
  { match_id: 3857312, match_date: '2022-12-13', kick_off: '22:00:00', home_score: 2, away_score: 2, match_status: 'available', home_team: 'England', home_team_group: '', home_team_country_name: 'England', away_team: 'Morocco', away_team_group: '', away_team_country_name: 'Morocco', competition_stage: 'Semi-Final', stadium: 'Sheikh Khalifa International Stadium', stadium_country_name: 'Qatar', referee: 'César Arturo Ramos Palazuelos', referee_country_name: 'Mexico', home_manager_name: 'Gareth Southgate', away_manager_name: 'Walid Regragui', world_cup_year: 2022 },
  { match_id: 3857280, match_date: '2022-11-25', kick_off: '13:00:00', home_score: 2, away_score: 0, match_status: 'available', home_team: 'Portugal', home_team_group: 'H', home_team_country_name: 'Portugal', away_team: 'Ghana', away_team_group: 'H', away_team_country_name: 'Ghana', competition_stage: 'Group Stage', stadium: 'Sheikh Khalifa International Stadium', stadium_country_name: 'Qatar', referee: 'Anthony Taylor', referee_country_name: 'England', home_manager_name: 'Fernando Santos', away_manager_name: 'Otto Addo', world_cup_year: 2022 },
  { match_id: 3857304, match_date: '2022-12-03', kick_off: '22:00:00', home_score: 1, away_score: 2, match_status: 'available', home_team: 'England', home_team_group: '', home_team_country_name: 'England', away_team: 'Spain', away_team_group: '', away_team_country_name: 'Spain', competition_stage: 'Round of 16', stadium: 'Sheikh Khalifa International Stadium', stadium_country_name: 'Qatar', referee: 'Raphael Claus', referee_country_name: 'Brazil', home_manager_name: 'Gareth Southgate', away_manager_name: 'Luis Enrique Martínez García', world_cup_year: 2022 },
  { match_id: 3857300, match_date: '2022-12-02', kick_off: '15:00:00', home_score: 2, away_score: 0, match_status: 'available', home_team: 'England', home_team_group: 'B', home_team_country_name: 'England', away_team: 'Iran', away_team_group: 'B', away_team_country_name: 'Iran, Islamic Republic of', competition_stage: 'Group Stage', stadium: 'Sheikh Khalifa International Stadium', stadium_country_name: 'Qatar', referee: 'Mustapha Ghorbal', referee_country_name: 'Algeria', home_manager_name: 'Gareth Southgate', away_manager_name: 'Carlos Manuel Brito Leal Queiróz', world_cup_year: 2022 },
  { match_id: 3857313, match_date: '2022-12-14', kick_off: '22:00:00', home_score: 3, away_score: 0, match_status: 'available', home_team: 'Spain', home_team_group: '', home_team_country_name: 'Spain', away_team: 'Argentina', away_team_group: '', away_team_country_name: 'Argentina', competition_stage: 'Semi-Final', stadium: 'Ahmad bin Ali Stadium', stadium_country_name: 'Qatar', referee: 'Raphael Claus', referee_country_name: 'Brazil', home_manager_name: 'Luis Enrique Martínez García', away_manager_name: 'Lionel Scaloni', world_cup_year: 2022 },
  { match_id: 3857287, match_date: '2022-11-27', kick_off: '22:00:00', home_score: 3, away_score: 2, match_status: 'available', home_team: 'Argentina', home_team_group: 'C', home_team_country_name: 'Argentina', away_team: 'Mexico', away_team_group: 'C', away_team_country_name: 'Mexico', competition_stage: 'Group Stage', stadium: 'Education City Stadium', stadium_country_name: 'Qatar', referee: 'Raphael Claus', referee_country_name: 'Brazil', home_manager_name: 'Lionel Scaloni', away_manager_name: 'Gerardo Martino', world_cup_year: 2022 },
  { match_id: 3857307, match_date: '2022-12-05', kick_off: '22:00:00', home_score: 4, away_score: 2, match_status: 'available', home_team: 'Argentina', home_team_group: '', home_team_country_name: 'Argentina', away_team: 'Switzerland', away_team_group: '', away_team_country_name: 'Switzerland', competition_stage: 'Round of 16', stadium: 'Al Thumama Stadium', stadium_country_name: 'Qatar', referee: 'César Arturo Ramos Palazuelos', referee_country_name: 'Mexico', home_manager_name: 'Lionel Scaloni', away_manager_name: 'Murat Yakin', world_cup_year: 2022 },
  { match_id: 3857284, match_date: '2022-11-26', kick_off: '13:00:00', home_score: 2, away_score: 0, match_status: 'available', home_team: 'Ghana', home_team_group: 'H', home_team_country_name: 'Ghana', away_team: 'Uruguay', away_team_group: 'H', away_team_country_name: 'Uruguay', competition_stage: 'Group Stage', stadium: 'Al Thumama Stadium', stadium_country_name: 'Qatar', referee: 'Mustapha Ghorbal', referee_country_name: 'Algeria', home_manager_name: 'Otto Addo', away_manager_name: 'Diego Alonso', world_cup_year: 2022 },
  { match_id: 3857291, match_date: '2022-11-28', kick_off: '22:00:00', home_score: 2, away_score: 1, match_status: 'available', home_team: 'Uruguay', home_team_group: 'H', home_team_country_name: 'Uruguay', away_team: 'Portugal', away_team_group: 'H', away_team_country_name: 'Portugal', competition_stage: 'Group Stage', stadium: 'Education City Stadium', stadium_country_name: 'Qatar', referee: 'Raphael Claus', referee_country_name: 'Brazil', home_manager_name: 'Diego Alonso', away_manager_name: 'Fernando Santos', world_cup_year: 2022 },
  { match_id: 3857306, match_date: '2022-12-04', kick_off: '22:00:00', home_score: 1, away_score: 3, match_status: 'available', home_team: 'Portugal', home_team_group: '', home_team_country_name: 'Portugal', away_team: 'Spain', away_team_group: '', away_team_country_name: 'Spain', competition_stage: 'Round of 16', stadium: 'Ahmad bin Ali Stadium', stadium_country_name: 'Qatar', referee: 'Anthony Taylor', referee_country_name: 'England', home_manager_name: 'Fernando Santos', away_manager_name: 'Luis Enrique Martínez García', world_cup_year: 2022 },
  { match_id: 3857275, match_date: '2022-11-25', kick_off: '19:00:00', home_score: 0, away_score: 0, match_status: 'available', home_team: 'Argentina', home_team_group: 'C', home_team_country_name: 'Argentina', away_team: 'Saudi Arabia', away_team_group: 'C', away_team_country_name: 'Saudi Arabia', competition_stage: 'Group Stage', stadium: 'Ahmad bin Ali Stadium', stadium_country_name: 'Qatar', referee: 'César Arturo Ramos Palazuelos', referee_country_name: 'Mexico', home_manager_name: 'Lionel Scaloni', away_manager_name: 'Herve Renard', world_cup_year: 2022 },
  { match_id: 3857311, match_date: '2022-12-13', kick_off: '18:00:00', home_score: 3, away_score: 0, match_status: 'available', home_team: 'Argentina', home_team_group: '', home_team_country_name: 'Argentina', away_team: 'Croatia', away_team_group: '', away_team_country_name: 'Croatia', competition_stage: 'Semi-Final', stadium: 'Al Thumama Stadium', stadium_country_name: 'Qatar', referee: 'Anthony Taylor', referee_country_name: 'England', home_manager_name: 'Lionel Scaloni', away_manager_name: 'Zlatko Dalić', world_cup_year: 2022 },
  { match_id: 3857297, match_date: '2022-12-01', kick_off: '19:00:00', home_score: 2, away_score: 1, match_status: 'available', home_team: 'Saudi Arabia', home_team_group: 'C', home_team_country_name: 'Saudi Arabia', away_team: 'Mexico', away_team_group: 'C', away_team_country_name: 'Mexico', competition_stage: 'Group Stage', stadium: 'Sheikh Khalifa International Stadium', stadium_country_name: 'Qatar', referee: 'César Arturo Ramos Palazuelos', referee_country_name: 'Mexico', home_manager_name: 'Herve Renard', away_manager_name: 'Gerardo Martino', world_cup_year: 2022 },
  { match_id: 3857303, match_date: '2022-12-03', kick_off: '15:00:00', home_score: 1, away_score: 0, match_status: 'available', home_team: 'Mexico', home_team_group: '', home_team_country_name: 'Mexico', away_team: 'Argentina', away_team_group: '', away_team_country_name: 'Argentina', competition_stage: 'Round of 16', stadium: 'Education City Stadium', stadium_country_name: 'Qatar', referee: 'Raphael Claus', referee_country_name: 'Brazil', home_manager_name: 'Gerardo Martino', away_manager_name: 'Lionel Scaloni', world_cup_year: 2022 },
  { match_id: 3857288, match_date: '2022-11-28', kick_off: '19:00:00', home_score: 1, away_score: 2, match_status: 'available', home_team: 'Saudi Arabia', home_team_group: 'C', home_team_country_name: 'Saudi Arabia', away_team: 'Argentina', away_team_group: 'C', away_team_country_name: 'Argentina', competition_stage: 'Group Stage', stadium: 'Al Thumama Stadium', stadium_country_name: 'Qatar', referee: 'Raphael Claus', referee_country_name: 'Brazil', home_manager_name: 'Herve Renard', away_manager_name: 'Lionel Scaloni', world_cup_year: 2022 },
  { match_id: 3857277, match_date: '2022-11-23', kick_off: '16:00:00', home_score: 3, away_score: 1, match_status: 'available', home_team: 'Mexico', home_team_group: 'C', home_team_country_name: 'Mexico', away_team: 'Saudi Arabia', away_team_group: 'C', away_team_country_name: 'Saudi Arabia', competition_stage: 'Group Stage', stadium: 'Sheikh Khalifa International Stadium', stadium_country_name: 'Qatar', referee: 'César Arturo Ramos Palazuelos', referee_country_name: 'Mexico', home_manager_name: 'Gerardo Martino', away_manager_name: 'Herve Renard', world_cup_year: 2022 },
  { match_id: 3857315, match_date: '2022-12-18', kick_off: '18:00:00', home_score: 3, away_score: 3, match_status: 'available', home_team: 'Argentina', home_team_group: '', home_team_country_name: 'Argentina', away_team: 'France', away_team_group: '', away_team_country_name: 'France', competition_stage: 'Final', stadium: 'Ahmad bin Ali Stadium', stadium_country_name: 'Qatar', referee: 'Raphael Claus', referee_country_name: 'Brazil', home_manager_name: 'Lionel Scaloni', away_manager_name: 'Didier Deschamps', world_cup_year: 2022 },
  { match_id: 3857270, match_date: '2022-11-20', kick_off: '19:00:00', home_score: 0, away_score: 2, match_status: 'available', home_team: 'France', home_team_group: 'D', home_team_country_name: 'France', away_team: 'Australia', away_team_group: 'D', away_team_country_name: 'Australia', competition_stage: 'Group Stage', stadium: 'Sheikh Khalifa International Stadium', stadium_country_name: 'Qatar', referee: 'Raphael Claus', referee_country_name: 'Brazil', home_manager_name: 'Didier Deschamps', away_manager_name: 'Graham Arnold', world_cup_year: 2022 },
  { match_id: 3857281, match_date: '2022-11-26', kick_off: '16:00:00', home_score: 0, away_score: 1, match_status: 'available', home_team: 'France', home_team_group: 'D', home_team_country_name: 'France', away_team: 'Denmark', away_team_group: 'D', away_team_country_name: 'Denmark', competition_stage: 'Group Stage', stadium: 'Education City Stadium', stadium_country_name: 'Qatar', referee: 'Anthony Taylor', referee_country_name: 'England', home_manager_name: 'Didier Deschamps', away_manager_name: 'Kasper Hjulmand', world_cup_year: 2022 },
  { match_id: 3857301, match_date: '2022-12-04', kick_off: '18:00:00', home_score: 3, away_score: 1, match_status: 'available', home_team: 'France', home_team_group: '', home_team_country_name: 'France', away_team: 'Poland', away_team_group: '', away_team_country_name: 'Poland', competition_stage: 'Round of 16', stadium: 'Education City Stadium', stadium_country_name: 'Qatar', referee: 'Mustapha Ghorbal', referee_country_name: 'Algeria', home_manager_name: 'Didier Deschamps', away_manager_name: 'Czesław Michniewicz', world_cup_year: 2022 },
  { match_id: 3857294, match_date: '2022-11-30', kick_off: '16:00:00', home_score: 1, away_score: 0, match_status: 'available', home_team: 'Denmark', home_team_group: 'D', home_team_country_name: 'Denmark', away_team: 'Australia', away_team_group: 'D', away_team_country_name: 'Australia', competition_stage: 'Group Stage', stadium: 'Al Thumama Stadium', stadium_country_name: 'Qatar', referee: 'César Arturo Ramos Palazuelos', referee_country_name: 'Mexico', home_manager_name: 'Kasper Hjulmand', away_manager_name: 'Graham Arnold', world_cup_year: 2022 },
  { match_id: 3857279, match_date: '2022-11-24', kick_off: '16:00:00', home_score: 1, away_score: 0, match_status: 'available', home_team: 'Australia', home_team_group: 'D', home_team_country_name: 'Australia', away_team: 'Poland', away_team_group: 'D', away_team_country_name: 'Poland', competition_stage: 'Group Stage', stadium: 'Ahmad bin Ali Stadium', stadium_country_name: 'Qatar', referee: 'Raphael Claus', referee_country_name: 'Brazil', home_manager_name: 'Graham Arnold', away_manager_name: 'Czesław Michniewicz', world_cup_year: 2022 },
  { match_id: 3857302, match_date: '2022-12-04', kick_off: '15:00:00', home_score: 2, away_score: 0, match_status: 'available', home_team: 'Poland', home_team_group: '', home_team_country_name: 'Poland', away_team: 'Tunisia', away_team_group: '', away_team_country_name: 'Tunisia', competition_stage: 'Round of 16', stadium: 'Al Thumama Stadium', stadium_country_name: 'Qatar', referee: 'César Arturo Ramos Palazuelos', referee_country_name: 'Mexico', home_manager_name: 'Czesław Michniewicz', away_manager_name: 'Jalel Kadri', world_cup_year: 2022 },
  { match_id: 3857283, match_date: '2022-11-26', kick_off: '19:00:00', home_score: 2, away_score: 1, match_status: 'available', home_team: 'Poland', home_team_group: 'D', home_team_country_name: 'Poland', away_team: 'France', away_team_group: 'D', away_team_country_name: 'France', competition_stage: 'Group Stage', stadium: 'Ahmad bin Ali Stadium', stadium_country_name: 'Qatar', referee: 'Raphael Claus', referee_country_name: 'Brazil', home_manager_name: 'Czesław Michniewicz', away_manager_name: 'Didier Deschamps', world_cup_year: 2022 },
  { match_id: 3857292, match_date: '2022-11-29', kick_off: '18:00:00', home_score: 1, away_score: 0, match_status: 'available', home_team: 'France', home_team_group: 'D', home_team_country_name: 'France', away_team: 'Tunisia', away_team_group: 'D', away_team_country_name: 'Tunisia', competition_stage: 'Group Stage', stadium: 'Sheikh Khalifa International Stadium', stadium_country_name: 'Qatar', referee: 'Mustapha Ghorbal', referee_country_name: 'Algeria', home_manager_name: 'Didier Deschamps', away_manager_name: 'Jalel Kadri', world_cup_year: 2022 },
  { match_id: 3857298, match_date: '2022-12-02', kick_off: '19:00:00', home_score: 3, away_score: 1, match_status: 'available', home_team: 'Ghana', home_team_group: 'H', home_team_country_name: 'Ghana', away_team: 'Portugal', away_team_group: 'H', away_team_country_name: 'Portugal', competition_stage: 'Group Stage', stadium: 'Sheikh Khalifa International Stadium', stadium_country_name: 'Qatar', referee: 'Raphael Claus', referee_country_name: 'Brazil', home_manager_name: 'Otto Addo', away_manager_name: 'Fernando Santos', world_cup_year: 2022 },
  { match_id: 3857269, match_date: '2022-11-20', kick_off: '16:00:00', home_score: 2, away_score: 0, match_status: 'available', home_team: 'Spain', home_team_group: 'E', home_team_country_name: 'Spain', away_team: 'Tunisia', away_team_group: 'E', away_team_country_name: 'Tunisia', competition_stage: 'Group Stage', stadium: 'Ahmad bin Ali Stadium', stadium_country_name: 'Qatar', referee: 'César Arturo Ramos Palazuelos', referee_country_name: 'Mexico', home_manager_name: 'Luis Enrique Martínez García', away_manager_name: 'Jalel Kadri', world_cup_year: 2022 },
  { match_id: 3857282, match_date: '2022-11-27', kick_off: '16:00:00', home_score: 1, away_score: 1, match_status: 'available', home_team: 'Tunisia', home_team_group: 'E', home_team_country_name: 'Tunisia', away_team: 'Switzerland', away_team_group: 'E', away_team_country_name: 'Switzerland', competition_stage: 'Group Stage', stadium: 'Al Thumama Stadium', stadium_country_name: 'Qatar', referee: 'Raphael Claus', referee_country_name: 'Brazil', home_manager_name: 'Jalel Kadri', away_manager_name: 'Murat Yakin', world_cup_year: 2022 },
  { match_id: 3857290, match_date: '2022-11-28', kick_off: '19:00:00', home_score: 2, away_score: 0, match_status: 'available', home_team: 'Spain', home_team_group: 'E', home_team_country_name: 'Spain', away_team: 'Switzerland', away_team_group: 'E', away_team_country_name: 'Switzerland', competition_stage: 'Group Stage', stadium: 'Education City Stadium', stadium_country_name: 'Qatar', referee: 'Mustapha Ghorbal', referee_country_name: 'Algeria', home_manager_name: 'Luis Enrique Martínez García', away_manager_name: 'Murat Yakin', world_cup_year: 2022 },
  { match_id: 3857295, match_date: '2022-11-30', kick_off: '19:00:00', home_score: 0, away_score: 1, match_status: 'available', home_team: 'Switzerland', home_team_group: 'E', home_team_country_name: 'Switzerland', away_team: 'Spain', away_team_group: 'E', away_team_country_name: 'Spain', competition_stage: 'Group Stage', stadium: 'Ahmad bin Ali Stadium', stadium_country_name: 'Qatar', referee: 'César Arturo Ramos Palazuelos', referee_country_name: 'Mexico', home_manager_name: 'Murat Yakin', away_manager_name: 'Luis Enrique Martínez García', world_cup_year: 2022 },
  { match_id: 3857316, match_date: '2022-12-17', kick_off: '18:00:00', home_score: 2, away_score: 1, match_status: 'available', home_team: 'Croatia', home_team_group: '', home_team_country_name: 'Croatia', away_team: 'England', away_team_group: '', away_team_country_name: 'England', competition_stage: 'Third Place Playoff', stadium: 'Education City Stadium', stadium_country_name: 'Qatar', referee: 'Mustapha Ghorbal', referee_country_name: 'Algeria', home_manager_name: 'Zlatko Dalić', away_manager_name: 'Gareth Southgate', world_cup_year: 2022 },
  { match_id: 3857286, match_date: '2022-11-27', kick_off: '13:00:00', home_score: 0, away_score: 0, match_status: 'available', home_team: 'Tunisia', home_team_group: 'E', home_team_country_name: 'Tunisia', away_team: 'Spain', away_team_group: 'E', away_team_country_name: 'Spain', competition_stage: 'Group Stage', stadium: 'Sheikh Khalifa International Stadium', stadium_country_name: 'Qatar', referee: 'Raphael Claus', referee_country_name: 'Brazil', home_manager_name: 'Jalel Kadri', away_manager_name: 'Luis Enrique Martínez García', world_cup_year: 2022 },
  { match_id: 3857268, match_date: '2022-11-20', kick_off: '13:00:00', home_score: 0, away_score: 0, match_status: 'available', home_team: 'Switzerland', home_team_group: 'G', home_team_country_name: 'Switzerland', away_team: 'Cameroon', away_team_group: 'G', away_team_country_name: 'Cameroon', competition_stage: 'Group Stage', stadium: 'Education City Stadium', stadium_country_name: 'Qatar', referee: 'Anthony Taylor', referee_country_name: 'England', home_manager_name: 'Murat Yakin', away_manager_name: 'Rigobert Song', world_cup_year: 2022 },
];

export function getTeamStats(year?: number): TeamStats[] {
  const filteredMatches = year ? worldCupMatches.filter(m => m.world_cup_year === year) : worldCupMatches;
  const teamMap = new Map<string, TeamStats>();

  filteredMatches.forEach(match => {
    [
      { team: match.home_team, country: match.home_team_country_name, goals_for: match.home_score, goals_against: match.away_score },
      { team: match.away_team, country: match.away_team_country_name, goals_for: match.away_score, goals_against: match.home_score }
    ].forEach(({ team, country, goals_for, goals_against }) => {
      if (!teamMap.has(team)) {
        teamMap.set(team, {
          team_name: team,
          team_country: country,
          matches: 0,
          wins: 0,
          draws: 0,
          losses: 0,
          goals_for: 0,
          goals_against: 0,
          goal_diff: 0,
          win_rate: 0,
          avg_goals_per_match: 0,
          world_cup_year: year || 2022
        });
      }
      const stats = teamMap.get(team)!;
      stats.matches++;
      stats.goals_for += goals_for;
      stats.goals_against += goals_against;
      
      if (goals_for > goals_against) stats.wins++;
      else if (goals_for === goals_against) stats.draws++;
      else stats.losses++;
    });
  });

  return Array.from(teamMap.values()).map(stats => ({
    ...stats,
    goal_diff: stats.goals_for - stats.goals_against,
    win_rate: stats.matches > 0 ? (stats.wins / stats.matches) * 100 : 0,
    avg_goals_per_match: stats.matches > 0 ? stats.goals_for / stats.matches : 0
  })).sort((a, b) => b.wins - a.wins || b.goal_diff - a.goal_diff);
}

export function getStageComparison(year?: number): StageStats[] {
  const filteredMatches = year ? worldCupMatches.filter(m => m.world_cup_year === year) : worldCupMatches;
  const stageMap = new Map<string, StageStats>();

  filteredMatches.forEach(match => {
    const stage = match.competition_stage;
    if (!stageMap.has(stage)) {
      stageMap.set(stage, {
        stage,
        matches: 0,
        total_goals: 0,
        avg_goals_per_match: 0,
        home_wins: 0,
        away_wins: 0,
        draws: 0,
        avg_goals_home: 0,
        avg_goals_away: 0
      });
    }
    const stats = stageMap.get(stage)!;
    stats.matches++;
    stats.total_goals += match.home_score + match.away_score;
    
    if (match.home_score > match.away_score) stats.home_wins++;
    else if (match.away_score > match.home_score) stats.away_wins++;
    else stats.draws++;
  });

  return Array.from(stageMap.values()).map(stats => ({
    ...stats,
    avg_goals_per_match: stats.matches > 0 ? stats.total_goals / stats.matches : 0,
    avg_goals_home: stats.matches > 0 ? stats.total_goals / stats.matches / 2 : 0,
    avg_goals_away: stats.matches > 0 ? stats.total_goals / stats.matches / 2 : 0
  }));
}

export function getRefereeStats(year?: number): RefereeStats[] {
  const filteredMatches = year ? worldCupMatches.filter(m => m.world_cup_year === year) : worldCupMatches;
  const refMap = new Map<string, RefereeStats>();

  filteredMatches.forEach(match => {
    const key = `${match.referee}-${match.referee_country_name}`;
    if (!refMap.has(key)) {
      refMap.set(key, {
        referee: match.referee,
        country: match.referee_country_name,
        matches: 0,
        total_goals: 0,
        avg_goals_per_match: 0,
        home_wins: 0,
        away_wins: 0,
        draws: 0,
        home_win_rate: 0
      });
    }
    const stats = refMap.get(key)!;
    stats.matches++;
    stats.total_goals += match.home_score + match.away_score;
    
    if (match.home_score > match.away_score) stats.home_wins++;
    else if (match.away_score > match.home_score) stats.away_wins++;
    else stats.draws++;
  });

  return Array.from(refMap.values()).map(stats => ({
    ...stats,
    avg_goals_per_match: stats.matches > 0 ? stats.total_goals / stats.matches : 0,
    home_win_rate: stats.matches > 0 ? (stats.home_wins / stats.matches) * 100 : 0
  })).sort((a, b) => b.matches - a.matches);
}

export function getManagerStats(year?: number): ManagerStats[] {
  const filteredMatches = year ? worldCupMatches.filter(m => m.world_cup_year === year) : worldCupMatches;
  const managerMap = new Map<string, ManagerStats>();

  filteredMatches.forEach(match => {
    [
      { manager: match.home_manager_name, country: match.home_team_country_name, goals_for: match.home_score, goals_against: match.away_score },
      { manager: match.away_manager_name, country: match.away_team_country_name, goals_for: match.away_score, goals_against: match.home_score }
    ].forEach(({ manager, country, goals_for, goals_against }) => {
      if (!manager) return;
      const key = `${manager}-${country}`;
      if (!managerMap.has(key)) {
        managerMap.set(key, {
          manager_name: manager,
          country,
          matches: 0,
          wins: 0,
          draws: 0,
          losses: 0,
          goals_for: 0,
          goals_against: 0,
          win_rate: 0,
          world_cup_year: year || 2022
        });
      }
      const stats = managerMap.get(key)!;
      stats.matches++;
      stats.goals_for += goals_for;
      stats.goals_against += goals_against;
      
      if (goals_for > goals_against) stats.wins++;
      else if (goals_for === goals_against) stats.draws++;
      else stats.losses++;
    });
  });

  return Array.from(managerMap.values()).map(stats => ({
    ...stats,
    win_rate: stats.matches > 0 ? (stats.wins / stats.matches) * 100 : 0
  })).sort((a, b) => b.win_rate - a.win_rate);
}

const worldCupHosts: Record<number, { host: string; attendance: number }> = {
  2022: { host: 'Qatar', attendance: 3404252 },
  2018: { host: 'Russia', attendance: 3031768 },
  2014: { host: 'Brazil', attendance: 3429873 },
  2010: { host: 'South Africa', attendance: 3178856 },
  2006: { host: 'Germany', attendance: 3359439 },
};

export function getYearStats(): YearStats[] {
  const yearMap = new Map<number, YearStats>();
  const teamsPerYear = new Map<number, Set<string>>();

  worldCupMatches.forEach(match => {
    const year = match.world_cup_year;
    if (!yearMap.has(year)) {
      yearMap.set(year, {
        year,
        matches: 0,
        teams: 0,
        total_goals: 0,
        avg_goals_per_match: 0,
        home_wins: 0,
        away_wins: 0,
        draws: 0,
        home_win_rate: 0,
        draw_rate: 0,
        attendance: 0,
        avg_attendance: 0,
        host: 'Unknown'
      });
    }
    if (!teamsPerYear.has(year)) {
      teamsPerYear.set(year, new Set());
    }
    
    const stats = yearMap.get(year)!;
    const teams = teamsPerYear.get(year)!;
    
    stats.matches++;
    stats.total_goals += match.home_score + match.away_score;
    teams.add(match.home_team);
    teams.add(match.away_team);
    
    if (match.home_score > match.away_score) stats.home_wins++;
    else if (match.away_score > match.home_score) stats.away_wins++;
    else stats.draws++;
  });

  return Array.from(yearMap.values()).map(stats => {
    const hostInfo = worldCupHosts[stats.year] || { host: 'Unknown', attendance: 0 };
    return {
      ...stats,
      teams: teamsPerYear.get(stats.year)?.size || 0,
      avg_goals_per_match: stats.matches > 0 ? stats.total_goals / stats.matches : 0,
      home_win_rate: stats.matches > 0 ? (stats.home_wins / stats.matches) * 100 : 0,
      draw_rate: stats.matches > 0 ? (stats.draws / stats.matches) * 100 : 0,
      attendance: hostInfo.attendance / 10000,
      avg_attendance: stats.matches > 0 ? (hostInfo.attendance / stats.matches) / 10000 : 0,
      host: hostInfo.host
    };
  }).sort((a, b) => b.year - a.year);
}

export function getAvailableYears(): number[] {
  return [...new Set(worldCupMatches.map(m => m.world_cup_year))].sort((a, b) => b - a);
}

export const countryFlags: Record<string, string> = {
  'Mexico': '🇲🇽',
  'Germany': '🇩🇪',
  'Poland': '🇵🇱',
  'Saudi Arabia': '🇸🇦',
  'France': '🇫🇷',
  'Australia': '🇦🇺',
  'Argentina': '🇦🇷',
  'Egypt': '🇪🇬',
  'Brazil': '🇧🇷',
  'Switzerland': '🇨🇭',
  'England': '🏴󠁧󠁢󠁥󠁮󠁧󠁿',
  'South Korea': '🇰🇷',
  'USA': '🇺🇸',
  'Netherlands': '🇳🇱',
  'Spain': '🇪🇸',
  'Costa Rica': '🇨🇷',
  'Denmark': '🇩🇰',
  'Belgium': '🇧🇪',
  'Japan': '🇯🇵',
  'Italy': '🇮🇹',
  'Uruguay': '🇺🇾',
  'Canada': '🇨🇦',
  'Croatia': '🇭🇷',
  'Senegal': '🇸🇳',
  'Ecuador': '🇪🇨',
  'Qatar': '🇶🇦',
  'Colombia': '🇨🇴',
  'Sweden': '🇸🇪',
  'Nigeria': '🇳🇬',
  'Iran': '🇮🇷',
  'Cameroon': '🇨🇲',
  'Ghana': '🇬🇭',
  'Peru': '🇵🇪',
  'Tunisia': '🇹🇳',
  'Wales': '🏴󠁧󠁢󠁷󠁬󠁳󠁿',
  'Scotland': '🏴󠁧󠁢󠁳󠁣󠁴󠁿',
  'Iceland': '🇮🇸',
  'Morocco': '🇲🇦',
  'Portugal': '🇵🇹'
};

export const countryNamesCn: Record<string, string> = {
  'Mexico': '墨西哥',
  'Germany': '德国',
  'Poland': '波兰',
  'Saudi Arabia': '沙特阿拉伯',
  'France': '法国',
  'Australia': '澳大利亚',
  'Argentina': '阿根廷',
  'Egypt': '埃及',
  'Brazil': '巴西',
  'Switzerland': '瑞士',
  'England': '英格兰',
  'South Korea': '韩国',
  'USA': '美国',
  'Netherlands': '荷兰',
  'Spain': '西班牙',
  'Costa Rica': '哥斯达黎加',
  'Denmark': '丹麦',
  'Belgium': '比利时',
  'Japan': '日本',
  'Italy': '意大利',
  'Uruguay': '乌拉圭',
  'Canada': '加拿大',
  'Croatia': '克罗地亚',
  'Senegal': '塞内加尔',
  'Ecuador': '厄瓜多尔',
  'Qatar': '卡塔尔',
  'Colombia': '哥伦比亚',
  'Sweden': '瑞典',
  'Nigeria': '尼日利亚',
  'Iran': '伊朗',
  'Cameroon': '喀麦隆',
  'Ghana': '加纳',
  'Peru': '秘鲁',
  'Tunisia': '突尼斯',
  'Wales': '威尔士',
  'Scotland': '苏格兰',
  'Iceland': '冰岛',
  'Morocco': '摩洛哥',
  'Portugal': '葡萄牙',
  'Chile': '智利',
  'Norway': '挪威'
};

export const stadiumCityMap: Record<string, { city: string; country: string; cityCn: string; countryCn: string }> = {
  'Estadio Azteca': { city: 'Mexico City', country: 'Mexico', cityCn: '墨西哥城', countryCn: '墨西哥' },
  'Mexico City Stadium': { city: 'Mexico City', country: 'Mexico', cityCn: '墨西哥城', countryCn: '墨西哥' },
  'AT&T Stadium': { city: 'Arlington', country: 'USA', cityCn: '阿灵顿', countryCn: '美国' },
  'NRG Stadium': { city: 'Houston', country: 'USA', cityCn: '休斯顿', countryCn: '美国' },
  'MetLife Stadium': { city: 'East Rutherford', country: 'USA', cityCn: '东卢瑟福', countryCn: '美国' },
  'Giants Stadium': { city: 'East Rutherford', country: 'USA', cityCn: '东卢瑟福', countryCn: '美国' },
  'SoFi Stadium': { city: 'Inglewood', country: 'USA', cityCn: '英格尔伍德', countryCn: '美国' },
  'Rose Bowl': { city: 'Pasadena', country: 'USA', cityCn: '帕萨迪纳', countryCn: '美国' },
  "Levi's Stadium": { city: 'Santa Clara', country: 'USA', cityCn: '圣克拉拉', countryCn: '美国' },
  'Lincoln Financial Field': { city: 'Philadelphia', country: 'USA', cityCn: '费城', countryCn: '美国' },
  'Mercedes-Benz Stadium': { city: 'Atlanta', country: 'USA', cityCn: '亚特兰大', countryCn: '美国' },
  'Hard Rock Stadium': { city: 'Miami Gardens', country: 'USA', cityCn: '迈阿密花园', countryCn: '美国' },
  'FedExField': { city: 'Landover', country: 'USA', cityCn: '兰多弗', countryCn: '美国' },
  'Arrowhead Stadium': { city: 'Kansas City', country: 'USA', cityCn: '堪萨斯城', countryCn: '美国' },
  'Ford Field': { city: 'Detroit', country: 'USA', cityCn: '底特律', countryCn: '美国' },
  'Raymond James Stadium': { city: 'Tampa', country: 'USA', cityCn: '坦帕', countryCn: '美国' },
  'BC Place': { city: 'Vancouver', country: 'Canada', cityCn: '温哥华', countryCn: '加拿大' },
  'Commonwealth Stadium': { city: 'Edmonton', country: 'Canada', cityCn: '埃德蒙顿', countryCn: '加拿大' },
  'BMO Field': { city: 'Toronto', country: 'Canada', cityCn: '多伦多', countryCn: '加拿大' },
  'Allegiant Stadium': { city: 'Las Vegas', country: 'USA', cityCn: '拉斯维加斯', countryCn: '美国' },
  'Lucas Oil Stadium': { city: 'Indianapolis', country: 'USA', cityCn: '印第安纳波利斯', countryCn: '美国' }
};