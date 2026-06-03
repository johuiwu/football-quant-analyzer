# App.tsx 安全拆分计划

## 1. 现状分析

**App.tsx 大小**: 2427 行，~153KB  
**核心函数**: `AppContent` 组件（2417行），`App` 包装组件（最后10行）  
**状态变量**: 约 20 个 useState + 5 个 useMemo + 3 个 useEffect + 7 个事件回调

**上下文依赖**:
- `TeamContext` → `state`, `dispatch`, `resetAll`, `switchTab`
- `LiveMatchContext` → `liveMatchState`, `liveMatchDispatch`

**自定义 Hooks**:
- `useFixtureSync` → fixtures/loading/sync
- `useTeamDataSync` → teams/loading/sync
- `useAIAnalysis` → analysis/loading/validation
- `useRiskAlerts` → alerts/wsConnected

---

## 2. 拆分策略

### 核心原则
1. **创建 AppNew.tsx** — 从 App.tsx 原样复制 AppContent 内容作为起点
2. **每次提取一个组件** — 从 AppNew.tsx 中移除对应 JSX 块，创建独立组件文件
3. **共享状态留在 AppNew.tsx** — 通过 props 传递给子组件，而不是移动到子组件内部
4. **零侵入** — 不修改 App.tsx 的任何代码
5. **最终** — AppNew.tsx 替换 AppContent

### 状态归属决策矩阵

| 状态变量 | 使用范围 | 归属决策 |
|----------|----------|----------|
| `activeStandingsLeague` | 仅在 StandingsTab 中使用 | ✅ 移动到 StandingsTab 内部 |
| `selectedFixtureId` | 多个位置使用 | ❌ 留在 AppNew |
| `asianHandicap`/`goalsLine`/`returnRate` | 多个位置使用 | ❌ 留在 AppNew |
| `isStatsCustomized`/`customStats` | 多个位置使用 | ❌ 留在 AppNew |
| `customWeights`/`useCustomWeights` | 权重面板 + handleRecalculate | ❌ 留在 AppNew |
| `advancedParams` | 高级参数面板 + handleRecalculate | ❌ 留在 AppNew |
| `results`/`calculationError` | 多个结果面板使用 | ❌ 留在 AppNew |
| `accordionStates` | 仅在 AppNew 内部 | ❌ 留在 AppNew |

---

## 3. 提取的5个组件

### 组件清单

| # | 组件名 | 行号范围 | 职责 | 从 AppNew 传入的 Props | 内部状态 |
|---|--------|----------|------|------------------------|----------|
| 1 | **PageHeader** | L492-578 | 顶部免责声明 + 软件头部 + 选项卡导航 | `activeTab`, `switchTab` | 无 |
| 2 | **StandingsTab** | L2149-2322 | 联赛积分排行榜 | `teams`, `isTeamsLoading`, `teamsSyncMsg`, `teamsSyncSource`, `loadRealTimeStandings` | `activeStandingsLeague` |
| 3 | **PythonExportTab** | L2331-2388 | Python EXE 导出面板 | `handleExportPython` | 无 |
| 4 | **AdvancedParamsPanel** | L1057-1274 | 伤停疲劳 + 机构资金流 + 参数异常警告 | `advancedParams`, `setAdvancedParams`, `showParamWarning`, `setShowParamWarning`, `customWeights`, `handleRecalculate` | 无 |
| 5 | **ModelWeightsPanel** | L1276-1427 | 模型权重微调面板 | `customWeights`, `setCustomWeights`, `useSystemWeights`, `setUseSystemWeights`, `useCustomWeights`, `setUseCustomWeights`, `advancedParams`, `checkAbnormalParams`, `handleRecalculate`, `showParamWarning`, `setShowParamWarning` | 无 |

---

## 4. 每个组件的详细代码

### 4.1 PageHeader

```
新文件: src/components/PageHeader.tsx
```

**Props**:
```typescript
interface PageHeaderProps {
  activeTab: string;
  switchTab: (tab: string) => void;
}
```

**注意**: 
- 从 AppNew.tsx 复制所有 className，`lucide-react` 的 import（AlertTriangle, Calculator），Tailwind 样式
- `switchTab` 直接从 TeamContext 的助手函数获取
- 不包含任何内部状态

### 4.2 StandingsTab

```
新文件: src/components/StandingsTab.tsx
```

**Props**:
```typescript
interface StandingsTabProps {
  teams: TeamStats[];
  isTeamsLoading: boolean;
  teamsSyncMsg: string;
  teamsSyncSource: string;
  loadRealTimeStandings: () => void;
}
```

