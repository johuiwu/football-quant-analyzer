export interface WorldCupTeam {
  id: string;
  name: string;
  nameCn: string;
  fifaRank: number;
  continent: string;
  elo: number;
  weight: number;
}

export interface WorldCupFixture {
  id: string;
  date: string;
  time: string;
  homeTeam: string;
  awayTeam: string;
  stadium: string;
  group: string;
  stage: 'group' | 'round_of_32' | 'round_of_16' | 'quarter' | 'semi' | 'final';
  homeScore?: number;
  awayScore?: number;
}

export interface WorldCupTeamInfo {
  id: string;
  name: string;
  nameCn: string;
  group: string;
  flag: string;
  elo: number;
}

export const WORLD_CUP_TEAMS: WorldCupTeam[] = [
  { id: 'moxige', name: 'Mexico', nameCn: '墨西哥', fifaRank: 15, continent: 'North America', elo: 1900, weight: 0.7 },
  { id: 'nanfei', name: 'South Africa', nameCn: '南非', fifaRank: 38, continent: 'Africa', elo: 1680, weight: 0.4 },
  { id: 'hanguo', name: 'Korea Republic', nameCn: '韩国', fifaRank: 18, continent: 'Asia', elo: 1880, weight: 0.7 },
  { id: 'jieke1', name: 'Czech Republic', nameCn: '捷克', fifaRank: 28, continent: 'Europe', elo: 1780, weight: 0.55 },
  { id: 'jianada', name: 'Canada', nameCn: '加拿大', fifaRank: 30, continent: 'North America', elo: 1760, weight: 0.55 },
  { id: 'bohei1', name: 'Bosnia and Herzegovina', nameCn: '波黑', fifaRank: 44, continent: 'Europe', elo: 1620, weight: 0.3 },
  { id: 'kataer', name: 'Qatar', nameCn: '卡塔尔', fifaRank: 42, continent: 'Asia', elo: 1640, weight: 0.3 },
  { id: 'ruishi', name: 'Switzerland', nameCn: '瑞士', fifaRank: 14, continent: 'Europe', elo: 1910, weight: 0.7 },
  { id: 'baxi', name: 'Brazil', nameCn: '巴西', fifaRank: 3, continent: 'South America', elo: 2100, weight: 1.0 },
  { id: 'moluoge', name: 'Morocco', nameCn: '摩洛哥', fifaRank: 13, continent: 'Africa', elo: 1930, weight: 0.7 },
  { id: 'haidi', name: 'Haiti', nameCn: '海地', fifaRank: 48, continent: 'North America', elo: 1500, weight: 0.3 },
  { id: 'sugelan', name: 'Scotland', nameCn: '苏格兰', fifaRank: 24, continent: 'Europe', elo: 1820, weight: 0.55 },
  { id: 'meiguo', name: 'United States', nameCn: '美国', fifaRank: 21, continent: 'North America', elo: 1890, weight: 0.7 },
  { id: 'balagui', name: 'Paraguay', nameCn: '巴拉圭', fifaRank: 31, continent: 'South America', elo: 1750, weight: 0.4 },
  { id: 'aodaliya', name: 'Australia', nameCn: '澳大利亚', fifaRank: 29, continent: 'Oceania', elo: 1770, weight: 0.55 },
  { id: 'tuerqi1', name: 'Turkey', nameCn: '土耳其', fifaRank: 23, continent: 'Europe', elo: 1810, weight: 0.55 },
  { id: 'deguo', name: 'Germany', nameCn: '德国', fifaRank: 10, continent: 'Europe', elo: 2010, weight: 1.0 },
  { id: 'kulasuo', name: 'Curaçao', nameCn: '库拉索', fifaRank: 47, continent: 'North America', elo: 1550, weight: 0.3 },
  { id: 'ketediwa1', name: "Côte d'Ivoire", nameCn: '科特迪瓦', fifaRank: 34, continent: 'Africa', elo: 1720, weight: 0.4 },
  { id: 'eguaduoer', name: 'Ecuador', nameCn: '厄瓜多尔', fifaRank: 22, continent: 'South America', elo: 1850, weight: 0.55 },
  { id: 'helan', name: 'Netherlands', nameCn: '荷兰', fifaRank: 6, continent: 'Europe', elo: 2020, weight: 1.0 },
  { id: 'riben', name: 'Japan', nameCn: '日本', fifaRank: 16, continent: 'Asia', elo: 1920, weight: 0.7 },
  { id: 'ruidian1', name: 'Sweden', nameCn: '瑞典', fifaRank: 17, continent: 'Europe', elo: 1860, weight: 0.7 },
  { id: 'tunisi1', name: 'Tunisia', nameCn: '突尼斯', fifaRank: 26, continent: 'Africa', elo: 1790, weight: 0.55 },
  { id: 'bilishi', name: 'Belgium', nameCn: '比利时', fifaRank: 5, continent: 'Europe', elo: 1990, weight: 0.85 },
  { id: 'aiji1', name: 'Egypt', nameCn: '埃及', fifaRank: 32, continent: 'Africa', elo: 1740, weight: 0.4 },
  { id: 'yilang', name: 'Iran', nameCn: '伊朗', fifaRank: 19, continent: 'Asia', elo: 1840, weight: 0.55 },
  { id: 'xinxilan1', name: 'New Zealand', nameCn: '新西兰', fifaRank: 46, continent: 'Oceania', elo: 1600, weight: 0.3 },
  { id: 'xibanya', name: 'Spain', nameCn: '西班牙', fifaRank: 8, continent: 'Europe', elo: 2030, weight: 1.0 },
  { id: 'fodejiao1', name: 'Cape Verde', nameCn: '佛得角', fifaRank: 39, continent: 'Africa', elo: 1670, weight: 0.3 },
  { id: 'shatealabo', name: 'Saudi Arabia', nameCn: '沙特阿拉伯', fifaRank: 35, continent: 'Asia', elo: 1710, weight: 0.4 },
  { id: 'wulagui', name: 'Uruguay', nameCn: '乌拉圭', fifaRank: 11, continent: 'South America', elo: 1970, weight: 0.85 },
  { id: 'faguo', name: 'France', nameCn: '法国', fifaRank: 2, continent: 'Europe', elo: 2080, weight: 1.0 },
  { id: 'saineijiaer', name: 'Senegal', nameCn: '塞内加尔', fifaRank: 20, continent: 'Africa', elo: 1870, weight: 0.7 },
  { id: 'yilake1', name: 'Iraq', nameCn: '伊拉克', fifaRank: 41, continent: 'Asia', elo: 1650, weight: 0.3 },
  { id: 'nuowei', name: 'Norway', nameCn: '挪威', fifaRank: 27, continent: 'Europe', elo: 1830, weight: 0.55 },
  { id: 'agenting', name: 'Argentina', nameCn: '阿根廷', fifaRank: 1, continent: 'South America', elo: 2070, weight: 1.0 },
  { id: 'aerjiliya', name: 'Algeria', nameCn: '阿尔及利亚', fifaRank: 33, continent: 'Africa', elo: 1730, weight: 0.4 },
  { id: 'aodili', name: 'Austria', nameCn: '奥地利', fifaRank: 25, continent: 'Europe', elo: 1800, weight: 0.55 },
  { id: 'yuedan1', name: 'Jordan', nameCn: '约旦', fifaRank: 45, continent: 'Asia', elo: 1610, weight: 0.3 },
  { id: 'putaoya', name: 'Portugal', nameCn: '葡萄牙', fifaRank: 7, continent: 'Europe', elo: 2000, weight: 1.0 },
  { id: 'minzhugangguo', name: 'DR Congo', nameCn: '民主刚果', fifaRank: 43, continent: 'Africa', elo: 1630, weight: 0.3 },
  { id: 'wuzibiekesitan', name: 'Uzbekistan', nameCn: '乌兹别克斯坦', fifaRank: 40, continent: 'Asia', elo: 1660, weight: 0.3 },
  { id: 'gelunbiya', name: 'Colombia', nameCn: '哥伦比亚', fifaRank: 12, continent: 'South America', elo: 1950, weight: 0.85 },
  { id: 'yinggelan', name: 'England', nameCn: '英格兰', fifaRank: 4, continent: 'Europe', elo: 2040, weight: 1.0 },
  { id: 'keluodiya', name: 'Croatia', nameCn: '克罗地亚', fifaRank: 9, continent: 'Europe', elo: 1980, weight: 0.85 },
  { id: 'jiana', name: 'Ghana', nameCn: '加纳', fifaRank: 36, continent: 'Africa', elo: 1700, weight: 0.4 },
  { id: 'banama', name: 'Panama', nameCn: '巴拿马', fifaRank: 37, continent: 'North America', elo: 1690, weight: 0.4 },
];

