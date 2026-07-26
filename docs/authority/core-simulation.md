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
- **剧情推进规则**：剧情阶段的持续时间、年龄、到期、延迟因果和世界演化应以 `totalDays` 或 `daysPassed` 为主轴；历史事件、玩家选择、状态变化、张力和随机性是条件或修正，不能取代时间轴。`plot-structure` 当前仍以 `phaseRound`/`roundSequence` 判定阶段时长，属于待对齐的现有实现，不是新的权威时间源。
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

当前阶段由 `src/mods/mod-engine/helpers/mvp-stages-config.default.json` 唯一定义，共 25 个活动成员。

### 外部业务成员（13）

| 所属 | 活动 ID | 当前职能 |
|---|---|---|
| 世界 | `world-context-registry` | 保存世界上下文注册表 |
| 世界 | `contextual-capability-profile` | 提供当前上下文能力画像 |
| 世界 | `spatial-graph` | 管理空间关系与移动事件 |
| 世界 | `context-transition` | 提议并执行上下文切换 |
| 世界 | `simulation-scope-policy` | 决定当前模拟范围 |
| 世界 | `world-init` | 创建和初始化明确上下文 |
| 历史 | `historical-event-ledger` | 保存历史事实、证据、转变和因果边 |
| 角色 | `character-base` | 保存四项基础属性及合法增量 |
| 角色 | `destiny-pattern` | 提供命格状态与叙事约束 |
| 角色 | `lifespan` | 保存最大寿命及寿命变化 |
| 角色 | `luck` | 保存气运状态 |
| 角色 | `morality` | 保存道德状态 |
| 世界 | `world-entity` | 保存上下文中的世界实体 |

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
| `plot-structure` | 记录剧情结构信号 |
| `foreshadowing` | 登记和回收伏笔 |
| `core-memory` | 保存核心关系与长期事实投影 |

只有 `character-base`、`lifespan`、`luck`、`morality` 拥有当前叙事结构化直接写入资格。其他活动成员是只读上下文、提议、事件输入或由引擎内部逻辑维护；源码中存在的其他系统不会自动进入回合。

## 回合入口与并发

- 玩家页面通过 `src/mods/mod-engine/hooks.ts` 调用 `executeRoundV2()`；旧的硬编码回合管线不再作为回退。
- 真实回合和预生成共享同一个 Orchestrator 单写者。真实回合开始前等待预生成完成快照恢复，防止两个 AI 调用交错提交或回滚。
- 每次执行重新计算 Token 上限、加载 Campaign 阶段、创建回合上下文和提交令牌；没有阶段、状态不允许推进或已到终局时不执行正常回合。
- 成功后提交回合令牌；失败时中止令牌，使该轮关联的后台合并任务失效。结构化事务和存档恢复的回滚边界见下文。

## 默认回合管线

| 顺序 | 阶段 | 当前运行机制 |
|---|---|---|
| 1 | `advance-time` | 发出回合开始事件并推进标准时间；预览执行不发布真实回合事件 |
| 2 | `subsystem-advance` | 让全部活动子系统执行本地规则推进；预览不提交真实推进 |
| 3 | `collect-states` | 收集活动子系统状态，形成后续检测和 Prompt 输入 |
| 4 | `event-lifecycle` | 根据状态与轮次检测事件生命周期，形成事件注入文本 |
| 5 | `cross-domain` | 执行跨域联动，重新收集状态并在需要时复检事件 |
| 6 | `assemble-prompt` | 只投影叙事必需的世界/角色事实、记忆、事件、玩家意图和本轮可写源字段；人口基数、科技进度、上下文 ID、请求 ID、账号、存档 ID、缓存池和可由所属系统推导的连锁值不进入 AI 正文 |
| 7 | `ai-narration` | 消费合格预生成或发起流式 AI 请求；正文/摘要已成立而数据失败时只调用数据修复协议，最多两次，不重写正文 |
| 8 | `post-processing` | 解析响应、提交合法变更与结构化事实、写入叙事历史并发布投影 |
| 9 | `epilogue-check` | 检测死亡或终局并按需生成死后尾声 |
| 10 | `compress-save` | 当前是扩展占位；实际压缩在响应提交后触发，自动存档由 `hooks.ts` 在成功回合后调用 |

阶段源是 `src/mods/mod-engine/campaigns/default/index.ts`，Manifest 中的阶段声明由代码生成器校验与其一致。

## AI 协议与解析

当前叙事信封按以下顺序组织：

