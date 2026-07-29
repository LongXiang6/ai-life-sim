# 系统体系权威

## 目标

系统体系负责让代码、状态、计算、接口和目录各有唯一归属。依赖保持 `app -> mods -> core -> foundation`，页面消费公共能力，所属系统保留状态与写入权威；能由声明和生成器完成的接线不再手工重复维护。

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

## 统一运行机制

- 每个 MOD 的声明源是所属 `manifest.ts`，生命周期源是 `_internal/control.ts`，公共调用从所属 `index.ts` 或已声明公共入口进入。
- `scripts/codegen/generate-mod-wiring.mjs` 从 Manifest 自动生成 MOD 导入、子系统导入、别名、事件、Store、Prompt 和阶段接线；生成文件是派生结果，不是手工权威源。
- MOD 加载器按依赖图排序并执行生命周期；业务子系统再由 `registerAllSubsystems()` 按排序后的 Manifest 自动注册。
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
| AI 服务 | 统一 Provider 能力、模型目标、请求参数、响应终态、账号并发、按调用系统隔离的 DeepSeek 缓存归属、流式响应、用量、费用、错误和服务端边界 | 调用方提交模型配置与分段 Prompt；当前已登记 DeepSeek V4 模型和价格，完成思考参数映射、思考时移除无效采样参数、流式最终 usage、SSE 保活忽略、错误转译及内部 `InternalCachePool` 统计。尚未完成的差距是：池标识未传到代理，源码仍有退役模型名，DeepSeek 仍收到未声明的 `seed`，非流式 200 未完整校验失败终态，浏览器与代理总超时不统一，账号级并发调度未建立 | `src/core/ai-service/`、`src/app/api/proxy/`、`src/app/api/ai-usage/`；Provider 适配层拥有能力白名单、参数和终态解释，代理拥有最终 `user_id`、上游传输与账号调度，完整契约见 `PD-039`、`PD-040`；偏好由 `mod-settings` 所有，AI 服务不拥有故事或业务状态 |
| 本地存储 | 保存槽位、快照、序列化、迁移数据和存档级时间轴记忆 | 存储管理器接收引擎统一收集的载荷并读写本地持久层；时间轴记忆库与压缩系统共用 `narrative-memory-policy.ts` 的确定性整数衰减策略，避免持久化查询与叙事投影采用不同算法 | `src/core/storage/`；各业务字段仍由所属 Store/子系统解释，压缩层级和摘要内容由 `summary-compressor` 所有 |
| 账号与玩家内容 | 管理账号身份、云端设置、排行、邮箱、画像任务、传奇投影和账号持久化 | 账号数据库拥有身份与长期数据；登录/注册时按 `recordId` 合并游客与云端人生记录。玩家内容数据库按账号保存最佳合格人生、画像任务、邮件和跨局传奇决策；它通过核心评分公共函数复算资格，但不拥有或复制评分公式。画像由幂等后台 worker 最多尝试 3 次，邮箱暴露处理中、失败和完成状态。排行榜/邮箱默认可用，绘图 Provider 仍需服务端显式配置 | `src/core/account/`、`src/core/player-content/` 和账号/排行榜/传奇 API；不接管匿名本地运行态，所有投影以账号、记录或目标人生键保持幂等 |
| 结算评分 | 对所有世界生成可复算、可审计的统一结算结果 | 世界初始化固化 3-6 个维度的 `scoringProfile`；`life-scoring.ts` 只消费本地结构化证据，完整人生在原始分低于 90 时映射到 70-89，90 起正常取整，100 需额外通过全部完整性门禁。每轮正文保存迁移审计，人生记录固化完整评分输入；服务端通过同一函数复算并逐项比较结果后才允许排行、画像或传奇投影。AI 只提出受限维度定义和生成第二人称评语，不决定分数 | `src/core/scoring/`、`src/foundation/types/scoring.types.ts`、`src/mods/mod-world/scoring-profile.ts`、`world-scoring-profile-generation.ts`；页面、排行榜、邮箱和画像不建立第二套评分公式 |
| 诊断与日志 | 为 AI 调用、系统错误和玩家反馈提供可直接阅读并关联账号与设备来源的证据 | 身份初始化同时分配独立诊断编号和稳定明文 `device_provenance_id`；服务端把完整内容写入明文 SQLite，保留昨天和今天。`/api/proxy` 被动把核心叙事每轮实际请求/响应按 exchange 追加到 TXT，并在真实主叙事首次调用保存一份完整生效文风；客户端不重复上传代理已保存的 AI 内容。开发环境把阶段机、质量、提交、记忆检索、压缩、自动存档、代理、评分复算和画像 worker 的系统边界事件写入按日 JSONL，只保留昨天和今天；浏览器事件随每轮唯一 outcome 聚合发送 | `src/core/logger/`、日志/反馈/身份/回合 outcome API、`narrative-round-archive.ts`、`development-system-diagnostic.server.ts`、`scripts/ops/data-viewer.mjs`；不记录点击、输入、导航、时间按钮、分支按钮等操作，不加密、压缩、脱敏、截断或使用内容引用，不成为故事或业务状态真源 |
| QQ 集成 | 提供账号绑定、积分与 QQ 投影 | 通过回环 API、签名请求和账号服务执行集成 | `src/core/account/qq-bot-integration.ts`、`qq-points-service.ts`、集成 API；详细契约为 `docs/qq-bot-integration-contract.md` |
| Foundation | 提供跨层公共类型和稳定子系统契约 | 上层依赖公共定义完成编译期和运行时边界校验 | `src/foundation/`；不包含产品流程或页面状态 |

