import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { WorkflowService } from '../src/workflow.js';
import { AgentRuntime } from '../src/agent-runtime.js';

const temp = prefix => fs.mkdtempSync(path.join(os.tmpdir(), prefix));
const cleanup = dir => fs.rmSync(dir, { recursive: true, force: true });

function runtimeProjectRoot() {
  const root = temp('kb-runtime-root-');
  fs.mkdirSync(path.join(root, 'skills', 'knowledge-router'), { recursive: true });
  fs.mkdirSync(path.join(root, 'schemas'), { recursive: true });
  fs.writeFileSync(path.join(root, 'skills', 'knowledge-router', 'SKILL.md'), '# Router\nReturn the router JSON only.');
  fs.copyFileSync(new URL('../schemas/workflow-artifacts.schema.json', import.meta.url),
    path.join(root, 'schemas', 'workflow-artifacts.schema.json'));
  return root;
}

test('AgentRuntime executes only the selected stage and stops at terminal state', () => {
  const store = temp('kb-runtime-store-');
  const projectRoot = runtimeProjectRoot();
  const service = new WorkflowService(store);
  const started = service.start({ bytes: Buffer.from('下周整理项目资料。'),
    annotations: { parts: [{ quote: '下周整理项目资料。', type: 'todo' }] } });
  const calls = [];
  const adapter = { id: 'fake-router-model', generate(request) {
    calls.push(request);
    return { assets: started.suggestion.assets, risk_flags: [] };
  } };
  const runtime = new AgentRuntime({ service, projectRoot, modelAdapter: adapter });
  const result = runtime.runUntilStop(started.run_id);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].stage, 'router');
  assert.match(calls[0].skill.path, /knowledge-router/);
  assert.equal(result.status, 'completed_nonknowledge');
  assert.equal(result.required_action, 'done');
  const state = service.loadState(started.run_id);
  const artifact = service.artifact(state, 'router');
  assert.equal(artifact.provenance.model, 'fake-router-model');
  assert.equal(artifact.provenance.runner, 'AgentRuntime/v0.3');
  cleanup(store); cleanup(projectRoot);
});
