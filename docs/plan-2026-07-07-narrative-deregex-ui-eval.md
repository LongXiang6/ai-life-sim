# 规划文档：叙事精品化 + 去正则化 + UI 调整 + 三项评估

文档角色：implementation-plan
权威层级：A2
状态：active
适用范围：D1-D14 决策、叙事管线、字段契约、数值输入与 UI 调整
拥有者：active product decisions 与对应 owning systems
最后验证：2026-07-18；活动引用和 UI Skill 路由同步
取代关系：none
运行真源：live Prompt、schema、owning subsystem、UI token 和 runtime policy
验收证据：相关 narrative、regression、UI、结构与交付 gates

日期：2026-07-07。全部 14 项决策已拍板；实现状态和剩余范围必须以 live source、产品决策和验收记录复核，不以本文的历史措辞单独判定完成。

上游背景：本文档展开 2026-07-06 压缩与属性讨论中的相关待办；原讨论文件当前不作为活动权威，后续判断以本文、产品决策和 live source 为准。

---

## 已确认决策（2026-07-07，用户拍板）

> 本项目处于**开发阶段，不考虑向前兼容 / 存档迁移 / KV 前缀失效成本**——这是贯穿全部决策的总前提，应写入技能声明（见下方 D1 备注）。

| # | 决策 | 落地要点 |
|---|------|---------|
| D1 | **G1 三段式用方案 A** | 保持 `narrative` 为 string，输出规约 + 改写示例强制三段。**无需考虑前缀缓存失效**（开发阶段，一次性改完即可）。`narrative-hints.ts` 中与"聚焦单事件"冲突的措辞（year 档"进展与变迁"、branchResolved"完整过程"等）**一并软化**。当前 Prompt 项目上下文由 `ai-life-sim-prompt-engineering` 提供，具体缓存行为以实时调用链为准。 |
| D2 | **历史决策：事件密度上限收到 3（已被 PD-015 取代）** | 三段式仍保持单一因果主线，但不得再用 `notableEvents` / `keyEvents` 固定条数限制结构化事实；完整提交本轮主线中的触发、推进与后果。 |
| D3 | **摘要预算：先改措辞观察 + 轻微调系数** | 先落 L1 prompt"只提事件、忽略描写"措辞，观察实际摘要长度；系数 `×2.4` 仅做**轻微下调**（非激进砍到 1.5），保留 `MIN_SUMMARY_TOKENS` 保底。 |
| D4 | **G2 去正则化做全量** | A 类全部迁移（A1~A6），不止 P0。仍遵循"AI 出语义 + 符号钳制兜底 + 漏字段降级"护栏。技术债（`split(/\s+/)` 中文失效、穿越者双实现）一并修。 |
| D5 | **E1：resources 设为慢变量** | `ATTR_DELTA_CLAMP` 改 `Record<AttrKey,[number,number]>`，resources 收窄。**数值体系理念修正**：不以"几轮达成"为锚点，而以**游戏内时间跨度**为锚点——时间引擎（TimeSystem）是核心中的核心，几乎所有系统都与时间引擎相关，成长/衰减/超凡速率应换算到"每年/每阶段"而非"每轮"。 |
| D6 | **E2：先做 token 治理系统性重构** | 先立 spacing/typography/MAX_WIDTH token 规矩再逐页替换。相关视觉与主题上下文现由 `ai-life-sim-ui` 提供，风格方向见下方 §六 补充。 |

### 第二批决策（2026-07-07，追加三项评估拍板）

| # | 决策 | 落地要点 |
|---|------|---------|
| D7 | **P1：确认修字段契约三方漂移（B3/B4/B5）** | 对齐善恶/气运/寿命的字段名（子系统 impl / Zod registry / AI subsystemGuide 三处），但不机械迁就旧字段：必须先明确每个字段是增量、绝对值还是内部初始化字段。C-0 复核确认 `morality` 只落地 `delta`、`luck` 当前落地 `luck` 绝对值、`lifespanDelta` 当前不落地。风险提示： 修复后这些数值会**真正开始变动**（此前可能一直没生效），接受由此带来的游戏手感变化。这是 §二 G2 善恶/减寿去正则化的**前置**。 |
| D8 | **P1：死代码域暂不动，仅标注隔离** | health / economy / reputation / faction-dynamics / mod-culture 等死代码或抛错桩**暂不复活**，只做标注/隔离（加注释或移目录），消除认知混乱。不引入激活未测子系统的高风险。B6 死亡检测链因 health 死而断裂——暂维持现状，尾声触发条件的问题一并记为"未来段"。 |
| D9 | **P1：判定/落地闭环强约束——本轮纳入** | 最彻底的"判定与落地在同一子系统内闭环、Orchestrator 只编排不算业务"纳入本轮。风险提示： 触及 orchestrator core + 所有 applyChanges 契约，可能改 `RoundContext`/`OrchestratorSnapshot` 存档结构——属**动 core/foundation**，实现前须按 AGENTS.md 边界规则逐步确认，且需完整回归 + gate-check。 |
| D10 | **P2：接受 token 节省有限的校准** | 确认"省 token 仅 5%-12%（非数倍），主要收益是减少格式错误"。以**减少格式错误**为推进理由，不以省 token 为主要目标。 |
| D11 | **P2：走方案 A（正文剥离）+ 与 G1 合并** | `[NARRATIVE]` 三段式正文剥离 + `[META]` 结构化数据仍用 JSON（保留嵌套表达力 + Zod 校验）。与 G1 三段式改造**合并实施**（共用一次 few-shot 重写 + 一次缓存失效）。C-0 已确认主叙事 wrapper 路径会启用 `response_format:{type:"json_object"}`，因此方案 A 实施时必须同步关闭/调整该路径的 JSON Mode；另有 S3 非流式 `callAIDegraded` 分支未显式继承 wrapper 的 JSON Mode，需要一并收口。 |
| D12 | **P3：难度作为核心引擎，各系统接入时适配** | 难度**不是各系统互相适配**，而是像一个**核心引擎/全局系数源**：各模拟系统在按 MVP 蓝图复活接入时，**主动从难度核心读取系数**适配自己的计算公式。难度机制本身作为单一权威源（并入 §五 balance-config），系统单向依赖它，而非双向互相适配。 |
| D13 | **P3：multiplier 定性为「世界难度倍数」** | 语义统一：**数值越高越难，<1 更简单，=1 为标准难度**。此定义写入 balance-config，所有接入难度的系统统一遵循。 |
| D14 | **E1：允许开局叠加到超凡** | 强种族基准线 + 命格 attrBonus 允许直接相加、**开局即可达到/超过超凡阈值**，不设开局总值软上限、不强制留成长空间。§五 C「开局超凡组合」由"需限制"改为"允许，仅需修 A1 key bug 让基准线真正生效"。 |

### D5 引申：时间引擎作为数值中枢的理念

用户明确：**时间引擎是核心中的核心**。数值体系不应问"几轮到超凡"，而应问"游戏内经过多久（多少年 / 几个生命阶段）到超凡"。这意味着：

- 所有成长/衰减/超凡速率常量，语义应是"每单位游戏时间"，由时间引擎推进的 `timeStep`（年/月/日粒度）换算，而非绑定"每轮 AI 调用"。
- 单轮增量钳制（`ATTR_DELTA_CLAMP`）应与"本轮跨越的游戏时间"挂钩——跨 10 年的一轮与跨 1 天的一轮，允许的属性变化幅度理应不同。
- 这是比"抽 balance-config"更根本的重构方向，**需在实现数值调整前，先确认时间引擎当前如何暴露 timeStep 给各子系统**（见追加评估 P3 关联）。

