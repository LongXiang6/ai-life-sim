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
- **当前机制**：`/new-game` 先调用统一重置；成功后依次经过世界选择、世界配置、角色创建、命格、属性和命运预览。页面草稿只承接未确认输入，确认动作经 `mod-world` 或 `mod-character` 公共能力写入所属状态，最终由命运预览启动引擎。
- **权责边界**：新人生只清理本局运行态和本局下游草稿；设置、独立存档、跨局轮回库和账号长期数据继续由各自所有者管理。世界身份变化时，旧世界下游草稿不能成为新世界事实。
- **实时源**：`src/mods/mod-pages/pages/new-game/`、`src/mods/mod-pages/helpers/new-life-reset.ts`、`src/mods/mod-pages/pages/` 下对应创建页面、`src/mods/mod-world/`、`src/mods/mod-character/`。

## 核心叙事回合

- **目标**：在一次玩家推进中完成时间与本地模拟、上下文组装、AI 叙事、合法状态提交、故事展示和后续持久化。
- **当前机制**：页面通过引擎 Hook 发起回合；Orchestrator 串行等待预生成释放单写者后，运行默认 Campaign 的声明式阶段机。第一次 AI 调用只接收 `全局信息/记忆/本轮引导` 三条动态消息；全局和本轮引导保持单行 JSON，记忆按时间阶段组织并用真实换行逐项列出发生时间与事件。本轮引导由本地无状态编译器把系统来源稳定排序、精确去重，并把玩家原始分支独立投影后再发送，不增加 AI 调用或长度截断；正文先按末尾字数要求选择可完整收束的事件规模。第一次返回完整正文与可选分支；第二次调用接收同回合每个活动可写系统的一行完整相关状态、回合上下文和第一次完整响应，再返回全部系统源变化及机器数据。第一次负责故事及玩家分支，第二次只按故事中已发生的事实结算，不续写或重新裁决。两次响应、严格校验和原子提交全部成功后，故事与状态才同步到 `EngineStore` 和页面；任一步失败则完整回滚且不显示正文。回合成功后先完成压缩、自动存档和 outcome 固化，再启动只缓存下一轮第一次响应的预生成；预览不写入真实回合诊断。
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
- **当前机制**：第一次固定 Prompt 以明确起止边界提供唯一 `content` 标准示例，并用正向字段职责说明 DeepSeek 的推理由 `reasoning_content` 承载、最终玩家可见结果由 `content` 承载。第一次规范响应为 `⟦正文⟧` 与可选 `⟦分支⟧`，完整纯正文、成对围栏、说明前缀、标签空白和完整多行分支 JSON 也可无损识别；第二次规范响应为连续 `⟦系统N⟧` 单行操作和最后唯一 `⟦数据⟧`，并兼容分段换行与完整 JSON 的常见格式差异，均不使用结束字段。每条系统操作固定声明 `系统/目标对象/目标上下文/操作/说明/变更/依据事件`，经中文 Schema 转译后校验活动白名单、能力、目标、上下文、操作及该操作的精确字段集；当前可写系统为 `character-base`、`lifespan`、`luck`、`morality`、`npc-system`、`relationship-system`。关系解除以空“变更”对象表达，其他同系统字段不能夹带到不适用操作。解析不采用补括号、舍弃残缺内容或部分对象重组；两类格式错误各自最多复用原 Prompt 资产和原输入修复两次，仍失败、任一系统拒绝或任一历史依赖失败都会使正文与结构化变化一起回滚。
- **权责边界**：字段合同由 `subsystem-field-registry.ts` 和生成的字段键共同定义，所属子系统负责预检和提交。Prompt、解析器、页面或历史文档不得建立第二份字段合同。
- **实时源**：`src/mods/mod-engine/helpers/narrative-ai-protocol.ts`、`tagged-meta-envelope.ts`、`subsystem-field-registry.ts`、`narrative-change-bundle.ts`、`src/mods/mod-engine/subsystems/narrative-parser-system.ts`。

## 历史事实与延迟因果

- **目标**：让关键事件、证据、转变、因果边和延期结果成为可查询、可持久化的事实，而不是只存在于叙事正文。
- **当前机制**：有效结构化数据被组装为历史事务批次；`historical-event-ledger` 先预检再提交。剧情结构、伏笔、延迟因果、关系和记忆引用已提交的事件 ID，并绑定核心回合的规范时间锚点；任一依赖步骤失败时，依赖的结构化副作用整包回滚。
- **权责边界**：历史账本拥有事实与证据；Orchestrator 拥有执行顺序；延迟因果和记忆系统拥有各自投影。账本不拥有正文或其他系统状态。
- **实时源**：`src/mods/mod-history-dynamics/`、`src/foundation/subsystem-contracts/historical-event.contract.ts`、`src/mods/mod-engine/subsystems/orchestrator-system.ts`、`src/mods/mod-engine/helpers/event-lifecycle-tracker.ts`。

## NPC 与社会关系

