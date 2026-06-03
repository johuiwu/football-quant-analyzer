---
name: electron-packager
description: >
  Electron 桌面应用打包与发布。当需要构建 Windows 安装包、
  配置 electron-builder、处理原生模块打包问题时使用。
  适用场景：(1) 构建发布包 npm run build:electron
  (2) electron-builder 配置修改 (3) 原生依赖打包异常
  (4) asar 解包配置 (5) 版本号升级与发布。
---

# Electron 打包发布

## 项目结构

```
electron/
├── main.cjs      — Electron 主进程
└── preload.cjs   — 预加载脚本

package.json      — electron-builder 配置在 "build" 字段
```

## 构建命令

| 命令 | 用途 |
|------|------|
| `npm run dev` | 开发模式（仅 Vite + Express 后端） |
| `npm run dev:electron` | Electron 开发模式 |
| `npm run build` | Vite 前端 + esbuild 后端打包 |
| `npm run build:electron` | 完整构建 + Windows NSIS 安装包 |
| `npm run test` | 运行 vitest 测试 |

## electron-builder 关键配置

- **appId**: `com.football.quant.analyzer`
- **输出目录**: `release/`
- **打包文件**: `dist/**/*`, `electron/**/*`, `package.json`
- **额外资源**: `database/`, `config/`, `output/`
- **asar 解包**: `sqlite`, `sqlite3`, `better-sqlite3`（原生模块不可 asar）
- **NSIS**: 允许自定义安装目录，桌面快捷方式

## 常见问题

1. **sqlite3 打包失败**: 检查 `asarUnpack` 是否包含 `node_modules/sqlite3/**`
2. **electron 版本不匹配**: 检查 `devDependencies.electron` 与 `electron-builder` 兼容性
3. **原生模块重建**: 运行 `npx electron-rebuild` 针对当前 Electron 版本重建
4. **dist 目录缺失**: 先运行 `npm run build` 再 `npm run build:electron`

## 发布流程

1. 更新 `package.json` 中的 `version`
2. 运行 `npm run build:electron`
3. 输出在 `release/` 目录，NSIS 安装包为 `.exe`
4. 测试安装包: 安装 → 启动 → 验证所有功能
