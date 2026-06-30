# 蓝图计划书：核心记忆系统 — 娱乐性优先的叙事连续性保障

> 版本：v1.2 | 日期：2026-06-22 | 级别：L3（跨系统：memoryLifecycle + foreshadowing + patternManager + orchestrator）
> 基于 `narrative-quality-vs-token-optimization.md` 调研结论。
> v1.1 更新：F2 实施完成 + 全项目字符截断审计 + 违规清单
> v1.2 更新：F1 AI 重要性评分 + F3 NPC 关系图谱 UI + F4 跨存档持久化 + 全项目字符截断修复
> v1.2.1 校正：修正伪代码中已移除的截断写法 + 排序策略描述 + 风险表状态 + 方法名

---

## 一、问题定义

### 1.1 当前系统的叙事断裂

```
100轮后的 AI "记忆"：
  ✓ 记得最近 10 轮的详细摘要
  ✓ 记得最近 25 轮的一个高度压缩段落
  ✗ 完全不记得第 1-50 轮发生了什么
  ✗ 如果第 5 轮被人救过命，第 30 轮收了信物——AI 不知道这个人是谁
  ✗ 伏笔系统知道有伏笔，AI 不知道伏笔对应的上下文
```

`memoryLifecycle.buildRichPrompt` 的均匀截断策略（L1 取最近 2 条，L2~L4 各取最近 1 条）导致"均匀遗忘"：关键事件和琐碎事件被同等遗忘。

### 1.2 设计原则

```
娱乐性 > 叙事连贯性 > Token 优化

关键事件（转折点、盟约、背叛）→ 永远记住
伏笔上下文 → 随伏笔一起注入
NPC 关键互动 → 总是保留
琐碎日常 → 可遗忘
```

---

## 二、总体架构

### 2.1 核心概念：核心记忆（CoreMemory）

```
传统 Prompt 注入（当前）：
┌─────────────────────────────────────────────────┐
│  worldSetting + character + subsystems           │
│  + memorySummary（均匀截断的压缩摘要）              │  ← 一次性全注入
│  + other texts                                   │
└─────────────────────────────────────────────────┘

分层 Prompt 注入（本设计）：
┌─────────────────────────────────────────────────┐
│  第一层：世界框架                                 │
│    worldSetting + character + worldRules          │  ← 不变，KVCache 命中
│                                                   │
│  第二层：永久记忆（CoreMemory）                    │
│    ├─ 关键事件摘要（HIGH importance，不删）        │  ← 新增
│    ├─ 伏笔上下文（种植时的原始摘要）               │  ← 新增
│    └─ NPC 关系网（首次相遇 + 关键互动）            │  ← 新增
│                                                   │
│  第三层：当前快照                                 │
│    subsystems + systemChangeSummary                │  ← 方案 B/C 已优化
│                                                   │
│  第四层：近期记忆（滚动窗口）                       │
│    memorySummary（L1×2 + L2×1 + L3×1 等）         │  ← 保留现状
│    + 最近 5 条原始叙事                              │
│                                                   │
│  第五层：叙事引导                                 │
│    direction + plotStructure + foreshadowing       │  ← 已有
└─────────────────────────────────────────────────┘
```

**不是两次 API 调用，是一次 Prompt 的分层结构化注入。** AI 先读世界框架建立认知，再读永久记忆理解历史脉络，再读当前状态做决策。

### 2.2 新增 PromptContext 字段

| 字段 | 类型 | 数据来源 | Token 估算 |
|------|------|------|:--:|
| `coreMemory` | `string` | CoreMemorySystem 产出 | 3k-8k（动态增长） |
| （已有）`memorySummary` | `string` | memoryLifecycle 产出 | 7k-12k |
| （已有）`foreshadowingText` | `string` | foreshadowing 产出 | 0.5k-2k |

---

## 三、设计详解

### 设计 I：CoreMemorySystem（新子系统）

#### 3.1 职责

收集和维护"不应该被遗忘的记忆"，生产 `coreMemory` 文本注入 Prompt。

#### 3.2 数据来源

