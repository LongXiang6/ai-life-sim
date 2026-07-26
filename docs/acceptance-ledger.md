# 项目验收账本

文档角色：验收历史源记录
状态：按需读取
适用范围：已记录的验收结果、回归证据和发布历史
运行真源：各章节列出的 live source

本文件只提供验证事实，不新增产品或执行规则。通过 `docs/authority-index.md` 选择相关章节，不要整篇加载。当前用户要求高于本文件。

## 1. 使用规则

1. 本文件只证明实现是否符合更高层权威，不定义新的产品语义。
2. 当前行为冲突时按 `AGENTS.md` 和活动权威树处理；本账本只用于核对已记录证据。
3. 每项只保留结论、关键边界、可重复检查和仍存在的限制；逐轮故事、完整 Prompt、响应、截图和命令全文不进入活动文档。
4. 被取代记录只保留一行关系，不能恢复成当前指令。

## 2. 当前有效验收

<a id="narrative-compression"></a>

### 2.1 叙事压缩与无硬截断

| 字段 | 结论 |
|---|---|
| 对应权威 | `PD-014`、`PD-015`、`PD-017` |
| 运行真源 | narrative protocol、RoundCommit、summary compressor、memory lifecycle、检索索引 |
| 当前结果 | 原始叙事与低层叶子不因容量、字符数或固定条数删除；L1 每5轮成块，在第5、10轮等完整块结束后立即后台生成；高层摘要只有在完整标记与非空内容通过后建立覆盖；失败时保留全部低层内容并继续尝试最早的未覆盖块 |
| 提交边界 | 未知字段、非法系统、不可写目标或任一状态写入失败使整包 META 失效并回滚；合格正文与可选摘要仍保留 |
| 检索边界 | 高层摘要继承实体与最高重要度；Prompt 通过覆盖区间选择叶子，固定保留最近5轮完整原文；低重要度旧日常退出常驻投影但仍保留在账本、原始历史和摘要检索中 |
| 自动证据 | `npm run test:compression-runtime`、`npm run validate:narrative`、`no-hard-truncation-audit.mjs`、完整 gate |
| 已知基线 | `check:mod` 的历史迁移扫描问题必须独立报告，不得把未执行或既有失败描述为全绿 |

<a id="narrative-protocol"></a>

### 2.2 主叙事协议、推理与命运分支

| 字段 | 结论 |
|---|---|
| 对应权威 | `PD-009`、`PD-010`、`PD-016`、`PD-017` |
| 运行真源 | server narrative Prompt、中文协议解析器、Zod Schema、orchestrator |
| 当前结果 | 输出顺序为 `正文 → 可选摘要 → 可选数据 → 结束`；1 段、5 段或其他自然段数都可直接消费，不因段数重写或重排；普通轮缺少摘要、数据缺失或数据非法时仍保留完整正文，数据整包拒绝；当前命运意图仍执行条件必填，玩家强制分支缺失时改由独立标题/选项 Schema 后台补救并合并到同一故事条目 |
| 注意力与成本 | Prompt `4.6.1` 将固定 system 前缀稳定在身份、事实权威、因果、文风与基础协议；世界事实、记忆和本轮状态继续完整动态投影，首轮来历、时间尺度、意图、分支与修复规则只在生命周期命中时加载；末尾 `round-output-contract` 就近重申本轮最高优先级约束；近期完整原文固定5轮，账本不重复注入近期原文，低重要度旧日常动态卸载。完整正文立即提交，强制分支后台调用只接收已提交正文且只允许标题与二至四个选项，不重发全局、记忆、本轮三层 Prompt或完整叙事 Schema |
| 数据完整性 | 速度优化不得按字符、固定条数或容量裁切剧情事实、关系、伏笔、玩家设定或摘要；动态卸载只作用于本轮不适用的规则组件，不作用于当前需要的事实投影 |
| 空值边界 | 无内容字段应省略；兼容层只归一无语义空数组、`false` 和空条件对象，不补剧情、不猜字段、不截断正文 |
| UI 边界 | 流式界面只显示正文，不展示摘要、数据、协议标记或修复内容 |
| 自动证据 | `npm run test:narrative-protocol`、`npm run test:prompt-wiring`、`branch-intent-resolution-smoke.mjs`、`runtime-subsystem-state-regression.mjs` |
| 模型证据 | DeepSeek `deepseek-v4-flash` 真实 430×932 全流程完成 4 段正文、强制分支后台补救、预设选择和选择后继续推进；5 次代理请求中 1 次为独立分支补救，正文未因条件 META 失败而延迟 |

<a id="narrative-repetition"></a>

### 2.2.1 叙事重复率与非阻塞修复

| 字段 | 结论 |
|---|---|
| 对应权威 | PD-009、PD-015、PD-038 |
| 运行真源 | mod-engine 的 EngineState.storyRepetitionStats、逐条 NarrativeChunk.repetitionMetric、默认 campaign 后台修复链 |
| 当前结果 | 每局生成不含账号的 lifeRunId；每轮使用中文分词/正则 fallback 计算词语重复率，并和近五轮逐轮比较词集合重叠率、字符 n-gram 相似度、趋势与峰值。历史正文完整保留，日记显示近五轮指标，结算页显示整局摘要。 |
| 修复边界 | 正文先提交；重复或阶段回退只触发一个受控后台候选。候选必须通过完整中文协议信封、严格 Schema、近期不重复，以及独立事实审计的逐项完整覆盖证据；任一遗漏、冲突或空证据都保留原正文。预生成候选消费前执行同一重复门禁；修复不新建回合、不重放 META、不阻塞玩家。 |
| 运营投影 | story_repetition 只记录匿名数值指标与 lifeRunId，analyze-ai-logs.mjs/inspect-ai-logs.mjs 提供整局和玩家诊断摘要；日志不是故事或账号状态真源。 |
| 自动证据 | npm run test:narrative-repetition-metrics、narrative-repetition-smoke.mjs、log-analytics-smoke.mjs、branch-intent-resolution-smoke.mjs、no-hard-truncation-audit.mjs |
| 历史对照 | `docs/legacy-simulation-mechanism-comparison.md` 已逐机制确认：本次问题位于现行分支/叙事链，不应把废弃项目的同步域循环、正文正则推断或无界公式迁回。 |

<a id="managed-ai-longcat"></a>

