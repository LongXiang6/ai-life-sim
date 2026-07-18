# MOD 架构优化设计 —— 降低 AI 认知负担的自动化模板体系

> 状态：设计稿 | 版本：一版
> 用途：定义各 MOD 内每个文件的职责边界、填写规范、占位符格式。AI 打开任一 MOD 只需按此文档填空。
> 前置：模拟系统全面重写讨论计划书（`simulation-rewrite-discussion-plan.md`）

---

## 〇、设计目标

当前 18 个 MOD（mod-religion、mod-diplomacy、mod-fate-prophecy 待创建）、73 个子系统的结构虽然统一了 manifest 接口，但在更细的粒度上缺乏约束——同样的 `collectState` 方法，有的读 `getAgeYearsDelta`、有的不读；跨系统数据用 `as Record<string, unknown>` 强转；applyChanges 有的抛异常有的静默忽略。

重构后的 ARCHITECTURE 应达到四个目标：

| 目标 | 含义 |
|------|------|
| **填空而非解题** | AI 打开一个子系统文件，看到的是带有占位符的模板，知道"这里填什么类型、输出什么结构"，不需要翻其他文件去猜 |
| **编译期安全** | foundation 层定义跨域数据契约，跨系统读数据走类型安全的读取器，路径写错编译报错而非运行时静默 undefined |
| **统一时间源** | TimeSystem 以"天"为唯一最小单位；所有子系统从 `daysPassed` / `context.totalDays` 读取时间，不再各自维护年/月/日缩放 |
| **自检自动化** | 每个 MOD 完成填空后可跑 `npm run gate-check` 自动校验是否缺文件、缺导出、manifest 字段不匹配 ⚠️**待建设**（见下方现状说明） |

**现状说明**：`scripts/check/domains/` 目前的 scanner（wiring / loader / mod / ui / narrative / calibration）**不校验**本文档新增的约定——子系统是否 `extends BaseSubsystem`、契约文件是否存在、§一文件存在性约束表是否满足。这些校验能力尚未落地，属于后续待建设的 checker 任务，本文档描述的是目标状态而非当前 `gate-check` 已有能力，恢复子系统时不能仅凭 `gate-check` 通过就认为符合本文档规范，仍需人工核对。反过来，迁移期 `gate-check` 的旧规则 FAIL 也不能直接逐行硬修，必须先按 MVP 蓝图建立“真实阻断 / 检测器误报 / 迁移期应降级 / MVP 后处理”分流表。

---

## 一、标准 MOD 目录树 —— 固定文件清单

每个 MOD（无论 page 类还是 subsystem 类）的目录、公开入口和通信约定，以实际代码、manifest 类型和 `.agents/skills/ai-life-sim-mod-development/references/mod-spec-architecture.md` 为准。本文档不重复维护第二份完整检查表。

核心结构提要：`manifest.ts`/`index.ts`/`types.ts`/`constants.ts` 必填（后两者内容为空时至少留占位或说明性注释）；`store.ts` 无状态不建；`_internal/control.ts` 永远存在（可 `export {}`）；`subsystems/`/`prompts/`/`utils/`/`components/` 按需。

---

## 二、抽象基类 —— 所有子系统的统一契约

`core/subsystem-base.ts` 中的轻量抽象基类 `BaseSubsystem`（**已实际建成**，implements `ISubSystemV2`）。所有子系统继承它，而非直接实现 `ISubSystem` 接口。完整代码见该文件本身（代码不会和自己产生不一致，是最权威的来源）；项目上下文见 `.agents/skills/ai-life-sim-mod-development/references/mod-spec-subsystem.md`。

基类提供：4 个必填声明（id/mod/label/description）+ 3 个必实现方法（collectState/applyChanges/reset）+ 4 个有默认空实现的可选方法（advance/collectStateUpdate/collectStateFinalFix/formatForPrompt）+ 3 个共享工具方法（clamp/getDaysPassed/readSubsystem）。

### 为什么需要它

