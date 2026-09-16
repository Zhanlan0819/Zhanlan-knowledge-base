# 项目总览

**事实**：本项目是个人知识库的本地工作流骨架 v0.2。任何文本先保存为 RAW，再分流为八类资产；知识类进入 Claim→Family→Theme→关系→蒸馏→Proposal→经审阅 Canonical；少数已批准知识可进入 Skill 候选→草稿→评测→经审阅发布记录。它不是已接通模型、任务平台或正式知识库的生产系统（`README.md`；`src/workflow-cli.js`）。

技术：Node.js ES module、文件系统追加式 JSON/JSONL、Ajv 2020-12 Schema、九份 Agent Skill 指令；`package.json` 只依赖 Ajv。无服务器、数据库、内置 LLM、浏览器 UI、Agent 调度或真实评测运行器。项目内没有 `AGENTS.md`、system prompt、`prompts/`、hooks 或 templates 目录。四个外部参考仓库只在 `研究与映射.md` 中描述，当前程序未 import/调用它们；相对路径 `../reference-repos/` 是否存在于交接环境 **待确认**。

两个独立入口：`src/cli.js` 的 v0.1 `ingest/paired/gate` 一次性建议/咨询；`src/workflow-cli.js` 的 v0.2 `start/demo/resume/submit/retry/fail/record-output/decision/apply/publish/rollback/trace`。后者实例化 `WorkflowService`，但不自动执行 specialist Skill。外部 Agent 若按 `skills/knowledge-orchestrator/SKILL.md` 工作，应先 resume，按阶段加载对应 Skill，产出 JSON 后 submit；这是 Agent 指令而非本项目程序实现的加载器。

运行输出位于所传 `--store`：`raw/` 原文和元数据、`runs/` v0.1 建议、`workflows/<wf_id>/RUN_STATE.json`、`state-history/`、`AUDIT.jsonl`、`artifacts/<stage>/vN.json`、可选 `evaluation-outputs/`、经保护服务写的 `canonical/` 与 `formal-skills/`。正式 Skill 只是一条发布记录，安装/运行由外部宿主负责（`src/workflow.js:publishApprovedSkill`）。

一句话架构：**Agent 负责语义候选与审阅交互；WorkflowService 负责结构、顺序、持久状态与服务层 Gate；真实用户身份和模型质量仍需要外部系统证明。**
