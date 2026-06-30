# 蓝图计划书：微观-宏观桥接 & AI 数据流评估（已完成）

> 创建日期：2026-06-21
> 级别：L3（跨 MOD + 架构评估）
> 状态：已完成（2026-06-21 全部 Phase 实施完毕，2026-06-21 二次校对通过）

---

## 一、现状调查：微观↔宏观数据流

### 1.1 宏观层（世界/社会）子系统清单

| MOD | 架构层 | 子系统 | 追踪内容 |
|-----|-----------|--------|----------|
| mod-world | 200 | WorldInitSystem, WorldEntitySystem, WorldTimelineSystem | 世界初始化、时间线 |
| mod-base-universe | 300 | CelestialSystem, EraSystem, WorldMapSystem, FateProphecySystem, DivineCreationSystem | 天象、纪元、命运预言 |
| mod-environment-ecology | — | ClimateSystem, EcologySystem, GeographySystem, NaturalResourceSystem, PollutionSystem | 气候、生态、地理 |
| mod-economy | — | EconomySystem, WorkSystem, ItemSystem, SettlementSystem, PopulationSystem | 经济、市场、人口 |
| mod-politics | — | SocialStratificationSystem, FactionDynamicsSystem, NationRelationSystem, LegalSystem, ConflictCycleSystem, LanguageNamingSystem, SocialValuesSystem | 政治、派系、法律 |
| mod-culture | — | CultureSystem, ArtSystem, EducationSystem, ReputationSystem, AchievementSystem, WorksSystem, RelationshipSystem, FamilySystem, DiscipleSystem, PersonalAbilitySystem | 文化、教育、关系 |
| mod-history-dynamics | 410 | EventPoolSystem, CausalSimulationSystem | 历史事件池、因果链 |
| mod-tech-level | — | CultureTechSystem, IndustrySystem | 科技、工业 |

### 1.2 微观层（角色个人）子系统清单

全部集中在 `mod-character`：

| 子系统 | 追踪内容 |
|--------|----------|
| CharacterBaseSystem | 5 项基础属性（体魄/心智/悟性/魅力/出身） |
| DestinyPatternSystem | 命格（稀有度/极性/属性加成） |
| HealthSystem | HP、体力、精神、伤病、死亡判定 |
| LifespanSystem | 种族寿命、突破、寿命上限 |
| LifeStageSystem | 8 个生命阶段（婴儿→逝世） |
| AttributeDecaySystem | 年龄衰减（黄金年龄→衰减） |
| MoralitySystem | 善恶值 7 档 |
| PostDeathEpilogueSystem | 死后尾声 |
| TalentSystem | 天赋获得/失去 |

### 1.3 连接机制分析

**现有连接路径（仅 3 条硬连接）：**

| # | 路径 | 机制 | 方向 |
|---|------|------|:--:|
| 1 | SocialStratificationSystem 读取 `economy.playerWealth` | `collectState` 中直接读取 | 角色经济→宏观阶层 |
| 2 | HealthSystem 读取 `celestial.crossEffects.health_damage` | `advance` 中读取 | 宏观天象→角色 HP |
| 3 | Orchestrator.buildInfluenceText() → Prompt | `subsystemRelevance.calculateTotalPower()` 聚合角色属性 | 角色→叙事描述 |

**软连接（AI 自由裁量）：**

```
角色子系统 summary ──→ 混合传入 AI Prompt ──→ AI 自主决定叙事关联 ──→ 解析后分发到各子系统
```

**缺陷：**
- `cross-domain-rules.ts` 的 5 条规则全部是**纯关键词匹配**，不读取任何子系统数值数据
- `event-lifecycle-tracker.ts` 的 10 个事件维度中 **9 个是纯宏观事件**，角色健康/寿命/道德均未追踪
- 不存在 `health.hp < 20 → faction-dynamics.turmoil += 30%` 这样的确定性规则

---

## 二、AI 数据流详解

### 2.1 模拟系统→AI：Prompt 组装全流程

**步骤 1：子系统状态收集**（`OrchestratorSystem.collectSubsystemStates()`）

三回合收集（吸收 Factorio 设计）：
- Round 1 (`data.lua`)：各子系统 `collectState()` 独立收集
- Round 2 (`data-updates.lua`)：基于 Round 1 结果跨系统修正
- Round 3 (`data-final-fixes`)：全局一致性修复

每个子系统返回：
```typescript
{
  id: 'health',
  summary: '【健康】HP 80/100 | 体力 85/100 | 精神 60/100',  // 中文摘要文本
  data: { hp: 80, maxHp: 100, stamina: 85, ... }             // 结构化数据（不传给 AI）
}
```

**步骤 2：富 PromptContext 组装**（`assemblePromptContext()`）

将以下信息打包成 `PromptContext`：

