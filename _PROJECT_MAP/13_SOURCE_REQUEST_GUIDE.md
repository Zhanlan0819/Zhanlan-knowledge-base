# 给外部 AI 的最小源码索取清单

索取**文件完整内容**，含当前版本与测试；不要从地图直接生成精准 patch。用户若只要讨论架构，地图通常足够。

| 修改目标 | 必须让用户提供完整源码 | 通常可先不提供 |
|---|---|---|
| 阶段顺序/状态恢复 | `src/workflow.js`、`schemas/workflow-state.schema.json`、`schemas/workflow-artifacts.schema.json`、`schemas/artifact-envelope.schema.json`、`tests/workflow.test.js` | 历史 examples、研究映射 |
| 触发/局部加载的 Agent 行为 | `skills/knowledge-orchestrator/SKILL.md`、目标 specialist SKILL.md、宿主 Skill 安装/发现配置（项目外，待确认） | package-lock、演示历史 |
| 用户确认/Gate/正式写入 | `src/workflow.js`、`src/workflow-cli.js`、state/artifact Schema、`tests/workflow.test.js`，以及实际审阅服务/权限配置（若存在） | `src/cli.js`、v0.1 run 样例 |
| 路由、锚点、annotations | `src/pipeline.js`、`src/workflow.js`、`skills/knowledge-router/SKILL.md`、`schemas/annotations.schema.json`、`schemas/run.schema.json`、`schemas/workflow-artifacts.schema.json`、相关测试 | evaluator Skill、paired Schema |
| Atom/Claim | `src/workflow.js`、`skills/knowledge-atomicizer/SKILL.md`、run/workflow-artifacts Schema、相关测试 | README、研究映射 |
| Family/Theme/冲突 | `src/workflow.js`、对应 family/theme/reconciler SKILL.md、run/workflow-artifacts Schema、`tests/workflow.test.js`；若要改初始建议再加 `src/pipeline.js` | evaluator、发布记录 |
| 蒸馏/Proposal/Canonical | `src/workflow.js`、`skills/knowledge-distiller/SKILL.md`、workflow-artifacts/state Schema、`tests/workflow.test.js` | v0.1 CLI、paired Schema |
| Skill 晋级/RIA/草稿 | `src/pipeline.js`、`src/workflow.js`、`skills/knowledge-skill-builder/SKILL.md`、skill-candidate/workflow-artifacts Schema、相关测试 | router 演示历史 |
| 评测/发布 | `src/workflow.js`、`src/pipeline.js`、`skills/knowledge-evaluator/SKILL.md`、workflow-artifacts/state Schema、`tests/workflow.test.js`；真实 runner/审阅接口若存在也要提供 | 研究映射、MVP 历史 |
| v0.1 入口/一次性快照 | `src/cli.js`、`src/pipeline.js`、`schemas/run.schema.json`、`tests/pipeline.test.js` | workflow history |
| 仅改某份说明文档 | 该文档全文及它声称的运行文件（通常 `src/workflow.js` 或 `src/pipeline.js`） | 其他 specialist 原文 |

若用户提供的代码片段不完整，先核对当前版本和依赖函数再提精确方案。旧 run 迁移/安全改动另需一份去敏的真实 `RUN_STATE.json`、相关 Artifact envelope 和审阅部署方式；不要让用户发送密钥本身。
