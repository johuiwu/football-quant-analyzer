# 黄瓜角球 (HgCeApp) - Code Wiki

## 1. 项目概述

**项目名称**：黄瓜角球 (HgCeApp)

**项目类型**：Windows 桌面应用程序（.NET Framework WinForms）

**核心功能**：足球角球盘口自动化监控与下注系统。该应用连接体育博彩平台，实时监控足球比赛数据，根据预设的多套策略参数自动识别符合条件的角球盘口机会，并执行自动下注。

**版本**：1.0.0.0

---

## 2. 项目架构

### 2.1 技术栈

| 层级 | 技术 |
|------|------|
| 运行时 | .NET Framework 4.x |
| UI 框架 | Windows Forms (WinForms) |
| 网络通信 | `System.Net.Http` (HttpClient) + `System.Net.WebSockets` (ClientWebSocket) |
| JSON 处理 | 内嵌 SimpleJson 库（非 Newtonsoft） |
| 数据存储 | 本地 JSON 文件 (.dat) |
| 自动更新 | 独立 update.exe + rar.exe 解压 |
| Win32 互操作 | user32.dll (P/Invoke) |

### 2.2 整体架构图

```
┌──────────────────────────────────────────────────────┐
│                    HgCeApp.exe                       │
│                                                      │
│  ┌──────────┐   ┌───────────┐   ┌───────────────┐  │
│  │ FormLogin │──▶│ FormChange │──▶│   FormMain    │  │
│  │  登录窗口  │   │  服务器选择 │   │   主控窗口    │  │
│  └──────────┘   └───────────┘   └───────┬───────┘  │
│                                          │           │
│                          ┌───────────────┼──────┐    │
│                          ▼               ▼      ▼    │
│                   ┌──────────┐  ┌────────┐ ┌─────┐  │
│                   │ HgClass  │  │WSocket │ │UI   │  │
│                   │ 核心业务  │  │Client  │ │渲染  │  │
│                   │ 逻辑层   │  │Help    │ │层    │  │
│                   └────┬─────┘  └───┬────┘ └─────┘  │
│                        │            │                 │
│                        ▼            ▼                 │
│                 ┌──────────────────────────┐          │
│                 │     Entity 数据实体层     │          │
│                 │  OrderEntity, LiveEntity  │          │
│                 │  CornersEntity, ZpEntity  │          │
│                 │  ProxyEntity, HttpEntity  │          │
│                 │  BuyParamEntity, etc.     │          │
│                 └──────────────────────────┘          │
│                        │                              │
│                        ▼                              │
│                 ┌──────────────────────────┐          │
│                 │      data/ 数据持久层     │          │
│                 │   .dat (JSON 文件)        │          │
│                 └──────────────────────────┘          │
└──────────────────────────────────────────────────────┘
                         │
              ┌──────────┼──────────┐
              ▼          ▼          ▼
       ┌──────────┐ ┌────────┐ ┌──────────┐
       │ 博彩平台  │ │ WebSocket│ │ update/  │
       │ HTTP API │ │ 实时数据  │ │ 自动更新  │
       └──────────┘ └────────┘ └──────────┘
```

---

## 3. 目录结构

```
黄瓜角球/
├── HgCeApp.exe              # 主应用程序（.NET Framework WinForms）
├── HgCeApp.ini              # 应用配置文件（JSON 格式）
├── update.exe               # 自动更新程序
├── rar.exe                  # RAR 解压工具（用于更新包解压）
├── sound.wav                # 提示音文件（下注提醒）
├── app_window.png           # 应用窗口截图
├── screenshot.png           # 屏幕截图
├── inspect_ui.ps1           # UI 自动化检查脚本（PowerShell）
├── screenshot.ps1           # 屏幕截图脚本（PowerShell）
├── data/                    # 数据存储目录
│   ├── {username}.dat       # 用户会话数据（User-Agent + Cookie）
│   ├── {username}_{date}.dat# 每日下注记录（JSON 数组）
│   └── zp.dat               # 走盘数据
├── update/                  # 更新包目录
│   └── {version}.rar        # 版本更新包（RAR 格式）
└── .claude/                 # Claude 配置
    └── settings.local.json  # 本地权限配置
```

