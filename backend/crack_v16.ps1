# v16: 修复事件处理 + 直接调用MoveNext + Hook ClientWebSocket
$ErrorActionPreference = "Stop"
$tp = [System.IO.Path]::GetTempPath()
$exe = $tp + "HgCeApp.exe"
if (-not [System.IO.File]::Exists($exe)) { Copy-Item "d:\下载\黄瓜角球\黄瓜角球\HgCeApp.exe" $exe -Force }
$asm = [System.Reflection.Assembly]::LoadFrom($exe)
$bf = [System.Reflection.BindingFlags]::Public -bor [System.Reflection.BindingFlags]::NonPublic -bor [System.Reflection.BindingFlags]::Static -bor [System.Reflection.BindingFlags]::DeclaredOnly
$bfa = $bf -bor [System.Reflection.BindingFlags]::Instance
$bfall = $bfa -bor [System.Reflection.BindingFlags]::Public
$mod = $asm.ManifestModule

$outFile = Join-Path $tp "crack_v16.txt"
$sw = [System.IO.StreamWriter]::new($outFile, $false, [System.Text.UTF8Encoding]::new($true))

function WL($m) { $sw.WriteLine($m); Write-Host $m -ForegroundColor Yellow }

$wsType = $asm.GetType("HgCeApp.WSocketClientHelp")

WL("=== V16: Direct State Machine Execution + URI Interception ===")
WL("")

# === Part 1: 创建实例并直接调用HI548hsim5 ===
WL("--- Part 1: Direct async execution ---")
try {
    # Set up trace capture
    $traceOutput = New-Object System.Text.StringBuilder
    $tsw = [System.IO.StringWriter]::new($traceOutput)
    $listener = New-Object System.Diagnostics.TextWriterTraceListener($tsw)
    [System.Diagnostics.Trace]::Listeners.Add($listener)
    [System.Diagnostics.Trace]::AutoFlush = $true
    
    # Create instance
    $ctor = $wsType.GetConstructor(@([string]))
    $inst = $ctor.Invoke(@("https://www.hga038.com"))
    WL("Instance created")
    
    # Call HI548hsim5 (returns Task) 
    $asyncMethod = $wsType.GetMethod("HI548hsim5", $bfa)
    if ($asyncMethod -ne $null) {
        WL("Calling HI548hsim5...")
        
        # Use reflection to invoke - this should create and start the state machine
        $taskObj = $asyncMethod.Invoke($inst, @())
        WL("Task type: " + $taskObj.GetType().FullName)
        WL("Task: " + $taskObj.ToString())
        
        # Wait for task to complete or timeout
        $waited = 0
        $maxWaitMs = 5000
        while ($waited -lt $maxWaitMs) {
            $isCompletedProp = $taskObj.GetType().GetProperty("IsCompleted")
            if ($isCompletedProp -ne $null) {
                $isDone = $isCompletedProp.GetValue($taskObj)
                if ($isDone) { break }
            }
            Start-Sleep -Milliseconds 100
            $waited += 100
        }
        WL("Waited " + $waited + "ms")
        
        # Check task status
        $isC = $taskObj.GetType().GetProperty("IsCompleted").GetValue($taskObj)
        $isF = $taskObj.GetType().GetProperty("IsFaulted").GetValue($taskObj)
        $isCan = $taskObj.GetType().GetProperty("IsCanceled").GetValue($taskObj)
        WL("Task status: Completed=$isC Faulted=$isF Canceled=$isCan")
        
        if ($isF) {
            $exInfo = $taskObj.GetType().GetProperty("Exception").GetValue($taskObj)
            if ($exInfo -ne $null) {
                WL("Exception: " + $exInfo.GetType().FullName)
                $innerEx = $exInfo.GetType().GetProperty("InnerException").GetValue($exInfo)
                if ($innerEx -ne $null) {
                    WL("Inner: " + $innerEx.Message)
                    WL("Stack: " + $innerEx.StackTrace)
                    
                    # Look for WebSocket/Uri info in exception
                    $exStr = $innerEx.ToString()
                    WL("Full Exception:")
                    if ($exStr.Length -gt 2000) { $exStr = $exStr.Substring(0, 2000) + "..." }
                    WL($exStr)
                }
            }
        }
        
        # Get result
        $resultProp = $taskObj.GetType().GetProperty("Result")
        if ($resultProp -ne $null) {
            try {
                $resultVal = $resultProp.GetValue($taskObj)
                WL("Result: " + $resultVal)
            } catch {}
        }
    }
    
    # Dump all fields after attempt
    WL("")
    WL("--- Fields after execution ---")
    foreach ($f in $wsType.GetFields($bfa)) {
        try {
            $fv = $f.GetValue($inst)
            if ($fv -ne $null) {
                $fvs = $fv.ToString()
                if ($fvs.Length -gt 500) { $fvs = $fvs.Substring(0, 500) + "..." }
                WL("  " + $f.Name + " [" + $fv.GetType().Name + "] = " + $fvs)
            } else {
                WL("  " + $f.Name + " = null")
            }
        } catch {
            WL("  " + $f.Name + " = ERROR")
        }
    }
    
    # Get trace output
    [System.Diagnostics.Trace]::Flush()
    $traceStr = $traceOutput.ToString()
    [System.Diagnostics.Trace]::Listeners.Remove($listener)
    $tsw.Close()
    
    WL("")
    WL("=== TRACE OUTPUT (" + $traceStr.Length + " chars) ===")
    if ($traceStr.Length -gt 0) {
        WL($traceStr)
        
        # Save to file
        $tf = Join-Path $tp "v16_trace.txt"
        [System.IO.File]::WriteAllText($tf, $traceStr, [System.Text.UTF8Encoding]::new($true))
        WL("(saved to $tf)")
    } else {
        WL("(empty)")
    }
    
} catch {
    WL("FATAL ERROR: " + $_.Exception.Message)
    if ($_.Exception.InnerException) {
        WL("INNER: " + $_.Exception.InnerException.Message)
        WL("STACK: " + $_.Exception.InnerException.StackTrace)
    }
}

