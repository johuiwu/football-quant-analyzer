exports.up = async function(knex) {
  const hasTeams = await knex.schema.hasTable("teams");
  if (!hasTeams) {
    await knex.schema.createTable("teams", (t) => {
      t.text("team_id").notNullable().unique();
      t.text("team_name").notNullable();
      t.text("team_name_cn").notNullable();
      t.text("league").notNullable();
      t.text("league_cn").notNullable();
      t.integer("rank").defaultTo(0);
      t.text("home_stats");
      t.text("away_stats");
      t.integer("home_played").defaultTo(0);
      t.integer("home_wins").defaultTo(0);
      t.integer("home_draws").defaultTo(0);
      t.integer("home_losses").defaultTo(0);
      t.integer("home_goals_for").defaultTo(0);
      t.integer("home_goals_against").defaultTo(0);
      t.float("home_xg_for").defaultTo(0);
      t.float("home_xg_against").defaultTo(0);
      t.integer("away_played").defaultTo(0);
      t.integer("away_wins").defaultTo(0);
      t.integer("away_draws").defaultTo(0);
      t.integer("away_losses").defaultTo(0);
      t.integer("away_goals_for").defaultTo(0);
      t.integer("away_goals_against").defaultTo(0);
      t.float("away_xg_for").defaultTo(0);
      t.float("away_xg_against").defaultTo(0);
      t.text("form");
      t.integer("clean_sheets").defaultTo(0);
      t.float("shots_per_game").defaultTo(0);
      t.integer("shot_accuracy").defaultTo(0);
      t.float("home_xg").defaultTo(0);
      t.float("away_xg").defaultTo(0);
      t.text("form_last5");
      t.datetime("last_updated").defaultTo(knex.fn.now());
      t.text("data_source").defaultTo("crawler");
    });
    await knex.schema.raw("CREATE INDEX IF NOT EXISTS idx_teams_league ON teams(league)");
  }

  const hasTeamStats = await knex.schema.hasTable("team_stats");
  if (!hasTeamStats) {
    await knex.schema.createTable("team_stats", (t) => {
      t.text("team_name").notNullable();
      t.text("team_name_cn").notNullable();
      t.text("team_id").notNullable().unique();
      t.text("league").notNullable();
      t.text("league_cn").notNullable();
      t.integer("goals").defaultTo(0);
      t.integer("conceded").defaultTo(0);
      t.integer("goalDifference").defaultTo(0);
      t.integer("shots").defaultTo(0);
      t.integer("shotsOnTarget").defaultTo(0);
      t.integer("assists").defaultTo(0);
      t.integer("passes").defaultTo(0);
      t.integer("corners").defaultTo(0);
      t.integer("fouls").defaultTo(0);
      t.integer("redCards").defaultTo(0);
      t.integer("yellowCards").defaultTo(0);
      t.integer("penalties").defaultTo(0);
      t.integer("cleanSheets").defaultTo(0);
      t.float("avgGoals").defaultTo(0);
      t.float("avgConceded").defaultTo(0);
      t.float("avgGoalDiff").defaultTo(0);
      t.float("avgCorners").defaultTo(0);
      t.float("possession").defaultTo(0);
      t.integer("tackles").defaultTo(0);
      t.integer("interceptions").defaultTo(0);
      t.integer("clearances").defaultTo(0);
      t.integer("offsides").defaultTo(0);
      t.integer("foulsSuffered").defaultTo(0);
      t.integer("keyPasses").defaultTo(0);
      t.integer("crosses").defaultTo(0);
      t.integer("crossesSuccessful").defaultTo(0);
      t.integer("successfulCrosses").defaultTo(0);
      t.integer("longBalls").defaultTo(0);
      t.integer("successfulLongBalls").defaultTo(0);
      t.integer("freeKicks").defaultTo(0);
      t.integer("freeKickGoals").defaultTo(0);
      t.integer("dribbles").defaultTo(0);
      t.integer("successfulDribbles").defaultTo(0);
      t.integer("duelsWon").defaultTo(0);
      t.integer("fastBreaks").defaultTo(0);
      t.integer("fastBreakShots").defaultTo(0);
      t.integer("fastBreakGoals").defaultTo(0);
      t.integer("hitWoodwork").defaultTo(0);
      t.integer("possessionLost").defaultTo(0);
      t.integer("twoYellowRedCards").defaultTo(0);
      t.integer("effectiveBlocks").defaultTo(0);
      t.integer("passesSuccessful").defaultTo(0);
      t.integer("duelsTotal").defaultTo(0);
      t.datetime("last_updated").defaultTo(knex.fn.now());
      t.text("data_source").defaultTo("crawler");
    });
  }
};

exports.down = async function(knex) {
  await knex.schema.dropTableIfExists("team_stats");
  await knex.schema.dropTableIfExists("teams");
};
