# P1 多世界模拟执行记录

文档角色：蓝图阶段执行记录
状态：已完成
所属蓝图：[蓝图二 · 多世界模拟重写计划执行书](../blueprint-02-multi-world-simulation-foundation.md)

## P1 历史与因果执行契约

本节冻结 P1 的 A2 目标。P1 只恢复“世界已经发生了什么、为什么发生、现在处于什么状态”的公共事实能力，不恢复 NPC、政治、经济、灾害或世界观插件本身。

### 15.1 P1 系统节点与执行顺序

| 顺序 | SystemPath | A/R/W/S | 拥有者 | 本阶段结果 |
|---:|---|---|---|---|
| 1 | `project > simulation-runtime > history-causality > contracts` | A2/R0/W5/S1 | 本蓝图、Foundation | 冻结事件、状态迁移、证据、因果边、候选审计和原子批次类型 |
| 2 | `project > simulation-runtime > history-causality > historical-event-ledger` | A3/R1/W5/S2 | `mod-history-dynamics` | 建立唯一历史事实 Store、查询 API、当前相关视图和完整持久化快照 |
| 3 | `project > simulation-runtime > history-causality > candidate-provider` | A3/R2/W3/S3 | 历史事件账本内部组件 | 将旧 `event-pool` 迁为候选与审计；候选接受前不是事实 |
| 4 | `project > simulation-runtime > history-causality > causal-graph` | A3/R2/W4/S4 | 历史事件账本内部组件 | 将旧 `causal-simulation` 迁为事件间因果边；删除正文正则、随机延迟和重复队列 |
| 5 | `project > simulation-runtime > narrative-continuity > causal-delay-adapter` | A3/R2/W4/S5 | `causal-delay`、编排器 | 新延期事项按规范日确定性到期，旧事项保留 `legacy-round`；成功叙事提交后才确认兑现 |
| 6 | `project > simulation-runtime > orchestration > historical-event-transaction` | A3/R1/W5/S6 | 编排器、RoundCommit | 已验证摘要、关键事件、语义、伏笔和延期事项本地翻译为同一历史批次；失败恢复依赖 META |
| 7 | `project > simulation-runtime > memory > historical-event-references` | A3/R2/W4/S7 | 记忆、核心记忆、伏笔、剧情结构 | 消费账本事件 ID，不重复拥有世界事实 |
| 8 | `project > acceptance > history-causality-p1` | A5/R3/W5/S8 | 项目测试系统 | 迁移、跨世界、原子提交、存档、预生成、作用域和无硬淘汰均有确定性证据 |

### 15.2 唯一公开事实契约

| 概念 | 冻结语义 |
|---|---|
| `historicalEventId` | 存档内稳定事件编号，由本地账本分配；AI、世界名称和旧数组位置不能替代 |
| `eventScope` | `global/context/travel/cross-context`；当地事件必须列出稳定 `contextIds`，跨界事件显式包含多个上下文 |
| `eventStatus` | `scheduled/active/occurred/prevented/resolved/void`；每次变化追加 transition，不覆盖或删除旧状态证据 |
| `evidence` | 指向已经接受的叙事回合、关键事件、系统提交、延期承诺、伏笔、候选或迁移来源；不得用未验证正文猜测补全 |
| `causalEdge` | 连接两个已存在事件的 `causes/enables/blocks/resolves/amplifies/propagates` 关系；端点、作用域和证据由本地预检 |
| `candidate` | 可发生事件的内部提议与审计记录；`available/accepted/rejected/expired` 只表达候选生命周期，不等于世界事实；可选 `requiredCapabilities` 必须由 owning system 对每个目标上下文逐项验证，空数组表示世界观中立 |
| `historicalEventBatch` | 事件创建、状态迁移、证据和因果边的统一原子提交单位；任一非法使整批失败 |

事件可同时保存已验证的稳定实体 ID、空间节点 ID和无法解析为业务 ID 的人物或组织标签。标签必须明确是标签，不能伪造全局实体。

### 15.3 精简和迁移边界

1. MVP 外部运行成员只新增 `historical-event-ledger`，P1 完成后外部运行系统为 13 个、总运行系统为 25 个。
2. 旧 `event-pool` 系统 ID 与文件已删除，不进入 manifest subsystem、runtime、Prompt 或 `narrativeChange`；替代组件 `src/mods/mod-history-dynamics/components/event-candidate-provider.ts` 只在账本内部构造候选和追加式候选审计。
3. 旧 `causal-simulation` 系统 ID 与文件已删除；替代组件 `src/mods/mod-history-dynamics/components/causal-graph-component.ts` 不保留正文关键词正则、独立 pending/resolved 队列、固定年代容量、随机 3—15 年延迟或自动到期解决，只构造账本拥有的显式因果边。
4. 旧已触发事件池条目迁为已发生事件；未触发条目迁为候选；过期未触发条目保留为 `expired` 候选审计，不伪装成事实。
5. 旧待处理和已解决因果记录分别迁为 `active/scheduled` 与 `resolved` 事件，保留旧 ID、年份、完整捕获描述和结果；旧计数与处理年份进入迁移证据。
6. 迁移和正常运行均禁止固定容量、FIFO、字符截断或数组位置淘汰。技术批处理只延后消费，不删除真源。

