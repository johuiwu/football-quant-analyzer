// Conversion script: TypeScript data -> CommonJS data.cjs
const fs = require('fs');

// Read the TypeScript files
const realTeamsContent = fs.readFileSync('src/data/realTeamsData.ts', 'utf8');
const leagueTeamsContent = fs.readFileSync('src/data/leagueTeams.ts', 'utf8');

function findArrayEnd(content, startIdx) {
  let braceCount = 0;
  for (let i = startIdx; i < content.length; i++) {
    if (content[i] === '[') braceCount++;
    if (content[i] === ']') braceCount--;
    if (braceCount === 0 && content[i] === ']') {
      return i;
    }
  }
  return -1;
}

function findObjectEnd(content, startIdx) {
  let braceCount = 0;
  for (let i = startIdx; i < content.length; i++) {
    if (content[i] === '{') braceCount++;
    if (content[i] === '}') braceCount--;
    if (braceCount === 0 && content[i] === '}') {
      return i;
    }
  }
  return -1;
}

// Extract REAL_TEAMS array
const realTeamsMarker = "export const REAL_TEAMS: TeamStats[] = [";
const realTeamsStart = realTeamsContent.indexOf(realTeamsMarker);
if (realTeamsStart === -1) {
  console.error('Could not find REAL_TEAMS marker');
  process.exit(1);
}
const realTeamsArrayStart = realTeamsStart + realTeamsMarker.length - 1;
const realTeamsEnd = findArrayEnd(realTeamsContent, realTeamsArrayStart);
const realTeamsArrayStr = realTeamsContent.substring(realTeamsArrayStart, realTeamsEnd + 1);

// Extract LEAGUES array
const leaguesMarker = "export const LEAGUES = [";
const leaguesStart = realTeamsContent.indexOf(leaguesMarker);
const leaguesArrayStart = leaguesStart + leaguesMarker.length - 1;
const leaguesEnd = findArrayEnd(realTeamsContent, leaguesArrayStart);
const leaguesArrayStr = realTeamsContent.substring(leaguesArrayStart, leaguesEnd + 1);

// Extract LEAGUE_AVGS
const leagueAvgsStart = realTeamsContent.indexOf("export const LEAGUE_AVGS");
const leagueAvgsEqSign = realTeamsContent.indexOf('=', leagueAvgsStart);
const leagueAvgsObjStartReal = realTeamsContent.indexOf('{', leagueAvgsEqSign);
const leagueAvgsObjEnd = findObjectEnd(realTeamsContent, leagueAvgsObjStartReal);
const leagueAvgsStr = realTeamsContent.substring(leagueAvgsObjStartReal, leagueAvgsObjEnd + 1);

// Extract ALL_LEAGUE_TEAMS from leagueTeams.ts
// Search for "ALL_LEAGUE_TEAMS" then find the "= [" pattern (not the type annotation "LeagueTeam[]")
const allLTKw = "ALL_LEAGUE_TEAMS";
const allLTKwPos = leagueTeamsContent.indexOf(allLTKw);
// Find the '=' after the keyword
const allLTEqPos = leagueTeamsContent.indexOf('=', allLTKwPos);
// Find the '[' after the '='
const allLTArrayStart = leagueTeamsContent.indexOf('[', allLTEqPos + 1);  // +1 to skip the '='
const allLTEnd = findArrayEnd(leagueTeamsContent, allLTArrayStart);
const allLTArrayStr = leagueTeamsContent.substring(allLTArrayStart, allLTEnd + 1);

console.log('ALL_LEAGUE_TEAMS array first 200 chars:', allLTArrayStr.substring(0, 200));
console.log('ALL_LEAGUE_TEAMS array length:', allLTArrayStr.length);

// Strip comments from the arrays before eval (JS eval can't handle // comments in all contexts)
function stripComments(str) {
  return str.replace(/\/\/.*$/gm, '');
}

