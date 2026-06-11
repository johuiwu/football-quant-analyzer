# v15: 智能过滤解密结果 + 尝试调用HI548hsim5触发完整连接流程 + 拦截URI
$ErrorActionPreference = "Stop"
$tp = [System.IO.Path]::GetTempPath()
$exe = $tp + "HgCeApp.exe"
if (-not [System.IO.File]::Exists($exe)) { Copy-Item "d:\下载\黄瓜角球\黄瓜角球\HgCeApp.exe" $exe -Force }
$asm = [System.Reflection.Assembly]::LoadFrom($exe)
$bf = [System.Reflection.BindingFlags]::Public -bor [System.Reflection.BindingFlags]::NonPublic -bor [System.Reflection.BindingFlags]::Static -bor [System.Reflection.BindingFlags]::DeclaredOnly
$bfa = $bf -bor [System.Reflection.BindingFlags]::Instance
$mod = $asm.ManifestModule

$outFile = Join-Path $tp "crack_v15.txt"
$sw = [System.IO.StreamWriter]::new($outFile, $false, [System.Text.UTF8Encoding]::new($true))

function WL($m) { $sw.WriteLine($m); Write-Host $m -ForegroundColor Green }

$decType = $asm.GetType("mjldbepFpfgR2sirhk.Kusbq8F7xd8hvTfPmi")
$decMethod = $decType.GetMethod("kfW0Lx5YBq", $bf)
$wsType = $asm.GetType("HgCeApp.WSocketClientHelp")

WL("=== V15: Smart Filter + Full Connection Attempt ===")
WL("")

# === Part 1: 智能扫描所有索引，过滤出高可读性字符串 ===
WL("--- Part 1: Smart scan for clean ASCII strings ---")
$cleanStrings = @()
for ($idx = 0; $idx -lt 10000; $idx++) {
    try {
        $r = $decMethod.Invoke($null, @($idx))
        if ($r -ne $null -and $r.ToString().Length -gt 0) {
            $rawStr = $r.ToString()
            # Calculate readability ratio
            $totalChars = $rawStr.Length
            $asciiCount = 0
            foreach ($ch in $rawStr.ToCharArray()) {
                $code = [int][char]$ch
                if ($code -ge 32 -and $code -le 126) { $asciiCount++ }
            }
            $ratio = $asciiCount / [Math]::Max(1, $totalChars)
            
            # Only keep strings with >70% ASCII readability AND length >3
            if ($ratio -gt 0.7 -and $totalChars -gt 3) {
                $cleanStrings += @{ Index=$idx; String=$rawStr; Ratio=[math]::Round($ratio, 2); Length=$totalChars }
            }
        }
    } catch {}
}
WL("Found " + $cleanStrings.Count + " clean strings (>70% ASCII):")
WL("")

# Sort by length descending (longer strings are more interesting)
$cleanStrings = $cleanStrings | Sort-Object -Property Length -Descending
foreach ($cs in $cleanStrings) {
    WL("  [" + $cs.Index.ToString("D5") + "] L=" + $cs.Length.ToString("D4") + " R=" + $cs.Ratio + " : " + $cs.String)
}

# === Part 2: 搜索特定模式 ===
WL("")
WL("--- Part 2: Pattern search across all indices ---")
$patterns = @(
    "wss:", "ws:", "http", ".com", ".net", "/ws", "/socket", "/api", "/realtime",
    "transform", "gismo", "websocket", "connect", "hga", "corner",
    "login", "auth", "token", "session", "key=", "ver=",
    "port", "host", "path", "uri", "url"
)
foreach ($pat in $patterns) {
    $found = $cleanStrings | Where-Object { $_.String -match [regex]::Escape($pat) }
    if ($found.Count -gt 0) {
        WL("Pattern '$pat' found:")
        foreach ($f in $found) {
            WL("  [" + $f.Index + "] " + $f.String)
        }
    }
}

