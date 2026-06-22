exports.up = async function (knex) {
  const hasTable = await knex.schema.hasTable("teams");
  if (!hasTable) {
    console.log("[migration] teams 表不存在，跳过");
    return;
  }

  // 添加 matches 列（Understat 赛季比赛场次）
  const hasMatches = await knex.schema.hasColumn("teams", "matches");
  if (!hasMatches) {
    await knex.schema.raw("ALTER TABLE teams ADD COLUMN matches INTEGER DEFAULT 0");
    console.log("[migration] teams 表已添加 matches 列");
  } else {
    console.log("[migration] teams 表 matches 列已存在，跳过");
  }
};

exports.down = async function (knex) {
  const hasTable = await knex.schema.hasTable("teams");
  if (!hasTable) return;

  const hasMatches = await knex.schema.hasColumn("teams", "matches");
  if (hasMatches) {
    await knex.schema.alterTable("teams", (t) => {
      t.dropColumn("matches");
    });
  }
};
