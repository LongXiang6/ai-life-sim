# 现行与废弃核心模拟机制对比矩阵

文档角色：废弃机制历史对照
状态：按需读取
适用范围：`D:\AI\废弃项目` 与当前核心模拟的历史差异证据
运行真源：`src/mods/mod-engine/helpers/mvp-stages-config.default.json` 与各表列出的实时代码

本文件不定义活动权威、执行顺序或恢复要求。当前任务按 `docs/authority-index.md` 路由，仅在用户要求对照废弃机制时读取对应章节。

## 1. 结论

现行项目不是废弃项目的逐文件迁移版。废弃项目有 51 个 `*-system.ts` 叶子库存，其中 45 个被 `world-domain.ts`、`society-domain.ts`、`character-domain.ts` 直接引用；另外 6 个不在三域同步调用集合中，分别走初始化、格式化或叙事报告后处理，或者只有 barrel 导出。旧 `life-sim-engine` 和 `orchestrator-v2` 再把三域状态、跨域联动、AI 正文解析和浏览器状态串成一条集中链。

现行 `src/mods/**/subsystems/**/*-system.ts` 共有 77 个系统文件，但 MVP 白名单只注册 13 个 external 和 12 个 engine，共 25 个 active runtime 成员；其余 52 个是非 active 文件，不能由文件存在推断运行。现行运行权威改为 `TimeSystem -> orchestrator -> owning subsystem`，先交付多世界上下文、历史事实账本、玩家角色核心和可验证叙事主链；P2-P8 的环境、社会、经济、政治、力量和大规模 NPC 模拟明确不在当前 runtime。

因此，当前版本在叙事一致性、状态边界、可恢复性、分支连续性、AI 输出验证和隐私运维上明显强于废弃项目；在宏观社会、经济、环境和力量域的逐轮数值覆盖上则是**有意缩小的 MVP 范围**，不是功能等价。不能为了“系统数量对齐”把废弃项目的同步域循环、正文正则推断或无界乘法公式迁回现行实现。

## 2. 对照方法与范围

1. 本文路径以项目根 `D:\AI\ai-life-sim` 为基准；废弃项目根是 `../废弃项目`，即 `D:\AI\废弃项目`。旧叶子枚举范围是 `../废弃项目/src/lib/engine/systems/{character,society,world}/*-system.ts` 的 51 个文件，旧非叶子范围覆盖 `engine/{bridges,character,core,domains,world}`、Prompt、storage、state 和调用它们的 UI hook。
2. 旧三域直接链通过三个 `*-domain.ts` 的静态 import 去重得到 45 个；剩余 6 个逐一追踪调用方，不能把“库存 51”写成“每轮同步运行 51”。
3. 现行文件库存通过 `src/mods` 下递归枚举 `*-system.ts` 得到 77；运行范围只以 `mvp-stages-config.default.json` 为准：13 个 external 节点和 12 个 engine 节点，共 25 个 active runtime 成员，剩余 52 个统一记为 non-active，而不是笼统宣称都已运行或都已删除。
4. 旧 `SystemContext` 的接口在 `../废弃项目/src/lib/state/life-sim-types.ts` 明确声明 53 个字段；`orchestrator-v2.ts` 的注释口径是 39 个配置驱动字段加 14 个特殊字段。不能沿用此前“约 49 个”或“约 55 个系统”的估算口径。
5. 每个映射按“当前 owner + 当前 lifecycle”判定：`active`、`partial`、`deferred`、`retired`。`partial` 表示保留了结构或只读投影，但没有恢复旧系统的逐轮业务公式。
6. 所有旧项目正文、Prompt 和本地存档只作为历史材料；现行事实与玩家状态以当前 Schema、账本和存档恢复链为准。

## 3. 运行架构差异