### 2.3 LongCat 默认模型与服务端 Prompt 资产

| 字段 | 结论 |
|---|---|
| 对应权威 | `PD-018`、`PD-030`、`PD-031` |
| 运行真源 | Provider 配置、server target/credential、主生成与精简修复 server Prompt assets、AI proxy、设置页 |
| 当前结果 | 新玩家、空旧配置和恢复默认均选择 `managed / LongCat-2.0`；旧 a6api 通道保留为可选项；玩家可以使用自己的 API Key |
| 生产复核 | 2026-07-23 活动 release `4962bcb` 曾因发布复制遗漏托管变量导致三个 Provider 状态均不可用；已从服务器既有私有环境安全恢复 `LONGCAT_*`、`MANAGED_A6_*`，重启 PM2 后 `managed` 与 `managed-a6` 均返回 `configured:true`，两条预设 POST 均返回完整正文。新增 `npm run ops:validate-production-env` 作为激活前硬校验。 |
| 保密边界 | 浏览器只显示预设名称和模型，不显示托管 API 地址、凭据、固定核心 Prompt、内部组件文本或导出入口 |
| 分工 | 浏览器承担动态投影、缓存、序列化、解析、Schema 校验、预检、提交与回滚；服务端只做资产白名单、唯一 system 消息注入、Provider/凭据路由、转发和受限诊断 |
| 拒绝路径 | 未知资产、客户端 system 消息、未登记自定义目标接收受保护资产均返回 400，不静默回退 |
| 自动证据 | `npm run test:managed-ai-default`、`npm run test:ai-proxy`、`npm run test:protected-prompt-bundle`、`npm run test:narrative-protocol` |
| 真实模型 | LongCat 返回过完整正文、摘要与结束协议；保留 a6api 凭据曾返回 401，恢复有效凭据前不能宣称该可选通道可调用 |

<a id="production-observability"></a>

### 2.4 生产可观测性、结构化日志与玩家反馈

| 字段 | 结论 |
|---|---|
| 对应权威 | `PD-019`、`PD-020`、`PD-021`、`PD-022`、`PD-023`、`PD-024` |
| 运行真源 | AI proxy、server log store、player feedback store、diagnostic identity、operator inspector |
| 当前结果 | 固定字段 JSONL 保存可筛选元数据；完整脱敏长文本写入 SHA-256 命名的 gzip 内容库并去重；全局、IP、六位玩家编号、请求 ID 与反馈 ID 可关联同一批记录；反馈处理状态通过独立追加事件记录并由检查器派生 |
| 隐私边界 | API Key、Authorization、Cookie、密码、Token、设备序列号和硬件 ID 不保存；玩家编号是服务器签发的诊断别名，不是账号、鉴权或设备指纹 |
| 反馈边界 | 明确同意后上传完整脱敏诊断包、非秘密配置、近期完整故事、游戏状态与环境快照；任一校验或持久化失败整包拒绝 |
| 查询边界 | 默认查询不展开 Prompt、响应、故事或反馈正文；授权运维明确加 `--include-content` 才还原脱敏内容 |
| 保留策略 | `AI_LOG_DIR=/var/log/ai-life-sim`；默认 30 天、10 GiB、单文件 64 MiB；目录 `0700`、文件 `0600` |
| 宏观统计 | `npm run logs:analyze` 按窗口输出聚合流量、状态/错误、延迟、页面访问、时间步长、分支类型与达到 3 次以上的高频词；不输出 IP、诊断编号、账号、Prompt 或故事正文 |
| release 空间 | release 根目录默认最多 5 个；72 小时浸泡/健康门禁后按最旧优先清理，并每日对不可变依赖与静态产物做内容级硬链接去重 |
| 错误处理 | 401/403 及其他确定性 4xx 不会重试；内容审核拒绝向玩家显示明确的处理建议与请求 ID；仅 408、429、5xx 等暂态故障有限重试，诊断日志只保留状态、尝试次数和请求 ID，不复制上游响应正文 |
| 自动证据 | `npm run test:ai-proxy`、`npm run test:player-feedback`、`feedback-status-smoke.mjs`、`diagnostic-player-code-smoke.mjs`、operator reconstruction smoke |

反馈提交成功只代表完整诊断包已持久化，不代表已经处理。当前状态从无事件的 `new` 开始，由私有运维命令追加 `in_progress`、`resolved`、`rejected`、`duplicate` 或 `reopened` 事件；`resolved` 必须带解决证据，原始反馈正文不被覆盖。

<a id="narrative-pressure"></a>

### 2.5 叙事变化驱动力与机构介入

玩家反馈中“每轮都不顺”的频率描述并不完全准确，但生产样本和旧 Prompt 确认存在结构性偏置：检查、登记、复核和认证被高频当成默认变化来源。当前规则允许机会、掌握、成果、认可、休整、关系回暖、成功和合理冲突共同推进；新能力只有在世界规则或前序因果成立时才触发机构介入；已解决障碍不得换名复用；开局不默认贫困、羞辱、资格审查或被针对。

固定 Prompt、动态提示、时间尺度、情节结构和格式修复回归通过；每轮末端契约明确压力与拖延不是默认推进，允许安心发育、学习、休整、成果兑现和关系回暖。DeepSeek 四类切片分别覆盖无监管能力兑现、合理复核、结案后转向新机会和稳定家庭开局。

<a id="player-exclusive-opening"></a>

### 2.6 玩家专属设定与首轮来历

诊断编号 `U4Q32L` 的两项问题均有生产证据：专属异界能力曾被改写为当地通用能力，三次首轮曾无依据跳过数周或数月。当前规则要求保留能力来源、名称、边界和事实归属；NPC 可以误解，但叙事真相不能被误判偷换。穿越或跨世界首轮必须说明触发、直接后果、最初处境与首段关系；本地原生角色必须建立现场、家庭、职责或关键关系。只有玩家明确要求中途开场时才允许跳时，并补足必要过渡。

首轮来历规则只在首轮动态加载，并在末端本轮契约再次强调：穿越角色必须呈现抵达及直接后果，原生角色必须建立当前生活的因果起点，不得无依据跨越数周或数月。确定性协议回归和专属能力、当地误解、穿越抵达、原生角色、明确中途开场五类语义切片通过。验收不在文档复制玩家完整故事、Prompt 或响应。

