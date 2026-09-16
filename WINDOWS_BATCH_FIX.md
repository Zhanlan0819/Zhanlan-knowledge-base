# v0.4.1 Windows batch fix

If the previous Chinese-named BAT displayed garbled text or errors such as `cho is not recognized`, use the new ASCII-only scripts:

- `install_v04_single_orchestrator.bat`
- `restore_multi_skill.bat`

They contain ASCII commands only and Windows CRLF line endings.

Install flow:
1. Copy this overlay into the `knowledge-system` project root and overwrite/merge.
2. Double-click `install_v04_single_orchestrator.bat`.
3. Restart or refresh the host skill list.
4. Only `Knowledge Orchestrator` should remain visible from this knowledge-system skill group.

Manual equivalent:

```cmd
node scripts\consolidate-specialist-skills.js --apply
```
