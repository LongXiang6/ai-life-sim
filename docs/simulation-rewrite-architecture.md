# 模拟子系统架构契约

文档角色：architecture
权威层级：A3
状态：active
体系路径：project > simulation-runtime > subsystem-architecture
上级目标：为运行子系统、跨域契约、持久化和生成接线提供唯一架构边界
下级组成：BaseSubsystem、世界上下文与历史事件 Foundation 契约、RoundContext、Store 投影、模板与生成接线
适用范围：MOD 目录、BaseSubsystem、Foundation 跨域契约、追加式事实 Store、生成接线与子系统模板
拥有者：`ai-life-sim-mod-development` 与 live architecture sources
最后验证：2026-07-20；对照 P0 世界上下文契约、P1 历史事件契约、RoundContext、字段契约、提交回滚、owning Store、save/restore、当前 Skill 与生成接线
取代关系：合并原日期型核心架构执行文档中的字段、平衡和提交规则
运行真源：`src/core/subsystem-base.ts`、`src/foundation/types/mod.types.ts`、`src/foundation/subsystem-contracts/`、生成接线脚本
验收证据：治理检查、活动引用审计、结构检查、P0 世界上下文回归；P1 运行验收以蓝图第 15.6 节登记为准

用途：定义各 MOD 内文件的职责边界、跨域数据、AI 可写字段、提交所有权和生成接线。

---

## 〇、设计目标

项目 MOD 已统一 manifest 入口，但更细粒度的子系统职责、跨域契约和 applyChanges 所有权仍必须由 live source 与系统职责索引约束。静态 MOD 或子系统数量不在本文档重复维护。

重构后的 ARCHITECTURE 应达到四个目标：

| 目标 | 含义 |
|------|------|
| **填空而非解题** | AI 打开一个子系统文件，看到的是带有占位符的模板，知道"这里填什么类型、输出什么结构"，不需要翻其他文件去猜 |
| **编译期安全** | foundation 层定义跨域数据契约，跨系统读数据走类型安全的读取器，路径写错编译报错而非运行时静默 undefined |
| **统一时间源** | TimeSystem 以"天"为唯一最小单位；所有子系统从 `daysPassed` / `context.totalDays` 读取时间，不再各自维护年/月/日缩放 |
| **自检自动化** | manifest、生成接线、结构和领域检查由项目脚本验证；无法静态证明的业务责任仍按 owning system 与专项回归人工核对 |

`gate-check` 只能证明已登记的自动关闸通过，不能单独证明系统责任、运行存活性或真实玩家路径成立。恢复子系统时同时核对 `BaseSubsystem`、Foundation 契约、manifest、运行策略、owning Store、AI 字段和专项验收；迁移期旧扫描失败按“真实阻断 / 检测器误报 / 延后债务”分流，不为迎合扫描器反向改变活动契约。

---

## 一、标准 MOD 目录树 —— 固定文件清单

每个 MOD（无论 page 类还是 subsystem 类）的目录、公开入口和通信约定，以实际代码、`src/foundation/types/mod.types.ts`、`src/core/mod-loader/` 与 `.agents/skills/ai-life-sim-mod-development/SKILL.md` 为准。本文档不重复维护第二份完整检查表。

核心结构提要：`manifest.ts`/`index.ts`/`types.ts`/`constants.ts` 必填（后两者内容为空时至少留占位或说明性注释）；`store.ts` 无状态不建；`_internal/control.ts` 永远存在（可 `export {}`）；`subsystems/`/`prompts/`/`utils/`/`components/` 按需。

---

## 二、抽象基类 —— 所有子系统的统一契约

`src/core/subsystem-base.ts` 中的轻量抽象基类 `BaseSubsystem` 是新建或恢复子系统的当前基线。完整契约以该文件、`src/foundation/types/subsystem.types.ts` 和 `.agents/skills/ai-life-sim-mod-development/SKILL.md` 为准；不得从历史快照复制第二份接口。

基类提供：4 个必填声明（id/mod/label/description）+ 3 个必实现方法（collectState/applyChanges/reset）+ 4 个有默认空实现的可选方法（advance/collectStateUpdate/collectStateFinalFix/formatForPrompt）+ 3 个共享工具方法（clamp/getDaysPassed/readSubsystem）。

### 为什么需要它

