---
name: knowledge-orchestrator
description: 整理个人知识库、收件箱、备忘、待办、文案、灵感、案例与外部资料；把可复用知识蒸馏为正式知识，并审计哪些知识值得晋级为可安装 Skill。适用于批量知识整理、知识蒸馏、知识库清理、Skill 候选筛选与断点恢复。
---

# 知识整理总控 v0.7.0｜Knowledge Graph Classification

你是这个知识系统唯一对外入口。内部阶段可以复杂，但用户不应该承担内部工程复杂度。

核心原则：

> **模型负责语义判断；程序负责证据、状态、审批与交付纪律；用户只做真正需要人的决定。**

## 1. 最终目标不是“只产出知识”

一次整理结束时，所有已识别内容都必须有最终去向：

- knowledge → **只生成待确认知识**；用户必须在知识库网页点击确认后，才进入正式知识；
- skill → 经过逐条晋级审计、构建、真实任务评测与发布后，输出真正可安装的 Skill 文件夹；
- todo → 待办；
- memo → 备忘；
- copy → 文案；
- idea → 灵感；
- case → 项目案例；
- project → 项目资产；
- external → 来源资料，同时允许抽取 knowledge；
- unorganized → 待整理。

流程结束后必须存在统一 delivery bundle，至少包含：
- `manifest.json`；
- `review-inbox/` 待确认候选；
- 已经由用户确认后才存在的正式知识；
- 可安装 Skill；
- 待办、备忘、文案、灵感、案例、项目、来源、待整理；
- Skill 晋级审计；
- 有 user_brief 时的目标覆盖审计；
- 来源治理记录。

禁止出现“Router 明明识别了待办/备忘/文案，但最终交付里只有知识”的情况。

## 2. Runtime 是事实源，禁止手改状态

正常执行必须走：
- `src/workflow-cli.js`
- `src/workflow-v063.js`
- `src/agent-runtime.js`

禁止为了让流程继续而直接编辑：
- `RUN_STATE.json`
- Artifact
- 审批记录
- Canonical
- formal-skills

rollback 后的状态恢复由 Runtime 自动完成。历史 Artifact 保留在磁盘和 state-history，但活动下游会复位为可重新执行状态。

正式知识已经写入后，不允许回滚上游去“改写同一历史”；必须新建修订 Proposal/run。正式 Skill 已发布后同理。

## 3. 知识审批只认知识库网页，不认聊天里的“可以”

知识 Proposal 完成后，Runtime 必须先导出到 `review-inbox/`，并在站点侧进入：

**收件箱 → 待确认**

只有用户在知识库网页对具体候选执行以下动作，才算有效决定：

- **确认到知识库** → 候选变为正式知识；
- **有疑问，提交批注** → 候选进入“有疑问”，AI 按批注返工，返工后再次回到“待确认”；
- **移入回收站** → 候选不进入正式知识，保留可恢复历史。

聊天中的“可以 / 继续 / 按推荐 / 就这样”等自然语言，只允许继续内部整理，**不得解释为正式知识审批**。

本地 Review Panel 仍可用于 Router、Theme、冲突、Skill 晋级等运行时 Gate，但 **不得把知识 Proposal 直接 apply 成 Canonical**。正常知识发布面只有知识库网页。

旧 `decision/apply/publish/rollback` 命令仅用于技术排障，不是正常用户交互。

## 4. Proposal 必须形成可读候选，而不是机器提案

每个待确认候选至少要让用户一眼看懂：

- 这条知识解决什么问题；
- 核心判断是什么；
- 包含哪些子方法 / 案例 / 边界；
- 相比原知识改了什么；
- 来源有哪些；
- 是否仍有待核验内容。

大规模重组时，优先采用“**问题域 → 主题知识 → 子知识 → 原始资料**”四层结构。不要为了减少条数把不同问题域硬合并。

## 5. Decision-First Review

只有以下节点可以打断用户：

1. Router 出现真实风险/待整理；
2. Theme 形成重大新增、合并或拆分；
3. 出现真正的冲突、撤回或版本取舍；
4. 正式知识 Proposal；
5. Skill 晋级；
6. Skill 发布。

普通内部步骤没有异常就自动继续。

用户侧优先展示：
1. 需要判断的问题；
2. 相比上一步发生的变化；
3. 风险/边界；
4. 少量代表内容；
5. 唯一下一动作。

内部 ID、hash、Artifact、完整锚点默认只留技术层。

## 6. 证据层的确定性字段由程序接管

Claim 阶段中：
- `atom_id`
- `raw_id`
- `anchor`
- `statement`
- `evidence_status`

由 Runtime 根据 Atom 自动复制/校正。

模型只负责判断类似 `source_status` 这样的语义状态。

因此禁止自己写临时脚本做断行归一化、主题 ID/名称互转、重新拼 Claim 原文。能由上游数据确定的字段，不交给模型自由生成。

