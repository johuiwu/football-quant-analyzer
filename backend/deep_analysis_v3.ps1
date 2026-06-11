# HgCeApp.exe 深度逆向分析 v3
# 目标: 修复编码 + 深度IL栈追踪 + 运行时Hook拦截WebSocket URL
# ============================================================

$ErrorActionPreference = "Stop"
$exePath = [System.IO.Path]::GetTempPath() + "HgCeApp.exe"

if (-not [System.IO.File]::Exists($exePath)) {
    Write-Host "ERROR: $exePath not found!" -ForegroundColor Red
    # 尝试从源路径复制
    $src = "d:\下载\黄瓜角球\黄瓜角球\HgCeApp.exe"
    if ([System.IO.File]::Exists($src)) {
        Copy-Item $src $exePath -Force
        Write-Host "Copied from source." -ForegroundColor Green
    } else {
        exit 1
    }
}

Write-Host "Loading assembly..." -ForegroundColor Cyan
$assembly = [System.Reflection.Assembly]::LoadFrom($exePath)
$bf = [System.Reflection.BindingFlags]::Public -bor [System.Reflection.BindingFlags]::NonPublic -bor [System.Reflection.BindingFlags]::Static -bor [System.Reflection.BindingFlags]::DeclaredOnly
$bfAll = [System.Reflection.BindingFlags]::Public -bor [System.Reflection.BindingFlags]::NonPublic -bor [System.Reflection.BindingFlags]::Static -bor [System.Reflection.BindingFlags]::Instance -bor [System.Reflection.BindingFlags]::DeclaredOnly

# 定位解密器
$decryptorType = $assembly.GetType("mjldbepFpfgR2sirhk.Kusbq8F7xd8hvTfPmi")
$kfMethod = $decryptorType.GetMethod("kfW0Lx5YBq", $bf)

# 输出文件 - 使用 UTF-8 NO BOM 但通过 .NET 原生写入
$outDir = [System.IO.Path]::GetTempPath()
$outFile = Join-Path $outDir "deep_analysis_v3.txt"

# 使用 MemoryStream 收集输出，最后一次性写二进制
$ms = [System.IO.MemoryStream]::new()
$sw = [System.IO.StreamWriter]::new($ms, [System.Text.UTF8Encoding]::new($true))

function Out-Log($msg) {
    [void]$sw.WriteLine($msg)
    Write-Host $msg -ForegroundColor Yellow
}

# ========== Step 1: 大范围解密，正确编码输出 ==========
Out-Log "`n========== STEP 1: kfW0Lx5YBq Full Decryption (0-2000) =========="
Out-Log "Decryptor: $($decryptorType.FullName)::$($kfMethod.Name)"
$decryptedResults = @{}
$nonEmptyCount = 0

for ($idx = 0; $idx -le 2000; $idx++) {
    try {
        $r = $kfMethod.Invoke($null, @([int]$idx))
        if ($r -ne $null -and "$r".Trim().Length -gt 0) {
            $strVal = "$r"
            if ($strVal.Length -gt 500) { $strVal = $strVal.Substring(0, 500) + "..." }
            $decryptedResults[$idx] = $strVal
            Out-Log "  [$idx] $strVal"
            $nonEmptyCount++
        }
    } catch {
        # 忽略异常
    }
}
Out-Log "Total non-empty results: $nonEmptyCount"

# ========== Step 2: 深度IL分析 - 完整栈追踪 ==========
Out-Log "`n========== STEP 2: Deep IL Stack Trace for kfW0Lx5YBq Calls =========="

