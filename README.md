# 阿星知识库智能整理与知识蒸馏系统 · 工作流骨架 v0.2

定位：所有输入先整理成合适的资产；Skill 只是成熟知识的后段分支。本目录是可继续开发的本地骨架，不是已经接通 AI、任务平台或正式知识库的生产系统。

## 快速运行

要求 Node.js 20+。在本目录先运行 `npm install`，然后：

```powershell
npm test
npm run demo
npm run workflow-demo
node src/cli.js paired --votes better,better,worse
node src/cli.js gate --candidate fixtures/skill-candidate.json
```

`npm run demo` 保留了 v0.1 的一次性建议快照。新流程请用 `npm run workflow-demo`：它在 `examples/mixed-run/` 为每次任务创建独立 `RUN_STATE.json`、逐阶段版本产物和 `AUDIT.jsonl`，停在 `canonical_proposal=waiting_user_approval`。示例不会替用户审批，也不会创建正式知识或正式 Skill。相同输入复用 RAW，但 workflow run_id 各不相同。

真实输入：

```powershell
node src/cli.js ingest --store my-store --input my-note.txt --annotations my-note.annotations.json
```

`annotations` 契约见 `schemas/annotations.schema.json`，样例见 `fixtures/mixed.annotations.json`。本版仍不调用 LLM：拆件、语义 Family、Theme、关系、Proposal 由外部标注输入；程序负责阶段前置、Schema、来源锚点和完整分流、引用关系、审批及依赖失效门禁。允许不同资产的锚点重叠，但 RAW 的每个非空白位置都必须被某个资产覆盖；未知内容应明确分到 `unorganized`，并触发人工 Gate A。JSON `parts` 下标从零开始；重复原文用 `occurrence` 消歧。运行结果的 `start/end` 是 UTF-16 偏移，不是字节偏移。

新流程的阶段数据、外壳和状态契约见 `schemas/workflow-artifacts.schema.json`、`schemas/artifact-envelope.schema.json` 和 `schemas/workflow-state.schema.json`。阶段 Schema 已由运行服务实际校验；旧版 `run.schema.json` 仍为 v0.1 快照契约。每阶段的输入、完成/失败条件和 Gate 见 [架构与阶段契约](架构与阶段契约.md)。

## 数据与安全边界

- `raw/<id>.txt` 和 `runs/<id>.json` 只新增、不覆盖；RAW 完整性由 SHA-256 校验。ID 使用哈希前 16 位作为短键，完整摘要存于 RAW 元数据，生产库应使用完整摘要与事务。
- `assets`、`atoms`、`claims`、`families`、`themes`、`relations` 都是 provisional/suggested。显式 `family` 是模型语义归并建议，不代表已验证“同一主张”。
- 新 workflow 的 Proposal 默认为 `pending_human_review`；`submit` 不能写 canonical/skill_publish。审批决定由单独审阅服务签署并绑定当前阶段产物；只有已批准的内容才追加正式知识版本。`recordDecision` 支持批准、拒绝、部分接受。
- `gate` 只给 Skill Candidate 的晋级建议；`paired` 只汇总已独立产生的投票，均不会创建、安装、回滚 Skill。没有测试运行器与独立 judge 时，不得声明 Darwin 式实测通过。
- RAW 的“永久”含义在这里是逻辑不可覆盖；它不是备份系统。生产化需补备份、校验巡检、并发事务、访问控制和保留策略。

研究依据见 `研究与映射.md`，阶段状态机见 `架构与阶段契约.md`。九个模块的调用规则位于 `skills/`；orchestrator 只负责状态/前置/Gate，具体阶段规则局部加载。无需把四个参考项目直接安装进用户的全局技能目录。

## 新工作流命令

```powershell
node src/workflow-cli.js start --store my-store --input my-note.txt --annotations my-note.annotations.json
node src/workflow-cli.js resume --store my-store --run wf_...
node src/workflow-cli.js submit --store my-store --run wf_... --stage router --output router-output.json
node src/workflow-cli.js retry --store my-store --run wf_... --stage router --output corrected-router.json
node src/workflow-cli.js fail --store my-store --run wf_... --stage router --error "model timeout"
node src/workflow-cli.js record-output --store my-store --run wf_... --case test_1 --variant with_skill --input actual-output.txt
```

`start` 创建 RAW、独立运行状态和旧版候选快照；不会自动把所有阶段标为完成。`submit` 接收当前阶段的候选 JSON，程序验 Schema/引用/覆盖后才写只新增的阶段 Artifact。坏 JSON 或缺内容会使该阶段 `failed`；外部模型运行器超时可用 `fail` 留痕；`retry` 只重跑失败/退回/stale 阶段。`resume` 返回当前缺失阶段或等待用户审阅的 Gate，模型切换/新会话可直接用同一 run_id 恢复。

CLI 的 `decision/apply/publish/rollback` 只允许真人 TTY 且由审阅服务提供 `KB_REVIEW_SECRET`；普通 `submit` 即使收到“approved=true”也不能写正式层。生产部署应把审阅密钥和正式存储放在 AI 工具权限之外。本地同一用户进程内的密钥/文件不是完整权限隔离，详情见架构文档。
