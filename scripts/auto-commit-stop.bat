@echo off
powershell -Command "Get-Process pwsh, powershell | Where-Object { $_.MainWindowTitle -eq '' } | Stop-Process 2>$null; echo ???????PowerShell??"