# === Part 3: 完整调用Open并拦截所有输出 ===
WL("")
WL("--- Part 3: Full connection attempt with comprehensive interception ---")
try {
    # Set up trace listener
    $traceList = New-Object System.Collections.Generic.List[string]
    $traceSB = New-Object System.Text.StringBuilder
    
    class TraceInterceptor : System.Diagnostics.TraceListener {
        [void]Write([string]$message) {}
        [void]WriteLine([string]$message) {
            script:traceSB.AppendLine($message)
        }
    }
    
    # Use simple approach: redirect trace to string writer
    $ms = New-Object System.IO.MemoryStream
    $tsw = [System.IO.StreamWriter]::new($ms, [System.Text.UTF8Encoding]::new($true))
    $listener = New-Object System.Diagnostics.TextWriterTraceListener($tsw)
    [System.Diagnostics.Trace]::Listeners.Add($listener)
    [System.Diagnostics.Trace]::AutoFlush = $true
    
    # Create instance
    $ctor = $wsType.GetConstructor(@([string]))
    $inst = $ctor.Invoke(@("https://www.hga050.com"))
    WL("Instance created OK")
    
    # Set up event handlers
    # MessageEventHandler type
    $msgEventType = $wsType.GetNestedType("MessageEventHandler", $bfa)
    $errEventType = $wsType.GetNestedType("ErrorEventHandler", $bfa)
    
    # Create delegate for message handler
    $msgHandlerScript = {
        param([object]$sender, [string]$data)
        script:traceSB.AppendLine("[MSG] " + $data)
    }
    $errHandlerScript = {
        param([object]$sender, [string]$error)
        script:traceSB.AppendLine("[ERR] " + $error)
    }
    
    # Try to add event handlers via the add methods
    $addMsg = $wsType.GetMethod("KgO4qbCL9U", $bfa)  # add_Message
    $addErr = $wsType.GetMethod("K0R4lh4O3G", $bfa)   # add_Error
    
    if ($addMsg -ne $null) {
        $msgDelegate = [delegate]::CreateDelegate($msgEventType, $msgHandlerScript.Target, $msgHandlerScript.Method)
        # This won't work perfectly but let's try
        WL("Message event method found: KgO4qbCL9U")
    }
    
    # Call PJI4DVIrcW (Open)
    $openMethod = $wsType.GetMethod("PJI4DVIrcW", $bfa)
    WL("Calling PJI4DVIrcW...")
    try {
        $openResult = $openMethod.Invoke($inst, @())
        WL("PJI4DVIrcW completed: " + $openResult)
    } catch {
        WL("PJI4DVIrcW error: " + $_.Exception.Message)
    }
    
    # Also try HI548hsim5
    $asyncMethod = $wsType.GetMethod("HI548hsim5", $bfa)
    if ($asyncMethod -ne $null) {
        WL("")
        WL("Calling HI548hsim5...")
        try {
            $task = $asyncMethod.Invoke($inst, @())
            WL("Task created: " + $task.GetType().FullName)
            
            # Wait for task
            Start-Sleep -Milliseconds 3000
            
            # Check task status
            $isCompleted = $task.GetType().GetProperty("IsCompleted").GetValue($task)
            $isFaulted = $task.GetType().GetProperty("IsFaulted").GetValue($task)
            WL("Task IsCompleted=$isCompleted IsFaulted=$isFaulted")
            
            if ($isFaulted) {
                $exProp = $task.GetType().GetProperty("Exception")
                $innerEx = $exProp.GetValue($task)
                if ($innerEx -ne $null) {
                    WL("Task Exception: " + $innerEx.InnerException.Message)
                }
            }
            
            # Dump fields after async attempt
            WL("")
            WL("Fields after HI548hsim5:")
            foreach ($f in $wsType.GetFields($bfa)) {
                try {
                    $fv = $f.GetValue($inst)
                    if ($fv -ne $null) {
                        $fvs = $fv.ToString()
                        if ($fvs.Length -gt 300) { $fvs = $fvs.Substring(0, 300) + "..." }
                        WL("  " + $f.Name + " = " + $fvs)
                    } else {
                        WL("  " + $f.Name + " = null")
                    }
                } catch {}
            }
        } catch {
            WL("HI548hsim5 error: " + $_.Exception.Message)
        }
    }
    
    # Collect all trace output
    [System.Diagnostics.Trace]::Flush()
    $tsw.Flush()
    $pos = $ms.Position
    $ms.Position = 0
    $reader = New-Object System.IO.StreamReader($ms)
    $allTrace = $reader.ReadToEnd()
    $reader.Close()
    [System.Diagnostics.Trace]::Listeners.Remove($listener)
    
    WL("")
    WL("=== TRACE OUTPUT (" + $allTrace.Length + " chars) ===")
    if ($allTrace.Length -gt 0) {
        WL($allTrace)
        
        # Also save to separate file
        $traceFile = Join-Path $tp "full_trace.txt"
        [System.IO.File]::WriteAllText($traceFile, $allTrace, [System.Text.UTF8Encoding]::new($true))
        WL("Saved to: " + $traceFile)
    } else {
        WL("(no trace output)")
    }
    
} catch {
    WL("Fatal error: " + $_.Exception.Message)
    $_.Exception.StackTrace | ForEach-Object { WL($_) }
}

# === Part 4: 检查MoveNext中的ldstr token ===
WL("")
WL("--- Part 4: Resolve ldstr tokens in MoveNext ---")
$nestedType = $null
foreach ($t in $asm.GetTypes()) {
    if ($t.DeclaringType -ne $null -and $t.DeclaringType.FullName -eq "HgCeApp.WSocketClientHelp" -and $t.Name -match "b__20_0") {
        $nestedType = $t; break
    }
}
if ($nestedType -ne $null) {
    $mn = $nestedType.GetMethod("MoveNext", $bfa)
    $mb = $mn.GetMethodBody()
    $mil = $mb.GetILAsByteArray()
    
    $tokens = @{}
    for ($j = 0; $j -lt $mil.Length; $j++) {
        if ($mil[$j] -eq 0x72 -and $j+4 -lt $mil.Length) {
            $stok = [BitConverter]::ToUInt32($mil, $j+1)
            try {
                $ss = $mod.ResolveString($stok)
                if (-not $tokens.ContainsKey($stok)) {
                    $tokens[$stok] = @{ Offset=$j; Value=$ss }
                }
            } catch {}
        }
    }
    WL("Unique ldstr tokens in MoveNext: " + $tokens.Count)
    foreach ($tok in $tokens.GetEnumerator()) {
        $tv = $tok.Value
        $vs = $tv.Value
        if ($vs.Length -gt 200) { $vs = $vs.Substring(0, 200) + "..." }
        $offStr = $tv.Offset.ToString("D4")
        $keyStr = $tok.Key.ToString()
        WL("  offset=" + $offStr + " tok=" + $keyStr + ' "' + $vs + '"')
    }
}

$sw.Close()
Write-Host "`nDONE! File: $outFile" -ForegroundColor Green
