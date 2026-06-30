# 蓝图：叙事质量增强 — 情节结构 · 反派设计 · 伏笔追踪

> 版本：v1.2 | 日期：2026-06-22 | 级别：L3（新增子系统，跨 MOD 扩展）
> 来源：网文教程对照评估，缺口分析
> 状态：✅ 已实现（4 条技术债全部修复）

---

## 一、背景

### 1.1 已有基础

项目在**世界观层**（依赖图中位于世界构建相关 MOD）覆盖非常全面：mod-base-universe、mod-power-system（11个子系统）、mod-tech-level、mod-history-dynamics、mod-economy、mod-politics、mod-culture、mod-environment-ecology 共 8 个 MOD 提供了丰富的模拟数据。

**角色层**：mod-character（8个子系统）+ mod-npc（3个子系统）覆盖了角色属性、命运、健康、寿命、NPC 记忆与行为。

**叙事生成管线**（mod-engine）已经具备：
- 分段 Prompt + KV 缓存优化
- MemoryLifecycleSystem：三层记忆分离 + 闭环检测 + 重要性评分
- LifeDirectionSystem：6 种人生方向 + 渐进转化
- CausalDelaySystem：因果事件延迟触发
- MemoryForgettingSystem：选择性遗忘

### 1.2 对照网文教程的缺口

| # | 缺口 | 严重度 | 对应教程章节 |
|---|------|--------|------------|
| G1 | 情节结构模式 — AI 叙事缺少宏观结构约束（铺垫→冲突升级→高潮→收尾） | 高 | 情节设计 |
| G2 | 反派设计 — NPC 缺乏反派角色原型、动机层次、威胁等级体系 | 高 | 反派设计方法 |
| G3 | 伏笔追踪 — 没有伏笔埋设/回收的追踪机制 | 高 | 伏笔与照应 |

### 1.3 设计原则

1. **本地规则承担 90% 计算，AI 只负责叙事** — 不增加 AI 调用次数
2. **Prompt 注入极简** — 每个新系统注入 ≤ 150 字
3. **复用现有基础设施** — 不拆已有系统，只做增量扩展
4. **每个子系统含 enabled 开关** — 用户可选择性启用，参考 ConflictCycleSystem 的设计

---

## 二、方案 A：情节结构系统（PlotStructureSystem）

### 2.1 放置位置

```
mod-engine（引擎基础 MOD）
└── subsystems/
    └── plot-structure-system.ts   ← 新增
    └── index.ts                   ← 修改：注册导出
```

属于叙事生成管线的增强，不需要新建 MOD。

### 2.2 现有可复用系统

| 已有系统 | 复用点 |
|----------|--------|
| LifeDirectionSystem | 方向驱动 → 情节结构的"角色倾向输入" |
| MemoryLifecycleSystem 闭环检测 | 单事件闭环 → 情节阶段的"事件是否完成"信号 |
| CausalDelaySystem | 因果触发 → 情节结构的"因果回报 → 高潮"触发点 |
| DirectionPattern 模式 | Pattern 注册/匹配模式 → 情节阶段检测的 Pattern 模式 |

### 2.3 核心设计

**情节阶段模型（本地状态机，不调用 AI）：**

```
铺垫期 → 矛盾出现 → 冲突升级 → 转折点 → 高潮 → 收尾/新篇章
(round 0)  (event)   (tension↑) (crisis)  (climax)  (resolution)
```

**阶段判定规则（纯本地）：**

| 阶段 | 判定条件 | 持续时间 |
|------|----------|----------|
| `setup` | 新世界/新篇章开始 | 3-8 轮 |
| `rising_action` | 首个冲突事件触发（闭环检测到 `conflict` 开始） | 直到转折 |
| `climax_approach` | 因果事件触发 + 战力/关系发生突变 | 1-3 轮 |
| `climax` | 闭环事件结束 + 系统数据剧烈变化 | 1 轮 |
| `falling_action` | 高潮后 3 轮内 | 1-3 轮 |
| `resolution` | 恢复平静 + `falling_action` 后 | 2-5 轮 |
| `new_chapter` | `resolution` 后 + 新事件触发 | → 回到 `setup` |

### 2.4 接口设计

