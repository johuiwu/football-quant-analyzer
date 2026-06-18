exports.up = async function(knex) {
  const hasTable = await knex.schema.hasTable("corner_history");
  if (!hasTable) {
    console.log("[migration] corner_history 表不存在，跳过");
    return;
  }

  // 检查并添加 handicap 字段
  const hasHandicap = await knex.schema.hasColumn("corner_history", "handicap");
  if (!hasHandicap) {
    await knex.schema.alterTable("corner_history", (t) => {
      t.float("handicap");
    });
    console.log("[migration] corner_history 添加 handicap 字段");
  }

  // 检查并添加 error_message 字段
  const hasErrorMsg = await knex.schema.hasColumn("corner_history", "error_message");
  if (!hasErrorMsg) {
    await knex.schema.alterTable("corner_history", (t) => {
      t.text("error_message");
    });
    console.log("[migration] corner_history 添加 error_message 字段");
  }

  // 检查并添加 profit_loss 字段
  const hasProfitLoss = await knex.schema.hasColumn("corner_history", "profit_loss");
  if (!hasProfitLoss) {
    await knex.schema.alterTable("corner_history", (t) => {
      t.float("profit_loss");
    });
    console.log("[migration] corner_history 添加 profit_loss 字段");
  }

  console.log("[migration] corner_history 字段补充完成");
};

exports.down = async function(knex) {
  const hasTable = await knex.schema.hasTable("corner_history");
  if (!hasTable) return;

  const hasHandicap = await knex.schema.hasColumn("corner_history", "handicap");
  if (hasHandicap) {
    await knex.schema.alterTable("corner_history", (t) => {
      t.dropColumn("handicap");
    });
  }

  const hasErrorMsg = await knex.schema.hasColumn("corner_history", "error_message");
  if (hasErrorMsg) {
    await knex.schema.alterTable("corner_history", (t) => {
      t.dropColumn("error_message");
    });
  }

  const hasProfitLoss = await knex.schema.hasColumn("corner_history", "profit_loss");
  if (hasProfitLoss) {
    await knex.schema.alterTable("corner_history", (t) => {
      t.dropColumn("profit_loss");
    });
  }
};