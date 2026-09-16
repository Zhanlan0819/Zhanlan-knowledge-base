# 依赖与调用地图

图中实线表示源码 import/读文件/调用；虚线文字表示 Agent 指令要求的动作，仓库内无自动 Skill loader。Schema 的 $ref 也是程序实际解析依赖。`DEPENDS` 将每个阶段绑到前一阶段 Artifact，而 `validateLinks` 还跨阶段读取 router/claims/Theme/Family。

```mermaid
flowchart LR
  pkg[package.json] --> wc[src/workflow-cli.js]
  pkg --> c[src/cli.js]
  wc --> w[src/workflow.js]
  w --> p[src/pipeline.js]
  c --> p
  w --> wa[schemas/workflow-artifacts.schema.json]
  w --> ws[schemas/workflow-state.schema.json]
  w --> ae[schemas/artifact-envelope.schema.json]
  wa --> run[schemas/run.schema.json]
  wa --> cand[schemas/skill-candidate.schema.json]
  p --> raw[store/raw]
  p --> old[store/runs]
  w --> state[store/workflows/RUN_STATE]
  w --> arts[store/workflows/artifacts]
  w --> audit[store/workflows/AUDIT]
  w --> formal[store/canonical 与 formal-skills]
```

```mermaid
flowchart TD
  Host[宿主高层指令/Skill 发现：待确认] -.-> O[knowledge-orchestrator/SKILL.md]
  O -.当前阶段才按需加载.-> R[router/atomicizer/family/theme/reconciler/distiller/skill-builder/evaluator SKILL.md]
  O -.操作参考.-> Contract[架构与阶段契约.md]
  R -.来源说明.-> Mapping[研究与映射.md]
  R -.候选 JSON submit.-> Service[WorkflowService]
  Service --> Schema[Schema + validateLinks + Gate]
```

```mermaid
flowchart LR
  Input[TXT bytes + annotations] --> RAW[raw_id + RAW/元数据]
  RAW --> Suggestion[runs/run_*.json 旧建议]
  RAW --> Intake[intake Artifact]
  Intake --> Router[router assets]
  Router --> Atom[atoms] --> Claim[claims] --> Family[families] --> Theme[themes]
  Theme --> Relation[relations] --> Distill[distillations] --> Proposal[proposals]
  Proposal --> Approval[签署逐项决定] --> Canon[canonical_versions]
  Canon --> Candidate[candidates] --> Draft[drafts] --> Output[evaluation-outputs]
  Output --> Eval[evaluations] --> PubApproval[签署发布决定] --> Publish[formal-skills 记录]
```

```mermaid
flowchart TD
  Start[start] --> Resume[resume/loadState]
  Resume --> Stop{等待 Gate?}
  Stop -- 是 --> User[审阅终端 decision]
  Stop -- 否 --> Next[最早可执行阶段]
  Next --> Submit[submit 候选数据]
  Submit --> Valid{Schema/引用/前置通过?}
  Valid -- 否 --> Fail[failed] --> Retry[retry vN+1] --> Submit
  Valid -- 是 --> Gate{A/B/C/D/E/F 触发?}
  Gate -- 是 --> Stop
  Gate -- 否 --> Resume
  User --> Resume
```

引用证据：`src/workflow.js` import、`STAGES/DEPENDS`、`validateLinks`、`gateNeeded`、`loadState`；`src/workflow-cli.js` action switch；`schemas/workflow-artifacts.schema.json` 的 $ref；`skills/knowledge-orchestrator/SKILL.md` 的局部加载指令。四份参考仓库只由 `研究与映射.md` 链接，当前程序无调用边。
