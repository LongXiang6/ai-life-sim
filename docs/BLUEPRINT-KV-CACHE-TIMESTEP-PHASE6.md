# 蓝图 v7（Phase 6）：KV 缓存 / 叙事压缩 / 时间步进 —— 娱乐优先的体验修复

> 状态：**Phase 6 已执行（6A/6B/6D 核心）** | 日期：2026-06-24 | 版本：v1.2  
> 前置依赖：[BLUEPRINT-AI-METADATA-PHASE5.md](./BLUEPRINT-AI-METADATA-PHASE5.md) v6.3（Phase 5 已完成）  
> 外部参考：[DeepSeek 上下文硬盘缓存](https://api-docs.deepseek.com/zh-cn/guides/kv_cache)

---

## 0. 总原则（不可违反）

| 优先级 | 原则 |
|--------|------|
| **P0** | **娱乐性 / 游戏性** — 叙事连贯、记忆不丢、世界观适配、子系统与叙事一致 |
| **P1** | **体验修复** — 修 bug、接线断链、长局不崩 |
| **P2** | **成本 / 性能优化** — KV 命中率、token 费用；**仅在 P0/P1 验证通过后**推进 |

任何 P2 改动若导致 A/B 叙事质量下降 → **回滚，不做**。

---

## 1. 调研结论摘要

### 1.1 是否需要迭代？

**需要。** 但不是「重写架构」，而是 **修复断链 + 对齐 DeepSeek 缓存规则 + 统一时间步进语义**。

| 子系统 | 设计成熟度 | 运行时状态 | 结论 |
|--------|-----------|-----------|------|
| **KV 分段 Prompt** | `narrative-prompt.ts` 文档完善（稳定/缓变/速变三段） | `buildSegmentedPrompt` 与模板 **脱节**；`userSegments` 绕过完整 JSON 模板 | **P0 修复** |
| **叙事压缩 L1–L6** | `summary-compressor-system.ts` 完整实现 | `generateCompressedSummaries()` **零调用**；`checkNeed()` 恒 `null` | **P0 修复** |
| **记忆生命周期** | `memory-lifecycle-system.ts` 富注入策略完整 | `assemblePromptContext` 已组装，但 **AI 实际收不到**（同上 KV 断链） | **P0 修复** |
| **缓存统计** | `ai-client` 读 `prompt_cache_hit_tokens` | 已落 localStorage，无 dev 面板 | P2 可观测性 |
| **时间步进** | `TimeSystem` 365 天历法 + 9 档 `AVAILABLE_TIME_STEPS` | UI **未接线**；子系统 **按 `round.year` 幂等**；`advanceAllSubsystems` 几乎空转 | **P1 统一** |

### 1.2 DeepSeek KV 缓存 vs 现状

DeepSeek 规则要点（[官方文档](https://api-docs.deepseek.com/zh-cn/guides/kv_cache)）：

1. 缓存按 **完整前缀单元** 匹配；前缀越长、越稳定，命中越多。
2. 多轮对话中，**相同前缀**（system + 早期 user/assistant）可命中。
3. 长文本场景中，**公共前缀**会被自动检测落盘（例：相同 system + 相同长文档，不同问题）。
4. 输出仍受 temperature 影响；缓存 **不影响随机性**。
5. `usage.prompt_cache_hit_tokens` / `prompt_cache_miss_tokens` 可观测。

**现状问题：**

| 设计意图 | 实际行为 | 影响 |
|---------|---------|------|
| `narrative-prompt` 按字段顺序：规则→设定→角色→记忆→状态→历史 | `userSegments=[world+character, subsystems+history]`，**丢弃** calibration / memorySummary / eventInjection / foreshadowing 等 15+ 字段 | **叙事质量、Phase 5 校准注入、长局记忆全部失效** |
| 双 user 消息分段 | 每轮 **无 assistant 历史** 的单轮请求；双 user 前缀结构与下轮不对齐 | 缓存收益 **低于预期**；且与文档「多轮对话」模式不一致 |
| `segments.full` 用于日志 | API 实际发 `userSegments`，`full` 仅写 debug log | 调试日志 **误导** |

**正确方向（娱乐优先）：**

- **单条 user 消息**，内部 JSON 字段按稳定性排序（与 `narrative-prompt.ts` 注释一致）。
- 稳定段在前、速变段在后 → 满足 DeepSeek「前缀匹配」。
- `userSegments` 仅保留给 **明确的多轮对话** 场景（如 immersion two-pass），叙事主路径改为 **单 user + 字段序**。

---

## 2. 问题清单（按优先级）

### 2.1 P0 — 娱乐性断链（必须修）

#### KV-1：分段 Prompt 绕过叙事模板

**位置：** `src/core/ai-service/prompt-builder.ts` · `campaigns/default/index.ts` · `orchestrator-system.ts`

**现象：**

```ts
// 实际 API 消息（userSegments 存在时）
system: SYSTEM_PROMPT
user[0]: JSON.stringify(worldSetting) + JSON.stringify(character)
user[1]: subsystemSummaries + narrativeHistory.slice(-8) + userInstruction
// narrative-prompt 的 {{calibrationSummary}}、{{memorySummary}} 等 → 未发送
```

**修复目标：** AI 每轮收到与 `assemblePromptContext` 一致的 **完整** `narrative-prompt` JSON；稳定字段仍排在 JSON 对象 **前半** 以兼顾 KV。

**验收：** 集成测试断言 API messages 的 user content 包含 `worldCalibrationSummary`、`memorySummary`、`eventInjection` 等关键字段。

---

#### CMP-1：L1–L6 压缩管线未运行

**位置：** `orchestrator-system.ts` → `checkAndCompress()`

**现象：**

| 步骤 | 代码 | 结果 |
|------|------|------|
| 触发决策 | `memoryLifecycle.decideCompression()` | 可能 `shouldCompress=true` |
| 执行压缩 | `summaryCompressor.checkNeed()` | **恒 `null`**（兼容桩） |
| AI 压缩 | `generateCompressedSummaries()` | **全项目零引用** |

长局（>15 轮）后：`memorySummary` 无 L1+ 摘要可注入；`narrativeHistory` 仅靠 slice(-8) 原始文本 → **远期记忆丢失**。

**修复目标：**

1. `checkAndCompress` 改为 `await generateCompressedSummaries(...)`（或 fire-and-forget + 下轮注入）。
2. 压缩失败 → **保留原文降级**（现有 catch 逻辑），不截断娱乐内容。
3. 压缩完成后 `memoryLifecycle.addToIndex` + `clearTaggedEvents`（现有逻辑保留）。

**验收：** 跑 20+ 轮后 `compressedSummaries.summaries` 含 L1；Prompt 中 `memorySummary` 含「近期摘要」层。

---

#### CMP-2：`memoryLifecycle` 与 `checkAndCompress` 路径不一致

**现象：** `decideCompression` 走闭环/容量触发，但执行层接旧 API `checkNeed`/`compressLocal`。

**修复：** 统一入口为 `generateCompressedSummaries`；`decideCompression` 仅控制 **是否** 调用及 token 预算系数。

---

### 2.2 P1 — 时间步进核心（体验 + 世界观适配）

#### TS-1：UI 时间步进未接线

**位置：** `mod-pages/pages/game-story/page.tsx`

```tsx
activeTimeStep="year"
onTimeStepChange={() => {}}
```

**现象：** 底部栏 6 档步进 **纯展示**；引擎始终 `DEFAULT_ENGINE_CONFIG.timeStep`（month×1）。

**修复：**

1. 使用 `foundation/constants/time-steps.ts` 的 `AVAILABLE_TIME_STEPS`（与引擎一致，含 3年/5年/…）。
2. `onTimeStepChange` → `useEngineStore.setTimeStep` + `timeSystem.setTimeStep`。
3. 移除 `GameBottomBar` 内硬编码 `3years` 字符串（与 `TimeStep` 类型不符）。

---

#### TS-2：子系统推进与日历步进脱节

**现象：** 40+ 子系统用 `context.round.year === _lastProcessedRound`  guard → **仅日历年变化时推进一次**。

| 玩家选择 | TimeSystem | 子系统 |
|---------|-----------|--------|
| 月步进 ×1 | month+1，year 可能不变 | **不推进** |
| 年步进 ×3 | year+3 | **仅推进 1 次**（非 3 次） |

**例外：** `monster-system` 用 `year - _lastProcessedRound` 正确处理跨年跳。

**修复策略（分两步，娱乐优先）：**

**6B-1（最小，推荐先做）：** 文档 + UI 锁定 **「年步进」为正式模式**；月/日/季 标记为「实验」或隐藏，避免玩家误以为有效。

**6B-2（完整）：** 引入 `TimeStepResolver`：

```ts
interface ResolvedTick {
  calendarAdvance: TimeStep      // 给 TimeSystem
  simulationTicks: number        // 给子系统 loop
  ageYearsDelta: number          // 给 character-base / lifespan
}
```

- `year×N` → `simulationTicks = N`
- `month×N` / `season×N` → 按 365 天历法换算为 fractional year 或 sub-year tick
- 子系统 guard 改为 `_lastProcessedRound !== context.totalRounds`（或传入 `simulationTicks`）

**世界观适配：** 修仙/科幻长跨度（10年/100年）需 **中间年摘要**（可选 6C）：大步进时插入「期间概要」叙事 token，避免 AI 只写最后一年的断层感。

---

#### TS-3：`orchestrator` 与 `timeSystem` 不同步

**现象：** `orchestrator.state.timeStep` 与 `timeSystem` 私有 `timeStep` 独立；`setTimeStep` 仅存在于 `TimeSystem`，**从未被调用**。

**修复：** 单一来源 `engineStore.timeStep`；`advanceTime()` 前 `timeSystem.setTimeStep(engineStore.timeStep)`。

---

#### TS-4：`advanceAllSubsystems()` 空转

**现象：** 仅 `celestial-system` 等极少数实现 `advance()`；其余在 `collectState` 内推进。

**修复（低侵入）：** Campaign 阶段 `subsystem-advance` 保留但文档化；或改为显式 `preCollectAdvance` hook。不在 Phase 6 大规模迁移 40+ 子系统，避免回归。

---

### 2.3 P2 — 优化（P0/P1 通过后）

| ID | 项 | 说明 |
|----|-----|------|
| KV-2 | 缓存命中率 Dev 面板 | 读 `getCacheStats()`，Settings/Debug 页展示 hitRate |
| KV-3 | Summary 池独立 session | 压缩调用已用 `pool:'summary'`，保持；叙事用 `narr` 前缀 |
| KV-4 | Immersion two-pass 缓存策略 | 启用时 Pass1 稳定前缀与 Pass2 共享 system；默认仍 **关闭** |
| CMP-3 | 压缩 importance 加权调参 | 已有 `rateImportance`；playtest 后微调 boostFactor |
| CMP-4 | `narrativeHistory` 双轨 | `assemblePromptContext` slice(-8) vs memory L0 slice(-5) 去重 |
| TS-5 | 大步进「期间概要」 | year×10+ 时本地规则生成 bridge summary 注入 Prompt |

---

## 3. 分阶段执行计划

### Phase 6A — P0 断链修复（必做，约 2–3 天）

| 步骤 | 文件 | 改动 |
|------|------|------|
| 6A-1 | `prompt-builder.ts` | 重写 `buildSegmentedPrompt`：基于 `buildPrompt(template, context)` 生成 **完整 JSON**；按 `narrative-prompt` 变量序拆 **stable / slow / fast** 三段拼接为 **单 user 字符串**（或 stable+rest 两段，rest 含完整速变字段） |
| 6A-2 | `campaigns/default/index.ts` · `orchestrator-system.ts` | 默认 **不传 `userSegments`**，或传 `[fullStablePrefix, fullVariableSuffix]` 且 suffix **含全部模板字段** |
| 6A-3 | `orchestrator-system.ts` | `checkAndCompress` → 调用 `generateCompressedSummaries`（async，不阻塞 UI 时可 fire-and-forget） |
| 6A-4 | `scripts/kv-prompt-audit.ts`（新） | 断言 round N 的 user prompt 含 calibration / memory / event 字段 |
| 6A-5 | 测试 | 扩展 `npm run test:calibration` 或新 `test:prompt-wiring` |

**6A 完成标准：**

- [ ] 手动 3 轮：AI debug log 中 user 含 `worldCalibrationSummary`
- [ ] 手动 20 轮：`compressedSummaries` 出现 L1
- [ ] `tsc --noEmit` + 新 audit 脚本通过

---

### Phase 6B — 时间步进 P1（约 3–5 天）

| 步骤 | 内容 |
|------|------|
| 6B-1 | UI 接线 + `timeSystem.setTimeStep` 同步 |
| 6B-2 | `TimeStepResolver` + 子系统 `simulationTicks`（先改 3 个代表：population / work / cultivation） |
| 6B-3 | 其余子系统：批量 `_lastProcessedRound` → `totalRounds` 或读 `resolvedTick` |
| 6B-4 | Playtest：年×1 / 年×3 / 年×10 叙事连贯性人工验收 |

**6B 完成标准：**

- [ ] 切换「3年」后，`round.year` 一次 +3，人口/经济推进 **3 tick**
- [ ] 月步进要么隐藏要么子系统有可见变化

---

### Phase 6C — P2 可观测性（按需）

- Dev 缓存面板（并入 6D-6）
- 大步进 bridge summary（TS-5）
- Immersion two-pass 与 KV 联调（KV-4）

### Phase 6D — 命中率 / 注意力（详见 §9、§10）

在 **6A playtest 通过后** 按 feature flag 逐步启用 S2/S3 与 prompt 精简项。

---

## 4. 与 Phase 5 的关系

| Phase 5 产出 | Phase 6 影响 |
|-------------|-------------|
| `calibrationSummary` 注入 narrative-prompt | **6A 修复后才真正到达 AI** |
| `memoryLifecycle.buildRichPrompt` | **6A+6A-3 后才有效** |
| IT-1~5 子系统 Round2 | 不受 Phase 6 影响；时间步进修复后 Round2 在 multi-tick 下更准确 |

---

## 5. 风险与回滚

| 风险 | 缓解 |
|------|------|
| 6A 改 Prompt 结构 → AI JSON 解析失败 | 保留 `segments.full` 快照对比；降级链不变 |
| 6A-3 压缩异步 → 当轮 memory 滞后 | 压缩落后 1 轮可接受；L0 原文仍注入 |
| 6B multi-tick → 数值爆炸 | clamp 保留；instrument 模式对比前后 snapshot |
| KV 优化后 hitRate 仍低 | 不阻塞交付；P2 观测后再调字段序 |

**回滚开关：**

```ts
// constants.ts
export const USE_LEGACY_SEGMENTED_PROMPT = false  // true = 回退旧行为（仅 debug）
export const USE_AI_SUMMARY_COMPRESSION = true    // false = 仅 L0 不压缩
```

---

## 6. 验收命令（PDCA C 闸）

```bash
cd ai-life-sim
npm run test:calibration    # 现有回归
npx tsx scripts/kv-prompt-audit.ts   # 6A 新增
npx tsc --noEmit
```

人工 playtest 清单（娱乐性 P0）：

1. 新局 5 轮：叙事是否引用世界观规则 / 校准摘要？
2. 同一局连续点 10 轮：是否记得 3 轮前的重要事件（婚约/突破/冲突）？
3. 切换 3 年步进：年龄与子系统数值是否近似 3 倍于 1 年？

---

## 7. 明确排除（本 Phase 不做）

| 项 | 原因 |
|----|------|
| 重写 `memory-lifecycle` 架构 | 设计已足够；问题是接线 |
| 多 provider KV 策略 | 当前 DeepSeek 为主 |
| 实时压缩 UI 动画 | 非娱乐核心 |
| 子系统全面 `advance()` 迁移 | 范围过大；TS-4 仅文档化 |

---

## 8. 执行顺序建议

```
6A（KV+CMP 断链）→ playtest 3 局
    ↓ 叙事/记忆 OK
6B（时间步进）→ playtest
    ↓
6D（命中率/注意力，A/B 门控）→ 6C 其余项
```

**建议用户确认后从 6A 开始执行** — 6A 纯修复、不改游戏玩法规则，收益最大、风险最低。

---

## 9. 消息架构深度评估：能否「加更多字段」提高命中率？

> 回应 playtest 观察：当前请求体表现为 **System + User（×1 或 ×2）**。本节澄清 API 能力边界，并给出 **在不牺牲娱乐性** 前提下的命中率 / 注意力优化路径。

### 9.1 API 能力边界（DeepSeek Chat Completions）

| 概念 | 事实 |
|------|------|
| 独立「字段」 | **不存在**。只有 `messages: [{ role, content }]` 数组 |
| 可用 `role` | `system` · `user` · `assistant` · `tool`（叙事主路径用前三个） |
| 缓存匹配单位 | 从 **第 1 个 token 起的最长相同前缀**（非「字段名」级别） |
| 多 user 消息 | 合法；等价于把一条 user 内容切成多段，**前缀仍从 system 起连续计算** |

**结论：增加 message **条数** 本身不会 magic 提高命中率。** 命中取决于：

1. **越早出现的内容越稳定**（字节级相同）
2. **同一 `user_id` + 同一 pool**（项目已用 `narr-{sessionId}`）
3. **跨轮请求前缀结构一致**（字段顺序、JSON 键序、无随机 whitespace）

### 9.2 三种消息策略对比（6A 修复完整模板之后）

```
                    命中率          叙事质量        实现复杂度
S1 单 user JSON     ★★★☆☆          ★★★★★          ★☆☆☆☆
S2 双 user 分界       ★★★★☆          ★★★★☆          ★★☆☆☆
S3 多轮 assistant     ★★★★★          ★★★★★          ★★★★☆
```

#### S1 — 单条 user（推荐默认，6A 目标）

```json
messages: [
  { "role": "system", "content": "<固定 SYSTEM_PROMPT>" },
  { "role": "user",   "content": "{ 稳定键…, 缓变键…, 速变键… }" }
]
```

- **缓存行为：** 与 DeepSeek [例二长文本](https://api-docs.deepseek.com/zh-cn/guides/kv_cache) 一致 — 多轮后公共前缀（system + user 内稳定段）落盘；速变段从 **第一个不同字节** 起计 miss。
- **优点：** 与 `narrative-prompt` 模板 1:1；调试简单；注意力顺序完全可控。
- **缺点：** user 内缓变段（如 `character` 年龄）变化会 **截断** 其后 stable 段的 prefix 延伸（故须严格按稳定性排序）。

**稳定 → 缓变 → 速变 键序（与 entertainment 对齐）：**

| 层级 | JSON 键 | 变化频率 |
|------|---------|---------|
| L0 稳定 | `worldRules`, `modWorldRules`, `worldTags`, `worldCalibrationSummary`, `worldSetting`, `playerCustomization`, `narrativeStyle`, `availableSubsystemFields`, `wordCountConstraint` | 开局后不变 / 极少变 |
| L1 缓变 | `character`, `coreMemory`, `memorySummary`, `plotStructure`, `pendingForeshadowing` | 年龄/属性/压缩摘要慢变 |
| L2 速变 | `currentState`, `recentChanges`, `eventInjection`, `narrativeHistory`, `instruction` | 每轮必变 |

#### S2 — 双 user 分界（可选增强，6D-1）

```json
messages: [
  { "role": "system", "content": "..." },
  { "role": "user",   "content": "{ L0+L1 完整 JSON }" },
  { "role": "user",   "content": "{ L2 速变 JSON }" }
]
```

- **何时更好：** L0+L1 合计 **>~2k tokens** 且每轮 **字节级相同** 时，第二段 user 整段计 miss，但第一段 user 可 **整段命中**（边界对齐 cache 间隔落盘，见官方「固定 token 间隔」说明）。
- **何时更差：** L1 缓变字段（年龄、memorySummary）每轮都变 → 第一段 user 仍每轮 miss，**不如 S1**。
- **娱乐风险：** 低 — 内容与 S1 相同，仅物理分包；须保证两段合并语义 = 完整模板。
- **不推荐：** 3 段及以上 user（收益递减；结构难维护）。

#### S3 — 多轮 assistant 历史（高命中，6D-2 可选）

```json
// 第 N 轮（N>1）
messages: [
  { "role": "system",    "content": "..." },
  { "role": "user",      "content": "<第1轮 稳定+状态 snapshot>" },
  { "role": "assistant", "content": "<第1轮 AI JSON 输出>" },
  …
  { "role": "user",      "content": "<第N轮 仅速变 delta>" }
]
```

- **缓存行为：** 对齐 DeepSeek [例一多轮对话](https://api-docs.deepseek.com/zh-cn/guides/kv_cache) — 历史 system+user+assistant 链 **高命中**。
- **娱乐收益：** 模型以原生对话格式看到前文，连贯性通常 **优于** 把历史塞进 JSON 字符串。
- **成本/风险：**
  - 轮数增多后 input token 线性涨（须配合 L1–L6 压缩 + **滑动窗口** 只保留最近 K 对 user/assistant）
  - 与现有 `narrativeHistory` JSON 字段 **重复** — 需二选一（见 9.4）
- **默认：** 关闭；6A/6D-1 稳定后再 A/B。

### 9.3 「加更多字段」澄清

| 用户直觉 | 实际建议 |
|---------|---------|
| 多加几个 API 参数 | ❌ DeepSeek 无此能力 |
| 多加几条 user 消息 | ⚠️ 仅当 **整条 message 内容稳定** 时有意义；否则无效 |
| 多加 JSON 键 | ⚠️ 键越多且排在速变区前，越容易 **破坏前缀**；空键应 **省略** 而非 `""` |
| 把 schema 拆到 system | ✅ 已在 `SYSTEM_PROMPT`；保持 100% 固定 |
| 把世界观拆到独立 system | ❌ 多条 system DeepSeek 通常合并；且世界观每局不同，应放 user 稳定段 |

### 9.4 注意力优化（不改变玩法语义）

> Transformer 对长上下文存在 **lost-in-the-middle** 倾向：中间段信息利用率低于首尾。优化目标是 **把「必须遵守」放前、把「本轮要写什么」放后**，与 KV 稳定前缀 **同向**。

#### A. 字段顺序 = 注意力 + 缓存双优化

已在 `narrative-prompt` 中部分实现；6A 修复后应强制执行 L0→L1→L2 序（见 9.2 表）。

**本轮任务锚点（放 user JSON 最后）：**

```json
"instruction": "…",
"narrativeHistory": ["…最近1-2轮…"],
"eventInjection": "…"
```

模型在生成前最后读到：最近情节 + 玩家指令 + 宏观事件 → 衔接自然。

#### B. 去重（减 token + 减噪声，娱乐性不降）

| 重复源 | 现状 | 6D 建议 |
|--------|------|---------|
| `memorySummary` 内 L0 vs `narrativeHistory` | 两处都含近期原文 | **保留 memory 结构化摘要**；`narrativeHistory` 缩为 **最近 2 轮** 或 S3 启用后 **删除 JSON 历史** |
| `currentState` vs `recentChanges` | 部分 overlap | 保留 — `recentChanges` 是 diff，利于注意力聚焦变化 |
| `worldSetting` vs `playerCustomization` | 少量 macro 重叠 | 维持；macro 以 customization 为准 |
| `availableSubsystemFields` 全量注册表 | 每轮注入 **全部** MOD 字段说明 | `formatSubsystemFieldsForPrompt(relevantIds)` **仅注入本轮相关子系统** |

#### C. 精简（语义等价，非删玩法）

| 项 | 做法 | 条件 |
|----|------|------|
| 空 optional 键 | 构建 JSON 时 **omit undefined/""** | 不改变有值字段 |
| `subsystemSummaries` | 已有 `SubsystemRelevanceSystem` 过滤 | 保持；可调低 ALWAYS_RELEVANT 列表 playtest |
| `memorySummary` | L6→L4→…→L0 层级已有 | 6A-3 接通压缩后自然变短 |
| `wordCountInstruction` | 单行 | 已精简 |
| System prompt examples | 2 个示例占 token | **6D-3 可选**：示例移入文档，system 仅留 schema（须 A/B 验证 JSON 合规率） |

#### D. 注意力「_boost」手段（低风险）

1. **标题锚点** — `memoryLifecycle.formatRichPromptForInjection` 已用 `【一生纵览】` 等；保持。
2. **事件注入前置到速变段顶部** — 宏观事件比子系统数值更驱动叙事；可考虑 `eventInjection` 在 `currentState` 之前（仅调序，不删内容）。
3. **importance 反馈闭环** — AI 输出 `importance` → `memoryLifecycle` 已读；压缩时 HIGH 保留 80%（已有）。
4. **禁止** 为省 token 删除 `worldCalibrationSummary` / 伏笔 / 核心记忆 — 直接损害娱乐性。

### 9.5 推荐落地顺序（命中率 × 娱乐性）

```
6A  完整单 user 模板（S1）+ 压缩接通     ← P0，必须先做
      ↓ playtest 叙事 OK
6D-1  可选启用 S2（双 user）+ hitRate A/B  ← 仅当 stable 段 >2k tokens 且 hitRate 低
6D-2  可选 S3 滑动多轮 + 去重 narrativeHistory
6D-3  system 示例精简（仅 A/B 通过后）
```

**决策门：** 每步对比 `prompt_cache_hit_tokens / (hit+miss)` 与 **人工叙事评分**；hitRate 升但评分降 → 回滚。

### 9.6 观测与实验方法（6D 前置）

```ts
// 每轮 narrative 调用后记录（已有 accumulateCacheStats）
interface RoundCacheMetrics {
  hitTokens: number
  missTokens: number
  stablePrefixChars: number   // 6A 新增统计
  userMessageCount: number    // 1 | 2 | 2+2N(S3)
  strategy: 'S1' | 'S2' | 'S3'
}
```

Playtest 脚本：同一存档连续 10 轮，对比 S1 vs S2 的 avg hitRate 与 blind 叙事连贯性打分。

---

## 10. Phase 6D — 命中率 / 注意力优化（P2，6A 后）

| ID | 内容 | 改动面 | 娱乐风险 |
|----|------|--------|---------|
| 6D-1 | S2 双 user 分界 + feature flag `KV_TWO_USER_SEGMENTS` | `prompt-builder.ts` · `ai-client` | 低 |
| 6D-2 | `subsystemFields` 按 relevantIds 裁剪 | `orchestrator assemblePromptContext` | 低 |
| 6D-3 | `narrativeHistory` 与 memory L0 去重 | `assemblePromptContext` | 中（须测衔接） |
| 6D-4 | 速变段键序：`eventInjection` ↑ | `narrative-prompt` variables 序 | 低 |
| 6D-5 | S3 多轮 assistant 滑动窗口 | 新 `buildConversationMessages()` | 中 |
| 6D-6 | Dev 面板：hitRate + strategy + 每轮 token | Settings/Debug UI | 无 |
| 6D-7 | 空键 omit 构建器 | `buildPrompt` 输出 JSON 解析/重组 | 低 |

**6D 完成标准：**

- [ ] 同存档 10 轮：hitRate 较 6A 基线 **≥ +15%** 或 input token **≥ -10%**
- [ ] blind 叙事评分 **不低于** 6A 基线
- [ ] 无 calibration / 伏笔 / 记忆回归

---

## 11. 变更记录

| 版本 | 日期 | 说明 |
|------|------|------|
| v1.0 | 2026-06-24 | 初版：KV / 压缩 / 时间步进三方调研 + 6A/6B/6C 分期 |
| v1.1 | 2026-06-24 | §9 消息架构：S1/S2/S3 策略、注意力优化、去重精简、Phase 6D |
| v1.2 | 2026-06-24 | **已执行**：6A Prompt 完整接线 + 压缩管线；6B 时间步进 UI/Resolver/50+ 子系统；6D 精简项 |
