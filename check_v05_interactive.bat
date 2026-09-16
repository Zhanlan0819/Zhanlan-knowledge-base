@echo off
setlocal
cd /d "%~dp0"
echo Checking v0.5 interactive Chinese presentation...
node --check src\workflow.js || goto :fail
node --check src\agent-runtime.js || goto :fail
node --check src\user-presentation.js || goto :fail
node --check src\workflow-cli.js || goto :fail
node --test tests\display-labels.test.js tests\user-presentation.test.js || goto :fail
echo.
echo PASS: v0.5 syntax and presentation tests passed.
echo Run npm test in the complete original project for full integration tests.
pause
exit /b 0
:fail
echo.
echo FAIL: Please copy the full error output and send it back.
pause
exit /b 1
