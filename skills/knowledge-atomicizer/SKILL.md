---
name: knowledge-atomicizer
description: Turn routed knowledge parts into source-anchored atomic statements and Claims in this knowledge system; exclude case, copy, idea, and task assets unless they also contain an explicit knowledge claim.
---

# Atomicizer

For each `knowledge` part, retain the RAW quote, stable source ID, exact span, statement, `source_status` and unresolved conditions. Do not paraphrase an explicit quote into a stronger fact. Distinguish explicit original wording, attributed report, editor inference, and visually unverified source. A proposed paraphrase belongs in a Proposal, not the evidence field. This specialist supplies `atomicizer` data first and `claims` data only after that stage completes; WorkflowService rejects a missing knowledge mapping, orphan Claim or quote that cannot be located.

Source-anchor discipline comes from Sansheng `creator-craft.md` P4/Claim index and Cangjie candidate provenance. Mixed-input knowledge-only atomicization is **本项目适配层**. See [研究与映射](../../研究与映射.md).