### 15.4 AI、提交与回滚边界

1. `historical-event-ledger` 在 `SUBSYSTEM_FIELD_CONTRACTS` 登记为 `event-input`，但不加入旧四系统 `narrativeChange` 白名单。
2. P1 不修改主叙事成功协议。只有完整结构化数据区已通过 Schema、命运条件和普通状态变更整包预检后，本地才可把摘要、关键事件、语义信号、延期因果和伏笔结果翻译为账本批次。
3. AI 不能自造事件 ID、证据 ID、状态提交结果、显式跨界因果边或未满足条件的解决结果。跨界因果先由本地系统或账本公开 API 提交。
4. 编排器在普通状态写入前捕获外部系统、内部连续性系统和必要 META 快照；随后提交普通变更、历史批次、延期因果、伏笔、剧情和记忆引用。任一步失败恢复全部副作用并拒绝依赖 META。
5. 合格正文与摘要不因结构化副作用失败而丢失；摘要账本可以继续记录自身合格摘要，但不得把失败的历史批次伪装为已提交世界事实。
6. 预生成和预览使用同一快照/恢复机制，不能污染真实账本、候选、因果边、伏笔、记忆或延期状态。

### 15.5 持久化和读取策略

1. `useHistoryDynamicsStore` 是运行事实权威；Store `schemaVersion: 2` 追加保存 `events/transitions/evidence/causalEdges/candidateAudits/migrationMetadata` 六类完整状态。编排器持久化快照通过账本的 `capturePersistenceState/restorePersistenceState` 保存，以便每个存档独立恢复。
2. `collectState()` 只返回全局或作用域显式包含当前上下文、仍需消费的 `scheduled/active` 视图及统计；它通过只读索引复用事件状态、证据和因果边，不调用完整持久化克隆，也不对每个事件重复全表扫描。事实正文进入主叙事时由确定性投影器读取该视图，禁止经过后台世界观适配器改写。
3. 查询 API 可以按事件 ID、上下文、状态、实体、标签、地点、tag、证据、迁移和因果端点读取完整历史，并读取带关联总数的事件详情。公开查询默认 `limit: 100`、最大 `500`，通过 `offset` 分页；分页只限制单次返回，不改变或删除事实。
4. 新存档初始化空账本；旧 Store v1 和旧 collected state 仅迁移该存档自带的 `event-pool/causal-simulation` 状态。已触发条目、未触发或过期候选、pending/resolved 因果分别进入事件、候选审计、迁移证据和 `legacyPayload`。若浏览器持久化先于 world Store 水合，运行注册后必须把临时 global 的 v1 历史一次性重绑到该存档原当前上下文；不得串入第二世界或另一个存档的浏览器残留。
5. v2 恢复先严格校验六类数组、重复 ID、状态链、证据/因果端点、候选审计链、世界/实体/地点引用和 scope 一致性，再一次性替换 Store。显式读档与浏览器/Zustand 当前 Store 水合必须共用该校验；损坏水合状态保留供诊断但隔离于查询、提交和存档，不能静默清空。当前 v2 畸形数据和未知未来版本必须拒绝。存档恢复时账本、世界上下文与编排器当前上下文必须共同成功；任何核心不一致都保持原游戏并整包失败。
6. 记忆、核心记忆、伏笔和剧情结构只持久化已接受事件 ID：`historicalEventIds`、`plantedFromEventIds/resolvedByEventIds` 和 `lastHistoricalEventIds`。合并或压缩必须保留 ID 并集；旧快照缺字段时初始化为空数组，不从正文补造引用。
7. `causal-delay` 的 P1 快照显式使用 `schemaVersion: 1`。带版本快照出现重复事项 ID 时整包拒绝；无版本旧快照的重复 ID 按原顺序确定性重编号，并保留 `legacyId` 作为迁移证据。

### 15.6 P1 验收矩阵

