@echo off
setlocal
cd /d "%~dp0"
node "%~dp0scripts\coding.js" %*
if errorlevel 1 pause
