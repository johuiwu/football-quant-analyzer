# v10: 运行时深入分析 - 调用Open方法 + 完整IL反编译 + 拦截ConnectAsync
$ErrorActionPreference = "Stop"
$tp = [System.IO.Path]::GetTempPath()
$exe = $tp + "HgCeApp.exe"
if (-not [System.IO.File]::Exists($exe)) { Copy-Item "d:\下载\黄瓜角球\黄瓜角球\HgCeApp.exe" $exe -Force }
$asm = [System.Reflection.Assembly]::LoadFrom($exe)
$bf = [System.Reflection.BindingFlags]::Public -bor [System.Reflection.BindingFlags]::NonPublic -bor [System.Reflection.BindingFlags]::Static -bor [System.Reflection.BindingFlags]::DeclaredOnly
$bfa = $bf -bor [System.Reflection.BindingFlags]::Instance
$bfall = $bfa -bor [System.Reflection.BindingFlags]::Public
$mod = $asm.ManifestModule

$outFile = Join-Path $tp "crack_v10.txt"
$sw = [System.IO.StreamWriter]::new($outFile, $false, [System.Text.UTF8Encoding]::new($true))

function WL($m) { $sw.WriteLine($m); Write-Host $m -ForegroundColor Magenta }

$wsType = $asm.GetType("HgCeApp.WSocketClientHelp")

WL("=== V10: Runtime Deep Analysis ===")
WL("")

# === Part 1: 完整列出所有字段和属性 ===
WL("--- Part 1: All WSocketClientHelp members ---")
foreach ($f in $wsType.GetFields($bfall)) {
    WL("  FIELD: " + $f.Name + " (" + $f.FieldType.FullName + ") " + $f.Attributes.ToString())
}
foreach ($p in $wsType.GetProperties($bfall)) {
    WL("  PROPERTY: " + $p.Name + " (" + $p.PropertyType.FullName + ")")
}
foreach ($m in $wsType.GetMethods($bfall)) {
    $params = ($m.GetParameters() | ForEach-Object { $_.ParameterType.Name }) -join ", "
    WL("  METHOD: " + $m.Name + "(" + $params + ") -> " + $m.ReturnType.Name)
}
foreach ($ev in $wsType.GetEvents($bfall)) {
    WL("  EVENT: " + $ev.Name + " (" + $ev.EventHandlerType.Name + ")")
}

# === Part 2: 创建实例并列出所有字段值 ===
WL("")
WL("--- Part 2: Instance creation & field dump ---")
$ctor = $wsType.GetConstructor(@([string]))
$instance = $ctor.Invoke(@("https://www.hga038.com"))
WL("Instance created with: https://www.hga038.com")
WL("")

foreach ($f in $wsType.GetFields($bfa)) {
    try {
        $fv = $f.GetValue($instance)
        if ($fv -ne $null) {
            $fvs = $fv.ToString()
            if ($fvs.Length -gt 200) { $fvs = $fvs.Substring(0, 200) + "..." }
            WL("  " + $f.Name + " [" + $fv.GetType().Name + "] = " + $fvs)
        } else {
            WL("  " + $f.Name + " [" + $f.FieldType.Name + "] = null")
        }
    } catch {
        WL("  " + $f.Name + " = ERROR: " + $_.Exception.Message)
    }
}

# === Part 3: 完整IL反编译关键方法 ===
WL("")
WL("--- Part 3: Full IL disassembly of key methods ---")

