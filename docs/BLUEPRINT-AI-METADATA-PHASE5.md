# 蓝图 v6（Phase 5）：校准消费端补全 + 家族生育 dedup + 传递链审计

> 状态：**Phase 5 完成（5A/5B/5C）** | IT backlog 待 playtest | 日期：2026-06-24 | 版本：v6.3  
> 前置依赖：[BLUEPRINT-AI-METADATA.md](./BLUEPRINT-AI-METADATA.md) v5.5（Phase 1–4 已完成，50 参数 + 1 策略）

---

## 1. 背景与动机

Phase 1–4 完成了 **Step 0 世界校准** 从 Prompt → Store → 子系统公式系数的全链路。Phase 4 结束时仍有两类**非阻塞**遗留：

| # | 遗留 | 类型 | 说明 |
|---|------|------|------|
| L1 | `getFaithBreakthroughBonus()` 无消费端 | **消费端缺失** | 公式与 `devotionGainModifier` 已接入 faith-system，但 cultivation / lifespan **未读取** |
| L2 | `family-system` 生育概率 | **Defer + dedup 未定** | `BIRTH_PROBABILITY=0.08` 硬编码；与 macro `birthRateModifier` 语义重叠，Phase 4 明确推迟 |

本蓝图 **不新增 WorldCalibration 字段**（Phase 5A），或在 **dedup 规范写清后** 最多新增 1 字段（Phase 5B 方案 B）。**Phase 5C** 对全模拟链路做传递 / Prompt / 迭代审计，产出 backlog，**默认不加字段**。

---

## 2. 范围

### 2.1 纳入（Phase 5）

| 阶段 | 内容 | 新增校准字段 |
|------|------|-------------|
| **5A** | 信仰突破加成 → 修炼瓶颈概率 | 否 |
| **5B** | 家族生育与 macro 人口出生 dedup + 接线 | 方案 A：否；方案 B：是（`fertilityModifier`） |
| **5C** | 各模拟系统传递链 / Prompt 适配 / 迭代优化审计 | 否（产出审计清单与 patch backlog） |

### 2.2 明确排除

| 项 | 原因 |
|----|------|
| 新增 `fortuneEncounterModifier` | Phase 4B 已通过 `luckPointModifier` 去重 |
| 修改 Step 0 Prompt 主结构 | v5 字段字典已稳定；5B 若新增字段仅追加 dictionary 条目；**5C 允许局部增补** dictionary / decisionRules / summary 注入 |
| lifespan 突破全面重构 | lifespan `checkBreakthrough` 仍有 TODO（luck/wealth 未读 context）；5A 仅**可选**最小 faith 乘数 |
| AI 新算法 / 新字段名自造 | 延续 v5 原则：camelCase 字典 + modifier 乘法 |

---

## 3. Phase 5A：信仰突破加成消费端

### 3.1 现状

```ts
// faith-system.ts — 已实现，devotionGainModifier 已乘入内
getFaithBreakthroughBonus(): number {
  return 1 + (devotionLevel / 100) * 0.3 * getFormulaModifier('devotionGainModifier')
}

// cultivation-system.ts — 瓶颈概率，未读 faith
let chance = BOTTLENECK_BASE_CHANCES[nextRealm] * getFormulaModifier('bottleneckModifier')
```

faith 子系统在 `collectState` 后，其他子系统可通过 `context.subsystemStates['faith']` 读取 data；**尚无 `breakthroughBonus` 字段导出**。

### 3.2 设计原则（dedup）

| 乘数 | 作用域 | 能否与 faith 叠乘 |
|------|--------|------------------|
| `bottleneckModifier` | 世界观修炼难度 | ✅ `chance × bottleneckMod × faithBonus` |
| `devotionGainModifier` | 已**包含在** `faithBonus` 内 | ❌ 禁止在 cultivation 再读 |
| `breakthroughChanceModifier` | lifespan 寿命突破 | ❌ 不同子系统；5A 不接入 lifespan |

**合成公式（5A 唯一允许形态）**：

```
cultivationBreakthroughChance =
  BOTTLENECK_BASE[i]
  × bottleneckModifier
  × (faithActive ? faithBreakthroughBonus : 1.0)
  + talentFlatBonus
```

