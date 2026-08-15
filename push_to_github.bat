@echo off
echo ============================================================
echo   SWASTIK GOLD - GITHUB AUTO-PUSH (swastikgoldjalorepixel)
echo   GitHub Account: swastikgoldjalorepixel
echo   Email: swastikgoldjalore@gmail.com
echo   Official Production Domain: https://swastikgold.net/
echo ============================================================
echo.

cd /d "%~dp0"

echo [1/4] Initializing Local Git Repository...
git init

echo [2/4] Setting Git Credentials for swastikgoldjalorepixel...
git config user.name "swastikgoldjalorepixel"
git config user.email "swastikgoldjalore@gmail.com"

echo [3/4] Staging all portal, server, app & PC software files...
git add index.html styles.css app.js pc-client.html website.html server.js package.json vercel.json .htaccess ecosystem.config.js README.md push_to_github.bat manifest.json sw.js SwastikGold_PC_Desk.cs SwastikGold_App.cs SwastikGold_PC_Desk.exe SwastikGold_App.exe

git commit -m "Official Swastik Gold Project Production Release for swastikgoldjalorepixel"

echo [4/4] Setting Main Branch & Linking Remote Repository...
git branch -M main
git remote remove origin >nul 2>&1

echo Linking to GitHub Remote Repository...
git remote add origin https://github.com/swastikgoldjalorepixel/swastikgold.git

echo.
echo Pushing code to GitHub...
git push -u origin main --force

echo.
echo ============================================================
echo   SUCCESS! All files uploaded for swastikgoldjalorepixel
echo ============================================================
pause
