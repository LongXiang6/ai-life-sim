# 运行时限制性数值审计（2026-08-06）

本文档是 `docs/reference` 的审计记录，不是运行时权威，不定义或修改任何契约。运行时事实仍以 `src/`、当前 `p8` 配置、测试和 `docs/authority` 为准。

## 范围与口径

- 审计对象：`src/` 与当前生效配置中会控制运行行为的上限、下限、容量、次数、窗口、超时、重试、队列、批量、概率、钳制、内容长度、AI 预算、保留期、压缩、缓存和生成数量。
- 模拟成员范围：`src/mods/mod-engine/helpers/mvp-stages-config.default.json` 的 `p8`，50 个外部业务成员与 12 个引擎成员，共 62 个；逐项剧情结论详见 [`simulation-system-audit-2026-08-06.md`](simulation-system-audit-2026-08-06.md)。
- 排除：测试夹具、纯 UI 尺寸、HTTP 状态码、日历换算常量、只用于显示或不控制运行行为的普通数字。
- “无界”表示 owning system 没有局部上限或收敛机制，不表示 JavaScript 可以安全无限增长；“有界”只表示当前代码有本地边界，不表示该边界已经获得产品授权。

## 授权分类

| 标记 | 含义 |
|---|---|
| **产品明确授权** | 可追溯到用户确认或生效产品决策（如 `PD-001`、`PD-009`、`PD-012`、`PD-013`、`PD-014`、`PD-015`、`PD-019`、`PD-034`、`PD-035`、`PD-037`）。 |
| **玩家可配置** | 设置或玩家输入可以改变；范围本身仍可能只是工程校验。 |
| **工程/安全护栏** | 请求、解析、队列、数据库或运行器为防止挂死、溢出、重放或过大载荷设置的限制。 |
| **未找到用户确认的源码默认值** | 代码中存在有效默认值或业务钳制，但在当前权威中没有找到用户对该具体数字的确认。 |
| **未生效/休眠值** | 仍可在源码、旧存档兼容或旧配置中读取，但当前活动链没有消费者；不能当作当前产品行为。 |

## 先行结论

1. **当前没有“单次人生最多 1000 回合”的整局终止。** `EngineConfig.maxRounds`、默认引擎 `maxRounds=1000` 和 Orchestrator 的整局终止判断已删除。保留的 `maxRounds` 只属于 Campaign 阶段局部防死循环（阶段配置多为 `1`，运行器缺省 `100`），不会在角色仍存活时结束整局。
2. **时间步长 `1000 年`、纪元分段 `1000 年` 与回合上限不是同一个概念。** 前者是一次推进量和命名分段；`totalDays`、`totalRounds` 没有局部终止上限，人生由现有寿命、死亡、手动停止或存档终态结束。
3. **最高风险来自叠加而非单个数字。** 通用 AI 传输最多 3 次、主叙事最多 2 次格式/重复修复、压缩首次调用加两路并发重试、世界初始化校验重试，会把一次玩家可见动作放大为多次逻辑调用；每个逻辑调用还可能叠加通用传输重试。
4. **剧情数据没有按固定容量硬截断。** 近期窗口是上下文选择；原始正文、事实、事件、关系、伏笔和存档数据仍保留。大量历史数组只追加不收敛，长期成本与存档增长需要后续单独决策，不能用未经确认的“1000 回合”补救。
5. **62 个系统中，真正对下一轮剧情形成稳定闭环的集中在时间、Orchestrator、历史、NPC/关系、角色属性、成长、声望、寿命/健康、压缩/记忆、因果、剧情结构、伏笔和核心记忆；多个其他系统虽有边界值，但默认为空或没有活动写入/消费方。**

## 一、回合、时间与终态护栏

| 编号 | 数值/边界 | 所有者 / 源码 | 用途与触发条件 | 玩家可见后果 | 生命周期 / 持久化 | 授权分类 | 风险 |
|---|---|---|---|---|---|---|---|
| R-01 | 整局最大回合数：**无**；旧 `1000` 已删除 | `mod-engine/constants.ts`、`types.ts`、`subsystems/orchestrator-system.ts` | Orchestrator 不再用整局回合数把仍存活的人生置为 `complete` | 可继续推进到寿命、死亡、手动停止或其他已有终态 | `totalRounds` 随本局增长，新人生重置；正文与分析历史也随本局保留 | **产品明确授权（用户 2026-08-06 明确删除未授权 1000）** | 长局的时间、Prompt、存档和日志成本改由真实生命周期承担；不能重新引入整局硬上限 |
| R-02 | Campaign 阶段 `maxRounds: **1**` | `src/mods/mod-engine/campaigns/default/index.ts` | 每个阶段只允许完成一个阶段动作，防止阶段重复推进 | 不限制整局，只影响阶段节点是否完成 | 阶段状态随本局迁移；成功后进入下一阶段 | **未找到用户确认的源码默认值** | 容易被误读成整局上限；报告和 UI 必须明确“阶段局部” |
| R-03 | 阶段运行器缺省 `maxRounds=**100**` | `src/mods/mod-engine/subsystems/orchestrator-system/campaign-stage-runtime.ts` | 阶段未声明上限时的死循环护栏 | 只有阶段内部超过 100 次循环才失败，不结束整局 | 单次阶段执行期有效，不写入人生终态 | **工程/安全护栏** | 仍可能掩盖阶段契约错误；不能当作产品人生长度 |
| R-04 | 账号战绩、云端手动存档、日志/传奇遭遇 API 的 `round` 字段最多 **1,000,000** | `src/core/account/account-contract.ts`、`src/core/player-content/player-content-contract.ts`、`src/app/api/log/route.ts`、`src/app/api/legendary-encounter/route.ts` | Schema/API 防止异常整数进入外围服务 | 超过时请求/记录被拒绝；不会主动结束人生 | 只约束外围数据契约，生命周期跟随账号、存档或日志 | **工程/安全护栏** | 这是数据契约上限，不是整局回合终止；与旧 `1000` 概念不同 |
| R-05 | 年步长可选 `1/3/5/10/50/100/200/500/**1000** 年` | `src/mods/mod-engine/subsystems/time-system.ts`、`mod-ui` 时间步进设置 | 玩家一次推进多年；中间年份走快速模拟，最后一年生成主叙事 | 一次点击可跨越很长时间，但仍按规范时间推进相关系统 | `totalDays`、年龄和世界状态持续累加；新人生重置 | **玩家可配置；产品明确授权（PD-010/PD-014 允许时间尺度变化）** | 大步长会放大人口、经济、气候和历史变化；不能把步长误称为回合上限 |
| R-06 | `ERA_SPAN=**1000**` 年；纪元名称池 **30** 项循环 | `src/mods/mod-engine/constants.ts`、`subsystems/time-system.ts` | 按千年分段生成纪元名与纪元年 | 只改变时间语境和显示名称，不结束人生 | 名称不存为无限新词；年份单调增长 | **未找到用户确认的源码默认值** | 名称池循环可能让远期纪元辨识度下降；数值本身不是终态护栏 |
| R-07 | `time.totalDays`、年份与 `orchestrator.totalRounds` **无局部上限** | `src/mods/mod-engine/subsystems/time-system.ts`、`orchestrator-system.ts` | 统一时间源和回合序号单调推进 | 支持跨千年叙事，不会因计数到某个固定值突然结束 | 随本局长期持久化；新人生清零 | **产品明确授权（用户禁止整局硬终止；PD-014/PD-015 要求保留剧情）** | 数值溢出、历史索引变大、Prompt 组装和存档膨胀是长期风险 |
| R-08 | `maximumLifespanDays`：**1..Number.MAX_SAFE_INTEGER** | `src/mods/mod-character/subsystems/lifespan-system.ts`、`health-system.ts` | 寿命档案校验与老死判定 | 极端寿命可让角色长期不进入老死终态 | 档案、调整记录随本局保存；死亡/新人生时结束或重置 | **工程/安全护栏；具体上限未找到用户确认** | 与无整局回合上限叠加后，可能形成事实上的超长人生和高成本历史 |

