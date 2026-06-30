# 蓝图 v5：AI 全系统世界校准

> 状态：**Phase 5 完成** | 实施完成：2026-06-24 | 版本：v5.6 + [Phase 5 蓝图](./BLUEPRINT-AI-METADATA-PHASE5.md) v6.3

---

## 1. 现状全景

### 1.1 项目规模

| 维度 | 数量 |
|------|------|
| MOD 总数（manifest） | **18**（其中 14 个含模拟子系统，4 个为 UI/页面/设置/地图壳层） |
| ISubSystem 实现 | 74 |
| 有数学公式/模拟计算的子系统 | **~28** |
| constants.ts 硬编码文件 | 14 |
| 硬编码数值参数（概率/乘数/阈值/速率） | **~200 个** |
| 本蓝图 Phase 1–4 纳入校准 | **50 参数 + 1 策略** |
| Phase 4 Defer（不新增字段） | **0 项**（family 方案 A、fortune 去重均已完成，见 Phase 5） |

### 1.2 各 MOD 子系统分布

```
【模拟核心 MOD — 14 个】
mod-character     (6子系统, 6有计算)  ← 属性/生命/寿命/衰减/道德/命格
mod-economy       (5子系统, 4有计算)  ← 经济/人口/工作/物品/定居
mod-politics      (7子系统, 6有计算)  ← 阶层/派系/国家关系/法律/冲突/价值观
mod-power-system  (11子系统,10有计算) ← 战力/修炼/信仰/运气/怪物/…
mod-env-ecology   (5子系统, 5有计算)  ← 生态/污染/资源/气候/地理
mod-tech-level    (2子系统, 2有计算)  ← 科技/产业
mod-culture       (10子系统,5有计算)  ← 教育 literacyGrowth（Phase 4A ✅）
mod-base-universe (4子系统, 2有计算)  ← 天体/地图/纪元/预言（仅 mapTemplate 纳入 L1）
mod-world         (3子系统, 3有计算)  ← 世界初始化/时间线/实体
mod-engine        (13子系统, 4有计算) ← 编排/跨域规则/记忆/叙事解析
mod-difficulty    (纯配置)            ← 4档难度参数表（与校准叠加，见 §9）
mod-history-dynamics (2子系统)        ← 因果模拟/事件池（Phase 4 候选）
mod-npc           (3子系统)           ← NPC 行为/属性/记忆（排除，玩家局内）
mod-golden-finger (1子系统)           ← 金手指（排除，玩家向）

【非模拟 MOD — 4 个，不参与校准】
mod-pages / mod-ui / mod-settings / mod-world-map
```

### 1.3 三层校准模型

```
Level 1 — 数据替换          例：populationBase 查表 500 → AI 输出 50
  查表值 / 数量范围 → AI 提供新值（不修改 constants.ts 本身）

Level 2 — 公式系数调参       例：birthRate = BASE_BIRTH_RATE(0.03) × birthRateModifier
  modifier 乘法注入已有公式；默认 1.0 时行为与现网完全一致

Level 3 — 策略选择           例：eventDistributionStrategy = "prehistoric"
  从预定义策略 enum 中选择，驱动权重表 / 风格注入，非自由文本
```

**全局 modifier 硬限制**（子系统接入时统一 clamp）：

```ts
const mod = clamp(rawValue, 0.01, 100)
```

---

## 2. 数据流与现有 4 路 AI 的职责边界

### 2.1 调用顺序（Step 0 必须最先）

```
用户提交 WorldConfig（5 维度 + 描述 + 难度）
         │
         ▼
┌─ Step 0: world-calibration-prompt ─────────────────────────┐
│  输入：WorldConfig 全字段 + 难度档                           │
│  输出：WorldCalibration JSON（稀疏：仅非默认字段）            │
│  职责：模拟数值校准 — modifiers / 数量级 / 策略 enum          │
└──────────────────────────┬───────────────────────────────────┘
                           │ useWorldStore.setCalibration()
                           ▼
┌─ Step 1–4: 现有 4 路 AI（顺序不变）─────────────────────────┐
│  W03 标签   → 叙事氛围标签（5–8 个字符串）                    │
│  W02 配置   → 叙事/UI 向 40+ 描述字段（见 §2.2 边界）         │
│  W05 时间线 → 事件标题/描述（骨架已由 Timeline 本地生成）      │
│  W06 实体   → 国家/势力/贵族/定居点/商路名称与描述            │
└──────────────────────────┬───────────────────────────────────┘
                           ▼
              commitWorldInitialization + round loop
              各子系统 getCalibration() → formulas.*Modifier
```

### 2.2 与 W02 world-config-prompt 的职责边界

| 维度 | Step 0 校准 | W02 配置 Prompt |
|------|------------|----------------|
| 目的 | 驱动**模拟公式** | 驱动**叙事描述与 UI 展示** |
| 数值 | `formulas.*Modifier`、`populationBase` | `techLevel`、`inflationRate`（0–100 描述尺度） |
| 重叠字段 | 禁止 W02 覆盖校准结果 | W02 的 `socialMobility` 等为**叙事参考**，不写入 store.calibration |
| 消费方 | 子系统 `advance()` | 叙事 Prompt / 面板展示 |

**规则**：Step 0 完成后，将 `calibration.metadata` 与关键 `formulas` 摘要注入 W02/W05/W06 的 userPrompt 作为**只读上下文**，后续 AI 不得修改校准 JSON。

### 2.3 持久化

| 项 | 存储位置 |
|----|---------|
| `WorldCalibration` | `useWorldStore.calibration` + 存档 `saveStore`（键：`mod-world:calibration:{worldCode}`） |
| 默认值缺失 | 子系统侧 `?? 1.0`（L2）或查表默认（L1） |
| 难度变更 mid-game | 不重新调用 Step 0；仅 `mod-difficulty` 乘数实时叠加（§9） |

---

## 3. 全系统可校准参数清单

> 完整 AI 填值约束见 **§5 字段字典**；世界观→参数方向见 **§6 决策规则表**。

### 3.1 mod-world（v3 遗留 + 扩展）— 13 L1 + 3 L2 + 1 L3