- **目标**：让人物在多世界中拥有可恢复的连续身份、当地状态、目标、行动、独立主观记忆和明确作用域关系，同时不复制位置、历史或玩家记忆真源。
- **当前机制**：角色恢复时由 `world-entity` 登记玩家引用并通过 `spatial-graph` 放置位置；NPC 创建前必须已有 `npc` 实体引用。`npc-system` 以稳定实体 ID 保存身份、当地状态、目标、行为和主观记忆，年龄只从规范总天数派生；`relationship-system` 保存人物或组织之间的有向边以及建立、调整、解除、作用域改变的追加式迁移。活动上下文执行完整规则，后台上下文仅在能力画像允许时生成确定性低频聚合，休眠和关闭上下文冻结，重新进入时只生成一次可追踪追赶记录。
- **Prompt 投影**：NPC 视图从玩家同场实体开始，扩展到与同场实体直接相连的一跳关系端点，再选取活动目标及同场、相关或最近同一规范时间批次的行为和记忆；关系视图只包含至少一个端点在当前场景且作用域适用于当前上下文的边。所有选择都是完整 Store 的派生视图，不设置固定条数或删除源记录。
- **权责边界**：实体引用归 `world-entity`，位置归 `spatial-graph`，NPC 私有状态归 `npc-system`，关系图归 `relationship-system`，已成立证据归 `historical-event-ledger`。编排器只协调预检、快照、提交和回滚；缺少 P2 存档快照时初始化空状态，不解释旧 NPC/关系载荷。
- **实时源**：`src/foundation/subsystem-contracts/npc-social.contract.ts`、`src/mods/mod-world/subsystems/world-entity-system.ts`、`src/mods/mod-npc/`、`src/mods/mod-social/`、`src/mods/mod-engine/helpers/round-commit-bus.ts`。

## 世界上下文与切换

- **目标**：用稳定上下文 ID 管理多个世界及其连接，使叙事、历史、空间和存档都能识别当前世界。
- **当前机制**：`mod-world` 保存上下文注册表和当前投影；世界初始化创建上下文，切换能力校验目标并使用规范 `globalTotalDays` 同步当地时钟，Orchestrator 在回合与恢复时绑定同一上下文 ID。
- **权责边界**：`mod-world` 拥有上下文身份、连接和世界状态；Orchestrator 只消费当前投影；页面只提交选择。跨世界内容不得通过页面缓存或正文建立第二套上下文身份。
- **实时源**：`src/mods/mod-world/`、`src/mods/mod-engine/helpers/orchestrator-world-setting.ts`、`src/mods/mod-engine/helpers/mvp-stages-config.default.json`。

## 存档与恢复

- **目标**：保存完整可恢复的本局事实，并在坏快照或不一致上下文下保持原运行态不被部分覆盖。
- **当前机制**：自动保存从 Engine、Character、World、Orchestrator 和活动所属系统统一收集快照；实体目录、NPC 和关系状态只进入各 owning system 的封闭版本快照，不在 World 通用快照或浏览器持久 Store 重复保存。手动本地或云端保存由引擎边界先取消预生成、等待预览清理与后台压缩提交，再收集同一载荷。恢复先验证载荷并检查运行成员，再取消在途预生成并等待单写者释放，随后写入核心 Store、恢复 Orchestrator 和所属系统；P2 快照缺失时清空对应新 Store，未知字段或断开的跨 Store 引用使加载失败。任一步失败则恢复进入函数前的核心快照，不切换到模拟页。
- **权责边界**：`save-restore.ts` 负责收集和恢复顺序，`src/core/storage/` 负责槽位与序列化，各 Store/子系统负责自身字段合法性。页面不拼装第二份存档载荷。
- **实时源**：`src/mods/mod-engine/helpers/save-restore.ts`、`src/core/storage/`、所属 Store 的快照方法、`src/mods/mod-engine/hooks.ts`。

## 账号与云端

- **目标**：在不取代匿名本地流程的前提下，提供可选账号、云端设置、长期角色数据、玩家内容和手动云存档。
- **当前机制**：账号客户端 Store 维护会话投影，账号 API 读取或提交账号拥有的数据；初始化入口在应用启动后建立云同步。登录或注册建立会话时，本地游客人生记录与云端记录按 `recordId` 合并，相同记录保留完成时间更新者，再把合并结果同步到账号；云端存档接收统一存档载荷，本地槽位仍由本地存储管理。玩家内容服务以账号和结构化人生记录为输入，幂等维护最佳排行榜投影、满分画像任务、站内邮件和传奇来源/目标决策。
- **权责边界**：账号系统拥有账号身份和账号数据；玩家内容系统拥有排行榜、邮件、画像任务和传奇投影；本地存储拥有匿名槽位；评分和人生字段含义仍由各业务所有者解释。QQ 绑定只通过其独立集成契约进入账号边界。
- **实时源**：`src/core/account/`、`src/core/player-content/`、账号/排行榜/传奇 API、`src/mods/mod-pages/account-cloud-api.ts`、`src/core/storage/`、`docs/qq-bot-integration-contract.md`。

