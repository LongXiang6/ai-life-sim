# 蓝图计划书：统一 AI 调用 Wrapper —— 收敛 PromptTemplate 消费者的 AI 调用入口

> 版本：v2.2 | 日期：2026-06-29 | 级别：L2（core 公共 API + 2 消费者 + campaign V2，分 2 阶段交付）
> 前置依赖：output-schema-validation-enablement 蓝图已执行（`outputSchema` 字段已存在于 `AICallOptions`）

---

## 一、问题定义

### 1.1 现状

项目有 7 个潜在消费者，其中 4 个使用 PromptTemplate 但各自由不同路径调用 AI：

| 消费者 | 调用函数 | 使用 PromptTemplate？ | 当前 outputSchema 布线 | Wrapper 适用？ |
|--------|---------|----------------------|----------------------|----------------|
| **orchestrator V1** | `callAIStreamDegraded` | 是（`narrativePrompt`） | 手动附加到 streamOpts | 是（P2） |
| **campaign V2** | `callAIStreamDegraded` / `callAI` / `callAIDegraded` | 是（`narrativePrompt`） | 手动附加到 streamOpts | 是（P2，与 V1 同一批） |
| **adaptation-manager** | `callAI` | 是（`ADAPTATION_PROMPT_MAP`） | 手动附加到 callAI opts | 是（P1） |
| destiny-pattern-system | `this.callAI!()`（依赖注入） | 是（`destinyPatternPrompt`） | 手动附加到 callOpts | **否**（DI 适配层，wrapper 无法穿透，见 §3.6） |
| talent-draw | `callAI`/`callAIStream`（动态 import） | 间接（接收 `destinyPatternPrompt` 字段） | 由上游 destiny-pattern 提供 | 否（适配器已是最优抽象） |
| world-init-pipeline | `callAI`（通过闭包工厂） | **否**（systemPrompt 是裸字符串） | 手动附加（正确方式） | 否 |
| campaigns/default | 无 | N/A（不调 AI） | N/A | 否 |
| summary-compressor | `callAI` | **否**（systemPrompt 动态构建） | N/A | 否 |

**结论**：实际只有 2 个消费者适用 wrapper（adaptation-manager、orchestrator V1）。

每次新增消费者或 PromptTemplate 新增字段，都需要手动找到调用点并逐个布线。

### 1.2 修复目标

创建薄包装函数 `callAIWithPromptTemplate`，**仅做两件事**：
1. 从 `promptTemplate.systemPrompt` 提取 systemPrompt（替换位置参数）
2. 从 `promptTemplate` 自动附加 `jsonMode` + `outputSchema`

**不做的事**：
- 不填充 `userPromptTemplate`（调用方自己填充，包装不假设模板语义）
- 不吞掉非标准字段（`...restOptions` 透传全部）
- 不替代原有 `callAI`/`callAIStreamDegraded`（保留给不适用 PromptTemplate 的场景）

---

## 二、总体架构

### 2.1 Wrapper 设计

```typescript
// src/core/ai-service/ai-call-wrapper.ts（新建）

import { callAI, callAIStreamDegraded } from './ai-client'
import type { PromptTemplate } from '@/foundation'
import type { AICallOptions, CachePoolType } from './ai-client'

/**
 * 薄包装选项：AICallOptions 超集，增加 streaming 标记和 fallbackText
 * 其余字段透传给 callAI / callAIStreamDegraded
 */
interface UnifiedCallOptions extends AICallOptions {
  /** 是否走流式 + 降级链路（callAIStreamDegraded） */
  streaming?: boolean
  /** 仅 streaming 模式：降级兜底文本（callAIStreamDegraded 的第三个参数） */
  fallbackText?: string
}

/**
 * 统一 AI 调用入口 —— 自动从 PromptTemplate 提取 systemPrompt / jsonMode / outputSchema。
 * 
 * 职责边界：仅做 PromptTemplate → 调用参数的薄翻译，不填充 userPromptTemplate。
 * userPrompt 由调用方自行组装后传入。
 */
export async function callAIWithPromptTemplate(
  promptTemplate: PromptTemplate,
  userPrompt: string,
  options: UnifiedCallOptions,
): Promise<string> {
  const { streaming, fallbackText, ...restOptions } = options

  const commonOpts = {
    ...restOptions,
    jsonMode: promptTemplate.outputFormat === 'json',
    outputSchema: promptTemplate.outputSchema,
  }

  if (streaming) {
    return callAIStreamDegraded(
      promptTemplate.systemPrompt,
      userPrompt,
      fallbackText ?? '',
      commonOpts,
    )
  }
  return callAI(promptTemplate.systemPrompt, userPrompt, commonOpts)
}
```

