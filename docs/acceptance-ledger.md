# 项目验收账本

文档角色：acceptance-ledger
权威层级：A5
状态：active
体系路径：project > governance > acceptance-ledger
上级目标：集中保存足以判断当前功能是否符合产品与架构权威的验收结论
下级组成：叙事、Prompt、托管模型、日志反馈、创建流程、结算分享、阶段与发布历史
适用范围：已进入运行链或已形成长期回归约束的项目能力
拥有者：各 owning system 与项目测试治理
最后验证：2026-07-21；对应专项回归、项目关闸、浏览器或生产证据
取代关系：合并原日期型 playtest、发布验收和发布说明文档；详细流水由 Git 历史保存
运行真源：各章节列出的 live source
验收证据：各章节列出的自动检查、浏览器路径与生产检查

## 1. 使用规则

1. 本文件只证明实现是否符合更高层权威，不定义新的产品语义。
2. 当前行为冲突时，先看 `product-decisions.md`、蓝图和 `system-authority-index.md`，再用本账本核对证据。
3. 每项只保留结论、关键边界、可重复检查和仍存在的限制；逐轮故事、完整 Prompt、响应、截图和命令全文不进入活动文档。
4. 被取代记录只保留一行关系，不能恢复成当前指令。

## 2. 当前有效验收

<a id="narrative-compression"></a>

### 2.1 叙事压缩与无硬截断

| 字段 | 结论 |
|---|---|
| 对应权威 | `PD-014`、`PD-015`、`PD-017` |
| 运行真源 | narrative protocol、RoundCommit、summary compressor、memory lifecycle、检索索引 |
| 当前结果 | 原始叙事与低层叶子不因容量、字符数或固定条数删除；L1 延迟一个完整十轮块生成；高层摘要只有在完整标记与非空内容通过后建立覆盖；失败时保留全部低层内容等待重试 |
| 提交边界 | 未知字段、非法系统、不可写目标或任一状态写入失败使整包 META 失效并回滚；合格正文与独立摘要仍保留 |
| 检索边界 | 高层摘要继承实体与最高重要度；Prompt 通过覆盖区间选择叶子，不以固定尾部窗口冒充完整历史 |
| 自动证据 | `npm run test:compression-runtime`、`npm run validate:narrative`、`no-hard-truncation-audit.mjs`、完整 gate |
| 已知基线 | `check:mod` 的历史迁移扫描问题必须独立报告，不得把未执行或既有失败描述为全绿 |

<a id="narrative-protocol"></a>

### 2.2 主叙事协议、推理与命运分支

| 字段 | 结论 |
|---|---|
| 对应权威 | `PD-009`、`PD-010`、`PD-016`、`PD-017` |
| 运行真源 | server narrative Prompt、中文协议解析器、Zod Schema、orchestrator |
| 当前结果 | 输出顺序为 `正文 → 摘要 → 可选数据 → 结束`；1 段、5 段或其他自然段数都可直接消费，不因段数重写或重排；普通轮数据缺失或非法时保留正文和摘要，数据整包拒绝；当前命运意图与强制分支仍执行条件必填和针对性修复 |
| 注意力与成本 | Prompt `4.5.2` 将固定 system 前缀稳定在身份、事实权威、因果、文风与基础协议；世界事实、记忆和本轮状态继续完整动态投影，首轮来历、时间尺度、意图、分支与修复规则只在生命周期命中时加载；末尾 `round-output-contract` 就近重申本轮最高优先级约束。确定性检查记录固定前缀约 3.3k 字符，精简修复资产约 2.4k 字符；格式修复不再重发全局、记忆与本轮三层 Prompt |
| 数据完整性 | 速度优化不得按字符、固定条数或容量裁切剧情事实、关系、伏笔、玩家设定或摘要；动态卸载只作用于本轮不适用的规则组件，不作用于当前需要的事实投影 |
| 空值边界 | 无内容字段应省略；兼容层只归一无语义空数组、`false` 和空条件对象，不补剧情、不猜字段、不截断正文 |
| UI 边界 | 流式界面只显示正文，不展示摘要、数据、协议标记或修复内容 |
| 自动证据 | `npm run test:narrative-protocol`、`npm run test:prompt-wiring`、`branch-intent-resolution-smoke.mjs`、`runtime-subsystem-state-regression.mjs` |
| 模型证据 | DeepSeek 固定切片证明首稿协议率不是 100%；当前实现保留严格拒绝与有限修复，不用部分提交换取表面成功 |

