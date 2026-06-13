# v17: 诊断Nullable崩溃 + 初始化Global字段 + 手动构建WS URL
$ErrorActionPreference = "Stop"
$tp = [System.IO.Path]::GetTempPath()
$exe = $tp + "HgCeApp.exe"
if (-not [System.IO.File]::Exists($exe)) { Copy-Item "d:\下载\黄瓜角球\黄瓜角球\HgCeApp.exe" $exe -Force }
$asm = [System.Reflection.Assembly]::LoadFrom($exe)
$bf = [System.Reflection.BindingFlags]::Public -bor [System.Reflection.BindingFlags]::NonPublic -bor [System.Reflection.BindingFlags]::Static -bor [System.Reflection.BindingFlags]::DeclaredOnly
$bfa = $bf -bor [System.Reflection.BindingFlags]::Instance
$bfall = $bfa -bor [System.Reflection.BindingFlags]::Public
$mod = $asm.ManifestModule

$outFile = Join-Path $tp "crack_v17.txt"
$sw = [System.IO.StreamWriter]::new($outFile, $false, [System.Text.UTF8Encoding]::new($true))

function WL($m) { $sw.WriteLine($m); Write-Host $m -ForegroundColor Cyan }

$wsType = $asm.GetType("HgCeApp.WSocketClientHelp")
$globalType = $asm.GetType("HgCeApp.Global")

WL("=== V17: Diagnose Nullable Crash + Fix + Manual WS URL Construction ===")
WL("")

# === Part 1: 分析MoveNext中所有Nullable.get_Value调用 ===
WL("--- Part 1: Find all Nullable.get_Value calls in MoveNext ---")
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
    
    # Find all get_Value calls on Nullable types
    # Nullable.get_Value is typically called via callvirt
    for ($j = 0; $j -lt $mil.Length; $j++) {
        if ($mil[$j] -eq 0x87 -and $j+4 -lt $mil.Length) {
            $tok2 = [BitConverter]::ToUInt32($mil, $j + 1)
            try {
                $rm = $mod.ResolveMethod($tok2)
                if ($rm -ne $null -and $rm.Name -eq "get_Value") {
                    WL("get_Value at offset " + $j + " on type " + $rm.DeclaringType.FullName)
                    
                    # Show 20 bytes context before
                    $ctxStart = [Math]::Max(0, $j - 30)
                    for ($ci = $ctxStart; $ci -lt $j; $ci++) {
                        $cop = $mil[$ci]
                        $ctag = ""
                        if ($cop -eq 0x7B) {
                            $ft = [BitConverter]::ToUInt32($mil,$ci+1)
                            try { 
                                $ff = $mod.ResolveField($ft)
                                $ctag = "ldfld " + $ff.DeclaringType.Name + "." + $ff.Name 
                            } catch {}
                        }
                        elseif ($cop -eq 0x7C) {
                            $ft = [BitConverter]::ToUInt32($mil,$ci+1)
                            try { 
                                $ff = $mod.ResolveField($ft)
                                $ctag = "ldsfld " + $ff.DeclaringType.Name + "." + $ff.Name 
                            } catch {}
                        }
                        elseif ($cop -eq 0x02) { $ctag = "ldarg.0(state)" }
                        elseif ($cop -eq 0x28) {
                            $ct2 = [BitConverter]::ToUInt32($mil,$ci+1)
                            try { 
                                $cm2 = $mod.ResolveMethod($ct2)
                                $ctag = "call " + $cm2.DeclaringType.Name + "." + $cm2.Name 
                            } catch {}
                        }
                        if ($ctag -ne "") { WL("  [" + $ci.ToString("D4") + "] " + $ctag) }
                    }
                    WL("")
                }
            } catch {}
        }
    }
    
    # Also list all fields of the nested type (state machine)
    WL("")
    WL("--- Nested type fields (state machine locals/fields) ---")
    foreach ($nf in $nestedType.GetFields([System.Reflection.BindingFlags]::Public -bor [System.Reflection.BindingFlags]::NonPublic -bor [System.Reflection.BindingFlags]::Instance -bor [System.Reflection.BindingFlags]::DeclaredOnly)) {
        $nft = $nf.FieldType.FullName
        # Check if it's Nullable
        if ($nft -match "Nullable") {
            WL("  *** " + $nf.Name + " (" + $nft + ") *** NULLABLE!")
        } else {
            WL("  " + $nf.Name + " (" + $nft + ")")
        }
    }
    
    # Also check properties
    foreach ($np in $nestedType.GetProperties([System.Reflection.BindingFlags]::Public -bor [System.Reflection.BindingFlags]::NonPublic -bor [System.Reflection.BindingFlags]::Instance -bor [System.Reflection.BindingFlags]::DeclaredOnly)) {
        $npt = $np.PropertyType.FullName
        if ($npt -match "Nullable") {
            WL("  *** PROP " + $np.Name + " (" + $npt + ") *** NULLABLE!")
        }
    }
}