## 结算与轮回

- **目标**：在本局终止后形成稳定结果、人生记录和可跨局保存的轮回选择，并能开始下一段独立人生。
- **当前机制**：世界初始化先把 AI 提议的 3-6 个世界适配维度限制到本地注册曲线、整数权重和总和 100，再把 Profile 固化到世界状态。终局时唯一评分所有者 `src/core/scoring/life-scoring.ts` 消费属性、回合连续性、选择、突破、成就和终局提交证据：无效人生最高 69；合法完整人生的原始分低于 90 时单调映射到 70-89；90 起正常取整；显示 100 还需所有维度和证据通过满分硬门禁。结算评语在分数固定后独立生成第二人称微观/宏观评语，失败则使用本地第二人称结果。
- **当前机制补充**：人生记录固化评分 Profile、结构化证据和完整逐轮迁移审计；玩家内容服务调用同一核心评分算法复算，并要求汇总分、原始分、维度、证据和完整性结果逐项一致，缺失审计或客户端伪造结果不能进入排行榜、画像队列或传奇池。分数超过 97 且复算通过的已登录人生投影到排行榜，每账号只保留最佳记录并按分数、轮数、完成时间、记录 ID 排序。100 分且满分门禁通过时，以 `accountId + recordId` 幂等创建画像任务；单进程后台 worker 领取任务并最多尝试 3 次，成功后投递邮箱并回填排行榜画像，邮箱公开 `processing`、`failed` 和 `ready` 状态。服务端只从满分合法记录建立传奇池；每目标人生最多一次决策，触发后冷却三局，冷却结束按 20% 确定性门禁选择其他玩家来源，只在无更高优先级叙事任务时注入短小载体。
- **权责边界**：引擎拥有终局与故事事实，核心评分拥有唯一分数计算，玩家内容服务拥有榜单/邮件/画像/传奇投影，轮回 Store 拥有本玩家跨局库；页面只展示并提交公开命令，AI 不决定分数或完整性。
- **实时源**：`src/mods/mod-engine/`、`src/core/scoring/`、`src/mods/mod-world/scoring-profile.ts`、`src/mods/mod-pages/pages/game-over/`、`src/core/player-content/`、`src/mods/mod-character/mythic-library-store.ts`。

## 诊断与反馈

- **目标**：把 AI 请求、完整 Prompt 与响应、客户端错误和玩家反馈保存为可直接查看、可关联账号的明文证据。
- **当前机制**：服务端与本地开发环境统一写入 `logs.sqlite`；正文与结构化载荷直接存入 SQLite 文本列，不加密、不压缩、不脱敏，也不使用内容引用。身份初始化为当前浏览器分别分配六位诊断编号和稳定明文设备来源编号；日志保留昨天和今天，启动后定时删除前天及更早记录。反馈页静默附带完整诊断，查看页和运维脚本可按注册账号、用户名、设备来源、匿名诊断编号、请求或反馈查询。
- **当前机制补充**：核心叙事逐轮原文不混入通用诊断表，而由 `narrative-round-archive.ts` 写入 `.data/narrative-rounds/<lifeRunId>/round-XXXXXX.txt`；压缩记忆不混入通用诊断表，而由 `narrative-memory-store.ts` 写入 `.data/narrative-memory/<lifeRunId>.sqlite`。本地开发时，关键系统边界另写 `.data/development-diagnostics/YYYY-MM-DD.jsonl`：浏览器事件先在真实回合内聚合并随唯一 outcome 发送，代理、服务端评分复算和画像 worker 在自身服务端边界原地记录；文件只保留昨天和今天，生产环境不创建该开发副本。以上文件均为明文。`npm run data:viewer` 启动回环地址上的独立只读进程，可查看通用日志、调用链、逐轮原文、压缩记忆、账号/玩家内容、系统诊断和只读数据库查询，不进入玩家路由或设置。
- **权责边界**：日志链路不记录点击、表单、导航、页面访问、时间步长选择、分支选择或故事推进等用户操作；诊断数据不成为故事、账号或模拟状态的事实来源。
- **实时源**：`src/core/logger/`、`src/app/api/log/`、`src/app/api/feedback/`、`src/app/api/diagnostic-identity/`、`src/mods/mod-pages/pages/feedback/`、`scripts/ops/data-viewer.mjs`、其他 `scripts/ops/` 查询工具。

## 发布与回滚

- **目标**：在用户明确要求发布时完成可验证、可切换和可回滚的生产更新。
- **当前机制**：先完成请求范围内的验证，再按生产操作说明执行归档、上传、构建、健康检查、原子切换、服务重启、清理或回滚；实际命令和服务器路径只保存在独立操作说明中。
- **权责边界**：本节描述逻辑，不授权发布。未收到用户明确发布要求时，不改变生产状态。
- **实时源**：`D:\AI\.agents\skills\ai-life-sim\references\production-deployment.md`、`D:\AI\.agents\skills\ai-life-sim\references\production-recovery.md`、`scripts/ops/`、`scripts/release/`。