## 二、AI 请求、重试、超时与调用预算

| 编号 | 数值/边界 | 所有者 / 源码 | 用途与触发条件 | 玩家可见后果 | 生命周期 / 持久化 | 授权分类 | 风险 |
|---|---|---|---|---|---|---|---|
| A-01 | 单次 AI deadline **60 秒..10 分钟**；推理预留 `disabled=0 / auto=60s / high=120s / max=240s` | `src/core/ai-service/ai-call-deadline.ts` | 按调用类型和推理强度计算 Abort deadline | 慢模型可能等待更久，超时后本次调用失败 | 请求级；日志记录耗时/终态，不写剧情状态 | **工程/安全护栏；范围未找到用户逐项确认** | 多次重试时总等待可远超单次 deadline |
| A-02 | 流式空闲超时 **45 秒** | `src/core/ai-service/stream-timeout.ts` | SSE 在连续 45 秒没有新片段时中止 | 流式正文可能转为失败/重试；已收到片段不会自动成为完整成功 | 请求级，失败记录保留 | **工程/安全护栏** | Provider 慢首字节或长间隔输出会触发误判 |
| A-03 | 通用 AI 传输最多 **3 次**；基础退避 `1.5s`，随后按尝试线性增加 | `src/core/ai-service/ai-client/retry-executor.ts` | 网络、429、5xx、无效/截断内容等可重试错误 | 玩家看到更长等待，最终失败才显示错误 | 每个逻辑调用独立计数；调用日志保留每次尝试 | **工程/安全护栏** | 与上层逻辑重试叠加，真实上游请求数可能成倍放大 |
| A-04 | AI 代理请求体 **512 KiB** | `src/app/api/proxy/route.ts` | 代理读取请求体前做字节门禁 | Prompt/消息超过上限时整次请求返回 413 | 不写运行状态；代理 trace 记录拒绝 | **工程/安全护栏** | 这是传输体积门禁；不得被误写成叙事正文截断 |
| A-05 | 主叙事格式/重复修复最多 **2 次**（初始调用之外最多 3 个逻辑调用） | `src/mods/mod-engine/campaigns/default/index.ts` | 首次正文质量或协议无效时做最小修复 | 玩家可能等待额外调用；仍无效则整包拒绝、保留原状态 | 修复尝试与终态进入 AI/诊断日志；正文不被截短 | **产品明确授权（PD-041；旧 PD-038 已被取代）** | 每次修复还可能经过 A-03 的 3 次传输重试 |
| A-06 | 页面自动叙事重试延迟 **1.2s、2.5s** | `src/mods/mod-pages/pages/game-story/narrative-retry-policy.ts` | 页面层对可恢复推进失败再次触发 | 玩家看到短暂等待后重试；不改变回合序号 | 页面内存状态，成功后清理 | **未找到用户确认的源码默认值** | 与引擎/Provider 重试叠加，失败反馈可能延迟 |
| A-07 | 每轮正文后并行启动 **4 类**后台分析 | `src/mods/mod-engine/campaigns/default/index.ts`、Orchestrator 管线 | 事件、属性、阶段、其他后台分析在正文提交后运行 | 正文可先显示；后台可能继续占用 AI/CPU | 分析结果写入本局诊断/快照，部分集合只追加 | **未找到用户确认的源码默认值** | 并行调用增加成本和后台写入竞态，主剧情效果不一定等比例增加 |
| A-08 | 压缩闸门：首次 **1** 次，失败后 **2 路并发重试**，最多 **3 个逻辑调用** | `src/mods/mod-engine/helpers/compression-gate.ts`、`subsystems/orchestrator-system/compression-runtime.ts` | 到达 L1/L2/L3 压缩边界时调用 | 压缩失败不丢正文，下一次继续；玩家可能等待后台任务完成 | 压缩诊断、摘要节点和原始来源都保留 | **产品明确授权（PD-014/PD-015）** | 每个逻辑调用可能再乘 A-03，单次压缩触发最多约 9 次传输尝试 |
| A-09 | 世界初始化单次上游超时 **120 秒** | `src/app/api/world-init/route/provider.ts` | 校准/标签等后台初始化步骤请求 Provider | 创建页可能停留较久，超时后显示初始化失败或降级 | 世界初始化 Job 保留状态；快照只在成功后替换 | **工程/安全护栏** | 与校验重试叠加可能造成分钟级等待 |
| A-10 | 世界初始化响应校验最多 **3 个逻辑调用**；间隔 **2 秒** | `src/mods/mod-world/utils/world-init-pipeline/contracts.ts`、`ai-service.ts` | JSON/Schema 校验失败时用修正提示重试 | 玩家看到初始化继续；3 次仍失败才失败 | Job/步骤状态保留，未通过结果不写世界快照 | **工程/安全护栏** | 每个逻辑调用可能再乘通用传输重试，成本上界不直观 |
| A-11 | 内存世界初始化 Job 最多 **30**；满时淘汰最旧非运行 Job | `src/app/api/world-init/route/job-store.ts` | 防止服务进程内 Job Map 无限增长 | 旧已完成/失败初始化状态可能查不到；运行中的 Job 不淘汰 | 进程内存，重启清空；世界快照另有持久化 | **工程/安全护栏** | 属于可丢弃操作状态，不得与剧情事实混淆 |
| A-12 | 世界初始化轮询 **2 秒** | `src/mods/mod-world/hooks/useWorldInitPoller.ts` | 客户端读取 Job 状态 | 状态更新最多约有 2 秒观感延迟 | 页面生命周期内；离开页面停止轮询 | **工程/安全护栏** | 轮询请求量随等待时长线性增长 |
| A-13 | 新人生等待 MOD 初始化 **15 秒** | `src/mods/mod-pages/helpers/new-life-reset.ts` | 新人生前等待所有 MOD ready | 超时会阻止重置并提示，而不是半初始化运行 | 一次新人生操作；不写剧情 | **工程/安全护栏** | 长后台压缩/预生成可能让用户误以为不能开新人生 |
| A-14 | 设置页连接测试 **10 秒** | `src/mods/mod-settings/components/SettingsTabPresets.tsx` | 测试 Provider 配置的 Abort deadline | 超时只影响连接测试，不影响已开始人生 | 请求级 | **工程/安全护栏** | 测试结果不代表完整叙事调用可用 |
| A-15 | 诊断编号请求客户端超时 **5 秒** | `src/core/logger/diagnostic-player-code-client.ts` | 获取/分配玩家诊断编号 | 失败时暂时没有编号，后续日志关联可能缺失 | 缓存编号；Cookie 由服务端控制 | **工程/安全护栏** | 诊断能力降级，不应阻塞游戏主链 |
| A-16 | 主叙事与摘要没有 Provider `maxTokens/max_tokens` 硬输出上限 | `src/mods/mod-engine` Prompt/AI 请求组装；`docs/product-decisions.md` PD-015 | 只用软字数目标、完整性标记和 Schema 校验 | 正文不因字符/Token 上限被硬截断；超载时应失败而不是删短 | 原始正文/摘要来源保留 | **产品明确授权（PD-009、PD-015）** | Provider 自身配额或响应截断仍需被识别，不能假装成功 |

## 三、命格、世界生成与玩家设置

