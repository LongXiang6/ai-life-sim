# 蓝图：生命周期叙事引擎 + 日志问题修复

> 生成时间：2026-06-30  
> 来源：废弃项目调研 + 测试日志深度分析  
> 状态：待确认优先级

---

## 一、废弃项目 vs 新项目：生命周期叙事能力差异

### 1.1 废弃项目架构（5 层）

```
life-stage-config.ts    配置层：5 世界观 × 8 阶段的事件池 + 规避词（约 250 条）
    ↓
life-stage-system.ts    引擎层：阶段系数（活力/学习/社交）+ Prompt 文本格式化
    ↓
life-sim-lifecycle.ts   叙述引擎层：叙事类型引导 + 寿命提醒 + 难度压制 + 实力约束
    ↓
orchestrator-v2.ts      编排层：EventLifecycle 追踪 + directionText/lifeStageText
    ↓
life-sim-narrative.ts   Prompt 层：最终 Prompt 组装
```

### 1.2 移植完整度

| 功能模块 | 废弃项目文件 | 新项目状态 |
|----------|-------------|-----------|
| 阶段事件池 + 规避词 | `life-stage-config.ts` | ✅ 已移植 `life-stage-pools.ts` |
| 阶段系数（活力/学习/社交） | `life-stage-system.ts` | ✅ `life-stage-system.ts` |
| 阶段中文描述 | `life-sim-lifecycle.ts` → `buildLifeStageContext` | ✅ `life-stage-narrative.ts` → `buildLifeStageNarrativeHint`（简化版） |
| **叙事类型引导** | `life-sim-lifecycle.ts` → `generateArchetypeHint` | ❌ **缺失** |
| **按阶段限制叙事类型** | `life-sim-lifecycle.ts` → `STAGE_ARCHETYPES` | ❌ **缺失** |
| **寿命提醒** | `life-sim-lifecycle.ts` → `buildLifespanReminder` | ❌ **缺失** |
| **难度压制 + 世界动态事件** | `life-sim-lifecycle.ts` → `buildDifficultyHint` | ❌ **缺失** |
| **实力感知约束** | `life-sim-lifecycle.ts` → `buildPowerAwarenessHint` | ❌ **缺失** |
| **行动规模分类** | `life-sim-lifecycle.ts` → `classifyActionScale` | ❌ **缺失** |

---

## 二、待实现：叙事类型引导系统

### 2.1 `STAGE_ARCHETYPES` — 按阶段限制叙事类型

```typescript
// 废弃项目代码 → 需要移植
const STAGE_ARCHETYPES: Record<LifeStage, NarrativeArchetype[]> = {
  infant:       ['routine'],                                          // 只允许日常
  child:        ['routine', 'social'],                                // 日常+社交
  teenager:     ['routine', 'social', 'exploration', 'mystery'],      // +探索+谜团
  young_adult:  ['routine', 'danger', 'opportunity', 'social',
                 'punch_down', 'exploration', 'rumor', 'mystery'],    // 全部 8 种
  adult:        全部 8 种,
  middle_age:   ['routine', 'social', 'exploration', 'mystery'],      // 4 种
  elder:        ['routine', 'social'],                                // 日常+社交
  deceased:     [],
};
```

**叙事类型定义**（8 种）：

| 类型 | 标签 | 说明 |
|------|------|------|
| `routine` | 日常 | 平凡但有温度的生活片段 |
| `danger` | 危机 | 有难度的威胁或冲突，需要策略应对 |
| `opportunity` | 机遇 | 发现宝藏/传承/名师，需付出代价 |
| `social` | 社交 | 与周围人物的深度互动 |
| `punch_down` | 碾压 | 遭遇远弱于主角的挑衅者 |
| `exploration` | 探索 | 发现未知区域/秘境/遗迹 |
| `rumor` | 传闻 | 远方事件的背景信息，暗示世界运转 |
| `mystery` | 谜团 | 可疑线索/古老预言/身世之谜 |

### 2.2 `generateArchetypeHint` — 叙事类型随机选取

- 按权重表随机：日常 53%、危机 3-25%（依难度）、机遇 7%、社交 15%、探索 6%、传闻 7%、谜团 7%、碾压 3%
- Fisher-Yates 打乱区间映射顺序
- 选中后检查是否在 `STAGE_ARCHETYPES[lifeStage]` 允许范围内
- 连续 5 轮冲突 → 强制切换回日常
- 玩家意图和平 → 50% 概率替换冲突类型

