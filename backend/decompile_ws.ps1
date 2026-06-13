# HgCeApp.exe 反编译脚本 - 提取 WebSocket 相关方法的 IL 代码
$exePath = "d:\下载\黄瓜角球\黄瓜角球\HgCeApp.exe"
$outPath = "d:\下载\足球竞彩量化分析系统\足球竞彩量化分析系统\backend\decompile_ws_output.txt"

function Append-Output($text) {
    Add-Content -Path $outPath -Value $text -Encoding UTF8
}

Set-Content -Path $outPath -Value "=== HgCeApp.exe 反编译分析 ===" -Encoding UTF8
Append-Output "时间: $(Get-Date)"
Append-Output ""

$assembly = [System.Reflection.Assembly]::LoadFrom($exePath)

# 1. WSocketClientHelp 类
Append-Output "=== WSocketClientHelp 类 ==="
$wsTypes = $assembly.GetTypes() | Where-Object { $_.Name -like "*WSocket*" }
foreach ($t in $wsTypes) {
    Append-Output "Type: $($t.FullName)"
    Append-Output "  BaseType: $($t.BaseType)"
    Append-Output "  Fields:"
    foreach ($f in $t.GetFields([System.Reflection.BindingFlags]::Public -bor [System.Reflection.BindingFlags]::NonPublic -bor [System.Reflection.BindingFlags]::Static -bor [System.Reflection.BindingFlags]::Instance)) {
        Append-Output "    [$($f.Attributes)] $($f.FieldType.Name) $($f.Name)"
    }
    Append-Output "  Methods:"
    foreach ($m in $t.GetMethods([System.Reflection.BindingFlags]::Public -bor [System.Reflection.BindingFlags]::NonPublic -bor [System.Reflection.BindingFlags]::Instance -bor [System.Reflection.BindingFlags]::Static -bor [System.Reflection.BindingFlags]::DeclaredOnly)) {
        $params = ($m.GetParameters() | ForEach-Object { "$($_.ParameterType.Name)" }) -join ", "
        Append-Output "    $($m.ReturnType.Name) $($m.Name)($params)"
        try {
            $body = $m.GetMethodBody()
            if ($body -ne $null) {
                $il = $body.GetILAsByteArray()
                if ($il -ne $null -and $il.Length -gt 0) {
                    Append-Output "      IL Size: $($il.Length) bytes"
                    for ($i = 0; $i -lt $il.Length; $i++) {
                        if ($il[$i] -eq 0x72 -and $i + 4 -lt $il.Length) {
                            $token = [BitConverter]::ToUInt32($il, $i + 1)
                            try {
                                $str = $assembly.ManifestModule.ResolveString($token)
                                if ($str) { Append-Output "      STRING: $str" }
                            } catch {}
                        }
                    }
                    # 也提取 MemberRef/MethodRef/TypeRef tokens (call 指令)
                    for ($i = 0; $i -lt $il.Length; $i++) {
                        if (($il[$i] -eq 0x28 -or $il[$i] -eq 0x2A) -and $i + 4 -lt $il.Length) {
                            $token = [BitConverter]::ToUInt32($il, $i + 1)
                            try {
                                $mi = $assembly.ManifestModule.ResolveMethod($token)
                                if ($mi -ne $null) {
                                    Append-Output "      CALL: $($mi.DeclaringType.Name)::$($mi.Name)"
                                }
                            } catch {}
                        }
                    }
                }
            }
        } catch {}
    }
}