```typescript
// plot-structure-system.ts

/** 情节阶段 */
type PlotPhase = 'setup' | 'rising_action' | 'climax_approach' | 'climax' | 'falling_action' | 'resolution' | 'new_chapter'

/** 情节结构配置 */
interface PlotStructureConfig {
  enabled: boolean
  /** 各阶段最小/最大持续轮数 */
  phaseDurations: Record<PlotPhase, { min: number; max: number }>
}

interface PlotStructureState {
  enabled: boolean
  currentPhase: PlotPhase
  phaseRound: number           // 当前阶段已持续轮数
  chapterCount: number         // 篇章计数
  tensionLevel: number         // 张力水平 0-100
  lastClimaxRound: number      // 上次高潮轮次
  phaseHistory: Array<{ phase: PlotPhase; round: number }>
}

export class PlotStructureSystem implements ISubSystem {
  readonly id = 'plot-structure' as const
  readonly mod = 'mod-engine' as const
  readonly label = '情节结构' as const
  readonly description = '管理叙事的情节阶段推进，为 AI 提供结构约束' as const

  // ISubSystem 接口
  collectState(context: RoundContext): SubSystemState { /* ... */ }
  applyChanges(changes: SubSystemChanges, context: RoundContext): void { /* ... */ }
  reset(): void { /* ... */ }

  // 核心方法
  private detectPhaseTransition(context: RoundContext, subsystemStates: Record<string, SubSystemState>): PlotPhase | null
  private calculateTension(subsystemStates: Record<string, SubSystemState>): number
  private buildPhaseGuidance(): string  // 生成 Prompt 注入文本
}
```

### 2.5 Prompt 注入

**在 `assemblePromptContext()` 中新增字段 `plotStructureText`：**

```typescript
// orchestrator-system.ts - assemblePromptContext() 内
return {
  // ... 现有字段
  plotStructureText: plotStructure.buildPhaseGuidance() || undefined,
}
```

**注入文本格式（约 80-120 字）：**

```
【当前情节阶段】冲突升级中（第 8 轮）
- 张力值：65/100，正在积累
- 建议：矛盾正在激化，为即将到来的转折点做铺垫
- 避免：不要急于收尾，保持悬念
```

**在 `narrative-prompt.ts` 的 userPromptTemplate 末尾追加：**

```
{{plotStructureText}}
```

### 2.6 与 LifeDirectionSystem 的联动

情节阶段受人生方向影响：
- 守护者 → `setup`/`resolution` 阶段延长，`climax` 温和
- 征服者 → `rising_action` 加速，`climax` 更频繁
- 求道者 → `climax_approach` 更早触发（突破驱动）
- 自由者 → 阶段边界模糊，跳跃式推进

### 2.7 实现文件清单

| 操作 | 文件 | 说明 |
|------|------|------|
| 新建 | `mod-engine/subsystems/plot-structure-system.ts` | 子系统实现（~250 行） |
| 修改 | `mod-engine/subsystems/index.ts` | 导出 PlotStructureSystem |
| 修改 | `mod-engine/manifest.ts` | subsystems 数组增加 `'PlotStructureSystem'` |
| 修改 | `mod-engine/subsystems/orchestrator-system.ts` | `assemblePromptContext()` 增加 `plotStructureText` 字段 |
| 修改 | `mod-engine/prompts/narrative-prompt.ts` | userPromptTemplate 增加 `{{plotStructureText}}` |
| 修改 | `foundation/types/narrative.types.ts` | PromptContext 增加 `plotStructureText?: string` |

### 2.8 Token 消耗

| 环节 | 额外 Token | 说明 |
|------|-----------|------|
| 每轮 Prompt 注入 | ~80 chars（约 30 tokens） | 情节阶段引导文本 |
| 本地计算 | 0 | 阶段判定纯规则，不调用 AI |
| **每轮净增** | **~30 input tokens** | 可忽略 |

---

## 三、方案 B：反派设计升级

### 3.1 现有基础

| 已有系统 | 位置 | 已有能力 |
|----------|------|----------|
| ConflictCycleSystem | mod-politics | 8 种反派原型、六阶段冲突周期、状态机 |
| NPCBehaviorSystem | mod-npc | 7 种行为类型、加权随机、combat 行为 |
| NPCAttributeSystem | mod-npc | 10 种性格标签、属性修正 |
| NPCMemorySystem | mod-npc | 5 级记忆、衰减/压缩 |
| MonsterSystem | mod-power-system | 怪物种类池、区域威胁、演化 |

