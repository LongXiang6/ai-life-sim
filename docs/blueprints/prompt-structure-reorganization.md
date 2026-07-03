# 叙事 Prompt 结构重组蓝图

> 状态：待评审 ｜ 创建：2026-07-02 ｜ 关联文件：`src/mods/mod-engine/prompts/narrative-prompt.ts`
>
> 关联配置：`src/core/ai-service/prompt-flags.ts`（KV_MESSAGE_STRATEGY, KV_CONVERSATION_WINDOW）
> 消息构造：`src/core/ai-service/prompt-builder.ts` + `conversation-messages.ts`

---

## 一、问题诊断

### 1.1 当前 SYSTEM_PROMPT 的序列化顺序

`stringifyPrompt()` 按对象 key 插入顺序序列化（无缩进）。当前 `SYSTEM_PROMPT` 对象 key 顺序：

```
task → output.schema → output.format → rules → skillOperations → examples
```

以自然语言描述即 AI 实际读到的顺序：

```
[1] task       "根据用户消息中的世界设定、规则与当前状态，生成叙事 JSON..."
[2] schema     完整 Zod Schema（narrative/changes/notableEvents/foreshadowing/...）
[3] format     { type: pure_json, noMarkdownWrapping, fieldOrder }
[4] rules      { L0: [6条强约束], L1: [2条基调], L2: [3条软约束] }
[5] defense    { jsonError, noChanges, totalFailure }
[6] skillOperations  { grant: {newSkills[...]}, revoke: {removeSkillId} }
[7] examples   [ 示例0(婴儿) 示例1(现代) 示例2(技能移除) 示例3(战斗) 示例4(结局) 示例5(学艺) ]
```

### 1.2 注意力分配问题

LLM Transformer 注意力的 **首因效应** 与 **近因效应**：

```
注意力权重分布（示意）：
  ██░░░░░░░░░░░░░░░░██   ← 头部（高） + 尾部（高）
  ██░░░░░░░░░░░░░░░░██
     ░░░░░░░░░░░░░░░░      ← 中部（低，易 "lost in the middle"）
     ░░░░░░░░░░░░░░░░
```

| 位置 | 当前内容 | 权重利用 | 问题 |
|------|---------|---------|------|
| **头部** | task 一句话 | 高权重被浪费 | task 是 "做什么"，不是约束框架 |
| **中部** | schema + rules + skillOperations + examples | 低权重 | 核心架构信息易被注意力稀释 |
| **尾部** | examples 6 个 Few-Shot | 高权重 | 示例写得好应保留，但压住了 "任务指令" |

### 1.3 信息缺口：子系统字段说明缺失

| 子系统 | AI 当前可见信息 | 缺失的关系说明 |
|--------|---------------|--------------|
| character-base | ID 列表、体魄数值 | "体魄变化影响健康 HP、修为修炼速度" |
| health | ID 列表、HP/伤病 | "伤病降低体魄；HP=0 触发 lifespan 死亡" |
| lifespan | ID 列表、寿命上限 | "年龄推进触发衰减；突破可延长寿命" |
| cultivation | ID 列表、境界 | "突破消耗资源、影响战力评级" |
| combat-power | ID 列表 | "综合体魄/技能/修为计算" |

→ AI 看到 ID 列表不知道子系统之间的因果链，导致 changes 常漏掉联动变更。

### 1.4 消息分层与滑动窗口机制（当前实际运行架构）

当前 `KV_MESSAGE_STRATEGY = 'S2'`（双 user）。完整消息分层：

```
messages: [
  { role: "system",    content: <SYSTEM_PROMPT> },         ← 层 0: 不可变（~2500 tokens, 100% 缓存）
  { role: "user",      content: <STABLE + SLOW JSON> },   ← 层 1+2: 不可变+缓变（缓存命中）
  { role: "user",      content: <FAST JSON> },             ← 层 3: 速变（每轮重发, cache miss）
]
```