# 2. Global 类
Append-Output ""
Append-Output "=== Global 类 ==="
$globalTypes = $assembly.GetTypes() | Where-Object { $_.Name -eq "Global" }
foreach ($t in $globalTypes) {
    Append-Output "Type: $($t.FullName)"
    Append-Output "  Static Fields (with runtime values):"
    foreach ($f in $t.GetFields([System.Reflection.BindingFlags]::Public -bor [System.Reflection.BindingFlags]::NonPublic -bor [System.Reflection.BindingFlags]::Static)) {
        $val = "(unreadable)"
        try {
            $v = $f.GetValue($null)
            if ($v -ne $null) { $val = "$($v.GetType().Name): $v" }
            else { $val = "(null)" }
        } catch { $val = "(error: $_)" }
        Append-Output "    $($f.FieldType.Name) $($f.Name) = $val"
    }
    Append-Output "  Methods (strings only):"
    foreach ($m in $t.GetMethods([System.Reflection.BindingFlags]::Public -bor [System.Reflection.BindingFlags]::NonPublic -bor [System.Reflection.BindingFlags]::Static -bor [System.Reflection.BindingFlags]::DeclaredOnly)) {
        $params = ($m.GetParameters() | ForEach-Object { "$($_.ParameterType.Name)" }) -join ", "
        try {
            $body = $m.GetMethodBody()
            if ($body -eq $null) { continue }
            $il = $body.GetILAsByteArray()
            if ($il -eq $null) { continue }
            $strings = @()
            for ($i = 0; $i -lt $il.Length; $i++) {
                if ($il[$i] -eq 0x72 -and $i + 4 -lt $il.Length) {
                    $token = [BitConverter]::ToUInt32($il, $i + 1)
                    try {
                        $str = $assembly.ManifestModule.ResolveString($token)
                        if ($str) { $strings += $str }
                    } catch {}
                }
            }
            if ($strings.Count -gt 0) {
                Append-Output "    $($m.Name)($params):"
                foreach ($s in $strings) { Append-Output "      STRING: $s" }
            }
        } catch {}
    }
}

# 3. HgClass 类
Append-Output ""
Append-Output "=== HgClass 类 ==="
$hgTypes = $assembly.GetTypes() | Where-Object { $_.Name -eq "HgClass" }
foreach ($t in $hgTypes) {
    Append-Output "Type: $($t.FullName)"
    Append-Output "  Static Fields (with runtime values):"
    foreach ($f in $t.GetFields([System.Reflection.BindingFlags]::Public -bor [System.Reflection.BindingFlags]::NonPublic -bor [System.Reflection.BindingFlags]::Static)) {
        $val = "(unreadable)"
        try {
            $v = $f.GetValue($null)
            if ($v -ne $null) { $val = "$($v.GetType().Name): $($v.ToString().Substring(0, [Math]::Min(200, $v.ToString().Length)))" }
            else { $val = "(null)" }
        } catch { $val = "(error)" }
        Append-Output "    $($f.FieldType.Name) $($f.Name) = $val"
    }
    Append-Output "  Methods (strings only):"
    foreach ($m in $t.GetMethods([System.Reflection.BindingFlags]::Public -bor [System.Reflection.BindingFlags]::NonPublic -bor [System.Reflection.BindingFlags]::Static -bor [System.Reflection.BindingFlags]::DeclaredOnly)) {
        $params = ($m.GetParameters() | ForEach-Object { "$($_.ParameterType.Name)" }) -join ", "
        try {
            $body = $m.GetMethodBody()
            if ($body -eq $null) { continue }
            $il = $body.GetILAsByteArray()
            if ($il -eq $null) { continue }
            $strings = @()
            for ($i = 0; $i -lt $il.Length; $i++) {
                if ($il[$i] -eq 0x72 -and $i + 4 -lt $il.Length) {
                    $token = [BitConverter]::ToUInt32($il, $i + 1)
                    try {
                        $str = $assembly.ManifestModule.ResolveString($token)
                        if ($str) { $strings += $str }
                    } catch {}
                }
            }
            if ($strings.Count -gt 0) {
                Append-Output "    $($m.Name)($params):"
                foreach ($s in $strings) { Append-Output "      STRING: $s" }
            }
        } catch {}
    }
}