---

## 任务总览

用户本次提出 **2 个优化目标 + 2 个 UI 调整 + 3 项评估**：

| 编号 | 类型 | 一句话 | 本文档章节 |
|------|------|--------|-----------|
| G1 | 优化 | 提示词精品化：每轮三段式叙事，信息质量↑、事件密度↓、摘要变短 | §一 |
| G2 | 优化 | 去正则化：正则/关键词判定优先改为 AI 结构化输出（成本可忽略） | §二 |
| A1 | 调整 | 角色设定种族栏只保留三按钮：人类 / 自定义 / 更多 | §三 |
| A2 | 调整 | 命格卡片底部栏位统一存在，有/无数值修正做差异化区分 | §四 |
| E1 | 评估 | 现有数值体系是否需要调整 | §五 |
| E2 | 评估 | HUB / UI（间距、边框等）是否需要调整 | §六 |
| E3 | 评估 | 项目各技术点是否有可吸收的现代 AI 技术 | §七 |
| P1 | 评估（追加） | 系统功能边界是否需要收严——调研各系统职责，拆分重组，权责清晰化 | §八 |
| P2 | 评估（追加） | JSON → 自定义前置格式（`[系统信息]~~~`），是否更省 token、减少格式错误 | §九 |
| P3 | 评估（追加） | 世界选择界面的难度是否正常生效，为后续模拟系统按难度分级计算做准备 | §十 |

**总体风险边界**：G1 涉及 `narrative-prompt.ts` 的 SYSTEM_PROMPT（走 KV 缓存，改动即令前缀缓存失效一次）；G2 部分项改 Schema（影响 AI 输出契约）；均需按项目风险分级在实现前确认。所有"改 AI 输出结构 / 改存档结构 / 改数值语义"的项都标注了风险级别。

---

## §一、G1：三段式叙事精品化

### 现状核实（证据）

