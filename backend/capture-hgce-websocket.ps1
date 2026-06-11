# capture-hgce-websocket.ps1
# 自动捕获 HgCeApp.exe 运行时的 WebSocket 连接地址
# 需要管理员权限运行

$ErrorActionPreference = "Stop"

# === 1. 检查管理员权限 ===
$isAdmin = ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
    Write-Host "[ERROR] 此脚本需要管理员权限运行，请右键选择'以管理员身份运行'。" -ForegroundColor Red
    Read-Host "按回车退出"
    exit 1
}

# === 2. 检查 tshark 是否可用 ===
$tshark = $null
$tsharkPaths = @(
    "tshark.exe",
    "C:\Program Files\Wireshark\tshark.exe",
    "C:\Program Files (x86)\Wireshark\tshark.exe"
)

foreach ($p in $tsharkPaths) {
    try {
        $result = Get-Command $p -ErrorAction SilentlyContinue
        if ($result) { $tshark = $result.Source; break }
    } catch {}
}

if (-not $tshark) {
    Write-Host "[ERROR] 未找到 tshark.exe，请安装 Wireshark：" -ForegroundColor Red
    Write-Host "  下载地址: https://www.wireshark.org/download.html" -ForegroundColor Yellow
    Write-Host "  安装时请勾选 'Install Npcap' 和 'Add Wireshark to PATH'" -ForegroundColor Yellow
    Read-Host "按回车退出"
    exit 1
}

Write-Host "[OK] tshark 路径: $tshark" -ForegroundColor Green

# === 3. 自动检测网络接口 ===
Write-Host "`n[INFO] 正在检测网络接口..." -ForegroundColor Cyan
$ifaceList = & $tshark -D 2>$null
if ($LASTEXITCODE -ne 0 -or -not $ifaceList) {
    Write-Host "[ERROR] 无法获取网络接口列表，请确认 Npcap 已安装。" -ForegroundColor Red
    Read-Host "按回车退出"
    exit 1
}

# 选择第一个非回环接口
$selectedIface = $null
foreach ($line in $ifaceList) {
    if ($line -match '^\s*(\d+)\.\s+(.+)$') {
        $idx = $matches[1]
        $desc = $matches[2]
        if ($desc -notmatch 'Loopback|Adapter for loopback' -and -not $selectedIface) {
            $selectedIface = $idx
            Write-Host "[OK] 选择接口 $idx : $desc" -ForegroundColor Green
        } else {
            Write-Host "  备选接口 $idx : $desc" -ForegroundColor Gray
        }
    }
}

if (-not $selectedIface) {
    Write-Host "[ERROR] 未找到可用的网络接口。" -ForegroundColor Red
    Read-Host "按回车退出"
    exit 1
}

# === 4. 准备捕获 ===
$outputDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$pcapFile = Join-Path $outputDir "hgce_capture.pcap"
$urlFile  = Join-Path $outputDir "websocket_url.txt"

# 清理旧文件
if (Test-Path $pcapFile) { Remove-Item $pcapFile -Force }
if (Test-Path $urlFile)  { Remove-Item $urlFile -Force }

$captureDuration = 30

Write-Host "`n[INFO] 即将开始网络捕获（${captureDuration}秒）" -ForegroundColor Cyan
Write-Host "[INFO] 请确保 HgCeApp.exe 已启动并正在运行" -ForegroundColor Yellow
Write-Host "[INFO] 捕获过滤器: websocket || tcp.port == 443" -ForegroundColor Yellow
Write-Host ""

# === 5. 启动 tshark 捕获 ===
Write-Host "[START] 开始捕获..." -ForegroundColor Green

$tsharkArgs = @(
    "-i", $selectedIface,
    "-a", "duration:$captureDuration",
    "-f", "tcp port 443 or tcp port 8080 or tcp port 80 or tcp port 8443",
    "-w", $pcapFile,
    "-q"
)

$tsharkProc = Start-Process -FilePath $tshark -ArgumentList $tsharkArgs -NoNewWindow -PassThru

# 显示倒计时
for ($s = $captureDuration; $s -gt 0; $s--) {
    Write-Host "`r[CAPTURE] 剩余 ${s} 秒..." -NoNewline -ForegroundColor Yellow
    Start-Sleep -Seconds 1
}
Write-Host "`r[CAPTURE] 捕获完成!              " -ForegroundColor Green

# 等待 tshark 进程结束
if (-not $tsharkProc.HasExited) {
    $tsharkProc.WaitForExit(10000)
}
if (-not $tsharkProc.HasExited) {
    $tsharkProc.Kill()
}

# === 6. 分析捕获文件 ===
Write-Host "`n[ANALYZE] 正在分析捕获数据..." -ForegroundColor Cyan

$wsUrl = $null

# --- 6a. 尝试提取明文 WebSocket Upgrade 请求 ---
Write-Host "  [1/3] 检查明文 WebSocket Upgrade..." -ForegroundColor Gray
try {
    $upgradeResult = & $tshark -r $pcapFile -Y "http.upgrade contains `"websocket`"" -T fields -e http.host -e http.request.uri -e ip.dst 2>$null
    if ($upgradeResult -and $upgradeResult.Trim().Length -gt 0) {
        foreach ($line in $upgradeResult -split "`n") {
            $line = $line.Trim()
            if ($line -match '^(\S+)\s+(\S+)\s+(\S+)$') {
                $host = $matches[1]
                $uri = $matches[2]
                $dstIp = $matches[3]
                if ($host -and $uri) {
                    $wsUrl = "ws://${host}${uri}"
                    Write-Host "  [FOUND] 明文 WebSocket: $wsUrl" -ForegroundColor Green
                    break
                }
            }
        }
    }
} catch {}

