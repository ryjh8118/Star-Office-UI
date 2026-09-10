@echo off
setlocal
rem Prefer the virtual environment that ships with this checkout, so a moved or
rem re-created Office worktree keeps launching its own Preview.
set "PREVIEW_PY=%~dp0.venv\Scripts\python.exe"
if not exist "%PREVIEW_PY%" set "PREVIEW_PY=E:\Renguin_AISystem\Star_Office_UI\.venv\Scripts\python.exe"
if not exist "%PREVIEW_PY%" set "PREVIEW_PY=python.exe"
"%PREVIEW_PY%" -B -X utf8 "%~dp0scripts\launch_preview.py" %*
if errorlevel 1 pause
