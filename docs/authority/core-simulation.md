# 核心模拟权威

## 目标

核心模拟负责把玩家一次推进转换为连续、可验证、可持久化的世界与人生变化：本地规则先推进，AI 生成玩家可见叙事和受限结构化意图，所属系统校验并提交状态，失败路径不伪装为成功。

核心模拟是系统体系中最重要的运行链路，因此本文件比其他活动权威保留更多机制细节。它同时是项目运行时的总指挥：每轮确定目标和上下文，向活动 MOD 派发任务，只等待本轮声明为必需的节点逐级回报，再发布唯一终态；正文后的独立分析由各所有者异步收束，不进入玩家推进的全体等待屏障。

## 权责边界

- Orchestrator 拥有回合顺序、当前回合状态、叙事历史投影和跨子系统事务协调。
- 每个核心回合由 Orchestrator 作为总指挥向活动 MOD 派发本轮目标；MOD 作为部门负责人在自己的公共边界内继续委派子系统和组件，并逐级回报状态、结果和证据。
- 执行器、代码生成器和生命周期加载器只负责五阶段调度、依赖排队、状态校验、快照和诊断；它们不代替业务系统计算或持有业务状态。
- 每个业务子系统拥有自己的状态、字段校验、预检和提交；Orchestrator 不绕过所有者直接改写其私有 Store。
- AI 只提交协议内意图，不拥有系统状态；页面只发起回合并消费引擎投影。
- 历史账本拥有已提交事实，记忆与摘要是派生投影，不能替代完整故事或所属业务状态。

## 时间驱动与剧情推进

- **核心目标**：把规范时间作为每次核心模拟的第一驱动，让剧情推进和所有时间相关系统共享同一个可验证的时间节点；其他驱动力只在该节点内影响结果，不建立平行时间轴。
- **当前机制**：`advance-time` 由 Orchestrator 把存档回合导入 `TimeSystem`，按 `timeStep` 完成必要的周期对齐或推进；随后 `buildRoundContext()` 注入 `daysPassed` 与 `totalDays`，活动子系统在同一上下文中执行本地规则、收集状态、生成事件和组装 Prompt。
- **剧情推进规则**：剧情阶段的持续时间、年龄、到期、延迟因果和世界演化以 `totalDays` 或 `daysPassed` 为主轴；历史事件、玩家选择、状态变化、张力和随机性是条件或修正，不能取代时间轴。`plot-structure` 以阶段起点总天数与已持续天数判定阶段，并按本轮经过天数缩放自然张力漂移；回合序号只保留幂等和审计用途。
- **其他系统规则**：世界上下文的当地时钟、历史事件的创建/到期时间、记忆生命周期和系统衰减都必须锚定规范时间；系统可以拥有自己的业务状态和派生指标，但不能独立累计全局时间。回合数仅可用于幂等、批处理或性能窗口。
- **统一链路**：`TimeSystem -> RoundContext -> Orchestrator -> 活动子系统 -> 历史/因果/记忆/世界投影 -> Prompt 与原子提交`。页面选择行动或步长，AI 提出受限意图，二者都不直接写规范时间。
- **叙事视角**：`day:1`、`month:1`、`season:1`、`year:1`、`year:3`、`year:5`、`year:10`、`year:50`、`year:100`、`year:200`、`year:500`、`year:1000` 各自拥有唯一视角配置。日级贴近连续现场，月季级使用少量因果相连且镜头一致的代表性场景；一年使用二至三个前后承接的人物场景，三年至十年继续保持角色及其直接关系层面的阶段场景，从半世纪起才自然扩展到家族、组织、社会、制度、文明和时代遗产。Orchestrator 将该档提示与真实历法窗口共同写入 `timeGuideText`，再由无状态引导编译器按固定顺序进入本轮系统引导。字数配置只拥有段落、句数和展开密度，不得把年级跨度压回单一现场，也不得把宏观报告与即时现场混写；短档通过压缩每个场景的动作、对话和环境细节控制篇幅，不删除当前时间尺度要求的阶段节点。
- **实时源**：`src/mods/mod-engine/subsystems/time-system.ts`、`src/mods/mod-engine/subsystems/orchestrator-system.ts`、`src/mods/mod-engine/helpers/time-scale-narrative.ts`、`src/foundation/constants/time-steps.ts`、`src/foundation/types/subsystem.types.ts`、`src/mods/mod-engine/subsystems/plot-structure-system.ts`、`src/mods/mod-world/utils/world-context-runtime.ts`。

## 核心结构

```text
应用启动
└─ MOD 自动加载与子系统注册
   └─ MVP 运行清单筛选
      └─ Orchestrator 单写者
         ├─ 默认 Campaign 阶段机
         ├─ AI 中文协议与解析
         ├─ 所属子系统校验/提交
         ├─ 历史、因果、伏笔和记忆事务
         └─ EngineStore、存档与页面投影
```

## 启动与自动接线

