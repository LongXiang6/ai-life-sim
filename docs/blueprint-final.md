# Factorio MOD 架构吸收计划 — 基础蓝图（14 项）

> **创建日期**: 2026-06-20
> **完成日期**: 2026-06-20
> **状态**: ✅ 全部完成

---

## 已完成清单

| # | 改造 | 状态 |
|---|------|:--:|
| 1 | 深度自动排序（依赖图自动算加载顺序） | ✅ |
| 2 | Remote Interface（自动注册远程 API） | ✅ |
| 3 | 三回合加载（Round 1/2/3） | ✅ |
| 4 | 存储迁移链（autoMigrate + autoMigrateFromDir） | ✅ |
| 5 | `~` 软引用（解决循环依赖） | ✅ |
| 6 | mods 预扫描表（Phase 0） | ✅ |
| 7 | 可选/冲突依赖（`?` / `!` 前缀） | ✅ |
| 8 | Feature Flags（能力声明自动校验） | ✅ |
| 9 | Defines 全局枚举 | ✅ |
| 10 | onConfigurationChanged（配置变更通知） | ✅ |
| 11 | 兼容性子目录（auto-scan） | ✅ |
| 12 | API 弃用层 + 类型注册表（TypeRegistry.revive） | ✅ |
| 13 | NarrativeStage 阶段机 | ✅ |
| 14 | campaigns/ 叙事分离 | ✅ |

## 执行中发现的接线缺口（已修复）

- `validateFeatureFlags` 定义但未在 `loadMods()` 中调用 → 已接入 Phase 2
- `modsTable` 构建但未注入 `ModContext` → 已接入 `init-mods.tsx`

## 补充蓝图

详见 [blueprint-supplement.md](blueprint-supplement.md)
