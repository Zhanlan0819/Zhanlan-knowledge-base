import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { buildStageContext, loadStageSkill, DEFAULT_PROJECT_ROOT } from './stage-registry.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const sha = value => crypto.createHash('sha256').update(value).digest('hex');

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

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

  inspect(runId) {
    return this.service.resume(runId);
  }

  prepareStage(runId) {
    const resumed = this.service.resume(runId);
    if (!['execute', 'retry'].includes(resumed.required_action)) return { runnable: false, resumed };
    const stage = resumed.next_stage;
    const state = resumed.state;
    const skill = loadStageSkill(stage, { projectRoot: this.projectRoot });
    const context = buildStageContext(this.service, state, stage);
    const schema = readWorkflowSchema(this.projectRoot);
    const stageSchema = schema.$defs?.[stage] ?? null;
    const request = {
      protocol: 'knowledge-stage-request/v0.3',
      run_id: runId,
      stage,
      action: resumed.required_action,
      rules: [
        '只执行当前 stage；不得自行进入下一阶段。',
        '把 stage Skill 当作当前语义规则来源；不要加载其它 specialist Skill。',
        '只返回一个 JSON 对象，不要 Markdown 代码围栏、解释或审批结论。',
        '不得伪造用户批准、Review Service 身份、Canonical 或正式 Skill 发布。',
        '不确定内容必须按当前 Skill/Schema 的待确认或风险机制表达，不得编造。'
      ],
      skill: { path: skill.path, sha256: skill.sha256, content: skill.text },
      output_contract: {
        schema_ref: `schemas/workflow-artifacts.schema.json#/$defs/${stage}`,
        stage_schema: stageSchema,
        referenced_schemas: referencedSchemas(this.projectRoot, stageSchema)
      },
      context
    };
    return { runnable: true, resumed, request, skill };
  }

  runOne(runId) {
    const prepared = this.prepareStage(runId);
    if (!prepared.runnable) return { status: 'stopped', ...prepared.resumed };
    if (!this.modelAdapter || typeof this.modelAdapter.generate !== 'function')
      throw new Error('没有 modelAdapter；可先使用 prepareStage()，或给 AgentRuntime 注入模型适配器');
    const { request, resumed, skill } = prepared;
    const attemptId = `attempt_${crypto.randomUUID()}`;
    let output;
    try {
      output = this.modelAdapter.generate(request);
    } catch (error) {
      this.service.reportFailure(runId, resumed.next_stage, {
        error: `model invocation failed: ${error.message}`,
        producer: this.modelAdapter.id ?? 'model_adapter'
      });
      return { status: 'failed', run_id: runId, stage: resumed.next_stage, error: error.message,
        resumed: this.service.resume(runId) };
    }
    const provenance = {
      skill_path: skill.path,
      skill_sha256: skill.sha256,
      model: this.modelAdapter.id ?? 'unknown-model-adapter',
      runner: 'AgentRuntime/v0.3',
      attempt_id: attemptId,
      context_sha256: sha(JSON.stringify(request.context))
    };
    try {
      const result = resumed.required_action === 'retry'
        ? this.service.retry(runId, resumed.next_stage, output, { producer: provenance.model, provenance })
        : this.service.submit(runId, resumed.next_stage, output, { producer: provenance.model, provenance });
      return { status: 'stage_completed', run_id: runId, stage: resumed.next_stage,
        artifact_id: result.artifact?.artifact_id ?? null, resumed: this.service.resume(runId) };
    } catch (error) {
      return { status: 'failed', run_id: runId, stage: resumed.next_stage, error: error.message,
        resumed: this.service.resume(runId) };
    }
  }

  runUntilStop(runId, { maxSteps = this.maxAutoSteps } = {}) {
    const history = [];
    for (let i = 0; i < maxSteps; i += 1) {
      const status = this.service.resume(runId);
      if (!['execute', 'retry'].includes(status.required_action))
        return { run_id: runId, status: status.status, required_action: status.required_action,
          checkpoint: status.checkpoint ?? null, next_stage: status.next_stage ?? null, history, state: status.state };
      const one = this.runOne(runId);
      history.push({ stage: one.stage, status: one.status, artifact_id: one.artifact_id ?? null, error: one.error ?? null });
      if (one.status === 'failed') return { run_id: runId, status: 'failed', required_action: 'retry', history,
        state: one.resumed.state, next_stage: one.resumed.next_stage };
    }
    throw new Error(`AgentRuntime 超过最大自动步数 ${maxSteps}；停止以避免失控循环`);
  }
}
