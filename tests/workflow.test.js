import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { WorkflowService } from '../src/workflow.js';

const bytes = fs.readFileSync(new URL('../fixtures/mixed.txt', import.meta.url));
const annotations = JSON.parse(fs.readFileSync(new URL('../fixtures/mixed.annotations.json', import.meta.url), 'utf8'));
const secret = 'test-review-secret-at-least-16';
const temp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'kb-workflow-'));
const cleanup = store => fs.rmSync(store, { recursive: true, force: true });

function started(store) {
  const service = new WorkflowService(store, { reviewerSecret: secret });
  const result = service.start({ bytes, annotations });
  return { service, result, runId: result.run_id, s: result.suggestion };
}

function completeDistillation(s, { id = 'distill_1', text = null, namedStructures = [] } = {}) {
  return {
    id,
    theme_id: s.themes[0].id,
    supporting_claim_ids: [s.claims[0].id],
    claim_dispositions: [{
      claim_id: s.claims[0].id,
      treatment: 'included',
      reason: '该 Claim 是当前 Theme 的直接知识内容。',
      destination: null
    }],
    named_structures: namedStructures,
    self_contained: true,
    text: text ?? s.proposals[0].text,
    status: 'provisional'
  };
}

function throughProposal(store) {
  const x = started(store);
  const { service, runId, s } = x;
  service.submit(runId, 'router', { assets: s.assets, risk_flags: [] });
  service.submit(runId, 'atomicizer', { atoms: s.atoms });
  service.submit(runId, 'claims', { claims: s.claims });
  service.submit(runId, 'family_builder', { families: s.families });
  service.submit(runId, 'theme_builder', { themes: s.themes, major_change: 'none' });
  service.submit(runId, 'reconciler', { relations: s.relations, version_judgement: false });
  service.submit(runId, 'distiller', { distillations: [completeDistillation(s)] });
  service.submit(runId, 'proposal', { proposals: s.proposals });
  return x;
}

function captureOutputs(service, runId) {
  return Object.fromEntries(['with_skill', 'without_skill', 'before', 'after'].map(variant => [variant,
    service.recordEvaluationOutput(runId, { caseId: 't1', variant,
      bytes: Buffer.from(`${variant}: sample actual output`) }).id]));
}

test('stage skipping and distillation before Theme are refused', () => {
  const store = temp();
  const { service, runId, s } = started(store);
  assert.throws(() => service.submit(runId, 'theme_builder', { themes: s.themes }), /STOP.*family_builder/);
  assert.throws(() => service.submit(runId, 'distiller', { distillations: [] }), /STOP.*reconciler/);
  assert.equal(service.loadState(runId).stages.theme_builder.status, 'not_started');
  cleanup(store);
});

test('invalid model JSON and extra fields fail a stage, retry only that stage', () => {
  const store = temp();
  const { service, runId, s } = started(store);
  assert.throws(() => service.submit(runId, 'router', '{oops'), /JSON/);
  assert.equal(service.loadState(runId).stages.router.status, 'failed');
  assert.throws(() => service.retry(runId, 'router', { assets: s.assets, risk_flags: [], invented: true }), /Schema/);
  assert.equal(service.loadState(runId).stages.router.status, 'failed');
  service.retry(runId, 'router', { assets: s.assets, risk_flags: [] });
  assert.equal(service.loadState(runId).stages.router.status, 'completed');
  assert.equal(service.loadState(runId).stages.intake.version, 1);
  cleanup(store);
});

test('model timeout is recorded as failed and duplicate completed generation is refused', () => {
  const store = temp();
  const { service, runId, s } = started(store);
  service.reportFailure(runId, 'router', { error: 'model timeout' });
  assert.equal(service.resume(runId).next_stage, 'router');
  service.retry(runId, 'router', { assets: s.assets, risk_flags: [] });
  assert.throws(() => service.submit(runId, 'router', { assets: s.assets, risk_flags: [] }), /已完成/);
  assert.equal(service.loadState(runId).stages.router.version, 1);
  cleanup(store);
});

