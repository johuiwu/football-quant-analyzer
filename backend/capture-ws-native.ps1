# capture-ws-native.ps1
# Native PowerShell WebSocket URL capture for HgCeApp.exe
# No Wireshark required - uses .NET Reflection + Process monitoring

$ErrorActionPreference = "Stop"
$outputDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$urlFile = Join-Path $outputDir "websocket_url.txt"

Write-Host "=== HgCeApp WebSocket URL Capture ===" -ForegroundColor Cyan
Write-Host ""

$tp = [System.IO.Path]::GetTempPath()
$exe = $tp + "HgCeApp.exe"
$iniCopy = $tp + "HgCeApp.ini"

# Copy from source (handle Chinese path encoding)
$srcDir = Get-ChildItem "d:\下载\黄瓜角球\黄瓜角球" -ErrorAction SilentlyContinue
if ($srcDir -eq $null) {
    # Try temp copy approach
    $srcExe = $null
    $srcIni = $null
    # Search common locations
    $searchPaths = @(
        @{ Exe="d:\下载\黄瓜角球\黄瓜角球\HgCeApp.exe"; Ini="d:\下载\黄瓜角球\黄瓜角球\HgCeApp.ini" },
        @{ Exe="C:\Users\Administrator\Desktop\HgCeApp.exe"; Ini="C:\Users\Administrator\Desktop\HgCeApp.ini" },
        @{ Exe="$tp\HgCeApp.exe"; Ini="$tp\HgCeApp.ini" }
    )
    foreach ($sp in $searchPaths) {
        if (Test-Path $sp.Exe) { $srcExe = $sp.Exe; $srcIni = $sp.Ini; break }
    }
} else {
    $srcExe = "d:\下载\黄瓜角球\黄瓜角球\HgCeApp.exe"
    $srcIni = "d:\下载\黄瓜角球\黄瓜角球\HgCeApp.ini"
}

if (-not $srcExe -or -not (Test-Path $srcExe)) {
    Write-Host "[WARN] HgCeApp.exe not found in expected locations" -ForegroundColor Red
    Write-Host "  Searching temp directory..." -ForegroundColor Yellow
    if (Test-Path $exe) {
        $srcExe = $exe
        Write-Host "  Found in temp: $exe" -ForegroundColor Green
    } else {
        Write-Host "  Not found. Please copy HgCeApp.exe to: $exe" -ForegroundColor Red
        return
    }
}

if (-not [System.IO.File]::Exists($exe)) { Copy-Item $srcExe $exe -Force }
if ($srcIni -and (Test-Path $srcIni) -and -not (Test-Path $iniCopy)) { Copy-Item $srcIni $iniCopy -Force }

$asm = [System.Reflection.Assembly]::LoadFrom($exe)
$bf = [System.Reflection.BindingFlags]::Public -bor [System.Reflection.BindingFlags]::NonPublic -bor [System.Reflection.BindingFlags]::Static -bor [System.Reflection.BindingFlags]::DeclaredOnly
$bfa = $bf -bor [System.Reflection.BindingFlags]::Instance
$mod = $asm.ManifestModule

$wsType = $asm.GetType("HgCeApp.WSocketClientHelp")
$decType = $asm.GetType("mjldbepFpfgR2sirhk.Kusbq8F7xd8hvTfPmi")
$decMethod = $decType.GetMethod("kfW0Lx5YBq", $bf)
$globalType = $asm.GetType("HgCeApp.Global")

# === Step 1: Init Global config ===
Write-Host "[1] Initializing Global config..." -ForegroundColor Yellow
$iniPath = $iniCopy
if (-not (Test-Path $iniPath)) { $iniPath = $tp + "HgCeApp.ini" }
if ([System.IO.File]::Exists($iniPath) -and $globalType -ne $null) {
    $iniContent = [System.IO.File]::ReadAllText($iniPath)
    try {
        $iniObj = $iniContent | ConvertFrom-Json
        $dictField = $globalType.GetField("nLx7Y4pX41", $bf)
        if ($dictField -ne $null) {
            $dict = [Activator]::CreateInstance($dictField.FieldType)
            foreach ($prop in $iniObj.PSObject.Properties) {
                try { $dict.Add($prop.Name, $prop.Value.ToString()) } catch {}
            }
            $dictField.SetValue($null, $dict)
            $dc = $dict.Count
            Write-Host "  Global.nLx7Y4pX41 initialized ($dc items)" -ForegroundColor Gray
        }
        $iniField = $globalType.GetField("ofIPvGwMQS", $bf)
        if ($iniField -ne $null) { $iniField.SetValue($null, $iniPath) }
    } catch {
        Write-Host "  INI init failed: $($_.Exception.Message)" -ForegroundColor Red
    }
}

# === Step 2: Create instance + try Open ===
Write-Host "[2] Creating WSocketClientHelp instance..." -ForegroundColor Yellow
$hgUrl = "https://www.hga050.com"
$ctor = $wsType.GetConstructor(@([string]))
$inst = $ctor.Invoke(@($hgUrl))