| 字段路径 | 类型 | 默认 | 公式 / 作用 |
|----------|------|------|------------|
| `metadata.*` | L1 | 来自 WorldConfig | 回写确认，不独立生成 |
| `styleGuide.worldviewStyleHint` | L3 文本 | 查 `WORLDVIEW_STYLE_HINTS[essenceTag]` | 注入 W05 时间线 Prompt |
| `styleGuide.narrativeTone` | L3 文本 | — | 叙事语气（≤50 字） |
| `styleGuide.eventTypeWeights` | L3 权重 | 均匀 | 25 种 `WorldTimelineEventType` 的相对权重 |
| `timeline.eraStartYear` | L1 | 用户输入 | 纪元起始年 |
| `timeline.stageSpan` | L1 | `10000` | 每阶段跨度（年） |
| `timeline.impactDistribution` | L3 enum | `"balanced"` | 见 §5.3 |
| `entities.nationCount` 等 | L1 范围 | 见 `ENTITY_GENERATION_COUNTS` | 实体生成数量 |
| `world.populationBase` | L1 | `CIV_POPULATION_BASE[civStage]` | `calcPopulation(base × populationModifier × terrainMult)` |
| `world.developmentRange` | L1 | `CIV_DEVELOPMENT_RANGE[civStage]` | 区域开发度随机范围 |
| `world.mapTemplate` | L1 enum | 按 spatialForm 推断 | 见 §5.4 |
| `world.regionCount` | L1 | 模板默认 | 覆盖 `MAP_TEMPLATES[id].regionCount` |
| `formulas.populationModifier` | L2 | 1.0 | 人口基数乘数 |
| `formulas.developmentModifier` | L2 | 1.0 | 开发度乘数 |
| `formulas.impactRangeModifier` | L2 | 1.0 | `triggerRange × modifier`（9 级影响） |
| `formulas.eventDistributionStrategy` | L3 enum | `"balanced"` | 见 §5.3，调整 `pickImpactForYear` 权重 |
| `formulas.economyTierRatios` | L1 | `[0.25,0.45,0.65,0.85,1.0]` | 5 档经济层级相对天花板比例 |
| `formulas.economyModifier` | L2 | 1.0 | 跨域经济类效果 + 叙事经济活跃度参考 |

### 3.2 mod-economy — 6 L2

| 字段 | 默认 | 公式 | 子系统 |
|------|------|------|--------|
| `birthRateModifier` | 1.0 | `BASE_BIRTH_RATE(0.03) × modifier` | population |
| `deathRateModifier` | 1.0 | `BASE_DEATH_RATE(0.025) × modifier` | population |
| `inflationModifier` | 1.0 | 各市场阶段 delta × modifier | economy |
| `tradeMultiplierModifier` | 1.0 | `(0.6 + avgProsperity/100×0.8) × modifier` | economy |
| `migrationRateModifier` | 1.0 | `clamp(mobilityIndex × 0.3 × modifier, 0.02, 0.3)` | population |
| `incomeModifier` | 1.0 | `PROFESSION_BASE × levelMod × satisfactionMod × modifier` | **work**（玩家职业） |

### 3.3 mod-character — 5 L2

| 字段 | 默认 | 公式 |
|------|------|------|
| `hpRecoveryModifier` | 1.0 | `physique × RECOVERY_COEFF × modifier` |
| `staminaRecoveryModifier` | 1.0 | `physique × 2 × modifier` |
| `lifespanModifier` | 1.0 | `种族寿命 × 世界观修正 × modifier` |
| `attributeDecayModifier` | 1.0 | `种族衰减表 × modifier` |
| `breakthroughChanceModifier` | 1.0 | `BREAKTHROUGH_BASE_CHANCE(0.3) × modifier` |

### 3.4 mod-power-system — 6 L2

| 字段 | 默认 | 公式 |
|------|------|------|
| `cultivationSpeedModifier` | 1.0 | `BASE_POWER_GAIN(200) × stageDecay × modifier` |
| `bottleneckModifier` | 1.0 | `BOTTLENECK_CHANCES[i] × modifier` |
| `monsterThreatModifier` | 1.0 | `(baseThreat + penalties) × modifier` |
| `monsterSpawnModifier` | 1.0 | `SPAWN_FREQUENCY_BASE × modifier` |
| `luckPointModifier` | 1.0 | 运气四维每点标准值 × modifier |
| `devotionGainModifier` | 1.0 | 虔诚 `+delta×mod` / 衰减 `1/mod`；突破加成 `1+devotion/100×0.3×mod` |

### 3.5 mod-politics — 6 L2

| 字段 | 默认 | 公式 | 方向 |
|------|------|------|------|
| `socialMobilityModifier` | 1.0 | `mobilityRate × 0.005 × modifier` | ↑ 流动更快 |
| `factionEmergenceModifier` | 1.0 | `0.03 × modifier` | ↑ 新派系更多 |
| `warFrequencyModifier` | 1.0 | `tensionThreshold = 80 / modifier` | ↑ 阈值更低，**更易开战** |
| `warDamageModifier` | 1.0 | `(3 + rand(0,5)) × modifier` | ↑ 消耗更大 |
| `legalEnforcementModifier` | 1.0 | `(0.3 + enforcement/100×1.2) × modifier` | ↑ 执法更严 |
| `conflictEscalationModifier` | 1.0 | `min(1, phaseEventChance × modifier)` | ↑ 冲突周期事件更频繁（**enabled 时**） |

### 3.6 mod-environment-ecology — 4 L2

| 字段 | 默认 | 公式 |
|------|------|------|
| `ecologyRecoveryModifier` | 1.0 | `BASE_RECOVERY(0.5) × modifier` |
| `pollutionDecayModifier` | 1.0 | `NATURAL_DECAY(1.5) × modifier` |
| `resourceConsumptionModifier` | 1.0 | 资源消耗 × modifier |
| `disasterFrequencyModifier` | 1.0 | 气候系统灾害概率 × modifier |

### 3.7 mod-tech-level — 3 L2

| 字段 | 默认 | 公式 |
|------|------|------|
| `techProgressModifier` | 1.0 | `(BASE(0.03) + bonuses) × modifier` |
| `techBreakthroughModifier` | 1.0 | `0.04 × modifier` |
| `industryProductivityModifier` | 1.0 | `(1 + tech/100×0.5 + res/100×0.3) × modifier` |

### 3.8 mod-culture — 1 L2（Phase 4A）

| 字段 | 默认 | 公式 |
|------|------|------|
| `literacyGrowthModifier` | 1.0 | `(access×0.15 + institutionBonus×0.05) × modifier` |

> 与 `techProgressModifier`（culture-tech 科技等级）语义分离：前者管 **education-system 识字率增长**，后者管 **culture-tech 文明科技进度**。

### 3.9 mod-engine — 1 L1 + 1 L2

| 字段 | 默认 | 公式 |
|------|------|------|
| `economyTierRatios` | `[0.25,0.45,0.65,0.85,1.0]` | 5 元素，单调递增，末项 = 1.0 |
| `crossDomainEffectModifier` | 1.0 | 11 条跨域规则全部数值效果 × modifier |

### 3.10 mod-history-dynamics — 1 L2（Phase 4C）

| 字段 | 默认 | 公式 |
|------|------|------|
| `causalCaptureRate` | 1.0 | 正则匹配后：`rate≤1` 时概率门；`rate>1` 时 decade/30y cap × rate |

> 不改变正则规则本身；仅调节「匹配后是否入库」与频率上限。

---

## 4. 汇总：可适配系统一览

