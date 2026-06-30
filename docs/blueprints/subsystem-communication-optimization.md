# 蓝图：子系统联动计算优化 & 安全加固

> 版本：v1.0 | 日期：2026-06-18 | 级别：L3（涉及架构调整）

---

## 一、背景

### 1.1 当前架构概要

```
每回合 14 步管线：
  1. 推进时间
  2. 本地模拟推进 (subsystem.advance)     ← 纯规则计算
  3. 收集全部子系统状态 (collectState)     ← 产出 summary + data
  4. 事件检测 → 生命周期追踪               ← 10维度
  5. 跨域联动 (关键词匹配规则)              ← 5条规则
  3'. 重新收集状态
  6. 组装 PromptContext → 全部子系统 summary 注入
  7. 构建分段 Prompt
  8. 调用 AI (流式)
  9. 解析响应 → 分发 changes 到子系统
  10. 叙事后处理 (连锁反应 + 寿命)
  11. 世界方向修正
  12. 死亡检测
  13. 叙事压缩
  14. 自动保存
```

### 1.2 已识别的问题

| # | 问题 | 严重度 | 影响范围 |
|---|------|--------|----------|
| P1 | AI 不清楚各子系统的可修改字段，changes 不够精确 | 中 | 叙事→数值转化的准确性 |
| P2 | collectState 执行顺序隐式依赖注册顺序，读到旧值 | 高 | 所有依赖其他子系统的计算 |
| P3 | 跨域联动纯关键词匹配，语义相近但词不同会漏判 | 中 | 跨系统连锁反应 |
| P4 | change.id 不匹配时静默失败，无日志 | 低 | 调试困难 |
| P5 | 跨域联动新事件延迟一回合才注入 Prompt | 低 | AI 对当前事件感知延迟 |
| P6 | 无 NaN/Infinity 安全防护 | 高 | 数值污染扩散 |

---

## 二、优化目标

1. **AI 输出更精确**：AI 能针对具体子系统的具体字段返回精确 changes
2. **执行顺序可验证**：子系统间数据依赖有显式声明和拓扑校验
3. **跨域联动更鲁棒**：减少漏判，事件不延迟
4. **安全兜底**：NaN/Infinity 不扩散
5. **可观测性**：异常可追踪、可定位

---

## 三、分项方案

### 方案 A：Prompt 增强 — AI 精确输出 changes（P1）

**改动范围**：
- `src/mods/mod-engine/prompts/narrative-prompt.ts` — 新增子系统字段说明块
- 新建 `src/mods/mod-engine/helpers/subsystem-field-registry.ts` — 集中维护字段元数据

**具体方案**：

1. 新建 `subsystem-field-registry.ts`，导出每个子系统的可变更字段说明：

```typescript
export const SUBSYSTEM_FIELD_MAP: Record<string, {
  label: string
  fields: Record<string, string>  // 字段名 → 说明
}> = {
  'health': {
    label: '健康',
    fields: {
      'hpDelta': 'HP变化量（正=恢复，负=受伤），范围 -50 ~ +20',
      'staminaDelta': '体力变化量',
      'spiritDelta': '精神变化量',
      'addDiseases': '新增疾病 [{name, severity}]',
      'addInjuries': '新增伤势 [{name, severity}]',
    }
  },
  'economy': {
    label: '经济',
    fields: {
      'wealth': '财富变化量',
      'priceIndex': '物价指数，100=正常',
      'activityLevel': '经济活动水平 0~1',
      'socialClass': '社会阶层 noble/commoner/peasant/merchant/cultivator',
    }
  },
  // ... 其余子系统
}
```

2. 在 `narrative-prompt.ts` 的 userPromptTemplate 末尾追加：

```
【可变更的子系统字段】
{{subsystemFields}}

请根据叙事内容，为所有受影响的子系统生成 changes。
每个 change 的 changes 字段应使用上述对应的字段名和值。
```

3. 在 `assemblePromptContext()` 中生成 `subsystemFields` 变量。

**风险**：
- 字段说明会增加 Prompt 长度（估算 ~500-1500 tokens）
- 如果字段说明放在可变部分，会略微减少 KV Cache 命中（放在稳定前缀部分则不影响）

