# 核心模拟权威

## 目标

核心模拟负责把玩家一次推进转换为连续、可验证、可持久化的世界与人生变化：本地规则先推进，AI 生成玩家可见叙事和受限结构化意图，所属系统校验并提交状态，失败路径不伪装为成功。

核心模拟是系统体系中最重要的运行链路，因此本文件比其他活动权威保留更多机制细节。

## 权责边界

- Orchestrator 拥有回合顺序、当前回合状态、叙事历史投影和跨子系统事务协调。
- 每个业务子系统拥有自己的状态、字段校验、预检和提交；Orchestrator 不绕过所有者直接改写其私有 Store。
- AI 只提交协议内意图，不拥有系统状态；页面只发起回合并消费引擎投影。
- 历史账本拥有已提交事实，记忆与摘要是派生投影，不能替代完整故事或所属业务状态。

## 时间驱动与剧情推进

- **核心目标**：把规范时间作为每次核心模拟的第一驱动，让剧情推进和所有时间相关系统共享同一个可验证的时间节点；其他驱动力只在该节点内影响结果，不建立平行时间轴。
- **当前机制**：`advance-time` 由 Orchestrator 把存档回合导入 `TimeSystem`，按 `timeStep` 完成必要的周期对齐或推进；随后 `buildRoundContext()` 注入 `daysPassed` 与 `totalDays`，活动子系统在同一上下文中执行本地规则、收集状态、生成事件和组装 Prompt。
- **剧情推进规则**：剧情阶段的持续时间、年龄、到期、延迟因果和世界演化以 `totalDays` 或 `daysPassed` 为主轴；历史事件、玩家选择、状态变化、张力和随机性是条件或修正，不能取代时间轴。`plot-structure` 以阶段起点总天数与已持续天数判定阶段，并按本轮经过天数缩放自然张力漂移；回合序号只保留幂等和审计用途。
- **其他系统规则**：世界上下文的当地时钟、历史事件的创建/到期时间、记忆生命周期和系统衰减都必须锚定规范时间；系统可以拥有自己的业务状态和派生指标，但不能独立累计全局时间。回合数仅可用于幂等、批处理或性能窗口。
- **统一链路**：`TimeSystem -> RoundContext -> Orchestrator -> 活动子系统 -> 历史/因果/记忆/世界投影 -> Prompt 与原子提交`。页面选择行动或步长，AI 提出受限意图，二者都不直接写规范时间。
- **实时源**：`src/mods/mod-engine/subsystems/time-system.ts`、`src/mods/mod-engine/subsystems/orchestrator-system.ts`、`src/foundation/types/subsystem.types.ts`、`src/mods/mod-engine/subsystems/plot-structure-system.ts`、`src/mods/mod-world/utils/world-context-runtime.ts`。

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
2. Bootstrap 按生成的 MOD 注册表解析依赖，执行设置、原型检查、迁移、生命周期和 `onLoad`，完成后冻结 `RuntimeRegistry` 为只读快照。
3. `mod-engine` 生命周期取得已排序 Manifest，`registerAllSubsystems()` 清理旧外部注册，按 Manifest 自动导入业务子系统，并用 MVP 运行清单过滤。
4. 引擎内部子系统、业务子系统导入、单例别名、Campaign 阶段、Prompt 上下文、字段键、事件和 Store 汇总均由 `scripts/codegen/generate-mod-wiring.mjs` 从声明生成。
5. 生成文件只反映 Manifest 与源合同，不手工维护第二套接线。运行准备检查同时要求 MOD 已加载、注册表已冻结且活动成员齐全。

**实时源**：`src/app/_components/init-mods.tsx`、`init-mods-bootstrap.ts`、`src/core/mod-loader/`、`src/mods/mod-engine/_internal/lifecycle.ts`、`src/mods/mod-engine/bootstrap/register-subsystems.ts`、`scripts/codegen/generate-mod-wiring.mjs`。

## 当前运行成员

