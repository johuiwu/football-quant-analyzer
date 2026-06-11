# v13: 反编译kfW0Lx5YBq方法本身 + 理解参数变换逻辑 + 模拟计算
$ErrorActionPreference = "Stop"
$tp = [System.IO.Path]::GetTempPath()
$exe = $tp + "HgCeApp.exe"
if (-not [System.IO.File]::Exists($exe)) { Copy-Item "d:\下载\黄瓜角球\黄瓜角球\HgCeApp.exe" $exe -Force }
$asm = [System.Reflection.Assembly]::LoadFrom($exe)
$bf = [System.Reflection.BindingFlags]::Public -bor [System.Reflection.BindingFlags]::NonPublic -bor [System.Reflection.BindingFlags]::Static -bor [System.Reflection.BindingFlags]::DeclaredOnly
$bfa = $bf -bor [System.Reflection.BindingFlags]::Instance
$mod = $asm.ManifestModule

$outFile = Join-Path $tp "crack_v13.txt"
$sw = [System.IO.StreamWriter]::new($outFile, $false, [System.Text.UTF8Encoding]::new($true))

function WL($m) { $sw.WriteLine($m); Write-Host $m -ForegroundColor Cyan }

$decType = $asm.GetType("mjldbepFpfgR2sirhk.Kusbq8F7xd8hvTfPmi")
$decMethod = $decType.GetMethod("kfW0Lx5YBq", $bf)

WL("=== V13: Decryptor Internal Analysis ===")
WL("")

# === Part 1: 完整反编译kfW0Lx5YBq方法 ===
WL("--- Part 1: Full IL disassembly of kfW0Lx5YBq ---")
$mb = $decMethod.GetMethodBody()
$mil = $mb.GetILAsByteArray()
WL("IL length: " + $mil.Length)
WL("")

# Show locals
$locals = $mb.LocalVariables
if ($locals.Count -gt 0) {
    WL("Locals:")
    for ($li = 0; $li -lt $locals.Count; $li++) {
        WL("  [$li] " + $locals[$li].LocalType.FullName)
    }
}
WL("")

