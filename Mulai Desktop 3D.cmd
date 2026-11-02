@echo off
cd /d "%~dp0"
node "%~dp0scripts\desktop.js" --3d
if errorlevel 1 pause
