# v12: 调用Open方法 + 捕获全部Trace日志 + 解密所有kfW0Lx5YBq调用参数
$ErrorActionPreference = "Stop"
$tp = [System.IO.Path]::GetTempPath()
$exe = $tp + "HgCeApp.exe"
if (-not [System.IO.File]::Exists($exe)) { Copy-Item "d:\下载\黄瓜角球\黄瓜角球\HgCeApp.exe" $exe -Force }
$asm = [System.Reflection.Assembly]::LoadFrom($exe)
$bf = [System.Reflection.BindingFlags]::Public -bor [System.Reflection.BindingFlags]::NonPublic -bor [System.Reflection.BindingFlags]::Static -bor [System.Reflection.BindingFlags]::DeclaredOnly
$bfa = $bf -bor [System.Reflection.BindingFlags]::Instance
$bfall = $bfa -bor [System.Reflection.BindingFlags]::Public
$mod = $asm.ManifestModule

$outFile = Join-Path $tp "crack_v12.txt"
$sw = [System.IO.StreamWriter]::new($outFile, $false, [System.Text.UTF8Encoding]::new($true))

function WL($m) { $sw.WriteLine($m); Write-Host $m -ForegroundColor Yellow }

$wsType = $asm.GetType("HgCeApp.WSocketClientHelp")
$decType = $asm.GetType("mjldbepFpfgR2sirhk.Kusbq8F7xd8hvTfPmi")
$decMethod = $decType.GetMethod("kfW0Lx5YBq", $bf)

WL("=== V12: Full Trace Capture + URL Extraction ===")
WL("")

# === Part 1: 扫描MoveNext IL中所有kfW0Lx5YBq调用，提取参数计算逻辑 ===
WL("--- Part 1: All kfW0Lx5YBq calls in MoveNext with context ---")
$nestedType = $null
foreach ($t in $asm.GetTypes()) {
    if ($t.DeclaringType -ne $null -and $t.DeclaringType.FullName -eq "HgCeApp.WSocketClientHelp" -and $t.Name -match "b__20_0") {
        $nestedType = $t
        break
    }
}

if ($nestedType -ne $null) {
    $moveNext = $nestedType.GetMethod("MoveNext", $bfa)
    $mb = $moveNext.GetMethodBody()
    $mil = $mb.GetILAsByteArray()
    WL("MoveNext IL length: " + $mil.Length)
    
    # Find all kfW0Lx5YBq calls and dump 30 bytes before each
    for ($j = 0; $j -lt $mil.Length; $j++) {
        if ($mil[$j] -eq 0x28 -and $j+4 -lt $mil.Length) {
            $tok = [BitConverter]::ToUInt32($mil, $j + 1)
            try {
                $rm = $mod.ResolveMethod($tok)
                if ($rm -ne $null -and $rm.Name -eq "kfW0Lx5YBq") {
                    WL("")
                    WL("kfW0Lx5YBq call at offset " + $j)
                    
                    # Dump raw bytes before the call
                    $startScan = [Math]::Max(0, $j - 40)
                    $rawHex = ""
                    for ($si = $startScan; $si -lt $j; $si++) {
                        $rawHex += $mil[$si].ToString("X2") + " "
                    }
                    WL("  Raw bytes before: " + $rawHex)
                    
                    # Look for ldc.i4 instructions that load the parameter
                    $lastI4 = $null
                    for ($si = $j - 1; $si -ge [Math]::Max(0, $j - 20); $si--) {
                        $sop = $mil[$si]
                        if ($sop -eq 0x20 -and $si+4 -lt $mil.Length) {
                            $pv = [BitConverter]::ToInt32($mil, $si+1)
                            $lastI4 = $pv
                            WL("  Found ldc.i4 " + $pv + " at offset " + $si)
                            break
                        }
                        elseif ($sop -eq 0x1F) {
                            $pv = [sbyte]$mil[$si+1]
                            $lastI4 = [int]$pv
                            WL("  Found ldc.i4.s " + $pv + " at offset " + $si)
                            break
                        }
                        elseif ($sop -ge 0x08 -and $sop -le 0x10) {
                            $lastI4 = $sop - 8
                            WL("  Found ldc.i4." + ($sop-8) + " at offset " + $si)
                            break
                        }
                    }
                    
                    # Try to decrypt with the found parameter
                    if ($lastI4 -ne $null) {
                        try {
                            $decResult = $decMethod.Invoke($null, @([int]$lastI4))
                            if ($decResult -ne $null -and $decResult.ToString().Length -gt 0) {
                                WL("  Decrypted: " + $decResult.ToString())
                            } else {
                                WL("  Decrypted: (empty)")
                            }
                        } catch {
                            WL("  Decrypt error: " + $_.Exception.Message)
                        }
                    }
                }
            } catch {}
        }
    }
}

