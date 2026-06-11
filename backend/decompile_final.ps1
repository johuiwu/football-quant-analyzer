$exePath = [System.IO.Path]::GetTempPath() + "HgCeApp.exe"
$out = "C:\temp\decompile_result.txt"
$assembly = [System.Reflection.Assembly]::LoadFrom($exePath)
$bf = [System.Reflection.BindingFlags]::Public -bor [System.Reflection.BindingFlags]::NonPublic -bor [System.Reflection.BindingFlags]::Static -bor [System.Reflection.BindingFlags]::Instance -bor [System.Reflection.BindingFlags]::DeclaredOnly

$sb = [System.Text.StringBuilder]::new()

# 1. WSocketClientHelp fields
[void]$sb.AppendLine("=== WSocketClientHelp Fields ===")
$t = $assembly.GetType("HgCeApp.WSocketClientHelp")
foreach ($f in $t.GetFields($bf)) {
    [void]$sb.AppendLine("  $($f.FieldType.Name) $($f.Name)")
}

# 2. WSocketClientHelp methods with strings and calls
[void]$sb.AppendLine("`n=== WSocketClientHelp Methods ===")
foreach ($m in $t.GetMethods($bf)) {
    $body = $m.GetMethodBody()
    if ($body -eq $null) { continue }
    $il = $body.GetILAsByteArray()
    if ($il -eq $null) { continue }
    [void]$sb.AppendLine("  $($m.Name) (IL=$($il.Length))")
    for ($i = 0; $i -lt $il.Length; $i++) {
        if ($il[$i] -eq 0x72 -and $i + 4 -lt $il.Length) {
            $token = [BitConverter]::ToUInt32($il, $i + 1)
            try { $s = $assembly.ManifestModule.ResolveString($token); if ($s) { [void]$sb.AppendLine("    STR: $s") } } catch {}
        }
        if ($il[$i] -eq 0x28 -and $i + 4 -lt $il.Length) {
            $token = [BitConverter]::ToUInt32($il, $i + 1)
            try { $mi2 = $assembly.ManifestModule.ResolveMethod($token); if ($mi2 -ne $null) { [void]$sb.AppendLine("    CALL: $($mi2.DeclaringType.Name)::$($mi2.Name)") } } catch {}
        }
    }
}

# 3. Open state machine
[void]$sb.AppendLine("`n=== Open State Machine ===")
$openTypes = $assembly.GetTypes() | Where-Object { $_.Name -like "*Open*" -or $_.Name -like "*b__20*" }
foreach ($ot in $openTypes) {
    [void]$sb.AppendLine("Type: $($ot.Name)")
    foreach ($m in $ot.GetMethods($bf)) {
        $body = $m.GetMethodBody()
        if ($body -eq $null) { continue }
        $il = $body.GetILAsByteArray()
        if ($il -eq $null) { continue }
        [void]$sb.AppendLine("  $($m.Name) (IL=$($il.Length))")
        for ($i = 0; $i -lt $il.Length; $i++) {
            if ($il[$i] -eq 0x72 -and $i + 4 -lt $il.Length) {
                $token = [BitConverter]::ToUInt32($il, $i + 1)
                try { $s = $assembly.ManifestModule.ResolveString($token); if ($s) { [void]$sb.AppendLine("    STR: $s") } } catch {}
            }
            if ($il[$i] -eq 0x28 -and $i + 4 -lt $il.Length) {
                $token = [BitConverter]::ToUInt32($il, $i + 1)
                try { $mi2 = $assembly.ManifestModule.ResolveMethod($token); if ($mi2 -ne $null) { [void]$sb.AppendLine("    CALL: $($mi2.DeclaringType.Name)::$($mi2.Name)") } } catch {}
            }
        }
    }
}

# 4. Global class - all fields with runtime values
[void]$sb.AppendLine("`n=== Global Static Fields ===")
$gt = $assembly.GetType("HgCeApp.Global")
foreach ($f in $gt.GetFields($bf)) {
    $val = "(error)"
    try { $v = $f.GetValue($null); if ($v -ne $null) { $val = $v.ToString().Substring(0, [Math]::Min(300, $v.ToString().Length)) } else { $val = "(null)" } } catch { $val = $_.Exception.InnerException.Message }
    [void]$sb.AppendLine("  $($f.FieldType.Name) $($f.Name) = $val")
}

