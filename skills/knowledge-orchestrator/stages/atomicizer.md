# 内部阶段：知识拆解与主张提取

本文件同时服务 atomicizer 与 claims，两阶段仍需分别提交符合 Schema 的 JSON。

## Atomicizer

- 一份 knowledge 资产可以拆成多个 atom；禁止假设“一资产 = 一原子”。
- 每个 atom 只承载一个可以独立判断、归组和引用的最小主张。
- 原文中独立的判断、条件、步骤、边界、反例、原则可以拆开；不要为了增加数量机械切句。
- 每个 knowledge 资产至少映射一个 atom；不能遗漏资产。
- atom.anchor 必须位于所属 knowledge 资产真实锚点范围内，并与 RAW 精确一致。
- atom.statement 必须保持为对应原文证据，不得把解释或推断改写成事实。

## Claims

- 每个 atom 对应一条 Claim。
- Claim 必须保留 atom/raw/anchor 的来源链。
- `source_status` 要区分明确原话、归属他人观点、编辑推断、视觉未核验等来源性质；不得把低置信来源升级成确定事实。
- Claim 可以表达工作理解，但证据锚点必须保持原文不变。

## 用户审核原则

没有来源断裂、风险升级或明显拆错时，本阶段自动继续，不单独要求用户回复“继续”。