test('Router cannot omit part of RAW and Atomicizer cannot omit knowledge', () => {
  const store = temp();
  const { service, runId, s } = started(store);
  assert.throws(() => service.submit(runId, 'router', { assets: s.assets.slice(0, 3), risk_flags: [] }),
    /未分流/);
  service.retry(runId, 'router', { assets: s.assets, risk_flags: [] });
  assert.throws(() => service.submit(runId, 'atomicizer', { atoms: [] }), /未全映射|至少要为每个知识资产提取一个原子/);
  assert.equal(service.loadState(runId).stages.atomicizer.status, 'failed');
  cleanup(store);
});

test('Theme graph requires exactly one primary Theme per Family', () => {
  const store = temp();
  const { service, runId, s } = started(store);
  service.submit(runId, 'router', { assets: s.assets, risk_flags: [] });
  service.submit(runId, 'atomicizer', { atoms: s.atoms });
  service.submit(runId, 'claims', { claims: s.claims });
  service.submit(runId, 'family_builder', { families: s.families });
  const t1 = s.themes[0];
  const t2 = { ...t1, id: 'theme_secondary_test', name: '另一个问题域',
    central_question: '另一个独立问题是什么？',
    primary_family_ids: [...t1.primary_family_ids] };
  assert.throws(() => service.submit(runId, 'theme_builder', {
    themes: [t1, t2], major_change: 'split_core'
  }), /恰好有一个主 Theme/);
  cleanup(store);
});

test('full-knowledge contract rejects silent Claim loss and reference-only named methods', () => {
  const store = temp();
  const source = Buffer.from('卖点表包含专业、人品、性价比、口碑、价格、服务、质量、效率、稀缺、方便、实力、附加值、体验感、生意好、环境、干净卫生。\n九点归一塑造法包含九种具体塑造方式，并配有五步成交法。');
  const service = new WorkflowService(store, { reviewerSecret: secret });
  const started = service.start({ bytes: source, annotations: {
    parts: [
      { quote: '卖点表包含专业、人品、性价比、口碑、价格、服务、质量、效率、稀缺、方便、实力、附加值、体验感、生意好、环境、干净卫生。',
        type: 'knowledge', family: '卖点表', theme: '直播产品塑造', central_question: '直播里怎样完整塑造产品价值？',
        inclusion: '产品卖点与价值塑造方法', exclusion: '无关直播运营' },
      { quote: '九点归一塑造法包含九种具体塑造方式，并配有五步成交法。',
        type: 'knowledge', family: '九点归一', theme: '直播产品塑造', central_question: '直播里怎样完整塑造产品价值？',
        inclusion: '产品卖点与价值塑造方法', exclusion: '无关直播运营' }
    ],
    relations: [],
    proposals: [{ text: '完整直播产品塑造知识。', claim_parts: [0, 1] }]
  }});
  const runId = started.run_id, x = started.suggestion;
  service.submit(runId, 'router', { assets: x.assets, risk_flags: [] });
  service.submit(runId, 'atomicizer', { atoms: x.atoms });
  service.submit(runId, 'claims', { claims: x.claims });
  service.submit(runId, 'family_builder', { families: x.families });
  service.submit(runId, 'theme_builder', { themes: x.themes, major_change: 'none' });
  service.submit(runId, 'reconciler', { relations: [], version_judgement: false });

  assert.throws(() => service.submit(runId, 'distiller', { distillations: [{
    id: 'dist_live', theme_id: x.themes[0].id,
    supporting_claim_ids: [x.claims[0].id],
    claim_dispositions: [{
      claim_id: x.claims[0].id, treatment: 'included', reason: '写入正文', destination: null
    }],
    named_structures: [],
    self_contained: true,
    text: '直播产品塑造可以参考卖点表和九点归一。',
    status: 'provisional'
  }] }), /每条 Claim 都必须有明确去向/);

  assert.throws(() => service.retry(runId, 'distiller', { distillations: [{
    id: 'dist_live', theme_id: x.themes[0].id,
    supporting_claim_ids: x.claims.map(c => c.id),
    claim_dispositions: x.claims.map(c => ({
      claim_id: c.id, treatment: 'included', reason: '写入正文', destination: null
    })),
    named_structures: [{
      name: '九点归一塑造法', kind: 'method', source_claim_ids: [x.claims[1].id],
      required_for_theme: true, treatment: 'cross_referenced', reason: '只写名称，未展开'
    }],
    self_contained: true,
    text: '直播产品塑造可以参考卖点表和九点归一。',
    status: 'provisional'
  }] }), /必须在正文展开/);

  const ok = service.retry(runId, 'distiller', { distillations: [{
    id: 'dist_live', theme_id: x.themes[0].id,
    supporting_claim_ids: x.claims.map(c => c.id),
    claim_dispositions: x.claims.map(c => ({
      claim_id: c.id, treatment: 'included', reason: '完整写入正文', destination: null
    })),
    named_structures: [
      { name: '卖点表', kind: 'table', source_claim_ids: [x.claims[0].id],
        required_for_theme: true, treatment: 'expanded_in_text', reason: '当前知识必须保留完整卖点分类' },
      { name: '九点归一塑造法', kind: 'method', source_claim_ids: [x.claims[1].id],
        required_for_theme: true, treatment: 'expanded_in_text', reason: '当前知识必须保留具体方法及五步成交法' }
    ],
    self_contained: true,
    text: '正文完整展开卖点表的全部分类，并展开九点归一塑造法与五步成交法。',
    status: 'provisional'
  }] });
  assert.equal(ok.state.stages.distiller.status, 'completed');
  cleanup(store);
});

