import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

export const ASSET_TYPES = ['knowledge', 'case', 'copy', 'idea', 'todo', 'project', 'external', 'unorganized'];
export const RELATIONS = ['REPEATS', 'REFINES', 'EXTENDS', 'CONTRADICTS', 'RETRACTS', 'ORIGIN', 'APPLICATION'];
const sha = value => crypto.createHash('sha256').update(value).digest('hex');
const id = (prefix, value) => `${prefix}_${sha(value).slice(0, 16)}`;

function assert(condition, message) { if (!condition) throw new Error(message); }
function writeNew(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, value, { flag: 'wx' });
}
function findAnchor(text, quote, occurrence) {
  assert(typeof quote === 'string' && quote.length > 0, '拆件 quote 必须非空');
  const hits = [];
  let cursor = 0;
  while ((cursor = text.indexOf(quote, cursor)) !== -1) { hits.push(cursor); cursor += quote.length; }
  assert(hits.length > 0, `RAW 中找不到原文: ${quote}`);
  assert(Number.isInteger(occurrence) ? occurrence >= 0 && occurrence < hits.length : hits.length === 1,
    `原文出现 ${hits.length} 次，请指定合法 occurrence: ${quote}`);
  const start = hits[occurrence ?? 0];
  return { start, end: start + quote.length, quote, offset_unit: 'UTF-16' };
}

export function ingest({ store, bytes, annotations = {} }) {
  assert(Buffer.isBuffer(bytes) && bytes.length > 0, '输入必须是非空 UTF-8 文件');
  const text = bytes.toString('utf8');
  assert(Buffer.from(text, 'utf8').equals(bytes), '输入不是合法 UTF-8，停止处理');
  assert(Array.isArray(annotations.parts), 'annotations.parts 必须是数组');
  const rawId = id('raw', bytes);
  const rawPath = path.join(store, 'raw', `${rawId}.txt`);
  if (fs.existsSync(rawPath)) {
    assert(fs.readFileSync(rawPath).equals(bytes), 'RAW 哈希冲突或已被篡改');
  } else {
    writeNew(rawPath, bytes);
    writeNew(path.join(store, 'raw', `${rawId}.json`), JSON.stringify({ id: rawId, sha256: sha(bytes), bytes: bytes.length }, null, 2));
  }
  const assets = [], atoms = [], claims = [], families = [], themes = [], relations = [], proposals = [];
  const familyMap = new Map(), themeMap = new Map();
  for (const [index, part] of annotations.parts.entries()) {
    assert(ASSET_TYPES.includes(part.type), `非法资产类型: ${part.type}`);
    const anchor = findAnchor(text, part.quote, part.occurrence);
    const assetId = id('asset', `${rawId}:${index}:${part.type}:${anchor.start}`);
    assets.push({ id: assetId, raw_id: rawId, type: part.type, anchor,
      parent_tag: part.parent_tag ?? null, child_tag: part.child_tag ?? null,
      status: part.type === 'unorganized' ? 'unorganized' : 'provisional' });
    if (part.type !== 'knowledge') continue;
    const atomId = id('atom', assetId);
    atoms.push({ id: atomId, asset_id: assetId, raw_id: rawId, anchor, statement: anchor.quote,
      status: 'provisional' });
    const claimId = id('claim', atomId);
    const sourceStatus = part.source_status ?? 'explicit';
    assert(['explicit', 'attributed', 'editor_inference', 'visual_unverified'].includes(sourceStatus), '非法 source_status');
    claims.push({ id: claimId, atom_id: atomId, raw_id: rawId, anchor,
      statement: anchor.quote, source_status: sourceStatus, evidence_status: 'anchor_verified' });
    const familyKey = part.family ?? anchor.quote.trim().toLowerCase();
    assert(typeof familyKey === 'string' && familyKey.length > 0, 'family 必须非空');
    if (!familyMap.has(familyKey)) familyMap.set(familyKey, { id: id('family', familyKey), key: familyKey,
      claim_ids: [], status: part.family ? 'suggested_semantic_group' : 'exact_group' });
    familyMap.get(familyKey).claim_ids.push(claimId);
    if (part.theme) {
      assert(typeof part.theme === 'string', 'theme 必须是字符串');
      if (!themeMap.has(part.theme)) themeMap.set(part.theme, { id: id('theme', part.theme), name: part.theme,
        central_question: part.central_question ?? null, inclusion: part.inclusion ?? null,
        exclusion: part.exclusion ?? null, family_ids: [], status: 'suggested' });
      themeMap.get(part.theme).family_ids.push(familyMap.get(familyKey).id);
    }
  }
  families.push(...familyMap.values());
  themes.push(...[...themeMap.values()].map(t => ({ ...t, family_ids: [...new Set(t.family_ids)] })));
  for (const rel of annotations.relations ?? []) {
    assert(RELATIONS.includes(rel.type), `非法关系: ${rel.type}`);
    assert(Number.isInteger(rel.from) && Number.isInteger(rel.to) && rel.from !== rel.to,
      '关系 from/to 必须是不同的 knowledge part 下标');
    const from = claims.find(c => c.atom_id === id('atom', assets[rel.from]?.id ?? ''));
    const to = claims.find(c => c.atom_id === id('atom', assets[rel.to]?.id ?? ''));
    assert(from && to, '关系端点必须指向知识 Claim');
    relations.push({ id: id('edge', `${from.id}:${to.id}:${rel.type}`), from_claim_id: from.id,
      to_claim_id: to.id, type: rel.type, status: 'suggested', rationale: rel.rationale ?? null });
  }
  for (const [index, p] of (annotations.proposals ?? []).entries()) {
    assert(typeof p.text === 'string' && p.text.trim(), 'proposal.text 必须非空');
    assert(Array.isArray(p.claim_parts) && p.claim_parts.length > 0, 'proposal 必须列出 Claim 来源');
    const supporting = p.claim_parts.map(n => {
      assert(Number.isInteger(n) && assets[n]?.type === 'knowledge', 'proposal 来源必须是知识 part');
      return claims.find(c => c.atom_id === id('atom', assets[n].id)).id;
    });
    proposals.push({ id: id('proposal', `${rawId}:${index}:${p.text}`), target: p.target ?? 'canonical_knowledge',
      text: p.text, supporting_claim_ids: supporting, status: 'pending_human_review',
      conflict_claim_ids: p.conflict_claim_parts?.map(n => {
        assert(Number.isInteger(n) && assets[n]?.type === 'knowledge', '冲突来源必须是知识 part');
        return claims.find(c => c.atom_id === id('atom', assets[n].id)).id;
      }) ?? [] });
  }
  const run = { schema_version: '0.1.0', raw_id: rawId, assets, atoms, claims, families, themes, relations,
    proposals, canonical: [], formal_skills: [], automation_level: 'deterministic_contract_only' };
  const runId = id('run', JSON.stringify(run));
  const runPath = path.join(store, 'runs', `${runId}.json`);
  const runBytes = JSON.stringify({ id: runId, ...run }, null, 2);
  if (fs.existsSync(runPath)) {
    assert(fs.readFileSync(runPath, 'utf8') === runBytes, '运行结果已被篡改，不能静默覆盖');
  } else writeNew(runPath, runBytes);
  return { run_id: runId, raw_id: rawId, run_path: runPath, raw_path: rawPath, run };
}

