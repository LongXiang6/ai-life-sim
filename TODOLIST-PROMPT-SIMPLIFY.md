# AI Prompt 全面精简 — 执行计划书 v2

> 基于 4 个子 agent 交叉评估 + 2026-07-03 二次人工核实校对
> 参考模板（已完成）: `src/mods/mod-character/prompts/destiny-pattern-prompt.ts`
> **生成日期**: 2026-07-03 | **v2 更新**: 2026-07-03（校订 + 按系统分步）

---

## 〇、参考模板：命格系统（已完成）

**改造文件**:
- `src/mods/mod-character/prompts/destiny-pattern-prompt.ts` — systemPrompt 纯字符串 + 4世界观示例
- `src/mods/mod-character/prompts/destiny-pattern-context.ts` — userPrompt 精简为 `{worldName, worldDescription, character}`

**改造效果**:
- systemPrompt: JSON规则体(~3K chars) → 纯字符串示例(~4.4K chars)
- userPrompt: ~12变量校准管线 → 3字段精简JSON
- 缓存命中率: 88.89%（demo log 实测）
- 输出质量: demo 验证通过，20条命格符合schema

> 后续所有改造均参照此模式：**示例驱动 systemPrompt + 精简 userPrompt**。

---

## 一、执行总览

### 1.1 系统清单（按执行顺序）

| 序号 | 系统 | 源计划 | 涉及文件数 | 风险 | 预估token节省 | 状态 |
|:--:|------|:--:|:--:|:--:|:--:|:--:|
| 0 | **命格系统**（参考模板） | — | 2 | — | — | ✅ 已完成 |
| 1 | 种族起源 | P0-2 | 2 | 低 | -40% | ✅ 已完成 |
| 2 | 世界标签 | P0-3 | 1 | 低 | -50% | ✅ 已完成 |
| 3 | 生命阶段适配 | P1-3 | 1 | 低 | — | ⏸️ 预留死代码（5套硬编码已覆盖） |
| 4 | 寿命适配 | P1-3 | 1 | 低 | — | ⏸️ 预留死代码（LifespanSystem 硬编码） |
| 5 | Adaptation 工厂（基础设施） | P0-1 | 新建1 + 改codegen | 中高 | — | |
| 6 | adaptation-cultivation（修炼） | P0-1 | 删1 | 低 | ~60行→配置 | |
| 7 | adaptation-fortune-encounter（奇遇） | P0-1 | 删1 | 低 | ~60行→配置 | |
| 8 | adaptation-faith（信仰） | P0-1 | 删1 | 低 | ~60行→配置 | |
| 9 | adaptation-supreme-item（超凡物品） | P0-1 | 删1 | 低 | ~60行→配置 |
| 10 | adaptation-divine-intervention（神予） | P0-1 | 删1 | 低 | ~60行→配置 |
| 11 | adaptation-anomaly-phenomena（异象） | P0-1 | 删1 | 低 | ~60行→配置 |
| 12 | adaptation-special-material（材料） | P0-1 | 删1 | 低 | ~60行→配置 |
| 13 | adaptation-golden-finger（金手指） | P0-1 | 删1 | 低 | ~60行→配置 |
| 14 | adaptation-combat-power（战力） | P0-1 | 删1 | 中 | ~65行→配置 |
| 15 | adaptation-luck（气运） | P0-1 | 删1 | 中 | ~65行→配置 |
| 16 | adaptation-monster（怪物） | P0-1 | 删1 | 中 | ~65行→配置 |
| 17 | adaptation-antagonist（反派） | P0-1 | 删1 | 中 | ~70行→配置 |
| 18 | adaptation-divine-creation（创世神） | P0-1 | 删1 | 中 | ~40行→配置 |
| 19 | 叙事字段合并 + Prompt 全面优化 | P1-2 | 5 | 中高 | 19.1/8项已完成,19.2/9项待做 | 🔄 进行中 |
| 20 | 叙事示例瘦身 | P1-1 | 1 | 高 | ~800 tokens/首轮 |
| 21 | 校准去重 | P2-1 | 2 | 中 | ~100行→共享段 |

### 1.2 依赖关系

```
Step 1 ──→ Step 2 ──→ Step 3 ──→ Step 4    （独立系统，无依赖）
                                          ↓
                              Step 5（工厂基础设施）
                              ↓
              ┌───────────────┼───────────────┐
              ↓               ↓               ↓
         Step 6-13        Step 14-18      Step 19-21
        (纯叙事型8个)    (复杂型5个)     (叙事+校准)
```

