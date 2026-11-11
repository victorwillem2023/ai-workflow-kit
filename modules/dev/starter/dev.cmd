@echo off
rem {{PROJECT}} on Windows, for working on it. Installs on first run, checks the packages and the port, then the dev
rem server: it restarts by itself when a source file changes (a git pull too), so a browser refresh shows the change.
setlocal
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo {{PROJECT}} needs Node.js 22 or newer. Get the LTS installer from https://nodejs.org and run this again.
  pause
  exit /b 1
)
if not exist node_modules (
  echo Installing dependencies ^(first run only^)...
  call npm install
  if errorlevel 1 ( pause & exit /b 1 )
)
if not exist .env (
  if exist .env.example copy .env.example .env >nul
)
rem new or changed packages after a pull are installed; a window already running the app is reported
call node scripts\dev-check.mjs
if errorlevel 1 ( pause & exit /b 1 )
echo.
echo Dev mode: after a git pull or an edit the server restarts by itself; refresh the browser to see it.
echo.
call npm run dev
pause
