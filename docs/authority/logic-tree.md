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
└─ 发布
```

## 新人生创建

- **目标**：从干净的本局运行态完成世界、角色、命格、属性和命运确认，并进入第一轮核心模拟。
- **当前机制**：`/new-game` 先调用统一重置；成功后依次经过世界选择、世界配置、角色创建、命格、属性和命运预览。页面草稿只承接未确认输入，确认动作经 `mod-world` 或 `mod-character` 公共能力写入所属状态。世界初始化由 `world-init` 执行图按 `prepare-world-init -> queue-world-init -> dimension-calibration -> tags-fallback(可选跳过) -> region-profiles -> finalize-world-init` 运行；`queue-world-init` 只负责排队，不写业务状态，区域概况与生命阶段由现有初始化 AI 在同一初始化链中生成；任一步失败即返回 `mod-world`，不继续提交后续区域事实；最终由命运预览启动引擎。
- **权责边界**：新人生只清理本局运行态和本局下游草稿；设置、独立存档、跨局轮回库和账号长期数据继续由各自所有者管理。世界身份变化时，旧世界下游草稿不能成为新世界事实。
- **实时源**：`src/mods/mod-pages/pages/new-game/`、`src/mods/mod-pages/helpers/new-life-reset.ts`、`src/mods/mod-pages/pages/` 下对应创建页面、`src/mods/mod-world/`、`src/mods/mod-character/`。

## 核心叙事回合

- **目标**：在一次玩家推进中完成时间与本地模拟、上下文组装、AI 叙事、合法状态提交、故事展示和后续持久化。
- **当前机制**：唯一玩家推进链是 `game-story -> useSimulationAdvance -> executeRoundV2 -> narrative-round 执行图 -> epilogue-check -> compress-save`。Orchestrator 直接运行 `prepare -> ready -> execute -> transition -> finalize` 阶段图；节点声明 `owner/failureTarget/order/dependsOn`、稳定状态码和可选 `parallelGroup`，缺码、非法码、超时或终止性失败只反馈给当前流程所有者。第一次 AI 调用只接收 `全局信息/记忆/本轮引导`，其中玩家分支选择只作为本轮行动原值投递；候选正文在发布前同时通过协议与近五轮重复门禁，高重复与格式错误共用两次主叙事修复预算。修复仍失败时保留已经完成的时间、子系统和 Prompt 准备结果，再次尝试复用同一执行编号并只重做主叙事，不再次推进时间或子系统，也不做快照回滚。严格正文进入 `pendingNarrative` 阅读投影，并由 `acceptNarrativeResponse()` 立即写入 `narrativeHistory`、消费实际投递的本轮行动和登记正文审计。随后 `ai-data-analysis`、`ai-basic-attribute-analysis`、`ai-event-recognition`、`ai-macro-impact` 在同一显式并行组只登记非阻塞任务，四路均接收对应完整字段和最近三轮完整故事；结果绑定存档、回合、正文与输入哈希进入版本化收件箱，下一次真实回合的 `prepare-round` 按类型和来源顺序消费已经终结的记录。数据、基础属性和宏观影响分别通过 `RoundCommitBus` 在所属系统事务中预检并提交；事件识别独立提交历史事实、候选、因果处置和依赖 META。任一路失败只记录本所有者终态，不创建或恢复运行时快照，不撤销正文或已经写入的局部结果。`compress-save` 是唯一 AI 释放闸门：无任务直接成功，首次失败后两路并发重试并只采用首个合法候选，三次均失败才阻止下一轮。自动存档和 outcome 完成本地终态后直接进入下一次真实推进，不启动运行时预生成。
- **当前活动接入**：世界区域、角色状态、统一记忆和时间日历是剧情事实的四个核心所有者；历史账本、通用成长、知识技术、力量、修炼、剧情结构和伏笔按各自公共契约继续运行。机缘、异常现象、人口、聚落、职业、物品、经济、文化、艺术、教育、作品、政治、法律、生态、污染、气候、社会阶层、势力、冲突、怪物、信仰和神明只作为区域背景、角色叙事或统一记忆中的可叙述概念，不建立独立推进状态。
- **当前机制补充**：`summary-compressor` 按 L1=4、L2=16、L3=64 的四倍时间轴规则延迟压缩；压缩 AI 在确定性采样设置下根据完整来源、已有压缩历史和最近三轮故事同时生成时间轴摘要与 `1..10` 权重，本地严格校验来源覆盖、范围和持久化一致性。无到期任务不调用 AI；到期任务首次失败后恰好启动两路并发候选，首个合法结果获胜并中止另一候选，全部失败保留正文但维持压缩阻塞。每个存档的原始 L1 与结构化时间轴写入独立明文 SQLite，内部档案完整保留来源、权重、衰减、遗忘与原始压缩结果；主叙事只消费压缩系统公开的“时间 + 事件”派生投影，不接收层级或计算字段。所有核心叙事调用都经过 `/api/proxy`；代理按 `lifeRunId + round` 被动把实际上游请求与响应逐字追加到同一轮 TXT，不另发日志请求。每条采用正文保存逐轮迁移审计；每个真实回合只发送一次 outcome，用于固化阶段、质量、采用、提交和失败证据。
- **权责边界**：页面不解析或提交 AI 状态；AI 不直接修改 Store；Orchestrator 只通过活动子系统的契约写入所属状态。
- **实时源**：`src/mods/mod-pages/pages/game-story/`、`src/mods/mod-engine/hooks.ts`、`src/mods/mod-engine/subsystems/orchestrator-system.ts`、`src/mods/mod-engine/campaigns/default/index.ts`。完整阶段与事务见 [核心模拟](core-simulation.md)。

## 统一时间链路

- **入口**：页面只提交玩家行动和可选 `timeStep`；Orchestrator 在 `advance-time` 阶段调用唯一的 `TimeSystem`。
- **快照**：`TimeSystem` 产生新的 `totalDays` 与 `daysPassed`，Orchestrator 将它们放入同一 `RoundContext`；后续阶段不得重新计算或覆盖规范时间。
- **消费**：本地子系统、剧情结构、事件生命周期、历史账本、延迟因果、记忆、世界当地时钟和年龄计算都消费该快照；其他驱动力作为同一时间节点内的条件或修正。
- **输出**：故事、历史、记忆、世界切换和存档记录使用同一规范时间锚点；回合序号只承担幂等或批处理作用。
- **边界**：页面、AI、聚合器和单个业务系统不拥有第二套全局时钟；需要局部时间时只能从规范时间派生。详细所有权与当前剧情轮次计时缺口见 [系统体系](system-tree.md) 和 [核心模拟](core-simulation.md)。

## 结构化 AI 写入

- **目标**：把 AI 输出限制为可解析、可校验、可归属的状态变更，不从自由正文推断业务事实。
- **当前机制**：主叙事固定 Prompt 提供唯一 `content` 中性格式示例；数据分析、基础属性分析、事件识别和宏观影响各自只返回一个纯 JSON 根对象，不使用结束字段。系统操作继续以七字段契约校验活动白名单、能力、目标、上下文、操作及精确字段集；基础属性额外接收完整角色画像和 `0=平平无奇、10=人类物种巅峰、>10=超凡` 的逐点语义，只允许四项基础属性的非零整数持久增量；事件识别校验语义核心、稳定因果编号处置、作用域、触发条件、规范延迟、人物、地点、能力、标签和候选重复指纹，并要求本轮实际投递的每个到期候选各有一项合法判定；宏观影响校验活动系统、玩家影响力证据、上下文、字段和无环依赖。解析不补括号、不舍弃残缺内容、不从部分对象重组；四路后台统一经过 `JSON.parse + Zod`，首次失败最多复用原 Prompt 资产和原输入修复一次，截断终态不进入格式修复。后台的启动、AI、Schema 或本地提交失败只拒绝该所有者结果，不撤销正文或其他已经提交的后台结果。
- **权责边界**：字段合同由 `subsystem-field-registry.ts` 和生成的字段键共同定义，所属子系统负责预检和提交。Prompt、解析器、页面或历史文档不得建立第二份字段合同。
- **实时源**：`src/mods/mod-engine/helpers/narrative-ai-protocol.ts`、`tagged-meta-envelope.ts`、`subsystem-field-registry.ts`、`narrative-change-bundle.ts`、`src/mods/mod-engine/subsystems/narrative-parser-system.ts`。

## 历史事实与延迟因果

- **目标**：让关键事件、证据、转变、因果边和延期结果成为可查询、可持久化的事实，而不是只存在于叙事正文。
- **当前机制**：事件识别中的注册事件被组装为历史事务批次，`historical-event-ledger` 先预检再提交；同一调用识别出的未来事项通过同一账本登记为 `available` 候选审计，不直接生成历史事件。候选查询默认返回作用域内全部最新审计，只有调用方显式提供 `limit` 才形成派生窗口；账本按作用域、能力和规范时间筛出本轮全部到期候选，未到期候选与未到期 `scheduled` 事件不进入主叙事。主叙事同时接收到全量到期因果和到期候选，事件识别必须按稳定编号逐项返回因果处置与候选判定，不得遗漏、重复或越权。候选处置包在写入前完整校验并一次性提交：已接纳创建 `occurred` 历史事实、证据和 accepted 审计；继续等待追加 available 审计并继续保留；已拒绝与已过期写入对应终态。候选 metadata 绑定同一执行、回合、上下文、规范时间、正文审计和本轮已提交事件 ID。剧情结构、伏笔、延迟因果、关系和记忆只引用已提交事件 ID；事件识别启动、生成、校验或提交失败时记录该所有者失败，不恢复运行时快照，因果编号保留、旧投递占用和在途候选占用清除，正文和其他后台结果不回滚。
- **权责边界**：历史账本拥有事实与证据；Orchestrator 拥有执行顺序；延迟因果和记忆系统拥有各自投影。账本不拥有正文或其他系统状态。
- **实时源**：`src/mods/mod-history-dynamics/`、`src/foundation/subsystem-contracts/historical-event.contract.ts`、`src/mods/mod-engine/subsystems/orchestrator-system.ts`、`src/mods/mod-engine/helpers/event-lifecycle-tracker.ts`。

## 世界区域与统一记忆

- **目标**：用一个宏观世界区域所有者提供世界形态、区域关系和叙事背景，用一个统一记忆所有者保存人物连续性，降低状态与 Prompt 的重复来源。
- **当前机制**：`spatial-graph` 保存世界形态、区域节点、区域关联、当前区域和区域概况。新世界由 `world-init` 生成区域默认值和区域概况；玩家从 A 区域到 B 区域时只提交区域级切换，现有宏观影响或初始化分析按区域关联度复用相近事实并补齐 B 的气候、生态、资源、污染、人口、聚落、经济、文化、教育和社会背景，不创建精确坐标或独立环境系统。
- **统一记忆投影**：`memory-lifecycle` 保存时间段、人物、共同事件、关系事实、权重和区域，并把玩家原创事实与正文事实投影为同一条时间轴。主叙事只读取按真实时间排序的“时间 + 事件”文本；NPC、关系、职业、物品、作品、声望和成就等题材可以写入正文或记忆，但不再创建专用追踪 Store。
- **权责边界**：世界区域状态归 `spatial-graph`，区域概况生成归 `world-init`/宏观影响，人物连续性归 `memory-lifecycle`；地图只消费投影，Orchestrator 不复制区域或关系状态。
- **实时源**：`src/mods/mod-world/subsystems/spatial-graph-system.ts`、`src/mods/mod-world/types/regions.ts`、`src/mods/mod-world/utils/world-region-profile.ts`、`src/mods/mod-engine/helpers/narrative-macro-impact-context.ts`、`src/mods/mod-engine/subsystems/memory-lifecycle-system.ts`、`src/mods/mod-engine/subsystems/memory-lifecycle-system/timeline-facts.ts`。

## 成长与角色状态

- **目标**：保留真正能改变后续剧情的通用成长和角色基础状态，把健康、气运、道德、年龄阶段与寿命风险收口到一个角色状态。
- **当前机制**：`character-base` 保存四项基础属性和紧凑角色状态；统一状态包含起始年龄、当前年龄、AI 生成的生命阶段、生命/体力/精神、健康问题、隐藏气运、隐藏道德、叙事寿命上限、pending death 和尾声。后处理数据分析通过“更新状态”写入健康、气运和道德；基础属性分析通过“调整属性”写入持久属性。`growth-system` 继续保存技能和能力成长。成就、声望、职业、教育和社会评价不再拥有独立推进状态。
- **权责边界**：时间日历只提供规范天数；角色状态负责阶段映射和边界校验；成长负责技能/能力；历史账本负责死亡及其他已确认事实。AI 不能直接写 Store，寿命上限临近时只生成递增终局风险，不到龄自动死亡。
- **实时源**：`src/foundation/subsystem-contracts/character-state.contract.ts`、`src/mods/mod-character/subsystems/character-base-system.ts`、`character-status-runtime.ts`、`character-status-update.ts`、`src/mods/mod-progression/`。

## 时间日历、寿命与死亡

- **目标**：让统一时间同时驱动日期、季节、节日、年龄、生命阶段和死亡证据，不设置整局回合上限或第二套天象时钟。
- **当前机制**：`time` 保存规范 `totalDays/daysPassed`，并由固定游戏历法派生季节、月份、日期和节日。中国节日默认，可选中国及国际节日；`calendar-narrative-context` 把节日、休息节奏、当前生命阶段和年龄提示组装到主叙事引导。角色状态根据手动寿命上限和初始化 AI 生成的阶段边界派生当前阶段；寿命接近上限时只提高终局风险。死亡先产生不可持久化 pending fact，历史账本提交专属 `character-death` 事件后才绑定正式死亡与尾声。
- **权责边界**：`time` 是唯一时间写入者，`character-base` 是唯一角色状态写入者，历史账本是死亡证据所有者；回合序号只做幂等和批次顺序。
- **实时源**：`src/mods/mod-engine/subsystems/time-system.ts`、`src/mods/mod-engine/subsystems/time-system/festival-calendar.ts`、`src/mods/mod-engine/helpers/calendar-narrative-context.ts`、`src/mods/mod-character/subsystems/character-base-system.ts`、`src/mods/mod-character/subsystems/character-status-runtime.ts`、`src/mods/mod-engine/subsystems/orchestrator-system.ts`。

## 世界上下文与切换

- **目标**：用稳定上下文 ID 管理多个世界及其连接，使叙事、历史、空间和存档都能识别当前世界。
- **当前机制**：`mod-world` 保存上下文注册表和当前投影；世界初始化创建上下文，切换能力校验目标并使用规范 `globalTotalDays` 同步当地时钟，Orchestrator 在回合与恢复时绑定同一上下文 ID。
- **权责边界**：`mod-world` 拥有上下文身份、连接和世界状态；Orchestrator 只消费当前投影；页面只提交选择。跨世界内容不得通过页面缓存或正文建立第二套上下文身份。
- **实时源**：`src/mods/mod-world/`、`src/mods/mod-engine/helpers/orchestrator-world-setting.ts`、`src/mods/mod-engine/helpers/mvp-stages-config.default.json`。

## 存档与恢复

- **目标**：保存完整可恢复的本局事实，并在坏快照或不一致上下文下保持原运行态不被部分覆盖。
- **当前机制**：自动保存从 Engine、Character、World、Orchestrator 和当前活动系统统一收集持久化状态；世界区域、角色状态、统一记忆、时间日历、通用成长和历史账本各自只保存一份 owning state，页面不重复持有。手动本地或云端保存由引擎边界等待后台压缩提交后收集同一载荷。恢复先验证载荷与活动成员，再取消在途派生队列并等待单写者释放，随后恢复当前 Store；被删除系统的旧字段不读取、不兼容、不双写，正文、历史原文和压缩记忆完整保留。未知字段、断开的区域引用、上下文不一致、未绑定历史事件的死亡或 pending death 使加载/保存失败；任一步失败时回到进入恢复前状态，不切换到模拟页。
- **权责边界**：`save-restore.ts` 负责收集和恢复顺序，`src/core/storage/` 负责槽位与序列化，各 Store/子系统负责自身字段合法性。页面不拼装第二份存档载荷。
- **实时源**：`src/mods/mod-engine/helpers/save-restore.ts`、`src/core/storage/`、所属 Store 的快照方法、`src/mods/mod-engine/hooks.ts`。

## 账号与云端

- **目标**：在不取代匿名本地流程的前提下，提供可选账号、云端设置、长期角色数据、玩家内容和手动云存档。
- **当前机制**：账号客户端 Store 维护会话投影，账号 API 读取或提交账号拥有的数据；诊断身份先于云同步建立。登录或注册时，本地游客人生与轮回天赋先和云端合并，再由邮件天赋所有权表排除已寄出项、恢复已领取或退回项。玩家内容服务幂等维护最佳排行榜投影、满分画像任务、站内邮件和传奇决策；邮件以账号键或经设备来源绑定的诊断键收发，开发者广播只保存一份正文，每个收件人只写稀疏已读/删除状态。
- **权责边界**：账号系统拥有账号身份和普通账号数据；玩家内容系统拥有排行榜、邮件、收件身份、邮件中的唯一天赋所有权、画像任务和传奇投影；本地存储仍拥有未进入邮件链路的匿名槽位。账号天赋表是账号投影，邮件托管和接受使用同一服务事务改变投影；页面不直接裁决所有权。
- **实时源**：`src/core/account/`、`src/core/player-content/`、账号/排行榜/传奇 API、`src/mods/mod-pages/account-cloud-api.ts`、`src/core/storage/`、`docs/qq-bot-integration-contract.md`。

## 结算与轮回

- **目标**：在本局终止后形成稳定结果、人生记录和可跨局保存的轮回选择，并能开始下一段独立人生。
- **当前机制**：世界初始化先把 AI 提议的 3-6 个世界适配维度限制到本地注册曲线、整数权重和总和 100，再把 Profile 固化到世界状态。终局时唯一评分所有者 `src/core/scoring/life-scoring.ts` 消费属性、回合连续性、选择、突破、成长与历史里程碑证据：无效人生最高 69；合法完整人生的原始分低于 90 时单调映射到 70-89；90 起正常取整；显示 100 还需所有维度和证据通过满分硬门禁。若角色状态已保存带专属历史事件的 ready 尾声，结算页优先以该尾声作为人生回望；否则在分数固定后独立生成第二人称微观/宏观评语，失败再使用本地第二人称结果。
- **当前机制补充**：人生记录固化评分 Profile、结构化证据和完整逐轮迁移审计；玩家内容服务调用同一核心评分算法复算，并要求汇总分、原始分、维度、证据和完整性结果逐项一致，缺失审计或客户端伪造结果不能进入排行榜、画像队列或传奇池。分数超过 97 且复算通过的已登录人生投影到常开排行榜，每账号只保留最佳记录并稳定排序。100 分且满分门禁通过时，以 `accountId + recordId` 幂等创建画像任务；单进程 worker 最多尝试 3 次，成功后投递一封三天有效的画像邮件并回填排行榜，队列处理/失败不冒充邮件。普通邮件附件在发送事务中从发件人转入托管；收件人显式接受才转入其天赋库，收件人删除或三天到期未接受则自动退回原发件人。服务端只从满分合法记录建立传奇池。
- **权责边界**：引擎拥有终局与故事事实，核心评分拥有唯一分数计算，玩家内容服务拥有榜单/邮件/画像/传奇投影，轮回 Store 拥有本玩家跨局库；页面只展示并提交公开命令，AI 不决定分数或完整性。
- **实时源**：`src/mods/mod-engine/`、`src/core/scoring/`、`src/mods/mod-world/scoring-profile.ts`、`src/mods/mod-pages/pages/game-over/`、`src/core/player-content/`、`src/mods/mod-character/mythic-library-store.ts`。

## 诊断与反馈

- **目标**：把 AI 请求、完整 Prompt 与响应、客户端错误和玩家反馈保存为可直接查看、可关联账号的明文证据。
- **当前机制**：服务端与本地开发环境统一写入 `logs.sqlite`；正文与结构化载荷直接存入 SQLite 文本列，不加密、不压缩、不脱敏，也不使用内容引用。身份初始化为当前浏览器分别分配六位诊断编号和稳定明文设备来源编号；主库只承担昨天和今天的热窗，前天及更早记录先完整迁入 `logs-archive.sqlite`，逐列核验成功后才从主库删除。同 ID 同内容由联合视图去重，同 ID 不同内容使迁移和所有读取入口明确失败并保留热库原行；服务端、分析器、反馈状态、运营面板和查看器统一查询冷热库，调试页面和 API 不提供永久清除入口。客户端 `debug/info` 只保留在浏览器近期诊断中供反馈附带，`warn/error/exception` 与结构化质量指标才通过 `/api/log` 上报，正常回合阶段日志不占用服务端限流额度。反馈页静默附带完整诊断，查看页和运维脚本可按注册账号、用户名、设备来源、匿名诊断编号、请求或反馈查询。
- **当前机制补充**：核心叙事逐轮原文不混入通用诊断表，而由 `narrative-round-archive.ts` 写入 `.data/narrative-rounds/<lifeRunId>/round-XXXXXX.txt`；压缩记忆不混入通用诊断表，而由 `narrative-memory-store.ts` 写入 `.data/narrative-memory/<lifeRunId>.sqlite`。本地开发时，关键系统边界另写 `.data/development-diagnostics/YYYY-MM-DD.jsonl`：浏览器事件先在真实回合内聚合并随唯一 outcome 发送，代理、服务端评分复算和画像 worker 在自身服务端边界原地记录；文件只保留昨天和今天，生产环境不创建该开发副本。执行流事件额外保留 `department/subsystem/component/phase` 与事故分类，数据查看器按部门→子系统→组件及五阶段派生聚合，不复制 owning system 状态。以上文件均为明文。`npm run data:viewer` 启动回环地址上的独立只读进程，通过冷热库联合视图查看通用日志、调用链、逐轮原文、压缩记忆、账号/玩家内容、系统诊断和只读数据库查询，不进入玩家路由或设置。
- **权责边界**：日志链路不记录点击、表单、导航、页面访问、时间步长选择、分支选择或故事推进等用户操作；诊断数据不成为故事、账号或模拟状态的事实来源。
- **实时源**：`src/core/logger/`、`src/app/api/log/`、`src/app/api/feedback/`、`src/app/api/diagnostic-identity/`、`src/mods/mod-pages/pages/feedback/`、`scripts/ops/data-viewer.mjs`、其他 `scripts/ops/` 查询工具。

## 发布

- **目标**：在用户明确要求发布时把当前已提交项目直接更新到唯一生产目录并重启服务。
- **当前机制**：唯一部署入口归档当前 `HEAD` 并上传；远端要求 `/root/ai-life-sim` 本身是唯一真实部署目录，在其中保留 `node_modules` 与 `.env.production.local`，清理其余项目文件，解压新代码，执行生产构建并重启 PM2。流程不接受软链接，不创建候选版本、发布目录、代码备份、部署状态或回滚路径。
- **权责边界**：本节描述逻辑，不授权发布。未收到用户明确发布要求时，不改变生产状态。
- **实时源**：`D:\AI\ai-life-sim\.agents\skills\ai-life-sim\references\production-deployment.md`、`D:\AI\ai-life-sim\.agents\skills\ai-life-sim\scripts\production-deploy.ps1`、`D:\AI\ai-life-sim\.agents\skills\ai-life-sim\scripts\production-deploy-remote.sh`。
