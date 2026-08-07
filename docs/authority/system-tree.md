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
- 页面只能选择本轮行动或时间步长，AI 只能生成叙事与协议内受限写入，均不能直接写规范时间。历史、事件、记忆、剧情和世界切换记录应绑定规范时间。
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
   └─ 未进入活动清单的普通源码与页面能力
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

## 四个核心所有者

当前核心模拟以四个叙事事实所有者为中心。被合并的旧概念仍可出现在剧情中，但不再拥有独立推进器、Store、Prompt 段或存档快照。

| 中文名称 | 机器标识与所有者 | 当前用途 | 不再承担 |
|---|---|---|---|
| 世界区域系统 | `spatial-graph` / `mod-world` | 保存世界形态、区域节点、区域关联、当前区域和紧凑区域概况；区域概况包含叙事所需的气候、生态、资源、污染、人口、聚落、经济、文化、教育、社会结构、势力、法律和冲突背景 | 不追踪人物精确位置，不创建世界实体目录，不分别推进环境、经济、政治或文化状态 |
| 角色状态系统 | `character-base` / `mod-character` | 保存基础属性、起始年龄、当前年龄、AI 生成的生命阶段、健康、气运、道德、叙事寿命上限、死亡事实和尾声 | 不保留独立寿命、生命周期、健康、气运或道德系统；达到寿命上限只增加终局风险，不自动判定老死 |
| 统一记忆系统 | `memory-lifecycle` / `mod-engine`，由 `summary-compressor` 生成压缩节点 | 统一保存人物关系连续性、玩家原创事实、时间段、事件、权重、区域和可检索时间轴；主叙事只消费公开的“时间 + 事件”投影 | 不保留独立关系图、NPC 私有记忆、记忆抽取、记忆遗忘或核心记忆第二真源 |
| 时间日历系统 | `time` / `mod-engine` | 统一推进规范时间、年龄、季节、游戏历法和节日范围；中国节日默认，可选加入国际节日，并向主叙事提供当前日期、季节、节日和生命阶段提示 | 不保留独立天象或纪元推进系统，不使用回合数替代剧情时间，不设置整局最大回合数 |

## 当前活动成员

`src/mods/mod-engine/helpers/mvp-stages-config.default.json` 当前唯一登记 13 个外部业务成员和 9 个引擎成员，共 22 个。中文名称用于产品与权威说明，机器标识只用于注册、路由、状态和测试。

### 外部业务成员

| 中文名称 | 机器标识 | 用途与所有者 |
|---|---|---|
| 世界上下文注册系统 | `world-context-registry` | `mod-world` 登记世界上下文和当前上下文身份 |
| 上下文能力配置系统 | `contextual-capability-profile` | `mod-world` 判断当前世界允许哪些能力和题材插件生效 |
| 世界区域系统 | `spatial-graph` | `mod-world` 保存世界形态、区域关系、当前区域和区域概况 |
| 上下文切换系统 | `context-transition` | `mod-world` 在不同世界上下文之间切换并同步规范时间锚点 |
| 模拟范围策略系统 | `simulation-scope-policy` | `mod-world` 决定当前、后台和冻结上下文的运行范围 |
| 世界初始化系统 | `world-init` | `mod-world` 复用现有初始化 AI 生成世界校准、区域概况和角色生命阶段模板 |
| 历史事件账本系统 | `historical-event-ledger` | `mod-history-dynamics` 保存已确认事件、证据、候选和因果关系 |
| 通用成长系统 | `growth-system` | `mod-progression` 保存技能、稳定能力和来源化成长记录；不再维护成就或声望状态 |
| 角色状态系统 | `character-base` | `mod-character` 统一拥有属性、年龄阶段、健康、气运、道德、寿命风险、死亡和尾声 |
| 命格系统 | `destiny-pattern` | `mod-character` 保存创建期命格和其属性、叙事效果 |
| 知识与技术系统 | `culture-tech` | `mod-tech-level` 保存仍被保留的知识成熟、研究能力和技术应用状态 |
| 通用力量框架系统 | `combat-power` | `mod-power-system` 保存世界内力量阶位和力量进度 |
| 修炼适配系统 | `cultivation` | `mod-power-system` 处理训练、瓶颈和突破规则 |

### 引擎成员

| 中文名称 | 机器标识 | 用途 |
|---|---|---|
| 时间日历系统 | `time` | 推进规范时间、季节、日期和节日上下文 |
| 回合编排系统 | `orchestrator` | 编排本轮目标、活动成员、AI 调用、提交和终态 |
| 叙事解析系统 | `narrative-parser` | 解析玩家可见正文和可选分支协议 |
| 摘要压缩系统 | `summary-compressor` | 按 4/16/64 轮生成分层时间轴摘要 |
| 子系统相关性系统 | `subsystem-relevance` | 选择本轮需要进入主叙事的紧凑状态摘要 |
| 统一记忆系统 | `memory-lifecycle` | 保存、检索、衰减和投影统一剧情时间轴 |
| 延迟因果系统 | `causal-delay` | 登记并解决跨时间的延期后果 |
| 剧情结构系统 | `plot-structure` | 依据规范时间和结构信号提供剧情阶段与节奏引导 |
| 伏笔系统 | `foreshadowing` | 登记、激活和回收伏笔 |

