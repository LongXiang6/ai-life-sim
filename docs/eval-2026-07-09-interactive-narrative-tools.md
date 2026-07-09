# 评估文档：互动叙事工具对 AI 人生模拟器的可吸收点

日期：2026-07-09
状态：待评估。本文只提供后续 AI 评估输入，不代表已决定实施。

## 目标

评估 Ink、ChoiceScript、`D:\AI\xiaoshuojia` 中哪些叙事结构、作者工具和验证方法，可能用于提升 `ai-life-sim` 的叙事质量、分支可控性和可测试性。

## 非目标

1. 不把 `xiaoshuojia` 合并进 `ai-life-sim`。
2. 不引入 Ink 或 ChoiceScript 运行时依赖。
3. 不在本文中决定修改 `src/core/`、`src/foundation/` 或存档结构。
4. 不替代现有 `mod-engine` 的叙事根地位。

## 参考来源

| 来源 | 评估用途 |
|------|----------|
| Ink 官方页：https://www.inklestudios.com/ink/ | 文本优先、逻辑嵌入文本、Inky 边写边测、导出 JSON/网页、游戏引擎集成 |
| Ink 写作手册：https://github.com/inkle/ink/blob/master/Documentation/WritingWithInk.md | knot、stitch、divert、choice、tag、变量、列表、流控制 |
| Ink 运行文档：https://github.com/inkle/ink/blob/master/Documentation/RunningYourInk.md | `Continue()`、`currentChoices`、状态 JSON、变量观察、外部函数、tags |
| ChoiceScript 入门：https://www.choiceofgames.com/make-your-own-games/choicescript-intro/ | 普通文本、强制缩进、`*choice`、变量、scene_list、stats |
| ChoiceScript 自动测试：https://www.choiceofgames.com/make-your-own-games/testing-choicescript-games-automatically/ | Quicktest、Randomtest、死代码检测、命中次数报告、可复现随机路径 |
| `D:\AI\xiaoshuojia` 本地仓库 | 创意增强、大纲编辑、章节生成、阅读导出工作流。当前已更新到 `67799bc` |

## 项目背景约束

`ai-life-sim` 的架构文档已声明：叙事系统是根，`mod-engine` 包含叙事编排、时间推进、记忆压缩、预生成与 Prompt 构建。任何吸收外部项目的做法都必须服务于叙事质量，不能让 UI、外围 MOD 或外部 DSL 反向约束 `mod-engine`。

当前项目也处于模拟系统重写与 MVP 恢复阶段。后续 AI 评估时应优先判断：新增结构是否会改变运行核心、存档载荷、公开 API 或 `foundation` 类型。如果会，必须按 AGENTS.md 风险分级停下确认。

## 值得评估的方向

### 1. 叙事片段结构化

Ink 的核心价值不是语法本身，而是把叙事拆成可跳转、可组合、可标记的片段：

| Ink 概念 | 可评估映射 |
|----------|------------|
| knot | 人生阶段、剧情节点、一次关键事件段 |
| stitch | 节点内部的子片段，例如铺陈、推进、余韵 |
| divert | 下一叙事节点意图，不一定暴露为玩家选择 |
| choice | 玩家选择或系统可选分支 |
| tag | 情绪、地点、角色、事件类型、记忆重要性等元数据 |

可评估方案：不引入 Ink 语法，只在 AI 输出契约中要求 `sceneId`、`eventType`、`tags`、`nextIntent`、`stateDelta` 等轻量字段，让叙事文本仍由现有 Prompt 生成。

### 2. 分支与状态显式化

ChoiceScript 的价值在于作者友好的状态变量与场景列表。对 `ai-life-sim` 的启发：

1. 把关键状态变化显式记录为变量或事件，而不是只藏在自然语言叙事里。
2. 给叙事推进建立“当前 scene / 下一 scene / 结束条件”的可验证结构。
3. 对选择、分支和条件加入最低限度的静态检查。

后续 AI 应评估这是否能与现有 `NarrativeResult`、`changes`、`keyEvents`、`notableEvents`、digest ledger 兼容，而不是新增一套并行系统。

### 3. Quicktest / Randomtest 式验证

ChoiceScript 的自动测试方向很适合本项目：

| 验证方法 | 可评估用途 |
|----------|------------|
| Quicktest | 枚举 AI 输出结构中的分支、条件、必填字段，检查是否存在无出口或缺字段路径 |
| Randomtest | 随机推进多轮模拟，记录事件类型、死亡/尾声、分支命中、异常中断 |
| Hit count | 统计哪些叙事分支、事件类型、角色阶段很少出现或从不出现 |
| Dead code | 检测配置存在但运行期永远不会触发的事件、hint、分支、子系统 |