| 没有基类时 | 使用基类后 |
|---|---|
| AI 需要翻阅多个子系统文件来"猜测"应该实现哪些方法 | AI 只需看基类，`abstract` 标记的方法就是必做项 |
| 有的子系统用 `getAgeYearsDelta`、有的用 `context.ageYearsDelta`、有的硬编码 | 统一走 `this.getDaysPassed(context)` |
| 跨系统数据用 `as Record<string, unknown>` 强转，路径写错编译不报错 | 走 foundation 契约的类型安全读取器 |
| `clamp`、`limit` 等工具函数各写各的 | 基类提供，共享使用 |

### 前置条件

基类依赖 `RoundContext` 上存在 `daysPassed: number` 和 `totalDays: number` 两个字段。当前代码中这两个字段已在 `foundation/types/subsystem.types.ts` 落地，并由 `TimeSystem` / `orchestrator-system.ts` 注入。旧的 `ageYearsDelta`、`calendarDaysDelta`、`simulationTicks` 已从 RoundContext 删除。详细说明见 §八附。

### 迁移范围（强制，非可选）

项目仍允许未触碰的延后系统保留历史实现，但**每个本轮新建、触碰、清空或恢复的子系统文件必须完成以下机械改动**；不得只修改抽象层而不迁移本轮调用方，也不得为统一形式无关批量迁移全部旧文件：

1. import 行：`import type { ISubSystem, ... } from '@/foundation'` → 改为额外 `import { BaseSubsystem } from '@/core/subsystem-base'`，`ISubSystem` 仅在需要显式标注类型时保留。
2. 类声明行：`class XxxSystem implements ISubSystem` → `class XxxSystem extends BaseSubsystem`。
3. 删除子类中与基类默认实现重复的样板（如 `advance`/`collectStateUpdate` 的空实现，除非有自定义逻辑）。
4. 所有读天数的代码统一改为 `this.getDaysPassed(context)`，删除 `getAgeYearsDelta(context)`、`context.ageYearsDelta`、`context.simulationTicks` 等旧调用（见 §八附「彻底删除」清单）。
5. 跨子系统读取数据的地方，把 `as Record<string, unknown>` 强转改为 `this.readSubsystem<XxxContract>(context, 'xxx-id')`。

这一步不是"设计完基类就完事"，而是随每个子系统在恢复段中逐个执行的清单。对应模板和项目上下文位于 `.agents/skills/ai-life-sim-mod-development/`。

---

## 三、Foundation 跨域数据契约 —— 类型安全的子系统间通信

`src/foundation/subsystem-contracts/` 是 provider-owned 跨域类型契约入口。目录结构、当前契约和使用方式以 live source 与 `.agents/skills/ai-life-sim-mod-development/SKILL.md` 为准；`readSubsystem<T>()` 提供编译期类型，不替代运行时验证。

### 3.1 P0 世界上下文契约

`src/foundation/subsystem-contracts/world-context.contract.ts` 是多世界 P0 的跨域纯类型权威，统一声明：

- 稳定 `WorldContextId`、`GlobalEntityId`、空间节点和空间边 ID。
- 世界、宇宙、位面、星球、区域、场景等显式 `WorldContextKind`。
- `active/background/dormant/closed` 模拟范围与 `open/dormant/closed` 生命周期。
- 能力画像、空间图、实体位置、当地历法、当地时钟和上下文切换请求/结果。

业务实现归 `mod-world`，Foundation 只拥有纯数据边界。上下文注册、空间写入、范围变化和切换原子性必须通过 owning system；其他 MOD 不得直接修改 world Store 的完整注册表。

### 3.2 当前上下文兼容投影

`mod-world` Store 保存完整 `contexts`、`currentContextId`、跨上下文出口和不截断的切换记录，同时继续向旧页面和调用方投影 `worldConfig/entities/worldCode/...`。这些旧字段只表示当前上下文，不是第二份业务真源：

1. 当前投影的合法写入同步回当前 `WorldContextInstance`。
2. 切换前保存来源投影，切换后一次性投影目标实例。
3. 旧单世界数据迁移为首个 active 上下文，不要求玩家重开。
4. `worldCode` 只保留生成缓存和兼容用途，不作为上下文或实体主键。

### 3.3 P1 历史事件契约与内部组件边界

`src/foundation/subsystem-contracts/historical-event.contract.ts` 是 P1 历史事实的 provider-owned 纯类型权威，统一声明稳定事件 ID、`global/context/travel/cross-context` 作用域、事件状态、状态迁移、证据、带通用能力要求的候选审计、显式因果边、原子批次、有界查询和 Store v2 持久化快照。Foundation 不拥有业务状态，也不允许调用方绕过 owning MOD 直接写 Store。

P1 的运行组成固定为：