| 验收项 | 必须证明的结果 | 当前状态 |
|---|---|---|
| 旧状态迁移 | v1 事件池、过期候选、pending/resolved 因果无损迁移且不恢复旧运行语义 | 已通过：`test:historical-event-p1` 覆盖 Store v1、旧 collected state、未知 payload、重复迁移幂等、null-first 水合重绑和创建第二世界后的隔离 |
| 任意世界观 | 无强制农业、宫廷、宗教、龙或神器预设；候选按显式能力与上下文验证 | 已通过：focused smoke 覆盖空能力中立候选、所有目标上下文逐项能力校验、畸形候选零写入，以及 `available/accepted/rejected/expired` 完整审计；源码扫描无题材预设、正文正则或随机触发 |
| 多世界身份 | 同名事件跨上下文不碰撞；跨界事件和因果边显式列出上下文 | 已通过：focused smoke 覆盖同名不同 ID、实体/标签/地点查询、A-B travel 不泄漏 C、错误跨界引用拒绝，以及跨世界因果兑现自动推导 scope |
| 原子提交 | 混合合法/非法批次、连续性写入失败、损坏存档和预生成均不留下部分事实；任何接受写入都能立即严格往返 | 已通过：focused smoke 覆盖非法批次零写入、空 evidence contextId 与重复 transition/edge evidenceIds 拒绝、提交后严格 capture/restore、预览完整恢复、真实 `applyGameSave()` 损坏 v2 整包回滚，以及注入下游失败后普通状态、账本、因果、剧情、伏笔、记忆、核心记忆和原创内容整包回滚；合格正文与摘要继续保留 |
| 延期因果 | 新事项按规范日到期，旧事项保留 legacy 策略；Prompt 到期不提前消费 | 已通过：`test:narrative-protocol` 覆盖 canonical/legacy、错误上下文、失败不消费、成功提交、非破坏性分批、同毫秒唯一 ID、无版本重复 ID 确定性迁移与带版本重复 ID 拒绝；主线以结果事件 ID 确认兑现 |
| 消费联通 | 伏笔、剧情结构、记忆和核心记忆保留已接受历史事件 ID 引用，当前待续事实进入下一轮叙事 | 已通过：真实编排器验证四类消费者接收同批事件 ID；Prompt `4.2.1` 确定性投影保留当前/global/显式跨入当前世界的事件与因果边，并绕过世界观适配器 |
| 存档往返 | 完整事件、迁移、证据、候选审计和因果边 JSON 往返等价，损坏或旧存档不串状态 | 已通过：严格 v2 校验覆盖重复 ID、断边、非法状态、错误世界引用和矛盾候选链；浏览器 Store v2 损坏状态被隔离且不静默改写，畸形当前/未来迁移版本拒绝；旧存档缺失 P1 状态时清空，v1 迁移绑定原世界 |
| 无硬淘汰 | 无固定容量、FIFO、字符/数组位置历史删除；完整真源不进入每轮全量克隆 | 已通过：focused 大账本用例、无硬截断审计和源码计数证明；`collectState()` 使用缓存索引和相关视图，公开查询有界分页但 Store v2 继续完整追加保存 |
| 权威同步 | 产品决策、蓝图、系统索引、架构、manifest、runtime、字段契约、Prompt 与生成接线一致 | 已完成：`PD-029`、本蓝图、系统索引、两份架构文档、Prompt `4.2.1`、13+12 runtime、`event-input` 字段契约和 generated wiring 已对齐；最终证据以本任务交付关闸记录为准 |

P1 二次审批记录：独立复审最初结论为 NO-GO，发现延期 ID 碰撞、损坏快照可进入运行态、候选终态和查询缺失、历史事实未进入 Prompt、scope/生命周期旁路、能力未校验、v1 global 串线、跨界兑现失败和每轮全账本克隆等阻断。最终交付复审又发现浏览器 v2 水合绕过严格校验、运行写入与 strict restore 不闭合，以及字段契约生成器被 inline 空字段误导；现已分别以水合隔离、写入前验证和共享 TypeScript AST 解析器关闭。本任务逐项修复后，P0、P1、叙事协议、压缩、结构和无硬截断聚焦回归均通过；P1 才从“主体已接入”转为“可放行”。

P1 交付记录：本地功能版本 `5.1.4`，记录时间 `2026-07-19 22:59:50`，玩家更新文件 `public/changelog-17.txt`。交付证据包括 `test:historical-event-p1`、`test:world-context-p0`、`test:narrative-protocol`、`test:compression-runtime`、`test:prompt-wiring`、`test:creation-first-narrative`、无硬截断审计、结构检查、lint、TypeScript、治理/引用/插件检查与完整 `gate-check`。显式 `check:mod` 仍为与复审前完全相同的 80 项迁移期基线，未出现 `historical-event-ledger`、`mod-history-dynamics`、`causal-delay` 或新增 TypeScript 失败；本记录不表示已经部署到服务器。
