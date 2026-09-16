import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { AgentRuntime } from '../src/agent-runtime.js';

const temp = prefix => fs.mkdtempSync(path.join(os.tmpdir(), prefix));
const cleanup = dir => fs.rmSync(dir, { recursive: true, force: true });

test('AgentRuntime prepares exactly one internal STAGE instruction', () => {
  const root = temp('kb-agent-root-');
  const store = temp('kb-agent-store-');
  fs.mkdirSync(path.join(root, 'skills', 'knowledge-orchestrator'), { recursive: true });
  fs.mkdirSync(path.join(root, 'skills', 'knowledge-router'), { recursive: true });
  fs.mkdirSync(path.join(root, 'schemas'), { recursive: true });
  fs.mkdirSync(path.join(store, 'raw'), { recursive: true });
  fs.writeFileSync(path.join(root, 'skills', 'knowledge-orchestrator', 'stages.json'), JSON.stringify({
    schema_version: '0.4.0', stages: { router: { instruction: 'skills/knowledge-router/STAGE.md',
      legacy_skill: 'skills/knowledge-router/SKILL.md', include_raw: true, artifacts: [] } }
  }));
  fs.writeFileSync(path.join(root, 'skills', 'knowledge-router', 'STAGE.md'), '# Router internal instruction');
  fs.writeFileSync(path.join(root, 'schemas', 'workflow-artifacts.schema.json'), JSON.stringify({
    $defs: { router: { type: 'object', properties: { assets: { type: 'array' }, risk_flags: { type: 'array' } } } }
  }));
  fs.writeFileSync(path.join(store, 'raw', 'raw_test.txt'), 'hello');
  const state = { run_id: 'wf_test', raw_id: 'raw_test', stages: { router: { status: 'not_started', version: 0, artifact_id: null } } };
  const service = {
    store,
    resume: () => ({ required_action: 'execute', next_stage: 'router', state }),
    artifact: () => { throw new Error('router should not need prior artifact'); },
    runDir: () => path.join(store, 'workflows', 'wf_test')
  };
  const runtime = new AgentRuntime({ service, projectRoot: root });
  const prepared = runtime.prepareStage('wf_test');
  assert.equal(prepared.runnable, true);
  assert.equal(prepared.request.protocol, 'knowledge-stage-request/v0.5.0');
  assert.equal(prepared.request.stage_instruction.path, 'skills/knowledge-router/STAGE.md');
  assert.equal(prepared.request.stage_instruction.legacy_fallback, false);
  assert.equal(prepared.request.context.raw_text, 'hello');
  assert.equal(Object.hasOwn(prepared.request, 'skill'), false);
  cleanup(root); cleanup(store);
});