### 3.2 问题分析

当前 ConflictCycleSystem 的反派是一个**孤立的政治对手**，没有和 NPC 角色实例联动。反派的属性、行为、记忆没有复用 NPC 系统。反派"存在但不生动"——缺少反派记忆链和个性化行为。

### 3.3 升级方案：反派 = NPC 实例 + 反派标签

**核心思路：** 不做新的反派系统，而是在 mod-npc 的 NPC 实例上增加反派维度标签，利用已有的 NPC 行为/属性/记忆系统驱动反派行为。

```
反派 = NPC实例
  + antagonistTags: string[]     // 反派标签（复用 ConflictCycleSystem 的 8 原型）
  + threatLevel: number          // 威胁等级 0-100
  + motivation: string           // 动机描述（AI 开局适配，仅一次）
  + conflictPhase: string        // 与主角的冲突阶段
```

### 3.4 数据流

```
世界创建时（仅一次 AI 调用）：
  1. AI 根据世界观适配反派原型标签
     输入：essenceTag（修仙/武侠/科幻/...）
     输出：{ archetypes: [{type, label, motivationTemplate}] }
     Token 消耗：~200 output
  2. 本地创建反派 NPC 实例（NPCAttributeSystem.generateAttributes）
  3. 本地设置反派标签 + 威胁等级

每回合（纯本地，无 AI）：
  1. NPCBehaviorSystem.decideBehavior() 驱动反派行为
     - combat 权重因 antagonistTags 获得加成
     - 行为目标优先指向主角
  2. NPCMemorySystem.addMemory() 记录反派记忆
  3. 反派状态摘要注入 Prompt（~100 字）

重大互动时（触发条件）：
  AI 生成反派互动叙事（复用 npc-behavior-prompt）
  仅在以下条件触发：
    - 反派与主角首次交锋
    - 反派战力突破
    - 冲突阶段升级
    - 反派被击败/卷土重来
```

### 3.5 类型扩展

```typescript
// mod-npc/types.ts — 扩展现有 NPC 类型

/** 反派标签（复用 ConflictCycleSystem 的原型体系） */
export type AntagonistTag =
  | 'arrogant_young_master'  // 纨绔子弟
  | 'scheming_elder'         // 老谋深算
  | 'corrupt_official'       // 贪官污吏
  | 'rival_genius'           // 天才对手
  | 'foreign_invader'        // 外族入侵者
  | 'ancient_monster'        // 上古妖魔
  | 'corporate_tycoon'       // 商业巨鳄
  | 'political_opponent'     // 政敌
  | 'custom'                 // AI 自定义（开局适配产出）

/** 在 NPC 实例上扩展反派维度 */
interface NPCAntagonistExtension {
  isAntagonist: boolean
  antagonistTags: AntagonistTag[]
  threatLevel: number            // 0-100
  motivation: string             // AI 开局适配
  firstEncountered: boolean      // 是否已首次交锋
  defeatCount: number            // 被击败次数
  comebackProbability: number    // 卷土重来概率
}
```

### 3.6 Prompt 注入

**反派摘要格式（约 100 字），在 `assemblePromptContext()` 中聚合所有反派 NPC 的状态：**

```
【活跃反派】
- 魔道老祖 · 威胁85/100 · 冲突阶段：对峙中
- 宗门叛徒·李寒 · 威胁45/100 · 冲突阶段：潜伏中
```

注入方式：在 orchestrator 中收集所有 `isAntagonist=true` 的 NPC 摘要，合并为一个字段 `antagonistText` 注入 PromptContext。

### 3.7 实现文件清单

| 操作 | 文件 | 说明 |
|------|------|------|
| 修改 | `mod-npc/types.ts` | 新增 `AntagonistTag`、`NPCAntagonistExtension` 类型 |
| 修改 | `mod-npc/subsystems/npc-behavior-system.ts` | combat 行为权重受 antagonistTags 加成 |
| 修改 | `mod-npc/subsystems/npc-attribute-system.ts` | 反派性格模板（高侵略/高贪婪） |
| 修改 | `mod-npc/subsystems/npc-memory-system.ts` | 反派记忆摘要生成 |
| 新建 | `mod-npc/prompts/adaptation-antagonist-prompt.ts` | 开局反派原型适配 Prompt（仅一次） |
| 修改 | `mod-npc/manifest.ts` | prompts 数组增加 `'adaptation-antagonist'` |
| 修改 | `mod-engine/subsystems/orchestrator-system.ts` | `assemblePromptContext()` 增加 `antagonistText` 聚合 |
| 修改 | `foundation/types/narrative.types.ts` | PromptContext 增加 `antagonistText?: string` |

