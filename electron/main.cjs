// Electron 主进程 — 直接 require 后端模块，不 spawn 子进程
const { app, BrowserWindow, ipcMain, dialog } = require("electron");
const path = require("path");
const fs = require("fs");
const { autoUpdater } = require("electron-updater");

// ─── 环境判断 ───
const isDev = !app.isPackaged;

// ─── 后端引用 ───
let startServer = null;
let stopServer = null;

async function loadServerModule() {
  try {
    // 设置数据库路径（必须在 require 之前设置）
    let dbPath = isDev
      ? path.join(__dirname, "..", "database")
      : path.join(process.resourcesPath, "database");

    // Cookie 文件路径（必须是可写目录）
    // ★ 统一使用 Electron app.getPath('userData')
    // 注意：app.getPath('userData') 默认使用 package.json 的 name 字段 (football-quant-analyzer)
    // 但旧版已用 "足球竞彩量化分析系统" 作为目录名，必须用 app.setPath 保持一致
    const appDataDir = app.getPath('appData'); // %APPDATA%
    const userDataPath = path.join(appDataDir, '足球竞彩量化分析系统');
    app.setPath('userData', userDataPath); // 覆盖默认值，确保 app.getPath('userData') 返回正确路径
    const cookiePath = path.join(userDataPath, "cookies.json");

    // credentials.json 路径（必须是可写目录）
    const credPath = path.join(userDataPath, "credentials.json");

    // 确保用户数据目录存在
    if (!fs.existsSync(userDataPath)) {
      fs.mkdirSync(userDataPath, { recursive: true });
    }

    // ── 数据库目录可写性检测 ──
    // 如果安装到 Program Files 等只读目录，SQLite 无法写 WAL 文件
    // 自动迁移到 %APPDATA%/足球竞彩量化分析系统/database/
    if (!isDev) {
      if (!fs.existsSync(dbPath)) {
        fs.mkdirSync(dbPath, { recursive: true });
      }
      const testFile = path.join(dbPath, '.write-test');
      try {
        fs.writeFileSync(testFile, 'test');
        fs.unlinkSync(testFile);
      } catch (_e) {
        // 数据库目录不可写，迁移到 APPDATA
        const appdataDbPath = path.join(userDataPath, 'database');
        if (!fs.existsSync(appdataDbPath)) {
          fs.mkdirSync(appdataDbPath, { recursive: true });
        }
        // 如果 APPDATA 下没有 .db 文件，从 resources/database/ 复制
        const dbFile = path.join(appdataDbPath, 'football_data.db');
        if (!fs.existsSync(dbFile)) {
          const srcDb = path.join(dbPath, 'football_data.db');
          if (fs.existsSync(srcDb)) {
            fs.copyFileSync(srcDb, dbFile);
            console.log("[electron] 数据库已迁移到可写目录:", appdataDbPath);
          }
        }
        // 同样处理 worldcup.db
        const wcFile = path.join(appdataDbPath, 'worldcup.db');
        if (!fs.existsSync(wcFile)) {
          const srcWc = path.join(dbPath, 'worldcup.db');
          if (fs.existsSync(srcWc)) {
            fs.copyFileSync(srcWc, wcFile);
          }
        }
        dbPath = appdataDbPath;
        console.log("[electron] 数据库目录不可写，已切换到:", dbPath);
      }
    }

    // ── 首次启动自动建表 ──
    // 检测 teams 表是否存在，不存在则执行 init-tables.sql
    if (!isDev) {
      const dbFile = path.join(dbPath, 'football_data.db');
      let needInit = false;

      if (!fs.existsSync(dbFile)) {
        needInit = true;
        console.log("[electron] 数据库文件不存在，需要初始化");
      } else {
        // 检测 teams 表是否存在
        try {
          const sqlite3 = require('sqlite3');
          const checkDb = new sqlite3.Database(dbFile);
          const hasTeams = await new Promise((resolve) => {
            checkDb.get("SELECT name FROM sqlite_master WHERE type='table' AND name='teams'", (err, row) => {
              checkDb.close();
              resolve(!!row);
            });
          });
          if (!hasTeams) {
            needInit = true;
            console.log("[electron] teams 表不存在，需要初始化");
          }
        } catch (_e) {
          needInit = true;
          console.log("[electron] 数据库检测失败，需要初始化:", _e.message);
        }
      }

      if (needInit) {
        // 定位 init-tables.sql
        const initSqlPath = path.join(process.resourcesPath, 'init-tables.sql');
        if (fs.existsSync(initSqlPath)) {
          console.log("[electron] 执行 init-tables.sql 初始化数据库...");
          const sql = fs.readFileSync(initSqlPath, 'utf-8');
          const sqlite3 = require('sqlite3');
          const initDb = new sqlite3.Database(dbFile);
          // 先移除注释行，再按分号分割
          const sqlNoComments = sql.split('\n').filter(line => {
            const t = line.trim();
            return t.length > 0 && !t.startsWith('--');
          }).join('\n');
          const statements = sqlNoComments.split(';').map(s => s.trim()).filter(s => s.length > 0);
          for (const stmt of statements) {
            await new Promise((resolve, reject) => {
              initDb.run(stmt, (err) => {
                if (err) console.warn("[electron] 建表警告:", err.message);
                resolve();
              });
            });
          }
          initDb.close();
          console.log("[electron] 数据库初始化完成");
        } else {
          console.warn("[electron] init-tables.sql 未找到，跳过自动建表");
        }
      }
    }

    process.env.DB_DIR = dbPath;
    process.env.COOKIE_PATH = cookiePath;
    process.env.CRED_PATH = credPath;
    const staticDir = path.join(__dirname, "..", "dist");
    process.env.STATIC_DIR = staticDir;
    process.env.DISABLE_HMR = "true";
    process.env.NODE_ENV = "production";

    // Puppeteer 使用本地 Chrome/Edge 浏览器（不再捆绑 Chromium）
    console.log("[electron] Puppeteer 将使用本地 Chrome/Edge 浏览器");

    console.log("[electron] DB_DIR:", dbPath);
    console.log("[electron] STATIC_DIR:", staticDir);

    // 加载编译后的后端模块
    const serverPath = path.join(__dirname, "..", "dist", "server.cjs");
    console.log("[electron] 加载后端:", serverPath);
    require(serverPath);

    startServer = globalThis.__startServer;
    stopServer = globalThis.__stopServer;
    console.log("[electron] 后端模块加载成功, startServer:", typeof startServer);
    return true;
  } catch (err) {
    console.error("[electron] 加载后端模块失败:", err.message);
    console.error("[electron] 堆栈:", err.stack);
    return false;
  }
}

