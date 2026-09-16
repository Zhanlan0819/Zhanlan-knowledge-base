import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const mode = process.argv.includes('--check') ? 'check' : process.argv.includes('--apply') ? 'apply' : null;
if (!mode) {
  process.stderr.write('Usage: node scripts/upgrade-v06-review-architecture.js --apply|--check\n');
  process.exit(2);
}

const START = '<!-- V0.6_DECISION_FIRST_START -->';
const END = '<!-- V0.6_DECISION_FIRST_END -->';

const patches = {
  'skills/knowledge-router/STAGE.md': `
${START}
## v0.6 决策优先补充规则

- “外部资料 / 项目案例 / 项目方案”首先表示来源或载体身份，不再视为知识加工终点。
- 如果这些材料包含可复用判断、方法、原则、步骤或案例结构：保留原来源资产，同时对真正可复用的具体原文片段额外建立 knowledge 资产；允许锚点重叠。
- 不要把整份外部材料强行改成知识；只抽取可复用片段，后续必须能回溯到原来源。
- 用户审核只看待整理、风险项和明显误分流；正常分流项不要求逐条确认。
${END}
`,
  'skills/knowledge-atomicizer/STAGE.md': `
${START}
## v0.6 真正原子化规则

- 一份知识资产可以拆成多个原子；禁止继续假设“一资产 = 一原子”。
- 每个原子只承载一个能独立判断、归组、引用的最小主张。
- 原子锚点必须是所属知识资产真实原文范围内的子片段，不得改写证据原文。
- 每个知识资产至少一个原子；一个原子对应一条 Claim。长知识中独立的判断、条件、步骤、反例、边界应按语义拆开。
- 本阶段是内部处理步骤，无风险时不单独要求用户确认。
${END}
`,
  'skills/knowledge-family-builder/STAGE.md': `
${START}
## v0.6 归组与审核规则

- 只在表达同一核心判断时合并；同主题下的步骤、案例、条件、细化、补充、应用不要误合并。
- 用户可见摘要只突出“真正发生合并”的组；单主张组默认折叠到技术详情。
- 本阶段无风险时自动进入主题整理，不要求用户机械回复“继续”。
${END}
`,
  'skills/knowledge-theme-builder/STAGE.md': `
${START}
## v0.6 高层结构检查点

- Theme 是本轮默认的第一个高价值人工检查点：让用户确认高层结构是否覆盖其本轮目标，而不是重新审核所有来源和知识组。
- 输出优先展示：主题名称、中心问题、包含知识组数量，以及与 user_brief / 本轮目标的对应关系。
- 用户只需判断明显的合并、拆分、遗漏、命名或方向跑偏。
${END}
`,
  'skills/knowledge-reconciler/STAGE.md': `
${START}
## v0.6 异常优先关系检查

- 冲突、撤回、版本变化属于人工决策项；重复、细化、补充、来源、应用关系默认自动记录。
- 没有真正冲突/版本取舍时，不得仅因本阶段完成而要求用户回复“继续”；自动进入知识蒸馏。
- 用户可见结果优先展示冲突双方及具体分歧，不展示大量“无冲突”正常关系。
${END}
`,
  'skills/knowledge-distiller/STAGE.md': `
${START}
## v0.6 蒸馏与提案衔接

- 蒸馏结果必须是用户可直接阅读和复用的知识结论，而不只是数量统计或内部 ID。
- 已在前序阶段确认过的来源边界不要反复长篇解释；除非边界发生变化，只作为背景约束执行。
- 没有风险时，蒸馏完成后自动生成 Proposal，不再增加一个机械“继续”确认点。
- Proposal 用户审核只展示最终候选、异常和必要来源摘要；完整证据链放技术详情。
${END}
`
};

function replaceBlock(text, block) {
  const start = text.indexOf(START);
  const end = text.indexOf(END);
  if (start >= 0 && end >= start) return text.slice(0, start).trimEnd() + '\n\n' + block.trim() + '\n' + text.slice(end + END.length).trimStart();
  return text.trimEnd() + '\n\n' + block.trim() + '\n';
}

const results = [];
for (const [relative, block] of Object.entries(patches)) {
  const file = path.join(root, relative);
  if (!fs.existsSync(file)) {
    results.push({ file: relative, status: 'missing' });
    continue;
  }
  const text = fs.readFileSync(file, 'utf8');
  const installed = text.includes(START) && text.includes(END);
  if (mode === 'check') {
    results.push({ file: relative, status: installed ? 'installed' : 'needs_patch' });
    continue;
  }
  if (!installed) {
    const backup = `${file}.pre-v06.bak`;
    if (!fs.existsSync(backup)) fs.copyFileSync(file, backup);
  }
  fs.writeFileSync(file, replaceBlock(text, block), 'utf8');
  results.push({ file: relative, status: installed ? 'updated' : 'patched' });
}

const missing = results.filter(x => x.status === 'missing');
const needs = results.filter(x => x.status === 'needs_patch');
process.stdout.write(JSON.stringify({ mode, results, ready: missing.length === 0 && needs.length === 0 }, null, 2) + '\n');
if (missing.length) process.exitCode = 1;
if (mode === 'check' && needs.length) process.exitCode = 3;
