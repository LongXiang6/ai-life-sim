# 蓝图 v9a（Phase 13A）：命格抽取流式体验 — 实施记录与回归

> **状态**：✅ 已落地（2026-06-25）  
> **父蓝图**：[BLUEPRINT-WORLD-COHERENCE-PHASE13.md](./BLUEPRINT-WORLD-COHERENCE-PHASE13.md) §2  
> **版本**：v1.0

---

## 1. 目标

| 目标 | 说明 |
|------|------|
| 首批 AI 流式 | 第 1 批（20 条）使用 SSE，本地增量解析 JSON 数组 |
| 进度可感知 | 解析 1 条 → `streamCount` +1 → 20 格脉冲 + 主条充电光效 |
| 提前选取可靠 | `onEarlyReady` 前 `candidates` 已同步；confirm 合并候选池 |
| 选取 UI 一致 | 已选槽位与未选网格同宽同高（128px / 3 列） |

---

## 2. 实现摘要

### 2.1 流式解析

**新文件：** `src/mods/mod-character/utils/streaming-json-array-parser.ts`

- `StreamingJsonArrayParser.feed(chunk)` —  brace 计数提取完整 `{...}` 对象
- 适配 Prompt 约定：紧凑 JSON 数组，每行一条命格

**调用链：**

```
talent-draw/page.tsx
  setAIService → callAIStream (batch 0, stream: true)
destiny-pattern-system.generateWithAI
  batch === 0 → onChunk → parser.feed → ingestItem → onProgress(count, patterns)
  batch >= 1 → callAI 非流式（不变）
```

### 2.2 进度 UI

**文件：** `TalentDraw.module.css` · `page.tsx`

| 元素 | 行为 |
|------|------|
| `.progressFill` | 渐变底 + `::after` 充电光带（`progressCharge`） |
| `.progressSegments` | 20 格，`< streamCount` 时 `.progressSegmentActive` + 脉冲 |
| `.progressFillWaiting` | 首字节前：窄条 + 呼吸动画 |
| 文案 | `streamCount > 0` → `N/20`；否则 → `第 N 批请求中...` |

### 2.3 无效 ID 修复

| 改动 | 说明 |
|------|------|
| 每批 `this.state.candidates = [...allPatterns]` | 支持 early ready |
| `selectPatterns(ids, candidatePool?)` | 可选外部池 |
| `handleConfirm` | 合并 `fullPoolRef` + `slots` 为候选池 |

---

## 3. 配置与约束

| 项 | 值 |
|----|-----|
| 首批 batch size | `AI_DESTINY_PATTERN_BATCH_SIZE = 20` |
| early ready 阈值 | `DEFAULT_DESTINY_PATTERN_COUNT = 12` |
| 流式 responseFormat | **关闭** `json_object`（与 SSE 冲突） |
| 后续批次 | 非流式 + `json_object` 可选保留 |
| AI 池 | `pool: 'fate'` → 日志目录 `talent-generate` |

---

## 4. 回归清单

### 4.1 功能

- [ ] 点击「抽取命格」→ generating 阶段可见光带 + 格点递增
- [ ] 约 12+ 条后自动进入 selecting，命格库计数 ≥12
- [ ] 选 3 确认 → 不报「无效命格 ID」
- [ ] 后台 batch 2–5 完成后命格库增至 ~100

### 4.2 日志

- [ ] `logs/ai-debug/talent-generate/` 新文件含完整 `【AI 返回】`
- [ ] 首批日志可看到较长 response（流式结束后一次性记录）

### 4.3 边界

- [ ] AI 失败 → 降级预设池，phase 仍进 selecting
- [ ] 返回中途离开页面 → abort 不崩溃
- [ ] 非 AI 模式（设置关闭）→ 不走流式，行为与旧版一致

---

## 5. 已知限制 / 后续（不在 13A）

| 项 | 说明 | 建议阶段 |
|----|------|----------|
| batch 2–5 非流式 | 用户在 selecting 时后台静默填充 | 13D 可选「后台填充进度」 |
| 流式 + markdown 包裹 | parser 已 strip \`\`\`json 前缀 | 若 AI 输出 wrapper 需监控 |
| json 数组内字符串含 `}` | brace 计数在 string 内已处理 escape | 加单元测试 |

---

## 6. 关闸记录

```
2026-06-25  npm run gate-check  → C1/C2/C3 全通过
```

---

*本文件为 13A 实施快照；架构级 world-init 优化见父蓝图 13B–13D。*