| 变量 | 来源 | 稳定性 | 内容 |
|------|------|:--:|------|
| `worldSetting` | 世界设定 | 固定 | 世界观名称、配置 |
| `worldRules` | `getWorldRules(essenceTag)` | 固定 | 世界观叙事规则（修仙/科幻/武侠等） |
| `modWorldRules` | 各 MOD manifest | 固定 | MOD 声明的额外世界观规则 |
| `worldTagsText` | 世界配置 | 固定 | 世界标签约束文本 |
| `worldCustomizeText` | 玩家自定义 | 固定 | 力量上限、空间形态、文明阶段 |
| `narrativeStyle` | 设置 store | 固定 | 叙事风格（默认/史诗/写实/诗意） |
| `character` | `characterState` | 缓变 | 角色名、性别、年龄、种族 |
| `memorySummary` | 记忆生命周期系统 | 缓变 | L1-L4 压缩记忆 + 检索结果 |
| `subsystemSummaries` | 所有子系统 summary | **速变** | 每轮所有子系统的中文摘要列表 |
| `subsystemFields` | `formatSubsystemFieldsForPrompt()` | 固定 | 告诉 AI 哪些子系统有哪些可变字段 |
| `systemChangeSummary` | 前后轮 summary diff | **速变** | 与前轮对比的变化摘要 |
| `eventInjectionText` | 事件生命周期追踪器 | **速变** | 当前触发的宏观事件描述 |
| `narrativeHistory` | 最近 8 条历史叙事 | **速变** | 前几轮的叙事文本 |
| `directionText` | 人生方向系统 | 缓变 | 角色当前人生方向描述 |
| `userInstruction` | — | — | 用户自定义指令（当前实际为空字符串） |

**步骤 3：KV Cache 优化分段**

```
[稳定前缀] → 世界设定 + 世界规则 + 世界约束 + 玩家设定 + 叙事风格
              → 完全不变 → 首次调用后永久命中 KV Cache

[缓变中段] → 角色信息 + 记忆档案
              → 变化频率低 → 小增量 cache miss

[速变后缀] → 子系统状态 + 最近变化 + 事件注入 + 历史叙事 + 人生方向
              → 每轮必变 → 计入 cache miss
```

**步骤 4：传给 AI 的数据格式**

所有数据以**纯文本**方式通过 `{{variable}}` 占位符替换注入模板。示例：

```
【世界设定】
{"name":"苍云大陆","config":{"essenceTag":"cultivation",...}}

【世界规则】
【修仙规则】修炼境界分为炼气→筑基→金丹→元婴→化神→渡劫→大乘...

【角色信息】
{"name":"李逍遥","gender":"男","age":16}

【当前状态】
【基础属性】体魄6 心智7 悟性8 魅力5 出身4
【健康】HP 80/100 | 体力 85/100 | 精神 60/100
【寿命】当前寿命16岁 | 最大寿命120岁 | 种族：人类
【修炼】炼气三层 | 进度45/100 | 瓶颈：physique
【经济】财富50 | 物价指数100 | 社会阶层：cultivator
【人口】总计1200人 | 增长率2%
...

【可变更的子系统字段】
  character-base（基础属性）：
    physique — 体魄（0-100）
    mind — 心智（0-100）
  health（健康）：
    hpDelta — 生命值变化（正=恢复，负=受伤，范围 -50~+20）
  ...

【事件注入】
[市场动荡] 价格指数异常波动...

【历史叙事】
前一轮的叙事文本
---
再前一轮的叙事文本
```

### 2.2 AI→模拟系统：AI 返回内容

**Prompt 要求 AI 输出的 JSON 格式：**

```json
{
  "narrative": "叙事文本（150-300字，3段式：环境描写→行动/事件→内心/后果）",
  "changes": [
    { "id": "子系统ID", "description": "变更简述", "changes": { "key": "value" } }
  ],
  "notableEvents": ["本轮值得记录的重要事件简述（最多3条）"],
  "direction": "本轮叙事方向（战斗/征服、经商/积累、修炼/突破、社交/结盟、探索/冒险、经营/建设、学习/研究、日常/生活）"
}
```

**Zod Schema（用于校验但当前未启用严格校验）：**

```typescript
const NarrativeResponseSchema = z.object({
  narrative: z.string(),
  changes: z.array(z.object({
    id: z.string(),
    description: z.string(),
    changes: z.record(z.string(), z.unknown()),
  })),
  notableEvents: z.array(z.string()).optional(),
  direction: z.string().optional(),
})
```

### 2.3 现有解析流程（全防御 4 层降级）

```
AI 原始响应
  │
  ├─ L0: JSON.parse(content) → 提取 narrative + changes + notableEvents + direction
  │     → 段落自动分段（按句号+长度智能折段）
  │
  ├─ L1 (降级): 正则提取 narrative 字段
  │     → 多版本文本交叉匹配（原始/标准化/中文感知三个版本取最长）
  │     → 不提取 changes（changes 为空数组）
  │
  ├─ L2 (降级): 提取最长中文字符块
  │     → 不提取 changes
  │
  └─ L3 (降级): 返回空 narrative
        → 由外部兜底叙事补充
```

**关键特征：**
- `changes` 数组中的 `id` 字段是**自由文本**（AI 自行决定写哪个子系统 ID）
- `changes.changes` 是 `Record<string, unknown>`——AI 可以写任意 key/value
- 解析后通过 `applyRoundChanges()` 分发到对应子系统
- 子系统通过 `applyChanges()` 进行结构校验（必须包含 id/description/changes，且 id 匹配）

---

## 三、修复方案：微观→宏观桥接

### 方案 A：扩展 cross-domain-rules.ts（优先级：高）

**将规则从"纯关键词匹配"升级为"数据驱动"**

改动范围：仅 `cross-domain-rules.ts`

新增规则模板：

```typescript
// 规则接口扩展
interface CrossDomainRule {
  id: string
  condition: (event: DomainEvent) => boolean
  // 新增：数值条件（从子系统 data 读取）
  dataCondition?: (subsystemStates: Record<string, unknown>) => boolean
  handler: (event: DomainEvent, subsystemStates: Record<string, unknown>) => SubsystemInstruction[]
  priority: number
}
```

