# 足球竞彩量化分析系统 - 项目结构说明

## 概述

足球竞彩客观数学量化决策平台 v2.7，集成10大意图公式数学模型的足球赔率量化预测工具。

## 目录结构

```
足球竞彩量化分析系统/
├── backend/                    # 后端服务 (Node.js + Express)
│   ├── controllers/            # 控制器层
│   │   ├── matchController.js
│   │   ├── playerController.js
│   │   └── teamController.js
│   ├── routes/                # 路由定义
│   │   ├── featureRoutes.js
│   │   ├── fixtureRoutes.js
│   │   ├── matchRoutes.js
│   │   ├── playerRoutes.js
│   │   ├── predict.js
│   │   ├── strength.js
│   │   ├── teamRoutes.js
│   │   └── teamStatsRoutes.js
│   ├── services/              # 业务逻辑服务
│   │   ├── cacheService.js
│   │   ├── featureService.js
│   │   ├── normalizationService.js
│   │   ├── poissonPredictor.js
│   │   └── strengthService.js
│   ├── dbService.js           # 数据库服务
│   ├── index.js               # 后端入口
│   ├── package.json
│   └── package-lock.json
│
├── config/                    # 配置文件
│   ├── leaguePresets.ts       # 联赛预设配置
│   └── teamNameMapping.js     # 球队名称映射
│
├── electron/                  # Electron 桌面应用
│   ├── main.cjs               # 主进程
│   └── preload.cjs            # 预加载脚本
│
├── python/                    # Python 爬虫模块
│   ├── crawler.py             # 主爬虫程序
│   ├── requirements.txt       # Python 依赖
│   ├── 五大联赛参赛球队名单.md
│   ├── 十大联赛参赛球队名单.md
│   ├── 日本J级联赛名单.md
│   ├── 韩K联赛参赛球队名单.md
│   ├── 世界杯国家队名单.md
│   ├── 挪超联赛参赛球队名单.md
│   ├── 瑞超联赛参赛球队名单.md
│   ├── 芬超联赛参赛球队名单.md
│   ├── 荷甲联赛参赛球队名单.md
│   ├── 葡超联赛参赛球队名单.md
│   ├── 沙特联联赛参赛球队名单.md
│   ├── 中超联赛参赛球队名单.md
│   ├── crawl_*.py             # 各联赛爬虫脚本
│   ├── check_*.py             # 数据检查脚本
│   ├── fix_*.py               # 数据修复脚本
│   ├── count_teams.py         # 球队统计
│   ├── clean_duplicate.py     # 去重脚本
│   └── validate_team_data.py  # 数据验证
│
├── scripts/                   # 辅助脚本
│   └── auto-commit-*.ps1      # 自动提交脚本
│
├── src/                       # 前端源码 (React + TypeScript)
│   ├── __tests__/             # 单元测试
│   │   ├── ExtremeInputs.test.tsx
│   │   ├── ValidationService.test.ts
│   │   ├── oddsConversion.test.ts
│   │   ├── quantModel.test.ts
│   │   └── vitest.setup.ts
│   │
│   ├── components/            # React 组件
│   │   ├── dashboard/         # 仪表盘子组件
│   │   │   ├── AdvancedParamsPanel.tsx
│   │   │   ├── MatchSelectionPanel.tsx
│   │   │   └── OddsParametersPanel.tsx
│   │   ├── AggregationDecisionCenter.tsx
│   │   ├── ApiKeySettings.tsx
│   │   ├── BayesianLiveMatchMonitor.tsx
│   │   ├── CornerKickStrategyChart.tsx
│   │   ├── ErrorBoundary.tsx
│   │   ├── ManagerStats.tsx
│   │   ├── RefereeStats.tsx
│   │   ├── StageComparison.tsx
│   │   ├── TeamInfoSection.tsx
│   │   ├── TeamRadarChart.tsx
│   │   ├── TeamStatsTable.tsx
│   │   ├── WorldCup2026Schedule.tsx
│   │   ├── WorldCupDashboard.tsx
│   │   └── YearComparison.tsx
│   │
│   ├── context/               # React Context
│   │   ├── LiveMatchContext.tsx
│   │   └── TeamContext.tsx
│   │
│   ├── crawler/               # 前端爬虫模块
│   │   └── qiumiwuCrawler.ts
│   │
│   ├── data/                  # 静态数据
│   │   ├── leagueTeams.ts
│   │   ├── realTeamsData.ts
│   │   ├── worldCup2026Schedule.ts
│   │   ├── worldCupData.ts
│   │   └── worldcupTeams.ts
│   │
│   ├── hooks/                 # 自定义 React Hooks
│   │   ├── useAIAnalysis.ts
│   │   ├── useFixtureSync.ts
│   │   ├── useOddsCalculation.ts
│   │   ├── useRiskAlerts.ts
│   │   └── useTeamDataSync.ts
│   │
│   ├── services/             # 前端服务
│   │   ├── ValidationService.ts
│   │   └── apiService.ts
│   │
│   ├── utils/                # 工具函数
│   │   ├── backtest.ts
│   │   ├── oddsCalculator.ts
│   │   ├── pythonTemplate.ts
│   │   └── quantModel.ts
│   │
│   ├── App.tsx               # 主应用组件
│   ├── main.tsx              # 应用入口
│   └── index.css             # 全局样式
│
├── .agents/                   # AI Agent 技能定义
│   └── skills/
│       ├── ai-slow-cleaner/
│       ├── backtest-engineer/
│       ├── code-review/
│       ├── code-simplifier/
│       ├── crawler-guard/
│       ├── data-pipeline/
│       ├── debugger/
│       ├── deep-interview/
│       ├── dependency-expert/
│       ├── electron-packager/
│       ├── explore/
│       ├── odds-model/
│       ├── prompt-optimizer/
│       ├── real-plan/
│       ├── test-engineer/
│       ├── ultra-qa/
│       └── visual-verdict/
│
├── .claude/                   # Claude AI 配置
│   └── skills/
│       └── (与 .agents/skills 同步的技能定义)
│
├── .trae/                     # Trae IDE 配置
│   └── documents/
│
├── package.json               # 项目依赖配置
├── package-lock.json
├── tsconfig.json             # TypeScript 配置
├── vite.config.ts            # Vite 构建配置
├── vitest.config.ts          # Vitest 测试配置
├── server.ts                 # 开发服务器入口
├── index.html                # HTML 入口
├── .env.example              # 环境变量示例
└── .gitignore                # Git 忽略配置
```

