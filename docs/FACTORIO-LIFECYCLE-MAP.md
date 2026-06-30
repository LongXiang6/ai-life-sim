# Factorio Data Lifecycle 映射表

> **状态**: Phase 11（2026-06-25）  
> **参考**: [Factorio Data lifecycle](https://lua-api.factorio.com/latest/auxiliary/data-lifecycle.html)

---

## 两阶段世界

| Factorio | ai-life-sim | 文件 / 模块 |
|----------|-------------|-------------|
| **Game startup**（无游戏实例） | 应用冷启动 + `loadMods()` | `mod-loader.ts` |
| **Save startup / Control** | `InitMods` → lifecycle 链 | `init-mods.tsx` |
| **`data.raw` 冻结原型表** | **RuntimeRegistry 冻结快照** | `runtime-registry.ts` |

---

## Game startup 映射

| Factorio 三轮 | ai-life-sim | 实现 |
|---------------|-------------|------|
| `settings.lua` × 3 | Settings 阶段 | `settings-stage.ts` + `ModLifecycleV3` |
| `data.lua` × 3 | Prototype 阶段 | `prototype-stage.ts`（manifest / subsystems / provides） |
| 共享 Lua 丢弃 | TS 模块常驻 | 用**窄 importer** 模拟隔离 |

### Importer 三分法（codegen）

| 用途 | 生成常量 | import 目标 |
|------|----------|-------------|
| control.lua | `MOD_CONTROL_IMPORTERS` | `@/mods/{name}/_internal/control` |
| data 子系统 | `MOD_SUBSYSTEM_IMPORTERS` | `@/mods/{name}/subsystems/{file}.ts`（按 manifest 逐文件） |
| Remote API | `MOD_API_IMPORTERS` | `@/mods/{name}`（index.ts） |

### RuntimeRegistry（data.raw 等价）

loader 完成 lifecycle + onLoad 后，`InitMods` 调用 `runtimeRegistry.freeze()`，此后只读：

| 字段 | 含义 |
|------|------|
| `dependencies` | MOD 加载序列由依赖图自动解析 |
| `mods` | 各 MOD manifest 快照 |
| `provides` | 能力 → 提供方 |
| `activeSubsystems` | 已注册子系统 id → mod |
| `remoteApis` | 各 MOD 已注册 Remote 函数 |

---

## Save startup 映射

| Factorio | ai-life-sim | 约束 |
|----------|-------------|------|
| `control.lua` | `_internal/control.ts` | 仅 lifecycle，无业务 barrel |
| `on_init` | `lifecycle.onInit` | 可改 game state |
| `migrations/` | `migrations/` + `autoMigrateFromDir` | 每文件一次 |
| `on_load` | `lifecycle.onLoad` | 只重建内存/事件 |
| `on_configuration_changed` | `notifyConfigurationChanged` | MOD 增删/版本变更 |

### 启动顺序（InitMods）

```
loadMods (Phase 0–2)
  → runSettingsStage (control importer)
  → runPrototypeStage (subsystem importer 校验)
  → autoMigrateFromDir
  → invokeModLifecycles (control importer)
  → registerModRemoteApis (api importer，onInit 后)
  → notifyConfigurationChanged（如有变更）
  → invokeModOnLoad
  → runtimeRegistry.freeze()   ← Phase 10
```

---

## 叙事回合映射（Phase 10）

| 概念 | 实现 | 模块 |
|------|------|------|
| 叙事 LLM 输出 | `narrativeParser.parse()` | `narrative-parser-system.ts` |
| 拦截器链（3 步） | safety → schema → deadLoop | `narrative-interceptor-pipeline.ts` |
| 状态提交总线 | `RoundCommitBus.commit()` | `round-commit-bus.ts` |
| 唯一写入路径 | `orchestrator.applyRoundChanges(source)` | `orchestrator-system.ts` |
| 跨域专用校验 | `validateCrossDomainChange` | `cross-domain-change-validator.ts` |
| Simulation Worker | 跨域评估 + 校验；UI 订阅快照 | `simulation-bridge.ts` |

**硬分离**：解析 / 拦截只产出 `ParsedNarrative`；子系统 `applyChanges` 仅经 RoundCommit 触发。

---

## MOD 作者对照

| 导出类型 | 放哪里 | 禁止 |
|----------|--------|------|
| types / constants / store / hooks | `index.ts` | — |
| orchestrator 等单例 | `engine-api.ts` 等 secondaryPublicEntries | `index.ts` export 单例 |
| 重初始化 API | `world-init-api.ts` 等 | `index.ts` re-export bundle |
| lifecycle | `_internal/control.ts` | `index.ts` export lifecycle |
| 子系统类/单例 | `subsystems/*.ts` | `index.ts` 或 `subsystems/index.ts` 重 barrel（≥10 import → D-07 FAIL） |

---

## 检测器

| 规则 | 级别 | 含义 |
|------|------|------|
| A-01 | **FAIL** | index 导出 subsystems / bundle / `export *` |
| A-14 | **FAIL** | index 导出引擎单例 |
| A-17 | **FAIL** | 缺 control.ts 或 index 导出 lifecycle |
| D-07 | **FAIL** | `subsystems/index.ts` ≥10 相对 import |

---

*与 `ARCHITECTURE-ITERATION-PLAN.md` Phase 10 同步。*
