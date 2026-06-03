exports.up = async function(knex) {
  const hasTable = await knex.schema.hasTable("corner_history");
  if (!hasTable) {
    await knex.schema.createTable("corner_history", (t) => {
      t.increments("id").primary();
      t.text("match_id").notNullable();
      t.text("match_name");
      t.text("strategy_id");
      t.text("triggered_at");
      t.text("bet_status").defaultTo("pending");
      t.float("odds");
      t.integer("amount").defaultTo(0);
      t.timestamp("created_at").defaultTo(knex.fn.now());
    });
    await knex.schema.raw("CREATE INDEX IF NOT EXISTS idx_corner_history_match ON corner_history(match_id)");
    await knex.schema.raw("CREATE INDEX IF NOT EXISTS idx_corner_history_time ON corner_history(created_at)");
    console.log("[migration] corner_history 表已创建");
  }
};

exports.down = async function(knex) {
  await knex.schema.dropTableIfExists("corner_history");
};