```
                    Level 1      Level 2      Level 3
                    数据替换      公式系数      策略选择
                    ────────     ────────     ────────
mod-world           ████████     ████████     ████████
  WorldInit          5 参数        2 参数         ─
  Timeline           2 参数        1 参数        2 策略
  Entity             5 参数         ─            ─

mod-economy           ─           6 参数         ─
  Population          ─           出生/死亡/迁移    ─
  Work                ─           incomeModifier ─

mod-character         ─           5 参数         ─
mod-power-system      ─           6 参数         ─
mod-politics          ─           6 参数         ─
mod-env-ecology       ─           4 参数         ─
mod-tech-level        ─           3 参数         ─
mod-culture           ─           1 参数         ─
  Education           ─           literacyGrowth ─
mod-history-dynamics  ─           1 参数         ─
  CausalSimulation    ─           causalCaptureRate ─

mod-engine            1 参数       2 参数         ─
  Orchestrator        economyTierRatios  economyModifier
  CrossDomain              ─       crossDomainEffectModifier
                      ─────────────────────────────
合计                  13 参数      36 参数       3 策略项
                    ============ 50 个可校准参数 ============
```

---

## 5. AI 字段字典（命名 / 类型 / 范围 / 公式）

> **本节是 `world-calibration-prompt.ts` systemPrompt 的核心来源。**
> AI 必须严格使用下列 **camelCase 字段名**；禁止自造字段、禁止 snake_case、禁止嵌套路径拼写错误。

### 5.1 通用规则

| 规则 | 说明 |
|------|------|
| 输出格式 | 纯 JSON 对象，`responseFormat: json_object` |
| 稀疏输出 | **仅输出与默认值不同的字段**；省略 = 默认 |
| 禁止内容 | markdown 代码块、注释、解释性文字、占位符字符串（如「国家名称」） |
| 数值精度 | modifier 保留 2 位小数；整数 L1 字段为整数 |
| 校验 | 服务端 Zod parse → clamp → 失败重试（最多 3 次）→ 全默认降级 |

### 5.2 metadata（必填，与 WorldConfig 对齐）

| 字段名 | 类型 | 合法值 / 来源 |
|--------|------|--------------|
| `essenceTag` | string | `cultivation` `wuxia` `scifi` `westernFantasy` `easternFantasy` `modern` `postApocalyptic` `survivalHorror` `steampunk` `lovecraftian` `mythological` `historical` `materialist` |
| `civilizationStage` | string | `primitive` `ancient` `medieval` `renaissance` `industrial` `modern` `information` `space` |
| `powerSystemTag` | string | `cultivation` `technology` `magic` `faith` `bloodline` `none` 等（与创世界 UI 一致） |
| `spatialForm` | string | `plane` `universe` `crystalSphere` `multiverse` `omniverse` |
| `difficulty` | string? | `normal` `hard` `nightmare` `hell` |

**文明阶段默认人口基数**（AI 仅在需要覆盖时输出 `world.populationBase`）：

| civilizationStage | 默认 populationBase |
|-------------------|---------------------|
| primitive | 50 |
| ancient | 200 |
| medieval | 1000 |
| renaissance | 3000 |
| industrial | 10000 |
| modern | 50000 |
| information | 100000 |
| space | 500000 |

### 5.3 策略 enum（Level 3）

**`formulas.eventDistributionStrategy`** — 调整时间线骨架影响级别权重：

| 值 | 含义 | modifier 方向提示 |
|----|------|-------------------|
| `balanced` | 默认，等同现网 `pickImpactForYear` | 全部 modifier ≈ 1.0 |
| `prehistoric` | 琐事/局部为主，几乎无国家级 | `impactRangeModifier` 0.3–0.8；低 `warFrequencyModifier` |
| `political` | 国家/区域/战争类权重提升 | `warFrequencyModifier` 1.5–3.0 |
| `cosmic_epic` | 宇宙/无限级事件权重提升 | `impactRangeModifier` 2.0–5.0 |
| `apocalyptic` | 灾难/瘟疫/灭绝类型权重提升 | `disasterFrequencyModifier` 2.0–5.0；`deathRateModifier` 1.5–3.0 |
| `mystical` | 预言/天象/灵气类权重提升 | 力量系 modifier 偏高 |

**`timeline.impactDistribution`** — 与 strategy 同 enum 集合；二者应一致，若冲突以 `eventDistributionStrategy` 为准。

### 5.4 mapTemplate enum（Level 1）

| 值 | 默认 regionCount | 适用 spatialForm |
|----|-----------------|-----------------|
| `continent` | 12 | universe, multiverse |
| `archipelago` | 8 | universe |
| `pangaea` | 16 | universe |
| `multiContinent` | 18 | multiverse |
| `oceanWorld` | 6 | universe |
| `plane` | 4 | plane |
| `starSystems` | 10 | crystalSphere, space 文明 |
| `flatDiscWorld` | 5 | 东方/修真世界观 |
| `void` | 1 | 抽象/克苏鲁 |

### 5.5 entities 数量范围（Level 1）

| 字段名 | min | max | 说明 |
|--------|-----|-----|------|
| `entities.nationCount.min/max` | 1 | 15 | primitive 倾向 0–1（无国家概念时可 min=0） |
| `entities.factionCount.min/max` | 2 | 8 | |
| `entities.nobleHouseCount.min/max` | 0 | 15 | primitive 可 0 |
| `entities.settlementCount.min/max` | 3 | 30 | |
| `entities.tradeRouteCount.min/max` | 3 | 6 | primitive 可 0–2 |

### 5.6 formulas — 全部 L2 modifier 字段