##### 3.2.1 关键事件摘要（来自重要性评分 + 压缩摘要）

现有能力复用：
- `memoryLifecycle.rateImportance(narrative)` — 0-1 分数（L349）
- `summaryCompressor.getSummaries()` — 包含所有层级的压缩摘要
- 摘要已有 round 范围，可直接关联到具体时间段

新增逻辑：

```typescript
// 伪代码
buildCoreMemory(summaries, searchIndex): string {
  const highEvents: CoreMemoryEntry[] = []

  // 1. 从搜索索引中提取所有 HIGH 重要性条目（这些永远不会被删除）
  for (const entry of searchIndex) {
    if (entry.maxImportance === 'HIGH') {
      highEvents.push({
        rounds: `${entry.startRound}-${entry.endRound}`,
        importance: 'HIGH',
        content: entry.content,
        tags: entry.tags,
      })
    }
  }

  // 2. 按轮次范围升序排列，保持时间线顺序
  highEvents.sort((a, b) => a.startRound - b.startRound)

  // 3. 构建注入文本
  if (highEvents.length === 0) return ''
  
  const lines: string[] = ['【关键事件记忆】以下事件对你至关重要，请在叙事中保持一致性。']
  for (const event of highEvents) {
    lines.push(`- [第${event.rounds}轮·高重要性] ${event.content}`)
  }
  
  return lines.join('\n')
}
```

**Token 成本分析**：

| 场景 | HIGH 事件数 | 每条 ~200 字 | Token 预算 |
|------|:--:|------|:--:|
| 50 轮凡人 | 3-8 条 | 600-1600字 | ~2k-5k |
| 100 轮强者 | 8-15 条 | 1600-3000字 | ~5k-9k |
| 300 轮大能 | 15-30 条 | 3000-6000字 | ~9k-18k |

**控制策略**：超过 15 条 HIGH 事件时，对最早的事件做 L2 级二次压缩（多条合并为一条），保证 CoreMemory 总 token ≤ 15k。

##### 3.2.2 伏笔上下文注入（现有能力增强）

**当前问题**：`foreshadowing.buildForeshadowingText()`（L351）只注入伏笔标题和回收提示，没有原始上下文。AI 看到：

```
【待回收伏笔】
- [4级·神秘物品] 第 15 轮：捡到一块散发微光的古玉
  回收提示：这可能与某个上古遗迹有关
```

AI 不知道第 15 轮具体发生了什么。是战斗时捡到的？还是探索时发现的？——这些信息在 AI 的"记忆"里已经被 `buildRichPrompt` 截断删除了。

**改进方案**：`foreshadowing.buildForeshadowingText()` 注入伏笔时，附带种植轮次的上下文摘要：

```typescript
buildForeshadowingText(): string {
  // ... 现有计算 scored 逻辑不变 ...

  const lines: string[] = ['【待回收伏笔】（按优先级排列）']

  for (const { record, score } of scored) {
    const typeLabel = FORESHADOWING_TYPE_LABELS[record.type]
    const hint = this.buildResolutionHint(record, score)

    lines.push(`\n▪ [${record.priority}级·${typeLabel}] 第${record.plantedRound}轮：${record.description}`)

    // ⭐ 新增：附带种植上下文
    const context = this.getPlantedContext(record.plantedRound)
    if (context) {
      lines.push(`  种植背景：${context}`)
    }

    if (hint) lines.push(`  回收提示：${hint}`)
  }

  lines.push('\n请在叙事中自然地回收这些伏笔，不要强行植入。')
  return lines.join('\n')
}

/** 从压缩摘要中获取指定轮次的上下文 */
private getPlantedContext(round: number): string | null {
  const summaries = summaryCompressor.getSummaries()
  // 查找覆盖该轮次的 L1 摘要
  const l1 = summaries.summaries.find(
    s => s.level === 1 && s.startRound <= round && s.endRound >= round
  )
  if (l1) return l1.content
  return null
}
```

**数据获取**：`ForeshadowingSystem` 需要访问 `summaryCompressor`。当前 `summaryCompressor` 是一个与其他子系统共享的单例模块（非注入依赖），可以直接 `import`。

