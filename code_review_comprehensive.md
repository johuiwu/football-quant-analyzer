# 足球竞彩量化分析系统 — 完整代码审查报告（最终版）

> **审查日期：** 2026-06-02  
> **审查范围：** 全项目 150+ 个源代码文件，覆盖前端 React/TypeScript、后端 Node.js/Express、Electron 主进程、爬虫模块、量化模型、数据库层、Python 脚本  
> **审查方法：** 6 个并行安全审计子代理 + 安全最佳实践参考规范交叉验证  
> **技术栈：** React 18 + TypeScript + Vite、Express.js、Electron、Puppeteer、SQLite、Python

---

## 一、执行摘要

系统对 **足球竞彩量化分析系统** 的全部源代码进行了深度安全与质量审查，涵盖安全漏洞、代码质量、逻辑错误、性能问题、可维护性五大维度。

**审查共发现 78 个问题：**

| 严重程度 | 数量 | 占比 |
|----------|------|------|
| 🔴 **严重（Critical）** | **16** | 20.5% |
| 🟠 **高（High）** | **23** | 29.5% |
| 🟡 **中（Medium）** | **27** | 34.6% |
| 🟢 **低（Low）** | **12** | 15.4% |

**与原报告对比：**
- 首次报告（code_review_report.md）已修复 13 项中 6 项严重问题
- 补充报告（code_review_supplement.md）的问题仍大部分存在
- 本轮全新审查发现 **35 项新问题**（首次/补充报告未覆盖的）

**总体评估：** 安全防护层面已有显著改善（helmet、CORS 白名单、rate-limit、IPC 安全均已到位），但 **硬编码凭据问题** 仍未根本解决，**API 认证完全缺失**，**量化模型存在数学和逻辑错误**。建议按优先级分阶段修复。

---

## 二、严重问题（Critical — 16 项）

### 🔴 F-001 | 硬编码爬虫凭据（前端组件）