| 机制 | 废弃项目 | 现行项目 | 处置与影响 |
|---|---|---|---|
| 回合主控 | `life-sim-engine.ts`、`orchestrator-v2.ts` 同时构建上下文、推进三域、调 AI、解析和写回 | `TimeSystem` 拥有 canonical `daysPassed/totalDays`，`orchestrator` 拥有阶段、预检、提交、回滚和自动保存 | 已替换。消除第二时间源和跨域直接写入。 |
| 系统激活 | 三个 domain 每轮固定顺序推进大量系统 | MVP runtime 白名单只激活 25 个节点；P2-P8 显式延后 | 已替换。避免“文件存在即运行”的隐式行为。 |
| 状态所有权 | `DomainStates`、reducer、多个 localStorage 片段和 Prompt 文本并存 | 每项可变状态有 owner；Store 仅为兼容投影，历史事件、世界上下文和人生状态各有 Schema/恢复路径 | 已替换。投影不提升为事实。 |
| 时间与年龄 | AI `skip/stay` 和 `totalMonths` 共同影响推进；旧解析器可由输出字段改变时间 | 本地 `TimeSystem` 先计算 RoundContext；AI 只能在允许的结构化语义中提出变化 | 已替换。AI 不再拥有时间权威。 |
| 跨域联动 | `cross-domain-linker` 和 `event-linker` 直接修改多个域的对象 | 历史事件账本、因果边、延迟因果由 owner 预检、提交和引用；叙事只提交允许字段 | 已替换。跨域关系不建立第二状态真源。 |
| 失败与事务 | AI/解析/局部 state 常以兜底文本或局部字段继续 | Structured META 预检后整包提交；任一非法写入回滚 META，合格正文保留 | 已替换。正文与状态失败面分离。 |
| AI 上下文字段 | `SystemContext` 明确声明 53 个文本字段；编排器按“39 个配置驱动 + 14 个特殊字段”构建 | 当前 Prompt 使用固定系统命令、派生组件和按 scope 的事实投影，不把系统文件数等同于上下文字段数 | 已替换。字段规模、系统库存与 active 数量采用三套独立口径。 |
| 兼容记忆注册 | 旧 `core/memory.ts` 从正文关键词/正则提取关系、状态和事件 | `memory-engine` 是 active 注册成员，但 `extractFromNarrative`/`extractFromAttr` 没有接入当前正文提交链；结构化关系由 orchestrator 提交给 `core-memory` | partial。保留兼容投影，禁止恢复正文正则为事实写入。 |

## 4. 逐域机制映射

### 4.1 世界、空间与环境

| 废弃机制 | 当前 owner / 状态 | 差异与处置 |
|---|---|---|
| `world-map`、`terrain`、`settlement-world` | `spatial-graph`、`world-context-registry` active；旧数值地图/地形/聚落演化 deferred | 现行先保证稳定 contextId、节点、边、出口和实体位置；不恢复每轮随机地图演化。 |
| `season`、`temperature`、`humidity` | `time` active 提供日历；气候细节 deferred | 现行日历是唯一时间源，季候叙事来自 canonical calendar，不由并行环境系统改写时间。 |
| `climate`、`ecology`、`resource-abundance`、`pollution` | 对应 MOD 源码 deferred | 旧系统可每轮直接影响人口、健康和事件；当前未把这些公式接入玩家人生，避免未经校准的连锁写回。 |
| `population`、`population-mobility`、`race-diversity`、`literacy` | 对应 MOD 源码 deferred | 当前实体/世界事实可被记录和投影，但不运行旧人口与社会统计循环。 |
| `celestial`、`divine`、`monster`、`era-evolution`、`direction` | `mod-base-universe`、`mod-power-system` 源码 deferred；`plot-structure` active 只拥有叙事结构 | 保留未来实现空间；不得把叙事方向提示误当作世界数值演化。 |
| 世界初始化 | 旧项目并行生成标签、参数、时间线、实体，分别写 localStorage | `world-init` active 一次生成一个经验证的 `WorldContextInstance`，同时建立能力、空间、时钟和初始化事实 | 已替换。初始化不再产生四份松散的可变真源。 |
| 多世界与迁移 | 旧项目按 `worldCode` 存储，缺少稳定上下文/范围契约 | `context-transition`、`simulation-scope-policy`、`spatial-graph` active | 新增。原子迁移、局部时钟同步和 rollback 是废弃项目没有的能力。 |

### 4.2 社会、经济、文化与政治