其中 `faithBreakthroughBonus = getFaithBreakthroughBonus()`，由 faith-system 写入 state data，**不在 cultivation 内重复计算 devotion**。

### 3.3 实施步骤

| 步骤 | 文件 | 改动 |
|------|------|------|
| 5A.1 | `mod-power-system/subsystems/faith-system.ts` | `collectState` → `data.breakthroughBonus = faithName ? getFaithBreakthroughBonus() : 1` |
| 5A.2 | `mod-power-system/subsystems/cultivation-system.ts` | 新增 **`collectStateUpdate`**：从 `context.subsystemStates['faith']?.data.breakthroughBonus` 乘入 `breakthroughChance`（见 §3.4 编排说明） |
| 5A.3 | `mod-engine/helpers/subsystem-field-registry.ts` |（可选）faith `data` 只读字段说明；**无需** Zod changes 字段 |
| 5A.4 | `scripts/world-calibration-*-runner.ts` | 可选：纯函数测试 faithBonus × bottleneck（mock Round2 context） |

### 3.4 边界条件

| 场景 | 行为 |
|------|------|
| 无信仰（`faithName == null`） | `breakthroughBonus = 1`，与现网一致 |
| **Round 1 同轮不可跨读** | orchestrator Round 1 对所有子系统传入**同一** `context`（`subsystemStates = lastSubsystemStates`，上一轮结果）；**同轮**后注册的 faith 数据对 cultivation `collectState` **不可见** |
| **5A 推荐路径** | faith 在 Round 1 写入 `data.breakthroughBonus`；cultivation 在 **`collectStateUpdate`（Round 2）** 读取 `round1Context.subsystemStates['faith']` 并修正 `breakthroughChance`。项目内尚无子系统实现 `collectStateUpdate`，5A 为首个用例 |
| manifest 调序 | **alone 不能解决 G-09**；Faith 在 Cultivation 之后注册（manifest 现状），Round 2 方案不受影响 |
| `faithBonus > 1` 且 `chance` 已 clamp 1 | 保持 `clamp(chance, 0, 1)` 在**全部乘数之后** |
| 最小突破间隔 `MIN_YEARS_BETWEEN_REALMS` | 仍为 0，优先于乘数（现逻辑不变） |

### 3.5 Phase 5A 可选扩展（低优先）

| 项 | 文件 | 公式 | 备注 |
|----|------|------|------|
| 5A-OPT | `lifespan-system.ts` `checkBreakthrough` | `roll < breakthroughChance × faithBonus` | 仅当 faith 激活；**不**乘 `breakthroughChanceModifier` 以外的 devotion |

---

## 4. Phase 5B：家族生育 dedup

### 4.1 现状

| 层 | 系统 | 常量/字段 | 语义 |
|----|------|-----------|------|
| **Macro** | `population-system` | `birthRateModifier` | 文明人口出生率（规则模拟） |
| **Micro** | `family-system` | `BIRTH_PROBABILITY = 0.08` | 玩家家族每年生育一次判定 |

二者共用「出生/生育」叙事，但作用对象不同：**世界人口** vs **玩家家谱**。Phase 4 Defer 原因：若各加 modifier 且 AI 均输出，易**双重表达同一世界观**（「人口少」同时压低 macro 与 micro）。

### 4.2 方案对比

| 方案 | 做法 | 新字段 | 优点 | 缺点 |
|------|------|--------|------|------|
| **A（推荐默认）** | `P_eff = BIRTH_PROBABILITY × birthRateModifier` | 无 | 零字段预算；世界观 fertility 一处校准 | 玩家家族节奏绑定 macro，无法「人口少但玩家多子」 |
| **B** | 新增 `fertilityModifier` 仅乘 family | 是 (+1 → 总 51) | 叙事可分裂：宏观人口 vs 玩家家族戏剧 | Prompt dedup 成本；AI 多输出 1 字段 |
| **C** | 维持 Defer，不改代码 | 无 | 无风险 | 家族生育永远不受 Step 0 影响 |

**评审建议**：先实施 **方案 A**；若 playtest 反馈「宏观人口与玩家家族需独立」，再升 **方案 B** 并更新 Prompt。

