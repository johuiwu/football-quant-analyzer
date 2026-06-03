import express from "express";
import path from "path";
import dotenv from "dotenv";
import { createServer as createViteServer } from "vite";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";

import apiRoutes from "./backend/routes/index.js";

dotenv.config();

// ==================== 环境变量校验 ====================
const recommendedEnvVars = [
  { key: 'DEEPSEEK_API_KEY', desc: 'DeepSeek AI 分析（缺失时降级为离线模式）' },
  { key: 'HG_USERNAME', desc: 'HG 爬虫登录用户名（缺失时爬虫不可用）' },
  { key: 'HG_PASSWORD', desc: 'HG 爬虫登录密码（缺失时爬虫不可用）' },
];
const missingVars: string[] = [];
for (const { key, desc } of recommendedEnvVars) {
  const val = process.env[key];
  const isPlaceholder = !val
    || val === 'MY_' + key
    || val.startsWith('YOUR_')
    || val === 'CHANGE_ME'
    || val === 'REPLACE_ME'
    || (val === key);  // 值等于键名本身
  if (isPlaceholder) {
    missingVars.push(`  - ${key}: ${desc}`);
  }
}
if (missingVars.length > 0) {
  console.warn('[启动检查] 以下环境变量未配置（系统将降级运行）:\n' + missingVars.join('\n'));
}

const app = express();
const PORT = parseInt(process.env.PORT || "3000", 10);

// CSP: dev 模式放宽内联脚本 (Vite HMR 需要), prod 严格
const isDev = process.env.NODE_ENV !== 'production';
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: isDev ? ["'self'", "'unsafe-inline'"] : ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:"],
      connectSrc: ["'self'", "http://localhost:*", "ws://localhost:*"],
      fontSrc: ["'self'"],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'"],
      frameSrc: ["'none'"],
    },
  },
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// ==================== CORS ?? ====================
const allowedOrigins = process.env.NODE_ENV === 'production'
  ? ['http://localhost:3000', 'http://127.0.0.1:3000']
  : [
      'http://localhost:5173',
      'http://localhost:3000',
      'http://127.0.0.1:5173',
      'http://127.0.0.1:3000',
    ];

const corsOptions: cors.CorsOptions = {
  origin: (origin, callback) => {
    // ????????Electron ??????? origin?
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  credentials: true,
  maxAge: 86400, // ?????? 1 ?
};

app.use(cors(corsOptions));

// CORS ??????????
app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  if (err.message === 'Not allowed by CORS') {
    res.status(403).json({ error: 'CORS not allowed', status: 403 });
  } else {
    _next(err);
  }
});

// ????????????
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('Global error handler:', err);
  res.status(500).json({
    success: false,
    error: '服务器内部错误',
    detail: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

// Rate limiting: 500 requests per 15 min window
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 500,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: "Too many requests, please try again later" },
});
app.use('/api/', apiLimiter);

app.use("/api", apiRoutes); // [RouteMigration] all API routes => backend/routes/index.js

let _serverInstance: any = null;

async function startServer(port: number = PORT): Promise<any> {
  if (_serverInstance) return _serverInstance;
  try {
    if (process.env.NODE_ENV !== "production") {
      // Vite middleware for rendering TS React in dev
      const vite = await createViteServer({
        server: { middlewareMode: true },
        appType: "spa",
      });
      app.use(vite.middlewares);
    } else {
      // Static asset folders — 优先使用 STATIC_DIR (Electron 打包环境)
      const distPath = process.env.STATIC_DIR || path.join(process.cwd(), "dist");
      app.use(express.static(distPath));
      app.get("*", (req, res) => {
        res.sendFile(path.join(distPath, "index.html"));
      });
    }

    return new Promise((resolve, reject) => {
      _serverInstance = app.listen(port, "0.0.0.0", () => {
        console.log(`Express server running at http://localhost:${port}`);
        resolve(_serverInstance);
      });

      _serverInstance.on('error', (err: any) => {
        if (err.code === 'EADDRINUSE') {
          console.log(`Port ${port} in use, trying ${port + 1}...`);
          _serverInstance.close(() => {
            _serverInstance = null;
            resolve(startServer(port + 1));
          });
        } else {
          console.error('Server error:', err);
          reject(err);
        }
      });
    });
  } catch (e) {
    console.error("Failed to start server:", e);
    throw e;
  }
}

function stopServer(): void {
  if (_serverInstance) {
    _serverInstance.close();
    _serverInstance = null;
    console.log("Server stopped.");
  }
}

// 直接运行 server.ts (非 require) 时自动启动
const _isMainModule = process.argv[1] && (
  process.argv[1].endsWith("server.ts") ||
  process.argv[1].endsWith("server.cjs") ||
  process.argv[1].endsWith("server.js")
);
if (_isMainModule) {
  startServer().catch((e) => {
    console.error("Failed to start server:", e);
  });
}

// Electron 主进程 require 入口
// esbuild CJS bundle 冻结了 exports 对象，改用 globalThis 暴露
(globalThis as any).__startServer = startServer;
(globalThis as any).__stopServer = stopServer;
export { startServer, stopServer };
