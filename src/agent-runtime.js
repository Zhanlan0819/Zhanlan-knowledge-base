import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { buildStageContext, loadStageInstruction, DEFAULT_PROJECT_ROOT } from './stage-registry.js';
import { presentResume, presentStageHistory, stageLabel } from './display-labels.js';
import { buildCurrentView, buildStageReport, presentStageReport } from './user-presentation.js';

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
      protocol: 'knowledge-stage-request/v0.6.3',
      run_id: runId,
      stage,
      stage_label_zh: stageLabel(stage),
      action: resumed.required_action,
      rules: [
        '你是“知识整理总控”当前阶段的内部执行单元，不是独立对外 Skill。',
        '扫描、备份、索引、生成技术报告只是准备动作，不能当作知识整理完成；必须执行当前 workflow stage 并产生结构化阶段产物。',
        '只执行当前 stage；不得自行进入下一阶段。',
        'stage_instruction 是当前阶段的语义规则来源；不要加载或选择其它阶段。若旧 STAGE.md 与本 Runtime v0.6 硬规则冲突，以本 rules 为准。',
        'user_brief 若存在，是本轮整理目标与用户约束的持续锚点；每阶段都要检查输出是否仍服务这些目标，不得在阶段传递中丢失。',
        '只返回一个 JSON 对象，不要 Markdown 代码围栏、解释或审批结论。',
        '不得伪造用户批准、Review Service 身份、Canonical 或正式 Skill 发布。',
        '不确定内容必须按当前阶段规则/Schema 的待确认或风险机制表达，不得编造。',
        'Schema 要求的英文枚举和内部 ID 必须保持原样；但 title/name/question/text/summary/description 等面向人的语义字段，在中文语料中必须使用自然中文。',
        '不得把 content-path-*、method-*、business-*、knowledge-*、organized-*、raw_*、wf_*、claim_* 等内部 ID 填进面向人的标题或说明字段。',
        '不得在语义文本中输出 external=外部资料、case=项目案例 这类中英对照机器说明。',
        ...(stage === 'router' ? [
          '外部资料、项目案例、项目方案首先表示来源/载体身份，不应自动成为知识加工终点。若其中包含可复用判断、方法、原则或案例结构，应保留原来源资产，同时对可复用的原文片段额外建立 knowledge 资产；允许不同类型资产锚点重叠。',
          '不要把整份外部资料直接改标为知识；只对真正可复用的具体片段建立知识资产，并保留来源边界。'
        ] : []),
        ...(stage === 'atomicizer' ? [
          '一份知识资产可以拆成多个原子。每个原子只承载一个能够独立判断真伪、适用条件或后续归组的最小主张；不要再强制“一资产=一原子”。',
          '原子 anchor 必须是所属知识资产原文范围内的真实子片段；不得为了凑原子而改写证据原文。'
        ] : []),
        ...(stage === 'family_builder' ? [
          '归组阶段重点是找真正表达同一核心判断的主张；同主题下的例子、步骤、条件、细化与应用不要为了压缩数量而误合并。'
        ] : []),
        ...(stage === 'reconciler' ? [
          '优先识别真正需要人工决策的冲突、撤回和版本变化；重复、细化、补充、来源、应用可以自动记录，不要把所有关系都升级为人工问题。'
        ] : [])
      ],
      stage_instruction: {
        path: instruction.path,
        label_zh: instruction.label_zh,
        review_policy: instruction.review_policy,
        sha256: instruction.sha256,
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
          ...(view.last_result ? { '最近整理结果': presentStageReport(view.last_result) } : {}) }, resumed: prepared.resumed };
    }
    if (!this.modelAdapter || typeof this.modelAdapter.generate !== 'function')
      throw new Error('没有 modelAdapter；可先使用 prepareStage()，或给 AgentRuntime 注入模型适配器');
    const { request, resumed, instruction } = prepared;
    const attemptId = `attempt_${crypto.randomUUID()}`;
    let output;
    let coverageAudit = null;
    let promotionAudit = null;
    try {
      output = this.modelAdapter.generate(request);

      // v0.6.3: Claim 的证据身份由程序从 Atom 复制，模型只负责 source_status。
      // 这样模型即使做断行归一化、改写 statement 或 anchor，也不会污染证据层。
      if (resumed.next_stage === 'claims') {
        const atoms = this.service.artifact(resumed.state, 'atomicizer').data.atoms;
        const proposed = new Map((output?.claims ?? []).map(x => [x.atom_id, x]));
        output = { claims: atoms.map(atom => {
          const p = proposed.get(atom.id) ?? {};
          return {
            id: typeof p.id === 'string' && p.id ? p.id : `claim_${sha(atom.id).slice(0, 16)}`,
            atom_id: atom.id,
            raw_id: atom.raw_id,
            anchor: atom.anchor,
            statement: atom.statement,
            source_status: ['explicit','attributed','editor_inference','visual_unverified'].includes(p.source_status)
              ? p.source_status : 'editor_inference',
            evidence_status: 'anchor_verified'
          };
        }) };
      }

      if (resumed.next_stage === 'distiller' && resumed.state.user_brief) {
        coverageAudit = this.modelAdapter.generate({
          protocol: 'knowledge-coverage-audit/v0.6.3',
          run_id: runId,
          rules: [
            '只返回 JSON，不要 Markdown。',
            '把 user_brief 拆成可核对目标；只依据本轮 themes 与 distillations 判断覆盖情况。',
            'priority 只能是 critical|high|normal|low；status 只能是 covered|partial|uncovered。',
            '如果无法证明覆盖，宁可标 partial/uncovered，不要猜。',
            '输出格式：{"goals":[{"goal":"...","priority":"high","status":"covered","evidence_ids":["distillation_x"],"reason":"..."}]}'
          ],
          context: {
            user_brief: resumed.state.user_brief,
            themes: this.service.artifact(resumed.state, 'theme_builder').data.themes,
            distillations: output.distillations
          }
        });
      }

      if (resumed.next_stage === 'skill_candidate') {
        const canonical = this.service.artifact(resumed.state, 'canonical').data.canonical_versions;
        promotionAudit = this.modelAdapter.generate({
          protocol: 'skill-promotion-audit/v0.6.3',
          run_id: runId,
          rules: [
            '只返回 JSON，不要 Markdown。',
            '必须逐条审计每个 Canonical，不能因为 candidates 为空就跳过。',
            'outcome 只能是 promoted|not_skill|needs_more_evidence|covered_by_existing_skill。',
            '每条必须写明 reason；promoted 必须能对应到本轮 candidates。',
            '输出格式：{"items":[{"canonical_id":"canonical_x","outcome":"not_skill","reason":"..."}]}'
          ],
          context: { canonical, candidates: output.candidates ?? [] }
        });
      }
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
      runner: 'AgentRuntime/v0.6.3',
      attempt_id: attemptId,
      context_sha256: sha(JSON.stringify(request.context))
    };
    try {
      const submitOptions = { producer: provenance.model, provenance, coverageAudit, promotionAudit };
      const result = resumed.required_action === 'retry'
        ? this.service.retry(runId, resumed.next_stage, output, submitOptions)
        : this.service.submit(runId, resumed.next_stage, output, submitOptions);
      const after = this.service.resume(runId);
      const userReport = buildStageReport(this.service, after.state, resumed.next_stage);
      return { status: 'stage_completed', run_id: runId, stage: resumed.next_stage, stage_label_zh: stageLabel(resumed.next_stage),
        artifact_id: result.artifact?.artifact_id ?? null, user_report: userReport,
        display: { ...presentResume(after), '本阶段结果': presentStageReport(userReport) }, resumed: after };
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
            ...(lastReport ? { '本阶段结果': presentStageReport(lastReport) } : {}), '本轮已执行': presentStageHistory(history) }, history, state: status.state };
      const one = this.runOne(runId);
      lastReport = one.user_report ?? lastReport;
      history.push({ stage: one.stage, stage_label_zh: stageLabel(one.stage), status: one.status,
        artifact_id: one.artifact_id ?? null, error: one.error ?? null });
      if (one.status === 'failed') return { run_id: runId, status: 'failed', required_action: 'retry', history,
        user_report: lastReport,
        display: { ...presentResume(one.resumed), '当前进度': buildCurrentView(this.service, one.resumed).progress,
          ...(lastReport ? { '本阶段结果': presentStageReport(lastReport) } : {}), '本轮已执行': presentStageHistory(history) },
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