当前阶段由 `src/mods/mod-engine/helpers/mvp-stages-config.default.json` 唯一定义，共 27 个活动成员。

### 外部业务成员（15）

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
| 角色 | `character-base` | 保存四项基础属性及合法增量 |
| 角色 | `destiny-pattern` | 提供命格状态与叙事约束 |
| 角色 | `lifespan` | 保存最大寿命及寿命变化 |
| 角色 | `luck` | 保存气运状态 |
| 角色 | `morality` | 保存道德状态 |
| 世界 | `world-entity` | 保存上下文世界实体并维护玩家、NPC、组织的稳定引用目录 |

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

只有 `character-base`、`lifespan`、`luck`、`morality`、`npc-system`、`relationship-system` 拥有当前叙事“系统指令”受校验写入资格。其他活动成员是只读上下文、提议、事件输入或由引擎内部逻辑维护；源码中存在的其他系统不会自动进入回合。

## 回合入口与并发

- 玩家页面通过 `src/mods/mod-engine/hooks.ts` 调用 `executeRoundV2()`；旧的硬编码回合管线不再作为回退。
- 真实回合和预生成共享同一个 Orchestrator 单写者。真实回合开始前等待预生成完成快照恢复，防止两个 AI 调用交错提交或回滚。
- 每次执行重新计算 Token 上限、加载 Campaign 阶段、创建回合上下文和提交令牌；没有阶段、状态不允许推进或已到终局时不执行正常回合。
- 成功后提交回合令牌；任一阶段失败时中止令牌、恢复回合前完整快照且不发布玩家可见正文。结构化事务和存档恢复的回滚边界见下文。
- 真实回合在压缩、自动存档和 outcome 快照固化后才启动下一轮预生成；预览执行不写入真实回合的阶段、质量、采用、持久化或系统事件诊断。

## 默认回合管线

| 顺序 | 阶段 | 当前运行机制 |
|---|---|---|
| 1 | `advance-time` | 发出回合开始事件并推进标准时间；预览执行不发布真实回合事件 |
| 2 | `subsystem-advance` | 让全部活动子系统执行本地规则推进；预览不提交真实推进 |
| 3 | `collect-states` | 收集活动子系统状态，形成后续检测和 Prompt 输入 |
| 4 | `event-lifecycle` | 根据状态与轮次检测事件生命周期，形成事件注入文本 |
| 5 | `cross-domain` | 执行跨域联动，重新收集状态并在需要时复检事件 |
| 6 | `assemble-prompt` | 只投影第一次叙事所需的全局信息、记忆和本轮引导；系统写入合同、账号、存档 ID、缓存池和可由所属系统推导的连锁值不进入该调用 |
| 7 | `ai-narration` | 消费合格预生成或发起第一次非流式 AI 调用；完整非空正文就是最低成功内容，分支可选。格式失败最多复用同一 Prompt 与动态输入修复两次，预览执行成功后在此停止并只缓存第一次响应 |
| 8 | `ai-settlement` | 真实回合按活动注册契约发送每个可写系统的同回合状态、回合上下文和第一次完整响应，串行发起第二次 AI 调用并严格取得全部系统操作与机器数据；格式失败最多同资产修复两次 |
| 9 | `post-processing` | 把两次严格结果合成唯一提交候选，原子提交系统源变化、历史事实与依赖 META；全部成功后才写入叙事历史并发布玩家投影 |
| 10 | `epilogue-check` | 检测死亡或终局并按需生成死后尾声 |
| 11 | `compress-save` | 当前是扩展占位；实际压缩在响应提交后触发，自动存档由 `hooks.ts` 在成功回合后调用 |

阶段源是 `src/mods/mod-engine/campaigns/default/index.ts`，Manifest 中的阶段声明由代码生成器校验与其一致。

## AI 协议与解析

正常回合固定使用两次串行 AI 调用，不使用结束字段：

