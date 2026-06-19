exports.up = async function (knex) {
  const hasTable = await knex.schema.hasTable("teams");
  if (!hasTable) {
    console.log("[migration] teams 表不存在，跳过");
    return;
  }

  // 检查并添加 home_xg 字段
  const hasHomeXg = await knex.schema.hasColumn("teams", "home_xg");
  if (!hasHomeXg) {
    await knex.schema.raw("ALTER TABLE teams ADD COLUMN home_xg REAL DEFAULT 0");
  }

  // 检查并添加 away_xg 字段
  const hasAwayXg = await knex.schema.hasColumn("teams", "away_xg");
  if (!hasAwayXg) {
    await knex.schema.raw("ALTER TABLE teams ADD COLUMN away_xg REAL DEFAULT 0");
  }

  console.log("[migration] teams 表已添加 home_xg/away_xg 列");
};

exports.down = async function (knex) {
  const hasTable = await knex.schema.hasTable("teams");
  if (!hasTable) return;

  const hasHomeXg = await knex.schema.hasColumn("teams", "home_xg");
  if (hasHomeXg) {
    await knex.schema.alterTable("teams", (t) => {
      t.dropColumn("home_xg");
    });
  }

  const hasAwayXg = await knex.schema.hasColumn("teams", "away_xg");
  if (hasAwayXg) {
    await knex.schema.alterTable("teams", (t) => {
      t.dropColumn("away_xg");
    });
  }
};
