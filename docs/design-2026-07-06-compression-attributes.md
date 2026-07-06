# 设计文档：压缩重构 + 超凡属性 + 字段修正

日期：2026-07-06
状态：想法1/想法2 核心机制已实现，本次修订为「现状确认 + 剩余缺口」清单；想法3 结论变更（原描述的 bug 不存在）。

三个想法中，想法1、2 的主体架构已经落地并在生产路径生效（详见下方"现状核实"），
本文档不再是从零开始的实施计划，而是收敛为**剩余缺口清单**，作为继续实现的依据。

---

## 想法1：精简摘要 + 数值重要性 + 连锁 + 衰减

### 现状核实（已实现，生产路径生效）

- Schema：`digest`/`keyEvents` 已在 [narrative-prompt.ts](file:///D:/AI/ai-life-sim/src/mods/mod-engine/prompts/narrative-prompt.ts#L51-L55) 的 `NarrativeResponseSchema` 中定义，AI 输出格式说明已写入 SYSTEM_PROMPT（同文件第 223-245 行）。
- 账本实现：[digest-ledger.ts](file:///D:/AI/ai-life-sim/src/mods/mod-engine/helpers/digest-ledger.ts) 完整实现 `DigestEntry`（base/adjusted 分离）、连锁回溯 `reinforceChains()`、时间衰减 `effectiveImportance()`、剪枝合并 `selectForPrompt()`，常量集中在文件头部（`LOCK_THRESHOLD=90`、`CHAIN_TRIGGER=70`、`CHAIN_LOOKBACK_ROUNDS=20`、`CHAIN_FACTOR=0.8`、`DECAY_RATE_PER_AGE=0.15`、`FOLD_THRESHOLD=40`、`MAX_LEDGER_ENTRIES=500`）。
- 读写两端均已接入生产路径：[orchestrator-system.ts](file:///D:/AI/ai-life-sim/src/mods/mod-engine/subsystems/orchestrator-system.ts#L2262-L2266) 在 `handleNarrativeResponse` 中调用 `digestLedger.record()` 写入；同文件 [第 1237 行](file:///D:/AI/ai-life-sim/src/mods/mod-engine/subsystems/orchestrator-system.ts#L1237) 的 `buildMemorySummaryWithLedger()` 调用 `digestLedger.selectForPrompt()`，拼成"【往事回响】"区块追加到 prompt。
- 与旧压缩器的关系：当前是**追加**而非**替换**——`buildRichPrompt()`（[memory-lifecycle-system.ts](file:///D:/AI/ai-life-sim/src/mods/mod-engine/subsystems/memory-lifecycle-system.ts#L1074-L1117)）仍固定 `slice(-N)` 取最近 N 条摘要/原文，`digestLedger` 的输出是在这之外单独拼接的一段。

### 剩余缺口（本次需要补齐）

**缺口A：`digestLedger` 状态未持久化，读档后账本清零**

`DigestLedger` 已实现 `toSnapshot()`/`loadSnapshot()`（[digest-ledger.ts](file:///D:/AI/ai-life-sim/src/mods/mod-engine/helpers/digest-ledger.ts#L328-L335)），但 `OrchestratorSnapshot`（[orchestrator-system.ts#L261-L281](file:///D:/AI/ai-life-sim/src/mods/mod-engine/subsystems/orchestrator-system.ts#L261-L281)）没有对应字段，存读档流程从未调用这两个方法。

这与 `summaryCompressor`/`memoryLifecycle` 不同——那两者的数据落在 `state.compressedSummaries`（随存档字符串持久化，读档即恢复，不依赖 class 内部状态），而 `digestLedger` 是纯 class 内部增量状态（`entries` + `entityCache`），且其输入源（AI 每轮自评的 `digest`/`keyEvents`）**不会重新生成**，一旦读档不恢复账本，连锁回溯与衰减计算的历史基础就永久丢失。

处理方案：
1. `OrchestratorSnapshot` 增加 `digestLedgerSnapshot?: DigestLedgerSnapshot` 字段。
2. `restoreSnapshot()` 中调用 `digestLedger.loadSnapshot(snap.digestLedgerSnapshot)`。
3. 存档序列化时调用 `digestLedger.toSnapshot()` 写入快照。
4. `resetEngine`（[orchestrator-system.ts#L1340](file:///D:/AI/ai-life-sim/src/mods/mod-engine/subsystems/orchestrator-system.ts#L1340) 附近，与 `summaryCompressor.reset()`/`memoryLifecycle.reset()` 同级）追加 `digestLedger.reset()`。

**缺口B：差异化 token 预算未按 `adjustedImportance` 连续值计算**

当前压缩层级的 token 预算加权（`summary-compressor-system.ts` 的 `boostFactor = 0.75 + avgImportance * 1.0`，[第258-268行](file:///D:/AI/ai-life-sim/src/mods/mod-engine/subsystems/summary-compressor-system.ts#L258-L268)）用的是 `memoryLifecycle.rateImportance()`（关键词命中的 0-1 分数），**没有使用** `digestLedger` 里 AI 自评的 `adjustedImportance`。两套重要性评分并行、互不通气。

处理方案：L1 摘要 token 预算改为优先取该轮 `digestLedger` 对应 round 的 `events` 平均 `adjustedImportance/100` 作为 `avgImportance`，仅当该轮无账本条目时降级回 `rateImportance()` 关键词评分。这样"数值重要性驱动预算"才算真正贯通，而不是停留在账本自己的检索排序里。

**缺口C：`SummaryLevel` 类型滞后于实现（类型债务，顺手清）**

[narrative.types.ts#L177](file:///D:/AI/ai-life-sim/src/foundation/types/narrative.types.ts#L177) 的 `SummaryLevel` 仍是 `1|2|3|4`，但 L5/L6 已在 `summary-compressor-system.ts` 中用 `as unknown as CompressedSummaryItem` 强转构造。改为 `1|2|3|4|5|6` 并清掉所有强转点。

### 不纳入本次范围

`buildRichPrompt()` 固定 `slice(-N)` 的取数逻辑本身不改——用户原始诉求是"层级压缩排除不重要的"，这一层现在由 `digestLedger` 的追加区块承担（新事件的精确重要性排序），旧压缩器仍保留"框架兜底"职责（详见 digest-ledger.ts 头部注释的职责边界说明），两者分工明确，不需要合并成一套逻辑。

---

## 想法2：超凡领域

### 现状核实（已实现）

- 属性分类、硬上限、超凡阈值常量均已定义在 [mod-character/constants.ts#L14-L58](file:///D:/AI/ai-life-sim/src/mods/mod-character/constants.ts#L14-L58)：`TRANSCENDENT_ATTR_KEYS`、`MORTAL_LOCKED_ATTR_KEYS`、`ATTR_HARD_CAP=100000`、`ATTR_DELTA_CLAMP=[-8,8]`、`TRANSCENDENT_TIER_THRESHOLDS`（mortalCap 10 / sage 20 / divine 40 / divineKing 80）。
- `clampAttr()`（[character-base-system.ts#L210-L215](file:///D:/AI/ai-life-sim/src/mods/mod-character/subsystems/character-base-system.ts#L210-L215)）已按 `TRANSCENDENT_ATTR_KEYS` 分类钳制，可超凡属性放宽到 `±ATTR_HARD_CAP`，`resources` 仍锁 `[-10,10]`。
- 战力式文本映射已实现在 [mod-character/utils/attr-tiers.ts](file:///D:/AI/ai-life-sim/src/mods/mod-character/utils/attr-tiers.ts)：`getAttrSemantic()` 判断超凡与否，凡人走 11 档描述，超凡走 `transcendentPositive()`/`transcendentNegative()` 分层描述（超凡入圣/神性/神王/概念级，概念级按 `Math.floor(overflow/40)+1` 公式生成层数）。
- `BaseAttributes` 实际只有 5 项字段（physique/mind/talentAptitude/charisma/resources，[mod-character/types.ts#L11-L23](file:///D:/AI/ai-life-sim/src/mods/mod-character/types.ts#L11-L23)），`luck`/`morality` 是独立子系统类型（`LuckState`/`MoralityState`），本身就锁 `±10`，与本设计无冲突。
- 开局 30 点分配 + 命格加成逻辑已实现且未受影响：[attribute-alloc/page.tsx](file:///D:/AI/ai-life-sim/src/mods/mod-pages/pages/attribute-alloc/page.tsx)（`TOTAL_POINTS=30`，单项 `0~10`，`talentBonus` 汇总命格/天赋加成）。

### 剩余缺口（本次需要补齐）

**唯一缺口：物种基准线 `attrBaselines` 完全未实现**

`RaceLifespanConfig`（[mod-character/types.ts#L154-L163](file:///D:/AI/ai-life-sim/src/mods/mod-character/types.ts#L154-L163)）目前只有 `name`/`baseMaxAge`/`goldenAgeRatio`/`decayMultiplier` 四个字段，`RACE_LIFESPAN` 常量表（[mod-character/constants.ts#L373-L447](file:///D:/AI/ai-life-sim/src/mods/mod-character/constants.ts#L373-L447)，55 个种族条目）中也没有任何属性基准线数据。

处理方案（对齐原设计 `current = speciesBaseline + 玩家分配(0~10) + modifiers`）：
1. `RaceLifespanConfig` 增加可选字段 `attrBaselines?: Partial<Record<'physique'|'mind'|'talentAptitude'|'charisma', number>>`（不含 `resources`，凡人锁定属性不设基准线）。
2. `RACE_LIFESPAN` 表按需为特定种族（如 dragon/undead/angel 等强大种族）补充基准线数值，未设置的种族默认基准线为 0（等同现状，向后兼容）。
3. `character-base-system.ts` 的 `aggregateModifiers()`（[第146-203行](file:///D:/AI/ai-life-sim/src/mods/mod-character/subsystems/character-base-system.ts#L146-L203)）在聚合 modifiers 时叠加角色所属种族的 `attrBaselines`，作为一项独立的 modifier 来源（不改变现有 30 点分配 UI 和契约）。
4. 开局分配 UI（`attribute-alloc/page.tsx`）不需要改动——基准线在角色创建时通过种族信息自动带入 `modifiers`，玩家分配的 0~10 点数逻辑保持不变，验证了"字段精简红利"：下游系统只需读 `current` 数值即可判断角色处于凡人/超凡的哪个层级，不需要额外的物种特殊布尔字段。
5. 具体哪些种族该给多高的基准线、如何避免开局即大幅超凡破坏平衡，需要结合具体种族列表逐一决定数值，这部分留待实现时按 `RACE_LIFESPAN` 现有种族清单评估取值，本文档不预设具体数值。

---

## 想法3：字段映射 bug —— 结论变更：bug 不存在，无需修复

原文档描述："SUBSYSTEM_GUIDE 写的是 `comprehension`/`background`，代码实际读 `talentAptitude`/`resources`，字段名对不上"。

复核 [mvp-stages-config.default.json#L37](file:///D:/AI/ai-life-sim/src/mods/mod-engine/helpers/mvp-stages-config.default.json#L37) 实际内容，字段名已经是 `physiqueDelta`/`mindDelta`/`talentAptitudeDelta`/`charismaDelta`/`resourcesDelta`，与 `character-base-system.ts` 实际消费的字段名一致，未见 `comprehension`/`background` 字样。该文件内容也与想法2的超凡领域说明保持同步（"凡人区间 -10~+10...可突破+10进入超凡"）。

`foundation/utils/attr-tiers.ts` 中确实存在 `comprehension`/`origin` 命名的旧版函数（`getAttrTier`/`getAttrSemanticText`），但已确认在当前项目中**无任何调用点**（仅类型 `AttrKey`/`AttrTier` 被 `foundation/utils/index.ts` 重新导出，函数体从未被消费），是遗留死代码，与 SUBSYSTEM_GUIDE 拼装链路无关，不产生任何运行时影响。

结论：本条不需要任何代码修改。如需清理，可选项是删除 `foundation/utils/attr-tiers.ts` 中未被使用的死代码，但这不属于原始 bug 修复范畴，是否清理留待后续单独决定。

对全面中文化字段的放弃结论维持不变：SYSTEM_PROMPT 前缀走 KV 缓存、AI 输出 JSON key 改动风险高收益低，均不动。

---

## 实现顺序（更新）

1. 想法1 缺口A：`digestLedger` 存读档持久化接入（`OrchestratorSnapshot` 加字段 + `restoreSnapshot`/存档序列化/`resetEngine` 三处接入）—— 修复账本读档丢失的实质性问题，优先级最高。**已完成。**
2. 想法1 缺口B：L1 token 预算改用 `digestLedger.adjustedImportance` 驱动，降级回退 `rateImportance()`。**已完成。**
3. 想法1 缺口C：`SummaryLevel` 类型扩展为 `1|2|3|4|5|6`，清理强转点。**已完成。**
4. 想法2 剩余缺口：`RaceLifespanConfig.attrBaselines` 字段 + `RACE_LIFESPAN` 表按种族补充数值 + `aggregateModifiers()` 接入。**字段与接入已完成；具体种族数值待定，见下方待办。**
5. 想法3：无需实现，仅记录结论。**已确认。**

---

## 待办（2026-07-06 收尾，下次继续）

### 1. 物种基准线具体数值（想法2 收尾）

`RaceLifespanConfig.attrBaselines` 字段已加、`aggregateModifiers()` 已接入读取逻辑，但 `RACE_LIFESPAN` 表（[mod-character/constants.ts#L373-L447](file:///D:/AI/ai-life-sim/src/mods/mod-character/constants.ts#L373-L447)，55 个种族）目前**全部未填值**，等同现状不变。

需要做的：
- 逐一过一遍 55 个种族清单，判断哪些该给 `physique`/`mind`/`talentAptitude`/`charisma` 基准线（如 dragon/undead/angel 等强大种族）。
- 权衡开局平衡性：基准线 + 玩家 0~10 分配是否会让某些种族一开局就大幅超凡（>10），需要给出合理取值范围的参考尺度，不能拍脑袋给数值。
- 建议先挑 3~5 个代表性种族（人类基准 0 作对照组 + 1~2 个强壮种族 + 1~2 个孱弱/无形种族）试算，验证战力文本映射（`transcendentPositive`/`transcendentNegative`）在这些数值下的叙事表现是否合理，再铺开到全表。

### 2. 三个前沿方向的可用性评估（研究性，非代码任务）

用户要求评估自我博弈（Self-Play）、状态空间模型（Mamba选择性机制）、神经符号化AI（Neuro-symbolic AI）三个方向是否有可吸收的点。评估结论如下，供后续参考：

**自我博弈（Self-Play）—— 暂无直接落地点**
自我博弈的核心价值是"通过对抗性自我对局迭代生成训练数据、提升策略模型"，典型场景是围棋/多智能体博弈这类有明确输赢反馈的任务。本项目：
- 不训练模型，只调用外部 LLM API，没有自我博弈所需的"策略模型迭代训练"管线。
- 是单人文本叙事模拟器，没有对抗性博弈结构。
唯一勉强相关的方向是"NPC 互动"或"多分支叙事方案生成再择优"，但这属于游戏机制/prompt设计范畴，与自我博弈算法本身无关，不建议作为技术方向投入，除非未来做"多个 AI 候选叙事方案打分择优"这类功能时可以参考"生成-评估-择优"的思路，但那和自我博弈的训练迭代含义不同，不宜混淆。

**状态空间模型 / Mamba 选择性机制 —— 思想已落地，架构本身不适用**
详见本文档想法1的设计初衷：Mamba 的核心是"输入依赖的动态门控，决定信息以多大权重写入/保留隐状态"。项目无法引入 Mamba 架构本身（不训练神经网络、无梯度、无 GPU kernel 需求），但其思想已经通过 `digest-ledger.ts` 具体实现：AI 自评的 `adjustedImportance` 数值 + 连锁回溯 + 时间衰减，本质就是"用内容驱动的连续数值决定记忆的保留权重"，是选择性思想在符号系统里的等价物。后续若想更进一步贴近"选择性"，可考虑的方向（不承诺实现，仅记录思路）：
- 衰减速率本身也可以做成"输入依赖"——目前 `DECAY_RATE_PER_AGE` 是全局常量，理论上可以让不同类型事件（情感事件 vs 事实性事件）有不同衰减系数，但需要先有事件分类维度，目前账本没有这个维度，属于更大的扩展，暂不安排。

**神经符号化 AI（Neuro-symbolic AI）—— 与当前架构高度契合，是可优化的现实方向**
本项目目前的整体架构本身就是神经符号混合系统的一个实例："LLM（神经）生成叙事内容和自评分数" + "规则引擎（符号）做压缩触发、属性钳制、连锁回溯、存档结构"两者结合。`digest-ledger.ts` 的连锁回溯（基于实体字符串重叠的符号推理）叠加 AI 自评分数（神经网络输出）就是一个具体的神经符号混合样例。

可评估的优化点（供下次讨论，非本次实现范围）：
- `memory-forgetting-system.ts` 的 `analyzeSummary()` 判定链和 `memory-lifecycle-system.ts` 的 `rateImportance()`/`scoreImportance()` 仍是纯关键词表/正则匹配（符号规则），如果条件允许，可以评估用"符号规则做粗筛 + 已有的 digest-ledger AI 数值重要性做精筛"的组合逐步替代纯关键词判定，减少"关键词表覆盖不到就误判"的脆弱性。这本质上是把想法1里已经验证有效的"神经打分 + 符号规则"模式，推广到旧的 `memory-lifecycle-system.ts`/`memory-forgetting-system.ts` 里，属于渐进式改造，不需要引入新依赖或新架构。
- `extractEntities()`（[digest-ledger.ts#L99-L109](file:///D:/AI/ai-life-sim/src/mods/mod-engine/helpers/digest-ledger.ts#L99-L109)）目前是"2~6字中文块"的粗粒度符号提取，如果连锁回溯的命中率后续暴露出问题（错配/漏配），可以考虑让 AI 在 `keyEvents` 里顺带标注涉及的实体名（新增一个可选字段），把符号提取的一部分工作转交给神经网络做，减少字符串匹配的误差，但这需要评估 token 成本增加是否划算，暂不安排，留待观察实际效果后再决定。

以上三项评估均为方向性研究结论，不改变本文档"实现顺序"里已完成的四项工作，仅作为下次继续讨论/规划的起点。

