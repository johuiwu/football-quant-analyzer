# v8: 追踪mAS495kb4k调用者 + 构建WebSocket URL
$ErrorActionPreference = "Stop"
$tp = [System.IO.Path]::GetTempPath()
$exe = $tp + "HgCeApp.exe"
if (-not [System.IO.File]::Exists($exe)) { Copy-Item "d:\下载\黄瓜角球\黄瓜角球\HgCeApp.exe" $exe -Force }
$asm = [System.Reflection.Assembly]::LoadFrom($exe)
$bf = [System.Reflection.BindingFlags]::Public -bor [System.Reflection.BindingFlags]::NonPublic -bor [System.Reflection.BindingFlags]::Static -bor [System.Reflection.BindingFlags]::DeclaredOnly
$bfa = $bf -bor [System.Reflection.BindingFlags]::Instance
$mod = $asm.ManifestModule

$outFile = Join-Path $tp "crack_v8.txt"
$sw = [System.IO.StreamWriter]::new($outFile, $false, [System.Text.UTF8Encoding]::new($true))

function WL($m) { $sw.WriteLine($m); Write-Host $m -ForegroundColor Yellow }

$wsType = $asm.GetType("HgCeApp.WSocketClientHelp")
$masMethod = $wsType.GetMethod("mAS495kb4k", $bfa)

WL("=== Finding ALL callers of WSocketClientHelp.mAS495kb4k(String) ===")
WL("")

$allTypes = $asm.GetTypes()
foreach ($t in $allTypes) {
    foreach ($m in $t.GetMethods($bf)) {
        $mb = $m.GetMethodBody()
        if ($mb -ne $null) {
            $mil = $mb.GetILAsByteArray()
            if ($mil -ne $null) {
                for ($j = 0; $j -lt $mil.Length; $j++) {
                    if ($mil[$j] -eq 0x28 -and $j+4 -lt $mil.Length) {
                        $tok2 = [BitConverter]::ToUInt32($mil, $j + 1)
                        try {
                            $rm = $mod.ResolveMethod($tok2)
                            if ($rm -ne $null -and $rm.Name -eq "mAS495kb4k") {
                                WL("CALLER: " + $t.FullName + "." + $m.Name + " at offset " + $j)
                                WL("  Caller params: " + ($m.GetParameters().Count))
                                
                                # Dump 40 instructions before the call
                                $startScan = [Math]::Max(0, $j - 50)
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
                                    elseif ($sop -eq 0x03) { $tag = "ldarg.1(url_param)" }
                                    elseif ($sop -ge 0x08 -and $sop -le 0x10) { $tag = "ldc.i4." + ($sop-8) }
                                    if ($tag -ne "") { WL("    [" + $si + "] " + $tag) }
                                }
                                WL("")
                            }
                        } catch {}
                    }
                }
            }
        }
    }
}

# Also search for any method containing "Uri" or "wss:" or "ws:" construction
WL("=== Searching for Uri/WebSocket construction ===")
WL("")
foreach ($t in $allTypes) {
    foreach ($m in $t.GetMethods($bf)) {
        $mb = $m.GetMethodBody()
        if ($mb -ne $null) {
            $mil = $mb.GetILAsByteArray()
            if ($mil -ne $null) {
                $hasUri = $false
                for ($j = 0; $j -lt $mil.Length; $j++) {
                    if ($mil[$j] -eq 0x8B -and $j+4 -lt $mil.Length) {
                        $tok2 = [BitConverter]::ToUInt32($mil, $j + 1)
                        try {
                            $ctor = $mod.ResolveMethod($tok2)
                            if ($ctor -ne $null -and $ctor.DeclaringType.Name -match "Uri|WebSocket|ClientWebSocket") {
                                WL("NEW " + $ctor.DeclaringType.FullName + " in " + $t.Name + "." + $m.Name + " at offset " + $j)
                                # Show context
                                $cs = [Math]::Max(0,$j-10)
                                for ($ci=$cs; $ci -lt [Math]::Min($j+6,$mil.Length); $ci++) {
                                    $cop = $mil[$ci]
                                    $ctag = ""
                                    if ($cop -eq 0x72) {
                                        $cst = [BitConverter]::ToUInt32($mil,$ci+1)
                                        try { $css = $mod.ResolveString($cst); $ctag = 'ldstr "'+$css+'"' } catch {}
                                    }
                                    if ($ctag -ne "") { WL("    ["+$ci+"] "+$ctag) }
                                }
                                $hasUri = $true
                            }
                        } catch {}
                    }
                }
            }
        }
    }
}

# Check Global class for URL-related fields
WL("")
WL("=== Global class ALL static fields ===")
$gt = $asm.GetType("HgCeApp.Global")
if ($gt -ne $null) {
    foreach ($f in $gt.GetFields($bfa)) {
        $fv = $f.GetValue($null)
        $fvs = "?"
        if ($fv -ne $null) { $fvs = "[" + $fv.GetType().Name + "]" }
        if ($f.FieldType.Name -match "String|Url|Int") {
            WL("  " + $f.Name + " (" + $f.FieldType.Name + ") = " + $fvs)
        }
    }
}

$sw.Close()
Write-Host "`nDONE! File: $outFile" -ForegroundColor Green