**验证方式**：
- 对比优化前后 AI 返回的 changes 数量和质量
- 检查 changes 字段是否与字段说明一致

---

### 方案 B：collectState 拓扑排序（P2）

**改动范围**：
- `src/foundation/types/subsystem.types.ts` — ISubSystem 接口新增可选 `dependsOn?: string[]`
- `src/mods/mod-engine/subsystems/orchestrator-system.ts` — 注册时校验 + 执行时拓扑排序
- 各子系统 manifest — 逐步补全 `dependsOn` 声明

**具体方案**：

1. ISubSystem 接口新增：

```typescript
export interface ISubSystem {
  // ... 现有字段
  /** 依赖的其他子系统 ID（collectState 时需要先于自己执行） */
  dependsOn?: string[]
}
```

2. 编排器注册时校验：

```typescript
registerSubsystem(subsystem: ISubSystem): void {
  // 现有逻辑...
  if (subsystem.dependsOn?.length) {
    for (const depId of subsystem.dependsOn) {
      if (!this.subsystems.some(s => s.id === depId)) {
        console.warn(`[Orchestrator] ${subsystem.id} 依赖 ${depId}，但 ${depId} 尚未注册`)
      }
    }
  }
}
```

3. collectState 执行时拓扑排序：

```typescript
private topologicalSort(): ISubSystem[] {
  const sorted: ISubSystem[] = []
  const visited = new Set<string>()
  
  function visit(sub: ISubSystem, path: Set<string>) {
    if (path.has(sub.id)) throw new Error(`循环依赖: ${[...path]}`)
    if (visited.has(sub.id)) return
    path.add(sub.id)
    for (const depId of sub.dependsOn ?? []) {
      const dep = this.subsystems.find(s => s.id === depId)
      if (dep) visit(dep, path)
    }
    path.delete(sub.id)
    visited.add(sub.id)
    sorted.push(sub)
  }
  
  for (const sub of this.subsystems) visit(sub, new Set())
  return sorted
}
```

**风险**：
- 需要逐个子系统补充 `dependsOn`，初始阶段可能不完整
- 拓扑排序检测到循环依赖时抛出，可能导致回合中断 → 应降级为 warn + 回退到注册顺序

**验证方式**：
- 人工审查各子系统的 `dependsOn` 是否正确
- 检测到循环依赖时控制台可见警告

---

### 方案 C：跨域联动语义增强（P3）

**改动范围**：
- `src/mods/mod-engine/helpers/cross-domain-rules.ts`

**具体方案**：

在现有关键词匹配基础上，增加 AI 输出事件作为补充触发源：

步骤 5 改为：

```
1. 从 AI 上轮输出的 notableEvents 提取关键事件 ← 新增
2. 从 eventLifecycle 提取活跃事件              ← 现有
3. 两类事件合并 → 构建 DomainEvent → 规则匹配
```

代码修改：

```typescript
// 新增：从 AI notableEvents 提取 DomainEvent
private buildEventsFromNotable(notableEvents: string[]): DomainEvent[] {
  return notableEvents.map(desc => ({
    type: 'ai-narrative',
    sourceCategory: 'narrative',
    description: desc,
    severity: 'major',
  }))
}
```

另外，将关键词匹配从精确匹配改为包含匹配：

```typescript
// 现有：eventTypePattern 精确匹配
// 优化：eventTypePattern 支持正则 + 描述子串匹配
function matchesRule(event: DomainEvent, rule: EventBusRule): boolean {
  const desc = event.description + ' ' + (event.context ?? '')
  return rule.triggers.some(trigger => desc.includes(trigger))
}
```

**风险**：
- AI 的 notableEvents 可能不准确或遗漏
- 关键词放宽后可能误触发

**验证方式**：
- 对比优化前后跨域联动触发次数
- 人工抽查触发是否合理

---

### 方案 D：静默失败日志（P4）

**改动范围**：
- `src/mods/mod-engine/subsystems/orchestrator-system.ts` — `applyRoundChanges()`

**具体方案**：

