exports.up = async function(knex) {
  const hasTable = await knex.schema.hasTable("betting_history");
  if (!hasTable) {
    await knex.schema.createTable("betting_history", (t) => {
      t.increments("id").primary();
      t.text("match_id").notNullable();
      t.text("league").notNullable().defaultTo("unknown");
      t.float("home_bet").notNullable().defaultTo(0);
      t.float("away_bet").notNullable().defaultTo(0);
      t.float("draw_bet").notNullable().defaultTo(0);
      t.timestamp("recorded_at").defaultTo(knex.fn.now());
    });
    await knex.schema.raw("CREATE INDEX IF NOT EXISTS idx_betting_match ON betting_history(match_id)");
    await knex.schema.raw("CREATE INDEX IF NOT EXISTS idx_betting_league ON betting_history(league)");
    await knex.schema.raw("CREATE INDEX IF NOT EXISTS idx_betting_time ON betting_history(recorded_at)");
    console.log("[migration] betting_history 表已创建");
  }
};

exports.down = async function(knex) {
  await knex.schema.dropTableIfExists("betting_history");
};