1. `InitMods` 先注册轻量页面路由，再异步加载完整 Bootstrap，避免全部 MOD 阻塞欢迎页首屏。
2. Bootstrap 先完成设置、原型、迁移和 Manifest 全量校验；通过后按显式执行序运行 `onInit -> Remote 注册 -> 契约收口 -> 配置变更 -> onLoad`，任一节点失败都停止后续节点。
3. `mod-engine` 生命周期取得已排序 Manifest，`registerAllSubsystems()` 先解析全部业务实例，再按 MVP 活动清单唯一顺序替换外部成员；不保留首项、不静默跳过缺失实例。
4. 引擎内部子系统、业务子系统导入、单例别名、Campaign 阶段、Prompt 上下文、字段键、事件和 Store 汇总均由 `scripts/codegen/generate-mod-wiring.mjs` 从声明生成。
5. 生成文件只反映 Manifest 与源合同，不手工维护第二套接线。运行准备检查同时要求 MOD 已加载、注册表已冻结、活动成员齐全且没有未收口状态。
6. 可执行流程使用 `src/core/execution/execution-flow-registry.ts` 的中央登记项；发布前 `check:execution` 从真实运行入口构建并验证四类执行图，生成接线漂移与废弃执行机制在同一门禁中失败。

**实时源**：`src/app/_components/init-mods.tsx`、`init-mods-bootstrap.ts`、`src/core/mod-loader/`、`src/mods/mod-engine/_internal/lifecycle.ts`、`src/mods/mod-engine/bootstrap/register-subsystems.ts`、`scripts/codegen/generate-mod-wiring.mjs`。

## 当前运行成员

当前阶段由 `src/mods/mod-engine/helpers/mvp-stages-config.default.json` 唯一定义，共 62 个活动成员：50 个外部业务成员和 12 个引擎成员。P6、P7、P8 已进入同一现行清单，是否实际推进仍由上下文能力画像和模拟范围决定。

### 外部业务成员（50）

| 所属 | 活动 ID | 当前职能 |
|---|---|---|
| 世界 | `world-context-registry` | 保存世界上下文注册表 |
| 世界 | `contextual-capability-profile` | 提供当前上下文能力画像 |
| 世界 | `spatial-graph` | 管理空间关系与移动事件 |
| 世界 | `context-transition` | 提议并执行上下文切换 |
| 世界 | `simulation-scope-policy` | 决定当前模拟范围 |
| 世界 | `world-init` | 创建和初始化明确上下文 |
| 历史 | `historical-event-ledger` | 保存历史事实、证据、转变和因果边 |
| 社会 | `relationship-system` | 保存通用有向关系、作用域和追加式迁移 |
| NPC | `npc-system` | 保存 NPC 连续身份、当地状态、目标、行为和主观记忆 |
| 环境 | `geography` | 按上下文与空间节点保存地理事实和变化记录 |
| 环境 | `natural-resource` | 按上下文与空间节点结算资源储量、再生、消耗和事务 |
| 成长 | `growth-system` | 统一保存技能、稳定能力及其来源化成长记录 |
| 成长 | `achievement` | 只从已提交历史事件验证成就进度和解锁 |
| 社会评价 | `reputation` | 保存人物、上下文和全局评价域中的声望变化 |
| 角色 | `character-base` | 保存四项基础属性及合法增量 |
| 角色 | `destiny-pattern` | 提供命格状态与叙事约束 |
| 角色 | `lifespan` | 保存生物钟模式、按天寿命规则及结构化寿命调整 |
| 角色 | `lifecycle-system` | 从规范总天数派生年龄、阶段和属性修正 |
| 角色 | `health` | 保存生命、体力、精神、伤病、死亡事实和条件尾声 |
| 角色 | `luck` | 保存本地气运点数、派生修正与本轮随机方向引导 |
| 角色 | `morality` | 保存道德状态 |
| 世界 | `world-entity` | 保存上下文世界实体并维护玩家、NPC、组织的稳定引用目录 |

P6 追加 `economy`、`population`、`settlement`、`work`、`item`；P7 追加 `climate`、`ecology`、`pollution`、`culture`、`art`、`education`、`works`、`social-stratification`、`faction-dynamics`、`legal`、`conflict-cycle`、`culture-tech`；P8 追加 `celestial`、`era`、`fate-prophecy`、`divine-creation`、`combat-power`、`cultivation`、`monster`、`fortune-encounter`、`faith`、`divine-intervention`、`anomaly-phenomena`。这些成员只在能力画像允许时推进，资源储量仍归 `natural-resource`，特殊材料和至尊物品不再独立注册。

### 引擎成员（12）

| 活动 ID | 当前职能 |
|---|---|
| `time` | 推进标准模拟时间 |
| `orchestrator` | 编排回合与事务 |
| `narrative-parser` | 解析中文叙事协议 |
| `summary-compressor` | 生成分层摘要投影 |
| `memory-engine` | 管理长期记忆检索与投影 |
| `subsystem-relevance` | 选择当前回合相关子系统信息 |
| `memory-lifecycle` | 维护记忆重要度与生命周期 |
| `memory-forgetting` | 生成可解释的遗忘投影 |
| `causal-delay` | 登记和解决延期因果 |
| `plot-structure` | 按规范天数推进剧情阶段并记录结构信号 |
| `foreshadowing` | 登记和回收伏笔 |
| `core-memory` | 保存核心关系与长期事实投影 |