## 业务 MOD

| MOD | 要达到的目标 | 当前运行机制 | 权责边界与实时源 |
|---|---|---|---|
| `mod-pages` | 组合路由页面和页面内交互 | 页面经动态路由加载并调用其他 MOD 公共 API | `src/mods/mod-pages/`；只拥有页面临时状态，界面细节见 [界面体系](interface-tree.md) |
| `mod-ui` | 提供跨页面共用的组件、动作栏、弹层和界面原语 | 由页面按需组合共享组件与 UI Store | `src/mods/mod-ui/`、`src/app/globals.css`；不拥有业务状态 |
| `mod-engine` | 编排活动子系统、时间、Prompt、AI 回合、提交和引擎状态 | 运行声明式阶段机，并把合法变更提交给所属系统 | `src/mods/mod-engine/`；详细机制见 [核心模拟](core-simulation.md) |
| `summary-compressor`（`mod-engine` 内部） | 生成三层时间轴摘要并维护记忆生命周期 | L1=4 轮，L2=16 轮，L3=64 轮；AI 只生成带来源覆盖的时间段事件，本地计算权重衰减、遗忘和高层原样携带 | `src/mods/mod-engine/subsystems/summary-compressor-system.ts`、`src/mods/mod-engine/helpers/timeline-memory.ts`；不拥有核心叙事正文 |
| `mod-world` | 管理世界/上下文注册、当前投影、空间、切换、初始化、世界实体与全局实体引用目录 | 当前 MVP 激活世界上下文相关子系统；`world-entity` 为玩家、NPC 和组织登记稳定实体引用，`spatial-graph` 仍唯一拥有位置 | `src/mods/mod-world/`、`src/foundation/subsystem-contracts/world-context.contract.ts`、`npc-social.contract.ts`；不拥有 NPC 档案、社会关系、页面呈现或叙事阶段顺序 |
| `mod-character` | 管理基础属性、命格、寿命、气运、道德及角色生命周期 | 当前 MVP 激活 `character-base`、`destiny-pattern`、`lifespan`、`luck`、`morality`；角色 Store 承接投影 | `src/mods/mod-character/`；不拥有标准时间和叙事编排 |
| `mod-history-dynamics` | 保存可审计的历史事实、证据、迁移、转变和因果边 | 当前 MVP 激活追加式 `historical-event-ledger`，叙事提交以批次预检和提交 | `src/mods/mod-history-dynamics/`、`src/foundation/subsystem-contracts/historical-event.contract.ts`；不拥有叙事正文或其他系统状态 |
| `mod-social` | 保存跨人物与组织的通用有向关系、作用域和追加式关系迁移 | 当前 MVP 激活唯一 `relationship-system`；关系端点必须来自实体目录，作用域为全局、单上下文或显式跨上下文 | `src/mods/mod-social/`、`src/foundation/subsystem-contracts/npc-social.contract.ts`；不拥有实体身份、位置、NPC 私有记忆或文化专项关系语义 |
| `mod-npc` | 保存 NPC 连续身份、当地状态、目标、行为记录和独立主观记忆 | 当前 MVP 激活唯一 `npc-system`；年龄从规范时间派生，当前相关投影只包含玩家同场实体、一跳关系端点及其相关记录，后台按能力画像低频聚合 | `src/mods/mod-npc/`、`src/foundation/subsystem-contracts/npc-social.contract.ts`；不拥有玩家角色、空间位置、关系图、历史事实或叙事编排 |
| `mod-settings` | 保存阅读界面、叙事偏好、模型调用和玩家自己的统计投影 | Store 保存四 Tab 对应偏好；自定义文风使用编辑稿与已生效版本分离，正文目标保存为 50 至 2000 的 16 个固定档位，思考模式保存四档枚举，数据统计只读取 AI 服务在本浏览器形成的缓存、Token、费用和余额投影，不注册引擎子系统 | `src/mods/mod-settings/`；不拥有请求传输、Token 预算、服务端日志、其他玩家数据或管理者查看能力 |
| `mod-difficulty` | 保存难度及灾害、敌人、压制、遭遇和成本参数 | Store 向实际计算所有者提供参数，不注册引擎子系统 | `src/mods/mod-difficulty/`；不复制消费者的计算 |
| `mod-world-map` | 渲染地图、地形、势力、资源覆盖并处理缩放和平移 | Canvas/Store 由当前调用页面驱动，不注册引擎子系统 | `src/mods/mod-world-map/`；基础地图事实由 `mod-base-universe` 所有 |

