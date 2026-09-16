import test from 'node:test';
import assert from 'node:assert/strict';
import { buildStageReport, knowledgeProgress } from '../src/user-presentation.js';

function fakeState() {
  const names = ['intake','router','atomicizer','claims','family_builder','theme_builder','reconciler','distiller','proposal','canonical','skill_candidate','skill_builder','evaluator','skill_publish'];
  return { stages: Object.fromEntries(names.map(name => [name, { status: 'not_started', artifact_id: null }])) };
}

function fakeService(dataByStage) {
  return { artifact(_state, stage) { return { data: dataByStage[stage] }; } };
}

test('router report shows Chinese asset types and concrete counts', () => {
  const state = fakeState();
  state.stages.router = { status: 'completed', artifact_id: 'x' };
  const service = fakeService({ router: { assets: [
    { type: 'knowledge', anchor: { quote: '知识一' } },
    { type: 'knowledge', anchor: { quote: '知识二' } },
    { type: 'todo', anchor: { quote: '待办一' } }
  ], risk_flags: [] } });
  const report = buildStageReport(service, state, 'router');
  assert.equal(report.title, '第 1/7 阶段：内容分流');
  assert.match(report.summary, /3 条内容/);
  assert.ok(report.details.includes('知识内容 2 条'));
  assert.ok(report.details.includes('待办行动 1 条'));
  assert.equal(JSON.stringify(report).includes('knowledge'), false);
});

test('progress exposes seven human phases', () => {
  const state = fakeState();
  state.stages.router.status = 'completed';
  state.stages.claims.status = 'completed';
  const progress = knowledgeProgress(state);
  assert.equal(progress.total, 7);
  assert.equal(progress.current, 3);
  assert.equal(progress.phases.length, 7);
  assert.match(progress.phases[0], /内容分流/);
  assert.match(progress.phases[1], /知识拆解/);
});
