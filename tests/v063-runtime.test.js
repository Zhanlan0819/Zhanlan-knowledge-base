import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { WorkflowService } from '../src/workflow-v063.js';
import Ajv2020 from 'ajv/dist/2020.js';

const secret = 'v063-test-secret';
const bytes = Buffer.from('知识一。\n待办一。\n备忘一。\n文案一。\n灵感一。', 'utf8');
const annotations = {
  parts: [
    { quote: '知识一。', type: 'knowledge', theme: '测试主题', central_question: '知识怎么用？', inclusion: '测试', exclusion: '其它' },
    { quote: '待办一。', type: 'todo' },
    { quote: '备忘一。', type: 'memo' },
    { quote: '文案一。', type: 'copy' },
    { quote: '灵感一。', type: 'idea' }
  ],
  proposals: [{ text: '正式知识：知识一。', claim_parts: [0] }]
};

const temp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'kb-v063-'));
const cleanup = p => fs.rmSync(p, { recursive: true, force: true });

function serviceFor(store) {
  return new WorkflowService(store, { reviewerSecret: secret });
}

function start(store, { userBrief = null } = {}) {
  const service = serviceFor(store);
  const r = service.start({ bytes, annotations, userBrief });
  return { service, runId: r.run_id, s: r.suggestion };
}

