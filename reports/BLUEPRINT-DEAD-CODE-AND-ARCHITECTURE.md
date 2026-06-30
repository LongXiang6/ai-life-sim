# BLUEPRINT: 死代码清理 & 死架构激活

> **日期**：2026-06-30  
> **定级**：L2  
> **状态**：v2 最终版 — 评估完成，含操作清单

---

## 一、前置检查：目标达成校验 ✅

| 检验项 | 目标 | 结果 |
|--------|------|------|
| `randomInRange` | 完全消除 | **PASS**（仅 shared/ comment） |
| `computeAverage` | 统一到 shared/ | **PASS**（零 MOD 端定义） |
| `filterDigitsOnly` | 统一到 shared/ | **PASS**（仅 re-export） |
| 内联 Math.max/Math.min → clamp | ~110→9 处 | **PASS**（9 处均为合理保留） |
| 死 import | 零 | **PASS** |

---

## 二、可直接清理的死代码（立即执行）

### 2.1 foundation `clampNumber` deprecated 别名

| 文件 | 行号 | 内容 |
|------|------|------|
| `src/foundation/utils/index.ts` | 46 | `export const clampNumber = clamp`（带 `@deprecated`） |
| `src/foundation/index.ts` | 15 | barrel 透传 `clampNumber` |

**全项目 0 调用方**。mod-engine 的 `clampNumber` 是独立实现（含 safeNumber），与 foundation 无关。

**操作**：删除 foundation utils/index.ts L46 + foundation/index.ts L15。

### 2.2 foundation `formatNumber`

| 文件 | 导出 | 调用方 |
|------|------|--------|
| `src/foundation/utils/format-number.ts` | `formatNumber(n: number): string` | **0** |

**全项目 0 调用方**。格式化功能项目中通过 `formatChineseNumber` 等其他方式完成。

**操作**：删除 foundation utils/index.ts 的 `formatNumber` 导出 + foundation/index.ts barrel。保留源文件以备将来使用（仅从 barrel 移除）。

---

## 三、死架构：分类处理

### 3.1 保留 — 有价值但未接入

| 组 | 函数 | 理由 |
|----|------|------|
| shared/common-utils | `deepMerge`、`uniqueId`、`delay`、`isBlank` | 高价值通用工具；`isBlank` 有计划后续替换 15 处 |
| shared/character-utils | `calcAgeDecay`、`calcAttributeValue`、`isLifespanExpired` | mod-character 无等价实现，是新设计；独立函数签名，非重复 |
| shared/character-utils | `getHealthStatus` | 与 mod-character 的 `getHealthStatusLabel(hp, maxHp)` 签名不同（用 0-100 抽象值 vs HP 百分比），**不是重复** |
| shared/world-utils | 全部 5 个 | mod-world 和 mod-environment-ecology 未采信；无等价实现，保留待接入 |
| shared/narrative-utils | `NARRATIVE_PROMPT_KEYS` / `NarrativePromptKey` / `calcTagMatchScore` | 为 orchestrator Prompt 拼接设计，尚未接入；无等价实现 |
| shared/common-utils | `safeJsonParse` | 被同文件 `parseAIJsonResponse` 内部调用，保留 |

### 3.2 可删除 — 与已有实现重复

| 位置 | 函数 | 理由 | 操作 |
|------|------|------|------|
| shared/narrative-utils | `estimateTokenCount` | mod-engine 有 `estimateTokens`（同一算法，中英混合启发式），已在 MOD 层广泛使用 | **从 shared/ 删除** |
| shared/narrative-utils | `parseAIJsonResponse` | foundation 有 `parseJSON`，已在 mod-world 中使用；比 shared/ 版本成熟 | **从 shared/ 删除** |

### 3.3 特殊：foundation/utils 中"内部消费"的常量

| 常量 | 外部调用方 | 内部使用 | 判定 |
|------|-----------|---------|------|
| `TOKEN_BUDGET_DEFAULT_MIN` | 0 | `estimate-token-budget.ts` 内部消费 | **已在用**（barrel 导出是正常接口暴露） |
| `TOKEN_BUDGET_HEADROOM` | 0 | 同上 | **已在用** |
| `estimateTextTokens` | 0 | 同上 | **已在用**（内部被 `estimateTokenBudget` 调用） |

### 3.4 特殊：foundation/utils 中真正的死代码

