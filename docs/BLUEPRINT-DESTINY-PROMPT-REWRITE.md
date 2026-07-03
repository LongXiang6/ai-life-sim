# 命格 Prompt 示例化改造 — 实施计划

> 关联 demo: [`logs/ai-debug/talent-generate/_NEW_PROMPT_DEMO.log`](../logs/ai-debug/talent-generate/_NEW_PROMPT_DEMO.log)

---

## 一、目标

将命格生成的 system prompt 从**规则驱动 JSON** 改造为**示例驱动纯文本**，同步精简 user prompt 去掉校准依赖，使命格抽取可独立触发（不等世界校准管线）。

### 改动前后对比

| | 改前 | 改后 |
|---|------|------|
| system 格式 | `stringifyPrompt({role, task, ...})` JSON | 纯文本字符串 |
| system 规模 | ~3000 tokens（10+ 个 JSON section） | ~1800 tokens（14 条示例 + 1 个注释块） |
| user 字段数 | 16 个 | 3 个 |
| messages 数 | 3 | 1（system）+ 1（user）|
| 校准依赖 | coherenceHint/calibrationSummary/worldTags | 无 |
| type 字段 | prompt 说"必须"，代码不消费（矛盾） | 清除矛盾 |

---

## 二、涉及文件

### 修改

| 文件 | 改动 |
|------|------|
| `src/mods/mod-character/prompts/destiny-pattern-prompt.ts` | 替换 system prompt 生成逻辑，`stringifyPrompt()` → 纯字符串常量 |
| `src/mods/mod-character/prompts/destiny-pattern-context.ts` | 精简 `buildDestinyPatternUserPrompt()`，移除校准依赖字段 |
| `src/mods/mod-character/constants.ts` | 确认 `DESTINY_PATTERN_PERSONAL_MODIFIER_META` 无需改动（标签已对齐） |
| `src/mods/mod-pages/pages/talent-draw/page.tsx` | 移除校准数据读取（不再传入 calibration/worldTags） |

### 不动

| 文件 | 原因 |
|------|------|
| `src/mods/mod-character/subsystems/destiny-pattern-system.ts` | 解析/生成管线不变 |
| `src/mods/mod-character/utils/fate-kv.ts` | KV 重排逻辑不变（字段变少自然重排） |
| `src/mods/mod-world/store.ts` | 世界 store 不变 |

---

## 三、详细改动

### 3.1 `destiny-pattern-prompt.ts` — system prompt 全局替换

**现状**（第 51-152 行）：`DESTINY_PATTERN_SYSTEM_PROMPT_SCHEMA` 对象 → `stringifyPrompt()` 输出 JSON。

**改为**：一个纯字符串常量 `DESTINY_PATTERN_SYSTEM_PROMPT`。

```
是你命格、天赋与特质生成器。根据世界观和角色信息，生成 20 条命格、天赋或特质。
输出格式：{"patterns":[{...},...]}，每条一行紧凑 JSON，不格式美化、不 markdown 代码块。

/*
字段: name(2-8字) rarity polarity description(50-120汉字,微叙事体)...
属性上限: common±1单属 fine±2或双±1 rare≤3 epic≤5 legendary≤7
systemModifier可用字段: luckPointModifier(气运获取) hpRecoveryModifier(生命恢复) ...
*/

// 现代都市 — common
{"patterns":[{...}, {...}, {...}]}

// 星际科幻 — fine + rare
{"patterns":[...]}

// 仙侠修真 — rare/epic/legendary + systemModifiers
{"patterns":[...]}

// 奇幻神权 — epic/legendary
{"patterns":[...]}
```

**要点**：
- 删除 `stringifyPrompt()` 调用
- 删除 `DESTINY_PATTERN_SYSTEM_PROMPT_SCHEMA` 中的 `role/task/narrativeStyle/outputFormat/outputSchema/typeDistribution/temporalRules/lengthRequirements/systemModifierRules/rarityDistribution/polarityDistribution/designRequirements` 所有字段
- 删除 `"每条必须含 type 字段"`（代码不一致，见 3.1.1）
- 14 条示例从 demo 直接复制
- system prompt 末尾不需要 `\n` 或额外空格（callAI 内部处理）

#### 3.1.1 清除 type 字段返回要求 （只改 prompt，不动代码）

代码全程不消费 `type` 字段（接口/解析/Zod schema 均为 optional），但当前 system prompt 仍在 `designRequirements` 最后一条要求「每条必须含 type 字段」。改造时同时删除该要求。

**不改 Zod schema**（`type: z.enum([...]).optional()` 保持不动，向后兼容）。

### 3.2 `destiny-pattern-context.ts` — user prompt 精简

**现状**（`buildDestinyPatternUserPrompt()` 第 96-145 行）：16 个字段。

**改为**：