| 字段名 | 类型 | 范围 | 默认 | 方向语义 |
|--------|------|------|------|---------|
| `populationModifier` | number | 0.01–100 | 1.0 | ↑ 人口更多 |
| `developmentModifier` | number | 0.01–100 | 1.0 | ↑ 开发度更高 |
| `impactRangeModifier` | number | 0.01–100 | 1.0 | ↑ 事件影响范围更大 |
| `birthRateModifier` | number | 0.01–100 | 1.0 | ↑ 出生更快 |
| `deathRateModifier` | number | 0.01–100 | 1.0 | ↑ 死亡更快 |
| `inflationModifier` | number | 0.01–100 | 1.0 | ↑ 通胀变化更快 |
| `tradeMultiplierModifier` | number | 0.01–100 | 1.0 | ↑ 贸易更活跃 |
| `hpRecoveryModifier` | number | 0.01–100 | 1.0 | ↑ 恢复更快 |
| `staminaRecoveryModifier` | number | 0.01–100 | 1.0 | ↑ 体力恢复更快 |
| `lifespanModifier` | number | 0.01–100 | 1.0 | ↑ 寿命更长 |
| `attributeDecayModifier` | number | 0.01–100 | 1.0 | ↑ 属性衰减更快 |
| `breakthroughChanceModifier` | number | 0.01–100 | 1.0 | ↑ 突破概率更高 |
| `cultivationSpeedModifier` | number | 0.01–100 | 1.0 | ↑ 修炼更快 |
| `bottleneckModifier` | number | 0.01–100 | 1.0 | ↑ 瓶颈更易突破 |
| `monsterThreatModifier` | number | 0.01–100 | 1.0 | ↑ 威胁更高 |
| `monsterSpawnModifier` | number | 0.01–100 | 1.0 | ↑ 刷新更频繁 |
| `luckPointModifier` | number | 0.01–100 | 1.0 | ↑ 运气效果更强 |
| `socialMobilityModifier` | number | 0.01–100 | 1.0 | ↑ 阶层流动更快 |
| `factionEmergenceModifier` | number | 0.01–100 | 1.0 | ↑ 派系涌现更频繁 |
| `warFrequencyModifier` | number | 0.01–100 | 1.0 | ↑ **更易**触发战争（逆阈值） |
| `warDamageModifier` | number | 0.01–100 | 1.0 | ↑ 战争伤害更大 |
| `legalEnforcementModifier` | number | 0.01–100 | 1.0 | ↑ 执法更严 |
| `ecologyRecoveryModifier` | number | 0.01–100 | 1.0 | ↑ 生态恢复更快 |
| `pollutionDecayModifier` | number | 0.01–100 | 1.0 | ↑ 污染衰减更快 |
| `resourceConsumptionModifier` | number | 0.01–100 | 1.0 | ↑ 资源消耗更快 |
| `disasterFrequencyModifier` | number | 0.01–100 | 1.0 | ↑ 灾害更频繁 |
| `techProgressModifier` | number | 0.01–100 | 1.0 | ↑ 科技进步更快 |
| `techBreakthroughModifier` | number | 0.01–100 | 1.0 | ↑ 技术突破更频繁 |
| `industryProductivityModifier` | number | 0.01–100 | 1.0 | ↑ 产业生产率更高 |
| `economyModifier` | number | 0.01–100 | 1.0 | ↑ 经济整体更活跃 |
| `crossDomainEffectModifier` | number | 0.01–100 | 1.0 | ↑ 跨域联动效果更强 |
| `migrationRateModifier` | number | 0.01–100 | 1.0 | ↑ 区域人口迁移更频繁 |
| `literacyGrowthModifier` | number | 0.01–100 | 1.0 | ↑ 识字率增长更快（education-system） |
| `incomeModifier` | number | 0.01–100 | 1.0 | ↑ 玩家职业收入更高（work-system） |
| `conflictEscalationModifier` | number | 0.01–100 | 1.0 | ↑ 冲突周期阶段事件更频繁（enabled 时） |
| `devotionGainModifier` | number | 0.01–100 | 1.0 | ↑ 虔诚获取更快 / 衰减更慢 / 信仰突破加成更高 |
| `causalCaptureRate` | number | 0.01–100 | 1.0 | ↑ 因果链捕获更频繁 |

**`formulas.economyTierRatios`**（L1 数组）：

- 长度必须为 5
- 每项 ∈ (0, 1]，单调严格递增，第 5 项 = 1.0
- 默认 `[0.25, 0.45, 0.65, 0.85, 1.0]`（相对 `powerCeiling` 的经济层级切分）

### 5.7 styleGuide（Level 3 可选）

| 字段名 | 类型 | 约束 |
|--------|------|------|
| `worldviewStyleHint` | string | ≤200 字；未提供时运行时查 `WORLDVIEW_STYLE_HINTS` |
| `narrativeTone` | string | ≤50 字，如「史诗宏大」「冷峻写实」 |
| `eventTypeWeights` | `Record<string, number>` | key 为 25 种事件 type；value ≥ 0，不必归一化 |

---

## 6. AI 决策规则表（引导式，非场景示范）

> **禁止**在 Prompt 中放入完整 44 字段 JSON 样例或 §16 验收场景的具体数值。
> 仅使用下列 **IF → 方向/范围** 规则；DeepSeek 在 `temperature: 0.3` + JSON mode 下对此模式最稳定。

### 6.1 文明阶段 → 基础数量级

| IF civilizationStage | populationBase 建议 | techProgressModifier | nationCount.max |
|---------------------|--------------------|-----------------------|-----------------|
| primitive | 50–500 | 0.1–0.5 | 0–1 |
| ancient | 200–2000 | 0.3–0.8 | 1–3 |
| medieval | 1000–10000 | 0.5–1.2 | 2–6 |
| industrial+ | 查 §5.2 默认表 | 1.0–2.0 | 3–10 |
| space | 500000+ | 2.0–5.0 | 5–15 |

### 6.2 世界观 essenceTag → 策略与力量系

| IF essenceTag | eventDistributionStrategy | cultivationSpeedModifier | monsterThreatModifier |
|---------------|--------------------------|--------------------------|----------------------|
| cultivation / easternFantasy | mystical 或 cosmic_epic | 1.5–4.0 | 0.8–2.0 |
| postApocalyptic / survivalHorror | apocalyptic | 0.3–1.0（若有） | 2.0–5.0 |
| scifi / steampunk | balanced 或 political | N/A（technology 体系） | 0.5–1.5 |
| historical / materialist | political | 0.1–0.5 | 0.5–1.0 |
| primitive 阶段任意 | prehistoric | 0.1–0.5 | 1.0–3.0 |

### 6.3 力量体系 powerSystemTag → 相关 modifier

| IF powerSystemTag | 应调高 | 应调低 |
|-------------------|--------|--------|
| cultivation | cultivationSpeed, bottleneck, luckPoint | industryProductivity |
| technology | techProgress, techBreakthrough, industryProductivity | cultivationSpeed |
| none / 纯历史 | techProgress, cultivationSpeed, monsterSpawn | socialMobility（可固化） |
| faith | luckPoint, legalEnforcement | monsterThreat |

### 6.4 难度 difficulty → 叠加提示（Step 0 输出时考虑）

| difficulty | Step 0 输出倾向 | 运行时仍叠加 mod-difficulty（§9） |
|------------|----------------|----------------------------------|
| normal | modifier 居中 0.8–1.2 | 基准 |
| hard | disaster/death 略高 1.2–1.5 | disasterRate ×1.5 等 |
| nightmare | 生存系 modifier 0.5–0.8 | 天花板压制开启 |
| hell | 生存系 0.2–0.5，威胁系 2.0+ | 最强叠加 |

### 6.5 公式调整原则（写入 Prompt）

1. **同一世界观内自洽**：高修炼速度不应同时配极低寿命 + 极低突破（除非 apocalyptic）。
2. **数量级先于 modifier**：史前应用 `populationBase=50` 而非 `populationModifier=0.001`。
3. **逆相关参数**：`warFrequencyModifier` 越大 → 战争**越多**（阈值 = 80/modifier）。
4. **默认优先**：仅偏离 ±20% 以上的维度才输出，减少 token 与冲突。
5. **不生成 W02 字段**：如 `techLevel`(1–24)、`inflationRate`(0–30) 属于 W02，不在此 JSON 出现。

---

## 7. WorldCalibration 完整类型