| 编号 | 数值/边界 | 所有者 / 源码 | 用途与触发条件 | 玩家可见后果 | 生命周期 / 持久化 | 授权分类 | 风险 |
|---|---|---|---|---|---|---|---|
| C-01 | 普通命格展示 **12**，玩家选择 **3** | `src/mods/mod-character/constants.ts`、`destiny-pattern-system.ts` | 抽取交接和选择页固定槽位 | 必须看到完整 12 条有效候选后再选 3 条 | 候选在创建期；选中模式写入角色创建状态 | **产品明确授权（PD-001、PD-012）** | 任何重新开放 5 条选择都会违反当前确认语义 |
| C-02 | 内部早期进度信号 **5** | `src/mods/mod-character/constants.ts`、AI pool service | 达到 5 条只触发后台进度事件 | 玩家仍停留在抽取页，不能进入选择 | 创建页临时状态 | **产品明确授权（PD-001/PD-013）** | 旧代码/旧 UI 可能把 5 条误当交接门槛 |
| C-03 | 首屏 **3 路并发 × 每路 10 条** | `destiny-pattern-system/ai-pool-service.ts` | 首屏快速收集独立 AI 候选 | 更快出现有效候选，但请求并发增加 | 候选池写入本地世界缓存；离页可取消 | **产品明确授权（PD-013）** | 重复、过滤和上游失败会让有效数量远小于请求数量 |
| C-04 | 后台默认最多 **10 批**，目标约 **100** 条（批量池 `50`、满池 `100`） | `src/mods/mod-character/constants.ts`、AI pool service | 5 条后继续补充共享 AI 池 | 选择交接仍只需要 12；后台池影响下次创建等待 | 世界码维度本地缓存，生命周期跨同世界创建 | **产品明确授权（PD-013）；池容量具体值部分未找到确认** | 10 批结束仍不足 12 条时，持续等待语义与页面错误分支可能冲突 |
| C-05 | 每批逻辑重试最多 **2** 次，退避 **1s、2s**；单批截断时可能再请求一次续写 | `destiny-pattern-system/ai-pool-service.ts` | 空响应、解析为空或疑似截断时恢复 | 额外等待，失败批次不混入预设 | 候选池持续写入；Abort 后停止 | **工程/安全护栏；具体次数未找到用户确认** | 还会叠加 A-03 通用 AI 重试，实际请求数可能较高 |
| C-06 | 首屏无页面总超时、无人为总请求次数上限；停止时不足 12 条，约 **3 秒**后显示不足错误 | `src/mods/mod-pages/pages/talent-draw/useTalentDrawGeneration.ts` | 轮询池状态并判断完整交接 | 玩家可能在后台停止后看到“只有 N 条，需 12 条”而不能继续 | 页面临时状态；池缓存仍保留已有候选 | **产品明确授权（PD-001）；3 秒错误分支为源码默认** | 与“持续请求直到 12 条或离页”的产品语义存在待复核冲突；本轮只报告不修复 |
| C-07 | 每项命印揭示 **220ms**；12 条归位后保持 **1s** | `src/mods/mod-pages/pages/talent-draw/useTalentDrawReveal.ts`、`useTalentDrawGeneration.ts` | 逐槽展示和定版交接 | 玩家看到完整 12 命印后才进入选择 | 纯创建页临时 UI 状态 | **产品明确授权（PD-001、PD-013）** | 动画时间不是剧情数据；网络慢时不能用动画掩盖缺项 |
| C-08 | 生成态池轮询 **3s**；选择态 **1s** | `src/mods/mod-pages/pages/talent-draw/useTalentDrawGeneration.ts` | 同步后台候选池和页面槽位 | 页面更新存在 1–3 秒延迟 | 页面生命周期内 | **工程/安全护栏；具体间隔未找到用户确认** | 轮询延迟会放大“已生成但尚未显示”的等待感 |
| C-09 | 属性自由预算 **15**；单项创建页不设上下限，可保留未用点 | `src/mods/mod-pages/pages/attribute-alloc/page.tsx`、`docs/product-decisions.md` | 四项基础属性确认前的玩家分配 | 可正负调整；命格/种族修正另行叠加 | 创建草稿到确认；新人生不删除长期角色设定 | **产品明确授权（PD-012）** | 与旧创建表单的 30 点/0..10 并存会造成误读 |
| C-10 | 四项最终属性硬钳制 **-100,000..100,000** | `src/mods/mod-character/constants.ts`、`character-base-system.ts` | 防 AI/公式溢出；超凡映射仍可表现高档位 | 极端变更被压到硬边界 | 角色基础状态随本局和存档 | **工程/安全护栏；上限未找到用户确认** | 远大于正常叙事量级，可能掩盖上游无限增长 |
| C-11 | 设置 `preGenerateRounds` **0..3**，默认 **1**；运行时有效值折算为 **0/1** | `src/core/account/account-contract.ts`、`src/mods/mod-settings/store.ts`、`SettingsTabModel.tsx`、`pre-gen-queue.ts` | 玩家开关下一轮预生成 | 2/3 的旧设置值与 1 的开启效果等价 | 设置可持久化；队列在新人生/分支时清空 | **玩家可配置；范围与折算未找到用户确认** | 公开范围大于实际能力，容易让玩家误以为可预生成多轮 |
| C-12 | 当前 `fillPreGenQueue()` 为 **no-op**，不执行 speculative 回合 | `src/mods/mod-engine/helpers/pre-gen-queue.ts` | 保留旧公开接口但关闭运行时预生成 | 不会真正提前消耗 AI 或创建下一回合 | 队列/在途结果只保留临时状态 | **未生效/休眠值（当前事实）** | 旧 `preGenerateRounds` 文案与实际效果不一致 |
| C-13 | 旧 `PRE_GEN_CONFIG`：超时 **30s**、TTL **5min**、重试 **2**、延迟 **2s** | `src/mods/mod-engine/constants/pre-gen-config.ts` | 历史预生成实现的兼容常量 | 当前不触发，不应影响玩家等待 | 只可能从旧配置读取；当前队列 no-op | **未生效/休眠值** | 若未来误接回，会重新引入未确认的后台 AI 调用 |
| C-14 | 命格稀有度持有上限：传说 **2**、史诗 **6**；属性加成总和按稀有度 `1/3/4/5/7` 校验 | `src/mods/mod-character/constants.ts`、`destiny-pattern-system/validation.ts` | 创建期过滤和角色命格写入校验 | 候选效果会被缩放/拒绝，玩家不能超出稀有度配额 | 选定命格写入本局角色 | **产品明确授权（PD-005、PD-012）** | 稀有度限制与完整候选数量是两套不同约束，不能混为“回合上限” |
| C-15 | 轮回携带 **2**；结算候选 **3**；本地总库 **10** | `src/mods/mod-character/constants.ts`、`mythic-library-store.ts`、`life-record-store.ts` | 跨人生继承、结算生成和账号同步 | 玩家最多保存/携带对应数量，超出需明确拒绝或删除旧项 | 本地/云端长期持久化；账号清理时级联删除 | **产品明确授权（PD-006、PD-034、PD-036、PD-037）** | 长期栏位是玩家数据，不得静默淘汰 |
| C-16 | 旧 `useCharacterCreateForm`：属性预算 **30**、单项 **0..10** | `src/mods/mod-pages/pages/character-create/useCharacterCreateForm.ts` | 废弃创建路径的遗留校验 | 当前页面不使用；不会决定新创建结果 | 休眠代码，不应写新状态 | **未生效/休眠值** | 与生效的 15 点、无创建页上下限冲突，容易误导后续维护 |
| C-17 | 旧 `TALENT_SELECT_COUNT=**2**` | `src/mods/mod-character/config/talent-ui-config.ts` | 仅导出兼容配置，无当前运行消费者 | 当前选择页仍按 3 | 休眠导出；不进入当前创建状态 | **未生效/休眠值** | 平行常量造成“到底选 2 还是 3”的契约歧义 |
| C-18 | 世界区域数量 **1..30**；实体生成：国家 **1..15**、势力 **2..8**、贵族 **0..15**、聚落 **3..30**、贸易路线 **3..6** | `src/mods/mod-world/constants.ts`、`calibration-clamp.ts`、`world-calibration-prompt.ts` | 世界初始化校准和实体生成规模 | 决定开局地图/社会主体数量与首轮 Prompt 密度 | 初始化快照替换；新世界重新生成 | **未找到用户确认的源码默认值** | 数量越高，NPC/关系/历史投影与初始化 AI 成本越高；不是人生长度 |

## 四、叙事窗口、压缩、记忆、因果与重复检测

