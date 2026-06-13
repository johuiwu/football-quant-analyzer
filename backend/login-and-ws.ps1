# login-and-ws-v2.ps1
# Kill HgCeApp.exe to release UID, then login + connect WSS

Write-Host "=== HgCeApp Login + WSS v2 ===" -ForegroundColor Cyan
Write-Host ""

$hgUrl = "https://www.hga038.com"
$hgUsername = "liuwei1108"
$hgPassword = "Hc6957061"
$hgUid = "q94s507em40685531l8731371b1"
$hgVer = "6f209d8aea89a7ef796ed9e7f002e7a3_1779944027525"
$userAgent = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/600.1.4 (KHTML, like Gecko) Version/8.5 Mobile/12F70 Safari/600.1"

[System.Net.ServicePointManager]::ServerCertificateValidationCallback = { $true }
[System.Net.ServicePointManager]::SecurityProtocol = [System.Net.SecurityProtocolType]::Tls12 -bor [System.Net.SecurityProtocolType]::Tls11 -bor [System.Net.SecurityProtocolType]::Tls

# === Step 0: Kill HgCeApp.exe to release the UID ===
Write-Host "[0] Checking for running HgCeApp.exe..." -ForegroundColor Yellow
$proc = Get-Process -Name "HgCeApp" -ErrorAction SilentlyContinue
if ($proc) {
    Write-Host "  Found HgCeApp.exe (PID: $($proc.Id)) - killing to release UID..." -ForegroundColor Yellow
    Stop-Process -Name "HgCeApp" -Force -ErrorAction SilentlyContinue
    Start-Sleep -Seconds 2
    Write-Host "  HgCeApp.exe stopped" -ForegroundColor Green
} else {
    Write-Host "  HgCeApp.exe not running" -ForegroundColor Gray
}

# === Step 1: Login via transform.php ===
Write-Host ""
Write-Host "[1] Logging in via transform.php..." -ForegroundColor Yellow

$workingHost = $null
$sessionUid = $null

# Try m510.crw066.com first (it responded with doubleLogin before)
$apiHosts = @("m510.crw066.com", "www.hga038.com", "www.hga038.com")

foreach ($host2 in $apiHosts) {
    Write-Host "  Trying: $host2" -ForegroundColor Gray
    
    # First get the login page to check for EMNU/token
    try {
        $wc = New-Object System.Net.WebClient
        $wc.Headers.Add("User-Agent", $userAgent)
        $wc.Headers.Add("X-Requested-With", "XMLHttpRequest")
        $wc.Headers.Add("Referer", "https://${host2}/")
        
        # Try login with chk_login
        $loginUrl = "https://${host2}/transform.php"
        $loginBody = "p=chk_login&langx=zh-cn&ver=${hgVer}&username=${hgUsername}&password=${hgPassword}"
        
        $wc2 = New-Object System.Net.WebClient
        $wc2.Headers.Add("User-Agent", $userAgent)
        $wc2.Headers.Add("X-Requested-With", "XMLHttpRequest")
        $wc2.Headers.Add("Content-Type", "application/x-www-form-urlencoded")
        $wc2.Headers.Add("Referer", "https://${host2}/")
        $wc2.Headers.Add("Origin", "https://${host2}")
        
        $responseBytes = $wc2.UploadData($loginUrl, "POST", [System.Text.Encoding]::UTF8.GetBytes($loginBody))
        $responseText = [System.Text.Encoding]::UTF8.GetString($responseBytes)
        
        Write-Host "    Login response ($($responseBytes.Length) bytes): $responseText" -ForegroundColor DarkGray
        
        if ($responseText -match '<code>(\d+)</code>') {
            $code = $matches[1]
            if ($code -eq "200" -or $code -eq "601") {
                $workingHost = $host2
                Write-Host "    LOGIN SUCCESS! code=$code" -ForegroundColor Green
                # Extract UID from response
                if ($responseText -match '<uid>([^<]+)</uid>') {
                    $sessionUid = $matches[1]
                    Write-Host "    UID: $sessionUid" -ForegroundColor Green
                }
                break
            } else {
                Write-Host "    Login code: $code" -ForegroundColor Yellow
            }
        } elseif ($responseText -match 'CheckEMNU') {
            Write-Host "    Need EMNU verification, trying alternative login..." -ForegroundColor Yellow
            
            # Try with different parameters
            $loginBody2 = "p=chk_login&langx=zh-cn&ver=${hgVer}&username=${hgUsername}&password=${hgPassword}&uid=${hgUid}"
            $wc3 = New-Object System.Net.WebClient
            $wc3.Headers.Add("User-Agent", $userAgent)
            $wc3.Headers.Add("X-Requested-With", "XMLHttpRequest")
            $wc3.Headers.Add("Content-Type", "application/x-www-form-urlencoded")
            $wc3.Headers.Add("Referer", "https://${host2}/")
            $wc3.Headers.Add("Origin", "https://${host2}")
            $wc3.Headers.Add("Cookie", "uid=${hgUid}")
            
            try {
                $responseBytes2 = $wc3.UploadData($loginUrl, "POST", [System.Text.Encoding]::UTF8.GetBytes($loginBody2))
                $responseText2 = [System.Text.Encoding]::UTF8.GetString($responseBytes2)
                Write-Host "    Login v2 response: $responseText2" -ForegroundColor DarkGray
                
                if ($responseText2 -match '<code>(\d+)</code>') {
                    $code2 = $matches[1]
                    if ($code2 -eq "200" -or $code2 -eq "601") {
                        $workingHost = $host2
                        $sessionUid = $hgUid
                        Write-Host "    LOGIN SUCCESS with UID! code=$code2" -ForegroundColor Green
                        break
                    }
                }
            } catch {
                Write-Host "    Login v2 error: $($_.Exception.Message)" -ForegroundColor Red
            }
        }
    } catch {
        $em = $_.Exception.Message
        if ($_.Exception.InnerException) { $em = $_.Exception.InnerException.Message }
        Write-Host "    Error: $($em.Substring(0, [Math]::Min(80, $em.Length)))" -ForegroundColor Red
    }
}