| 节点 | 形态 | 责任 | 非责任 |
|---|---|---|---|
| `historical-event-ledger` | `HistoricalEventLedgerSystem extends BaseSubsystem` | 唯一拥有事件事实、迁移、证据、候选审计、因果边、查询、预检和原子追加 | 不创作正文、不随机生成题材事件、不替代延期叙事承诺 |
| `candidate-provider` | `src/mods/mod-history-dynamics/components/event-candidate-provider.ts` 中的 `EventCandidateProvider` 内部组件 | 把显式候选和 `available/accepted/rejected/expired` 决定写成追加式审计，规范化 `requiredCapabilities`，候选接受后才由账本建立事实 | 不实现 `ISubSystem`、不拥有 Store、不把候选当成已发生事实 |
| `causal-graph` | `src/mods/mod-history-dynamics/components/causal-graph-component.ts` 中的 `CausalGraphComponent` 内部组件 | 校验既有事件端点、跨上下文覆盖和显式因果关系并构造边 | 不实现 `ISubSystem`、不从正文猜语义、不拥有 pending/resolved 队列 |

`useHistoryDynamicsStore` 的 `schemaVersion: 2` 保存 `events`、`transitions`、`evidence`、`causalEdges`、`candidateAudits` 和 `migrationMetadata` 六类追加式状态。`collectState()` 通过零完整克隆的只读 Store 选择器和缓存索引，只投影全局或显式包含当前上下文的 `scheduled/active` 事件、相关因果边与统计；完整 Store 仅通过 `capturePersistenceState()`、`restorePersistenceState()` 和编排器持久化快照保存。公开查询默认 100、最大 500 条并支持 offset；事件详情分别分页返回迁移、证据和因果关系总数。显式读档和浏览器/Zustand v2 水合在替换或使用 Store 前共用严格校验，覆盖重复 ID、状态/候选链、证据引用数组、端点和世界引用；损坏当前 Store 被隔离而不静默清空，未知未来版本拒绝。v1 事件池和因果队列迁移保留旧 payload，并在 world Store 水合后绑定该存档原当前上下文。

主叙事 Prompt `4.5.0` 不读取可被适配器改写的账本 summary，而由 `historical-event-prompt-projection.ts` 从上述公开投影确定性格式化事实 ID、状态、scope、调度和因果边；后台世界观适配器必须显式绕过该投影。浏览器负责动态投影、三层消息、缓存、解析、校验与提交，固定身份、长期写作规则和完整协议示例通过稳定资产编号由服务端白名单组装；服务端不得重复模拟计算，也不得向任意自定义 URL 下发受保护资产。当前纪年、月份和季节只在本轮层发送，原创保护位于记忆层前缀；变化驱动力可由机会、掌握、认可、休整、成功或合理冲突承担，机构介入必须来自世界规则或已建立因果。玩家专属设定保持角色归属，第一轮建立跨世界抵达或原生社会落点，不得无依据跳过数周数月。`causal-delay` 快照使用 `schemaVersion: 1`，带版本重复 ID 整包拒绝，无版本旧重复 ID 确定性重编号并保留 `legacyId`。

跨域消费者只保存账本事件 ID：记忆与核心记忆使用 `historicalEventIds`，伏笔使用 `plantedFromEventIds/resolvedByEventIds`，剧情结构使用 `lastHistoricalEventIds`，延期因果使用 `originEventId/resolutionEventId`。这些引用随 owning system 快照持久化；消费者不得复制事件正文成为第二份历史真源。

P1 运行登记完成后，MVP 为 13 个外部系统加 12 个引擎系统，共 25 个；旧 `event-pool` 和 `causal-simulation` 系统 ID 与文件已退出，新的两个内部组件不计入运行系统数量。

### 3.4 AI 可写字段单一真源

`src/mods/mod-engine/helpers/subsystem-field-registry.ts` 的 `SUBSYSTEM_FIELD_CONTRACTS` 是 AI 可写系统、字段名、类型、增量或绝对值语义、说明和校验边界的单一真源：

1. Prompt 字段指南、Zod 变更 Schema、字段映射和 generated 字段键必须从该声明派生，不得各自手写第二份字段列表。
2. owning subsystem 的 `applyChanges()` 必须只读取契约声明的字段，并负责业务校验、钳制和状态写入；契约存在不代表其他系统获得写权限。
3. 新增或修改字段时，同任务核对契约、owning implementation、运行阶段白名单、Prompt 投影、生成文件和回归；只读系统也保留显式零字段契约。
4. 字段契约负责结构与权限，具体状态类型和持久化结构仍以 owning live source 为准。

