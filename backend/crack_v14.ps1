# v14: 提取RSA解密器的核心数据结构 + 字典映射 + 数组内容 + 字符串缓存
$ErrorActionPreference = "Stop"
$tp = [System.IO.Path]::GetTempPath()
$exe = $tp + "HgCeApp.exe"
if (-not [System.IO.File]::Exists($exe)) { Copy-Item "d:\下载\黄瓜角球\黄瓜角球\HgCeApp.exe" $exe -Force }
$asm = [System.Reflection.Assembly]::LoadFrom($exe)
$bf = [System.Reflection.BindingFlags]::Public -bor [System.Reflection.BindingFlags]::NonPublic -bor [System.Reflection.BindingFlags]::Static -bor [System.Reflection.BindingFlags]::DeclaredOnly
$bfa = $bf -bor [System.Reflection.BindingFlags]::Instance
$mod = $asm.ManifestModule

$outFile = Join-Path $tp "crack_v14.txt"
$sw = [System.IO.StreamWriter]::new($outFile, $false, [System.Text.UTF8Encoding]::new($true))

function WL($m) { $sw.WriteLine($m); Write-Host $m -ForegroundColor Magenta }

$decType = $asm.GetType("mjldbepFpfgR2sirhk.Kusbq8F7xd8hvTfPmi")
$decMethod = $decType.GetMethod("kfW0Lx5YBq", $bf)

WL("=== V14: RSA Decryptor Data Structure Extraction ===")
WL("")

# === Part 1: 提取所有关键数据结构的内容 ===
WL("--- Part 1: Core data structures ---")
$fieldsToDump = @(
    @{ Name="zYk0TiUnA5"; Desc="64-element encrypted data array" },
    @{ Name="Q5G0VM7oIh"; Desc="Index mapping Dict<Int32,Int32>" },
    @{ Name="Yvb06Gk41k"; Desc="Decrypted string cache List<String>" },
    @{ Name="e560UAwmG2"; Desc="List<Int32>" },
    @{ Name="CMeF7IhgJA"; Desc="SortedList" },
    @{ Name="RsaFD7B1RJ"; Desc="Hashtable (RSA)" }
)

