import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WorkflowService } from '../src/workflow-v063.js';
import { AgentRuntime } from '../src/agent-runtime.js';

const temp = prefix => fs.mkdtempSync(path.join(os.tmpdir(), prefix));
const cleanup = dir => fs.rmSync(dir, { recursive: true, force: true });
const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('AgentRuntime executes only the selected stage and stops at terminal state', () => {
  const store = temp('kb-runtime-store-');
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
  assert.match(calls[0].stage_instruction.path, /knowledge-orchestrator\/stages\/router\.md$/);
  assert.equal(result.status, 'completed_nonknowledge');
  assert.equal(result.required_action, 'done');
  const state = service.loadState(started.run_id);
  const artifact = service.artifact(state, 'router');
  assert.equal(artifact.provenance.model, 'fake-router-model');
  assert.equal(artifact.provenance.runner, 'AgentRuntime/v0.7.1');
  const delivery = path.join(store, 'deliveries', started.run_id, 'manifest.json');
  assert.equal(fs.existsSync(delivery), true);
  cleanup(store);
});