| 废弃机制 | 当前 owner / 状态 | 差异与处置 |
|---|---|---|
| `market-cycle`、`currency`、`trade-route` | `mod-economy` 源码 deferred | 旧价格和货币循环不在当前 runtime；现行没有假装提供实时宏观经济。 |
| `industry`、`culture-tech`、`education`、`art`、`tradition` | 对应 culture/tech MOD 源码 deferred | 旧域每轮同步推进，现行等待 P2-P8 的 owner、范围和校准方案后再启用。 |
| `faction-dynamics`、`nation-relation`、`legal`、`noble-house`、`class-structure`、`social-class` | `world-entity` active 只拥有命名实体；politics MOD 的动态系统 deferred | 现行可引用国家、势力和家族等实体，但不执行废弃项目的无作用域政治数值循环。 |
| 社会事件到正文 | 旧 domain 将大量格式化字符串塞入 `SystemContext` | 当前 `historical-event-ledger` active 输出已验证、按 scope 过滤的事实投影 | 已替换。不会把未审计的候选或旧文字当发生事实。 |

### 4.3 角色、关系、能力与死亡

| 废弃机制 | 当前 owner / 状态 | 差异与处置 |
|---|---|---|
| 基础属性与年龄 | `character-base` active | 当前只允许四项创建分配和四项结构化 delta；旧项目的自由 dynamic attrs 不再形成平行角色真源。 |
| `luck` | `luck` active | 保留为拥有疾病、事件权重和衰老修正的专属系统，不直接生成事件。 |
| `lifespan` | `lifespan` active | 保留寿命和突破，但当前年龄仍由 TimeSystem 决定。 |
| 善恶 | `morality` active | 当前只接受结构化 delta；不从正文关键词推断善恶。 |
| `health`、`age-decay`、`life-stage` | 对应 character MOD 源码 deferred | 旧健康/伤病和衰减公式不在 MVP 回合运行；不会用“病危”等正文关键词直接改数值。 |
| `skill`、`knowledge`、`item`、`work`、`economy`、`settlement` | culture/economy MOD 源码 deferred | 旧个人经营循环未迁回，防止无 owner 的多系统直接写入角色状态。 |
| `relationship`、`family`、`disciple`、`reputation`、`achievement` | `core-memory` active 接收 orchestrator 已验证的结构化关系更新；`historical-event-ledger` active 拥有事件事实；具体业务系统 deferred | `memory-engine` 虽 active 注册，但正文/属性正则提取未接线且不得恢复。当前关系事实不由自由正文自动造出。 |
| `combat-power`、`cultivation`、`faith` | power MOD 源码 deferred | 未恢复旧力量值联动；能力画像由 context capability profile 控制可用组合。 |
| `afterlife-simulation`、旧 game-over | `post-death-epilogue` 源码存在但不在 MVP runtime；结算页消费已提交人生状态 | 不把旧死后模拟混入主回合；终局扩展等待明确 lifecycle。 |

### 4.4 叙事、分支、记忆与因果

| 机制 | 废弃项目 | 现行项目 | 处置与影响 |
|---|---|---|---|
| 主叙事协议 | JSON/compact JSON 兼容、字段宽松；失败时从原文拼接或提取部分正文 | 严格中文 `正文 -> 可选摘要 -> 可选数据 -> 结束` 信封，Schema 与字段白名单 | 已替换。协议不完整时不能悄悄应用状态。 |
| 正文推断 | `narrative-parser.ts` 从“重病”“行善”等关键词和正则推断健康、善恶、属性 | 正文不拥有业务状态；AI 只能提交 owner 定义的结构化字段 | 已替换。消除文风变化导致数值误写。 |
| 分支生成 | `branch=true` 且没选项时本地补造三条默认选项；选择按历史数组 index 保存 | `BranchIntent` 以稳定 branchId 存储活动、终结和 superseded 状态；同一确认不重置进度 | 已替换。不会让默认选项或数组位移改写玩家主线。 |
| 强制分支 | Prompt 同时受普通冷却、刚确认选择和强制提示影响；补救缺少人生 owner | 强制分支覆盖普通冷却；后台补救携带 `lifeGeneration + lifeRunId + round + sourceNarrative` 门禁 | 已替换。旧结果不能跨人生或跨回合落地。 |
| 选择后的连续性 | `resolvedBranches` 只保留选择文字，缺少进行中/阻塞/终结生命周期 | `progressing/blocked` 保持 active，`succeeded/partially_succeeded/failed` 归档；新同目标选择显式 supersede | 新增。直接解决本次“分支异常连续”的根因。 |
| 重复检测 | 无逐局、逐轮文本质量指标，也无受控修复 | 中文 `Intl.Segmenter` + 正则 fallback，近五轮词重复率、词集合与 5-gram 相似度；后台正文-only 候选与独立事实审计 | 新增。首轮不计入均值，修复不新增回合或重放 META。 |
| 记忆抽取 | `memory.ts` 用大量世界观关键词/正则，从正文抽取配偶、敌人、财富、地点等 | `memory-engine` 只保留 active 注册和兼容状态投影，正文/属性正则方法没有运行接线；orchestrator 把已验证 `relationshipUpdates` 写入 `core-memory`，事件事实进入历史账本 | 已替换事实写入链。避免叙事提及被误升格为事实。 |
| 压缩与遗忘 | 10 轮块、延迟块总结；实现中允许由对话窗口和列表裁剪决定可见历史 | 覆盖标记、分层语义压缩、近期完整原文、可解释遗忘；失败时保留叶子 | 已替换。符合 PD-015，禁止按字符/条数硬删故事语义。 |
| 事件、伏笔、延迟因果 | 事件文本、local direction、随机/规则联动混合在 core | `historical-event-ledger`、`foreshadowing`、`causal-delay` 各自拥有 ID、scope、候选审计与提交边界 | 已替换。事实、候选和未来承诺可追溯。 |