$keyMethods = @("PJI4DVIrcW", "HI548hsim5", "mAS495kb4k", "G9NZ0lBapP8X84WJ6kN", "obT4LRPSxx", "gI94xmnak6", "Dn4RRvBMolSwZV3ZIcU")
foreach ($km in $keyMethods) {
    $method = $wsType.GetMethod($km, $bfa)
    if ($method -ne $null) {
        $mb = $method.GetMethodBody()
        if ($mb -ne $null) {
            $mil = $mb.GetILAsByteArray()
            if ($mil -ne $null) {
                WL("")
                WL("===== METHOD: " + $km + " (IL=" + $mil.Length + " bytes) =====")
                $locals = $mb.LocalVariables
                if ($locals.Count -gt 0) {
                    WL("  Locals:")
                    for ($li = 0; $li -lt $locals.Count; $li++) {
                        WL("    [$li] " + $locals[$li].LocalType.FullName)
                    }
                }
                
                # Disassemble every instruction
                $i = 0
                while ($i -lt $mil.Length) {
                    $op = $mil[$i]
                    $line = "[" + $i.ToString("D4") + "] "
                    $skip = 1
                    
                    switch ($op) {
                        0x00 { $line += "nop" }
                        0x01 { $line += "break" }
                        0x02 { $line += "ldarg.0" }
                        0x03 { $line += "ldarg.1" }
                        0x04 { $line += "ldarg.2" }
                        0x05 { $line += "ldarg.3" }
                        0x06 { $line += "ldnull" }
                        0x07 { $line += "ldc.i4.M1" }
                        0x08 { $line += "ldc.i4.0" }
                        0x09 { $line += "ldc.i4.1" }
                        0x0A { $line += "ldc.i4.2" }
                        0x0B { $line += "ldc.i4.3" }
                        0x0C { $line += "ldc.i4.4" }
                        0x0D { $line += "ldc.i4.5" }
                        0x0E { $line += "ldc.i4.6" }
                        0x0F { $line += "ldc.i4.7" }
                        0x10 { $line += "ldc.i4.8" }
                        0x11 { $line += "ldc.i4.s"; $pv = $mil[$i+1]; $line += " " + $pv; $skip = 2 }
                        0x12 { $line += "ldc.i4"; $pv = [BitConverter]::ToInt32($mil,$i+1); $line += " " + $pv; $skip = 5 }
                        0x13 { $line += "ldc.i8"; $pv = [BitConverter]::ToInt64($mil,$i+1); $line += " " + $pv; $skip = 9 }
                        0x14 { $line += "ldc.r4"; $skip = 5 }
                        0x15 { $line += "ldc.r8"; $skip = 9 }
                        0x16 { $line += "???" }
                        0x17 { $line += "ldstr" 
                            $stok = [BitConverter]::ToUInt32($mil, $i+1)
                            try { $ss = $mod.ResolveString($stok); $line += ' "' + $ss + '"' } catch { $line += " <token:" + $stok + ">" }
                            $skip = 5 
                        }
                        0x18 { $line += "dup" }
                        0x19 { $line += "pop" }
                        0x1A { $line += "jmp"; $skip = 5 }
                        0x1B { $line += "callvirt"; $ct = [BitConverter]::ToUInt32($mil,$i+1); try { $cm=$mod.ResolveMethod($ct); $line+=" "+$cm.DeclaringType.Name+"."+($cm.Name+"("+(($cm.GetParameters()|ForEach-Object{$_.ParameterType.Name})-join ",")+")") } catch {}; $skip=5 }
                        0x1C { $line += "cpobj"; $skip = 5 }
                        0x1D { $line += "ldobj"; $skip = 5 }
                        0x1E { $line += "unbox"; $skip = 5 }
                        0x1F { $line += "throw" }
                        0x20 { $line += "ldc.i4"; $pv = [BitConverter]::ToInt32($mil,$i+1); $line += " " + $pv; $skip = 5 }
                        0x21 { $line += "ldftn"; $skip = 5 }
                        0x22 { $line += "ldvirtftn"; $skip = 5 }
                        0x25 { $line += "dup" }
                        0x26 { $line += "jmp" ; $skip = 5 }
                        0x27 { $line += "call" 
                            $ct = [BitConverter]::ToUInt32($mil,$i+1)
                            try {
                                $cm=$mod.ResolveMethod($ct)
                                $cps = ($cm.GetParameters()|ForEach-Object{$_.ParameterType.Name}) -join ","
                                $line += " " + $cm.DeclaringType.Name + "." + $cm.Name + "(" + $cps + ")"
                            } catch {}
                            $skip = 5 
                        }
                        0x28 { $line += "call" 
                            $ct = [BitConverter]::ToUInt32($mil,$i+1)
                            try {
                                $cm=$mod.ResolveMethod($ct)
                                $cps = ($cm.GetParameters()|ForEach-Object{$_.ParameterType.Name}) -join ","
                                $line += " " + $cm.DeclaringType.Name + "." + $cm.Name + "(" + $cps + ")"
                            } catch {}
                            $skip = 5 
                        }
                        0x29 { $line += "calli"; $skip = 5 }
                        0x2A { $line += "ret" }
                        0x2B { $line += "br.s"; $tv = [sbyte]$mil[$i+1]; $line += " " + ($i+$tv+2); $skip = 2 }
                        0x2C { $line += "brfalse.s"; $tv = [sbyte]$mil[$i+1]; $line += " " + ($i+$tv+2); $skip = 2 }
                        0x2D { $line += "brtrue.s"; $tv = [sbyte]$mil[$i+1]; $line += " " + ($i+$tv+2); $skip = 2 }
                        0x2E { $line += "beq.s"; $tv = [sbyte]$mil[$i+1]; $line += " " + ($i+$tv+2); $skip = 2 }
                        default {
                            # Handle multi-byte opcodes
                            if ($op -eq 0x72) {
                                $stok = [BitConverter]::ToUInt32($mil,$i+1)
                                try { $ss = $mod.ResolveString($stok); $line += 'ldstr "' + $ss + '"' } catch { $line += "ldstr <token:$stok>" }
                                $skip = 5
                            }
                            elseif ($op -eq 0x7B) {
                                $ft = [BitConverter]::ToUInt32($mil,$i+1)
                                try { $ff = $mod.ResolveField($ft); $line += "ldfld " + $ff.DeclaringType.Name + "." + $ff.Name } catch { $line += "ldfld <tok:$ft>" }
                                $skip = 5
                            }
                            elseif ($op -eq 0x7C) {
                                $ft = [BitConverter]::ToUInt32($mil,$i+1)
                                try { $ff = $mod.ResolveField($ft); $line += "ldsfld " + $ff.DeclaringType.Name + "." + $ff.Name } catch { $line += "ldsfld <tok:$ft>" }
                                $skip = 5
                            }
                            elseif ($op -eq 0x7D) {
                                $ft = [BitConverter]::ToUInt32($mil,$i+1)
                                try { $ff = $mod.ResolveField($ft); $line += "stfld " + $ff.DeclaringType.Name + "." + $ff.Name } catch { $line += "stfld <tok:$ft>" }
                                $skip = 5
                            }
                            elseif ($op -eq 0x7E) {
                                $ft = [BitConverter]::ToUInt32($mil,$i+1)
                                try { $ff = $mod.ResolveField($ft); $line += "stsfld " + $ff.DeclaringType.Name + "." + $ff.Name } catch { $line += "stsfld <tok:$ft>" }
                                $skip = 5
                            }
                            elseif ($op -eq 0x80) {
                                $line += "ldarga.s"; $skip = 2
                            }
                            elseif ($op -eq 0x87) {
                                $ct = [BitConverter]::ToUInt32($mil,$i+1)
                                try {
                                    $cm=$mod.ResolveMethod($ct)
                                    $cps = ($cm.GetParameters()|ForEach-Object{$_.ParameterType.Name}) -join ","
                                    $line += "callvirt " + $cm.DeclaringType.Name + "." + $cm.Name + "(" + $cps + ")"
                                } catch {}
                                $skip = 5
                            }
                            elseif ($op -eq 0x8B) {
                                $ct = [BitConverter]::ToUInt32($mil,$i+1)
                                try {
                                    $ctorInfo = $mod.ResolveMethod($ct)
                                    $cps = ($ctorInfo.GetParameters()|ForEach-Object{$_.ParameterType.Name}) -join ","
                                    $line += "newobj " + $ctorInfo.DeclaringType.Name + ".ctor(" + $cps + ")"
                                } catch {}
                                $skip = 5
                            }
                            else {
                                $line += "0x" + $op.ToString("X2")
                            }
                        }
                    }
                    WL("  " + $line)
                    $i += $skip
                }
            }
        }
    } else {
        WL("  Method " + $km + " NOT FOUND")
    }
}

