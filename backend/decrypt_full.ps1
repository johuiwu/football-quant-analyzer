$exePath = [System.IO.Path]::GetTempPath() + "HgCeApp.exe"
$assembly = [System.Reflection.Assembly]::LoadFrom($exePath)
$bf = [System.Reflection.BindingFlags]::Public -bor [System.Reflection.BindingFlags]::NonPublic -bor [System.Reflection.BindingFlags]::Static -bor [System.Reflection.BindingFlags]::DeclaredOnly
$bfAll = [System.Reflection.BindingFlags]::Public -bor [System.Reflection.BindingFlags]::NonPublic -bor [System.Reflection.BindingFlags]::Static -bor [System.Reflection.BindingFlags]::Instance -bor [System.Reflection.BindingFlags]::DeclaredOnly
$dt = $assembly.GetType("mjldbepFpfgR2sirhk.Kusbq8F7xd8hvTfPmi")
$kfMethod = $dt.GetMethod("kfW0Lx5YBq", $bf)
$outPath = [System.IO.Path]::GetTempPath() + "decrypt_full.txt"
$utf8NoBom = [System.Text.UTF8Encoding]::new($false)
$sb = [System.Text.StringBuilder]::new()

# Helper: 解密并返回字符串
function Decrypt($idx) {
    try {
        $r = $kfMethod.Invoke($null, @([int]$idx))
        if ($r -eq $null) { return "" }
        return $r
    } catch { return "" }
}

# Helper: 从 IL 字节码中提取 kfW0Lx5YBq 调用及其参数
function FindKfCalls($typeName, $methodName) {
    $typ = $assembly.GetType($typeName)
    if ($typ -eq $null) { return }
    foreach ($m in $typ.GetMethods($bfAll)) {
        if ($methodName -ne "*" -and $m.Name -ne $methodName) { continue }
        $body = $m.GetMethodBody()
        if ($body -eq $null) { continue }
        $il = $body.GetILAsByteArray()
        if ($il -eq $null) { continue }
        for ($i = 0; $i -lt $il.Length; $i++) {
            if ($il[$i] -ne 0x28 -or $i + 4 -ge $il.Length) { continue }
            $token = [BitConverter]::ToUInt32($il, $i + 1)
            $mi2 = $null
            try { $mi2 = $assembly.ManifestModule.ResolveMethod($token) } catch { continue }
            if ($mi2 -eq $null -or $mi2.Name -ne "kfW0Lx5YBq") { continue }
            
            # 找到 kfW0Lx5YBq 调用，向前搜索 ldc.i4 参数
            $paramVal = -1
            for ($j = ($i - 1); $j -ge [Math]::Max(0, $i - 10); $j--) {
                $op = $il[$j]
                if ($op -ge 0x16 -and $op -le 0x1E) { $paramVal = $op - 0x16; break }
                if ($op -eq 0x1F -and $j + 1 -lt $il.Length) { $paramVal = $il[$j + 1]; break }
                if ($op -eq 0x20 -and $j + 4 -lt $il.Length) { $paramVal = [BitConverter]::ToInt32($il, $j + 1); break }
            }
            
            $dec = Decrypt $paramVal
            if ($dec -eq "") { $dec = "(empty)" }
            $line = "  $($typ.Name)::$($m.Name): kfW0Lx5YBq($paramVal) => $dec"
            [void]$sb.AppendLine($line)
        }
    }
}

# ========== Step 1: 大范围解密 ==========
[void]$sb.AppendLine("=== kfW0Lx5YBq Decryption (0-500) ===")
$count = 0
for ($idx = 0; $idx -le 500; $idx++) {
    $r = Decrypt $idx
    if ($r -ne "" -and $r.Length -gt 0) {
        [void]$sb.AppendLine("[$idx] $r")
        $count++
    }
}
[void]$sb.AppendLine("Total: $count results")
Write-Host "Step 1: $count decrypted strings"

# ========== Step 2: 分析所有类型中的 kfW0Lx5YBq 调用 ==========
[void]$sb.AppendLine("")
[void]$sb.AppendLine("=== All kfW0Lx5YBq Calls ===")
FindKfCalls "HgCeApp.WSocketClientHelp" "*"
FindKfCalls "HgCeApp.FormMain" "*"
FindKfCalls "HgCeApp.HgClass" "*"
FindKfCalls "HgCeApp.Tool" "*"
FindKfCalls "HgCeApp.Global" "*"

