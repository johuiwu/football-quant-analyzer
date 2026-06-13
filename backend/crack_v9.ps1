# v9: 深入追踪mAS495kb4k - 搜索call/callvirt + 内部方法 + MoveNext完整IL + 运行时调用
$ErrorActionPreference = "Stop"
$tp = [System.IO.Path]::GetTempPath()
$exe = $tp + "HgCeApp.exe"
if (-not [System.IO.File]::Exists($exe)) { Copy-Item "d:\下载\黄瓜角球\黄瓜角球\HgCeApp.exe" $exe -Force }
$asm = [System.Reflection.Assembly]::LoadFrom($exe)
$bf = [System.Reflection.BindingFlags]::Public -bor [System.Reflection.BindingFlags]::NonPublic -bor [System.Reflection.BindingFlags]::Static -bor [System.Reflection.BindingFlags]::DeclaredOnly
$bfa = $bf -bor [System.Reflection.BindingFlags]::Instance
$bfall = $bfa -bor [System.Reflection.BindingFlags]::Public
$mod = $asm.ManifestModule

$outFile = Join-Path $tp "crack_v9.txt"
$sw = [System.IO.StreamWriter]::new($outFile, $false, [System.Text.UTF8Encoding]::new($true))

function WL($m) { $sw.WriteLine($m); Write-Host $m -ForegroundColor Cyan }

$wsType = $asm.GetType("HgCeApp.WSocketClientHelp")
$masMethod = $wsType.GetMethod("mAS495kb4k", $bfa)

WL("=== V9: Deep trace of mAS495kb4k ===")
WL("")

# === Part 1: WSocketClientHelp 所有方法的IL中搜索mAS495kb4k调用 ===
WL("--- Part 1: WSocketClientHelp internal method calls to mAS495kb4k ---")
foreach ($m in $wsType.GetMethods($bfall)) {
    $mb = $m.GetMethodBody()
    if ($mb -ne $null) {
        $mil = $mb.GetILAsByteArray()
        if ($mil -ne $null) {
            for ($j = 0; $j -lt $mil.Length; $j++) {
                # search call (0x28) OR callvirt (0x87)
                if (($mil[$j] -eq 0x28 -or $mil[$j] -eq 0x87) -and $j+4 -lt $mil.Length) {
                    $tok2 = [BitConverter]::ToUInt32($mil, $j + 1)
                    try {
                        $rm = $mod.ResolveMethod($tok2)
                        if ($rm -ne $null -and $rm.Name -eq "mAS495kb4k") {
                            WL("FOUND in " + $wsType.Name + "." + $m.Name + " at offset " + $j + " (opcode=" + $mil[$j].ToString("X2") + ")")
                            WL("  Method params: " + ($m.GetParameters().Count) + ", returns " + $m.ReturnType.Name)
                            
                            # Dump 60 bytes of context before the call
                            $startScan = [Math]::Max(0, $j - 80)
                            for ($si = $startScan; $si -lt $j; $si++) {
                                $sop = $mil[$si]
                                $tag = ""
                                if ($sop -eq 0x72) {
                                    $stok = [BitConverter]::ToUInt32($mil,$si+1)
                                    try { $ss = $mod.ResolveString($stok); $tag = 'ldstr "' + $ss + '"' } catch {}
                                }
                                elseif ($sop -eq 0x28) {
                                    $ct = [BitConverter]::ToUInt32($mil,$si+1)
                                    try { $cm = $mod.ResolveMethod($ct); $tag = "call " + $cm.DeclaringType.Name + "." + $cm.Name } catch {}
                                }
                                elseif ($sop -eq 0x87) {
                                    $ct = [BitConverter]::ToUInt32($mil,$si+1)
                                    try { $cm = $mod.ResolveMethod($ct); $tag = "callvirt " + $cm.DeclaringType.Name + "." + $cm.Name } catch {}
                                }
                                elseif ($sop -eq 0x7C) {
                                    $ft = [BitConverter]::ToUInt32($mil,$si+1)
                                    try { $ff = $mod.ResolveField($ft); $tag = "ldsfld " + $ff.DeclaringType.Name + "." + $ff.Name } catch {}
                                }
                                elseif ($sop -eq 0x7B) {
                                    $ft = [BitConverter]::ToUInt32($mil,$si+1)
                                    try { $ff = $mod.ResolveField($ft); $tag = "ldfld " + $ff.DeclaringType.Name + "." + $ff.Name } catch {}
                                }
                                elseif ($sop -eq 0x06) { $tag = "ldnull" }
                                elseif ($sop -eq 0x25) { $tag = "dup" }
                                elseif ($sop -eq 0x02) { $tag = "ldarg.0(this)" }
                                elseif ($sop -eq 0x03) { $tag = "ldarg.1(url)" }
                                elseif ($sop -eq 0x04) { $tag = "ldarg.2" }
                                elseif ($sop -ge 0x08 -and $sop -le 0x10) { $tag = "ldc.i4." + ($sop-8) }
                                elseif ($sop -eq 0x1F) {
                                    $pv = $mil[$si+1]
                                    $tag = "ldc.i4.s " + $pv
                                }
                                elseif ($sop -eq 0x20) {
                                    $pv = [BitConverter]::ToInt32($mil, $si+1)
                                    $tag = "ldc.i4 " + $pv
                                }
                                if ($tag -ne "") { WL("    [" + $si.ToString("D4") + "] " + $tag) }
                            }
                            WL("")
                        }
                    } catch {}
                }
            }
        }
    }
}