| 编号 | 数值/边界 | 所有者 / 源码 | 用途与触发条件 | 玩家可见后果 | 生命周期 / 持久化 | 授权分类 | 风险 |
|---|---|---|---|---|---|---|---|
| N-01 | 叙事目标共 **16 档，50..2000 字**；默认 **200** | `src/mods/mod-engine/constants/narrative-config.ts`、`src/mods/mod-settings/store.ts` | 设置偏好转为 Prompt 软目标 | 影响篇幅节奏，不是拒绝/截断条件 | 设置持久化；正文完整保留 | **产品明确授权（PD-009）** | Provider 自身截断仍需单独识别 |
| N-02 | 主 Prompt 至少携带最近 **3 轮完整故事**；近期结构化事实窗口 **4 轮** | `docs/product-decisions.md` PD-014、`src/mods/mod-engine/constants.ts`、`timeline-projection-runtime.ts` | 压缩调用与主叙事装配分别使用完整原文/事实投影 | 玩家能看到近期动作连续性；更早内容由摘要/检索承接 | 正文与来源不删除；窗口只是每轮输入选择 | **产品明确授权（PD-014、PD-015）** | “窗口”若被误做成删除，会违反硬截断禁令 |
| N-03 | 重复比较窗口 **5 轮**；5-gram；高风险 `n-gram>=0.65` 或词集合 `>=0.75`；观察 `>=0.35` 或 `>=0.55` | `src/mods/mod-engine/helpers/narrative-repetition-metrics.ts`、`narrative-acceptance-runtime.ts` | 计算重复质量等级并触发发布前修复 | 高重复正文被修复/拒绝，但原正文事实不被截短 | 指标随引擎状态保存；不拥有剧情事实 | **产品明确授权（PD-038/PD-041）** | 阈值只衡量相似度，不能替代剧情判断 |
| N-04 | L1 **4 轮**，延迟 **1 个完整块**；L2 **16 轮**；L3 **64 轮** | `src/mods/mod-engine/constants.ts`、`summary-compressor-system.ts` | 生成分层语义摘要和高层时间轴 | 后续 Prompt 看到压缩后的长期因果，不必注入全部正文 | 低层、原文和新节点同时保留；摘要节点只追加 | **产品明确授权（PD-014、PD-015）** | 节点数量仍无上限，压缩降低 Prompt 负担但不降低存储总量 |
| N-05 | 记忆权重 **1..10**；衰减间隔 `1/2/4/8/16/32/64/128` 轮；权重 10 永久，1 在 L1 后不主动投影 | `src/core/storage/narrative-memory-policy.ts`、`src/mods/mod-engine/helpers/timeline-memory.ts` | 事件重要性、检索活跃度和可解释遗忘 | 关键记忆更久出现；低权日常逐步退出主 Prompt | SQLite 记录当前权重、遗忘轮次和来源；事实不静默删除 | **产品明确授权（PD-014）** | 永久记忆集合仍可无界增长 |
| N-06 | 记忆生命周期压缩最少 **3 轮**；容量触发 **15 个事件** | `src/mods/mod-engine/subsystems/memory-lifecycle-system/contracts.ts`、`memory-lifecycle-system.ts` | 事件闭环或达到事件数量时决定压缩 | 达到条件后后台压缩，正文继续可见 | 已压缩 L0 可清理；原始事件、索引和统计仍持续增长 | **产品明确授权（PD-014）；阈值具体值未找到用户逐项确认** | “容量触发”不是硬删除；事件量高时 AI 调用频率上升 |
| N-07 | 旧遗忘配置：每 **16** 轮检查，相似度 **0.7**，小事保留 **10%**，每次最多遗忘 **30%** | `src/mods/mod-engine/subsystems/memory-forgetting-system.ts` | L1 级重复/日常遗忘公共能力 | 当前活动链无调用方，玩家通常不可见 | 配置和因果标记在系统内；当前默认状态保持空 | **未生效/休眠值** | 若误接回，可能与当前 PD-014 的权重衰减重复或冲突 |
| N-08 | 延期因果触发延迟：轻微 **30 天**、普通 **90 天**、重大 **180 天**、关键 **365 天**；每轮最多触发 **2 件** | `src/mods/mod-engine/subsystems/causal-delay-system/contracts.ts` | 把承诺、债务、恩怨等转为后续可验证后果 | 后续轮次可能出现与早期选择对应的事件/处置 | 完整因果记录保留，状态从 pending 到 triggered/committed 迁移 | **产品明确授权（PD-025/PD-041）；具体天数未找到用户逐项确认** | 无记录容量；长期因果会扩大 Prompt 与索引 |
| N-09 | 分支按钮数量 **2..4** | `src/mods/mod-engine/helpers/narrative-semantic-signals.ts` | 结构化分支协议的产品机制校验 | 每轮可选行动数量固定在可读范围 | 已确认选择写入历史；未终结意图持续保存 | **产品明确授权（PD-041）** | 这是交互选项边界，不是剧情内容截断 |
| N-10 | 中文段落整理：最多 **5 句**或约 **120 字符**后换段 | `src/mods/mod-engine/helpers/chinese-text-processor.ts` | 视觉/阅读分段，不删除字符 | 只改变换行，正文语义保留 | 处理后的正文仍作为完整结果保存 | **未找到用户确认的源码默认值** | 若未来改成 `slice` 截断会直接触碰 PD-015 |
| N-11 | 历史候选查询分页 **500**；日志查询默认 **100**、范围 **1..500** | `src/mods/mod-engine/subsystems/orchestrator-system/historical-ledger-runtime.ts`、`src/core/logger/server-log-store/server-log-query.ts` | 分页读取候选和运维日志 | 单页结果有限，但可继续翻页；不删源数据 | 查询级临时状态 | **工程/安全护栏** | 调用方若误把单页当全量，会漏读历史事实 |

## 五、账号、存储、云同步、邮件、画像与日志