---

## 4. 核心模块详解

### 4.1 UI 层 - 窗体模块

#### FormLogin（登录窗口）
- **职责**：用户登录入口，输入博彩平台账号密码
- **关键行为**：
  - 验证用户名/密码
  - 记住密码功能（`IsRemember`）
  - 登录成功后跳转到 `FormChange`
- **事件**：`FormLogin_FormClosed` - 窗体关闭时清理资源

#### FormChange（服务器选择窗口）
- **职责**：选择博彩平台服务器线路
- **关键行为**：
  - 显示可用服务器列表（`ServerLineIndex`）
  - 选择后进入主窗口 `FormMain`

#### FormMain（主控窗口）
- **职责**：应用核心控制面板，监控比赛和下注操作
- **关键 UI 组件**：
  - `DataGridView` - 显示实时比赛数据和下注记录
  - `ListView` - 显示比赛列表（自绘 OwnerDraw）
  - `StatusStrip` / `ToolStripStatusLabel` - 状态栏
  - `Timer` - 定时刷新数据
  - `SoundPlayer` - 播放提示音
- **关键事件处理**：
  - `Btn_Search_Click` - 搜索符合条件的比赛
  - `Btn_Search2_Click` - 第二种搜索模式
  - `InitData` - 初始化数据加载
- **关键行为**：
  - 定时轮询比赛数据
  - 根据策略参数筛选符合条件的比赛
  - 触发自动下注
  - 显示下注结果和状态

### 4.2 业务逻辑层

#### HgClass（核心业务类）
- **职责**：封装与博彩平台的所有交互逻辑
- **关键方法**：

| 方法 | 说明 |
|------|------|
| `GetLiveData()` | 异步获取实时比赛数据（async） |
| `DoBet()` | 执行下注操作（async） |
| `BuilderLive()` | 构建实时比赛数据结构 |

- **通信方式**：
  - HTTP API：通过 `HttpClient` 发送请求获取比赛数据、执行下注
  - WebSocket：通过 `WSocketClientHelp` 接收实时推送数据

#### WSocketClientHelp（WebSocket 客户端）
- **职责**：管理与博彩平台的 WebSocket 实时连接
- **关键方法**：

| 方法 | 说明 |
|------|------|
| `Open()` | 建立 WebSocket 连接 |
| `Send()` | 发送消息 |
| `Close()` | 关闭连接 |

- **事件**：
  - `MessageEventHandler` - 接收到消息时触发
  - `ErrorEventHandler` - 发生错误时触发
- **实现细节**：
  - 使用 `ClientWebSocket`（System.Net.WebSockets）
  - 异步接收 `ReceiveAsync` / `ConnectAsync` / `CloseAsync`
  - 支持后台线程运行

### 4.3 数据实体层

#### ServerLineEntity（服务器线路实体）
- **职责**：表示一条可用的博彩平台服务器线路
- **属性**：Host, Port 等

#### HttpEntity（HTTP 请求实体）
- **职责**：封装 HTTP 请求参数
- **属性**：Content, Headers 等

#### ProxyEntity（代理实体）
- **职责**：网络代理配置

#### OrderEntity（订单/下注实体）
- **职责**：表示一条下注记录
- **属性**：

