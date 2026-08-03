# 系统体系权威

## 目标

系统体系负责让代码、状态、计算、接口和目录各有唯一归属。依赖保持 `app -> mods -> core -> foundation`，页面消费公共能力，所属系统保留状态与写入权威；能由声明和生成器完成的接线不再手工重复维护。整个项目按公司式金字塔运行：核心模拟是总指挥，MOD 是部门，子系统是课/团队，组件是执行个体。

## 时间核心原则

时间是项目统一模拟源和最核心的运行轴。剧情推进度以及人物、世界、历史、因果、记忆、空间和其他随模拟变化的状态，优先从规范时间派生；各系统不得建立第二套全局时间，也不得用墙上时间、AI 叙述、页面点击或独立回合计数替代故事时间。

### 唯一源头与统一链路

```text
TimeSystem
  -> RoundContext.daysPassed / totalDays
  -> Orchestrator 同一时间快照
  -> 活动子系统本地计算、事件、历史、记忆和世界投影
  -> Prompt、提交、存档与页面结果
```

- `mod-engine` 的 `TimeSystem` 是规范时间唯一所有者。`RoundInfo.totalDays` 是累计时间，`RoundContext.daysPassed` 是本轮时间增量；两者由 `TimeSystem` 产生，其他系统只读。
- Orchestrator 在 `advance-time` 阶段按 `timeStep` 调用 `TimeSystem` 一次，再以同一 `RoundContext` 分发给活动系统。`roundSequence` 只用于幂等和批次顺序，不代表剧情时间。
- 剧情阶段和推进度以规范时间的经过为主轴；玩家选择、历史事件、因果、状态变化、张力和随机性只能作为同一时间节点内的条件或修正，不能另造推进时钟。
- 需要调度、衰减、到期、年龄、世界演化或局部时钟的系统，使用 `totalDays`、`daysPassed` 或其明确派生值；局部时钟必须锚定规范时间，不能独立累计。
- 页面只能选择行动或时间步长，AI 只能提出受限意图，均不能直接写规范时间。历史、事件、记忆、剧情和世界切换记录应绑定规范时间。
- 允许回合数用于幂等、批处理或性能窗口，但不得把回合数作为用户可感知的剧情或世界时间。

### 体系边界与当前对齐项

- 时间系统只拥有时间计算、步长、日历和时间快照；不拥有业务状态、剧情文本或其他系统内部计算。
- Orchestrator 负责按顺序调用和分发时间快照，不复制时间计算；各系统负责依据快照完成自己的计算、校验和写入。
- `plot-structure` 以 `phaseStartedAtTotalDays` 和 `phaseElapsedDays` 判定阶段时长，并按 `daysPassed` 缩放阶段自身的张力漂移；冲突与语义信号只作为同一规范时间节点内的条件修正。`roundSequence` 只用于幂等和阶段历史审计，不再承担剧情阶段计时。

## 当前架构

```text
应用层 app
└─ 业务层 mods
   ├─ 页面与共享界面
   ├─ 核心模拟与当前活动业务系统
   └─ 已声明但尚未进入当前 MVP 的扩展模拟系统
      ↓
核心层 core
├─ MOD 加载与运行时注册
├─ AI 请求、存储、账号和诊断
└─ 通用基础设施
   ↓
契约层 foundation
└─ 公共类型、子系统契约和跨层基础定义
```

## 公司式运行层级

- `mod-engine` 的核心模拟回合负责确定本轮目标、时间快照、活动成员和跨部门依赖；它只发布任务、汇总公开结果和发布终态，不拥有外部业务系统的私有状态。
- 各 MOD 接收核心模拟的任务后，在本部门边界内按自己的公共契约派发给子系统；子系统和组件完成本地计算、校验、写入和持久化，再逐级返回状态码、结果和诊断证据。
- 自动化层负责 Manifest 加载、依赖拓扑、生成接线、排队、状态校验、快照和重复步骤；自动化是调度基础设施，不是业务部门，不得代替 owning system 作业务判断或持有第二份状态。
- 所有可标准化流程统一声明稳定 ID、owner、failureTarget、五阶段、硬依赖、`order`、状态码、输入输出和结束前置条件；与总体目标无关或无唯一所有者的机制不得进入活动运行图。

