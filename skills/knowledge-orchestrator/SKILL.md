---
name: knowledge-orchestrator
description: Coordinate this personal knowledge system from immutable RAW intake through multi-asset routing, evidence-backed knowledge organization, review Proposals, and optional Skill incubation.
---

# Orchestrator v0.3

Treat the persisted workflow runtime as the source of truth for **what may run next**. Do not rely on conversational memory to advance stages.

Preferred path: call `AgentRuntime` (or the equivalent host bridge) and let it perform `WorkflowService.resume(run_id) → resolve required_action → load only the current specialist Skill → build the minimum stage context → obtain one JSON result → submit/retry it through WorkflowService`.

`WorkflowService.resume(run_id)` now returns an explicit `required_action`:

- `execute`: run only `next_stage` with its registered specialist Skill.
- `retry`: rerun only `next_stage`; do not regenerate already valid upstream stages.
- `review`: STOP. Show the exact checkpoint/artifact to the human reviewer. Never infer approval from chat.
- `apply_approved_proposals`: STOP for the protected Review Service to append Canonical knowledge.
- `publish_approved_skill`: STOP for the protected Review Service to append formal Skill metadata.
- `done`: stop; the run is terminal.

The model/Agent Runtime must never receive the review private key. It may receive the review **public key** so existing signed decisions can be verified during resume. Human approval, rollback of reviewed stages, Canonical application, and formal Skill publication require Review Service signing capability.

If the runtime bridge is unavailable, fall back to the same discipline manually: call `resume`, inspect `required_action`, load **only** the selected specialist Skill, produce one stage JSON object, then call `submit` or `retry`. Do not copy every specialist rule into this entrypoint and do not chain multiple stages in a single model response.

Router is always first after RAW. Nonknowledge assets may terminate there. Knowledge may continue to Proposal/Canonical review; only approved, mature knowledge may enter Skill incubation. A failed stage remains failed until retry; an upstream revision makes downstream stages stale.

Read [阶段契约](../../架构与阶段契约.md) only when state/API handling is needed. Specialist detailed rules are loaded only when their registered stage is selected. Runtime hard rules (Schema, links, preconditions, Gate, signatures, Artifact fingerprints) override any softer workflow wording in reference documents.

Stage state/coverage and calibrated samples are informed by Cangjie and Sansheng. The unified mixed-asset pipeline, Stage Registry, Agent Runtime, and write-permission model are **本项目适配层**.
