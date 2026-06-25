@echo off
title VAG TOS Sync
echo.
echo  ==========================================
echo   Vigilant Alpha Group -- TOS Auto-Sync
echo  ==========================================
echo.

:: Find Python — try PATH first, then the known install location
set PYTHON=
where python >nul 2>&1 && set PYTHON=python
if "%PYTHON%"=="" (
    if exist "C:\Users\User\AppData\Local\Python\pythoncore-3.14-64\python.exe" (
        set PYTHON=C:\Users\User\AppData\Local\Python\pythoncore-3.14-64\python.exe
    )
)
if "%PYTHON%"=="" (
    echo  ERROR: Python not found.
    echo  Download it at https://www.python.org/downloads/
    echo  Make sure to check "Add Python to PATH" during install.
    pause
    exit /b 1
)

echo  Python found. Installing dependencies...
"%PYTHON%" -m pip install watchdog gitpython --quiet

echo.
echo  Starting sync... (close this window to stop)
echo.
"%PYTHON%" "%~dp0tos_sync.py"
pause