```ts
interface WorldCalibration {
  metadata: {
    essenceTag: string
    civilizationStage: string
    powerSystemTag: string
    spatialForm: string
    difficulty?: 'normal' | 'hard' | 'nightmare' | 'hell'
  }

  styleGuide?: {
    worldviewStyleHint?: string
    narrativeTone?: string
    eventTypeWeights?: Record<string, number>
  }

  timeline?: {
    eraStartYear?: number
    stageSpan?: number
    impactDistribution?: EventDistributionStrategy
  }

  entities?: {
    nationCount?: { min: number; max: number }
    factionCount?: { min: number; max: number }
    nobleHouseCount?: { min: number; max: number }
    settlementCount?: { min: number; max: number }
    tradeRouteCount?: { min: number; max: number }
  }

  world?: {
    populationBase?: number
    developmentRange?: { min: number; max: number }
    mapTemplate?: MapTemplateId
    regionCount?: number
  }

  formulas?: {
    populationModifier?: number
    developmentModifier?: number
    impactRangeModifier?: number
    birthRateModifier?: number
    deathRateModifier?: number
    inflationModifier?: number
    tradeMultiplierModifier?: number
    hpRecoveryModifier?: number
    staminaRecoveryModifier?: number
    lifespanModifier?: number
    attributeDecayModifier?: number
    breakthroughChanceModifier?: number
    cultivationSpeedModifier?: number
    bottleneckModifier?: number
    monsterThreatModifier?: number
    monsterSpawnModifier?: number
    luckPointModifier?: number
    socialMobilityModifier?: number
    factionEmergenceModifier?: number
    warFrequencyModifier?: number
    warDamageModifier?: number
    legalEnforcementModifier?: number
    ecologyRecoveryModifier?: number
    pollutionDecayModifier?: number
    resourceConsumptionModifier?: number
    disasterFrequencyModifier?: number
    techProgressModifier?: number
    techBreakthroughModifier?: number
    industryProductivityModifier?: number
    economyModifier?: number
    economyTierRatios?: [number, number, number, number, number]
    crossDomainEffectModifier?: number
    eventDistributionStrategy?: EventDistributionStrategy
    migrationRateModifier?: number
    literacyGrowthModifier?: number
    incomeModifier?: number
    conflictEscalationModifier?: number
    devotionGainModifier?: number
    causalCaptureRate?: number
  }
}

type EventDistributionStrategy =
  | 'balanced' | 'prehistoric' | 'political'
  | 'cosmic_epic' | 'apocalyptic' | 'mystical'

type MapTemplateId =
  | 'continent' | 'archipelago' | 'pangaea' | 'multiContinent'
  | 'oceanWorld' | 'plane' | 'starSystems' | 'flatDiscWorld' | 'void'
```

---

## 8. 架构设计：校准数据如何到达各子系统

### 8.1 Store 集中存储 + 按需读取

实际实现：`src/mods/mod-world/utils/calibration-access.ts` 提供统一入口，各子系统通过 `getFormulaModifier()` 读取 L2 系数。

```ts
// calibration-access.ts — 子系统侧零侵入
import { getFormulaModifier } from '@/mods/mod-world'

advance(ctx: RoundContext): void {
  const hpMod = getFormulaModifier('hpRecoveryModifier')
  const diffMult = getDifficultyMultiplier('hpRecovery') // §9
  const hpGain = physique * 0.3 * diffMult * hpMod
}
```

**Orchestrator 例外**：`mod-engine` 不直接 import `mod-world`（避免循环依赖）。`useWorldConfirm` / `world-init-bundle` 将 `_calibration`、`_economyModifier` 注入 `worldSetting.config`；Orchestrator 从 config 读取 `economyTierRatios`、`crossDomainEffectModifier`。

### 8.2 优势

1. 不修改子系统 `init()` 签名
2. 不修改 `constants.ts` 默认值
3. modifier 默认 1.0 时行为完全不变
4. 按 Phase 1→3 逐步接入

---

## 9. 难度叠加规则（mod-difficulty × 校准）

Step 0 输出的 modifier 为**世界观基准**；玩家所选难度在运行时叠加：

```
effectiveValue = baseFormula × calibrationModifier × difficultyMultiplier
```

| 校准字段 | 叠加 difficulty 字段 | 说明 |
|----------|---------------------|------|
| `disasterFrequencyModifier` | `disasterRate` | 相乘 |
| `luckPointModifier` | `fortuneMultiplier` | 相乘 |
| `inflationModifier` / 经济支出 | `expenseMultiplier` | 相乘 |
| `monsterThreatModifier` | `enemyScale` | 相乘 |
| 战力天花板相关 | `ceilingSuppress` + `suppressThreshold` | nightmare/hell 启用，独立于 modifier |

**Prompt 注意**：Step 0 已知 `difficulty` 时应轻微预补偿（§6.4），但**不得**在 JSON 中重复输出 difficulty 专属乘数。

---

## 10. 校验、降级与重试

| 步骤 | 行为 |
|------|------|
| Zod parse | `worldCalibrationOutputSchema` 严格校验字段名与类型 |
| clamp | 所有 modifier → `[0.01, 100]`；entities min ≤ max |
| enum | 非法 strategy / mapTemplate → 回退 `balanced` / 模板推断 |
| economyTierRatios | 长度≠5 或末项>1.0 或含重复值 → 丢弃；乱序五档可排序后接受 |
| 重试 | 最多 3 次，间隔 2s（对齐 `world-init-bundle`） |
| 最终降级 | 全默认 WorldCalibration + console.warn；不阻塞世界创建 |

---

## 11. 排除清单 & Phase 4 候选

### 11.1 明确排除（不校准）

| 系统 | 原因 |
|------|------|
| Orchestrator **编排调度逻辑** | 纯 stage 调度；**但** `buildEconomyTierRules` 的经济层级属 L1 校准范围 |
| Memory×4 / NarrativeParser / Plot / Foreshadowing / CausalDelay | Token 或叙事结构，非世界物理 |
| Achievement / Works / Disciple / Art | 展示为主 |
| Era / Fate / Prophecy | 展示为主 |
| Settlement（显示型）/ LanguageNaming | 纯生成或展示 |
| mod-npc / mod-golden-finger | 玩家局内，非世界初始化 |
| SubsystemRelevance / Degradation / Compressor | 引擎内部 |

### 11.2 Phase 4 候选（有公式，后续评估）

| 子系统 | 潜在 modifier | 理由 |
|--------|--------------|------|
| education-system | `literacyGrowthModifier` | 识字率/研究产出驱动科技 |
| family-system | `fertilityModifier` | 家族生育与冲突概率 |
| work-system | `incomeModifier` | 职业收入公式 |
| faith-system | `devotionGainModifier` | 信仰突破加成 |
| conflict-cycle-system | `conflictEscalationModifier` | 冲突阶段概率表 |
| fortune-encounter-system | 与 luck + difficulty 重叠 | 需去重设计 |
| causal-simulation-system | `causalCaptureRate` | 因果链捕获频率 |
| population migration | `migrationRateModifier` | 迁移概率 `mobilityIndex×0.3` |

