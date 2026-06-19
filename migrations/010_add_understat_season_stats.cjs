exports.up = async function (knex) {
  const hasTable = await knex.schema.hasTable("teams");
  if (!hasTable) {
    console.log("[migration] teams 表不存在，跳过");
    return;
  }

  const columns = [
    "season_xg",
    "season_xga",
    "season_npxgd",
    "season_ppda",
    "season_ppda_allowed",
    "season_deep",
    "season_xpts",
  ];

  for (const col of columns) {
    const hasCol = await knex.schema.hasColumn("teams", col);
    if (!hasCol) {
      await knex.schema.raw(`ALTER TABLE teams ADD COLUMN ${col} REAL DEFAULT 0`);
    }
  }

  console.log("[migration] teams 表已添加 Understat 赛季高阶数据列 (7 个字段)");
};

exports.down = async function (knex) {
  const hasTable = await knex.schema.hasTable("teams");
  if (!hasTable) return;

  const columns = [
    "season_xg",
    "season_xga",
    "season_npxgd",
    "season_ppda",
    "season_ppda_allowed",
    "season_deep",
    "season_xpts",
  ];

  for (const col of columns) {
    const hasCol = await knex.schema.hasColumn("teams", col);
    if (hasCol) {
      await knex.schema.alterTable("teams", (t) => {
        t.dropColumn(col);
      });
    }
  }
};