**Token 成本**：每条伏笔 +100-200 字（种植背景）≈ 300-600 token。最坏 5 条活跃伏笔 ≈ 1.5k-3k token。**这是记忆系统的关键投资——没有上下文，伏笔回收率会很低。**

##### 3.2.3 NPC 关系网记忆（新能力）

**目标**：保留每个关键 NPC 的"第一次相遇"和"关键互动"，使 AI 不被截断遗忘人物关系。

**数据来源**：
1. `patternManager.extractRelationships(narrative)` — 每轮叙事中提取的人际关系（已有）
2. 在 CoreMemorySystem 中维护一个 `npcMap: Map<string, NPCInteractionRecord[]>`

**实现**：

```typescript
interface NPCInteractionRecord {
  npcName: string
  round: number
  type: 'first_meeting' | 'conflict' | 'alliance' | 'betrayal' | 'marriage' | 'death'
  summary: string
}

class CoreMemorySystem {
  // 每个 NPC 最多保留 5 条关键互动
  private npcMap = new Map<string, NPCInteractionRecord[]>()

  /** 每轮叙事生成后调用 */
  onNarrativeGenerated(narrative: string, round: number): void {
    const relationships = patternManager.extractRelationships(narrative)

    for (const rel of relationships) {
      if (rel.confidence < 0.6) continue // 忽略低置信度

      const npcName = rel.extractedData?.name as string | undefined
      if (!npcName) continue

      const records = this.npcMap.get(npcName) || []

      // 首次相遇：总是记录
      if (records.length === 0) {
        records.push({ npcName, round, type: 'first_meeting', summary: rel.description })
        this.npcMap.set(npcName, records)
        continue
      }

      // 关键互动类型：新增记录
      const type = this.classifyInteraction(rel)
      if (type) {
        records.push({ npcName, round, type, summary: rel.description })
        // 每个 NPC 最多 5 条
        if (records.length > 5) {
          // 保留第一条（相遇）和最近 4 条
          const first = records[0]
          const recent = records.slice(-4)
          this.npcMap.set(npcName, [first, ...recent])
        }
      }
    }
  }

  /** 构建 NPC 关系网文本 */
  buildNPCNetworkText(): string {
    if (this.npcMap.size === 0) return ''

    const lines: string[] = ['【关键人物关系】']

    for (const [name, records] of this.npcMap) {
      const first = records[0]
      const keyInteractions = records.filter(r => r.type !== 'first_meeting')

      lines.push(`\n▸ ${name}`)
      lines.push(`  初次相遇（第${first.round}轮）：${first.summary}`)

      for (const interaction of keyInteractions) {
        const typeLabel = INTERACTION_LABELS[interaction.type] || interaction.type
        lines.push(`  ${typeLabel}（第${interaction.round}轮）：${interaction.summary}`)
      }
    }

    return lines.join('\n')
  }
}
```

**Token 成本**：假设 100 轮中主角遇到 20 个 NPC，其中 5-8 个是关键人物。每个 NPC 2-4 条互动 ≈ 200-400 字/NPC。总计 1k-3k token。

### 设计 II：重要性加权检索增强

#### 3.4 问题

当前 `retrieveFromIndex`（L918）只做关键词+区域匹配。以下场景失效：

```
场景 A：主角一生都在长安（地点不变 → 所有 entry 匹配度相同 → 检索无区分力）
场景 B：当前叙事讲战斗，但检索索引里有"第 20 轮告白了"（HIGH 重要性）→ 关键词不匹配 → 永远检索不到
场景 C：主角看到夕阳，"想起了当年的那个人" → 夕阳 ≠ 当年事件的关键词 → 检索失败
```

#### 3.5 改进

`retrieveFromIndex` 增加 **保底重要性注入**：

