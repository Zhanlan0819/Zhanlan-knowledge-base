import fs from 'node:fs';
import path from 'node:path';
import { WorkflowService as LegacyWorkflowService, STAGES, GATES } from './workflow.js';
import { exportDeliveryBundle } from './delivery.js';

const assert = (condition, message) => { if (!condition) throw new Error(message); };

function parseOutput(output) {
  return typeof output === 'string' ? JSON.parse(output) : output;
}

function governanceFromClaim(claim) {
  const map = {
    explicit: { source_type: 'explicit_source', verification_status: 'reference_only', confidence: 'medium',
      use_scope: '可作为有原文锚点的明确陈述使用，但锚点验证不等于事实已被外部验证。',
      forbidden_inference: '不得把“原文明确说过”升级成“已经证明为真”。' },
    attributed: { source_type: 'attributed_external', verification_status: 'unverified', confidence: 'low',
      use_scope: '可作为署名/外部观点引用，使用时必须保留归属。',
      forbidden_inference: '不得改写成用户自己的经验、事实或已验证规律。' },
    editor_inference: { source_type: 'editor_inference', verification_status: 'unverified', confidence: 'low',
      use_scope: '仅可作为整理阶段的推断候选。',
      forbidden_inference: '不得伪装成来源原话或正式知识事实。' },
    visual_unverified: { source_type: 'visual_unverified', verification_status: 'unverified', confidence: 'low',
      use_scope: '仅作视觉材料转写参考，需二次核验。',
      forbidden_inference: '不得把图片/视觉转写直接当作已验证事实。' }
  };
  return map[claim.source_status] ?? map.editor_inference;
}

function validatePromotionAudit(canonicalIds, audit, candidates) {
  assert(audit && Array.isArray(audit.items), 'skill_candidate 必须附带 Skill 晋级审计，不能只返回 candidates');
  const ids = audit.items.map(x => x.canonical_id);
  assert(new Set(ids).size === ids.length, 'Skill 晋级审计 canonical_id 重复');
  assert(canonicalIds.length === ids.length && canonicalIds.every(id => ids.includes(id)),
    'Skill 晋级审计必须逐条覆盖全部 Canonical，不能用空 candidates 直接跳过');
  const allowed = new Set(['promoted', 'not_skill', 'needs_more_evidence', 'covered_by_existing_skill']);
  for (const item of audit.items) {
    assert(allowed.has(item.outcome), `非法 Skill 晋级结果: ${item.outcome}`);
    assert(typeof item.reason === 'string' && item.reason.trim(), 'Skill 晋级审计每条必须写明 reason');
  }
  const promotedCanonical = new Set(audit.items.filter(x => x.outcome === 'promoted').map(x => x.canonical_id));
  for (const candidate of candidates) for (const id of candidate.canonical_ids)
    assert(promotedCanonical.has(id), 'Candidate 引用了未在晋级审计中标记 promoted 的 Canonical');
  for (const id of promotedCanonical)
    assert(candidates.some(c => c.canonical_ids.includes(id)), '晋级审计标记 promoted，但没有生成 Candidate');
}

function validateCoverageAudit(userBrief, audit) {
  if (!userBrief) return;
  assert(audit && Array.isArray(audit.goals) && audit.goals.length > 0,
    '有 user_brief 时，distiller 必须附带目标覆盖审计');
  for (const goal of audit.goals) {
    assert(typeof goal.goal === 'string' && goal.goal.trim(), '目标覆盖审计缺 goal');
    assert(['critical','high','normal','low'].includes(goal.priority), '目标覆盖审计 priority 非法');
    assert(['covered','partial','uncovered'].includes(goal.status), '目标覆盖审计 status 非法');
    assert(Array.isArray(goal.evidence_ids), '目标覆盖审计 evidence_ids 必须是数组');
    assert(typeof goal.reason === 'string' && goal.reason.trim(), '目标覆盖审计缺 reason');
  }
  const blocked = audit.goals.filter(g => ['critical','high'].includes(g.priority) && g.status === 'uncovered');
  assert(blocked.length === 0, `关键目标未覆盖: ${blocked.map(x => x.goal).join('；')}`);
}

export class WorkflowService extends LegacyWorkflowService {
  invalidate(state, stage, reason) {
    const start = STAGES.indexOf(stage);
    assert(start >= 0 && stage !== 'intake', '不能退回 RAW intake');
    for (const [index, s] of STAGES.entries()) {
      if (index < start || state.stages[s].status === 'not_applicable') continue;
      if (index === start) {
        state.stages[s].status = 'needs_revision';
        state.stages[s].error = reason;
      } else {
        // 历史 Artifact 文件保留在磁盘和 state-history，但活动指针复位。
        // 这修复了 v0.6.2 的 stale -> apply 必败问题。
        state.stages[s].status = 'not_started';
        state.stages[s].artifact_id = null;
        state.stages[s].sha256 = null;
        state.stages[s].error = null;
      }
      if (GATES[s]) delete state.checkpoints[GATES[s]];
    }
  }