<a id="attribute-allocation-creation"></a>

### 2.7 四项属性分配创建链

活动创建流程在命格确认后进入 `/attribute-alloc`：新人生拥有 15 点预算，在体魄、心智、悟性、魅力四项间以每项 `0—10` 分配；未用完点数只在明确确认后保留。确认值由 `character-base` Store 持有，并在命运预览、orchestrator 上下文和首轮提交中保持一致。命格、种族、伤病和其他合法来源继续以独立 modifier 聚合，不占自由预算；后续变化只能由主叙事合法增量经 `character-base` 校验、钳制、提交和持久化。旧存档的既有值不被静默压缩。

`test:creation-first-narrative`、UI、TypeScript、浏览器 430×932 全流程和 320—1180px 响应式切片通过；旧存档不被批量重写。新增真实浏览器分支回归覆盖普通选择、自定义文本、后台分支补救、模型不可用页面内错误和 120 字自定义世界名称完整保留；均无原生弹窗、控制台错误或横向溢出。

移动端方案库现串联欢迎、账号、世界、角色、命格、轮回天赋、属性、预览、模拟、结算、设置、说明和反馈共 14 个页面，并以 Pro Max `430×932` 观察框展示。方案库以单一可重置 session state 传递世界、角色、十二项命格候选、两项轮回天赋与属性预览数据；运行时已按当前定版落地 15 点四项基础属性分配，旧存档值保持兼容。既有页面保留原定版背景、主题、配色、纹样、光效、布局和控件比例。欢迎、世界选择、世界配置的真实点击串联与 430×932 布局通过浏览器验证。

2026-07-23 `ui-sync-5` 原型收束验收：`flow.html` 使用统一 `20260723-ui-sync-5` revision 串联 10 个主流程页面与 4 个辅助页面；欢迎 → 世界选择 → 世界配置真实点击链在 430×932 通过，`scrollWidth = 430` 无横向溢出。命格选取页的固定卡槽、完整描述滚动和已选轮回天赋点击移除均有回归断言；运行时属性页已对齐 AA-RF1-1 的预算、四条渐隐轴、命格加成和统一底栏结构，并注册方案库使用的 `/new-game/*` 别名。

2026-07-24 `ui-sync-16` 玩家路径复核：运行时实际采用串联版 01—08 页码、十二候选命格、三普通槽、双轮回槽、15 点四维属性与统一底栏；Puppeteer 在 320、360、375、390、430、768、1280px 完成分支路径，`scrollWidth` 与控制台均正常。模型配置不可用时改为页面内 `role=alert` 错误，不再调用原生 `alert()`；自定义世界名称取消语义 `maxLength` 并显示非破坏性字数计数。

<a id="game-over-sharing"></a>

### 2.8 人生结算分享

结算页在既有事实展示、结构化大事和轮回天赋之后提供“留下此生”：本机 Canvas 生成完整 PNG，优先使用 Web Share，能力不可用时降级下载。数据只来自角色名、世界、年岁、轮数、品性、人生评分、四维、已确认分支/突破大事和当前轮回天赋；不从正文编造成就，不上传正文、Prompt、API 配置、诊断编号、日志或设备信息，也不修改存档与模拟状态。

320—1280px 响应式、1080px PNG、长文本换行、零值轨道、系统分享、下载降级、控制台、自动 UI 检查和 5.2.0 生产发布后路径均通过。

### 2.9 生产反馈修复的本地验收

`5.2.2` 本地修复覆盖三条已证实缺陷链：自定义 DeepSeek 模型与官方 DeepSeek 在流式/非流式、启用/关闭推理时使用一致的 `thinking.type` 契约，非 DeepSeek 自定义模型不继承内部预算字段，确定性 400 只发一次请求；新人生 reset 或显式读档会使旧自动存档生命周期失效，即使旧写入已开始替换槽 0，也会通过目录事务恢复原 payload 和索引；重复叙事修复候选只有再次通过完整协议门禁且不再文本重复或无因果回到准备阶段时才可替换上一版。

自动证据包括 `test:ai-proxy`、`test:new-life-isolation`、`test:narrative-protocol`、`test:player-feedback`、`autosave-lifecycle-smoke.mjs`、`narrative-repetition-smoke.mjs` 和 `feedback-status-smoke.mjs`。本段记录本地修复链；其生产结论已由 2.13 的 `5.3.2` 发布验收取代。

<a id="account-cloud"></a>

### 2.10 可选账号、云同步与长期角色设定

账号云同步的确定性验收已覆盖：用户名 NFKC/大小写防重、非法字符、保留名和扩展违禁词；密码长度与两次确认；scrypt 哈希、会话 Token 哈希、AES-256-GCM API Key 密文与错误密钥拒绝；SQLite WAL Schema、Linux 主库/WAL/SHM `0600` 权限、revision 冲突、数据库重开严格恢复、30 天清理边界与子表级联；轮回天赋和战绩第 11 项整包拒绝；未知故事正文/Prompt 字段拒绝；角色姓名、性别、种族、背景、四维、寿命、起始年龄、自定义选项和背景预设逐字恢复。

新人生隔离回归证明本局叙事、运行角色、世界和下游创建草稿仍被清理，而版本化长期角色设定保持不变；恶意或未来版本本地 hydration 被丢弃，同内容云快照不会重复触发同步。`npm run test:account-cloud`、`npm run test:new-life-isolation` 和 `account-cloud-browser.cjs` 已通过；真实本地 API 浏览器路径覆盖注册、加密 Key、退出清 Key、本地篡改后登录云覆盖、角色逐字段回填、账号删除、零控制台/5xx 与 320/390/768/1280px 无横向溢出。生产配置、权限、清理 timer 和真实云存档路径的当前结论见 2.13。

<a id="shared-qq-community"></a>

### 2.11 QQ 验证身份与共享积分

主项目账号 SQLite 已增加分类的 QQ 绑定、nonce、积分账户、账本、签到、群成员投影和幂等结果表。Bot 只获得回环 HMAC 白名单 API，不能读取账号设置、Key、角色设定、天赋/战绩内容、故事或日志；注册 QQ 仍是未验证联系方式，一次性绑定码成功后才建立一对一可信身份。