| 层 | 字段 | 更新频率 | Token 特性 |
|----|------|---------|-----------|
| **层 0: System** | task/schema/rules/examples/Guide | 代码级别修改 | 永久固定 |
| **层 1: User Stable** | 世界规则/世界设定/叙事风格/字数约束 | 世界创建后不变 | 永久缓存 |
| **层 2: User Slow** | 角色信息/命格天赋/记忆摘要/核心记忆 | 记忆缓慢增长 | 前缀稳定，增长部分 miss |
| **层 3: User Fast** | 当前时间/当前状态(`Part B`)/最近变化/叙事历史/指令 | **每轮变化** | cache miss（每次重算） |

**关键机制**：
- **层 1+2 合并为一条 User** → 共享同一前缀，DeepSeek KV Cache 落盘命中
- **层 3 为第二条 User** → 每轮追加最新速变数据，因前缀匹配到层 1+2 不动，新增部分单独计算
- **层 3 的 `叙事History`**：当前实现为 Fast JSON 内字段 `narrativeHistory.slice(-8)`，即 **最近 8 轮叙事全文**。这是 **数据层滑动窗口**——通过 JSON 数组拼入，每轮丢弃最旧一轮，追加最新一轮

#### S3 模式下的消息级滑动窗口（`KV_MESSAGE_STRATEGY = 'S3'`）

S3 将叙事历史从 JSON 字段提升为消息级对话对：

```
messages: [
  { system,              <SYSTEM_PROMPT> },
  { user,                <STABLE + SLOW JSON> },
  { assistant,           "已读取..." },          ← 固定 ack
  { user,                {continue, priorRound:1} },  ← 占位（进入滑动窗口）
  { assistant,           <第 N-6 轮 AI 叙事原文> },
  { user,                {continue, priorRound:2} },
  { assistant,           <第 N-5 轮 AI 叙事原文> },
  ...（共 KV_CONVERSATION_WINDOW=6 对）...
  { user,                <本轮 FAST JSON> },    ← 最新请求
]
```

**滑动窗口语义**：每轮对话时，最旧一对 user/assistant 被卸载，新追加最新一轮 → AI 看到最近 6 轮对话的连贯上下文，但 token 总量有界。

#### 两种模式对比

| 维度 | S2（当前默认） | S3 |
|------|-------------|-----|
| **叙事历史滑动卸载位置** | 层 3 JSON 数组 `slice(-8)`（数据层） | 消息对 sliding window（`KV_CONVERSATION_WINDOW=6`） |
| **层 3(`Part B`) 当前状态** | 作为 JSON 字段嵌入第二条 User | 仍为 FAST JSON 顶层，为最后一条 User |
| **缓存效率** | 层 1+2 命中，层 3 miss | 层 1+2+ack 命中，之后是前 6 轮对话的缓存 |
| **记忆连续性** | 仅看 8 轮原文 | 看最近 6 轮完整对话（含 AI 的 changes 输出） |

**结论**：无论 S2/S3，层 3(`Part B`: 当前状态摘要) 始终处于速变区，每轮全量替换。之所以不造成 token 爆炸：
1. 摘要格式紧凑（每子系统一行）
2. 不涉及历史累积（不同于叙事历史有 8 轮/6 轮的滑动窗口）
3. 中文标签（如"强壮"）极短（1-4 字）

---

## 二、目标结构

### 2.1 你提议的五层模型

