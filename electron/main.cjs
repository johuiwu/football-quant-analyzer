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

function loadServerModule() {
  try {
    // 设置数据库路径（必须在 require 之前设置）
    const dbPath = isDev
      ? path.join(__dirname, "..", "database")
      : path.join(process.resourcesPath, "database");

    // 确保数据库目录存在
    if (!fs.existsSync(dbPath)) {
      fs.mkdirSync(dbPath, { recursive: true });
    }

    // Cookie 文件路径（必须是可写目录）
    const userDataPath = path.join(process.env.APPDATA || process.env.HOME || '.', '足球竞彩量化分析系统');
    const cookiePath = isDev
      ? path.join(__dirname, "..", "backend", "cookies.json")
      : path.join(userDataPath, "cookies.json");

    const staticDir = path.join(__dirname, "..", "dist");

    process.env.DB_DIR = dbPath;
    process.env.COOKIE_PATH = cookiePath;
    process.env.STATIC_DIR = staticDir;
    process.env.DISABLE_HMR = "true";
    process.env.NODE_ENV = "production";

    // 设置 Puppeteer Chrome 执行路径（打包后的 Chromium 路径）
    const chromePath = path.join(process.resourcesPath, "chrome", "chrome-win64", "chrome.exe");
    if (fs.existsSync(chromePath)) {
      process.env.PUPPETEER_EXECUTABLE_PATH = chromePath;
      console.log("[electron] 使用捆绑 Chromium:", chromePath);
    } else {
      console.warn("[electron] 未找到捆绑 Chromium，Puppeteer 将尝试查找系统 Chrome");
    }

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

async function checkForUpdatesWithProxyRetry() {
  try {
    await autoUpdater.checkForUpdatesAndNotify();
  } catch (err) {
    // checkForUpdatesAndNotify 可能不抛异常，错误通过 error 事件处理
  }
}

function setupAutoUpdater() {
  if (!app.isPackaged) return;

  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = false;

  // 首次直连检查更新
  autoUpdater.checkForUpdatesAndNotify();

  autoUpdater.on("checking-for-update", () => {
    console.log("[autoUpdater] 正在检查更新...");
    if (mainWindow) mainWindow.webContents.send('update-checking');
  });

  autoUpdater.on("update-available", (info) => {
    console.log("[autoUpdater] 发现新版本:", info.version);
    if (mainWindow) mainWindow.webContents.send('update-available', info);
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
      msg.includes('ENOTFOUND') || msg.includes('ETIMEDOUT') || msg.includes('ECONNREFUSED');

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
            message: `网络连接失败，已自动检测到代理 ${proxy}，正在重试...`
          });
          // 短暂延迟后重试
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

    // 最终错误提示
    let friendlyMsg = msg;
    if (isNetworkError) {
      friendlyMsg = `无法连接更新服务器，请检查网络连接。\n` +
        `如网络异常，可手动下载最新版本：\n` +
        `  https://github.com/johuiwu/football-quant-analyzer/releases\n` +
        `（原始错误: ${msg}）`;
    }

    if (mainWindow) mainWindow.webContents.send('update-error', { message: friendlyMsg });
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

  if (!loadServerModule()) {
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