**内部状态**: `activeStandingsLeague` (useState)
- 完全自包含，仅在此组件内部使用

**依赖**:
- `realTeamsData` → `LEAGUES`（需要导入）
- `lucide-react` → `RefreshCw`
- TeamStats 类型

### 4.3 PythonExportTab

```
新文件: src/components/PythonExportTab.tsx
```

**Props**:
```typescript
interface PythonExportTabProps {
  handleExportPython: () => Promise<void>;
}
```

**依赖**:
- `lucide-react` → `FileCode`, `Download`, `Info`
- 简单静态展示面板 + 下载按钮

### 4.4 AdvancedParamsPanel

```
新文件: src/components/AdvancedParamsPanel.tsx
```

**Props**:
```typescript
interface AdvancedParamsPanelProps {
  advancedParams: AdvancedParams;
  setAdvancedParams: React.Dispatch<React.SetStateAction<AdvancedParams>>;
  showParamWarning: boolean;
  setShowParamWarning: React.Dispatch<React.SetStateAction<boolean>>;
  customWeights: ModelWeights;
  handleRecalculate: () => void;
}
```

**注意**: 
- 复制所有如下事件处理逻辑：
  - 疲劳度滑块 → `setAdvancedParams({ ...advancedParams, homeFatigue: v })` + `checkAbnormalParams`
  - 受伤率滑块 → 同上
  - 水位趋势选择器
  - 投注量滑块 → 联动计算（主/平/客三者之和=100）
- `checkAbnormalParams` 函数在 AppNew 中，需要通过 props 或 import 传入
- 警告横幅中的 "重置默认" 按钮逻辑保持原样

**关于 checkAbnormalParams**: 此函数在 AppNew 中定义并使用 `ValidationService`。可以让 AdvancedParamsPanel 内部直接 import 并使用 `ValidationService`，或者将 `setAdvancedParams` 的调用直接委托给父组件。

**最佳方案**: 组件内部直接 import `ValidationService`，保持与 App.tsx 相同的调用模式。`checkAbnormalParams` 可内联实现，也可以在父组件中保留并通过 prop 传入。

### 4.5 ModelWeightsPanel

```
新文件: src/components/ModelWeightsPanel.tsx
```

**Props**:
```typescript
interface ModelWeightsPanelProps {
  customWeights: ModelWeights;
  setCustomWeights: React.Dispatch<React.SetStateAction<ModelWeights>>;
  useSystemWeights: boolean;
  setUseSystemWeights: React.Dispatch<React.SetStateAction<boolean>>;
  useCustomWeights: boolean;
  setUseCustomWeights: React.Dispatch<React.SetStateAction<boolean>>;
  advancedParams: AdvancedParams;
  checkAbnormalParams: (params: AdvancedParams, weights?: ModelWeights) => void;
  handleRecalculate: () => void;
  showParamWarning: boolean;
  setShowParamWarning: React.Dispatch<React.SetStateAction<boolean>>;
}
```

**注意**: 
- 复制所有滑块和切换逻辑
- "系统优化权重" 和 "自定义权重" 之间的切换逻辑保持不变
- "重置回系统权重" 按钮逻辑保持不变
- `lucide-react` → `Scale`

---

## 5. 验证步骤

### 5.1 提取后 AppNew.tsx 的结构

```typescript
function AppNewContent() {
  // ... 所有 useState, useEffect, useMemo, useCallback, refs 保持不变 ...
  // ... 所有 hooks 保持不变 ...

  return (
    <div className="min-h-screen ...">
      {/* 1. PageHeader — 已提取 */}
      <PageHeader activeTab={state.activeTab} switchTab={switchTab} />

      <main>
        {state.activeTab === 'dashboard' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <div className="lg:col-span-4 flex flex-col gap-6">
              {/* 比赛选择面板 - 仍留在 AppNew */}
              
              {/* 状态微调 - 仍留在 AppNew（条件渲染） */}
              
              {/* 4. AdvancedParamsPanel — 已提取 */}
              <AdvancedParamsPanel
                advancedParams={advancedParams}
                setAdvancedParams={setAdvancedParams}
                showParamWarning={showParamWarning}
                setShowParamWarning={setShowParamWarning}
                customWeights={customWeights}
                handleRecalculate={handleRecalculate}
              />

              {/* 5. ModelWeightsPanel — 已提取 */}
              <ModelWeightsPanel
                customWeights={customWeights}
                setCustomWeights={setCustomWeights}
                useSystemWeights={useSystemWeights}
                setUseSystemWeights={setUseSystemWeights}
                useCustomWeights={useCustomWeights}
                setUseCustomWeights={setUseCustomWeights}
                advancedParams={advancedParams}
                checkAbnormalParams={checkAbnormalParams}
                handleRecalculate={handleRecalculate}
                showParamWarning={showParamWarning}
                setShowParamWarning={setShowParamWarning}
              />
            </div>

            <div className="lg:col-span-8">
              {/* 所有结果面板 - 仍留在 AppNew */}
            </div>
          </div>
        )}

        {/* 2. StandingsTab — 已提取 */}
        {state.activeTab === 'standings' && (
          <StandingsTab
            teams={teams}
            isTeamsLoading={isTeamsLoading}
            teamsSyncMsg={teamsSyncMsg}
            teamsSyncSource={teamsSyncSource}
            loadRealTimeStandings={loadRealTimeStandings}
          />
        )}

        {state.activeTab === 'worldcup' && <WorldCupDashboard />}

        {/* 3. PythonExportTab — 已提取 */}
        {state.activeTab === 'python' && (
          <PythonExportTab handleExportPython={handleExportPython} />
        )}

        {state.activeTab === 'teams' && (
          <ErrorBoundary><TeamInfoSection teams={teams} /></ErrorBoundary>
        )}
      </main>

      {/* footer - 仍留在 AppNew */}
    </div>
  );
}
```