function completeDistillation(s, { id = 'dist_1', text = null, namedStructures = [] } = {}) {
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

function passingCompletenessAudit(proposals) {
  return { items: proposals.map(p => ({
    proposal_id: p.id,
    verdict: 'pass',
    self_contained: true,
    missing_claim_ids: [],
    missing_structures: [],
    reference_only_gaps: [],
    reason: '测试候选为最小自包含知识。'
  })) };
}

function throughTheme(store, { majorChange = 'none' } = {}) {
  const x = start(store);
  const { service, runId, s } = x;
  service.submit(runId, 'router', { assets: s.assets, risk_flags: [] });
  service.submit(runId, 'atomicizer', { atoms: s.atoms });
  service.submit(runId, 'claims', { claims: s.claims });
  service.submit(runId, 'family_builder', { families: s.families });
  service.submit(runId, 'theme_builder', { themes: s.themes, major_change: majorChange });
  return x;
}

function throughCanonical(store) {
  const x = throughTheme(store);
  const { service, runId, s } = x;
  service.submit(runId, 'reconciler', { relations: [], version_judgement: false });
  service.submit(runId, 'distiller', { distillations: [completeDistillation(s)] });
  service.submit(runId, 'proposal', { proposals: s.proposals }, { completenessAudit: passingCompletenessAudit(s.proposals) });
  service.recordDecision(runId, { checkpoint: 'canonical_proposal', proposalId: s.proposals[0].id, decision: 'approved' },
    { actor: 'user_review_service' });
  const canonical = service.applyApprovedProposals(runId, { actor: 'user_review_service' }).versions[0];
  return { ...x, canonical };
}

test('rollback rejection resets downstream to not_started and apply succeeds without manual state repair', () => {
  const store = temp();
  try {
    const { service, runId, s } = throughTheme(store, { majorChange: 'new_core' });
    assert.equal(service.resume(runId).checkpoint, 'major_theme_change');

    service.recordDecision(runId, { checkpoint: 'major_theme_change', decision: 'rejected' },
      { actor: 'user_review_service' });
    let state = service.loadState(runId);
    assert.equal(state.stages.theme_builder.status, 'needs_revision');
    assert.equal(state.stages.canonical.status, 'not_started');
    assert.equal(state.stages.canonical.artifact_id, null);

    service.retry(runId, 'theme_builder', { themes: s.themes, major_change: 'new_core' });
    service.recordDecision(runId, { checkpoint: 'major_theme_change', decision: 'approved' },
      { actor: 'user_review_service' });
    service.submit(runId, 'reconciler', { relations: [], version_judgement: false });
    service.submit(runId, 'distiller', { distillations: [{
      id: 'dist_1', theme_id: s.themes[0].id, supporting_claim_ids: [s.claims[0].id],
      text: s.proposals[0].text, status: 'provisional'
    }] });
    service.submit(runId, 'proposal', { proposals: s.proposals }, { completenessAudit: passingCompletenessAudit(s.proposals) });
    service.recordDecision(runId, { checkpoint: 'canonical_proposal', proposalId: s.proposals[0].id, decision: 'approved' },
      { actor: 'user_review_service' });
    const applied = service.applyApprovedProposals(runId, { actor: 'user_review_service' });
    assert.equal(applied.versions.length, 1);
  } finally { cleanup(store); }
});

test('non-proposal gate rejects free-text accepted payload so AI cannot sign the wrong option text', () => {
  const store = temp();
  try {
    const { service, runId } = throughTheme(store, { majorChange: 'new_core' });
    assert.throws(() => service.recordDecision(runId, {
      checkpoint: 'major_theme_change', decision: 'approved', acceptedChanges: ['option 2']
    }, { actor: 'user_review_service' }), /禁止自由文本/);
    service.recordDecision(runId, { checkpoint: 'major_theme_change', decision: 'approved' },
      { actor: 'user_review_service' });
    assert.equal(service.loadState(runId).checkpoints.major_theme_change.status, 'approved');
  } finally { cleanup(store); }
});

test('empty Skill candidates cannot finish without per-canonical promotion audit, and delivery exports all asset lanes', () => {
  const store = temp();
  try {
    const { service, runId, canonical } = throughCanonical(store);
    assert.throws(() => service.submit(runId, 'skill_candidate', { candidates: [] }), /晋级审计/);
    const result = service.retry(runId, 'skill_candidate', { candidates: [] }, {
      promotionAudit: { items: [{ canonical_id: canonical.id, outcome: 'not_skill', reason: '这是知识结论，不具备独立输入/输出契约。' }] }
    });
    assert.equal(result.state.status, 'completed');
    assert.ok(result.delivery?.output_dir);
    const manifest = JSON.parse(fs.readFileSync(path.join(result.delivery.output_dir, 'manifest.json'), 'utf8'));
    assert.equal(manifest.totals.canonical_knowledge, 1);
    assert.equal(manifest.totals.todo, 1);
    assert.equal(manifest.totals.memo, 1);
    assert.equal(manifest.totals.copy, 1);
    assert.equal(manifest.totals.idea, 1);
    assert.ok(fs.existsSync(path.join(result.delivery.output_dir, '04_备忘.json')));
    assert.ok(fs.existsSync(path.join(result.delivery.output_dir, '11_Skill晋级审计.json')));
  } finally { cleanup(store); }
});

test('published Skill becomes an installable folder containing SKILL.md', () => {
  const store = temp();
  try {
    const { service, runId, canonical, s } = throughCanonical(store);
    const candidate = {
      id: 'candidate_1',
      canonical_ids: [canonical.id],
      supporting_claim_ids: [s.claims[0].id],
      verification: { source_sufficiency: true, executability: true, task_utility: true },
      promotion: { independent_intent: true, independent_contract: true, independent_run: true,
        independent_reuse: true, independent_eval: true },
      ria: { R: '正式知识', I: '解释', A1: '案例', A2: '触发', E: '执行', B: '边界' }
    };
    service.submit(runId, 'skill_candidate', { candidates: [candidate] }, {
      promotionAudit: { items: [{ canonical_id: canonical.id, outcome: 'promoted', reason: '具备独立意图、契约、运行与评测条件。' }] }
    });
    service.recordDecision(runId, { checkpoint: 'skill_promotion', decision: 'approved' },
      { actor: 'user_review_service' });
    service.submit(runId, 'skill_builder', { drafts: [{
      id: 'draft_1', candidate_id: candidate.id,
      skill_md: '---\nname: test-skill\ndescription: test\n---\n# Test Skill\n\n执行测试。'
    }] });

    const out = {};
    for (const variant of ['with_skill','without_skill','before','after']) {
      out[variant] = service.recordEvaluationOutput(runId, {
        caseId: variant === 'before' || variant === 'after' ? 'pair' : 'case1',
        variant, bytes: Buffer.from(variant, 'utf8'), runner: 'test'
      }).id;
    }
    service.submit(runId, 'evaluator', { evaluations: [{
      id: 'eval_1', draft_id: 'draft_1', test_case_ids: ['case1'],
      test_results: [{ case_id: 'case1', with_skill_output_id: out.with_skill,
        baseline_output_id: out.without_skill, assertion_passed: true }],
      paired_judgements: ['better','better','worse'].map((vote, i) => ({
        judge_id: `j${i}`, vote, rationale: 'test',
        before_output_id: out.before, after_output_id: out.after
      })),
      recommendation: 'keep'
    }] });
    service.recordDecision(runId, { checkpoint: 'skill_publication', decision: 'approved' },
      { actor: 'user_review_service' });
    const published = service.publishApprovedSkill(runId, { actor: 'user_review_service' });
    const dir = path.join(store, 'formal-skills', published.skills[0].id);
    assert.ok(fs.existsSync(path.join(dir, 'SKILL.md')));
    assert.ok(fs.existsSync(path.join(dir, 'metadata.json')));
    assert.ok(fs.existsSync(path.join(dir, 'test-prompts.json')));
    assert.ok(fs.existsSync(path.join(published.delivery.output_dir, 'skills', published.skills[0].id, 'SKILL.md')));
  } finally { cleanup(store); }
});


test('source governance sidecar conforms to the v0.6.3 governance schema', () => {
  const store = temp();
  try {
    const { service, runId, s } = start(store);
    service.submit(runId, 'router', { assets: s.assets, risk_flags: [] });
    service.submit(runId, 'atomicizer', { atoms: s.atoms });
    service.submit(runId, 'claims', { claims: s.claims });
    const sidecar = JSON.parse(fs.readFileSync(path.join(service.runDir(runId), 'governance', 'source-governance.json'), 'utf8'));
    const schema = JSON.parse(fs.readFileSync(new URL('../schemas/source-governance.schema.json', import.meta.url), 'utf8'));
    const validate = new Ajv2020({ allErrors: true }).compile(schema);
    assert.equal(sidecar.claims.length, s.claims.length);
    for (const item of sidecar.claims) {
      assert.equal(validate(item.governance), true, JSON.stringify(validate.errors));
      assert.ok(item.claim_id);
      assert.ok(item.source_status);
    }
  } finally { cleanup(store); }
});
