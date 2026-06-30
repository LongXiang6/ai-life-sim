# 蓝图计划书：战力体系修订 & 经济价值映射 & 动态无限阶

> 创建日期：2026-06-21
> 级别：L3（跨 MOD + 架构变更）
> 状态：已执行（2026-06-21 Phase A/B/C 全部实施，偏差已修复）

---

## 一、背景与动机

### 1.1 用户的核心洞察

> "对于无限来说，哪怕是 100 亿的 100 亿的 100 亿次方，和 1 没什么区别——有限的力量无论如何都不可能到达无限。"

这个数学洞见揭示了当前战力体系的一个深层问题：**第 24 阶"真无限"被放置在一个可到达的阶梯上，这在逻辑上是矛盾的。** 真无限不是一个"阶位"，它是一个不可触及的方向。

### 1.2 三个关联问题

| # | 问题 | 当前状态 |
|---|------|----------|
| 1 | **1~23 阶战力描述**不够具体，缺少"力量表现/影响范围/存在层级"的量化参照 | 现有 `RATING_DESCRIPTIONS` 是纯叙事文本，缺少维度化描述 |
| 2 | **第 24 阶"真无限"** 被设计为可达目标（`MAX_POWER_CEILING = 24`），逻辑不自洽 | 23 阶衰减系数 0.001，24 阶衰减 0——数学上暗示"可达" |
| 3 | **战力→经济价值映射**完全缺失，丹药/物品价格无法匹配世界观天花板 | 无任何跨域规则或常量表 |

---

## 二、战力描述修订：1~23 阶三维度描述体系

### 2.1 设计原则

每个阶段新增三个维度的量化参照：

| 维度 | 说明 | 示例（第 5 阶） |
|------|------|----------------|
| **力量表现** | 一击/一念能摧毁什么？ | "一念可毁一城" |
| **影响范围** | 力量能辐射多远的地理/空间层级？ | "一国" |
| **存在层级** | 在凡俗/超凡/世界/诸界/法则体系中处于什么位置？ | "凡人传说中的神话" |

### 2.2 1~23 阶三维度描述