# 也搜索 Open 状态机
$openTypes = $assembly.GetTypes() | Where-Object { $_.Name -like "*Open*b__20*" }
foreach ($ot in $openTypes) {
    foreach ($m in $ot.GetMethods($bfAll)) {
        if ($m.Name -ne "MoveNext") { continue }
        $body = $m.GetMethodBody()
        if ($body -eq $null) { continue }
        $il = $body.GetILAsByteArray()
        if ($il -eq $null) { continue }
        for ($i = 0; $i -lt $il.Length; $i++) {
            if ($il[$i] -ne 0x28 -or $i + 4 -ge $il.Length) { continue }
            $token = [BitConverter]::ToUInt32($il, $i + 1)
            $mi2 = $null
            try { $mi2 = $assembly.ManifestModule.ResolveMethod($token) } catch { continue }
            if ($mi2 -eq $null -or $mi2.Name -ne "kfW0Lx5YBq") { continue }
            
            $paramVal = -1
            for ($j = ($i - 1); $j -ge [Math]::Max(0, $i - 10); $j--) {
                $op = $il[$j]
                if ($op -ge 0x16 -and $op -le 0x1E) { $paramVal = $op - 0x16; break }
                if ($op -eq 0x1F -and $j + 1 -lt $il.Length) { $paramVal = $il[$j + 1]; break }
                if ($op -eq 0x20 -and $j + 4 -lt $il.Length) { $paramVal = [BitConverter]::ToInt32($il, $j + 1); break }
            }
            
            $dec = Decrypt $paramVal
            if ($dec -eq "") { $dec = "(empty)" }
            [void]$sb.AppendLine("  $($ot.Name)::$($m.Name): kfW0Lx5YBq($paramVal) => $dec")
        }
    }
}

# ========== Step 3: 全局搜索所有类型 ==========
[void]$sb.AppendLine("")
[void]$sb.AppendLine("=== Global Search: All kfW0Lx5YBq Calls ===")
foreach ($typ in $assembly.GetTypes()) {
    foreach ($m in $typ.GetMethods($bfAll)) {
        $body = $m.GetMethodBody()
        if ($body -eq $null) { continue }
        $il = $body.GetILAsByteArray()
        if ($il -eq $null) { continue }
        for ($i = 0; $i -lt $il.Length; $i++) {
            if ($il[$i] -ne 0x28 -or $i + 4 -ge $il.Length) { continue }
            $token = [BitConverter]::ToUInt32($il, $i + 1)
            $mi2 = $null
            try { $mi2 = $assembly.ManifestModule.ResolveMethod($token) } catch { continue }
            if ($mi2 -eq $null -or $mi2.Name -ne "kfW0Lx5YBq") { continue }
            
            $paramVal = -1
            for ($j = ($i - 1); $j -ge [Math]::Max(0, $i - 10); $j--) {
                $op = $il[$j]
                if ($op -ge 0x16 -and $op -le 0x1E) { $paramVal = $op - 0x16; break }
                if ($op -eq 0x1F -and $j + 1 -lt $il.Length) { $paramVal = $il[$j + 1]; break }
                if ($op -eq 0x20 -and $j + 4 -lt $il.Length) { $paramVal = [BitConverter]::ToInt32($il, $j + 1); break }
            }
            
            $dec = Decrypt $paramVal
            if ($dec -eq "") { $dec = "(empty)" }
            [void]$sb.AppendLine("  $($typ.Name)::$($m.Name): kfW0Lx5YBq($paramVal) => $dec")
        }
    }
}

# ========== Step 4: 尝试实例化 WSocketClientHelp ==========
[void]$sb.AppendLine("")
[void]$sb.AppendLine("=== WSocketClientHelp Instantiation ===")
$wsType = $assembly.GetType("HgCeApp.WSocketClientHelp")
try {
    $wsInstance = [Activator]::CreateInstance($wsType, $true)
    [void]$sb.AppendLine("Instance created: $($wsInstance -ne $null)")
    foreach ($f in $wsType.GetFields($bfAll)) {
        try {
            $val = $f.GetValue($wsInstance)
            if ($val -ne $null) {
                $valStr = $val.ToString()
                if ($valStr.Length -gt 200) { $valStr = $valStr.Substring(0, 200) }
                [void]$sb.AppendLine("  $($f.Name) = $valStr")
            }
        } catch {}
    }
} catch {
    [void]$sb.AppendLine("Failed: $($_.Exception.Message)")
}

[IO.File]::WriteAllText($outPath, $sb.ToString(), $utf8NoBom)
Write-Host "Done. Output: $outPath"