### 4.5 AI、并发、持久化与运营

| 机制 | 废弃项目 | 现行项目 | 处置与影响 |
|---|---|---|---|
| Prompt 组装 | 每轮拼装 53 字段 `SystemContext`；编排器注释口径为 39 个配置驱动字段加 14 个特殊字段 | 固定系统命令 + 派生组件 + scope 事实投影；活动 BranchIntent 是选择唯一投影 | 已替换。避免重复注入选择和相互冲突的硬提示。 |
| 受保护 Prompt/凭据 | 浏览器配置与客户端 AI 调用耦合较紧 | server prompt asset 白名单、服务器凭据和受限诊断；浏览器不保存托管目标/Key | 已替换。 |
| 预生成与晚到结果 | 队列以本地 ref 和 generation 为主，缺少跨人生、同一历史条目终检 | round token、lifeGeneration、lifeRunId、源正文和最新条目共同门禁 | 已替换。重复改写和分支补救不会覆盖下一真实回合。 |
| 保存/恢复 | `life-sim-storage` 与世界标签、世界实体、时间线等多份浏览器存储 | `EngineStore` Schema v4、save/restore 迁移、分支兼容投影、可选账号 SQLite 云端真源 | 已替换。畸形投影整包拒绝并由已提交历史重建。 |
| 新人生隔离 | 旧 state/reducer 与队列重置依赖 UI 调用路径 | 新 lifeRunId、generation、reset/hydrate 兼容链和 pending operation 清理 | 已替换。 |
| 日志与隐私 | 旧 debug logger 可围绕完整 Prompt/响应记录 | `story_repetition` 仅上传经同意后的数值 telemetry；默认聚合不输出诊断码、lifeRunId、Prompt 或正文 | 已替换。按玩家查询时仅显示 `game-N`。 |

## 5. 现行 25 个 active runtime 成员

下表完整列出 `mvp-stages-config.default.json` 的 25 个成员。`active` 只表示进入当前注册与生命周期策略，不表示每轮都写状态；主叙事 `narrativeChange` 白名单仍只有 `character-base`、`lifespan`、`luck`、`morality`。