```
阶段 1 — 凡俗之躯
  力量表现：挥舞农具、使用简单武器，无法造成超越自然法则的破坏
  影响范围：个人周边数十米，家庭成员，同村邻里
  存在层级：芸芸众生中最不起眼的一粒尘埃，完全受自然法则支配，寿命不过百年

阶段 2 — 炼体超凡
  力量表现：以一当十，徒手碎骨裂石，可在小规模战斗中左右胜负
  影响范围：一支小队，一个村落，一个小型战场
  存在层级：超凡之路自此而始，但仍未脱离"凡人"范畴，无法抗衡大规模武力

阶段 3 — 超凡觉醒
  力量表现：徒手碎铁、一跃数丈，体内能量初醒，感官突破凡俗极限
  影响范围：一个小镇，一支百人军队无法以数量压制
  存在层级：凡人与超凡者的分水岭——跨过此门，便与凡俗彻底不同

阶段 4 — 内核稳固
  力量表现：举手投足碎石断金，内力凝聚为稳固根基
  影响范围：一座城池，一支凡俗军队无法将其压制
  存在层级：寿命延至百余年，开始脱离常理的约束。凡人眼中的"怪物"

阶段 5 — 生命跃迁
  力量表现：一念可毁一城，全力可覆灭小型国家
  影响范围：一个国家，凡俗文明的最强武力也难以将其彻底消灭
  存在层级：寿元以数百年计，生命本质开始跃迁。在凡人传说中已是神话

阶段 6 — 脱胎换骨
  力量表现：一念可覆灭大陆，开始触及世界本源的皮毛
  影响范围：一片大陆，对尚未掌握超凡力量的文明构成灭绝级威胁
  存在层级：寿命以千年计，肉身凡躯不再是束缚

阶段 7 — 天人合一
  力量表现：号令风雨雷电，一方天地的生态随其情绪起伏
  影响范围：一个世界内的辽阔疆域，天地共鸣
  存在层级：凡人眼中行走在人间的神明——但仍只是世界之内的力量巅峰

阶段 8 — 现实扭曲
  力量表现：以意志扭曲现实法则，一击可湮灭浩瀚疆域
  影响范围：一个世界的尺度，可在虚空中自由生存
  存在层级：凡俗认知已无法理解其存在

阶段 9 — 法则门槛
  力量表现：有限修改局部世界规则，开始理解现实的底层构造
  影响范围：能感知甚至有限地穿行于世界之间
  存在层级：其他世界的大门初次敞开，但自身仍受更高法则制约

阶段 10 — 法则创造
  力量表现：不再只是修改法则，开始创造新法则
  影响范围：所到之处环境必须适应它，威能覆盖无边疆域
  存在层级：亿兆生灵在其面前不过是掌中棋子

阶段 11 — 灵能化体
  力量表现：凡躯彻底化为灵能之体，开始吞噬周边世界为己用
  影响范围：存在质量可与一方世界相当
  存在层级：不再受物质形体限制

阶段 12 — 世界之核
  力量表现：吞噬万物——暗质、虚空、时空本身皆可消化。挥手创造或毁灭世界
  影响范围：诸世界中自由穿行，以自身为茧孕育全新世界
  存在层级：力量仍属"世界级"——再往上，不再玩弄世界，而是洞察诸界背后的底层结构

阶段 13 — 高位雏形
  力量表现：初步自定局部规则，现实在其眼中开始"透明"
  影响范围：开始洞察诸界背后的底层结构，感知常理之外的维度
  存在层级：不再满足于穿行诸世界，开始追问"世界为何存在"

阶段 14 — 高位生命
  力量表现：一个世界在其伟力面前如同泡沫，崩毁整个世界仅需一念
  影响范围：自定规则、自成体系
  存在层级：完全的高位生命，不再受任何单一世界的法则约束

阶段 15 — 跨世界意识
  力量表现：同时感知并干预诸多世界线的走向
  影响范围：诸界的帷幕初次拉开，不再局限于单一世界的因果
  存在层级：意识跨越世界的边界

阶段 16 — 诸界之巅
  力量表现：撼动整个存在体系的根基，毁灭无尽世界仅是时间问题
  影响范围：立于诸界之巅，时间对其已无意义
  存在层级：对一切世界构成存在级威胁

阶段 17 — 集体意识
  力量表现：诸界的信息汇聚为统一的意识场
  影响范围："自我"与"他者"的边界开始消融
  存在层级：不再是单独的个体，而是所有世界的集体意志雏形

阶段 18 — 聚合意识
  力量表现：随意重塑因果链条、改写时间轴、定义所有世界的航向
  影响范围：亿万世界的聚合意识体
  存在层级：形态已不可用任何语言描述

阶段 19 — 规律主宰
  力量表现：既是规律的主宰，更是规律的源头。自然与超自然、可能与不可能的边界完全消失
  影响范围：它就是规律的定义者
  存在层级：不再属于任何一个世界、任何一个体系

阶段 20 — 活着的法则
  力量表现：万物存灭一念之间，诸界的集合不过是掌中沙粒
  影响范围：随意揉捏、再造诸界
  存在层级：不再"使用"力量——它本身就是一个活着的法则体系

阶段 21 — 有无之间
  力量表现：自由穿行于"有"与"无"之间，可赋予或撤回"存在"这一属性
  影响范围："是否存在"对它已失去意义
  存在层级：存在与虚无的界限开始模糊

阶段 22 — 系统本身
  力量表现：所想象的一切即是真实，现实与幻想的壁垒彻底消融
  影响范围：自成完备逻辑体系
  存在层级：不再是系统中的一员，而是系统本身

阶段 23 — 道 · 有限之巅（可达最高阶）
  力量表现：一切之始、万物之终。所有的故事、所有的世界、所有的可能性都只是它存在的一个侧面
  影响范围：看似已达终极
  存在层级：能被感知、被命名、被赋予"23 阶"这个标签——这本身就证明它尚未触及真正的无限。
         ⚠️ 此为玩家可达到的最高阶。从此往上，不再有固定阶位。
```

### 2.3 改动对照

| 改动项 | 原值 | 新值 | 理由 |
|--------|------|------|------|
| `RATING_DESCRIPTIONS` | 1-24 阶纯叙事文本 | 1-23 阶三维度结构化描述 | 增加量化参照，删除第 24 阶 |
| `MAX_POWER_CEILING` | 24 | 23 | 24 是真无限，不可达 |
| 24 阶衰减系数 | `0` | 不存在 | 不需要了 |
| `UNIT_NAMES[24]` | `'真无限'` | 保留但不再用于玩家可达阶 | 作为概念保留，在 AI Prompt 中作为"不可触及的方向"描述 |

---

