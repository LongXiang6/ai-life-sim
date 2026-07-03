# 蓝图：命格系统个人修饰符统一化

> 状态：📋 规划中
> 创建：2026-07-02
> 关联：命格抽取速度优化、世界观判断逻辑清除

---

## 背景

### 问题

1. **速度不一致**：武道割据命格抽取约 60 秒，战锤40K 约 10 秒（6 倍差距）
2. **根因**：`resolveDestinyPatternPromptWorldMeta()` 根据世界观描述关键词判断 `looksCultivation`，导致注入不同数量的 modifier 字段
3. **设计冗余**：cultivation 世界注入 21 个字段（11 个人 + 10 世界），非 cultivation 世界注入 17 个字段（8 个人 + 9 世界）

### 用户决策

- **方向**：只保留个人层级字段，去除世界层级字段
- **原则**：命格天赋是个人特征，通过个人层面的连锁计算来影响世界
- **不需要向前兼容**

---

## 调研结论

### 校准 formulas 字段分类（43个）

| 层级 | 数量 | 说明 |
|------|------|------|
| 个人层级 | 11 | 与 DESTINY_PATTERN_PERSONAL_MODIFIERS 完全一致 |
| 世界层级 | 32 | 人口、战争、科技、经济等宏观字段 |

### 个人层级字段详细使用系统（11个）

| 字段 | 标签 | 使用系统 | 影响范围 |
|------|------|---------|---------|
| `luckPointModifier` | 气运获取 | LuckSystem | 疾病躲避、死亡回避、事件权重、衰老衰减 |
| `hpRecoveryModifier` | 生命恢复 | HealthSystem | HP 恢复速度 |
| `staminaRecoveryModifier` | 体力恢复 | HealthSystem | 体力恢复速度 |
| `breakthroughChanceModifier` | 寿命突破 | LifespanSystem | 寿命突破概率 |
| `cultivationSpeedModifier` | 修炼/战力成长 | CultivationSystem, CombatPowerSystem | 修炼速度、战力成长 |
| `bottleneckModifier` | 修炼瓶颈 | CultivationSystem | 修炼瓶颈概率 |
| `incomeModifier` | 职业收入 | WorkSystem | 职业收入 |
| `fertilityModifier` | 家族生育 | FamilySystem | 玩家家族生育 |
| `devotionGainModifier` | 虔诚获取 | FaithSystem | 信仰虔诚获取/衰减 |
| `lifespanModifier` | 寿命上限 | LifespanSystem | 寿命上限 |
| `attributeDecayModifier` | 属性衰减 | AttributeDecaySystem | 属性衰减速度 |

### 世界层级字段（32个，不适合命格）

| 字段 | 标签 | 使用系统 |
|------|------|---------|
| `populationModifier` | 人口 | PopulationSystem |
| `birthRateModifier` | 出生率 | PopulationSystem |
| `deathRateModifier` | 死亡率 | PopulationSystem |
| `warFrequencyModifier` | 战争频率 | NationRelationSystem |
| `techProgressModifier` | 科技进度 | CultureTechSystem |
| `economyModifier` | 宏观经济 | EconomySystem |
| ... | ... | ... |

**结论**：现有 11 个字段全部是个人层级，设计合理，无需精简。

---

## 执行计划

### 阶段一：清除世界观判断逻辑 ✅ 已完成

| 文件 | 修改内容 | 状态 |
|------|---------|------|
| `destiny-pattern-prompt-world-meta.ts` | 删除 cultivation 判断，统一返回个人向字段 | ✅ |
| `destiny-pattern-context.ts` | 移除 `worldModifierFields` 引用 | ✅ |
| `destiny-pattern-prompt.ts` | 更新 systemModifierRules，移除世界向描述 | ✅ |
| `fate-kv.ts` | 移除 `worldModifierFields` 键序 | ✅ |

### 阶段二：验证与测试（待执行）

| 步骤 | 验证内容 |
|------|---------|
| 1 | 运行 `npm run lint` 检查语法错误 |
| 2 | 运行 `npx tsc --noEmit` 检查类型错误 |
| 3 | 启动开发服务器，测试命格抽取功能 |
| 4 | 对比武道割据与战锤40K的抽取速度 |
| 5 | 验证 AI 生成的命格是否正确包含 systemModifiers |

### 阶段三：清理世界向字段常量（可选）

| 文件 | 修改内容 |
|------|---------|
| `constants.ts` | 标记 `DESTINY_PATTERN_WORLD_MODIFIERS` 为 deprecated 或删除 |
| `index.ts` | 清理相关导出 |

---

## 预期效果

| 指标 | 当前 | 优化后 |
|------|------|--------|
| 字段数量 | 17-21（不等） | 11（统一） |
| prompt 长度 | 长 | 短（-30%） |
| 生成速度 | 10-60s（波动大） | 预计 8-12s（稳定） |
| 世界观适配 | 硬编码判断 | AI 自主判断 |

---

## 风险评估

| 风险 | 影响 | 缓解措施 |
|------|------|---------|
| AI 生成不合理的 modifier | 命格数值失衡 | 通过 system prompt 规则引导 |
| 现有命格数据不兼容 | 无法加载旧存档 | 无需向前兼容（用户决策） |

---

## 关联文件

- [destiny-pattern-prompt-world-meta.ts](../../src/mods/mod-character/utils/destiny-pattern-prompt-world-meta.ts)
- [destiny-pattern-prompt.ts](../../src/mods/mod-character/prompts/destiny-pattern-prompt.ts)
- [destiny-pattern-context.ts](../../src/mods/mod-character/prompts/destiny-pattern-context.ts)
- [fate-kv.ts](../../src/mods/mod-character/utils/fate-kv.ts)
- [constants.ts](../../src/mods/mod-character/constants.ts)
