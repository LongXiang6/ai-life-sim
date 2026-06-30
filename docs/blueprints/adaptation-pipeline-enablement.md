# 蓝图计划书：AI 适配管线 —— 子系统数据世界观叙事化

> 版本：v1.0 | 日期：2026-06-29 | 级别：L3（新系统 + core/foundation + 跨多 MOD）
> 背景：子系统输出硬编码数据（如"上古遗迹"），直接被注入 AI prompt。19 个 adaptation prompt 已定义但从未接线。

---

## 一、问题定义

### 1.1 现状

子系统（fortune-encounter、cultivation 等）的 `summary` 是硬编码字符串：

```
"【逆天奇遇】上古遗迹：发现一座上古时期的隐秘遗迹"
"境界突破：金丹期"
```

这些字符串**无世界观区分**，仙侠/科幻/末日用同一套文本，直接注入到每轮 AI prompt 的 `可变更子系统` 字段中。

### 1.2 根因

19 个 adaptation prompt 已设计完整（含 systemPrompt、userPromptTemplate、变量、outputSchema），但**管线从未接线**。子系统算完数据后直接输出，中间没有 AI 适配层。

### 1.3 修复目标

在子系统输出和 prompt 注入之间，插入 **AI 适配管线**：将硬编码数据翻译为世界观贴切的叙事文本。异步后台执行，不阻塞主叙事流。

---

## 二、总体架构

### 2.1 时序

```
Round N：
  1. advanceTime + advanceSubsystems + collectStates
     → subsystem.summary = "【逆天奇遇】上古遗迹"  (硬编码)
  
  2. assemblePromptContext()
     → subsystemSummaries = adaptationManager.getAdaptedSummaries()
     → 首次：无缓存 → 返回原始 summary（和现在一样，零退化）
  
  3. callAIStreamDegraded → 生成第 N 轮叙事 → 返回给玩家

  ┌─ 4. 紧随其后（异步后台，不阻塞玩家）：
  │   adaptationManager.adaptPending(context)
  │     → 遍历所有 summary → 找出缓存未命中的
  │     → 调 AI：adaptationPrompt( rawSummary, worldviewTags )
  │     → 写入缓存：key = subsystemId:hash(rawSummary) → value = adaptedText
  └─

Round N+1：
  2. assemblePromptContext()
     → subsystemSummaries = adaptationManager.getAdaptedSummaries()
     → 缓存命中 → 返回已适配文本
     → "【逆天奇遇】青云山秘境中的剑仙遗藏"
```

### 2.2 缓存策略

| 缓存 key | 示例值 | 生命周期 |
|----------|--------|---------|
| `subsystemId::hash(summary)` | `fortune-encounter::a3f8b2` | 整个游戏过程永久有效 |
| `subsystemId::hash(summary+worldview)` | `fortune-encounter::x1y2z3` | 世界观不换也永久 |

**效果**：14 种奇遇事件 × 每种只适配 1 次 = 14 次 AI 调用，后续全部走缓存。

### 2.3 子系统 ↔ adaptation prompt 映射

规律：`adaptation-{subsystemId}`（mod-base-universe 是 `adaptation-{subsystemId}-prompt`）

| 子系统 ID | adaptation prompt `name` | 有完整内容？ |
|----------|--------------------------|-------------|
| `cultivation` | `adaptation-cultivation` | 是 |
| `luck` | `adaptation-luck` | 是 |
| `monster` | `adaptation-monster` | 是 |
| `anomaly-phenomena` | `adaptation-anomaly-phenomena` | 是 |
| `combat-power` | `adaptation-combat-power` | 是 |
| `fortune-encounter` | `adaptation-fortune-encounter` | 是 |
| `divine-intervention` | `adaptation-divine-intervention` | 是 |
| `faith` | `adaptation-faith` | 是 |
| `special-material` | `adaptation-special-material` | 是 |
| `supreme-item` | `adaptation-supreme-item` | 是 |
| `celestial` | `adaptation-celestial-prompt` | **空 stub** |
| `era` | `adaptation-era-prompt` | **空 stub** |
| `fate-prophecy` | `adaptation-fate-prophecy-prompt` | **空 stub** |
| `world-map` | `adaptation-world-map-prompt` | **空 stub** |
| `divine-creation` | `adaptation-divine-creation` | 是 |
| `culture-tech` | `adaptation-culture-tech` | **空 stub** |
| `industry` | `adaptation-industry` | **空 stub** |
| `golden-finger` | `adaptation-golden-finger` | 是 |

