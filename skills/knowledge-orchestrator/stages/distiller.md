# 内部阶段：知识蒸馏与正式提案

本文件同时服务 distiller 与 proposal。目标是把主题级知识压缩成用户可直接使用的结论，再形成待确认 Proposal；不得直接写 Canonical。

## Distiller

- 每个 Theme 至少形成一份蒸馏结果，并回溯 Theme → Family → Claim → RAW。
- 只使用属于当前 Theme 的支持 Claim。
- 蒸馏结果要保留条件、边界、适用场景和重要例外，不能为了简洁把张力抹平。
- 结论必须是自然中文、可直接阅读和复用的知识，不要只输出数量、内部 ID 或技术状态。
- 已经确认过的来源边界作为背景约束执行；没有变化时不要每阶段长篇重复。
- 如果同一 Theme 内仍有未裁决冲突，必须在结果里保留冲突，不得伪造统一结论。

## Proposal

- Proposal 只表示“建议写入正式知识”的候选，不等于 Canonical。
- 每个 Proposal 必须有支持 Claim；涉及冲突时必须同时保留 conflict_claim_ids。
- 目标只使用 `canonical_knowledge`。
- 用户最终只审核这些 Proposal：接受、拒绝或部分接受。
- 全量来源锚点属于技术详情，不应取代用户可读提案正文。