// Evaluate the arrays
let REAL_TEAMS, LEAGUES, ALL_LEAGUE_TEAMS, LEAGUE_AVGS;
try {
  REAL_TEAMS = eval(stripComments(realTeamsArrayStr));
  LEAGUES = eval(leaguesArrayStr);
  ALL_LEAGUE_TEAMS = eval(allLTArrayStr);
  LEAGUE_AVGS = eval(leagueAvgsStr);
} catch(e) {
  console.error('Eval error:', e.message);
  // Try to show context around the error
  console.error('Error in eval, trying alternative...');
  // Use Function constructor instead
  try {
    REAL_TEAMS = new Function('return ' + stripComments(realTeamsArrayStr))();
    LEAGUES = new Function('return ' + leaguesArrayStr)();
    ALL_LEAGUE_TEAMS = new Function('return ' + allLTArrayStr)();
    LEAGUE_AVGS = new Function('return ' + leagueAvgsStr)();
  } catch(e2) {
    console.error('Function error:', e2.message);
    process.exit(1);
  }
}

console.log('\n=== Counts ===');
console.log('REAL_TEAMS count:', REAL_TEAMS.length);
console.log('ALL_LEAGUE_TEAMS count:', ALL_LEAGUE_TEAMS.length);
console.log('LEAGUES count:', LEAGUES.length);
console.log('LEAGUE_AVGS keys:', Object.keys(LEAGUE_AVGS).length);

// Verify team IDs match
const realTeamIds = new Set(REAL_TEAMS.map(t => t.id));
const leagueTeamRealIds = ALL_LEAGUE_TEAMS.filter(t => t.realTeamId).map(t => t.realTeamId);
const missingIds = leagueTeamRealIds.filter(id => !realTeamIds.has(id));
if (missingIds.length > 0) {
  console.log('\nWARNING: realTeamIds in ALL_LEAGUE_TEAMS not found in REAL_TEAMS:', missingIds);
}

// Build LEAGUE_PRESETS from LEAGUES data
const LEAGUE_PRESETS = {};
const leagueMaxTeams = {
  EPL: 20, LaLiga: 20, SerieA: 20, Bundesliga: 18, Ligue1: 18,
  WorldCup: 48, CSL: 16, JLeague: 20, KLeague1: 12, KLeague2: 17,
  Eredivisie: 18, PrimeiraLiga: 18, SaudiPL: 16, Allsvenskan: 16,
  Eliteserien: 16, Veikkausliiga: 12, DanishSuperliga: 12, QatarSL: 12
};
for (const league of LEAGUES) {
  LEAGUE_PRESETS[league.id] = {
    name: league.name,
    nameCn: league.nameCn,
    maxTeams: leagueMaxTeams[league.id] || 20
  };
}

// Generate the output file
const output = `// CommonJS 数据模块，供 backend 使用
// 从前端 realTeamsData.ts + leagueTeams.ts 自动转换生成

const REAL_TEAMS = ${JSON.stringify(REAL_TEAMS, null, 2)};

const ALL_LEAGUE_TEAMS = ${JSON.stringify(ALL_LEAGUE_TEAMS, null, 2)};

const LEAGUE_PRESETS = ${JSON.stringify(LEAGUE_PRESETS, null, 2)};

const LEAGUE_AVGS = ${JSON.stringify(LEAGUE_AVGS, null, 2)};

const LEAGUES = Object.entries(LEAGUE_PRESETS).map(([id, preset]) => ({
  id,
  name: preset.name,
  nameCn: preset.nameCn,
  maxTeams: preset.maxTeams,
}));

const REAL_FIXTURES = [];

module.exports = {
  REAL_TEAMS,
  ALL_LEAGUE_TEAMS,
  LEAGUE_PRESETS,
  LEAGUE_AVGS,
  LEAGUES,
  REAL_FIXTURES,
};
`;

fs.writeFileSync('backend/data.cjs', output, 'utf8');
console.log('\nSuccessfully wrote backend/data.cjs');
console.log('File size:', (output.length / 1024).toFixed(1), 'KB');