### 4.3 方案 A 规格（推荐）

**公式**：

```
effectiveBirthProbability = clamp(
  BIRTH_PROBABILITY × getFormulaModifier('birthRateModifier'),
  0.001,
  0.5,
)
```

**Prompt**：不新增字段；在 `world-calibration-prompt.ts` **decisionRules** 补一行：

> `birthRateModifier` 同时影响 macro 人口与玩家家族生育概率；低生育世界观两者同步偏低。

**文件**：

| 步骤 | 文件 |
|------|------|
| 5B-A.1 | `mod-culture/subsystems/family-system.ts` — 引入 `getFormulaModifier('birthRateModifier')` |
| 5B-A.2 | `mod-culture/manifest.ts` — **已依赖 `mod-world`（`dependencies: ['mod-character', 'mod-world']`），无需改 manifest** |
| 5B-A.3 | `world-calibration-prompt.ts` decisionRules — 补 birthRate ↔ family 说明（见上） |
| 5B-A.4（可选） | `calibration-clamp.ts` — postApocalyptic 块增加 `birthRateModifier = 0.65`（与叙事一致；不做则仅 primitive 等已有 birth 偏低的默认能测到 family 变化） |
| 5B-A.5 | `BLUEPRINT-AI-METADATA.md` §11.2 Defer 表 — family 标记为「方案 A 已实施」 |

### 4.4 方案 B 规格（备选）

**新字段**：

| 字段 | 类型 | 默认 | 公式 |
|------|------|------|------|
| `fertilityModifier` | L2 number | 1.0 | `BIRTH_PROBABILITY × fertilityModifier`（**不**乘 birthRateModifier） |

**dedup 规则（写入 Prompt constraints）**：

| 世界观意图 | 应输出 |
|------------|--------|
| 整体低生育（末日、战争消耗） | 仅 `birthRateModifier < 1`；省略 fertility |
| 人口少但玩家家族戏剧（多子多福） | `birthRateModifier < 1` + `fertilityModifier > 1` |
| 整体高生育 | `birthRateModifier > 1`；fertility 省略 |

**与 macro 关系**：`birthRateModifier` 管 population-system；`fertilityModifier` **仅**管 family-system；禁止在 Prompt 中写「两个都默认 1.0 时表示高生育」以外的隐式联动。

**实施清单**（方案 B 时执行）：

| 步骤 | 内容 |
|------|------|
| 5B-B.1 | `types.ts` / `calibration-clamp.ts` / `world-calibration-prompt.ts` |
| 5B-B.2 | `family-system.ts` 接线 |
| 5B-B.3 | `buildDefaultCalibration`：postApocalyptic `fertilityModifier=0.7` 可选 |
| 5B-B.4 | §11.4.5 dedup 规范 + 验收测试 |

---

## 5. Phase 5C：模拟系统传递链 & Prompt 适配审计

> **动机**：Phase 1–4 保证「校准字段 → 单个子系统公式」接线；5A/5B 补个别消费端。仍可能存在 **跨子系统断裂**、**Prompt 与运行时脱节**、**子系统结构不适配校准模型** 等问题。5C 为**只读审计 + 分级 backlog**，实施项拆回 5A/5B 或独立小 PR，**不默认新增 WorldCalibration 字段**。

### 5.1 断点分类（审计维度）

| 代号 | 名称 | 定义 | 典型症状 |
|------|------|------|----------|
| **T-A** | 校准 → 无消费 | `WorldCalibration` 字段或 L3 策略已定义，运行时无读取 | AI 输出有效但模拟不变 |
| **T-B** | 子系统 → 下游未读 | 上游 `collectState` / getter 有产出，下游公式或 Prompt 未引用 | 虔诚高但突破率不变 |
| **T-C** | 开关 / 顺序致失效 | `enabled`、注册顺序、Round 轮次导致同轮读不到 | modifier 已乘但子系统未运行 |
| **T-D** | Prompt 脱节 | Step 0 / 初始化 / 叙事 Prompt 与 Store 校准不一致 | 摘要缺项、风格未传递 |
| **T-E** | 结构不适配 | 硬编码常量、TODO 占位、语义重叠无法 dedup | 需子系统迭代而非再加 modifier |

