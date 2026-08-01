# 逻辑体系权威

## 目标

逻辑体系描述跨界面、跨 MOD 和跨服务的端到端运行路径。每条流程只引用所属系统的公共入口，不复制状态所有权；具体实现变化同步到本文件对应流程，避免页面、辅助函数和历史蓝图各自形成一套机制说明。

## 逻辑树

```text
玩家主链路
├─ 新人生创建
├─ 核心叙事回合
│  ├─ 结构化 AI 写入
│  ├─ 历史事实与延迟因果
│  ├─ 世界上下文投影
│  └─ 三层时间轴压缩与逐轮原文归档
├─ 存档与恢复
└─ 结算与轮回

辅助链路
├─ 账号与云端
├─ 诊断与反馈
└─ 发布与回滚
```

## 新人生创建

- **目标**：从干净的本局运行态完成世界、角色、命格、属性和命运确认，并进入第一轮核心模拟。
- **当前机制**：`/new-game` 先调用统一重置；成功后依次经过世界选择、世界配置、角色创建、命格、属性和命运预览。页面草稿只承接未确认输入，确认动作经 `mod-world` 或 `mod-character` 公共能力写入所属状态。世界初始化由 `world-init` 执行图按 `prepare-world-init -> queue-world-init -> dimension-calibration -> tags-fallback(可选跳过) -> entities -> finalize-world-init` 运行；`queue-world-init` 只负责排队，不写业务状态，任一步失败即返回 `mod-world`，不继续生成后续实体；最终由命运预览启动引擎。
- **权责边界**：新人生只清理本局运行态和本局下游草稿；设置、独立存档、跨局轮回库和账号长期数据继续由各自所有者管理。世界身份变化时，旧世界下游草稿不能成为新世界事实。
- **实时源**：`src/mods/mod-pages/pages/new-game/`、`src/mods/mod-pages/helpers/new-life-reset.ts`、`src/mods/mod-pages/pages/` 下对应创建页面、`src/mods/mod-world/`、`src/mods/mod-character/`。

## 核心叙事回合

- **目标**：在一次玩家推进中完成时间与本地模拟、上下文组装、AI 叙事、合法状态提交、故事展示和后续持久化。
- **当前机制**：唯一玩家推进链是 `game-story -> useSimulationAdvance -> executeRoundV2 -> narrative-round 执行图 -> RoundCommit -> epilogue-check -> compress-save`。Orchestrator 等待预生成释放单写者后运行 `prepare -> ready -> execute -> transition -> finalize` 阶段图：`prepare` 建立快照，`ready` 建立队列，`execute` 由各 MOD/子系统运行，`transition` 等待并汇合结果后提交，`finalize` 发布唯一终态。节点声明 `owner/failureTarget/order/dependsOn`、稳定状态码和可选 `parallelGroup`，缺码、非法码、超时或终止性失败只反馈给当前流程所有者。第一次 AI 调用只接收 `全局信息/记忆/本轮引导`，返回完整正文与可选分支；严格正文随即进入非持久化 `pendingNarrative` 并显示，生成光标移除，下一轮和分支操作仍保持禁用。随后 `ai-data-analysis` 与 `ai-event-recognition` 在同一显式并行组运行：前者按故事中已发生事实返回系统源变化和机器数据，后者对照全部现有可用候选，只返回尚未发生且等待未来条件的事项。`RoundCommitBus` 在所属系统预检前统一解析 `player:current`，向 NPC/关系 owning system 传入同包计划引用，并显式先应用 `create-identity` 再应用依赖操作；`post-processing` 同时等待两项后台分析成功，在一个快照事务中提交系统变化、历史事实、候选审计和依赖 META；成功后正式正文同步到 `narrativeHistory/EngineStore` 并清除即时投影，失败则业务状态完整回滚，已显示正文只以非持久化失败投影保留并携带终止状态码。尾声、压缩、自动存档和 outcome 全部收口后才启动下一轮预生成；预生成只执行本地推进和第一次叙事调用，不发布正文、不运行两项后台 AI，也不写真实回合诊断。
- **P6-P8 当前接入**：人口、聚落、工作、物品、经济、文化、艺术、教育、作品、政治、法律、生态、技术和世界观插件都通过同一 `RoundContext` 执行。经济拥有 GDP 流量、货币存量、市场和物品价格；自然资源拥有储量；力量框架由 `mod-world` 在创建时固化，P8 插件只消费本世界的 `rankId/rankIndex` 与证据事件，不建立固定阶位表或第二库存。
- **当前机制补充**：响应提交后异步触发 `summary-compressor`。它按 L1=4、L2=16、L3=64 的四倍时间轴规则延迟压缩，并把每个存档的原始 L1 与结构化时间轴写入独立明文 SQLite；内部档案完整保留来源、权重、衰减、遗忘与原始压缩结果，主叙事只消费压缩系统公开的“时间 + 事件”派生投影，不接收层级或计算字段。所有核心叙事调用都经过 `/api/proxy`；代理按 `lifeRunId + round` 被动把实际上游请求与响应逐字追加到同一轮 TXT，不另发日志请求。每条采用正文保存逐轮迁移审计；成功回合在后台压缩和自动存档完成后只发送一次 outcome，失败回合也只发送一次，用于固化阶段、质量、采用、提交和失败证据。
- **权责边界**：页面不解析或提交 AI 状态；AI 不直接修改 Store；Orchestrator 只通过活动子系统的契约写入所属状态。
- **实时源**：`src/mods/mod-pages/pages/game-story/`、`src/mods/mod-engine/hooks.ts`、`src/mods/mod-engine/subsystems/orchestrator-system.ts`、`src/mods/mod-engine/campaigns/default/index.ts`。完整阶段与事务见 [核心模拟](core-simulation.md)。