## 统一运行机制

- 每个 MOD 的声明源是所属 `manifest.ts`，生命周期源是 `_internal/control.ts`，公共调用从所属 `index.ts` 或已声明公共入口进入。
- `scripts/codegen/generate-mod-wiring.mjs` 从 Manifest 自动生成 MOD 导入、子系统导入、别名、事件、Store、Prompt 和阶段接线；生成文件是派生结果，不是手工权威源。
- MOD 加载器先全量校验，再按硬依赖拓扑、Manifest 显式 `order`、ASCII 机器标识的固定决胜顺序执行；生命周期、Remote 注册、配置变更和 `onLoad` 都由公共执行序契约发布 `ready/running/终结` 状态，失败立即返回 `core-mod-loader`，不继续冻结运行时。
- 业务子系统由 `registerAllSubsystems()` 先按 Manifest 解析实例，再按 `mvp-stages-config.default.json` 当前活动清单的数组顺序原子接线；缺失、重复或未声明的活动成员在替换 Orchestrator 前失败。
- 回合阶段、MOD 生命周期和世界初始化步骤都声明 `prepare -> ready -> execute -> transition -> finalize`、硬依赖、`order`、所有者和故障接收者；`ready` 负责排队和资源就绪，`transition` 负责阻塞/等待、依赖汇合、跨系统校验与原子提交。未收到状态码、非法状态码、超时或终止性失败不会释放后续节点。同阶段、同依赖、同 `order` 的无冲突节点只有声明同一 `parallelGroup` 才并发，组内结果按确定性顺序记录，任一失败时仍等待同组终态后向流程所有者返回唯一失败。
- 活动执行流先在 `src/core/execution/execution-flow-registry.ts` 登记 `flowId/owner/failureTarget/department/subsystem`，共享执行器和结构门禁消费同一登记项；`npm run check:execution` 同时校验真实回合、MOD 生命周期、世界初始化、子系统推进的执行图、状态码、依赖祖先、唯一终态、生成接线漂移、事故根因链、观测证据与超时补丁禁令，并扫描已废弃的旧接线。
- 执行器的原始节点状态进入现有开发诊断 JSONL，层级字段固定为部门/MOD → 子系统/团队 → 组件节点，阶段固定为上述五项；数据查看器只对原始事件派生聚合和分类指标，业务状态仍由 owning system 持有。
- 是否参与当前核心模拟由 `src/mods/mod-engine/helpers/mvp-stages-config.default.json` 决定；目录、类或 Manifest 存在不等于已经激活。
- Store 或子系统拥有业务状态，页面和聚合器只消费投影；跨系统写入必须经过公共契约。
- 所有者自行完成能够在系统内部完成的计算、校验、状态写入、持久化和自动接线；调用方不复制这些职责。
- 调用方只提供契约规定的输入并消费公开结果；跨系统协调不改变原系统的状态与计算所有权。
- 源码、配置、测试、说明和日志按所属系统归档；跨系统活动权威进入本目录的体系树，不在项目根目录建立散落副本。

## 标识与命名

本节是项目运行标识的唯一活动命名源。Skill、其他权威树和代码注释只引用本节，不复制或另立同名规则。

### 基本规则

- 机器标识与显示名称分离。机器标识用于注册、路由、事件、存储、公共契约和持久数据；显示名称可以重复，不能作为机器主键。
- 每个机器标识先确定所有者和唯一范围。同一范围内必须唯一；跨范围允许同名，但必须通过明确命名空间区分。
- 新建跨系统机器标识的局部部分默认使用 ASCII 小写 kebab-case；事件和存储键可使用 `:` 分隔命名空间，文件路径使用项目既有路径约定。局部业务内容 ID 遵循所属现行契约，不因风格统一批量改名。
- 文件名、类名、导出名、注册键和生成常量从同一权威标识派生，不在不同文件另造别名或第二真源。
- 生成、注册或启动校验发现机器标识冲突时必须报错并停止相关接线；禁止静默覆盖、保留首项或无说明去重。新建或本次修改的事件允许多个监听方，但必须只有一个明确的发出方。
- 已进入公共契约或持久数据的标识重命名属于契约或数据变更；除非用户明确要求，不自动迁移、兼容或保留旧别名。

