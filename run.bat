@echo off
REM SMS Spam Intelligence Dashboard - one-click start for Windows
cd /d "%~dp0"

where python >nul 2>nul
if errorlevel 1 (
  echo Python was not found. Install Python 3.9+ from https://www.python.org and tick "Add Python to PATH".
  pause
  exit /b 1
)

if not exist venv (
  echo Creating virtual environment...
  python -m venv venv
)
call venv\Scripts\activate.bat

echo Installing / checking requirements...
python -m pip install --upgrade pip >nul
pip install -r requirements.txt
if errorlevel 1 (
  echo Package installation failed. Check your internet connection and try again.
  pause
  exit /b 1
)

REM open the browser a few seconds after the server starts
start "" cmd /c "timeout /t 6 >nul & start http://127.0.0.1:5000"

python app.py
pause
