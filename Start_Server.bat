@echo off
title Swastik Gold Server Engine (v3.0.0)
cd /d "%~dp0"
echo ====================================================================
echo   卐 SWASTIK GOLD JALORE - HIGH SPEED SERVER ENGINE 卐
echo ====================================================================
echo.
echo 1. Starting Backend Engine on http://localhost:8080/ ...
echo 2. Opening Operator Control Desk in your default browser...
echo.

start "" "http://localhost:8080/pc-client.html"

"C:\Users\bkjew\AppData\Roaming\Antigravity\bin\agy-node.cmd" server.js
pause
