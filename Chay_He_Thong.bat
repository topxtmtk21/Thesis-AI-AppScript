@echo off
taskkill /F /IM ngrok.exe >nul 2>&1
taskkill /F /IM python.exe >nul 2>&1
echo ==============================================================
echo ACADEMIC AI SYSTEM IS STARTING...
echo ==============================================================

echo 1. Starting Backend (FastAPI)...
start "Academic AI Backend" cmd /c "cd backend && python -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload"

echo 2. Starting Ngrok Tunnel...
start "Ngrok Tunnel" cmd /c "%LOCALAPPDATA%\Microsoft\WindowsApps\ngrok.exe http 8000"

echo 3. Syncing webhook URL...
python auto_ngrok.py

echo.
echo ==============================================================
echo YOU CAN MINIMIZE THIS WINDOW, BUT DO NOT CLOSE IT!
echo ==============================================================
pause