// ─── 窗口 ───
let mainWindow = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    title: "足球量化分析系统",
    icon: isDev ? path.join(__dirname, "..", "public", "icon.ico") : undefined,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      preload: path.join(__dirname, "preload.cjs"),
    },
    show: false,
    backgroundColor: "#090D1A",
  });

  mainWindow.setMenuBarVisibility(false);

  if (isDev) {
    const viteUrl = "http://localhost:5173";
    console.log("[electron] 开发模式, 等待 Vite:", viteUrl);
    const checkVite = setInterval(() => {
      require("http")
        .get(viteUrl, (res) => {
          clearInterval(checkVite);
          mainWindow.loadURL(viteUrl);
        })
        .on("error", () => {});
    }, 1000);
  } else {
    const serverUrl = "http://localhost:3000";
    console.log("[electron] 生产模式, 等待后端:", serverUrl);
    const checkServer = setInterval(() => {
      require("http")
        .get(serverUrl, (res) => {
          clearInterval(checkServer);
          mainWindow.loadURL(serverUrl);
        })
        .on("error", () => {});
    }, 500);
  }

  mainWindow.once("ready-to-show", () => mainWindow.show());
  mainWindow.on("closed", () => { mainWindow = null; });
}

// ─── 生命周期 ───

// ===== 自动更新 =====