### 3.5 平衡系数与时间缩放

`src/core/shared/balance-config.ts` 是跨 MOD 平衡系数入口。时间相关增量以 `daysPassed / 365` 为统一缩放基础；难度倍数语义固定为数值越高越难。消费系统通过公开函数读取，不直接各自解释 `worldConfig.difficulty` 或复制常量。

平衡配置不拥有业务状态，也不能绕过字段契约或 owning subsystem。新增系数只在两个以上系统确需共享或属于全局语义时进入 core；局部参数继续留在 owning MOD，避免把所有数值堆入全局文件。

### 3.6 编排、预检与原子提交

Orchestrator 只拥有调用顺序、上下文组装、快照和提交协调，不计算善恶、属性、寿命、历史事件等 owning system 的业务结果。跨系统读取使用只读状态或公开查询；写入通过 `RoundCommitBus` 和 owning subsystem：

```text
AI 响应
  -> 协议解析与严格 Schema
  -> 完整变更包预检
  -> 捕获 owning subsystem 快照
  -> RoundCommitBus 分发
  -> owning subsystem 校验并写入
  -> 全部成功后确认；任一失败恢复全部快照
```

- 未知字段、契约外字段、不可写系统、非法引用或任一提交失败，整包结构化数据拒绝；不得删除非法项后部分提交。
- 合格正文与独立摘要不因可选数据包失败而丢失。
- 快照、恢复和持久化往返由 owning system 提供；Orchestrator 不复制业务 Store 成为第二份真源。
- P0 世界切换和 P1 历史事件批次同样遵循预检后原子写入，不能进入半切换或半追加状态。

---

## 四、标准子系统文件模板 —— AI 填空骨架

每个子系统 `.ts` 文件的标准模板位于 `.agents/skills/ai-life-sim-mod-development/assets/templates/subsystem.template.ts`。本文档不重复贴模板全文，避免两处手动同步。

模板包含的核心结构：

- 文件头注释（职责 / 非职责 / 输入 / 输出与写入 / AI 参与 / 状态权威 / 持久化权威 / 运行存活）
- `class {SubsystemName}System extends BaseSubsystem`（§二 迁移范围）
- `collectState` / `applyChanges` / `reset` 三个必填方法的填空区注释（A/B）
- 只在 live contract 需要时增加 `advance` / `formatForPrompt` / `collectStateUpdate` 等可选方法；模板不预生成无用方法

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

完整字段、依赖语义和公开入口以 `src/foundation/types/mod.types.ts`、live `manifest.ts`、依赖解析器和 `.agents/skills/ai-life-sim-mod-development/SKILL.md` 为准。项目不维护第二份通用 manifest 模板；修改声明后运行 `npm run generate:wiring`。

---

## 七、Store 模板 —— 持久化状态的标准写法

项目不维护通用 Store 模板。新增或修改 Store 时读取 owning MOD 的 live Store、`src/core/storage/` 和实际 save/restore 调用链；持久化键、迁移和兼容行为由 owning source 决定，不得从历史模板猜测。

Store 或存档结构变更时，必须按当前产品阶段和用户决定明确迁移或不兼容策略，并验证旧数据处理；不得留下未声明的隐式兼容行为。

---

## 八、时间引擎的统一接口

时间系统分两层，禁止混淆：

- **底层时间粒度**：唯一最小单位是"天"。`TimeSystem` 只向外提供整数 `daysPassed` 与 `totalDays`。
- **叙事推进步长**：玩家每次点击推进就是一个叙事轮次；默认步长是 1 年，但玩家可切换为日 / 月 / 季 / 年。步长只决定本轮换算出多少 `daysPassed`，不改变底层日粒度。
- **步长切换不等于时间推进**：切换 `timeStep` 不能修改 `round` / `totalDays` / `daysPassed`，只能影响下一次 `TimeSystem.advance()` 的换算结果。开局默认年推进时，玩家切换到日 / 月 / 季不能被动跳过一年。
- **延期承诺使用规范日**：P1 新建的 `causal-delay` 事项保存 `createdTotalDays` 与 `dueTotalDays`，只按唯一全局累计天数判定到期；旧存档缺少这些字段时显式保留 `legacy-round` 和原始 `triggerDelay`，禁止粗略换算。

所有子系统读取时间的唯一方式是：

```typescript
const daysPassed = this.getDaysPassed(context)  // 返回整数
```

