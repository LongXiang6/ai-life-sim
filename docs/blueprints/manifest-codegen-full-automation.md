# 蓝图计划书：manifest 声明 → 运行时消费全自动化

> 版本：v1.0 | 日期：2026-06-29 | 级别：L3（跨 core codegen + 多个 MOD）
> 背景：manifest 的 `prompts`/`stores`/`consumes`/`events` 字段已声明但无消费方，跨 MOD 调用全走手动 import

---

## 一、问题定义

### 1.1 现状

manifest 系统设计完善，但覆盖率只有约 50%：

| manifest 字段 | 编译器理解 | 运行时消费 | 现状 |
|--------------|-----------|-----------|------|
| `name`/`version`/`dependencies` | 是 | 是（加载器） | 100% 自动化 |
| `subsystems` | 是 | 是（orchestrator 自动注册） | 100% 自动化 |
| `routes` | 是 | 是 | 100% 自动化 |
| `prompts` | **是（codegen 扫描到）** | **否** | 0%。[adaptation-prompt-registry.ts](file:///D:/AI/ai-life-sim/src/mods/mod-engine/helpers/adaptation-prompt-registry.ts) 手动维护 13 条导入+映射 |
| `stores` | **是（codegen 扫描到）** | **否** | 0%。各 MOD 通过 `from '@/mods/mod-X'` 直接 import store |
| `consumes` | 是（设计期校验） | **否** | 0%。运行时不做限制 |
| `events` | 是（设计期校验） | **否** | 0%。`eventBus.on()` 仍手动写在 lifecycle 钩子中 |

### 1.2 核心矛盾

manifest 声明了 "MOD 有什么"（prompts、stores、events），codegen 也扫描到了，但**没有任何 .generated.ts 文件消费这些声明**去生成运行时映射。结果是：

```
MOD 作者写 manifest.prompts     →  生成文档
MOD 作者写 manifest.stores      →  生成文档
MOD 作者写 manifest.events      →  生成文档
                                 ↘
                              运行时：仍需手动 import + 手动映射
```

### 1.3 修复目标

让 manifest 声明**直接驱动运行时**。新增一个 adaptation prompt 只需：
1. 在 `prompts/` 创建文件
2. 在 manifest `prompts` 数组中声明名称
3. 运行 `npm run generate:wiring`

**不再需要**手动修改 `adaptation-prompt-registry.ts`。

同理，新增一个 store 只需在 manifest `stores` 中声明，不必要知道该 store 在哪个 MOD 的文件路径。

---

## 二、分项方案

### 2.1 prompts 自动化（最高 ROI，低风险）

#### 命名规律

当前 13 个 adaptation prompt 全部遵循固定约定：

```
文件:   prompts/adaptation-{subsystemId}-prompt.ts
导出:   export const adaptation{SubsystemId}Prompt: PromptTemplate = { ... }
映射键: {subsystemId}
```

例子：
| 文件 | 导出 | 映射键 |
|------|------|--------|
| `adaptation-cultivation-prompt.ts` | `adaptationCultivationPrompt` | `cultivation` |
| `adaptation-fortune-encounter-prompt.ts` | `adaptationFortuneEncounterPrompt` | `fortune-encounter` |
| `adaptation-divine-creation-prompt.ts` | `adaptationDivineCreationPrompt` | `divine-creation` |

这个约定足够规律，可以 codegen 自动推导。

#### 方案：codegen 自动生成 adaptation-prompt-registry.generated.ts

在 `generate-mod-wiring.mjs` 中新增一个生成器：

1. 遍历所有 MOD manifest，解析 `prompts` 字段
2. 筛选名称匹配 `adaptation-*-prompt` 的条目
3. 从文件名提取 `subsystemId`（去掉 `adaptation-` 前缀和 `-prompt` 后缀）
4. 将 kebab-case 转为 PascalCase → 拼接 `Prompt` → 得到导出名
5. 根据 MOD 目录名生成 import 路径
6. 生成 `{ subsystemId: exportName }` 映射

生成的代码示例：

```typescript
// adaptation-prompt-registry.generated.ts（自动生成，勿手动编辑）

import type { PromptTemplate } from '@/foundation'

// mod-power-system
import { adaptationCultivationPrompt } from '@/mods/mod-power-system/prompts/adaptation-cultivation-prompt'
import { adaptationLuckPrompt } from '@/mods/mod-power-system/prompts/adaptation-luck-prompt'
// ... 共 13 个

export const ADAPTATION_PROMPT_MAP: Record<string, PromptTemplate> = {
  'cultivation': adaptationCultivationPrompt,
  'luck': adaptationLuckPrompt,
  // ... 共 13 个
}
```

**然后删除**手动的 [adaptation-prompt-registry.ts](file:///D:/AI/ai-life-sim/src/mods/mod-engine/helpers/adaptation-prompt-registry.ts)，所有引用改为 `from './adaptation-prompt-registry.generated'`。

#### 边界情况

- **非 adaptation 的 prompt**（如 `narrative-prompt`、`summary-prompt`）：不在此映射表中。它们通过 `PromptTemplate` 类型直接引用，不适用此自动映射。
- **antagonist**（无对应子系统）：做特例处理。在 manifest 中声明 `prompts: ['adaptation-antagonist-prompt']` 但无对应 subsystem。codegen 检测到 `prompt name` 且无匹配 subsystem → 仍生成映射（用 prompt name 去掉 `adaptation-` 前缀和 `-prompt` 后缀做 key）。

#### 改动文件

| # | 文件 | 改动 |
|---|------|------|
| 1 | `scripts/codegen/generate-mod-wiring.mjs` | 新增 `generateAdaptationPromptRegistry()` 函数 |
| 2 | **新建** `src/mods/mod-engine/helpers/adaptation-prompt-registry.generated.ts` | 自动生成（替代手动 registry） |
| 3 | `src/mods/mod-engine/helpers/adaptation-prompt-registry.ts` | **删除**（被 generated 替代） |
| 4 | `src/mods/mod-engine/subsystems/adaptation-manager-system.ts` | 改 import：`adaptation-prompt-registry` → `adaptation-prompt-registry.generated` |

---

### 2.2 stores 自动化（中 ROI，低风险）

#### 当前问题

19 个 MOD 各自 export store，跨 MOD 使用时需要知道 store 在哪个 MOD：

```typescript
// mod-character 跨 MOD 引用
import { useWorldStore } from '@/mods/mod-world'
import { useSettingsStore } from '@/mods/mod-settings'
```

每个 import 都硬编码了路径和 MOD 名。如果 store 迁移到另一个 MOD，所有引用方都要改。

#### 方案：codegen 自动生成 all-stores.generated.ts

```typescript
// all-stores.generated.ts（自动生成，勿手动编辑）

// mod-power-system
export { usePowerSystemStore } from '@/mods/mod-power-system/stores/power-system-store'
// mod-world
export { useWorldStore } from '@/mods/mod-world/stores/world-store'
// ... 所有 MOD 的所有 store
```

消费者改为：

```typescript
import { useWorldStore, useSettingsStore } from '@/mods/mod-engine/bootstrap/all-stores.generated'
```

好处：
- 集中管理，store 迁移只改 manifest + codegen
- 编译期发现死引用（如果 manifest 漏声明，generated 文件就不会导出）

#### 改动文件

| # | 文件 | 改动 |
|---|------|------|
| 5 | `scripts/codegen/generate-mod-wiring.mjs` | 新增 `generateAllStores()` 函数（扫描 manifest.stores + MOD 目录中的 store 文件） |
| 6 | **新建** `src/mods/mod-engine/bootstrap/all-stores.generated.ts` | 自动生成 |

#### 可选：渐进迁移

创建后不强制迁移。现有 89 文件的 `from '@/mods/mod-X'` 可以逐步迁移到 `from '@/mods/mod-engine/bootstrap/all-stores.generated'`，每次修改文件时顺带改，不单独做批量迁移。

---

### 2.3 events 自动化（中 ROI，中风险）

#### 当前问题

manifest 声明了 `events.listens` 和 `events.emits`，但：
- 事件监听器仍手动写在 lifecycle 钩子中
- 事件名是手写字符串，无类型检查
- 新增事件后没有机制确保 listener 存在

#### 方案 A：事件常量自动生成（低风险，即刻可行）

```typescript
// events.generated.ts（自动生成）

export const EVENTS = {
  MOD_POWER_SYSTEM_STAGE_BREAKTHROUGH: 'mod-power-system:stage-breakthrough',
  MOD_POWER_SYSTEM_CULTIVATION_BOTTLENECK: 'mod-power-system:cultivation-bottleneck',
  // ... 全项目所有 emit 的事件
} as const
```

消费者改为：

```typescript
import { EVENTS } from '@/mods/mod-engine/bootstrap/events.generated'

eventBus.on(EVENTS.MOD_ENGINE_ROUND_COMPLETE, () => { ... })
```

好处：事件名拼写错误在编译期发现，IDE 有自动补全。

#### 方案 B：事件契约校验（CI 阻断，低风险）

codegen --check 模式下，校验：
- manifest 声明了 `listens: ['X']` → control.ts 中必须有 `eventBus.on('X', ...)` 或 `eventBus.on(EVENTS.X, ...)`
- manifest 声明了 `emits: ['X']` → 对应 MOD 中必须有 `eventBus.emit('X', ...)`

漂移检测确保声明与实现一致。

#### 改动文件

| # | 文件 | 改动 |
|---|------|------|
| 7 | `scripts/codegen/generate-mod-wiring.mjs` | 新增 `generateEventsConstants()` + `validateEventContracts()` |
| 8 | **新建** `src/mods/mod-engine/bootstrap/events.generated.ts` | 自动生成事件常量 |

---

### 2.4 consumes 运行时校验（低 ROI，低风险）

#### 当前状态

manifest `consumes: ['world-base', ...]` 仅在依赖解析阶段被检查——确保被消费的能力由某个 MOD 的 `provides` 提供。运行时不做限制。

#### 方案：dev 模式运行时 API 校验

在 `mod-lifecycle.ts` 的 `registerModRemoteApis()` 加一步：dev 模式下，对比 `manifest.consumes` 与 `remote.list()` 已注册的 API，缺失时 console.warn。

```typescript
// mod-lifecycle.ts（修改）
if (import.meta.env.DEV && manifest.consumes?.length) {
  const registered = remote.list()
  for (const consumed of manifest.consumes) {
    if (!registered.includes(consumed)) {
      console.warn(`[ModLoader] ${manifest.name} consumes "${consumed}" but no MOD provides it via remote`)
    }
  }
}
```

不改动 codegen，仅运行时告警。收益：提醒开发者遗漏了 remote API 注册。

---

## 三、实施顺序

| 步骤 | 内容 | 文件数 | 优先级 | 风险 |
|------|------|--------|--------|------|
| **S1** | prompts 自动化（codegen → 删除手动 registry） | 4 | **最高** | 低 |
| **S2** | stores 自动化（生成 all-stores.generated） | 2 | 高 | 低 |
| **S3** | events 方案 A（事件常量生成） | 2 | 中 | 低 |
| **S4** | events 方案 B（契约校验） + consumes 运行时校验 | 2 | 低 | 低 |

**S1+S2 是最关键的**——直接解决了"manifest 声明了但没人消费"的核心矛盾，且无需改动任何 MOD 内部代码（完全是 codegen + 替换 import 路径）。

---

## 四、预期收益

| 收益 | 说明 |
|------|------|
| adaptation prompt 新增 | 从"3 步手动"（写文件 + manifest 声明 + 手动改 registry） → "2 步"（写文件 + manifest 声明 + `generate:wiring`） |
| adaptation prompt 删除 | 从"3 步"（删文件 + manifest 移除 + 手动删 registry import） → "2 步"（删文件 + manifest 移除 + `generate:wiring`） |
| store 迁移 | 从"改所有引用方 import 路径" → "改 manifest + generate:wiring" |
| 事件名拼写 | 从"运行时静默不触发" → "编译期报错" |
| 事件契约 | 从"无校验" → "CI 检测声明与实现不一致" |

---

## 五、改动文件总清单

| # | 文件 | 改动 | 阶段 |
|---|------|------|------|
| 1 | `scripts/codegen/generate-mod-wiring.mjs` | 新增 3 个生成器 + 2 个校验器 | S1+S2+S3 |
| 2 | `src/mods/mod-engine/helpers/adaptation-prompt-registry.generated.ts` | **新建**（codegen 生成） | S1 |
| 3 | `src/mods/mod-engine/helpers/adaptation-prompt-registry.ts` | **删除** | S1 |
| 4 | `src/mods/mod-engine/subsystems/adaptation-manager-system.ts` | import 改为 generated | S1 |
| 5 | `src/mods/mod-engine/bootstrap/all-stores.generated.ts` | **新建**（codegen 生成） | S2 |
| 6 | `src/mods/mod-engine/bootstrap/events.generated.ts` | **新建**（codegen 生成） | S3 |
| 7 | `src/core/mod-loader/mod-lifecycle.ts` | consumes 运行时校验 | S4 |
