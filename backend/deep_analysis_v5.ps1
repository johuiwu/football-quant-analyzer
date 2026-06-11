# HgCeApp.exe 深度逆向 v5 - 极简稳健版
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
$outFile = [System.IO.Path]::GetTempPath() + "deep_v5.txt"
$o = [System.Collections.Generic.List[string]]::new()

function L($m) { $o.Add($m); Write-Host $m -ForegroundColor Yellow }

function TryDecrypt($idx) {
    try {
        $r = $kfMeth.Invoke($null, @([int]$idx))
        if ($r -ne $null) { $s = "$r".Trim(); if ($s.Length -gt 0) { return $s } }
    } catch {}
    return ""
}

# ---- Step 1: 解密 0-2000 ----
L("=== STEP 1: kfW0Lx5YBq(0..2000) ===")
$nc = 0
for ($i = 0; $i -le 2000; $i++) {
    $r = TryDecrypt($i)
    if ($r.Length -gt 0) {
        $d = $r; if ($d.Length -gt 500) { $d = $d.Substring(0,500)+"..." }
        L("  [$i] $d"); $nc++
    }
}
L("Total non-empty: $nc")

# ---- Step 2: opcode names ----
$LDC = @{0x16="ldc.i4.0";0x17="ldc.i4.1";0x18="ldc.i4.2";0x19="ldc.i4.3";0x1A="ldc.i4.4";0x1B="ldc.i4.5";0x1C="ldc.i4.6";0x1D="ldc.i4.7";0x1E="ldc.i4.8"}
function ON($p) {
    if ($LDC.ContainsKey($p)) { return $LDC[$p] }
    if ($p -eq 0x1F) { return "ldc.i4.s" }
    if ($p -eq 0x20) { return "ldc.i4" }
    if ($p -eq 0x28) { return "call" }
    if ($p -eq 0x72) { return "ldstr" }
    if ($p -eq 0x7C) { return "ldsfld" }
    if ($p -eq 0x7B) { return "ldfld" }
    if ($p -eq 0x87) { return "callvirt" }
    if ($p -eq 0x8B) { return "newobj" }
    if ($p -ge 0x0B -and $p -le 0x0E) { return "ldloc." + ($p-0x0B) }
    if ($p -eq 0x14) { return "ldloc.s" }
    if ($p -eq 0x73) { return "add" }
    if ($p -eq 0x74) { return "sub" }
    return ("0x{0:X2}" -f $p)
}

