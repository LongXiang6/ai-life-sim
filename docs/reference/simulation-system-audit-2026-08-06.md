# P8 活动模拟系统数值与剧情辅助审计（2026-08-06）

本文档所有者为 `docs/reference` 的模拟系统审计记录，职责是保存 2026-08-06 对当前 `p8` 活动成员的逐项证据、增长判断与剧情辅助结论；它不是活动运行权威，不定义或修改系统契约，当前机制仍以源码、测试和 `docs/authority` 为准。

## 范围与口径

- 唯一成员范围来自 `src/mods/mod-engine/helpers/mvp-stages-config.default.json`：50 个外部业务成员、12 个引擎成员，共 62 个。
- 39 个成员实现了 `advance()`；其余 23 个依赖事件、公共 API、状态收集或编排调用。没有 `advance()` 不等于无效，但只有源码和 `applyChanges()` 而没有活动调用方时，判定为未形成运行效果。
- 本次已删除未经授权的整段人生 `1000` 回合硬终止。增长判断不再借助整局回合上限兜底；只有 owning system 自身的上限、衰减、消耗、替换、终态或明确生命周期才算边界。
- 剧情结论分为：`高` 表示结果直接进入主叙事、历史、记忆或玩家终态；`中` 表示结果有效但主要通过摘要或后台宏观分析间接消费；`低` 表示状态存在但关键链路断开、长期失真或容易产生噪声；`无` 表示当前默认状态没有活动写入或消费路径。
- 主叙事受校验写入只覆盖角色基础属性系统（`character-base`）、寿命系统（`lifespan`）、健康系统（`health`）、道德系统（`morality`）、成长系统（`growth-system`）、声望系统（`reputation`）、非玩家角色系统（`npc-system`）和关系系统（`relationship-system`）。宏观影响写入只覆盖 14 个宏观系统。其他 `applyChanges()` 不能据此视为当前叙事可达。
- 主故事 Prompt 读取相关系统的摘要，不读取所有完整状态，并显式排除人口系统（`population`）与文化科技系统（`culture-tech`）；宏观影响 AI 可读取 14 个宏观系统的完整状态，但大量细节不会回到下一轮主故事 Prompt。

## 中文系统名称与用途速查

中文名称用于审计阅读和后续产品讨论；括号内机器标识保持不变，只用于对应活动配置、源码、状态和调用链。

