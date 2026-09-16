import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const mode = process.argv.includes('--restore') ? 'restore' : process.argv.includes('--check') ? 'check' : 'apply';
const specialists = [
  'knowledge-router', 'knowledge-atomicizer', 'knowledge-family-builder', 'knowledge-theme-builder',
  'knowledge-reconciler', 'knowledge-distiller', 'knowledge-skill-builder', 'knowledge-evaluator'
];
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const exists = f => fs.existsSync(f) && fs.statSync(f).isFile();
const rel = f => path.relative(root, f).replaceAll(path.sep, '/');
const report = [];

if (!exists(path.join(root, 'skills', 'knowledge-orchestrator', 'SKILL.md'))) {
  throw new Error('找不到 skills/knowledge-orchestrator/SKILL.md；请在 knowledge-system 项目根目录安装覆盖包后再运行');
}

let backupRoot = null;
if (mode === 'apply') {
  const stamp = new Date().toISOString().replaceAll(':', '-').replaceAll('.', '-');
  backupRoot = path.join(root, '_skill-migration-backup', stamp);
}

for (const name of specialists) {
  const dir = path.join(root, 'skills', name);
  const skill = path.join(dir, 'SKILL.md');
  const stage = path.join(dir, 'STAGE.md');
  const skillExists = exists(skill), stageExists = exists(stage);
  if (mode === 'check') {
    report.push({ specialist: name, skill_md_visible: skillExists, stage_md_internal: stageExists });
    continue;
  }

  if (mode === 'apply') {
    if (!skillExists && stageExists) { report.push({ specialist: name, action: 'already_internal' }); continue; }
    if (!skillExists && !stageExists) { report.push({ specialist: name, action: 'missing', error: 'SKILL.md/STAGE.md 都不存在' }); continue; }
    if (skillExists && stageExists) {
      const a = fs.readFileSync(skill), b = fs.readFileSync(stage);
      if (sha(a) !== sha(b)) throw new Error(`${name}: SKILL.md 与 STAGE.md 内容不同，拒绝自动删除；请人工检查`);
      const backup = path.join(backupRoot, 'skills', name, 'SKILL.md');
      fs.mkdirSync(path.dirname(backup), { recursive: true }); fs.copyFileSync(skill, backup); fs.unlinkSync(skill);
      report.push({ specialist: name, action: 'removed_duplicate_visible_skill', backup: rel(backup) }); continue;
    }
    const backup = path.join(backupRoot, 'skills', name, 'SKILL.md');
    fs.mkdirSync(path.dirname(backup), { recursive: true }); fs.copyFileSync(skill, backup);
    fs.renameSync(skill, stage);
    report.push({ specialist: name, action: 'renamed_SKILL_to_STAGE', backup: rel(backup) });
    continue;
  }

  // restore
  if (skillExists && !stageExists) { report.push({ specialist: name, action: 'already_visible' }); continue; }
  if (!skillExists && !stageExists) { report.push({ specialist: name, action: 'missing' }); continue; }
  if (skillExists && stageExists) {
    if (sha(fs.readFileSync(skill)) !== sha(fs.readFileSync(stage)))
      throw new Error(`${name}: SKILL.md 与 STAGE.md 内容不同，拒绝自动覆盖`);
    fs.unlinkSync(stage);
    report.push({ specialist: name, action: 'removed_duplicate_STAGE' }); continue;
  }
  fs.renameSync(stage, skill);
  report.push({ specialist: name, action: 'restored_STAGE_to_SKILL' });
}

const missing = report.filter(x => x.action === 'missing');
const visibleAfter = specialists.filter(name => exists(path.join(root, 'skills', name, 'SKILL.md')));
const internalAfter = specialists.filter(name => exists(path.join(root, 'skills', name, 'STAGE.md')));
const result = { mode, project_root: root, report, visible_specialists_after: visibleAfter,
  internal_stages_after: internalAfter, single_orchestrator_ready: visibleAfter.length === 0 && internalAfter.length === specialists.length };
process.stdout.write(JSON.stringify(result, null, 2) + '\n');
if (mode === 'apply' && (missing.length || !result.single_orchestrator_ready)) process.exitCode = 2;