### 作用域与格式

| 对象 | 规范 | 唯一范围 | 命名源 |
|---|---|---|---|
| MOD | `mod-{kebab-name}`；目录、Manifest 和运行时键一致 | 全局 | 所属 `manifest.ts` 与 MOD 目录 |
| 子系统 | 运行 ID 为小写 kebab-case；文件为 `{id}-system.ts`，类为 `{PascalCase}System` | 活动运行注册表全局 | 所属子系统 `id` 与活动运行清单 |
| 事件 | `{owner-mod}:{verb}-{noun}` | 事件值全局；新建或修改时发出方单一，监听方可多 | Manifest 事件声明；生成常量为派生结果 |
| 路由 | 小写、稳定的 URL 路径 | 页面和 API 全局 | 所属路由声明与注册表 |
| 能力 | 使用当前项目的能力标识格式，不得重复声明 | 全局 | Manifest `provides` 与 Prototype 校验 |
| Store、Prompt、公共导出 | 遵循现有 TypeScript 符号格式，并在所属 MOD 公共命名空间内唯一 | 所属 MOD 公共边界 | Manifest、公共入口和所属声明 |
| 持久化键 | `<owner>:<kind>:<local-key>`；局部键不得使用显示名称 | 所属存储命名空间 | 所属存储服务或键常量 |
| 显示名称 | 中文或其他自然语言，可重复 | 所属业务对象 | 业务所有者 |

现有名称没有实际冲突时不做批量重命名；新增规则只约束新建或本次明确涉及的标识。

## 应用与核心服务

