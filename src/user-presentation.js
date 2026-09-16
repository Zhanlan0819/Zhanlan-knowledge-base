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
const SOURCE_CONTAINER_TYPES = new Set(['case', 'project', 'external']);
const DECISION_RELATIONS = new Set(['CONTRADICTS', 'RETRACTS']);
const CHANGE_RELATIONS = new Set(['REPEATS', 'REFINES', 'EXTENDS', 'ORIGIN', 'APPLICATION']);

function short(value, max = 90) {
  if (typeof value !== 'string') return null;
  const text = value.trim().replace(/\s+/g, ' ');
  if (!text) return null;
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

function listSample(items, mapper, limit = 6) {
  return items.slice(0, limit).map(mapper).filter(Boolean);
}

function artifactData(service, state, stage) {
  return state.stages?.[stage]?.artifact_id ? service.artifact(state, stage).data : null;
}

function claimMap(service, state) {
  const data = artifactData(service, state, 'claims');
  return new Map((data?.claims ?? []).map(c => [c.id, c]));
}

function rangeContains(outer, inner) {
  return outer && inner && Number.isInteger(outer.start) && Number.isInteger(outer.end)
    && Number.isInteger(inner.start) && Number.isInteger(inner.end)
    && inner.start >= outer.start && inner.end <= outer.end;
}

function stageWaitingReview(state, stage) {
  return state.stages?.[stage]?.status === 'waiting_review';
}

function reviewMode(state, stage) {
  if (stageWaitingReview(state, stage)) return 'decision';
  if (state.interaction?.status === 'waiting_continue' && state.interaction.after_stage === stage) return 'milestone';
  return 'progress';
}

export function knowledgeProgress(state) {
  const phases = KNOWLEDGE_PHASES.map(phase => {
    const status = state.stages?.[phase.complete_stage]?.status ?? 'not_started';
    const done = ['completed', 'waiting_review'].includes(status);
    const waiting = status === 'waiting_review'
      || (state.interaction?.status === 'waiting_continue' && state.interaction.after_stage === phase.complete_stage);
    return { ...phase, done, waiting };
  });
  let current = phases.find(p => !p.done)?.number ?? 7;
  if (state.interaction?.status === 'waiting_continue') current = PHASE_BY_STAGE.get(state.interaction.after_stage) ?? current;
  if (state.stages?.proposal?.status === 'waiting_review') current = 7;
  return {
    current,
    total: 7,
    phases: phases.map(p => `${p.waiting ? '◐' : p.done ? '✓' : p.number === current ? '→' : '○'} ${p.number}. ${p.name}`)
  };
}

export function knowledgeFunnel(service, state) {
  const router = artifactData(service, state, 'router');
  const atoms = artifactData(service, state, 'atomicizer');
  const claims = artifactData(service, state, 'claims');
  const families = artifactData(service, state, 'family_builder');
  const themes = artifactData(service, state, 'theme_builder');
  const relations = artifactData(service, state, 'reconciler');
  const distill = artifactData(service, state, 'distiller');
  const proposals = artifactData(service, state, 'proposal');
  const steps = [];
  if (router) {
    steps.push(`${router.assets?.length ?? 0} 条内容`);
    steps.push(`${(router.assets ?? []).filter(a => a.type === 'knowledge').length} 条知识候选`);
  }
  if (atoms) steps.push(`${atoms.atoms?.length ?? 0} 个知识原子`);
  if (claims) steps.push(`${claims.claims?.length ?? 0} 条主张`);
  if (families) steps.push(`${families.families?.length ?? 0} 个知识组`);
  if (themes) steps.push(`${themes.themes?.length ?? 0} 个主题`);
  if (relations) steps.push(`${relations.relations?.length ?? 0} 组关系`);
  if (distill) steps.push(`${distill.distillations?.length ?? 0} 条蒸馏结果`);
  if (proposals) steps.push(`${proposals.proposals?.length ?? 0} 条待确认提案`);
  return steps.join(' → ');
}

function baseReport(service, state, stage, result) {
  const mode = reviewMode(state, stage);
  const phaseNumber = PHASE_BY_STAGE.get(stage) ?? null;
  const nextPhase = phaseNumber && phaseNumber < 7 ? KNOWLEDGE_PHASES[phaseNumber] : null;
  const waiting = mode !== 'progress';
  const userBrief = short(state.user_brief ?? '', 220);
  return {
    title: phaseNumber ? `第 ${phaseNumber}/7 阶段：${KNOWLEDGE_PHASES[phaseNumber - 1].name}` : stageLabel(stage),
    review_mode: mode,
    needs_user_action: waiting,
    ...(userBrief ? { '本轮目标': userBrief } : {}),
    '收敛进度': knowledgeFunnel(service, state),
    ...result,
    progress: knowledgeProgress(state),
    next: waiting
      ? (nextPhase ? `确认后继续：${nextPhase.name}` : '确认后进入正式写入流程')
      : (nextPhase ? `系统内部将继续处理：${nextPhase.name}` : null)
  };
}

function routerReport(service, state, data) {
  const assets = data.assets ?? [];
  const counts = new Map();
  for (const asset of assets) counts.set(asset.type, (counts.get(asset.type) ?? 0) + 1);
  const knowledge = assets.filter(a => a.type === 'knowledge');
  const sourceContainers = assets.filter(a => SOURCE_CONTAINER_TYPES.has(a.type));
  const knowledgeFromSources = knowledge.filter(k => sourceContainers.some(s => rangeContains(s.anchor, k.anchor)));
  const unorganized = assets.filter(a => a.type === 'unorganized');
  const risks = data.risk_flags ?? [];
  const changes = [...counts.entries()].map(([type, count]) => `${assetTypeLabel(type)} ${count} 条`);
  if (knowledgeFromSources.length) changes.push(`从外部资料/项目材料中另外抽出 ${knowledgeFromSources.length} 条可复用知识片段`);
  const attention = [];
  if (unorganized.length) attention.push(`${unorganized.length} 条内容暂时无法可靠分流`);
  if (risks.length) attention.push(`${risks.length} 项分流风险需要人工判断`);
  const decision = stageWaitingReview(state, 'router')
    ? '只需要判断待整理/风险项是否可以按当前分流继续；正常分流项无需逐条复核。'
    : null;
  return baseReport(service, state, 'router', {
    summary: `已完成内容分流，共识别 ${assets.length} 条内容，其中 ${knowledge.length} 条进入知识加工。`,
    changes,
    attention,
    review_items: stageWaitingReview(state, 'router')
      ? [...listSample(unorganized, a => short(a.anchor?.quote ?? a.title), 8), ...listSample(risks, r => short(typeof r === 'string' ? r : JSON.stringify(r)), 8)]
      : [],
    decision_question: decision,
    background_note: '外部资料、项目案例和项目方案保留来源身份；其中可复用的具体片段可以另建知识候选，不再被当作知识加工终点。',
    prompt: decision ? '请只处理上面的风险/待整理项；没有异议可明确批准继续。' : null
  });
}

function claimsReport(service, state, data) {
  const claims = data.claims ?? [];
  const atoms = artifactData(service, state, 'atomicizer')?.atoms ?? [];
  const knowledge = (artifactData(service, state, 'router')?.assets ?? []).filter(a => a.type === 'knowledge');
  const byAsset = new Map();
  for (const atom of atoms) byAsset.set(atom.asset_id, (byAsset.get(atom.asset_id) ?? 0) + 1);
  const compoundAssets = [...byAsset.values()].filter(n => n > 1).length;
  const attributed = claims.filter(c => c.source_status && c.source_status !== 'explicit').length;
  return baseReport(service, state, 'claims', {
    summary: `已将 ${knowledge.length} 条知识候选拆成 ${atoms.length} 个知识原子，并形成 ${claims.length} 条可独立处理的主张。`,
    changes: [
      ...(compoundAssets ? [`${compoundAssets} 份复合知识被拆成多个独立主张`] : ['未发现需要进一步拆分的复合知识']),
      ...(attributed ? [`${attributed} 条主张属于引用/推断来源，后续保留证据边界`] : [])
    ],
    attention: [],
    review_items: [],
    examples: listSample(claims, c => short(c.statement ?? c.text ?? c.summary)),
    decision_question: null,
    background_note: '本阶段是机器内部拆解步骤；没有风险时不会单独打断你。',
    prompt: null
  });
}

function familyReport(service, state, data) {
  const claims = claimMap(service, state);
  const families = data.families ?? [];
  const merged = families.filter(f => (f.claim_ids ?? []).length > 1);
  const mergedAway = [...merged].reduce((sum, f) => sum + Math.max(0, (f.claim_ids?.length ?? 0) - 1), 0);
  const mergeItems = listSample(merged, family => {
    const linked = (family.claim_ids ?? []).map(id => claims.get(id)).filter(Boolean);
    const texts = linked.map(c => short(c.statement ?? c.text ?? '', 44)).filter(Boolean);
    return texts.length ? `合并 ${texts.length} 条：${texts.join(' / ')}` : humanReadableTitle(family, { fallback: null });
  }, 10);
  return baseReport(service, state, 'family_builder', {
    summary: `已将 ${claims.size} 条主张归成 ${families.length} 个同类知识组；真正发生合并的有 ${merged.length} 组。`,
    changes: merged.length ? [`共减少 ${mergedAway} 个重复表达单元`, ...mergeItems] : ['没有主张被强行合并'],
    attention: [],
    review_items: [],
    decision_question: null,
    background_note: '单主张知识组不逐条展示；这里只突出真正发生的合并，完整映射保留在技术产物中。',
    prompt: null
  });
}

function themeReport(service, state, data) {
  const themes = data.themes ?? [];
  const items = themes.map(t => {
    const title = humanReadableTitle(t, { fallback: '未命名主题', maxLength: 36 });
    const q = short(t.central_question ?? t.question ?? '', 90);
    return `${title}${q && q !== title ? `：${q}` : ''}（含 ${t.family_ids?.length ?? 0} 个知识组）`;
  });
  const waiting = reviewMode(state, 'theme_builder') !== 'progress';
  return baseReport(service, state, 'theme_builder', {
    summary: `已把知识结构压缩为 ${themes.length} 个主题。现在是本轮第一个高价值人工检查点。`,
    changes: items,
    attention: data.major_change && data.major_change !== 'none' ? [`检测到主题结构变化：${short(String(data.major_change), 120)}`] : [],
    review_items: items,
    decision_question: waiting ? '只需要判断：这些主题是否准确覆盖了你本轮想整理的重点？有没有明显的合并、拆分、遗漏或跑偏？' : null,
    background_note: '此前的逐条分流、主张和单主张知识组不再重复展示；完整来源链仍保留。',
    prompt: waiting ? '主题结构没问题就回复“继续”；有问题直接指出哪一主题要合并、拆分、改名或补充。' : null
  });
}

function relationText(claims, r) {
  const a = claims.get(r.from_claim_id), b = claims.get(r.to_claim_id);
  const left = short(a?.statement ?? a?.text ?? '', 46);
  const right = short(b?.statement ?? b?.text ?? '', 46);
  if (!left || !right) return null;
  return `${relationLabel(r.type)}：${left} ↔ ${right}${r.rationale ? `（${short(r.rationale, 60)}）` : ''}`;
}

function relationReport(service, state, data) {
  const claims = claimMap(service, state);
  const relations = data.relations ?? [];
  const counts = new Map();
  for (const r of relations) counts.set(r.type, (counts.get(r.type) ?? 0) + 1);
  const decisionRelations = relations.filter(r => DECISION_RELATIONS.has(r.type));
  const ordinaryChanges = relations.filter(r => CHANGE_RELATIONS.has(r.type));
  const decisionItems = decisionRelations.map(r => relationText(claims, r)).filter(Boolean);
  const autoExamples = listSample(ordinaryChanges, r => relationText(claims, r), 8);
  const needsDecision = stageWaitingReview(state, 'reconciler');
  const changes = [...counts.entries()].map(([type, count]) => `${relationLabel(type)} ${count} 组`);
  return baseReport(service, state, 'reconciler', {
    summary: decisionRelations.length || data.version_judgement
      ? `关系检查发现 ${relations.length} 组关系，其中 ${decisionRelations.length} 组涉及冲突/撤回，需要你判断。`
      : `关系检查发现 ${relations.length} 组关系，没有需要你裁决的直接冲突或版本取舍。`,
    changes,
    attention: decisionItems,
    review_items: needsDecision ? decisionItems : [],
    auto_handled_examples: needsDecision ? [] : autoExamples,
    decision_question: needsDecision ? '只判断上面的冲突/撤回/版本问题；重复、细化、补充、来源和应用关系由系统记录，无需逐条批准。' : null,
    background_note: needsDecision ? '正常关系已折叠，不占用审核注意力。' : '本阶段无人工决策项，系统会自动进入知识蒸馏。',
    prompt: needsDecision ? '请逐项说明保留双方、修订旧版本、撤回旧判断或其它处理意见。' : null
  });
}

function distillReport(service, state, data) {
  const items = data.distillations ?? [];
  return baseReport(service, state, 'distiller', {
    summary: `已形成 ${items.length} 条可复用的知识蒸馏结果。`,
    changes: listSample(items, x => short(x.text ?? x.summary ?? x.statement, 160), 8),
    attention: [],
    review_items: [],
    decision_question: null,
    background_note: '没有冲突需要裁决时，本阶段不单独打断你；这些结果将直接进入最终提案。',
    prompt: null
  });
}

function proposalReport(service, state, data) {
  const items = data.proposals ?? [];
  const reviewItems = items.map((x, i) => {
    const text = short(x.text ?? x.summary ?? x.title ?? x.name, 190) ?? `提案 ${i + 1}`;
    const sourceCount = x.supporting_claim_ids?.length ?? 0;
    const conflictCount = x.conflict_claim_ids?.length ?? 0;
    return `${i + 1}. ${text}（来源 ${sourceCount} 条${conflictCount ? `；冲突来源 ${conflictCount} 条` : ''}）`;
  });
  return baseReport(service, state, 'proposal', {
    summary: `已生成 ${items.length} 条正式知识候选；这是需要你做决定的最终审核，不会自动写入正式知识库。`,
    changes: [`新增/修订候选共 ${items.length} 条`],
    attention: items.map((x, i) => ({ x, i })).filter(({ x }) => (x.conflict_claim_ids?.length ?? 0) > 0).map(({ i }) => `提案 ${i + 1} 仍关联冲突来源`),
    review_items: reviewItems,
    decision_question: '请对每条提案明确选择：接受 / 拒绝 / 部分接受。这里只审核最终知识结论，不再要求你重新审核前面所有原始记录。',
    background_note: '完整证据、原文锚点和阶段产物保留在技术层，需要时再展开；正常审核只看上面的最终提案与异常项。',
    prompt: '请逐条给出“接受 / 拒绝 / 部分接受”；只有已批准内容才能进入正式知识库。'
  });
}

function genericReport(service, state, stage, data) {
  const arrays = Object.values(data ?? {}).filter(Array.isArray);
  const count = arrays.reduce((sum, x) => sum + x.length, 0);
  return baseReport(service, state, stage, {
    summary: `已完成“${stageLabel(stage)}”${count ? `，产生 ${count} 条结果` : ''}。`,
    changes: [], attention: [], review_items: [], decision_question: null, prompt: null
  });
}

export function buildStageReport(service, state, stage) {
  const data = artifactData(service, state, stage) ?? {};
  if (stage === 'router') return routerReport(service, state, data);
  if (stage === 'claims') return claimsReport(service, state, data);
  if (stage === 'family_builder') return familyReport(service, state, data);
  if (stage === 'theme_builder') return themeReport(service, state, data);
  if (stage === 'reconciler') return relationReport(service, state, data);
  if (stage === 'distiller') return distillReport(service, state, data);
  if (stage === 'proposal') return proposalReport(service, state, data);
  return genericReport(service, state, stage, data);
}

function activeReviewStage(state) {
  const waiting = Object.values(state.checkpoints ?? {}).find(cp => cp.status === 'waiting_user_approval');
  if (waiting?.stage) return waiting.stage;
  if (state.interaction?.status === 'waiting_continue') return state.interaction.after_stage;
  return null;
}

export function buildCurrentView(service, resumed) {
  const state = resumed.state;
  const reviewStage = activeReviewStage(state);
  const completed = reviewStage
    ? { complete_stage: reviewStage }
    : [...KNOWLEDGE_PHASES].reverse().find(p => ['completed', 'waiting_review'].includes(state.stages?.[p.complete_stage]?.status));
  const lastReport = completed ? buildStageReport(service, state, completed.complete_stage) : null;
  return {
    progress: knowledgeProgress(state),
    funnel: knowledgeFunnel(service, state),
    last_result: lastReport,
    required_action: resumed.required_action,
    next_stage_label: resumed.next_stage ? stageLabel(resumed.next_stage) : null,
    waiting_for_continue: resumed.required_action === 'continue',
    waiting_for_review: resumed.required_action === 'review'
  };
}

export function presentStageReport(report) {
  if (!report) return null;
  const out = {
    '标题': report.title,
    ...(report['本轮目标'] ? { '本轮目标': report['本轮目标'] } : {}),
    ...(report['收敛进度'] ? { '收敛进度': report['收敛进度'] } : {}),
    '结论': report.summary
  };
  if (report.changes?.length) out['本阶段变化'] = report.changes;
  if (report.attention?.length) out['需要注意'] = report.attention;
  if (report.review_items?.length) out['需要你判断'] = report.review_items;
  if (report.auto_handled_examples?.length) out['已自动处理示例'] = report.auto_handled_examples;
  if (report.decision_question) out['你只需要判断'] = report.decision_question;
  if (report.background_note) out['说明'] = report.background_note;
  if (report.next) out['下一步'] = report.next;
  if (report.prompt) out['如何回复'] = report.prompt;
  return out;
}
