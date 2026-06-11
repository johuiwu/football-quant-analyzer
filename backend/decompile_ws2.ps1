# HgCeApp.exe decompile - output to console only
$exePath = [System.IO.Path]::GetTempPath() + "HgCeApp.exe"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

try {
    $assembly = [System.Reflection.Assembly]::LoadFrom($exePath)
} catch {
    # Try short path
    $fso = New-Object -ComObject Scripting.FileSystemObject
    $shortPath = $fso.GetFile($exePath).ShortPath
    Write-Host "Trying short path: $shortPath"
    $assembly = [System.Reflection.Assembly]::LoadFrom($shortPath)
}

Write-Host "=== WSocketClientHelp ==="
$wsTypes = $assembly.GetTypes() | Where-Object { $_.Name -like "*WSocket*" }
foreach ($t in $wsTypes) {
    Write-Host "Type: $($t.FullName)"
    Write-Host "  BaseType: $($t.BaseType)"
    foreach ($f in $t.GetFields([System.Reflection.BindingFlags]::Public -bor [System.Reflection.BindingFlags]::NonPublic -bor [System.Reflection.BindingFlags]::Static -bor [System.Reflection.BindingFlags]::Instance)) {
        Write-Host "  Field: [$($f.Attributes)] $($f.FieldType.Name) $($f.Name)"
    }
    foreach ($m in $t.GetMethods([System.Reflection.BindingFlags]::Public -bor [System.Reflection.BindingFlags]::NonPublic -bor [System.Reflection.BindingFlags]::Instance -bor [System.Reflection.BindingFlags]::Static -bor [System.Reflection.BindingFlags]::DeclaredOnly)) {
        $params = ($m.GetParameters() | ForEach-Object { "$($_.ParameterType.Name)" }) -join ", "
        Write-Host "  Method: $($m.ReturnType.Name) $($m.Name)($params)"
        try {
            $body = $m.GetMethodBody()
            if ($body -ne $null) {
                $il = $body.GetILAsByteArray()
                if ($il -ne $null -and $il.Length -gt 0) {
                    Write-Host "    IL: $($il.Length) bytes"
                    for ($i = 0; $i -lt $il.Length; $i++) {
                        if ($il[$i] -eq 0x72 -and $i + 4 -lt $il.Length) {
                            $token = [BitConverter]::ToUInt32($il, $i + 1)
                            try {
                                $str = $assembly.ManifestModule.ResolveString($token)
                                if ($str) { Write-Host "    STR: $str" }
                            } catch {}
                        }
                    }
                    for ($i = 0; $i -lt $il.Length; $i++) {
                        if ($il[$i] -eq 0x28 -and $i + 4 -lt $il.Length) {
                            $token = [BitConverter]::ToUInt32($il, $i + 1)
                            try {
                                $mi = $assembly.ManifestModule.ResolveMethod($token)
                                if ($mi -ne $null) { Write-Host "    CALL: $($mi.DeclaringType.Name)::$($mi.Name)" }
                            } catch {}
                        }
                    }
                }
            }
        } catch {}
    }
}

Write-Host "`n=== Global (static fields) ==="
$globalTypes = $assembly.GetTypes() | Where-Object { $_.Name -eq "Global" }
foreach ($t in $globalTypes) {
    foreach ($f in $t.GetFields([System.Reflection.BindingFlags]::Public -bor [System.Reflection.BindingFlags]::NonPublic -bor [System.Reflection.BindingFlags]::Static)) {
        $val = "(unreadable)"
        try { $v = $f.GetValue($null); if ($v -ne $null) { $val = $v.ToString() } else { $val = "(null)" } } catch {}
        Write-Host "  $($f.FieldType.Name) $($f.Name) = $val"
    }
    foreach ($m in $t.GetMethods([System.Reflection.BindingFlags]::Public -bor [System.Reflection.BindingFlags]::NonPublic -bor [System.Reflection.BindingFlags]::Static -bor [System.Reflection.BindingFlags]::DeclaredOnly)) {
        $params = ($m.GetParameters() | ForEach-Object { "$($_.ParameterType.Name)" }) -join ", "
        try {
            $body = $m.GetMethodBody(); if ($body -eq $null) { continue }
            $il = $body.GetILAsByteArray(); if ($il -eq $null) { continue }
            $hasStr = $false
            for ($i = 0; $i -lt $il.Length; $i++) {
                if ($il[$i] -eq 0x72 -and $i + 4 -lt $il.Length) {
                    $token = [BitConverter]::ToUInt32($il, $i + 1)
                    try { $str = $assembly.ManifestModule.ResolveString($token); if ($str) { if (-not $hasStr) { Write-Host "  $($m.Name)($params):"; $hasStr = $true }; Write-Host "    STR: $str" } } catch {}
                }
            }
        } catch {}
    }
}

