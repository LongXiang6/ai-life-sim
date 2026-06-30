# 蓝图计划书：玩家原创保护 — 防止 AI 将自创内容改写为遗迹来源

> 版本：v1.0 | 日期：2026-06-29 | 级别：L3（跨 MOD：mod-engine + core + foundation + mod-power-system）
> 基于 R-7（AI 结构化判定优先于正则匹配）设计。

---

## 一、问题定义

### 1.1 现象

玩家在游戏中通过叙事选择「开创/创造」了力量体系、能力或设定。后续 AI 叙事中，将其来源改写为「发现于上古遗迹」「古人传承」——把玩家的原创变成了他人的遗产。

典型场景：
```
第 5 轮：玩家选择「开创武道修炼体系」→ AI 生成「你融合体术与内力，开创全新武道...」
第 18 轮：AI 生成「你在上古遗迹中发现了记载武道修炼的古籍...」← 来源被改写
```

### 1.2 根因

当前系统没有「玩家原创」的概念。AI 叙事的方向引导（opportunity/exploration/机缘事件）只有「外部发现」一个来源通道。一旦 AI 需要解释某项能力的来源，它只能往「遗迹」上靠。

### 1.3 设计原则

```
R-7：AI 结构化判定优先于正则匹配
→ AI 在 JSON 响应中主动标注"本轮创造了什么"
→ 系统精确追踪，注入不可变上下文
→ 禁止对叙事文本做正则匹配来猜测原创行为
```

---

## 二、总体架构

### 2.1 数据流

```
AI JSON 响应
  { "narrative": "...", "creations": [{ "name":"武道体系", ... }] }
      │
      ▼
narrativeParser.parse()  → ParsedNarrative.creations
      │
      ▼
orchestrator.handleNarrativeResponse()
  → 追加到 EngineState.characterCreations[]
      │
      ▼
orchestrator.assemblePromptContext()
  → buildCreationProtectionText()
    → "【原创保护】以下为角色亲自开创的内容..."
  → PromptContext.creationProtectionText
      │
      ▼
buildSegmentedPrompt()
  → STABLE_JSON_KEYS 中的 "原创保护"
  → 每轮 AI prompt 最稳定前缀 → KV Cache 永久命中
```

### 2.2 KV Cache 分层

```
Prompt JSON 分层（按稳定性降序）：
┌─────────────────────────────────────────────────┐
│  STABLE（KV Cache 永久命中）                      │
│    世界规则、MOD世界规则、世界标签、世界校准       │
│    世界设定、玩家自定义                           │
│    ★ 原创保护 ← 新增（角色已创造内容列表）        │
│    叙事风格、叙事基调、可变更子系统、字数约束       │
├─────────────────────────────────────────────────┤
│  SLOW（缓变，Cache 部分命中）                     │
│    角色、命格天赋、剧情阶段                       │
├─────────────────────────────────────────────────┤
│  FAST（每轮必变）                                 │
│    记忆摘要、核心记忆、待触发伏笔、事件注入        │
│    当前时间、当前状态、最近变化、叙事历史、指令    │
└─────────────────────────────────────────────────┘
```

---

## 三、AI JSON 响应新增字段

### 3.1 Schema

```json
{
  "creations": [
    {
      "name": "武道修炼体系",
      "description": "角色融合体术与内功开创的全新修炼方式",
      "category": "power_system"
    }
  ]
}
```

### 3.2 字段说明

| 字段 | 类型 | 说明 |
|------|------|------|
| `name` | string(2-8字) | 创造的名称 |
| `description` | string | 一句话简述 |
| `category` | enum | 类型：`power_system`(力量体系)、`technique`(招式/功法)、`ability`(能力)、`rule`(规则/设定)、`object`(物品)、`other`(其他) |

### 3.3 填写规则

- **仅当叙事明确描述了角色的原创行为时才填写**，无则省略整个字段
- 由 AI 自身语义判断，不需要代码层面的关键词匹配
- 已在前几轮标注过的内容，后续轮次无需重复标注（除非有重大发展）

---

## 四、原创保护注入格式

### 4.1 注入时机

每轮 `assemblePromptContext()` 中，从 `EngineState.characterCreations` 构建保护文本，注入到 Prompt JSON 的 STABLE 段。

### 4.2 注入文本格式

