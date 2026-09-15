import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import Ajv2020 from 'ajv/dist/2020.js';
import { ingest, assessSkillCandidate, evaluatePaired } from './pipeline.js';
import { ReviewCrypto } from './review-crypto.js';

export const STAGES = ['intake', 'router', 'atomicizer', 'claims', 'family_builder', 'theme_builder',
  'reconciler', 'distiller', 'proposal', 'canonical', 'skill_candidate', 'skill_builder', 'evaluator', 'skill_publish'];
export const DEPENDS = Object.fromEntries(STAGES.map((s, i) => [s, i === 0 ? [] : [STAGES[i - 1]]]));
export const GATES = { router: 'route_risk', theme_builder: 'major_theme_change',
  reconciler: 'conflict_or_version', proposal: 'canonical_proposal',
  skill_candidate: 'skill_promotion', evaluator: 'skill_publication' };
const base = path.dirname(fileURLToPath(import.meta.url));
const schemaDir = path.resolve(base, '../schemas');
const readSchema = name => JSON.parse(fs.readFileSync(path.join(schemaDir, name), 'utf8'));
const sha = value => crypto.createHash('sha256').update(value).digest('hex');
const assert = (condition, message) => { if (!condition) throw new Error(message); };
const now = () => new Date().toISOString();
const unique = items => new Set(items).size === items.length;
const dateTimeFormat = { type: 'string', validate: value => !Number.isNaN(Date.parse(value)) && /T/.test(value) };

const ajv = new Ajv2020({ allErrors: true, strict: false, formats: { 'date-time': dateTimeFormat } });
for (const file of ['run.schema.json', 'skill-candidate.schema.json', 'workflow-artifacts.schema.json',
  'artifact-envelope.schema.json', 'workflow-state.schema.json']) ajv.addSchema(readSchema(file));
const stageValidator = Object.fromEntries(STAGES.map(s => [s,
  ajv.compile({ $ref: `https://local.invalid/kb/workflow-artifacts.schema.json#/$defs/${s}` })]));
const stateValidator = ajv.getSchema('https://local.invalid/kb/workflow-state.schema.json');
const envelopeValidator = ajv.getSchema('https://local.invalid/kb/artifact-envelope.schema.json');

function checkSchema(validator, value, label) {
  if (!validator(value)) throw new Error(`${label} Schema 不通过: ${ajv.errorsText(validator.errors)}`);
}

export const ARTIFACT_CONTRACTS = Object.fromEntries(STAGES.map((stage, i) => [stage, {
  input: DEPENDS[stage], output: `${stage}.vN.json`,
  schema: `schemas/workflow-artifacts.schema.json#/$defs/${stage}`,
  next_precondition: i + 1 < STAGES.length ? `${stage}=completed 且所需 Gate=approved` : null
}]));

function stageRecord() { return { status: 'not_started', version: 0, artifact_id: null, sha256: null, error: null }; }
function outputIds(data) {
  const result = [];
  for (const value of Object.values(data)) if (Array.isArray(value))
    for (const item of value) if (item && typeof item === 'object' && typeof item.id === 'string') result.push(item.id);
  return result;
}

export class WorkflowService {
  constructor(store, { reviewerSecret = null, reviewerPublicKey = null, reviewerPrivateKey = null,
    reviewKeyId = 'review-ed25519-v1' } = {}) {
    assert(typeof store === 'string' && store.length > 0, 'store 必须非空');
    this.store = path.resolve(store);
    this.reviewCrypto = new ReviewCrypto({ publicKey: reviewerPublicKey, privateKey: reviewerPrivateKey,
      legacySecret: reviewerSecret, keyId: reviewKeyId });
  }

  runDir(runId) {
    assert(/^wf_[a-f0-9-]{36}$/.test(runId), '非法 workflow run_id');
    return path.join(this.store, 'workflows', runId);
  }
  statePath(runId) { return path.join(this.runDir(runId), 'RUN_STATE.json'); }
  artifactPath(runId, stage, version) { return path.join(this.runDir(runId), 'artifacts', stage, `v${version}.json`); }
  evaluationOutputPath(runId, outputId) {
    assert(/^output_[a-f0-9]{20}$/.test(outputId), '非法 evaluation output_id');
    return path.join(this.runDir(runId), 'evaluation-outputs', `${outputId}.json`);
  }

  start({ bytes, annotations, producer = 'external_annotations' }) {
    const suggestion = ingest({ store: this.store, bytes, annotations });
    const runId = `wf_${crypto.randomUUID()}`;
    const state = { schema_version: '0.3.0', run_id: runId, raw_id: suggestion.raw_id,
      suggestion_run_id: suggestion.run_id, status: 'running', current_stage: 'router',
      stages: Object.fromEntries(STAGES.map(s => [s, stageRecord()])),
      checkpoints: {}, decisions: [], created_at: now(), updated_at: now() };
    fs.mkdirSync(this.runDir(runId), { recursive: true });
    this.commitArtifact(state, 'intake', { raw_id: suggestion.raw_id, sha256: sha(bytes), bytes: bytes.length }, producer);
    this.saveState(state);
    this.audit(runId, { stage: 'intake', input_ids: [], output_ids: [suggestion.raw_id],
      model_agent: producer, result: 'completed' });
    return { run_id: runId, state, suggestion: suggestion.run };
  }