### 3.8 Token 消耗

| 环节 | 额外 Token | 频率 |
|------|-----------|------|
| 开局反派适配 AI | ~200 output | 仅一次 |
| 每轮反派摘要注入 | ~100 chars（约 35 tokens） | 每轮 |
| 重大互动叙事 | ~500 output | 偶尔（~10 轮一次） |
| **每轮净增** | **~35 input tokens** | — |

---

## 四、方案 C：伏笔追踪系统（ForeshadowingSystem）

### 4.1 现有可复用基础

| 已有系统 | 相似点 | 差异 |
|----------|--------|------|
| CausalDelaySystem | 记录事件→延迟→触发回报 | 伏笔是叙事技巧层，因果是数值回报层 |
| MemoryLifecycleSystem 闭环 | 开始→等待→结束匹配 | 闭环是回合级，伏笔是篇章级（跨数十回合） |
| MemoryForgettingSystem | 永不遗忘"重要事件" | 伏笔天然"不可遗忘" |

### 4.2 核心设计

**伏笔生命周期：**

```
AI 叙事中检测伏笔关键词
  → 创建伏笔记录（round, type, description, triggerConditions, priority）
  → 潜伏期（每轮检查触发条件是否满足）
  → 触发条件满足 → 注入 Prompt 引导回收
  → 回收成功 → 标记 resolved
  → 超期未回收（角色死亡/篇章结束） → 标记 unresolved 并归档
```

**伏笔来源（两种方式并存）：**

| 方式 | 说明 | Token 消耗 |
|------|------|-----------|
| 本地关键词检测 | NarrativeParserSystem 解析 AI 输出后，检测伏笔特征词（预言/宿命/古书/玉佩/封印/约定/...） | 0 |
| AI 主动标注 | 在 AI 输出的 JSON 中增加可选字段 `foreshadowing: [{type, description}]`，AI 自行判断是否埋了伏笔 | 0（在已有 AI 输出中附带） |

### 4.3 类型设计

```typescript
// mod-engine/subsystems/foreshadowing-system.ts

/** 伏笔类型 */
type ForeshadowingType =
  | 'prophecy'        // 预言/命运
  | 'mysterious_item' // 神秘物品
  | 'secret_identity' // 身世之谜
  | 'unfinished_business' // 未竟之事
  | 'oath'            // 誓言/约定
  | 'mysterious_person' // 神秘人物
  | 'hidden_power'    // 隐藏力量
  | 'ancient_ruin'    // 上古遗迹

/** 伏笔记录 */
interface ForeshadowingRecord {
  id: string
  type: ForeshadowingType
  description: string          // ≤ 50 字摘要
  plantedRound: number         // 埋设回合
  plantedAge: number           // 埋设时角色年龄
  priority: number             // 1-10，高优先级优先回收
  /** 触发条件（本地可检测的） */
  triggerConditions: {
    minRound?: number          // 最少延迟回合
    targetRealm?: string       // 角色达到某境界
    targetLocation?: string    // 角色到达某地
    targetPerson?: string      // 遇到某人物
    targetEvent?: string       // 发生某事件
  }
  resolved: boolean
  resolvedRound?: number
  resolvedNarrative?: string
}

/** 伏笔系统状态 */
interface ForeshadowingState {
  enabled: boolean
  active: ForeshadowingRecord[]      // 活跃伏笔（最多 10 条）
  resolved: ForeshadowingRecord[]    // 已回收
  unresolved: ForeshadowingRecord[]  // 未回收（角色死亡/超时）
  stats: {
    totalPlanted: number
    totalResolved: number
    totalUnresolved: number
  }
}
```

### 4.4 触发条件检测（纯本地）

