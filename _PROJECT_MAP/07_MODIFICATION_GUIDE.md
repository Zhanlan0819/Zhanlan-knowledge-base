# 修改导航表

此表只定位，不授权凭地图直接改。优先让外部 AI 获取列出的完整源码，再制定精确方案。

| 我要修改 | 优先读取 | 可能还需要 | 不轻改 | 连锁影响 |
|---|---|---|---|---|
| Skill 总行为/触发 | `skills/knowledge-orchestrator/SKILL.md`、宿主实际 Skill 配置（待确认） | `架构与阶段契约.md`、对应 specialist | `src/workflow.js` 的 Gate | 宿主识别、加载时机、所有阶段 |
| 阶段顺序/分支/退出 | `src/workflow.js` 的 STAGES/DEPENDS/preconditions/submit/resume | `schemas/workflow-state.schema.json`、`schemas/workflow-artifacts.schema.json`、`tests/workflow.test.js` | 现有 run 的历史状态/Artifact | 旧运行兼容性、Gate、依赖指纹、恢复 |
| Gate/用户确认 | `src/workflow.js` 的 GATES/gateNeeded/recordDecision/loadState/applyApprovedProposals/publishApprovedSkill | `src/workflow-cli.js`、state Schema、审阅服务部署（待确认） | 审阅签名/Canonical 历史 | 硬门禁、安全、现有签署记录 |
| RAW/标注/锚点/路由 | `src/pipeline.js` 的 ingest/findAnchor、`src/workflow.js` 的 router validateLinks | `schemas/annotations.schema.json`、`schemas/run.schema.json`、router Skill、fixtures | RAW 不可覆盖规则 | 索引偏移、source trace、覆盖、幂等 |
| atom/Claim 规则 | `skills/knowledge-atomicizer/SKILL.md`、`src/workflow.js:validateLinks` | workflow-artifacts/run Schema | RAW/Claim ID | 来源链与 Proposal |
| Family 归并 | `skills/knowledge-family-builder/SKILL.md`、`src/workflow.js:validateLinks` | `src/pipeline.js`、run/workflow Schema、测试 | 已批准 Canonical | Theme/关系/蒸馏 stale |
| Theme/冲突/版本 | theme-builder/reconciler 两份 Skill、`src/workflow.js:validateLinks,gateNeeded` | workflow Schema、`研究与映射.md` | Canonical 历史 | Gate B/C、蒸馏和 Proposal |
| 蒸馏/Proposal/Canonical 文本 | distiller Skill、`src/workflow.js:validateLinks,recordDecision,applyApprovedProposals` | workflow-artifacts Schema、stage 测试 | 正式 Canonical 写入方法 | Gate D、来源链、部分接受 |
| Skill 晋级与输出格式 | skill-builder Skill、`src/pipeline.js:assessSkillCandidate`、`src/workflow.js:validateLinks` | skill-candidate/workflow-artifacts Schema | skill_publish | Gate E、RIA、草稿内容 |
| 评测/发布 | evaluator Skill、`src/workflow.js:recordEvaluationOutput,validateLinks,publishApprovedSkill` | `src/pipeline.js:evaluatePaired`、eval Schema、外部 runner（待确认） | 旧正式发布记录 | Gate F、退回链、质量声明 |
| 状态恢复/失败 | `src/workflow.js:saveState,loadState,invalidate,retry,resume` | state/envelope Schema、workflow tests、历史样例 | 原有 RUN_STATE/签名 | 新会话恢复、旧 run 可读性 |
| CLI/API 命令 | `src/workflow-cli.js` 或 `src/cli.js`、对应 service 函数 | `package.json`、README | 审阅命令安全条件 | 外部调用契约/错误提示 |
| 文档/展示 | `README.md`、`架构与阶段契约.md`、样例说明 | 实际代码/Schema | 不让历史文档覆盖 runtime | 使用者误读 |

