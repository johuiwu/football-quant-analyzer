# v18: 最终尝试 - 扩大解密范围 + 搜索所有可能的URL模式 + 综合报告
$ErrorActionPreference = "Stop"
$tp = [System.IO.Path]::GetTempPath()
$exe = $tp + "HgCeApp.exe"
if (-not [System.IO.File]::Exists($exe)) { Copy-Item "d:\下载\黄瓜角球\黄瓜角球\HgCeApp.exe" $exe -Force }
$asm = [System.Reflection.Assembly]::LoadFrom($exe)
$bf = [System.Reflection.BindingFlags]::Public -bor [System.Reflection.BindingFlags]::NonPublic -bor [System.Reflection.BindingFlags]::Static -bor [System.Reflection.BindingFlags]::DeclaredOnly
$bfa = $bf -bor [System.Reflection.BindingFlags]::Instance
$mod = $asm.ManifestModule

$outFile = Join-Path $tp "crack_v18.txt"
$sw = [System.IO.StreamWriter]::new($outFile, $false, [System.Text.UTF8Encoding]::new($true))

function WL($m) { $sw.WriteLine($m); Write-Host $m -ForegroundColor Green }

$decType = $asm.GetType("mjldbepFpfgR2sirhk.Kusbq8F7xd8hvTfPmi")
$decMethod = $decType.GetMethod("kfW0Lx5YBq", $bf)

WL("=== V18: Final Comprehensive Analysis ===")
WL("")

# === Part 1: 超大范围扫描(0-100000)寻找URL模式 ===
WL("--- Part 1: Extended scan 0-100000 ---")
$urlPatterns = @()
for ($idx = 0; $idx -lt 100000; $idx++) {
    try {
        $r = $decMethod.Invoke($null, @($idx))
        if ($r -ne $null -and $r.ToString().Length -gt 0) {
            $rawStr = $r.ToString()
            
            # Check for URL-like patterns using raw character codes
            $bytes = [System.Text.Encoding]::Unicode.GetBytes($rawStr)
            $hexStr = [BitConverter]::ToString($bytes) -replace "-",""
            
            # Look for specific byte patterns that indicate URLs
            # wss:// = 77 73 73 3A 2F 2F
            # ws:// = 77 73 3A 2F 2F  
            # http = 68 74 74 70
            # .com = 2E 63 6F 6D
            # /transform = 2F 74 72 61 6E 73 66 6F 72 6D
            
            if ($hexStr -match "7773733A2F2F|77733A2F2F|68747470|2E636F6D|2F7472616E73666F726D|6769736D6F") {
                $urlPatterns += @{ Index=$idx; Hex=$hexStr; Raw=$rawStr }
                WL("URL PATTERN at index " + $idx + "!")
                WL("  Hex: " + $hexStr.Substring(0, [Math]::Min(200, $hexStr.Length)))
                
                # Try to decode as ASCII
                $asciiBytes = [System.Text.Encoding]::UTF8.GetBytes($rawStr)
                $asciiStr = ""
                foreach ($b in $asciiBytes) {
                    if ($b -ge 32 -and $b -le 126) { $asciiStr += [char]$b } else { $asciiStr += "[" + $b.ToString("X2") + "]" }
                }
                WL("  UTF8: " + $asciiStr.Substring(0, [Math]::Min(200, $asciiStr.Length)))
            }
        }
    } catch {}
}
WL("URL patterns found: " + $urlPatterns.Count)

# Also scan for clean strings > 10 chars in extended range
WL("")
WL("--- Part 1b: Long clean strings (>15 chars, >80% ASCII) in 10000-50000 ---")
$longClean = @()
for ($idx = 10000; $idx -lt 50000; $idx++) {
    try {
        $r = $decMethod.Invoke($null, @($idx))
        if ($r -ne $null -and $r.ToString().Length -gt 15) {
            $rs = $r.ToString()
            $totalChars = $rs.Length
            $asciiCount = 0
            foreach ($ch in $rs.ToCharArray()) {
                $code = [int][char]$ch
                if ($code -ge 32 -and $code -le 126) { $asciiCount++ }
            }
            $ratio = $asciiCount / [Math]::Max(1, $totalChars)
            if ($ratio -gt 0.8) {
                $longClean += @{ Index=$idx; String=$rs; Length=$totalChars }
            }
        }
    } catch {}
}
WL("Long clean strings found: " + $longClean.Count)
foreach ($lc in $longClean) {
    WL("  [" + $lc.Index.ToString("D5") + "] L=" + $lc.Length.ToString("D4") + " : " + $lc.String)
}

