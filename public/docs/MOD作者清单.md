# MOD 作者清单

> 一页纸速查：新建 MOD、声明 manifest、自动接线与校验。详细规范见 `.agents/skills/mod-dev-skill/`。

## 新建 MOD（3 步）

1. **创建目录**（推荐脚手架）：
   ```bash
   npm run mod:create mod-my-feature
   npm run mod:create mod-my-feature -- --with-subsystem
   npm run mod:create mod-my-feature -- --with-subsystem CustomName
   ```
   或手动在 `src/mods/` 下创建 `mod-{kebab-case}/`，含 `manifest.ts`、`types.ts`、轻量 `index.ts`、`_internal/control.ts`。

2. **编辑 manifest.ts**：填写 `dependencies`、`provides`、`consumes`、`subsystems` 等。

3. **启动开发服务器**（自动 codegen + 注册）：
   ```bash
   npm run dev
   ```

## manifest 字段速查

| 字段 | 说明 |
|------|------|
| `dependencies` | 硬依赖 `'mod-world'`；软引用 `'~ mod-xxx'` 或 `'~mod-xxx'`；可选 `'? mod-xxx'`；冲突 `'! mod-xxx'` |
| `provides` | 本 MOD 提供的能力 id（其他 MOD 可 `consumes`） |
| `consumes` | 使用的能力 id（须在 registry 某 MOD 的 `provides` 中存在） |
| `subsystems` | 子系统类名列表；在 `subsystems/*.ts` 实现，**由 codegen 按文件注册**（勿建 ≥10 import 的 `subsystems/index.ts` barrel） |
| `secondaryPublicEntries` | 重 API 独立入口（如 `world-init-api.ts`），与轻量 `index.ts` 分离 |

## 子系统加载红线（A-13~16）

| 禁止 | 正确做法 |
|------|----------|
| `subsystems/index.ts` 顶层 `export const x = new XxxSystem()` | 只导出类；由 `registerAllSubsystems` 实例化 |
| 构造期 / `createInitialState` 读 Store、`getFormulaModifier` | 初始状态纯默认值；运行期再读校准 |
| 非 mod-engine 静态 `import { orchestrator }` | `await import('@/mods/mod-engine')` |
| `index.ts` re-export 重 bundle（如 world-init-bundle） | 拆到 `secondaryPublicEntries` 文件 |

页面级单例：`getXxxSystem()` 懒加载 getter（见 `mod-character/destiny-pattern-access.ts`）。

## 禁止手写（codegen 自动生成）

| 文件 | 生成命令 |
|------|----------|
| `src/mods/registry.generated.ts` | `npm run generate:wiring` |
| `src/core/mod-loader/mod-importers.generated.ts` | 同上 |
| `src/core/mod-loader/compat-importers.generated.ts` | 扫描 `compatibility/` |
| `src/core/mod-loader/migration-importers.generated.ts` | 扫描 `migrations/` |
| 子系统别名 / engine-subsystems / remote-contracts 等 | 同上 |

`dev` / `build` 启动前会自动运行 codegen。

## 常用命令

| 命令 | 用途 |
|------|------|
| `npm run mod:create mod-xxx` | 创建 MOD 骨架 |
| `npm run dev` | 开发（自动 codegen） |
| `npm run check:structural` | **ATCE 编码前**（wiring + loader，= quick） |
| `npm run check:refactor` | 架构重构（structural + mod，无 UI/叙事） |
| `npm run check:quick` | L1 关闸 C3（同 structural） |
| `npm run check:changed` | 按 git 变更选域 + 结构性叠加 |
| `npm run check:wiring` / `check:mod` / `check:ui` | 单域扫描 |
| `npm run check` | 全量扫描（6 域，默认静默；详情见 `reports/check-run-*.json`） |
| `npm run check:verbose` | 全量扫描 + 完整控制台输出 |
| `npm run gate-check:quick` | L1 关闸（lint + tsc + check:quick，静默） |
| `npm run gate-check` | L2/L3 全量关闸（默认静默；`--verbose` 完整输出） |
| `npm run test:loader` | 仅 MOD 加载器回归 |
| `npm run generate:deps` | 生成依赖图 `reports/mod-dependency-graph.md` |
| `npm run lint` | ESLint |

## 可忽略的 WARN（非阻塞）

以下 WARN 多为**前瞻声明**或**尚未接线的 emit**，不影响 `npm run dev`：

- **D8-ORPHAN-EMIT**：代码或 manifest 声明了事件，尚无监听方
- **D14-EMIT-UNUSED**：manifest.emits 声明了事件，代码尚未 emit
- **D9-CONSUME-DEP**：consumes 的能力存在，但未在 dependencies 中声明 provider（建议补软依赖）

**FAIL 必须修复**，否则 MOD 可能无法加载。

扫描报告：`reports/check-run-*.json`（含 **`atceRecommendation`**、`refactorSignals`）· 模板：`.agents/skills/ai-life-sim-skill/resources/atce-template.md`

**架构 bug**：先 `npm run check:structural`，读 `atceRecommendation`（`REVIEW` = 有 REFACTOR-HINT，需 ATCE 表再决定 patch/重构）。

## 加载失败常见原因

| 控制台错误 | 处理 |
|------------|------|
| `useWorldStore.getState is not a function` | 模块加载环：查 A-13~16；运行 `npm run check:quick` |
| `消费的能力 "X" 没有 MOD 提供` | 某 MOD 的 `provides` 缺少 X，或 dependencies 未声明 provider |
| `循环依赖检测` | 双向硬依赖改软依赖 `~ mod-xxx` |
| `依赖 MOD "~mod-xxx" 不存在` | 软依赖前缀格式错误，应用 `~ mod-xxx` 或 `~mod-xxx` |

InitMods 会在错误后输出 **修复提示** 行。

## MOD 间通信

仅允许三种方式：

1. 导入目标 MOD 的 `index.ts` 公共 API（须在 dependencies 声明）
2. 导入 manifest `secondaryPublicEntries` 声明的重 API 入口（如 `@/mods/mod-world/world-init-api`）
3. 事件总线 `eventBus` / 共享 Store（global-store slices）

禁止跨 MOD 导入 `_internal/` 或未声明的深层路径。

详细规范 → `docs/ARCHITECTURE-ITERATION-PLAN.md`、`.agents/skills/mod-dev-skill/resources/mod-spec-architecture.md` §6.55
