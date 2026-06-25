@echo off
title VAG TOS Sync
echo.
echo  ==========================================
echo   Vigilant Alpha Group -- TOS Auto-Sync
echo  ==========================================
echo.
echo  Checking Python...
python --version >nul 2>&1
if errorlevel 1 (
    echo  ERROR: Python not found.
    echo  Download it at https://www.python.org/downloads/
    echo  Make sure to check "Add Python to PATH" during install.
    pause
    exit /b 1
)

echo  Installing dependencies...
pip install watchdog gitpython --quiet

echo.
echo  Starting sync... (close this window to stop)
echo.
python "%~dp0tos_sync.py"
pause
