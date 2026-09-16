import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { buildStageContext, loadStageInstruction, DEFAULT_PROJECT_ROOT } from './stage-registry.js';
import { presentResume, presentStageHistory, stageLabel } from './display-labels.js';
import { buildCurrentView, buildStageReport } from './user-presentation.js';

const sha = value => crypto.createHash('sha256').update(value).digest('hex');
const readJson = file => JSON.parse(fs.readFileSync(file, 'utf8'));

function readWorkflowSchema(projectRoot) {
  return readJson(path.resolve(projectRoot, 'schemas/workflow-artifacts.schema.json'));
}

function referencedSchemas(projectRoot, stageSchema) {
  const text = JSON.stringify(stageSchema ?? {});
  const result = {};
  if (text.includes('https://local.invalid/kb/run.schema.json'))
    result['run.schema.json'] = readJson(path.resolve(projectRoot, 'schemas/run.schema.json'));
  if (text.includes('https://local.invalid/kb/skill-candidate.schema.json'))
    result['skill-candidate.schema.json'] = readJson(path.resolve(projectRoot, 'schemas/skill-candidate.schema.json'));
  return result;
}

export class ExternalCommandModelAdapter {
  constructor({ command, args = [], env = process.env, id = null, maxBuffer = 16 * 1024 * 1024 } = {}) {
    if (typeof command !== 'string' || !command.trim()) throw new Error('ExternalCommandModelAdapter 需要 command');
    if (!Array.isArray(args) || !args.every(x => typeof x === 'string')) throw new Error('model args 必须是字符串数组');
    this.command = command;
    this.args = args;
    this.env = env;
    this.id = id ?? `external:${path.basename(command)}`;
    this.maxBuffer = maxBuffer;
  }

  generate(request) {
    const result = spawnSync(this.command, this.args, {
      input: JSON.stringify(request), encoding: 'utf8', env: this.env, maxBuffer: this.maxBuffer,
      windowsHide: true, shell: false
    });
    if (result.error) throw result.error;
    if (result.status !== 0) throw new Error(`模型命令退出码 ${result.status}: ${(result.stderr || '').trim()}`);
    const stdout = (result.stdout || '').trim();
    if (!stdout) throw new Error('模型命令没有返回 JSON');
    const parsed = JSON.parse(stdout);
    return Object.hasOwn(parsed, 'output') ? parsed.output : parsed;
  }
}

export class AgentRuntime {
  constructor({ service, modelAdapter = null, projectRoot = DEFAULT_PROJECT_ROOT, maxAutoSteps = 20 } = {}) {
    if (!service) throw new Error('AgentRuntime 需要 WorkflowService');
    this.service = service;
    this.modelAdapter = modelAdapter;
    this.projectRoot = path.resolve(projectRoot);
    this.maxAutoSteps = maxAutoSteps;
  }

  inspect(runId) { return this.service.resume(runId); }

  prepareStage(runId) {
    const resumed = this.service.resume(runId);
    if (!['execute', 'retry'].includes(resumed.required_action)) return { runnable: false, display: presentResume(resumed), resumed };
    const stage = resumed.next_stage;
    const state = resumed.state;
    const instruction = loadStageInstruction(stage, { projectRoot: this.projectRoot });
    const context = buildStageContext(this.service, state, stage, { projectRoot: this.projectRoot });
    const schema = readWorkflowSchema(this.projectRoot);
    const stageSchema = schema.$defs?.[stage] ?? null;
    const request = {
      protocol: 'knowledge-stage-request/v0.5.0',
      run_id: runId,
      stage,
      stage_label_zh: stageLabel(stage),
      action: resumed.required_action,
      rules: [
        '你是“知识整理总控”当前阶段的内部执行单元，不是独立对外 Skill。',
        '扫描、备份、索引、生成技术报告只是准备动作，不能当作知识整理完成；必须执行当前 workflow stage 并产生结构化阶段产物。',
        '只执行当前 stage；不得自行进入下一阶段。',
        'stage_instruction 是当前阶段的语义规则来源；不要加载或选择其它阶段。',
        '只返回一个 JSON 对象，不要 Markdown 代码围栏、解释或审批结论。',
        '不得伪造用户批准、Review Service 身份、Canonical 或正式 Skill 发布。',
        '不确定内容必须按当前阶段规则/Schema 的待确认或风险机制表达，不得编造。',
        'Schema 要求的英文枚举和内部 ID 必须保持原样；但 title/name/question/text/summary/description 等面向人的语义字段，在中文语料中必须使用自然中文。',
        '不得把 content-path-*、method-*、business-*、knowledge-*、organized-*、raw_*、wf_*、claim_* 等内部 ID 填进面向人的标题或说明字段。',
        '不得在语义文本中输出 external=外部资料、case=项目案例 这类中英对照机器说明。'
      ],
      stage_instruction: {
        path: instruction.path,
        intended_path: instruction.intended_path,
        label_zh: instruction.label_zh,
        sha256: instruction.sha256,
        legacy_fallback: instruction.legacy_fallback,
        content: instruction.text
      },
      output_contract: {
        schema_ref: `schemas/workflow-artifacts.schema.json#/$defs/${stage}`,
        stage_schema: stageSchema,
        referenced_schemas: referencedSchemas(this.projectRoot, stageSchema)
      },
      context
    };
    return { runnable: true, resumed, request, instruction };
  }