test('RAW cannot be overwritten through the service or same-content intake', () => {
  const store = temp();
  const { service, result } = started(store);
  const rawPath = path.join(store, 'raw', `${result.state.raw_id}.txt`);
  assert.throws(() => service.overwriteRaw(result.state.raw_id, Buffer.from('bad')), /immutable/);
  assert.deepEqual(fs.readFileSync(rawPath), bytes);
  const again = service.start({ bytes, annotations });
  assert.notEqual(result.run_id, again.run_id);
  assert.equal(result.state.raw_id, again.state.raw_id);
  assert.deepEqual(fs.readFileSync(rawPath), bytes);
  cleanup(store);
});

test('unapproved Proposal and AI actor cannot write Canonical; signed review can', () => {
  const store = temp();
  const { service, runId, s } = throughProposal(store);
  assert.equal(service.resume(runId).checkpoint, 'canonical_proposal');
  assert.throws(() => service.submit(runId, 'canonical', { canonical_versions: [] }), /受保护写入/);
  assert.throws(() => service.applyApprovedProposals(runId, { actor: 'ai' }), /AI 无权/);
  assert.throws(() => service.applyApprovedProposals(runId, { actor: 'user_review_service' }), /未经批准/);
  assert.throws(() => service.recordDecision(runId, { checkpoint: 'canonical_proposal',
    proposalId: s.proposals[0].id, decision: 'approved' }, { actor: 'ai' }), /AI 无权/);
  const reviewed = service.recordDecision(runId, { checkpoint: 'canonical_proposal',
    proposalId: s.proposals[0].id, decision: 'approved' }, { actor: 'user_review_service' });
  assert.equal(reviewed.decision.approved_by, 'user');
  const applied = service.applyApprovedProposals(runId, { actor: 'user_review_service' });
  const trace = service.traceCanonical(runId, applied.versions[0].id);
  assert.equal(trace.proposal.id, s.proposals[0].id);
  assert.equal(trace.claims[0].raw_id, reviewed.state.raw_id);
  assert.throws(() => service.applyApprovedProposals(runId, { actor: 'user_review_service' }), /不能覆盖/);
  cleanup(store);
});