| 属性 | 类型 | 说明 |
|------|------|------|
| Id | string | 唯一标识（GUID） |
| Pid | string? | 父级 ID |
| CreateTime | string | 创建时间 |
| League | string | 联赛名称 |
| TeamA | string | 主队名称 |
| TeamB | string | 客队名称 |
| TeamAEn | string | 主队英文/编码 |
| TeamBEn | string | 客队英文/编码 |
| Rq | double | 让球数（盘口） |
| RqOdds | double | 盘口赔率 |
| ScoreA | int | 主队得分 |
| ScoreB | int | 客队得分 |
| Golds | int | 下注金额 |
| CornerA | int | 主队角球数 |
| CornerB | int | 客队角球数 |
| Typ | string | 下注类型（"B"） |
| Status | string | 状态（"成功"/"失败"） |
| IsRepair | bool | 是否补单 |
| PlayTime | int | 比赛进行时间（分钟） |
| StrongA | bool | 主队是否强势 |
| StrongB | bool | 客队是否强势 |
| Policy | int | 使用的策略编号 |

#### BuyParamEntity（下注参数实体）
- **职责**：封装下注时的参数

#### LiveEntity（实时比赛实体）
- **职责**：表示一场实时比赛的数据

#### CornersEntity（角球实体）
- **职责**：角球相关数据

#### ZpEntity（走盘实体）
- **职责**：走盘（盘口变化）相关数据

#### ScheduleRefreshZpEntity（定时刷新走盘实体）
- **职责**：定时刷新走盘数据的配置

### 4.4 辅助模块

#### SimpleJson（JSON 序列化库）
- **职责**：轻量级 JSON 序列化/反序列化
- **来源**：内嵌的第三方库（非 Newtonsoft.Json）
- **关键类**：
  - `SimpleJson` - 主入口类
  - `JsonObject` - JSON 对象
  - `JsonArray` - JSON 数组
  - `PocoJsonSerializerStrategy` - POCO 序列化策略
  - `IJsonSerializerStrategy` - 序列化策略接口
- **关键方法**：
  - `SerializeObject()` - 序列化对象为 JSON
  - `DeserializeObject()` - 反序列化 JSON 为对象
  - `TryDeserializeObject()` - 尝试反序列化

#### HgCeApp.Reflection（反射工具模块）
- **职责**：高性能反射操作
- **关键类**：
  - `ThreadSafeDictionary<TKey, TValue>` - 线程安全字典
  - `ThreadSafeDictionaryValueFactory<TKey, TValue>` - 字典值工厂
- **关键方法**：
  - `GetDelegate()` - 获取委托
  - `SetDelegate()` - 设置委托
  - `ConstructorDelegate` - 构造函数委托

#### Win32 互操作（P/Invoke）
- **职责**：调用 Windows API 实现底层操作
- **引用的 DLL**：user32.dll / User32.dll
- **导入的函数**：

| 函数 | 说明 |
|------|------|
| `SendMessage` | 发送窗口消息 |
| `FindWindow` | 查找窗口句柄 |
| `MoveWindow` | 移动/调整窗口 |
| `SetForegroundWindow` | 设置前台窗口 |
| `SetCursorPos` | 设置鼠标位置 |
| `mouse_event` | 模拟鼠标事件 |
| `keybd_event` | 模拟键盘事件 |
| `AddClipboardFormatListener` | 监听剪贴板格式 |
| `RemoveClipboardFormatListener` | 移除剪贴板监听 |
| `GetLastError` | 获取最后错误 |
| `CloseClipboard` | 关闭剪贴板 |
| `IsClipboardFormatAvailable` | 检查剪贴板格式 |
| `SetClipboardData` | 设置剪贴板数据 |
| `GetClipboardData` | 获取剪贴板数据 |
| `MessageBoxTimeout` | 自动关闭的消息框 |

---

## 5. 配置系统 (HgCeApp.ini)

配置文件为 JSON 格式，包含以下配置分组：

### 5.1 平台账号配置

| 配置项 | 类型 | 说明 |
|--------|------|------|
| UserName | string | 平台用户名 |
| PassWord | string | 平台密码 |
| IsRemember | bool | 是否记住密码 |
| ServerLineIndex | int | 服务器线路索引 |