# ---- Step 3: 分析方法中的关键调用 ----
function ScanMethod($tname, $mname, $il, $body) {
    $mod = $asm.ManifestModule
    $hits = [System.Collections.Generic.List[string]]::new()
    for ($pos = 0; $pos -lt $il.Length; $pos++) {
        $op = $il[$pos]
        if ($op -ne 0x28 -and $op -ne 0x87) { continue }
        if ($pos + 4 -ge $il.Length) { continue }
        $tok = [BitConverter]::ToUInt32($il, $pos + 1)
        $cm = $null
        try { $cm = $mod.ResolveMethod($tok) } catch { continue }
        if ($cm -eq $null) { continue }
        $cn = $cm.Name
        $isKey = $false
        if ($cn -eq "kfW0Lx5YBq") { $isKey = $true }
        if ($cn -eq "ConnectAsync") { $isKey = $true }
        if ($cn -like "*Uri*") { $isKey = $true }
        if ($cn -like "*Url*") { $isKey = $true }
        if (-not $isKey) { continue }

        # 回溯参数来源
        $psrc = "?"; $pval = $null; $nstr = ""
        for ($bk = $pos - 1; $bk -ge [Math]::Max(0,$pos - 80); $bk--) {
            $bop = $il[$bk]
            if ($LDC.ContainsKey($bop)) {
                $v = $bop - 0x16; $psrc = "const_$v"; $pval = $v
            } elseif ($bop -eq 0x1F -and $bk+1 -lt $il.Length) {
                $v = [int]$il[$bk+1]; if ($v -gt 127) { $v -= 256 }; $psrc = "s_$v"; $pval = $v
            } elseif ($bop -eq 0x20 -and $bk+4 -lt $il.Length) {
                $v = [BitConverter]::ToInt32($il,$bk+1); $psrc = "i_$v"; $pval = $v
            } elseif ($bop -eq 0x72 -and $bk+4 -lt $il.Length) {
                $st = $null
                try { $st = $mod.ResolveString([BitConverter]::ToUInt32($il,$bk+1)) } catch {}
                if ($st -ne $null) { $sd = $st; if ($sd.Length -gt 100){$sd=$sd.Substring(0,100)}; $nstr = $sd }
            } elseif ($bop -eq 0x7C -and $bk+4 -lt $il.Length) {
                $ft = $null
                try { $ft = $mod.ResolveField([BitConverter]::ToUInt32($il,$bk+1)) } catch {}
                if ($ft -ne $null) { $psrc = "fld:$($ft.DeclaringType.Name).$(ft.Name)" }
            } elseif (($bop -ge 0x0B -and $bop -le 0x0E) -or $bop -eq 0x14) {
                if ($bop -ge 0x0B -and $bop -le 0x0E) { $li = $bop - 0x0B } else { $li = [int]$il[$bk+1] }
                $locs = $body.LocalVariables
                if ($locs -ne $null -and $li -lt $locs.Count) { $psrc = "loc[$li]:$($locs[$li].LocalType.Name)" }
            } elseif ($bop -eq 0x28 -or $bop -eq 0x87) {
                if ($bk+4 -lt $il.Length) {
                    $c2 = $null
                    try { $c2 = $mod.ResolveMethod([BitConverter]::ToUInt32($il,$bk+1)) } catch {}
                    if ($c2 -ne $null) { $psrc = "call:$($c2.DeclaringType.Name).$($c2.Name)" }
                }
            }
        }

        $dec = ""
        if ($cn -eq "kfW0Lx5YBq" -and $pval -ne $null) {
            $dec = TryDecrypt($pval)
            if ($dec.Length -gt 300) { $dec = $dec.Substring(0,300) }
        }
        $line = "    [$pos] $cn src=$psrc val=$pval"
        if ($dec.Length -gt 0) { $line += " DEC=`"$dec`"" }
        if ($nstr.Length -gt 0) { $line += " STR=`"$nstr`"" }
        $hits.Add($line)
    }
    return $hits
}

# ---- Step 4: 分析目标类型 ----
Write-Host "[2/6] Scanning key types..." -ForegroundColor Cyan
L("")
L("=== STEP 2: Key Type IL Analysis ===")
$tlist = @("HgCeApp.WSocketClientHelp","HgCeApp.HgClass","HgCeApp.Global","HgCeApp.Tool","HgCeApp.FormMain")

foreach ($tn in $tlist) {
    $tt = $asm.GetType($tn)
    if ($tt -eq $null) { L("  NOT FOUND: $tn"); continue }
    L("")
    L("--- $tn ---")
    foreach ($mm in $tt.GetMethods($bfa)) {
        $bdy = $mm.GetMethodBody()
        if ($bdy -eq $null) { continue }
        $ill = $bdy.GetILAsByteArray()
        if ($ill -eq $null -or $ill.Length -eq 0) { continue }
        $h = ScanMethod $tn $mm.Name $ill $bdy
        if ($h.Count -eq 0) { continue }
        L("  METHOD: $($mm.Name) (IL:$($ill.Length))")
        foreach ($hh in $h) { L($hh) }
    }
}

# ---- Step 5: Open 状态机完整dump ----
Write-Host "[3/6] Dumping Open state machine..." -ForegroundColor Cyan
L("")
L("=== STEP 3: Open State Machine Full Dump ===")
$ots = $asm.GetTypes() | Where-Object { $_.Name -like "*Open*b__*" -or $_.Name -like "*Open*d__*" }
foreach ($ot in $ots) {
    L("SM: $($ot.FullName)")
    foreach ($mm in $ot.GetMethods($bfa)) {
        if ($mm.Name -ne "MoveNext") { continue }
        $bdy = $mm.GetMethodBody()
        if ($bdy -eq $null) { continue }
        $ill = $bdy.GetILAsByteArray()
        if ($ill -eq $null) { continue }
        L("  MoveNext IL size: $($ill.Length)")
        $mod2 = $asm.ManifestModule

        # dump所有 ldstr 和 call/newobj
        for ($pp = 0; $pp -lt $ill.Length; $pp++) {
            $oop = $ill[$pp]
            if ($oop -eq 0x72 -and $pp+4 -lt $ill.Length) {
                $ss = $null
                try { $ss = $mod2.ResolveString([BitConverter]::ToUInt32($ill,$pp+1)) } catch {}
                if ($ss -ne $null) {
                    $dd = $ss; if ($dd.Length -gt 150) { $dd = $dd.Substring(0,150) }
                    L("    [$pp] ldstr => `"$dd`"")
                }
            }
            if (($oop -eq 0x28 -or $oop -eq 0x87 -or $oop -eq 0x8B) -and $pp+4 -lt $ill.Length) {
                $cc = $null
                try { $cc = $mod2.ResolveMethod([BitConverter]::ToUInt32($ill,$pp+1)) } catch {}
                if ($cc -ne $null) {
                    $pc = $cc.GetParameters().Count
                    $tag = ""
                    if ($cc.Name -eq "ConnectAsync") { $tag = " <<<CONNECT" }
                    if ($cc.Name -eq "kfW0Lx5YBq") { $tag = " <<<DECRYPT" }
                    L("    [$pp] $(ON $oop) => $($cc.DeclaringType.Name).$($cc.Name)($pc)$tag")
                }
            }
        }

        # 调用点分析
        $hh = ScanMethod $ot.Name "MoveNext" $ill $bdy
        foreach ($hhh in $hh) { L("  >> $hhh") }
    }
}

# ---- Step 6: 全局搜索 ConnectAsync ----
Write-Host "[4/6] Global search ConnectAsync..." -ForegroundColor Cyan
L("")
L("=== STEP 4: Global Search ConnectAsync/WebSocket/Uri ===")
foreach ($typ in $asm.GetTypes()) {
    foreach ($mm in $typ.GetMethods($bfa)) {
        $bdy = $mm.GetMethodBody()
        if ($bdy -eq $null) { continue }
        $ill = $bdy.GetILAsByteArray()
        if ($ill -eq $null) { continue }
        for ($pp = 0; $pp -lt $ill.Length; $pp++) {
            if ($ill[$pp] -ne 0x28 -and $ill[$pp] -ne 0x87) { continue }
            if ($pp + 4 -ge $ill.Length) { continue }
            $tok = [BitConverter]::ToUInt32($ill, $pp + 1)
            $cm = $null
            try { $cm = $asm.ManifestModule.ResolveMethod($tok) } catch { continue }
            if ($cm -eq $null) { continue }
            $hit = $false
            if ($cm.Name -eq "ConnectAsync") { $hit = $true }
            if ($cm.Name -like "*WebSocket*") { $hit = $true }
            if ($cm.Name -like "*Uri*") { $hit = $true }
            if (-not $hit) { continue }
            L("  $($typ.Name)::$($mm.Name) [$pp] => $($cm.DeclaringType.FullName).$($cm.Name)")

            $s0 = [Math]::Max(0,$pp-20); $e0 = [Math]::Min($ill.Length-5,$pp+20)
            for ($qq = $s0; $qq -le $e0; $qq++) {
                $qop = $ill[$qq]; $det = ON $qop
                if ($qop -eq 0x72 -and $qq+4 -lt $ill.Length) {
                    $ss2 = $null
                    try { $ss2 = $asm.ManifestModule.ResolveString([BitConverter]::ToUInt32($ill,$qq+1)) } catch {}
                    if ($ss2) { $sd2 = $ss2; if ($sd2.Length -gt 80){$sd2=$sd2.Substring(0,80)}; $det = "ldstr `"$sd2`"" }
                }
                if (($qop -eq 0x28 -or $qop -eq 0x87 -or $qop -eq 0x8B) -and $qq+4 -lt $ill.Length) {
                    $cc2 = $null
                    try { $cc2 = $asm.ManifestModule.ResolveMethod([BitConverter]::ToUInt32($ill,$qq+1)) } catch {}
                    if ($cc2) { $det = "$(ON $qop) $($cc2.DeclaringType.Name).$($cc2.Name)" }
                }
                $mk = if ($qq -eq $pp) { " <<<" } else { "" }
                L("    [$qq] $det$mk")
            }
        }
    }
}

# ---- Step 7: WSocketClientHelp 实例化 ----
Write-Host "[5/6] WSocketClientHelp instance analysis..." -ForegroundColor Cyan
L("")
L("=== STEP 5: WSocketClientHelp Instance ===")
$wst = $asm.GetType("HgCeApp.WSocketClientHelp")
if ($wst -ne $null) {
    L("FullName: $($wst.FullName) Base: $($wst.BaseType)")
    foreach ($ff in $wst.GetFields($bfa)) { L("  FLD: $($ff.FieldType.Name) $($ff.Name)") }
    foreach ($pp in $wst.GetProperties($bfa)) { L("  PROP: $($pp.PropertyType.Name) $($pp.Name)") }
    foreach ($mm in $wst.GetMethods($bfa)) {
        $pars = ($mm.GetParameters() | ForEach-Object { "$($_.ParameterType.Name)" }) -join ","
        L("  MET: $($mm.ReturnType.Name) $($mm.Name)($pars)")
    }
    try {
        $inst = [Activator]::CreateInstance($wst, $true)
        L("  Instance OK")
        foreach ($ff in $wst.GetFields($bfa)) {
            try {
                $fv = $ff.GetValue($inst)
                if ($fv -ne $null) {
                    $fs = "$fv"; if ($fs.Length -gt 200) { $fs = $fs.Substring(0,200) }
                    L("    .$($ff.Name) = $fs")
                } else { L("    .$($ff.Name) = null") }
            } catch { L("    .$($ff.Name) = ERR") }
        }
    } catch { L("  NewInstance FAIL: $($_.Exception.Message)") }
}

# ---- Step 8: Global 静态字段 ----
Write-Host "[6/6] Global static fields..." -ForegroundColor Cyan
L("")
L("=== STEP 6: Global Static Fields ===")
$gt = $asm.GetType("HgCeApp.Global")
if ($gt -ne $null) {
    $sfs = $gt.GetFields([System.Reflection.BindingFlags]::Public -bor [System.Reflection.BindingFlags]::NonPublic -bor [System.Reflection.BindingFlags]::Static)
    L("  Count: $($sfs.Count)")
    foreach ($ff in $sfs) {
        try {
            $fv = $ff.GetValue($null)
            $fs = if ($fv -ne $null) { "$fv" } else { "null" }
            if ($fs.Length -gt 150) { $fs = $fs.Substring(0,150) }
            L("    $($ff.FieldType.Name) $($ff.Name) = $fs")
        } catch { L("    $($ff.FieldType.Name) $($ff.Name) = err") }
    }
}

# ---- 写入文件 ----
$utf8 = [System.Text.UTF8Encoding]::new($true)
[System.IO.File]::WriteAllLines($outFile, $o, $utf8)
Write-Host "`nDONE! File: $outFile" -ForegroundColor Green
Write-Host "Lines: $($o.Count)" -ForegroundColor Green