const teamNameToSlug: Record<string, string> = {
  'Mexico': 'moxige',
  'South Africa': 'nanfei',
  'Korea Republic': 'hanguo',
  'Czech Republic': 'jieke1',
  'Canada': 'jianada',
  'Bosnia and Herzegovina': 'bohei1',
  'USA': 'meiguo',
  'Paraguay': 'balagui',
  'Qatar': 'kataer',
  'Switzerland': 'ruishi',
  'Brazil': 'baxi',
  'Morocco': 'moluoge',
  'Haiti': 'haidi',
  'Scotland': 'sugelan',
  'Australia': 'aodaliya',
  'Turkey': 'tuerqi1',
  'Germany': 'deguo',
  'Curaçao': 'kulasuo',
  "Côte d'Ivoire": 'ketediwa1',
  'Ecuador': 'eguaduoer',
  'Netherlands': 'helan',
  'Japan': 'riben',
  'Sweden': 'ruidian1',
  'Tunisia': 'tunisi1',
  'Spain': 'xibanya',
  'Cape Verde': 'fodejiao1',
  'Belgium': 'bilishi',
  'Egypt': 'aiji1',
  'Saudi Arabia': 'shatealabo',
  'Uruguay': 'wulagui',
  'Iran': 'yilang',
  'New Zealand': 'xinxilan1',
  'France': 'faguo',
  'Senegal': 'saineijiaer',
  'Iraq': 'yilake1',
  'Norway': 'nuowei',
  'Argentina': 'agenting',
  'Algeria': 'aerjiliya',
  'Austria': 'aodili',
  'Jordan': 'yuedan1',
  'Portugal': 'putaoya',
  'DR Congo': 'minzhugangguo',
  'England': 'yinggelan',
  'Croatia': 'keluodiya',
  'Ghana': 'jiana',
  'Panama': 'banama',
  'Uzbekistan': 'wuzibiekesitan',
  'Colombia': 'gelunbiya',
};

