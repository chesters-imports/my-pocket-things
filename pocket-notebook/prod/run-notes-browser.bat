@echo off
cd /d "%~dp0notes_sys"
start "" http://127.0.0.1:43165/
python server.py
if errorlevel 1 pause
