# 内部阶段：实际任务评测

目标：用真实任务比较 Skill 草稿与无 Skill baseline，形成 keep/revert 建议；不得把自测冒充独立评测。

## 评测规则

- 必须有真实测试任务 ID。
- 每个任务都要登记 with_skill 与 without_skill 的实际输出。
- 需要版本比较时，登记 before / after 输出。
- paired judge 至少 3 个且为奇数；judge_id 不重复。
- 每个 judge 只能给 better / worse / tie，并写具体理由。
- `keep` 只有在真实任务断言全部通过，且 paired 聚合没有支持 revert 时才成立。
- 缺 baseline、缺真实输出、judge 不独立或只做同对话自评时，不能宣称正式评测通过。
- `revert` 只是建议退回草稿继续优化；正式发布仍需人工 Gate。

## 用户审核原则

用户看结论、失败任务、关键差异和 keep/revert 建议；完整测试输出和投票记录保留为技术详情。
