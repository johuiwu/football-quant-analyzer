# v11: 反编译异步状态机MoveNext + 模拟kfW0Lx5YBq参数计算 + 提取完整URL
$ErrorActionPreference = "Stop"
$tp = [System.IO.Path]::GetTempPath()
$exe = $tp + "HgCeApp.exe"
if (-not [System.IO.File]::Exists($exe)) { Copy-Item "d:\下载\黄瓜角球\黄瓜角球\HgCeApp.exe" $exe -Force }
$asm = [System.Reflection.Assembly]::LoadFrom($exe)
$bf = [System.Reflection.BindingFlags]::Public -bor [System.Reflection.BindingFlags]::NonPublic -bor [System.Reflection.BindingFlags]::Static -bor [System.Reflection.BindingFlags]::DeclaredOnly
$bfa = $bf -bor [System.Reflection.BindingFlags]::Instance
$bfall = $bfa -bor [System.Reflection.BindingFlags]::Public
$mod = $asm.ManifestModule

$outFile = Join-Path $tp "crack_v11.txt"
$sw = [System.IO.StreamWriter]::new($outFile, $false, [System.Text.UTF8Encoding]::new($true))

function WL($m) { $sw.WriteLine($m); Write-Host $m -ForegroundColor Green }

$wsType = $asm.GetType("HgCeApp.WSocketClientHelp")

WL("=== V11: Async State Machine Deep Dive ===")
WL("")

# === Part 1: 找到并反编译 <<Open>b__20_0>d 的MoveNext方法 ===
WL("--- Part 1: <<Open>b__20_0>d MoveNext full disassembly ---")
$nestedType = $null
foreach ($t in $asm.GetTypes()) {
    if ($t.DeclaringType -ne $null -and $t.DeclaringType.FullName -eq "HgCeApp.WSocketClientHelp" -and $t.Name -match "b__20_0") {
        $nestedType = $t
        WL("Found nested type: " + $t.FullName)
        break
    }
}

