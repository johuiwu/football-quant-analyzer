# 足球角球投注系统完整链路检查报告

生成时间: 2026-06-22

## 一、完整链路拓扑

```
前端启动监控 → POST /api/corner/start → startCornerBackendPolling()
     ↓
后端轮询 pollOnce() → crawlCornerMatches() → _crawlViaPureHttp()
     ↓
纯HTTP数据获取: fetchCornerData() + fetchHdpOuData()
     ↓
数据映射 mapMatchToCornerFormat() → 增量检测 computeDelta()
     ↓
策略评估 evaluateStrategies() [cornerEvaluator.js] → 保存触发记录
     ↓
自动投注 processAutoBetsForMatches() → trackedMatchIds白名单检查
     ↓
投注执行: HTTP优先(httpBetExecutor.js) → 浏览器DOM回退(cornerBetExecutor.js)
     ↓
FT_order_view → 构造wagers XML → Total_bet/FT_bet
     ↓
结果记录: corner_bets + corner_history 表
```

## 二、各节点检查状态

| 节点 | 状态 | 关键文件 |
|------|------|----------|
| 1. 前端启动监控 | ✅ 正常 | cornerStore.ts L447-463 |
| 2. 后端轮询启动 | ✅ 正常 | cornerService.js L476-497 |
| 3. 数据获取(HTTP) | ✅ 正常 | cornerCrawler.js L3552-3680 |
| 4. 数据映射 | ✅ 正常 | cornerService.js L591-621 |
| 5. 策略评估 | ✅ 正常 | cornerEvaluator.js L53-114 |
| 6. 自动投注触发 | ⚠️ 有条件断点 | cornerService.js L201-289 |
| 7. HTTP投注执行 | ⚠️ 有条件断点 | httpBetExecutor.js L482-544 |
| 8. 浏览器DOM投注回退 | ⚠️ 有条件断点 | cornerBetExecutor.js L92-453 |
| 9. Gismo实时订阅 | ✅ 正常 | GismoSubscriber.js L174-272 |
| 10. 凭证管理 | ⚠️ 有条件断点 | credentialManager.js L126-198 |
| 11. 前后端数据交互 | ✅ 正常 | cornerRoutes.js 全文 |

## 三、已识别的断点位置与技术原因

---

### 断点1：trackedMatchIds空数组导致所有比赛被跳过或全部放行（逻辑歧义）

- **位置**: `backend/services/cornerService.js` L216
- **代码**:
  ```javascript
  if (betConfig.trackedMatchIds.length > 0 && !betConfig.trackedMatchIds.includes(match.matchId))
  ```
- **现象**: 当 `trackedMatchIds=[]`（空数组）时，条件 `length > 0` 为 false，整个 if 条件为 false，所有比赛都会通过白名单检查被投注。但根据项目记忆中的约束："When trackedMatchIds=[] (empty), all matches are skipped"，空数组应表示"跳过所有比赛"。
- **技术原因**: 逻辑设计缺陷——空数组被等同于"无白名单限制，全部放行"，而非预期的"无追踪比赛则全部跳过"。
- **影响等级**: 🔴 高——可能导致非预期的自动投注执行
- **修复建议**: 增加空数组检查：
  ```javascript
  if (betConfig.trackedMatchIds.length === 0) {
    console.log("[cornerService] 无追踪比赛，跳过投注");
    continue;
  }
  if (!betConfig.trackedMatchIds.includes(match.matchId)) {
    console.log("[cornerService] 比赛不在追踪白名单中: matchId=" + match.matchId);
    continue;
  }
  ```

---

### 断点2：auto方向投注默认使用RE(让球)而非根据盘口类型智能选择

- **位置**: `backend/services/httpBetExecutor.js` L554-570
- **代码**:
  ```javascript
  case "auto":
  default:
    return { wtype: "RE", choseTeam: "H" };
  ```
- **现象**: 当策略 betDirection 为 "auto" 时，投注方向硬编码为让球主队(RE/H)。但角球盘口实际上可能是大小球(ROU)更合适。策略1(走地角球)和策略2(领先角球)的 betDirection 都是 "over"，但策略4和策略5的 betDirection 也是 "over"，而策略3是 "under"。只有当 betDirection 显式为 "over"/"under" 时才会映射到 ROU，"auto" 永远走 RE。
- **技术原因**: resolveBetDirection 函数的 "auto" 分支缺少根据当前盘口数据智能判断方向的逻辑。
- **影响等级**: 🟡 中——auto方向投注可能下错盘口类型
- **修复建议**: 在 resolveBetDirection 中增加基于 match.cornerOU 数据的智能判断：
  ```javascript
  case "auto":
    // 如果有角球大小球盘口数据，优先使用ROU
    if (handicap !== 0) return { wtype: "ROU", choseTeam: handicap > 0 ? "O" : "U" };
    return { wtype: "RE", choseTeam: "H" };
  ```

---

### 断点3：Gismo角球变化回调中策略评估使用的是内存中的match对象，可能缺少cornerOU等盘口数据