| 没有基类时（当前） | 有基类后 |
|---|---|
| AI 需要翻阅多个子系统文件来"猜测"应该实现哪些方法 | AI 只需看基类，`abstract` 标记的方法就是必做项 |
| 有的子系统用 `getAgeYearsDelta`、有的用 `context.ageYearsDelta`、有的硬编码 | 统一走 `this.getDaysPassed(context)` |
| 跨系统数据用 `as Record<string, unknown>` 强转，路径写错编译不报错 | 走 foundation 契约的类型安全读取器 |
| `clamp`、`limit` 等工具函数各写各的 | 基类提供，共享使用 |

### 前置条件

基类依赖 `RoundContext` 上存在 `daysPassed: number` 和 `totalDays: number` 两个字段。当前代码中这两个字段已在 `foundation/types/subsystem.types.ts` 落地，并由 `TimeSystem` / `orchestrator-system.ts` 注入。旧的 `ageYearsDelta`、`calendarDaysDelta`、`simulationTicks` 已从 RoundContext 删除。详细说明见 §八附。

### 迁移范围（强制，非可选）

当前代码仍处于迁移中间态：2026-07-04 扫描为 74 个 `*-system.ts`，73 个仍是 `class XxxSystem implements ISubSystem`，1 个已继承 BaseSubsystem。引入基类后，**每个本轮新建、触碰、清空或恢复的子系统文件必须完成以下机械改动**，不得只新建基类而不迁移本轮调用方；未触碰旧文件不要无关批量迁移：

1. import 行：`import type { ISubSystem, ... } from '@/foundation'` → 改为额外 `import { BaseSubsystem } from '@/core/subsystem-base'`，`ISubSystem` 仅在需要显式标注类型时保留。
2. 类声明行：`class XxxSystem implements ISubSystem` → `class XxxSystem extends BaseSubsystem`。
3. 删除子类中与基类默认实现重复的样板（如 `advance`/`collectStateUpdate` 的空实现，除非有自定义逻辑）。
4. 所有读天数的代码统一改为 `this.getDaysPassed(context)`，删除 `getAgeYearsDelta(context)`、`context.ageYearsDelta`、`context.simulationTicks` 等旧调用（见 §八附「彻底删除」清单）。
5. 跨子系统读取数据的地方，把 `as Record<string, unknown>` 强转改为 `this.readSubsystem<XxxContract>(context, 'xxx-id')`。

这一步不是"设计完基类就完事"，而是随每个子系统在恢复段中逐个执行的清单。对应模板和项目上下文位于 `.agents/skills/ai-life-sim-mod-development/`。

---

## 三、Foundation 跨域数据契约 —— 类型安全的子系统间通信

`foundation/subsystem-contracts/` 目录（**已建成空聚合入口**，随恢复段逐个补充契约文件）。完整目录结构、契约文件模板、使用方式对比（旧写法 `as Record<string, unknown>` 强转 vs 新写法 `readSubsystem<T>()`）、契约生成时机与维护约定见 `.agents/skills/ai-life-sim-mod-development/references/mod-spec-subsystem-contracts.md`。

---

## 四、标准子系统文件模板 —— AI 填空骨架

每个子系统 `.ts` 文件的标准模板位于 `.agents/skills/ai-life-sim-mod-development/assets/templates/subsystem.template.ts`。本文档不重复贴模板全文，避免两处手动同步。

模板包含的核心结构：

- 文件头注释（职责 / 输入 / 输出 / 向 AI 注入 / 存储键，§十一 1.1 格式）
- `class {SubsystemName}System extends BaseSubsystem`（§二 迁移范围）
- `collectState` / `applyChanges` / `reset` 三个必填方法的填空区注释（A/B）
- `advance` / `formatForPrompt` / `collectStateUpdate` 三个可选方法的填空区注释（D/C/E）
- 文件末尾附带的"清空状态注释模板"（对应下方 §五）

### 填空区说明