# === Part 2: 检查ClientWebSocket.Options字段 ===
WL("")
WL("--- Part 2: ClientWebSocket options inspection ---")
try {
    $ctor = $wsType.GetConstructor(@([string]))
    $inst2 = $ctor.Invoke(@("https://www.hga038.com"))
    
    # Get the ClientWebSocket field
    $cwsField = $wsType.GetField("Dkm4ivONPd", $bfa)
    $cws = $cwsField.GetValue($inst2)
    
    if ($cws -ne $null) {
        WL("ClientWebSocket type: " + $cws.GetType().FullName)
        WL("ClientWebSocket state: " + $cws.State)
        
        # Check Options property
        $optsProp = $cws.GetType().GetProperty("Options", [System.Reflection.BindingFlags]::Instance -bor [System.Reflection.BindingFlags]::Public)
        if ($optsProp -ne $null) {
            $opts = $optsProp.GetValue($cws)
            WL("Options type: " + $opts.GetType().FullName)
            
            # List option properties
            foreach ($op in $opts.GetType().GetProperties()) {
                try {
                    $ov = $op.GetValue($opts)
                    if ($ov -ne $null) {
                        $ovs = $ov.ToString()
                        if ($ovs.Length -gt 100) { $ovs = $ovs.Substring(0, 100) }
                        WL("  Option." + $op.Name + " = " + $ovs)
                    }
                } catch {}
            }
        }
        
        # Check other properties
        foreach ($cp in $cws.GetType().GetProperties([System.Reflection.BindingFlags]::Instance -bor [System.Reflection.BindingFlags]::Public -bor [System.Reflection.BindingFlags]::DeclaredOnly)) {
            try {
                $cv = $cp.GetValue($cws)
                if ($cv -ne $null) {
                    $cvs = $cv.ToString()
                    if ($cvs.Length -gt 150) { $cvs = $cvs.Substring(0, 150) }
                    WL("  CWS." + $cp.Name + " = " + $cvs)
                }
            } catch {}
        }
    }
} catch {
    WL("Error: " + $_.Exception.Message)
}

