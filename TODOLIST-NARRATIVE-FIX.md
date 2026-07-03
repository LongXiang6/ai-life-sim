# 叙事提示词修复计划书

> 来源：4 子 Agent 交叉评估（2026-07-03）
> 关联：TODOLIST-PROMPT-SIMPLIFY.md Step 19

---

## 一、执行阶段

### Phase 1：代码逻辑 Bug（P0 — 影响实际运行）

| # | 问题 | 源 | 文件 | 操作 |
|---|------|:--:|------|------|
| 1.1 | `timeGuideText` 静默丢失 — `buildNarrativeUserJson` 无映射、无 KV 键 | Agent2 | prompt-builder.ts | 添加映射 + FAST_JSON_KEYS |
| 1.2 | `剧情阶段` 归段错误 — SLOW 但每轮变 → 破坏 KV 前缀缓存 | Agent1 | prompt-builder.ts | 从 SLOW 移至 FAST |
| 1.3 | `foreshadowing` 在 GUIDE 但无 Schema → AI 变更被静默丢弃 | Agent4 | subsystem-field-registry.ts | 从 GUIDE + allowedSubSystems 移除 |
| 1.4 | SUBSYSTEM_GUIDE 缺 7 个子系统字段说明 | Agent4 | narrative-prompt.ts | 补全 morality/luck/faith/family/education/market/population |
| 1.5 | `health.addDiseases` GUIDE 有 `rounds` 但 Schema 无 | Agent4 | subsystem-field-registry.ts | Schema 追加 rounds 字段 |
| 1.6 | `relationship.addRelation` GUIDE 用 `reason` 但 Schema 用 `type` | Agent4 | subsystem-field-registry.ts | Schema 追加 reason 字段 |

### Phase 2：冗余清理（P1 — 重复/死代码）

| # | 问题 | 源 | 文件 | 操作 |
|---|------|:--:|------|------|
| 2.1 | `可变更子系统` 在 system+user 两面重复发送 | Agent1 | prompt-builder.ts | 从 STABLE_JSON_KEYS+raw 移除 user 端 |
| 2.2 | `talents` 赋值用不安全双重类型转换 | Agent2 | orchestrator-system.ts | 改为直接属性赋值 |
| 2.3 | `buildEconomyScaleText` 方法体死代码 | Agent4 | orchestrator-system.ts | 删除方法 |
| 2.4 | `{{timeGuideText}}` 死占位符 | Agent1 | narrative-prompt.ts | 从模板+variables 移除 |

### Phase 3：Token 优化（P2 — 架构调整）

| # | 问题 | 源 | 文件 | 操作 |
|---|------|:--:|------|------|
| 3.1 | SUBSYSTEM_GUIDE 在 user → 不享受 KV Cache | Agent3 | orchestrator → system | 移至 SYSTEM_PROMPT，从 user 移除 |

---

## 二、验证

每阶段完成后执行：

```
npx tsc --noEmit && npm run lint
```

Phase 1-2 全部完成后，进行浏览器完整一轮叙事测试。

---

## 三、暂不执行（需另行评估）

| 问题 | 原因 |
|------|------|
| SYSTEM_PROMPT stringifyPrompt→平文本（-2600 tokens） | 架构变更大，需专项计划 |
| examples 嵌套JSON→`//`格式（-1200 tokens） | 同上 |
| 删除 output.schema（-1200 tokens） | 需确认 JSON Mode 无 schema 时 AI 行为 |
| MOD世界规则/世界校准/叙事基调 移除 | 需确认业务依赖 |
| 记忆摘要/核心记忆/时间桥摘要/因果链提示 移除 | 需确认业务依赖 |