  saveState(state) {
    state.updated_at = now();
    checkSchema(stateValidator, state, 'RUN_STATE');
    const file = this.statePath(state.run_id);
    const bytes = JSON.stringify(state, null, 2);
    const history = path.join(this.runDir(state.run_id), 'state-history', `${Date.now()}-${crypto.randomUUID()}.json`);
    fs.mkdirSync(path.dirname(history), { recursive: true });
    fs.writeFileSync(history, bytes, { flag: 'wx' });
    const temp = `${file}.${crypto.randomUUID()}.tmp`;
    fs.writeFileSync(temp, bytes, { flag: 'wx' });
    fs.renameSync(temp, file);
  }

  loadState(runId) {
    const state = JSON.parse(fs.readFileSync(this.statePath(runId), 'utf8'));
    checkSchema(stateValidator, state, 'RUN_STATE');
    assert(state.run_id === runId, 'RUN_STATE run_id 不匹配');
    const rawFile = path.join(this.store, 'raw', `${state.raw_id}.txt`);
    const rawMeta = JSON.parse(fs.readFileSync(path.join(this.store, 'raw', `${state.raw_id}.json`), 'utf8'));
    assert(rawMeta.id === state.raw_id && sha(fs.readFileSync(rawFile)) === rawMeta.sha256, 'RAW 被篡改');
    for (const [stage, record] of Object.entries(state.stages)) {
      if (['completed', 'waiting_review', 'stale', 'needs_revision'].includes(record.status) && record.version > 0)
        assert(record.artifact_id && record.sha256, `${stage} 声称有产物但缺身份/摘要`);
      if (['completed', 'waiting_review'].includes(record.status))
        assert(record.artifact_id && record.version > 0, `${stage} 不能只靠 RUN_STATE 宣称完成`);
      if (!record.artifact_id) continue;
      const bytes = fs.readFileSync(this.artifactPath(runId, stage, record.version));
      assert(sha(bytes) === record.sha256, `阶段产物被篡改: ${stage}`);
      const envelope = JSON.parse(bytes.toString('utf8'));
      checkSchema(envelopeValidator, envelope, `${stage} envelope`);
      assert(envelope.artifact_id === record.artifact_id && envelope.stage === stage && envelope.run_id === runId,
        `阶段产物身份不匹配: ${stage}`);
      if (record.status === 'completed' || record.status === 'waiting_review') {
        const expected = DEPENDS[stage].map(d => state.stages[d].artifact_id);
        assert(envelope.inputs.map(x => x.artifact_id).join('|') === expected.join('|'), `阶段 ${stage} 依赖已变更，必须重验`);
      }
    }
    for (const decision of state.decisions) assert(this.verifyDecision(decision),
      '审批签名无法验证；Agent/只读恢复需要审阅公钥，旧版 HMAC run 需要原 KB_REVIEW_SECRET');
    for (const [gate, cp] of Object.entries(state.checkpoints)) if (cp.status !== 'waiting_user_approval') {
      const source = state.stages[cp.stage].artifact_id;
      const matching = state.decisions.filter(d => d.checkpoint === gate && d.source_artifact_id === source);
      assert(matching.length > 0 && matching.every(d => this.verifyDecision(d)), `Checkpoint ${gate} 缺签署记录`);
      if (gate === 'canonical_proposal')
        assert(cp.proposal_ids.every(p => matching.some(d => d.proposal_id === p)), 'Proposal 审批结果不完整');
      if (cp.status === 'approved') assert(matching.some(d => ['approved', 'partial'].includes(d.decision)),
        `Checkpoint ${gate} 未获批准`);
    }
    if (state.stages.canonical.status === 'completed') {
      const envelope = this.artifact(state, 'canonical');
      assert(envelope.producer === 'protected_review_service', '正式知识产物绕过了受保护服务');
      for (const item of envelope.data.canonical_versions) {
        const approval = state.decisions.find(d => d.id === item.approved_decision_id);
        assert(approval && this.verifyDecision(approval) && ['approved', 'partial'].includes(approval.decision)
          && approval.proposal_id === item.proposal_id, '正式知识缺有效 Proposal 审批');
      }
    }
    if (state.stages.evaluator.artifact_id && ['completed', 'waiting_review'].includes(state.stages.evaluator.status))
      for (const evaluation of this.artifact(state, 'evaluator').data.evaluations) {
        for (const t of evaluation.test_results) {
          this.verifyEvaluationOutput(runId, t.with_skill_output_id, 'with_skill', t.case_id);
          this.verifyEvaluationOutput(runId, t.baseline_output_id, 'without_skill', t.case_id);
        }
        for (const j of evaluation.paired_judgements) {
          this.verifyEvaluationOutput(runId, j.before_output_id, 'before');
          this.verifyEvaluationOutput(runId, j.after_output_id, 'after');
        }
      }
    if (state.status === 'waiting_user_approval')
      assert(Object.values(state.checkpoints).some(c => c.status === 'waiting_user_approval'
        && state.stages[c.stage].status === 'waiting_review'), '等待审批状态缺对应 Checkpoint');
    if (state.status === 'completed_nonknowledge')
      assert(state.stages.router.status === 'completed'
        && !this.artifact(state, 'router').data.assets.some(a => a.type === 'knowledge')
        && state.stages.atomicizer.status === 'not_applicable', '非知识完成状态不一致');
    if (state.status === 'completed')
      assert(state.stages.skill_publish.status === 'completed'
        || (state.stages.skill_candidate.status === 'completed' && state.stages.skill_builder.status === 'not_applicable'),
        '完整完成状态缺终止阶段');
    return state;
  }

