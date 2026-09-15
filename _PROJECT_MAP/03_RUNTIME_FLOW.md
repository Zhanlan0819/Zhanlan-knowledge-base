# 真实运行流程

## 设计上的 Agent 主流程

用户任务触发 `knowledge-orchestrator`（由宿主 Skill 发现机制决定，仓库内没有触发注册代码；实际宿主加载情况 **待确认**）→有 run_id 则 `resume`，没有则 `start`→仅加载当前 specialist `SKILL.md`→外部模型/工具生成阶段数据→`submit`→Schema、引用、覆盖、前置校验→保存版本产物及状态→Gate 时停下等待受保护审阅服务→批准后 resume 下一阶段。依据 `skills/knowledge-orchestrator/SKILL.md` 与 `架构与阶段契约.md`。这里的 specialist 加载和模型生成是**提示词级编排**，仓库没有执行器。

## 当前程序实际流程

`workflow-cli start` 读取 TXT 和 annotations JSON，调用 `WorkflowService.start`；`start` 先调用 `pipeline.ingest` 保存/复用 RAW 与 v0.1 建议快照，再创建新的 wf UUID、提交 intake Artifact、保存 RUN_STATE/审计，返回 router。之后**必须由外部操作者逐阶段提供 JSON**；CLI `submit` 不读取任何 SKILL.md、也不调用模型。`demo` 是例外：`workflow-cli.js` 用 v0.1 建议快照经 `fixture_adapter` 直接填 router→proposal，最后停 Gate D。样例 `examples/mixed-run/.../RUN_STATE.json` 证实 proposal=waiting_review，canonical/Skill 均未开始。

`submit`：`loadState` 核 RAW、每个有效阶段 Artifact SHA/身份/依赖、签署决定、Checkpoint；`preconditions` 检查 `STAGES/DEPENDS` 和前置 Gate；JSON parse、Ajv 阶段 Schema、`validateLinks`；失败保存 failed/错误审计，成功保存 `artifacts/<stage>/vN.json`、状态历史和当前状态、审计。`gateNeeded` 决定是否 waiting_review；程序不验证语义判断是否正确（`src/workflow.js:submit,validateLinks,gateNeeded`）。

主知识流水线：intake→router→atomicizer→claims→family_builder→theme_builder→reconciler→distiller→proposal→**Gate D**→canonical→skill_candidate→**Gate E**→skill_builder→evaluator→**Gate F**→skill_publish。A 在 router 的风险/待整理处；B 在重大 Theme 改动处；C 在冲突/撤回/版本判断处。`DEPENDS` 是严格线性前一阶段，不是多 Agent 并行依赖图（`src/workflow.js:STAGES,DEPENDS,GATES`）。

子流程：无 knowledge 且 router 无 Gate 或 Gate A 已批准→后续均 not_applicable，completed_nonknowledge。canonical 后候选数组为空→Skill 后段 not_applicable，completed。Candidate 非空必须过结构晋级校验并 Gate E。evaluator 判 revert→skill_builder needs_revision、后段 stale；判 keep 且输出齐全→Gate F→受保护发布记录。没有 Proposal 的无知识审批路径：`workflow-artifacts.schema.json` 的 proposal 最少 1 条，当前知识链不支持跳过该阶段。

异常与恢复：坏 JSON/缺链接→failed；`fail` 主动记失败；`retry` 只允许 failed/needs_revision/stale 且生成 vN+1；人工 `rollback` 使指定非正式阶段 needs_revision、后续 stale；`resume` 重新核对磁盘状态并返回第一个可执行阶段或等待 Gate。过去批准绑定旧 Artifact ID，不得直接套在新版上（`src/workflow.js:invalidate,rollback,retry,resume,loadState`）。

审批：`decision/apply/publish/rollback` CLI 需 TTY 和环境密钥；服务要求 actor=user_review_service、HMAC 签名，不能以聊天“同意”代替。Gate D 按 Proposal ID 逐项批准/拒绝/部分接受；至少一个接受才 `applyApprovedProposals` 生成 Canonical。Gate F 批准后 `publishApprovedSkill` 生成 formal-skills JSON。当前没有独立审阅进程/身份认证；同进程拥有密钥或磁盘权限可绕过服务层（`src/workflow-cli.js`；`src/workflow.js:recordDecision,applyApprovedProposals,publishApprovedSkill`）。

## v0.1 旁路

`src/cli.js ingest` 直接 `pipeline.ingest`，从标注生成一次性 `runs/run_*.json`，其中 canonical/formal_skills 始终空；无阶段状态、Gate 或 Ajv 运行时验证。`paired` 只汇总投票，`gate` 只判结构晋级。它们不是 v0.2 审批入口。