# 5. HgClass strings
[void]$sb.AppendLine("`n=== HgClass Methods (strings) ===")
$ht = $assembly.GetType("HgCeApp.HgClass")
foreach ($m in $ht.GetMethods($bf)) {
    $body = $m.GetMethodBody()
    if ($body -eq $null) { continue }
    $il = $body.GetILAsByteArray()
    if ($il -eq $null) { continue }
    $found = @()
    for ($i = 0; $i -lt $il.Length; $i++) {
        if ($il[$i] -eq 0x72 -and $i + 4 -lt $il.Length) {
            $token = [BitConverter]::ToUInt32($il, $i + 1)
            try { $s = $assembly.ManifestModule.ResolveString($token); if ($s) { $found += $s } } catch {}
        }
    }
    if ($found.Count -gt 0) {
        [void]$sb.AppendLine("  $($m.Name):")
        foreach ($s in $found) { [void]$sb.AppendLine("    $s") }
    }
}

# 6. Tool class strings
[void]$sb.AppendLine("`n=== Tool Methods (strings) ===")
$tt = $assembly.GetType("HgCeApp.Tool")
foreach ($m in $tt.GetMethods($bf)) {
    $body = $m.GetMethodBody()
    if ($body -eq $null) { continue }
    $il = $body.GetILAsByteArray()
    if ($il -eq $null) { continue }
    $found = @()
    for ($i = 0; $i -lt $il.Length; $i++) {
        if ($il[$i] -eq 0x72 -and $i + 4 -lt $il.Length) {
            $token = [BitConverter]::ToUInt32($il, $i + 1)
            try { $s = $assembly.ManifestModule.ResolveString($token); if ($s) { $found += $s } } catch {}
        }
    }
    if ($found.Count -gt 0) {
        [void]$sb.AppendLine("  $($m.Name):")
        foreach ($s in $found) { [void]$sb.AppendLine("    $s") }
    }
}

# 7. Kusbq8F7xd8hvTfPmi (decryptor) strings
[void]$sb.AppendLine("`n=== Kusbq8F7xd8hvTfPmi (Decryptor) Methods (strings) ===")
$dt = $assembly.GetType("HgCeApp.Kusbq8F7xd8hvTfPmi")
if ($dt -ne $null) {
    foreach ($m in $dt.GetMethods($bf)) {
        $body = $m.GetMethodBody()
        if ($body -eq $null) { continue }
        $il = $body.GetILAsByteArray()
        if ($il -eq $null) { continue }
        $found = @()
        for ($i = 0; $i -lt $il.Length; $i++) {
            if ($il[$i] -eq 0x72 -and $i + 4 -lt $il.Length) {
                $token = [BitConverter]::ToUInt32($il, $i + 1)
                try { $s = $assembly.ManifestModule.ResolveString($token); if ($s) { $found += $s } } catch {}
            }
        }
        if ($found.Count -gt 0) {
            [void]$sb.AppendLine("  $($m.Name):")
            foreach ($s in $found) { [void]$sb.AppendLine("    $s") }
        }
    }
}

# 8. FormMain strings
[void]$sb.AppendLine("`n=== FormMain Methods (strings) ===")
$ft = $assembly.GetType("HgCeApp.FormMain")
foreach ($m in $ft.GetMethods($bf)) {
    $body = $m.GetMethodBody()
    if ($body -eq $null) { continue }
    $il = $body.GetILAsByteArray()
    if ($il -eq $null) { continue }
    $found = @()
    for ($i = 0; $i -lt $il.Length; $i++) {
        if ($il[$i] -eq 0x72 -and $i + 4 -lt $il.Length) {
            $token = [BitConverter]::ToUInt32($il, $i + 1)
            try { $s = $assembly.ManifestModule.ResolveString($token); if ($s) { $found += $s } } catch {}
        }
    }
    if ($found.Count -gt 0) {
        [void]$sb.AppendLine("  $($m.Name):")
        foreach ($s in $found) { [void]$sb.AppendLine("    $s") }
    }
}

# 9. All URL/Network strings
[void]$sb.AppendLine("`n=== All URL/Network Strings ===")
$kw = "ws://|wss://|http://|https://|\.php|\.json|\.com|\.net|\.io|api|socket|websocket|gismo|timelinedelta|sportradar|betradar|hga|crw|cdn|subscribe|token|wager|transform|corner|match_|get_live|get_game"
foreach ($typ in $assembly.GetTypes()) {
    foreach ($m in $typ.GetMethods($bf)) {
        try {
            $body = $m.GetMethodBody()
            if ($body -eq $null) { continue }
            $il = $body.GetILAsByteArray()
            if ($il -eq $null) { continue }
            for ($i = 0; $i -lt $il.Length; $i++) {
                if ($il[$i] -eq 0x72 -and $i + 4 -lt $il.Length) {
                    $token = [BitConverter]::ToUInt32($il, $i + 1)
                    try { $s = $assembly.ManifestModule.ResolveString($token); if ($s -and ($s -match $kw)) { [void]$sb.AppendLine("  [$($typ.Name)::$($m.Name)] $s") } } catch {}
                }
            }
        } catch {}
    }
}

$sb.ToString() | Out-File -FilePath $out -Encoding utf8
Write-Host "Done. Output: $out"
