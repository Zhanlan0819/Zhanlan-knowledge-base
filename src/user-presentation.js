import { assetTypeLabel, humanReadableTitle, relationLabel, stageLabel } from './display-labels.js';

export const KNOWLEDGE_PHASES = Object.freeze([
  { number: 1, name: '内容分流', complete_stage: 'router' },
  { number: 2, name: '知识拆解', complete_stage: 'claims' },
  { number: 3, name: '同类知识归组', complete_stage: 'family_builder' },
  { number: 4, name: '主题整理', complete_stage: 'theme_builder' },
  { number: 5, name: '重复、补充与冲突检查', complete_stage: 'reconciler' },
  { number: 6, name: '知识蒸馏', complete_stage: 'distiller' },
  { number: 7, name: '生成待确认提案', complete_stage: 'proposal' }
]);

const PHASE_BY_STAGE = new Map([
  ['router', 1], ['atomicizer', 2], ['claims', 2], ['family_builder', 3],
  ['theme_builder', 4], ['reconciler', 5], ['distiller', 6], ['proposal', 7]
]);

function short(value, max = 72) {
  if (typeof value !== 'string') return null;
  const text = value.trim().replace(/\s+/g, ' ');
  if (!text) return null;
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

function listSample(items, mapper, limit = 5) {
  return items.slice(0, limit).map(mapper).filter(Boolean);
}

function artifactData(service, state, stage) {
  return state.stages?.[stage]?.artifact_id ? service.artifact(state, stage).data : null;
}

function claimMap(service, state) {
  const data = artifactData(service, state, 'claims');
  return new Map((data?.claims ?? []).map(c => [c.id, c]));
}

export function knowledgeProgress(state) {
  const phases = KNOWLEDGE_PHASES.map(phase => {
    const status = state.stages?.[phase.complete_stage]?.status ?? 'not_started';
    const done = ['completed', 'waiting_review'].includes(status);
    const waiting = status === 'waiting_review';
    return { ...phase, done, waiting };
  });
  let current = phases.find(p => !p.done)?.number ?? 7;
  if (state.stages?.proposal?.status === 'waiting_review') current = 7;
  return {
    current,
    total: 7,
    phases: phases.map(p => `${p.waiting ? '◐' : p.done ? '✓' : p.number === current ? '→' : '○'} ${p.number}. ${p.name}`)
  };
}

function routerReport(data) {
  const counts = new Map();
  for (const asset of data.assets ?? []) counts.set(asset.type, (counts.get(asset.type) ?? 0) + 1);
  const breakdown = [...counts.entries()].map(([type, count]) => `${assetTypeLabel(type)} ${count} 条`);
  const knowledge = (data.assets ?? []).filter(a => a.type === 'knowledge');
  return {
    summary: `已完成内容分流，共识别 ${data.assets?.length ?? 0} 条内容，其中 ${knowledge.length} 条进入知识整理。`,
    details: breakdown,
    examples: listSample(knowledge, a => short(a.title ?? a.name ?? a.anchor?.quote ?? a.quote))
  };
}

function claimsReport(data) {
  const claims = data.claims ?? [];
  return {
    summary: `已把知识内容拆成 ${claims.length} 条可独立处理的知识主张。`,
    details: [`知识主张 ${claims.length} 条`],
    examples: listSample(claims, c => short(c.statement ?? c.text ?? c.summary))
  };
}

function familyReport(service, state, data) {
  const claims = claimMap(service, state);
  const families = data.families ?? [];
  const examples = listSample(families, family => {
    const direct = humanReadableTitle(family, { fallback: '' });
    if (direct) return direct;
    const linked = (family.claim_ids ?? []).map(id => claims.get(id)).filter(Boolean);
    return short(linked[0]?.statement ?? linked[0]?.text ?? '') || null;
  });
  return {
    summary: `已将 ${claims.size} 条知识主张归成 ${families.length} 个同类知识组。`,
    details: [`知识组 ${families.length} 个`],
    examples
  };
}

function themeReport(data) {
  const themes = data.themes ?? [];
  return {
    summary: `已把同类知识进一步整理成 ${themes.length} 个长期主题。`,
    details: [`主题 ${themes.length} 个`],
    examples: listSample(themes, t => short(t.central_question ?? t.question ?? t.title ?? t.name))
  };
}

function relationReport(service, state, data) {
  const claims = claimMap(service, state);
  const relations = data.relations ?? [];
  const counts = new Map();
  for (const r of relations) counts.set(r.type, (counts.get(r.type) ?? 0) + 1);
  const details = [...counts.entries()].map(([type, count]) => `${relationLabel(type)} ${count} 组`);
  if (data.version_judgement) details.push('发现需要按新旧版本处理的知识');
  const important = relations.filter(r => ['REPEATS', 'CONTRADICTS', 'RETRACTS', 'REFINES', 'EXTENDS'].includes(r.type));
  const examples = listSample(important, r => {
    const a = claims.get(r.from_claim_id), b = claims.get(r.to_claim_id);
    const left = short(a?.statement ?? a?.text ?? '', 30);
    const right = short(b?.statement ?? b?.text ?? '', 30);
    if (!left || !right) return null;
    return `${relationLabel(r.type)}：${left} ↔ ${right}${r.rationale ? `（${short(r.rationale, 36)}）` : ''}`;
  });
  return {
    summary: `已完成知识关系检查，共发现 ${relations.length} 组关系。`,
    details: details.length ? details : ['未发现需要特别处理的重复或冲突关系'],
    examples
  };
}

function distillReport(data) {
  const items = data.distillations ?? [];
  return {
    summary: `已形成 ${items.length} 条可复用的知识蒸馏结果。`,
    details: [`蒸馏结果 ${items.length} 条`],
    examples: listSample(items, x => short(x.text ?? x.summary ?? x.statement))
  };
}

function proposalReport(data) {
  const items = data.proposals ?? [];
  return {
    summary: `已生成 ${items.length} 条待确认的正式知识提案；目前还没有写入正式知识库。`,
    details: [`待确认提案 ${items.length} 条`, '确认前不会改动正式知识'],
    examples: listSample(items, x => short(x.text ?? x.summary ?? x.title ?? x.name), 8)
  };
}

function genericReport(stage, data) {
  const arrays = Object.values(data ?? {}).filter(Array.isArray);
  const count = arrays.reduce((sum, x) => sum + x.length, 0);
  return {
    summary: `已完成“${stageLabel(stage)}”${count ? `，产生 ${count} 条结果` : ''}。`,
    details: [],
    examples: []
  };
}

export function buildStageReport(service, state, stage) {
  const data = artifactData(service, state, stage) ?? {};
  let result;
  if (stage === 'router') result = routerReport(data);
  else if (stage === 'claims') result = claimsReport(data);
  else if (stage === 'family_builder') result = familyReport(service, state, data);
  else if (stage === 'theme_builder') result = themeReport(data);
  else if (stage === 'reconciler') result = relationReport(service, state, data);
  else if (stage === 'distiller') result = distillReport(data);
  else if (stage === 'proposal') result = proposalReport(data);
  else result = genericReport(stage, data);

  const phaseNumber = PHASE_BY_STAGE.get(stage) ?? null;
  const progress = knowledgeProgress(state);
  const nextPhase = phaseNumber && phaseNumber < 7 ? KNOWLEDGE_PHASES[phaseNumber] : null;
  return {
    title: phaseNumber ? `第 ${phaseNumber}/7 阶段：${KNOWLEDGE_PHASES[phaseNumber - 1].name}` : stageLabel(stage),
    ...result,
    progress,
    next: nextPhase ? `下一步：${nextPhase.name}` : stage === 'proposal' ? '下一步：逐条确认哪些提案写入正式知识库' : null,
    prompt: nextPhase ? `如果结果没问题，回复“继续”，我再进入“${nextPhase.name}”。` : null
  };
}

export function buildCurrentView(service, resumed) {
  const state = resumed.state;
  const completed = [...KNOWLEDGE_PHASES].reverse().find(p => ['completed', 'waiting_review'].includes(state.stages?.[p.complete_stage]?.status));
  const lastReport = completed ? buildStageReport(service, state, completed.complete_stage) : null;
  return {
    progress: knowledgeProgress(state),
    last_result: lastReport,
    required_action: resumed.required_action,
    next_stage_label: resumed.next_stage ? stageLabel(resumed.next_stage) : null,
    waiting_for_continue: resumed.required_action === 'continue',
    waiting_for_review: resumed.required_action === 'review'
  };
}