## 统一时间链路

- **入口**：页面只提交玩家行动和可选 `timeStep`；Orchestrator 在 `advance-time` 阶段调用唯一的 `TimeSystem`。
- **快照**：`TimeSystem` 产生新的 `totalDays` 与 `daysPassed`，Orchestrator 将它们放入同一 `RoundContext`；后续阶段不得重新计算或覆盖规范时间。
- **消费**：本地子系统、剧情结构、事件生命周期、历史账本、延迟因果、记忆、世界当地时钟和年龄计算都消费该快照；其他驱动力作为同一时间节点内的条件或修正。
- **输出**：故事、历史、记忆、世界切换和存档记录使用同一规范时间锚点；回合序号只承担幂等或批处理作用。
- **边界**：页面、AI、聚合器和单个业务系统不拥有第二套全局时钟；需要局部时间时只能从规范时间派生。详细所有权与当前剧情轮次计时缺口见 [系统体系](system-tree.md) 和 [核心模拟](core-simulation.md)。

## 结构化 AI 写入

- **目标**：把 AI 输出限制为可解析、可校验、可归属和可回滚的状态变更，不从自由正文推断业务事实。
- **当前机制**：主叙事固定 Prompt 提供唯一 `content` 标准示例；数据分析规范响应为连续 `⟦系统N⟧` 与最后唯一 `⟦数据⟧`；事件识别规范响应为唯一 `⟦待触发事件⟧` 中文 JSON，三类响应均不使用结束字段。系统操作继续以七字段契约校验活动白名单、能力、目标、上下文、操作及精确字段集；事件候选校验作用域、触发条件、规范延迟、人物、地点、能力、标签和与既有候选的重复指纹。解析不补括号、不舍弃残缺内容、不从部分对象重组；三类格式错误各自最多复用原 Prompt 资产和原输入修复两次。数据分析、事件识别、任一系统提交、历史提交或候选登记失败时，同一业务事务回滚，正式正文不采用。
- **权责边界**：字段合同由 `subsystem-field-registry.ts` 和生成的字段键共同定义，所属子系统负责预检和提交。Prompt、解析器、页面或历史文档不得建立第二份字段合同。
- **实时源**：`src/mods/mod-engine/helpers/narrative-ai-protocol.ts`、`tagged-meta-envelope.ts`、`subsystem-field-registry.ts`、`narrative-change-bundle.ts`、`src/mods/mod-engine/subsystems/narrative-parser-system.ts`。

