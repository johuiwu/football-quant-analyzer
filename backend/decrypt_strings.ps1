$exePath = [System.IO.Path]::GetTempPath() + "HgCeApp.exe"
$assembly = [System.Reflection.Assembly]::LoadFrom($exePath)
$bf = [System.Reflection.BindingFlags]::Public -bor [System.Reflection.BindingFlags]::NonPublic -bor [System.Reflection.BindingFlags]::Static -bor [System.Reflection.BindingFlags]::Instance -bor [System.Reflection.BindingFlags]::DeclaredOnly
$dt = $assembly.GetType("mjldbepFpfgR2sirhk.Kusbq8F7xd8hvTfPmi")
$kfMethod = $dt.GetMethod("kfW0Lx5YBq", $bf)

# 1. Try calling kfW0Lx5YBq with a range of int values to find URL-like strings
Write-Host "=== Decrypting kfW0Lx5YBq(0..200) ==="
for ($idx = 0; $idx -le 200; $idx++) {
    try {
        $result = $kfMethod.Invoke($null, @($idx))
        if ($result -and $result -match "ws://|wss://|http|\.com|\.net|socket|api|gismo|cdn|transform|live|match|corner|token|hga|crw|subscribe|betradar|sportradar|timelinedelta") {
            Write-Host "  [$idx] $result"
        }
    } catch {}
}

# 2. Also dump ALL decrypted strings to find interesting ones
Write-Host "`n=== All decrypted strings (0..200) ==="
for ($idx = 0; $idx -le 200; $idx++) {
    try {
        $result = $kfMethod.Invoke($null, @($idx))
        if ($result -and $result.Length -gt 2) {
            Write-Host "  [$idx] $result"
        }
    } catch {}
}
