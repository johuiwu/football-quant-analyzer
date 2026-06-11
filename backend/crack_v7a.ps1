# v7a: mAS495kb4k完整IL + 参数提取
$ErrorActionPreference = "Stop"
$tp = [System.IO.Path]::GetTempPath()
$exe = $tp + "HgCeApp.exe"
if (-not [System.IO.File]::Exists($exe)) { Copy-Item "d:\下载\黄瓜角球\黄瓜角球\HgCeApp.exe" $exe -Force }
$asm = [System.Reflection.Assembly]::LoadFrom($exe)
$bf = [System.Reflection.BindingFlags]::Public -bor [System.Reflection.BindingFlags]::NonPublic -bor [System.Reflection.BindingFlags]::Static -bor [System.Reflection.BindingFlags]::DeclaredOnly
$bfa = $bf -bor [System.Reflection.BindingFlags]::Instance
$decType = $asm.GetType("mjldbepFpfgR2sirhk.Kusbq8F7xd8hvTfPmi")
$kfMeth = $decType.GetMethod("kfW0Lx5YBq", $bf)
function De($i) { try { $r = $kfMeth.Invoke($null, @([int]$i)); if ($r -ne $null) { return "$r" } } catch {}; return "" }

$outFile = Join-Path $tp "crack_v7a.txt"
$sw = [System.IO.StreamWriter]::new($outFile, $false, [System.Text.UTF8Encoding]::new($true))

function WL($m) { $sw.WriteLine($m); Write-Host $m -ForegroundColor Yellow }

WL("=== mAS495kb4k FULL IL ===")
$wsType = $asm.GetType("HgCeApp.WSocketClientHelp")
$masMethod = $wsType.GetMethod("mAS495kb4k", $bfa)
$body = $masMethod.GetMethodBody()
$il = $body.GetILAsByteArray()
$mod = $asm.ManifestModule
WL("IL size: " + $il.Length)
WL("")

