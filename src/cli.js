import fs from 'node:fs';
import { ingest, evaluatePaired, assessSkillCandidate } from './pipeline.js';

function flag(name) { const i = process.argv.indexOf(name); return i < 0 ? null : process.argv[i + 1]; }
try {
  const action = process.argv[2];
  if (action === 'ingest') {
    const store = flag('--store'), input = flag('--input'), annotations = flag('--annotations');
    if (!store || !input || !annotations) throw new Error('用法: ingest --store DIR --input TXT --annotations JSON');
    const result = ingest({ store, bytes: fs.readFileSync(input),
      annotations: JSON.parse(fs.readFileSync(annotations, 'utf8')) });
    process.stdout.write(JSON.stringify({ run_id: result.run_id, raw_id: result.raw_id,
      assets: result.run.assets.length, claims: result.run.claims.length,
      proposals: result.run.proposals.length, run_path: result.run_path }, null, 2) + '\n');
  } else if (action === 'paired') {
    const votes = flag('--votes');
    if (!votes) throw new Error('用法: paired --votes better,worse,tie');
    process.stdout.write(JSON.stringify(evaluatePaired(votes.split(',')), null, 2) + '\n');
  } else if (action === 'gate') {
    const candidate = flag('--candidate');
    if (!candidate) throw new Error('用法: gate --candidate JSON');
    process.stdout.write(JSON.stringify(assessSkillCandidate(JSON.parse(fs.readFileSync(candidate, 'utf8'))), null, 2) + '\n');
  } else throw new Error('可用命令: ingest, paired, gate');
} catch (error) { process.stderr.write(`错误: ${error.message}\n`); process.exitCode = 1; }