1. 第一次动态输入固定为三条有序 user 消息：`⟦全局信息⟧JSON`、`⟦记忆⟧时间轴文本`、`⟦本轮引导⟧JSON`。有记忆时，记忆段从 `【时间轴记忆】` 开始，以 `【时间阶段：具体时间】` 为主轴；不同时间阶段之间空一行，每个事件独立一行并明确发生时间，实际请求保留物理换行，不把整段时间轴序列化成带 `\n` 的 JSON 字符串。故事投影不包含 L1/L2/L3、来源 ID、权重、衰减或遗忘状态；玩家原创事实由 `core-memory` 按实际时间和角色年龄投影为同一时间轴事实，不增加独立原创保护字段。玩家创建期输入先由所属系统解析为世界、角色与命格事实，不再额外发送创建期原始“玩家自定义”字段。服务端固定资产唯一拥有长期不变的事实优先级、原创归属保护、天赋权限、记忆用法、分支裁决和输出协议；固定资产用明确的 `content` 示例开始/结束边界，只以 `<完整正文>`、`<分支标题>` 和 `<分支选项>` 展示标签、真实空行及分支 JSON 结构，并说明后续三段是输入。DeepSeek 思考模式启用时，推理过程由 `reasoning_content` 承载，完整玩家可见结果由 `content` 承载且直接以 `⟦正文⟧` 开始。动态三段只传世界、角色、命格、时间轴记忆与本轮事实，不复述常驻规则。发送前，本地无状态引导编译器按固定顺序归并系统指令、时间引导和动态叙事引导，删除完全相同的系统文本，并分别投影为 `系统引导` 数组与保留玩家原文的 `玩家自定义分支` 对象；正常回合只在强制分支或人生首轮触发时追加对应条件，实际格式修复只追加指向固定标准示例的最小正向说明。编译过程不调用 AI、不截断长度、不持久化结果，`字数要求`固定为本轮引导最后一个键。返回必须含完整正文，规范形式为 `⟦正文⟧正文`；确有玩家命运抉择时可追加只含标题和二至四个选项的 `⟦分支⟧单行JSON`，摘要、系统操作和机器数据由第二次调用承载。
2. 第二次输入先按活动配置顺序为每个可写系统发送一行 `⟦可写系统:系统名⟧JSON`，再发送 `⟦回合上下文⟧JSON` 与 `⟦最终叙事响应⟧第一次完整响应`。返回为零至多个连续编号的 `⟦系统N⟧单行JSON`，最后必须有唯一 `⟦数据⟧单行JSON`；分段之间恰好一个空行。

`narrative-parser` 与 `tagged-meta-envelope.ts` 以完整内容为边界兼容纯正文、规范标签、成对 Markdown 围栏、说明前缀、标签空白和完整多行 JSON；第二次还兼容系统段之间的单换行、多空行及中文结构标点。解析只采用唯一完整候选，不补括号、不丢弃残缺数组尾部、不从部分对象重组结果；截断 JSON、多个完整候选、未知标签、非连续系统编号、非末尾或重复数据段仍失败。`narrative-ai-protocol.ts` 负责中文 Schema、内部 ID 映射和最终类型转换，业务语义不从正文关键词或页面状态反推。两类格式失败各自最多修复两次，始终复用原服务端 Prompt 资产和原动态输入；仍失败则整轮抛错并回滚，不把未结算正文显示给玩家。