### 5.2 博彩平台连接配置

| 配置项 | 类型 | 说明 |
|--------|------|------|
| HgUrl | string | 博彩平台 URL（如 `https://www.hga050.com`） |
| HgVer | string | 平台版本标识（MD5 格式） |
| HgIovationKey | string | Iovation 安全验证密钥 |
| HgUserName | string | 博彩平台用户名 |
| HgPassword | string | 博彩平台密码 |
| HgUid | string | 博彩平台用户 UID |
| PsUserName | string | PS 用户名 |
| PsPassword | string | PS 密码 |

### 5.3 下注策略参数

应用内置 **5 套下注策略**，每套策略包含以下参数：

| 配置项 | 说明 | 策略1 | 策略2 | 策略3 | 策略4 | 策略5 |
|--------|------|-------|-------|-------|-------|-------|
| PlayTimeThan | 最小比赛时间(分钟) | 35 | 50 | 70 | 60 | 70 |
| PlayTimeThanEnd | 最大比赛时间(分钟) | 55 | 77 | 99 | 99 | 99 |
| LeadGoals | 领先球数阈值 | 20 | 3 | - | - | - |
| LeadGoalsWeak | 弱队领先球数 | 1 | 1 | - | - | - |
| LeadGoalsSubtend | 领先球数下限 | - | - | - | 2 | 1 |
| CornerHandicapLower | 角球盘口下限 | -1.25 | -0.75 | 0 | 0 | 0 |
| CornerHandicapUpper | 角球盘口上限 | 3.5 | 2.5 | 1.5 | 3.5 | 3.5 |
| TarOdds | 目标赔率 | 0.8 | 0.8 | 0.8 | 0.8 | 0.8 |

### 5.4 其他配置

| 配置项 | 类型 | 说明 |
|--------|------|------|
| IsTrueBet | bool | 是否真实下注（false 为模拟） |
| IsMaxStake | bool | 是否使用最大投注额 |
| IsPlaySound | bool | 是否播放提示音 |
| IsScheduleRefresh | bool | 是否定时刷新 |
| ZpRefreshInterval | int | 走盘刷新间隔（分钟） |
| BetGolds | int | 默认下注金额 |
| AsStrong | double | 强势判定阈值 |
| ZpHandicapLower | double | 走盘盘口下限 |
| ZpHandicapUpper | double | 走盘盘口上限 |
| BuyStrongTime | int | 买入强势时间阈值 |
| DrawMaximum | int | 平局最大值 |
| ErrorWaitTime | int | 错误等待时间（秒） |

---

## 6. 数据存储格式

### 6.1 用户会话数据 (`{username}.dat`)

UTF-8 BOM 编码的 JSON 文件，存储 HTTP 请求头信息：

```json
{
  "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) ...",
  "Cookie": ""
}
```

**用途**：模拟移动端浏览器访问博彩平台，维持登录会话。

### 6.2 每日下注记录 (`{username}_{date}.dat`)

UTF-8 BOM 编码的 JSON 数组，存储当天的下注记录：

```json
[
  {
    "Id": "7634741a-dd76-011f-deb9-0daae510ee3f",
    "Pid": null,
    "CreateTime": "2025-12-14 09:35:47",
    "League": "阿根廷职业联赛-附加赛",
    "TeamA": "竞赛会",
    "TeamB": "学生队",
    "TeamAEn": "103878",
    "TeamBEn": "103873",
    "Rq": 0.25,
    "RqOdds": 0.8,
    "ScoreA": 0,
    "ScoreB": 0,
    "Golds": 500,
    "CornerA": 2,
    "CornerB": 3,
    "Typ": "B",
    "Status": "成功",
    "IsRepair": false,
    "PlayTime": 70,
    "StrongA": false,
    "StrongB": true,
    "Policy": 3
  }
]
```

### 6.3 走盘数据 (`zp.dat`)