function GetOpcodeName($opByte) {
    switch ($opByte) {
        0x00 { return "nop" }
        0x02 { return "ldarg.0" }
        0x03 { return "ldarg.1" }
        0x04 { return "ldarg.2" }
        0x05 { return "ldarg.3" }
        0x06 { return "ldarg" }
        0x07 { return "ldarga" }
        0x08 { return "starg" }
        0x09 { return "ldarg.s" }
        0x0A { return "starg.s" }
        0x0B { return "ldloc.0" }
        0x0C { return "ldloc.1" }
        0x0D { return "ldloc.2" }
        0x0E { return "ldloc.3" }
        0x0F { return "stloc.0" }
        0x10 { return "stloc.1" }
        0x11 { return "stloc.2" }
        0x12 { return "stloc.3" }
        0x13 { return "ldloca.s" }
        0x14 { return "ldloc.s" }
        0x15 { return "stloc.s" }
        0x16 { return "ldc.i4.0" }
        0x17 { return "ldc.i4.1" }
        0x18 { return "ldc.i4.2" }
        0x19 { return "ldc.i4.3" }
        0x1A { return "ldc.i4.4" }
        0x1B { return "ldc.i4.5" }
        0x1C { return "ldc.i4.6" }
        0x1D { return "ldc.i4.7" }
        0x1E { return "ldc.i4.8" }
        0x1F { return "ldc.i4.s" }
        0x20 { return "ldc.i4" }
        0x21 { return "ldc.i8" }
        0x22 { return "ldc.r4" }
        0x23 { return "ldc.r8" }
        0x25 { return "dup" }
        0x26 { return "pop" }
        0x27 { return "jmp" }
        0x28 { return "call" }
        0x29 { return "calli" }
        0x2A { return "ret" }
        0x2B { return "br.s" }
        0x2C { return "brfalse.s" }
        0x2D { return "brtrue.s" }
        0x2E { return "beq.s" }
        0x2F { return "bge.s" }
        0x30 { return "bgt.s" }
        0x31 { return "ble.s" }
        0x32 { return "blt.s" }
        0x33 { return "bne.un.s" }
        0x34 { return "bge.un.s" }
        0x35 { return "bgt.un.s" }
        0x36 { return "ble.un.s" }
        0x37 { return "blt.un.s" }
        0x38 { return "br" }
        0x39 { return "brfalse" }
        0x3A { return "brtrue" }
        0x3B { return "beq" }
        0x3C { return "bge" }
        0x3D { return "bgt" }
        0x3E { return "ble" }
        0x3F { return "blt" }
        0x40 { return "bne.un" }
        0x41 { return "bge.un" }
        0x42 { return "bgt.un" }
        0x43 { return "ble.un" }
        0x44 { return "blt.un" }
        0x6F { return "ldtoken" }
        0x70 { return "conv.i" }
        0x71 { return "conv.ovf.i" }
        0x72 { return "conv.ovf.u" }
        0x73 { return "add" }
        0x74 { return "sub" }
        0x75 { return "mul" }
        0x76 { return "div" }
        0x77 { return "rem" }
        0x78 { return "and" }
        0x79 { return "or" }
        0x7A { return "xor" }
        0x7B { return "shl" }
        0x7C { return "shr" }
        0x7D { return "neg" }
        0x7E { return "not" }
        0x7F { return "conv.i1" }
        0x80 { return "conv.i2" }
        0x81 { return "conv.i4" }
        0x82 { return "conv.i8" }
        0x83 { return "conv.r4" }
        0x84 { return "conv.r8" }
        0x85 { return "conv.u4" }
        0x86 { return "conv.u8" }
        0x87 { return "callvirt" }
        0x8B { return "newobj" }
        0x8C { return "castclass" }
        0x8D { return "isinst" }
        0x8E { return "conv.r.un" }
        0x94 { return "ldarg.0" }  # extended
        0x02 { return "ldarg.0" }
        default {
            if ($opByte -eq 0x72) { return "ldstr" }
            if ($opByte -eq 0x7B) { return "ldfld" }
            if ($opByte -eq 0x7C) { return "ldsfld" }
            if ($opByte -eq 0x7D) { return "stsfld" }
            if ($opByte -eq 0x7E) { return "ldflda" }
            if ($opByte -eq 0x7F) { return "ldsflda" }
            if ($opByte -eq 0x80) { return "stfld" }
            if ($opByte -eq 0xFE) { return "prefix" }
            return sprintf("0x%02X", $opByte)
        }
    }
}