// 自动检测可用代理：GHU_PROXY 环境变量 → 系统代理 → 常见本地代理端口
async function detectProxy() {
  // 1. 优先使用 GHU_PROXY 环境变量
  if (process.env.GHU_PROXY) {
    console.log(`[autoUpdater] 使用环境变量代理: ${process.env.GHU_PROXY}`);
    return process.env.GHU_PROXY;
  }

  // 2. 尝试读取 Windows 系统代理设置
  try {
    const { execSync } = require('child_process');
    const regOutput = execSync(
      'reg query "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings" /v ProxyServer 2>nul',
      { encoding: 'utf-8', timeout: 3000 }
    );
    const match = regOutput.match(/REG_SZ\s+(.+)/);
    if (match && match[1].trim()) {
      let proxy = match[1].trim();
      // 处理 "127.0.0.1:7890" 格式
      if (!proxy.startsWith('http')) {
        proxy = 'http://' + proxy;
      }
      console.log(`[autoUpdater] 检测到系统代理: ${proxy}`);
      return proxy;
    }
  } catch (_) {
    // 读取注册表失败，忽略
  }

  // 3. 探测常见本地代理端口
  const commonProxies = [
    'http://127.0.0.1:7890',  // Clash / Clash for Windows
    'http://127.0.0.1:7897',  // Clash Verge
    'http://127.0.0.1:10809', // V2RayN
    'http://127.0.0.1:10808', // V2RayN (socks→http)
    'http://127.0.0.1:1080',  // SS/SSR
    'http://127.0.0.1:1087',  // Surge
    'http://127.0.0.1:8888',  // Proxifier
  ];

  const net = require('net');
  for (const proxyUrl of commonProxies) {
    const url = new URL(proxyUrl);
    const port = parseInt(url.port);
    const host = url.hostname;
    try {
      const reachable = await new Promise((resolve) => {
        const socket = new net.Socket();
        socket.setTimeout(500);
        socket.on('connect', () => { socket.destroy(); resolve(true); });
        socket.on('timeout', () => { socket.destroy(); resolve(false); });
        socket.on('error', () => { socket.destroy(); resolve(false); });
        socket.connect(port, host);
      });
      if (reachable) {
        console.log(`[autoUpdater] 检测到本地代理: ${proxyUrl}`);
        return proxyUrl;
      }
    } catch (_) { /* 忽略 */ }
  }

  return null; // 未检测到代理
}

// 先直连检查更新，失败后自动切换代理重试（Gitee 国内通常无需代理）
let proxyRetryAttempted = false;
let checkRetryCount = 0;
const MAX_CHECK_RETRIES = 1; // Gitee Raw 偶发不稳定，失败后重试 1 次

async function checkForUpdatesWithRetry() {
  try {
    checkRetryCount = 0;
    await autoUpdater.checkForUpdatesAndNotify();
  } catch (err) {
    // checkForUpdatesAndNotify 可能不抛异常，错误通过 error 事件处理
  }
}