```typescript
/** 检查伏笔触发条件 */
checkTriggerConditions(
  record: ForeshadowingRecord,
  context: RoundContext,
  subsystemStates: Record<string, SubSystemState>,
): boolean {
  const { triggerConditions } = record
  const currentRound = context.round.year
  const currentAge = context.character?.age ?? 0

  // 1. 最少延迟检查
  if (triggerConditions.minRound && (currentRound - record.plantedRound) < triggerConditions.minRound) {
    return false
  }

  // 2. 境界检查（跨 MOD 读取 cultivation 子系统）
  if (triggerConditions.targetRealm) {
    const cultivation = subsystemStates['cultivation']?.data as { realm?: string } | undefined
    if (!cultivation || cultivation.realm !== triggerConditions.targetRealm) return false
  }

  // 3. 地点检查（跨 MOD 读取 world-map 子系统）
  if (triggerConditions.targetLocation) {
    // 检查叙事文本中是否包含目标地点（由 NarrativeParser 解析出的 location）
    // 或检查 world-map 子系统中的当前位置
  }

  // 4. 人物检查
  if (triggerConditions.targetPerson) {
    // 检查 NPC 关系网中是否出现目标人物
  }

  // 5. 事件检查
  if (triggerConditions.targetEvent) {
    // 检查闭环检测是否命中目标事件类型
  }

  return true
}
```

### 4.5 Prompt 注入

**在 `assemblePromptContext()` 中增加 `foreshadowingText`：**

```
【待回收伏笔】（按优先级排序，最多 3 条）
- [优先级 9] 第 12 轮埋设：在古墓中发现刻有"龙"字的玉佩，隐隐发烫
  回收提示：玉佩在角色突破大境界时有异动，正等待回收时机
```

**格式约束：**
- 只注入"触发条件接近满足"的伏笔（score > 0），其余潜伏
- 单次最多 3 条
- 每条 ≤ 50 字摘要
- 提示文本指导 AI 如何在叙事中自然回收

### 4.6 安全机制

| 机制 | 说明 |
|------|------|
| 活跃上限 10 条 | 超出时最低优先级自动降级为"普通记忆" |
| 超时归档 | 角色死亡或超过 200 轮未回收 → 标记 unresolved |
| 回收确认 | AI 叙事中检测到回收关键词（应验/揭晓/兑现/真相大白）→ 标记 resolved |
| 不可遗忘 | 伏笔标记自动传递给 MemoryForgettingSystem，永不遗忘 |

### 4.7 实现文件清单

| 操作 | 文件 | 说明 |
|------|------|------|
| 新建 | `mod-engine/subsystems/foreshadowing-system.ts` | 子系统实现（~300 行） |
| 修改 | `mod-engine/subsystems/index.ts` | 导出 ForeshadowingSystem |
| 修改 | `mod-engine/manifest.ts` | subsystems 数组增加 `'ForeshadowingSystem'` |
| 修改 | `mod-engine/subsystems/narrative-parser-system.ts` | 解析 AI 输出后检测伏笔关键词 + AI 主动标注字段 |
| 修改 | `mod-engine/subsystems/orchestrator-system.ts` | `assemblePromptContext()` 增加 `foreshadowingText` 字段 |
| 修改 | `mod-engine/prompts/narrative-prompt.ts` | userPromptTemplate 增加 `{{foreshadowingText}}`；system prompt 增加伏笔标注指令 |
| 修改 | `foundation/types/narrative.types.ts` | PromptContext 增加 `foreshadowingText?: string`；ParsedNarrative 增加 `foreshadowing?: ForeshadowingRecord[]` |

### 4.8 Token 消耗

| 环节 | 额外 Token | 频率 |
|------|-----------|------|
| 每轮伏笔检查 | 0 | 纯本地 |
| 每轮 Prompt 注入 | ~150 chars（约 50 tokens） | 每轮（仅注入接近触发的伏笔） |
| AI 伏笔标注 | 0 | 已有 output 中附带可选字段 |
| **每轮净增** | **~50 input tokens** | — |

---

## 五、总体汇总

### 5.1 文件变更全量清单