export const WORLD_CUP_FIXTURES_2026: WorldCupFixture[] = [
  { id: 'GS01', date: '2026-06-12', time: '03:00', homeTeam: 'moxige', awayTeam: 'nanfei', stadium: 'Estadio Azteca', group: 'A', stage: 'group' },
  { id: 'GS02', date: '2026-06-12', time: '10:00', homeTeam: 'hanguo', awayTeam: 'jieke1', stadium: 'NRG Stadium', group: 'A', stage: 'group' },
  { id: 'GS03', date: '2026-06-13', time: '03:00', homeTeam: 'jianada', awayTeam: 'bohei1', stadium: 'BC Place', group: 'B', stage: 'group' },
  { id: 'GS04', date: '2026-06-13', time: '09:00', homeTeam: 'meiguo', awayTeam: 'balagui', stadium: 'SoFi Stadium', group: 'D', stage: 'group' },
  { id: 'GS05', date: '2026-06-14', time: '03:00', homeTeam: 'kataer', awayTeam: 'ruishi', stadium: 'Allegiant Stadium', group: 'B', stage: 'group' },
  { id: 'GS06', date: '2026-06-14', time: '06:00', homeTeam: 'baxi', awayTeam: 'moluoge', stadium: 'MetLife Stadium', group: 'C', stage: 'group' },
  { id: 'GS07', date: '2026-06-14', time: '09:00', homeTeam: 'haidi', awayTeam: 'sugelan', stadium: 'Giants Stadium', group: 'C', stage: 'group' },
  { id: 'GS08', date: '2026-06-14', time: '12:00', homeTeam: 'aodaliya', awayTeam: 'tuerqi1', stadium: 'Rose Bowl', group: 'D', stage: 'group' },
  { id: 'GS09', date: '2026-06-15', time: '01:00', homeTeam: 'deguo', awayTeam: 'kulasuo', stadium: "Levi's Stadium", group: 'E', stage: 'group' },
  { id: 'GS10', date: '2026-06-15', time: '04:00', homeTeam: 'helan', awayTeam: 'riben', stadium: 'Lincoln Financial Field', group: 'F', stage: 'group' },
  { id: 'GS11', date: '2026-06-15', time: '07:00', homeTeam: 'ketediwa1', awayTeam: 'eguaduoer', stadium: 'Mercedes-Benz Stadium', group: 'E', stage: 'group' },
  { id: 'GS12', date: '2026-06-15', time: '10:00', homeTeam: 'ruidian1', awayTeam: 'tunisi1', stadium: 'FedExField', group: 'F', stage: 'group' },
  { id: 'GS13', date: '2026-06-16', time: '00:00', homeTeam: 'xibanya', awayTeam: 'fodejiao1', stadium: 'Hard Rock Stadium', group: 'H', stage: 'group' },
  { id: 'GS14', date: '2026-06-16', time: '03:00', homeTeam: 'bilishi', awayTeam: 'aiji1', stadium: 'Arrowhead Stadium', group: 'G', stage: 'group' },
  { id: 'GS15', date: '2026-06-16', time: '06:00', homeTeam: 'shatealabo', awayTeam: 'wulagui', stadium: 'Ford Field', group: 'H', stage: 'group' },
  { id: 'GS16', date: '2026-06-16', time: '09:00', homeTeam: 'yilang', awayTeam: 'xinxilan1', stadium: 'Raymond James Stadium', group: 'G', stage: 'group' },
  { id: 'GS17', date: '2026-06-17', time: '03:00', homeTeam: 'faguo', awayTeam: 'saineijiaer', stadium: 'AT&T Stadium', group: 'I', stage: 'group' },
  { id: 'GS18', date: '2026-06-17', time: '06:00', homeTeam: 'yilake1', awayTeam: 'nuowei', stadium: 'NRG Stadium', group: 'I', stage: 'group' },
  { id: 'GS19', date: '2026-06-17', time: '09:00', homeTeam: 'agenting', awayTeam: 'aerjiliya', stadium: 'MetLife Stadium', group: 'J', stage: 'group' },
  { id: 'GS20', date: '2026-06-17', time: '12:00', homeTeam: 'aodili', awayTeam: 'yuedan1', stadium: 'Giants Stadium', group: 'J', stage: 'group' },
  { id: 'GS21', date: '2026-06-18', time: '01:00', homeTeam: 'putaoya', awayTeam: 'minzhugangguo', stadium: 'SoFi Stadium', group: 'K', stage: 'group' },
  { id: 'GS22', date: '2026-06-18', time: '04:00', homeTeam: 'yinggelan', awayTeam: 'keluodiya', stadium: 'Rose Bowl', group: 'L', stage: 'group' },
  { id: 'GS23', date: '2026-06-18', time: '07:00', homeTeam: 'jiana', awayTeam: 'banama', stadium: 'Lucas Oil Stadium', group: 'L', stage: 'group' },
  { id: 'GS24', date: '2026-06-18', time: '10:00', homeTeam: 'wuzibiekesitan', awayTeam: 'gelunbiya', stadium: 'Allegiant Stadium', group: 'K', stage: 'group' },
  { id: 'GS25', date: '2026-06-19', time: '00:00', homeTeam: 'jieke1', awayTeam: 'nanfei', stadium: 'Estadio Azteca', group: 'A', stage: 'group' },
  { id: 'GS26', date: '2026-06-19', time: '03:00', homeTeam: 'ruishi', awayTeam: 'bohei1', stadium: 'BC Place', group: 'B', stage: 'group' },
  { id: 'GS27', date: '2026-06-19', time: '06:00', homeTeam: 'jianada', awayTeam: 'kataer', stadium: 'BMO Field', group: 'B', stage: 'group' },
  { id: 'GS28', date: '2026-06-19', time: '09:00', homeTeam: 'moxige', awayTeam: 'hanguo', stadium: 'Mexico City Stadium', group: 'A', stage: 'group' },
  { id: 'GS29', date: '2026-06-20', time: '03:00', homeTeam: 'meiguo', awayTeam: 'aodaliya', stadium: 'SoFi Stadium', group: 'D', stage: 'group' },
  { id: 'GS30', date: '2026-06-20', time: '06:00', homeTeam: 'sugelan', awayTeam: 'moluoge', stadium: 'Giants Stadium', group: 'C', stage: 'group' },
  { id: 'GS31', date: '2026-06-20', time: '08:30', homeTeam: 'baxi', awayTeam: 'haidi', stadium: 'MetLife Stadium', group: 'C', stage: 'group' },
  { id: 'GS32', date: '2026-06-20', time: '11:00', homeTeam: 'tuerqi1', awayTeam: 'balagui', stadium: 'Rose Bowl', group: 'D', stage: 'group' },
  { id: 'GS33', date: '2026-06-21', time: '01:00', homeTeam: 'helan', awayTeam: 'ruidian1', stadium: 'Lincoln Financial Field', group: 'F', stage: 'group' },
  { id: 'GS34', date: '2026-06-21', time: '04:00', homeTeam: 'deguo', awayTeam: 'ketediwa1', stadium: "Levi's Stadium", group: 'E', stage: 'group' },
  { id: 'GS35', date: '2026-06-21', time: '08:00', homeTeam: 'eguaduoer', awayTeam: 'kulasuo', stadium: 'Mercedes-Benz Stadium', group: 'E', stage: 'group' },
  { id: 'GS36', date: '2026-06-21', time: '12:00', homeTeam: 'tunisi1', awayTeam: 'riben', stadium: 'FedExField', group: 'F', stage: 'group' },
  { id: 'GS37', date: '2026-06-22', time: '00:00', homeTeam: 'xibanya', awayTeam: 'shatealabo', stadium: 'Hard Rock Stadium', group: 'H', stage: 'group' },
  { id: 'GS38', date: '2026-06-22', time: '03:00', homeTeam: 'bilishi', awayTeam: 'yilang', stadium: 'Arrowhead Stadium', group: 'G', stage: 'group' },
  { id: 'GS39', date: '2026-06-22', time: '06:00', homeTeam: 'wulagui', awayTeam: 'fodejiao1', stadium: 'Ford Field', group: 'H', stage: 'group' },
  { id: 'GS40', date: '2026-06-22', time: '09:00', homeTeam: 'xinxilan1', awayTeam: 'aiji1', stadium: 'Raymond James Stadium', group: 'G', stage: 'group' },
  { id: 'GS41', date: '2026-06-23', time: '01:00', homeTeam: 'agenting', awayTeam: 'aodili', stadium: 'MetLife Stadium', group: 'J', stage: 'group' },
  { id: 'GS42', date: '2026-06-23', time: '05:00', homeTeam: 'faguo', awayTeam: 'yilake1', stadium: 'AT&T Stadium', group: 'I', stage: 'group' },
  { id: 'GS43', date: '2026-06-23', time: '08:00', homeTeam: 'nuowei', awayTeam: 'saineijiaer', stadium: 'NRG Stadium', group: 'I', stage: 'group' },
  { id: 'GS44', date: '2026-06-23', time: '11:00', homeTeam: 'yuedan1', awayTeam: 'aerjiliya', stadium: 'Giants Stadium', group: 'J', stage: 'group' },
  { id: 'GS45', date: '2026-06-24', time: '01:00', homeTeam: 'putaoya', awayTeam: 'wuzibiekesitan', stadium: 'SoFi Stadium', group: 'K', stage: 'group' },
  { id: 'GS46', date: '2026-06-24', time: '04:00', homeTeam: 'yinggelan', awayTeam: 'jiana', stadium: 'Rose Bowl', group: 'L', stage: 'group' },
  { id: 'GS47', date: '2026-06-24', time: '07:00', homeTeam: 'banama', awayTeam: 'keluodiya', stadium: 'Lucas Oil Stadium', group: 'L', stage: 'group' },
  { id: 'GS48', date: '2026-06-24', time: '10:00', homeTeam: 'gelunbiya', awayTeam: 'minzhugangguo', stadium: 'Allegiant Stadium', group: 'K', stage: 'group' },
  { id: 'GS49', date: '2026-06-25', time: '03:00', homeTeam: 'ruishi', awayTeam: 'jianada', stadium: 'BC Place', group: 'B', stage: 'group' },
  { id: 'GS50', date: '2026-06-25', time: '03:00', homeTeam: 'bohei1', awayTeam: 'kataer', stadium: 'BMO Field', group: 'B', stage: 'group' },
  { id: 'GS51', date: '2026-06-25', time: '06:00', homeTeam: 'sugelan', awayTeam: 'baxi', stadium: 'Giants Stadium', group: 'C', stage: 'group' },
  { id: 'GS52', date: '2026-06-25', time: '06:00', homeTeam: 'moluoge', awayTeam: 'haidi', stadium: 'MetLife Stadium', group: 'C', stage: 'group' },
  { id: 'GS53', date: '2026-06-25', time: '09:00', homeTeam: 'jieke1', awayTeam: 'moxige', stadium: 'Estadio Azteca', group: 'A', stage: 'group' },
  { id: 'GS54', date: '2026-06-25', time: '09:00', homeTeam: 'nanfei', awayTeam: 'hanguo', stadium: 'Mexico City Stadium', group: 'A', stage: 'group' },
  { id: 'GS55', date: '2026-06-26', time: '04:00', homeTeam: 'eguaduoer', awayTeam: 'deguo', stadium: "Levi's Stadium", group: 'E', stage: 'group' },
  { id: 'GS56', date: '2026-06-26', time: '04:00', homeTeam: 'ketediwa1', awayTeam: 'ruidian1', stadium: 'Lincoln Financial Field', group: 'E', stage: 'group' },
  { id: 'GS57', date: '2026-06-26', time: '07:00', homeTeam: 'helan', awayTeam: 'tunisi1', stadium: 'Mercedes-Benz Stadium', group: 'F', stage: 'group' },
  { id: 'GS58', date: '2026-06-26', time: '07:00', homeTeam: 'riben', awayTeam: 'kulasuo', stadium: 'FedExField', group: 'F', stage: 'group' },
  { id: 'GS59', date: '2026-06-26', time: '10:00', homeTeam: 'meiguo', awayTeam: 'tuerqi1', stadium: 'SoFi Stadium', group: 'D', stage: 'group' },
  { id: 'GS60', date: '2026-06-26', time: '10:00', homeTeam: 'aodaliya', awayTeam: 'balagui', stadium: 'Rose Bowl', group: 'D', stage: 'group' },
  { id: 'GS61', date: '2026-06-27', time: '03:00', homeTeam: 'faguo', awayTeam: 'nuowei', stadium: 'AT&T Stadium', group: 'I', stage: 'group' },
  { id: 'GS62', date: '2026-06-27', time: '03:00', homeTeam: 'yilake1', awayTeam: 'saineijiaer', stadium: 'NRG Stadium', group: 'I', stage: 'group' },
  { id: 'GS63', date: '2026-06-27', time: '08:00', homeTeam: 'xibanya', awayTeam: 'wulagui', stadium: 'Hard Rock Stadium', group: 'H', stage: 'group' },
  { id: 'GS64', date: '2026-06-27', time: '08:00', homeTeam: 'shatealabo', awayTeam: 'fodejiao1', stadium: 'Ford Field', group: 'H', stage: 'group' },
  { id: 'GS65', date: '2026-06-27', time: '11:00', homeTeam: 'bilishi', awayTeam: 'xinxilan1', stadium: 'Arrowhead Stadium', group: 'G', stage: 'group' },
  { id: 'GS66', date: '2026-06-27', time: '11:00', homeTeam: 'yilang', awayTeam: 'aiji1', stadium: 'Raymond James Stadium', group: 'G', stage: 'group' },
  { id: 'GS67', date: '2026-06-28', time: '05:00', homeTeam: 'banama', awayTeam: 'yinggelan', stadium: 'Rose Bowl', group: 'L', stage: 'group' },
  { id: 'GS68', date: '2026-06-28', time: '05:00', homeTeam: 'keluodiya', awayTeam: 'jiana', stadium: 'Lucas Oil Stadium', group: 'L', stage: 'group' },
  { id: 'GS69', date: '2026-06-28', time: '07:30', homeTeam: 'gelunbiya', awayTeam: 'putaoya', stadium: 'Allegiant Stadium', group: 'K', stage: 'group' },
  { id: 'GS70', date: '2026-06-28', time: '07:30', homeTeam: 'minzhugangguo', awayTeam: 'wuzibiekesitan', stadium: 'SoFi Stadium', group: 'K', stage: 'group' },
  { id: 'GS71', date: '2026-06-28', time: '11:00', homeTeam: 'agenting', awayTeam: 'yuedan1', stadium: 'MetLife Stadium', group: 'J', stage: 'group' },
  { id: 'GS72', date: '2026-06-28', time: '11:00', homeTeam: 'aodili', awayTeam: 'aerjiliya', stadium: 'Giants Stadium', group: 'J', stage: 'group' },
  { id: 'R32_01', date: '2026-06-29', time: '03:00', homeTeam: 'tbd1', awayTeam: 'tbd2', stadium: 'Estadio Azteca', group: '', stage: 'round_of_32' },
  { id: 'R32_02', date: '2026-06-29', time: '10:00', homeTeam: 'tbd3', awayTeam: 'tbd4', stadium: 'NRG Stadium', group: '', stage: 'round_of_32' },
  { id: 'R32_03', date: '2026-06-30', time: '03:00', homeTeam: 'tbd5', awayTeam: 'tbd6', stadium: 'BC Place', group: '', stage: 'round_of_32' },
  { id: 'R32_04', date: '2026-06-30', time: '10:00', homeTeam: 'tbd7', awayTeam: 'tbd8', stadium: 'SoFi Stadium', group: '', stage: 'round_of_32' },
  { id: 'R32_05', date: '2026-07-01', time: '03:00', homeTeam: 'tbd9', awayTeam: 'tbd10', stadium: 'MetLife Stadium', group: '', stage: 'round_of_32' },
  { id: 'R32_06', date: '2026-07-01', time: '10:00', homeTeam: 'tbd11', awayTeam: 'tbd12', stadium: 'Rose Bowl', group: '', stage: 'round_of_32' },
  { id: 'R32_07', date: '2026-07-02', time: '03:00', homeTeam: 'tbd13', awayTeam: 'tbd14', stadium: 'AT&T Stadium', group: '', stage: 'round_of_32' },
  { id: 'R32_08', date: '2026-07-02', time: '10:00', homeTeam: 'tbd15', awayTeam: 'tbd16', stadium: "Levi's Stadium", group: '', stage: 'round_of_32' },
  { id: 'R32_09', date: '2026-07-02', time: '06:00', homeTeam: 'tbd17', awayTeam: 'tbd18', stadium: 'Lincoln Financial Field', group: '', stage: 'round_of_32' },
  { id: 'R32_10', date: '2026-07-02', time: '12:00', homeTeam: 'tbd19', awayTeam: 'tbd20', stadium: 'Mercedes-Benz Stadium', group: '', stage: 'round_of_32' },
  { id: 'R32_11', date: '2026-07-03', time: '03:00', homeTeam: 'tbd21', awayTeam: 'tbd22', stadium: 'Hard Rock Stadium', group: '', stage: 'round_of_32' },
  { id: 'R32_12', date: '2026-07-03', time: '10:00', homeTeam: 'tbd23', awayTeam: 'tbd24', stadium: 'Arrowhead Stadium', group: '', stage: 'round_of_32' },
  { id: 'R32_13', date: '2026-07-03', time: '06:00', homeTeam: 'tbd25', awayTeam: 'tbd26', stadium: 'Allegiant Stadium', group: '', stage: 'round_of_32' },
  { id: 'R32_14', date: '2026-07-03', time: '12:00', homeTeam: 'tbd27', awayTeam: 'tbd28', stadium: 'Ford Field', group: '', stage: 'round_of_32' },
  { id: 'R32_15', date: '2026-07-04', time: '03:00', homeTeam: 'tbd29', awayTeam: 'tbd30', stadium: 'Commonwealth Stadium', group: '', stage: 'round_of_32' },
  { id: 'R32_16', date: '2026-07-04', time: '10:00', homeTeam: 'tbd31', awayTeam: 'tbd32', stadium: 'BMO Field', group: '', stage: 'round_of_32' },
  { id: 'R16_01', date: '2026-07-05', time: '03:00', homeTeam: 'tbd33', awayTeam: 'tbd34', stadium: 'Estadio Azteca', group: '', stage: 'round_of_16' },
  { id: 'R16_02', date: '2026-07-05', time: '10:00', homeTeam: 'tbd35', awayTeam: 'tbd36', stadium: 'NRG Stadium', group: '', stage: 'round_of_16' },
  { id: 'R16_03', date: '2026-07-06', time: '03:00', homeTeam: 'tbd37', awayTeam: 'tbd38', stadium: 'BC Place', group: '', stage: 'round_of_16' },
  { id: 'R16_04', date: '2026-07-06', time: '10:00', homeTeam: 'tbd39', awayTeam: 'tbd40', stadium: 'SoFi Stadium', group: '', stage: 'round_of_16' },
  { id: 'R16_05', date: '2026-07-07', time: '03:00', homeTeam: 'tbd41', awayTeam: 'tbd42', stadium: 'MetLife Stadium', group: '', stage: 'round_of_16' },
  { id: 'R16_06', date: '2026-07-07', time: '10:00', homeTeam: 'tbd43', awayTeam: 'tbd44', stadium: 'Rose Bowl', group: '', stage: 'round_of_16' },
  { id: 'R16_07', date: '2026-07-08', time: '03:00', homeTeam: 'tbd45', awayTeam: 'tbd46', stadium: 'AT&T Stadium', group: '', stage: 'round_of_16' },
  { id: 'R16_08', date: '2026-07-08', time: '10:00', homeTeam: 'tbd47', awayTeam: 'tbd48', stadium: "Levi's Stadium", group: '', stage: 'round_of_16' },
  { id: 'QF01', date: '2026-07-09', time: '03:00', homeTeam: 'tbd49', awayTeam: 'tbd50', stadium: 'Estadio Azteca', group: '', stage: 'quarter' },
  { id: 'QF02', date: '2026-07-09', time: '10:00', homeTeam: 'tbd51', awayTeam: 'tbd52', stadium: 'NRG Stadium', group: '', stage: 'quarter' },
  { id: 'QF03', date: '2026-07-10', time: '03:00', homeTeam: 'tbd53', awayTeam: 'tbd54', stadium: 'BC Place', group: '', stage: 'quarter' },
  { id: 'QF04', date: '2026-07-10', time: '10:00', homeTeam: 'tbd55', awayTeam: 'tbd56', stadium: 'SoFi Stadium', group: '', stage: 'quarter' },
  { id: 'SF01', date: '2026-07-13', time: '03:00', homeTeam: 'tbd57', awayTeam: 'tbd58', stadium: 'MetLife Stadium', group: '', stage: 'semi' },
  { id: 'SF02', date: '2026-07-14', time: '03:00', homeTeam: 'tbd59', awayTeam: 'tbd60', stadium: "Levi's Stadium", group: '', stage: 'semi' },
  { id: 'FIN', date: '2026-07-19', time: '06:00', homeTeam: 'tbd61', awayTeam: 'tbd62', stadium: 'AT&T Stadium', group: '', stage: 'final' },
];

