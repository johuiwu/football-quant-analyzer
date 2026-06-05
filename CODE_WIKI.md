# 足球竞彩量化分析系统 — Code Wiki

> 版本: v2.7.0 | 最后更新: 2026-06-05

---

## 目录

1. [项目概述](#1-项目概述)
2. [项目架构图](#2-项目架构图)
3. [目录结构](#3-目录结构)
4. [前端模块详解 (src/)](#4-前端模块详解-src)
   - [4.1 入口与路由](#41-入口与路由)
   - [4.2 页面组件](#42-页面组件)
   - [4.3 核心组件](#43-核心组件)
   - [4.4 角球系统组件](#44-角球系统组件)
   - [4.5 状态管理](#45-状态管理)
   - [4.6 数学模型](#46-数学模型)
   - [4.7 工具函数](#47-工具函数)
   - [4.8 自定义 Hooks](#48-自定义-hooks)
   - [4.9 数据与服务](#49-数据与服务)
5. [后端模块详解 (backend/)](#5-后端模块详解-backend)
   - [5.1 入口与路由](#51-入口与路由)
   - [5.2 数据库服务](#52-数据库服务)
   - [5.3 量化模型服务](#53-量化模型服务)
   - [5.4 角球系统服务](#54-角球系统服务)
   - [5.5 爬虫服务](#55-爬虫服务)
6. [Electron 桌面层 (electron/)](#6-electron-桌面层-electron)
7. [Python 爬虫模块 (python/)](#7-python-爬虫模块-python)
8. [数据库设计](#8-数据库设计)
9. [依赖关系图](#9-依赖关系图)
10. [项目运行方式](#10-项目运行方式)
11. [配置文件说明](#11-配置文件说明)

---

## 1. 项目概述

**足球竞彩量化分析系统**是一个集成 10 大数学模型的全栈足球赔率量化预测工具，支持主客队数据对比、欧亚盘赔付分析、Poisson 分布大小球预测、DeepSeek AI 战术推演，以及基于 Puppeteer 的角球实时监控与自动投注系统。

### 核心功能

| 功能模块 | 说明 |
|---------|------|
| 球队数据管理 | 支持 10+ 联赛球队数据爬取、存储与展示 |
| 量化预测模型 | Poisson / Dixon-Coles / Elo / xG / Bayesian / Kelly 等模型 |
| 欧亚盘转换 | 亚盘↔欧赔精确双向转换 |
| AI 战术推演 | DeepSeek AI 驱动的球队画像与赛事点评 |
| 角球监控系统 | 基于 hga050.com 的实时角球数据爬取与策略评估 |
| 自动投注 | 角球策略触发后的自动化投注执行 |
| 回测系统 | 历史数据回测与策略验证 |
| Electron 桌面端 | 跨平台桌面应用打包 |

### 技术栈

| 层级 | 技术 |
|------|------|
| 前端 | React 19, TypeScript, Vite 6, Tailwind CSS 4, Zustand 5, D3.js, Lucide React |
| 后端 | Node.js, Express 4, Puppeteer 25 (puppeteer-extra + stealth), OpenAI SDK |
| 桌面 | Electron 42, electron-builder |
| 数据库 | SQLite (sqlite3 6.0, Knex 迁移管理) |
| Python | Python 3.11+, requests, BeautifulSoup4, pypinyin |
| 测试 | Vitest 4, Testing Library, jsdom |

---

## 2. 项目架构图

```
┌────────────────────────────────────────────────────────────┐
│                    Electron 桌面壳                           │
│  ┌──────────────────────────────────────────────────────┐  │
│  │               React 前端 (SPA)                        │  │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐             │  │
│  │  │Dashboard │ │Standings │ │ Corner   │  ...Pages   │  │
│  │  │Page      │ │Page      │ │SystemPage│             │  │
│  │  └────┬─────┘ └────┬─────┘ └────┬─────┘             │  │
│  │       │             │            │                    │  │
│  │  ┌────┴─────────────┴────────────┴─────┐             │  │
│  │  │         Zustand Stores              │             │  │
│  │  │  useAppStore  │  cornerStore        │             │  │
│  │  └───────────────┬─────────────────────┘             │  │
│  │                  │                                    │  │
│  │  ┌───────────────┴─────────────────────┐             │  │
│  │  │  Models (poisson/elo/bayesian/xg..) │             │  │
│  │  │  Utils (quantModel/oddsCalculator)  │             │  │
│  │  └─────────────────────────────────────┘             │  │
│  └──────────────────────┬───────────────────────────────┘  │
│                         │  HTTP /api/*                      │
│  ┌──────────────────────┴───────────────────────────────┐  │
│  │              Express 后端 (server.ts)                  │  │
│  │  ┌─────────────────────────────────────────────────┐ │  │
│  │  │  Routes (teams/players/matches/predict/corner..) │ │  │
│  │  └──────────────────────┬──────────────────────────┘ │  │
│  │  ┌──────────────────────┴──────────────────────────┐ │  │
│  │  │  Services                                        │ │  │
│  │  │  ┌──────────────┐  ┌──────────────────────────┐ │ │  │
│  │  │  │ 量化模型      │  │ 角球系统                  │ │ │  │
│  │  │  │ poissonPred.. │  │ cornerService/Crawler     │ │ │  │
│  │  │  │ strengthSvc   │  │ cornerEvaluator/Strategy  │ │ │  │
│  │  │  │ featureSvc    │  │ cornerBetExecutor         │ │ │  │
│  │  │  │ eloService    │  │ hgCrawlerService          │ │ │  │
│  │  │  └──────────────┘  └──────────────────────────┘ │ │  │
│  │  └──────────────────────┬──────────────────────────┘ │  │
│  │  ┌──────────────────────┴──────────────────────────┐ │  │
│  │  │  dbService.js (SQLite)                           │ │  │
│  │  └─────────────────────────────────────────────────┘ │  │
│  └───────────────────────────────────────────────────────┘  │
│                                                             │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  Puppeteer 浏览器自动化                                │  │
│  │  ┌─────────────┐  ┌─────────────────────────────┐   │  │
│  │  │ browserPool  │  │ crawlerShared (公共工具)     │   │  │
│  │  │ (单例管理)   │  │ handlePopups / clickTab     │   │  │
│  │  └─────────────┘  │ parseAllMarkets / parseAsian │   │  │
│  │                    └─────────────────────────────┘   │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                             │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  Python 爬虫 (qiumiwu.com 球队数据)                    │  │
│  │  crawler.py / crawl_*.py / check_*.py                 │  │
│  └──────────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────────┘
```

---

## 3. 目录结构

```
足球竞彩量化分析系统/
├── src/                          # 前端源码 (React + TypeScript)
│   ├── __tests__/                # 单元测试
│   ├── components/               # React 组件
│   │   ├── corner/               # 角球系统子组件
│   │   │   ├── CrawlerControlPanel.tsx   # 爬虫控制面板
│   │   │   ├── LiveMonitor.tsx           # 实时监控
│   │   │   ├── StrategyConfigPanel.tsx   # 策略配置
│   │   │   ├── SettingsPanel.tsx         # 系统设置
│   │   │   ├── MarketCard.tsx            # 盘口卡片
│   │   │   ├── MarketSection.tsx         # 盘口区域
│   │   │   └── CornerHistoryChart.tsx    # 历史图表
│   │   ├── dashboard/            # 仪表盘子组件
│   │   ├── AggregationDecisionCenter.tsx # 综合决策中心
│   │   ├── BayesianLiveMatchMonitor.tsx  # 贝叶斯实时监控
│   │   ├── CornerKickStrategyChart.tsx   # 角球策略图表
│   │   ├── WorldCupDashboard.tsx         # 世界杯仪表盘
│   │   ├── WorldCup2026Schedule.tsx      # 世界杯赛程
│   │   ├── TeamStatsTable.tsx            # 球队统计表
│   │   ├── TeamRadarChart.tsx            # 雷达图
│   │   ├── TeamInfoSection.tsx           # 球队信息
│   │   ├── StandingsTab.tsx              # 积分榜
│   │   ├── StageComparison.tsx           # 阶段对比
│   │   ├── YearComparison.tsx            # 年度对比
│   │   ├── ApiKeySettings.tsx            # API Key 设置
│   │   ├── ErrorBoundary.tsx             # 错误边界
│   │   ├── PythonExportTab.tsx           # Python 导出
│   │   └── UpdateChecker.tsx             # 更新检查
│   ├── config/                   # 前端配置
│   │   └── leagueParams.ts       # 联赛差异化参数
│   ├── data/                     # 静态数据
│   │   ├── leagueTeams.ts        # 联赛球队
│   │   ├── realTeamsData.ts      # 真实球队数据
│   │   ├── worldCupData.ts       # 世界杯数据
│   │   ├── worldCup2026Schedule.ts # 2026 世界杯赛程
│   │   ├── worldcupTeams.ts      # 世界杯球队
│   │   └── cornerTranslations.ts # 角球翻译
│   ├── hooks/                    # 自定义 Hooks
│   │   ├── useAIAnalysis.ts      # AI 分析
│   │   ├── useFixtureSync.ts     # 赛程同步
│   │   ├── useOddsCalculation.ts # 赔率计算
│   │   ├── useRiskAlerts.ts      # 风险预警
│   │   └── useTeamDataSync.ts    # 球队数据同步
│   ├── models/                   # 数学模型
│   │   ├── poisson.ts            # Poisson 分布
│   │   ├── bayesian.ts           # 贝叶斯时间衰减
│   │   ├── elo.ts                # Elo 评级
│   │   ├── xg.ts                 # xG 预期进球
│   │   ├── odds.ts               # 亚盘↔欧赔转换
│   │   └── heatIndex.ts          # 热力指数/Z-Score
│   ├── pages/                    # 页面组件
│   │   ├── DashboardPage.tsx     # 仪表盘主页
│   │   ├── StandingsPage.tsx     # 积分榜页
│   │   └── CornerSystemPage.tsx  # 角球系统页
│   ├── services/                 # 前端服务
│   │   ├── apiService.ts         # API 封装
│   │   └── ValidationService.ts  # 数据验证
│   ├── store/                    # 状态管理
│   │   ├── useAppStore.ts        # 全局状态
│   │   └── cornerStore.ts        # 角球系统状态
│   ├── types/                    # 类型定义
│   │   └── electron.d.ts         # Electron 类型
│   ├── utils/                    # 工具函数
│   │   ├── quantModel.ts         # 核心量化模型
│   │   ├── oddsCalculator.ts     # 赔率计算
│   │   ├── backtest.ts           # 回测系统
│   │   └── pythonTemplate.ts     # Python 模板生成
│   ├── App.tsx                   # 主应用 (导出 AppNew)
│   ├── AppNew.tsx                # 主应用实现
│   ├── main.tsx                  # React 入口
│   └── index.css                 # 全局样式
│
├── backend/                      # 后端服务 (Node.js + Express)
│   ├── controllers/              # 控制器
│   │   ├── matchController.js
│   │   ├── playerController.js
│   │   └── teamController.js
│   ├── middleware/
│   │   └── validate.js
│   ├── routes/                   # 路由
│   │   ├── index.js              # 路由聚合
│   │   ├── teamRoutes.js         # 球队
│   │   ├── matchRoutes.js        # 比赛
│   │   ├── playerRoutes.js       # 球员
│   │   ├── featureRoutes.js      # 特征
│   │   ├── strength.js           # 实力
│   │   ├── predict.js            # 预测
│   │   ├── fixtureRoutes.js      # 赛程
│   │   ├── aiRoutes.js           # AI
│   │   ├── cornerRoutes.js       # 角球
│   │   ├── crawlerRoutes.js      # 爬虫
│   │   ├── leagueRoutes.js       # 联赛
│   │   ├── statsRoutes.js        # 统计
│   │   ├── syncRoutes.js         # 同步
│   │   └── teamStatsRoutes.js    # 球队统计
│   ├── services/                 # 业务服务
│   │   ├── browserPool.js        # 浏览器单例管理
│   │   ├── cacheService.js       # 缓存服务
│   │   ├── cornerBetExecutor.js  # 角球投注执行
│   │   ├── cornerCrawler.js      # 角球爬虫核心
│   │   ├── cornerEvaluator.js    # 策略评估
│   │   ├── cornerService.js      # 角球服务中枢
│   │   ├── cornerStrategyEngine.js # 策略回测引擎
│   │   ├── crawlerHelper.js      # 爬虫辅助
│   │   ├── crawlerShared.js      # 爬虫公共模块
│   │   ├── eloService.js         # 后端 Elo 服务
│   │   ├── featureService.js     # 特征工程
│   │   ├── hgCrawlerService.js   # HG 爬虫服务
│   │   ├── normalizationService.js # 数据归一化
│   │   ├── poissonPredictor.js   # Poisson 预测
│   │   ├── qiumiwuCrawlerService.js # 球屋爬虫
│   │   └── strengthService.js    # 球队实力
│   ├── cookies.json              # Cookie 持久化
│   ├── dbService.js              # 数据库服务
│   ├── index.js                  # 后端入口
│   └── package.json
│
├── electron/                     # Electron 桌面
│   ├── main.cjs                  # 主进程
│   └── preload.cjs               # 预加载脚本
│
├── python/                       # Python 爬虫
│   ├── crawler.py                # 主爬虫
│   ├── requirements.txt          # Python 依赖
│   ├── crawl_*.py                # 各联赛爬虫
│   ├── check_*.py                # 数据检查
│   ├── fix_*.py                  # 数据修复
│   └── *.md                      # 球队名单
│
├── migrations/                   # 数据库迁移
│   ├── 001_init_tables.cjs       # 初始化表
│   ├── 002_betting_history.cjs   # 投注历史
│   ├── 004_corner_history.cjs    # 角球历史
│   ├── 005_corner_simulation_records.cjs # 模拟记录
│   └── 006_corner_bets.cjs       # 角球投注
│
├── config/                       # 全局配置
│   ├── leaguePresets.ts          # 联赛预设
│   └── teamNameMapping.js        # 球队名称映射
│
├── scripts/                      # 辅助脚本
│   ├── build-setup.cjs           # 构建配置
│   ├── generate_icon.cjs         # 图标生成
│   ├── start-dev.bat             # 开发启动
│   └── auto-commit-*.ps1         # 自动提交
│
├── build_resources/              # 构建资源
│   ├── chrome/                   # 打包 Chromium
│   └── icon.ico                  # 应用图标
│
├── server.ts                     # 开发服务器入口
├── vite.config.ts                # Vite 配置
├── vitest.config.ts              # 测试配置
├── tsconfig.json                 # TypeScript 配置
├── knexfile.cjs                  # Knex 配置
├── package.json                  # 项目配置
├── index.html                    # HTML 入口
├── .env.example                  # 环境变量示例
└── .gitignore
```

---

## 4. 前端模块详解 (src/)

### 4.1 入口与路由

#### [main.tsx](file:///d:/下载/足球竞彩量化分析系统/足球竞彩量化分析系统/src/main.tsx)
React 应用入口，创建根节点并挂载 `<App />` 组件，包含全局错误处理。

**关键代码:**
```tsx
createRoot(document.getElementById('root')!).render(<App />);
```

#### [App.tsx](file:///d:/下载/足球竞彩量化分析系统/足球竞彩量化分析系统/src/App.tsx)
简单导出 `AppNew` 组件。

#### [AppNew.tsx](file:///d:/下载/足球竞彩量化分析系统/足球竞彩量化分析系统/src/AppNew.tsx)
主应用组件，使用 `HashRouter` 实现客户端路由，管理全局 Tab 导航：

| 路由 | 组件 | 说明 |
|------|------|------|
| `/` | DashboardPage | 仪表盘主页 |
| `/standings` | StandingsPage | 积分榜 |
| `/teams` | - | 球队管理 |
| `/worldcup` | WorldCupDashboard | 世界杯 |
| `/python` | PythonExportTab | Python 导出 |
| `/corner` | CornerSystemPage | 角球系统 |

**依赖:** `useAppStore`, `react-router-dom`, 各页面组件

---

### 4.2 页面组件

#### [DashboardPage.tsx](file:///d:/下载/足球竞彩量化分析系统/足球竞彩量化分析系统/src/pages/DashboardPage.tsx)
仪表盘主页 (~1556 行)，核心功能：
- 对决阵容选择（主客队挑选）
- 赔率配置（欧赔/亚盘参数）
- 模型参数设置（模型权重面板）
- 胜平负概率对比（Poisson 模型预测）
- 贝叶斯动态监控（实时比分更新）
- 角球策略图表
- 凯利公式投注建议
- xPts 估值展示
- AI 战术推演（DeepSeek）

**依赖:** `useAppStore`, `quantModel`, `oddsCalculator`, `bayesian`, `elo`, `xg`, `AggregationDecisionCenter`, `BayesianLiveMatchMonitor`, `CornerKickStrategyChart`, `ModelWeightsPanel`, `AdvancedParamsPanel`, `useAIAnalysis`

#### [StandingsPage.tsx](file:///d:/下载/足球竞彩量化分析系统/足球竞彩量化分析系统/src/pages/StandingsPage.tsx)
积分榜页面，使用 `StandingsTab` 组件展示各联赛积分榜数据。

**依赖:** `useAppStore`, `StandingsTab`

#### [CornerSystemPage.tsx](file:///d:/下载/足球竞彩量化分析系统/足球竞彩量化分析系统/src/pages/CornerSystemPage.tsx)
角球系统页面，包含 4 个子 Tab：
- **实时比赛** — `LiveMonitor` 组件
- **爬虫控制** — `CrawlerControlPanel` 组件
- **策略配置** — `StrategyConfigPanel` 组件
- **系统设置** — `SettingsPanel` 组件

**依赖:** `cornerStore`, `CrawlerControlPanel`, `LiveMonitor`, `StrategyConfigPanel`, `SettingsPanel`

---

### 4.3 核心组件

#### AggregationDecisionCenter.tsx
综合决策中心，聚合模型预测、赔率分析、实时比赛状态，输出投注建议。使用贝叶斯时间衰减模型实时更新概率。

**依赖:** `useAppStore`, `REAL_TEAMS`, `calculateLeagueTimeDecay`, `calculateBaseOdds`, `getTeamElo`

#### BayesianLiveMatchMonitor.tsx
贝叶斯实时比赛监控，展示动态比分下的概率更新。

**依赖:** `useAppStore`, `calculateLeagueTimeDecay`, `quantModel`

#### CornerKickStrategyChart.tsx
角球策略可视化图表，展示各策略触发条件及历史表现。

#### WorldCupDashboard.tsx / WorldCup2026Schedule.tsx
世界杯数据仪表盘和 2026 赛程展示。

#### TeamStatsTable.tsx / TeamRadarChart.tsx / TeamInfoSection.tsx
球队数据展示：统计表格、雷达图（D3.js）、球队信息面板。

#### StandingsTab.tsx / StageComparison.tsx / YearComparison.tsx
积分榜展示、阶段对比、年度对比组件。

#### PythonExportTab.tsx
Python 模型导出，将前端预测模型导出为可独立运行的 Python 脚本。

#### ApiKeySettings.tsx / DeepSeekKeyModal.tsx
DeepSeek API Key 配置管理。

#### ErrorBoundary.tsx
React 错误边界，捕获子组件渲染错误。

#### UpdateChecker.tsx
Electron 自动更新检查。

---

### 4.4 角球系统组件 (components/corner/)

#### CrawlerControlPanel.tsx
爬虫控制面板 (~1003 行)，核心功能：
- 登录 hga050.com（调用 `/api/corner/login`）
- 获取实时比赛数据（`fetchMatches`）
- 获取赛程数据（`fetchSchedule`）
- 启动/暂停/停止监控
- 自动刷新（15 秒间隔）
- 显示比赛数据表格（队名、角球比分、盘口、赔率）

**关键函数:**
- `fetchMatches()` — 调用 `/api/corner/matches` 获取实时角球数据
- `fetchSchedule()` — 调用 `/api/corner/schedule` 获取赛程
- `startMonitoring()` — 启动定时轮询

**依赖:** `cornerStore`, `fetchWithRetry`

#### LiveMonitor.tsx
实时监控组件 (~370 行)，展示：
- 角球数据实时列表
- 比赛时间、比分、角球数、盘口
- 追踪比赛、历史查看
- 手动投注按钮

**依赖:** `cornerStore`

#### StrategyConfigPanel.tsx
策略配置面板 (~268 行)，配置 5 个角球策略的参数：
- 时间窗口 (playTimeStart/End)
- 领先球数条件 (leadGoals/leadGoalsWeak)
- 盘口区间 (cornerHandicapLower/Upper)
- 目标赔率 (targetOdds)
- 投注方向 (betDirection)
- 回测功能

**依赖:** `cornerStore`

#### SettingsPanel.tsx
系统设置面板 (~172 行)，配置：
- 刷新间隔
- 盘口限制
- 投注金额
- 真实模式开关

**依赖:** `cornerStore`

#### MarketCard.tsx / MarketSection.tsx
盘口卡片和区域组件，展示赔率数据。

#### CornerHistoryChart.tsx
角球历史图表，D3.js 可视化。

---

### 4.5 状态管理

#### [useAppStore.ts](file:///d:/下载/足球竞彩量化分析系统/足球竞彩量化分析系统/src/store/useAppStore.ts)
全局应用状态 (Zustand)，管理字段：

| 状态字段 | 类型 | 说明 |
|---------|------|------|
| `activeTab` | string | 当前 Tab ("dashboard"/"standings"/"teams"/"worldcup"/"corner"/"python") |
| `teams` | TeamStats[] | 全部球队数据 |
| `fixtures` | Fixture[] | 赛程数据 |
| `selectedHomeId` | string | 选中主队 ID |
| `selectedAwayId` | string | 选中客队 ID |
| `modelParams` | object | 模型参数（权重、K因子等） |
| `liveMatch` | object | 实时比赛状态（比分、时间、红牌等） |
| `marketOdds` | object | 市场赔率 |
| `predictionResults` | object | 预测结果 |
| `isLoading` | boolean | 加载状态 |

**关键方法:**
- `setTeams(teams)` — 设置球队数据
- `setFixtures(fixtures)` — 设置赛程
- `selectTeam(homeId, awayId)` — 选择对决球队
- `updateLiveMatch(data)` — 更新实时比赛
- `setPredictionResults(results)` — 设置预测结果
- `fetchTeams()` — 从 API 获取球队数据

#### [cornerStore.ts](file:///d:/下载/足球竞彩量化分析系统/足球竞彩量化分析系统/src/store/cornerStore.ts)
角球系统状态 (Zustand + persist)，管理字段：

| 状态字段 | 类型 | 说明 |
|---------|------|------|
| `matches` | CornerMatch[] | 角球比赛数据 |
| `liveMatches` | CornerMatch[] | 实时比赛数据 |
| `schedule` | Match[] | 赛程数据 |
| `isMonitoring` | boolean | 是否监控中 |
| `isLoggedIn` | boolean | 登录状态 |
| `strategies` | Strategy[] | 5 个策略配置 |
| `settings` | Settings | 系统设置（刷新间隔、投注金额等） |
| `account` | Account | 账户凭据 |
| `activeTab` | string | 角球系统子 Tab |
| `bets` | Bet[] | 投注记录 |
| `logs` | LogEntry[] | 操作日志 |

**关键方法:**
- `fetchMatches()` — 获取实时角球数据
- `fetchSchedule()` — 获取赛程
- `login(credentials)` — 登录 HG 网站
- `startMonitoring()` — 启动监控
- `stopMonitoring()` — 停止监控
- `updateStrategy(id, config)` — 更新策略
- `placeBet(betData)` — 执行投注
- `evaluateMatchForStrategies(match)` — 评估比赛触发策略

---

### 4.6 数学模型

#### [poisson.ts](file:///d:/下载/足球竞彩量化分析系统/足球竞彩量化分析系统/src/models/poisson.ts)
Poisson 分布核心函数：

| 函数 | 签名 | 说明 |
|------|------|------|
| `poisson(k, lambda)` | `(number, number) => number` | 计算 lambda 下恰好进 k 球的概率 |
| `dixonColesAdjustment(x, y, lambda, mu, rho)` | `(number, number, number, number, number) => number` | Dixon-Coles 低比分修正（0-0, 1-0, 0-1, 1-1） |

#### [bayesian.ts](file:///d:/下载/足球竞彩量化分析系统/足球竞彩量化分析系统/src/models/bayesian.ts)
贝叶斯时间衰减模型：

| 函数 | 说明 |
|------|------|
| `calculateTimeDecay(elapsed, total, exponent)` | 计算非线性时间衰减系数 `((total-elapsed)/total)^exponent` |
| `calculateLeagueTimeDecay(elapsed, league, total)` | 结合联赛差异化衰减参数计算 |

**联赛衰减参数 (LEAGUE_TIME_DECAY):** 德甲 1.0（末段进球多），意甲 1.4（末段进球少），默认 1.2

#### [elo.ts](file:///d:/下载/足球竞彩量化分析系统/足球竞彩量化分析系统/src/models/elo.ts)
Elo 评级系统：

| 函数 | 说明 |
|------|------|
| `getOrInitElo(teamName, league, rank)` | 初始化 Elo：`baseElo + (10-rank)*12` |
| `calculateEloUpdate(homeElo, awayElo, goalDiff, K)` | 赛后会更新 |
| `getTeamElo(team)` | 获取球队 Elo（优先读已存储值） |

**联赛基准 Elo:** 英超 1600 > 西甲 1570 > 德甲 1560 > 意甲 1540 > 法甲 1510 > ...

#### [xg.ts](file:///d:/下载/足球竞彩量化分析系统/足球竞彩量化分析系统/src/models/xg.ts)
xG (预期进球) 计算模型：

| 函数 | 说明 |
|------|------|
| `calculateRealisticXG(shots, shotsOnTarget, league, realXG)` | 科学计算 xG：`射正 × 1.2 + 射偏 × 0.2` × 联赛 xG 基准 |
| `computeTeamXG(team)` | 从球队数据计算场均 xG |
| `computeTeamXGSplit(team, isHome)` | 主/客场分别计算 xGFor 和 xGAgainst |

#### [odds.ts](file:///d:/下载/足球竞彩量化分析系统/足球竞彩量化分析系统/src/models/odds.ts)
亚盘↔欧赔精确转换：

| 函数 | 说明 |
|------|------|
| `computeDixonColesProbs(lambda, mu, rho)` | 基于 Dixon-Coles 计算胜平负概率 |
| `exactAsianTo1X2(handicap, homeStrength, awayStrength, league, returnRate)` | 亚盘 → 欧赔转换 |
| `exact1X2ToAsian(homeOdds, drawOdds, awayOdds, homeStrength, awayStrength)` | 欧赔 → 亚盘转换（二分搜索 + KL 散度） |

**依赖:** `poisson`, `dixonColesAdjustment`, `leagueParams`

#### [heatIndex.ts](file:///d:/下载/足球竞彩量化分析系统/足球竞彩量化分析系统/src/models/heatIndex.ts)
冷门爆冷热力指数 — Z-Score 动态预警：

| 函数 | 说明 |
|------|------|
| `calculateZScore(value, mean, stdDev)` | 计算标准分数 |
| `computeStats(values)` | 从历史值计算均值与标准差 |
| `ensureEnoughData(stats)` | 冷启动检查（样本量 < 5 降级） |
| `evaluateUpsetAlert(...)` | 综合爆冷预警判定（Z-Score > 2.0 + 概率差 > 0.15） |

---

### 4.7 工具函数

#### [quantModel.ts](file:///d:/下载/足球竞彩量化分析系统/足球竞彩量化分析系统/src/utils/quantModel.ts)
核心量化模型 (~2907 行)，整合所有预测模块：

**主要导出:**
- `QuantModel` 类 — 主预测引擎
- `PredictionResults` 类型 — 预测结果结构
- 整合 Poisson、Dixon-Coles、Elo、xG、Bayesian、Kelly 等模型
- 输出胜平负概率、大小球、亚盘、凯利值、综合评分

**依赖:** `poisson`, `bayesian`, `elo`, `xg`, `odds`, `heatIndex`, `leagueParams`

#### [oddsCalculator.ts](file:///d:/下载/足球竞彩量化分析系统/足球竞彩量化分析系统/src/utils/oddsCalculator.ts)
赔率计算工具：

| 函数 | 说明 |
|------|------|
| `calculateBaseOdds(homeTeam, awayTeam)` | 结合 Elo 和 xG 计算初始欧赔 |

**依赖:** `elo`, `xg`, `leagueParams`

#### [backtest.ts](file:///d:/下载/足球竞彩量化分析系统/足球竞彩量化分析系统/src/utils/backtest.ts)
模型回测系统 (~150 行)，验证预测准确率。

#### [pythonTemplate.ts](file:///d:/下载/足球竞彩量化分析系统/足球竞彩量化分析系统/src/utils/pythonTemplate.ts)
Python 代码生成器 (~431 行)，将前端预测模型导出为可独立运行的 Python 脚本（含 Tkinter GUI）。

---

### 4.8 自定义 Hooks

#### [useAIAnalysis.ts](file:///d:/下载/足球竞彩量化分析系统/足球竞彩量化分析系统/src/hooks/useAIAnalysis.ts)
AI 分析 Hook，调用 `/api/ai-analyze-match` 获取 DeepSeek 战术推演。
- 返回 `{ analysis, isLoading, validationWarning, needsApiKey, fetchAiAnalysis }`

#### [useFixtureSync.ts](file:///d:/下载/足球竞彩量化分析系统/足球竞彩量化分析系统/src/hooks/useFixtureSync.ts)
赛程同步 Hook，从后端 API 获取并同步赛程数据。

#### [useOddsCalculation.ts](file:///d:/下载/足球竞彩量化分析系统/足球竞彩量化分析系统/src/hooks/useOddsCalculation.ts)
赔率计算 Hook，封装赔率计算逻辑。

#### [useRiskAlerts.ts](file:///d:/下载/足球竞彩量化分析系统/足球竞彩量化分析系统/src/hooks/useRiskAlerts.ts)
风险预警 Hook，检测异常投注行为。

#### [useTeamDataSync.ts](file:///d:/下载/足球竞彩量化分析系统/足球竞彩量化分析系统/src/hooks/useTeamDataSync.ts)
球队数据同步 Hook，从后端同步球队数据。

---

### 4.9 数据与服务

#### [apiService.ts](file:///d:/下载/足球竞彩量化分析系统/足球竞彩量化分析系统/src/services/apiService.ts)
API 封装层：

| 函数 | 说明 |
|------|------|
| `fetchWithRetry<T>(url, options, config)` | 带重试的 fetch（指数退避，最多 3 次） |
| `fetchWithTimeout<T>(url, options, timeout)` | 带超时的 fetch（默认 10s） |
| `getTeams()` | 获取全部球队 |
| `syncStandings(league)` | 同步积分榜 |
| `getMatchData(matchId)` | 获取比赛数据 |

#### [ValidationService.ts](file:///d:/下载/足球竞彩量化分析系统/足球竞彩量化分析系统/src/services/ValidationService.ts)
数据验证服务，验证 AI 分析结果与模型预测的一致性。

#### 静态数据
- [leagueTeams.ts](file:///d:/下载/足球竞彩量化分析系统/足球竞彩量化分析系统/src/data/leagueTeams.ts) — 联赛球队映射
- [realTeamsData.ts](file:///d:/下载/足球竞彩量化分析系统/足球竞彩量化分析系统/src/data/realTeamsData.ts) — 真实球队数据（类型定义 + 数据）
- [worldCupData.ts](file:///d:/下载/足球竞彩量化分析系统/足球竞彩量化分析系统/src/data/worldCupData.ts) — 世界杯历史数据
- [worldCup2026Schedule.ts](file:///d:/下载/足球竞彩量化分析系统/足球竞彩量化分析系统/src/data/worldCup2026Schedule.ts) — 2026 世界杯赛程
- [worldcupTeams.ts](file:///d:/下载/足球竞彩量化分析系统/足球竞彩量化分析系统/src/data/worldcupTeams.ts) — 世界杯球队
- [cornerTranslations.ts](file:///d:/下载/足球竞彩量化分析系统/足球竞彩量化分析系统/src/data/cornerTranslations.ts) — 角球术语翻译

#### 联赛配置
- [leagueParams.ts](file:///d:/下载/足球竞彩量化分析系统/足球竞彩量化分析系统/src/config/leagueParams.ts) — 联赛差异化参数（Dixon-Coles rho、场均进球数、时间衰减幂次）

---

## 5. 后端模块详解 (backend/)

### 5.1 入口与路由

#### [server.ts](file:///d:/下载/足球竞彩量化分析系统/足球竞彩量化分析系统/server.ts)
Express 开发/生产服务器入口：
- 中间件：`helmet`(CSP), `cors`, `express-rate-limit`(500次/15分钟)
- 开发模式：Vite 中间件代理前端
- 生产模式：托管 `dist/` 静态文件
- 端口自动递增（`EADDRINUSE` 处理）
- 导出 `startServer(port)` / `stopServer()` 供 Electron 调用

**依赖:** `express`, `vite`, `cors`, `helmet`, `express-rate-limit`, `backend/routes/index.js`

#### [backend/index.js](file:///d:/下载/足球竞彩量化分析系统/足球竞彩量化分析系统/backend/index.js)
独立后端入口（可脱离 Electron 运行），注册所有路由。

#### 路由聚合 [routes/index.js](file:///d:/下载/足球竞彩量化分析系统/足球竞彩量化分析系统/backend/routes/index.js)
```js
router.use(leagueRoutes);   // 联赛
router.use(statsRoutes);    // 统计
router.use(syncRoutes);     // 同步
router.use(aiRoutes);       // AI
router.use(cornerRoutes);   // 角球
router.use(crawlerRoutes);  // 爬虫
```

#### 路由一览

| 路由文件 | 前缀 | 主要端点 |
|---------|------|---------|
| `teamRoutes.js` | `/api/teams` | GET all, GET by id, GET stats, GET/POST strength |
| `matchRoutes.js` | `/api/matches` | GET all, GET by id, GET by team |
| `playerRoutes.js` | `/api/players` | GET all, GET by id, GET by team |
| `featureRoutes.js` | `/api/features` | GET teams, GET by id, GET stats, GET compare, POST clear cache |
| `strength.js` | `/api` | POST compute-all |
| `predict.js` | `/api/predict` | POST poisson, POST simulate, GET parameters, POST train |
| `fixtureRoutes.js` | `/api` | GET sync-fixtures, GET qiumiwu-fixtures |
| `aiRoutes.js` | `/api` | POST ai-team-profile, POST match-analyze, POST ai-analyze-match, POST deepseek/set-key, GET deepseek/key-status |
| `cornerRoutes.js` | `/api/corner` | 详见下方角球系统 API |
| `crawlerRoutes.js` | `/api/crawler` | 爬虫控制 |
| `leagueRoutes.js` | `/api/leagues` | 联赛数据 |
| `statsRoutes.js` | `/api/stats` | 统计数据 |
| `syncRoutes.js` | `/api` | 数据同步 |
| `teamStatsRoutes.js` | `/api/team-stats` | 球队统计 |

#### 角球系统 API (cornerRoutes.js)

| 端点 | 方法 | 说明 |
|------|------|------|
| `/api/corner/matches` | GET | 获取实时角球比赛数据 |
| `/api/corner/schedule` | GET | 获取比赛赛程 |
| `/api/corner/main-markets` | GET | 获取主流盘口数据 |
| `/api/corner/login` | POST | 登录 hga050.com |
| `/api/corner/logout` | POST | 登出 |
| `/api/corner/status` | GET | 获取爬虫状态 |
| `/api/corner/polling/start` | POST | 启动后端轮询 |
| `/api/corner/polling/stop` | POST | 停止后端轮询 |
| `/api/corner/polling/status` | GET | 获取轮询状态 |
| `/api/corner/strategies` | GET/POST | 获取/设置策略 |
| `/api/corner/backtest` | POST | 执行回测 |
| `/api/corner/bet` | POST | 执行投注 |
| `/api/corner/bet/config` | GET/POST | 获取/设置投注配置 |
| `/api/corner/history` | GET | 获取历史记录 |
| `/api/corner/stats` | GET | 获取统计数据 |

---

### 5.2 数据库服务

#### [dbService.js](file:///d:/下载/足球竞彩量化分析系统/足球竞彩量化分析系统/backend/dbService.js)
SQLite 数据库访问层，封装 `sqlite` / `sqlite3` 库：

| 方法 | 说明 |
|------|------|
| `getDb()` | 获取数据库连接（单例） |
| `query(sql, params)` | 执行查询，返回所有行 |
| `get(sql, params)` | 执行查询，返回单行 |
| `run(sql, params)` | 执行操作（INSERT/UPDATE/DELETE） |

**数据库路径:** 开发环境 `database/`，生产环境 `process.env.DB_DIR`

---

### 5.3 量化模型服务

#### [poissonPredictor.js](file:///d:/下载/足球竞彩量化分析系统/足球竞彩量化分析系统/backend/services/poissonPredictor.js)
后端 Poisson 预测服务 (~206 行)：

| 导出 | 说明 |
|------|------|
| `computeExpectedGoals(strengthVector, leagueAvg)` | 从强度向量计算期望进球 |
| `predictMatch(home, away, homeStrength, awayStrength)` | 预测比赛结果（胜平负概率、大小球） |
| `simulateMatch(home, away, homeStrength, awayStrength, n)` | 蒙特卡洛模拟 n 场比赛 |
| `trainModel(matches)` | 从历史数据训练 Poisson 模型参数 |

**依赖:** `dbService`

#### [strengthService.js](file:///d:/下载/足球竞彩量化分析系统/足球竞彩量化分析系统/backend/services/strengthService.js)
球队实力向量计算 (~188 行)：

| 导出 | 说明 |
|------|------|
| `computeStrengthVector(team)` | 计算球队综合能力向量（进攻/防守/控球/体能） |
| `computeAllStrengths()` | 批量计算所有球队实力 |
| `getRankedStrengths()` | 获取按总体实力排序的球队列表 |

**依赖:** `dbService`, `featureService`, `eloService`

#### [featureService.js](file:///d:/下载/足球竞彩量化分析系统/足球竞彩量化分析系统/backend/services/featureService.js)
特征工程服务 (~356 行)：

| 导出 | 说明 |
|------|------|
| `buildFeatureVector(teamId)` | 构建球队特征向量（胜率、进球、防守、角球等） |
| `buildAllFeatureVectors()` | 批量构建所有球队特征 |
| `compareTeams(team1Id, team2Id)` | 对比两支球队特征 |
| `getFeatureStats()` | 获取特征统计信息 |

**依赖:** `dbService`, `cacheService`, `normalizationService`

#### [eloService.js](file:///d:/下载/足球竞彩量化分析系统/足球竞彩量化分析系统/backend/services/eloService.js)
后端 Elo 服务 (~95 行)，与前端 `elo.ts` 逻辑一致：

| 导出 | 说明 |
|------|------|
| `computeEloFromStandings(team)` | 从积分榜数据计算动态 Elo |
| `calculateEloUpdate(homeElo, awayElo, goalDiff, K)` | 赛后 Elo 更新 |
| `updateAllTeamElos(teams)` | 批量计算并写入数据库 |
| `loadAllElos()` | 从数据库加载所有 Elo |

**依赖:** `dbService`

#### [normalizationService.js](file:///d:/下载/足球竞彩量化分析系统/足球竞彩量化分析系统/backend/services/normalizationService.js)
Z-Score 数据归一化服务：

| 导出 | 说明 |
|------|------|
| `normalizeFeatures(featureVectors)` | 批量归一化特征向量 |
| `normalizeSingleFeature(value, mean, stdDev)` | 单特征归一化 |
| `getFeatureStats(featureVectors)` | 获取特征统计（均值、标准差、极值、中位数） |

#### [cacheService.js](file:///d:/下载/足球竞彩量化分析系统/足球竞彩量化分析系统/backend/services/cacheService.js)
内存缓存服务（单例），默认 TTL 3600 秒：

| 方法 | 说明 |
|------|------|
| `cacheFeature(teamId, featureName, value, ttl)` | 缓存特征值 |
| `getCachedFeature(teamId, featureName)` | 获取缓存（自动过期） |
| `clearTeamCache(teamId)` | 清除球队缓存 |
| `clearAll()` | 清除全部缓存 |
| `getStats()` | 获取缓存统计 |

---

### 5.4 角球系统服务

#### [cornerService.js](file:///d:/下载/足球竞彩量化分析系统/足球竞彩量化分析系统/backend/services/cornerService.js)
角球系统核心服务 (~769 行)，负责：
- **后端轮询管理** — `startCornerBackendPolling()` / `stopCornerBackendPolling()` 每 15 秒轮询
- **策略管理** — `DEFAULT_STRATEGIES` (5 个预定义策略)，`setCornerStrategies()` / `getCornerStrategies()`
- **投注配置** — `setBetConfig()` / `getBetConfig()` / `getAutoBetConfig()`
- **数据缓存** — `cachedMatches` / `cachedMainMarkets`，30 秒过期
- **历史记录** — `saveSimulationRecord()` / `getSimulationRecords()` / `getStrategyStats()`

**5 个预定义策略:**
| ID | 名称 | 时间窗口 | 条件 |
|----|------|---------|------|
| 1 | 走地角球 | 35'-55' | 不限比分，盘口 -1.25~2.5 |
| 2 | 领先角球 | 50'-77' | 领先 3 球，盘口 -0.75~2.5 |
| 3 | 平局角球 | 70'-99' | 平局，盘口 0~1.5 |
| 4 | 领先追角 | 60'-99' | 领先 2 球，盘口 0~2.5 |
| 5 | 尾声角球 | 70'-99' | 领先 1 球，盘口 0~2.5 |

**依赖:** `cornerCrawler`, `cornerEvaluator`, `cornerBetExecutor`

#### [cornerCrawler.js](file:///d:/下载/足球竞彩量化分析系统/足球竞彩量化分析系统/backend/services/cornerCrawler.js)
角球爬虫核心 (~800+ 行)，负责 hga050.com 的角球数据采集：

**主要导出:**
- `crawlCornerMatches()` — 爬取角球比赛数据（返回 matches + mainMarkets + matchScores）
- `navigateToCorners(page)` — 导航到角球视图（In-Play → CORNERS）
- `ensureLogin()` — 登录流程（含锁保护、Cookie 持久化、验证码处理）
- `getPollingStatus()` — 获取轮询状态

**爬取流程:**
1. 获取共享浏览器页面
2. 确保登录状态（Cookie 优先）
3. 导航到 In-Play → CORNERS 标签
4. 从 Soccer 页面提取真实比分（matchScores）
5. 解析角球盘口数据（parseCornerMarkets）
6. 映射角球数到各场比赛
7. 返回结构化数据

**依赖:** `browserPool`, `crawlerShared`, `puppeteer-extra`

#### [cornerEvaluator.js](file:///d:/下载/足球竞彩量化分析系统/足球竞彩量化分析系统/backend/services/cornerEvaluator.js)
策略评估模块（与前端 `cornerStore.ts` 逻辑一致）：

| 导出 | 说明 |
|------|------|
| `evaluateSingleStrategy(match, strategy)` | 评估单场比赛是否触发策略 |
| `evaluateStrategies(matches, strategies)` | 批量评估，返回触发结果 |

**评估条件:**
1. 策略启用检查
2. 比赛时间有效性（排除半场休息 45'-46'，最大 99'）
3. 时间窗口匹配
4. 盘口范围检查（支持 betDirection 方向感知）
5. 赔率条件检查
6. 比分条件检查（领先球数 / 平局判断）

#### [cornerStrategyEngine.js](file:///d:/下载/足球竞彩量化分析系统/足球竞彩量化分析系统/backend/services/cornerStrategyEngine.js)
策略回测引擎 (~80+ 行)：

| 导出 | 说明 |
|------|------|
| `runBacktest(strategies)` | 生成 80 场模拟比赛，执行回测，返回统计结果 |

**模拟数据:** 随机生成比赛时间、盘口、赔率、比分，使用 `evaluateSingleStrategy` 评估触发。

**依赖:** `cornerService`, `cornerEvaluator`

#### [cornerBetExecutor.js](file:///d:/下载/足球竞彩量化分析系统/足球竞彩量化分析系统/backend/services/cornerBetExecutor.js)
角球投注执行器 (~60+ 行)：

| 导出 | 说明 |
|------|------|
| `executeBet(betData)` | 在 hga050.com 执行真实投注 |
| `sleep(ms)` | 延迟工具函数 |

**投注流程:**
1. 检查登录状态
2. 验证页面登录特征（余额/用户元素）
3. 导航到角球视图
4. 定位目标比赛行
5. 选择盘口选项
6. 输入投注金额
7. 确认投注
8. 返回结果（transactionId / error）

**依赖:** `browserPool`, `cornerCrawler`, `crawlerShared`

---

### 5.5 爬虫服务

#### [browserPool.js](file:///d:/下载/足球竞彩量化分析系统/足球竞彩量化分析系统/backend/services/browserPool.js)
Puppeteer 浏览器单例管理：

| 导出 | 说明 |
|------|------|
| `getSharedBrowser(forceNew)` | 获取/创建共享浏览器实例 |
| `getSharedPage()` / `setSharedPage(page)` | 获取/设置共享页面 |
| `getLoginCookies()` / `setLoginCookies(cookies)` | Cookie 管理 |
| `getBalance()` / `setBalance(balance)` | 余额管理 |
| `isLoggedIn()` / `isBrowserActive()` | 状态检查 |
| `closeSharedBrowser()` | 关闭浏览器 |
| `saveCookiesToDisk(cookies)` / `loadCookiesFromDisk()` | Cookie 持久化 |

**关键特性:**
- 单例模式（防止重复启动）
- 启动锁（`isLaunching` 防止并发启动）
- 连接检测（`browser.version()` 验证可用性）
- 5 分钟活动超时
- 使用 `puppeteer-extra-plugin-stealth` 反检测

#### [crawlerShared.js](file:///d:/下载/足球竞彩量化分析系统/足球竞彩量化分析系统/backend/services/crawlerShared.js)
爬虫公共工具模块：

| 导出 | 说明 |
|------|------|
| `randomDelay(min, max)` | 随机延迟（反爬，默认 500-2000ms） |
| `handlePopups(page)` | 自动处理弹窗（OK/NO 按钮，最多 5 次） |
| `clickTab(page, tabName, waitMs)` | 通用 Tab 点击（多选择器兼容） |
| `createCornerExtractorFn()` | 创建角球数提取函数 |
| `parseAllMarkets(page)` | 解析全部盘口数据（HDP/OU/1X2/OE） |
| `parseAsianHandicap(line)` | 解析亚盘盘口字符串（支持 "0.5/1" 格式） |

#### [hgCrawlerService.js](file:///d:/下载/足球竞彩量化分析系统/足球竞彩量化分析系统/backend/services/hgCrawlerService.js)
HG 网站爬虫服务 (~60+ 行)，独立的爬虫实例：

| 导出 | 说明 |
|------|------|
| `getCrawlerStatus()` | 获取爬虫状态 |
| `safeEvaluate(page, fn)` | 安全的页面 evaluate（自动重试 3 次） |

**特色功能:**
- `fetchSchedule()` — 获取赛程时暂停角球轮询，完成后恢复，避免数据污染
- 独立的浏览器实例（不共享 browserPool）

**依赖:** `browserPool`, `crawlerShared`, `cornerService`

#### [qiumiwuCrawlerService.js](file:///d:/下载/足球竞彩量化分析系统/足球竞彩量化分析系统/backend/services/qiumiwuCrawlerService.js)
球屋网爬虫服务，获取足球赛程数据。

#### [crawlerHelper.js](file:///d:/下载/足球竞彩量化分析系统/足球竞彩量化分析系统/backend/services/crawlerHelper.js)
爬虫辅助工具函数。

---

## 6. Electron 桌面层 (electron/)

#### [main.cjs](file:///d:/下载/足球竞彩量化分析系统/足球竞彩量化分析系统/electron/main.cjs)
Electron 主进程 (~149 行)：

**核心职责:**
1. **环境初始化** — 设置 `DB_DIR`、`COOKIE_PATH`、`STATIC_DIR`、`PUPPETEER_EXECUTABLE_PATH`（打包后 Chromium）
2. **后端模块加载** — 直接 `require(dist/server.cjs)` 内嵌后端，不 spawn 子进程
3. **窗口创建** — 1440×900，最小 1024×700，contextIsolation + sandbox
4. **模式切换**：
   - 开发模式 → 等待 Vite (5173) 就绪后加载
   - 生产模式 → 启动后端 (3000) 后加载
5. **IPC 通信** — `get-app-version`、`get-is-packaged`

**生命周期:**
- `app.whenReady()` → 加载后端 → 启动服务器(生产) → 创建窗口
- `window-all-closed` → 停止服务器 → 退出
- `before-quit` → 停止服务器

#### [preload.cjs](file:///d:/下载/足球竞彩量化分析系统/足球竞彩量化分析系统/electron/preload.cjs)
预加载脚本，使用 `contextBridge` 暴露安全的 API 到渲染进程。

---

## 7. Python 爬虫模块 (python/)

#### [crawler.py](file:///d:/下载/足球竞彩量化分析系统/足球竞彩量化分析系统/python/crawler.py)
主爬虫 (~800+ 行)，从 qiumiwu.com 爬取球队统计数据：

**核心功能:**
- 支持多联赛：五大联赛、J联赛、K联赛、挪超、瑞超、芬超、荷甲、葡超、沙特联、中超
- 断点续爬（`crawl_progress.json`）
- 字段映射（qiumiwu.com hash → 数据库列名）
- 输出 CSV（`output/all_teams_data.csv`）

**用法:**
```bash
python python/crawler.py                          # 五大联赛
python python/crawler.py --league top10           # 十大联赛
python python/crawler.py --league all             # 全部联赛
python python/crawler.py --resume                 # 断点续爬
python python/crawler.py --limit 10               # 测试模式
```

#### 辅助脚本
- `crawl_*.py` — 各联赛专属爬虫（如 `crawl_all_leagues.py`、`crawl_kleague_missing.py`）
- `check_*.py` — 数据检查脚本（如 `check_db_data.py`、`check_zero_data.py`）
- `fix_*.py` — 数据修复脚本（如 `fix_saudi_league.py`、`fix_nisi_data.py`）
- `validate_team_data.py` — 数据验证
- `clean_duplicate.py` — 去重
- `count_teams.py` — 球队统计

#### 球队名单文件
`python/` 目录下包含各联赛的球队名单 markdown 文件，供爬虫使用。

---

## 8. 数据库设计

### 数据库系统
- **类型:** SQLite
- **迁移工具:** Knex.js
- **配置文件:** [knexfile.cjs](file:///d:/下载/足球竞彩量化分析系统/足球竞彩量化分析系统/knexfile.cjs)
- **数据库路径:** 开发环境 `database/`，生产环境 `process.env.DB_DIR`

### 迁移文件

| 迁移 | 说明 |
|------|------|
| `001_init_tables.cjs` | 初始化核心表 |
| `002_betting_history.cjs` | 投注历史表 |
| `004_corner_history.cjs` | 角球历史表 |
| `005_corner_simulation_records.cjs` | 角球模拟记录表 |
| `006_corner_bets.cjs` | 角球投注表 |

### 核心表结构

#### teams 表
| 列名 | 类型 | 说明 |
|------|------|------|
| `team_id` | TEXT | 主键，球队唯一标识 |
| `team_name` | TEXT | 英文名 |
| `team_name_cn` | TEXT | 中文名 |
| `league` | TEXT | 联赛代码 |
| `league_cn` | TEXT | 联赛中文名 |
| `rank` | INTEGER | 排名 |
| `home_*` / `away_*` | INTEGER | 主/客场统计数据（played, wins, draws, losses, goalsFor, goalsAgainst, xgFor, xgAgainst） |
| `form` | TEXT | 近期战绩 |
| `shots_per_game` | FLOAT | 场均射门 |
| `shot_accuracy` | INTEGER | 射正率 |
| `elo` | FLOAT | Elo 等级分 |
| `data_source` | TEXT | 数据来源 |
| `last_updated` | DATETIME | 最后更新时间 |

#### team_stats 表
| 列名 | 类型 | 说明 |
|------|------|------|
| `team_id` | TEXT | 主键 |
| `goals` | INTEGER | 进球 |
| `conceded` | INTEGER | 失球 |
| `goalDifference` | INTEGER | 净胜球 |
| `shots` | INTEGER | 射门 |
| `shotsOnTarget` | INTEGER | 射正 |
| `corners` | INTEGER | 角球 |
| `fouls` | INTEGER | 犯规 |
| `redCards` / `yellowCards` | INTEGER | 红黄牌 |
| `passes` | INTEGER | 传球 |
| `assists` | INTEGER | 助攻 |
| `penalties` | INTEGER | 点球 |

---

## 9. 依赖关系图

### 前端模块依赖

```
main.tsx
  └── App.tsx → AppNew.tsx
        ├── DashboardPage
        │     ├── useAppStore
        │     ├── quantModel ← poisson, bayesian, elo, xg, odds, heatIndex, leagueParams
        │     ├── oddsCalculator ← elo, xg, leagueParams
        │     ├── AggregationDecisionCenter ← useAppStore, bayesian, oddsCalculator, elo
        │     ├── BayesianLiveMatchMonitor ← useAppStore, bayesian, quantModel
        │     ├── CornerKickStrategyChart
        │     ├── ModelWeightsPanel
        │     ├── AdvancedParamsPanel
        │     └── useAIAnalysis ← ValidationService, /api/ai-analyze-match
        ├── StandingsPage
        │     └── StandingsTab ← useAppStore
        ├── CornerSystemPage
        │     ├── cornerStore
        │     ├── CrawlerControlPanel ← cornerStore, apiService
        │     ├── LiveMonitor ← cornerStore
        │     ├── StrategyConfigPanel ← cornerStore
        │     └── SettingsPanel ← cornerStore
        └── WorldCupDashboard / PythonExportTab
```

### 后端模块依赖

```
server.ts
  └── backend/routes/index.js
        ├── cornerRoutes.js → cornerService.js
        │     ├── cornerCrawler.js → browserPool.js, crawlerShared.js
        │     ├── cornerEvaluator.js
        │     ├── cornerStrategyEngine.js → cornerService.js, cornerEvaluator.js
        │     └── cornerBetExecutor.js → browserPool.js, cornerCrawler.js
        ├── crawlerRoutes.js → hgCrawlerService.js
        │     ├── browserPool.js
        │     ├── crawlerShared.js
        │     └── cornerService.js
        ├── predict.js → poissonPredictor.js
        ├── strength.js → strengthService.js → featureService.js, eloService.js
        ├── featureRoutes.js → featureService.js → cacheService.js, normalizationService.js
        └── ... (team/match/player/ai/fixture routes)
              └── dbService.js → SQLite
```

### 角球系统核心链路

```
cornerStore (前端) ──HTTP──→ cornerRoutes.js ──→ cornerService.js
                                                    │
                                          ┌─────────┼─────────┐
                                          │         │         │
                                    cornerCrawler  cornerEvaluator  cornerBetExecutor
                                          │         │         │
                                    browserPool  crawlerShared  browserPool
                                          │
                                    Puppeteer → hga050.com
```

---

## 10. 项目运行方式

### 环境要求
- **Node.js** >= 18
- **Python** >= 3.11（爬虫功能）
- **npm** 包管理器

### 安装

```bash
# 1. 克隆项目
cd 足球竞彩量化分析系统

# 2. 安装 Node.js 依赖
npm install

# 3. 安装 Python 依赖（可选，用于爬虫）
pip install -r python/requirements.txt

# 4. 配置环境变量
cp .env.example .env
# 编辑 .env 文件，配置 DEEPSEEK_API_KEY、HG_USERNAME、HG_PASSWORD 等
```

### 环境变量

| 变量 | 必填 | 说明 |
|------|------|------|
| `DEEPSEEK_API_KEY` | 否 | DeepSeek AI 密钥（缺失时降级为离线模式） |
| `HG_USERNAME` | 否 | hga050.com 用户名（缺失时爬虫不可用） |
| `HG_PASSWORD` | 否 | hga050.com 密码 |
| `PORT` | 否 | 服务端口，默认 3000 |
| `CRAWLER_DEBUG` | 否 | 设为 "1" 开启浏览器可见模式 |
| `CRAWLER_POLL_INTERVAL` | 否 | 爬虫轮询间隔(ms)，默认 15000 |
| `CORNER_BET_AMOUNT` | 否 | 默认投注金额，默认 100 |
| `CORNER_BET_REAL_MODE` | 否 | 真实投注模式开关 |
| `DB_DIR` | 否 | 数据库目录（Electron 自动设置） |
| `COOKIE_PATH` | 否 | Cookie 文件路径（Electron 自动设置） |
| `STATIC_DIR` | 否 | 静态文件目录（Electron 自动设置） |
| `PUPPETEER_EXECUTABLE_PATH` | 否 | Chrome 浏览器路径（Electron 自动设置） |

### 开发命令

```bash
# Web 开发模式 (Vite + Express)
npm run dev
# 访问 http://localhost:3000

# Electron 开发模式 (Vite + Electron 窗口)
npm run dev:electron

# 类型检查
npm run lint

# 运行测试
npm run test              # 运行全部测试
npm run test:watch        # 监听模式
npm run test:coverage     # 覆盖率报告

# 数据库迁移
npm run migrate:up        # 执行迁移
npm run migrate:down      # 回滚迁移

# 数据验证（Python 爬虫）
npm run validate:data
```

### 构建命令

```bash
# 构建前端 (Vite) + 后端 (esbuild)
npm run build

# 构建 Electron 安装包
npm run build:electron

# 构建 Electron 目录（不打包）
npm run build:electron:dir

# 启动生产模式
npm run start
```

### 爬虫

```bash
# Python 爬虫 - 球队数据
python python/crawler.py                    # 爬取五大联赛
python python/crawler.py --league top10     # 爬取十大联赛
python python/crawler.py --league all       # 爬取全部联赛
python python/crawler.py --resume           # 断点续爬
```

---

## 11. 配置文件说明

| 文件 | 说明 |
|------|------|
| [package.json](file:///d:/下载/足球竞彩量化分析系统/足球竞彩量化分析系统/package.json) | 项目配置、依赖、脚本、Electron 打包配置 |
| [tsconfig.json](file:///d:/下载/足球竞彩量化分析系统/足球竞彩量化分析系统/tsconfig.json) | TypeScript 编译配置（ES2022, bundler 模式） |
| [vite.config.ts](file:///d:/下载/足球竞彩量化分析系统/足球竞彩量化分析系统/vite.config.ts) | Vite 构建配置（React 插件、Tailwind CSS、API 代理、HMR） |
| [vitest.config.ts](file:///d:/下载/足球竞彩量化分析系统/足球竞彩量化分析系统/vitest.config.ts) | Vitest 测试配置（jsdom 环境） |
| [knexfile.cjs](file:///d:/下载/足球竞彩量化分析系统/足球竞彩量化分析系统/knexfile.cjs) | Knex 数据库迁移配置（SQLite） |
| [.env.example](file:///d:/下载/足球竞彩量化分析系统/足球竞彩量化分析系统/.env.example) | 环境变量模板 |
| [.gitignore](file:///d:/下载/足球竞彩量化分析系统/足球竞彩量化分析系统/.gitignore) | Git 忽略规则 |
| [index.html](file:///d:/下载/足球竞彩量化分析系统/足球竞彩量化分析系统/index.html) | HTML 入口 |
| [config/leaguePresets.ts](file:///d:/下载/足球竞彩量化分析系统/足球竞彩量化分析系统/config/leaguePresets.ts) | 联赛预设配置 |
| [config/teamNameMapping.js](file:///d:/下载/足球竞彩量化分析系统/足球竞彩量化分析系统/config/teamNameMapping.js) | 球队名称映射 |
| [python/requirements.txt](file:///d:/下载/足球竞彩量化分析系统/足球竞彩量化分析系统/python/requirements.txt) | Python 依赖 |

---

> **文档维护说明:** 本文档基于项目 v2.7.0 版本生成。当项目结构发生重大变化时，请同步更新本文档。