export function evaluatePaired(votes) {
  assert(Array.isArray(votes) && votes.length >= 3 && votes.length % 2 === 1, 'paired judge 需要至少 3 个、奇数个独立投票');
  assert(votes.every(v => ['better', 'worse', 'tie'].includes(v)), '非法 judge 投票');
  const better = votes.filter(v => v === 'better').length;
  const worse = votes.filter(v => v === 'worse').length;
  return { better, worse, tie: votes.length - better - worse,
    recommendation: worse > better ? 'revert' : 'keep',
    status: 'advisory_only_no_publish_or_rollback' };
}

export function assessSkillCandidate(candidate) {
  const v = candidate?.verification ?? {};
  const p = candidate?.promotion ?? {};
  const knowledgeVerified = ['source_sufficiency', 'executability', 'task_utility'].every(k => v[k] === true);
  const promotionPassed = ['independent_intent', 'independent_contract', 'independent_run'].every(k => p[k] === true)
    && (p.independent_reuse === true || p.independent_eval === true);
  const riaComplete = ['R', 'I', 'A1', 'A2', 'E', 'B'].every(k => typeof candidate?.ria?.[k] === 'string' && candidate.ria[k].trim());
  const provenanceComplete = Array.isArray(candidate?.supporting_claim_ids) && candidate.supporting_claim_ids.length > 0;
  return { knowledge_verified: knowledgeVerified, promotion_passed: promotionPassed,
    ria_complete: riaComplete, provenance_complete: provenanceComplete,
    destination: knowledgeVerified && promotionPassed && riaComplete && provenanceComplete
      ? 'draft_skill_for_test_and_human_review' : 'knowledge_or_needs_review',
    formal_skill_created: false };
}