```
┌─────────────────────────────────────────────────────┐
│ 第 1 层：架构约束（始终最高优先级）                      │
│   - rules.coreRequirements (L0/L1/L2)                │
│   - rules.defense                                    │
│   - output.schema                                    │
│   - output.format                                    │
├─────────────────────────────────────────────────────┤
│ 第 2 层：模拟系统字段说明（NEW）                        │
│   - subsystemGuide: 各子系统 ID + 字段含义 + 跨系统关系  │
│   - skillOperations: 技能系统 grant/revoke 示例        │
├─────────────────────────────────────────────────────┤
│ 第 3 层：事例（Few-Shot 示例）                         │
│   - 示例 0: 婴儿期                                   │
│   - 示例 1: 现代日常                                 │
│   - 示例 2: 跨系统联动（NEW 替换原示例3战斗）            │
│   - 示例 3: 技能变化                                 │
│   - 示例 4: 结局                                    │
│   - 示例 5: 分支抉择                                │
├─────────────────────────────────────────────────────┤
│ 第 4 层：世界创建后不变的内容                            │
│   （已在 User Prompt 的 STABLE JSON 中，无需重复）      │
├─────────────────────────────────────────────────────┤
│ 第 5 层：任务指令（近因效应）                           │
│   - task: 生成叙事 JSON                               │
│   - 字段读取优先级提示                                 │
└─────────────────────────────────────────────────────┘
```

### 2.2 重排后的 System Prompt 自然语言顺序

```
[1] rules.coreRequirements.L0  ← 头部：最高优先级强约束（首因效应）
[2] rules.coreRequirements.L1
[3] rules.coreRequirements.L2
[4] rules.defense
[5] output.schema               ← 架构：AI 建立输出框架心智
[6] output.format
[7] subsystemGuide (NEW)        ← 新增：字段含义 + 跨系统关系
[8] skillOperations             ← 技能系统接口示例
[9] examples[0..5]              ← 事例：告诉 AI 怎么写
[10] task                       ← 尾部：近因效应强化执行意图
```

### 2.3 注意力权重利用对比

```
当前：  [task低价值] ◀██  中部稀释  ██▶ [examples高价值]
                ↑ 浪费头部             ↑ 合理

目标：  [rules架构约束] ◀██  中部弱但已前置  ██▶ [task执行指令]
                ↑ 最大化首因效应               ↑ 最大化近因效应
```

---

## 三、子系统信息重组（两层分离：Schema + Aggregate Label）

### 3.1 设计原则

用户提议将模拟系统信息分为两部分：

| 部分 | 内容 | 位置 | 更新频率 |
|------|------|------|---------|
| **不可变 Schema** | 字段名[数据格式, 上下限] + 跨系统关系 | System Prompt | 世界创建后永远不变 |
| **变动当前值** | 聚合值 + 中文映射标签 | User FAST `"当前状态"` | 每轮变化 |

理由：
- Schema 放 System Prompt → 全量 KV Cache 命中，只存一份
- 当前值放 User FAST → 每轮必须更新（本来就是 cache miss）
- 聚合标签（非完整字段列表）→ 控制每轮 token 开销

### 3.2 Part A：不可变 Schema（放入 System Prompt 的 `subsystemGuide`）

**格式**：极简一行/系统，仅含字段名+范围，不含描述文本

```
character-base:
  physique(0~10) mind(0~10) talentAptitude(0~10) charisma(0~10) resources(0~10)
health:
  hp(±50) stamina(±30) spirit(±30) diseases[] injuries[]
lifespan:
  age(0~999) maxAge(0~999) breakthroughs[]
cultivation:
  realm(1~9) progress(0~100) techniques[]
skill:
  newSkills[](name,effects{}) removeSkillId
item:
  newItems[](name,count,effects{}) removeItemId
economy:
  money(±) income(±)
relationships:
  {name}:value(-100~100)
reputation:
  fame(0~100) dimension(military/political/...)
foreshadowing:
  type(8种) description priority(1~10)
fate-prophecy:
  prophecy deadline(year) triggerCondition
---
⚠️ 跨系统联动：
  character-base.physiques → health.hpMax, cultivation.speed
  health.hp=0 → lifespan.dead → post-death-epilogue 启动
  lifespan.age → attribute-decay 自动衰减
  cultivation.realm ↑ → combat-power.rating 重算
  cultivation.breakthrough → item.丹药 消耗, money 消耗
  skill.effects.attr → character-base 永久增减
  item.武器 → combat-power.rating
  item.丹药 → cultivation.progress / health.hp
  economy.money → item 购买力, education 付费
```