UTF-8 BOM 编码的 JSON 数组，初始为空数组 `[]`。

### 6.4 用户账号列表

当前系统中存在以下用户数据目录：

| 用户名 | 数据时间范围 | 说明 |
|--------|-------------|------|
| cb88168 | 2026-01-06 ~ 2026-04-14 | 主要账号 |
| cs2301 | 2025-11-22 ~ 2026-01-05 | 辅助账号 |
| liuwei1108 | 2026-04-19 ~ 2026-05-17 | 当前活跃账号 |
| yy798546 | 2025-11-08 ~ 2025-11-21 | 早期账号 |

---

## 7. 自动更新机制

### 7.1 更新流程

```
1. update.exe 检查远程更新源
2. 下载新版 RAR 更新包到 update/ 目录
3. 使用 rar.exe 解压更新包
4. 替换 HgCeApp.exe 主程序
5. 重启应用
```

### 7.2 更新包命名规则

格式：`{YYMMDD}{序号}.rar`

示例：
- `25110501` → 2025-11-05 第01号更新
- `26011301` → 2026-01-13 第01号更新

### 7.3 当前更新包

| 更新包 | 日期 |
|--------|------|
| 25110501.rar | 2025-11-05 |
| 25110901.rar | 2025-11-09 |
| 25111501.rar | 2025-11-15 |
| 25112201.rar | 2025-11-22 |
| 25112301.rar | 2025-11-23 |
| 25121201.rar | 2025-12-12 |
| 26010501.rar | 2026-01-05 |
| 26010801.rar | 2026-01-08 |
| 26011001.rar | 2026-01-10 |
| 26011301.rar | 2026-01-13 |

---

## 8. 依赖关系

### 8.1 .NET Framework 依赖

| 依赖 | 版本 | 说明 |
|------|------|------|
| mscorlib | 4.0.0.0 | 核心类库 |
| System.Windows.Forms | - | WinForms UI 框架 |
| System.Drawing | - | 图形绘制 |
| System.Net.Http | - | HTTP 通信 |
| System.Net.WebSockets | - | WebSocket 客户端 |
| System.Data | - | DataTable 数据结构 |
| System.Configuration | - | 应用配置 |
| System.Xml | - | XML 解析 |
| System.Runtime.Serialization | - | 数据序列化 |
| System.Runtime.InteropServices | - | COM/Win32 互操作 |
| System.Threading | - | 多线程 |
| System.Threading.Tasks | - | 异步任务 |

### 8.2 外部工具依赖

| 工具 | 文件 | 说明 |
|------|------|------|
| rar.exe | 518,144 bytes | RAR 命令行解压工具，用于更新包解压 |
| update.exe | 75,264 bytes | 自动更新程序 |

### 8.3 运行时依赖

- Windows 操作系统（Win32 API 调用）
- .NET Framework 4.x 运行时
- 网络连接（访问博彩平台 API 和 WebSocket）

---

## 9. 项目运行方式

### 9.1 启动流程

```
1. 运行 HgCeApp.exe
2. Program.Main() 入口
   ├── Application.EnableVisualStyles()
   ├── Application.SetCompatibleTextRenderingDefault()
   └── Application.Run(new FormLogin())
3. FormLogin 显示登录界面
4. 登录成功 → FormChange 选择服务器线路
5. 选择线路 → FormMain 主控界面
6. 主界面初始化：
   ├── 加载 HgCeApp.ini 配置
   ├── 加载用户会话数据 (data/{username}.dat)
   ├── 建立 WebSocket 连接 (WSocketClientHelp)
   ├── 启动定时刷新
   └── 开始监控比赛数据
```

### 9.2 核心运行逻辑