### 5.2 更新 App.tsx

```typescript
// 在 App.tsx 底部，将 <AppContent /> 替换为 <AppNewContent />
// 实际上 AppNew 中包含 AppNewContent，由 AppNew 导出
```

### 5.3 验证清单
- [ ] `npm run dev` 启动无错误
- [ ] 控制台无警告
- [ ] UI 布局与原始一致
- [ ] 选项卡切换正常
- [ ] 球队选择正常
- [ ] 计算按钮有效
- [ ] 权重滑块正常
- [ ] 积分排行榜正常
- [ ] Python 导出正常
- [ ] 风险警报 WebSocket 正常
- [ ] 贝叶斯实时监控正常

---

## 6. 风险与应对

| 风险 | 可能性 | 应对策略 |
|------|--------|----------|
| import 缺失导致编译错误 | 中 | 每个组件提取后立即运行 `npm run dev` 验证 |
| 样式差异 | 低 | 精确复制所有 className，不使用新的样式 |
| Props 类型不匹配 | 中 | 使用完整的 TypeScript 接口定义 props |
| 事件监听失效 | 低 | 确保 useEffect 中的事件监听（如 WebSocket）没有被遗漏 |
| Context 数据流中断 | 低 | 确保 AppNewContent 仍在 TeamProvider/LiveMatchProvider 内 |
| 依赖数组错误 | 低 | useEffect/useMemo 的 deps 数组不允许任何修改 |

---

## 7. 实施步骤

```
Step 1: 创建 AppNew.tsx (完整复制 AppContent)
  → 验证: npm run dev 启动正常

Step 2: 提取 PageHeader → src/components/PageHeader.tsx
  → 验证: 选项卡导航正常

Step 3: 提取 StandingsTab → src/components/StandingsTab.tsx
  → 验证: 积分榜显示正常，联赛切换正常

Step 4: 提取 PythonExportTab → src/components/PythonExportTab.tsx
  → 验证: Python 导出页面正常

Step 5: 提取 AdvancedParamsPanel → src/components/AdvancedParamsPanel.tsx
  → 验证: 疲劳/受伤滑块正常，参数警告正常

Step 6: 提取 ModelWeightsPanel → src/components/ModelWeightsPanel.tsx
  → 验证: 权重滑块正常，系统/自定义切换正常

Step 7: 更新 App.tsx 使用 AppNew
  → 最终验证: 全功能测试
```

---

## 8. 最终目标状态

### 文件结构变化

```
src/
├── App.tsx                    # 缩减为 ~20 行（仅根组件调用）
├── AppNew.tsx                 # 新文件，包含简化后的 AppContent
├── components/
│   ├── PageHeader.tsx         # 新：顶部导航
│   ├── StandingsTab.tsx       # 新：积分榜
│   ├── PythonExportTab.tsx    # 新：Python导出
│   ├── AdvancedParamsPanel.tsx # 新：高级参数
│   ├── ModelWeightsPanel.tsx  # 新：权重调整
│   └── ... (已有组件)
```

### App.tsx 最终形态

```typescript
// src/App.tsx 最终版本
import AppNew from './AppNew';

export default function App() {
  return <AppNew />;
}
```

### AppNew.tsx 最终大小估算
- 原始 AppContent: ~2400 行
- 减去 5 个组件的提取: ~1400 行
- 缩减约 42%