只有 `character-base`、`lifespan`、`health`、`morality`、`growth-system`、`reputation`、`npc-system`、`relationship-system` 拥有当前叙事“系统指令”受校验写入资格。`luck` 由 `mod-character` 在本地生成初始点数和每轮方向投掷，叙事只读取其结果。P8 的 `combat-power` 与 `cultivation` 仅通过各自声明的证据化操作合同接受写入；其他活动成员是只读上下文、确定性推进、提议、事件输入或由引擎内部逻辑维护，源码中存在的其他系统不会自动进入回合。

## 回合入口与并发

- 玩家页面通过 `src/mods/mod-engine/hooks.ts` 调用 `executeRoundV2()`；旧的硬编码回合管线不再作为回退。玩家点击、分支确认和错误自动重试共用同一个前置单飞门，互斥锁只等待上一轮本地终态队列、预生成单写者和压缩闸门，不等待数据、基础属性、事件识别或宏观影响 AI；自动重试只有在上一尝试完整结束后才推进计数并安排下一次，过期或并发计时器不能排成新的真实回合。
- 每次回合先建立 `narrative-round` 执行实例，严格经过 `prepare -> ready -> execute -> transition -> finalize`：准备确认 `RoundContext` 与入场条件，不保存可恢复的运行态快照；就绪阶段排队并登记资源，执行阶段运行本地规则与 AI，过渡阶段等待并汇合结果、完成跨系统校验和原子提交，收束阶段只发布一次终态。阶段节点携带稳定状态码、顺序号和故障接收者，流程所有者只在所有必需节点成功或声明跳过后发布终态。
- `narrative-round`、MOD 生命周期、`world-init` 和 `subsystem-advance` 都从中央流程登记目录取得部门、子系统和故障接收者；每个执行实例的原始 ready/running/终结事件随开发回合诊断保留，聚合器只读取这些事件，不成为业务状态第二所有者。
- 同阶段、同依赖、同 `order` 的节点只有显式声明同一 `parallelGroup` 才并发；组内同时运行，终态记录仍按确定性阶段顺序汇合，任一成员失败时等待同组成员收口后停止释放后续节点。
- 真实回合直接使用唯一 Orchestrator 单写者；运行时预生成与整轮快照恢复已经移除，不再等待或恢复上一轮状态。
- 每次执行加载 Campaign 阶段、创建回合上下文和提交令牌；项目不向 Provider 传递输出 Token 上限，字数目标只作为 Prompt 引导；没有阶段、状态不允许推进或已到终局时不执行正常回合。
- 第一次正文通过严格协议后先进入 `pendingNarrative` 阅读投影，并由 `acceptNarrativeResponse()` 立即写入正式 `narrativeHistory`、正文审计和回合完成投影。四路后台分析失败或所属事务拒绝时只丢弃该所有者结果，不撤销正文或其他已经提交的后台结果；只有压缩首次调用及两路并发重试全部失败时，已保存正文保留并以压缩阻塞错误阻止下一轮。
- 数据分析、基础属性分析、事件识别和宏观影响只在阶段图中完成非阻塞登记，结果绑定 `lifeRunId + roundSequence + narrativeId + inputHash` 进入版本化收件箱。下一次真实回合的 `prepare-round` 按分析类型、回合和正文 ID 的确定顺序消费已经终结的记录；仍在运行的记录不阻塞本轮。运行时预生成已停用，压缩、自动存档和 outcome 完成后直接进入下一次真实推进。

## 默认回合管线

| 顺序 | 阶段 | 当前运行机制 |
|---|---|---|
| 1 | `prepare-round` | 校验流程上下文和稳定关联标识，不写业务状态 |
| 2 | `queue-round` | 接收准备结果，按活动成员和硬依赖建立本轮就绪队列，不运行业务动作 |
| 3 | `advance-time` | 发出回合开始事件并推进标准时间；预览执行不发布真实回合事件 |
| 4 | `subsystem-advance` | 按活动清单顺序推进本地规则；任一子系统失败即返回 Orchestrator，不释放后续阶段 |
| 5 | `collect-states` | 按三轮收集与校验活动子系统状态，形成后续检测和 Prompt 输入 |
| 6 | `event-lifecycle` | 根据状态与轮次检测事件生命周期，形成事件注入文本 |
| 7 | `assemble-prompt` | 只投影第一次叙事所需的世界框架、记忆和本轮引导；系统合同、存档 ID 和派生连锁值不进入第一次调用 |
| 8 | `ai-narration` | 消费合格预生成或发起第一次非流式 AI 调用；完整正文是最低成功内容，格式失败最多复用原输入修复两次 |
| 9 | `publish-narrative` | 真实回合把严格正文写入非持久化即时投影；预览跳过，分支在正式提交前不可操作 |
| 10A | `ai-data-analysis` | 与 10B、10C、10D 同属 `narrative-background-analysis` 并行组；读取非基础属性可写系统完整状态，登记独立数据分析任务后立即返回，结果只提交已经成立的系统源变化 |
| 10B | `ai-basic-attribute-analysis` | 与 10A、10C、10D 并行；读取完整角色画像、四项属性构成与逐点语义，登记独立基础属性任务后立即返回，只判断持久基础值是否变化 |
| 10C | `ai-event-recognition` | 与 10A、10B、10D 并行；读取事件状态、全部可用候选、本轮已投递因果及最近故事，登记独立事件识别任务后立即返回 |
| 10D | `ai-macro-impact` | 与 10A、10B、10C 并行；读取活动宏观系统的完整状态与字段契约、玩家影响力证据和最近故事，登记直接影响与连锁反应分析任务后立即返回 |
| 11 | `post-processing` | transition 节点只确认正文已接纳且四个后台启动节点均已返回，不等待 AI 结果、不汇合跨所有者事务 |
| 12 | `epilogue-check` | transition 节点只消费当时已经由 owning system 提交并绑定历史事件的死亡事实；在途事件识别不形成等待边 |
| 13 | `compress-save` | finalize 节点执行唯一 AI 释放闸门：无压缩任务直接成功；首次失败后同时发起两次重试并采用首个合法候选，三次均失败才阻止下一轮 |