  rollback(runId, stage, options = {}) {
    const state = this.loadState(runId);
    const targetIndex = STAGES.indexOf(stage);
    const canonicalIndex = STAGES.indexOf('canonical');
    if (state.stages.canonical.status === 'completed' && targetIndex >= 0 && targetIndex < canonicalIndex)
      throw new Error('正式知识已写入后禁止回滚上游并改写同一 run；请新建修订 Proposal/run，保持 Canonical 追加式历史');
    if (state.stages.skill_publish.status === 'completed')
      throw new Error('正式 Skill 已发布后禁止破坏性回滚；请创建新候选版本并重新评测');
    return super.rollback(runId, stage, options);
  }

  recordDecision(runId, input, options = {}) {
    if (input.checkpoint !== 'canonical_proposal') {
      assert(!input.proposalId, '非 Proposal Gate 不接收 proposalId');
      assert(!(input.acceptedChanges?.length) && !(input.rejectedChanges?.length),
        '非 Proposal Gate 禁止自由文本 accepted/rejected；审批只绑定当前 Artifact 与 approve/reject，避免签错选项');
      input = { ...input, acceptedChanges: [], rejectedChanges: [] };
    }
    return super.recordDecision(runId, input, options);
  }

  submit(runId, stage, output, options = {}) {
    let data;
    try { data = parseOutput(output); }
    catch {
      // 交给基础 WorkflowService 记录标准 failed/audit 状态，而不是在保护层提前吞掉。
      return super.submit(runId, stage, output, options);
    }
    const stateBefore = this.loadState(runId);
    try {
      if (stage === 'skill_candidate') {
        const canonicalIds = this.artifact(stateBefore, 'canonical').data.canonical_versions.map(x => x.id);
        validatePromotionAudit(canonicalIds, options.promotionAudit, data.candidates ?? []);
      }
      if (stage === 'distiller') validateCoverageAudit(stateBefore.user_brief, options.coverageAudit);
    } catch (error) {
      // 治理 sidecar 也是正式阶段契约的一部分。缺失/不完整时应像 Schema 失败一样
      // 留下 failed 状态与 AUDIT，这样 retry 可以正常重做，而不是停在半失败状态。
      this.reportFailure(runId, stage, {
        error: error.message,
        producer: options.producer ?? 'runtime_governance'
      });
      throw error;
    }

    const result = super.submit(runId, stage, data, options);
    if (stage === 'claims') this.writeSourceGovernance(runId, data.claims);
    if (stage === 'distiller' && options.coverageAudit) this.writeGovernance(runId, 'coverage-audit.json', options.coverageAudit);
    if (stage === 'skill_candidate' && options.promotionAudit)
      this.writeGovernance(runId, 'skill-promotion-audit.json', options.promotionAudit);

    if (['completed', 'completed_nonknowledge'].includes(result.state.status)) {
      const delivery = exportDeliveryBundle(this, runId);
      result.delivery = delivery;
    }
    return result;
  }

  writeGovernance(runId, name, data) {
    const dir = path.join(this.runDir(runId), 'governance');
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, name);
    const bytes = JSON.stringify({ schema_version: '0.6.3', run_id: runId, generated_at: new Date().toISOString(), ...data }, null, 2);
    fs.writeFileSync(file, bytes, 'utf8');
    return file;
  }

  writeSourceGovernance(runId, claims) {
    return this.writeGovernance(runId, 'source-governance.json', {
      claims: claims.map(claim => ({ claim_id: claim.id, source_status: claim.source_status, ...governanceFromClaim(claim) }))
    });
  }

  exportDeliveryBundle(runId, options = {}) {
    return exportDeliveryBundle(this, runId, options);
  }

  publishApprovedSkill(runId, options = {}) {
    const result = super.publishApprovedSkill(runId, options);
    const state = result.state;
    const drafts = this.artifact(state, 'skill_builder').data.drafts;
    const evaluations = this.artifact(state, 'evaluator').data.evaluations;
    const candidates = this.artifact(state, 'skill_candidate').data.candidates;

    for (const skill of result.skills) {
      const evaluation = evaluations.find(e => e.id === skill.evaluation_id);
      const draft = drafts.find(d => d.id === skill.draft_id);
      const candidate = candidates.find(c => c.id === draft?.candidate_id);
      assert(evaluation && draft && candidate, '正式 Skill 缺 draft/evaluation/candidate 依据');
      const dir = path.join(this.store, 'formal-skills', skill.id);
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, 'SKILL.md'), draft.skill_md, 'utf8');
      fs.writeFileSync(path.join(dir, 'metadata.json'), JSON.stringify({
        ...skill,
        run_id: runId,
        candidate_id: candidate.id,
        canonical_ids: candidate.canonical_ids,
        supporting_claim_ids: candidate.supporting_claim_ids,
        generated_at: new Date().toISOString()
      }, null, 2), 'utf8');
      fs.writeFileSync(path.join(dir, 'test-prompts.json'), JSON.stringify({
        schema_version: '0.6.3',
        evaluation_id: evaluation.id,
        test_case_ids: evaluation.test_case_ids,
        note: '本文件保存评测 case ID 与发布关联；真实输入/输出仍在 evaluation-outputs 与 evaluator Artifact 中。'
      }, null, 2), 'utf8');
    }
    result.delivery = exportDeliveryBundle(this, runId);
    return result;
  }
}

export { STAGES, GATES };