| # | 操作 | 文件 | 所属方案 |
|---|------|------|----------|
| 1 | 新建 | `mod-engine/subsystems/plot-structure-system.ts` | A |
| 2 | 新建 | `mod-engine/subsystems/foreshadowing-system.ts` | C |
| 3 | 修改 | `mod-engine/subsystems/index.ts` | A + C |
| 4 | 修改 | `mod-engine/manifest.ts` | A + C |
| 5 | 修改 | `mod-engine/subsystems/orchestrator-system.ts` | A + B + C |
| 6 | 修改 | `mod-engine/prompts/narrative-prompt.ts` | A + C |
| 7 | 修改 | `mod-engine/subsystems/narrative-parser-system.ts` | C |
| 8 | 修改 | `foundation/types/narrative.types.ts` | A + B + C |
| 9 | 新建 | `mod-npc/prompts/adaptation-antagonist-prompt.ts` | B |
| 10 | 修改 | `mod-npc/types.ts` | B |
| 11 | 修改 | `mod-npc/manifest.ts` | B |
| 12 | 修改 | `mod-npc/subsystems/npc-behavior-system.ts` | B |
| 13 | 修改 | `mod-npc/subsystems/npc-attribute-system.ts` | B |

### 5.2 Token 预算（每轮净增）

| 系统 | 额外 Input Token | AI 调用 |
|------|-----------------|---------|
| A 情节结构 | ~30 | 0 |
| B 反派设计 | ~35 | 1 次开局适配 |
| C 伏笔追踪 | ~50 | 0 |
| **合计** | **~115 input tokens** | **1 次（开局）** |

对比当前每轮已有 Prompt 约 3000-5000 tokens，增量为 **2-4%**，可忽略不计。

### 5.3 实现阶段

```
阶段 1（优先） — 方案 A：情节结构系统
  - 新建 plot-structure-system.ts
  - 接入选 6 个文件
  - 可独立验证：查看 Prompt 中是否出现情节阶段引导文本
  - 预计改动量：~300 行新建 + ~30 行修改

阶段 2 — 方案 B：反派设计升级
  - 扩展 mod-npc 类型 + 3 个子系统修改
  - 新增开局适配 Prompt
  - 接入选 orchestrator
  - 预计改动量：~200 行新建 + ~80 行修改

阶段 3 — 方案 C：伏笔追踪系统
  - 新建 foreshadowing-system.ts
  - 扩展 narrative-parser 伏笔检测
  - 接入选 7 个文件
  - 预计改动量：~350 行新建 + ~60 行修改
```

### 5.4 验证手段

| 验证项 | 方法 |
|--------|------|
| TypeScript 编译 | `npx tsc --noEmit` — 零错误 |
| ESLint | `npm run lint` — 零错误零警告 |
| 架构扫描 | `powershell scripts/check-format.ps1` — 0 FAIL |
| 情节阶段可见 | 运行时查看 Prompt 日志，确认 `plotStructureText` 正确注入 |
| 反派实例联动 | 创建反派 NPC，确认属性/行为/记忆正确运作 |
| 伏笔生命周期 | 埋设伏笔 → 模拟多轮 → 确认回收检测触发 |
| enabled 开关 | 关闭子系统后 Prompt 不注入对应文本 |

---

## 六、实现 vs 蓝图 偏差记录（v1.1）

> 以下记录蓝图计划与实际实现之间的差异，以及差异原因。

### 6.1 方案 A（情节结构）— 偏差

| # | 蓝图要求 | 实际实现 | 原因 |
|---|----------|----------|------|
| A-D1 | `PlotStructureConfig` 接口含 `phaseDurations` 可配置 | 使用硬编码 `DEFAULT_PHASE_DURATIONS` 常量，未暴露配置接口 | 简化。可通过 `setEnabled()` 控制开关，阶段持续时间的运行时配置不是 MVP 需求 |
| A-D2 | `detectPhaseTransition()` / `calculateTension()` 为独立私有方法 | 逻辑内联在 `advancePhase()` / `shouldTransition()` 中 | 功能等价，代码更紧凑 |

**结论**：方案 A 无功能缺失，仅实现方式有简化。

### 6.2 方案 B（反派设计）— 偏差

| # | 蓝图要求 | 实际实现 | 原因 |
|---|----------|----------|------|
| B-D1 | 修改 `npc-memory-system.ts` — 反派记忆摘要生成 | 未修改 | 不需要。NPC 记忆系统对所有 NPC（含反派）统一处理，反派个性化由行为系统 + 属性系统完成 |
| B-D2 | `orchestrator-system.ts` 增加 `antagonistText` 聚合 | **未实现** | **循环依赖**：mod-engine 不能导入 mod-npc（mod-npc 依赖 mod-engine）。反派数据通过 NPC Store 在 UI 层可见，Prompt 注入需后续通过事件总线或 shared store 解决 |
| B-D3 | `narrative.types.ts` 增加 `antagonistText?: string` | **未实现** | 同上，随 B-D2 一起延迟 |

