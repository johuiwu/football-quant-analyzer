# Windows 中文乱码问题修复

## 问题原因
在 Windows 上运行 Node.js 脚本时，终端默认使用 GBK 编码，而代码中的中文使用 UTF-8 编码保存，导致显示乱码。

## 解决方案

### 1. 使用批处理文件运行（推荐）
对于诊断脚本，直接双击运行：
```
scripts\run-diagnose.bat
```

对于开发模式，双击运行：
```
scripts\start-dev.bat
```

### 2. 手动设置终端编码
如果直接在终端中运行，先执行：
```cmd
chcp 65001
```
然后再运行 Node.js 脚本。

### 3. 使用 PowerShell
在 PowerShell 中运行：
```powershell
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
node scripts/diagnose-matches.cjs
```

## 已修改的文件
- `scripts/diagnose-matches.cjs` - 添加了 UTF-8 编码设置
- `scripts/run-diagnose.bat` - 诊断脚本的启动批处理
- `scripts/start-dev.bat` - 开发模式的启动批处理

## 说明
- `chcp 65001` 命令将终端编码设置为 UTF-8
- 批处理文件会自动处理编码问题，无需手动操作