# 4. 全局搜索所有类型中的 WebSocket/URL/网络相关字符串
Append-Output ""
Append-Output "=== 全局搜索: WebSocket/URL/网络相关字符串 ==="
$keywords = "ws://|wss://|websocket|WebSocket|gismo|timelinedelta|sportradar|betradar|hga038|crw066|transform|socket|subscribe|akamaized|cdn|api\.|/api/|\.php|\.json|http://|https://|wager|bet_|get_game|get_live|corner|Corners|match_|timeline"
$allTypes = $assembly.GetTypes()
foreach ($t in $allTypes) {
    foreach ($m in $t.GetMethods([System.Reflection.BindingFlags]::Public -bor [System.Reflection.BindingFlags]::NonPublic -bor [System.Reflection.BindingFlags]::Static -bor [System.Reflection.BindingFlags]::Instance -bor [System.Reflection.BindingFlags]::DeclaredOnly)) {
        try {
            $body = $m.GetMethodBody()
            if ($body -eq $null) { continue }
            $il = $body.GetILAsByteArray()
            if ($il -eq $null) { continue }
            for ($i = 0; $i -lt $il.Length; $i++) {
                if ($il[$i] -eq 0x72 -and $i + 4 -lt $il.Length) {
                    $token = [BitConverter]::ToUInt32($il, $i + 1)
                    try {
                        $str = $assembly.ManifestModule.ResolveString($token)
                        if ($str -and ($str -match $keywords)) {
                            Append-Output "  [$($t.Name)::$($m.Name)] STRING: $str"
                        }
                    } catch {}
                }
            }
        } catch {}
    }
}

# 5. Tool 类（可能包含 URL 构建逻辑）
Append-Output ""
Append-Output "=== Tool 类 ==="
$toolTypes = $assembly.GetTypes() | Where-Object { $_.Name -eq "Tool" }
foreach ($t in $toolTypes) {
    Append-Output "Type: $($t.FullName)"
    foreach ($m in $t.GetMethods([System.Reflection.BindingFlags]::Public -bor [System.Reflection.BindingFlags]::NonPublic -bor [System.Reflection.BindingFlags]::Static -bor [System.Reflection.BindingFlags]::DeclaredOnly)) {
        $params = ($m.GetParameters() | ForEach-Object { "$($_.ParameterType.Name)" }) -join ", "
        try {
            $body = $m.GetMethodBody()
            if ($body -eq $null) { continue }
            $il = $body.GetILAsByteArray()
            if ($il -eq $null) { continue }
            $strings = @()
            for ($i = 0; $i -lt $il.Length; $i++) {
                if ($il[$i] -eq 0x72 -and $i + 4 -lt $il.Length) {
                    $token = [BitConverter]::ToUInt32($il, $i + 1)
                    try {
                        $str = $assembly.ManifestModule.ResolveString($token)
                        if ($str) { $strings += $str }
                    } catch {}
                }
            }
            if ($strings.Count -gt 0) {
                Append-Output "    $($m.Name)($params):"
                foreach ($s in $strings) { Append-Output "      STRING: $s" }
            }
        } catch {}
    }
}

# 6. FormMain 类（主窗体，可能初始化 WebSocket）
Append-Output ""
Append-Output "=== FormMain 类 (strings only) ==="
$formTypes = $assembly.GetTypes() | Where-Object { $_.Name -eq "FormMain" }
foreach ($t in $formTypes) {
    foreach ($m in $t.GetMethods([System.Reflection.BindingFlags]::Public -bor [System.Reflection.BindingFlags]::NonPublic -bor [System.Reflection.BindingFlags]::Static -bor [System.Reflection.BindingFlags]::Instance -bor [System.Reflection.BindingFlags]::DeclaredOnly)) {
        $params = ($m.GetParameters() | ForEach-Object { "$($_.ParameterType.Name)" }) -join ", "
        try {
            $body = $m.GetMethodBody()
            if ($body -eq $null) { continue }
            $il = $body.GetILAsByteArray()
            if ($il -eq $null) { continue }
            $strings = @()
            for ($i = 0; $i -lt $il.Length; $i++) {
                if ($il[$i] -eq 0x72 -and $i + 4 -lt $il.Length) {
                    $token = [BitConverter]::ToUInt32($il, $i + 1)
                    try {
                        $str = $assembly.ManifestModule.ResolveString($token)
                        if ($str) { $strings += $str }
                    } catch {}
                }
            }
            if ($strings.Count -gt 0) {
                Append-Output "    $($m.Name)($params):"
                foreach ($s in $strings) { Append-Output "      STRING: $s" }
            }
        } catch {}
    }
}

Append-Output ""
Append-Output "=== 完成 ==="
Write-Host "分析完成，输出已保存到: $outPath"
