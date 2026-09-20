# 内部阶段：内容分流｜v0.7 多轴资产模型

目标：把 RAW 拆成可独立使用的资产，并把“它是什么、来自哪里、讨论什么、验证到哪一步”分开记录。只处理当前 router 阶段。

## 四个独立维度

每个资产都必须同时填写：

1. `type`：未来主要去向，只使用现有 9 类：knowledge / case / copy / idea / todo / memo / project / external / unorganized。
2. `source_identity`：来源身份，必须独立于 type：user_experience / user_view / project_practice / client_material / external_course / external_reference / ai_inference / mixed / unknown。
3. `topic_tags`：0 个或多个主题标签，只用于检索和关系提示，不决定最终 Theme。
4. `verification_status`：not_applicable / unverified / user_verified / project_verified / externally_verified / conflicted。

不要再用一个 type 同时回答“它是什么”和“它从哪里来”。

## 分流规则

- 必须覆盖 RAW 中全部非空白内容；不能静默漏掉段落。
- 不确定未来去向时进入 unorganized，不要猜。
- external / case / project 是资产载体或交付通道，不等于知识已经完成整理。
- 外部课程、客户材料、项目记录里如果有可复用判断、原则、步骤、方法或案例结构：保留原来源资产，同时对可复用的具体原文片段额外建立 knowledge 资产；允许锚点重叠。
- 不要把整份外部资料直接改成 knowledge，只抽取真正可复用片段。
- `topic_tags` 可以多选，不得为了标签整齐强行改变资产 type。
- Router 只记录当下可证明的验证状态。没有证据时用 unverified，不得把“原文明确写了”升级为 externally_verified。
- 敏感来源、高风险判断、无法确认的路由使用 risk_flags；不要自行消除风险。
- 用户已有 user_brief 时，分流必须服务本轮整理目标，但不得为了迎合目标而伪造知识资产。

## 用户审核原则

正常分流项无需逐条让用户确认。待办、备忘、文案、灵感、案例、项目和来源资料在 Router 后保留为独立交付通道，不能因为不进入知识链就丢失。只有待整理、风险、明显误分流或来源边界问题值得进入用户审核。