# === Part 4: 尝试调用PJI4DVIrcW(Open)方法 ===
WL("")
WL("--- Part 4: Attempting to call Open methods ---")
try {
    $openMethod = $wsType.GetMethod("PJI4DVIrcW", $bfa)
    if ($openMethod -ne $null) {
        WL("Found PJI4DVIrcW, attempting invoke...")
        $openResult = $openMethod.Invoke($instance, @())
        WL("PJI4DVIrcW result: " + $openResult + " type=" + $openResult.GetType().Name)
        
        # Re-dump fields after Open
        WL("Fields after PJI4DVIrcW:")
        foreach ($f in $wsType.GetFields($bfa)) {
            try {
                $fv = $f.GetValue($instance)
                if ($fv -ne $null) {
                    $fvs = $fv.ToString()
                    if ($fvs.Length -gt 300) { $fvs = $fvs.Substring(0, 300) + "..." }
                    WL("  " + $f.Name + " = " + $fvs)
                }
            } catch {}
        }
    }
} catch {
    WL("PJI4DVIrcW error: " + $_.Exception.Message)
    WL("Inner: " + $_.Exception.InnerException.Message)
}

# Also try HI548hsim5 (async starter)
try {
    $asyncMethod = $wsType.GetMethod("HI548hsim5", $bfa)
    if ($asyncMethod -ne $null) {
        WL("")
        WL("Found HI548hsim5, attempting invoke...")
        $taskResult = $asyncMethod.Invoke($instance, @())
        WL("HI548hsim5 result type: " + $taskResult.GetType().FullName)
        
        # Wait briefly and check state
        Start-Sleep -Milliseconds 500
        
        foreach ($f in $wsType.GetFields($bfa)) {
            try {
                $fv = $f.GetValue($instance)
                if ($fv -ne $null) {
                    $fvs = $fv.ToString()
                    if ($fvs.Length -gt 300) { $fvs = $fvs.Substring(0, 300) + "..." }
                    WL("  " + $f.Name + " = " + $fvs)
                }
            } catch {}
        }
    }
} catch {
    WL("HI548hsim5 error: " + $_.Exception.Message)
}

