@echo off
setlocal
set ROOT=%~dp0
set BACKEND_PORT=8000
set FRONTEND_PORT=3000

echo Freeing port %BACKEND_PORT%...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":%BACKEND_PORT% " ^| findstr "LISTENING"') do taskkill /F /PID %%a >nul 2>&1

echo Freeing port %FRONTEND_PORT%...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":%FRONTEND_PORT% " ^| findstr "LISTENING"') do taskkill /F /PID %%a >nul 2>&1

start "meeting-assistant backend (%BACKEND_PORT%)" cmd /k "cd /d "%ROOT%backend" && uv run uvicorn app.main:app --host 0.0.0.0 --port %BACKEND_PORT%"
start "meeting-assistant frontend (%FRONTEND_PORT%)" cmd /k "cd /d "%ROOT%frontend" && pnpm dev"

endlocal
