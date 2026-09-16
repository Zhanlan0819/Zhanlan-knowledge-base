# Prompt / Instruction 地图

项目里没有仓库内 System Prompt、AGENTS.md、独立 prompts/templates/instructions/workflows 目录或脚本内嵌 LLM prompt。实际宿主 System/开发者/用户指令及 Skill 发现优先级属于宿主，**待确认**；仓库不能宣称自己覆盖更高层指令。九份 `SKILL.md` 的 YAML name/description 用于宿主可能的发现，正文是 Agent 行为规则。Node 程序只读取 JSON/TXT/Schema，**不读取任何 SKILL.md**。

期望层级：宿主上级指令→用户任务→`skills/knowledge-orchestrator/SKILL.md`（入口协调）→当前阶段一份 specialist Skill→按需 `架构与阶段契约.md` 或 `研究与映射.md`（说明/来源）→程序的 Schema/校验作为提交硬边界。这个层级是**建议/推断**，不是代码加载顺序。真实生效优先级由宿主决定；当前 CLI 没有 Prompt 层级。

| 指令文件 | 加载条件（设计） | 控制的关键行为 | 程序对应 |
|---|---|---|---|
| knowledge-orchestrator/SKILL.md | 知识系统总任务 | resume 先看状态、Gate 停下、只加载当前 specialist、候选 JSON submit、不可 AI 直写正式层 | workflow.js 的 Gate/actor；局部加载未实现 |
| knowledge-router/SKILL.md | router | 保留 RAW、按语义拆八类、完整覆盖、风险/不确定项标记 | router Schema+RAW 覆盖 |
| knowledge-atomicizer/SKILL.md | atomicizer/claims | 原句/锚点/source_status，不能把推断加强成事实；两阶段分开 | atom/Claim 一一映射 |
| knowledge-family-builder/SKILL.md | family_builder | “同一主张”而非同主题，模型只返 ID 组，保留独立来源 | Claim 覆盖；语义未验证 |
| knowledge-theme-builder/SKILL.md | theme_builder | 问题型 Theme、纳入/排除、跨标签但不把主题标签当结论 | Theme 覆盖；重大变化 Gate B |
| knowledge-reconciler/SKILL.md | reconciler | 七类边、保留双方、按时间/场景处理矛盾、不编造和解 | 端点/理由、Gate C |
| knowledge-distiller/SKILL.md | distiller/proposal | Theme→Family→Claim→RAW，反过度压缩，Proposal 而非 Canonical | 证据链接/覆盖、Gate D |
| knowledge-skill-builder/SKILL.md | skill_candidate/skill_builder | 三重验证、独立晋级、RIA、未晋级知识保留、草稿测试负例 | assessSkillCandidate/Gate E；draft 内容未验证 |
| knowledge-evaluator/SKILL.md | evaluator | 真实任务+无 Skill baseline、paired 独立奇数 judge、keep/revert 等人工审阅 | 登记输出/投票校验/Gate F；独立性未证明 |

`架构与阶段契约.md` 详细写状态/API/Gate，可作为 Agent 操作参考，但与源码冲突时以源码为准。`研究与映射.md` 是四仓库来源与 v0.1 历史映射，末尾 v0.1 “尚无 Ajv/审批”已被 v0.2 部分取代；`MVP与验收.md` 自报历史基线；`README.md` 是操作说明。`examples/混合内容运行演示.md` 和 fixtures 展示行为，非指令。`src/workflow-cli.js` 的错误消息和命令用法不是 LLM prompt。

重复/潜在冲突：orchestrator、router 和阶段契约都提醒“先 RAW/按序/Gate”；distiller、orchestrator、阶段契约都提醒不得直写 Canonical；Skill builder/evaluator 与架构文档都写晋级评测。但 `研究与映射.md`、`MVP与验收.md` 保留 v0.1 失效边界，若全量加载会误读现状。每份 specialist 又链接较长研究文档；按需读取即可。没有显式机器加载表保证“只载当前阶段”，宿主可能误触发多个 specialist；它们的 description 部分重叠。Prompt 的成功条件主要靠 Schema/链接硬化，语义正确性仍依赖模型/人审。

上下文建议：orchestrator 常驻；当前 specialist 和对应阶段 Schema/产物按阶段加载；架构契约的相关段按需；研究映射、MVP、README、样例、历史状态不要每轮全量加载。此为 token 分析建议，未改项目。