  artifact(state, stage) {
    const record = state.stages[stage];
    assert(record.artifact_id, `${stage} 尚无产物`);
    return JSON.parse(fs.readFileSync(this.artifactPath(state.run_id, stage, record.version), 'utf8'));
  }

  audit(runId, event) {
    const entry = { run_id: runId, timestamp: now(), stage: event.stage,
      input_ids: event.input_ids ?? [], output_ids: event.output_ids ?? [],
      model_agent: event.model_agent ?? 'system', result: event.result,
      error: event.error ?? null, user_decision: event.user_decision ?? null };
    fs.appendFileSync(path.join(this.runDir(runId), 'AUDIT.jsonl'), JSON.stringify(entry) + '\n');
  }

  recordEvaluationOutput(runId, { caseId, variant, bytes, runner = 'external_test_runner' }) {
    const state = this.loadState(runId);
    assert(state.stages.skill_builder.status === 'completed', '测试输出只能在 Skill 草稿完成后登记');
    assert(typeof caseId === 'string' && caseId.trim(), '测试 caseId 必须非空');
    assert(['with_skill', 'without_skill', 'before', 'after'].includes(variant), '非法测试 variant');
    assert(Buffer.isBuffer(bytes) && bytes.length > 0, '测试输出必须有真实字节');
    const outputId = `output_${sha(Buffer.concat([Buffer.from(`${runId}:${caseId}:${variant}:`), bytes])).slice(0, 20)}`;
    const file = this.evaluationOutputPath(runId, outputId);
    const record = { id: outputId, run_id: runId, case_id: caseId, variant,
      runner, captured_at: now(), sha256: sha(bytes), content_base64: bytes.toString('base64') };
    fs.mkdirSync(path.dirname(file), { recursive: true });
    if (fs.existsSync(file)) {
      const old = JSON.parse(fs.readFileSync(file, 'utf8'));
      assert(old.sha256 === record.sha256 && old.content_base64 === record.content_base64, '测试输出已被篡改');
    } else fs.writeFileSync(file, JSON.stringify(record, null, 2), { flag: 'wx' });
    this.audit(runId, { stage: 'evaluator', input_ids: [state.stages.skill_builder.artifact_id],
      output_ids: [outputId], model_agent: runner, result: `captured_${variant}` });
    return record;
  }
  verifyEvaluationOutput(runId, outputId, variant, caseId = null) {
    const record = JSON.parse(fs.readFileSync(this.evaluationOutputPath(runId, outputId), 'utf8'));
    assert(record.id === outputId && record.run_id === runId && record.variant === variant,
      '测试输出身份/variant 不匹配');
    if (caseId !== null) assert(record.case_id === caseId, '测试输出 case_id 不匹配');
    assert(sha(Buffer.from(record.content_base64, 'base64')) === record.sha256,
      '测试输出内容被篡改');
    return record;
  }

  preconditions(state, stage) {
    assert(STAGES.includes(stage) && stage !== 'intake', `非法阶段: ${stage}`);
    assert(!['canonical', 'skill_publish'].includes(stage), `${stage} 为受保护写入，只能通过审批服务执行`);
    assert(!['completed', 'waiting_review', 'not_applicable'].includes(state.stages[stage].status),
      `${stage} 已完成或不可用；需要 rollback 后才能重做`);
    const missing = DEPENDS[stage].filter(d => state.stages[d].status !== 'completed');
    assert(missing.length === 0, `STOP: ${stage} 缺少已完成前置阶段: ${missing.join(', ')}`);
    const predecessor = DEPENDS[stage][0];
    const gate = GATES[predecessor];
    if (gate && state.checkpoints[gate])
      assert(state.checkpoints[gate].status === 'approved', `STOP: ${gate} 仍需用户批准`);
  }

