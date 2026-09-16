import fs from 'node:fs';
import { WorkflowService } from './workflow.js';
import { AgentRuntime, ExternalCommandModelAdapter } from './agent-runtime.js';
import { specialistVisibilityReport } from './stage-registry.js';
import { presentResume, stageLabel, statusLabel, assetTypeLabel } from './display-labels.js';

function flag(name) { const i = process.argv.indexOf(name); return i < 0 ? null : process.argv[i + 1]; }
const print = value => process.stdout.write(JSON.stringify(value, null, 2) + '\n');
const action = process.argv[2];
const store = flag('--store');

function readOptionalFile(envName) {
  const file = process.env[envName];
  return file ? fs.readFileSync(file, 'utf8') : null;
}

function reviewerOptions() {
  return {
    reviewerSecret: process.env.KB_REVIEW_SECRET ?? null,
    reviewerPublicKey: readOptionalFile('KB_REVIEW_PUBLIC_KEY_FILE'),
    reviewerPrivateKey: readOptionalFile('KB_REVIEW_PRIVATE_KEY_FILE'),
    reviewKeyId: process.env.KB_REVIEW_KEY_ID ?? 'review-ed25519-v1'
  };
}

function hasReviewSigner() {
  return Boolean(process.env.KB_REVIEW_PRIVATE_KEY_FILE || process.env.KB_REVIEW_SECRET);
}

function modelAdapterFromEnv() {
  const command = process.env.KB_MODEL_COMMAND;
  if (!command) throw new Error('run-stage/run-until-stop 需要 KB_MODEL_COMMAND');
  let args = [];
  if (process.env.KB_MODEL_ARGS_JSON) {
    args = JSON.parse(process.env.KB_MODEL_ARGS_JSON);
    if (!Array.isArray(args) || !args.every(x => typeof x === 'string'))
      throw new Error('KB_MODEL_ARGS_JSON 必须是 JSON 字符串数组');
  }
  return new ExternalCommandModelAdapter({ command, args, id: process.env.KB_MODEL_ID ?? `external:${command}` });
}

