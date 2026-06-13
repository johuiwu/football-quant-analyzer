# probe-ws-deep.ps1
# Deep probe of WSS paths that returned "Closed" status
# These paths likely exist but need authentication

Write-Host "=== Deep WSS Path Probe ===" -ForegroundColor Cyan
Write-Host ""

$baseHost = "www.hga038.com"
$candidatePaths = @("/realtime", "/client", "/api/socket", "/eventbus", "/ws", "/websocket", "/socket")

# Also try alternative domain patterns from INI (hga038, hga050 etc)
$altHosts = @("www.hga038.com", "m510.crw066.com", "www.hga038.com")

foreach ($host2 in $altHosts) {
    Write-Host "Testing host: $host2" -ForegroundColor Yellow
    
    # DNS check
    try {
        $ips = [System.Net.Dns]::GetHostAddresses($host2)
        Write-Host "  DNS: $host2 -> $($ips[0])" -ForegroundColor Green
    } catch {
        Write-Host "  DNS: $host2 -> FAILED" -ForegroundColor Red
        continue
    }
    
    foreach ($path in $candidatePaths) {
        $url = "wss://${host2}${path}"
        Write-Host "  WSS: $url ... " -NoNewline -ForegroundColor Gray
        
        try {
            $ws = New-Object System.Net.WebSockets.ClientWebSocket
            $cts = New-Object System.Threading.CancellationTokenSource(8000)
            $uri = [System.Uri]::new($url)
            
            $task = $ws.ConnectAsync($uri, $cts.Token)
            $completed = $task.Wait(8000)
            
            if ($completed) {
                $state = $ws.State
                $closeStatus = $ws.CloseStatus
                $closeDesc = $ws.CloseStatusDescription
                
                if ($state -eq [System.Net.WebSockets.WebSocketState]::Open) {
                    Write-Host "OPEN!" -ForegroundColor Green
                    # Try to receive a message
                    $buffer = New-Object byte[] 4096
                    $seg = New-Object System.ArraySegment[byte] -ArgumentList @(,$buffer)
                    $recvTask = $ws.ReceiveAsync($seg, [System.Threading.CancellationToken]::new($false))
                    $recvTask.Wait(3000)
                    if ($recvTask.IsCompleted) {
                        $msg = [System.Text.Encoding]::UTF8.GetString($buffer, 0, $recvTask.Result.Count)
                        Write-Host "    Received: $msg" -ForegroundColor Green
                    }
                    $ws.CloseAsync([System.Net.WebSockets.WebSocketCloseStatus]::NormalClosure, "", [System.Threading.CancellationToken]::None).Wait(2000)
                } elseif ($state -eq [System.Net.WebSockets.WebSocketState]::Closed) {
                    Write-Host "Closed (Status=$closeStatus Desc=`"$closeDesc`")" -ForegroundColor Yellow
                } else {
                    Write-Host "State: $state" -ForegroundColor Yellow
                }
            } else {
                Write-Host "Timeout (still $($ws.State))" -ForegroundColor DarkYellow
            }
        } catch {
            $innerMsg = ""
            if ($_.Exception.InnerException) { $innerMsg = $_.Exception.InnerException.Message }
            else { $innerMsg = $_.Exception.Message }
            $short = $innerMsg.Substring(0, [Math]::Min(100, $innerMsg.Length))
            Write-Host "Error: $short" -ForegroundColor Red
        }
        
        try { $ws.Dispose() } catch {}
    }
    
    # Also try HTTP on this host
    Write-Host "  HTTP probe..." -ForegroundColor Gray
    foreach ($hpath in @("/transform.php", "/realtime", "/ws", "/client")) {
        $hurl = "https://${host2}${hpath}"
        Write-Host "    GET $hurl ... " -NoNewline -ForegroundColor DarkGray
        try {
            $wc = New-Object System.Net.WebClient
            $wc.Headers.Add("User-Agent", "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X)")
            $wc.Headers.Add("X-Requested-With", "XMLHttpRequest")
            [System.Net.ServicePointManager]::ServerCertificateValidationCallback = { $true }
            $data = $wc.DownloadData($hurl)
            $text = [System.Text.Encoding]::UTF8.GetString($data)
            Write-Host "$($data.Length) bytes" -ForegroundColor Green
            if ($data.Length -lt 500) {
                Write-Host "      Body: $($text.Substring(0, [Math]::Min(300, $text.Length)))" -ForegroundColor DarkGray
            }
        } catch {
            $em = $_.Exception.Message
            if ($_.Exception.InnerException) { $em = $_.Exception.InnerException.Message }
            $short = $em.Substring(0, [Math]::Min(60, $em.Length))
            Write-Host $short -ForegroundColor DarkRed
        }
    }
    Write-Host ""
}

[System.Net.ServicePointManager]::ServerCertificateValidationCallback = $null

# Write best result
$urlFile = Join-Path (Split-Path -Parent $MyInvocation.MyCommand.Path) "websocket_url.txt"
Set-Content -Path $urlFile -Value "wss://www.hga038.com/realtime" -NoNewline -Encoding UTF8
Write-Host "Best candidate: wss://www.hga038.com/realtime" -ForegroundColor Yellow
Write-Host "Written to: $urlFile" -ForegroundColor Green
Start-Process notepad.exe $urlFile