1. `⟦正文⟧`：必需的玩家可见故事。
2. `⟦摘要⟧`：可选摘要。
3. `⟦数据⟧`：可选中文结构化数据。
4. `⟦结束⟧`：信封结束标记。

`narrative-parser` 负责信封提取和降级解析，`narrative-ai-protocol.ts` 负责中文 Schema、语法规范化、内部 ID 映射和最终类型转换。协议处理可以做结构规范化，但业务语义不从正文关键词或页面状态反推。

主叙事系统约束由服务端固定 Prompt 资产提供，动态输入固定为四条有序 user 消息：`全局信息`、`记忆`、`本轮引导`、`变化要求`。前三条只说明写作所需事实和方向；最后一条只列本轮相关的可写源字段、操作及条件任务，要求没有变化的字段整体省略。AI 只返回源变化，派生属性、规律推进和连锁反应由所属系统计算。

正文或摘要可用但数据区不合法时，`narrative-data-repair` 收到完整失败路径、当前值、违反规则、合法最小示例、原数据区以及只读的已成立正文/摘要。它只返回完整替换数据区；本地严格校验后按字节保留上一版正文和摘要并替换数据区。连续两次数据修复仍失败时，玩家可见正文继续提交，结构化变化整包拒绝。只有信封/正文自身不完整时才进入完整格式修复；网络重试仍由 AI 客户端按可重试状态单独处理。

AI 服务把宽调用类型归入独立内部统计池，不把池名写入 DeepSeek 业务用户身份。DeepSeek `user_id` 由代理使用可信账号或设备来源生成；思考模式为关闭、自动、深入、最大，分别映射 `disabled`、启用但省略强度、`high`、`max`。玩家只设置正文目标字数；每轮 `max_tokens` 由正文估算、信封冗余、波动冗余和同 Provider/模型/思考模式 P95 思考 Token 合成并向上取整，真实 usage 继续用于后续校准。

**实时源**：`src/mods/mod-engine/helpers/tagged-meta-envelope.ts`、`narrative-ai-protocol.ts`、`narrative-response-quality.ts`、`src/mods/mod-engine/subsystems/narrative-parser-system.ts`、`src/mods/mod-engine/server/narrative-system-prompt.ts`、`narrative-data-repair-system-prompt.ts`、`src/core/ai-service/ai-client.ts`、`narrative-token-budget.ts`。

## 结构化写入与原子提交

1. 解析结果先经过叙事拦截器和内容完整性检查；正文不可用时使用现有状态兜底文本，但被阻断的数据不获得写入权限。
2. 数据变更必须命中当前 `narrativeChange` 白名单，并通过 `subsystem-field-registry.ts` 的 `validated-write` 权限、作用域、操作和字段 Schema。
3. Orchestrator 对每个变更调用所属子系统的校验与提交；任一普通状态变更被拒绝时，恢复提交前的子系统快照并整包拒绝该轮结构化变更。
4. 命运意图解析必须与当前聚焦意图一致；无当前意图时，附带的意图结果字段被丢弃，不获得写入权。
5. 关键事件、语义信号和延期因果先构造历史事务并由账本预检。历史提交不完整或后续依赖失败时，普通变更、历史引用及依赖 META 一并回滚。
6. 完整事务通过后，剧情结构、伏笔、因果、原创记录、关系和记忆引用同一批已提交事件 ID；摘要账本保存合格摘要投影。
7. 提交后立即重新收集子系统状态，再同步 `EngineStore`、发布回合完成事件和界面快照，避免 UI 或自动存档读取上一轮状态。
8. 每条已采用正文都随 `narrativeHistory` 保存逐轮迁移审计，固定记录回合、正文 ID、拦截器、命运意图、历史事务、结构化写入、拒绝原因及可信状态；缺失、轮次不连续、正文 ID 不一致或任一可信门禁失败时，终局评分不能把该轮视为可信迁移。

**实时源**：`src/mods/mod-engine/subsystems/orchestrator-system.ts`、`src/mods/mod-engine/helpers/subsystem-field-registry.ts`、`narrative-change-bundle.ts`、各活动业务子系统的校验与提交实现。

## 故事、记忆与后台工作