### 11.3 Phase 4 评估结论（2026-06-24）

> 代码审计 + 与 Phase 1–3 重叠分析。**P4-A 已实施**（2026-06-24）；P4-B/C 仍为候选。

| 优先级 | 子系统 | 文件 | 建议 modifier | 公式锚点 | 与 Phase 1–3 重叠 | 结论 |
|--------|--------|------|--------------|---------|-------------------|------|
| **P4-A 高** ✅ | population migration | `mod-economy/subsystems/population-system.ts` | `migrationRateModifier` | `mobilityIndex × 0.3` | `socialMobilityModifier` 管阶层流动 | **已接入** |
| **P4-A 高** ✅ | education-system | `mod-culture/subsystems/education-system.ts` | `literacyGrowthModifier` | `baseGrowth = access×0.15 + …` | `techProgressModifier` 管 culture-tech | **已接入** |
| **P4-B 中** ✅ | work-system | `mod-economy/subsystems/work-system.ts` | `incomeModifier` | `base × level × satisfaction` | 见 §11.4 dedup | **已接入** |
| **P4-B 中** ✅ | conflict-cycle-system | `mod-politics/subsystems/conflict-cycle-system.ts` | `conflictEscalationModifier` | `phaseEventChance × modifier` | `warFrequencyModifier`（外交战争） | **已接入**（子系统 enabled 时生效） |
| **P4-C 低** ✅ | faith-system | `mod-power-system/subsystems/faith-system.ts` | `devotionGainModifier` | 虔诚增减 + 突破加成 | `breakthroughChanceModifier`（lifespan） | **已接入** |
| **P4-C 低** ✅ | causal-simulation-system | `mod-history-dynamics/subsystems/causal-simulation-system.ts` | `causalCaptureRate` | 匹配后概率门 + cap 缩放 | 无 | **已接入** |
| **Defer** | family-system | `mod-culture/subsystems/family-system.ts` | `fertilityModifier` | `BIRTH_PROBABILITY=0.08`（玩家家族） | `birthRateModifier`（宏观人口） | **推迟**：与 macro birth 双重计数风险 |
| **Defer** ✅ | fortune-encounter-system | `mod-power-system/subsystems/fortune-encounter-system.ts` | —（无新字段） | `base × (1+luck×0.02×luckPointModifier) × diffMult` | `luckPointModifier` | **已去重**：复用 Phase 3 luck 校准，不新增字段 |

**Phase 4 状态**：P4-A/B/C **全部完成**；仅剩 Defer `fertilityModifier`（family，与 macro birth 重叠）。

**字段预算**：**50** 可校准参数 + 1 策略 enum。

**测试覆盖**：规则默认见 §15 + `test:calibration`；AI 路径见 §15.1。

### 11.4 收入 / 运气 dedup 规范（Phase 4B）

> 防止世界观校准在「玩家收入」「宏观经略」「运气奇遇」三层重复计数。

#### 11.4.1 玩家收入三层（仅一层可校准）

| 层 | 来源 | 是否 L2 校准 | 说明 |
|----|------|-------------|------|
| **职业公式** | `work-system.recalcIncome()` | **`incomeModifier`** | `PROFESSION_BASE × levelMod × satisfactionMod × modifier` |
| **阶层倍率** | `social-stratification.STRATUM_INCOME_MULTIPLIER` | 否（常量表） | 叙事/Prompt 展示用 `getPlayerIncomeMultiplier()`；**不**写入 calibration |
| **宏观产业** | `industry-system` | `industryProductivityModifier` | 文明生产率，**不**乘玩家 work income |

**禁止叠加**：

- `economyModifier` → 仅 Orchestrator 经济层级 **Prompt 注解** + 跨域叙事参考，**不**参与 `recalcIncome()`
- `industryProductivityModifier` → 宏观；与玩家职业收入独立

**叙事合成（供 AI 参考，非代码强制）**：`有效收入 ≈ work.income × stratumMultiplier`（若叙事需要同时提及阶层与职业）。

#### 11.4.2 运气奇遇 dedup（无新字段）

| 因子 | 来源 | 说明 |
|------|------|------|
| 基础概率 | `BASE_ENCOUNTER_CHANCE[tier]` | 常量 |
| 运气点 | `luck × 0.02 × **luckPointModifier**` | 与 `luck-system` 同校准字段 |
| 难度 | `DIFFICULTY_MULTIPLIERS_FORTUNE[difficulty]` | 运行时 mod-difficulty |
| 金手指 | `goldenBoost 1.5` | 玩家局内，非世界校准 |

**禁止**新增 `fortuneEncounterModifier`；世界观「机缘多/少」通过 Step 0 的 `luckPointModifier` 表达。

#### 11.4.3 冲突 vs 战争 dedup（Phase 4C）

| 字段 | 子系统 | 语义 | 生效条件 |
|------|--------|------|---------|
| `warFrequencyModifier` | nation-relation | 国家间外交战争（tension 阈值） | 始终（有国家关系时） |
| `warDamageModifier` | nation-relation | 战争繁荣度消耗 | 交战中 |
| `conflictEscalationModifier` | conflict-cycle | 六阶段**叙事冲突**事件概率表 | **`state.enabled === true`** |

二者不叠加：校准「战争多」→ `warFrequencyModifier`；校准「剧情冲突/打脸节奏快」→ `conflictEscalationModifier`（需玩法启用 conflict-cycle）。

#### 11.4.4 信仰 / 因果 dedup（Phase 4C 低优先）

| 字段 | 子系统 | 语义 | 与何物勿混淆 |
|------|--------|------|-------------|
| `devotionGainModifier` | faith-system | 玩家虔诚获取、衰减、突破加成 | `breakthroughChanceModifier`（character 寿命突破） |
| `causalCaptureRate` | causal-simulation | 叙事正则匹配后的入库概率 + 频率 cap | 跨域规则 / 事件生命周期（非因果队列） |

**说明**：`getFaithBreakthroughBonus()` 已乘 `devotionGainModifier`；cultivation 瓶颈乘 `faithBonus`（Round 2）；lifespan 突破 roll 可乘 `faithBonus`，**禁止**再乘 `devotionGainModifier`。`breakthroughChanceModifier` 仅管 lifespan 基础概率。

#### 11.4.5 修炼速度 vs 瓶颈 dedup（Phase 5 / G-10）

| 字段 | 消费子系统 | 公式语义 |
|------|-----------|----------|
| `cultivationSpeedModifier` | **combat-power-system** | 战力 `effectiveGain = baseGain × decay × modifier`（修炼**速度/战力积累**） |
| `bottleneckModifier` | **cultivation-system** | 境界瓶颈 `chance = BASE[i] × modifier`（**突破难度**） |

二者不叠加到同一公式：校准「修炼快」→ `cultivationSpeedModifier`；校准「突破难」→ `bottleneckModifier`。Prompt 勿对同一世界观同时大幅偏离两者表达同一意图。

