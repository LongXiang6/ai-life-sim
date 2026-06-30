# BLUEPRINT: 内联 Math.max/Math.min → shared/ clamp() 统一

> **日期**：2026-06-30  
> **定级**：L2（波及 15 个 MOD / ~30 个文件，纯函数替换）  
> **状态**：Planned

---

## 一、背景

`clamp(value, min, max)` 已在 `core/shared/common-utils.ts` 中定义，并通过以下 MOD 的 index.ts 对外暴露：
`mod-power-system`, `mod-tech-level`, `mod-environment-ecology`, `mod-history-dynamics`

但各子系统代码仍未使用它，全部内联 `Math.max(0, Math.min(100, x))` 等模式（**123 处**）。

**收益**：
- 语义更清晰（`clamp(x, 0, 100)` vs `Math.max(0, Math.min(100, x))`）
- 减少括号嵌套，降低阅读成本
- 单一来源 —— 未来若需修改 clamp 行为（如加日志/NaN保卫），只改一处

---

## 二、改动范围

按 MOD 分组，分为 **4 类**：

### 2.1 双边界限 [0, 100]（14 处 — 最高优先）

| # | 文件 | 行号 | 改动 |
|---|------|------|------|
| 1 | `mod-politics/constants.ts` | 304 | `Math.max(0, Math.min(100, ...))` → `clamp(..., 0, 100)` |
| 2 | `mod-politics/subsystems/language-naming-system.ts` | 141 | 同上 |
| 3 | `mod-base-universe/subsystems/world-map-system.ts` | 1111 | 同上 |
| 4 | `mod-character/subsystems/health-system.ts` | 189, 194 | 同上 |
| 5 | `mod-world/utils/calibration-clamp.ts` | 367, 368 | 同上 |
| 6 | `mod-engine/subsystems/plot-structure-system.ts` | 370 | 同上 |
| 7 | `mod-pages/pages/game-over/page.tsx` | 202-218 (6 处) | `Math.min(100, Math.max(0, ...))` → `clamp(..., 0, 100)` |

### 2.2 仅下界 Math.max(0, ...)（85 处 — 增量替换）

| MOD | 文件数 | 约处数 |
|-----|--------|--------|
| mod-base-universe | 3 | 16 |
| mod-character | 3 | 8 |
| mod-economy | 4 | 13 |
| mod-politics | 4 | 14 |
| mod-engine | 3 | 5 |
| mod-culture | 3 | 7 |
| mod-environment-ecology | 1 | 6 |
| mod-power-system | 3 | 3 |
| mod-world | 3 | 8 |
| mod-tech-level | 2 | 3 |
| mod-history-dynamics | 1 | 2 |
| mod-ui | 1 | 4 |
| mod-pages | 1 | 1 |
| mod-npc | 1 | 4 |

**替换规则**：`Math.max(0, expr)` → `clamp(expr, 0, Infinity)`

### 2.3 仅上界 Math.min(100, ...)（12 处）

**替换规则**：`Math.min(100, expr)` → `clamp(expr, -Infinity, 100)`

| MOD | 位置 | 处数 |
|-----|------|------|
| mod-settings | SettingsTabTheme.tsx, SettingsTabPrompt.tsx | 2 |
| mod-economy | economy-system.ts | 1 |
| mod-power-system | anomaly-phenomena-system.ts, divine-intervention-system.ts | 2 |
| mod-character | health-system.ts | 1 |
| mod-culture | works-system.ts | 3 |
| mod-world | world-init-system.ts | 2 |
| mod-politics | social-values-system.ts | 1 |

### 2.4 其他上下界（12 处）

| 文件 | 边界范围 | 处数 |
|------|---------|------|
| mod-settings/SettingsTabTheme.tsx | `[0,2]`, `[0,1]`, `[0,3]` | 3 |
| mod-npc/npc-behavior-system.ts | `[-100, 100]` | 2 |
| mod-npc/npc-attribute-system.ts | `[-10, 10]` | 1 |
| mod-npc/npc-memory-system.ts | `[-10, 10]` | 1 |
| mod-character/destiny-pattern-system.ts | `[-4, 4]` | 1 |
| mod-character/attr-tiers.ts | `[-10, 10]` | 1 |
| mod-engine/plot-structure-system.ts | `[-10, 15]` | 1 |
| mod-engine/foreshadowing-system.ts | `[0, 10]` | 1 |
| mod-pages/game-over/page.tsx | `[-15, 15]` | 1 |

---

## 三、前置条件

**需要先确认各 MOD 的 `clamp` 可用性**：

| MOD | `clamp` 已在 index.ts 导出？ | 子系统 import 来源 |
|-----|--------------------------|-------------------|
| mod-power-system | ✅ | `from '../constants'` 或 `../../constants` |
| mod-tech-level | ✅ | `from '../utils'` 或 `../../utils` |
| mod-environment-ecology | ✅ | `from '../utils'` 或 `../../utils` |
| mod-history-dynamics | ✅ | 需核实 |
| mod-politics | ⚠️ 需确认 | `from '../constants'` 中有 `clamp` |
| mod-economy | ⚠️ 需确认 | `from '../utils'` 中有 `clamp` re-export |
| mod-culture | ⚠️ 需确认 | `from '../constants'` 中有 `clamp` |
| mod-base-universe | ❓ 需核实 | 可能需新增 import |
| mod-character | ❓ 需核实 | 可能需新增 import |
| mod-world | ❓ 需核实 | 可能需新增 import |
| mod-settings | ❓ 需核实 | 无 utils chain，需新增 |
| mod-ui | ❓ 需核实 | 无 utils chain，需新增 |
| mod-pages | ❓ 需核实 | 无 utils chain，需新增 |
| mod-npc | ❓ 需核实 | 需新增 |
| mod-engine | ❓ N/A | 用 system-safety.ts 的 clampNumber（合法，不动） |

**如果 MOD 没有 `clamp` 在 utils chain 中**：子系统直接从 `@/core/shared` import 即可（`import { clamp } from '@/core/shared'`）。

---

## 四、执行计划

| 阶段 | 内容 | 处数 | 预计文件 |
|------|------|------|---------|
| **P1** | 双边界限 [0, 100] — 最明显、最安全 | 14 | 8 |
| **P2** | 仅下界 Math.max(0, ...) → `clamp(expr, 0, Infinity)` | ~85 | ~25 |
| **P3** | 仅上界 Math.min(100, ...) → `clamp(expr, -Infinity, 100)` | 12 | 8 |
| **P4** | 其他定制边界 | 12 | 8 |

**实施方式**：按 MOD 逐批替换，每批后运行 `npx tsc --noEmit` 验证。

---

## 五、风险与豁免

| 场景 | 处理 |
|------|------|
| mod-engine 的 `Math.max(0, ...)` 在 system-safety 相关文件中 | **不动** — 用 `clampNumber`（含 safeNumber）更安全 |
| `Math.max(0, <索引计算>)`（如 `Math.max(0, idx - 15)`） | **替换** — `clamp(idx - 15, 0, Infinity)` 语义等价且更清晰 |
| `Math.max(0, ...)` 在 JSX 属性中 | **替换** — 纯函数调用，无副作用 |
| 跨行表达式 | **需确保障理后逻辑不变** — 参数求值顺序不变 |