if ($nestedType -ne $null) {
    # List all fields of this nested type (state machine fields)
    WL("  Nested type fields:")
    foreach ($nf in $nestedType.GetFields($bfa)) {
        WL("    " + $nf.Name + " (" + $nf.FieldType.FullName + ")")
    }
    
    # Find MoveNext
    $moveNext = $nestedType.GetMethod("MoveNext", $bfa)
    if ($moveNext -ne $null) {
        $mb = $moveNext.GetMethodBody()
        $mil = $mb.GetILAsByteArray()
        WL("")
        WL("===== MoveNext (IL=" + $mil.Length + " bytes) =====")
        
        # Show locals
        $locals = $mb.LocalVariables
        if ($locals.Count -gt 0) {
            WL("  Locals:")
            for ($li = 0; $li -lt $locals.Count; $li++) {
                WL("    [$li] " + $locals[$li].LocalType.FullName)
            }
        }
        
        # Full disassembly with better opcode handling
        $i = 0
        while ($i -lt $mil.Length -and $i -lt 4000) {
            $op = $mil[$i]
            $line = "[" + $i.ToString("D4") + "] "
            $skip = 1
            
            # Single-byte opcodes first
            switch ($op) {
                0x00 { $line += "nop" }
                0x01 { $line += "break" }
                0x02 { $line += "ldarg.0" }
                0x03 { $line += "ldarg.1" }
                0x04 { $line += "ldarg.2" }
                0x05 { $line += "ldarg.3" }
                0x06 { $line += "ldnull" }
                0x07 { $line += "ldc.i4.M1" }
                { $_ -ge 0x08 -and $_ -le 0x10 } { $line += "ldc.i4." + ($_ - 8) }
                0x11 { 
                    $pv = $mil[$i+1]; $line += "ldc.i4.s " + $pv; $skip = 2 
                }
                0x12 { 
                    $pv = [BitConverter]::ToInt32($mil,$i+1); $line += "ldc.i4 " + $pv; $skip = 5 
                }
                0x14 { $line += "ldc.r4"; $skip = 5 }
                0x15 { $line += "ldc.r8"; $skip = 9 }
                0x17 { 
                    $stok = [BitConverter]::ToUInt32($mil,$i+1)
                    try { $ss = $mod.ResolveString($stok); $line += 'ldstr "' + $ss + '"' } catch { $line += "ldstr <tok:$stok>" }
                    $skip = 5 
                }
                0x18 { $line += "dup" }
                0x19 { $line += "pop" }
                0x1A { $line += "jmp"; $skip = 5 }
                0x1F { $line += "throw" }
                0x20 { 
                    $pv = [BitConverter]::ToInt32($mil,$i+1); $line += "ldc.i4 " + $pv; $skip = 5 
                }
                0x25 { $line += "dup" }
                0x26 { $line += "jmp"; $skip = 5 }
                0x28 { 
                    $ct = [BitConverter]::ToUInt32($mil,$i+1)
                    try {
                        $cm=$mod.ResolveMethod($ct)
                        $cps = ""
                        try { $cps = ($cm.GetParameters()|ForEach-Object{$_.ParameterType.Name}) -join "," } catch {}
                        $line += "call " + $cm.DeclaringType.Name + "." + $cm.Name + "(" + $cps + ")"
                    } catch { $line += "call <tok:$ct>" }
                    $skip = 5 
                }
                0x2A { $line += "ret" }
                0x2B { $tv=[sbyte]$mil[$i+1]; $line += "br.s " + ($i+$tv+2); $skip = 2 }
                0x2C { $tv=[sbyte]$mil[$i+1]; $line += "brfalse.s " + ($i+$tv+2); $skip = 2 }
                0x2D { $tv=[sbyte]$mil[$i+1]; $line += "brtrue.s " + ($i+$tv+2); $skip = 2 }
                0x2E { $tv=[sbyte]$mil[$i+1]; $line += "beq.s " + ($i+$tv+2); $skip = 2 }
                0x2F { $tv=[sbyte]$mil[$i+1]; $line += "bge.un.s " + ($i+$tv+2); $skip = 2 }
                0x30 { $tv=[sbyte]$mil[$i+1]; $line += "bgt.s " + ($i+$tv+2); $skip = 2 }
                0x33 { $tv=[sbyte]$mil[$i+1]; $line += "blt.un.s " + ($i+$tv+2); $skip = 2 }
                0x34 { $tv=[sbyte]$mil[$i+1]; $line += "ble.un.s " + ($i+$tv+2); $skip = 2 }
                0x35 { $tv=[sbyte]$mil[$i+1]; $line += "bne.un.s " + ($i+$tv+2); $skip = 2 }
                0x37 { $tv=[sbyte]$mil[$i+1]; $line += "bge.s " + ($i+$tv+2); $skip = 2 }
                0x38 { $line += "conv.u2"; $skip = 2 }  # might be wrong
                0x39 { $line += "conv.u1"; $skip = 2 }
                0x3A { $line += "conv.i2"; $skip = 2 }
                0x3B { $line += "conv.i1"; $skip = 2 }
                0x3C { $line += "conv.ovf.i4.un"; $skip = 2 }
                0x3D { $line += "???" }
                0x3E { $line += "???" }
                0x3F { $line += "???" }
                0x45 { $line += "conv.ovf.i1.un"; $skip = 2 }
                0x46 { $line += "conv.ovf.i2.un"; $skip = 2 }
                0x47 { $line += "conv.ovf.u2.un"; $skip = 2 }
                0x48 { $line += "conv.ovf.u4.un"; $skip = 2 }
                0x49 { $line += "conv.ovf.i8.un"; $skip = 2 }
                0x4A { $line += "???" }
                0x4B { $line += "???" }
                0x4C { $line += "???" }
                0x4D { $line += "???" }
                0x4E { $line += "???" }
                0x4F { $line += "???" }
                0x50 { $line += "???" }
                0x54 { $line += "???" }
                0x58 { $line += "???" }
                0x59 { $line += "???" }
                0x5D { $line += "???" }
                0x5E { $line += "unbox.any"; $skip = 5 }
                0x61 { $line += "lengther" } # actually this is wrong
                0x66 { $line += "div" }
                0x67 { $line += "rem" }
                0x68 { $line += "shr.un" }
                0x69 { $line += "shl" }
                0x6A { $line += "shr" }
                0x6B { $line += "neg" }
                0x6C { $line += "not" }
                0x6D { $line += "conv.i" }
                0x6E { $line += "conv.ovf.i" }
                0x6F { $line += "conv.ovf.u" }
                0x70 { $line += "???" }
                0x73 { $line += "newarr"; $skip = 5 }
                0x74 { $line += "ldelem"; $skip = 5 } # actually ldelem type
                0x75 { $line += "stelem" }
                0x76 { $line += "ldelem.i1" }
                0x77 { $line += "ldelem.u1" }
                0x78 { $line += "ldelem.i2" }
                0x79 { $line += "ldelem.u2" }
                0x7A { $line += "ldelem.i4" }
                0x7B { 
                    $ft = [BitConverter]::ToUInt32($mil,$i+1)
                    try { $ff = $mod.ResolveField($ft); $line += "ldfld " + $ff.DeclaringType.Name + "." + $ff.Name } catch { $line += "ldfld <tok:$ft>" }
                    $skip = 5 
                }
                0x7C { 
                    $ft = [BitConverter]::ToUInt32($mil,$i+1)
                    try { $ff = $mod.ResolveField($ft); $line += "ldsfld " + $ff.DeclaringType.Name + "." + $ff.Name } catch { $line += "ldsfld <tok:$ft>" }
                    $skip = 5 
                }
                0x7D { 
                    $ft = [BitConverter]::ToUInt32($mil,$i+1)
                    try { $ff = $mod.ResolveField($ft); $line += "stfld " + $ff.DeclaringType.Name + "." + $ff.Name } catch { $line += "stfld <tok:$ft>" }
                    $skip = 5 
                }
                0x7E { 
                    $ft = [BitConverter]::ToUInt32($mil,$i+1)
                    try { $ff = $mod.ResolveField($ft); $line += "stsfld " + $ff.DeclaringType.Name + "." + $ff.Name } catch { $line += "stsfld <tok:$ft>" }
                    $skip = 5 
                }
                0x7F { $line += "stsfld <tok>"; $skip = 5 }
                0x80 { $line += "ldarga.s"; $skip = 2 }
                0x82 { $line += "starg.s"; $skip = 2 }
                0x83 { $line += "???" }
                0x85 { $line += "???" }
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
                0x8C { $line += "throw" }
                0x8D { $line += "ldflda"; $skip = 5 }
                0x8E { $line += "ldsflda"; $skip = 5 }
                0x8F { $line += "???" }
                0x90 { $line += "???" }
                0x91 { $line += "???" }
                0x94 { $line += "???" }
                0x95 { $line += "???" }
                0x96 { $line += "???" }
                0x97 { $line += "???" }
                0x98 { $line += "???" }
                0x99 { $line += "???" }
                0x9A { $line += "???" }
                0x9B { $line += "???" }
                0x9C { $line += "???" }
                0x9D { $line += "???" }
                0x9E { $line += "???" }
                0x9F { $line += "???" }
                0xA0 { $line += "box"; $skip = 5 }
                0xA1 { $line += "???" }
                0xA2 { $line += "???" }
                0xA3 { $line += "???" }
                0xA4 { $line += "???" }
                0xA5 { $line += "???" }
                0xA6 { $line += "???" }
                0xA7 { $line += "???" }
                0xA8 { $line += "???" }
                0xA9 { $line += "???" }
                0xAA { $line += "???" }
                0xAB { $line += "???" }
                0xAC { $line += "???" }
                0xAD { $line += "???" }
                0xAE { $line += "???" }
                0xAF { $line += "???" }
                0xB0 { $line += "neg" } # might be wrong
                0xB1 { $line += "???" }
                0xB2 { $line += "???" }
                0xB3 { $line += "???" }
                0xB4 { $line += "???" }
                0xB5 { $line += "???" }
                0xB6 { $line += "???" }
                0xB7 { $line += "???" }
                0xB8 { $line += "???" }
                0xB9 { $line += "???" }
                0xBA { $line += "???" }
                0xBB { $line += "???" }
                0xBC { $line += "???" }
                0xBD { $line += "???" }
                0xBE { $line += "???" }
                0xBF { $line += "???" }
                0xC2 { $line += "callvirt"; $skip = 5 }
                0xC3 { $line += "cpobj"; $skip = 5 }
                0xC6 { $line += "ldind.i1" }
                0xC7 { $line += "ldind.u1" }
                0xC8 { $line += "ldind.i2" }
                0xC9 { $line += "ldind.u2" }
                0xCA { $line += "ldind.i4" }
                0xCB { $line += "ldind.i8" }
                0xCC { $line += "ldind.r4" }
                0xCD { $line += "ldind.r8" }
                0xCE { $line += "ldind.ref" }
                0xCF { $line += "stind.ref" }
                0xD0 { $line += "stind.i1" }
                0xD1 { $line += "stind.i2" }
                0xD2 { $line += "stind.i4" }
                0xD3 { $line += "stind.i8" }
                0xD4 { $line += "stind.r4" }
                0xD5 { $line += "stind.r8" }
                0xD6 { $line += "add" }
                0xD7 { $line += "sub" }
                0xD8 { $line += "mul" }
                0xD9 { $line += "div" }
                0xDA { $line += "rem" }
                0xDB { $line += "and" }
                0xDC { $line += "or" }
                0xDD { $line += "xor" }
                0xDE { $line += "shl" }
                0xDF { $line += "shr" }
                0xE0 { $line += "neg" }
                0xE1 { $line += "not" }
                0xE2 { $line += "conv.i1" }
                0xE3 { $line += "conv.i2" }
                0xE4 { $line += "conv.i4" }
                0xE5 { $line += "conv.i8" }
                0xE6 { $line += "conv.r4" }
                0xE7 { $line += "conv.r8" }
                0xE8 { $line += "conv.u4" }
                0xE9 { $line += "conv.u8" }
                0xEA { $line += "callvirt"; $skip = 5 }
                0xEB { $line += "cpobj"; $skip = 5 }
                0xFE { 
                    # Two-byte prefix opcodes
                    if ($i+1 -lt $mil.Length) {
                        $op2 = $mil[$i+1]
                        switch ($op2) {
                            0x00 { $line += "arglist"; $skip = 2 }
                            0x01 { $line += "ceq"; $skip = 2 }
                            0x02 { $line += "cgt"; $skip = 2 }
                            0x03 { $line += "cgt.un"; $skip = 2 }
                            0x04 { $line += "clt"; $skip = 2 }
                            0x05 { $line += "clt.un"; $skip = 2 }
                            0x06 { $line += "ldftn"; $skip = 6 }
                            0x07 { $line += "ldvirtftn"; $skip = 6 }
                            0x09 { $line += "ldtoken"; $skip = 6 }
                            0x0A { 
                                $tv = [BitConverter]::ToInt16($mil,$i+2); $line += "transient " + $tv; $skip = 4 
                            }
                            0x0B { 
                                $tv = [BitConverter]::ToInt32($mil,$i+2); $line += "initobj"; $skip = 6 
                            }
                            0x0C { 
                                $line += "constrained."; $skip = 6 
                            }
                            0x0D { $line += "cpblk"; $skip = 2 }
                            0x0E { $line += "initblk"; $skip = 2 }
                            0x0F { $line += "no."; $skip = 2 }
                            { $_ -ge 0x10 -and $_ -le 0x1F} { 
                                $line += "ldc.i4.s " + ([sbyte]$op2).ToString(); $skip = 2 
                            }
                            default { $line += "prefix_FE_" + $op2.ToString("X2"); $skip = 2 }
                        }
                    } else { $line += "FE??" }
                }
                default { 
                    # Check for common multi-byte patterns
                    if ($op -eq 0x72 -and $i+4 -lt $mil.Length) {
                        $stok = [BitConverter]::ToUInt32($mil,$i+1)
                        try { $ss = $mod.ResolveString($stok); $line += 'ldstr "' + $ss + '"' } catch { $line += "ldstr <tok:$stok>" }
                        $skip = 5
                    }
                    elseif ($op -eq 0x38 -or $op -eq 0x39 -or $op -eq 0x3A -or $op -eq 0x3B) {
                        $line += "conv." + $op.ToString("X2"); $skip = 2
                    }
                    elseif ($op -eq 0x61) {
                        $line += "lengther"; $skip = 2
                    }
                    else { $line += "0x" + $op.ToString("X2") }
                }
            }
            
            # Highlight important instructions
            if ($line -match "ConnectAsync|Uri|WebSocket|wss|ws:|kfW0|mAS49|Concat|ldstr.*http") {
                $line = "*** " + $line + " ***"
            }
            
            WL("  " + $line)
            $i += $skip
        }
    } else {
        WL("MoveNext not found!")
    }
}