| 系统 | 要达到的目标 | 当前运行机制 | 权责边界与实时源 |
|---|---|---|---|
| App 路由 | 把 URL 和 API 请求交给已注册页面或服务 | Next.js 动态页面入口加载 MOD 页面，`src/app/api/` 承接服务端接口 | `src/app/`；不拥有业务状态 |
| MOD 加载器 | 解析依赖、启动生命周期并冻结可用运行时 | 读取生成的注册表，按依赖图加载 Control 和公共能力 | `src/core/mod-loader/`、`src/mods/registry.generated.ts`；不替业务系统保存状态 |
| AI 服务 | 统一玩家自有 API 目标、请求参数、响应终态、账号并发、按调用系统隔离的 DeepSeek 缓存归属、流式响应、用量、费用、错误和服务端边界 | 调用方必须提交 `custom`、玩家自己的 Key、API 网址与模型；默认设置只预填 DeepSeek 官方网址和 `deepseek-v4-flash`，不提供服务端托管凭据。代理拒绝所有非 `custom` 通道，受保护 Prompt 只发送到登记的 DeepSeek 官方 HTTPS 目标；后台世界初始化消费同一玩家配置且不再读取服务端 AI Key。主叙事及修复、数据分析及修复、基础属性分析及修复、事件识别及修复、宏观影响及修复、L1/L2/L3 压缩、世界初始化、命格、低频、适配和连接测试均使用类型化 `InternalCachePool`；DeepSeek `user_id` 由服务端可信账号或设备主体与池名组合并哈希，同主体同池稳定、不同池隔离，格式修复进入对应修复池。DeepSeek 不再接收未声明的 `seed`，其他 Provider 仍按自身契约处理。已完成思考参数映射、思考时移除无效采样参数、纯 JSON 单次 Schema 修复、流式最终 usage、SSE 保活忽略、截断终态识别、共享总时限和错误转译；2000 字主叙事按合法上界使用 `2688` tokens，关闭推理时共享总时限为 `155000ms`，浏览器与代理均覆盖完整响应读取，流式另保留 `45s` idle timeout。尚未完成的差距只剩账号级并发调度 | `src/core/ai-service/`、`src/app/api/proxy/`、`src/app/api/ai-usage/`；缓存池注册表拥有池标识，配置常量拥有 DeepSeek 预填与目标白名单，代理拥有最终 `user_id` 和上游传输，完整契约见 `PD-039`、`PD-040`；Key 只来自当次玩家请求，不持久化到服务端，偏好由 `mod-settings` 所有，AI 服务不拥有故事或业务状态 |
| 本地存储 | 保存槽位、快照、序列化、迁移数据和存档级时间轴记忆 | 存储管理器接收引擎统一收集的载荷并读写本地持久层；时间轴记忆库与压缩系统共用 `narrative-memory-policy.ts` 的确定性整数衰减策略，避免持久化查询与叙事投影采用不同算法 | `src/core/storage/`；各业务字段仍由所属 Store/子系统解释，压缩层级和摘要内容由 `summary-compressor` 所有 |
| 账号与玩家内容 | 管理账号身份、云端设置、排行、邮箱、画像任务、传奇投影和账号持久化 | 账号数据库拥有身份与普通长期数据；玩家内容数据库拥有常开排行榜、账号/诊断收件身份、邮件、稀疏收件状态、邮件天赋所有权、画像任务和跨局传奇决策。开发者广播只保存一份，列表用索引和稳定游标分页；邮件三天后不再可读并由五分钟机会清理与十五分钟定时清理回收。轮回天赋在托管、接受或退回时更新邮件所有权与账号投影，账号同步反向对账以防旧客户端恢复已寄出项。画像 worker 最多尝试 3 次，只有成功资产才成为邮件；绘图 Provider 仍需独立配置 | `src/core/account/`、`src/core/player-content/`、账号/排行榜/邮箱/传奇 API 与 `scripts/ops/send-player-mail.mjs`；页面不拥有邮件或可转移天赋事实，核心评分仍是排行资格的唯一计算所有者 |
| 结算评分 | 对所有世界生成可复算、可审计的统一结算结果 | 世界初始化固化 3-6 个维度的 `scoringProfile`；`life-scoring.ts` 只消费本地结构化证据，完整人生在原始分低于 90 时映射到 70-89，90 起正常取整，100 需额外通过全部完整性门禁。每轮正文保存迁移审计，人生记录固化完整评分输入；服务端通过同一函数复算并逐项比较结果后才允许排行、画像或传奇投影。AI 只提出受限维度定义和生成第二人称评语，不决定分数 | `src/core/scoring/`、`src/foundation/types/scoring.types.ts`、`src/mods/mod-world/scoring-profile.ts`、`world-scoring-profile-generation.ts`；页面、排行榜、邮箱和画像不建立第二套评分公式 |
| 诊断与日志 | 为 AI 调用、系统错误和玩家反馈提供可直接阅读并关联账号与设备来源的证据 | 身份初始化同时分配独立诊断编号和稳定明文 `device_provenance_id`；服务端把完整内容写入明文 SQLite，主库保留昨天和今天，前天及更早行先迁入同目录 `logs-archive.sqlite` 并逐列核验，再清出主库。同 ID 同内容在联合视图中只出现一次，同 ID 不同内容使迁移和读取明确失败并保留热库原行；服务端查询、分析器、反馈状态、运营面板和数据查看器统一读取热库与归档库，不提供永久清除入口。`/api/proxy` 被动把核心叙事每轮实际请求/响应按 exchange 追加到 TXT，并在真实主叙事首次调用保存一份完整生效文风；客户端不重复上传代理已保存的 AI 内容。开发环境把阶段机、质量、提交、记忆检索、压缩、自动存档、代理、评分复算和画像 worker 的系统边界事件写入按日 JSONL，只保留昨天和今天；浏览器事件随每轮唯一 outcome 聚合发送 | `src/core/logger/`、日志/反馈/身份/回合 outcome API、`narrative-round-archive.ts`、`development-system-diagnostic.server.ts`、`scripts/ops/lib/log-databases.mjs`、`scripts/ops/data-viewer.mjs`；不记录点击、输入、导航、时间按钮、分支按钮等操作，不加密、压缩、脱敏、截断、删除或使用内容引用，不成为故事或业务状态真源 |
| QQ 集成 | 提供账号绑定、积分与 QQ 投影 | 通过回环 API、签名请求和账号服务执行集成 | `src/core/account/qq-bot-integration.ts`、`qq-points-service.ts`、集成 API；详细契约为 `docs/qq-bot-integration-contract.md` |
| Foundation | 提供跨层公共类型和稳定子系统契约 | 上层依赖公共定义完成编译期和运行时边界校验 | `src/foundation/`；不包含产品流程或页面状态 |