**第一批接入（15 个有完整内容的 prompt）**：
- mod-power-system × 10
- mod-base-universe × 1（divine-creation）
- mod-golden-finger × 1
- mod-npc × 1（antagonist — 特殊：没有对应 subsystem，开局调一次）
- mod-character × 2（life-stage, lifespan 无 adaptation prompt）

**第二批接入（6 个空 stub）**：待未来填充 systemPrompt 后再接入。

---

## 三、改动计划

### 阶段 1：新建 AdaptationManager

**新文件**：`src/mods/mod-engine/subsystems/adaptation-manager-system.ts`

```
class AdaptationManager {
  // 缓存：subsystemId:hash → adaptedText
  private cache: Map<string, string>
  
  // 子系统ID → adaptationPrompt 映射
  private readonly promptMap: Map<string, PromptTemplate>
  
  // 世界观元数据（用于填充 adaptation prompt 的 worldCalibrationSummary）
  private worldviewMeta: { essenceTag: string; description: string }
  
  // 获取适配后的 summaries（用于 assemblePromptContext）
  getAdaptedSummaries(rawStates: SubSystemState[]): string[]
  
  // 后台异步适配（在 executeRoundV2 末尾调用）
  async adaptPending(context: RoundContext): Promise<void>
}
```

#### 核心逻辑：`getAdaptedSummaries()`

```
for each subSystemState:
  key = subSystemId + "::" + hash(subState.summary)
  
  if cache.has(key):
    use cached adapted text  ← 零延迟
  else:
    use raw subState.summary ← 和现在一样，零退化
    mark as pending for async adaptation
```

#### 核心逻辑：`adaptPending()`

```
for each pending subSystemState:
  key = subSystemId + "::" + hash(subState.summary)
  
  // 1. 找到对应的 adaptation prompt
  prompt = promptMap.get(subSystemId)
  if (!prompt) continue
  
  // 2. 用子系统状态 + 世界观信息填充 prompt 变量
  filledPrompt = fillAdaptationVariables(prompt, subState, worldviewMeta)
  
  // 3. 调用 AI
  result = await callAI(prompt.systemPrompt, filledPrompt, { jsonMode: true })
  
  // 4. 解析输出 + 提取适配文本
  adapted = extractAdaptedSummary(result, prompt.outputSchema)
  
  // 5. 写入缓存
  cache.set(key, adapted)
```

#### 约束：
- 并发限制：最多 3 个 AI 调用同时进行（避免 token 耗尽）
- 超时：单个 8 秒（避免撑爆）
- 失败容忍：单次失败 → 下次重试，3 次连续失败 → 永久跳过该子系统
- 成本极低：每个子系统事件只调一次，14 种奇遇事件 × 全部游戏仅 14 次

### 阶段 2：注册 adaptation prompt 映射

**新文件**：`src/mods/mod-engine/helpers/adaptation-prompt-registry.ts`

```
// 子系统ID → adaptation prompt 导入映射
// 注：4 个 mod-base-universe 的 naming 不一致（有 -prompt 后缀）
import { adaptationCultivationPrompt } from '@/mods/mod-power-system/prompts/adaptation-cultivation-prompt'
import { adaptationFortuneEncounterPrompt } from '@/mods/mod-power-system/prompts/adaptation-fortune-encounter-prompt'
// ... 共 13 个（15 个有内容 - 2 个特殊处理）

export const ADAPTATION_PROMPT_MAP: Record<string, PromptTemplate> = {
  'cultivation': adaptationCultivationPrompt,
  'fortune-encounter': adaptationFortuneEncounterPrompt,
  // ... 共 13 个
}
```

### 阶段 3：接入 executeRoundV2