# === Part 2: 分析UyPJuK1DPTsW8eYFCR类型（构造函数调用的外部方法）===
WL("")
WL("--- Part 2: UyPJuK1DPTsW8eYFCR type analysis ---")
$extTypes = @()
foreach ($t in $asm.GetTypes()) {
    if ($t.FullName.StartsWith("UyPJuK1DPTsW8eYFCR")) {
        $extTypes += $t
        WL("Found: " + $t.FullName)
        
        # List all methods
        foreach ($tm in $t.GetMethods([System.Reflection.BindingFlags]::Public -bor [System.Reflection.BindingFlags]::NonPublic -bor [System.Reflection.BindingFlags]::Static)) {
            $tps = ($tm.GetParameters() | ForEach-Object { $_.ParameterType.Name }) -join ","
            WL("  METHOD: " + $tm.Name + "(" + $tps + ") -> " + $tm.ReturnType.Name)
        }
        
        # List all fields
        foreach ($tf in $t.GetFields([System.Reflection.BindingFlags]::Public -bor [System.Reflection.BindingFlags]::NonPublic -bor [System.Reflection.BindingFlags]::Static)) {
            try {
                $tfv = $tf.GetValue($null)
                $tfvs = "?"
                if ($tfv -ne $null) { $tfvsv = $tfv.ToString(); if ($tfvsv.Length -gt 100) { $tfvsv = $tfvsv.Substring(0, 100) }; $tfvs = $tfvsv }
                WL("  FIELD: " + $tf.Name + " (" + $tf.FieldType.Name + ") = " + $tfvs)
            } catch {
                WL("  FIELD: " + $tf.Name + " (" + $tf.FieldType.Name + ")")
            }
        }
    }
}

# Try calling LPK9skTCQi
foreach ($et in $extTypes) {
    $lpkMethod = $et.GetMethod("LPK9skTCQi", $bf)
    if ($lpkMethod -ne $null) {
        WL("")
        WL("Calling LPK9skTCQi()...")
        try {
            $lpkResult = $lpkMethod.Invoke($null, @())
            if ($lpkResult -ne $null) {
                $lpkRs = $lpkResult.ToString()
                if ($lpkRs.Length -gt 500) { $lpkRs = $lpkRs.Substring(0, 500) + "..." }
                WL("Result type: " + $lpkResult.GetType().FullName)
                WL("Result: " + $lpkRs)
                
                if ($lpkResult.GetType().IsArray) {
                    WL("Array Length: " + $lpkResult.Length)
                }
            } else {
                WL("Result: null")
            }
        } catch {
            WL("Error: " + $_.Exception.Message)
        }
    }
}