`npm run test:account-cloud` 已覆盖十分钟绑定码、签名、过期/重放、纯回环转发头放行与混合/公网转发拒绝、上海日期跨日签到、转账守恒、负余额拒绝、账号积分投影、相同请求重试和同幂等键参数漂移冲突。Bot 仓库由另一任务按 `qq-bot-integration-contract.md` 接线，本条不把尚未完成的 Bot 命令适配描述为已完成或已部署。

<a id="game-over-reincarnation"></a>

### 2.12 人生评分、大事与轮回天赋

结算纯函数已覆盖通用评分：原始分低于 95 时宽松映射且最高 94，原始分达到 95 后正常四舍五入；一个包含实际旅程和已解决选择的完整基准局达到 80 以上。评分先确定余响、深刻、传世、不朽档位，再连同完整允许的人生记录交给 Prompt 1.2.1，候选保存来源分数与档位。

确定性回归证明大事只来自 `resolvedChoice` 和生命突破，代表大事按结构化权重稳定选择并进入分享事实；轮回天赋与命格详情不再使用行数裁切。`game-over-share-card-smoke.mjs` 和 TypeScript 已通过；完整 UI、叙事硬截断、浏览器 320-1280px 与交付关闸在本任务最终验收中继续执行。

<a id="player-content-operations"></a>

### 2.13 登录玩家内容与运营面板

每个已认证账号拥有一个独立覆盖式云端手动栏位；gzip 只消除存储冗余，完整故事经 SHA-256 校验后逐字恢复，未来 Schema、损坏压缩包和失败覆盖均拒绝且保留旧存档。欢迎页把本机 `timestamp` 与云端 `updatedAt` 统一排序，玩家可从存档面板读取或删除云端人生。

排行榜后台仅投影轮数严格大于 100、分数严格大于 97 的最佳局，按分数降序、同分轮数降序；分数恰为 100 的人生至多创建一个画像任务。排行榜、邮箱和绘图默认关闭，关闭态不调用供应商、不投递邮件且路由不暴露玩家数据。绘图适配器只访问解析为公开地址的 HTTPS 主机，只接受经文件签名确认的 PNG/JPEG/WebP，并对响应体执行流式大小限制；数据库只保存 Prompt 摘要、任务状态和受控资产索引，不保存完整故事、Prompt、供应商原始响应或 Key。

运营面板通过 `ai-life-sim-operations-dashboard.service` 只监听 `127.0.0.1:4317`，按需聚合既有日志、账号库和玩家内容库，输出访问、分时、注册、登录活跃、云存档与隐藏队列计数。确定性测试证明页面/API 不包含账号名、QQ、IP、诊断编号、故事、Prompt 或 Key；本地通过 SSH 隧道访问，不加入 Nginx 或 UFW 公网入口。

自动证据包括 `npm run test:account-cloud`、TypeScript、受影响文件 Lint、无硬截断审计、结构/UI/完整交付关闸和账号云存档浏览器路径。

生产验收于 2026-07-23 在 `5.3.2` release `db86ff9` 完成：活动 symlink 与 PM2 cwd 均指向该 release，Next.js 只监听 `127.0.0.1:3000`；Nginx 配置通过，HTTP 正确跳转 HTTPS，两个域名与版本资源均正常。排行榜、邮箱和画像路由在关闭态均返回 `404`。公网浏览器路径覆盖注册、登录、完整 gzip 云存档覆盖与逐字回读、退出清 Key、删除存档、删除账号、320/390/768/1280px 以及零控制台/5xx；清理测试数据后运营面板显示注册账号 `1`、近 24 小时活跃账号 `1`、云存档 `0`、合格排行榜账号 `0`、待处理画像 `0`、已投递邮箱 `0`，账号库和玩家内容库的 SQLite 主库/WAL/SHM 均为 `0600`。账号与 release 清理 timer 已启用，账号清理 service 实跑成功，release 清理 dry-run 因活动版本未完成 72 小时浸泡而正确跳过。运营面板持续监听 `127.0.0.1:4317`，本机 SSH 隧道 `127.0.0.1:4320` 返回 `200`；生产日志未发现本次新增代理、客户端、调试或反馈问题，也没有待标记完成的玩家反馈。

<a id="fate-branch-custom-choice"></a>

### 2.14 自定义命运分支的条件 META 失败恢复

`LastVerified: 2026-07-23`

`Authority: PD-016, PD-017`

`RuntimeSource: src/mods/mod-engine/helpers/narrative-response-quality.ts; src/mods/mod-engine/campaigns/default/index.ts; src/mods/mod-engine/helpers/pre-gen-queue.ts; src/mods/mod-engine/hooks.ts; src/mods/mod-ui/components/organisms/NarrativeTimeline.tsx`

`Result: pass`

`Evidence: branch-intent-resolution-smoke.mjs 运行级玩家路径（含标准信封、非法条件数据、强制分支和 body-only 降级）；test:branch-flow:browser（真实 Puppeteer 选项点击、确认、历史 resolvedChoice 与下一次请求，等待第二条叙事落盘）；runtime-subsystem-state-regression.mjs；narrative-chinese-protocol-regression.mjs；no-hard-truncation-audit.mjs；DeepSeek deepseek-v4-flash 全流程浏览器切片；5.3.4 release 4962bcb 独立构建、旁路与原子切换；公网 HTTPS 分支浏览器回归；ESLint；TypeScript`

`KnownLimitations: 若模型持续不返回合法命运意图或强制分支 META，相关状态保持 pending 并由预生成或后续轮次继续请求；本轮不会伪造成功、失败、进度或分支结果。只有正文/结束标记不完整时仍会同步进行一次最小协议修复。`

`Supersession: 取代此前“条件 META 失败后整轮回滚并抛出生成失败”的运行实现；产品语义仍以 PD-016/PD-017 为准。`

<a id="deepseek-legacy-comparison"></a>

### 2.15 DeepSeek 全流程与废弃版本基线对比

`LastVerified: 2026-07-25`

`Authority: PD-016, PD-017, blueprint-02 P0-P8`

`Result: pass with known capability gap`