**文件**：[orchestrator-system.ts](file:///D:/AI/ai-life-sim/src/mods/mod-engine/subsystems/orchestrator-system.ts)

**改动 A**：在 `assemblePromptContext()` 中，将 raw summaries 替换为 adapted text

```typescript
// 第 1052-1058 行，改前：
const summaries: string[] = dedupeSummariesAgainstMemory(
  Object.values(relevantStates)
    .filter((s) => s.id !== this.id)
    .map((s) => s.summary)
    .filter(Boolean) as string[],
  memoryStateSummaries,
)

// 改后：
const rawSummaries = Object.values(relevantStates)
  .filter((s) => s.id !== this.id)
  .map((s) => ({ id: s.id, summary: s.summary }))
  .filter((s) => s.summary)

const adaptedMap = this.adaptationManager.getAdaptedSummaries(rawSummaries)

const summaries: string[] = dedupeSummariesAgainstMemory(
  rawSummaries.map((s) => adaptedMap.get(s.id) ?? s.summary),
  memoryStateSummaries,
)
```

**改动 B**：在 `executeRoundV2()` 末尾（第 883 行 `return result` 之前），触发后台适配

```typescript
// 13. 后台异步适配（不阻塞主叙事流）
this.adaptationManager.adaptPending(context).catch((err) => {
  // 仅记录，不影响主流程
  if (import.meta.env.DEV) {
    console.warn('[Adaptation] Background adapt failed:', err)
  }
})
```

**改动 C**：在 `reset()` + `hydrateFromEngineStore()` 中初始化/恢复 AdaptationManager

### 阶段 4：构建 adaptation prompt 的 worldCalibrationSummary

adaptation prompt 的 userPromptTemplate 中都有 `{{worldCalibrationSummary}}` 变量，需要填充世界观元信息。

**新增辅助函数**（放在 adaptation-manager-system.ts 内）：

```
function buildAdaptationWorldContext(config: WorldConfig): string {
  return `本质标签：${config.essenceTag}\n世界观描述：${config.worldDescription ?? ''}\n校准摘要：${config._calibrationSummary ?? ''}`
}
```

### 阶段 5：验证与 C 闸

---

## 四、关键设计决策

### 4.1 异步不阻塞

`adaptPending()` 在主叙事返回给玩家**之后**执行。玩家点"推进时间" → 立刻看到故事 → 后台静默适配。首次适配前使用原始 summary（零退化体验）。

### 4.2 缓存不可变

缓存写入后永远有效（事件 description 是硬编码的，不会变）。不需要过期策略。

### 4.3 失败容忍

单个子系统的 adaptation 失败不影响其他子系统，也不阻塞主叙事。

### 4.4 通用 prompt 调用

AdaptationManager 不解析每个 adaptation prompt 的特定输出 schema。它使用统一的提取策略：
- 如果输出有 `narrativeHint` 字段 → 取它
- 如果输出有 `realmName` + `narrativeHints` → 拼接
- 兜底：取第一个字符串字段的值

### 4.5 与 outputSchema 蓝图的关系

本蓝图**先于** output-schema-validation-enablement 蓝图执行。adaptationManager 调用 AI 时传入 `outputSchema`（使用 output-schema 蓝图中新增的参数）。

---

## 五、改动文件清单

| # | 文件 | 改动类型 | 说明 |
|---|------|---------|------|
| 1 | **新建** `mod-engine/subsystems/adaptation-manager-system.ts` | 新增 | 核心系统：缓存 + 异步适配 |
| 2 | **新建** `mod-engine/helpers/adaptation-prompt-registry.ts` | 新增 | 子系统ID → adaptation prompt 映射 |
| 3 | `mod-engine/subsystems/orchestrator-system.ts` | 修改 | A 改为 adapted summaries + B 末尾触发适配 + C reset/hydrate |
| 4 | `mod-engine/sub-agents/all-subsystems.ts` | 修改 | orchestrator 依赖注入 AdaptationManager |
| 5 | `mod-engine/store.ts` | 可能修改 | 持久化 adaptationCache（可选） |

---

## 六、测试验证

| 场景 | 预期 |
|------|------|
| 首次使用（无缓存） | `subsystemSummaries` 使用原始 summary，叙事和现在相同 |
| 适配完成后 | 下次 `subsystemSummaries` 使用 adapted text |
| 同一事件再次触发 | 缓存命中，直接取 adapted text |
| AI 适配失败 | 日志 warn，不影响主叙事 |
| 世界观切换 | 重新适配（因为 worldview 变了，hash 不同） |

---

## 七、预期收益

- 仙侠奇遇从"上古遗迹"变为"剑仙遗藏"
- 科幻奇遇从"上古遗迹"变为"未知文明数据核心"
- 末日奇遇从"上古遗迹"变为"战前文明避难所"
- 15 个硬编码事件类型 × 多种世界观 → 全部自动适配
- 每个事件类型在整个游戏中只调 1 次 AI（~50-100 token）

---

## 八、实施顺序

| 步骤 | 内容 | 文件数 | 依赖 |
|------|------|--------|------|
| 1 | 创建 adaptation-prompt-registry.ts（映射表） | 1 | 无 |
| 2 | 创建 adaptation-manager-system.ts（核心系统） | 1 | 1 |
| 3 | orchestrator 接入（3 处改动） | 1 | 2 |
| 4 | C 闸验证 | — | 1-3 |

> **注意**：步骤 3 中的 `outputSchema` 校验需要依赖 output-schema-validation-enablement 蓝图（已在另一个蓝图计划书中）。建议先执行 output-schema 蓝图，再执行本蓝图。也可以先执行本蓝图（adaptation 调用 AI 时不传 outputSchema），output-schema 蓝图完成后再补传。