```
【原创保护（硬性约束）】以下为角色亲自开创的内容，其来源是角色自身的创造力。
严禁在后续叙事中将其改写为「遗迹发现」「古人传承」「秘境所得」「他人遗留」等外部来源。
若需描写这些内容的发展，应侧重于角色的自我完善、突破或传道授业，而非发掘古人遗产。

- [power_system] 武道修炼体系：角色融合体术与内功开创的全新修炼方式（第5轮开创）
- [technique] 自创剑法：角色在战斗中的顿悟，将毕生所学融会贯通（第8轮开创）
- [rule] 天道法则改写：角色以证道之力重新定义了一片区域的自然规则（第12轮开创）
```

### 4.3 首次无创建内容时

`creationProtectionText` 为 `undefined`，`OMIT_EMPTY_PROMPT_FIELDS` 会自动跳过该字段。整个 `原创保护` 字段不出现在 prompt 中。

---

## 五、改动文件清单

| # | 路径 | 改动类型 | 内容 |
|---|------|---------|------|
| 1 | `src/mods/mod-engine/types.ts` | 新增 | `CharacterCreation` 接口 + `EngineState.characterCreations` 字段 |
| 2 | `src/mods/mod-engine/prompts/narrative-prompt.ts` | 修改 | outputSchema 增加 `creations` 字段 + user prompt 增加 `原创保护` 占位 |
| 3 | `src/foundation/types/narrative.types.ts` | 修改 | `PromptContext` 增加 `creationProtectionText` 字段 |
| 4 | `src/core/ai-service/prompt-builder.ts` | 修改 | `STABLE_JSON_KEYS` 增加 `'原创保护'` + `buildNarrativeUserJson` 映射 |
| 5 | `src/mods/mod-engine/subsystems/narrative-parser-system.ts` | 修改 | `ParsedNarrative` 增加 `creations` 字段 |
| 6 | `src/mods/mod-engine/subsystems/orchestrator-system.ts` | 修改 | 4 处改动：提取 creations + 累积 + 构建保护文本 + 传给 PromptContext |
| 7 | `src/mods/mod-engine/store.ts` | 修改 | `characterCreations` 初始化 + 持久化 |
| 8 | `src/mods/mod-engine/helpers/narrative-hints.ts` | 修改 | 新增 `hintCreationProtection` + 升级遗迹频次检测为 mandatory |

---

## 六、各改动详细说明

### 6.1 `types.ts` — 新增类型

```typescript
/** 角色创造追踪 — 防止 AI 将自创内容改写为遗迹来源 */
export interface CharacterCreation {
  /** 名称（2-8字） */
  name: string
  /** 简述 */
  description: string
  /** 类型 */
  category: 'power_system' | 'technique' | 'ability' | 'rule' | 'object' | 'other'
  /** 确认轮次 */
  confirmedRound: number
}
```

`EngineState` 新增：
```typescript
characterCreations: CharacterCreation[]
```

### 6.2 `narrative-prompt.ts` — Schema + 模板

**output.schema.properties** 新增 `creations`（可选字段，归入 L2 rules）：

```typescript
creations: {
  type: 'array',
  description: '可选：本轮叙事中角色新创造/开创/发明的内容。'
    + '仅当叙事明确描述了角色的原创行为时才填写。'
    + '已在前几轮标注过的内容无需重复标注。无则省略整个字段。',
  items: {
    type: 'object',
    required: ['name', 'description', 'category'],
    properties: {
      name: { type: 'string', description: '创造的名称（2-8字）' },
      description: { type: 'string', description: '一句话简述' },
      category: {
        type: 'string',
        enum: ['power_system', 'technique', 'ability', 'rule', 'object', 'other'],
        description: 'power_system=力量体系, technique=招式/功法, ability=能力, rule=规则/设定, object=物品, other=其他',
      },
    },
  },
}
```

**userPromptTemplate** 新增（STABLE 段，`玩家自定义` 之后）：
```
"原创保护": {{creationProtectionText}},
```

**variables** 新增：`'creationProtectionText'`

### 6.3 `narrative.types.ts` — PromptContext

```typescript
/** 原创保护文本（角色已创造内容的硬约束，注入 STABLE KV Cache 段） */
creationProtectionText?: string
```

### 6.4 `prompt-builder.ts` — KV Cache 分层

