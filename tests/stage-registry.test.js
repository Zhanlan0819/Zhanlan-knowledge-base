import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { loadStageInstruction } from '../src/stage-registry.js';

const temp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'kb-registry-'));
const cleanup = dir => fs.rmSync(dir, { recursive: true, force: true });

function setup() {
  const root = temp();
  const stageDir = path.join(root, 'skills', 'knowledge-orchestrator', 'stages');
  fs.mkdirSync(stageDir, { recursive: true });
  fs.writeFileSync(path.join(root, 'skills', 'knowledge-orchestrator', 'SKILL.md'), '# Orchestrator');
  fs.writeFileSync(path.join(root, 'skills', 'knowledge-orchestrator', 'stages.json'), JSON.stringify({
    schema_version: '0.6.1', stages: { router: { instruction: 'skills/knowledge-orchestrator/stages/router.md',
      include_raw: true, artifacts: [], label_zh: '内容分流', review_policy: 'gate_only' } }
  }));
  fs.writeFileSync(path.join(stageDir, 'router.md'), '# internal router');
  return root;
}

test('single-orchestrator layout loads one internal stage instruction', () => {
  const root = setup();
  const instruction = loadStageInstruction('router', { projectRoot: root });
  assert.equal(instruction.path, 'skills/knowledge-orchestrator/stages/router.md');
  assert.equal(instruction.label_zh, '内容分流');
  assert.equal(instruction.review_policy, 'gate_only');
  cleanup(root);
});

test('missing internal stage instruction fails clearly', () => {
  const root = setup();
  fs.rmSync(path.join(root, 'skills', 'knowledge-orchestrator', 'stages', 'router.md'));
  assert.throws(() => loadStageInstruction('router', { projectRoot: root }), /找不到 router 内部阶段指令/);
  cleanup(root);
});