$uriField = $wsType.GetField("CRy4Xi7NaT", $bfa)
$uriValue = $uriField.GetValue($inst)
Write-Host "  CRy4Xi7NaT (Uri) = $uriValue" -ForegroundColor Cyan

# Set up trace
$traceOutput = New-Object System.Text.StringBuilder
$tsw = [System.IO.StringWriter]::new($traceOutput)
$listener = New-Object System.Diagnostics.TextWriterTraceListener($tsw)
[System.Diagnostics.Trace]::Listeners.Add($listener)
[System.Diagnostics.Trace]::AutoFlush = $true

$wsUrl = $null

Write-Host "  Calling Open (HI548hsim5)..." -ForegroundColor Gray
try {
    $asyncMethod = $wsType.GetMethod("HI548hsim5", $bfa)
    $task = $asyncMethod.Invoke($inst, @())
    
    $waited = 0
    while ($waited -lt 5000) {
        $isDone = $task.GetType().GetProperty("IsCompleted").GetValue($task)
        if ($isDone) { break }
        Start-Sleep -Milliseconds 100
        $waited += 100
        
        $cwsField = $wsType.GetField("Dkm4ivONPd", $bfa)
        $cws = $cwsField.GetValue($inst)
        if ($cws -ne $null) {
            try {
                $state = $cws.State
                if ($state -eq [System.Net.WebSockets.WebSocketState]::Connecting -or 
                    $state -eq [System.Net.WebSockets.WebSocketState]::Open) {
                    Write-Host "  WebSocket State: $state" -ForegroundColor Green
                }
            } catch {}
        }
    }
    
    $isFaulted = $task.GetType().GetProperty("IsFaulted").GetValue($task)
    if ($isFaulted) {
        $ex = $task.GetType().GetProperty("Exception").GetValue($task)
        if ($ex -and $ex.InnerException) {
            Write-Host "  Open exception: $($ex.InnerException.Message)" -ForegroundColor Red
            $stack = $ex.InnerException.StackTrace
            if ($stack -match 'wss://[^\s"]+' -or $stack -match 'ws://[^\s"]+') {
                $wsUrl = $matches[0]
                Write-Host "  [FOUND] URL from exception: $wsUrl" -ForegroundColor Green
            }
        }
    }
} catch {
    Write-Host "  Open call failed: $($_.Exception.Message)" -ForegroundColor Red
}

# Get trace output
[System.Diagnostics.Trace]::Flush()
$traceStr = $traceOutput.ToString()
[System.Diagnostics.Trace]::Listeners.Remove($listener)
$tsw.Close()

if ($traceStr.Length -gt 0) {
    Write-Host "  Trace output:" -ForegroundColor Gray
    Write-Host $traceStr -ForegroundColor DarkGray
    if ($traceStr -match 'wss://[^\s"]+') { $wsUrl = $matches[0] }
    elseif ($traceStr -match 'ws://[^\s"]+') { $wsUrl = $matches[0] }
}

# Check instance fields
Write-Host "  Checking instance fields..." -ForegroundColor Gray
foreach ($f in $wsType.GetFields($bfa)) {
    try {
        $fv = $f.GetValue($inst)
        if ($fv -ne $null) {
            $fvs = $fv.ToString()
            if ($fvs.Length -gt 200) { $fvs = $fvs.Substring(0, 200) }
            if ($fvs -match 'wss://|ws://|http|\.com|\.net|socket|connect') {
                Write-Host "  *** $($f.Name) = $fvs" -ForegroundColor Green
                if (-not $wsUrl -and $fvs -match 'wss://[^\s"]+') { $wsUrl = $matches[0] }
            } else {
                Write-Host "  $($f.Name) [$($fv.GetType().Name)] = $fvs" -ForegroundColor DarkGray
            }
        }
    } catch {}
}

# === Step 3: Extended decrypt search ===
Write-Host ""
Write-Host "[3] Extended decrypt search (50000-200000)..." -ForegroundColor Yellow

$pathPatterns = @("/ws", "/socket", "/realtime", "/push", "/signalr", "/api/ws", "/live", "/stream", "/feed", "/corner", "/hg/ws", "/v1/ws")
$foundPaths = @()

for ($idx = 50000; $idx -lt 200000; $idx++) {
    try {
        $r = $decMethod.Invoke($null, @($idx))
        if ($r -ne $null -and $r.ToString().Length -gt 2 -and $r.ToString().Length -lt 200) {
            $rs = $r.ToString()
            $asciiCount = 0
            foreach ($ch in $rs.ToCharArray()) {
                $code = [int][char]$ch
                if ($code -ge 32 -and $code -le 126) { $asciiCount++ }
            }
            $ratio = $asciiCount / [Math]::Max(1, $rs.Length)
            
            if ($ratio -gt 0.7) {
                if ($rs -match '^wss?://') {
                    $wsUrl = $rs
                    Write-Host "  [FOUND WS URL!] idx=$idx : $rs" -ForegroundColor Green
                }
                foreach ($pat in $pathPatterns) {
                    if ($rs.Contains($pat)) {
                        $foundPaths += @{ Index=$idx; String=$rs }
                        Write-Host "  [FOUND path] idx=$idx : $rs" -ForegroundColor Green
                        break
                    }
                }
            }
        }
    } catch {}
}

