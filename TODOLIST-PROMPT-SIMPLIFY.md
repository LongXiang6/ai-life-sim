# AI Prompt 全面精简 — 待执行计划书

> 基于 4 个子 agent 对全项目 39+ 个 prompt 文件的交叉评估
> 已改造参考: `src/mods/mod-character/prompts/destiny-pattern-prompt.ts` (命格示例化)
> **生成日期**: 2026-07-03 | **状态**: 待执行

---

## ⚠️ 待二次评估标记

以下项目在初步评估中列为可执行，但因未做完整链路验证，执行前需子 agent 逐项核实：

| 标记 | 项目 | 需核实内容 | 风险等级 |
|:--:|------|-----------|:--:|
| 🔴 | P0-1 adaptation 统一 | 13 个文件的 systemPrompt/userPrompt 是否完全同构；删除独立文件后 adaptation-manager-system 调用链是否完整 | 中 |
| 🟡 | P1-1 叙事示例瘦身 | 减少示例后 AI 输出质量是否下降；需 A/B 对比测试 | 高 |
| 🟡 | P1-2 字段合并 | KV 前缀变更是否影响 DeepSeek 缓存命中率（当前 89%） | 高 |
| 🟡 | P2-1 校准去重 | 两条校准路径的解析/校验管线是否完全兼容共享段 | 中 |
| 🟢 | P1-3 空 prompt 补齐 | 补齐后需验证 life-stage/lifespan 输出质量是否符合叙事规范 | 低 |

> **执行建议**：P0-1/P0-2/P0-3 可直接执行（模式已验证）；🔴🟡 项建议先跑一轮子 agent 验证再动手。

---

## 一、执行摘要

全项目共发现 **16 个 Prompt 定义文件**，分布在 7 个 mod 域中。评估结果：

| 优先级 | 数量 | 涉及文件数 |
|:--:|:--:|:--:|
| **P0 — 立即执行** | 3 项 | ~18 个文件 |
| **P1 — 短期执行** | 3 项 | ~8 个文件 |
| **P2 — 长期评估** | 2 项 | ~5 个文件 |
| **不执行** | 5 个域 | — |

---

## 二、P0：立即执行（高收益、低风险、模式已验证）

### P0-1：统一 13 个 Adaptation Prompt 为一个工厂函数

**现状**：13 个子系统各有一个独立的 adaptation prompt 文件，模式高度一致：

```
mod-power-system/prompts/adaptation-cultivation-prompt.ts
mod-power-system/prompts/adaptation-combat-power-prompt.ts
mod-power-system/prompts/adaptation-luck-prompt.ts
mod-power-system/prompts/adaptation-fortune-encounter-prompt.ts
mod-power-system/prompts/adaptation-faith-prompt.ts
mod-power-system/prompts/adaptation-supreme-item-prompt.ts
mod-power-system/prompts/adaptation-divine-intervention-prompt.ts
mod-power-system/prompts/adaptation-anomaly-phenomena-prompt.ts
mod-power-system/prompts/adaptation-special-material-prompt.ts
mod-power-system/prompts/adaptation-monster-prompt.ts
mod-npc/prompts/adaptation-antagonist-prompt.ts
mod-golden-finger/prompts/adaptation-golden-finger-prompt.ts
mod-base-universe/prompts/adaptation-divine-creation-prompt.ts
```

共通模式：
- systemPrompt = 3-5 行中文裸字符串（"你是XX适配AI…叙事规则…"）
- userPrompt = `子系统状态 + worldview + {{worldCalibrationSummary}}`
- 输出 = 200-500 字叙事文本

**改法**：新建 `src/core/ai-service/adaptation-prompt-factory.ts`

```ts
export function buildAdaptationPrompt(subsystemId: string, config: {
  name: string
  rules?: string[]
}): PromptTemplate {
  return {
    systemPrompt: `你是${config.name}适配AI。根据子系统状态和世界观生成叙事描述。${rules}...`,
    userPromptTemplate: '{{subsystemSummary}}\n{{worldview}}\n{{worldCalibrationSummary}}',
    ...
  }
}
```

`adaptation-manager-system.ts` 调用时传 subsystemId + config，替代 13 个独立文件。

**涉及文件**：
- 新建: `src/core/ai-service/adaptation-prompt-factory.ts`
- 修改: `src/mod-engine/subsystems/adaptation-manager-system.ts`
- 修改: `src/mod-engine/helpers/adaptation-prompt-registry.generated.ts`
- 可删除: 13 个独立 adaptation prompt 文件

**预期收益**：减少 ~300 行/13 文件 → ~30 行/1 文件

---

### P0-2：种族起源 Prompt 示例化（race-origin）

**现状** (`src/mods/mod-character/prompts/race-origin.ts`)：
- systemPrompt = `RACE_ORIGIN_SYSTEM_PROMPT`（JSON 规则体）
- userPrompt = `{{worldDescription}}` + `{{race}}` + `{{characterBackground}}`
- 输出 = 50-100 字种族起源叙事

**与命格同理**：输入仅 3 个变量，输出轻量，适合示例驱动。

**改法**（参照 `destiny-pattern-prompt.ts`）：
- systemPrompt：纯字符串，3-4 个不同世界观的起源示例
- userPrompt：`worldDescription` + `race` + `characterBackground`（精简版）

**涉及文件**：
- `src/mods/mod-character/prompts/race-origin.ts`
- `src/mods/mod-character/prompts/use-race-origin.ts`