**说明**：
- 字段格式：`fieldName(min~max)` 或 `fieldName(type)`
- 数组字段：`fieldName[](item_schema)`
- 跨系统关系单独一节，简洁标注因果链

### 3.3 Part B：变动当前值（User FAST 层 3 的 `"当前状态"`）

**所属消息层**：User Prompt 的 FAST JSON（速变区），每轮全量替换，cache miss 但 token 受控。

**格式**：每子系统一行聚合摘要，值后附中文映射标签

```
【基础属性】体魄5 强壮 / 心智8 睿智深邃 / 悟性3 驽钝 / 魅力2 平凡 / 出身6 殷实
【健康】良好 HP100/100
【寿命】年龄18 青年 / 最大寿命100 / 未突破
【修为】炼气三层 进度45%
【技能】剑术(Lv3) 拳法(Lv1)
【物品】聚气草x3 养气丹x5 青锋剑x1
【经济】金钱500 殷实
【关系】老陈头+3 小翠+5
【声望】名望30 小有名气
【伏笔】天命之子(priority:8) 待回收
```

**说明**：
- 每系统一行（控制 token）
- 字段值后紧跟中文标签（如 `体魄5 强壮`）
- 中文标签由各子系统 `collectState()` 自行生成（参考已改动的 `character-base`）

### 3.4 Token 估算

| 部分 | 估算 tokens |
|------|------------|
| Part A: subsystemGuide (System Prompt, 永久缓存) | ~250-300 |
| Part B: 当前状态 (User FAST, 每轮) | ~300-500 (随子系统增多) |
| **Part A 增量 (相对当前 System Prompt)** | **~300 tokens** |

当前 `subsystem-field-registry.ts` 的 `formatSubsystemFieldsForPrompt` 输出为自由文本格式，约 16 个系统，每系统 ~80 字 → ~1300 tokens。新方案更精简。

### 3.5 当前已有接入情况

| 子系统 | collectState() 输出格式 | 是否已有中文映射 |
|--------|------------------------|----------------|
| character-base | `💪5(筋骨强健) / 🧠8(睿智深邃) / ...` | ✅ 刚接入 |
| health | `良好 HP 100/100`（自由文本） | ❌ 需统一 |
| lifespan | `年龄 18 / 最大寿命 100` | ❌ 需统一 |
| cultivation | `炼气三层`（已是标签值） | ✅ 无需额外映射 |
| skill | `剑术(Lv3) 拳法(Lv1)`（已是标签值） | ✅ |
| item | `聚气草x3 养气丹x5`（已是标签值） | ✅ |
| economy | `金钱500` | ❌ 需加中文映射 |
| relationships | `老陈头+3 小翠+5` | ❌ 可选 |
| 其他 20+ | 自由文本摘要 | ❌ 各系统自行决定 |

**实施优先级**：
1. 先完成 Part A（System Prompt schema）— 一次性改动
2. Part B 逐步推进 — 优先处理 character-base（已完成）、economy、relationships、health 四个最常写的系统

---

## 四、examples 调整建议

### 4.1 新增：跨系统联动示例

当前示例 3（战斗·分支抉择）changes 中 `skill` 带 `effects: [{ attr: physique, value: 3 }]` 已是好的跨系统示范。但仍缺少一个更通用的"日常推进中多系统联动"示例：

```json
{
  "description": "示例N：日常修炼·跨系统联动",
  "input": {
    "character": "宗门弟子，19岁，炼气三层",
    "worldSetting": "修仙宗门内门",
    "state": "健康良好，刚领取本月份例"
  },
  "output": {
    "narrative": "你坐在蒲团上吐纳了三个时辰，丹田中那缕真气又壮了一分。执事堂的师兄传讯说本月份例已到——三枚聚气草、五粒养气丹。你将丹药收进储物袋，盘算着够支撑半个月的苦修。\n\n夜深时，你忽然想起山下坊市新到了一批妖兽材料，其中或许有辅助冲脉的虎骨散。但一摸口袋，灵石已经见底。",
    "changes": [
      { "id": "cultivation", "description": "夜间修炼略有精进", "changes": { "exp": 12 } },
      { "id": "item", "description": "领取本月宗门份例", "changes": { "newItems": [{ "name": "聚气草", "count:": 3 }, { "name": "养气丹", "count": 5 }] } },
      { "id": "economy", "description": "本月份例已领，暂无灵石余额", "changes": { "money": 0 } }
    ],
    "notableEvents": ["领取本月宗门份例"],
    "importance": "LOW"
  }
}
```