# --- 6b. 尝试提取 TLS SNI (WSS 场景) ---
if (-not $wsUrl) {
    Write-Host "  [2/3] 检查 TLS SNI (加密 WebSocket)..." -ForegroundColor Gray
    try {
        $sniResult = & $tshark -r $pcapFile -Y "tls.handshake.type == 1" -T fields -e tls.handshake.extensions_server_name -e tcp.dstport -e ip.dst 2>$null
        if ($sniResult -and $sniResult.Trim().Length -gt 0) {
            $seenHosts = @{}
            foreach ($line in $sniResult -split "`n") {
                $line = $line.Trim()
                if ($line -match '^(\S+)\s+(\S+)\s+(\S+)$') {
                    $sni = $matches[1]
                    $port = $matches[2]
                    $ip = $matches[3]
                    if ($sni -and $sni -notmatch '^\.' -and -not $seenHosts.ContainsKey($sni)) {
                        $seenHosts[$sni] = $true
                        # 过滤掉明显的非目标域名
                        if ($sni -match 'hga|hgce|crw|corner|bet|sport|football|soccer') {
                            $wsUrl = "wss://${sni}/ws"
                            Write-Host "  [FOUND] TLS SNI 匹配: $sni (port=$port, ip=$ip)" -ForegroundColor Green
                            break
                        }
                    }
                }
            }

            # 如果没有精确匹配，取第一个非空 SNI
            if (-not $wsUrl) {
                foreach ($line in $sniResult -split "`n") {
                    $line = $line.Trim()
                    if ($line -match '^(\S+)\s+') {
                        $sni = $matches[1]
                        if ($sni -and $sni -notmatch '^\.' -and $sni -notmatch 'ocsp|crl|cert|windowsupdate|microsoft|google|mozilla|cdn|akamai|cloudflare') {
                            $wsUrl = "wss://${sni}/ws"
                            Write-Host "  [FOUND] TLS SNI 候选: $sni" -ForegroundColor Yellow
                            break
                        }
                    }
                }
            }
        }
    } catch {}
}

# --- 6c. 尝试提取 TCP 连接目标 (最后手段) ---
if (-not $wsUrl) {
    Write-Host "  [3/3] 检查 TCP 连接目标..." -ForegroundColor Gray
    try {
        $tcpResult = & $tshark -r $pcapFile -Y "tcp.flags.syn == 1 and tcp.flags.ack == 0 and tcp.dstport == 443" -T fields -e ip.dst -e tcp.dstport 2>$null
        if ($tcpResult -and $tcpResult.Trim().Length -gt 0) {
            $seenIps = @{}
            foreach ($line in $tcpResult -split "`n") {
                $line = $line.Trim()
                if ($line -match '^(\S+)\s+(\S+)$') {
                    $ip = $matches[1]
                    $port = $matches[2]
                    if (-not $seenIps.ContainsKey($ip)) {
                        $seenIps[$ip] = $true
                        Write-Host "  [INFO] TCP 连接到: ${ip}:${port}" -ForegroundColor Gray
                    }
                }
            }
        }
    } catch {}
}

# === 7. 输出结果 ===
Write-Host "`n[RESULT] " -NoNewline

if ($wsUrl) {
    # 确保只有一行 URL
    $wsUrl = ($wsUrl -split "`n")[0].Trim()
    Set-Content -Path $urlFile -Value $wsUrl -NoNewline -Encoding UTF8
    Write-Host "WebSocket URL: $wsUrl" -ForegroundColor Green
    Write-Host "[OK] 已写入: $urlFile" -ForegroundColor Green

    # 自动打开文件
    Start-Process notepad.exe $urlFile
} else {
    Write-Host "未能自动提取 WebSocket URL" -ForegroundColor Red
    Write-Host ""
    Write-Host "可能原因:" -ForegroundColor Yellow
    Write-Host "  1. HgCeApp.exe 未在捕获期间运行" -ForegroundColor Yellow
    Write-Host "  2. WSS 连接的 URL 路径被 TLS 加密隐藏" -ForegroundColor Yellow
    Write-Host "  3. 网络接口选择不正确" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "建议操作:" -ForegroundColor Cyan
    Write-Host "  - 使用 Wireshark GUI 打开捕获文件手动分析: $pcapFile" -ForegroundColor Cyan
    Write-Host "  - 或使用 dnSpy 在 ClientWebSocket.ConnectAsync 设断点" -ForegroundColor Cyan
    Write-Host "  - 或运行: tshark -r `"$pcapFile`" -Y `"tls.handshake.type==1`" -T fields -e tls.handshake.extensions_server_name" -ForegroundColor Cyan

    # 写入所有发现的 SNI 供参考
    try {
        $allSni = & $tshark -r $pcapFile -Y "tls.handshake.type == 1" -T fields -e tls.handshake.extensions_server_name 2>$null
        if ($allSni) {
            $uniqueSni = ($allSni -split "`n" | Where-Object { $_.Trim().Length -gt 0 -and $_.Trim() -notmatch '^\.' } | Sort-Object -Unique) -join "`n"
            if ($uniqueSni.Trim().Length -gt 0) {
                Set-Content -Path $urlFile -Value "# 未找到确切WS URL, 以下是捕获到的TLS SNI:`n$uniqueSni" -Encoding UTF8
                Write-Host "[INFO] SNI 列表已保存到: $urlFile" -ForegroundColor Yellow
                Start-Process notepad.exe $urlFile
            }
        }
    } catch {}
}

# 清理临时 pcap 文件（可选）
Write-Host "`n[INFO] 捕获文件保留在: $pcapFile" -ForegroundColor Gray
Write-Host "[DONE]" -ForegroundColor Green