**预期收益**：token 消耗 -40%

---

### P0-3：世界标签 Prompt 示例化（world-tags）

**现状** (`src/mods/mod-world/prompts/world-tags-prompt.ts`)：
- systemPrompt = `stringifyPrompt({...})` 含 5 类标签定义 + 示例 + 约束
- userPrompt = 12 个变量
- 输出 = 5-8 个氛围标签
- **已是 fallback 路径**（主路径的合并调用不经过此文件）

**改法**：示例驱动，3-4 个不同世界观标签输出示例，精简规则文本为 4 条核心约束。

**涉及文件**：
- `src/mods/mod-world/prompts/world-tags-prompt.ts`

**预期收益**：systemPrompt -50%

---

## 三、P1：短期执行（中收益、需验证）

### P1-1：叙事 System Prompt 示例瘦身

**现状** (`src/mods/mod-engine/prompts/narrative-prompt.ts`)：
- `FEW_SHOT_EXAMPLES` 含 6 个完整示例（占总 system prompt ~40%）
- 改前约 400 行 TypeScript，序列化后 ~12K 字符

**改法**：6 个示例 → 3 个代表性示例（保留出生/现代日常/战斗分叉），减少 ~800 tokens/首轮。

**风险**：AI 输出多样性可能微降。建议先减到 4 个，观察质量再决定。

**涉及文件**：
- `src/mods/mod-engine/prompts/narrative-prompt.ts`

---

### P1-2：叙事 User Prompt 相邻字段合并

**现状**：26 个 user prompt 变量，以下 4 对语义相近：
1. `时间桥摘要` + `因果链提示` → 可合并为 `时间因果上下文`
2. `世界规则` + `MOD世界规则` → 可在 `assemblePromptContext` 中拼接
3. `记忆摘要` + `核心记忆` → 同一系统产出，可合并

**改法**：在 `assemblePromptContext()` 中做字段合并，减少 2-3 个 JSON key。

**风险**：需验证 KV 前缀稳定性（键序变了影响缓存命中）。

**涉及文件**：
- `src/mods/mod-engine/subsystems/orchestrator-system.ts`（`assemblePromptContext`）
- `src/mods/mod-engine/prompts/narrative-prompt.ts`（userPromptTemplate）

---

### P1-3：空 Prompt 补齐（life-stage / lifespan adaptation）

**现状**：
- `life-stage-adaptation.ts`: systemPrompt = `''`，userPrompt = `'{{worldCalibrationSummary}}'`
- `lifespan-adaptation.ts`: systemPrompt = `''`，userPrompt = `'{{worldCalibrationSummary}}'`

两个 adaptation prompt 的 systemPrompt 为空，仅依赖一个变量。当前有效载荷几乎为零，AI 靠"猜"来生成。

**改法**：补齐 systemPrompt（参考 adaptation-prompt-factory 模板），增加子系统状态变量。

**涉及文件**：
- `src/mods/mod-character/prompts/life-stage-adaptation.ts`
- `src/mods/mod-character/prompts/lifespan-adaptation.ts`

---

## 四、P2：长期评估（低优先级）

### P2-1：校准 Prompt 去重

`world-dimension-calibration-prompt.ts` 和 `world-calibration-prompt.ts` 的 systemPrompt 约 70% 重叠。可提取共享段。

**原因排后**：
- calibration 本身是目标而非手段
- 两条路径已有缓存命中优化
- 改动涉及解析/校验管线联动

### P2-2：worldTagsText 数据源统一

UI（game-story 页面）和 AI（orchestrator）用了两条不同的 worldTagsText 来源。统一可消除不一致风险。

---

## 五、不执行的域（已充分优化或有硬约束）

| 域 | 原因 |
|----|------|
| **mod-world 校准主线** | 校准本身就是 AI 目标，示例驱动不适用；已做合并优化 |
| **mod-world 时间线/上古史/实体** | 输出规模大，需世界全量上下文 |
| **mod-engine 叙事主干** | KV 分段已优化（S1/S2/S3），不可简单动刀 |
| **mod-engine 摘要压缩** | 压缩是必要机制，改进方向是减少调用次数非精简 prompt |
| **post-death-epilogue** | 低频调用（一生一次），token 开销小 |

---

## 六、执行顺序

```
Phase 1: P0-1 (adaptation 统一) → P0-2 (race-origin) → P0-3 (world-tags)
         ↓
Phase 2: P1-3 (补齐空 prompt) → P1-1 (叙事示例瘦身) → P1-2 (字段合并)
         ↓
Phase 3: P2-1 (校准去重) → P2-2 (worldTagsText 统一)
```

每个 Phase 完都跑 `npm run lint` + `npx tsc --noEmit` 关闸。

---

## 七、关闸标准

| 阶段 | 检查 |
|------|------|
| 每项完成后 | lint 0 + tsc 0 |
| Phase 1 完成后 | 浏览器测试：世界创建 → 角色创建 → 命格抽取 → 剧情运行 |
| Phase 2 完成后 | 对比剧情质量（观察 AI 输出多样性、合规性） |

---

## 八、附录：全项目 Prompt 文件索引

| 域 | 文件数 |
|----|:--:|
| mod-engine | 6 |
| mod-world | 10 |
| mod-character | 7 |
| mod-power-system | 10 |
| mod-npc | 2 |
| mod-golden-finger | 1 |
| mod-base-universe | 1 |
| mod-pages | 2 |
| **合计** | **39** |