  runOne(runId) {
    const prepared = this.prepareStage(runId);
    if (!prepared.runnable) {
      const view = buildCurrentView(this.service, prepared.resumed);
      return { status: 'stopped', run_id: runId, required_action: prepared.resumed.required_action,
        user_report: view.last_result, display: { ...presentResume(prepared.resumed), '当前进度': view.progress,
          ...(view.last_result ? { '最近整理结果': view.last_result } : {}) }, resumed: prepared.resumed };
    }
    if (!this.modelAdapter || typeof this.modelAdapter.generate !== 'function')
      throw new Error('没有 modelAdapter；可先使用 prepareStage()，或给 AgentRuntime 注入模型适配器');
    const { request, resumed, instruction } = prepared;
    const attemptId = `attempt_${crypto.randomUUID()}`;
    let output;
    try {
      output = this.modelAdapter.generate(request);
    } catch (error) {
      this.service.reportFailure(runId, resumed.next_stage, {
        error: `model invocation failed: ${error.message}`,
        producer: this.modelAdapter.id ?? 'model_adapter'
      });
      const after = this.service.resume(runId);
      return { status: 'failed', run_id: runId, stage: resumed.next_stage, stage_label_zh: stageLabel(resumed.next_stage), error: error.message,
        display: presentResume(after), resumed: after };
    }
    const provenance = {
      instruction_path: instruction.path,
      instruction_sha256: instruction.sha256,
      model: this.modelAdapter.id ?? 'unknown-model-adapter',
      runner: 'AgentRuntime/v0.5.0',
      attempt_id: attemptId,
      context_sha256: sha(JSON.stringify(request.context))
    };
    try {
      const result = resumed.required_action === 'retry'
        ? this.service.retry(runId, resumed.next_stage, output, { producer: provenance.model, provenance })
        : this.service.submit(runId, resumed.next_stage, output, { producer: provenance.model, provenance });
      const after = this.service.resume(runId);
      const userReport = buildStageReport(this.service, after.state, resumed.next_stage);
      return { status: 'stage_completed', run_id: runId, stage: resumed.next_stage, stage_label_zh: stageLabel(resumed.next_stage),
        artifact_id: result.artifact?.artifact_id ?? null, user_report: userReport,
        display: { ...presentResume(after), '本阶段结果': userReport }, resumed: after };
    } catch (error) {
      const after = this.service.resume(runId);
      return { status: 'failed', run_id: runId, stage: resumed.next_stage, stage_label_zh: stageLabel(resumed.next_stage), error: error.message,
        display: presentResume(after), resumed: after };
    }
  }

  runUntilStop(runId, { maxSteps = this.maxAutoSteps } = {}) {
    const history = [];
    let lastReport = null;
    for (let i = 0; i < maxSteps; i += 1) {
      const status = this.service.resume(runId);
      if (!['execute', 'retry'].includes(status.required_action))
        return { run_id: runId, status: status.status, required_action: status.required_action,
          checkpoint: status.checkpoint ?? null, next_stage: status.next_stage ?? null,
          user_report: lastReport ?? buildCurrentView(this.service, status).last_result,
          display: { ...presentResume(status), '当前进度': buildCurrentView(this.service, status).progress,
            ...(lastReport ? { '本阶段结果': lastReport } : {}), '本轮已执行': presentStageHistory(history) }, history, state: status.state };
      const one = this.runOne(runId);
      lastReport = one.user_report ?? lastReport;
      history.push({ stage: one.stage, stage_label_zh: stageLabel(one.stage), status: one.status,
        artifact_id: one.artifact_id ?? null, error: one.error ?? null });
      if (one.status === 'failed') return { run_id: runId, status: 'failed', required_action: 'retry', history,
        user_report: lastReport,
        display: { ...presentResume(one.resumed), '当前进度': buildCurrentView(this.service, one.resumed).progress,
          ...(lastReport ? { '本阶段结果': lastReport } : {}), '本轮已执行': presentStageHistory(history) },
        state: one.resumed.state, next_stage: one.resumed.next_stage };
    }
    throw new Error(`AgentRuntime 超过最大自动步数 ${maxSteps}；停止以避免失控循环`);
  }

  continueAndRun(runId, { maxSteps = this.maxAutoSteps } = {}) {
    const before = this.service.resume(runId);
    if (before.required_action !== 'continue')
      return { run_id: runId, status: before.status, required_action: before.required_action,
        display: { ...presentResume(before), '当前进度': buildCurrentView(this.service, before).progress }, state: before.state };
    this.service.continueRun(runId, { actor: 'user_interaction' });
    return this.runUntilStop(runId, { maxSteps });
  }

  view(runId) {
    const resumed = this.service.resume(runId);
    return { ...buildCurrentView(this.service, resumed), display: presentResume(resumed), state: resumed.state };
  }
}