# === Part 2: 初始化Global类字段 ===
WL("")
WL("--- Part 2: Initialize Global fields from INI data ---")
if ($globalType -ne $null) {
    WL("Global type found: " + $globalType.FullName)
    
    # Read INI file content
    $iniPath = "d:\下载\黄瓜角球\黄瓜角球\HgCeApp.ini"
    if ([System.IO.File]::Exists($iniPath)) {
        $iniContent = [System.IO.File]::ReadAllText($iniPath)
        WL("INI file loaded: " + $iniPath)
        
        # Parse JSON
        try {
            $iniObj = $iniContent | ConvertFrom-Json
            WL("Parsed INI keys: " + ($iniObj.PSObject.Properties | ForEach-Object { $_.Name }) -join ", ")
            
            # Set relevant Global fields
            $fieldsToSet = @(
                @{ Name="ofIPvGwMQS"; Value=$iniPath; Desc="INI Path" },
                @{ Name="mvHPzF2Lat"; Value=(Split-Path $iniPath); Desc="Data Path" },
                @{ Name="nLx7Y4pX41"; Type="Dict"; Value=@{}; Desc="Config Dict" }
            )
            
            foreach ($fs in $fieldsToSet) {
                $gf = $globalType.GetField($fs.Name, $bf)
                if ($gf -ne $null) {
                    try {
                        if ($fs.Type -eq "Dict") {
                            # Create Dictionary<String,String>
                            $dictType = [Type]"System.Collections.Generic.Dictionary\`2[[System.String],[System.String]]"
                            $dict = [Activator]::CreateInstance($dictType)
                            
                            # Populate from INI
                            foreach ($prop in $iniObj.PSObject.Properties) {
                                $pv = $prop.Value.ToString()
                                if ($pv.Length -gt 0) {
                                    $dict.Add($prop.Name, $pv)
                                }
                            }
                            $gf.SetValue($null, $dict)
                            WL("  Set " + $fs.Name + " = Dictionary with " + $dict.Count + " entries")
                        } else {
                            $gf.SetValue($null, $fs.Value)
                            WL("  Set " + $fs.Name + " = " + $fs.Value)
                        }
                    } catch {
                        WL("  Failed to set " + $fs.Name + ": " + $_.Exception.Message)
                    }
                } else {
                    WL("  Field " + $fs.Name + " not found")
                }
            }
        } catch {
            WL("INI parse error: " + $_.Exception.Message)
        }
    } else {
        WL("INI file not found at: " + $iniPath)
    }
    
    # Dump all Global field values after init
    WL("")
    WL("Global fields after init:")
    foreach ($gf in $globalType.GetFields($bf)) {
        try {
            $gv = $gf.GetValue($null)
            if ($gv -ne $null) {
                $gvt = $gv.GetType()
                if ($gvt.IsGenericType -and $gvt.Name.StartsWith("Dictionary")) {
                    $countProp = $gvt.GetProperty("Count")
                    $cnt = $countProp.GetValue($gv)
                    WL("  " + $gf.Name + " = Dictionary[" + $cnt + "]")
                } else {
                    $gvs = $gv.ToString()
                    if ($gvs.Length -gt 100) { $gvs = $gvs.Substring(0, 100) }
                    WL("  " + $gf.Name + " = " + $gvs)
                }
            } else {
                WL("  " + $gf.Name + " = null")
            }
        } catch {}
    }
}

