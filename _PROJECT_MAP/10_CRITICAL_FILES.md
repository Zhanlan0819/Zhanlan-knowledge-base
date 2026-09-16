# 关键源码分层

地图中最值得外部 AI 拿完整内容的文件，并非仅凭地图可修改的许可。

## Tier 1：修改主流程必须取得完整源码

1. `src/workflow.js`：14 阶段、全部 Gate、签名、状态恢复/验证、正式写入。
2. `schemas/workflow-artifacts.schema.json`：各阶段精确 JSON 契约及 $ref。
3. `schemas/workflow-state.schema.json`：run/stage/checkpoint/decision 状态兼容性。
4. `schemas/artifact-envelope.schema.json`：版本、输入指纹、恢复核验。
5. `src/pipeline.js`：RAW 入库、标注建议、候选晋级、投票汇总。
6. `skills/knowledge-orchestrator/SKILL.md`：Agent 入口和局部加载规则。
7. `src/workflow-cli.js`：真实命令接口与审阅终端限制。

## Tier 2：按修改目标索取

`skills/knowledge-router/SKILL.md`、`knowledge-atomicizer`、`knowledge-family-builder`、`knowledge-theme-builder`、`knowledge-reconciler`、`knowledge-distiller`、`knowledge-skill-builder`、`knowledge-evaluator` 中当前阶段的一份；`schemas/run.schema.json`、`skill-candidate.schema.json`、`annotations.schema.json`；`src/cli.js`；`tests/workflow.test.js`；`架构与阶段契约.md`。若要改旧接口，另取 `tests/pipeline.test.js`。

## Tier 3：通常地图概括足够

`README.md`、`研究与映射.md`、`MVP与验收.md`、`examples/混合内容运行演示.md`、`fixtures/*`、`examples/mixed-run/*` 历史样例、`package-lock.json`、未运行的 `schemas/paired-evaluation.schema.json`。若要改它们本身，仍需完整原文。
