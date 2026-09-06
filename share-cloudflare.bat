@echo off
setlocal EnableExtensions EnableDelayedExpansion
title Classmate Connect - Cloudflare Share

for %%I in ("%~dp0.") do set "ROOT=%%~fI"
pushd "%ROOT%" >nul 2>&1
if errorlevel 1 (
  echo [ERROR] Could not open project folder:
  echo %ROOT%
  pause
  exit /b 1
)

set "LOG_DIR=%ROOT%\.cloudflare-logs"
set "BACKEND_LOG=%LOG_DIR%\backend-tunnel.log"
set "FRONTEND_LOG=%LOG_DIR%\frontend-tunnel.log"

if not exist "%LOG_DIR%" mkdir "%LOG_DIR%"
del /q "%BACKEND_LOG%" "%FRONTEND_LOG%" 2>nul

where cloudflared >nul 2>&1
if errorlevel 1 (
  echo [ERROR] cloudflared was not found in PATH.
  echo Install it with: winget install --id Cloudflare.cloudflared
  pause
  exit /b 1
)

where npm >nul 2>&1
if errorlevel 1 (
  echo [ERROR] npm was not found in PATH.
  pause
  exit /b 1
)

echo [1/5] Starting backend on http://localhost:4000 ...
start "Classmate Backend" /D "%ROOT%" cmd /k "npm --prefix backend run dev"

echo [2/5] Starting backend Cloudflare tunnel ...
start "Classmate Tunnel Backend" /D "%ROOT%" cmd /k "cloudflared tunnel --url http://localhost:4000 --logfile ""%BACKEND_LOG%"" --loglevel info"
call :WaitForTunnelUrl "%BACKEND_LOG%" BACKEND_URL 75
if errorlevel 1 goto :fail

echo     Backend public URL: !BACKEND_URL!

echo [3/5] Starting frontend on http://localhost:8080 ...
start "Classmate Frontend" /D "%ROOT%" cmd /k "set ""VITE_API_BASE_URL=!BACKEND_URL!"" && npm run dev:frontend"

echo [4/5] Starting frontend Cloudflare tunnel ...
start "Classmate Tunnel Frontend" /D "%ROOT%" cmd /k "cloudflared tunnel --url http://localhost:8080 --logfile ""%FRONTEND_LOG%"" --loglevel info"
call :WaitForTunnelUrl "%FRONTEND_LOG%" FRONTEND_URL 75
if errorlevel 1 goto :fail

echo.
echo ==============================================================
echo Share this link with your friend:
echo !FRONTEND_URL!
echo ==============================================================
echo.
echo Keep these windows open: Backend, Frontend, and both Tunnel windows.
pause
exit /b 0

:WaitForTunnelUrl
setlocal
set "LOG_FILE=%~1"
set /a "MAX_WAIT=%~3"
set /a "ELAPSED=0"
set "URL="

:wait_loop
set "CF_LOG_PATH=%LOG_FILE%"
for /f "usebackq delims=" %%U in (`powershell -NoProfile -Command "$p=$env:CF_LOG_PATH; if (Test-Path -LiteralPath $p) { $m = Select-String -LiteralPath $p -Pattern 'https://[a-z0-9-]+\.trycloudflare\.com' -AllMatches | ForEach-Object { $_.Matches } | ForEach-Object { $_.Value } | Select-Object -First 1; if ($m) { $m } }"`) do (
  set "URL=%%U"
)
set "CF_LOG_PATH="

if defined URL goto :wait_done
if !ELAPSED! geq !MAX_WAIT! goto :wait_timeout

timeout /t 1 /nobreak >nul
set /a "ELAPSED+=1"
goto :wait_loop

:wait_done
endlocal & set "%~2=%URL%" & exit /b 0

:wait_timeout
echo [ERROR] Timed out waiting for Cloudflare URL in %~1
endlocal & exit /b 1

:fail
echo.
echo Startup did not complete.
echo Check the opened terminal windows for errors.
pause
exit /b 1