阶段源是 `src/mods/mod-engine/campaigns/default/index.ts`，Manifest 中的阶段声明由代码生成器校验与其一致；公共执行器为 `src/foundation/utils/execution-sequence.ts`。
执行契约、事故样本和周期复盘规则的实时源是 `src/foundation/types/execution-sequence.types.ts`、`src/foundation/utils/execution-sequence.ts`、`src/core/execution/execution-flow-registry.ts`、`scripts/check/fixtures/execution-incidents.json` 与 `scripts/check/rules/execution-system-review.json`。事故样本必须携带从直接失效、前置条件、前置条件成因、形成机制到防复发机制的完整根因链，并以诊断日志、指标、故障注入或复现轨迹作为可验证证据；`timed-out` 样本禁止只表述等待时间、超时阈值或重试次数调整，`npm run check:execution` 强制校验上述契约。

## AI 协议与解析

正常回合使用一次前台叙事调用，以及正文接纳后同层登记的四次后台调用；五者均不使用结束字段。压缩调用属于独立的下一轮闸门，不与四路分析组成全体等待：

1. 第一次动态输入固定为三条有序 user 消息：`⟦全局信息⟧JSON`、`⟦记忆⟧时间轴文本`、`⟦本轮引导⟧JSON`。有记忆时，记忆段从 `【时间轴记忆】` 开始，以 `【时间阶段：具体时间】` 为主轴；不同时间阶段之间空一行，每个事件独立一行并明确发生时间，实际请求保留物理换行，不把整段时间轴序列化成带 `\n` 的 JSON 字符串。故事投影不包含 L1/L2/L3、来源 ID、权重、衰减或遗忘状态；玩家原创事实由 `core-memory` 按实际时间和角色年龄投影为同一时间轴事实，不增加独立原创保护字段。玩家创建期输入先由所属系统解析为世界、角色与命格事实，不再额外发送创建期原始“玩家自定义”字段。服务端固定资产唯一拥有长期不变的事实优先级、原创归属保护、天赋权限、记忆用法、分支裁决和输出协议；固定资产用明确的 `content` 示例开始/结束边界，只以 `<完整正文>`、`<分支标题>` 和 `<分支选项>` 展示标签、真实空行及分支 JSON 结构，并说明后续四路后台只把正文作为事实输入。DeepSeek 思考模式启用时，推理过程由 `reasoning_content` 承载，完整玩家可见结果由 `content` 承载且直接以 `⟦正文⟧` 开始。动态三段只传世界、角色、命格、时间轴记忆与本轮事实，不复述常驻规则。发送前，本地无状态引导编译器按固定顺序归并系统指令、时间引导和动态叙事引导，删除完全相同的系统文本，并分别投影为 `系统引导` 数组与保留玩家原文的 `玩家自定义分支` 对象；正常回合只在强制分支或人生首轮触发时追加对应条件，实际格式修复只追加指向固定标准示例的最小正向说明。编译过程不调用 AI、不截断长度、不持久化结果，`字数要求`固定为本轮引导最后一个键。返回必须含完整正文，规范形式为 `⟦正文⟧正文`；确有玩家命运抉择时可追加只含标题和二至四个选项的 `⟦分支⟧单行JSON`。摘要、语义信号、注册事件、系统变化、基础属性变化、未来候选与宏观连锁反应由正文接纳后的对应后台所有者承载。
`luck` 开局使用本地随机整数 `-3..3`。每次第一次叙事生成前，owning system 在百分比刻度上只投掷一次并保存 `LuckNarrativeGuidance`；零气运为坏 `25%`、无干扰 `50%`、好 `25%`，每点向同方向增加 `5` 个百分点，并从无干扰与相反方向各转移 `2.5` 个百分点，因此 `+10` 为 `0/25/75`，`-10` 为 `75/25/0`。结果进入 `本轮引导/系统引导`，明确为可忽略的低优先级倾向，不强制成功或失败，不改写玩家选择、世界硬规则或既成事实。

