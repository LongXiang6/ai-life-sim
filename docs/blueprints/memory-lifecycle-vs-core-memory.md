# memoryLifecycle 与 CoreMemory 分工说明

> 蓝图 Phase 4.4 | 日期：2026-06-22

## 分层职责

| 层级 | 系统 | 职责 | Prompt 字段 |
|------|------|------|-------------|
| 永久记忆 | **CoreMemorySystem** | HIGH 关键事件、NPC 关系网、伏笔种植上下文 | `coreMemory` + worldCustomize 中的 NPC 网 |
| 滚动记忆 | **MemoryLifecycleSystem** | L0–L4 压缩摘要 + 检索命中 + 最近 5 轮原文 | `memorySummary` |
| 遗忘过滤 | **MemoryForgettingSystem** | 仅处理 L1 琐碎重复；HIGH/NPC/因果/伏笔标记永不删 | （不直接注入 Prompt） |
| 叙事引导 | foreshadowing / plotStructure / lifeDirection | 当前回合叙事方向 | `foreshadowingText` 等 |

## 去重原则

1. **CoreMemory** 来自 `searchIndex` 的 HIGH 条目 + NPC 互动，**不受** `buildRichPrompt` 截断影响。
2. **memorySummary** 负责「最近发生了什么」；不重复注入已在 `coreMemory` 中的同一段 FULL 文本。
3. **foreshadowingText** 由 `foreshadowing-system` 生成，可附带 `getPlantedContext()` 的 L1 摘要；与 CoreMemory 事件摘要互补而非替代。
4. 修改重要性策略时：**只改 memoryLifecycle.retrieveFromIndex / scoreImportance**，不要削减 CoreMemory 配额。

## 娱乐性护栏（memoryForgetting）

- 因果标记（含 `foreshadow` 类型）→ 永不遗忘
- 重大事件 / 人物关系关键词 → 永不遗忘
- **CoreMemory 已登记 NPC 名称**出现在摘要中 → 永不遗忘