```typescript
retrieveFromIndex(queryText: string): string[] {
  // ... 现有关键词+区域匹配逻辑 ...

  // ⭐ 新增：无论关键词是否匹配，HIGH 重要性条目始终有机会被注入
  const highEntries = this.searchIndex.filter(e => e.maxImportance === 'HIGH')
  
  // 从 HIGH 条目中随机挑选 1-2 条尚未注入的
  for (const entry of highEntries) {
    if (!results.some(r => r.entry === entry)) {
      if (Math.random() < 0.3) { // 30% 概率随机触发（模拟"突然想起来"）
        results.push({ entry, score: 5 }) // 基础分 = 5
      }
    }
  }

  // 排序 + 取 top 4（增加 1 个上限以容纳重要性注入）
  results.sort((a, b) => b.score - a.score)
  return results.slice(0, 4).map(r => r.entry.content)
}
```

### 设计 III：CoreMemorySystem 的生命周期

#### 3.6 子系统接口

```typescript
export class CoreMemorySystem implements ISubSystem {
  readonly id = 'core-memory' as const
  readonly mod = 'mod-engine' as const
  readonly label = '核心记忆管理' as const
  readonly description = '管理不应被遗忘的关键事件、伏笔上下文和NPC关系网' as const

  private npcMap = new Map<string, NPCInteractionRecord[]>() // 关系网
  private lastProcessedRound = -1

  // === ISubSystem ===

  collectState(context: RoundContext): SubSystemState {
    // 每轮收集后，分析叙事提取 NPC 关系
    const lastNarrative = context.subsystemStates['orchestrator']?.data?.lastNarrative as string | undefined
    if (lastNarrative && context.round.year !== this.lastProcessedRound) {
      this.onNarrativeGenerated(lastNarrative, context.round.year)
    }

    return {
      id: this.id,
      summary: `核心记忆：${this.npcMap.size}个关键人物`,
      data: {} // 不需要在 subsystem summary 中暴露
    }
  }

  applyChanges(_changes: SubSystemChanges, _context: RoundContext): void {
    // 不接受外部变更
  }

  reset(): void {
    this.npcMap.clear()
    this.lastProcessedRound = -1
  }

  // === 公共 ===

  onNarrativeGenerated(narrative: string, round: number): void { /* ... */ }
  buildCoreMemory(): string { /* ... */ }
  buildNPCNetworkText(): string { /* ... */ }
}
```

#### 3.7 数据流

```
每轮模拟完成后的调用链：

1. orchestrator.generateNarrative() 产出叙事文本
2. narratively → patternManager.extractRelationships() 提取 NPC 关系
3. coreMemorySystem.onNarrativeGenerated() 更新 npcMap
4. memoryLifecycle.scoreImportance() 评分 → 标记 HIGH 事件
5. memoryLifecycle.addToIndex() 添加 HIGH 事件到搜索索引 ← 已有

下一轮 Prompt 组装时：

6. orchestrator.assemblePromptContext()
   ├─ coreMemorySystem.buildCoreMemory()     → coreMemory（关键事件）
   ├─ coreMemorySystem.buildNPCNetworkText()  → 注入到 combinedCustomText
   ├─ foreshadowing.buildForeshadowingText()  → foreshadowingText（已有+增强）
   └─ memoryLifecycle.buildRichPrompt()       → memorySummary（保持现状）
```

---

## 四、实施计划

### 4.1 文件变更清单

