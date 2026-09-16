@echo off
setlocal
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo ERROR: Node.js was not found in PATH.
  pause
  exit /b 1
)
node --test tests\display-labels.test.js tests\stage-registry.test.js
if errorlevel 1 (
  echo ERROR: Display-layer checks failed.
  pause
  exit /b 1
)
echo SUCCESS: Chinese display-layer checks passed.
pause
endlocal
