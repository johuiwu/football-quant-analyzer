exports.up = async function(knex) {
  const hasTable = await knex.schema.hasTable("corner_bets");
  if (!hasTable) {
    await knex.schema.createTable("corner_bets", (t) => {
      t.increments("id").primary();
      t.text("match_id").notNullable();
      t.text("match_name");
      t.text("strategy_id");
      t.float("odds");
      t.integer("amount").defaultTo(0);
      t.text("status").defaultTo("pending");
      t.text("error_message");
      t.text("executed_at");
      t.timestamp("created_at").defaultTo(knex.fn.now());
    });
    await knex.schema.raw("CREATE INDEX IF NOT EXISTS idx_corner_bets_status ON corner_bets(status)");
    await knex.schema.raw("CREATE INDEX IF NOT EXISTS idx_corner_bets_match ON corner_bets(match_id)");
    console.log("[migration] corner_bets 表已创建");
  }
};

exports.down = async function(knex) {
  await knex.schema.dropTableIfExists("corner_bets");
};