```typescript
applyRoundChanges(changes: SubSystemChanges[]): void {
  const context = this.buildRoundContext()
  for (const change of changes) {
    if (!change.id) {
      console.warn('[Orchestrator] AI 返回了空 id 的 change:', change.description)
      continue
    }
    const sub = this.subsystems.find((s) => s.id === change.id)
    if (!sub) {
      console.warn(`[Orchestrator] 未知子系统 "${change.id}"，变更被忽略:`, change.description)
      continue
    }
    try {
      sub.applyChanges(change, context)
    } catch (e) {
      console.error(`[Orchestrator] 应用变更到 ${change.id} 失败:`, e, change)
    }
  }
}
```

仅增加 `console.warn`，无架构影响，零风险。

---

### 方案 E：跨域联动事件不延迟（P5）

**改动范围**：
- `src/mods/mod-engine/subsystems/orchestrator-system.ts` — `executeRound()`

**具体方案**：

在步骤 5 跨域联动后，重新执行事件检测（步骤 4），确保新事件注入当前轮 Prompt：

```
4. 事件检测 → eventInjectionText
5. 跨域联动 → applyRoundChanges() → 
   ├─ if (eventInjectionText || 跨域联动产生了变更):
   │    5a. 重新 collectSubsystemStates()
   │    5b. 重新事件检测 → 更新 eventInjectionText   ← 新增
   └─ else: 仅重新 collectSubsystemStates()
```

**风险**：
- 额外一轮事件检测开销（约 1-2ms，可忽略）
- 事件检测可能重复 → 需要 lifecycle 追踪去重

**验证方式**：
- 跨域联动产生事件后，检查当前轮 Prompt 是否包含新事件

---

### 方案 F：NaN/Infinity 安全防护（P6）

**改动范围**：
- 新建 `src/mods/mod-engine/helpers/system-safety.ts`
- `src/mods/mod-engine/subsystems/orchestrator-system.ts` — 在 `applyRoundChanges` 和 `collectSubsystemStates` 中调用

**具体方案**：

```typescript
// system-safety.ts
export function sanitizeValue(v: unknown, path: string): unknown {
  if (typeof v === 'number') {
    if (Number.isNaN(v)) {
      console.warn(`[Safety] NaN detected at ${path}, replaced with 0`)
      return 0
    }
    if (!Number.isFinite(v)) {
      console.warn(`[Safety] Infinity detected at ${path}, clamped`)
      return v > 0 ? Number.MAX_SAFE_INTEGER : Number.MIN_SAFE_INTEGER
    }
  } else if (Array.isArray(v)) {
    return v.map((item, i) => sanitizeValue(item, `${path}[${i}]`))
  } else if (v && typeof v === 'object') {
    const result: Record<string, unknown> = {}
    for (const [key, val] of Object.entries(v as Record<string, unknown>)) {
      result[key] = sanitizeValue(val, `${path}.${key}`)
    }
    return result
  }
  return v
}

export function sanitizeChanges(changes: SubSystemChanges[]): SubSystemChanges[] {
  return changes.map(c => ({
    ...c,
    changes: sanitizeValue(c.changes, c.id) as Record<string, unknown>,
  }))
}
```

在 `applyRoundChanges()` 调用前加一层：

```typescript
const sanitized = sanitizeChanges(changes)
this.applyRoundChanges(sanitized)
```

在 `collectSubsystemStates()` 调用后加校验：

```typescript
for (const [id, state] of Object.entries(states)) {
  const sanitized = sanitizeValue(state.data, `${id}.data`)
  if (sanitized !== state.data) {
    states[id] = { ...state, data: sanitized as Record<string, unknown> }
  }
}
```

**风险**：零运行风险（仅做数值清洗，不改变合法数值）

---

## 四、实施计划

### 阶段 1：零风险修复（可直接执行）

| 序号 | 方案 | 改动量 | 工期 |
|------|------|--------|------|
| 1 | P4 — 静默失败日志 | 5 行代码 | 10 分钟 |
| 2 | P6 — NaN/Infinity 安全防护 | ~60 行新文件 + 2 处调用 | 30 分钟 |