for ($i = 0; $i -lt $il.Length; $i++) {
    $op = $il[$i]
    $desc = ""
    $extra = ""
    $skip = 0
    if ($op -eq 0x00) { $desc = "nop" }
    elseif ($op -eq 0x02) { $desc = "ldarg.0" }
    elseif ($op -eq 0x03) { $desc = "ldarg.1" }
    elseif ($op -eq 0x06) { $desc = "ldnull" }
    elseif ($op -ge 0x08 -and $op -le 0x10) { $desc = "ldc.i4." + ($op-8) }
    elseif ($op -eq 0x14) { $desc = "ldnull" }
    elseif ($op -eq 0x1F) { $desc = "ldc.i4.s"; $v=[sbyte]$il[$i+1]; $extra=([string]$v); $skip=1 }
    elseif ($op -eq 0x20) { $desc = "ldc.i4"; $v=[BitConverter]::ToInt32($il,$i+1); $extra=([string]$v); $skip=4 }
    elseif ($op -eq 0x25) { $desc = "dup" }
    elseif ($op -eq 0x26) { $desc = "pop" }
    elseif ($op -eq 0x28) {
        $desc = "call"
        $tok = [BitConverter]::ToUInt32($il,$i+1)
        try {
            $cm = $mod.ResolveMethod($tok)
            $extra = $cm.DeclaringType.Name + "." + $cm.Name
            if ($cm.Name -eq "kfW0Lx5YBq") { $extra += " <<<DECRYPTOR" }
            if ($cm.Name -eq "ConnectAsync") { $extra += " <<<CONNECT" }
        } catch { $extra = "tok:" + $tok }
        $skip = 4
    }
    elseif ($op -eq 0x29) {
        $desc = "callvirt"
        $tok = [BitConverter]::ToUInt32($il,$i+1)
        try { $cm = $mod.ResolveMethod($tok); $extra = $cm.DeclaringType.Name + "." + $cm.Name } catch {}
        $skip = 4
    }
    elseif ($op -eq 0x2F) { $desc = "ret" }
    elseif ($op -eq 0x3C) {
        $desc = "ldsfld"; $tok=[BitConverter]::ToUInt32($il,$i+1)
        try { $f=$mod.ResolveField($tok); $extra=$f.DeclaringType.Name+"."+$f.Name+":"+$f.FieldType.Name } catch {}; $skip=4
    }
    elseif ($op -eq 0x3D) {
        $desc = "stsfld"; $tok=[BitConverter]::ToUInt32($il,$i+1)
        try { $f=$mod.ResolveField($tok); $extra=$f.DeclaringType.Name+"."+$f.Name } catch {}; $skip=4
    }
    elseif ($op -eq 0x45) { $desc = "box"; $skip=4 }
    elseif ($op -eq 0x46) { $desc = "newarr"; $skip=4 }
    elseif ($op -ge 0x49 -and $op -le 0x53) { $desc = "ldelem" }
    elseif ($op -eq 0x58) { $desc = "add" }
    elseif ($op -eq 0x59) { $desc = "sub" }
    elseif ($op -eq 0x6D) {
        $desc = "callvirt"; $tok=[BitConverter]::ToUInt32($il,$i+1)
        try { $cm=$mod.ResolveMethod($tok); $extra=$cm.DeclaringType.Name+"."+$cm.Name; if($cm.Name-match "ConnectAsync|SendAsync"){$extra+=" <<<<"} } catch {}; $skip=4
    }
    elseif ($op -eq 0x70 -or $op -eq 0x72) {
        $desc = "ldstr"; $tok=[BitConverter]::ToUInt32($il,$i+1)
        try { $s=$mod.ResolveString($tok); $sd="$s"; if($sd.Length-gt100){$sd=$sd.Substring(0,100)+"..."}; $extra='"'+$sd+'"' } catch {}; $skip=4
    }
    elseif ($op -eq 0x76) {
        $desc = "ldfld"; $tok=[BitConverter]::ToUInt32($il,$i+1)
        try { $f=$mod.ResolveField($tok); $extra=$f.DeclaringType.Name+"."+$f.Name+":"+$f.FieldType.Name } catch {}; $skip=4
    }
    elseif ($op -eq 0x77) {
        $desc = "ldsfld"; $tok=[BitConverter]::ToUInt32($il,$i+1)
        try { $f=$mod.ResolveField($tok); $extra=$f.DeclaringType.Name+"."+$f.Name+":"+$f.FieldType.Name } catch {}; $skip=4
    }
    elseif ($op -eq 0x7B) {
        $desc = "ldfld"; $tok=[BitConverter]::ToUInt32($il,$i+1)
        try { $f=$mod.ResolveField($tok); $extra=$f.DeclaringType.Name+"."+$f.Name+":"+$f.FieldType.Name } catch {}; $skip=4
    }
    elseif ($op -eq 0x7C) {
        $desc = "ldsfld"; $tok=[BitConverter]::ToUInt32($il,$i+1)
        try { $f=$mod.ResolveField($tok); $extra=$f.DeclaringType.Name+"."+$f.Name+":"+$f.FieldType.Name } catch {}; $skip=4
    }
    elseif ($op -eq 0x87) {
        $desc = "callvirt"; $tok=[BitConverter]::ToUInt32($il,$i+1)
        try {
            $cm=$mod.ResolveMethod($tok); $extra=$cm.DeclaringType.Name+"."+$cm.Name
            if($cm.Name-eq"ConnectAsync"){$extra+=" <<<CONN!!!"}
            if($cm.Name-eq"SendAsync"){$extra+=" <<<SEND!!!"}
            if($cm.Name-eq"Concat"){$extra+=" <<<CONCAT"}
        } catch {}; $skip=4
    }
    elseif ($op -eq 0x8B) {
        $desc = "newobj"; $tok=[BitConverter]::ToUInt32($il,$i+1)
        try { $cm=$mod.ResolveMethod($tok); $extra=$cm.DeclaringType.Name+"."+$cm.Name; if($cm.DeclaringType.Name-match "Uri|WebSocket|ClientWebSocket"){$extra+=" <<<NEW"} } catch {}; $skip=4
    }
    else { $desc = "0x" + $op.ToString("X2") }

    if ($extra -ne "") {
        WL("  [" + $i.ToString("D3") + "] " + $desc.PadRight(24) + " " + $extra)
    } else {
        WL("  [" + $i.ToString("D3") + "] " + $desc)
    }
    $i = $i + $skip
}