| 类别 | SystemId | 当前职责与旧机制差异 |
|---|---|---|
| external | `world-context-registry` | 拥有稳定 context ID、层级、生命周期和当前上下文引用；取代旧 `worldCode` 加多份浏览器存储的松散目录。 |
| external | `contextual-capability-profile` | 明确每个上下文允许的生命、空间、NPC、经济、政治、科技和超自然能力组合；承接旧 `power-system-meta` 的意图，但不隐式启动 P2-P8。 |
| external | `spatial-graph` | 拥有空间节点、包含/邻接边、跨上下文出口和实体位置；不恢复旧 `world-map`、`terrain`、region generator 的逐轮地理演化。 |
| external | `context-transition` | 预检并原子迁移上下文、角色与携带实体位置和局部时钟，失败回滚；旧项目没有等价事务边界。 |
| external | `simulation-scope-policy` | 拥有 `active/background/dormant/closed` scope 与局部时钟同步；scope 不等于后台运行旧三域公式。 |
| external | `world-init` | 一次创建一个经验证的 context、能力画像、空间根、局部日历和初始化事实；取代旧初始化 orchestrator、生成器和分散存储。 |
| external | `historical-event-ledger` | 拥有唯一追加型历史事件、候选审计、证据、迁移、因果边和有界查询；取代旧 timeline/event-linker 的事实混合。 |
| external | `character-base` | 拥有四项基础属性、起始年龄和结构化 delta；不恢复旧动态属性与多个系统共同写角色的方式。 |
| external | `destiny-pattern` | 拥有命格候选、选择、缓存、修正和生成失败状态；承接旧 talent 抽取链，但候选与已选状态有明确 Schema。 |
| external | `lifespan` | 拥有最大寿命、突破和结构化寿命变化；当前年龄仍由 `time` 决定，不沿用正文寿命损失正则。 |
| external | `luck` | 拥有运气值及疾病、死亡、事件权重和衰老修正；保留旧 luck 主题，但不直接生成跨域事件。 |
| external | `morality` | 拥有善恶值和结构化 delta；取代旧 narrative parser/chain reaction 的正文关键词推断。 |
| external | `world-entity` | 拥有按 context 分区并全局命名空间化的国家、势力、家族、聚落和贸易路线实体；不运行其旧动态社会公式。 |
| engine | `time` | 拥有 canonical `daysPassed/totalDays`；取代旧 AI skip/stay、月份和领域推进可能形成的多时间源。 |
| engine | `orchestrator` | 拥有叙事阶段、Prompt 组装、AI 调用、预检、提交、回滚、分支、重复质量观察和自动保存协调；取代旧 `life-sim-engine` 与 `orchestrator-v2` 的集中但非事务链。 |
| engine | `narrative-parser` | 严格解析中文信封并区分正文、摘要、数据省略与数据拒绝；不接受旧宽松 JSON、标签协议或正文状态推断。 |
| engine | `summary-compressor` | 拥有分层摘要和完整覆盖证明；失败保留低层叶子，不恢复旧按窗口或列表裁剪语义。 |
| engine | `memory-engine` | 是 active 注册成员并保留兼容状态投影；`extractFromNarrative`/`extractFromAttr` 未接入正文提交链且不得恢复，结构化关系不由它写入。 |
| engine | `subsystem-relevance` | 拥有相关性评分与非破坏性的 Prompt 纳入决策；不删除状态，也不改变 owner。 |
| engine | `memory-lifecycle` | 拥有记忆层级、重要度、事件闭合和覆盖感知注入；旧项目没有同等完整的显式生命周期边界。 |
| engine | `memory-forgetting` | 拥有可解释遗忘决定与因果/伏笔保护；不得用固定条数或字符上限销毁未覆盖事实。 |
| engine | `causal-delay` | 拥有延迟叙事承诺、canonical day 到期、pending/triggered 状态和版本化恢复；进入 Prompt 不等于已解决。 |
| engine | `plot-structure` | 拥有剧情阶段、张力推进和确定性结构信号；不替玩家做选择，也不把旧 direction 当世界状态演化。 |
| engine | `foreshadowing` | 拥有伏笔记录、触发评分、解决状态和提示；不直接重写历史。 |
| engine | `core-memory` | 拥有不可遗忘关键事件、伏笔上下文和 NPC 关系历史；orchestrator 只在语义 META 验证通过后写入结构化 `relationshipUpdates`。 |

其中 `memory-engine` 的文件内仍可见旧正则方法，只能证明兼容代码存在；当前调用检索只发现注册、状态收集/重置链，没有正文抽取调用。真实关系路径是 `orchestrator -> core-memory.recordRelationshipUpdates`，历史事实路径是 `orchestrator -> historical-event-ledger`。

## 6. 完整旧叶子系统处置清单