```
主循环：
  ├── 定时获取实时比赛数据 (GetLiveData)
  ├── 根据策略参数筛选符合条件的比赛
  │   ├── 策略1: 35-55分钟 + 领先20球 + 角球盘口-1.25~3.5
  │   ├── 策略2: 50-77分钟 + 领先3球 + 角球盘口-0.75~2.5
  │   ├── 策略3: 70分钟以上 + 角球盘口0~1.5
  │   ├── 策略4: 60分钟以上 + 领先2球 + 角球盘口0~3.5
  │   └── 策略5: 70分钟以上 + 领先1球 + 角球盘口0~3.5
  ├── 匹配成功 → 播放提示音 (sound.wav)
  ├── 自动执行下注 (DoBet)
  └── 记录下注结果到 data/{username}_{date}.dat
```

### 9.3 关闭流程

```
1. 关闭 WebSocket 连接 (WSocketClientHelp.Close)
2. 保存配置到 HgCeApp.ini
3. 保存会话数据到 data/{username}.dat
4. 退出应用
```

---

## 10. 安全与反检测机制

### 10.1 请求伪装

- 使用移动端 User-Agent（iPhone Safari）模拟移动端访问
- 每个用户账号维护独立的 Cookie 和请求头

### 10.2 Iovation 验证

- 配置 `HgIovationKey` 用于通过博彩平台的设备指纹验证
- Iovation 是博彩行业常用的反欺诈和设备识别服务

### 10.3 Win32 底层操作

- 通过 P/Invoke 调用 user32.dll 实现窗口操作和输入模拟
- 剪贴板监听功能用于数据捕获
- `MessageBoxTimeout` 实现自动关闭的提示框

---

## 11. 关键类关系图

```
Program
  └── FormLogin
        └── FormChange
              └── FormMain
                    ├── HgClass (核心业务)
                    │     ├── GetLiveData() ──▶ HttpClient
                    │     ├── DoBet() ───────▶ HttpClient
                    │     └── BuilderLive()
                    ├── WSocketClientHelp (WebSocket)
                    │     ├── Open() ──▶ ClientWebSocket
                    │     ├── Send()
                    │     └── Close()
                    │     ├── MessageEventHandler
                    │     └── ErrorEventHandler
                    ├── SimpleJson (序列化)
                    │     ├── SerializeObject()
                    │     └── DeserializeObject()
                    └── Entity 层
                          ├── OrderEntity
                          ├── LiveEntity
                          ├── CornersEntity
                          ├── ZpEntity
                          ├── ServerLineEntity
                          ├── HttpEntity
                          ├── ProxyEntity
                          ├── BuyParamEntity
                          └── ScheduleRefreshZpEntity
```

---

## 12. 辅助脚本说明

### inspect_ui.ps1
- **用途**：使用 UIAutomation 自动化框架检查 HgCeApp 窗口的 UI 元素
- **输出**：`ui_elements.json` - 包含所有 UI 控件的类型、名称、类名和位置信息
- **依赖**：UIAutomationClient / UIAutomationTypes 程序集

### screenshot.ps1
- **用途**：截取主屏幕截图
- **输出**：`screenshot.png`
- **依赖**：System.Windows.Forms / System.Drawing

---

## 13. 数据流图

```
博彩平台 HTTP API
       │
       ▼
  HttpClient ◄──── HgClass.GetLiveData()
       │                    │
       ▼                    ▼
  JSON 响应          比赛数据筛选
       │            (5套策略参数)
       │                    │
       │           ┌────────┴────────┐
       │           ▼                 ▼
       │      符合条件            不符合
       │           │                 │
       │           ▼                 │
       │     播放提示音              │
       │           │                 │
       │           ▼                 │
       │     HgClass.DoBet()        │
       │           │                 │
       │           ▼                 │
       │     下注请求 ──▶ HTTP API
       │           │
       │           ▼
       │     下注结果
       │           │
       ▼           ▼
  WebSocket 实时推送
       │
       ▼
  WSocketClientHelp
  (MessageEventHandler)
       │
       ▼
  FormMain 更新 UI
       │
       ▼
  保存到 data/{username}_{date}.dat
```