- **分段是"软建议 + 事后补救"，无硬结构**：`narrative` 是单个 string，描述为"段落数量根据情节需要灵活安排"（[narrative-prompt.ts:184](../src/mods/mod-engine/prompts/narrative-prompt.ts#L184)）。唯一兜底是 [normalize-narrative-paragraphs.ts:8-21](../src/mods/mod-engine/helpers/normalize-narrative-paragraphs.ts#L8-L21)：**仅当 AI 完全没输出 `\n\n` 时**才按句号机械切 3 段。首轮示例是 3 段，但示例 1/2/5 是单段——few-shot 本身在暗示"段落随意"。
- **事件密度无上限，反被多处推高**：`notableEvents` 上限 3、`keyEvents` 上限 5，字段存在会诱导 AI 每轮塞满；字数默认 500（`buildWordCountInstruction`，[narrative-config.ts:93](../src/mods/mod-engine/constants/narrative-config.ts#L93)）只管长度不管密度；`narrative-hints.ts` 的 year 档提示"描写进展与变迁…不一笔带过"反而鼓励一轮覆盖更多进展，与目标冲突。
- **压缩机制（历史核验）**：每 `SUMMARY_INTERVAL=10` 轮压一块，预算 `computeSummaryTokenBudget = max(3600, 原文字数×2.4)`，再按 digest 平均重要性 0.75~1.75 加权。L1 prompt 要求"绝对客观、每事件一行"，但**未明说"忽略景物/心理描写"**。2026-07-18 的运行核验进一步要求把 `digest` 与每事件 `importance` 直接传入 L1，且把近期完整原文窗口扩为覆盖延迟区间的 20 轮；旧的“只按预算加权、最近5轮”口径已被 `PD-014` 取代。
- **KV 缓存结构**：SYSTEM_PROMPT 完全固定（100% 前缀命中）；user JSON 三段 STABLE→SLOW→FAST（[prompt-builder.ts:100-135](../src/core/ai-service/prompt-builder.ts#L100-L135)）；有守卫脚本 `scripts/check/domains/narrative/kv-prompt-audit.mjs` 校验键序。

### 三段划分建议：入景 → 推进 → 余韵

1. **场景铺陈段**：季节/天气/地点/感官细节切入，复用现有 `openingExamples` 推荐开头。
2. **事件推进段**：本轮唯一核心事件（至多带 1 个次要连带）——密度约束的落点。
3. **心理与余韵段**：内心反应、关系变化、留白悬念——承载代入感。

### 实现方案

**Schema 方案 A（推荐，零存档风险）**：保持 `narrative` 为 string，用"输出规约 + 示例"强制三段 `\n\n` 分隔。
- 改 [narrative-prompt.ts:184](../src/mods/mod-engine/prompts/narrative-prompt.ts#L184) 的 description：从"段落灵活"改为"必须且只分三段：铺陈/推进/余韵，缺一不可，严禁合并"。
- L0 硬规则区加"narrative 必须三段式，段间空行"。
- **把示例 1/2/5 从单段改写为三段**（这一步比措辞更关键，AI 强烈跟随示例格式）。
- 不动数据结构、解析、`normalizeNarrativeParagraphs`、UI 渲染、压缩器。

**Schema 方案 B（不建议先上）**：拆成 `{scene, event, reflection}` 三字段对象。结构最硬，但击穿存档历史 narrative（string）、`narrative-parser-system`、UI 渲染、`dedupNarrativeHistory`、压缩器 `e.narrative` 读取——属**改变存档结构的高风险改动**，需迁移层。**待 A 验证效果后再评估**。

**SYSTEM_PROMPT 措辞（引导写细节而非罗列）**：在 `narrativeQuality` 区块（[narrative-prompt.ts:368-381](../src/mods/mod-engine/prompts/narrative-prompt.ts#L368-L381)）加 `showDontTell` 子块：
- "每轮聚焦一个核心事件，把这一个事件写透——用动作、对话、感官细节、心理活动展开。"
- "宁可一件事写出画面感，不可三件事各一句话带过。禁止'先…然后…接着…最后'流水账句式。"

**事件密度显式约束（历史口径，固定上限已被 PD-015 取代）**：
- L0 加："每轮 narrative 只推进一个核心事件（可含自然连带反应），严禁并列多个不相关事件。"
- `notableEvents` / `keyEvents` 不再设置固定条数；单主线通过 Prompt 语义约束实现，结构化事实不得因上限被省略。

**字数**：`DEFAULT_WORD_COUNT_TARGET=500` 可保持。三段收益来自"密度↓+细节↑"，非加长。

### 压缩总结顺应调整

1. **预算与字数部分解耦**：三段式后原文字数不降（甚至略升，多了描写），但信息量降了。若仍 `字数×2.4` 会把景物/心理描写喂给摘要器，产出冗长摘要，与目标相悖。建议系数 `2.4 → 1.5` 或改**按 keyEvents 条数**估预算（保留 `MIN_SUMMARY_TOKENS` 保底）。**风险中**，建议先改措辞观察再动系数。
2. **L1 prompt 强化"只提事件、丢弃描写"**：[summary-prompt.ts:34-43](../src/mods/mod-engine/prompts/summary-prompt.ts#L34-L43) 加"只提取事件推进段事实，忽略场景铺陈与心理描写"。`digest` 字段描述已是"省略环境描写与修辞"，可作模板。**风险低**。
3. L2-L6 的摘要格式保持不变，但生成后必须继续进入检索索引；高层摘要从低层索引继承实体与最高重要度，避免 L1 清理后失去远期召回。

### 2026-07-18 压缩运行链路同步（PD-014）

本节 supersede 仅涉及压缩运行时的旧实现备注，不改变 G1/G2 已确认的叙事质量方向：

- 主叙事真实提交与预生成都必须先通过 `NarrativeResponseSchema`，因此 `digest`、`keyEvents[].importance`、`entities` 不是“可选的提示字段”，而是进入账本的必要结构。
- L1 延迟一个完整 10 轮块；第一次在第 21 轮整理第 1—10 轮。生产 Prompt 保留最近 20 轮完整原文，确保第 21—31 轮之间不会遗漏尚未形成 L1 的中间叙事。
- L1 User Prompt 同时接收原文、`digest` 和带权 `keyEvents`；摘要正文只写正文已确认的事实，权重只决定保留顺序。
- L2—L6 生成后写入检索索引；后续实体召回可以命中高层摘要，且摘要层级仍按当前富 Prompt 规则注入。
- `memoryLifecycle.decideCompression()` 的闭环/容量结果只作为原因与预算观测；实际 AI 摘要仍遵守固定延迟窗口，清理边界以新生成的 L1 覆盖范围为准。

### 2026-07-18 剧情质量硬截断红线同步（PD-015）

本节取代本计划及旧测试中所有“容量达到上限后删除旧数据”“只取前/后 N 条”“按字符数缩短叙事语义”和世界/角色长文本固定字数上限的实现建议：

- 原始叙事、每轮 digest/带权事件、全部层级摘要、检索索引、人物关系、伏笔、因果标记与原创设定必须完整保存，不得用固定容量淘汰。
- Prompt 只传最近 20 轮完整原文仍然有效，但这是非破坏性近期窗口；更早区间必须由未被高层覆盖的叶子摘要和按实体/权重检索的摘要完整覆盖。
- 事件聚合、伏笔注入、关系网、尾声与时间桥不设置固定条数或字符截断。需要控制上下文时，使用语义摘要、覆盖区间和可解释遗忘，不能丢数组尾部或低权事实。
- AI `changes` 不允许截为前 24 条，也不允许丢弃非法项后部分提交；存在非法项时整包拒绝该组状态变更，正文保持完整。
- 世界描述、世界维度自定文本与角色背景不再使用 5000/120 字硬上限；定版 UI 只把计数改为实际字数，不改变页面结构与视觉层级。
- 新增 `no-hard-truncation-audit.mjs` 作为 narrative gate，防止上述路径回归。

### G1 已确认决策（2026-07-07）

1. 状态：已确认； **Schema 方案 A**。项目处于开发阶段，不考虑向前兼容/存档迁移，方案 B 的"击穿存档历史"顾虑不成立——但仍先上 A（string + 输出规约 + 示例），因为它对解析链、UI、压缩器零改动，是最小改动达成目标的路径。若后续需要更硬的结构化，再评估 B。
2. 状态：已确认； **无需考虑 KV 前缀失效**。开发阶段一次性失效可接受。当前实现应读取 `ai-life-sim-prompt-engineering` 与实时调用链，不在 Skill 中长期复制供应商缓存细节。
3. 状态：已确认； **`narrative-hints.ts` 措辞一并软化**。year 档"进展与变迁…不一笔带过"、branchResolved"完整过程"等与"聚焦单事件"冲突的 hint，改为"聚焦此期间最关键的一件事，写透它"。与 SYSTEM_PROMPT 三段式规约同批改，消除 system 与 user hint 打架。
4. 状态：已确认； **摘要预算：先改措辞观察，再轻微调系数**。第一步只加 L1 prompt 的"只提事件、忽略描写"措辞（风险低）；观察三段式上线后摘要实际长度，再决定 `2.4` 是否下调、下调幅度（轻微，保留 `MIN_SUMMARY_TOKENS` 保底）。不一步到位动系数。
5. ~~`keyEvents` 上限定为 3~~ 已被 `PD-015` 取代；账本需要完整接收本轮主线中所有关键事实及其权重。

---

## §二、G2：去正则化（正则/关键词 → AI 结构化）

### 全量清单与分类

调研在 `src`（不含废弃项目）发现的判定分三类：

**A 类：建议改 AI 结构化输出**（语义判定 / 从叙事文本提取信息）
| 项 | 位置 | 现状 | 改造 |
|----|------|------|------|
| A1 属性变化提取 | [character-base-system.ts:247-291](../src/mods/mod-character/subsystems/character-base-system.ts#L247-L291) | AI `physiqueDelta` 等已存在，正则是 P2 降级 | prompt 里 delta 升为"提到即必填"，正则降为纯兜底或删 |
| A2 善恶判定 | [morality-system.ts:97-133](../src/mods/mod-character/subsystems/morality-system.ts#L97-L133) | 纯关键词 + `includes('你')` 判主语，全项目最脆弱 | AI 在 changes 提交 `morality.delta`（字段已存在）+ 可选 reason，删关键词路径 |
| A3 减寿判定 | [lifespan-system.ts:288-306](../src/mods/mod-character/subsystems/lifespan-system.ts#L288-L306) | 6 组关键词 | AI 提交 `lifespan.lifespanDelta`（字段已存在）+ reason |
| A4 重要性评分 | [memory-lifecycle-system.ts:205-237](../src/mods/mod-engine/subsystems/memory-lifecycle-system.ts#L205-L237) | 三处并存（ledger AI 分 / 关键词三档 / 顶层 importance） | 以 ledger + importance 为主，关键词降兜底。零新增调用 |
| A5 记忆遗忘分类 | [memory-forgetting-system.ts:92-131](../src/mods/mod-engine/subsystems/memory-forgetting-system.ts#L92-L131) | 4 张关键词表决定删哪条记忆 | 复用 ledger `effectiveImportance` + 实体重叠替代 |
| A6 事件闭环检测 | [memory-lifecycle-system.ts:240-262](../src/mods/mod-engine/subsystems/memory-lifecycle-system.ts#L240-L262) | `CLOSURE_PATTERNS` 6 类正则决定压缩时机 | **唯一需新增 Schema 字段** `arcStatus`，AI 输出 start/ongoing/end |

**B 类：应保留正则**（纯格式/字符串处理，与语义无关，AI 不应替代）
- `src/mods/mod-engine/helpers/parse-strategies.ts` 全部（JSON 清洗、`\uXXXX` 反转义、字段抽取）——这是解析 AI 输出的容器本身，是结构化的前置步骤。
- `src/mods/mod-engine/helpers/chinese-text-processor.ts`（引号标准化、段落分段、Unicode）。
- `narrative-parser-system.ts` 的 `parsePartial`、流式降级提取、`parseOrderedText`。
- `LIFESPAN_WORLD_MAP`/`RACE_LIFESPAN`/`DEFAULT_STAGE_DISPLAY_NAMES` 等查表常量（配置数据，非判定）。

**C 类：混合（AI 主 + 符号兜底）**
- 数值钳制（`ATTR_DELTA_CLAMP`/`MORALITY_DELTA_CLAMP`/`clampAttr`）：AI 出语义，规则守边界，**必须保留**。
- 重要性评分：`ledger.averageAdjustedImportance() ?? rateImportance()` 已是标准混合（[summary-compressor-system.ts:261](../src/mods/mod-engine/subsystems/summary-compressor-system.ts#L261)），推广到所有调用点。
- 世界观寿命 `computeMaxAge`：未命中时由 AI 给 `worldLifespanBaseline`，查表兜底。
- 穿越者/起始年龄：AI 结构化返回，关键词兜底，并**消除 `character-base-system` 与 [useCharacterCreateLogic.ts:69-114](../src/mods/mod-pages/pages/character-create/useCharacterCreateLogic.ts#L69-L114) 的重复实现**（已现漂移风险）。

### 顺带修的技术债（无论走不走 AI 都该修）
- [memory-forgetting-system.ts:396-409](../src/mods/mod-engine/subsystems/memory-forgetting-system.ts#L396-L409) 和 [memory-lifecycle-system.ts:833-840](../src/mods/mod-engine/subsystems/memory-lifecycle-system.ts#L833-L840) 的 `split(/\s+/)` 算相似度/因果——**中文无空格，整句变一个词，基本失效**，应改用 `extractEntities` 字符块重叠。

### 优先级

- **P0（收益最大 × 风险最低）**：A2 善恶（最脆弱，字段已存在）、A1 属性收口（主路径已存在）。
- **P1**：A4 重要性收口（需回归压缩节奏）、A3 减寿（字段已存在）、A5 遗忘（删数据不可逆，保留"重大事件永不遗忘"护栏）。
- **P2（需新增字段）**：A6 闭环（加 `arcStatus`，建议 AI 字段与旧正则并行一段对比后再摘除）。
- **技术债**：两处 `split(/\s+/)` 中文失效、穿越者双实现合并。

**通用护栏**：所有 A 类保留数值钳制（C 类）作符号兜底，且对"AI 未返回该字段"保留降级路径，避免偶发漏字段导致判定完全丢失。

### G2 决策（已确认 2026-07-07）
- **做全量**：A1~A6 全部迁移 + 技术债全修（两处 `split(/\s+/)` 中文失效、穿越者双实现合并）。
- 推进顺序仍按 P0→P1→P2 分批实现验证，但范围是全量、不做取舍。
- A6 接受新增 `arcStatus` Schema 字段；建议按调研意见与旧正则并行一段对比后再摘除。
- 所有 A 类保留数值钳制（C 类）作符号兜底 + "AI 未返回字段"降级路径。

---

## §三、A1：种族栏三按钮（人类 / 自定义 / 更多）

### 现状
- 种族选择的当前入口是 `src/mods/mod-pages/pages/character-create/page.tsx`，主要呈现在 `CharacterCreateMobile.tsx`，表单与行为分别由 `useCharacterCreateForm.ts` 和 `useCharacterCreateLogic.ts` 管理。旧桌面独立组件已不再是 live source。
- 数据两处：可见种族 `DEFAULT_VISIBLE_RACES`（7 个平铺主按钮）+ `ADDITIONAL_RACES`（约 33 个中文名，"更多"面板）。`RACE_LIFESPAN`（55 条）只用于图标/寿命回显，**未作选择列表源**。

### 方案
1. **主栏写死三按钮**：人类（`setRace('human')`）、自定义（展开输入框）、更多（展开完整列表）。删掉 `allRaces.map` 平铺循环。
2. **"更多"用 Modal 弹窗**（复用 [Modal.tsx](../src/mods/mod-ui/components/molecules/Modal.tsx)，非现有内联折叠面板——55 个塞进去会撑高页面）：弹窗内 `.moreGrid` 网格 + 建议加搜索框。列表源建议改为**全量 `RACE_LIFESPAN`（55 条）**而非 33 个。
3. **自定义入口保留**：拆出输入框归到"自定义"按钮，`handleAddCustomRace`/`removeCustomRace` 逻辑不动。
4. **状态拆分**：`showCustomRace` 一个布尔拆成 `showMoreRaces` + `showCustomRaceInput`，避免两按钮打架。
5. 主栏"更多"选中非 human/非自定义种族时 active 并回显（"更多：精灵"）。

改动文件：两份 tsx + `useCharacterCreateLogic.ts`（拆状态 + 全量列表源）+ 两份 module.css + `LABELS` 文案。

### 风险提示： A1 潜在 bug（改造时一并厘清）
`setRace` 对可见种族传英文 key、对 `ADDITIONAL_RACES` 传中文名，而 `raceInfo = RACE_LIFESPAN[race]` 只对英文 key 命中——**选额外种族时 `raceInfo` 为 undefined，寿命信息不显示，且种族基准线 `attrBaselines` 也读不到！** 这直接影响 §五 的种族基准线生效。改造统一到 `RACE_LIFESPAN` 英文 key 体系时必须修此 bug。

### A1 决策（已确认 2026-07-07）
- "更多"列表源用 **55 个全量 `RACE_LIFESPAN`**，统一到英文 key 体系，顺带修上面的 key bug（这也是 §五 C 种族基准线生效的前置）。

---

## §四、A2：命格卡片底部栏位统一

### 现状
命格卡片在 [talent-draw/page.tsx](src/mods/mod-pages/pages/talent-draw/page.tsx)，`.slotBody` 内渲染三子件：`PatternEffect`、`PatternAttrBonus`（无 attrBonus 时 return null）、`PatternSystemModifiers`（无 systemModifiers 时 return null）。
- `.slotModifiers`（`TalentDraw.module.css:406-414`）有 `margin-top:auto` + `border-top` 分隔线 = 真正的底栏。
- `.slotAttrBonus` 只有 `margin-top:4px`、**无 border-top**，不算底栏。
- 卡片固定 `height:140px`。结果：只有带 `systemModifiers` 的命格才有带分隔线的底栏，没有的底部空着，视觉不一致。

### 方案
1. **新增统一 `PatternFooter` 组件**替换现有两次调用：合并 attrBonus 标签（复用现算法）+ systemModifiers 标签（复用 `formatPatternSystemModifiersForDisplay`）。**无论是否为空都渲染 `.slotModifiers` 容器**（保 `margin-top:auto` + `border-top`），底栏位置永远在。
2. **无修正态差异化**（符合极简白 + 玻璃基调）：渲染占位文字"无属性加成"；新增 `.slotModifiersEmpty`——`color-text-tertiary`、9px、`opacity:0.6`、`italic`；分隔线用 `border-top:1px dashed color-mix(...60%,transparent)`（虚线 + 更淡，与"有修正"实线区分）。
3. **有修正态**保持现状标签着色（绿 `.slotModifierTag` / 红 `.slotModifierTagNeg`）。
4. **高度收尾**：`height:140px` 改 `min-height:140px` 或 clamp 从 4 行调 3 行给底栏让位，避免文字与底栏贴死。

改动文件：`src/mods/mod-pages/pages/talent-draw/page.tsx` + `src/mods/mod-pages/pages/talent-draw/TalentDraw.module.css`。`fate-preview` 命格是 pill 标签，不涉及。

---

## §五、E1 评估：数值体系

### 结论：有几处值得调整，但多数需用户拍板产品手感

数值由五个独立子系统构成，**没有统一数值中枢**，各写各的刻度：基础属性（凡人 [-10,10]，超凡到 100000）、气运/善恶（[-10,10]）、健康（0-100）、寿命（90 基准，300 上限）、档位映射（11 档语义）。

发现的问题：
- **A. 刻度错配**：`ATTR_DELTA_CLAMP=[-8,8]` 对 5 项属性一视同仁，但 resources（出身，锁 [-10,10]）单轮 ±8 意味着**一轮从赤贫到巨富**，不合理。建议改 `Record<AttrKey,[number,number]>`，resources 收窄到 `[-2,2]`。**风险低**（仅钳制）。
- **B. 超凡节奏无锚点**：单轮最多 +8，从满值凡人 10 冲到神性 21 最快 3 轮，到概念级 81 约 10 轮。缺"典型一周目 N 轮预期到哪档"的设计锚点。**需用户拍板节奏**。
- **C. 开局超凡组合未验证**：龙族基准 +8 + 玩家满配 + 命格 attrBonus 是**直接相加、无开局总值软上限**，可能开局即超凡。需核对最大组合。风险提示： 与 §三 A1 的 key bug 关联——若 `raceInfo` 读不到基准线，则基准线目前**根本没生效**，需先修 A1 bug 才能真正验证。
- **D. 世界观寿命 44 个硬编码僵化**：自定义世界观无法命中，见 §七 AI 化建议。
- **E. 数值分散无 balance-config**：调平衡需改多处。建议抽 `balance-config.ts` 集中可调参数。**风险低，纯重构**。

### E1 决策（已确认 2026-07-07）

**核心理念更正：数值不按"几轮达成"设计，而按"游戏内经过多少时间"设计。时间引擎是核心中的核心，几乎所有系统都与时间引擎相关。**

- 这推翻了原调研"B. 超凡节奏无锚点（以轮次为锚）"的思路——**锚点应是游戏内时间（年/岁），而非叙事轮次**。单轮可能推进 1 天，也可能跳过 10 年（`timeStep` 粒度可变），所以"多少轮到神性"是伪命题；正确问法是"角色成长到神性，在游戏世界里需要经历多长的时间/多少岁"。
- **单轮增量钳制 `ATTR_DELTA_CLAMP` 需与时间跨度挂钩**：跳过 10 年的一轮，属性可涨的幅度自然应大于只过 1 天的一轮。当前 `[-8,8]` 是与时间脱钩的固定值，是需要修正的根本问题——应改为"按本轮 `timeStep` 覆盖的游戏时间缩放增量上限"。
- **A. resources 设为慢变量（确认）**：`ATTR_DELTA_CLAMP` 改 `Record<AttrKey,[number,number]>`，resources 单轮上限远小于其他属性。但慢变量的"慢"也应以游戏时间而非轮次衡量。
- **C. 开局超凡组合（状态：已确认； D14：允许叠加到超凡）**：确认**允许**强种族基准线 + 命格 attrBonus 直接相加、开局即可达到/超过超凡阈值，不设开局总值软上限。唯一前置是修 §三 A1 的 key bug，让种族基准线真正生效（目前可能因 `RACE_LIFESPAN[中文名]=undefined` 而没生效）。
- **E. balance-config**：确认值得抽（纯重构、低风险），且应把"时间→增量缩放"的映射一并纳入集中管理。

风险提示： **本节需要一次专门的"时间引擎 × 数值体系"联合设计**：既然所有系统都挂在时间引擎上，数值刻度/衰减/成长/寿命/突破都应统一以游戏内时间为自变量重新表述。这是比单纯调 clamp 更大的架构性工作，建议作为独立设计文档展开。

---

## §六、E2 评估：HUB / UI（间距、边框）

### 结论：存在系统性的间距/token 治理问题，建议先立规矩再改页面

**核心系统性问题：硬编码 px 泛滥，token 形同虚设。** `spacing.css:10` 明令"禁止硬编码间距"，但页面 CSS 与内联 style 几乎全是 px。

按严重度：
- **A. 硬编码 px（最该先治）**：四个相邻页面四种主边距（character-create `24px 32px 120px` / fate-preview `36px 24px 120px` / talent-draw `24px 32px 120px` / PageScroll `24px 24px 120px`），横向不对齐。
- **B. 容器最大宽度不统一**：800/896/600/960px 各页各写，`mod-ui/tokens.ts` 有 `MAX_WIDTH` 但只 PageScroll 用了。
- **C. 布局绕过 PageScroll**：character-create、attribute-alloc 内联写 `100vh + overflowY`，滚动行为/内边距不一致。
- **D. 文字贴边**：`BottomActionBar` 桌面 `0.75rem 1rem`，比页面 24-32px 窄，右侧按钮贴边；命格卡片标签与下边缘接近贴合。
- **E. 字号阶梯碎**：8-32px 混用无 typography token 约束，卡片内 8-10px 字过小（移动端可读性差）。
- **F. 玻璃主题名不符实**：号称 liquid glass，但卡片多为实心 `--color-bg-primary`，仅 BottomActionBar/overlay 有 blur，`--color-surface` 半透明变量几乎没用。

### 建议（顺序）
1. **先立规矩**：扩 `spacing.css` 档位（12/14/16/20/24/32），`mod-ui/tokens.ts` 固化 `PAGE_PADDING` + 统一 `MAX_WIDTH`，逐页替换硬编码。
2. **强制走 PageScroll**：character-create、attribute-alloc 换成 `<PageScroll>`，A/B/C 一次解决大半。
3. **统一容器宽度**（fate-preview 600px 单卡居中可保留）。
4. **对齐底栏与页面内边距**（BottomActionBar → `0.75rem 1.5rem`）。
5. **建 typography 层级 token**，卡片最小字不低于 10px。
6. **玻璃化**（配合 A2）：引入统一 `glass` 工具类（`--color-surface` + `backdrop-filter` + 细腻边框）集中在 mod-ui。

### E2 决策（已确认 2026-07-07）

- **先做 token 治理这类系统性重构**（上面建议顺序 1-5 全部采纳）：扩 `spacing.css` 档位、固化 `PAGE_PADDING`/`MAX_WIDTH`、强制走 PageScroll、统一容器宽度、对齐底栏内边距、建 typography 层级 token。这是纯前端重构、与 AI 侧无耦合，可独立并行。
- **UI 项目上下文已落地为 `ai-life-sim-ui`**：它提供定版目标路由、重要性层级、主题语义、核心交互和响应式契约；精确值以 `src/foundation/tokens/`、`src/core/theme/theme-store.ts` 和 live component styles 为准。
  - 风格取向：现有主题已是 Apple HIG 极简白，继续沿这条线做"精致克制的玻璃拟态"最自洽——不追求重度毛玻璃，而是细腻边框 + 轻通透 + 克制阴影，符合"高端精品"定位。
  - Skill 已于后续治理迁移中建立，并在 2026-07-11 精简为高自由度项目上下文。

---

## §七、E3 评估：可吸收的现代 AI 技术

> 风险提示： **本节联网被沙箱拦截**，关于"DeepSeek 是否支持严格 json_schema""是否有一方 embedding API"两点为基于 2026-01 认知的推断，**上线前须用官方文档二次核实**（见文末 Sources）。

### 项目 AI 现状速览
调用韧性（重试+降级链）、KV 缓存（6 池 + 三段式 + 键序重排 + 命中统计）、分层压缩（L1-L6）、few-shot（6 例）、Mamba 式记忆权重（digest-ledger）**都已到位**。短板在：约束解码是软的（json_object + Zod 事后校验 + 重试）、记忆召回是字符串的、重要性判定还有关键词表、无生成-择优/自校验。**全项目零向量代码**。

### 分技术评估结论

| 技术 | 结论 | 理由 |
|------|------|------|
| 结构化/约束解码 | **观望+局部** | 现状 json_object+Zod 已是 DeepSeek 最优解；grammar 需自托管，与"纯调 API"定位冲突。仅在 provider 支持时把文本 schema 升级为原生 `json_schema`（**待核实** DeepSeek 支持度） |
| RAG/向量检索 | **中期，倾向本地嵌入** | 解决 `extractEntities` 字面不重叠连不上的硬伤；DeepSeek（**待核实**）无一方嵌入 API，首选 transformers.js 本地小模型（零 API 成本、不出域），作连锁匹配第二通道并联而非替换。痛点暴露再上 |
| best-of-N 择优 | **采纳（选择性）** | 只在 `importance==='HIGH'`/分叉轮生成 2~3 候选 + 一次评分择优。项目成本极低，最能负担的"奢侈"，直接服务精品叙事 |
| KV 缓存优化 | **采纳（微调）** | 已很好，微调字段顺序：最易变的 keyEvents/记忆后移，最大化稳定前缀 |
| 上下文压缩/分层 | **既有路线，无需新技术** | 已对齐业界（分层+重要性加权），唯一增量是与语义召回结合做远期去重 |
| 语义嵌入做实体归一/去重 | **与 RAG 捆绑，中期** | 若上本地嵌入，顺带做实体归一+去重，边际成本几乎零。单独为此上不划算 |
| 多智能体编排 | **大部分不适用** | 符号 orchestrator + cross-domain-validator 已覆盖；全套多 agent 对单机文本模拟器过重 |
| Reflection 自校验 | **采纳（HIGH 轮）** | 生成后对设定/历史/重复做一致性自检，先做"只检不改"，命中严重问题才定向重写。复用 `immersion-two-pass.ts` 骨架（现默认关闭）+ KV 前缀降本 |
| 可控生成/风格 | **采纳（按世界观分组 few-shot）** | 为每个 `essenceTag` 备一组精品风格样例固定进稳定前缀，提升贴合度不伤 KV；反模式清单系统化 |
| 结构化世界状态 | **采纳既有路线** | 已是核心架构且领先，只做断言级校验增强（年龄单调递增、死亡后不再行动等，纯符号零成本） |

### 直接服务两目标的推荐

**服务 G1（精品叙事）**，按投入产出：
1. Reflection 一致性自检（HIGH 轮，先只检不改）
2. 按世界观分组的 few-shot（固定进稳定前缀，不伤 KV）
3. best-of-N 择优（HIGH/分叉轮）
4. 反模式清单系统化

**服务 G2（去正则化）**，与 §二 呼应：
1. **复用现有 AI 自评字段**（零成本首选）：让 memory-lifecycle 重要性判定优先读账本 AI 数值，关键词退兜底。
2. **keyEvents 加可选 `entities: string[]`**（低成本）：把 `extractEntities` 符号提取转交模型，连锁从字面重叠升级为 AI 标注实体重叠。
3. 原生 json_schema 升级（**待核实** provider 支持）。
4. 动作规模/场景判定：只迁移"关键词脆弱且误判有实际体验损害"的，不为去正则而去正则。

### AI 技术路线图
- **近期（低成本低风险）**：世界观分组 few-shot；重要性判定 AI 优先+关键词兜底；KV 字段顺序微调；世界状态断言校验；反模式清单系统化。
- **中期（需一次实验验证）**：HIGH 轮 Reflection；HIGH/分叉轮 best-of-N；keyEvents 加 `entities` 字段；原生 json_schema（前置：确认 DeepSeek 支持）。
- **长期观望**：本地嵌入语义召回 + 实体归一 + 去重（痛点暴露再启动）。
- **不适用**：grammar 约束解码（需自托管）、完整多 agent 编排（过重）、Self-Play 训练（无训练管线）、Mamba 架构本身（思想已由 digest-ledger 落地）。

### Sources（待核实项已标注，联网恢复后二次确认）
- DeepSeek JSON Output（是否支持严格 json_schema）：https://api-docs.deepseek.com/guides/json_mode 【**待核实**】
- DeepSeek Context Caching：https://api-docs.deepseek.com/zh-cn/guides/kv_cache
- DeepSeek 是否有一方 Embedding API：https://api-docs.deepseek.com/ 【**待核实**，据认知无】
- OpenAI Structured Outputs（能力基准对照）：https://platform.openai.com/docs/guides/structured-outputs
- transformers.js（本地嵌入候选）：https://huggingface.co/docs/transformers.js

---

## §八、P1 评估：系统功能边界收严（拆分重组）

> 用户诉求：某些事情由好几个系统共同完成，导致边界模糊、不清楚是哪个系统在起作用。目标是调研各系统职责，把混乱的职责拆分重组、逻辑统一，做到"专人专项"，杜绝"改一个功能几个系统连锁调整"。

### 最重磅发现：字段契约三方漂移，部分数值可能"根本改不动"（最高优先，风险最低）

子系统的字段契约有**三份手写来源、互相漂移**：① 子系统 `applyChanges` 实际读取的字段；② `subsystem-field-registry.ts` 的 Zod schema；③ `mvp-stages-config.default.json` 的 `subsystemGuide`（告诉 AI 用什么字段名）。三者对不上时，AI 按指南输出的字段会被 `applyChanges` **静默丢弃**：

- **B3 善恶**：impl 读 `delta`，registry 声明 `value`/`delta`，AI 指南说字段名 `morality`。AI 输出 `{morality: 1}` → 只认 `delta` → **善恶值可能根本改不动**（[morality-system.ts:78-87](../src/mods/mod-character/subsystems/morality-system.ts#L78-L87) / [subsystem-field-registry.ts:214-217](../src/mods/mod-engine/helpers/subsystem-field-registry.ts#L214-L217) / [mvp-stages-config.default.json:37](../src/mods/mod-engine/helpers/mvp-stages-config.default.json#L37)）。
- **B4 气运**：impl 读 `luck`（绝对值 set），registry 声明 `bonus`/`delta`，AI 指南说字段名 `luck`。C-1 实施前必须明确气运主契约到底是绝对值 `luck`，还是增量 `delta`；若选 `delta`，必须同步改 `LuckSystem.applyChanges` 落地增量。
- **B5 寿命**：AI 被要求发 `age`/`lifespanDelta`，但 [lifespan-system.ts:110-174](../src/mods/mod-character/subsystems/lifespan-system.ts#L110-L174) 的 applyChanges **只读 maxAge 等**，`age` / `lifespanDelta` 都不会落地——寿命变化实际只能靠 post-narrative 写绝对 `maxAge`（见 B2）。若 G2 要用 `lifespanDelta`，C-1/C-3 必须先补 `LifespanSystem` 增量落地。

风险提示： **这比 G2 去正则化更根本**：去正则化假设 AI 结构化字段能生效，但如果契约漂移导致字段被丢弃，AI 出的 delta 根本没落地。**建议 P1 的字段对齐先于 G2 A2/A3 落地**（善恶、减寿的去正则化依赖这些字段真的能写入）。

### 第二发现：大量"已实现但不运行"的死代码，是边界模糊的最大认知来源

MVP 白名单（[mvp-stages-config.default.json:6-29](../src/mods/mod-engine/helpers/mvp-stages-config.default.json#L6-L29)）实际只放行 **6 个外部子系统**（character-base / destiny-pattern / lifespan / luck / morality / world-entity）+ 12 个引擎系统，AI 可写的只有 4 个（character-base / lifespan / luck / morality）。非白名单子系统经 `isMvpRuntimeSubsystem()` 硬过滤，**根本不注册进 orchestrator**。

因此以下**整域处于"已实现但不运行"**，读代码无法一眼看出：
- 角色域：`health` / `attribute-decay` / `life-stage`（死）
- 经济/声望/派系域：`economy`、`faction-dynamics` 是**抛错桩**（collectState 直接 throw），`reputation` 完整实现但不运行
- mod-culture / mod-politics / mod-power-system / mod-environment-ecology 等整个 MOD

### 职责重叠清单（按严重度）

| 编号 | 重叠点 | 现状 | 建议归属 |
|------|--------|------|---------|
| B1 | **属性最终落地被 5 处分担** | applyChanges 三级契约 + aggregateModifiers 聚合 + parseAttrFromNarrative 正则兜底 + registry 校验 + commitBus 清洗；正则与 AI 结构化是两条并行写 base 路径 | current 聚合读留 character-base；**删叙事正则兜底**（[character-base-system.ts:247-291](../src/mods/mod-character/subsystems/character-base-system.ts#L247-L291)，与 G2 一致），单一写权威 = AI `*Delta` |
| B2 | **寿命突破/减寿双算** | 历史实现曾由 lifespan 与 post-narrative 两条路径重复计算；post-narrative 路径现已删除 | 判定与落地全部归 `src/mods/mod-character/subsystems/lifespan-system.ts`，orchestrator 只编排；修改时复核所有写回与恢复路径 |
| B3/B4/B5 | **字段契约三方漂移**（见上） | 善恶/气运/寿命 delta 可能被静默丢弃；`luck` 当前是绝对值语义，`lifespanDelta` 当前无落地逻辑 | 建立字段契约单一真源，并先明确增量/绝对值语义；registry 与 AI 指南从单一真源派生，子系统 `applyChanges` 与之对齐 |
| B6 | 死亡检测链断裂 | health 死代码，HP 归零判定无系统在跑，尾声触发条件永不满足 | 决定 MVP 是否要 health；否则改尾声触发条件 |
| B8 | **跨域数值修正三路径** | cross-domain-rules 11 规则 + applyWorldDirection（AI direction）+ `_applyWorldDirectionFromNarrative`（叙事关键词兜底）目标子系统重叠，但全是死子系统 → 大量计算空转 | MVP 下整体禁用或明确标注未来段 |
| B9 | 字段名归一化散落两处 | cross-domain-change-validator 与各子系统 applyChanges 都做字段兼容 | 归一化只留 validator 一处 |

### 目标职责边界原则

**判定与落地在同一子系统内闭环**：Orchestrator 只做管线顺序 + RoundCommitBus 分发，不再自己算寿命/属性再写回。跨系统只能经 `context.subsystemStates` 读、经 commitBus 写，禁止 orchestrator 直接算业务写回（消除 B2）。**契约单一真源**：registry schema + subsystemGuide 应从各子系统实际读取字段派生，消除三方漂移（B3/B4/B5 的元凶）。

### P1 实现优先级

| 优先级 | 项目 | 收益 | 风险 |
|--------|------|------|------|
| **P0** | B3/B4/B5 字段契约三方对齐 | 高（善恶/气运/寿命可能当前根本改不动） | **低**（纯字段名，不动存档） |
| **P0** | 标注/隔离抛错桩与死子系统 | 高（消除最大认知混乱） | **低**（加注释/移目录） |
| P1 | B2 寿命归一到 lifespan，删 post-narrative 双算 | 高 | 中（动管线，需回归寿命测试） |
| P1 | B1 删 character-base 叙事正则兜底（与 G2 合并） | 中 | 低 |
| P2 | B8/B9 跨域三路径收敛 + 归一化单点 | 中 | 中（目标子系统已死，实际影响小） |
| P3 | 判定/落地闭环强约束落地 | 高（治本） | **高**（触及 orchestrator core + 所有 applyChanges 契约，可能改 `RoundContext`/`OrchestratorSnapshot` 存档结构，属动 core/foundation，须单独确认） |

**建议起步**：先做两项 P0（契约对齐 + 死代码隔离）——立刻消除"不清楚哪个系统在起作用"的最大部分，且不碰 core 与存档。

### P1 决策（已确认 2026-07-07）
1. 状态：已确认； **B3/B4/B5 字段契约三方对齐——确认修**（D7）。修复后善恶/气运/寿命将真正开始变动，接受可能的游戏手感变化。这是 §二 G2 去正则化的前置。
2. 状态：已确认； **MVP 白名单维持现状，死代码暂不动**（D8）。health/economy/reputation/faction 等死代码/抛错桩**只做标注隔离、不复活**（避免激活未测子系统的高风险）。难度接入等系统复活时再处理（见 §十 D12）。
3. 状态：已确认； **判定/落地闭环强约束本轮纳入**（D9）。C2 边界图落地——判定与落地在同一子系统内闭环、Orchestrator 不再自己算业务写回。**这触及 orchestrator core + 所有 applyChanges 契约，可能改 `RoundContext`/`OrchestratorSnapshot`，属动 core/foundation 的高风险改动**：实现前须按 AGENTS.md 边界规则单独说明风险并二次确认，且需完整回归 + 存档兼容验证。

---

## §九、P2 评估：JSON → 自定义前置格式

> 用户设想：把 AI 输出从 JSON 改为 `[系统信息]~~~`、`[本轮信息]~~~` 这类"前置标签 + 详细内容"的自定义格式，改进解析器，是否更省 token、减少格式错误。

### 现状核实

- **输出是深层嵌套 JSON**：`NarrativeResponseSchema`（[narrative-prompt.ts:48-79](../src/mods/mod-engine/prompts/narrative-prompt.ts#L48-L79)），顶层 narrative/digest/keyEvents/changes/notableEvents/creations/foreshadowing/branch/importance/direction。下发给 AI 的格式说明是**手写 JSON 结构文本**，与 Zod 需人工同步。
- **解析链路复杂，是结构化输出风险证据**：`src/mods/mod-engine/helpers/parse-strategies.ts` 包含多层协议降级和常见 JSON 修复。当前实现必须以 live parser 与 response contract 为准，不沿用本段历史层数作为静态真源。

### 关键校准：省 token 是"有限"而非"数倍"

- **输入端几乎不省**：格式说明走 KV 缓存（STABLE 段），JSON 说明换自定义说明，缓存后都趋近 0，无差异。
- **输出端正文不省**：500-800 字 narrative 正文是 token 大头，与格式无关。JSON 结构字符（引号/括号/键名）只占整轮输出约 **5%-15%**。
- **结论：真实节省约 5%-12%，不是数倍。** 风险提示： 用户"省 token"的预期需校准——不应以省 token 为主要推进理由。

### 真正的收益点：减少格式错误

- 5 层降级 + jsonrepair 的存在证明 JSON 错误是**实际痛点**。
- 自定义行分隔格式天然免疫最高频两类错误：**字符串内引号转义、深层括号配平**。解析可退化为"按行 split + 前缀匹配"，比嵌套 JSON 容错解析简单一个数量级。
- 尤其 narrative 长文本剥离出 JSON 后，**免转义**既省 token 又从根本消除转义错误。

### 推荐方案 A：narrative 正文剥离 + 其余保留 JSON

```
[NARRATIVE]
这里是三段式正文，无需任何转义...
[/NARRATIVE]
[META]
{"changes":[...],"keyEvents":[...],"importance":"HIGH"}
[/META]
```

- **收益**：正文免转义（消除最高频错误），结构化数据仍用 JSON（保留 creations/foreshadowing 的嵌套表达力 + Zod 校验）。
- **代价小**：解析器先按 `[NARRATIVE]`/`[META]` split，正文直接取，META 段复用现有 5 层降级。
- **精准命中"减少格式错误"真收益，不牺牲嵌套表达力。**

**方案 B（激进全自定义行格式，changes 用 `体魄|+2|原因` 管道分隔）**：token 省最多（~10%）、错误最少，但 creations/foreshadowing 嵌套要重设计、Zod 校验层重写、few-shot 全改——嵌套表达力损失可能把格式错误收益吐回来。**列为长期方向，不建议现在一步到位。**

### P2 决策（已确认 2026-07-07，见 D10/D11）
- 状态：已确认； **接受省 token 有限（5%-12%，非数倍）的校准预期**——推进理由是"减少格式错误"，不是省 token。
- 状态：已确认； **走方案 A（narrative 正文剥离 + META 保留 JSON）**，不上方案 B。
- 状态：已确认； **与 G1 三段式合并实施**：三段式正文放进 `[NARRATIVE]` 段，共用一次 few-shot 重写 + 一次缓存失效。
- 风险提示： C-0 已核对：主叙事 wrapper 路径当前会启用 DeepSeek `response_format:{type:"json_object"}`，方案 A 的 `[NARRATIVE]...[/NARRATIVE][META]{json}[/META]` 整体不再是合法 JSON。实现 D11/G1 时必须同步关闭/调整主路径 JSON Mode；同时收口 default campaign 的 S3 非流式 `callAIDegraded` 分支，避免同一叙事管线 JSON Mode 行为不一致。

---

## §十、P3 评估：世界难度是否正常生效

> 用户诉求：确认世界选择界面的难度有没有正常生效；先完善它，后续各模拟系统重新接入时可按不同难度修改计算公式。

### 结论：难度是"UI 完整、存储完整、计算层空置"的半成品——用户判断准确

难度值**被正确定义、存储、传递，但几乎没有被任何核心系统实际消费**。

**定义与流转链路（正常）**：
- 当前难度配置读取 `src/mods/mod-difficulty/constants.ts`，公式倍数读取 `src/core/shared/balance-config.ts`；档位数量、标签和 multiplier 以这两处 live source 为准。
- 流转：world-setup 页选择 → `worldConfig.difficulty` → `useWorldSetupLogic.ts` 收集写入存档 → 运行时 `orchestrator-system.ts` 读取注入 `RoundContext.worldConfig` → 各子系统 `collectState`/`applyChanges` 可从 context 读取。
- 状态：已确认； UI 层正确显示标签/描述；状态：已确认； 存档层正确持久化。

**计算层（空置）**：
- 状态：未实施； `multiplier` 全项目仅 2 处引用，且都不是核心玩法：`luck-system.ts` 一处**注释掉的**难度加成；`lifespan-system.ts` 读取但**未参与最终寿命计算**。
- 状态：未实施； 核心系统全部未接入难度：属性成长/衰减、事件生成频率、伤病严重度/死亡判定、经济/资源获取（且经济系统本身是抛错桩，见 §八 B 域死代码）均无难度区分。

### P3 建议

- **难度机制的完善应与 §五 E1 的 `balance-config` + 时间引擎数值中枢一并设计**：把 `difficulty.multiplier` 作为一个**全局系数**纳入 balance-config 统一管理，后续各模拟系统重新接入时，难度就是计算公式的一个标准输入项（与 D5「时间→增量缩放」映射同属"公式的自变量"）。
- **接入顺序**：难度是"公式的输入参数"，而各模拟系统（health/attribute-decay/economy 等）目前多为死代码（§八 B 域）。因此难度真正生效的前提是**这些系统按 MVP 蓝图重新接入运行**——难度接入应在每个系统复活时同步做，而非现在单独硬接一遍（否则又会散落各处，重蹈 §八 职责分散的覆辙）。
- **短期可做**：把 `difficulty.multiplier` 的读取口径统一到 balance-config 的单一入口，清理 luck/lifespan 里两处半接入的残留（注释代码删除或补全），避免"看起来接了实际没生效"的认知混乱。

### P3 决策（已确认 2026-07-07，见 D12/D13）

- 状态：已确认； **难度作为"核心/引擎级"公式输入项**：难度不是各系统互相适配，而是像一个引擎核心——各模拟系统在按 MVP 蓝图复活接入时，**主动向难度核心取用 `multiplier` 作为公式自变量**。难度提供统一的系数入口（纳入 balance-config），系统单向依赖它，不反向散落。这与 D5「时间引擎作为数值中枢」同构：难度与时间都是"公式的自变量核心"。
- 状态：已确认； **`multiplier` 语义定性：世界难度倍数，越高越难。** `>1` 更难，`=1` 标准难度，`<1` 更简单。此定义写入 balance-config 常量注释，所有消费系统统一遵循。
- **短期可做**：清理 luck/lifespan 里两处半接入残留（注释代码删除或补全），把 `multiplier` 读取口径统一到 balance-config 单一入口，消除"看起来接了实际没生效"的认知混乱。

---

## 附：交叉依赖与实现批次建议

几处任务互相牵动，实现时注意顺序：

0. **【最高优先级】§八 P1 的字段契约漂移（B3/B4/B5）是 §二 G2 的前置**：善恶/气运/寿命的 AI 变更字段名在「子系统实现 / Zod schema / 给 AI 的字段指南」三处对不上，AI 输出很可能被静默丢弃——即这几个数值现在**可能根本改不动**。若不先修，G2 里"善恶去正则化改用 `morality.delta`""减寿改用 `lifespan.lifespanDelta`"会写进一个系统不读的字段，等于白做。**必须最先修字段契约单一真源，并明确 `luck` 绝对值/增量语义、补齐或移除 `lifespanDelta` 落地口径，再谈去正则化。**
1. **§三 A1 的 key bug 是 §五 C 的前置**：种族基准线目前很可能因 `RACE_LIFESPAN[中文名]=undefined` 而没生效；必须先修 A1 的 key 统一，才能验证开局超凡组合。**建议 A1 优先。**
2. **§一 G1 + §二 G2 + §九 P2 方案 A 同改 narrative-prompt.ts / Schema / few-shot**：三段式规约、密度约束、属性/善恶 delta 必填、可能新增 `arcStatus`/`entities`、正文剥离（`[NARRATIVE]`/`[META]`）——这些都改 SYSTEM_PROMPT 或输出格式或示例，**应合并成一次改动、一次 KV 缓存失效、一次 few-shot 重写**，边际成本最低。（开发阶段缓存失效本不作约束，见 D1，但合并仍减少重复劳动。）
3. **§一 G1 的摘要调整与 §七 去正则化-1（重要性 AI 优先）互补**：都围绕 digest-ledger，建议同批处理。
4. **§六 E2 的 token 治理是纯前端重构**，与 AI 侧改动无耦合，可独立并行推进。
5. **§八 P1 的死代码隔离 + §十 P3 的难度接入 + §五 E1 的 balance-config 三者收敛**：P1 建议隔离抛错桩/死子系统，P3 的难度 `multiplier` 与 E1 的时间→增量缩放都应统一进 `balance-config`。这三项共同指向"数值/系数集中管理 + 明确哪些系统在跑"，建议作为一个**架构梳理批次**统筹，而非零散改。

---

## 实施记录（2026-07-07）

已落地：

- D1：Prompt 缓存/兼容边界已落地；当前入口为 `ai-life-sim-prompt-engineering`，`.agents` 治理检查通过。
- D2/D10/D11/G1/P2：主叙事改为 `[NARRATIVE]` 三段正文 + `[META]` JSON；主叙事关闭 JSON Mode；摘要 L1 提示只提事件事实。D2 的固定条数上限已于 2026-07-18 被 `PD-015` 取代。
- D4/G2：属性、善恶、减寿、重要性、遗忘相似度、闭环检测均改为 AI 结构化字段优先；中文 `split(/\s+/)` 技术债改用实体块重叠。
- D5/D12/D13/P3：新增 `core/shared/balance-config.ts`，统一属性增量时间缩放与世界难度倍数语义。
- D7/D9/P1：字段契约以 `SUBSYSTEM_FIELD_CONTRACTS` 为单一真源；寿命双算与 orchestrator 业务写回已移除；post-narrative 只保留连锁反应。
- A1/A2/E2：种族栏改为人类 / 自定义 / 更多；更多列表统一使用 `RACE_LIFESPAN` key；命格底栏固定存在；UI deprecated token 扫描已清零。

验证：

- `node .agents/scripts/check-governance.mjs --verbose` PASS。
- `npm run lint` PASS。
- `npx tsc --noEmit` PASS。
- `npm run check:structural` PASS。
- `npm run check:ui` PASS。
- 2026-07-07 的 `npm run gate-check` 曾受 `check:mod` 历史架构扫描阻塞；当时 JSON 报告未保留。后续任务必须捕获当前基线，不得把这条历史结果当成现状。
