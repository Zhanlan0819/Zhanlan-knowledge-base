import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
export const DEFAULT_PROJECT_ROOT = path.resolve(here, '..');
const sha = value => crypto.createHash('sha256').update(value).digest('hex');

function readRegistry(projectRoot) {
  const file = path.resolve(projectRoot, 'skills/knowledge-orchestrator/stages.json');
  const registry = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (!registry?.stages || typeof registry.stages !== 'object') throw new Error('stages.json 缺少 stages');
  return registry;
}

export function stageDefinition(stage, { projectRoot = DEFAULT_PROJECT_ROOT } = {}) {
  const def = readRegistry(projectRoot).stages[stage];
  if (!def) throw new Error(`阶段 ${stage} 不是模型执行阶段；它可能是系统/受保护阶段`);
  return def;
}

function safeResolve(projectRoot, relative) {
  const root = path.resolve(projectRoot);
  const resolved = path.resolve(root, relative);
  if (resolved !== root && !resolved.startsWith(root + path.sep)) throw new Error(`非法内部指令路径: ${relative}`);
  return resolved;
}

export function loadStageInstruction(stage, { projectRoot = DEFAULT_PROJECT_ROOT } = {}) {
  const def = stageDefinition(stage, { projectRoot });
  const preferred = safeResolve(projectRoot, def.instruction);
  const legacy = def.legacy_skill ? safeResolve(projectRoot, def.legacy_skill) : null;
  const file = fs.existsSync(preferred) ? preferred : legacy && fs.existsSync(legacy) ? legacy : null;
  if (!file) throw new Error(`找不到 ${stage} 内部阶段指令；请运行 install_v04_single_orchestrator.bat 或检查 ${def.instruction}`);
  const text = fs.readFileSync(file, 'utf8');
  return {
    path: path.relative(path.resolve(projectRoot), file).replaceAll(path.sep, '/'),
    intended_path: def.instruction,
    label_zh: def.label_zh ?? '内部处理步骤',
    legacy_fallback: file === legacy,
    text,
    sha256: sha(text)
  };
}

export function specialistVisibilityReport({ projectRoot = DEFAULT_PROJECT_ROOT } = {}) {
  const registry = readRegistry(projectRoot);
  const legacy = [...new Set(Object.values(registry.stages).map(x => x.legacy_skill).filter(Boolean))];
  const visible = legacy.filter(relative => fs.existsSync(safeResolve(projectRoot, relative)));
  const internal = [...new Set(Object.values(registry.stages).map(x => x.instruction))]
    .filter(relative => fs.existsSync(safeResolve(projectRoot, relative)));
  return {
    orchestrator: 'skills/knowledge-orchestrator/SKILL.md',
    visible_specialist_skill_files: visible,
    internal_stage_instruction_files: internal,
    single_orchestrator_ready: visible.length === 0 && internal.length > 0
  };
}

export function buildStageContext(service, state, stage, { projectRoot = DEFAULT_PROJECT_ROOT } = {}) {
  const def = stageDefinition(stage, { projectRoot });
  const artifacts = {};
  for (const name of def.artifacts ?? []) {
    const record = state.stages[name];
    if (!record?.artifact_id) continue;
    const envelope = service.artifact(state, name);
    artifacts[name] = { artifact_id: envelope.artifact_id, sha256: record.sha256, version: envelope.version, data: envelope.data };
  }
  const context = {
    run_id: state.run_id,
    raw_id: state.raw_id,
    stage,
    state_summary: Object.fromEntries(Object.entries(state.stages).map(([name, record]) => [name, {
      status: record.status, version: record.version, artifact_id: record.artifact_id
    }])),
    artifacts
  };
  if (def.include_raw) {
    const rawPath = path.join(service.store, 'raw', `${state.raw_id}.txt`);
    context.raw_text = fs.readFileSync(rawPath, 'utf8');
  }
  if (stage === 'evaluator') {
    const dir = path.join(service.runDir(state.run_id), 'evaluation-outputs');
    context.evaluation_outputs = fs.existsSync(dir) ? fs.readdirSync(dir).filter(name => name.endsWith('.json')).map(name => {
      const record = JSON.parse(fs.readFileSync(path.join(dir, name), 'utf8'));
      return { id: record.id, case_id: record.case_id, variant: record.variant, runner: record.runner,
        sha256: record.sha256, content_text: Buffer.from(record.content_base64, 'base64').toString('utf8') };
    }) : [];
  }
  return context;
}