test('Canonical Proposal stage rejects a proposal routed to another asset type', () => {
  const store = temp();
  const { service, runId, s } = started(store);
  service.submit(runId, 'router', { assets: s.assets, risk_flags: [] });
  service.submit(runId, 'atomicizer', { atoms: s.atoms });
  service.submit(runId, 'claims', { claims: s.claims });
  service.submit(runId, 'family_builder', { families: s.families });
  service.submit(runId, 'theme_builder', { themes: s.themes, major_change: 'none' });
  service.submit(runId, 'reconciler', { relations: s.relations, version_judgement: false });
  service.submit(runId, 'distiller', { distillations: [completeDistillation(s)] });
  assert.throws(() => service.createProposal(runId, [{ ...s.proposals[0], target: 'copy' }]),
    /canonical_knowledge|Schema/);
  assert.equal(service.loadState(runId).stages.proposal.status, 'failed');
  assert.equal(fs.existsSync(path.join(store, 'canonical')), false);
  cleanup(store);
});

test('partial and rejection decisions are structured and do not create rejected text', () => {
  const store = temp();
  const { service, runId, s } = throughProposal(store);
  const reviewed = service.recordDecision(runId, { checkpoint: 'canonical_proposal',
    proposalId: s.proposals[0].id, decision: 'partial', acceptedChanges: ['仅确认开场先说明主题'] ,
    rejectedChanges: ['销售顺序尚未验证'] }, { actor: 'user_review_service' });
  assert.deepEqual(reviewed.decision.accepted_changes, ['仅确认开场先说明主题']);
  assert.deepEqual(reviewed.decision.rejected_changes, ['销售顺序尚未验证']);
  const applied = service.applyApprovedProposals(runId, { actor: 'user_review_service' });
  assert.equal(applied.versions[0].text, '仅确认开场先说明主题');
  cleanup(store);
});

test('Family rollback marks Theme, relations and Proposal stale; resume uses new Family version', () => {
  const store = temp();
  const { service, runId, s } = throughProposal(store);
  const state = service.rollback(runId, 'family_builder', { actor: 'user_review_service', reason: '归并有误' });
  assert.equal(state.stages.family_builder.status, 'needs_revision');
  for (const stage of ['theme_builder', 'reconciler', 'distiller', 'proposal'])
    assert.equal(state.stages[stage].status, 'stale');
  assert.equal(service.resume(runId).next_stage, 'family_builder');
  service.retry(runId, 'family_builder', { families: s.families });
  assert.equal(service.loadState(runId).stages.family_builder.version, 2);
  assert.equal(service.resume(runId).next_stage, 'theme_builder');
  assert.throws(() => service.submit(runId, 'distiller', { distillations: [] }), /STOP.*reconciler/);
  cleanup(store);
});

test('new service instance resumes exact state without conversational memory', () => {
  const store = temp();
  const { service, runId, s } = started(store);
  service.submit(runId, 'router', { assets: s.assets, risk_flags: [] });
  const resumed = new WorkflowService(store, { reviewerSecret: secret }).resume(runId);
  assert.equal(resumed.next_stage, 'atomicizer');
  assert.equal(resumed.state.stages.router.status, 'completed');
  cleanup(store);
});