| 旧库存分组 | 数量 | 旧叶子系统 | 实际调用位置与当前处置 |
|---|---:|---|---|
| character，三域直接链 | 14 | achievement, age-decay, combat-power, cultivation, disciple, economy, faith, family, health, item, luck, relationship, settlement, work | 被三个 domain 源文件中的至少一个直接 import。除同名 `luck` 的收窄 owner 外，旧公式均未作为 active runtime 恢复；角色、关系和事件改由当前结构化 owner 承担。 |
| society，三域直接链 | 13 | art, culture-tech, currency, education, faction-dynamics, industry, legal, market-cycle, nation-relation, noble-house, social-class, trade-route, tradition | 被 domain 直接 import，但当前逐轮社会/经济公式均 non-active；`world-entity` 的命名实体不等价于动态社会模拟。 |
| world，三域直接链 | 18 | celestial, climate, direction, divine, ecology, era-evolution, humidity, literacy, monster, pollution, population-mobility, population, race-diversity, resource-abundance, season, temperature, terrain, world-map | 被 domain 直接 import，但当前具体演化均 non-active；当前 context、capability、space、scope 和 init 系统只取代所有权/范围容器，不声称恢复这些公式。 |
| character，非三域同步链 | 4 | knowledge, life-stage, reputation, skill | 由 `initial-state.ts`、`orchestrator-v2.ts` 的 Prompt 格式化或 `narrative-report-applier.ts` 后处理使用，不在三个 domain 的直接推进集合。当前对应事实必须走结构化提交、记忆或账本 owner。 |
| society/world，仅导出库存 | 2 | class-structure, settlement-world | 只在旧 systems barrel 中导出，未找到 domain/core 运行调用；不能算作每轮同步机制。当前不恢复。 |
| 合计 | 51 | 45 个三域直接成员 + 6 个非三域同步成员 | 库存计数、直接调用计数和当前运行计数必须分别报告。 |

## 7. 旧非叶子调用链处置

| 旧调用链 | 旧职责 | 当前 owner / 处置 |
|---|---|---|
| `core/life-sim-engine.ts`、`core/orchestrator-v2.ts`、`domains/*-domain.ts` | 集中推进三域、联动、组装上下文和叙事后处理 | 由 `time`、当前 orchestrator、各 owning subsystem 和提交总线替换；禁止恢复固定三域全量同步。 |
| `bridges/chain-reaction-system.ts` | 从正文触发健康、财富、声望等连锁变化 | retired。当前正文不拥有业务状态，变化必须通过结构化 Schema、owner 预检和原子提交。 |
| `bridges/fate-branch-guide.ts` | 判定关键时刻并生成/补充分支提示 | 由稳定 ID 的 `BranchIntent` 生命周期、强制分支门禁和独立后台补救替换；不再用数组位置或默认选项造状态。 |
| `bridges/lifespan-breakthrough-system.ts` | 规则判定寿命突破，并从正文检测寿命损失 | `lifespan` active 拥有最大寿命和结构化变化；正文寿命损失正则 retired，当前年龄仍归 `time`。 |
| `core/narrative-report-applier.ts` | 把宽松叙事报告直接写回技能、关系、知识和物品 | 由严格 `narrative-parser`、整包 META 预检、owner 写入和 rollback 替换；非法项不得局部落地。 |
| `bridges/power-system-meta.ts` | 根据世界标签启停力量系统并产出 Prompt 元信息 | 由 `contextual-capability-profile` 的每 context 能力与允许组合替换；它不直接注册或唤醒 non-active 系统。 |
| `core/cross-domain-linker.ts`、`core/event-linker.ts` | 直接改多个域对象并拼接事件 | 跨系统事实由历史事件账本、显式因果边、owner API 和 orchestrator 事务提交承担；不建立第二写入权威。 |
| `core/timeline-node.ts`、`world/*timeline*`、`world-timeline-storage.ts` | 生成、桥接、注入并另存本地/世界时间线 | `historical-event-ledger` 拥有已发生事实，`causal-delay` 拥有延迟承诺，`foreshadowing` 拥有伏笔；候选、事实和未来承诺分离。 |
| `world/world-init-orchestrator.ts`、tags/entity/region generators、`world-init-storage.ts` | 分步生成标签、实体、地区、时间线并写多个存储桶 | `world-init` 一次生成经验证的 context bundle，并由 registry、capability、spatial graph 和历史账本各自持有唯一状态。 |
| `character/life-sim-talent.ts`、talent Prompt 与 UI hooks | 抽取天赋、保存候选和创建选择 | `destiny-pattern` 拥有普通命格候选/选择/缓存；转世能力沿现有 reincarnation 结构化 owner，不沿用旧 talent 本地桶。 |
| `character/life-sim-background-events.ts`、background Prompt/hints | 将背景事件和时间线提示拼进主 Prompt | 当前世界、角色和历史投影分层组装，只有已验证且 scope 匹配的事实进入 Prompt；背景文本不成为第二事实源。 |
| `character/afterlife-simulation-engine.ts`、`post-death-epilogue-system.ts`、endgame Prompt | 死亡后继续模拟、生成悼词/总结并驱动 game over | 当前同名 post-death 源文件 non-active；终局由已提交人生状态和 game-over 页面消费，死后扩展等待明确 lifecycle。 |
| `core/memory.ts` | 从正文正则抽取关系、财富、地点和大事 | `memory-engine` 仅保留注册兼容投影；结构化关系走 orchestrator + `core-memory`，历史事实走 ledger，正文正则不得恢复。 |
| `core/summary-compressor.ts`、`core/subsystem-relevance.ts` | 分块摘要和 Prompt 相关性裁选 | 由 active `summary-compressor`、`subsystem-relevance`、`memory-lifecycle`、`memory-forgetting` 接管，并增加覆盖证明与无硬截断约束。 |
| `state/life-sim-reducer.ts`、`services/storage/*` | reducer 与多个 localStorage 桶共同保存状态 | 当前用版本化 Store、各 owner snapshot 和严格 save/restore 聚合；旧存储只可作为显式迁移输入，不得形成平行真源。 |

