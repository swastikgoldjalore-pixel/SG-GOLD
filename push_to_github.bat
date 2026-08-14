@echo off
echo ============================================================
echo   SWASTIK GOLD - GITHUB AUTO-PUSH (clsoni / sgtounch)
echo   GitHub Username: clsoni
echo   Repository Name: sgtounch
echo   Target URL: https://github.com/clsoni/sgtounch.git
echo ============================================================
echo.

cd /d "%~dp0"

echo [1/4] Initializing Local Git Repository...
git init

echo [2/4] Setting Git Credentials for clsoni...
git config user.name "clsoni"
git config user.email "champc111@gmail.com"

echo [3/4] Staging all portal, server, app & PC software files...
git add index.html styles.css app.js pc-client.html website.html server.js package.json vercel.json README.md push_to_github.bat manifest.json sw.js SwastikGold_PC_Desk.cs SwastikGold_App.cs SwastikGold_PC_Desk.exe SwastikGold_App.exe

git commit -m "Complete Swastik Gold Project Commit for clsoni/sgtounch"

echo [4/4] Setting Main Branch & Linking to clsoni/sgtounch Remote Repository...
git branch -M main
git remote remove origin >nul 2>&1

echo Linking to https://github.com/clsoni/sgtounch.git ...
git remote add origin https://github.com/clsoni/sgtounch.git

echo.
echo Pushing code to https://github.com/clsoni/sgtounch.git ...
git push -u origin main --force

echo.
echo ============================================================
echo   SUCCESS! All files uploaded to https://github.com/clsoni/sgtounch.git
echo ============================================================
pause