# === Part 2: 完整Dump WSocketClientHelp每个方法的IL概要 ===
WL("")
WL("--- Part 2: All WSocketClientHelp methods IL summary ---")
foreach ($m in $wsType.GetMethods($bfall)) {
    $mb = $m.GetMethodBody()
    if ($mb -ne $null) {
        $mil = $mb.GetILAsByteArray()
        if ($mil -ne $null) {
            $params = ($m.GetParameters() | ForEach-Object { $_.ParameterType.Name }) -join ", "
            WL("  " + $m.Name + "(" + $params + ") -> " + $m.ReturnType.Name + "  IL=" + $mil.Length + "bytes")
            
            # Quick scan for key opcodes
            $hasLdstr = $false; $hasCall = $false; $hasNewobj = $false; $hasConcat = $false
            for ($xi = 0; $xi -lt $mil.Length; $xi++) {
                if ($mil[$xi] -eq 0x72) { $hasLdstr = $true }
                if ($mil[$xi] -eq 0x28 -or $mil[$xi] -eq 0x87) { $hasCall = $true }
                if ($mil[$xi] -eq 0x8B) { $hasNewobj = $true }
            }
            $flags = ""
            if ($hasLdstr) { $flags += " ldstr" }
            if ($hasCall) { $flags += " call" }
            if ($hasNewobj) { $flags += " newobj" }
            if ($flags -ne "") { WL("    flags:" + $flags) }
        }
    }
}