---

## 12. Prompt 实现规范（world-calibration-prompt.ts）

### 12.1 设计原则

| 原则 | 说明 |
|------|------|
| **引导 > 示范** | 使用 §5 字段字典 + §6 决策规则；**禁止**完整 JSON few-shot |
| **对齐 W02 模式** | 参考 `world-config-prompt.ts` 的 `parameters.fields` 结构 |
| **避免 W06 反模式** | 禁止 `outputSchema: [{ name: '占位符' }]` 式伪示例 |
| **可允许** | 枚举值列表；单字段范围表；§6.1 一行式数量级 hint |
| **Token** | 稀疏输出 + 省略默认值，目标输出 ~400–700 tokens |

### 12.2 文件结构

```ts
// mod-world/prompts/world-calibration-prompt.ts
export const worldCalibrationOutputSchema = z.object({ /* 对齐 §7 */ })

export const worldCalibrationPrompt: PromptTemplate = {
  name: 'world-calibration',
  version: '1.0.0',
  mod: 'mod-world',
  systemPrompt: stringifyPrompt({
    role: '世界模拟校准 AI',
    task: '根据 WorldConfig 输出 WorldCalibration JSON，校准模拟公式系数与世界数量级',
    outputFormat: 'JSON 对象，稀疏输出（仅非默认字段）',
    constraints: [
      '严格使用 §5 定义的 camelCase 字段名',
      '禁止 markdown、禁止解释文字、禁止占位符',
      'modifier 默认 1.0，仅输出偏离值',
      '不输出 W02 配置 Prompt 的 40+ 叙事字段',
      'warFrequencyModifier 越大表示战争越频繁',
    ],
    fieldDictionary: '/* 嵌入 §5.2–§5.7 精简版 */',
    decisionRules: '/* 嵌入 §6.1–§6.5 精简版 */',
    formulaPrinciples: [
      '所有 L2 字段均为乘法 modifier，注入对应子系统公式',
      'L1 字段替换查表默认值，不修改 constants.ts',
      'L3 strategy 驱动 pickImpactForYear 权重与 eventTypeWeights',
    ],
  }),
  userPromptTemplate: stringifyPrompt({
    instruction: '校准以下世界的模拟参数',
    worldName: '{{worldName}}',
    essenceTag: '{{essenceTag}}',
    powerSystemTag: '{{powerSystemTag}}',
    spatialForm: '{{spatialForm}}',
    civilizationStage: '{{civilizationStage}}',
    powerCeiling: '{{powerCeiling}}',
    difficulty: '{{difficulty}}',
    worldDescription: '{{worldDescription}}',
  }),
  variables: [/* 同上 */],
  outputFormat: 'json',
  outputSchema: worldCalibrationOutputSchema,
}
```

### 12.3 AI 模型配置

与现网 `world-init-bundle` 一致：

```ts
model: 'deepseek-v4-flash'
temperature: 0.3
responseFormat: { type: 'json_object' }
reasoningEffort: 'disabled'
maxTokens: estimateTokenBudget(system, user, 700) // AI-01/AI-04
```

---

## 13. 实施阶段

> **实施状态（2026-06-24）**：Phase 1–4 **全部完成**（50 参数）；Defer 仅 `fertilityModifier`。

### 阶段 1（核心）：mod-world + 基础设施 ✅

| 步骤 | 内容 | 文件 | 状态 |
|------|------|------|------|
| 1.1 | `WorldCalibration` 类型 + enum | `types.ts` | ✅ |
| 1.2 | `world-calibration-prompt.ts` + Zod schema | `prompts/world-calibration-prompt.ts` | ✅ |
| 1.3 | `clampCalibration()` 校验工具 | `utils/calibration-clamp.ts` | ✅ |
| 1.3b | `getFormulaModifier()` 统一读取 | `utils/calibration-access.ts` | ✅ |
| 1.4 | `world-init-bundle.ts` Step 0 + store persist v2 | `world-init-bundle.ts`, `store.ts` | ✅ |
| 1.5 | WorldInitSystem 接入 | `subsystems/world-init-system.ts` | ✅ |
| 1.6 | WorldTimelineSystem 接入 strategy + impactRange | `subsystems/world-timeline-system.ts` | ✅ |
| 1.7 | WorldEntitySystem 接入 entities 范围 | `subsystems/world-entity-system.ts` | ✅ |
| 1.8 | Orchestrator `economyTierRatios` + `_economyModifier` | `orchestrator-system.ts`, `useWorldConfirm.ts` | ✅ |

**已知限制**：`commitWorldInitialization` 同步生成 timeline stage 0 骨架时，后台 Step 0 AI 校准可能尚未返回；后续 stage 与 L2 子系统读取 store 中的最新 calibration。

### 阶段 2：mod-economy + mod-character + mod-env-ecology ✅

| 步骤 | 内容 | 文件 | 状态 |
|------|------|------|------|
| 2.1 | PopulationSystem（birth/death） | `mod-economy/subsystems/population-system.ts` | ✅ |
| 2.2 | EconomySystem（inflation/trade） | `mod-economy/subsystems/economy-system.ts` | ✅ |
| 2.3 | HealthSystem | `mod-character/subsystems/health-system.ts` | ✅ |
| 2.4 | LifespanSystem | `mod-character/subsystems/lifespan-system.ts` | ✅ |
| 2.5 | AttributeDecaySystem | `mod-character/subsystems/attribute-decay-system.ts` | ✅ |
| 2.6 | EcologySystem | `mod-env-ecology/subsystems/ecology-system.ts` | ✅ |
| 2.7 | PollutionSystem | `mod-env-ecology/subsystems/pollution-system.ts` | ✅ |
| 2.8 | NaturalResourceSystem | `mod-env-ecology/subsystems/natural-resource-system.ts` | ✅ |
| 2.9 | ClimateSystem（disasterFrequency） | `mod-env-ecology/subsystems/climate-system.ts` | ✅ |

### 阶段 3：力量 + 政治 + 科技 + 跨域 ✅