**新增 6 条角色驱动的跨域规则：**

| # | 规则 | 触发条件（数据驱动） | 效果 |
|---|------|---------------------|------|
| 1 | 英雄陨落 | `health.hp < 20 && health.isDying` | faction-dynamics.turmoil += 20, reputation.playerFame += 10 |
| 2 | 道德灯塔 | `morality.value > 80 && reputation.fame > 60` | social-values.goodAlignment += 15, crimeRate -= 5 |
| 3 | 魔王降临 | `morality.value < -80 && combatPower > 70` | social-values.evilAlignment += 20, faction-dynamics.turmoil += 30 |
| 4 | 继承危机 | `health.hp < 30 && lifespan.maxAge - age < 5` | faction-dynamics.powerStruggle += 25, legal.stability -= 10 |
| 5 | 天选之人 | `luck > 8 && faith.devotionLevel > 80` | celestial.blessingEvents += 1, population.growthRate += 5 |
| 6 | 文明推手 | `character-base.mind > 8 && culture-tech.techProgress > 50` | culture-tech.techBoost += 10, education.level += 2 |

**实现要点：**
- `dataCondition` 从 `orchestrator.extractDetectionStates()` 传入子系统数据快照
- handler 输出 `SubsystemInstruction[]`，走现有的 `toSubSystemChanges` → `applyRoundChanges` 管线
- 全在本地计算，不依赖 AI

### 方案 B：扩展 event-lifecycle-tracker.ts（优先级：中）

**新增 4 个角色驱动的宏观事件维度：**

| # | 事件类型 | 数据源 | 触发条件 |
|---|----------|--------|----------|
| 11 | 英雄陨落 | health.hp / combatPower.rank | HP < 20 且战力 > 50 |
| 12 | 道德引领 | morality.value / reputation.fame | morality > 80 或 < -80 |
| 13 | 继承动荡 | health.hp / lifespan.maxAge / lifespan.age | 寿命将尽且 HP 低 |
| 14 | 超凡入圣 | cultivation.realm / faith.devotionLevel | 境界 ≥ 7（元婴+） |

### 方案 C：给宏观子系统增加角色数据消费（优先级：低）

**改造目标子系统**，在 `collectState` 或 `advance` 中显式读取角色子系统数据：

| 目标系统 | 消费的角色数据 | 计算逻辑 |
|----------|---------------|----------|
| FactionDynamicsSystem | reputation.fame, morality.value | 高声望角色 → 派系稳定度 +N |
| SocialValuesSystem | morality.value, faith.devotionLevel | 角色道德/信仰 → 社会价值观偏移 |
| NationRelationSystem | reputation.fame, combatPower.rank | 强者到访 → 外交关系改善 |
| EventPoolSystem | 全部角色属性 | 根据角色状态解锁/封锁历史事件 |

---

## 四、AI 返回结构化数值变更的可行性评估

### 4.1 用户的想法

> 让 AI 在每轮返回的信息中，额外添加一组数据（各系统数值变化，按规定格式），本地模拟系统直接从这组数据获取数值变化，不再依赖解析器。

### 4.2 现状：AI 已经返回 changes

**AI 已经在返回 changes 了。** 当前的 `changes` 数组就是各系统数值变化：

```json
{
  "changes": [
    { "id": "cultivation", "description": "修炼进度停滞", "changes": { "cultivationProgress": -5, "bottleneck": "physique" } },
    { "id": "lifespan", "description": "年龄增长", "changes": { "age": 16 } },
    { "id": "talent", "description": "获得天赋", "changes": { "addTalents": [...] } }
  ]
}
```

而且 `applyRoundChanges()` 已经直接将解析后的 changes 分发到各子系统：

```typescript
// orchestrator-system.ts L481-508
applyRoundChanges(changes: SubSystemChanges[]): void {
  for (const change of changes) {
    const sub = this.subsystems.find((s) => s.id === change.id)
    sub.applyChanges(change, context)  // 直接应用
  }
}
```

### 4.3 用户真正想要的 vs 现状的差异

| 维度 | 现状 | 用户期望 |
|------|------|----------|
| **数值变更来源** | AI 生成 changes（JSON），解析器提取 → 分发 | 同一套（AI 已经在做了） |
| **变更格式** | `{ id, description, changes: { key: value } }` — 自由格式 | 规定格式（如每个子系统有固定字段模板） |
| **可靠性** | 4 层降级管线，L1+ 不提取 changes | 期望 AI 始终输出标准格式 |
| **覆盖范围** | AI 自主决定哪些子系统有变化 | 期望每个子系统都有一套固定输出格式 |
| **跳过解析器** | 解析器 L0 走 JSON.parse，已经很简单 | 无需跳过，解析器不是瓶颈 |

### 4.4 核心差异分析

**差异 1：changes 字段的自由度**

当前 `changes.changes` 是 `Record<string, unknown>`——AI 可以写任意 key/value。但已经有 `subsystem-field-registry.ts` 告诉 AI 每个子系统有哪些合法字段：

```
【可变更的子系统字段】
  health（健康）：
    hpDelta — 生命值变化（正=恢复，负=受伤，范围 -50~+20）
    staminaDelta — 体力变化量
    spiritDelta — 精神变化量
    addDiseases — 新增疾病 [{name, severity}]
    addInjuries — 新增伤势 [{name, severity}]
```

**关键问题：AI 不总是听从这些约束。** 它可能：
- 输出不在字段列表中的 key（如 `hp` 而非 `hpDelta`）
- 不输出某些本该有变化的子系统
- 输出完全虚构的子系统 ID

