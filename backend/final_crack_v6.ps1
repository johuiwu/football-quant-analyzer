# HgCeApp.exe 最终破解脚本 v6
# 目标: 提取WebSocket完整URL
$ErrorActionPreference = "Stop"

$exePath = [System.IO.Path]::GetTempPath() + "HgCeApp.exe"
if (-not [System.IO.File]::Exists($exePath)) {
    Copy-Item "d:\下载\黄瓜角球\黄瓜角球\HgCeApp.exe" $exePath -Force
}

Write-Host "[1/5] Loading assembly..." -ForegroundColor Cyan
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
$outFile = Join-Path $outDir "final_crack.txt"
$lines = [System.Collections.Generic.List[string]]::new()

function L($m) { $lines.Add($m); Write-Host $m -ForegroundColor Yellow }

# ========== Step 1: 解密关键索引 ==========
L("=== STEP 1: Critical Key Decryption ===")

# 从 Open 状态机分析中已知 kfW0Lx5YBq(1) 被调用
L("")
L("--- kfW0Lx5YBq(1) from Open StateMachine ---")
$r1 = De(1)
L("RESULT: [$r1]")
L("")

# 也解密 0-10 的基础索引
for ($i = 0; $i -le 20; $i++) {
    $r = De($i)
    if ($r.Length -gt 0) {
        $d = $r; if ($d.Length -gt 300) { $d = $d.Substring(0,300) }
        L("  kfW0Lx5YBq($i) => `"$d`"")
    }
}

# ========== Step 2: 读取 HgCeApp.ini 配置 ==========
L("")
L("=== STEP 2: HgCeApp.ini Config ===")
$iniPath = "C:\WINDOWS\System32\WindowsPowerShell\v1.0\HgCeApp.ini"
if ([System.IO.File]::Exists($iniPath)) {
    $iniContent = [System.IO.File]::ReadAllText($iniPath, [System.Text.Encoding]::UTF8)
    L("File exists: $iniPath")
    L("Content length: $($iniContent.Length)")
    L("--- Content ---")
    # 按行输出
    foreach ($line in $iniContent.Split("`n")) {
        $l = $line.Trim()
        if ($l.Length -gt 0) { L("  $l") }
    }
} else {
    L("INI not found at: $iniPath")
    # 尝试其他位置
    $altPath = "d:\下载\黄瓜角球\黄瓜角球\HgCeApp.ini"
    if ([System.IO.File]::Exists($altPath)) {
        $iniContent = [System.IO.File]::ReadAllText($altPath, [System.Text.Encoding]::UTF8)
        L("Found at alternate: $altPath")
        foreach ($line in $iniContent.Split("`n")) {
            $l = $line.Trim(); if ($l.Length -gt 0) { L("  $l") }
        }
    }
}

# ========== Step 3: Global 字典 nLx7Y4pX41 内容 ==========
L("")
L("=== STEP 3: Global Dictionary (nLx7Y4pX41) ===")
$gt = $asm.GetType("HgCeApp.Global")
if ($gt -ne $null) {
    $dictField = $gt.GetField("nLx7Y4pX41", $bfa)
    if ($dictField -ne $null) {
        $dictVal = $dictField.GetValue($null)
        if ($dictVal -ne $null) {
            L("Dictionary type: $($dictVal.GetType().FullName)")
            $dictEnum = $dictVal.GetEnumerator()
            while ($dictEnum.MoveNext()) {
                $key = "$($dictEnum.Current.Key)"
                $val = "$($dictEnum.Current.Value)"
                # 隐藏敏感信息
                if ($key -match "password|Password|pwd") { $val = "***MASKED***" }
                if ($key -match "Username|User|uid") { $val = "***MASKED***" }
                L("  [$key] = $val")
            }
        } else {
            L("Dictionary value is null (not initialized yet - needs app to run)")
        }
    }

    # 也检查 ofIPvGwMQS (ini路径)
    $pathField = $gt.GetField("ofIPvGwMQS", $bfa)
    if ($pathField -ne $null) {
        $pv = $pathField.GetValue($null)
        L("  ofIPvGwMQS (ini path) = $pv")
    }
}

# ========== Step 4: WSocketClientHelp.mAS495kb4k 分析 ==========
L("")
L("=== STEP 4: WSocketClientHelp.mAS495kb4k Analysis ===")
$wsType = $asm.GetType("HgCeApp.WSocketClientHelp")
if ($wsType -ne $null) {
    # 找 mAS495kb4k 方法
    $masMethod = $wsType.GetMethod("mAS495kb4k", $bfa)
    if ($masMethod -ne $null) {
        L("Method found: $($masMethod.Name)")
        L("ReturnType: $($masMethod.ReturnType.FullName)")
        $params = $masMethod.GetParameters()
        L("Parameters: $($params.Count)")
        foreach ($p in $params) {
            L("  $($p.ParameterType.FullName) $($p.Name)")
        }
        
        # 分析 IL
        $body = $masMethod.GetMethodBody()
        if ($body -ne $null) {
            $il = $body.GetILAsByteArray()
            L("IL size: $($il.Length)")
            
            # dump所有 ldstr 和 call
            $mod = $asm.ManifestModule
            for ($i = 0; $i -lt $il.Length; $i++) {
                if ($il[$i] -eq 0x72 -and $i+4 -lt $il.Length) {
                    $s = $null
                    try { $s = $mod.ResolveString([BitConverter]::ToUInt32($il,$i+1)) } catch {}
                    if ($s -ne $null) {
                        $sd = $s; if ($sd.Length -gt 120) { $sd = $sd.Substring(0,120) }
                        L("  [$i] ldstr => `"$sd`"")
                    }
                }
                if (($il[$i] -eq 0x28 -or $il[$i] -eq 0x87) -and $i+4 -lt $il.Length) {
                    $cm = $null
                    try { $cm = $mod.ResolveMethod([BitConverter]::ToUInt32($il,$i+1)) } catch {}
                    if ($cm -ne $null) {
                        L("  [$i] $(if($il[$i]-eq 0x28){'call'}else{'callvirt'}) => $($cm.DeclaringType.Name).$($cm.Name)")
                    }
                }
            }
        }
    }
    
    # 找 Ddk4OdT6x7 方法
    $ddkMethod = $wsType.GetMethod("Ddk4OdT6x7", $bfa)
    if ($ddkMethod -ne $null) {
        L("")
        L("Method: $($ddkMethod.Name)")
        L("ReturnType: $($ddkMethod.ReturnType.FullName)")
        foreach ($p in $ddkMethod.GetParameters()) {
            L("  Param: $($p.ParameterType.FullName) $($p.Name)")
        }
        $body2 = $ddkMethod.GetMethodBody()
        if ($body2 -ne $null) {
            $il2 = $body2.GetILAsByteArray()
            L("IL size: $($il2.Length)")
            $mod2 = $asm.ManifestModule
            for ($i = 0; $i -lt $il2.Length; $i++) {
                if ($il2[$i] -eq 0x72 -and $i+4 -lt $il2.Length) {
                    $s = $null
                    try { $s = $mod2.ResolveString([BitConverter]::ToUInt32($il2,$i+1)) } catch {}
                    if ($s -ne $null) {
                        $sd = $s; if ($sd.Length -gt 120) { $sd = $sd.Substring(0,120) }
                        L("  [$i] ldstr => `"$sd`"")
                    }
                }
                if (($il2[$i] -eq 0x28 -or $il2[$i] -eq 0x87) -and $i+4 -lt $il2.Length) {
                    $cm = $null
                    try { $cm = $mod2.ResolveMethod([BitConverter]::ToUInt32($il2,$i+1)) } catch {}
                    if ($cm -ne $null) {
                        L("  [$i] $(if($il2[$i]-eq 0x28){'call'}else{'callvirt'}) => $($cm.DeclaringType.FullName).$($cm.Name)")
                    }
                }
            }
        }
    }
    
    # 找 HI548hsim5 方法 (返回Task的)
    $hiMethod = $wsType.GetMethod("HI548hsim5", $bfa)
    if ($hiMethod -ne $null) {
        L("")
        L("Method: $($hiMethod.Name) returns Task")
        $body3 = $hiMethod.GetMethodBody()
        if ($body3 -ne $null) {
            $il3 = $body3.GetILAsByteArray()
            L("IL size: $($il3.Length)")
            $mod3 = $asm.ManifestModule
            for ($i = 0; $i -lt $il3.Length; $i++) {
                if ($il3[$i] -eq 0x72 -and $i+4 -lt $il3.Length) {
                    $s = $null
                    try { $s = $mod3.ResolveString([BitConverter]::ToUInt32($il3,$i+1)) } catch {}
                    if ($s -ne $null) {
                        $sd = $s; if ($sd.Length -gt 120) { $sd = $sd.Substring(0,120) }
                        L("  [$i] ldstr => `"$sd`"")
                    }
                }
                if (($il3[$i] -eq 0x28 -or $il3[$i] -eq 0x87) -and $i+4 -lt $il3.Length) {
                    $cm = $null
                    try { $cm = $mod3.ResolveMethod([BitConverter]::ToUInt32($il3,$i+1)) } catch {}
                    if ($cm -ne $null) {
                        $tag = ""
                        if ($cm.Name -eq "ConnectAsync") { $tag = " <<<CONNECT" }
                        L("  [$i] $(if($il3[$i]-eq 0x28){'call'}else{'callvirt'}) => $($cm.DeclaringType.FullName).$($cm.Name)$tag")
                    }
                }
            }
        }
    }
}

# ========== Step 5: 构造函数分析 ==========
L("")
L("=== STEP 5: Constructor Analysis ===")
$ctors = $wsType.GetConstructors($bfa)
L("Constructor count: $($ctors.Count)")
foreach ($ctor in $ctors) {
    $pars = $ctor.GetParameters()
    $plist = ($pars | ForEach-Object { "$($_.ParameterType.Name)" }) -join ", "
    L("  ctor($plist)")
    
    # 分析构造函数 IL
    $cb = $ctor.GetMethodBody()
    if ($cb -ne $null) {
        $cil = $cb.GetILAsByteArray()
        L("  IL size: $($cil.Length)")
        $mod4 = $asm.ManifestModule
        for ($i = 0; $i -lt $cil.Length; $i++) {
            if ($cil[$i] -eq 0x72 -and $i+4 -lt $cil.Length) {
                $s = $null
                try { $s = $mod4.ResolveString([BitConverter]::ToUInt32($cil,$i+1)) } catch {}
                if ($s -ne $null) {
                    $sd = $s; if ($sd.Length -gt 120) { $sd = $sd.Substring(0,120) }
                    L("    [$i] ldstr => `"$sd`"")
                }
            }
        }
    }
}

# ========== 写入 ==========
$utf8 = [System.Text.UTF8Encoding]::new($true)
[System.IO.File]::WriteAllLines($outFile, $lines, $utf8)
Write-Host "`nDONE! File: $outFile" -ForegroundColor Green