- **文件：** [src/components/corner/CrawlerControlPanel.tsx](file:///d:/下载/足球竞彩量化分析系统/足球竞彩量化分析系统/src/components/corner/CrawlerControlPanel.tsx#L424)
- **规则：** REACT-CONFIG-001
- **影响：** F12 打开浏览器 DevTools 即可看到真实博彩网站用户名密码
- **代码：**
  ```typescript
  useState({ username: "johui888", password: "aa123123" })
  ```
- **修复：** 移除默认值，改为空字符串；如需开发环境默认值，使用 `import.meta.env.VITE_DEV_USERNAME` 且仅在 `NODE_ENV === 'development'` 时使用

### 🔴 F-002 | 硬编码爬虫凭据（后端服务）

- **文件：** [backend/services/hgCrawlerService.js](file:///d:/下载/足球竞彩量化分析系统/足球竞彩量化分析系统/backend/services/hgCrawlerService.js#L155-L156)
- **影响：** 源码中硬编码真实凭证作为兜底值
- **代码：**
  ```javascript
  const user = credentials && credentials.username ? credentials.username : "johui888";
  const pwd = credentials && credentials.password ? credentials.password : "aa123123";
  ```
- **修复：** 移除硬编码默认值，仅当 `credentials` 有效时使用，否则直接抛出错误

### 🔴 F-003 | 硬编码爬虫凭据（环境变量回退）

- **文件：** [backend/services/cornerCrawler.js](file:///d:/下载/足球竞彩量化分析系统/足球竞彩量化分析系统/backend/services/cornerCrawler.js#L14-L15)
- **影响：** 环境变量未配置时自动使用硬编码凭据
- **代码：**
  ```javascript
  const HG_USERNAME = process.env.HG_USERNAME || "johui888";
  const HG_PASSWORD = process.env.HG_PASSWORD || "aa123123";
  ```
- **修复：** 移除 `||` 回退默认值，未配置时直接报错

### 🔴 F-004 | 第三方 API Key 硬编码

- **文件：** [backend/routes/fixtureRoutes.js](file:///d:/下载/足球竞彩量化分析系统/足球竞彩量化分析系统/backend/routes/fixtureRoutes.js#L6)
- **影响：** football-data.org API Key 硬编码在源码中，可被窃取滥用
- **代码：**
  ```javascript
  const DEFAULT_API_KEY = 'cd445103336e441f8d45a9320e1d3fcd';
  ```
- **修复：** 移入环境变量 `process.env.FOOTBALL_DATA_API_KEY`

### 🔴 F-005 | 明文密码持久化到 localStorage

- **文件：** [src/store/cornerStore.ts](file:///d:/下载/足球竞彩量化分析系统/足球竞彩量化分析系统/src/store/cornerStore.ts#L206-L382)
- **规则：** REACT-AUTH-001 / JS-STORAGE-001
- **影响：** `persist` 中间件将 `accountConfig`（含 `password`）和 `settings`（含 `hgPassword`）序列化存入 localStorage，XSS 攻击可直接窃取
- **修复：** 使用 `partialize` 过滤掉 `password` 和 `hgPassword` 字段

### 🔴 F-006 | API Key 明文存储 localStorage

- **文件：** [src/components/ApiKeySettings.tsx](file:///d:/下载/足球竞彩量化分析系统/足球竞彩量化分析系统/src/components/ApiKeySettings.tsx#L34)、[src/components/DeepSeekKeyModal.tsx](file:///d:/下载/足球竞彩量化分析系统/足球竞彩量化分析系统/src/components/DeepSeekKeyModal.tsx#L39)、[src/pages/DashboardPage.tsx](file:///d:/下载/足球竞彩量化分析系统/足球竞彩量化分析系统/src/pages/DashboardPage.tsx#L1483)
- **规则：** REACT-CONFIG-001 / REACT-AUTH-001
- **影响：** DeepSeek API Key 和 Football API Key 明文存储在浏览器 localStorage 中
- **修复：** 使用 `sessionStorage` 替代，或使用后端代理转发 API 请求

### 🔴 F-007 | 亚洲盘口解析严重 Bug

- **文件：** [backend/services/cornerCrawler.js](file:///d:/下载/足球竞彩量化分析系统/足球竞彩量化分析系统/backend/services/cornerCrawler.js#L831-L832)
- **影响：** 所有亚洲盘口解析全错
- **代码：**
  ```javascript
  const vals = parts.map(p => parseFloat(p)).filter(v => isNaN(v));
  // filter(v => isNaN(v)) 过滤出的是 NaN 值！正确应为 filter(v => !isNaN(v))
  ```
- **修复：** 改为 `.filter(v => !isNaN(v))`

### 🔴 F-008 | 阶乘溢出导致 NaN（k > 170）

- **文件：** [src/models/poisson.ts](file:///d:/下载/足球竞彩量化分析系统/足球竞彩量化分析系统/src/models/poisson.ts#L6-L8)
- **影响：** k > 170 时 `Math.pow(lambda, k)` 返回 `Infinity`，`factorial` 也溢出，结果为 `NaN` 或 `Infinity`
- **修复：** 使用递推公式 $P(k) = P(k-1) \times \lambda / k$，配合 $\exp(-\lambda)$ 初始化

### 🔴 F-009 | quantModel.ts 文件过大（2908 行）

- **文件：** [src/utils/quantModel.ts](file:///d:/下载/足球竞彩量化分析系统/足球竞彩量化分析系统/src/utils/quantModel.ts)
- **影响：** 包含预测模型、贝叶斯更新、盘口特征、德比检测、凯利公式、融合算法等 10+ 个功能模块，维护和调试极其困难
- **修复：** 拆分为独立模块：`predictionModel.ts`、`asianFeatures.ts`、`derbyDetection.ts`、`dynamicWeights.ts`、`marketFusion.ts` 等

### 🔴 F-010 | quantModel.ts 类型依赖缺失

- **文件：** [src/utils/quantModel.ts](file:///d:/下载/足球竞彩量化分析系统/足球竞彩量化分析系统/src/utils/quantModel.ts#L520)
- **影响：** `BetsModelInput` 在第 520 行使用，但第 2361 行才定义（定义在使用之后），可能导致编译时类型解析问题
- **修复：** 将类型定义移至文件顶部

### 🔴 F-011 | parseInt 无边界校验（所有 controller）

- **文件：** [backend/controllers/playerController.js](file:///d:/下载/足球竞彩量化分析系统/足球竞彩量化分析系统/backend/controllers/playerController.js#L5-L6)、[backend/controllers/matchController.js](file:///d:/下载/足球竞彩量化分析系统/足球竞彩量化分析系统/backend/controllers/matchController.js#L6-L7)、[backend/controllers/teamController.js](file:///d:/下载/足球竞彩量化分析系统/足球竞彩量化分析系统/backend/controllers/teamController.js#L176)
- **影响：** 传入 `page=-1` 导致 `offset = -2*limit`（负数 SQL），`page=0` 同理，`limit=0` 导致 `Math.ceil(total/0) = Infinity`
- **修复：**
  ```javascript
  const page = Math.max(1, parseInt(req.query.page) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20));
  ```
  对 `teamController.js:176` 的 `parseInt(id)` 添加 `isNaN` 检查

### 🔴 F-012 | CornerHistoryChart 投注 Tab 渲染错误

- **文件：** [src/components/corner/CornerHistoryChart.tsx](file:///d:/下载/足球竞彩量化分析系统/足球竞彩量化分析系统/src/components/corner/CornerHistoryChart.tsx#L316)
- **影响：** 当 `subTab === "bets"` 时渲染的是触发历史（`renderTriggerTab`）而非投注记录，用户永远看不到投注数据
- **代码：**
  ```typescript
  {subTab === "simulation" ? renderSimulationTab() : renderTriggerTab()}
  // 缺少对 "bets" 的判断分支
  ```
- **修复：** 改为三元嵌套：`subTab === "simulation" ? renderSimulationTab() : subTab === "bets" ? renderBetsTab() : renderTriggerTab()`

### 🔴 F-013 | CrawlerControlPanel 重复 setLoginStatus 调用

- **文件：** [src/components/corner/CrawlerControlPanel.tsx](file:///d:/下载/足球竞彩量化分析系统/足球竞彩量化分析系统/src/components/corner/CrawlerControlPanel.tsx#L546)
- **影响：** 连续两次调用 `setLoginStatus(true, credentials.username)`，明显的复制粘贴错误
- **修复：** 删除重复行

### 🔴 F-014 | DashboardPage 非空断言崩溃风险

- **文件：** [src/pages/DashboardPage.tsx](file:///d:/下载/足球竞彩量化分析系统/足球竞彩量化分析系统/src/pages/DashboardPage.tsx#L1551)
- **影响：** `results!` 非空断言，`results` 可能为 `null` 导致运行时崩溃
- **代码：**
  ```typescript
  onSaved: () => rawFetchAiAnalysis(home?.id || '', away?.id || '', odds, results!)
  ```
- **修复：** 添加 `if (!results) return;` 守卫

### 🔴 F-015 | 双数据库连接实例

- **文件：** [database/db.ts](file:///d:/下载/足球竞彩量化分析系统/足球竞彩量化分析系统/database/db.ts) + [backend/dbService.js](file:///d:/下载/足球竞彩量化分析系统/足球竞彩量化分析系统/backend/dbService.js)
- **影响：** 两个模块各自打开 `football_data.db`，使用不同库（`sqlite` vs `sqlite3`），PRAGMA 设置不一致，存在锁冲突和事务不一致风险
- **修复：** 统一为单一数据库连接管理模块

### 🔴 F-016 | backend/index.js 无安全防护的第二 Express 实例

- **文件：** [backend/index.js](file:///d:/下载/足球竞彩量化分析系统/足球竞彩量化分析系统/backend/index.js)
- **影响：** 与 `server.ts` 功能重叠但完全无安全防护（无 helmet、无 rate-limit、无 CORS 限制），若被意外执行将暴露严重漏洞
- **修复：** 删除此文件

---

## 三、高优先级问题（High — 23 项）

### 安全类（7 项）

| ID | 文件 | 行号 | 问题 |
|----|------|------|------|
| **F-017** | `backend/routes/` 全部路由 | — | **API 路由全无身份认证**，任意客户端可调用所有数据修改/敏感接口 |
| **F-018** | `src/components/DeepSeekKeyModal.tsx` | 170 | **误导性声明**：提示"Key 仅保存在本地浏览器…不会上传至第三方"，但实际会发送到后端 |
| **F-019** | `server.ts` | 139 | **服务器绑定 `0.0.0.0`**：Electron 桌面应用将 API 暴露给局域网所有设备 |
| **F-020** | `backend/routes/fixtureRoutes.js` | 19-24 | **状态泄露端点**：`/api-key-status` 返回 `{ hasCustomKey, usingDefault }`，可被攻击者探测 |
| **F-021** | `backend/routes/featureRoutes.js` | 101-113 | **缓存清除无认证**：`POST /api/features/cache/clear` 任何人可调用 |
| **F-022** | `electron/main.cjs` | 127 | **端口号硬编码为 3000**，与 `server.ts` 环境变量不一致 |
| **F-023** | `electron/main.cjs` | 35 | **Chrome 路径硬编码**：仅兼容 Windows x64，其他平台静默失败 |

### 逻辑错误类（7 项）

| ID | 文件 | 行号 | 问题 |
|----|------|------|------|
| **F-024** | `backend/routes/fixtureRoutes.js` | 71 | **条件逻辑反转**：`if (!currentAPIKey)` 因 `DEFAULT_API_KEY` 为非空永不执行，回退逻辑死代码 |
| **F-025** | `backend/services/featureService.js` | 4-6 | **缓存键一致性**：`getCacheKey` 接收 `matches` 参数但缓存查询时未使用，不同参数结果互相覆盖 |
| **F-026** | `backend/services/normalizationService.js` | 65 | **原地排序修改源数组**：`values.sort()` 会修改上游 `featureVectors` 数据 |
| **F-027** | `backend/services/poissonPredictor.js` | 155-189 | **无收敛检测**：梯度下降固定 100 次迭代，即使已收敛也继续 |
| **F-028** | `src/models/elo.ts` vs `src/utils/quantModel.ts` | 40 / 829 | **主场 Elo 加成不一致**：elo.ts 用 `+100`，quantModel.ts 用 `+95`，系统性偏差 |
| **F-029** | `src/models/heatIndex.ts` | 109-110 | **Z-Score 逻辑歧义**：`historicalMean/2` 假设主客投注各半，但实际不对称 |
| **F-030** | `src/hooks/useTeamDataSync.ts` | 51 | **函数参数缺失**：`syncStandings()` 无参调用，但 `apiService.ts` 定义为 `syncStandings(league: string)`，编译/运行时错误 |

### 代码质量类（5 项）

| ID | 文件 | 行号 | 问题 |
|----|------|------|------|
| **F-031** | `src/store/cornerStore.ts` | 202 | **模块级可变状态**：`monitorInterval` 是模块作用域变量，导致竞态条件 |
| **F-032** | `src/store/cornerStore.ts` | 311-321 | **`startMonitor` 不防重入**：重复调用创建多个定时器叠加运行 |
| **F-033** | `src/utils/quantModel.ts` | 485-502 | **`createDefaultTeam()` 缺少必需字段**：返回对象缺少 `TeamStats` 多个字段，仅靠 `??` 兜底 |
| **F-034** | `src/utils/quantModel.ts` | 739-742 | **缓存可变引用泄漏**：直接返回缓存对象，调用方修改嵌套属性会污染缓存 |
| **F-035** | `backend/routes/syncRoutes.js` | 2-5 | **后端 JS import TS 文件**：`import { REAL_TEAMS } from '../../src/data/realTeamsData.ts'`，部署环境可能失败 |

### 虚假数据类（4 项）

| ID | 文件 | 行号 | 问题 |
|----|------|------|------|
| **F-036** | `backend/services/featureService.js` | 多处 | **伪特征**：keyPasses = avgGF × 3、shotConversion = min(0.25, avgGF/10) 等 9 个特征均为估算值 |
| **F-037** | `src/hooks/useRiskAlerts.ts` | 43-59 | **Mock 冒充真实功能**：WebSocket 用 `setInterval + Math.random()` 模拟，但命名和状态误导调用方 |
| **F-038** | `backend/services/crawlerHelper.js` | 100-123 | **虚假模拟数据**：`fetchCornerOdds` 返回基于 hash 的伪随机数据，调用方可能误认为真实数据 |
| **F-039** | `backend/services/cornerStrategyEngine.js` | 29-41 | **完全虚构的回测**：随机队名+随机时间+固定胜率，不基于任何真实数据 |

---

## 四、中优先级问题（Medium — 27 项）

### 安全与数据泄露（5 项）

| ID | 文件 | 行号 | 问题 |
|----|------|------|------|
| F-040 | `server.ts` | 101 | 错误详情在开发模式下泄露 `err.message` |
| F-041 | `server.ts` | 72 | CORS 无 Origin 头时放行所有请求 |
| F-042 | `server.ts` | 87-93 | CORS 错误处理中间件为死代码（never called） |
| F-043 | `backend/services/cacheService.js` | 44-49 | `getStats()` 暴露所有缓存 key |
| F-044 | `src/components/ApiKeySettings.tsx` | 42 | 错误日志可能泄露 API Key 内容 |

### 性能与资源（5 项）

| ID | 文件 | 行号 | 问题 |
|----|------|------|------|
| F-045 | `backend/services/cacheService.js` | 3-4 | `Map` 缓存无大小上限，无主动过期清理，潜在内存泄漏 |
| F-046 | `backend/services/cornerCrawler.js` | 25-26 | `capturedResponses` 数组无上限，无限增长 |
| F-047 | `backend/services/cornerStrategyEngine.js` | 101-119 | 回测串行 await，效率低 |
| F-048 | `backend/controllers/playerController.js` | 141-178 | N+1 查询：每个球员两个独立查询 |
| F-049 | `electron/main.cjs` | 88-95 | Vite 健康检查无限 `setInterval`，无最大重试次数 |

### 逻辑与健壮性（10 项）

| ID | 文件 | 行号 | 问题 |
|----|------|------|------|
| F-050 | `src/services/ValidationService.ts` | 7-35 | 验证逻辑完全依赖中文关键词匹配，AI 措辞变化即失效 |
| F-051 | `src/hooks/useAIAnalysis.ts` | 42-43 | 通过字符串匹配判断 API Key 状态，脆弱 |
| F-052 | `src/hooks/useOddsCalculation.ts` | 12-13 | `goalsLine` 和 `returnRate` 有 setter 但从未被计算更新 |
| F-053 | `src/hooks/useFixtureSync.ts` | 19-28 | `loadRealTimeFixtures` 名为"实时"但仅拷贝本地数组 |
| F-054 | `backend/services/cornerService.js` | 14 | `leadGoals: 20` 作为魔法哨兵值，极易误解 |
| F-055 | `backend/services/cornerService.js` | 585-605 | `getSimulationRecords` 查询了错误的表 |
| F-056 | `backend/services/strengthService.js` | 66 | `normalize(features.ppda, 12, 7)` min>max，靠"bug"实现正确结果 |
| F-057 | `backend/services/poissonPredictor.js` | 168-169 | 梯度计算形式不符合泊松回归标准梯度下降 |
| F-058 | `src/utils/oddsCalculator.ts` | 69-74 | 返还率调整阈值 0.001 过敏感，浮点误差可触发 |
| F-059 | `src/utils/quantModel.ts` | 739-742 | 缓存并发竞争条件（check-then-set 非原子） |

### 类型安全（5 项）

| ID | 文件 | 行号 | 问题 |
|----|------|------|------|
| F-060 | `src/components/corner/CrawlerControlPanel.tsx` | 394, 400, 629 | `any` 类型滥用（rawElements、allElements、match） |
| F-061 | `src/components/corner/LiveMonitor.tsx` | 25, 33, 34, 37, 105, 222, 240 | 7 处 `any` 类型 |
| F-062 | `src/store/useAppStore.ts` | 59, 66, 71, 98, 104 | `teamsPageTeamStats`、`fixtures` 等使用 `any` |
| F-063 | `src/services/apiService.ts` | 17, 78, 87, 96 | 所有 API 函数返回 `Promise<any>` |
| F-064 | `src/store/cornerStore.ts` | 90, 110, 111, 299, 338, 361 | 多处 `any` 类型 |

### 代码健康（2 项）

| ID | 文件 | 行号 | 问题 |
|----|------|------|------|
| F-065 | `backend/services/cornerService.js` | 59-100 vs 155-196 | `startCornerBackendPolling` 和 `resumeCornerBackendPolling` 有 30 行重复代码 |
| F-066 | `src/components/corner/CrawlerControlPanel.tsx` | 7-336 | 300+ 行翻译表内联在组件中 |

---

## 五、低优先级问题（Low — 12 项）

| ID | 文件 | 行号 | 问题 |
|----|------|------|------|
| F-067 | `backend/services/hgCrawlerService.js` | 多处 | 大量空 catch 块静默吞错误 |
| F-068 | `backend/services/cornerCrawler.js` | 71, 75 | console.log 泄露余额信息 |
| F-069 | `backend/services/cornerCrawler.js` | 684-685 | `removeAllListeners` 可能破坏 browserPool 内部监听器 |
| F-070 | `backend/services/cornerCrawler.js` | 721 | debug 文件无限制创建，可能填满磁盘 |
| F-071 | `src/hooks/useRiskAlerts.ts` | 72 | 无效 `useMemo`：`useMemo(() => alerts, [alerts])` 无意义 |
| F-072 | `src/store/useAppStore.ts` | 158-159 | 回调函数通过 setter 注入设计模式异常 |
| F-073 | `src/models/poisson.ts` | 31-36 | `poissonRandom` 对大 λ（>30）效率低下 |
| F-074 | `src/utils/quantModel.ts` | 158 | `parseFloat(String(AG.total))` 无意义转换 |
| F-075 | `server.ts` | 185-186 | 通过 `globalThis` 暴露函数给 Electron，反模式 |
| F-076 | `index.html` | — | 标题仍为 "My Google AI Studio App" |
| F-077 | `backend/controllers/teamController.js` | 148-155 | `toFixed(2)` + `parseFloat()` 冗余转换 |
| F-078 | `src/utils/quantModel.ts` | 多处（10+） | 大量魔法数字（0.25、2.0、0.6、8、95、0.15、0.35 等） |

---

## 六、问题分类汇总

| 分类 | 严重 | 高 | 中 | 低 | 合计 |
|------|------|-----|-----|-----|------|
| 安全防护 | 8 | 7 | 6 | 2 | 23 |
| 逻辑错误 | 3 | 7 | 7 | 0 | 17 |
| 代码质量 | 3 | 5 | 7 | 3 | 18 |
| 类型安全 | 0 | 0 | 5 | 0 | 5 |
| 虚假数据 | 0 | 4 | 0 | 0 | 4 |
| 性能 | 0 | 0 | 3 | 2 | 5 |
| 可维护性 | 2 | 0 | 2 | 2 | 6 |
| **合计** | **16** | **23** | **27** | **12** | **78** |

---

## 七、修复优先级路线图

### 第一阶段：立即修复（严重问题 — 16 项，预估 14h）

| 顺序 | ID | 问题 | 预估 |
|------|-----|------|------|
| 1 | F-001~F-003 | 移除所有硬编码爬虫凭据 | 1h |
| 2 | F-004 | 移除硬编码第三方 API Key | 0.5h |
| 3 | F-005 | localStorage 密码持久化过滤 | 0.5h |
| 4 | F-006 | API Key 改为 sessionStorage | 1h |
| 5 | F-007 | 修复亚洲盘口解析 filter Bug | 0.5h |
| 6 | F-008 | 修复 Poisson 阶乘溢出 | 1h |
| 7 | F-011 | 所有 controller parseInt 边界校验 | 1h |
| 8 | F-012 | 修复 CornerHistoryChart 投注 Tab | 0.5h |
| 9 | F-013 | 删除重复 setLoginStatus 调用 | 0.25h |
| 10 | F-014 | 修复 DashboardPage results! 崩溃 | 0.25h |
| 11 | F-016 | 删除 backend/index.js | 0.25h |
| 12 | F-009 | 拆分 quantModel.ts（可分步） | 4h |
| 13 | F-010 | 修复 quantModel 类型依赖 | 1h |
| 14 | F-015 | 统一数据库连接 | 2h |

### 第二阶段：尽快修复（高优先级 — 23 项，预估 15h）

| 顺序 | 分类 | 问题数 | 预估 |
|------|------|--------|------|
| 15 | 安全（F-017~F-023） | 7 项 | 6h |
| 16 | 逻辑错误（F-024~F-030） | 7 项 | 5h |
| 17 | 代码质量（F-031~F-035） | 5 项 | 2h |
| 18 | 虚假数据标注（F-036~F-039） | 4 项 | 2h |

### 第三阶段：计划修复（中优先级 — 27 项，预估 10h）

### 第四阶段：持续改进（低优先级 — 12 项，预估 5h）

---

## 八、已修复验证（与首次报告对比）

以下问题已在上次修复中解决：

| 编号 | 问题 | 状态 |
|------|------|------|
| C-001 | 硬编码管理员凭证 | ✅ 已修复 |
| C-002 | CORS 全开放 | ✅ 已修复 |
| C-003 | 请求体大小限制 | ✅ 已修复 |
| C-004 | 速率限制 | ✅ 已修复 |
| C-005 | SQL 注入（cornerRoutes） | ✅ 已修复 |
| C-006 | IPC 无访问控制 | ✅ 已修复 |
| C-007 | 错误信息泄露 | ✅ 已修复 |
| H-001 | Helmet 安全头 | ✅ 已修复 |
| H-004 | Electron 安全配置 | ✅ 已修复 |
| H-006 | CSP 策略 | ✅ 已修复 |
| H-007 | 敏感状态持久化 | ✅ 已修复 |
| H-008 | 输入验证中间件 | ✅ 已修复 |
| H-009 | Corner 表迁移 | ✅ 已修复 |
| `_harden_routes.py` | 补丁脚本残留 | ✅ 已删除 |
| `_patch_api.py` | 补丁脚本残留 | ✅ 已删除 |

---

## 九、总体评估结论

### 项目亮点

1. **安全基线已大幅改善**：helmet、CORS 白名单、rate-limit、IPC 安全、CSP、输入验证中间件均已到位
2. **架构清晰**：前后端分离，目录结构合理，Zustand 独立 store 管理状态
3. **测试覆盖初具规模**：`src/__tests__/` 和 `src/models/__tests__/` 中存在测试文件
4. **爬虫实现专业**：Puppeteer-extra + Stealth Plugin + browserPool 管理
5. **数据模型丰富**：Poisson、贝叶斯、Elo、xG、热力指数、赔率等多维度量化模型

### 核心风险

1. **硬编码凭据**（F-001~F-004）：5 处明文凭据分布在 3 个文件中，是最高优先级安全问题
2. **API 认证缺失**（F-017）：所有 `/api/*` 路由无认证保护
3. **量化模型 Bug**（F-007、F-008）：亚洲盘口解析全错 + 阶乘溢出
4. **双数据库冲突**（F-015）：两个连接实例可能产生锁冲突和数据不一致
5. **劣质假数据**（F-036~F-039）：特征工程、风险预警、回测引擎大量使用估算/模拟数据

### 建议

**强烈建议在对外部署前完成第一阶段全部 16 项严重问题修复。** 第二阶段（23 项高优先级）建议在正式使用前完成。当前代码在本地开发环境下可正常运行，但存在安全风险和数据准确性隐患。

---

*报告由 6 个并行安全审计子代理生成，覆盖 150+ 源文件，基于 OWASP 安全规范、React 安全最佳实践和 Node.js/Express 安全指南交叉验证。*