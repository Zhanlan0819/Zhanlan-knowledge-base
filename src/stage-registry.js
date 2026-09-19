import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
export const DEFAULT_PROJECT_ROOT = path.resolve(here, '..');
const sha = value => crypto.createHash('sha256').update(value).digest('hex');

function registryCandidates(projectRoot) {
  const root = path.resolve(projectRoot);
  return [
    path.resolve(root, 'skills/knowledge-orchestrator/stages.json'),
    path.resolve(root, 'stages.json'),
    path.resolve(here, '../skills/knowledge-orchestrator/stages.json')
  ];
}

function readRegistry(projectRoot) {
  const file = registryCandidates(projectRoot).find(fs.existsSync);
  if (!file) throw new Error(`找不到 stages.json；已检查: ${registryCandidates(projectRoot).join(', ')}`);
  const registry = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (!registry?.stages || typeof registry.stages !== 'object') throw new Error('stages.json 缺少 stages');
  return { registry, file };
}

export function stageDefinition(stage, { projectRoot = DEFAULT_PROJECT_ROOT } = {}) {
  const { registry } = readRegistry(projectRoot);
  const def = registry.stages[stage];
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
  const { registry, file: registryFile } = readRegistry(projectRoot);
  const def = registry.stages[stage];
  if (!def) throw new Error(`阶段 ${stage} 不是模型执行阶段；它可能是系统/受保护阶段`);
  const root = path.resolve(projectRoot);
  const candidates = [
    safeResolve(root, def.instruction),
    path.resolve(path.dirname(registryFile), path.basename(def.instruction)),
    path.resolve(path.dirname(registryFile), 'stages', path.basename(def.instruction))
  ];
  const file = candidates.find(fs.existsSync);
  if (!file) throw new Error(`找不到 ${stage} 内部阶段指令: ${def.instruction}`);
  const text = fs.readFileSync(file, 'utf8');
  return {
    path: path.relative(root, file).replaceAll(path.sep, '/'),
    label_zh: def.label_zh ?? '内部处理步骤',
    review_policy: def.review_policy ?? 'auto',
    text,
    sha256: sha(text)
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
    user_brief: state.user_brief ?? null,
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
