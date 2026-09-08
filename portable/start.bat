@echo off
title ComPilot (Offline Portable)
cd /d "%~dp0"

echo ========================================================
echo       Starting ComPilot Offline / Portable Version
echo ========================================================
echo.

if exist "%~dp0node.exe" (
    set "NODE_CMD=%~dp0node.exe"
) else (
    where node >nul 2>nul
    if %ERRORLEVEL% equ 0 (
        set "NODE_CMD=node"
    ) else (
        echo [ERROR] node.exe was not found in this directory and Node.js is not installed on the system.
        pause
        exit /b 1
    )
)

echo Starting local server on http://localhost:3003 ...
echo Press Ctrl+C in this window to stop the server.
echo.

start "" http://localhost:3003
"%NODE_CMD%" server.js
pause