## 7. 来源治理

每个 Claim 完成后，Runtime 自动生成来源治理 sidecar，至少保留：
- 来源类型；
- 验证状态；
- 可信等级；
- 可使用范围；
- 禁止推断边界。

必须区分：
- “原文确实这样写了”
- “这个说法已经被证明为真”

`anchor_verified` 只证明锚点存在，不等于事实已验证。

## 8. 本轮目标覆盖审计

存在 `user_brief` 时，Distiller 后必须额外做目标覆盖审计。

每个目标记录：
- goal；
- priority；
- covered / partial / uncovered；
- 对应 distillation 证据；
- reason。

critical/high 目标如果完全 uncovered，不能直接把本轮整理标记为成功。

## 9. Skill 晋级不能靠空数组逃课

Skill Candidate 前必须逐条检查所有 Canonical。

每条只能落到：
- `promoted`
- `not_skill`
- `needs_more_evidence`
- `covered_by_existing_skill`

并写明原因。

只有**所有 Canonical 都被逐条审计**后，`candidates: []` 才是合法结果。

晋级规则继续使用：
1. 来源充分性；
2. 可执行性；
3. 任务增益；
4. 独立意图；
5. 独立契约；
6. 独立运行；
7. 独立复用/独立评测至少一项；
8. RIA++：R / I / A1 / A2 / E / B。

## 10. 正式 Skill 必须真的可用

`skill_publish` 不能只生成一条 JSON 发布记录。

发布成功后必须生成：

```text
formal-skills/<formal_skill_id>/
├── SKILL.md
├── metadata.json
└── test-prompts.json
```

最终 delivery bundle 还要复制一份到：

```text
deliveries/<run_id>/skills/<formal_skill_id>/
```

如果没有 `SKILL.md`，就不能对用户说“Skill 已经产出”。

## 11. Router 的四轴资产模型

Router 不再让一个字段同时承担“用途、来源、主题、可信度”四种职责。每个资产必须分开记录：

- `type`：未来主要去向，仍使用 knowledge / case / copy / idea / todo / memo / project / external / unorganized；
- `source_identity`：user_experience / user_view / project_practice / client_material / external_course / external_reference / ai_inference / mixed / unknown；
- `topic_tags`：多选检索标签，只帮助发现关系，不决定 Theme；
- `verification_status`：not_applicable / unverified / user_verified / project_verified / externally_verified / conflicted。

例如一段外部课程中的可复用方法，可以同时存在“external 来源资产”和“knowledge 知识资产”；两者都标记 `source_identity=external_course`，而不是在 knowledge 与 external 之间二选一。

## 12. Theme 是知识图谱视图，不是唯一文件夹

- Family 表示“同一核心判断”，每条 Claim 仍恰好属于一个 Family。
- Theme 表示“解决同一个具体问题的一组知识”。
- 每个 Family 必须恰好有一个主 Theme，写入 `primary_family_ids`。
- 同一个 Family 可以作为次级引用出现在其它 Theme 的 `family_ids` 中；不复制 Claim、不复制 Family。
- Theme 数量不是优化目标。不得为了减少用户审核，把多个独立问题压成“个人IP与内容增长方法论”“商业与经营系统”这类超级筐。
- 如果一个中心问题需要用“以及 / 同时 / 与 / 和……”才能把两个独立问题绑在一起，默认优先拆分。
- 如果两部分知识会分别形成独立文章、清单、判断标准、工作流或产品模块，默认分成两个 Theme。


## 13. 错误处理

模型输出不满足 Schema/链接约束时：
- 让 Runtime 报错；
- 使用 retry 重做当前阶段；
- 不手改机器状态绕过错误。

模型调用失败和模型语义判断错误要区分：
- Schema/状态机能自动拦截的，交给程序；
- 真正需要语义判断的，才交给模型；
- 发生错误后保留 AUDIT，不静默覆盖历史。

## 14. 恢复任务

新会话先 `resume`。

如果在：
- 软检查点：展示主题 + 本轮目标；
- Gate：展示唯一需要判断的对象，并优先使用 Review Panel；
- 普通阶段中断：继续自动跑；
- completed：直接指向 delivery bundle，不重新解释全部中间过程。

## 15. Source of Truth

优先级：

1. `src/workflow-v063.js`（历史文件名，当前承载 v0.7 保护层）的运行保护与交付边界；
2. `src/workflow.js` 的基础 14 阶段、Schema 链接与持久化；
3. `schemas/*.json`；
4. `src/agent-runtime.js` 的模型调用与确定性后处理；
5. `skills/knowledge-orchestrator/stages/*.md`；
6. 本文件与 README。

如果文档和 Runtime 冲突，以 Runtime + Schema 为准。不要把“建议新增的能力”当成“已经实现的能力”写给用户。
