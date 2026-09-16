@echo off
setlocal
cd /d "%~dp0"
echo [1/3] Ensuring single-orchestrator layout...
node scripts\consolidate-specialist-skills.js --apply
if errorlevel 1 goto :fail
echo [2/3] Applying v0.6 decision-first stage rules...
node scripts\upgrade-v06-review-architecture.js --apply
if errorlevel 1 goto :fail
echo [3/3] Checking v0.6 stage rules...
node scripts\upgrade-v06-review-architecture.js --check
if errorlevel 1 goto :fail
echo.
echo SUCCESS: v0.6 review architecture installed.
echo Refresh/restart the host skill list before the next real run.
pause
exit /b 0
:fail
echo.
echo ERROR: v0.6 installation failed. Review the message above.
pause
exit /b 1