```ts
export function buildDestinyPatternUserPromptKv(input: BuildDestinyPatternContextInput): string {
  const cfg = input.worldConfig
  const obj: Record<string, unknown> = {
    worldName: cfg?.name ?? '未知世界',
    worldDescription: cfg?.description?.trim() || '（无详细描述）',
    character: buildCharacterString(input.character),
  }
  return stringifyPrompt(obj)
}

function buildCharacterString(char: { name?: string; race?: string; gender?: string; background?: string }): string {
  const parts: string[] = []
  if (char.name)       parts.push(`姓名=${char.name}`)
  if (char.race)        parts.push(`种族=${char.race}`)
  if (char.gender)      parts.push(`性别=${char.gender}`)
  if (char.background)  parts.push(`背景=${char.background}`)
  return parts.join('，')
}
```

**移除的字段**：

- `coherenceHint` — 世界初始化框架文本，命格生成不需要
- `calibrationSummary` — 校准数据依赖，移除后命格可独立触发
- `worldTags` — 同上
- `powerSystemTag / civilizationStage / spatialForm / powerCeiling` — worldDescription 已传达
- `personalModifierFields` — 已移入 system prompt 注释
- `startingAge` — 命格是先天特质，无关年龄
- `instruction / requirements` — 已在 system prompt 中
- `existingNames` — 需保留为动态追加字段（见 3.4）
- `essenceTag` — 已从 demo 移除（worldDescription 即可传达世界观类型）

### 3.3 `talent-draw/page.tsx` — 去掉校准数据读取

**现状**（第 540-552 行）：

```ts
const result = await getDestinyPatternSystem().generateWithAI({
  worldConfig: useWorldStore.getState().worldConfig,
  calibration: useWorldStore.getState().calibration,
  worldTags: useWorldStore.getState().worldTags,
  character: { ... },
  existingNames: [],
})
```

**改为**：

```ts
const result = await getDestinyPatternSystem().generateWithAI({
  worldConfig: useWorldStore.getState().worldConfig,
  calibration: undefined,  // 不再依赖校准
  worldTags: undefined,    // 不再依赖世界标签
  character: { ... },
  existingNames: [],
})
```

### 3.4 `existingNames` 处理（批量去重）

`existingNames` 在批量生成时逐步累积，需跨批次追加到 prompt。改造方案：

```
第 1 批: user prompt 不含 existingNames
第 2 批: 追加 [user[2]] {"existingNames":"重力记忆,方向失语,..."}
第 3 批: 同上，追加更多
```

**实现位置**：`talent-draw/page.tsx` 的批量循环中，在 `existingNames` 非空时使用 `callAI(systemPrompt, [userPrompt, user2Prompt].join('\n'))` 或追加 `messages.push({ role: 'user', content: ... })`。

**不改 `destiny-pattern-context.ts`**，因为 `existingNames` 是调用侧控制的动态参数，不是 prompt 构建函数的职责。

---

## 四、走查清单

- [ ] `destiny-pattern-prompt.ts`: 替换 system prompt 为纯字符串常量
- [ ] `destiny-pattern-prompt.ts`: 清除 `"每条必须含 type 字段"` 要求
- [ ] `destiny-pattern-context.ts`: 精简 `buildDestinyPatternUserPrompt` 为 3 字段
- [ ] `talent-draw/page.tsx`: 移除 calibration/worldTags 传入
- [ ] `talent-draw/page.tsx`: 确认 `existingNames` 追加逻辑
- [ ] `npm run lint` 通过
- [ ] `npx tsc --noEmit` 通过
- [ ] 浏览器测试：角色创建 → 命格抽取，观察响应时间
- [ ] 浏览器测试：确认现有质量门禁（passesContentQuality/rejectsFutureDestinyPatternContent）正常触发
- [ ] 浏览器测试：确认 systemModifier 校验正常（validatePatternSystemModifiers）
- [ ] 检查 console 无异常

---

## 五、风险

| 风险 | 概率 | 缓解 |
|------|:--:|------|
| 去掉 worldTags/coherenceHint 后 AI 生成偏离世界观 | 低 | worldDescription 已传达世界观，14 条示例覆盖 4 种世界类型 |
| system prompt 示例引导 AI 输出仙侠命格到现代世界 | 低 | 示例注释标明了世界观分组，AI 理解"参考对应世界" |
| 去掉 calibrationSummary 后人口基数等信息缺失 | 极低 | 命格描述不涉及人口数字 |
| 14 条示例增加 system prompt token 消耗 | — | system prompt 被 DeepSeek 缓存（89% 命中率），只计一次 |

---

## 六、不改的部分

| 项目 | 原因 |
|------|------|
| Zod outputSchema | `type: z.enum([...]).optional()` 保持 optional |
| `parseAIResponse` / `ingestItem` | 解析管道不变 |
| `passesContentQuality` / 质量门禁 | 不变 |
| `fate-kv.ts` KV 重排 | 字段少自然重排，逻辑不变 |
| `world-init-pipeline.ts` | 世界初始化管线完全独立 |
