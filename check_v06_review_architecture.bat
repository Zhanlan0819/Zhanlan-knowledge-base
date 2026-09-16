@echo off
setlocal
cd /d "%~dp0"
echo Checking internal stage patches...
node scripts\upgrade-v06-review-architecture.js --check
if errorlevel 1 goto :fail
echo Running lightweight presentation tests...
node --test tests\display-labels.test.js tests\user-presentation.test.js tests\stage-registry.test.js
if errorlevel 1 goto :fail
echo.
echo SUCCESS: v0.6 lightweight checks passed.
pause
exit /b 0
:fail
echo.
echo ERROR: v0.6 check failed.
pause
exit /b 1
