// Build setup script for electron-builder packaging
// Copies required resources to build_resources/ directory

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const BUILD_RES = path.join(ROOT, 'build_resources');

function copyDir(src, dest, filter = () => true) {
  if (!fs.existsSync(src)) {
    console.warn(`[build-setup] Source directory not found: ${src}`);
    return;
  }

  if (!fs.existsSync(dest)) {
    fs.mkdirSync(dest, { recursive: true });
  }

  const entries = fs.readdirSync(src, { withFileTypes: true });
  let count = 0;
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    if (entry.isDirectory()) {
      copyDir(srcPath, destPath, filter);
    } else if (filter(entry.name)) {
      fs.copyFileSync(srcPath, destPath);
      count++;
    }
  }
  if (count > 0) console.log(`[build-setup] Copied ${count} files: ${src} → ${dest}`);
}

// Clean previous build_resources
if (fs.existsSync(BUILD_RES)) {
  fs.rmSync(BUILD_RES, { recursive: true, force: true });
  console.log('[build-setup] Cleaned build_resources/');
}

// 1. Copy database files
const dbSrc = path.join(ROOT, 'database');
const dbDest = path.join(BUILD_RES, 'database');
copyDir(dbSrc, dbDest, (name) => {
  return name.endsWith('.db') || name.endsWith('.db-shm') || name.endsWith('.db-wal') || name.endsWith('.bak');
});
console.log('[build-setup] Database files ready');

// 2. (已移除) 不再打包 Chromium — 改用用户本地 Chrome/Edge 浏览器
console.log('[build-setup] Puppeteer 将使用本地 Chrome/Edge，无需打包 Chromium');

// 3. Copy icon to build_resources
const iconSrc = path.join(ROOT, 'public', 'icon.ico');
const iconDest = path.join(BUILD_RES, 'icon.ico');
if (fs.existsSync(iconSrc)) {
  fs.copyFileSync(iconSrc, iconDest);
  console.log('[build-setup] Icon copied to build_resources');
}

// 4. Verify init-tables.sql exists (needed for first-start auto-init)
const initSqlSrc = path.join(ROOT, 'database', 'init-tables.sql');
if (!fs.existsSync(initSqlSrc)) {
  console.error('[build-setup] database/init-tables.sql not found!');
  console.error('[build-setup] This file is required for database auto-initialization.');
  process.exit(1);
}
console.log('[build-setup] init-tables.sql verified');

console.log('[build-setup] Build resources ready!');

function getDirSize(dirPath) {
  let total = 0;
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      total += getDirSize(fullPath);
    } else {
      total += fs.statSync(fullPath).size;
    }
  }
  return total;
}