- **位置**: `backend/services/cornerService.js` L340-371
- **代码**:
  ```javascript
  subscribeMatches(matchIds, (deltaData) => {
    const match = cachedMatches.find(m => m.matchId === deltaData.matchId);
    if (match) {
      // 直接更新 match 对象
      match.totalCorners = deltaData.totalCorners;
      // 然后评估策略
      const triggeredIds = evaluateCornerStrategies(match, activeStrategies);
    }
  }, sharedPage, ...);
  ```
- **现象**: Gismo回调只更新了角球数、比分、时间等基本数据，但**没有更新盘口数据**（cornerOU、cornerHDP、cornerOdds等）。这些盘口数据来自 transform.php API，Gismo的 match_timelinedelta 端点不提供盘口信息。因此策略评估时使用的 cornerOU/cornerOdds 可能是过期的。
- **技术原因**: Gismo数据源与transform.php数据源的盘口数据未合并更新。Gismo只推送比赛事件，不推送赔率变化。
- **影响等级**: 🟡 中——策略可能基于过期赔率触发，导致投注时赔率已变动
- **修复建议**: 在Gismo角球变化回调中，触发一次 transform.php 辅数据请求（15秒间隔约束内），获取最新盘口后再评估策略。

---

### 断点4：凭证2小时过期检查与实际会话有效期不一致

- **位置**: `backend/services/credentialManager.js` L128-134
- **代码**:
  ```javascript
  if (credFile.savedAt && (Date.now() - credFile.savedAt) > 7200000) {
    console.log("[credentialManager] 凭证已过期（超过 2 小时）...");
    return null;
  }
  ```
- **现象**: 凭证过期检查使用固定的2小时(7200000ms)阈值，但实际网站会话可能在更短时间内过期（如被踢出、IP变更等），也可能持续更长时间。固定阈值导致：(1) 会话实际已过期但凭证仍在2小时内，loadCredentials返回过期凭证；(2) 会话仍有效但超过2小时，凭证被错误丢弃需要重新登录。
- **技术原因**: 硬编码过期时间无法反映真实会话状态。
- **影响等级**: 🟡 中——可能导致不必要的重新登录或使用过期凭证
- **修复建议**: 在使用凭证前增加轻量级验证请求（如 get_game_list 空查询），而非仅依赖时间戳。

---

### 断点5：前端轮询与后端轮询双重定时器可能导致数据不一致

- **位置**: `src/store/cornerStore.ts` L457-462
- **代码**:
  ```javascript
  // 前端轮询
  const schedulePoll = () => {
    const interval = 8000 + Math.random() * 2000;
    monitorInterval = setTimeout(() => { get().refreshData(); schedulePoll(); }, interval);
  };
  ```
- **现象**: 前端有独立的8-10秒轮询（通过 GET /api/corner/live 读取缓存），后端也有独立的5-18秒自适应轮询（通过 crawlCornerMatches 更新缓存）。两个轮询周期不同步，可能出现：
  1. 前端请求时后端缓存刚好被清空（stopMonitor后立即startMonitor的瞬间）
  2. 前端显示的数据与后端最新爬取数据存在时间差
- **技术原因**: 前后端轮询独立运行，无协调机制。
- **影响等级**: 🟢 低——用户体验上的短暂数据延迟，不影响功能正确性

---

### 断点6：浏览器DOM投注回退路径中赔率匹配容差过小

- **位置**: `backend/services/cornerBetExecutor.js` L217, L246
- **代码**:
  ```javascript
  if (!isNaN(val) && Math.abs(val - odds) < 0.05) {
  ```
- **现象**: 赔率匹配容差仅0.05，但角球盘口赔率变动频繁，从策略触发到投注执行时赔率可能已变动超过0.05。这会导致赔率匹配失败，投注无法执行。
- **技术原因**: 容差值设置过小，未考虑角球盘口的高波动性。
- **影响等级**: 🟡 中——浏览器DOM投注路径的赔率匹配成功率低
- **修复建议**: 将容差从0.05提高到0.1（与项目记忆中"0.1 tolerance"一致），或增加二次尝试逻辑。

---

### 断点7：checkDuplicateBet查询失败时保守返回true，阻止所有投注

- **位置**: `backend/services/cornerBetService.js` L344-348
- **代码**:
  ```javascript
  } catch (err) {
    console.error("[cornerBetService] 查重失败:", err.message);
    return true; // 保守策略：查询失败时假定重复
  }
  ```
- **现象**: 当数据库查询异常（如表不存在、连接失败）时，checkDuplicateBet返回true，阻止所有投注执行。这在数据库初始化阶段或异常恢复期间会导致所有策略触发都无法执行投注。
- **技术原因**: 保守策略过于严格，在数据库临时异常时完全阻断投注链路。
- **影响等级**: 🟡 中——数据库异常期间所有自动投注被阻断
- **修复建议**: 增加降级逻辑——查询失败时允许投注但记录警告日志，或仅对特定异常类型（非表不存在类）返回true。