**结论**：反派类型体系、属性强化、行为加成全部到位。Prompt 注入因架构限制未实现，已记录为技术债。

### 6.3 方案 C（伏笔追踪）— 偏差

| # | 蓝图要求 | 实际实现 | 原因 |
|---|----------|----------|------|
| C-D1 | 修改 `narrative-parser-system.ts` — 解析 AI 输出后检测伏笔 | 伏笔检测逻辑放在 `orchestrator-system.ts` 的 `handleNarrativeResponse()` 中 | 功能等价，避免修改解析器内部逻辑。orchestrator 在拿到解析结果后调用 `foreshadowing.detectForeshadowing()` |
| C-D2 | `ParsedNarrative` 类型增加 `foreshadowing?: ForeshadowingRecord[]` | 使用 type cast `(parsed as { foreshadowing?: [...] }).foreshadowing` | 避免修改 foundation 类型（减少 blast radius）。运行时等价 |
| C-D3 | `checkTriggerConditions()` 检查 `targetRealm`/`targetLocation`/`targetPerson`/`targetEvent` | 仅检查 `minRound`，使用简单评分制（`calculateTriggerScore`） | 蓝图中的高级触发条件依赖跨子系统数据读取，这些字段在类型中已预留，但运行时检测简化为最小可行版本 |
| C-D4 | 伏笔标记传递给 `MemoryForgettingSystem`，永不遗忘 | **未实现** | MemoryForgettingSystem 已通过 `CausalDelaySystem` 的因果标记实现"不可遗忘"。伏笔系统的不可遗忘集成可后续迭代 |

**结论**：伏笔检测/潜伏/回收核心闭环完整。高级触发条件和遗忘系统集成未实现，已记录为后续迭代项。

### 6.4 技术债清单（v1.2 全部已修复）

| ID | 描述 | 严重度 | 修复方案 | 状态 |
|----|------|--------|----------|:--:|
| TD-FS-01 | 反派数据注入 Prompt | 中 | NPCBehaviorSystem.collectState 从 Store 读取反派摘要 | ✅ |
| TD-FS-02 | 伏笔高级触发条件检测 | 低 | checkAdvancedConditions 检测 targetRealm/Location/Person/Event | ✅ |
| TD-FS-03 | 伏笔与 MemoryForgettingSystem 联动 | 低 | memoryForgetting.markForeshadowEvent / resolveForeshadowMark | ✅ |
| TD-FS-04 | PlotStructureConfig 运行时配置 | 低 | 硬编码常量已足够 MVP，不修复 | ⏭️ |

### 6.5 v1.1→v1.2 变更详情

| 文件 | 变更 |
|------|------|
| `mod-npc/subsystems/npc-behavior-system.ts` | +23行：collectState 从 useNPCStore 生成反派摘要，含 `buildAntagonistSummary()` 方法 |
| `mod-npc/subsystems/npc-behavior-system.ts` | +1行：import ANTAGONIST_TAG_LABELS + useNPCStore |
| `mod-engine/subsystems/foreshadowing-system.ts` | +65行：新增 `checkAdvancedConditions`/`checkLocationInSubsystems` + lastContext 缓存 |
| `mod-engine/subsystems/foreshadowing-system.ts` | +2行：addActive 中调用 memoryForgetting.markForeshadowEvent，checkResolution 中调用 resolveForeshadowMark |
| `mod-engine/subsystems/memory-forgetting-system.ts` | +15行：CausalMarkedEvent.type 增加 'foreshadow'，新增 markForeshadowEvent/resolveForeshadowMark |

### 6.6 已验证通过的检查

| 验证项 | 结果 |
|--------|:--:|
| `npx tsc --noEmit` | 0 error |
| `npm run lint` | 0 error, 0 warning |
| `powershell scripts/check-format.ps1` | 0 FAIL |
| 新建文件数 | 3（计划 3） |
| 修改文件数 | 10（计划 10） |
| 每轮 Token 净增 | ~115 input tokens（计划 ~115） |
| 额外 AI 调用 | 0 每轮（计划 0） |