第一次固定资产是 `mod-engine:narrative:5.8.0`；第二次固定资产是 `mod-engine:narrative-settlement:1.1.0`。第一次固定示例只用说明性占位内容展示正文标签、真实空行和分支 JSON 结构，不携带题材、人物、行动、情节、叙事节奏或文风样本；具体内容完全由本轮输入与正文规则决定。主叙事身份是受世界事实与模拟规则约束的世界叙事演算者/故事作者；冲突顺序固定为 `世界观、活动 MOD 规则与确定性逻辑 > 轮回天赋 > 合理性 > 普通命格 > 记忆 > 当前状态 > 本轮引导 > 玩家自定义分支`。轮回天赋是受自身描述和世界硬规则约束的跨世界概念能力，普通命格受世界内合理性约束。正文先按末尾字数要求选择能完整收束的事件规模，短档用段落数、句数和细节职责控制密度，动态区只发送本档结构及全部正文合计区间；篇幅偏离仍不触发重写或截断。第二次的系统合同从活动 `systemInstruction` 注册契约派生，每条操作固定包含 `系统/目标对象/目标上下文/操作/说明/变更/依据事件` 七个中文字段；`依据事件` 只能引用该次回合上下文已提供的历史事件 ID，无引用时使用空数组。关系“解除”的“变更”必须为空对象，其他操作只能携带所属操作声明的源字段。摘要位于第二次 `⟦数据⟧`；基础属性、寿命、气运、道德、NPC 与关系源变化也全部由第二次调用提出，派生属性、规律推进和连锁反应仍由所属本地系统计算。

有力量体系且战力上限为有效 `1-23` 阶的世界，每轮都把“当前世界可达上限”及完整 `1-24` 阶名称和最小边界描述写入 `⟦全局信息⟧.力量体系`；第 24 阶只作为不可达的真无限边界。明确无力量体系的世界不发送该表。该投影只约束叙事量级，不代表未激活的 `mod-power-system` 数值子系统进入回合推进。