| # | 中文系统名称 | 机器标识 | 系统用途 |
|---:|---|---|---|
| 1 | 世界上下文注册系统 | `world-context-registry` | 登记并选择当前世界上下文，让后续系统知道角色正处于哪个世界以及应读取哪组世界状态。 |
| 2 | 上下文能力配置系统 | `contextual-capability-profile` | 根据当前世界生成可用能力清单，阻止修炼、超凡、NPC 等不适用规则进入错误世界。 |
| 3 | 空间关系图系统 | `spatial-graph` | 记录地点之间的连接、跨界出口和实体位置，为移动、同场人物和场景邻接提供依据。 |
| 4 | 上下文切换系统 | `context-transition` | 负责角色在不同世界或区域之间切换，并同步当地时间、当前位置和迁移历史。 |
| 5 | 模拟范围策略系统 | `simulation-scope-policy` | 决定哪些世界完整推进、后台推进或冻结，用来控制多世界模拟范围和运行成本。 |
| 6 | 世界初始化系统 | `world-init` | 建立新人生的初始世界快照，为区域、实体、空间关系和世界 Prompt 提供起点。 |
| 7 | 历史事件账本系统 | `historical-event-ledger` | 保存已确认事件、证据和因果关系，作为后续剧情、记忆、成就和死亡判定的事实依据。 |
| 8 | 世界实体系统 | `world-entity` | 为人物、组织和地点建立稳定实体身份，避免关系、势力和剧情引用不存在的对象。 |
| 9 | 关系系统 | `relationship-system` | 维护人物之间的关系强度、类型和变化，为互动、冲突、合作与人物连续性提供依据。 |
| 10 | 非玩家角色系统 | `npc-system` | 保存 NPC 的身份、目标、行为和记忆，为剧情持续提供行动主体、人物动机和后台活动。 |
| 11 | 地理系统 | `geography` | 描述地形、区域和地理变化，为旅行限制、资源分布和环境事件提供空间背景。 |
| 12 | 自然资源系统 | `natural-resource` | 模拟资源储量、再生、消耗和交易，为经济压力、生态变化和资源冲突提供依据。 |
| 13 | 气候系统 | `climate` | 推进季节、气候基线和灾害，为场景天气、环境压力和世界长期变化提供条件。 |
| 14 | 生态系统 | `ecology` | 模拟物种、种群、栖息地和灭绝，为自然环境及怪物来源提供生态基础。 |
| 15 | 污染系统 | `pollution` | 计算污染产生、扩散和衰减，用来形成环境恶化压力并影响生态状态。 |
| 16 | 成长系统 | `growth-system` | 把角色行为转化为技能经验和能力变化，让学习、练习和成长成为可持续的剧情事实。 |
| 17 | 成就系统 | `achievement` | 根据已经确认的历史事件计算成就进度与解锁结果，为人生总结和里程碑提供依据。 |
| 18 | 声望系统 | `reputation` | 记录不同群体和作用域对角色的评价，让社会反馈影响后续关系、势力和剧情条件。 |
| 19 | 角色基础属性系统 | `character-base` | 汇总角色基础属性及命格、健康、年龄和世界修正，作为能力判断与结算的公共状态。 |
| 20 | 命格系统 | `destiny-pattern` | 在角色创建阶段生成并固定命格，用来确定开局特质、属性修正和叙事设定。 |
| 21 | 寿命系统 | `lifespan` | 维护角色最大寿命及调整记录，为自然老死和生命周期边界提供依据。 |
| 22 | 生命周期系统 | `lifecycle-system` | 根据统一时间计算年龄和人生阶段，使童年、成年、衰老等阶段能够进入属性与剧情。 |
| 23 | 健康系统 | `health` | 管理生命、体力、精神、伤病和死亡状态，为生存风险、康复和终局提供依据。 |
| 24 | 气运系统 | `luck` | 生成有限范围的好运或厄运倾向，用来影响当轮剧情方向而不直接替代故事结果。 |
| 25 | 道德系统 | `morality` | 根据剧情事件累计角色道德变化，为角色评价、结局标签和人生评分提供依据。 |
| 26 | 天象系统 | `celestial` | 推导当地天象周期并记录特殊天象，为时间氛围和异常天空事件提供背景。 |
| 27 | 纪元系统 | `era` | 将当地时间转换为纪元、纪元年和阶段名称，让跨年代剧情具有统一时间表达。 |
| 28 | 命运预言系统 | `fate-prophecy` | 维护预言、预兆、应验进度和违背预言的因果代价，用于长期命运线索。 |
| 29 | 神祇创建系统 | `divine-creation` | 登记神祇及其状态，为信仰、神谕、神迹和神明干预提供基础实体。 |
| 30 | 经济系统 | `economy` | 模拟产出、货币流通和价格，为职业收入、资源交换和宏观经济环境提供背景。 |
| 31 | 人口系统 | `population` | 根据出生、死亡、迁移和承载力推进总人口，为社会、聚落和政治初始化提供人口基础。 |
| 32 | 聚落系统 | `settlement` | 模拟聚落人口、等级、繁荣和安全，为城镇发展、职业环境和地方政治提供背景。 |
| 33 | 职业系统 | `work` | 计算角色收入、工作满意度、晋升和职业经历，让职业生涯成为持续状态。 |
| 34 | 物品系统 | `item` | 管理角色或世界中的物品及数量，为持有、获得、消耗和失去物品提供状态。 |
| 35 | 文化系统 | `culture` | 推进传统、改革和社会价值观，为人物行为、艺术、教育和社会冲突提供文化背景。 |
| 36 | 艺术系统 | `art` | 描述时代艺术繁荣、影响和发展阶段，为世界提供艺术氛围与审美背景。 |
| 37 | 教育系统 | `education` | 模拟识字率、教育覆盖和质量，为社会能力、文化传播和个人教育环境提供背景。 |
| 38 | 作品系统 | `works` | 登记具体作品及传播和影响，用来把创作行为转化为可持续的文化成果。 |
| 39 | 社会阶层系统 | `social-stratification` | 模拟阶层比例、特权和流动壁垒，为贫富差距、身份限制和社会压力提供依据。 |
| 40 | 势力动态系统 | `faction-dynamics` | 维护势力影响力、关系、成员规模和玩家贡献，为政治格局与阵营互动提供依据。 |
| 41 | 法律制度系统 | `legal` | 模拟制度执行、腐败和法律状态，为秩序、惩罚、治理和社会约束提供背景。 |
| 42 | 冲突周期系统 | `conflict-cycle` | 推进冲突张力和阶段，使政治、社会或群体矛盾能够从积累发展到爆发与收束。 |
| 43 | 文化科技系统 | `culture-tech` | 模拟知识成熟、研究能力、技术应用和趋势，为时代技术水平与社会变化提供依据。 |
| 44 | 战力系统 | `combat-power` | 维护角色力量阶位和晋升进度，为战斗能力、威胁判断和力量标签提供依据。 |
| 45 | 修炼系统 | `cultivation` | 计算训练效率、瓶颈和突破概率，为修炼过程与境界突破提供规则。 |
| 46 | 怪物系统 | `monster` | 根据生态物种生成怪物威胁并记录遭遇，为危险事件和战斗修正提供来源。 |
| 47 | 机缘系统 | `fortune-encounter` | 在冷却结束后生成机缘候选，为偶遇、奖励和能力变化提供特殊事件入口。 |
| 48 | 信仰系统 | `faith` | 维护角色信仰、虔诚度和信仰时长，为宗教身份及修炼修正提供依据。 |
| 49 | 神明干预系统 | `divine-intervention` | 推进神谕和神迹的持续时间及严重程度，为神明直接影响世界提供状态。 |
| 50 | 异常现象系统 | `anomaly-phenomena` | 管理异常区域、活动状态和不稳定度，为超自然危险和区域异常提供依据。 |
| 51 | 时间系统 | `time` | 作为项目统一时间源推进日期和总天数，驱动年龄、世界变化、事件到期和存档时间。 |
| 52 | 回合编排系统 | `orchestrator` | 统筹每轮输入、AI 正文、子系统执行、历史、记忆和存档，是整轮模拟的总指挥。 |
| 53 | 叙事解析系统 | `narrative-parser` | 将 AI 生成的正文和选项解析为结构化结果，确保内容能够进入游戏状态和后续处理。 |
| 54 | 摘要压缩系统 | `summary-compressor` | 将长期正文分层整理为摘要，减少下一轮 Prompt 的上下文压力并维持长期连贯性。 |
| 55 | 记忆抽取系统 | `memory-engine` | 从正文和属性中抽取人物、关系、地点与重大事件，准备形成结构化剧情记忆。 |
| 56 | 子系统相关性系统 | `subsystem-relevance` | 判断哪些系统状态与当前剧情相关，用来筛选 Prompt 上下文并减少无关信息。 |
| 57 | 记忆生命周期系统 | `memory-lifecycle` | 接纳、评分、聚合和索引事件，建立可检索的长期剧情时间线。 |
| 58 | 记忆遗忘系统 | `memory-forgetting` | 衰减低价值记忆并保护因果或核心人物信息，用来控制长期记忆噪声。 |
| 59 | 延迟因果系统 | `causal-delay` | 把当前选择登记为未来后果，并在到期时触发和确认，使跨回合因果能够兑现。 |
| 60 | 剧情结构系统 | `plot-structure` | 跟踪剧情阶段和张力，为主故事提供节奏、冲突升级与阶段转换指导。 |
| 61 | 伏笔系统 | `foreshadowing` | 识别、激活和回收伏笔，为后续 Prompt 提供铺垫与回收提示。 |
| 62 | 核心记忆系统 | `core-memory` | 保存重要人物互动和关系网络，为人物连续性、关系回忆和遗忘保护提供依据。 |