try {
  if (action === 'skill-visibility') {
    print(specialistVisibilityReport());
    process.exit(0);
  }
  if (!store) throw new Error('需要 --store DIR');
  const service = new WorkflowService(store, reviewerOptions());
  if (action === 'start' || action === 'demo') {
    const input = flag('--input'), annotations = flag('--annotations');
    if (!input || !annotations) throw new Error(`${action} 需要 --input TXT --annotations JSON`);
    const started = service.start({ bytes: fs.readFileSync(input),
      annotations: JSON.parse(fs.readFileSync(annotations, 'utf8')) });
    const runId = started.run_id;
    if (action === 'start') print({ run_id: runId, state_path: service.statePath(runId), next_stage: 'router',
      required_action: 'execute', suggestion_run_id: started.state.suggestion_run_id });
    else {
      const s = started.suggestion;
      service.submit(runId, 'router', { assets: s.assets, risk_flags: [] }, { producer: 'fixture_adapter' });
      service.submit(runId, 'atomicizer', { atoms: s.atoms }, { producer: 'fixture_adapter' });
      service.submit(runId, 'claims', { claims: s.claims }, { producer: 'fixture_adapter' });
      service.submit(runId, 'family_builder', { families: s.families }, { producer: 'fixture_adapter' });
      service.submit(runId, 'theme_builder', { themes: s.themes, major_change: 'none' }, { producer: 'fixture_adapter' });
      service.submit(runId, 'reconciler', { relations: s.relations, version_judgement: false }, { producer: 'fixture_adapter' });
      const distillations = s.themes.map(t => {
        const linked = s.families.filter(f => t.family_ids.includes(f.id)).flatMap(f => f.claim_ids);
        const proposal = s.proposals.find(p => p.supporting_claim_ids.some(x => linked.includes(x)));
        return { id: `distillation_${t.id}`, theme_id: t.id,
          supporting_claim_ids: proposal.supporting_claim_ids, text: proposal.text, status: 'provisional' };
      });
      service.submit(runId, 'distiller', { distillations }, { producer: 'fixture_adapter' });
      service.submit(runId, 'proposal', { proposals: s.proposals }, { producer: 'fixture_adapter' });
      const r = service.resume(runId);
      print({ run_id: runId, status: r.status, required_action: r.required_action,
        checkpoint: r.checkpoint, reason: r.reason, state_path: service.statePath(runId),
        proposal_ids: s.proposals.map(p => p.id),
        stage_summary: Object.fromEntries(Object.entries(r.state.stages).map(([k, v]) => [k, v.status])) });
    }
  } else {
    const runId = flag('--run');
    if (!runId) throw new Error(`${action} 需要 --run RUN_ID`);
    if (action === 'view') {
      const r = service.resume(runId);
      print({
        ...presentResume(r),
        '各步骤': Object.fromEntries(Object.entries(r.state.stages).map(([k, v]) => [stageLabel(k), statusLabel(v.status)])),
        ...(r.state.stages.router?.artifact_id ? {
          '内容类型': [...new Set(service.artifact(r.state, 'router').data.assets.map(a => assetTypeLabel(a.type)))]
        } : {})
      });
    } else if (action === 'status' || action === 'resume') {
      const r = service.resume(runId);
      print({ run_id: runId, status: r.status, required_action: r.required_action, next_stage: r.next_stage,
        checkpoint: r.checkpoint, reason: r.reason ?? null,
        stages: Object.fromEntries(Object.entries(r.state.stages).map(([k, v]) => [k, v.status])) });
    } else if (action === 'prepare-stage') {
      const runtime = new AgentRuntime({ service });
      const prepared = runtime.prepareStage(runId);
      print(prepared.runnable ? prepared.request : { runnable: false, ...prepared.resumed });
    } else if (action === 'run-stage' || action === 'run-until-stop') {
      const runtime = new AgentRuntime({ service, modelAdapter: modelAdapterFromEnv(),
        maxAutoSteps: Number(flag('--max-steps') ?? 20) });
      print(action === 'run-stage' ? runtime.runOne(runId) : runtime.runUntilStop(runId));
    } else if (action === 'submit' || action === 'retry') {
      const stage = flag('--stage'), file = flag('--output');
      if (!stage || !file) throw new Error(`${action} 需要 --stage STAGE --output JSON`);
      const bytes = fs.readFileSync(file, 'utf8');
      const result = action === 'submit' ? service.submit(runId, stage, bytes) : service.retry(runId, stage, bytes);
      print({ run_id: runId, stage, status: result.state.stages[stage].status, checkpoint: result.state.checkpoints });
    } else if (action === 'fail') {
      const stage = flag('--stage'), error = flag('--error');
      if (!stage || !error) throw new Error('fail 需要 --stage STAGE --error MESSAGE');
      const state = service.reportFailure(runId, stage, { error });
      print({ run_id: runId, stage, status: state.stages[stage].status, error });
    } else if (action === 'record-output') {
      const caseId = flag('--case'), variant = flag('--variant'), input = flag('--input');
      if (!caseId || !variant || !input) throw new Error('record-output 需要 --case ID --variant with_skill|without_skill|before|after --input FILE');
      const output = service.recordEvaluationOutput(runId, { caseId, variant, bytes: fs.readFileSync(input) });
      print({ run_id: runId, output_id: output.id, variant: output.variant });
    } else if (action === 'decision' || action === 'rollback' || action === 'apply' || action === 'publish') {
      if (!process.stdin.isTTY || !hasReviewSigner())
        throw new Error('此命令只允许真人审阅终端运行，并需 KB_REVIEW_PRIVATE_KEY_FILE（推荐）或旧版 KB_REVIEW_SECRET');
      if (action === 'decision') {
        const checkpoint = flag('--checkpoint'), decision = flag('--decision'), proposalId = flag('--proposal');
        if (!checkpoint || !decision) throw new Error('decision 需要 --checkpoint GATE --decision approved|rejected|partial');
        const result = service.recordDecision(runId, { checkpoint, decision,
          proposalId: proposalId ?? null, acceptedChanges: flag('--accepted') ? [flag('--accepted')] : [] },
          { actor: 'user_review_service' });
        print({ run_id: runId, decision_id: result.decision.id,
          signature_alg: result.decision.signature_alg ?? 'legacy', state_status: result.state.status });
      } else if (action === 'rollback') {
        const stage = flag('--stage');
        if (!stage) throw new Error('rollback 需要 --stage STAGE');
        const state = service.rollback(runId, stage, { actor: 'user_review_service',
          reason: flag('--reason') ?? '人工退回' });
        print({ run_id: runId, status: state.status, next_stage: state.current_stage });
      } else if (action === 'apply') {
        const result = service.applyApprovedProposals(runId, { actor: 'user_review_service' });
        print({ run_id: runId, canonical_ids: result.versions.map(x => x.id) });
      } else {
        const result = service.publishApprovedSkill(runId, { actor: 'user_review_service' });
        print({ run_id: runId, formal_skill_ids: result.skills.map(x => x.id) });
      }
    } else if (action === 'trace') {
      const id = flag('--canonical');
      if (!id) throw new Error('trace 需要 --canonical ID');
      print(service.traceCanonical(runId, id));
    } else throw new Error('可用命令: skill-visibility, start, demo, view, status, resume, prepare-stage, run-stage, run-until-stop, submit, retry, fail, record-output, decision, apply, publish, rollback, trace');
  }
} catch (error) { process.stderr.write(`错误: ${error.message}\n`); process.exitCode = 1; }
