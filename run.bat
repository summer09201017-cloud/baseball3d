@echo off
REM baseball3d playtest. English-only, CRLF.
cd /d "%~dp0"
echo Starting 3D Baseball ...
if not exist "node_modules" call npm install
call npm run dev -- --open
pause