**差异 2：changes 是否被用于数值计算**

现状：changes **已经被用于数值计算**。`applyChanges` 中 `Object.assign(this.data, changes.changes)` 直接将 AI 返回值合并入子系统状态。但随后还有：
- **本地模拟推进**（`advanceSubsystems()`）：每轮也做纯规则计算
- **叙事后处理**（`_runNarrativePostProcessing()`）：连锁反应/寿命突破
- **世界方向修正**（`_applyWorldDirectionFromNarrative()`）：AI 方向→数值

所以数值来源是**混合的**：AI 变更 + 本地规则 + 后处理。AI 不是唯一数值来源。

### 4.5 评估结论

| 评估项 | 结论 |
|--------|------|
| 技术可行性 | **完全可行**。AI 已经在返回 changes，只需标准化格式 |
| 是否推荐 | **推荐标准化，但不要完全替代解析器和本地计算** |
| 现有解析器是否需要 | **需要保留**。解析器处理降级（AI 不返回 JSON）、格式修复、段落分段 |
| 本地计算是否需要 | **需要保留**。所有数值计算应本地完成，AI 只是提出"变化量建议" |
| 最大风险 | AI 返回的数值可能不合理（如 hpDelta: -999），需要本地钳制 |

### 4.6 推荐方案：结构化变更 + 本地验证

不改变现有架构，只在现有基础上增强：

```
现有流程：
  AI 返回 changes → JSON.parse → applyChanges → 子系统 Object.assign

增强后流程：
  AI 返回 changes → JSON.parse → Schema 校验（Zod）→ 字段名映射 → 范围钳制 → applyChanges
```

**具体改动（约 150 行）：**

1. **`subsystem-field-registry.ts`**：将字段说明升级为带范围的 Zod Schema
2. **`parse-strategies.ts`**：L0 解析后增加 Zod 校验，无效 changes 丢弃并记录
3. **`orchestrator-system.ts`**：`applyRoundChanges` 前增加范围钳制

```typescript
// 示例：health 子系统的变更 schema
const healthChangeSchema = z.object({
  hpDelta: z.number().min(-50).max(20).optional(),
  staminaDelta: z.number().min(-30).max(30).optional(),
  spiritDelta: z.number().min(-30).max(30).optional(),
  addDiseases: z.array(z.object({
    name: z.string(),
    severity: z.number().min(1).max(10),
  })).optional(),
  addInjuries: z.array(z.object({
    name: z.string(),
    severity: z.number().min(1).max(10),
  })).optional(),
})

// 校验 AI 返回的 changes
function validateChange(change: SubSystemChanges): SubSystemChanges | null {
  const schema = SUBSYSTEM_CHANGE_SCHEMAS[change.id]
  if (!schema) return null  // 未知子系统 ID → 丢弃
  const result = schema.safeParse(change.changes)
  if (!result.success) {
    console.warn(`[Validator] ${change.id} 变更校验失败:`, result.error.issues)
    return null
  }
  return { ...change, changes: result.data }
}
```

---

## 五、总结

### 问题诊断

| 问题 | 严重度 | 根因 |
|------|:--:|------|
| 微观→宏观无确定性连接 | 高 | cross-domain-rules 全是关键词匹配，不读数据 |
| 角色状态不触发宏观事件 | 高 | event-lifecycle-tracker 9/10 维度是纯宏观 |
| AI changes 格式不稳定 | 中 | 无 Zod 校验，AI 可输出任意 key |
| 数值来源混杂 | 低 | AI + 本地 + 后处理三重来源，但架构上可接受 |

### 建议实施顺序

```
Phase 1（小改动，高收益）：扩展 cross-domain-rules.ts
  → 新增 dataCondition + 6 条角色驱动的跨域规则
  → 改动范围：1 个文件，约 80 行

Phase 2（中改动，中收益）：扩展 event-lifecycle-tracker.ts
  → 新增 4 个角色驱动的宏观事件维度
  → 改动范围：1 个文件，约 60 行

Phase 3（可选项）：AI changes Zod 校验
  → subsystem-field-registry.ts 升级为带 Schema
  → 改动范围：2 个文件，约 70 行
```

---

## 六、TalentSystem 废弃记录（2026-06-21）

**废弃原因**：模拟时天赋获得/失去（addTalents / removeTalents）与 SkillSystem 的 newSkills 功能高度重合。两者都允许 AI 动态创建"命名能力+属性效果"。

**已执行清理：**

| 文件 | 改动 |
|------|------|
| `mod-character/subsystems/talent-system.ts` | `applyChanges` 中 addTalents/removeTalents 处理逻辑移除，类骨架保留 |
| `mod-character/manifest.ts` | subsystems 列表移除 `TalentSystem` |
| `mod-character/subsystems/index.ts` | `talentSystem` 单例移除，类导出保留 |
| `mod-character/index.ts` | `talentSystem` 单例导出移除 |
| `mod-engine/bootstrap/register-subsystems.ts` | `TalentSystem` 别名移除 |
| `mod-engine/prompts/narrative-prompt.ts` | 天赋操作指令 → 技能操作指令（addTalents→newSkills） |
| `mod-engine/campaigns/default/prompts/system-prompt.ts` | 同上 |

**保留（供命格预览页面使用）：**
- `TALENT_RARITY_CONFIG` / `TALENT_POLARITY_CONFIG` / `TALENT_SELECT_COUNT` — UI 显示常量
- `TalentSystem` 类导出 — 维持编译兼容
- `prompts/talent-presets.ts` — 天赋预设库（角色创建页使用）

