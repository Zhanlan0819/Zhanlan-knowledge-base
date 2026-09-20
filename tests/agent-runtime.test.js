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


test('AgentRuntime runs knowledge completeness audit and rejects reference-only Proposal', () => {
  const store = temp('kb-runtime-completeness-');
  try {
    const service = new WorkflowService(store);
    const started = service.start({
      bytes: Buffer.from('卖点表需要完整展开。'),
      annotations: {
        parts: [{
          quote: '卖点表需要完整展开。',
          type: 'knowledge',
          family: '卖点表',
          theme: '直播产品塑造',
          central_question: '直播里怎样完整塑造产品价值？',
          inclusion: '卖点与价值塑造',
          exclusion: '无关内容'
        }],
        proposals: [{ text: '卖点表需要完整展开。', claim_parts: [0] }]
      }
    });
    const runId = started.run_id, x = started.suggestion;
    service.submit(runId, 'router', { assets: x.assets, risk_flags: [] });
    service.submit(runId, 'atomicizer', { atoms: x.atoms });
    service.submit(runId, 'claims', { claims: x.claims });
    service.submit(runId, 'family_builder', { families: x.families });
    service.submit(runId, 'theme_builder', { themes: x.themes, major_change: 'none' });
    service.submit(runId, 'reconciler', { relations: [], version_judgement: false });
    service.submit(runId, 'distiller', { distillations: [{
      id: 'dist_live',
      theme_id: x.themes[0].id,
      supporting_claim_ids: [x.claims[0].id],
      claim_dispositions: [{
        claim_id: x.claims[0].id,
        treatment: 'included',
        reason: '当前主题核心知识。',
        destination: null
      }],
      named_structures: [{
        name: '卖点表',
        kind: 'table',
        source_claim_ids: [x.claims[0].id],
        required_for_theme: true,
        treatment: 'expanded_in_text',
        reason: '正式知识必须展开。'
      }],
      self_contained: true,
      text: '卖点表需要完整展开。',
      status: 'provisional'
    }] });

    const calls = [];
    const adapter = { id: 'fake-completeness-model', generate(request) {
      calls.push(request);
      if (request.protocol === 'knowledge-completeness-audit/v0.7.1') {
        return { items: [{
          proposal_id: x.proposals[0].id,
          verdict: 'revise',
          self_contained: false,
          missing_claim_ids: [],
          missing_structures: ['卖点表'],
          reference_only_gaps: ['正文只说“参考卖点表”，没有展开内容。'],
          reason: '隐藏 Sources 后无法独立使用。'
        }] };
      }
      return { proposals: [{ ...x.proposals[0], text: '卖点表可以作为参考，详见来源。' }] };
    } };

    const runtime = new AgentRuntime({ service, projectRoot, modelAdapter: adapter });
    const result = runtime.runOne(runId);
    assert.equal(result.status, 'failed');
    assert.match(result.error, /知识候选不完整/);
    assert.ok(calls.some(c => c.protocol === 'knowledge-completeness-audit/v0.7.1'));
    assert.equal(service.loadState(runId).stages.proposal.status, 'failed');
  } finally {
    cleanup(store);
  }
});
