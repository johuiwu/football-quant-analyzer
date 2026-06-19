exports.up = async (knex) => {
  const hasCol = await knex.schema.hasColumn('corner_bets', 'retry_count');
  if (!hasCol) {
    await knex.schema.table('corner_bets', (table) => {
      table.integer('retry_count').defaultTo(0);
    });
  }
};

exports.down = async (knex) => {
  const hasCol = await knex.schema.hasColumn('corner_bets', 'retry_count');
  if (hasCol) {
    await knex.schema.table('corner_bets', (table) => {
      table.dropColumn('retry_count');
    });
  }
};