## 业务 MOD

当前 `mvp-stages-config.default.json` 的 P8 活动清单包含 50 个外部业务成员和 12 个引擎成员；P6-P8 成员均已完成声明、生成接线和现行回合接入，实际推进由上下文能力画像与模拟范围控制。

| MOD | 要达到的目标 | 当前运行机制 | 权责边界与实时源 |
|---|---|---|---|
| `mod-pages` | 组合路由页面和页面内交互 | 页面经动态路由加载并调用其他 MOD 公共 API | `src/mods/mod-pages/`；只拥有页面临时状态，界面细节见 [界面体系](interface-tree.md) |
| `mod-ui` | 提供跨页面共用的组件、动作栏、弹层和界面原语 | 由页面按需组合共享组件与 UI Store | `src/mods/mod-ui/`、`src/app/globals.css`；不拥有业务状态 |
| `mod-engine` | 编排活动子系统、时间、Prompt、AI 回合、提交和引擎状态 | 运行声明式阶段机；正文协议通过后立即接纳故事，数据、基础属性、事件识别和宏观影响只登记版本化后台任务并由各所有者跨轮独立提交，压缩是唯一 AI 下一轮闸门 | `src/mods/mod-engine/`；详细机制见 [核心模拟](core-simulation.md) |
| `summary-compressor`（`mod-engine` 内部） | 生成三层时间轴摘要并维护记忆生命周期 | L1=4 轮，L2=16 轮，L3=64 轮；AI 生成带来源覆盖和 `1..10` 权重的时间段事件，本地校验、持久化、衰减、遗忘和高层原样携带。无任务直接成功；首次失败后两路并发重试，只提交首个合法候选，全部失败才维持下一轮阻塞 | `src/mods/mod-engine/subsystems/summary-compressor-system.ts`、`src/mods/mod-engine/helpers/compression-gate.ts`、`src/mods/mod-engine/helpers/timeline-memory.ts`；不拥有核心叙事正文 |
| `mod-world` | 管理世界/上下文注册、当前投影、空间、切换、初始化、世界实体与全局实体引用目录 | 当前 MVP 激活世界上下文相关子系统；`world-entity` 为玩家、NPC 和组织登记稳定实体引用，刷新恢复窗口可从组织实体、已知引用和空间端点重建临时目录，正式 owning snapshot 仍严格校验；`spatial-graph` 仍唯一拥有位置 | `src/mods/mod-world/`、`src/foundation/subsystem-contracts/world-context.contract.ts`、`npc-social.contract.ts`；不拥有 NPC 档案、社会关系、页面呈现或叙事阶段顺序 |
| `mod-character` | 管理基础属性、命格、寿命、生命周期、健康、气运、道德及死亡后的条件收束 | 当前 MVP 激活 `character-base`、`destiny-pattern`、`lifespan`、`lifecycle-system`、`health`、`luck`、`morality`。`luck` 开局本地随机 `-3..3`，每轮生成前按每点 `5%` 偏向投掷坏/无干扰/好方向并保存低优先级叙事引导，不接受 AI 写入；寿命按天保存生物钟规则；生命周期从规范 `totalDays` 派生年龄、阶段和属性修正；健康独占生命、体力、精神、伤病、死亡事实和尾声，页面 Store 只承接当前投影 | `src/mods/mod-character/`、`src/foundation/types/luck.types.ts`、`src/foundation/subsystem-contracts/life-cycle.contract.ts`；不拥有标准时间、历史事实或叙事编排，死亡必须绑定账本中的专属事件后才能持久化 |
| `mod-history-dynamics` | 保存可审计的历史事实、证据、迁移、转变、因果边和未来事件候选 | 当前 MVP 激活追加式 `historical-event-ledger`：事件识别把本轮已发生的注册事件作为批次输入，把尚未发生但具备未来触发条件的事项登记为 `available` 候选；稳定历史事件 ID、候选 ID 和状态均由账本本地分配与维护。到期因果沿用 `causal-delay` 编号，事件识别失败时保留编号并按本地严重度重新排期 | `src/mods/mod-history-dynamics/`、`src/foundation/subsystem-contracts/historical-event.contract.ts`、`src/mods/mod-engine/subsystems/causal-delay-system.ts`；不拥有叙事正文或其他系统状态，页面与 Orchestrator 不建立第二候选 Store |
| `mod-social` | 保存跨人物与组织的通用有向关系、作用域和追加式关系迁移 | 当前 MVP 激活唯一 `relationship-system`；关系端点必须来自实体目录，作用域为全局、单上下文或显式跨上下文 | `src/mods/mod-social/`、`src/foundation/subsystem-contracts/npc-social.contract.ts`；不拥有实体身份、位置、NPC 私有记忆或文化专项关系语义 |
| `mod-npc` | 保存 NPC 连续身份、当地状态、目标、行为记录和独立主观记忆 | 当前 MVP 激活唯一 `npc-system`；年龄从规范时间派生，当前相关投影只包含玩家同场实体、一跳关系端点及其相关记录，后台按能力画像低频聚合；创建身份时可在同一回合声明计划实体引用，由 owning system 在应用阶段登记。NPC 记忆优先引用本轮已成立的历史事件；本轮没有可引用事件时，由 owning system 自动建立可追踪的行为来源记录，不让整轮正文因单条主观记忆而回滚 | `src/mods/mod-npc/`、`src/foundation/subsystem-contracts/npc-social.contract.ts`；不拥有玩家角色、空间位置、关系图、历史事实或叙事编排 |
| `mod-environment-ecology` | 保存按世界上下文和空间节点分区的地理、气候、生态、污染与自然资源事实 | 当前运行清单激活 `geography`、`natural-resource`、`climate`、`ecology`、`pollution`；每个系统按上下文封闭快照推进并由各自能力画像决定是否有有效状态 | `src/mods/mod-environment-ecology/`、`src/foundation/subsystem-contracts/spatial-environment.contract.ts`；不拥有空间关系、世界身份、经济库存或地图 UI |
| `mod-progression` | 统一管理通用成长、历史事实成就和作用域化社会评价 | 当前 MVP 激活 `growth-system`、`achievement`、`reputation`。成长统一保存技能和稳定能力；成就只查询已提交历史事件；声望区分评价人物、上下文和全局评价域。`growth-system` 与 `reputation` 进入现行七字段系统指令，成就由本地事实验证 | `src/mods/mod-progression/`、`src/foundation/subsystem-contracts/progression.contract.ts`；不写角色基础属性、不把正文当历史事实，也不让某个上下文的成长或评价泄漏到其他上下文 |
| `mod-settings` | 保存阅读界面、叙事偏好、模型调用和玩家自己的统计投影 | Store 保存四 Tab 对应偏好；自定义文风使用编辑稿与已生效版本分离，正文目标保存为 50 至 2000 的 16 个固定档位，思考模式保存四档枚举。模型配置固定为 `custom`，保存玩家自己的 Key、网址和模型；v12 迁移、导入与持久化合并都会把旧托管配置收口为 DeepSeek 网址、`deepseek-v4-flash` 与空 Key，同时保留完整的玩家自有三元组。DeepSeek 预设填充只替换网址和模型，不覆盖 Key。数据统计只读取 AI 服务在本浏览器形成的缓存、Token、费用和余额投影，并提供玩家可读体验概览与反馈入口，不注册引擎子系统 | `src/mods/mod-settings/`；不拥有请求传输、Token 预算、服务端日志、其他玩家数据或管理者查看能力 |
| `mod-difficulty` | 保存难度及灾害、敌人、压制、遭遇和成本参数 | Store 向实际计算所有者提供参数，不注册引擎子系统 | `src/mods/mod-difficulty/`；不复制消费者的计算 |
| `mod-world-map` | 把当前上下文投影为地图、星图、位面图或场景导航，并处理缩放、平移和页面选择 | 页面按需调用 `projectWorldMap()`，从空间图、地理、资源和实体位置生成脱离源引用的读取模型；Canvas/Store 只保存显示交互，不注册引擎子系统 | `src/mods/mod-world-map/`、`src/mods/mod-world-map/map-projection.ts`；空间事实归 `mod-world`，地理与资源归 `mod-environment-ecology`，修改投影不能反写任何 owning system |