export const worldcupTeamIdToName: Record<string, { en: string; cn: string; group: string; flag: string; elo: number }> = {
  'moxige': { en: 'Mexico', cn: '墨西哥', group: 'A', flag: '🇲🇽', elo: 1900 },
  'nanfei': { en: 'South Africa', cn: '南非', group: 'A', flag: '🇿🇦', elo: 1680 },
  'hanguo': { en: 'Korea Republic', cn: '韩国', group: 'A', flag: '🇰🇷', elo: 1880 },
  'jieke1': { en: 'Czech Republic', cn: '捷克', group: 'A', flag: '🇨🇿', elo: 1780 },
  'jianada': { en: 'Canada', cn: '加拿大', group: 'B', flag: '🇨🇦', elo: 1760 },
  'bohei1': { en: 'Bosnia and Herzegovina', cn: '波黑', group: 'B', flag: '🇧🇦', elo: 1620 },
  'kataer': { en: 'Qatar', cn: '卡塔尔', group: 'B', flag: '🇶🇦', elo: 1640 },
  'ruishi': { en: 'Switzerland', cn: '瑞士', group: 'B', flag: '🇨🇭', elo: 1910 },
  'baxi': { en: 'Brazil', cn: '巴西', group: 'C', flag: '🇧🇷', elo: 2100 },
  'moluoge': { en: 'Morocco', cn: '摩洛哥', group: 'C', flag: '🇲🇦', elo: 1930 },
  'haidi': { en: 'Haiti', cn: '海地', group: 'C', flag: '🇭🇹', elo: 1500 },
  'sugelan': { en: 'Scotland', cn: '苏格兰', group: 'C', flag: '🏴', elo: 1820 },
  'meiguo': { en: 'United States', cn: '美国', group: 'D', flag: '🇺🇸', elo: 1890 },
  'balagui': { en: 'Paraguay', cn: '巴拉圭', group: 'D', flag: '🇵🇾', elo: 1750 },
  'aodaliya': { en: 'Australia', cn: '澳大利亚', group: 'D', flag: '🇦🇺', elo: 1770 },
  'tuerqi1': { en: 'Turkey', cn: '土耳其', group: 'D', flag: '🇹🇷', elo: 1810 },
  'deguo': { en: 'Germany', cn: '德国', group: 'E', flag: '🇩🇪', elo: 2010 },
  'kulasuo': { en: 'Curaçao', cn: '库拉索', group: 'E', flag: '🇨🇼', elo: 1550 },
  'ketediwa1': { en: "Côte d'Ivoire", cn: '科特迪瓦', group: 'E', flag: '🇨🇮', elo: 1720 },
  'eguaduoer': { en: 'Ecuador', cn: '厄瓜多尔', group: 'E', flag: '🇪🇨', elo: 1850 },
  'helan': { en: 'Netherlands', cn: '荷兰', group: 'F', flag: '🇳🇱', elo: 2020 },
  'riben': { en: 'Japan', cn: '日本', group: 'F', flag: '🇯🇵', elo: 1920 },
  'ruidian1': { en: 'Sweden', cn: '瑞典', group: 'F', flag: '🇸🇪', elo: 1860 },
  'tunisi1': { en: 'Tunisia', cn: '突尼斯', group: 'F', flag: '🇹🇳', elo: 1790 },
  'bilishi': { en: 'Belgium', cn: '比利时', group: 'G', flag: '🇧🇪', elo: 1990 },
  'aiji1': { en: 'Egypt', cn: '埃及', group: 'G', flag: '🇪🇬', elo: 1740 },
  'yilang': { en: 'Iran', cn: '伊朗', group: 'G', flag: '🇮🇷', elo: 1840 },
  'xinxilan1': { en: 'New Zealand', cn: '新西兰', group: 'G', flag: '🇳🇿', elo: 1600 },
  'xibanya': { en: 'Spain', cn: '西班牙', group: 'H', flag: '🇪🇸', elo: 2030 },
  'fodejiao1': { en: 'Cape Verde', cn: '佛得角', group: 'H', flag: '🇨🇻', elo: 1670 },
  'shatealabo': { en: 'Saudi Arabia', cn: '沙特阿拉伯', group: 'H', flag: '🇸🇦', elo: 1710 },
  'wulagui': { en: 'Uruguay', cn: '乌拉圭', group: 'H', flag: '🇺🇾', elo: 1970 },
  'faguo': { en: 'France', cn: '法国', group: 'I', flag: '🇫🇷', elo: 2080 },
  'saineijiaer': { en: 'Senegal', cn: '塞内加尔', group: 'I', flag: '🇸🇳', elo: 1870 },
  'yilake1': { en: 'Iraq', cn: '伊拉克', group: 'I', flag: '🇮🇶', elo: 1650 },
  'nuowei': { en: 'Norway', cn: '挪威', group: 'I', flag: '🇳🇴', elo: 1830 },
  'agenting': { en: 'Argentina', cn: '阿根廷', group: 'J', flag: '🇦🇷', elo: 2070 },
  'aerjiliya': { en: 'Algeria', cn: '阿尔及利亚', group: 'J', flag: '🇩🇿', elo: 1730 },
  'aodili': { en: 'Austria', cn: '奥地利', group: 'J', flag: '🇦🇹', elo: 1800 },
  'yuedan1': { en: 'Jordan', cn: '约旦', group: 'J', flag: '🇯🇴', elo: 1610 },
  'putaoya': { en: 'Portugal', cn: '葡萄牙', group: 'K', flag: '🇵🇹', elo: 2000 },
  'minzhugangguo': { en: 'DR Congo', cn: '民主刚果', group: 'K', flag: '🇨🇩', elo: 1630 },
  'wuzibiekesitan': { en: 'Uzbekistan', cn: '乌兹别克斯坦', group: 'K', flag: '🇺🇿', elo: 1660 },
  'gelunbiya': { en: 'Colombia', cn: '哥伦比亚', group: 'K', flag: '🇨🇴', elo: 1950 },
  'yinggelan': { en: 'England', cn: '英格兰', group: 'L', flag: '🏴', elo: 2040 },
  'keluodiya': { en: 'Croatia', cn: '克罗地亚', group: 'L', flag: '🇭🇷', elo: 1980 },
  'jiana': { en: 'Ghana', cn: '加纳', group: 'L', flag: '🇬🇭', elo: 1700 },
  'banama': { en: 'Panama', cn: '巴拿马', group: 'L', flag: '🇵🇦', elo: 1690 },
};

