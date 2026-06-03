import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import sqlite3 from 'sqlite3';
import { normalizeTeamName, getChineseName } from '../config/teamNameMapping.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = path.join(__dirname, '../database/worldcup.db');
const SCHEMA_PATH = path.join(__dirname, '../database/schema.sql');
const PLAYERS_CSV_PATH = path.join(__dirname, '../output/2022_wc_national_team_players.csv');
const MATCHES_CSV_PATH = path.join(__dirname, '../all_mens_world_cup_matches.csv');

function parseCSV(csvText) {
  const lines = csvText.split('\n').filter(line => line.trim());
  const headers = lines[0].split(',').map(h => h.trim());
  const rows = [];
  
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    const row = {};
    let currentField = '';
    let inQuotes = false;
    
    for (let j = 0; j < line.length; j++) {
      const char = line[j];
      
      if (char === '"' && line[j + 1] === '"') {
        currentField += '"';
        j++;
      } else if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        row[headers[Object.keys(row).length]] = currentField.trim();
        currentField = '';
      } else {
        currentField += char;
      }
    }
    row[headers[Object.keys(row).length]] = currentField.trim();
    rows.push(row);
  }
  
  return rows;
}

function parsePlayerListJson(jsonString) {
  try {
    let result = jsonString
      .replace(/\xa0/g, ' ')
      .replace(/""([^""]+)""|""([^""]+)"/g, '"$1$2"')
      .replace(/''/g, "'")
      .replace(/: nan\b/g, ': null')
      .replace(/: None\b/g, ': null');
    
    let inString = false;
    let inEscape = false;
    let output = [];
    
    for (let i = 0; i < result.length; i++) {
      const char = result[i];
      
      if (inEscape) {
        output.push(char);
        inEscape = false;
        continue;
      }
      
      if (char === '\\') {
        inEscape = true;
        output.push(char);
        continue;
      }
      
      if (char === "'" && !inString) {
        inString = true;
        output.push('"');
        continue;
      }
      
      if (char === "'" && inString) {
        const nextChar = result[i + 1];
        if (nextChar === "'") {
          output.push("'");
          i++;
          continue;
        }
        inString = false;
        output.push('"');
        continue;
      }
      
      if (char === '"' && inString) {
        output.push('\\"');
        continue;
      }
      
      output.push(char);
    }
    
    const jsonStr = output.join('');
    return JSON.parse(jsonStr);
  } catch (e) {
    console.error('Failed to parse player_list JSON:', e.message);
    console.error('Problematic JSON:', jsonString.substring(0, 200));
    return [];
  }
}

function cleanValue(value) {
  if (value === 'nan' || value === 'NaN' || value === 'null' || value === 'None' || value === '') {
    return null;
  }
  return value;
}

function cleanNumber(value) {
  const cleaned = cleanValue(value);
  if (cleaned === null) return null;
  const num = parseFloat(cleaned);
  return isNaN(num) ? null : num;
}

async function main() {
  console.log('Starting data import...');
  
  const db = new sqlite3.Database(DB_PATH);
  
  const stats = {
    teams: { inserted: 0, errors: 0 },
    matches: { inserted: 0, errors: 0 },
    players: { inserted: 0, errors: 0 },
    playerPositions: { inserted: 0, errors: 0 },
    playerCards: { inserted: 0, errors: 0 }
  };
  
  const teamIdMap = new Map();
  
  try {
    const schema = fs.readFileSync(SCHEMA_PATH, 'utf8');
    await new Promise((resolve, reject) => {
      db.exec(schema, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
    console.log('Schema created successfully');
    
    await new Promise((resolve, reject) => {
      db.run('INSERT INTO data_versions (version, description) VALUES (?, ?)', 
        ['v1.0.0', 'Initial data import'], (err) => {
          if (err) reject(err);
          else resolve();
        });
    });
    console.log('Data version v1.0.0 created');
    
    console.log('\n--- Importing teams ---');
    
    const matchesData = fs.readFileSync(MATCHES_CSV_PATH, 'utf8');
    const matchesRows = parseCSV(matchesData);
    
    const playersData = fs.readFileSync(PLAYERS_CSV_PATH, 'utf8');
    const playersRows = parseCSV(playersData);
    
    const allTeamNames = new Set();
    
    matchesRows.forEach(row => {
      const homeTeam = normalizeTeamName(row.home_team);
      const awayTeam = normalizeTeamName(row.away_team);
      if (homeTeam) allTeamNames.add(homeTeam);
      if (awayTeam) allTeamNames.add(awayTeam);
    });
    
    playersRows.forEach(row => {
      const country = normalizeTeamName(row.national_team);
      if (country) allTeamNames.add(country);
    });
    
    for (const teamName of allTeamNames) {
      try {
        const chineseName = getChineseName(teamName);
        await new Promise((resolve, reject) => {
          db.run(
            'INSERT OR IGNORE INTO teams (name, chinese_name) VALUES (?, ?)',
            [teamName, chineseName],
            function(err) {
              if (err) {
                stats.teams.errors++;
                console.error(`Error inserting team ${teamName}:`, err.message);
                resolve();
              } else {
                if (this.changes > 0) {
                  stats.teams.inserted++;
                  db.get('SELECT id FROM teams WHERE name = ?', [teamName], (err, row) => {
                    if (!err && row) {
                      teamIdMap.set(teamName, row.id);
                    }
                    resolve();
                  });
                } else {
                  db.get('SELECT id FROM teams WHERE name = ?', [teamName], (err, row) => {
                    if (!err && row) {
                      teamIdMap.set(teamName, row.id);
                    }
                    resolve();
                  });
                }
              }
            }
          );
        });
      } catch (e) {
        stats.teams.errors++;
        console.error(`Error processing team ${teamName}:`, e.message);
      }
    }
    
    console.log(`Teams: ${stats.teams.inserted} inserted, ${stats.teams.errors} errors`);
    
    console.log('\n--- Importing matches ---');
    
    for (const row of matchesRows) {
      try {
        const homeTeam = normalizeTeamName(row.home_team);
        const awayTeam = normalizeTeamName(row.away_team);
        const homeTeamId = teamIdMap.get(homeTeam);
        const awayTeamId = teamIdMap.get(awayTeam);
        
        if (!homeTeamId || !awayTeamId) {
          stats.matches.errors++;
          console.warn(`Skipping match ${row.match_id}: team not found (${homeTeam} vs ${awayTeam})`);
          continue;
        }
        
        await new Promise((resolve, reject) => {
          db.run(
            `INSERT OR IGNORE INTO matches (
              match_id, match_date, kick_off, home_team_id, away_team_id, 
              home_score, away_score, stage, world_cup_year,
              competition_stage_id, stadium_id, stadium, stadium_country,
              referee_id, referee, referee_country
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              cleanNumber(row.match_id),
              row.match_date,
              cleanValue(row.kick_off),
              homeTeamId,
              awayTeamId,
              cleanNumber(row.home_score),
              cleanNumber(row.away_score),
              cleanValue(row.competition_stage),
              cleanNumber(row.world_cup_year),
              cleanNumber(row.competition_stage_id),
              cleanNumber(row.stadium_id),
              cleanValue(row.stadium),
              cleanValue(row.stadium_country_name),
              cleanNumber(row.referee_id),
              cleanValue(row.referee),
              cleanValue(row.referee_country_name)
            ],
            function(err) {
              if (err) {
                stats.matches.errors++;
                console.error(`Error inserting match ${row.match_id}:`, err.message);
              } else if (this.changes > 0) {
                stats.matches.inserted++;
              }
              resolve();
            }
          );
        });
      } catch (e) {
        stats.matches.errors++;
        console.error(`Error processing match ${row.match_id}:`, e.message);
      }
    }
    
    console.log(`Matches: ${stats.matches.inserted} inserted, ${stats.matches.errors} errors`);
    
    console.log('\n--- Importing players ---');
    
    for (const row of playersRows) {
      try {
        const country = normalizeTeamName(row.national_team);
        const teamId = teamIdMap.get(country);
        
        if (!teamId) {
          stats.players.errors++;
          console.warn(`Skipping players for country ${country}: team not found`);
          continue;
        }
        
        const playerList = parsePlayerListJson(row.player_list);
        
        for (const player of playerList) {
          try {
            await new Promise((resolve, reject) => {
              db.run(
                'INSERT OR IGNORE INTO players (player_id, player_name, player_nickname, jersey_number, team_id) VALUES (?, ?, ?, ?, ?)',
                [
                  cleanNumber(player.player_id),
                  cleanValue(player.player_name),
                  cleanValue(player.player_nickname),
                  cleanNumber(player.jersey_number),
                  teamId
                ],
                function(err) {
                  if (err) {
                    stats.players.errors++;
                  } else if (this.changes > 0) {
                    stats.players.inserted++;
                  }
                  resolve();
                }
              );
            });
          } catch (e) {
            stats.players.errors++;
          }
        }
      } catch (e) {
        stats.players.errors++;
        console.error(`Error processing players for ${country}:`, e.message);
      }
    }
    
    console.log(`Players: ${stats.players.inserted} inserted, ${stats.players.errors} errors`);
    
    console.log('\n--- Importing player positions ---');
    
    for (const row of playersRows) {
      try {
        const country = normalizeTeamName(row.national_team);
        const teamId = teamIdMap.get(country);
        
        if (!teamId) continue;
        
        const playerList = parsePlayerListJson(row.player_list);
        
        for (const playerData of playerList) {
          try {
            const dbPlayer = await new Promise((resolve) => {
              db.get(
                'SELECT id FROM players WHERE player_id = ? AND team_id = ?',
                [playerData.player_id, teamId],
                (err, row) => resolve(row)
              );
            });
            
            if (!dbPlayer) continue;
            
            for (const position of playerData.positions || []) {
              try {
                await new Promise((resolve) => {
                  db.run(
                    `INSERT INTO player_positions (
                      player_id, position_id, position, from_time, to_time,
                      from_period, to_period, start_reason, end_reason
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                    [
                      dbPlayer.id,
                      cleanNumber(position.position_id),
                      cleanValue(position.position),
                      cleanValue(position.from),
                      cleanValue(position.to),
                      cleanNumber(position.from_period),
                      cleanNumber(position.to_period),
                      cleanValue(position.start_reason),
                      cleanValue(position.end_reason)
                    ],
                    function(err) {
                      if (err) {
                        stats.playerPositions.errors++;
                      } else if (this.changes > 0) {
                        stats.playerPositions.inserted++;
                      }
                      resolve();
                    }
                  );
                });
              } catch (e) {
                stats.playerPositions.errors++;
              }
            }
          } catch (e) {
            stats.playerPositions.errors++;
          }
        }
      } catch (e) {
        stats.playerPositions.errors++;
      }
    }
    
    console.log(`Player positions: ${stats.playerPositions.inserted} inserted, ${stats.playerPositions.errors} errors`);
    
    console.log('\n--- Importing player cards ---');
    
    for (const row of playersRows) {
      try {
        const country = normalizeTeamName(row.national_team);
        const teamId = teamIdMap.get(country);
        
        if (!teamId) continue;
        
        const playerList = parsePlayerListJson(row.player_list);
        
        for (const playerData of playerList) {
          try {
            const dbPlayer = await new Promise((resolve) => {
              db.get(
                'SELECT id FROM players WHERE player_id = ? AND team_id = ?',
                [playerData.player_id, teamId],
                (err, row) => resolve(row)
              );
            });
            
            if (!dbPlayer) continue;
            
            for (const card of playerData.cards || []) {
              try {
                await new Promise((resolve) => {
                  db.run(
                    'INSERT INTO player_cards (player_id, time, card_type, reason, period) VALUES (?, ?, ?, ?, ?)',
                    [
                      dbPlayer.id,
                      cleanValue(card.time),
                      cleanValue(card.card_type),
                      cleanValue(card.reason),
                      cleanNumber(card.period)
                    ],
                    function(err) {
                      if (err) {
                        stats.playerCards.errors++;
                      } else if (this.changes > 0) {
                        stats.playerCards.inserted++;
                      }
                      resolve();
                    }
                  );
                });
              } catch (e) {
                stats.playerCards.errors++;
              }
            }
          } catch (e) {
            stats.playerCards.errors++;
          }
        }
      } catch (e) {
        stats.playerCards.errors++;
      }
    }
    
    console.log(`Player cards: ${stats.playerCards.inserted} inserted, ${stats.playerCards.errors} errors`);
    
  } catch (err) {
    console.error('Fatal error during import:', err.message);
    process.exit(1);
  } finally {
    db.close((err) => {
      if (err) {
        console.error('Error closing database:', err.message);
      }
    });
  }
  
  console.log('\n=== Import Summary ===');
  console.log(`Teams:       ${stats.teams.inserted} inserted, ${stats.teams.errors} errors`);
  console.log(`Matches:     ${stats.matches.inserted} inserted, ${stats.matches.errors} errors`);
  console.log(`Players:     ${stats.players.inserted} inserted, ${stats.players.errors} errors`);
  console.log(`Positions:   ${stats.playerPositions.inserted} inserted, ${stats.playerPositions.errors} errors`);
  console.log(`Cards:       ${stats.playerCards.inserted} inserted, ${stats.playerCards.errors} errors`);
  console.log('======================');
  console.log('\nData import completed!');
}

main();
