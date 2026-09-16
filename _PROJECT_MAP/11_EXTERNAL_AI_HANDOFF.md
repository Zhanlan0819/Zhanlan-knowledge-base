# 给无法访问本机项目的 AI 的上岗说明

你接手的是 `knowledge-system` 本地骨架 v0.2，而不是已经上线的自动知识库。它将混合 TXT 保存为不可覆盖的 RAW，再拆八类资产；知识类依次转 Atom/Claim/Family/Theme、关系、蒸馏和待审 Proposal。真人签署接受后才新增 Canonical；已批准知识可以选择性晋级为 Skill 候选，生成草稿、登记任务/baseline/paired 输出，签署批准后只生成正式 Skill 的 JSON 发布记录。项目没有内置 LLM、自动 specialist 加载器、真实任务 runner、UI 或强身份隔离。证据：`src/workflow-cli.js`、`src/workflow.js`、`README.md`。

最核心的文件（真实相对路径）：
`src/workflow.js`、`src/workflow-cli.js`、`src/pipeline.js`、`src/cli.js`、
`schemas/workflow-artifacts.schema.json`、`schemas/workflow-state.schema.json`、
`schemas/artifact-envelope.schema.json`、`schemas/run.schema.json`、`schemas/skill-candidate.schema.json`、
`skills/knowledge-orchestrator/SKILL.md`、
`skills/knowledge-router/SKILL.md`、`skills/knowledge-atomicizer/SKILL.md`、
`skills/knowledge-family-builder/SKILL.md`、`skills/knowledge-theme-builder/SKILL.md`、
`skills/knowledge-reconciler/SKILL.md`、`skills/knowledge-distiller/SKILL.md`、
`skills/knowledge-skill-builder/SKILL.md`、`skills/knowledge-evaluator/SKILL.md`、
`tests/workflow.test.js`、`架构与阶段契约.md`。这些路径在 `02_FILE_MAP.md`/JSON 索引中有调用关系。

**两层机制必须分开看。** Agent 指令：orchestrator 让模型 resume 状态、仅载当前 specialist、生成候选、遇 Gate 停下。程序硬规则：`WorkflowService` 不读 Skill 文件，它用 `STAGES/DEPENDS`、Ajv、`validateLinks`、`gateNeeded`、HMAC 记录与 Artifact 指纹阻止越级/伪审批。实际宿主如何识别九份 Skill **待确认**，不要把这一步写成已实现加载。v0.1 `src/cli.js ingest/paired/gate` 是一次性建议/咨询旁路，不执行 v0.2 状态机。

14 阶段：intake→router→atomicizer→claims→family_builder→theme_builder→reconciler→distiller→proposal→canonical→skill_candidate→skill_builder→evaluator→skill_publish。A 路由风险、B 重大主题、C 冲突/版本、D 每条 Canonical Proposal、E Skill 晋级、F Skill 发布；`src/workflow.js:GATES,gateNeeded` 为实际触发源。无知识在 router 后完成；无 Skill 候选在 skill_candidate 后完成；评测 revert 退回草稿。状态在 `--store/workflows/<wf_id>/RUN_STATE.json`，每次保存还有 state-history 快照、AUDIT 和版本产物；新会话通过 `resume` 核 RAW/产物/依赖/签名。既有签署运行恢复需相同审阅密钥。

Prompt 组织：九份 `skills/*/SKILL.md`，一份 orchestrator 管总动作，八份 specialist 分管阶段；没有仓库内 system prompt 或独立 prompt template。`架构与阶段契约.md` 是 v0.2 操作说明，`研究与映射.md`、`MVP与验收.md` 保存 v0.1 历史，不是程序读取来源。`schemas/annotations.schema.json`、`paired-evaluation.schema.json` 当前未直接注册执行。长研究文档不宜每阶段自动全量加载，核心规则可能被稀释。

最大问题：缺 Agent 自动执行器和真实评测/独立审阅系统；语义质量与风险标记靠提交者；跨 run 知识网络尚不存在；多文件写入未事务化；Prompt 入口与历史版本可能混淆。风险等级/证据见 `08_RISK_ANALYSIS.md`。

修改时请先确认你改的是 Agent 指令、程序硬约束、Schema、CLI 还是历史说明。任何阶段顺序/Gate/正式写入修改必须拿 `src/workflow.js`、相关 Schema、CLI、测试的**完整源码**；只凭地图不能精确打补丁。不得直接改已有 RAW、Artifact、签署决定、Canonical 或正式发布记录；设计数据迁移与旧 run 恢复验证。用户最初要求只建地图，不修改业务源码；本文件也不是重构指令。

下一步向用户索取源码时，先问具体修改目标，查 `13_SOURCE_REQUEST_GUIDE.md`，只请求该目标列出的最小完整文件组。若涉及宿主触发、真人审批服务、模型 runner、跨 run 库，项目中没有对应实现，先请用户说明外部系统并提供其接口/配置；不能凭文档假设存在。若目标改变阶段边界，请先要求当前 `src/workflow.js` 全文和相关 Schema，不要从摘录推测函数之间的约束。
