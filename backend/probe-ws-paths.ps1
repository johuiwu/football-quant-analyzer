# probe-ws-paths-v2.ps1
# Probe WebSocket paths on www.hga038.com - compatible with PS5.1

Write-Host "=== WebSocket Path Probe v2 ===" -ForegroundColor Cyan
Write-Host "Target: www.hga038.com (112.78.104.175)" -ForegroundColor Yellow
Write-Host ""

$baseHost = "www.hga038.com"
$paths = @(
    "/ws", "/websocket", "/socket", "/api/ws", "/realtime",
    "/signalr/connect", "/v1/ws", "/push", "/hg/ws", "/live",
    "/stream", "/feed", "/corner/ws", "/game/ws", "/data/ws",
    "/sport/ws", "/bet/ws", "/app/ws", "/client", "/connect",
    "/ws/live", "/api/socket", "/hub", "/eventbus"
)

$results = @()

foreach ($path in $paths) {
    $url = "wss://${baseHost}${path}"
    Write-Host "  Probing: $url ... " -NoNewline -ForegroundColor Gray
    
    try {
        $ws = New-Object System.Net.WebSockets.ClientWebSocket
        $cts = New-Object System.Threading.CancellationTokenSource(5000)
        
        # ClientWebSocket in .NET Framework does not support SetRequestHeader
        # Just try connecting directly
        $uri = [System.Uri]::new($url)
        $task = $ws.ConnectAsync($uri, $cts.Token)
        
        # Wait with timeout
        $completed = $task.Wait(5000)
        
        if ($completed -and $ws.State -eq [System.Net.WebSockets.WebSocketState]::Open) {
            Write-Host "OPEN!" -ForegroundColor Green
            $results += @{ Path=$path; Url=$url; Status="OPEN" }
            $ws.CloseAsync([System.Net.WebSockets.WebSocketCloseStatus]::NormalClosure, "", [System.Threading.CancellationToken]::None).Wait(2000)
        } elseif ($ws.State -eq [System.Net.WebSockets.WebSocketState]::Closed) {
            $closeStatus = $ws.CloseStatus
            $closeDesc = $ws.CloseStatusDescription
            Write-Host "Closed ($closeStatus): $closeDesc" -ForegroundColor Yellow
            $results += @{ Path=$path; Url=$url; Status="Closed:$closeStatus" }
        } else {
            Write-Host "State: $($ws.State)" -ForegroundColor Yellow
            $results += @{ Path=$path; Url=$url; Status=$ws.State.ToString() }
        }
    } catch {
        $errMsg = $_.Exception.InnerException.Message
        if (-not $errMsg) { $errMsg = $_.Exception.Message }
        
        if ($errMsg -match '404|NotFound|not found') {
            Write-Host "404 Not Found" -ForegroundColor Red
            $results += @{ Path=$path; Url=$url; Status="404" }
        } elseif ($errMsg -match '403|Forbidden|Unauthorized|401') {
            Write-Host "403/401 (path exists!)" -ForegroundColor Yellow
            $results += @{ Path=$path; Url=$url; Status="403" }
        } elseif ($errMsg -match '502|Bad.Gateway') {
            Write-Host "502 Bad Gateway" -ForegroundColor DarkYellow
            $results += @{ Path=$path; Url=$url; Status="502" }
        } elseif ($errMsg -match 'protocol|upgrade|handshake') {
            Write-Host "Protocol error (path may exist)" -ForegroundColor Yellow
            $results += @{ Path=$path; Url=$url; Status="ProtocolError" }
        } elseif ($errMsg -match 'timeout|timed.out|cancelled') {
            Write-Host "Timeout" -ForegroundColor DarkYellow
            $results += @{ Path=$path; Url=$url; Status="Timeout" }
        } elseif ($errMsg -match 'SSL|TLS|certificate|trust') {
            Write-Host "SSL/TLS error" -ForegroundColor DarkRed
            $results += @{ Path=$path; Url=$url; Status="SSL" }
        } elseif ($errMsg -match 'refused|reset|closed|connect') {
            Write-Host "Connection refused/reset" -ForegroundColor Red
            $results += @{ Path=$path; Url=$url; Status="ConnRefused" }
        } else {
            $short = $errMsg.Substring(0, [Math]::Min(80, $errMsg.Length))
            Write-Host $short -ForegroundColor DarkGray
            $results += @{ Path=$path; Url=$url; Status="Error:$short" }
        }
    }
    
    try { $ws.Dispose() } catch {}
}

