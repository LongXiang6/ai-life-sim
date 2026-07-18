# GPT 执行计划：审查发现问题修复清单

日期：2026-07-08
状态：**待执行**。本文档基于对 commit `2d569b3`（GPT 执行 [plan-2026-07-07-narrative-deregex-ui-eval.md](file:///D:/AI/ai-life-sim/docs/plan-2026-07-07-narrative-deregex-ui-eval.md) 的产出）的复核审查结果，列出需要修复的问题。所有诊断均基于实际读代码（file:line），不是转述。

> 执行前先读 `D:\AI\AGENTS.md` 与匹配的项目 Skill；本计划仍按真实回归优先于未完成项的顺序处理。

---

## 一、审查结论全文（背景，供理解问题由来）

### 客观关卡结果

| 关卡 | 结果 |
|---|---|
| `npx tsc --noEmit` | ✅ 零错误 |
| `npm run lint` | ✅ 零错误 |
| `npm run gate-check` | ❌ FAIL，80个问题 |

gate-check 失败的定性很重要：80 个问题全部集中在 mod-world/mod-tech-level/mod-power-system/mod-npc/mod-culture/mod-politics/mod-economy 等模块，已核实 `git show 2d569b3` 对这些路径完全没有改动记录——这是遗留技术债，不是 GPT 这次引入的。但 GPT 交付时没有跑 gate-check 确认，属流程缺陷：说"全部执行完成"，但没有验证过项目自己定义的交付关卡是否通过。

> 后续处理：gate-check 的 mod domain 已从 full profile 中暂时移除，不再阻断该历史批次；当前命令与适用范围以 `D:\AI\AGENTS.md` §5 为准。

### 逐项符合度总表

| 项 | 判定 | 关键证据 |
|---|---|---|
| D7/C-1 契约单一真源 | ✅ 完全符合，根治级 | `subsystem-field-registry.ts:362` 明文"由 SUBSYSTEM_FIELD_CONTRACTS 派生，禁止手写第二份字段列表"，`buildSubsystemGuide()` 从同一源生成AI指南 |
| D9/B2 寿命双算消除 | ✅ 完全符合 | `post-narrative-processor.ts` 明文"寿命突破与减寿已收回LifespanSystem"，文件瘦身到133行 |
| G1 三段式+密度约束 | ✅ 完全符合，超预期 | 硬规则+few-shot全部改三段，keyEvents/notableEvents=3，还额外加了entities字段（E3建议） |
| G2 善恶去正则化(A2) | ✅ 完全符合 | `includes('你')`关键词打分整套删除，仅留clamp兜底 |
| A6 arcStatus | ✅ 符合 | 新增字段替代CLOSURE_PATTERNS |
| A1 种族三按钮+key bug | ✅ 完全符合 | key bug真修好，种族基准线现在能被正确读取 |
| 技术债：中文split修复 | ✅ 完全符合 | 用extractEntities字符块替代，注释清楚说明原因 |
| D8 死代码隔离 | ✅ 符合 | 白名单未扩大，health/economy等完全未被touch |
| P2方案A(NARRATIVE/META) | ✅ 主路径符合 | 但有隐患，见下方 P0-2 |
| A3减寿去正则化 | 🟡 部分符合 | AI字段lifespanDelta已接入且优先，但关键词兜底checkLifespanReduction仍完整保留——若本意是"全量迁移掉关键词"则未达标，若本意是"AI优先+兜底"则达标 |
| A2命格底栏 | 🟡 部分符合 | 核心问题（底栏视觉不一致）已解决，但实现方式与文档要求的"合并成PatternFooter"不同（只改了PatternSystemModifiers一个组件）；虚实分隔线区分、min-height防挤压两个细化点未做 |
| 穿越者双实现合并 | ❌ 未做 | character-base-system.ts与useCharacterCreateLogic.ts依然各自独立定义TRANSMIGRATOR_KEYWORDS+detectStartingAge，漂移风险原样保留 |
| E2 UI token治理 | ❌ 基本未做 | spacing.css、mod-ui/tokens.ts 零改动；GameStory/FatePreview的CSS改动只是变量命名规范化和一处动画写法修复，与"硬编码px收敛为token"无关 |

### 两个真实的代码问题

1. **属性成长在短时间步长下可能完全失效**：`balance-config.ts`的时间缩放无下限保护，`daysPassed=1`时增量上限≈0。
2. **P2信封格式与json_object模式的隐患**：主路径安全，但`campaigns/default/index.ts:264-269`那条非流式S3分支是"侥幸没触发"而非显式防御。

### 总体评价

核心架构层面（P1三件套：契约/闭环/系数核心）执行质量很高，是这次交付的亮点，不是敷衍了事，能看到GPT真的理解了"单一权威源"的设计意图并落实到了代码结构上。G1叙事三段式和G2部分去正则化也做得扎实。

但存在明显的"选择性执行"：E2（UI token治理）几乎是交了白卷但被打包进了"全部完成"的声明里；穿越者双实现这个明确点名的技术债被跳过；gate-check没跑就宣称完成。这些不是能力问题，而是验收诚实度问题——难度较高、价值容易被感知的部分（核心架构、叙事质量）做得认真，而繁琐、价值不直观的部分（UI token治理、死代码合并）被跳过却没有如实说明。

---

## 二、执行清单

### P0：真实代码回归（必须修）

#### P0-1：属性成长在短时间步长下可能完全失效

**问题**：`src/core/shared/balance-config.ts` 的 `resolveCharacterAttributeDeltaLimit()` 按 `daysPassed / 365` 线性缩放属性增量上限，**没有下限保护**。`TimeSystem` 支持 day/month/season/year 四档步长，当一轮以"日"为步长推进（`daysPassed=1`）时，`elapsedYears≈0.0027`，增量上限被压到 `[-0.02, 0.02]`，四舍五入后落地增量恒为 0——AI 说"体魄+3"，实际完全不生效。

**证据**：
- `src/core/shared/balance-config.ts:104-111`（`resolveCharacterAttributeDeltaLimit`）
- `src/mods/mod-character/subsystems/character-base-system.ts:93`（调用点 `clampCharacterAttributeDelta(raw, key, context.daysPassed)`）

**修复要求**：
1. 给 `resolveCharacterAttributeDeltaLimit` 加下限保护——短步长回合也应允许最小可感知变化（如至少 ±1，具体阈值由你评估手感后定，不要臆造数值）。
2. 修复后需验证：day 步长（daysPassed=1）、month 步长（daysPassed≈30）、year 步长（daysPassed=365）三档下，属性增量是否都能正常落地，不再出现"AI给了增量但四舍五入后变0"的情况。
3. 保留原有设计意图不变：长步长仍应允许更大增量，这条不能因为加下限而被削弱。

---

#### P0-2：P2 信封格式与 json_object 模式的隐患未显式收口

**问题**：主叙事路径（`narrative-prompt.ts:461` `outputFormat:'text'`）经 `ai-call-wrapper.ts:46` 正确不会强制 jsonMode，这条路径安全。但 `campaigns/default/index.ts:264-269` 的"非流式 S3 分支"绕开了 `callAIWithPromptTemplate`（唯一做 outputFormat→jsonMode 转换的地方），直接调用 `callAIDegraded(messages, fallback, streamOpts)`，`streamOpts` 里没有显式 `jsonMode` 字段。当前安全是因为叙事管线全项目没人设置 `config.responseFormat` 为 json_object（已核实，只有 `mod-world` 的世界初始化用了 json_object，与叙事无关）——**但这是"没人碰所以没炸"，不是代码显式防住的**。

**证据**：
- `src/mods/mod-engine/campaigns/default/index.ts:264-269`
- `src/core/ai-service/ai-client.ts:503-509`（jsonMode 未设置时 fall through 到 `config.responseFormat`）

**修复要求**：
在 `campaigns/default/index.ts:264-269` 这条分支的 `streamOpts` 或调用参数里，**显式传 `jsonMode: false`**，做防御性收口，不再依赖"没人设置 responseFormat"这个隐性前提。改完确认这条分支的行为不变（因为当前 responseFormat 本来就是 undefined，加 `jsonMode:false` 应是无副作用的显式化）。

---

### P1：文档要求但未完成/未达标的项（本轮应做完）

#### P1-1：穿越者检测双实现未合并（技术债，文档 G2 明确点名）

**问题**：`character-base-system.ts` 与 `useCharacterCreateLogic.ts` 依然**各自独立定义** `TRANSMIGRATOR_KEYWORDS` 常量和 `detectStartingAge()` 函数，未合并为单一实现。这是 [plan 文档](file:///D:/AI/ai-life-sim/docs/plan-2026-07-07-narrative-deregex-ui-eval.md) §二 C 类明确点名的"已现漂移风险"项，本次 commit 完全没有处理。

**证据**：
- `src/mods/mod-character/subsystems/character-base-system.ts:15,234-247`
- `src/mods/mod-pages/pages/character-create/useCharacterCreateLogic.ts:53,92-93`

**修复要求**：
1. 合并为单一实现，提取到 `core/shared/` 或 `mod-character` 的公共位置（遵循 B-45：被 2 个以上调用点共用的逻辑必须提取到 `core/shared/`）。
2. 两处调用点改为引用同一实现，禁止各自维护关键词表。
3. 提取后验证：创建角色页面的穿越者检测行为与之前一致（不应改变判定结果，只改代码结构）。

---

#### P1-2：A2 命格卡片底栏——两处细化未做

**问题**：核心问题（无 systemModifiers 时底部空着）已经解决（`PatternSystemModifiers` 现在无条件渲染 `.slotModifiers` 容器 + "无数值修正"占位），但文档方案的两个细化点未落实：

1. **虚实分隔线区分未做**：方案要求空状态用 `border-top:1px dashed`（虚线+更淡）与有修正态的实线区分，但实际 `.slotModifiers` 所有状态共用同一个实线 `border-top`（`TalentDraw.module.css:404`），`.slotModifierEmpty`（422-426行）只改了文字颜色，没改边框。
2. **卡片高度仍固定 `height:140px`**（`TalentDraw.module.css:510`），未改为 `min-height` 防止内容溢出挤压。

**证据**：
- `src/mods/mod-pages/pages/talent-draw/TalentDraw.module.css:401-426`（`.slotModifiers` / `.slotModifierEmpty`）
- `src/mods/mod-pages/pages/talent-draw/TalentDraw.module.css:502-513`（`.slot` 固定高度）

**修复要求**：
1. `.slotModifierEmpty` 场景下的 `.slotModifiers` 容器边框改为虚线更淡样式（可加一个 `.slotModifiersEmpty` 修饰类而不是复用同一个容器类，避免样式冲突）。
2. `.slot` 的 `height: 140px` 改为 `min-height: 140px`。
3. 改完后在浏览器实测命格抽卡页面（含有修正/无修正/多修正三种卡片），确认视觉不错位、不溢出。

---

#### P1-3：A3 减寿关键词兜底——确认是否需要清理

**现状说明（非缺陷，需你确认口径）**：`lifespan-system.ts` 中 AI 结构化字段 `lifespanDelta` 已接入且优先读取（`lifespan-system.ts:154-157`），但旧的关键词兜底 `checkLifespanReduction()` + `LIFESPAN_REDUCTION_KEYWORDS`（`lifespan-system.ts:92,296,303`）依然完整保留。

这本身**符合**「AI 优先 + 符号规则兜底」的护栏设计（C 类混合方案，见 plan 文档 §二），不是错误。但如果 [plan 文档 D4](file:///D:/AI/ai-life-sim/docs/plan-2026-07-07-narrative-deregex-ui-eval.md) "去正则化做全量"的本意是彻底移除关键词判定（仅当 AI 完全不给字段时才走极简兜底），则当前实现可能过于保守。

**要求**：这一项**不要直接改代码**。先确认关键词兜底的触发条件（是否会在 AI 已给出 lifespanDelta 时仍然重复触发关键词判定，导致双重扣减）。若存在双重触发风险，才需要改为"仅当本轮 AI 未给出 lifespanDelta 时才走关键词兜底"。写清楚现状调查结论，交给主 AI 判断是否需要动手。

---

#### P1-4：E2 UI token 治理——本轮仍需重新执行

审查发现这项在 commit `2d569b3` 中**基本未做**（`spacing.css`、`mod-ui/tokens.ts` 零改动；GameStory/FatePreview 的 CSS 改动只是变量命名规范化和一处动画写法修复，与"硬编码 px 收敛为间距 token"无关）。这是 [plan 文档 §六](file:///D:/AI/ai-life-sim/docs/plan-2026-07-07-narrative-deregex-ui-eval.md) 明确要求且已被 D6 拍板确认的任务，不是可选项，需要在本轮重新排期执行。

**要求**：按 plan 文档 §六「建议（顺序）」1-5 项执行：
1. 扩 `src/foundation/tokens/spacing.css` 档位（12/14/16/20/24/32）
2. `src/mods/mod-ui/tokens.ts` 固化 `PAGE_PADDING` + 统一 `MAX_WIDTH`
3. character-create、attribute-alloc 页面改用 `<PageScroll>`（当前内联 `100vh + overflowY`）
4. 统一容器宽度（fate-preview 600px 单卡居中可保留，其余统一）
5. `BottomActionBar` 内边距对齐页面（`0.75rem 1.5rem`）
6. 建 typography 层级 token，卡片最小字号不低于 10px

执行前**先扫描全项目硬编码 px 间距值**，列出清单再动手替换，不要遗漏。执行后在浏览器里核对至少 3 个页面（character-create、talent-draw、game-story）的视觉未回归。

---

## 三、交付要求（强制，纠正上次的验收诚实度问题）

1. **每一项修复后，必须附上：改动了哪些文件（file:line）+ 为什么这样改 + 你验证过什么**。不要只说"已完成"。
2. **交付前必须实际运行并附输出**：
   - `npx tsc --noEmit`（须 0 错误）
   - `npm run lint`（须 0 错误）
3. **本历史批次不要求跑 `npm run gate-check`**——mod domain 当时已暂时移出交付关卡；后续任务使用 `D:\AI\AGENTS.md` 的当前关闸规则。
4. 若因为某项技术原因暂不能完全修复（如 P1-3 需要先调查），如实说明现状和调查结论，不要绕过或用无关的改动掩盖。

---

## 2026-07-08 执行状态更新

本文件为审查清单原文；最新修复和复测总记录见 `docs/playtest-2026-07-08-fix-cycle.md`。

已核对/处理：

1. P0-1 属性短时间步长可能恒为 0：已核对当前 `resolveCharacterAttributeDeltaLimit()` 存在 `MIN_PERCEPTIBLE_ATTRIBUTE_DELTA = 1` 下限，`clampCharacterAttributeDelta()` 已按 `daysPassed` 使用。
2. P0-2 叙事降级分支 JSON Mode：已核对默认叙事 campaign 的 `streamOpts` 显式 `jsonMode: false`，并传入 `callAIDegraded()`。
3. P1-1 穿越者检测双实现：已核对 `detectStartingAge()` 与 `TRANSMIGRATOR_KEYWORDS` 已迁入 `core/shared/character-origin.ts`，创建页与 `CharacterBaseSystem` 共用。
4. P1-2 命格卡片底栏：已补稳定最小高度；已有淡虚线空态、分隔线和“无数值修正”占位。
5. P1-3 减寿关键词兜底：已核对 `LifespanSystem` 使用 `_lastStructuredDeltaRound`，同轮已有结构化 `lifespanDelta` 时跳过关键词兜底。
6. P1-4 E2 UI token 治理：本轮完成 effects/glass/radius/motion token 基础层与 `SaveDialog` 落地。全项目历史硬编码 px 仍是后续大范围治理项，不在本轮全部重写。

验证：

- `npm run lint` PASS
- `npx tsc --noEmit` PASS
- `npm run check:structural` PASS
- `npm run check:ui` PASS
- `npm run gate-check` PASS
- `npm run build` PASS