| 编号 | 数值/边界 | 所有者 / 源码 | 用途与触发条件 | 玩家可见后果 | 生命周期 / 持久化 | 授权分类 | 风险 |
|---|---|---|---|---|---|---|---|
| S-01 | 账号生命周期 **30 天**无认证活动；单会话最长 **30 天** | `src/core/account/account-contract.ts`、`account-service/repository.ts` | 清理不活跃账号与会话 Cookie | 账号/云数据到期删除；游客本地流程不受影响 | SQLite 账号、会话、云内容级联删除 | **产品明确授权（PD-034、PD-037）** | 是真实数据删除生命周期，不得与日志保留混称 |
| S-02 | 本地手动存档最多 **10**；自动存档槽 **0**不计入 | `docs/product-decisions.md` PD-034、`src/core/storage/save-manager` | 保存槽位门禁 | 超出时明确拒绝，不静默覆盖旧槽 | 本地持久化；新人生不自动删除手动槽 | **产品明确授权（PD-034）** | 长期存档容量随剧情增长，槽位数有限但单槽仍有体积风险 |
| S-03 | 轮回天赋 **10**、结构化战绩 **10**、云端手动槽 **1** | `src/core/account/account-contract.ts`、`mythic-library-store.ts`、`life-record-store.ts`、`cloud-manual-save-service.ts` | 账号同步和结算投影 | 超出明确报错或由玩家覆盖云槽 | 云端 SQLite 白名单结构；账号删除级联 | **产品明确授权（PD-034、PD-037）** | 不得以 FIFO 静默淘汰玩家拥有的条目 |
| S-04 | 最多 **5** 个会话；单次同步体 **256 KiB** | `src/core/account/account-contract.ts`、`account-service/repository.ts` | 会话清理、云同步 Schema | 新会话可能淘汰最旧会话；同步过大整包失败 | 会话/同步版本持久化；冲突按 revision 重读 | **产品明确授权（PD-034）** | 同步失败不能只写部分字段 |
| S-05 | 用户名 **3..24 字符**；密码 **8..128 字符**且最多 **512 字节** | `src/core/account/account-contract.ts` | 注册/登录输入校验 | 输入过短/过长被拒绝 | 账号表只保存哈希/规范化值 | **产品明确授权（PD-034）** | 字符数与字节数同时存在，错误提示需区分 |
| S-06 | 登录来源 **40/15 分钟**，用户名 **10/15 分钟**；注册 **5/小时** | `src/app/api/account/login/route.ts`、`register/route.ts` | 防暴力尝试与滥用 | 达到限流后暂时不能登录/注册 | 账号 rate-limit 表定期清理；不影响游戏状态 | **工程/安全护栏；PD-034 要求账号能力** | 共享来源桶可能让同一网络下多个玩家互相影响 |
| S-07 | QQ 绑定码长度 **10**、有效 **10 分钟**；签名有效 **5 分钟**；nonce 保留 **10 分钟**；Bot 请求体 **4096 字节** | `src/core/account/qq-bot-integration/account-binding.ts`、`request-authentication.ts` | 一次性绑定、防重放和 HMAC 验证 | 过期或超大请求被拒绝，需要重新绑定/重试 | 绑定码/nonce 表短期保留；QQ 账号关系长期存储 | **产品明确授权（PD-035）** | 时钟漂移、重试和大 DTO 会造成联动失败 |
| S-08 | 积分幂等记录保留 **90 天**；转账 **1..1,000,000**；调整 **-1,000,000..1,000,000** | `src/core/account/qq-points-service/contracts.ts`、`operations.ts` | 余额守恒、幂等和管理员调整 | 非法金额或旧幂等键被拒绝/冲突 | 账本长期保留；幂等操作记录 90 天后清理 | **产品明确授权（PD-035）** | 金额上限是单次操作边界，不是余额上限 |
| S-09 | 云端存档原始/解压 **64 MiB**；压缩后 **16 MiB** | `src/core/player-content/player-content-contract.ts`、`cloud-manual-save-service.ts` | gzip 后写入单一云槽，解压也受限 | 超大存档整包拒绝并保留旧快照 | 云端只保存一份压缩快照与摘要；不按字符截断 | **产品明确授权（PD-037）；体积值未找到用户逐项确认** | 长人生历史不收敛时最终会撞体积门禁 |
| S-10 | OPFS 刷写防抖 **500ms**；存储初始化 **5s**；页面外层放行约 **6s** | `src/core/storage/persist-layer.ts`、`src/app/_components/storage-init.tsx` | 本地存档异步写盘与启动恢复 | 启动超时会继续使用现有 localStorage；重载前可强制刷盘 | OPFS/localStorage 双层持久化 | **工程/安全护栏** | 外层超时不等于数据已恢复，页面读取旧值的风险需监控 |
| S-11 | 邮件保留 **3 天**；清理检查 **5 分钟**；分页 **30** 条 | `src/core/player-content/player-content-database.ts`、`player-mail-service/mailbox-cleanup.ts`、`mailbox-read-service.ts` | 站内邮箱短期投递和分页读取 | 过期邮件不再显示；分页每次最多 30 条 | 邮件/画像附件短期保存，清理后删除 | **产品明确授权（PD-037）；分页/清理间隔为源码默认** | 邮件不是剧情真源，不能用它替代长期存档 |
| S-12 | 排行榜查询默认 **100**，范围 **1..100**；合格分数 **98..100** | `src/core/player-content/player-content-service/leaderboard-service.ts`、`player-content-database.ts` | 读取当前每账号最优合格人生 | 页面最多显示请求上限的条目 | 只保存账号最优投影；关闭时无公开入口 | **产品明确授权（PD-037）** | 排行榜投影不是完整人生事实 |
| S-13 | 画像任务最多 **3** 次；延迟 `[0,1s,5s]`；卡住 **10 分钟**重置；Provider 请求 **180s** | `src/core/player-content/portrait-mail-service.ts`、`portrait-image-provider.ts` | 满分人生生成图片并投递邮件 | 画像生成可能等待数分钟；失败后保留任务错误 | 图片资产最多 **25 MiB**；Provider JSON **1 MiB**；任务状态持久化 | **产品明确授权（PD-037）；工程细项未找到逐项确认** | 画像是外围彩蛋，不能阻塞人生主链 |
| S-14 | 日志接收体 **4 MiB**；每来源 **120 次/分钟**；来源桶最多 **4096** | `src/app/api/log/route.ts` | 客户端/AI 诊断上报与限流 | 过大或超频日志被拒绝；剧情继续运行 | 来源桶进程内；日志内容进 SQLite/归档 | **产品明确授权（PD-019）；限流细项为工程护栏** | 诊断事件丢失会降低问题可定位性，但不应影响剧情状态 |
| S-15 | 反馈体 **16 MiB**；每来源 **6 次/10 分钟** | `src/app/api/feedback/route.ts` | 完整诊断包整包上传 | 超大/超频反馈全部拒绝，不保存部分内容 | 反馈包按诊断保留策略存储 | **产品明确授权（PD-023）** | 反馈包可能含近期完整故事；必须整包失败而非截断 |
| S-16 | 诊断 Cookie **10 年**；分配 **60 次/10 分钟**；候选碰撞最多 **128** 次 | `src/app/api/diagnostic-identity/route.ts`、`src/core/logger/diagnostic-player-identity.ts` | 稳定玩家诊断编号和碰撞重试 | 正常情况下编号长期稳定；分配限流时日志可能暂缺编号 | Cookie 长期；占用记录不随 30 天诊断日志清理 | **产品明确授权（PD-024）** | 编号是诊断别名，不是账号或剧情身份 |
| S-17 | 客户端近期诊断最多 **80**；开发事件队列最多 **512**，超出丢弃最旧项 | `src/core/logger/client-logger/diagnostic-transport.ts`、`development-system-diagnostic.ts` | 防浏览器内存和待发送队列无限增长 | 旧诊断事件可能不可上报/不可见 | 进程/页面临时状态；不进入玩家存档 | **工程/安全护栏** | 明确的数据完整性风险；不能用来解释剧情历史缺失 |
| S-18 | `sendBeacon` 载荷超过 **48,000 字节**改用 `fetch`；服务器日志查询默认 **100**、最多 **500**；清理约 **15 分钟**一次 | `src/core/logger/debug-logger.ts`、`server-log-query.ts`、`server-log-store/retention-cleanup.ts` | 可靠发送和运维分页/清理 | 大日志改走 fetch；查询分页有限 | 热日志保留今天与昨天，旧记录移入归档；归档容量无明确业务上限 | **产品明确授权（PD-019）；部分传输/分页值为工程默认** | 归档无容量上限与大段内容增长可能形成运维成本 |
| S-19 | DeepSeek 余额请求体 **4 KiB**；缓存 TTL **60s** | `src/app/api/ai-usage/deepseek-balance/route.ts` | 设置页余额查询去重和短缓存 | 60 秒内重复查询复用结果，过大 Key/请求被拒绝 | 服务进程缓存；错误会删除缓存项 | **工程/安全护栏** | 余额查询缓存不影响叙事调用语义 |

## 六、62 个活动模拟系统：关键数值、膨胀判断与剧情效果

下表是逐系统的数值摘要。`高/中/低/无`表示当前链路对下一轮 Prompt、历史、记忆、玩家状态或终态的实际辅助强度；“无界”只描述增长风险，不代表应立即修改。

