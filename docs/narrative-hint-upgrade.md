# 叙事提示词升级蓝图

> **目的**：将废弃项目的 20+ 动态 hint 系统移植到当前项目，同时对 Few-Shot 进行补充。
> **日期**：2026-06-28
> **范围**：mod-engine + mod-character

---

## 一、改动清单

| # | 文件 | 操作 | 内容 |
|---|------|------|------|
| A1 | `src/mods/mod-engine/prompts/narrative-prompt.ts` | 修改 | `examples` 从 2 个扩展到 5 个（追加废弃项目 3 例） |
| B1 | `src/mods/mod-engine/helpers/narrative-hints.ts` | **新建** | 7 个动态 hint 函数 |
| B2 | `src/mods/mod-engine/helpers/orchestrator-pipeline-support.ts` | 修改 | 新增导出 |
| B3 | `src/mods/mod-engine/subsystems/orchestrator-system.ts` | 修改 | 3 处改动 |
| B4 | `src/core/ai-service/prompt-builder.ts` | 修改 | 新增 `talents` 字段 + `instruction` 字段值升级 |

---

## 二、A 层 — Few-Shot 升级

### A1: `narrative-prompt.ts` — 扩展 `examples` 数组

**当前状态**（第 190-217 行）：2 个示例
- 现代小学生活（描述性叙事 + changes）
- 技能移除（changes 示范）

**目标状态**：5 个示例（追加废弃项目 3 例）
- 保留现有 2 个 → 保持格式一致性
- 追加：
  1. **战斗修仙**（分支选项 + 技能/关系/知识变化）
  2. **结局自然老死**（人生终点叙事 + e=1）
  3. **日常社交**（平凡日常 + 技能学习 + 关系变化）

**示例格式对齐**：废弃项目用单字符键（n/a/s/e/b/t/o/sk/rl/kn/it），需转换为当前项目的完整键名：

| 废弃项目键 | → | 当前项目键 |
|-----------|:-:|----------|
| `n` | → | `narrative` |
| `a` | → | `changes`（拆分到 `id`/`description`/`changes`） |
| `s` | → | `stayInScene`（可选字段） |
| `e` | → | `isEnding`（可选字段） |
| `b` | → | `branch` |
| `t` | → | `branchTitle` |
| `o` | → | `branchOptions` |
| `sk` | → | `changes[{id:'skill', ...}]` |
| `rl` | → | `changes[{id:'relationships', ...}]` |
| `kn` | → | `notableEvents`（可选字段） |
| `it` | → | `changes[{id:'inventory', ...}]` |

---

## 三、B 层 — 提示词组装优化

### 架构决策

**新建独立模块** `narrative-hints.ts`，不修改废弃项目的代码（两套代码库独立维护），仅移植逻辑。

**hint 注入点**：所有 hint 合并后写入 `PromptContext.userInstruction`，走现有 `prompt-builder.ts` → `buildNarrativeUserJson` → `instruction` 字段。

### B1: 新建 `narrative-hints.ts`

路径：`src/mods/mod-engine/helpers/narrative-hints.ts`

导出函数：

```
export interface NarrativeHintInput {
  currentAge: number
  maxAge: number
  startingAge: number
  round: number
  recentEvents: Array<{ narrative?: string; age: number }>
  lastPlayerChoice?: string
  forceBranch: boolean
  branchJustResolved: boolean
  consecutiveSameGoalRounds: number
  timeSkipYears?: number
  narrativeStyle?: string
  lifeStage: LifeStageId
  difficulty?: string
  longTermMemory: {
    spouse?: { name: string }
    faction?: { rank: number }
    wealth?: { level: number; description: string }
  }
  worldview?: string
}

export interface NarrativeHints {
  mandatory: string[]    // 必遵指令，写入 "指令（必遵）" 字段
  optional: string[]     // 参考建议，写入 "参考建议" 字段
}

export function buildNarrativeHints(input: NarrativeHintInput): NarrativeHints
```

**内部实现的 7 个 hint 子函数**：

| 函数 | 来源 | 功能 | 触发条件 |
|------|------|------|---------|
| `hintForceBranch` | life-sim-narrative.ts:395-400 | 强制分叉 | forceBranch / 3岁 / 每15轮 |
| `hintMarriageAge` | life-sim-narrative.ts:402-408 | 谈婚论嫁 | 22-28岁 + 未婚 + 近3轮无婚恋 |
| `hintAdventureFrequency` | life-sim-narrative.ts:410-417 | 奇遇刹车 | 近6轮 ≥3 次秘境关键词 |
| `hintDiseaseContinuity` | life-sim-narrative.ts:428-435 | 重病延续 | 上轮含重病/重伤关键词 |
| `hintBranchResolved` | life-sim-narrative.ts:449-464 | 分支解决 + 行动规模 | branchJustResolved / lastPlayerChoice（含 small/medium/large 分类） |
| `hintSceneJump` | life-sim-narrative.ts:474-477 | 场景跳跃 | 上次事件后跳过N年 |
| `hintLifespanReminder` | life-sim-lifecycle.ts:353-359 | 寿命提醒 | 85%/50%/10% 阈值 |