<a id="managed-ai-longcat"></a>

### 2.3 LongCat 默认模型与服务端 Prompt 资产

| 字段 | 结论 |
|---|---|
| 对应权威 | `PD-018`、`PD-030`、`PD-031` |
| 运行真源 | Provider 配置、server target/credential、主生成与精简修复 server Prompt assets、AI proxy、设置页 |
| 当前结果 | 新玩家、空旧配置和恢复默认均选择 `managed / LongCat-2.0`；旧 a6api 通道保留为可选项；玩家可以使用自己的 API Key |
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
| 错误处理 | 401/403 终止不会自行恢复的候选生成循环；玩家错误只显示可操作说明与请求 ID，原始上游错误留在私有日志 |
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

<a id="zero-base-creation"></a>

### 2.7 零基础值创建链

活动创建流程已删除玩家加点：命格确认后直接进入命运预览，四项基础属性在新人生交接和正式开局两处强制为零。命格、种族、伤病和其他合法来源仍以独立 modifier 聚合，因此最终展示值可以不为零。旧 `/attribute-alloc` 只做水合后的兼容跳转，不含预算或写入逻辑；后续变化只能由主叙事合法增量经 `character-base` 校验、钳制、提交和持久化。

`test:creation-first-narrative`、`test:new-life-isolation`、UI 与 TypeScript 回归通过；旧存档不被批量重写。

<a id="game-over-sharing"></a>

### 2.8 人生结算分享

结算页在既有事实展示、结构化大事和转世天赋之后提供“留下此生”：本机 Canvas 生成完整 PNG，优先使用 Web Share，能力不可用时降级下载。数据只来自角色名、世界、年岁、轮数、品性、人生评分、四维、已确认分支/突破大事和当前转世天赋；不从正文编造成就，不上传正文、Prompt、API 配置、诊断编号、日志或设备信息，也不修改存档与模拟状态。

320—1280px 响应式、1080px PNG、长文本换行、零值轨道、系统分享、下载降级、控制台、自动 UI 检查和 5.2.0 生产发布后路径均通过。

### 2.9 生产反馈修复的本地验收

`5.2.2` 本地修复覆盖三条已证实缺陷链：自定义 DeepSeek 模型与官方 DeepSeek 在流式/非流式、启用/关闭推理时使用一致的 `thinking.type` 契约，非 DeepSeek 自定义模型不继承内部预算字段，确定性 400 只发一次请求；新人生 reset 或显式读档会使旧自动存档生命周期失效，即使旧写入已开始替换槽 0，也会通过目录事务恢复原 payload 和索引；重复叙事修复候选只有再次通过完整协议门禁且不再文本重复或无因果回到准备阶段时才可替换上一版。

自动证据包括 `test:ai-proxy`、`test:new-life-isolation`、`test:narrative-protocol`、`test:player-feedback`、`autosave-lifecycle-smoke.mjs`、`narrative-repetition-smoke.mjs` 和 `feedback-status-smoke.mjs`。本条只证明本地实现与确定性回归；生产仍运行 `5.2.1`，真实 Provider、浏览器多槽路径、正式部署和发布后日志尚未验证，相关反馈不得标记 `resolved`。

<a id="account-cloud"></a>

### 2.10 可选账号、云同步与长期角色设定

账号云同步的确定性验收已覆盖：用户名 NFKC/大小写防重、非法字符、保留名和扩展违禁词；密码长度与两次确认；scrypt 哈希、会话 Token 哈希、AES-256-GCM API Key 密文与错误密钥拒绝；SQLite WAL Schema、Linux 主库/WAL/SHM `0600` 权限、revision 冲突、数据库重开严格恢复、30 天清理边界与子表级联；转世天赋和战绩第 11 项整包拒绝；未知故事正文/Prompt 字段拒绝；角色姓名、性别、种族、背景、四维、寿命、起始年龄、自定义选项和背景预设逐字恢复。