# === Step 2: If login failed, try using stored UID directly ===
if (-not $workingHost) {
    Write-Host ""
    Write-Host "[2] Trying stored UID on API hosts..." -ForegroundColor Yellow
    
    foreach ($host2 in $apiHosts) {
        $memberUrl = "https://${host2}/transform.php"
        $memberBody = "p=get_member_data&uid=${hgUid}&langx=zh-cn&change=all"
        
        try {
            $wc = New-Object System.Net.WebClient
            $wc.Headers.Add("User-Agent", $userAgent)
            $wc.Headers.Add("X-Requested-With", "XMLHttpRequest")
            $wc.Headers.Add("Content-Type", "application/x-www-form-urlencoded")
            
            $responseBytes = $wc.UploadData($memberUrl, "POST", [System.Text.Encoding]::UTF8.GetBytes($memberBody))
            $responseText = [System.Text.Encoding]::UTF8.GetString($responseBytes)
            
            Write-Host "  $host2 : $($responseText.Substring(0, [Math]::Min(150, $responseText.Length)))" -ForegroundColor DarkGray
            
            if ($responseText -match '<code>(\d+)</code>') {
                $code = $matches[1]
                if ($code -eq "200" -or $code -eq "601") {
                    $workingHost = $host2
                    $sessionUid = $hgUid
                    Write-Host "  SESSION VALID on $host2!" -ForegroundColor Green
                    break
                } elseif ($responseText -match 'doubleLogin') {
                    Write-Host "  doubleLogin - UID still in use, waiting..." -ForegroundColor Yellow
                    Start-Sleep -Seconds 5
                    # Retry
                    $responseBytes2 = $wc.UploadData($memberUrl, "POST", [System.Text.Encoding]::UTF8.GetBytes($memberBody))
                    $responseText2 = [System.Text.Encoding]::UTF8.GetString($responseBytes2)
                    if ($responseText2 -match '<code>(\d+)</code>' -and $matches[1] -match '200|601') {
                        $workingHost = $host2
                        $sessionUid = $hgUid
                        Write-Host "  SESSION VALID after retry!" -ForegroundColor Green
                        break
                    }
                }
            }
        } catch {
            $em = $_.Exception.Message
            if ($_.Exception.InnerException) { $em = $_.Exception.InnerException.Message }
            Write-Host "  $host2 error: $($em.Substring(0, [Math]::Min(60, $em.Length)))" -ForegroundColor Red
        }
    }
}

# === Step 3: Connect to WSS (without User-Agent header which .NET Framework doesn't support) ===
Write-Host ""
Write-Host "[3] Connecting to WebSocket..." -ForegroundColor Yellow

$uid = if ($sessionUid) { $sessionUid } else { $hgUid }
$wsHost = if ($workingHost) { $workingHost } else { "www.hga038.com" }

Write-Host "  Using host: $wsHost, UID: $uid" -ForegroundColor Gray