| 函数 | 外部 | 内部 | 判定 |
|------|------|------|------|
| `formatNumber` | 0 | 0 | **死代码 → 删除 barrel 导出** |
| `getSimulationTicks` | 0 | 0 | **死代码 → 删除 barrel 导出** |
| `getCalendarDaysDelta` | 0 | 0 | **死代码 → 删除 barrel 导出** |
| `shouldAdvanceSubsystem` | 0 | 0 | **死代码 → 删除 barrel 导出** |
| `clampNumber` | 0 | 0 | **死代码 → 删除 barrel 导出 + 定义行** |
| `getAttrTier` | 0 | 0（仅被同文件 `getAttrSemanticText` 调用） | **内部闭环** — 保留定义文件，删除 foundation/index.ts barrel 导出 |
| `getAttrSemanticText` | 0 | 0（仅被同文件 `getAllAttrSemanticText` 调用） | 同上 |
| `getAllAttrSemanticText` | 0 | 0 | 同上 |

### 3.5 MOD hooks（30 个）— 保留

| MOD | hooks | 结论 |
|-----|-------|------|
| mod-economy | 5 个 | **保留** |
| mod-character | 3 个 | **保留** |
| mod-world | 3 个 | **保留** |
| mod-politics | 7 个 | **保留** |
| mod-culture | 10 个 | **保留** |
| mod-engine | `useSimulationSnapshot` | **保留** |

**理由**：这些 hooks 是 React 最佳实践的 `useStore(s => s.xxx)` thin wrapper，属于 Zustand 推荐的一级 selector 模式。当前 UI 页面直接调用 `useXxxStore` 是 **UI 层的 code smell**，未来 UI 重构时应迁移到 hook 调用。

---

## 四、误判修正

| 原判定 | 修正 | 原因 |
|--------|------|------|
| `storySeed` = 死字段 | **非死字段** | 完整管道：settings store → SettingsTabTheme import/export → ai-client.ts `body.seed` → summary-compressor `sessionId` fallback → post-death-epilogue seed |
| `parseChineseNumber` = 死代码 | **非死代码** | 被 `extractDynamicAttrsFromNarrative` 内部消费，后者被 16 个 MOD 调用 |
| `getAttrTier/getAttrSemanticText/getAllAttrSemanticText` = 死代码 | **内部闭环** | 仅被 attr-tiers.ts 内部互调，无外部消费。保留源文件、删除 barrel 导出即可 |

---

## 五、操作清单

### 立即（L2，风险可控，本次执行）

| # | 文件 | 操作 |
|---|------|------|
| C1 | `src/foundation/utils/index.ts` L46 | 删除 `export const clampNumber = clamp` |
| C2 | `src/foundation/index.ts` L15 | 删除 `clampNumber,` |
| C3 | `src/foundation/index.ts` L10 | 删除 `formatNumber,` |
| C4 | `src/foundation/utils/index.ts` L9 | 删除 `formatNumber,` |
| C5 | `src/foundation/index.ts` | 删除 `getSimulationTicks,` `getCalendarDaysDelta,` `shouldAdvanceSubsystem,` |
| C6 | `src/foundation/utils/index.ts` L10 | 改为只导出 `getRoundSequence, getAgeYearsDelta, consumeSimulationYears`（移除 3 个死导出） |
| C7 | `src/foundation/index.ts` | 删除 `getAttrTier,` `getAttrSemanticText,` `getAllAttrSemanticText,` |
| C8 | `src/foundation/utils/index.ts` L14 | 删除 `getAttrTier, getAttrSemanticText, getAllAttrSemanticText` 的 re-export |
| C9 | `src/core/shared/narrative-utils.ts` | 删除 `estimateTokenCount` 函数 |
| C10 | `src/core/shared/narrative-utils.ts` | 删除 `parseAIJsonResponse` 函数 |
| C11 | `src/core/index.ts` | 移除对应 barrel 导出 |

### 后续（另开蓝图）

| # | 内容 | 理由 |
|---|------|------|
| F1 | shared/ 未使用函数的激活计划 | character-utils(4) + world-utils(5) + 剩余 narrative-utils(3) 都有设计价值，需要按 MOD 逐一迁移 |
| F2 | `isBlank` 替换 15 处 site | 函数已在 shared/，待批量替换 |
| F3 | MOD hooks 接入 UI | UI 页面应从 `useXxxStore` 迁移到 `useXxx()` hook |

---

## 六、波及评估

| 类别 | 文件数 | 风险 |
|------|--------|------|
| foundation barrel 导出清理 | 2 | 低 — 删除无调用方的导出 |
| shared/ 函数删除 | 2 | 低 — 无调用方 |
| core/index.ts barrel 同步 | 1 | 低 |
| **总计** | **5** | — |
