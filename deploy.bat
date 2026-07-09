@echo off
setlocal enabledelayedexpansion
title Exegetical Phrasing Editor — Deploy to GitHub

set GITHUB_USER=Kenobi1105
set REPO_NAME=exegetical-phrasing-editor
set REPO_URL=https://github.com/%GITHUB_USER%/%REPO_NAME%

echo.
echo ╔══════════════════════════════════════════════════╗
echo ║   Exegetical Phrasing Editor — Deploy to GitHub  ║
echo ╚══════════════════════════════════════════════════╝
echo.

:: ── Check git ─────────────────────────────────────────
where git >nul 2>&1
if errorlevel 1 (
    echo ❌ Git is not installed.
    echo    Download from: https://git-scm.com/download/win
    echo    Run the installer, then re-run this script.
    pause
    exit /b 1
)
echo ✅ Git found.

:: ── Ask for token ─────────────────────────────────────
echo.
echo 📋 You need a GitHub Personal Access Token.
echo    Follow these steps:
echo.
echo    1. Go to: https://github.com/settings/tokens/new
echo    2. Name it anything (e.g. Exegetical Editor)
echo    3. Set expiration to No expiration
echo    4. Under Select scopes, check only: repo
echo    5. Click Generate token
echo    6. Copy the token (starts with ghp_)
echo.
set /p GITHUB_TOKEN="Paste your GitHub token here and press Enter: "

if "!GITHUB_TOKEN!"=="" (
    echo ❌ No token entered. Exiting.
    pause
    exit /b 1
)
echo ✅ Token received.

:: ── Create repo if needed ─────────────────────────────
echo.
echo 🔍 Checking repository...

curl -s -o nul -w "%%{http_code}" ^
    -H "Authorization: token !GITHUB_TOKEN!" ^
    "https://api.github.com/repos/%GITHUB_USER%/%REPO_NAME%" > %TEMP%\httpcode.txt

set /p HTTP_CODE=<%TEMP%\httpcode.txt

if "!HTTP_CODE!"=="200" (
    echo ✅ Repository already exists.
) else (
    echo 📁 Creating repository...
    curl -s -X POST ^
        -H "Authorization: token !GITHUB_TOKEN!" ^
        -H "Content-Type: application/json" ^
        "https://api.github.com/user/repos" ^
        -d "{\"name\":\"%REPO_NAME%\",\"description\":\"Exegetical Phrasing Editor\",\"public\":true,\"auto_init\":false}" > %TEMP%\repores.txt
    echo ✅ Repository created.
)

:: ── Init git ──────────────────────────────────────────
cd /d "%~dp0"

if not exist ".git" (
    echo.
    echo 🔧 Initialising git...
    git init
    git branch -M main
    git remote add origin "https://%GITHUB_USER%:!GITHUB_TOKEN!@github.com/%GITHUB_USER%/%REPO_NAME%.git"
    echo ✅ Git initialised.
) else (
    git remote set-url origin "https://%GITHUB_USER%:!GITHUB_TOKEN!@github.com/%GITHUB_USER%/%REPO_NAME%.git"
    echo ✅ Git already initialised.
)

:: ── Stage and commit ──────────────────────────────────
echo.
echo 📦 Staging files...
git add -A

git diff --cached --quiet
if not errorlevel 1 (
    echo ℹ  No changes to commit.
) else (
    for /f "tokens=*" %%i in ('date /t') do set DSTR=%%i
    git commit -m "Update %DSTR%"
    echo ✅ Committed.
)

:: ── Push ──────────────────────────────────────────────
echo.
echo 🚀 Pushing to GitHub...
git push --force -u origin main
if errorlevel 1 (
    echo ❌ Push failed. Check your token and internet connection.
    pause
    exit /b 1
)
echo ✅ Push successful!

:: ── Enable Pages ──────────────────────────────────────
echo.
echo 🌐 Enabling GitHub Pages...
curl -s -X POST ^
    -H "Authorization: token !GITHUB_TOKEN!" ^
    -H "Content-Type: application/json" ^
    "https://api.github.com/repos/%GITHUB_USER%/%REPO_NAME%/pages" ^
    -d "{\"source\":{\"branch\":\"main\",\"path\":\"/\"}}" > nul 2>&1

echo ✅ GitHub Pages configured.

:: ── Done ──────────────────────────────────────────────
echo.
echo ╔══════════════════════════════════════════════════╗
echo ║                  🎉  DONE!                       ║
echo ╚══════════════════════════════════════════════════╝
echo.
echo   Your app will be live in 1-2 minutes at:
echo.
echo   https://%GITHUB_USER%.github.io/%REPO_NAME%
echo.
echo   To update in future, just double-click deploy.bat again.
echo.
pause