- 完整正文按轮写入 `narrativeHistory`，不按字符、轮数或容量静默删除。摘要、记忆、重复率和历史事件都是派生投影，不替代正文。
- 每轮成功正文计算近窗重复率并写入只读质量观测；观测失败不阻塞故事。强制分支的正文若在初始响应或格式修复后仍缺少分支 META，均会以已提交正文为唯一事实来源启动同一后台补救；后台修复候选只有在生命代次、回合、来源正文、协议、事实覆盖和重复门禁全部一致时，才允许替换最新正文，不创建第二回合或重新应用结构化数据。
- 压缩管线在响应提交后异步运行；存档或加载前会等待后台压缩空闲。当前只有三层时间轴压缩：L1 覆盖 4 轮，L2 合并 4 个 L1 覆盖 16 轮，L3 合并 4 个 L2 覆盖 64 轮。L1 延迟一个完整块，完成第 8 轮后生成第 1-4 轮，完成第 12 轮后生成第 5-8 轮；主叙事始终保留最近 4 轮完整正文，避免压缩与近期正文重叠。旧存档若含切换前的 5 轮节点，节点和原始明文档案继续保留，但新调度只按当前 4/16/64 轮对齐边界补建和晋升，不能让旧边界阻塞当前层级。
- 压缩 AI 只输出按时间段组织且带 `sourceIds` 的结构化事件，来源覆盖、时间轴节点和最终可注入文本由 `summary-compressor` 校验和组装。权重由本地计算：1 仅保留在本存档 L1 明文数据库中并不进入后续主动投影；2-9 按各自衰减间隔逐轮下降，降为 0 后下一轮遗忘；10 为永久记忆，后续 L2/L3 只原样携带其最初压缩结果。
- 每个存档的压缩系统维护独立明文 SQLite 记忆库，保存全部 L1 原始 AI 返回、L1 归档、L1/L2/L3 时间轴节点、来源、权重、当前衰减和遗忘状态；主叙事组装前由压缩系统按实体和正文检索相关时间轴记忆。预生成在临时快照中执行，消费前再次检查有效性，失效结果不会提交到真实状态。
- 每次核心叙事上游请求都由 `/api/proxy` 把实际发送的 UTF-8 请求体和实际收到的响应原文追加到该存档该轮的 `.data/narrative-rounds/<lifeRunId>/round-XXXXXX.txt`；主调用、数据/格式/分支/重复修复及失败尝试按顺序形成独立 exchange。文件以字节长度标明原文边界，不重新序列化、不加密、不压缩、不脱敏。轮次头保存独立设备来源编号、账号和用户名；每轮首次真实主叙事 exchange 额外保存一次实际生效的完整文风、版本和全文校验指纹，同轮修复不重复保存文风。
- 每个真实回合只提交一次 `round-outcome`。成功时 `hooks.ts` 先等待本轮后台压缩、同步最终状态并完成自动存档，再发送包含阶段耗时、质量、采用结果、结构化提交、压缩和存档状态的 outcome；失败时发送一次失败 outcome。浏览器中的开发系统事件随该 outcome 一次性带回，不为单个阶段另发请求。
- 承载剧情的数据选择、压缩和传递还必须遵循 `D:\AI\.agents\skills\ai-life-sim\references\data-integrity.md`。

## 存档与恢复

- 成功回合后，`hooks.ts` 在启动下一段预生成前触发自动存档。
- `collectGameSavePayload()` 先同步活动子系统投影，再统一收集 Engine、Character、World 和 Orchestrator 快照；逐轮迁移审计随叙事历史进入存档，预生成缓存不进入存档载荷。
- 加载前检查 MOD、注册表和活动成员齐全，并等待预生成与压缩空闲。核心载荷缺失、世界上下文无效或 Orchestrator 上下文不一致时拒绝加载。
- 恢复任一步失败时，Engine、Character、World 和 Orchestrator 回到加载前快照；只有完整成功后才切换到模拟阶段。

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
| 字段权限与校验入口 | `src/mods/mod-engine/helpers/subsystem-field-registry.ts` |
| 存档收集与恢复 | `src/mods/mod-engine/helpers/save-restore.ts` |
| 时间轴压缩、权重和存档记忆 | `src/mods/mod-engine/subsystems/summary-compressor-system.ts`、`src/mods/mod-engine/helpers/timeline-memory.ts`、`src/core/storage/narrative-memory-store.ts` |
| 核心叙事上游原文归档 | `src/core/logger/narrative-round-archive.ts`、`src/core/ai-service/`、`src/app/api/proxy/route.ts` |
| 回合采用结果与开发系统诊断 | `src/core/logger/narrative-round-diagnostic.ts`、`development-system-diagnostic.ts`、`src/app/api/narrative/round-outcome/route.ts` |
| 迁移审计与可复算评分输入 | `src/foundation/types/scoring.types.ts`、`src/core/scoring/life-scoring.ts`、`src/mods/mod-pages/pages/game-over/page.tsx` |
| 玩家页面投影 | `src/mods/mod-pages/pages/game-story/` |