可先作为脚本或测试工具存在，不必改运行时。候选命令形态：

```bash
npm run check:narrative-branches
npm run check:narrative-random
```

是否新增命令需后续评估，不在本文决定。

### 4. 作者工作流

`xiaoshuojia` 更新后已有 `PRD.md`，其产品流程是：创意输入、创意增强、大纲生成、大纲编辑、章节生成、阅读编辑、导出。对 `ai-life-sim` 可评估的不是代码，而是工作流：

| `xiaoshuojia` 能力 | 可评估映射 |
|-------------------|------------|
| 创意增强五维度 | 角色创建、世界创建、命格/优势设定前的引导 |
| 大纲先生成再确认 | 人生阶段预览、关键人生节点预览 |
| 卷/章结构 | 人生阶段/生命周期结构 |
| 阅读器与导出 | 人生传记、回放、结局总结 |
| 章节重写 | 单轮叙事重写或分支重试 |

风险：`xiaoshuojia` 是独立小说生成器，后端仍是大单文件 Flask 架构，不能作为 `ai-life-sim` 的工程参考源。

## 不建议吸收的内容

1. 不直接接入 Ink 或 ChoiceScript 运行时。原因：会引入新依赖和新 DSL，且可能反向约束现有 `mod-engine`。
2. 不把 `xiaoshuojia` 的 Flask 后端、线程生成、API Key 处理、数据库结构移植到本项目。
3. 不用正则解析大段自然语言来补叙事状态。项目既有方向是 AI 结构化输出 + 符号钳制兜底。
4. 不把“可导出小说”作为 MVP 当前目标，除非用户明确把人生传记/回放列入产品目标。

## 候选落地层级

| 层级 | 内容 | 风险 | 说明 |
|------|------|------|------|
| L0 文档评估 | 明确字段、验证脚本、UI 工作流是否值得做 | 低 | 当前本文所在层级 |
| L1 Prompt 约束 | 在现有输出中增加 tags/nextIntent 等非破坏字段 | 中 | 需确认不会破坏 JSON Mode、parser、Zod |
| L2 验证脚本 | 建立分支可达性、随机路径、事件命中统计 | 中 | 可先只读存档/日志或 mock 数据 |
| L3 运行时结构 | 引入正式叙事图、scene 状态机、存档字段 | 高 | 涉及 `mod-engine`、存档、公开 API，必须确认 |
| L4 作者 UI | 增加阶段预览、大纲编辑、传记导出 | 中到高 | 需要 UI 规范与产品语义确认 |

## 后续 AI 评估问题

1. 当前 `NarrativeResult`、`NarrativeParsedResult`、`OrchestratorSnapshot`、save/restore 是否已有可承载 tags/nextIntent 的位置。
2. `narrative-prompt.ts` 的 `[NARRATIVE]` + `[META]` 输出契约能否加入轻量结构，而不影响现有 parser。
3. `keyEvents` / `notableEvents` 是否已经能承担 ChoiceScript 式 hit count 的事件基础。
4. 预生成队列是否能利用 `nextIntent` 提高分支命中率，还是会导致缓存失效和错误预测。
5. 是否能先用 mock narrative graph 做 Quicktest / Randomtest，不碰真实运行时。
6. 如果要做人生阶段预览，是否会改变“AI 人生模拟器”的产品语义，是否需要用户先拍板。

## 推荐评估顺序

1. 只读核对现有叙事链路：Prompt、parser、orchestrator、save/restore、pre-gen、summary。
2. 写一页字段草案：只列候选字段、语义、是否持久化、是否进入 AI 输出。
3. 先做验证脚本原型：输入 mock 分支数据，输出可达性、死路、hit count。
4. 再评估是否接入真实叙事结果。
5. 最后才评估 UI 工作流和人生传记导出。

## 验收标准建议

若后续决定推进，最小可接受成果应满足：

1. 不降低当前叙事正文质量。
2. 不让 UI 或外围 MOD 直接补算 `mod-engine` 职责。
3. 不新增隐藏 fallback 行为。
4. 新结构字段必须有 Zod 校验、缺字段降级策略和测试覆盖。
5. 验证脚本能发现至少三类问题：无出口分支、永不命中分支、必填状态缺失。

## 当前结论

最值得优先评估的是 ChoiceScript 的自动测试思想，其次是 Ink 的 tags / choice / divert 结构映射。`xiaoshuojia` 更适合作为另一个项目的产品工作流参考，不适合作为 `ai-life-sim` 的工程架构来源。
