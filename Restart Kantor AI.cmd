@echo off
cd /d "%~dp0"
node "%~dp0scripts\start.js" --restart --no-browser
if errorlevel 1 pause
