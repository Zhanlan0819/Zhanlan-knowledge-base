# CHANGELOG

## v0.6.3 Runtime Correction

基于真实端到端知识库整理运行复盘，修复工程层问题：

- 新增统一 Delivery Bundle，知识、Skill、待办、备忘、文案、灵感、案例、项目、来源与待整理均有最终去向。
- 新增 memo 资产类型。
- Skill Candidate 必须逐条覆盖全部 Canonical 的晋级审计，禁止用空 candidates 直接结束。
- Formal Skill 发布后真正生成 SKILL.md / metadata.json / test-prompts.json。
- 新增仅监听 127.0.0.1 的本地 Review Panel，Gate D 支持批量审批，正常用户不再复制多行 decision/apply 命令。
- 非 Proposal Gate 禁止签 AI 自由文本，避免选项与审计内容错位。
- 修复 rollback 后下游 stale 导致 Canonical apply 必败的问题；历史 Artifact 保留，活动下游复位 not_started。
- 正式 Canonical 写入后禁止破坏性回滚上游；正式 Skill 发布后同理。
- Claim 的证据字段由 Runtime 从 Atom 确定性复制，减少模型断行、归一化和引用错误。
- Source Governance 接入真实 Runtime，并与 source-governance Schema 对齐。
- 有 user_brief 时启用 Coverage Audit，高优先级目标未覆盖会阻断成功交付。
- Stage Registry 兼容仓库嵌套和拍平 Skill 安装布局。
- 修复旧 fixture / AgentRuntime 测试与当前架构不一致的问题。
- 新增 GitHub Actions 与 v0.6.3 回归测试。

## v0.6.2 Full Release

- 保留单总控 Skill 架构
- 增加来源治理（Source Governance）
- 增加 Skill 晋级质量检查
- 增加 Decision-First Review
- 恢复 examples、PROJECT_MAP、tests 等研发资产
- 移除历史迁移脚本和临时补丁文件