# Full disassembly with proper opcode handling
$i = 0
$instructions = @()  # Store all instructions for later analysis
while ($i -lt $mil.Length) {
    $op = $mil[$i]
    $line = "[" + $i.ToString("D4") + "] "
    $skip = 1
    $instr = @{ Offset=$i; Opcode=$op; Text=""; Operand=$null }
    
    switch ($op) {
        0x00 { $line += "nop" }
        0x01 { $line += "break" }
        0x02 { $line += "ldarg.0" }
        0x03 { $line += "ldarg.1" }
        0x06 { $line += "ldnull" }
        0x07 { $line += "ldc.i4.M1" }
        { $_ -ge 0x08 -and $_ -le 0x10 } { $line += "ldc.i4." + ($_ - 8); $instr.Operand = ($_ - 8) }
        0x11 { 
            $pv = [sbyte]$mil[$i+1]; $line += "ldc.i4.s " + $pv; $skip = 2; $instr.Operand = [int]$pv
        }
        0x12 { 
            $pv = [BitConverter]::ToInt32($mil,$i+1); $line += "ldc.i4 " + $pv; $skip = 5; $instr.Operand = $pv
        }
        0x14 { $line += "ldc.r4"; $skip = 5 }
        0x15 { $line += "ldc.r8"; $skip = 9 }
        0x17 { 
            $stok = [BitConverter]::ToUInt32($mil,$i+1)
            try { $ss = $mod.ResolveString($stok); $line += 'ldstr "' + $ss + '"'; $instr.Operand = $ss } catch { $line += "ldstr <tok:$stok>" }
            $skip = 5 
        }
        0x18 { $line += "dup" }
        0x19 { $line += "pop" }
        0x20 { 
            $pv = [BitConverter]::ToInt32($mil,$i+1); $line += "ldc.i4 " + $pv; $skip = 5; $instr.Operand = $pv
        }
        0x25 { $line += "dup" }
        0x28 { 
            $ct = [BitConverter]::ToUInt32($mil,$i+1)
            try {
                $cm=$mod.ResolveMethod($ct)
                $cps = ""; try { $cps = ($cm.GetParameters()|ForEach-Object{$_.ParameterType.Name}) -join "," } catch {}
                $line += "call " + $cm.DeclaringType.Name + "." + $cm.Name + "(" + $cps + ")"
                $instr.Operand = $cm.Name
            } catch { $line += "call <tok:$ct>" }
            $skip = 5 
        }
        0x29 { $line += "calli"; $skip = 5 }
        0x2A { $line += "ret" }
        0x38 { $line += "conv.u2" }
        0x39 { $line += "conv.u1" }
        0x3A { $line += "conv.i2" }
        0x3B { $line += "conv.i1" }
        0x3C { $line += "conv.ovf.i4.un" }
        0x58 { $line += "add" }
        0x59 { $line += "sub" }
        0x5A { $line += "mul" }
        0x5B { $line += "div" }
        0x5C { $line += "rem" }
        0x5E { $line += "shl" }
        0x5F { $line += "shr" }
        0x61 { $line += "neg" }
        0x62 { $line += "not" }
        0x63 { $line += "conv.i" }
        0x64 { $line += "conv.ovf.i" }
        0x65 { $line += "conv.ovf.u" }
        0x66 { $line += "xor" }
        0x67 { $line += "rem" }
        0x6C { $line += "not" }
        0x72 { 
            $stok = [BitConverter]::ToUInt32($mil,$i+1)
            try { $ss = $mod.ResolveString($stok); $line += 'ldstr "' + $ss + '"'; $instr.Operand = $ss } catch { $line += "ldstr <tok:$stok>" }
            $skip = 5 
        }
        0x73 { $line += "newarr"; $skip = 5 }
        0x7B { 
            $ft = [BitConverter]::ToUInt32($mil,$i+1)
            try { $ff = $mod.ResolveField($ft); $line += "ldfld " + $ff.DeclaringType.Name + "." + $ff.Name; $instr.Operand = $ff.Name } catch { $line += "ldfld <tok:$ft>" }
            $skip = 5 
        }
        0x7C { 
            $ft = [BitConverter]::ToUInt32($mil,$i+1)
            try { $ff = $mod.ResolveField($ft); $line += "ldsfld " + $ff.DeclaringType.Name + "." + $ff.Name; $instr.Operand = $ff.Name } catch { $line += "ldsfld <tok:$ft>" }
            $skip = 5 
        }
        0x7D { 
            $ft = [BitConverter]::ToUInt32($mil,$i+1)
            try { $ff = $mod.ResolveField($ft); $line += "stfld " + $ff.DeclaringType.Name + "." + $ff.Name } catch { $line += "stfld <tok:$ft>" }
            $skip = 5 
        }
        0x87 { 
            $ct = [BitConverter]::ToUInt32($mil,$i+1)
            try {
                $cm=$mod.ResolveMethod($ct)
                $cps = ""; try { $cps = ($cm.GetParameters()|ForEach-Object{$_.ParameterType.Name}) -join "," } catch {}
                $line += "callvirt " + $cm.DeclaringType.Name + "." + $cm.Name + "(" + $cps + ")"
            } catch { $line += "callvirt <tok:$ct>" }
            $skip = 5 
        }
        0x89 { $line += "???" }
        0x8B { 
            $ct = [BitConverter]::ToUInt32($mil,$i+1)
            try {
                $ctorInfo = $mod.ResolveMethod($ct)
                $cps = ""; try { $cps = ($ctorInfo.GetParameters()|ForEach-Object{$_.ParameterType.Name}) -join "," } catch {}
                $line += "newobj " + $ctorInfo.DeclaringType.Name + ".ctor(" + $cps + ")"
            } catch { $line += "newobj <tok:$ct>" }
            $skip = 5 
        }
        0xA3 { $line += "ldelem.ref"; $skip = 5 }
        0xFE { 
            if ($i+1 -lt $mil.Length) {
                $op2 = $mil[$i+1]
                switch ($op2) {
                    0x01 { $line += "ceq"; $skip = 2 }
                    0x02 { $line += "cgt"; $skip = 2 }
                    0x04 { $line += "clt"; $skip = 2 }
                    0x05 { $line += "clt.un"; $skip = 2 }
                    0x06 { $line += "ldftn"; $skip = 6 }
                    0x09 { $line += "ldtoken"; $skip = 6 }
                    0x0C { 
                        $tt = [BitConverter]::ToUInt32($mil,$i+2)
                        try { $tr = $mod.ResolveType($tt); $line += "constrained " + $tr.FullName } catch { $line += "constrained <tok:$tt>" }
                        $skip = 6 
                    }
                    0x0D { $line += "cpblk"; $skip = 2 }
                    0x0E { $line += "initblk"; $skip = 2 }
                    { $_ -ge 0x10 -and $_ -le 0x1F} { 
                        $sv = [sbyte]$op2; $line += "ldc.i4.s " + $sv; $skip = 2; $instr.Operand = [int]$sv
                    }
                    default { $line += "prefix_FE_" + $op2.ToString("X2"); $skip = 2 }
                }
            } else { $line += "FE??" }
        }
        default { $line += "0x" + $op.ToString("X2") }
    }
    
    $instr.Text = $line
    $instructions += $instr
    WL("  " + $line)
    $i += $skip
}