function setupAutoUpdater() {
  if (!app.isPackaged) return;

  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = false;

  // 下载重试配置：大文件下载可能中断/限速，自动重试并切换代理
  const MAX_DOWNLOAD_RETRIES = 5; // 增加到 5 次重试机会
  let downloadRetryCount = 0;
  let lastUpdateInfo = null; // 缓存已发现的更新信息，用于下载重试

  // GitHub 下载加速代理列表（2026年6月实测，按大文件速度排序）
  // 直连放最前：如果用户有 VPN/代理，直连 GitHub CDN 通常是最快的
  const GITHUB_MIRROR_PROXIES = [
    'https://ghproxy.homeboyc.cn',   // 大文件专用，1GB+ 稳定不断连，实测 2-5MB/s
    'https://gh-proxy.com',           // 多节点智能路由，实测 1.5-5MB/s
    'https://ghproxy.net',            // 无广告，断点续传支持
    'https://moeyy.cn/gh-proxy',      // 备用节点，稳定
    'https://mirror.ghproxy.com',     // 备用镜像站
  ];
  let currentProxyIndex = 0;
  let benchmarkDone = false;

  // 测速选择最优代理：并行 HEAD 请求小文件，选延迟最低的
  async function benchmarkProxies() {
    // 测速用小文件（blockmap ~278KB），避免下载大文件浪费时间
    const testUrl = 'https://github.com/johuiwu/football-quant-analyzer/releases/download/v2.8.3/football-quant-analyzer-setup-2.8.3.exe.blockmap';
    const results = await Promise.allSettled(
      GITHUB_MIRROR_PROXIES.map(async (proxy) => {
        const start = Date.now();
        return new Promise((resolve, reject) => {
          const url = `${proxy}/${testUrl}`;
          const req = require('https').get(url, { timeout: 8000, method: 'HEAD' }, (res) => {
            const elapsed = Date.now() - start;
            // 302/301 重定向也算成功（说明代理可达）
            const ok = res.statusCode < 400;
            res.resume();
            res.on('end', () => resolve({ proxy, ms: elapsed, status: res.statusCode, ok }));
          });
          req.on('error', reject);
          req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
        });
      })
    );
    // 只选可达的代理，按延迟排序
    const ok = results.filter(r => r.status === 'fulfilled' && r.value.ok)
      .map(r => r.value).sort((a, b) => a.ms - b.ms);
    if (ok.length > 0) {
      const best = ok[0];
      currentProxyIndex = GITHUB_MIRROR_PROXIES.indexOf(best.proxy);
      benchmarkDone = true;
      console.log(`[autoUpdater] 测速完成，最快代理: ${best.proxy} (${best.ms}ms)，共 ${ok.length} 个可用`);
    } else {
      console.log('[autoUpdater] 所有代理测速失败，使用默认顺序');
    }
  }

  // 拦截 electron-updater 下载请求，将 GitHub URL 重写为加速代理 URL
  // 同时拦截 exe（完整下载/差分拼接）和 blockmap（差分更新元数据）
  const { session } = require('electron');
  session.defaultSession.webRequest.onBeforeRequest(
    { urls: ['https://github.com/*/releases/download/*', 'https://objects.githubusercontent.com/*'] },
    (details, callback) => {
      const originalUrl = details.url;
      // 只拦截 exe 和 blockmap 下载请求
      const isExe = originalUrl.endsWith('.exe') || originalUrl.includes('.exe?');
      const isBlockmap = originalUrl.endsWith('.blockmap') || originalUrl.includes('.blockmap?');
      if (!isExe && !isBlockmap) {
        callback({});
        return;
      }
      const proxy = GITHUB_MIRROR_PROXIES[currentProxyIndex];
      const rewrittenUrl = `${proxy}/${originalUrl}`;
      console.log(`[autoUpdater] 代理加速: ${proxy} (第${currentProxyIndex + 1}/${GITHUB_MIRROR_PROXIES.length}个代理) [${isBlockmap ? 'blockmap' : 'exe'}]`);
      callback({ redirectURL: rewrittenUrl });
    }
  );

  autoUpdater.requestHeaders = {
    'Cache-Control': 'no-cache',
  };

  // 首次直连检查更新
  autoUpdater.checkForUpdatesAndNotify();

  autoUpdater.on("checking-for-update", () => {
    console.log("[autoUpdater] 正在检查更新...");
    if (mainWindow) mainWindow.webContents.send('update-checking');
  });

  autoUpdater.on("update-available", async (info) => {
    console.log("[autoUpdater] 发现新版本:", info.version);
    lastUpdateInfo = info; // 缓存更新信息，用于下载重试
    downloadRetryCount = 0; // 重置下载重试计数
    if (mainWindow) mainWindow.webContents.send('update-available', info);
    // 首次发现新版本时测速选最优代理（不阻塞后续流程）
    benchmarkProxies().catch(e => console.log("[autoUpdater] 测速跳过:", e.message));
  });

  autoUpdater.on("update-not-available", () => {
    console.log("[autoUpdater] 当前已是最新版本");
    if (mainWindow) mainWindow.webContents.send('update-not-available');
  });

  autoUpdater.on("download-progress", (progressObj) => {
    console.log("[autoUpdater] 下载进度:", progressObj.percent.toFixed(2) + "%");
    if (mainWindow) mainWindow.webContents.send('download-progress', progressObj);
  });

  autoUpdater.on("update-downloaded", (info) => {
    console.log("[autoUpdater] 新版本已下载，准备安装");
    if (mainWindow) mainWindow.webContents.send('update-downloaded', info);
    dialog.showMessageBox({
      type: "info",
      title: "更新下载完成",
      message: `新版本 ${info.version} 已下载完成，是否立即重启安装？`,
      buttons: ["立即重启", "稍后安装"],
      cancelId: 1,
    }).then(({ response }) => {
      if (response === 0) {
        autoUpdater.quitAndInstall();
      }
    });
  });

  autoUpdater.on("error", async (err) => {
    const msg = err.message || '';
    console.error("[autoUpdater] 更新出错:", msg);

    const isNetworkError = msg.includes('ERR_CONNECTION_REFUSED') || msg.includes('net::ERR') ||
      msg.includes('ENOTFOUND') || msg.includes('ETIMEDOUT') || msg.includes('ECONNREFUSED') ||
      msg.includes('ECONNRESET') || msg.includes('502') || msg.includes('503');

    // 风险二：下载中断/限速自动重试并切换代理（最多 5 次，间隔 1 秒）
    const isDownloadError = isNetworkError && lastUpdateInfo &&
      downloadRetryCount < MAX_DOWNLOAD_RETRIES;
    if (isDownloadError) {
      downloadRetryCount++;
      // 切换到下一个加速代理
      currentProxyIndex = (currentProxyIndex + 1) % GITHUB_MIRROR_PROXIES.length;
      const nextProxy = GITHUB_MIRROR_PROXIES[currentProxyIndex];
      console.log(`[autoUpdater] 下载中断，1s 后切换代理 ${nextProxy} 重试 (${downloadRetryCount}/${MAX_DOWNLOAD_RETRIES})...`);
      if (mainWindow) mainWindow.webContents.send('update-error', {
        message: `下载中断，切换加速线路重试 (${downloadRetryCount}/${MAX_DOWNLOAD_RETRIES})...`,
        isRetrying: true
      });
      setTimeout(() => {
        autoUpdater.downloadUpdate();
      }, 1000);
      return;
    }

    // 风险一：Gitee Raw 偶发不稳定，网络错误时自动重试 1 次（间隔 2 秒）
    if (isNetworkError && checkRetryCount < MAX_CHECK_RETRIES) {
      checkRetryCount++;
      console.log(`[autoUpdater] 网络错误，${2}s 后重试检查更新 (${checkRetryCount}/${MAX_CHECK_RETRIES})...`);
      if (mainWindow) mainWindow.webContents.send('update-error', {
        message: `网络连接不稳定，正在自动重试 (${checkRetryCount}/${MAX_CHECK_RETRIES})...`,
        isRetrying: true
      });
      setTimeout(() => {
        autoUpdater.checkForUpdatesAndNotify();
      }, 2000);
      return;
    }

    // 网络错误且尚未尝试过代理重试 → 自动检测代理并重试
    if (isNetworkError && !proxyRetryAttempted) {
      proxyRetryAttempted = true;
      console.log("[autoUpdater] 网络错误，尝试自动检测代理...");
      const proxy = await detectProxy();
      if (proxy) {
        try {
          const session = require('electron').session;
          await session.defaultSession.setProxy({ proxyRules: proxy });
          console.log(`[autoUpdater] 已设置代理 ${proxy}，重试检查更新...`);
          if (mainWindow) mainWindow.webContents.send('update-error', {
            message: `网络连接失败，已自动检测到代理 ${proxy}，正在重试...`,
            isRetrying: true
          });
          setTimeout(() => {
            autoUpdater.checkForUpdatesAndNotify();
          }, 1000);
          return;
        } catch (proxyErr) {
          console.error("[autoUpdater] 设置代理失败:", proxyErr.message);
        }
      } else {
        console.log("[autoUpdater] 未检测到可用代理");
      }
    }

    // 最终错误提示（含手动下载链接 + Gitee 备用源）
    let friendlyMsg = msg;
    if (isNetworkError) {
      friendlyMsg = `无法连接更新服务器，请检查网络连接。\n\n` +
        `加速下载（推荐）：\n` +
        `  https://ghproxy.homeboyc.cn/https://github.com/johuiwu/football-quant-analyzer/releases/latest\n\n` +
        `备用下载（Gitee 国内直连）：\n` +
        `  https://gitee.com/johuiwu/football-quant-analyzer/releases\n\n` +
        `GitHub 官方：\n` +
        `  https://github.com/johuiwu/football-quant-analyzer/releases\n` +
        `（原始错误: ${msg}）`;
    }

    if (mainWindow) mainWindow.webContents.send('update-error', {
      message: friendlyMsg,
      isRetrying: false,
      canManualDownload: isNetworkError
    });
  });
}

