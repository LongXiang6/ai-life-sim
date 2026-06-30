# 蓝图计划书：outputSchema 剩余消费者接入

> 版本：v1.0 | 日期：2026-06-29 | 级别：L1（3 文件独立改动，无跨系统依赖）
> 前置依赖：output-schema-validation-enablement 蓝图（ai-client 校验管线已完成）

---

## 一、问题定义

### 1.1 现状

output-schema-validation-enablement 蓝图已在 `ai-client.ts` 中完成 `outputSchema` 校验管线建设：
- `AICallOptions.outputSchema?: ZodSchema` 字段已定义
- `callAI` / `callAIStreamDegraded` 已接入 `validateWithRetry`
- 4 个核心消费者已接入（campaigns + orchestrator V1 + destiny + adaptation）

**3 个消费者因技术障碍未接入：**

| # | 消费者 | 障碍 | 说明 |
|---|--------|------|------|
| 1 | `world-init-pipeline.ts` | 多 prompt 布线复杂度 | 7 个不同 prompt 各自需要 outputSchema，每条调用路径独立 |
| 2 | `talent-draw/page.tsx` | 动态 import + 接口不匹配 | `callAI` 是通过 `await import('@/core')` 动态引入的，AICallOptions 类型不可静态引用 |
| 3 | `summary-compressor-system.ts` | `outputSchema=z.string()` 与 JSON.parse 互斥 | 当前 validateWithRetry 假定输出为 JSON 对象，`z.string()` 校验字符串而非对象 |

### 1.2 修复目标

逐一消除技术障碍，将 `outputSchema` 接入全部 3 个消费者。

---

## 二、总体架构

### 2.1 各消费者接入方案

| # | 消费者 | 方案 |
|---|--------|------|
| 1 | world-init-pipeline.ts | 为 `callAIWithPrompt` 包装函数新增 `outputSchema` 参数，从各 stage 的 PromptTemplate 传入 |
| 2 | talent-draw/page.tsx | 将 `runAIFateDraw()` 提取为独立模块（导出类型安全函数），在模块内部传入 `outputSchema` |
| 3 | summary-compressor-system.ts | 扩展 validateWithRetry：检测 `z.string()` 类型 schema 时走简单字符串校验路径 |

### 2.2 改动清单

| # | 文件 | 改动 |
|---|------|------|
| 1 | `ai-client.ts` | 扩展 `validateWithRetry`：支持 `z.string()` 类型 schema（简单长度校验） |
| 2 | `world-init-pipeline.ts` | `callAIWithPrompt` 新增 `outputSchema` 参数，7 个 stage 传入对应 prompt 的 outputSchema |
| 3 | `talent-draw/page.tsx` | 代码内联传入 `outputSchema: destinyPatternPrompt.outputSchema`（已 import 但未使用） |

---

## 三、各改动详解

### 改动 1：`ai-client.ts` — 扩展 validateWithRetry 支持 string schema

**问题**：`validateWithRetry` 中 `JSON.parse(content)` 对 `z.string()` schema 无意义（摘要输出就是纯字符串）。

**修改**（在 `validateWithRetry` 函数开头）：

```typescript
async function validateWithRetry(...): Promise<string> {
  // 字符串 schema 走简单校验（不 JSON.parse）
  if (schema instanceof z.ZodString) {
    const validation = schema.safeParse(content)
    if (validation.success) return content
    logger.warnRaw('ai-client', 'Zod 字符串校验失败，返回原始内容', '')
    return content
  }
  
  try {
    // ... 现有 JSON 对象校验逻辑 ...
  }
}
```

**影响**：零影响现有逻辑。`z.string()` schema 永远不会走 `JSON.parse` 路径。

### 改动 2：`world-init-pipeline.ts` — 7 个 stage 传入 outputSchema

**问题**：`callAIWithPrompt()` 函数当前不接收 `outputSchema` 参数。

**修改 A**：函数签名扩展

```typescript
// 改前
async function callAIWithPrompt(prompt: PromptTemplate, input: WorldInitInput): Promise<string>

// 改后
async function callAIWithPrompt(
  prompt: PromptTemplate,
  input: WorldInitInput,
  options?: { outputSchema?: ZodSchema }
): Promise<string>
```

**修改 B**：在 `callAI()` 调用中传入

```typescript
const result = await callAI(prompt.systemPrompt, filledUserPrompt, {
  config: input.config,
  pool: 'worldInit',
  jsonMode: true,
  outputSchema: options?.outputSchema,  // ← 新增
})
```

**修改 C**：7 个 pipeline stage 各传入自身的 outputSchema

```typescript
// 示例（world-calibration stage）
const calibrationResult = await callAIWithPrompt(
  worldCalibrationPrompt,
  input,
  { outputSchema: worldCalibrationPrompt.outputSchema },
)
```

7 个 stage 对应的 prompt → outputSchema：
- `_worldCalibration[0]` → `worldCalibrationPrompt.outputSchema`
- `_worldDimensionCalibration[0]` → `worldDimensionCalibrationPrompt.outputSchema`
- `_worldTags[0]` → `worldTagsPrompt.outputSchema`
- `_worldTimeline[0]` → `worldTimelinePrompt.outputSchema`
- `_worldEntity[0]` → `worldEntityPrompt.outputSchema`
- `_worldConfig[0]` → `worldConfigPrompt.outputSchema`
- `_pastHistory[0]` → `pastHistoryPrompt.outputSchema`

### 改动 3：`talent-draw/page.tsx` — 内联传入 outputSchema

**问题**：`runAIFateDraw()` 通过动态 import `callAI`，无法静态引用 `AICallOptions` 类型。

**方案**：直接通过扩展运算符传入 `outputSchema`（JavaScript 运行时特性，不依赖类型）。

```typescript
// 改前（行 533 附近）
const result = await callAI(systemPrompt, userPrompt, {
  config: aiConfig,
  pool: 'fate',
  jsonMode: true,
  // ...
})

// 改后
const result = await callAI(systemPrompt, userPrompt, {
  config: aiConfig,
  pool: 'fate',
  jsonMode: true,
  outputSchema: destinyPatternPrompt.outputSchema,  // ← 新增（已 import）
  // ...
})
```

---

## 四、测试验证

| 场景 | 预期 |
|------|------|
| 世界初始化生成 | 7 个 stage 各自 outputSchema 校验，失败重试一次 |
| 命格抽取 | outputSchema 校验通过/失败重试 |
| 摘要压缩 | `z.string()` schema 走简单字符串校验 |
| 旧存档加载 | 不依赖 outputSchema，无影响 |

---

## 五、实施顺序

| 步骤 | 内容 | 文件数 | 依赖 |
|------|------|--------|------|
| 1 | 扩展 validateWithRetry 支持 string schema | 1 | 无 |
| 2 | world-init-pipeline 接入 | 1 | 1 |
| 3 | talent-draw 接入 | 1 | 1 |
| 4 | C 闸验证 | — | 1-3 |

---

## 六、预期收益

- 3 个剩余消费者接入后，全项目所有 AI 调用路径均覆盖 Zod 校验
- 世界初始化、命格抽取、摘要压缩的 AI 格式偏差可被第一时间拦截
- `summaryPrompt.outputSchema = z.string()` 从"接入不了"变为"接入且正确处理"