`Evidence: 官方 Provider=deepseek、Model=deepseek-v4-flash；真实浏览器创建→十二候选命格→两项转世天赋→15点四维属性→命运预览→4轮主叙事，4次代理请求均无客户端 Key、4条正文写入、零控制台错误；BAL-01—04 压力切片全部通过。`npm run test:legacy-simulation-probe` 使用共享 Mulberry32 seed 20260724、每年固定 market→population 调用顺序；market 输入 month=(year%12)+1/luck=0/years=1，population 输入 initial=5000/years=1/prosperity=0/disasterCount=5/war=false，100 次结果为 priceIndex=547368166042059970、population=50、growthRate=-0.2。该人口输入是刻意的每年5场灾害 stress fixture，不是正常玩家局预测。新版纯规则100轮为0异常、totalDays 365→36500、13个 external+12个 engine 注册稳定。`

`Comparison: 废弃项目库存有51个 `*-system.ts` 叶子文件，其中45个由三个 domain 直接引用，另外6个走初始化/Prompt格式化/叙事报告后处理或仅 barrel 导出；旧 `SystemContext` 声明53个字段（orchestrator 注释口径为39个配置驱动字段+14个特殊字段），缺少 contextId/scope/能力画像/原子历史账本。新版以唯一 TimeSystem、Orchestrator 阶段机、作用域能力画像和 P1 历史事件账本为运行权威；`src/mods/**/subsystems/**/*-system.ts` 共77个文件，其中13个 external+12个 engine=25个 active，其余52个 non-active。`memory-engine` 虽在 active 注册表中，但正文/属性正则提取没有当前调用且不得恢复；结构化关系实际由 orchestrator 提交给 `core-memory`。完整逐项处置见 `docs/legacy-simulation-mechanism-comparison.md`。`

`KnownBaseline: 2026-07-25 复核的 `npm run check:mod` 完整日志为258项 FAIL；相对此前可比完整输出270项，消除12项且新增0项。runner 显示的80是输出上限，不是实际失败总数；本地滚动报告不是长期权威引用。因此本节不宣称 MOD 全绿。`

`Required follow-up: 恢复 P5-P7 时必须沿用 core/shared 平衡入口，为人口、价格、资源和健康等宏观指标登记范围、单调性与速率上限，使用确定性/均值回归并把变更作为历史账本原子批次提交；不得直接迁回旧版三大域或其无上限公式。`

<a id="preset-mobile-flow-production"></a>

### 2.16 预设通道与移动端串联创建流生产验收

`LastVerified: 2026-07-23`

`Authority: PD-018, PD-030, PD-031, PD-016, PD-017`

`RuntimeSource: src/core/ai-service/server-provider-credentials.ts; src/core/ai-service/server-provider-targets.ts; src/app/api/proxy/route.ts; src/mods/mod-pages/manifest.ts; src/mods/mod-pages/pages/attribute-alloc/page.tsx; scripts/ops/validate-production-env.mjs`

`Result: pass`

`Evidence: 2be5f58 release 已原子切换为活动版本；生产环境校验、PM2、回环 3000、Nginx、HTTP→HTTPS、两个预设 GET configured 与公网 POST 均通过。managed / LongCat-2.0 线上 Puppeteer 全流程完成角色创建→12 候选命格→2 项转世天赋→15 点四维属性→命运预览→4 轮主叙事，4 次请求、4 条正文、无客户端 Key、零控制台错误；公网分支 Puppeteer 验证点击后第二次请求、旧记录 `resolvedChoice` 与 2 条历史正文；`check:structural`、`check:ui`、`gate-check`、Lint、TypeScript、managed AI、proxy、叙事协议与无硬截断审计通过。`

`KnownLimitations: 官方 DeepSeek Provider=deepseek、Model=deepseek-v4-flash 已在本地隔离环境使用临时 Key 完成真实全流程；该 Key 未写入生产环境，生产选择 DeepSeek 仍要求玩家提供自己的 Key。`check:mod` 的当前完整基线见 2.15：258 项 FAIL，相对旧完整输出 270 项消除 12 项且新增 0 项；不宣称全局全绿。`

`Supersession: 取代 5.3.4 只记录分支与叙事修复而未记录预设环境和串联创建流生产证据的结论。`

<a id="mobile-flow-ui-sync-20260724"></a>

### 2.17 移动端串联定版 UI 运行时替换

`LastVerified: 2026-07-24`

`Authority: PD-008, PD-011, PD-012, PD-015`

`SelectedSources: docs/ui-prototypes/mobile/character-create/round-15-ws-b1-adaptation.html; docs/ui-prototypes/mobile/talent-draw/round-refactor-18-rf17-2-b1-adaptation.html; docs/ui-prototypes/mobile/mythic-inheritance/round-14-legacy-layout-b1-rebirth.html; docs/ui-prototypes/mobile/attribute-alloc/final.html; docs/ui-prototypes/mobile/fate-preview/round-refactor-01-style-1.html`

`RuntimeTargets: character-create, talent-draw, attribute-alloc, fate-preview`

`Result: pass (local pre-release)`

`Evidence: 运行时创建链已按 flow.html 的连续顺序落地：角色创建三段纵向流 → 云紫光环与十二道命印 → 两个轮回天赋槽、三个普通命格槽与十二候选卡片 → 15 点四项基础属性 → 基础值/命格加成分离的命运预览。AI 模式保留 5 条早进与后台补齐，预设模式只在关闭 AI 命格时可用；候选描述完整呈现，不使用 line-clamp 或故事语义硬截断。Puppeteer 真实点击覆盖 320、360、375、390、430、768、1280 宽度，分支确认产生第二次请求、旧选择写入历史且控制台无错误；模型不可用、120 字自定义世界名、自定义分支文本和后台分支补救夹具均通过。官方 Provider=deepseek、Model=deepseek-v4-flash 在 430×932 完成 4 次主叙事 + 1 次后台分支补救，4 条正文落盘，分支确认与后续叙事成功。`

`IntentionalRuntimeAdaptations: AI 首屏等待、后台补池、错误提示、重抽未选和轮回天赋底部抽屉属于运行时缺失功能补充；抽屉只从两个定版轮回槽打开，未增加独立主工具条。`

`ForbiddenDeviationCheck: 已移除运行时 TalentAstrolabe 及其 286px 星盘/48px 星位主构图与旧 Tab 交互；旧叙事质量回归断言已同步到十二道命印、双轮回槽和三普通槽。`

`Gates: npm run check:structural; npm run check:ui; npm run gate-check; npm run check:changelog; npm run test:narrative-protocol; npm run test:managed-ai-default; npm run test:ai-proxy; TypeScript; no-hard-truncation-audit.mjs; branch-intent-resolution-smoke.mjs; branch-flow-browser.cjs across seven viewports.`