AI 服务把第一次叙事、第一次格式修复、正常结算和结算格式修复归入不同 `InternalCachePool`。依据 `PD-039`，DeepSeek 目标应由代理把可信业务主体与注册池组合为稳定 `user_id`，使不同调用系统隔离、同主体同系统的连续调用与重试复用同一归属；当前内部池尚未传到代理，因此该隔离仍待实现，详细边界与实时差距见 [系统树的 AI 服务](system-tree.md#应用与核心服务)。思考模式为关闭、自动、深入、最大，分别映射 `disabled`、启用但省略强度、`high`、`max`。玩家的正文目标只能取 `50/100/150/200/250/300/400/500/600/700/800/1000/1200/1500/1800/2000`；每档对应独立叙事密度提示。第一次调用的 `max_tokens` 由所选正文目标、协议冗余、波动冗余和同 Provider/模型/思考模式 P95 思考 Token 合成并向上取整；第二次按最终正文长度、活动可写系统数和思考模式独立计算预算，不继承短篇正文上限。字数偏离不触发拒绝、重写或截断，真实 usage 继续用于后续校准。

**实时源**：`src/core/ai-service/narrative-guidance-compiler.ts`、`prompt-builder.ts`、`ai-client.ts`、`src/mods/mod-engine/campaigns/default/index.ts`、`helpers/branch-intent-resolution.ts`、`narrative-settlement-context.ts`、`tagged-meta-envelope.ts`、`narrative-ai-protocol.ts`、`narrative-response-quality.ts`、`src/mods/mod-engine/subsystems/narrative-parser-system.ts`、`src/mods/mod-engine/server/narrative-system-prompt.ts`、`narrative-settlement-system-prompt.ts`、`src/mods/mod-engine/prompts/narrative-prompt.ts`、`narrative-settlement-prompt.ts`。

## 结构化写入与原子提交

1. 第一次正文/分支与第二次系统操作/数据必须分别通过严格分段和中文 Schema，再合成为唯一提交候选；不存在正文兜底、部分结果采用或从正文补猜结构化事实。
2. 系统指令必须命中当前 `systemInstruction` 白名单，并通过 `subsystem-field-registry.ts` 的 `validated-write` 权限、作用域、操作级字段 Schema；未知或不适用字段使整包失效，不能剥离后部分解释。
3. Orchestrator 对每个变更调用所属子系统的校验与提交；任一普通状态变更被拒绝时，恢复提交前的子系统快照并整包拒绝该轮结构化变更。
4. 命运意图判定必须与当前聚焦意图一致；当前存在意图却缺少判定、编号不一致，或无当前意图却附带判定，都会使整轮失败。
5. 关键事件、语义信号和延期因果先构造历史事务并由账本预检。历史提交不完整或后续依赖失败时，普通变更、历史引用及依赖 META 一并回滚。
6. 完整事务通过后，剧情结构、伏笔、因果、原创记录、关系和记忆引用同一批已提交事件 ID；摘要账本保存合格摘要投影。
7. 所有写入、历史依赖和记忆处理成功后，才把正文写入 `narrativeHistory`，重新收集子系统状态并同步 `EngineStore`、回合完成事件和界面快照；任一步失败由 Orchestrator 与 Hook 的完整快照恢复兜底。
8. 每条已采用正文都随 `narrativeHistory` 保存逐轮迁移审计，固定记录回合、正文 ID、协议校验、命运意图、历史事务、结构化写入、拒绝原因及可信状态；缺失、轮次不连续、正文 ID 不一致或任一可信门禁失败时，终局评分不能把该轮视为可信迁移。

**实时源**：`src/mods/mod-engine/campaigns/default/index.ts`、`src/mods/mod-engine/subsystems/orchestrator-system.ts`、`src/mods/mod-engine/helpers/round-commit-bus.ts`、`subsystem-field-registry.ts`、`narrative-change-bundle.ts`、各活动业务子系统的校验与提交实现。

## 故事、记忆与后台工作

- 完整正文按轮写入 `narrativeHistory`，不按字符、轮数或容量静默删除。摘要、记忆、重复率和历史事件都是派生投影，不替代正文。
- `npc-system` 的完整 Store 保存全部身份、目标、行为与主观记忆；主叙事只读取玩家同场实体、与同场实体直接相连的一跳端点、活动目标，以及同场、相关或最近同一规范时间批次的行为和记忆。`relationship-system` 只投影至少一个端点处于玩家当前场景且作用域适用于当前上下文的关系；后台、休眠和无关世界数据不逐项进入 Prompt，投影不删除完整真源。
- 每轮成功正文在原子提交内计算近窗重复率并写入只读质量观测；不再以重复审计或后台 AI 改写正文。玩家请求强制分叉时，第一次调用会尽量返回选项，但完整正文不会因分支缺失而失败；若 AI 未返回分支，Orchestrator 仍提交一个无预设选项的分叉点，页面只显示玩家自定义引导输入，确认后建立同一 BranchIntent 并进入下一轮。
- 压缩管线在响应提交后异步运行；手动存档或加载先取消派生预生成并等待预览快照清理，再等待后台压缩提交。当前只有三层时间轴压缩：L1 覆盖 4 轮，L2 合并 4 个 L1 覆盖 16 轮，L3 合并 4 个 L2 覆盖 64 轮。L1 延迟一个完整块，完成第 8 轮后生成第 1-4 轮，完成第 12 轮后生成第 5-8 轮；主叙事对最近 4 轮只投影结构化关键事件，无关键事件时投影该轮摘要，避免把上一轮完整措辞作为续写样本。旧存档若含切换前的 5 轮节点，节点和原始明文档案继续保留，但新调度只按当前 4/16/64 轮对齐边界补建和晋升，不能让旧边界阻塞当前层级。
- 压缩 AI 只输出按时间段组织且带 `sourceIds` 的结构化事件，来源覆盖、时间轴节点和压缩档案由 `summary-compressor` 校验和组装。权重由本地计算：1 仅保留在本存档 L1 明文数据库中并不进入后续主动投影；2-9 按各自衰减间隔逐轮下降，降为 0 后下一轮遗忘；10 为永久记忆，后续 L2/L3 只原样携带其最初压缩结果。
- 每个存档的压缩系统拥有独立明文 SQLite 记忆库，完整保存 L1 原始 AI 返回、L1 归档、L1/L2/L3 时间轴节点、来源轮次与 ID、初始和当前权重、锚点、有效/遗忘/永久状态及原始压缩响应；这些是压缩、检索、衰减和审计的内部真源。主叙事组装时只消费由记忆生命周期公开的派生时间轴：可见叶子摘要、实体检索命中、最近 4 轮结构化事实、摘要账本和玩家原创事实合并后按实际时间排序，以“时间阶段 + 发生时间 + 事件”文本发送，内部计算字段不进入故事 Prompt；时间桥也只消费事实账本，不保留完整正文旁路。完整正文继续逐轮原样保存、展示、反馈和归档，不被摘要覆盖或删除。预生成只在临时快照中执行第一次叙事调用并缓存严格完整响应，消费前再次检查有效性；真实消费后才用真实同回合快照执行第二次结算和提交。
- 每次核心叙事上游请求都由 `/api/proxy` 把实际发送的 UTF-8 请求体和实际收到的响应原文追加到该存档该轮的 `.data/narrative-rounds/<lifeRunId>/round-XXXXXX.txt`；第一次叙事、第一次格式修复、第二次结算、结算格式修复及失败尝试按顺序形成独立 exchange。文件以字节长度标明原文边界，不重新序列化、不加密、不压缩、不脱敏。轮次头保存独立设备来源编号、账号和用户名；每轮首次真实主叙事 exchange 额外保存一次实际生效的完整文风、版本和全文校验指纹，同轮修复不重复保存文风。
- 每个真实回合只提交一次 `round-outcome`。成功时 `hooks.ts` 先等待本轮后台压缩、同步最终状态并完成自动存档，再发送包含阶段耗时、质量、采用结果、结构化提交、压缩和存档状态的 outcome；失败时发送一次失败 outcome。浏览器中的开发系统事件随该 outcome 一次性带回，不为单个阶段另发请求。
- 承载剧情的数据选择、压缩和传递还必须遵循 `D:\AI\.agents\skills\ai-life-sim\references\data-integrity.md`。

## 存档与恢复

- 成功回合后，`hooks.ts` 在启动下一段预生成前触发自动存档。
- `collectGameSavePayload()` 先同步活动子系统投影，再统一收集 Engine、Character、World 和 Orchestrator 快照；逐轮迁移审计随叙事历史进入存档，预生成缓存不进入存档载荷。实体引用目录、NPC 与关系分别由 `world-entity`、`npc-system`、`relationship-system` 的 owning snapshot 保存，World 通用快照和浏览器 Store 不重复持有这些持久化真源。
- 加载先检查 MOD、注册表、活动成员和核心载荷；输入有效后取消缓存及在途预生成，等待其 Abort、预览快照恢复和后台压缩提交全部完成，再开始写入 Store。P2 owning snapshot 使用封闭 `schemaVersion: 1` 契约，未知字段、版本、实体端点、上下文、位置、证据或来源引用整包拒绝；缺少 P2 快照时初始化空状态，不读取旧 NPC/关系 collected state 或浏览器残留。世界上下文无效或 Orchestrator 上下文不一致时拒绝加载。
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
| 字段权限与校验入口 | `src/mods/mod-engine/helpers/subsystem-field-registry.ts`、`src/foundation/subsystem-contracts/npc-social.contract.ts`、各 owning system 的 `preflightChanges()` |
| 存档收集与恢复 | `src/mods/mod-engine/helpers/save-restore.ts` |
| 时间轴压缩、权重和存档记忆 | `src/mods/mod-engine/subsystems/summary-compressor-system.ts`、`src/mods/mod-engine/helpers/timeline-memory.ts`、`src/core/storage/narrative-memory-store.ts` |
| 核心叙事上游原文归档 | `src/core/logger/narrative-round-archive.ts`、`src/core/ai-service/`、`src/app/api/proxy/route.ts` |
| 回合采用结果与开发系统诊断 | `src/core/logger/narrative-round-diagnostic.ts`、`development-system-diagnostic.ts`、`src/app/api/narrative/round-outcome/route.ts` |
| 迁移审计与可复算评分输入 | `src/foundation/types/scoring.types.ts`、`src/core/scoring/life-scoring.ts`、`src/mods/mod-pages/pages/game-over/page.tsx` |
| 玩家页面投影 | `src/mods/mod-pages/pages/game-story/` |