| # | 系统 / 所有者源码 | 关键数值与边界 | 作用与触发 | 玩家/剧情效果 | 生命周期、膨胀与风险 | 授权分类 |
|---:|---|---|---|---|---|---|
| 1 | `world-context-registry` / `mod-world/subsystems/world-context-registry-system.ts` | 每个上下文 ID 替换；上下文映射无容量 | 世界初始化、切换、存档注册 | **高**：决定当前世界作用域 | 集合按输入增长，新人生重置；长期多世界会膨胀 | 未找到用户确认的源码默认值 |
| 2 | `contextual-capability-profile` / `mod-world/subsystems/contextual-capability-profile-system.ts` | 能力枚举有限；每上下文一份 | 刷新能力画像、门控系统 | **高**：阻止不适用规则进入 Prompt | 替换状态，规模随上下文数 | 工程/安全护栏 |
| 3 | `spatial-graph` / `mod-world/subsystems/spatial-graph-system.ts` | 节点、边、出口、位置无局部容量 | 世界生成、移动、实体定位 | **高**：提供场景邻接与跨界路径 | 图集合无界，新人生重置；长期世界复杂度增长 | 未找到用户确认的源码默认值 |
| 4 | `context-transition` / `mod-world/subsystems/context-transition-system.ts` | 迁移历史只追加，无容量 | 跨世界/上下文切换 | **高**：旅行记忆和当地时钟可被后续叙事使用 | `transitionHistory` 无界 | 产品明确授权（多世界链路）；容量未确认 |
| 5 | `simulation-scope-policy` / `mod-world/subsystems/simulation-scope-policy-system.ts` | 每上下文固定一份 active/background/frozen 状态 | 每轮决定完整或后台推进 | **中高**：间接决定哪些世界继续变化 | 替换状态，随上下文重置 | 工程/安全护栏 |
| 6 | `world-init` / `mod-world/subsystems/world-init-system.ts` | 单快照替换；初始化结果无逐轮数组 | 世界初始化完成后写入 | **高**：提供全部初始世界事实 | 生命周期有界，失败不替换快照 | 工程/安全护栏 |
| 7 | `historical-event-ledger` / `mod-history-dynamics/subsystems/historical-event-ledger-system.ts` | 事件、证据、迁移、候选、因果边无容量 | 正文提交、候选确认、查询 | **高**：最可靠的事实/证据源 | 原记录保留、集合无界；长期 Prompt/存储压力高 | 产品明确授权（PD-015/025） |
| 8 | `world-entity` / `mod-world/subsystems/world-entity-system.ts` | 实体与引用目录无容量；同 ID 替换 | 世界生成、NPC/势力/空间引用 | **高**：保证故事对象真实存在 | 输入/叙事驱动集合无界，新人生重置 | 未找到用户确认的源码默认值 |
| 9 | `relationship-system` / `mod-social/subsystems/relationship-system.ts` | 关系指标有界；关系与 `transitions` 无界 | AI 关系变更、每轮后台推进 | **高**：直接改变人物关系 | 后台每轮可追加观察，长期放大 | 产品明确授权（PD-025）；容量未确认 |
| 10 | `npc-system` / `mod-npc/subsystems/npc-system.ts` | 身份可替换；行为、记忆、目标记录无界 | AI 创建/更新、每轮后台行为 | **高**：持续提供行动主体与动机 | 多数组合无界；存档/Prompt 成本增长 | 产品明确授权（PD-025） |
| 11 | `geography` / `mod-environment-ecology/subsystems/geography-system.ts` | 地理节点和变化记录无容量 | 初始化、每轮推进、宏观影响 | **中高**：形成地形约束 | `changes` 只追加 | 未找到用户确认的源码默认值 |
| 12 | `natural-resource` / `mod-environment-ecology/subsystems/natural-resource-system.ts` | 资源量 `0..capacity`；矿藏/交易记录无界 | 再生、消耗、宏观交易 | **中高**：资源压力可进入宏观叙事 | 数值有界、交易历史无界 | 未找到用户确认的源码默认值 |
| 13 | `climate` / `mod-environment-ecology/subsystems/climate-system.ts` | 季节/湿度有界；灾害到期；`temperatureOffset` 无钳制 | 季节推进、灾害、宏观基线调整 | **高**：直接形成场景天气与灾害 | 温度偏移长期漂移；有失真风险 | 未找到用户确认的源码默认值 |
| 14 | `ecology` / `mod-environment-ecology/subsystems/ecology-system.ts` | 指标 `0..100`；种群 `0..承载量`；灭绝历史无界 | 物种年增长、宏观调节 | **低**：默认物种/登记链断开，通常无生态事实 | 灭绝记录无界；当前通常空 | 未生效/休眠路径 |
| 15 | `pollution` / `mod-environment-ecology/subsystems/pollution-system.ts` | 节点/全局指数 `0..100` | 排放衰减、灾害脉冲、重算 | **中高**：稳定环境压力并反馈生态 | 数值有界，一节点一份 | 未找到用户确认的源码默认值 |
| 16 | `growth-system` / `mod-progression/subsystems/growth-system.ts` | 经验不超过 `potentialCap`（写入最多 `100000`）；潜力 `0..100`；使用次数可至最大安全整数 | AI 学习/练习、技能使用 | **高**：把正文行为变成稳定成长事实 | 技能/能力/记录数组无界，使用次数单调增长 | 产品明确授权（PD-025）；细项护栏未确认 |
| 17 | `achievement` / `mod-progression/subsystems/achievement-system.ts` | 成就点 `0..10000`；匹配计数最多 `1000000`；匹配事件 ID 无界 | 扫描历史账本刷新进度 | **高**：成就由已确认事实驱动 | 历史匹配集合随账本增长 | 产品明确授权（PD-036） |
| 18 | `reputation` / `mod-progression/subsystems/reputation-system.ts` | 分数 `-100..100`；变化日志无界 | AI 调整社会评价 | **高**：社会反馈成为后续条件 | 数值有界，日志只追加 | 产品明确授权（PD-025） |
| 19 | `character-base` / `mod-character/subsystems/character-base-system.ts` | 四项属性最终 `-100000..100000`；固定字段替换 | AI 受校验增量、命格/健康/上下文修正 | **高**：角色能力的直接公共状态 | 核心数值有界，修正可清除 | 产品明确授权（PD-012/025）+工程护栏 |
| 20 | `destiny-pattern` / `mod-character/subsystems/destiny-pattern-system.ts` | 展示 12、选择 3；传说 2、史诗 6；AI 池目标约 100 | 创建期候选、选择和效果修正 | **高**：真实影响开局属性与叙事 | 创建期有限，池缓存按世界保存 | 产品明确授权（PD-001/005/012/013） |
| 21 | `lifespan` / `mod-character/subsystems/lifespan-system.ts` | 最大寿命 `1..Number.MAX_SAFE_INTEGER`；调整记录无界 | 创建寿命、AI 规则/增减 | **高**：决定老死边界 | 业务值可极大，记录只追加 | 产品明确授权（生命周期）；具体极限未确认 |
| 22 | `lifecycle-system` / `mod-character/subsystems/lifecycle-system.ts` | 年龄可至最大安全整数；阶段转变历史无界 | 从规范时间计算年龄/阶段 | **高**：把时间跨度变成人生阶段 | 年龄单调、转变不淘汰 | 产品明确授权（PD-014） |
| 23 | `health` / `mod-character/subsystems/health-system.ts` | 生命/体力/精神为有界值；伤病当前可解决；条件历史无界 | 每轮恢复/倒计时、AI 调整、死亡确认 | **高**：生存、伤病和死亡进入终局 | 条件记录保留；死亡需历史确认 | 产品明确授权（PD-025） |
| 24 | `luck` / `mod-character/subsystems/luck-system.ts` | 气运 `-10..10`；每轮引导替换；方向基准 `25/50/25%`、每点转移 `5` 个百分点 | 本地随机初始化、叙事方向 | **高**：确定性改变本轮有利/不利方向 | 状态随本局保存，新人生重置 | 未找到用户确认的源码默认值 |
| 25 | `morality` / `mod-character/subsystems/morality-system.ts` | `value += delta`，无钳制/衰减/局部上限 | 事件驱动道德变化、结算标签 | **高但有失真风险**：长期值可能远超分档量级 | 数值单调累积，新人生重置 | 未找到用户确认的源码默认值 |
| 26 | `celestial` / `mod-base-universe/subsystems/celestial-system.ts` | 年内日有界；活动天象到期；历史无界 | 当地年内日投影、天象 | **中**：自然历法有效，特殊天象默认写入不足 | 历史只追加；新人生重置 | 未生效/休眠路径 |
| 27 | `era` / `mod-base-universe/subsystems/era-system.ts` | 年内日有界；纪元年单调无上限；年号每 40 年切换 | 从当地时钟派生纪元语境 | **高**：统一时间叙事 | 不保存全量历史，年份增长 | 未找到用户确认的源码默认值 |
| 28 | `fate-prophecy` / `mod-base-universe/subsystems/fate-prophecy-system.ts` | 进度 `0..100`；`causalityPenalty` 无界；预言/预兆集合可累积 | 预言推进、打破时加惩罚 | **无**：当前没有活动创建/应验写入方 | 休眠集合与惩罚潜在无界 | 未生效/休眠值 |
| 29 | `divine-creation` / `mod-base-universe/subsystems/divine-creation-system.ts` | 神祇列表无容量；默认空 | 公共 API 登记神祇 | **无**：当前没有登记调用，相关链缺基础实体 | 休眠集合潜在无界，新人生重置 | 未生效/休眠值 |
| 30 | `economy` / `mod-economy/subsystems/economy-system.ts` | 价格指数 `1..1000000`；税率/通胀等有界；`totalCirculation` 无上限 | 每轮公式推进与宏观调整 | **中**：宏观背景有效，但工作收入不进入玩家财富 | 货币流通量单调/可能无界 | 未找到用户确认的源码默认值 |
| 31 | `population` / `mod-economy/subsystems/population-system.ts` | 总人口 `0..承载量`；比例有界 | 出生、死亡、迁移、承载量推进 | **中**：宏观模拟有效，但主故事 Prompt 显式排除 | 每上下文一份；与聚落人口分开演化 | 产品明确授权（宏观模拟）；Prompt 排除为当前契约 |
| 32 | `settlement` / `mod-economy/subsystems/settlement-system.ts` | 繁荣/安全有界；人口、`yearsInCurrentTier` 无上限 | 每轮聚落推进 | **低中**：状态可见，但与全局人口可能矛盾 | 两个业务值单调/无界 | 未找到用户确认的源码默认值 |
| 33 | `work` / `mod-economy/subsystems/work-system.ts` | 满意度/晋升进度有界；职业等级受表约束；职业史无界 | 每轮收入、满意度、晋升 | **低中**：职业可见，收入不写经济财富 | 职业史增长；收入为瞬时结果 | 未找到用户确认的源码默认值 |
| 34 | `item` / `mod-economy/subsystems/item-system.ts` | 数量非负；物品集合无容量；默认空 | 公共变更维护物品 | **无**：当前白名单/宏观链不能创建物品 | 休眠集合潜在无界 | 未生效/休眠值 |
| 35 | `culture` / `mod-culture/subsystems/culture-system.ts` | 传统、改革、艺术、价值维度 `0..100` | 每轮演化与宏观调节 | **中高**：提供稳定社会价值背景 | 当前状态替换，有界 | 产品明确授权（宏观影响） |
| 36 | `art` / `mod-culture/subsystems/art-system.ts` | 繁荣/影响/阶段指标有界；无作品级历史 | 文化与时间推进艺术氛围 | **中**：有时代氛围，缺具体作品因果 | 当前状态替换 | 未找到用户确认的源码默认值 |
| 37 | `education` / `mod-culture/subsystems/education-system.ts` | 识字、覆盖、质量 `0..100` | 文明/经济/文化驱动 | **中**：宏观教育条件可消费 | 聚合状态替换 | 未找到用户确认的源码默认值 |
| 38 | `works` / `mod-culture/subsystems/works-system.ts` | 作品列表无容量；传播指标有界；默认空 | 公共变更登记作品 | **无**：当前没有作品登记调用方 | 休眠集合潜在无界 | 未生效/休眠值 |
| 39 | `social-stratification` / `mod-politics/subsystems/social-stratification-system.ts` | 份额/特权/壁垒 `0..100` | 人口和社会状态推进 | **中高**：提供阶层压力与流动条件 | 群体来自初始化，指标替换 | 产品明确授权（宏观影响） |
| 40 | `faction-dynamics` / `mod-politics/subsystems/faction-dynamics-system.ts` | 影响/关系有界；`playerContribution` 无上限；成员数只初始化复制 | 势力初始化、宏观调影响/贡献 | **低中**：势力格局可用，玩家贡献长期失真 | 贡献单调，成员数陈旧 | 未找到用户确认的源码默认值 |
| 41 | `legal` / `mod-politics/subsystems/legal-system.ts` | 执行/腐败 `0..100`；法律列表默认空 | 文明推进与制度调整 | **中**：制度强弱可见，具体法律通常为空 | 核心值替换，法律集合潜在无界 | 未找到用户确认的源码默认值 |
| 42 | `conflict-cycle` / `mod-politics/subsystems/conflict-cycle-system.ts` | 张力有界；冲突列表无容量；默认空 | 推进已有冲突，宏观只调张力 | **无**：没有创建初始冲突的活动路径 | 若有冲突，历史集合无界 | 未生效/休眠路径 |
| 43 | `culture-tech` / `mod-tech-level/subsystems/culture-tech-system.ts` | 成熟/扩散/趋势强度有界；应用列表无淘汰 | 每轮技术文化推进、宏观新增应用/趋势 | **中**：宏观分析可用，主故事 Prompt 显式排除细节 | 应用集合无界 | 未找到用户确认的源码默认值 |
| 44 | `combat-power` / `mod-power-system/subsystems/combat-power-system.ts` | 固定框架阶位有限；开放框架 `rankIndex/ranks` 无上限 | 按时间增加进度并晋升 | **低中**：提供力量标签，但纯时间可晋升 | 开放集合和索引无界 | 未找到用户确认的源码默认值 |
| 45 | `cultivation` / `mod-power-system/subsystems/cultivation-system.ts` | 概率/训练倍率有界；状态可替换 | 计算训练、瓶颈、突破概率 | **低**：天赋字段读取断链，突破不约束战力晋升 | 当前值有界但消费者缺失 | 未生效/休眠路径 |
| 46 | `monster` / `mod-power-system/subsystems/monster-system.ts` | 威胁有界；遭遇记录无界；依赖生态物种 | 从物种派生威胁和遭遇 | **低**：默认生态为空，修正 API 无调用方 | 记录潜在无界 | 未生效/休眠路径 |
| 47 | `fortune-encounter` / `mod-power-system/subsystems/fortune-encounter-system.ts` | 候选过期 **180 天**；冷却普通 **90**、重大 **180**、传说 **365 天** | 冷却归零生成机缘候选 | **低**：候选可出现，但缺接纳调用，可能卡在首个候选 | 单个活动项替换；计数可增长 | 未找到用户确认的源码默认值 |
| 48 | `faith` / `mod-power-system/subsystems/faith-system.ts` | 虔诚 `0..100`；`daysInFaith` 无上限；默认无信仰 | 建立信仰后累计天数/突破修正 | **无**：没有建立信仰调用或突破消费者 | 休眠值无界 | 未生效/休眠值 |
| 49 | `divine-intervention` / `mod-power-system/subsystems/divine-intervention-system.ts` | 严重度有界；神谕/神迹到期；默认空 | 推进活动神迹和神谕 | **无**：无神祇基础实体和写入调用 | 活动项到期；列表潜在无界 | 未生效/休眠值 |
| 50 | `anomaly-phenomena` / `mod-power-system/subsystems/anomaly-phenomena-system.ts` | 不稳定度有界；区域列表无容量；默认空 | 异常区域推进、危险检查 | **无**：无异常创建调用，危险 API 无消费者 | 休眠集合潜在无界 | 未生效/休眠值 |
| 51 | `time` / `mod-engine/subsystems/time-system.ts` | `totalDays`、年份无上限；日/月/季归一 | 每回合按时间步长推进统一时钟 | **高**：所有时间相关剧情的唯一基准 | 核心计数器单调增长，新人生重置 | 产品明确授权（用户确认取消整局硬终止） |
| 52 | `orchestrator` / `mod-engine/subsystems/orchestrator-system.ts` | 无整局 `maxRounds`；`totalRounds`、正文、后台分析、迁移审计无容量 | 编排每轮、接纳正文、触发子系统/AI | **高**：唯一回合总指挥和最大长期容量来源 | 多类数组只追加；存档/Prompt/诊断成本最高 | 产品明确授权（用户确认删除 1000；PD-015） |
| 53 | `narrative-parser` / `mod-engine/subsystems/narrative-parser-system.ts` | `lastResult` 每轮替换，无历史数组 | 解析正文、摘要、分支和数据 | **高**：正文进入游戏前的严格门 | 当前结果替换，历史由 Orchestrator/账本持久化 | 产品明确授权（PD-025/041） |
| 54 | `summary-compressor` / `mod-engine/subsystems/summary-compressor-system.ts` | 4/16/64 轮节点；摘要节点与原摘要无容量 | 生成 L1/L2/L3 时间轴 | **高**：长期剧情连贯性显著提升 | 节点只追加，不减少持久化总量 | 产品明确授权（PD-014/015） |
| 55 | `memory-engine` / `mod-engine/subsystems/memory-engine-system.ts` | 人物、关系、地点、重大事件数组无界；抽取方法当前无调用方 | 理论上从正文/属性抽取记忆 | **无**：未接入活动回合链 | 休眠集合潜在无界 | 未生效/休眠值 |
| 56 | `subsystem-relevance` / `mod-engine/subsystems/subsystem-relevance-system.ts` | `stateHistory`、`changeRecords` 无界；Prompt 可选最近 **3** 轮 | 保存完整快照并过滤相关系统 | **中**：相关性理念有效，但当前回合同步链断开 | 高速集合只追加，`setRound()` 无调用 | 未找到用户确认的源码默认值 |
| 57 | `memory-lifecycle` / `mod-engine/subsystems/memory-lifecycle-system.ts` | L0 可清理；原始记录、搜索索引、统计无容量 | 事件评分、聚合、检索和压缩 | **高**：实际提供长期可检索剧情记忆 | 多类集合增长；压缩不等于总量收敛 | 产品明确授权（PD-014/015） |
| 58 | `memory-forgetting` / `mod-engine/subsystems/memory-forgetting-system.ts` | 配置有界（见 N-07）；因果标记可累积；检查无调用方 | 旧 L1 遗忘公共能力 | **无**：当前时间轴权重由其他系统负责 | 休眠集合潜在无界 | 未生效/休眠值 |
| 59 | `causal-delay` / `mod-engine/subsystems/causal-delay-system.ts` | 30/90/180/365 天；每轮最多 2 件；记录无容量 | 到期触发、呈现、提交处置 | **高**：把早期选择变成可验证后果 | 状态迁移但完整记录保留 | 产品明确授权（PD-025/041） |
| 60 | `plot-structure` / `mod-engine/subsystems/plot-structure-system.ts` | 张力有界、阶段有限；`phaseHistory` 无界 | 根据冲突/信号推进阶段和节奏 | **高**：直接给主 Prompt 结构指导 | 阶段历史只追加 | 产品明确授权（PD-041） |
| 61 | `foreshadowing` / `mod-engine/subsystems/foreshadowing-system.ts` | 分值有界；活动/已解决记录无容量；优先级 **1..10** | 识别、激活、解决伏笔并生成 Prompt | **高**：维持铺垫与回收 | 伏笔记录长期增长 | 产品明确授权（PD-025/041） |
| 62 | `core-memory` / `mod-engine/subsystems/core-memory-system.ts` | 每人物互动记录无容量；关系质量示例 **80**；新人生重置 | 从事件识别关系互动并生成关系网 | **高但重复**：确实辅助连续性，与 NPC/关系形成平行投影 | NPC 互动数组只追加 | 产品明确授权（PD-025）；容量未确认 |

