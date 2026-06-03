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

// 2. Copy Chrome/Chromium from Puppeteer cache
const userHome = require('os').homedir();
const chromeCacheDir = path.join(userHome, '.cache', 'puppeteer', 'chrome');

if (fs.existsSync(chromeCacheDir)) {
  const chromeVersions = fs.readdirSync(chromeCacheDir);
  if (chromeVersions.length > 0) {
    // Use the latest version
    const latestVersion = chromeVersions.sort().reverse()[0];
    const chromeSrc = path.join(chromeCacheDir, latestVersion, 'chrome-win64');
    const chromeDest = path.join(BUILD_RES, 'chrome', 'chrome-win64');

    if (fs.existsSync(chromeSrc)) {
      copyDir(chromeSrc, chromeDest, () => true);
      const totalSize = getDirSize(chromeDest);
      console.log(`[build-setup] Chromium copied: ${chromeSrc} → ${chromeDest} (${(totalSize / 1024 / 1024).toFixed(1)} MB)`);
    } else {
      console.warn(`[build-setup] Chrome-win64 not found at: ${chromeSrc}`);
    }
  } else {
    console.warn('[build-setup] No Chrome versions found in Puppeteer cache');
  }
} else {
  console.warn('[build-setup] Puppeteer Chrome cache not found, skipping Chromium bundling');
  console.warn('[build-setup] Note: Corner crawler will use system Chrome if available');
}

// 3. Copy icon to build_resources
const iconSrc = path.join(ROOT, 'public', 'icon.ico');
const iconDest = path.join(BUILD_RES, 'icon.ico');
if (fs.existsSync(iconSrc)) {
  fs.copyFileSync(iconSrc, iconDest);
  console.log('[build-setup] Icon copied to build_resources');
}

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