@echo off
rem {{PROJECT}} on Windows, plain built run: installs on first run, builds, starts.
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
call npm run build
if errorlevel 1 ( pause & exit /b 1 )
call npm start
pause
