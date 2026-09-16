# 改善机会（仅分析，不改源码）

| 问题 | 原因 | 影响 | 建议方向 | 涉及文件 | 修改风险 |
|---|---|---|---|---|---|
| Agent 阶段未自动运行 | 项目只提供 Skill 规则与 CLI，缺执行器 | 必须外部手交 JSON | 明确宿主触发和调度接口；每阶段输入/输出契约机器化 | orchestrator SKILL、workflow-cli.js、workflow.js | 高 |
| 只靠自报 flags 触发 A/B/C | 语义风险程序不可推断 | 漏审风险 | 设计风险识别清单、人工抽审和强制结构化理由 | router/theme/reconciler Skill、workflow-artifacts Schema、workflow.js | 高 |
| 状态/写入非事务 | 文件逐个写入 | 崩溃/并发不一致 | 事务性存储或写入恢复检查/锁 | pipeline.js、workflow.js | 高 |
| 审阅密钥与模型权限可同域 | 仅 TTY/env/actor | 身份与正式写权限不可证明 | 独立审阅服务、身份认证、ACL、密钥隔离 | workflow-cli.js、workflow.js、部署文件（待确认） | 核心 |
| 跨 run Family/Theme 缺索引 | 当前只核一次 run 的 IDs | 无法建长期个人知识网络 | 增跨 run 引用和版本数据模型、迁移策略 | pipeline.js、workflow.js、run/workflow Schema | 核心 |
| 真实评测缺 runner | 任意字节可 record-output | keep 声明可能虚假 | 固定测试集/运行环境/输出证明/judge 来源 | evaluator Skill、workflow.js、eval Schema | 高 |
| Prompt 来源/加载过多 | 多个 specialist 链长研究文档，无加载器 | 阶段指令被稀释 | 精简入口、按阶段索引参考材料、明确版本优先级 | 九份 SKILL.md、架构契约、研究映射 | 中 |
| 历史与当前说明并存 | v0.1 文件仍保留 | Source of Truth 容易误判 | 给历史文件醒目标记并维护运行证据表 | README、研究与映射、MVP与验收 | 低 |
| Schema 部分闲置 | annotations/paired 未注册 | “Schema 已验证”范围不清 | 统一执行契约或明确只做参考 | pipeline.js、workflow.js、annotations/paired Schema | 中 |
| 上游回滚与正式版本关系模糊 | Canonical 只增，非正式链可 stale | 旧正式依据/新 run 关联待定义 | 版本修订 Proposal 和不可变历史索引 | workflow.js、workflow-state/workflow-artifacts Schema | 核心 |