test('Gate A blocks high-risk route, Gate B blocks a major Theme, and signed review resumes', () => {
  const store = temp();
  const service = new WorkflowService(store, { reviewerSecret: secret });
  const plain = service.start({ bytes: Buffer.from('暂时无法分类。'),
    annotations: { parts: [{ quote: '暂时无法分类。', type: 'unorganized' }] } });
  const id = plain.run_id;
  service.submit(id, 'router', { assets: plain.suggestion.assets, risk_flags: [] });
  assert.equal(service.resume(id).checkpoint, 'route_risk');
  assert.throws(() => service.submit(id, 'atomicizer', { atoms: [] }), /STOP.*router/);
  service.recordDecision(id, { checkpoint: 'route_risk', decision: 'approved' },
    { actor: 'user_review_service' });
  assert.equal(service.resume(id).status, 'completed_nonknowledge');
  const x = started(store), s = x.s, r = x.runId;
  x.service.submit(r, 'router', { assets: s.assets, risk_flags: [] });
  x.service.submit(r, 'atomicizer', { atoms: s.atoms });
  x.service.submit(r, 'claims', { claims: s.claims });
  x.service.submit(r, 'family_builder', { families: s.families });
  x.service.submit(r, 'theme_builder', { themes: s.themes, major_change: 'new_core' });
  assert.equal(x.service.resume(r).checkpoint, 'major_theme_change');
  assert.throws(() => x.service.submit(r, 'reconciler', { relations: [], version_judgement: false }), /STOP.*theme_builder/);
  x.service.recordDecision(r, { checkpoint: 'major_theme_change', decision: 'approved' },
    { actor: 'user_review_service' });
  assert.equal(x.service.resume(r).next_stage, 'reconciler');
  cleanup(store);
});

test('mixed assets have one knowledge-only path and nonknowledge task can terminate after Router', () => {
  const store = temp();
  const x = throughProposal(store);
  assert.deepEqual(x.service.artifact(x.service.loadState(x.runId), 'router').data.assets.map(a => a.type),
    ['knowledge', 'todo', 'idea', 'copy']);
  assert.equal(x.service.artifact(x.service.loadState(x.runId), 'atomicizer').data.atoms.length, 1);
  const plain = x.service.start({ bytes: Buffer.from('下周整理项目资料。'),
    annotations: { parts: [{ quote: '下周整理项目资料。', type: 'todo' }] } });
  x.service.submit(plain.run_id, 'router', { assets: plain.suggestion.assets, risk_flags: [] });
  assert.equal(x.service.resume(plain.run_id).status, 'completed_nonknowledge');
  assert.equal(x.service.loadState(plain.run_id).stages.skill_candidate.status, 'not_applicable');
  cleanup(store);
});

test('conflict cannot auto-merge and Gate C blocks Distiller', () => {
  const store = temp();
  const service = new WorkflowService(store, { reviewerSecret: secret });
  const r = service.start({ bytes: Buffer.from('开场不要卖。开场马上卖。'), annotations: {
    parts: [{ quote: '开场不要卖。', type: 'knowledge', theme: '开场策略', central_question: '何时销售？',
      inclusion: '开场销售顺序', exclusion: '尾场销售' },
      { quote: '开场马上卖。', type: 'knowledge', theme: '开场策略', central_question: '何时销售？',
      inclusion: '开场销售顺序', exclusion: '尾场销售' }],
    relations: [{ from: 0, to: 1, type: 'CONTRADICTS', rationale: '立场相反' }] } });
  const s = r.suggestion, id = r.run_id;
  service.submit(id, 'router', { assets: s.assets, risk_flags: [] });
  service.submit(id, 'atomicizer', { atoms: s.atoms });
  service.submit(id, 'claims', { claims: s.claims });
  service.submit(id, 'family_builder', { families: s.families });
  service.submit(id, 'theme_builder', { themes: s.themes, major_change: 'none' });
  const result = service.submit(id, 'reconciler', { relations: s.relations, version_judgement: false });
  assert.equal(s.families.length, 2);
  assert.equal(result.state.checkpoints.conflict_or_version.status, 'waiting_user_approval');
  assert.throws(() => service.submit(id, 'distiller', { distillations: [] }), /STOP.*reconciler/);
  cleanup(store);
});

