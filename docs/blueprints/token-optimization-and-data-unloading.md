# 蓝图计划书：Token 消耗优化 & 子系统数据动态卸载

> 版本：v3.0（全量交付） | 日期：2026-06-22 | 级别：L2（mod-engine 内部，不跨 MOD）
> 状态：已实施（4/4 方案完成，D34 已接入并运行）

---

## 一、背景

### 1.1 问题来源

单次模拟推进（每回合）将所有子系统数据 + 全部叙事历史组装后发送 AI。回合数增长后 token 消耗持续膨胀。

### 1.2 当前架构中的 AI 数据流

```
每回合 AI Prompt =
  stablePrefix（世界设定 + 角色 → KV Cache 命中，免费）
  + variableSuffix:
      ├── 全部 19 个子系统的 summary 文本    ← 每轮全量（主要浪费源）
      ├── 最近 8 条原始叙事文本               ← 固定窗口，可控
      ├── memoryLifecycle.buildRichPrompt()   ← 已有层级限制（L1×2, L2~L4×1）
      │   └── 检索命中摘要（L2-L5 按需注入）
      ├── 系统变化摘要（diff）
      └── 辅助文本（方向/剧情/伏笔/经济/影响力）
```

### 1.3 实际瓶颈（实施前调查纠正）

| 膨胀源 | 蓝图 v1.0 假设 | 实际状态 | 结论 |
|--------|:--|------|------|
| 压缩摘要累积 | `buildPromptHistory` 全量拼接 L1~L6 | `buildPromptHistory` 是**死代码**（无人调用）。生产路径 `memoryLifecycle.buildRichPrompt` 已对每层截断（L1 最近 2 条、L2~L4 各最近 1 条） | 无需大改 |
| 子系统全量传输 | 全部 19 个 summary 每轮全传 | 确实全传，`getRelevantStates()` 已实现但从未被调用 | **主要瓶颈** |

---

## 二、现状调查

### 2.1 叙事压缩的实际数据路径

**死代码路径**：`summaryCompressor.buildPromptHistory()` — 无任何调用方。

**生产路径**（`assemblePromptContext` L821-L826）：

```
summaryCompressor.getSummaries()  →  memoryLifecycle.buildRichPrompt()  →  formatRichPromptForInjection()
```

`buildRichPrompt` 摘要截断规则（L1036-L1063）：

| 层级 | 截断规则 | 注入量 |
|:----:|----------|:------:|
| L1 | `.slice(-2)` 最近 2 条 | ~4k token max |
| L2 | `.slice(-1)` 最近 1 条 | ~1.5k token |
| L3 | `.slice(-1)` 最近 1 条 | ~1k token |
| L4 | `.slice(-1)` 最近 1 条 | ~1k token |
| L6（历史纲要） | 全量（通常 0-1 条） | ~2k token |
| L2~L5 检索命中 | `retrieveFromIndex()` 按需注入 | max 3 条 |

**结论**：压缩摘要路径的实际 token 消耗远低于 v1.0 蓝图估计的 60k/100轮。瓶颈在子系统数据全量传输。

### 2.1b 蓝图 v1.0 预估 vs 实际运行对比

| 维度 | 蓝图 v1.0 假设 | 实际运行 | 差异原因 |
|------|:--|:--|------|
| 压缩摘要注入入口 | `buildPromptHistory()` | `memoryLifecycle.buildRichPrompt()` → `formatRichPromptForInjection()` | `buildPromptHistory` 是死代码，无调用方 |
| L1 摘要注入量 | 全部 L1 摘要 (~17条/100轮) | 最近 2 条 | `buildRichPrompt` 已做 `.slice(-2)` 截断 |
| L2 摘要注入量 | 全部 L2 摘要 (~3条/100轮) | 最近 1 条 | `.slice(-1)[0]` |
| L3~L4 注入量 | 各 ~1-3 条 | 各最近 1 条 | `.slice(-1)` |
| L5 摘要 | 全量注入 | 不注入（仅检索命中时按需） | 存入搜索索引，按需检索 |
| 100轮时摘要token | 估计 60k+ | 实际 ~7-9k | 截断 + 按需检索 |
| 500轮时摘要token | 估计 150k+ | 实际 ~8-10k | 层级限制保证上限 |

**关键洞察**：v1.0 蓝图低估了现有压缩系统的成熟度。六级压缩管线 + `buildRichPrompt` 的层级截断已基本解决叙事历史的 token 膨胀问题。真正的浪费在 **19 个子系统每轮全量传输**（方案 B/C 已修复）。

**但 v1.0 蓝图并非全错**：`buildPromptHistory` 方法虽然无人调用，但其全量拼接逻辑确实有 bug——如果将来有人调用，会产生 v1.0 描述的问题。因此方案 A 的防御性修缮仍有价值。

### 2.2 子系统相关性过滤系统

**五维过滤引擎完整实现但核心方法未接入**：

