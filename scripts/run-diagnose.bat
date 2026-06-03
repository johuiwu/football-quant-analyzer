@echo off
chcp 65001 >nul
echo Starting diagnose script...
echo.
cd /d "%~dp0.."
node scripts/diagnose-matches.cjs
if %errorlevel% neq 0 (
    echo.
    echo Script execution finished with error.
    pause
) else (
    echo.
    echo Script execution finished successfully.
    pause
)
