import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ingest, evaluatePaired, assessSkillCandidate } from '../src/pipeline.js';

const mixed = fs.readFileSync(new URL('../fixtures/mixed.txt', import.meta.url));
const annotations = JSON.parse(fs.readFileSync(new URL('../fixtures/mixed.annotations.json', import.meta.url), 'utf8'));
function temp() { return fs.mkdtempSync(path.join(os.tmpdir(), 'kb-pipeline-')); }

test('mixed input routes separately and preserves exact RAW', () => {
  const store = temp();
  const r = ingest({ store, bytes: mixed, annotations });
  assert.deepEqual(r.run.assets.map(a => a.type), ['knowledge', 'todo', 'idea', 'copy']);
  assert.equal(r.run.assets[0].source_identity, 'unknown');
  assert.equal(r.run.assets[0].verification_status, 'unverified');
  assert.deepEqual(r.run.assets[0].topic_tags, []);
  assert.equal(r.run.claims.length, 1);
  assert.equal(r.run.themes.length, 1);
  assert.deepEqual(r.run.themes[0].primary_family_ids, r.run.themes[0].family_ids);
  assert.equal(r.run.canonical.length, 0);
  assert.equal(r.run.proposals[0].status, 'pending_human_review');
  assert.deepEqual(fs.readFileSync(r.raw_path), mixed);
  assert.equal(r.run.claims[0].anchor.quote, mixed.toString('utf8').slice(r.run.claims[0].anchor.start, r.run.claims[0].anchor.end));
  fs.rmSync(store, { recursive: true, force: true });
});

test('same input is idempotent and cannot overwrite RAW', () => {
  const store = temp();
  const first = ingest({ store, bytes: mixed, annotations });
  const second = ingest({ store, bytes: mixed, annotations });
  assert.equal(first.run_id, second.run_id);
  fs.writeFileSync(first.raw_path, 'tampered');
  assert.throws(() => ingest({ store, bytes: mixed, annotations }), /篡改/);
  fs.rmSync(store, { recursive: true, force: true });
});

test('existing run result cannot be silently overwritten', () => {
  const store = temp();
  const first = ingest({ store, bytes: mixed, annotations });
  fs.writeFileSync(first.run_path, '{}');
  assert.throws(() => ingest({ store, bytes: mixed, annotations }), /运行结果已被篡改/);
  fs.rmSync(store, { recursive: true, force: true });
});

test('ambiguous anchor, invented quote, illegal relation are rejected', () => {
  const store = temp();
  assert.throws(() => ingest({ store, bytes: Buffer.from('重复，重复'), annotations: { parts: [{ quote: '重复', type: 'knowledge' }] } }), /occurrence/);
  assert.throws(() => ingest({ store, bytes: mixed, annotations: { parts: [{ quote: '不存在', type: 'knowledge' }] } }), /找不到/);
  assert.throws(() => ingest({ store, bytes: mixed, annotations: { ...annotations, relations: [{ from: 0, to: 1, type: 'CONTRADICTS' }] } }), /知识 Claim/);
  fs.rmSync(store, { recursive: true, force: true });
});

test('paired decision is advisory, with odd independent votes', () => {
  assert.equal(evaluatePaired(['better', 'better', 'worse']).recommendation, 'keep');
  assert.equal(evaluatePaired(['worse', 'worse', 'better']).recommendation, 'revert');
  assert.throws(() => evaluatePaired(['better', 'worse']), /奇数/);
});

test('skill gate separates retained knowledge from a skill draft', () => {
  const candidate = { supporting_claim_ids: ['claim_1'],
    verification: { source_sufficiency: true, executability: true, task_utility: true },
    promotion: { independent_intent: true, independent_contract: true, independent_run: true,
      independent_reuse: true, independent_eval: false },
    ria: { R: '原文', I: '解释', A1: '案例', A2: '触发', E: '步骤', B: '边界' } };
  assert.equal(assessSkillCandidate(candidate).destination, 'draft_skill_for_test_and_human_review');
  assert.equal(assessSkillCandidate({ ...candidate, promotion: { ...candidate.promotion, independent_contract: false } }).destination,
    'knowledge_or_needs_review');
  assert.equal(assessSkillCandidate(candidate).formal_skill_created, false);
});

test('opposing knowledge remains separate with a suggested contradiction', () => {
  const store = temp();
  const bytes = Buffer.from('开场不要卖。开场马上卖。');
  const r = ingest({ store, bytes, annotations: {
    parts: [
      { quote: '开场不要卖。', type: 'knowledge', parent_tag: '直播', theme: '开场策略' },
      { quote: '开场马上卖。', type: 'knowledge', parent_tag: '销售', theme: '开场策略' }
    ],
    relations: [{ from: 0, to: 1, type: 'CONTRADICTS', rationale: '同一时段、立场相反，适用条件待核' }],
    proposals: [{ text: '两种开场观点冲突，需核适用条件', claim_parts: [0, 1], conflict_claim_parts: [0, 1] }]
  }});
  assert.equal(r.run.families.length, 2);
  assert.equal(r.run.themes.length, 1);
  assert.equal(r.run.themes[0].family_ids.length, 2);
  assert.equal(r.run.relations[0].status, 'suggested');
  assert.equal(r.run.proposals[0].status, 'pending_human_review');
  assert.equal(r.run.canonical.length, 0);
  fs.rmSync(store, { recursive: true, force: true });
});


test('one Family has one primary Theme and can be cross-referenced by another Theme', () => {
  const store = temp();
  const bytes = Buffer.from('知识A。知识B。');
  const r = ingest({ store, bytes, annotations: {
    parts: [
      { quote: '知识A。', type: 'knowledge', source_identity: 'user_view', verification_status: 'user_verified',
        topic_tags: ['内容', '知识管理'], family: '复用判断',
        themes: ['知识应用', '内容生产'], primary_theme: '知识应用',
        central_question: '一条知识如何在多个真实问题中被复用？', inclusion: '知识复用', exclusion: '无关内容' },
      { quote: '知识B。', type: 'knowledge', source_identity: 'project_practice', verification_status: 'project_verified',
        topic_tags: ['内容'], family: '内容判断',
        theme: '内容生产', central_question: '内容生产如何调用已有知识？', inclusion: '内容生产', exclusion: '无关内容' }
    ],
    relations: [],
    proposals: [{ text: '跨主题复用应保留一个主归属，并通过关系引用其它问题域。', claim_parts: [0, 1] }]
  }});
  const a = r.run.families.find(x => x.key === '复用判断');
  const primary = r.run.themes.find(x => x.name === '知识应用');
  const secondary = r.run.themes.find(x => x.name === '内容生产');
  assert.ok(primary.primary_family_ids.includes(a.id));
  assert.ok(primary.family_ids.includes(a.id));
  assert.ok(secondary.family_ids.includes(a.id));
  assert.ok(!secondary.primary_family_ids.includes(a.id));
  const primaryCount = r.run.themes.flatMap(x => x.primary_family_ids).filter(x => x === a.id).length;
  assert.equal(primaryCount, 1);
  fs.rmSync(store, { recursive: true, force: true });
});