# === Part 3: 再次尝试调用Open(使用初始化后的Global) ===
WL("")
WL("--- Part 3: Retry Open with initialized Global ---")
try {
    $ctor = $wsType.GetConstructor(@([string]))
    $inst = $ctor.Invoke(@("https://www.hga038.com"))
    
    $asyncMethod = $wsType.GetMethod("HI548hsim5", $bfa)
    $taskObj = $asyncMethod.Invoke($inst, @())
    
    Start-Sleep -Milliseconds 2000
    
    $isF = $taskObj.GetType().GetProperty("IsFaulted").GetValue($taskObj)
    $isC = $taskObj.GetType().GetProperty("IsCompleted").GetValue($taskObj)
    WL("After init: Completed=$isC Faulted=$isF")
    
    if ($isF) {
        $exInfo = $taskObj.GetType().GetProperty("Exception").GetValue($taskObj)
        $innerEx = $exInfo.InnerException
        WL("Exception: " + $innerEx.Message)
        
        # Get FULL stack trace
        WL("Full Stack:")
        WL($innerEx.StackTrace)
    } else {
        WL("SUCCESS! No fault!")
        
        # Check trace
        foreach ($f in $wsType.GetFields($bfa)) {
            try {
                $fv = $f.GetValue($inst)
                if ($fv -ne $null) {
                    $fvs = $fv.ToString()
                    if ($fvs.Length -gt 300) { $fvs = $fvs.Substring(0, 300) }
                    WL("  " + $f.Name + " = " + $fvs)
                }
            } catch {}
        }
    }
} catch {
    WL("Error: " + $_.Exception.Message)
}

# === Part 4: 基于已知信息手动推断WebSocket URL ===
WL("")
WL("--- Part 4: Manual WebSocket URL inference ---")
WL("")
WL("Known facts:")
WL("  1. HgUrl (from INI)     = https://www.hga038.com")
WL("  2. CRy4Xi7NaT (Uri)      = https://www.hga038.com/")
WL("  3. Protocol used         = ClientWebSocket (wss://)")
WL("  4. App name              = HgCeApp (Corner/Hg App)")
WL("  5. Transform API endpoint= transform.php (from decrypted strings)")
WL("  6. User-Agent             = Mobile Safari (iPhone)")
WL("  7. Has Proxy configured  = Yes (WebProxyWrapper)")
WL("")
WL("Likely WebSocket URL patterns:")
$baseHost = "www.hga038.com"
$patterns = @(
    "wss://" + $baseHost + "/ws",
    "wss://" + $baseHost + "/websocket",
    "wss://" + $baseHost + "/socket",
    "wss://" + $baseHost + "/realtime",
    "wss://" + $baseHost + "/push",
    "wss://" + $baseHost + "/api/ws",
    "wss://" + $baseHost + "/signalr",
    "wss://" + $baseHost + "/corner",
    "wss://" + $baseHost + "/live",
    "wss://" + $baseHost + ":8080/ws",
    "wss://" + $baseHost + ":443/ws",
    "ws://" + $baseHost + "/ws",
    "wss://" + $baseHost + "/hg/ws",
    "wss://" + $baseHost + "/v1/ws"
)
foreach ($pat in $patterns) {
    WL("  ? " + $pat)
}
WL("")
WL("Note: The actual URL can only be confirmed by:")
WL("  A) Fixing the Nullable crash and re-running the state machine")
WL("  B) Using a network sniffer while the real app runs")
WL("  C) Hooking ClientWebSocket.ConnectAsync at .NET level")

$sw.Close()
Write-Host "`nDONE! File: $outFile" -ForegroundColor Green