### 4.2 保留示例清单

| 索引 | 名称 | 作用 | 调整 |
|------|------|------|------|
| 示例 0 | 婴儿期·感官认知 | 极简叙事 | 保留 |
| 示例 1 | 现代日常·学艺 | 温馨日常 | 保留 |
| 示例 2 | 技能移除·重伤恢复 | 负向变化 | 保留 |
| **示例 N** | 日常修炼·跨系统联动 | **新增**：展示多系统同时变更 | **替换原示例 3** |
| 示例 3 | 战斗·分支抉择 | 分支抉择机制 | 保留 |
| 示例 4 | 结局·自然老死 | 死亡判定 | 保留 |
| 示例 5 | 日常·学艺社交 | 技能+关系联动 | 保留 |

---

## 五、实施计划

### Step 1：新增 subsystemGuide 模块（Part A：不可变 Schema）

**文件**：`src/mods/mod-engine/prompts/narrative-prompt.ts`

在 `SYSTEM_PROMPT` 对象中，`skillOperations` 之后、`examples` 之前插入：

```ts
subsystemGuide: `character-base:
  physique(0~10) mind(0~10) talentAptitude(0~10) charisma(0~10) resources(0~10)
health:
  hp(±50) stamina(±30) spirit(±30) diseases[] injuries[]
lifespan:
  age(0~999) maxAge(0~999) breakthroughs[]
cultivation:
  realm(1~9) progress(0~100) techniques[]
skill:
  newSkills[](name,effects{}) removeSkillId
item:
  newItems[](name,count,effects{}) removeItemId
economy:
  money(±) income(±)
relationships:
  {name}:value(-100~100)
reputation:
  fame(0~100) dimension(military/political/...)
foreshadowing:
  type(8种) description priority(1~10)
fate-prophecy:
  prophecy deadline(year) triggerCondition
---
⚠️ 跨系统联动：
  character-base.physiques → health.hpMax, cultivation.speed
  health.hp=0 → lifespan.dead → post-death-epilogue 启动
  lifespan.age → attribute-decay 自动衰减
  cultivation.realm ↑ → combat-power.rating 重算
  cultivation.breakthrough → item.丹药 消耗, money 消耗
  skill.effects.attr → character-base 永久增减
  item.武器 → combat-power.rating
  item.丹药 → cultivation.progress / health.hp
  economy.money → item 购买力, education 付费`,
```

> 注意：用原生字符串而非对象，可保留换行和缩进，AI 更易读。

### Step 2：重排 SYSTEM_PROMPT key 顺序

当前顺序：
```
task → output.schema → output.format → rules → skillOperations → examples
```

目标顺序：
```
rules → output.schema → output.format → subsystemGuide → skillOperations → examples → task
```

> 注意：`stringifyPrompt` 按 key 插入顺序序列化，直接调换 key 位置即可。

### Step 3：调整 examples 数组

- 新增"日常修炼·跨系统联动"示例
- 调整索引使顺序合理（婴儿→日常→修炼联动→重伤→战斗→结局→分支→学艺）

### Step 4：统一各子系统 collectState() 的 summary 格式（Part B：变动当前值）

**目标**：所有子系统的 summary 输出统一为 `字段值 + 中文标签` 格式。

**已接入**（无需改动）：
- `character-base` — `体魄5 强壮 / 心智8 睿智深邃 / ...`（刚完成）
- `cultivation` — `炼气三层 进度45%`（已是标签值）
- `skill` — `剑术(Lv3)`（已是标签值）
- `item` — `聚气草x3`（已是标签值）

