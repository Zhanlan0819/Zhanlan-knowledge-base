import test from 'node:test';
import assert from 'node:assert/strict';
import {
  assetTypeLabel, stageLabel, statusLabel, actionLabel, gateLabel,
  isInternalId, humanReadableTitle, USER_VISIBLE_ASSET_TYPES, presentResume
} from '../src/display-labels.js';

test('user-facing type labels are Chinese only', () => {
  assert.deepEqual(USER_VISIBLE_ASSET_TYPES, [
    '知识内容', '项目案例', '文案素材', '观点灵感', '待办行动', '备忘记录', '项目方案', '外部资料', '待整理'
  ]);
  assert.equal(assetTypeLabel('external'), '外部资料');
  assert.equal(assetTypeLabel('case'), '项目案例');
});

test('machine stages and states have Chinese display labels', () => {
  assert.equal(stageLabel('family_builder'), '同类知识归组');
  assert.equal(stageLabel('reconciler'), '重复、补充与冲突检查');
  assert.equal(statusLabel('waiting_user_approval'), '等待你确认');
  assert.equal(actionLabel('review'), '等待你确认');
  assert.equal(actionLabel('continue'), '等待你继续');
  assert.equal(gateLabel('canonical_proposal'), '正式知识提案需要确认');
});

test('internal slugs are hidden in normal title resolution', () => {
  assert.equal(isInternalId('method-reverse-topic-selection'), true);
  assert.equal(isInternalId('organized-20260913-7-a84d19'), true);
  assert.equal(humanReadableTitle('method-reverse-topic-selection'), '未命名内容');
  assert.equal(humanReadableTitle({ id: 'method-reverse-topic-selection', title: '反向选题法' }), '反向选题法');
  assert.equal(humanReadableTitle({ id: 'organized-20260913-7-a84d19', text: '用户选择的理由是可信、省心和实际收益。' }),
    '用户选择的理由是可信、省心和实际收益。');
});

test('resume presentation contains no machine stage/action code', () => {
  const view = presentResume({ status: 'waiting_user_approval', next_stage: null,
    required_action: 'review', checkpoint: 'canonical_proposal' });
  assert.deepEqual(view, {
    '运行状态': '等待你确认', '当前步骤': null, '下一步': '等待你确认', '需要确认': '正式知识提案需要确认'
  });
});
