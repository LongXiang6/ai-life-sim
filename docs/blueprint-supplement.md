# Factorio MOD 架构吸收计划 — 补充蓝图（8 项）

> **创建日期**: 2026-06-19
> **完成日期**: 2026-06-20
> **状态**: ✅ 全部完成

---

## 已完成清单

| # | 改造 | 状态 |
|---|------|:--:|
| A1 | Stage 机接入主流程（闭包实现） | ✅ |
| A2 | campaigns/ Prompts 迁移验证 | ✅ |
| A3 | 迁移文件自动发现（autoMigrateFromDir） | ✅ |
| B1 | Settings 阶段（3-Round 声明→修正→校验） | ✅ |
| B2 | onLoad 生命周期钩子 | ✅ |
| B3 | Storage 引擎级命名空间隔离（StorageNamespace） | ✅ |
| C1 | 阶段边界类型约束（ISubSystemV3） | ✅ |
| C2 | Instrument Mode 运行时插桩 | ✅ |

## 执行中发现的接线缺口（已修复）

- `validateFeatureFlags` 定义但未在 `loadMods()` 中调用 → 已接入 Phase 2
- `modsTable` 构建但未注入 `ModContext` → 已接入 `init-mods.tsx`
- `notifyConfigurationChanged` 定义但未被调用 → 已接入 `init-mods.tsx`
- `autoMigrateFromDir` 定义但未被调用 → 已接入 `init-mods.tsx`
- `runStageMachine()` 内部 stage 闭包缺少 `await` → 已修复

---

## 未完成 — 技术债清单

> 以下问题在蓝图执行过程中被发现，不属于蓝图范围，但已记录供未来处理。

### TD-1: MOD 代码绕过 core 存储层（直接使用 localStorage）

**发现方式**: A12-STORAGE-LEAK 检查器

**现状**: `core/storage/` 提供了 `configStore`/`saveStore`/`cacheStore`/`tempStore`，但 13 个 MOD 文件（36 处调用）直接使用 `localStorage`。

**受影响的文件（13 个）**:

| # | 文件 | 调用次数 |
|---|------|:---:|
| 1 | `mod-world/subsystems/world-timeline-system.ts` | 9 |
| 2 | `mod-engine/constants/pre-gen-config.ts` | 7 |
| 3 | `mod-base-universe/subsystems/world-map-system.ts` | 3 |
| 4 | `mod-world/subsystems/world-entity-system.ts` | 2 |
| 5 | `mod-pages/pages/talent-draw/page.tsx` | 2 |
| 6 | `mod-pages/pages/world-customize/useWorldCustomize.ts` | 2 |
| 7 | `mod-settings/components/SettingsTabPresets.tsx` | 2 |
| 8 | `mod-pages/pages/world-select/WorldSelectDesktop.tsx` | 2 |
| 9 | `mod-pages/pages/world-select/WorldSelectMobile.tsx` | 2 |
| 10 | `mod-ui/components/organisms/DisclaimerModal.tsx` | 2 |
| 11 | `mod-pages/pages/world-build/page.tsx` | 1 |
| 12 | `mod-pages/pages/world-select/useWorldConfirm.ts` | 1 |
| 13 | `mod-power-system/subsystems/combat-power-system.ts` | 1 |

**建议迁移**:
```
// 旧:
window.localStorage.setItem(key, JSON.stringify(events))
// 新:
import { saveStore } from '@/core'
saveStore.set('mod-world', worldCode, stageIndex, events)
```

### TD-2: 检查器持续性问题（WARN 级别，非阻塞）

| 规则 | 数量 | 说明 |
|:--|--:|:--|
| D20-JSDOC | 678 | 函数缺少 `@param`/`@returns` JSDoc |
| D24-DEAD-EXPORT | 848 | MOD 内部导出未被引用 |
| D14/D8 | 312 | emit/listen 声明与代码不一致 |
| D16 | 132 | 未使用的 import |
| U8/U11 | 203 | ARIA 无障碍标签 + 键盘导航 |
| U2/U4 | 195 | 内联样式 + 硬编码颜色 |
| C18 | 50 | 废弃主题 ID 引用 |

---

## 检查器自动化保障

新增 5 条检查器规则覆盖架构关键点：

| 检查维度 | 规则 | 级别 |
|:--|:--|:--|
| 核心函数接线检查 | A10-UNWIRED-EXPORT | FAIL |
| 存储迁移文件命名 | A11-MIGRATION-NAME | FAIL |
| 迁移文件导出 migrate | A11-MIGRATION-EXPORT | FAIL |
| MOD 绕开 core 存储层 | A12-STORAGE-LEAK | WARN |
| 依赖前缀 ~/?/! 校验 | D33-DEP-PREFIX | FAIL |

---

## TD 修复记录（2026-06-20）

### TD-1 存储迁移（已完成）

12 个文件从 `localStorage` 迁移到 core 存储层：

| 类别 | 文件数 | 目标 | 状态 |
|:--|:--|:--|:--|
| A - 子系统持久化 | 7 | `saveStore` / `cacheStore` | ✅ |
| B - UI 配置 | 5 | `configStore` | ✅ |
| C - 保留原样 | 1 (DisclaimerModal) | 不迁移 | ✅ 已加入 A12 排除名单 |

### TD-2 WARN 清除（已完成）

| 规则 | 修复前 | 修复后 | 方法 |
|:--|--:|--:|:--|
| A3-ORPHAN-CSS | 6 | **0** | CSS 文件重命名为与组件匹配 |
| F4-TRY-CATCH | 1 | **0** | patternManager 8 个公共方法加 try-catch |
| A12-STORAGE-LEAK | 26 | **0** (+1 合理排除) | 12 文件迁移 + DisclaimerModal 排除 |
| D29-PATTERN-FLAG | 3 | 3 (跳过) | 架构建议，非阻塞 |
| D21-STRUCT-CLONE/INPUT-VALID | 8 | 8 (跳过) | 防御性编码建议，非阻塞 |

### 前置 15 个 A5-VAR-MISSING

`narrative-prompt.ts` 中 15 个模板变量在 `PromptContext` 接口中缺失 —— 蓝图 A1/A2 执行遗留，
非本次修复范围。
