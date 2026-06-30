# 蓝图计划书：启用 PromptTemplate.outputSchema 校验管线

> 版本：v2.1 | 日期：2026-06-29 | 级别：L3（跨 core/foundation + 涉及 31 prompt 文件）
> 前置依赖：adaptation-pipeline-enablement 蓝图（13 个 adaptation prompt 由该蓝图激活）
> 背景：`outputSchema` 在 31 个文件中赋值但从未被读取 —— 是设计好了但从未接线的结构化校验管线。全部修复，不延期。

---

## 一、问题定义

### 1.1 现状

- `PromptTemplate.outputSchema?: ZodSchema` 在 31 个 prompt 文件中赋值，**零读取**
- AI JSON Mode 开关走 `AICallOptions.jsonMode` 布尔值（与 outputSchema 无关）
- AI 响应的 Zod 校验走消费者直接 `import { SomeSchema }`，不经过 `template.outputSchema`
- 最关键的 [NarrativeResponseSchema](file:///D:/AI/ai-life-sim/src/mods/mod-engine/prompts/narrative-prompt.ts#L28-L42) 与 System Prompt JSON Schema 不同步（缺失 `creations`/`branch`/`branchTitle`/`branchOptions`）

### 1.2 根因

历史推测：此前有 AI 响应的格式错误，有人试图修复——同时改了原始解析代码 **和** 新增了 `outputSchema` 字段。但校验管线始终未接线，导致 Zod Schema 定义沦为死代码。

### 1.3 修复目标

**启用而非删除**。将 `PromptTemplate.outputSchema` 从"定义了但没人用"变为"AI 响应后自动校验的第一道防线"。死代码全部清理，不延期。

---

## 二、总体架构

### 2.1 两层校验模型

```
AI 响应（字符串）
    │
    ▼
L0: Zod 结构校验 ← 【新增】outputSchema.safeParse(JSON.parse(content))
    │
    ├── success → 原始 content 交给下游解析器（NarrativeParserSystem 等）
    │
    └── failure → 记录 ZodError → 触发降级兜底（fallback narrative / retry）
```

### 2.2 集成位置

**AI Client 层**（非 orchestrator 层），理由：
- 全项目所有 prompt 都通过 `callAIStreamDegraded` / `callAI`，一处理全受益
- 不需要每个 consumer 自己写校验
- 校验失败可以在 AI 层直接决定降级策略

### 2.3 新增参数

```typescript
// ai-client.ts - AICallOptions 新增
interface AICallOptions {
  // ... 现有字段 ...
  /** 可选：输出 Zod Schema，用于 AI 响应后的结构化校验。失败时自动触发降级。 */
  outputSchema?: ZodSchema
}
```

---

## 三、改动计划

### 大分类：31 个 prompt 按运行时状态分为两类

| 分类 | 数量 | 定义 | 处理策略 |
|------|------|------|---------|
| **A 类 — 活跃 prompt** | 23 | 有明确 AI 调用消费者，`outputSchema` 可以接入 | 阶段 1+2+3：同步 Schema → 接入校验管线 |
| **B 类 — 死 prompt** | 8 | 无任何消费者（纯规则 subsystem，不调 AI，且未被 adaptation 蓝图激活） | 阶段 4：立即清理死代码 |

**注意**：A 类的 23 个包含：
- 10 个原本活跃的 prompt（narrative、summary、destiny、world 系列）
- **13 个被 adaptation-pipeline-enablement 蓝图激活的 adaptation prompt**（mod-power-system × 10 + divine-creation + golden-finger + antagonist）

---

### 阶段 1：同步 A 类 prompt 的 Zod Schema

核对 Zod Schema 与对应 System Prompt JSON Schema，补齐缺失字段。

#### 1.1 核心 prompt（需详细核对）

| # | 文件 | Zod 缺失字段 | 改动 |
|---|------|-------------|------|
| 1 | [narrative-prompt.ts](file:///D:/AI/ai-life-sim/src/mods/mod-engine/prompts/narrative-prompt.ts#L28-L42) | `creations`、`branch`、`branchTitle`、`branchOptions` | 补全 4 字段 |
| 2 | [summary-prompt.ts](file:///D:/AI/ai-life-sim/src/mods/mod-engine/prompts/summary-prompt.ts#L149) | outputSchema=`z.string()` (无结构) | 无需改动 |
| 3 | [destiny-pattern-prompt.ts](file:///D:/AI/ai-life-sim/src/mods/mod-character/prompts/destiny-pattern-prompt.ts#L141) | 待核对 | 核对对齐 |
| 4 | [world-calibration-prompt.ts](file:///D:/AI/ai-life-sim/src/mods/mod-world/prompts/world-calibration-prompt.ts#L227) | 待核对 | 核对对齐 |
| 5 | [world-dimension-calibration-prompt.ts](file:///D:/AI/ai-life-sim/src/mods/mod-world/prompts/world-dimension-calibration-prompt.ts#L150) | 待核对 | 核对对齐 |
| 6 | [world-tags-prompt.ts](file:///D:/AI/ai-life-sim/src/mods/mod-world/prompts/world-tags-prompt.ts#L73) | 待核对 | 核对对齐 |
| 7 | [world-timeline-prompt.ts](file:///D:/AI/ai-life-sim/src/mods/mod-world/prompts/world-timeline-prompt.ts#L55) | 待核对 | 核对对齐 |
| 8 | [world-entity-prompt.ts](file:///D:/AI/ai-life-sim/src/mods/mod-world/prompts/world-entity-prompt.ts#L48) | 待核对 | 核对对齐 |
| 9 | [world-config-prompt.ts](file:///D:/AI/ai-life-sim/src/mods/mod-world/prompts/world-config-prompt.ts#L185) | 待核对 | 核对对齐 |
| 10 | [past-history-prompt.ts](file:///D:/AI/ai-life-sim/src/mods/mod-world/prompts/past-history-prompt.ts#L53) | 待核对 | 核对对齐 |

#### 1.2 adaptation prompt（被 adaptation 蓝图激活，单输出字段为主）

| # | 文件群 | 说明 |
|---|--------|------|
| 11~20 | `mod-power-system/prompts/adaptation-*.ts`（10 个） | outputSchema 大多为简单对象（1-2 字段），核对 Zod ↔ System Prompt JSON |
| 21 | `mod-base-universe/prompts/adaptation-divine-creation-prompt.ts` | 核对对齐 |
| 22 | `mod-golden-finger/prompts/adaptation-golden-finger-prompt.ts` | 核对对齐 |
| 23 | `mod-npc/prompts/adaptation-antagonist-prompt.ts` | 核对对齐（结构最复杂，需仔细核对） |

> 大多数 prompt 的 Zod ↔ System Prompt 差异较小（逐一核对即可）。差距最大的是 narrative-prompt.ts（4 字段缺失）。adaptation prompt 的 Zod 和 System Prompt 差异通常更小。

### 阶段 2：新增 `AICallOptions.outputSchema` + 校验逻辑

**文件**：[ai-client.ts](file:///D:/AI/ai-life-sim/src/core/ai-service/ai-client.ts)

```typescript
// AICallOptions 新增字段
outputSchema?: ZodSchema

// callAI / callAIStreamDegraded 新增逻辑（在收到完整 AI 响应后、return 前）：
if (options?.outputSchema) {
  try {
    const parsed = JSON.parse(result.content)
    const validation = options.outputSchema.safeParse(parsed)
    if (!validation.success) {
      console.warn('[AI] Zod validation failed:', validation.error.issues)
      // 触发降级（回退到 fallback 或重试）
      result = await this.callFallbackModel(originalContext, options)
    }
  } catch {
    // JSON.parse 失败 → 交给现有 AI 降级管线（ai-client 内已有）
  }
}
```

**同时修改**：
- [ai-stream-manager.ts](file:///D:/AI/ai-life-sim/src/core/ai-service/ai-stream-manager.ts) — `AICallOptions` 传递
- [ai-call-pool.ts](file:///D:/AI/ai-life-sim/src/core/ai-service/ai-call-pool.ts) — `AICallOptions` 传递
- [index.ts](file:///D:/AI/ai-life-sim/src/core/ai-service/index.ts) — 导出新类型

### 阶段 3：A 类消费者接入

修改所有通过 `callAI` / `callAIStreamDegraded` 调用 AI 的地方，传入 `outputSchema`：

| 消费方 | 文件 | 传入的 schema |
|--------|------|--------------|
| 叙事生成（stream） | [campaigns/default/index.ts](file:///D:/AI/ai-life-sim/src/mods/mod-engine/campaigns/default/index.ts#L232-L244) | `narrativePrompt.outputSchema` |
| 叙事生成（V1） | [orchestrator-system.ts](file:///D:/AI/ai-life-sim/src/mods/mod-engine/subsystems/orchestrator-system.ts#L821) | `narrativePrompt.outputSchema` |
| 世界初始化 | [world-init-pipeline.ts](file:///D:/AI/ai-life-sim/src/mods/mod-world/utils/world-init-pipeline.ts) | 各 prompt 的 `outputSchema` |
| 命运纹样 | [destiny-pattern-system.ts](file:///D:/AI/ai-life-sim/src/mods/mod-character/subsystems/destiny-pattern-system.ts#L349-L365) | `destinyPatternPrompt.outputSchema` |
| 命格抽取页 | [talent-draw/page.tsx](file:///D:/AI/ai-life-sim/src/mods/mod-pages/pages/talent-draw/page.tsx#L533) | `destinyPatternPrompt.outputSchema` |
| 压缩总结 | [summary-compressor-system.ts](file:///D:/AI/ai-life-sim/src/mods/mod-engine/subsystems/summary-compressor-system.ts) | `summaryPrompt.outputSchema` |
| **adaptation 管线** | **[adaptation-manager-system.ts](file:///D:/AI/ai-life-sim/src/mods/mod-engine/subsystems/adaptation-manager-system.ts)** | **13 个 adaptation prompt 的 outputSchema** |

> adaptation-manager-system.ts 在 adaptPending() 中调用 AI 时传入对应 prompt 的 outputSchema。此文件由 adaptation-pipeline-enablement 蓝图创建，outputSchema 蓝图在阶段 3 仅负责接入校验逻辑。

### 阶段 4：清理 B 类死 prompt（8 个，现修不延期）

adaptation-pipeline-enablement 蓝图已激活 13 个 adaptation prompt。剩余 8 个仍为死代码：

#### 4.1 systemPrompt 为空/预留 stub（6 个）→ 删除文件

| # | 文件 | 删除理由 |
|---|------|---------|
| 1 | `mod-base-universe/prompts/adaptation-celestial-prompt.ts` | systemPrompt = `''`，注释"预留" |
| 2 | `mod-base-universe/prompts/adaptation-era-prompt.ts` | 同上 |
| 3 | `mod-base-universe/prompts/adaptation-fate-prophecy-prompt.ts` | 同上 |
| 4 | `mod-base-universe/prompts/adaptation-world-map-prompt.ts` | 同上 |
| 5 | `mod-tech-level/prompts/adaptation-industry-prompt.ts` | 同上 |
| 6 | `mod-tech-level/prompts/adaptation-culture-tech-prompt.ts` | 同上 |

**联动操作**：
- 从各 mod 的 `manifest.ts` 中移除对应的 `prompts` 字符串声明
- 从 `index.ts` barrel 中移除对应 export（如果有）
- 从 `prompt-context-contract.generated.ts` 中移除对应记录（`npm run generate:wiring` 自动处理）

#### 4.2 有内容但未被任何蓝图激活（2 个）→ 移除 outputSchema + 添加状态注释

| # | 文件 | Mod | 处理 |
|---|------|-----|------|
| 1 | `mod-character/prompts/life-stage-adaptation.ts` | mod-character | 移除 `outputSchema` + `@status: UNWIRED — 子系统纯规则不调 AI，且未被 adaptation 蓝图激活` |
| 2 | `mod-character/prompts/lifespan-adaptation.ts` | mod-character | 同上 |

---

## 四、关键设计决策

### 4.1 校验失败 → 降级，不阻断

如果 `safeParse` 失败，AI 层自动降级到 fallback（而不是抛异常崩掉）。原因是：
- AI 响应格式偏差常见（JSON 中多了一个空格、字段顺序不对等）
- Zod 严格校验 + 阻断 = 对玩家来说"这回合坏了"
- Zod 严格校验 + 降级 = 对玩家来说"这回合兜底叙事"，但日志里会记录失败原因，方便排查

### 4.2 与现有降级管线的关系

```
新增 Zod 校验（L0）→ 失败 → 降级直接返回 fallback
新增 Zod 校验（L0）→ 成功 → NarrativeParserSystem 4层降级管线（L0~L3）照常运行
```

Zod 校验是**新加的一层**，不是替代现有的解析管线。两层各管各的：
- Zod 校验管"AI 返回的 JSON 结构对不对"  
- 解析管线管"从 JSON 中提取语义字段（应对 AI 的格式偏差）"

### 4.3 OMIT_EMPTY_PROMPT_FIELDS 兼容

Zod Schema 中所有非必填字段使用 `.optional()`（已是最佳实践），空值字段会被 `buildNarrativeUserJson` 的 `OMIT_EMPTY_PROMPT_FIELDS` 自动省略，不影响 JSON 构建。

### 4.4 与 adaptation-pipeline-enablement 蓝图的关系

| 维度 | 说明 |
|------|------|
| 执行顺序 | adaptation 蓝图先执行（铺管道），outputSchema 蓝图后执行（接校验） |
| A 类 prompt 扩容 | 13 个原本 B2 的 adaptation prompt 因被 adaptation 蓝图激活，从 B2 移至 A 类 |
| outputSchema 接入 | adaptation-manager-system.ts 调用 AI 时传入对应 prompt 的 outputSchema |
| 依赖 | outputSchema 蓝图的阶段 3 依赖 adaptation 蓝图的 adaptation-manager-system.ts 已创建 |

---

## 五、改动文件清单

| # | 文件 | 改动 | 阶段 |
|---|------|------|------|
| 1 | `mod-engine/prompts/narrative-prompt.ts` | Zod Schema 补全 4 字段 | 1 |
| 2 | `mod-character/prompts/destiny-pattern-prompt.ts` | 核对 Zod ↔ System Prompt | 1 |
| 3~8 | `mod-world/prompts/world-*-prompt.ts`（6 个） | 核对 Zod ↔ System Prompt | 1 |
| 9 | `mod-engine/prompts/summary-prompt.ts` | 核对（`z.string()` 无结构差异） | 1 |
| 10~19 | `mod-power-system/prompts/adaptation-*.ts`（10 个） | 核对 Zod ↔ System Prompt | 1 |
| 20 | `mod-base-universe/prompts/adaptation-divine-creation-prompt.ts` | 核对 Zod ↔ System Prompt | 1 |
| 21 | `mod-golden-finger/prompts/adaptation-golden-finger-prompt.ts` | 核对 Zod ↔ System Prompt | 1 |
| 22 | `mod-npc/prompts/adaptation-antagonist-prompt.ts` | 核对 Zod ↔ System Prompt | 1 |
| 23 | `core/ai-service/ai-client.ts` | `AICallOptions.outputSchema` + 校验逻辑 | 2 |
| 24 | `core/ai-service/ai-stream-manager.ts` | 传递 `outputSchema` | 2 |
| 25 | `core/ai-service/ai-call-pool.ts` | 传递 `outputSchema` | 2 |
| 26 | `core/ai-service/index.ts` | 导出新类型 | 2 |
| 27 | `mod-engine/campaigns/default/index.ts` | 叙事接入 `narrativePrompt.outputSchema` | 3 |
| 28 | `mod-engine/subsystems/orchestrator-system.ts` | V1 叙事接入 | 3 |
| 29 | `mod-world/utils/world-init-pipeline.ts` | 世界初始化接入 | 3 |
| 30 | `mod-character/subsystems/destiny-pattern-system.ts` | 命运纹样接入 | 3 |
| 31 | `mod-pages/pages/talent-draw/page.tsx` | 命格页接入 | 3 |
| 32 | `mod-engine/subsystems/summary-compressor-system.ts` | 压缩接入 | 3 |
| 33 | `mod-engine/subsystems/adaptation-manager-system.ts` | adaptation 管线接入 outputSchema | 3 |
| 34~39 | `mod-base-universe/prompts/adaptation-{4个}.ts` + `mod-tech-level/prompts/adaptation-{2个}.ts` | **删除文件**（systemPrompt 空 stub） | 4 |
| 40 | `mod-base-universe/manifest.ts` | 移除 prompt 声明 | 4 |
| 41 | `mod-tech-level/manifest.ts` | 移除 prompt 声明 | 4 |
| 42 | `mod-character/prompts/life-stage-adaptation.ts` | 移除 `outputSchema` + `@status: UNWIRED` | 4 |
| 43 | `mod-character/prompts/lifespan-adaptation.ts` | 移除 `outputSchema` + `@status: UNWIRED` | 4 |
| 44 | `prompt-context-contract.generated.ts` | `npm run generate:wiring` 自动更新 | 4 |

---

## 六、测试验证

| 场景 | 预期 |
|------|------|
| AI 返回完全合规的 JSON | Zod 通过，正常流程 |
| AI 返回缺少 `narrative` 字段的 JSON | Zod 失败，自动降级 |
| AI 返回 `changes` 类型错误 | Zod 失败，自动降级 |
| AI 返回了额外字段 | Zod 通过（`.optional()` 容错），解析管线自行处理 |
| AI 返回格式残缺的半个 JSON | `JSON.parse` 失败，现有降级管线接管 |
| 旧存档加载 | 不依赖 outputSchema，无影响 |
| B 类 prompt 文件被删除 | 无运行时引用，编译通过 |
| adaptation 管线调用 AI | outputSchema 校验 adaptation prompt 的输出 |

---

## 七、预期收益

- **短期**：消灭 8 个死代码（6 文件删除 + 2 outputSchema 清理），23 个活跃 prompt 接入实时校验
- **长期**：任何 AI 输出格式偏差在 AI 层被拦截，不会渗透到下游。新增 prompt 时 `outputSchema` 从"可选注释"变为"运行时契约"
- **维护**：`outputSchema` 不再是死代码，修改 System Prompt JSON Schema 必须同步 Zod Schema

---

## 八、实施顺序

| 步骤 | 内容 | 文件数 | 依赖 |
|------|------|--------|------|
| — | **先执行 adaptation-pipeline-enablement 蓝图** | — | 无 |
| 1 | 同步 A 类 prompt Zod Schema（23 个） | 23 | adaptation 蓝图 |
| 2 | 新增 `AICallOptions.outputSchema` + 校验逻辑 | 4 | 1 |
| 3 | A 类消费者接入（含 adaptation 管线） | 7 | 2 |
| 4 | B 类死代码清理（6 删除 + 2 outputSchema 移除） | 11 | 无（并行） |
| 5 | C 闸验证（lint + tsc + gate-check + `generate:wiring`） | — | 1~4 |

---

## 附录：31 个 prompt 运行时状态全表

### A 类 — 活跃（23 个）

#### A1: 核心 prompt（10 个）

| # | 文件 | 消费方 |
|---|------|--------|
| A1.1 | `narrative-prompt.ts` | orchestrator → campaigns → callAIStreamDegraded |
| A1.2 | `summary-prompt.ts` | summary-compressor-system → callAI |
| A1.3 | `destiny-pattern-prompt.ts` | destiny-pattern-system / talent-draw |
| A1.4 | `world-calibration-prompt.ts` | world-init-pipeline → callAI |
| A1.5 | `world-dimension-calibration-prompt.ts` | world-init-pipeline → callAI |
| A1.6 | `world-tags-prompt.ts` | world-init-pipeline → callAI |
| A1.7 | `world-timeline-prompt.ts` | world-init-pipeline → callAI |
| A1.8 | `world-entity-prompt.ts` | world-init-pipeline → callAI |
| A1.9 | `world-config-prompt.ts` | world-init-pipeline → callAI |
| A1.10 | `past-history-prompt.ts` | world-init-pipeline → callAI |

#### A2: adaptation prompt（被 adaptation 蓝图激活，13 个）

| # | 文件 | 消费方 |
|---|------|--------|
| A2.1~10 | `mod-power-system/prompts/adaptation-*.ts`（10 个） | adaptation-manager-system |
| A2.11 | `mod-base-universe/prompts/adaptation-divine-creation-prompt.ts` | adaptation-manager-system |
| A2.12 | `mod-golden-finger/prompts/adaptation-golden-finger-prompt.ts` | adaptation-manager-system |
| A2.13 | `mod-npc/prompts/adaptation-antagonist-prompt.ts` | adaptation-manager-system |

### B 类 — 死代码（8 个）

#### B1: systemPrompt 空 stub（6 个）→ 删除文件

| # | 文件 |
|---|------|
| B1.1 | `mod-base-universe/prompts/adaptation-celestial-prompt.ts` |
| B1.2 | `mod-base-universe/prompts/adaptation-era-prompt.ts` |
| B1.3 | `mod-base-universe/prompts/adaptation-fate-prophecy-prompt.ts` |
| B1.4 | `mod-base-universe/prompts/adaptation-world-map-prompt.ts` |
| B1.5 | `mod-tech-level/prompts/adaptation-industry-prompt.ts` |
| B1.6 | `mod-tech-level/prompts/adaptation-culture-tech-prompt.ts` |

#### B2: 有内容但未被任何蓝图激活（2 个）→ 移除 outputSchema

| # | 文件 | Mod |
|---|------|-----|
| B2.1 | `mod-character/prompts/life-stage-adaptation.ts` | mod-character |
| B2.2 | `mod-character/prompts/lifespan-adaptation.ts` | mod-character |
