# 蓝图计划书：ESLint WARN 清零 + 渐进迁移指引

> 版本：v2.0 | 日期：2026-06-29 | 级别：L2（跨 16 个 MOD + core，公用 API 签名微调）

---

## 一、问题定义

### 1.1 现状

项目 `npm run lint` 输出 **44 WARN / 0 ERR**。全部为预存警告，无新引入。按性质分三大类：

| 大类 | 数量 | 描述 |
|------|------|------|
| A | 38 | "import 但未调用" —— 导入了但函数/变量从未使用 |
| B | 5 | "参数/变量赋值但未使用" —— 函数参数或解构变量未被消费 |
| C | 1 | "React hooks 依赖不稳定" —— 非 memoized 函数导致 effect 每帧重跑 |

### 1.2 修复目标

- 44 WARN → 0 WARN（ESLint 完全清零）
- 确保修复不是"头痛医头"——每一处删除都有设计溯源支撑
- 补充渐进迁移指引（EVENTS 常量 / all-stores 统一导入），为后续开发提供方向

### 1.3 根因分析

#### A1：`getSimulationTicks` — 33 文件

**设计溯源**：`getSimulationTicks` 定义在 [`foundation/utils/round-advance.ts`](file:///D:/AI/ai-life-sim/src/foundation/utils/round-advance.ts#L17-L20)，与 `getRoundSequence`、`getAgeYearsDelta`、`consumeSimulationYears` 等函数同属子系统周期推进工具集。该函数的设计意图是：

```
每轮模拟 = 1 次 getRoundSequence（防重 guard） + N 次 getSimulationTicks（步进回调）
```

即子系统可以选择两种推进模式：
- **模式 A**（已大规模采用）：`getRoundSequence` + `getAgeYearsDelta` + `consumeSimulationYears`——基于年数增量的连续推进，满 1 年触发回调
- **模式 B**（设计但未落地）：`getRoundSequence` + `getSimulationTicks`——基于整数 tick 的离散步进

**实际格局**：
- 52 个子系统文件 import `getRoundSequence`，全部使用
- 17 个子系统文件 import + 调用 `getAgeYearsDelta`
- `getSimulationTicks` **全项目 0 处调用**（仅定义行自引）
- 33 个文件从子系统模板复制 import 时带上了 `getSimulationTicks`，但从未写调用代码
- 另有 19 个文件**仅 import `getRoundSequence` 不带 `getSimulationTicks`**——这些是模板之外手动编写的，自然没有死 import

**结论**：模式 B（tick 驱动）从未被任何子系统采用。删除 `getSimulationTicks` 是清除"设计后未落地的 API 引用"，不改变任何逻辑。如果将来某个子系统需要 tick 驱动，届时重新 import 即可——`getSimulationTicks` 函数本身保留在 `round-advance.ts` 中，不删除。

#### A2：`getAgeYearsDelta` — 2 文件

同属模板复制残留。这 2 个文件（culture-tech-system / faction-dynamics-system）在 import 中写了 `getAgeYearsDelta` 但实际只用了 `getRoundSequence` + `consumeSimulationYears`。另外 **17 个文件确实调用了 `getAgeYearsDelta`**，证明该函数有价值——仅这 2 个文件不需要。

#### A3：`deepSanitize` / `parseAIJSON` / `resolveWorldviewStyleHint` / `useWorldMapStore`

- `deepSanitize`（[orchestrator-system.ts#L41](file:///D:/AI/ai-life-sim/src/mods/mod-engine/subsystems/orchestrator-system.ts#L41)）：导入自 `../helpers/orchestrator-pipeline-support`。该函数曾在早期 orchestrator 中用于手动清理 AI 输出，后由 `sanitizeSubSystemState` 统一替代，import 残留未清
- `parseAIJSON`（[world-init-pipeline.ts#L33](file:///D:/AI/ai-life-sim/src/mods/mod-world/utils/world-init-pipeline.ts#L33)）：通用 AI JSON 解析工具。world-init-pipeline 各 stage 已走 `callWorldInitAIResilient`（内部有解析逻辑），无需单独调用
- `resolveWorldviewStyleHint` + `useWorldMapStore`（[world-init-bundle.ts](file:///D:/AI/ai-life-sim/src/mods/mod-world/world-init-bundle.ts#L21,#L23)）：bundle 文件重构后遗留的未使用 import

---

## 二、WARN 分类与修复方案

### 2.1 大类 A："import 但未调用" — 38 文件

#### A1：`getSimulationTicks` — 33 文件

**修复**：删除 import 中的 `, getSimulationTicks`。

每文件 1 行改动，统一模式：

```typescript
// 改前
import { getRoundSequence, getSimulationTicks } from '@/foundation'
// 改后
import { getRoundSequence } from '@/foundation'
```

| # | 文件 |
|---|------|
| 1 | `mods/mod-base-universe/subsystems/celestial-system.ts` |
| 2 | `mods/mod-base-universe/subsystems/divine-creation-system.ts` |
| 3 | `mods/mod-base-universe/subsystems/world-map-system.ts` |
| 4 | `mods/mod-base-universe/subsystems/fate-prophecy-system.ts` |
| 5 | `mods/mod-character/subsystems/attribute-decay-system.ts` |
| 6 | `mods/mod-character/subsystems/health-system.ts` |
| 7 | `mods/mod-character/subsystems/lifespan-system.ts` |
| 8 | `mods/mod-character/subsystems/morality-system.ts` |
| 9 | `mods/mod-culture/subsystems/art-system.ts` |
| 10 | `mods/mod-culture/subsystems/achievement-system.ts` |
| 11 | `mods/mod-culture/subsystems/culture-system.ts` |
| 12 | `mods/mod-culture/subsystems/relationship-system.ts` |
| 13 | `mods/mod-culture/subsystems/reputation-system.ts` |
| 14 | `mods/mod-engine/subsystems/core-memory-system.ts` |
| 15 | `mods/mod-engine/subsystems/foreshadowing-system.ts` |
| 16 | `mods/mod-engine/subsystems/plot-structure-system.ts` |
| 17 | `mods/mod-environment-ecology/subsystems/geography-system.ts` |
| 18 | `mods/mod-environment-ecology/subsystems/natural-resource-system.ts` |
| 19 | `mods/mod-environment-ecology/subsystems/pollution-system.ts` |
| 20 | `mods/mod-golden-finger/subsystems/golden-finger-system.ts` |
| 21 | `mods/mod-history-dynamics/subsystems/causal-simulation-system.ts` |
| 22 | `mods/mod-history-dynamics/subsystems/event-pool-system.ts` |
| 23 | `mods/mod-politics/subsystems/language-naming-system.ts` |
| 24 | `mods/mod-politics/subsystems/nation-relation-system.ts` |
| 25 | `mods/mod-power-system/subsystems/anomaly-phenomena-system.ts` |
| 26 | `mods/mod-power-system/subsystems/combat-power-system.ts` |
| 27 | `mods/mod-power-system/subsystems/cultivation-system.ts` |
| 28 | `mods/mod-power-system/subsystems/divine-intervention-system.ts` |
| 29 | `mods/mod-power-system/subsystems/faith-system.ts` |
| 30 | `mods/mod-power-system/subsystems/fortune-encounter-system.ts` |
| 31 | `mods/mod-power-system/subsystems/special-material-system.ts` |
| 32 | `mods/mod-power-system/subsystems/supreme-item-system.ts` |
| 33 | `mods/mod-tech-level/subsystems/industry-system.ts` |

**不触及**：`getSimulationTicks` 函数**定义**保留在 [`foundation/utils/round-advance.ts`](file:///D:/AI/ai-life-sim/src/foundation/utils/round-advance.ts#L17-L20) 中，将来需要时重新 import 即可。

#### A2：`getAgeYearsDelta` — 2 文件

| # | 文件 | 改前 import | 改后 import |
|---|------|-----------|-----------|
| 34 | `mods/mod-tech-level/subsystems/culture-tech-system.ts` | `{ getRoundSequence, getAgeYearsDelta, consumeSimulationYears }` | `{ getRoundSequence, consumeSimulationYears }` |
| 35 | `mods/mod-politics/subsystems/faction-dynamics-system.ts` | 同上 | 同上 |

**注意**：另外 17 个子系统文件**确实调用了** `getAgeYearsDelta`，不修改。

#### A3：其他未使用 import — 3 文件

| # | 文件 | 行号 | 操作 |
|---|------|------|------|
| 36 | `mod-engine/subsystems/orchestrator-system.ts` | 41 | 删除 `deepSanitize,` |
| 37 | `mod-world/utils/world-init-pipeline.ts` | 33 | 删除 `parseAIJSON,` |
| 38a | `mod-world/world-init-bundle.ts` | 21 | 删除 `resolveWorldviewStyleHint,` |
| 38b | `mod-world/world-init-bundle.ts` | 23 | 删除整行 `import { useWorldMapStore } from '@/mods/mod-world-map'` |

---

### 2.2 大类 B："参数/变量赋值但未使用" — 5 文件

| # | 文件 | 行号 | 符号 | 修复 | 原因 |
|---|------|------|------|------|------|
| 39 | `core/ai-service/ai-client.ts` | 594 | `signal` 参数 | `signal?` → `_signal?` | `executeAiFetchWithRetry` 从未将 AbortSignal 传入内部 `fetchFn()`。加 `_` 前缀保留签名兼容性 |
| 40 | `mod-world/utils/world-coherence-hints.ts` | 72 | `worldType` 解构 | `worldType` → `worldType: _worldType` | 函数从 opts 解构后仅使用 `cal`/`essenceTag`/`worldDescription` |
| 41 | `mod-world/utils/world-config-ai.ts` | 52 | `key` 循环变量 | `[key, value]` → `[, value]` | 循环体仅使用 `value`，`key` 不需要 |
| 42 | `mod-tech-level/subsystems/culture-tech-system.ts` | 67 | `context` 参数 | `context:` → `_context:` | `collectState` 方法仅返回 `this` 属性，不消费 `context`。必须保留参数（实现接口） |
| 43 | `mod-world/utils/world-coherence-hints.ts` | 72 | `worldType` | 已在 #40 处理 | — |

---

### 2.3 大类 C："React hooks 依赖不稳定" — 1 文件

| # | 文件 | 行号 | 修复 |
|---|------|------|------|
| 44 | `mod-ui/components/organisms/NarrativeTimeline.tsx` | 86 | `const loadMore = () => {` → `const loadMore = useCallback(() => {` + 尾部 `}, [])` |

**安全性分析**：`loadMore` 函数体仅使用 `scrollRef`（ref，稳定引用）、`scrollRestoreRef`（ref）、`setRenderStart`（稳定 setter）、`renderStart`（提前返回条件）。`useEffect` 依赖 `[renderStart, loadMore, scrollRef]`。用 `useCallback(() => {}, [])` 包裹后，`loadMore` 引用稳定，effect 不再每次渲染重新执行。

---

## 三、渐进迁移补充指引（不纳入本次执行）

### 3.1 `EVENTS` 常量渐进迁移

已生成 [events.generated.ts](file:///D:/AI/ai-life-sim/src/mods/mod-engine/bootstrap/events.generated.ts)（72 个事件常量）。现有代码仍用硬编码字符串 `eventBus.on('mod-engine:round-complete', ...)`。

**迁移策略**：每次修改涉及 eventBus 调用的文件时，顺带改为：

```typescript
// 改前
eventBus.on('mod-engine:round-complete', handler)

// 改后
import { EVENTS } from '@/mods/mod-engine/bootstrap/events.generated'
eventBus.on(EVENTS.MOD_ENGINE_ROUND_COMPLETE, handler)
```

受益：事件名拼写错误从运行时静默失败 → 编译期 TypeScript 报错。

### 3.2 `all-stores.generated` 渐进迁移

已生成 [all-stores.generated.ts](file:///D:/AI/ai-life-sim/src/mods/mod-engine/bootstrap/all-stores.generated.ts)（17 个 store 统一导出）。现有代码仍用 `import { useWorldStore } from '@/mods/mod-world'`。

**迁移策略**：每次修改涉及跨 MOD store import 的文件时，顺带改为：

```typescript
// 改前
import { useWorldStore } from '@/mods/mod-world'

// 改后
import { useWorldStore } from '@/mods/mod-engine/bootstrap/all-stores.generated'
```

受益：store 迁移到其他 MOD 时，只需改 manifest + `generate:wiring`，无需改所有引用方。

---

## 四、实施顺序

| 步骤 | 内容 | 文件数 | 风险 |
|------|------|--------|------|
| 1 | A1：`getSimulationTicks` 批量删除（33 文件） | 33 | 极低（仅删 import 项，不触碰逻辑，函数定义保留） |
| 2 | A2+A3：`getAgeYearsDelta` + 其他未使用 import（5 文件） | 5 | 极低 |
| 3 | B：参数/变量未使用（5 文件） | 5 | 低（签名微调，不影响调用方） |
| 4 | C：React `useCallback`（1 文件） | 1 | 低（性能优化，逻辑等价） |
| 5 | `npm run lint && npx tsc --noEmit` 验证 | — | — |
| 6 | `npm run gate-check:quick` | — | — |

---

## 五、预期收益

- `npm run lint`：**44 WARN → 0 WARN**（ESLint 完全清零）
- CI 输出干净，真正的新问题不会被淹没在 44 条预存 WARN 中
- 消除 33 个子系统文件中的模板化死 import，减少模块初始化时的无用符号解析
- 保留 `getSimulationTicks` 函数定义，不关闭未来扩展可能

---

## 六、不改动说明

以下**不删除、不修改**：

| 项目 | 原因 |
|------|------|
| `getSimulationTicks` 函数定义（round-advance.ts:17-20） | 完整保留。将来子系统需要 tick 驱动时可重新 import |
| `getAgeYearsDelta` 在 17 个文件中的 import | 这些文件**确实调用了**该函数 |
| `deepSanitize` 函数定义（orchestrator-pipeline-support） | 保留。仅删 import，不动定义 |
| `parseAIJSON` 函数定义（parse-ai-json / world-init-bundle-deps） | 保留。仅删 import，不动定义 |
| `resolveWorldviewStyleHint` 函数定义（world-coherence-hints） | 保留。仅删 import，不动定义 |