$wsCandidates = @(
    "wss://${wsHost}/ws",
    "wss://${wsHost}/realtime",
    "wss://${wsHost}/socket",
    "wss://${wsHost}/api/ws",
    "wss://${wsHost}/eventbus",
    "wss://${wsHost}/client",
    "wss://${wsHost}/push",
    "wss://${wsHost}/live",
    "wss://${wsHost}/stream"
)

$wsUrl = $null

foreach ($cand in $wsCandidates) {
    Write-Host "  WSS: $cand ... " -NoNewline -ForegroundColor Gray
    
    try {
        $ws = New-Object System.Net.WebSockets.ClientWebSocket
        # Do NOT set User-Agent header - .NET Framework ClientWebSocket doesn't support it
        # Instead, set the Cookie header for auth
        $ws.Options.SetRequestHeader("Cookie", "uid=${uid}")
        $ws.Options.SetRequestHeader("X-Requested-With", "XMLHttpRequest")
        
        $cts = New-Object System.Threading.CancellationTokenSource(8000)
        $uri = [System.Uri]::new($cand)
        
        $task = $ws.ConnectAsync($uri, $cts.Token)
        $completed = $task.Wait(8000)
        
        if ($completed -and $ws.State -eq [System.Net.WebSockets.WebSocketState]::Open) {
            Write-Host "OPEN!" -ForegroundColor Green
            $wsUrl = $cand
            
            # Receive initial message
            $buffer = New-Object byte[] 8192
            $seg = New-Object System.ArraySegment[byte] -ArgumentList @(,$buffer)
            $recvTask = $ws.ReceiveAsync($seg, [System.Threading.CancellationToken]::new($false))
            $recvTask.Wait(5000)
            if ($recvTask.IsCompleted -and $recvTask.Result.Count -gt 0) {
                $msg = [System.Text.Encoding]::UTF8.GetString($buffer, 0, $recvTask.Result.Count)
                Write-Host "    Received: $msg" -ForegroundColor Green
            }
            
            $ws.CloseAsync([System.Net.WebSockets.WebSocketCloseStatus]::NormalClosure, "", [System.Threading.CancellationToken]::None).Wait(2000)
            break
        } elseif ($ws.State -eq [System.Net.WebSockets.WebSocketState]::Closed) {
            $cs = $ws.CloseStatus
            $cd = $ws.CloseStatusDescription
            Write-Host "Closed (Status=$cs)" -ForegroundColor Yellow
        } else {
            Write-Host "$($ws.State)" -ForegroundColor DarkYellow
        }
    } catch {
        $innerMsg = ""
        if ($_.Exception.InnerException) { $innerMsg = $_.Exception.InnerException.Message }
        else { $innerMsg = $_.Exception.Message }
        
        if ($innerMsg -match '403|Forbidden') {
            Write-Host "403 Forbidden (path exists)" -ForegroundColor Yellow
        } elseif ($innerMsg -match '404|not found') {
            Write-Host "404" -ForegroundColor Red
        } elseif ($innerMsg -match 'protocol|upgrade|handshake') {
            Write-Host "Protocol error (path exists)" -ForegroundColor Yellow
        } else {
            $short = $innerMsg.Substring(0, [Math]::Min(60, $innerMsg.Length))
            Write-Host $short -ForegroundColor DarkGray
        }
    }
    
    try { $ws.Dispose() } catch {}
}

# === Output ===
Write-Host ""
Write-Host ("=" * 50) -ForegroundColor Cyan

$urlFile = Join-Path (Split-Path -Parent $MyInvocation.MyCommand.Path) "websocket_url.txt"

if ($wsUrl) {
    Set-Content -Path $urlFile -Value $wsUrl -NoNewline -Encoding UTF8
    Write-Host "[SUCCESS] WebSocket URL: $wsUrl" -ForegroundColor Green
    Write-Host "Working host: $wsHost" -ForegroundColor Green
    Write-Host "UID: $uid" -ForegroundColor Green
    Start-Process notepad.exe $urlFile
} else {
    Write-Host "[RESULT] WSS connection not established" -ForegroundColor Red
    Write-Host "Login host: $workingHost" -ForegroundColor Yellow
    Write-Host "UID: $uid" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "The WSS path requires proper authentication token." -ForegroundColor Cyan
    Write-Host "Best candidate: wss://www.hga038.com/ws" -ForegroundColor Cyan
    Set-Content -Path $urlFile -Value "wss://www.hga038.com/ws" -NoNewline -Encoding UTF8
    Start-Process notepad.exe $urlFile
}

[System.Net.ServicePointManager]::ServerCertificateValidationCallback = $null