// IPC: 前端手动触发检查更新
ipcMain.on("check-for-updates", () => {
  autoUpdater.checkForUpdatesAndNotify();
});

// IPC: 前端手动触发下载更新
ipcMain.on("download-update", () => {
  autoUpdater.downloadUpdate();
});

// IPC: 前端触发安装更新
ipcMain.on("install-update", () => {
  autoUpdater.quitAndInstall();
});

// ─── HTTP API 辅助函数（替代直接 require ESM 模块） ───
const BACKEND_PORT = 3000;
function apiGet(apiPath) {
  return new Promise((resolve, reject) => {
    require("http").get(`http://localhost:${BACKEND_PORT}${apiPath}`, (res) => {
      let data = "";
      res.on("data", (chunk) => { data += chunk; });
      res.on("end", () => {
        try { resolve(JSON.parse(data)); }
        catch (e) { reject(new Error(`解析响应失败: ${e.message}`)); }
      });
    }).on("error", reject);
  });
}
function apiPost(apiPath, body) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body || {});
    const req = require("http").request({
      hostname: "localhost", port: BACKEND_PORT, path: apiPath,
      method: "POST", headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(payload) },
    }, (res) => {
      let data = "";
      res.on("data", (chunk) => { data += chunk; });
      res.on("end", () => {
        try { resolve(JSON.parse(data)); }
        catch (e) { reject(new Error(`解析响应失败: ${e.message}`)); }
      });
    });
    req.on("error", reject);
    req.write(payload);
    req.end();
  });
}