export const worldcupStadiumCityMap: Record<string, { city: string; country: string; cityCn: string; countryCn: string }> = {
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
  'Lucas Oil Stadium': { city: 'Indianapolis', country: 'USA', cityCn: '印第安纳波利斯', countryCn: '美国' },
};

export interface KnockoutSlot {
  type: 'winner' | 'runner' | 'third' | 'winner_of';
  group?: string;       // 用于 'winner'/'runner'/'third' 类型
  fromMatch?: string;   // 用于 'winner_of' 类型，引用 R32/R16/QF/SF 场次 ID
}

export interface KnockoutMatch {
  id: string;
  home: KnockoutSlot;
  away: KnockoutSlot;
}

/**
 * 2026 世界杯官方淘汰赛对阵表
 * 来源：FIFA Final Draw (Washington DC, 5 Dec 2025)
 * 参考：Pallab9999/fifa-worldcup-2026-prediction config.py
 */
export const WORLD_CUP_KNOCKOUT_BRACKET: {
  r32: Record<string, KnockoutMatch>;
  r16: Record<string, KnockoutMatch>;
  qf: Record<string, KnockoutMatch>;
  sf: Record<string, KnockoutMatch>;
  final: KnockoutMatch;
} = {
  r32: {
    'R32_01': { id: 'R32_01', home: { type: 'runner', group: 'A' }, away: { type: 'runner', group: 'B' } },
    'R32_02': { id: 'R32_02', home: { type: 'winner', group: 'E' }, away: { type: 'third' } },
    'R32_03': { id: 'R32_03', home: { type: 'winner', group: 'F' }, away: { type: 'runner', group: 'C' } },
    'R32_04': { id: 'R32_04', home: { type: 'winner', group: 'C' }, away: { type: 'runner', group: 'F' } },
    'R32_05': { id: 'R32_05', home: { type: 'winner', group: 'I' }, away: { type: 'third' } },
    'R32_06': { id: 'R32_06', home: { type: 'runner', group: 'E' }, away: { type: 'runner', group: 'I' } },
    'R32_07': { id: 'R32_07', home: { type: 'winner', group: 'A' }, away: { type: 'third' } },
    'R32_08': { id: 'R32_08', home: { type: 'winner', group: 'L' }, away: { type: 'third' } },
    'R32_09': { id: 'R32_09', home: { type: 'winner', group: 'D' }, away: { type: 'third' } },
    'R32_10': { id: 'R32_10', home: { type: 'winner', group: 'G' }, away: { type: 'third' } },
    'R32_11': { id: 'R32_11', home: { type: 'runner', group: 'K' }, away: { type: 'runner', group: 'L' } },
    'R32_12': { id: 'R32_12', home: { type: 'winner', group: 'H' }, away: { type: 'runner', group: 'J' } },
    'R32_13': { id: 'R32_13', home: { type: 'winner', group: 'B' }, away: { type: 'third' } },
    'R32_14': { id: 'R32_14', home: { type: 'winner', group: 'J' }, away: { type: 'runner', group: 'H' } },
    'R32_15': { id: 'R32_15', home: { type: 'winner', group: 'K' }, away: { type: 'third' } },
    'R32_16': { id: 'R32_16', home: { type: 'runner', group: 'D' }, away: { type: 'runner', group: 'G' } },
  },
  r16: {
    'R16_01': { id: 'R16_01', home: { type: 'winner_of', fromMatch: 'R32_02' }, away: { type: 'winner_of', fromMatch: 'R32_05' } },
    'R16_02': { id: 'R16_02', home: { type: 'winner_of', fromMatch: 'R32_01' }, away: { type: 'winner_of', fromMatch: 'R32_03' } },
    'R16_03': { id: 'R16_03', home: { type: 'winner_of', fromMatch: 'R32_04' }, away: { type: 'winner_of', fromMatch: 'R32_06' } },
    'R16_04': { id: 'R16_04', home: { type: 'winner_of', fromMatch: 'R32_07' }, away: { type: 'winner_of', fromMatch: 'R32_08' } },
    'R16_05': { id: 'R16_05', home: { type: 'winner_of', fromMatch: 'R32_11' }, away: { type: 'winner_of', fromMatch: 'R32_12' } },
    'R16_06': { id: 'R16_06', home: { type: 'winner_of', fromMatch: 'R32_09' }, away: { type: 'winner_of', fromMatch: 'R32_10' } },
    'R16_07': { id: 'R16_07', home: { type: 'winner_of', fromMatch: 'R32_14' }, away: { type: 'winner_of', fromMatch: 'R32_16' } },
    'R16_08': { id: 'R16_08', home: { type: 'winner_of', fromMatch: 'R32_13' }, away: { type: 'winner_of', fromMatch: 'R32_15' } },
  },
  qf: {
    'QF01': { id: 'QF01', home: { type: 'winner_of', fromMatch: 'R16_01' }, away: { type: 'winner_of', fromMatch: 'R16_02' } },
    'QF02': { id: 'QF02', home: { type: 'winner_of', fromMatch: 'R16_05' }, away: { type: 'winner_of', fromMatch: 'R16_06' } },
    'QF03': { id: 'QF03', home: { type: 'winner_of', fromMatch: 'R16_03' }, away: { type: 'winner_of', fromMatch: 'R16_04' } },
    'QF04': { id: 'QF04', home: { type: 'winner_of', fromMatch: 'R16_07' }, away: { type: 'winner_of', fromMatch: 'R16_08' } },
  },
  sf: {
    'SF01': { id: 'SF01', home: { type: 'winner_of', fromMatch: 'QF01' }, away: { type: 'winner_of', fromMatch: 'QF02' } },
    'SF02': { id: 'SF02', home: { type: 'winner_of', fromMatch: 'QF03' }, away: { type: 'winner_of', fromMatch: 'QF04' } },
  },
  final: { id: 'FIN', home: { type: 'winner_of', fromMatch: 'SF01' }, away: { type: 'winner_of', fromMatch: 'SF02' } },
};

/**
 * R32 中面对第三名的小组第一分配表
 * key = R32 场次 ID, value = 该场次中小组第一所在的小组
 * 用于确定哪些小组的第一名会面对最佳第三名
 */
export const THIRD_PLACE_ALLOCATION: Record<string, string> = {
  'R32_02': 'E',
  'R32_05': 'I',
  'R32_07': 'A',
  'R32_08': 'L',
  'R32_09': 'D',
  'R32_10': 'G',
  'R32_13': 'B',
  'R32_15': 'K',
};