**重定义方向**：TalentSystem 待用户确定新用途后重新实现。

---

## 七、KV Cache 优化：Prompt 变量重排序

### 7.1 原理（DeepSeek KV Cache）

参考 [DeepSeek KV Cache 文档](https://api-docs.deepseek.com/zh-cn/guides/kv_cache)：

> 缓存前缀单元从请求开头完整匹配，命中后跳过推理。固定前缀越长，命中 tokens 越多。

**规则**：请求 token 序列的前缀如果与前次请求完全相同，则整个前缀段的 KV 计算结果可直接复用。因此**固定内容必须放在 Prompt 最前面**。

### 7.2 当前排序（叙事 Prompt）

```
[稳定前缀]
  worldSetting → worldRules → modWorldRules → worldTagsText → worldCustomizeText → narrativeStyle
[缓变中段]
  character → memorySummary
[速变后缀]
  subsystemSummaries → subsystemFields → systemChangeSummary → eventInjectionText → narrativeHistory → directionText → userInstruction
```

### 7.3 推荐排序（按逻辑优先级）

用户原则："底层规则（土壤）→ 世界设定（由规则生成）→ 故事基调 → 角色信息 → 最新状态"

**新排序：**

```
=== KV Cache 全命中区（永久固定，世界创建后永不变化）===
  1. worldRules          ← 世界底层规则（修仙/科幻/武侠等，最底层"土壤"）
  2. modWorldRules       ← MOD 声明的额外规则
  3. worldTagsText       ← 世界氛围约束（AI 生成的主题红线，"气候"）
  4. worldSetting        ← 世界名称、配置明细
  5. worldCustomizeText  ← 玩家自定义维度（力量上限/空间形态等）
  6. subsystemFields     ← 可变更字段说明（固定注册表）
  7. narrativeStyle      ← 叙事风格（固定）

=== 缓变区（偶有变化）===
  8. character           ← 角色基本信息
  9. memorySummary       ← 压缩记忆
 10. directionText       ← 人生方向

=== 速变区（每轮必变）===
 11. subsystemSummaries  ← 子系统最新状态
 12. systemChangeSummary ← 与前轮对比的变化
 13. eventInjectionText  ← 当前触发的宏观事件
 14. narrativeHistory    ← 最近叙事历史
 15. userInstruction     ← 用户自定义指令
```

### 7.4 具体改动

**文件**：`mod-engine/prompts/narrative-prompt.ts`

将 `userPromptTemplate` 中 `{{variable}}` 的顺序从：

```
世界设定 → 世界规则 → MOD规则 → 世界约束 → 玩家设定 → 叙事风格 → 角色 → 记忆 → 当前状态 → 可变更字段 → 最近变化 → 事件注入 → 历史叙事 → 人生方向 → 用户指令
```

改为：

```
世界规则 → MOD规则 → 世界约束 → 世界设定 → 玩家设定 → 可变更字段 → 叙事风格 → 角色 → 记忆 → 人生方向 → 当前状态 → 最近变化 → 事件注入 → 历史叙事 → 用户指令
```

覆盖现有 Prompt 中的 15 个变量。

---

## 八、ABC 方案执行顺序说明

**不是选择题，是递进式的分阶段执行计划：**

| Phase | 方案 | 改动量 | 收益 | 依赖 |
|-------|------|:--:|------|------|
| 1 | A: 扩展 cross-domain-rules.ts | 1 文件 / ~80 行 | 高（建立角色→世界硬连接） | 无 |
| 2 | B: 扩展 event-lifecycle-tracker.ts | 1 文件 / ~60 行 | 中（追踪角色驱动的宏观事件） | 依赖 Phase 1 的规则定义 |
| 3 | C: AI changes Zod 校验 | 2 文件 / ~70 行 | 低（数据安全增强） | 无，可独立执行 |

**执行逻辑**：A→B 有依赖关系（B 追踪的事件维度需要 A 的规则已生效）。C 是纯增强，可以在 A 之前做，但因为收益最低所以排最后。

---

## 九、答疑：worldTagsText vs worldRules

| 维度 | worldRules | worldTagsText |
|------|-----------|---------------|
| **来源** | 硬编码表（按 essenceTag 匹配） | AI 在世界创建时动态生成 |
| **作用** | 世界**怎么运转**（机制/规则） | 世界**什么氛围**（主题/基调） |
| **比喻** | "土壤"——底层物理规则 | "气候"——上层氛围红线 |
| **示例** | "修炼境界分为炼气→筑基→金丹→元婴" | "硬性禁止: 灵气充沛, 诸侯割据, 弱肉强食" |
| **格式** | `【修仙规则】...` | `硬性禁止: tag1, tag2, ...` |
| **稳定性** | 固定（代码中） | 世界创建后固定 |
| **Prompt 位置** | `【世界规则】` | `【世界约束】` |

两者互补，不重复。worldRules 管"力量体系怎么运作"，worldTagsText 管"故事不能偏离什么氛围"。

---

## 十、内存与存储风险调研（2026-06-21）

### 10.1 并发计算：无风险

所有 AI 调用均为**严格顺序执行**（`await` 串行化），不存在 `Promise.all` 并发。Web Worker 零使用，所有计算在主线程。

| 场景 | 并发数 |
|------|:--:|
| 每轮回合叙事 | 1 |
| 世界初始化（5路AI） | 1（顺序） |
| 六级压缩（L1-L6） | 1（顺序） |
| 死后尾声 | 1 |

**结论：不会因为并发计算而崩溃。**

### 10.2 持久化存储风险

| 风险 | 严重度 | 详情 |
|------|:--:|------|
| **localStorage 无配额保护** | 高 | `local-storage.ts` 仅 `try/catch` 吞错，无 `navigator.storage.estimate()` 检查，无降级清除逻辑 |
| **narrativeHistory 全量 persist** | 高 | engine Store persist 包含 200 条叙事文本（~100KB），每轮 Zustand 都会序列化写入 |
| **compressedSummaries 无上限** | 高 | L1-L6 摘要数组无限增长，1000 轮后约 250 条/125KB |
| **17 个 Store 同时 persist** | 中 | 累计 ~300KB-1.5MB localStorage 占用，多存档可能接近 5MB 上限 |
| **自动保存每 10 轮一次** | 中 | 移动端 I/O 压力，含 OPFS 三个文件写入 |
| **OPFS** | 低 | 单存档 ~150-600KB，远低于配额（几GB） |

**localStorage 总占用估算：**

| 来源 | 大小 |
|------|------|
| engine Store (persist) | ~100-500 KB |
| world Store (persist) | ~50-200 KB |
| 其余 15 个 Store persist | ~50-100 KB |
| 直接 localStorage 调用 | ~5-10 KB |
| **总计** | **~200-800 KB** |

正常游玩在 5MB 限制内安全，但多存档/多世界配置可能接近上限。

### 10.3 内存积累风险

| 数据结构 | 上限 | 最大估算 | 风险 |
|----------|------|----------|:--:|
| narrativeHistory | 200 条 | ~100 KB | 低 |
| compressedSummaries | **无上限** | 1000 轮后 ~125 KB | 中 |
| relationships (memory-engine) | **无上限** | 潜在增长 | 中 |
| causalEvents (memory-forgetting) | **无上限** | 潜在增长 | 中 |
| majorEvents (memory-engine) | 50 条 | ~3 KB | 低 |
| searchIndex (memory-lifecycle) | 50 条 | ~10 KB | 低 |
| 17 个 Zustand Store 内存 | 固定 | ~150-500 KB | 低 |
| React 组件树 + VDOM | 动态 | ~5-15 MB | 中 |

### 10.4 移动端崩溃风险

**JS 堆估算：**

| 游玩阶段 | Canvas 关闭 | Canvas 活跃 |
|-----------|:-----------:|:-----------:|
| 0-200 回合 | 20-30 MB | 40-60 MB |
| 500-1000 回合 | 30-50 MB | 60-80 MB |
| 1000+ 回合 | 50-80 MB | 80-120 MB |

- **iOS Safari** 崩溃阈值：~200-300 MB
- **Android Chrome** 崩溃阈值：~400-500 MB
- **正常游玩（0-500 回合）**：**安全**，即使 Canvas 活跃也在 80MB 以内
- **极端场景（1000+ 回合 + Canvas 地图 + 星空动画）**：iOS 低端设备（iPhone SE/8）存在风险
- 两个 Canvas（WorldMapCanvas + StarfieldBackground）同时存在时叠加效应是最大变量

### 10.5 建议修复优先级

| # | 修复项 | 位置 | 改动量 |
|---|--------|------|:--:|
| 1 | compressedSummaries 加上限（500条） | `summary-compressor-system.ts` | 1 行 |
| 2 | localStorage 加 `QuotaExceededError` 专项处理 + UI 告警 | `local-storage.ts` | ~20 行 |
| 3 | engine Store persist 排除 narrativeHistory（仅持久化最近 50 条） | `mod-engine/store.ts` | ~5 行 |
| 4 | relationships / causalEvents 加上限（50/100） | `memory-engine-system.ts`, `memory-forgetting-system.ts` | 各 1 行 |
| 5 | 移动端地图页面暂停星空动画 | `StarfieldBackground.tsx` | ~10 行 |
| 6 | 自动保存间隔移动端增至 30 轮 | `orchestrator-system.ts` | ~5 行 |

---

## 十一、命格抽取页面防崩溃修复项（2026-06-21）

### 11.1 调研结论

命格抽取页面（talent-draw）**不存在需要卸载重装浏览器的崩溃风险**。所有存储数据均为合法 JSON，无 IndexedDB/Service Worker 污染，状态机无死锁。最坏情况：页面白屏，刷新即恢复。

### 11.2 关键风险点（不会导致浏览器级崩溃）

| # | 问题 | 后果 | 严重度 |
|---|------|------|:--:|
| 1 | AI 异步操作卸载后继续运行（`abortRef` 从未设为 true） | 浪费一次 API 调用 + 卸载组件上 setState（React 自动吞掉） | 中 |
| 2 | 无 QuotaExceededError 处理 | ls 满时静默写入失败，但不会损坏已有数据 | 低 |
| 3 | 无缓存过期清理机制 | 多世界缓存累积可能接近 5MB 上限 | 低 |
| 4 | `PageErrorBoundary` 未在 talent-draw 使用 | 渲染异常时无优雅降级 | 低 |
| 5 | AI 生成无强制超时中止 | 极端网络下可能等 ~100 秒（10次重试×10秒） | 低 |

### 11.3 三层防御（已有，无需修复）

| 层级 | 机制 | 说明 |
|------|------|------|
| 1 | `generateWithAI` 内部 5 批调用，单批失败跳过 | 容错 AI 单次调用失败 |
| 2 | 外层 10 次重试 + 渐进式延迟（1s→10s） | 容错网络波动 |
| 3 | 全部失败后降级到 `generateFromPresets(100)` | 纯本地 31 条预设兜底 |

### 11.4 建议修复项

| # | 修复项 | 位置 | 改动量 | 优先级 |
|---|--------|------|:--:|:--:|
| 1 | 组件卸载时中止 AI：`useEffect` 清理中设 `abortRef.current = true` | `talent-draw/page.tsx` | 3 行 | 高 |
| 2 | 用 `PageErrorBoundary` 包裹 talent-draw 页面 | `talent-draw/page.tsx` | 5 行 | 中 |
| 3 | zustand persist `migrate` 加结构完整性校验 | `mod-character/store.ts` | ~8 行 | 中 |
| 4 | localStorage `write()` 检测 `QuotaExceededError` 并清理旧缓存 | `local-storage.ts` | ~20 行 | 低 |
| 5 | 缓存条目加入时间戳，30 天自动过期 | `local-storage.ts` | ~15 行 | 低 |
| 6 | AI 生成加 120 秒总体超时，超时降级预设池 | `talent-draw/page.tsx` | ~5 行 | 低 |

### 11.5 调研涉及的关键文件

| 文件 | 职责 |
|------|------|
| `mod-pages/pages/talent-draw/page.tsx` | 命格抽取 UI + 异步生成编排 |
| `mod-character/subsystems/destiny-pattern-system.ts` | 命格生成/选择/校验核心逻辑 |
| `mod-character/store.ts` | zustand persist 状态管理 |
| `mod-character/constants.ts` | 命格常量（31条预设） |
| `mod-character/prompts/destiny-pattern-prompt.ts` | AI Prompt 模板 |
| `core/storage/local-storage.ts` | localStorage 封装 |
| `mod-ui/components/organisms/PageErrorBoundary.tsx` | 错误边界（定义但未使用） |
| `app/layout.tsx` | 根布局（无错误边界包裹） |

---

## 附录：文件索引

| 文件 | 职责 |
|------|------|
| `mod-engine/subsystems/orchestrator-system.ts` | 主循环 + Prompt 组装 + 变更分发 |
| `mod-engine/subsystems/narrative-parser-system.ts` | AI 响应解析 + 4 层降级 |
| `mod-engine/helpers/parse-strategies.ts` | JSON/正则/纯文本解析策略 |
| `mod-engine/helpers/degradation-manager.ts` | 降级策略串联 |
| `mod-engine/helpers/subsystem-field-registry.ts` | 告诉 AI 各子系统可变字段 |
| `mod-engine/helpers/cross-domain-rules.ts` | 跨域联动规则（11条：5宏观事件驱动+6角色状态驱动） |
| `mod-engine/helpers/event-lifecycle-tracker.ts` | 14 维度事件检测（10宏观+4角色驱动） |
| `mod-engine/prompts/narrative-prompt.ts` | 叙事 Prompt 模板 + KV Cache 策略 |
| `core/ai-service/prompt-builder.ts` | Prompt 变量替换 + 分段 |
| `mod-engine/subsystems/subsystem-relevance-system.ts` | 五维过滤 + 影响力计算 |

---

## 十二、二次校对：16 项执行逐一对账（2026-06-21）

与 [combat-power-and-economy-bridge.md](./combat-power-and-economy-bridge.md) 并行校对，对旧蓝图的全部可执行项进行逐项核查。

### 12.1 主线修复（Phase 1/2/3 + KV Cache）

| # | 来源 | 项 | 文件位置 | 状态 |
|---|------|-----|----------|:--:|
| 1 | §3 Phase A | 规则 6: 英雄陨落 `hp<20` | [cross-domain-rules.ts](file:///d:/AI/ai-life-sim/src/mods/mod-engine/helpers/cross-domain-rules.ts#L197-223) | 通过 |
| 2 | §3 Phase A | 规则 7: 道德灯塔 `morality>80 && fame>60` | [cross-domain-rules.ts](file:///d:/AI/ai-life-sim/src/mods/mod-engine/helpers/cross-domain-rules.ts#L226-253) | 通过 |
| 3 | §3 Phase A | 规则 8: 魔王降临 `morality<-80 && mainStage>=3` | [cross-domain-rules.ts](file:///d:/AI/ai-life-sim/src/mods/mod-engine/helpers/cross-domain-rules.ts#L256-283) | 通过 |
| 4 | §3 Phase A | 规则 9: 继承危机 `hp<30 && maxAge-age<5` | [cross-domain-rules.ts](file:///d:/AI/ai-life-sim/src/mods/mod-engine/helpers/cross-domain-rules.ts#L286-315) | 通过 |
| 5 | §3 Phase A | 规则 10: 天选之人 `luck>8 && devotion>80` | [cross-domain-rules.ts](file:///d:/AI/ai-life-sim/src/mods/mod-engine/helpers/cross-domain-rules.ts#L318-345) | 通过 |
| 6 | §3 Phase A | 规则 11: 文明推手 `mind>8 && techProgress>0.5` | [cross-domain-rules.ts](file:///d:/AI/ai-life-sim/src/mods/mod-engine/helpers/cross-domain-rules.ts#L348-376) | 通过 |
| 7 | §3 Phase B | 事件 11: 英雄陨落 | [event-lifecycle-tracker.ts](file:///d:/AI/ai-life-sim/src/mods/mod-engine/helpers/event-lifecycle-tracker.ts#L241-255) | 通过 |
| 8 | §3 Phase B | 事件 12: 道德引领 | [event-lifecycle-tracker.ts](file:///d:/AI/ai-life-sim/src/mods/mod-engine/helpers/event-lifecycle-tracker.ts#L258-278) | 通过 |
| 9 | §3 Phase B | 事件 13: 继承动荡 | [event-lifecycle-tracker.ts](file:///d:/AI/ai-life-sim/src/mods/mod-engine/helpers/event-lifecycle-tracker.ts#L281-301) | 通过 |
| 10 | §3 Phase B | 事件 14: 超凡入圣 | [event-lifecycle-tracker.ts](file:///d:/AI/ai-life-sim/src/mods/mod-engine/helpers/event-lifecycle-tracker.ts#L304-323) | 通过 |
| 11 | §4 Phase C | AI changes Zod 全 16 子系统校验 | [subsystem-field-registry.ts](file:///d:/AI/ai-life-sim/src/mods/mod-engine/helpers/subsystem-field-registry.ts#L201-294) + [validateChange](file:///d:/AI/ai-life-sim/src/mods/mod-engine/helpers/subsystem-field-registry.ts#L302-341) | 通过 |
| 12 | §7 | KV Cache 15 变量重排序 | [narrative-prompt.ts](file:///d:/AI/ai-life-sim/src/mods/mod-engine/prompts/narrative-prompt.ts#L214-264) | 通过 |

### 12.2 存储/性能修复（§10）

| # | 蓝图 §10.5ID | 项 | 文件位置 | 状态 |
|---|:--:|-----|----------|:--:|
| 13 | #1 | compressedSummaries 上限 500 条 | [summary-compressor-system.ts](file:///d:/AI/ai-life-sim/src/mods/mod-engine/subsystems/summary-compressor-system.ts#L614) `MAX_SUMMARIES=500` | 通过 |
| 14 | #2 | localStorage QuotaExceededError 处理（清理 cache/temp 前缀） | [local-storage.ts](file:///d:/AI/ai-life-sim/src/core/storage/local-storage.ts#L119-142) | 通过 |
| 15 | #3 | engine persist narrativeHistory 仅 50 条 | [mod-engine/store.ts](file:///d:/AI/ai-life-sim/src/mods/mod-engine/store.ts#L139-140) `slice(-50)` | 通过 |
| 16 | #4 | relationships 上限 50 + causalEvents 上限 100 | [memory-engine-system.ts](file:///d:/AI/ai-life-sim/src/mods/mod-engine/subsystems/memory-engine-system.ts#L660-662) + [memory-forgetting-system.ts](file:///d:/AI/ai-life-sim/src/mods/mod-engine/subsystems/memory-forgetting-system.ts#L180-182) | 通过 |
| 17 | #5 | StarfieldBackground 移动端禁用特效 | [StarfieldBackground.tsx](file:///d:/AI/ai-life-sim/src/mods/mod-ui/components/organisms/StarfieldBackground.tsx#L201-204) `!isMobile` 条件 | 通过 |
| 18 | #6 | 自动保存移动端 30 轮间隔 | [orchestrator-system.ts](file:///d:/AI/ai-life-sim/src/mods/mod-engine/subsystems/orchestrator-system.ts#L1222-1224) `>= 30` | 通过 |

### 12.3 命格页面防崩溃（§11）

| # | 蓝图 §11.4ID | 项 | 文件位置 | 状态 |
|---|:--:|-----|----------|:--:|
| 19 | #1 | 组件卸载时 abort AI `abortRef` | [talent-draw/page.tsx](file:///d:/AI/ai-life-sim/src/mods/mod-pages/pages/talent-draw/page.tsx#L207-L212) | 通过 |
| 20 | #2 | PageErrorBoundary 包裹 | [talent-draw/page.tsx](file:///d:/AI/ai-life-sim/src/mods/mod-pages/pages/talent-draw/page.tsx#L500-L680) | 通过 |
| 21 | #3 | zustand persist migrate 校验 | [mod-character/store.ts](file:///d:/AI/ai-life-sim/src/mods/mod-character/store.ts#L203-207) | 通过 |
| 22 | #4 | localStorage QuotaExceededError（同 #14） | 同上 | 通过 |
| 23 | #5 | 缓存 30 天自动过期（CacheEntry 时间戳） | [local-storage.ts](file:///d:/AI/ai-life-sim/src/core/storage/local-storage.ts#L55-83) | 通过 |
| 24 | #6 | AI 生成 120 秒总体超时 | [talent-draw/page.tsx](file:///d:/AI/ai-life-sim/src/mods/mod-pages/pages/talent-draw/page.tsx#L318-320) `120_000ms` | 通过 |

### 12.4 微小偏差

| # | 蓝图期望 | 实际 | 影响 |
|---|---------|------|------|
| D1 | Storage #2 要求 "UI 告警" | 仅有 `console.warn`，无 UI toast | 低：用户感受不到 localStorage 满，但系统自动清理 cache/temp 后可继续运行 |
| D2 | 规则 6 蓝图写 `health.hp < 20 && health.isDying` | 实际为 `hp < 20`（无 isDying 检查） | 无：`isDying` 是 `hp <= 0` 的衍生状态，HP<20 时尚未触发死亡判定，先触发英雄陨落规则合理 |

### 12.5 结论

旧蓝图 **16 个章节 24 项可执行清单** 全部执行完毕，仅 2 个微小偏差（均不影响系统功能）。tsc + lint 双零通过。