| 填空区 | 何时使用 | AI 需要做的事情 |
|--------|---------|---------------|
| A | 每个子系统必填 | 基于 `daysPassed` 整数推进模拟，生成 summary 文本 |
| B | 每个子系统必填 | 解析 `changes.changes` 中的具体字段，先做类型转换再应用到状态 |
| C | 少数子系统需要 | 在第一轮全部收集完成后，基于其他子系统的最新状态修正自己的状态 |
| D | 需本地模拟的子系统 | 在非叙事回合执行纯规则计算（人口增长、市场波动等），不调 AI |
| E | 少数子系统需要 | 覆盖基类默认的 `formatForPrompt`，生成额外格式化文本注入 Prompt |

---

## 五、清空状态下的注释模板

当子系统被清空但结构保留时，方法体使用统一注释格式（而非只写一行 `// TODO`）。当前模板位于 `.agents/skills/ai-life-sim-mod-development/assets/templates/subsystem.template.ts`，本文档不重复贴出。

---

## 六、Manifest 模板 —— 标准声明格式

完整字段列表、依赖前缀速查表（硬依赖/软引用 `~`/可选 `?`/冲突 `!`），以 `foundation/types/mod.types.ts` 的 `ModManifest`/`ModManifestV2` 与 `.agents/skills/ai-life-sim-mod-development/references/mod-spec-architecture-extended.md` 为准；模板位于 `.agents/skills/ai-life-sim-mod-development/assets/templates/mod-manifest.template.ts`。

---

## 七、Store 模板 —— 持久化状态的标准写法

Store 模板位于 `.agents/skills/ai-life-sim-mod-development/assets/templates/mod-store.template.ts`（Zustand + persist 到 localStorage，存储键格式 `mod-[领域名]:persist:[store名]`）。本文档不重复贴代码。

**重要提醒**（模板文件里已有，这里再强调一次因为容易被忽略）：store 结构变更时（字段重命名、新增必填字段）必须实现 `migrate` 函数处理旧版本数据，否则用户旧存档会崩溃。

---

## 八、时间引擎的统一接口

时间系统分两层，禁止混淆：

- **底层时间粒度**：唯一最小单位是"天"。`TimeSystem` 只向外提供整数 `daysPassed` 与 `totalDays`。
- **叙事推进步长**：玩家每次点击推进就是一个叙事轮次；默认步长是 1 年，但玩家可切换为日 / 月 / 季 / 年。步长只决定本轮换算出多少 `daysPassed`，不改变底层日粒度。
- **步长切换不等于时间推进**：切换 `timeStep` 不能修改 `round` / `totalDays` / `daysPassed`，只能影响下一次 `TimeSystem.advance()` 的换算结果。开局默认年推进时，玩家切换到日 / 月 / 季不能被动跳过一年。

所有子系统读取时间的唯一方式是：

```typescript
const daysPassed = this.getDaysPassed(context)  // 返回整数
```

不再存在以下模式：
- ❌ `getAgeYearsDelta(context)` → 年增量浮点数
- ❌ `context.ageYearsDelta` → 直接读 context 上的可选字段
- ❌ `context.simulationTicks` → 年累加器模式
- ❌ `for (let y = 0; y < years; y++)` → 零循环冻结

时间引擎负责将整数的天数转换为子系统需要的周期判断：

```typescript
// 所有子系统使用统一的整数天模式：

const days = this.getDaysPassed(context)        // 整数

// 当前叙事轮次可能来自日/月/季/年任一玩家步长。
// 子系统不关心玩家选择的是哪个按钮，只处理 TimeSystem 换算后的 days。

// 如果需要年粒度判断：
const currentYear = Math.floor(context.totalDays / 365)

// 如果需要月粒度判断：
// 伪代码：复用 TimeSystem/历法常量按 DAYS_IN_MONTH 累加换算，禁止用 /30 近似真实月份。
const dayOfYear = (context.totalDays % 365) + 1
const currentMonth = monthIndexFromDayOfYear(dayOfYear, CALENDAR.DAYS_IN_MONTH) + 1

// 如果需要季节判断：
const season = Math.floor((currentMonth - 1) / 3)  // 0=春 1=夏 2=秋 3=冬

// 如果需要按周期触发（如每 30 天结算一次）：
this._dayAccumulator += days
while (this._dayAccumulator >= 30) {
  // 执行月结算逻辑（循环处理多周期跨越）
  this._dayAccumulator -= 30
}
```