### 阶段 2：增强优化（需验证）

| 序号 | 方案 | 改动量 | 工期 |
|------|------|--------|------|
| 3 | P5 — 跨域联动事件不延迟 | ~15 行改动 | 20 分钟 |
| 4 | P3 — 跨域联动语义增强 | ~30 行改动 | 30 分钟 |
| 5 | P2 — collectState 拓扑排序 | 接口 + 编排器 约 50 行 | 1 小时 |
| 6 | P1 — Prompt 增强 | 新文件 ~100 行 + Prompt 约 20 行 | 1.5 小时 |

### 实施依赖图

```
阶段 1 (无依赖)
├── P4 (独立)
└── P6 (独立)
     ↓
阶段 2
├── P5 (独立)
├── P3 (依赖 P5 — 共享事件检测逻辑)
├── P2 (独立)
└── P1 (独立 — 但需先踩坑 P2 中子系统字段信息)
```

---

## 五、预期效果

| 指标 | 当前 | 优化后 |
|------|------|--------|
| AI 每轮返回的 changes 数量 | ~2-3 条 | 预期 4-8 条 |
| changes 字段与子系统匹配率 | 部分不匹配 | 接近 100% |
| collectState 读取旧值 | 静默发生 | 拓扑排序保证顺序 |
| 跨域联动漏判率 | 约 30%（估算） | < 15% |
| NaN 污染扩散 | 无限扩散 | 自动拦截 |
| 异常可追踪性 | 低（静默失败） | 高（console.warn 可见） |

---

## 六、回滚方案

所有改动均为独立文件或独立函数，回滚方式：

- **P1/P2/P3/P5**：还原单个文件
- **P4/P6**：还原 `orchestrator-system.ts` 的函数
- 无需数据迁移，零持久化变更

---

## 七、风险总览

| 风险 | 等级 | 缓解措施 |
|------|------|----------|
| Prompt 长度增加导致 token 消耗上升 | 低 | 字段说明放在稳定前缀，不增 cache miss |
| 拓扑排序发现循环依赖导致中断 | 中 | 降级为 warn + 回退注册顺序 |
| AI notableEvents 不准确 | 低 | 仅作为补充触发源，不替代关键词匹配 |
| AI 返回非法字段名/值 | 低 | P6 安全层兜底 + P4 日志追踪 |

---

## 八、已确认决策

| # | 决策项 | 结论 | 日期 |
|---|--------|------|------|
| D1 | 分阶段执行 | ✅ 阶段 1（P4+P6）→ 阶段 2（P5+P3+P2+P1） | 2026-06-18 |
| D2 | P1 覆盖范围 | ✅ 按影响力分级，先覆盖核心系统（personal+town 级，约 16 个），再逐步扩展 | 2026-06-18 |
| D3 | P2 dependsOn | ✅ ISubSystem 加可选 `dependsOn?: string[]`，逐步补全 | 2026-06-18 |
| D4 | 影响力分级接入 | ✅ 将 `SubsystemRelevanceSystem.getRelevantStates()` 接入 `assemblePromptContext()` | 2026-06-18 |
| D5 | 频率过滤架构 | ✅ 分布式 — 见下方「方案 G」 | 2026-06-18 |
| D6 | 缩写方案 | ✅ 2-3 字母英文缩写（如 eco/hp/cult），不照搬单汉字 | 2026-06-18 |
| D7 | 方案 H — 元数据分布式 | ✅ 子系统自声明 ageWindow/socialClasses/influenceScope 等 | 2026-06-18 |
| D8 | 方案 I — 跨域联动分布 | ✅ 目标子系统自声明 crossDomainActions | 2026-06-18 |
| D9 | 方案 J — 世界方向分布 | ✅ 子系统自声明 worldDirectionMapping | 2026-06-18 |
| D10 | 方案 K — 世界观规则分布 | ✅ manifest 加 worldRules（低优先级，阶段 3） | 2026-06-18 |
| D11 | P2+H+J 合并 | ✅ 一次改 ISubSystem 接口，覆盖 dependsOn + 频率 + 元数据 + 世界方向 | 2026-06-18 |
| D12 | 不改造项 | ❌ register-subsystems / event-lifecycle / post-narrative / provider-config 保持集中 | 2026-06-18 |