2. 数据分析输入按活动配置顺序发送每个非 `character-base` 可写系统的完整当前状态，再发送完整 `⟦回合上下文⟧JSON` 与最近三轮完整故事。返回只能是唯一纯 JSON 根对象 `{"系统操作":[]}`；系统操作继续使用七字段合同，只提交已经成立的非基础属性系统变化。

3. 基础属性分析输入固定为完整角色画像、基础属性系统完整状态、完整 `⟦回合上下文⟧JSON` 与最近三轮完整故事。角色画像包含身份、背景、命格、物种与生命形态、生命周期阶段、基础值、当前值、聚合修正、当前上下文修正、起始年龄和当前逐点语义；可见属性语义以 `0=平平无奇`、`10=人类物种巅峰`、`>10=超凡` 为固定标尺。返回只能是唯一纯 JSON 根对象 `{"系统操作":[]}`；只允许针对 `player:current` 的非零整数增量，且只涉及体魄、心智、悟性、魅力的持久基础变化，临时状态、装备、修正和普通叙事波动不得改写基础值。

4. 事件识别输入固定为完整 `⟦回合上下文⟧JSON`、事件相关完整状态、`⟦本轮已投递因果⟧JSON`、`⟦已有待触发事件⟧JSON` 与最近三轮完整故事。已有候选通过 `historical-event-ledger.queryCandidates()` 读取当前上下文相关的全部 `available` 最新审计，不固定截断；主叙事实际收到的到期因果沿用 `causal-delay` 的稳定编号。返回只能是唯一纯 JSON 根对象 `{"回合事件":{...},"待触发事件":[]}`，同时提交摘要、注册事件、完整语义核心和每个已投递因果的处置；本轮是否存在新事件由系统根据注册事件数组是否非空本地派生，AI 不重复输出布尔字段。未来候选必须说明触发条件，可选声明规范延迟天数、人物、地点、上下文能力和标签。已经在本轮发生的事实、普通情绪、系统数值变化和无具体条件的猜测不得登记；无新候选时返回空数组。

5. 宏观影响输入固定为活动宏观系统的完整状态与字段/操作契约、玩家影响力证据、完整 `⟦回合上下文⟧JSON` 与最近三轮完整故事。返回只能是唯一纯 JSON 根对象，节点显式声明稳定节点编号、依赖、强度和一个受限系统变化；本地校验活动系统、上下文、证据、精确字段和无环依赖，只提交正文中已经成立且玩家确实有能力造成的直接影响或连锁反应。

`narrative-parser` 与 `tagged-meta-envelope.ts` 只负责第一次玩家可见正文和可选分支，以完整内容为边界兼容纯正文、规范标签、成对 Markdown 围栏、说明前缀和标签空白；解析只采用唯一完整候选，不补括号、不舍弃残缺内容，也不从正文关键词或页面状态反推业务语义。四路后台响应直接进入 AI 客户端的 `JSON.parse + Zod` 单一校验链，只接受一个纯 JSON 根对象；代码块、标签、标题、解释、多个候选、截断终态或残缺 JSON 均失败。第一次 Schema 失败时最多追加一次最小修复说明，并复用原固定资产、原动态输入和完整失败响应；修复请求进入对应 `*-repair` 缓存池，第二次仍失败即终止。主叙事继续保留最多两次有界格式修复。正文发布前失败不显示新内容；正文接纳后任一后台的启动、AI、Schema 或本地提交失败只记录该所有者终态，不恢复运行时快照，也不撤销正文或已经写入的局部结果。事件识别失败时额外保留因果编号、释放旧投递占用，并按严重度重新排期。

五份固定资产分别是 `mod-engine:narrative:5.8.2`、`mod-engine:narrative-data-analysis:2.0.0`、`mod-engine:narrative-basic-attribute-analysis:2.1.0`、`mod-engine:narrative-event-recognition:3.1.0`、`mod-engine:narrative-macro-impact:1.0.0`。所有标准示例只示范中性空结果或字段格式，不预设人物、世界、事件、属性变化或宏观结果；动态区只传本轮事实，不重复常驻规则。主叙事身份、事实冲突顺序和轮回天赋边界保持不变；篇幅规则只控制密度，时间尺度规则独立决定现场、阶段与时代断点。数据分析、基础属性、事件识别和宏观影响各自拥有唯一中文 Schema 与字段职责；稳定事件 ID、候选状态、历史事实和业务状态仍由所属本地系统拥有。

有力量体系的世界在创建时由 `mod-world` 固化 `PowerFrameworkDefinition`：框架有稳定 ID、显示名、`bounded/open` 进阶规则和本世界连续阶位；AI 只能提出名称、描述和进阶语义，机器 ID 由系统生成。每轮 `⟦全局信息⟧` 只投影当前世界已固化的框架，禁止跨世界比较或恢复固定阶位表。开放体系只能在运行态追加新阶位，不能回写世界配置真源；无力量世界使用 `enabled=false` 且不发送力量框架。