| # | 文件 | 改动 | 等级 | 状态 |
|---|------|------|:--:|:--:|
| 1 | `src/mods/mod-engine/subsystems/core-memory-system.ts` | 新建 CoreMemorySystem 子系统 | L3 | ✅ 已实施 |
| 2 | `src/mods/mod-engine/manifest.ts` | 注册 CoreMemorySystem | L3 | ✅ 已实施 |
| 3 | `src/mods/mod-engine/subsystems/orchestrator-system.ts` | `assemblePromptContext` 中调用 `buildCoreMemory()` + `buildNPCNetworkText()` | L3 | ✅ 已实施 |
| 4 | `src/mods/mod-engine/subsystems/memory-lifecycle-system.ts` | `retrieveFromIndex` 增加保底重要性注入 | L2 | ✅ 已实施 |
| 5 | `src/mods/mod-engine/subsystems/foreshadowing-system.ts` | `buildForeshadowingText` 注入 `getPlantedContext()` | L2 | ✅ 已实施 |
| 6 | `src/foundation/types/narrative.types.ts` | PromptContext 新增 `coreMemory` 字段 | L2 | ✅ 已实施 |
| 7 | `src/mods/mod-engine/prompts/narrative-prompt.ts` | Prompt 模板新增 `{{coreMemory}}` 占位符 + variables | L2 | ✅ 已实施 |
| 8 | `src/mods/mod-engine/subsystems/core-memory-system.ts` | F2：`collectHighImportanceEntries` 真合并（AI 摘要替代硬截断） | L2 | ✅ 已实施 |
| 9 | `src/mods/mod-engine/subsystems/core-memory-system.ts` | 字符截断修复：移除 3 处 content.slice(0, N) | L1 | ✅ 已实施 |
| 10 | `src/mods/mod-engine/subsystems/foreshadowing-system.ts` | 字符截断修复：移除 4 处 slice 截断（8/100/200/50字） | L1 | ✅ 已实施 |
| 11 | `src/mods/mod-engine/subsystems/memory-forgetting-system.ts` | 字符截断修复：移除 1 处 description.slice(0, 50) | L1 | ✅ 已实施 |
| 12 | `src/mods/mod-engine/subsystems/memory-lifecycle-system.ts` | F1：新增 AI 重要性标注 + `setAIRoundImportance` + `scoreImportance` 优先使用 AI 判断 | L3 | ✅ 已实施 |
| 13 | `src/mods/mod-engine/prompts/narrative-prompt.ts` | F1：System Prompt 新增 `importance` 可选字段说明 | L3 | ✅ 已实施 |
| 14 | `src/mods/mod-engine/subsystems/orchestrator-system.ts` | F1：`handleNarrativeResponse` 中提取 AI importance 传给 memoryLifecycle | L3 | ✅ 已实施 |
| 15 | `src/mods/mod-engine/store.ts` | F4：新增 `coreMemoryNpcMap` 持久化字段 + `setCoreMemoryNpcMap` setter | L2 | ✅ 已实施 |
| 16 | `src/mods/mod-engine/subsystems/core-memory-system.ts` | F4：`syncToStore()` / `restoreFromStore()` 跨存档序列化 | L2 | ✅ 已实施 |
| 17 | `src/mods/mod-ui/components/organisms/NPCRelationshipPanel.tsx` | F3：新建 NPC 关系图谱可视化组件 | L2 | ✅ 已实施 |
| 18 | `src/mods/mod-ui/components/organisms/index.ts` | F3：Barrel export 注册 NPCRelationshipPanel | L1 | ✅ 已实施 |

### 4.2 执行顺序

```
Phase 1: 回忆增强（不新增子系统，改现有系统）                          [✅ 已完成]
  步骤 1: foreshadowing 上下文注入
  步骤 2: retrieveFromIndex 保底重要性注入
  → 验证：npx tsc --noEmit 0 error, npm run lint 0 error 0 warning

Phase 2: CoreMemorySystem（新子系统）                                   [✅ 已完成]
  步骤 3: 创建 core-memory-system.ts + manifest 注册
  步骤 4: NPC 关系网记忆 + 关键事件摘要
  步骤 5: orchestrator 接线
  → 验证：完整回归测试通过（tsc + lint + check-format）

Phase 3: 分层 Prompt 注入                                               [✅ 已完成]
  步骤 6: 调整 prompt builder 模板变量，将 coreMemory 放在 memorySummary 之后

Phase 4: F2 二次压缩修正                                                [✅ 已完成]
  步骤 7: 修复 collectHighImportanceEntries 伪合并（假截断 → 真合并）
  步骤 8: 修复合并中的硬截断违规（80字slice → AI压缩摘要替代）
  → 验证：tsc 0 error, lint 0 error 0 warning

Phase 5: 字符截断违规修复（7 处）                                         [✅ 已完成]
  步骤 9-11: 移除 core-memory-system（3处）、foreshadowing-system（3处）、memory-forgetting-system（1处）硬截断
  → 验证：tsc 0 error, lint 0 error 0 warning

Phase 6: F1 AI 重要性评分                                                [✅ 已完成]
  步骤 12: memory-lifecycle-system 新增 aiImportanceMap + setAIRoundImportance + scoreImportance 三层 AI 优先判断
  步骤 13: narrative-prompt 新增 importance 可选字段说明
  步骤 14: orchestrator handleNarrativeResponse 提取 AI importance
  → 验证：tsc 0 error, lint 0 error 0 warning

Phase 7: F4 跨存档持久化 + F3 NPC 关系图谱                              [✅ 已完成]
  步骤 15: store.ts 新增 coreMemoryNpcMap 持久化字段
  步骤 16: core-memory-system syncToStore/restoreFromStore 双向同步
  步骤 17: NPCRelationshipPanel 组件 + index.ts barrel export
  → 验证：tsc 0 error, lint 0 error 0 warning
```