`STABLE_JSON_KEYS` 新增（插入在 `玩家自定义` 之后）：
```typescript
'原创保护',  // ← 新增
```

`buildNarrativeUserJson()` 新增映射：
```typescript
原创保护: context.creationProtectionText,
```

### 6.5 `narrative-parser-system.ts` — ParsedNarrative

```typescript
export interface ParsedNarrative {
  // ... 现有字段 ...
  /** AI 标注的本轮角色创造内容 */
  creations?: Array<{ name: string; description: string; category: string }>
}
```

### 6.6 `orchestrator-system.ts` — 核心逻辑（4 处）

**A. 提取 creations**（`handleNarrativeResponse()` 中，模仿 foreshadowing 提取）：
```
从 effectiveParsed 中读取 creations
→ 不为空 → 追加到 this.state.characterCreations[]
→ 每个条目附带 confirmedRound = this.state.totalRounds + 1
```

**B. 构建保护文本**（新增方法 `buildCreationProtectionText()`）：
```
若 characterCreations 为空 → 返回 undefined
否则：
  - 每个 creation 格式化为 "- [category] name：description（第N轮开创）"
  - 包裹在【原创保护（硬性约束）】文本框中
  - 返回完整文本
```

**C. 传入 PromptContext**（`assemblePromptContext()` 中）：
```typescript
creationProtectionText: this.buildCreationProtectionText(),
```

**D. 在 `buildUserInstruction()` 或 `assemblePromptContext()` 合并处赋值**：
```typescript
const assembled: PromptContext = {
  // ... 现有字段 ...
  creationProtectionText,
}
```

### 6.7 `store.ts` — 持久化

`initialState` 中新增：
```typescript
characterCreations: [] as CharacterCreation[],
```

当前 store 已通过 zustand `persist` 中间件自动持久化 `EngineState` 到 localStorage，`characterCreations` 加入后自动获得持久化能力。

### 6.8 `narrative-hints.ts` — 安全网

两项改动：

**A. 新增 `hintCreationProtection()` 函数**

从 `NarrativeHintInput` 不直接包含 `characterCreations`，改为在 `orchestrator.buildUserInstruction()` 中直接追加 mandatory 指令：
```
当 EngineState.characterCreations.length > 0 时，追加：
「【原创保护】角色已开创 N 项原创内容，禁止改写为遗迹/秘境发现」
```

**B. `hintAdventureFrequency` 从 optional 移入 mandatory**

当 `sideQuestCount >= 3` 时，指令从「参考建议」升级为「指令（必遵）」级别。

---

## 七、边界情况处理

| 情况 | 处理方式 |
|------|---------|
| AI 未返回 `creations` 字段 | 无操作（optional 字段，解析器容错） |
| AI 返回了但 `creations` 为空数组 | 无操作 |
| AI 返回了重复的 creation（同名） | 不重复追加——`buildCreationProtectionText` 构建前按 `name` 去重 |
| 已有 10+ 个 creations | 正常累积（每次最多几个，不易膨胀） |
| 玩家删档/新游戏 | zustand persist 随存档重置 |
| 压缩管线丢失 creations 对应的叙事 | creations 是独立存储的，不受压缩影响 |

---

## 八、对照 R-7 合规性

| R-7 要求 | 本方案实现 |
|----------|-----------|
| 不可变信息：硬编码常量 | `category` enum 为硬编码，STABLE_JSON_KEYS 为硬编码 |
| 缓变信息：配置驱动 | `characterCreations` 存入 EngineState，持久化 |
| 实时变动信息：AI 输出结构化格式 | `creations` 为 AI JSON Mode 中的结构化字段，系统直接按字段取值 |
| 禁止对 AI 自由文本使用正则匹配 | 不用正则扫描叙事文本猜原创行为 |

---

## 九、实施顺序

| 步骤 | 文件 | 依赖 |
|------|------|------|
| 1 | `types.ts` + `narrative.types.ts` | 无（类型先行） |
| 2 | `narrative-parser-system.ts` | 1 |
| 3 | `store.ts` | 1 |
| 4 | `orchestrator-system.ts` | 1, 2, 3 |
| 5 | `prompt-builder.ts` | 1 |
| 6 | `narrative-prompt.ts` | 1, 5 |
| 7 | `narrative-hints.ts` | 1 |
| 8 | C 闸验证（lint + tsc + gate-check） | 1~7 |