# === Part 2: 解密关键索引并尝试不同编码输出 ===
WL("")
WL("--- Part 2: Targeted decrypt with multiple encodings ---")
$decType = $asm.GetType("mjldbepFpfgR2sirhk.Kusbq8F7xd8hvTfPmi")
$decMethod = $decType.GetMethod("kfW0Lx5YBq", $bf)

# From mAS495kb4k IL: the parameter is computed from -1790678625 and 1666712532
# Let's try these as-is and also try XOR/combination
$testParams = @(-1790678625, 1666712532, (-1790678625 -bxor 1666712532), ((-1790678625) + 1666712532))

foreach ($tp2 in $testParams) {
    try {
        $r = $decMethod.Invoke($null, @([int]$tp2))
        if ($r -ne $null -and $r.ToString().Length -gt 0) {
            $rawStr = $r.ToString()
            WL("kfW0Lx5YBq(" + $tp2 + ") len=" + $rawStr.Length)
            
            # Output raw chars as hex
            $chars = $rawStr.ToCharArray()
            $hexOut = ""
            $asciiOut = ""
            foreach ($ch in $chars) {
                $code = [int][char]$ch
                $hexOut += $code.ToString("X4") + " "
                if ($code -ge 32 -and $code -le 126) { $asciiOut += $ch } else { $asciiOut += "." }
            }
            WL("  HEX(UCS2): " + $hexOut.Substring(0, [Math]::Min(400, $hexOut.Length)))
            WL("  ASCII:     " + $asciiOut.Substring(0, [Math]::Min(200, $asciiOut.Length)))
        }
    } catch {}
}