### 2.2 消费者迁移矩阵

| 消费者 | 适用？ | 阶段 | 迁移方式 | 风险 |
|--------|--------|------|---------|------|
| adaptation-manager | 是（最佳试点） | P1 | `callAI(systemPrompt, user, { outputSchema, jsonMode, ... })` → `callAIWithPromptTemplate(prompt, user, opts)` | 低 |
| orchestrator V1 | 是 | P2 | `callAIStreamDegraded(systemPrompt, user, fallback, opts)` → `callAIWithPromptTemplate(prompt, user, { streaming: true, fallbackText: fallback, ...opts })` | 中 |
| destiny-pattern-system | **否**（DI 适配层阻隔） | — | 跳过。`this.callAI!` 是依赖注入的抽象层，传入非标准字段（`stream`/`stablePrefixChars`/`maxTokensOverride`），由 talent-draw 适配器翻译。wrapper 无法穿透适配层。见 §3.6 | — |
| talent-draw | **否**（适配器已是最优抽象） | — | 跳过。与 destiny-pattern 耦合对，适配器本身就是 AI 调用的抽象层 | — |
| world-init-pipeline | **否**（不使用 PromptTemplate，systemPrompt 是裸字符串） | — | 跳过 | — |
| campaigns/default | **否**（不调 AI） | — | 跳过 | — |
| summary-compressor | **否**（不使用 PromptTemplate，systemPrompt 动态构建） | — | 跳过 | — |

---

## 三、关键设计决策

### 3.1 薄包装不越界

wrapper **只做翻译**：`PromptTemplate → { systemPrompt, jsonMode, outputSchema }`。不假设 `userPrompt` 来自 `userPromptTemplate` 填充——因为：
- orchestrator 的 userPrompt 是 `segments.full`（内部组装的分段 JSON，不是模板填充）
- adaptation 的 userPrompt 是 `fillAdaptationUserPrompt()` 自定义填充
- destiny-pattern 的 userPrompt 是系统内部组装

如果 wrapper 尝试自己填充 userPromptTemplate，会破坏现有逻辑。

### 3.2 非标准字段透传

`UnifiedCallOptions extends AICallOptions`，使用 `...restOptions` 透传全部字段（包括 `userSegments`、`stablePrefixChars` 等非标准字段）。wrapper 不拦截任何字段。

destiny-pattern-system 的 `stream`、`stablePrefixChars`、`maxTokensOverride` 等非标准字段通过依赖注入闭包在 talent-draw 层解析为 `AICallOptions`，wrapper 不感知。

### 3.3 向后兼容

- 原有 `callAI` / `callAIStreamDegraded` / `callAIStream` 不删除、不改签名
- 不适用 PromptTemplate 的消费者（world-init、summary-compressor）继续用原 API
- `UnifiedCallOptions` 是 `AICallOptions` 的超集，所有现有参数向后兼容

### 3.4 world-init-pipeline 不改动

world-init-pipeline 的 `createWorldInitAIService(systemPrompt, ...)` 接受**裸字符串**而非 `PromptTemplate`。这是有意设计——工厂函数与 PromptTemplate 解耦，允许 pipeline 动态替换 systemPrompt（如 calibration 重试时可能调整）。改为接收 PromptTemplate 会破坏这个灵活性。保持现状。

### 3.5 outputSchema 手动 wiring 的清理策略

迁移后：
- adaptation-manager：移除 `outputSchema: prompt.outputSchema` 和 `jsonMode: prompt.outputFormat === 'json'`
- orchestrator V1：移除 `outputSchema: promptTemplate.outputSchema`

### 3.6 destiny-pattern-system 不适用 wrapper 的原因