# HTTP probe using WebClient (compatible with PS5.1)
Write-Host ""
Write-Host "=== HTTP Path Probe ===" -ForegroundColor Cyan

$httpPaths = @(
    "/ws", "/websocket", "/socket", "/api/ws", "/signalr",
    "/signalr/negotiate", "/sockjs/info", "/hub", "/realtime",
    "/push", "/live", "/transform.php"
)

foreach ($hp in $httpPaths) {
    $httpUrl = "https://${baseHost}${hp}"
    Write-Host "  HTTP: $httpUrl ... " -NoNewline -ForegroundColor Gray
    try {
        $wc = New-Object System.Net.WebClient
        $wc.Headers.Add("User-Agent", "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X)")
        $wc.Headers.Add("X-Requested-With", "XMLHttpRequest")
        [System.Net.ServicePointManager]::ServerCertificateValidationCallback = { $true }
        $data = $wc.DownloadData($httpUrl)
        $text = [System.Text.Encoding]::UTF8.GetString($data)
        Write-Host "$($data.Length) bytes" -ForegroundColor Green
        if ($data.Length -lt 300) {
            Write-Host "    Body: $($text.Substring(0, [Math]::Min(200, $text.Length)))" -ForegroundColor DarkGray
        }
    } catch {
        $em = $_.Exception.Message
        if ($_.Exception.InnerException) { $em = $_.Exception.InnerException.Message }
        $short = $em.Substring(0, [Math]::Min(60, $em.Length))
        Write-Host $short -ForegroundColor DarkGray
    }
}

[System.Net.ServicePointManager]::ServerCertificateValidationCallback = $null

# Summary
Write-Host ""
Write-Host ("=" * 50) -ForegroundColor Cyan
Write-Host "SUMMARY" -ForegroundColor Cyan
Write-Host ""

# Group by status
$groups = $results | Group-Object -Property Status | Sort-Object -Property Count -Descending
foreach ($g in $groups) {
    Write-Host "  $($g.Name): $($g.Count) paths" -ForegroundColor White
    foreach ($item in $g.Group) {
        Write-Host "    $($item.Url)" -ForegroundColor DarkGray
    }
}

# Write result
$urlFile = Join-Path (Split-Path -Parent $MyInvocation.MyCommand.Path) "websocket_url.txt"
$openResult = $results | Where-Object { $_.Status -eq "OPEN" } | Select-Object -First 1
if ($openResult) {
    Set-Content -Path $urlFile -Value $openResult.Url -NoNewline -Encoding UTF8
    Write-Host "WebSocket URL: $($openResult.Url)" -ForegroundColor Green
    Start-Process notepad.exe $urlFile
} else {
    $forbidden = $results | Where-Object { $_.Status -match "403|ProtocolError" } | Select-Object -First 1
    if ($forbidden) {
        Set-Content -Path $urlFile -Value $forbidden.Url -NoNewline -Encoding UTF8
        Write-Host "Likely WS URL: $($forbidden.Url)" -ForegroundColor Yellow
        Start-Process notepad.exe $urlFile
    } else {
        Set-Content -Path $urlFile -Value "wss://www.hga038.com/ws" -NoNewline -Encoding UTF8
        Write-Host "Best guess: wss://www.hga038.com/ws" -ForegroundColor Yellow
        Start-Process notepad.exe $urlFile
    }
}