---

## 九、新增方案 G：子系统频率过滤（分布式）

### 9.1 架构决策：分布式 vs 集中式

| 方案 | 频率定义位置 | 优点 | 缺点 |
|------|-------------|------|------|
| **集中式**（废弃项目做法） | 编排器内一个大字典 | 统一审计、调优集中 | 子系统改名/新增后编排器可能忘更新→静默丢失数据 |
| **分布式**（推荐） | 每个子系统自身声明 | 随子系统自动发现，无同步风险；MOD 开发者自己管理 | 需要遍历时才统计全局视图 |

**结论：分布式更适合当前项目**，因为：
1. 项目已有 MOD 自动发现机制（`registerAllSubsystems` 遍历 manifests → 动态 import）
2. 新增/修改子系统时频率跟着走，编排器零维护
3. 符合"子系统管自己，编排器管调度"的设计原则

### 9.2 实现方案

在 `ISubSystem` 接口新增可选字段：

```typescript
export interface ISubSystem {
  // ... 现有字段
  dependsOn?: string[]
  /** 本轮数据注入 AI Prompt 的频率（默认 'always'） */
  frequency?: 'always' | 'change' | 3 | 5 | 10
}
```

各子系统声明：

```typescript
class EconomySystem implements ISubSystem {
  frequency = 'change'   // 仅变化时传给 AI
}

class HealthSystem implements ISubSystem {
  frequency = 'always'   // 每轮传给 AI
}

class ClimateSystem implements ISubSystem {
  frequency = 5          // 每 5 轮传给 AI
}
```

编排器在 `assemblePromptContext()` 中自动过滤：

```typescript
// 遍历所有子系统，由 frequency 决定是否注入本轮 Prompt
for (const [id, state] of Object.entries(lastSubsystemStates)) {
  const sub = subsystems.find(s => s.id === id)
  if (!sub) continue
  
  switch (sub.frequency ?? 'always') {
    case 'always':
      summaries.push(state.summary); break
    case 'change':
      if (hasChangedSince(id, currentRound)) summaries.push(state.summary); break
    case 3: case 5: case 10:
      if (currentRound % sub.frequency === 0) summaries.push(state.summary); break
  }
}
```

### 9.3 频率值语义

| 值 | 含义 | 适用场景 |
|----|------|----------|
| `'always'` | 每轮注入 | 核心系统（健康、寿命、基础属性） |
| `'change'` | 仅变化时注入 | 经济、修炼、声望 — 不变时对 AI 无意义 |
| `3` | 每 3 轮注入 | 关系、市场 — 不太可能每轮剧变 |
| `5` | 每 5 轮注入 | 势力、气候 — 变化缓慢 |
| `10` | 每 10 轮注入 | 历史动态、灾难 — 宏观长期 |

### 9.4 与现有滑动窗口的关系

`SubsystemRelevanceSystem` 已有的 `SLIDING_WINDOW_SIZE = 3` 与 `frequency` 互补：
- `frequency` 决定"是否注入本轮 Prompt"
- 滑动窗口决定"注入时比较前几轮是否变化"

两者同时生效，双重过滤。

---

## 十、分布式改造补充方案

> 以下来自全项目集中式模式扫描，仅列入**可改造**的项目。

### 方案 H：ISubSystem 自声明元数据（合并进 P2）

**涉及集中式代码**：`subsystem-relevance-system.ts` 的 6 个硬编码字典（AGE_THRESHOLDS、CLASS_RELEVANT_SYSTEMS、FACTION_RELEVANT_SYSTEMS、INFLUENCE_SCOPE_SYSTEMS、POWER_SOURCE_SUBSYSTEMS、ALWAYS_RELEVANT）

**问题**：当新增子系统时，必须在这 6 个字典中同步登记，否则子系统永远不会被 AI 看到。

**改造方向**：将这些信息从"引擎维护的字典"改为"子系统自身声明"。

