# 核心架构执行文档：契约单一真源 + 判定落地闭环 + 系数核心

日期：2026-07-07
状态：**执行蓝图（供 GPT 逐步实施，主 AI 审查）**。本文档是 [plan-2026-07-07-narrative-deregex-ui-eval.md](file:///D:/AI/ai-life-sim/docs/plan-2026-07-07-narrative-deregex-ui-eval.md) 中 D7 / D9 / D5+D12+D13 三项**动 core/foundation** 决策的落地步骤，把「决策 + 方向」细化到「数据结构 + 改动清单 + 验证关卡」。

> ⚠️ 本文档涉及 `src/core/` 与 `src/foundation/`，属 AGENTS.md B-01/B-02 红线范围。每个阶段实施前须按 `.agents/核心流程.md` 风险分级停下确认，实施后须跑 `npm run gate-check` + 存档兼容验证。

---

## 换机继续入口（2026-07-07）

新电脑继续时先读：

1. `AGENTS.md`
2. `.agents/核心流程.md`
3. `.agents/skills/ai-life-sim-skill/SKILL-INDEX.md`
4. `.agents/cross-domain-contracts.md`
5. 本文档

先跑：

```bash
node .agents/scripts/check-governance.mjs
```

当前状态：

| 项 | 状态 | 下一步 |
|----|------|--------|
| 技能/规则索引 | 已整理为 `AGENTS.md → 核心流程 → cross-domain → SKILL-INDEX → 域 SKILL → 末端文件` | 若改 `.agents/`，改后跑治理检查 |
| C-0 前置核对 | 已完成并写入本文档 | 继续执行 C-2 或先复核 C-1 实际代码状态 |
| C-1 契约单一真源 | 文档记录为已实施 | 先用 `rg "SUBSYSTEM_FIELD_CONTRACTS|subsystemGuide|SUBSYSTEM_CHANGE_SCHEMAS" ai-life-sim/src` 复核 |
| C-2 系数核心 | 已实施 | `core/shared/balance-config.ts` 为当前单一入口 |
| C-3 判定/落地闭环 | 已实施 B1/B2/B8 最小闭环；未改 foundation 接口 | 后续只在恢复更多子系统时评估接口强约束 |

执行顺序：**C-1 复核 → C-2 → C-3**。不要先做 G1/G2/UI 表层任务；根优先要求先完成契约、系数、判定归属。

---

## 为什么这三件是"同一个核心"

plan 文档把它们拆在 §八(P1)、§五(E1)、§十(P3)，但它们指向同一个根问题：**项目缺一个"单一权威源"，导致契约、数值、系数各自散落、互相漂移。**

- **D7 契约单一真源**：字段名在「子系统 impl / Zod registry / AI 指南」三处手写 → 漂移 → AI 输出被静默丢弃。
- **D9 判定/落地闭环**：业务规则散在「子系统 + orchestrator + post-narrative」多处 → 双算、连锁改动。
- **D5+D12+D13 系数核心**：时间→增量缩放、难度倍数、平衡参数散在各常量文件 → 调一处平衡改多处。

三者的解法是同一个形状：**建立单一权威源，其余单向依赖它，禁止旁路重复实现。** 因此必须一起设计，否则会各修各的、再次漂移。这也符合"根优先"原则——先把这个根定死，G1/G2/UI 等表层工作才能挂在稳定的根上。

---

## 阶段总览与依赖顺序

| 阶段 | 内容 | 风险 | 依赖 |
|------|------|------|------|
| **C-0** | 前置核对（不改代码，摸清现状） | 无 | 无 |
| **C-1** | 契约单一真源（D7 根治版，非手工对齐） | 中（动 registry + 指南派生） | C-0 |
| **C-2** | 系数核心 balance-config（D5+D12+D13） | 低（纯新增 + 逐步接入） | C-0 |
| **C-3** | 判定/落地闭环（D9，删双算 + 边界强约束） | **高（动 orchestrator core + 存档结构）** | C-1 |

**执行顺序**：C-0 → C-1 → C-2（可与 C-1 并行）→ C-3。C-3 风险最高，必须在 C-1 完成且验证稳定后再动。

---

## C-0：前置核对（GPT 第一步，只读不改）

实施任何改动前，先产出一份现状核对报告，确认以下事实（plan 文档基于早前调研，实施时须复核，避免基于过期结论动手）：

1. **字段契约三处的当前真实内容**（逐一 Read 并贴行号）：
   - 子系统 `applyChanges` 实际读取字段：`morality-system.ts` / `luck-system.ts` / `lifespan-system.ts` / `character-base-system.ts`
   - Zod registry：`subsystem-field-registry.ts` 各子系统的 schema 声明
   - AI 指南：`mvp-stages-config.default.json` 的 `subsystemGuide`
2. **DeepSeek 是否启用 `response_format:{type:"json_object"}`**（P2 方案 A 的前置，见 plan §九 D11）：Read `ai-client.ts` 确认。
3. **`RoundContext` / `OrchestratorSnapshot` 的当前结构**（C-3 会动，先存基线）：Read `foundation/types/subsystem.types.ts` + `orchestrator-system.ts` 快照定义。
4. **`timeStep` 当前如何暴露给子系统**（C-2 系数核心依赖，见 plan D5）：确认 `TimeSystem.advance()` 后各子系统能否读到"本轮跨越的游戏时间"。

产出：一页现状核对，逐条标注"与 plan 一致 / 有出入（附最新行号）"。有出入的先同步回 plan 文档再继续。

### C-0 现状核对结果（2026-07-07）

1. **字段契约三处漂移：与 plan 一致，但具体字段需按最新代码修正。**
   - `character-base` 基本一致：`applyChanges` 读 `physiqueDelta` / `mindDelta` / `talentAptitudeDelta` / `charismaDelta` / `resourcesDelta`（`character-base-system.ts:91-99`），registry 与指南也写这些字段（`subsystem-field-registry.ts:191-198`，`mvp-stages-config.default.json:37`）。
   - `morality` 漂移：实现只落地 `delta`，且 `narrativeText` 是旧关键词降级路径（`morality-system.ts:77-85`）；registry 同时声明 `value` / `delta`（`subsystem-field-registry.ts:214-217`）；AI 指南却要求 `morality(-10~+10)`（`mvp-stages-config.default.json:37`）。
   - `luck` 漂移：实现读 `luck` 绝对值（`luck-system.ts:92-100`）；registry 声明 `bonus` / `delta`（`subsystem-field-registry.ts:219-222`）；AI 指南要求 `luck(-10~+10)`（`mvp-stages-config.default.json:37`）。
   - `lifespan` 漂移：实现读 `worldName` / `background` / `raceId` / `maxAge` / `adaptedRace` / `addBreakthroughs`（`lifespan-system.ts:119-173`）；registry 与指南声明 `age` / `lifespanDelta` / `maxAge`（`subsystem-field-registry.ts:208-212`，`mvp-stages-config.default.json:37`），其中 `age` / `lifespanDelta` 当前不会被 `applyChanges` 落地。
2. **DeepSeek JSON Mode：主叙事路径已启用，D11 方案 A 需要调整。**
   - `narrative-prompt.ts` 当前 `outputFormat: 'json'`（`narrative-prompt.ts:473`）。
   - `callAIWithPromptTemplate()` 会把 JSON prompt 转成 `jsonMode: true`（`ai-call-wrapper.ts:44-47`），`ai-client.ts` 会发送 `response_format: { type: 'json_object' }`（`ai-client.ts:503-507`），代理路由会透传（`app/api/proxy/route.ts:323-326`）。
   - 例外：default campaign 的 S3 非流式分支直接走 `callAIDegraded()`（`campaigns/default/index.ts:264-269`），其 `streamOpts` 未显式带 `jsonMode`；后续改 D11/G1 时应一起收口，避免同一叙事管线 JSON Mode 行为分叉。
3. **`RoundContext` / `OrchestratorSnapshot` 基线已确认。**
   - `RoundContext` 已包含 `daysPassed` / `totalDays`，由 TimeSystem 作为唯一时间增量源注入（`subsystem.types.ts:57-64`）。
   - `OrchestratorSnapshot` 当前包含 `lastSubsystemStates`、`timeRound`、`lastNarratedTimeStep`、预生成和摘要账本等存档相关字段（`orchestrator-system.ts:262-282`，`orchestrator-system.ts:575-620`）。
4. **`timeStep` / 本轮跨越时间：无需为 C-2 新增 `RoundContext` 字段。**
   - 子系统可读 `context.timeStep`，本轮实际推进天数由 `TimeSystem.getDaysPassed()` 注入 `context.daysPassed`（`time-system.ts:188-190`，`orchestrator-system.ts:784-799`）。
   - C-2 的"本轮游戏年数"可从 `context.daysPassed / 365` 派生；除非 C-3 后续要做接口强约束，否则不要仅为 balance-config 增加 `RoundContext` 字段。
5. **文档引用缺口：`docs/blueprint-01-mvp-playable.md` 当前不存在。**
   - 该路径被 `simulation-rewrite-discussion-plan.md`、`ARCHITECTURE.md`、`mod-spec-rewrite-tiers.md` 等引用；不阻断 C-1/C-2 设计，但恢复子系统或判断 MVP 范围前必须补齐或改正引用。

---

## C-1：契约单一真源（D7 根治版）

### 目标

消灭"字段名三处手写、互相漂移"的根因。不是手工把三处名字改一致（那是一次性的、下次还会漂），而是**让三处从同一个声明派生**。

### 根问题回顾（C-0 会复核具体行号）

一个子系统的字段契约现在有三份独立来源：

1. **子系统 `applyChanges` 实际读什么字段** —— 真正的行为，唯一不会骗人的事实。
2. **`subsystem-field-registry.ts` 的 Zod schema** —— 校验 AI 输出用。
3. **`mvp-stages-config.default.json` 的 `subsystemGuide`** —— 告诉 AI 该用什么字段名。

三者手写，漂移后果：AI 按 (3) 输出 `{morality: 1}`，(2) 校验放行或宽松，(1) 只认 `delta` → 值被静默丢弃。C-0 复核确认 `morality`、`luck`、`lifespan` 均存在字段漂移；`character-base` 字段基本一致，但仍有叙事正则兜底旧路径。

### 落地方案：字段契约声明为单一常量，registry 与指南从它派生

**第 1 步：为每个 AI 可写子系统定义一份字段契约声明（单一真源）。**

建议在 `subsystem-field-registry.ts`（或新建 `subsystem-field-contracts.ts`）集中定义，形如：

```ts
// 每个子系统一份：字段名、类型、语义、增量还是绝对值、钳制范围
export const MORALITY_CONTRACT = {
  subsystem: 'morality',
  fields: {
    delta: { type: 'number', kind: 'delta', clamp: [-10, 10], desc: '本轮善恶变化量，正=向善' },
  },
} as const
```

**第 2 步：Zod schema 从契约声明生成**，不再手写。`subsystem-field-registry.ts` 遍历契约的 `fields` 自动构造 `z.object({...})`。

**第 3 步：给 AI 的 `subsystemGuide` 字段说明也从契约声明生成**（或在构建 prompt 时从契约拼出字段列表），保证"告诉 AI 的字段名"永远等于"schema 校验的字段名"等于"子系统真正读的字段名"。

**第 4 步：子系统 `applyChanges` 对齐契约**。C-1 的原则不是机械迁就旧字段，而是为每个 AI 可写字段明确"增量/绝对值/内部初始化字段"语义：
- 对 `morality`，AI 可写主契约应使用 `delta`；`value` 若保留，只能作为手动覆盖或内部调试字段，不能出现在 AI 指南里。
- 对 `luck`，先二选一：若气运是隐藏状态的绝对值，契约用 `luck`；若按叙事变化量推进，契约改为 `delta` 并同步 `applyChanges` 做增量落地。C-1 实施前必须在计划中明确该语义。
- 对 `lifespan`，`maxAge` 是当前可落地绝对字段；`lifespanDelta` 若作为 D9/G2 的目标字段，必须在 `LifespanSystem.applyChanges` 中新增增量落地逻辑，否则不得继续在 AI 指南中声称可写。
- 对 `character-base`，契约字段已基本一致；C-1 只负责把字段声明纳入单一真源，删除/禁用叙事正则兜底放到 C-3/B1。

### 本阶段改动清单

- `morality` / `luck` / `lifespan` / `character-base` 四个 AI 可写子系统各定义一份字段契约常量。
- `subsystem-field-registry.ts`：schema 改为从契约派生。
- prompt 构建处（`narrative-prompt.ts` 或 `mvp-runtime-policy.ts` 的 `subsystemGuide` 注入点）：字段说明从契约派生。
- 逐一核对四个子系统 `applyChanges` 与契约一致，修正 B3/B4/B5 漂移；尤其补齐 `lifespanDelta` 是否落地、`luck` 是绝对值还是增量这两个语义点。

### C-1 实施记录（2026-07-07）

- 已在 `subsystem-field-registry.ts` 建立 `SUBSYSTEM_FIELD_CONTRACTS`，字段说明与 Zod schema 同处声明；`SUBSYSTEM_FIELD_MAP`、`SUBSYSTEM_CHANGE_SCHEMAS`、generated 字段列表均从该契约派生。
- 已移除 `mvp-stages-config.default.json` 中手写 `subsystemGuide`；`MvpStageLoader.getSubsystemGuide()` 现在按当前阶段 `narrativeChange` 白名单从契约生成 AI 字段指南。
- 本轮语义选择：`morality` 对 AI 只暴露 `delta`；`luck` 采用当前已落地的绝对值字段 `luck`；`lifespan` 当前只暴露可落地的 `maxAge`，`age` / `lifespanDelta` 不再进入 AI 指南或 narrative schema。
- 已同步 `generate-mod-wiring.mjs` 与 `scan-typescript-wiring.mjs`，结构扫描改为检查 generated 字段列表是否与 `SUBSYSTEM_FIELD_CONTRACTS` 一致。
- 已清理 Prompt 示例和首轮动态指令中的旧 `lifespan.age` 示例；同根因旁路读点 `subsystem-relevance-system.ts` 已从 `data.bonus` 改为读取 `data.luck`。

### 验证关卡

1. 写一个断言测试/脚本：对每个子系统，交叉验证"契约字段名 == registry schema keys == 子系统 applyChanges 读取的字段"。三者不一致即 fail。
2. 手动构造一次 AI 变更（如 `morality.delta = -1`），跑一轮，确认善恶值真的变了（修复前很可能不变）。
3. `npm run gate-check` 零错误。

### ⚠️ 手感变化提示（对应 D7）

修复后善恶/气运/寿命会**开始真正变动**——此前可能一直静止。这会改变现有存档的行为表现，属预期内，实施时在交付说明中明确指出。

---

## C-2：系数核心 balance-config（D5 + D12 + D13）

### 目标

把散落的可调数值/系数收进一个单一权威源，各系统**单向读取**它，而非各自硬编码。对应 plan 的三条决策：D5（时间→增量缩放 + resources 慢变量）、D12（难度作为核心引擎级系数源）、D13（难度倍数语义）。

### balance-config 应包含什么

1. **单轮增量钳制（按属性 + 按时间缩放）**：替代当前全局 `ATTR_DELTA_CLAMP=[-8,8]`。
   - 结构：`Record<AttrKey, { basePerYear: [min,max] }>`，resources 的 `basePerYear` 远小于其他属性（D5 慢变量）。
   - 实际单轮上限 = `basePerYear × 本轮跨越的游戏年数`（timeStep 缩放）。跨 10 年的一轮允许的变化远大于跨 1 天的一轮。
2. **难度倍数语义（D13）**：`difficulty.multiplier`，**数值越高越难**，`>1` 更难 / `=1` 标准 / `<1` 更简单。在此常量的注释里写死这条语义，所有消费系统统一遵循。
3. **难度作为系数入口（D12）**：balance-config 暴露一个统一的"取难度系数"函数，各模拟系统复活接入时**主动调用它**取用，而非自己去 `worldConfig.difficulty` 里捞、各自解释。难度是单向被依赖的核心，不反向散落。
4. **其他平衡参数**（逐步迁移，不强求一次到位）：超凡阈值、突破概率、寿命基准等现散落 `constants.ts` 的可调项，后续按需收敛进来。

### 落地方案

- 新建 `balance-config.ts`（位置：若跨 MOD 使用放 `core/shared/`，若仅角色域用放 `mod-character`；C-0 阶段确认调用范围后定）。
- 先迁移**单轮增量钳制 + 难度系数入口**这两项（D5 慢变量 + D12/D13 直接相关），其余平衡参数标注"后续迁移"，不阻塞。
- `character-base-system.ts` 的 clamp 逻辑改为读 balance-config 的按属性/按时间上限。
- 清理 plan §十提到的 luck/lifespan 里两处"注释掉的/半接入的"难度残留，统一走 balance-config 入口。

### 与时间引擎的耦合（D5 关键）

C-0 已确认 `RoundContext.daysPassed` 是本轮实际推进天数，`context.timeStep` 是用户选择的步长配置。C-2 的"本轮游戏年数"应从 `daysPassed / 365` 派生，不为 balance-config 单独扩展 `RoundContext`；只有 C-3 后续要做接口强约束时，才重新评估是否改 `foundation/types/subsystem.types.ts`。

### 验证关卡

1. resources 单轮变化受限验证：构造一轮大幅 resources 变更，确认被 clamp 到慢变量上限。
2. 时间缩放验证：同样的 AI delta，在"跨 10 年"轮与"跨 1 天"轮下，实际落地的属性变化不同。
3. 难度语义验证：切炼狱（高 multiplier）与随心（低 multiplier），确认接入了难度的系统数值方向正确（越难越苛刻）。
4. `npm run gate-check` 零错误。

### C-2 实施记录（2026-07-07）

- 已新增 `core/shared/balance-config.ts` 作为跨 MOD 平衡系数单一入口；`WORLD_DIFFICULTY_MULTIPLIERS` 明确 normal=1、hard=1.3、nightmare=1.7、hell=2，语义为"越高越难"。
- 已将角色基础属性增量上限迁入 `CHARACTER_ATTRIBUTE_DELTA_LIMITS_PER_YEAR`：体魄/心智/悟性/魅力每游戏年 ±8，出身每游戏年 ±2；实际落地由 `RoundContext.daysPassed / 365` 缩放。
- 已让 `CharacterBaseSystem.applyChanges()` 的结构化增量和叙事兜底增量都走 `clampCharacterAttributeDelta()`；旧固定 `ATTR_DELTA_CLAMP` 已删除。
- C-0 复核未发现 luck/lifespan 仍直接读取 `difficulty.multiplier` 的活代码；本轮只建立统一入口，不强接未运行系统。

### 风险

低到中。若 balance-config 放在 `mod-character` 内且只接 `character-base`，风险低；若按 D12 作为未来跨 MOD 系数入口放入 `core/shared/`，则按 core/shared L2 处理。C-0 结论是不需要为 C-2 改 `RoundContext` 或存档结构。

---

## C-3：判定/落地闭环（D9，最高风险）

### 目标

让"判定业务规则"和"落地写状态"在**同一个子系统内闭环**；Orchestrator 只做管线顺序编排 + 通过 RoundCommitBus 分发，**不再自己算业务再写回**。消灭 plan §八的 B2（寿命双算）、B8/B9（跨域多路径）这类"改一个功能几个系统连锁调整"。

### 核心原则

- 判定 + 落地在同一子系统内。
- 跨系统只能：经 `context.subsystemStates` **读**、经 RoundCommitBus **写**。
- **禁止** orchestrator / post-narrative 直接算业务数值再写回子系统状态。

### 具体改动（按 plan §八 B 类）

1. **B2 寿命归一**：删 `post-narrative-processor.ts` 的 `checkBreakthrough` + `detectLifespanLoss`（第二套突破/减寿算法）及 `orchestrator-system.ts` 的写回逻辑。寿命突破/减寿判定与落地全部收回 `LifespanSystem`。post-narrative 只保留连锁反应触发。
2. **B1 属性单一写权威**：删 `character-base-system.ts` 的 `parseAttrFromNarrative` 叙事正则兜底（与 G2 去正则化一致），base 的唯一写入路径是 AI `*Delta`。
3. **B8/B9 跨域收敛**：跨域数值修正的三条路径（cross-domain-rules / applyWorldDirection / 叙事关键词兜底 direction）目标子系统多为死代码，MVP 下整体禁用或明确标注未来段；字段名归一化只留 validator 一处。

### ⚠️ 为什么这是高风险（动 core/foundation）

- 可能改 `RoundContext`、`SubSystemChanges`、`ISubSystem` 接口（`foundation/types/subsystem.types.ts`）——波及全部子系统 + 存档序列化。
- 可能改 `OrchestratorSnapshot` / `captureSnapshot`——直接影响存档兼容。
- 属 AGENTS.md B-01/B-02，**必须**：实施前逐项列改动清单 + 风险，停下二次确认；实施后完整回归 + 存档读写兼容验证 + `npm run gate-check` 零错误。

### 分步降风险

1. 先做 B2、B1（删双算/删正则兜底）——这两项是"删冗余路径"，把业务收回已有子系统，**不改接口结构**，风险中等。
2. 再评估是否需要动 `RoundContext`/接口做"边界强约束"——若 B2/B1 收回后职责已清晰，接口可暂不动，把"强约束"降级为约定 + 审查，避免为架构纯洁性动存档结构。**是否动接口，作为 C-3 内部的二次决策点，实施到这一步时再确认。**

### 验证关卡

1. 寿命突破/减寿回归：修复前后，同样剧情下寿命变化一致（且只由 LifespanSystem 产生一次，无双算）。
2. 存档兼容：老存档能读、能继续、能存回，快照结构变更有迁移或兼容处理。
3. 全量 `npm run gate-check` + `npx tsc --noEmit` 零错误。

### C-3 实施记录（2026-07-07）

- `post-narrative-processor.ts` 已删除第二套寿命突破/减寿判定；post-narrative 仅保留连锁反应。
- `orchestrator-system.ts` 已移除 post-narrative 寿命写回；世界方向 MVP 阶段仅透传，不再按叙事关键词回写目标子系统。
- `character-base-system.ts` 已删除 `parseAttrFromNarrative`；属性只通过结构化 `*Delta` 与契约字段落地。
- `lifespan-system.ts` 已支持结构化 `lifespanDelta`；寿命增减由 LifespanSystem 自己落地。
- 本阶段未改 `RoundContext` / `SubSystemChanges` / `OrchestratorSnapshot` 结构；接口强约束降级为规则与扫描约束，避免为架构纯度扩大存档风险。

验证结果见 plan 文档实施记录：lint / tsc / structural / ui 均通过；full gate 剩余 `check:mod` 历史扫描阻塞。

---

## 交付与审查约定（配合"GPT 执行 + 主 AI 审查"分工）

- GPT 每完成一个阶段（C-0/C-1/C-2/C-3）产出一次交付说明：改了哪些文件、贴关键 diff、贴 gate-check 结果。
- 主 AI 按 `.agents/核心流程.md` 第五步（修改对比）逐条审查：是否只改必要范围、是否漏改同名调用点、验证关卡是否真跑。
- C-3 动 core/foundation 前，GPT 必须先停下出改动清单等确认，不得直接改。
- 每阶段独立可交付、可回滚；C-1 未验证稳定前不进 C-3。