### 5.2 已知断点清单（评审基线，2026-06-24 代码扫描）

| ID | 类型 | 位置 | 现象 | 建议处置 | 阻塞级 |
|----|------|------|------|----------|--------|
| **G-01** | T-B | faith → cultivation | ~~无 export~~ | **5A ✅** | — |
| **G-02** | T-E | family-system | ~~硬编码~~ | **5B-A ✅** | — |
| **G-03** | T-B | education → culture-tech | ~~未读~~ **IT-1 ✅** | education export + culture-tech Round2 | — |
| **G-04** | T-A | `styleGuide` / `eventTypeWeights` | styleHint **timeline/past-history 已读 calibration**；eventTypeWeights 仍无消费 | 5C-P-1 部分 ✅ | P3 |
| **G-05** | T-D | `_calibrationSummary` | narrative **calibrationSummary 稳定前缀** | **5C ✅** | — |
| **G-06** | T-D | `formatCalibrationSummary()` | **扩展 ±20% 稀疏摘要，≤150 字** | **5C ✅** | — |
| **G-07** | T-E | lifespan `checkBreakthrough` | ~~TODO~~ **IT-2 ✅** Round2 读 luck/wealth/reputation + faithBonus | — |
| **G-08** | T-C | conflict-cycle-system | ~~默认 disabled~~ **IT-4 ✅** essence/escalation 自动启用 | — |
| **G-09** | T-C | Round 1 编排 | **5A `collectStateUpdate` Round 2** | **5A ✅** | — |
| **G-10** | T-E | combat-power vs cultivation | dedup | **§11.4.5 ✅** | — |
| **G-11** | T-D | `world-calibration-prompt` fieldDictionary | confusedPairs 条目 | **✅** | — |
| **G-12** | T-D | adaptation-* prompts | `worldCalibrationSummary` 变量 + helper | **✅**（调用方接入时填充） | — |
| **G-13** | T-D | `world-init-bundle.ts` | ~~tags 门控~~ **校准与 tags 解耦注入** | **5C ✅** | — |

**说明**：G-01/G-02/G-09 与 5A/5B 重叠；5C 完成后应无未处置的 **P0** 项。

### 5.3 传递链审计方法

#### 5.3.1 静态矩阵（必做）

建立 **校准字段 → 消费文件 → 公式位置** 全量表（可脚本化）：

```
scripts/calibration-wiring-audit.ts   # 建议新增，纳入 test:calibration 或独立 npm script
  1. 从 types.ts WorldCalibrationFormulas 枚举全部 key
  2. rg getFormulaModifier('key') / getImpactRangeModifier / getEventDistributionStrategy
  3. 对 L1（populationBase, entities.*）查 world-init / entity 子系统
  4. 对 L3 eventDistributionStrategy 查 world-timeline-system
  5. 输出：✅ 已接线 | ⚠️ 仅 clamp 默认 | ❌ 无引用
```

与 v5 §11.2 候选表合并，作为 **单一真相源** 写回主蓝图或 `docs/CALIBRATION-WIRING-MATRIX.md`（5C 产出物，可选）。

#### 5.3.2 跨子系统依赖图（必做）

| 依赖边 | 上游产出 | 下游期望 | 当前状态 |
|--------|----------|----------|----------|
| faith → cultivation | `breakthroughBonus` | 瓶颈 `chance` 乘数（**Round 2**） | ✅ 5A |
| education → culture-tech | `innovationMod` / `knowledgeTotal` | 科技进度 + 思潮概率（**Round 2**） | ✅ IT-1 |
| faith → lifespan | `breakthroughBonus` | 寿命突破 roll（**Round 2**） | ✅ IT-2 |
| population → family | `birthRateModifier` | 家族生育 | ✅ 5B-A |
| calibration → narrative | `_calibrationSummary` | 叙事稳定前缀 | ✅ 5C |
| calibration → timeline | `styleGuide` / `impactDistribution` | 事件风格与权重 | ✅ strategy + styleHint |