`KnownLimitations: 本节是本地发布前证据，尚未替代 2.16 的生产发布记录；`check:mod` 的当前完整基线见 2.15，不把 runner 的 80 项输出上限误写为总数。`


### 2.18 轮回天赋改名与选取页光效锁定

日期：2026-07-24

玩家可见名称由“转世天赋”统一更新为“轮回天赋”。内部 `mythic*` 标识、持久化字段和存档契约保持兼容，不新增第二数据结构。命格选取运行时继续保留方案库要求的候选卡呼吸光、普通槽稀有度呼吸光、轮回槽流彩/光晕、底部抽屉升起与抽取命印波纹；`mobile-ui-regression` 已把这些光效选择器与文案术语列为硬断言。该定版内容已随 `3aa346faa14c84f767d7f4b4cd81bf91999e64bc` 完成生产切换，详见 2.19。

### 2.19 5.3.6 生产发布与 release 保留

`LastVerified: 2026-07-24`

`Authority: PD-016, PD-017, PD-021, PD-030, PD-031`

`RuntimeSource: /root/ai-life-sim -> /root/ai-life-sim-releases/3aa346faa14c84f767d7f4b4cd81bf91999e64bc; PM2 ai-life-sim; Nginx -> 127.0.0.1:3000`

`Result: pass`

`Evidence: Linux Node 20 gate-check 与 production build 通过；3001 旁路首页、静态资源、版本、诊断接口和关闭态排行榜通过；本机 Chrome 通过旁路串联创建/命格/属性/命运预览与分支确认，实际 3000 分支回归为 2 次请求、历史 resolvedChoice 写入、2 条正文、控制台 0 错误；PM2、回环 3000、HTTPS 两域名、HTTP→HTTPS 跳转和版本 5.3.6 均通过。`

`Retention: 按本次明确的发布后清理要求，切换完成并确认健康后，发布根从 37 个目录清理为当前 release 与上一版 `2be5f58` 两个目录；3001 旁路已停止，release 根占用从约 5.8G 降至约 1.1G。日常 release cleanup timer 仍按 PD-021 的 72 小时保护规则运行；release/account cleanup timers 与回环运营面板保持 active。`

`KnownLimitations: `check:mod` 的当前完整基线见 2.15：258 项 FAIL，相对旧完整输出新增 0 项；PM2 历史日志中存在切换前旧客户端触发的 Server Action warning，不作为本次发布新增故障。`

### 2.20 移动端语义图标与人生结算底栏定版

`LastVerified: 2026-07-24`

`Authority: PD-008, PD-011, PD-012`

`SelectedSources: docs/ui-prototypes/mobile/flow.html; docs/ui-prototypes/mobile/assets/library.css; world-select/round-20-ws-rf23-b1-adaptation.html; world-customize/round-07-ws-b1-adaptation.html; character-create/round-15-ws-b1-adaptation.html; attribute-alloc/final.html; fate-preview/round-refactor-01-style-1.html; game-over/final.html; account/final.html; feedback/final.html`

`Result: pass (production)`

`Evidence: 正式运行时已同步世界预设、世界规则、角色三分区、四维属性、命运预览、结算指标、账号真实条件区域和反馈字段的定版语义图标；命格抽取/选取、设置、说明和欢迎页保持无新增图标。内置 Browser 在 430×932 确认账号与反馈页 scrollWidth=430、零元素越界，图标均 aria-hidden。Puppeteer 创建链在 320、360、375、390、430、768、1280 七个视口真实完成十二候选、选三项、两个轮回天赋、15 点四维、预览、叙事与分支确认；320px 长命格文案曾暴露候选卡纵向重叠，现以内容高度行修复，并由卡内内容边界与相邻卡片碰撞断言覆盖。结算页七视口 scrollWidth 均等于视口，底栏固定 56px、返回按钮 38px、主操作 48px、箭头 28px，返回故事与二次确认开启新人生均通过且零 AI 请求。官方 Provider=deepseek、Model=deepseek-v4-flash 在 430×932 完成 4 次主叙事、1 次后台分支补救、4 条正文落盘、分支点击确认与后续推进；浏览器请求/存储无 Key，控制台零错误。npm run lint、TypeScript、npm run check:ui、npm run check:changelog、npm run check:structural、npm run gate-check、no-hard-truncation-audit.mjs 与 git diff --check 通过；lint 仅保留未改动叙事文件的 1 条既有 unused 参数 warning。`

`IntentionalAdaptations: 图标只作为 aria-hidden 的紧邻标签标记，不进入可访问名称；人生结算没有引入原型占位的“模拟数据”，保留正式版真实存在的返回故事/取消确认与开启新人生动作，主操作沿用创建流程的完整文字与箭头；账号沿用真实登录态、云存档和长期角色设定区域，没有制造原型中的假 Tab；核心模拟继续沿用已有四维图标，不新增第二套装饰。`

`BaselineDifference: 直接打开单页时 Browser 控制台无错误；通过 flow.html 首次切换 iframe 时，当前内置浏览器记录一条跨文档 View Transition 的 "AbortError: Transition was skipped" 与一条 "MutationObserver.observe" 注入层错误，应用源码未触发 MutationObserver，且后续稳定停留与单页交互未再增加错误。`check:mod` 的当前完整基线见 2.15；可选 character-first Playwright runner 因项目未安装 Playwright 返回 UNAVAILABLE，未擅自新增依赖，真实浏览器证据由现有 Puppeteer 创建链和 DeepSeek 全流程覆盖。`

`ProjectChange: yes; FunctionalChange: yes; 已按发布台账统一生成 5.3.7 与一条玩家更新记录，并由 release 7342c8b 完成生产切换。`

### 2.21 5.3.7 生产发布与 release 保留

`LastVerified: 2026-07-24`

`Authority: PD-016, PD-017, PD-021, PD-030, PD-031`

`RuntimeSource: /root/ai-life-sim -> /root/ai-life-sim-releases/7342c8b; PM2 ai-life-sim; Nginx -> 127.0.0.1:3000`

`Result: pass`

