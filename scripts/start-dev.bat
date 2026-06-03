@echo off
chcp 65001 >nul
title Football Quant Analyzer - Dev Mode
echo ========================================
echo   足球竞彩量化分析系统 - 开发模式
echo ========================================
echo.
cd /d "%~dp0.."
echo Starting development server...
echo.
npm run dev
if %errorlevel% neq 0 (
    echo.
    echo Server stopped with error.
    pause
)