## 核心模块说明

### 1. 后端服务 (backend/)
Node.js + Express REST API，提供数据接口和业务逻辑。

**主要服务：**
- `dbService.js` - SQLite 数据库操作
- `poissonPredictor.js` - Poisson 分布预测模型
- `strengthService.js` - 球队实力评估
- `featureService.js` - 特征工程
- `normalizationService.js` - 数据归一化
- `cacheService.js` - 缓存管理

### 2. Python 爬虫 (python/)
使用 Puppeteer 的足球数据爬虫，支持多联赛数据采集。

**主要脚本：**
- `crawler.py` - 主爬虫程序，支持断点续爬
- 各联赛专属爬虫脚本

### 3. 前端应用 (src/)
React + TypeScript + Vite 构建的单页应用。

**核心功能：**
- 球队数据展示与分析
- 赔率计算与预测
- 欧亚盘赔付分析
- Poisson 分布大小球预测
- DeepSeek AI 战术推演

### 4. Electron 桌面应用 (electron/)
跨平台桌面应用打包配置。

## 配置文件

| 文件 | 说明 |
|------|------|
| `.env.example` | 环境变量模板 |
| `tsconfig.json` | TypeScript 编译选项 |
| `vite.config.ts` | Vite 构建配置 |
| `vitest.config.ts` | 测试框架配置 |

## 开发命令

```bash
# 安装依赖
npm install

# 开发模式运行
npm run dev

# Electron 开发模式
npm run dev:electron

# 构建生产版本
npm run build

# 构建 Electron 应用
npm run build:electron

# 类型检查
npm run lint

# 运行测试
npm run test
npm run test:watch      # 监听模式
npm run test:coverage   # 覆盖率报告
```

## 注意事项

1. **环境变量**：运行前需配置 `.env` 文件，设置 `DEEPSEEK_API_KEY`（可选）
2. **数据库**：项目使用 SQLite 数据库，首次运行会自动初始化
3. **AI 功能**：核心量化模型可离线运行，AI 功能需要有效的 API Key

## 最后更新时间

2026-05-30 - 文件清理后的项目结构文档
