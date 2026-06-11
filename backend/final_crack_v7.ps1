# HgCeApp.exe 深度破解 v7 - 完整IL分析 + 调用链追踪
$ErrorActionPreference = "Stop"

$exePath = [System.IO.Path]::GetTempPath() + "HgCeApp.exe"
if (-not [System.IO.File]::Exists($exePath)) {
    Copy-Item "d:\下载\黄瓜角球\黄瓜角球\HgCeApp.exe" $exePath -Force
}

Write-Host "[1/6] Loading assembly..." -ForegroundColor Cyan
$asm = [System.Reflection.Assembly]::LoadFrom($exePath)
$bf = [System.Reflection.BindingFlags]::Public -bor [System.Reflection.BindingFlags]::NonPublic -bor [System.Reflection.BindingFlags]::Static -bor [System.Reflection.BindingFlags]::DeclaredOnly
$bfa = $bf -bor [System.Reflection.BindingFlags]::Instance

$decType = $asm.GetType("mjldbepFpfgR2sirhk.Kusbq8F7xd8hvTfPmi")
$kfMeth = $decType.GetMethod("kfW0Lx5YBq", $bf)

function De($i) {
    try { $r = $kfMeth.Invoke($null, @([int]$i)); if ($r -ne $null) { return "$r" } } catch {}
    return ""
}

$outDir = [System.IO.Path]::GetTempPath()
$outFile = Join-Path $outDir "final_crack_v7.txt"
$lines = [System.Collections.Generic.List[string]]::new()

function L($m) { $lines.Add($m); Write-Host $m -ForegroundColor Yellow }

# ========== Step 1: mAS495kb4k 完整IL反汇编 ==========
L("=== STEP 1: mAS495kb4k FULL IL Disassembly ===")
$wsType = $asm.GetType("HgCeApp.WSocketClientHelp")
$masMethod = $wsType.GetMethod("mAS495kb4k", $bfa)
$body = $masMethod.GetMethodBody()
$il = $body.GetILAsByteArray()
$mod = $asm.ManifestModule
L("IL size: $($il.Length)")
L("")

