# 主故事返回字段消费者审计（2026-11-14）

> 历史审计报告，不参与活动权威裁决。本文记录 V3A 之前的字段消费情况；`时间定位`、`事件结果`、`自然寿命变化` 已在 V3A 删除，当前契约见 `docs/prompt-v3-story-first.md` 与 `docs/authority/mechanisms/core-round/prompt-input.md`。
>
> 审计问题：`时间定位`、`事件结果`、`事件卡消费`、`天赋表现线索`、`自然寿命变化` 分别被哪些机制消费？能否从返回协议删除？表达类设置为什么不先组装成最终指令再传给模型？

## 1. 结论表

| 字段 | 主要消费者 | 本次 15 轮实际使用 | 能否去掉 | 建议 |
|---|---|---|---:|---|
| `时间定位` | 仅 Schema、批量项识别辅助、测试 | 15/15 有值，但无游戏状态消费 | **可以** | 建议删除；时间由程序已算好的 `displayTimeLabel` 提供 |
| `事件结果` | 历史账本、下一轮 Prompt、故事连续性 | 15/15，每轮 3 条 | **可以，但会降级** | 保留；它是唯一结构化事实账本 |
| `事件卡消费` | 控制平面事件卡池扣卡 | 8/15 有消费，7/15 为空 | 只在删除事件卡机制时 | 保留；卡名无法从正文可靠反推 |
| `天赋表现线索` | 天赋成长证据窗口 | 11/15 有 1 条，4/15 为空 | 只在删除天赋成长证据时 | 保留；引用、使用、结果、契机都有消费者 |
| `自然寿命变化` | `character-base` 最大寿命 | 15/15 全为 0 | 可以，但属于产品决策 | 保留或连同寿命机制一起删；不要只删 Prompt 字段 |

## 2. `时间定位`

### 谁在用

- `src/mods/mod-engine/helpers/narrative-ai-protocol.ts:72-102` 的 Schema 要求 `时间定位: z.string()`。
- `src/mods/mod-engine/helpers/main-narrative-call.ts:101` 的 `isStoryLikeItem` 用 `时间定位` 识别批量故事项；但它同时接受 `正文` 或 `事件结果`，所以不是唯一锚点。
- `src/mods/mod-engine/helpers/tagged-meta-envelope.ts` 的解析结果**没有** `时间定位`；`narrative-parser-system.ts` 的 `ParsedNarrative` 也没有该字段。
- 游戏内显示时间来自 `buildNarrativeTimeContext(...).timeLabel`，即 `narrative-acceptance-runtime.ts:91-94` 的 `displayTimeLabel`，与模型输出的 `时间定位` 无关。
- 测试和 Prompt 样例断言它存在；这是测试契约，不是运行时消费者。

### 能不能去掉

**能。** 它不是任何游戏状态的来源，模型写错也不会影响时间推进、存档或界面。删除后需要同步改：

- `NarrativeAIStoryResultSchema` 的 `时间定位` 字段；
- `isStoryLikeItem` 的标记（保留 `正文`/`事件结果` 即可）；
- `narrative-chinese-protocol-regression.mjs`、`kv-prompt-audit.mjs`、`semantic-authority-audit.mjs` 等断言；
- 权威文档里的字段列表。

### 为什么建议去掉

- 程序已经拥有唯一时间真源，模型再输出一份只是重复；
- 它不参与任何裁决，属于“写了也没人用”的字段；
- 少一个必填字段，就少一类 schema 失败和输出 token；
- 如果只是想检查模型是否理解时间，应把时间放在**输入**的 `时间节点/时间窗口`，而不是让它再抄一遍。

## 3. `事件结果`

### 谁在用

- 解析：`tagged-meta-envelope.ts:168-183` 的 `normalizeEventResults`；`narrative-parser-system.ts:24,68` 写入 `ParsedNarrative.eventResults`。
- 提交：`narrative-acceptance-runtime.ts:144` 存入 `AcceptedNarrativeResult`，`:214` 写入 `NarrativeChunk.eventResults`。
- 下一轮 Prompt：`timeline-memory.ts:90-97` 把 `事件结果` 四项展开为“已结束事件身份/已成立事实：成因、结果、影响”；没有结构化结果时才回退到完整正文。
- 故事连续性：`recent-story-context.ts:86-88` 把 `事件结果` 投影进最近故事；`narrative-story-continuity-context.ts:86` 再传给连续性 AI。
- 事件卡结果：事件卡是否成立以本轮事件结果为准；但扣卡靠 `事件卡消费`，不是靠事件结果。
- UI：不直接展示；应用只消费正文、分支、属性和结局。

### 能不能去掉