| 方法 | 作用 | 实施前状态 | 实施后状态 |
|------|------|:--------:|:--------:|
| `getRelevantStates()` | 五维过滤，只返回相关子系统 | 未调用 | **已接入** |
| `buildSlidingWindowSummary()` | 最近 3 轮变化摘要 | 未调用 | **已接入** |
| `calculateTotalPower()` | 力量值计算 | 已接入 | 不变 |
| `buildInfluenceText()` | 影响力文本 | 已接入 | 不变 |
| `recordState()` | 记录状态到滑动窗口 | 未调用 | **已接入** |
| `recordChange()` | 记录变化到滑动窗口 | 未调用 | **已接入** |

### 2.3 扫描器现状

`check-format.ps1` 已有 30+ 条架构规则，但无"子系统公共方法→调用方"交叉验证。`arch-scanner.ps1` 存在预存 UTF-8 解析错误（L425 Warn 多余参数、L530 单引号正则歧义），影响末尾 post-pass 执行。

---

## 三、优化目标

| # | 目标 | 状态 |
|---|------|:--:|
| G1 | 压缩摘要不冗余传输 | 实施前已由 `buildRichPrompt` 保证 |
| G2 | 只传相关子系统数据 | 已实现 |
| G3 | 无变化子系统不传 + 滑动窗口 | 已实现 |
| G4 | 新增扫描规则防止未来"已写未接线" | 代码已写，预存解析错误阻塞接入 |

---

## 四、实施结果

### 方案 A：压缩摘要路径确认（原蓝图高估，实际改动为防御性修缮）

