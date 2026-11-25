@echo off
where python >nul 2>&1 || (
  echo Install Python 3 or run the static serving command in README.md.
  pause
  exit /b 1
)
python "%~dp0run_local.py" %*
if errorlevel 1 pause
