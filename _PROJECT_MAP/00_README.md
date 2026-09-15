# 项目地图

本目录供无法访问本机项目的 AI 接管。事实以 2026-09-15 对源码、Schema、Skill、测试和已保存样例的检查为准；`待确认` 表示项目材料不足以证明。

先读 `11_EXTERNAL_AI_HANDOFF.md`，再读 `03_RUNTIME_FLOW.md`、`04_STATE_MACHINE.md`、`05_PROMPT_MAP.md`；按修改目标查 `07_MODIFICATION_GUIDE.md` 与 `13_SOURCE_REQUEST_GUIDE.md`。`02_FILE_MAP.md` 和 `12_PROJECT_INDEX.json` 用于定位真实文件。地图只用于理解和索取源码，不是源码替代品。

项目根目录是 `D:\360MoveData\Users\l2320\Desktop\胖胖星\00-知识库\Zhanlan\knowledge-system`。项目内九个 `skills/*/SKILL.md` 是 Agent 指令；`src/workflow.js` 是阶段与审批服务；二者不会由本仓库代码自动相互加载。参见 `05_PROMPT_MAP.md`。

## 反向覆盖验证（只看本地图）

| 问题 | 地图给出的答案 |
|---|---|
| 1 启动 | 宿主触发 orchestrator 待确认；确定的 CLI 是 `workflow-cli start --store --input --annotations`，见 03/11。 |
| 2 第一阶段 | `start` 自动 intake，随后 router 是首个外部提交阶段，见 03/04。 |
| 3 谁进入第二阶段 | `WorkflowService.submit/resume` 根据 completed/DEPENDS/Gate 返回下一阶段；外部 Agent 再运行它，见 04。 |
| 4 用户确认 | RUN_STATE checkpoint、TTY+密钥的 decision、签署记录；项目没有 UI，见 04/08。 |
| 5 Prompt 加载 | 程序不加载；宿主/Agent 按 orchestrator 指令局部加载，实际宿主待确认，见 05。 |
| 6 Reference 使用 | 阶段 Skill 链接 `研究与映射.md`，orchestrator 链接阶段契约；按需阅读，代码不读，见 05。 |
| 7 Script 运行 | CLI 入口调用 pipeline/workflow；阶段模型/runner 不在仓库，见 03/06。 |
| 8 状态保存 | `--store/workflows/<wf_id>/RUN_STATE.json`，历史/AUDIT/Artifact，见 04。 |
| 9 阶段规则修改 | `src/workflow.js` + state/artifact Schema + workflow tests，见 07/13。 |
| 10 Prompt 修改 | orchestrator 或当前 specialist 完整 SKILL.md，并核宿主发现机制，见 05/13。 |
| 11 输出修改 | workflow-artifacts/envelope Schema + workflow.js；若 v0.1 则 pipeline.js/run Schema，见 07。 |
| 12 Source of Truth | 程序流程 workflow.js、入库 pipeline.js、实际编译 Schema；Agent 行为 SKILL.md，宿主加载待确认，见 02/05。 |
| 13 不按流程 | 缺执行器/宿主加载未证、语义 flags 自报、历史 Prompt 混读，见 08。 |
| 14 Token 浪费 | 九 Skill/长研究文档/样例若全量加载会稀释当前阶段，见 05/08。 |
| 15 最少源码 | 按目标从 `13_SOURCE_REQUEST_GUIDE.md` 取完整文件组；阶段/Gate 核心须 workflow.js 与 Schema。 |

以上十五题均能从地图定位答案；宿主实际触发、外部 runner/审阅服务身份仍明确为 `待确认`，没有伪造运行机制。