当前引擎口径为固定 365 天、2 月 28 天、不实现闰年；若后续要改闰年，必须同步修改 TimeSystem、`CALENDAR` 常量、RoundContext 说明和所有恢复蓝图，不能只改文档。

叙事步长换算口径：日 = 1 天；月 = 从当前日期推进到下个月同序位置所跨的真实月份天数；季 = 从当前月份起连续 3 个真实月份天数之和；年 = 365 天。换算结果写入 `daysPassed`，累计结果写入 `totalDays`。

### 附：RoundContext 扩展说明

`RoundContext`（`foundation/types/subsystem.types.ts`）字段处理方式分三组，**不是笼统的"现有字段保留"**：

| 分组 | 字段 | 处理 |
|------|------|------|
| 保留不动 | `worldId` `characterId` `round` `timeStep` `difficulty` `subsystemStates` `lastNarrativeText` `eraStartYear` `birthEraYear` `essenceTag` | 与本次时间引擎重写无关，原样保留 |
| **彻底删除**（⚠️ 实际影响面已核实，见下方修正） | `ageYearsDelta` `calendarDaysDelta` `simulationTicks` | 连同 `foundation/utils/round-advance.ts` 中的 `getAgeYearsDelta`/`consumeSimulationYears` 一并删除。不做兼容层、不标记 `@deprecated` 过渡——讨论计划书 §二已明确"消除年累加器" |
| 新增 | `daysPassed` `totalDays` | 见下 |

**当前状态修正（2026-07-04 再核实）**：`RoundContext.daysPassed`/`totalDays` 已落地；`mod-engine/subsystems/orchestrator-system.ts` 已注入这两个字段；`mod-engine/utils/time-step-resolver.ts` 只保留步长规范化；`foundation/utils/round-advance.ts` 只保留 `roundSequence` 读取。此前关于"活跃子系统旧字段影响面必须合并删除"的记录是历史中间态，不再作为当前执行事实。执行前仍需全量搜索 `ageYearsDelta` / `calendarDaysDelta` / `simulationTicks` / `getAgeYearsDelta` / `consumeSimulationYears`，并区分历史注释、清空说明和真实活代码。

```typescript
export interface RoundContext {
  // ... 保留不动的字段（worldId / round / timeStep / difficulty / subsystemStates 等，见上表）...

  /** 本轮推进天数（自上次收集以来的天数增量，整数） */
  daysPassed: number
  /** 游戏总天数（整数，唯一权威时间源） */
  totalDays: number

  // ageYearsDelta / calendarDaysDelta / simulationTicks 已删除，不再存在于此接口
}
```

**数据流向**：

```
TimeSystem.advance(nDays)
  │  产出：totalDays（累加后）、daysPassed（本轮增量）
  ▼
OrchestratorSystem 组装 RoundContext
  │  将 TimeSystem.totalDays 和 daysPassed 注入 context
  ▼
所有子系统 collectState(context)
  │  通过 this.getDaysPassed(context) 读取天数增量
  │  通过 context.totalDays 读取总天数（如需要年/月/季计算）
  ▼
各子系统基于整数天数推进内部模拟
```

**关键约束**：
- `daysPassed` 是本轮增量，`totalDays` 是累计总量——不要混淆
- 所有时间判断必须基于这两个字段，禁止使用 `ageYearsDelta`、`simulationTicks` 等旧字段
- TimeSystem 是这两个字段的唯一写入者，子系统只读

## 九、Summary 文本格式规范

所有子系统的 `collectState` 返回的 summary 遵守统一格式：