AI 服务把第一次叙事及修复、数据分析及修复、基础属性分析及修复、事件识别及修复、宏观影响及修复、L1/L2/L3 压缩和连接测试分别归入已注册的独立 `InternalCachePool`。DeepSeek 目标由代理把可信账号或设备主体与缓存池组合为稳定不透明 `user_id`：同一主体同一池稳定复用，不同池必然隔离；未知或缺失池不能进入上游。DeepSeek 请求不再转发未声明的 `seed`，非 DeepSeek 目标仍可按自身契约接收。项目不向任何 Provider 传递输出 Token 上限；2000 字设置只生成 Prompt 篇幅引导，Provider 仍可能因自身模型或上下文限制返回 `finish_reason=length`，该响应按不完整处理。浏览器与代理均覆盖响应头后的完整正文读取，流式另保留 `45s` idle timeout；字数偏离不触发项目侧截断或重写，真实 usage 继续用于观测。

**实时源**：`src/core/ai-service/narrative-guidance-compiler.ts`、`prompt-builder.ts`、`ai-client.ts`、`ai-call-deadline.ts`、`cache-pool.ts`、`src/app/api/proxy/route.ts`、`src/mods/mod-engine/campaigns/default/index.ts`、`helpers/branch-intent-resolution.ts`、`narrative-background-result-inbox.ts`、`narrative-data-analysis-context.ts`、`narrative-basic-attribute-context.ts`、`narrative-event-recognition-context.ts`、`narrative-macro-impact-context.ts`、`recent-story-context.ts`、`tagged-meta-envelope.ts`、`narrative-ai-protocol.ts`、`narrative-response-quality.ts`、`src/mods/mod-engine/subsystems/narrative-parser-system.ts`、`src/mods/mod-engine/server/narrative-system-prompt.ts`、`narrative-data-analysis-system-prompt.ts`、`narrative-basic-attribute-system-prompt.ts`、`narrative-event-recognition-system-prompt.ts`、`narrative-macro-impact-system-prompt.ts`、`src/mods/mod-engine/prompts/narrative-prompt.ts`、`narrative-data-analysis-prompt.ts`、`narrative-basic-attribute-prompt.ts`、`narrative-event-recognition-prompt.ts`、`narrative-macro-impact-prompt.ts`。

## 结构化写入与原子提交

1. 第一次正文/分支、数据分析系统操作、基础属性变化、事件识别回合元数据与未来候选、宏观影响节点分别通过严格分段或中文 Schema；正文独立接纳，四路后台各自形成唯一所有者候选，不再合成为跨所有者总包，也不从正文补猜结构化事实。
2. 系统指令必须命中当前 `systemInstruction` 白名单，并通过 `subsystem-field-registry.ts` 的 `validated-write` 权限、作用域、操作级字段 Schema；未知或不适用字段使整包失效，不能剥离后部分解释。
3. `RoundCommitBus` 在所属子系统预检前把 `player:current` 解析为 `RoundContext.characterId`，并把整包传给需要跨指令依赖的 owning system；NPC 创建指令可在同包声明计划中的新实体引用，预检只读取该计划，不提前写 Store。
4. NPC 身份创建在应用阶段显式排在同包依赖操作之前；创建成功后由 `npc-system` 通过 world 公共 API 登记实体引用，关系、目标、行为和记忆随后只消费已登记的稳定 ID。
5. Orchestrator 对数据分析、基础属性和宏观影响的每个已终结记录分别调用所属子系统预检与提交；任一变更被拒绝时整包拒绝该所有者结果，不创建或恢复运行时快照，也不回滚正文或其他记录。
6. 命运意图判定归事件识别所有；当前存在意图却缺少判定、编号不一致，或无当前意图却附带判定，都会拒绝该事件识别事务，但不会使已经接纳的正文或其他后台所有者失败。
7. 关键事件、语义信号和延期因果先构造历史事务并由账本预检。历史事件提交完成后，事件识别候选通过同一 `historical-event-ledger.submitCandidates()` 登记为 `available`，metadata 绑定执行 ID、回合、上下文、规范总天数、正文审计 ID 和本轮已提交历史事件 ID；候选不是已发生事实。
8. 候选提交数量、状态或事件识别后续依赖任一不完整时，停止该所有者后续写入并记录失败；不恢复运行时快照、不撤销正文或已经写入的局部结果，因果编号保留并按严重度重新排期。完整事务通过后，剧情结构、伏笔、因果、原创记录、关系和记忆引用同一批已提交事件 ID；摘要账本保存合格摘要投影。
9. `acceptNarrativeResponse()` 在正文协议通过后立即写入 `narrativeHistory`，重新收集子系统状态并同步回合完成事件和界面快照；四路后台随后只更新各自业务状态和正文迁移审计。Hook 在压缩闸门成功并同步正式历史后清除对应 `pendingNarrative`；压缩全失败时保留正文并把投影转为 `failed`。
10. 每条已采用正文都随 `narrativeHistory` 保存逐轮迁移审计，固定记录回合、正文 ID、协议校验、命运意图、历史事务、结构化写入、拒绝原因及可信状态；缺失、轮次不连续、正文 ID 不一致或任一可信门禁失败时，终局评分不能把该轮视为可信迁移。
11. `health` 的本地死亡检测先产生不可持久化的 pending fact；Orchestrator 为它创建本轮专属 `character-death` 事件计划，历史账本提交成功后再把事件 ID 绑定为正式死亡。缺少该事件、上下文不一致或仍有 pending death 时，正式快照必须拒绝。

