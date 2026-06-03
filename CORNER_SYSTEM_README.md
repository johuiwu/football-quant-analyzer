# 黄瓜角球系统 - 集成版

## 📋 项目概述

本项目将原有的「黄瓜角球」系统完全集成到主项目中，使用 Puppeteer 进行爬虫和自动化操作。

## 🛠 技术栈

- **前端**: React 19 + TypeScript + Vite
- **状态管理**: Zustand (localStorage 持久化)
- **爬虫**: Puppeteer + puppeteer-extra-plugin-stealth
- **桌面**: Electron (待集成)
- **设计**: Tailwind CSS

## 📁 新增文件

```
src/
├── crawler/
│   ├── hgCrawler.ts           # HG 网站爬虫核心
│   ├── qiumiwuCrawler.ts      # (原有的) 球屋爬虫
│   └── testHgCrawler.ts       # 测试脚本
├── store/
│   └── cornerStore.ts         # 角球系统状态管理
└── (前端组件待完善)

文档/
└── CORNER_SYSTEM_README.md    # 本文档
```

## 🚀 快速开始

### 1. 环境准备

确保已安装项目依赖：

```bash
npm install
```

### 2. 测试爬虫

**首次使用建议先运行测试脚本查看是否能正常工作：**

```bash
# 启用调试模式（可见浏览器）
$env:CRAWLER_DEBUG="1"

# 运行测试脚本
npx tsx src/crawler/testHgCrawler.ts
```

### 3. 使用说明

#### 配置账户

1. 进入应用 → 角球系统
2. 配置你的 HG 网站账户
3. 点击登录
4. 启用监控

#### 策略配置

策略参数完全继承自黄瓜角球系统：

| 参数名 | 说明 | 默认值 |
|-------|------|--------|
| `playTimeStart` | 开始时间（分钟） | 35 |
| `playTimeEnd` | 结束时间（分钟） | 55 |
| `leadGoals` | 领先球数条件 | 20 |
| `cornerHandicapLower` | 盘口下限 | -1.25 |
| `cornerHandicapUpper` | 盘口上限 | 3.5 |
| `targetOdds` | 目标赔率 | 0.8 |

## 🔧 爬虫功能说明

### hgCrawler.ts 主要功能

```typescript
// 登录
loginToHG(credentials: HGCredentials): Promise<boolean>

// 获取角球数据
fetchCornerMatches(): Promise<CornerMatch[]>

// 投注
placeBet(bet: BetPlacement): Promise<{ success: boolean; betId?: string }>
```

### 角球数据结构

```typescript
interface CornerMatch {
  matchId: string;              // 比赛ID
  league: string;              // 联赛
  homeTeam: string;            // 主队
  awayTeam: string;            // 客队
  currentMinute: number;       // 当前时间
  homeCorners: number;         // 主队角球
  awayCorners: number;         // 客队角球
  cornerHandicap: number;      // 盘口
  odds: number;                // 赔率
}
```

## 📊 系统流程

```
1. 用户登录
   ↓
2. 点击「开始监控」
   ↓
3. 每5秒刷新数据
   ├─ 访问 HG 网站
   ├─ 切换到角球标签
   └─ 提取比赛数据
   ↓
4. 策略评估
   ├─ 检查时间窗口
   ├─ 检查盘口范围
   ├─ 检查赔率要求
   └─ 触发对应策略
   ↓
5. 显示监控日志
```

## ⚠️ 注意事项

### 开发阶段

- 当前爬虫使用模拟数据（便于开发）
- 实际数据提取需要完善选择器逻辑
- 投注功能需要进一步调试

### 调试模式

设置环境变量可以开启浏览器可见模式：

```bash
$env:CRAWLER_DEBUG="1"
npm run dev
```

### 安全提醒

⚠️ 请妥善保管账户密码！
⚠️ 投注有风险，请谨慎使用！
⚠️ 请遵守 HG 网站相关规则！

## 📝 更新记录

### 2026-06-01
- ✅ 创建爬虫核心 hgCrawler.ts
- ✅ 登录功能（基于你提供的截图）
- ✅ 角球数据获取框架
- ✅ 更新 cornerStore.ts 集成爬虫
- ✅ 策略评估逻辑
- ✅ 创建测试脚本
- ✅ 创建项目文档

## 🔮 后续计划

1. **完善数据提取**
   - 根据实际页面更新选择器
   - 完善角球、盘口、赔率的提取

2. **前端组件**
   - 账户配置页面
   - 实时监控面板
   - 策略配置界面
   - 日志展示

3. **投注功能**
   - 完善 placeBet 逻辑
   - 添加确认机制
   - 记录投注历史

4. **持久化**
   - 使用 SQLite 保存数据
   - 历史数据分析

## 📚 参考

- 原系统配置: `黄瓜角球/HgCeApp.ini`
- 文档文件: `.trae/documents/`
- 主项目: 足球竞彩量化分析系统

---

## 🚀 下一步

你需要做的：

1. **运行测试** - 执行 `npx tsx src/crawler/testHgCrawler.ts`
2. **提供更多页面结构** - 当你在角球页面时，复制 Elements 标签的 HTML
3. **测试登录** - 尝试能否成功登录
4. **反馈问题** - 遇到的错误或需要调整的地方

准备好后我们继续完善！