### 1.3 每条Step的执行流程

```
打开系统 → 读取涉及文件（理解调用链）
         → 实施改造（修改/新建/删除）
         → 验证关闸（lint 0 + tsc 0）
         → 关闭系统（确认无遗留引用）
```

---

## 二、详细执行步骤

---

### Step 1: 种族起源系统 (race-origin)

**源计划**: P0-2 | **风险**: 低 | **已验证**: 命格模式可直接套用

#### 涉及文件
| 文件 | 操作 |
|------|:--:|
| `src/mods/mod-character/prompts/race-origin.ts` | 改造 |
| `src/mods/mod-character/prompts/use-race-origin.ts` | 检查调用链 |

#### 当前状态
- systemPrompt: `stringifyPrompt({role, task, constraints})` JSON规则体
- userPrompt: `stringifyPrompt({worldDescription, race, characterBackground, instruction})` 4变量
- 调用方: [use-race-origin.ts](file:///d:/AI/ai-life-sim/src/mods/mod-character/prompts/use-race-origin.ts) — 前端 hook，直接 `callAI(raceOriginPrompt.systemPrompt, userPrompt, ...)`
- 输出: 50-100字纯文本种族起源

#### 改造方案
参照 `destiny-pattern-prompt.ts` 模式：
- systemPrompt → 纯字符串：`你是种族起源生成器。` + 3个不同世界观的起源示例
- userPrompt → 精简为 `{worldDescription, race, characterBackground}` 紧凑JSON
- Schema 不变

#### 验证方式
1. `npm run lint && npx tsc --noEmit` — 零错误
2. 浏览器：角色创建页选非人类种族 → 验证起源文本生成

---

### Step 2: 世界标签系统 (world-tags)

**源计划**: P0-3 | **风险**: 低 | **备注**: 已是 fallback 路径

#### 涉及文件
| 文件 | 操作 |
|------|:--:|
| `src/mods/mod-world/prompts/world-tags-prompt.ts` | 改造 |

#### 当前状态
- systemPrompt: `stringifyPrompt({role, task, constraints(8条), tagCategories(5类含示例), exampleOutput})` — 冗长
- userPrompt: `stringifyPrompt({...12个变量})` — 信息冗余
- 路径: 仅为 Pipeline fallback（主路径 world-dimension-calibration 一次输出 worldTags）
- 输出: `{tags: string[]}` 5-8个氛围标签

#### 改造方案
- systemPrompt → 纯字符串：`你是世界标签生成AI。` + 3个不同世界观标签输出示例 + 4条核心约束
- userPrompt → 精简为 `{worldDescription, worldType, coherenceHint}` 3字段
- 删除 tagCategories 枚举定义 → 让AI从示例中学习

#### 验证方式
1. `npm run lint && npx tsc --noEmit` — 零错误
2. 浏览器：世界创建 Pipeline → fallback 路径触发 → 检查标签质量

---

### Step 3: 生命阶段适配 (life-stage)

**源计划**: P1-3 | **风险**: 低 | **⚠ 当前 UNWIRED**

#### 涉及文件
| 文件 | 操作 |
|------|:--:|
| `src/mods/mod-character/prompts/life-stage-adaptation.ts` | 改造 |
| `src/mods/mod-character/prompts/destiny-pattern-context.ts` | 确认无引用 |

#### 当前状态
- `@status: UNWIRED — 子系统纯规则不调AI`
- systemPrompt: `''`（空）
- userPromptTemplate: `'{{worldCalibrationSummary}}'`（仅1变量）
- registry: **不在** `ADAPTATION_PROMPT_MAP` 中
- 调用链: **无**

#### 改造方案
1. 补齐 systemPrompt（参考 adaptation 工厂模板）
2. 增加子系统状态变量到 userPromptTemplate
3. **暂不激活** registry（待 Step 5 工厂完成后统一接入）

#### 验证方式
1. `npm run lint && npx tsc --noEmit` — 零错误
2. 确认 schema 和变量声明一致

---

### Step 4: 寿命适配 (lifespan)

**源计划**: P1-3 | **风险**: 低 | **⚠ 当前 UNWIRED**

#### 涉及文件
| 文件 | 操作 |
|------|:--:|
| `src/mods/mod-character/prompts/lifespan-adaptation.ts` | 改造 |

#### 当前状态
- `@status: UNWIRED — 子系统纯规则不调AI`
- systemPrompt: `''`（空）
- userPromptTemplate: `'{{worldCalibrationSummary}}'`（仅1变量）
- registry: **不在** `ADAPTATION_PROMPT_MAP` 中
- 调用链: **无**

#### 改造方案
1. 补齐 systemPrompt
2. 增加子系统状态变量到 userPromptTemplate
3. **暂不激活** registry（待 Step 5 工厂完成后统一接入）

#### 验证方式
1. `npm run lint && npx tsc --noEmit` — 零错误

---

### Step 5: Adaptation 工厂函数（基础设施）

**源计划**: P0-1 前半 | **风险**: 中高 | **关键步骤**

#### 涉及文件
| 文件 | 操作 |
|------|:--:|
| `src/core/ai-service/adaptation-prompt-factory.ts` | **新建** |
| `scripts/codegen/generate-mod-wiring.mjs` | 改造 |
| `src/mods/mod-engine/helpers/adaptation-prompt-registry.generated.ts` | 不改（codegen产物，Step 6起逐子系统更新） |

#### 当前状态
- 13个 adaptation prompt 文件各自独立定义 PromptTemplate
- Registry 由 codegen 自动生成，通过 static import 引用各文件
- [adaptation-manager-system.ts](file:///d:/AI/ai-life-sim/src/mods/mod-engine/subsystems/adaptation-manager-system.ts) 通过 `ADAPTATION_PROMPT_MAP[id]` 查找 promptTemplate → `callAIWithPromptTemplate()`

#### 改造方案

**新建工厂函数** `src/core/ai-service/adaptation-prompt-factory.ts`:

```ts
// 纯叙事型配置（输出仅 narrativeHint）
interface PureNarrativeConfig {
  type: 'pure-narrative'
  name: string                    // "战力适配 AI"
  rules: string[]                 // 子系统特有规则
  worldviewTerms: Record<string, string>  // 世界观→术语映射
  stateVariables: { label: string; varName: string }[]
}

// 复杂型配置（输出含映射表/数组）
interface ComplexConfig {
  type: 'complex'
  name: string
  systemPromptTemplate: (config) => string  // 自定义 systemPrompt 构建
  userPromptTemplate: string     // 自定义 userPrompt 模板
  outputSchema: z.ZodType
  variables: string[]
}

type AdaptationConfig = PureNarrativeConfig | ComplexConfig

export function buildAdaptationPrompt(
  subsystemId: string,
  config: AdaptationConfig,
): PromptTemplate { ... }
```

**关键差异说明**（二次评估发现，原计划低估）:
- 13个文件中，**8个** 输出仅 `narrativeHint`（纯叙事型，可统一工厂化）
- **5个** 有特殊输出结构（`stageNames`/`luck`/`monsterTypes`/`archetypes`/`narrativeHints[]`），需 `ComplexConfig`

#### 验证方式
1. `npm run lint && npx tsc --noEmit` — 零错误
2. 工厂函数单元验证：用3种配置调用 `buildAdaptationPrompt()` → 检查生成的 PromptTemplate 结构完整性

---

### Step 6–13: Adaptation 纯叙事型（逐个迁移）

**源计划**: P0-1 | **风险**: 低（单步） | **共8个**

#### 每个子系统的执行流程

```
① 读取旧文件 → 提取 systemPrompt 规则文本
② 写入配置到 adaptation-prompt-factory.ts 的配置表
③ 修改 registry：将 static import 替换为工厂调用
④ 删除旧 adaptation-xxx-prompt.ts 文件
⑤ 验证：lint + tsc
⑥ 确认无残留引用 → 下一子系统
```

> 注意：第②步需在工厂文件中维护一个配置注册表（`ADAPTATION_CONFIGS`），每个子系统迁移时追加一条记录。

#### 子系统列表

| Step | 子系统ID | 旧文件 | systemPrompt规则数 |
|:--:|------|------|:--:|
| 6 | `cultivation` | adaptation-cultivation-prompt.ts | 3 |
| 7 | `fortune-encounter` | adaptation-fortune-encounter-prompt.ts | 4 |
| 8 | `faith` | adaptation-faith-prompt.ts | 4 |
| 9 | `supreme-item` | adaptation-supreme-item-prompt.ts | 5 |
| 10 | `divine-intervention` | adaptation-divine-intervention-prompt.ts | 4 |
| 11 | `anomaly-phenomena` | adaptation-anomaly-phenomena-prompt.ts | 5 |
| 12 | `special-material` | adaptation-special-material-prompt.ts | 5 |
| 13 | `golden-finger` | adaptation-golden-finger-prompt.ts | 4 |

**每个Step的验证**:
1. `npm run lint && npx tsc --noEmit` — 零错误
2. 浏览器：世界创建 → 该子系统适配管线触发 → 检查叙事文本

---

### Step 14–18: Adaptation 复杂型（逐个迁移）

**源计划**: P0-1 | **风险**: 中（单步） | **共5个**

#### 子系统列表

| Step | 子系统ID | 旧文件 | 特殊输出 |
|:--:|------|------|------|
| 14 | `combat-power` | adaptation-combat-power-prompt.ts | `stageNames{}` + `narrativeHint` |
| 15 | `luck` | adaptation-luck-prompt.ts | `luck`(int) + `narrativeHint` |
| 16 | `monster` | adaptation-monster-prompt.ts | `monsterTypes[]` + `narrativeHint` |
| 17 | `antagonist` | adaptation-antagonist-prompt.ts | `archetypes[]` + `recommendedCount` |
| 18 | `divine-creation` | adaptation-divine-creation-prompt.ts | `narrativeHints[]` + `divineMood` |

#### 改造要点
每个复杂型子系统使用 `ComplexConfig`：
- 保留自定义 `systemPromptTemplate`（规则差异大，无法纯配置化）
- 保留自定义 `userPromptTemplate`（变量结构各异）
- 仅统一注册方式 → 删除独立文件

#### 每个Step的验证
1. `npm run lint && npx tsc --noEmit` — 零错误
2. 浏览器：该子系统适配管线触发 → 检查输出结构完整性

#### Step 18+ 收尾
- 修改 `scripts/codegen/generate-mod-wiring.mjs`：不再生成 13 个 import，改为生成工厂调用
- 运行 `npm run generate:wiring` → 确认 registry 由 codegen 生成正确
- 全量 `npm run lint && npx tsc --noEmit`

---

### Step 19: 叙事 Prompt 全面优化

**源计划**: P1-2 | **风险**: 中高 | **涉及文件**: 5 | **多子agent交叉评估完成**: 2026-07-03

#### 涉及文件
| 文件 | 操作 |
|------|:--:|
| `src/foundation/types/narrative.types.ts` | 新增 PromptContext.powerCeilingPresets |
| `src/mods/mod-world/utils/world-init-prompt-vars.ts` | 新增 buildPowerCeilingPresetsForNarrative() |
| `src/mods/mod-engine/subsystems/orchestrator-system.ts` | 组装+注入新字段 |
| `src/mods/mod-engine/prompts/narrative-prompt.ts` | 模板新增字段 |
| `src/mods/mod-engine/bootstrap/prompt-context-contract.generated.ts` | 同步更新 |

#### 19.1 已完成（Demo 已体现）

| # | 改动 | 位置 |
|---|------|------|
| 19.1.1 | `combat-power`/`work`/`foreshadowing`/`fate-prophecy` 加入可变更子系统ID列表 | system L30 |
| 19.1.2 | 新增 `"命格天赋"` 字段（首轮注入天赋摘要） | [user] |
| 19.1.3 | 新增 `"子系统变更指南"` 字段（各子系统合法变更字段+跨系统联动规则） | [user] |
| 19.1.4 | 新增 `"力量体系"` 字段（≤ceiling完整描述，超出仅简短境界名） | [user] |
| 19.1.5 | 修复属性值矛盾（[user]与[user[2]]统一为0） | [user] L140 |
| 19.1.6 | 去除[user]玩家自定义中重复的人口/GDP（已在[user[2]]当前状态中） | [user] L131 |
| 19.1.7 | 全零子系统压缩为单行（道具/技能/声誉/关系/家族/定居点从47行→3行） | [user[2]] |
| 19.1.8 | 代码实现 `buildPowerCeilingPresetsForNarrative()` + orchestrator注入 | 4个源码文件 |

#### 19.2 待完成（交叉评估发现）

| 优先级 | 改动 | 说明 |
|:--:|------|------|
| P1 | 字段传输分层（个人每轮/宏观变动时） | 市场/人口/定居点从每轮必传中移除，仅重大变动时推送 |
| P1 | 6个示例从 system prompt 移出 | ~3500字符每轮浪费，改为1-2个通用示例+动态few-shot |
| P1 | KV分段归位：STABLE内容不再每轮重编 | 世界设定/力量体系/角色/命运模式应在S1前缀段 |
| P2 | 世界规则字段与system约束去重 | [user] L109与[system] L19-20语义重叠 |
| P2 | 年代时间去重 | [user] era vs [user[2]] 当前时间重复 |
| P2 | 命运模式 description 精简 | 完整叙事散文→一行摘要 |
| P3 | 模板/JSON双路径统一 | narrativeToneHint/timeBridgeSummary/causalChainHint在模板路径丢失 |
| P3 | marriage/golden-finger/settlement 补充变更schema | 当前零校验，AI变更随意通过 |

#### 19.3 废弃项目可吸收做法（逐项源码验证后）

> 2026-07-03 逐项调研：9 项中有 7 项当前项目已实现且更完善，仅 2 项可吸收。

| 做法 | 废弃项目 | 当前项目现状（源码证据） | 可吸收？ |
|------|------|------|:--:|
| 子系统变化阈值过滤 | 默认8%变化才通知 | **已有** `subsystem-relevance-system.ts:250` — `isRelevant()` 年龄/阶层/势力/影响力五维过滤 + `hasRecentChange()` 滑动窗口 | ✗ 已超越 |
| 紧凑JSON键名映射 | n/a/s/e/b替代全称 | **部分有** `narrative-config.ts:65` — `COMPACT_JSON_KEY_MAP` 已定义，但仅流式消费端识别，AI 输出端未启用 | △ 输出端启用 |
| 字段频率控制 | always/change/3round/5round/never | **已有** `prompt-builder.ts:100-454` — STABLE/SLOW/FAST 三段 KV 缓存 + `buildSegmentedPrompt()` S3 策略 | ✗ 已超越 |
| KV Cache任务池分流 | 同类调用共享缓存 | **没有** — userId 仅用于 logMeta，无 TASK_POOL 机制 | ✓ 可引入 |
| 禁止行动模式 | 10种 Forbidden Action Patterns | **部分有** `narrative-prompt.ts:158-402` — 多条禁止约束，但 `system-prompt.ts` 中无 | △ 补到 system prompt |
| 事件生命周期追踪 | new/ongoing/ending | **已有** `event-lifecycle-tracker.ts:29-425` — 14维度检测 + 三态生命周期 + TOP-3注入 | ✗ 已超越 |
| 多级压缩管线 | L1-L4 | **已有 L1-L6** `summary-compressor-system.ts:229-633` — 六级压缩 + 叶子注入优化，覆盖至 15625 轮 | ✗ 已超越 |
| 示例按世界类型分类 | 修仙/科幻/现代各有示例 | **没有** `narrative-prompt.ts:304` — 7个示例扁平数组，无 `worldType` 分类字段 | ✓ 可引入 |
| 本地方向预判 | 综合多因素减少AI调用 | **已有** `summary-compressor-system.ts:661` — `determineLocalDirection()` 7步优先级预判 | ✗ 已超越 |

**结论**: 当前项目在 9 个维度中 7 个已实现并超越废弃项目，仅 2 项可吸收（KV Cache 任务池分流、示例按世界类型分类），2 项可局部补全（紧凑键名输出端启用、禁止模式补到 system prompt）。

---

### Step 20: 叙事示例瘦身

**源计划**: P1-1 | **风险**: 高 | **需A/B对比**

#### 涉及文件
| 文件 | 操作 |
|------|:--:|
| `src/mods/mod-engine/prompts/narrative-prompt.ts` | 删减示例 |

#### 当前状态（二次评估核实）

实际 **7个** 示例（原计划说6个）:

| 示例 | 场景 | 复杂度 | 建议 |
|------|------|:--:|:--:|
| 示例0 | 首轮·出生与家庭 | 低(narrative only) | **保留** |
| 示例1 | 现代日常·小学生活 | 中(changes + events) | **保留** |
| 示例2 | 技能移除·重伤恢复 | 中(skill revoke) | 删除 |
| 示例3 | 战斗·分支抉择 | 高(branch + 多系统) | **保留** |
| 示例4 | 结局·自然老死 | 低(narrative only) | **保留**（低频但关键） |
| 示例5 | 日常·学艺社交 | 中(skill + relations) | 删除 |
| 示例6 | 日常修炼·跨系统联动 | 中(cultivation + economy) | 删除 |

**改造方案**: 7→4（保留 0/1/3/4），比原计划多保留"结局"示例

#### 验证方式
1. `npm run lint && npx tsc --noEmit` — 零错误
2. **A/B对比测试**（关键）:
   - 同一世界观+角色，跑3轮叙事 → 对比输出多样性、合规性
   - 确认覆盖出生/日常/战斗/结局四类场景

---

### Step 21: 校准 Prompt 去重

**源计划**: P2-1 | **风险**: 中 | **低优先级**

#### 涉及文件
| 文件 | 操作 |
|------|:--:|
| `src/mods/mod-world/prompts/world-calibration-prompt.ts` | 提取共享段 |
| `src/mods/mod-world/prompts/world-dimension-calibration-prompt.ts` | 引用共享段 |

#### 当前状态（二次评估核实）

| 维度 | world-calibration-prompt | world-dimension-calibration-prompt |
|------|------|------|
| 定位 | **Fallback**（缓存命中但缺W02时） | **主路径**（维度+校准单次调用） |
| systemPrompt | ~120行 stringifyPrompt | ~130行 stringifyPrompt |
| **实际重叠** | | **约60%**（不是原估计70%） |
| 共享段 | `decisionRules[7-9]` + `formulaPrinciples[3]` + `fieldDictionary` + `constraints[8-14]` | 同左 + `dimensionDefinitions` + `dimensionInferenceRules[6]` |
| Output Schema | `calibration + aiDetailedParameters + worldTags` | `dimensions + calibration + aiDetailedParameters + worldTags` |

> **修正**: 两文件 schema 有继承关系——`worldDimensionCalibrationOutputSchema` 的 `calibration` 和 `aiDetailedParameters` 直接引用 `world-calibration-prompt.ts` 的 schema。

#### 改造方案
1. 提取共享的 `decisionRules`/`formulaPrinciples`/`fieldDictionary`/`constraints` 到一个独立常量
2. 两个 prompt 文件分别 `...共享段` 拼接各自特有段
3. 确保双方解析管线不互相破坏

#### 验证方式
1. `npm run lint && npx tsc --noEmit` — 零错误
2. 浏览器：世界创建 Pipeline 主路径 + fallback 路径 → 确认校准输出正常

---

## 三、关闸标准

| 阶段 | 检查 |
|------|------|
| **每个 Step 完成** | lint 0 + tsc 0 |
| Step 1-4 完成 | 浏览器：角色创建 → 种族起源 + 世界标签 fallback |
| Step 5-18 完成 | 浏览器：世界创建 → 角色创建 → 各 adaptation 管线触发 |
| Step 19 完成 | 浏览器：完整叙事轮次 → 对比缓存命中率 |
| Step 20 完成 | **A/B 对比**：同一场景下输出多样性/合规性 |
| Step 21 完成 | 浏览器：校准主路径 + fallback 路径双验证 |

---

## 四、附录

### A. 不执行的域

| 域 | 原因 |
|----|------|
| mod-world 校准主线 | 校准是AI目标本身，示例驱动不适用；已做合并优化 |
| mod-world 时间线/上古史/实体 | 输出规模大，需世界全量上下文 |
| mod-engine 叙事主干（systemPrompt） | KV分段已优化（S1/S2/S3），不可简单动刀 |
| mod-engine 摘要压缩 | 压缩是必要机制，改进方向是减少调用次数 |
| post-death-epilogue | 低频调用（一生一次），token开销小 |

### B. 全项目 Prompt 文件索引（当前，改造前）

| 域 | 文件数 | 计划改造 |
|----|:--:|:--:|
| mod-engine | 6 | 2（narrative-prompt + 间接orchestrator） |
| mod-world | 10 | 3（world-tags + calibration×2） |
| mod-character | 7 | 4（race-origin + life-stage + lifespan + 已改destiny） |
| mod-power-system | 10 | 10（全部 adaptation） |
| mod-npc | 2 | 1（adaptation-antagonist） |
| mod-golden-finger | 1 | 1（adaptation-golden-finger） |
| mod-base-universe | 1 | 1（adaptation-divine-creation） |
| mod-pages | 2 | 0 |
| **合计** | **39** | **22** |