# === Part 3: 搜索嵌套类型(异步状态机)中的调用 ===
WL("")
WL("--- Part 3: Nested types in WSocketClientHelp ---")
foreach ($t in $asm.GetTypes()) {
    if ($t.DeclaringType -ne $null -and $t.DeclaringType.FullName -eq "HgCeApp.WSocketClientHelp") {
        WL("NESTED: " + $t.FullName)
        foreach ($nm in $t.GetMethods($bfall)) {
            $nmb = $nm.GetMethodBody()
            if ($nmb -ne $null) {
                $nmil = $nmb.GetILAsByteArray()
                if ($nmil -ne $null) {
                    WL("  METHOD: " + $nm.Name + " IL=" + $nmil.Length + "bytes")
                    
                    # Search for mAS495kb4k calls in nested type
                    for ($nj = 0; $nj -lt $nmil.Length; $nj++) {
                        if (($nmil[$nj] -eq 0x28 -or $nmil[$nj] -eq 0x87) -and $nj+4 -lt $nmil.Length) {
                            $ntok = [BitConverter]::ToUInt32($nmil, $nj + 1)
                            try {
                                $nrm = $mod.ResolveMethod($ntok)
                                if ($nrm -ne $null -and $nrm.Name -eq "mAS495kb4k") {
                                    WL("  *** mAS495kb4k CALL at offset " + $nj + " ***")
                                    
                                    # Dump 80 bytes before
                                    $nstart = [Math]::Max(0, $nj - 100)
                                    for ($nsi = $nstart; $nsi -lt $nj; $nsi++) {
                                        $nop = $nmil[$nsi]
                                        $ntag = ""
                                        if ($nop -eq 0x72) {
                                            $nst = [BitConverter]::ToUInt32($nmil,$nsi+1)
                                            try { $nss = $mod.ResolveString($nst); $ntag = 'ldstr "'+$nss+'"' } catch {}
                                        }
                                        elseif ($nop -eq 0x28) {
                                            $nct = [BitConverter]::ToUInt32($nmil,$nsi+1)
                                            try { $ncm = $mod.ResolveMethod($nct); $ntag = "call "+$ncm.DeclaringType.Name+"."+$ncm.Name } catch {}
                                        }
                                        elseif ($nop -eq 0x87) {
                                            $nct = [BitConverter]::ToUInt32($nmil,$nsi+1)
                                            try { $ncm = $mod.ResolveMethod($nct); $ntag = "callvirt "+$ncm.DeclaringType.Name+"."+$ncm.Name } catch {}
                                        }
                                        elseif ($nop -eq 0x7C) {
                                            $nft = [BitConverter]::ToUInt32($nmil,$nsi+1)
                                            try { $nff = $mod.ResolveField($nft); $ntag = "ldsfld "+$nff.DeclaringType.Name+"."+$nff.Name } catch {}
                                        }
                                        elseif ($nop -eq 0x7B) {
                                            $nft = [BitConverter]::ToUInt32($nmil,$nsi+1)
                                            try { $nff = $mod.ResolveField($nft); $ntag = "ldfld "+$nff.DeclaringType.Name+"."+$nff.Name } catch {}
                                        }
                                        elseif ($nop -eq 0x02) { $ntag = "ldarg.0(state)" }
                                        elseif ($nop -eq 0x03) { $ntag = "ldarg.1" }
                                        elseif ($nop -ge 0x08 -and $nop -le 0x10) { $ntag = "ldc.i4."+($nop-8) }
                                        if ($ntag -ne "") { WL("      ["+$nsi.ToString("D4")+"] "+$ntag) }
                                    }
                                    WL("")
                                }
                            } catch {}
                        }
                    }
                    
                    # Also show all ldstr in this nested method
                    $ldstrCount = 0
                    for ($li = 0; $li -lt $nmil.Length; $li++) {
                        if ($nmil[$li] -eq 0x72 -and $li+4 -lt $nmil.Length) {
                            $lst = [BitConverter]::ToUInt32($nmil, $li+1)
                            try {
                                $lss = $mod.ResolveString($lst)
                                WL("    ldstr ["+$li+"] = `""+$lss+"`"")
                                $ldstrCount++
                            } catch {}
                        }
                    }
                    if ($ldstrCount -eq 0) { WL("    (no ldstr instructions)" ) }
                }
            }
        }
    }
}

# === Part 4: 运行时调用解密器获取关键字符串 ===
WL("")
WL("--- Part 4: Runtime decryptor calls with targeted indices ---")
$decType = $asm.GetType("mjldbepFpfgR2sirhk.Kusbq8F7xd8hvTfPmi")
if ($decType -ne $null) {
    $decMethod = $decType.GetMethod("kfW0Lx5YBq", $bf)
    if ($decMethod -ne $null) {
        # Try indices that might be related to WebSocket URL construction
        # From v7c results, these had identifiable content:
        $targetIndices = @(0, 1, 17, 29, 47, 73, 99, 107, 133, 159, 193, 205, 231, 243, 253, 265, 277, 309, 341, 381, 397, 407, 423, 433, 449, 461, 483, 491, 515, 539, 551, 561, 617, 627, 681, 691, 745, 757, 765, 785, 805, 829, 863, 897, 905, 919, 931, 945, 959, 973, 987, 1011, 1019, 1039, 1051, 1069, 1093, 1105, 1119, 1129, 1153, 1199, 1213, 1231, 1239, 1263, 1291, 1315, 1321, 1357, 1373, 1405, 1427, 1435, 1461, 1469, 1477, 1487, 1509, 1535, 1561, 1573, 1585, 1607, 1647, 1659, 1687, 1719, 1747, 1761, 1771, 1797, 1809, 1833, 1857, 1871, 1885, 1931, 1961, 1977, 2004)
        
        foreach ($idx in $targetIndices) {
            try {
                $result = $decMethod.Invoke($null, @([int]$idx))
                if ($result -ne $null -and $result.ToString().Length -gt 0) {
                    $bytes = [System.Text.Encoding]::UTF8.GetBytes($result.ToString())
                    $hexStr = ([BitConverter]::ToString($bytes)) -replace "-", ""
                    WL("kfW0Lx5YBq(" + $idx + ") len=" + $result.ToString().Length + " hex=" + $hexStr.Substring(0, [Math]::Min(200, $hexStr.Length)))
                }
            } catch {
                # skip errors
            }
        }
    }
}

# === Part 5: 尝试运行时实例化WSocketClientHelp并调用mAS495kb4k ===
WL("")
WL("--- Part 5: Runtime instantiation test ---")
try {
    # Get constructor
    $ctor = $wsType.GetConstructor(@([string]))
    if ($ctor -ne $null) {
        WL("Found String constructor")
        # Try creating instance with HgUrl from INI
        $instance = $ctor.Invoke(@("https://www.hga038.com"))
        if ($instance -ne $null) {
            WL("Instance created successfully!")
            # List all field values
            foreach ($f in $wsType.GetFields($bfa)) {
                try {
                    $fv = $f.GetValue($instance)
                    if ($fv -ne $null) {
                        WL("  Field " + $f.Name + " = [" + $fv.GetType().Name + "] " + $fv.ToString().Substring(0, [Math]::Min(100, $fv.ToString().Length)))
                    }
                } catch {}
            }
            
            # Try calling mAS495kb4k with various URLs
            $testUrls = @(
                "https://www.hga038.com",
                "wss://www.hga038.com/ws",
                "wss://hga038.com/socket",
                "/ws"
            )
            foreach ($tu in $testUrls) {
                try {
                    $ret = $masMethod.Invoke($instance, @($tu))
                    WL("  mAS495kb4k(`"" + $tu + "`") => " + $ret)
                } catch {
                    WL("  mAS495kb4k(`"" + $tu + "`") ERROR: " + $_.Exception.Message)
                }
            }
        }
    } else {
        WL("No String constructor found")
        # List all constructors
        foreach ($c in $wsType.GetConstructors()) {
            $cps = ($c.GetParameters() | ForEach-Object { $_.ParameterType.Name }) -join ", "
            WL("  ctor(" + $cps + ")")
        }
    }
} catch {
    WL("Instantiation error: " + $_.Exception.Message)
}

$sw.Close()
Write-Host "`nDONE! File: $outFile" -ForegroundColor Green