# === Part 5: 解密index 2004的hex字符串 ===
WL("")
WL("--- Part 5: Decode interesting hex strings ---")
$decType = $asm.GetType("mjldbepFpfgR2sirhk.Kusbq8F7xd8hvTfPmi")
$decMethod = $decType.GetMethod("kfW0Lx5YBq", $bf)

# Index 2004 had ASCII-readable hex output
$result2004 = $decMethod.Invoke($null, @(2004))
if ($result2004 -ne $null) {
    $raw = $result2004.ToString()
    WL("kfW0Lx5YBq(2004) raw len=" + $raw.Length)
    $bytes = [System.Text.Encoding]::UTF8.GetBytes($raw)
    WL("UTF8 bytes: " + ([System.Text.Encoding]::ASCII.GetString($bytes)))
    
    # Try as raw bytes directly
    $rawBytes = [System.Text.Encoding]::Unicode.GetBytes($raw)
    WL("Unicode bytes hex: " + ([BitConverter]::ToString($rawBytes)).Substring(0, [Math]::Min(400, ([BitConverter]::ToString($rawBytes)).Length)))
}

# Also decode some low indices that might have clean strings
foreach ($idx in @(0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10)) {
    try {
        $r = $decMethod.Invoke($null, @($idx))
        if ($r -ne $null -and $r.ToString().Length -gt 0 -and $r.ToString().Length -lt 500) {
            $rb = [System.Text.Encoding]::UTF8.GetBytes($r.ToString())
            WL("kfW0Lx5YBq(" + $idx + ") UTF8=" + [System.Text.Encoding]::ASCII.GetString($rb))
        }
    } catch {}
}

$sw.Close()
Write-Host "`nDONE! File: $outFile" -ForegroundColor Green