  commitArtifact(state, stage, data, producer, provenance = null) {
    checkSchema(stageValidator[stage], data, stage);
    const record = state.stages[stage];
    const version = record.version + 1;
    const inputs = DEPENDS[stage].map(d => ({ stage: d, artifact_id: state.stages[d].artifact_id, sha256: state.stages[d].sha256 }));
    const artifactId = `artifact_${sha(JSON.stringify({ run_id: state.run_id, stage, version, inputs, data })).slice(0, 20)}`;
    const envelope = { artifact_id: artifactId, run_id: state.run_id, stage, version,
      producer, created_at: now(), inputs, data };
    if (provenance) envelope.provenance = provenance;
    checkSchema(envelopeValidator, envelope, `${stage} envelope`);
    const bytes = JSON.stringify(envelope, null, 2);
    const file = this.artifactPath(state.run_id, stage, version);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, bytes, { flag: 'wx' });
    Object.assign(record, { status: 'completed', version, artifact_id: artifactId, sha256: sha(bytes), error: null });
    return envelope;
  }

  validateLinks(state, stage, data) {
    const rawText = fs.readFileSync(path.join(this.store, 'raw', `${state.raw_id}.txt`), 'utf8');
    const ids = outputIds(data);
    assert(unique(ids), `${stage}: 输出 ID 重复`);
    const prev = DEPENDS[stage][0] ? this.artifact(state, DEPENDS[stage][0]).data : null;
    const router = ['atomicizer', 'claims', 'family_builder', 'theme_builder', 'reconciler',
      'distiller', 'proposal'].includes(stage) ? this.artifact(state, 'router').data : null;
    const claims = ['family_builder', 'theme_builder', 'reconciler', 'distiller', 'proposal']
      .includes(stage) ? this.artifact(state, 'claims').data.claims : [];
    if (stage === 'router') for (const a of data.assets) {
      assert(a.raw_id === state.raw_id, 'router: raw_id 断裂');
      assert(rawText.slice(a.anchor.start, a.anchor.end) === a.anchor.quote, 'router: 引用不在 RAW 对应位置');
    }
    if (stage === 'router') {
      const covered = new Uint8Array(rawText.length);
      for (const a of data.assets) covered.fill(1, a.anchor.start, a.anchor.end);
      const gap = [...Array(rawText.length).keys()].find(i => !covered[i] && !/\s/u.test(rawText[i]));
      assert(gap === undefined, `router: RAW 第 ${gap} 个 UTF-16 位置未分流；请补拆件或待整理资产`);
    }
    if (stage === 'atomicizer') {
      const knowledge = router.assets.filter(a => a.type === 'knowledge');
      assert((data.unresolved_asset_ids ?? []).length === 0, 'atomicizer: 存在未处理知识资产');
      assert(data.atoms.length === knowledge.length, 'atomicizer: 知识类 RAW 拆件未全映射');
      assert(unique(data.atoms.map(a => a.asset_id)), 'atomicizer: 资产被重复映射');
      for (const atom of data.atoms) {
        const asset = knowledge.find(a => a.id === atom.asset_id);
        assert(asset && atom.raw_id === state.raw_id && JSON.stringify(atom.anchor) === JSON.stringify(asset.anchor),
          'atomicizer: atom 缺失资产/RAW 锚点');
        assert(atom.statement === atom.anchor.quote, 'atomicizer: 原子陈述不能覆盖原文证据');
      }
    }
    if (stage === 'claims') {
      assert(data.claims.length === prev.atoms.length, 'claims: 存在孤立 atom 或遗漏 Claim');
      assert(unique(data.claims.map(c => c.atom_id)), 'claims: atom 被重复绑定');
      for (const claim of data.claims) {
        const atom = prev.atoms.find(a => a.id === claim.atom_id);
        assert(atom && claim.raw_id === state.raw_id && JSON.stringify(claim.anchor) === JSON.stringify(atom.anchor)
          && claim.statement === atom.statement, 'claims: 引用/陈述断裂');
      }
    }
    if (stage === 'family_builder') {
      const all = data.families.flatMap(f => f.claim_ids);
      assert(unique(all) && all.length === claims.length && all.every(x => claims.some(c => c.id === x)),
        'family_builder: Claim 孤立、重复或错误引用');
    }
    if (stage === 'theme_builder') {
      const families = prev.families;
      const assigned = data.themes.flatMap(t => t.family_ids);
      assert(families.length > 0 && families.every(f => assigned.includes(f.id)), 'theme_builder: Family 未被主题覆盖');
      for (const theme of data.themes) {
        assert(theme.central_question?.trim() && theme.inclusion?.trim() && theme.exclusion?.trim(),
          'theme_builder: Theme 缺中心问题/纳入/排除条件');
        assert(unique(theme.family_ids) && theme.family_ids.every(x => families.some(f => f.id === x)),
          'theme_builder: Family 引用断裂');
      }
    }
    if (stage === 'reconciler') for (const edge of data.relations) {
      assert(edge.from_claim_id !== edge.to_claim_id && claims.some(c => c.id === edge.from_claim_id)
        && claims.some(c => c.id === edge.to_claim_id), 'reconciler: 关系端点断裂');
      if (['CONTRADICTS', 'RETRACTS'].includes(edge.type)) assert(edge.rationale?.trim(),
        'reconciler: 冲突/撤回必须记录双方判断依据');
    }
    if (stage === 'distiller') {
      const themes = this.artifact(state, 'theme_builder').data.themes;
      const families = this.artifact(state, 'family_builder').data.families;
      assert(data.distillations.length === themes.length, 'distiller: Theme 未全覆盖');
      assert(unique(data.distillations.map(d => d.theme_id)), 'distiller: Theme 被重复蒸馏');
      for (const item of data.distillations) {
        const theme = themes.find(t => t.id === item.theme_id);
        const allowed = new Set(families.filter(f => theme?.family_ids.includes(f.id)).flatMap(f => f.claim_ids));
        assert(theme && item.supporting_claim_ids.every(x => allowed.has(x)), 'distiller: 证据不属于对应 Theme');
      }
    }
    if (stage === 'proposal') {
      const distill = prev.distillations;
      for (const p of data.proposals) {
        assert(p.target === 'canonical_knowledge', '正式知识 Proposal 阶段只接受 canonical_knowledge；其它资产修订需独立审批流程');
        assert(p.supporting_claim_ids.every(x => claims.some(c => c.id === x))
          && p.conflict_claim_ids.every(x => claims.some(c => c.id === x)), 'proposal: Claim 引用断裂');
      }
      assert(distill.every(d => data.proposals.some(p => d.supporting_claim_ids.some(x => p.supporting_claim_ids.includes(x)))),
        'proposal: 蒸馏结果未形成可审阅提案');
    }
    if (stage === 'skill_candidate') for (const candidate of data.candidates) {
      const canonical = prev.canonical_versions;
      assert(candidate.canonical_ids.every(x => canonical.some(c => c.id === x)), 'Skill Candidate 缺 Canonical 依据');
      const allowedClaims = new Set(canonical.filter(c => candidate.canonical_ids.includes(c.id)).flatMap(c => c.source_claim_ids));
      assert(candidate.supporting_claim_ids.every(x => allowedClaims.has(x)), 'Skill Candidate Claim 与批准知识不一致');
      assert(assessSkillCandidate(candidate).destination === 'draft_skill_for_test_and_human_review',
        'Skill Candidate 未通过仓颉式晋级门');
    }
    if (stage === 'skill_builder') for (const draft of data.drafts)
      assert(prev.candidates.some(c => c.id === draft.candidate_id), 'Skill 草稿缺候选依据');
    if (stage === 'evaluator') for (const e of data.evaluations) {
      assert(prev.drafts.some(d => d.id === e.draft_id), '评测结果缺 Skill 草稿');
      assert(evaluatePaired(e.paired_judgements.map(j => j.vote)).recommendation === e.recommendation,
        'paired 建议与投票不一致');
      assert(unique(e.test_case_ids), '测试用例 ID 重复');
      assert(unique(e.test_results.map(t => t.case_id)) && e.test_results.length === e.test_case_ids.length
        && e.test_case_ids.every(x => e.test_results.some(t => t.case_id === x)), '真实任务输出/无 Skill baseline 不完整');
      assert(e.paired_judgements.length % 2 === 1 && unique(e.paired_judgements.map(j => j.judge_id)),
        'paired judge 必须是奇数且 judge_id 不重复');
      for (const t of e.test_results) {
        this.verifyEvaluationOutput(state.run_id, t.with_skill_output_id, 'with_skill', t.case_id);
        this.verifyEvaluationOutput(state.run_id, t.baseline_output_id, 'without_skill', t.case_id);
      }
      for (const j of e.paired_judgements) {
        this.verifyEvaluationOutput(state.run_id, j.before_output_id, 'before');
        this.verifyEvaluationOutput(state.run_id, j.after_output_id, 'after');
      }
      if (e.recommendation === 'keep') assert(e.test_results.every(t => t.assertion_passed),
        'Skill 输出断言未全部通过，不能建议 keep');
    }
  }

  gateNeeded(stage, data) {
    if (stage === 'router') return (data.risk_flags ?? []).length > 0 || data.assets.some(a => a.type === 'unorganized');
    if (stage === 'theme_builder') return data.major_change && data.major_change !== 'none';
    if (stage === 'reconciler') return data.version_judgement === true || data.relations.some(r => ['CONTRADICTS', 'RETRACTS'].includes(r.type));
    if (stage === 'proposal') return data.proposals.length > 0;
    if (stage === 'skill_candidate') return data.candidates.length > 0;
    if (stage === 'evaluator') return data.evaluations.some(e => e.recommendation === 'keep');
    return false;
  }

  submit(runId, stage, output, { producer = 'model', provenance = null } = {}) {
    const state = this.loadState(runId);
    this.preconditions(state, stage);
    let data;
    try {
      data = typeof output === 'string' ? JSON.parse(output) : output;
      checkSchema(stageValidator[stage], data, stage);
      this.validateLinks(state, stage, data);
    } catch (error) {
      Object.assign(state.stages[stage], { status: 'failed', error: error.message });
      state.status = 'failed'; state.current_stage = stage;
      this.saveState(state);
      this.audit(runId, { stage, input_ids: DEPENDS[stage].map(d => state.stages[d].artifact_id),
        output_ids: [], model_agent: producer, result: 'failed', error: error.message });
      throw error;
    }
    const envelope = this.commitArtifact(state, stage, data, producer, provenance);
    const gate = GATES[stage];
    if (gate && this.gateNeeded(stage, data)) {
      state.stages[stage].status = 'waiting_review';
      state.checkpoints[gate] = { status: 'waiting_user_approval', stage,
        reason: `${gate} 需要用户审阅阶段产物`,
        proposal_ids: stage === 'proposal' ? data.proposals.map(p => p.id) : [] };
      state.status = 'waiting_user_approval'; state.current_stage = stage;
    } else {
      state.status = 'running'; state.current_stage = STAGES[STAGES.indexOf(stage) + 1] ?? null;
    }
    if (stage === 'router' && !data.assets.some(a => a.type === 'knowledge') && state.stages[stage].status === 'completed') {
      for (const later of STAGES.slice(STAGES.indexOf('atomicizer'))) state.stages[later].status = 'not_applicable';
      state.status = 'completed_nonknowledge'; state.current_stage = null;
    }
    if (stage === 'skill_candidate' && data.candidates.length === 0) {
      for (const later of ['skill_builder', 'evaluator', 'skill_publish']) state.stages[later].status = 'not_applicable';
      state.status = 'completed'; state.current_stage = null;
    }
    if (stage === 'evaluator' && data.evaluations.some(e => e.recommendation === 'revert')) {
      this.invalidate(state, 'skill_builder', 'paired judge 推荐 revert');
      state.status = 'needs_revision'; state.current_stage = 'skill_builder';
    }
    this.saveState(state);
    this.audit(runId, { stage, input_ids: envelope.inputs.map(x => x.artifact_id),
      output_ids: outputIds(data), model_agent: producer, result: state.stages[stage].status });
    return { state, artifact: envelope };
  }

  createProposal(runId, proposals, options = {}) {
    return this.submit(runId, 'proposal', { proposals }, options);
  }

  decisionSignature(decision) {
    return this.reviewCrypto.sign(decision);
  }
  verifyDecision(decision) {
    return this.reviewCrypto.verify(decision);
  }
  assertReviewSigner() {
    assert(this.reviewCrypto.canSign(),
      '此操作需要 Review Service 的签名能力；Agent Runtime 只能持有公钥，不能记录审批或执行正式写入');
  }

  recordDecision(runId, { checkpoint, proposalId = null, decision, acceptedChanges = [],
    rejectedChanges = [], reviewer = 'user' }, { actor = 'ai' } = {}) {
    assert(actor === 'user_review_service', 'AI 无权记录审批决定');
    this.assertReviewSigner();
    const state = this.loadState(runId);
    const cp = state.checkpoints[checkpoint];
    assert(cp?.status === 'waiting_user_approval', 'Checkpoint 不在等待用户审阅');
    assert(['approved', 'rejected', 'partial'].includes(decision), '非法审批决定');
    assert(decision !== 'partial' || checkpoint === 'canonical_proposal', 'partial 只适用于 Proposal');
    if (checkpoint === 'canonical_proposal') {
      assert(cp.proposal_ids.includes(proposalId), 'Proposal 不属于当前 Checkpoint');
      assert(!state.decisions.some(d => d.checkpoint === checkpoint && d.proposal_id === proposalId
        && d.source_artifact_id === state.stages[cp.stage].artifact_id), '当前 Proposal 已审阅');
      const proposal = this.artifact(state, 'proposal').data.proposals.find(p => p.id === proposalId);
      if (decision === 'approved') acceptedChanges = [proposal.text];
      if (decision === 'partial') assert(acceptedChanges.length > 0 && acceptedChanges.every(x => typeof x === 'string' && x.trim()),
        '部分接受必须明确保存被接受的变更');
      if (decision === 'rejected') { acceptedChanges = []; rejectedChanges = [proposal.text]; }
    } else {
      assert(proposalId === null, '非 Proposal Gate 不接收 proposalId');
      assert(decision !== 'partial', '此 Gate 只接受或拒绝');
    }
    const unsigned = { id: `decision_${crypto.randomUUID()}`, checkpoint, proposal_id: proposalId,
      source_artifact_id: state.stages[cp.stage].artifact_id, decision, approved_by: reviewer,
      approved_at: now(), accepted_changes: acceptedChanges, rejected_changes: rejectedChanges,
      signature: '' };
    const record = this.decisionSignature(unsigned);
    state.decisions.push(record);
    if (checkpoint === 'canonical_proposal') {
      const current = state.decisions.filter(d => d.checkpoint === checkpoint
        && d.source_artifact_id === state.stages.proposal.artifact_id);
      if (cp.proposal_ids.every(p => current.some(d => d.proposal_id === p))) {
        const accepted = current.some(d => ['approved', 'partial'].includes(d.decision));
        cp.status = accepted ? 'approved' : 'rejected';
        state.stages.proposal.status = 'completed';
        state.status = accepted ? 'running' : 'rejected';
        state.current_stage = accepted ? 'canonical' : null;
        if (!accepted) state.stages.canonical.status = 'not_applicable';
      }
    } else if (decision === 'approved') {
      cp.status = 'approved'; state.stages[cp.stage].status = 'completed';
      state.status = 'running'; state.current_stage = STAGES[STAGES.indexOf(cp.stage) + 1] ?? null;
      if (cp.stage === 'router' && !this.artifact(state, 'router').data.assets.some(a => a.type === 'knowledge')) {
        for (const later of STAGES.slice(STAGES.indexOf('atomicizer'))) state.stages[later].status = 'not_applicable';
        state.status = 'completed_nonknowledge'; state.current_stage = null;
      }
    } else {
      cp.status = 'rejected'; this.invalidate(state, cp.stage, `用户拒绝 ${checkpoint}`);
      state.status = 'needs_revision'; state.current_stage = cp.stage;
    }
    this.saveState(state);
    this.audit(runId, { stage: cp.stage, input_ids: [record.source_artifact_id], output_ids: [record.id],
      model_agent: reviewer, result: `checkpoint_${cp.status}`, user_decision: record });
    return { state, decision: record };
  }

  applyApprovedProposals(runId, { actor = 'ai' } = {}) {
    assert(actor === 'user_review_service', 'AI 无权写 Canonical Knowledge');
    this.assertReviewSigner();
    const state = this.loadState(runId);
    assert(state.stages.proposal.status === 'completed' && state.checkpoints.canonical_proposal?.status === 'approved',
      '未经批准的 Proposal 不能写正式知识');
    assert(state.stages.canonical.status === 'not_started', 'Canonical 已写入；不能覆盖');
    const proposals = this.artifact(state, 'proposal').data.proposals;
    const decisions = state.decisions.filter(d => d.checkpoint === 'canonical_proposal'
      && d.source_artifact_id === state.stages.proposal.artifact_id && this.verifyDecision(d));
    assert(proposals.every(p => decisions.some(d => d.proposal_id === p.id)), 'Proposal 审批记录不完整');
    const versions = [];
    for (const p of proposals) {
      const decision = decisions.find(d => d.proposal_id === p.id);
      if (decision.decision === 'rejected') continue;
      for (const [index, text] of decision.accepted_changes.entries()) versions.push({
        id: `canonical_${sha(`${runId}:${p.id}:${index}:${text}`).slice(0, 20)}`,
        proposal_id: p.id, text, approved_decision_id: decision.id,
        source_claim_ids: p.supporting_claim_ids });
    }
    assert(versions.length > 0, '没有被批准的正式知识变更');
    const data = { canonical_versions: versions };
    checkSchema(stageValidator.canonical, data, 'canonical');
    const envelope = this.commitArtifact(state, 'canonical', data, 'protected_review_service');
    for (const item of versions) {
      const file = path.join(this.store, 'canonical', `${item.id}.json`);
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, JSON.stringify({ ...item, run_id: runId,
        artifact_id: envelope.artifact_id }, null, 2), { flag: 'wx' });
    }
    state.status = 'running'; state.current_stage = 'skill_candidate';
    this.saveState(state);
    this.audit(runId, { stage: 'canonical', input_ids: [state.stages.proposal.artifact_id],
      output_ids: versions.map(v => v.id), model_agent: 'protected_review_service', result: 'completed' });
    return { state, versions };
  }

  invalidate(state, stage, reason) {
    const start = STAGES.indexOf(stage);
    assert(start >= 0 && stage !== 'intake', '不能退回 RAW intake');
    for (const [index, s] of STAGES.entries()) if (index >= start && state.stages[s].status !== 'not_applicable') {
      state.stages[s].status = index === start ? 'needs_revision' : 'stale';
      state.stages[s].error = reason;
      if (GATES[s]) delete state.checkpoints[GATES[s]];
    }
  }
  rollback(runId, stage, { actor = 'user_review_service', reason = '人工判定产物有问题' } = {}) {
    assert(actor === 'user_review_service', 'AI 无权主动退回已批准阶段');
    this.assertReviewSigner();
    const state = this.loadState(runId);
    assert(state.stages[stage]?.artifact_id, `${stage} 没有可退回产物`);
    assert(!['canonical', 'skill_publish'].includes(stage), '正式知识/Skill 不做破坏性回滚；请提交修订 Proposal');
    this.invalidate(state, stage, reason);
    state.status = 'needs_revision'; state.current_stage = stage;
    this.saveState(state);
    this.audit(runId, { stage, input_ids: [state.stages[stage].artifact_id], output_ids: [],
      model_agent: actor, result: 'rollback_needs_revision', error: reason });
    return state;
  }
  retry(runId, stage, output, options = {}) {
    const state = this.loadState(runId);
    assert(['failed', 'needs_revision', 'stale'].includes(state.stages[stage]?.status),
      'retry 仅用于失败、退回或 stale 阶段');
    return this.submit(runId, stage, output, options);
  }
  reportFailure(runId, stage, { error, producer = 'model_runner' } = {}) {
    const state = this.loadState(runId);
    this.preconditions(state, stage);
    assert(typeof error === 'string' && error.trim(), '失败原因必须非空');
    state.stages[stage].status = 'failed'; state.stages[stage].error = error;
    state.status = 'failed'; state.current_stage = stage;
    this.saveState(state);
    this.audit(runId, { stage, input_ids: DEPENDS[stage].map(d => state.stages[d].artifact_id),
      output_ids: [], model_agent: producer, result: 'failed', error });
    return state;
  }
  resume(runId) {
    const state = this.loadState(runId);
    const waiting = Object.entries(state.checkpoints).find(([, c]) => c.status === 'waiting_user_approval');
    if (waiting) return { run_id: runId, status: 'waiting_user_approval', required_action: 'review',
      next_stage: null, checkpoint: waiting[0], reason: waiting[1].reason, state };
    if (['completed', 'completed_nonknowledge', 'rejected'].includes(state.status))
      return { run_id: runId, status: state.status, required_action: 'done',
        next_stage: null, checkpoint: null, state };
    const next = STAGES.find(s => ['not_started', 'failed', 'needs_revision', 'stale'].includes(state.stages[s].status)
      && (s === 'intake' || DEPENDS[s].every(d => state.stages[d].status === 'completed')));
    const stage = next ?? state.current_stage;
    let requiredAction = 'execute';
    if (stage === 'canonical') requiredAction = 'apply_approved_proposals';
    else if (stage === 'skill_publish') requiredAction = 'publish_approved_skill';
    else if (stage && ['failed', 'needs_revision', 'stale'].includes(state.stages[stage]?.status)) requiredAction = 'retry';
    else if (!stage) requiredAction = 'done';
    return { run_id: runId, status: state.status, required_action: requiredAction, next_stage: stage,
      checkpoint: null, state };
  }
  traceCanonical(runId, canonicalId) {
    const state = this.loadState(runId);
    const canonical = this.artifact(state, 'canonical').data.canonical_versions.find(c => c.id === canonicalId);
    assert(canonical, '找不到此 Canonical');
    const proposal = this.artifact(state, 'proposal').data.proposals.find(p => p.id === canonical.proposal_id);
    const claims = this.artifact(state, 'claims').data.claims.filter(c => canonical.source_claim_ids.includes(c.id));
    const families = this.artifact(state, 'family_builder').data.families.filter(f => claims.some(c => f.claim_ids.includes(c.id)));
    const themes = this.artifact(state, 'theme_builder').data.themes.filter(t => families.some(f => t.family_ids.includes(f.id)));
    return { canonical, proposal, themes, families, claims, raw_ids: [...new Set(claims.map(c => c.raw_id))] };
  }

  publishApprovedSkill(runId, { actor = 'ai' } = {}) {
    assert(actor === 'user_review_service', 'AI 无权发布正式 Skill');
    this.assertReviewSigner();
    const state = this.loadState(runId);
    assert(state.stages.evaluator.status === 'completed' && state.checkpoints.skill_publication?.status === 'approved',
      '发布前缺真实评测结果或 Gate F 审批');
    assert(state.stages.skill_publish.status === 'not_started', '正式 Skill 已发布；不能覆盖');
    const approval = state.decisions.find(d => d.checkpoint === 'skill_publication'
      && d.source_artifact_id === state.stages.evaluator.artifact_id && d.decision === 'approved');
    assert(approval && this.verifyDecision(approval), '发布审批记录无法验证');
    const evaluations = this.artifact(state, 'evaluator').data.evaluations;
    const skills = evaluations.filter(e => e.recommendation === 'keep').map(e => ({
      id: `formal_skill_${sha(`${runId}:${e.draft_id}:${e.id}`).slice(0, 20)}`,
      draft_id: e.draft_id, evaluation_id: e.id, approved_decision_id: approval.id }));
    assert(skills.length > 0, '没有可发布的通过评测 Skill');
    const data = { formal_skills: skills };
    const envelope = this.commitArtifact(state, 'skill_publish', data, 'protected_review_service');
    for (const skill of skills) {
      const file = path.join(this.store, 'formal-skills', `${skill.id}.json`);
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, JSON.stringify({ ...skill, run_id: runId,
        artifact_id: envelope.artifact_id }, null, 2), { flag: 'wx' });
    }
    state.status = 'completed'; state.current_stage = null;
    this.saveState(state);
    this.audit(runId, { stage: 'skill_publish', input_ids: [state.stages.evaluator.artifact_id],
      output_ids: skills.map(s => s.id), model_agent: 'protected_review_service', result: 'completed' });
    return { state, skills };
  }

  overwriteRaw() { throw new Error('RAW immutable=true；服务不提供覆盖操作'); }
  directWriteCanonical() { throw new Error('AI 无权直接写 Canonical；必须 create_proposal → 审批 → applyApprovedProposals'); }
}