在 `ISubSystem` 接口新增：

| 字段 | 类型 | 含义 | 不声明时的默认行为 |
|------|------|------|-------------------|
| `ageWindow` | `{ min?: number; max?: number }` | 角色到达此年龄范围才可见 | 不限年龄 |
| `socialClasses` | `string[]` | 角色处于这些阶层时可见 | 所有阶层可见 |
| `factionTypes` | `string[]` | 角色属于这些势力时可见 | 所有势力可见 |
| `influenceScope` | `'personal' \| 'town' \| 'region' \| 'continent' \| 'world'` | 角色力量达到此等级才可见 | `'personal'` |
| `alwaysRelevant` | `boolean` | 是否始终注入 Prompt（不受任何过滤影响） | `false` |
| `powerContribution` | `(data: Record<string, unknown>) => number` | 对角色力量值的贡献计算 | 0 |

引擎的 `SubsystemRelevanceSystem` 从查询 `sub.metadata` 替代查询 `AGE_THRESHOLDS[id]`。

**风险**：接口字段增加后，需逐步为 74 个子系统补充声明，不声明的系统行为不变（默认全部可见）。

---

### 方案 I：跨域联动规则参数分布（新独立方案）

**涉及集中式代码**：`cross-domain-rules.ts` 的 5 条规则，每条直接硬编码目标子系统的参数值。

**问题**：规则知道"生态灾难时 population 减 5"，但 population 系统自身应该决定"灾难来了我减多少"。

**改造方向**：目标子系统声明自己接受的跨域动作及参数，引擎只负责匹配触发和分发。

在 `ISubSystem` 接口新增：

| 字段 | 类型 | 含义 |
|------|------|------|
| `crossDomainActions` | `Record<string, Record<string, unknown>>` | key=动作名，value=默认参数 |

示例：

```typescript
// population 系统声明自己的跨域动作
class PopulationSystem implements ISubSystem {
  crossDomainActions = {
    'disaster-impact': {
      total: -5,
      description: '灾难导致人口减少'
    },
    'refugee-influx': {
      total: 3,
      migrationDirection: 'inward',
      description: '难民涌入'
    },
  }
}
```

引擎规则从"知道参数"变为"只匹配触发 → 调用目标声明的动作"。

**改造范围**：
- `ISubSystem` 加 `crossDomainActions`
- `cross-domain-rules.ts` 规则从 `{ params: {...} }` 改为 `{ action: 'action-name' }`
- 编排器执行时从目标子系统获取参数

---

### 方案 J：世界方向映射分布（合并进 P2）

**涉及集中式代码**：`orchestrator-system.ts` 的 `applyWorldDirection()` 中 6 个硬编码分支。

**问题**：AI 说"市场繁荣"，编排器需要知道该通知哪个子系统、修改什么字段。目前靠 6 个 if-else 硬编码。

**改造方向**：子系统声明自己响应哪些世界方向变化。

在 `ISubSystem` 新增：

| 字段 | 类型 | 含义 |
|------|------|------|
| `worldDirectionMapping` | `Record<string, { field: string; formula: string }>` | key=方向域，field=影响的字段，formula=修正公式 |

示例：

```typescript
class EconomySystem implements ISubSystem {
  worldDirectionMapping = {
    'market': { field: 'priceIndex', formula: 'multiply' },
  }
}

class FactionDynamicsSystem implements ISubSystem {
  worldDirectionMapping = {
    'faction': { field: 'power', formula: 'multiply' },
  }
}
```

编排器不再需要 if-else，只需遍历所有子系统查找匹配的 `worldDirectionMapping`。

---

### 方案 K：世界观规则分布（新独立方案，低优先级）

**涉及集中式代码**：`narrative-prompt.ts` 的 `WORLD_RULES` 字典（12 种世界观的叙事规则文本）。

**问题**：世界观规则存在 Prompt 文件里，新增世界观需同时改两个地方。

**改造方向**：在 MOD 的 `manifest.ts` 中新增 `worldRules` 字段，引擎聚合后注入 Prompt。

**风险极低**：只需要在 manifest 类型中加一个可选字符串字段，已有 MOD 不受影响。

