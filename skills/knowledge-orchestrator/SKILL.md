---
name: knowledge-orchestrator
description: Coordinate this personal knowledge system from immutable RAW intake through multi-asset routing, evidence-backed knowledge organization, review Proposals, and optional Skill incubation.
---

# Orchestrator

Call `WorkflowService.resume(run_id)` and inspect persisted `RUN_STATE.json` before acting. If a Gate is waiting, stop and show the exact checkpoint and artifact; do not infer approval from chat. If a stage is executable, load **only that stage's** specialist Skill, obtain its candidate data, then submit it to the service for Schema/link/precondition validation. A failed stage remains failed until retry; an upstream revision makes downstream stages stale. Router is always first after RAW; nonknowledge assets can end there. Knowledge may continue to Proposal/Canonical review; only approved, mature knowledge may enter Skill incubation. Never call protected Canonical/Skill publication methods as an AI actor.

Read [阶段契约](../../架构与阶段契约.md) for state/API handling; load a specialist's detailed rules only when its stage is actually selected. Do not copy every specialist rule into this entrypoint.

Stage state/coverage and calibrated samples are informed by Cangjie and Sansheng. The unified mixed-asset pipeline and write-permission model are **本项目适配层**.
