# v7b: 找mAS495kb4k调用者 + PJI4DVIrcW/Open完整IL + HI548hsim5完整IL
$ErrorActionPreference = "Stop"
$exePath = [System.IO.Path]::GetTempPath() + "HgCeApp.exe"
if (-not [System.IO.File]::Exists($exePath)) {
    Copy-Item "d:\下载\黄瓜角球\黄瓜角球\HgCeApp.exe" $exePath -Force
}
$asm = [System.Reflection.Assembly]::LoadFrom($exePath)
$bf = [System.Reflection.BindingFlags]::Public -bor [System.Reflection.BindingFlags]::NonPublic -bor [System.Reflection.BindingFlags]::Static -bor [System.Reflection.BindingFlags]::DeclaredOnly
$bfa = $bf -bor [System.Reflection.BindingFlags]::Instance
$mod = $asm.ManifestModule

$outDir = [System.IO.Path]::GetTempPath()
$lines = [System.Collections.Generic.List[string]]::new()
function L($m) { $lines.Add($m); Write-Host $m -ForegroundColor Yellow }

# 简化IL反汇编函数
function DumpIL($ilBytes, $label) {
    L("=== $label IL Disassembly (size=$($ilBytes.Length)) ===")
    for ($i = 0; $i -lt $ilBytes.Length; $i++) {
        $op = $ilBytes[$i]
        $desc = ""
        $extra = ""
        $skip = 0

        if ($op -eq 0x00) { $desc = "nop" }
        elseif ($op -eq 0x02) { $desc = "ldarg.0" }
        elseif ($op -eq 0x03) { $desc = "ldarg.1" }
        elseif ($op -eq 0x04) { $desc = "ldarg.2" }
        elseif ($op -eq 0x05) { $desc = "ldarg.3" }
        elseif ($op -eq 0x06) { $desc = "ldnull" }
        elseif ($op -eq 0x07) { $desc = "ldc.i4.m1" }
        elseif ($op -ge 0x08 -and $op -le 0x10) { $desc = "ldc.i4.$($op-8)" }
        elseif ($op -eq 0x11) { $desc = "ldarg.s"; $extra="$($ilBytes[$i+1])"; $skip=1 }
        elseif ($op -eq 0x14) { $desc = "ldnull" }
        elseif ($op -eq 0x16) { $desc = "ldarg.s"; $extra="$($ilBytes[$i+1])"; $skip=1 }
        elseif ($op -eq 0x1F) { $desc = "ldc.i4.s"; $v=[sbyte]$ilBytes[$i+1]; $extra="$v"; $skip=1 }
        elseif ($op -eq 0x20) { $desc = "ldc.i4"; $v=[BitConverter]::ToInt32($ilBytes,$i+1); $extra="$v"; $skip=4 }
        elseif ($op -eq 0x25) { $desc = "dup" }
        elseif ($op -eq 0x26) { $desc = "pop" }
        elseif ($op -eq 0x28) {
            $desc = "call"
            $tok = [BitConverter]::ToUInt32($ilBytes,$i+1)
            try {
                $cm = $mod.ResolveMethod($tok)
                $extra = "$($cm.DeclaringType.Name).$($cm.Name)"
                if ($cm.Name -match "mAS495kb4k|HI548hsim5|kfW0Lx5YBq|ConnectAsync|Concat|Format|Ddk4OdT6x7|G9NZ0lBapP|SendAsync|get_Item|TryGetValue|ContainsKey|get_Count|Add|get_Url|get_Host|get_Scheme|get_AbsoluteUri|get_PathAndQuery|ToString") { $extra += " <<<<" }
            } catch { $extra = "token:$tok" }
            $skip = 4
        }
        elseif ($op -eq 0x29) {
            $desc = "callvirt"
            $tok = [BitConverter]::ToUInt32($ilBytes,$i+1)
            try { $cm = $mod.ResolveMethod($tok); $extra = "$($cm.DeclaringType.Name).$($cm.Name)" } catch {}
            $skip = 4
        }
        elseif ($op -eq 0x2F) { $desc = "ret" }
        elseif ($op -eq 0x3A) { $desc = "throw" }
        elseif ($op -eq 0x3C) {
            $desc = "ldsfld"
            $tok = [BitConverter]::ToUInt32($ilBytes,$i+1)
            try { $f = $mod.ResolveField($tok); $extra = "$($f.DeclaringType.Name).$($f.Name):$($f.FieldType.Name)" } catch {}
            $skip = 4
        }
        elseif ($op -eq 0x3D) {
            $desc = "stsfld"
            $tok = [BitConverter]::ToUInt32($ilBytes,$i+1)
            try { $f = $mod.ResolveField($tok); $extra = "$($f.DeclaringType.Name).$($f.Name)" } catch {}
            $skip = 4
        }
        elseif ($op -eq 0x45) { $desc = "box"; $skip=4 }
        elseif ($op -eq 0x46) { $desc = "newarr"; $skip=4 }
        elseif ($op -eq 0x47) { $desc = "ldlen" }
        elseif ($op -ge 0x49 -and $op -le 0x53) { $desc = "ldelem" }
        elseif ($op -eq 0x58) { $desc = "add" }
        elseif ($op -eq 0x59) { $desc = "sub" }
        elseif ($op -eq 0x5A) { $desc = "mul" }
        elseif ($op -eq 0x5B) { $desc = "div" }
        elseif ($op -eq 0x5C) { $desc = "rem" }
        elseif ($op -eq 0x5D) { $desc = "and" }
        elseif ($op -eq 0x5E) { $desc = "or" }
        elseif ($op -eq 0x5F) { $desc = "xor" }
        elseif ($op -ge 0x65 -and $op -le 0x6C) { $desc = "conv" }
        elseif ($op -eq 0x6D) {
            $desc = "callvirt"
            $tok = [BitConverter]::ToUInt32($ilBytes,$i+1)
            try {
                $cm = $mod.ResolveMethod($tok)
                $extra = "$($cm.DeclaringType.Name).$($cm.Name)"
                if ($cm.Name -match "ConnectAsync|SendAsync|Concat|Format|get_Url|get_Host|get_AbsoluteUri|get_Item|TryGetValue|ContainsKey|get_Count|Add|ToString") { $extra += " <<<<" }
            } catch {}
            $skip = 4
        }
        elseif ($op -eq 0x70 -or $op -eq 0x72) {
            $desc = "ldstr"
            $tok = [BitConverter]::ToUInt32($ilBytes,$i+1)
            try { $s = $mod.ResolveString($tok); $sd="$s"; if($sd.Length -gt 100){$sd=$sd.Substring(0,100)+"..."}; $extra="`"$sd`"" } catch {}
            $skip = 4
        }
        elseif ($op -eq 0x74) { $desc = "unbox"; $skip=4 }
        elseif ($op -eq 0x76 -or $op -eq 0x7A) {
            $nm = if($op -eq 0x76){"ldfld"}else{"stfld"}
            $desc = $nm
            $tok = [BitConverter]::ToUInt32($ilBytes,$i+1)
            try { $f = $mod.ResolveField($tok); $extra = "$($f.DeclaringType.Name).$($f.Name):$($f.FieldType.Name)" } catch {}
            $skip = 4
        }
        elseif ($op -eq 0x77 -or $op -eq 0x79) {
            $nm = if($op -eq 0x77){"ldsfld"}else{"ldsflda"}
            $desc = $nm
            $tok = [BitConverter]::ToUInt32($ilBytes,$i+1)
            try { $f = $mod.ResolveField($tok); $extra = "$($f.DeclaringType.Name).$($f.Name):$($f.FieldType.Name)" } catch {}
            $skip = 4
        }
        elseif ($op -eq 0x7B) {
            $desc = "ldfld"
            $tok = [BitConverter]::ToUInt32($ilBytes,$i+1)
            try { $f = $mod.ResolveField($tok); $extra = "$($f.DeclaringType.Name).$($f.Name):$($f.FieldType.Name)" } catch {}
            $skip = 4
        }
        elseif ($op -eq 0x7C) {
            $desc = "ldsfld"
            $tok = [BitConverter]::ToUInt32($ilBytes,$i+1)
            try { $f = $mod.ResolveField($tok); $extra = "$($f.DeclaringType.Name).$($f.Name):$($f.FieldType.Name)" } catch {}
            $skip = 4
        }
        elseif ($op -eq 0x7D) {
            $desc = "stsfld"
            $tok = [BitConverter]::ToUInt32($ilBytes,$i+1)
            try { $f = $mod.ResolveField($tok); $extra = "$($f.DeclaringType.Name).$($f.Name)" } catch {}
            $skip = 4
        }
        elseif ($op -eq 0x87) {
            $desc = "callvirt"
            $tok = [BitConverter]::ToUInt32($ilBytes,$i+1)
            try {
                $cm = $mod.ResolveMethod($tok)
                $extra = "$($cm.DeclaringType.Name).$($cm.Name)"
                if ($cm.Name -eq "ConnectAsync") { $extra += " <<<CONNECT_ASYNC!!!" }
                if ($cm.Name -eq "SendAsync") { $extra += " <<<SEND_ASYNC!!!" }
                if ($cm.Name -eq "Concat") { $extra += " <<<STRING_CONCAT" }
                if ($cm.Name -eq "Format") { $extra += " <<<FORMAT" }
                if ($cm.Name -eq "get_Item") { $extra += " <<<GET_ITEM" }
                if ($cm.Name -eq "TryGetValue") { $extra += " <<<TRY_GET" }
                if ($cm.Name -eq "ContainsKey") { $extra += " <<<CONTAINS" }
                if ($cm.Name -eq "get_AbsoluteUri") { $extra += " <<<ABS_URI" }
                if ($cm.Name -eq "get_Host") { $extra += " <<<HOST" }
                if ($cm.Name -eq "get_Scheme") { $extra += " <<<SCHEME" }
                if ($cm.Name -eq "get_PathAndQuery") { $extra += " <<<PATH_QUERY" }
                if ($cm.Name -eq "ToString") { $extra += " <<<TOSTRING" }
            } catch { $extra = "token:$tok" }
            $skip = 4
        }
        elseif ($op -eq 0x8B) {
            $desc = "newobj"
            $tok = [BitConverter]::ToUInt32($ilBytes,$i+1)
            try {
                $cm = $mod.ResolveMethod($tok)
                $extra = "$($cm.DeclaringType.Name).$($cm.Name)"
                if ($cm.DeclaringType.Name -match "Uri|WebSocket|ClientWebSocket|Task|CancellationTokenSource") { $extra += " <<<NEW_URGENT" }
            } catch { $extra = "token:$tok" }
            $skip = 4
        }
        elseif ($op -eq 0x8C) { $desc = "initobj"; $skip=4 }
        elseif ($op -eq 0x81) { $desc = "ldtoken"; $skip=4 }
        elseif ($op -eq 0xA1) { $desc = "ceq" }
        elseif ($op -eq 0xA2) { $desc = "cgt" }
        elseif ($op -eq 0xA4) { $desc = "clt" }
        elseif ($op -eq 0xA6) { $desc = "ldftn"; $skip=4 }
        elseif ($op -eq 0x38) { $desc = "stelem.i4" }
        elseif ($op -eq 0x39) { $desc = "unbox.any"; $skip=4 }
        elseif ($op -eq 0x2E) { $desc = "ceq" }
        elseif ($op -eq 0x37) { $desc = "newarr"; $skip=4 }
        elseif ($op -eq 0x3B) {
            $desc = "ldfld"
            $tok = [BitConverter]::ToUInt32($ilBytes,$i+1)
            try { $f = $mod.ResolveField($tok); $extra = "$($f.DeclaringType.Name).$($f.Name):$($f.FieldType.Name)" } catch {}
            $skip = 4
        }
        else { $desc = "0x$($op.ToString('X2'))" }

        L("  [$($i.ToString('D4'))] $($desc.PadRight(14)) $extra")
        $i += $skip
    }
    L("")
}

# ========== Step 1: 找所有调用 mAS495kb4k 的地方 ==========
L("=== STEP 1: All Callers of mAS495kb4k ===")
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
                                    # dump caller method IL
                                    DumpIL $mil "$($t.Name).$($m.Name)"
                                }
                            } catch {}
                        }
                    }
                }
            }
        }
    }
}

# ========== Step 2: PJI4DVIrcW 完整IL ==========
L("=== STEP 2: PJI4DVIrcW (likely Open) ===")
$wsType = $asm.GetType("HgCeApp.WSocketClientHelp")
$pjiMethod = $wsType.GetMethod("PJI4DVIrcW", $bfa)
if ($pjiMethod -ne $null) {
    $pjibody = $pjiMethod.GetMethodBody()
    if ($pjibody -ne $null) {
        DumpIL $pjibody.GetILAsByteArray() "PJI4DVIrcW"
    }
}

# ========== Step 3: HI548hsim5 完整IL ==========
L("=== STEP 3: HI548hsim5 ===")
$hiMethod = $wsType.GetMethod("HI548hsim5", $bfa)
if ($hiMethod -ne $null) {
    $hibody = $hiMethod.GetMethodBody()
    if ($hibody -ne $null) {
        DumpIL $hibody.GetILAsByteArray() "HI548hsim5"
    }
}

# ========== Step 4: 构造函数(String) 完整IL ==========
L("=== STEP 4: Constructor(String) ===")
$ctors = $wsType.GetConstructors($bfa)
foreach ($ctor in $ctors) {
    $pars = $ctor.GetParameters()
    if ($pars.Count -eq 1 -and $pars[0].ParameterType.Name -eq "String") {
        $cb = $ctor.GetMethodBody()
        if ($cb -ne $null) {
            DumpIL $cb.GetILAsByteArray() "ctor(String)"
        }
    }
}

# ========== Step 5: G9NZ0lBapP8X84WJ6kN (validation) ==========
L("=== STEP 5: G9NZ0lBapP8X84WJ6kN ===")
$g9Method = $wsType.GetMethod("G9NZ0lBapP8X84WJ6kN", $bfa)
if ($g9Method -ne $null) {
    $g9body = $g9Method.GetMethodBody()
    if ($g9body -ne $null) {
        DumpIL $g9body.GetILAsByteArray() "G9NZ0lBapP8X84WJ6kN"
    }
}

# ========== Step 6: obT4LRPSxx (Byte[] -> Boolean) ==========
L("=== STEP 6: obT4LRPSxx ===")
$obMethod = $wsType.GetMethod("obT4LRPSxx", $bfa)
if ($obMethod -ne $null) {
    $obbody = $obMethod.GetMethodBody()
    if ($obbody -ne $null) {
        DumpIL $obbody.GetILAsByteArray() "obT4LRPSxx"
    }
}

$outFile = Join-Path $outDir "crack_v7b.txt"
$utf8 = [System.Text.UTF8Encoding]::new($true)
[System.IO.File]::WriteAllLines($outFile, $lines, $utf8)
Write-Host "`nDONE! File: $outFile" -ForegroundColor Green