## 扩展模拟 MOD

下列 MOD 已有声明、生命周期、Store 或子系统实现，但其模拟成员当前未列入 MVP 运行清单。它们可以被现有页面或公共调用读取；只有更新运行清单后，所属子系统才进入每轮核心模拟。

| MOD | 系统目标 | 所有权边界与实时源 |
|---|---|---|
| `mod-base-universe` | 天体、时代、基础地图、命运预言和创世 | `src/mods/mod-base-universe/`；不拥有当前上下文、地图呈现或叙事编排 |
| `mod-environment-ecology` | 气候、地理、生态、自然资源和污染 | `src/mods/mod-environment-ecology/`；不拥有世界身份和地图 UI |
| `mod-power-system` | 战力、修炼、怪物、遭遇、信仰、异常、材料和技能 | 数值子系统当前未列入 MVP 运行清单，不参与每轮状态推进；其 `1-24` 阶名称和边界作为世界力量设定的只读参考，经 `mod-world` 和 Orchestrator 投影到有力量体系世界的主叙事输入。`src/mods/mod-power-system/`；不接管角色或世界状态 |
| `mod-economy` | 经济、货币、职业、物品、库存、聚落和人口 | `src/mods/mod-economy/`；不接管政治或世界状态 |
| `mod-politics` | 阶层、派系、国家关系、法律、冲突、语言和价值观 | `src/mods/mod-politics/`；不接管经济或世界状态 |
| `mod-culture` | 文化、艺术、教育、声望、成就、家庭和个人能力 | `src/mods/mod-culture/`；不拥有通用关系图，也不接管角色与世界的所属状态 |
| `mod-tech-level` | 工业层级、资源分布效应、文化技术和意识趋势 | `src/mods/mod-tech-level/`；不接管基础世界、资源或文化状态 |

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
