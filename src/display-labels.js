export const ASSET_TYPE_LABELS = Object.freeze({
  knowledge: '知识内容',
  case: '项目案例',
  copy: '文案素材',
  idea: '观点灵感',
  todo: '待办行动',
  project: '项目方案',
  external: '外部资料',
  unorganized: '待整理'
});

export const STAGE_LABELS = Object.freeze({
  intake: '原始资料入库',
  router: '内容分流',
  atomicizer: '知识拆解',
  claims: '主张提取',
  family_builder: '同类知识归组',
  theme_builder: '主题整理',
  reconciler: '重复、补充与冲突检查',
  distiller: '知识蒸馏',
  proposal: '生成待确认提案',
  canonical: '正式知识入库',
  skill_candidate: '能力候选筛选',
  skill_builder: '能力规则构建',
  evaluator: '实际任务评测',
  skill_publish: '正式能力发布'
});

export const STATUS_LABELS = Object.freeze({
  running: '处理中',
  waiting_user_approval: '等待你确认',
  completed: '已完成',
  completed_nonknowledge: '已完成（无需进入知识整理）',
  rejected: '已驳回',
  failed: '执行失败',
  needs_revision: '需要修改',
  not_started: '未开始',
  waiting_review: '等待确认',
  stale: '上游已变更，需要重做',
  not_applicable: '不适用'
});

export const ACTION_LABELS = Object.freeze({
  execute: '执行当前步骤',
  retry: '重做当前步骤',
  continue: '等待你继续',
  review: '等待你确认',
  apply_approved_proposals: '写入已批准的正式知识',
  publish_approved_skill: '发布已批准的正式能力',
  done: '流程结束'
});

export const GATE_LABELS = Object.freeze({
  route_risk: '内容分流需要确认',
  major_theme_change: '主题结构发生较大变化，需要确认',
  conflict_or_version: '发现冲突或版本变化，需要确认',
  canonical_proposal: '正式知识提案需要确认',
  skill_promotion: '是否晋级为可复用能力，需要确认',
  skill_publication: '能力评测通过后是否正式发布，需要确认'
});

export const RELATION_LABELS = Object.freeze({
  REPEATS: '重复',
  REFINES: '细化',
  EXTENDS: '补充',
  CONTRADICTS: '冲突',
  RETRACTS: '撤回',
  ORIGIN: '来源',
  APPLICATION: '应用'
});

const INTERNAL_ID_PATTERNS = [
  /^(?:raw|wf|run|asset|atom|claim|family|theme|proposal|canonical|candidate|draft|eval|attempt|artifact|decision|output)_[A-Za-z0-9_-]+$/,
  /^organized-[A-Za-z0-9-]+$/,
  /^(?:content|method|business|knowledge|source|case|copy|idea|todo|project)-[a-z0-9-]+$/
];

export function assetTypeLabel(value) { return ASSET_TYPE_LABELS[value] ?? '其他内容'; }
export function stageLabel(value) { return STAGE_LABELS[value] ?? '内部处理步骤'; }
export function statusLabel(value) { return STATUS_LABELS[value] ?? '未知状态'; }
export function actionLabel(value) { return ACTION_LABELS[value] ?? '继续处理'; }
export function gateLabel(value) { return GATE_LABELS[value] ?? '需要你确认'; }
export function relationLabel(value) { return RELATION_LABELS[value] ?? '关联'; }

export function isInternalId(value) {
  return typeof value === 'string' && INTERNAL_ID_PATTERNS.some(pattern => pattern.test(value));
}

function cleanText(value) {
  if (typeof value !== 'string') return null;
  const text = value.trim().replace(/\s+/g, ' ');
  if (!text || isInternalId(text)) return null;
  return text;
}

export function humanReadableTitle(entity, { fallback = '未命名内容', maxLength = 42 } = {}) {
  if (typeof entity === 'string') {
    const text = cleanText(entity);
    return text ? (text.length > maxLength ? `${text.slice(0, maxLength)}…` : text) : fallback;
  }
  if (!entity || typeof entity !== 'object') return fallback;
  const candidates = [
    entity.title, entity.name, entity.label, entity.question, entity.center_question,
    entity.central_question, entity.summary, entity.statement, entity.text, entity.description, entity.quote
  ];
  for (const value of candidates) {
    const text = cleanText(value);
    if (text) return text.length > maxLength ? `${text.slice(0, maxLength)}…` : text;
  }
  return fallback;
}

export function presentResume(resumed) {
  return {
    '运行状态': statusLabel(resumed.status),
    '当前步骤': resumed.next_stage ? stageLabel(resumed.next_stage) : null,
    '下一步': actionLabel(resumed.required_action),
    '需要确认': resumed.checkpoint ? gateLabel(resumed.checkpoint) : null,
    ...(resumed.required_action === 'continue' && resumed.after_stage ? {
      '刚完成': stageLabel(resumed.after_stage)
    } : {})
  };
}

export function presentStageHistory(history = []) {
  return history.map(item => ({
    '步骤': stageLabel(item.stage),
    '结果': statusLabel(item.status === 'stage_completed' ? 'completed' : item.status),
    ...(item.error ? { '说明': item.error } : {})
  }));
}

export const USER_VISIBLE_ASSET_TYPES = Object.freeze(Object.values(ASSET_TYPE_LABELS));
