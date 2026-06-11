$exePath = [System.IO.Path]::GetTempPath() + "HgCeApp.exe"
$assembly = [System.Reflection.Assembly]::LoadFrom($exePath)
$bf = [System.Reflection.BindingFlags]::Public -bor [System.Reflection.BindingFlags]::NonPublic -bor [System.Reflection.BindingFlags]::Static -bor [System.Reflection.BindingFlags]::DeclaredOnly
$dt = $assembly.GetType("mjldbepFpfgR2sirhk.Kusbq8F7xd8hvTfPmi")
$kfMethod = $dt.GetMethod("kfW0Lx5YBq", $bf)

$sb = [System.Text.StringBuilder]::new()
[void]$sb.AppendLine("=== kfW0Lx5YBq Decrypted Strings (0-200) ===")

for ($idx = 0; $idx -le 200; $idx++) {
    try {
        $result = $kfMethod.Invoke($null, @($idx))
        if ($result -and $result.Length -gt 0) {
            [void]$sb.AppendLine("[$idx] $result")
        }
    } catch {}
}

$outPath = [System.IO.Path]::GetTempPath() + "decrypt_result.txt"
$sb.ToString() | Out-File -FilePath $outPath -Encoding utf8
Write-Host "Done. Output: $outPath"
