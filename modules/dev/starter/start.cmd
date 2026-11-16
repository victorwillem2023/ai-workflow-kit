@echo off
rem {{PROJECT}} on Windows, plain built run: installs on first run, builds, starts.
setlocal
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo {{PROJECT}} needs Node.js 26 or newer. Get the installer from https://nodejs.org and run this again.
  pause
  exit /b 1
)
rem the kit pins Node 26 (.tool-versions); an older one fails later with an unclear message
for /f "tokens=1 delims=v." %%v in ('node -v') do set NODE_MAJOR=%%v
if %NODE_MAJOR% LSS 26 (
  echo {{PROJECT}} needs Node.js 26 or newer; this computer has version %NODE_MAJOR%. Get the installer from https://nodejs.org and run this again.
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