---

### 断点8：二次确认模式下betQueue只处理第一条记录

- **位置**: `backend/services/cornerBetService.js` L358
- **代码**:
  ```javascript
  const task = betQueue.shift(); // 每次只取一条
  ```
- **现象**: processBetQueue 每次调用只处理队列中的第一条记录。在二次确认模式下，处理完一条后就将 isProcessing 设为 false 并返回。如果同时有多条策略触发，只有第一条会进入 pending_confirm 状态，其余留在队列中等待下次 processBetQueue 调用。
- **技术原因**: 队列处理逻辑设计为单条处理模式，未实现循环处理。
- **影响等级**: 🟢 低——多条策略同时触发时处理延迟，但不会丢失

---

### 断点9：前端startMonitor不等待后端start完成就设置isMonitoring=true

- **位置**: `src/store/cornerStore.ts` L453-454
- **代码**:
  ```javascript
  set({ isMonitoring: true });
  fetch('/api/corner/start', { method: 'POST' }).catch(() => {});
  ```
- **现象**: 前端先设置 isMonitoring=true，然后异步发送 POST /api/corner/start 请求（且不等待响应，catch吞掉错误）。如果后端启动失败，前端仍显示"监控已启动"状态，但实际后端轮询未运行。
- **技术原因**: 前后端状态同步缺乏错误反馈机制。
- **影响等级**: 🟡 中——后端启动失败时前端显示虚假的监控状态
- **修复建议**: 等待后端响应后再设置 isMonitoring，失败时显示错误信息。

---

### 断点10：Gismo订阅依赖浏览器page对象，浏览器关闭后订阅失效且不自动恢复

- **位置**: `backend/services/GismoSubscriber.js` L191-195
- **代码**:
  ```javascript
  if (page && page.isClosed()) {
    console.log("[GismoSubscriber] page 已关闭，自动退订 matchId=" + matchId);
    unsubscribeMatches([matchId]);
    return;
  }
  ```
- **现象**: Gismo订阅通过 page.evaluate(fetch) 在浏览器上下文中执行请求。当浏览器页面关闭时，订阅自动退订且不会在页面恢复后重新订阅。而 pollOnce 中的 subscribeMatches 调用只在有新 matchId 时才执行，不会为已退订的 matchId 重新订阅。
- **技术原因**: 订阅生命周期与浏览器页面生命周期绑定，缺少独立的恢复机制。
- **影响等级**: 🟡 中——浏览器重启后Gismo实时推送中断，只能依赖轮询获取数据
- **修复建议**: 在 pollOnce 成功后检查当前订阅状态，为已退订但仍在 cachedMatches 中的比赛重新订阅。

---

## 四、链路完整性总结

### 主链路状态：✅ 基本畅通

从"启动监控"到"自动投注执行"的主链路是完整的，不存在致命的断点（即不存在函数调用断裂、模块缺失、import错误等硬性断点）。

### 需要关注的断点优先级排序

| 优先级 | 断点 | 影响 |
|--------|------|------|
| 🔴 P0 | 断点1: trackedMatchIds空数组逻辑歧义 | 可能导致非预期投注 |
| 🟡 P1 | 断点2: auto方向硬编码RE | 投注方向可能错误 |
| 🟡 P1 | 断点3: Gismo回调缺少盘口更新 | 策略基于过期赔率触发 |
| 🟡 P1 | 断点6: 赔率匹配容差过小 | DOM投注成功率低 |
| 🟡 P1 | 断点9: 前端不等待后端启动结果 | 虚假监控状态 |
| 🟡 P2 | 断点4: 凭证过期检查不准确 | 不必要的重新登录 |
| 🟡 P2 | 断点7: 查重失败阻断投注 | 数据库异常时投注全停 |
| 🟡 P2 | 断点10: Gismo订阅不自动恢复 | 实时推送中断 |
| 🟢 P3 | 断点5: 前后端轮询不同步 | 数据短暂延迟 |
| 🟢 P3 | 断点8: 队列单条处理 | 多策略触发延迟 |

### 数据传输完整性评估

1. **前端→后端**: 策略配置同步(PUT /api/corner/strategies)、投注配置同步(POST /api/corner/bet-config) 均正常，字段映射完整
2. **后端→前端**: GET /api/corner/live 返回数据包含 triggeredStrategies（后端评估结果），前端直接使用无需二次评估
3. **后端→外部API**: transform.php 请求参数完整（uid/ver/langx/chgSortTS等），transform_nl.php 投注请求参数完整
4. **外部API→后端**: 响应解析覆盖了主要错误码（501/555/617/doubleLogin/CheckEMNU/VariableStandard）

### 结论

系统主链路功能完整，不存在硬性断点。但存在1个高风险逻辑缺陷（trackedMatchIds空数组行为）和多个中风险的条件断点，主要集中在投注执行环节的方向选择、赔率匹配和状态同步方面。建议优先修复P0级断点，然后逐步处理P1级断点。