### 4.3 F2 实施详情：真合并策略

**问题**：v1.0 实施中 `collectHighImportanceEntries` 超过 15 条时使用 `entries.slice(-15)` 直接丢弃早期事件，注释写"二次合并"但代码是假合并。

**修复（两轮）**：

**第一轮**（实现真合并，但引入了硬截断违规）：
```typescript
// 将溢出事件取前 80 字 + 分号连接 → ❌ 违反项目规范"严禁强制截断"
overflow.map((e) => e.content.slice(0, 80)).join('；')
```

**第二轮**（移除硬截断，改用 AI 压缩摘要）：
```typescript
// buildMergedSummary() 从 summaryCompressor 获取已有的 AI 压缩摘要
// 筛选覆盖溢出区间的 L2/L3 摘要 → 逐条拼接完整段落
// 零字符裁切：每段是 AI 生成的完整叙事段落
```

**最终策略**：
- 最近 12 条完整保留（每条 ≤300 字）
- 溢出事件区间 → 查找 `summaryCompressor.getSummaries()` 中覆盖该区间的 L2/L3 摘要
- 摘要按层级（L2 优先于 L3）+ 时间排列，不做字符截断
- 摘要不可用时降级为占位文本

### 4.4 回滚策略

| Phase | 回滚方式 |
|-------|----------|
| Phase 1 | 还原 `foreshadowing-system.ts` 和 `memory-lifecycle-system.ts` |
| Phase 2 | 清单中移除 `core-memory-system` 注册，删除文件 |
| Phase 3 | 模板中移除 `{{coreMemory}}` 变量 |

---

## 五、成本与收益分析

### 5.1 Token 成本增量

| 新增内容 | 50 轮 | 100 轮 | 300 轮 | 上限控制 |
|----------|:-----:|:------:|:------:|----------|
| 关键事件摘要（HIGH） | 2k | 5k | 9k | >15条 → L2 二次压缩 |
| 伏笔上下文 | 0.3k | 1k | 2k | 最多 5 条活跃伏笔 |
| NPC 关系网 | 0.5k | 1.5k | 3k | 每 NPC 最多 5 条，总 NPC ≤ 20 |
| **合计增量** | **~3k** | **~7.5k** | **~14k** | 硬上限 18k |

对比当前 `memorySummary` 的 7k-12k：每次 Prompt 增加约 50%-100% token。**但这是值得的投入——没有记忆的 AI 产出的叙事必然破碎。**

以 DeepSeek 价格（$0.28/M input tokens）计算：

| 轮次 | 每轮 token | 每轮成本 | 100 轮总成本 |
|:----:|:---------:|:------:|:----------:|
| 当前 | ~15k | $0.004 | $0.42 |
| + CoreMemory | ~22k | $0.006 | $0.62 |
| 当前 | ~20k | $0.006 | $0.56 |
| + CoreMemory | ~30k | $0.008 | $0.84 |

**单次增加 $0.002，100 轮增加 $0.20。用户为 AI "记住故事"支付的价格。**

### 5.2 叙事质量预期提升

