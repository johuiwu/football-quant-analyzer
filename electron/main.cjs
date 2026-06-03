// Electron 主进程 — 直接 require 后端模块，不 spawn 子进程
const { app, BrowserWindow, ipcMain } = require("electron");
const path = require("path");
const fs = require("fs");

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

    const staticDir = path.join(__dirname, "..", "dist");

    process.env.DB_DIR = dbPath;
    process.env.STATIC_DIR = staticDir;
    // 禁用 qiumiwu 爬虫（其动态 import TS 文件在生产环境不可用）
    process.env.DISABLE_CRAWLER = "true";
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
    icon: path.join(__dirname, "..", "public", "icon.ico"),
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
app.whenReady().then(async () => {
  // IPC 处理器
  ipcMain.handle('get-app-version', () => app.getVersion());
  ipcMain.handle('get-is-packaged', () => app.isPackaged());

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