# 完整IL反汇编
for ($i = 0; $i -lt $il.Length; $i++) {
    $op = $il[$i]
    $desc = ""
    $extra = ""
    $skip = 0

    switch ($op) {
        0x00 { $desc = "nop" }
        0x02 { $desc = "ldarg.0" }
        0x03 { $desc = "ldarg.1" }
        0x06 { $desc = "ldnull" }
        0x07 { $desc = "ldc.i4.m1" }
        0x08 { $desc = "ldc.i4.0" }
        0x09 { $desc = "ldc.i4.1" }
        0x0A { $desc = "ldc.i4.2" }
        0x0B { $desc = "ldc.i4.3" }
        0x0C { $desc = "ldc.i4.4" }
        0x0D { $desc = "ldc.i4.5" }
        0x0E { $desc = "ldc.i4.6" }
        0x0F { $desc = "ldc.i4.7" }
        0x10 { $desc = "ldc.i4.8" }
        0x11 { $desc = "ldc.i4.s"; $extra = "$($il[$i+1])"; $skip = 1 }
        0x12 { $desc = "ldc.i4"; $v = [BitConverter]::ToInt32($il,$i+1); $extra = "$v"; $skip = 4 }
        0x14 { $desc = "ldnull" }
        0x16 { $desc = "ldarg.s"; $idx = $il[$i+1]; $extra = "$idx"; $skip = 1 }
        0x17 { $desc = "ldarga.s"; $idx = $il[$i+1]; $extra = "$idx"; $skip = 1 }
        0x18 { $desc = "qmark" }
        0x19 { $desc = "ldflda" }
        0x1F { $desc = "ldc.i4.s"; $v = [sbyte]$il[$i+1]; $extra = "$v"; $skip = 1 }
        0x20 { $desc = "ldc.i4"; $v = [BitConverter]::ToInt32($il,$i+1); $extra = "$v"; $skip = 4 }
        0x21 { $desc = "ldc.i8"; $skip = 8 }
        0x22 { $desc = "ldc.r4"; $skip = 4 }
        0x23 { $desc = "ldc.r8"; $skip = 8 }
        0x25 { $desc = "dup" }
        0x26 { $desc = "pop" }
        0x27 { $desc = "jmp" }
        0x28 {
            $desc = "call"
            $tok = [BitConverter]::ToUInt32($il,$i+1)
            try {
                $cm = $mod.ResolveMethod($tok)
                $extra = "$($cm.DeclaringType.Name).$($cm.Name)"
                if ($cm.Name -eq "kfW0Lx5YBq") { $extra += " <<<DECRYPTOR" }
                if ($cm.Name -eq "ConnectAsync") { $extra += " <<<CONNECT_ASYNC" }
            } catch { $extra = "token:$tok" }
            $skip = 4
        }
        0x29 { $desc = "callvirt"; $tok = [BitConverter]::ToUInt32($il,$i+1); try { $cm = $mod.ResolveMethod($tok); $extra = "$($cm.DeclaringType.Name).$($cm.Name)" } catch {}; $skip = 4 }
        0x2A { $desc = "calli"; $skip = 4 }
        0x2E { $desc = "ceq" }
        0x2F { $desc = "ret" }
        0x37 { $desc = "newarr" }
        0x38 { $desc = "stelem.i4" }
        0x39 { $desc = "unbox.any" }
        0x3A { $desc = "throw" }
        0x3B { $desc = "ldfld"; $tok = [BitConverter]::ToUInt32($il,$i+1); try { $f = $mod.ResolveField($tok); $extra = "$($f.DeclaringType.Name).$($f.Name)" } catch {}; $skip = 4 }
        0x3C { $desc = "ldsfld"; $tok = [BitConverter]::ToUInt32($il,$i+1); try { $f = $mod.ResolveField($tok); $extra = "$($f.DeclaringType.Name).$($f.Name)" } catch {}; $skip = 4 }
        0x3D { $desc = "stsfld"; $tok = [BitConverter]::ToUInt32($il,$i+1); try { $f = $mod.ResolveField($tok); $extra = "$($f.DeclaringType.Name).$($f.Name)" } catch {}; $skip = 4 }
        0x3E { $desc = "stobj" }
        0x3F { $desc = "conv.ovf.i1.un" }
        0x40 { $desc = "conv.ovf.i2.un" }
        0x41 { $desc = "conv.ovf.i4.un" }
        0x42 { $desc = "conv.ovf.i8.un" }
        0x43 { $desc = "conv.ovf.u4.un" }
        0x44 { $desc = "conv.ovf.u8.un" }
        0x45 { $desc = "box" }
        0x46 { $desc = "newarr"; $skip = 4 }
        0x47 { $desc = "ldlen" }
        0x48 { $desc = "ldelema" }
        0x49 { $desc = "ldelem.i1" }
        0x4A { $desc = "ldelem.u1" }
        0x4B { $desc = "ldelem.i2" }
        0x4C { $desc = "ldelem.u2" }
        0x4D { $desc = "ldelem.i4" }
        0x4E { $desc = "ldelem.u4" }
        0x4F { $desc = "ldelem.i8" }
        0x50 { $desc = "ldelem.i" }
        0x51 { $desc = "ldelem.r4" }
        0x52 { $desc = "ldelem.r8" }
        0x53 { $desc = "ldelem.ref" }
        0x58 { $desc = "add" }
        0x59 { $desc = "sub" }
        0x5A { $desc = "mul" }
        0x5B { $desc = "div" }
        0x5C { $desc = "rem" }
        0x5D { $desc = "and" }
        0x5E { $desc = "or" }
        0x5F { $desc = "xor" }
        0x60 { $desc = "shl" }
        0x61 { $desc = "shr" }
        0x62 { $desc = "shr.un" }
        0x63 { $desc = "neg" }
        0x64 { $desc = "not" }
        0x65 { $desc = "conv.i1" }
        0x66 { $desc = "conv.i2" }
        0x67 { $desc = "conv.i4" }
        0x68 { $desc = "conv.i8" }
        0x69 { $desc = "conv.r4" }
        0x6A { $desc = "conv.r8" }
        0x6B { $desc = "conv.u4" }
        0x6C { $desc = "conv.u8" }
        0x6D { $desc = "callvirt"; $tok = [BitConverter]::ToUInt32($il,$i+1); try { $cm = $mod.ResolveMethod($tok); $extra = "$($cm.DeclaringType.Name).$($cm.Name)"; if($cm.Name -eq "ConnectAsync"){$extra+=" <<<CONN"} if($cm.Name -eq "SendAsync"){$extra+=" <<<SEND"} } catch {}; $skip = 4 }
        0x6E { $desc = "cpobj" }
        0x6F { $desc = "ldobj" }
        0x70 { $desc = "ldstr"; $tok = [BitConverter]::ToUInt32($il,$i+1); try { $s = $mod.ResolveString($tok); $sd = "$s"; if($sd.Length -gt 100){$sd=$sd.Substring(0,100)+"..."} $extra = "`"$sd`"" } catch {}; $skip = 4 }
        0x71 { $desc = "isinst" }
        0x72 { $desc = "ldstr"; $tok = [BitConverter]::ToUInt32($il,$i+1); try { $s = $mod.ResolveString($tok); $sd = "$s"; if($sd.Length -gt 100){$sd=$sd.Substring(0,100)+"..."} $extra = "`"$sd`"" } catch {}; $skip = 4 }
        0x73 { $desc = "castclass" }
        0x74 { $desc = "unbox" }
        0x75 { $desc = "throw" }
        0x76 { $desc = "ldfld"; $tok = [BitConverter]::ToUInt32($il,$i+1); try { $f = $mod.ResolveField($tok); $extra = "$($f.DeclaringType.Name).$($f.Name):$($f.FieldType.Name)" } catch {}; $skip = 4 }
        0x77 { $desc = "ldsfld"; $tok = [BitConverter]::ToUInt32($il,$i+1); try { $f = $mod.ResolveField($tok); $extra = "$($f.DeclaringType.Name).$($f.Name):$($f.FieldType.Name)" } catch {}; $skip = 4 }
        0x78 { $desc = "stfld"; $tok = [BitConverter]::ToUInt32($il,$i+1); try { $f = $mod.ResolveField($tok); $extra = "$($f.DeclaringType.Name).$($f.Name)" } catch {}; $skip = 4 }
        0x79 { $desc = "ldsflda" }
        0x7A { $desc = "stfld"; $tok = [BitConverter]::ToUInt32($il,$i+1); try { $f = $mod.ResolveField($tok); $extra = "$($f.DeclaringType.Name).$($f.Name)" } catch {}; $skip = 4 }
        0x7B { $desc = "ldfld"; $tok = [BitConverter]::ToUInt32($il,$i+1); try { $f = $mod.ResolveField($tok); $extra = "$($f.DeclaringType.Name).$($f.Name):$($f.FieldType.Name)" } catch {}; $skip = 4 }
        0x7C { $desc = "ldsfld"; $tok = [BitConverter]::ToUInt32($il,$i+1); try { $f = $mod.ResolveField($tok); $extra = "$($f.DeclaringType.Name).$($f.Name):$($f.FieldType.Name)" } catch {}; $skip = 4 }
        0x7D { $desc = "stsfld"; $tok = [BitConverter]::ToUInt32($il,$i+1); try { $f = $mod.ResolveField($tok); $extra = "$($f.DeclaringType.Name).$($f.Name)" } catch {}; $skip = 4 }
        0x7E { $desc = "refanyval" }
        0x7F { $desc = "ckfinite" }
        0x80 { $desc = "mkrefany" }
        0x81 { $desc = "ldtoken"; $skip = 4 }
        0x82 { $desc = "conv.u2" }
        0x83 { $desc = "conv.u1" }
        0x84 { $desc = "conv.i" }
        0x85 { $desc = "conv.ovf.i" }
        0x86 { $desc = "conv.ovf.u" }
        0x87 {
            $desc = "callvirt"
            $tok = [BitConverter]::ToUInt32($il,$i+1)
            try {
                $cm = $mod.ResolveMethod($tok)
                $extra = "$($cm.DeclaringType.Name).$($cm.Name)"
                if ($cm.Name -eq "ConnectAsync") { $extra += " <<<CONNECT_ASYNC!!!" }
                if ($cm.Name -eq "SendAsync") { $extra += " <<<SEND_ASYNC!!!" }
                if ($cm.Name -eq "get_Bytes") { $extra += " <<<GET_BYTES" }
                if ($cm.Name -eq "Concat") { $extra += " <<<STRING_CONCAT" }
                if ($cm.Name -eq "Format") { $extra += " <<<FORMAT" }
            } catch { $extra = "token:$tok" }
            $skip = 4
        }
        0x88 { $desc = "constrained."; $skip = 4 }
        0x89 { $desc = "conv.ovf.i1" }
        0x8A { $desc = "conv.ovf.u1.un" }
        0x8B {
            $desc = "newobj"
            $tok = [BitConverter]::ToUInt32($il,$i+1)
            try {
                $cm = $mod.ResolveMethod($tok)
                $extra = "$($cm.DeclaringType.Name).$($cm.Name)"
                if ($cm.DeclaringType.Name -match "Uri|WebSocket|ClientWebSocket|Task") { $extra += " <<<NEW_OBJ_URGENT" }
            } catch { $extra = "token:$tok" }
            $skip = 4
        }
        0x8C { $desc = "initobj"; $skip = 4 }
        0x8D { $desc = "conv.ovf.i2" }
        0x8E { $desc = "conv.ovf.u2" }
        0x8F { $desc = "conv.ovf.i4" }
        0x90 { $desc = "conv.ovf.i8" }
        0x91 { $desc = "conv.ovf.u4" }
        0x92 { $desc = "conv.ovf.u8" }
        0x93 { $desc = "shadow"; $skip = 12 }
        0x94 { $desc = "shadow"; $skip = 12 }
        0x97 { $desc = "shadow"; $skip = 4 }
        0x98 { $desc = "prefix7" }
        0x99 { $desc = "prefix8" }
        0x9A { $desc = "prefix6" }
        0x9B { $desc = "prefix5" }
        0x9C { $desc = "prefix4" }
        0x9D { $desc = "prefix3" }
        0x9E { $desc = "prefix2" }
        0x9F { $desc = "prefix1" }
        0xA0 { $desc = "arglist" }
        0xA1 { $desc = "ceq" }
        0xA2 { $desc = "cgt" }
        0xA3 { $desc = "cgt.un" }
        0xA4 { $desc = "clt" }
        0xA5 { $desc = "clt.un" }
        0xA6 { $desc = "ldftn"; $skip = 4 }
        0xA7 { $desc = "ldvirtftn"; $skip = 4 }
        default {
            # branch instructions
            if ($op -ge 0x38 -and $op -le 0x3E) { $desc = "short_branch_$op" }
            elseif ($op -ge 0x2B -and $op -le 0x2C) { $desc = "jmp_short"; $skip = 1 }
            else { $desc = "0x$($op.ToString('X2'))_UNKNOWN" }
        }
    }

    if ($extra -ne "") {
        L("  [$($i.ToString('D3'))] $($desc.PadRight(24)) $extra")
    } else {
        L("  [$($i.ToString('D3'))] $desc")
    }
    $i += $skip
}

# ========== Step 2: 找所有调用 mAS495kb4k 的地方 ==========
L("")
L("=== STEP 2: All Callers of mAS495kb4k ===")
$allTypes = $asm.GetTypes()
foreach ($t in $allTypes) {
    foreach ($m in $t.GetMethods($bfa)) {
        $mb = $m.GetMethodBody()
        if ($mb -ne $null) {
            $mil = $mb.GetILAsByteArray()
            if ($mil -ne $null) {
                for ($j = 0; $j -lt $mil.Length; $j++) {
                    if ($mil[$j] -eq 0x28 -or $mil[$j] -eq 0x87) {
                        if ($j + 4 -lt $mil.Length) {
                            $tok2 = [BitConverter]::ToUInt32($mil, $j + 1)
                            try {
                                $rm = $asm.ManifestModule.ResolveMethod($tok2)
                                if ($rm -ne $null -and $rm.Name -eq "mAS495kb4k") {
                                    L("  CALLER: $($t.FullName).$($m.Name) at IL offset $j")
                                    # 向前扫描找参数来源
                                    L("    --- Context before call ---")
                                    $scanStart = [Math]::Max(0, $j - 20)
                                    for ($si = $scanStart; $si -lt $j; $si++) {
                                        $sop = $mil[$si]
                                        $sdesc = ""
                                        switch ($sop) {
                                            0x72 { $sdesc = "ldstr"; $stok = [BitConverter]::ToUInt32($mil,$si+1); try{ $ss = $mod.ResolveString($stok); if($ss){$sdesc="ldstr=`"$ss`""} }catch{}; break }
                                            0x28 { $sct = [BitConverter]::ToUInt32($mil,$si+1); try{ $scm = $mod.ResolveMethod($sct); $sdesc="call=$($scm.DeclaringType.Name).$($scm.Name)" }catch{}; break }
                                            0x87 { $sct = [BitConverter]::ToUInt32($mil,$si+1); try{ $scm = $mod.ResolveMethod($sct); $sdesc="callvirt=$($scm.DeclaringType.Name).$($scm.Name)" }catch{}; break }
                                            0x7C { $sct = [BitConverter]::ToUInt32($mil,$si+1); try{ $sf = $mod.ResolveField($sct); $sdesc="ldsfld=$($sf.DeclaringType.Name).$($sf.Name)" }catch{}; break }
                                            0x7B { $sct = [BitConverter]::ToUInt32($mil,$si+1); try{ $sf = $mod.ResolveField($sct); $sdesc="ldfld=$($sf.DeclaringType.Name).$($sf.Name)" }catch{}; break }
                                            0x06 { $sdesc = "ldnull"; break }
                                            0x25 { $sdesc = "dup"; break }
                                            default {
                                                if ($sop -ge 0x08 -and $sop -le 0x10) { $sdesc = "ldc.i4.$($sop-8)" }
                                                elseif ($sop -eq 0x1F) { $sv = [sbyte]$mil[$si+1]; $sdesc = "ldc.i4.s=$sv" }
                                                elseif ($sop -eq 0x20) { $sv = [BitConverter]::ToInt32($mil,$si+1); $sdesc = "ldc.i4=$sv" }
                                                elseif ($sop -eq 0x14) { $sdesc = "ldnull" }
                                                elseif ($sop -eq 0x02) { $sdesc = "ldarg.0(this)" }
                                                elseif ($sop -eq 0x03) { $sdesc = "ldarg.1(url param)" }
                                            }
                                        }
                                        L("      [$si] $sdesc")
                                    }
                                }
                            } catch {}
                        }
                    }
                }
            }
        }
    }
}

# ========== Step 3: HI548hsim5 完整IL反汇编 ==========
L("")
L("=== STEP 3: HI548hsim5 FULL IL ===")
$hiMethod = $wsType.GetMethod("HI548hsim5", $bfa)
if ($hiMethod -ne $null) {
    $hbody = $hiMethod.GetMethodBody()
    $hil = $hbody.GetILAsByteArray()
    L("IL size: $($hil.Length)")
    $hmod = $asm.ManifestModule
    for ($i = 0; $i -lt $hil.Length; $i++) {
        $hop = $hil[$i]
        $hdesc = ""; $hextra = ""; $hskip = 0
        switch ($hop) {
            0x28 {
                $htok = [BitConverter]::ToUInt32($hil,$i+1)
                try {
                    $hm = $hmod.ResolveMethod($htok)
                    $hextra = "$($hm.DeclaringType.Name).$($hm.Name)"
                    if ($hm.Name -match "ConnectAsync|mAS495kb4k|SendAsync|Concat|Format|kfW0Lx5YBq") { $hextra += " <<<<" }
                } catch {}
                $hdesc = "call"; $hskip = 4
            }
            0x87 {
                $htok = [BitConverter]::ToUInt32($hil,$i+1)
                try {
                    $hm = $hmod.ResolveMethod($htok)
                    $hextra = "$($hm.DeclaringType.Name).$($hm.Name)"
                    if ($hm.Name -match "ConnectAsync|mAS495kb4k|SendAsync|Concat|Format|kfW0Lx5YBq|get_Value|get_Host|get_Scheme|get_PathAndQuery|ToString") { $hextra += " <<<<" }
                } catch {}
                $hdesc = "callvirt"; $hskip = 4
            }
            0x72 {
                $htok = [BitConverter]::ToUInt32($hil,$i+1)
                try { $hs = $hmod.ResolveString($htok); $hextra = "`"$hs`"" } catch {}
                $hdesc = "ldstr"; $hskip = 4
            }
            0x8B {
                $htok = [BitConverter]::ToUInt32($hil,$i+1)
                try {
                    $hm = $hmod.ResolveMethod($htok)
                    $hextra = "$($hm.DeclaringType.Name).$($hm.Name)"
                    if ($hm.DeclaringType.Name -match "Uri|WebSocket|ClientWebSocket|Task") { $hextra += " <<<NEW" }
                } catch {}
                $hdesc = "newobj"; $hskip = 4
            }
            0x7C {
                $htok = [BitConverter]::ToUInt32($hil,$i+1)
                try { $hf = $hmod.ResolveField($htok); $hextra = "$($hf.DeclaringType.Name).$($hf.Name):$($hf.FieldType.Name)" } catch {}
                $hdesc = "ldsfld"; $hskip = 4
            }
            0x7B {
                $htok = [BitConverter]::ToUInt32($hil,$i+1)
                try { $hf = $hmod.ResolveField($htok); $hextra = "$($hf.DeclaringType.Name).$($hf.Name):$($hf.FieldType.Name)" } catch {}
                $hdesc = "ldfld"; $hskip = 4
            }
            default {
                if ($hop -eq 0x02) { $hdesc = "ldarg.0" }
                elseif ($hop -eq 0x06) { $hdesc = "ldnull" }
                elseif ($hop -eq 0x25) { $hdesc = "dup" }
                elseif ($hop -eq 0x26) { $hdesc = "pop" }
                elseif ($hop -eq 0x2F) { $hdesc = "ret" }
                elseif ($hop -ge 0x08 -and $hop -le 0x10) { $hdesc = "ldc.i4.$($hop-8)" }
                elseif ($hop -eq 0x1F) { $sv=[sbyte]$hil[$i+1]; $hdesc="ldc.i4.s=$sv"; $hskip=1 }
                elseif ($hop -eq 0x20) { $sv=[BitConverter]::ToInt32($hil,$i+1); $hdesc="ldc.i4=$sv"; $hskip=4 }
                elseif ($hop -eq 0x14) { $hdesc = "ldnull" }
                else { $hdesc = "0x$($hop.ToString('X2'))" }
            }
        }
        L("  [$($i.ToString('D3'))] $($hdesc.PadRight(14)) $hextra")
        $i += $hskip
    }
}

# ========== Step 4: 解密大范围索引并保存为raw bytes ==========
L("")
L("=== STEP 4: Wide-range Decryption (raw output) ===")
$rawFile = Join-Path $outDir "decrypted_raw.txt"
$rawLines = [System.Collections.Generic.List[string]]::new()

$count = 0
for ($i = 0; $i -le 5000; $i++) {
    $r = De($i)
    if ($r.Length -gt 0) {
        $count++
        $rawLines.Add("=== kfW0Lx5YBq($i) ===")
        $rawLines.Add($r)
        $rawLines.Add("")
        
        # 也显示摘要到控制台
        if ($count -le 50) {
            $d = $r
            if ($d.Length -gt 200) { $d = $d.Substring(0,200) + "..." }
            L("  [$i] len=$($r.Length) => `"$d`"")
        }
    }
}
$rawLines.Add("Total non-empty: $count")
[System.IO.File]::WriteAllLines($rawFile, $rawLines, [System.Text.UTF8Encoding]::new($true))
L("Raw decryption saved to: $rawFile")
L("Total non-empty strings: $count")

# ========== Step 5: PJI4DVIrcW 方法分析（可能是Open） ==========
L("")
L("=== STEP 5: PJI4DVIrcW Analysis (likely Open) ===")
$pjiMethod = $wsType.GetMethod("PJI4DVIrcW", $bfa)
if ($pjiMethod -ne $null) {
    $pjibody = $pjiMethod.GetMethodBody()
    if ($pjibody -ne $null) {
        $pjil = $pjibody.GetILAsByteArray()
        L("IL size: $($pjil.Length)")
        $pmod = $asm.ManifestModule
        for ($i = 0; $i -lt $pjil.Length; $i++) {
            $pop = $pjil[$i]
            $pdesc = ""; $pextra = ""; $pskip = 0
            switch ($pop) {
                0x28 {
                    $ptok = [BitConverter]::ToUInt32($pjil,$i+1)
                    try {
                        $pm = $pmod.ResolveMethod($ptok)
                        $pextra = "$($pm.DeclaringType.Name).$($pm.Name)"
                        if ($pm.Name -match "mAS495kb4k|HI548hsim5|kfW0Lx5YBq|ConnectAsync|Concat|Format|Ddk4OdT6x7|G9NZ0lBapP") { $pextra += " <<<<" }
                    } catch {}
                    $pdesc = "call"; $pskip = 4
                }
                0x87 {
                    $ptok = [BitConverter]::ToUInt32($pjil,$i+1)
                    try {
                        $pm = $pmod.ResolveMethod($ptok)
                        $pextra = "$($pm.DeclaringType.Name).$($pm.Name)"
                        if ($pm.Name -match "mAS495kb4k|HI548hsim5|kfW0Lx5YBq|ConnectAsync|Concat|Format|Ddk4OdT6x7|G9NZ0lBapP") { $pextra += " <<<<" }
                    } catch {}
                    $pdesc = "callvirt"; $pskip = 4
                }
                0x72 {
                    $ptok = [BitConverter]::ToUInt32($pjil,$i+1)
                    try { $ps = $pmod.ResolveString($ptok); $pextra = "`"$ps`"" } catch {}
                    $pdesc = "ldstr"; $pskip = 4
                }
                0x8B {
                    $ptok = [BitConverter]::ToUInt32($pjil,$i+1)
                    try {
                        $pm = $pmod.ResolveMethod($ptok)
                        $pextra = "$($pm.DeclaringType.Name).$($pm.Name)"
                    } catch {}
                    $pdesc = "newobj"; $pskip = 4
                }
                0x7C {
                    $ptok = [BitConverter]::ToUInt32($pjil,$i+1)
                    try { $pf = $pmod.ResolveField($ptok); $pextra = "$($pf.DeclaringType.Name).$($pf.Name):$($pf.FieldType.Name)" } catch {}
                    $pdesc = "ldsfld"; $pskip = 4
                }
                0x7B {
                    $ptok = [BitConverter]::ToUInt32($pjil,$i+1)
                    try { $pf = $pmod.ResolveField($ptok); $pextra = "$($pf.DeclaringType.Name).$($pf.Name):$($pf.FieldType.Name)" } catch {}
                    $pdesc = "ldfld"; $pskip = 4
                }
                default {
                    if ($pop -eq 0x02) { $pdesc = "ldarg.0" }
                    elseif ($pop -eq 0x03) { $pdesc = "ldarg.1" }
                    elseif ($pop -eq 0x06) { $pdesc = "ldnull" }
                    elseif ($pop -eq 0x25) { $pdesc = "dup" }
                    elseif ($pop -eq 0x26) { $pdesc = "pop" }
                    elseif ($pop -eq 0x2F) { $pdesc = "ret" }
                    elseif ($pop -ge 0x08 -and $pop -le 0x10) { $pdesc = "ldc.i4.$($pop-8)" }
                    elseif ($pop -eq 0x1F) { $sv=[sbyte]$pjil[$i+1]; $pdesc="ldc.i4.s=$sv"; $pskip=1 }
                    elseif ($pop -eq 0x20) { $sv=[BitConverter]::ToInt32($pjil,$i+1); $pdesc="ldc.i4=$sv"; $pskip=4 }
                    elseif ($pop -eq 0x14) { $pdesc = "ldnull" }
                    else { $pdesc = "0x$($pop.ToString('X2'))" }
                }
            }
            L("  [$($i.ToString('D3'))] $($pdesc.PadRight(14)) $pextra")
            $i += $pskip
        }
    }
}

# ========== 写入 ==========
$utf8 = [System.Text.UTF8Encoding]::new($true)
[System.IO.File]::WriteAllLines($outFile, $lines, $utf8)
Write-Host "`nDONE! File: $outFile" -ForegroundColor Green
Write-Host "Raw decrypt: $rawFile" -ForegroundColor Green
