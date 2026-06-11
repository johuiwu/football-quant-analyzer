# HgCeApp.exe 深度逆向分析 v4 (稳健版)
# 目标: UTF-8正确编码 + 深度IL栈追踪 + 运行时分析

$ErrorActionPreference = "Stop"

$exePath = [System.IO.Path]::GetTempPath() + "HgCeApp.exe"
if (-not [System.IO.File]::Exists($exePath)) {
    $src = "d:\下载\黄瓜角球\黄瓜角球\HgCeApp.exe"
    if ([System.IO.File]::Exists($src)) {
        Copy-Item $src $exePath -Force
    } else {
        Write-Host "ERROR: exe not found"; exit 1
    }
}

Write-Host "Loading assembly..." -ForegroundColor Cyan
$assembly = [System.Reflection.Assembly]::LoadFrom($exePath)
$bf = [System.Reflection.BindingFlags]::Public -bor [System.Reflection.BindingFlags]::NonPublic -bor [System.Reflection.BindingFlags]::Static -bor [System.Reflection.BindingFlags]::DeclaredOnly
$bfAll = [System.Reflection.BindingFlags]::Public -bor [System.Reflection.BindingFlags]::NonPublic -bor [System.Reflection.BindingFlags]::Static -bor [System.Reflection.BindingFlags]::Instance -bor [System.Reflection.BindingFlags]::DeclaredOnly

$decryptorType = $assembly.GetType("mjldbepFpfgR2sirhk.Kusbq8F7xd8hvTfPmi")
$kfMethod = $decryptorType.GetMethod("kfW0Lx5YBq", $bf)

$outDir = [System.IO.Path]::GetTempPath()
$outFile = Join-Path $outDir "deep_v4.txt"

# 用 List[string] 收集输出
$lines = [System.Collections.Generic.List[string]]::new()

function AddLine($msg) {
    $lines.Add($msg)
    Write-Host $msg -ForegroundColor Yellow
}

function SafeDecrypt($idx) {
    try {
        $r = $kfMethod.Invoke($null, @([int]$idx))
        if ($r -ne $null -and "$r".Trim().Length -gt 0) { return "$r" }
    } catch {}
    return ""
}

# ========== Step 1: 大范围解密 (0-2000) ==========
AddLine("========== STEP 1: kfW0Lx5YBq Decryption (0-2000) ==========")
AddLine("Decryptor: $($decryptorType.FullName)::$($kfMethod.Name)")
$neCount = 0
for ($idx = 0; $idx -le 2000; $idx++) {
    $r = SafeDecrypt($idx)
    if ($r.Length -gt 0) {
        $disp = $r
        if ($disp.Length -gt 500) { $disp = $disp.Substring(0, 500) + "..." }
        AddLine("  [$idx] $disp")
        $neCount++
    }
}
AddLine("Total non-empty: $neCount")

# ========== Step 2: IL 指令名称映射 ==========
$opNames = @{
    0x00="nop"; 0x02="ldarg.0"; 0x03="ldarg.1"; 0x04="ldarg.2"; 0x05="ldarg.3"
    0x06="ldarg"; 0x07="ldarga"; 0x08="starg"; 0x09="ldarg.s"; 0x0A="starg.s"
    0x0B="ldloc.0"; 0x0C="ldloc.1"; 0x0D="ldloc.2"; 0x0E="ldloc.3"
    0x0F="stloc.0"; 0x10="stloc.1"; 0x11="stloc.2"; 0x12="stloc.3"
    0x13="ldloca.s"; 0x14="ldloc.s"; 0x15="stloc.s"
    0x16="ldc.i4.0"; 0x17="ldc.i4.1"; 0x18="ldc.i4.2"; 0x19="ldc.i4.3"
    0x1A="ldc.i4.4"; 0x1B="ldc.i4.5"; 0x1C="ldc.i4.6"; 0x1D="ldc.i4.7"; 0x1E="ldc.i4.8"
    0x1F="ldc.i4.s"; 0x20="ldc.i4"; 0x21="ldc.i8"; 0x22="ldc.r4"; 0x23="ldc.r8"
    0x25="dup"; 0x26="pop"; 0x27="jmp"; 0x28="call"; 0x29="calli"; 0x2A="ret"
    0x2B="br.s"; 0x2C="brfalse.s"; 0x2D="brtrue.s"; 0x2E="beq.s"; 0x2F="bge.s"
    0x30="bgt.s"; 0x31="ble.s"; 0x32="blt.s"; 0x33="bne.un.s"; 0x34="bge.un.s"
    0x38="br"; 0x39="brfalse"; 0x3A="brtrue"; 0x3B="beq"; 0x3C="bge"; 0x3D="bgt"
    0x6F="ldtoken"; 0x70="conv.i"; 0x71="conv.ovf.i"; 0x72="conv.ovf.u"
    0x73="add"; 0x74="sub"; 0x75="mul"; 0x76="div"; 0x77="rem"
    0x78="and"; 0x79="or"; 0x7A="xor"; 0x7B="shl"; 0x7C="shr"; 0x7D="neg"; 0x7E="not"
    0x7F="conv.i1"; 0x80="conv.i2"; 0x81="conv.i4"; 0x82="conv.i8"; 0x83="conv.r4"
    0x84="conv.r8"; 0x85="conv.u4"; 0x86="conv.u8"; 0x87="callvirt"; 0x8B="newobj"
    0x8C="castclass"; 0x8D="isinst"; 0x8E="conv.r.un"
}