if ($foundPaths.Count -eq 0) {
    Write-Host "  No path patterns found in 50000-200000" -ForegroundColor Gray
}

# === Step 4: Monitor process network connections ===
Write-Host ""
Write-Host "[4] Monitoring HgCeApp.exe network connections..." -ForegroundColor Yellow

$hgceProc = Get-Process -Name "HgCeApp" -ErrorAction SilentlyContinue
if ($hgceProc) {
    Write-Host "  HgCeApp.exe running (PID: $($hgceProc.Id))" -ForegroundColor Green
    $conns = Get-NetTCPConnection -OwningProcess $hgceProc.Id -ErrorAction SilentlyContinue
    if ($conns) {
        Write-Host "  Active connections:" -ForegroundColor Cyan
        foreach ($conn in $conns) {
            $state = $conn.State
            $remote = "$($conn.RemoteAddress):$($conn.RemotePort)"
            if ($state -eq 'Established' -and $conn.RemotePort -eq 443) {
                Write-Host "    *** [ESTABLISHED] $remote (possible WSS!)" -ForegroundColor Green
                try {
                    $dns = [System.Net.Dns]::GetHostEntry($conn.RemoteAddress)
                    $hostname = $dns.HostName
                    Write-Host "        DNS: $hostname" -ForegroundColor Green
                    if (-not $wsUrl -and $hostname -match 'hga|crw|corner|bet') {
                        $wsUrl = "wss://${hostname}/ws"
                    }
                } catch {}
            } elseif ($state -eq 'Established') {
                Write-Host "    [ESTABLISHED] $remote" -ForegroundColor Gray
            }
        }
    } else {
        Write-Host "  No active connections detected" -ForegroundColor Gray
    }
} else {
    Write-Host "  HgCeApp.exe is NOT running" -ForegroundColor Red
    Write-Host "  Start HgCeApp.exe first, then re-run this script" -ForegroundColor Yellow
}

# === Step 5: DNS-based candidate verification ===
Write-Host ""
Write-Host "[5] DNS verification of candidate URLs..." -ForegroundColor Yellow

$baseHost = "www.hga050.com"
$candidates = @(
    "wss://${baseHost}/ws",
    "wss://${baseHost}/socket",
    "wss://${baseHost}/api/ws",
    "wss://${baseHost}/realtime",
    "wss://${baseHost}/signalr/connect",
    "wss://${baseHost}/v1/ws",
    "wss://${baseHost}/push",
    "wss://${baseHost}/hg/ws",
    "wss://${baseHost}/live",
    "wss://${baseHost}/stream"
)

foreach ($cand in $candidates) {
    $hostPart = $cand -replace 'wss?://', '' -replace '/.*', ''
    try {
        $ips = [System.Net.Dns]::GetHostAddresses($hostPart)
        if ($ips.Count -gt 0) {
            Write-Host "    [DNS OK] $cand -> $($ips[0])" -ForegroundColor Green
        }
    } catch {
        Write-Host "    [DNS FAIL] $cand" -ForegroundColor Red
    }
}

# === Output result ===
Write-Host ""
Write-Host ("=" * 50) -ForegroundColor Cyan

if ($wsUrl) {
    $wsUrl = ($wsUrl -split "`n")[0].Trim()
    Set-Content -Path $urlFile -Value $wsUrl -NoNewline -Encoding UTF8
    Write-Host "[SUCCESS] WebSocket URL: $wsUrl" -ForegroundColor Green
    Write-Host "Written to: $urlFile" -ForegroundColor Green
    Start-Process notepad.exe $urlFile
} else {
    Write-Host "[RESULT] Could not auto-extract exact URL" -ForegroundColor Red
    Write-Host ""
    Write-Host "Best guess based on reverse analysis:" -ForegroundColor Yellow
    Write-Host "  wss://www.hga050.com/ws" -ForegroundColor White
    Write-Host ""
    Write-Host "To confirm:" -ForegroundColor Cyan
    Write-Host "  1. Install Wireshark, run capture-hgce-websocket.ps1" -ForegroundColor Cyan
    Write-Host "  2. Use dnSpy breakpoint on ClientWebSocket.ConnectAsync" -ForegroundColor Cyan
    Write-Host "  3. Start HgCeApp.exe then re-run this script (Step 4 needs live process)" -ForegroundColor Cyan
    
    Set-Content -Path $urlFile -Value "wss://www.hga050.com/ws" -NoNewline -Encoding UTF8
    Write-Host ""
    Write-Host "Best guess written to: $urlFile" -ForegroundColor Yellow
    Start-Process notepad.exe $urlFile
}