## 历史事实与延迟因果

- **目标**：让关键事件、证据、转变、因果边和延期结果成为可查询、可持久化的事实，而不是只存在于叙事正文。
- **当前机制**：数据分析中的已发生事实被组装为历史事务批次，`historical-event-ledger` 先预检再提交；事件识别中的未来事项通过同一账本登记为 `available` 候选审计，不直接生成历史事件。候选 metadata 绑定同一执行、回合、上下文、规范时间、正文审计和本轮已提交事件 ID。剧情结构、伏笔、延迟因果、关系和记忆只引用已提交事件 ID；候选登记或任一依赖步骤失败时，历史、候选和其他结构化副作用整包回滚。
- **权责边界**：历史账本拥有事实与证据；Orchestrator 拥有执行顺序；延迟因果和记忆系统拥有各自投影。账本不拥有正文或其他系统状态。
- **实时源**：`src/mods/mod-history-dynamics/`、`src/foundation/subsystem-contracts/historical-event.contract.ts`、`src/mods/mod-engine/subsystems/orchestrator-system.ts`、`src/mods/mod-engine/helpers/event-lifecycle-tracker.ts`。

## NPC 与社会关系

- **目标**：让人物在多世界中拥有可恢复的连续身份、当地状态、目标、行动、独立主观记忆和明确作用域关系，同时不复制位置、历史或玩家记忆真源。
- **当前机制**：角色恢复时由 `world-entity` 登记玩家引用并通过 `spatial-graph` 放置位置；NPC 创建前必须已有 `npc` 实体引用。`npc-system` 以稳定实体 ID 保存身份、当地状态、目标、行为和主观记忆，年龄只从规范总天数派生；`relationship-system` 保存人物或组织之间的有向边以及建立、调整、解除、作用域改变的追加式迁移。活动上下文执行完整规则，后台上下文仅在能力画像允许时生成确定性低频聚合，休眠和关闭上下文冻结，重新进入时只生成一次可追踪追赶记录。
- **Prompt 投影**：NPC 视图从玩家同场实体开始，扩展到与同场实体直接相连的一跳关系端点，再选取活动目标及同场、相关或最近同一规范时间批次的行为和记忆；关系视图只包含至少一个端点在当前场景且作用域适用于当前上下文的边。所有选择都是完整 Store 的派生视图，不设置固定条数或删除源记录。
- **权责边界**：实体引用归 `world-entity`，位置归 `spatial-graph`，NPC 私有状态归 `npc-system`，关系图归 `relationship-system`，已成立证据归 `historical-event-ledger`。编排器只协调预检、快照、提交和回滚；缺少 P2 存档快照时初始化空状态，不解释旧 NPC/关系载荷。
- **实时源**：`src/foundation/subsystem-contracts/npc-social.contract.ts`、`src/mods/mod-world/subsystems/world-entity-system.ts`、`src/mods/mod-npc/`、`src/mods/mod-social/`、`src/mods/mod-engine/helpers/round-commit-bus.ts`。

## 空间、地理与资源

- **目标**：让地点、地理和资源在多世界中各有唯一身份与状态所有者，同时让地图只是可替换的读取视图。
- **当前机制**：`spatial-graph` 拥有节点、边、出口和实体位置；`geography` 与 `natural-resource` 按 `contextId + spatialNodeId` 保存地理和资源状态。资源推进读取每个上下文的当地经过时间与 `resourceConsumptionModifier`，在 owning system 内结算再生、消耗和事务。地图页按需调用 `projectWorldMap()`，把上述事实生成脱离源引用的地图、星图、位面图或场景导航模型。
- **权责边界**：地理不拥有位置或地图 UI，资源不拥有经济库存，地图 Store 不保存或反写模拟真源；旧 `world-map` 没有运行入口、注册或持久化状态。
- **实时源**：`src/foundation/subsystem-contracts/spatial-environment.contract.ts`、`src/mods/mod-world/subsystems/spatial-graph-system.ts`、`src/mods/mod-environment-ecology/`、`src/mods/mod-world-map/map-projection.ts`。

