# 足球竞彩量化分析系统 - 数据库设计与数据导入计划

## 项目概述

本任务旨在设计 SQLite 数据库表结构，并编写脚本将两个 CSV 文件导入数据库，同时完成基础数据清洗。

## 输入文件分析

### 1. 2022\_wc\_national\_team\_players.csv

* 包含2022年世界杯国家队球员数据

* 字段：`country`, `player_list`（JSON字符串）

* player\_list包含：player\_id, player\_name, player\_nickname, jersey\_number, country, cards, positions

### 2. all\_mens\_world\_cup\_matches.csv

* 包含历届世界杯比赛数据

* 关键字段：match\_id, match\_date, home\_team, away\_team, home\_score, away\_score, competition\_stage, world\_cup\_year

* 需要处理的队名变体：

  * `Korea Republic` / `South Korea` / `Korea (South)`

  * `Iran, Islamic Republic of` / `Iran`

## 实现计划

### 1. 创建目录结构

```
config/
  └── teamNameMapping.js    # 队名归一化映射配置
database/
  ├── schema.sql            # 数据库表结构SQL
  └── worldcup.db           # SQLite数据库文件（运行时生成）
scripts/
  ├── importData.js         # 数据导入脚本
  └── verifyData.js         # 数据验证脚本
```

### 2. 数据库表设计

#### teams 表

| 字段            | 类型        | 说明           |
| ------------- | --------- | ------------ |
| id            | INTEGER   | 主键，自增        |
| name          | TEXT      | 归一化后的队名      |
| country\_code | TEXT      | 国家代码（后期填充）   |
| fifa\_rank    | INTEGER   | FIFA排名（后期填充） |
| elo\_rating   | INTEGER   | Elo评分（后期填充）  |
| market\_value | REAL      | 市场价值（后期填充）   |
| created\_at   | TIMESTAMP | 创建时间         |

#### matches 表

| 字段               | 类型        | 说明       |
| ---------------- | --------- | -------- |
| id               | INTEGER   | 主键，自增    |
| match\_id        | INTEGER   | 原始比赛ID   |
| match\_date      | DATE      | 比赛日期     |
| home\_team\_id   | INTEGER   | 主队ID（外键） |
| away\_team\_id   | INTEGER   | 客队ID（外键） |
| home\_score      | INTEGER   | 主队比分     |
| away\_score      | INTEGER   | 客队比分     |
| stage            | TEXT      | 比赛阶段     |
| world\_cup\_year | INTEGER   | 世界杯年份    |
| created\_at      | TIMESTAMP | 创建时间     |

#### players 表

| 字段               | 类型        | 说明          |
| ---------------- | --------- | ----------- |
| id               | INTEGER   | 主键，自增       |
| player\_id       | INTEGER   | 原始球员ID      |
| player\_name     | TEXT      | 球员全名        |
| player\_nickname | TEXT      | 球员昵称        |
| jersey\_number   | INTEGER   | 球衣号码        |
| team\_id         | INTEGER   | 所属国家队ID（外键） |
| created\_at      | TIMESTAMP | 创建时间        |

#### player\_positions 表

| 字段            | 类型        | 说明       |
| ------------- | --------- | -------- |
| id            | INTEGER   | 主键，自增    |
| player\_id    | INTEGER   | 球员ID（外键） |
| position\_id  | INTEGER   | 位置ID     |
| position      | TEXT      | 位置名称     |
| from\_time    | TEXT      | 开始时间     |
| to\_time      | TEXT      | 结束时间     |
| from\_period  | INTEGER   | 开始时段     |
| to\_period    | INTEGER   | 结束时段     |
| start\_reason | TEXT      | 开始原因     |
| end\_reason   | TEXT      | 结束原因     |
| created\_at   | TIMESTAMP | 创建时间     |

#### player\_cards 表

| 字段          | 类型        | 说明        |
| ----------- | --------- | --------- |
| id          | INTEGER   | 主键，自增     |
| player\_id  | INTEGER   | 球员ID（外键）  |
| time        | TEXT      | 时间        |
| card\_type  | TEXT      | 牌类型（红/黄牌） |
| reason      | TEXT      | 原因        |
| period      | INTEGER   | 时段        |
| created\_at | TIMESTAMP | 创建时间      |

#### data\_versions 表

| 字段          | 类型        | 说明    |
| ----------- | --------- | ----- |
| id          | INTEGER   | 主键，自增 |
| version     | TEXT      | 版本号   |
| description | TEXT      | 版本描述  |
| created\_at | TIMESTAMP | 创建时间  |

### 3. 队名归一化映射

需要处理的队名映射：
- `Korea Republic` → `South Korea`
- `Korea (South)` → `South Korea`
- `Iran, Islamic Republic of` → `Iran`
- `United States of America` → `United States`
- 其他可能的变体

#### 中文映射表
为前端界面显示，创建中英文映射：
- `South Korea` → `韩国`
- `Iran` → `伊朗`
- `United States` → `美国`
- `England` → `英格兰`
- `Brazil` → `巴西`
- `France` → `法国`
- `Germany` → `德国`
- `Spain` → `西班牙`
- 其他世界杯参赛国家

### 4. 数据导入流程

1. **读取CSV文件**：使用csv-parser或原生流读取
2. **解析player\_list JSON**：提取positions和cards数据
3. **清洗数据**：处理nan值，替换为null或空字符串
4. **队名归一化**：应用映射函数统一队名
5. **按顺序插入数据**：

   * teams（去重）

   * matches

   * players

   * player\_positions

   * player\_cards
6. **使用事务**：保证原子性
7. **输出统计信息**：记录数、错误数

### 5. 验证脚本检查项

* 每支球队至少有20名球员

* 每场比赛的比分不为空

* 队名归一化正确

## 依赖说明

项目已安装：

* `sqlite3` - SQLite数据库驱动

* `sqlite` - Promise-based SQLite包装

需要安装：

* `csv-parser` - CSV解析（或使用原生方式）

## 执行命令

```bash
node scripts/importData.js
node scripts/verifyData.js
```

## 风险评估

| 风险      | 描述                        | 应对措施              |
| ------- | ------------------------- | ----------------- |
| 数据格式不一致 | CSV中JSON字段可能包含单引号/双引号混合   | 使用try-catch处理解析异常 |
| nan值处理  | player\_nickname等字段可能为nan | 统一替换为null         |
| 队名变体    | 同一国家可能有多种名称               | 维护映射表并持续扩展        |
| 数据重复    | 多次运行可能重复插入                | 使用REPLACE或先清空表    |
| 事务失败    | 大量数据插入可能失败                | 使用事务保证原子性         |

