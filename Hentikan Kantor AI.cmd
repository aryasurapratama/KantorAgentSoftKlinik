@echo off
cd /d "%~dp0"
node "%~dp0scripts\start.js" --stop
if errorlevel 1 pause