foreach ($fd in $fieldsToDump) {
    $f = $decType.GetField($fd.Name, $bf)
    if ($f -ne $null) {
        try {
            $fv = $f.GetValue($null)
            WL("")
            WL("=== " + $fd.Desc + " (" + $fd.Name + ") ===")
            
            if ($fv -eq $null) { WL("  NULL"); continue }
            
            $fvt = $fv.GetType()
            WL("  Type: " + $fvt.FullName)
            
            if ($fvt.IsArray) {
                WL("  Array Length: " + $fv.Length)
                # Dump all elements
                for ($ei = 0; $ei -lt $fv.Length; $ei++) {
                    $elem = $fv.GetValue($ei)
                    if ($elem -ne $null) {
                        $et = $elem.GetType()
                        if ($et.IsPrimitive -or $et -eq [string]) {
                            $es = $elem.ToString()
                            if ($es.Length -gt 200) { $es = $es.Substring(0, 200) + "..." }
                            WL("  [" + $ei.ToString("D2") + "] " + $et.Name + " = " + $es)
                        } elseif ($et.IsArray) {
                            $subArr = $elem
                            $subLen = $subArr.Length
                            WL("  [" + $ei.ToString("D2") + "] Array[" + $subLen + "]")
                            if ($subLen -le 100) {
                                $hexBytes = @()
                                for ($bi = 0; $bi -lt [Math]::Min(50, $subLen); $bi++) {
                                    $b = $subArr.GetValue($bi)
                                    if ($b -is [byte]) { $hexBytes += $b.ToString("X2") } else { $hexBytes += "?" }
                                }
                                WL("       Hex: " + ($hexBytes -join " "))
                                if ($subLen -gt 50) { WL("       ... (" + $subLen + " total)" ) }
                            }
                        } else {
                            WL("  [" + $ei.ToString("D2") + "] " + $et.Name)
                        }
                    } else {
                        WL("  [" + $ei.ToString("D2") + "] null")
                    }
                }
            }
            elseif ($fvt.IsGenericType) {
                $baseType = $fvt.GetGenericTypeDefinition().FullName
                WL("  Generic: " + $baseType)
                
                # Try to get Count
                $countProp = $fvt.GetProperty("Count")
                if ($countProp -ne $null) {
                    $cnt = $countProp.GetValue($fv)
                    WL("  Count: " + $cnt)
                    
                    # For Dictionary, dump all entries
                    if ($baseType -match "Dictionary") {
                        $keysProp = $fvt.GetProperty("Keys")
                        $valsProp = $fvt.GetProperty("Values")
                        if ($keysProp -ne $null -and $valsProp -ne $null) {
                            $keys = $keysProp.GetValue($fv)
                            $vals = $valsProp.GetValue($fv)
                            $dumpCount = [Math]::Min($cnt, 500)
                            for ($di = 0; $di -lt $dumpCount; $di++) {
                                $k = $keys.GetValue($di)
                                $v = $vals.GetValue($di)
                                WL("  [$di] Key=$k => Value=$v")
                            }
                            if ($cnt -gt 500) { WL("  ... and " + ($cnt - 500) + " more entries") }
                        }
                    }
                    
                    # For List, dump all items
                    if ($baseType -match "List") {
                        $itemProp = $fvt.GetProperty("Item", @([int]))
                        $dumpCount = [Math]::Min($cnt, 500)
                        for ($di = 0; $di -lt $dumpCount; $di++) {
                            try {
                                $item = $itemProp.GetValue($fv, @($di))
                                if ($item -ne $null) {
                                    $is = $item.ToString()
                                    if ($is.Length -gt 300) { $is = $is.Substring(0, 300) + "..." }
                                    WL("  [$di] " + $is)
                                } else {
                                    WL("  [$di] null")
                                }
                            } catch {}
                        }
                        if ($cnt -gt 500) { WL("  ... and " + ($cnt - 500) + " more items") }
                    }
                }
            }
            elseif ($fvt.FullName -match "SortedList|Hashtable") {
                # IDictionary
                $countProp = $fvt.GetProperty("Count")
                if ($countProp -ne $null) {
                    $cnt = $countProp.GetValue($fv)
                    WL("  Count: " + $cnt)
                    if ($cnt -gt 0 -and $cnt -lt 1000) {
                        $dictEnum = $fv.GetEnumerator()
                        $idx = 0
                        while ($dictEnum.MoveNext() -and $idx -lt 200) {
                            $k = $dictEnum.Key
                            $v = $dictEnum.Value
                            $vs = ""
                            if ($v -ne $null) { 
                                $vs = $v.ToString()
                                if ($vs.Length -gt 200) { $vs = $vs.Substring(0, 200) + "..." }
                            } else { $vs = "(null)" }
                            WL("  [$idx] $k => $vs")
                            $idx++
                        }
                        if ($cnt -gt 200) { WL("  ... and " + ($cnt - 200) + " more") }
                    }
                }
            }
            else {
                $fvs = $fv.ToString()
                if ($fvs.Length -gt 500) { $fvs = $fvs.Substring(0, 500) + "..." }
                WL("  Value: " + $fvs)
            }
        } catch {
            WL("  Error: " + $_.Exception.Message)
        }
    } else {
        WL("Field " + $fd.Name + " NOT FOUND")
    }
}

# === Part 2: 调用辅助方法L1x09lub0R ===
WL("")
WL("--- Part 2: Helper method L1x09lub0R ---")
$l1Method = $decType.GetMethod("L1x09lub0R", $bf)
if ($l1Method -ne $null) {
    $l1mb = $l1Method.GetMethodBody()
    $l1mil = $l1mb.GetILAsByteArray()
    WL("L1x09lub0R IL length: " + $l1mil.Length)
    
    # Show locals
    $locals = $l1mb.LocalVariables
    if ($locals.Count -gt 0) {
        WL("  Locals:")
        for ($li = 0; $li -lt $locals.Count; $li++) {
            WL("    [$li] " + $locals[$li].LocalType.FullName)
        }
    }
    
    # Try calling it with test values
    foreach ($testVal in @(0, 1, -1812113615, 1666712532, 26011301)) {
        try {
            $r = $l1Method.Invoke($null, @([object]$null, [int]$testVal))
            if ($r -ne $null) {
                $rs = $r.ToString()
                if ($rs.Length -gt 200) { $rs = $rs.Substring(0, 200) }
                WL("  L1x09lub0R(null, " + $testVal + ") = " + $rs)
            } else {
                WL("  L1x09lub0R(null, " + $testVal + ") = null")
            }
        } catch {
            WL("  L1x09lub0R(null, " + $testVal + ") ERROR: " + $_.Exception.Message)
        }
    }
}

