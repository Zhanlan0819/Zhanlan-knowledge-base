import fs from 'node:fs';
import path from 'node:path';

const TYPE_FILES = {
  todo: '03_待办.json',
  memo: '04_备忘.json',
  copy: '05_文案.json',
  idea: '06_灵感.json',
  case: '07_案例.json',
  project: '08_项目资产.json',
  external: '09_来源资料.json',
  unorganized: '10_待整理.json'
};

const ensure = p => fs.mkdirSync(p, { recursive: true });
const writeJson = (p, v) => fs.writeFileSync(p, JSON.stringify(v, null, 2), 'utf8');

function assetView(asset) {
  return {
    id: asset.id,
    raw_id: asset.raw_id,
    type: asset.type,
    text: asset.anchor?.quote ?? '',
    source_range: asset.anchor ? { start: asset.anchor.start, end: asset.anchor.end, offset_unit: asset.anchor.offset_unit } : null,
    parent_tag: asset.parent_tag ?? null,
    child_tag: asset.child_tag ?? null,
    status: asset.status
  };
}

function safeName(value) {
  return String(value || 'skill').replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80) || 'skill';
}

export function exportDeliveryBundle(service, runId, { outputDir = null } = {}) {
  const state = service.loadState(runId);
  const root = outputDir ? path.resolve(outputDir) : path.join(service.store, 'deliveries', runId);
  ensure(root);

  const router = state.stages.router.artifact_id ? service.artifact(state, 'router').data : { assets: [] };
  const byType = {};
  for (const asset of router.assets ?? []) (byType[asset.type] ||= []).push(assetView(asset));

  const proposals = state.stages.proposal?.artifact_id
    ? service.artifact(state, 'proposal').data.proposals ?? [] : [];
  const reviewDir = path.join(root, 'review-inbox');
  ensure(reviewDir);
  for (const item of proposals) {
    const body = [
      '---',
      'status: "待确认"',
      'entry_type: "knowledge"',
      'origin: "skill-run"',
      `run_id: "${runId}"`,
      `proposal_id: "${item.id}"`,
      '---',
      '',
      item.text
    ].join('\n');
    fs.writeFileSync(path.join(reviewDir, `${safeName(item.id)}.md`), body, 'utf8');
    writeJson(path.join(reviewDir, `${safeName(item.id)}.json`), { ...item, status: '待确认', run_id: runId });
  }

  const canonical = state.stages.canonical.artifact_id && ['completed','not_started','needs_revision'].includes(state.stages.canonical.status)
    ? service.artifact(state, 'canonical').data.canonical_versions ?? [] : [];
  const knowledgeDir = path.join(root, 'knowledge');
  ensure(knowledgeDir);
  for (const item of canonical) {
    fs.writeFileSync(path.join(knowledgeDir, `${item.id}.md`), item.text, 'utf8');
    writeJson(path.join(knowledgeDir, `${item.id}.json`), item);
  }

  for (const [type, file] of Object.entries(TYPE_FILES)) writeJson(path.join(root, file), byType[type] ?? []);

  const promotionAuditPath = path.join(service.runDir(runId), 'governance', 'skill-promotion-audit.json');
  const coverageAuditPath = path.join(service.runDir(runId), 'governance', 'coverage-audit.json');
  const sourceGovernancePath = path.join(service.runDir(runId), 'governance', 'source-governance.json');
  const promotionAudit = fs.existsSync(promotionAuditPath) ? JSON.parse(fs.readFileSync(promotionAuditPath, 'utf8')) : null;
  const coverageAudit = fs.existsSync(coverageAuditPath) ? JSON.parse(fs.readFileSync(coverageAuditPath, 'utf8')) : null;
  const sourceGovernance = fs.existsSync(sourceGovernancePath) ? JSON.parse(fs.readFileSync(sourceGovernancePath, 'utf8')) : null;
  if (promotionAudit) writeJson(path.join(root, '11_Skill晋级审计.json'), promotionAudit);
  if (coverageAudit) writeJson(path.join(root, '12_目标覆盖审计.json'), coverageAudit);
  if (sourceGovernance) writeJson(path.join(root, '13_来源治理.json'), sourceGovernance);

  const formalRoot = path.join(service.store, 'formal-skills');
  const skillsOut = path.join(root, 'skills');
  ensure(skillsOut);
  const skillPackages = [];
  if (fs.existsSync(formalRoot)) {
    for (const entry of fs.readdirSync(formalRoot, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const src = path.join(formalRoot, entry.name);
      const skillFile = path.join(src, 'SKILL.md');
      if (!fs.existsSync(skillFile)) continue;
      const dst = path.join(skillsOut, safeName(entry.name));
      ensure(dst);
      for (const name of ['SKILL.md', 'metadata.json', 'test-prompts.json']) {
        const from = path.join(src, name);
        if (fs.existsSync(from)) fs.copyFileSync(from, path.join(dst, name));
      }
      skillPackages.push({ id: entry.name, path: path.relative(root, dst).replaceAll(path.sep, '/') });
    }
  }

  const totals = {
    source_assets: router.assets?.length ?? 0,
    knowledge_candidates: byType.knowledge?.length ?? 0,
    pending_review: proposals.length,
    canonical_knowledge: canonical.length,
    skills: skillPackages.length,
    todo: byType.todo?.length ?? 0,
    memo: byType.memo?.length ?? 0,
    copy: byType.copy?.length ?? 0,
    idea: byType.idea?.length ?? 0,
    case: byType.case?.length ?? 0,
    project: byType.project?.length ?? 0,
    external: byType.external?.length ?? 0,
    unorganized: byType.unorganized?.length ?? 0
  };
  const manifest = {
    schema_version: '0.6.4',
    run_id: runId,
    status: state.status,
    generated_at: new Date().toISOString(),
    totals,
    skill_packages: skillPackages,
    files: {
      review_inbox_dir: 'review-inbox/',
      knowledge_dir: 'knowledge/',
      skills_dir: 'skills/',
      ...TYPE_FILES
    }
  };
  writeJson(path.join(root, 'manifest.json'), manifest);

  const summary = [
    '# 本轮整理交付',
    '',
    `- 原始分流资产：${totals.source_assets}`,
    `- 待确认知识：${totals.pending_review}`,
    `- 已确认正式知识：${totals.canonical_knowledge}`,
    `- 可安装 Skill：${totals.skills}`,
    `- 待办：${totals.todo}`,
    `- 备忘：${totals.memo}`,
    `- 文案：${totals.copy}`,
    `- 灵感：${totals.idea}`,
    `- 案例：${totals.case}`,
    `- 项目资产：${totals.project}`,
    `- 来源资料：${totals.external}`,
    `- 待整理：${totals.unorganized}`,
    '',
    '知识候选必须先进入知识库网页“收件箱 → 待确认”；只有用户在网页点击确认后才成为正式知识。'
  ].join('\n');
  fs.writeFileSync(path.join(root, 'README.md'), summary, 'utf8');
  return { output_dir: root, manifest };
}
