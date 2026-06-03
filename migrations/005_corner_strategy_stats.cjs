exports.up = async function(knex) {
  const hasTable = await knex.schema.hasTable("corner_simulation_records");
  if (!hasTable) {
    await knex.schema.createTable("corner_simulation_records", (t) => {
      t.increments("id").primary();
      t.text("strategy_id");
      t.text("match_id");
      t.text("match_name");
      t.integer("elapsed_minutes");
      t.float("trigger_odds");
      t.float("trigger_handicap");
      t.text("bet_direction");
      t.text("result").defaultTo("pending");
      t.float("profit_loss");
      t.timestamp("created_at").defaultTo(knex.fn.now());
    });
    await knex.schema.raw("CREATE INDEX IF NOT EXISTS idx_sim_strategy ON corner_simulation_records(strategy_id)");
    await knex.schema.raw("CREATE INDEX IF NOT EXISTS idx_sim_match ON corner_simulation_records(match_id)");
    await knex.schema.raw("CREATE INDEX IF NOT EXISTS idx_sim_time ON corner_simulation_records(created_at)");
    console.log("[migration] corner_simulation_records 表已创建");
  }
};

exports.down = async function(knex) {
  await knex.schema.dropTableIfExists("corner_simulation_records");
};