app.whenReady().then(async () => {
  setupAutoUpdater();

  // IPC 处理器
  ipcMain.handle('get-app-version', () => app.getVersion());
  ipcMain.handle('get-is-packaged', () => app.isPackaged());

  // ★ 角球系统 IPC 通道 — 通过 HTTP API 调用后端
  ipcMain.handle('corner:get-status', async () => {
    try {
      return await apiGet('/api/corner/status');
    } catch (e) { return { success: false, error: e.message }; }
  });

  ipcMain.handle('corner:start-polling', async () => {
    try {
      return await apiPost('/api/corner/start');
    } catch (e) { return { success: false, error: e.message }; }
  });

  ipcMain.handle('corner:stop-polling', async () => {
    try {
      return await apiPost('/api/corner/stop');
    } catch (e) { return { success: false, error: e.message }; }
  });

  ipcMain.handle('corner:pending-confirms', async () => {
    try {
      return await apiGet('/api/corner/pending-confirms');
    } catch (e) { return { success: false, error: e.message }; }
  });

  ipcMain.handle('corner:confirm-bet', async (_event, betId) => {
    try {
      return await apiPost(`/api/corner/confirm-bet/${betId}`);
    } catch (e) { return { success: false, error: e.message }; }
  });

  ipcMain.handle('corner:reject-bet', async (_event, betId) => {
    try {
      return await apiPost(`/api/corner/reject-bet/${betId}`);
    } catch (e) { return { success: false, error: e.message }; }
  });

  if (!await loadServerModule()) {
    console.error("[electron] 无法加载后端，退出");
    app.quit();
    return;
  }

  if (!isDev) {
    try {
      await startServer(3000);
      console.log("[electron] 后端已启动 (内嵌)");
    } catch (err) {
      console.error("[electron] 后端启动失败:", err.message);
    }
  }

  createWindow();
});

app.on("window-all-closed", () => {
  if (stopServer) stopServer();
  app.quit();
});

app.on("before-quit", () => {
  if (stopServer) stopServer();
});