## 业务 MOD

| MOD | 当前职责 | 权责边界与实时源 |
|---|---|---|
| `mod-pages` | 组合路由页面和页面交互 | `src/mods/mod-pages/`；只拥有页面临时状态 |
| `mod-ui` | 提供共享组件和界面原语 | `src/mods/mod-ui/`、`src/app/globals.css`；不拥有业务状态 |
| `mod-engine` | 编排时间、回合、Prompt、AI、统一记忆和提交 | `src/mods/mod-engine/`；详细机制见 [核心模拟](core-simulation.md) |
| `mod-world` | 拥有世界上下文、世界区域、切换、范围和初始化 | `src/mods/mod-world/`、`src/foundation/subsystem-contracts/world-context.contract.ts` |
| `mod-character` | 拥有角色状态与命格 | `src/mods/mod-character/`、`src/foundation/subsystem-contracts/character-state.contract.ts` |
| `mod-history-dynamics` | 拥有历史事件账本 | `src/mods/mod-history-dynamics/`、`src/foundation/subsystem-contracts/historical-event.contract.ts` |
| `mod-progression` | 只保留通用成长 | `src/mods/mod-progression/`、`src/foundation/subsystem-contracts/progression.contract.ts` |
| `mod-tech-level` | 保留知识与技术状态 | `src/mods/mod-tech-level/`；不接管区域经济、教育或文化背景 |
| `mod-power-system` | 只保留力量框架与修炼适配 | `src/mods/mod-power-system/`；机缘、异常、怪物、信仰和神明干预不再是独立系统 |
| `mod-world-map` | 把世界区域关系投影为地图或导航视图 | `src/mods/mod-world-map/`；只读区域图，不反写世界状态 |
| `mod-settings` | 保存阅读、模型和玩家偏好 | `src/mods/mod-settings/`；不拥有 AI 传输或故事状态 |
| `mod-difficulty` | 提供难度参数 | `src/mods/mod-difficulty/`；不复制消费者计算 |

## 非独立叙事概念

- NPC、关系、职业、物品、作品、机缘、异常现象、怪物、信仰、神明、声望和成就仍可由故事 AI 自由叙述；删除的是专用状态追踪，不是题材许可。
- 人物认识、关系变化和共同事件写入统一记忆时间轴；不再建立关系边、NPC 行为队列或实体目录。
- 地理、资源、气候、生态、污染、人口、聚落、经济、文化、艺术、教育、阶层、势力、法律和冲突只作为世界区域概况或历史事实；没有逐回合独立数值推进。
- 校准 Schema 中保留的同名 modifier 只表达世界区域背景、角色状态修正或叙事倾向，不能恢复被删除系统的状态所有权。

## 唯一实时源

| 事实 | 唯一活动源 |
|---|---|
| MOD 能力、依赖和声明成员 | 所属 `manifest.ts` |
| MOD 生命周期 | 所属 `_internal/control.ts` |
| 当前模拟成员和叙事可写成员 | `src/mods/mod-engine/helpers/mvp-stages-config.default.json` |
| 规范模拟时间、日历与节日 | `src/mods/mod-engine/subsystems/time-system.ts`、`src/mods/mod-engine/subsystems/time-system/festival-calendar.ts`、`src/mods/mod-engine/helpers/calendar-narrative-context.ts` |
| 世界形态、区域关系与区域概况 | `src/mods/mod-world/subsystems/spatial-graph-system.ts`、`src/mods/mod-world/types/regions.ts`、`src/mods/mod-world/utils/world-region-profile.ts` |
| 角色状态与生命阶段 | `src/mods/mod-character/subsystems/character-base-system.ts`、`character-status-runtime.ts`、`character-status-update.ts`、`src/foundation/subsystem-contracts/character-state.contract.ts` |
| 统一记忆与人物连续性 | `src/mods/mod-engine/subsystems/memory-lifecycle-system.ts`、`memory-lifecycle-system/timeline-facts.ts`、`summary-compressor-system.ts` |
| 自动接线结果 | `scripts/codegen/generate-mod-wiring.mjs` 及其生成目标 |
| 页面呈现和页面内交互 | `src/mods/mod-pages/pages/` |
| 业务状态与校验 | 所属 Store、子系统和公共 API |
| 存档级叙事记忆数据库 | `src/core/storage/narrative-memory-store.ts` 及 `src/app/api/narrative-memory/route.ts` |
| 跨系统执行顺序 | [逻辑体系](logic-tree.md) 与 [核心模拟](core-simulation.md) |