`Evidence: 本地与 Linux Node 20 的 changelog、full gate、production build、protected-prompt bundle 和 release-cleanup smoke 通过；3001 旁路确认欢迎页、5.3.7 说明/更新日志、诊断接口和排行榜关闭态后原子切换，3000、PM2、Nginx、HTTP→HTTPS、两个 HTTPS 域名与全部创建/叙事/结算路由正常。公网 Puppeteer 在 320、430、1280 完成十二候选、选三项、两个轮回天赋、15 点四维、分支确认和结算返回/新人生，零控制台错误。官方 Provider=deepseek、Model=deepseek-v4-flash 通过公网 HTTPS 完成 4 次主叙事与 1 次后台分支补救，5 次代理请求全为 200，4 条正文落盘，分支点击确认并继续推进；Key 未进入浏览器请求原始载荷、存储、生产日志或 PM2 日志。临时生产账号完成注册、云同步覆盖、完整手动云存档、退出、重新登录、逐字恢复、邮箱/画像关闭态和账号删除。`

`Retention: 发布健康确认后删除非活动且非上一版的 2be5f58，释放约 556 MiB；当前只保留活动 7342c8b 与上一版 3aa346faa14c84f767d7f4b4cd81bf91999e64bc。3001 旁路和临时 archive 已清理；release/account cleanup timers、回环运营面板、pm2-root、Nginx 与 Certbot timer 保持 active，UFW 只开放 22/80/443。`

`BaselineDifference: Linux Node 20 安装阶段按 Puppeteer 官方开关跳过仅测试用 Chrome 二进制下载；Next 生产构建与全部服务端关闸通过。npm audit 仍报告 4 项既有 high 依赖告警，未在本次 UI 发布中执行破坏性依赖升级。Nginx error log 最新记录为外部 TLS bad key share 探测，PM2 应用错误日志最后修改早于本次发布，均无本轮应用错误。`

### 2.22 定版 UI 相对画布与中央手机框收口

`LastVerified: 2026-07-24`

`Authority: PD-008, PD-011, PD-015`

`SelectedSources: docs/ui-prototypes/mobile/flow.html; docs/ui-prototypes/mobile/assets/relative-phone-layout.css; docs/ui-prototypes/mobile/assets/relative-phone-layout.js; welcome/round-19-rf4-b-refinement.html; world-select/round-20-ws-rf23-b1-adaptation.html; world-customize/round-07-ws-b1-adaptation.html; character-create/round-15-ws-b1-adaptation.html; talent-draw/round-refactor-18-rf17-2-b1-adaptation.html; mythic-inheritance/round-14-legacy-layout-b1-rebirth.html; attribute-alloc/final.html; fate-preview/round-refactor-01-style-1.html; game-story/round-refactor-20-style-1.html; game-over/final.html; account/final.html; settings/final.html; help/final.html; feedback/final.html`

`RuntimeSource: src/app/globals.css; src/mods/mod-pages/pages/**; src/mods/mod-settings/components/**; src/mods/mod-ui/components/organisms/{HelpModal,DisclaimerModal}.tsx; src/core/theme/{theme-store,theme-provider}.ts*`

`Result: pass with known baseline differences`

`Evidence: 运行时所有串联页均包入唯一 final-flow-frame 与 final-flow-design-fit/canvas；欢迎 430×932、常规创建与辅助页 320×694、设置/说明/结算 330×715、核心模拟 390×844 保留各自设计画布，外层按可用宽高最小比例等比缩放。浏览器默认 320×694 实测 frame=320×694、fit=320×693.57、canvas transform=scale(0.744186)、body/html scrollWidth=320，无横向溢出；欢迎页截图与 flow.html 构图一致。桌面规则在 globals.css 中以中央固定手机框和同一纵横比公式实现。旧主题 CSS、StarfieldBackground、styles/mobile/base.css、旧桌面 zoom/scale 覆盖已从运行时导入与文件树删除。npm run lint（0 errors，1 条未改动叙事文件 warning）、npx tsc --noEmit、npm run build、no-hard-truncation-audit.mjs、git diff --check、check:changelog 均通过。`

`IntentionalRuntimeAdaptations: 方案库页面的运行时缺失功能、错误态、存档/账号真实数据和辅助弹窗继续由现有 owning system 提供；这些内容只放入对应定版画布，不改变页内构图、字段顺序或操作语义。`

`BaselineDifference: npm run check:ui 仍报告约 18 项既有断言冲突，集中在旧动态视口壳层、旧 42rem/desktop scale、48px 控件、旧页面结构和已删除的 mobile/base.css/旧主题假设；本轮没有为通过这些旧断言恢复废弃 UI。npm run check:structural 仍因 orchestrator-system.ts 的既有 D-07 相对 import 失败。当前内置 Browser 的视口覆盖被环境固定在 320×694，未伪造 1280×720 的浏览器实测；桌面结论由 CSS 公式、生产构建和中央框实现证据支持。`

`ProjectChange: yes; FunctionalChange: yes; 已按发布台账生成 5.3.8 与一条玩家更新记录（public/changelog-41.txt，2026-07-24 20:41:33）。`

### 2.23 定版 UI 全量对照偏离修复

`LastVerified: 2026-07-24`

`Authority: PD-008, PD-011, PD-015`

`SelectedSources: docs/ui-prototypes/mobile/flow.html 及其串联 14 页选定稿`

`RuntimeSource: src/mods/mod-pages/pages/{welcome,world-select,world-customize,character-create,talent-draw,attribute-alloc,fate-preview,game-story,game-over,account,feedback}/**; src/mods/mod-settings/components/SettingsModal*; src/mods/mod-ui/components/organisms/{BottomActionBar,HelpModal}*; scripts/check/domains/ui/mobile-ui-regression.mjs`

`Result: pass with known baseline differences`

`Evidence: 对照 flow.html 14 屏后修复：人生结算磨砂底栏补齐返回首页/查看模拟数据工具钮并固定在画布外滚动层；命运预览眉标改为命书步骤并统一 BottomActionBar 为 B1 磨砂规格；世界选择 Tab 顺序、focus 难度控件、当前选择索引与绝对定位底栏；命格/角色/世界配置底栏收为 52/38/48/25 悬浮承托；核心模拟恢复双行状态栏与四维语义标记；世界配置摘要绑定真实世界数据；设置/说明关闭钮 34px；命格候选描述去掉 line-clamp 硬截断。mobile-ui-regression 已迁到 final-flow 画布模型并全绿。lint 0 error / 1 既有 unused warning；tsc 通过；gate-check:quick 的 C0/C1/C2 通过。`