**实时源**：`src/mods/mod-engine/campaigns/default/index.ts`、`src/mods/mod-engine/subsystems/orchestrator-system.ts`、`src/mods/mod-engine/helpers/round-commit-bus.ts`、`subsystem-field-registry.ts`、`narrative-change-bundle.ts`、各活动业务子系统的校验与提交实现。

## 故事、记忆与后台工作

- 完整正文按轮写入 `narrativeHistory`，不按字符、轮数或容量静默删除。摘要、记忆、重复率和历史事件都是派生投影，不替代正文。
- `npc-system` 的完整 Store 保存全部身份、目标、行为与主观记忆；主叙事只读取玩家同场实体、与同场实体直接相连的一跳端点、活动目标，以及同场、相关或最近同一规范时间批次的行为和记忆。`relationship-system` 只投影至少一个端点处于玩家当前场景且作用域适用于当前上下文的关系；后台、休眠和无关世界数据不逐项进入 Prompt，投影不删除完整真源。
- 每轮成功正文在原子提交内计算近窗重复率并写入只读质量观测；不再以重复审计或后台 AI 改写正文。玩家请求强制分叉时，第一次调用会尽量返回选项，但完整正文不会因分支缺失而失败；若 AI 未返回分支，Orchestrator 仍提交一个无预设选项的分叉点，页面只显示玩家自定义引导输入，确认后建立同一 BranchIntent 并进入下一轮。
- 压缩管线在正文接纳后作为唯一 AI 释放闸门运行；无到期任务时以零次调用成功，有任务时首次失败后同时发起两次重试，只提交最先通过完整校验的候选并中止另一候选，三次均失败才阻止下一轮。手动存档或加载只需等待压缩提交，不再等待或清理运行时预览快照。当前只有三层时间轴压缩：L1 覆盖 4 轮，L2 合并 4 个 L1 覆盖 16 轮，L3 合并 4 个 L2 覆盖 64 轮。L1 延迟一个完整块，完成第 8 轮后生成第 1-4 轮，完成第 12 轮后生成第 5-8 轮；主叙事对最近 4 轮只投影结构化关键事件，无关键事件时投影该轮摘要，避免把上一轮完整措辞作为续写样本。旧存档若含切换前的 5 轮节点，节点和原始明文档案继续保留，但新调度只按当前 4/16/64 轮对齐边界补建和晋升，不能让旧边界阻塞当前层级。
- 压缩 AI 固定使用 `temperature=0`、`top_p=1` 并禁用推理，接收当前压缩组的完整 `sourceFacts`、已有压缩历史和最近三轮完整故事；输出按时间段组织、带 `sourceIds` 且包含 `1..10` 权重的结构化事件。来源覆盖、时间轴节点和压缩档案由 `summary-compressor` 校验和组装，本地只校验权重范围、来源归属、完整覆盖和持久化一致性，不再选择或覆盖 AI 权重。权重 1 仅保留在本存档 L1 明文数据库中并不进入后续主动投影；2-9 按各自衰减间隔逐轮下降，降为 0 后下一轮遗忘；10 为永久记忆，后续 L2/L3 只原样携带其最初压缩结果。
- 每个存档的压缩系统拥有独立明文 SQLite 记忆库，完整保存 L1 原始 AI 返回、L1 归档、L1/L2/L3 时间轴节点、来源轮次与 ID、初始和当前权重、锚点、有效/遗忘/永久状态及原始压缩响应；这些是压缩、检索、衰减和审计的内部真源。主叙事组装时只消费由记忆生命周期公开的派生时间轴：可见叶子摘要、实体检索命中、最近 4 轮结构化事实、摘要账本和玩家原创事实合并后按实际时间排序，以“时间阶段 + 发生时间 + 事件”文本发送，内部计算字段不进入故事 Prompt；时间桥也只消费事实账本，不保留完整正文旁路。完整正文继续逐轮原样保存、展示、反馈和归档，不被摘要覆盖或删除。运行时预生成和临时快照已移除，正文接纳后直接登记后台并行组。
- 每次核心叙事上游请求都由 `/api/proxy` 把实际发送的 UTF-8 请求体和实际收到的响应原文追加到该存档该轮的 `.data/narrative-rounds/<lifeRunId>/round-XXXXXX.txt`；第一次叙事、四路后台分析及各自格式修复和失败尝试按顺序形成独立 exchange。文件以字节长度标明原文边界，不重新序列化、不加密、不压缩、不脱敏。轮次头保存独立设备来源编号、账号和用户名；每轮首次真实主叙事 exchange 额外保存一次实际生效的完整文风、版本和全文校验指纹，同轮修复不重复保存文风。
- 每个真实回合只提交一次 `round-outcome`。成功时 `hooks.ts` 先等待本轮后台压缩、同步最终状态并完成自动存档，再发送包含阶段耗时、质量、采用结果、结构化提交、压缩和存档状态的 outcome；失败时发送一次失败 outcome。浏览器中的开发系统事件随该 outcome 一次性带回，不为单个阶段另发请求。
- 承载剧情的数据选择、压缩和传递还必须遵循 `D:\AI\ai-life-sim\.agents\skills\ai-life-sim\references\data-integrity.md`。