destiny-pattern-system 的调用链是：

```
generateWithAI()
  → this.callAI!(systemPrompt, userPrompt, callOpts)    // callOpts 含非标准字段
    │
    ▼ 依赖注入
talent-draw adapter（setAIService 注册的闭包）
  → 解析 stream / stablePrefixChars / maxTokensOverride
  → 翻译为 AICallOptions
  → callAI() / callAIStream()
```

`callOpts` 中的 `stream`、`stablePrefixChars`、`maxTokensOverride` 是**适配层的内部协议**，talent-draw 适配器负责将其翻译为 `AICallOptions`。wrapper 的 `UnifiedCallOptions` 扩展自 `AICallOptions`，无法理解这些字段。

若在 `generateWithAI` 中直接调用 `callAIWithPromptTemplate`，将绕过适配器——model 选择、API key、provider、KV Cache 分段全部丢失，命格抽取功能静默退化。

**结论**：依赖注入模式已是该消费者最适合的抽象层，wrapper 在此处不增值。保留 `this.callAI!` + `outputSchema` 手动 wiring 不变。

---

## 四、改动文件清单

| # | 文件 | 改动 | 阶段 |
|---|------|------|------|
| 1 | **新建** `core/ai-service/ai-call-wrapper.ts` | wrapper 函数（约 40 行） | P1 |
| 2 | `core/ai-service/index.ts` | 导出 wrapper | P1 |
| 3 | `mod-engine/subsystems/adaptation-manager-system.ts` | `adaptOne()` 迁移 → wrapper，移除手动 outputSchema+jsonMode | P1 |
| 4 | `mod-engine/subsystems/orchestrator-system.ts` | `executeRound()` 迁移 → wrapper（streaming + fallbackText 模式） | P2 |
| 5 | `mod-engine/campaigns/default/index.ts` | `loadStages` 闭包内 3 处迁移 → wrapper（stream + non-stream），移除 streamOpts 中的 outputSchema | P2 |

---

## 五、实施顺序（分 2 阶段）

### P1 — adaptation-manager（试点，低风险）

| 步骤 | 内容 | 文件数 |
|------|------|--------|
| 1 | 创建 `ai-call-wrapper.ts` + 导出 | 2 |
| 2 | adaptation-manager 迁移 | 1 |
| 3 | C 闸验证（lint + tsc + gate-check:quick） | — |

P1 完成即可验证 wrapper 的可行性。如果 P1 失败，回滚代价极低（1 个文件 revert）。

### P2 — orchestrator V1（流式 + 降级，中风险）

| 步骤 | 内容 | 文件数 |
|------|------|--------|
| 4 | orchestrator `executeRound()` 迁移 | 1 |
| 5 | campaigns `loadStages` 闭包迁移（3 处调用点：S3 stream / non-S3 stream / non-stream） | 1 |
| 6 | C 闸验证 + 手动冒烟测试（推一回合确认叙事正常） | — |

P2 验证 wrapper 在流式 + 降级链路上的正确性。注意保留 `outputSchema: promptTemplate.outputSchema` 的手动 wiring 直到确认 wrapper 正确注入后再移除。

---

## 六、测试验证

| 阶段 | 场景 | 预期 |
|------|------|------|
| P1 | adaptation 适配完成 | 适配文本与迁移前一致 |
| P1 | outputSchema 自动附加 | adaptation prompt 的 Zod 校验照常执行 |
| P2 | orchestrator 推进一回合 | 叙事文本正常生成 |
| P2 | AI 流式降级触发 | 降级链路不变（fallbackText 透传） |
| P2 | KV Cache 命中 | userSegments 透传不变 |

---

## 七、预期收益

- 2 个 PromptTemplate 消费者的 `outputSchema` / `jsonMode` 手动布线代码归零
- 未来新增 PromptTemplate 消费者只需调用 `callAIWithPromptTemplate(promptTemplate, userPrompt, opts)`
- PromptTemplate 新增字段（如 future `temperatureHint`）自动传递到所有消费者
- 零运行时破坏：不适用 PromptTemplate 的消费者（world-init、summary-compressor）完全不走 wrapper，不受影响