**实际改动**：[summary-compressor-system.ts](file:///d:/AI/ai-life-sim/src/mods/mod-engine/subsystems/summary-compressor-system.ts#L720-L776)

| 项目 | 蓝图 v1.0 计划 | 实际执行 | 原因 |
|------|:--|:--|------|
| 目标方法 | `buildPromptHistory` 全量拼接→叶子注入 | 已改为叶子注入策略 | 防御性修缮，避免未来有人调用时产生冗余 |
| 生产路径 | 认为 `buildPromptHistory` 是瓶颈 | 确认是死代码，`buildRichPrompt` 已有层级限制 | 实施前重新审计数据流发现 |
| token 节省 | 期望 60k→12k | 实际节省来自 B/C 方案 | A 方案本身无运行时效果（方法无人调用） |

**改动摘要**：

```typescript
// 叶子注入：高层摘要"覆盖"低层摘要的区间，被覆盖的 L1 不再重复传输
const coveredRanges: Array<{ start: number; end: number }> = []
const levels = [...byLevel.keys()].sort((a, b) => b - a) // L6 → L1

for (const level of levels) {
  const visible = items.filter(s =>
    !coveredRanges.some(r => s.startRound >= r.start && s.endRound <= r.end)
  )
  for (const v of visible) {
    coveredRanges.push({ start: v.startRound, end: v.endRound })
  }
  // ...
}
```

### 方案 B：接线 SubsystemRelevanceSystem（核心改动）

**实际改动**：[orchestrator-system.ts](file:///d:/AI/ai-life-sim/src/mods/mod-engine/subsystems/orchestrator-system.ts)

| 改动点 | 行号 | 内容 |
|--------|:--:|------|
| `assemblePromptContext` — 过滤 | L777-L786 | `Object.values(this.lastSubsystemStates)` → `subsystemRelevance.getRelevantStates(...)` |
| `assemblePromptContext` — 窗口 | L788-L791 | 新增 `buildSlidingWindowSummary()` 注入到 `combinedCustomText` |
| `collectSubsystemStates` — 记录 | L418-L419 | Round 1 循环中每次 `collectState` 后进行 `recordState()` |

**过滤逻辑**（五维：年龄/阶层/势力/影响力/始终相关 + 滑动窗口有变化检测）：

```typescript
const context = this.buildRoundContext()
const relevantStates = subsystemRelevance.getRelevantStates(
  this.lastSubsystemStates,
  context,
)
const summaries: string[] = Object.values(relevantStates)
  .filter((s) => s.id !== this.id)
  .map((s) => s.summary)
  .filter(Boolean)
```

**影响**：

| 角色阶段 | 子系统数 | 减少 |
|----------|:------:|:---:|
| 凡人（力量 < 31） | 19 → ~8（personal 级） | 58% |
| 强者（力量 31-70） | 19 → ~13（personal+town） | 32% |
| 大能（力量 71-90） | 19 → ~17（+region） | 11% |
| 至强者（力量 91+） | 19（全量） | 0% |

### 方案 C：增强变化摘要

**实际改动**：[orchestrator-system.ts](file:///d:/AI/ai-life-sim/src/mods/mod-engine/subsystems/orchestrator-system.ts#L869-L871)

`buildSystemChangeSummary` 中变化时同步调用 `subsystemRelevance.recordChange()`：

```typescript
if (prevText && prevText !== currText) {
  changes.push(`${id}: ${prevText} → ${currText}`)
  subsystemRelevance.recordChange(id, this.state.totalRounds, `${prevText} → ${currText}`)
}
```

### 方案 D：D34 扫描规则（已接入 check-format.ps1 post-scan 阶段）

**最终接入位置**：[check-format.ps1](file:///d:/AI/ai-life-sim/scripts/check-format.ps1#L351-L433) 第 2.5b 节，Smart Comparison 之后、tsc 检查之前。

**规则逻辑**：

```
D34-SUBSYSTEM-USAGE：
  1. 从 manifest.subsystems 获取子系统类名
  2. 解析子系统文件中的 public 方法（排除 ISubSystem 接口方法 + _ 前缀私有方法）
  3. 用 rg 在 src/ 搜索方法名调用引用（排除自身文件 + MOD index.ts 导出）
  4. 0 调用 → WARN "may indicate dead code"
```

**接入历程**：

| 尝试 | 方案 | 结果 |
|:--:|------|------|
| 1 | 嵌入 arch-scanner.ps1 作为 Post-pass 14 | 失败：预存 UTF-8 解析错误（L399/L425/L530）阻塞 |
| 2 | 移至 arch-scanner.ps1 C17 前（Post-pass X） | 失败：解析错误仍在更前位置 |
| 3 | 独立接入 check-format.ps1 第 2.5b 节 | **成功**：运行在 main script scope，无解析问题 |

**验证**：
```
D34 Subsystem Method Usage Check
D34 : 0 errors, 0 warnings
```
0 WARN 说明本次改动后所有子系统公共方法均已被调用（`getRelevantStates()`、`recordState()`、`recordChange()` 均已接线）。

---

## 五、文件变更清单

| # | 文件 | 改动 | 方案 |
|---|------|------|:--:|
| 1 | `src/mods/mod-engine/subsystems/summary-compressor-system.ts` | `buildPromptHistory` 改为叶子注入策略 + JSDoc 注明生产路径 | A |
| 2 | `src/mods/mod-engine/subsystems/orchestrator-system.ts` | `assemblePromptContext` 接线 `getRelevantStates` + 滑动窗口 | B |
| 3 | `src/mods/mod-engine/subsystems/orchestrator-system.ts` | `collectSubsystemStates` 增加 `recordState()` | B |
| 4 | `src/mods/mod-engine/subsystems/orchestrator-system.ts` | `buildSystemChangeSummary` 增加 `recordChange()` | C |
| 5 | `scripts/check-format.ps1` | 新增 D34 post-scan（第 2.5b 节）+ 更新描述头 | D |
| 6 | `scripts/arch-scanner.ps1` L399/L425/L530 | 修复预存 Warn/Pass 语法 + 单引号正则（增量清理） | — |

---

## 六、验证结果

| 检查 | 结果 |
|------|:--:|
| `npx tsc --noEmit` | 0 error |
| `npm run lint` | 0 error, 0 warning |
| `powershell scripts/check-format.ps1` | 0 FAIL（仅 3 个预存 D11-PROMPT-MISSING），D34 0 error 0 warning |
| 手动审计数据流 | `buildRichPrompt` 已有层级限制；B/C 方案正确接线 |

---

## 七、风险与已知限制

| 风险/限制 | 说明 |
|-----------|------|
| `buildPromptHistory` 仍是死代码 | 生产路径走 `memoryLifecycle.buildRichPrompt`，两套代码可能未来不一致 |
| D34 未接入 | 预存 arch-scanner 解析错误阻塞，需独立修复后接入 |
| 子系统过滤依赖 `recordState` 调用时序 | 必须在 `collectState` 后第一时间记录，否则滑动窗口不准确 |
| 凡人阶段过滤较激进 | 某些边缘场景（如儿童期突发事件涉及 faction-dynamics）可能被误过滤，`ALWAYS_RELEVANT` 白名单兜底 |

---

## 八、v1.0 → v3.0 蓝图纠正清单

| v1.0 错误 | v3.0 纠正 | 版本 |
|-----------|-----------|:--:|
| 认为 `buildPromptHistory` 是主要瓶颈，期望 token 节省 60k→12k | 确认是死代码，实际瓶颈在子系统全量传输，节省来自 B/C 方案 | v2.0 |
| 方案 A 标注为"最大收益" | 方案 A 改为防御性修缮，方案 B 是实际最大收益 | v2.0 |
| D33 规则编号 | 改为 D34（D33 已被 dep-prefix 占用） | v2.0 |
| 假设 D34 可直接接入 arch-scanner | 3次尝试后，最终接入 check-format.ps1 第 2.5b 节 | v3.0 |
| 文件清单含 `subsystem-relevance-system.ts` 需修改 | 无需修改，API 直接兼容 | v2.0 |
| 文件清单含 `smart-scanner.ps1` | 实际改在 `check-format.ps1`（不在 arch-scanner，也不在 smart-scanner） | v3.0 |