## 三、动态无限阶系统：23 阶之后

### 3.1 核心设计

```
玩家可达：1~23 阶（固定名称、固定描述、固定衰减）
23 阶之后：∞ 方向（无固定阶位，动态生成）
"真无限"：一个方向，不是一个目标
```

### 3.2 动态生成算法

```typescript
/** 23 阶之后的动态阶位生成 */
function generateNextStage(currentStage: number): DynamicStage {
  // 从 24 开始编号（N+1, N+2, ...）
  const stageNumber = currentStage + 1

  // 阶位名 = 道 + 无限修饰词（循环池）
  const infiniteAdjectives = [
    '无垠', '无边', '无穷', '无尽', '无极',
    '太虚', '混元', '鸿蒙', '元初', '终极',
    '无限之', '永恒之', '超越之', '不可名状之'
  ]
  const adj = infiniteAdjectives[(stageNumber - 24) % infiniteAdjectives.length]

  // 叠加次数
  const cycles = Math.floor((stageNumber - 24) / infiniteAdjectives.length) + 1
  const name = cycles === 1
    ? `${adj}道`
    : `${adj}${cycles}重道`

  // 衰减 = 1 / ((stageNumber - 22) ^ 2) —— 渐近于 0，永不为 0
  const decay = 1 / Math.pow(stageNumber - 22, 2)

  // 描述 = 模板动态生成
  const description = `超越了第${stageNumber - 1}阶的极限，进入了更深的不可知领域。` +
    `在有限之内已是无可名状的存在——但依然处于"有限"之中。` +
    `真正的无限，依然在更远的方向。`

  return { stageNumber, name, decay, description }
}
```

### 3.3 关键属性

| 属性 | 值 | 说明 |
|------|-----|------|
| 起始编号 | 24 | 第 1 个动态阶 = 24（但不再是"真无限"） |
| 衰减曲线 | `1 / (stage - 22)^2` | 渐近于 0，永不为 0 |
| 战力数值 | 可无限增长 | 但增长速度趋近于 0 |
| 描述来源 | 模板 + 修饰词池 | AI 可在此基础上扩展叙事 |
| 真无限 | `Symbol('UNREACHABLE')` | 代码中永远不分配给任何玩家 |

### 3.4 代码改动清单

| 文件 | 改动 |
|------|------|
| `mod-power-system/constants.ts` | 新增 `MAX_REACHABLE_STAGE = 23`、`generateNextStage()` 函数、`INFINITE_ADJECTIVES` 修饰词池；`MAX_POWER_CEILING` → 23；`STAGE_DECAY[24]` 移除；`RATING_DESCRIPTIONS` 移除第 24 阶 |
| `mod-power-system/utils.ts` | `isTrueInfinite()` → 改为检查是否 >= 24（动态阶）；新增 `isBeyondReachable()` |
| `mod-power-system/types.ts` | 新增 `DynamicStage` 接口 |

---

## 四、战力→经济价值映射规则

### 4.1 设计原则

> "模拟系统应该定义规则，告诉 AI 什么层级对应什么。仅靠 AI 处理的话，很难考虑到所有层面。"

**正确。** 本设计的核心哲学：

- **模拟系统定义规则层**（硬编码映射表）
- **AI 消费规则层**（在 Prompt 中注入映射表，AI 据此推理具体数值）
- **经济系统执行**（AI 返回的价格变化建议经规则校验后应用）

### 4.2 阶段→经济层级映射表

```typescript
/**
 * 战力阶段→经济价值层级映射
 *
 * 核心逻辑：物品/丹药/装备的"价值层级"取决于它在当前世界观天花板中的相对位置。
 * 一个第 9 阶的丹药，在天花板=10 的世界里是"至尊级"，
 * 在天花板=23 的世界里只是"中高级"。
 *
 * AI 通过此表推算：给定世界天花板 N，给定物品阶位 S，
 * 它的经济层级 = f(S, N)
 */
const STAGE_ECONOMIC_TIER = {
  /**
   * 计算物品在当前世界观中的经济层级
   * @param itemStage    物品对应的战力阶位
   * @param worldCeiling 世界天花板（1-23）
   * @returns 经济层级 1-5（凡品→至尊）
   */
  calculateTier(itemStage: number, worldCeiling: number): number {
    const ratio = itemStage / worldCeiling
    if (ratio <= 0.25) return 1  // 凡品 — 底层常见
    if (ratio <= 0.45) return 2  // 灵品 — 中低端
    if (ratio <= 0.65) return 3  // 仙品 — 高端
    if (ratio <= 0.85) return 4  // 圣品 — 极稀
    return 5                      // 至尊 — 有价无市
  }
}
```