## 成长、成就与社会评价

- **目标**：让任意世界观共享可追踪的成长事实与评价作用域，不让技能、稳定能力、成就和声望重复拥有彼此状态。
- **当前机制**：`growth-system` 统一保存技能、稳定能力和带来源成长记录，并以全局或明确上下文作用域隔离；`achievement` 只查询已经提交到历史账本的事件并保留解锁证据 ID；`reputation` 按评价人物、上下文或全局评价域保存分数和变化记录。成长与声望使用现行七字段 AI 指令，成就由本地事实推进。
- **权责边界**：`mod-progression` 是三类状态的唯一所有者；角色基础属性仍归 `character-base`，历史事实仍归账本。旧 `skill`、`personal-ability`、文化成就和文化声望所有者不再被读取或恢复。
- **实时源**：`src/foundation/subsystem-contracts/progression.contract.ts`、`src/mods/mod-progression/`、`src/mods/mod-history-dynamics/historical-event-api.ts`。

## 寿命、生命周期与死亡

- **目标**：从规范时间得到可替换的年龄和阶段规则，并把健康、死亡证据和尾声作为同一条可回滚流程完成。
- **当前机制**：`lifespan` 按天保存生物钟模式、基础/最大寿命和有证据的调整；`lifecycle-system` 从 `totalDays`、创建年龄锚点和寿命规则派生年龄、当前阶段及非累计属性修正；`health` 按 `daysPassed` 结算生命、体力、精神、伤病和当地恢复规则。死亡检测先生成 pending fact，RoundCommit 为其创建专属 `character-death` 历史事件，账本成功提交后 `health` 才绑定事件 ID 成为正式死亡；随后现有 `epilogue-check` 条件阶段生成并保存尾声。
- **权责边界**：时间归 `TimeSystem`，生命阶段与属性修正归 `lifecycle-system`，伤病、死亡和尾声归 `health`，历史证据归账本。pending death 不得持久化；固定 `life-stage`、`attribute-decay` 和常驻 `post-death-epilogue` 均无独立入口或状态。
- **实时源**：`src/foundation/subsystem-contracts/life-cycle.contract.ts`、`src/mods/mod-character/subsystems/lifespan-system.ts`、`lifecycle-system.ts`、`health-system.ts`、`src/mods/mod-engine/subsystems/orchestrator-system.ts`。

## 世界上下文与切换

- **目标**：用稳定上下文 ID 管理多个世界及其连接，使叙事、历史、空间和存档都能识别当前世界。
- **当前机制**：`mod-world` 保存上下文注册表和当前投影；世界初始化创建上下文，切换能力校验目标并使用规范 `globalTotalDays` 同步当地时钟，Orchestrator 在回合与恢复时绑定同一上下文 ID。
- **权责边界**：`mod-world` 拥有上下文身份、连接和世界状态；Orchestrator 只消费当前投影；页面只提交选择。跨世界内容不得通过页面缓存或正文建立第二套上下文身份。
- **实时源**：`src/mods/mod-world/`、`src/mods/mod-engine/helpers/orchestrator-world-setting.ts`、`src/mods/mod-engine/helpers/mvp-stages-config.default.json`。

## 存档与恢复

