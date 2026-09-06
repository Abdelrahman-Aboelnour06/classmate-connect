@echo off
title Classmate Connect
cd /d "%~dp0"

echo Starting backend...
start "Backend" cmd /c "cd backend && npm run dev"

echo Starting frontend...
start "Frontend" cmd /c "npm run dev"

echo Waiting for frontend to be ready...
timeout /t 5 /nobreak >nul

echo Opening browser...
start http://localhost:8080

echo.
echo Classmate Connect is running!
echo   Frontend: http://localhost:8080
echo   Backend:  check backend terminal
echo.
echo Close this window to keep servers running,
echo or close the Backend/Frontend windows to stop them.
pause