Write-Host "`n=== HgClass (strings) ==="
$hgTypes = $assembly.GetTypes() | Where-Object { $_.Name -eq "HgClass" }
foreach ($t in $hgTypes) {
    foreach ($f in $t.GetFields([System.Reflection.BindingFlags]::Public -bor [System.Reflection.BindingFlags]::NonPublic -bor [System.Reflection.BindingFlags]::Static)) {
        $val = "(unreadable)"
        try { $v = $f.GetValue($null); if ($v -ne $null) { $val = $v.ToString().Substring(0, [Math]::Min(200, $v.ToString().Length)) } else { $val = "(null)" } } catch {}
        Write-Host "  $($f.FieldType.Name) $($f.Name) = $val"
    }
    foreach ($m in $t.GetMethods([System.Reflection.BindingFlags]::Public -bor [System.Reflection.BindingFlags]::NonPublic -bor [System.Reflection.BindingFlags]::Static -bor [System.Reflection.BindingFlags]::DeclaredOnly)) {
        $params = ($m.GetParameters() | ForEach-Object { "$($_.ParameterType.Name)" }) -join ", "
        try {
            $body = $m.GetMethodBody(); if ($body -eq $null) { continue }
            $il = $body.GetILAsByteArray(); if ($il -eq $null) { continue }
            $hasStr = $false
            for ($i = 0; $i -lt $il.Length; $i++) {
                if ($il[$i] -eq 0x72 -and $i + 4 -lt $il.Length) {
                    $token = [BitConverter]::ToUInt32($il, $i + 1)
                    try { $str = $assembly.ManifestModule.ResolveString($token); if ($str) { if (-not $hasStr) { Write-Host "  $($m.Name)($params):"; $hasStr = $true }; Write-Host "    STR: $str" } } catch {}
                }
            }
        } catch {}
    }
}

Write-Host "`n=== Global Search: ws/url/network strings ==="
$kw = "ws://|wss://|websocket|WebSocket|gismo|timelinedelta|sportradar|betradar|hga050|crw066|transform|socket|subscribe|akamaized|cdn|\.php|\.json|http://|https://|wager|bet_|get_game|get_live|corner|Corners|match_|timeline|token|uid|session"
foreach ($t in $assembly.GetTypes()) {
    foreach ($m in $t.GetMethods([System.Reflection.BindingFlags]::Public -bor [System.Reflection.BindingFlags]::NonPublic -bor [System.Reflection.BindingFlags]::Static -bor [System.Reflection.BindingFlags]::Instance -bor [System.Reflection.BindingFlags]::DeclaredOnly)) {
        try {
            $body = $m.GetMethodBody(); if ($body -eq $null) { continue }
            $il = $body.GetILAsByteArray(); if ($il -eq $null) { continue }
            for ($i = 0; $i -lt $il.Length; $i++) {
                if ($il[$i] -eq 0x72 -and $i + 4 -lt $il.Length) {
                    $token = [BitConverter]::ToUInt32($il, $i + 1)
                    try { $str = $assembly.ManifestModule.ResolveString($token); if ($str -and ($str -match $kw)) { Write-Host "  [$($t.Name)::$($m.Name)] $str" } } catch {}
                }
            }
        } catch {}
    }
}

Write-Host "`n=== Tool class (strings) ==="
$toolTypes = $assembly.GetTypes() | Where-Object { $_.Name -eq "Tool" }
foreach ($t in $toolTypes) {
    foreach ($m in $t.GetMethods([System.Reflection.BindingFlags]::Public -bor [System.Reflection.BindingFlags]::NonPublic -bor [System.Reflection.BindingFlags]::Static -bor [System.Reflection.BindingFlags]::DeclaredOnly)) {
        $params = ($m.GetParameters() | ForEach-Object { "$($_.ParameterType.Name)" }) -join ", "
        try {
            $body = $m.GetMethodBody(); if ($body -eq $null) { continue }
            $il = $body.GetILAsByteArray(); if ($il -eq $null) { continue }
            $hasStr = $false
            for ($i = 0; $i -lt $il.Length; $i++) {
                if ($il[$i] -eq 0x72 -and $i + 4 -lt $il.Length) {
                    $token = [BitConverter]::ToUInt32($il, $i + 1)
                    try { $str = $assembly.ManifestModule.ResolveString($token); if ($str) { if (-not $hasStr) { Write-Host "  $($m.Name)($params):"; $hasStr = $true }; Write-Host "    STR: $str" } } catch {}
                }
            }
        } catch {}
    }
}

Write-Host "`n=== FormMain (strings) ==="
$formTypes = $assembly.GetTypes() | Where-Object { $_.Name -eq "FormMain" }
foreach ($t in $formTypes) {
    foreach ($m in $t.GetMethods([System.Reflection.BindingFlags]::Public -bor [System.Reflection.BindingFlags]::NonPublic -bor [System.Reflection.BindingFlags]::Static -bor [System.Reflection.BindingFlags]::Instance -bor [System.Reflection.BindingFlags]::DeclaredOnly)) {
        $params = ($m.GetParameters() | ForEach-Object { "$($_.ParameterType.Name)" }) -join ", "
        try {
            $body = $m.GetMethodBody(); if ($body -eq $null) { continue }
            $il = $body.GetILAsByteArray(); if ($il -eq $null) { continue }
            $hasStr = $false
            for ($i = 0; $i -lt $il.Length; $i++) {
                if ($il[$i] -eq 0x72 -and $i + 4 -lt $il.Length) {
                    $token = [BitConverter]::ToUInt32($il, $i + 1)
                    try { $str = $assembly.ManifestModule.ResolveString($token); if ($str) { if (-not $hasStr) { Write-Host "  $($m.Name)($params):"; $hasStr = $true }; Write-Host "    STR: $str" } } catch {}
                }
            }
        } catch {}
    }
}

Write-Host "`n=== Done ==="