- **目标**：保存完整可恢复的本局事实，并在坏快照或不一致上下文下保持原运行态不被部分覆盖。
- **当前机制**：自动保存从 Engine、Character、World、Orchestrator 和活动所属系统统一收集快照；P2-P5 的实体目录、NPC、关系、地理、资源、成长、成就、声望、寿命、生命周期和健康状态只进入各 owning system 的封闭版本快照，不在通用 Store 或浏览器持久状态重复保存。手动本地或云端保存由引擎边界先取消预生成、等待预览清理与后台压缩提交，再收集同一载荷。恢复先验证载荷并检查运行成员，再取消在途预生成并等待单写者释放，随后写入核心 Store、恢复 Orchestrator 和所属系统；缺少新 owning snapshot 时初始化规范状态，不读取旧所有者载荷，未知字段、断开的跨系统引用、未绑定历史事件的死亡或 pending death 使加载/保存失败。任一步失败则恢复进入函数前的核心快照，不切换到模拟页。刷新后世界浏览器投影缺少实体目录时，入口先重建可证明的临时引用以建立回滚锚点；正式目标 owning snapshot 仍由 world-entity 严格验证，临时标签不能让坏载荷通过。
- **权责边界**：`save-restore.ts` 负责收集和恢复顺序，`src/core/storage/` 负责槽位与序列化，各 Store/子系统负责自身字段合法性。页面不拼装第二份存档载荷。
- **实时源**：`src/mods/mod-engine/helpers/save-restore.ts`、`src/core/storage/`、所属 Store 的快照方法、`src/mods/mod-engine/hooks.ts`。

## 账号与云端

- **目标**：在不取代匿名本地流程的前提下，提供可选账号、云端设置、长期角色数据、玩家内容和手动云存档。
- **当前机制**：账号客户端 Store 维护会话投影，账号 API 读取或提交账号拥有的数据；诊断身份先于云同步建立。登录或注册时，本地游客人生与轮回天赋先和云端合并，再由邮件天赋所有权表排除已寄出项、恢复已领取或退回项。玩家内容服务幂等维护最佳排行榜投影、满分画像任务、站内邮件和传奇决策；邮件以账号键或经设备来源绑定的诊断键收发，开发者广播只保存一份正文，每个收件人只写稀疏已读/删除状态。
- **权责边界**：账号系统拥有账号身份和普通账号数据；玩家内容系统拥有排行榜、邮件、收件身份、邮件中的唯一天赋所有权、画像任务和传奇投影；本地存储仍拥有未进入邮件链路的匿名槽位。账号天赋表是账号投影，邮件托管和接受使用同一服务事务改变投影；页面不直接裁决所有权。
- **实时源**：`src/core/account/`、`src/core/player-content/`、账号/排行榜/传奇 API、`src/mods/mod-pages/account-cloud-api.ts`、`src/core/storage/`、`docs/qq-bot-integration-contract.md`。

## 结算与轮回

- **目标**：在本局终止后形成稳定结果、人生记录和可跨局保存的轮回选择，并能开始下一段独立人生。
- **当前机制**：世界初始化先把 AI 提议的 3-6 个世界适配维度限制到本地注册曲线、整数权重和总和 100，再把 Profile 固化到世界状态。终局时唯一评分所有者 `src/core/scoring/life-scoring.ts` 消费属性、回合连续性、选择、突破、成就和终局提交证据：无效人生最高 69；合法完整人生的原始分低于 90 时单调映射到 70-89；90 起正常取整；显示 100 还需所有维度和证据通过满分硬门禁。若 `health` 已保存带专属历史事件的 ready 尾声，结算页优先以该尾声作为人生回望；否则在分数固定后独立生成第二人称微观/宏观评语，失败再使用本地第二人称结果。
- **当前机制补充**：人生记录固化评分 Profile、结构化证据和完整逐轮迁移审计；玩家内容服务调用同一核心评分算法复算，并要求汇总分、原始分、维度、证据和完整性结果逐项一致，缺失审计或客户端伪造结果不能进入排行榜、画像队列或传奇池。分数超过 97 且复算通过的已登录人生投影到常开排行榜，每账号只保留最佳记录并稳定排序。100 分且满分门禁通过时，以 `accountId + recordId` 幂等创建画像任务；单进程 worker 最多尝试 3 次，成功后投递一封三天有效的画像邮件并回填排行榜，队列处理/失败不冒充邮件。普通邮件附件在发送事务中从发件人转入托管；收件人显式接受才转入其天赋库，收件人删除或三天到期未接受则自动退回原发件人。服务端只从满分合法记录建立传奇池。
- **权责边界**：引擎拥有终局与故事事实，核心评分拥有唯一分数计算，玩家内容服务拥有榜单/邮件/画像/传奇投影，轮回 Store 拥有本玩家跨局库；页面只展示并提交公开命令，AI 不决定分数或完整性。
- **实时源**：`src/mods/mod-engine/`、`src/core/scoring/`、`src/mods/mod-world/scoring-profile.ts`、`src/mods/mod-pages/pages/game-over/`、`src/core/player-content/`、`src/mods/mod-character/mythic-library-store.ts`。