**需接入**（优先处理）：

| 子系统 | 当前格式 | 目标格式 | 改动位置 |
|--------|---------|---------|---------|
| health | `良好 HP 100/100` | `良好 HP100/100 无伤病` | `health-system.ts:collectState()` |
| lifespan | `年龄 18` | `年龄18 青年 / 最大寿命100` | `lifespan-system.ts:collectState()` |
| economy | `金钱500` | `金钱500 殷实` | `economy/subsystems/` |
| relationships | `老陈头+3` | `老陈头+3 友善` 或保持原样 | 可选 |

**改动方式**：在每个子系统的 `collectState()` 方法中，聚合字段值后追加简短中文标签。标签逻辑建议为：
- health: 用 HP 百分比映射（100%=良好 / 70%=轻伤 / 30%=重伤 / 0%=濒死）
- lifespan: 用年龄区间映射（0~12 少年 / 13~30 青年 / 31~50 壮年 / 51~70 老年 / 71+ 暮年）
- economy: 用金钱绝对值映射（0=赤贫 / 100=温饱 / 500=殷实 / 2000=富裕 / 10000=巨富）

**不在本次范围**的 20+ 子系统：保持现有摘要格式，因为 AI 很少写它们的 changes，且现有格式已足够表达状态。未来可按需逐步接入。

### Step 5：subsystem-field-registry.ts 与 System Prompt 的关系

当前 `subsystem-field-registry.ts` 的 `formatSubsystemFieldsForPrompt` 输出为自由文本格式注入到 User Prompt 的 STABLE JSON `"可变更子系统"` 字段。

**决策**：保留 `subsystem-field-registry.ts` 作为 Zod 校验 Schema 来源（`validateRoundChanges` 运行时校验需要），但不再注入到 User Prompt（已由 System Prompt 的 `subsystemGuide` 替代）。`formatSubsystemFieldsForPrompt` 函数标记 `@deprecated`，仅保留供未来可能的 Debug 用途。

---

## 六、验证清单

- [ ] `npm run lint` 通过（零 warning）
- [ ] `npx tsc --noEmit` 通过（零 error）
- [ ] Part A: System Prompt token 增量 < 350 tokens
- [ ] Part A: subsystemGuide 的字段范围与 `SUBSYSTEM_CHANGE_SCHEMAS` 中的 Zod 校验一致
- [ ] Part B: character-base / health / lifespan / economy 四个子系统的 summary 输出包含中文标签
- [ ] examples 数组中每个示例的 output.changes 都符合 output.schema
- [ ] 手动调用 DeepSeek API 观察 AI 输出质量（changes 的 subsystemId 是否更准确）
- [ ] 确认"当前状态"摘要不再出现 raw 数字（如 `体魄:5`）而无中文标签
- [ ] `formatSubsystemFieldsForPrompt` 标记 `@deprecated` 后无其他调用方报错

---

## 七、风险评估

| 风险 | 概率 | 缓解 |
|------|------|------|
| subsystemGuide 过大导致 System Prompt 膨胀 | 低 | 极简格式（一行/系统，仅字段+范围），控制在 ~300 tokens |
| rules 前置导致 AI 过度约束（不敢发挥） | 低 | L0 保持当前 6 条强约束不变，仅调整顺序 |
| 近因效应让 AI 过度聚焦 task 而忽略 schema | 低 | schema 仍在第 5-6 位（中前部），rules 第 1 位 |
| examples 中 subsystemId 与当前代码不一致 | 中 | 实施时逐条核对 |
| Part B 中文标签逻辑与实际数值不匹配 | 中 | 标签阈值需根据实际游戏数值范围调校（先在修仙世界观测试） |
| 废弃 `formatSubsystemFieldsForPrompt` 导致 Debug 工具断链 | 低 | 保留函数体，仅标记 @deprecated |
