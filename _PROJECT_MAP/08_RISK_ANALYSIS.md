# 风险分析

等级：P0=可能破坏正式写入/审批完整性；P1=主流程或恢复失败；P2=质量/维护问题；P3=低影响说明。标注“事实/推断”，建议另见 `09_IMPROVEMENT_OPPORTUNITIES.md`。

| 等级 | 领域/问题 | 事实证据与影响 |
|---|---|---|
| P0 | 服务层权限不等于进程/磁盘隔离 | `src/workflow-cli.js` 检 TTY+环境密钥、`src/workflow.js` 检 actor 和 HMAC，但无独立身份服务/OS ACL；同权限进程能拿密钥/改文件。正式审批身份真实待确认。 |
| P1 | 没有自动 Agent/模型执行器 | `workflow-cli.js` 只读候选 JSON；九份 SKILL.md 从未被 Node 加载。`demo` 使用 fixture_adapter。外部 AI 若以为各阶段会自动启动，流程停在 router。 |
| P1 | ingest/start/提交为多文件非事务 | `pipeline.ingest` 在后续标注校验前写 RAW；`workflow.js:commitArtifact` 写 Artifact 后才 saveState/audit；崩溃/并发可留孤儿或不一致。推断：需要事务/修复工具。 |
| P1 | 旧签署 run 恢复依赖相同密钥 | `loadState` 对 decisions 全量 verifyDecision；无 reviewerSecret 返回 false。若只想读状态但没密钥，也会失败。 |
| P1 | 跨 run 知识网络未实现 | Family/Theme/关系只在一次 run 中；`pipeline.ingest` 的 familyKey 和 `workflow.js:validateLinks` 都局限当前数据。长期跨笔记归并/版本治理尚不能兑现。 |
| P1 | 用户确认虽有服务 Gate，但审阅交互不闭环 | CLI 需要真人 TTY、密钥；项目无 UI/独立服务。`README.md` 明说未生产化。Agent 与真人如何对接待确认。 |
| P2 | 语义正确性缺机器证明 | `validateLinks` 验数量、ID、锚点；不能判类别/同主张 Family/Theme/冲突真伪；风险 flag、major_change、version_judgement 由提交者自报，遗漏可能不触发 Gate A/B/C。 |
| P2 | 评测字节“存在”不等于真实/独立 | `recordEvaluationOutput` 保存任意字节；测试断言由提交者布尔值、judge_id 可自填。没有 runner/独立 judge 认证，`tests/workflow.test.js` 用 sample 输出也能走到发布。 |
| P2 | Prompt 入口/版本不清 | 宿主发现机制待确认；orchestrator 只自然语言要求局部加载。九个 description 有阶段相邻重叠；`研究与映射.md`/`MVP与验收.md` 是 v0.1 历史，误全量加载会和 v0.2 混淆。 |
| P2 | Token 稀释 | specialist 全部链接 15KB 的 `研究与映射.md`；若每阶段全读九份 Skill、契约、研究、样例，会埋没当前规则。这是结构推断，未测真实上下文。 |
| P2 | 设计 Schema 未实际使用 | `schemas/annotations.schema.json` 与 `paired-evaluation.schema.json` 未在 `workflow.js` 的 Ajv 注册列表，前者 ingest 手工校验子集，后者完全参考；不能声称全契约硬化。 |
| P2 | 已有 Canonical 后 rollback 限制 | `rollback` 禁止直接回滚 canonical/skill_publish，但可退回上游非正式阶段；`loadState` 会检查既有 canonical 对原 Proposal 的审批和依赖，改上游时旧正式版本如何与新运行共存需设计，当前流程待确认。 |
| P3 | 历史说明可能误导 | `MVP与验收.md` 和 `研究与映射.md` 末尾明确属于 v0.1 基线，不应视为运行事实。 |
| P3 | 样例并非模型实测 | `examples/mixed-run` 的 producer=fixture_adapter，Proposal waiting_review；它证明链路可走，不证明语义质量。 |

**潜在死/旁路逻辑**：`schemas/paired-evaluation.schema.json` 未被程序调用；annotations Schema 未整体验证；v0.1 `src/cli.js` 与 `runs/*.json` 仍可直接产生建议，容易与 v0.2 混淆。它们仍有说明/兼容/演示作用，不能直接判定可删除。