**actionScale 分类函数**（辅助用）：
```typescript
export function classifyActionScale(choice: string): 'small' | 'medium' | 'large'
```
直接从废弃项目移植关键词列表。

**信息优先级**（硬编码常量，注入 worldview rules）：
```typescript
export const INFORMATION_PRIORITY_RULE = `
【信息优先级】冲突时按此裁决：
1[最高] 世界观逻辑 = 剧情合理性 > 2 基础属性 > 3 生命状态 > 4 身份/背景 > 5[最低] 隐藏命格
`
```

---

### B2: 修改 `orchestrator-pipeline-support.ts`

新增导出：
```typescript
export {
  buildNarrativeHints,
  classifyActionScale,
  INFORMATION_PRIORITY_RULE,
} from './narrative-hints'
export type { NarrativeHintInput, NarrativeHints } from './narrative-hints'
```

---

### B3: 修改 `orchestrator-system.ts` — 3 处改动

#### B3-1: 导入新增 （~60行区域）

新增导入：
```typescript
import {
  buildNarrativeHints,
  classifyActionScale,
  INFORMATION_PRIORITY_RULE,
} from '../helpers/orchestrator-pipeline-support'
import type { NarrativeHintInput } from '../helpers/orchestrator-pipeline-support'
```

#### B3-2: 修改 `buildUserInstruction` （1368-1385 行区间）

**当前代码**（18 行）：
```typescript
private buildUserInstruction(): string | undefined {
    const lines: string[] = []
    if (forceBranchNext) lines.push('【强制分叉】...')
    if (lastPlayerChoice) lines.push('【玩家选择】...')
    // 历史分叉选择
    return lines.length > 0 ? lines.join('\n') : undefined
}
```

**改为**（~60 行）：
```typescript
private buildUserInstruction(): string | undefined {
    const lines: string[] = []

    // 优先级（首次注入到 rules 字段，后续 round 注入到 instruction）
    if (this.state.totalRounds === 0) {
      lines.push(`【叙事规则】${INFORMATION_PRIORITY_RULE}`)
    }

    // 动态 hints（移植自废弃项目 buildNarrativeRoundPrompt）
    const hints = buildNarrativeHints(this.buildHintInput())
    const mandatoryHints = hints.mandatory.join('。')
    const optionalHints = hints.optional.join('。')
    if (mandatoryHints) lines.push(`指令（必遵）：${mandatoryHints}`)
    if (optionalHints) lines.push(`参考建议：${optionalHints}`)

    // 原有逻辑保留
    if (useEngineStore.getState().forceBranchNext) {
      lines.push('【强制分叉】...')
    }
    if (this.lastPlayerChoice) {
      const scale = classifyActionScale(this.lastPlayerChoice)
      const scaleHint = scale === 'small' ? '（小目标，一轮完成）'
        : scale === 'large' ? '（宏大目标，分阶段推进）'
        : ''
      lines.push(`【玩家选择】${this.lastPlayerChoice}${scaleHint}`)
      this.lastPlayerChoice = undefined
    }
    // 历史分叉选择（保留）
    return lines.length > 0 ? lines.join('\n') : undefined
}

// 新增辅助方法：从当前状态构建 hint 输入
private buildHintInput(): NarrativeHintInput {
    // 收集所需数据
    return {
      currentAge: this.characterState?.age ?? 0,
      maxAge: /* 从 lifespan 子系统读取 */,
      startingAge: /* 从 character-base 子系统读取 */,
      round: this.state.totalRounds,
      recentEvents: this.buildYearEvents(),
      lastPlayerChoice: this.lastPlayerChoice,
      forceBranch: useEngineStore.getState().forceBranchNext ?? false,
      branchJustResolved: /* 上轮是否有分叉被解决 */,
      consecutiveSameGoalRounds: /* 从 store 读取 */,
      timeSkipYears: this.state.timeStep,
      narrativeStyle: this.getNarrativeStyle(),
      lifeStage: resolveLifeStageFromAge(...),
      difficulty: useSettingsStore.getState().difficulty,
      longTermMemory: { /* 从 coreMemory 子系统读取 */ },
      worldview: this.worldSetting?.config?.essenceTag,
    }
}
```