## 存档与恢复

- 成功回合后，`hooks.ts` 在启动下一段预生成前触发自动存档。
- `collectGameSavePayload()` 先同步活动子系统投影，再统一收集 Engine、Character、World 和 Orchestrator 快照；逐轮迁移审计随叙事历史进入存档，预生成缓存不进入存档载荷。本地气运点数与已采用的叙事引导由 `luck` owning snapshot 保存，预生成引导只在临时缓存中传递。P2-P5 的实体目录、NPC、关系、地理、资源、成长、成就、声望、寿命、生命周期和健康状态分别只由 owning system 的 `capturePersistenceState()` 保存，通用 Store 和页面投影不重复持有这些持久化真源。
- 加载先检查 MOD、注册表、活动成员和核心载荷；输入有效后取消派生队列并等待后台压缩提交，再开始写入 Store。P2-P5 owning snapshot 使用各自封闭的 `schemaVersion: 1` 契约，未知字段、版本、实体端点、上下文、空间节点、证据或来源引用整包拒绝；缺少对应快照时由新所有者初始化空状态或规范初始状态，不读取已淘汰系统或浏览器残留。世界上下文无效、Orchestrator 上下文不一致、死亡缺少专属历史事件或仍有 pending death 时拒绝加载或保存。正式目标快照恢复和正式保存仍执行完整目录校验，不能以临时标签掩盖载荷断链。
- 恢复任一步失败时，Engine、Character、World 和 Orchestrator 回到加载前快照；只有完整成功后才切换到模拟阶段。
- MOD 启动水合只恢复各自 Store 视图，不在玩家上下文尚未补登记时缓存实体目录临时错误；实体目录仍在 owning snapshot 恢复、保存采集和回合读取边界按完整契约校验。

**实时源**：`src/mods/mod-engine/helpers/save-restore.ts`、`src/mods/mod-engine/hooks.ts`、`src/core/storage/`。

## 修改时的权威定位

| 变更对象 | 首要实时源 |
|---|---|
| 活动成员或叙事可写成员 | `src/mods/mod-engine/helpers/mvp-stages-config.default.json` |
| MOD 子系统声明 | 所属 `manifest.ts` |
| 自动接线 | `scripts/codegen/generate-mod-wiring.mjs` 与生成目标 |
| 规范时间、步长与时间快照 | `src/mods/mod-engine/subsystems/time-system.ts`、`src/foundation/types/subsystem.types.ts` |
| 剧情结构与推进度 | `src/mods/mod-engine/subsystems/plot-structure-system.ts`；必须遵循本文件“时间驱动与剧情推进” |
| 回合阶段与顺序 | `src/mods/mod-engine/campaigns/default/index.ts` |
| 回合事务与状态发布 | `src/mods/mod-engine/subsystems/orchestrator-system.ts` |
| 中文 AI Schema | `src/mods/mod-engine/helpers/narrative-ai-protocol.ts` |
| 字段权限与校验入口 | `src/mods/mod-engine/helpers/subsystem-field-registry.ts`、`src/foundation/subsystem-contracts/npc-social.contract.ts`、`progression.contract.ts`、`life-cycle.contract.ts`、各 owning system 的 `preflightChanges()` |
| 存档收集与恢复 | `src/mods/mod-engine/helpers/save-restore.ts` |
| P3 空间环境与地图投影 | `src/foundation/subsystem-contracts/spatial-environment.contract.ts`、`src/mods/mod-environment-ecology/environment-simulation-api.ts`、`src/mods/mod-world-map/map-projection.ts` |
| P4 成长、成就与声望 | `src/foundation/subsystem-contracts/progression.contract.ts`、`src/mods/mod-progression/` |
| P5 寿命、生命周期、健康与尾声 | `src/foundation/subsystem-contracts/life-cycle.contract.ts`、`src/mods/mod-character/subsystems/lifespan-system.ts`、`lifecycle-system.ts`、`health-system.ts` |
| 时间轴压缩、权重和存档记忆 | `src/mods/mod-engine/subsystems/summary-compressor-system.ts`、`src/mods/mod-engine/helpers/timeline-memory.ts`、`src/core/storage/narrative-memory-store.ts` |
| 核心叙事上游原文归档 | `src/core/logger/narrative-round-archive.ts`、`src/core/ai-service/`、`src/app/api/proxy/route.ts` |
| 回合采用结果与开发系统诊断 | `src/core/logger/narrative-round-diagnostic.ts`、`development-system-diagnostic.ts`、`src/app/api/narrative/round-outcome/route.ts` |
| 迁移审计与可复算评分输入 | `src/foundation/types/scoring.types.ts`、`src/core/scoring/life-scoring.ts`、`src/mods/mod-pages/pages/game-over/page.tsx` |
| 玩家页面投影 | `src/mods/mod-pages/pages/game-story/` |
