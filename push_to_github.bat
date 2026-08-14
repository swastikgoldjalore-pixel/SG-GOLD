@echo off
setlocal enabledelayedexpansion

echo ============================================================
echo   卐 SWASTIK GOLD JALORE - GITHUB AUTO-PUSH ENGINE 卐
echo   Target Website: https://swastikgold.net/
echo ============================================================
echo.

cd /d "%~dp0"

:: SET YOUR DEFAULT REPO URL HERE (EDIT IF NEEDED)
set "DEFAULT_REPO=https://github.com/SwastikGold/swastikgold.git"

:: Check if git remote already exists
for /f "tokens=*" %%i in ('git remote get-url origin 2^>nul') do set "EXISTING_REMOTE=%%i"

if not "%EXISTING_REMOTE%"=="" (
    set "TARGET_REPO=%EXISTING_REMOTE%"
    echo [FOUND] Existing Git Remote URL: !TARGET_REPO!
    echo.
    set /p "USER_INPUT=Press ENTER to use this repo, or paste new GitHub URL: "
    if not "!USER_INPUT!"=="" set "TARGET_REPO=!USER_INPUT!"
) else (
    echo Enter your new Swastik Gold GitHub Repository URL
    echo (Example: https://github.com/YourUsername/YourRepo.git)
    echo.
    set /p "TARGET_REPO=Paste GitHub URL (or press Enter for default: %DEFAULT_REPO%): "
    if "!TARGET_REPO!"=="" set "TARGET_REPO=%DEFAULT_REPO%"
)

echo.
echo ============================================================
echo Target Repository: !TARGET_REPO!
echo ============================================================
echo.

echo [1/4] Initializing Local Git Repository...
if not exist ".git" git init

echo [2/4] Staging all files (api.php, .htaccess, app.js, website.html, etc.)...
git add -A

echo.
echo [3/4] Creating Commit...
git commit -m "Swastik Gold (swastikgold.net) - Universal Engine & GoDaddy API Update"

echo.
echo [4/4] Setting Branch 'main' and Linking Remote...
git branch -M main
git remote remove origin >nul 2>&1
git remote add origin !TARGET_REPO!

echo.
echo Pushing code to !TARGET_REPO! ...
git push -u origin main --force

echo.
if %ERRORLEVEL% equ 0 (
    echo ============================================================
    echo   ✔ SUCCESS! All files uploaded to GitHub!
    echo   Now GoDaddy cPanel Git Version Control will sync swastikgold.net!
    echo ============================================================
) else (
    echo ============================================================
    echo   Note: If push failed, please ensure Git credentials are saved
    echo   or you have write access to !TARGET_REPO!
    echo ============================================================
)

echo.
pause
