# 阿星知识库智能整理与知识蒸馏系统 · 决策优先单总控 v0.6

定位：所有输入先安全保留，再自动完成知识加工；对外只暴露「知识整理总控」一个 Skill。v0.6 重点不是增加阶段，而是重做 Human Review Architecture：**机器保存完整过程，人只审核真正需要决策的内容。**

## v0.6：Decision-First Review

内部仍保留 7 个可理解的知识阶段：内容分流 → 知识拆解 → 同类知识归组 → 主题整理 → 重复/补充/冲突检查 → 知识蒸馏 → 正式知识提案。

但 **7 个阶段不再等于 7 次人工确认**。新任务默认行为：

```text
内容分流
  ↓ 无风险自动
知识拆解
  ↓ 自动
同类知识归组
  ↓ 自动
主题整理
  ↓ 第一个高价值结构检查点
重复/补充/冲突检查
  ├─ 有冲突/版本取舍 → Gate C 人工判断
  └─ 无冲突 → 自动继续
知识蒸馏
  ↓ 自动
正式知识提案
  ↓ Gate D 逐条接受/拒绝/部分接受
Canonical
```

Router 风险继续由 Gate A 负责；重大主题变化由 Gate B；Skill 晋级/发布仍由 Gate E/F。没有任何需要用户判断的内容时，不得只因为“阶段做完了”要求回复“继续”。

### 审核界面改为异常优先 / 变化优先

用户默认只看：

- 本轮整理目标；
- 持续收敛漏斗，例如 `74 条内容 → 34 条知识候选 → 47 个原子 → 47 条主张 → 31 个知识组 → 5 个主题 → 6 条提案`；
- 相比上一阶段真正发生的合并、拆分、冲突、版本变化；
- 当前唯一需要用户判断的问题；
- 最终正式知识提案。

全量逐条表格、内部 ID、hash、Artifact、完整来源锚点保留在技术层，不再作为主要审核页面。`src/user-presentation.js` 提供中文决策包，`presentStageReport()` 将用户可见字段统一输出为中文。

### 来源身份 ≠ 未来用途

`外部资料 / 项目案例 / 项目方案` 不再默认成为知识链终点。若其中存在可复用判断、方法或案例结构：保留原来源资产，同时为具体原文片段额外建立 `knowledge` 资产。这样既保留“它是什么材料”，又能继续回答“它能提炼成什么”。

### 真正原子化

v0.6 取消了 `1 knowledge asset = 1 atom` 的硬限制。一个知识资产可以拆成多个独立原子；每个 atom 的原文锚点必须位于所属资产范围并与 RAW 精确一致。Claim 仍然一一绑定 atom。

### 本轮目标持续锚定

`WorkflowService.start()` 新增可选 `userBrief`；CLI 支持：

```powershell
node src/workflow-cli.js start --store my-store --input note.txt --annotations note.annotations.json --brief-file 本轮整理目标.txt
```

`user_brief` 会写入 `RUN_STATE` 并传入每个内部模型阶段，避免“第一轮记住用户目标，后面越跑越偏”。

### 从 v0.5 升级

覆盖文件后双击：

```text
install_v06_review_architecture.bat
```

它会：

1. 保证八个 specialist 仍是内部 `STAGE.md`，不是可见 Skill；
2. 给现有 Router / Atomicizer / Family / Theme / Reconciler / Distiller 内部规则追加 v0.6 决策优先补丁；
3. 先备份原 `STAGE.md` 为 `.pre-v06.bak`，补丁可重复运行。

检查：

```text
check_v06_review_architecture.bat
```

完整项目中仍建议最终运行 `npm test`。

## v0.4.2：单总控 + 全中文展示层

正确的宿主可见结构是：

```text
skills/
├── knowledge-orchestrator/
│   ├── SKILL.md          # 唯一对外总控
│   └── stages.json       # 机器可读调度表
├── knowledge-router/
│   └── STAGE.md          # 内部阶段，不应被宿主发现为 Skill
├── knowledge-atomicizer/
│   └── STAGE.md
└── ...
```

升级包覆盖后双击 `install_v04_single_orchestrator.bat`。它会先备份，再把八个 specialist 的 `SKILL.md` 原样重命名为 `STAGE.md`；不会改写其中内容。迁移后运行：

```powershell
node src/workflow-cli.js skill-visibility
```

应看到 `single_orchestrator_ready: true`，且 `visible_specialist_skill_files` 为空。`Axing Knowledge` 等其它独立业务 Skill 不受此迁移脚本影响。

Stage Registry 从 `skills/knowledge-orchestrator/stages.json` 决定当前阶段读取哪个 `STAGE.md`。`AgentRuntime` 请求协议为 `knowledge-stage-request/v0.6.0`，字段是 `stage_instruction`，不再把内部阶段称为独立 Skill。

v0.6 新 run 使用 `schema_version=0.6.0`；状态 Schema 兼容 0.2/0.3/0.4/0.5/0.6。v0.4 同时保留 v0.3 的 `required_action`、Ed25519 审批签名分离和 Artifact provenance。


### 中文展示规则

程序内部继续保留英文 stage、asset type 和稳定 ID，以保证历史 run、Schema 和引用不失效；**正常用户输出统一使用中文展示层**。

类型直接显示为：**知识内容、项目案例、文案素材、观点灵感、待办行动、项目方案、外部资料、待整理**。不要显示 `external=外部资料`、`case=项目案例` 这类机器码翻译。

阶段直接显示为：**内容分流、知识拆解、主张提取、同类知识归组、主题整理、重复、补充与冲突检查、知识蒸馏、生成待确认提案、正式知识入库、能力候选筛选、能力规则构建、实际任务评测、正式能力发布**。

`content-path-*`、`method-*`、`business-*`、`knowledge-*`、`organized-*`、`raw_*`、`wf_*`、`claim_*` 等内部 ID 默认不进入正常回答。展示时优先使用条目的中文标题、问题、摘要、主张或正文；没有标题时根据实际内容生成一个简短中文标题。只有用户明确要求“调试信息/显示 ID”时才展示内部标识。

人类可读映射集中在 `src/display-labels.js`，避免把中文翻译散落在多个文件。CLI 可用：

```powershell
node src/workflow-cli.js view --store my-store --run wf_...
```

查看中文状态摘要；原 `status/resume` 仍保留机器字段，方便兼容自动化。

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

`annotations` 契约见 `schemas/annotations.schema.json`，样例见 `fixtures/mixed.annotations.json`。`WorkflowService` 本身仍不调用 LLM；`AgentRuntime` 可以通过外部模型适配器执行当前阶段。程序负责阶段前置、Schema、来源锚点、引用关系、决策优先检查点、审批及依赖失效门禁。允许不同资产的锚点重叠，但 RAW 的每个非空白位置都必须被某个资产覆盖；未知内容应明确分到 `unorganized`，并触发人工 Gate A。JSON `parts` 下标从零开始；重复原文用 `occurrence` 消歧。运行结果的 `start/end` 是 UTF-16 偏移，不是字节偏移。

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