## 8. 数值稳定性证据

废弃市场公式在 `market-cycle-system.ts` 每次调用累积 `inflationRate`，再以 `priceIndex * seasonalModifier * (1 + inflationRate)^yearsAdvanced` 更新。它没有长期均值回归或跨系统上界。废弃人口公式虽有 `50..500000` clamp，但其增长率会受灾害/战争输入持续压低。

`scripts/check/domains/calibration/legacy-simulation-formula-probe.mjs` 对两个旧函数执行的是**严格固定输入的压力夹具**，不是正常玩家局、不是完整旧 orchestrator，也不是“自然 100 年”预测：

| 探针项 | 固定输入 |
|---|---|
| 随机流 | Mulberry32 seed `20260724`；market 与 population 共用一条随机流 |
| 循环与调用顺序 | 100 次；每次固定先 `advanceMarketCycle`，再 `advancePopulation` |
| market | 初始 `priceIndex=100`；`currentMonth=(year % 12)+1`、`luckModifier=0`、`yearsAdvanced=1` |
| population | 初始 `total=5000`；`yearsAdvanced=1`、`prosperityFactor=0`、**每年 `disasterCount=5`**、`warActive=false` |
| 断言结果 | `priceIndex=547368166042059970`；`population.total=50`；`population.growthRate=-0.2` |

这个夹具证明两件有限的事：旧市场公式在该共享随机流和固定调用顺序下发生无界数量级增长；旧人口公式在“每年 5 场灾害”的刻意压力输入下触及硬下限。人口结果不能归因于正常玩法，二者也不能外推为完整旧项目所有机制的 100 年表现。

现行 `npm run test:calibration` 覆盖当前世界初始化、校准和接线路径；`narrative-regression-seed.mjs` 固定 seed 50 轮覆盖记忆保底、遗忘保护和伏笔接线。它们不能被解释为“所有废弃宏观系统已经稳定”，因为这些域目前按 MVP 计划没有运行。当前正确结论是：**先维持已启用核心的稳定性，不迁回未校准的旧宏观公式。**

## 9. 本次故障关联与后续顺序

1. `NP9D55` 的生产日志显示主请求均为 200，没有重复点击造成的双请求；分支补救集中出现在第 2、7、10、14 轮，正文又出现高重合样本。根因在现行 Prompt/生命周期和模型正文复用，不是把旧世界域少跑了。
2. 本次修复在 active owner 内完成：强制分支与冷却不再冲突，选择只投影一次，BranchIntent 可持久恢复，后台候选只能替换同一条已提交正文。
3. 未来恢复环境、社会、经济、政治、力量或 NPC 域时，必须先按 P2-P8 为每个节点定义 context scope、owner、Schema、公式边界、原子提交、持久化迁移和长期校准；不得把本表列出的旧 domain 循环、正文正则或 localStorage 桶直接复制进 MVP。