test('Skill Candidate failing promotion cannot reach formal Skill', () => {
  const store = temp();
  const { service, runId, s } = throughProposal(store);
  service.recordDecision(runId, { checkpoint: 'canonical_proposal', proposalId: s.proposals[0].id,
    decision: 'approved' }, { actor: 'user_review_service' });
  const canonical = service.applyApprovedProposals(runId, { actor: 'user_review_service' }).versions[0];
  const candidate = { id: 'candidate_1', canonical_ids: [canonical.id], supporting_claim_ids: [s.claims[0].id],
    verification: { source_sufficiency: true, executability: true, task_utility: true },
    promotion: { independent_intent: true, independent_contract: false, independent_run: true,
      independent_reuse: true, independent_eval: true },
    ria: { R: '原文', I: '解释', A1: '案例', A2: '触发', E: '执行', B: '边界' } };
  assert.throws(() => service.submit(runId, 'skill_candidate', { candidates: [candidate] }), /未通过仓颉式晋级门/);
  assert.equal(service.loadState(runId).stages.skill_candidate.status, 'failed');
  assert.throws(() => service.submit(runId, 'skill_publish', { formal_skills: [] }), /受保护写入/);
  cleanup(store);
});

test('worse paired evaluation invalidates draft and prevents publication', () => {
  const store = temp();
  const { service, runId, s } = throughProposal(store);
  service.recordDecision(runId, { checkpoint: 'canonical_proposal', proposalId: s.proposals[0].id,
    decision: 'approved' }, { actor: 'user_review_service' });
  const canonical = service.applyApprovedProposals(runId, { actor: 'user_review_service' }).versions[0];
  const candidate = { id: 'candidate_1', canonical_ids: [canonical.id], supporting_claim_ids: [s.claims[0].id],
    verification: { source_sufficiency: true, executability: true, task_utility: true },
    promotion: { independent_intent: true, independent_contract: true, independent_run: true,
      independent_reuse: true, independent_eval: true },
    ria: { R: '原文', I: '解释', A1: '案例', A2: '触发', E: '执行', B: '边界' } };
  service.submit(runId, 'skill_candidate', { candidates: [candidate] });
  assert.throws(() => service.submit(runId, 'skill_builder', { drafts: [] }), /STOP.*skill_candidate/);
  service.recordDecision(runId, { checkpoint: 'skill_promotion', decision: 'approved' },
    { actor: 'user_review_service' });
  service.submit(runId, 'skill_builder', { drafts: [{ id: 'draft_1', candidate_id: candidate.id,
    skill_md: '# draft' }] });
  const outputs = captureOutputs(service, runId);
  const evaluated = service.submit(runId, 'evaluator', { evaluations: [{ id: 'eval_1',
    draft_id: 'draft_1', test_case_ids: ['t1'],
    test_results: [{ case_id: 't1', with_skill_output_id: outputs.with_skill,
      baseline_output_id: outputs.without_skill, assertion_passed: false }],
    paired_judgements: ['worse', 'worse', 'better'].map((vote, i) => ({ judge_id: `judge_${i}`,
      vote, rationale: '独立比较记录', before_output_id: outputs.before, after_output_id: outputs.after })),
    recommendation: 'revert' }] });
  assert.equal(evaluated.state.stages.skill_builder.status, 'needs_revision');
  assert.equal(evaluated.state.stages.evaluator.status, 'stale');
  assert.throws(() => service.publishApprovedSkill(runId, { actor: 'user_review_service' }), /发布前缺/);
  cleanup(store);
});