#### B3-3: `assemblePromptContext` 中添加 `talents` 字段（995-1152 行区间）

在 `assembled` 对象中加入：
```typescript
// 命格注入（首次：告知 AI 角色与生俱来的天赋特质）
if (this.state.totalRounds === 0) {
  const talents = getDestinyPatternSystem().getState().candidates
    .filter(t => t.isEquipped)
    .map(t => `${t.name}（${t.rarity}·${t.polarity}）：${t.description}`)
  if (talents.length > 0) {
    assembled.talents = talents.join('；')
  }
}
```

---

### B4: 修改 `prompt-builder.ts`

#### B4-1: `buildNarrativeUserJson` 中新增 `talents` 字段映射

在 JSON 构建函数中（第 350 行附近）新增：
```typescript
...('talents' in context && context.talents
  ? { talents: context.talents }
  : {}
),
```

#### B4-2: `narrativePrompt.userPromptTemplate` 中新增占位符

在 [narrative-prompt.ts:263](file:///d:/AI/ai-life-sim/src/mods/mod-engine/prompts/narrative-prompt.ts#L263) 的 `"instruction"` 行前插入：
```
'"talents": {{talents}},',
```

#### B4-3: `PromptContext` 类型中新增字段

在 `prompt-context-contract.generated.ts` 或相关类型定义中新增：
```typescript
talents?: string
```

---

## 四、属性语义化

废弃项目中 `角色状态: { 体魄: "强壮有力", 心智: "思维敏捷" }` 是语义化描述而非 raw 数字。

**当前项目现状**：`character` 字段直接暴露 raw 属性值 `"physique=5,mind=8"`

**优化**：在 `assemblePromptContext` 的 `character` 字段构建时，额外追加语义化描述：

```typescript
function buildAttrDescription(attrs: Record<string, number>, maxAge: number): string {
  // 1-3: 弱 / 4-6: 普通 / 7-8: 敏捷/强壮 / 9-10: 超凡
}
```

改为在 `character` 字段末尾追加一行语义映射，如 `"（体魄：强壮有力，心智：思维敏捷）"`。

---

## 五、数据流总览

```
buildNarrativeHints(NarrativeHintInput)
  │
  ├─ hintForceBranch()       → mandatory[]
  ├─ hintMarriageAge()       → optional[]
  ├─ hintAdventureFrequency() → optional[]
  ├─ hintDiseaseContinuity() → mandatory[]
  ├─ hintBranchResolved()    → optional[]
  ├─ hintSceneJump()         → optional[]
  └─ hintLifespanReminder()  → mandatory[]

      ↓
  { mandatory, optional }
      ↓
buildUserInstruction()
      │
      ├─ INFORMATION_PRIORITY_RULE → 首轮注入 worldRules
      ├─ mandatory → "指令（必遵）"
      ├─ optional  → "参考建议"
      ├─ forceBranch
      └─ playerChoice + classifyActionScale

      ↓
  userInstruction: string
      ↓
buildNarrativeUserJson() → "instruction" 字段
      ↓
buildSegmentedPrompt() → AI API
```

---

## 六、验证清单

执行完毕后逐项对照：

- [x] A1: `examples` 数组 5 个（2 保留 + 3 新增）
- [x] B1: `narrative-hints.ts` 存在，导出 7 个 hint 函数
- [x] B2: `orchestrator-pipeline-support.ts` 新增 3 个导出 + 2 type 导出
- [x] B3-1: `orchestrator-system.ts` 新增 import（4 函数 + 1 type + getDestinyPatternSystem）
- [x] B3-2: `buildUserInstruction` 从 18 行扩展到 ~50 行（含 buildHintInput）
- [x] B3-3: `assemblePromptContext` 中 `talents` 注入逻辑存在（通过 getPatterns()）
- [x] B4-1: `buildNarrativeUserJson` 中 `talents` 映射存在
- [x] B4-2: `userPromptTemplate` 中 `{{talents}}` 占位符存在
- [x] B4-3: `PromptContext` 类型包含 `talents?: string`
- [x] `INFORMATION_PRIORITY_RULE` 常量注入首轮 instruction
- [ ] 属性语义化映射函数（蓝图 §四，可选后续优化）
- [x] `classifyActionScale` 移植自废弃项目（关键词完全对齐）
- [x] 7 个 hint 函数触发条件与废弃项目逻辑一致
- [x] `lint` 0 errors, 44 warnings（全预存）
- [x] `tsc --noEmit` 0 errors
