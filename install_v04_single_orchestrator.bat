@echo off
setlocal
cd /d "%~dp0"

echo [Knowledge System] Installing single-orchestrator layout...
where node >nul 2>nul
if errorlevel 1 (
  echo ERROR: Node.js was not found in PATH.
  echo Install Node.js 20+ or open a terminal where node works, then run this file again.
  pause
  exit /b 1
)

if not exist "scripts\consolidate-specialist-skills.js" (
  echo ERROR: scripts\consolidate-specialist-skills.js was not found.
  echo Put this overlay in the knowledge-system project root first.
  pause
  exit /b 1
)

node "scripts\consolidate-specialist-skills.js" --apply
if errorlevel 1 (
  echo.
  echo ERROR: Migration did not finish successfully.
  echo Do not delete _skill-migration-backup. Review the error above.
  pause
  exit /b 1
)

echo.
echo SUCCESS: Specialist SKILL.md files are now internal STAGE.md files.
echo Only Knowledge Orchestrator should remain visible from this skill group.
echo Restart or refresh the host skill list now.
pause
endlocal