### 2.3 `buildLifespanReminder` — 寿命提醒

| 区间 | 提示内容 |
|------|---------|
| 寿命进度 ≥ 85% | 警告逼近上限，健康每况愈下，严重疾病可致命 |
| 寿命进度 50-85% | 提醒距老年尚早，除非致命危机否则不得年迈结束 |
| 寿命进度 < 10%（且年龄 ≤ 3） | 非常年轻，严禁以年龄为由触发结局 |

### 2.4 `buildDifficultyHint` — 难度压制 + 世界动态

- 每 15 轮随机注入一条世界背景事件（依世界观选不同模板池）
- 难度压制期内提示"天道压制至 X 岁"

---

## 三、日志暴露的问题清单

### 3.1 严重问题

| # | 严重度 | 问题 | 日志位置 | 根因分析 |
|---|--------|------|----------|----------|
| P1 | **高** | **重试风暴无上限** | `proxy-access-*.jsonl` 行 12-68 | ✅ **已修复** — `trackFingerprint` 加 `MAX_RETRY_COUNT=5` 硬上限，超限返回 429 |
| P2 | **高** | **Zod schema 类型定义错误** | `raw-responses/ai-client-warn-*.txt` | ✅ **已修复** — `populationScale: z.string()` → `z.number()` |
| P3 | **高** | **API Key 未配置** | `proxy-access-*.jsonl` 54/71 条 | ✅ 上轮已修复（AdaptationManager 缺 API Key 透传），需验证修复后不再出现 |

### 3.2 中等问题

| # | 严重度 | 问题 | 日志位置 | 根因分析 |
|---|--------|------|----------|----------|
| P4 | **中** | **缺失首次失败日志** | `proxy-access-*.jsonl` 行 6/9/70 | 3 条 `is_retry=true, status=200` 无对应首次失败记录，日志系统可能丢弃了首次失败 |
| P5 | **中** | **per-fingerprint 差异化行为** | `proxy-access-*.jsonl` 行 49/53 vs 其余 | 同一时段有的 fingerprint 200 成功、有的 500 失败，说明 Key 按会话独立持有，配置可能不完整 |

### 3.3 低优先级

| # | 严重度 | 问题 | 根因分析 |
|---|--------|------|----------|
| P6 | **低** | 5 个日志目录未创建 | `client-errors/`、`narrative-rounds/`、`talent-generate/`、`world-init/`、`background-events/` 均不存在。日志系统声明了这些目录但未实际产出 |
| P7 | **低** | `ai-debug/` 空目录 | 调试日志功能未启用或未被调用 |
| P8 | **低** | 纪元始终"创世纪元" | 上轮已修复（WorldConfig 加 eraName 字段），需新世界创建后验证 |

---

## 四、可实现性评估表

| 模块 | 新项目已有基础 | 需要新建 | 可行方案 |
|------|---------------|---------|---------|
| 叙事类型引导 | `life-stage-narrative.ts` | `life-stage-archetypes.ts` | 废弃项目 `life-sim-lifecycle.ts` 移植 |
| 按阶段限制叙事类型 | `LifeStageId` 类型已定义 | 配置映射 | 直接移植 `STAGE_ARCHETYPES` |
| 寿命提醒 | `RoundContext.round.year` 有年龄 | 新函数 | 移植 `buildLifespanReminder` |
| 难度压制 + 世界动态 | 无 | 新函数 | 移植 `buildDifficultyHint`（简化掉废弃项目特有的 `DIFFICULTY_CONFIG` 依赖） |
| 实力感知约束 | 无 | 新函数 | 可选，依赖较高 |
| 重试上限 | `proxy/route.ts` 已有重试逻辑 | 加硬上限 | 修改重试循环 |
| Zod 类型修复 | `populationScale` 已定义 | 改类型 | `string` → `number` |
| 日志目录补齐 | `logger/` 已有 | 加写入点 | 在对应子系统调用 logger |

---

## 五、遗留兼容性风险

1. **废弃项目 `DIFFICULTY_CONFIG` 不存在于新项目**：移植 `buildDifficultyHint` 时需适配新项目的难度体系
2. **废弃项目 `LongTermMemory` 类型与新项目结构不同**：`buildPowerAwarenessHint` 移植需适配
3. **新项目已有 `buildLifeStageNarrativeHint`**：需确认是否替换还是增强，避免重复注入
4. **纪元名修复依赖新世界创建**：既有世界需重新触发初始化才能生效
