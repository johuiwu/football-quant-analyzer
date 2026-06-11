# v7c: 大范围解密 kfW0Lx5YBq(0-5000)
$ErrorActionPreference = "Stop"
$tp = [System.IO.Path]::GetTempPath()
$exe = $tp + "HgCeApp.exe"
if (-not [System.IO.File]::Exists($exe)) { Copy-Item "d:\下载\黄瓜角球\黄瓜角球\HgCeApp.exe" $exe -Force }
$asm = [System.Reflection.Assembly]::LoadFrom($exe)
$bf = [System.Reflection.BindingFlags]::Public -bor [System.Reflection.BindingFlags]::NonPublic -bor [System.Reflection.BindingFlags]::Static -bor [System.Reflection.BindingFlags]::DeclaredOnly
$decType = $asm.GetType("mjldbepFpfgR2sirhk.Kusbq8F7xd8hvTfPmi")
$kfMeth = $decType.GetMethod("kfW0Lx5YBq", $bf)

$outFile = Join-Path $tp "decrypted_all.txt"
$sw = [System.IO.StreamWriter]::new($outFile, $false, [System.Text.UTF8Encoding]::new($true))

$count = 0
for ($i = 0; $i -le 5000; $i++) {
    try {
        $r = $kfMeth.Invoke($null, @([int]$i))
        if ($r -ne $null) {
            $s = [string]$r
            if ($s.Length -gt 0) {
                $count++
                $sw.WriteLine("=== kfW0Lx5YBq(" + $i + ") len=" + $s.Length + " ===")
                $sw.WriteLine($s)
                $sw.WriteLine("")
                if ($count -le 100) {
                    $d = $s
                    if ($d.Length -gt 150) { $d = $d.Substring(0,150) + "..." }
                    Write-Host ("  [" + $i + "] len=" + $s.Length) -ForegroundColor Cyan
                }
            }
        }
    }
    catch { }
}

$sw.WriteLine("Total non-empty: " + $count)
$sw.Close()
Write-Host ("Total non-empty strings: " + $count) -ForegroundColor Green
Write-Host ("File: " + $outFile) -ForegroundColor Green
