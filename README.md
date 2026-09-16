# 阿星知识库智能整理系统

这是一个**单总控、决策优先**的个人知识整理与知识蒸馏工作流。

宿主只需要发现一个 Skill：

```text
知识整理总控
```

其它 Router、知识拆解、归组、主题、冲突、蒸馏、Skill 评测都只是总控内部阶段，不作为独立 Skill 暴露。

## 当前结构

```text
knowledge-system/
├─ README.md
├─ package.json
├─ 架构与阶段契约.md
├─ fixtures/
├─ schemas/
├─ scripts/
│  └─ generate-review-keypair.js
├─ skills/
│  └─ knowledge-orchestrator/
│     ├─ SKILL.md
│     ├─ stages.json
│     └─ stages/
│        ├─ router.md
│        ├─ atomicizer.md
│        ├─ family-builder.md
│        ├─ theme-builder.md
│        ├─ reconciler.md
│        ├─ distiller.md
│        ├─ skill-builder.md
│        └─ evaluator.md
├─ src/
└─ tests/
```

仓库只保留当前版本运行所需的源码、内部阶段规则、Schema、测试与说明；不包含历史迁移、覆盖安装、恢复或版本过渡文件。重新安装时直接删除旧版本后安装当前仓库即可。

## 核心理念

### 1. 完整处理，但只让人审核真正需要判断的内容

机器层完整保存：RAW、分类、原子、Claim、Family、Theme、Relation、Proposal、来源链、Artifact、审计记录。

用户层默认只看：

- 本轮目标；
- 信息如何收敛；
- 真正发生的合并、拆分、冲突和版本变化；
- 高层主题结构；
- 最终正式知识提案。

不要把完整技术产物直接当成人工审核界面。

### 2. 内部 7 个知识阶段，不等于 7 次人工确认

```text
内容分流
→ 知识拆解
→ 同类知识归组
→ 主题整理
→ 重复/补充/冲突检查
→ 知识蒸馏
→ 正式知识提案
```

默认自动执行到真正的决策点：

- 路由风险：Gate A
- 高层主题结构：软检查点
- 冲突/版本：Gate C
- 正式知识提案：Gate D
- Skill 晋级/发布：Gate E/F

没有需要用户判断的内容时，不因为“阶段做完了”而机械暂停。

### 3. 来源身份和未来用途分开

“外部资料 / 项目案例 / 项目方案”表示材料身份，不是知识加工终点。

如果其中有可复用的判断、方法、原则或案例结构：保留原来源资产，同时对对应原文片段建立额外 knowledge 资产。

### 4. 真正原子化

一份长知识可以拆成多个 atom；每个 atom 只承载一个可独立判断和归组的最小主张，并且必须回指真实原文锚点。

### 5. 全中文用户展示

内部 stage、ID、枚举继续使用稳定机器字段；正常用户输出使用自然中文。内部 ID、hash、artifact_id 只在 JSON、审计日志和调试信息中出现。

## 安装

要求 Node.js 20+。

```powershell
npm install
npm test
```

如果你是把本仓库作为 Skill 安装到 Codex / ChatGPT 工作目录，直接安装整个仓库即可，**不需要执行任何 install_*.bat**。

## 快速测试

```powershell
npm run demo
```

会使用 `fixtures/` 创建一条演示 workflow，并停在正式知识 Proposal 审核前。

## 真实运行

创建任务：

```powershell
node src/workflow-cli.js start --store my-store --input note.txt --annotations note.annotations.json --brief-file 本轮整理目标.txt
```

查看中文进度：

```powershell
node src/workflow-cli.js view --store my-store --run wf_...
```

准备当前模型阶段：

```powershell
node src/workflow-cli.js prepare-stage --store my-store --run wf_...
```

如果已配置外部模型命令：

```powershell
node src/workflow-cli.js run-until-stop --store my-store --run wf_...
```

`KB_MODEL_COMMAND`、`KB_MODEL_ARGS_JSON`、`KB_MODEL_ID` 用于外部模型适配。

## 审批安全

正式知识和正式 Skill 不允许由普通 Agent 直接写入。

推荐使用 Ed25519 审批密钥：

```powershell
node scripts/generate-review-keypair.js
```

Review Service 持私钥签名；普通 Agent Runtime 只持公钥验证。`继续` 只能通过软结构检查点，不能替代正式 Proposal 审批。

## 运行数据

传入的 `--store` 会产生：

```text
raw/
runs/
workflows/<wf_id>/
  RUN_STATE.json
  AUDIT.jsonl
  state-history/
  artifacts/
  evaluation-outputs/
  canonical/
  formal-skills/
```

RAW 与正式知识采用只增不覆盖思路；详细状态、Gate、恢复与权限边界见 [架构与阶段契约](架构与阶段契约.md)。

## GitHub 建议

仓库只保留当前有效源码和说明。不要提交：

- `node_modules/`
- 本地 `.env*`
- 实际用户知识库和 `--store` 数据
- 审阅私钥
- 临时备份文件
- 历史安装/迁移脚本

`.gitignore` 已覆盖常见临时文件。


## v0.6.2 Quality Governance

新增来源治理、Skill晋级质量检查、变化解释层和审核优先级规则。