function AnalyzeCallSite($typeName, $methodName, $il, $body, $methodInfo) {
    $results = @()
    $mod = $assembly.ManifestModule
    
    for ($i = 0; $i -lt $il.Length; $i++) {
        # 查找 call 指令 (0x28)
        if ($il[$i] -ne 0x28) { continue }
        if ($i + 4 -ge $il.Length) { continue }
        
        $token = [BitConverter]::ToUInt32($il, $i + 1)
        $calledMethod = $null
        try { $calledMethod = $mod.ResolveMethod($token) } catch { continue }
        
        if ($calledMethod -eq $null) { continue }
        
        # 只关注 kfW0Lx5YBq 和 ConnectAsync 调用
        if ($calledMethod.Name -ne "kfW0Lx5YBq" -and $calledMethod.Name -ne "ConnectAsync") { continue }
        
        $callName = $calledMethod.Name
        
        # 向前回溯最多50条指令，构建栈状态
        $stackTrace = @()
        $paramSource = "UNKNOWN"
        $paramValue = $null
        $stringParts = @()  # 用于 String.Concat 追踪
        
        # 简化版栈模拟：只追踪 Int32 参数来源
        for ($j = ($i - 1); $j -ge [Math]::Max(0, $i - 80); $j--) {
            $op = $il[$j]
            $opName = GetOpcodeName $op
            
            if ($op -eq 0x28 -or $op -eq 0x87) {
                # 另一个 call/callvirt - 可能是参数来源方法
                if ($j + 4 -lt $il.Length) {
                    $tk2 = [BitConverter]::ToUInt32($il, $j + 1)
                    $m2 = $null
                    try { $m2 = $mod.ResolveMethod($tk2) } catch {}
                    if ($m2 -ne $null) {
                        $stackTrace += "  [$j] $opName => $($m2.DeclaringType.Name)::$($m2.Name)()"
                    }
                }
            }
            elseif ($op -ge 0x16 -and $op -le 0x1E) {
                # ldc.i4.0 ~ ldc.i4.8
                $val = $op - 0x16
                $stackTrace += "  [$j] $opName => int=$val"
                if ($callName -eq "kfW0Lx5YBq") { $paramValue = $val; $paramSource = "const_$val" }
            }
            elseif ($op -eq 0x1F) {
                # ldc.i4.s
                if ($j + 1 -lt $il.Length) {
                    $sVal = [int]$il[$j + 1]
                    if ($sVal -gt 127) { $sVal = $sVal - 256 }
                    $stackTrace += "  [$j] $opName => int=$sVal"
                    if ($callName -eq "kfW0Lx5YBq") { $paramValue = $sVal; $paramSource = "const_s_$sVal" }
                }
            }
            elseif ($op -eq 0x20) {
                # ldc.i4
                if ($j + 4 -lt $il.Length) {
                    $iVal = [BitConverter]::ToInt32($il, $j + 1)
                    $stackTrace += "  [$j] $opName => int=$iVal"
                    if ($callName -eq "kfW0Lx5YBq") { $paramValue = $iVal; $paramSource = "const_i_$iVal" }
                }
            }
            elseif ($op -eq 0x72) {
                # ldstr
                if ($j + 4 -lt $il.Length) {
                    $strToken = [BitConverter]::ToUInt32($il, $j + 1)
                    $strVal = $null
                    try { $strVal = $mod.ResolveString($strToken) } catch {}
                    $disp = if ($strVal) { $strVal } else { "(token:$strToken)" }
                    if ($disp.Length -gt 80) { $disp = $disp.Substring(0, 80) }
                    $stackTrace += "  [$j] ldstr => `"$disp`""
                    $stringParts += $disp
                }
            }
            elseif ($op -eq 0x7C) {
                # ldsfld
                if ($j + 4 -lt $il.Length) {
                    $fldToken = [BitConverter]::ToUInt32($il, $j + 1)
                    $fld = $null
                    try { $fld = $mod.ResolveField($fldToken) } catch {}
                    if ($fld -ne $null) {
                        $stackTrace += "  [$j] ldsfld => $($fld.DeclaringType.Name).$($fld.Name) : $($fld.FieldType.Name)"
                        if ($callName -eq "kfW0Lx5YBq" -and $fld.FieldType.Name -like "*Int*") {
                            $paramSource = "static_field_$($fld.DeclaringType.Name).$($fld.Name)"
                        }
                    }
                }
            }
            elseif ($op -eq 0x7B) {
                # ldfld
                if ($j + 4 -lt $il.Length) {
                    $fldToken = [BitConverter]::ToUInt32($il, $j + 1)
                    $fld = $null
                    try { $fld = $mod.ResolveField($fldToken) } catch {}
                    if ($fld -ne $null) {
                        $stackTrace += "  [$j] ldfld => $($fld.DeclaringType.Name).$($fld.Name) : $($fld.FieldType.Name)"
                    }
                }
            }
            elseif ($op -ge 0x0B -and $op -le 0x0E) {
                # ldloc.0~3
                $locIdx = $op - 0x0B
                $locals = $body.LocalVariables
                if ($locals -ne $null -and $locIdx -lt $locals.Count) {
                    $lt = $locals[$locIdx].LocalType
                    $stackTrace += "  [$j] $(GetOpcodeName $op) => local[$locIdx]:$($lt.Name)"
                    if ($callName -eq "kfW0Lx5YBq" -and $lt.Name -like "*Int*") {
                        $paramSource = "local_var_$locIdx"
                    }
                }
            }
            elseif ($op -eq 0x14) {
                # ldloc.s
                if ($j + 1 -lt $il.Length) {
                    $locIdx = [int]$il[$j + 1]
                    $locals = $body.LocalVariables
                    if ($locals -ne $null -and $locIdx -lt $locals.Count) {
                        $lt = $locals[$locIdx].LocalType
                        $stackTrace += "  [$j] ldloc.s => local[$locIdx]:$($lt.Name)"
                        if ($callName -eq "kfW0Lx5YBq" -and $lt.Name -like "*Int*") {
                            $paramSource = "local_s_$locIdx"
                        }
                    }
                }
            }
            elseif ($op -eq 0x73 -or $op -eq 0x74 -or $op -eq 0x75) {
                # add/sub/mul - 参数可能是计算结果
                $stackTrace += "  [$j] $(GetOpcodeName $op) => arithmetic"
                if ($callName -eq "kfW0L5YBq" -and $paramSource -eq "UNKNOWN") {
                    $paramSource = "arithmetic_result"
                }
            }
        }
        
        # 解密结果
        $decryptedStr = ""
        if ($callName -eq "kfW0Lx5YBq" -and $paramValue -ne $null) {
            try {
                $dr = $kfMethod.Invoke($null, @([int]$paramValue))
                if ($dr -ne $null) { $decryptedStr = "$dr" }
                if ($decryptedStr.Length -gt 300) { $decryptedStr = $decryptedStr.Substring(0, 300) }
            } catch {}
        }
        
        $result = @{
            Offset = $i
            CallType = $callName
            ParamSource = $paramSource
            ParamValue = $paramValue
            Decrypted = $decryptedStr
            StackTrace = $stackTrace
            StringParts = $stringParts
        }
        $results += $result
    }
    return $results
}

# 分析关键类型
$targetTypes = @(
    "HgCeApp.WSocketClientHelp",
    "HgCeApp.HgClass",
    "HgCeApp.Global",
    "HgCeApp.Tool",
    "HgCeApp.FormMain"
)

foreach ($tn in $targetTypes) {
    $typ = $assembly.GetType($tn)
    if ($typ -eq $null) { 
        Out-Log "  Type not found: $tn"
        continue 
    }
    
    Out-Log "`n--- Analyzing: $tn ---"
    
    foreach ($m in $typ.GetMethods($bfAll)) {
        $body = $m.GetMethodBody()
        if ($body -eq $null) { continue }
        $il = $body.GetILAsByteArray()
        if ($il -eq $null -or $il.Length -eq 0) { continue }
        
        $calls = AnalyzeCallSite $tn $m.Name $il $body $m
        if ($calls.Count -eq 0) { continue }
        
        Out-Log "  Method: $($m.Name) (IL length: $($il.Length))"
        foreach ($call in $calls) {
            Out-Log "    [@offset $($call.Offset)] CALL $($call.CallType)"
            Out-Log "      ParamSource: $($call.ParamSource), Value: $($call.ParamValue)"
            if ($call.Decrypted -ne "") {
                Out-Log "      Decrypted: $($call.Decrypted)"
            }
            if ($call.StringParts.Count -gt 0) {
                Out-Log "      Nearby strings: $($call.StringParts -join ' | ')"
            }
            # 显示最近5条栈追踪
            $recentStack = $call.StackTrace[-5..-1]
            if ($recentStack) {
                foreach ($s in $recentStack) { Out-Log "      $s" }
            }
        }
    }
}

# 分析 Open 状态机类型
Out-Log "`n--- Analyzing Open State Machine Types ---"
$openTypes = $assembly.GetTypes() | Where-Object { $_.Name -like "*Open*b__*" -or $_.Name -like "*Open*d__*" }
foreach ($ot in $openTypes) {
    Out-Log "  StateMachine: $($ot.FullName)"
    foreach ($m in $ot.GetMethods($bfAll)) {
        if ($m.Name -ne "MoveNext") { continue }
        $body = $m.GetMethodBody()
        if ($body -eq $null) { continue }
        $il = $body.GetILAsByteArray()
        if ($il -eq $null) { continue }
        
        Out-Log "    MoveNext (IL: $($il.Length) bytes)"
        
        # 额外：dump 所有 ldstr 和 call 指令的完整列表
        $mod = $assembly.ManifestModule
        for ($i = 0; $i -lt $il.Length; $i++) {
            $op = $il[$i]
            
            if ($op -eq 0x72 -and $i + 4 -lt $il.Length) {
                # ldstr
                $strTok = [BitConverter]::ToUInt32($il, $i + 1)
                $sv = $null
                try { $sv = $mod.ResolveString($strTok) } catch {}
                if ($sv -ne $null) {
                    $disp = $sv
                    if ($disp.Length -gt 120) { $disp = $disp.Substring(0, 120) }
                    Out-Log "      [$i] ldstr => `"$disp`""
                }
            }
            
            if (($op -eq 0x28 -or $op -eq 0x87) -and $i + 4 -lt $il.Length) {
                # call / callvirt
                $ctok = [BitConverter]::ToUInt32($il, $i + 1)
                $cm = $null
                try { $cm = $mod.ResolveMethod($ctok) } catch {}
                if ($cm -ne $null) {
                    Out-Log "      [$i] $(if($op -eq 0x28){'call'}else{'callvirt'}) => $($cm.DeclaringType.Name)::$($cm.Name)($($cm.GetParameters().Count) params)"
                }
            }
        }
        
        # 分析调用点
        $calls = AnalyzeCallSite $ot.Name "MoveNext" $il $body $m
        foreach ($call in $calls) {
            Out-Log "    [@offset $($call.Offset)] $($call.CallType): source=$($call.ParamSource) val=$($call.ParamValue)"
            if ($call.Decrypted -ne "") { Out-Log "      decrypted: $($call.Decrypted)" }
        }
    }
}

# 也搜索所有包含 ConnectAsync 的类型
Out-Log "`n=== Global Search: All ConnectAsync / WebSocket references ==="
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
            
            if ($cm.Name -eq "ConnectAsync" -or $cm.Name -like "*WebSocket*" -or $cm.Name -like "*Socket*" -or $cm.Name -like "*Uri*" -or $cm.Name -like "*Url*") {
                Out-Log "  $($typ.Name)::$($m.Name) [$i] => $($cm.DeclaringType.FullName)::$($cm.Name)"
                
                # dump 周围指令
                for ($j = [Math]::Max(0,$i-20); $j -le [Math]::Min($il.Length-5,$i+20); $j++) {
                    $op2 = $il[$j]
                    $detail = GetOpcodeName $op2
                    if ($op2 -eq 0x72 -and $j+4 -lt $il.Length) {
                        $st = $null
                        try { $st = $assembly.ManifestModule.ResolveString([BitConverter]::ToUInt32($il,$j+1)) } catch {}
                        if ($st) { $detail = "ldstr `"$($st.Substring(0,[Math]::Min(80,$st.Length)))`"" }
                    }
                    if ($op2 -eq 0x28 -or $op2 -eq 0x87 -and $j+4 -lt $il.Length) {
                        $cm2 = $null
                        try { $cm2 = $assembly.ManifestModule.ResolveMethod([BitConverter]::ToUInt32($il,$j+1)) } catch {}
                        if ($cm2) { $detail = "$(if($op2-eq0x28){'call'}else{'callvirt'}) $($cm2.DeclaringType.Name)::$($cm2.Name)" }
                    }
                    $marker = if ($j -eq $i) { " <<<" } else { "" }
                    Out-Log "    [$j] $detail$marker"
                }
            }
        }
    }
}

# ========== Step 3: WSocketClientHelp 字段和属性深度分析 ==========
Out-Log "`n========== STEP 3: WSocketClientHelp Deep Analysis =========="
$wsType = $assembly.GetType("HgCeApp.WSocketClientHelp")
if ($wsType -ne $null) {
    Out-Log "Full Name: $($wsType.FullName)"
    Out-Log "BaseType: $($wsType.BaseType)"
    Out-Log "IsAbstract: $($wsType.IsAbstract)"
    Out-Log "Interfaces: $(($wsType.GetInterfaces() | ForEach-Object { $_.Name }) -join ', ')"
    
    Out-Log "`n  Fields:"
    foreach ($f in $wsType.GetFields($bfAll)) {
        Out-Log "    $($f.Attributes) $($f.FieldType.Name) $($f.Name)"
    }
    
    Out-Log "`n  Properties:"
    foreach ($p in $wsType.GetProperties($bfAll)) {
        Out-Log "    $($p.PropertyType.Name) $($p.Name)"
    }
    
    Out-Log "`n  Methods:"
    foreach ($m in $wsType.GetMethods($bfAll)) {
        $params = ($m.GetParameters() | ForEach-Object { "$($_.ParameterType.Name) $($_.Name)" }) -join ", "
        Out-Log "    $($m.ReturnType.Name) $($m.Name)($params)"
    }
    
    Out-Log "`n  Events:"
    foreach ($e in $wsType.GetEvents($bfAll)) {
        Out-Log "    $($e.EventHandlerType.Name) $($e.Name)"
    }

    # 尝试实例化并检查字段值
    Out-Log "`n  Runtime Instance Analysis:"
    try {
        $wsInst = [Activator]::CreateInstance($wsType, $true)
        Out-Log "    Instance created successfully"
        
        foreach ($f in $wsType.GetFields($bfAll)) {
            try {
                $fv = $f.GetValue($wsInst)
                if ($fv -ne $null) {
                    $fvStr = "$fv"
                    if ($fvStr.Length -gt 200) { $fvStr = $fvStr.Substring(0,200) }
                    Out-Log "    Field $($f.Name) = $fvStr"
                } else {
                    Out-Log "    Field $($f.Name) = null"
                }
            } catch {
                Out-Log "    Field $($f.Name) = (error: $($_.Exception.Message.Substring(0,60)))"
            }
        }
    } catch {
        Out-Log "    Instantiation failed: $($_.Exception.Message)"
    }
}

# ========== Step 4: Global 类静态字段分析 ==========
Out-Log "`n========== STEP 4: Global Class Static Fields =========="
$globalType = $assembly.GetType("HgCeApp.Global")
if ($globalType -ne $null) {
    $staticFields = $globalType.GetFields([System.Reflection.BindingFlags]::Public -bor [System.Reflection.BindingFlags]::NonPublic -bor [System.Reflection.BindingFlags]::Static)
    Out-Log "  Static fields count: $($staticFields.Count)"
    foreach ($f in $staticFields) {
        try {
            $fv = $f.GetValue($null)
            $fvStr = if ($fv -ne $null) { "$fv" } else { "null" }
            if ($fvStr.Length -gt 150) { $fvStr = $fvStr.Substring(0,150) }
            Out-Log "    $($f.FieldType.Name) $($f.Name) = $fvStr"
        } catch {
            Out-Log "    $($f.FieldType.Name) $($f.Name) = (error)"
        }
    }
}

# ========== Step 5: HgClass 分析 ==========
Out-Log "`n========== STEP 5: HgClass Methods & Fields =========="
$hgClassType = $assembly.GetType("HgCeApp.HgClass")
if ($hgClassType -ne $null) {
    foreach ($m in $hgClassType.GetMethods($bfAll)) {
        $params = ($m.GetParameters() | ForEach-Object { "$($_.ParameterType.Name)" }) -join ","
        if ($m.Name -like "*Live*" -or $m.Name -like "*Data*" -or $m.Name -like "*Socket*" -or $m.Name -like "*Connect*" -or $m.Name -like "*Open*" -or $m.Name -like "*Url*" -or $m.Name -like "*Ws*") {
            Out-Log "  $($m.ReturnType.Name) $($m.Name)($params)"
        }
    }
    
    # 找到 GetLiveData 方法详细分析
    $glm = $hgClassType.GetMethod("GetLiveData", $bfAll)
    if ($glm -ne $null) {
        Out-Log "`n  GetLiveData detailed analysis:"
        $body = $glm.GetMethodBody()
        if ($body -ne $null) {
            $il = $body.GetILAsByteArray()
            Out-Log "    IL bytes: $($il.Length)"
            $calls = AnalyzeCallSite "HgCeApp.HgClass" "GetLiveData" $il $body $glm
            foreach ($call in $calls) {
                Out-Log "      [$($call.Offset)] $($call.CallType): src=$($call.ParamSource) val=$($call.ParamValue) dec=`"$($call.Decrypted)`""
            }
        }
    }
}

# ========== Step 6: 搜索所有包含 URL/WS/Socket 相关字符串的方法 ==========
Out-Log "`n========== STEP 6: URL/WebSocket/String Pattern Search =========="
$urlKeywords = @("http", "ws://", "wss://", "socket", "transform", "connect", "uri", "url")
foreach ($typ in $assembly.GetTypes()) {
    foreach ($m in $typ.GetMethods($bfAll)) {
        $body = $m.GetMethodBody()
        if ($body -eq $null) { continue }
        $il = $body.GetILAsByteArray()
        if ($il -eq $null) { continue }
        
        $hasRelevant = $false
        $foundStrings = @()
        $mod = $assembly.ManifestModule
        
        for ($i = 0; $i -lt $il.Length; $i++) {
            if ($il[$i] -ne 0x72) { continue }
            if ($i + 4 -ge $il.Length) { continue }
            $stok = [BitConverter]::ToUInt32($il, $i + 1)
            $sv = $null
            try { $sv = $mod.ResolveString($stok) } catch {}
            if ($sv -ne $null) {
                $svLower = $sv.ToLower()
                foreach ($kw in $urlKeywords) {
                    if ($svLower.Contains($kw)) {
                        $hasRelevant = $true
                        $disp = $sv
                        if ($disp.Length -gt 150) { $disp = $disp.Substring(0,150) }
                        $foundStrings += $disp
                        break
                    }
                }
            }
        }
        
        if ($hasRelevant) {
            Out-Log "  $($typ.Name)::$($m.Name)"
            foreach ($fs in $foundStrings) {
                Out-Log "    ldstr: `"$fs`""
            }
        }
    }
}

# ========== 写入文件 ==========
$sw.Flush()
$bytes = $ms.ToArray()
$sw.Close()
$ms.Close()

[System.IO.File]::WriteAllBytes($outFile, $bytes)
Write-Host "`nDone! Output: $outFile" -ForegroundColor Green
Write-Host "File size: $([math]::Round($bytes.Length / 1024, 1)) KB" -ForegroundColor Green