| 步骤 | 内容 | 文件 | 状态 |
|------|------|------|------|
| 3.1 | CombatPowerSystem — `cultivationSpeedModifier` | `mod-power-system/subsystems/combat-power-system.ts` | ✅ |
| 3.2 | CultivationSystem — `bottleneckModifier` | `mod-power-system/subsystems/cultivation-system.ts` | ✅ |
| 3.3 | MonsterSystem — `monsterThreatModifier`, `monsterSpawnModifier` | `mod-power-system/subsystems/monster-system.ts` | ✅ |
| 3.4 | LuckSystem — `luckPointModifier` | `mod-power-system/subsystems/luck-system.ts` | ✅ |
| 3.5 | SocialStratificationSystem — `socialMobilityModifier` | `mod-politics/subsystems/social-stratification-system.ts` | ✅ |
| 3.6 | FactionDynamicsSystem — `factionEmergenceModifier` | `mod-politics/subsystems/faction-dynamics-system.ts` | ✅ |
| 3.7 | NationRelationSystem — `warFrequencyModifier`, `warDamageModifier` | `mod-politics/subsystems/nation-relation-system.ts` | ✅ |
| 3.8 | LegalSystem — `legalEnforcementModifier` | `mod-politics/subsystems/legal-system.ts` | ✅ |
| 3.9 | CultureTechSystem — `techProgressModifier`, `techBreakthroughModifier` | `mod-tech-level/subsystems/culture-tech-system.ts` | ✅ |
| 3.10 | IndustrySystem — `industryProductivityModifier` | `mod-tech-level/subsystems/industry-system.ts` | ✅ |
| 3.11 | `crossDomainEffectModifier` | `orchestrator-system.ts` `_applyCrossDomainEffectModifier()` | ✅ |

**3.11 实施说明**：缩放逻辑放在 Orchestrator（dispatch 后、`toSubSystemChanges` 前），对 11 条规则的 `params` 数值字段 × modifier；`cross-domain-rules.ts` 保持纯规则定义，不 import mod-world。

### 阶段 4A：迁移 + 识字 ✅

| 步骤 | 内容 | 文件 | 状态 |
|------|------|------|------|
| 4A.1 | `migrationRateModifier` 类型 + clamp + Prompt | `types.ts`, `calibration-clamp.ts`, `world-calibration-prompt.ts` | ✅ |
| 4A.2 | PopulationSystem 迁移概率接入 | `mod-economy/subsystems/population-system.ts` | ✅ |
| 4A.3 | `literacyGrowthModifier` 类型 + clamp + Prompt | 同上 | ✅ |
| 4A.4 | EducationSystem 识字增长接入 + mod-culture 依赖 mod-world | `mod-culture/subsystems/education-system.ts`, `manifest.ts` | ✅ |

### 阶段 4B：收入 dedup + 机缘 luck 去重 ✅

| 步骤 | 内容 | 文件 | 状态 |
|------|------|------|------|
| 4B.1 | §11.4 dedup 规范写入蓝图 | `BLUEPRINT-AI-METADATA.md` | ✅ |
| 4B.2 | `incomeModifier` 类型 + clamp + Prompt | `types.ts`, `calibration-clamp.ts`, `world-calibration-prompt.ts` | ✅ |
| 4B.3 | WorkSystem 职业收入接入 | `mod-economy/subsystems/work-system.ts` | ✅ |
| 4B.4 | FortuneEncounter 复用 `luckPointModifier`（无新字段） | `mod-power-system/subsystems/fortune-encounter-system.ts` | ✅ |

### 阶段 4C：冲突周期 ✅

| 步骤 | 内容 | 文件 | 状态 |
|------|------|------|------|
| 4C.1 | §11.4.3 冲突/战争 dedup 规范 | `BLUEPRINT-AI-METADATA.md` | ✅ |
| 4C.2 | `conflictEscalationModifier` 类型 + clamp + Prompt | `types.ts`, `calibration-clamp.ts`, `world-calibration-prompt.ts` | ✅ |
| 4C.3 | ConflictCycleSystem 阶段 eventChance 接入 | `mod-politics/subsystems/conflict-cycle-system.ts` | ✅ |

### 阶段 4D：信仰 + 因果（P4-C 低优先）✅

| 步骤 | 内容 | 文件 | 状态 |
|------|------|------|------|
| 4D.1 | §11.4.4 信仰/因果 dedup 规范 | `BLUEPRINT-AI-METADATA.md` | ✅ |
| 4D.2 | `devotionGainModifier` + `causalCaptureRate` 类型/clamp/Prompt | `types.ts`, `calibration-clamp.ts`, `world-calibration-prompt.ts` | ✅ |
| 4D.3 | FaithSystem 虔诚增减 + 突破加成 | `mod-power-system/subsystems/faith-system.ts` | ✅ |
| 4D.4 | CausalSimulation 捕获概率 + cap 缩放 | `mod-history-dynamics/subsystems/causal-simulation-system.ts` | ✅ |

---

## 14. Token 预算

| 项 | 估算 |
|----|------|
| system prompt（§5+§6 精简嵌入） | ~2800 tokens |
| user prompt | ~250 tokens |
| AI 输出（稀疏，约 15–25 字段） | ~500–700 tokens |
| **合计** | **~3600–3800 tokens** |

对比现有 4 路 AI（~15,000–20,000 tokens），新增约 **19–25%**。

---

## 15. 验收场景（测试矩阵 — 不进入 Prompt）

> 供人工 / 自动化测试断言，**禁止**原文写入 systemPrompt。
>
> **自动化**：`npm run test:calibration`（已纳入 `npm run check`）
> - **§15 规则默认**：`world-calibration-acceptance-runner.ts` → `buildDefaultCalibration()` 四场景
> - **§15.1 AI 路径**：`world-calibration-ai-path-runner.ts` → mock JSON + Zod + `clampCalibration()` 十二用例

| 场景 | 关键断言（阶段 1+） | 阶段 2+3 叠加断言 |
|------|---------------------|------------------|
| 史前 primitive | populationBase ≤500；strategy=prehistoric | birthRateModifier <0.8；techProgress <0.5 |
| 丧尸末日 postApocalyptic | strategy=apocalyptic；populationBase 低 | deathRate↑ monsterThreat↑ resourceConsumption↑ |
| 星际 scifi+space | populationBase ≥500000；mapTemplate=starSystems | techProgress >2.0；industryProductivity >1.5 |
| 修仙 cultivation | cultivationSpeed >1.5；strategy=mystical | bottleneck >1.2；socialMobility <1.0（固化） |

### 15.1 AI 路径测试矩阵（mock Step 0）

| 用例 | 断言 |
|------|------|
| 稀疏 merge | 仅 AI 输出字段覆盖基线，其余保留 `buildDefaultCalibration` |
| Zod 拒绝 + clamp | modifier 超范围时 parse 失败，仍截断至 `[0.01, 100]` |
| 非法 enum | strategy/mapTemplate 回退 |
| economyTierRatios | 乱序可排序修正；末项>1.0 或重复值丢弃 |
| impactDistribution 同步 | timeline 策略写入 `formulas.eventDistributionStrategy` |
| entities clamp | min≤max 修正 + 上限裁剪 |
| null 降级 | 等同纯规则默认 |
| mock 修仙 / 星际 | 稀疏 AI JSON 满足 §15 叠加断言 |
| Phase 4-A modifiers | `migrationRateModifier` / `literacyGrowthModifier` Zod + merge |
| Phase 4-B incomeModifier | 稀疏 AI 输出 + 末日规则默认 `<1` |
| Phase 4-C conflictEscalationModifier | 历史/武侠规则默认 + AI merge |
| Phase 4-D devotion/causal | faith+mythological 默认 + AI merge |
| passthrough | 额外顶层字段不阻断流程 |