**同轮读取规则**：Round 1 内**禁止**依赖同轮 `context.subsystemStates` 跨读；跨系统修正须用 Round 2 **`collectStateUpdate`**（5A faith、culture-tech IT-1 已用）。

#### 5.3.3 运行时抽检（建议）

| 场景 | 操作 | 断言 |
|------|------|------|
| 高虔诚修仙世界 | mock calibration + 1 轮 orchestrator | cultivation summary 含 faith 加成痕迹（5A 后） |
| postApocalyptic | buildDefaultCalibration | deathRate / monsterThreat 在 subsystem summary 可感知 |
| conflict-cycle off | escalationMod=2 | 与 on 时行为差异符合预期（或文档声明无效） |

### 5.4 Prompt 文件审计清单

| 优先级 | 文件 | 检查项 | 典型优化 |
|--------|------|--------|----------|
| P0 | `world-calibration-prompt.ts` | Zod schema ↔ types 一致；decisionRules 覆盖全部易混淆 modifier 对 | 补 G-11 高混淆字段 dictionary |
| P1 | `calibration-clamp.ts` `formatCalibrationSummary` | 摘要是否覆盖「玩家可感知」偏离项 | 扩展 G-06；token 预算 ≤150 字 |
| P1 | `world-init-bundle.ts` / `useWorldConfirm.ts` | `_calibration` / summary 注入点 | 与 narrative 注入对齐 |
| P2 | `past-history-prompt.ts` / `world-timeline-prompt.ts` | `worldviewStyleHint` 来源 | 优先 `calibration.styleGuide.worldviewStyleHint`，fallback 常量 |
| P2 | `narrative-prompt.ts` | 稳定前缀是否含校准摘要 | 新增 `{{calibrationSummary}}`（G-05） |
| P3 | `mod-*/prompts/adaptation-*.ts` | 与 Step 0 enabled / modifier 语义一致 | 按需注入 summary，避免重复 W02 字段 |
| — | `prompt-context-contract.generated.ts` | 新变量注册 | 改 narrative 变量后 regenerate |

**Prompt 优化原则（5C 约束）**：

1. **不扩 Step 0 主任务**：仍只输出 WorldCalibration JSON；优化限于 dictionary / decisionRules / 下游注入。
2. **dedup 优先于加字段**：与 v5 §11.4 一致；审计发现重叠先写规范再改 Prompt。
3. **摘要稀疏**：与 Step 0 相同，仅输出偏离默认的 modifier，控制 KV cache 前缀长度。
4. **禁止把验收用例原文写入 systemPrompt**（延续 §7 规则）。

### 5.5 子系统迭代优化候选（非接线，结构级）

| ID | 系统 | 问题 | 迭代方向 | 是否需新字段 |
|----|------|------|----------|-------------|
| **IT-1** | education + culture-tech | ~~识字/革新未影响科技~~ | **已实施** Round2 | 否 |
| **IT-2** | lifespan | ~~突破途径未读~~ | **已实施** Round2 + faithBonus | 否 |
| **IT-3** | family | macro/micro 生育语义 | **5B-A ✅** | 否 |
| **IT-4** | conflict-cycle | ~~校准与开关脱节~~ | **已实施** auto-enable | 否 |
| **IT-5** | fortune / luck / work | 三层 dedup | **audit 脚本 ✅** | 否 |
| **IT-6** | causal-simulation | 仅概率门校准 | **排除**（维持现状） | 否 |

**迭代准入**：须先完成 5C 静态矩阵，证明非「漏接线」而是「公式结构不支持」。

### 5.6 5C 实施步骤与产出

| 步骤 | 内容 | 产出 |
|------|------|------|
| 5C.1 | 运行 / 编写 `calibration-wiring-audit` | 字段接线矩阵 Markdown |
| 5C.2 | 填写 §5.2 已知项状态，补充新发现 | Issue backlog（P0–P3） |
| 5C.3 | Prompt 清单逐项核对 §5.4 | Prompt patch 列表（可拆多 PR） |
| 5C.4 | 跨系统依赖：首用 `collectStateUpdate` 验证 Round 2 | 5A 结论写入 §12 |
| 5C.5 | 回填主蓝图 §11 / §15；可选 `CALIBRATION-WIRING-MATRIX.md` | 文档同步 |

