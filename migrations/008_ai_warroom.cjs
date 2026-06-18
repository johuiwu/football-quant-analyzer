exports.up = async function (knex) {
  // ai_warroom_tasks — 预测任务记录
  const hasTasks = await knex.schema.hasTable("ai_warroom_tasks");
  if (!hasTasks) {
    await knex.schema.createTable("ai_warroom_tasks", (t) => {
      t.increments("id").primary();
      t.text("task_id").notNullable().unique();
      t.text("match_id");
      t.text("home_team").notNullable();
      t.text("away_team").notNullable();
      t.text("status").defaultTo("pending");
      t.text("result");
      t.text("tactical_data");
      t.timestamp("created_at").defaultTo(knex.fn.now());
    });
    await knex.schema.raw("CREATE INDEX IF NOT EXISTS idx_warroom_tasks_task_id ON ai_warroom_tasks(task_id)");
    await knex.schema.raw("CREATE INDEX IF NOT EXISTS idx_warroom_tasks_status ON ai_warroom_tasks(status)");
    console.log("[migration] ai_warroom_tasks 表已创建");
  }

  // ai_warroom_agent_logs — Agent 执行日志
  const hasAgentLogs = await knex.schema.hasTable("ai_warroom_agent_logs");
  if (!hasAgentLogs) {
    await knex.schema.createTable("ai_warroom_agent_logs", (t) => {
      t.increments("id").primary();
      t.text("agent_id").notNullable();
      t.text("task_id").notNullable();
      t.text("status").notNullable();
      t.text("result");
      t.text("error");
      t.integer("duration");
      t.timestamp("created_at").defaultTo(knex.fn.now());
    });
    await knex.schema.raw("CREATE INDEX IF NOT EXISTS idx_warroom_agent_logs_task_id ON ai_warroom_agent_logs(task_id)");
    console.log("[migration] ai_warroom_agent_logs 表已创建");
  }

  // ai_warroom_predictions — 预测结果
  const hasPredictions = await knex.schema.hasTable("ai_warroom_predictions");
  if (!hasPredictions) {
    await knex.schema.createTable("ai_warroom_predictions", (t) => {
      t.increments("id").primary();
      t.text("task_id").notNullable();
      t.text("match_id");
      t.real("home_win_prob");
      t.real("draw_prob");
      t.real("away_win_prob");
      t.text("top_scores");
      t.real("confidence_low");
      t.real("confidence_high");
      t.text("agent_consensus");
      t.timestamp("created_at").defaultTo(knex.fn.now());
    });
    await knex.schema.raw("CREATE INDEX IF NOT EXISTS idx_warroom_predictions_task_id ON ai_warroom_predictions(task_id)");
    console.log("[migration] ai_warroom_predictions 表已创建");
  }
};

exports.down = async function (knex) {
  await knex.schema.dropTableIfExists("ai_warroom_predictions");
  await knex.schema.dropTableIfExists("ai_warroom_agent_logs");
  await knex.schema.dropTableIfExists("ai_warroom_tasks");
};
