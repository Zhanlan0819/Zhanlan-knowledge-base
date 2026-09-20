# CHANGELOG

## v0.7.0 Classification Architecture

基于真实知识库整理结果与 DeepSeek + Darwin 对照复盘，重点修复“流程很严谨，但分类不够清楚”的中层知识架构问题：

- Router 从单一分类升级为四轴资产模型：type、source_identity、topic_tags、verification_status。
- 保留 9 条交付通道，但“知识是什么”和“内容从哪里来”不再互斥；外部课程知识可同时表示为 knowledge + external_course。
- Source Governance 读取 Router 的来源身份与验证状态，不再把所有 explicit 内容都压成 unspecified。
- Family 明确只表达语义同一性，不承担主题导航，不再为了压缩数量提前合并。
- Theme 改为知识图谱视图：每个 Family 恰好一个主 Theme，同时允许被其它 Theme 次级引用。
- 明确取消“Theme 越少越好”的隐性目标；Review Compression 不得作为合并不同问题域的理由。
- 增加 Theme 拆分判断：不同中心问题、不同独立交付单元、仅因大领域相同而聚合时优先拆分。
- Distiller 支持主 Family 与跨主题引用共同提供证据，但禁止复制另一个 Theme 的完整正文。
- 新增多轴分类、跨主题引用与主 Theme 唯一性的回归测试。
- AgentRuntime 升级为 v0.7 协议提示，并将以上规则下沉到模型请求。


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