## 七、未生效、休眠或已取代的数值

以下数字在源码或旧存档兼容路径中仍可能出现，但当前活动链不能把它们报告成玩家实际规则：

| 数值 | 所在位置 | 当前状态 | 不能如何解释 |
|---|---|---|---|
| 整局 `maxRounds=1000` | `mod-engine/constants.ts`、`types.ts`、`orchestrator-system.ts` 的旧实现 | **已删除** | 不能解释为整局最大回合数，也不能恢复为“安全上限” |
| `PRE_GEN_CONFIG` 的 `30s / 5min / 2 次 / 2s` | `src/mods/mod-engine/constants/pre-gen-config.ts` | **休眠**；当前 `fillPreGenQueue()` no-op | 不能解释为当前预生成等待、缓存 TTL 或 AI 预算 |
| `useCharacterCreateForm` 的 `30 点、单项 0..10` | `src/mods/mod-pages/pages/character-create/useCharacterCreateForm.ts` | **旧创建路径休眠** | 不能覆盖生效的 PD-012：15 点、单项创建页不设上下限 |
| `TALENT_SELECT_COUNT=2` | `src/mods/mod-character/config/talent-ui-config.ts` | **旧导出且无运行消费者** | 当前普通命格仍是展示 12、选择 3 |
| `memory-forgetting` 的 `16 / 0.7 / 10% / 30%` | `src/mods/mod-engine/subsystems/memory-forgetting-system.ts` | **公共能力休眠**；当前主链由摘要/记忆权重管线负责 | 不能作为当前每 16 轮自动遗忘规则 |
| `fate-prophecy`、`divine-creation`、`item`、`works`、`faith`、`divine-intervention`、`anomaly-phenomena` 等默认空集合的上限/概率 | 各活动子系统 | **已注册但无活动写入或消费链** | 源码存在不等于玩家当前可见效果，也不等于已授权产品功能 |