## 诊断与反馈

- **目标**：把 AI 请求、完整 Prompt 与响应、客户端错误和玩家反馈保存为可直接查看、可关联账号的明文证据。
- **当前机制**：服务端与本地开发环境统一写入 `logs.sqlite`；正文与结构化载荷直接存入 SQLite 文本列，不加密、不压缩、不脱敏，也不使用内容引用。身份初始化为当前浏览器分别分配六位诊断编号和稳定明文设备来源编号；主库只承担昨天和今天的热窗，前天及更早记录先完整迁入 `logs-archive.sqlite`，逐列核验成功后才从主库删除。同 ID 同内容由联合视图去重，同 ID 不同内容使迁移和所有读取入口明确失败并保留热库原行；服务端、分析器、反馈状态、运营面板和查看器统一查询冷热库，调试页面和 API 不提供永久清除入口。客户端 `debug/info` 只保留在浏览器近期诊断中供反馈附带，`warn/error/exception` 与结构化质量指标才通过 `/api/log` 上报，正常回合阶段日志不占用服务端限流额度。反馈页静默附带完整诊断，查看页和运维脚本可按注册账号、用户名、设备来源、匿名诊断编号、请求或反馈查询。
- **当前机制补充**：核心叙事逐轮原文不混入通用诊断表，而由 `narrative-round-archive.ts` 写入 `.data/narrative-rounds/<lifeRunId>/round-XXXXXX.txt`；压缩记忆不混入通用诊断表，而由 `narrative-memory-store.ts` 写入 `.data/narrative-memory/<lifeRunId>.sqlite`。本地开发时，关键系统边界另写 `.data/development-diagnostics/YYYY-MM-DD.jsonl`：浏览器事件先在真实回合内聚合并随唯一 outcome 发送，代理、服务端评分复算和画像 worker 在自身服务端边界原地记录；文件只保留昨天和今天，生产环境不创建该开发副本。执行流事件额外保留 `department/subsystem/component/phase` 与事故分类，数据查看器按部门→子系统→组件及五阶段派生聚合，不复制 owning system 状态。以上文件均为明文。`npm run data:viewer` 启动回环地址上的独立只读进程，通过冷热库联合视图查看通用日志、调用链、逐轮原文、压缩记忆、账号/玩家内容、系统诊断和只读数据库查询，不进入玩家路由或设置。
- **权责边界**：日志链路不记录点击、表单、导航、页面访问、时间步长选择、分支选择或故事推进等用户操作；诊断数据不成为故事、账号或模拟状态的事实来源。
- **实时源**：`src/core/logger/`、`src/app/api/log/`、`src/app/api/feedback/`、`src/app/api/diagnostic-identity/`、`src/mods/mod-pages/pages/feedback/`、`scripts/ops/data-viewer.mjs`、其他 `scripts/ops/` 查询工具。

## 发布与回滚

- **目标**：在用户明确要求发布时完成可验证、可切换和可回滚的生产更新。
- **当前机制**：先完成请求范围内的验证，再按生产操作说明执行归档、上传、构建、健康检查、原子切换、服务重启、清理或回滚；实际命令和服务器路径只保存在独立操作说明中。
- **权责边界**：本节描述逻辑，不授权发布。未收到用户明确发布要求时，不改变生产状态。
- **实时源**：`D:\AI\.agents\skills\ai-life-sim\references\production-deployment.md`、`D:\AI\.agents\skills\ai-life-sim\references\production-recovery.md`、`scripts/ops/`、`scripts/release/`。