不再存在以下模式：
- 禁止： `getAgeYearsDelta(context)` → 年增量浮点数
- 禁止： `context.ageYearsDelta` → 直接读 context 上的可选字段
- 禁止： `context.simulationTicks` → 年累加器模式
- 禁止： `for (let y = 0; y < years; y++)` → 零循环冻结

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

`RoundContext`（`foundation/types/subsystem.types.ts`）字段处理方式分四组，**不是笼统的"现有字段保留"**：

| 分组 | 字段 | 处理 |
|------|------|------|
| P0 当前身份 | `contextId` `contextScope` `characterId` | `contextId` 是当前稳定上下文 ID；`contextScope` 是运行范围；`characterId` 是全局稳定角色实体 ID |
| 兼容别名 | `worldId` | 仅等同 `contextId` 供旧子系统字段名兼容，不得继续作为独立世界主键 |
| 保留不动 | `round` `timeStep` `difficulty` `subsystemStates` `lastNarrativeText` `eraStartYear` `birthEraYear` `essenceTag` | 继续按 owning implementation 使用 |
| **彻底删除**（风险提示： 实际影响面已核实，见下方修正） | `ageYearsDelta` `calendarDaysDelta` `simulationTicks` | 连同 `foundation/utils/round-advance.ts` 中的 `getAgeYearsDelta`/`consumeSimulationYears` 一并删除。不做兼容层、不标记 `@deprecated` 过渡——讨论计划书 §二已明确"消除年累加器" |
| 新增 | `daysPassed` `totalDays` | 见下 |

**当前状态修正（2026-07-04 再核实）**：`RoundContext.daysPassed`/`totalDays` 已落地；`mod-engine/subsystems/orchestrator-system.ts` 已注入这两个字段；`mod-engine/utils/time-step-resolver.ts` 只保留步长规范化；`foundation/utils/round-advance.ts` 只保留 `roundSequence` 读取。此前关于"活跃子系统旧字段影响面必须合并删除"的记录是历史中间态，不再作为当前执行事实。执行前仍需全量搜索 `ageYearsDelta` / `calendarDaysDelta` / `simulationTicks` / `getAgeYearsDelta` / `consumeSimulationYears`，并区分历史注释、清空说明和真实活代码。

```typescript
export interface RoundContext {
  /** 当前稳定上下文 ID */
  contextId: string
  /** 当前上下文运行范围 */
  contextScope: 'active' | 'background' | 'dormant' | 'closed'
  /** 兼容别名，当前必须等于 contextId */
  worldId: string
  /** 全局稳定角色实体 ID */
  characterId: string

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
  │  注入当前 contextId/contextScope/characterId
  │  将 TimeSystem.totalDays 和 daysPassed 注入 context
  ▼
所有子系统 collectState(context)
  │  先按当前上下文能力画像与模拟范围过滤运行成员
  │  通过 this.getDaysPassed(context) 读取天数增量
  │  通过 context.totalDays 读取总天数（如需要年/月/季计算）
  ▼
各子系统基于整数天数推进内部模拟
```

**关键约束**：
- `daysPassed` 是本轮增量，`totalDays` 是累计总量——不要混淆
- 所有时间判断必须基于这两个字段，禁止使用 `ageYearsDelta`、`simulationTicks` 等旧字段
- TimeSystem 是这两个字段的唯一写入者，子系统只读
- `contextId` 是当前世界/场景身份真源，`worldId` 只做兼容别名
- `active` 才运行完整叙事回合；`background` 只运行明确登记的聚合系统，`dormant/closed` 不进入完整回合或 Prompt

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

`subsystem-field-keys.generated.ts` 例外地还依赖 `SUBSYSTEM_FIELD_CONTRACTS` 的字段声明；生成器与结构检查共用 `scripts/codegen/subsystem-field-contract-parser.mjs` 的 TypeScript AST 结果。只读系统的 inline `fields: {}` 也必须保留为零字段契约，不能吞并或改写后续可写系统字段。

**注意**：以上 codegen 管线校验的是 manifest/import 接线的一致性（wiring 层面），**不会**校验本文档 §二~§五 提出的 BaseSubsystem 继承、契约文件存在性、文件存在性约束表等更细粒度约定——这部分仍需人工核对（同 §〇「自检自动化」现状说明）。

---

## 十一、AI 文档规范

项目 AI 权威文档统一遵循 `.agents/skills/ai-life-sim/references/ai-documentation-contract.md`。以下仅保留源文件注释的最低要求。

### 11.1 文件头部注释（职责复杂或非显然的源文件）

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
