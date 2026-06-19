exports.up = async (knex) => {
  const hasBetTarget = await knex.schema.hasColumn('corner_bets', 'bet_target');
  if (!hasBetTarget) {
    await knex.schema.table('corner_bets', (table) => {
      table.text('bet_target').nullable().defaultTo(null);
    });
  }
  const hasErrorReason = await knex.schema.hasColumn('corner_bets', 'error_reason');
  if (!hasErrorReason) {
    await knex.schema.table('corner_bets', (table) => {
      table.text('error_reason').nullable().defaultTo(null);
    });
  }
};

exports.down = async (knex) => {
  const hasBetTarget = await knex.schema.hasColumn('corner_bets', 'bet_target');
  if (hasBetTarget) {
    await knex.schema.table('corner_bets', (table) => {
      table.dropColumn('bet_target');
    });
  }
  const hasErrorReason = await knex.schema.hasColumn('corner_bets', 'error_reason');
  if (hasErrorReason) {
    await knex.schema.table('corner_bets', (table) => {
      table.dropColumn('error_reason');
    });
  }
};