test('missing baseline/output record cannot mark evaluator completed', () => {
  const store = temp();
  const { service, runId, s } = throughProposal(store);
  service.recordDecision(runId, { checkpoint: 'canonical_proposal', proposalId: s.proposals[0].id,
    decision: 'approved' }, { actor: 'user_review_service' });
  const canonical = service.applyApprovedProposals(runId, { actor: 'user_review_service' }).versions[0];
  const candidate = { id: 'candidate_1', canonical_ids: [canonical.id], supporting_claim_ids: [s.claims[0].id],
    verification: { source_sufficiency: true, executability: true, task_utility: true },
    promotion: { independent_intent: true, independent_contract: true, independent_run: true,
      independent_reuse: true, independent_eval: true },
    ria: { R: 'R', I: 'I', A1: 'A1', A2: 'A2', E: 'E', B: 'B' } };
  service.submit(runId, 'skill_candidate', { candidates: [candidate] });
  service.recordDecision(runId, { checkpoint: 'skill_promotion', decision: 'approved' },
    { actor: 'user_review_service' });
  service.submit(runId, 'skill_builder', { drafts: [{ id: 'draft_1', candidate_id: 'candidate_1', skill_md: '# draft' }] });
  assert.throws(() => service.submit(runId, 'evaluator', { evaluations: [{ id: 'eval_1', draft_id: 'draft_1',
    test_case_ids: ['t1'], paired_judgements: [], recommendation: 'keep' }] }), /Schema/);
  assert.equal(service.loadState(runId).stages.evaluator.status, 'failed');
  const fake = 'output_00000000000000000000';
  assert.throws(() => service.retry(runId, 'evaluator', { evaluations: [{ id: 'eval_2', draft_id: 'draft_1',
    test_case_ids: ['t1'], test_results: [{ case_id: 't1', with_skill_output_id: fake,
      baseline_output_id: fake, assertion_passed: true }],
    paired_judgements: ['better', 'better', 'worse'].map((vote, i) => ({ judge_id: `j${i}`,
      vote, rationale: '模拟', before_output_id: fake, after_output_id: fake })),
    recommendation: 'keep' }] }), /ENOENT/);
  assert.equal(service.loadState(runId).stages.evaluator.status, 'failed');
  cleanup(store);
});

test('Gate F blocks formal Skill metadata until signed publication review', () => {
  const store = temp();
  const { service, runId, s } = throughProposal(store);
  service.recordDecision(runId, { checkpoint: 'canonical_proposal', proposalId: s.proposals[0].id,
    decision: 'approved' }, { actor: 'user_review_service' });
  const canonical = service.applyApprovedProposals(runId, { actor: 'user_review_service' }).versions[0];
  const candidate = { id: 'candidate_1', canonical_ids: [canonical.id], supporting_claim_ids: [s.claims[0].id],
    verification: { source_sufficiency: true, executability: true, task_utility: true },
    promotion: { independent_intent: true, independent_contract: true, independent_run: true,
      independent_reuse: true, independent_eval: true },
    ria: { R: '原文', I: '解释', A1: '案例', A2: '触发', E: '执行', B: '边界' } };
  service.submit(runId, 'skill_candidate', { candidates: [candidate] });
  service.recordDecision(runId, { checkpoint: 'skill_promotion', decision: 'approved' },
    { actor: 'user_review_service' });
  service.submit(runId, 'skill_builder', { drafts: [{ id: 'draft_1', candidate_id: candidate.id, skill_md: '# draft' }] });
  const outputs = captureOutputs(service, runId);
  service.submit(runId, 'evaluator', { evaluations: [{ id: 'eval_1', draft_id: 'draft_1',
    test_case_ids: ['t1'], test_results: [{ case_id: 't1', with_skill_output_id: outputs.with_skill,
      baseline_output_id: outputs.without_skill, assertion_passed: true }],
    paired_judgements: ['better', 'better', 'worse'].map((vote, i) => ({ judge_id: `judge_${i}`,
      vote, rationale: '输出并排比较', before_output_id: outputs.before, after_output_id: outputs.after })),
    recommendation: 'keep' }] });
  assert.equal(service.resume(runId).checkpoint, 'skill_publication');
  assert.throws(() => service.publishApprovedSkill(runId, { actor: 'user_review_service' }), /Gate F/);
  service.recordDecision(runId, { checkpoint: 'skill_publication', decision: 'approved' },
    { actor: 'user_review_service' });
  const published = service.publishApprovedSkill(runId, { actor: 'user_review_service' });
  assert.equal(published.state.status, 'completed');
  assert.equal(published.skills.length, 1);
  assert.throws(() => service.publishApprovedSkill(runId, { actor: 'user_review_service' }), /不能覆盖/);
  cleanup(store);
});