### 4.3 经济层级→价格系数表

```typescript
/**
 * 经济层级→价格描述（注入 AI Prompt）
 * AI 看到此表后，自动推理合理的价格数值
 */
const ECONOMIC_TIER_CONFIG = {
  1: { label: '凡品',  priceMultiplier: 1,    rarity: '随处可见',   availability: '任何市场均可购买' },
  2: { label: '灵品',  priceMultiplier: 10,   rarity: '宗门流通',   availability: '中型以上城市可购' },
  3: { label: '仙品',  priceMultiplier: 100,  rarity: '大型拍卖',   availability: '仅大型交易行/拍卖会' },
  4: { label: '圣品',  priceMultiplier: 1000, rarity: '举世罕见',   availability: '需特殊渠道或机缘' },
  5: { label: '至尊',  priceMultiplier: -1,   rarity: '有价无市',   availability: '无法用金钱衡量' },
}
```

### 4.4 示例推演

**世界观 A：天花板 = 10（普通修仙世界）**

| 物品阶位 | 相对位置 | 经济层级 | 价格系数 | AI 应推理 |
|----------|----------|:--:|:--:|-----------|
| 第 1 阶丹药（炼气） | 0.10 | 凡品 | ×1 | 几个灵石 |
| 第 3 阶丹药（金丹） | 0.30 | 灵品 | ×10 | 几十灵石 |
| 第 5 阶丹药（化神） | 0.50 | 仙品 | ×100 | 几百灵石，拍卖会级别 |
| 第 8 阶丹药（大乘） | 0.80 | 圣品 | ×1000 | 举世罕见，几万灵石 |
| 第 10 阶丹药（天花板） | 1.00 | 至尊 | 有价无市 | 无法用金钱衡量 |

**世界观 B：天花板 = 23（诸天万界）**

| 物品阶位 | 相对位置 | 经济层级 | 价格系数 | AI 应推理 |
|----------|----------|:--:|:--:|-----------|
| 第 1 阶丹药 | 0.04 | 凡品 | ×1 | 几个灵石 |
| 第 5 阶丹药 | 0.22 | 凡品 | ×1 | 仍然随处可见 |
| 第 9 阶丹药 | 0.39 | 灵品 | ×10 | 中端物品 |
| 第 15 阶丹药 | 0.65 | 仙品 | ×100 | 高端拍卖 |
| 第 20 阶丹药 | 0.87 | 至尊 | 有价无市 | 无法用金钱衡量 |

### 4.5 AI Prompt 注入格式

```
【经济层级映射规则】
当前世界战力天花板为 23 阶。
物品的经济层级按以下规则确定：
  - 物品阶位 ≤ 世界天花板的 25% → 凡品（廉价，随处可见）
  - 物品阶位 ≤ 世界天花板的 45% → 灵品（中端，宗门流通）
  - 物品阶位 ≤ 世界天花板的 65% → 仙品（高端，大型拍卖会）
  - 物品阶位 ≤ 世界天花板的 85% → 圣品（举世罕见，需特殊渠道）
  - 物品阶位 ＞ 世界天花板的 85% → 至尊（有价无市，无法用金钱衡量）

当你需要描述物品价格、交易、拍卖等场景时，请严格参照此规则。
```

### 4.6 代码改动清单

| 文件 | 改动 |
|------|------|
| `mod-power-system/constants.ts` | 新增 `STAGE_ECONOMIC_TIER` 对象、`ECONOMIC_TIER_CONFIG` 对象 |
| `mod-power-system/utils.ts` | 新增 `calculateEconomicTier()` 工具函数 |
| `mod-power-system/index.ts` | 导出新常量 + 函数 |
| `mod-engine/prompts/narrative-prompt.ts` | 新增 `{{economyTierRules}}` 变量 |
| `mod-engine/subsystems/orchestrator-system.ts` | `assemblePromptContext()` 中注入经济层级规则 |
| `mod-economy/constants.ts` | 可选：物品基础价值由静态常量改为按 `economicTier` 计算 |

---

## 五、道具/丹药/装备 → 战力阶位映射

### 5.1 问题