**建议顺序**：5A → **5C.1–5C.4（与 5B 并行）** → 5B → 5C.5 Prompt 注入 → 关闸。

### 5.7 Phase 5C 验收

| # | 条件 |
|---|------|
| C-1 | 静态矩阵 50 个 L2/L1/L3 项均有 ✅ 或已登记 Defer/IT backlog |
| C-2 | §5.2 无未处置 **P0**（G-01、G-09 必须关闭） |
| C-3 | `formatCalibrationSummary` 或 narrative 注入至少覆盖 **8 类**高感知 modifier（修炼/科技/战争/人口/怪物/经济/事件策略/难度向） |
| C-4 | timeline / past-history 的 styleHint **优先读 calibration**（有则 override essence 常量） |
| C-5 | 跨系统依赖图与 manifest 顺序 / Round2 方案文档化 |

---

## 6. 汇总：Phase 5 参数预算

| 阶段 | 新增 WorldCalibration 字段 | 累计可校准参数 |
|------|---------------------------|---------------|
| v5.5 基线 | — | 50 + 1 策略 |
| 5A | 0 | 50 |
| 5B 方案 A | 0 | 50 |
| 5B 方案 B | `fertilityModifier` | 51 |
| 5C | 0 | 50（或 51） |

---

## 7. 实施顺序

```
Phase 5A（消费端，无新字段）
  5A.1 faith export breakthroughBonus（Round 1）
  5A.2 cultivation collectStateUpdate 乘入 chance（Round 2，非 Round 1 collectState）
  5A.3 字段注册（可选）
  5A.4 单元测试（可选）

Phase 5C（审计，可与 5B 并行）
  5C.1 calibration-wiring-audit 脚本 / 矩阵
  5C.2 断点 backlog 核对（§5.2）
  5C.3–5C.4 跨系统依赖 + manifest 顺序结论
  5C.5 Prompt 注入 patch（summary / styleGuide）

Phase 5B（二选一）
  5B-A 推荐：family × birthRateModifier
  — 或 —
  5B-B 备选：fertilityModifier + dedup Prompt

Phase 5 关闸
  npm run test:calibration（含 5C 静态矩阵，若脚本已加）
  npx tsc --noEmit
  更新 BLUEPRINT-AI-METADATA.md 状态 / 交叉引用
```

---

## 8. 验收场景（测试矩阵）

> 禁止原文写入 world-calibration systemPrompt。

### 8.1 Phase 5A

| 场景 | 设置 | 断言 |
|------|------|------|
| 无信仰 | faith 空 | cultivation chance = 基线 × bottleneckMod（与现网一致） |
| 高虔诚 | devotion=100, faith 激活, devotionGainModifier=1.4 | `breakthroughBonus ≈ 1 + 0.3×1.4 = 1.42`；cultivation chance 同比 ×1.42（clamp 前） |
| dedup | devotionGainModifier=2 | cultivation **不**再单独读 devotionGainModifier |

### 8.2 Phase 5B 方案 A

| 场景 | 设置 | 断言 |
|------|------|------|
| 史前默认 | `civilizationStage: 'primitive'` + buildDefaultCalibration | family 有效生育率 = `0.08 × 0.75 = 0.06` |
| 末日 | `essenceTag: 'postApocalyptic'` + `civilizationStage: 'primitive'`（或 5B-A.4 为 postApocalyptic 补 birthRateModifier） | 有效生育率 < `0.08` |

### 8.3 Phase 5B 方案 B（若采用）

| 场景 | 设置 | 断言 |
|------|------|------|
| 分裂叙事 | AI JSON: birth=0.6, fertility=1.5 | population 用 0.6；family 用 0.08×1.5，**不**乘 0.6 |
| sparse | 仅 birthRateModifier | fertility 默认 1.0 |

### 8.4 Phase 5C