# === Part 3: 搜索所有类型中的Uri/WebSocket相关字符串常量 ===
WL("")
WL("--- Part 3: Search all types for Uri/WebSocket related ldstr ---")
$uriStrings = @()
foreach ($t in $asm.GetTypes()) {
    foreach ($m in $t.GetMethods($bf)) {
        $mb3 = $m.GetMethodBody()
        if ($mb3 -ne $null) {
            $mil3 = $mb3.GetILAsByteArray()
            if ($mil3 -ne $null) {
                for ($j3 = 0; $j3 -lt $mil3.Length; $j3++) {
                    if ($mil3[$j3] -eq 0x72 -and $j3+4 -lt $mil3.Length) {
                        $stok3 = [BitConverter]::ToUInt32($mil3, $j3+1)
                        try {
                            $ss3 = $mod.ResolveString($stok3)
                            if ($ss3 -match "ws|socket|connect|wss|http|\.com|\.net|transform|gismo|/api|/live|/real|/push|/signal|uri|port") {
                                $uriStrings += @{ Type=$t.Name; Method=$m.Name; Offset=$j3; Value=$ss3 }
                            }
                        } catch {}
                    }
                }
            }
        }
    }
}
WL("URI-related ldstr found: " + $uriStrings.Count)
foreach ($us in $uriStrings) {
    $usType = $us.Type
    $usMethod = $us.Method
    $usOffset = $us.Offset
    $usValue = $us.Value
    WL("  " + $usType + "." + $usMethod + " offset=" + $usOffset + " `" " + $usValue + "`"")
}

# === Part 4: 综合分析报告 ===
WL("")
WL("=" * 60)
WL("=== COMPREHENSIVE ANALYSIS REPORT ===")
WL("=" * 60)
WL("")
WL("## REVERSE ENGINEERING SUMMARY FOR HgCeApp.exe WSocketClientHelp ##")
WL("")
WL("### Architecture:")
WL("  - Class: HgCeApp.WSocketClientHelp")
WL("  - Base URL source: HgCeApp.ini -> HgUrl field -> Constructor(String url)")
WL("  - Storage: CRy4Xi7NaT (Uri) = https://www.hga050.com/")
WL("  - Transport: System.Net.WebSockets.ClientWebSocket")
WL("  - Protocol: WSS (WebSocket Secure)")
WL("  - Obfuscation: RSA-based string encryption (RSACryptoServiceProvider)")
WL("  - Decryptor: Kusbq8F7xd8hvTfPmi.kfW0Lx5YBq(Int32)")
WL("  - Encrypted data table: UInt32[64] in zYk0TiUnA5 field")
WL("")
WL("### Key Methods:")
WL("  - PJI4DVIrcW()           : Open entry point (calls Task.Run)")
WL("  - HI548hsim5()          : Async starter (creates <<Open>b__20_0>d state machine)")
WL("  - mAS495kb4k(String)   : Connect wrapper (decrypts log message via kfW0Lx5YBq)")
WL("  - gI94xmnak6()          : Close/Disconnect (uses kfW0Lx5YBq + Ddk4OdT6x7)")
WL("  - Ddk4OdT6x7(WS,String): Close handler")
WL("  - G9NZ0lBapP8X84WJ6kN() : Validation?")
WL("  - Dn4RRvBMolSwZV3ZIcU(): Factory method")
WL("  - obT4LRPSxx(Byte[])  : Message handler?")
WL("")
WL("### Decryption Engine Details:")
WL("  - Uses RSACryptoServiceProvider (M2p0denJAq field)")
WL("  - Key seed: '8sSio8NdfPkjHFqgYQ.aWtiea3K3g8DlAHlEj'")
WL("  - Helper method L1x09lub0R: IL=12710 bytes (symmetric decryptor)")
WL("  - Uses ICryptoTransform + Stream + Unicode encoding")
WL("  - External init: UyPJuK1DPTsW8eYFCR.LPK9skTCQi()")
WL("  - Total encrypted strings: 647 non-empty in indices 0-9999")
WL("")
WL("### Runtime Behavior:")
WL("  - mAS495kb4k('https://www.hga050.com') returns False")
WL("  - Trace output: '------ws closed----' (from kfW0Lx5YBq decrypt)")
WL("  - HI548hsim5() crashes: 'Nullable object must have a value'")
WL("  - Crash location: MoveNext() in async state machine")
WL("  - Root cause: Missing prerequisite initialization from UI layer")
WL("")
WL("### Identified Clean Decrypted Strings (35 total):")
WL("  - User-Agent (Chrome): Mozilla/5.0 (Windows NT 10.0; Win64; x64)...Chrome/141.0")
WL("  - User-Agent (iPhone): Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X)...Safari/604.1")
WL("  - Content-Type: application/x-www-form-urlencoded")
WL("  - Content-Type: application/json")
WL("  - Table columns: Tb_CornerHandicapLower1~Upper5, Tb_ZpHandicap*, Tb_LeadGoals*")
WL("  - UI components: tableLayoutPanel3, dataGridView1~14")
WL("")
WL("### MOST LIKELY WEBSOCKET URL PATTERNS:")
WL("  Based on analysis, the WS URL is constructed by:")
WL("  1. Taking HgUrl (https://www.hga050.com)")
WL("  2. Converting https:// -> wss://")
WL("  3. Appending a path (encrypted, only visible at runtime)")
WL("  ")
WL("  Top candidates:")
WL("    wss://www.hga050.com/ws")
WL("    wss://www.hga050.com/socket")
WL("    wss://www.hga050.com/api/ws")
WL("    wss://www.hga050.com/v1/ws")
WL("    wss://www.hga050.com/realtime")
WL("    wss://www.hga050.com/signalr/connect")
WL("    wss://www.hga050.com/hg/ws")
WL("")
WL("### NEXT STEPS TO CONFIRM URL:")
WL("  Option A: Run real HgCeApp.exe with Wireshark/Fiddler to capture WS handshake")
WL("  Option B: Use dnSpy with debugger to break on ClientWebSocket.ConnectAsync")
WL("  Option C: Hook System.Net.WebSockets.ClientWebSocket at CLR level")
WL("  Option D: Fix Nullable crash by providing missing UI context, then retry Open()")
WL("")
WL("### FILES GENERATED:")
WL("  crack_v8.txt  through crack_v18.txt in %TEMP%")
WL("  decrypt_raw_bytes.txt - Full raw decrypt output")
WL("  v16_trace.txt - Trace capture (if any)")

$sw.Close()
Write-Host "`nDONE! File: $outFile" -ForegroundColor Green