## 总体结论

1. **存在真实的无局部上界数值。** 明确包括道德系统的 `morality.value`、经济系统的 `economy.currency.totalCirculation`、聚落系统的 `settlement.population` 与 `settlement.yearsInCurrentTier`、势力动态系统的 `faction-dynamics.playerContribution`、开放力量框架中的战力系统 `combat-power.rankIndex/ranks`、气候系统的 `climate.temperatureOffset`，以及可达到 `Number.MAX_SAFE_INTEGER` 的寿命系统 `lifespan.maximumLifespanDays`。时间系统的 `time.totalDays` 与回合编排系统的 `orchestrator.totalRounds` 是有意单调增长的核心计数器，但同样没有本地上界。休眠路径中的命运预言系统 `fate-prophecy.causalityPenalty` 和信仰系统 `faith.daysInFaith` 也没有局部上界。
2. **大量完整历史只追加不收敛。** 历史事件账本、上下文迁移、关系转变、NPC 行为与记忆、地理变化、资源交易、成长与声望记录、健康条件、生态灭绝、天象历史、生命周期转变、摘要节点、相关性全量快照、因果延期、伏笔、核心人物互动和 Orchestrator 正文记录都没有 owning system 容量边界。
3. **最强的剧情辅助集中在主链。** 时间系统、回合编排系统、叙事解析系统、历史事件账本系统、非玩家角色系统、关系系统、角色基础属性系统、成长系统、声望系统、寿命系统、生命周期系统、健康系统、摘要压缩系统、记忆生命周期系统、延迟因果系统、剧情结构系统、伏笔系统与核心记忆系统能够实际改变后续 Prompt、历史事实、角色状态或终态。
4. **多个已激活系统仍是空壳或断链。** 命运预言系统（`fate-prophecy`）、神祇创建系统（`divine-creation`）、信仰系统（`faith`）、神明干预系统（`divine-intervention`）、异常现象系统（`anomaly-phenomena`）、物品系统（`item`）和作品系统（`works`）默认无活动写入；冲突周期系统（`conflict-cycle`）不能创建初始冲突；生态系统（`ecology`）不能由当前宏观链登记物种，导致怪物系统（`monster`）通常无物种；机缘系统（`fortune-encounter`）缺少候选接纳调用；记忆抽取系统（`memory-engine`）的抽取和记忆遗忘系统（`memory-forgetting`）的遗忘检查均无调用方。
5. **存在跨系统失真。** 工作收入不进入经济财富，聚落人口与全局人口各自演化，势力成员数只在初始化时复制人口，修炼天赋字段读取不到，修炼突破不约束战力晋升，子系统相关性的当前回合未同步，核心记忆与 NPC/关系系统维护平行关系投影。这些系统可能产生看似丰富但彼此不一致的剧情依据。

## 逐项审计