新人生隔离回归证明本局叙事、运行角色、世界和下游创建草稿仍被清理，而版本化长期角色设定保持不变；恶意或未来版本本地 hydration 被丢弃，同内容云快照不会重复触发同步。`npm run test:account-cloud`、`npm run test:new-life-isolation` 和 `account-cloud-browser.cjs` 已通过；真实本地 API 浏览器路径覆盖注册、加密 Key、退出清 Key、本地篡改后登录云覆盖、角色逐字段回填、账号删除、零控制台/5xx 与 320/390/768/1280px 无横向溢出。本条不表示已经部署；正式环境仍需配置独立 32 字节加密密钥、数据库目录权限和账号清理 timer，并完成发布后验证。

<a id="shared-qq-community"></a>

### 2.11 QQ 验证身份与共享积分

主项目账号 SQLite 已增加分类的 QQ 绑定、nonce、积分账户、账本、签到、群成员投影和幂等结果表。Bot 只获得回环 HMAC 白名单 API，不能读取账号设置、Key、角色设定、天赋/战绩内容、故事或日志；注册 QQ 仍是未验证联系方式，一次性绑定码成功后才建立一对一可信身份。

`npm run test:account-cloud` 已覆盖十分钟绑定码、签名、过期/重放、纯回环转发头放行与混合/公网转发拒绝、上海日期跨日签到、转账守恒、负余额拒绝、账号积分投影、相同请求重试和同幂等键参数漂移冲突。Bot 仓库由另一任务按 `qq-bot-integration-contract.md` 接线，本条不把尚未完成的 Bot 命令适配描述为已完成或已部署。

<a id="game-over-reincarnation"></a>

### 2.12 人生评分、大事与转世天赋

结算纯函数已覆盖通用评分：原始分低于 95 时宽松映射且最高 94，原始分达到 95 后正常四舍五入；一个包含实际旅程和已解决选择的完整基准局达到 80 以上。评分先确定余响、深刻、传世、不朽档位，再连同完整允许的人生记录交给 Prompt 1.2.0，候选保存来源分数与档位。

确定性回归证明大事只来自 `resolvedChoice` 和生命突破，代表大事按结构化权重稳定选择并进入分享事实；转世天赋与命格详情不再使用行数裁切。`game-over-share-card-smoke.mjs` 和 TypeScript 已通过；完整 UI、叙事硬截断、浏览器 320-1280px 与交付关闸在本任务最终验收中继续执行。

## 3. 阶段与发布验收摘要

| 范围 | 当前结论 | 权威入口 |
|---|---|---|
| MVP 主链 | 世界选择、创建、命格、命运预览、叙事、时间、存档与结算曾完成 5.0.0 全流程验收；后续语义以当前产品决策和 live 实现为准 | `blueprint-01-mvp-playable.md` |
| 多世界 P0 | 世界上下文、作用域、切换、兼容投影、快照与回滚已完成 | `blueprint-02-multi-world-simulation-foundation.md` P0 验收矩阵 |
| 历史因果 P1 | 历史事件唯一账本、候选审计、显式因果、消费者引用、v1 迁移与原子回滚已完成 | `blueprint-02-multi-world-simulation-foundation.md` P1 验收矩阵 |
| 5.0.8—5.1.0 运维 | 生产日志、401/403 终止、错误转译、`seed:null` 兼容、三天 release 回滚窗口和健康清理器已上线并验证 | 本账本 2.4、生产运行态和 Git 历史 |
| 5.2.0 | 结算分享已通过独立 release、旁路、原子切换、HTTPS、浏览器和运维验证 | 本账本 2.8 |
| 5.2.4 发布候选 | DeepSeek 与叙事修复、可选账号云同步、QQ 绑定和共享积分、通用评分与转世天赋已通过本地完整关闸；生产发布与运行证据待正式 release 完成后登记 | 本账本 2.2、2.5、2.6、2.9—2.12 |

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