# === Part 2: 分析关键模式 ===
WL("")
WL("--- Part 2: Key pattern analysis ---")
# Look for: arithmetic operations near ldarg.1 (the parameter)
# Pattern: parameter -> xor/mul/div/mod/shl/shr -> ldelem -> ret
$arithmeticOps = @()
foreach ($inst in $instructions) {
    if ($inst.Text -match "xor|mul|div|rem|shl|shr|add|sub|neg|and|or|not|conv\.(i|i4|i8|u4|u8|r4|r8)") {
        $arithmeticOps += $inst
    }
}
WL("Arithmetic operations (" + $arithmeticOps.Count + "):")
foreach ($ao in $arithmeticOps) {
    WL("  " + $ao.Text)
}

# === Part 3: 查找静态字段(加密数据表) ===
WL("")
WL("--- Part 3: Static fields in Kusbq8F7xd8hvTfPmi ---")
foreach ($f in $decType.GetFields([System.Reflection.BindingFlags]::Public -bor [System.Reflection.BindingFlags]::NonPublic -bor [System.Reflection.BindingFlags]::Static)) {
    WL("  " + $f.Name + " (" + $f.FieldType.FullName + ")")
    try {
        $fv = $f.GetValue($null)
        if ($fv -ne $null) {
            if ($fv.GetType().IsArray) {
                WL("    Array Length=" + $fv.Length)
                if ($fv.Length -le 50 -and $fv.Length -gt 0) {
                    # Show first few elements
                    $preview = ""
                    for ($ei = 0; $ei -lt [Math]::Min(10, $fv.Length); $ei++) {
                        $elem = $fv.GetValue($ei)
                        if ($elem -ne $null) {
                            $es = $elem.ToString()
                            if ($es.Length -gt 60) { $es = $es.Substring(0, 60) }
                            $preview += "[" + $ei + "]=" + $es + " "
                        }
                    }
                    WL("    Preview: " + $preview)
                }
            } else {
                $fvs = $fv.ToString()
                if ($fvs.Length -gt 200) { $fvs = $fvs.Substring(0, 200) }
                WL("    Value: " + $fvs)
            }
        }
    } catch {}
}

# Also check instance fields
foreach ($f in $decType.GetFields([System.Reflection.BindingFlags]::Public -bor [System.Reflection.BindingFlags]::NonPublic -bor [System.Reflection.BindingFlags]::Instance)) {
    WL("  INSTANCE " + $f.Name + " (" + $f.FieldType.FullName + ")")
}

# === Part 4: 用已知成功的参数验证解密逻辑 ===
WL("")
WL("--- Part 4: Known working parameters test ---")
# From v11: calling mAS495kb4k internally computed a param that gave "------ws closed----"
# Let's find which index gives "------ws closed----"
for ($idx = 0; $idx -lt 10000; $idx++) {
    try {
        $r = $decMethod.Invoke($null, @($idx))
        if ($r -ne $null -and $r.ToString() -eq "------ws closed----") {
            WL("FOUND! kfW0Lx5YBq(" + $idx + ") = `"------ws closed----`"")
            break
        }
    } catch {}
}
if ($idx -ge 9999) { WL("'------ws closed----' not found in indices 0-9999") }

# Also search for other known patterns
$patterns = @(
    "ws closed",
    "connect",
    "wss://",
    "ws://",
    "socket",
    "transform",
    "hga",
    ".com"
)
foreach ($pat in $patterns) {
    for ($idx = 0; $idx -lt 5000; $idx++) {
        try {
            $r = $decMethod.Invoke($null, @($idx))
            if ($r -ne $null -and $r.ToString().Length -gt 0 -and $r.ToString().Length -lt 200) {
                if ($r.ToString() -match [regex]::Escape($pat)) {
                    WL("MATCH pattern '$pat' at index $idx : " + $r.ToString())
                }
            }
        } catch {}
    }
}

$sw.Close()
Write-Host "`nDONE! File: $outFile" -ForegroundColor Green