| # | 中文系统名称 / 机器标识 | 所有者 / 源码 | 数值与更新路径 | 边界、衰减与重置 | 增长结论 | 运行时消费者 | 剧情结论 | 证据 |
|---:|---|---|---|---|---|---|---|---|
| 1 | 世界上下文注册系统（`world-context-registry`） | `mod-world / world-context-registry-system.ts` | 注册、选择世界上下文并维护上下文映射 | 每个 ID 替换；新人生重置；上下文数量无本地容量 | 输入驱动集合无局部上界，非逐回合膨胀 | 世界初始化、空间、切换、存档、世界 Prompt | 高：决定当前世界身份与全部下游作用域 | `registerContext()`、`collectState()`、`prompt-context-runtime.ts` |
| 2 | 上下文能力配置系统（`contextual-capability-profile`） | `mod-world / contextual-capability-profile-system.ts` | 为每个上下文派生有限能力集合 | 一上下文一份替换状态；能力枚举有限；随上下文重置 | 有界，规模跟随上下文数 | Orchestrator 启用门控、超凡和 NPC 系统门控、Prompt 门控 | 高：阻止不适用规则进入运行和故事 | `refreshProfile()`、`contextHasCapability()`、`isSubsystemEnabledForCurrentContext()` |
| 3 | 空间关系图系统（`spatial-graph`） | `mod-world / spatial-graph-system.ts` | 增加节点、边、跨界出口和实体位置 | 稳定 ID 替换；无节点、边和位置容量；新人生重置 | 输入驱动集合无局部上界 | 同场 NPC/关系投影、实体校验、世界切换 | 高：提供场景邻接、同场关系和跨界路径 | `addNode()`、`addEdge()`、`setEntityLocation()`、NPC projection |
| 4 | 上下文切换系统（`context-transition`） | `mod-world / context-transition-system.ts` | 切换当前上下文、更新时间并追加迁移记录 | 当前上下文替换；`transitionHistory` 不淘汰；重置清空 | 迁移历史无局部上界 | 当前世界、旅行记忆、当地时钟、存档 | 高：多世界人生中直接改变叙事地点与可见事实 | `transition()`、`transitionHistory`、`collectState()` |
| 5 | 模拟范围策略系统（`simulation-scope-policy`） | `mod-world / simulation-scope-policy-system.ts` | 每轮更新 active、background、frozen 范围和活跃时间 | 每上下文固定一份替换状态；随上下文重置 | 有界 | Orchestrator 决定完整推进或后台推进 | 中高：真实控制哪些世界继续演化，故事中为间接效果 | `advance()`、`canRunFullRound()`、`canRunBackground()` |
| 6 | 世界初始化系统（`world-init`） | `mod-world / world-init-system.ts` | 初始化并保存单个世界快照 | 初始化结果替换；不逐回合追加；重置清空 | 生命周期有界 | 世界设置、区域、实体、空间与 Prompt 基础 | 高：是世界事实和后续模拟初始条件 | `initialize()`、`getSnapshot()`、`collectState()` |
| 7 | 历史事件账本系统（`historical-event-ledger`） | `mod-history-dynamics / historical-event-ledger-system.ts` | 追加事件、证据、状态迁移、候选和因果边 | 状态可迁移但原记录保留；无容量、衰减或淘汰 | 多类集合无局部上界 | 主 Prompt 历史投影、成就、因果、伏笔、记忆、死亡确认 | 高：当前最可靠的剧情事实与证据源 | `commitAppend()` 路径、`submitCandidates()`、`queryEvents()` |
| 8 | 世界实体系统（`world-entity`） | `mod-world / world-entity-system.ts` | 生成世界实体并登记稳定实体引用 | 同 ID 替换；实体和引用目录无容量；新人生重置 | 输入和叙事驱动集合无局部上界 | NPC 创建、关系端点、势力、聚落、空间校验 | 高：保证故事人物、组织和地点引用真实存在 | `generateEntities()`、`registerEntityReference()`、`assertEntityReference()` |
| 9 | 关系系统（`relationship-system`） | `mod-social / relationship-system.ts` | AI 建立/调整关系；每轮推进后台关系并追加转变 | 关系指标有界；关系和 `transitions` 不淘汰；后台关系每轮可追加观察 | 集合无局部上界，后台关系会稳定放大 | 主 Prompt、NPC 投影、历史事务、核心记忆 | 高：直接提供人物关系变化，但长期存储压力明显 | `advance()`、`preflightChanges()`、`transitions.push()` |
| 10 | 非玩家角色系统（`npc-system`） | `mod-npc / npc-system.ts` | AI 创建身份、目标、行为、记忆；每轮后台推进 | 当前身份可替换；行为、记忆和部分目标记录不淘汰 | 多类集合无局部上界 | 主 Prompt 同场 NPC、关系、历史事件、存档 | 高：能持续提供行动主体和人物动机 | `advance()`、`applyChanges()`、`background-progress.ts`、`projection.ts` |
| 11 | 地理系统（`geography`） | `mod-environment-ecology / geography-system.ts` | 初始化地理节点；推进和宏观影响记录地理变化 | 节点和变化记录无容量；变化不衰减；重置清空 | 变化历史无局部上界 | 主 Prompt 摘要、宏观影响完整状态、资源与空间系统 | 中高：能提供地形约束，但主故事通常只见摘要 | `advance()`、`recordMutation()`、`state.changes.push()` |
| 12 | 自然资源系统（`natural-resource`） | `mod-environment-ecology / natural-resource-system.ts` | 资源再生、消耗和宏观交易 | 数量限制在 0 与容量之间；矿藏和交易记录不淘汰 | 数值有界，交易集合无局部上界 | 主 Prompt 摘要、宏观影响、经济和生态背景 | 中高：资源紧张可形成有效世界压力 | `advance()`、`recordTransaction()`、`state.transactions.push()` |
| 13 | 气候系统（`climate`） | `mod-environment-ecology / climate-system.ts` | 季节推进、灾害到期、宏观调整温湿度基线 | 季节和湿度有界；灾害到期移除；`temperatureOffset` 只累加不钳制 | 温度偏移无局部上界 | 主 Prompt 摘要、宏观影响、污染和生态 | 高：季节与灾害能形成直接场景条件；长期温度可能失真 | `advance()`、`adjust-baseline`、`state.temperatureOffset +=` |
| 14 | 生态系统（`ecology`） | `mod-environment-ecology / ecology-system.ts` | 物种按年增长，宏观影响只可调种群和栖息地 | 指标 0 至 100；种群 0 至承载量；灭绝记录不淘汰 | 数值有界，灭绝记录无局部上界 | 宏观影响、主 Prompt 摘要、怪物系统 | 低：初始物种为空，当前宏观契约不能登记物种，通常没有可用生态事实 | `ensure()`、`register-species` 私有路径、宏观契约仅含调整操作 |
| 15 | 污染系统（`pollution`） | `mod-environment-ecology / pollution-system.ts` | 排放减衰减并受灾害脉冲影响 | 各节点和全局指数钳制 0 至 100；一空间节点一份 | 有界 | 主 Prompt 摘要、宏观影响、生态栖息地 | 中高：能形成稳定环境压力并反馈生态 | `advance()`、`clamp()`、`recalculate()` |
| 16 | 成长系统（`growth-system`） | `mod-progression / growth-system.ts` | AI 学习、练习技能及获得、调整能力 | 经验不超过潜力；能力潜力 0 至 100；使用次数可至最大安全整数；技能、能力、记录不淘汰 | 集合和使用次数有效无局部上界 | 主 Prompt、角色属性分析、宏观影响的玩家证据 | 高：受校验写入能把故事行为转为稳定成长事实 | `practice-skill`、`state.skills/abilities/records.push()` |
| 17 | 成就系统（`achievement`） | `mod-progression / achievement-system.ts` | 每轮扫描完整历史账本并刷新进度、解锁 | 每定义每角色一份进度；匹配事件 ID 随历史增长；定义可追加 | 证据集合无局部上界 | 主 Prompt、玩家成就投影、历史事件提交回调 | 高：完全由已确认历史事实驱动，结果可信 | `advance()`、`refreshEntity()`、`matchedEventIds` |
| 18 | 声望系统（`reputation`） | `mod-progression / reputation-system.ts` | AI 按作用域与维度调整评价并记录变化 | 分数钳制 -100 至 100；稳定评价替换；变化日志不淘汰 | 数值有界，日志无局部上界 | 主 Prompt、宏观影响玩家证据、势力和社会判断 | 高：能把社会反馈转为后续叙事条件 | `preflightChanges()`、`state.changes.push()` |
| 19 | 角色基础属性系统（`character-base`） | `mod-character / character-base-system.ts` | AI 调整基础属性；汇总命格、健康、生命周期和上下文修正 | 属性按凡人或超凡硬上限钳制；固定字段替换；上下文修正可清除 | 核心数值有界 | 主 Prompt 角色视图、健康、生命周期、修炼和结算 | 高：角色能力与故事结果的直接公共状态 | `clampAttr()`、`recalculateCurrent()`、基础属性后台分析 |
| 20 | 命格系统（`destiny-pattern`） | `mod-character / destiny-pattern-system.ts` | 创建期生成候选并固定选择 3 条命格 | 正常流程候选池有限且可清空；已选列表替换；不逐回合增长 | 生命周期有界 | 主 Prompt 天赋、角色属性修正、开局创建流程 | 高：开局特质真实影响属性和叙事设定 | `selectPatterns()`、`clearCandidates()`、`getAttrBonuses()` |
| 21 | 寿命系统（`lifespan`） | `mod-character / lifespan-system.ts` | 创建寿命档案；AI 可设置规则或增减最大寿命 | 最小 1 天，上限为最大安全整数；调整记录不淘汰 | 业务值有效无局部上界，日志无局部上界 | 健康死亡、生命周期、主 Prompt、结算 | 高：直接决定老死边界，但极端上限会让生命周期失去约束 | `maximumLifespanDays` 校验、`recordAdjustment()` |
| 22 | 生命周期系统（`lifecycle-system`） | `mod-character / lifecycle-system.ts` | 根据规范时间计算年龄和生命阶段，跨阶段追加转变 | 当前实体和档案替换；年龄可至最大安全整数；转变不淘汰 | 单调年龄和转变历史无局部上界 | 角色属性修正、健康老死、主 Prompt | 高：能把时间跨度转为可叙述的人生阶段 | `refreshEntity()`、`state.transitions.push()` |
| 23 | 健康系统（`health`） | `mod-character / health-system.ts` | 每轮恢复、伤病倒计时；AI 调整生命并登记伤病 | 生命、体力、精神有界；活动伤病会解决，但完整条件记录保留；死亡待历史确认后清理 | 核心值有界，条件历史无局部上界 | 主 Prompt、属性修正、历史死亡事件、终局与结语 | 高：生存状态、伤病和死亡均有完整消费链 | `advance()`、`conditions.push()`、`onHistoricalEventsCommitted()` |
| 24 | 气运系统（`luck`） | `mod-character / luck-system.ts` | 本地随机初始化；每轮生成一次叙事方向并衰减通知 | 气运固定在 -10 至 10；引导按回合替换；通知倒计时归零 | 有界 | 第一次主叙事调用、本轮叙事方向、存档 | 高：实际改变叙事好坏方向且不由 AI 自写 | `prepareNarrativeGuidance()`、`clampLuck()` |
| 25 | 道德系统（`morality`） | `mod-character / morality-system.ts` | 主叙事后台按事件增减道德值 | `value += delta`，没有钳制、衰减或局部上限；新人生重置 | 数值无局部上界 | 主 Prompt、结算道德标签和评分 | 高但有失真风险：长期值会超出标签设计量级 | `applyChanges()`、`state.value += delta` |
| 26 | 天象系统（`celestial`） | `mod-base-universe / celestial-system.ts` | 投影当地年内日；特殊天象到期进入历史 | 年内日有界；活动天象到期；历史不淘汰 | 历史集合无局部上界 | 主 Prompt 摘要；特殊天象 API | 中：自然历法有效，但特殊天象没有当前叙事写入方 | `advance()`、`state.history.push()`、无活动调用方 |
| 27 | 纪元系统（`era`） | `mod-base-universe / era-system.ts` | 从当地时钟派生纪元年、年内日和阶段 | 年内日有界；纪元年随时间单调增长；不保存历史 | 有意单调计数，无局部上界 | 主 Prompt 时间语境、界面时间显示 | 高：时间叙事统一且不复制全局时钟 | `advance()`、`localYear = anchorYear + floor(...)` |
| 28 | 命运预言系统（`fate-prophecy`） | `mod-base-universe / fate-prophecy-system.ts` | 预言进度随时间增长；打破时增加因果惩罚 | 进度 0 至 100；预言和预兆可累积；因果惩罚不钳制 | 休眠路径含无界数值和集合 | 仅摘要与公共 API | 无：当前没有创建、应验或打破预言的活动写入方 | `advance()`、`causalityPenalty +=`、无活动调用方 |
| 29 | 神祇创建系统（`divine-creation`） | `mod-base-universe / divine-creation-system.ts` | 公共变更可登记神祇和状态 | 神祇列表无容量；默认空；新人生重置 | 休眠集合无局部上界 | 仅摘要与神明干预预期链路 | 无：当前没有神祇登记调用，神明相关系统缺少基础实体 | `applyChanges()`、`deities: []`、无活动调用方 |
| 30 | 经济系统（`economy`） | `mod-economy / economy-system.ts` | 本地公式推进产出、货币、价格；宏观背景继续由本地系统维护 | 税率、采用率等有界；货币流通量没有容量，只防止负数 | `totalCirculation` 无局部上界 | 主 Prompt 摘要、时间桥 | 中：宏观背景有效，但工作收入不进入玩家财富 | `advance()`、货币供应增量、本地经济状态 |
| 31 | 人口系统（`population`） | `mod-economy / population-system.ts` | 按出生、死亡、迁移和承载量推进 | 总人口限制在 0 与承载量；比例有界；一上下文一份 | 有界 | 宏观影响完整状态、时间桥、聚落和政治初始化 | 中：模拟有效，但被主故事 Prompt 显式排除 | `advance()`、carrying capacity、`prompt-context-runtime.ts` 排除项 |
| 32 | 聚落系统（`settlement`） | `mod-economy / settlement-system.ts` | 每轮独立推进聚落人口、层级年数、繁荣与安全 | 繁荣、安全有界；人口和当前层级年数没有上限 | 两个业务值无局部上界 | 主 Prompt 摘要、宏观影响、工作和政治背景 | 低中：有状态，但人口与全局人口独立演化并可能矛盾 | `advance()`、`populationDelta()`、`yearsInCurrentTier` |
| 33 | 职业系统（`work`） | `mod-economy / work-system.ts` | 每轮计算收入、满意度和晋升 | 满意度与晋升进度有界；职业等级受晋升表约束；职业史可增长 | 主要数值有界，职业史可累积 | 主 Prompt 摘要、宏观影响玩家证据 | 低中：职业状态可见，但收入不写入经济财富 | `advance()`、`income`、无 economy wealth 写入调用 |
| 34 | 物品系统（`item`） | `mod-economy / item-system.ts` | 公共变更可维护物品与数量 | 数量非负；物品集合无容量；默认空 | 休眠集合无局部上界 | 仅主 Prompt 摘要候选与 Store | 无：当前叙事白名单和宏观链都不能创建物品 | `items: []`、`applyChanges()`、无活动调用方 |
| 35 | 文化系统（`culture`） | `mod-culture / culture-system.ts` | 每轮缓慢演化传统、改革、艺术和价值维度；宏观 AI 调整 | 主要指标与价值维度钳制 0 至 100 | 有界 | 主 Prompt 摘要、宏观影响、艺术和教育 | 中高：能提供稳定社会价值背景 | `advance()`、`clamp()`、宏观影响契约 |
| 36 | 艺术系统（`art`） | `mod-culture / art-system.ts` | 根据文化与时间推进艺术繁荣、影响和阶段 | 指标有界；当前状态替换；无作品级长期记录 | 有界 | 主 Prompt 摘要、文化系统 | 中：能提供时代艺术氛围，但缺少具体作品来源 | `advance()`、`collectState()` |
| 37 | 教育系统（`education`） | `mod-culture / education-system.ts` | 根据文明、经济和文化推进识字、覆盖和质量 | 比率与质量 0 至 100；当前聚合状态替换 | 有界 | 主 Prompt 摘要、文化与社会背景 | 中：宏观教育条件有效，个人教育事件仍较弱 | `advance()`、`clamp()`、`collectState()` |
| 38 | 作品系统（`works`） | `mod-culture / works-system.ts` | 公共变更可登记作品、传播与影响 | 作品列表无容量；传播指标有界；默认空 | 休眠集合无局部上界 | 仅主 Prompt 摘要候选、宏观影响玩家证据 | 无：当前没有作品登记调用方 | `works: []`、`applyChanges()`、无活动调用方 |
| 39 | 社会阶层系统（`social-stratification`） | `mod-politics / social-stratification-system.ts` | 根据人口和社会状态推进阶层份额、特权和流动壁垒 | 份额、特权、壁垒 0 至 100；群体集合来自初始化 | 有界 | 主 Prompt 摘要、宏观影响、政治背景 | 中高：能提供可消费的阶层压力 | `advance()`、`clamp()`、宏观影响契约 |
| 40 | 势力动态系统（`faction-dynamics`） | `mod-politics / faction-dynamics-system.ts` | 从世界实体初始化势力；宏观 AI 调影响、关系和玩家贡献 | 影响和关系有界；玩家贡献只累加；成员数初始化后不刷新 | `playerContribution` 无局部上界，成员数会陈旧 | 主 Prompt 摘要、宏观影响、事件生命周期 | 低中：格局可用，但人口证据与玩家贡献长期失真 | `ensure()`、`adjust-contribution`、`memberCount` 初始化复制 |
| 41 | 法律制度系统（`legal`） | `mod-politics / legal-system.ts` | 根据文明推进执行、腐败；宏观 AI 调制度指标 | 执行和腐败 0 至 100；法律列表默认空且无宏观创建操作 | 核心数值有界 | 主 Prompt 摘要、宏观影响、社会背景 | 中：制度强弱有效，但具体法律内容通常为空 | `advance()`、宏观 `adjust-institution`、`laws: []` |
| 42 | 冲突周期系统（`conflict-cycle`） | `mod-politics / conflict-cycle-system.ts` | 推进已有冲突张力和阶段；宏观 AI 只能调整张力 | 张力有界；冲突列表无容量；初始为空 | 当前不增长；若有冲突则集合无局部上界 | 主 Prompt 摘要、宏观影响 | 无：没有创建初始冲突的活动路径，调整操作没有目标 | `conflicts: []`、宏观契约仅 `adjust-tension` |
| 43 | 文化科技系统（`culture-tech`） | `mod-tech-level / culture-tech-system.ts` | 每轮推进知识成熟、研究能力和趋势；宏观 AI 可加应用与趋势 | 成熟、扩散、强度有界；趋势到期；应用列表不淘汰 | 应用集合无局部上界 | 宏观影响完整状态；主故事 Prompt 显式排除 | 中：宏观分析可用，但细节不会直接帮助下一轮主故事 | `advance()`、`domain.applications.push()`、Prompt 排除项 |
| 44 | 战力系统（`combat-power`） | `mod-power-system / combat-power-system.ts` | 按经过时间自动增加进度并晋升；开放体系可追加阶位 | 有界体系受固定阶位数限制；开放体系阶位和 `rankIndex` 无上限 | 开放框架数值与集合无局部上界 | 主 Prompt 摘要、宏观影响玩家证据 | 低中：提供力量标签，但纯时间晋升绕过修炼瓶颈 | `advance()`、`state.progress +=`、`framework.ranks.push()` |
| 45 | 修炼系统（`cultivation`） | `mod-power-system / cultivation-system.ts` | 计算训练倍率、瓶颈和突破概率 | 概率和倍率有界；失败、成功状态可替换 | 有界 | 主 Prompt 摘要、宏观影响玩家证据 | 低：读取不到 `character-base.data.talentTags`，突破结果也不约束战力晋升 | `advance()`、`getBreakthroughChance()`、无战力消费者 |
| 46 | 怪物系统（`monster`） | `mod-power-system / monster-system.ts` | 从生态怪物物种派生威胁并记录遭遇 | 威胁有界；遭遇记录不淘汰；依赖生态物种 | 遭遇集合无局部上界，但当前通常为空 | 主 Prompt 摘要、战力修正 API | 低：生态默认无物种，战力修正 API 也没有调用方 | `advance()`、`state.encounters.push()`、`getCombatPowerVsMonsterModifier()` 无调用 |
| 47 | 机缘系统（`fortune-encounter`） | `mod-power-system / fortune-encounter-system.ts` | 冷却归零后生成一个候选机缘 | 冷却衰减；候选只有显式操作才清除；当前无接纳调用 | 当前通常卡在首个候选，非正常增长 | 主 Prompt 摘要 | 低：候选可出现，但 accepted 或 expired 仍阻塞后续候选，奖励链未完成 | `advance()`、`activeEncounter` 判定、无接纳调用方 |
| 48 | 信仰系统（`faith`） | `mod-power-system / faith-system.ts` | 建立信仰后累计信仰天数并计算虔诚突破修正 | 虔诚 0 至 100；`daysInFaith` 只累加；默认无信仰 | 休眠路径数值无局部上界 | 主 Prompt 摘要、突破修正 API | 无：没有建立信仰调用，突破修正也没有消费者，默认摘要容易成为噪声 | `advance()`、`daysInFaith +=`、`getFaithBreakthroughBonus()` 无调用 |
| 49 | 神明干预系统（`divine-intervention`） | `mod-power-system / divine-intervention-system.ts` | 推进神谕、神迹持续时间与严重度 | 活动项到期；严重度有界；默认列表为空 | 当前有界且休眠 | 主 Prompt 摘要候选 | 无：没有神祇基础实体和干预写入调用 | `advance()`、`activeOracles/activeMiracles`、无活动调用方 |
| 50 | 异常现象系统（`anomaly-phenomena`） | `mod-power-system / anomaly-phenomena-system.ts` | 推进异常区域、活动状态和全局不稳定度 | 不稳定度有界；区域列表无容量；默认空 | 休眠集合无局部上界 | 主 Prompt 摘要、危险检查 API | 无：没有异常创建调用，`checkZoneHazard()` 没有消费者 | `state.zones.push()`、`checkZoneHazard()` 无调用 |
| 51 | 时间系统（`time`） | `mod-engine / time-system.ts` | 每回合按玩家时间步长增加规范时间 | 日、月、季内部归一；`totalDays` 和年份单调增加；只在新人生重置 | 有意的无局部上界核心计数器 | 所有时间相关系统、Prompt、存档、生命周期 | 高：项目统一时间源；增长是业务必要但需防数值溢出 | `advance()`、`round.totalDays +=`、`exportRound()` |
| 52 | 回合编排系统（`orchestrator`） | `mod-engine / orchestrator-system.ts` | 每轮编排、接纳正文、记录后台分析和迁移审计 | 已删除整局回合上限；正文、分析记录和 `totalRounds` 不淘汰；新人生重置 | 核心计数和多类集合无局部上界 | 页面推进、全部子系统、AI、历史、记忆、存档 | 高：唯一回合总指挥，但也是最大长期容量来源 | `executeRoundV2()`、`narrativeHistory`、后台分析记录 |
| 53 | 叙事解析系统（`narrative-parser`） | `mod-engine / narrative-parser-system.ts` | 解析本次 AI 正文与分支并保存最后结果 | `lastResult` 每次替换；重置清空 | 有界 | 正文接纳、分支、事件识别和后台分析 | 高：严格解析是正文进入游戏的必要门 | `parse()`、`getLastResult()` |
| 54 | 摘要压缩系统（`summary-compressor`） | `mod-engine / summary-compressor-system.ts` | 按 4、16、64 轮生成 L1、L2、L3 摘要节点 | 新层节点追加，低层节点和原摘要不删除；无节点容量 | 摘要集合无局部上界 | 主 Prompt 时间线、记忆数据库、压缩闸门 | 高：显著提升长期剧情连贯性，但不会降低持久化总量 | `createCompressionCandidate()`、`summaries` 追加、`commitCompressionCandidate()` |
| 55 | 记忆抽取系统（`memory-engine`） | `mod-engine / memory-engine-system.ts` | 可从正文和属性抽取人物、关系、地点与重大事件 | 多类数组不淘汰；当前抽取方法没有调用方 | 休眠集合无局部上界 | 理论上的记忆摘要 | 无：`extractFromNarrative()` 与 `extractFromAttr()` 均未接入回合 | 两个抽取方法无调用方、`collectState()` 仅报告默认记忆 |
| 56 | 子系统相关性系统（`subsystem-relevance`） | `mod-engine / subsystem-relevance-system.ts` | 每次状态收集保存所有系统完整快照，并记录摘要变化 | `stateHistory` 和 `changeRecords` 只追加；读取窗口不删除源；`setRound()` 无调用 | 高速集合无局部上界 | 主 Prompt 相关性过滤、系统变化摘要 | 中：静态相关性有效，但当前回合未同步导致近期过滤口径错位 | `recordState()`、`recordChange()`、`getRelevantStates()`、`setRound()` 无调用 |
| 57 | 记忆生命周期系统（`memory-lifecycle`） | `mod-engine / memory-lifecycle-system.ts` | 接纳事件、评分、聚合、建立检索索引和时间线 | 已压缩 L0 可清理；搜索索引、原始记录和统计持续增长 | 多类集合无局部上界 | 主 Prompt 时间线、实体检索、摘要压缩 | 高：实际提供长期可检索剧情记忆，但容量不收敛 | `addEvent()`、`addToIndex()`、`clearTaggedEventsThrough()` |
| 58 | 记忆遗忘系统（`memory-forgetting`） | `mod-engine / memory-forgetting-system.ts` | 可衰减摘要权重并维护因果保护标记 | 配置有界；因果标记可累积；核心检查没有调用方 | 当前休眠；潜在集合无局部上界 | 理论上的摘要遗忘和人物保护 | 无：`checkForforgetting()` 未进入活动压缩或回合链 | 方法无调用方、`collectState()` 统计保持默认 |
| 59 | 延迟因果系统（`causal-delay`） | `mod-engine / causal-delay-system.ts` | 登记延期因果、到期触发、呈现和提交处置 | 状态会迁移但完整因果记录保留；无容量 | 因果记录无局部上界 | 主 Prompt 因果提示、历史事务、事件识别 | 高：能够把早期选择转为后续可验证后果 | `recordCausalEvent()`、`checkCausalTrigger()`、`commitCausalDispositions()` |
| 60 | 剧情结构系统（`plot-structure`） | `mod-engine / plot-structure-system.ts` | 每轮根据冲突和信号推进阶段与张力 | 张力有界；阶段有限；`phaseHistory` 不淘汰 | 阶段历史无局部上界 | 主 Prompt 剧情结构指导 | 高：实际提供节奏与阶段约束 | `collectState()` 内推进、`recordNarrativeSignals()`、`phaseHistory.push()` |
| 61 | 伏笔系统（`foreshadowing`） | `mod-engine / foreshadowing-system.ts` | 识别、激活和解决伏笔并生成 Prompt 文本 | 分值有界；活动和已解决记录保留；无容量 | 伏笔记录无局部上界 | 主 Prompt 伏笔提示、历史事件识别 | 高：能维持铺垫和回收，但长期记录不收敛 | `detectForeshadowing()`、`resolveForeshadowing()`、`active/resolved` |
| 62 | 核心记忆系统（`core-memory`） | `mod-engine / core-memory-system.ts` | 事件识别后按人物追加关系互动记录并生成关系网文本 | 每人物记录不淘汰；新人生重置 | NPC 互动记录无局部上界 | 主 Prompt 人物关系网、创建时间线、遗忘保护 | 高但重复：确实辅助人物连续性，同时与 NPC 和关系系统形成平行投影 | `recordRelationshipUpdates()`、`buildNPCNetworkText()`、`npcMap` |

## 审计结论

- 当前不能把“系统有状态”“有 `advance()`”或“有 `applyChanges()`”等同于系统有效。有效系统必须同时具备输入、状态变化、下游消费和玩家或下一轮叙事可见结果。
- 数值膨胀与剧情质量是同一问题的两面：无界数值会让摘要失真，无界历史会扩大存档和 Prompt 派生成本，断链系统则会把默认值或陈旧值包装成剧情依据。
- 本报告只记录结论。本次除删除未经授权的整段人生回合上限外，没有调整任何系统数值、公式、Prompt、AI 调用、公共字段或持久化结构，也没有修复表中其他问题。