**技术上可以；删掉不会让运行时崩溃。** `ParsedNarrative.eventResults` 和 `NarrativeChunk.eventResults` 都是可选字段，`normalizeEventResults` 在没有该字段时返回 `undefined`，`timeline-memory.ts:90-97` 会自动回退到完整正文。所以准确说法不是“代码硬依赖”，而是“删掉会把结构化事实账本降级为正文回忆”。

**但当前架构不建议删，除非接受连续性降级或新增一次事实抽取调用。**

- 删掉后 `timeline-memory.ts` 会回退到完整正文。正文是给人读的叙事，不是给下一轮模型读的事实账本：它可能用代词、省略因果、把“意图”写成“结果”，也不区分“已成立的结果”和“仍有效的代价”；
- 下一轮模型看到的是“故事全文”，更容易把旧场景当成续写入口，而不是把事件当成已经结束的事实；
- 连续性 AI 失去 `事件结果` 后只剩正文，仍能工作，但摘要更容易漏掉成因和影响；
- 如果改由另一个 AI 从正文抽取事件结果，就违反当前“一次主故事调用内完成”的约束，增加成本与延迟。

**它也不是省 token 的字段。** 本次 15 轮平均正文 152.6 字，而四项 `事件结果` 投影平均 316.3 字；删掉它下一轮历史反而更短，但这是用“事实清晰度”换“字数”。真正占 Prompt 的是九段示例（12,397 字）和重复规则，不是这个字段。

### 为什么保留四项

`事件/成因/结果/影响` 四项各有消费者：`事件`是事实身份，`成因`是世界与行动者如何进入因果，`结果`是玩家位置/关系如何改变，`影响`是仍有效的获得、失去、代价与反作用。下一轮历史投影四项都用，不能只留一个摘要。

## 4. `事件卡消费`

### 谁在用

- 解析：`narrative-parser-system.ts:25,69-71`；`tagged-meta-envelope.ts:185-194` 去重并过滤空名。
- 提交：`campaigns/default/index.ts:890` 调用 `orchestrator.commitNarrativeControlPlaneOutcome(ctx._narrativeParsed?.事件卡消费)`。
- 扣卡：`orchestrator-system.ts:1946-1963` 把卡名映射回 `selection.eventCardPool` 的 `card.id`，写 `selectedEventIds` 给控制平面。
- 卡池：未消费的卡留在池中，已消费的卡按本地规则扣除/补充。

### 能不能去掉

**只有删除事件卡机制时才能去掉。** 如果保留卡池：

- 不能从正文可靠反推：卡可以被“改写”，卡名不一定出现在正文；同一张卡在不同世界也可以写成不同的事；
- 不能从 `事件结果` 反推：事件结果没有卡名元数据；
- 引擎需要知道“用了哪张卡”才能扣卡，否则卡池永远不消耗，重复出现。

本次 15 轮有 8 轮消费了卡、7 轮为空，说明它是可选的，但不是无用的。保留“没有时省略或空数组”的契约即可。

## 5. `天赋表现线索`

### 谁在用

- 解析：`narrative-parser-system.ts:28,76-78`；`tagged-meta-envelope.ts:221-241` 要求 `引用/实际使用/可观察结果` 非空，`突破契机` 可选。
- 映射：`campaigns/default/index.ts:258-270` 把 `命格-1`/`轮回-1` 映射到 `lineageId`，补 `sourceRound`，写入 `ctx._talentEvidence`。
- 成长证据：`campaigns/default/index.ts:875` 调用 `recordDestinyPatternGrowthEvidence`，写入 `destinyPatterns.growthEvidence`。
- 成长 Prompt：`campaigns/default/index.ts:287-290` 把证据并入天赋成长输入，后续成长 AI 使用。

### 能不能去掉

**只有删除天赋成长证据机制时才能去掉。** 如果保留成长：

- 需要知道玩家实际用了哪个命格、产生了什么可观察结果、是否有突破契机；
- 从正文关键词反推会误判（名称出现不等于使用，任务完成不等于突破）；
- 另起一次 AI 抽取会增加调用，不符合当前单次主故事约束。

本次 15 轮有 11 轮返回 1 条线索，4 轮为空，说明它是“按需字段”，不是每轮必填。保留可选契约即可。

## 6. `自然寿命变化`

### 谁在用

- 解析：`narrative-parser-system.ts:26,72-74`；`tagged-meta-envelope.ts:196-204` 只接受安全整数。
- 提交：`narrative-acceptance-runtime.ts:54-56` 转为 `character-base` 的 `maximumLifespanDeltaYears`；`character-status-update.ts:64-77` 调整 `maximumLifespanDays`。
- 下游：`character-status-runtime.ts` 用 `maximumLifespanDays` 缩放人生阶段、计算终局风险提示。
- 本次 15 轮全部填 0，没有实际改变寿命。