function OpName($op) {
    if ($opNames.ContainsKey($op)) { return $opNames[$op] }
    if ($op -eq 0x72) { return "ldstr" }
    if ($op -eq 0x7B) { return "ldfld" }
    if ($op -eq 0x7C) { return "ldsfld" }
    if ($op -eq 0x7D) { return "stsfld" }
    if ($op -eq 0x7E) { return "ldflda" }
    if ($op -eq 0x7F) { return "ldsflda" }
    if ($op -eq 0x80) { return "stfld" }
    return ("0x{0:X2}" -f $op)
}

# ========== Step 3: 深度IL分析函数 ==========
function DeepAnalyzeMethod($typeName, $methodName, $il, $body, $methodInfo) {
    $mod = $assembly.ManifestModule
    $results = [System.Collections.Generic.List[PSObject]]::new()

    for ($i = 0; $i -lt $il.Length; $i++) {
        # 只关注 call (0x28) 和 callvirt (0x87)
        if ($il[$i] -ne 0x28 -and $il[$i] -ne 0x87) { continue }
        if ($i + 4 -ge $il.Length) { continue }

        $token = [BitConverter]::ToUInt32($il, $i + 1)
        $calledM = $null
        try { $calledM = $mod.ResolveMethod($token) } catch { continue }
        if ($calledM -eq $null) { continue }

        $cname = $calledM.Name

        # 只关注关键调用
        $isKf = ($cname -eq "kfW0Lx5YBq")
        $isConnect = ($cname -eq "ConnectAsync")
        $isUri = ($cname -like "*Uri*" -or $cname -like "*Url*")
        $isWs = ($cname -like "*WebSocket*" -or $cname -like "*Socket*" -or $cname -like "*Open*")
        $isNewObj = ($il[$i] -eq 0x8B)

        if (-not ($isKf -or $isConnect -or $isUri -or $isWs -or $isNewObj)) { continue }

        # 向前回溯最多60条指令，构建参数来源链
        $paramSrc = "UNKNOWN"
        $paramVal = $null
        $nearbyStrings = [System.Collections.Generic.List[string]]::new()
        $stackItems = [System.Collections.Generic.List[string]]::new()

        for ($j = ($i - 1); $j -ge [Math]::Max(0, $i - 80); $j--) {
            $op = $il[$j]
            $oname = OpName($op)

            # ldc.i4 常量
            if ($op -ge 0x16 -and $op -le 0x1E) {
                $v = $op - 0x16
                $stackItems.Insert(0, "const:$v")
                if ($isKf) { $paramVal = $v; $paramSrc = "const_$v" }
            }
            elseif ($op -eq 0x1F -and $j + 1 -lt $il.Length) {
                $sv = [int]$il[$j + 1]
                if ($sv -gt 127) { $sv = $sv - 256 }
                $stackItems.Insert(0, "const_s:$sv")
                if ($isKf) { $paramVal = $sv; $paramSrc = "const_s_$sv" }
            }
            elseif ($op -eq 0x20 -and $j + 4 -lt $il.Length) {
                $iv = [BitConverter]::ToInt32($il, $j + 1)
                $stackItems.Insert(0, "const_i:$iv")
                if ($isKf) { $paramVal = $iv; $paramSrc = "const_i_$iv" }
            }
            # ldstr 字符串
            elseif ($op -eq 0x72 -and $j + 4 -lt $il.Length) {
                $stok = [BitConverter]::ToUInt32($il, $j + 1)
                $sv = $null
                try { $sv = $mod.ResolveString($stok) } catch {}
                if ($sv -ne $null) {
                    $sd = $sv
                    if ($sd.Length -gt 100) { $sd = $sd.Substring(0, 100) }
                    $nearbyStrings.Add($sd)
                    $stackItems.Insert(0, "str:`"$sd`"")
                }
            }
            # ldsfld 静态字段
            elseif ($op -eq 0x7C -and $j + 4 -lt $il.Length) {
                $ftok = [BitConverter]::ToUInt32($il, $j + 1)
                $fld = $null
                try { $fld = $mod.ResolveField($ftok) } catch {}
                if ($fld -ne $null) {
                    $fn = "$($fld.DeclaringType.Name).$($fld.Name)"
                    $ftn = $fld.FieldType.Name
                    $stackItems.Insert(0, "sfld:$fn($ftn)")
                    if ($isKf -and $ftn -match "Int") { $paramSrc = "static_field:$fn" }
                }
            }
            # ldfld 实例字段
            elseif ($op -eq 0x7B -and $j + 4 -lt $il.Length) {
                $ftok = [BitConverter]::ToUInt32($il, $j + 1)
                $fld = $null
                try { $fld = $mod.ResolveField($ftok) } catch {}
                if ($fld -ne $null) {
                    $fn = "$($fld.DeclaringType.Name).$($fld.Name)"
                    $stackItems.Insert(0, "ifld:$fn")
                }
            }
            # ldloc 局部变量
            elseif (($op -ge 0x0B -and $op -le 0x0E) -or $op -eq 0x14) {
                if ($op -ge 0x0B -and $op -le 0x0E) {
                    $li = $op - 0x0B
                } else {
                    $li = [int]$il[$j + 1]
                }
                $locals = $body.LocalVariables
                if ($locals -ne $null -and $li -lt $locals.Count) {
                    $lt = $locals[$li].LocalType.Name
                    $stackItems.Insert(0, "local[$li]:$lt")
                    if ($isKf -and $lt -match "Int") { $paramSrc = "local_var:$li" }
                }
            }
            # call / callvirt 方法调用（可能是参数来源）
            elseif ($op -eq 0x28 -or $op -eq 0x87) {
                if ($j + 4 -lt $il.Length) {
                    $ctk = [BitConverter]::ToUInt32($il, $j + 1)
                    $cm2 = $null
                    try { $cm2 = $mod.ResolveMethod($ctk) } catch {}
                    if ($cm2 -ne $null) {
                        $cn2 = "$($cm2.DeclaringType.Name)::$($cm2.Name)"
                        $stackItems.Insert(0, "call:$cn2")
                        if ($isKf -and $cm2.ReturnType.Name -match "Int") { $paramSrc = "method_return:$cn2" }
                    }
                }
            }
            # 算术运算
            elseif ($op -ge 0x73 -and $op -le 0x7D) {
                $stackItems.Insert(0, $(OpName $op))
                if ($isKf -and $paramSrc -eq "UNKNOWN") { $paramSrc = "arithmetic" }
            }
        }

        # 解密
        $decStr = ""
        if ($isKf -and $paramVal -ne $null) {
            $decStr = SafeDecrypt($paramVal)
            if ($decStr.Length -gt 300) { $decStr = $decStr.Substring(0, 300) }
        }

        $result = "" | Select-Object Offset, CallName, ParamSource, ParamValue, Decrypted, Strings, StackTop5
        $result.Offset = $i
        $result.CallName = $cname
        $result.ParamSource = $paramSrc
        $result.ParamValue = $paramVal
        $result.Decrypted = $decStr
        $result.Strings = $nearbyStrings -join " | "
        $top5 = $stackItems[-5..-1]
        if ($top5) { $result.StackTop5 = $top5 -join " <- " } else { $result.StackTop5 = "" }
        $results.Add($result)
    }
    return $results
}

# ========== 分析目标类型 ==========
AddLine("")
AddLine("========== STEP 2: Deep IL Analysis of Key Types ==========")

$targets = @(
    @{Type="HgCeApp.WSocketClientHelp"; Methods="*"},
    @{Type="HgCeApp.HgClass"; Methods="*"},
    @{Type="HgCeApp.Global"; Methods="*"},
    @{Type="HgCeApp.Tool"; Methods="*"},
    @{Type="HgCeApp.FormMain"; Methods="*"}
)

foreach ($t in $targets) {
    $tn = $t.Type
    $typ = $assembly.GetType($tn)
    if ($typ -eq $null) { AddLine("  Type NOT FOUND: $tn"); continue }

    AddLine("")
    AddLine("--- $tn ---")

    foreach ($m in $typ.GetMethods($bfAll)) {
        if ($t.Methods -ne "*" -and $m.Name -ne $t.Methods) { continue }
        $body = $m.GetMethodBody()
        if ($body -eq $null) { continue }
        $il = $body.GetILAsByteArray()
        if ($il -eq $null -or $il.Length -eq 0) { continue }

        $calls = DeepAnalyzeMethod $tn $m.Name $il $body $m
        if ($calls.Count -eq 0) { continue }

        AddLine("  METHOD: $($m.Name) (IL: $($il.Length) bytes)")
        foreach ($c in $calls) {
            AddLine("    [@offset $($c.Offset)] $($c.CallName)")
            AddLine("      src=$($c.ParamSource) val=$($c.ParamValue)")
            if ($c.Decrypted.Length -gt 0) { AddLine("      DEC=> `"$($c.Decrypted)`"" }
            if ($c.Strings.Length -gt 0) { AddLine("      STR=> $($c.Strings)" }
            if ($c.StackTop5.Length -gt 0) { AddLine("      STK=> $($c.StackTop5)" }
        }
    }
}

# ========== Open 状态机详细分析 ==========
AddLine("")
AddLine("========== STEP 3: Open State Machine Full Dump ==========")
$openTypes = $assembly.GetTypes() | Where-Object { $_.Name -like "*Open*b__*" -or $_.Name -like "*Open*d__*" }
foreach ($ot in $openTypes) {
    AddLine("StateMachine: $($ot.FullName)")

    foreach ($m in $ot.GetMethods($bfAll)) {
        if ($m.Name -ne "MoveNext") { continue }
        $body = $m.GetMethodBody()
        if ($body -eq $null) { continue }
        $il = $body.GetILAsByteArray()
        if ($il -eq $null) { continue }

        AddLine("  MoveNext IL size: $($il.Length)")
        $mod = $assembly.ManifestModule

        # 完整dump所有 ldstr 和 call/callvirt/newobj
        for ($i = 0; $i -lt $il.Length; $i++) {
            $op = $il[$i]

            # ldstr
            if ($op -eq 0x72 -and $i + 4 -lt $il.Length) {
                $st = $null
                try { $st = $mod.ResolveString([BitConverter]::ToUInt32($il,$i+1)) } catch {}
                if ($st -ne $null) {
                    $d = $st
                    if ($d.Length -gt 150) { $d = $d.Substring(0,150) }
                    AddLine("    [$i] ldstr => `"$d`"")
                }
            }

            # call / callvirt / newobj
            if (($op -eq 0x28 -or $op -eq 0x87 -or $op -eq 0x8B) -and $i + 4 -lt $il.Length) {
                $ct = $null
                try { $ct = $mod.ResolveMethod([BitConverter]::ToUInt32($il,$i+1)) } catch {}
                if ($ct -ne $null) {
                    $pcount = $ct.GetParameters().Count
                    $tag = ""
                    if ($ct.Name -eq "ConnectAsync") { $tag = " *** CONNECT ***" }
                    if ($ct.Name -eq "kfW0Lx5YBq") { $tag = " *** DECRYPT ***" }
                    if ($ct.Name -like "*Uri*" -or $ct.Name -like "*Url*") { $tag = " *** URL ***" }
                    AddLine("    [$i] $(OpName $op) => $($ct.DeclaringType.Name)::$($ct.Name)($pcount)$tag")
                }
            }
        }

        # 调用点深度分析
        $calls = DeepAnalyzeMethod $ot.Name "MoveNext" $il $body $m
        foreach ($c in $calls) {
            AddLine("  >> [$($c.Offset)] $($c.CallName): src=$($c.ParamSource) val=$($c.ParamValue)")
            if ($c.Decrypted.Length -gt 0) { AddLine("     DEC: `"$($c.Decrypted)`"" }
            if ($c.Strings.Length -gt 0) { AddLine("     STR: $($c.Strings)" }
            if ($c.StackTop5.Length -gt 0) { AddLine("     STK: $($c.StackTop5)" }
        }
    }
}

# ========== 全局搜索 ConnectAsync ==========
AddLine("")
AddLine("========== STEP 4: Global Search All ConnectAsync/WebSocket/Uri ==========")
foreach ($typ in $assembly.GetTypes()) {
    foreach ($m in $typ.GetMethods($bfAll)) {
        $body = $m.GetMethodBody()
        if ($body -eq $null) { continue }
        $il = $body.GetILAsByteArray()
        if ($il -eq $null) { continue }

        for ($i = 0; $i -lt $il.Length; $i++) {
            if ($il[$i] -ne 0x28 -and $il[$i] -ne 0x87) { continue }
            if ($i + 4 -ge $il.Length) { continue }
            $tok = [BitConverter]::ToUInt32($il, $i + 1)
            $cm = $null
            try { $cm = $assembly.ManifestModule.ResolveMethod($tok) } catch { continue }
            if ($cm -eq $null) { continue }

            $hit = $false
            if ($cm.Name -eq "ConnectAsync") { $hit = $true }
            if ($cm.Name -like "*WebSocket*") { $hit = $true }
            if ($cm.Name -like "*Socket*" -and $cm.DeclaringType.Name -notlike "*Memory*") { $hit = $true }
            if ($cm.Name -like "*Uri*" -or $cm.Name -like "*Url*") { $hit = $true }

            if ($hit) {
                AddLine("  $($typ.Name)::$($m.Name) [$i] => $($cm.DeclaringType.FullName)::$($cm.Name)")

                # dump 周围30条指令
                $start = [Math]::Max(0, $i - 25)
                $end = [Math]::Min($il.Length - 5, $i + 25)
                for ($jj = $start; $jj -le $end; $jj++) {
                    $op2 = $il[$jj]
                    $detail = OpName $op2
                    if ($op2 -eq 0x72 -and $jj+4 -lt $il.Length) {
                        $ss = $null
                        try { $ss = $assembly.ManifestModule.ResolveString([BitConverter]::ToUInt32($il,$jj+1)) } catch {}
                        if ($ss) {
                            $sdisp = $ss
                            if ($sdisp.Length -gt 80) { $sdisp = $sdisp.Substring(0,80) }
                            $detail = "ldstr `"$sdisp`""
                        }
                    }
                    if (($op2 -eq 0x28 -or $op2 -eq 0x87 -or $op2 -eq 0x8B) -and $jj+4 -lt $il.Length) {
                        $ccm = $null
                        try { $ccm = $assembly.ManifestModule.ResolveMethod([BitConverter]::ToUInt32($il,$jj+1)) } catch {}
                        if ($ccm) { $detail = "$(OpName $op2) $($ccm.DeclaringType.Name)::$($ccm.Name)" }
                    }
                    $marker = if ($jj -eq $i) { " <<<" } else { "" }
                    AddLine("    [$jj] $detail$marker")
                }
            }
        }
    }
}

# ========== WSocketClientHelp 实例化分析 ==========
AddLine("")
AddLine("========== STEP 5: WSocketClientHelp Runtime Instance ==========")
$wsType = $assembly.GetType("HgCeApp.WSocketClientHelp")
if ($wsType -ne $null) {
    AddLine("FullName: $($wsType.FullName)")
    AddLine("BaseType: $($wsType.BaseType)")

    AddLine("  Fields:")
    foreach ($f in $wsType.GetFields($bfAll)) {
        AddLine("    $($f.Attributes) $($f.FieldType.Name) $($f.Name)")
    }

    AddLine("  Properties:")
    foreach ($p in $wsType.GetProperties($bfAll)) {
        AddLine("    $($p.PropertyType.Name) $($p.Name)")
    }

    AddLine("  Methods:")
    foreach ($m in $wsType.GetMethods($bfAll)) {
        $pars = ($m.GetParameters() | ForEach-Object { "$($_.ParameterType.Name) $($_.Name)" }) -join ", "
        AddLine("    $($m.ReturnType.Name) $($m.Name)($pars)")
    }

    try {
        $inst = [Activator]::CreateInstance($wsType, $true)
        AddLine("  Instance created OK")

        foreach ($f in $wsType.GetFields($bfAll)) {
            try {
                $fv = $f.GetValue($inst)
                if ($fv -ne $null) {
                    $fs = "$fv"
                    if ($fs.Length -gt 200) { $fs = $fs.Substring(0,200) }
                    AddLine("    .$($f.Name) = $fs")
                } else {
                    AddLine("    .$($f.Name) = null")
                }
            } catch {
                AddLine("    .$($f.Name) = ERROR")
            }
        }
    } catch {
        AddLine("  Instantiation FAILED: $($_.Exception.Message)")
    }
}

# ========== Global 静态字段 ==========
AddLine("")
AddLine("========== STEP 6: Global Static Fields ==========")
$gt = $assembly.GetType("HgCeApp.Global")
if ($gt -ne $null) {
    $sf = $gt.GetFields([System.Reflection.BindingFlags]::Public -bor [System.Reflection.BindingFlags]::NonPublic -bor [System.Reflection.BindingFlags]::Static)
    AddLine("  Static fields: $($sf.Count)")
    foreach ($f in $sf) {
        try {
            $fv = $f.GetValue($null)
            $fs = if ($fv -ne $null) { "$fv" } else { "null" }
            if ($fs.Length -gt 150) { $fs = $fs.Substring(0,150) }
            AddLine("    $($f.FieldType.Name) $($f.Name) = $fs")
        } catch {
            AddLine("    $($f.FieldType.Name) $($f.Name) = (err)")
        }
    }
}

# ========== HgClass 关键方法 ==========
AddLine("")
AddLine("========== STEP 7: HgClass Key Methods ==========")
$hct = $assembly.GetType("HgCeApp.HgClass")
if ($hct -ne $null) {
    foreach ($m in $hct.GetMethods($bfAll)) {
        $mn = $m.Name
        if ($mn -like "*Live*" -or $mn -like "*Data*" -or $mn -like "*Socket*" -or $mn -like "*Connect*" -or $mn -like "*Open*" -or $mn -like "*Url*" -or $mn -like "*Ws*" -or $mn -like "*Transform*") {
            $pars = ($m.GetParameters() | ForEach-Object { "$($_.ParameterType.Name)" }) -join ","
            AddLine("  $($m.ReturnType.Name) $mn($pars)")
            
            $bod = $m.GetMethodBody()
            if ($bod -ne $null) {
                $ill = $bod.GetILAsByteArray()
                if ($ill -ne $null) {
                    $calls = DeepAnalyzeMethod "HgCeApp.HgClass" $mn $ill $bod $m
                    foreach ($c in $calls) {
                        AddLine("    [$($c.Offset)] $($c.CallName): src=$($c.ParamSource) val=$($c.ParamValue) dec=`"$($c.Decrypted)`"")
                    }
                }
            }
        }
    }
}

# ========== URL模式搜索 ==========
AddLine("")
AddLine("========== STEP 8: URL/String Pattern Search ==========")
$kws = @("http", "transform", "socket", "connect", "wss://", "ws://")
foreach ($typ in $assembly.GetTypes()) {
    foreach ($m in $typ.GetMethods($bfAll)) {
        $body = $m.GetMethodBody()
        if ($body -eq $null) { continue }
        $il = $body.GetILAsByteArray()
        if ($il -eq $null) { continue }

        $foundAny = $false
        $fstrs = [System.Collections.Generic.List[string]]::new()
        $mod = $assembly.ManifestModule

        for ($ii = 0; $ii -lt $il.Length; $ii++) {
            if ($il[$ii] -ne 0x72) { continue }
            if ($ii + 4 -ge $il.Length) { continue }
            $stok = [BitConverter]::ToUInt32($il, $ii + 1)
            $sv = $null
            try { $sv = $mod.ResolveString($stok) } catch {}
            if ($sv -ne $null) {
                $svl = $sv.ToLower()
                foreach ($kw in $kws) {
                    if ($svl.Contains($kw)) {
                        $foundAny = $true
                        $dd = $sv
                        if ($dd.Length -gt 150) { $dd = $dd.Substring(0,150) }
                        $fstrs.Add($dd)
                        break
                    }
                }
            }
        }

        if ($foundAny) {
            AddLine("  $($typ.Name)::$($m.Name)")
            foreach ($fs in $fstrs) {
                AddLine("    ldstr: `"$fs`"")
            }
        }
    }
}

# ========== 写入文件 (UTF-8 BOM) ==========
$utf8 = [System.Text.UTF8Encoding]::new($true)
[System.IO.File]::WriteAllLines($outFile, $lines, $utf8)
Write-Host "`nDone! Output: $outFile" -ForegroundColor Green
Write-Host "Lines: $($lines.Count), Size: $([math]::Round((Join-String -Separator "`n" -InputObject $lines).Length / 1024, 1)) KB" -ForegroundColor Green