# 提取 kfW0Lx5YBq 参数
WL("")
WL("=== Extracting kfW0Lx5YBq param at call offset ===")
# 找到所有 call kfW0Lx5YBq 的位置
for ($ci = 0; $ci -lt $il.Length; $ci++) {
    if ($il[$ci] -eq 0x28 -and $ci+4 -lt $il.Length) {
        $ctok = [BitConverter]::ToUInt32($il, $ci+1)
        try {
            $crm = $mod.ResolveMethod($ctok)
            if ($crm.Name -eq "kfW0Lx5YBq") {
                WL("Found kfW0Lx5YBq call at offset " + $ci)
                # 向前扫描参数
                $foundIt = $false
                for ($si = $ci - 1; $si -ge 0; $si--) {
                    $sop = $il[$si]
                    if ($sop -ge 0x08 -and $sop -le 0x10) {
                        $pv2 = $sop - 8
                        $dr = De($pv2)
                        WL("  param from ldc.i4: " + $pv2 + " => " + $dr)
                        $foundIt = $true; break
                    }
                    if ($sop -eq 0x1F) {
                        $pv2 = [sbyte]$il[$si+1]
                        $dr = De($pv2)
                        WL("  param from ldc.i4.s: " + $pv2 + " => " + $dr)
                        $foundIt = $true; break
                    }
                    if ($sop -eq 0x20) {
                        $pv2 = [BitConverter]::ToInt32($il, $si+1)
                        $dr = De($pv2)
                        WL("  param from ldc.i4: " + $pv2 + " => " + $dr)
                        $foundIt = $true; break
                    }
                }
                if (-not $foundIt) {
                    WL("  Param loaded dynamically (not constant). Context:")
                    for ($si = [Math]::Max(0,$ci-15); $si -lt $ci; $si++) {
                        $tag2 = ""
                        $sop2 = $il[$si]
                        if ($sop2 -eq 0x03) { $tag2 = "ldarg.1(url)" }
                        elseif ($sop2 -eq 0x02) { $tag2 = "ldarg.0(this)" }
                        elseif ($sop2 -eq 0x06) { $tag2 = "ldnull" }
                        elseif ($sop2 -eq 0x25) { $tag2 = "dup" }
                        elseif ($sop2 -eq 0x28) {
                            $t2=[BitConverter]::ToUInt32($il,$si+1)
                            try{ $c2=$mod.ResolveMethod($t2); $tag2="call "+$c2.DeclaringType.Name+"."+$c2.Name }catch{}
                        }
                        elseif ($sop2 -eq 0x87) {
                            $t2=[BitConverter]::ToUInt32($il,$si+1)
                            try{ $c2=$mod.ResolveMethod($t2); $tag2="callvirt "+$c2.DeclaringType.Name+"."+$c2.Name }catch{}
                        }
                        elseif ($sop2 -eq 0x7C) {
                            $t2=[BitConverter]::ToUInt32($il,$si+1)
                            try{ $f2=$mod.ResolveField($t2); $tag2="ldsfld "+$f2.DeclaringType.Name+"."+$f2.Name }catch{}
                        }
                        elseif ($sop2 -eq 0x7B) {
                            $t2=[BitConverter]::ToUInt32($il,$si+1)
                            try{ $f2=$mod.ResolveField($t2); $tag2="ldfld "+$f2.DeclaringType.Name+"."+$f2.Name }catch{}
                        }
                        elseif ($sop2 -eq 0x72) {
                            $t2=[BitConverter]::ToUInt32($il,$si+1)
                            try{ $ss2=$mod.ResolveString($t2); $tag2='ldstr "'+$ss2+'"' }catch{}
                        }
                        if ($tag2 -ne "") { WL("    [" + $si + "] " + $tag2) }
                    }
                }
            }
        } catch {}
    }
}

$sw.Close()
Write-Host "`nDONE! File: $outFile" -ForegroundColor Green