test('forged RUN_STATE approval cannot bypass a signed decision', () => {
  const store = temp();
  const { service, runId } = throughProposal(store);
  const file = service.statePath(runId);
  const forged = JSON.parse(fs.readFileSync(file, 'utf8'));
  forged.checkpoints.canonical_proposal.status = 'approved';
  forged.stages.proposal.status = 'completed';
  fs.writeFileSync(file, JSON.stringify(forged, null, 2));
  assert.throws(() => new WorkflowService(store, { reviewerSecret: secret }).resume(runId), /缺签署记录/);
  cleanup(store);
});

test('artifact tampering is detected on resume', () => {
  const store = temp();
  const { service, runId, s } = started(store);
  service.submit(runId, 'router', { assets: s.assets, risk_flags: [] });
  const state = service.loadState(runId);
  fs.writeFileSync(service.artifactPath(runId, 'router', state.stages.router.version), '{}');
  assert.throws(() => new WorkflowService(store).resume(runId), /阶段产物被篡改/);
  cleanup(store);
});


test('v0.3 resume exposes machine-readable required_action', () => {
  const store = temp();
  const { service, runId, s } = started(store);
  assert.equal(service.resume(runId).required_action, 'execute');
  service.reportFailure(runId, 'router', { error: 'temporary model failure' });
  assert.equal(service.resume(runId).required_action, 'retry');
  service.retry(runId, 'router', { assets: s.assets, risk_flags: [] });
  assert.equal(service.resume(runId).required_action, 'execute');
  cleanup(store);
});

test('Ed25519 public-key verifier can resume signed review but cannot sign protected writes', () => {
  const store = temp();
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
  const signer = new WorkflowService(store, { reviewerPrivateKey: privateKey, reviewerPublicKey: publicKey });
  const result = signer.start({ bytes, annotations });
  const runId = result.run_id, s = result.suggestion;
  signer.submit(runId, 'router', { assets: s.assets, risk_flags: [] });
  signer.submit(runId, 'atomicizer', { atoms: s.atoms });
  signer.submit(runId, 'claims', { claims: s.claims });
  signer.submit(runId, 'family_builder', { families: s.families });
  signer.submit(runId, 'theme_builder', { themes: s.themes, major_change: 'none' });
  signer.submit(runId, 'reconciler', { relations: s.relations, version_judgement: false });
  signer.submit(runId, 'distiller', { distillations: [completeDistillation(s, { id: 'distill_ed25519' })] });
  signer.submit(runId, 'proposal', { proposals: s.proposals });
  const reviewed = signer.recordDecision(runId, { checkpoint: 'canonical_proposal',
    proposalId: s.proposals[0].id, decision: 'approved' }, { actor: 'user_review_service' });
  assert.equal(reviewed.decision.signature_alg, 'ed25519-v1');
  const verifier = new WorkflowService(store, { reviewerPublicKey: publicKey });
  const resumed = verifier.resume(runId);
  assert.equal(resumed.required_action, 'apply_approved_proposals');
  assert.throws(() => verifier.applyApprovedProposals(runId, { actor: 'user_review_service' }), /签名能力/);
  const applied = signer.applyApprovedProposals(runId, { actor: 'user_review_service' });
  assert.equal(applied.versions.length, 1);
  cleanup(store);
});

test('Artifact provenance records Skill/model/context identity without changing stage data', () => {
  const store = temp();
  const { service, runId, s } = started(store);
  const provenance = { skill_path: 'skills/knowledge-router/SKILL.md', skill_sha256: 'a'.repeat(64),
    model: 'fake-model', runner: 'AgentRuntime/v0.3', attempt_id: 'attempt_test', context_sha256: 'b'.repeat(64) };
  const result = service.submit(runId, 'router', { assets: s.assets, risk_flags: [] },
    { producer: 'fake-model', provenance });
  assert.deepEqual(result.artifact.provenance, provenance);
  assert.deepEqual(result.artifact.data.assets, s.assets);
  cleanup(store);
});
