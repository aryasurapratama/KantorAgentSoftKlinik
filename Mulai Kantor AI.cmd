@echo off
cd /d "%~dp0"
node "%~dp0scripts\start.js"
if errorlevel 1 pause
