# 阿星知识库智能整理系统 v0.6.3

这是一个单总控、决策优先、可追溯、多路交付的个人知识整理与知识蒸馏工作流。

v0.6.3 来自一次真实知识库端到端运行复盘，重点解决五类问题：非知识资产只分流不交付、审批命令过多、rollback 后状态机卡死、Skill 候选空数组逃过晋级审计、正式 Skill 只有发布记录没有可安装文件。

## 主流程

~~~text
RAW
→ Router：9 类资产分流
├─ knowledge → 原子 → Claim → Family → Theme → Relation → Distillation → Proposal → Canonical
├─ todo
├─ memo
├─ copy
├─ idea
├─ case
├─ project
├─ external
└─ unorganized

Canonical
→ 每条做 Skill 晋级审计
→ Candidate（如果有）
→ Skill Draft
→ 真实任务评测
→ 真人审批
→ 可安装 Skill

全部通道
→ Delivery Bundle
~~~

Router 支持 knowledge、case、copy、idea、todo、memo、project、external、unorganized 九类。外部资料、案例和项目是来源身份，不是知识加工终点；有可复用方法时可以保留原来源资产，同时抽取 knowledge。

## Runtime 分层

- src/workflow.js：基础 14 阶段、Schema 链接、Artifact、审计与持久化兼容核心。
- src/workflow-v063.js：v0.6.3 正式保护层，负责状态恢复、治理审计、真实 Skill 发布和多路交付。
- src/agent-runtime.js：模型调用与确定性后处理。
- src/review-server.js：本地审核网页。
- src/delivery.js：最终交付包生成。
- schemas/：机器契约。
- skills/knowledge-orchestrator/：唯一对外 Skill 与内部阶段规则。

正常使用请走 src/workflow-cli.js，它已默认使用 v0.6.3 Runtime。不要直接编辑 RUN_STATE.json、Artifact 或审批记录绕流程。

## 安装

要求 Node.js 20+。

~~~powershell
npm install
npm test
~~~

Stage Registry 同时兼容仓库结构 skills/knowledge-orchestrator/stages.json 和 Skill 根目录拍平后的 stages.json，不再依赖单一硬编码布局。

## 创建和运行任务

~~~powershell
node src/workflow-cli.js start --store my-store --input note.txt --annotations note.annotations.json --brief-file 本轮整理目标.txt
node src/workflow-cli.js view --store my-store --run wf_...
node src/workflow-cli.js run-until-stop --store my-store --run wf_...
~~~

外部模型适配仍使用 KB_MODEL_COMMAND、KB_MODEL_ARGS_JSON、KB_MODEL_ID。

## 审核：默认使用本地网页，不再复制一堆命令

先初始化一次 Ed25519 审阅密钥：

~~~powershell
node scripts/generate-review-keypair.js --out "$HOME/.workbuddy/kb-review-keys"
~~~

进入 Gate 后：

~~~powershell
node src/workflow-cli.js review --store my-store --run wf_...
~~~

CLI 会打印一个仅监听 127.0.0.1 的本地地址。浏览器里可以批准/退回普通 Gate；Gate D 可一次批量接受、拒绝、部分接受多条正式知识提案；审完可直接写入 Canonical；Skill 评测通过后也可直接批准正式发布。

私钥只由本地 Review Service 读取，不进入页面或 Agent 上下文。旧 decision/apply/publish/rollback 命令只作为技术排障接口保留。

非 Proposal Gate 的审批只签“当前 Artifact + approved/rejected”，禁止把 AI 拼出来的自由文本写进 accepted/rejected，因此不会再出现用户选 A、命令却把 B 签进审计的情况。

## rollback 状态修复

v0.6.2 的问题是：

~~~text
rollback
→ downstream = stale
→ apply 要求 canonical = not_started
→ 最终写入失败
~~~

v0.6.3 中，回退目标阶段变为 needs_revision，活动下游复位为 not_started，旧 Artifact 和 state-history 保留，但活动指针清空，因此重跑后可正常进入 Canonical。

正式知识已经写入后，不允许回滚上游去改写同一历史；应创建修订 Proposal/run。正式 Skill 发布后同理。

## 模型与程序的职责

模型负责语义判断：分流、source_status、归组、主题、关系、蒸馏、Skill 语义候选和评测判断。

程序负责 RAW 与锚点、Claim 的 atom_id/raw_id/anchor/statement/evidence_status、状态机、审批签名、Canonical 追加写入、治理 sidecar、Skill 发布文件和最终 Delivery。

原则：凡是能从上游确定的数据，不让模型重新手写一遍。

## 来源治理与目标覆盖

Claims 完成后自动生成 workflows/<wf_id>/governance/source-governance.json，区分来源类型、验证状态、可信等级、使用范围和禁止推断边界。anchor_verified 只表示“原文确实这样写”，不等于“说法已经证明为真”。

如果 start 时存在 user_brief，Distiller 后必须做目标覆盖审计。critical/high 目标如果完全 uncovered，Runtime 会阻止流程直接宣告成功。

## Skill 晋级审计

每一条 Canonical 都必须得到一个结论：

- promoted
- not_skill
- needs_more_evidence
- covered_by_existing_skill

并写明原因。只有全部 Canonical 都被逐条审计后，candidates: [] 才是合法结果。

## Formal Skill 的真实产物

评测通过并获得 Gate F 批准后，生成：

~~~text
formal-skills/<formal_skill_id>/
├── SKILL.md
├── metadata.json
└── test-prompts.json
~~~

不再只有一条 JSON 发布记录。

## 最终 Delivery Bundle

正常完成后自动生成：

~~~text
deliveries/<wf_id>/
├── manifest.json
├── README.md
├── knowledge/
├── skills/
├── 03_待办.json
├── 04_备忘.json
├── 05_文案.json
├── 06_灵感.json
├── 07_案例.json
├── 08_项目资产.json
├── 09_来源资料.json
├── 10_待整理.json
├── 11_Skill晋级审计.json
├── 12_目标覆盖审计.json
└── 13_来源治理.json
~~~

也可以随时手动重导出：

~~~powershell
node src/workflow-cli.js export --store my-store --run wf_...
~~~

## 测试

~~~powershell
npm test
npm run test:v063
~~~

v0.6.3 回归专门覆盖：rollback 后无需手改状态即可继续；非 Proposal Gate 不能签 AI 自由文本；空 Skill candidates 必须有逐条晋级审计；todo/memo/copy/idea 等进入最终交付；Formal Skill 必须真正生成 SKILL.md；AgentRuntime 使用 v0.6.3 正式入口。

GitHub Actions 会在 main push 和 PR 时自动执行测试。

## Source of Truth

发生冲突时按以下顺序判断：

1. src/workflow-v063.js
2. src/workflow.js
3. schemas/
4. src/agent-runtime.js
5. skills/knowledge-orchestrator/stages/
6. skills/knowledge-orchestrator/SKILL.md
7. README 和其它说明

文档不能声明 Runtime 尚未实现的能力。新增能力应先改代码、Schema 和测试，再更新 Skill 文档。