---

## 十一、已确认不改造的项目（无需关注）

| # | 文件 | 原因 |
|---|------|------|
| 1 | `register-subsystems.ts` 的 import 路径 | Next.js 技术限制，必然集中 |
| 2 | `event-lifecycle-tracker.ts` 的 10 维检测 | 引擎核心能力，集中合理 |
| 3 | `post-narrative-processor.ts` 的连锁反应 | 引擎核心能力，集中合理 |
| 4 | `provider-config.ts` 的 Provider 配置 | Core 层基础设施，集中合理 |

---

## 十二、更新后的实施计划

### 阶段 1：零风险修复（可直接执行）

| 序号 | 方案 | 说明 | 工期 |
|------|------|------|------|
| P4 | 静默失败日志 | `applyRoundChanges` 加 warn | 10 分钟 |
| P6 | NaN/Infinity 安全 | 新建 `system-safety.ts` | 30 分钟 |

### 阶段 2：增强优化

| 序号 | 方案 | 说明 | 工期 |
|------|------|------|------|
| P5 | 事件不延迟 | 跨域联动后重检事件 | 20 分钟 |
| P3 | 语义增强 | AI notableEvents 补充触发 | 30 分钟 |
| **P2+H+J** | **ISubSystem 接口扩展**（合并） | `dependsOn` + `frequency` + `ageWindow` + `socialClasses` + `factionTypes` + `influenceScope` + `alwaysRelevant` + `powerContribution` + `worldDirectionMapping` | **2 小时** |
| P1 | Prompt 增强 | subsystem-field-registry + Prompt 注入字段说明 | 1.5 小时 |
| I | 跨域联动参数分布 | `crossDomainActions` + 规则改造 | 45 分钟 |

### 阶段 3：低优先级（不急）

| 序号 | 方案 | 说明 | 工期 |
|------|------|------|------|
| K | 世界观规则分布 | manifest 加 `worldRules` | 20 分钟 |

### 实施依赖图

```
阶段 1 (无依赖)
├── P4 (独立)
└── P6 (独立)
     ↓
阶段 2
├── P5 (独立) → P3 (共享事件检测)
├── P2+H+J (ISubSystem 接口扩展 — 一次改接口，多方案共用)
│   └── 下游依赖：D4(影响力接入)、G(频率过滤)、I(跨域联动)
├── P1 (独立)
└── I (依赖 P2+H+J — 需要 ISubSystem 扩展后的接口)
     ↓
阶段 3 (可选)
└── K (独立)
```

### 关键优化：P2+H+J 合并

P2（dependsOn）、H（元数据声明）、J（世界方向映射）都是对 `ISubSystem` 接口的扩展，**一次性改动**即可覆盖三个方案的需求：

```typescript
export interface ISubSystem {
  // === 现有字段 ===
  readonly id: string
  readonly mod: string
  readonly label: string
  readonly description: string
  advance?(context: RoundContext): void
  collectState(context: RoundContext): SubSystemState
  applyChanges(changes: SubSystemChanges, context: RoundContext): void
  reset(): void

  // === 新增：分布式元数据（全部可选，不声明 = 默认行为） ===
  /** 依赖的其他子系统 ID */
  dependsOn?: string[]
  /** 数据注入 AI 的频率 */
  frequency?: 'always' | 'change' | 3 | 5 | 10
  /** 年龄窗口 */
  ageWindow?: { min?: number; max?: number }
  /** 可见的阶层 */
  socialClasses?: string[]
  /** 可见的势力类型 */
  factionTypes?: string[]
  /** 需要的影响力等级 */
  influenceScope?: 'personal' | 'town' | 'region' | 'continent' | 'world'
  /** 是否始终注入（不受任何过滤） */
  alwaysRelevant?: boolean
  /** 力量值贡献计算 */
  powerContribution?: (data: Record<string, unknown>) => number
  /** 世界方向映射 */
  worldDirectionMapping?: Record<string, { field: string; formula: string }>
  /** 跨域联动动作 */
  crossDomainActions?: Record<string, Record<string, unknown>>
}
```