`IntentionalRuntimeAdaptations: 分享区代码保留但 CSS 隐藏以匹配定版构图；设置/说明/账号继续承载真实功能与错误态；命格页仍合并抽取与选取两阶段。`

`BaselineDifference: check:ui 仍报告 14 项 S26 页内自定义 CSS 变量未被 Design Token 扫描识别（变量已在页面根定义）；gate-check:quick 仍因 orchestrator-system.ts 既有 D-07 相对 import 失败。本轮未恢复废弃 100dvh/42rem 壳层。`

`ProjectChange: yes; FunctionalChange: yes; 已按发布台账生成 5.3.9 与一条玩家更新记录（public/changelog-42.txt，2026-07-24 21:18:31）。`

## 3. 阶段与发布验收摘要

| 范围 | 当前结论 | 权威入口 |
|---|---|---|
| MVP 主链 | 世界选择、创建、命格、命运预览、叙事、时间、存档与结算曾完成 5.0.0 全流程验收；后续语义以当前产品决策和 live 实现为准 | `blueprint-01-mvp-playable.md` |
| 多世界 P0 | 世界上下文、作用域、切换、兼容投影、快照与回滚已完成 | `blueprint-02-multi-world-simulation-foundation.md` P0 验收矩阵 |
| 历史因果 P1 | 历史事件唯一账本、候选审计、显式因果、消费者引用、v1 迁移与原子回滚已完成 | `blueprint-02-multi-world-simulation-foundation.md` P1 验收矩阵 |
| 5.0.8—5.1.0 运维 | 生产日志、401/403 终止、错误转译、`seed:null` 兼容、三天 release 回滚窗口和健康清理器已上线并验证 | 本账本 2.4、生产运行态和 Git 历史 |
| 5.2.0 | 结算分享已通过独立 release、旁路、原子切换、HTTPS、浏览器和运维验证 | 本账本 2.8 |
| 5.2.4 本地候选 | DeepSeek 与叙事修复、可选账号云同步、QQ 绑定和共享积分、通用评分与转世天赋已通过本地完整关闸；其生产待验证结论已由 5.3.1 取代 | 本账本 2.2、2.5、2.6、2.9—2.12 |
| 5.3.1 | 失败自动重试、登录玩家单栏云存档、默认关闭的排行榜/邮箱/画像后台与回环运营面板已通过独立 release、原子切换、HTTPS、公网账号云存档浏览器路径和 systemd 运维验证 | 本账本 2.10、2.13 |
| 5.3.2 | 内容审核失败给出明确处理建议，确定性 4xx 不重试且重试日志不复制上游正文；移动端 `ui-sync-5` 原型验收完成并随生产 release 验证 | 本账本 2.7、2.9、2.13 |
| 5.3.4 | 任何完整故事都立即交付；条件 META、非法数据与重复度不再触发同步重写，相关状态保持待处理且非法数据整包不写；分支确认在生成锁释放前禁用，避免静默跳过下一轮；已通过 DeepSeek 全流程、冷启动/公网分支浏览器、独立 release、旁路、原子切换、HTTPS 和运营运维验证 | 本账本 2.14、2.15 |
| 5.3.5 | 恢复 LongCat 与原托管预设、增加发布前环境硬校验；移动端串联创建流注册 `/new-game/*` 路由并落地 15 点四项基础属性、12 候选命格与 2 项转世天赋；已通过生产预设真实请求、线上创建流和分支点击回归 | 本账本 2.16 |
| 5.3.6 | 按选定移动端串联方案替换角色创建、命格、属性与命运预览运行时 UI；移除旧星盘主构图并同步候选、轮回槽与浏览器回归；已完成生产原子切换与线上分支回归 | 本账本 2.17、2.19 |
| 5.3.7 | 定版语义图标与统一结算底栏已进入正式运行时；修复 320px 命格卡纵向重叠并加入碰撞关闸，完成公网多视口、DeepSeek、账号云端与只保留上一版的发布验收 | 本账本 2.20、2.21 |
| 5.3.8 本地定版 UI | 手机端按各页设计画布的相对比例整体缩放，桌面端固定中央手机框；旧主题与旧桌面样式已删除，旧 UI 回归断言不再作为目标 | 本账本 2.22、PD-011 |
| 5.3.9 定版偏离修复 | 结算/创建底栏、世界选择、核心模拟状态栏与关闸断言对齐 flow.html 选定稿 | 本账本 2.23、PD-011 |

公开玩家变更以 `../public/changelog-index.json` 与对应 `../public/changelog-*.txt` 为准；本账本不重复维护逐版本玩家文案。

## 4. 已取代与历史记录

| 历史记录 | 当前处置 |
|---|---|
| 2026-07-08 点击、修复和完整重启流水 | 已完成的缺陷闭环只保留 Git 历史；当前主链由蓝图、系统索引和自动回归负责 |
| 2026-07-09 移动端、预生成与叙事循环测试 | 当前 UI 以定版原型和 UI 检查为准；历史尾句裁切方案已由 PD-015 取代 |
| 2026-07-10 全玩家流程与质量修复计划 | 已吸收到 5.0.0 MVP、产品决策和后续回归，不再作为执行计划 |
| Prompt 3.0 全字段协议 | 已由分级中文协议取代；旧协议不得进入成功路径 |
| 首代 managed / `grok-4.5` 默认通道 | 先被 a6api 主备方案取代，当前又被 LongCat 默认方案取代 |
| a6api 作为默认通道 | 仍保留为玩家可选预设，但不再是默认模型 |
| 5.0.0 独立发布说明与验收文件 | 版本历史由 public changelog、Git 历史和本账本第 3 节保存 |
| 互动叙事工具评估、Skill 更新提案和日期型实施计划 | 已吸收的规则进入产品决策、架构或 Skills；未吸收内容不再是活动待办 |

## 5. 更新模板

新增验收时只在对应章节更新以下内容，不新建日期型文件：

```text
LastVerified: YYYY-MM-DD
Authority: PD / blueprint / system index
RuntimeSource: owning implementation
Result: pass | partial | failed
Evidence: deterministic checks + required browser/production path
KnownLimitations: remaining reproducible limitations
Supersession: replaced conclusion, if any
```
