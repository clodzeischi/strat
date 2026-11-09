@echo off
rem Double-click to update and play Strat on Windows (runs play.ps1 next to this file).
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0play.ps1"
if errorlevel 1 pause
