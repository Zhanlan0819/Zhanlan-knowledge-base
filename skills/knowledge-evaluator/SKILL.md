---
name: knowledge-evaluator
description: Evaluate a draft Skill on real tasks against a no-Skill baseline, compare before/after with independent paired judges, and recommend keep/revert for human review.
---

# Evaluator

Pre-register happy-path, ambiguous, boundary and neighbouring negative prompts with expected observable outputs. Run the draft and no-Skill baseline on the same tasks; record both output IDs and the assertions for every test. For version comparison, give each independent judge both versions in one paired comparison, blind the order where possible, and use an odd number of identified votes; absolute rubric totals are triage only. Submit test records, paired judgements and keep/revert recommendation to WorkflowService. Missing outputs/duplicate judge IDs fail, worse majority invalidates the draft, and keep waits at Gate F. A vote record alone cannot prove task quality; never directly publish or overwrite a Skill.

This uses Darwin `SKILL.md` Phases 0.5–2 and Cangjie pressure-test requirements. The interface to this knowledge system is **本项目适配层**. See [研究与映射](../../研究与映射.md).
