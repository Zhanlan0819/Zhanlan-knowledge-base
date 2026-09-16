import test from 'node:test';
import assert from 'node:assert/strict';
import { buildStageReport, knowledgeProgress, knowledgeFunnel } from '../src/user-presentation.js';

function fakeState() {
  const names = ['intake','router','atomicizer','claims','family_builder','theme_builder','reconciler','distiller','proposal','canonical','skill_candidate','skill_builder','evaluator','skill_publish'];
  return { user_brief: '把外部资料中的可复用方法蒸馏出来', interaction: null, checkpoints: {},
    stages: Object.fromEntries(names.map(name => [name, { status: 'not_started', artifact_id: null }])) };
}

function fakeService(dataByStage) {
  return { artifact(_state, stage) { return { data: dataByStage[stage] }; } };
}

test('router report is decision-first and hides stable row-by-row review', () => {
  const state = fakeState();
  state.stages.router = { status: 'completed', artifact_id: 'r' };
  const service = fakeService({ router: { assets: [
    { id: 'a1', type: 'external', anchor: { start: 0, end: 20, quote: '外部课程完整材料' } },
    { id: 'a2', type: 'knowledge', anchor: { start: 2, end: 10, quote: '课程方法' } },
    { id: 'a3', type: 'todo', anchor: { start: 21, end: 25, quote: '待办' } }
  ], risk_flags: [] } });
  const report = buildStageReport(service, state, 'router');
  assert.equal(report.title, '第 1/7 阶段：内容分流');
  assert.match(report.summary, /3 条内容/);
  assert.ok(report.changes.includes('外部资料 1 条'));
  assert.ok(report.changes.some(x => /另外抽出 1 条可复用知识片段/.test(x)));
  assert.equal(report.needs_user_action, false);
  assert.equal(report.review_items.length, 0);
  assert.equal(JSON.stringify(report).includes('external='), false);
});

test('family report only surfaces actual merges, not all stable singletons', () => {
  const state = fakeState();
  for (const stage of ['router','claims','family_builder']) state.stages[stage] = { status: 'completed', artifact_id: stage };
  const service = fakeService({
    router: { assets: [{ type: 'knowledge' }, { type: 'knowledge' }, { type: 'knowledge' }] },
    claims: { claims: [
      { id: 'c1', statement: '定位要连接变现' },
      { id: 'c2', statement: '定位最终要回答怎么赚钱' },
      { id: 'c3', statement: '案例必须真实' }
    ] },
    family_builder: { families: [
      { id: 'f1', claim_ids: ['c1','c2'] },
      { id: 'f2', claim_ids: ['c3'] }
    ] }
  });
  const report = buildStageReport(service, state, 'family_builder');
  assert.match(report.summary, /真正发生合并的有 1 组/);
  assert.ok(report.changes.some(x => /定位要连接变现/.test(x)));
  assert.equal(report.needs_user_action, false);
});

test('theme checkpoint asks one high-value question', () => {
  const state = fakeState();
  state.stages.router = { status: 'completed', artifact_id: 'r' };
  state.stages.claims = { status: 'completed', artifact_id: 'c' };
  state.stages.family_builder = { status: 'completed', artifact_id: 'f' };
  state.stages.theme_builder = { status: 'completed', artifact_id: 't' };
  state.interaction = { status: 'waiting_continue', after_stage: 'theme_builder', next_stage: 'reconciler', reason: '主题检查', created_at: new Date().toISOString() };
  const service = fakeService({
    router: { assets: [{ type: 'knowledge' }] }, claims: { claims: [{ id: 'c1', statement: 'x' }] },
    family_builder: { families: [{ id: 'f1', claim_ids: ['c1'] }] },
    theme_builder: { themes: [{ id: 't1', name: '商业 IP 定位与破冰', central_question: '怎样从业务验证走到可信任的 IP？', family_ids: ['f1'] }], major_change: 'none' }
  });
  const report = buildStageReport(service, state, 'theme_builder');
  assert.equal(report.review_mode, 'milestone');
  assert.equal(report.needs_user_action, true);
  assert.match(report.decision_question, /只需要判断/);
  assert.match(report.prompt, /合并、拆分、改名或补充/);
});

test('progress exposes seven internal phases but does not imply seven approvals', () => {
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

test('funnel keeps one stable compression narrative', () => {
  const state = fakeState();
  for (const stage of ['router','atomicizer','claims','family_builder','theme_builder']) state.stages[stage] = { status: 'completed', artifact_id: stage };
  const service = fakeService({
    router: { assets: [{ type: 'knowledge' }, { type: 'external' }] },
    atomicizer: { atoms: [{}, {}, {}] }, claims: { claims: [{}, {}, {}] },
    family_builder: { families: [{}, {}] }, theme_builder: { themes: [{}] }
  });
  assert.equal(knowledgeFunnel(service, state), '2 条内容 → 1 条知识候选 → 3 个知识原子 → 3 条主张 → 2 个知识组 → 1 个主题');
});

test('user-facing review packet keys are Chinese', async () => {
  const { presentStageReport } = await import('../src/user-presentation.js');
  const packet = presentStageReport({ title: '第 4/7 阶段：主题整理', summary: '已整理为 5 个主题。',
    changes: ['商业 IP 定位与破冰'], attention: [], review_items: ['商业 IP 定位与破冰'],
    decision_question: '这些主题是否覆盖本轮目标？', background_note: '完整映射已折叠。', next: '确认后继续', prompt: '回复继续' });
  assert.deepEqual(Object.keys(packet), ['标题','结论','本阶段变化','需要你判断','你只需要判断','说明','下一步','如何回复']);
});