| 指标 | 当前 | 改进后 | 改进机制 |
|------|:--:|:--:|------|
| 伏笔回收率 | 低（上下文缺失） | 中-高 | 伏笔上下文注入 |
| 人物一致性 | 50轮后开始衰减 | 100轮+保持 | NPC 关系网记忆 |
| 因果链条 | 50轮内连贯 | 全周期连贯 | 关键事件摘要 |
| 回忆/闪回触发 | 仅地点驱动 | 重要性+随机 | 保底重要性检索 |
| 长线叙事 | 依赖方向系统硬控 | 记忆系统+方向协同 | 分层注入 |

---

## 六、验证方案

### 6.1 编译 + 类型

```bash
npx tsc --noEmit     # 0 error
npm run lint         # 0 error, 0 warning
```

### 6.2 功能验证

| 验证项 | 方法 | 预期 |
|--------|------|------|
| CoreMemory 非空 | 运行 50 轮模拟 → 检查 Prompt 中 `coreMemory` 字段 | 包含 ≥ 3 条关键事件 + NPC 关系 |
| 伏笔上下文注入 | 检查模拟日志中 `foreshadowingText` | 每条活跃伏笔附带"种植背景" |
| 检索回忆触发 | 在非地点相关叙事中，检查检索命中 | HIGH 事件以 ~30% 概率被注入 |
| 人物记忆持久 | 100 轮后检查 `npcMap.size` | ≥ 5 个 NPC 保留互动记录 |
| 不影响现有 | 运行完全相同的模拟参数，对比叙事质量 | 无明显退化 |

---

## 七、风险与降级

| 风险 | 概率 | 影响 | 降级措施 |
|------|:--:|------|----------|
| NPC 关系网过度增长 | 中 | CoreMemory token 超预算 | 每 NPC 最多 5 条，总 NPC ≤ 20 |
| 重要性评分不准确 | 中 | 琐事被标记为 HIGH | 已实施 F1：`scoreImportance` 优先使用 AI 判断，关键词做底层防线 |
| 伏笔上下文注入冗余 | 低 | Prompt 增加 1-2k token | 如果伏笔数 > 3，只注入 top 3 的上下文 |
| 分层注入打乱 AI 注意力 | 低 | AI 花更多 token 在历史而非当前 | 明确标注分割线（`### 当前事件 ###`），视觉引导 AI 聚焦 |
| L2/L3 摘要不可用 | 低 | 溢出事件合并为占位文本 | `summaryCompressor` 每 25 轮生成一次 L2，极端情况（前 25 轮内超 15 条 HIGH）才可能无摘要 |

## 七-B、字符截断违规审计

> 项目规范明确禁止强制字符截断（`slice(0, N)` 对内容文本）。本节审计全项目 src/ 目录。

### 需修复（内容语义截断，影响叙事质量）