```
【{label}】{字段1}：{值1} | {字段2}：{值2} | ...
```

具体规则：

| 规则 | 说明 |
|------|------|
| 前缀 | `【{中文标签}】`，全角方括号 |
| 分隔符 | ` | `（空格 + 竖线 + 空格） |
| 每条约 2-5 对键值 | 不超过 200 字符 |
| 数值变化类 | 变化量大时标注趋势箭头 |
| 百分比 | 显示百分号，不显示浮点小数 |

---

## 十、代码生成管线

以下文件由 `npm run generate:wiring`（`scripts/codegen/generate-mod-wiring.mjs`）自动生成，**禁止手动编辑**：

| 生成文件 | 所在位置 | 内容 |
|----------|---------|------|
| `registry.generated.ts` | `src/mods/` | 收集所有 manifest 到 MOD_REGISTRY |
| `mod-control-importers.generated.ts` | `src/core/mod-loader/` | _internal/control.ts 的动态导入映射 |
| `mod-subsystem-importers.generated.ts` | `src/core/mod-loader/` | 子系统文件的导入映射 |
| `mod-importers.generated.ts` | `src/core/mod-loader/` | MOD index.ts 的动态导入映射 |
| `mod-secondary-api-importers.generated.ts` | `src/core/mod-loader/` | secondaryPublicEntries 的导入映射 |
| `remote-contracts.generated.ts` | `src/core/mod-loader/` | Remote API 契约 |
| `compat-importers.generated.ts` | `src/core/mod-loader/` | 兼容性导入映射 |
| `migration-importers.generated.ts` | `src/core/mod-loader/` | 迁移脚本导入映射 |
| `all-stores.generated.ts` | `src/mods/mod-engine/bootstrap/` | Store 注册表 |
| `engine-subsystems.generated.ts` | `src/mods/mod-engine/bootstrap/` | 引擎子系统注册表 |
| `events.generated.ts` | `src/mods/mod-engine/bootstrap/` | 事件注册表 |
| `mod-importers.generated.ts` | `src/mods/mod-engine/bootstrap/` | MOD 导入器（引擎侧） |
| `prompt-context-contract.generated.ts` | `src/mods/mod-engine/bootstrap/` | Prompt 上下文契约 |
| `subsystem-aliases.generated.ts` | `src/mods/mod-engine/bootstrap/` | 子系统别名映射 |
| `stages.generated.ts` | `src/mods/mod-engine/campaigns/default/` | 叙事阶段列表 |
| `subsystem-field-keys.generated.ts` | `src/mods/mod-engine/helpers/` | 子系统字段键名映射 |
| `adaptation-prompt-registry.generated.ts` | `src/mods/mod-engine/helpers/` | 适配 Prompt 注册表 |

AI 在新增或删除子系统时**不需要手改这些生成文件**——只需确保 manifest 声明正确，然后运行代码生成命令。

**注意**：以上 codegen 管线校验的是 manifest/import 接线的一致性（wiring 层面），**不会**校验本文档 §二~§五 提出的 BaseSubsystem 继承、契约文件存在性、文件存在性约束表等更细粒度约定——这部分仍需人工核对（同 §〇「自检自动化」现状说明）。

---

## 十一、AI 文档规范

### 11.1 文件头部注释（每个源文件都必须有）

```typescript
/**
 * [文件用途一句话]
 *
 * @mod mod-[领域名]
 */
```

### 11.2 方法注释（仅 complex 逻辑需要）

```typescript
/**
 * [一句话说明]
 *
 * 输入：[关键参数说明]
 * 输出：[返回值说明]
 */
collectState(context: RoundContext): SubSystemState { ... }
```

### 11.3 不要注释的内容

- 自解释代码（如 `this._dayAccumulator += days`）
- 简单的 getter/setter
- 重复基类的接口定义

---

*关联文件：`simulation-rewrite-discussion-plan.md`（讨论计划书，已确认全部决策）*
