import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { loadStageInstruction, specialistVisibilityReport } from '../src/stage-registry.js';

const temp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'kb-registry-'));
const cleanup = dir => fs.rmSync(dir, { recursive: true, force: true });

function setup({ internal = true, legacy = false } = {}) {
  const root = temp();
  fs.mkdirSync(path.join(root, 'skills', 'knowledge-orchestrator'), { recursive: true });
  fs.mkdirSync(path.join(root, 'skills', 'knowledge-router'), { recursive: true });
  fs.writeFileSync(path.join(root, 'skills', 'knowledge-orchestrator', 'SKILL.md'), '# Orchestrator');
  fs.writeFileSync(path.join(root, 'skills', 'knowledge-orchestrator', 'stages.json'), JSON.stringify({
    schema_version: '0.4.0', stages: { router: { instruction: 'skills/knowledge-router/STAGE.md',
      legacy_skill: 'skills/knowledge-router/SKILL.md', include_raw: true, artifacts: [] } }
  }));
  if (internal) fs.writeFileSync(path.join(root, 'skills', 'knowledge-router', 'STAGE.md'), '# internal router');
  if (legacy) fs.writeFileSync(path.join(root, 'skills', 'knowledge-router', 'SKILL.md'), '# legacy router');
  return root;
}

test('single-orchestrator layout loads STAGE.md and exposes no specialist SKILL.md', () => {
  const root = setup({ internal: true, legacy: false });
  const instruction = loadStageInstruction('router', { projectRoot: root });
  assert.equal(instruction.path, 'skills/knowledge-router/STAGE.md');
  assert.equal(instruction.legacy_fallback, false);
  const report = specialistVisibilityReport({ projectRoot: root });
  assert.equal(report.single_orchestrator_ready, true);
  assert.deepEqual(report.visible_specialist_skill_files, []);
  cleanup(root);
});

test('legacy specialist SKILL.md remains a temporary runtime fallback', () => {
  const root = setup({ internal: false, legacy: true });
  const instruction = loadStageInstruction('router', { projectRoot: root });
  assert.equal(instruction.path, 'skills/knowledge-router/SKILL.md');
  assert.equal(instruction.legacy_fallback, true);
  assert.equal(specialistVisibilityReport({ projectRoot: root }).single_orchestrator_ready, false);
  cleanup(root);
});