| 文件 | 行号 | 截断代码 | 问题 |
|------|:--:|------|------|
| [core-memory-system.ts](file:///d:/AI/ai-life-sim/src/mods/mod-engine/subsystems/core-memory-system.ts#L229) | 229, 251 | `content.slice(0, 300)` | searchIndex 的 content 已是压缩摘要，再切 300 字多余 |
| [core-memory-system.ts](file:///d:/AI/ai-life-sim/src/mods/mod-engine/subsystems/core-memory-system.ts#L304) | 304 | `join('').slice(0, 80)` | NPC 互动标签拼接后硬截 80 字 |
| [foreshadowing-system.ts](file:///d:/AI/ai-life-sim/src/mods/mod-engine/subsystems/foreshadowing-system.ts#L327) | 327 | `description.slice(0, 8)` | 只用前 8 字做伏笔回收匹配，极易误匹配 |
| [foreshadowing-system.ts](file:///d:/AI/ai-life-sim/src/mods/mod-engine/subsystems/foreshadowing-system.ts#L330) | 330 | `narrative.slice(0, 100)` | 回收叙事只存 100 字，丢失上下文 |
| [foreshadowing-system.ts](file:///d:/AI/ai-life-sim/src/mods/mod-engine/subsystems/foreshadowing-system.ts#L399) | 399 | `content.slice(0, 200)` | 伏笔种植背景只取 200 字 |
| [foreshadowing-system.ts](file:///d:/AI/ai-life-sim/src/mods/mod-engine/subsystems/foreshadowing-system.ts#L416) | 416 | `description.slice(0, 50)` | 伏笔描述只留 50 字 |
| [memory-forgetting-system.ts](file:///d:/AI/ai-life-sim/src/mods/mod-engine/subsystems/memory-forgetting-system.ts#L202) | 202 | `description.slice(0, 50)` | 同上 |

### 不需要修复（日志保护/UI展示/日期格式化）

| 类别 | 数量 | 说明 |
|------|:--:|------|
| 日志截断 | 16 处 | `slice(0, 5000)` 级别，纯防御性保护，不影响 AI 内容质量 |
| UI 展示截断 | 12 处 | 卡片/按钮/地图上的文字显示，不传给 AI |
| 日期格式化 | 4 处 | `toISOString().slice(0, 10)` 标准 YYYY-MM-DD 模式 |

### 修复原则

- 不得使用任何形式的 `content.slice(0, N)` 对 AI 输入/输出内容做硬截断
- 如需限制长度，使用已有的 AI 压缩摘要（`summaryCompressor.getSummaries()`）替代
- 日志/UI 层的截断不属于违规（不发生内容丢失，仅展示保护）

---

## 八、后续迭代

| # | 方向 | 依赖当前设计 | 状态 |
|---|------|:--|:--:|
| F1 | AI 驱动的叙事重要性评分（替代关键词匹配） | CoreMemory 已建立重要性→记忆的链路 | ✅ 已完成 |
| F2 | 动态二次压缩（HIGH 事件过多时自动合并） | CoreMemory 的 15 条阈值触发 | ✅ 已完成 |
| F3 | 角色关系图谱可视化（UI 展示 npcMap） | CoreMemory 维护的 npcMap 数据 | ✅ 已完成 |
| F4 | 跨存档角色记忆（NPC 关系网持久化到 localStorage） | npcMap↔useEngineStore 双向同步 | ✅ 已完成 |
| F5 | Two-pass API 调用（先读记忆再生成叙事） | 已实现分层结构，切换只需加一次 API 调用 | ⬜ 待实施（远期） |

### 旧项目玩家反馈——已在新项目中根除的风险

| 旧项目问题 | 旧项目根因 | 新项目对应状态 |
|------|----------|------|
| 遗迹/共振/地震类事件重复 | 固定 `GAME_EVENT_PRESETS` 事件池 + 无去重 + 高事件权重 | 无固定事件池，CoreMemory 去重抑制重复，伏笔系统有上限控制 |
| 压力莫名其妙/乱套 | `conflict-cycle-system` 全自动状态机 + 7/10 负面事件检测 | 已移除，改为 `PlotStructureSystem` 情节结构引导 |
| 100轮+ 早期历史遗忘 | `buildRichPrompt` 均匀截断 | CoreMemory 永久记忆 + 检索保底注入 + F2 真合并 |

---

## 九、总结

```
┌─────────────────────────────────────────────────┐
│                                                   │
│  当前：AI 是金鱼——每 10 轮刷新一次记忆              │
│  目标：AI 是老者——重要的事件永远记得                │
│                                                   │
│  方案：不是多调用一次 AI                            │
│        而是在同一个 Prompt 里注入记忆分层            │
│                                                   │
│  成本：每轮 +0.002 美金                            │
│  收益：叙事连贯性、伏笔回收率、人物一致性            │
│                                                   │
└─────────────────────────────────────────────────┘
```

**不选择 Two-pass API 的原因**：两次 API 调用意味着 token 翻倍 + 延迟翻倍。分层注入（一次 Prompt 分块组织）在不增加 API 调用次数的前提下，通过结构化信息编排达到了相同的效果。当角色寿命超过 500 轮、CoreMemory 超过 15k token 时，可以升级为 Two-pass。
