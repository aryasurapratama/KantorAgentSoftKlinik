@echo off
cd /d "%~dp0"
node "%~dp0scripts\desktop.js" %*
if errorlevel 1 pause