## 扩展模拟 MOD

下列 MOD 已有声明、生命周期、Store 或子系统实现，但其模拟成员当前未列入 MVP 运行清单。它们可以被现有页面或公共调用读取；只有更新运行清单后，所属子系统才进入每轮核心模拟。

| MOD | 系统目标 | 所有权边界与实时源 |
|---|---|---|
| `mod-base-universe` | 天体、时代、命运预言和创世扩展 | 当前运行清单激活 `celestial`、`era`、`fate-prophecy`、`divine-creation`；旧 `world-map` 已删除，不拥有当前上下文、地理、资源、地图呈现或叙事编排 |
| `mod-power-system` | 世界力量框架上的战力、修炼、怪物、遭遇、信仰、干预和异常插件 | 当前运行清单激活 `combat-power`、`cultivation`、`monster`、`fortune-encounter`、`faith`、`divine-intervention`、`anomaly-phenomena`。力量框架由 `mod-world` 在创建时固化，P8 不使用固定阶位表；特殊材料与至尊物品已并入 `natural-resource`/`item`，不独立拥有库存。`src/mods/mod-power-system/`；不接管角色基础属性、通用成长、经济或世界配置真源 |
| `mod-economy` | 经济、货币、职业、物品、库存、聚落和人口 | 当前运行清单激活 `economy`、`population`、`settlement`、`work`、`item`；经济拥有生产结构、货币存量、市场周期与物品价格，资源储量仍归环境系统 | `src/mods/mod-economy/`；不接管政治、资源储量或世界身份 |
| `mod-politics` | 社会结构、派系实体、法律与冲突 | 当前运行清单激活 `social-stratification`、`faction-dynamics`、`legal`、`conflict-cycle`；国家只是政治实体类型，不保留独立国家外交系统 | `src/mods/mod-politics/`；不接管经济、关系图或世界状态 |
| `mod-culture` | 文化、艺术、教育和作品 | 当前运行清单激活 `culture`、`art`、`education`、`works`；家庭、师徒、社会价值和语言命名作为通用关系、生命周期、文化或页面服务语义，不建立同名模拟所有者 | `src/mods/mod-culture/`；不拥有通用成长、评价、关系图，也不接管角色与世界的所属状态 |
| `mod-tech-level` | 文化技术领域、知识扩散和技术采纳 | 当前运行清单激活 `culture-tech`；产业生产率和技术采纳由 `economy.production` 拥有，资源分布仍归 `natural-resource` | `src/mods/mod-tech-level/`；不接管基础世界、资源储量或经济状态 |

## 唯一实时源

| 事实 | 唯一活动源 |
|---|---|
| MOD 能力、依赖和声明成员 | 所属 `manifest.ts` |
| MOD 生命周期 | 所属 `_internal/control.ts` |
| 当前模拟成员和叙事可写成员 | `src/mods/mod-engine/helpers/mvp-stages-config.default.json` |
| 规范模拟时间与时间快照 | `src/mods/mod-engine/subsystems/time-system.ts`、`src/foundation/types/subsystem.types.ts`；`TimeSystem` 是唯一时间写入者 |
| 自动接线结果 | `scripts/codegen/generate-mod-wiring.mjs` 及其生成目标 |
| 页面呈现和页面内交互 | `src/mods/mod-pages/pages/` |
| 业务状态与校验 | 所属 Store、子系统和公共 API |
| 存档级叙事记忆数据库 | `src/core/storage/narrative-memory-store.ts` 及 `src/app/api/narrative-memory/route.ts` |
| 跨系统执行顺序 | [逻辑体系](logic-tree.md) 与 [核心模拟](core-simulation.md) |