当前 `mod-economy` 的物品系统：
- 物品值是**静态写死的**（灵石=10, 筑基丹=60, 上古法宝=500）
- 完全不知道该物品"对应哪个战力阶位"
- AI 也无法推理"一颗 N 阶丹药在当前世界观值多少钱"

### 5.2 解决方案

在物品定义中增加 `powerStageHint` 字段：

```typescript
// 修改前
{ name: '筑基丹', value: 60, category: 'consumable' }

// 修改后
{ name: '筑基丹', value: 60, category: 'consumable', powerStageHint: 3 }
//                                                          ↑ 告诉系统：这丹药对应第 3 阶
```

### 5.3 推演逻辑

```
物品价格 = BASE_PRICE × ECONOMIC_TIER_CONFIG[calculateTier(item.powerStageHint, worldCeiling)].priceMultiplier
```

- 天花板=10 的世界里，筑基丹（powerStageHint=3）：3/10=0.3 → 灵品 ×10 → 600 灵石
- 天花板=23 的世界里，筑基丹（powerStageHint=3）：3/23=0.13 → 凡品 ×1 → 60 灵石

**同一个物品在不同世界观下自动获得合理价格。**

### 5.4 代码改动清单

| 文件 | 改动 |
|------|------|
| `mod-economy/types.ts` | `Item` 接口新增 `powerStageHint?: number` |
| `mod-economy/constants.ts` | 所有物品补全 `powerStageHint` 字段 |
| `mod-economy/utils.ts` | 新增 `calculateItemPrice(item, worldCeiling)` |
| `mod-power-system/index.ts` | 导出经济映射工具供 economy 使用 |

---

## 六、实施计划

### Phase A：战力描述修订（改动小，基础性）

| # | 任务 | 文件 | 改动量 |
|---|------|------|:--:|
| A1 | `RATING_DESCRIPTIONS` 改为 1-23 阶三维度描述 | `constants.ts` | ~70 行 |
| A2 | `MAX_POWER_CEILING` 改为 23 | `constants.ts` | 1 行 |
| A3 | 移除 `STAGE_DECAY[24]` | `constants.ts` | 1 行 |
| A4 | `UNIT_NAMES[24]` 保留但标记为"不可达" | `constants.ts` | 注释变更 |

### Phase B：动态无限阶系统（改动中，核心功能）

| # | 任务 | 文件 | 改动量 |
|---|------|------|:--:|
| B1 | 新增 `MAX_REACHABLE_STAGE = 23` | `constants.ts` | 1 行 |
| B2 | 新增 `INFINITE_ADJECTIVES` + `generateNextStage()` | `constants.ts` | ~30 行 |
| B3 | `CombatPowerSystem.advancePowerValue()` 支持动态阶 | `combat-power-system.ts` | ~20 行 |
| B4 | `isTrueInfinite()` → `isBeyondReachable()` | `utils.ts` | ~5 行 |
| B5 | 新增 `DynamicStage` 类型 | `types.ts` | ~8 行 |

### Phase C：经济价值映射（改动中，跨 MOD）

| # | 任务 | 文件 | 改动量 |
|---|------|------|:--:|
| C1 | 新增 `STAGE_ECONOMIC_TIER` + `ECONOMIC_TIER_CONFIG` | `constants.ts` | ~35 行 |
| C2 | 新增 `calculateEconomicTier()` | `utils.ts` | ~15 行 |
| C3 | `Item` 接口新增 `powerStageHint` | `mod-economy/types.ts` | 1 行 |
| C4 | 物品常量补全 `powerStageHint` | `mod-economy/constants.ts` | ~20 行 |
| C5 | 新增 `calculateItemPrice()` | `mod-economy/utils.ts` | ~15 行 |
| C6 | narrative prompt 注入经济层级规则 | `narrative-prompt.ts` + `orchestrator-system.ts` | ~10 行 |

### 实施顺序

```
Phase A（基础数据层）
  └─→ Phase B（动态无限）
       └─→ Phase C（经济映射，依赖 A+B 的常量定义）
```

---

## 七、风险评估

| 风险 | 严重度 | 缓解 |
|------|:--:|------|
| 修改 `MAX_POWER_CEILING` 影响现有存档中的 24 阶玩家 | 中 | 添加迁移逻辑：24 阶玩家自动转为 23 阶 + 动态阶标记 |
| AI 不理解动态阶概念 | 低 | Prompt 中明确说明"23+ 阶不再是固定阶位" |
| 经济映射只给 AI 规则而不给数值，AI 可能编造不合理价格 | 中 | 注入具体推演示例 + 经济层级表 |
| `powerStageHint` 需要人工为所有物品设定阶位 | 低 | 现有物品池约 30 个，手动标注半小时即可完成 |