| 场景 | 设置 | 断言 |
|------|------|------|
| 静态矩阵 | 运行 wiring-audit | 50 项均有 ✅ 或 backlog 登记 |
| styleGuide 传递 | AI 输出 `styleGuide.worldviewStyleHint` | timeline Prompt 使用该 hint，非仅 essence 常量 |
| narrative 摘要 | `_calibrationSummary` 非空 | narrative 稳定前缀含摘要片段 |
| education→tech | literacy 高 + innovationMod>1 | culture-tech 突破概率高于基线（IT-1 实施后） |

---

## 9. 与 v5 主蓝图的关系

| v5 章节 | Phase 5 变更 |
|---------|-------------|
| §11.2 Defer family | 5B 完成后改为 ✅ 并链接本文件 |
| §11.4.4 信仰 dedup | 5A 完成后补充「cultivation 已消费 faithBonus」 |
| §11 / §15 | 5C 完成后补充接线矩阵引用 + Prompt 注入验收 |
| §13 实施阶段 | 新增 §阶段 5 表（实施完成后回填） |
| §15 验收 | 合并 §8 用例至 `test:calibration` |

**主蓝图头部状态**（Phase 5 全部完成后建议改为）：

> 状态：**Phase 5 完成** | v5.5 + 本文件 v6.2

---

## 10. 风险与回滚

| 风险 | 缓解 |
|------|------|
| collectState 顺序导致 faith data 未就绪 | **Round 2 `collectStateUpdate`**（见 §3.4）；禁止仅在 Round 1 collectState 跨读 |
| faithBonus 叠乘使突破过快 | 保持 clamp(0,1)；极端 world 仍受 MIN_YEARS 限制 |
| 方案 A 家族与 macro 绑定过紧 | 文档明确；playtest 后升方案 B |
| 方案 B AI 双字段混淆 | Prompt dedup 表 + 验收 sparse 用例 |
| 5C 范围膨胀 | 严格 P0–P3 分级；结构迭代进 IT backlog，不混进接线 PR |

**回滚**：5A/5B 均为局部乘法接入，移除乘数即回退现网行为（modifier 默认 1.0）。5C Prompt 注入可独立回滚变量块。

---

## 11. 决策记录（评审填表）

| 决策项 | 推荐 | 评审结论 |
|--------|------|----------|
| 5A 是否实施 | ✅ 是 | ✅ 校对通过；须 Round 2 collectStateUpdate |
| 5A-OPT lifespan | 可选，不阻塞 5A | 暂缓 |
| 5B 方案 | **A** 优先 | ✅ 校对通过 |
| 5B 方案 B | 仅 playtest 后 | 暂不实施 |
| 5C 是否阻塞关闸 | **P0 清零即可关闸**；P2/P3 可进 backlog | ✅ |
| IT-1 education→tech | 5C 后独立小 PR | backlog |
| G-13 tags 门控 | 5C-P 阶段解耦 | backlog |

---

## 12. 代码校对记录（2026-06-24）

| 校对项 | 结论 |
|--------|------|
| G-01 faith 无消费端 | ✅ 与 `faith-system.ts` / `cultivation-system.ts` 一致 |
| G-02 family 硬编码 | ✅ `BIRTH_PROBABILITY=0.08`，未读 modifier |
| G-09 Round 1 跨读 | ⚠️ **蓝图 v6.1 有误**；已修正为 Round 2 方案（§3.4） |
| 5B 末日验收 | ⚠️ 纯 postApocalyptic 默认**无** birthRateModifier；已修正用例（§8.2） |
| 5B-A.2 mod-world 依赖 | ✅ manifest 已声明，无需改 |
| 50 参数接线（Phase 1–4） | ✅ L2 子系统 `getFormulaModifier` 与 v5 表一致；L1/L3 在 world-init / timeline / orchestrator |
| G-04~06, G-12 Prompt 脱节 | ✅ 与代码一致 |
| G-13 tags 门控 | ✅ 新发现，已入 §5.2 |
| `calibration-wiring-audit.ts` | ✅ 38/38 L2/L3 接线 + backlog 登记 |

**实施准入**：Phase 5 + IT-1/2/4/5 **全部完成**；G-04 eventTypeWeights、IT-6 为刻意 defer。

---

*文档结束 — 按 §7 顺序实施，完成后同步 [BLUEPRINT-AI-METADATA.md](./BLUEPRINT-AI-METADATA.md)。*
