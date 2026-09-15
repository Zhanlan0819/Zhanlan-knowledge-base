import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
export const DEFAULT_PROJECT_ROOT = path.resolve(here, '..');
const sha = value => crypto.createHash('sha256').update(value).digest('hex');

export const STAGE_REGISTRY = Object.freeze({
  router: { skill: 'skills/knowledge-router/SKILL.md', include_raw: true, artifacts: [] },
  atomicizer: { skill: 'skills/knowledge-atomicizer/SKILL.md', include_raw: true, artifacts: ['router'] },
  claims: { skill: 'skills/knowledge-atomicizer/SKILL.md', include_raw: true, artifacts: ['atomicizer'] },
  family_builder: { skill: 'skills/knowledge-family-builder/SKILL.md', include_raw: false, artifacts: ['claims'] },
  theme_builder: { skill: 'skills/knowledge-theme-builder/SKILL.md', include_raw: false, artifacts: ['family_builder', 'claims'] },
  reconciler: { skill: 'skills/knowledge-reconciler/SKILL.md', include_raw: false, artifacts: ['theme_builder', 'family_builder', 'claims'] },
  distiller: { skill: 'skills/knowledge-distiller/SKILL.md', include_raw: true, artifacts: ['theme_builder', 'family_builder', 'claims', 'reconciler'] },
  proposal: { skill: 'skills/knowledge-distiller/SKILL.md', include_raw: true, artifacts: ['distiller', 'theme_builder', 'family_builder', 'claims'] },
  skill_candidate: { skill: 'skills/knowledge-skill-builder/SKILL.md', include_raw: false, artifacts: ['canonical', 'claims'] },
  skill_builder: { skill: 'skills/knowledge-skill-builder/SKILL.md', include_raw: false, artifacts: ['skill_candidate', 'canonical'] },
  evaluator: { skill: 'skills/knowledge-evaluator/SKILL.md', include_raw: false, artifacts: ['skill_builder', 'skill_candidate'] }
});

export function stageDefinition(stage) {
  const def = STAGE_REGISTRY[stage];
  if (!def) throw new Error(`阶段 ${stage} 不是模型执行阶段；它可能是系统/受保护阶段`);
  return def;
}

export function loadStageSkill(stage, { projectRoot = DEFAULT_PROJECT_ROOT } = {}) {
  const def = stageDefinition(stage);
  const file = path.resolve(projectRoot, def.skill);
  const root = path.resolve(projectRoot) + path.sep;
  if (!file.startsWith(root)) throw new Error(`非法 Skill 路径: ${def.skill}`);
  const text = fs.readFileSync(file, 'utf8');
  return { path: def.skill, absolute_path: file, text, sha256: sha(text) };
}

export function buildStageContext(service, state, stage) {
  const def = stageDefinition(stage);
  const artifacts = {};
  for (const name of def.artifacts) {
    const record = state.stages[name];
    if (!record?.artifact_id) continue;
    const envelope = service.artifact(state, name);
    artifacts[name] = {
      artifact_id: envelope.artifact_id,
      sha256: record.sha256,
      version: envelope.version,
      data: envelope.data
    };
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