### 能不能去掉

**技术上能，但这不是“删一个 Prompt 字段”那么简单。** 两条路：

1. **保留**：它是唯一能表达“长期伤病缩短寿命/明确延寿”的字段；死亡由 `角色死亡` 单独表达，二者不能合并。成本很低，建议保留。
2. **删除**：需要同时删除 `maximumLifespanDeltaYears` 的提交路径、`character-status-update` 的寿命调整分支和相关测试，并明确“自然寿命不可变”的产品决定。只删 Prompt 字段会让代码永远收不到该状态，属于半删。

本次样本 0/15 只能说明“这一局没用到”，不能说明机制不存在。若后续多局仍为 0，再按产品决定整体移除。

## 7. 表达规则为什么不先组装成结果

### 现在的链路

1. 设置页定义 `first-person / second-person / character-name`（`SettingsTabNarrative.tsx:18-22`）。
2. `store` 保存枚举，`prompt-builder.ts:172` 把原始枚举放进 `本次信息.叙事称呼`。
3. 固定 Prompt `narrative-system-prompt.ts:68` 再做四分支映射：
   - `second-person` → “你/你的”
   - `first-person` → “我/我的”
   - `character-name` → 玩家姓名
   - 缺失 → 第二人称

这是**程序已经知道的选择，却让模型再解释一次**。问题：

- 同一事实有三处来源：设置页 label、store 枚举、Prompt 映射；新增选项要改三处；
- 模型可能误读 `character-name` 或走错 fallback；
- 每次调用都多一段映射说明，还和“示例默认第二人称”产生潜在冲突；
- 违反“同一事实一个所有者、一个公开契约”。

### 应该怎么做

在 `prompt-builder` 里把枚举解析成**最终自然语言指令**，Prompt 只消费结果：

```ts
function formatNarrativeAddressing(value: NarrativeAddressing | undefined): string {
  switch (value) {
    case 'first-person':
      return '第一人称（用“我/我的”）'
    case 'character-name':
      return '角色姓名（用主角姓名称呼）'
    case 'second-person':
    default:
      return '第二人称（用“你/你的”）'
  }
}
```

```ts
叙事称呼: formatNarrativeAddressing(context.narrativeAddressing),
```

Prompt 里只剩一句：

```text
按本次信息.叙事称呼写作；文风偏好只影响句式、节奏、意象和措辞，不覆盖事实、因果和协议。
```

这与 `篇幅偏好` 的现有做法一致：`buildWordCountInstruction(100)` 已经输出“正文约100字”，Prompt 不再解释数字枚举。`文风偏好` 是用户原文，保持原样；`难度指引` 是自然语言，保持原样。

现有测试 `narrative-chinese-protocol-regression.mjs:196` 和 `validate-narrative-wiring.mjs:71` 直接断言了原始枚举 `second-person`，改组装时需同步更新为解析后的自然语言值；`kv-prompt-audit.mjs:88` 只断言字段键名，键名仍保留 `叙事称呼`，无需改键。

### 但不要把所有东西都预组装

原则：

- **选择/枚举**（称呼、篇幅、风格预设）→ 程序解析成最终指令；
- **事实**（世界、历史、属性、事件卡名、控制平面）→ 原样传入，让模型裁决；
- **叙事**（正文、事件结果、分支）→ 模型生成。

反例是当前的 `buildNarrativeWindowProjection`：它把“宏观编年、3–5 阶段、不要流水账、开头不复用”这些**规则**预先拼进动态 `时间窗口`，造成和固定 Prompt 重复。动态数据应该只传事实：

```text
本轮跨度：365天；篇幅偏好：正文约100字。
```

而不是再写一遍叙事规则。规则归固定 Prompt，事实归动态数据，选择归程序——三者不要互相越界。

## 8. 建议的改动顺序

1. 先删 `时间定位`：Schema、parser marker、测试、权威文档一起改；这是纯减法。
2. 保留 `事件结果`、`事件卡消费`、`天赋表现线索`；它们都有真实消费者。
3. `自然寿命变化` 先保留；等 3–5 局样本都确认不用，再作为产品决定整体移除。
4. 在 `prompt-builder` 解析 `叙事称呼`，Prompt 删除枚举映射。
5. 删除动态 `时间窗口` 里的规则复述，只保留跨度和篇幅事实。
6. 按 `docs/prompt-v2-draft.md` 落地 V2 主体，再跑协议回归和真实生成 A/B。