# === Part 3: 分析构造函数如何使用URL参数 ===
WL("")
WL("--- Part 3: Constructor IL analysis ---")
$ctorBody = $ctor.GetMethodBody()
$cil = $ctorBody.GetILAsByteArray()
WL("Constructor(String) IL length: " + $cil.Length)

# Disassemble constructor
$i = 0
while ($i -lt $cil.Length) {
    $op = $cil[$i]
    $line = "[" + $i.ToString("D4") + "] "
    $skip = 1
    
    switch ($op) {
        0x02 { $line += "ldarg.0(this)" }
        0x03 { $line += "ldarg.1(url)" }
        0x17 { 
            $stok = [BitConverter]::ToUInt32($cil,$i+1); 
            try { $ss = $mod.ResolveString($stok); $line += 'ldstr "'+$ss+'"' } catch { $line += "ldstr <tok:$stok>" }
            $skip = 5 
        }
        0x28 { 
            $ct = [BitConverter]::ToUInt32($cil,$i+1)
            try { 
                $cm = $mod.ResolveMethod($ct)
                $cps = ""; try { $cps = ($cm.GetParameters()|ForEach-Object{$_.ParameterType.Name}) -join "," } catch {}
                $line += "call " + $cm.DeclaringType.Name + "." + $cm.Name + "(" + $cps + ")"
            } catch { $line += "call <tok:$ct>" }
            $skip = 5 
        }
        0x7D { 
            $ft = [BitConverter]::ToUInt32($cil,$i+1)
            try { $ff = $mod.ResolveField($ft); $line += "stfld " + $ff.DeclaringType.Name + "." + $ff.Name } catch { $line += "stfld <tok:$ft>" }
            $skip = 5 
        }
        0x8B { 
            $ct = [BitConverter]::ToUInt32($cil,$i+1)
            try { 
                $ci = $mod.ResolveMethod($ct)
                $cps = ""; try { $cps = ($ci.GetParameters()|ForEach-Object{$_.ParameterType.Name}) -join "," } catch {}
                $line += "newobj " + $ci.DeclaringType.Name + ".ctor(" + $cps + ")"
            } catch { $line += "newobj <tok:$ct>" }
            $skip = 5 
        }
        default { 
            if ($op -eq 0x72 -and $i+4 -lt $cil.Length) {
                $stok = [BitConverter]::ToUInt32($cil,$i+1)
                try { $ss = $mod.ResolveString($stok); $line += 'ldstr "'+$ss+'"' } catch { $line += "ldstr <tok:$stok>" }
                $skip = 5
            } else {
                $line += "0x" + $op.ToString("X2")
            }
        }
    }
    WL("  " + $line)
    $i += $skip
}

# Also check Dn4RRvBMolSwZV3ZIcU (factory method)
WL("")
WL("--- Dn4RRvBMolSwZV3ZIcU factory method ---")
$factoryMethod = $wsType.GetMethod("Dn4RRvBMolSwZV3ZIcU", $bf)
if ($factoryMethod -ne $null) {
    $fb = $factoryMethod.GetMethodBody()
    $fil = $fb.GetILAsByteArray()
    WL("IL length: " + $fil.Length)
    for ($fi = 0; $fi -lt $fil.Length; $fi++) {
        $fop = $fil[$fi]
        if ($fop -eq 0x17 -or $fop -eq 0x72) {
            $fstok = [BitConverter]::ToUInt32($fil,$fi+1)
            try { 
                $fss = $mod.ResolveString($fstok) 
                WL("  ldstr[" + $fi + "] = '" + $fss + "'" )
            } catch {}
        }
    }
}

$sw.Close()
Write-Host "`nDONE! File: $outFile" -ForegroundColor Green