# Also try small indices around where we saw URL-like content before
WL("")
WL("Trying indices 0-50 with ASCII filter:")
for ($idx = 0; $idx -lt 50; $idx++) {
    try {
        $r = $decMethod.Invoke($null, @($idx))
        if ($r -ne $null -and $r.ToString().Length -gt 0 -and $r.ToString().Length -lt 300) {
            $raw = $r.ToString()
            $hasAscii = $false
            foreach ($ch in $raw.ToCharArray()) {
                $code = [int][char]$ch
                if ($code -ge 32 -and $code -le 126) { $hasAscii = $true; break }
            }
            if ($hasAscii) {
                $asciiOnly = ""
                foreach ($ch in $raw.ToCharArray()) {
                    $code = [int][char]$ch
                    if ($code -ge 32 -and $code -le 126) { $asciiOnly += $ch } else { $asciiOnly += "[" + $code.ToString() + "]" }
                }
                WL("  [" + $idx + "] " + $asciiOnly)
            }
        }
    } catch {}
}

# === Part 3: 尝试用正确的参数调用mAS495kb4k并观察Trace输出 ===
WL("")
WL("--- Part 3: Runtime test with Trace listener ---")
try {
    # Set up a trace listener to capture Trace.WriteLine output
    $traceSW = [System.IO.StringWriter]::new()
    $listener = New-Object System.Diagnostics.TextWriterTraceListener($traceSW)
    [System.Diagnostics.Trace]::Listeners.Add($listener)
    
    $ctor = $wsType.GetConstructor(@([string]))
    $inst = $ctor.Invoke(@("https://www.hga038.com"))
    
    # Call mAS495kb4k which internally calls kfW0Lx5YBq then Trace.WriteLine
    $masResult = $wsType.GetMethod("mAS495kb4k", $bfa).Invoke($inst, @("https://www.hga038.com"))
    
    # Get trace output
    $traceOutput = $traceSW.ToString()
    WL("mAS495kb4k returned: " + $masResult)
    WL("Trace output length: " + $traceOutput.Length)
    if ($traceOutput.Length -gt 0) {
        $traceBytes = [System.Text.Encoding]::UTF8.GetBytes($traceOutput)
        WL("Trace UTF8 hex: " + ([BitConverter]::ToString($traceBytes)).Substring(0, [Math]::Min(400, ([BitConverter]::ToString($traceBytes)).Length)))
        WL("Trace raw: " + $traceOutput.Substring(0, [Math]::Min(500, $traceOutput.Length)))
    }
    
    [System.Diagnostics.Trace]::Listeners.Remove($listener)
    $traceSW.Close()
} catch {
    WL("Runtime trace test error: " + $_.Exception.Message)
    if ($_.Exception.InnerException) { WL("Inner: " + $_.Exception.InnerException.Message) }
}

$sw.Close()
Write-Host "`nDONE! File: $outFile" -ForegroundColor Green