# === Part 3: 调用UyPJuK1DPTsW8eYFCR.LPK9skTCQi() ===
WL("")
WL("--- Part 3: External method LPK9skTCQi ---")
$extType = $asm.GetType("UyPJuK1DPTsW8eYFCR")
if ($extType -ne $null) {
    WL("Found type: " + $extType.FullName)
    $extMethod = $extType.GetMethod("LPK9skTCQi", $bf)
    if ($extMethod -ne $null) {
        try {
            $er = $extMethod.Invoke($null, @())
            if ($er -ne $null) {
                $ers = $er.ToString()
                if ($ers.Length -gt 500) { $ers = $ers.Substring(0, 500) + "..." }
                WL("LPK9skTCQi() = " + $ers)
                
                # If it's an array, show details
                if ($er.GetType().IsArray) {
                    WL("  Array Length: " + $er.Length)
                    for ($ai = 0; $ai -lt [Math]::Min(20, $er.Length); $ai++) {
                        $ae = $er.GetValue($ai)
                        if ($ae -ne $null) {
                            $aes = $ae.ToString()
                            if ($aes.Length -gt 100) { $aes = $aes.Substring(0, 100) }
                            WL("  [$ai] " + $aes)
                        }
                    }
                }
            } else {
                WL("LPK9skTCQi() = null")
            }
        } catch {
            WL("LPK9skTCQi ERROR: " + $_.Exception.Message)
        }
    } else {
        WL("LPK9skTCQi method not found")
    }
    
    # List all methods of this type
    WL("  All methods:")
    foreach ($em in $extType.GetMethods($bf)) {
        $eps = ($em.GetParameters() | ForEach-Object { $_.ParameterType.Name }) -join ","
        WL("    " + $em.Name + "(" + $eps + ") -> " + $em.ReturnType.Name)
    }
} else {
    WL("Type UyPJuK1DPTsW8eYFCR not found!")
}

# === Part 4: 批量调用kfW0Lx5YBq并记录非空结果到文件 ===
WL("")
WL("--- Part 4: Full decrypt scan with raw byte output ---")
$rawOutFile = Join-Path $tp "decrypt_raw_bytes.txt"
$rsw = [System.IO.StreamWriter]::new($rawOutFile, $false, [System.Text.UTF8Encoding]::new($true))

$foundCount = 0
for ($idx = 0; $idx -lt 10000; $idx++) {
    try {
        $r = $decMethod.Invoke($null, @($idx))
        if ($r -ne $null -and $r.ToString().Length -gt 0) {
            $foundCount++
            $rawStr = $r.ToString()
            
            # Write as raw bytes
            $bytes = [System.Text.Encoding]::Unicode.GetBytes($rawStr)
            $hexLine = $idx.ToString("D5") + "|LEN=" + $rawStr.Length.ToString("D4") + "|" + ([BitConverter]::ToString($bytes)).Replace("-","")
            $rsw.WriteLine($hexLine)
            
            # Also write ASCII-filtered version
            $asciiOnly = ""
            foreach ($ch in $rawStr.ToCharArray()) {
                $code = [int][char]$ch
                if ($code -ge 32 -and $code -le 126) { $asciiOnly += $ch } else { $asciiOnly += "." }
            }
            $rsw.WriteLine("  ASCII: " + $asciiOnly)
        }
    } catch {}
}
$rsw.Close()
WL("Total non-empty results in 0-9999: " + $foundCount)
WL("Raw output saved to: " + $rawOutFile)

$sw.Close()
Write-Host "`nDONE! File: $outFile" -ForegroundColor Green