## 风险归纳（只报告，不在本任务修复）

| 风险面 | 证据 | 当前影响 |
|---|---|---|
| 业务数值无界 | `morality.value`、`economy.totalCirculation`、`settlement.population`、`settlement.yearsInCurrentTier`、`faction-dynamics.playerContribution`、开放力量阶位、`climate.temperatureOffset`、寿命/年龄与时间计数器 | 长局可能漂移到标签设计量级之外，跨系统比较和结算解释变得不可信 |
| 历史集合无界 | Orchestrator 正文/分析、历史账本、关系转变、NPC 记忆、地理变化、交易、成长/声望记录、摘要节点、记忆索引、因果、伏笔、核心记忆等只追加 | 存档、Prompt 派生、SQLite 和日志成本随人生长度增长；云存档最终可能撞 64/16 MiB 门禁 |
| 重试叠加 | A-03、A-05、A-08、A-10、C-05 | 单次玩家动作的真实 Provider 请求数与等待时间不易从页面数字推断，费用/限流风险高 |
| 生成交接冲突 | C-02、C-04、C-06 | 产品要求“12 条后才能进入”，但有限后台批次结束后的 3 秒不足分支可能提前失败；本次没有修改 |
| 平行状态真源 | 聚落人口 vs 全局人口、工作收入 vs 经济财富、势力成员数初始化复制、修炼天赋/战力链、核心记忆 vs NPC/关系 | Prompt 可能接收互相矛盾的事实，降低剧情辅助质量 |
| 休眠系统噪声 | 第 7 节所列旧配置和空壳系统 | 后续维护者可能误接旧入口，重新引入未确认的限制或第二真源 |
| 诊断数据丢弃 | S-17 的 80/512 队列淘汰、S-18 的日志保留/归档策略 | 会降低事故证据完整性，但不应改变玩家剧情事实 |

## 与既有审计的关系

- [`simulation-system-audit-2026-08-06.md`](simulation-system-audit-2026-08-06.md) 保存 62 个成员的完整输入、状态变化、下游消费、断链证据和剧情辅助结论；本报告只提取其中的数值边界与长期趋势。
- 本报告不改变 `p8` 活动成员、不调整任何公式、Prompt、AI 调用、公共 API、持久化 Schema 或玩家可见运行行为。
- 本报告不能把“有界”解释成“已获得产品授权”，也不能把“无界”解释成“本任务已批准修复”；任何后续参数或行为变更都必须重新列范围、说明影响并取得确认。