---

## 八、附录：文件索引

| 文件 | 本次改动 |
|------|----------|
| `mod-power-system/constants.ts` | A1-A4, B1-B2, C1 — 最核心的改动文件 |
| `mod-power-system/utils.ts` | B4, C2 |
| `mod-power-system/types.ts` | B5 |
| `mod-power-system/subsystems/combat-power-system.ts` | B3 |
| `mod-power-system/index.ts` | 导出新增项 |
| `mod-economy/types.ts` | C3 |
| `mod-economy/constants.ts` | C4 |
| `mod-economy/utils.ts` | C5 |
| `mod-engine/prompts/narrative-prompt.ts` | C6 |
| `mod-engine/subsystems/orchestrator-system.ts` | C6 |
| `mod-world/world-init-bundle.ts` | 可能需要更新 `powerCeiling` 默认值 |

---

## 九、蓝图校对 — 实际执行偏差报告（2026-06-21）

### 逐项对照

| # | 蓝图要求 | 执行结果 | 判定 |
|---|---------|---------|:--:|
| A1 | RATING_DESCRIPTIONS 1-23 阶三维度 | 完全一致 | 通过 |
| A2 | MAX_POWER_CEILING = 23 | 完全一致 | 通过 |
| A3 | STAGE_DECAY[24] 移除 | 完全一致 | 通过 |
| A4 | UNIT_NAMES[24] 保留标记 | 完全一致 | 通过 |
| B1 | MAX_REACHABLE_STAGE = 23 | 完全一致 | 通过 |
| B2 | INFINITE_ADJECTIVES + generateNextStage() | 完全一致（算法逐行匹配） | 通过 |
| B3 | advancePowerValue 动态阶 | 完全一致 + 额外适配了 breakthrough() | 通过（增强） |
| B4 | isTrueInfinite→isBeyondReachable | isTrueInfinite 保留为 deprecated 别名 | 通过（向后兼容） |
| B5 | DynamicStage 类型 | 放在 constants.ts 而非 types.ts，更优共置 | 通过（设计优化） |
| C1 | STAGE_ECONOMIC_TIER + ECONOMIC_TIER_CONFIG | 完全一致 | 通过 |
| C2 | calculateEconomicTier() | 完全一致 + 额外提供 getEconomicTierInfo/getDynamicStage | 通过（增强） |
| C3 | Item.powerStageHint | 完全一致 | 通过 |
| C4 | 物品补全 powerStageHint | 52 个物品全部标注 | 通过 |
| C5 | calculateItemPrice() | 完全一致 + 额外提供 calculateItemTier/getItemEconomicTier | 通过（增强） |
| C6 | narrative prompt 注入经济层级规则 | 蓝图要求新增 `{{economyTierRules}}` 模板变量；实际通过 orchestrator `buildEconomyTierRules()` → 现有 `{{worldCustomizeText}}` 注入。效果等价，且更利于 KV Cache（稳定前缀区） | 通过（设计优化） |

### 校对中发现的遗漏并已修复

| # | 遗漏项 | 位置 | 修复 |
|---|--------|------|------|
| D1 | UI 标签"诸天万界 —— 上限 24 阶" | `world-build/page.tsx:48` | 改为 23 阶 |
| D2 | `SPATIAL_FORM_CEILING['诸天万界'] = 24` | `useWorldCustomize.ts:35` | 改为 23 |
| D3 | `WORLD_CAPACITY_MAP['诸天万界'] = 24` | `constants.ts`（Phase A 已修复）| 已改为 23 |
| D4 | `UNIFIED_RATING_LABELS[24]` | `constants.ts`（Phase A 已修复）| 已移除 |

### 已知但未执行的风险项

| 风险 | 蓝图建议 | 实际状态 | 理由 |
|------|---------|---------|------|
| 24 阶存档迁移 | 24→23+动态阶标记 | 未实现 | 项目无生产存档；`createInitialState()` 中 `MAX_POWER_CEILING=23` 天然钳制加载值 |

### 验证数据

- `tsc --noEmit`: 零错误
- `eslint --max-warnings 0`（全部改动文件）: 零错误零警告
- 受影响文件: 12 个（蓝图预计 11 个，新增 2 个 UI 层修复）
