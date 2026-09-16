@echo off
setlocal
cd /d "%~dp0"

echo [Knowledge System] Restoring multi-skill layout...
where node >nul 2>nul
if errorlevel 1 (
  echo ERROR: Node.js was not found in PATH.
  pause
  exit /b 1
)

if not exist "scripts\consolidate-specialist-skills.js" (
  echo ERROR: scripts\consolidate-specialist-skills.js was not found.
  pause
  exit /b 1
)

node "scripts\consolidate-specialist-skills.js" --restore
if errorlevel 1 (
  echo ERROR: Restore failed. Review the error above.
  pause
  exit /b 1
)

echo SUCCESS: Specialist STAGE.md files were restored to SKILL.md.
pause
endlocal