# === Part 2: 扫描所有类型中kfW0Lx5YBq调用，提取参数并解密 ===
WL("")
WL("--- Part 2: ALL kfW0Lx5YBq calls across all types ---")
$allTypes = $asm.GetTypes()
$callCount = 0
foreach ($t in $allTypes) {
    foreach ($m in $t.GetMethods($bfall)) {
        $mb2 = $m.GetMethodBody()
        if ($mb2 -ne $null) {
            $mil2 = $mb2.GetILAsByteArray()
            if ($mil2 -ne $null) {
                for ($j = 0; $j -lt $mil2.Length; $j++) {
                    if ($mil2[$j] -eq 0x28 -and $j+4 -lt $mil2.Length) {
                        $tok2 = [BitConverter]::ToUInt32($mil2, $j + 1)
                        try {
                            $rm2 = $mod.ResolveMethod($tok2)
                            if ($rm2 -ne $null -and $rm2.Name -eq "kfW0Lx5YBq") {
                                $callCount++
                                # Find the parameter
                                $param = $null
                                for ($si = $j - 1; $si -ge [Math]::Max(0, $j - 20); $si--) {
                                    $sop = $mil2[$si]
                                    if ($sop -eq 0x20 -and $si+4 -lt $mil2.Length) {
                                        $param = [BitConverter]::ToInt32($mil2, $si+1)
                                        break
                                    }
                                    elseif ($sop -eq 0x1F) {
                                        $param = [int][sbyte]$mil2[$si+1]
                                        break
                                    }
                                    elseif ($sop -ge 0x08 -and $sop -le 0x10) {
                                        $param = $sop - 8
                                        break
                                    }
                                }
                                
                                if ($param -ne $null) {
                                    try {
                                        $decR = $decMethod.Invoke($null, @([int]$param))
                                        if ($decR -ne $null -and $decR.ToString().Length -gt 0) {
                                            $decStr = $decR.ToString()
                                            # Filter for URL-like content
                                            if ($decStr -match "ws|http|url|socket|connect|wss|\.com|\.net|\.cn|transform|gismo|api|port|path|/|:80|:443|:8080") {
                                                WL("  " + $t.Name + "." + $m.Name + " param=" + $param + " => " + $decStr)
                                            }
                                        }
                                    } catch {}
                                }
                            }
                        } catch {}
                    }
                }
            }
        }
    }
}
WL("Total kfW0Lx5YBq calls found: " + $callCount)

# === Part 3: 调用Open方法并捕获Trace ===
WL("")
WL("--- Part 3: Call Open with Trace capture ---")
try {
    # Set up comprehensive trace listener
    $traceFile = Join-Path $tp "ws_trace.txt"
    $traceSW2 = [System.IO.StreamWriter]::new($traceFile, $false, [System.Text.UTF8Encoding]::new($true))
    $listener = New-Object System.Diagnostics.TextWriterTraceListener($traceSW2)
    [System.Diagnostics.Trace]::Listeners.Add($listener)
    [System.Diagnostics.Trace]::AutoFlush = $true
    
    # Create instance
    $ctor = $wsType.GetConstructor(@([string]))
    $inst = $ctor.Invoke(@("https://www.hga050.com"))
    WL("Instance created, State=" + $wsType.GetProperty("State").GetValue($inst))
    
    # Call PJI4DVIrcW (Open)
    $openMethod = $wsType.GetMethod("PJI4DVIrcW", $bfa)
    WL("Calling PJI4DVIrcW...")
    $openResult = $openMethod.Invoke($inst, @())
    WL("PJI4DVIrcW returned: " + $openResult)
    
    # Wait for async operations
    Start-Sleep -Milliseconds 2000
    
    # Check state after Open
    WL("State after Open: " + $wsType.GetProperty("State").GetValue($inst))
    
    # Dump all fields
    foreach ($f in $wsType.GetFields($bfa)) {
        try {
            $fv = $f.GetValue($inst)
            if ($fv -ne $null) {
                $fvs = $fv.ToString()
                if ($fvs.Length -gt 500) { $fvs = $fvs.Substring(0, 500) + "..." }
                WL("  " + $f.Name + " [" + $fv.GetType().Name + "] = " + $fvs)
            }
        } catch {}
    }
    
    # Flush and read trace
    [System.Diagnostics.Trace]::Flush()
    $traceSW2.Flush()
    $traceSW2.Close()
    [System.Diagnostics.Trace]::Listeners.Remove($listener)
    
    # Read trace file
    $traceContent = [System.IO.File]::ReadAllText($traceFile)
    WL("Trace output (" + $traceContent.Length + " chars):")
    WL($traceContent)
    
} catch {
    WL("Error: " + $_.Exception.Message)
    if ($_.Exception.InnerException) { WL("Inner: " + $_.Exception.InnerException.Message) }
}

# === Part 4: 直接解密URL相关字符串 ===
WL("")
WL("--- Part 4: Brute-force decrypt all indices for URL patterns ---")
# The kfW0Lx5YBq parameter in MoveNext at offset 2394 was computed dynamically
# But from the IL, we see ldc.i4 values: 439960776 and -1812113615
# Let's try these and nearby values
$specialParams = @(439960776, -1812113615, -1790678625, 1666712532, 26011301, 28452867, 28518403, 39987204, 40380431, 40642564, 287834628, 439960776, 40839183)
foreach ($sp in $specialParams) {
    try {
        $r = $decMethod.Invoke($null, @([int]$sp))
        if ($r -ne $null -and $r.ToString().Length -gt 0) {
            WL("kfW0Lx5YBq(" + $sp + ") = " + $r.ToString())
        }
    } catch {}
}

# Also try XOR combinations
WL("")
WL("Trying XOR combinations:")
$xorParams = @(
    (439960776 -bxor -1812113615),
    (-1790678625 -bxor 1666712532),
    (439960776 -bxor 1666712532),
    (-1812113615 -bxor -1790678625)
)
foreach ($xp in $xorParams) {
    try {
        $r = $decMethod.Invoke($null, @([int]$xp))
        if ($r -ne $null -and $r.ToString().Length -gt 0) {
            WL("kfW0Lx5YBq(" + $xp + ") = " + $r.ToString())
        }
    } catch {}
}

$sw.Close()
Write-Host "`nDONE! File: $outFile" -ForegroundColor Green
