# 文件总地图

以下每行列出完整项目相对路径。`谁调用/调用什么` 的 Agent 关系是设计指令，代码关系才是已执行事实；详情及数组可检索 `12_PROJECT_INDEX.json`。`深读` 表示本次读过实际内容，历史快照只扫描。项目内不含 AGENTS.md/system prompt/prompts/templates/hooks。

| 路径 | 类型/用途 | 核心 | 谁调用→调用什么 | 读→写 | 阶段 | 风险 | 编辑需完整源码 |
|---|---|---|---|---|---|---|---|
| `MVP与验收.md` | Markdown；v0.1 开发顺序与验收基线，自报非最新 | 否 | 人 → 架构与阶段契约.md, README.md | 无 → 无 | 历史说明 | 低 | 否 |
| `README.md` | Markdown；v0.2 用法/边界/CLI 操作说明，不由程序读取 | 否 | 人/Agent 按需 → 架构与阶段契约.md, 研究与映射.md, schemas/* | 无 → 无 | 说明 | 低 | 否 |
| `examples/mixed-run/raw/raw_82192282f5968b58.json` | JSON；演示 RAW 的完整 SHA/字节数元数据 | 否 | src/pipeline.js:ingest, src/workflow.js:loadState → 无 | RAW bytes → 自身 JSON | RAW | 低 | 否 |
| `examples/mixed-run/raw/raw_82192282f5968b58.txt` | TXT；演示 RAW 原文字节；与 fixture 内容相同 | 否 | src/pipeline.js:ingest, src/workflow.js:loadState → 无 | fixtures/mixed.txt → 自身 TXT | RAW | 低 | 否 |
| `examples/mixed-run/runs/run_64c380d8f6d5f6f8.json` | JSON；演示 v0.1 建议快照：4 assets、1 Claim/Family/Theme/Proposal | 否 | src/pipeline.js:ingest, src/workflow-cli.js:demo → 无 | fixture 标注 → 自身 JSON | v0.1 建议 | 低 | 否 |
| `examples/mixed-run/workflows/wf_d4b5afdd-aca5-4663-b263-da0520994fe8/AUDIT.jsonl` | JSONL；此次演示 intake→proposal 九条追加审计事件 | 否 | src/workflow.js:audit, 样例说明 → 无 | 阶段动作 → 自身 JSONL | 审计 | 低 | 否 |
| `examples/mixed-run/workflows/wf_d4b5afdd-aca5-4663-b263-da0520994fe8/RUN_STATE.json` | JSON；此次演示当前状态：proposal waiting_review，Gate D 待审 | 否 | src/workflow.js:saveState/loadState, 样例说明 → 无 | 各阶段产物 → 自身 JSON | 状态/恢复 | 低 | 否 |
| `examples/mixed-run/workflows/wf_d4b5afdd-aca5-4663-b263-da0520994fe8/artifacts/atomicizer/v1.json` | JSON；fixture_adapter 的 atomicizer v1 envelope，含 data/上游指纹 | 否 | src/workflow.js（生成/恢复）, 样例说明 → 无 | 前一阶段 Artifact/fixture 建议 → 自身 JSON | atomicizer | 低 | 否 |
| `examples/mixed-run/workflows/wf_d4b5afdd-aca5-4663-b263-da0520994fe8/artifacts/claims/v1.json` | JSON；fixture_adapter 的 claims v1 envelope，含 data/上游指纹 | 否 | src/workflow.js（生成/恢复）, 样例说明 → 无 | 前一阶段 Artifact/fixture 建议 → 自身 JSON | claims | 低 | 否 |
| `examples/mixed-run/workflows/wf_d4b5afdd-aca5-4663-b263-da0520994fe8/artifacts/distiller/v1.json` | JSON；fixture_adapter 的 distiller v1 envelope，含 data/上游指纹 | 否 | src/workflow.js（生成/恢复）, 样例说明 → 无 | 前一阶段 Artifact/fixture 建议 → 自身 JSON | distiller | 低 | 否 |
| `examples/mixed-run/workflows/wf_d4b5afdd-aca5-4663-b263-da0520994fe8/artifacts/family_builder/v1.json` | JSON；fixture_adapter 的 family_builder v1 envelope，含 data/上游指纹 | 否 | src/workflow.js（生成/恢复）, 样例说明 → 无 | 前一阶段 Artifact/fixture 建议 → 自身 JSON | family_builder | 低 | 否 |
| `examples/mixed-run/workflows/wf_d4b5afdd-aca5-4663-b263-da0520994fe8/artifacts/intake/v1.json` | JSON；fixture_adapter 的 intake v1 envelope，含 data/上游指纹 | 否 | src/workflow.js（生成/恢复）, 样例说明 → 无 | 前一阶段 Artifact/fixture 建议 → 自身 JSON | intake | 低 | 否 |
| `examples/mixed-run/workflows/wf_d4b5afdd-aca5-4663-b263-da0520994fe8/artifacts/proposal/v1.json` | JSON；fixture_adapter 的 proposal v1 envelope，含 data/上游指纹 | 否 | src/workflow.js（生成/恢复）, 样例说明 → 无 | 前一阶段 Artifact/fixture 建议 → 自身 JSON | proposal | 低 | 否 |
| `examples/mixed-run/workflows/wf_d4b5afdd-aca5-4663-b263-da0520994fe8/artifacts/reconciler/v1.json` | JSON；fixture_adapter 的 reconciler v1 envelope，含 data/上游指纹 | 否 | src/workflow.js（生成/恢复）, 样例说明 → 无 | 前一阶段 Artifact/fixture 建议 → 自身 JSON | reconciler | 低 | 否 |
| `examples/mixed-run/workflows/wf_d4b5afdd-aca5-4663-b263-da0520994fe8/artifacts/router/v1.json` | JSON；fixture_adapter 的 router v1 envelope，含 data/上游指纹 | 否 | src/workflow.js（生成/恢复）, 样例说明 → 无 | 前一阶段 Artifact/fixture 建议 → 自身 JSON | router | 低 | 否 |
| `examples/mixed-run/workflows/wf_d4b5afdd-aca5-4663-b263-da0520994fe8/artifacts/theme_builder/v1.json` | JSON；fixture_adapter 的 theme_builder v1 envelope，含 data/上游指纹 | 否 | src/workflow.js（生成/恢复）, 样例说明 → 无 | 前一阶段 Artifact/fixture 建议 → 自身 JSON | theme_builder | 低 | 否 |
| `examples/mixed-run/workflows/wf_d4b5afdd-aca5-4663-b263-da0520994fe8/state-history/1789466033009-4f190066-15e1-49b1-8215-0108f64fe976.json` | JSON；此次演示的追加式 RUN_STATE 历史快照之一（九次提交中一时点） | 否 | src/workflow.js:saveState → 无 | 提交时内存 state → 自身 JSON | 状态历史 | 低 | 否 |
| `examples/mixed-run/workflows/wf_d4b5afdd-aca5-4663-b263-da0520994fe8/state-history/1789466033015-eeaafeb9-a3b9-4947-9362-ad84aa8fe53a.json` | JSON；此次演示的追加式 RUN_STATE 历史快照之一（九次提交中一时点） | 否 | src/workflow.js:saveState → 无 | 提交时内存 state → 自身 JSON | 状态历史 | 低 | 否 |
| `examples/mixed-run/workflows/wf_d4b5afdd-aca5-4663-b263-da0520994fe8/state-history/1789466033021-097ba937-aaff-4837-a21f-034c408b2a50.json` | JSON；此次演示的追加式 RUN_STATE 历史快照之一（九次提交中一时点） | 否 | src/workflow.js:saveState → 无 | 提交时内存 state → 自身 JSON | 状态历史 | 低 | 否 |
| `examples/mixed-run/workflows/wf_d4b5afdd-aca5-4663-b263-da0520994fe8/state-history/1789466033026-5c19ab66-dc8f-41f7-80fa-c33c93b76bc1.json` | JSON；此次演示的追加式 RUN_STATE 历史快照之一（九次提交中一时点） | 否 | src/workflow.js:saveState → 无 | 提交时内存 state → 自身 JSON | 状态历史 | 低 | 否 |
| `examples/mixed-run/workflows/wf_d4b5afdd-aca5-4663-b263-da0520994fe8/state-history/1789466033031-e4c52362-0624-4c19-8632-e34086d0e61c.json` | JSON；此次演示的追加式 RUN_STATE 历史快照之一（九次提交中一时点） | 否 | src/workflow.js:saveState → 无 | 提交时内存 state → 自身 JSON | 状态历史 | 低 | 否 |
| `examples/mixed-run/workflows/wf_d4b5afdd-aca5-4663-b263-da0520994fe8/state-history/1789466033036-c2d36284-0898-4e1b-8076-422536ed070c.json` | JSON；此次演示的追加式 RUN_STATE 历史快照之一（九次提交中一时点） | 否 | src/workflow.js:saveState → 无 | 提交时内存 state → 自身 JSON | 状态历史 | 低 | 否 |
| `examples/mixed-run/workflows/wf_d4b5afdd-aca5-4663-b263-da0520994fe8/state-history/1789466033041-bfdcbfc8-ea8c-48ed-b713-03296705ba8d.json` | JSON；此次演示的追加式 RUN_STATE 历史快照之一（九次提交中一时点） | 否 | src/workflow.js:saveState → 无 | 提交时内存 state → 自身 JSON | 状态历史 | 低 | 否 |
| `examples/mixed-run/workflows/wf_d4b5afdd-aca5-4663-b263-da0520994fe8/state-history/1789466033046-4a964ac9-dfd1-416c-9d00-bee62680b249.json` | JSON；此次演示的追加式 RUN_STATE 历史快照之一（九次提交中一时点） | 否 | src/workflow.js:saveState → 无 | 提交时内存 state → 自身 JSON | 状态历史 | 低 | 否 |
| `examples/mixed-run/workflows/wf_d4b5afdd-aca5-4663-b263-da0520994fe8/state-history/1789466033051-37c18c50-7d2d-4db7-b5ab-d7f092d54f36.json` | JSON；此次演示的追加式 RUN_STATE 历史快照之一（九次提交中一时点） | 否 | src/workflow.js:saveState → 无 | 提交时内存 state → 自身 JSON | 状态历史 | 低 | 否 |
| `examples/混合内容运行演示.md` | Markdown；保存一次 fixture_adapter 运行、Gate D 停点证据 | 否 | 人 → examples/mixed-run/* | 无 → 无 | 示例 | 低 | 否 |
| `fixtures/mixed.annotations.json` | JSON；4 parts + 1 canonical proposal 的外部标注 | 否 | tests/*.test.js, npm demo, npm workflow-demo → 无 | 无 → 无 | 入库/测试 | 低 | 否 |
| `fixtures/mixed.txt` | TXT；混合知识/todo/idea/copy 的 UTF-8 输入 | 否 | tests/*.test.js, npm demo, npm workflow-demo → 无 | 无 → 无 | 入库/测试 | 低 | 否 |
| `fixtures/skill-candidate.json` | JSON；v0.1 gate 命令的示例候选，Claim ID 非真实来源 | 否 | README.md 示例 → 无 | 无 → 无 | 候选示例 | 低 | 否 |
| `package-lock.json` | JSON；锁定 Ajv 8.20.0 及其 4 个子依赖 | 否 | npm install → 无 | 无 → 无 | 依赖安装 | 低 | 否 |
| `package.json` | JSON；ES module、npm test/demo/workflow-demo、Ajv 依赖 | 否 | npm → src/cli.js, src/workflow-cli.js, tests/*.test.js | 无 → 无 | 构建/入口 | 中 | 是 |
| `schemas/annotations.schema.json` | JSON；外部 annotations 期望形状；当前代码未编译/验证整份 Schema | 否 | README.md（说明） → 无 | 无 → 无 | 入库输入 | 中 | 是 |
| `schemas/artifact-envelope.schema.json` | JSON；带版本、身份、输入指纹的阶段 Artifact 外壳 | 是 | src/workflow.js → 无 | 无 → 无 | 提交/恢复 | 高 | 是 |
| `schemas/paired-evaluation.schema.json` | JSON；独立 paired 投票记录草案；当前执行代码未加载 | 否 | 研究/说明 → 无 | 无 → 无 | 评测参考 | 低 | 否 |
| `schemas/run.schema.json` | JSON；v0.1 run 形状；其 $defs 被 workflow-artifacts 引用，ingest 自身未 Ajv 验此 Schema | 是 | src/workflow.js via workflow-artifacts → 无 | 无 → 无 | v0.1/阶段 Schema | 高 | 是 |
| `schemas/skill-candidate.schema.json` | JSON；晋级/RIA 子结构；workflow-artifacts 用其 properties | 是 | src/workflow.js via workflow-artifacts → 无 | 无 → 无 | Skill 候选 | 高 | 是 |
| `schemas/workflow-artifacts.schema.json` | JSON；14 阶段候选数据形状；引用 run 和候选子 Schema | 是 | src/workflow.js → schemas/run.schema.json, schemas/skill-candidate.schema.json | 无 → 无 | 全阶段 | 核心不可随意修改 | 是 |
| `schemas/workflow-state.schema.json` | JSON；RUN_STATE、stage/checkpoint/decision 状态形状 | 是 | src/workflow.js → 无 | 无 → 无 | 状态/审批/恢复 | 高 | 是 |
| `skills/knowledge-atomicizer/SKILL.md` | Markdown；两阶段原句 atom/Claim、来源状态 | 是 | orchestrator（设计） → 研究与映射.md | router/RAW → atomicizer/claims 候选 | atomicizer/claims | 高 | 是 |
| `skills/knowledge-distiller/SKILL.md` | Markdown；证据回溯蒸馏并另交 Proposal | 是 | orchestrator（设计） → 研究与映射.md | Themes/Families/Claims/RAW → distiller/proposal 候选 | distiller/proposal | 高 | 是 |
| `skills/knowledge-evaluator/SKILL.md` | Markdown；任务 baseline/paired/keep-revert 审阅 | 是 | orchestrator（设计） → 研究与映射.md | draft/真实输出 → evaluations 候选 | evaluator | 高 | 是 |
| `skills/knowledge-family-builder/SKILL.md` | Markdown；同一主张分族；保留全部 Claim ID | 是 | orchestrator（设计） → 研究与映射.md | Claims → families 候选 | family_builder | 中 | 是 |
| `skills/knowledge-orchestrator/SKILL.md` | Markdown；Agent 总入口：resume/Gate/按阶段载 specialist/submit/禁止 AI 正式写 | 是 | 宿主 Skill 发现（待确认） → 架构与阶段契约.md, 当前 specialist SKILL.md（提示词级） | RUN_STATE、阶段规则（若 Agent 遵从） → 候选 JSON/用户停点（若 Agent 遵从） | 编排/全阶段 | 高 | 是 |
| `skills/knowledge-reconciler/SKILL.md` | Markdown；七类关系、时间/场景/冲突判断 | 是 | orchestrator（设计） → 研究与映射.md | Themes/Claims → relations 候选 | reconciler | 高 | 是 |
| `skills/knowledge-router/SKILL.md` | Markdown；RAW 语义拆件、八类资产、风险/待整理 | 是 | orchestrator（设计）, 宿主可能单独触发 → 研究与映射.md | RAW → router 候选 | router | 高 | 是 |
| `skills/knowledge-skill-builder/SKILL.md` | Markdown；Canon 后晋级/RIA 与草稿 | 是 | orchestrator（设计） → 研究与映射.md | Canonical/Claims → candidate/draft 候选 | skill_candidate/skill_builder | 高 | 是 |
| `skills/knowledge-theme-builder/SKILL.md` | Markdown；问题型 Theme 和纳入排除、跨标签 | 是 | orchestrator（设计） → 研究与映射.md | Families → themes 候选 | theme_builder | 中 | 是 |
| `src/cli.js` | JavaScript；v0.1 ingest/paired/gate 旁路入口 | 否 | 操作者, package.json scripts → src/pipeline.js | TXT、annotations、candidate、votes → CLI JSON/错误；ingest 写 store | v0.1 | 中 | 是 |
| `src/pipeline.js` | JavaScript；v0.1 ingest 从标注生成建议并保存 RAW/run；候选门禁和 paired 汇总 | 是 | src/cli.js, src/workflow.js, tests/pipeline.test.js → 无 | 输入 bytes、annotations、已有 RAW/run → raw/*.txt/json、runs/*.json、建议对象 | 入库/候选/评测 | 高 | 是 |
| `src/workflow-cli.js` | JavaScript；v0.2 命令分发；demo 用 fixture_adapter 逐段提交；审阅命令 TTY/密钥 | 是 | package.json scripts, 操作者 → src/workflow.js | TXT、annotations、阶段 JSON、环境密钥、TTY → CLI JSON/错误；经 service 写 store | 入口/全阶段 | 高 | 是 |
| `src/workflow.js` | JavaScript；WorkflowService 阶段/状态/Gate/签名/产物/恢复 | 是 | src/workflow-cli.js, tests/workflow.test.js → src/pipeline.js, schemas/run.schema.json, schemas/skill-candidate.schema.json, schemas/workflow-artifacts.schema.json, schemas/artifact-envelope.schema.json, schemas/workflow-state.schema.json | --store RAW/状态/产物/审批/评测输出 → RUN_STATE/历史/AUDIT/阶段产物/canonical/formal-skills | 全阶段 | 核心不可随意修改 | 是 |
| `tests/pipeline.test.js` | JavaScript；7 个 v0.1 入库、锚点、只增、候选、投票测试 | 否 | npm test → src/pipeline.js, fixtures/mixed.txt, fixtures/mixed.annotations.json | fixtures/临时 store → 测试结果；临时目录随后删除 | 验证 v0.1 | 低 | 否 |
| `tests/workflow.test.js` | JavaScript；19 个状态/越级/Gate/签名/回滚/评测等服务测试 | 否 | npm test → src/workflow.js, fixtures/mixed.txt, fixtures/mixed.annotations.json | fixtures/临时 store → 测试结果；临时目录随后删除 | 验证全阶段 | 中 | 是 |
| `架构与阶段契约.md` | Markdown；v0.2 状态、阶段、Gate、恢复和安全边界；orchestrator 链接 | 否 | skills/knowledge-orchestrator/SKILL.md, 人 → 研究与映射.md, schemas/workflow-state.schema.json, schemas/workflow-artifacts.schema.json | 无 → 无 | Agent 操作参考 | 中 | 是 |
| `研究与映射.md` | Markdown；四个外部仓库机制研究、v0.1 映射；旧实现边界并非当前 runtime | 否 | specialist SKILL.md, 人 → ../reference-repos/*（文档链接，非代码依赖） | 无 → 无 | 来源解释 | 低 | 否 |

## 来源层级和扫描范围

Runtime Source of Truth 是 `src/workflow.js` 的流程/校验、`src/pipeline.js` 的入库/结构建议、运行时实际编译的 Schema；`skills/*/SKILL.md` 是 Agent 行为来源，但其是否被宿主加载待确认。`README.md`、`架构与阶段契约.md` 是说明，`研究与映射.md`/`MVP与验收.md` 含历史版本。`schemas/annotations.schema.json`、`schemas/paired-evaluation.schema.json` 是设计契约，当前代码未直接加载。`examples/mixed-run` 是一套保存数据，不是实际线上状态。

忽略逐文件深读：`node_modules/`（第三方依赖，依赖由 package-lock 核查）。未见 `.git/dist/build/.cache`。九份 `state-history/*.json` 仅扫描名称和序列，属于重复快照。
